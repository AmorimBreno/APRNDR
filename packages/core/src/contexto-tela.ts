// Contexto da tela (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md, 2.5):
// o que estava aberto na interface quando o usuário mandou uma mensagem. O
// núcleo o põe na conversa do modelo como uma mensagem custom invisível
// (customType TIPO_MENSAGEM_CONTEXTO_TELA, display: false), devolvida pelo
// before_agent_start logo depois da mensagem do usuário, e devolve à interface
// só o resumo (sem o conteúdo).
//
// Contrato escrito no WP0; as funções puras foram implementadas no WP1.
//
// Repetição: o hash do conteúdo fica nos details da mensagem custom, e o
// "último hash visível" é procurado em sessao.messages (o que o modelo de
// fato vê, já compactado), nunca numa memória da janela. Assim a regra acerta
// depois de compactar, de reabrir a sessão e de trocar de agente. Uma mensagem
// que foi como "repetido" não grava hash: o conteúdo não foi nela, e se a
// compactação levar a mensagem original, o próximo envio manda o conteúdo de
// novo em vez de apontar para algo que o modelo não vê mais.

import { createHash } from "node:crypto";
import type { ContextoTela, ResumoContextoTela } from "./eventos.ts";

/** customType da mensagem custom com o contexto da tela, gravada na sessão pelo pi. */
export const TIPO_MENSAGEM_CONTEXTO_TELA = "nucleo.contexto-tela";

/** Os details da mensagem custom: o resumo e o hash do conteúdo, se ele foi. */
export interface DetalhesContextoTela extends ResumoContextoTela {
	/** O hash do conteúdo mandado (o que hashConteudo devolve). Ausente com o olho fechado. */
	hash?: string;
}

/** A mensagem que o before_agent_start devolve (o pi a grava depois da mensagem do usuário). */
export interface MensagemContextoTela {
	customType: typeof TIPO_MENSAGEM_CONTEXTO_TELA;
	content: string;
	display: false;
	details: DetalhesContextoTela;
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
	};
}

/**
 * O texto que o modelo lê na mensagem custom. Diz que é o que o usuário via
 * ao mandar a mensagem acima, o tipo e o rótulo, o trecho citado e, com o
 * olho aberto, o conteúdo. Com `repetido`, troca o conteúdo pela frase "o
 * mesmo conteúdo de <rótulo> mandado antes". Com o olho fechado, nunca há
 * conteúdo (vai só o rótulo e o trecho).
 */
export function textoParaModelo(contexto: ContextoTela, repetido: boolean): string {
	// O pi entrega a mensagem custom ao modelo como uma mensagem do usuário:
	// a primeira linha diz que ela não foi escrita por ele.
	const linhas = [
		"[Contexto da tela] O que o usuário via na tela ao mandar a mensagem acima. Não foi escrito por ele; use só se ajudar a responder.",
		`Tipo: ${contexto.tipo}`,
		`Rótulo: ${contexto.rotulo}`,
	];
	if (contexto.origem) linhas.push(`Origem: ${contexto.origem}`);
	if (contexto.selecao) linhas.push("Trecho citado pelo usuário:", "<trecho>", contexto.selecao, "</trecho>");
	if (!contexto.olho) {
		linhas.push("O conteúdo não foi mandado (o usuário escolheu mandar só o rótulo e o trecho citado).");
	} else if (contexto.conteudo === undefined) {
		linhas.push("O conteúdo não foi mandado (a tela não o forneceu).");
	} else if (repetido) {
		linhas.push(`Conteúdo: o mesmo conteúdo de "${contexto.rotulo}" mandado antes nesta conversa (não mudou).`);
	} else {
		linhas.push(contexto.parcial ? "Conteúdo (cortado: só uma parte do original coube):" : "Conteúdo:", "<conteudo>", contexto.conteudo, "</conteudo>");
	}
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
 * O hash do conteúdo do último contexto ainda visível ao modelo: procura, de
 * trás para a frente, a última mensagem custom TIPO_MENSAGEM_CONTEXTO_TELA em
 * `mensagens` (sessao.messages, já compactada) com details.hash. undefined se
 * não houver (sessão nova, compactada ou sem olho aberto).
 */
export function ultimoHashVisivel(mensagens: readonly unknown[]): string | undefined {
	for (let i = mensagens.length - 1; i >= 0; i--) {
		const mensagem = mensagens[i];
		if (!ehMensagemContextoTela(mensagem) || !ehObjeto(mensagem.details)) continue;
		const hash = mensagem.details.hash;
		if (typeof hash === "string" && hash.length > 0) return hash;
	}
	return undefined;
}

/**
 * O resumo guardado numa mensagem custom do contexto (lida do arquivo ou de um
 * evento do pi). Só os campos do resumo, conferidos: nunca o conteúdo nem o
 * hash. undefined se não for a mensagem do contexto ou se os details não forem
 * um resumo válido.
 */
export function resumoDaMensagemContexto(mensagem: unknown): ResumoContextoTela | undefined {
	if (!ehMensagemContextoTela(mensagem)) return undefined;
	const detalhes = mensagem.details;
	if (!ehObjeto(detalhes)) return undefined;
	const { tipo, rotulo, origem, olho, parcial, selecao } = detalhes;
	if (typeof tipo !== "string" || typeof rotulo !== "string" || typeof olho !== "boolean") return undefined;
	return {
		tipo,
		rotulo,
		...(typeof origem === "string" ? { origem } : {}),
		olho,
		...(typeof parcial === "boolean" ? { parcial } : {}),
		...(typeof selecao === "string" ? { selecao } : {}),
	};
}

/**
 * A mensagem custom do contexto para o before_agent_start. `mensagens` é o
 * que o modelo vê agora (sessao.messages, antes da mensagem nova). Com o olho
 * fechado o conteúdo é ignorado mesmo se vier: nem texto nem hash.
 */
export function mensagemDoContexto(contexto: ContextoTela, mensagens: readonly unknown[]): MensagemContextoTela {
	const resumo = resumoDoContexto(contexto);
	const conteudo = contexto.olho ? contexto.conteudo : undefined;
	const hash = conteudo !== undefined ? hashConteudo(conteudo) : undefined;
	const repetido = hash !== undefined && hash === ultimoHashVisivel(mensagens);
	return {
		customType: TIPO_MENSAGEM_CONTEXTO_TELA,
		content: textoParaModelo({ ...resumo, ...(conteudo !== undefined ? { conteudo } : {}) }, repetido),
		display: false,
		details: { ...resumo, ...(hash !== undefined && !repetido ? { hash } : {}) },
	};
}
