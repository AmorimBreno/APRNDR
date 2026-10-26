// Testes do diagnóstico do guia de cursos (item 5, parte B): as regras puras
// (escolha dos conceitos, validação das questões e da correção, respostas,
// resumo, o que a tela vê, invalidação e confirmação da etapa) e o disco numa
// pasta de dados temporária com uma matéria (curso.json e os eventos em cada
// arquivo).

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmarEtapa, type Curso, ErroCurso, gravarCurso, lerCurso, novoCurso, oQueInvalida, validarEtapa } from "./cursos.ts";
import {
	aplicarCorrecao,
	aplicarResposta,
	autoavaliacaoCompleta,
	type ConceitoParaEscolha,
	concluirDiagnostico,
	type Correcao,
	type DiagnosticoEmAndamento,
	ErroDiagnostico,
	escolherConceitos,
	faltaCorrigir,
	faltaResponder,
	gravarCorrecao,
	gravarQuestoes,
	gravarResposta,
	type NivelAutoavaliacao,
	NOMES_CONFIANCA,
	NOMES_NIVEL,
	paraATela,
	podeConcluir,
	type QuestaoAlternativa,
	type QuestaoDissertativa,
	resumoDoDiagnostico,
	salvarAutoavaliacao,
	trechosDosConceitos,
	validarAutoavaliacao,
	validarCorrecao,
	validarQuestoes,
} from "./diagnostico.ts";
import { lerEventos } from "./eventos.ts";
import { pastaExtraidoArquivo } from "./mapa.ts";
import { criarMateria, eventosAprendiz, eventosMateria } from "./materias.ts";

const AGORA = new Date("2026-10-22T13:00:00.000Z");
const DEPOIS = new Date("2026-10-22T14:00:00.000Z");
const MAIS_TARDE = new Date("2026-10-22T15:00:00.000Z");

const BASICO = { nome: "P1: regressão", prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 };
const MATERIAIS = { arquivos: [{ arquivo: "aula-04.pdf", hash: "h4" }] };
const OBJETIVO = { escopo: "material_base" as const, tipo: "misto" as const, motivo: "Passar na P1." };
const MAPA = { conceitos: ["c-a", "c-b", "c-c"] };

/** Um curso com as etapas até o Mapa confirmadas (etapa diagnostico). */
function cursoNoDiagnostico(id = "p1-regressao", materia = "calculo-i"): Curso {
	let curso = novoCurso(id, materia, BASICO, AGORA);
	curso = confirmarEtapa(curso, "materiais", MATERIAIS, AGORA).curso;
	curso = confirmarEtapa(curso, "objetivo", OBJETIVO, AGORA).curso;
	return confirmarEtapa(curso, "mapa", MAPA, AGORA).curso;
}

const conceitos = (quantos: number, extra: (indice: number) => Partial<ConceitoParaEscolha> = () => ({})): ConceitoParaEscolha[] =>
	Array.from({ length: quantos }, (_, indice) => ({ id: `c${indice + 1}`, prioridade: "normal" as const, ...extra(indice + 1) }));

const niveis = (valores: Record<string, NivelAutoavaliacao>) => valores;

// --- Questões de exemplo -----------------------------------------------------------

const alternativaDoModelo = (conceito: string, extra: Record<string, unknown> = {}) => ({
	tipo: "alternativa",
	conceitos: [conceito],
	enunciado: `Sobre ${conceito}?`,
	alternativas: [
		{ texto: "Errada um", confusao: "Confunde A com B." },
		{ texto: "Certa", correta: true },
		{ texto: "Errada dois", confusao: "Acha que vale sempre." },
	],
	explicacao: "Porque sim.",
	...extra,
});

const RUBRICA = [
	{ criterio: "Define o resíduo", descricao: "Diferença entre observado e previsto.", pontos: 2 },
	{ criterio: "Dá um exemplo", descricao: "", pontos: 2 },
	{ criterio: "Usa a notação", descricao: "", pontos: 1 },
];

const dissertativaDoModelo = (conceito: string, extra: Record<string, unknown> = {}) => ({
	tipo: "dissertativa",
	conceitos: [conceito],
	enunciado: `Explique ${conceito}.`,
	rubrica: RUBRICA,
	respostaModelo: "O resíduo é…",
	...extra,
});

const Q1: QuestaoAlternativa = {
	id: "q1",
	tipo: "alternativa",
	conceitos: ["c-a"],
	enunciado: "Sobre c-a?",
	alternativas: [
		{ texto: "Errada um", confusao: "Confunde A com B." },
		{ texto: "Certa", correta: true },
		{ texto: "Errada dois", confusao: "Acha que vale sempre." },
	],
	explicacao: "Porque sim.",
};
const Q2: QuestaoAlternativa = { ...structuredClone(Q1), id: "q2", conceitos: ["c-b"], enunciado: "Sobre c-b?" };
const Q3: QuestaoDissertativa = { id: "q3", tipo: "dissertativa", conceitos: ["c-a"], enunciado: "Explique c-a.", rubrica: RUBRICA, respostaModelo: "O resíduo é…" };

const CORRECAO: Correcao = {
	criterios: [
		{ criterio: "Define o resíduo", trechos: ["é a diferença"], pontos: 2, max: 2, justificativa: "Definiu." },
		{ criterio: "Dá um exemplo", trechos: [], pontos: 0, max: 2, justificativa: "Sem exemplo." },
		{ criterio: "Usa a notação", trechos: ["e_i"], pontos: 1, max: 1, justificativa: "Usou." },
	],
	total: 3,
	max: 5,
	modelo: "openrouter/openai/gpt-6.1-sol",
	custo: 0.01,
};

/** Um diagnóstico com as três questões geradas e nada respondido. */
const emAndamento = (): DiagnosticoEmAndamento => ({
	autoavaliacao: { "c-a": 3, "c-b": 3, "c-c": 0 },
	questoes: [structuredClone(Q1), structuredClone(Q2), structuredClone(Q3)],
	geradoEm: AGORA.toISOString(),
	modelo: "openrouter/openai/gpt-6.1-sol",
	custo: 0.03,
	respostas: {},
});

