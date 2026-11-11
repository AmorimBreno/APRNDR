// O trecho na nota (parte C1; docs/mesa-parte-c.md, seções 3 e 4): a âncora da seleção
// do editor, achar um trecho no documento, rolar até ele e destacá-lo. O destaque é uma
// Decoration do ProseMirror, guardada no estado de um plugin: nunca uma marca do TipTap,
// que entraria no markdown, sujaria a nota e dispararia o salvamento. A transação que
// põe e tira o destaque não muda o documento (o TipTap só emite "update" com mudança no
// documento) e vai sem histórico e com preventUpdate.

import { type Editor, Extension } from "@tiptap/core";
import type { Node as NoPM } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { acharNoTexto, localizarNosSegmentos, type NivelAncora, normalizarParaBusca, type PedidoAncora, type Segmento } from "./ancora.ts";
import type { Ancora } from "./origem-mesa.ts";
import { ancoraDaSelecao } from "./selecao.ts";
import { destaqueTemporario, rolarAte } from "./trecho-na-tela.ts";

/** A classe do destaque na nota (mesa.css). */
export const CLASSE_DESTAQUE_NOTA = "mesa-destaque";

/** Quanto texto em volta da seleção a captura lê. */
const LEITURA_CONTEXTO = 200;

/** `no`: o bloco inteiro (Decoration.node, para o título da seção); senão o trecho (Decoration.inline). */
type MetaDestaque = { de: number; ate: number; parado: boolean; no?: boolean } | null;

export const chaveDestaqueNota = new PluginKey<DecorationSet>("destaqueMesa");

/** O plugin do destaque: um DecorationSet que acompanha as edições e só muda pela meta. */
export const DestaqueMesa = Extension.create({
	name: "destaqueMesa",
	addProseMirrorPlugins() {
		return [
			new Plugin<DecorationSet>({
				key: chaveDestaqueNota,
				state: {
					init: () => DecorationSet.empty,
					apply(tr, atual) {
						const meta = tr.getMeta(chaveDestaqueNota) as MetaDestaque | undefined;
						if (meta === null) return DecorationSet.empty;
						if (meta) {
							const classe = `${CLASSE_DESTAQUE_NOTA}${meta.parado ? ` ${CLASSE_DESTAQUE_NOTA}--parado` : ""}`;
							const marca = meta.no ? Decoration.node(meta.de, meta.ate, { class: `${classe} ${CLASSE_DESTAQUE_NOTA}--bloco` }) : Decoration.inline(meta.de, meta.ate, { class: classe });
							return DecorationSet.create(tr.doc, [marca]);
						}
						return tr.docChanged ? atual.map(tr.mapping, tr.doc) : atual;
					},
				},
				props: {
					decorations: (estado) => chaveDestaqueNota.getState(estado),
				},
			}),
		];
	},
});

function despachar(editor: Editor, meta: MetaDestaque): void {
	if (editor.isDestroyed) return;
	editor.view.dispatch(editor.state.tr.setMeta(chaveDestaqueNota, meta).setMeta("addToHistory", false).setMeta("preventUpdate", true));
}

/** Põe o destaque (sem mudar o documento). `no`: o bloco inteiro que começa em `de` e termina em `ate`. */
export function destacarNaNota(editor: Editor, de: number, ate: number, parado = false, no = false): void {
	despachar(editor, { de, ate, parado, ...(no ? { no: true } : {}) });
}

/** Tira o destaque. */
export function limparDestaqueNaNota(editor: Editor): void {
	if (!editor.isDestroyed && chaveDestaqueNota.getState(editor.state)?.find().length) despachar(editor, null);
}

/** O texto do documento, com uma quebra entre os blocos de texto, e a posição de cada nó de texto. */
export function textoDoDocumento(doc: NoPM): { texto: string; segmentos: Segmento<number>[] } {
	let texto = "";
	const segmentos: Segmento<number>[] = [];
	let primeiro = true;
	doc.descendants((no, posicao) => {
		if (no.isTextblock) {
			if (!primeiro) texto += "\n";
			primeiro = false;
			return true;
		}
		if (no.isText && no.text) {
			segmentos.push({ no: posicao, inicio: texto.length, fim: texto.length + no.text.length });
			texto += no.text;
		}
		return true;
	});
	return { texto, segmentos };
}

