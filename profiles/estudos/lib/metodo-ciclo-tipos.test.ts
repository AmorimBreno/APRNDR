// Testes das partes puras do ciclo do método (docs/metodo-ciclo.md): a linha
// legível de cada verbo, a contagem de retorno e o limite de 3, a evidência
// com os limites, a conferência do que o modelo devolve (consertos), a
// igualdade com um ajuste ativo, as decisões e o formato markdown dos
// ajustes (ler e escrever, com o texto editado à mão preservado e o arquivo
// que não se lê dando erro).

import { describe, expect, it } from "vitest";
import type { Evento } from "./eventos.ts";
import {
	acrescentarAjuste,
	ajusteAtivoIgual,
	ajustesAtivos,
	ajustesNaTela,
	ajustesVazios,
	aplicarDecisao,
	blocoDeAjustes,
	comentarioDaOrigem,
	contarRetornos,
	type DecisaoAprovada,
	ErroMetodo,
	escolherLinhas,
	escreverAjustesMarkdown,
	estadoDoRelatorio,
	eventosDoModulo,
	evidenciaDoEvento,
	evidenciasDe,
	FRASE_DOS_AJUSTES,
	formaDoAjuste,
	lerAjustesMarkdown,
	ligarAjuste,
	linhaDoEvento,
	linhaParaOModelo,
	MINIMO_RETORNOS,
	mesmoAjuste,
	montarEvidencia,
	novoIdAjuste,
	novoRelatorio,
	origemDoAjuste,
	propostaPendente,
	propostasPendentes,
	type RelatorioMetodo,
	relatorioLido,
	relatorioNaOrdem,
	resumoDoEvento,
	temRetornoSuficiente,
	textoCurto,
	validarDecisao,
	validarRelatorioDoModelo,
	validarTextoAjuste,
} from "./metodo-ciclo-tipos.ts";
import type { Bloco, ModuloGerado } from "./modulo-tipos.ts";

const GERADO = "2026-11-01T10:00:00.000Z";
const explicacao = (id: string, formato: string, texto = `Texto de ${id}.`): Bloco => ({ id, tipo: "explicacao", conceitos: ["c-a"], formato, texto, referencias: [] }) as Bloco;
const MODULO: ModuloGerado = {
	versao: 1,
	id: "m1",
	curso: "curso-a",
	materia: "mat",
	situacao: "gerado",
	licoes: [
		{
			id: "l1",
			titulo: "Primeira",
			objetivo: "Objetivo 1.",
			conceitos: ["c-a"],
			blocos: [
				explicacao("l1-b1", "introducao"),
				explicacao("l1-b2", "conceito", `Conceito longo. ${"y".repeat(700)}`),
				{ id: "l1-b3", tipo: "verificacao", conceitos: ["c-a"], pergunta: "O que é?", respostaEsperada: "Isto." },
				explicacao("l1-b4", "exemplo_resolvido"),
				{ id: "l1-b5", tipo: "ideia_central", conceitos: ["c-a"], texto: "Guarde isto." },
				{
					id: "l1-b6",
					tipo: "alternativa",
					conceitos: ["c-a"],
					contexto: "Um contexto.",
					enunciado: "Qual?",
					alternativas: [{ texto: "a", correta: true }, { texto: "b", confusao: "Confunde." }],
					explicacao: "Porque a.",
					referencias: [],
				} as Bloco,
			],
		},
		{
			id: "l2",
			titulo: "Segunda",
			objetivo: "Objetivo 2.",
			conceitos: ["c-a"],
			blocos: [
				explicacao("l2-b1", "introducao"),
				{ id: "l2-b2", tipo: "dissertativa", conceitos: ["c-a"], enunciado: "Explique.", rubrica: [], respostaModelo: "." } as unknown as Bloco,
			],
		},
	],
	geradoEm: GERADO,
	modelo: "teste/x",
	custo: 0,
	materiaisUsados: [],
	concluidoEm: "2026-11-02T10:00:00.000Z",
};

let contador = 0;
const evento = (verbo: string, objeto: Record<string, unknown>, resultado: Record<string, unknown> = {}, ts = "2026-11-01T12:00:00.000Z"): Evento =>
	({ id: `ev-${++contador}`, ts, verbo, objeto: { materia: "mat", curso: "curso-a", modulo: "m1", ...objeto }, resultado }) as Evento;

