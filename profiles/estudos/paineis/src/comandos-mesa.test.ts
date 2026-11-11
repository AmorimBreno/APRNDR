import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import { lerComando, novosComandos } from "./comandos-mesa.ts";

const abrir = (chave: string, id: string): AcaoRecebida => ({
	chave,
	acao: "comando",
	dados: { cmd: "abrir", id, tipo: "nota", caminho: "caderno/calc/notas/Séries", rotulo: "Séries", foco: "previa" },
});
const destacar = (chave: string, id: string): AcaoRecebida => ({
	chave,
	acao: "comando",
	dados: { cmd: "destacar", id, caminho: "caderno/calc/notas/Séries", trecho: "converge", soRolar: false },
});

describe("novosComandos", () => {
	it("ao montar, as chaves que já existiam são histórico e não executam", () => {
		const { estado, comandos } = novosComandos(undefined, "s1", [abrir("i1", "c1"), destacar("i2", "c2")], true);
		expect(comandos).toEqual([]);
		const depois = novosComandos(estado, "s1", [abrir("i1", "c1"), destacar("i2", "c2"), destacar("i3", "c3")], true);
		expect(depois.comandos.map((comando) => comando.id)).toEqual(["c3"]);
	});

	it("a troca de sessão também vira histórico (reabrir a conversa não repete nada)", () => {
		const inicio = novosComandos(undefined, "s1", [], true).estado;
		const outra = novosComandos(inicio, "s2", [abrir("i1", "c1"), destacar("i2", "c2")], true);
		expect(outra.comandos).toEqual([]);
		const nova = novosComandos(outra.estado, "s2", [abrir("i1", "c1"), destacar("i2", "c2"), abrir("i3", "c4")], true);
		expect(nova.comandos.map((comando) => comando.id)).toEqual(["c4"]);
	});

	it("não executa o mesmo id duas vezes, nem com outra chave", () => {
		let estado = novosComandos(undefined, "s1", [], true).estado;
		const primeira = novosComandos(estado, "s1", [destacar("i1", "c1")], true);
		expect(primeira.comandos).toHaveLength(1);
		estado = primeira.estado;
		const repetida = novosComandos(estado, "s1", [destacar("i1", "c1"), destacar("i2", "c1")], true);
		expect(repetida.comandos).toEqual([]);
	});

	it("só a aba visível e com foco reage: as outras marcam como vistas e não executam depois", () => {
		const estado = novosComandos(undefined, "s1", [], true).estado;
		const escondida = novosComandos(estado, "s1", [abrir("i1", "c1")], false);
		expect(escondida.comandos).toEqual([]);
		const depois = novosComandos(escondida.estado, "s1", [abrir("i1", "c1")], true);
		expect(depois.comandos).toEqual([]);
	});

	it("ignora outras ações e dados estragados", () => {
		const estado = novosComandos(undefined, "s1", [], true).estado;
		const { comandos } = novosComandos(estado, "s1", [{ chave: "i1", acao: "outra", dados: {} }, { chave: "i2", acao: "comando", dados: { cmd: "apagar", id: "x", caminho: "y" } }], true);
		expect(comandos).toEqual([]);
	});
});

describe("lerComando", () => {
	it("lê abrir e destacar, sempre com foco em prévia", () => {
		expect(lerComando({ cmd: "abrir", id: "a", tipo: "licao", caminho: "caderno/m/cursos/c/modulos/x/l1", rotulo: "Lição", foco: "foco" })).toMatchObject({ cmd: "abrir", foco: "previa" });
		expect(lerComando({ cmd: "destacar", id: "b", caminho: "caderno/m/notas/N", trecho: "t", soRolar: true })).toMatchObject({ cmd: "destacar", soRolar: true });
	});

	it("recusa sem id, sem caminho, trecho vazio ou grande demais", () => {
		expect(lerComando({ cmd: "abrir", tipo: "nota", caminho: "c", rotulo: "r" })).toBeUndefined();
		expect(lerComando({ cmd: "destacar", id: "b", trecho: "t" })).toBeUndefined();
		expect(lerComando({ cmd: "destacar", id: "b", caminho: "c", trecho: "  " })).toBeUndefined();
		expect(lerComando({ cmd: "destacar", id: "b", caminho: "c", trecho: "x".repeat(501) })).toBeUndefined();
		expect(lerComando(null)).toBeUndefined();
	});
});
