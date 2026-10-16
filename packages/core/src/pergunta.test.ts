// Testes do ask_user_question web sem sessão do pi: a ferramenta é registrada
// num "pi" falso que só tem o barramento (o createEventBus do pi) e o
// registerTool, junto com a ponte, como numa sessão principal.

import { createEventBus, type ExtensionAPI, type ExtensionFactory, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventoNucleo } from "./eventos.ts";
import { criarExtensaoPergunta, interpretarResposta, normalizarOpcoes } from "./pergunta.ts";
import { PonteSessao } from "./ponte.ts";

type Ferramenta = { execute(id: string, params: unknown, signal?: AbortSignal): Promise<{ content: Array<{ text: string }>; details: unknown }> };

let eventos: EventoNucleo[];
let ponte: PonteSessao;
let ferramenta: Ferramenta;

function fabrica(extensao: InlineExtension): ExtensionFactory {
	return typeof extensao === "function" ? extensao : extensao.factory;
}

beforeEach(() => {
	eventos = [];
	const barramento = createEventBus();
	ponte = new PonteSessao((evento) => eventos.push(evento));
	const pi = { events: barramento, registerTool: (definicao: Ferramenta) => (ferramenta = definicao) } as unknown as ExtensionAPI;
	void fabrica(ponte.extensao)(pi);
	void fabrica(criarExtensaoPergunta())(pi);
});

/** Espera o pedido chegar à interface (o execute é assíncrono). */
async function pedidoEmitido(): Promise<Extract<EventoNucleo, { tipo: "pedido_interface" }>> {
	for (let tentativa = 0; tentativa < 20; tentativa++) {
		const pedido = eventos.find((evento) => evento.tipo === "pedido_interface");
		if (pedido && pedido.tipo === "pedido_interface") return pedido;
		await new Promise((resolver) => setTimeout(resolver, 0));
	}
	throw new Error("o pedido não chegou");
}

const opcoes = [{ label: "Azul (Recommended)" }, { label: "Verde", value: "v", description: "a cor do mato" }];

describe("ask_user_question web", () => {
	it("pergunta pelo painel pergunta com o id da chamada e devolve o texto da versão de terminal", async () => {
		const execucao = ferramenta.execute("chamada-1", { question: "Qual cor?", details: "  Só uma.  ", options: opcoes });
		const pedido = await pedidoEmitido();
		expect(pedido).toEqual({
			tipo: "pedido_interface",
			id: "chamada-1",
			painel: "pergunta",
			acao: "perguntar",
			dados: {
				question: "Qual cor?",
				details: "Só uma.",
				mode: "single-select",
				options: [
					{ label: "Azul (Recommended)", value: "Azul (Recommended)" },
					{ label: "Verde", value: "v", description: "a cor do mato" },
				],
				otherLabel: "Outra",
			},
		});
		expect(ponte.responder("chamada-1", { escolhas: [2] })).toBe(true);
		const resultado = await execucao;
		expect(resultado.content[0]?.text).toBe("User selected: 2. Verde");
		expect(resultado.details).toEqual({
			status: "answered",
			question: "Qual cor?",
			context: "Só uma.",
			mode: "single-select",
			answers: [{ type: "option", label: "Verde", value: "v", index: 2 }],
		});
	});

	it("multi-select com Outra e modo texto", async () => {
		const multi = ferramenta.execute("c2", { question: "Quais?", options: opcoes, multiSelect: true });
		await pedidoEmitido();
		ponte.responder("c2", { escolhas: [2, 1], outra: " roxo " });
		expect((await multi).content[0]?.text).toBe("User selected:\n- 1. Azul (Recommended)\n- 2. Verde\n- Other: roxo");

		eventos = [];
		const livre = ferramenta.execute("c3", { question: "Por quê?" });
		expect((await pedidoEmitido()).dados).toMatchObject({ mode: "text", options: [] });
		ponte.responder("c3", { texto: "  porque sim " });
		expect((await livre).content[0]?.text).toBe("User answered: porque sim");
	});

	it("cancelar no painel vira o resultado cancelado, sem lançar", async () => {
		const execucao = ferramenta.execute("c4", { question: "Qual cor?", options: opcoes });
		await pedidoEmitido();
		expect(ponte.cancelarPeloUsuario("c4")).toBe(true);
		const resultado = await execucao;
		expect(resultado.content[0]?.text).toBe("User cancelled the question");
		expect(resultado.details).toMatchObject({ status: "cancelled", answers: [] });
	});

	it("resposta que não combina com as opções vira unavailable", async () => {
		const execucao = ferramenta.execute("c5", { question: "Qual cor?", options: opcoes });
		await pedidoEmitido();
		ponte.responder("c5", { escolhas: [1, 2] });
		const resultado = await execucao;
		expect(resultado.details).toMatchObject({ status: "unavailable" });
		expect(resultado.content[0]?.text).toBe("ask_user_question: a pergunta aceita uma escolha só");
	});
});

describe("interpretarResposta", () => {
	const normalizadas = normalizarOpcoes(opcoes);
	it("recusa opção fora da lista, resposta vazia e nenhuma escolha", () => {
		expect(interpretarResposta({ escolhas: [3] }, "multi-select", normalizadas)).toBe("a interface mandou uma opção que não existe");
		expect(interpretarResposta(null, "single-select", normalizadas)).toBe("a interface mandou uma resposta vazia");
		expect(interpretarResposta({ escolhas: [], outra: "  " }, "single-select", normalizadas)).toBe("a interface não mandou nenhuma escolha");
	});
	it("só Outra também vale no single-select", () => {
		expect(interpretarResposta({ outra: "amarelo" }, "single-select", normalizadas)).toEqual([{ type: "other", label: "amarelo", value: "amarelo" }]);
	});
});
