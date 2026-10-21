// @vitest-environment happy-dom
// As menções no editor: as sugestões do [[, a decoração da nota que não existe
// e o clique que abre a nota.

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { carregarNoEditor, extensoesDaNota, markdownDaNota } from "./editor-nota.ts";
import { META_TITULOS, materialDoAlvo, sugestoesDeMencao } from "./mencao.ts";

let editor: Editor | undefined;
afterEach(() => {
	editor?.destroy();
	editor = undefined;
});

describe("sugestões do [[", () => {
	const titulos = ["Limites", "Limites laterais", "Derivadas", "Função exponencial"];
	it("filtra pelo que foi digitado, sem acento", () => {
		expect(sugestoesDeMencao("lim", titulos)).toEqual([
			{ alvo: "Limites", tipo: "nota", nova: false },
			{ alvo: "Limites laterais", tipo: "nota", nova: false },
			{ alvo: "lim", tipo: "nota", nova: true },
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
	it("os arquivos de material entram depois das notas (e da nota nova), com o tipo", () => {
		const arquivos = [{ nome: "aula-limites.pdf", tipo: "PDF" }, { nome: "derivadas.ipynb", tipo: "Notebook" }, { nome: "outra.md" }];
		expect(sugestoesDeMencao("lim", titulos, arquivos)).toEqual([
			{ alvo: "Limites", tipo: "nota", nova: false },
			{ alvo: "Limites laterais", tipo: "nota", nova: false },
			{ alvo: "lim", tipo: "nota", nova: true },
			{ alvo: "materiais/aula-limites.pdf", tipo: "arquivo", nova: false, detalhe: "PDF" },
		]);
		expect(sugestoesDeMencao("", [], arquivos).map((item) => item.alvo)).toEqual(["materiais/aula-limites.pdf", "materiais/derivadas.ipynb", "materiais/outra.md"]);
		expect(materialDoAlvo("materiais/sub/aula.pdf")).toBe("sub/aula.pdf");
		expect(materialDoAlvo("Limites")).toBeUndefined();
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

	it("a menção a material mostra o nome com o clipe, e fica tracejada se o arquivo sumiu", () => {
		const lista = { atual: ["Limites"] as string[] | undefined };
		const arquivos = { atual: [{ nome: "aula.pdf" }] };
		editor = new Editor({ extensions: extensoesDaNota({ titulosNotas: () => lista.atual, arquivosMateria: () => arquivos.atual }) });
		carregarNoEditor(editor, "Ver [[materiais/aula.pdf]] e [[materiais/sumiu.pdf]].");
		const etiquetas = [...editor.view.dom.querySelectorAll(".nota-mencao--arquivo")].map((elemento) => elemento.textContent);
		expect(etiquetas).toEqual(["aula.pdf", "sumiu.pdf"]);
		expect(tracejadas()).toEqual(["sumiu.pdf"]);
		expect(markdownDaNota(editor)).toBe("Ver [[materiais/aula.pdf]] e [[materiais/sumiu.pdf]].");
	});

	it("clicar na menção avisa qual nota abrir", () => {
		const abertos: string[] = [];
		abrir("Ver [[Limites]].", ["Limites"], abertos);
		const elemento = editor!.view.dom.querySelector("[data-mencao]")!;
		elemento.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		expect(abertos).toEqual(["Limites"]);
	});
});
