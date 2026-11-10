// As partes puras da tela da agenda (TelaAgenda.tsx, ModalTarefa.tsx e
// CalendarioCompacto.tsx): as três abas e a rota de cada uma, o filtro de
// matéria, o formulário da tarefa (do que o Breno escreveu para o que a ponte
// recebe, e só o que mudou), a coluna para onde a caixinha de "feita" leva e as
// props que a casca passa a cada aba (PropsAbaAgenda).
//
// Caminho da tela: agenda/<aba>[/<matéria>]. A aba é calendario, tarefas ou
// quadro (sem aba ou uma que não existe, vale calendario); a matéria é o id dela
// e filtra tudo; sem matéria, a tela mostra todas.

import type { IconName } from "@estudos/design-system";
import {
	type Agenda,
	type Coluna,
	type EntradaTarefa,
	LIMITE_NOTA,
	LIMITE_TITULO,
	type MateriaDaAgenda,
	type MudancasTarefa,
	type ProvaDaAgenda,
	type Tarefa,
} from "../../lib/agenda-tipos.ts";
import type { AcoesDaAgenda } from "./agenda-ponte.ts";

// --- As abas e as rotas ------------------------------------------------------

export type AbaAgenda = "calendario" | "tarefas" | "quadro";

export interface InfoAbaAgenda {
	id: AbaAgenda;
	nome: string;
	icone: IconName;
}

/** As abas da tela da agenda, na ordem em que aparecem (a primeira é a que abre sem aba na rota). */
export const ABAS_DA_AGENDA: readonly InfoAbaAgenda[] = [
	{ id: "calendario", nome: "Calendário", icone: "clock" },
	{ id: "tarefas", nome: "Tarefas", icone: "checklist" },
	{ id: "quadro", nome: "Quadro", icone: "chart" },
];

/** A aba que a rota abre; sem aba ou com uma que não existe, o calendário. */
export const abaDaRota = (aba?: string): AbaAgenda => ABAS_DA_AGENDA.find((item) => item.id === aba)?.id ?? "calendario";

/** A rota da tela da agenda, com a matéria do filtro quando houver (agenda/quadro/calculo-i). */
export const rotaDaAgenda = (aba: AbaAgenda = "calendario", materia?: string): string => `agenda/${aba}${materia ? `/${materia}` : ""}`;

/** Para onde o voltar da tela da agenda leva: o caderno da matéria do filtro, ou as matérias. */
export const rotaDeVoltarDaAgenda = (materia?: string): string => (materia ? `caderno/${materia}` : "");

/** As opções do filtro de matéria: "Todas as matérias" (valor vazio) e uma por matéria; um id que não existe mais continua escolhível. */
export function opcoesDeMateria(materias: ReadonlyArray<Pick<MateriaDaAgenda, "id" | "nome">>, atual?: string): Array<{ value: string; label: string }> {
	const opcoes = [{ value: "", label: "Todas as matérias" }, ...materias.map((materia) => ({ value: materia.id, label: materia.nome }))];
	if (atual && !materias.some((materia) => materia.id === atual)) opcoes.push({ value: atual, label: atual });
	return opcoes;
}

/** As tarefas da matéria (todas, sem matéria no filtro), na ordem do quadro. */
export const tarefasDaMateria = (agenda: Agenda, materia?: string): Tarefa[] => (materia ? agenda.tarefas.filter((tarefa) => tarefa.materia === materia) : agenda.tarefas);

// --- A caixinha de feita ----------------------------------------------------------

/** A coluna para onde reabrir uma tarefa: a primeira que não é a de feito (undefined se só existe a de feito). */
export const colunaParaReabrir = (agenda: Agenda): Coluna | undefined => agenda.colunas.find((coluna) => !coluna.feito);

/**
 * A coluna para onde a caixinha leva a tarefa: a de feito, se está aberta; a
 * primeira aberta, se já está feita. undefined quando não há para onde reabrir.
 */
export function colunaDaCaixinha(agenda: Agenda, tarefa: Pick<Tarefa, "coluna">): string | undefined {
	const atual = agenda.colunas.find((coluna) => coluna.id === tarefa.coluna);
	if (!atual?.feito) return agenda.colunas.find((coluna) => coluna.feito)?.id;
	return colunaParaReabrir(agenda)?.id;
}

// --- O formulário da tarefa ------------------------------------------------------

/** Os valores com que o modal abre uma tarefa nova (o dia clicado, a matéria do caderno…). */
export interface InicialTarefa {
	titulo?: string;
	nota?: string;
	/** AAAA-MM-DD. */
	data?: string;
	/** HH:MM. */
	hora?: string;
	/** O id da matéria. */
	materia?: string;
	/** O id da coluna; sem ela, a primeira do quadro. */
	coluna?: string;
}

/** O que o modal mostra nos campos: tudo texto, vazio quando não há valor. */
export interface FormTarefa {
	titulo: string;
	nota: string;
	data: string;
	hora: string;
	materia: string;
	coluna: string;
}

/** Os campos do modal: os da tarefa que se edita ou, numa tarefa nova, os valores iniciais (a coluna padrão é a primeira). */
export function formDaTarefa(tarefa: Tarefa | undefined, inicial: InicialTarefa | undefined, colunas: ReadonlyArray<Coluna>): FormTarefa {
	if (tarefa) {
		return { titulo: tarefa.titulo, nota: tarefa.nota ?? "", data: tarefa.data ?? "", hora: tarefa.hora ?? "", materia: tarefa.materia ?? "", coluna: tarefa.coluna };
	}
	const coluna = colunas.find((item) => item.id === inicial?.coluna) ?? colunas[0];
	return {
		titulo: inicial?.titulo ?? "",
		nota: inicial?.nota ?? "",
		data: inicial?.data ?? "",
		// A hora só existe com data.
		hora: inicial?.data ? (inicial.hora ?? "") : "",
		materia: inicial?.materia ?? "",
		coluna: coluna?.id ?? "",
	};
}

