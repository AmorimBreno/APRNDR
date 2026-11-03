// As partes puras do calendário em tela cheia (CalendarioCheio.tsx): as duas
// visões (Mês e Semana) e a que o Breno deixou escolhida (localStorage), a ordem
// dos itens de um dia, quantas etiquetas cabem numa célula do mês e o "N mais",
// o título de cada visão ("Novembro de 2026", "3 a 9 de novembro"), para onde
// vão as setas e as teclas, o texto de cada item para o leitor de tela e o corte
// das listas curtas da lateral (Sem data e Atrasadas).
//
// As datas são texto AAAA-MM-DD, como no resto do calendário (calendario-tela.ts).

import type { IconName } from "@estudos/design-system";
import { type ItemCalendario, somarDias } from "../../lib/agenda-tipos.ts";
import { capitalizar, diaVizinho, mesDaData, mesmoDiaEmOutroMes, NOMES_DOS_MESES, nomeDoMes, semanaDe } from "./calendario-tela.ts";

// --- As visões ------------------------------------------------------------------------

export type VisaoCalendario = "mes" | "semana";

export interface InfoVisaoCalendario {
	id: VisaoCalendario;
	nome: string;
	icone: IconName;
}

/** As visões do cabeçalho da grade, na ordem em que aparecem (a primeira é a padrão). */
export const VISOES_DO_CALENDARIO: readonly InfoVisaoCalendario[] = [
	{ id: "mes", nome: "Mês", icone: "notebook" },
	{ id: "semana", nome: "Semana", icone: "list" },
];

/** A visão que abre quando nada foi guardado. */
export const VISAO_PADRAO: VisaoCalendario = "mes";

/** A chave do localStorage que lembra a visão escolhida. */
export const CHAVE_DA_VISAO = "estudos:agenda:visao-do-calendario";

type Armazenamento = Pick<Storage, "getItem" | "setItem">;

const armazenamento = (): Armazenamento | undefined => {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
};

/** Um texto guardado vale como visão só se for uma das duas. */
export const ehVisao = (valor: unknown): valor is VisaoCalendario => VISOES_DO_CALENDARIO.some((visao) => visao.id === valor);

/** A visão que o Breno deixou escolhida; sem localStorage, sem nada guardado ou com lixo, a padrão. */
export function visaoGuardada(guardado: Armazenamento | undefined = armazenamento()): VisaoCalendario {
	try {
		const valor = guardado?.getItem(CHAVE_DA_VISAO);
		return ehVisao(valor) ? valor : VISAO_PADRAO;
	} catch {
		return VISAO_PADRAO;
	}
}

/** Lembra a visão escolhida; se o localStorage falhar, ela só vale até sair da tela. */
export function guardarVisao(visao: VisaoCalendario, guardado: Armazenamento | undefined = armazenamento()): void {
	try {
		guardado?.setItem(CHAVE_DA_VISAO, visao);
	} catch {
		// Sem onde guardar: a visão volta ao padrão na próxima vez.
	}
}

// --- Os itens de um dia ----------------------------------------------------------------

/**
 * A ordem dos itens de um dia na lateral e na semana: as provas (valem o dia
 * todo), depois as tarefas com hora, em ordem de hora, e por fim as sem hora.
 * Dentro de cada grupo, a ordem que chegou.
 */
export function ordenarItensDoDia(itens: readonly ItemCalendario[]): ItemCalendario[] {
	const provas = itens.filter((item) => item.tipo === "prova");
	const comHora = itens.filter((item) => item.tipo === "tarefa" && item.hora).sort((a, b) => a.hora!.localeCompare(b.hora!));
	const semHora = itens.filter((item) => item.tipo === "tarefa" && !item.hora);
	return [...provas, ...comHora, ...semHora];
}

/** O que a célula do mês mostra: as etiquetas que cabem e quantas ficaram de fora ("3 mais"). */
export interface ResumoDoDia {
	visiveis: ItemCalendario[];
	escondidos: number;
}

/**
 * Corta os itens do dia para caber: com `capacidade` linhas, se todos cabem, todos aparecem; se não, o
 * "N mais" também ocupa uma linha, então aparecem `capacidade - 1` itens e o resto vai para o "N mais".
 */
export function resumoDoDia(itens: readonly ItemCalendario[], capacidade: number): ResumoDoDia {
	if (itens.length <= capacidade) return { visiveis: [...itens], escondidos: 0 };
	const visiveis = Math.max(0, capacidade - 1);
	return { visiveis: itens.slice(0, visiveis), escondidos: itens.length - visiveis };
}

