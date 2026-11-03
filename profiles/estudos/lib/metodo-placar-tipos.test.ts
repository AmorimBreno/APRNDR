// Testes do placar de um módulo concluído (docs/metodo-experimentos.md, "O
// placar"): cada métrica com a sua regra (a 1ª tentativa, a última de cada
// lição e de cada bloco, o mapa da confiança do Brier), n = 0 dando null, o
// histórico dos módulos anteriores e a comparação do atual com a média.

import { describe, expect, it } from "vitest";
import type { Evento } from "./eventos.ts";
import {
	compararComHistorico,
	comparacaoLida,
	historicoDosModulos,
	IDS_METRICAS,
	METRICAS,
	placarDoModulo,
	placarDoModuloNosEventos,
	placarLido,
	tabelaDoHistorico,
	textoDaMetrica,
	type ModuloConcluido,
} from "./metodo-placar-tipos.ts";
import type { ModuloGerado } from "./modulo-tipos.ts";

let contador = 0;
const evento = (verbo: string, objeto: Record<string, unknown>, resultado: Record<string, unknown> = {}, ts = "2026-11-01T12:00:00.000Z"): Evento =>
	({ id: `ev-${++contador}`, ts, verbo, objeto: { materia: "mat", curso: "curso-a", modulo: "m1", ...objeto }, resultado }) as Evento;

const quiz = (questao: string, tentativa: number, correta: boolean, confianca?: number) => evento("respondeu_questao", { licao: "l1", questao }, { tentativa, correta, ...(confianca ? { confianca } : {}) });
const pergunta = (questao: string, avaliacao: string, confianca?: number) => evento("respondeu_verificacao", { licao: "l1", questao }, { avaliacao, ...(confianca ? { confianca } : {}) });
const dissertativa = (questao: string, tentativa: number, total: number, max: number) => evento("respondeu_dissertativa", { licao: "l2", questao }, { tentativa, total, max, confianca: 2 });

