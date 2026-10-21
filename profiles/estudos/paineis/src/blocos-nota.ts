// Os blocos e as decorações das notas (item 4.3, parte C), com o formato no
// arquivo descrito em docs/notas-formato.md: HTML pequeno com markdown dentro,
// que o arquivo continua legível fora do app e o professor lê.
// - Caixa de destaque: <div class="caixa atencao"> … </div> (tons em TONS_CAIXA);
// - Definição: <div class="definicao"> <dfn>Termo</dfn> … </div>;
// - Recolhível: <details> <summary>Título</summary> … </details>, e a pergunta
//   e resposta, <details class="pergunta">;
// - Marca-texto <mark>…</mark> e cor do texto <span class="cor-ambar">…</span>;
// - Fórmulas: $$ … $$ em bloco e $…$ na linha (a extensão de fórmulas do
//   TipTap, com uma regra mais estrita para o $ na linha: "R$ 10 e R$ 20" é texto).
// A aparência na tela (as visões dos nós) fica em VisoesBlocos.tsx.

import { type Editor, type JSONContent, Mark, mergeAttributes, Node } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { CORES_TEXTO, type CorTexto, TONS_CAIXA, type TomCaixa } from "../../lib/nota-tipos.ts";

/**
 * Lê, do começo de `texto`, um bloco <tag class="…"> que abre sozinho na linha
 * até o </tag> que o fecha (contando os do mesmo tipo dentro). Devolve o
 * trecho inteiro, a classe e o miolo.
 */
export function lerBlocoHtml(texto: string, tag: string): { raw: string; classe: string; miolo: string } | undefined {
	const abertura = new RegExp(`^<${tag}(?: class="([^"]*)")?>[ \\t]*\\n`).exec(texto);
	if (!abertura) return undefined;
	const marcas = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
	marcas.lastIndex = abertura[0].length;
	let profundidade = 1;
	for (let achado = marcas.exec(texto); achado; achado = marcas.exec(texto)) {
		profundidade += achado[0].startsWith("</") ? -1 : 1;
		if (profundidade > 0) continue;
		const fim = achado.index + achado[0].length;
		const resto = /^[ \t]*(?:\n|$)/.exec(texto.slice(fim));
		return { raw: texto.slice(0, fim + (resto?.[0].length ?? 0)), classe: abertura[1] ?? "", miolo: texto.slice(abertura[0].length, achado.index) };
	}
	return undefined;
}

/** Os blocos do miolo; um miolo vazio vira um parágrafo vazio (os blocos pedem pelo menos um). */
const ouParagrafo = (filhos: JSONContent[]): JSONContent[] => (filhos.length ? filhos : [{ type: "paragraph" }]);

/** O miolo de um bloco no arquivo: uma linha em branco antes e depois, para o markdown dentro do HTML valer. */
const miolo = (texto: string) => `\n\n${texto}\n\n`;

/**
 * Onde um bloco pode começar: só no começo de uma linha. O `start` de um
 * leitor de bloco diz ao markdown onde cortar o parágrafo para tentar o bloco;
 * se ele achasse o começo no meio da linha (um "\$\$" escapado, um "<div" escrito
 * como texto), o parágrafo ganharia uma quebra de linha ali.
 */
export function inicioDeLinha(texto: string, comeco: string): number {
	for (let indice = texto.indexOf(comeco); indice >= 0; indice = texto.indexOf(comeco, indice + 1)) {
		if (indice === 0 || texto[indice - 1] === "\n") return indice;
	}
	return -1;
}