/** O diagnóstico com tudo respondido e corrigido: q1 certa, q2 errada, q3 com 3 de 5. */
function respondido(): DiagnosticoEmAndamento {
	let diagnostico = aplicarResposta(emAndamento(), "q1", { confianca: 4, escolha: 1, tempoMs: 41000 }, DEPOIS);
	diagnostico = aplicarResposta(diagnostico, "q2", { confianca: 3, escolha: 2, tempoMs: 20000 }, DEPOIS);
	diagnostico = aplicarResposta(diagnostico, "q3", { confianca: 2, texto: "  O resíduo é a diferença, e_i.  ", tempoMs: 180000 }, DEPOIS);
	return aplicarCorrecao(diagnostico, "q3", CORRECAO);
}

describe("nomes", () => {
	it("níveis e confiança", () => {
		expect(Object.values(NOMES_NIVEL)).toEqual(["Nunca vi", "Já ouvi falar", "Sei explicar", "Sei aplicar"]);
		expect(Object.values(NOMES_CONFIANCA)).toEqual(["Chute", "Pouca", "Boa", "Certeza"]);
	});
});

describe("escolherConceitos", () => {
	it("os de prioridade alta entram primeiro", () => {
		const lista = conceitos(10, (indice) => (indice >= 9 ? { prioridade: "alta" } : {}));
		const nivel = Object.fromEntries(lista.map((conceito) => [conceito.id, 1 as const]));
		expect(escolherConceitos(lista, nivel, "misto")).toEqual({ alternativas: ["c1", "c2", "c3", "c4", "c5", "c10"], dissertativas: ["c9"] });
	});

	it("depois dos de alta, alterna entre os níveis", () => {
		const lista = conceitos(12);
		const nivel = niveis({ c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 1, c8: 1, c9: 1, c10: 2, c11: 3, c12: 3 });
		const escolha = escolherConceitos(lista, nivel, "misto");
		expect(escolha).toEqual({ alternativas: ["c1", "c2", "c7", "c8", "c10", "c12"], dissertativas: ["c11"] });
		const usados = new Set([...escolha.alternativas, ...escolha.dissertativas].map((id) => nivel[id]));
		expect([...usados].sort()).toEqual([0, 1, 2, 3]);
	});

	it("dentro de um nível, normal antes de baixa", () => {
		const lista = conceitos(9, (indice) => (indice <= 2 ? { prioridade: "baixa" } : {}));
		const nivel = Object.fromEntries(lista.map((conceito) => [conceito.id, 0 as const]));
		const escolha = escolherConceitos(lista, nivel, "misto");
		expect([...escolha.alternativas, ...escolha.dissertativas]).not.toContain("c1");
		expect([...escolha.alternativas, ...escolha.dissertativas]).not.toContain("c2");
	});

	it("pelo menos 2 de nível 2 ou 3 quando houver, mesmo no lugar de um de prioridade alta", () => {
		const altas = Array.from({ length: 9 }, (_, indice) => ({ id: `a${indice + 1}`, prioridade: "alta" as const }));
		const lista = [...altas, { id: "n1", prioridade: "normal" as const }, { id: "n2", prioridade: "normal" as const }];
		const nivel: Record<string, NivelAutoavaliacao> = { ...Object.fromEntries(altas.map((conceito) => [conceito.id, 0 as const])), n1: 3, n2: 2 };
		expect(escolherConceitos(lista, nivel, "misto")).toEqual({ alternativas: ["a1", "a2", "a3", "a4", "a5", "n2"], dissertativas: ["n1"] });
		// Só um de nível alto no curso: entra esse um.
		const umSo: Record<string, NivelAutoavaliacao> = { ...nivel, n2: 1 };
		const escolha = escolherConceitos(lista, umSo, "misto");
		expect([...escolha.alternativas, ...escolha.dissertativas].filter((id) => umSo[id]! >= 2)).toEqual(["n1"]);
		// Nenhum de nível alto: nada é trocado.
		const nenhum: Record<string, NivelAutoavaliacao> = { ...nivel, n1: 0, n2: 0 };
		expect(escolherConceitos(lista, nenhum, "misto")).toEqual({ alternativas: ["a2", "a3", "a4", "a5", "a6", "a7"], dissertativas: ["a1"] });
	});

	it("limites: até 6 alternativas, 1 dissertativa no misto e no aplicado, 2 no teórico; até 8 conceitos", () => {
		const lista = conceitos(20);
		const nivel = Object.fromEntries(lista.map((conceito, indice) => [conceito.id, (indice % 4) as NivelAutoavaliacao]));
		for (const tipo of ["misto", "aplicado"] as const) {
			const escolha = escolherConceitos(lista, nivel, tipo);
			expect(escolha.alternativas).toHaveLength(6);
			expect(escolha.dissertativas).toHaveLength(1);
			expect(new Set([...escolha.alternativas, ...escolha.dissertativas]).size).toBe(7);
		}
		const teorico = escolherConceitos(lista, nivel, "teorico");
		expect(teorico.alternativas).toHaveLength(6);
		expect(teorico.dissertativas).toHaveLength(2);
		expect(new Set([...teorico.alternativas, ...teorico.dissertativas]).size).toBe(8);
		// As dissertativas vão para os de maior nível.
		expect(teorico.dissertativas.every((id) => nivel[id] === 3)).toBe(true);
	});

	it("tipo teórico: 2 dissertativas só com pelo menos 4 conceitos", () => {
		const nivel = niveis({ c1: 1, c2: 2, c3: 0, c4: 3 });
		expect(escolherConceitos(conceitos(4), nivel, "teorico")).toEqual({ alternativas: ["c1", "c2", "c3", "c4"], dissertativas: ["c2", "c4"] });
		expect(escolherConceitos(conceitos(3), nivel, "teorico")).toEqual({ alternativas: ["c1", "c2", "c3"], dissertativas: ["c2"] });
	});

	it("menos conceitos que o máximo: todos com alternativa, a dissertativa no de maior nível; nenhum, nada", () => {
		expect(escolherConceitos(conceitos(3), niveis({ c1: 0, c2: 3, c3: 1 }), "misto")).toEqual({ alternativas: ["c1", "c2", "c3"], dissertativas: ["c2"] });
		expect(escolherConceitos(conceitos(1), {}, "teorico")).toEqual({ alternativas: ["c1"], dissertativas: ["c1"] });
		expect(escolherConceitos([], {}, "misto")).toEqual({ alternativas: [], dissertativas: [] });
	});

	it("determinística, e não repete um id que vier duas vezes", () => {
		const lista = conceitos(15, (indice) => (indice % 5 === 0 ? { prioridade: "alta" } : indice % 3 === 0 ? { prioridade: "baixa" } : {}));
		const nivel = Object.fromEntries(lista.map((conceito, indice) => [conceito.id, ((indice * 7) % 4) as NivelAutoavaliacao]));
		const primeira = escolherConceitos(lista, nivel, "teorico");
		expect(escolherConceitos(structuredClone(lista), { ...nivel }, "teorico")).toEqual(primeira);
		expect(escolherConceitos([...conceitos(2), { id: "c1", prioridade: "alta" }], {}, "misto")).toEqual({ alternativas: ["c1", "c2"], dissertativas: ["c1"] });
	});
});

