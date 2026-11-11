// Achar o trecho de uma âncora (parte C1; docs/mesa-parte-c.md, seção 3). Contrato escrito
// no WP0; a implementação é do WP2.
//
// Ordem de busca: o texto exato com o contexto (antes e depois), só o texto exato, o bloco
// (mesmo com a versão diferente) e o começo da aba. Em qualquer queda a tela avisa, de
// forma discreta, "O trecho mudou desde a pergunta". A comparação é normalizada (espaços
// juntos, sem diferença de caixa); fórmulas do KaTeX duplicam o texto na seleção, então
// se não achar cai no bloco.

import type { Ancora } from "./origem-mesa.ts";

export type NivelAncora = "exato-com-contexto" | "exato" | "bloco" | "inicio";

/** Onde o trecho está num texto, em índices do texto original (não do normalizado). */
export interface PosicaoNoTexto {
	nivel: "exato-com-contexto" | "exato";
	inicio: number;
	fim: number;
}

/** Juntar os espaços, tirar a diferença de caixa. Usada nos dois lados da comparação. */
export function normalizarParaBusca(_texto: string): string {
	throw new Error("normalizarParaBusca: o WP2 implementa");
}

/**
 * Procura `trecho` em `texto`. Com a âncora, prefere a ocorrência cujo contexto casa com
 * `antes` e `depois`; sem contexto que case, a primeira ocorrência exata; sem ocorrência,
 * undefined (quem chama cai no bloco e no começo).
 */
export function acharNoTexto(_texto: string, _trecho: string, _ancora?: Ancora): PosicaoNoTexto | undefined {
	throw new Error("acharNoTexto: o WP2 implementa");
}
