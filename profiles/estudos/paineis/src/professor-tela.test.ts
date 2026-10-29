// As partes puras do professor em bolha e da pergunta com slider
// (professor-tela.ts): o encaixe, as teclas, a mistura das cores e a
// interpolação dos pontos dos olhos, a posição do pegador e as línguas de fogo.

import { describe, expect, it } from "vitest";
import {
	achatamentoDoValor,
	caminhoFechado,
	corComPresenca,
	corDoValor,
	encaixar,
	espelhar,
	fracaoDaTrilha,
	linguasDeFogo,
	NIVEIS,
	nivelDaTecla,
	nomeDoNivel,
	OLHO_NEUTRO,
	OLHOS,
	olhoNoValor,
	PONTOS_DO_OLHO,
	pesoDoNivel,
	presencaDaChama,
	trechoDoValor,
} from "./professor-tela.ts";

describe("encaixe e teclas", () => {
	it("encaixa no nível mais próximo, preso entre 1 e 5", () => {
		expect(encaixar(3.49)).toBe(3);
		expect(encaixar(3.5)).toBe(4);
		expect(encaixar(1.2)).toBe(1);
		expect(encaixar(0)).toBe(1);
		expect(encaixar(7)).toBe(5);
	});

	it("as setas andam um nível; sem resposta, partem do meio", () => {
		expect(nivelDaTecla(null, "ArrowRight")).toBe(4);
		expect(nivelDaTecla(null, "ArrowLeft")).toBe(2);
		expect(nivelDaTecla(null, "Home")).toBe(1);
		expect(nivelDaTecla(null, "End")).toBe(5);
		expect(nivelDaTecla(2, "ArrowUp")).toBe(3);
		expect(nivelDaTecla(2, "PageDown")).toBe(1);
		expect(nivelDaTecla(5, "ArrowRight")).toBe(5);
		expect(nivelDaTecla(1, "ArrowDown")).toBe(1);
		expect(nivelDaTecla(3, "Tab")).toBeUndefined();
	});

	it("nomes dos níveis", () => {
		expect(NIVEIS.map(nomeDoNivel)).toEqual(["Muito ruim", "Ruim", "Bom", "Ótimo", "Excelente"]);
		expect(nomeDoNivel(null)).toBe("—");
	});

	it("o trecho e o peso de cada nível", () => {
		expect(trechoDoValor(2.25)).toEqual({ de: 2, ate: 3, t: 0.25 });
		expect(trechoDoValor(5)).toEqual({ de: 4, ate: 5, t: 1 });
		expect(trechoDoValor(1)).toEqual({ de: 1, ate: 2, t: 0 });
		expect(pesoDoNivel(1.25, 1)).toBe(0.75);
		expect(pesoDoNivel(1.25, 2)).toBe(0.25);
		expect(pesoDoNivel(1.25, 3)).toBe(0);
	});
});

describe("mistura das cores", () => {
	it("no nível, a variável dele; no meio, o color-mix das vizinhas", () => {
		expect(corDoValor("professor-humor", 3)).toBe("var(--professor-humor-3)");
		expect(corDoValor("professor-humor", 5)).toBe("var(--professor-humor-5)");
		expect(corDoValor("professor-humor", 2.25)).toBe("color-mix(in oklab, var(--professor-humor-2) 75%, var(--professor-humor-3))");
		expect(corDoValor("barra", 4.9)).toBe("color-mix(in oklab, var(--barra-4) 10%, var(--barra-5))");
		expect(corDoValor("barra", 9)).toBe("var(--barra-5)");
	});

	it("a presença mistura com a cor neutra", () => {
		expect(corComPresenca("h", 4, 0)).toBe("var(--h-neutro)");
		expect(corComPresenca("h", 4, 1)).toBe("var(--h-4)");
		expect(corComPresenca("h", 4.5, 0.4)).toBe("color-mix(in oklab, color-mix(in oklab, var(--h-4) 50%, var(--h-5)) 40%, var(--h-neutro))");
	});
});

