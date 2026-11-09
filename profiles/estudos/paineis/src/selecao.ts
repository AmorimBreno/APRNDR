// As regras puras da seleção de texto que abre a barra de perguntas (WP7b;
// docs/mesa-de-estudo.md, 2.8), valendo para a nota e para a lição. Sem React e
// sem DOM de verdade: o hook (BarraSelecao.tsx) lê o navegador e passa para cá
// só o que precisa para decidir.

import { MAXIMO_CARACTERES_TRECHO } from "../../lib/termos-tipos.ts";

/** O trecho que a barra aceita: de 1 a 2000 caracteres, depois de juntar os espaços. */
export const MAXIMO_TRECHO_BARRA = 2000;
/** Os pedidos dos termos ("Não sei o que é isso", "Explique melhor") seguem o limite deles. */
export const MAXIMO_TRECHO_TERMO = MAXIMO_CARACTERES_TRECHO;

/** O que nunca participa da seleção: campos, respostas do Breno e o painel do professor (a conversa mora nele). */
export const PROIBIDOS_PADRAO =
	"textarea,input,select,[contenteditable=true],.diag__sua-resposta,.modulo__campo,.modulo__confianca,.modulo__questao-botoes,.mesa__professor";

/** Quebras de linha, tabulações e espaços repetidos viram um espaço só, e as pontas saem. */
export function juntarEspacos(texto: string): string {
	return texto.trim().replace(/\s+/g, " ");
}

/** O trecho para a barra (1 a `limite` caracteres, padrão 2000), ou undefined se vazio ou grande demais. */
export function trechoDaBarra(texto: string, limite: number = MAXIMO_TRECHO_BARRA): string | undefined {
	const trecho = juntarEspacos(texto);
	return trecho.length >= 1 && trecho.length <= limite ? trecho : undefined;
}

/** O trecho serve para os pedidos dos termos (até 300 caracteres)? */
export function valeParaTermos(trecho: string): boolean {
	return trecho.length >= 1 && trecho.length <= MAXIMO_TRECHO_TERMO;
}

/** O pedaço de DOM que a decisão precisa: achar o ancestral que bate com um seletor. */
export interface NoDaSelecao {
	closest(seletor: string): unknown;
}

export interface EntradaDecisaoSelecao {
	/** O texto da seleção, como o navegador entrega (ainda com os espaços como vieram). */
	texto: string;
	/** A área que vale (o texto de um bloco da lição, a folha da nota). */
	raiz: { contains(no: unknown): boolean };
	/** O elemento onde a seleção começa e onde termina (null = fora de qualquer elemento). */
	inicio: NoDaSelecao | null;
	fim: NoDaSelecao | null;
	/** Seletores que nunca participam (PROIBIDOS_PADRAO, ou a lista da tela). */
	proibidos: string;
	/** A seleção atravessa um elemento proibido no meio (pedaço de DOM que o início e o fim não mostram). */
	cruzaProibido?: boolean;
	/** O limite do trecho; padrão MAXIMO_TRECHO_BARRA. */
	limite?: number;
}

/**
 * O trecho da seleção, se a barra deve aparecer; undefined se não. Só aparece
 * quando o início e o fim estão dentro da raiz, nenhum dos dois está num lugar
 * proibido, a seleção não atravessa um e o texto cabe no limite.
 */
export function decidirSelecao(entrada: EntradaDecisaoSelecao): string | undefined {
	const { raiz, inicio, fim, proibidos } = entrada;
	if (!inicio || !fim) return undefined;
	if (!raiz.contains(inicio) || !raiz.contains(fim)) return undefined;
	if (inicio.closest(proibidos) || fim.closest(proibidos)) return undefined;
	if (entrada.cruzaProibido) return undefined;
	return trechoDaBarra(entrada.texto, entrada.limite);
}

/** Os jeitos do "Outro jeito", na ordem do menu. */
export const JEITOS_DE_EXPLICAR = [
	{ id: "analogia", rotulo: "Analogia", pedido: "Explique este trecho de outro jeito, com uma analogia." },
	{ id: "caso_real", rotulo: "Caso real", pedido: "Explique este trecho de outro jeito, com um caso real." },
	{ id: "passo_a_passo", rotulo: "Passo a passo", pedido: "Explique este trecho de outro jeito, passo a passo." },
	{ id: "visual", rotulo: "Visual com diagrama", pedido: "Explique este trecho de outro jeito, de forma visual, com um diagrama." },
] as const;

export type JeitoDeExplicar = (typeof JEITOS_DE_EXPLICAR)[number]["id"];

/** O pedido do "Me teste nisso". */
export const PEDIDO_ME_TESTE = "Me faça uma pergunta curta para eu testar se entendi este trecho. Não dê a resposta antes de eu tentar.";

/** O pedido pronto de um jeito de explicar. */
export function pedidoDoJeito(id: JeitoDeExplicar): string {
	return JEITOS_DE_EXPLICAR.find((jeito) => jeito.id === id)!.pedido;
}
