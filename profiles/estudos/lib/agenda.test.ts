// Testes da agenda: as operações puras (agenda-tipos.ts) e o disco com os
// eventos (agenda.ts), numa pasta de dados temporária.

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	abrirAgenda,
	type Agenda,
	agendaPadrao,
	apagarColuna,
	apagarColunaNoDisco,
	apagarTarefa,
	apagarTarefaNoDisco,
	arquivoAgenda,
	criarColuna,
	criarColunaNoDisco,
	criarTarefa,
	criarTarefaNoDisco,
	editarTarefa,
	editarTarefaNoDisco,
	ehData,
	ehHora,
	ErroAgenda,
	eventosAgenda,
	gravarAgenda,
	itensDoCalendario,
	lerAgenda,
	marcarFeito,
	marcarFeitoNoDisco,
	moverTarefa,
	moverTarefaNoDisco,
	renomearColuna,
	renomearColunaNoDisco,
	reordenarColunas,
	reordenarColunasNoDisco,
	somarDias,
	tarefasAtrasadas,
	tarefasDaColuna,
	tarefasSemData,
	validarAgenda,
} from "./agenda.ts";
import { lerEventos } from "./eventos.ts";
import { alterarMateria, criarMateria, eventosMateria } from "./materias.ts";

const AGORA = new Date("2026-11-03T12:00:00.000Z");
const DEPOIS = new Date("2026-11-04T12:00:00.000Z");

/** Cria uma tarefa por título, em sequência (ids t1, t2…), na coluna dada. */
function comTarefas(titulos: string[], coluna = "a-fazer"): Agenda {
	let agenda = agendaPadrao();
	titulos.forEach((titulo, indice) => {
		agenda = criarTarefa(agenda, { titulo, coluna }, { agora: AGORA, id: `t${indice + 1}` }).agenda;
	});
	return agenda;
}

const titulosDa = (agenda: Agenda, coluna: string) => tarefasDaColuna(agenda, coluna).map((tarefa) => tarefa.titulo);

describe("datas e horas", () => {
	it("só aceita dias que existem e horas de 00:00 a 23:59", () => {
		expect(ehData("2026-02-28")).toBe(true);
		expect(ehData("2026-02-30")).toBe(false);
		expect(ehData("26-02-01")).toBe(false);
		expect(ehHora("09:30")).toBe(true);
		expect(ehHora("24:00")).toBe(false);
		expect(ehHora("9:30")).toBe(false);
	});
	it("soma dias atravessando o mês", () => {
		expect(somarDias("2026-11-03", 30)).toBe("2026-12-03");
		expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
	});
});

describe("a agenda padrão", () => {
	it("tem A fazer, Fazendo e Feito, só a última de feito", () => {
		const agenda = agendaPadrao();
		expect(agenda.colunas.map((coluna) => [coluna.nome, coluna.feito])).toEqual([
			["A fazer", false],
			["Fazendo", false],
			["Feito", true],
		]);
		expect(agenda.tarefas).toEqual([]);
	});
});

describe("criar tarefa", () => {
	it("aparo o título, vai para a primeira coluna e fica no fim dela", () => {
		let agenda = agendaPadrao();
		({ agenda } = criarTarefa(agenda, { titulo: "  Ler   capítulo 3 ", nota: " com calma ", data: "2026-11-10", hora: "14:00", materia: "calculo" }, { agora: AGORA, id: "t1", materias: ["calculo"] }));
		({ agenda } = criarTarefa(agenda, { titulo: "Segunda" }, { agora: AGORA, id: "t2" }));
		expect(agenda.tarefas[0]).toEqual({
			id: "t1",
			titulo: "Ler capítulo 3",
			nota: "com calma",
			coluna: "a-fazer",
			ordem: 0,
			data: "2026-11-10",
			hora: "14:00",
			materia: "calculo",
			criadaEm: AGORA.toISOString(),
			alteradaEm: AGORA.toISOString(),
		});
		expect(titulosDa(agenda, "a-fazer")).toEqual(["Ler capítulo 3", "Segunda"]);
		expect(Object.keys(agenda.tarefas[0]!)).toEqual(["id", "titulo", "nota", "coluna", "ordem", "data", "hora", "materia", "criadaEm", "alteradaEm"]);
	});

	it("recusa título vazio ou grande, data e hora ruins, hora sem data, coluna e matéria que não existem", () => {
		const agenda = agendaPadrao();
		expect(() => criarTarefa(agenda, { titulo: "   " })).toThrow(ErroAgenda);
		expect(() => criarTarefa(agenda, { titulo: "x".repeat(201) })).toThrow(/200/);
		expect(() => criarTarefa(agenda, { titulo: "a", data: "2026-13-01" })).toThrow(/AAAA-MM-DD/);
		expect(() => criarTarefa(agenda, { titulo: "a", data: "2026-11-01", hora: "25:00" })).toThrow(/HH:MM/);
		expect(() => criarTarefa(agenda, { titulo: "a", hora: "10:00" })).toThrow(/precisa de uma data/);
		expect(() => criarTarefa(agenda, { titulo: "a", coluna: "nao-existe" })).toThrow(/coluna/);
		expect(() => criarTarefa(agenda, { titulo: "a", materia: "calculo" }, { materias: ["fisica"] })).toThrow(/matéria "calculo"/);
		expect(() => criarTarefa(agenda, { titulo: 5 as unknown as string })).toThrow(ErroAgenda);
		// Sem a lista de matérias, não confere.
		expect(criarTarefa(agenda, { titulo: "a", materia: "qualquer" }).tarefa.materia).toBe("qualquer");
	});

	it("criada direto na coluna de feito já nasce concluída", () => {
		const { tarefa } = criarTarefa(agendaPadrao(), { titulo: "Já feita", coluna: "feito" }, { agora: AGORA });
		expect(tarefa.concluidaEm).toBe(AGORA.toISOString());
	});

	it("não mexe na agenda que recebeu e gera ids diferentes", () => {
		const agenda = agendaPadrao();
		const a = criarTarefa(agenda, { titulo: "A" });
		const b = criarTarefa(a.agenda, { titulo: "B" });
		expect(agenda.tarefas).toHaveLength(0);
		expect(a.tarefa.id).toMatch(/^t-[0-9a-z]{12}-[0-9a-f]{4}$/);
		expect(b.tarefa.id).not.toBe(a.tarefa.id);
	});
});

