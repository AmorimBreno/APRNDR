// As partes puras do feedback na visão do módulo (feedback-tela.ts): o rótulo
// do pé, as teclas e o que o Detalhar leva, o rascunho do questionário do fim
// da lição e o que vai para a ponte; e a leitura dos erros da nota rápida
// (errosDoFeedback, em modulos-ponte.ts).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import {
	dadosDoQuestionario,
	LINHA_QUESTIONARIO,
	mudarNota,
	notaDaPergunta,
	notaMarcada,
	notaParaDetalhar,
	OPCOES_DA_NOTA,
	problemaDoQuestionario,
	rascunhoDoEnviado,
	rascunhoVazio,
	respondidas,
	rotuloDoFeedback,
	TITULO_QUESTIONARIO,
	tituloDoEnviado,
} from "./feedback-tela.ts";
import { errosDoFeedback, lerModulos } from "./modulos-ponte.ts";

const recebida = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });

describe("o feedback de cada bloco", () => {
	it("o pé mostra Feedback e, com a nota que vale, Feedback: Bom", () => {
		expect(rotuloDoFeedback()).toBe("Feedback");
		expect(rotuloDoFeedback({ avaliacao: "bom" })).toBe("Feedback: Bom");
		expect(rotuloDoFeedback({ avaliacao: "otimo" })).toBe("Feedback: Ótimo");
		expect(rotuloDoFeedback({ avaliacao: "ruim" })).toBe("Feedback: Ruim");
	});

	it("as teclas: Ruim, Bom e Ótimo, nessa ordem", () => {
		expect(OPCOES_DA_NOTA).toEqual([
			{ valor: "ruim", texto: "Ruim" },
			{ valor: "bom", texto: "Bom" },
			{ valor: "otimo", texto: "Ótimo" },
		]);
	});

	it("a tecla marcada: a nota sendo gravada ou, sem ela, a que vale", () => {
		expect(notaMarcada(undefined, undefined)).toBeUndefined();
		expect(notaMarcada(undefined, { avaliacao: "bom" })).toBe("bom");
		expect(notaMarcada("otimo", { avaliacao: "bom" })).toBe("otimo");
		expect(notaMarcada("ruim", undefined)).toBe("ruim");
	});

	it("o Detalhar leva a nota marcada e o evento da nota que vale, só se ela é a marcada", () => {
		expect(notaParaDetalhar(undefined, undefined)).toEqual({});
		expect(notaParaDetalhar(undefined, { avaliacao: "bom", evento: "ev-1" })).toEqual({ avaliacao: "bom", evento: "ev-1" });
		expect(notaParaDetalhar("bom", { avaliacao: "bom", evento: "ev-1" })).toEqual({ avaliacao: "bom", evento: "ev-1" });
		// Uma nota diferente ainda indo para a extensão: a que vale não é mais a marcada.
		expect(notaParaDetalhar("ruim", { avaliacao: "bom", evento: "ev-1" })).toEqual({ avaliacao: "ruim" });
		expect(notaParaDetalhar("otimo", undefined)).toEqual({ avaliacao: "otimo" });
	});
});

