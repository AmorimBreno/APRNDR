// Testes do esqueleto do guia de cursos (item 5, parte C): as regras puras
// (conserto da proposta do modelo, validação estrita da edição, calendário,
// operações de edição da tela, podeCriar, resumo, a etapa no curso-tipos) e o
// disco numa pasta de dados temporária com uma matéria (curso.json, eventos e
// a mensagem para o modelo).

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { caminhoDoCurso, confirmarEtapa, type Curso, ErroCurso, gravarCurso, lerCurso, novoCurso, oQueInvalida, validarEtapa } from "./cursos.ts";
import type { Diagnostico } from "./diagnostico.ts";
import {
	adicionarModulo,
	apagarModulo,
	calcularCalendario,
	conceitosParaOModelo,
	consertarProposta,
	criarCurso,
	diasDeEstudo,
	diasDoModulo,
	diasEntre,
	ErroEsqueleto,
	type Esqueleto,
	type EsqueletoEmAndamento,
	gravarProposta,
	horasDisponiveis,
	type Modulo,
	moverConceito,
	moverModulo,
	mudarHoras,
	mudarObjetivo,
	mudarTipo,
	NOMES_TIPO_MODULO,
	podeCriar,
	proximoIdModulo,
	recalcularCalendario,
	renomearModulo,
	resumoDoEsqueleto,
	salvarEdicao,
	somarDias,
	validarModulos,
} from "./esqueleto.ts";
import { lerEventos } from "./eventos.ts";
import { type Conceito, gravarMapa, mapaVazio } from "./mapa.ts";
import { criarMateria, eventosMateria } from "./materias.ts";

const AGORA = new Date("2026-10-22T13:00:00.000Z");
const DEPOIS = new Date("2026-10-22T14:00:00.000Z");
const HOJE = "2026-10-22";
const MODELO = "openrouter/openai/gpt-6.1-sol";

const BASICO = { nome: "P1: regressão", prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 };
const MATERIAIS = { arquivos: [{ arquivo: "aula-04.pdf", hash: "h4" }] };
const OBJETIVO = { escopo: "material_base" as const, tipo: "misto" as const, motivo: "Passar na P1." };
const CONCEITOS = ["c-a", "c-b", "c-c", "c-d"];
const MAPA = { conceitos: ["c-a", "c-b", "c-c"] };

/** Um diagnóstico concluído: c-a "sei aplicar" e errou a q1; c-b "já ouvi falar" sem questão; c-c "nunca vi". */
const DIAGNOSTICO: Diagnostico = {
	autoavaliacao: { "c-a": 3, "c-b": 1, "c-c": 0 },
	questoes: [
		{
			id: "q1",
			tipo: "alternativa",
			conceitos: ["c-a"],
			enunciado: "Sobre c-a?",
			alternativas: [{ texto: "Certa", correta: true }, { texto: "Errada", confusao: "Confunde A com B." }, { texto: "Outra", confusao: "Acha que vale sempre." }],
			explicacao: "Porque sim.",
		},
	],
	geradoEm: AGORA.toISOString(),
	modelo: MODELO,
	custo: 0.03,
	respostas: { q1: { confianca: 4, escolha: 1, correta: false, confusao: "Confunde A com B.", tempoMs: 41000, respondidaEm: AGORA.toISOString() } },
	concluidoEm: AGORA.toISOString(),
};

/** Um curso rascunho com as etapas até o Diagnóstico confirmadas (etapa esqueleto). */
function cursoNoEsqueleto(id = "p1-regressao", materia = "calculo-i"): Curso {
	let curso = novoCurso(id, materia, BASICO, AGORA);
	curso = confirmarEtapa(curso, "materiais", MATERIAIS, AGORA).curso;
	curso = confirmarEtapa(curso, "objetivo", OBJETIVO, AGORA).curso;
	curso = confirmarEtapa(curso, "mapa", MAPA, AGORA).curso;
	return confirmarEtapa(curso, "diagnostico", DIAGNOSTICO, AGORA).curso;
}

const modulo = (id: string, conceitos: string[], extra: Partial<Modulo> = {}): Modulo => ({
	id,
	nome: `Módulo ${id}`,
	objetivo: `Objetivo de ${id}.`,
	conceitos,
	tipo: "normal",
	horas: 2,
	...extra,
});

/** Três módulos válidos para MAPA: m1 com c-a e c-b, m2 com c-c. */
const MODULOS: Modulo[] = [modulo("m1", ["c-a", "c-b"], { horas: 3 }), modulo("m2", ["c-c"], { tipo: "revisao" })];

const emAndamento = (modulos: Modulo[] = MODULOS): EsqueletoEmAndamento => ({ modulos: structuredClone(modulos), geradoEm: AGORA.toISOString(), modelo: MODELO, custo: 0.02 });

const doModelo = (nome: string, conceitos: unknown, extra: Record<string, unknown> = {}) => ({ nome, objetivo: `Objetivo de ${nome}.`, conceitos, tipo: "normal", horas: 2, ...extra });

describe("nomes", () => {
	it("dos tipos de módulo", () => {
		expect(NOMES_TIPO_MODULO).toEqual({ normal: "Normal", curto: "Curto", revisao: "Revisão" });
	});
});

