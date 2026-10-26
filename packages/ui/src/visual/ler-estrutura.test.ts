// Leitor dos blocos vetor e matriz do Markdown.

import { describe, expect, it } from "vitest";
import { lerEstrutura, lerLista } from "./ler-estrutura.ts";

const textos = (valores: Array<{ texto: string }>) => valores.map((valor) => valor.texto);

describe("lerEstrutura: vetor", () => {
	it("lê números, com o texto como foi escrito", () => {
		const vetor = lerEstrutura("vetor", "[6, 3, 8, 12, 11]");
		expect(vetor).toEqual({
			tipo: "vetor",
			valores: [6, 3, 8, 12, 11].map((n) => ({ texto: String(n), tipo: "numero" })),
		});
	});

	it("números negativos, com ponto e com expoente", () => {
		const vetor = lerEstrutura("vetor", "[-1, 2.5, .5, 1e3, +4]");
		expect(vetor?.tipo === "vetor" && textos(vetor.valores)).toEqual(["-1", "2.5", ".5", "1e3", "+4"]);
	});

	it("strings com aspas simples e duplas, com escapes e vírgula dentro", () => {
		const vetor = lerEstrutura("vetor", `['a', "b, c", 'd\\'e', ""]`);
		expect(vetor?.tipo === "vetor" && vetor.valores).toEqual([
			{ texto: "'a'", tipo: "texto" },
			{ texto: '"b, c"', tipo: "texto" },
			{ texto: "'d\\'e'", tipo: "texto" },
			{ texto: '""', tipo: "texto" },
		]);
	});

	it("true/false/None (Python e JSON)", () => {
		const vetor = lerEstrutura("vetor", "[True, false, None, null]");
		expect(vetor?.tipo === "vetor" && vetor.valores.map((valor) => valor.tipo)).toEqual(["booleano", "booleano", "nulo", "nulo"]);
	});

	it("aceita quebras de linha e vírgula sobrando no fim", () => {
		const vetor = lerEstrutura("vetor", "[\n  1,\n  2,\n]\n");
		expect(vetor?.tipo === "vetor" && textos(vetor.valores)).toEqual(["1", "2"]);
	});

	it("a primeira linha # vira o rótulo", () => {
		expect(lerEstrutura("vetor", "# notas da turma\n[7, 9]")).toMatchObject({ rotulo: "notas da turma" });
		expect(lerEstrutura("vetor", "\n#   x  \n[1]")).toMatchObject({ rotulo: "x" });
		expect(lerEstrutura("vetor", "[1]")).not.toHaveProperty("rotulo");
	});

	it("inválidos: devolve null", () => {
		for (const fonte of ["", "[]", "6, 3", "[1 2]", "[1,,2]", "[x]", "[1] [2]", "['a]", "[1, [2]]", "[2a]", "[os.system('x')]", "# só rótulo"]) {
			expect(lerEstrutura("vetor", fonte), fonte).toBeNull();
		}
	});
});

describe("lerEstrutura: matriz", () => {
	it("lê as linhas e o número de colunas", () => {
		const matriz = lerEstrutura("matriz", "# A\n[[1, 2, 3],\n [4, 5, 6]]");
		expect(matriz).toMatchObject({ tipo: "matriz", rotulo: "A", colunas: 3 });
		expect(matriz?.tipo === "matriz" && matriz.linhas.map(textos)).toEqual([
			["1", "2", "3"],
			["4", "5", "6"],
		]);
	});

	it("com strings e None", () => {
		const matriz = lerEstrutura("matriz", `[['a', None], ["b", 1]]`);
		expect(matriz?.tipo === "matriz" && matriz.linhas.map(textos)).toEqual([
			["'a'", "None"],
			['"b"', "1"],
		]);
	});

	it("inválidos: lista simples, linhas de tamanhos diferentes, vazias ou com mais um nível", () => {
		for (const fonte of ["[1, 2]", "[[1, 2], [3]]", "[[]]", "[]", "[[1], 2]", "[[[1]]]", "[[1, 2]"]) {
			expect(lerEstrutura("matriz", fonte), fonte).toBeNull();
		}
	});
});

describe("lerLista", () => {
	it("nunca avalia o texto", () => {
		expect(lerLista("[alert(1)]")).toBeNull();
		expect(lerLista("[__import__('os')]")).toBeNull();
	});
});
