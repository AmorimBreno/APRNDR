// Testes do quiz web sem o pi: um "pi" falso com um barramento síncrono (como o
// pi.events) e o registerTool. A interface é simulada respondendo aos pedidos.

import { EventEmitter } from "node:events";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import quizWeb from "./quiz-web.ts";

type Resultado = { content: Array<{ text: string }>; details: Record<string, unknown> };
type Ferramenta = { execute(id: string, params: unknown, signal?: AbortSignal, onUpdate?: (parcial: unknown) => void): Promise<Resultado> };
type Pedido = { id: string; painel: string; acao: string; dados: Record<string, unknown> };

let barramento: EventEmitter;
let ferramenta: Ferramenta;
let pedidos: Pedido[];
let mostrados: Array<{ painel: string; acao: string; dados: Record<string, unknown> }>;

beforeEach(() => {
	barramento = new EventEmitter();
	pedidos = [];
	mostrados = [];
	barramento.on("interface:pedido", (pedido: Pedido) => pedidos.push(pedido));
	barramento.on("interface:mostrar", (mensagem) => mostrados.push(mensagem));
	const pi = {
		events: {
			on: (canal: string, ouvinte: (dados: unknown) => void) => {
				barramento.on(canal, ouvinte);
				return () => barramento.off(canal, ouvinte);
			},
			emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
		},
		registerTool: (definicao: Ferramenta) => (ferramenta = definicao),
	} as unknown as ExtensionAPI;
	quizWeb(pi);
});

afterEach(() => vi.restoreAllMocks());

/** Espera o pedido chegar (o execute é assíncrono) e responde como a interface. */
async function responder(dados: unknown): Promise<Pedido> {
	for (let tentativa = 0; tentativa < 20 && pedidos.length === 0; tentativa++) await new Promise((resolver) => setTimeout(resolver, 0));
	const pedido = pedidos.at(-1);
	if (!pedido) throw new Error("o pedido não chegou");
	barramento.emit("interface:resposta", { id: pedido.id, dados });
	return pedido;
}

const base = {
	question: "Quanto é 2 + 2?",
	options: [
		{ label: "3", value: "tres" },
		{ label: "4", value: "quatro" },
		{ label: "5", value: "cinco" },
	],
	correctAnswer: "quatro",
	explanation: "Dois mais dois dá quatro.",
	shuffle: false,
};

