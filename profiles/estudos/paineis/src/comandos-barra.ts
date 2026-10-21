// Os itens do menu do "/" das notas (item 4.3, parte C): o que cada um é, como
// aparece (nome, dica, ícone ou sigla) e o que faz no editor. MenuBarra.tsx
// desenha o menu e liga o "/" pelo @tiptap/suggestion.

import type { IconName } from "@estudos/design-system";
import type { Editor, JSONContent, Range } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { TomCaixa } from "../../lib/nota-tipos.ts";

export interface ContextoComando {
	editor: Editor;
	/** O "/" e o que foi digitado depois dele: some antes do comando. */
	range: Range;
	/** Abre o editor de LaTeX da fórmula recém-criada (na posição dada). Sem ele, a fórmula nasce com "x". */
	abrirFormula?(tipo: "linha" | "bloco", posicao: number): void;
}

export interface ItemBarra {
	id: string;
	nome: string;
	dica: string;
	/** Um ícone do design system, ou uma sigla curta no lugar dele ("H1", "∑"). */
	icone?: IconName;
	sigla?: string;
	/** Outras palavras que acham o item ("checklist" também acha por "tarefa"). */
	palavras?: string[];
	/** O grupo do menu (o título que aparece acima do primeiro item dele). */
	grupo?: string;
	/** O atalho de digitação que faz o mesmo ("#", "- ", "[ ]"), à direita do item. */
	atalho?: string;
	/** Uma etiqueta à direita do item ("Anotação", "Arquivo"), no lugar do atalho. */
	etiqueta?: string;
	executar(contexto: ContextoComando): void;
}

/** Minúsculas e sem acento, para filtrar ("form" acha Fórmula, "atencao" acha Atenção). */
export const semAcento = (texto: string) =>
	texto
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase();

/**
 * Põe um bloco onde está o cursor: no lugar do parágrafo, se ele está vazio;
 * senão, logo depois do bloco do cursor (subindo até um lugar que aceite o
 * bloco). O cursor vai para o primeiro texto dentro dele. Devolve a posição
 * do bloco, ou undefined se não coube em lugar nenhum.
 */
export function inserirBloco(editor: Editor, range: Range, conteudo: JSONContent): number | undefined {
	let posicao: number | undefined;
	// "Uma frase /def": o espaço antes do "/" sai junto, para a frase não terminar com espaço.
	const $fim = editor.state.doc.resolve(range.to);
	const fimDoBloco = range.to === $fim.end();
	const antes = range.from > $fim.start() ? editor.state.doc.textBetween(range.from - 1, range.from) : "";
	const apagar = fimDoBloco && antes === " " ? { from: range.from - 1, to: range.to } : range;
	editor
		.chain()
		.focus()
		.deleteRange(apagar)
		.command(({ tr }) => {
			const no = editor.schema.nodeFromJSON(conteudo);
			const $cursor = tr.selection.$from;
			for (let profundidade = $cursor.depth; profundidade >= 1; profundidade--) {
				const pai = $cursor.node(profundidade - 1);
				const indice = $cursor.index(profundidade - 1);
				const atual = $cursor.node(profundidade);
				const vazio = profundidade === $cursor.depth && atual.type.name === "paragraph" && atual.content.size === 0;
				if (vazio && pai.canReplaceWith(indice, indice + 1, no.type)) {
					posicao = $cursor.before(profundidade);
					tr.replaceWith(posicao, $cursor.after(profundidade), no);
				} else if (pai.canReplaceWith(indice + 1, indice + 1, no.type)) {
					posicao = $cursor.after(profundidade);
					tr.insert(posicao, no);
				} else {
					continue;
				}
				tr.setSelection(TextSelection.near(tr.doc.resolve(posicao + 1)));
				return true;
			}
			return false;
		})
		.run();
	return posicao;
}

const paragrafo: JSONContent = { type: "paragraph" };

function caixa(tom: TomCaixa, nome: string, icone: IconName, dica: string, palavras: string[]): ItemBarra {
	return {
		id: `caixa-${tom}`,
		nome: `Caixa: ${nome}`,
		dica,
		icone,
		palavras: ["caixa", "destaque", "callout", ...palavras],
		executar: ({ editor, range }) => void inserirBloco(editor, range, { type: "caixa", attrs: { tom }, content: [paragrafo] }),
	};
}

