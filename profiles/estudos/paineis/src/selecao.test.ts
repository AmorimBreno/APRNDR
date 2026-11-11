import { describe, expect, it } from "vitest";
import { CONTEXTO_MAXIMO } from "./origem-mesa.ts";
import {
	ancoraDaSelecao,
	decidirSelecao,
	JEITOS_DE_EXPLICAR,
	juntarEspacos,
	MAXIMO_TRECHO_BARRA,
	MAXIMO_TRECHO_TERMO,
	type NoDaSelecao,
	PEDIDO_ME_TESTE,
	pedidoDoJeito,
	PROIBIDOS_PADRAO,
	trechoDaBarra,
	valeParaTermos,
} from "./selecao.ts";

/** Um "elemento" falso: se está num lugar proibido (closest devolve algo) ou não. */
function no(proibido: boolean): NoDaSelecao {
	return { closest: (seletor) => (proibido && seletor === PROIBIDOS_PADRAO ? {} : null) };
}
const dentro = no(false);
const proibido = no(true);
const fora = no(false);
const raiz = { contains: (alvo: unknown) => alvo !== fora };

describe("juntarEspacos", () => {
	it("junta quebras, tabulações e espaços repetidos e apara as pontas", () => {
		expect(juntarEspacos("  uma \n\t frase   \r\n com  espaços ")).toBe("uma frase com espaços");
	});
	it("só espaço vira vazio", () => {
		expect(juntarEspacos(" \n\t ")).toBe("");
	});
});

describe("trechoDaBarra", () => {
	it("aceita de 1 a 2000 caracteres", () => {
		expect(trechoDaBarra("a")).toBe("a");
		expect(trechoDaBarra("a".repeat(MAXIMO_TRECHO_BARRA))).toHaveLength(MAXIMO_TRECHO_BARRA);
	});
	it("recusa vazio, só espaço e 2001 caracteres", () => {
		expect(trechoDaBarra("")).toBeUndefined();
		expect(trechoDaBarra("  \n ")).toBeUndefined();
		expect(trechoDaBarra("a".repeat(MAXIMO_TRECHO_BARRA + 1))).toBeUndefined();
	});
	it("conta depois de juntar os espaços", () => {
		expect(trechoDaBarra(`a${" ".repeat(5000)}b`)).toBe("a b");
	});
	it("aceita um limite próprio", () => {
		expect(trechoDaBarra("abcd", 3)).toBeUndefined();
		expect(trechoDaBarra("abc", 3)).toBe("abc");
	});
});

describe("valeParaTermos", () => {
	it("o limite dos termos continua 300", () => {
		expect(MAXIMO_TRECHO_TERMO).toBe(300);
		expect(valeParaTermos("a".repeat(300))).toBe(true);
		expect(valeParaTermos("a".repeat(301))).toBe(false);
		expect(valeParaTermos("")).toBe(false);
	});
});

describe("decidirSelecao", () => {
	const base = { texto: " um trecho  qualquer ", raiz, inicio: dentro, fim: dentro, proibidos: PROIBIDOS_PADRAO };
	it("mostra a barra com o trecho limpo quando tudo está dentro", () => {
		expect(decidirSelecao(base)).toBe("um trecho qualquer");
	});
	it("não mostra se o início ou o fim estão fora da raiz", () => {
		expect(decidirSelecao({ ...base, inicio: fora })).toBeUndefined();
		expect(decidirSelecao({ ...base, fim: fora })).toBeUndefined();
	});
	it("não mostra sem início ou sem fim", () => {
		expect(decidirSelecao({ ...base, inicio: null })).toBeUndefined();
		expect(decidirSelecao({ ...base, fim: null })).toBeUndefined();
	});
	it("não mostra se o início ou o fim estão num lugar proibido", () => {
		expect(decidirSelecao({ ...base, inicio: proibido })).toBeUndefined();
		expect(decidirSelecao({ ...base, fim: proibido })).toBeUndefined();
	});
	it("não mostra se a seleção atravessa um lugar proibido", () => {
		expect(decidirSelecao({ ...base, cruzaProibido: true })).toBeUndefined();
	});
	it("não mostra com texto vazio ou acima do limite", () => {
		expect(decidirSelecao({ ...base, texto: "   " })).toBeUndefined();
		expect(decidirSelecao({ ...base, texto: "x".repeat(2001) })).toBeUndefined();
		expect(decidirSelecao({ ...base, texto: "x".repeat(2000) })).toHaveLength(2000);
	});
	it("a lista de proibidos inclui o painel do professor e os campos", () => {
		expect(PROIBIDOS_PADRAO).toContain(".mesa__professor");
		expect(PROIBIDOS_PADRAO).toContain("textarea");
	});
});

describe("ancoraDaSelecao", () => {
	it("lição: leva o bloco, a versão e até 40 caracteres de cada lado, com os espaços juntos", () => {
		const antes = `${"x".repeat(100)} o fim\n do   texto antes `;
		const depois = ` e o começo\n\n do texto depois ${"y".repeat(100)}`;
		const ancora = ancoraDaSelecao({ bloco: "b3", versao: 2, antes, depois });
		expect(ancora.bloco).toBe("b3");
		expect(ancora.versao).toBe(2);
		expect(ancora.antes).toHaveLength(CONTEXTO_MAXIMO);
		expect(ancora.antes?.endsWith("o fim do texto antes ")).toBe(true);
		expect(ancora.depois).toHaveLength(CONTEXTO_MAXIMO);
		expect(ancora.depois?.startsWith(" e o começo do texto depois")).toBe(true);
	});

	it("nota: o título da seção é o bloco, sem versão", () => {
		expect(ancoraDaSelecao({ bloco: "  Critério\nda razão ", antes: "a ", depois: " b" })).toEqual({ bloco: "Critério da razão", antes: "a ", depois: " b" });
	});

	it("sem nada em volta (começo de um bloco), os campos vazios saem", () => {
		expect(ancoraDaSelecao({ antes: "", depois: "  \n " })).toEqual({});
		expect(ancoraDaSelecao({ versao: -1, antes: "", depois: "" })).toEqual({});
	});
});

describe("os pedidos prontos", () => {
	it("são quatro jeitos, cada um pedindo para explicar de outro jeito", () => {
		expect(JEITOS_DE_EXPLICAR.map((j) => j.id)).toEqual(["analogia", "caso_real", "passo_a_passo", "visual"]);
		expect(pedidoDoJeito("analogia")).toBe("Explique este trecho de outro jeito, com uma analogia.");
		for (const jeito of JEITOS_DE_EXPLICAR) expect(jeito.pedido).toMatch(/^Explique este trecho de outro jeito/);
	});
	it("o Me teste não deixa o professor dar a resposta antes", () => {
		expect(PEDIDO_ME_TESTE).toContain("Não dê a resposta antes de eu tentar.");
	});
});
