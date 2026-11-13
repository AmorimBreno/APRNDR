import { describe, expect, it } from "vitest";
import { ajustarAsTelas, ALTURA_MINIMA, ALTURA_PADRAO, lerEstado, LARGURA_MINIMA, LARGURA_PADRAO } from "./estado-janela.mjs";

describe("lerEstado", () => {
	it("sem arquivo, usa o padrão", () => {
		expect(lerEstado(undefined)).toEqual({ width: LARGURA_PADRAO, height: ALTURA_PADRAO, maximizada: false });
	});

	it("arquivo estragado ou de outro tipo, usa o padrão", () => {
		expect(lerEstado("{não é json")).toEqual({ width: LARGURA_PADRAO, height: ALTURA_PADRAO, maximizada: false });
		expect(lerEstado("42")).toEqual({ width: LARGURA_PADRAO, height: ALTURA_PADRAO, maximizada: false });
		expect(lerEstado("null")).toEqual({ width: LARGURA_PADRAO, height: ALTURA_PADRAO, maximizada: false });
	});

	it("lê tamanho, posição e maximizada", () => {
		expect(lerEstado(JSON.stringify({ x: 10, y: 20, width: 1200, height: 800, maximizada: true }))).toEqual({
			x: 10,
			y: 20,
			width: 1200,
			height: 800,
			maximizada: true,
		});
	});

	it("respeita o tamanho mínimo e descarta valores que não são números", () => {
		const estado = lerEstado(JSON.stringify({ x: "a", y: 5, width: 100, height: "alto", maximizada: "sim" }));
		expect(estado).toEqual({ width: LARGURA_MINIMA, height: ALTURA_PADRAO, maximizada: false });
		expect(lerEstado(JSON.stringify({ width: 500, height: 100 }))).toMatchObject({ width: LARGURA_MINIMA, height: ALTURA_MINIMA });
	});
});

describe("ajustarAsTelas", () => {
	const telas = [{ x: 0, y: 0, width: 1920, height: 1040 }];

	it("mantém a posição que aparece numa tela", () => {
		const estado = { x: 100, y: 50, width: 1400, height: 900, maximizada: false };
		expect(ajustarAsTelas(estado, telas)).toBe(estado);
	});

	it("mantém a posição numa segunda tela (coordenadas negativas)", () => {
		const estado = { x: -1500, y: 20, width: 1400, height: 900, maximizada: false };
		expect(ajustarAsTelas(estado, [...telas, { x: -1920, y: 0, width: 1920, height: 1040 }])).toBe(estado);
	});

	it("descarta a posição de um monitor que sumiu e limita o tamanho à primeira tela, com folga", () => {
		const estado = { x: 3000, y: 100, width: 2400, height: 1300, maximizada: true };
		expect(ajustarAsTelas(estado, telas)).toEqual({ width: 1880, height: 1000, maximizada: true });
	});

	it("uma janela que só roça a borda da tela não conta como visível", () => {
		const estado = { x: 1900, y: 100, width: 1400, height: 900, maximizada: false };
		expect(ajustarAsTelas(estado, telas)).not.toHaveProperty("x");
	});

	it("sem posição guardada e cabendo com folga, não mexe", () => {
		const estado = { width: 1400, height: 820, maximizada: false };
		expect(ajustarAsTelas(estado, telas)).toBe(estado);
	});

	it("sem posição guardada, nunca abre do tamanho exato da área útil (seria tomada por maximizada)", () => {
		const estado = { width: 1400, height: 900, maximizada: false };
		expect(ajustarAsTelas(estado, [{ x: 0, y: 0, width: 1536, height: 864 }])).toEqual({ width: 1400, height: 824, maximizada: false });
	});
});