describe("editar tarefa", () => {
	it("muda só o que mudou e devolve a tarefa de antes", () => {
		const agenda = comTarefas(["Um"]);
		const r = editarTarefa(agenda, "t1", { titulo: "Um", nota: "texto", data: "2026-11-05" }, { agora: DEPOIS });
		expect(r.mudou).toEqual(["nota", "data"]);
		expect(r.antes.nota).toBeUndefined();
		expect(r.tarefa).toMatchObject({ titulo: "Um", nota: "texto", data: "2026-11-05", alteradaEm: DEPOIS.toISOString(), criadaEm: AGORA.toISOString() });
	});

	it("sem mudança real devolve a mesma agenda", () => {
		const agenda = comTarefas(["Um"]);
		expect(editarTarefa(agenda, "t1", { titulo: " Um " }).agenda).toBe(agenda);
		expect(editarTarefa(agenda, "t1", {}).mudou).toEqual([]);
	});

	it("null ou texto vazio limpa nota, data, hora e matéria; título não", () => {
		let agenda = criarTarefa(agendaPadrao(), { titulo: "Um", nota: "n", data: "2026-11-05", hora: "10:00", materia: "m" }, { id: "t1" }).agenda;
		const r = editarTarefa(agenda, "t1", { nota: "  ", materia: null, hora: null });
		expect(r.mudou).toEqual(["nota", "hora", "materia"]);
		expect(r.tarefa).not.toHaveProperty("nota");
		expect(r.tarefa.data).toBe("2026-11-05");
		agenda = r.agenda;
		expect(() => editarTarefa(agenda, "t1", { titulo: "" })).toThrow(/título/);
		expect(() => editarTarefa(agenda, "t1", { titulo: null })).toThrow(/título/);
	});

	it("tirar a data tira a hora junto; pedir hora sem data é erro", () => {
		const agenda = criarTarefa(agendaPadrao(), { titulo: "Um", data: "2026-11-05", hora: "10:00" }, { id: "t1" }).agenda;
		const r = editarTarefa(agenda, "t1", { data: null });
		expect(r.mudou).toEqual(["data", "hora"]);
		expect(r.tarefa).not.toHaveProperty("hora");
		expect(() => editarTarefa(agenda, "t1", { data: null, hora: "11:00" })).toThrow(/precisa de uma data/);
		expect(() => editarTarefa(comTarefas(["Sem data"]), "t1", { hora: "11:00" })).toThrow(/precisa de uma data/);
	});

	it("só confere a matéria quando ela muda", () => {
		const agenda = criarTarefa(agendaPadrao(), { titulo: "Um", materia: "apagada" }, { id: "t1" }).agenda;
		expect(editarTarefa(agenda, "t1", { titulo: "Dois" }, { materias: ["fisica"] }).tarefa.titulo).toBe("Dois");
		expect(() => editarTarefa(agenda, "t1", { materia: "nao-existe" }, { materias: ["fisica"] })).toThrow(/matéria/);
		expect(editarTarefa(agenda, "t1", { materia: "fisica" }, { materias: ["fisica"] }).tarefa.materia).toBe("fisica");
	});

	it("tarefa que não existe é erro", () => {
		expect(() => editarTarefa(agendaPadrao(), "x", { titulo: "a" })).toThrow(/Não achei a tarefa/);
	});
});

