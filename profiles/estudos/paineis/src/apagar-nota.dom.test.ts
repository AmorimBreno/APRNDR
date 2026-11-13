// @vitest-environment happy-dom
// O botão Apagar do editor de nota (as notas do Breno) no DOM: a mesa de verdade (MesaEstudo com o editor de
// nota) e uma janela falsa em que a ponte de notas responde como a extensão. Cobre o modal de confirmação
// (Cancelar não manda nada), o pedido `apagar` com a versão aberta, a aba que fecha depois da resposta, a recusa
// (o modal fica, com a mensagem, e a nota continua) e o editor que não salva mais depois de apagada. Nada aqui
// toca a pasta de dados nem a rede.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { createElement, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AbaMesa } from "./abas-mesa.ts";
import { EditorNota } from "./EditorNota.tsx";
import { MesaEstudo } from "./MesaEstudo.tsx";
import { type TrocaSessao, TrocaSessaoContexto } from "./troca-sessao.tsx";

const PERFIL = "estudos";
const MATERIA = "calc";
const SESSAO = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";
const rotaDa = (titulo: string) => `caderno/${MATERIA}/notas/${titulo}`;
const CONTEXTO = { chave: `materia:${MATERIA}`, rotulo: "Cálculo" };
const NOTAS: Record<string, string> = { A: "# Séries\n\nA série geométrica converge.", B: "# Limites\n\nO limite lateral." };

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