/** O título como a extensão guarda: aparado e em uma linha. */
export const tituloAparado = (titulo: string): string => titulo.trim().replace(/\s+/g, " ");

/** O que está errado no formulário, em português (para mostrar antes de mandar), ou undefined. */
export function erroDoForm(form: FormTarefa): string | undefined {
	const titulo = tituloAparado(form.titulo);
	if (!titulo) return "Escreva o título da tarefa.";
	if (titulo.length > LIMITE_TITULO) return `O título da tarefa pode ter até ${LIMITE_TITULO} caracteres.`;
	if (form.nota.trim().length > LIMITE_NOTA) return `A nota pode ter até ${LIMITE_NOTA} caracteres.`;
	if (form.hora && !form.data) return "Escolha uma data para marcar a hora.";
	return undefined;
}

/** A entrada da tarefa nova: só os campos preenchidos. */
export function entradaDoForm(form: FormTarefa): EntradaTarefa {
	return {
		titulo: tituloAparado(form.titulo),
		...(form.nota.trim() ? { nota: form.nota.trim() } : {}),
		...(form.coluna ? { coluna: form.coluna } : {}),
		...(form.data ? { data: form.data } : {}),
		...(form.data && form.hora ? { hora: form.hora } : {}),
		...(form.materia ? { materia: form.materia } : {}),
	};
}

/**
 * O que mudou numa tarefa que se edita: só os campos diferentes (null limpa
 * nota, data, hora e matéria) e, se trocou, a coluna nova. Vazio quando nada mudou.
 */
export function mudancasDoForm(tarefa: Tarefa, form: FormTarefa): { mudancas: MudancasTarefa; coluna?: string } {
	const mudancas: MudancasTarefa = {};
	const titulo = tituloAparado(form.titulo);
	if (titulo !== tarefa.titulo) mudancas.titulo = titulo;
	const nota = form.nota.trim();
	if (nota !== (tarefa.nota ?? "")) mudancas.nota = nota || null;
	if (form.data !== (tarefa.data ?? "")) mudancas.data = form.data || null;
	const hora = form.data ? form.hora : "";
	if (hora !== (tarefa.hora ?? "")) mudancas.hora = hora || null;
	if (form.materia !== (tarefa.materia ?? "")) mudancas.materia = form.materia || null;
	return { mudancas, ...(form.coluna && form.coluna !== tarefa.coluna ? { coluna: form.coluna } : {}) };
}

/** Não mudou nada no formulário de uma tarefa que se edita. */
export function semMudancas(resultado: { mudancas: MudancasTarefa; coluna?: string }): boolean {
	return Object.keys(resultado.mudancas).length === 0 && resultado.coluna === undefined;
}

// --- As props de cada aba ------------------------------------------------------------

/**
 * O que a casca (TelaAgenda.tsx) passa a CalendarioCheio, ListaTarefas e
 * QuadroTarefas. A agenda já é a que a tela mostra (com as mudanças otimistas
 * do mover); a casca só desenha a aba depois que ela chegou.
 */
export interface PropsAbaAgenda {
	agenda: Agenda;
	/** As provas de todas as matérias (itensComProvas, calendario-tela.ts). */
	provas: ProvaDaAgenda[];
	/** Todas as matérias, com a cor de cada uma (tomDaMateria, calendario-tela.ts). */
	materias: MateriaDaAgenda[];
	/** O id da matéria do filtro; sem ele, todas as matérias. */
	materia?: string;
	/** A data de hoje, AAAA-MM-DD (atualiza na virada do dia). */
	hoje: string;
	/** As ações da ponte (mover, marcar feito, colunas…). Rejeitam com um ErroDaPonte; mover e reordenar colunas já avisam o erro na casca. */
	acoes: AcoesDaAgenda;
	/** Abre o modal para editar a tarefa. */
	abrirTarefa(tarefa: Tarefa): void;
	/** Abre o modal para uma tarefa nova, com valores iniciais (a data do dia, a coluna…). A matéria do filtro já vem preenchida. */
	novaTarefa(inicial?: InicialTarefa): void;
	/** O que a casca guarda entre as abas (o dia escolhido do calendário, os filtros da lista); sem ela, cada aba guarda o seu. */
	memoria?: MemoriaDaAgenda;
}

/** Os filtros da aba Tarefas. */
export interface FiltrosLista {
	/** A coluna do filtro; vazio = todas. */
	coluna: string;
	mostrarFeitas: boolean;
	/** O grupo das feitas está aberto. */
	feitasAbertas: boolean;
}

export const FILTROS_INICIAIS: FiltrosLista = { coluna: "", mostrarFeitas: true, feitasAbertas: false };

/** O estado das abas que sobe para a casca (TelaAgenda), para não zerar ao trocar de aba e voltar. */
export interface MemoriaDaAgenda {
	/** O dia escolhido no calendário (AAAA-MM-DD). */
	escolhido: string;
	definirEscolhido(data: string): void;
	filtros: FiltrosLista;
	definirFiltros(mudar: (atuais: FiltrosLista) => FiltrosLista): void;
}
