// @vitest-environment happy-dom
// Ida e volta do markdown no editor das notas: abrir um texto no TipTap e
// pedir o markdown de volta tem de dar o mesmo texto, para que abrir e salvar
// uma nota não mude o que você não mexeu. Usa a mesma lista de extensões do
// EditorNota, num DOM falso (happy-dom).

import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as NoPM } from "@tiptap/pm/model";
import { afterEach, describe, expect, it } from "vitest";
import { ajudaDoBloco, carregarNoEditor, extensoesDaNota, markdownDaNota } from "./editor-nota.ts";

let editor: Editor | undefined;

afterEach(() => {
	editor?.destroy();
	editor = undefined;
});

function idaEVolta(markdown: string): string {
	editor = new Editor({ extensions: extensoesDaNota(), content: markdown, contentType: "markdown" });
	return editor.getMarkdown();
}

describe("ida e volta do markdown", () => {
	const casos: Record<string, string> = {
		títulos: "# Título 1\n\n## Título 2\n\n### Título 3\n\n#### Título 4",
		parágrafos: "Primeiro parágrafo com **negrito**, *itálico*, ~~tachado~~ e `código`.\n\nSegundo parágrafo.",
		link: "Veja [a documentação](https://example.com/docs).",
		"lista com marcador": "- um\n- dois\n  - dois e meio\n- três",
		"lista numerada": "1. um\n2. dois\n3. três",
		tarefas: "- [ ] fazer\n- [x] feito",
		citação: "> Entender antes de decorar.",
		"código em bloco": "```python\ndef f(x):\n    return x * 2\n```",
		"linha divisória": "antes\n\n---\n\ndepois",
		menção: "Ligada a [[Limites laterais]] e a [[Derivadas]].",
		acentos: "Função, ação, ε-δ, ∑ e 学.",
		"sublinhado no meio": "a variável snake_case",
		"asterisco solto": "2 * 3 = 6",
		"menor e e comercial": "se a < b & c",
	};
	for (const [nome, markdown] of Object.entries(casos)) {
		it(nome, () => {
			expect(idaEVolta(markdown)).toBe(markdown);
		});
	}
});

describe("blocos e decorações da parte C", () => {
	/** O markdown volta igual e o primeiro bloco é do tipo esperado. */
	const casos: Array<[string, string, string]> = [
		["fórmula em bloco", "$$\n\\lim_{x \\to a^+} f(x) = L\n$$", "blockMath"],
		["fórmula na linha", "A área é $\\pi r^2$ e o raio, $r$.", "paragraph"],
		["caixa", '<div class="caixa atencao">\n\nTexto **forte** e `código`.\n\n- um\n- dois\n\n</div>', "caixa"],
		["caixa com fórmula", '<div class="caixa ideia">\n\n$$\nE = mc^2\n$$\n\n</div>', "caixa"],
		["definição", '<div class="definicao">\n<dfn>Receita bruta</dfn>\n\nPreço de venda **com** impostos vezes a quantidade.\n\n</div>', "definicao"],
		["recolhível", "<details>\n<summary>Título *itálico*</summary>\n\nConteúdo escondido.\n\n- item\n\n</details>", "recolhivel"],
		["pergunta e resposta", '<details class="pergunta">\n<summary>Qual a fórmula da receita bruta?</summary>\n\nPreço × quantidade.\n\n</details>', "recolhivel"],
		["aninhados", '<div class="caixa exemplo">\n\nFora.\n\n<details>\n<summary>Dentro</summary>\n\nMiolo.\n\n</details>\n\n</div>', "caixa"],
		["entre parágrafos", 'Antes.\n\n<div class="caixa resumo">\n\nMeio.\n\n</div>\n\nDepois.', "paragraph"],
		["marca-texto e cor", 'Um <mark>destaque</mark> e uma <span class="cor-tijolo">cor</span> aqui.', "paragraph"],
		["marca-texto e cor juntos", 'O <mark><span class="cor-tijolo">total vendido</span></mark> antes.', "paragraph"],
		["menção dentro da caixa", '<div class="caixa ideia">\n\nVer [[Limites]].\n\n</div>', "caixa"],
	];
	for (const [nome, markdown, tipo] of casos) {
		it(nome, () => {
			expect(idaEVolta(markdown)).toBe(markdown);
			expect(editor!.getJSON().content?.[0]?.type).toBe(tipo);
		});
	}

	it("cada bloco vira o nó certo, com o tom, o tipo e o termo", () => {
		idaEVolta('<div class="caixa exemplo">\n\nx\n\n</div>\n\n<details class="pergunta">\n<summary>P?</summary>\n\nR.\n\n</details>\n\n<div class="definicao">\n<dfn>T</dfn>\n\nE.\n\n</div>');
		const [caixa, pergunta, definicao] = editor!.getJSON().content ?? [];
		expect(caixa?.attrs).toEqual({ tom: "exemplo" });
		expect(pergunta?.attrs).toEqual({ tipo: "pergunta" });
		expect(pergunta?.content?.[0]).toMatchObject({ type: "tituloRecolhivel", content: [{ text: "P?" }] });
		expect(definicao?.content?.[0]).toMatchObject({ type: "termoDefinicao", content: [{ text: "T" }] });
	});

	it("fórmula na linha vira o nó da fórmula", () => {
		idaEVolta("A área é $\\pi r^2$.");
		expect(editor!.getJSON().content?.[0]?.content?.map((parte) => parte.type)).toEqual(["text", "inlineMath", "text"]);
	});

	it("cifrão de dinheiro não vira fórmula", () => {
		for (const texto of ["Custou R$ 10 e depois R$ 20.", "Custou R$10 e depois R$20.", "Entre $5 e $10 por mês."]) {
			expect(idaEVolta(texto), texto).toBe(texto);
			expect(editor!.getJSON().content?.[0]?.content?.map((parte) => parte.type), texto).toEqual(["text"]);
			editor!.destroy();
		}
	});

	it("caixa vazia volta com um parágrafo e não quebra", () => {
		editor = new Editor({ extensions: extensoesDaNota(), content: '<div class="caixa ideia">\n\n</div>', contentType: "markdown" });
		expect(editor.getJSON().content?.[0]).toMatchObject({ type: "caixa", content: [{ type: "paragraph" }] });
	});

	it("tom ou classe desconhecida não vira bloco", () => {
		idaEVolta('<div class="caixa perigo">\n\nx\n\n</div>');
		expect(editor!.getJSON().content?.[0]?.type).not.toBe("caixa");
	});
});

