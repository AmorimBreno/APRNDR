// As partes puras do calendário da agenda (calendario-tela.ts): as semanas do
// mês, a semana de um dia, os nomes em pt-BR, os itens de cada dia, as cores,
// os prazos e as teclas da grade.

import { describe, expect, it } from "vitest";
import { type Agenda, agendaPadrao, criarTarefa, moverTarefa, type ProvaDaAgenda } from "../../lib/agenda-tipos.ts";
import {
	capitalizar,
	descricaoDoDia,
	diaDaSemana,
	diasEntre,
	diaVizinho,
	inicioDaSemana,
	INICIAIS_DOS_DIAS,
	itensDaGrade,
	itensDaSemana,
	itensDoIntervalo,
	mesDaData,
	mesmoDiaEmOutroMes,
	NOMES_CURTOS_DOS_DIAS,
	NOMES_DOS_DIAS,
	NOMES_DOS_MESES,
	nomeDaMateria,
	nomeDoMes,
	pontosDoDia,
	prazoDaData,
	prazoDoItem,
	semanaDe,
	semanasDoMes,
	somarMeses,
	tituloDoDia,
	tomDaMateria,
	tomDoItem,
	ultimoDiaDoMes,
} from "./calendario-tela.ts";

const materias = [
	{ id: "calculo", nome: "Cálculo I", cor: "moss" as const },
	{ id: "fisica", nome: "Física", cor: "ink" as const },
];

function agendaDeTeste(): Agenda {
	let agenda = agendaPadrao();
	const entradas = [
		{ titulo: "Lista 3", data: "2026-11-10", hora: "14:00", materia: "calculo" },
		{ titulo: "Resumo", data: "2026-11-10", materia: "fisica" },
		{ titulo: "Ler capítulo", data: "2026-11-30" },
		{ titulo: "Sem data", materia: "calculo" },
		{ titulo: "Em outubro", data: "2026-10-30", materia: "calculo" },
		{ titulo: "Feita", data: "2026-11-11", materia: "calculo" },
	];
	for (const [indice, entrada] of entradas.entries()) {
		agenda = criarTarefa(agenda, entrada, { id: `t${indice}`, agora: new Date("2026-11-03T12:00:00Z") }).agenda;
	}
	return moverTarefa(agenda, "t5", "feito").agenda;
}

const provas: ProvaDaAgenda[] = [
	{ materia: "calculo", nome: "Cálculo I", cor: "moss", prova: "P1", data: "2026-11-10" },
	{ materia: "fisica", nome: "Física", cor: "ink", prova: "P1", data: "2026-12-02" },
];