describe("validarQuestoes", () => {
	const pedidos = { alternativas: ["c-a", "c-b"], dissertativas: ["c-a"] };

	it("põe na ordem dos pedidos (alternativas, depois dissertativas) e dá os ids", () => {
		const questoes = validarQuestoes({ questoes: [dissertativaDoModelo("c-a"), alternativaDoModelo("c-b"), alternativaDoModelo("c-a")] }, pedidos);
		expect(questoes.map((questao) => [questao.id, questao.tipo, questao.conceitos])).toEqual([
			["q1", "alternativa", ["c-a"]],
			["q2", "alternativa", ["c-b"]],
			["q3", "dissertativa", ["c-a"]],
		]);
		expect(questoes[0]).toEqual({ ...Q1 });
		expect(questoes[2]).toEqual(Q3);
	});

	it("descarta o que não serve e usa a próxima válida", () => {
		const ruins = [
			alternativaDoModelo("c-a", { alternativas: [{ texto: "A", correta: true }, { texto: "B", correta: true }, { texto: "C", confusao: "x" }] }),
			alternativaDoModelo("c-a", { alternativas: [{ texto: "A", correta: true }, { texto: "B" }, { texto: "C", confusao: "x" }] }),
			alternativaDoModelo("c-a", { alternativas: [{ texto: "A", correta: true }, { texto: "B", confusao: "x" }] }),
			alternativaDoModelo("c-a", { enunciado: "  " }),
			alternativaDoModelo("c-a", { conceitos: ["c-a", "c-z"] }),
			dissertativaDoModelo("c-a", { rubrica: RUBRICA.slice(0, 2) }),
			dissertativaDoModelo("c-a", { rubrica: [...RUBRICA.slice(0, 2), { criterio: "Zero", pontos: 0 }] }),
			{ tipo: "outro" },
		];
		const questoes = validarQuestoes({ questoes: [...ruins, alternativaDoModelo("c-a"), alternativaDoModelo("c-b"), dissertativaDoModelo("c-a"), alternativaDoModelo("c-b")] }, pedidos);
		expect(questoes).toHaveLength(3);
		expect(questoes[0]).toEqual(Q1);
	});

	it("erro se faltar alguma questão pedida, com o motivo dos descartes", () => {
		const duasCorretas = alternativaDoModelo("c-b", { alternativas: [{ texto: "A", correta: true }, { texto: "B", correta: true }, { texto: "C", confusao: "x" }] });
		const semConfusao = alternativaDoModelo("c-b", { alternativas: [{ texto: "A", correta: true }, { texto: "B", confusao: " " }, { texto: "C", confusao: "x" }] });
		const chamada = () => validarQuestoes({ questoes: [alternativaDoModelo("c-a"), duasCorretas, semConfusao, dissertativaDoModelo("c-a")] }, pedidos);
		expect(chamada).toThrow(ErroDiagnostico);
		expect(chamada).toThrow(/alternativa de c-b/);
		expect(chamada).toThrow(/2 alternativas corretas/);
		expect(chamada).toThrow(/sem a confusão/);
		expect(() => validarQuestoes({ questoes: [alternativaDoModelo("c-a"), alternativaDoModelo("c-b")] }, pedidos)).toThrow(/dissertativa de c-a/);
		expect(() => validarQuestoes({ questoes: [alternativaDoModelo("c-a"), alternativaDoModelo("c-b"), dissertativaDoModelo("c-a", { rubrica: [] })] }, pedidos)).toThrow(/rubrica precisa de 3 a 5/);
		expect(() => validarQuestoes({ nada: [] }, pedidos)).toThrow(/questoes/);
		expect(() => validarQuestoes(null, pedidos)).toThrow(ErroDiagnostico);
	});

	it("o contexto é opcional: aparado quando vem, fora quando vazio ou não é texto", () => {
		const contexto = "  No modelo apresentado:\n\n```python\nlen(modelo.wv)\n```\n  ";
		const questoes = validarQuestoes(
			{ questoes: [alternativaDoModelo("c-a", { contexto }), alternativaDoModelo("c-b", { contexto: "   " }), dissertativaDoModelo("c-a", { contexto: 42 })] },
			pedidos,
		);
		expect(questoes[0]).toEqual({ ...Q1, contexto: "No modelo apresentado:\n\n```python\nlen(modelo.wv)\n```" });
		expect(questoes[1]).not.toHaveProperty("contexto");
		expect(questoes[2]).not.toHaveProperty("contexto");
		expect(validarQuestoes({ questoes: [dissertativaDoModelo("c-a", { contexto: "Dados: $x = 2$." }), alternativaDoModelo("c-a"), alternativaDoModelo("c-b")] }, pedidos)[2]).toEqual({
			...Q3,
			contexto: "Dados: $x = 2$.",
		});
	});

	it("ErroDiagnostico é um ErroCurso (a extensão mostra a frase como está)", () => {
		expect(new ErroDiagnostico("x")).toBeInstanceOf(ErroCurso);
	});
});

