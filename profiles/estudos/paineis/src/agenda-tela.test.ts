// As partes puras da tela da agenda (agenda-tela.ts): as abas e as rotas, o filtro
// de matéria, a caixinha de feita e o formulário da tarefa.

import { describe, expect, it } from "vitest";
import { type Agenda, agendaPadrao, criarColuna, criarTarefa, editarTarefa, LIMITE_NOTA, LIMITE_TITULO, moverTarefa, marcarFeito } from "../../lib/agenda-tipos.ts";
import {
	abaDaRota,
	ABAS_DA_AGENDA,
	colunaDaCaixinha,
	colunaParaReabrir,
	entradaDoForm,
	erroDoForm,
	type FormTarefa,
	formDaTarefa,
	mudancasDoForm,
	opcoesDeMateria,
	rotaDaAgenda,
	rotaDeVoltarDaAgenda,
	semMudancas,
	tarefasDaMateria,
	tituloAparado,
} from "./agenda-tela.ts";

const agora = new Date("2026-11-03T12:00:00Z");

function agendaDeTeste(): Agenda {
	let agenda = agendaPadrao();
	agenda = criarTarefa(agenda, { titulo: "Lista 3", nota: "Exercícios 4 a 9.", data: "2026-11-10", hora: "14:00", materia: "calculo" }, { id: "t1", agora }).agenda;
	agenda = criarTarefa(agenda, { titulo: "Sem matéria" }, { id: "t2", agora }).agenda;
	return agenda;
}

const formVazio: FormTarefa = { titulo: "", nota: "", data: "", hora: "", materia: "", coluna: "a-fazer" };

describe("as abas e as rotas", () => {
	it("três abas, o calendário primeiro", () => {
		expect(ABAS_DA_AGENDA.map((aba) => aba.id)).toEqual(["calendario", "tarefas", "quadro"]);
	});

	it("sem aba ou com uma que não existe, abre o calendário", () => {
		expect(abaDaRota()).toBe("calendario");
		expect(abaDaRota("")).toBe("calendario");
		expect(abaDaRota("tarefas")).toBe("tarefas");
		expect(abaDaRota("quadro")).toBe("quadro");
		expect(abaDaRota("Quadro")).toBe("calendario");
		expect(abaDaRota("outra")).toBe("calendario");
	});

	it("a rota leva a matéria do filtro", () => {
		expect(rotaDaAgenda()).toBe("agenda/calendario");
		expect(rotaDaAgenda("quadro")).toBe("agenda/quadro");
		expect(rotaDaAgenda("tarefas", "calculo-i")).toBe("agenda/tarefas/calculo-i");
		expect(rotaDaAgenda("calendario", "")).toBe("agenda/calendario");
	});

	it("voltar leva ao caderno da matéria do filtro, ou às matérias", () => {
		expect(rotaDeVoltarDaAgenda("calculo-i")).toBe("caderno/calculo-i");
		expect(rotaDeVoltarDaAgenda()).toBe("");
		expect(rotaDeVoltarDaAgenda("")).toBe("");
	});
});

describe("o filtro de matéria", () => {
	const materias = [
		{ id: "calculo", nome: "Cálculo I" },
		{ id: "fisica", nome: "Física" },
	];

	it("Todas as matérias primeiro, depois uma por matéria", () => {
		expect(opcoesDeMateria(materias)).toEqual([
			{ value: "", label: "Todas as matérias" },
			{ value: "calculo", label: "Cálculo I" },
			{ value: "fisica", label: "Física" },
		]);
	});

	it("uma matéria que sumiu continua na lista, para a escolha não perder o valor", () => {
		expect(opcoesDeMateria(materias, "apagada").at(-1)).toEqual({ value: "apagada", label: "apagada" });
		expect(opcoesDeMateria(materias, "fisica")).toHaveLength(3);
	});

	it("as tarefas da matéria, na ordem do quadro; sem filtro, todas", () => {
		const agenda = agendaDeTeste();
		expect(tarefasDaMateria(agenda, "calculo").map((tarefa) => tarefa.id)).toEqual(["t1"]);
		expect(tarefasDaMateria(agenda).map((tarefa) => tarefa.id)).toEqual(["t1", "t2"]);
		expect(tarefasDaMateria(agenda, "").map((tarefa) => tarefa.id)).toEqual(["t1", "t2"]);
		expect(tarefasDaMateria(agenda, "outra")).toEqual([]);
	});
});

