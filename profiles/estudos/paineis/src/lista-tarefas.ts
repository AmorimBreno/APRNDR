// As partes puras da aba Tarefas da agenda (ListaTarefas.tsx) e o que o quadro
// (QuadroTarefas.tsx) divide com ela: as tarefas agrupadas por prazo
// (Atrasadas, Hoje, Amanhã, Esta semana, Mais tarde, Sem data e, no fim, as
// Feitas), os filtros da lista, a data curta de uma tarefa e a entrada do campo
// "Adicionar tarefa…" (só o título; o resto vem do filtro).
//
// Todas as datas são texto AAAA-MM-DD, como no agenda.json. "Esta semana" vai
// até o domingo da semana de hoje (semana de segunda a domingo, como o
// calendário); o que passa disso é "Mais tarde".

import { type Agenda, type Coluna, type EntradaTarefa, LIMITE_NOME_COLUNA, somarDias, type Tarefa } from "../../lib/agenda-tipos.ts";
import { colunaParaReabrir, erroDoForm, entradaDoForm, tarefasDaMateria } from "./agenda-tela.ts";
import { inicioDaSemana } from "./calendario-tela.ts";

// --- Os grupos de prazo ---------------------------------------------------------

export type IdGrupo = "atrasadas" | "hoje" | "amanha" | "semana" | "depois" | "sem-data" | "feitas";

/** Os grupos na ordem em que aparecem. */
export const ORDEM_DOS_GRUPOS: readonly IdGrupo[] = ["atrasadas", "hoje", "amanha", "semana", "depois", "sem-data", "feitas"];

export const ROTULOS_DOS_GRUPOS: Record<IdGrupo, string> = {
	atrasadas: "Atrasadas",
	hoje: "Hoje",
	amanha: "Amanhã",
	semana: "Esta semana",
	depois: "Mais tarde",
	"sem-data": "Sem data",
	feitas: "Feitas",
};

/** O grupo de uma tarefa: as feitas ficam juntas; as abertas, pelo dia (sem data, no próprio grupo). */
export function grupoDaTarefa(tarefa: Pick<Tarefa, "data">, feita: boolean, hoje: string): IdGrupo {
	if (feita) return "feitas";
	const data = tarefa.data;
	if (!data) return "sem-data";
	if (data < hoje) return "atrasadas";
	if (data === hoje) return "hoje";
	if (data === somarDias(hoje, 1)) return "amanha";
	if (data <= somarDias(inicioDaSemana(hoje), 6)) return "semana";
	return "depois";
}

/** Os filtros da lista (a matéria vem do filtro da tela inteira). */
export interface FiltroDaLista {
	/** O id da matéria; sem ele, todas. */
	materia?: string;
	/** O id da coluna; sem ele, todas. */
	coluna?: string;
	/** Mostra o grupo das feitas. Escolher a coluna de feito no filtro mostra as feitas de qualquer jeito. */
	mostrarFeitas: boolean;
}

export interface GrupoDaLista {
	id: IdGrupo;
	rotulo: string;
	tarefas: Tarefa[];
}

/**
 * Os grupos da lista, sem os vazios. Dentro de um grupo aberto: por dia, os sem
 * hora primeiro e depois por hora (como o calendário), e a ordem do quadro
 * desempata. As feitas: a concluída há menos tempo primeiro.
 */
export function gruposDaLista(agenda: Agenda, hoje: string, filtro: FiltroDaLista): GrupoDaLista[] {
	const colunas = new Map(agenda.colunas.map((coluna) => [coluna.id, coluna]));
	const incluirFeitas = filtro.mostrarFeitas || colunas.get(filtro.coluna ?? "")?.feito === true;
	const naOrdem = new Map(agenda.tarefas.map((tarefa, indice) => [tarefa.id, indice]));
	const grupos = new Map<IdGrupo, Tarefa[]>();
	for (const tarefa of tarefasDaMateria(agenda, filtro.materia)) {
		if (filtro.coluna && tarefa.coluna !== filtro.coluna) continue;
		const feita = colunas.get(tarefa.coluna)?.feito === true;
		if (feita && !incluirFeitas) continue;
		const id = grupoDaTarefa(tarefa, feita, hoje);
		const lista = grupos.get(id);
		if (lista) lista.push(tarefa);
		else grupos.set(id, [tarefa]);
	}
	const posicao = (tarefa: Tarefa) => naOrdem.get(tarefa.id) ?? 0;
	const porPrazo = (a: Tarefa, b: Tarefa) => (a.data ?? "").localeCompare(b.data ?? "") || (a.hora ?? "").localeCompare(b.hora ?? "") || posicao(a) - posicao(b);
	const porConclusao = (a: Tarefa, b: Tarefa) => (b.concluidaEm ?? b.alteradaEm).localeCompare(a.concluidaEm ?? a.alteradaEm) || posicao(a) - posicao(b);
	return ORDEM_DOS_GRUPOS.flatMap((id) => {
		const tarefas = grupos.get(id);
		if (!tarefas?.length) return [];
		const ordenar = id === "feitas" ? porConclusao : id === "sem-data" ? (a: Tarefa, b: Tarefa) => posicao(a) - posicao(b) : porPrazo;
		return [{ id, rotulo: ROTULOS_DOS_GRUPOS[id], tarefas: [...tarefas].sort(ordenar) }];
	});
}

