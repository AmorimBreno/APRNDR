// @vitest-environment happy-dom
// As partes puras da etapa Diagnóstico do guia (diagnostico-tela.ts): a fase
// pelo curso, a contagem da autoavaliação, o salvamento adiado (com timers
// falsos), o placar, os critérios da correção, a frase da confusão e a
// situação da correção; o que a ponte guarda do diagnóstico (lerCursos); e as
// linhas da linha do tempo do diagnóstico (descreverEvento).

import type { AcaoRecebida } from "@estudos/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Curso } from "../../lib/curso-tipos.ts";
import type { DiagnosticoNaTela } from "../../lib/diagnostico-tipos.ts";
import type { Evento } from "../../lib/eventos.ts";
import { lerCursos } from "./cursos-ponte.ts";
import {
	contarMarcados,
	criarSalvadorAdiado,
	criteriosDoFeedback,
	faseDoDiagnostico,
	fraseDaConfusao,
	niveisDoCurso,
	numeroCurto,
	situacaoDaCorrecao,
	statusDaCorrecao,
	textoMarcados,
	textoPlacar,
} from "./diagnostico-tela.ts";
import { descreverEvento } from "./TelaCaderno.tsx";

const questoes: DiagnosticoNaTela["questoes"] = [
	{ id: "q1", tipo: "alternativa", conceitos: ["a"], enunciado: "?", alternativas: [{ texto: "x" }, { texto: "y" }, { texto: "z" }] },
	{ id: "q2", tipo: "dissertativa", conceitos: ["b"], enunciado: "?" },
];

describe("a fase do diagnóstico", () => {
	it("sem diagnóstico ou sem questões, autoavaliação", () => {
		expect(faseDoDiagnostico(null)).toBe("autoavaliacao");
		expect(faseDoDiagnostico(undefined)).toBe("autoavaliacao");
		expect(faseDoDiagnostico({ questoes: [], respostas: {} })).toBe("autoavaliacao");
	});

	it("com alguma sem resposta, questões; tudo respondido, resultado", () => {
		expect(faseDoDiagnostico({ questoes, respostas: {} })).toBe("questoes");
		const q1 = { confianca: 3 as const, escolha: 0, tempoMs: 10, respondidaEm: "x" };
		expect(faseDoDiagnostico({ questoes, respostas: { q1 } })).toBe("questoes");
		expect(faseDoDiagnostico({ questoes, respostas: { q1, q2: { confianca: 2, texto: "t", tempoMs: 5, respondidaEm: "x" } } })).toBe("resultado");
	});
});

describe("a autoavaliação", () => {
	it("conta só os conceitos do curso com nível de 0 a 3", () => {
		expect(contarMarcados(["a", "b", "c"], { a: 0, b: 3, x: 2 })).toBe(2);
		expect(contarMarcados(["a", "b"], { a: 4, b: "2" })).toBe(0);
		expect(contarMarcados([], {})).toBe(0);
	});

	it("o texto da contagem", () => {
		expect(textoMarcados(12, 24)).toBe("12 de 24 marcados");
		expect(textoMarcados(1, 3)).toBe("1 de 3 marcado");
		expect(textoMarcados(0, 3)).toBe("0 de 3 marcados");
	});

	it("manda só os níveis dos conceitos do curso, na ordem do curso", () => {
		expect(Object.entries(niveisDoCurso(["b", "a"], { a: 1, x: 2, b: 3 }))).toEqual([
			["b", 3],
			["a", 1],
		]);
	});
});