describe("validarCorrecao", () => {
	const origem = { modelo: "m", custo: 0.02 };

	it("pela ordem, com o nome e o máximo da rubrica; total e max somados pelo código", () => {
		const correcao = validarCorrecao(
			{
				criterios: [
					{ criterio: "definição", trechos: [" é a diferença ", ""], pontos: 1.5, justificativa: " Quase. " },
					{ criterio: "exemplo", trechos: [], pontos: 0, justificativa: "" },
					{ criterio: "notação", pontos: 0.5 },
				],
				total: 99,
				max: 99,
			},
			Q3,
			origem,
		);
		expect(correcao).toEqual({
			criterios: [
				{ criterio: "Define o resíduo", trechos: ["é a diferença"], pontos: 1.5, max: 2, justificativa: "Quase." },
				{ criterio: "Dá um exemplo", trechos: [], pontos: 0, max: 2, justificativa: "" },
				{ criterio: "Usa a notação", trechos: [], pontos: 0.5, max: 1, justificativa: "" },
			],
			total: 2,
			max: 5,
			modelo: "m",
			custo: 0.02,
		});
	});

	it("pelo nome quando todos os nomes batem, em qualquer ordem", () => {
		const correcao = validarCorrecao(
			{
				criterios: [
					{ criterio: "Usa a notação", trechos: [], pontos: 1, justificativa: "" },
					{ criterio: "Define o resíduo", trechos: [], pontos: 2, justificativa: "" },
					{ criterio: "Dá um exemplo", trechos: [], pontos: 1, justificativa: "" },
				],
			},
			Q3,
			origem,
		);
		expect(correcao.criterios.map((item) => [item.criterio, item.pontos])).toEqual([
			["Define o resíduo", 2],
			["Dá um exemplo", 1],
			["Usa a notação", 1],
		]);
		expect(correcao.total).toBe(4);
	});

	it("limites: pontos de 0 ao máximo, a mesma quantidade de critérios", () => {
		const criterio = (pontos: unknown) => ({ criterio: "x", trechos: [], pontos, justificativa: "" });
		expect(() => validarCorrecao({ criterios: [criterio(3), criterio(0), criterio(0)] }, Q3, origem)).toThrow(/de 0 a 2/);
		expect(() => validarCorrecao({ criterios: [criterio(-1), criterio(0), criterio(0)] }, Q3, origem)).toThrow(/de 0 a 2/);
		expect(() => validarCorrecao({ criterios: [criterio("2"), criterio(0), criterio(0)] }, Q3, origem)).toThrow(ErroDiagnostico);
		expect(() => validarCorrecao({ criterios: [criterio(0), criterio(0)] }, Q3, origem)).toThrow(/2 critérios, e a rubrica tem 3/);
		expect(() => validarCorrecao({}, Q3, origem)).toThrow(/criterios/);
		expect(validarCorrecao({ criterios: [criterio(2), criterio(2), criterio(1)] }, Q3, origem).total).toBe(5);
	});
});

describe("respostas", () => {
	it("a alternativa é corrigida pelo código; a errada guarda a confusão da escolhida", () => {
		const original = emAndamento();
		const certa = aplicarResposta(original, "q1", { confianca: 4, escolha: 1, tempoMs: 41000.4 }, DEPOIS);
		expect(certa.respostas.q1).toEqual({ confianca: 4, escolha: 1, correta: true, tempoMs: 41000, respondidaEm: DEPOIS.toISOString() });
		const errada = aplicarResposta(original, "q1", { confianca: 3, escolha: 2, tempoMs: 1000 }, DEPOIS);
		expect(errada.respostas.q1).toEqual({ confianca: 3, escolha: 2, correta: false, confusao: "Acha que vale sempre.", tempoMs: 1000, respondidaEm: DEPOIS.toISOString() });
		expect(original.respostas).toEqual({});
	});

	it("a dissertativa guarda o texto; a correção chega depois", () => {
		const resposta = aplicarResposta(emAndamento(), "q3", { confianca: 2, texto: "  Texto.  ", tempoMs: 5 }, DEPOIS);
		expect(resposta.respostas.q3).toEqual({ confianca: 2, texto: "Texto.", tempoMs: 5, respondidaEm: DEPOIS.toISOString() });
		expect(faltaCorrigir(resposta)).toEqual(["q3"]);
		const corrigida = aplicarCorrecao(resposta, "q3", CORRECAO);
		expect(faltaCorrigir(corrigida)).toEqual([]);
		expect(() => aplicarCorrecao(corrigida, "q3", CORRECAO)).toThrow(/já foi corrigida/);
		expect(() => aplicarCorrecao(emAndamento(), "q3", CORRECAO)).toThrow(/ainda não foi respondida/);
		expect(() => aplicarCorrecao(resposta, "q1", CORRECAO)).toThrow(/dissertativa/);
	});

	it("confiança, escolha, texto e tempo conferidos; não responde duas vezes", () => {
		const base = emAndamento();
		expect(() => aplicarResposta(base, "q9", { confianca: 1, escolha: 0, tempoMs: 1 })).toThrow(/Não achei a questão/);
		expect(() => aplicarResposta(base, "q1", { confianca: 5, escolha: 0, tempoMs: 1 })).toThrow(/confiança/);
		expect(() => aplicarResposta(base, "q1", { escolha: 0, tempoMs: 1 })).toThrow(/confiança/);
		expect(() => aplicarResposta(base, "q1", { confianca: 1, escolha: 3, tempoMs: 1 })).toThrow(/Escolha uma das alternativas/);
		expect(() => aplicarResposta(base, "q1", { confianca: 1, escolha: 0.5, tempoMs: 1 })).toThrow(/Escolha uma das alternativas/);
		expect(() => aplicarResposta(base, "q1", { confianca: 1, escolha: 0, tempoMs: -1 })).toThrow(/tempo/);
		expect(() => aplicarResposta(base, "q3", { confianca: 1, texto: "  ", tempoMs: 1 })).toThrow(/Escreva a resposta/);
		const uma = aplicarResposta(base, "q1", { confianca: 1, escolha: 0, tempoMs: 1 });
		expect(() => aplicarResposta(uma, "q1", { confianca: 1, escolha: 1, tempoMs: 1 })).toThrow(/já foi respondida/);
	});

	it("faltaResponder, faltaCorrigir e podeConcluir", () => {
		expect(faltaResponder(emAndamento())).toEqual(["q1", "q2", "q3"]);
		expect(faltaResponder(null)).toEqual([]);
		expect(podeConcluir(null)).toBe(false);
		expect(podeConcluir({ autoavaliacao: {}, questoes: [], respostas: {} })).toBe(false);
		let diagnostico = aplicarResposta(emAndamento(), "q1", { confianca: 1, escolha: 0, tempoMs: 1 });
		diagnostico = aplicarResposta(diagnostico, "q2", { confianca: 1, escolha: 0, tempoMs: 1 });
		diagnostico = aplicarResposta(diagnostico, "q3", { confianca: 1, texto: "x", tempoMs: 1 });
		expect(faltaResponder(diagnostico)).toEqual([]);
		expect(podeConcluir(diagnostico)).toBe(false);
		expect(podeConcluir(aplicarCorrecao(diagnostico, "q3", CORRECAO))).toBe(true);
	});

	it("validarAutoavaliacao e autoavaliacaoCompleta", () => {
		expect(validarAutoavaliacao({ "c-c": 0, "c-a": 3 }, MAPA.conceitos)).toEqual({ "c-a": 3, "c-c": 0 });
		expect(() => validarAutoavaliacao({ "c-x": 1 }, MAPA.conceitos)).toThrow(/não é do curso: c-x/);
		expect(() => validarAutoavaliacao({ "c-a": 4 }, MAPA.conceitos)).toThrow(/de 0 a 3/);
		expect(() => validarAutoavaliacao({ "c-a": "2" }, MAPA.conceitos)).toThrow(/de 0 a 3/);
		const curso = cursoNoDiagnostico();
		expect(autoavaliacaoCompleta(curso)).toBe(false);
		expect(autoavaliacaoCompleta({ ...curso, diagnosticoEmAndamento: { autoavaliacao: { "c-a": 1, "c-b": 0 }, questoes: [], respostas: {} } })).toBe(false);
		expect(autoavaliacaoCompleta({ ...curso, diagnosticoEmAndamento: { autoavaliacao: { "c-a": 1, "c-b": 0, "c-c": 3 }, questoes: [], respostas: {} } })).toBe(true);
	});
});

