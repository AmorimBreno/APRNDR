// Contexto da tela (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md, 2.5 e 5b):
// o que estava aberto na interface quando o usuário mandou uma mensagem, uma
// entrada por aba aberta na bancada. O núcleo o põe na conversa do modelo como
// uma mensagem custom invisível (customType TIPO_MENSAGEM_CONTEXTO_TELA,
// display: false), devolvida pelo before_agent_start logo depois da mensagem
// do usuário, e devolve à interface só os resumos (sem o conteúdo).
//
// Repetição: o hash do conteúdo de cada aba fica nos details da mensagem
// custom, e os hashes visíveis são procurados em sessao.messages (o que o
// modelo de fato vê, já compactado), nunca numa memória da janela. Assim a
// regra acerta depois de compactar, de reabrir a sessão e de trocar de agente.
// Um item que foi como "repetido" não grava hash: o conteúdo não foi nele, e
// se a compactação levar a mensagem original, o próximo envio manda o
// conteúdo de novo em vez de apontar para algo que o modelo não vê mais.
//
// Formato antigo: as sessões gravadas antes da bancada têm details de um
// contexto só (os campos do resumo direto nos details, sem a lista). Elas
// continuam legíveis: são lidas como uma lista de um.

import { createHash } from "node:crypto";
import type { ContextoTela, ResumoContextoTela } from "./eventos.ts";

/** customType da mensagem custom com o contexto da tela, gravada na sessão pelo pi. */
export const TIPO_MENSAGEM_CONTEXTO_TELA = "nucleo.contexto-tela";

/** Um item dos details: o resumo de uma aba e o hash do conteúdo, se ele foi. */
export interface DetalhesContextoTela extends ResumoContextoTela {
	/** O hash do conteúdo mandado (o que hashConteudo devolve). Ausente com o olho fechado ou quando o conteúdo era repetido. */
	hash?: string;
}

/** Os details da mensagem custom: um item por aba da bancada. */
export interface DetalhesMensagemContextoTela {
	contextos: DetalhesContextoTela[];
}

/** A mensagem que o before_agent_start devolve (o pi a grava depois da mensagem do usuário). */
export interface MensagemContextoTela {
	customType: typeof TIPO_MENSAGEM_CONTEXTO_TELA;
	content: string;
	display: false;
	details: DetalhesMensagemContextoTela;
}

/** O hash do conteúdo, estável entre execuções (sha256 em hexadecimal). */
export function hashConteudo(conteudo: string): string {
	return createHash("sha256").update(conteudo, "utf8").digest("hex");
}

/** O contexto sem o conteúdo, como volta à interface. Nunca leva o conteúdo. */
export function resumoDoContexto(contexto: ContextoTela): ResumoContextoTela {
	// Campo a campo (em vez de tirar só o conteudo): o que vier a mais num
	// objeto não entra no resumo, que vai para a interface e para o arquivo.
	return {
		tipo: contexto.tipo,
		rotulo: contexto.rotulo,
		...(contexto.origem !== undefined ? { origem: contexto.origem } : {}),
		olho: contexto.olho,
		...(contexto.parcial !== undefined ? { parcial: contexto.parcial } : {}),
		...(contexto.selecao !== undefined ? { selecao: contexto.selecao } : {}),
		...(contexto.foco !== undefined ? { foco: contexto.foco } : {}),
	};
}

/** O bloco de uma aba no texto do modelo. */
function blocoDaAba(contexto: ContextoTela, repetido: boolean): string[] {
	const linhas = [`- ${contexto.foco ? "Aba em foco" : "Aba"}: ${contexto.tipo} "${contexto.rotulo}"`];
	if (contexto.origem) linhas.push(`  Origem: ${contexto.origem}`);
	if (contexto.selecao) linhas.push("  Trecho citado pelo usuário:", "<trecho>", contexto.selecao, "</trecho>");
	if (!contexto.olho) {
		linhas.push("  Aberta na bancada, conteúdo não mandado (o usuário não a selecionou).");
	} else if (contexto.conteudo === undefined) {
		linhas.push("  O conteúdo não foi mandado (a tela não o forneceu).");
	} else if (repetido) {
		linhas.push(`  Conteúdo: o mesmo conteúdo de "${contexto.rotulo}" mandado antes nesta conversa (não mudou).`);
	} else {
		linhas.push(contexto.parcial ? "  Conteúdo (cortado: só uma parte do original coube):" : "  Conteúdo:", "<conteudo>", contexto.conteudo, "</conteudo>");
	}
	return linhas;
}

/**
 * O texto que o modelo lê na mensagem custom. Diz que é o que o usuário via
 * ao mandar a mensagem acima e lista as abas: a em foco primeiro e marcada, com
 * o trecho citado se houver; depois as selecionadas (olho aberto), com o
 * conteúdo ou a frase "o mesmo conteúdo de <rótulo> mandado antes"; por fim as
 * outras, só com o nome. `repetidos[i]` diz se o conteúdo de `contextos[i]` já
 * está visível ao modelo. Sem olho aberto nunca há conteúdo.
 */
