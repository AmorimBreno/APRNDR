// @vitest-environment happy-dom
// Ida e volta do markdown no editor das notas: abrir um texto no TipTap e
// pedir o markdown de volta tem de dar o mesmo texto, para que abrir e salvar
// uma nota não mude o que você não mexeu. Usa a mesma lista de extensões do
// EditorNota, num DOM falso (happy-dom).

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { extensoesDaNota } from "./editor-nota.ts";

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
	];
	for (const literal of literais) {
		it(literal, () => {
			expect(textoDeVolta(literal).texto).toBe(literal);
		});
	}
	it("só escapa o necessário", () => {
		expect(textoDeVolta("\\alpha, snake_case, 2 * 3, a < b & c").markdown).toBe("\\alpha, snake_case, 2 * 3, a < b & c");
	});
});
