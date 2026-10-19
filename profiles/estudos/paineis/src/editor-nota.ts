// O que o editor das notas entende (item 4.3, parte B): as extensões do TipTap
// e o markdown que entra e sai. O EditorNota e os testes de ida e volta
// (editor-nota.test.ts) usam a mesma lista, para o teste valer o que a tela faz.
//
// A parte B entende títulos (1 a 4), negrito, itálico, tachado, código (na
// linha e em bloco), links, listas (com marcador, numeradas e de tarefas),
// citação e linha divisória. O sublinhado fica de fora: o markdown não tem.
// HTML (as decorações da parte C) o editor não entende; uma nota com HTML
// abre só para leitura (temHtml, em lib/nota-tipos.ts).

import type { AnyExtension, Editor } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { EscapeEnxuto } from "./escape-markdown.ts";
import { Mencao } from "./mencao.ts";

export function extensoesDaNota(opcoes: { textoVazio?: string } = {}): AnyExtension[] {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3, 4] },
			underline: false,
			link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
		}),
		TaskList,
		TaskItem.configure({ nested: true }),
		Mencao,
		Markdown.configure({ indentation: { style: "space", size: 2 } }),
		EscapeEnxuto,
		// A ajuda só na nota vazia (não em cada bloco vazio, como um bloco de código novo).
		...(opcoes.textoVazio ? [Placeholder.configure({ placeholder: ({ editor }) => (editor.isEmpty ? (opcoes.textoVazio ?? "") : "") })] : []),
	];
}

/**
 * O markdown da nota como vai para o arquivo: sem os brancos do fim (o
 * parágrafo vazio que o editor sempre deixa no fim viraria linhas em branco).
 * A lib das notas termina o arquivo com uma quebra de linha.
 */
export function markdownDaNota(editor: Editor): string {
	return editor.getMarkdown().replace(/\s+$/, "");
}

/**
 * Põe o markdown do arquivo no editor fora do histórico do desfazer: sem isso,
 * um Ctrl+Z logo depois de abrir desfazia a própria abertura, a nota ficava
 * vazia e o salvamento automático gravava o arquivo vazio. Não conta como
 * mudança (não dispara o onUpdate).
 */
export function carregarNoEditor(editor: Editor, markdown: string): void {
	editor
		.chain()
		.command(({ tr }) => {
			tr.setMeta("addToHistory", false);
			return true;
		})
		.setContent(markdown, { contentType: "markdown", emitUpdate: false })
		.run();
}
