// PDF (ESPECIFICACAO 5.5): o texto página por página com o pdfjs-dist. Uma
// página com pouco texto, com uma imagem grande ou com muito desenho
// (slides com gráficos, figuras, fórmulas) é renderizada como PNG
// (@napi-rs/canvas) e descrita por um modelo com visão, junto com o texto
// que ela já tem.

import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, OPS, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Extracao, OpcoesExtracao, Trecho } from "./tipos.ts";

/** Menos caracteres que isto: a página é quase só imagem. */
export const LIMITE_POUCO_TEXTO = 300;
/** Uma imagem que cobre esta fração da página ou mais é "imagem grande". */
export const FRACAO_IMAGEM_GRANDE = 0.2;
/** Com tantos desenhos (caminhos) e pouco texto, a página é um gráfico ou diagrama. */
export const CAMINHOS_DE_GRAFICO = 40;
export const LIMITE_TEXTO_DE_GRAFICO = 1500;
/** O lado maior do PNG mandado ao modelo, em px. */
const LADO_PNG = 1600;

// As fontes padrão, os cmaps e o wasm do pdfjs-dist, como caminhos de pasta (no Node ele lê do disco).
const pastaPdfjs = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const pasta = (nome: string) => `${join(pastaPdfjs, nome)}/`;

export interface MedidasPagina {
	caracteres: number;
	/** A maior imagem, como fração da área da página (0 a 1). */
	maiorImagem: number;
	caminhos: number;
}

export function precisaDeVisao(medidas: MedidasPagina): boolean {
	if (medidas.caracteres < LIMITE_POUCO_TEXTO) return true;
	if (medidas.maiorImagem >= FRACAO_IMAGEM_GRANDE) return true;
	return medidas.caminhos >= CAMINHOS_DE_GRAFICO && medidas.caracteres < LIMITE_TEXTO_DE_GRAFICO;
}

