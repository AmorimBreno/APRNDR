// Testes da ponte de eventos sem sessão do pi: o barramento é o createEventBus
// do próprio pi, o mesmo que o DefaultResourceLoader cria para cada sessão.

import { createEventBus, type ExtensionAPI, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventoNucleo } from "./eventos.ts";
import { EVENTOS_PONTE, PonteSessao, type RespostaInterface } from "./ponte.ts";

let eventos: EventoNucleo[] = [];
let ponte: PonteSessao;
let barramento: ReturnType<typeof createEventBus>;

function fabrica(): ExtensionFactory {
	const extensao = ponte.extensao;
	return typeof extensao === "function" ? extensao : extensao.factory;
}

/** Carrega a extensão da ponte num "pi" que só tem o barramento. */
function carregar(): void {
	void fabrica()({ events: barramento } as unknown as ExtensionAPI);
}

/** Simula uma ferramenta: assina a resposta antes de emitir o pedido. */
function pedir(id: string, painel = "quiz", acao = "perguntar", dados: unknown = { pergunta: "2+2?" }): RespostaInterface[] {
	const recebidas: RespostaInterface[] = [];
	barramento.on(EVENTOS_PONTE.resposta, (dados) => {
		const resposta = dados as RespostaInterface;
		if (resposta.id === id) recebidas.push(resposta);
	});
	barramento.emit(EVENTOS_PONTE.pedido, { id, painel, acao, dados });
	return recebidas;
}

beforeEach(() => {
	eventos = [];
	barramento = createEventBus();
	ponte = new PonteSessao((evento) => eventos.push(evento));
	carregar();
});

describe("PonteSessao", () => {
	it("interface:mostrar vira acao_interface, sem interpretar os dados", () => {
		const dados = { qualquer: ["coisa", 1] };
		barramento.emit(EVENTOS_PONTE.mostrar, { painel: "teste", acao: "abrir", dados });
		expect(eventos).toEqual([{ tipo: "acao_interface", painel: "teste", acao: "abrir", dados }]);
	});

	it("mostrar sem painel ou sem ação vira erro de extensão", () => {
		barramento.emit(EVENTOS_PONTE.mostrar, { acao: "abrir" });
		barramento.emit(EVENTOS_PONTE.mostrar, "texto solto");
		expect(eventos.map((evento) => evento.tipo)).toEqual(["erro", "erro"]);
		expect(eventos[0]).toMatchObject({ origem: "extensao", mensagem: expect.stringMatching(/falta painel/) });
	});

	it("pedido e resposta: o pedido vira pedido_interface e responder entrega os dados uma vez", () => {
		const recebidas = pedir("p1");
		expect(eventos).toEqual([{ tipo: "pedido_interface", id: "p1", painel: "quiz", acao: "perguntar", dados: { pergunta: "2+2?" } }]);
		expect(ponte.pedidosPendentes).toEqual(["p1"]);

		expect(ponte.responder("p1", { escolha: "4" })).toBe(true);
		expect(recebidas).toEqual([{ id: "p1", dados: { escolha: "4" } }]);
		expect(ponte.pedidosPendentes).toEqual([]);
		// Responder de novo, ou um id desconhecido, não faz nada.
		expect(ponte.responder("p1", { escolha: "5" })).toBe(false);
		expect(ponte.responder("outro", {})).toBe(false);
		expect(recebidas).toHaveLength(1);
	});

	it("cancelamento: cada pendente recebe {cancelado, motivo} e a interface é avisada", () => {
		const r1 = pedir("p1");
		const r2 = pedir("p2");
		eventos = [];
		ponte.cancelarPendentes("abortado");
		expect(r1).toEqual([{ id: "p1", cancelado: true, motivo: "abortado" }]);
		expect(r2).toEqual([{ id: "p2", cancelado: true, motivo: "abortado" }]);
		expect(eventos).toEqual([
			{ tipo: "pedido_interface_cancelado", id: "p1", motivo: "abortado" },
			{ tipo: "pedido_interface_cancelado", id: "p2", motivo: "abortado" },
		]);
		// Depois de cancelado, a resposta do usuário chega tarde e é recusada.
		expect(ponte.responder("p1", {})).toBe(false);
	});

	it("pedido inválido ou com id repetido é recusado na hora, com motivo pedido_invalido", () => {
		const semAcao = pedir("p1", "quiz", "");
		expect(semAcao).toEqual([{ id: "p1", cancelado: true, motivo: "pedido_invalido", erro: "falta acao (texto)" }]);
		pedir("p2");
		const repetido = pedir("p2");
		expect(repetido).toEqual([
			{ id: "p2", cancelado: true, motivo: "pedido_invalido", erro: "já existe um pedido pendente com id p2" },
		]);
		expect(ponte.pedidosPendentes).toEqual(["p2"]);
	});

	it("acaoDaInterface emite interface:acao; painel ou ação vazios são erro", () => {
		const acoes: unknown[] = [];
		barramento.on(EVENTOS_PONTE.acao, (dados) => acoes.push(dados));
		ponte.acaoDaInterface("teste", "clicou", { botao: "ok" });
		expect(acoes).toEqual([{ painel: "teste", acao: "clicou", dados: { botao: "ok" } }]);
		expect(() => ponte.acaoDaInterface("", "clicou", {})).toThrow(/falta painel/);
	});

	it("encerrar cancela os pendentes, desliga a ponte e recusa pedidos novos", () => {
		const r1 = pedir("p1");
		ponte.encerrar("sessao_encerrada");
		expect(r1).toEqual([{ id: "p1", cancelado: true, motivo: "sessao_encerrada" }]);
		eventos = [];
		barramento.emit(EVENTOS_PONTE.mostrar, { painel: "teste", acao: "abrir", dados: null });
		expect(eventos).toEqual([]);
		expect(() => ponte.acaoDaInterface("teste", "clicou", null)).toThrow(/encerrada/);
		ponte.encerrar(); // idempotente
	});

	it("carregar a fábrica de novo (reload do loader) não duplica os eventos", () => {
		carregar();
		carregar();
		barramento.emit(EVENTOS_PONTE.mostrar, { painel: "teste", acao: "abrir", dados: 1 });
		pedir("p1");
		expect(eventos.map((evento) => evento.tipo)).toEqual(["acao_interface", "pedido_interface"]);
	});
});