/** O título (heading) acima de uma posição, ou o que a contém. */
function tituloAcima(doc: NoPM, posicao: number): { texto: string; posicao: number } | undefined {
	let achado: { texto: string; posicao: number } | undefined;
	doc.descendants((no, pos) => {
		if (pos > posicao) return false;
		if (no.type.name === "heading") achado = { texto: no.textContent, posicao: pos };
		return !no.isTextblock;
	});
	return achado;
}

/** A âncora da seleção do editor: o título da seção acima e até 40 caracteres antes e depois. */
export function ancoraDoEditor(estado: EditorState): Ancora {
	const { from, to } = estado.selection;
	const { doc } = estado;
	return ancoraDaSelecao({
		bloco: tituloAcima(doc, from)?.texto,
		antes: doc.textBetween(Math.max(0, from - LEITURA_CONTEXTO), from, "\n", " "),
		depois: doc.textBetween(to, Math.min(doc.content.size, to + LEITURA_CONTEXTO), "\n", " "),
	});
}

/** O retângulo de uma posição do documento na tela (para rolar até ela). */
function retanguloDaPosicao(editor: Editor, posicao: number): { top: number; height: number } | undefined {
	try {
		const coordenadas = editor.view.coordsAtPos(posicao);
		return { top: coordenadas.top, height: Math.max(0, coordenadas.bottom - coordenadas.top) };
	} catch {
		return undefined;
	}
}

/**
 * Acha o trecho do pedido na nota, rola o `rolavel` até ele e destaca (ou só rola). Ordem: o
 * texto exato (com o contexto, se houver); o título da seção da âncora; o começo. Não muda a
 * seleção, nem o foco, nem o documento.
 */
export function mostrarNaNota(editor: Editor, pedido: PedidoAncora, opcoes: { rolavel: HTMLElement | null; suave: boolean; parado: boolean }): NivelAncora {
	const { rolavel, suave } = opcoes;
	const { doc } = editor.state;
	if (pedido.trecho) {
		const { texto, segmentos } = textoDoDocumento(doc);
		const achado = acharNoTexto(texto, pedido.trecho, pedido.ancora);
		const pontos = achado ? localizarNosSegmentos(segmentos, achado.inicio, achado.fim) : undefined;
		if (achado && pontos) {
			const de = pontos.de.no + pontos.de.deslocamento;
			const ate = pontos.ate.no + pontos.ate.deslocamento;
			const retangulo = retanguloDaPosicao(editor, de);
			if (rolavel && retangulo) rolarAte(rolavel, retangulo, suave, pedido.soRolar ? "topo" : "centro");
			if (!pedido.soRolar) {
				destacarNaNota(editor, de, ate, opcoes.parado);
				destaqueTemporario(() => limparDestaqueNaNota(editor));
			}
			return achado.nivel;
		}
	}
	const titulo = pedido.ancora?.bloco ? normalizarParaBusca(pedido.ancora.bloco) : undefined;
	if (titulo) {
		let achado: { posicao: number; tamanho: number } | undefined;
		doc.descendants((no, pos) => {
			if (achado) return false;
			if (no.type.name === "heading" && normalizarParaBusca(no.textContent) === titulo) achado = { posicao: pos, tamanho: no.nodeSize };
			return !no.isTextblock;
		});
		if (achado) {
			const elemento = editor.view.nodeDOM(achado.posicao);
			const retangulo = elemento instanceof Element ? elemento.getBoundingClientRect() : retanguloDaPosicao(editor, achado.posicao + 1);
			if (rolavel && retangulo) rolarAte(rolavel, retangulo, suave, "topo");
			// O fundo vai por uma Decoration do bloco: uma classe posta à mão no DOM do editor seria lida como mudança pelo ProseMirror.
			if (!pedido.soRolar) {
				destacarNaNota(editor, achado.posicao, achado.posicao + achado.tamanho, opcoes.parado, true);
				destaqueTemporario(() => limparDestaqueNaNota(editor));
			}
			return "bloco";
		}
	}
	if (rolavel) rolarAte(rolavel, { top: rolavel.getBoundingClientRect().top - rolavel.scrollTop, height: 0 }, suave, "topo");
	return "inicio";
}
