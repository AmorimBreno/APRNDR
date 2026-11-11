// @vitest-environment happy-dom
// A mesa da parte C1 no DOM (docs/mesa-parte-c.md, seção 4), com o editor de nota de verdade
// e uma janela falsa (a ponte responde "abrir" com a nota e guarda os "salvar" numa lista):
// o destaque não suja a nota, a âncora vence a rolagem guardada da aba, irPara troca de aba
// sem desmontar o chat nem esvaziar a faixa, e os comandos do professor abrem a prévia sem
// repetir os do histórico. Nada aqui toca a pasta de dados.

import type { AcaoRecebida, JanelaPerfilHook, PropsConversaEmbutida } from "@estudos/ui";
import { createElement, type ReactNode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AbaMesa } from "./abas-mesa.ts";
import { EditorNota } from "./EditorNota.tsx";
import { MesaEstudo } from "./MesaEstudo.tsx";
import { useMesa, type ValorMesa } from "./mesa-ir.ts";
import { useVendo, type ValorVendoMesa } from "./vendo.tsx";

const PERFIL = "estudos";
const MATERIA = "calc";
const rotaDa = (titulo: string) => `caderno/${MATERIA}/notas/${titulo}`;

const NOTAS: Record<string, string> = {
	A: "# Séries\n\nA série geométrica converge quando a razão é menor que um.\n\nOutro parágrafo qualquer.",
	B: "# Limites\n\nO limite lateral existe quando os dois lados concordam.",
	C: "# Derivadas\n\nA derivada é o limite da razão incremental.",
};

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