describe("ajuda dos blocos vazios", () => {
	/** A ajuda de cada bloco de texto vazio, na ordem do documento (o cursor no bloco de índice `cursor`). */
	function ajudas(conteudo: JSONContent[], cursor?: number): string[] {
		editor = new Editor({ extensions: extensoesDaNota(), content: { type: "doc", content: conteudo } });
		const vazios: Array<{ no: NoPM; posicao: number }> = [];
		editor.state.doc.descendants((no, posicao) => {
			if (no.isTextblock && no.content.size === 0) vazios.push({ no, posicao });
		});
		return vazios.map(({ no, posicao }, indice) => ajudaDoBloco(editor!.state.doc, no, posicao, indice === cursor, "nota vazia"));
	}
	const vazio = (tipo: string, attrs?: Record<string, unknown>): JSONContent => ({ type: tipo, ...(attrs ? { attrs } : {}) });
	const comTexto: JSONContent = { type: "paragraph", content: [{ type: "text", text: "texto" }] };

	it("títulos, listas, tarefas e citação dizem o que são", () => {
		expect(
			ajudas([
				comTexto,
				vazio("heading", { level: 1 }),
				vazio("heading", { level: 3 }),
				{ type: "bulletList", content: [{ type: "listItem", content: [vazio("paragraph")] }] },
				{ type: "orderedList", content: [{ type: "listItem", content: [vazio("paragraph")] }] },
				{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [vazio("paragraph")] }] },
				{ type: "blockquote", content: [vazio("paragraph")] },
			]),
		).toEqual(["Título 1", "Título 3", "Lista", "Lista numerada", "Tarefa", "Citação"]);
	});

	it("parágrafo solto só com o cursor; a nota vazia, a ajuda geral", () => {
		expect(ajudas([comTexto, vazio("paragraph"), vazio("paragraph")], 0)).toEqual(["Escreva, ou “/” para os blocos", ""]);
		expect(ajudas([vazio("paragraph")])).toEqual(["nota vazia"]);
	});

	it("as partes dos blocos da parte C", () => {
		expect(
			ajudas(
				[
					comTexto,
					{ type: "recolhivel", attrs: { tipo: "pergunta" }, content: [vazio("tituloRecolhivel"), vazio("paragraph")] },
					{ type: "recolhivel", attrs: { tipo: "recolhivel" }, content: [vazio("tituloRecolhivel"), vazio("paragraph")] },
					{ type: "definicao", content: [vazio("termoDefinicao"), vazio("paragraph")] },
				],
				1,
			),
		).toEqual(["A pergunta", "A resposta", "Título", "", "O termo", ""]);
	});
});