describe("a linha curta legível de cada verbo", () => {
	it("o bloco, o tipo e o formato, o arquivo de metodologia e o resultado resumido", () => {
		const casos: Array<[Evento, string]> = [
			[
				evento("avaliou_bloco", { licao: "l1", bloco: "l1-b2", tipo: "explicacao" }, { avaliacao: "ruim", motivos: ["longo", "abstrato", "inexistente"], texto: "Muito   longo\n e vago." }),
				"l1-b2 · conceito · conceito.md · Feedback Ruim, motivos longo demais e abstrato demais, texto: «Muito longo e vago.»",
			],
			[evento("avaliou_bloco", { licao: "l1", bloco: "l1-b4" }, { avaliacao: "melhorar", motivos: [], texto: "" }), "l1-b4 · exemplo resolvido · exemplos.md · Feedback Ruim"],
			[evento("avaliou_bloco", { licao: "l1", bloco: "l1-b5" }, { avaliacao: "otimo" }), "l1-b5 · ideia central · ideia-central.md · Feedback Ótimo"],
			[evento("reescreveu_bloco", { licao: "l1", bloco: "l1-b2" }, { de: 1, para: 2, retorno: "ev-x" }), "l1-b2 · conceito · conceito.md · Reescrito a pedido do Breno (versão 1 → 2)"],
			[
				evento("avaliou_licao", { licao: "l2" }, { notas: { ritmo: 5, entendimento: 2, questoes: 1 }, texto: "Gostei." }),
				"l2 · Questionário da lição: entendimento Ruim, questões Muito ruim, ritmo Excelente, texto: «Gostei.»",
			],
			[
				evento("respondeu_questao", { licao: "l1", questao: "l1-b6" }, { tentativa: 1, escolha: 1, correta: false, confusao: "Confunde.", confianca: 4, tempoMs: 1 }),
				"l1-b6 · quiz · quiz.md · quiz errado na 1ª tentativa, confiança 4, confusão: «Confunde.»",
			],
			[evento("respondeu_questao", { licao: "l1", questao: "l1-b6" }, { tentativa: 2, escolha: 0, correta: true, confianca: 3 }), "l1-b6 · quiz · quiz.md · quiz certo na 2ª tentativa, confiança 3"],
			[
				evento("respondeu_verificacao", { licao: "l1", questao: "l1-b3" }, { texto: "Acho que é isto.", avaliacao: "parcial", retorno: "Faltou o porquê.", confianca: 2 }),
				"l1-b3 · pergunta · pergunta.md · pergunta em parte, confiança 2, resposta: «Acho que é isto.», retorno: «Faltou o porquê.»",
			],
			[
				evento("respondeu_dissertativa", { licao: "l2", questao: "l2-b2" }, { tentativa: 1, total: 2.5, max: 5, confianca: 1 }),
				"l2-b2 · dissertativa · dissertativa.md · dissertativa 2,5 de 5 pontos na 1ª tentativa, confiança 1",
			],
			[evento("nao_sabia_questao", { licao: "l1", questao: "l1-b6" }, { tipo: "alternativa", tentativas: 1 }), "l1-b6 · quiz · quiz.md · Não sabia (quiz, depois de 1 tentativa)"],
			[evento("nao_sabia_questao", { licao: "l1", questao: "l1-b3" }, { tipo: "verificacao", tentativas: 0 }), "l1-b3 · pergunta · pergunta.md · Não sabia (pergunta)"],
			[evento("pediu_explicacao", { licao: "l1", bloco: "l1-b2" }, { trecho: "radicais", tipo: "nao_sei", explicacao: "…" }), "l1-b2 · conceito · conceito.md · Não sei o que é isso: «radicais»"],
			[evento("pediu_explicacao", { licao: "l1", bloco: "l1-b2" }, { trecho: "o cosseno", tipo: "explique_melhor" }), "l1-b2 · conceito · conceito.md · Explique melhor: «o cosseno»"],
			[evento("guardou_termo", { licao: "l1", bloco: "l1-b2", explicacao: "x-1" }, { id: "t-radical", termo: "radical" }), "l1-b2 · conceito · conceito.md · Guardou no glossário: «radical»"],
		];
		for (const [dado, linha] of casos) expect(linhaDoEvento(dado, MODULO)).toBe(linha);
	});

	it("um bloco que não está no módulo vai só com o id; sem módulo também; textos longos são cortados", () => {
		const fora = evento("avaliou_bloco", { licao: "l9", bloco: "l9-b1" }, { avaliacao: "bom" });
		expect(linhaDoEvento(fora, MODULO)).toBe("l9-b1 · Feedback Bom");
		expect(linhaDoEvento(evento("avaliou_bloco", { bloco: "l1-b2" }, { avaliacao: "bom" }))).toBe("l1-b2 · Feedback Bom");
		const longo = linhaDoEvento(evento("pediu_explicacao", { licao: "l1", bloco: "l1-b2" }, { trecho: "a".repeat(500), tipo: "nao_sei" }), MODULO);
		expect(longo).toMatch(/«a{199}…»$/);
		expect(textoCurto("  um \n\n dois  ")).toBe("um dois");
		expect(textoCurto("abcdef", 4)).toBe("abc…");
		expect(textoCurto(3)).toBe("");
		expect(resumoDoEvento({ verbo: "criou_materia", resultado: {} })).toBe("criou_materia");
	});

	it("a evidência na tela leva o id, a linha, a lição (das questões, pelo módulo) e o bloco", () => {
		const quiz = evento("respondeu_questao", { questao: "l1-b6" }, { tentativa: 1, correta: true, confianca: 2 });
		expect(evidenciaDoEvento(quiz, MODULO)).toEqual({ id: quiz.id, linha: linhaDoEvento(quiz, MODULO), licao: "l1", bloco: "l1-b6" });
		const licao = evento("avaliou_licao", { licao: "l2" }, { notas: { clareza: 4 } });
		expect(evidenciaDoEvento(licao, MODULO)).toMatchObject({ licao: "l2", bloco: null });
		expect(linhaParaOModelo({ id: "ev-1", linha: "l1-b2 · x" })).toBe("- ev-1: l1-b2 · x");
	});
});