/** O que a bancada de teste expõe para os testes. */
interface Controle {
	mesa: ValorMesa | undefined;
	vendo: ValorVendoMesa | undefined;
	caminho: string;
	salvar: { conteudo: string }[];
	montagensDoChat: number;
	/** Acrescenta uma ação recebida num painel (a ponte mandou). */
	receber(painel: string, acao: string, dados: unknown): void;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;

function ConversaFalsa(_props: PropsConversaEmbutida) {
	useEffect(() => {
		controle.montagensDoChat++;
	}, []);
	return createElement("div", { className: "chat-falso" }, "conversa");
}

function PegaMesa() {
	controle.mesa = useMesa();
	controle.vendo = useVendo();
	return null;
}

function Bancada({ inicial, historico = {} }: { inicial: string; historico?: Record<string, AcaoRecebida[]> }) {
	const [caminho, setCaminho] = useState(inicial);
	const [acoesPorPainel, setAcoes] = useState<Record<string, AcaoRecebida[]>>(historico);
	controle.caminho = caminho;
	const [contador] = useState(() => ({ n: 100 }));
	controle.receber = (painel, acao, dados) => {
		const chave = `i${++contador.n}`;
		setAcoes((atuais) => ({ ...atuais, [painel]: [...(atuais[painel] ?? []), { chave, acao, dados }] }));
	};
	const [acoes] = useState(() => ({
		acaoDaInterface: async (painel: string, acao: string, dados: { materia: string; titulo: string; conteudo: string }) => {
			if (painel === "notas" && acao === "abrir") {
				setTimeout(() => controle.receber("notas", "nota", { materia: dados.materia, titulo: dados.titulo, conteudo: NOTAS[dados.titulo] ?? "", versao: "v1", modificadaEm: "2026-11-11T10:00:00.000Z" }), 5);
			}
			if (acao === "salvar") controle.salvar.push(dados);
		},
		enviar: async () => "iniciada" as const,
	}));
	const janela = { estado: { perfil: PERFIL, sessao: { sessaoId: "s1" }, acoesPorPainel, conversa: [], pedidos: [] }, conexao: "aberta", acoes } as unknown as JanelaPerfilHook;
	// A navegação do app é assíncrona (hashchange): a rota chega depois.
	const navegar = (destino: string) => setTimeout(() => setCaminho(destino), 0);
	const titulo = caminho.split("/").slice(3).join("/");
	return createElement(MesaEstudo, {
		janela: janela as never,
		perfilId: PERFIL,
		materiaId: MATERIA,
		caminho,
		navegar,
		conversa: ConversaFalsa,
		children: (abas: ReactNode) =>
			createElement(
				"section",
				{ className: "cartao" },
				createElement(PegaMesa),
				createElement(EditorNota, { janela, materiaId: MATERIA, titulo, voltar: () => {}, renomeada: () => {}, abrirNota: () => {}, abrirMaterial: () => {}, abaixoDoCabecalho: abas }),
			),
	});
}

function guardarAbas(abas: AbaMesa[]) {
	localStorage.setItem(`estudos:${PERFIL}:${MATERIA}:abas-mesa`, JSON.stringify(abas));
}
const aba = (titulo: string, extra: Partial<AbaMesa> = {}): AbaMesa => ({ chave: rotaDa(titulo), caminho: rotaDa(titulo), tipo: "nota", rotulo: titulo, ...extra });

/** A página da nota desenhada (pronta) e com o título certo no campo. */
function notaPronta(titulo: string): boolean {
	const pagina = container.querySelector(".editor-nota__pagina");
	const campo = container.querySelector<HTMLTextAreaElement>(".editor-nota__titulo");
	return Boolean(pagina && !pagina.classList.contains("editor-nota__pagina--carregando") && campo?.value === titulo);
}
const rotulosDasAbas = () => [...container.querySelectorAll(".mesa-aba__rotulo")].map((rotulo) => rotulo.textContent);

const escritasDeRolagem: number[] = [];
const descritorScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
const scrollToOriginal = Element.prototype.scrollTo;

beforeEach(() => {
	controle = { mesa: undefined, vendo: undefined, caminho: "", salvar: [], montagensDoChat: 0, receber: () => {} };
	escritasDeRolagem.length = 0;
	localStorage.clear();
	// Movimento reduzido: sem animações (o happy-dom rejeita animações nativas canceladas).
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
	vi.spyOn(document, "hasFocus").mockReturnValue(true);
	// As escritas na rolagem do corpo da nota (a devolução da rolagem guardada e a rolagem até a âncora).
	Object.defineProperty(Element.prototype, "scrollTop", {
		configurable: true,
		get() {
			return (this as { _topo?: number })._topo ?? 0;
		},
		set(valor: number) {
			(this as { _topo?: number })._topo = valor;
			if ((this as Element).classList?.contains("editor-nota__corpo")) escritasDeRolagem.push(valor);
		},
	});
	Element.prototype.scrollTo = function (this: Element, opcoes?: ScrollToOptions | number) {
		const topo = typeof opcoes === "number" ? opcoes : (opcoes?.top ?? 0);
		(this as unknown as { scrollTop: number }).scrollTop = topo;
	} as typeof Element.prototype.scrollTo;
	// O happy-dom não mede: a posição do trecho na tela vem daqui (o ProseMirror pede os retângulos de um Range).
	vi.spyOn(Range.prototype, "getClientRects").mockImplementation(() => [new DOMRect(0, 400, 50, 20)] as unknown as DOMRectList);
	vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 400, 50, 20));
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	root.unmount();
	container.remove();
	await esperar(10);
	if (descritorScrollTop) Object.defineProperty(Element.prototype, "scrollTop", descritorScrollTop);
	Element.prototype.scrollTo = scrollToOriginal;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("o destaque na nota", () => {
	it("marca o trecho por uma Decoration, sem sujar a nota nem disparar salvamento, e some no próximo clique", async () => {
		guardarAbas([aba("A")]);
		root.render(createElement(Bancada, { inicial: rotaDa("A") }));
		await ate(() => notaPronta("A"));
		controle.mesa!.irPara({ origem: rotaDa("A"), trecho: "série geométrica converge", quem: "usuario" });
		await ate(() => container.querySelector(".mesa-destaque") !== null);
		expect(container.querySelector(".mesa-destaque")?.textContent).toBe("série geométrica converge");
		// O salvamento automático sairia 1,5 s depois de uma mudança: nada sai.
		await esperar(1700);
		expect(controle.salvar).toEqual([]);
		expect(container.querySelector(".editor-nota__situacao")?.textContent).not.toBe("Mudanças por salvar");
		document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		await ate(() => container.querySelector(".mesa-destaque") === null);
		await esperar(1700);
		expect(controle.salvar).toEqual([]);
	}, 10_000);

	it("inserirNoBuffer acrescenta pelo parser do editor e o salvamento automático grava", async () => {
		guardarAbas([aba("A")]);
		root.render(createElement(Bancada, { inicial: rotaDa("A") }));
		await ate(() => notaPronta("A"));
		const resultado = controle.vendo!.ativa()?.inserirNoBuffer?.("> Citação do professor\n>\n> Professor, conversa de 11/11/2026");
		expect(resultado).toEqual({ ok: true });
		await ate(() => controle.salvar.length > 0, 4000);
		const gravado = controle.salvar[0]!.conteudo;
		expect(gravado.startsWith("# Séries")).toBe(true);
		expect(gravado).toContain("Outro parágrafo qualquer.\n\n> Citação do professor");
	}, 10_000);
});

describe("a âncora contra a rolagem guardada", () => {
	it("ao ir para outra aba com âncora, a rolagem guardada da aba não é devolvida: quem rola é a âncora", async () => {
		guardarAbas([aba("A", { rolagem: 900 }), aba("B")]);
		root.render(createElement(Bancada, { inicial: rotaDa("B") }));
		await ate(() => notaPronta("B"));
		controle.mesa!.irPara({ origem: `${rotaDa("A")}?antes=${encodeURIComponent("A ")}`, trecho: "série geométrica", quem: "usuario" });
		await ate(() => notaPronta("A") && container.querySelector(".mesa-destaque") !== null);
		// A devolução desiste depois de 45 quadros: passado esse tempo, 900 nunca foi escrito.
		await esperar(1200);
		expect(escritasDeRolagem).not.toContain(900);
		// O trecho está a 400 px (o retângulo falso), com 20 de altura: centrado, 410.
		expect(escritasDeRolagem).toContain(410);
	}, 10_000);

	it("sem âncora, a mesma troca devolve a rolagem guardada (o controle do teste acima)", async () => {
		guardarAbas([aba("A", { rolagem: 900 }), aba("B")]);
		root.render(createElement(Bancada, { inicial: rotaDa("B") }));
		await ate(() => notaPronta("B"));
		controle.mesa!.irPara({ origem: rotaDa("A"), quem: "usuario" });
		await ate(() => escritasDeRolagem.includes(900), 4000);
	}, 10_000);
});

describe("trocar de aba pelo irPara", () => {
	it("não desmonta o chat e a faixa nunca fica vazia nem com outro conteúdo no meio da troca", async () => {
		guardarAbas([aba("A"), aba("B")]);
		root.render(createElement(Bancada, { inicial: rotaDa("A") }));
		await ate(() => notaPronta("A"));
		const chat = container.querySelector(".chat-falso");
		expect(controle.montagensDoChat).toBe(1);
		// O estado da tela a cada 15 ms (docs/padroes-de-interface.md, "Como conferir").
		const vistos = new Set<string>();
		const amostra = setInterval(() => {
			vistos.add(JSON.stringify({ chat: container.querySelector(".chat-falso") === chat, abas: rotulosDasAbas() }));
		}, 15);
		controle.mesa!.irPara({ origem: rotaDa("B"), trecho: "limite lateral", quem: "usuario" });
		await ate(() => notaPronta("B"));
		await esperar(200);
		clearInterval(amostra);
		expect(controle.montagensDoChat).toBe(1);
		expect([...vistos]).toEqual([JSON.stringify({ chat: true, abas: ["A", "B"] })]);
	}, 10_000);
});

describe("os comandos do professor", () => {
	const comando = (id: string, titulo: string) => ({ cmd: "abrir", id, tipo: "nota", caminho: rotaDa(titulo), rotulo: titulo, foco: "previa" });

	it("os do histórico não executam; um novo abre na vaga de prévia e toma o foco (o Breno não está editando)", async () => {
		guardarAbas([aba("A")]);
		const historico = { mesa: [{ chave: "i1", acao: "comando", dados: comando("velho", "C") }] };
		root.render(createElement(Bancada, { inicial: rotaDa("A"), historico }));
		await ate(() => notaPronta("A"));
		await esperar(100);
		expect(rotulosDasAbas()).toEqual(["A"]);
		controle.receber("mesa", "comando", comando("novo", "B"));
		await ate(() => notaPronta("B"));
		expect(rotulosDasAbas()).toEqual(["A", "B"]);
		expect(container.querySelectorAll(".mesa-aba--previa")).toHaveLength(1);
		// O mesmo id de novo (outra chave) não repete; outro comando reaproveita a vaga.
		controle.receber("mesa", "comando", comando("novo", "C"));
		await esperar(150);
		expect(controle.caminho).toBe(rotaDa("B"));
		controle.receber("mesa", "comando", comando("outro", "C"));
		await ate(() => notaPronta("C"));
		expect(rotulosDasAbas()).toEqual(["A", "C"]);
	}, 10_000);

	it("com o Breno editando, a prévia abre na faixa sem tomar o foco", async () => {
		guardarAbas([aba("A")]);
		root.render(createElement(Bancada, { inicial: rotaDa("A") }));
		await ate(() => notaPronta("A"));
		container.querySelector<HTMLElement>(".editor-nota__corpo")!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
		controle.receber("mesa", "comando", comando("c1", "B"));
		await ate(() => rotulosDasAbas().includes("B"));
		await esperar(100);
		expect(controle.caminho).toBe(rotaDa("A"));
		expect(container.querySelector(".mesa-aba--previa .mesa-aba__rotulo")?.textContent).toBe("B");
	}, 10_000);

	it("a aba do navegador sem foco não reage", async () => {
		guardarAbas([aba("A")]);
		root.render(createElement(Bancada, { inicial: rotaDa("A") }));
		await ate(() => notaPronta("A"));
		vi.mocked(document.hasFocus).mockReturnValue(false);
		controle.receber("mesa", "comando", comando("c1", "B"));
		await esperar(150);
		expect(rotulosDasAbas()).toEqual(["A"]);
	}, 10_000);
});
