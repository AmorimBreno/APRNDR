// A faixa do plano no topo da nota (docs/planos-de-estudo.md, seção 7): o progresso, calculado ao vivo do markdown do
// editor (lerPlano), e as conversas do histórico. Aqui só as partes puras, sem React nem o editor.

import { ehPlanoDeEstudos, INICIO_TAG_PLANO, lerPlano } from "../../lib/plano-tipos.ts";

/** Uma conversa do histórico do plano: o id curto do link e o texto dele (a data). */
export interface ConversaDoPlano {
	id: string;
	rotulo: string;
}

export interface DadosDaFaixa {
	feitos: number;
	total: number;
	concluido: boolean;
	conversas: ConversaDoPlano[];
}

/** Os links `[texto](conversa:<id>)` do markdown, pelo id e sem repetir. */
export function linksDeConversa(markdown: string): Map<string, string> {
	const achados = new Map<string, string>();
	for (const [, texto, id] of markdown.matchAll(/\[([^\]]*)\]\(conversa:([^)\s]+)\)/gi)) {
		if (id && !achados.has(id.toLowerCase())) achados.set(id.toLowerCase(), (texto ?? "").trim());
	}
	return achados;
}

/**
 * O que a faixa mostra para o markdown de agora, ou undefined se a nota não é um plano. As conversas vêm na ordem da
 * seção Conversas (lerPlano), com o texto do link como rótulo ("conversa 2" se o link não tem texto).
 */
export function dadosDaFaixa(markdown: string): DadosDaFaixa | undefined {
	if (!ehPlanoDeEstudos(markdown)) return undefined;
	const plano = lerPlano(markdown);
	if (!plano) return undefined;
	const rotulos = linksDeConversa(markdown);
	return {
		feitos: plano.feitos,
		total: plano.total,
		concluido: plano.concluido,
		conversas: plano.conversas.map((id, indice) => ({ id, rotulo: rotulos.get(id.toLowerCase()) || `conversa ${indice + 1}` })),
	};
}

/** "2 de 5" ou "concluído" (o mesmo texto do seletor). */
export const textoDaFaixa = (faixa: Pick<DadosDaFaixa, "feitos" | "total" | "concluido">) => (faixa.concluido ? "concluído" : `${faixa.feitos} de ${faixa.total}`);

/** A faixa mudou? (O editor só se redesenha quando o que ela mostra muda.) */
export function mesmaFaixa(a: DadosDaFaixa | null | undefined, b: DadosDaFaixa | null | undefined): boolean {
	if (!a || !b) return !a && !b;
	return a.feitos === b.feitos && a.total === b.total && a.concluido === b.concluido && a.conversas.length === b.conversas.length && a.conversas.every((conversa, indice) => conversa.id === b.conversas[indice]!.id && conversa.rotulo === b.conversas[indice]!.rotulo);
}

/** Uma conferência barata, sem serializar o documento: o primeiro texto não vazio começa com a tag? */
export function comecaComATag(primeiroTexto: string | undefined): boolean {
	return primeiroTexto !== undefined && primeiroTexto.startsWith(INICIO_TAG_PLANO);
}