describe("os eventos do módulo e a contagem de retorno", () => {
	it("só os verbos da evidência, do mesmo módulo, curso e matéria, da geração atual", () => {
		const certo = evento("avaliou_bloco", { licao: "l1", bloco: "l1-b2" }, { avaliacao: "bom" });
		const lista = [
			certo,
			evento("avaliou_bloco", { modulo: "m2", bloco: "l1-b2" }),
			evento("avaliou_bloco", { curso: "outro", bloco: "l1-b2" }),
			evento("avaliou_bloco", { materia: "outra", bloco: "l1-b2" }),
			evento("avaliou_bloco", { bloco: "l1-b2" }, {}, "2026-10-30T00:00:00.000Z"),
			evento("gerou_modulo", {}),
			evento("concluiu_modulo", {}),
		];
		expect(eventosDoModulo(lista, MODULO)).toEqual([certo]);
	});

	it("contam como retorno avaliou_bloco, avaliou_licao, pediu_explicacao e nao_sabia_questao; o limite é 3", () => {
		const outros = ["reescreveu_bloco", "respondeu_questao", "respondeu_verificacao", "respondeu_dissertativa", "guardou_termo"].map((verbo) => ({ verbo }));
		expect(contarRetornos(outros)).toBe(0);
		const retornos = ["avaliou_bloco", "avaliou_licao", "pediu_explicacao", "nao_sabia_questao"].map((verbo) => ({ verbo }));
		expect(contarRetornos(retornos)).toBe(4);
		expect(MINIMO_RETORNOS).toBe(3);
		expect(temRetornoSuficiente([...outros, ...retornos.slice(0, 2)])).toBe(false);
		expect(temRetornoSuficiente([...outros, ...retornos.slice(0, 3)])).toBe(true);
	});
});