describe("resumoDoDiagnostico", () => {
	it("por conceito, as questões e a calibração; o total com a nota das dissertativas", () => {
		const resumo = resumoDoDiagnostico(respondido(), MAPA.conceitos);
		expect(resumo.total).toEqual({ acertos: 1, alternativas: 2, dissertativas: 1, nota: 0.6 });
		expect(resumo.conceitos).toEqual([
			{
				id: "c-a",
				nivel: 3,
				questoes: [
					{ id: "q1", tipo: "alternativa", resultado: "certa" },
					{ id: "q3", tipo: "dissertativa", resultado: "parcial", nota: { total: 3, max: 5 } },
				],
				calibracao: "bateu",
				frase: 'Disse "Sei aplicar" e foi bem nas questões: a autoavaliação bateu.',
			},
			{ id: "c-b", nivel: 3, questoes: [{ id: "q2", tipo: "alternativa", resultado: "errada" }], calibracao: "achou_que_sabia_mais", frase: 'Disse "Sei aplicar" e foi mal nas questões: achou que sabia mais.' },
			{ id: "c-c", nivel: 0, questoes: [], calibracao: "sem_questoes", frase: 'Disse "Nunca vi"; nenhuma questão cobrou este conceito.' },
		]);
	});

	it("sabia mais do que achou; sem autoavaliação; o que não foi respondido fica de fora", () => {
		const diagnostico = emAndamento();
		diagnostico.autoavaliacao = { "c-a": 0 };
		const resposta = aplicarResposta(diagnostico, "q1", { confianca: 1, escolha: 1, tempoMs: 1 });
		const resumo = resumoDoDiagnostico(resposta, ["c-a", "c-b"]);
		expect(resumo.conceitos[0]).toMatchObject({ calibracao: "sabia_mais", frase: 'Disse "Nunca vi" e foi bem nas questões: sabia mais do que achou.' });
		expect(resumo.conceitos[1]).toMatchObject({ nivel: null, questoes: [], calibracao: "sem_autoavaliacao" });
		expect(resumo.total).toEqual({ acertos: 1, alternativas: 2, dissertativas: 1, nota: null });
	});

	it("dissertativa com a nota toda é certa; com zero, errada", () => {
		let diagnostico = aplicarResposta(emAndamento(), "q3", { confianca: 1, texto: "x", tempoMs: 1 });
		diagnostico = aplicarCorrecao(diagnostico, "q3", { ...CORRECAO, total: 5 });
		expect(resumoDoDiagnostico(diagnostico, ["c-a"]).conceitos[0]!.questoes).toEqual([{ id: "q3", tipo: "dissertativa", resultado: "certa", nota: { total: 5, max: 5 } }]);
		let zero = aplicarResposta(emAndamento(), "q3", { confianca: 1, texto: "x", tempoMs: 1 });
		zero = aplicarCorrecao(zero, "q3", { ...CORRECAO, total: 0 });
		expect(resumoDoDiagnostico(zero, ["c-a"]).conceitos[0]!.questoes[0]!.resultado).toBe("errada");
	});
});

