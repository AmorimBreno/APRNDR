// Notebook Jupyter (ESPECIFICACAO 5.5): cada célula vira um trecho. Markdown
// entra como texto; código entra com as saídas de texto (o que foi impresso,
// o resultado, o erro). Uma saída com figura (image/png) é descrita pelo
// modelo com visão, como as páginas de slides.

import type { Extracao, OpcoesExtracao, Trecho } from "./tipos.ts";

/** Uma saída de texto maior que isto é cortada (tabelas enormes, logs). */
export const LIMITE_SAIDA = 4000;

type Texto = string | string[] | undefined;

interface Saida {
	output_type?: string;
	text?: Texto;
	data?: Record<string, Texto>;
	ename?: string;
	evalue?: string;
}

interface Celula {
	cell_type?: string;
	source?: Texto;
	outputs?: Saida[];
}

const juntar = (texto: Texto) => (Array.isArray(texto) ? texto.join("") : (texto ?? ""));

function cortar(texto: string): string {
	return texto.length > LIMITE_SAIDA ? `${texto.slice(0, LIMITE_SAIDA)}\n[… saída cortada: ${texto.length} caracteres]` : texto;
}

/** As saídas de texto da célula e as figuras (PNG em base64), na ordem. */
function saidas(celula: Celula): Array<{ texto: string } | { png: string }> {
	const lista: Array<{ texto: string } | { png: string }> = [];
	for (const saida of celula.outputs ?? []) {
		if (saida.output_type === "stream") lista.push({ texto: juntar(saida.text) });
		else if (saida.output_type === "error") lista.push({ texto: `${saida.ename ?? "Erro"}: ${saida.evalue ?? ""}` });
		else if (saida.data) {
			const png = juntar(saida.data["image/png"]);
			if (png) lista.push({ png: png.replace(/\s+/g, "") });
			else {
				const texto = juntar(saida.data["text/markdown"]) || juntar(saida.data["text/plain"]);
				if (texto) lista.push({ texto });
			}
		}
	}
	return lista;
}

export const nomeCelula = (numero: number) => `celula-${String(numero).padStart(3, "0")}`;

export async function extrairNotebook(conteudo: string, arquivo: string, opcoes: OpcoesExtracao = {}): Promise<Extracao> {
	let notebook: { cells?: Celula[] };
	try {
		notebook = JSON.parse(conteudo) as { cells?: Celula[] };
	} catch (erro) {
		throw new Error(`o notebook não é um JSON válido (${(erro as Error).message})`);
	}
	const celulas = notebook.cells ?? [];
	const trechos: Trecho[] = [];
	const avisos: string[] = [];
	let custo = 0;
	for (const [indice, celula] of celulas.entries()) {
		opcoes.sinal?.throwIfAborted();
		const numero = indice + 1;
		const fonte = juntar(celula.source).trim();
		const local = `célula ${numero}`;
		const base = { local, nome: nomeCelula(numero), celula: numero };
		if (celula.cell_type !== "code") {
			if (fonte) trechos.push({ ...base, origem: "texto", texto: fonte });
			continue;
		}
		const partes = [fonte];
		let modelo: string | undefined;
		let figuras = 0;
		for (const saida of saidas(celula)) {
			if ("texto" in saida) {
				if (saida.texto.trim()) partes.push(`Saída:\n${cortar(saida.texto.trimEnd())}`);
				continue;
			}
			figuras++;
			const localFigura = `figura ${figuras} da ${local}`;
			if (!opcoes.descrever) {
				partes.push("[Figura sem descrição: não há modelo de visão configurado.]");
				avisos.push(`${localFigura}: precisa de descrição, mas não há modelo de visão configurado.`);
				continue;
			}
			opcoes.aoProgredir?.({ feito: indice, total: celulas.length, etapa: `descrevendo a ${localFigura}` });
			try {
				const descricao = await opcoes.descrever({ png: Buffer.from(saida.png, "base64"), texto: fonte, local: localFigura, arquivo });
				custo += descricao.custo;
				modelo = descricao.modelo;
				partes.push(`Figura ${figuras} (descrita por ${descricao.modelo}):\n${descricao.texto}`);
			} catch (erro) {
				if (opcoes.sinal?.aborted) throw erro;
				partes.push("[Figura sem descrição: a descrição falhou.]");
				avisos.push(`${localFigura}: a descrição falhou (${(erro as Error).message}).`);
			}
		}
		if (partes.join("").trim()) trechos.push({ ...base, origem: "codigo", ...(modelo ? { modelo } : {}), texto: partes.join("\n\n") });
		opcoes.aoProgredir?.({ feito: numero, total: celulas.length, etapa: `lendo a célula ${numero} de ${celulas.length}` });
	}
	return { tipo: "notebook", trechos, custo, avisos };
}