/** Quantas tarefas a lista mostra, somando os grupos. */
export const totalDosGrupos = (grupos: readonly GrupoDaLista[]): number => grupos.reduce((soma, grupo) => soma + grupo.tarefas.length, 0);

/** As opções do filtro de coluna: "Todas as colunas" (valor vazio) e uma por coluna, na ordem do quadro. */
export function opcoesDeColuna(colunas: ReadonlyArray<Pick<Coluna, "id" | "nome">>): Array<{ value: string; label: string }> {
	return [{ value: "", label: "Todas as colunas" }, ...colunas.map((coluna) => ({ value: coluna.id, label: coluna.nome }))];
}

// --- A data curta ----------------------------------------------------------------

const formatoMesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** "3 nov" (com o ano, "3 nov 2027", quando não é o ano de `hoje`). */
export function dataCurta(data: string, hoje?: string): string {
	const [ano, mes, dia] = data.split("-").map(Number) as [number, number, number];
	const texto = `${dia} ${formatoMesCurto.format(new Date(Date.UTC(ano, mes - 1, dia))).replace(/\./g, "")}`;
	return hoje && data.slice(0, 4) !== hoje.slice(0, 4) ? `${texto} ${data.slice(0, 4)}` : texto;
}

/** A data e a hora de uma tarefa como aparecem na linha e no cartão ("3 nov, 14:00"); undefined sem data. */
export function prazoCurto(tarefa: Pick<Tarefa, "data" | "hora">, hoje?: string): string | undefined {
	if (!tarefa.data) return undefined;
	const data = dataCurta(tarefa.data, hoje);
	return tarefa.hora ? `${data}, ${tarefa.hora}` : data;
}

// --- Criar com o campo rápido -------------------------------------------------------

/** O que o campo rápido (uma linha, só o título) junta ao título. */
export interface OpcoesDaCriacaoRapida {
	/** O id da matéria do filtro. */
	materia?: string;
	/** O id da coluna; sem ele, a primeira que não é a de feito. */
	coluna?: string;
}

/**
 * A tarefa que o campo rápido cria: o título aparado, a matéria do filtro e a
 * coluna dada (ou a primeira que não é de feito; se só existe a de feito, a
 * primeira do quadro). `erro` é a frase para mostrar embaixo do campo.
 */
export function criacaoRapida(agenda: Agenda, titulo: string, opcoes: OpcoesDaCriacaoRapida = {}): { entrada: EntradaTarefa } | { erro: string } {
	const form = { titulo, nota: "", data: "", hora: "", materia: opcoes.materia ?? "", coluna: opcoes.coluna ?? colunaParaReabrir(agenda)?.id ?? "" };
	const erro = erroDoForm(form);
	return erro ? { erro } : { entrada: entradaDoForm(form) };
}

/** O que está errado no nome de uma coluna nova ou renomeada, ou undefined (o nome repetido, quem diz é a extensão). */
export function erroDoNomeDeColuna(nome: string): string | undefined {
	const limpo = nome.trim().replace(/\s+/g, " ");
	if (!limpo) return "Escreva o nome da coluna.";
	if (limpo.length > LIMITE_NOME_COLUNA) return `O nome da coluna pode ter até ${LIMITE_NOME_COLUNA} caracteres.`;
	return undefined;
}

/** O nome da coluna como a extensão guarda: aparado e com os espaços juntos. */
export const nomeDeColunaAparado = (nome: string): string => nome.trim().replace(/\s+/g, " ");