describe("mover tarefa", () => {
	it("entre colunas: renumera as duas e respeita a posição", () => {
		let agenda = comTarefas(["A", "B", "C"]);
		agenda = moverTarefa(agenda, "t3", "fazendo", undefined, { agora: DEPOIS }).agenda;
		agenda = moverTarefa(agenda, "t1", "fazendo", 0, { agora: DEPOIS }).agenda;
		expect(titulosDa(agenda, "a-fazer")).toEqual(["B"]);
		expect(titulosDa(agenda, "fazendo")).toEqual(["A", "C"]);
		expect(tarefasDaColuna(agenda, "a-fazer").map((t) => t.ordem)).toEqual([0]);
		expect(tarefasDaColuna(agenda, "fazendo").map((t) => t.ordem)).toEqual([0, 1]);
		// O array fica na ordem do quadro.
		expect(agenda.tarefas.map((t) => t.titulo)).toEqual(["B", "A", "C"]);
	});

	it("na mesma coluna: reordena; a posição conta sem a própria tarefa", () => {
		let agenda = comTarefas(["A", "B", "C", "D"]);
		let r = moverTarefa(agenda, "t4", "a-fazer", 0);
		expect(r.mudou).toBe(true);
		expect(r.mudouDeColuna).toBe(false);
		expect(titulosDa(r.agenda, "a-fazer")).toEqual(["D", "A", "B", "C"]);
		agenda = r.agenda;
		r = moverTarefa(agenda, "t4", "a-fazer", 99);
		expect(titulosDa(r.agenda, "a-fazer")).toEqual(["A", "B", "C", "D"]);
		// Para onde já está: nada muda.
		expect(moverTarefa(r.agenda, "t4", "a-fazer", 3).agenda).toBe(r.agenda);
		expect(moverTarefa(r.agenda, "t4", "a-fazer").mudou).toBe(false);
	});

	it("entrar na coluna de feito preenche concluidaEm; sair apaga; entre colunas abertas não mexe", () => {
		let agenda = comTarefas(["A"]);
		let r = moverTarefa(agenda, "t1", "fazendo", undefined, { agora: DEPOIS });
		expect(r).toMatchObject({ concluiu: false, reabriu: false, mudouDeColuna: true });
		expect(r.tarefa.concluidaEm).toBeUndefined();
		r = moverTarefa(r.agenda, "t1", "feito", undefined, { agora: DEPOIS });
		expect(r.concluiu).toBe(true);
		expect(r.tarefa.concluidaEm).toBe(DEPOIS.toISOString());
		const outraVez = moverTarefa(r.agenda, "t1", "feito", 0, { agora: new Date("2027-01-01") });
		expect(outraVez.agenda).toBe(r.agenda);
		r = moverTarefa(r.agenda, "t1", "a-fazer", undefined, { agora: DEPOIS });
		expect(r.reabriu).toBe(true);
		expect(r.tarefa).not.toHaveProperty("concluidaEm");
	});

	it("recusa coluna que não existe e posição que não é inteiro", () => {
		const agenda = comTarefas(["A"]);
		expect(() => moverTarefa(agenda, "t1", "nada")).toThrow(/coluna/);
		expect(() => moverTarefa(agenda, "t1", "fazendo", -1)).toThrow(/posição/);
		expect(() => moverTarefa(agenda, "t1", "fazendo", 1.5)).toThrow(/posição/);
		expect(() => moverTarefa(agenda, "x", "fazendo")).toThrow(/tarefa/);
	});
});

describe("apagar tarefa", () => {
	it("tira e renumera", () => {
		const agenda = comTarefas(["A", "B", "C"]);
		const r = apagarTarefa(agenda, "t1");
		expect(r.tarefa.titulo).toBe("A");
		expect(tarefasDaColuna(r.agenda, "a-fazer").map((t) => [t.titulo, t.ordem])).toEqual([["B", 0], ["C", 1]]);
		expect(() => apagarTarefa(r.agenda, "t1")).toThrow(/tarefa/);
	});
});

