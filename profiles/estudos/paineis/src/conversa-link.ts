// O link `conversa:<id>` (parte D, WP2; docs/mesa-parte-d.md, seção 3): o que o "Guardar na nota" e a marca "do
// professor" escrevem nas notas. Clicar nele abre a conversa pelo id curto (lib/trecho-guardado.ts). As partes puras:
// reconhecer o link num clique e achar a sessão pelo id curto, sem prefixo. Quem reabre a conversa é abrir-conversa.tsx.

import { idCurtoAntigoDaConversa, idCurtoDaConversa } from "../../lib/trecho-guardado.ts";

/** O esquema dos links de conversa nas notas. */
export const ESQUEMA_CONVERSA = "conversa:";

/** Se o alvo de um clique está dentro de um link `conversa:<id>`, o id (pode vir vazio, de um link quebrado); senão undefined. */
export function idDoLinkDeConversa(alvo: EventTarget | null): string | undefined {
	if (!(alvo instanceof Element)) return undefined;
	const href = alvo.closest("a[href]")?.getAttribute("href")?.trim();
	if (!href || href.slice(0, ESQUEMA_CONVERSA.length).toLowerCase() !== ESQUEMA_CONVERSA) return undefined;
	return href.slice(ESQUEMA_CONVERSA.length).trim();
}

/** O que a escolha da sessão precisa de um resumo de sessão (o ResumoSessao do núcleo tem isto e mais). */
export interface SessaoParaIdCurto {
	id: string;
	modificadaEm?: string;
}

/**
 * A sessão cujo id curto é `idCurto`, ou undefined. A comparação é exata (`idCurtoDaConversa(id) === idCurto`),
 * nunca por prefixo. O id curto de hoje (o relógio em milissegundos) vale primeiro; se nenhuma sessão tem ele, vale
 * o id antigo (idCurtoAntigoDaConversa, dos links escritos antes de 2026-11-24), que podia se repetir entre
 * conversas do mesmo servidor: aí vale a mais recente.
 */
export function sessaoPorIdCurto<T extends SessaoParaIdCurto>(sessoes: readonly T[], idCurto: string): T | undefined {
	const procurado = idCurto.trim().toLowerCase();
	if (procurado === "") return undefined;
	const maisRecente = (casa: (sessao: T) => boolean) => {
		let achada: T | undefined;
		for (const sessao of sessoes) {
			if (!casa(sessao)) continue;
			if (!achada || (sessao.modificadaEm ?? "") > (achada.modificadaEm ?? "")) achada = sessao;
		}
		return achada;
	};
	return maisRecente((sessao) => idCurtoDaConversa(sessao.id) === procurado) ?? maisRecente((sessao) => idCurtoAntigoDaConversa(sessao.id) === procurado);
}

export const AVISO_CONVERSA_SUMIU = "Essa conversa não existe mais.";
export const AVISO_CONVERSA_SEM_LISTA = "Não consegui ler as conversas. Tente de novo em instantes.";
export const TEXTO_CONFIRMAR_TROCA = "O professor está respondendo. Trocar mesmo assim?";
