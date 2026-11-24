// A leitura da ponte "planos" na tela (planos-ponte.ts): a última lista da matéria, o progresso em texto e a resposta
// a um pedido (seguindo, desfeito ou erro).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import { planoPorTitulo, progressoDoPlano, respostaDoPedidoDePlanos, ultimaListaDePlanos } from "./planos-ponte.ts";

const acao = (chave: string, nome: string, dados: unknown): AcaoRecebida => ({ chave, acao: nome, dados });
const lista = (chave: string, materia: string, planos: unknown[], seguindo: string | null = null, sessao = "s1") => acao(chave, "lista", { materia, sessao, planos, seguindo });
const plano = (titulo: string, feitos: number, total: number) => ({ titulo, feitos, total, concluido: total > 0 && feitos === total });

describe("ultimaListaDePlanos", () => {
	it("vale a última lista da matéria, e ignora as de outra", () => {
		const recebidas = [lista("i1", "calc", [plano("A", 0, 3)]), lista("i2", "calc", [plano("A", 1, 3), plano("B", 2, 2)], "A"), lista("i3", "fis", [plano("Z", 0, 1)])];
		const lida = ultimaListaDePlanos(recebidas, "calc");
		expect(lida?.planos.map((p) => p.titulo)).toEqual(["A", "B"]);
		expect(lida?.seguindo).toBe("A");
		expect(ultimaListaDePlanos(recebidas, "fis")?.planos).toHaveLength(1);
		expect(ultimaListaDePlanos(recebidas, "quim")).toBeUndefined();
	});

	it("descarta o que não é resumo de plano e mantém a sessão da lista", () => {
		const lida = ultimaListaDePlanos([lista("i1", "calc", [plano("A", 1, 2), { titulo: 3 }, null], null, "sessao-9")], "calc");
		expect(lida?.planos).toEqual([plano("A", 1, 2)]);
		expect(lida?.sessao).toBe("sessao-9");
		expect(lida?.seguindo).toBeNull();
	});

	it("uma lista sem o vetor de planos não vale", () => {
		expect(ultimaListaDePlanos([acao("i1", "lista", { materia: "calc" })], "calc")).toBeUndefined();
	});
});

describe("progresso e busca", () => {
	it("'2 de 5' ou 'concluído'", () => {
		expect(progressoDoPlano({ feitos: 2, total: 5, concluido: false })).toBe("2 de 5");
		expect(progressoDoPlano({ feitos: 5, total: 5, concluido: true })).toBe("concluído");
	});

	it("acha o plano pelo título, sem diferença de maiúsculas", () => {
		const planos = [plano("Prova Final", 1, 4)];
		expect(planoPorTitulo(planos, "prova final")?.feitos).toBe(1);
		expect(planoPorTitulo(planos, null)).toBeUndefined();
		expect(planoPorTitulo(undefined, "x")).toBeUndefined();
	});
});

describe("respostaDoPedidoDePlanos", () => {
	it("seguindo e desfeito com o pedido resolvem; erro com o pedido rejeita; outro pedido é ignorado", () => {
		const recebidas = [acao("i1", "seguindo", { pedido: "p0", titulo: "A" }), acao("i2", "seguindo", { pedido: "p1", titulo: "A" }), acao("i3", "erro", { pedido: "p2", mensagem: "Não achei o plano." })];
		expect(respostaDoPedidoDePlanos(recebidas, "p1")).toMatchObject({ tipo: "ok", dados: { acao: "seguindo" } });
		expect(respostaDoPedidoDePlanos(recebidas, "p2")).toEqual({ tipo: "erro", mensagem: "Não achei o plano." });
		expect(respostaDoPedidoDePlanos(recebidas, "p9")).toBeUndefined();
		expect(respostaDoPedidoDePlanos([acao("i4", "desfeito", { pedido: "p4", titulo: "A", materia: "calc" })], "p4")).toMatchObject({ tipo: "ok" });
	});

	it("uma lista com o mesmo pedido não resolve (não é resposta)", () => {
		expect(respostaDoPedidoDePlanos([acao("i1", "lista", { pedido: "p1" })], "p1")).toBeUndefined();
	});
});
