// O link `conversa:<id>` (parte D, WP2; docs/mesa-parte-d.md, seção 3): o que o "Guardar na nota" e a marca "do
// professor" escrevem nas notas. Clicar nele abre a conversa pelo id curto (lib/trecho-guardado.ts). As partes puras:
// reconhecer o link num clique e achar a sessão pelo id curto, sem prefixo. Quem reabre a conversa é abrir-conversa.tsx.

import { idCurtoDaConversa } from "../../lib/trecho-guardado.ts";

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
 * nunca por prefixo: os primeiros dígitos de um UUID v7 são o relógio, e duas conversas do mesmo minuto começam
 * iguais. Se duas sessões tivessem o mesmo id curto (8 caracteres da parte aleatória: quase impossível), vale a
 * mais recente.
 */
export function sessaoPorIdCurto<T extends SessaoParaIdCurto>(sessoes: readonly T[], idCurto: string): T | undefined {
	const procurado = idCurto.trim().toLowerCase();
	if (procurado === "") return undefined;
	let achada: T | undefined;
	for (const sessao of sessoes) {
		if (idCurtoDaConversa(sessao.id) !== procurado) continue;
		if (!achada || (sessao.modificadaEm ?? "") > (achada.modificadaEm ?? "")) achada = sessao;
	}
	return achada;
}

export const AVISO_CONVERSA_SUMIU = "Essa conversa não existe mais.";
export const AVISO_CONVERSA_SEM_LISTA = "Não consegui ler as conversas. Tente de novo em instantes.";
export const TEXTO_CONFIRMAR_TROCA = "O professor está respondendo. Trocar mesmo assim?";
