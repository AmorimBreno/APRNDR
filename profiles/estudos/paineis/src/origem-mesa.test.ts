import { describe, expect, it } from "vitest";
import { abaDoCaminho } from "./abas-mesa.ts";
import { formatarOrigem, LIMITE_ORIGEM, lerOrigem, rotaDaOrigem } from "./origem-mesa.ts";

const NOTA = "caderno/calc/notas/Séries";
const LICAO = "caderno/calc/cursos/c1/modulos/m2/l3";

describe("formatarOrigem e lerOrigem", () => {
	it("sem âncora, a origem é a própria rota", () => {
		expect(formatarOrigem(NOTA)).toBe(NOTA);
		expect(formatarOrigem(NOTA, {})).toBe(NOTA);
		expect(lerOrigem(NOTA)).toEqual({ rota: NOTA });
	});

	it("vai e volta com todos os campos, inclusive acentos e símbolos", () => {
		const ancora = { bloco: "b3", versao: 2, antes: "a razão r & o limite", depois: " = 1/(1-r)? sim" };
		const origem = formatarOrigem(LICAO, ancora);
		expect(origem.startsWith(`${LICAO}?`)).toBe(true);
		expect(lerOrigem(origem)).toEqual({ rota: LICAO, ancora });
	});

	it("o separador é o ?, então um # no título da nota não atrapalha", () => {
		const rota = "caderno/calc/notas/C# e F#";
		const origem = formatarOrigem(rota, { bloco: "Introdução", antes: "x" });
		expect(lerOrigem(origem).rota).toBe(rota);
		expect(rotaDaOrigem(origem)).toBe(rota);
	});

	it("corta o contexto em 40 caracteres: o antes pelo começo, o depois pelo fim", () => {
		const antes = "a".repeat(30) + "b".repeat(30);
		const depois = "c".repeat(30) + "d".repeat(30);
		const lida = lerOrigem(formatarOrigem(NOTA, { antes, depois }));
		expect(lida.ancora?.antes).toBe(antes.slice(-40));
		expect(lida.ancora?.depois).toBe(depois.slice(0, 40));
	});

	it("nunca passa do limite do protocolo, nem com texto que cresce na codificação", () => {
		const comAcentos = "ç".repeat(40);
		const origem = formatarOrigem(`caderno/${"m".repeat(300)}/notas/${"T".repeat(100)}`, { bloco: "ç".repeat(80), versao: 12, antes: comAcentos, depois: comAcentos });
		expect(origem.length).toBeLessThanOrEqual(LIMITE_ORIGEM);
		expect(lerOrigem(origem).rota.startsWith("caderno/")).toBe(true);
	});

	it("com uma rota que sozinha estoura, devolve a rota (o problema não é da âncora)", () => {
		const rota = `caderno/${"m".repeat(600)}`;
		expect(formatarOrigem(rota, { bloco: "x", antes: "y" })).toBe(rota);
	});

	it("ignora o que não lê: codificação quebrada, versão que não é inteiro, campos desconhecidos", () => {
		expect(lerOrigem(`${NOTA}?bloco=%E0%A4%A&v=-1&x=1&depois=ok&antes=`)).toEqual({ rota: NOTA, ancora: { depois: "ok" } });
		expect(lerOrigem(`${NOTA}?v=1.5`)).toEqual({ rota: NOTA });
		expect(lerOrigem(`${NOTA}?`)).toEqual({ rota: NOTA });
	});

	it("a versão 0 vale", () => {
		expect(lerOrigem(formatarOrigem(LICAO, { versao: 0 })).ancora).toEqual({ versao: 0 });
	});
});

describe("abaDoCaminho com âncora", () => {
	it("a chave da aba não muda com a âncora", () => {
		const origem = formatarOrigem(LICAO, { bloco: "b3", versao: 1, antes: "x", depois: "y" });
		expect(abaDoCaminho(origem)).toEqual(abaDoCaminho(LICAO));
		expect(abaDoCaminho(formatarOrigem(NOTA, { bloco: "Séries" }))).toEqual({ tipo: "nota", chave: NOTA });
	});
});