describe("a evidência com os limites", () => {
	it("cabendo tudo, todas as linhas; passando, as de retorno primeiro, na ordem original", () => {
		const linhas = [
			{ id: "a", linha: "x".repeat(10), retorno: false },
			{ id: "b", linha: "y".repeat(10), retorno: true },
			{ id: "c", linha: "z".repeat(10), retorno: false },
			{ id: "d", linha: "w".repeat(10), retorno: true },
		];
		const cada = linhaParaOModelo(linhas[0]!).length + 1;
		expect(escolherLinhas(linhas, cada * 4)).toEqual({ escolhidas: linhas, deFora: 0 });
		expect(escolherLinhas(linhas, cada * 3).escolhidas.map((item) => item.id)).toEqual(["a", "b", "d"]);
		expect(escolherLinhas(linhas, cada * 2)).toEqual({ escolhidas: [linhas[1], linhas[3]], deFora: 2 });
		expect(escolherLinhas(linhas, cada).escolhidas.map((item) => item.id)).toEqual(["b"]);
	});

	it("montarEvidencia: as linhas, os retornos e os blocos com Ruim ou pedido de explicação, com o começo do texto", () => {
		const eventos = [
			evento("avaliou_bloco", { licao: "l1", bloco: "l1-b2" }, { avaliacao: "ruim", motivos: ["longo"] }),
			evento("respondeu_questao", { licao: "l1", questao: "l1-b6" }, { tentativa: 1, correta: true, confianca: 3 }),
			evento("avaliou_bloco", { licao: "l1", bloco: "l1-b4" }, { avaliacao: "bom" }),
			evento("pediu_explicacao", { licao: "l2", bloco: "l2-b1" }, { trecho: "x", tipo: "nao_sei" }),
			evento("avaliou_bloco", { licao: "l1", bloco: "l1-b1" }, { avaliacao: "melhorar" }),
			evento("avaliou_bloco", { modulo: "m2", bloco: "l1-b3" }, { avaliacao: "ruim" }),
		];
		const montada = montarEvidencia(eventos, MODULO);
		expect(montada.eventosLidos).toBe(5);
		expect(montada.retornos).toBe(4);
		expect(montada.deFora).toBe(0);
		expect(montada.mandadas.map((item) => item.id)).toEqual(eventos.slice(0, 5).map((item) => item.id));
		expect(montada.todas).toEqual(montada.mandadas);
		expect(montada.blocos.map((item) => [item.bloco, item.item, item.arquivo, item.cortado])).toEqual([
			["l1-b1", "introducao", "introducao.md", false],
			["l1-b2", "conceito", "conceito.md", true],
			["l2-b1", "introducao", "introducao.md", false],
		]);
		const longo = montada.blocos[1]!;
		expect(longo.texto.endsWith("…")).toBe(true);
		expect(longo.texto.length).toBeLessThanOrEqual(601);
		expect(montarEvidencia(eventos, MODULO, { bloco: 10 }).blocos[0]!.texto).toBe("Texto de l…");
		const apertada = montarEvidencia(eventos, MODULO, { linhas: linhaParaOModelo(montada.todas[0]!).length + 1 });
		expect(apertada.mandadas.map((item) => item.id)).toEqual([eventos[0]!.id]);
		expect(apertada.deFora).toBe(4);
	});
});