describe("meses e semanas", () => {
	it("mês, último dia e somar meses", () => {
		expect(mesDaData("2026-11-03")).toBe("2026-11");
		expect(ultimoDiaDoMes("2026-11")).toBe("2026-11-30");
		expect(ultimoDiaDoMes("2028-02")).toBe("2028-02-29");
		expect(somarMeses("2026-11", 1)).toBe("2026-12");
		expect(somarMeses("2026-11", 2)).toBe("2027-01");
		expect(somarMeses("2026-01", -1)).toBe("2025-12");
		expect(somarMeses("2026-03", -15)).toBe("2024-12");
	});

	it("o mesmo dia em outro mês não passa do fim do mês", () => {
		expect(mesmoDiaEmOutroMes("2026-01-31", 1)).toBe("2026-02-28");
		expect(mesmoDiaEmOutroMes("2026-03-15", -1)).toBe("2026-02-15");
		expect(mesmoDiaEmOutroMes("2026-12-10", 1)).toBe("2027-01-10");
	});

	it("o dia da semana começa na segunda", () => {
		expect(diaDaSemana("2026-11-02")).toBe(0);
		expect(diaDaSemana("2026-11-03")).toBe(1);
		expect(diaDaSemana("2026-11-08")).toBe(6);
		expect(inicioDaSemana("2026-11-08")).toBe("2026-11-02");
		expect(inicioDaSemana("2026-11-02")).toBe("2026-11-02");
	});

	it("a semana de um dia, de segunda a domingo, atravessando o mês", () => {
		expect(semanaDe("2026-11-05")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
		expect(semanaDe("2026-12-01")[0]).toBe("2026-11-30");
		expect(semanaDe("2026-12-01")[6]).toBe("2026-12-06");
	});

	it("diasEntre conta dias inteiros, também na virada do ano", () => {
		expect(diasEntre("2026-11-03", "2026-11-04")).toBe(1);
		expect(diasEntre("2026-11-03", "2026-11-02")).toBe(-1);
		expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
		expect(diasEntre("2026-03-01", "2026-03-01")).toBe(0);
	});

	it("novembro de 2026 tem seis semanas (começa num domingo), de 26/10 a 6/12, com os dias de fora marcados", () => {
		const semanas = semanasDoMes("2026-11");
		expect(semanas).toHaveLength(6);
		expect(semanas.every((semana) => semana.length === 7)).toBe(true);
		expect(semanas[0]![0]).toEqual({ data: "2026-10-26", dia: 26, doMes: false });
		expect(semanas[0]![6]).toEqual({ data: "2026-11-01", dia: 1, doMes: true });
		expect(semanas[5]![0]).toEqual({ data: "2026-11-30", dia: 30, doMes: true });
		expect(semanas[5]![6]).toEqual({ data: "2026-12-06", dia: 6, doMes: false });
		expect(semanas.flat().filter((dia) => dia.doMes)).toHaveLength(30);
	});

	it("dezembro de 2026 tem cinco semanas, de 30/11 a 3/1", () => {
		const semanas = semanasDoMes("2026-12");
		expect(semanas).toHaveLength(5);
		expect(semanas[0]![0].data).toBe("2026-11-30");
		expect(semanas[4]![6].data).toBe("2027-01-03");
	});

	it("um mês que começa na segunda e termina no domingo tem só as semanas dele (fevereiro de 2027: quatro)", () => {
		const semanas = semanasDoMes("2027-02");
		expect(semanas).toHaveLength(4);
		expect(semanas.flat().every((dia) => dia.doMes)).toBe(true);
	});

	it("com seisSemanas, sempre seis", () => {
		expect(semanasDoMes("2027-02", { seisSemanas: true })).toHaveLength(6);
		expect(semanasDoMes("2026-12", { seisSemanas: true })).toHaveLength(6);
		// Um mês que já precisa de seis (maio de 2027 começa num sábado e termina num segundo domingo).
		expect(semanasDoMes("2027-05", { seisSemanas: true })).toHaveLength(6);
		expect(semanasDoMes("2027-05")).toHaveLength(6);
		// As datas seguem uma sequência sem buracos.
		const datas = semanasDoMes("2026-12", { seisSemanas: true }).flat().map((dia) => dia.data);
		expect(datas).toHaveLength(42);
		expect(new Set(datas).size).toBe(42);
		expect(datas[0]).toBe("2026-11-30");
		expect(datas[41]).toBe("2027-01-10");
	});
});

describe("nomes em pt-BR", () => {
	it("os meses e os dias da semana", () => {
		expect(NOMES_DOS_MESES).toHaveLength(12);
		expect(NOMES_DOS_MESES[0]).toBe("janeiro");
		expect(NOMES_DOS_MESES[2]).toBe("março");
		expect(NOMES_DOS_MESES[10]).toBe("novembro");
		expect(NOMES_DOS_DIAS).toEqual(["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]);
		expect(NOMES_CURTOS_DOS_DIAS).toEqual(["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]);
		expect(INICIAIS_DOS_DIAS).toEqual(["S", "T", "Q", "Q", "S", "S", "D"]);
	});

	it("o nome do mês com o ano", () => {
		expect(nomeDoMes("2026-11")).toBe("novembro de 2026");
		expect(capitalizar(nomeDoMes("2027-03"))).toBe("Março de 2027");
		expect(capitalizar("")).toBe("");
	});

	it("o título do dia: hoje, amanhã, ontem e os outros", () => {
		expect(tituloDoDia("2026-11-03", "2026-11-03")).toBe("Hoje, 3 de novembro");
		expect(tituloDoDia("2026-11-04", "2026-11-03")).toBe("Amanhã, 4 de novembro");
		expect(tituloDoDia("2026-11-02", "2026-11-03")).toBe("Ontem, 2 de novembro");
		expect(tituloDoDia("2026-11-11", "2026-11-03")).toBe("Quarta-feira, 11 de novembro");
		expect(tituloDoDia("2027-01-04", "2026-11-03")).toBe("Segunda-feira, 4 de janeiro de 2027");
	});
});

describe("prazos", () => {
	it("atrasada, hoje e amanhã", () => {
		expect(prazoDaData("2026-11-02", "2026-11-03")).toBe("atrasada");
		expect(prazoDaData("2026-11-03", "2026-11-03")).toBe("hoje");
		expect(prazoDaData("2026-11-04", "2026-11-03")).toBe("amanha");
		expect(prazoDaData("2026-11-05", "2026-11-03")).toBeUndefined();
		expect(prazoDaData(undefined, "2026-11-03")).toBeUndefined();
	});

	it("amanhã vale na virada do mês e do ano", () => {
		expect(prazoDaData("2026-12-01", "2026-11-30")).toBe("amanha");
		expect(prazoDaData("2027-01-01", "2026-12-31")).toBe("amanha");
	});

	it("tarefa feita não tem prazo; prova que passou não está atrasada", () => {
		expect(prazoDaData("2026-11-02", "2026-11-03", false)).toBeUndefined();
		expect(prazoDoItem({ tipo: "tarefa", data: "2026-11-02", feita: true }, "2026-11-03")).toBeUndefined();
		expect(prazoDoItem({ tipo: "tarefa", data: "2026-11-02", feita: false }, "2026-11-03")).toBe("atrasada");
		expect(prazoDoItem({ tipo: "prova", data: "2026-11-02" }, "2026-11-03")).toBeUndefined();
		expect(prazoDoItem({ tipo: "prova", data: "2026-11-04" }, "2026-11-03")).toBe("amanha");
	});
});

describe("itens de cada dia", () => {
	const agenda = agendaDeTeste();

	it("agrupa por dia: a prova antes da tarefa, a tarefa sem hora antes da com hora", () => {
		const porDia = itensDoIntervalo(agenda, provas, "2026-11-01", "2026-11-30");
		expect([...porDia.keys()]).toEqual(["2026-11-10", "2026-11-11", "2026-11-30"]);
		expect(porDia.get("2026-11-10")!.map((item) => `${item.tipo}:${item.titulo}`)).toEqual(["prova:P1", "tarefa:Resumo", "tarefa:Lista 3"]);
		expect(porDia.get("2026-11-11")![0]!.feita).toBe(true);
	});

	it("a grade traz os dias de fora do mês (a tarefa de 30/10 aparece na grade de novembro)", () => {
		const porDia = itensDaGrade(agenda, provas, semanasDoMes("2026-11"));
		expect(porDia.get("2026-10-30")!.map((item) => item.titulo)).toEqual(["Em outubro"]);
		// A grade de novembro vai até 6/12: a prova de 2/12 aparece nela, a de uma matéria só do mês seguinte não.
		expect(porDia.get("2026-12-02")![0]!.tipo).toBe("prova");
		const dezembro = itensDaGrade(agenda, provas, semanasDoMes("2026-12"));
		expect(dezembro.get("2026-12-02")![0]!.tipo).toBe("prova");
		expect(dezembro.get("2026-11-30")![0]!.titulo).toBe("Ler capítulo");
	});

	it("filtra pela matéria; vazio ou indefinido mostra todas", () => {
		const doCalculo = itensDoIntervalo(agenda, provas, "2026-11-01", "2026-11-30", "calculo");
		expect([...doCalculo.values()].flat().map((item) => item.titulo)).toEqual(["P1", "Lista 3", "Feita"]);
		const todas = itensDoIntervalo(agenda, provas, "2026-11-01", "2026-11-30", "");
		expect([...todas.values()].flat()).toHaveLength(5);
		expect([...itensDoIntervalo(agenda, provas, "2026-11-01", "2026-11-30", undefined).values()].flat()).toHaveLength(5);
	});

	it("a semana do dia", () => {
		const semana = itensDaSemana(agenda, provas, "2026-11-12");
		expect([...semana.keys()]).toEqual(["2026-11-10", "2026-11-11"]);
	});

	it("sem semanas, nenhum item", () => {
		expect(itensDaGrade(agenda, provas, []).size).toBe(0);
	});
});

describe("cores", () => {
	it("o tom é o da matéria; tarefa sem matéria e matéria que sumiu são neutras", () => {
		expect(tomDaMateria("calculo", materias)).toBe("moss");
		expect(tomDaMateria("fisica", materias)).toBe("ink");
		expect(tomDaMateria(undefined, materias)).toBe("neutro");
		expect(tomDaMateria("apagada", materias)).toBe("neutro");
		expect(tomDoItem({ materia: "calculo" }, materias)).toBe("moss");
		expect(tomDoItem({}, materias)).toBe("neutro");
	});

	it("os pontinhos: um por item, até três, com a prova e o feito marcados", () => {
		const agenda = agendaDeTeste();
		const itens = itensDoIntervalo(agenda, provas, "2026-11-10", "2026-11-11").get("2026-11-10")!;
		expect(pontosDoDia(itens, materias)).toEqual([
			{ tom: "moss", feita: false, prova: true },
			{ tom: "ink", feita: false, prova: false },
			{ tom: "moss", feita: false, prova: false },
		]);
		expect(pontosDoDia(itens, materias, 2)).toHaveLength(2);
		expect(pontosDoDia(undefined, materias)).toEqual([]);
		const feito = itensDoIntervalo(agenda, provas, "2026-11-11", "2026-11-11").get("2026-11-11")!;
		expect(pontosDoDia(feito, materias)[0]!.feita).toBe(true);
	});

	it("o nome da matéria", () => {
		expect(nomeDaMateria("calculo", materias)).toBe("Cálculo I");
		expect(nomeDaMateria("apagada", materias)).toBe("apagada");
		expect(nomeDaMateria(undefined, materias)).toBeUndefined();
	});
});

describe("descrição e teclas da grade", () => {
	it("o texto do dia para o leitor de tela", () => {
		const itens = itensDoIntervalo(agendaDeTeste(), provas, "2026-11-10", "2026-11-10").get("2026-11-10")!;
		expect(descricaoDoDia("2026-11-10", itens, "2026-11-03")).toBe("terça-feira, 10 de novembro, 3 itens");
		expect(descricaoDoDia("2026-11-03", undefined, "2026-11-03")).toBe("terça-feira, 3 de novembro, hoje, sem itens");
		expect(descricaoDoDia("2026-11-12", itens.slice(0, 1), "2026-11-03")).toContain("1 item");
	});

	it("as setas andam um dia ou uma semana, PageUp e PageDown um mês, Home e End as pontas da semana", () => {
		expect(diaVizinho("2026-11-03", "ArrowLeft")).toBe("2026-11-02");
		expect(diaVizinho("2026-11-03", "ArrowRight")).toBe("2026-11-04");
		expect(diaVizinho("2026-11-03", "ArrowUp")).toBe("2026-10-27");
		expect(diaVizinho("2026-11-03", "ArrowDown")).toBe("2026-11-10");
		expect(diaVizinho("2026-11-30", "PageDown")).toBe("2026-12-30");
		expect(diaVizinho("2026-03-31", "PageUp")).toBe("2026-02-28");
		expect(diaVizinho("2026-11-05", "Home")).toBe("2026-11-02");
		expect(diaVizinho("2026-11-05", "End")).toBe("2026-11-08");
		expect(diaVizinho("2026-11-05", "a")).toBeUndefined();
	});
});
