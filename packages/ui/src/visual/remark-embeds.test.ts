import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProvedorImagens, urlDaImagem } from "./ImagemDoPerfil.tsx";
import { Markdown } from "./Markdown.tsx";
import { dividirEmbeds } from "./remark-embeds.ts";

const html = (texto: string, perfilId: string | null = "estudos") => {
	const markdown = createElement(Markdown, { texto });
	return renderToStaticMarkup(perfilId ? createElement(ProvedorImagens, { perfilId, children: markdown }) : markdown);
};

describe("dividirEmbeds", () => {
	it("separa o texto dos embeds de imagem, com largura e altura", () => {
		expect(dividirEmbeds("Veja ![[viz-a-1.png|650]] e ![[b.SVG|300x200]]. ![[c.jpg]]")).toEqual([
			{ texto: "Veja " },
			{ caminho: "viz-a-1.png", largura: 650 },
			{ texto: " e " },
			{ caminho: "b.SVG", largura: 300, altura: 200 },
			{ texto: ". " },
			{ caminho: "c.jpg" },
		]);
	});

	it("o que não é imagem continua texto", () => {
		expect(dividirEmbeds("![[Outra nota]] ![[a.pdf]] [[a.png]]")).toEqual([{ texto: "![[Outra nota]] ![[a.pdf]] [[a.png]]" }]);
	});
});

describe("embed no Markdown", () => {
	it("vira a imagem pela rota do perfil, com a largura", () => {
		const saida = html("A árvore:\n\n![[viz-arvore-decisao-defeito-1792515300550.png|650]]\n\nFim.");
		expect(saida).toContain(`src="${urlDaImagem("estudos", "viz-arvore-decisao-defeito-1792515300550.png")}"`);
		expect(saida).toContain('width="650"');
		expect(saida).toContain('class="imagem-perfil"');
		expect(saida).not.toContain("![[");
	});

	it("no meio de uma frase e com caminho de pasta (cada parte codificada)", () => {
		const saida = html("Olhe ![[viz/a b.png]] aqui.");
		expect(saida).toContain('src="/api/perfis/estudos/imagens/viz/a%20b.png"');
		expect(saida).toContain("Olhe ");
		expect(saida).toContain(" aqui.");
	});

	it("dentro de código fica como está", () => {
		const saida = html("`![[a.png]]`\n\n```\n![[b.png|500]]\n```");
		expect(saida).not.toContain("<img");
		expect(saida).toContain("![[a.png]]");
		expect(saida).toContain("![[b.png|500]]");
	});

	it("sem o provedor do perfil, aparece como texto", () => {
		const saida = html("![[a.png|650]]", null);
		expect(saida).not.toContain("<img");
		expect(saida).toContain("![[a.png|650]]");
	});

	it("imagem comum do markdown continua imagem comum", () => {
		const saida = html("![gato](https://exemplo.com/gato.png)");
		expect(saida).toContain('src="https://exemplo.com/gato.png"');
		expect(saida).not.toContain("imagem-perfil");
	});
});
