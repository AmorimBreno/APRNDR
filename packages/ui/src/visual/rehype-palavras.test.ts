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
});
