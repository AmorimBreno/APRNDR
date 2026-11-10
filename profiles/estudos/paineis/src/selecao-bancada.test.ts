import { describe, expect, it } from "vitest";
import { alternarEscolha, chavesSelecionadas, escolhasVigentes, SEM_ESCOLHAS } from "./selecao-bancada.ts";

const chaves = ["a", "b", "c"];

describe("chavesSelecionadas", () => {
	it("padrão: só a aba em foco", () => {
		expect(chavesSelecionadas(chaves, "b", SEM_ESCOLHAS)).toEqual(["b"]);
	});

	it("sem foco, nenhuma", () => {
		expect(chavesSelecionadas(chaves, undefined, SEM_ESCOLHAS)).toEqual([]);
	});

	it("clique numa outra seleciona; clique na em foco desmarca; ordem das abas", () => {
		let escolhas = alternarEscolha(SEM_ESCOLHAS, chaves, "b", "c");
		escolhas = alternarEscolha(escolhas, chaves, "b", "a");
		expect(chavesSelecionadas(chaves, "b", escolhas)).toEqual(["a", "b", "c"]);
		escolhas = alternarEscolha(escolhas, chaves, "b", "b");
		expect(chavesSelecionadas(chaves, "b", escolhas)).toEqual(["a", "c"]);
	});

	it("clicar duas vezes volta ao padrão", () => {
		const uma = alternarEscolha(SEM_ESCOLHAS, chaves, "a", "c");
		const duas = alternarEscolha(uma, chaves, "a", "c");
		expect(chavesSelecionadas(chaves, "a", duas)).toEqual(["a"]);
	});

	it("mudando o foco, as escolhas somem e volta o padrão", () => {
		const escolhas = alternarEscolha(SEM_ESCOLHAS, chaves, "a", "c");
		expect(chavesSelecionadas(chaves, "b", escolhas)).toEqual(["b"]);
		expect(escolhasVigentes(escolhas, chaves, "b")).toEqual({ foco: "b", invertidas: [] });
	});

	it("a aba fechada some das escolhas", () => {
		const escolhas = alternarEscolha(SEM_ESCOLHAS, chaves, "a", "c");
		expect(chavesSelecionadas(["a", "b"], "a", escolhas)).toEqual(["a"]);
		expect(escolhasVigentes(escolhas, ["a", "b"], "a").invertidas).toEqual([]);
	});

	it("alternar uma chave que não existe não muda nada", () => {
		expect(alternarEscolha(SEM_ESCOLHAS, chaves, "a", "x").invertidas).toEqual([]);
	});
});