describe("placarDoModulo", () => {
	it("sem eventos, tudo zerado e as taxas null (nunca 0)", () => {
		const placar = placarDoModulo([], 2);
		expect(placar.quiz).toEqual({ acertos: 0, total: 0, taxa: null });
		expect(placar.perguntas).toEqual({ pontos: 0, total: 0, taxa: null });
		expect(placar.dissertativas).toEqual({ pontos: 0, max: 0, questoes: 0, taxa: null });
		expect(placar.naoSabia).toEqual({ quantos: 0, questoes: 0, taxa: null });
		expect(placar.questionario).toEqual({
			licoes: 0,
			entendimento: { media: null, n: 0 },
			clareza: { media: null, n: 0 },
			exemplos: { media: null, n: 0 },
			questoes: { media: null, n: 0 },
			ritmo: { media: null, n: 0 },
		});
		expect(placar.blocos).toEqual({ ruim: 0, bom: 0, otimo: 0, total: 0 });
		expect(placar.pedidosDeExplicacao).toEqual({ total: 0, porLicao: 0 });
		expect(placar.termosGuardados).toEqual({ total: 0, porLicao: 0 });
		expect(placar.calibracao).toEqual({ brier: null, n: 0 });
		expect(placar.licoes).toBe(2);
		// Sem lições, o "por lição" é null.
		expect(placarDoModulo([], 0).pedidosDeExplicacao).toEqual({ total: 0, porLicao: null });
	});

	it("quiz: só a 1ª tentativa conta, a primeira de cada questão", () => {
		const placar = placarDoModulo([quiz("q1", 1, true), quiz("q1", 2, true), quiz("q2", 1, false), quiz("q2", 2, true), quiz("q3", 1, true), quiz("q3", 1, false), quiz("q4", 2, true)], 2);
		expect(placar.quiz).toEqual({ acertos: 2, total: 3, taxa: 0.6667 });
	});

	it("perguntas: a primeira resposta de cada questão; certa vale 1, em parte 0,5, errada 0", () => {
		const placar = placarDoModulo([pergunta("v1", "certa"), pergunta("v1", "errada"), pergunta("v2", "parcial"), pergunta("v3", "errada"), pergunta("v4", "certa")], 1);
		expect(placar.perguntas).toEqual({ pontos: 2.5, total: 4, taxa: 0.625 });
	});

	it("dissertativas: a soma de total e de max das de 1ª tentativa, a primeira de cada questão", () => {
		const placar = placarDoModulo([dissertativa("d1", 1, 2.5, 5), dissertativa("d1", 2, 5, 5), dissertativa("d2", 1, 4, 5), dissertativa("d3", 2, 5, 5)], 1);
		expect(placar.dissertativas).toEqual({ pontos: 6.5, max: 10, questoes: 2, taxa: 0.65 });
	});

	it('"Não sabia": as questões distintas, de todas as distintas com resposta ou com "Não sabia"', () => {
		const placar = placarDoModulo(
			[
				quiz("q1", 1, true),
				quiz("q1", 2, true),
				pergunta("v1", "certa"),
				dissertativa("d1", 1, 1, 5),
				evento("nao_sabia_questao", { licao: "l1", questao: "q2" }, { tipo: "alternativa", tentativas: 0 }),
				evento("nao_sabia_questao", { licao: "l1", questao: "q1" }, { tipo: "alternativa", tentativas: 2 }),
				evento("nao_sabia_questao", { licao: "l1", questao: "q1" }, { tipo: "alternativa", tentativas: 2 }),
			],
			2,
		);
		// Distintas: q1, v1, d1, q2 → 4; "Não sabia": q2 e q1 → 2.
		expect(placar.naoSabia).toEqual({ quantos: 2, questoes: 4, taxa: 0.5 });
	});

	it("questionário: o último de cada lição, a média de cada nota e quantas lições a deram", () => {
		const q = (licao: string, notas: Record<string, number>, ts: string) => evento("avaliou_licao", { licao }, { notas, texto: "" }, ts);
		const placar = placarDoModulo(
			[
				q("l1", { entendimento: 1, clareza: 1, ritmo: 5 }, "2026-11-01T10:00:00.000Z"),
				q("l1", { entendimento: 4, clareza: 5 }, "2026-11-01T11:00:00.000Z"),
				q("l2", { entendimento: 3, exemplos: 4, ritmo: 2 }, "2026-11-01T12:00:00.000Z"),
			],
			2,
		);
		expect(placar.questionario).toEqual({
			licoes: 2,
			entendimento: { media: 3.5, n: 2 },
			clareza: { media: 5, n: 1 },
			exemplos: { media: 4, n: 1 },
			questoes: { media: null, n: 0 },
			ritmo: { media: 2, n: 1 },
		});
	});

	it("feedback dos blocos: a última nota de cada bloco; a antiga melhorar vale Ruim", () => {
		const nota = (bloco: string, avaliacao: string) => evento("avaliou_bloco", { licao: "l1", bloco }, { avaliacao, motivos: [], texto: "" });
		const placar = placarDoModulo([nota("b1", "ruim"), nota("b1", "otimo"), nota("b2", "melhorar"), nota("b3", "bom"), nota("b4", "bom"), nota("b5", "desconhecida")], 1);
		expect(placar.blocos).toEqual({ ruim: 1, bom: 2, otimo: 1, total: 4 });
	});

	it("pedidos de explicação e termos guardados: absoluto e por lição (as lições do módulo ou, sem elas, as dos eventos)", () => {
		const eventos = [
			evento("pediu_explicacao", { licao: "l1", bloco: "b1" }, { trecho: "x", tipo: "nao_sei" }),
			evento("pediu_explicacao", { licao: "l2", bloco: "b9" }, { trecho: "y", tipo: "nao_sei" }),
			evento("pediu_explicacao", { licao: "l2", bloco: "b9" }, { trecho: "z", tipo: "explique_melhor" }),
			evento("guardou_termo", { licao: "l1", bloco: "b1", explicacao: "e" }, { termo: "t" }),
		];
		const com = placarDoModulo(eventos, 4);
		expect(com.pedidosDeExplicacao).toEqual({ total: 3, porLicao: 0.75 });
		expect(com.termosGuardados).toEqual({ total: 1, porLicao: 0.25 });
		const sem = placarDoModulo(eventos);
		expect(sem.licoes).toBe(2);
		expect(sem.pedidosDeExplicacao).toEqual({ total: 3, porLicao: 1.5 });
	});

	it("calibração: o Brier de quizzes na 1ª tentativa e perguntas com a confiança 1 a 4 (0,25, 0,5, 0,75 e 0,95)", () => {
		const placar = placarDoModulo(
			[
				quiz("q1", 1, true, 4), // (0,95 − 1)² = 0,0025
				quiz("q2", 1, false, 4), // (0,95 − 0)² = 0,9025
				quiz("q3", 1, true, 1), // (0,25 − 1)² = 0,5625
				quiz("q4", 2, true, 3), // não conta: não é a 1ª tentativa
				quiz("q5", 1, true), // sem confiança: não entra no Brier, mas entra no quiz
				pergunta("v1", "parcial", 2), // (0,5 − 0,5)² = 0
				pergunta("v2", "errada", 3), // (0,75 − 0)² = 0,5625
				pergunta("v3", "certa", 9), // confiança fora de 1 a 4: não entra
			],
			1,
		);
		expect(placar.calibracao.n).toBe(5);
		expect(placar.calibracao.brier).toBe(0.4060); // (0,0025 + 0,9025 + 0,5625 + 0 + 0,5625) / 5 = 0,406
		expect(placar.quiz.total).toBe(4);
		expect(placar.perguntas.total).toBe(3);
		expect(placar.calibracao).toEqual({ brier: 0.406, n: 5 });
	});

	it("placarDoModuloNosEventos usa só os eventos do módulo, da geração atual, e as lições dele", () => {
		const modulo = { materia: "mat", curso: "curso-a", id: "m1", geradoEm: "2026-11-01T10:00:00.000Z", licoes: [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }] } as unknown as ModuloGerado;
		const placar = placarDoModuloNosEventos(
			[
				quiz("q1", 1, true),
				evento("respondeu_questao", { modulo: "m2", licao: "l1", questao: "q1" }, { tentativa: 1, correta: false }),
				evento("respondeu_questao", { curso: "outro", licao: "l1", questao: "q1" }, { tentativa: 1, correta: false }),
				evento("respondeu_questao", { licao: "l1", questao: "q9" }, { tentativa: 1, correta: false }, "2026-10-30T00:00:00.000Z"),
				evento("pediu_explicacao", { licao: "l1", bloco: "b1" }, { trecho: "x", tipo: "nao_sei" }),
			],
			modulo,
		);
		expect(placar.quiz).toEqual({ acertos: 1, total: 1, taxa: 1 });
		expect(placar.licoes).toBe(4);
		expect(placar.pedidosDeExplicacao).toEqual({ total: 1, porLicao: 0.25 });
	});

	it("placarLido lê de volta o que foi gravado e recusa o que não é um placar", () => {
		const placar = placarDoModulo([quiz("q1", 1, true, 3), pergunta("v1", "certa", 2)], 2);
		expect(placarLido(JSON.parse(JSON.stringify(placar)))).toEqual(placar);
		expect(() => placarLido(null)).toThrow(/não é um objeto/);
		expect(() => placarLido({ ...placar, quiz: { acertos: 1 } })).toThrow(/total/);
	});
});

