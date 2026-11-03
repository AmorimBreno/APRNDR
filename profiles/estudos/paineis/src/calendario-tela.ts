// As partes puras das telas do calendário da agenda (CalendarioCompacto.tsx e,
// depois, CalendarioCheio.tsx): as semanas de um mês (começando na segunda,
// com os dias de fora do mês), a semana de um dia, os nomes dos meses e dos
// dias em pt-BR (Intl), os itens de cada dia a partir de itensComProvas (as
// tarefas com data e as provas), o filtro por matéria, a cor de cada item e os
// rótulos de prazo (hoje, amanhã, atrasada).
//
// Todas as datas são texto AAAA-MM-DD, como no agenda.json, e a conta de dias
// é em UTC, para o fuso e o horário de verão nunca mudarem o dia. Um mês é o
// texto AAAA-MM.

import {
	type Agenda,
	hojeLocal,
	type ItemCalendario,
	itensComProvas,
	type MateriaDaAgenda,
	type ProvaDaAgenda,
	somarDias,
} from "../../lib/agenda-tipos.ts";
import type { CorMateria } from "../../lib/materia-tipos.ts";

export { hojeLocal };

// ---------------------------------------------------------------------------
// Meses e semanas
// ---------------------------------------------------------------------------

/** O mês (AAAA-MM) de uma data. */
export const mesDaData = (data: string): string => data.slice(0, 7);

/** O primeiro dia do mês. */
export const primeiroDiaDoMes = (mes: string): string => `${mes}-01`;

/** O último dia do mês. */
export function ultimoDiaDoMes(mes: string): string {
	const [ano, numero] = mes.split("-").map(Number) as [number, number];
	return new Date(Date.UTC(ano, numero, 0)).toISOString().slice(0, 10);
}

/** O mês `quantos` meses depois (ou antes, se negativo). */
export function somarMeses(mes: string, quantos: number): string {
	const [ano, numero] = mes.split("-").map(Number) as [number, number];
	return new Date(Date.UTC(ano, numero - 1 + quantos, 1)).toISOString().slice(0, 7);
}

/** A mesma data `quantos` meses depois, sem passar do fim do mês (31 de janeiro + 1 mês = 28 ou 29 de fevereiro). */
export function mesmoDiaEmOutroMes(data: string, quantos: number): string {
	const mes = somarMeses(mesDaData(data), quantos);
	const dia = Math.min(Number(data.slice(8, 10)), Number(ultimoDiaDoMes(mes).slice(8, 10)));
	return `${mes}-${String(dia).padStart(2, "0")}`;
}

/** O dia da semana começando na segunda: 0 = segunda … 6 = domingo. */
export function diaDaSemana(data: string): number {
	const [ano, mes, dia] = data.split("-").map(Number) as [number, number, number];
	return (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() + 6) % 7;
}

/** A segunda-feira da semana da data. */
export const inicioDaSemana = (data: string): string => somarDias(data, -diaDaSemana(data));

/** Os sete dias (segunda a domingo) da semana da data. */
export function semanaDe(data: string): string[] {
	const inicio = inicioDaSemana(data);
	return Array.from({ length: 7 }, (_, indice) => somarDias(inicio, indice));
}

/** Quantos dias de `a` até `b` (negativo se `b` é antes). */
export function diasEntre(a: string, b: string): number {
	const [anoA, mesA, diaA] = a.split("-").map(Number) as [number, number, number];
	const [anoB, mesB, diaB] = b.split("-").map(Number) as [number, number, number];
	return Math.round((Date.UTC(anoB, mesB - 1, diaB) - Date.UTC(anoA, mesA - 1, diaA)) / 86_400_000);
}

/** Um dia na grade do mês. */
export interface DiaDaGrade {
	/** AAAA-MM-DD. */
	data: string;
	/** O dia do mês (1 a 31). */
	dia: number;
	/** O dia é do mês mostrado; os da semana que sobram antes e depois são de fora. */
	doMes: boolean;
}

/**
 * As semanas do mês, de segunda a domingo, com os dias dos meses vizinhos que
 * completam a primeira e a última (doMes: false). Com `seisSemanas`, completa
 * até seis semanas (a altura da grade não muda de um mês para o outro).
 */
export function semanasDoMes(mes: string, opcoes: { seisSemanas?: boolean } = {}): DiaDaGrade[][] {
	const primeiro = primeiroDiaDoMes(mes);
	const ultimo = ultimoDiaDoMes(mes);
	let inicio = inicioDaSemana(primeiro);
	const semanas: DiaDaGrade[][] = [];
	const minimo = opcoes.seisSemanas ? 6 : 0;
	while (inicio <= ultimo || semanas.length < minimo) {
		semanas.push(
			Array.from({ length: 7 }, (_, indice) => {
				const data = somarDias(inicio, indice);
				return { data, dia: Number(data.slice(8, 10)), doMes: mesDaData(data) === mes };
			}),
		);
		inicio = somarDias(inicio, 7);
	}
	return semanas;
}

// ---------------------------------------------------------------------------
// Nomes em pt-BR
// ---------------------------------------------------------------------------

const formatoMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const formatoMesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const formatoDiaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const formatoDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
const formatoDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
const formatoDiaSemanaCurto = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const formatoDiaSemanaInicial = new Intl.DateTimeFormat("pt-BR", { weekday: "narrow", timeZone: "UTC" });

const dataUtc = (data: string) => {
	const [ano, mes, dia] = data.split("-").map(Number) as [number, number, number];
	return new Date(Date.UTC(ano, mes - 1, dia));
};

/** A primeira letra em maiúscula. */
export const capitalizar = (texto: string): string => (texto ? texto[0]!.toLocaleUpperCase("pt-BR") + texto.slice(1) : texto);

/** Os doze meses, de janeiro a dezembro, em minúsculas ("novembro"). */
export const NOMES_DOS_MESES: readonly string[] = Array.from({ length: 12 }, (_, indice) => formatoMes.format(new Date(Date.UTC(2026, indice, 15))));

// 2026-11-02 é uma segunda-feira: a base dos nomes dos dias da semana.
const SEGUNDA_BASE = "2026-11-02";
const diasDaSemanaComo = (formato: Intl.DateTimeFormat) => Array.from({ length: 7 }, (_, indice) => formato.format(dataUtc(somarDias(SEGUNDA_BASE, indice))));

/** Os dias da semana, de segunda a domingo, em minúsculas ("segunda-feira"). */
export const NOMES_DOS_DIAS: readonly string[] = diasDaSemanaComo(formatoDiaSemana);
/** Os dias da semana abreviados, sem o ponto ("seg"). */
export const NOMES_CURTOS_DOS_DIAS: readonly string[] = diasDaSemanaComo(formatoDiaSemanaCurto).map((nome) => nome.replace(/\.$/, ""));
/** A inicial de cada dia da semana em maiúscula ("S", "T", "Q", "Q", "S", "S", "D"). */
export const INICIAIS_DOS_DIAS: readonly string[] = diasDaSemanaComo(formatoDiaSemanaInicial).map((inicial) => inicial.toLocaleUpperCase("pt-BR"));

/** "novembro de 2026". */
export const nomeDoMes = (mes: string): string => formatoMesAno.format(dataUtc(primeiroDiaDoMes(mes)));

/** O nome do dia da semana de uma data ("terça-feira"). */
export const nomeDoDia = (data: string): string => NOMES_DOS_DIAS[diaDaSemana(data)]!;

/** "terça-feira, 3 de novembro" (com " de 2027" quando o ano não é o de `hoje`). */
export function dataPorExtenso(data: string, hoje?: string): string {
	const texto = formatoDiaLongo.format(dataUtc(data));
	return hoje && data.slice(0, 4) !== hoje.slice(0, 4) ? `${texto} de ${data.slice(0, 4)}` : texto;
}

/**
 * O título do dia escolhido: "Hoje, 3 de novembro", "Amanhã, 4 de novembro",
 * "Ontem, 2 de novembro" e, nos outros, "Quarta-feira, 11 de novembro".
 */
export function tituloDoDia(data: string, hoje: string): string {
	const relativo = diasEntre(hoje, data);
	const mesmoAno = data.slice(0, 4) === hoje.slice(0, 4);
	const sufixo = mesmoAno ? "" : ` de ${data.slice(0, 4)}`;
	const rotulo = relativo === 0 ? "Hoje" : relativo === 1 ? "Amanhã" : relativo === -1 ? "Ontem" : undefined;
	if (rotulo) return `${rotulo}, ${formatoDiaMes.format(dataUtc(data))}${sufixo}`;
	return capitalizar(dataPorExtenso(data, hoje));
}

// ---------------------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------------------

export type Prazo = "atrasada" | "hoje" | "amanha";

/** O texto de cada prazo, em minúsculas. */
export const ROTULOS_DO_PRAZO: Record<Prazo, string> = { atrasada: "atrasada", hoje: "hoje", amanha: "amanhã" };

/**
 * O prazo de uma data: atrasada (antes de hoje), hoje ou amanhã; undefined nas
 * outras e sem data. Uma tarefa que já está feita (`aberta: false`) não tem prazo.
 */
export function prazoDaData(data: string | undefined, hoje: string, aberta = true): Prazo | undefined {
	if (!data || !aberta) return undefined;
	if (data < hoje) return "atrasada";
	if (data === hoje) return "hoje";
	if (data === somarDias(hoje, 1)) return "amanha";
	return undefined;
}

/** O prazo de um item do calendário: a prova só tem hoje e amanhã (uma prova que passou não está atrasada). */
export function prazoDoItem(item: Pick<ItemCalendario, "tipo" | "data" | "feita">, hoje: string): Prazo | undefined {
	const prazo = prazoDaData(item.data, hoje, !item.feita);
	return item.tipo === "prova" && prazo === "atrasada" ? undefined : prazo;
}

// ---------------------------------------------------------------------------
// Itens de cada dia
// ---------------------------------------------------------------------------

/** O filtro de matéria: vazio quer dizer todas as matérias. */
const filtroDeMateria = (materia: string | undefined) => (materia ? { materia } : {});