/** Os tamanhos, em px, que a conta de etiquetas por célula usa (iguais aos do estilo.css, seção do calendário em tela cheia). */
export const MEDIDAS_DA_CELULA = { cabeca: 34, etiqueta: 22, vao: 2, folga: 6 } as const;

/** Quantas linhas de etiqueta cabem numa célula do mês da altura dada. Sem altura conhecida (0), o `padrao`. */
export function capacidadeDaCelula(altura: number, padrao = 3, medidas: { cabeca: number; etiqueta: number; vao: number; folga: number } = MEDIDAS_DA_CELULA): number {
	if (!Number.isFinite(altura) || altura <= 0) return padrao;
	const livre = altura - medidas.cabeca - medidas.folga;
	return Math.max(0, Math.floor((livre + medidas.vao) / (medidas.etiqueta + medidas.vao)));
}

/** Corta uma lista curta: as primeiras `maximo` e quantas ficaram de fora. */
export function limitarLista<T>(lista: readonly T[], maximo: number): { mostradas: T[]; restantes: number } {
	return { mostradas: lista.slice(0, maximo), restantes: Math.max(0, lista.length - maximo) };
}

// --- Títulos e navegação ----------------------------------------------------------------

/**
 * O título da semana do dia: "3 a 9 de novembro"; quando cruza o mês, "27 de outubro a 2 de novembro" e,
 * quando cruza o ano, com o ano nos dois lados.
 */
export function tituloDaSemana(data: string): string {
	const dias = semanaDe(data);
	const primeiro = dias[0]!;
	const ultimo = dias[6]!;
	const dia = (texto: string) => Number(texto.slice(8, 10));
	const mes = (texto: string) => NOMES_DOS_MESES[Number(texto.slice(5, 7)) - 1]!;
	if (primeiro.slice(0, 4) !== ultimo.slice(0, 4)) return `${dia(primeiro)} de ${mes(primeiro)} de ${primeiro.slice(0, 4)} a ${dia(ultimo)} de ${mes(ultimo)} de ${ultimo.slice(0, 4)}`;
	if (mesDaData(primeiro) !== mesDaData(ultimo)) return `${dia(primeiro)} de ${mes(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`;
	return `${dia(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`;
}

/** O título do cabeçalho da grade: "Novembro de 2026" no mês e "3 a 9 de novembro" na semana. */
export const tituloDaVisao = (visao: VisaoCalendario, data: string): string => (visao === "mes" ? capitalizar(nomeDoMes(mesDaData(data))) : tituloDaSemana(data));

/** O dia escolhido depois da seta de `passo` (-1 ou 1): o mesmo dia do mês vizinho no Mês, o mesmo dia da semana vizinha na Semana. */
export const dataDoPasso = (visao: VisaoCalendario, data: string, passo: -1 | 1): string => (visao === "mes" ? mesmoDiaEmOutroMes(data, passo) : somarDias(data, 7 * passo));

/** Para onde a tecla leva o dia escolhido; na Semana, PageUp e PageDown trocam de semana (no Mês, de mês). undefined para as outras teclas. */
export function teclaDaGrade(visao: VisaoCalendario, data: string, tecla: string): string | undefined {
	if (visao === "semana" && tecla === "PageUp") return somarDias(data, -7);
	if (visao === "semana" && tecla === "PageDown") return somarDias(data, 7);
	return diaVizinho(data, tecla);
}

// --- Texto para o leitor de tela ---------------------------------------------------------

/** "Prova P1, Cálculo I" e "Tarefa Resolver a lista, 14:00, Cálculo I, feita": o item como o leitor de tela lê. */
export function descricaoDoItem(item: Pick<ItemCalendario, "tipo" | "titulo" | "hora" | "feita">, nomeDaMateria?: string): string {
	return [item.tipo === "prova" ? `Prova ${item.titulo}` : `Tarefa ${item.titulo}`, item.hora ?? "", nomeDaMateria ?? "", item.feita ? "feita" : ""].filter(Boolean).join(", ");
}

/** O texto do "N mais": "1 mais", "3 mais". */
export const textoDoMais = (escondidos: number): string => `${escondidos} mais`;

/** A data curta da lista de atrasadas: "03/11". */
export const dataCurta = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** Quantas tarefas as listas curtas da lateral (Atrasadas e Sem data) mostram antes do "e mais N". */
export const MAXIMO_DAS_LISTAS_CURTAS = 5;
