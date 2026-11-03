// Regras puras da tela dos termos (docs/termos.md): lugar, seleção e flutuantes.
import type { LugarNaTela } from "../../lib/termos-tipos.ts";
import { trechoLimpo, trechoValido } from "../../lib/termos-tipos.ts";

export const rotuloDoLugar = (lugar: LugarNaTela | null) =>
	lugar ? `Módulo ${String(lugar.numeroModulo).padStart(2, "0")} · Lição ${lugar.numeroLicao}` : "Não explicado no curso";
export const noProprioBloco = (lugar: LugarNaTela, modulo: string, licao: string, bloco: string) =>
	!lugar.explicacao && lugar.modulo === modulo && lugar.licao === licao && lugar.bloco === bloco;

export function trechoDaSelecao(texto: string, inicio: string | undefined, fim: string | undefined): string | undefined {
	return inicio && inicio === fim && trechoValido(texto) ? trechoLimpo(texto) : undefined;
}

export interface Retangulo {
	left: number;
	top: number;
	right: number;
	bottom: number;
}
/** Coordenadas físicas de viewport. Quem desenha divide pelo zoom do body. */
export function posicionarFlutuante(alvo: Retangulo, largura: number, altura: number, tela: { largura: number; altura: number }) {
	const margem = 12;
	const w = Math.min(largura, Math.max(0, tela.largura - margem * 2));
	const abaixo = alvo.top < altura + margem + 8;
	const left = Math.max(margem, Math.min((alvo.left + alvo.right - w) / 2, tela.largura - w - margem));
	const top = Math.max(margem, Math.min(abaixo ? alvo.bottom + 8 : alvo.top - altura - 8, tela.altura - altura - margem));
	return { left, top, largura: w, abaixo, seta: Math.max(16, Math.min(w - 16, (alvo.left + alvo.right) / 2 - left)) };
}