describe("o que o modelo devolve (validarRelatorioDoModelo)", () => {
	const ids = ["ev-a", "ev-b", "ev-c"];
	const proposta = (extra: Record<string, unknown> = {}) => ({ arquivo: "exemplos.md", ajuste: "Diga antes o que o exemplo vai mostrar.", porque: "Ele se perdeu.", evidencias: ["ev-a", "ev-b"], ...extra });

	it("fora do formato é ErroMetodo (a extensão tenta de novo)", () => {
		expect(() => validarRelatorioDoModelo([], { evidencias: ids })).toThrow(ErroMetodo);
		expect(() => validarRelatorioDoModelo({ resumo: " ", funcionou: [], problemas: [], propostas: [] }, { evidencias: ids })).toThrow(/resumo/);
		expect(() => validarRelatorioDoModelo({ resumo: "R", problemas: [], propostas: [] }, { evidencias: ids })).toThrow(/funcionou/);
		expect(() => validarRelatorioDoModelo({ resumo: "R", funcionou: [], problemas: [], propostas: {} }, { evidencias: ids })).toThrow(/propostas/);
	});

	it("o que fica, com os ids p1, p2…; os consertos dizem o que saiu", () => {
		const { relatorio, consertos } = validarRelatorioDoModelo(
			{
				resumo: "  O módulo foi bem.  ",
				funcionou: [{ texto: "Os exemplos.", evidencias: ["ev-a", "ev-x"] }, { texto: "Sem evidência.", evidencias: ["ev-y"] }, { texto: "" }, "texto solto"],
				problemas: [{ texto: "Os conceitos longos.", evidencias: ["ev-b", "ev-b"] }],
				propostas: [
					proposta(),
					proposta({ arquivo: "metodo/Conceito", ajuste: "Divida o conceito em partes curtas." }),
					proposta({ arquivo: "outro.md" }),
					proposta({ ajuste: "" }),
					proposta({ ajuste: "x".repeat(401) }),
					proposta({ porque: "" }),
					proposta({ evidencias: ["ev-a", "ev-z"] }),
					proposta({ ajuste: "diga ANTES o que o exemplo vai mostrar." }),
					proposta({ arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "p".repeat(400) }),
					proposta({ arquivo: "pergunta.md", ajuste: "Pergunte o porquê." }),
					7,
				],
			},
			{ evidencias: ids },
		);
		expect(relatorio.resumo).toBe("O módulo foi bem.");
		expect(relatorio.funcionou).toEqual([{ texto: "Os exemplos.", evidencias: ["ev-a"] }]);
		expect(relatorio.problemas).toEqual([{ texto: "Os conceitos longos.", evidencias: ["ev-b"] }]);
		expect(relatorio.propostas.map((item) => [item.id, item.arquivo, item.ajuste])).toEqual([
			["p1", "exemplos.md", "Diga antes o que o exemplo vai mostrar."],
			["p2", "conceito.md", "Divida o conceito em partes curtas."],
			["p3", "quiz.md", "Use alternativas plausíveis."],
			["p4", "pergunta.md", "Pergunte o porquê."],
		]);
		expect(relatorio.propostas[2]!.porque).toHaveLength(300);
		expect(relatorio.propostas[2]!.porque.endsWith("…")).toBe(true);
		expect(consertos).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^O que funcionou, item 1: o id "ev-x", que não está na evidência, saiu\.$/),
				expect.stringMatching(/^O que funcionou, item 2: sem nenhum evento/),
				expect.stringMatching(/^O que funcionou, item 3: sem texto/),
				expect.stringMatching(/^Proposta 3: o arquivo "outro.md"/),
				expect.stringMatching(/^Proposta 4: sem o ajuste/),
				expect.stringMatching(/^Proposta 5: o ajuste tem 401 caracteres/),
				expect.stringMatching(/^Proposta 6: sem o porquê/),
				expect.stringMatching(/^Proposta 7: cita 1 evento da evidência \(o mínimo é 2\)/),
				expect.stringMatching(/^Proposta 8: igual a uma proposta anterior para exemplos.md/),
				expect.stringMatching(/^Proposta 9: o porquê passava de 300/),
				expect.stringMatching(/^Proposta 11: não é um objeto/),
			]),
		);
	});

	it("uma proposta igual a um ajuste ativo do mesmo arquivo sai; de outro arquivo, fica; o resumo longo é cortado; no máximo 5", () => {
		const muitas = ["a", "b", "c", "d", "e", "f"].map((letra) => proposta({ arquivo: "quiz.md", ajuste: `Regra ${letra}.` }));
		const { relatorio, consertos } = validarRelatorioDoModelo(
			{ resumo: "r".repeat(1600), funcionou: [], problemas: [], propostas: [proposta({ ajuste: "Diga  antes o que o exemplo vai mostrar" }), proposta({ arquivo: "conceito.md" }), ...muitas] },
			{ evidencias: ids, ativos: { "exemplos.md": ["diga antes o que o exemplo vai mostrar"] } },
		);
		expect(relatorio.resumo).toHaveLength(1500);
		expect(relatorio.propostas.map((item) => item.arquivo)).toEqual(["conceito.md", "quiz.md", "quiz.md", "quiz.md", "quiz.md"]);
		expect(consertos).toEqual(expect.arrayContaining([expect.stringMatching(/^Proposta 1: igual a um ajuste ativo de exemplos.md/), expect.stringMatching(/passa de 5 propostas/), expect.stringMatching(/resumo passava/)]));
	});
});

describe("a igualdade com um ajuste ativo", () => {
	it("sem acento, sem caixa e sem espaços", () => {
		expect(formaDoAjuste("  Ação  É\tBoa ")).toBe("acaoeboa");
		expect(mesmoAjuste("Diga o porquê.", "diga o porque .")).toBe(true);
		expect(mesmoAjuste("Diga o porquê.", "Diga o porquê!")).toBe(false);
		const conteudo = { ajustes: [{ id: "a", ativo: false, texto: "Use exemplos.", comentario: null }, { id: "b", ativo: true, texto: "Use tabelas.", comentario: null }] };
		expect(ajusteAtivoIgual(conteudo, "use EXEMPLOS.")).toBeUndefined();
		expect(ajusteAtivoIgual(conteudo, "use  tabelas.")?.id).toBe("b");
	});
});

