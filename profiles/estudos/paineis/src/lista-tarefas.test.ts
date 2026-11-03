// As partes puras da lista de tarefas (lista-tarefas.ts): os grupos por prazo, os
// filtros, a data curta e a criação rápida.

import { describe, expect, it } from "vitest";
import { type Agenda, agendaPadrao, criarColuna, criarTarefa, LIMITE_NOME_COLUNA, LIMITE_TITULO, moverTarefa } from "../../lib/agenda-tipos.ts";
import {
	criacaoRapida,
	dataCurta,
	erroDoNomeDeColuna,
	grupoDaTarefa,
	gruposDaLista,
	nomeDeColunaAparado,
	opcoesDeColuna,
	ORDEM_DOS_GRUPOS,
	prazoCurto,
	totalDosGrupos,
} from "./lista-tarefas.ts";

// 2026-11-04 é uma quarta-feira: a semana vai de 2026-11-02 a 2026-11-08.
const HOJE = "2026-11-04";
const agora = new Date("2026-11-03T12:00:00Z");

function agendaDeTeste(): Agenda {
	let agenda = agendaPadrao();
	const nova = (id: string, titulo: string, resto: { data?: string; hora?: string; materia?: string; coluna?: string } = {}) => {
		agenda = criarTarefa(agenda, { titulo, ...resto }, { id, agora }).agenda;
	};
	nova("velha", "Velha", { data: "2026-11-01", materia: "calculo" });
	nova("hoje-tarde", "Hoje à tarde", { data: HOJE, hora: "15:00" });
	nova("hoje-manha", "Hoje de manhã", { data: HOJE, hora: "08:00" });
	nova("hoje-solta", "Hoje sem hora", { data: HOJE });
	nova("amanha", "Amanhã", { data: "2026-11-05", materia: "calculo" });
	nova("sexta", "Sexta", { data: "2026-11-06" });
	nova("domingo", "Domingo", { data: "2026-11-08" });
	nova("segunda", "Segunda que vem", { data: "2026-11-09" });
	nova("ano-que-vem", "Ano que vem", { data: "2027-02-01" });
	nova("sem-data-1", "Sem data 1", { materia: "calculo" });
	nova("sem-data-2", "Sem data 2", { coluna: "fazendo" });
	nova("pronta", "Pronta", { data: "2026-11-02", coluna: "feito" });
	return agenda;
}

const ids = (grupo: { tarefas: Array<{ id: string }> } | undefined) => grupo?.tarefas.map((tarefa) => tarefa.id);

describe("o grupo de uma tarefa", () => {
	it("as feitas ficam juntas, com data ou sem", () => {
		expect(grupoDaTarefa({ data: "2020-01-01" }, true, HOJE)).toBe("feitas");
		expect(grupoDaTarefa({}, true, HOJE)).toBe("feitas");
	});

	it("separa por prazo", () => {
		expect(grupoDaTarefa({}, false, HOJE)).toBe("sem-data");
		expect(grupoDaTarefa({ data: "2026-11-03" }, false, HOJE)).toBe("atrasadas");
		expect(grupoDaTarefa({ data: HOJE }, false, HOJE)).toBe("hoje");
		expect(grupoDaTarefa({ data: "2026-11-05" }, false, HOJE)).toBe("amanha");
		expect(grupoDaTarefa({ data: "2026-11-06" }, false, HOJE)).toBe("semana");
		expect(grupoDaTarefa({ data: "2026-11-08" }, false, HOJE)).toBe("semana");
		expect(grupoDaTarefa({ data: "2026-11-09" }, false, HOJE)).toBe("depois");
	});

	it("num domingo, o dia seguinte já é de outra semana: vai para mais tarde", () => {
		expect(grupoDaTarefa({ data: "2026-11-09" }, false, "2026-11-08")).toBe("amanha");
		expect(grupoDaTarefa({ data: "2026-11-10" }, false, "2026-11-08")).toBe("depois");
	});

	it("virando o ano", () => {
		expect(grupoDaTarefa({ data: "2027-01-01" }, false, "2026-12-31")).toBe("amanha");
		expect(grupoDaTarefa({ data: "2027-01-03" }, false, "2026-12-31")).toBe("semana");
	});
});

