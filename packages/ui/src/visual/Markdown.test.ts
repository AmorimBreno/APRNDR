// Código, vetores e matrizes no Markdown (renderização no servidor, sem DOM).

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown.tsx";

const html = (texto: string, opcoes: { emLinha?: boolean; aparecendo?: boolean } = {}) => renderToString(createElement(Markdown, { texto, ...opcoes }));
const contar = (saida: string, trecho: string) => saida.split(trecho).length - 1;

describe("bloco de código", () => {
	it("com linguagem: destaque de sintaxe, barra com o nome e números de linha", () => {
		const saida = html("```python\ndef soma(a, b):\n    # junta\n    return a + 'x' + 1\n```");
		expect(saida).toContain('class="codigo"');
		expect(saida).toContain('<div class="codigo__barra">python</div>');
		expect(saida).toContain("hljs language-python");
		expect(saida).toContain('class="hljs-keyword"');
		expect(saida).toContain('class="hljs-string"');
		expect(saida).toContain('class="hljs-number"');
		expect(saida).toContain('class="hljs-title function_"');
		expect(saida).toContain('class="hljs-comment"');
		expect(contar(saida, 'class="codigo__linha"')).toBe(3);
		expect(saida).toContain('data-linha="1"');
		expect(saida).toContain('data-linha="3"');
		expect(saida).not.toContain('data-linha="4"');
		expect(saida).toContain("--digitos:1");
	});

	it("apelido da linguagem (py, ts) também tem destaque", () => {
		expect(html("```py\nx = 1\n```")).toContain('class="hljs-number"');
		expect(html("```ts\nconst x: number = 1\n```")).toContain('class="hljs-keyword"');
	});

	it("string de várias linhas: o span do destaque é repartido, um pedaço por linha", () => {
		const saida = html('```python\nx = """um\ndois"""\n```');
		expect(contar(saida, 'class="codigo__linha"')).toBe(2);
		expect(contar(saida, 'class="hljs-string"')).toBe(2);
	});

	it("sem linguagem: a mesma caixa, sem destaque e sem barra", () => {
		const saida = html("```\nlinha um\nlinha dois\n```");
		expect(saida).toContain('class="codigo"');
		expect(saida).not.toContain("codigo__barra");
		expect(saida).not.toContain("hljs");
		expect(contar(saida, 'class="codigo__linha"')).toBe(2);
	});

	it("linguagem não registrada: caixa com a barra, sem cores", () => {
		const saida = html("```haskell\nmain = print 1\n```");
		expect(saida).toContain('<div class="codigo__barra">haskell</div>');
		expect(saida).not.toContain("hljs-");
	});

	it("com 10 linhas ou mais, a coluna dos números tem dois dígitos", () => {
		const saida = html("```\n" + Array.from({ length: 12 }, (_, i) => `l${i}`).join("\n") + "\n```");
		expect(saida).toContain("--digitos:2");
		expect(saida).toContain('data-linha="12"');
	});
});

describe("código em linha", () => {
	it("ganha a classe própria, dentro do parágrafo", () => {
		const saida = html("Use `len(x)` aqui.");
		expect(saida).toContain('<p>Use <code class="codigo-em-linha">len(x)</code> aqui.</p>');
	});

	it("o código do bloco não ganha a classe de em linha", () => {
		expect(html("```\nx\n```")).not.toContain("codigo-em-linha");
	});
});

describe("vetor e matriz", () => {
	it("vetor vira uma lista de caixas com os índices e a descrição", () => {
		const saida = html("```vetor\n# idades\n[6, 3, 'a']\n```");
		expect(saida).toContain('class="estrutura estrutura--vetor"');
		expect(saida).toContain('aria-label="vetor com 3 elementos: idades"');
		expect(saida).toContain('<div class="estrutura__rotulo" aria-hidden="true">idades</div>');
		expect(contar(saida, 'class="vetor__celula"')).toBe(3);
		expect(saida).toContain('<span class="vetor__valor vetor__valor--texto">&#x27;a&#x27;</span>');
		expect(saida).toMatch(/class="vetor__indice"><span class="ap-visually-hidden">índice <\/span>2<\/span>/);
		expect(saida).not.toContain("<pre");
	});

	it("vetor de um elemento: descrição no singular", () => {
		expect(html("```vetor\n[1]\n```")).toContain('aria-label="vetor com 1 elemento"');
	});

	it("matriz vira uma tabela com índices de coluna em cima e de linha à esquerda", () => {
		const saida = html("```matriz\n[[1, 2, 3], [4, 5, 6]]\n```");
		expect(saida).toContain('aria-label="matriz com 2 linhas e 3 colunas"');
		expect(saida).toContain('<th scope="col">2</th>');
		expect(saida).toContain('<th scope="row">1</th>');
		expect(contar(saida, 'class="matriz__valor matriz__valor--numero"')).toBe(6);
		expect(saida).not.toContain("<pre");
	});

	it("conteúdo inválido volta a ser código comum, com a barra", () => {
		const saida = html("```vetor\n[1, 2\n```");
		expect(saida).not.toContain("estrutura");
		expect(saida).toContain('<div class="codigo__barra">vetor</div>');
		expect(saida).toContain("[1, 2");
		expect(saida).not.toContain("hljs");
		const matriz = html("```matriz\n[[1, 2], [3]]\n```");
		expect(matriz).not.toContain("estrutura");
		expect(matriz).toContain("codigo__linha");
	});
});

describe("emLinha", () => {
	it("sem parágrafo, com o código em linha destacado", () => {
		expect(html("A função `len(x)`", { emLinha: true })).toBe('A função <code class="codigo-em-linha">len(x)</code>');
	});

	it("blocos e estruturas continuam aparecendo, só com span por fora", () => {
		const bloco = html("Veja:\n\n```python\nx = 1\n```", { emLinha: true });
		expect(bloco).toContain('<span class="codigo"><span class="codigo__barra">python</span><pre class="codigo__pre"');
		expect(bloco).not.toContain("<div");
		expect(bloco).not.toContain("<p>");
		const vetor = html("```vetor\n# r\n[1, 2]\n```", { emLinha: true });
		expect(vetor).toContain('<span class="estrutura estrutura--vetor"><span class="estrutura__rotulo" aria-hidden="true">r</span><ol class="vetor"');
		expect(vetor).not.toContain("<div");
	});
});

describe("aparecendo (palavras uma a uma)", () => {
	it("código, código em linha e estruturas ficam inteiros, o resto vira palavras", () => {
		const saida = html("Texto com `len(x)` no meio.\n\n```python\nx = soma(1, 2)\n```\n\n```vetor\n[1, 2]\n```", { aparecendo: true });
		expect(saida).toContain('<span class="palavra">Texto</span>');
		expect(saida).toContain('<code class="codigo-em-linha">len(x)</code>');
		const bloco = saida.slice(saida.indexOf("<pre"), saida.indexOf("</pre>"));
		expect(bloco).not.toContain("palavra");
		expect(bloco).toContain('class="codigo__linha"');
		const vetor = saida.slice(saida.indexOf('class="estrutura'));
		expect(vetor).not.toContain("palavra");
		expect(contar(vetor, 'class="vetor__celula"')).toBe(2);
	});
});
