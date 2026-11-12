// @vitest-environment happy-dom
// A rota aprendiz/indicadores[/<matéria>] na TelaEstudos, o botão que a abre na tela de cadernos, o rótulo do
// "voltar" da conversa e o registro do painel "aprendiz". A janela (useJanelaPerfil) é falsa: nada de rede nem de
// pasta de dados. Os nomes das matérias vêm do painel "cadernos", como na TelaEstudos de verdade.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conceitoDeTeste, indicadoresDeTeste } from "./aprendiz-fixtures.ts";
import { PAINEL_APRENDIZ } from "./aprendiz-ponte.ts";

const estadoFalso = vi.hoisted(() => ({ janela: undefined as unknown }));

vi.mock("@estudos/ui", async (original) => ({
	...(await original<typeof import("@estudos/ui")>()),
	useJanelaPerfil: () => estadoFalso.janela,
}));

const { paineisEstudos, telaInicialEstudos } = await import("./index.ts");
const { TelaEstudos } = await import("./TelaEstudos.tsx");
const { TelaCadernos } = await import("./TelaCadernos.tsx");

let container: HTMLDivElement;
let root: Root;
let pedir: ReturnType<typeof vi.fn>;
let acoesFalsas: Record<string, unknown>;
let porPainel: Record<string, AcaoRecebida[]>;
const navegar = vi.fn();
const matchMediaOriginal = window.matchMedia.bind(window);

const MATERIAS = [
	{ id: "calculo", nome: "Cálculo I", cor: "moss", glifo: "学", provas: [], criadaEm: "2026-01-01T00:00:00.000Z" },
	{ id: "fisica", nome: "Física", cor: "steel", glifo: "習", provas: [], criadaEm: "2026-01-01T00:00:00.000Z" },
];

function montarJanela(): JanelaPerfilHook {
	return {
		estado: { perfil: "estudos", sessao: { sessaoId: "s1" }, acoesPorPainel: porPainel, executando: false, fila: [], pedidos: [], erros: [], registrosPedidos: {}, materiais: [] },
		conexao: "aberta",
		acoes: acoesFalsas,
	} as unknown as JanelaPerfilHook;
}

const props = (caminho: string) => ({ perfilId: "estudos", caminho, navegar, abrirConversa: vi.fn(), voltar: vi.fn() });
const desenhar = (componente: typeof TelaEstudos, caminho: string) => {
	estadoFalso.janela = montarJanela();
	act(() => root.render(createElement(componente, props(caminho))));
};
const receber = (painel: string, acao: string, dados: unknown) => {
	porPainel = { ...porPainel, [painel]: [...(porPainel[painel] ?? []), { chave: `r${Math.random()}`, acao, dados }] };
};

beforeEach(() => {
	vi.stubGlobal("matchMedia", (query: string) => {
		const consulta = matchMediaOriginal(query);
		Object.defineProperty(consulta, "matches", { value: query.includes("prefers-reduced-motion") });
		return consulta;
	});
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	pedir = vi.fn(async () => {});
	acoesFalsas = { acaoDaInterface: pedir, listarMateriais: vi.fn(async () => {}) };
	porPainel = {};
	navegar.mockClear();
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
	vi.unstubAllGlobals();
});

