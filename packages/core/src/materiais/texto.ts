// Markdown e texto puro: entram direto, em seções pelos títulos do markdown
// (# e ##) e, se uma seção for grande, em pedaços pelos parágrafos.

import type { Extracao, Trecho } from "./tipos.ts";

/** Uma seção maior que isto vira mais de um trecho. */
export const LIMITE_SECAO = 4000;

const nomeTrecho = (numero: number) => `trecho-${String(numero).padStart(3, "0")}`;

/** Divide o texto pelos parágrafos em pedaços de até LIMITE_SECAO (um parágrafo enorme fica inteiro). */
function porParagrafos(texto: string): string[] {
	const pedacos: string[] = [];
	let atual = "";
	for (const paragrafo of texto.split(/\n{2,}/)) {
		if (atual && atual.length + paragrafo.length + 2 > LIMITE_SECAO) {
			pedacos.push(atual);
			atual = "";
		}
		atual = atual ? `${atual}\n\n${paragrafo}` : paragrafo;
	}
	if (atual.trim()) pedacos.push(atual);
	return pedacos;
}

export function extrairTexto(conteudo: string, markdown: boolean): Extracao {
	const linhas = conteudo.replace(/\r\n/g, "\n").split("\n");
	// Seções: [título, linha de início, linhas].
	const secoes: Array<{ titulo?: string; linha: number; linhas: string[] }> = [{ linha: 1, linhas: [] }];
	let emCodigo = false;
	for (const [indice, linha] of linhas.entries()) {
		if (markdown && /^\s*(```|~~~)/.test(linha)) emCodigo = !emCodigo;
		const titulo = markdown && !emCodigo ? /^#{1,2}\s+(.+?)\s*#*\s*$/.exec(linha) : null;
		if (titulo) secoes.push({ titulo: titulo[1]!, linha: indice + 1, linhas: [] });
		secoes.at(-1)!.linhas.push(linha);
	}
	const trechos: Trecho[] = [];
	for (const secao of secoes) {
		const texto = secao.linhas.join("\n").trim();
		if (!texto) continue;
		const fim = secao.linha + secao.linhas.length - 1;
		const pedacos = porParagrafos(texto);
		for (const [indice, pedaco] of pedacos.entries()) {
			const parte = pedacos.length > 1 ? `, parte ${indice + 1} de ${pedacos.length}` : "";
			trechos.push({
				local: secao.titulo ? `seção "${secao.titulo}"${parte}` : `linhas ${secao.linha}–${fim}${parte}`,
				nome: nomeTrecho(trechos.length + 1),
				linhas: [secao.linha, fim],
				origem: "texto",
				texto: pedaco,
			});
		}
	}
	return { tipo: "texto", trechos, custo: 0, avisos: [] };
}
