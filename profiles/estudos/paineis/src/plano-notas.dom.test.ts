// @vitest-environment happy-dom
// Os planos de estudos nas notas, no DOM (docs/planos-de-estudo.md, seção 7): a tag "plano de estudos · 2 de 5" na lista
// de notas, a faixa do plano no topo do editor (progresso ao vivo e links das conversas) e a ação `mudou_fora` (editor
// limpo recarrega, sujo ignora). O editor de verdade (TipTap) com uma janela falsa em que a ponte de notas responde como
// a extensão; a leitura do plano é a falsa de plano-falso.test-util.ts. Nada aqui toca a pasta de dados nem a rede.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { createElement, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ListaNotas } from "../../lib/nota-tipos.ts";
import { EditorNota } from "./EditorNota.tsx";
import { ContextoMesa, type ValorMesa } from "./mesa-ir.ts";
import { SecaoNotas } from "./SecaoNotas.tsx";
import { type TrocaSessao, TrocaSessaoContexto } from "./troca-sessao.tsx";

vi.mock("../../lib/plano-tipos.ts", async (original) => (await import("./plano-falso.test-util.ts")).comLeituraFalsa(await original()));
// Sem animações nativas: o happy-dom rejeita as que o motion cancela ao desmontar (AbortError).
vi.hoisted(() => {
	delete (Element.prototype as { animate?: unknown }).animate;
});

const PERFIL = "estudos";
const MATERIA = "calc";
const SESSAO = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";

const PLANO = ["Plano de estudos · criado em 24/11/2026", "**Objetivo:** prova", "", "## Itens", "- [x] **Q1**", "- [ ] **Q2**", "- [ ] **Q3**", "", "## Conversas", "- [24/11/2026](conversa:abc12345)"].join("\n");
const PLANO_NOVO = PLANO.replace("- [ ] **Q2**", "- [x] **Q2**");
const NOTAS: Record<string, string> = { "Prova final": PLANO, Comum: "# Séries\n\nA série geométrica converge." };

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