describe("a caixinha de feita", () => {
	it("uma tarefa aberta vai para a coluna de feito; uma feita volta para a primeira que não é a de feito", () => {
		const agenda = agendaDeTeste();
		expect(colunaDaCaixinha(agenda, agenda.tarefas[0]!)).toBe("feito");
		const feita = moverTarefa(agenda, "t1", "feito").agenda;
		expect(colunaDaCaixinha(feita, feita.tarefas.find((tarefa) => tarefa.id === "t1")!)).toBe("a-fazer");
		expect(colunaParaReabrir(feita)?.id).toBe("a-fazer");
	});

	it("com outra coluna de feito e a primeira coluna reordenada, vale a primeira que não é a de feito", () => {
		let agenda = criarColuna(agendaPadrao(), "Revisar", 0, { id: "col-revisar" }).agenda;
		agenda = marcarFeito(agenda, "col-revisar").agenda;
		expect(colunaParaReabrir(agenda)?.id).toBe("a-fazer");
		agenda = criarTarefa(agenda, { titulo: "x", coluna: "col-revisar" }, { id: "t1", agora }).agenda;
		expect(colunaDaCaixinha(agenda, agenda.tarefas[0]!)).toBe("a-fazer");
	});

	it("uma coluna só, a de feito: não há para onde reabrir", () => {
		const agenda: Agenda = { versao: 1, colunas: [{ id: "feito", nome: "Feito", feito: true }], tarefas: [] };
		expect(colunaParaReabrir(agenda)).toBeUndefined();
		expect(colunaDaCaixinha(agenda, { coluna: "feito" })).toBeUndefined();
	});
});

