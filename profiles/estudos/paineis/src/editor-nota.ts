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

import { type AnyExtension, type Editor, Extension } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import type { Node as NoPM } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { StarterKit } from "@tiptap/starter-kit";
import { Caixa, CorDoTexto, Definicao, FormulaEmBloco, FormulaNaLinha, MarcaTexto, Recolhivel, TermoDefinicao, TituloRecolhivel } from "./blocos-nota.ts";
import { EscapeEnxuto } from "./escape-markdown.ts";
import { type ArquivoMencionavel, Mencao } from "./mencao.ts";
import { MenuBarra } from "./MenuBarra.tsx";
import { CaixaNaTela, RecolhivelNaTela } from "./VisoesBlocos.tsx";
import { BlocoSobMouse } from "./AlcaBlocos.tsx";

export interface OpcoesEditorNota {
	/** A ajuda que aparece na nota vazia. */
	textoVazio?: string;
	/** Clicaram numa fórmula: a tela abre o editor de LaTeX dela. */
	editarFormula?(tipo: "linha" | "bloco", no: NoPM, posicao: number): void;
	/** Uma fórmula acabou de ser criada pelo menu do "/": a tela abre o editor de LaTeX dela. */
	abrirFormula?(tipo: "linha" | "bloco", posicao: number): void;
	/** Os títulos das notas da matéria agora: a lista do [[ e a menção tracejada (nota que não existe). */
	titulosNotas?(): readonly string[] | undefined;
	/** Os arquivos de material da matéria agora: também entram na lista do [[. */
	arquivosMateria?(): readonly ArquivoMencionavel[] | undefined;
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
			...(opcoes.arquivosMateria ? { arquivos: opcoes.arquivosMateria } : {}),
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
		// O fundo leve do bloco sob o mouse (a alça, AlcaBlocos.tsx, diz qual).
		...(opcoes.naTela ? [BlocoSobMouse] : []),
		Markdown.configure({ indentation: { style: "space", size: 2 } }),
		EscapeEnxuto,
		// A ajuda de cada bloco vazio (ajudaDoBloco): todos os blocos de texto, também dentro de listas e caixas.
		...(opcoes.textoVazio ? [AjudaDosBlocos.configure({ textoVazio: opcoes.textoVazio })] : []),
	];
}

/** A nota vazia: um só parágrafo, sem nada. */
const notaVazia = (doc: NoPM) => doc.childCount === 1 && doc.firstChild?.type.name === "paragraph" && doc.firstChild.content.size === 0;

/**
 * A ajuda de um bloco vazio, como no Notion: o nome do bloco em que você está
 * escrevendo ("Título 1", "Lista", "Tarefa"…), no estilo dele (ela aparece no
 * ::before do próprio bloco). Some quando o bloco ganha texto. Títulos, itens
 * de lista, citação e as partes dos blocos da parte C mostram sempre; um
 * parágrafo solto só na linha do cursor; a nota vazia, a ajuda geral.
 * `doc` é o documento sendo desenhado, e `posicao`, a do bloco nele.
 */
export function ajudaDoBloco(doc: NoPM, no: NoPM, posicao: number, comCursor: boolean, textoVazio = ""): string {
	if (notaVazia(doc)) return textoVazio;
	const $no = doc.resolve(posicao);
	const pai = $no.parent;
	switch (no.type.name) {
		case "heading":
			return `Título ${no.attrs.level as number}`;
		case "termoDefinicao":
			return "O termo";
		case "tituloRecolhivel":
			return pai.attrs.tipo === "pergunta" ? "A pergunta" : "Título";
		case "codeBlock":
			return comCursor ? "Código" : "";
		case "paragraph":
			break;
		default:
			return "";
	}
	// Só o primeiro parágrafo de um item de lista é o item (os outros são continuação).
	const primeiroDoPai = $no.index() === 0;
	switch (pai.type.name) {
		case "listItem":
			if (!primeiroDoPai) break;
			return $no.node($no.depth - 1)?.type.name === "orderedList" ? "Lista numerada" : "Lista";
		case "taskItem":
			return primeiroDoPai ? "Tarefa" : "";
		case "blockquote":
			return "Citação";
		case "recolhivel":
			return comCursor ? (pai.attrs.tipo === "pergunta" ? "A resposta" : "O conteúdo") : "";
		case "definicao":
			return comCursor ? "A explicação" : "";
		case "caixa":
			return comCursor ? "Escreva na caixa, ou “/” para os blocos" : "";
	}
	return comCursor ? "Escreva, ou “/” para os blocos" : "";
}

/**
 * Põe a ajuda (ajudaDoBloco) em cada bloco de texto vazio: a classe is-empty e
 * o atributo data-placeholder, que o CSS mostra no ::before. Feito aqui, e não
 * pelo Placeholder do TipTap, porque ele chama a função com a posição do
 * documento novo enquanto o editor ainda tem o antigo.
 */
const AjudaDosBlocos = Extension.create<{ textoVazio: string }>({
	name: "ajudaDosBlocos",
	addOptions() {
		return { textoVazio: "" };
	},
	addProseMirrorPlugins() {
		const { textoVazio } = this.options;
		const editor = this.editor;
		return [
			new Plugin({
				key: new PluginKey("ajudaDosBlocos"),
				props: {
					decorations(estado) {
						if (!editor.isEditable) return DecorationSet.empty;
						const { anchor } = estado.selection;
						const marcas: Decoration[] = [];
						estado.doc.descendants((no, posicao) => {
							if (!no.isTextblock) return true;
							if (no.content.size === 0) {
								const comCursor = anchor >= posicao && anchor <= posicao + no.nodeSize;
								const ajuda = ajudaDoBloco(estado.doc, no, posicao, comCursor, textoVazio);
								if (ajuda) marcas.push(Decoration.node(posicao, posicao + no.nodeSize, { class: "is-empty", "data-placeholder": ajuda }));
							}
							return false;
						});
						return DecorationSet.create(estado.doc, marcas);
					},
				},
			}),
		];
	},
});

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