describe("consertarProposta", () => {
	it("uma proposta boa: módulos na ordem, ids m1…, campos limpos", () => {
		const modulos = consertarProposta(
			{
				modulos: [
					doModelo("  A   reta  ", ["c-a", "c-b"], { objetivo: " Ajustar  a reta. ", horas: 3 }),
					doModelo("Resíduos", ["c-c", "c-d"], { tipo: "curto", horas: 1.5 }),
				],
			},
			CONCEITOS,
		);
		expect(modulos).toEqual([
			{ id: "m1", nome: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-a", "c-b"], tipo: "normal", horas: 3 },
			{ id: "m2", nome: "Resíduos", objetivo: "Objetivo de Resíduos.", conceitos: ["c-c", "c-d"], tipo: "curto", horas: 1.5 },
		]);
	});

	it("só ids do curso; um conceito repetido fica no primeiro módulo em que apareceu", () => {
		const modulos = consertarProposta(
			{ modulos: [doModelo("Um", ["c-a", "c-x", " c-b ", "c-a"]), doModelo("Dois", ["c-b", "c-c", 7, "c-d"])] },
			CONCEITOS,
		);
		expect(modulos.map((item) => item.conceitos)).toEqual([["c-a", "c-b"], ["c-c", "c-d"]]);
	});

	it("o conceito que faltou entra no módulo do anterior a ele na ordem do curso, logo depois dele; sem anterior, no começo do primeiro", () => {
		const meio = consertarProposta({ modulos: [doModelo("Um", ["c-a", "c-d"]), doModelo("Dois", ["c-b"])] }, CONCEITOS);
		// c-c faltou: o anterior a ele no curso é c-b (módulo Dois).
		expect(meio.map((item) => item.conceitos)).toEqual([["c-a", "c-d"], ["c-b", "c-c"]]);
		const comeco = consertarProposta({ modulos: [doModelo("Um", ["c-c"]), doModelo("Dois", ["c-d"])] }, CONCEITOS);
		// c-a e c-b faltaram e não têm anterior colocado: c-a vai para o começo do primeiro, c-b logo depois de c-a.
		expect(comeco.map((item) => item.conceitos)).toEqual([["c-a", "c-b", "c-c"], ["c-d"]]);
	});

	it("módulos vazios (ou só com ids de fora, ou que não são objetos) saem, e os ids são refeitos", () => {
		const modulos = consertarProposta(
			{ modulos: [doModelo("Vazio", []), "lixo", doModelo("Um", ["c-a", "c-b"]), doModelo("Fora", ["c-x"]), doModelo("Sem lista", "c-c"), doModelo("Dois", ["c-c", "c-d"])] },
			CONCEITOS,
		);
		expect(modulos.map((item) => [item.id, item.nome])).toEqual([["m1", "Um"], ["m2", "Dois"]]);
	});

	it("tipo fora do permitido vira normal; horas fora de 0,5 a 40 viram 2; as outras vão para o passo de 0,5", () => {
		const casos: Array<[unknown, number]> = [
			["3", 2],
			[0.2, 2],
			[41, 2],
			[Number.NaN, 2],
			[undefined, 2],
			[2.3, 2.5],
			[0.6, 0.5],
			[0.74, 0.5],
			[39.9, 40],
			[40, 40],
			[0.5, 0.5],
		];
		for (const [horas, esperado] of casos) {
			const [primeiro] = consertarProposta({ modulos: [doModelo("Um", ["c-a", "c-b"], { horas, tipo: "avancado" }), doModelo("Dois", ["c-c", "c-d"])] }, CONCEITOS);
			expect([horas, primeiro!.horas]).toEqual([horas, esperado]);
			expect(primeiro!.tipo).toBe("normal");
		}
	});

	it("nome vazio vira Módulo N; objetivo ausente vira vazio", () => {
		const modulos = consertarProposta({ modulos: [doModelo("Um", ["c-a", "c-b"]), { conceitos: ["c-c", "c-d"], nome: "   " }] }, CONCEITOS);
		expect(modulos[1]).toEqual({ id: "m2", nome: "Módulo 2", objetivo: "", conceitos: ["c-c", "c-d"], tipo: "normal", horas: 2 });
	});

	it("fora de 2 a 12 módulos é erro; num curso de um conceito só, 1 módulo vale", () => {
		expect(() => consertarProposta({}, CONCEITOS)).toThrow(/falta "modulos"/);
		expect(() => consertarProposta({ modulos: "x" }, CONCEITOS)).toThrow(ErroEsqueleto);
		expect(() => consertarProposta({ modulos: [] }, CONCEITOS)).toThrow(/devolveu 0 módulos.*de 2 a 12/);
		expect(() => consertarProposta({ modulos: [doModelo("Um", CONCEITOS)] }, CONCEITOS)).toThrow(/devolveu 1 módulo com conceitos do curso; o esqueleto precisa de 2 a 12/);
		const muitos = Array.from({ length: 13 }, (_, indice) => `k${indice}`);
		expect(() => consertarProposta({ modulos: muitos.map((id) => doModelo(id, [id])) }, muitos)).toThrow(/13 módulos/);
		expect(consertarProposta({ modulos: muitos.slice(0, 12).map((id) => doModelo(id, [id])) }, muitos)).toHaveLength(12);
		expect(consertarProposta({ modulos: [doModelo("Só", ["c-a"])] }, ["c-a"])).toHaveLength(1);
	});

	it("o erro é um ErroCurso (a extensão mostra a frase)", () => {
		expect(() => consertarProposta(null, CONCEITOS)).toThrow(ErroCurso);
	});
});

describe("validarModulos", () => {
	it("aceita os módulos válidos e devolve limpos, na ordem do formato", () => {
		const entrada = [{ horas: 3, tipo: "normal", conceitos: ["c-b", "c-a"], objetivo: "  Um  objetivo ", nome: "  A  reta ", id: "m3" }, modulo("m1", ["c-c"])];
		expect(validarModulos(entrada, MAPA.conceitos)).toEqual([
			{ id: "m3", nome: "A reta", objetivo: "Um objetivo", conceitos: ["c-b", "c-a"], tipo: "normal", horas: 3 },
			modulo("m1", ["c-c"]),
		]);
		expect(validarModulos([modulo("m1", MAPA.conceitos, { objetivo: undefined as never })], MAPA.conceitos)[0]!.objetivo).toBe("");
	});

	const erros: Array<[string, unknown, RegExp]> = [
		["não é lista", "x", /lista de módulos/],
		["vazia", [], /pelo menos um módulo/],
		["mais de 12", Array.from({ length: 13 }, (_, indice) => modulo(`m${indice + 1}`, ["c-a"])), /até 12 módulos/],
		["módulo que não é objeto", [7], /módulo 1 não está no formato/],
		["id inválido", [modulo("x1", MAPA.conceitos)], /sem id válido/],
		["id repetido", [modulo("m1", ["c-a"]), modulo("m1", ["c-b", "c-c"])], /mesmo id \(m1\)/],
		["nome vazio", [modulo("m1", MAPA.conceitos, { nome: "  " })], /Dê um nome ao módulo 1/],
		["objetivo que não é texto", [modulo("m1", MAPA.conceitos, { objetivo: 3 as never })], /objetivo do módulo 1 precisa ser um texto/],
		["tipo inválido", [modulo("m1", MAPA.conceitos, { tipo: "avancado" as never })], /tipo do módulo 1/],
		["horas fora do passo", [modulo("m1", MAPA.conceitos, { horas: 0.75 })], /horas do módulo 1/],
		["horas abaixo", [modulo("m1", MAPA.conceitos, { horas: 0 })], /horas do módulo 1/],
		["horas acima", [modulo("m1", MAPA.conceitos, { horas: 40.5 })], /horas do módulo 1/],
		["horas em texto", [modulo("m1", MAPA.conceitos, { horas: "2" as never })], /horas do módulo 1/],
		["sem lista de conceitos", [{ ...modulo("m1", []), conceitos: "c-a" }], /lista dos ids dos conceitos/],
		["módulo vazio", [modulo("m1", MAPA.conceitos), modulo("m2", [])], /módulo 2 \("Módulo m2"\) está sem conceitos/],
		["conceito de fora", [modulo("m1", [...MAPA.conceitos, "c-x"])], /um conceito que não é do curso: c-x/],
		["conceito em dois módulos", [modulo("m1", ["c-a", "c-b"]), modulo("m2", ["c-b", "c-c"])], /c-b está em dois módulos \(1 e 2\)/],
		["conceito duas vezes no mesmo módulo", [modulo("m1", ["c-a", "c-b", "c-a", "c-c"])], /c-a aparece duas vezes no módulo 1/],
		["conceito faltando", [modulo("m1", ["c-a"])], /2 conceitos do curso estão sem módulo: c-b, c-c/],
		["um conceito faltando", [modulo("m1", ["c-a", "c-b"])], /Um conceito do curso está sem módulo: c-c/],
	];
	for (const [nome, entrada, mensagem] of erros) {
		it(`erro: ${nome}`, () => {
			expect(() => validarModulos(entrada, MAPA.conceitos)).toThrow(mensagem);
			expect(() => validarModulos(entrada, MAPA.conceitos)).toThrow(ErroEsqueleto);
		});
	}
});

describe("datas", () => {
	it("somarDias e diasEntre atravessam meses, anos e o 29 de fevereiro", () => {
		expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
		expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
		expect(somarDias("2027-02-28", 1)).toBe("2027-03-01");
		expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
		expect(diasEntre("2026-10-22", "2026-11-20")).toBe(29);
		expect(diasEntre("2026-11-20", "2026-10-22")).toBe(-29);
		expect(() => somarDias("2026-02-30", 1)).toThrow(ErroEsqueleto);
	});

	it("diasDoModulo: ceil(horas / horas por semana × 7), pelo menos 1, sem erro de ponto flutuante", () => {
		expect(diasDoModulo(4, 4)).toBe(7);
		expect(diasDoModulo(2, 4)).toBe(4);
		expect(diasDoModulo(0.5, 4)).toBe(1);
		expect(diasDoModulo(2.5, 2.5)).toBe(7);
		expect(diasDoModulo(1.5, 3)).toBe(4);
		expect(diasDoModulo(0.5, 60)).toBe(1);
		expect(diasDoModulo(0.3, 2.1)).toBe(1);
	});
});

describe("calcularCalendario", () => {
	const hoje = "2026-10-26";

	it("sem prazo: em sequência a partir de amanhã; a avaliação no dia seguinte ao fim; a geral depois do último", () => {
		const calendario = calcularCalendario([modulo("m1", [], { horas: 4 }), modulo("m2", [], { horas: 2 })], { horasPorSemana: 4, prazo: null, hoje });
		expect(calendario).toEqual({
			modulos: [
				{ id: "m1", inicio: "2026-10-27", fim: "2026-11-02", avaliacao: "2026-11-03" },
				{ id: "m2", inicio: "2026-11-03", fim: "2026-11-06", avaliacao: "2026-11-07" },
			],
			avaliacaoGeral: "2026-11-07",
			avisos: [],
		});
		for (const item of calendario.modulos) expect(diasEntre(item.fim, item.avaliacao)).toBe(1);
	});

	it("com prazo folgado: as mesmas datas, e a avaliação geral no dia anterior ao prazo", () => {
		const calendario = calcularCalendario([modulo("m1", [], { horas: 4 }), modulo("m2", [], { horas: 2 })], { horasPorSemana: 4, prazo: "2026-12-20", hoje });
		expect(calendario.modulos.map((item) => item.fim)).toEqual(["2026-11-02", "2026-11-06"]);
		expect(calendario.avaliacaoGeral).toBe("2026-12-19");
		expect(calendario.avisos).toEqual([]);
		expect(calendario.horasPorSemanaNecessarias).toBeUndefined();
	});

	it("com prazo que cabe exatamente: sem encolher", () => {
		// 11 dias de módulos, de 27/10 a 06/11; a geral em 07/11, o prazo em 08/11.
		const calendario = calcularCalendario([modulo("m1", [], { horas: 4 }), modulo("m2", [], { horas: 2 })], { horasPorSemana: 4, prazo: "2026-11-08", hoje });
		expect(calendario.modulos.map((item) => item.fim)).toEqual(["2026-11-02", "2026-11-06"]);
		expect(calendario.avaliacaoGeral).toBe("2026-11-07");
		expect(calendario.avisos).toEqual([]);
	});

	it("com prazo apertado: o tempo é dividido na proporção das horas, em frações de dia, e o aviso traz as horas por dia e por semana", () => {
		// 14, 7 e 4 dias (25) não cabem nos 10 dias de estudo (27/10 a 05/11; a geral em 06/11, o prazo em 07/11).
		// 8, 4 e 2 h de 14: as frações acumuladas são 0; 5,71; 8,57 e 10 dias.
		const calendario = calcularCalendario([modulo("m1", [], { horas: 8 }), modulo("m2", [], { horas: 4 }), modulo("m3", [], { horas: 2 })], { horasPorSemana: 4, prazo: "2026-11-07", hoje });
		expect(calendario).toEqual({
			modulos: [
				{ id: "m1", inicio: "2026-10-27", fim: "2026-11-01", avaliacao: "2026-11-02" },
				{ id: "m2", inicio: "2026-11-01", fim: "2026-11-04", avaliacao: "2026-11-05" },
				{ id: "m3", inicio: "2026-11-04", fim: "2026-11-05", avaliacao: "2026-11-06" },
			],
			avaliacaoGeral: "2026-11-06",
			// 14 h × 7 / 10 = 9,8 → 10; 14 h / 10 = 1,4.
			horasPorSemanaNecessarias: 10,
			horasPorDiaNecessarias: 1.4,
			avisos: ["Até 06/11 (10 dias), este plano pede cerca de 1,4 h por dia (10 h por semana); você disse 4 h por semana."],
		});
	});

	it("com prazo apertado: vários módulos no mesmo dia, a avaliação nunca depois da geral, e os números do aviso com vírgula", () => {
		// 10, 0,5 e 0,5 h em 5 dias de estudo (27/10 a 31/10): o grande vai de 0 a 4,55; os pequenos cabem os dois em 31/10.
		const calendario = calcularCalendario([modulo("m1", [], { horas: 10 }), modulo("m2", [], { horas: 0.5 }), modulo("m3", [], { horas: 0.5 })], { horasPorSemana: 1, prazo: "2026-11-02", hoje });
		expect(calendario.modulos).toEqual([
			{ id: "m1", inicio: "2026-10-27", fim: "2026-10-31", avaliacao: "2026-11-01" },
			{ id: "m2", inicio: "2026-10-31", fim: "2026-10-31", avaliacao: "2026-11-01" },
			{ id: "m3", inicio: "2026-10-31", fim: "2026-10-31", avaliacao: "2026-11-01" },
		]);
		expect(calendario.avaliacaoGeral).toBe("2026-11-01");
		// 11 h × 7 / 5 = 15,4 → 15,5; 11 h / 5 = 2,2.
		expect(calendario.horasPorSemanaNecessarias).toBe(15.5);
		expect(calendario.horasPorDiaNecessarias).toBe(2.2);
		expect(calendario.avisos).toEqual(["Até 01/11 (5 dias), este plano pede cerca de 2,2 h por dia (15,5 h por semana); você disse 1 h por semana."]);
		// 5 e 5 h em 11 dias: cada um com 5,5 dias, dividindo 01/11.
		const fracionadas = calcularCalendario([modulo("m1", [], { horas: 5 }), modulo("m2", [], { horas: 5 })], { horasPorSemana: 2.5, prazo: "2026-11-08", hoje });
		expect(fracionadas.avisos).toEqual(["Até 07/11 (11 dias), este plano pede cerca de 0,9 h por dia (6,5 h por semana); você disse 2,5 h por semana."]);
		expect(fracionadas.modulos.map((item) => [item.inicio, item.fim])).toEqual([
			["2026-10-27", "2026-11-01"],
			["2026-11-01", "2026-11-06"],
		]);
	});

	it("o curso do Breno: 12 módulos e 32,5 h em 8 dias de estudo, todos até 03/11, e a avaliação geral em 04/11", () => {
		const horas = [2, 2.5, 3, 3.5, 3, 3.5, 3, 2.5, 3.5, 2, 1.5, 2.5];
		const modulos = horas.map((valor, indice) => modulo(`m${indice + 1}`, [], { horas: valor }));
		const calendario = calcularCalendario(modulos, { horasPorSemana: 4, prazo: "2026-11-05", hoje });
		expect(calendario.avaliacaoGeral).toBe("2026-11-04");
		expect(calendario.modulos.map((item) => [item.inicio, item.fim, item.avaliacao])).toEqual([
			["2026-10-27", "2026-10-27", "2026-10-28"],
			["2026-10-27", "2026-10-28", "2026-10-29"],
			["2026-10-28", "2026-10-28", "2026-10-29"],
			["2026-10-28", "2026-10-29", "2026-10-30"],
			["2026-10-29", "2026-10-30", "2026-10-31"],
			["2026-10-30", "2026-10-31", "2026-11-01"],
			["2026-10-31", "2026-11-01", "2026-11-02"],
			["2026-11-01", "2026-11-01", "2026-11-02"],
			["2026-11-01", "2026-11-02", "2026-11-03"],
			["2026-11-02", "2026-11-03", "2026-11-04"],
			["2026-11-03", "2026-11-03", "2026-11-04"],
			["2026-11-03", "2026-11-03", "2026-11-04"],
		]);
		for (const item of calendario.modulos) {
			expect(item.fim <= "2026-11-03").toBe(true);
			expect(item.inicio <= item.fim).toBe(true);
			expect(item.avaliacao <= calendario.avaliacaoGeral).toBe(true);
		}
		// Os módulos seguem em ordem: cada um começa no dia em que o anterior acaba (ou no seguinte).
		for (let indice = 1; indice < calendario.modulos.length; indice++) {
			expect(diasEntre(calendario.modulos[indice - 1]!.fim, calendario.modulos[indice]!.inicio)).toBeGreaterThanOrEqual(0);
			expect(diasEntre(calendario.modulos[indice - 1]!.fim, calendario.modulos[indice]!.inicio)).toBeLessThanOrEqual(1);
		}
		// 32,5 h / 8 dias = 4,06 → 4,1 h por dia; × 7 = 28,44 → 28,5 h por semana.
		expect(calendario.horasPorDiaNecessarias).toBe(4.1);
		expect(calendario.horasPorSemanaNecessarias).toBe(28.5);
		expect(calendario.avisos).toEqual(["Até 04/11 (8 dias), este plano pede cerca de 4,1 h por dia (28,5 h por semana); você disse 4 h por semana."]);
	});

	it("frações só pelo arredondamento dos dias, sem pedir mais horas: sem aviso", () => {
		// 3 módulos de 1 h com 4 h por semana: 2 dias cada (6), em 5 dias de estudo; pede 3 × 7 / 5 = 4,2 → 4.
		const calendario = calcularCalendario([modulo("m1", [], { horas: 1 }), modulo("m2", [], { horas: 1 }), modulo("m3", [], { horas: 1 })], { horasPorSemana: 4, prazo: "2026-11-02", hoje });
		expect(calendario.modulos.map((item) => [item.inicio, item.fim])).toEqual([
			["2026-10-27", "2026-10-28"],
			["2026-10-28", "2026-10-30"],
			["2026-10-30", "2026-10-31"],
		]);
		expect(calendario.avaliacaoGeral).toBe("2026-11-01");
		expect(calendario.horasPorSemanaNecessarias).toBeUndefined();
		expect(calendario.horasPorDiaNecessarias).toBeUndefined();
		expect(calendario.avisos).toEqual([]);
	});

	it("prazo que já passou, que é hoje, amanhã ou depois de amanhã: aviso, e segue como sem prazo", () => {
		const modulos = [modulo("m1", [], { horas: 4 })];
		const semPrazo = calcularCalendario(modulos, { horasPorSemana: 4, prazo: null, hoje });
		const casos: Array<[string, string]> = [
			["2026-10-20", "O prazo (20/10/2026) já passou; o calendário segue sem prazo."],
			["2026-10-26", "O prazo (26/10/2026) é hoje; o calendário segue sem prazo."],
			["2026-10-27", "O prazo (27/10/2026) é amanhã e não deixa dias para os módulos; o calendário segue sem prazo."],
			["2026-10-28", "O prazo (28/10/2026) é depois de amanhã: a avaliação geral fica amanhã, sem dias para os módulos; o calendário segue sem prazo."],
		];
		for (const [prazo, aviso] of casos) {
			expect(calcularCalendario(modulos, { horasPorSemana: 4, prazo, hoje })).toEqual({ ...semPrazo, avisos: [aviso] });
		}
		// Sem módulos, a geral fica amanhã.
		expect(calcularCalendario([], { horasPorSemana: 4, prazo: "2026-10-28", hoje }).avaliacaoGeral).toBe("2026-10-27");
		expect(calcularCalendario([], { horasPorSemana: 4, prazo: null, hoje }).avaliacaoGeral).toBe("2026-10-27");
	});

	it("mais módulos que dias de estudo: cabem em frações, nunca depois da avaliação geral", () => {
		const modulos = [modulo("m1", [], { horas: 4 }), modulo("m2", [], { horas: 4 }), modulo("m3", [], { horas: 4 })];
		// Prazo em 30/10: a geral em 29/10, só 27 e 28 para três módulos.
		const calendario = calcularCalendario(modulos, { horasPorSemana: 4, prazo: "2026-10-30", hoje });
		expect(calendario).toEqual({
			modulos: [
				{ id: "m1", inicio: "2026-10-27", fim: "2026-10-27", avaliacao: "2026-10-28" },
				{ id: "m2", inicio: "2026-10-27", fim: "2026-10-28", avaliacao: "2026-10-29" },
				{ id: "m3", inicio: "2026-10-28", fim: "2026-10-28", avaliacao: "2026-10-29" },
			],
			avaliacaoGeral: "2026-10-29",
			horasPorSemanaNecessarias: 42,
			horasPorDiaNecessarias: 6,
			avisos: ["Até 29/10 (2 dias), este plano pede cerca de 6 h por dia (42 h por semana); você disse 4 h por semana."],
		});
		// Um dia de estudo só: tudo nele, e a avaliação no dia seguinte, que é o da geral.
		const umDia = calcularCalendario(modulos, { horasPorSemana: 4, prazo: "2026-10-29", hoje });
		expect(umDia.modulos.every((item) => item.inicio === "2026-10-27" && item.fim === "2026-10-27" && item.avaliacao === "2026-10-28")).toBe(true);
		expect(umDia.avaliacaoGeral).toBe("2026-10-28");
		expect(umDia.avisos[0]).toBe("Até 28/10 (1 dia), este plano pede cerca de 12 h por dia (84 h por semana); você disse 4 h por semana.");
	});

	it("diasDeEstudo e horasDisponiveis: de amanhã até a véspera da avaliação geral", () => {
		expect(diasDeEstudo("2026-11-05", hoje)).toBe(8);
		expect(diasDeEstudo("2026-10-29", hoje)).toBe(1);
		expect(diasDeEstudo("2026-10-28", hoje)).toBeNull();
		expect(diasDeEstudo("2026-10-20", hoje)).toBeNull();
		expect(diasDeEstudo(null, hoje)).toBeNull();
		expect(horasDisponiveis({ prazo: "2026-11-05", horasPorSemana: 4 }, hoje)).toBeCloseTo(32 / 7);
		expect(horasDisponiveis({ prazo: null, horasPorSemana: 4 }, hoje)).toBeNull();
		expect(() => diasDeEstudo("2026-13-01", hoje)).toThrow(/O prazo precisa ser uma data/);
	});

	it("viradas de mês e de ano", () => {
		const ano = calcularCalendario([modulo("m1", [], { horas: 7 }), modulo("m2", [], { horas: 1 })], { horasPorSemana: 7, prazo: null, hoje: "2026-12-29" });
		expect(ano.modulos).toEqual([
			{ id: "m1", inicio: "2026-12-30", fim: "2027-01-05", avaliacao: "2027-01-06" },
			{ id: "m2", inicio: "2027-01-06", fim: "2027-01-06", avaliacao: "2027-01-07" },
		]);
		const fevereiro = calcularCalendario([modulo("m1", [], { horas: 3 })], { horasPorSemana: 7, prazo: "2028-03-10", hoje: "2028-02-27" });
		expect(fevereiro.modulos).toEqual([{ id: "m1", inicio: "2028-02-28", fim: "2028-03-01", avaliacao: "2028-03-02" }]);
		expect(fevereiro.avaliacaoGeral).toBe("2028-03-09");
		const mes = calcularCalendario([modulo("m1", [], { horas: 2 })], { horasPorSemana: 4, prazo: null, hoje: "2026-10-30" });
		expect(mes.modulos[0]).toEqual({ id: "m1", inicio: "2026-10-31", fim: "2026-11-03", avaliacao: "2026-11-04" });
	});

	it("horas fracionadas", () => {
		const calendario = calcularCalendario([modulo("m1", [], { horas: 0.5 }), modulo("m2", [], { horas: 1.5 })], { horasPorSemana: 3, prazo: null, hoje });
		expect(calendario.modulos.map((item) => diasEntre(item.inicio, item.fim) + 1)).toEqual([2, 4]);
	});

	it("hoje e prazo fora do formato, ou horas por semana inválidas: erro", () => {
		expect(() => calcularCalendario([], { horasPorSemana: 4, prazo: null, hoje: "26/10/2026" })).toThrow(/O dia de hoje precisa ser uma data/);
		expect(() => calcularCalendario([], { horasPorSemana: 4, prazo: "2026-13-01", hoje })).toThrow(/O prazo precisa ser uma data/);
		expect(() => calcularCalendario([], { horasPorSemana: 0, prazo: null, hoje })).toThrow(/maior que zero/);
	});
});

describe("edição na tela", () => {
	const tres = (): Modulo[] => [modulo("m1", ["c-a"]), modulo("m2", ["c-b"]), modulo("m3", ["c-c"])];

	it("renomear, mudar o objetivo, o tipo e as horas", () => {
		const modulos = tres();
		expect(renomearModulo(modulos, "m2", "Novo nome ")[1]!.nome).toBe("Novo nome ");
		expect(mudarObjetivo(modulos, "m2", "Outro.")[1]!.objetivo).toBe("Outro.");
		expect(mudarTipo(modulos, "m2", "curto")[1]!.tipo).toBe("curto");
		expect(() => mudarTipo(modulos, "m2", "avancado" as never)).toThrow(/tipo do módulo/);
		expect(mudarHoras(modulos, "m2", 2.3)[1]!.horas).toBe(2.5);
		expect(mudarHoras(modulos, "m2", 0.1)[1]!.horas).toBe(0.5);
		expect(mudarHoras(modulos, "m2", 99)[1]!.horas).toBe(40);
		expect(() => mudarHoras(modulos, "m2", Number.NaN)).toThrow(/precisam ser um número/);
		expect(() => renomearModulo(modulos, "m9", "x")).toThrow(/Não achei o módulo "m9"/);
		expect(modulos).toEqual(tres());
	});

	it("mover um conceito: vai para o fim do módulo escolhido; o de origem pode ficar vazio", () => {
		const modulos = tres();
		const movido = moverConceito(modulos, "c-a", "m3");
		expect(movido.map((item) => item.conceitos)).toEqual([[], ["c-b"], ["c-c", "c-a"]]);
		expect(moverConceito(modulos, "c-b", "m2")).toEqual(modulos);
		expect(() => moverConceito(modulos, "c-x", "m1")).toThrow(/não está em nenhum módulo/);
		expect(() => moverConceito(modulos, "c-a", "m9")).toThrow(/Não achei o módulo/);
		expect(modulos).toEqual(tres());
	});

	it("subir e descer um módulo; na ponta nada muda; os ids ficam", () => {
		const modulos = tres();
		expect(moverModulo(modulos, "m2", "subir").map((item) => item.id)).toEqual(["m2", "m1", "m3"]);
		expect(moverModulo(modulos, "m2", "descer").map((item) => item.id)).toEqual(["m1", "m3", "m2"]);
		expect(moverModulo(modulos, "m1", "subir")).toEqual(modulos);
		expect(moverModulo(modulos, "m3", "descer")).toEqual(modulos);
		expect(() => moverModulo(modulos, "m1", "lado" as never)).toThrow(/subir ou descer/);
		expect(modulos).toEqual(tres());
	});

	it("módulo novo: vazio no fim, com o próximo id livre (um apagado não volta)", () => {
		const modulos = tres();
		const novo = adicionarModulo(modulos);
		const comNome = adicionarModulo(modulos, "Extra");
		expect(novo.at(-1)).toEqual({ id: "m4", nome: "", objetivo: "", conceitos: [], tipo: "normal", horas: 2 });
		expect(comNome.at(-1)!.nome).toBe("Extra");
		expect(proximoIdModulo(apagarModulo(modulos, "m3"))).toBe("m3");
		expect(proximoIdModulo(apagarModulo(modulos, "m2"))).toBe("m4");
		expect(proximoIdModulo([])).toBe("m1");
		// A validação estrita só barra ao salvar.
		expect(() => validarModulos(novo, MAPA.conceitos)).toThrow(/Dê um nome ao módulo 4/);
		expect(() => validarModulos(comNome, MAPA.conceitos)).toThrow(/está sem conceitos/);
		expect(modulos).toEqual(tres());
	});

	it("apagar um módulo: os conceitos vão para o fim do anterior, ou para o começo do seguinte se ele é o primeiro", () => {
		const modulos = tres();
		expect(apagarModulo(modulos, "m2").map((item) => [item.id, item.conceitos])).toEqual([["m1", ["c-a", "c-b"]], ["m3", ["c-c"]]]);
		expect(apagarModulo(modulos, "m1").map((item) => [item.id, item.conceitos])).toEqual([["m2", ["c-a", "c-b"]], ["m3", ["c-c"]]]);
		expect(apagarModulo(adicionarModulo(modulos), "m4")).toEqual(modulos);
		expect(() => apagarModulo([modulo("m1", MAPA.conceitos)], "m1")).toThrow(/pelo menos um módulo/);
		expect(() => apagarModulo(modulos, "m9")).toThrow(/Não achei o módulo/);
		expect(modulos).toEqual(tres());
	});
});

describe("a etapa Esqueleto no curso", () => {
	const comProposta = (): Curso => ({ ...cursoNoEsqueleto(), esqueletoEmAndamento: emAndamento() });
	const calendario = () => calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: BASICO.prazo, hoje: HOJE });

	it("podeCriar: rascunho, etapas até o Diagnóstico e uma proposta válida", () => {
		expect(podeCriar(cursoNoEsqueleto())).toBe(false);
		expect(podeCriar(comProposta())).toBe(true);
		expect(podeCriar({ ...comProposta(), esqueletoEmAndamento: emAndamento([modulo("m1", ["c-a"])]) })).toBe(false);
		expect(podeCriar({ ...comProposta(), situacao: "pronto" })).toBe(false);
		expect(podeCriar({ ...comProposta(), diagnostico: null })).toBe(false);
	});

	it("validarEtapa aceita o em andamento válido com o calendário e devolve o Esqueleto com criadoEm", () => {
		const curso = comProposta();
		const esqueleto = validarEtapa("esqueleto", { ...curso.esqueletoEmAndamento, calendario: calendario() }, { curso, agora: DEPOIS });
		expect(esqueleto).toEqual({ ...emAndamento(), criadoEm: DEPOIS.toISOString(), calendario: calendario() });
		expect(Object.keys(esqueleto)).toEqual(["modulos", "geradoEm", "modelo", "custo", "criadoEm", "calendario"]);
		const errados: Array<[unknown, RegExp]> = [
			[{ ...curso.esqueletoEmAndamento }, /Falta o calendário/],
			[{ ...curso.esqueletoEmAndamento, calendario: { ...calendario(), modulos: calendario().modulos.slice(1) } }, /não é o dos módulos/],
			[{ ...curso.esqueletoEmAndamento, calendario: { ...calendario(), avaliacaoGeral: "amanhã" } }, /avaliação geral/],
			[{ ...curso.esqueletoEmAndamento, modulos: [modulo("m1", ["c-a"])], calendario: calendario() }, /sem módulo/],
			[{ modulos: MODULOS, calendario: calendario() }, /Monte o esqueleto/],
		];
		for (const [dados, mensagem] of errados) expect(() => validarEtapa("esqueleto", dados, { curso })).toThrow(mensagem);
	});

	it("confirmar o Esqueleto deixa o curso pronto e tira o em andamento", () => {
		const curso = comProposta();
		const esqueleto = validarEtapa("esqueleto", { ...curso.esqueletoEmAndamento, calendario: calendario() }, { curso, agora: DEPOIS });
		const { curso: pronto, invalidadas } = confirmarEtapa(curso, "esqueleto", esqueleto, DEPOIS);
		expect(invalidadas).toEqual([]);
		expect(pronto.situacao).toBe("pronto");
		expect(pronto.etapa).toBe("esqueleto");
		expect(pronto.esqueleto).toEqual(esqueleto);
		expect(pronto.esqueletoEmAndamento).toBeUndefined();
		expect(pronto.alteradoEm).toBe(DEPOIS.toISOString());
		expect(curso.situacao).toBe("rascunho");
	});

	it("um curso pronto não aceita confirmar etapa nenhuma", () => {
		const curso = comProposta();
		const esqueleto = validarEtapa("esqueleto", { ...curso.esqueletoEmAndamento, calendario: calendario() }, { curso, agora: DEPOIS });
		const pronto = confirmarEtapa(curso, "esqueleto", esqueleto, DEPOIS).curso;
		for (const [etapa, dados] of [
			["basico", BASICO],
			["materiais", MATERIAIS],
			["mapa", MAPA],
			["esqueleto", esqueleto],
		] as const) {
			expect(() => confirmarEtapa(pronto, etapa, dados as never, DEPOIS)).toThrow("O curso já foi criado; mudar um curso pronto fica para depois.");
		}
		expect(() => confirmarEtapa(pronto, "basico", BASICO, DEPOIS)).toThrow(ErroCurso);
	});

	it("o que invalida o Esqueleto apaga também a proposta em andamento (e a tela é avisada)", () => {
		const curso = comProposta();
		const casos: Array<[string, Parameters<typeof confirmarEtapa>[1], unknown, string[]]> = [
			["basico com outro prazo", "basico", { ...BASICO, prazo: "2026-12-01" }, ["esqueleto"]],
			["objetivo", "objetivo", { ...OBJETIVO, motivo: "Outro." }, ["diagnostico", "esqueleto"]],
			["mapa", "mapa", { conceitos: ["c-a", "c-b"] }, ["diagnostico", "esqueleto"]],
			["diagnostico", "diagnostico", { ...DIAGNOSTICO, custo: 0.5 }, ["esqueleto"]],
		];
		for (const [nome, etapa, dados, esperado] of casos) {
			expect([nome, oQueInvalida(curso, etapa, dados as never)]).toEqual([nome, esperado]);
			const { curso: novo, invalidadas } = confirmarEtapa(curso, etapa, dados as never, DEPOIS);
			expect([nome, invalidadas]).toEqual([nome, esperado]);
			expect([nome, novo.esqueletoEmAndamento]).toEqual([nome, undefined]);
		}
		// O mesmo Básico (só o nome muda) não invalida, e a proposta fica.
		const { curso: mesmo, invalidadas } = confirmarEtapa(curso, "basico", { ...BASICO, nome: "Outro nome" }, DEPOIS);
		expect(invalidadas).toEqual([]);
		expect(mesmo.esqueletoEmAndamento).toEqual(emAndamento());
	});

	it("resumoDoEsqueleto: por módulo, o nome, o tipo, as horas, quantos conceitos e as datas", () => {
		const curso = comProposta();
		const esqueleto = validarEtapa("esqueleto", { ...curso.esqueletoEmAndamento, calendario: calendario() }, { curso, agora: DEPOIS }) as Esqueleto;
		expect(resumoDoEsqueleto(esqueleto, MAPA.conceitos)).toEqual({
			modulos: [
				{ id: "m1", numero: 1, nome: "Módulo m1", objetivo: "Objetivo de m1.", tipo: "normal", horas: 3, conceitos: 2, inicio: "2026-10-23", fim: "2026-10-28", avaliacao: "2026-10-29" },
				{ id: "m2", numero: 2, nome: "Módulo m2", objetivo: "Objetivo de m2.", tipo: "revisao", horas: 2, conceitos: 1, inicio: "2026-10-29", fim: "2026-11-01", avaliacao: "2026-11-02" },
			],
			horas: 5,
			avaliacaoGeral: "2026-11-19",
			avisos: [],
		});
		expect(resumoDoEsqueleto(esqueleto, ["c-a"]).modulos.map((item) => item.conceitos)).toEqual([1, 0]);
		expect(() => resumoDoEsqueleto({ ...esqueleto, calendario: { ...esqueleto.calendario, modulos: [] } }, MAPA.conceitos)).toThrow(/não tem as datas do módulo m1/);
	});
});