/** O texto da página, com as quebras de linha do PDF e sem espaços sobrando. */
async function textoDaPagina(pagina: PDFPageProxy): Promise<string> {
	const conteudo = await pagina.getTextContent();
	let texto = "";
	for (const item of conteudo.items) {
		if (!("str" in item)) continue;
		texto += item.str;
		if (item.hasEOL) texto += "\n";
	}
	return texto
		.split("\n")
		.map((linha) => linha.replace(/[ \t]+/g, " ").trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * A maior imagem e a quantidade de desenhos da página. A área de uma imagem
 * é o determinante da matriz de transformação no momento em que ela é
 * pintada (a imagem é o quadrado unitário transformado); basta acompanhar o
 * determinante pelos save, restore e transform.
 */
async function desenhoDaPagina(pagina: PDFPageProxy): Promise<Omit<MedidasPagina, "caracteres">> {
	const lista = await pagina.getOperatorList();
	const [x0, y0, x1, y1] = pagina.view;
	const areaPagina = Math.abs((x1! - x0!) * (y1! - y0!)) || 1;
	const pilha: number[] = [];
	let det = 1;
	let maior = 0;
	let caminhos = 0;
	for (let indice = 0; indice < lista.fnArray.length; indice++) {
		const operacao = lista.fnArray[indice];
		const argumentos = lista.argsArray[indice] as unknown[] | null;
		switch (operacao) {
			case OPS.save:
				pilha.push(det);
				break;
			case OPS.restore:
				det = pilha.pop() ?? 1;
				break;
			case OPS.transform: {
				const [a, b, c, d] = (argumentos ?? []) as number[];
				det *= (a ?? 1) * (d ?? 1) - (b ?? 0) * (c ?? 0);
				break;
			}
			case OPS.paintFormXObjectBegin: {
				pilha.push(det);
				const matriz = argumentos?.[0] as number[] | null | undefined;
				if (matriz && matriz.length >= 4) det *= matriz[0]! * matriz[3]! - matriz[1]! * matriz[2]!;
				break;
			}
			case OPS.paintFormXObjectEnd:
				det = pilha.pop() ?? 1;
				break;
			case OPS.paintImageXObject:
			case OPS.paintInlineImageXObject:
			case OPS.paintImageMaskXObject:
				maior = Math.max(maior, Math.min(1, Math.abs(det) / areaPagina));
				break;
			case OPS.constructPath:
				caminhos++;
				break;
		}
	}
	return { maiorImagem: maior, caminhos };
}

async function pngDaPagina(pagina: PDFPageProxy): Promise<Uint8Array> {
	const base = pagina.getViewport({ scale: 1 });
	const escala = Math.min(3, Math.max(1, LADO_PNG / Math.max(base.width, base.height)));
	const viewport = pagina.getViewport({ scale: escala });
	const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
	const contexto = canvas.getContext("2d");
	// Fundo branco: sem ele, o PNG fica transparente onde a página não pinta.
	contexto.fillStyle = "#ffffff";
	contexto.fillRect(0, 0, canvas.width, canvas.height);
	// O pdfjs tipa o canvas do navegador; o do @napi-rs/canvas tem a mesma interface.
	await pagina.render({ canvas: canvas as never, canvasContext: contexto as never, viewport }).promise;
	return canvas.encode("png");
}

export const nomePagina = (numero: number) => `pagina-${String(numero).padStart(3, "0")}`;

export async function extrairPdf(dados: Uint8Array, arquivo: string, opcoes: OpcoesExtracao = {}): Promise<Extracao> {
	const tarefa = getDocument({
		// O pdfjs transfere o buffer para si: uma cópia deixa o original de quem chamou intacto.
		data: new Uint8Array(dados),
		standardFontDataUrl: pasta("standard_fonts"),
		cMapUrl: pasta("cmaps"),
		cMapPacked: true,
		wasmUrl: pasta("wasm"),
		verbosity: 0,
	});
	const documento = await tarefa.promise;
	const trechos: Trecho[] = [];
	const avisos: string[] = [];
	let custo = 0;
	try {
		const total = documento.numPages;
		for (let numero = 1; numero <= total; numero++) {
			opcoes.sinal?.throwIfAborted();
			const pagina = await documento.getPage(numero);
			const texto = await textoDaPagina(pagina);
			const desenho = await desenhoDaPagina(pagina);
			const local = `página ${numero}`;
			const base = { local, nome: nomePagina(numero), pagina: numero };
			if (!precisaDeVisao({ caracteres: texto.length, ...desenho })) {
				opcoes.aoProgredir?.({ feito: numero, total, etapa: `lendo a página ${numero} de ${total}` });
				trechos.push({ ...base, origem: "texto", texto });
				continue;
			}
			if (!opcoes.descrever) {
				avisos.push(`${local}: precisa de descrição, mas não há modelo de visão configurado.`);
				trechos.push({ ...base, origem: "texto", texto });
				continue;
			}
			opcoes.aoProgredir?.({ feito: numero - 1, total, etapa: `descrevendo a página ${numero} de ${total}` });
			try {
				const descricao = await opcoes.descrever({ png: await pngDaPagina(pagina), texto, local, arquivo });
				custo += descricao.custo;
				trechos.push({ ...base, origem: "visao", modelo: descricao.modelo, texto: descricao.texto });
			} catch (erro) {
				if (opcoes.sinal?.aborted) throw erro;
				avisos.push(`${local}: a descrição falhou (${(erro as Error).message}); ficou só o texto.`);
				trechos.push({ ...base, origem: "texto", texto });
			}
			opcoes.aoProgredir?.({ feito: numero, total, etapa: `descrevendo a página ${numero} de ${total}` });
			pagina.cleanup();
		}
	} finally {
		await tarefa.destroy();
	}
	return { tipo: "pdf", trechos, custo, avisos };
}