describe("o relatório, as propostas e as decisões", () => {
	const todas = [
		{ id: "ev-a", linha: "linha a", licao: "l1", bloco: "l1-b2" },
		{ id: "ev-b", linha: "linha b", licao: "l1", bloco: "l1-b3" },
		{ id: "ev-c", linha: "linha c", licao: "l2", bloco: null },
	];
	const pronto = (): RelatorioMetodo =>
		novoRelatorio({
			modulo: "m1",
			geradoEm: "2026-11-03T10:00:00.000Z",
			eventosLidos: 3,
			retornos: 3,
			doModelo: {
				relatorio: {
					resumo: "Resumo.",
					funcionou: [{ texto: "Bom.", evidencias: ["ev-a"] }],
					problemas: [],
					propostas: [
						{ id: "p1", arquivo: "exemplos.md", ajuste: "Ajuste 1.", porque: "Porque 1.", evidencias: ["ev-b", "ev-a"] },
						{ id: "p2", arquivo: "quiz.md", ajuste: "Ajuste 2.", porque: "Porque 2.", evidencias: ["ev-a", "ev-b"] },
					],
				},
				modelo: "teste/x",
				custo: 0.06,
				prompt: { nome: "relatorio-metodo.md", hash: "abc" },
				todas,
			},
		});

	it("o relatório pronto guarda as evidências citadas, na ordem; o pouco_retorno vem vazio", () => {
		const relatorio = pronto();
		expect(relatorio).toMatchObject({ versao: 1, modulo: "m1", situacao: "pronto", modelo: "teste/x", custo: 0.06, eventosLidos: 3, retornos: 3 });
		expect(relatorio.evidencias.map((item) => item.id)).toEqual(["ev-a", "ev-b"]);
		expect(evidenciasDe(relatorio, ["ev-b", "ev-x", "ev-a"]).map((item) => item.linha)).toEqual(["linha b", "linha a"]);
		const pouco = novoRelatorio({ modulo: "m1", geradoEm: "2026-11-03T10:00:00.000Z", eventosLidos: 2, retornos: 1 });
		expect(pouco).toEqual({ versao: 1, modulo: "m1", situacao: "pouco_retorno", geradoEm: "2026-11-03T10:00:00.000Z", custo: 0, eventosLidos: 2, retornos: 1, resumo: "", funcionou: [], problemas: [], propostas: [], evidencias: [] });
		expect(relatorioLido(JSON.parse(JSON.stringify(relatorio)), "m1")).toEqual(relatorio);
		expect(relatorioLido(JSON.parse(JSON.stringify(pouco)), "m1")).toEqual(pouco);
	});

	it("relatorioLido recusa o que não está no formato", () => {
		const bom = JSON.parse(JSON.stringify(pronto())) as Record<string, unknown>;
		expect(() => relatorioLido({ ...bom, versao: 2 }, "m1")).toThrow(/versão 1/);
		expect(() => relatorioLido(bom, "m2")).toThrow(/não é o nome do arquivo/);
		expect(() => relatorioLido({ ...bom, situacao: "gerando" }, "m1")).toThrow(/situação/);
		expect(() => relatorioLido({ ...bom, propostas: [{ ...(bom.propostas as object[])[0], arquivo: "x.md" }] }, "m1")).toThrow(/arquivo/);
		expect(() => relatorioLido({ ...bom, propostas: [{ ...(bom.propostas as object[])[0], decisao: { tipo: "talvez", em: "x", evento: "y" } }] }, "m1")).toThrow(/aprovada nem rejeitada/);
	});

	it("as decisões: validar, aplicar uma vez, pendentes e o estado", () => {
		expect(validarDecisao({ proposta: " p1 ", decisao: "aprovar", texto: "  Texto novo. ", motivo: "ignorado" })).toEqual({ proposta: "p1", decisao: "aprovar", texto: "Texto novo." });
		expect(validarDecisao({ proposta: "p1", decisao: "aprovar", texto: "  " })).toEqual({ proposta: "p1", decisao: "aprovar" });
		expect(validarDecisao({ proposta: "p1", decisao: "rejeitar", texto: "ignorado", motivo: " Não serve. " })).toEqual({ proposta: "p1", decisao: "rejeitar", motivo: "Não serve." });
		expect(() => validarDecisao({ decisao: "aprovar" })).toThrow(/proposta/);
		expect(() => validarDecisao({ proposta: "p1", decisao: "talvez" })).toThrow(/aprovar ou rejeitar/);
		expect(() => validarDecisao({ proposta: "p1", decisao: "rejeitar", motivo: "m".repeat(301) })).toThrow(/301/);
		expect(() => validarDecisao({ proposta: "p1", decisao: "aprovar", texto: "x".repeat(401) })).toThrow(/401/);

		const relatorio = pronto();
		expect(propostasPendentes(relatorio)).toBe(2);
		expect(estadoDoRelatorio(relatorio)).toEqual({ situacao: "pronto", pendentes: 2 });
		const decisao: DecisaoAprovada = { tipo: "aprovada", texto: "Ajuste 1.", em: "2026-11-03T11:00:00.000Z", evento: "ev-d", ajuste: "a-20261103-1" };
		const decidido = aplicarDecisao(relatorio, "p1", decisao);
		expect(relatorio.propostas[0]!.decisao).toBeUndefined();
		expect(decidido.propostas[0]!.decisao).toEqual(decisao);
		expect(propostasPendentes(decidido)).toBe(1);
		expect(() => aplicarDecisao(decidido, "p1", decisao)).toThrow("A proposta p1 já foi aprovada.");
		expect(() => propostaPendente(decidido, "p9")).toThrow(/Não achei a proposta "p9"/);
		const pouco = novoRelatorio({ modulo: "m1", geradoEm: "x", eventosLidos: 0, retornos: 0 });
		expect(() => propostaPendente(pouco, "p1")).toThrow(/não tem propostas/);
		expect(estadoDoRelatorio(pouco)).toEqual({ situacao: "pouco_retorno", pendentes: 0 });
		expect(estadoDoRelatorio(decidido, { gerando: true })).toEqual({ situacao: "gerando", pendentes: 1 });
		expect(estadoDoRelatorio(null, { erro: "Falhou." })).toEqual({ situacao: "erro", pendentes: 0, mensagem: "Falhou." });
		expect(estadoDoRelatorio(null)).toEqual({ situacao: "nenhum", pendentes: 0 });
		expect(relatorioNaOrdem(decidido)).toEqual(decidido);
	});
});