export const Caixa = Node.create({
	name: "caixa",
	group: "block",
	content: "block+",
	defining: true,
	addAttributes() {
		return {
			tom: {
				default: "ideia" as TomCaixa,
				parseHTML: (elemento) => TONS_CAIXA.find((tom) => elemento.classList.contains(tom)) ?? "ideia",
				renderHTML: () => ({}),
			},
		};
	},
	parseHTML() {
		// Só com um tom conhecido (outro tom fica de fora, e a nota abre só para leitura).
		return [{ tag: "div.caixa", getAttrs: (elemento) => (TONS_CAIXA.some((tom) => elemento.classList.contains(tom)) ? null : false) }];
	},
	renderHTML({ node, HTMLAttributes }) {
		return ["div", mergeAttributes(HTMLAttributes, { class: `caixa ${node.attrs.tom as string}` }), 0];
	},
	markdownTokenizer: {
		name: "caixa",
		level: "block",
		start: (texto) => inicioDeLinha(texto, '<div class="caixa '),
		tokenize: (texto, _tokens, lexer) => {
			const bloco = lerBlocoHtml(texto, "div");
			const [nome, tom] = bloco?.classe.split(" ") ?? [];
			if (!bloco || nome !== "caixa" || !(TONS_CAIXA as readonly string[]).includes(tom ?? "")) return undefined;
			return { type: "caixa", raw: bloco.raw, tom, tokens: lexer.blockTokens(bloco.miolo.trim()) };
		},
	},
	parseMarkdown: (token, ajuda) => ({ type: "caixa", attrs: { tom: token.tom as TomCaixa }, content: ouParagrafo(ajuda.parseChildren(token.tokens ?? [])) }),
	renderMarkdown: (node, ajuda) => `<div class="caixa ${(node.attrs?.tom as string | undefined) ?? "ideia"}">${miolo(ajuda.renderChildren(node.content ?? [], "\n\n"))}</div>`,
});

/**
 * Enter no fim do título (ou do termo) com o primeiro parágrafo do conteúdo
 * vazio: vai para ele, em vez de criar outro parágrafo vazio antes dele.
 */
function enterParaOConteudo(editor: Editor, nome: string): boolean {
	const { selection } = editor.state;
	const $cursor = selection.$from;
	if (!selection.empty || $cursor.parent.type.name !== nome || $cursor.parentOffset !== $cursor.parent.content.size) return false;
	const pai = $cursor.node(-1);
	const proximo = pai.maybeChild($cursor.index(-1) + 1);
	if (!proximo || proximo.type.name !== "paragraph" || proximo.content.size > 0) return false;
	return editor.commands.setTextSelection($cursor.after() + 1);
}

