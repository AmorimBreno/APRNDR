// @vitest-environment happy-dom
// Os ganchos genéricos da conversa (rodapeDaResposta e acoesDoBloco) no DOM: só com a resposta
// pronta, com a pergunta que abriu o turno, com a linha do rodapé e o espaço das ações reservados
// desde o streaming, e sem eles a conversa é idêntica à de sempre (a tela cheia).

import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemConversa } from "../estado-janela.ts";
import { DocumentoConversa, type ItemAssistente } from "./Conversa.tsx";

type Usuario = Extract<ItemConversa, { tipo: "usuario" }>;

const usuario = (chave: string, texto = "pergunta"): ItemConversa => ({ tipo: "usuario", chave, texto, contextosTela: [{ tipo: "nota", rotulo: "A", origem: "caderno/m/notas/A", olho: true, foco: true }] });
const resposta = (chave: string, texto: string, emAndamento = false): ItemConversa => ({ tipo: "assistente", chave, texto, raciocinio: "", emAndamento });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	// Movimento reduzido: sem animações (o happy-dom rejeita animações nativas canceladas).
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(async () => {
	root.unmount();
	container.remove();
	vi.unstubAllGlobals();
});

async function desenhar(no: ReactNode) {
	root.render(no as never);
	await new Promise((resolver) => setTimeout(resolver, 20));
}

interface Ganchos {
	rodape: ReturnType<typeof vi.fn<(resposta: ItemAssistente, pergunta?: Usuario) => ReactNode>>;
	acoes: ReturnType<typeof vi.fn<(fonte: string, indice: number, resposta: ItemAssistente) => ReactNode>>;
}
const ganchos = (): Ganchos => ({
	rodape: vi.fn((r: ItemAssistente) => createElement("button", { type: "button", className: "rodape-falso", "data-resposta": r.chave }, "Ir")),
	acoes: vi.fn((fonte: string, indice: number) => createElement("button", { type: "button", className: "acao-falsa", "data-indice": indice }, `Guardar ${fonte.length}`)),
});

describe("rodapeDaResposta", () => {
	it("é chamado com cada resposta pronta e a pergunta que abriu o turno", async () => {
		const g = ganchos();
		const conversa = [usuario("u1", "primeira"), resposta("r1", "um"), resposta("r2", "dois"), usuario("u2", "segunda"), resposta("r3", "três")];
		await desenhar(createElement(DocumentoConversa, { conversa, rodapeDaResposta: g.rodape }));
		expect(g.rodape.mock.calls.map(([r, p]) => [r.chave, p?.chave])).toEqual([
			["r1", "u1"],
			["r2", "u1"],
			["r3", "u2"],
		]);
		expect(container.querySelectorAll(".rodape-falso")).toHaveLength(3);
	});

	it("nunca é chamado com a resposta em andamento, mas a linha do rodapé já está lá (reservada)", async () => {
		const g = ganchos();
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", "chegando…", true)], rodapeDaResposta: g.rodape }));
		expect(g.rodape).not.toHaveBeenCalled();
		const linha = container.querySelector(".bloco__rodape");
		expect(linha).not.toBeNull();
		expect(linha!.childElementCount).toBe(0);
		// A resposta termina: o rodapé entra na MESMA linha (o mesmo elemento), sem mudar a estrutura.
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", "chegou.")], rodapeDaResposta: g.rodape }));
		expect(container.querySelectorAll(".bloco__rodape")).toHaveLength(1);
		expect(container.querySelector(".bloco__rodape")).toBe(linha);
		expect(linha!.querySelector(".rodape-falso")).not.toBeNull();
	});

	it("o perfil decide: devolvendo null a linha continua reservada e vazia", async () => {
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", "texto")], rodapeDaResposta: () => null }));
		const linhas = container.querySelectorAll(".bloco__rodape");
		expect(linhas).toHaveLength(1);
		expect(linhas[0]!.childElementCount).toBe(0);
	});

	it("sem o gancho não há linha de rodapé (a conversa em tela cheia não muda)", async () => {
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", "texto")] }));
		expect(container.querySelector(".bloco__rodape")).toBeNull();
	});

	it("uma resposta sem texto (só ferramentas) não vira bloco nem pede rodapé", async () => {
		const g = ganchos();
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r0", ""), resposta("r1", "texto")], rodapeDaResposta: g.rodape }));
		expect(g.rodape.mock.calls.map(([r]) => r.chave)).toEqual(["r1"]);
	});
});

