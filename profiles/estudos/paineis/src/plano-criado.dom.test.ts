// @vitest-environment happy-dom
// O cartão "Plano criado" (PlanoCriado.tsx) no DOM, com uma janela falsa em que a ponte "planos" responde como a extensão:
// Abrir, a confirmação do Desfazer no próprio cartão, "Plano desfeito", a recusa (inclusive "não existe mais"). O cartão
// tem o mesmo tamanho em todos os estados (as classes e o CSS são os do cartão "Nota criada"). Nada aqui toca a pasta
// de dados nem a rede.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ContextoMesa, type ValorMesa } from "./mesa-ir.ts";
import { type CartaoPlano } from "./plano-criado.ts";
import { PlanoCriado } from "./PlanoCriado.tsx";

const MATERIA = "calc";
const SESSAO = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";
const ROTA = `caderno/${MATERIA}/notas/Prova final`;
const CARTAO: CartaoPlano = { chave: "i1", materia: MATERIA, titulo: "Prova final", rota: ROTA, chamada: "call-1", sessao: SESSAO };

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

interface Controle {
	enviadas: Array<{ painel: string; acao: string; dados: Record<string, unknown> }>;
	ordem: string[];
	irPara: Mock<(alvo: unknown) => void>;
	/** O que a "extensão" faz com um desfazer_plano. */
	aoDesfazer: "ok" | "erro" | "mudo";
	receber(acao: string, dados: unknown): void;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;
let contador = 100;

function Bancada() {
	const [acoesPorPainel, setAcoes] = useState<Record<string, AcaoRecebida[]>>({});
	controle.receber = (acao, dados) => {
		const chave = `i${++contador}`;
		setAcoes((atuais) => ({ ...atuais, planos: [...(atuais.planos ?? []), { chave, acao, dados }] }));
	};
	const [acoes] = useState(() => ({
		acaoDaInterface: async (painel: string, acao: string, dados: Record<string, unknown>) => {
			controle.enviadas.push({ painel, acao, dados });
			controle.ordem.push(acao);
			if (acao !== "desfazer_plano" || controle.aoDesfazer === "mudo") return;
			setTimeout(() => {
				if (controle.aoDesfazer === "erro") controle.receber("erro", { ao: "desfazer_plano", materia: MATERIA, pedido: dados.pedido, mensagem: "O plano mudou depois de criado." });
				else controle.receber("desfeito", { materia: MATERIA, titulo: dados.titulo, pedido: dados.pedido });
			}, 5);
		},
	}));
	const janela = { estado: { perfil: "estudos", sessao: { sessaoId: SESSAO }, acoesPorPainel, conversa: [], executando: false, fila: [], pedidos: [] }, conexao: "aberta", acoes } as unknown as JanelaPerfilHook;
	const mesa: ValorMesa = {
		irPara: (alvo) => controle.irPara(alvo),
		fecharAbaDaNota: async (rota) => {
			controle.ordem.push(`fechar:${rota}`);
		},
	};
	return createElement(ContextoMesa.Provider, { value: mesa }, createElement(PlanoCriado, { cartao: CARTAO, janela }));
}

const cartao = () => container.querySelector<HTMLElement>(".nota-criada");
const texto = () => cartao()?.querySelector(".nota-criada__texto")?.textContent;
const botoes = () => [...(cartao()?.querySelectorAll("button") ?? [])].map((botao) => botao.textContent);
const clicar = (rotulo: string) => {
	const botao = [...(cartao()?.querySelectorAll("button") ?? [])].find((candidato) => candidato.textContent === rotulo);
	if (!botao) throw new Error(`sem o botão ${rotulo}`);
	botao.click();
};

beforeEach(() => {
	controle = { enviadas: [], ordem: [], irPara: vi.fn(), aoDesfazer: "ok", receber: () => {} };
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	root.unmount();
	container.remove();
	await esperar(10);
});

describe("o cartão 'Plano criado'", () => {
	it("mostra o título com Abrir e Desfazer; Abrir leva à nota do plano, pelo clique do Breno", async () => {
		root.render(createElement(Bancada));
		await ate(() => cartao() !== null);
		expect(texto()).toBe("Plano criado: Prova final");
		expect(botoes()).toEqual(["Abrir", "Desfazer"]);
		clicar("Abrir");
		expect(controle.irPara).toHaveBeenCalledWith({ origem: ROTA, quem: "usuario" });
		// Ao montar não executou nada (o cartão só lê).
		expect(controle.enviadas).toEqual([]);
	});

	it("Desfazer pede a confirmação no próprio cartão; Cancelar volta sem mandar nada", async () => {
		root.render(createElement(Bancada));
		await ate(() => cartao() !== null);
		clicar("Desfazer");
		await ate(() => texto() === "Apagar o plano? Não dá para voltar atrás.");
		expect(botoes()).toEqual(["Apagar", "Cancelar"]);
		clicar("Cancelar");
		await ate(() => texto() === "Plano criado: Prova final");
		expect(controle.enviadas).toEqual([]);
	});

	it("Apagar fecha a aba, manda desfazer_plano pela ponte 'planos' e, com a resposta, vira 'Plano desfeito' sem botões", async () => {
		root.render(createElement(Bancada));
		await ate(() => cartao() !== null);
		clicar("Desfazer");
		await ate(() => botoes().includes("Apagar"));
		clicar("Apagar");
		await ate(() => texto() === "Plano desfeito");
		expect(botoes()).toEqual([]);
		const enviada = controle.enviadas.find((candidata) => candidata.acao === "desfazer_plano")!;
		expect(enviada.painel).toBe("planos");
		expect(enviada.dados).toMatchObject({ materia: MATERIA, titulo: "Prova final", sessao: SESSAO });
		expect(typeof enviada.dados.pedido).toBe("string");
		// A aba da nota fecha antes do pedido: um salvamento depois do apagar recriaria o arquivo.
		expect(controle.ordem.indexOf(`fechar:${ROTA}`)).toBeLessThan(controle.ordem.indexOf("desfazer_plano"));
		expect(cartao()?.getAttribute("data-estado")).toBe("desfeita");
	});

	it("a recusa da extensão aparece no cartão, que fica só com Abrir", async () => {
		controle.aoDesfazer = "erro";
		root.render(createElement(Bancada));
		await ate(() => cartao() !== null);
		clicar("Desfazer");
		await ate(() => botoes().includes("Apagar"));
		clicar("Apagar");
		await ate(() => texto() === "O plano mudou depois de criado.");
		expect(botoes()).toEqual(["Abrir"]);
		expect(cartao()?.getAttribute("data-estado")).toBe("recusada");
	});

	it("uma lista nova sem o plano (renomeado, por exemplo) não tira o Desfazer do cartão", async () => {
		root.render(createElement(Bancada));
		await ate(() => cartao() !== null);
		controle.receber("lista", { materia: MATERIA, sessao: SESSAO, planos: [], seguindo: null });
		await new Promise((pronto) => setTimeout(pronto, 50));
		expect(texto()).toBe("Plano criado: Prova final");
		expect(botoes()).toContain("Desfazer");
	});

	it("o cartão ocupa a linha do rodapé (a mesma classe do 'Nota criada': 32 px, texto em até 2 linhas)", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const css = readFileSync(resolve(process.cwd(), "profiles/estudos/paineis/src/mesa.css"), "utf8");
		expect(css).toMatch(/\.nota-criada \{[^}]*height: 32px;/);
		expect(css).toMatch(/\.nota-criada__texto \{[^}]*-webkit-line-clamp: 2;/);
		root.render(createElement(Bancada));
		await ate(() => cartao() !== null);
		expect(cartao()?.classList.contains("nota-criada")).toBe(true);
		expect(cartao()?.getAttribute("data-tipo")).toBe("plano");
	});
});
