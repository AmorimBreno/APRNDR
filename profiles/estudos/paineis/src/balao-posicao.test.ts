// A posição do balão da faixa da linha do tempo: ao lado do cursor e ancorado numa marca.

import { describe, expect, it } from "vitest";
import { posicaoAncorada, posicaoDoBalao } from "./balao-posicao.ts";

const tela = { largura: 1000, altura: 700 };
const balao = { largura: 280, altura: 100 };

describe("posicaoDoBalao", () => {
	it("fica abaixo e à direita do cursor quando há espaço", () => {
		expect(posicaoDoBalao({ x: 200, y: 300 }, balao, tela)).toEqual({ left: 214, top: 314 });
	});

	it("vira para a esquerda do cursor perto da borda direita", () => {
		const pos = posicaoDoBalao({ x: 900, y: 300 }, balao, tela);
		expect(pos.left).toBe(900 - 14 - 280);
		expect(pos.top).toBe(314);
	});

	it("vira para cima do cursor perto da borda de baixo", () => {
		const pos = posicaoDoBalao({ x: 200, y: 650 }, balao, tela);
		expect(pos.left).toBe(214);
		expect(pos.top).toBe(650 - 14 - 100);
	});

	it("vira nos dois eixos no canto de baixo à direita, sem cobrir o cursor", () => {
		const pos = posicaoDoBalao({ x: 990, y: 690 }, balao, tela);
		expect(pos.left + balao.largura).toBeLessThan(990);
		expect(pos.top + balao.altura).toBeLessThan(690);
	});

	it("não passa da margem da janela quando o balão não cabe de nenhum lado do cursor", () => {
		const estreita = { largura: 300, altura: 700 };
		expect(posicaoDoBalao({ x: 100, y: 300 }, balao, estreita).left).toBe(12);
	});
});

describe("posicaoAncorada", () => {
	const marca = { left: 400, right: 436, top: 100, bottom: 136 };

	it("fica centrada embaixo da marca", () => {
		expect(posicaoAncorada(marca, balao, tela)).toEqual({ left: 418 - 140, top: 144 });
	});

	it("sobe para cima da marca quando não cabe embaixo", () => {
		const embaixo = { left: 400, right: 436, top: 640, bottom: 676 };
		expect(posicaoAncorada(embaixo, balao, tela).top).toBe(640 - 8 - 100);
	});

	it("fica embaixo mesmo sem espaço, se também não couber em cima", () => {
		const baixa = { largura: 1000, altura: 160 };
		expect(posicaoAncorada({ left: 400, right: 436, top: 40, bottom: 76 }, balao, baixa).top).toBe(48);
	});

	it("não passa das margens laterais", () => {
		expect(posicaoAncorada({ left: 0, right: 36, top: 100, bottom: 136 }, balao, tela).left).toBe(12);
		expect(posicaoAncorada({ left: 970, right: 1000, top: 100, bottom: 136 }, balao, tela).left).toBe(1000 - 280 - 12);
	});
});
