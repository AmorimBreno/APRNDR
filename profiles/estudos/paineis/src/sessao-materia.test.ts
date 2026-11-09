import { describe, expect, it } from "vitest";
import { chaveDaMateria, decidirSessao, type SituacaoMesa } from "./sessao-materia.ts";

const base: SituacaoMesa = { materiaId: "calc", entrada: true, executando: false, pedidoPendente: false, carregando: false };

describe("decidirSessao", () => {
	it("a sessão já é da matéria: nada, com ou sem entrada", () => {
		expect(decidirSessao({ ...base, chaveSessao: "materia:calc" })).toEqual({ acao: "nada" });
		expect(decidirSessao({ ...base, entrada: false, chaveSessao: "materia:calc", executando: true })).toEqual({ acao: "nada" });
	});

	it("entrada com a conversa livre: abre a da matéria", () => {
		expect(decidirSessao(base)).toEqual({ acao: "abrir" });
		expect(decidirSessao({ ...base, chaveSessao: "materia:fisica" })).toEqual({ acao: "abrir" });
	});

	it("entrada com resposta em andamento ou pedido pendente: espera, sem abortar", () => {
		expect(decidirSessao({ ...base, executando: true })).toEqual({ acao: "esperar", motivo: "respondendo" });
		expect(decidirSessao({ ...base, pedidoPendente: true })).toEqual({ acao: "esperar", motivo: "respondendo" });
	});

	it("entrada com a conexão carregando: espera", () => {
		expect(decidirSessao({ ...base, carregando: true, executando: true })).toEqual({ acao: "esperar", motivo: "carregando" });
	});

	it("fora da entrada, a sessão de outra matéria ou a geral: avisa, nunca troca", () => {
		expect(decidirSessao({ ...base, entrada: false, chaveSessao: "materia:fisica" })).toEqual({ acao: "avisar_outra_aba" });
		expect(decidirSessao({ ...base, entrada: false })).toEqual({ acao: "avisar_outra_aba" });
	});

	it("fora da entrada e carregando: nada (a troca em curso ainda não terminou)", () => {
		expect(decidirSessao({ ...base, entrada: false, carregando: true, chaveSessao: "materia:fisica" })).toEqual({ acao: "nada" });
	});
});

describe("chaveDaMateria", () => {
	it("é a mesma chave do contexto da matéria", () => {
		expect(chaveDaMateria("calc")).toBe("materia:calc");
	});
});
