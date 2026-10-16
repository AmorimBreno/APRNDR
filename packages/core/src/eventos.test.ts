import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { converterHistorico, criarTradutorEventos, type EventoNucleo, resumirResultado } from "./eventos.ts";

// Os eventos de exemplo têm só os campos que a tradução lê.
const evento = (dados: unknown) => dados as AgentSessionEvent;

const uso = {
	input: 120,
	output: 30,
	cacheRead: 10,
	cacheWrite: 0,
	totalTokens: 160,
	cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
};

const respostaComFerramenta = {
	role: "assistant",
	content: [
		{ type: "thinking", thinking: "Preciso buscar." },
		{ type: "text", text: "Vou buscar." },
		{ type: "toolCall", id: "c1", name: "web_search", arguments: { query: "desvio padrão" } },
	],
	api: "openai-completions",
	provider: "openrouter",
	model: "openai/gpt-6.1-sol",
	usage: uso,
	stopReason: "toolUse",
	timestamp: 1,
};

describe("criarTradutorEventos", () => {
	it("traduz uma execução com texto, raciocínio, ferramenta, uso e fila", () => {
		const traduzir = criarTradutorEventos();
		const entrada = [
			{ type: "agent_start" },
			{ type: "message_end", message: { role: "user", content: [{ type: "text", text: "O que é desvio padrão?" }], timestamp: 1 } },
			{ type: "turn_start" },
			{ type: "message_update", message: {}, assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Preciso" } },
			{ type: "message_update", message: {}, assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Vou " } },
			{ type: "message_update", message: {}, assistantMessageEvent: { type: "toolcall_delta", contentIndex: 2, delta: "{" } },
			{ type: "message_end", message: respostaComFerramenta },
			{ type: "tool_execution_start", toolCallId: "c1", toolName: "web_search", args: { query: "desvio padrão" } },
			{
				type: "tool_execution_update",
				toolCallId: "c1",
				toolName: "web_search",
				args: {},
				partialResult: { content: [{ type: "text", text: "buscando..." }] },
			},
			{
				type: "tool_execution_end",
				toolCallId: "c1",
				toolName: "web_search",
				result: { content: [{ type: "text", text: "3 resultados\n\nWikipedia: ..." }], details: {} },
				isError: false,
				durationMs: 812,
			},
			{ type: "queue_update", steering: [], followUp: ["e a variância?"] },
			// Uma nova execução de baixo nível (por exemplo, a fila) não repete o início.
			{ type: "agent_end", messages: [], willRetry: false },
			{ type: "agent_start" },
			{ type: "agent_settled", aborted: false },
		];
		const saida = entrada.flatMap((item) => traduzir(evento(item)));
		expect(saida).toEqual<EventoNucleo[]>([
			{ tipo: "execucao_inicio" },
			{ tipo: "mensagem_usuario", texto: "O que é desvio padrão?", momento: "1970-01-01T00:00:00.001Z" },
			{ tipo: "raciocinio_delta", delta: "Preciso" },
			{ tipo: "texto_delta", delta: "Vou " },
			{
				tipo: "mensagem_assistente",
				texto: "Vou buscar.",
				raciocinio: "Preciso buscar.",
				modelo: "openrouter/openai/gpt-6.1-sol",
				motivoParada: "toolUse",
				momento: "1970-01-01T00:00:00.001Z",
				uso: {
					tokensEntrada: 120,
					tokensSaida: 30,
					tokensCacheLeitura: 10,
					tokensCacheEscrita: 0,
					tokensTotal: 160,
					custo: 0.003,
				},
			},
			{
				tipo: "uso",
				modelo: "openrouter/openai/gpt-6.1-sol",
				tokensEntrada: 120,
				tokensSaida: 30,
				tokensCacheLeitura: 10,
				tokensCacheEscrita: 0,
				tokensTotal: 160,
				custo: 0.003,
			},
			{ tipo: "ferramenta_inicio", id: "c1", nome: "web_search", argumentos: { query: "desvio padrão" } },
			{ tipo: "ferramenta_progresso", id: "c1", nome: "web_search", resumo: "buscando..." },
			{ tipo: "ferramenta_fim", id: "c1", nome: "web_search", erro: false, resumo: "3 resultados Wikipedia: ...", duracaoMs: 812 },
			{ tipo: "fila", mensagens: ["e a variância?"] },
			{ tipo: "execucao_fim", abortada: false },
		]);
	});

	it("resposta com erro do provedor gera mensagem com erro e evento de erro", () => {
		const traduzir = criarTradutorEventos();
		const saida = traduzir(
			evento({
				type: "message_end",
				message: {
					...respostaComFerramenta,
					content: [],
					usage: { ...uso, totalTokens: 0, cost: { ...uso.cost, total: 0 } },
					stopReason: "error",
					errorMessage: "401 Unauthorized",
				},
			}),
		);
		expect(saida).toEqual<EventoNucleo[]>([
			{
				tipo: "mensagem_assistente",
				texto: "",
				raciocinio: "",
				modelo: "openrouter/openai/gpt-6.1-sol",
				motivoParada: "error",
				erro: "401 Unauthorized",
				// Uso zerado não vai junto; o momento, sim.
				momento: "1970-01-01T00:00:00.001Z",
			},
			{ tipo: "erro", origem: "modelo", mensagem: "401 Unauthorized" },
		]);
	});

	it("ferramenta chamada por outra ferramenta leva o id do pai; erro de ferramenta é marcado", () => {
		const traduzir = criarTradutorEventos();
		const saida = traduzir(
			evento({
				type: "tool_execution_end",
				toolCallId: "c1/1",
				parentToolCallId: "c1",
				toolName: "read",
				result: { content: [{ type: "text", text: "ENOENT: arquivo não existe" }] },
				isError: true,
			}),
		);
		expect(saida).toEqual<EventoNucleo[]>([
			{ tipo: "ferramenta_fim", id: "c1/1", nome: "read", erro: true, resumo: "ENOENT: arquivo não existe", idPai: "c1" },
		]);
	});

	it("aborto e falha nas novas tentativas", () => {
		const traduzir = criarTradutorEventos();
		expect(traduzir(evento({ type: "auto_retry_end", success: false, attempt: 3, finalError: "429" }))).toEqual([
			{ tipo: "erro", origem: "modelo", mensagem: "429" },
		]);
		expect(traduzir(evento({ type: "agent_start" }))).toEqual([{ tipo: "execucao_inicio" }]);
		expect(traduzir(evento({ type: "agent_settled", aborted: true }))).toEqual([{ tipo: "execucao_fim", abortada: true }]);
		expect(traduzir(evento({ type: "agent_start" }))).toEqual([{ tipo: "execucao_inicio" }]);
	});
});

describe("resumirResultado", () => {
	it("junta o texto numa linha, marca imagens e corta no limite", () => {
		const resultado = { content: [{ type: "text", text: "linha 1\nlinha 2" }, { type: "image", data: "...", mimeType: "image/png" }] };
		expect(resumirResultado(resultado)).toBe("linha 1 linha 2 [imagem]");
		expect(resumirResultado({ content: [{ type: "text", text: "a".repeat(300) }] }, 10)).toBe(`${"a".repeat(9)}…`);
		expect(resumirResultado(undefined)).toBe("");
	});
});

describe("converterHistorico", () => {
	it("usuário, assistente com ferramentas e resultado", () => {
		const mensagens = [
			{ role: "system", content: "", timestamp: 0 },
			{ role: "user", content: "Oi", timestamp: 1 },
			respostaComFerramenta,
			{
				role: "toolResult",
				toolCallId: "c1",
				toolName: "web_search",
				content: [{ type: "text", text: "3 resultados" }],
				isError: false,
				timestamp: 2,
			},
		] as unknown as AgentSession["messages"];
		expect(converterHistorico(mensagens, new Map([[1, "professor"]]))).toEqual([
			{ papel: "usuario", texto: "Oi", momento: "1970-01-01T00:00:00.001Z" },
			{
				papel: "assistente",
				texto: "Vou buscar.",
				raciocinio: "Preciso buscar.",
				modelo: "openrouter/openai/gpt-6.1-sol",
				ferramentas: [{ id: "c1", nome: "web_search", argumentos: { query: "desvio padrão" } }],
				momento: "1970-01-01T00:00:00.001Z",
				uso: {
					tokensEntrada: 120,
					tokensSaida: 30,
					tokensCacheLeitura: 10,
					tokensCacheEscrita: 0,
					tokensTotal: 160,
					custo: 0.003,
				},
				agente: "professor",
			},
			{ papel: "ferramenta", id: "c1", nome: "web_search", erro: false, resumo: "3 resultados" },
		]);
	});
});
