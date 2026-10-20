// A menção [[Nome da nota]] no editor das notas (partes B e C).
// - O markdown entra e sai com [[Nome]] do jeito que estava (sem isto, o
//   TipTap escreveria \[\[Nome\]\]); a tela mostra a menção como uma etiqueta.
// - Digitar [[Nome]] vira menção; digitar [[ abre a lista das notas da matéria
//   (o mesmo menu do "/"), e uma nota que ainda não existe também pode ser
//   mencionada.
// - Clicar numa menção abre a nota (opção abrir). Uma menção para uma nota que
//   não existe aparece tracejada (decoração nota-mencao--nova), e o clique
//   oferece criar a nota.
// Ao renomear uma nota, as menções nas outras notas são atualizadas pela lib
// (lib/notas.ts, atualizarMencoes).

import { InputRule, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Suggestion } from "@tiptap/suggestion";
import { conferirTitulo } from "../../lib/nota-tipos.ts";
import { type ItemBarra, semAcento } from "./comandos-barra.ts";
import { desenharMenu, foraDeCodigo } from "./MenuBarra.tsx";

/** [[Nome]] no começo do texto: o nome sem colchetes nem quebra de linha. */
const MENCAO = /^\[\[([^[\]\n]+?)\]\]/;

/** Meta de uma transação que só avisa que a lista de notas mudou (as decorações são refeitas). */
export const META_TITULOS = "mencao:titulos";

export interface OpcoesMencao {
	/** Os títulos das notas da matéria agora (undefined enquanto a lista não chegou: nada fica tracejado). */
	titulos?: () => readonly string[] | undefined;
	/** Clicaram numa menção. */
	abrir?: (alvo: string) => void;
}

/** Até quantas notas a lista do [[ mostra. */
const MAXIMO_SUGESTOES = 8;

/** As notas que batem com o que foi digitado depois do [[ e, se não houver uma igual, a menção a uma nota nova. */
export function sugestoesDeMencao(consulta: string, titulos: readonly string[]): Array<{ alvo: string; nova: boolean }> {
	const procurado = semAcento(consulta.trim());
	const batem = titulos.filter((titulo) => semAcento(titulo).includes(procurado)).slice(0, MAXIMO_SUGESTOES);
	const sugestoes = batem.map((alvo) => ({ alvo, nova: false }));
	const limpo = consulta.trim().replace(/\s+/g, " ");
	const igual = titulos.some((titulo) => titulo.toLowerCase() === limpo.toLowerCase());
	if (limpo && !igual && "titulo" in conferirTitulo(limpo)) sugestoes.push({ alvo: limpo, nova: true });
	return sugestoes;
}

export const Mencao = Node.create<OpcoesMencao>({
	name: "mencao",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addOptions() {
		return { titulos: undefined, abrir: undefined };
	},

	addAttributes() {
		return {
			alvo: {
				default: "",
				parseHTML: (elemento) => elemento.getAttribute("data-mencao") ?? "",
				renderHTML: (atributos) => ({ "data-mencao": atributos.alvo as string }),
			},
		};
	},

	parseHTML() {
		return [{ tag: "span[data-mencao]" }];
	},

	renderHTML({ node, HTMLAttributes }) {
		return ["span", { ...HTMLAttributes, class: "nota-mencao" }, `[[${node.attrs.alvo as string}]]`];
	},

	renderText({ node }) {
		return `[[${node.attrs.alvo as string}]]`;
	},

	markdownTokenizer: {
		name: "mencao",
		level: "inline",
		start: (texto) => texto.indexOf("[["),
		tokenize: (texto) => {
			const achado = MENCAO.exec(texto);
			if (!achado) return undefined;
			return { type: "mencao", raw: achado[0], alvo: achado[1]!.trim() };
		},
	},

	parseMarkdown: (token) => ({ type: "mencao", attrs: { alvo: token.alvo as string } }),

	renderMarkdown: (node) => `[[${(node.attrs?.alvo as string | undefined) ?? ""}]]`,

	// Uma regra própria: o nodeInputRule do TipTap troca só o grupo capturado e
	// deixaria os colchetes em volta da menção.
	addInputRules() {
		const tipo = this.type;
		return [
			new InputRule({
				find: /\[\[([^[\]\n]+?)\]\]$/,
				handler: ({ state, range, match }) => {
					const alvo = match[1]?.trim();
					if (!alvo) return null;
					state.tr.replaceWith(range.from, range.to, tipo.create({ alvo }));
				},
			}),
		];
	},

	addProseMirrorPlugins() {
		const opcoes = this.options;
		const tipo = this.type;
		const editor = this.editor;
		return [
			// Tracejada a menção para uma nota que não existe; o clique abre (ou oferece criar).
			new Plugin({
				key: new PluginKey("mencaoNaTela"),
				props: {
					decorations(state) {
						const titulos = opcoes.titulos?.();
						if (!titulos) return DecorationSet.empty;
						const existentes = new Set(titulos.map((titulo) => titulo.toLowerCase()));
						const marcas: Decoration[] = [];
						state.doc.descendants((no, posicao) => {
							if (no.type === tipo && !existentes.has(String(no.attrs.alvo).toLowerCase())) {
								marcas.push(Decoration.node(posicao, posicao + no.nodeSize, { class: "nota-mencao--nova", title: "Nota que ainda não existe" }));
							}
						});
						return DecorationSet.create(state.doc, marcas);
					},
					// O clique de verdade no elemento da menção (o handleClickOn do ProseMirror não vem
					// quando o clique seleciona a menção inteira, que é um nó atômico).
					handleDOMEvents: {
						click(_view, evento) {
							const elemento = (evento.target as HTMLElement | null)?.closest?.("[data-mencao]");
							if (!elemento || !opcoes.abrir) return false;
							evento.preventDefault();
							opcoes.abrir(elemento.getAttribute("data-mencao") ?? "");
							return true;
						},
					},
				},
			}),
			// Digitar [[ abre a lista das notas da matéria.
			Suggestion<ItemBarra, ItemBarra>({
				editor,
				pluginKey: new PluginKey("menuMencao"),
				char: "[[",
				allowSpaces: true,
				allowedPrefixes: null,
				allow: (contexto) => foraDeCodigo(contexto) && Boolean(opcoes.titulos?.()),
				items: ({ query }) =>
					sugestoesDeMencao(query.replace(/\]+$/, ""), opcoes.titulos?.() ?? []).map(({ alvo, nova }) => ({
						id: `${nova ? "nova" : "nota"}:${alvo}`,
						nome: alvo,
						dica: nova ? "Mencionar uma nota que ainda não existe" : "Nota deste caderno",
						icone: nova ? "plus" : "file",
						executar: ({ editor: atual, range }) =>
							void atual
								.chain()
								.focus()
								.deleteRange(range)
								.insertContent([{ type: "mencao", attrs: { alvo } }, { type: "text", text: " " }])
								.run(),
					})),
				command: ({ editor: atual, range, props: item }) => item.executar({ editor: atual, range }),
				render: () => desenharMenu({ esconderVazio: true }),
			}),
		];
	},
});