interface Enviada {
	acao: string;
	dados: Record<string, unknown>;
}
interface Controle {
	caminho: string;
	enviadas: Enviada[];
	voltou: number;
	/** O que a "extensão" faz com um `apagar`. */
	extensao: (dados: Record<string, unknown>) => void;
	receber(acao: string, dados: unknown): void;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;
let contadorAcoes = 0;

const SemConversa = () => null;

function Bancada({ inicial }: { inicial: string }) {
	const [caminho, setCaminho] = useState(inicial);
	const [acoesPorPainel, setAcoes] = useState<Record<string, AcaoRecebida[]>>({});
	controle.caminho = caminho;
	controle.receber = (acao, dados) => {
		const chave = `i${++contadorAcoes}`;
		setAcoes((atuais) => ({ ...atuais, notas: [...(atuais.notas ?? []), { chave, acao, dados }] }));
	};
	const [acoes] = useState(() => ({
		acaoDaInterface: async (painel: string, acao: string, dados: Record<string, unknown>) => {
			controle.enviadas.push({ acao, dados });
			if (painel !== "notas") return;
			if (acao === "abrir") setTimeout(() => controle.receber("nota", { materia: MATERIA, titulo: dados.titulo, conteudo: NOTAS[dados.titulo as string] ?? "", versao: "v1", modificadaEm: "2026-11-11T10:00:00.000Z" }), 5);
			else if (acao === "listar") setTimeout(() => controle.receber("lista", { materia: MATERIA, notas: [] }), 5);
			else if (acao === "apagar") controle.extensao(dados);
		},
		enviar: async () => "iniciada" as const,
		listarSessoes: async () => [],
		abrirSessao: async (id: string) => ({ sessaoId: id }),
	}));
	const janela = {
		estado: { perfil: PERFIL, sessao: { sessaoId: SESSAO, contexto: CONTEXTO }, acoesPorPainel, conversa: [], executando: false, fila: [], pedidos: [], registrosPedidos: {} },
		conexao: "aberta",
		acoes,
	} as unknown as JanelaPerfilHook;
	const navegar = (destino: string) => setTimeout(() => setCaminho(destino), 0);
	const titulo = caminho.split("/").slice(3).join("/");
	return createElement(MesaEstudo, {
		janela: janela as never,
		perfilId: PERFIL,
		materiaId: MATERIA,
		caminho,
		navegar,
		conversa: SemConversa,
		materia: { id: MATERIA, nome: "Cálculo", cor: "tijolo" } as never,
		children: (abas: ReactNode) =>
			createElement(
				"section",
				{ className: "cartao" },
				createElement(EditorNota, {
					janela,
					materiaId: MATERIA,
					titulo,
					voltar: () => {
						controle.voltou += 1;
						navegar(`caderno/${MATERIA}/notas`);
					},
					renomeada: () => {},
					abrirNota: () => {},
					abrirMaterial: () => {},
					abaixoDoCabecalho: abas,
				}),
			),
	});
}

function ComTroca({ filhos }: { filhos: ReactNode }) {
	const [valor] = useState<TrocaSessao>(() => ({
		situacao: "pronta",
		voltarParaMateria: () => {},
		registrarAntesDeTrocar: () => () => {},
		executarAntesDeTrocar: async () => {},
	}));
	return createElement(TrocaSessaoContexto.Provider, { value: valor }, filhos);
}

const aba = (titulo: string): AbaMesa => ({ chave: rotaDa(titulo), caminho: rotaDa(titulo), tipo: "nota", rotulo: titulo });
const desenhar = (inicial: string, abas: AbaMesa[]) => {
	localStorage.setItem(`estudos:${PERFIL}:${MATERIA}:abas-mesa`, JSON.stringify(abas));
	root.render(createElement(ComTroca, { filhos: createElement(Bancada, { inicial }) }));
};
const rotulosDasAbas = () => [...container.querySelectorAll(".mesa-aba__rotulo")].map((rotulo) => rotulo.textContent);
const notaPronta = (titulo: string) => {
	const pagina = container.querySelector(".editor-nota__pagina");
	const campo = container.querySelector<HTMLTextAreaElement>(".editor-nota__titulo");
	return Boolean(pagina && !pagina.classList.contains("editor-nota__pagina--carregando") && campo?.value === titulo);
};
const botaoApagar = () => [...container.querySelectorAll<HTMLButtonElement>(".editor-nota__barra button")].find((botao) => botao.textContent === "Apagar");
const modal = () => document.querySelector<HTMLElement>('[role="dialog"]');
const botaoDoModal = (rotulo: string) => [...(modal()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((botao) => botao.textContent?.includes(rotulo));
const apagarEnviado = () => controle.enviadas.filter((enviada) => enviada.acao === "apagar");

beforeEach(() => {
	contadorAcoes = 0;
	controle = { caminho: "", enviadas: [], voltou: 0, extensao: () => {}, receber: () => {} };
	localStorage.clear();
	// Movimento reduzido: sem animações (o happy-dom rejeita animações nativas canceladas).
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
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("o botão Apagar do editor de nota", () => {
	it("fica no cabeçalho, desligado até a nota abrir, e o modal de Cancelar não manda nada", async () => {
		desenhar(rotaDa("A"), [aba("A")]);
		await ate(() => botaoApagar() !== undefined);
		await ate(() => notaPronta("A"));
		expect(botaoApagar()!.disabled).toBe(false);
		botaoApagar()!.click();
		await ate(() => modal() !== null);
		expect(modal()!.textContent).toContain("Apagar esta nota?");
		expect(modal()!.textContent).toContain("A");
		expect(modal()!.textContent).toContain("notas/.lixeira");
		botaoDoModal("Cancelar")!.click();
		await ate(() => modal() === null);
		expect(apagarEnviado()).toHaveLength(0);
	});

	it("confirmar manda `apagar` com a versão aberta, espera a resposta, fecha a aba e nunca salva", async () => {
		controle.extensao = (dados) => {
			setTimeout(() => controle.receber("apagada", { materia: dados.materia, titulo: dados.titulo, pedido: dados.pedido }), 20);
		};
		desenhar(rotaDa("A"), [aba("A"), aba("B")]);
		await ate(() => notaPronta("A"));
		expect(rotulosDasAbas()).toEqual(["A", "B"]);
		botaoApagar()!.click();
		await ate(() => botaoDoModal("Apagar nota") !== undefined);
		botaoDoModal("Apagar nota")!.click();
		await ate(() => apagarEnviado().length === 1);
		expect(apagarEnviado()[0]!.dados).toMatchObject({ materia: MATERIA, titulo: "A", versao: "v1" });
		expect(typeof apagarEnviado()[0]!.dados.pedido).toBe("string");
		// Sem resposta ainda, o modal fica e não deixa apertar de novo.
		expect(botaoDoModal("Apagar nota")!.disabled).toBe(true);
		await ate(() => rotulosDasAbas().join() === "B");
		await ate(() => controle.caminho === rotaDa("B"));
		expect(controle.enviadas.map((enviada) => enviada.acao)).not.toContain("salvar");
	});

	it("a recusa deixa o modal aberto com a mensagem, a aba e a nota onde estavam, e dá para tentar de novo", async () => {
		controle.extensao = (dados) => {
			setTimeout(() => controle.receber("erro", { ao: "apagar", materia: dados.materia, titulo: dados.titulo, pedido: dados.pedido, mensagem: "A nota mudou fora do app depois que você a abriu. Nada foi apagado." }), 10);
		};
		desenhar(rotaDa("A"), [aba("A"), aba("B")]);
		await ate(() => notaPronta("A"));
		botaoApagar()!.click();
		await ate(() => botaoDoModal("Apagar nota") !== undefined);
		botaoDoModal("Apagar nota")!.click();
		await ate(() => modal()!.textContent!.includes("Nada foi apagado."));
		expect(botaoDoModal("Apagar nota")!.disabled).toBe(false);
		expect(rotulosDasAbas()).toEqual(["A", "B"]);
		expect(controle.caminho).toBe(rotaDa("A"));
		botaoDoModal("Apagar nota")!.click();
		await ate(() => apagarEnviado().length === 2);
		expect(apagarEnviado()[1]!.dados.pedido).not.toBe(apagarEnviado()[0]!.dados.pedido);
	});

	it("a resposta de outro pedido não apaga nada na tela", async () => {
		controle.extensao = (dados) => {
			setTimeout(() => controle.receber("apagada", { materia: dados.materia, titulo: dados.titulo, pedido: "outro" }), 10);
		};
		desenhar(rotaDa("A"), [aba("A"), aba("B")]);
		await ate(() => notaPronta("A"));
		botaoApagar()!.click();
		await ate(() => botaoDoModal("Apagar nota") !== undefined);
		botaoDoModal("Apagar nota")!.click();
		await ate(() => apagarEnviado().length === 1);
		await esperar(80);
		expect(rotulosDasAbas()).toEqual(["A", "B"]);
		expect(controle.caminho).toBe(rotaDa("A"));
	});
});