describe("os grupos da lista", () => {
	it("na ordem de prazo, sem os vazios, com as feitas no fim", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { mostrarFeitas: true });
		expect(grupos.map((grupo) => grupo.id)).toEqual(["atrasadas", "hoje", "amanha", "semana", "depois", "sem-data", "feitas"]);
		expect(grupos.map((grupo) => grupo.rotulo)).toEqual(["Atrasadas", "Hoje", "Amanhã", "Esta semana", "Mais tarde", "Sem data", "Feitas"]);
		expect(ORDEM_DOS_GRUPOS).toHaveLength(7);
	});

	it("dentro do dia, os sem hora primeiro e depois por hora", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { mostrarFeitas: false });
		expect(ids(grupos.find((grupo) => grupo.id === "hoje"))).toEqual(["hoje-solta", "hoje-manha", "hoje-tarde"]);
		expect(ids(grupos.find((grupo) => grupo.id === "semana"))).toEqual(["sexta", "domingo"]);
		expect(ids(grupos.find((grupo) => grupo.id === "depois"))).toEqual(["segunda", "ano-que-vem"]);
	});

	it("as sem data seguem a ordem do quadro (coluna e depois posição)", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { mostrarFeitas: false });
		expect(ids(grupos.find((grupo) => grupo.id === "sem-data"))).toEqual(["sem-data-1", "sem-data-2"]);
	});

	it("sem mostrar as feitas, o grupo some", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { mostrarFeitas: false });
		expect(grupos.some((grupo) => grupo.id === "feitas")).toBe(false);
	});

	it("as feitas: a concluída há menos tempo primeiro", () => {
		let agenda = agendaDeTeste();
		agenda = moverTarefa(agenda, "velha", "feito", undefined, { agora: new Date("2026-11-03T15:00:00Z") }).agenda;
		const grupos = gruposDaLista(agenda, HOJE, { mostrarFeitas: true });
		expect(ids(grupos.find((grupo) => grupo.id === "feitas"))).toEqual(["velha", "pronta"]);
	});

	it("o filtro de matéria vale para todos os grupos", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { materia: "calculo", mostrarFeitas: true });
		expect(grupos.map((grupo) => [grupo.id, ids(grupo)])).toEqual([
			["atrasadas", ["velha"]],
			["amanha", ["amanha"]],
			["sem-data", ["sem-data-1"]],
		]);
	});

	it("o filtro de coluna", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { coluna: "fazendo", mostrarFeitas: true });
		expect(grupos.map((grupo) => [grupo.id, ids(grupo)])).toEqual([["sem-data", ["sem-data-2"]]]);
	});

	it("escolher a coluna de feito mostra as feitas mesmo sem 'Mostrar feitas'", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { coluna: "feito", mostrarFeitas: false });
		expect(grupos.map((grupo) => [grupo.id, ids(grupo)])).toEqual([["feitas", ["pronta"]]]);
	});

	it("uma agenda sem tarefas não tem grupos", () => {
		expect(gruposDaLista(agendaPadrao(), HOJE, { mostrarFeitas: true })).toEqual([]);
	});

	it("totalDosGrupos soma as tarefas", () => {
		const grupos = gruposDaLista(agendaDeTeste(), HOJE, { mostrarFeitas: true });
		expect(totalDosGrupos(grupos)).toBe(12);
	});
});

describe("o filtro de coluna", () => {
	it("Todas as colunas e uma por coluna, na ordem do quadro", () => {
		const agenda = criarColuna(agendaPadrao(), "Revisar", 1, { id: "col-revisar", agora }).agenda;
		expect(opcoesDeColuna(agenda.colunas)).toEqual([
			{ value: "", label: "Todas as colunas" },
			{ value: "a-fazer", label: "A fazer" },
			{ value: "col-revisar", label: "Revisar" },
			{ value: "fazendo", label: "Fazendo" },
			{ value: "feito", label: "Feito" },
		]);
	});
});

describe("a data curta", () => {
	it("dia e mês abreviado, sem o ponto", () => {
		expect(dataCurta("2026-11-03", HOJE)).toBe("3 nov");
		expect(dataCurta("2026-03-15", HOJE)).toBe("15 mar");
		expect(dataCurta("2026-09-01", HOJE)).toBe("1 set");
	});

	it("com o ano quando não é o de hoje", () => {
		expect(dataCurta("2027-02-01", HOJE)).toBe("1 fev 2027");
		expect(dataCurta("2027-02-01")).toBe("1 fev");
	});

	it("o prazo junta a hora", () => {
		expect(prazoCurto({ data: "2026-11-03", hora: "14:00" }, HOJE)).toBe("3 nov, 14:00");
		expect(prazoCurto({ data: "2026-11-03" }, HOJE)).toBe("3 nov");
		expect(prazoCurto({}, HOJE)).toBeUndefined();
	});
});

describe("a criação rápida", () => {
	it("o título aparado, a matéria do filtro e a primeira coluna que não é de feito", () => {
		expect(criacaoRapida(agendaPadrao(), "  Ler   o capítulo 3 ", { materia: "calculo" })).toEqual({
			entrada: { titulo: "Ler o capítulo 3", coluna: "a-fazer", materia: "calculo" },
		});
	});

	it("sem matéria no filtro, sem matéria na tarefa", () => {
		expect(criacaoRapida(agendaPadrao(), "Algo")).toEqual({ entrada: { titulo: "Algo", coluna: "a-fazer" } });
	});

	it("a coluna dada vale mais que a padrão", () => {
		expect(criacaoRapida(agendaPadrao(), "Algo", { coluna: "fazendo" })).toEqual({ entrada: { titulo: "Algo", coluna: "fazendo" } });
	});

	it("a primeira coluna que não é de feito, mesmo se a de feito vem antes", () => {
		let agenda = agendaPadrao();
		agenda = criarColuna(agenda, "Primeira", 0, { id: "col-primeira", agora }).agenda;
		expect(criacaoRapida(agenda, "Algo")).toEqual({ entrada: { titulo: "Algo", coluna: "col-primeira" } });
	});

	it("título vazio ou grande demais é erro", () => {
		expect(criacaoRapida(agendaPadrao(), "   ")).toEqual({ erro: "Escreva o título da tarefa." });
		expect(criacaoRapida(agendaPadrao(), "x".repeat(LIMITE_TITULO + 1))).toEqual({ erro: `O título da tarefa pode ter até ${LIMITE_TITULO} caracteres.` });
	});
});

describe("o nome da coluna", () => {
	it("aparado e com os espaços juntos", () => {
		expect(nomeDeColunaAparado("  Em   revisão ")).toBe("Em revisão");
	});

	it("vazio e grande demais são erros", () => {
		expect(erroDoNomeDeColuna("  ")).toBe("Escreva o nome da coluna.");
		expect(erroDoNomeDeColuna("x".repeat(LIMITE_NOME_COLUNA + 1))).toBe(`O nome da coluna pode ter até ${LIMITE_NOME_COLUNA} caracteres.`);
		expect(erroDoNomeDeColuna("Revisar")).toBeUndefined();
	});
});
