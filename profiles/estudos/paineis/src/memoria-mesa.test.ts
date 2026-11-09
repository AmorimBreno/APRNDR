import { describe, expect, it } from "vitest";
import { type ArmazenamentoMesa, continuarDeOndeParei, gravarCaminho, gravarSessao, lerMemoria } from "./memoria-mesa.ts";

function armazenamentoFalso(inicial: Record<string, string> = {}): ArmazenamentoMesa {
	const dados = { ...inicial };
	return {
		getItem: (chave) => dados[chave] ?? null,
		setItem: (chave, valor) => {
			dados[chave] = valor;
		},
	};
}

const quebrado: ArmazenamentoMesa = {
	getItem: () => {
		throw new Error("bloqueado");
	},
	setItem: () => {
		throw new Error("bloqueado");
	},
};

describe("memória da mesa", () => {
	it("sem nada guardado, devolve vazia", () => {
		expect(lerMemoria("estudos", armazenamentoFalso())).toEqual({ caminhos: {}, sessoes: {} });
	});

	it("guarda a última matéria e o caminho de cada uma", () => {
		const armazenamento = armazenamentoFalso();
		gravarCaminho("estudos", "calc", "caderno/calc/notas/Series", armazenamento);
		gravarCaminho("estudos", "fisica", "caderno/fisica", armazenamento);
		const memoria = lerMemoria("estudos", armazenamento);
		expect(memoria.ultimaMateria).toBe("fisica");
		expect(memoria.caminhos).toEqual({ calc: "caderno/calc/notas/Series", fisica: "caderno/fisica" });
	});

	it("ignora um caminho que não é da matéria", () => {
		const armazenamento = armazenamentoFalso();
		gravarCaminho("estudos", "calc", "caderno/calculo", armazenamento);
		gravarCaminho("estudos", "calc", "agenda/tarefas", armazenamento);
		expect(lerMemoria("estudos", armazenamento).ultimaMateria).toBeUndefined();
	});

	it("guarda a sessão por matéria sem mudar a última matéria", () => {
		const armazenamento = armazenamentoFalso();
		gravarCaminho("estudos", "calc", "caderno/calc", armazenamento);
		gravarSessao("estudos", "fisica", "s1", armazenamento);
		gravarSessao("estudos", "calc", "s2", armazenamento);
		const memoria = lerMemoria("estudos", armazenamento);
		expect(memoria.sessoes).toEqual({ fisica: "s1", calc: "s2" });
		expect(memoria.ultimaMateria).toBe("calc");
	});

	it("cada perfil tem a sua", () => {
		const armazenamento = armazenamentoFalso();
		gravarSessao("estudos", "calc", "s1", armazenamento);
		expect(lerMemoria("outro", armazenamento).sessoes).toEqual({});
	});

	it("valor estranho no storage vira memória vazia ou é filtrado", () => {
		expect(lerMemoria("estudos", armazenamentoFalso({ "estudos-app:mesa:estudos": "{não é json" }))).toEqual({ caminhos: {}, sessoes: {} });
		const parcial = armazenamentoFalso({ "estudos-app:mesa:estudos": JSON.stringify({ ultimaMateria: 3, caminhos: { a: "caderno/a", b: 7 }, sessoes: [] }) });
		expect(lerMemoria("estudos", parcial)).toEqual({ caminhos: { a: "caderno/a" }, sessoes: {} });
	});

	it("com o storage falhando, não lança", () => {
		expect(lerMemoria("estudos", quebrado)).toEqual({ caminhos: {}, sessoes: {} });
		expect(() => gravarCaminho("estudos", "calc", "caderno/calc", quebrado)).not.toThrow();
		expect(() => gravarSessao("estudos", "calc", "s1", quebrado)).not.toThrow();
		expect(() => gravarSessao("estudos", "calc", "s1", undefined)).not.toThrow();
	});

	it("continuar: só se a matéria ainda existe; sem caminho, a capa do caderno", () => {
		const memoria = { ultimaMateria: "calc", caminhos: { calc: "caderno/calc/notas/Series" }, sessoes: {} };
		expect(continuarDeOndeParei(memoria, ["calc", "fisica"])).toEqual({ materiaId: "calc", caminho: "caderno/calc/notas/Series" });
		expect(continuarDeOndeParei(memoria, ["fisica"])).toBeUndefined();
		expect(continuarDeOndeParei({ ultimaMateria: "calc", caminhos: {}, sessoes: {} }, ["calc"])).toEqual({ materiaId: "calc", caminho: "caderno/calc" });
		expect(continuarDeOndeParei({ caminhos: {}, sessoes: {} }, ["calc"])).toBeUndefined();
	});
});