describe("o salvamento adiado", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("espera o atraso sem mudança e salva só o último valor", async () => {
		const salvos: number[] = [];
		const salvador = criarSalvadorAdiado(async (valor: number) => void salvos.push(valor), 600);
		salvador.mudar(1);
		await vi.advanceTimersByTimeAsync(400);
		salvador.mudar(2);
		await vi.advanceTimersByTimeAsync(400);
		expect(salvos).toEqual([]);
		expect(salvador.ocupado).toBe(true);
		await vi.advanceTimersByTimeAsync(200);
		expect(salvos).toEqual([2]);
		expect(salvador.ocupado).toBe(false);
	});

	it("um por vez: o que muda durante o voo sai quando ele termina", async () => {
		const salvos: number[] = [];
		const terminar: Array<() => void> = [];
		const salvador = criarSalvadorAdiado(
			(valor: number) =>
				new Promise<void>((resolver) => {
					salvos.push(valor);
					terminar.push(resolver);
				}),
			600,
		);
		salvador.mudar(1);
		await vi.advanceTimersByTimeAsync(600);
		expect(salvos).toEqual([1]);
		salvador.mudar(2);
		salvador.mudar(3);
		await vi.advanceTimersByTimeAsync(600);
		// O primeiro ainda está em voo: nada de um segundo ao mesmo tempo.
		expect(salvos).toEqual([1]);
		terminar[0]!();
		await vi.advanceTimersByTimeAsync(0);
		expect(salvos).toEqual([1, 3]);
		terminar[1]!();
		await vi.advanceTimersByTimeAsync(0);
		expect(salvador.ocupado).toBe(false);
	});

	it("esvaziar salva já o que falta e espera o voo", async () => {
		const salvos: number[] = [];
		const salvador = criarSalvadorAdiado(async (valor: number) => void salvos.push(valor), 600);
		salvador.mudar(7);
		await salvador.esvaziar();
		expect(salvos).toEqual([7]);
		await vi.advanceTimersByTimeAsync(1000);
		expect(salvos).toEqual([7]);
		await salvador.esvaziar();
		expect(salvos).toEqual([7]);
	});

	it("uma falha vai para aoFalhar e não trava a fila", async () => {
		const falhas: unknown[] = [];
		let vez = 0;
		const salvos: number[] = [];
		const salvador = criarSalvadorAdiado(
			async (valor: number) => {
				if (vez++ === 0) throw new Error("caiu");
				salvos.push(valor);
			},
			600,
			(erro) => falhas.push(erro),
		);
		salvador.mudar(1);
		await vi.advanceTimersByTimeAsync(600);
		expect(falhas).toHaveLength(1);
		salvador.mudar(2);
		await vi.advanceTimersByTimeAsync(600);
		expect(salvos).toEqual([2]);
	});
});

describe("o resultado", () => {
	it("o placar", () => {
		expect(textoPlacar({ acertos: 5, alternativas: 6, dissertativas: 1, nota: 0.7 })).toEqual({ alternativas: "Acertou 5 de 6 alternativas", dissertativa: "Dissertativa: 7/10" });
		expect(textoPlacar({ acertos: 1, alternativas: 1, dissertativas: 2, nota: 0.75 })).toEqual({ alternativas: "Acertou 1 de 1 alternativa", dissertativa: "Dissertativas: 7,5/10" });
		// Sem correção ainda, sem a linha da dissertativa.
		expect(textoPlacar({ acertos: 0, alternativas: 6, dissertativas: 1, nota: null })).toEqual({ alternativas: "Acertou 0 de 6 alternativas" });
		expect(textoPlacar({ acertos: 0, alternativas: 0, dissertativas: 0, nota: null })).toEqual({});
	});

	it("números curtos com vírgula", () => {
		expect(numeroCurto(7)).toBe("7");
		expect(numeroCurto(2.5)).toBe("2,5");
		expect(numeroCurto(6.666)).toBe("6,7");
	});

	it("o estado do retorno pela nota e os critérios atendidos com pelo menos metade dos pontos", () => {
		expect(statusDaCorrecao({ total: 5, max: 5 })).toBe("correct");
		expect(statusDaCorrecao({ total: 0, max: 5 })).toBe("incorrect");
		expect(statusDaCorrecao({ total: 3, max: 5 })).toBe("partial");
		const criterios = criteriosDoFeedback({
			criterios: [
				{ criterio: "Define", trechos: [], pontos: 1, max: 2, justificativa: "" },
				{ criterio: "Exemplo", trechos: [], pontos: 0.5, max: 2, justificativa: "" },
				{ criterio: "Fecha", trechos: [], pontos: 1, max: 1, justificativa: "" },
			],
		});
		expect(criterios.map((item) => item.met)).toEqual([true, false, true]);
		expect(criterios[1]!.label).toBe("Exemplo (0,5/2)");
	});

	it("a frase da confusão da escolhida", () => {
		expect(fraseDaConfusao("Confunde correlação com causalidade.")).toBe("Sua escolha confunde correlação com causalidade.");
		expect(fraseDaConfusao("confunde média e mediana")).toBe("Sua escolha confunde média e mediana.");
		expect(fraseDaConfusao("Troca o sinal do resíduo.")).toBe("Sua escolha: troca o sinal do resíduo.");
	});

	it("a situação da correção", () => {
		const base = { corrigida: false, corrigindo: false, erro: false, pedidaAqui: false };
		expect(situacaoDaCorrecao({ ...base, corrigida: true, erro: true })).toBe("corrigida");
		expect(situacaoDaCorrecao({ ...base, corrigindo: true, erro: true })).toBe("corrigindo");
		expect(situacaoDaCorrecao({ ...base, erro: true, pedidaAqui: true })).toBe("falhou");
		expect(situacaoDaCorrecao({ ...base, pedidaAqui: true })).toBe("corrigindo");
		// Reaberto o guia, sem correção correndo: dá para pedir de novo.
		expect(situacaoDaCorrecao(base)).toBe("falhou");
	});
});