describe("o formulário da tarefa", () => {
	const agenda = agendaDeTeste();

	it("uma tarefa que se edita abre com os campos dela", () => {
		expect(formDaTarefa(agenda.tarefas[0], undefined, agenda.colunas)).toEqual({
			titulo: "Lista 3",
			nota: "Exercícios 4 a 9.",
			data: "2026-11-10",
			hora: "14:00",
			materia: "calculo",
			coluna: "a-fazer",
		});
		expect(formDaTarefa(agenda.tarefas[1], undefined, agenda.colunas)).toEqual({ ...formVazio, titulo: "Sem matéria" });
	});

	it("uma tarefa nova abre com os valores iniciais e a primeira coluna", () => {
		expect(formDaTarefa(undefined, undefined, agenda.colunas)).toEqual(formVazio);
		expect(formDaTarefa(undefined, { data: "2026-11-12", materia: "calculo" }, agenda.colunas)).toEqual({ ...formVazio, data: "2026-11-12", materia: "calculo" });
		expect(formDaTarefa(undefined, { data: "2026-11-12", hora: "09:30", coluna: "fazendo" }, agenda.colunas)).toMatchObject({ hora: "09:30", coluna: "fazendo" });
		// Hora sem data não vale; coluna que não existe cai na primeira.
		expect(formDaTarefa(undefined, { hora: "09:30", coluna: "nao-existe" }, agenda.colunas)).toMatchObject({ hora: "", coluna: "a-fazer" });
	});

	it("o título é aparado e fica em uma linha", () => {
		expect(tituloAparado("  Ler   o\ncapítulo  ")).toBe("Ler o capítulo");
	});

	it("os erros antes de mandar", () => {
		expect(erroDoForm(formVazio)).toBe("Escreva o título da tarefa.");
		expect(erroDoForm({ ...formVazio, titulo: "   " })).toBe("Escreva o título da tarefa.");
		expect(erroDoForm({ ...formVazio, titulo: "x".repeat(LIMITE_TITULO + 1) })).toContain(String(LIMITE_TITULO));
		expect(erroDoForm({ ...formVazio, titulo: "x", nota: "y".repeat(LIMITE_NOTA + 1) })).toContain(String(LIMITE_NOTA));
		expect(erroDoForm({ ...formVazio, titulo: "x", hora: "10:00" })).toBe("Escolha uma data para marcar a hora.");
		expect(erroDoForm({ ...formVazio, titulo: "x", data: "2026-11-10", hora: "10:00" })).toBeUndefined();
	});

	it("a entrada da tarefa nova só leva os campos preenchidos", () => {
		expect(entradaDoForm({ ...formVazio, titulo: "  Ler  " })).toEqual({ titulo: "Ler", coluna: "a-fazer" });
		expect(entradaDoForm({ titulo: "Ler", nota: " texto ", data: "2026-11-10", hora: "14:00", materia: "calculo", coluna: "fazendo" })).toEqual({
			titulo: "Ler",
			nota: "texto",
			data: "2026-11-10",
			hora: "14:00",
			materia: "calculo",
			coluna: "fazendo",
		});
		// A hora sem data não vai.
		expect(entradaDoForm({ ...formVazio, titulo: "Ler", hora: "14:00" })).not.toHaveProperty("hora");
	});

	it("a entrada vale para a extensão (criarTarefa aceita)", () => {
		const entrada = entradaDoForm({ titulo: "Ler", nota: "", data: "2026-11-10", hora: "14:00", materia: "calculo", coluna: "fazendo" });
		const { tarefa } = criarTarefa(agendaPadrao(), entrada, { agora, materias: ["calculo"] });
		expect(tarefa).toMatchObject({ titulo: "Ler", coluna: "fazendo", data: "2026-11-10", hora: "14:00", materia: "calculo" });
	});

	it("sem mexer em nada, nada muda", () => {
		const tarefa = agenda.tarefas[0]!;
		const resultado = mudancasDoForm(tarefa, formDaTarefa(tarefa, undefined, agenda.colunas));
		expect(resultado).toEqual({ mudancas: {} });
		expect(semMudancas(resultado)).toBe(true);
	});

	it("só os campos que mudaram, e null limpa", () => {
		const tarefa = agenda.tarefas[0]!;
		const base = formDaTarefa(tarefa, undefined, agenda.colunas);
		expect(mudancasDoForm(tarefa, { ...base, titulo: "Lista 4" }).mudancas).toEqual({ titulo: "Lista 4" });
		expect(mudancasDoForm(tarefa, { ...base, nota: "" }).mudancas).toEqual({ nota: null });
		expect(mudancasDoForm(tarefa, { ...base, nota: "outra" }).mudancas).toEqual({ nota: "outra" });
		expect(mudancasDoForm(tarefa, { ...base, materia: "" }).mudancas).toEqual({ materia: null });
		expect(mudancasDoForm(tarefa, { ...base, hora: "15:30" }).mudancas).toEqual({ hora: "15:30" });
		// Tirar a data tira a hora junto.
		expect(mudancasDoForm(tarefa, { ...base, data: "", hora: "" }).mudancas).toEqual({ data: null, hora: null });
		expect(mudancasDoForm(tarefa, { ...base, data: "", hora: "14:00" }).mudancas).toEqual({ data: null, hora: null });
		const trocada = mudancasDoForm(tarefa, { ...base, coluna: "fazendo" });
		expect(trocada).toEqual({ mudancas: {}, coluna: "fazendo" });
		expect(semMudancas(trocada)).toBe(false);
	});

	it("as mudanças valem para a extensão (editarTarefa aceita e muda só isso)", () => {
		const tarefa = agenda.tarefas[0]!;
		const base = formDaTarefa(tarefa, undefined, agenda.colunas);
		const { mudancas } = mudancasDoForm(tarefa, { ...base, titulo: "  Lista   4 ", data: "", hora: "" });
		const editada = editarTarefa(agenda, "t1", mudancas, { agora });
		expect(editada.mudou.sort()).toEqual(["data", "hora", "titulo"]);
		expect(editada.tarefa).toMatchObject({ titulo: "Lista 4" });
		expect(editada.tarefa.data).toBeUndefined();
		expect(editada.tarefa.hora).toBeUndefined();
	});
});
