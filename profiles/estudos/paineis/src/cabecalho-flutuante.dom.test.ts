// @vitest-environment happy-dom
// O topo do chat do professor flutuante (CabecalhoFlutuante.tsx): a matéria pela chave do contexto da sessão,
// o seletor de plano dela, "Conversa geral" sem matéria e a linha reservada antes de a sessão chegar.

import type { JanelaPerfilHook } from "@estudos/ui";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CabecalhoFlutuante, materiaDaChave } from "./CabecalhoFlutuante.tsx";

vi.hoisted(() => {
	delete (Element.prototype as { animate?: unknown }).animate;
});

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
let pedidos: Array<{ painel: string; acao: string; dados: unknown }>;

function janela(sessao: { contexto?: { chave: string; rotulo: string; cor?: string } } | undefined): JanelaPerfilHook {
	return {
		estado: {
			perfil: "estudos",
			sessao: sessao ? { sessaoId: "s1", ...sessao } : undefined,
			acoesPorPainel: {},
			conversa: [],
			executando: false,
			fila: [],
			pedidos: [],
			registrosPedidos: {},
		},
		conexao: "aberta",
		acoes: {
			acaoDaInterface: async (painel: string, acao: string, dados: unknown) => {
				pedidos.push({ painel, acao, dados });
			},
			enviar: async () => "iniciada",
		},
	} as unknown as JanelaPerfilHook;
}

const nome = () => container.querySelector<HTMLElement>(".flutuante-cab__nome")!;
const seletor = () => container.querySelector(".mesa-cab__botao--plano");
const daMateria = (id: string) => pedidos.some((pedido) => (pedido.dados as { materia?: string } | undefined)?.materia === id);

beforeEach(() => {
	pedidos = [];
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});
afterEach(async () => {
	root.unmount();
	container.remove();
	await esperar(10);
	vi.unstubAllGlobals();
});

describe("materiaDaChave", () => {
	it("lê o id de 'materia:<id>' e ignora o resto", () => {
		expect(materiaDaChave("materia:calculo")).toBe("calculo");
		expect(materiaDaChave("materia:")).toBeUndefined();
		expect(materiaDaChave("curso:calculo")).toBeUndefined();
		expect(materiaDaChave(undefined)).toBeUndefined();
	});
});

describe("CabecalhoFlutuante", () => {
	it("a matéria da conversa, com o nome do contexto, e o seletor de plano dela", async () => {
		root.render(createElement(CabecalhoFlutuante, { janela: janela({ contexto: { chave: "materia:calculo", rotulo: "Cálculo", cor: "sage" } }) }));
		await ate(() => seletor() !== null);
		expect(nome().textContent).toBe("Cálculo");
		expect(nome().style.visibility).toBe("visible");
		// O seletor pede à extensão a lista dos planos da matéria.
		await ate(() => daMateria("calculo"));
		expect(container.querySelector<HTMLElement>(".flutuante-cab__ponto")!.style.background).toContain("var(--sage)");
	});

	it("sem matéria: 'Conversa geral' e nenhum seletor", async () => {
		root.render(createElement(CabecalhoFlutuante, { janela: janela({}) }));
		await ate(() => nome()?.textContent === "Conversa geral");
		expect(seletor()).toBeNull();
	});

	it("um contexto que não é de matéria também é 'Conversa geral'", async () => {
		root.render(createElement(CabecalhoFlutuante, { janela: janela({ contexto: { chave: "curso:x", rotulo: "Curso X" } }) }));
		await ate(() => nome()?.textContent === "Conversa geral");
		expect(seletor()).toBeNull();
	});

	it("antes de a sessão chegar a linha existe, escondida: nada pula quando ela chega", async () => {
		root.render(createElement(CabecalhoFlutuante, { janela: janela(undefined) }));
		await ate(() => container.querySelector(".flutuante-cab__nome") !== null);
		expect(nome().style.visibility).toBe("hidden");
		root.render(createElement(CabecalhoFlutuante, { janela: janela({ contexto: { chave: "materia:calculo", rotulo: "Cálculo" } }) }));
		await ate(() => nome().style.visibility === "visible");
		expect(container.querySelectorAll(".flutuante-cab__nome")).toHaveLength(1);
	});

	it("trocar de matéria troca o nome e pede os planos da nova", async () => {
		root.render(createElement(CabecalhoFlutuante, { janela: janela({ contexto: { chave: "materia:calculo", rotulo: "Cálculo" } }) }));
		await ate(() => daMateria("calculo"));
		root.render(createElement(CabecalhoFlutuante, { janela: janela({ contexto: { chave: "materia:fisica", rotulo: "Física" } }) }));
		await ate(() => nome()?.textContent === "Física");
		await ate(() => daMateria("fisica"));
	});
});