describe("colunas", () => {
	it("cria no fim ou numa posição; recusa nome vazio, grande ou repetido (sem acento e maiúsculas)", () => {
		const agenda = agendaPadrao();
		const fim = criarColuna(agenda, "  Revisar  ", undefined, { id: "col-1" });
		expect(fim.agenda.colunas.map((c) => c.nome)).toEqual(["A fazer", "Fazendo", "Feito", "Revisar"]);
		expect(fim.coluna).toEqual({ id: "col-1", nome: "Revisar", feito: false });
		const inicio = criarColuna(agenda, "Ideias", 0);
		expect(inicio.agenda.colunas.map((c) => c.nome)).toEqual(["Ideias", "A fazer", "Fazendo", "Feito"]);
		expect(inicio.coluna.id).toMatch(/^col-[0-9a-z]{12}-[0-9a-f]{4}$/);
		expect(() => criarColuna(agenda, " ")).toThrow(/nome/);
		expect(() => criarColuna(agenda, "x".repeat(41))).toThrow(/40/);
		expect(() => criarColuna(agenda, "a  FAZER")).toThrow(/Já existe/);
		expect(() => criarColuna(agenda, "Fázendo")).toThrow(/Já existe/);
		expect(() => criarColuna(agenda, "Nova", -2)).toThrow(/posição/);
	});

	it("renomeia; o mesmo nome não muda; nome de outra coluna é recusado", () => {
		const agenda = agendaPadrao();
		const r = renomearColuna(agenda, "fazendo", "Em andamento");
		expect(r.coluna.nome).toBe("Em andamento");
		expect(r.anterior).toBe("Fazendo");
		expect(renomearColuna(agenda, "fazendo", "Fazendo").agenda).toBe(agenda);
		expect(() => renomearColuna(agenda, "fazendo", "Feito")).toThrow(/Já existe/);
		expect(() => renomearColuna(agenda, "nada", "X")).toThrow(/coluna/);
	});

	it("reordena: precisa de todos os ids, uma vez cada; a mesma ordem não muda; as tarefas seguem as colunas", () => {
		let agenda = comTarefas(["A"], "feito");
		agenda = criarTarefa(agenda, { titulo: "B", coluna: "a-fazer" }, { id: "t9" }).agenda;
		const r = reordenarColunas(agenda, ["feito", "fazendo", "a-fazer"]);
		expect(r.agenda.colunas.map((c) => c.id)).toEqual(["feito", "fazendo", "a-fazer"]);
		expect(r.agenda.tarefas.map((t) => t.titulo)).toEqual(["A", "B"]);
		expect(reordenarColunas(agenda, ["a-fazer", "fazendo", "feito"]).agenda).toBe(agenda);
		expect(() => reordenarColunas(agenda, ["a-fazer", "fazendo"])).toThrow(/todas as colunas/);
		expect(() => reordenarColunas(agenda, ["a-fazer", "fazendo", "fazendo"])).toThrow(/todas as colunas/);
		expect(() => reordenarColunas(agenda, ["a-fazer", "fazendo", "x"])).toThrow(/todas as colunas/);
	});

	it("marcar feito: a marca troca e o concluidaEm acompanha", () => {
		let agenda = comTarefas(["Feita"], "feito");
		agenda = criarTarefa(agenda, { titulo: "Fazendo", coluna: "fazendo" }, { id: "t2", agora: AGORA }).agenda;
		expect(agenda.tarefas.find((t) => t.id === "t1")!.concluidaEm).toBeDefined();
		const r = marcarFeito(agenda, "fazendo", { agora: DEPOIS });
		expect(r.agenda.colunas.map((c) => [c.id, c.feito])).toEqual([["a-fazer", false], ["fazendo", true], ["feito", false]]);
		expect(r).toMatchObject({ concluidas: 1, reabertas: 1 });
		expect(r.anterior.id).toBe("feito");
		expect(r.agenda.tarefas.find((t) => t.id === "t1")).not.toHaveProperty("concluidaEm");
		expect(r.agenda.tarefas.find((t) => t.id === "t2")!.concluidaEm).toBe(DEPOIS.toISOString());
		expect(marcarFeito(agenda, "feito").agenda).toBe(agenda);
		expect(() => marcarFeito(agenda, "nada")).toThrow(/coluna/);
	});

	it("apagar coluna vazia; nunca a última nem a de feito", () => {
		const agenda = agendaPadrao();
		expect(apagarColuna(agenda, "fazendo").agenda.colunas.map((c) => c.id)).toEqual(["a-fazer", "feito"]);
		expect(() => apagarColuna(agenda, "feito")).toThrow(/coluna de feito/);
		const so = { ...agenda, colunas: [{ id: "unica", nome: "Única", feito: true }] };
		expect(() => apagarColuna(so, "unica")).toThrow(/última/);
	});

	it("apagar coluna com tarefas exige destino; elas vão para o fim, na ordem; no feito ficam concluídas", () => {
		let agenda = comTarefas(["A", "B"], "fazendo");
		agenda = criarTarefa(agenda, { titulo: "C", coluna: "a-fazer" }, { id: "t3" }).agenda;
		expect(() => apagarColuna(agenda, "fazendo")).toThrow(/2 tarefas.*Escolha para onde/);
		expect(() => apagarColuna(agenda, "fazendo", "fazendo")).toThrow(/outra coluna/);
		expect(() => apagarColuna(agenda, "fazendo", "nada")).toThrow(/coluna/);
		const r = apagarColuna(agenda, "fazendo", "a-fazer");
		expect(r.agenda.colunas.map((c) => c.id)).toEqual(["a-fazer", "feito"]);
		expect(titulosDa(r.agenda, "a-fazer")).toEqual(["C", "A", "B"]);
		expect(r.movidas.map((t) => t.id)).toEqual(["t1", "t2"]);
		const noFeito = apagarColuna(agenda, "fazendo", "feito", { agora: DEPOIS });
		expect(noFeito.agenda.tarefas.filter((t) => t.coluna === "feito").every((t) => t.concluidaEm === DEPOIS.toISOString())).toBe(true);
	});
});