describe("o que a ponte guarda do diagnóstico", () => {
	const curso = { id: "p1", materia: "m", nome: "P1", situacao: "rascunho", etapa: "diagnostico" } as unknown as Curso;
	let numero = 0;
	const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++numero}`, acao, dados });

	it("gerando e corrigindo vêm do último curso", () => {
		const lido = lerCursos([recebida("curso", { materia: "m", curso, gerandoDiagnostico: true }), recebida("curso", { materia: "m", curso, corrigindo: ["q7"] })], "m");
		expect(lido.diagnosticos.p1).toEqual({ gerando: false, corrigindo: ["q7"] });
	});

	it("o erro de gerar fica até um curso dizer que está gerando de novo", () => {
		const erro = recebida("erro", { mensagem: "Falhou o modelo.", ao: "gerar_diagnostico", materia: "m", curso: "p1" });
		const depois = lerCursos([recebida("curso", { materia: "m", curso, gerandoDiagnostico: true }), erro, recebida("curso", { materia: "m", curso })], "m");
		expect(depois.diagnosticos.p1).toEqual({ gerando: false, corrigindo: [], erroGerar: { chave: erro.chave, mensagem: "Falhou o modelo." } });
		const outraVez = lerCursos([erro, recebida("curso", { materia: "m", curso, gerandoDiagnostico: true })], "m");
		expect(outraVez.diagnosticos.p1?.erroGerar).toBeUndefined();
	});

	it("o erro de corrigir tira a questão de corrigindo e fica até corrigir de novo", () => {
		const erro = recebida("erro", { mensagem: "JSON inválido.", ao: "corrigir", materia: "m", curso: "p1", questao: "q7" });
		const lido = lerCursos([recebida("curso", { materia: "m", curso, corrigindo: ["q7", "q8"] }), erro], "m");
		expect(lido.diagnosticos.p1).toEqual({ gerando: false, corrigindo: ["q8"], erroCorrigir: { chave: erro.chave, mensagem: "JSON inválido.", questao: "q7" } });
		const deNovo = lerCursos([erro, recebida("curso", { materia: "m", curso, corrigindo: ["q7"] })], "m");
		expect(deNovo.diagnosticos.p1?.erroCorrigir).toBeUndefined();
	});

	it("erros de outra matéria ou de outras ações não entram", () => {
		const lido = lerCursos([recebida("erro", { mensagem: "x", ao: "gerar_diagnostico", materia: "outra", curso: "p1" }), recebida("erro", { mensagem: "y", ao: "confirmar", materia: "m", curso: "p1" })], "m");
		expect(lido.diagnosticos).toEqual({});
	});
});

describe("a linha do tempo do diagnóstico", () => {
	const evento = (verbo: string, resultado: Record<string, unknown>, objeto: Record<string, unknown> = { materia: "x", curso: "p1-regressao" }): Evento =>
		({ id: "e", ts: "2026-10-22T13:00:00.000Z", verbo, objeto, resultado }) as unknown as Evento;

	it("preparou: o curso (o id, sem o nome no evento), as questões e o custo", () => {
		const linha = descreverEvento(evento("gerou_diagnostico", { questoes: 8, custo: 0.03 }));
		expect(linha.texto).toBe("Diagnóstico preparado: p1-regressao");
		expect(linha.detalhe).toMatch(/^8 questões · US\$/);
		expect(descreverEvento(evento("gerou_diagnostico", { nome: "P1: regressão", questoes: 1, custo: 0 })).texto).toBe("Diagnóstico preparado: P1: regressão");
		expect(descreverEvento(evento("gerou_diagnostico", { questoes: 1, custo: 0 })).detalhe).toBe("1 questão");
	});

	it("concluiu: os acertos e a nota da dissertativa", () => {
		const linha = descreverEvento(evento("concluiu_diagnostico", { acertos: 5, alternativas: 6, dissertativas: 1, nota: 0.7 }));
		expect(linha.texto).toBe("Diagnóstico concluído: p1-regressao");
		expect(linha.detalhe).toBe("5 de 6 certas · dissertativa 7/10");
		expect(descreverEvento(evento("concluiu_diagnostico", { acertos: 1, alternativas: 6, dissertativas: 2, nota: 0.75 })).detalhe).toBe("1 de 6 certas · dissertativas 7,5/10");
	});
});
