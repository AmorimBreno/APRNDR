// @vitest-environment happy-dom
// A âncora pendente da mesa (MesaEstudo.tsx, parte C1) com uma fonte falsa no Vendo: ela espera
// o conteúdo ficar pronto, desiste depois do prazo em silêncio, só a fonte da rota pedida
// serve, e a queda de nível mostra o aviso sem mudar o tamanho de nada.

import type { JanelaPerfilHook } from "@estudos/ui";
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NivelAncora, PedidoAncora } from "./ancora.ts";
import { MesaEstudo } from "./MesaEstudo.tsx";
import { useMesa, type ValorMesa } from "./mesa-ir.ts";
import { useVendo } from "./vendo.tsx";

const ROTA = "caderno/calc/notas/A";
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

let container: HTMLDivElement;
let root: Root;
let mesa: ValorMesa | undefined;
let pronta: boolean;
let resposta: NivelAncora;
let chamadas: PedidoAncora[];
let tentativas: number;

function FonteFalsa({ origem }: { origem: string }) {
	const { registrar } = useVendo();
	mesa = useMesa();
	useEffect(
		() =>
			registrar({
				tipo: "nota",
				rotulo: "A",
				origem,
				texto: () => "texto",
				mostrar: (pedido) => {
					tentativas++;
					if (!pronta) return undefined;
					chamadas.push(pedido);
					return resposta;
				},
			}),
		[registrar, origem],
	);
	return createElement("div", { className: "editor-nota__corpo" });
}

function renderizar(origemDaFonte = ROTA) {
	const janela = { estado: { sessao: { sessaoId: "s1" }, acoesPorPainel: {} }, acoes: {} } as unknown as JanelaPerfilHook;
	root.render(createElement(MesaEstudo, { janela: janela as never, perfilId: "estudos", materiaId: "calc", caminho: ROTA, navegar: () => {}, children: createElement(FonteFalsa, { origem: origemDaFonte }) }));
}

beforeEach(() => {
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {} }));
	localStorage.clear();
	pronta = false;
	resposta = "exato";
	chamadas = [];
	tentativas = 0;
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

it("a âncora espera o conteúdo ficar pronto e é resolvida uma vez só", async () => {
	renderizar();
	await esperar(50);
	mesa!.irPara({ origem: ROTA, trecho: "série", quem: "usuario" });
	await esperar(200);
	expect(chamadas).toEqual([]);
	expect(tentativas).toBeGreaterThan(1);
	pronta = true;
	await esperar(200);
	expect(chamadas).toEqual([{ trecho: "série", soRolar: false }]);
	await esperar(200);
	expect(chamadas).toHaveLength(1);
});

it("depois do prazo desiste em silêncio (o conteúdo que fica pronto depois não rola nada)", async () => {
	renderizar();
	await esperar(50);
	mesa!.irPara({ origem: ROTA, trecho: "série", quem: "usuario" });
	await esperar(5300);
	const ate = tentativas;
	pronta = true;
	await esperar(300);
	expect(tentativas).toBe(ate);
	expect(chamadas).toEqual([]);
	expect(container.querySelector(".mesa__trecho-aviso--visivel")).toBeNull();
}, 10_000);

it("só a fonte da rota pedida serve (a da aba anterior, ainda registrada, não)", async () => {
	pronta = true;
	renderizar("caderno/calc/notas/Outra");
	await esperar(50);
	mesa!.irPara({ origem: ROTA, trecho: "série", quem: "usuario" });
	await esperar(300);
	expect(chamadas).toEqual([]);
});

it("a queda de nível mostra o aviso discreto; o elemento do aviso já existia (nada entra no layout)", async () => {
	pronta = true;
	resposta = "bloco";
	renderizar();
	await esperar(50);
	const aviso = container.querySelector(".mesa__trecho-aviso");
	expect(aviso).not.toBeNull();
	expect(aviso?.classList.contains("mesa__trecho-aviso--visivel")).toBe(false);
	mesa!.irPara({ origem: `${ROTA}?bloco=Séries&antes=x`, trecho: "série", quem: "usuario" });
	await esperar(200);
	expect(chamadas[0]).toMatchObject({ trecho: "série", ancora: { bloco: "Séries", antes: "x" } });
	expect(container.querySelector(".mesa__trecho-aviso")).toBe(aviso);
	expect(aviso?.classList.contains("mesa__trecho-aviso--visivel")).toBe(true);
	expect(aviso?.querySelector("[role=status]")?.textContent).toBe("O trecho mudou desde a pergunta");
});

it("sem trecho nem bloco (o comando abrir), não há âncora: a fonte não é chamada", async () => {
	pronta = true;
	renderizar();
	await esperar(50);
	mesa!.irPara({ origem: ROTA, quem: "previa" });
	await esperar(200);
	expect(tentativas).toBe(0);
});