/** O termo da definição (a primeira linha, em <dfn>). */
export const TermoDefinicao = Node.create({
	name: "termoDefinicao",
	content: "inline*",
	defining: true,
	addKeyboardShortcuts() {
		return { Enter: ({ editor }) => enterParaOConteudo(editor, this.name) };
	},
	parseHTML() {
		return [{ tag: "dfn" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["dfn", HTMLAttributes, 0];
	},
});

export const Definicao = Node.create({
	name: "definicao",
	group: "block",
	content: "termoDefinicao block+",
	defining: true,
	parseHTML() {
		return [{ tag: "div.definicao" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["div", mergeAttributes(HTMLAttributes, { class: "definicao" }), 0];
	},
	markdownTokenizer: {
		name: "definicao",
		level: "block",
		start: (texto) => inicioDeLinha(texto, '<div class="definicao">'),
		tokenize: (texto, _tokens, lexer) => {
			const bloco = lerBlocoHtml(texto, "div");
			if (!bloco || bloco.classe !== "definicao") return undefined;
			const termo = /^<dfn>(.*)<\/dfn>[ \t]*(?:\n|$)/.exec(bloco.miolo);
			if (!termo) return undefined;
			return { type: "definicao", raw: bloco.raw, termo: lexer.inlineTokens(termo[1]!), tokens: lexer.blockTokens(bloco.miolo.slice(termo[0].length).trim()) };
		},
	},
	parseMarkdown: (token, ajuda) => ({
		type: "definicao",
		content: [{ type: "termoDefinicao", content: ajuda.parseInline(token.termo ?? []) }, ...ouParagrafo(ajuda.parseChildren(token.tokens ?? []))],
	}),
	renderMarkdown: (node, ajuda) => {
		const [termo, ...corpo] = node.content ?? [];
		return `<div class="definicao">\n<dfn>${ajuda.renderChildren(termo?.content ?? [])}</dfn>${miolo(ajuda.renderChildren(corpo, "\n\n"))}</div>`;
	},
});

/** O título do recolhível ou a pergunta (em <summary>). */
export const TituloRecolhivel = Node.create({
	name: "tituloRecolhivel",
	content: "inline*",
	defining: true,
	addKeyboardShortcuts() {
		return { Enter: ({ editor }) => enterParaOConteudo(editor, this.name) };
	},
	parseHTML() {
		return [{ tag: "summary" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["summary", HTMLAttributes, 0];
	},
});

export type TipoRecolhivel = "recolhivel" | "pergunta";

export const Recolhivel = Node.create({
	name: "recolhivel",
	group: "block",
	content: "tituloRecolhivel block+",
	defining: true,
	addAttributes() {
		return {
			tipo: {
				default: "recolhivel" as TipoRecolhivel,
				parseHTML: (elemento) => (elemento.classList.contains("pergunta") ? "pergunta" : "recolhivel"),
				renderHTML: () => ({}),
			},
		};
	},
	parseHTML() {
		return [{ tag: "details" }];
	},
	renderHTML({ node, HTMLAttributes }) {
		return ["details", mergeAttributes(HTMLAttributes, node.attrs.tipo === "pergunta" ? { class: "pergunta" } : {}), 0];
	},
	markdownTokenizer: {
		name: "recolhivel",
		level: "block",
		start: (texto) => inicioDeLinha(texto, "<details"),
		tokenize: (texto, _tokens, lexer) => {
			const bloco = lerBlocoHtml(texto, "details");
			if (!bloco || (bloco.classe !== "" && bloco.classe !== "pergunta")) return undefined;
			const titulo = /^<summary>(.*)<\/summary>[ \t]*(?:\n|$)/.exec(bloco.miolo);
			if (!titulo) return undefined;
			return {
				type: "recolhivel",
				raw: bloco.raw,
				tipo: bloco.classe === "pergunta" ? "pergunta" : "recolhivel",
				titulo: lexer.inlineTokens(titulo[1]!),
				tokens: lexer.blockTokens(bloco.miolo.slice(titulo[0].length).trim()),
			};
		},
	},
	parseMarkdown: (token, ajuda) => ({
		type: "recolhivel",
		attrs: { tipo: token.tipo as TipoRecolhivel },
		content: [{ type: "tituloRecolhivel", content: ajuda.parseInline(token.titulo ?? []) }, ...ouParagrafo(ajuda.parseChildren(token.tokens ?? []))],
	}),
	renderMarkdown: (node, ajuda) => {
		const [titulo, ...corpo] = node.content ?? [];
		const abertura = node.attrs?.tipo === "pergunta" ? '<details class="pergunta">' : "<details>";
		return `${abertura}\n<summary>${ajuda.renderChildren(titulo?.content ?? [])}</summary>${miolo(ajuda.renderChildren(corpo, "\n\n"))}</details>`;
	},
});

/**
 * Marca-texto (cor de fundo): <mark> é o âmbar, o de sempre; as outras cores
 * são <mark class="fundo-…"> com uma das CORES_TEXTO.
 */
export const MarcaTexto = Mark.create({
	name: "marcaTexto",
	addAttributes() {
		return {
			cor: {
				default: "ambar" as CorTexto,
				parseHTML: (elemento) => CORES_TEXTO.find((cor) => elemento.classList.contains(`fundo-${cor}`)) ?? "ambar",
				renderHTML: () => ({}),
			},
		};
	},
	parseHTML() {
		return [{ tag: "mark" }];
	},
	renderHTML({ mark, HTMLAttributes }) {
		const cor = mark.attrs.cor as CorTexto;
		return ["mark", mergeAttributes(HTMLAttributes, cor === "ambar" ? {} : { class: `fundo-${cor}` }), 0];
	},
	renderMarkdown: (node, ajuda) => {
		const cor = ((node as { attrs?: { cor?: string } }).attrs?.cor ?? "ambar") as string;
		return `${cor === "ambar" ? "<mark>" : `<mark class="fundo-${cor}">`}${ajuda.renderChildren(node)}</mark>`;
	},
});

/** Sublinhado: <u> (o markdown não tem; o do TipTap escreveria ++texto++). Ctrl+U. */
export const Sublinhado = Mark.create({
	name: "sublinhado",
	parseHTML() {
		return [{ tag: "u" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["u", HTMLAttributes, 0];
	},
	renderMarkdown: (node, ajuda) => `<u>${ajuda.renderChildren(node)}</u>`,
	addKeyboardShortcuts() {
		return { "Mod-u": () => this.editor.commands.toggleMark(this.name) };
	},
});

/** Cor do texto: <span class="cor-…"> com uma das CORES_TEXTO. */
export const CorDoTexto = Mark.create({
	name: "corDoTexto",
	addAttributes() {
		return {
			cor: {
				default: "ambar" as CorTexto,
				parseHTML: (elemento) => CORES_TEXTO.find((cor) => elemento.classList.contains(`cor-${cor}`)) ?? "ambar",
				renderHTML: () => ({}),
			},
		};
	},
	parseHTML() {
		return CORES_TEXTO.map((cor) => ({ tag: `span.cor-${cor}` }));
	},
	renderHTML({ mark, HTMLAttributes }) {
		return ["span", mergeAttributes(HTMLAttributes, { class: `cor-${mark.attrs.cor as string}` }), 0];
	},
	renderMarkdown: (node, ajuda) => `<span class="cor-${((node as { attrs?: { cor?: string } }).attrs?.cor ?? "ambar") as string}">${ajuda.renderChildren(node)}</span>`,
});

/**
 * A fórmula na linha, $…$, com a regra estrita (a do Pandoc): o $ que abre não
 * tem espaço depois, o que fecha não tem espaço antes nem número logo depois.
 * Assim "R$ 10 e R$ 20" e "R$10 e R$20" continuam texto.
 */
export const FORMULA_NA_LINHA = /^\$(?![\s$])((?:\\\$|[^$\n])*?[^\s\\$])\$(?!\d)/;

export const FormulaNaLinha = InlineMath.extend({
	markdownTokenizer: {
		name: "inlineMath",
		level: "inline",
		start: (texto: string) => texto.search(/\$(?![\s$])/),
		tokenize: (texto: string) => {
			const achado = FORMULA_NA_LINHA.exec(texto);
			if (!achado) return undefined;
			return { type: "inlineMath", raw: achado[0], latex: achado[1]!.trim() };
		},
	},
});

/**
 * A fórmula em bloco, $$ … $$, só quando ocupa as linhas sozinha: o leitor da
 * extensão começava em qualquer $$, até no meio de uma frase.
 */
export const FormulaEmBloco = BlockMath.extend({
	markdownTokenizer: {
		name: "blockMath",
		level: "block",
		start: (texto: string) => inicioDeLinha(texto, "$$"),
		tokenize: (texto: string) => {
			const achado = /^\$\$([^$]+)\$\$[ \t]*(?:\n|$)/.exec(texto);
			if (!achado) return undefined;
			return { type: "blockMath", raw: achado[0], latex: achado[1]!.trim() };
		},
	},
});

/** O $ que, se ficasse sem barra, abriria uma fórmula na linha ao ler o arquivo de novo. */
export function cifraoAbriria(texto: string, indice: number): boolean {
	if (texto[indice] !== "$") return false;
	return FORMULA_NA_LINHA.test(texto.slice(indice)) || (texto[indice + 1] === "$" && texto.indexOf("$", indice + 2) > 0);
}