describe("chip de imagens na nota do usuário", () => {
	const comImagens = (imagens: number, contextos = false): ItemConversa => ({ tipo: "usuario", chave: "u1", texto: "olha", imagens, ...(contextos ? { contextosTela: [{ tipo: "nota", rotulo: "A", olho: true }] } : {}) });

	it("mostra '1 imagem' e 'N imagens' no estilo dos chips de contexto, mesmo sem contexto da tela", async () => {
		await desenhar(createElement(DocumentoConversa, { conversa: [comImagens(1)] }));
		expect([...container.querySelectorAll(".chip-contexto")].map((chip) => chip.textContent)).toEqual(["1 imagem"]);
		await desenhar(createElement(DocumentoConversa, { conversa: [comImagens(3, true)] }));
		expect([...container.querySelectorAll(".chip-contexto")].map((chip) => chip.textContent)).toEqual(["A", "3 imagens"]);
	});

	it("sem imagens não há chip de imagem", async () => {
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1")] }));
		expect(container.textContent).not.toMatch(/imagem|imagens/);
	});
});

describe("acoesDoBloco", () => {
	const texto = "Primeiro parágrafo com ação.\n\n- a\n- b\n\n$$\nx^2\n$$";

	it("só é chamado com a resposta pronta, uma vez por bloco, com a fonte, o índice e a resposta", async () => {
		const g = ganchos();
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", texto)], acoesDoBloco: g.acoes }));
		expect(g.acoes.mock.calls.map(([fonte, indice, r]) => [fonte, indice, r.chave])).toEqual([
			["Primeiro parágrafo com ação.", 0, "r1"],
			["- a\n- b", 1, "r1"],
			["$$\nx^2\n$$", 2, "r1"],
		]);
		expect(container.querySelectorAll(".acao-falsa")).toHaveLength(3);
		expect(container.querySelectorAll(".bloco-md")).toHaveLength(3);
	});

	it("durante o streaming não é chamado, mas o espaço das ações já existe (nada muda de lugar quando a resposta termina)", async () => {
		const g = ganchos();
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", texto, true)], acoesDoBloco: g.acoes }));
		expect(g.acoes).not.toHaveBeenCalled();
		const blocosAntes = [...container.querySelectorAll(".bloco-md")];
		expect(blocosAntes).toHaveLength(3);
		expect(container.querySelectorAll(".acao-falsa")).toHaveLength(0);
		// Termina: os MESMOS elementos de bloco (nenhum remontado), agora com as ações dentro.
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", texto)], acoesDoBloco: g.acoes }));
		const blocosDepois = [...container.querySelectorAll(".bloco-md")];
		expect(blocosDepois).toHaveLength(3);
		expect(blocosDepois.every((bloco, i) => bloco === blocosAntes[i])).toBe(true);
		expect(container.querySelectorAll(".acao-falsa")).toHaveLength(3);
	});

	it("sem o gancho, o HTML da resposta é o de sempre (sem embrulho nem espaço de ações)", async () => {
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("u1"), resposta("r1", texto)] }));
		expect(container.querySelector(".bloco-md")).toBeNull();
		expect(container.querySelector(".bloco-md__acoes")).toBeNull();
		expect(container.querySelector(".bloco__rodape")).toBeNull();
		expect(container.querySelector(".lesson-body > p")?.textContent).toBe("Primeiro parágrafo com ação.");
	});

	it("a resposta de uma conversa aberta (histórico) e a que acabou de chegar têm as ações", async () => {
		const g = ganchos();
		await desenhar(createElement(DocumentoConversa, { conversa: [usuario("h1"), resposta("h2", "Do histórico."), usuario("u3"), resposta("a4", "Ao vivo.")], acoesDoBloco: g.acoes }));
		expect(g.acoes.mock.calls.map(([fonte]) => fonte)).toEqual(["Do histórico.", "Ao vivo."]);
	});
});