describe("ler o agenda.json", () => {
	it("aceita o que as operações gravam e arruma a ordem", () => {
		const agenda = comTarefas(["A", "B"]);
		const embaralhada = { ...agenda, tarefas: [...agenda.tarefas].reverse().map((t, i) => ({ ...t, ordem: 10 + i })) };
		expect(validarAgenda(JSON.parse(JSON.stringify(embaralhada)))).toEqual(
			// B tinha ordem 10 e A, 11: a ordem relida é a do arquivo (B, A), renumerada.
			{ ...agenda, tarefas: [agenda.tarefas[1]!, agenda.tarefas[0]!].map((t, i) => ({ ...t, ordem: i })) },
		);
	});

	it("recusa o que não vale, dizendo o motivo", () => {
		const ok = agendaPadrao();
		const mal = (mudar: (a: Record<string, unknown>) => void) => {
			const copia = JSON.parse(JSON.stringify(ok)) as Record<string, unknown>;
			mudar(copia);
			return () => validarAgenda(copia);
		};
		expect(() => validarAgenda(null)).toThrow(/objeto/);
		expect(mal((a) => (a.versao = 2))).toThrow(/versão/);
		expect(mal((a) => (a.colunas = []))).toThrow(/colunas/);
		expect(mal((a) => ((a.colunas as Array<{ feito: boolean }>)[2]!.feito = false))).toThrow(/exatamente uma/);
		expect(mal((a) => ((a.colunas as Array<{ feito: boolean }>)[0]!.feito = true))).toThrow(/exatamente uma/);
		expect(mal((a) => ((a.colunas as Array<{ id: string }>)[1]!.id = "a-fazer"))).toThrow(/duas vezes/);
		expect(mal((a) => (a.tarefas = [{ id: "t", titulo: "x", coluna: "sumiu", ordem: 0, criadaEm: "a", alteradaEm: "a" }]))).toThrow(/coluna que não existe/);
		expect(mal((a) => (a.tarefas = [{ id: "t", titulo: "x", coluna: "feito", ordem: 0, criadaEm: "a", alteradaEm: "a", data: "ontem" }]))).toThrow(/data/);
		expect(mal((a) => (a.tarefas = [{ id: "t", titulo: " ", coluna: "feito", ordem: 0, criadaEm: "a", alteradaEm: "a" }]))).toThrow(/título/);
	});
});

describe("o calendário", () => {
	const materias = [
		{ id: "calculo", nome: "Cálculo I", cor: "moss" as const, provas: [{ nome: "P1", data: "2026-11-20" }, { nome: "P2", data: "2026-12-15" }] },
		{ id: "fisica", nome: "Física", cor: "amber" as const, provas: [{ nome: "P1", data: "2026-11-20" }] },
	];

	function agendaDeTeste(): Agenda {
		let agenda = agendaPadrao();
		const criar = (entrada: Parameters<typeof criarTarefa>[1], id: string) => (agenda = criarTarefa(agenda, entrada, { id, agora: AGORA }).agenda);
		criar({ titulo: "Sem data" }, "a");
		criar({ titulo: "Tarde", data: "2026-11-20", hora: "15:00", materia: "calculo" }, "b");
		criar({ titulo: "Cedo", data: "2026-11-20", hora: "08:00" }, "c");
		criar({ titulo: "Dia todo", data: "2026-11-20", materia: "fisica" }, "d");
		criar({ titulo: "Fora", data: "2027-01-01" }, "e");
		criar({ titulo: "Feita", data: "2026-11-05", coluna: "feito" }, "f");
		criar({ titulo: "Atrasada", data: "2026-10-30" }, "g");
		return agenda;
	}

	it("junta tarefas com data e provas no intervalo (inclusive nas pontas), em ordem", () => {
		const itens = itensDoCalendario(agendaDeTeste(), materias, { de: "2026-11-05", ate: "2026-11-20" });
		expect(itens.map((i) => [i.data, i.hora ?? "", i.tipo, i.titulo])).toEqual([
			["2026-11-05", "", "tarefa", "Feita"],
			["2026-11-20", "", "prova", "P1"],
			["2026-11-20", "", "prova", "P1"],
			["2026-11-20", "", "tarefa", "Dia todo"],
			["2026-11-20", "08:00", "tarefa", "Cedo"],
			["2026-11-20", "15:00", "tarefa", "Tarde"],
		]);
		expect(itens[0]).toEqual({ tipo: "tarefa", data: "2026-11-05", titulo: "Feita", feita: true, id: "f" });
		expect(itens[1]).toEqual({ tipo: "prova", data: "2026-11-20", titulo: "P1", materia: "calculo", id: "prova:calculo:2026-11-20:P1" });
		expect(itens.find((i) => i.id === "b")).toEqual({ tipo: "tarefa", data: "2026-11-20", hora: "15:00", titulo: "Tarde", materia: "calculo", feita: false, id: "b" });
	});

	it("filtra por matéria (tarefas e provas) e valida o intervalo", () => {
		const agenda = agendaDeTeste();
		const itens = itensDoCalendario(agenda, materias, { de: "2026-11-01", ate: "2026-12-31", materia: "fisica" });
		expect(itens.map((i) => i.id)).toEqual(["prova:fisica:2026-11-20:P1", "d"]);
		expect(itensDoCalendario(agenda, [], { de: "2026-11-21", ate: "2026-11-30" })).toEqual([]);
		expect(() => itensDoCalendario(agenda, materias, { de: "2026-11-21", ate: "2026-11-01" })).toThrow(/depois do fim/);
		expect(() => itensDoCalendario(agenda, materias, { de: "x", ate: "2026-11-01" })).toThrow(/AAAA-MM-DD/);
	});

	it("atrasadas e sem data só contam as abertas", () => {
		const agenda = agendaDeTeste();
		expect(tarefasAtrasadas(agenda, "2026-11-06").map((t) => t.id)).toEqual(["g"]);
		expect(tarefasAtrasadas(agenda, "2026-11-06", "calculo")).toEqual([]);
		expect(tarefasSemData(agenda).map((t) => t.id)).toEqual(["a"]);
	});
});

