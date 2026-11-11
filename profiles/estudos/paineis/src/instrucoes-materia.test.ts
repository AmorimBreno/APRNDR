// As instruções da conversa de uma matéria (comum.ts, contextoDaMateria): na parte D o professor passa a criar notas
// novas (criar_nota), mas continua sem escrever nas notas do Breno.

import { describe, expect, it } from "vitest";
import type { Materia } from "../../lib/materia-tipos.ts";
import { contextoDaMateria } from "./comum.ts";

describe("contextoDaMateria", () => {
	const instrucoes = contextoDaMateria({ id: "calculo", nome: "Cálculo", cor: "tijolo" } as unknown as Materia).instrucoes ?? "";

	it("as notas dele continuam só de leitura", () => {
		expect(instrucoes).toContain("listar_notas e ler_nota");
		expect(instrucoes).toContain("nunca escreva nem mude uma nota");
	});

	it("notas novas: criar_nota, quando ele pedir ou ajudar claramente (nunca por garantia), com o título e o botão Desfazer", () => {
		expect(instrucoes).toContain("Notas novas você cria com criar_nota");
		expect(instrucoes).toContain("nunca por garantia");
		expect(instrucoes).toContain("diga o título e que há um botão Desfazer");
	});
});
