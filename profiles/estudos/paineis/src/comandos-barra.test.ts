// @vitest-environment happy-dom
// Os itens do menu do "/": o filtro e o que cada um faz na nota (o markdown
// que sai depois de escolher o item onde estava o "/").

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { filtrarItens, ITENS_BARRA } from "./comandos-barra.ts";
import { carregarNoEditor, extensoesDaNota, markdownDaNota } from "./editor-nota.ts";

let editor: Editor | undefined;
afterEach(() => {
	editor?.destroy();
	editor = undefined;
});

const ids = (consulta: string) => filtrarItens(consulta).map((item) => item.id);

describe("filtro do menu", () => {
	it("sem nada digitado, todos os itens, na ordem", () => {
		expect(ids("")).toEqual(ITENS_BARRA.map((item) => item.id));
	});
	it("acha pelo nome sem acento e pelas outras palavras", () => {
		expect(ids("form")).toEqual(["formula-bloco", "formula-linha"]);
		expect(ids("FÓRMULA")).toEqual(["formula-bloco", "formula-linha"]);
		expect(ids("atencao")).toEqual(["caixa-atencao"]);
		expect(ids("tarefa")).toEqual(["checklist"]);
		expect(ids("latex")).toEqual(["formula-bloco", "formula-linha"]);
		expect(ids("flashcard")).toEqual(["pergunta"]);
		expect(ids("caixa")).toEqual(["caixa-ideia", "caixa-atencao", "caixa-exemplo", "caixa-resumo"]);
	});
	it("nada bate: lista vazia", () => {
		expect(ids("xyzw")).toEqual([]);
	});
});

/**
 * Abre o markdown, põe o cursor no fim do texto `onde` (que termina com o "/"
 * e o que foi digitado) e escolhe o item, como o menu faz.
 */
function escolher(markdown: string, onde: string, id: string, abrirFormula?: (tipo: "linha" | "bloco", posicao: number) => void): string {
	editor = new Editor({ extensions: extensoesDaNota() });
	carregarNoEditor(editor, markdown);
	let fim = -1;
	editor.state.doc.descendants((no, posicao) => {
		if (fim < 0 && no.isText && no.text?.includes(onde)) fim = posicao + no.text.indexOf(onde) + onde.length;
	});
	if (fim < 0) throw new Error(`não achei "${onde}"`);
	const barra = fim - onde.length + onde.lastIndexOf("/");
	editor.commands.setTextSelection(fim);
	const item = ITENS_BARRA.find((candidato) => candidato.id === id)!;
	item.executar({ editor, range: { from: barra, to: fim }, ...(abrirFormula ? { abrirFormula } : {}) });
	return markdownDaNota(editor);
}

describe("o que cada item faz", () => {
	it("na linha vazia, o bloco entra no lugar dela e o cursor vai para dentro", () => {
		expect(escolher("Antes.\n\n/cai", "/cai", "caixa-atencao")).toBe('Antes.\n\n<div class="caixa atencao">\n\n\n\n</div>');
		editor!.commands.insertContent("Dentro");
		expect(markdownDaNota(editor!)).toBe('Antes.\n\n<div class="caixa atencao">\n\nDentro\n\n</div>');
	});

	it("depois de um texto, o bloco entra na linha de baixo", () => {
		expect(escolher("Uma frase /def", "/def", "definicao")).toBe('Uma frase\n\n<div class="definicao">\n<dfn></dfn>\n\n\n\n</div>');
		editor!.commands.insertContent("Receita bruta");
		expect(markdownDaNota(editor!)).toContain("<dfn>Receita bruta</dfn>");
	});

	it("pergunta e recolhível começam no título", () => {
		escolher("/perg", "/perg", "pergunta");
		editor!.commands.insertContent("Qual a fórmula?");
		expect(markdownDaNota(editor!)).toBe('<details class="pergunta">\n<summary>Qual a fórmula?</summary>\n\n\n\n</details>');
		expect(escolher("/rec", "/rec", "recolhivel")).toBe("<details>\n<summary></summary>\n\n\n\n</details>");
	});

	it("dentro de uma caixa, o bloco entra dentro dela", () => {
		const markdown = escolher('<div class="caixa ideia">\n\nTexto.\n\n/exemplo\n\n</div>', "/exemplo", "caixa-exemplo");
		expect(markdown).toBe('<div class="caixa ideia">\n\nTexto.\n\n<div class="caixa exemplo">\n\n\n\n</div>\n\n</div>');
	});

	it("títulos, listas, checklist, citação, código e divisória viram o bloco da linha", () => {
		expect(escolher("Assunto /h2", "/h2", "titulo-2")).toBe("## Assunto");
		expect(escolher("item /lis", "/lis", "lista")).toBe("- item");
		expect(escolher("passo /num", "/num", "numerada")).toBe("1. passo");
		expect(escolher("revisar /check", "/check", "checklist")).toBe("- [ ] revisar");
		expect(escolher("frase /cit", "/cit", "citacao")).toBe("> frase");
		// O bloco de código vazio o TipTap escreve com uma linha em branco dentro.
		expect(escolher("/cod", "/cod", "codigo")).toBe("```\n\n```");
		expect(escolher("Antes.\n\n/div", "/div", "divisoria")).toContain("---");
	});

	it("fórmula: nasce vazia e pede o editor de LaTeX na posição dela", () => {
		const pedidos: Array<[string, number]> = [];
		escolher("/form", "/form", "formula-bloco", (tipo, posicao) => pedidos.push([tipo, posicao]));
		const [tipo, posicao] = pedidos[0]!;
		expect(tipo).toBe("bloco");
		expect(editor!.state.doc.nodeAt(posicao)?.type.name).toBe("blockMath");
		escolher("A área é /form", "/form", "formula-linha", (tipo2, posicao2) => pedidos.push([tipo2, posicao2]));
		expect(pedidos[1]![0]).toBe("linha");
		expect(editor!.state.doc.nodeAt(pedidos[1]![1])?.type.name).toBe("inlineMath");
	});

	it("fórmula sem o editor de LaTeX nasce com x", () => {
		expect(escolher("/form", "/form", "formula-bloco")).toBe("$$\nx\n$$");
	});
});
