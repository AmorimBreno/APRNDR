import { describe, expect, it } from "vitest";
import { acharNoTexto, localizarNosSegmentos, normalizarParaBusca, quedaMereceAviso } from "./ancora.ts";

// Contrato do WP0 (docs/mesa-parte-c.md, seção 3). Os casos com a tela (rolagem guardada
// contra a âncora, prazo, bloco reescrito) estão em trecho-na-tela.dom.test.ts e
// MesaEstudo.dom.test.ts.

describe("normalizarParaBusca", () => {
	it("junta os espaços, tira as pontas e a caixa", () => {
		expect(normalizarParaBusca("  Série\n\tGEOMÉTRICA  converge ")).toBe("série geométrica converge");
	});
});

describe("acharNoTexto", () => {
	const texto = "A razão é r. Se |r| < 1, a série converge. Mais adiante: se |r| < 1, a soma é a/(1-r).";

	it("acha o texto exato com o contexto (antes e depois) quando há mais de uma ocorrência", () => {
		const achado = acharNoTexto(texto, "se |r| < 1", { antes: "Mais adiante: ", depois: ", a soma é" });
		expect(achado?.nivel).toBe("exato-com-contexto");
		expect(texto.slice(achado!.inicio, achado!.fim)).toBe("se |r| < 1");
		expect(achado!.inicio).toBe(texto.lastIndexOf("se |r|"));
	});

	it("sem contexto que case, acha a primeira ocorrência exata", () => {
		const achado = acharNoTexto(texto, "se |r| < 1", { antes: "nada a ver", depois: "outra coisa" });
		expect(achado?.nivel).toBe("exato");
		expect(achado!.inicio).toBe(texto.indexOf("Se |r|"));
	});

	it("sem âncora, a primeira ocorrência, no nível exato", () => {
		expect(acharNoTexto(texto, "se |r| < 1")).toMatchObject({ nivel: "exato", inicio: texto.indexOf("Se |r|") });
	});

	it("com só parte do contexto em comum, prefere a ocorrência que mais casa", () => {
		const achado = acharNoTexto(texto, "se |r| < 1", { depois: ", a soma é a/(9-r)" });
		expect(achado?.nivel).toBe("exato");
		expect(achado!.inicio).toBe(texto.lastIndexOf("se |r|"));
	});

	it("compara com espaços juntos e sem diferença de caixa, devolvendo índices do texto original", () => {
		const original = "Primeiro.\n\nA   Série\nGeométrica converge  quando |r| < 1.";
		const achado = acharNoTexto(original, "a série geométrica converge");
		expect(achado).toBeDefined();
		expect(original.slice(achado!.inicio, achado!.fim)).toBe("A   Série\nGeométrica converge");
	});

	it("o contexto vale sem espaços: a seleção e a tela quebram as linhas de jeitos diferentes", () => {
		const tela = "Fim do parágrafo.\nComeço do outro, com o termo aqui. E o termo de novo.";
		const achado = acharNoTexto(tela, "o termo", { antes: "parágrafo.Começo do outro, com " });
		expect(achado?.nivel).toBe("exato-com-contexto");
		expect(achado!.inicio).toBe(tela.indexOf("o termo"));
	});

	it("não acha: devolve undefined, e quem chama cai no bloco e no começo da aba", () => {
		expect(acharNoTexto(texto, "série divergente")).toBeUndefined();
		expect(acharNoTexto(texto, "   ")).toBeUndefined();
	});

	it("seleção de fórmula do KaTeX (texto duplicado) não acha e cai no bloco", () => {
		// O KaTeX desenha a fórmula duas vezes (MathML e HTML); a seleção leva as duas, o texto da lição só uma.
		const licao = "A soma é S = a/(1 − r) quando a razão é pequena.";
		expect(acharNoTexto(licao, "S = a/(1 − r)S=a/(1−r)S = a/(1 − r)")).toBeUndefined();
	});
});

describe("quedaMereceAviso", () => {
	it("só avisa quando caiu de um nível que o pedido tinha", () => {
		expect(quedaMereceAviso("exato-com-contexto", { trecho: "x", ancora: { antes: "a" }, soRolar: false })).toBe(false);
		expect(quedaMereceAviso("exato", { trecho: "x", ancora: { antes: "a" }, soRolar: false })).toBe(true);
		expect(quedaMereceAviso("exato", { trecho: "x", soRolar: false })).toBe(false);
		expect(quedaMereceAviso("bloco", { trecho: "x", soRolar: false })).toBe(true);
		expect(quedaMereceAviso("bloco", { ancora: { bloco: "b1" }, soRolar: false })).toBe(false);
		expect(quedaMereceAviso("inicio", { ancora: { bloco: "b1" }, soRolar: false })).toBe(true);
		expect(quedaMereceAviso("inicio", { soRolar: false })).toBe(false);
	});
});

describe("localizarNosSegmentos", () => {
	// "abc" + "\n" + "def": o separador (índice 3) não é de nó nenhum.
	const segmentos = [
		{ no: "p1", inicio: 0, fim: 3 },
		{ no: "p2", inicio: 4, fim: 7 },
	];

	it("converte para nó e deslocamento", () => {
		expect(localizarNosSegmentos(segmentos, 1, 6)).toEqual({ de: { no: "p1", deslocamento: 1 }, ate: { no: "p2", deslocamento: 2 } });
	});

	it("o separador nas pontas pula para o segmento vizinho", () => {
		expect(localizarNosSegmentos(segmentos, 3, 7)).toEqual({ de: { no: "p2", deslocamento: 0 }, ate: { no: "p2", deslocamento: 3 } });
		expect(localizarNosSegmentos(segmentos, 0, 4)).toEqual({ de: { no: "p1", deslocamento: 0 }, ate: { no: "p1", deslocamento: 3 } });
	});

	it("só o separador: nada", () => {
		expect(localizarNosSegmentos(segmentos, 3, 4)).toBeUndefined();
	});
});