describe("a rota na TelaEstudos", () => {
	it("aprendiz/indicadores abre a tela, pede os indicadores e a lista de matérias", () => {
		desenhar(TelaEstudos, "aprendiz/indicadores");
		expect(container.querySelector("h1")?.textContent).toBe("Perfil do aprendiz");
		expect(pedir).toHaveBeenCalledWith(PAINEL_APRENDIZ, "indicadores", {});
		expect(pedir).toHaveBeenCalledWith("cadernos", "listar");
		expect(container.querySelector(".folha")).toBeNull();
	});

	it("aprendiz/indicadores/<matéria> filtra pela matéria e usa o nome que a TelaEstudos conhece", () => {
		desenhar(TelaEstudos, "aprendiz/indicadores/fisica");
		receber("cadernos", "lista", { materias: MATERIAS, erros: [] });
		desenhar(TelaEstudos, "aprendiz/indicadores/fisica");
		receber(PAINEL_APRENDIZ, "indicadores", { indicadores: indicadoresDeTeste([conceitoDeTeste({ conceito: "a", nome: "Limites" }), conceitoDeTeste({ conceito: "b", nome: "Ondas", materia: "fisica" })]) });
		desenhar(TelaEstudos, "aprendiz/indicadores/fisica");
		expect(container.querySelector(".ap-cbar__kicker")?.textContent).toBe("Física");
		expect([...container.querySelectorAll(".apz-nome")].map((nome) => nome.textContent)).toEqual(["Ondas"]);
		const opcoes = [...container.querySelectorAll("select option")].map((o) => o.textContent);
		expect(opcoes).toEqual(["Todas as matérias", "Cálculo I", "Física"]);
	});

	it("aprendiz/hipoteses e aprendiz/historico abrem a aba delas (com a matéria), e pedem os dados dela", () => {
		desenhar(TelaEstudos, "aprendiz/hipoteses/fisica");
		expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Hipóteses");
		expect(pedir).toHaveBeenCalledWith(PAINEL_APRENDIZ, "hipoteses", {});
		expect(pedir).toHaveBeenCalledWith(PAINEL_APRENDIZ, "historico", {});
		desenhar(TelaEstudos, "aprendiz/historico");
		expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Histórico");
	});

	it("aprendiz/historico/<matéria>?evento=<id> não confunde o ? com a matéria nem com a aba, e destaca o evento; F5 volta para a mesma rota", () => {
		const eventos = [{ id: "e-1", ts: new Date(2026, 10, 10, 14, 32).toISOString(), verbo: "respondeu_questao", objeto: { materia: "calculo" }, resultado: { correta: true } }];
		const rota = "aprendiz/historico/calculo?evento=e-1";
		desenhar(TelaEstudos, rota);
		receber("cadernos", "lista", { materias: MATERIAS, erros: [] });
		receber(PAINEL_APRENDIZ, "historico", { eventos });
		receber(PAINEL_APRENDIZ, "hipoteses", { estado: { hipoteses: [], mudancas: [], refletindo: false } });
		desenhar(TelaEstudos, rota);
		expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Histórico");
		expect(container.querySelector(".ap-cbar__kicker")?.textContent).toBe("Cálculo I");
		expect(container.querySelector('[data-evento="e-1"]')?.classList.contains("apz-evento--destaque")).toBe(true);
		act(() => root.unmount());
		root = createRoot(container);
		desenhar(TelaEstudos, rota);
		expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Histórico");
	});

	it("aprendiz/hipoteses?hipotese=<id> destaca a hipótese", () => {
		const estado = { hipoteses: [{ id: "h-1", tipo: "ritmo", escopo: { nivel: "global" }, enunciado: "Estuda melhor de manhã, em sessões curtas.", aFavor: [], contra: [], confianca: "baixa", criadaEm: "2026-11-01T10:00:00.000Z", ultimaConfirmacao: "2026-11-01T10:00:00.000Z", validade: "2027-01-01", status: "aprovada", aprovadaPeloUsuario: true, versao: 1, anteriores: [] }], mudancas: [], refletindo: false };
		const rota = "aprendiz/hipoteses?hipotese=h-1";
		desenhar(TelaEstudos, rota);
		receber(PAINEL_APRENDIZ, "hipoteses", { estado });
		receber(PAINEL_APRENDIZ, "historico", { eventos: [] });
		desenhar(TelaEstudos, rota);
		expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Hipóteses");
		expect(container.querySelector('[data-hipotese="h-1"]')?.classList.contains("apz-hip--destaque")).toBe(true);
	});

	it("recarregar a página na rota (montar de novo no mesmo caminho) volta para a tela", () => {
		desenhar(TelaEstudos, "aprendiz/indicadores/calculo");
		act(() => root.unmount());
		root = createRoot(container);
		desenhar(TelaEstudos, "aprendiz/indicadores/calculo");
		expect(container.querySelector("h1")?.textContent).toBe("Perfil do aprendiz");
		expect(container.querySelector(".ap-cbar__kicker")?.textContent).toBe(" ");
	});

	it("uma aba que não existe cai em Indicadores; os outros caminhos não abrem esta tela", () => {
		desenhar(TelaEstudos, "aprendiz/outra");
		expect(container.querySelector("h1")?.textContent).toBe("Perfil do aprendiz");
		expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Indicadores");
		desenhar(TelaEstudos, "");
		expect(container.querySelector("h1")?.textContent).not.toBe("Perfil do aprendiz");
	});
});

describe("o botão na tela de cadernos", () => {
	it("'Perfil do aprendiz' leva à rota aprendiz/indicadores", async () => {
		receber("cadernos", "lista", { materias: MATERIAS, erros: [] });
		act(() => root.render(createElement(TelaCadernos, { ...props(""), janela: montarJanela(), escolher: vi.fn() })));
		const botao = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Perfil do aprendiz"));
		expect(botao).toBeDefined();
		expect(botao?.className).toBe(([...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Escrita")) as HTMLElement).className);
		await act(async () => botao!.click());
		await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith("aprendiz/indicadores"));
	});
});

describe("o registro no perfil", () => {
	it("o painel 'aprendiz' fica fora da área de painéis, como os outros da ponte", () => {
		expect(paineisEstudos[PAINEL_APRENDIZ]).toMatchObject({ foraDaArea: true });
	});

	it("o rótulo do voltar da conversa é 'Aprendiz' para a rota do aprendiz", () => {
		const rotulo = telaInicialEstudos.rotuloDoCaminho!;
		expect(rotulo("aprendiz/indicadores")).toBe("Aprendiz");
		expect(rotulo("aprendiz/indicadores/fisica")).toBe("Aprendiz");
		expect(rotulo("aprendiz/historico/fisica?evento=e-1")).toBe("Aprendiz");
		expect(rotulo("agenda/calendario")).toBe("Agenda");
		expect(rotulo("caderno/calculo")).toBe("Caderno");
		expect(rotulo("")).toBeUndefined();
	});

	it("as trocas dentro da tela não animam a página inteira", () => {
		expect(telaInicialEstudos.semTransicao!("aprendiz/indicadores", "aprendiz/indicadores/fisica")).toBe(true);
		expect(telaInicialEstudos.semTransicao!("aprendiz/hipoteses", "aprendiz/historico/fisica?evento=e-1")).toBe(true);
		expect(telaInicialEstudos.semTransicao!("", "aprendiz/indicadores")).toBe(false);
	});
});