describe("paraATela", () => {
	it("enquanto falta responder, sem o gabarito; com tudo respondido, inteiro", () => {
		const parcial = aplicarResposta(emAndamento(), "q2", { confianca: 3, escolha: 0, tempoMs: 10 }, DEPOIS);
		const tela = paraATela(parcial);
		expect(tela.questoes[0]).toEqual({ id: "q1", tipo: "alternativa", conceitos: ["c-a"], enunciado: "Sobre c-a?", alternativas: [{ texto: "Errada um" }, { texto: "Certa" }, { texto: "Errada dois" }] });
		expect(tela.questoes[2]).toEqual({ id: "q3", tipo: "dissertativa", conceitos: ["c-a"], enunciado: "Explique c-a." });
		expect(tela.respostas.q2).toEqual({ confianca: 3, escolha: 0, tempoMs: 10, respondidaEm: DEPOIS.toISOString() });
		expect(JSON.stringify(tela)).not.toMatch(/correta|confusao|explicacao|respostaModelo|rubrica|correcao/);
		expect(parcial.questoes[0]).toEqual(Q1);

		// A dissertativa respondida e ainda sem correção, com uma alternativa por responder: sem a correção.
		let quase = aplicarResposta(emAndamento(), "q3", { confianca: 1, texto: "x", tempoMs: 1 });
		quase = aplicarCorrecao(quase, "q3", CORRECAO);
		expect(paraATela(quase).respostas.q3).toEqual({ confianca: 1, texto: "x", tempoMs: 1, respondidaEm: expect.any(String) });

		// O contexto não é gabarito: fica na tela.
		const comContexto = emAndamento();
		comContexto.questoes[0]!.contexto = "```python\nlen(x)\n```";
		expect(paraATela(comContexto).questoes[0]).toMatchObject({ contexto: "```python\nlen(x)\n```", enunciado: "Sobre c-a?" });

		const completo = respondido();
		expect(paraATela(completo)).toEqual(completo);
		expect(paraATela({ autoavaliacao: { "c-a": 1 }, questoes: [], respostas: {} })).toEqual({ autoavaliacao: { "c-a": 1 }, questoes: [], respostas: {} });
	});
});

describe("invalidação e confirmação da etapa", () => {
	const comEmAndamento = (): Curso => ({ ...cursoNoDiagnostico(), diagnosticoEmAndamento: emAndamento() });

	it("o que invalida o Diagnóstico apaga também o em andamento (e avisa)", () => {
		const casos: Array<[string, Parameters<typeof confirmarEtapa>[1], unknown]> = [
			["materiais", "materiais", { arquivos: [{ arquivo: "aula-04.pdf", hash: "novo" }] }],
			["objetivo", "objetivo", { ...OBJETIVO, motivo: "Outro" }],
			["mapa", "mapa", { conceitos: ["c-a", "c-b"] }],
		];
		for (const [, etapa, dados] of casos) {
			const curso = comEmAndamento();
			expect(oQueInvalida(curso, etapa, dados as never)).toContain("diagnostico");
			const resultado = confirmarEtapa(curso, etapa, dados as never, DEPOIS);
			expect(resultado.invalidadas).toContain("diagnostico");
			expect(resultado.curso.diagnosticoEmAndamento).toBeUndefined();
			expect("diagnosticoEmAndamento" in resultado.curso).toBe(false);
		}
	});

	it("o que não invalida o Diagnóstico deixa o em andamento", () => {
		const curso = comEmAndamento();
		const prazo = confirmarEtapa(curso, "basico", { ...BASICO, prazo: "2026-12-01" }, DEPOIS);
		expect(prazo.invalidadas).toEqual([]);
		expect(prazo.curso.diagnosticoEmAndamento).toEqual(emAndamento());
		const mesmoMapa = confirmarEtapa(curso, "mapa", MAPA, DEPOIS);
		expect(mesmoMapa.invalidadas).toEqual([]);
		expect(mesmoMapa.curso).toEqual(curso);
	});

	it("validarEtapa diagnostico: só com tudo respondido, corrigido e a autoavaliação completa", () => {
		const curso = cursoNoDiagnostico();
		const contexto = { curso, agora: MAIS_TARDE };
		expect(() => validarEtapa("diagnostico", emAndamento(), contexto)).toThrow(/Responda todas as questões.*q1, q2, q3/);
		const semCorrecao = aplicarResposta(aplicarResposta(aplicarResposta(emAndamento(), "q1", { confianca: 1, escolha: 0, tempoMs: 1 }), "q2", { confianca: 1, escolha: 0, tempoMs: 1 }), "q3", { confianca: 1, texto: "x", tempoMs: 1 });
		expect(() => validarEtapa("diagnostico", semCorrecao, contexto)).toThrow(/Espere a correção da dissertativa q3/);
		expect(() => validarEtapa("diagnostico", { ...respondido(), autoavaliacao: { "c-a": 3 } }, contexto)).toThrow(/Falta a autoavaliação de 2 conceitos do curso: c-b, c-c/);
		expect(() => validarEtapa("diagnostico", { autoavaliacao: { "c-a": 1, "c-b": 1, "c-c": 1 }, questoes: [], respostas: {} }, contexto)).toThrow(/Gere as questões/);
		const concluido = validarEtapa("diagnostico", respondido(), contexto);
		expect(concluido).toEqual({ ...respondido(), concluidoEm: MAIS_TARDE.toISOString() });
		expect(Object.keys(concluido)).toEqual(["autoavaliacao", "questoes", "geradoEm", "modelo", "custo", "respostas", "concluidoEm"]);
		// Já concluído: o concluidoEm fica (confirmar de novo com o mesmo não invalida o Esqueleto).
		expect(validarEtapa("diagnostico", concluido, { curso, agora: DEPOIS }).concluidoEm).toBe(MAIS_TARDE.toISOString());
	});

	it("confirmar o Diagnóstico tira o em andamento e anda para o Esqueleto", () => {
		const curso = { ...cursoNoDiagnostico(), diagnosticoEmAndamento: respondido() };
		const concluido = validarEtapa("diagnostico", curso.diagnosticoEmAndamento, { curso, agora: MAIS_TARDE });
		const resultado = confirmarEtapa(curso, "diagnostico", concluido, MAIS_TARDE);
		expect(resultado.invalidadas).toEqual([]);
		expect(resultado.curso.diagnostico).toEqual(concluido);
		expect("diagnosticoEmAndamento" in resultado.curso).toBe(false);
		expect(resultado.curso.etapa).toBe("esqueleto");
	});
});

