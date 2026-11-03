// Testes das partes puras do ciclo do método (docs/metodo-ciclo.md e
// docs/metodo-experimentos.md): a linha legível de cada verbo, a contagem de
// retorno e o limite de 3, a evidência com os limites, a igualdade com um
// ajuste que vale, a leitura do relatório da versão 1 e o formato markdown dos
// ajustes (os estados em teste, mantido e descartado, o formato antigo
// ativo e desligado, o texto editado à mão preservado e o arquivo que não se
// lê dando erro).

import { describe, expect, it } from "vitest";
import type { Evento } from "./eventos.ts";
import {
	acrescentarAjuste,
	ajusteQueValeIgual,
	ajustesComEstado,
	ajustesNaTela,
	ajustesQueValem,
	ajustesUsadosDe,
	ajustesVazios,
	blocoDeAjustes,
	comentarioDaOrigem,
	comentarioSubstituido,
	contarRetornos,
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
	lerReferenciaDeAjuste,
	linhaDoEvento,
	linhaParaOModelo,
	MINIMO_RETORNOS,
	mesmoAjuste,
	montarEvidencia,
	mudarEstadoDoAjuste,
	novoIdAjuste,
	origemDoAjuste,
	referenciaDoAjuste,
	relatorioV1Lido,
	relatorioV1NaOrdem,
	resumoDoEvento,
	temRetornoSuficiente,
	textoCurto,
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

describe("a igualdade com um ajuste que vale", () => {
	it("sem acento, sem caixa e sem espaços; só os que valem (em teste e mantido)", () => {
		expect(formaDoAjuste("  Ação  É\tBoa ")).toBe("acaoeboa");
		expect(mesmoAjuste("Diga o porquê.", "diga o porque .")).toBe(true);
		expect(mesmoAjuste("Diga o porquê.", "Diga o porquê!")).toBe(false);
		const conteudo = {
			ajustes: [
				{ id: "a", estado: "descartado" as const, texto: "Use exemplos.", comentario: null },
				{ id: "b", estado: "em teste" as const, texto: "Use tabelas.", comentario: null },
				{ id: "c", estado: "mantido" as const, texto: "Use listas.", comentario: null },
			],
		};
		expect(ajusteQueValeIgual(conteudo, "use EXEMPLOS.")).toBeUndefined();
		expect(ajusteQueValeIgual(conteudo, "use  tabelas.")?.id).toBe("b");
		expect(ajusteQueValeIgual(conteudo, "Use listas")).toBeUndefined();
		expect(ajusteQueValeIgual(conteudo, "Use  listas.")?.id).toBe("c");
	});
});

describe("o relatório da versão 1 continua sendo lido", () => {
	const v1 = {
		versao: 1,
		modulo: "m1",
		situacao: "pronto",
		geradoEm: "2026-11-03T10:00:00.000Z",
		modelo: "teste/x",
		custo: 0.06,
		prompt: { nome: "relatorio-metodo.md", hash: "abc" },
		eventosLidos: 3,
		retornos: 3,
		resumo: "Resumo.",
		funcionou: [{ texto: "Bom.", evidencias: ["ev-a"] }],
		problemas: [],
		propostas: [
			{ id: "p1", arquivo: "exemplos.md", ajuste: "Ajuste 1.", porque: "Porque 1.", evidencias: ["ev-b", "ev-a"], decisao: { tipo: "aprovada", texto: "Ajuste 1.", em: "2026-11-03T11:00:00.000Z", evento: "ev-d", ajuste: "a-20261103-1" } },
			{ id: "p2", arquivo: "quiz.md", ajuste: "Ajuste 2.", porque: "Porque 2.", evidencias: ["ev-a", "ev-b"], decisao: { tipo: "rejeitada", motivo: "Não serve.", em: "2026-11-03T11:00:00.000Z", evento: "ev-e" } },
			{ id: "p3", arquivo: "conceito.md", ajuste: "Ajuste 3.", porque: "Porque 3.", evidencias: ["ev-a", "ev-b"] },
		],
		evidencias: [
			{ id: "ev-a", linha: "linha a", licao: "l1", bloco: "l1-b2" },
			{ id: "ev-b", linha: "linha b", licao: "l1", bloco: null },
		],
	};

	it("lido de volta igual, com a decisão de cada proposta; evidenciasDe pega as linhas pelos ids", () => {
		const lido = relatorioV1Lido(JSON.parse(JSON.stringify(v1)), "m1");
		expect(lido).toEqual(v1);
		expect(relatorioV1NaOrdem(lido)).toEqual(lido);
		expect(evidenciasDe(lido, ["ev-b", "ev-x", "ev-a"]).map((item) => item.linha)).toEqual(["linha b", "linha a"]);
		expect(estadoDoRelatorio(lido)).toEqual({ situacao: "pronto" });
	});

	it("recusa o que não está no formato", () => {
		const bom = JSON.parse(JSON.stringify(v1)) as Record<string, unknown>;
		expect(() => relatorioV1Lido({ ...bom, versao: 2 }, "m1")).toThrow(/versão 1/);
		expect(() => relatorioV1Lido(bom, "m2")).toThrow(/não é o nome do arquivo/);
		expect(() => relatorioV1Lido({ ...bom, situacao: "gerando" }, "m1")).toThrow(/situação/);
		expect(() => relatorioV1Lido({ ...bom, propostas: [{ ...(bom.propostas as object[])[0], arquivo: "x.md" }] }, "m1")).toThrow(/arquivo/);
		expect(() => relatorioV1Lido({ ...bom, propostas: [{ ...(bom.propostas as object[])[0], decisao: { tipo: "talvez", em: "x", evento: "y" } }] }, "m1")).toThrow(/aprovada nem rejeitada/);
	});

	it("o estado do relatório: gerando, erro, o gravado ou nenhum", () => {
		const lido = relatorioV1Lido(JSON.parse(JSON.stringify(v1)), "m1");
		expect(estadoDoRelatorio(lido, { gerando: true })).toEqual({ situacao: "gerando" });
		expect(estadoDoRelatorio(null, { erro: "Falhou." })).toEqual({ situacao: "erro", mensagem: "Falhou." });
		expect(estadoDoRelatorio(null)).toEqual({ situacao: "nenhum" });
		expect(estadoDoRelatorio({ situacao: "pouco_retorno" })).toEqual({ situacao: "pouco_retorno" });
	});
});

describe("os ajustes em markdown (os estados dos experimentos)", () => {
	const CANONICO = [
		"# Ajustes do Breno para exemplos.md",
		"",
		"## a-20261103-1 · em teste",
		"Antes do código de um exemplo, diga em uma frase o que ele vai mostrar.",
		"<!-- origem: mat/curso-a/m1/p1 · evidências: ev-1, ev-2 · começou em 2026-11-03 -->",
		"",
		"## a-20261103-2 · mantido",
		"Use números pequenos.",
		"",
		"- E uma lista.",
		"<!-- origem: mat/curso-a/m2/p2 · evidências: ev-3, ev-4 · começou em 2026-11-03 -->",
		"",
		"## a-20261103-3 · descartado",
		"Um que não funcionou.",
		"<!-- origem: mat/curso-a/m2 · reescrita de exemplos.md#a-20261103-1 · evidências: ev-5 · começou em 2026-11-03 · substituído por a-20261103-4 -->",
		"",
	].join("\n");

	it("lê e escreve o formato do contrato, ida e volta", () => {
		const lido = lerAjustesMarkdown(CANONICO, "exemplos.md");
		expect(lido.ajustes.map((item) => [item.id, item.estado])).toEqual([
			["a-20261103-1", "em teste"],
			["a-20261103-2", "mantido"],
			["a-20261103-3", "descartado"],
		]);
		expect(lido.ajustes[1]).toEqual({ id: "a-20261103-2", estado: "mantido", texto: "Use números pequenos.\n\n- E uma lista.", comentario: "origem: mat/curso-a/m2/p2 · evidências: ev-3, ev-4 · começou em 2026-11-03" });
		expect(escreverAjustesMarkdown(lido)).toBe(CANONICO);
		expect(lerAjustesMarkdown(escreverAjustesMarkdown(lido), "exemplos.md")).toEqual(lido);
		expect(escreverAjustesMarkdown(ajustesVazios("quiz.md"))).toBe("# Ajustes do Breno para quiz.md\n");
		expect(lerAjustesMarkdown("", "quiz.md")).toEqual(ajustesVazios("quiz.md"));
	});

	it("lê o formato antigo (ativo vale em teste, desligado vale descartado) e grava sempre os estados novos", () => {
		const antigo = [
			"# Ajustes do Breno para exemplos.md",
			"",
			"## a-20261103-1 · ativo",
			"Antes do código de um exemplo, diga em uma frase o que ele vai mostrar.",
			"<!-- proposta: mat/curso-a/m1/p1 · evidências: ev-1, ev-2 · aprovado em 2026-11-03 -->",
			"",
			"## a-20261103-2 · desligado",
			"Use números pequenos.",
			"<!-- proposta: m1/p2 · evidências: ev-3, ev-4 · aprovado em 2026-11-03 -->",
			"",
		].join("\n");
		const lido = lerAjustesMarkdown(antigo, "exemplos.md");
		expect(lido.ajustes.map((item) => item.estado)).toEqual(["em teste", "descartado"]);
		expect(ajustesQueValem(lido).map((item) => item.id)).toEqual(["a-20261103-1"]);
		expect(origemDoAjuste(lido.ajustes[0]!)).toEqual({ materia: "mat", curso: "curso-a", modulo: "m1", proposta: "p1", evidencias: ["ev-1", "ev-2"], em: "2026-11-03", reescritaDe: null, substituidoPor: null });
		expect(origemDoAjuste(lido.ajustes[1]!)).toMatchObject({ materia: null, modulo: "m1", proposta: "p2", em: "2026-11-03" });
		const escrito = escreverAjustesMarkdown(lido);
		expect(escrito).toContain("## a-20261103-1 · em teste\n");
		expect(escrito).toContain("## a-20261103-2 · descartado\n");
		expect(escrito).not.toContain("ativo");
		expect(escrito).not.toContain("desligado");
		// O comentário antigo fica como está (o Breno pode ter editado).
		expect(escrito).toContain("<!-- proposta: m1/p2 · evidências: ev-3, ev-4 · aprovado em 2026-11-03 -->");
	});

	it("o texto editado à mão pelo Breno é preservado (CRLF, linhas em branco, sem comentário, título trocado, separador e caixa)", () => {
		const aMao = "﻿# Meus ajustes\r\n\r\n## a-1 - Em   Teste\r\nTexto   com   espaços\r\n### e um subtítulo\r\n\r\n\r\n## meu-ajuste | Descartado\r\nEscrito à mão, sem comentário.\r\n";
		const lido = lerAjustesMarkdown(aMao, "conceito.md");
		expect(lido.titulo).toBe("Meus ajustes");
		expect(lido.ajustes).toEqual([
			{ id: "a-1", estado: "em teste", texto: "Texto   com   espaços\n### e um subtítulo", comentario: null },
			{ id: "meu-ajuste", estado: "descartado", texto: "Escrito à mão, sem comentário.", comentario: null },
		]);
		const mantido = mudarEstadoDoAjuste(lido, "meu-ajuste", "mantido");
		const escrito = escreverAjustesMarkdown(mantido.conteudo);
		expect(escrito).toBe("# Meus ajustes\n\n## a-1 · em teste\nTexto   com   espaços\n### e um subtítulo\n\n## meu-ajuste · mantido\nEscrito à mão, sem comentário.\n");
		expect(lerAjustesMarkdown(escrito, "conceito.md").ajustes.map((item) => item.texto)).toEqual(lido.ajustes.map((item) => item.texto));
	});

	it("um arquivo que não se lê dá erro com a linha", () => {
		const casos: Array<[string, RegExp]> = [
			["Uma nota solta.\n## a-1 · em teste\nTexto.", /linha 1 tem texto fora de um ajuste/],
			["# T\n# Outro título\n", /linha 2 tem texto fora/],
			["## a-1 · ligado\nTexto.", /linha 1 não está no formato "## <id> · em teste" \(ou "· mantido" ou "· descartado"\)/],
			["## a-1\nTexto.", /linha 1 não está no formato/],
			["## a-1 · em teste\nTexto.\n## a-1 · mantido\nOutro.", /"a-1" se repete/],
			["## a-1 · em teste\n\n<!-- x -->", /o ajuste a-1 \(linha 1\) está sem texto/],
			["## a-1 · em teste\nTexto.\n<!-- x -->\nDepois.", /linha 4 tem texto depois do comentário/],
			["## a-1 · em teste\nTexto.\n<!-- sem fim", /não fecha na mesma linha/],
			["## !a · em teste\nTexto.", /não é válido/],
		];
		for (const [texto, erro] of casos) expect(() => lerAjustesMarkdown(texto, "quiz.md")).toThrow(erro);
	});

	it("o id novo, acrescentar em teste, mudar o estado, os que valem e a origem", () => {
		const agora = new Date(2026, 10, 3, 15, 0, 0);
		expect(novoIdAjuste([], agora)).toBe("a-20261103-1");
		expect(novoIdAjuste(["a-20261103-1", "a-20261103-7", "a-20261102-9", "outro"], agora)).toBe("a-20261103-8");
		const comentario = comentarioDaOrigem({ materia: "mat", curso: "curso-a", modulo: "m1", proposta: "p1", evidencias: ["ev-1", "ev-2"], em: "2026-11-03" });
		expect(comentario).toBe("origem: mat/curso-a/m1/p1 · evidências: ev-1, ev-2 · começou em 2026-11-03");
		expect(comentarioDaOrigem({ materia: "mat", curso: "curso-a", modulo: "m2", evidencias: [], em: "2026-11-04", reescritaDe: "quiz.md#a-1" })).toBe("origem: mat/curso-a/m2 · reescrita de quiz.md#a-1 · começou em 2026-11-04");
		expect(comentarioSubstituido("origem: x/y/m1", "a-9")).toBe("origem: x/y/m1 · substituído por a-9");
		expect(comentarioSubstituido(null, "a-9")).toBe("substituído por a-9");
		const inicio = ajustesVazios("exemplos.md");
		const { conteudo, ajuste } = acrescentarAjuste(inicio, { texto: "  Diga o que o exemplo mostra.  ", comentario, agora });
		expect(inicio.ajustes).toHaveLength(0);
		expect(ajuste).toEqual({ id: "a-20261103-1", estado: "em teste", texto: "Diga o que o exemplo mostra.", comentario });
		const segundo = acrescentarAjuste(conteudo, { texto: "Outro.", comentario: null, agora });
		expect(segundo.ajuste.id).toBe("a-20261103-2");
		const mantido = mudarEstadoDoAjuste(segundo.conteudo, "a-20261103-1", "mantido");
		expect(mantido.mudou).toBe(true);
		const descartado = mudarEstadoDoAjuste(mantido.conteudo, "a-20261103-2", "descartado", { comentario: comentarioSubstituido(null, "a-20261103-3") });
		expect(descartado.ajuste).toMatchObject({ estado: "descartado", comentario: "substituído por a-20261103-3" });
		expect(ajustesQueValem(descartado.conteudo).map((item) => item.id)).toEqual(["a-20261103-1"]);
		expect(ajustesComEstado(descartado.conteudo, "descartado").map((item) => item.id)).toEqual(["a-20261103-2"]);
		expect(mudarEstadoDoAjuste(descartado.conteudo, "a-20261103-1", "mantido").mudou).toBe(false);
		expect(() => mudarEstadoDoAjuste(descartado.conteudo, "a-9", "mantido")).toThrow('Não achei o ajuste "a-9" em exemplos.md.');
		expect(() => acrescentarAjuste(inicio, { texto: "## Cabeçalho", comentario: null, agora })).toThrow(ErroMetodo);
		expect(ajustesNaTela(descartado.conteudo)).toEqual([
			{ id: "a-20261103-1", texto: "Diga o que o exemplo mostra.", estado: "mantido", origem: { materia: "mat", curso: "curso-a", modulo: "m1", proposta: "p1", evidencias: ["ev-1", "ev-2"], em: "2026-11-03", reescritaDe: null, substituidoPor: null } },
			{ id: "a-20261103-2", texto: "Outro.", estado: "descartado", origem: { materia: null, curso: null, modulo: null, proposta: null, evidencias: [], em: null, reescritaDe: null, substituidoPor: "a-20261103-3" } },
		]);
		expect(origemDoAjuste({ comentario: "origem: mat/curso-a/m2 · reescrita de quiz.md#a-1 · evidências: e1 · começou em 2026-11-04" })).toEqual({
			materia: "mat",
			curso: "curso-a",
			modulo: "m2",
			proposta: null,
			evidencias: ["e1"],
			em: "2026-11-04",
			reescritaDe: "quiz.md#a-1",
			substituidoPor: null,
		});
		expect(origemDoAjuste({ comentario: "origem: mat/curso-a/m2 · evidências: e1 · registrado em 2026-11-04" })).toMatchObject({ proposta: null, em: "2026-11-04" });
		expect(origemDoAjuste({ comentario: "uma nota qualquer" })).toBeNull();
		expect(validarTextoAjuste("  Texto.  ")).toBe("Texto.");
		expect(() => validarTextoAjuste("a <!-- b")).toThrow(/<!--/);
	});

	it("a referência <arquivo>#<id> e os ajustes usados", () => {
		expect(referenciaDoAjuste("quiz.md", "a-1")).toBe("quiz.md#a-1");
		expect(lerReferenciaDeAjuste("quiz.md#a-1")).toEqual({ arquivo: "quiz.md", id: "a-1" });
		expect(lerReferenciaDeAjuste(" metodo/Quiz#a-1 ")).toEqual({ arquivo: "quiz.md", id: "a-1" });
		expect(lerReferenciaDeAjuste("a-1")).toBeUndefined();
		expect(lerReferenciaDeAjuste("outro.md#a-1")).toBeUndefined();
		expect(lerReferenciaDeAjuste(7)).toBeUndefined();
		expect(
			ajustesUsadosDe("quiz.md", [
				{ id: "a-1", estado: "em teste" },
				{ id: "a-2", estado: "descartado" },
				{ id: "a-3", estado: "mantido" },
			]),
		).toEqual([
			{ arquivo: "quiz.md", ajuste: "a-1", estado: "em teste" },
			{ arquivo: "quiz.md", ajuste: "a-3", estado: "mantido" },
		]);
	});

	it("o bloco <ajustes-do-breno> que vai depois da base, com o estado de cada ajuste", () => {
		expect(blocoDeAjustes("exemplos.md", [])).toBe("");
		expect(
			blocoDeAjustes("exemplos.md", [
				{ texto: "Primeiro.", estado: "em teste" },
				{ texto: "Segundo,\nem duas linhas.", estado: "mantido" },
			]),
		).toBe(`<ajustes-do-breno arquivo="exemplos.md">\n${FRASE_DOS_AJUSTES}\n\n- (em teste) Primeiro.\n- (mantido) Segundo,\n  em duas linhas.\n</ajustes-do-breno>`);
		expect(FRASE_DOS_AJUSTES).toBe(
			'Estes ajustes vieram do retorno do Breno. Os marcados "em teste" são experimentos: siga-os à risca, para que dê para medir o efeito deles. Todos valem acima do texto acima quando os dois conflitarem.',
		);
	});
});
