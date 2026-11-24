// @vitest-environment happy-dom
// Blocos ```mermaid``` no Markdown: o código de sempre até o diagrama ficar pronto, o desenho do mermaid
// depois, e o código de volta se o mermaid recusar a fonte. O mermaid de verdade precisa de medidas de
// layout que o happy-dom não tem; aqui ele é trocado por um falso (o desenho real foi conferido no navegador).

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATRASO_MS } from "./DiagramaMermaid.tsx";
import { Markdown } from "./Markdown.tsx";

const falso = vi.hoisted(() => ({
	parse: vi.fn(async (fonte: string) => {
		if (fonte.includes("INVALIDO")) throw new Error("Parse error");
		return { diagramType: "flowchart" };
	}),
	render: vi.fn(async (id: string, fonte: string) => ({ svg: `<svg data-id="${id}"><text>${fonte.split("\n")[0]}</text></svg>` })),
	initialize: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: falso }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	falso.parse.mockClear();
	falso.render.mockClear();
});
afterEach(() => {
	root.unmount();
	container.remove();
});

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function desenhar(texto: string) {
	root.render(createElement(Markdown, { texto }));
	await esperar(20);
}
const bloco = (corpo: string) => "```mermaid\n" + corpo + "\n```";

describe("bloco mermaid", () => {
	it("mostra o código até o diagrama ficar pronto e depois só o diagrama", async () => {
		await desenhar(bloco("flowchart TD\n  A --> B"));
		expect(container.querySelector(".codigo__barra")?.textContent).toBe("mermaid");
		expect(container.querySelector(".diagrama")).toBeNull();
		expect(falso.render).not.toHaveBeenCalled();
		await esperar(ATRASO_MS + 150);
		const diagrama = container.querySelector(".diagrama");
		expect(diagrama?.querySelector("svg text")?.textContent).toBe("flowchart TD");
		expect(container.querySelector(".codigo")).toBeNull();
		expect(diagrama?.getAttribute("role")).toBe("img");
	});

	it("um bloco que o mermaid recusa continua como código, sem erro na tela", async () => {
		await desenhar(bloco("flowchart TD\n  A --> INVALIDO["));
		await esperar(ATRASO_MS + 150);
		expect(falso.parse).toHaveBeenCalled();
		expect(falso.render).not.toHaveBeenCalled();
		expect(container.querySelector(".diagrama")).toBeNull();
		expect(container.querySelector(".codigo__pre")?.textContent).toContain("INVALIDO");
	});

	it("com a fonte mudando sem parar (a resposta chegando), só desenha quando ela para", async () => {
		await desenhar(bloco("flowchart LR\n  X --> Y"));
		await esperar(ATRASO_MS / 2);
		await desenhar(bloco("flowchart LR\n  X --> Y\n  Y --> Z"));
		await esperar(ATRASO_MS / 2);
		expect(falso.render).not.toHaveBeenCalled();
		await esperar(ATRASO_MS);
		expect(falso.render).toHaveBeenCalledTimes(1);
		expect(container.querySelector(".diagrama")).not.toBeNull();
	});

	it("o desenho anterior fica na tela até o novo ficar pronto", async () => {
		await desenhar(bloco("flowchart TB\n  P --> Q"));
		await esperar(ATRASO_MS + 150);
		expect(container.querySelector(".diagrama svg text")?.textContent).toBe("flowchart TB");
		await desenhar(bloco("flowchart BT\n  P --> Q"));
		expect(container.querySelector(".diagrama svg text")?.textContent).toBe("flowchart TB");
		expect(container.querySelector(".codigo")).toBeNull();
		await esperar(ATRASO_MS + 150);
		expect(container.querySelector(".diagrama svg text")?.textContent).toBe("flowchart BT");
	});

	it("o mesmo diagrama de novo sai do que já foi desenhado, sem chamar o mermaid", async () => {
		const texto = bloco("flowchart RL\n  M --> N");
		await desenhar(texto);
		await esperar(ATRASO_MS + 150);
		falso.render.mockClear();
		root.unmount();
		root = createRoot(container);
		await desenhar(texto);
		expect(container.querySelector(".diagrama")).not.toBeNull();
		expect(falso.render).not.toHaveBeenCalled();
	});

	it("em linha (rótulos), continua sendo código", async () => {
		root.render(createElement(Markdown, { texto: bloco("flowchart TD\n  A --> B"), emLinha: true }));
		await esperar(ATRASO_MS + 150);
		expect(container.querySelector(".diagrama")).toBeNull();
	});

	it("outras linguagens não passam pelo mermaid", async () => {
		await desenhar("```python\nprint(1)\n```");
		await esperar(ATRASO_MS + 150);
		expect(falso.parse).not.toHaveBeenCalled();
		expect(container.querySelector(".codigo")).not.toBeNull();
	});
});