interface Controle {
	enviadas: Array<{ acao: string; dados: Record<string, unknown> }>;
	abrirConversa: Mock<(idCurto: string) => void>;
	receber(acao: string, dados: unknown): void;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;
let contador = 0;

function Bancada({ titulo }: { titulo: string }) {
	const [acoesPorPainel, setAcoes] = useState<Record<string, AcaoRecebida[]>>({});
	controle.receber = (acao, dados) => {
		const chave = `i${++contador}`;
		setAcoes((atuais) => ({ ...atuais, notas: [...(atuais.notas ?? []), { chave, acao, dados }] }));
	};
	const [acoes] = useState(() => ({
		acaoDaInterface: async (painel: string, acao: string, dados: Record<string, unknown>) => {
			controle.enviadas.push({ acao, dados });
			if (painel !== "notas") return;
			if (acao === "abrir") setTimeout(() => controle.receber("nota", { materia: MATERIA, titulo: dados.titulo, conteudo: NOTAS[dados.titulo as string] ?? "", versao: "v1", modificadaEm: "2026-11-11T10:00:00.000Z" }), 5);
			else if (acao === "salvar") setTimeout(() => controle.receber("salva", { materia: MATERIA, titulo: dados.titulo, versao: "v9", modificadaEm: "2026-11-11T10:01:00.000Z", pedido: dados.pedido }), 5);
		},
		enviar: async () => "iniciada" as const,
		listarSessoes: async () => [],
		abrirSessao: async (id: string) => ({ sessaoId: id }),
	}));
	const janela = {
		estado: { perfil: PERFIL, sessao: { sessaoId: SESSAO }, acoesPorPainel, conversa: [], executando: false, fila: [], pedidos: [], registrosPedidos: {} },
		conexao: "aberta",
		acoes,
	} as unknown as JanelaPerfilHook;
	const mesa: ValorMesa = { irPara: () => {}, abrirConversa: (id) => controle.abrirConversa(id) };
	const [troca] = useState<TrocaSessao>(() => ({ situacao: "pronta", voltarParaMateria: () => {}, registrarAntesDeTrocar: () => () => {}, executarAntesDeTrocar: async () => {} }));
	const editor: ReactNode = createElement(EditorNota, { janela, materiaId: MATERIA, titulo, voltar: () => {}, renomeada: () => {}, abrirNota: () => {}, abrirMaterial: () => {} });
	return createElement(TrocaSessaoContexto.Provider, { value: troca }, createElement(ContextoMesa.Provider, { value: mesa }, editor));
}

const notaPronta = (titulo: string) => {
	const pagina = container.querySelector(".editor-nota__pagina");
	const campo = container.querySelector<HTMLTextAreaElement>(".editor-nota__titulo");
	return Boolean(pagina && !pagina.classList.contains("editor-nota__pagina--carregando") && campo?.value === titulo);
};
const faixa = () => container.querySelector<HTMLElement>(".faixa-plano");
const salvarEnviados = () => controle.enviadas.filter((enviada) => enviada.acao === "salvar");
/** O TipTap deixa o editor no elemento do ProseMirror (view.dom.editor). */
const editorTiptap = () => (container.querySelector(".ProseMirror") as unknown as { editor: { commands: { insertContent(texto: string): boolean }; getMarkdown(): string } }).editor;

beforeEach(() => {
	contador = 0;
	controle = { enviadas: [], abrirConversa: vi.fn(), receber: () => {} };
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
	vi.spyOn(document, "hasFocus").mockReturnValue(true);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	root.unmount();
	container.remove();
	await esperar(10);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("a tag 'plano de estudos' na lista de notas", () => {
	it("aparece só nas notas com `plano`, no estilo da tag 'do professor', e o item mantém a estrutura", async () => {
		const lista: ListaNotas = {
			materia: MATERIA,
			notas: [
				{ titulo: "Prova final", modificadaEm: "2026-11-11T10:00:00.000Z", tamanho: 10, previa: "Objetivo", doProfessor: true, plano: { feitos: 2, total: 5 } },
				{ titulo: "Minha", modificadaEm: "2026-11-10T10:00:00.000Z", tamanho: 10, previa: "Texto", doProfessor: false },
			],
		};
		const janela = { estado: { perfil: PERFIL, sessao: { sessaoId: SESSAO }, acoesPorPainel: {} }, acoes: { acaoDaInterface: async () => {} } } as unknown as JanelaPerfilHook;
		root.render(createElement(SecaoNotas, { janela, materiaId: MATERIA, lista, tom: "tijolo" as never, abrirNota: () => {}, criando: false, definirCriando: () => {} }));
		await ate(() => container.querySelectorAll(".notas__item").length === 2);
		const itens = [...container.querySelectorAll<HTMLElement>(".notas__item")];
		expect(itens.map((item) => item.querySelector(".tag-plano")?.textContent ?? null)).toEqual(["plano de estudos · 2 de 5", null]);
		expect(itens[0]!.querySelector(".tag-plano")?.classList.contains("tag-professor")).toBe(true);
		expect(itens.map((item) => item.querySelector(".notas__titulo")?.textContent)).toEqual(["Prova final", "Minha"]);
	});
});

describe("a faixa do plano no editor", () => {
	it("na nota do plano: o progresso do markdown do editor e os links das conversas, que abrem a conversa", async () => {
		root.render(createElement(Bancada, { titulo: "Prova final" }));
		await ate(() => notaPronta("Prova final") && faixa() !== null);
		expect(container.querySelector(".faixa-plano__progresso")?.textContent).toBe("Plano · 1 de 3");
		expect(container.querySelector(".faixa-plano__trilho")?.getAttribute("aria-valuenow")).toBe("1");
		const conversas = [...container.querySelectorAll<HTMLButtonElement>(".faixa-plano__conversa")];
		expect(conversas.map((botao) => botao.textContent)).toEqual(["24/11/2026"]);
		conversas[0]!.click();
		expect(controle.abrirConversa).toHaveBeenCalledWith("abc12345");
		// A faixa fica dentro da página (aparece junto com ela) e tem altura fixa por CSS.
		expect(faixa()!.closest(".editor-nota__pagina")).not.toBeNull();
	});

	it("numa nota comum não há faixa", async () => {
		root.render(createElement(Bancada, { titulo: "Comum" }));
		await ate(() => notaPronta("Comum"));
		await esperar(30);
		expect(faixa()).toBeNull();
	});

	it("o progresso acompanha o que está no editor, antes de salvar", async () => {
		root.render(createElement(Bancada, { titulo: "Prova final" }));
		await ate(() => notaPronta("Prova final") && faixa() !== null);
		// O Breno marca um item no editor: a faixa muda na hora (e a mudança fica por salvar).
		container.querySelectorAll<HTMLInputElement>('.editor-nota__texto input[type="checkbox"]')[1]?.click();
		await ate(() => container.querySelector(".faixa-plano__progresso")?.textContent === "Plano · 2 de 3");
	});

	it("o CSS reserva a altura da faixa e não deixa as conversas esticarem a linha", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const css = readFileSync(resolve(process.cwd(), "profiles/estudos/paineis/src/estilo.css"), "utf8");
		expect(css).toMatch(/\.faixa-plano \{[^}]*height: 28px;[^}]*overflow: hidden;/);
		expect(css).toMatch(/\.faixa-plano__conversas \{[^}]*white-space: nowrap;/);
		expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.faixa-plano__barra \{ transition: none;/);
	});
});

describe("a ação mudou_fora", () => {
	const mudouFora = (conteudo = PLANO_NOVO, extra: Record<string, unknown> = {}) => controle.receber("mudou_fora", { materia: MATERIA, titulo: "Prova final", versao: "v2", conteudo, ...extra });

	it("com o editor limpo, carrega o conteúdo novo sem esconder a página e sem salvar nada", async () => {
		root.render(createElement(Bancada, { titulo: "Prova final" }));
		await ate(() => notaPronta("Prova final") && faixa() !== null);
		mudouFora();
		await ate(() => container.querySelector(".faixa-plano__progresso")?.textContent === "Plano · 2 de 3");
		expect(container.querySelector(".editor-nota__pagina")?.classList.contains("editor-nota__pagina--carregando")).toBe(false);
		expect(container.querySelector(".editor-nota__situacao")?.textContent).not.toMatch(/por salvar|Salvando/);
		await esperar(60);
		expect(salvarEnviados()).toEqual([]);
		// A versão nova vale: um salvamento depois dele leva a v2.
		editorTiptap().commands.insertContent("x");
		await ate(() => salvarEnviados().length === 1, 4000);
		expect(salvarEnviados()[0]!.dados.versao).toBe("v2");
	});

	it("com mudança por salvar, ignora: o texto do Breno fica e o salvamento cai no conflito que já existe", async () => {
		root.render(createElement(Bancada, { titulo: "Prova final" }));
		await ate(() => notaPronta("Prova final") && faixa() !== null);
		editorTiptap().commands.insertContent(" minha anotação");
		await ate(() => container.querySelector(".editor-nota__situacao")?.textContent?.includes("por salvar") === true);
		mudouFora();
		await esperar(60);
		expect(container.querySelector(".faixa-plano__progresso")?.textContent).toBe("Plano · 1 de 3");
		expect(editorTiptap().getMarkdown()).toContain("minha anotação");
	});

	it("de outra nota ou de outra matéria, não faz nada", async () => {
		root.render(createElement(Bancada, { titulo: "Prova final" }));
		await ate(() => notaPronta("Prova final") && faixa() !== null);
		mudouFora(PLANO_NOVO, { titulo: "Outra" });
		mudouFora(PLANO_NOVO, { materia: "fis" });
		await esperar(60);
		expect(container.querySelector(".faixa-plano__progresso")?.textContent).toBe("Plano · 1 de 3");
	});
});
