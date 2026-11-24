// @vitest-environment happy-dom
// O botão "Mostrar/Esconder o professor flutuante" da tela de perfis (R6), com a ponte falsa.

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PonteBolinha } from "../desktop.ts";
import { BotaoProfessorFlutuante } from "./TelaPerfis.tsx";

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

let container: HTMLDivElement;
let root: Root;
let ligada: boolean;
let bolinha: PonteBolinha;
let ligar: ReturnType<typeof vi.fn<(nova: boolean) => Promise<void>>>;

const botao = () => container.querySelector<HTMLButtonElement>("button")!;
const aparecer = () => ate(() => container.querySelector("button") !== null);
/** O rótulo que está à vista (o outro fica escondido, só para reservar a largura). */
const rotuloVisivel = () =>
	[...container.querySelectorAll<HTMLElement>(".perfis__flutuante-rotulos > span")].find((item) => item.style.visibility === "visible")?.textContent;
const rotulos = () => [...container.querySelectorAll(".perfis__flutuante-rotulos > span")].map((item) => item.textContent);

beforeEach(() => {
	ligada = false;
	ligar = vi.fn<(nova: boolean) => Promise<void>>(async (nova) => {
		ligada = nova;
	});
	bolinha = { ligada: async () => ligada, ligar: (nova) => ligar(nova) };
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});
afterEach(() => {
	root.unmount();
	container.remove();
});

describe("o botão do professor flutuante", () => {
	it("desligada: 'Mostrar o professor flutuante' liga; ligada: 'Esconder…' desliga", async () => {
		root.render(createElement(BotaoProfessorFlutuante, { bolinha }));
		await aparecer();
		await ate(() => !botao().disabled);
		expect(rotuloVisivel()).toBe("Mostrar o professor flutuante");
		botao().click();
		await ate(() => rotuloVisivel() === "Esconder o professor flutuante");
		expect(ligar).toHaveBeenLastCalledWith(true);
		await ate(() => !botao().disabled);
		botao().click();
		await ate(() => rotuloVisivel() === "Mostrar o professor flutuante");
		expect(ligar).toHaveBeenLastCalledWith(false);
	});

	it("já ligada ao abrir a tela: começa em 'Esconder'", async () => {
		ligada = true;
		root.render(createElement(BotaoProfessorFlutuante, { bolinha }));
		await ate(() => rotuloVisivel() === "Esconder o professor flutuante");
	});

	it("os dois rótulos ficam na tela o tempo todo (a largura é a do maior) e, até a ponte responder, o botão só desliga", async () => {
		let responder: (valor: boolean) => void = () => {};
		bolinha = { ...bolinha, ligada: () => new Promise<boolean>((resolve) => (responder = resolve)) };
		root.render(createElement(BotaoProfessorFlutuante, { bolinha }));
		await aparecer();
		expect(botao().disabled).toBe(true);
		expect(rotulos()).toEqual(["Mostrar o professor flutuante", "Esconder o professor flutuante"]);
		responder(false);
		await ate(() => !botao().disabled);
		expect(rotulos()).toEqual(["Mostrar o professor flutuante", "Esconder o professor flutuante"]);
	});

	it("se ligar falhar, o botão continua como estava", async () => {
		ligar = vi.fn<(nova: boolean) => Promise<void>>(async () => {
			throw new Error("falhou");
		});
		root.render(createElement(BotaoProfessorFlutuante, { bolinha }));
		await aparecer();
		await ate(() => !botao().disabled);
		botao().click();
		await ate(() => ligar.mock.calls.length === 1);
		await ate(() => !botao().disabled);
		expect(rotuloVisivel()).toBe("Mostrar o professor flutuante");
	});
});
