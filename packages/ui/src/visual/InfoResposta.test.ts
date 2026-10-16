// Linhas do balão de informações da resposta (sem DOM: só as funções puras).

import { describe, expect, it } from "vitest";
import type { ItemConversa } from "../estado-janela.ts";
import { formatarDuracao, linhasDaResposta } from "./InfoResposta.tsx";

type ItemAssistente = Extract<ItemConversa, { tipo: "assistente" }>;

const base: ItemAssistente = { tipo: "assistente", chave: "a1", texto: "oi", raciocinio: "", emAndamento: false };

describe("informações da resposta", () => {
	it("duração em segundos com vírgula e, acima de um minuto, em minutos", () => {
		expect(formatarDuracao(4200)).toBe("4,2 s");
		expect(formatarDuracao(72_000)).toBe("1 min 12 s");
	});
	it("só as linhas que a resposta tem, sem o openrouter/ do modelo", () => {
		expect(linhasDaResposta(base)).toEqual([]);
		const linhas = linhasDaResposta({
			...base,
			momento: "2026-10-16T13:27:00.000Z",
			agente: "professor",
			modelo: "openrouter/openai/gpt-6.1-sol",
			duracaoMs: 4200,
			uso: { tokensEntrada: 1000, tokensSaida: 234, tokensCacheLeitura: 500, tokensCacheEscrita: 0, tokensTotal: 1734, custo: 0.0123 },
		});
		expect(linhas.map(([rotulo]) => rotulo)).toEqual(["Quando", "Agente", "Modelo", "Levou", "Tokens", "Custo"]);
		expect(Object.fromEntries(linhas)).toMatchObject({
			Agente: "professor",
			Modelo: "openai/gpt-6.1-sol",
			Levou: "4,2 s",
			Tokens: "1.734 (entrada 1.000 · cache 500 · saída 234)",
			Custo: "US$ 0,0123",
		});
	});
});
