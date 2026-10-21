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

/** O começo do alvo de uma menção a um arquivo de material: [[materiais/aula-04.pdf]]. */
export const PREFIXO_MATERIAL = "materiais/";

/** Um arquivo de material da matéria que pode ser mencionado: o nome dentro de materiais/ e o tipo para mostrar ("PDF"). */
export interface ArquivoMencionavel {
	nome: string;
	tipo?: string;
}

/** Se o alvo é um arquivo de material, o nome dele dentro de materiais/. */
export const materialDoAlvo = (alvo: string) => (alvo.startsWith(PREFIXO_MATERIAL) ? alvo.slice(PREFIXO_MATERIAL.length) : undefined);

export interface OpcoesMencao {
	/** Os títulos das notas da matéria agora (undefined enquanto a lista não chegou: nada fica tracejado). */
	titulos?: () => readonly string[] | undefined;
	/** Os arquivos de material da matéria agora (undefined enquanto a lista não chegou). */
	arquivos?: () => readonly ArquivoMencionavel[] | undefined;
	/** Clicaram numa menção. */
	abrir?: (alvo: string) => void;
}

/** Até quantas notas e quantos arquivos a lista do [[ mostra. */
const MAXIMO_NOTAS = 8;
const MAXIMO_ARQUIVOS = 6;

export interface SugestaoMencao {
	alvo: string;
	tipo: "nota" | "arquivo";
	/** Uma nota que ainda não existe. */
	nova: boolean;
	/** O tipo do arquivo, para mostrar ("PDF"). */
	detalhe?: string;
}

/**
 * O que a lista do [[ mostra para o que foi digitado: as notas que batem, os
 * arquivos de material que batem e, se não houver uma nota com esse nome, a
 * menção a uma nota nova.
 */
export function sugestoesDeMencao(consulta: string, titulos: readonly string[], arquivos: readonly ArquivoMencionavel[] = []): SugestaoMencao[] {
	const procurado = semAcento(consulta.trim());
	const notas: SugestaoMencao[] = titulos
		.filter((titulo) => semAcento(titulo).includes(procurado))
		.slice(0, MAXIMO_NOTAS)
		.map((alvo) => ({ alvo, tipo: "nota", nova: false }));
	const deMaterial: SugestaoMencao[] = arquivos
		.filter((arquivo) => semAcento(arquivo.nome).includes(procurado))
		.slice(0, MAXIMO_ARQUIVOS)
		.map((arquivo) => ({ alvo: `${PREFIXO_MATERIAL}${arquivo.nome}`, tipo: "arquivo", nova: false, ...(arquivo.tipo ? { detalhe: arquivo.tipo } : {}) }));
	// A nota nova fecha o grupo das notas, antes dos arquivos.
	const limpo = consulta.trim().replace(/\s+/g, " ");
	const igual = titulos.some((titulo) => titulo.toLowerCase() === limpo.toLowerCase());
	if (limpo && !igual && !limpo.startsWith(PREFIXO_MATERIAL) && "titulo" in conferirTitulo(limpo)) notas.push({ alvo: limpo, tipo: "nota", nova: true });
	return [...notas, ...deMaterial];
}

export const Mencao = Node.create<OpcoesMencao>({
	name: "mencao",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addOptions() {
		return { titulos: undefined, arquivos: undefined, abrir: undefined };
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
		const alvo = node.attrs.alvo as string;
		const material = materialDoAlvo(alvo);
		// O arquivo de material aparece com um clipe e só o nome do arquivo.
		if (material !== undefined) {
			return ["span", { ...HTMLAttributes, class: "nota-mencao nota-mencao--arquivo", title: `Material: ${material}` }, ["span", { class: "nota-mencao__clipe", "aria-hidden": "true" }], material];
		}
		return ["span", { ...HTMLAttributes, class: "nota-mencao" }, `[[${alvo}]]`];
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
			// Tracejada a menção para uma nota que não existe (ou um arquivo que não está mais em
			// materiais/); o clique abre a nota (ou oferece criar) ou a seção Materiais.
			new Plugin({
				key: new PluginKey("mencaoNaTela"),
				props: {
					decorations(state) {
						const titulos = opcoes.titulos?.();
						const arquivos = opcoes.arquivos?.();
						if (!titulos && !arquivos) return DecorationSet.empty;
						const notas = new Set((titulos ?? []).map((titulo) => titulo.toLowerCase()));
						const deMaterial = new Set((arquivos ?? []).map((arquivo) => arquivo.nome.toLowerCase()));
						const marcas: Decoration[] = [];
						state.doc.descendants((no, posicao) => {
							if (no.type !== tipo) return;
							const alvo = String(no.attrs.alvo);
							const material = materialDoAlvo(alvo);
							const falta = material !== undefined ? arquivos && !deMaterial.has(material.toLowerCase()) : titulos && !notas.has(alvo.toLowerCase());
							if (falta) {
								const titulo = material !== undefined ? "Arquivo que não está nos materiais" : "Nota que ainda não existe";
								marcas.push(Decoration.node(posicao, posicao + no.nodeSize, { class: "nota-mencao--nova", title: titulo }));
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
			// Digitar [[ abre a lista das notas e dos arquivos de material da matéria, com a etiqueta de cada um.
			Suggestion<ItemBarra, ItemBarra>({
				editor,
				pluginKey: new PluginKey("menuMencao"),
				char: "[[",
				allowSpaces: true,
				allowedPrefixes: null,
				allow: (contexto) => foraDeCodigo(contexto) && Boolean(opcoes.titulos?.() || opcoes.arquivos?.()),
				items: ({ query }) =>
					sugestoesDeMencao(query.replace(/\]+$/, ""), opcoes.titulos?.() ?? [], opcoes.arquivos?.() ?? []).map(({ alvo, tipo: deQue, nova, detalhe }) => ({
						id: `${nova ? "nova" : deQue}:${alvo}`,
						nome: materialDoAlvo(alvo) ?? alvo,
						dica: nova ? "Uma nota que ainda não existe" : deQue === "arquivo" ? `${detalhe ?? "Arquivo"} em materiais/` : "Nota deste caderno",
						icone: nova ? "plus" : deQue === "arquivo" ? "paperclip" : "file",
						etiqueta: deQue === "arquivo" ? "Arquivo" : "Anotação",
						grupo: deQue === "arquivo" ? "Arquivos de material" : "Anotações",
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