const ITENS_BASE: readonly ItemBarra[] = [
	{ id: "texto", nome: "Texto", dica: "Um parágrafo comum", sigla: "Aa", palavras: ["paragrafo"], executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).setParagraph().run() },
	...([1, 2, 3] as const).map(
		(nivel): ItemBarra => ({
			id: `titulo-${nivel}`,
			nome: `Título ${nivel}`,
			dica: ["Título grande", "Título de seção", "Título pequeno"][nivel - 1]!,
			sigla: `H${nivel}`,
			palavras: ["titulo", "cabecalho", "heading"],
			executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).setHeading({ level: nivel }).run(),
		}),
	),
	{ id: "lista", nome: "Lista", dica: "Lista com marcadores", sigla: "•", palavras: ["marcador", "topicos"], executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).toggleBulletList().run() },
	{ id: "numerada", nome: "Lista numerada", dica: "1, 2, 3…", sigla: "1.", palavras: ["numero", "ordenada"], executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
	{ id: "checklist", nome: "Checklist", dica: "Tarefas para marcar", icone: "checklist", palavras: ["tarefa", "todo"], executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).toggleTaskList().run() },
	{ id: "citacao", nome: "Citação", dica: "Um trecho citado", sigla: "“", palavras: ["citar", "quote"], executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).setBlockquote().run() },
	{ id: "codigo", nome: "Código", dica: "Bloco de código", icone: "code", palavras: ["programa", "code"], executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).setCodeBlock().run() },
	{ id: "divisoria", nome: "Divisória", dica: "Uma linha separando", sigla: "—", palavras: ["linha", "separador"], executar: ({ editor, range }) => void editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
	{
		id: "formula-bloco",
		nome: "Fórmula em bloco",
		dica: "Uma equação em LaTeX, centralizada",
		sigla: "∑",
		palavras: ["latex", "equacao", "matematica", "math"],
		executar: ({ editor, range, abrirFormula }) => {
			const posicao = inserirBloco(editor, range, { type: "blockMath", attrs: { latex: abrirFormula ? "" : "x" } });
			if (posicao !== undefined) abrirFormula?.("bloco", posicao);
		},
	},
	{
		id: "formula-linha",
		nome: "Fórmula na linha",
		dica: "LaTeX no meio da frase",
		sigla: "x²",
		palavras: ["latex", "equacao", "matematica", "math", "inline"],
		executar: ({ editor, range, abrirFormula }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({ type: "inlineMath", attrs: { latex: abrirFormula ? "" : "x" } })
				.run();
			// A fórmula fica logo antes do cursor.
			abrirFormula?.("linha", editor.state.selection.from - 1);
		},
	},
	caixa("ideia", "Ideia central", "bulb", "O que importa lembrar", ["ideia", "central", "principal"]),
	caixa("atencao", "Atenção", "alert", "Cuidado, pegadinha, erro comum", ["atencao", "aviso", "cuidado"]),
	caixa("exemplo", "Exemplo", "book", "Um caso resolvido", ["exemplo", "caso"]),
	caixa("resumo", "Resumo", "list", "O essencial em poucas linhas", ["resumo", "sintese"]),
	{
		id: "recolhivel",
		nome: "Recolhível",
		dica: "Um título que abre e fecha o conteúdo",
		icone: "chevron-right",
		palavras: ["toggle", "abrir", "fechar", "details"],
		executar: ({ editor, range }) =>
			void inserirBloco(editor, range, { type: "recolhivel", attrs: { tipo: "recolhivel" }, content: [{ type: "tituloRecolhivel" }, paragrafo] }),
	},
	{
		id: "definicao",
		nome: "Definição",
		dica: "Um termo e o que ele quer dizer",
		icone: "notebook",
		palavras: ["termo", "conceito", "glossario"],
		executar: ({ editor, range }) => void inserirBloco(editor, range, { type: "definicao", content: [{ type: "termoDefinicao" }, paragrafo] }),
	},
	{
		id: "pergunta",
		nome: "Pergunta e resposta",
		dica: "A resposta aparece quando você clica",
		icone: "help",
		palavras: ["flashcard", "cartao", "revisar", "questao"],
		executar: ({ editor, range }) =>
			void inserirBloco(editor, range, { type: "recolhivel", attrs: { tipo: "pergunta" }, content: [{ type: "tituloRecolhivel" }, paragrafo] }),
	},
];

/** Os grupos do menu, na ordem, com os itens e o atalho de digitação de cada um. */
const GRUPOS: ReadonlyArray<[string, ReadonlyArray<[string, string?]>]> = [
	["Texto", [["texto"], ["titulo-1", "#"], ["titulo-2", "##"], ["titulo-3", "###"], ["citacao", ">"], ["codigo", "```"], ["divisoria", "---"]]],
	["Listas", [["lista", "-"], ["numerada", "1."], ["checklist", "[ ]"]]],
	["Matemática", [["formula-bloco", "$$ $$"], ["formula-linha", "$ $"]]],
	["Destaques", [["caixa-ideia"], ["caixa-atencao"], ["caixa-exemplo"], ["caixa-resumo"]]],
	["Estudo", [["recolhivel"], ["definicao"], ["pergunta"]]],
];

/** Os itens do menu do "/", na ordem dos grupos. */
export const ITENS_BARRA: readonly ItemBarra[] = GRUPOS.flatMap(([grupo, itens]) =>
	itens.map(([id, atalho]) => {
		const item = ITENS_BASE.find((candidato) => candidato.id === id);
		if (!item) throw new Error(`Item do menu sem definição: ${id}`);
		return { ...item, grupo, ...(atalho ? { atalho } : {}) };
	}),
);

/** Os itens que batem com o que foi digitado depois do "/" (no nome, em qualquer palavra que comece assim, ou nas palavras do item). */
export function filtrarItens(consulta: string, itens: readonly ItemBarra[] = ITENS_BARRA): ItemBarra[] {
	const procurado = semAcento(consulta.trim());
	if (!procurado) return [...itens];
	return itens.filter((item) => {
		const nome = semAcento(item.nome);
		if (nome.includes(procurado)) return true;
		return (item.palavras ?? []).some((palavra) => semAcento(palavra).startsWith(procurado));
	});
}
