// @vitest-environment happy-dom
// O botão "Copiar imagem": aparece junto da imagem, entrega um ClipboardItem image/png à área de
// transferência, mostra "Copiada" (ou a falha) por um instante e volta.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotaoCopiarImagem, RETORNO_MS } from "./BotaoCopiarImagem.tsx";
import { ImagemDoPerfil, ProvedorImagens } from "./ImagemDoPerfil.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ItemFalso {
	constructor(public itens: Record<string, Promise<Blob>>) {}
}

let container: HTMLDivElement;
let root: Root;
const escrever = vi.fn();

beforeEach(() => {
	vi.useFakeTimers();
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	escrever.mockReset();
	vi.stubGlobal("ClipboardItem", ItemFalso);
	Object.defineProperty(navigator, "clipboard", { value: { write: escrever }, configurable: true });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const png = () => Promise.resolve(new Blob(["x"], { type: "image/png" }));
const botao = () => container.querySelector<HTMLButtonElement>("button.botao-copiar-imagem")!;
const visivel = () => [...container.querySelectorAll(".botao-copiar-imagem__texto")].find((e) => e.getAttribute("data-ativo") === "true")?.textContent;

describe("BotaoCopiarImagem", () => {
	it("copia um ClipboardItem image/png, mostra Copiada e volta", async () => {
		escrever.mockResolvedValue(undefined);
		act(() => root.render(createElement(BotaoCopiarImagem, { obterPng: png })));
		expect(botao().getAttribute("aria-label")).toBe("Copiar imagem");
		expect(visivel()).toBe("Copiar imagem");
		await act(async () => botao().click());
		expect(escrever).toHaveBeenCalledTimes(1);
		const item = escrever.mock.calls[0]![0][0] as ItemFalso;
		expect(Object.keys(item.itens)).toEqual(["image/png"]);
		expect(visivel()).toBe("Copiada");
		await act(async () => void vi.advanceTimersByTime(RETORNO_MS + 10));
		expect(visivel()).toBe("Copiar imagem");
	});

	it("mostra a mensagem de falha quando a cópia não dá", async () => {
		escrever.mockRejectedValue(new Error("negado"));
		act(() => root.render(createElement(BotaoCopiarImagem, { obterPng: png })));
		await act(async () => botao().click());
		expect(visivel()).toBe("Não deu para copiar");
		await act(async () => void vi.advanceTimersByTime(RETORNO_MS + 10));
		expect(visivel()).toBe("Copiar imagem");
	});

	it("aparece na imagem do perfil", () => {
		act(() => root.render(createElement(ProvedorImagens, { perfilId: "p", children: createElement(ImagemDoPerfil, { caminho: "a.png" }) })));
		expect(container.querySelector(".imagem-perfil img")).not.toBeNull();
		expect(botao().getAttribute("aria-label")).toBe("Copiar imagem a.png");
	});
});
