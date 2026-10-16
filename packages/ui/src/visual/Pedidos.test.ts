// Numeração e resumo dos pedidos (sem DOM: só as funções puras).

import { describe, expect, it } from "vitest";
import type { RegistroPedido } from "../estado-janela.ts";
import { PainelGenerico, type RegistroPaineis } from "../paineis.tsx";
import { numerarPedidos, resumoDoPedido } from "./Pedidos.tsx";

const registro: RegistroPaineis = {
	pergunta: { componente: PainelGenerico, resumir: () => ({ tipo: "Pergunta", titulo: "?" }) },
	quiz: { componente: PainelGenerico, titulo: "Questões", resumir: () => ({ tipo: "Questão", titulo: "?" }) },
};

const pedido = (id: string, painel: string, ordem: number): RegistroPedido => ({ id, painel, acao: "perguntar", dados: null, estado: "pendente", ordem });

describe("pedidos na conversa", () => {
	it("numera por tipo, na ordem de chegada", () => {
		const registros = { c: pedido("c", "pergunta", 5), a: pedido("a", "pergunta", 1), b: pedido("b", "quiz", 3), d: pedido("d", "quiz", 7) };
		expect(numerarPedidos(registro, registros)).toEqual({ a: 1, b: 1, c: 2, d: 2 });
	});
	it("painel sem resumir: Pedido e o título do painel com a ação", () => {
		expect(resumoDoPedido(registro, pedido("x", "teste", 1))).toEqual({ tipo: "Pedido", titulo: "teste · perguntar" });
	});
});
