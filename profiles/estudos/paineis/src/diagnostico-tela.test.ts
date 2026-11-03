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
	dividirQuestao,
	encurtarAlternativa,
	faseDoDiagnostico,
	fraseDaConfusao,
	gruposPorAssunto,
	letraDaAlternativa,
	niveisDoCurso,
	ordemDeNavegacao,
	questaoEmVista,
	resultadoNaTela,
	suaRespostaAlternativa,
	tomDoResultado,
	vizinhasNaOrdem,
	partesDaQuestao,
	numeroCurto,
	situacaoDaCorrecao,
	statusDaCorrecao,
	textoMarcados,
	pontosDasDissertativas,
	textoPlacar,
} from "./diagnostico-tela.ts";
import { descreverEvento } from "./LinhaDoTempo.tsx";

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
		// Com os pontos, a escala da rubrica (a mesma de cada questão).
		expect(textoPlacar({ acertos: 1, alternativas: 6, dissertativas: 1, nota: 0.75 }, { total: 6, max: 8 })).toEqual({ alternativas: "Acertou 1 de 6 alternativas", dissertativa: "Dissertativa: 6/8" });
		const questoes = [
			{ id: "q1", tipo: "alternativa" },
			{ id: "q7", tipo: "dissertativa" },
			{ id: "q8", tipo: "dissertativa" },
		];
		expect(pontosDasDissertativas({ questoes, respostas: { q7: { correcao: { total: 6, max: 8 } }, q8: { correcao: { total: 1.5, max: 5 } } } })).toEqual({ total: 7.5, max: 13 });
		expect(pontosDasDissertativas({ questoes, respostas: {} })).toBeUndefined();
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

describe("o contexto e a pergunta (dividirQuestao)", () => {
	it("a questão antiga do Word2Vec: o contexto com o código em blocos, a pergunta sozinha", () => {
		const enunciado =
			"No modelo Word2Vec apresentado, `len(model_CBOW.wv.index_to_key)` retorna 4240 e `len(model_CBOW.wv['bayer'])` retorna 50. Como interpretar conjuntamente esses resultados?";
		expect(dividirQuestao(enunciado)).toEqual({
			contexto: "No modelo Word2Vec apresentado,\n\n```\nlen(model_CBOW.wv.index_to_key)\n```\n\nretorna 4240 e\n\n```\nlen(model_CBOW.wv['bayer'])\n```\n\nretorna 50.",
			pergunta: "Como interpretar conjuntamente esses resultados?",
		});
	});

	it("sem código: só a divisão", () => {
		expect(dividirQuestao("A reta ajustada passa pela origem. O resíduo médio é zero. O que isso diz sobre o intercepto?")).toEqual({
			contexto: "A reta ajustada passa pela origem. O resíduo médio é zero.",
			pergunta: "O que isso diz sobre o intercepto?",
		});
	});

	it("sem frase interrogativa, ou sem nada antes dela: nada muda", () => {
		expect(dividirQuestao("Explique a regressão linear em poucas frases.")).toEqual({ pergunta: "Explique a regressão linear em poucas frases." });
		expect(dividirQuestao("Por que o R² nunca cai ao acrescentar uma variável?")).toEqual({ pergunta: "Por que o R² nunca cai ao acrescentar uma variável?" });
		// A interrogação dentro do código não conta.
		expect(dividirQuestao("O operador `a ? b : c` aparece no trecho. Explique o que ele faz.")).toEqual({ pergunta: "O operador `a ? b : c` aparece no trecho. Explique o que ele faz." });
	});

	it("código curto fica em linha; o que vem depois da interrogação vai com a pergunta", () => {
		expect(dividirQuestao("A função `fit` ajusta o modelo, e `len(x)` dá 10. O que `fit` devolve? Justifique.")).toEqual({
			contexto: "A função `fit` ajusta o modelo, e `len(x)` dá 10.",
			pergunta: "O que `fit` devolve? Justifique.",
		});
		// Nome comprido sem cara de código (sem parênteses, ponto entre nomes, = ou ;) também fica.
		expect(dividirQuestao("A coluna `preco_medio_por_bairro` tem nulos. O que fazer?").contexto).toBe("A coluna `preco_medio_por_bairro` tem nulos.");
	});

	it("LaTeX não é código: nem o ponto nem a interrogação dentro dele contam", () => {
		expect(dividirQuestao("Considere $\\hat{y} = b_0 + b_1 x$ com $b_1 = 2.5$ e $f(x) = x^2$. O que $b_1$ mede?")).toEqual({
			contexto: "Considere $\\hat{y} = b_0 + b_1 x$ com $b_1 = 2.5$ e $f(x) = x^2$.",
			pergunta: "O que $b_1$ mede?",
		});
		expect(dividirQuestao("Vale $P(A?)$ aqui. Explique.")).toEqual({ pergunta: "Vale $P(A?)$ aqui. Explique." });
	});

	it("um bloco de código que já existe fica como está; código com três crases dentro usa cerca maior", () => {
		const enunciado = "Rode o trecho:\n\n```python\nx = [1, 2]\nprint(x.count(1))\n```\n\nO que é impresso?";
		expect(dividirQuestao(enunciado)).toEqual({ contexto: "Rode o trecho:\n\n```python\nx = [1, 2]\nprint(x.count(1))\n```", pergunta: "O que é impresso?" });
		expect(dividirQuestao("Veja `` nome = f'`{x}`' ``. Qual é o tipo de nome?").contexto).toBe("Veja\n\n```\nnome = f'`{x}`'\n```");
		expect(dividirQuestao("Veja ```` doc = '```x```' ````. Qual é o tipo de doc?").contexto).toBe("Veja\n\n````\ndoc = '```x```'\n````");
		// A pontuação que ligava o código à frase sai; o resto da frase continua depois do bloco.
		expect(dividirQuestao("Rodamos `modelo.fit(X, y)`, e depois `modelo.score(X, y)`. O que mede o segundo?").contexto).toBe(
			"Rodamos\n\n```\nmodelo.fit(X, y)\n```\n\ne depois\n\n```\nmodelo.score(X, y)\n```",
		);
	});

	it("partesDaQuestao: o contexto gravado vale; sem ele, o enunciado dividido", () => {
		expect(partesDaQuestao({ contexto: "  ```python\nlen(x)\n```  ", enunciado: "O que dá? Mesmo." })).toEqual({ contexto: "```python\nlen(x)\n```", pergunta: "O que dá? Mesmo." });
		expect(partesDaQuestao({ contexto: " ", enunciado: "A é B. O que é C?" })).toEqual({ contexto: "A é B.", pergunta: "O que é C?" });
		expect(partesDaQuestao({ enunciado: "Explique." })).toEqual({ pergunta: "Explique." });
	});
});

