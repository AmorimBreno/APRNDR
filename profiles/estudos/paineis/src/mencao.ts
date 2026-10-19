// A menção [[Nome da nota]] no editor das notas. Na parte B ela só é
// preservada: o markdown entra e sai com [[Nome]] do jeito que estava (sem
// isto, o TipTap escreveria \[\[Nome\]\]) e a tela mostra a menção como uma
// etiqueta. Digitar [[Nome]] também vira menção. Abrir a nota mencionada,
// sugerir nomes e atualizar menções ao renomear ficam para a parte C.

import { InputRule, Node } from "@tiptap/core";

/** [[Nome]] no começo do texto: o nome sem colchetes nem quebra de linha. */
const MENCAO = /^\[\[([^[\]\n]+?)\]\]/;

export const Mencao = Node.create({
	name: "mencao",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

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
});
