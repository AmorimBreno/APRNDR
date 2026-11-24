// @vitest-environment happy-dom
// O seletor do plano de estudos (SeletorPlano.tsx) no DOM, com uma janela falsa em que a ponte "planos" responde como
// a extensão: a lista com o progresso, escolher um plano (manda `seguir` e, com a resposta, a mensagem ao professor),
// "Nenhum" (só solta), "Criar plano nesta conversa" (só a mensagem), o seletor desligado quando ocupado, sem plano na
// matéria e a recusa. Nada aqui toca a pasta de dados nem a rede.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeletorPlano } from "./SeletorPlano.tsx";

// Sem animações nativas: o happy-dom rejeita as que o menu cancela ao fechar (AbortError), e aqui só importa a ligação.
vi.hoisted(() => {
	delete (Element.prototype as { animate?: unknown }).animate;
});

const MATERIA = "calc";
const SESSAO = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

interface Resumo {
	titulo: string;
	feitos: number;
	total: number;
	concluido: boolean;
}
interface Controle {
	planos: Resumo[];
	seguindo: string | null;
	executando: boolean;
	sessao: string | undefined;
	enviadas: Array<{ painel: string; acao: string; dados: Record<string, unknown> }>;
	mensagens: string[];
	/** O que a "extensão" faz com um `seguir`: responde, recusa ou não responde. */
	aoSeguir: "ok" | "erro" | "mudo";
	enviar: (texto: string, contextos?: unknown[]) => Promise<"iniciada">;
	receber(acao: string, dados: unknown): void;
	/** Os contextos da tela que a mesa daria (undefined: o seletor fica sem obterContextos). */
	contextos?: unknown[];
	contextosEnviados: Array<unknown[] | undefined>;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;
let contador = 0;

function Bancada() {
	const [acoesPorPainel, setAcoes] = useState<Record<string, AcaoRecebida[]>>({});
	controle.receber = (acao, dados) => {
		const chave = `i${++contador}`;
		setAcoes((atuais) => ({ ...atuais, planos: [...(atuais.planos ?? []), { chave, acao, dados }] }));
	};
	const [acoes] = useState(() => ({
		acaoDaInterface: async (painel: string, acao: string, dados: Record<string, unknown>) => {
			controle.enviadas.push({ painel, acao, dados });
			if (painel !== "planos") return;
			if (acao === "listar") setTimeout(() => controle.receber("lista", { materia: MATERIA, sessao: controle.sessao, planos: controle.planos, seguindo: controle.seguindo }), 5);
			else if (acao === "seguir") {
				if (controle.aoSeguir === "mudo") return;
				setTimeout(() => {
					if (controle.aoSeguir === "erro") return controle.receber("erro", { ao: "seguir", materia: MATERIA, pedido: dados.pedido, mensagem: "Esse plano não existe mais." });
					controle.seguindo = dados.titulo as string | null;
					controle.receber("seguindo", { materia: MATERIA, sessao: controle.sessao, pedido: dados.pedido, titulo: dados.titulo });
					controle.receber("lista", { materia: MATERIA, sessao: controle.sessao, planos: controle.planos, seguindo: controle.seguindo });
				}, 5);
			}
		},
		enviar: (texto: string, contextos?: unknown[]) => controle.enviar(texto, contextos),
	}));
	const janela = {
		estado: { perfil: "estudos", sessao: controle.sessao ? { sessaoId: controle.sessao } : undefined, acoesPorPainel, conversa: [], executando: controle.executando, fila: [], pedidos: [], registrosPedidos: {} },
		conexao: "aberta",
		acoes,
	} as unknown as JanelaPerfilHook;
	const contextos = controle.contextos;
	return createElement(SeletorPlano, { janela, materiaId: MATERIA, ...(contextos ? { obterContextos: async () => contextos as never } : {}) });
}

const plano = (titulo: string, feitos: number, total: number): Resumo => ({ titulo, feitos, total, concluido: total > 0 && feitos === total });
const botao = () => container.querySelector<HTMLButtonElement>(".mesa-cab__botao--plano")!;
const rotuloDoBotao = () => container.querySelector(".mesa-cab__botao--plano")?.textContent;
const itensDoMenu = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
const textoDosItens = () => itensDoMenu().map((item) => item.textContent);
const abrirMenu = async () => {
	botao().click();
	await ate(() => itensDoMenu().length > 0);
};
const escolher = (inicio: string) => {
	const item = itensDoMenu().find((candidato) => candidato.textContent?.startsWith(inicio));
	if (!item) throw new Error(`sem o item ${inicio}`);
	item.click();
};
const seguirEnviados = () => controle.enviadas.filter((enviada) => enviada.acao === "seguir");

beforeEach(() => {
	contador = 0;
	controle = {
		planos: [plano("Prova final", 2, 5), plano("Revisão", 3, 3)],
		seguindo: "Prova final",
		executando: false,
		sessao: SESSAO,
		enviadas: [],
		mensagens: [],
		aoSeguir: "ok",
		enviar: async (texto, contextos) => {
			controle.mensagens.push(texto);
			controle.contextosEnviados.push(contextos);
			return "iniciada";
		},
		contextosEnviados: [],
		receber: () => {},
	};
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

describe("o seletor do plano", () => {
	it("mostra 'Plano: <título> · 2 de 5' do plano que a conversa segue, e lista os planos com o progresso", async () => {
		root.render(createElement(Bancada));
		await ate(() => rotuloDoBotao()?.includes("Plano: Prova final") === true);
		expect(rotuloDoBotao()).toContain("2 de 5");
		expect(controle.enviadas[0]).toMatchObject({ painel: "planos", acao: "listar", dados: { materia: MATERIA } });
		await abrirMenu();
		expect(textoDosItens()).toEqual(["Prova final2 de 5", "Revisãoconcluído", "Nenhum", "Criar plano nesta conversa"]);
		expect(itensDoMenu().map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
	});

	it("escolher outro plano manda seguir e, com a resposta ok, a mensagem; depois do seguir, nunca antes", async () => {
		root.render(createElement(Bancada));
		await ate(() => rotuloDoBotao()?.includes("Prova final") === true);
		await abrirMenu();
		escolher("Revisão");
		await ate(() => controle.mensagens.length === 1);
		expect(seguirEnviados()).toHaveLength(1);
		expect(seguirEnviados()[0]!.dados).toMatchObject({ materia: MATERIA, titulo: "Revisão", sessao: SESSAO });
		expect(typeof seguirEnviados()[0]!.dados.pedido).toBe("string");
		expect(controle.mensagens).toEqual(['Vamos seguir o plano "Revisão".']);
		await ate(() => rotuloDoBotao()?.includes("Plano: Revisão") === true);
		expect(rotuloDoBotao()).toContain("concluído");
	});

	it("a mensagem vai com o contexto da tela que a mesa dá, como as digitadas no campo", async () => {
		const vendo = [{ tipo: "nota", rotulo: "Aula dia 20 de outubro", foco: true }];
		controle.contextos = vendo;
		root.render(createElement(Bancada));
		await ate(() => rotuloDoBotao()?.includes("Prova final") === true);
		await abrirMenu();
		escolher("Revisão");
		await ate(() => controle.mensagens.length === 1);
		expect(controle.contextosEnviados).toEqual([vendo]);
	});

	it("'Nenhum' só solta: manda seguir com null e nenhuma mensagem", async () => {
		root.render(createElement(Bancada));
		await ate(() => rotuloDoBotao()?.includes("Prova final") === true);
		await abrirMenu();
		escolher("Nenhum");
		await ate(() => rotuloDoBotao()?.includes("Plano: nenhum") === true);
		expect(seguirEnviados()[0]!.dados).toMatchObject({ titulo: null });
		await esperar(40);
		expect(controle.mensagens).toEqual([]);
	});

	it("'Criar plano nesta conversa' manda só a mensagem, sem seguir", async () => {
		root.render(createElement(Bancada));
		await ate(() => rotuloDoBotao()?.includes("Prova final") === true);
		await abrirMenu();
		escolher("Criar plano");
		await ate(() => controle.mensagens.length === 1);
		expect(controle.mensagens).toEqual(["Quero montar um plano de estudos nesta conversa."]);
		expect(seguirEnviados()).toEqual([]);
	});

	it("recusa da extensão: a frase aparece e nenhuma mensagem vai ao professor; o rótulo continua o de antes", async () => {
		controle.aoSeguir = "erro";
		root.render(createElement(Bancada));
		await ate(() => rotuloDoBotao()?.includes("Prova final") === true);
		await abrirMenu();
		escolher("Revisão");
		await ate(() => container.textContent?.includes("Esse plano não existe mais.") === true);
		expect(controle.mensagens).toEqual([]);
		expect(rotuloDoBotao()).toContain("Plano: Prova final");
	});

	it("desligado com o professor respondendo, e sem sessão", async () => {
		controle.executando = true;
		root.render(createElement(Bancada));
		await ate(() => rotuloDoBotao()?.includes("Prova final") === true);
		await ate(() => botao()?.disabled === true);
		root.render(createElement("div"));
		await esperar(10);
		controle.executando = false;
		controle.sessao = undefined;
		root.render(createElement(Bancada));
		await ate(() => container.querySelector(".mesa-cab__botao--plano") !== null);
		expect(botao().disabled).toBe(true);
		expect(controle.enviadas).toEqual(expect.not.arrayContaining([expect.objectContaining({ acao: "seguir" })]));
	});

	it("sem planos na matéria: 'Plano: nenhum' e o menu só com 'Criar plano nesta conversa'", async () => {
		controle.planos = [];
		controle.seguindo = null;
		root.render(createElement(Bancada));
		await ate(() => container.querySelector<HTMLElement>(".mesa-cab__atual-titulo")?.style.visibility === "visible");
		expect(rotuloDoBotao()).toContain("Plano: nenhum");
		await abrirMenu();
		expect(textoDosItens()).toEqual(["Criar plano nesta conversa"]);
	});

	it("o botão tem o mesmo tamanho em todos os estados (largura da linha, título com reticências por CSS)", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const css = readFileSync(resolve(process.cwd(), "profiles/estudos/paineis/src/mesa.css"), "utf8");
		expect(css).toMatch(/\.mesa-cab__botao--plano \{[^}]*width: 100%;/);
		expect(css).toMatch(/\.mesa-cab__atual-titulo \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
	});
});