describe("os ajustes em markdown", () => {
	const CANONICO = [
		"# Ajustes do Breno para exemplos.md",
		"",
		"## a-20261103-1 · ativo",
		"Antes do código de um exemplo, diga em uma frase o que ele vai mostrar.",
		"<!-- proposta: mat/curso-a/m1/p1 · evidências: ev-1, ev-2 · aprovado em 2026-11-03 -->",
		"",
		"## a-20261103-2 · desligado",
		"Use números pequenos.",
		"",
		"- E uma lista.",
		"<!-- proposta: m1/p2 · evidências: ev-3, ev-4 · aprovado em 2026-11-03 -->",
		"",
	].join("\n");

	it("lê e escreve o formato do contrato, ida e volta", () => {
		const lido = lerAjustesMarkdown(CANONICO, "exemplos.md");
		expect(lido).toEqual({
			arquivo: "exemplos.md",
			titulo: "Ajustes do Breno para exemplos.md",
			ajustes: [
				{ id: "a-20261103-1", ativo: true, texto: "Antes do código de um exemplo, diga em uma frase o que ele vai mostrar.", comentario: "proposta: mat/curso-a/m1/p1 · evidências: ev-1, ev-2 · aprovado em 2026-11-03" },
				{ id: "a-20261103-2", ativo: false, texto: "Use números pequenos.\n\n- E uma lista.", comentario: "proposta: m1/p2 · evidências: ev-3, ev-4 · aprovado em 2026-11-03" },
			],
		});
		expect(escreverAjustesMarkdown(lido)).toBe(CANONICO);
		expect(lerAjustesMarkdown(escreverAjustesMarkdown(lido), "exemplos.md")).toEqual(lido);
		expect(escreverAjustesMarkdown(ajustesVazios("quiz.md"))).toBe("# Ajustes do Breno para quiz.md\n");
		expect(lerAjustesMarkdown("", "quiz.md")).toEqual(ajustesVazios("quiz.md"));
	});

	it("o texto editado à mão pelo Breno é preservado (CRLF, linhas em branco, sem comentário, título trocado, separador e caixa)", () => {
		const aMao = "﻿# Meus ajustes\r\n\r\n## a-1 - Ativo\r\nTexto   com   espaços\r\n### e um subtítulo\r\n\r\n\r\n## meu-ajuste | desligado\r\nEscrito à mão, sem comentário.\r\n";
		const lido = lerAjustesMarkdown(aMao, "conceito.md");
		expect(lido.titulo).toBe("Meus ajustes");
		expect(lido.ajustes).toEqual([
			{ id: "a-1", ativo: true, texto: "Texto   com   espaços\n### e um subtítulo", comentario: null },
			{ id: "meu-ajuste", ativo: false, texto: "Escrito à mão, sem comentário.", comentario: null },
		]);
		const ligado = ligarAjuste(lido, "meu-ajuste", true);
		const escrito = escreverAjustesMarkdown(ligado.conteudo);
		expect(escrito).toBe("# Meus ajustes\n\n## a-1 · ativo\nTexto   com   espaços\n### e um subtítulo\n\n## meu-ajuste · ativo\nEscrito à mão, sem comentário.\n");
		expect(lerAjustesMarkdown(escrito, "conceito.md").ajustes.map((item) => item.texto)).toEqual(lido.ajustes.map((item) => item.texto));
	});

	it("um arquivo que não se lê dá erro com a linha", () => {
		const casos: Array<[string, RegExp]> = [
			["Uma nota solta.\n## a-1 · ativo\nTexto.", /linha 1 tem texto fora de um ajuste/],
			["# T\n# Outro título\n", /linha 2 tem texto fora/],
			["## a-1 · ligado\nTexto.", /linha 1 não está no formato/],
			["## a-1 · ativo\nTexto.\n## a-1 · ativo\nOutro.", /"a-1" se repete/],
			["## a-1 · ativo\n\n<!-- x -->", /a-1 \(linha 1\) está sem texto/],
			["## a-1 · ativo\nTexto.\n<!-- x -->\nDepois.", /linha 4 tem texto depois do comentário/],
			["## a-1 · ativo\nTexto.\n<!-- sem fim", /não fecha na mesma linha/],
			["## !a · ativo\nTexto.", /não é válido/],
		];
		for (const [texto, erro] of casos) expect(() => lerAjustesMarkdown(texto, "quiz.md")).toThrow(erro);
	});

	it("o id novo, acrescentar, ligar e desligar, os ativos e a origem", () => {
		const agora = new Date(2026, 10, 3, 15, 0, 0);
		expect(novoIdAjuste([], agora)).toBe("a-20261103-1");
		expect(novoIdAjuste(["a-20261103-1", "a-20261103-7", "a-20261102-9", "outro"], agora)).toBe("a-20261103-8");
		const comentario = comentarioDaOrigem({ materia: "mat", curso: "curso-a", modulo: "m1", proposta: "p1", evidencias: ["ev-1", "ev-2"], aprovadoEm: "2026-11-03" });
		expect(comentario).toBe("proposta: mat/curso-a/m1/p1 · evidências: ev-1, ev-2 · aprovado em 2026-11-03");
		const inicio = ajustesVazios("exemplos.md");
		const { conteudo, ajuste } = acrescentarAjuste(inicio, { texto: "  Diga o que o exemplo mostra.  ", comentario, agora });
		expect(inicio.ajustes).toHaveLength(0);
		expect(ajuste).toEqual({ id: "a-20261103-1", ativo: true, texto: "Diga o que o exemplo mostra.", comentario });
		const segundo = acrescentarAjuste(conteudo, { texto: "Outro.", comentario: null, agora });
		expect(segundo.ajuste.id).toBe("a-20261103-2");
		const desligado = ligarAjuste(segundo.conteudo, "a-20261103-1", false);
		expect(desligado.mudou).toBe(true);
		expect(ajustesAtivos(desligado.conteudo).map((item) => item.id)).toEqual(["a-20261103-2"]);
		expect(ligarAjuste(desligado.conteudo, "a-20261103-1", false).mudou).toBe(false);
		expect(() => ligarAjuste(desligado.conteudo, "a-9", true)).toThrow('Não achei o ajuste "a-9" em exemplos.md.');
		expect(() => acrescentarAjuste(inicio, { texto: "## Cabeçalho", comentario: null, agora })).toThrow(ErroMetodo);
		expect(ajustesNaTela(desligado.conteudo)).toEqual([
			{ id: "a-20261103-1", texto: "Diga o que o exemplo mostra.", ativo: false, origem: { materia: "mat", curso: "curso-a", modulo: "m1", proposta: "p1", evidencias: ["ev-1", "ev-2"], aprovadoEm: "2026-11-03" } },
			{ id: "a-20261103-2", texto: "Outro.", ativo: true, origem: null },
		]);
		expect(origemDoAjuste({ comentario: "proposta: m1/p2 · aprovado em 2026-11-04" })).toEqual({ materia: null, curso: null, modulo: "m1", proposta: "p2", evidencias: [], aprovadoEm: "2026-11-04" });
		expect(origemDoAjuste({ comentario: "uma nota qualquer" })).toBeNull();
		expect(validarTextoAjuste("  Texto.  ")).toBe("Texto.");
		expect(() => validarTextoAjuste("a <!-- b")).toThrow(/<!--/);
	});

	it("o bloco <ajustes-do-breno> que vai depois da base", () => {
		expect(blocoDeAjustes("exemplos.md", [])).toBe("");
		expect(blocoDeAjustes("exemplos.md", [{ texto: "Primeiro." }, { texto: "Segundo,\nem duas linhas." }])).toBe(
			`<ajustes-do-breno arquivo="exemplos.md">\n${FRASE_DOS_AJUSTES}\n\n- Primeiro.\n- Segundo,\n  em duas linhas.\n</ajustes-do-breno>`,
		);
	});
});
