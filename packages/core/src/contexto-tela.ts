// Contexto da tela (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md, 2.5):
// o que estava aberto na interface quando o usuário mandou uma mensagem. O
// núcleo o põe na conversa do modelo como uma mensagem custom invisível
// (customType TIPO_MENSAGEM_CONTEXTO_TELA, display: false), devolvida pelo
// before_agent_start logo depois da mensagem do usuário, e devolve à interface
// só o resumo (sem o conteúdo).
//
// Contrato escrito no WP0. As funções puras são implementadas no WP1, até os
// testes de contexto-tela.test.ts passarem.

import type { ContextoTela, ResumoContextoTela } from "./eventos.ts";

/** customType da mensagem custom com o contexto da tela, gravada na sessão pelo pi. */
export const TIPO_MENSAGEM_CONTEXTO_TELA = "nucleo.contexto-tela";

/** Os details da mensagem custom: o resumo e o hash do conteúdo, se ele foi. */
export interface DetalhesContextoTela extends ResumoContextoTela {
	/** O hash do conteúdo mandado (o que hashConteudo devolve). Ausente com o olho fechado. */
	hash?: string;
}

/** O hash do conteúdo, estável entre execuções (sha256 em hexadecimal). */
export function hashConteudo(conteudo: string): string {
	void conteudo;
	throw new Error("contexto-tela: a implementar no WP1");
}

/** O contexto sem o conteúdo, como volta à interface. Nunca leva o conteúdo. */
export function resumoDoContexto(contexto: ContextoTela): ResumoContextoTela {
	void contexto;
	throw new Error("contexto-tela: a implementar no WP1");
}

/**
 * O texto que o modelo lê na mensagem custom. Diz que é o que o usuário via
 * ao mandar a mensagem acima, o tipo e o rótulo, o trecho citado e, com o
 * olho aberto, o conteúdo. Com `repetido`, troca o conteúdo pela frase "o
 * mesmo conteúdo de <rótulo> mandado antes". Com o olho fechado, nunca há
 * conteúdo (vai só o rótulo e o trecho).
 */
export function textoParaModelo(contexto: ContextoTela, repetido: boolean): string {
	void contexto;
	void repetido;
	throw new Error("contexto-tela: a implementar no WP1");
}

/**
 * O hash do conteúdo do último contexto ainda visível ao modelo: procura, de
 * trás para a frente, a última mensagem custom TIPO_MENSAGEM_CONTEXTO_TELA em
 * `mensagens` (sessao.messages, já compactada) com details.hash. undefined se
 * não houver (sessão nova, compactada ou sem olho aberto).
 */
export function ultimoHashVisivel(mensagens: readonly unknown[]): string | undefined {
	void mensagens;
	throw new Error("contexto-tela: a implementar no WP1");
}
