// Testes que definem o contrato de textoDaLicao (WP0). O WP6 tira o .skip e
// implementa até passarem; mudar um teste é mudar o contrato (só o orquestrador).

import { describe, expect, it } from "vitest";
import type { Bloco, Licao } from "../../lib/modulo-tipos.ts";
import type { ExplicacaoPedida } from "../../lib/termos-tipos.ts";
import { textoDaLicao } from "./licao-texto.ts";

const explicacao: Bloco = {
	id: "l1-b1",
	tipo: "explicacao",
	conceitos: ["c1"],
	formato: "conceito",
	texto: "A razão entre termos seguidos decide a convergência.",
	referencias: [{ arquivo: "aula-4.pdf", local: "página 12", trecho: "pagina-012" }],
};

const verificacao: Bloco = {
	id: "l1-b2",
	tipo: "verificacao",
	conceitos: ["c1"],
	pergunta: "O que acontece quando L = 1?",
	respostaEsperada: "SEGREDO-VERIFICACAO: o teste não decide.",
};

const alternativa: Bloco = {
	id: "l1-b3",
	tipo: "alternativa",
	conceitos: ["c1"],
	contexto: "Seja a série de 1/n!.",
	enunciado: "A série converge?",
	alternativas: [
		{ texto: "Sim", correta: true },
		{ texto: "Não", confusao: "SEGREDO-CONFUSAO" },
	],
	explicacao: "SEGREDO-GABARITO: a razão tende a zero.",
	referencias: [],
};

const dissertativa: Bloco = {
	id: "l1-b4",
	tipo: "dissertativa",
	conceitos: ["c1"],
	enunciado: "Explique por que 1/n diverge.",
	rubrica: [{ criterio: "SEGREDO-RUBRICA", descricao: "cita a série harmônica", pontos: 2 }],
	respostaModelo: "SEGREDO-RESPOSTA-MODELO",
	referencias: [],
};

const ideia: Bloco = { id: "l1-b5", tipo: "ideia_central", conceitos: ["c1"], texto: "L < 1 converge; L > 1 diverge." };

const licao: Licao = {
	id: "l1",
	titulo: "Critério da razão",
	objetivo: "Decidir a convergência pela razão.",
	conceitos: ["c1"],
	blocos: [explicacao, verificacao, alternativa, dissertativa, ideia],
};

function pedido(campos: Partial<ExplicacaoPedida>): ExplicacaoPedida {
	return { id: "x-1", licao: "l1", bloco: "l1-b1", versao: 1, trecho: "termos seguidos", tipo: "explique_melhor", em: "2026-11-09T10:00:00.000Z", explicacao: "Termos vizinhos: a_n e a_{n+1}.", ...campos };
}

describe("textoDaLicao", () => {
	it("monta o texto da lição no formato do contrato", () => {
		expect(textoDaLicao(licao)).toBe(
			[
				"# Critério da razão",
				"Objetivo: Decidir a convergência pela razão.",
				"",
				"A razão entre termos seguidos decide a convergência.",
				"",
				"Pergunta rápida: O que acontece quando L = 1?",
				"",
				"Questão: Seja a série de 1/n!.",
				"",
				"A série converge?",
				"a) Sim",
				"b) Não",
				"",
				"Questão dissertativa: Explique por que 1/n diverge.",
				"",
				"Ideia central: L < 1 converge; L > 1 diverge.",
			].join("\n"),
		);
	});

	it("nunca leva gabarito, resposta esperada, rubrica, resposta modelo nem referências", () => {
		const texto = textoDaLicao(licao);
		expect(texto).not.toMatch(/SEGREDO/);
		expect(texto).not.toContain("aula-4.pdf");
		expect(texto).not.toContain("página 12");
	});

	it("marca o complemento", () => {
		const comComplemento: Licao = { ...licao, blocos: [{ ...explicacao, complemento: true }] };
		expect(textoDaLicao(comComplemento)).toContain("A razão entre termos seguidos decide a convergência.\n(Complemento: vai além do material.)");
	});

	it("não leva as versões anteriores de um bloco reescrito", () => {
		const reescrito: Bloco = {
			...explicacao,
			versao: 2,
			texto: "Texto novo.",
			anteriores: [{ ...explicacao, texto: "SEGREDO-VERSAO-ANTIGA", versao: 1, substituidoEm: "2026-11-01T00:00:00.000Z", retorno: "e-1" }],
		};
		const texto = textoDaLicao({ ...licao, blocos: [reescrito] });
		expect(texto).toContain("Texto novo.");
		expect(texto).not.toMatch(/SEGREDO/);
	});

	it("põe as explicações pedidas respondidas depois do bloco, só da lição e da versão atual", () => {
		const explicacoes = [
			pedido({ id: "x-1" }),
			pedido({ id: "x-2", licao: "l2", explicacao: "SEGREDO-OUTRA-LICAO" }),
			pedido({ id: "x-3", versao: 2, explicacao: "SEGREDO-OUTRA-VERSAO" }),
			pedido({ id: "x-4", explicacao: undefined }),
			pedido({ id: "x-5", bloco: "l1-b5", trecho: "L > 1", explicacao: "Os termos crescem." }),
		];
		const texto = textoDaLicao(licao, explicacoes);
		expect(texto).toContain('A razão entre termos seguidos decide a convergência.\n\nExplicação pedida sobre "termos seguidos": Termos vizinhos: a_n e a_{n+1}.\n\nPergunta rápida:');
		expect(texto.endsWith('Ideia central: L < 1 converge; L > 1 diverge.\n\nExplicação pedida sobre "L > 1": Os termos crescem.')).toBe(true);
		expect(texto).not.toMatch(/SEGREDO/);
	});

	it("lição sem blocos fica só com o título e o objetivo", () => {
		expect(textoDaLicao({ ...licao, blocos: [] })).toBe("# Critério da razão\nObjetivo: Decidir a convergência pela razão.");
	});
});