describe("no disco", () => {
	let dados: string;
	let materia: string;
	const CURSO = "p1-regressao";
	const PROMPT = { nome: "diagnostico.md", hash: "abc123" };

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-diagnostico-"));
		materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
		await gravarCurso(dados, cursoNoDiagnostico(CURSO, materia));
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	const doAprendiz = async () => (await lerEventos(eventosAprendiz(dados))).eventos;
	const daMateria = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo !== "criou_materia");

	it("o diagnóstico inteiro: autoavaliação, questões, respostas, correção e conclusão, com os eventos em cada arquivo", async () => {
		// Autoavaliação parcial e depois completa: só os que mudaram ganham evento.
		await salvarAutoavaliacao(dados, materia, CURSO, { "c-a": 2, "c-b": 0 }, { agora: AGORA, prompt: PROMPT, sessao: "s1" });
		let eventos = await doAprendiz();
		expect(eventos.map((evento) => [evento.verbo, evento.objeto.conceitos, evento.resultado])).toEqual([
			["autoavaliou_conceito", ["c-a"], { nivel: 2 }],
			["autoavaliou_conceito", ["c-b"], { nivel: 0 }],
		]);
		expect(eventos[0]).toMatchObject({ sessao: "s1", objeto: { materia, curso: CURSO }, contexto: { fase: "diagnostico", prompt: PROMPT } });
		await salvarAutoavaliacao(dados, materia, CURSO, { "c-a": 2, "c-b": 1, "c-c": 3 }, { agora: AGORA });
		eventos = await doAprendiz();
		expect(eventos.slice(2).map((evento) => [evento.objeto.conceitos, evento.resultado])).toEqual([
			[["c-b"], { nivel: 1 }],
			[["c-c"], { nivel: 3 }],
		]);
		const antes = await lerCurso(dados, materia, CURSO);
		expect(await salvarAutoavaliacao(dados, materia, CURSO, { "c-c": 3, "c-b": 1, "c-a": 2 }, { agora: DEPOIS })).toEqual(antes);
		expect(await doAprendiz()).toHaveLength(4);
		expect(await lerCurso(dados, materia, CURSO)).toEqual(antes);
		await expect(salvarAutoavaliacao(dados, materia, CURSO, { "c-x": 1 })).rejects.toThrow(/não é do curso/);
		await expect(salvarAutoavaliacao(dados, materia, CURSO, { "c-a": 7 })).rejects.toThrow(ErroDiagnostico);

		// Questões: substituem as anteriores; o evento vai para a matéria.
		const curso = await gravarQuestoes(dados, materia, CURSO, [Q1, Q2, Q3], { modelo: "openrouter/openai/gpt-6.1-sol", custo: 0.03 }, { agora: AGORA, prompt: PROMPT });
		expect(curso.diagnosticoEmAndamento).toEqual({ ...emAndamento(), autoavaliacao: { "c-a": 2, "c-b": 1, "c-c": 3 } });
		expect(await daMateria()).toMatchObject([
			{ verbo: "gerou_diagnostico", objeto: { materia, curso: CURSO }, resultado: { questoes: 3, custo: 0.03 }, contexto: { fase: "diagnostico", modelo: "openrouter/openai/gpt-6.1-sol", prompt: PROMPT } },
		]);

		// Alternativa: evento na hora, no aprendiz.
		await gravarResposta(dados, materia, CURSO, "q2", { confianca: 4, escolha: 0, tempoMs: 30000 }, { agora: DEPOIS });
		eventos = await doAprendiz();
		expect(eventos).toHaveLength(5);
		expect(eventos[4]).toMatchObject({
			verbo: "respondeu_questao",
			objeto: { materia, curso: CURSO, conceitos: ["c-b"], questao: "q2" },
			resultado: { correta: false, escolha: 0, confusao: "Confunde A com B.", confianca: 4, tempoMs: 30000 },
			contexto: { fase: "diagnostico", modelo: "openrouter/openai/gpt-6.1-sol" },
		});
		await gravarResposta(dados, materia, CURSO, "q1", { confianca: 3, escolha: 1, tempoMs: 1000 }, { agora: DEPOIS });
		expect((await doAprendiz())[5]!.resultado).toEqual({ correta: true, escolha: 1, confianca: 3, tempoMs: 1000 });
		await expect(gravarResposta(dados, materia, CURSO, "q1", { confianca: 3, escolha: 1, tempoMs: 1000 })).rejects.toThrow(/já foi respondida/);

		// Dissertativa: sem evento até a correção.
		await gravarResposta(dados, materia, CURSO, "q3", { confianca: 2, texto: "O resíduo é a diferença.", tempoMs: 180000 }, { agora: DEPOIS });
		expect(await doAprendiz()).toHaveLength(6);
		expect((await lerCurso(dados, materia, CURSO)).diagnosticoEmAndamento!.respostas.q3).toEqual({ confianca: 2, texto: "O resíduo é a diferença.", tempoMs: 180000, respondidaEm: DEPOIS.toISOString() });
		await expect(concluirDiagnostico(dados, materia, CURSO)).rejects.toThrow(/Espere a correção/);

		await gravarCorrecao(dados, materia, CURSO, "q3", CORRECAO, { agora: DEPOIS, prompt: { nome: "corretor.md", hash: "def" } });
		eventos = await doAprendiz();
		expect(eventos).toHaveLength(7);
		expect(eventos[6]).toMatchObject({
			verbo: "respondeu_dissertativa",
			objeto: { materia, curso: CURSO, conceitos: ["c-a"], questao: "q3" },
			resultado: {
				confianca: 2,
				tempoMs: 180000,
				total: 3,
				max: 5,
				criterios: [
					{ criterio: "Define o resíduo", pontos: 2, max: 2 },
					{ criterio: "Dá um exemplo", pontos: 0, max: 2 },
					{ criterio: "Usa a notação", pontos: 1, max: 1 },
				],
				texto: "O resíduo é a diferença.",
			},
			contexto: { fase: "diagnostico", modelo: "openrouter/openai/gpt-6.1-sol", prompt: { nome: "corretor.md", hash: "def" } },
		});

		// Conclusão: a etapa confirmada, sem o em andamento; o evento na matéria.
		const { curso: concluido, invalidadas, resumo } = await concluirDiagnostico(dados, materia, CURSO, { agora: MAIS_TARDE });
		expect(invalidadas).toEqual([]);
		expect(resumo.total).toEqual({ acertos: 1, alternativas: 2, dissertativas: 1, nota: 0.6 });
		expect(concluido.etapa).toBe("esqueleto");
		expect(concluido.diagnostico).toMatchObject({ concluidoEm: MAIS_TARDE.toISOString(), autoavaliacao: { "c-a": 2, "c-b": 1, "c-c": 3 } });
		const lido = await lerCurso(dados, materia, CURSO);
		expect(lido).toEqual(concluido);
		expect("diagnosticoEmAndamento" in lido).toBe(false);
		expect((await daMateria()).map((evento) => [evento.verbo, evento.resultado])).toEqual([
			["gerou_diagnostico", { questoes: 3, custo: 0.03 }],
			["concluiu_diagnostico", { acertos: 1, alternativas: 2, dissertativas: 1, nota: 0.6 }],
		]);
		// Nenhum evento de aprendizagem na matéria nem da linha do tempo no aprendiz.
		expect((await doAprendiz()).every((evento) => ["autoavaliou_conceito", "respondeu_questao", "respondeu_dissertativa"].includes(evento.verbo))).toBe(true);
		await expect(concluirDiagnostico(dados, materia, CURSO)).rejects.toThrow(/Não há diagnóstico em andamento/);
	});

	it("gerar exige a autoavaliação completa; gerar de novo descarta as respostas", async () => {
		await expect(gravarQuestoes(dados, materia, CURSO, [Q1], { modelo: "m", custo: 0 })).rejects.toThrow(/todos os conceitos/);
		await salvarAutoavaliacao(dados, materia, CURSO, { "c-a": 1, "c-b": 1, "c-c": 1 });
		await expect(gravarResposta(dados, materia, CURSO, "q1", { confianca: 1, escolha: 0, tempoMs: 1 })).rejects.toThrow(/Gere as questões/);
		await gravarQuestoes(dados, materia, CURSO, [Q1, Q2], { modelo: "m", custo: 0.01 });
		await gravarResposta(dados, materia, CURSO, "q1", { confianca: 1, escolha: 0, tempoMs: 1 });
		const curso = await gravarQuestoes(dados, materia, CURSO, [Q2], { modelo: "m", custo: 0.02 });
		expect(curso.diagnosticoEmAndamento).toMatchObject({ questoes: [Q2], respostas: {}, custo: 0.02 });
		expect((await daMateria()).filter((evento) => evento.verbo === "gerou_diagnostico")).toHaveLength(2);
	});

	it("salvar a autoavaliação exige as etapas até o Mapa", async () => {
		await gravarCurso(dados, novoCurso("cedo", materia, BASICO, AGORA));
		await expect(salvarAutoavaliacao(dados, materia, "cedo", { "c-a": 1 })).rejects.toThrow(/Confirme antes a etapa Materiais/);
	});

	it("o em andamento sobrevive à leitura e à gravação do curso.json", async () => {
		const curso = { ...cursoNoDiagnostico(CURSO, materia), diagnosticoEmAndamento: respondido() };
		await gravarCurso(dados, curso);
		const lido = await lerCurso(dados, materia, CURSO);
		expect(lido.diagnosticoEmAndamento).toEqual(respondido());
		expect(Object.keys(lido).indexOf("diagnosticoEmAndamento")).toBe(Object.keys(lido).indexOf("diagnostico") - 1);
	});

	describe("trechosDosConceitos", () => {
		async function extraido(arquivo: string, trechos: Array<{ local: string; nome: string; texto: string }>) {
			const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
			await mkdir(pasta, { recursive: true });
			for (const trecho of trechos) {
				await writeFile(join(pasta, `${trecho.nome}.md`), `---\narquivo: ${arquivo}\nlocal: ${trecho.local}\norigem: texto\n---\n\n${trecho.texto}\n`, "utf8");
			}
			const manifesto = { versao: 1, arquivo, hash: "h", tamanho: 1, tipo: "pdf", extraidoEm: AGORA.toISOString(), custo: 0, avisos: [], trechos: trechos.map(({ local, nome }) => ({ local, nome, origem: "texto" })) };
			await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");
		}

		const referencia = (arquivo: string, trecho: string) => ({ arquivo, local: trecho.replace("pagina-", "página "), trecho });

		beforeEach(async () => {
			await extraido("aula.pdf", [
				{ local: "página 1", nome: "pagina-1", texto: "a".repeat(3000) },
				{ local: "página 2", nome: "pagina-2", texto: "b".repeat(5000) },
				{ local: "página 3", nome: "pagina-3", texto: "c".repeat(100) },
			]);
		});

		it("até 6 mil por conceito; o trecho que não cabe é cortado; o que falta é pulado", async () => {
			const trechos = await trechosDosConceitos(dados, materia, [
				{ id: "k1", referencias: [referencia("aula.pdf", "pagina-1"), referencia("aula.pdf", "pagina-2"), referencia("aula.pdf", "pagina-3")] },
				{ id: "k2", referencias: [referencia("sumiu.pdf", "pagina-1"), referencia("aula.pdf", "pagina-9"), referencia("aula.pdf", "pagina-3"), referencia("aula.pdf", "pagina-3")] },
				{ id: "k3", referencias: [] },
			]);
			expect(trechos.map((conceito) => [conceito.id, conceito.trechos.map((trecho) => [trecho.local, trecho.texto.length, trecho.cortado ?? false])])).toEqual([
				["k1", [["página 1", 3000, false], ["página 2", 3000, true]]],
				["k2", [["página 3", 100, false]]],
				["k3", []],
			]);
			expect(trechos[0]!.trechos[1]).toEqual({ arquivo: "aula.pdf", local: "página 2", texto: "b".repeat(3000), cortado: true });
		});

		it("até 40 mil no total (aqui, limites menores)", async () => {
			const trechos = await trechosDosConceitos(
				dados,
				materia,
				[
					{ id: "k1", referencias: [referencia("aula.pdf", "pagina-1"), referencia("aula.pdf", "pagina-2")] },
					{ id: "k2", referencias: [referencia("aula.pdf", "pagina-3")] },
				],
				{ porConceito: 10_000, total: 3500 },
			);
			expect(trechos.map((conceito) => conceito.trechos.map((trecho) => trecho.texto.length))).toEqual([[3000, 500], []]);
		});
	});
});