describe("o questionário do fim da lição", () => {
	it("os textos do cartão", () => {
		expect(TITULO_QUESTIONARIO).toBe("Como foi esta lição?");
		expect(LINHA_QUESTIONARIO).toBe("Opcional. Ajuda o professor a ajustar o jeito de ensinar.");
	});

	it("começa sem resposta e não envia sem pelo menos uma", () => {
		const rascunho = rascunhoVazio();
		expect(respondidas(rascunho)).toBe(0);
		expect(notaDaPergunta(rascunho, "clareza")).toBeNull();
		expect(problemaDoQuestionario(rascunho)).toBe("Responda pelo menos uma pergunta.");
		expect(() => dadosDoQuestionario(rascunho)).toThrow("Responda pelo menos uma pergunta.");
		// Só o texto não basta.
		expect(problemaDoQuestionario({ ...rascunho, texto: "Gostei." })).toBe("Responda pelo menos uma pergunta.");
	});

	it("as notas mudam uma a uma e vão na ordem das perguntas; o texto só se não for vazio", () => {
		let rascunho = mudarNota(rascunhoVazio(), "ritmo", 2);
		rascunho = mudarNota(rascunho, "entendimento", 5);
		rascunho = mudarNota(rascunho, "ritmo", 3);
		expect(respondidas(rascunho)).toBe(2);
		expect(notaDaPergunta(rascunho, "ritmo")).toBe(3);
		expect(problemaDoQuestionario(rascunho)).toBeUndefined();
		const dados = dadosDoQuestionario(rascunho);
		expect(dados).toEqual({ notas: { entendimento: 5, ritmo: 3 } });
		expect(Object.keys(dados.notas)).toEqual(["entendimento", "ritmo"]);
		expect(dadosDoQuestionario({ ...rascunho, texto: "  Mais exemplos.  " })).toEqual({ notas: { entendimento: 5, ritmo: 3 }, texto: "Mais exemplos." });
	});

	it("o texto tem no máximo 1000 caracteres (aparado)", () => {
		const rascunho = mudarNota(rascunhoVazio(), "clareza", 4);
		expect(problemaDoQuestionario({ ...rascunho, texto: `  ${"a".repeat(1000)}  ` })).toBeUndefined();
		expect(problemaDoQuestionario({ ...rascunho, texto: "a".repeat(1001) })).toBe("O texto tem 1001 caracteres; o máximo é 1000.");
	});

	it("Responder de novo reabre com as notas e o texto da última vez; notas fora do formato saem", () => {
		expect(rascunhoDoEnviado()).toEqual(rascunhoVazio());
		expect(rascunhoDoEnviado({ notas: { clareza: 4, exemplos: 1 }, texto: "Ok." })).toEqual({ notas: { clareza: 4, exemplos: 1 }, texto: "Ok." });
		expect(rascunhoDoEnviado({ notas: { clareza: 7, ritmo: 2, outra: 3 } as never, texto: undefined as never })).toEqual({ notas: { ritmo: 2 }, texto: "" });
		// O rascunho é uma cópia: mexer nele não muda o enviado.
		const enviado = { notas: { clareza: 4 as const }, texto: "" };
		mudarNota(rascunhoDoEnviado(enviado), "clareza", 1);
		expect(enviado.notas.clareza).toBe(4);
	});

	it("o cartão recolhido: Respostas enviadas em dd/mm", () => {
		expect(tituloDoEnviado({ em: new Date(2026, 9, 28, 15, 30).toISOString() })).toBe("Respostas enviadas em 28/10");
		expect(tituloDoEnviado({ em: "" })).toBe("Respostas enviadas");
		expect(tituloDoEnviado({ em: "ontem" })).toBe("Respostas enviadas");
	});
});

describe("a ponte do feedback", () => {
	const alvo = { materia: "calculo", curso: "c1", modulo: "m1" };
	const erro = (bloco: string, pedido: string, campos: Record<string, unknown> = {}) => ({
		mensagem: `Falhou ${bloco}.`,
		ao: "avaliar_bloco",
		materia: "calculo",
		curso: "c1",
		modulo: "m1",
		bloco,
		pedido,
		...campos,
	});
	const modulo = (pedido?: string, id = "m1") => ({ materia: "calculo", curso: "c1", modulo: { id, licoes: [] }, corrigindo: [], ...(pedido ? { pedido } : {}) });

	it("o erro do avaliar_bloco fica no bloco; outro módulo, outra ação ou sem bloco, não", () => {
		expect(errosDoFeedback([], alvo)).toEqual({});
		const recebidas = [
			recebida("a", "erro", erro("l1-b2", "p1")),
			recebida("b", "erro", erro("l1-b3", "p2", { modulo: "m2" })),
			recebida("c", "erro", { ...erro("l1-b4", "p3"), ao: "corrigir" }),
			recebida("d", "erro", { ...erro("", "p4") }),
			recebida("e", "erro", erro("l1-b5", "p5", { curso: "outro" })),
		];
		expect(errosDoFeedback(recebidas, alvo)).toEqual({ "l1-b2": { chave: "a", mensagem: "Falhou l1-b2.", ao: "avaliar_bloco" } });
	});

	it("uma nota do mesmo bloco que dá certo depois apaga o erro; de outro bloco ou antes do erro, não", () => {
		const recebidas = [
			recebida("a", "modulo", modulo("p0")),
			recebida("b", "erro", erro("l1-b2", "p1")),
			recebida("c", "erro", erro("l1-b3", "p2")),
			recebida("d", "modulo", modulo("p3")),
			recebida("e", "modulo", modulo("p4", "m2")),
		];
		const pedidos = { p0: "l1-b2", p3: "l1-b3", p4: "l1-b2" };
		expect(Object.keys(errosDoFeedback(recebidas, alvo, pedidos))).toEqual(["l1-b2"]);
		expect(errosDoFeedback([...recebidas, recebida("f", "modulo", modulo("p5"))], alvo, { ...pedidos, p5: "l1-b2" })).toEqual({});
	});

	it("os erros do feedback são da visão do módulo, não do card do curso", () => {
		const recebidas = [
			recebida("a", "erro", { mensagem: "x", ao: "avaliar_bloco", materia: "calculo", curso: "c1", modulo: "m1", bloco: "l1-b1" }),
			recebida("b", "erro", { mensagem: "y", ao: "avaliar_licao", materia: "calculo", curso: "c1", modulo: "m1" }),
		];
		expect(lerModulos(recebidas, "calculo", "c1")).toEqual({ errosModulo: {} });
	});
});