describe("quiz web", () => {
	it("o pedido não leva o gabarito; a resposta certa dá o texto do quiz de terminal e o resultado vai ao painel", async () => {
		const execucao = ferramenta.execute("chamada-1", base);
		const pedido = await responder({ escolhas: [2] });
		expect(pedido).toEqual({
			id: "chamada-1",
			painel: "quiz",
			acao: "perguntar",
			dados: {
				question: "Quanto é 2 + 2?",
				mode: "single-select",
				options: [
					{ index: 1, label: "3" },
					{ index: 2, label: "4" },
					{ index: 3, label: "5" },
				],
				dontKnowLabel: "Não sei",
			},
		});
		expect(JSON.stringify(pedido)).not.toContain("quatro");
		expect(JSON.stringify(pedido)).not.toContain("Dois mais dois");

		const resultado = await execucao;
		expect(resultado.content[0]?.text).toBe("User answered correctly.\nSelected: 2. 4\nCorrect: 2. 4\nExplanation: Dois mais dois dá quatro.");
		expect(resultado.details).toMatchObject({ status: "answered", correct: true, correctIndices: [2], answers: [{ label: "4", value: "quatro", index: 2 }] });
		expect(mostrados).toEqual([
			{
				painel: "quiz",
				acao: "resultado",
				dados: expect.objectContaining({ id: "chamada-1", escolhas: [2], correctIndices: [2], correct: true, dontKnow: false, explanation: "Dois mais dois dá quatro." }),
			},
		]);
	});

	it("com image, o nome do arquivo vai no pedido e no resultado (sem image, nenhum dos dois leva)", async () => {
		const execucao = ferramenta.execute("c-img", { ...base, image: "  viz-arvore-1.png " });
		const pedido = await responder({ escolhas: [2] });
		expect(pedido.dados.image).toBe("viz-arvore-1.png");
		const resultado = await execucao;
		expect(resultado.content[0]?.text).toMatch(/^User answered correctly\./);
		expect(mostrados[0]?.dados.image).toBe("viz-arvore-1.png");

		pedidos.length = 0;
		mostrados.length = 0;
		const semImagem = ferramenta.execute("c-sem", { ...base, image: " " });
		expect((await responder({ escolhas: [2] })).dados).not.toHaveProperty("image");
		await semImagem;
		expect(mostrados[0]?.dados).not.toHaveProperty("image");
	});

	it("embaralhado, a correção segue a ordem mostrada", async () => {
		// Com random 0, o Fisher-Yates troca sempre com o primeiro: [3, 4, 5] vira [4, 5, 3].
		vi.spyOn(Math, "random").mockReturnValue(0);
		const execucao = ferramenta.execute("c2", { ...base, shuffle: undefined });
		const pedido = await responder({ escolhas: [1] });
		expect((pedido.dados.options as Array<{ label: string }>).map((opcao) => opcao.label)).toEqual(["4", "5", "3"]);
		const resultado = await execucao;
		expect(resultado.details).toMatchObject({ correct: true, correctIndices: [1] });
		expect(resultado.content[0]?.text).toContain("Correct: 1. 4");
	});

	it("Não sei com nota: lacuna, não erro", async () => {
		const execucao = ferramenta.execute("c3", base);
		await responder({ escolhas: [], naoSei: true, nota: "  nunca vi soma  " });
		const resultado = await execucao;
		expect(resultado.content[0]?.text).toBe(
			`User selected "Não sei" (I don't know) — they did not attempt an answer (a genuine knowledge gap, not a wrong guess).\nCorrect: 2. 4\nUser's note: nunca vi soma\nExplanation: Dois mais dois dá quatro.`,
		);
		expect(resultado.details).toMatchObject({ correct: false, dontKnow: true, note: "nunca vi soma", answers: [] });
	});

	it("multi-select só acerta com o conjunto exato", async () => {
		const multi = { ...base, multiSelect: true, correctAnswer: ["quatro", "cinco"] };
		const certa = ferramenta.execute("c4", multi);
		await responder({ escolhas: [3, 2] });
		expect((await certa).details).toMatchObject({ correct: true, correctIndices: [2, 3] });

		pedidos = [];
		const incompleta = ferramenta.execute("c5", { ...multi, correctAnswer: '["quatro", "cinco"]' });
		await responder({ escolhas: [2] });
		const resultado = await incompleta;
		expect(resultado.details).toMatchObject({ correct: false });
		expect(resultado.content[0]?.text).toBe("User answered incorrectly.\nSelected: 2. 4\nCorrect: 2. 4, 3. 5\nExplanation: Dois mais dois dá quatro.");
	});

	it("cancelado no painel e gabarito inválido", async () => {
		const execucao = ferramenta.execute("c6", base);
		for (let tentativa = 0; tentativa < 20 && pedidos.length === 0; tentativa++) await new Promise((resolver) => setTimeout(resolver, 0));
		barramento.emit("interface:resposta", { id: "c6", cancelado: true, motivo: "usuario" });
		expect((await execucao).content[0]?.text).toBe("User cancelled the quiz");

		pedidos = [];
		const invalido = await ferramenta.execute("c7", { ...base, correctAnswer: "seis" });
		expect(pedidos).toEqual([]);
		expect(invalido.details).toMatchObject({ status: "unavailable" });
		expect(invalido.content[0]?.text).toBe('quiz correctAnswer "seis" does not match any option value ("tres", "quatro", "cinco")');
	});

	it("resposta com duas escolhas no single-select vira unavailable", async () => {
		const execucao = ferramenta.execute("c8", base);
		await responder({ escolhas: [1, 2] });
		expect((await execucao).content[0]?.text).toBe("quiz: single-select accepts one answer");
	});
});