describe("o resultado em duas colunas", () => {
	it("o resultado de cada questão: alternativa pela correta, dissertativa pela nota ou pela situação", () => {
		const alternativa = { tipo: "alternativa" as const };
		const dissertativa = { tipo: "dissertativa" as const };
		expect(resultadoNaTela(alternativa, { correta: true }, "corrigida")).toBe("certa");
		expect(resultadoNaTela(alternativa, { correta: false }, "corrigida")).toBe("errada");
		expect(resultadoNaTela(alternativa, undefined, "corrigida")).toBe("errada");
		expect(resultadoNaTela(dissertativa, { correcao: { total: 8, max: 8 } }, "corrigida")).toBe("certa");
		expect(resultadoNaTela(dissertativa, { correcao: { total: 0, max: 8 } }, "corrigida")).toBe("errada");
		expect(resultadoNaTela(dissertativa, { correcao: { total: 4, max: 8 } }, "corrigida")).toBe("parcial");
		expect(resultadoNaTela(dissertativa, {}, "corrigindo")).toBe("corrigindo");
		expect(resultadoNaTela(dissertativa, {}, "falhou")).toBe("sem_correcao");
	});

	it("o tom de cada resultado: cor, ícone e palavra (nunca só a cor)", () => {
		expect(tomDoResultado("certa")).toEqual({ tom: "sage", icone: "check", palavra: "Correta", progresso: "correct" });
		expect(tomDoResultado("errada")).toEqual({ tom: "brick", icone: "close", palavra: "Ainda não", progresso: "incorrect" });
		expect(tomDoResultado("parcial")).toEqual({ tom: "amber", icone: "refresh", palavra: "Quase lá", progresso: "partial" });
		expect(tomDoResultado("corrigindo")).toEqual({ tom: "neutro", icone: "clock", palavra: "Corrigindo" });
		expect(tomDoResultado("sem_correcao")).toEqual({ tom: "neutro", icone: "alert", palavra: "Sem correção", progresso: "skipped" });
	});

	const doIndice = [
		{ id: "q1", conceitos: ["b"] },
		{ id: "q2", conceitos: ["a", "c"] },
		{ id: "q3", conceitos: ["c"] },
		{ id: "q4", conceitos: ["b", "z"] },
	];

	it("os assuntos: na ordem do curso, só os que têm questão; questão de dois conceitos nos dois; conceito de fora no fim", () => {
		const grupos = gruposPorAssunto(["a", "b", "c", "d"], doIndice);
		expect(grupos.map((grupo) => [grupo.conceito, grupo.questoes.map((questao) => questao.id)])).toEqual([
			["a", ["q2"]],
			["b", ["q1", "q4"]],
			["c", ["q2", "q3"]],
			["z", ["q4"]],
		]);
		expect(gruposPorAssunto([], [])).toEqual([]);
	});

	it("a ordem de navegação: a do índice, cada questão uma vez, no primeiro assunto em que aparece", () => {
		const ordem = ordemDeNavegacao(gruposPorAssunto(["a", "b", "c", "d"], doIndice));
		expect(ordem).toEqual([
			{ conceito: "a", questao: "q2" },
			{ conceito: "b", questao: "q1" },
			{ conceito: "b", questao: "q4" },
			{ conceito: "c", questao: "q3" },
		]);
	});

	it("a questão em vista: a escolhida, se existe naquele assunto; senão, a primeira do índice", () => {
		const grupos = gruposPorAssunto(["a", "b", "c"], doIndice);
		expect(questaoEmVista(grupos, undefined)).toEqual({ conceito: "a", questao: "q2" });
		expect(questaoEmVista(grupos, { conceito: "c", questao: "q2" })).toEqual({ conceito: "c", questao: "q2" });
		expect(questaoEmVista(grupos, { conceito: "b", questao: "q2" })).toEqual({ conceito: "a", questao: "q2" });
		expect(questaoEmVista(grupos, { conceito: "a", questao: "q9" })).toEqual({ conceito: "a", questao: "q2" });
		expect(questaoEmVista([], undefined)).toBeUndefined();
	});

	it("as vizinhas na ordem: sem dar a volta nas pontas; a questão de dois assuntos anda pela posição dela", () => {
		const ordem = ordemDeNavegacao(gruposPorAssunto(["a", "b", "c"], doIndice));
		expect(vizinhasNaOrdem(ordem, "q2")).toEqual({ posicao: 1, total: 4, proxima: { conceito: "b", questao: "q1" } });
		expect(vizinhasNaOrdem(ordem, "q4")).toEqual({ posicao: 3, total: 4, anterior: { conceito: "b", questao: "q1" }, proxima: { conceito: "c", questao: "q3" } });
		expect(vizinhasNaOrdem(ordem, "q3")).toEqual({ posicao: 4, total: 4, anterior: { conceito: "b", questao: "q4" } });
		expect(vizinhasNaOrdem(ordem, "q9")).toEqual({ posicao: 0, total: 4 });
	});

	it("a letra da alternativa", () => {
		expect([0, 1, 4].map(letraDaAlternativa)).toEqual(["A", "B", "E"]);
	});

	it("o texto curto da alternativa: cabe, fica; passa, corta no espaço com reticências; nunca dentro de código", () => {
		expect(encurtarAlternativa("Média\n e  mediana")).toBe("Média e mediana");
		expect(encurtarAlternativa("um dois três quatro", 12)).toBe("um dois três…");
		expect(encurtarAlternativa("um dois três quatro", 11)).toBe("um dois…");
		expect(encurtarAlternativa("Use isto, e aquilo", 10)).toBe("Use isto…");
		expect(encurtarAlternativa("Rode `df.groupby(x).mean()` agora", 14)).toBe("Rode…");
		expect(encurtarAlternativa("Rode `a = b + c` e veja", 10)).toBe("Rode…");
		expect(encurtarAlternativa("`df.groupby(x).mean()` e mais texto", 10)).toBe("`df.groupby(x).mean()`…");
		expect(encurtarAlternativa("abcdefghijklmnop", 5)).toBe("abcde…");
	});

	it("a linha Sua resposta: a letra e o texto curto", () => {
		const alternativas = [{ texto: "Correlação" }, { texto: "Causalidade" }];
		expect(suaRespostaAlternativa(alternativas, 1)).toEqual({ rotulo: "Sua resposta: B", texto: "Causalidade" });
		expect(suaRespostaAlternativa(alternativas, 3)).toEqual({ rotulo: "Sua resposta: D" });
	});
});
