// O que o editor das notas entende: as extensões do TipTap e o markdown que
// entra e sai. O EditorNota e os testes de ida e volta (editor-nota.test.ts)
// usam a mesma lista, para o teste valer o que a tela faz.
//
// Entende títulos (1 a 4), negrito, itálico, tachado, código (na linha e em
// bloco), links, listas (com marcador, numeradas e de tarefas), citação, linha
// divisória e menções (parte B) e, da parte C, as fórmulas, a caixa de
// destaque, a definição, o recolhível, a pergunta e resposta, o marca-texto e a
// cor do texto (blocos-nota.ts; o formato está em docs/notas-formato.md). O
// sublinhado fica de fora: o markdown não tem. Outro HTML o editor não
// entende; uma nota com ele abre só para leitura (temHtmlDesconhecido, em
// lib/nota-tipos.ts).

import type { AnyExtension, Editor } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Node as NoPM } from "@tiptap/pm/model";
import { StarterKit } from "@tiptap/starter-kit";
import { Caixa, CorDoTexto, Definicao, FormulaEmBloco, FormulaNaLinha, MarcaTexto, Recolhivel, TermoDefinicao, TituloRecolhivel } from "./blocos-nota.ts";
import { EscapeEnxuto } from "./escape-markdown.ts";
import { Mencao } from "./mencao.ts";
import { MenuBarra } from "./MenuBarra.tsx";
import { CaixaNaTela, RecolhivelNaTela } from "./VisoesBlocos.tsx";

export interface OpcoesEditorNota {
	/** A ajuda que aparece na nota vazia. */
	textoVazio?: string;
	/** Clicaram numa fórmula: a tela abre o editor de LaTeX dela. */
	editarFormula?(tipo: "linha" | "bloco", no: NoPM, posicao: number): void;
	/** Uma fórmula acabou de ser criada pelo menu do "/": a tela abre o editor de LaTeX dela. */
	abrirFormula?(tipo: "linha" | "bloco", posicao: number): void;
	/** Os títulos das notas da matéria agora: a lista do [[ e a menção tracejada (nota que não existe). */
	titulosNotas?(): readonly string[] | undefined;
	/** Clicaram numa menção: a tela abre a nota (ou oferece criar). */
	abrirMencao?(alvo: string): void;
	/** Os blocos com a aparência da tela (VisoesBlocos.tsx); os testes de formato não precisam. */
	naTela?: boolean;
}

export function extensoesDaNota(opcoes: OpcoesEditorNota = {}): AnyExtension[] {
	// Fórmula com erro mostra o LaTeX em vermelho (o KaTeX não lança).
	const katexOptions = { throwOnError: false };
	const editar = opcoes.editarFormula;
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3, 4] },
			underline: false,
			link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
		}),
		TaskList,
		TaskItem.configure({ nested: true }),
		Mencao.configure({
			...(opcoes.titulosNotas ? { titulos: opcoes.titulosNotas } : {}),
			...(opcoes.abrirMencao ? { abrir: opcoes.abrirMencao } : {}),
		}),
		opcoes.naTela ? CaixaNaTela : Caixa,
		Definicao,
		TermoDefinicao,
		opcoes.naTela ? RecolhivelNaTela : Recolhivel,
		TituloRecolhivel,
		MarcaTexto,
		CorDoTexto,
		FormulaNaLinha.configure({ katexOptions, ...(editar ? { onClick: (no: NoPM, posicao: number) => editar("linha", no, posicao) } : {}) }),
		FormulaEmBloco.configure({
			katexOptions: { ...katexOptions, displayMode: true },
			...(editar ? { onClick: (no: NoPM, posicao: number) => editar("bloco", no, posicao) } : {}),
		}),
		MenuBarra.configure(opcoes.abrirFormula ? { abrirFormula: opcoes.abrirFormula } : {}),
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