describe("no disco", () => {
	const CURSO = "p1-regressao";
	let dados: string;
	let materia: string;

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-esqueleto-"));
		materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
		await gravarCurso(dados, cursoNoEsqueleto(CURSO, materia));
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	const daMateria = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo !== "criou_materia");
	const ctx = { sessao: "s1", agora: AGORA, hoje: HOJE };
	const prompt = { nome: "esqueleto.md", hash: "abcdef123456" };

	it("gravarProposta: grava o em andamento e o gerou_esqueleto; gerar de novo substitui", async () => {
		const curso = await gravarProposta(dados, materia, CURSO, MODULOS, { modelo: MODELO, custo: 0.02 }, { ...ctx, prompt });
		expect(curso.esqueletoEmAndamento).toEqual(emAndamento());
		expect(curso.alteradoEm).toBe(AGORA.toISOString());
		expect(await lerCurso(dados, materia, CURSO)).toEqual(curso);
		const [evento] = await daMateria();
		expect(evento).toMatchObject({
			sessao: "s1",
			verbo: "gerou_esqueleto",
			objeto: { materia, curso: CURSO },
			resultado: { modulos: 2, custo: 0.02 },
			contexto: { modelo: MODELO, prompt },
		});
		const outra = await gravarProposta(dados, materia, CURSO, [modulo("m1", MAPA.conceitos)], { modelo: MODELO, custo: 0.05 }, { ...ctx, agora: DEPOIS });
		expect(outra.esqueletoEmAndamento).toEqual({ modulos: [modulo("m1", MAPA.conceitos)], geradoEm: DEPOIS.toISOString(), modelo: MODELO, custo: 0.05 });
		expect((await daMateria()).map((item) => item.verbo)).toEqual(["gerou_esqueleto", "gerou_esqueleto"]);
	});

	it("gravarProposta exige o Diagnóstico confirmado e módulos válidos", async () => {
		await gravarCurso(dados, { ...cursoNoEsqueleto(CURSO, materia), diagnostico: null, etapa: "diagnostico" });
		await expect(gravarProposta(dados, materia, CURSO, MODULOS, { modelo: MODELO, custo: 0 }, ctx)).rejects.toThrow(/Confirme antes a etapa Diagnóstico/);
		await gravarCurso(dados, cursoNoEsqueleto(CURSO, materia));
		await expect(gravarProposta(dados, materia, CURSO, [modulo("m1", ["c-a"])], { modelo: MODELO, custo: 0 }, ctx)).rejects.toThrow(/sem módulo/);
		expect(await daMateria()).toEqual([]);
	});

	it("salvarEdicao: validação estrita, sem evento; os mesmos módulos não gravam nada", async () => {
		await expect(salvarEdicao(dados, materia, CURSO, MODULOS, ctx)).rejects.toThrow(/Monte o esqueleto antes de editar/);
		await gravarProposta(dados, materia, CURSO, MODULOS, { modelo: MODELO, custo: 0.02 }, ctx);
		await expect(salvarEdicao(dados, materia, CURSO, adicionarModulo(MODULOS, "Extra"), ctx)).rejects.toThrow(/está sem conceitos/);
		await expect(salvarEdicao(dados, materia, CURSO, [modulo("m1", ["c-a", "c-b"]), modulo("m2", ["c-b", "c-c"])], ctx)).rejects.toThrow(/dois módulos/);
		const igual = await salvarEdicao(dados, materia, CURSO, structuredClone(MODULOS), { ...ctx, agora: DEPOIS });
		expect(igual.alteradoEm).toBe(AGORA.toISOString());
		const editados = renomearModulo(moverConceito(MODULOS, "c-b", "m2"), "m1", "  Só a reta ");
		const salvo = await salvarEdicao(dados, materia, CURSO, editados, { ...ctx, agora: DEPOIS });
		expect(salvo.esqueletoEmAndamento).toEqual({ ...emAndamento(), modulos: [{ ...MODULOS[0]!, nome: "Só a reta", conceitos: ["c-a"] }, { ...MODULOS[1]!, conceitos: ["c-c", "c-b"] }] });
		expect(salvo.alteradoEm).toBe(DEPOIS.toISOString());
		expect(await lerCurso(dados, materia, CURSO)).toEqual(salvo);
		expect((await daMateria()).map((item) => item.verbo)).toEqual(["gerou_esqueleto"]);
	});

	it("criarCurso: o curso fica pronto com o calendário de hoje, o em andamento sai e vai o criou_curso", async () => {
		await expect(criarCurso(dados, materia, CURSO, ctx)).rejects.toThrow(/Monte o esqueleto antes de criar o curso/);
		await gravarProposta(dados, materia, CURSO, MODULOS, { modelo: MODELO, custo: 0.02 }, ctx);
		const criado = await criarCurso(dados, materia, CURSO, { ...ctx, agora: DEPOIS });
		const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: "2026-11-20", hoje: HOJE });
		expect(criado.situacao).toBe("pronto");
		expect(criado.etapa).toBe("esqueleto");
		expect(criado.esqueletoEmAndamento).toBeUndefined();
		expect(criado.esqueleto).toEqual({ ...emAndamento(), criadoEm: DEPOIS.toISOString(), calendario });
		expect(calendario.avaliacaoGeral).toBe("2026-11-19");
		expect(await lerCurso(dados, materia, CURSO)).toEqual(criado);
		const eventos = await daMateria();
		expect(eventos.map((item) => item.verbo)).toEqual(["gerou_esqueleto", "criou_curso"]);
		expect(eventos[1]).toMatchObject({
			sessao: "s1",
			ts: DEPOIS.toISOString(),
			objeto: { materia, curso: CURSO },
			resultado: { nome: "P1: regressão", modulos: 2, prazo: "2026-11-20", avaliacaoGeral: "2026-11-19" },
		});
		// Pronto: nada mais muda por aqui.
		await expect(criarCurso(dados, materia, CURSO, ctx)).rejects.toThrow("O curso já foi criado; mudar um curso pronto fica para depois.");
		await expect(gravarProposta(dados, materia, CURSO, MODULOS, { modelo: MODELO, custo: 0 }, ctx)).rejects.toThrow(/já foi criado/);
		await expect(salvarEdicao(dados, materia, CURSO, MODULOS, ctx)).rejects.toThrow(/já foi criado/);
		expect((await daMateria()).length).toBe(2);
	});

	it("criarCurso usa o hoje do contexto (e, sem ele, o dia local do agora)", async () => {
		await gravarProposta(dados, materia, CURSO, MODULOS, { modelo: MODELO, custo: 0.02 }, ctx);
		const criado = await criarCurso(dados, materia, CURSO, { agora: DEPOIS, hoje: "2026-11-19" });
		expect(criado.esqueleto!.calendario.avisos).toEqual(["O prazo (20/11/2026) é amanhã e não deixa dias para os módulos; o calendário segue sem prazo."]);
		expect(criado.esqueleto!.calendario.modulos[0]!.inicio).toBe("2026-11-20");
	});

	it("recalcularCalendario: o calendário com os dias de hoje em esqueleto.calendario, os módulos iguais, e o recalculou_calendario", async () => {
		await expect(recalcularCalendario(dados, materia, CURSO, ctx)).rejects.toThrow("Só um curso criado tem calendário para recalcular.");
		await gravarProposta(dados, materia, CURSO, MODULOS, { modelo: MODELO, custo: 0.02 }, ctx);
		const criado = await criarCurso(dados, materia, CURSO, ctx);
		const MAIS_TARDE = new Date("2026-11-10T12:00:00.000Z");
		const novo = await recalcularCalendario(dados, materia, CURSO, { sessao: "s2", agora: MAIS_TARDE, hoje: "2026-11-10" });
		const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: "2026-11-20", hoje: "2026-11-10" });
		expect(novo.esqueleto).toEqual({ ...criado.esqueleto, calendario });
		expect(novo.esqueleto!.calendario.modulos[0]!.inicio).toBe("2026-11-11");
		// 3 h e 2 h (6 e 4 dias) não cabem nos 8 dias de estudo (11/11 a 18/11): frações, e o aviso.
		const aviso = "Até 19/11 (8 dias), este plano pede cerca de 0,6 h por dia (4,5 h por semana); você disse 4 h por semana.";
		expect(novo.esqueleto!.calendario.avaliacaoGeral).toBe("2026-11-19");
		expect(novo.esqueleto!.calendario.avisos).toEqual([aviso]);
		expect(novo.alteradoEm).toBe(MAIS_TARDE.toISOString());
		expect({ ...novo, esqueleto: null, alteradoEm: "" }).toEqual({ ...criado, esqueleto: null, alteradoEm: "" });
		expect(await lerCurso(dados, materia, CURSO)).toEqual(novo);
		const eventos = await daMateria();
		expect(eventos.map((item) => item.verbo)).toEqual(["gerou_esqueleto", "criou_curso", "recalculou_calendario"]);
		expect(eventos[2]).toMatchObject({
			sessao: "s2",
			ts: MAIS_TARDE.toISOString(),
			objeto: { materia, curso: CURSO },
			resultado: { avaliacaoGeral: "2026-11-19", avisos: [aviso] },
		});
		// Com o prazo passado: o aviso vai no evento, e a geral vem depois do último módulo.
		const vencido = await recalcularCalendario(dados, materia, CURSO, { agora: MAIS_TARDE, hoje: "2026-11-25" });
		expect(vencido.esqueleto!.calendario.avisos).toEqual(["O prazo (20/11/2026) já passou; o calendário segue sem prazo."]);
		expect((await daMateria()).at(-1)!.resultado).toEqual({ avaliacaoGeral: vencido.esqueleto!.calendario.avaliacaoGeral, avisos: vencido.esqueleto!.calendario.avisos });
	});

	it("ida e volta no disco: o esqueletoEmAndamento fica, antes do esqueleto", async () => {
		const curso: Curso = { ...cursoNoEsqueleto(CURSO, materia), esqueletoEmAndamento: emAndamento() };
		await gravarCurso(dados, curso);
		expect(await lerCurso(dados, materia, CURSO)).toEqual(curso);
		const texto = await readFile(caminhoDoCurso(dados, materia, CURSO), "utf8");
		const chaves = Object.keys(JSON.parse(texto));
		expect(chaves.slice(chaves.indexOf("diagnostico"))).toEqual(["diagnostico", "esqueletoEmAndamento", "esqueleto"]);
		// Sem em andamento, o campo não aparece.
		await gravarCurso(dados, { ...curso, esqueletoEmAndamento: null });
		expect(Object.keys(JSON.parse(await readFile(caminhoDoCurso(dados, materia, CURSO), "utf8")))).not.toContain("esqueletoEmAndamento");
	});

	it("conceitosParaOModelo: nome, descrição e prioridade do mapa e o resumo do diagnóstico, na ordem do curso", async () => {
		const conceito = (id: string, extra: Partial<Conceito>): Conceito => ({ id, nome: id, descricao: "", referencias: [], prioridade: "normal", origem: "material", criadoEm: AGORA.toISOString(), ...extra });
		await gravarMapa(dados, materia, { ...mapaVazio(), conceitos: [conceito("c-b", { nome: "Resíduo", descricao: "O que sobra." }), conceito("c-a", { nome: "Reta", descricao: "A reta.", prioridade: "alta" })] });
		const conceitos = await conceitosParaOModelo(dados, materia, CURSO);
		expect(conceitos.map(({ id, nome, descricao, prioridade }) => ({ id, nome, descricao, prioridade }))).toEqual([
			{ id: "c-a", nome: "Reta", descricao: "A reta.", prioridade: "alta" },
			{ id: "c-b", nome: "Resíduo", descricao: "O que sobra.", prioridade: "normal" },
			// c-c saiu do mapa da matéria.
			{ id: "c-c", nome: "c-c", descricao: "", prioridade: "normal" },
		]);
		expect(conceitos[0]!.diagnostico).toMatchObject({ nivel: 3, calibracao: "achou_que_sabia_mais", questoes: [{ id: "q1", tipo: "alternativa", resultado: "errada" }] });
		expect(conceitos[1]!.diagnostico).toMatchObject({ nivel: 1, calibracao: "sem_questoes" });
		expect(conceitos[0]!.diagnostico).not.toHaveProperty("id");
		// Com o curso já lido, e sem diagnóstico concluído: null.
		const semDiagnostico = await conceitosParaOModelo(dados, materia, { ...cursoNoEsqueleto(CURSO, materia), diagnostico: null });
		expect(semDiagnostico.every((item) => item.diagnostico === null)).toBe(true);
	});
});