// ---------------------------------------------------------------------------
// O disco e os eventos
// ---------------------------------------------------------------------------

describe("no disco", () => {
	let dados = "";

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-agenda-"));
	});
	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	const eventosDaAgenda = async () => (await lerEventos(eventosAgenda(dados))).eventos;
	const eventosDaMateria = async (id: string) => (await lerEventos(eventosMateria(dados, id))).eventos;

	it("sem agenda.json, a padrão, e o arquivo só nasce na primeira escrita", async () => {
		expect(await lerAgenda(dados)).toEqual(agendaPadrao());
		await expect(readFile(arquivoAgenda(dados), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		await criarTarefaNoDisco(dados, { titulo: "Primeira" }, { agora: AGORA });
		const texto = await readFile(arquivoAgenda(dados), "utf8");
		expect(texto.startsWith('{\n\t"versao": 1,')).toBe(true);
		expect((await lerAgenda(dados)).tarefas.map((t) => t.titulo)).toEqual(["Primeira"]);
		// Nenhum temporário sobra ao lado.
		expect(await readdir(join(dados, "agenda"))).toEqual(expect.not.arrayContaining([expect.stringMatching(/\.tmp$/)]));
	});

	it("agenda.json ilegível: erro claro e nada sobrescrito", async () => {
		await mkdir(join(dados, "agenda"), { recursive: true });
		await writeFile(arquivoAgenda(dados), "{ isto não é json", "utf8");
		await expect(lerAgenda(dados)).rejects.toThrow(/Não consegui ler a agenda.*nada foi gravado por cima/);
		await expect(criarTarefaNoDisco(dados, { titulo: "x" })).rejects.toThrow(ErroAgenda);
		expect(await readFile(arquivoAgenda(dados), "utf8")).toBe("{ isto não é json");
		await writeFile(arquivoAgenda(dados), JSON.stringify({ ...agendaPadrao(), colunas: [] }), "utf8");
		await expect(lerAgenda(dados)).rejects.toThrow(/colunas/);
	});

	it("tarefa sem matéria: criou_tarefa vai para agenda/eventos.jsonl, com id e título no objeto", async () => {
		const { tarefa } = await criarTarefaNoDisco(dados, { titulo: "Pagar boleto", data: "2026-11-10", hora: "09:00" }, { sessao: "s1", agora: AGORA });
		const eventos = await eventosDaAgenda();
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({
			verbo: "criou_tarefa",
			sessao: "s1",
			ts: AGORA.toISOString(),
			objeto: { tarefa: tarefa.id, titulo: "Pagar boleto" },
			resultado: { coluna: "a-fazer", colunaNome: "A fazer", data: "2026-11-10", hora: "09:00" },
		});
		expect(eventos[0]!.objeto).not.toHaveProperty("materia");
	});

	it("tarefa com matéria: os eventos vão para o eventos.jsonl da matéria; matéria que não existe é recusada", async () => {
		const materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
		await expect(criarTarefaNoDisco(dados, { titulo: "x", materia: "fantasma" })).rejects.toThrow(/matéria "fantasma"/);
		const { tarefa } = await criarTarefaNoDisco(dados, { titulo: "Lista 1", materia }, { agora: AGORA });
		await moverTarefaNoDisco(dados, tarefa.id, "feito", undefined, { agora: DEPOIS });
		const eventos = await eventosDaMateria(materia);
		expect(eventos.map((e) => e.verbo)).toEqual(["criou_materia", "criou_tarefa", "concluiu_tarefa"]);
		expect(eventos[1]!.objeto).toEqual({ materia, tarefa: tarefa.id, titulo: "Lista 1" });
		expect(await eventosDaAgenda()).toEqual([]);
	});

	it("mover: moveu_tarefa, concluiu_tarefa, reabriu_tarefa; só reordenar não grava evento", async () => {
		const a = (await criarTarefaNoDisco(dados, { titulo: "A" }, { agora: AGORA })).tarefa;
		const b = (await criarTarefaNoDisco(dados, { titulo: "B" }, { agora: AGORA })).tarefa;
		await moverTarefaNoDisco(dados, a.id, "fazendo", undefined, { agora: DEPOIS });
		await moverTarefaNoDisco(dados, a.id, "feito", undefined, { agora: DEPOIS });
		await moverTarefaNoDisco(dados, a.id, "a-fazer", 0, { agora: DEPOIS });
		await moverTarefaNoDisco(dados, b.id, "a-fazer", 0, { agora: DEPOIS });
		await moverTarefaNoDisco(dados, b.id, "a-fazer", 0, { agora: DEPOIS });
		const eventos = (await eventosDaAgenda()).filter((e) => e.verbo !== "criou_tarefa");
		expect(eventos.map((e) => [e.verbo, (e.resultado as { de: string }).de, (e.resultado as { para: string }).para])).toEqual([
			["moveu_tarefa", "a-fazer", "fazendo"],
			["concluiu_tarefa", "fazendo", "feito"],
			["reabriu_tarefa", "feito", "a-fazer"],
		]);
		expect(eventos[0]!.resultado).toMatchObject({ deNome: "A fazer", paraNome: "Fazendo" });
		const salva = await lerAgenda(dados);
		expect(salva.tarefas.find((t) => t.id === a.id)).not.toHaveProperty("concluidaEm");
		expect(titulosDa(salva, "a-fazer")).toEqual(["B", "A"]);
	});

	it("editar: editou_tarefa com o que mudou e o de antes; sem mudança não grava nada", async () => {
		const { tarefa } = await criarTarefaNoDisco(dados, { titulo: "Estudar", nota: "n" }, { agora: AGORA });
		const antesDoArquivo = await readFile(arquivoAgenda(dados), "utf8");
		await editarTarefaNoDisco(dados, tarefa.id, { titulo: "Estudar" }, { agora: DEPOIS });
		expect(await readFile(arquivoAgenda(dados), "utf8")).toBe(antesDoArquivo);
		await editarTarefaNoDisco(dados, tarefa.id, { titulo: "Estudar limites", nota: null, data: "2026-11-09" }, { agora: DEPOIS });
		const eventos = (await eventosDaAgenda()).filter((e) => e.verbo === "editou_tarefa");
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({
			objeto: { tarefa: tarefa.id, titulo: "Estudar limites" },
			resultado: { mudou: { titulo: "Estudar limites", nota: null, data: "2026-11-09" }, antes: { titulo: "Estudar", nota: "n", data: null } },
		});
	});

	it("trocar a matéria: o evento vai para a matéria nova e cita a antiga; sem matéria nova, para o da agenda", async () => {
		const calculo = (await criarMateria(dados, { nome: "Cálculo I" })).id;
		const fisica = (await criarMateria(dados, { nome: "Física" })).id;
		const { tarefa } = await criarTarefaNoDisco(dados, { titulo: "Lista", materia: calculo }, { agora: AGORA });
		await editarTarefaNoDisco(dados, tarefa.id, { materia: fisica }, { agora: DEPOIS });
		expect((await eventosDaMateria(calculo)).map((e) => e.verbo)).toEqual(["criou_materia", "criou_tarefa"]);
		const novo = (await eventosDaMateria(fisica)).at(-1)!;
		expect(novo).toMatchObject({ verbo: "editou_tarefa", objeto: { materia: fisica, tarefa: tarefa.id }, resultado: { mudou: { materia: fisica }, antes: { materia: calculo } } });
		await editarTarefaNoDisco(dados, tarefa.id, { materia: null }, { agora: DEPOIS });
		expect((await eventosDaAgenda()).map((e) => [e.verbo, (e.resultado as { antes: { materia: string } }).antes.materia])).toEqual([["editou_tarefa", fisica]]);
	});

	it("matéria que sumiu do disco: o evento vai para agenda/eventos.jsonl e a pasta dela não volta", async () => {
		const materia = (await criarMateria(dados, { nome: "Velha" })).id;
		const { tarefa } = await criarTarefaNoDisco(dados, { titulo: "Lista", materia }, { agora: AGORA });
		await rm(join(dados, "materias", materia), { recursive: true });
		await editarTarefaNoDisco(dados, tarefa.id, { titulo: "Lista 2" }, { agora: DEPOIS });
		expect(await readdir(join(dados, "materias"))).toEqual([]);
		expect((await eventosDaAgenda()).map((e) => e.verbo)).toEqual(["editou_tarefa"]);
	});

	it("apagar: apagou_tarefa; os eventos antigos continuam", async () => {
		const materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
		const { tarefa } = await criarTarefaNoDisco(dados, { titulo: "Lista", materia, data: "2026-11-09" }, { agora: AGORA });
		await apagarTarefaNoDisco(dados, tarefa.id, { agora: DEPOIS });
		expect((await lerAgenda(dados)).tarefas).toEqual([]);
		const eventos = await eventosDaMateria(materia);
		expect(eventos.map((e) => e.verbo)).toEqual(["criou_materia", "criou_tarefa", "apagou_tarefa"]);
		expect(eventos[2]).toMatchObject({ objeto: { materia, tarefa: tarefa.id, titulo: "Lista" }, resultado: { coluna: "a-fazer", concluida: false, data: "2026-11-09" } });
		await expect(apagarTarefaNoDisco(dados, tarefa.id)).rejects.toThrow(/Não achei a tarefa/);
	});

	it("colunas: cada mudança grava alterou_quadro na agenda, com o que mudou", async () => {
		const nova = (await criarColunaNoDisco(dados, "Revisar", 1, { agora: AGORA })).coluna;
		await renomearColunaNoDisco(dados, nova.id, "Revisão", { agora: AGORA });
		await reordenarColunasNoDisco(dados, ["a-fazer", "fazendo", nova.id, "feito"], { agora: AGORA });
		await marcarFeitoNoDisco(dados, nova.id, { agora: AGORA });
		await marcarFeitoNoDisco(dados, nova.id, { agora: AGORA });
		await apagarColunaNoDisco(dados, "feito", undefined, { agora: AGORA });
		const eventos = await eventosDaAgenda();
		expect(eventos.map((e) => [e.verbo, (e.resultado as { acao: string }).acao])).toEqual([
			["alterou_quadro", "criou_coluna"],
			["alterou_quadro", "renomeou_coluna"],
			["alterou_quadro", "reordenou_colunas"],
			["alterou_quadro", "marcou_feito"],
			["alterou_quadro", "apagou_coluna"],
		]);
		expect(eventos[0]).toMatchObject({ objeto: { quadro: "agenda", coluna: nova.id, nome: "Revisar" }, resultado: { posicao: 1 } });
		expect(eventos[1]!.resultado).toMatchObject({ de: "Revisar", para: "Revisão" });
		expect(eventos[2]!.resultado).toMatchObject({ antes: expect.any(Array), depois: ["a-fazer", "fazendo", nova.id, "feito"] });
		const final = await lerAgenda(dados);
		expect(final.colunas.map((c) => [c.nome, c.feito])).toEqual([["A fazer", false], ["Fazendo", false], ["Revisão", true]]);
	});

	it("apagar coluna com tarefas: destino obrigatório e as tarefas movidas no arquivo", async () => {
		const a = (await criarTarefaNoDisco(dados, { titulo: "A", coluna: "fazendo" })).tarefa;
		await expect(apagarColunaNoDisco(dados, "fazendo", undefined)).rejects.toThrow(/Escolha para onde/);
		await apagarColunaNoDisco(dados, "fazendo", "a-fazer", { agora: AGORA });
		const agenda = await lerAgenda(dados);
		expect(agenda.tarefas.find((t) => t.id === a.id)!.coluna).toBe("a-fazer");
		const evento = (await eventosDaAgenda()).at(-1)!;
		expect(evento.resultado).toMatchObject({ acao: "apagou_coluna", destino: "a-fazer", movidas: [a.id] });
	});

	it("gravarAgenda e lerAgenda dão a mesma agenda", async () => {
		const agenda = comTarefas(["A", "B"]);
		await gravarAgenda(dados, agenda);
		expect(await lerAgenda(dados)).toEqual(agenda);
	});

	it("as provas continuam sendo lidas na hora: mudar a prova da matéria muda o calendário", async () => {
		const materia = (await criarMateria(dados, { nome: "Cálculo I", provas: [{ nome: "P1", data: "2026-11-20" }] })).id;
		expect((await abrirAgenda(dados)).provas).toEqual([{ materia, nome: "Cálculo I", cor: "moss", prova: "P1", data: "2026-11-20" }]);
		await alterarMateria(dados, materia, { provas: [{ nome: "P1", data: "2026-11-27" }] });
		expect((await abrirAgenda(dados)).provas[0]!.data).toBe("2026-11-27");
	});
});
