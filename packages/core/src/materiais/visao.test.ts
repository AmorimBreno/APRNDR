// Testes da descrição por visão com um registro de modelos falso (sem rede).

import { describe, expect, it } from "vitest";
import { ErroModelo } from "../modelos.ts";
import { criarDescrever, INSTRUCOES_VISAO, type RegistroVisao } from "./visao.ts";

type Chamada = { modelo: unknown; contexto: { systemPrompt?: string; messages: Array<{ content: unknown }> }; opcoes: { signal?: AbortSignal } };

function registroFalso(resposta: Record<string, unknown>, entrada: string[] = ["text", "image"], credencial = true) {
	const chamadas: Chamada[] = [];
	const registro = {
		getModel: (provedor: string, id: string) => (id === "anthropic/claude-sonnet-5.5" ? { provider: provedor, id, input: entrada } : undefined),
		hasConfiguredAuth: () => credencial,
		getAvailable: async () => [],
		completeSimple: async (modelo: unknown, contexto: Chamada["contexto"], opcoes: Chamada["opcoes"]) => {
			chamadas.push({ modelo, contexto, opcoes });
			return resposta;
		},
	} as unknown as RegistroVisao;
	return { registro, chamadas };
}

const pedido = { png: new Uint8Array([137, 80, 78, 71]), texto: "Gráfico da função", local: "página 2", arquivo: "aula-04.pdf" };
const ok = { stopReason: "stop", content: [{ type: "text", text: "## Gráfico\nUma reta crescente." }], usage: { cost: { total: 0.0123 } } };

describe("visão", () => {
	it("manda as instruções, o contexto e o PNG em base64; devolve o texto, o modelo e o custo", async () => {
		const { registro, chamadas } = registroFalso(ok);
		const descrever = criarDescrever(registro, "openrouter/anthropic/claude-sonnet-5.5");
		expect(await descrever(pedido)).toEqual({ texto: "## Gráfico\nUma reta crescente.", modelo: "openrouter/anthropic/claude-sonnet-5.5", custo: 0.0123 });
		const [chamada] = chamadas;
		expect(chamada!.contexto.systemPrompt).toBe(INSTRUCOES_VISAO);
		expect(chamada!.contexto.messages[0]!.content).toEqual([
			{
				type: "text",
				text: "Arquivo: aula-04.pdf. Local: página 2.\n\nTexto que já foi extraído da página (pode estar incompleto ou fora de ordem):\nGráfico da função",
			},
			{ type: "image", mimeType: "image/png", data: "iVBORw==" },
		]);
		expect(chamada!.opcoes.signal).toBeInstanceOf(AbortSignal);
	});

	it("erro do modelo vira exceção com a mensagem dele", async () => {
		const { registro } = registroFalso({ stopReason: "error", errorMessage: "402 sem crédito", content: [], usage: { cost: { total: 0 } } });
		await expect(criarDescrever(registro, "openrouter/anthropic/claude-sonnet-5.5")(pedido)).rejects.toThrow("402 sem crédito");
	});

	it("resposta vazia também", async () => {
		const { registro } = registroFalso({ stopReason: "stop", content: [], usage: { cost: { total: 0 } } });
		await expect(criarDescrever(registro, "openrouter/anthropic/claude-sonnet-5.5")(pedido)).rejects.toThrow(/não devolveu texto/);
	});

	it("falha antes de processar: modelo que não existe, sem credencial ou sem imagem", () => {
		expect(() => criarDescrever(registroFalso(ok).registro, "openrouter/nao/existe")).toThrow(ErroModelo);
		expect(() => criarDescrever(registroFalso(ok, ["text", "image"], false).registro, "openrouter/anthropic/claude-sonnet-5.5")).toThrow(/credencial/);
		expect(() => criarDescrever(registroFalso(ok, ["text"]).registro, "openrouter/anthropic/claude-sonnet-5.5")).toThrow(/não aceita imagem/);
	});
});