/** Os itens de cada dia (a chave é a data); dentro do dia, na ordem de itensComProvas. */
export function itensPorDia(itens: readonly ItemCalendario[]): Map<string, ItemCalendario[]> {
	const porDia = new Map<string, ItemCalendario[]>();
	for (const item of itens) {
		const lista = porDia.get(item.data);
		if (lista) lista.push(item);
		else porDia.set(item.data, [item]);
	}
	return porDia;
}

/** Os itens de cada dia do intervalo (as duas pontas incluídas); `materia` filtra, e vazia = todas. */
export function itensDoIntervalo(agenda: Agenda, provas: ReadonlyArray<ProvaDaAgenda>, de: string, ate: string, materia?: string): Map<string, ItemCalendario[]> {
	return itensPorDia(itensComProvas(agenda, provas, { de, ate, ...filtroDeMateria(materia) }));
}

/** Os itens de cada dia da grade (os dias de fora do mês também: um dia de outubro na grade de novembro mostra os dele). */
export function itensDaGrade(agenda: Agenda, provas: ReadonlyArray<ProvaDaAgenda>, semanas: ReadonlyArray<ReadonlyArray<DiaDaGrade>>, materia?: string): Map<string, ItemCalendario[]> {
	const primeira = semanas[0]?.[0];
	const ultima = semanas.at(-1)?.at(-1);
	if (!primeira || !ultima) return new Map();
	return itensDoIntervalo(agenda, provas, primeira.data, ultima.data, materia);
}

/** Os itens da semana do dia. */
export function itensDaSemana(agenda: Agenda, provas: ReadonlyArray<ProvaDaAgenda>, data: string, materia?: string): Map<string, ItemCalendario[]> {
	const dias = semanaDe(data);
	return itensDoIntervalo(agenda, provas, dias[0]!, dias[6]!, materia);
}

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

/** O tom de um item: o da matéria (os mesmos tons da capa) ou, sem matéria, o neutro. */
export type TomDoItem = CorMateria | "neutro";

/** O tom de uma matéria (neutro se o id não vale ou a matéria sumiu). */
export function tomDaMateria(materia: string | undefined, materias: ReadonlyArray<Pick<MateriaDaAgenda, "id" | "cor">>): TomDoItem {
	return (materia ? materias.find((item) => item.id === materia)?.cor : undefined) ?? "neutro";
}

/** O tom de um item do calendário: o da matéria dele; tarefa sem matéria é neutra. */
export const tomDoItem = (item: Pick<ItemCalendario, "materia">, materias: ReadonlyArray<Pick<MateriaDaAgenda, "id" | "cor">>): TomDoItem =>
	tomDaMateria(item.materia, materias);

/** A classe do tom (o estilo.css define --tom e --tom-tinta em cada uma). */
export const classeDoTom = (tom: TomDoItem): string => `agenda-tom--${tom}`;

/** Um ponto sob o dia na grade. */
export interface PontoDoDia {
	tom: TomDoItem;
	/** A tarefa já está feita: o ponto aparece apagado. */
	feita: boolean;
	prova: boolean;
}

/** Os pontinhos de um dia: um por item, até `maximo` (3). */
export function pontosDoDia(itens: readonly ItemCalendario[] | undefined, materias: ReadonlyArray<Pick<MateriaDaAgenda, "id" | "cor">>, maximo = 3): PontoDoDia[] {
	return (itens ?? []).slice(0, maximo).map((item) => ({ tom: tomDoItem(item, materias), feita: item.feita === true, prova: item.tipo === "prova" }));
}

/** O texto do dia para o leitor de tela: "terça-feira, 3 de novembro, hoje, 2 itens". */
export function descricaoDoDia(data: string, itens: readonly ItemCalendario[] | undefined, hoje: string): string {
	const quantos = itens?.length ?? 0;
	return [
		dataPorExtenso(data, hoje),
		data === hoje ? "hoje" : "",
		quantos === 0 ? "sem itens" : quantos === 1 ? "1 item" : `${quantos} itens`,
	]
		.filter(Boolean)
		.join(", ");
}

/** O nome da matéria (o id, se ela sumiu); undefined sem matéria. */
export const nomeDaMateria = (materia: string | undefined, materias: ReadonlyArray<Pick<MateriaDaAgenda, "id" | "nome">>): string | undefined =>
	materia ? (materias.find((item) => item.id === materia)?.nome ?? materia) : undefined;

/** Para onde a tecla leva o dia escolhido na grade; undefined para as outras teclas. */
export function diaVizinho(data: string, tecla: string): string | undefined {
	switch (tecla) {
		case "ArrowLeft":
			return somarDias(data, -1);
		case "ArrowRight":
			return somarDias(data, 1);
		case "ArrowUp":
			return somarDias(data, -7);
		case "ArrowDown":
			return somarDias(data, 7);
		case "PageUp":
			return mesmoDiaEmOutroMes(data, -1);
		case "PageDown":
			return mesmoDiaEmOutroMes(data, 1);
		case "Home":
			return inicioDaSemana(data);
		case "End":
			return somarDias(inicioDaSemana(data), 6);
		default:
			return undefined;
	}
}
