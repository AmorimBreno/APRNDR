// As ações por bloco do Markdown (rehype-blocos.ts): a fonte de cada bloco de primeiro nível,
// fatiada do texto pelas posições do nó. Renderização no servidor, sem DOM.

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fonteDoBloco, posicaoDoBloco } from "./rehype-blocos.ts";
import { Markdown } from "./Markdown.tsx";

/** Renderiza o texto com ações e devolve a fonte e o índice que cada bloco recebeu, mais o HTML. */
function blocos(texto: string, opcoes: { aparecendo?: boolean; emLinha?: boolean } = {}) {
	const recebidos: Array<[string, number]> = [];
	const html = renderToString(
		createElement(Markdown, {
			texto,
			...opcoes,
			acoesDoBloco: (fonte: string, indice: number) => {
				recebidos.push([fonte, indice]);
				return createElement("button", { type: "button", "data-bloco": indice }, "Guardar");
			},
		}),
	);
	return { recebidos, html };
}

describe("fonte de cada bloco de primeiro nível", () => {
	it("parágrafos, com o índice na ordem", () => {
		const { recebidos } = blocos("Primeiro parágrafo.\n\nSegundo parágrafo.\n\nTerceiro.");
		expect(recebidos).toEqual([
			["Primeiro parágrafo.", 0],
			["Segundo parágrafo.", 1],
			["Terceiro.", 2],
		]);
	});

	it("acentos e emoji não deslocam as posições", () => {
		const texto = "Ação é função, não é “mágica” 🙂.\n\nÓtima razão: série converge.";
		expect(blocos(texto).recebidos.map(([fonte]) => fonte)).toEqual(["Ação é função, não é “mágica” 🙂.", "Ótima razão: série converge."]);
	});

	it("dinheiro (R$ 20) não vira fórmula e não muda as posições", () => {
		const texto = "Custa R$ 20 hoje e US$ 0,03 amanhã.\n\nOutro com R$20 e $x$ de verdade.";
		const { recebidos } = blocos(texto);
		expect(recebidos.map(([fonte]) => fonte)).toEqual(["Custa R$ 20 hoje e US$ 0,03 amanhã.", "Outro com R$20 e $x$ de verdade."]);
	});

	it("fórmula em bloco ($$) é um bloco, com os $$ na fonte", () => {
		const texto = "Antes.\n\n$$\n\\frac{a}{b} = c\n$$\n\nDepois.";
		const { recebidos, html } = blocos(texto);
		expect(recebidos).toEqual([
			["Antes.", 0],
			["$$\n\\frac{a}{b} = c\n$$", 1],
			["Depois.", 2],
		]);
		expect(html).toContain("katex");
	});

	it("lista inteira (com a lista aninhada) é um bloco só", () => {
		const texto = "- um\n- dois\n  - dois e meio\n- três\n\nFim.";
		const { recebidos } = blocos(texto);
		expect(recebidos).toEqual([
			["- um\n- dois\n  - dois e meio\n- três", 0],
			["Fim.", 1],
		]);
	});

	it("lista numerada", () => {
		expect(blocos("1. a\n2. b\n3. c").recebidos).toEqual([["1. a\n2. b\n3. c", 0]]);
	});

	it("tabela (GFM)", () => {
		const tabela = "| a | b |\n| - | - |\n| 1 | 2 |";
		expect(blocos(`Antes.\n\n${tabela}\n\nDepois.`).recebidos.map(([fonte]) => fonte)).toEqual(["Antes.", tabela, "Depois."]);
	});

	it("bloco de código com as cercas e a linguagem", () => {
		const codigo = "```python\nfor i in range(3):\n    print(i)\n```";
		expect(blocos(`Veja:\n\n${codigo}\n\nPronto.`).recebidos.map(([fonte]) => fonte)).toEqual(["Veja:", codigo, "Pronto."]);
	});

	it("citação inteira, com os '>'", () => {
		const citacao = "> Uma citação\n> em duas linhas";
		expect(blocos(`${citacao}\n\nDepois.`).recebidos.map(([fonte]) => fonte)).toEqual([citacao, "Depois."]);
	});

	it("um parágrafo dentro de uma lista ou citação não é de primeiro nível", () => {
		const { recebidos } = blocos("- item\n\n  segundo parágrafo do item\n\n> citado\n>\n> outro citado");
		expect(recebidos.map(([, indice]) => indice)).toEqual([0, 1]);
		expect(recebidos[0]![0].startsWith("- item")).toBe(true);
	});

	it("títulos e linhas horizontais ficam sem ação, e o índice só conta os blocos com ação", () => {
		const { recebidos } = blocos("# Título\n\nTexto.\n\n---\n\n## Outro\n\nMais texto.");
		expect(recebidos).toEqual([
			["Texto.", 0],
			["Mais texto.", 1],
		]);
	});

	it("o embed de imagem fica no texto do bloco", () => {
		expect(blocos("![[grafico.png|300]]\n\nLegenda.").recebidos.map(([fonte]) => fonte)).toEqual(["![[grafico.png|300]]", "Legenda."]);
	});

	it("texto com fim de linha do Windows: a fonte sai do texto original", () => {
		const { recebidos } = blocos("Um.\r\n\r\nDois com\r\nduas linhas.");
		expect(recebidos.map(([fonte]) => fonte)).toEqual(["Um.", "Dois com\r\nduas linhas."]);
	});

	it("com `aparecendo` (palavras em span) as fontes são as mesmas", () => {
		const texto = "Ação com R$ 20.\n\n- a\n- b";
		expect(blocos(texto, { aparecendo: true }).recebidos).toEqual(blocos(texto).recebidos);
	});
});

describe("o HTML com e sem ações", () => {
	it("sem a função, o HTML não ganha embrulho nenhum", () => {
		const html = renderToString(createElement(Markdown, { texto: "Um.\n\n- a" }));
		expect(html).toBe("<p>Um.</p>\n<ul>\n<li>a</li>\n</ul>");
		expect(html).not.toContain("bloco-md");
	});

	it("com a função, cada bloco ganha o embrulho com o espaço das ações", () => {
		const { html } = blocos("Um.\n\nDois.");
		expect(html.match(/class="bloco-md"/g)).toHaveLength(2);
		expect(html.match(/class="bloco-md__acoes"/g)).toHaveLength(2);
		expect(html).not.toContain("data-bloco-inicio");
	});

	it("a função pode devolver null: o espaço continua reservado", () => {
		const html = renderToString(createElement(Markdown, { texto: "Um.", acoesDoBloco: () => null }));
		expect(html).toContain('<div class="bloco-md__acoes"></div>');
	});

	it("em linha não há ações nem embrulho", () => {
		const { recebidos, html } = blocos("Um **rótulo**", { emLinha: true });
		expect(recebidos).toEqual([]);
		expect(html).not.toContain("bloco-md");
	});
});

describe("funções puras", () => {
	it("fonteDoBloco fatia pelo início e fim", () => {
		expect(fonteDoBloco("abcdef", { inicio: 1, fim: 4 })).toBe("bcd");
	});

	it("posicaoDoBloco só reconhece as três propriedades numéricas", () => {
		expect(posicaoDoBloco({ dataBlocoIndice: 2, dataBlocoInicio: 5, dataBlocoFim: 9 })).toEqual({ indice: 2, inicio: 5, fim: 9 });
		expect(posicaoDoBloco({ dataBlocoIndice: 2 })).toBeUndefined();
		expect(posicaoDoBloco(undefined)).toBeUndefined();
	});
});
