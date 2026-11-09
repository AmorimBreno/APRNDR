import { describe, expect, it, vi } from "vitest";
import { type FonteVendo, LIMITE_CONTEUDO_VENDO } from "./vendo.ts";
import { contextoDaFonte, lerFonte } from "./vendo.tsx";

function fonte(texto: () => string | undefined): FonteVendo {
	return { tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", texto };
}

describe("contextoDaFonte", () => {
	it("sem fonte, sem contexto", () => {
		expect(contextoDaFonte(undefined, true)).toBeUndefined();
	});

	it("olho aberto: chama texto() e manda o conteúdo inteiro", () => {
		const texto = vi.fn(() => "# Séries\nconteúdo");
		expect(contextoDaFonte(fonte(texto), true)).toEqual({ tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", olho: true, conteudo: "# Séries\nconteúdo" });
		expect(texto).toHaveBeenCalledOnce();
	});

	it("olho aberto: corta em LIMITE_CONTEUDO_VENDO e marca parcial", () => {
		const contexto = contextoDaFonte(fonte(() => "a".repeat(LIMITE_CONTEUDO_VENDO + 10)), true);
		expect(contexto?.conteudo).toHaveLength(LIMITE_CONTEUDO_VENDO);
		expect(contexto?.parcial).toBe(true);
	});

	it("no limite exato não é parcial", () => {
		const contexto = contextoDaFonte(fonte(() => "a".repeat(LIMITE_CONTEUDO_VENDO)), true);
		expect(contexto?.parcial).toBeUndefined();
	});

	it("olho fechado: não chama texto() e não manda conteúdo", () => {
		const texto = vi.fn(() => "segredo");
		const contexto = contextoDaFonte(fonte(texto), false);
		expect(texto).not.toHaveBeenCalled();
		expect(contexto).toEqual({ tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", olho: false });
	});

	it("texto() que devolve undefined ou vazio: sem conteúdo, sem aviso", () => {
		for (const texto of [() => undefined, () => ""]) {
			const leitura = lerFonte(fonte(texto), true);
			expect(leitura.contexto.conteudo).toBeUndefined();
			expect(leitura.falhou).toBe(false);
		}
	});

	it("texto() que lança: sem conteúdo e falhou = true para o chip avisar", () => {
		const leitura = lerFonte(
			fonte(() => {
				throw new Error("buffer indisponível");
			}),
			true,
		);
		expect(leitura.contexto).toEqual({ tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", olho: true });
		expect(leitura.falhou).toBe(true);
	});
});