describe("abrir a nota", () => {
	it("o conteúdo do arquivo fica fora do desfazer: Ctrl+Z logo depois de abrir não esvazia a nota", () => {
		editor = new Editor({ extensions: extensoesDaNota() });
		let mudancas = 0;
		editor.on("update", () => mudancas++);
		carregarNoEditor(editor, "# Limites\n\ntexto do arquivo");
		expect(mudancas).toBe(0);
		expect(editor.can().undo()).toBe(false);
		editor.commands.undo();
		expect(markdownDaNota(editor)).toBe("# Limites\n\ntexto do arquivo");
	});
	it("desfazer volta só o que você mudou depois de abrir", () => {
		editor = new Editor({ extensions: extensoesDaNota() });
		carregarNoEditor(editor, "texto do arquivo");
		editor.chain().focus("end").insertContent(" e o meu").run();
		expect(markdownDaNota(editor)).toBe("texto do arquivo e o meu");
		editor.commands.undo();
		expect(markdownDaNota(editor)).toBe("texto do arquivo");
		editor.commands.undo();
		expect(markdownDaNota(editor)).toBe("texto do arquivo");
	});
});

describe("atalhos ao digitar", () => {
	/** Digita letra por letra pelo caminho do teclado (handleTextInput), que é o que dispara as regras do TipTap. */
	function digitar(texto: string) {
		const view = editor!.view;
		for (const letra of texto) {
			const { from, to } = view.state.selection;
			const tratou = view.someProp("handleTextInput", (tratar) => tratar(view, from, to, letra, () => view.state.tr.insertText(letra, from, to)));
			if (!tratou) view.dispatch(view.state.tr.insertText(letra, from, to));
		}
	}
	it("[[Nome]] vira menção, sem sobrar colchete", () => {
		editor = new Editor({ extensions: extensoesDaNota() });
		digitar("Ver [[Limites laterais]] e mais.");
		expect(editor.getMarkdown()).toBe("Ver [[Limites laterais]] e mais.");
		const paragrafo = editor.getJSON().content?.[0];
		expect(paragrafo?.content?.map((parte) => parte.type)).toEqual(["text", "mencao", "text"]);
	});
	it("## vira título e ** vira negrito", () => {
		editor = new Editor({ extensions: extensoesDaNota() });
		digitar("## Título");
		expect(editor.getJSON().content?.[0]?.type).toBe("heading");
		editor.commands.enter();
		digitar("um **forte** aqui");
		expect(markdownDaNota(editor)).toBe("## Título\n\num **forte** aqui");
	});
});

describe("texto digitado ao pé da letra", () => {
	/** O texto de um parágrafo vira markdown e, lido de novo, tem de dar o mesmo texto (sem virar ênfase, link, tag…). */
	function textoDeVolta(texto: string): { markdown: string; texto: string } {
		editor = new Editor({ extensions: extensoesDaNota(), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: texto }] }] } });
		const markdown = editor.getMarkdown();
		editor.destroy();
		editor = new Editor({ extensions: extensoesDaNota(), content: markdown, contentType: "markdown" });
		return { markdown, texto: editor.getText() };
	}
	const literais = [
		"*não é ênfase*",
		"_nem isto_",
		"**nem negrito**",
		"~~nem tachado~~",
		"[texto](https://x.com)",
		"[[não é menção]]",
		"<b>não é tag</b>",
		"<!-- nem comentário -->",
		"&amp; fica escrito",
		"\\*barra e asterisco\\*",
		"`crase`",
		"\\alpha + \\beta",
		"2 * 3 = 6 e a < b & c",
		"snake_case e x_1",
		"a*b*c",
		"## não é título",
		"# nem este",
		"- não é lista",
		"* nem esta",
		"+ nem esta",
		"1. não é lista numerada",
		"2) nem esta",
		"> não é citação",
		"---",
		"***",
		"#hashtag fica",
		"-5 graus",
		"a fórmula $x^2$ não é fórmula aqui",
		"$$não é bloco$$",
		"R$ 10 e R$ 20",
		"<mark>não é marca</mark>",
		'<span class="cor-ambar">nem cor</span>',
	];
	for (const literal of literais) {
		it(literal, () => {
			expect(textoDeVolta(literal).texto).toBe(literal);
		});
	}
	it("escapa o marcador do começo da linha, também depois de uma quebra de linha", () => {
		expect(textoDeVolta("## x").markdown).toBe("\\## x");
		editor = new Editor({
			extensions: extensoesDaNota(),
			content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "- b" }] }] },
		});
		const markdown = editor.getMarkdown();
		expect(markdown).toContain("\\- b");
		editor.destroy();
		editor = new Editor({ extensions: extensoesDaNota(), content: markdown, contentType: "markdown" });
		expect(editor.getJSON().content).toHaveLength(1);
		expect(editor.getJSON().content?.[0]?.type).toBe("paragraph");
	});
	it("só escapa o necessário", () => {
		expect(textoDeVolta("\\alpha, snake_case, 2 * 3, a < b & c").markdown).toBe("\\alpha, snake_case, 2 * 3, a < b & c");
	});
});