describe("o histórico e a comparação", () => {
	const gerado = (materia: string, curso: string, id: string, concluidoEm: string | undefined, extra: Partial<ModuloGerado> = {}): ModuloGerado =>
		({
			versao: 1,
			id,
			curso,
			materia,
			situacao: "gerado",
			licoes: [{ id: "l1", titulo: "L", objetivo: "", conceitos: [], blocos: [] }],
			geradoEm: "2026-10-01T00:00:00.000Z",
			modelo: "x",
			custo: 0,
			materiaisUsados: [],
			...(concluidoEm ? { concluidoEm } : {}),
			...extra,
		}) as ModuloGerado;
	const concluido = (materia: string, curso: string, id: string, em: string | undefined, extra: Partial<ModuloGerado> = {}): ModuloConcluido => ({
		modulo: gerado(materia, curso, id, em, extra),
		cursoNome: `Curso ${curso}`,
		moduloNome: `Módulo ${id}`,
	});
	const doModulo = (materia: string, curso: string, modulo: string, ...respostas: boolean[]) =>
		respostas.map((correta, i) => evento("respondeu_questao", { materia, curso, modulo, licao: "l1", questao: `q${i + 1}` }, { tentativa: 1, correta, confianca: 3 }, "2026-10-15T10:00:00.000Z"));

	it("os concluídos antes do atual, de todas as matérias e cursos, por concluidoEm, os 8 últimos, com o placar recalculado dos eventos", () => {
		const antes = Array.from({ length: 10 }, (_, i) => concluido("mat", "curso-a", `m${i + 1}`, `2026-10-${String(i + 10).padStart(2, "0")}T10:00:00.000Z`));
		const todos: ModuloConcluido[] = [
			...antes,
			concluido("outra", "curso-b", "m1", "2026-10-25T10:00:00.000Z", { ajustesUsados: [{ arquivo: "quiz.md", ajuste: "a-1", estado: "em teste" }] }),
			concluido("mat", "curso-c", "m1", "2026-10-26T10:00:00.000Z"),
			concluido("mat", "curso-a", "m20", "2026-10-30T10:00:00.000Z"), // o atual
			concluido("mat", "curso-a", "m21", "2026-11-02T10:00:00.000Z"), // depois do atual
			concluido("mat", "curso-a", "m22", undefined), // não concluído
		];
		const eventos = [...doModulo("outra", "curso-b", "m1", true, false), ...doModulo("mat", "curso-a", "m10", true, true)];
		const historico = historicoDosModulos(todos, eventos, { materia: "mat", curso: "curso-a", modulo: "m20", concluidoEm: "2026-10-30T10:00:00.000Z" });
		expect(historico).toHaveLength(8);
		expect(historico.map((item) => `${item.materia}/${item.curso}/${item.modulo}`)).toEqual([
			"mat/curso-a/m5",
			"mat/curso-a/m6",
			"mat/curso-a/m7",
			"mat/curso-a/m8",
			"mat/curso-a/m9",
			"mat/curso-a/m10",
			"outra/curso-b/m1",
			"mat/curso-c/m1",
		]);
		const m10 = historico[5]!;
		expect(m10).toMatchObject({ cursoNome: "Curso curso-a", moduloNome: "Módulo m10", concluidoEm: "2026-10-19T10:00:00.000Z", ajustesUsados: [] });
		expect(m10.placar.quiz).toEqual({ acertos: 2, total: 2, taxa: 1 });
		const outra = historico[6]!;
		expect(outra.ajustesUsados).toEqual([{ arquivo: "quiz.md", ajuste: "a-1", estado: "em teste" }]);
		expect(outra.placar.quiz).toEqual({ acertos: 1, total: 2, taxa: 0.5 });
		expect(historico[7]!.placar.quiz.taxa).toBeNull();
		// Com limite menor, os últimos.
		expect(historicoDosModulos(todos, eventos, { materia: "mat", curso: "curso-a", modulo: "m20", concluidoEm: "2026-10-30T10:00:00.000Z" }, 2).map((item) => item.curso)).toEqual(["curso-b", "curso-c"]);
		// Sem o concluidoEm do atual, todos os outros.
		expect(historicoDosModulos(todos, eventos, { materia: "mat", curso: "curso-a", modulo: "m20" }, 100)).toHaveLength(13);
	});

	it("a comparação: o atual contra a média dos módulos do histórico com amostra, com o n de cada um", () => {
		const doHistorico = (...respostas: boolean[]) => ({ placar: placarDoModulo(doModulo("mat", "curso-a", "m1", ...respostas), 1) });
		const atual = placarDoModulo(doModulo("mat", "curso-a", "m2", true, true, false), 1);
		const comparacao = compararComHistorico(atual, [doHistorico(true, false), doHistorico(false, false, false, true), doHistorico()]);
		expect(comparacao.quiz).toEqual({ atual: 0.6667, nAtual: 3, media: 0.375, nMedia: 6, modulos: 2 });
		// Sem amostra no histórico (nenhuma dissertativa), a média é null.
		expect(comparacao.dissertativas).toEqual({ atual: null, nAtual: 0, media: null, nMedia: 0, modulos: 0 });
		expect(Object.keys(comparacao)).toEqual([...IDS_METRICAS]);
		// Sem histórico, a média some.
		expect(compararComHistorico(atual, []).quiz).toEqual({ atual: 0.6667, nAtual: 3, media: null, nMedia: 0, modulos: 0 });
		expect(comparacaoLida(JSON.parse(JSON.stringify(comparacao)))).toEqual(comparacao);
		expect(() => comparacaoLida({})).toThrow(/métrica quiz/);
	});

	it("a tabela de texto: uma linha por módulo, com os n e '—' sem amostra, e o módulo atual por último", () => {
		const entrada = {
			materia: "mat",
			curso: "curso-a",
			cursoNome: "Curso A",
			modulo: "m1",
			moduloNome: "Busca",
			concluidoEm: "2026-10-10T10:00:00.000Z",
			ajustesUsados: [{ arquivo: "quiz.md" as const, ajuste: "a-1", estado: "em teste" as const }],
			placar: placarDoModulo(doModulo("mat", "curso-a", "m1", true, false, false, false), 1),
		};
		const atual = placarDoModulo(doModulo("mat", "curso-a", "m2", true, true), 1);
		const linhas = tabelaDoHistorico([entrada], { rotulo: "Curso A · Mais (curso-a/m2)", placar: atual, ajustesUsados: [] }).split("\n");
		expect(linhas).toHaveLength(3);
		expect(linhas[0]).toBe(`| Módulo | ${METRICAS.map((metrica) => metrica.nome).join(" | ")} | Ajustes que valeram na geração |`);
		expect(linhas[1]).toContain("| Curso A · Busca (curso-a/m1) | 25% (n=4) | — |");
		expect(linhas[1]).toContain("| quiz.md#a-1 (em teste) |");
		expect(linhas[2]).toContain("| Curso A · Mais (curso-a/m2) [ATUAL] | 100% (n=2) | — |");
		expect(linhas[2]!.endsWith("| nenhum |")).toBe(true);
		expect(textoDaMetrica({ tipo: "nota" }, { valor: 3.5, n: 2 })).toBe("3,5 (n=2)");
		expect(textoDaMetrica({ tipo: "brier" }, { valor: 0.2134, n: 5 })).toBe("0,21 (n=5)");
		expect(textoDaMetrica({ tipo: "taxa" }, { valor: null, n: 0 })).toBe("—");
	});
});