export function textoParaModelo(contextos: readonly ContextoTela[], repetidos: readonly boolean[]): string {
	// O pi entrega a mensagem custom ao modelo como uma mensagem do usuário:
	// a primeira linha diz que ela não foi escrita por ele.
	const linhas = ["[Contexto da tela] O que o usuário via na tela ao mandar a mensagem acima. Não foi escrito por ele; use só se ajudar a responder."];
	// Foco, depois as selecionadas, depois as outras; cada grupo na ordem das abas.
	const itens = contextos.map((contexto, indice) => ({ contexto, repetido: repetidos[indice] === true }));
	const grupo = ({ contexto }: { contexto: ContextoTela }): number => (contexto.foco ? 0 : contexto.olho ? 1 : 2);
	const ordenados = itens
		.map((item, indice) => ({ item, indice }))
		.sort((a, b) => grupo(a.item) - grupo(b.item) || a.indice - b.indice)
		.map(({ item }) => item);
	for (const { contexto, repetido } of ordenados) linhas.push(...blocoDaAba(contexto, repetido));
	return linhas.join("\n");
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
	return typeof valor === "object" && valor !== null;
}

/** true se `mensagem` é a mensagem custom do contexto da tela. */
function ehMensagemContextoTela(mensagem: unknown): mensagem is { role: "custom"; customType: string; details?: unknown } {
	return ehObjeto(mensagem) && mensagem.role === "custom" && mensagem.customType === TIPO_MENSAGEM_CONTEXTO_TELA;
}

/**
 * Os itens de details de uma mensagem custom, nos dois formatos: a lista
 * (details.contextos) ou o antigo, um contexto só nos próprios details.
 */
function itensDosDetails(detalhes: unknown): Record<string, unknown>[] {
	if (!ehObjeto(detalhes)) return [];
	if (Array.isArray(detalhes.contextos)) return detalhes.contextos.filter(ehObjeto);
	return [detalhes];
}

/**
 * Os hashes dos conteúdos ainda visíveis ao modelo: todos os que constam nas
 * mensagens custom TIPO_MENSAGEM_CONTEXTO_TELA de `mensagens` (sessao.messages,
 * já compactada), nos dois formatos de details. Vazio se não houver (sessão
 * nova, compactada ou sem aba selecionada).
 */
export function hashesVisiveis(mensagens: readonly unknown[]): Set<string> {
	const hashes = new Set<string>();
	for (const mensagem of mensagens) {
		if (!ehMensagemContextoTela(mensagem)) continue;
		for (const item of itensDosDetails(mensagem.details)) {
			if (typeof item.hash === "string" && item.hash.length > 0) hashes.add(item.hash);
		}
	}
	return hashes;
}

/** O resumo de um item dos details, conferido. undefined se não for um resumo válido. */
function resumoDoItem(item: Record<string, unknown>): ResumoContextoTela | undefined {
	const { tipo, rotulo, origem, olho, parcial, selecao, foco } = item;
	if (typeof tipo !== "string" || typeof rotulo !== "string" || typeof olho !== "boolean") return undefined;
	return {
		tipo,
		rotulo,
		...(typeof origem === "string" ? { origem } : {}),
		olho,
		...(typeof parcial === "boolean" ? { parcial } : {}),
		...(typeof selecao === "string" ? { selecao } : {}),
		...(typeof foco === "boolean" ? { foco } : {}),
	};
}

/**
 * Os resumos guardados numa mensagem custom do contexto (lida do arquivo ou de
 * um evento do pi). Só os campos do resumo, conferidos: nunca o conteúdo nem o
 * hash. Aceita o formato antigo (um contexto só nos details) como lista de um.
 * undefined se não for a mensagem do contexto ou se nenhum item for válido.
 */
export function resumoDaMensagemContexto(mensagem: unknown): ResumoContextoTela[] | undefined {
	if (!ehMensagemContextoTela(mensagem)) return undefined;
	const resumos: ResumoContextoTela[] = [];
	for (const item of itensDosDetails(mensagem.details)) {
		const resumo = resumoDoItem(item);
		if (resumo) resumos.push(resumo);
	}
	return resumos.length > 0 ? resumos : undefined;
}

/**
 * A mensagem custom do contexto para o before_agent_start. `mensagens` é o
 * que o modelo vê agora (sessao.messages, antes da mensagem nova). Com o olho
 * fechado o conteúdo é ignorado mesmo se vier: nem texto nem hash.
 */
export function mensagemDoContexto(contextos: readonly ContextoTela[], mensagens: readonly unknown[]): MensagemContextoTela {
	const visiveis = hashesVisiveis(mensagens);
	const efetivos: ContextoTela[] = [];
	const repetidos: boolean[] = [];
	const detalhes: DetalhesContextoTela[] = [];
	for (const contexto of contextos) {
		const resumo = resumoDoContexto(contexto);
		const conteudo = contexto.olho ? contexto.conteudo : undefined;
		const hash = conteudo !== undefined ? hashConteudo(conteudo) : undefined;
		const repetido = hash !== undefined && visiveis.has(hash);
		efetivos.push({ ...resumo, ...(conteudo !== undefined ? { conteudo } : {}) });
		repetidos.push(repetido);
		detalhes.push({ ...resumo, ...(hash !== undefined && !repetido ? { hash } : {}) });
	}
	return {
		customType: TIPO_MENSAGEM_CONTEXTO_TELA,
		content: textoParaModelo(efetivos, repetidos),
		display: false,
		details: { contextos: detalhes },
	};
}
