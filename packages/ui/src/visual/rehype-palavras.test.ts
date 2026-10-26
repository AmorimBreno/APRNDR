// Divisão em palavras do plugin de fade (sem DOM).

import { describe, expect, it } from "vitest";
import rehypePalavras, { dividirEmPalavras } from "./rehype-palavras.ts";

describe("rehype-palavras", () => {
	it("palavras viram span e espaços continuam texto", () => {
		expect(dividirEmPalavras("Olá,  mundo")).toEqual([
			{ type: "element", tagName: "span", properties: { className: ["palavra"] }, children: [{ type: "text", value: "Olá," }] },
			{ type: "text", value: "  " },
			{ type: "element", tagName: "span", properties: { className: ["palavra"] }, children: [{ type: "text", value: "mundo" }] },
		]);
	});
	it("código e fórmulas ficam inteiros", () => {
		const arvore = {
			type: "root",
			children: [
				{ type: "element", tagName: "p", children: [{ type: "text", value: "a b" }] },
				{ type: "element", tagName: "pre", children: [{ type: "text", value: "x = 1" }] },
				{ type: "element", tagName: "span", properties: { className: ["katex"] }, children: [{ type: "text", value: "f(x)" }] },
			],
		};
		rehypePalavras()(arvore);
		expect(arvore.children[0]!.children).toHaveLength(3);
		expect(arvore.children[1]!.children).toEqual([{ type: "text", value: "x = 1" }]);
		expect(arvore.children[2]!.children).toEqual([{ type: "text", value: "f(x)" }]);
	});
	it("código em linha e bloco com destaque e números de linha (rehype-codigo) ficam inteiros", () => {
		const linha = { type: "element", tagName: "span", properties: { className: ["codigo__linha"], dataLinha: 1 }, children: [{ type: "element", tagName: "span", properties: { className: ["hljs-keyword"] }, children: [{ type: "text", value: "return x" }] }] };
		const emLinha = { type: "element", tagName: "code", properties: { className: ["codigo-em-linha"] }, children: [{ type: "text", value: "len(x) + 1" }] };
		const arvore = {
			type: "root",
			children: [
				{ type: "element", tagName: "p", children: [{ type: "text", value: "Use " }, emLinha] },
				{ type: "element", tagName: "pre", children: [{ type: "element", tagName: "code", children: [linha, { type: "text", value: "\n" }, structuredClone(linha)] }] },
			],
		};
		const antes = structuredClone(arvore);
		const emLinhaAntes = structuredClone(emLinha);
		rehypePalavras()(arvore);
		expect(arvore.children[0]!.children.at(-1)).toEqual(emLinhaAntes);
		expect(arvore.children[1]).toEqual(antes.children[1]);
	});
	it("o atraso de cada palavra vai no style dela (a primeira, sem atraso, fica sem style)", () => {
		const arvore = { type: "root", children: [{ type: "element", tagName: "p", children: [{ type: "text", value: "um dois três" }] }] };
		rehypePalavras({ atrasoDe: (indice) => indice * 35 })(arvore);
		const spans = arvore.children[0]!.children.filter((no: { type: string }) => no.type === "element") as unknown as Array<{ properties: { style?: string } }>;
		expect(spans.map((span) => span.properties.style)).toEqual([undefined, "animation-delay:35ms", "animation-delay:70ms"]);
	});
});