describe("os olhos", () => {
	it("todos os humores e o neutro têm 12 vértices", () => {
		for (const nivel of NIVEIS) expect(OLHOS[nivel]).toHaveLength(PONTOS_DO_OLHO);
		expect(OLHO_NEUTRO).toHaveLength(PONTOS_DO_OLHO);
	});

	it("nos níveis, o olho é o do humor; no meio, a média ponto a ponto", () => {
		expect(olhoNoValor(3, 1)).toEqual(OLHOS[3]);
		expect(olhoNoValor(5, 1)).toEqual(OLHOS[5]);
		const meio = olhoNoValor(2.5, 1);
		meio.forEach(([x, y], i) => {
			expect(x).toBeCloseTo((OLHOS[2][i]![0] + OLHOS[3][i]![0]) / 2);
			expect(y).toBeCloseTo((OLHOS[2][i]![1] + OLHOS[3][i]![1]) / 2);
		});
	});

	it("sem presença, o olho é o neutro", () => {
		expect(olhoNoValor(4.3, 0)).toEqual(OLHO_NEUTRO);
	});

	it("os traços abertos vão e voltam pelo mesmo caminho (sem área) até o nível 4; a estrela abre", () => {
		const ehIdaEVolta = (pontos: readonly (readonly [number, number])[]) =>
			[1, 2, 3, 4, 5].every((i) => Math.abs(pontos[i]![0] - pontos[12 - i]![0]) < 1e-9 && Math.abs(pontos[i]![1] - pontos[12 - i]![1]) < 1e-9);
		for (const valor of [1, 1.3, 2, 2.7, 3, 3.5, 4]) expect(ehIdaEVolta(olhoNoValor(valor, 1))).toBe(true);
		expect(ehIdaEVolta(olhoNoValor(4.5, 1))).toBe(false);
		expect(ehIdaEVolta(OLHOS[5])).toBe(false);
	});

	it("o olho direito é o esquerdo espelhado, e o caminho é fechado", () => {
		expect(espelhar([[47, 52]])).toEqual([[93, 52]]);
		expect(caminhoFechado([[1, 2], [3.456, 4]])).toBe("M1 2 L3.46 4 Z");
	});

	it("o corpo achata no triste e estica no feliz", () => {
		expect(achatamentoDoValor(3, 1)).toEqual([1, 1]);
		const [x1, y1] = achatamentoDoValor(1, 1);
		expect(x1).toBeGreaterThan(1);
		expect(y1).toBeLessThan(1);
		const [x5, y5] = achatamentoDoValor(5, 1);
		expect(x5).toBeLessThan(1);
		expect(y5).toBeGreaterThan(1);
	});
});

describe("a trilha", () => {
	it("o pegador anda de 0 a 1 na trilha; sem resposta, fica no meio", () => {
		expect(fracaoDaTrilha(null)).toBe(0.5);
		expect(fracaoDaTrilha(1)).toBe(0);
		expect(fracaoDaTrilha(3)).toBe(0.5);
		expect(fracaoDaTrilha(4.6)).toBe(0.9);
		expect(fracaoDaTrilha(5)).toBe(1);
		expect(fracaoDaTrilha(9)).toBe(1);
		expect(fracaoDaTrilha(0)).toBe(0);
	});

	it("as chamas só aparecem perto do Excelente e crescem até ele", () => {
		expect(presencaDaChama(null)).toBe(0);
		expect(presencaDaChama(4)).toBe(0);
		expect(presencaDaChama(4.3)).toBe(0);
		expect(presencaDaChama(4.65)).toBe(0.5);
		expect(presencaDaChama(5)).toBe(1);
	});

	it("as línguas de fogo são fixas, cobrem a faixa e variam dentro dos limites", () => {
		const linguas = linguasDeFogo(40);
		expect(linguas).toHaveLength(40);
		expect(linguasDeFogo(40)).toEqual(linguas);
		expect(linguas[0]!.x).toBeLessThanOrEqual(0);
		for (const [i, lingua] of linguas.entries()) {
			if (i > 0) expect(lingua.x).toBeGreaterThan(linguas[i - 1]!.x);
			// Largas o bastante para se sobreporem à vizinha: o fogo não tem buracos.
			expect(lingua.largura).toBeGreaterThan(14);
			expect(lingua.altura).toBeGreaterThanOrEqual(0.6);
			expect(lingua.altura).toBeLessThanOrEqual(1.15);
			expect(lingua.duracao).toBeGreaterThanOrEqual(0.45);
			expect(lingua.duracao).toBeLessThanOrEqual(0.85);
			expect(lingua.atraso).toBeLessThanOrEqual(0);
			expect(lingua.atraso).toBeGreaterThanOrEqual(-1);
		}
		// Não são todas iguais.
		expect(new Set(linguas.map((lingua) => lingua.altura)).size).toBeGreaterThan(10);
	});
});
