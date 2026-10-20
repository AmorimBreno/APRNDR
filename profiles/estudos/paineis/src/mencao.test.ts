// @vitest-environment happy-dom
// As menções no editor: as sugestões do [[, a decoração da nota que não existe
// e o clique que abre a nota.

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { carregarNoEditor, extensoesDaNota } from "./editor-nota.ts";
import { META_TITULOS, sugestoesDeMencao } from "./mencao.ts";

let editor: Editor | undefined;
afterEach(() => {
	editor?.destroy();
	editor = undefined;
});

describe("sugestões do [[", () => {
	const titulos = ["Limites", "Limites laterais", "Derivadas", "Função exponencial"];
	it("filtra pelo que foi digitado, sem acento", () => {
		expect(sugestoesDeMencao("lim", titulos)).toEqual([
			{ alvo: "Limites", nova: false },
			{ alvo: "Limites laterais", nova: false },
			{ alvo: "lim", nova: true },
		]);
		expect(sugestoesDeMencao("funcao", titulos).map((item) => item.alvo)).toEqual(["Função exponencial", "funcao"]);
	});
	it("sem nada digitado, as notas; com o nome exato, sem a nota nova", () => {
		expect(sugestoesDeMencao("", titulos).map((item) => item.alvo)).toEqual(titulos);
		expect(sugestoesDeMencao("limites", titulos).some((item) => item.nova)).toBe(false);
	});
	it("um nome que não pode ser título não vira nota nova", () => {
		expect(sugestoesDeMencao("a/b", titulos)).toEqual([]);
	});
});

describe("menção na tela", () => {
	function abrir(markdown: string, titulos: string[] | undefined, abertos: string[] = []) {
		const lista = { atual: titulos };
		editor = new Editor({ extensions: extensoesDaNota({ titulosNotas: () => lista.atual, abrirMencao: (alvo) => abertos.push(alvo) }) });
		carregarNoEditor(editor, markdown);
		return lista;
	}
	const tracejadas = () => [...editor!.view.dom.querySelectorAll(".nota-mencao--nova")].map((elemento) => elemento.textContent);

	it("a menção para uma nota que não existe fica tracejada", () => {
		abrir("Ver [[Limites]] e [[Integrais]].", ["Limites"]);
		expect(tracejadas()).toEqual(["[[Integrais]]"]);
	});

	it("sem a lista ainda, nada fica tracejado; quando ela chega, sim", () => {
		const lista = abrir("Ver [[Integrais]].", undefined);
		expect(tracejadas()).toEqual([]);
		lista.atual = ["Limites"];
		editor!.view.dispatch(editor!.state.tr.setMeta(META_TITULOS, true));
		expect(tracejadas()).toEqual(["[[Integrais]]"]);
	});

	it("clicar na menção avisa qual nota abrir", () => {
		const abertos: string[] = [];
		abrir("Ver [[Limites]].", ["Limites"], abertos);
		const elemento = editor!.view.dom.querySelector("[data-mencao]")!;
		elemento.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		expect(abertos).toEqual(["Limites"]);
	});
});
