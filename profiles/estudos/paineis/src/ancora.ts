// Achar o trecho de uma âncora (parte C1; docs/mesa-parte-c.md, seção 3). Contrato escrito
// no WP0; implementado no WP2. Puro e sem DOM: a nota (destaque-nota.ts) e a lição
// (trecho-na-tela.ts) montam o texto delas em segmentos e pedem a posição aqui.
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

/** O que a mesa pede à aba: achar o trecho (ou o bloco) e rolar até ele, marcando ou não. */
export interface PedidoAncora {
	/** O texto a achar; sem ele, vale o bloco da âncora (e, sem bloco, o começo). */
	trecho?: string;
	ancora?: Ancora;
	/** Só rolar, sem marcar (títulos de seção). */
	soRolar: boolean;
}

/** O aviso discreto de quando a resolução caiu de nível. */
export const AVISO_TRECHO_MUDOU = "O trecho mudou desde a pergunta";

/** Quanto texto em volta da posição é olhado para conferir o contexto (o contexto guardado tem até 40 caracteres). */
const JANELA_CONTEXTO = 200;

/** Juntar os espaços, tirar a diferença de caixa. Usada nos dois lados da comparação. */
export function normalizarParaBusca(texto: string): string {
	return texto.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Normaliza como normalizarParaBusca (sem tirar as pontas) e guarda, para cada caractere do
 * resultado, o índice de onde ele veio no original.
 */
function normalizarComMapa(texto: string): { texto: string; mapa: number[] } {
	let saida = "";
	const mapa: number[] = [];
	let emEspaco = false;
	for (let indice = 0; indice < texto.length; indice++) {
		const caractere = texto[indice] as string;
		if (/\s/.test(caractere)) {
			if (!emEspaco) {
				saida += " ";
				mapa.push(indice);
			}
			emEspaco = true;
			continue;
		}
		emEspaco = false;
		// Um caractere pode virar mais de um em minúscula: todos apontam para o mesmo original.
		for (const minusculo of caractere.toLowerCase()) {
			saida += minusculo;
			mapa.push(indice);
		}
	}
	return { texto: saida, mapa };
}

/** Para conferir o contexto: sem espaço nenhum e sem caixa (a seleção e o texto da tela quebram linhas de jeitos diferentes). */
function compacto(texto: string): string {
	return texto.replace(/\s+/g, "").toLowerCase();
}

function prefixoComum(a: string, b: string): number {
	let n = 0;
	while (n < a.length && n < b.length && a[n] === b[n]) n++;
	return n;
}

function sufixoComum(a: string, b: string): number {
	let n = 0;
	while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
	return n;
}

/**
 * Procura `trecho` em `texto`. Com a âncora, prefere a ocorrência cujo contexto casa com
 * `antes` e `depois`; sem contexto que case por inteiro, a ocorrência com mais contexto em
 * comum (ou, sem nenhum, a primeira); sem ocorrência, undefined (quem chama cai no bloco e
 * no começo).
 */
export function acharNoTexto(texto: string, trecho: string, ancora?: Ancora): PosicaoNoTexto | undefined {
	const agulha = normalizarParaBusca(trecho);
	if (!agulha) return undefined;
	const { texto: palheiro, mapa } = normalizarComMapa(texto);
	const ocorrencias: { inicio: number; fim: number }[] = [];
	for (let achou = palheiro.indexOf(agulha); achou >= 0; achou = palheiro.indexOf(agulha, achou + 1)) {
		const inicio = mapa[achou] as number;
		const ultimo = mapa[achou + agulha.length - 1] as number;
		ocorrencias.push({ inicio, fim: ultimo + 1 });
	}
	const primeira = ocorrencias[0];
	if (!primeira) return undefined;
	const antes = compacto(ancora?.antes ?? "");
	const depois = compacto(ancora?.depois ?? "");
	if (!antes && !depois) return { nivel: "exato", ...primeira };
	let melhor: { inicio: number; fim: number; pontos: number } | undefined;
	for (const ocorrencia of ocorrencias) {
		const anterior = compacto(texto.slice(Math.max(0, ocorrencia.inicio - JANELA_CONTEXTO), ocorrencia.inicio));
		const seguinte = compacto(texto.slice(ocorrencia.fim, ocorrencia.fim + JANELA_CONTEXTO));
		const casaAntes = !antes || anterior.endsWith(antes);
		const casaDepois = !depois || seguinte.startsWith(depois);
		if (casaAntes && casaDepois) return { nivel: "exato-com-contexto", ...ocorrencia };
		const pontos = (antes ? sufixoComum(anterior, antes) : 0) + (depois ? prefixoComum(seguinte, depois) : 0);
		if (!melhor || pontos > melhor.pontos) melhor = { ...ocorrencia, pontos };
	}
	const escolhida = melhor && melhor.pontos > 0 ? melhor : primeira;
	return { nivel: "exato", inicio: escolhida.inicio, fim: escolhida.fim };
}

/**
 * A queda de nível que merece o aviso "O trecho mudou desde a pergunta": o texto achado sem
 * o contexto que a âncora trazia, o bloco quando havia um trecho, o começo quando havia trecho
 * ou bloco. Sem contexto guardado (origens antigas, os comandos do professor), o texto exato
 * já é o melhor nível possível e não avisa.
 */
export function quedaMereceAviso(nivel: NivelAncora, pedido: PedidoAncora): boolean {
	switch (nivel) {
		case "exato-com-contexto":
			return false;
		case "exato":
			return Boolean(pedido.ancora?.antes || pedido.ancora?.depois);
		case "bloco":
			return Boolean(pedido.trecho);
		case "inicio":
			return Boolean(pedido.trecho || pedido.ancora?.bloco);
	}
}

/** Um pedaço do texto montado: de onde (inicio a fim, no texto montado) e de que nó veio. */
export interface Segmento<No> {
	no: No;
	inicio: number;
	fim: number;
}

/** Um ponto dentro de um nó (o nó do segmento e o deslocamento nele). */
export interface PontoNoSegmento<No> {
	no: No;
	deslocamento: number;
}

/**
 * Converte uma posição do texto montado (inicio e fim) em pontos nos nós. Os separadores que
 * a montagem pôs entre os blocos não pertencem a nó nenhum: o começo pula para o segmento
 * seguinte e o fim volta para o anterior. undefined se não sobra nada entre eles.
 */
export function localizarNosSegmentos<No>(segmentos: readonly Segmento<No>[], inicio: number, fim: number): { de: PontoNoSegmento<No>; ate: PontoNoSegmento<No> } | undefined {
	const primeiro = segmentos.find((segmento) => segmento.fim > inicio);
	const ultimo = [...segmentos].reverse().find((segmento) => segmento.inicio < fim);
	if (!primeiro || !ultimo) return undefined;
	const de = { no: primeiro.no, deslocamento: Math.max(0, inicio - primeiro.inicio) };
	const ate = { no: ultimo.no, deslocamento: Math.min(ultimo.fim, fim) - ultimo.inicio };
	if (segmentos.indexOf(primeiro) > segmentos.indexOf(ultimo)) return undefined;
	return { de, ate };
}
