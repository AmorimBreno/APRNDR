import { describe, expect, it } from "vitest";
import { formatarTrechoGuardado, idCurtoAntigoDaConversa, idCurtoDaConversa } from "./trecho-guardado.ts";

// Contrato do WP0 (docs/mesa-parte-c.md, seção 5), implementado no WP1.
const SESSAO = "019a6c1e-3f2b-7d4a-9c8e-5b1f0a2d3e4c";
// 11/11/2026 no fuso local (o formato usa a data que o Breno viu).
const EM = new Date(2026, 10, 11, 9, 30);

describe("formatarTrechoGuardado", () => {
	it("cita o bloco em markdown com a linha de fonte e o id curto da conversa num link", () => {
		const saida = formatarTrechoGuardado({ texto: "O limite existe quando os dois lados concordam.", em: EM, sessao: SESSAO });
		expect(saida).toBe(
			["> O limite existe quando os dois lados concordam.", ">", `> — Professor, [conversa de 11/11/2026](conversa:${idCurtoDaConversa(SESSAO)})`].join("\n"),
		);
	});

	it("prefixa todas as linhas do bloco, as em branco só com >, e tira as linhas em branco das pontas", () => {
		const saida = formatarTrechoGuardado({ texto: "\n\nPrimeiro parágrafo.\nSegunda linha.\n\nOutro parágrafo.\n\n", em: EM, sessao: SESSAO });
		const linhas = saida.split("\n");
		expect(linhas.slice(0, 5)).toEqual(["> Primeiro parágrafo.", "> Segunda linha.", ">", "> Outro parágrafo.", ">"]);
		expect(linhas.every((linha) => linha === ">" || linha.startsWith("> "))).toBe(true);
		expect(saida.startsWith(">")).toBe(true);
		expect(saida.endsWith("(conversa:" + idCurtoDaConversa(SESSAO) + ")")).toBe(true);
		expect(saida).not.toMatch(/ \n/);
	});

	it("mantém listas, código e fórmulas do bloco dentro da citação", () => {
		const texto = ["- item um", "  - subitem", "1. passo", "", "```python", "def f(x):", "    return x ** 2", "```", "", "$$", "\\int_0^1 x\\,dx = \\tfrac12", "$$"].join("\n");
		const saida = formatarTrechoGuardado({ texto, em: EM, sessao: SESSAO });
		const dentro = saida
			.split("\n")
			.slice(0, -2)
			.map((linha) => (linha === ">" ? "" : linha.slice(2)))
			.join("\n");
		// Tirando o "> " de cada linha, volta exatamente o bloco original.
		expect(dentro).toBe(texto);
		expect(saida).toContain(">     return x ** 2");
		expect(saida).toContain("> \\int_0^1 x\\,dx = \\tfrac12");
	});

	it("aceita quebras de linha do Windows", () => {
		const saida = formatarTrechoGuardado({ texto: "um\r\ndois\r\n", em: EM, sessao: SESSAO });
		expect(saida).not.toContain("\r");
		expect(saida.split("\n").slice(0, 2)).toEqual(["> um", "> dois"]);
	});

	it("a data sai como dd/mm/aaaa, com zeros, no fuso local", () => {
		expect(formatarTrechoGuardado({ texto: "x", em: new Date(2026, 0, 5, 23, 59), sessao: SESSAO })).toContain("> — Professor, [conversa de 05/01/2026]");
		expect(formatarTrechoGuardado({ texto: "x", em: new Date(2026, 11, 31, 0, 0), sessao: SESSAO })).toContain("[conversa de 31/12/2026]");
	});
});

describe("idCurtoDaConversa", () => {
	it("é estável para a mesma sessão e diferente para sessões diferentes", () => {
		const outra = "019a6c1e-3f2c-7d4a-9c8e-7777aaaabbbb";
		expect(idCurtoDaConversa(SESSAO)).toBe(idCurtoDaConversa(SESSAO));
		expect(idCurtoDaConversa(SESSAO)).not.toBe(idCurtoDaConversa(outra));
	});

	it("tem 8 caracteres e vem dos dígitos de baixo do relógio (5º ao 12º), que mudam a cada milissegundo", () => {
		const depois = "019a6c1e-3f2c-7aaa-8123-456789abcdef";
		const id = idCurtoDaConversa(SESSAO);
		expect(id).toBe("6c1e3f2b");
		expect(id).toMatch(/^[0-9a-f]{8}$/);
		// Duas sessões abertas no mesmo minuto têm o começo igual e não podem ter o id curto igual.
		expect(SESSAO.slice(0, 8)).toBe(depois.slice(0, 8));
		expect(idCurtoDaConversa(depois)).not.toBe(id);
	});

	it("separa as conversas abertas no mesmo servidor, que o pi gera com a mesma parte aleatória (achado de 2026-11-24)", () => {
		const primeira = "01a20ded-9979-7337-956f-b579dd9bd0f0";
		const segunda = "01a20dee-32cd-7337-956f-b57bc81ec7ca";
		expect(idCurtoAntigoDaConversa(primeira)).toBe(idCurtoAntigoDaConversa(segunda));
		expect(idCurtoDaConversa(primeira)).not.toBe(idCurtoDaConversa(segunda));
		expect(idCurtoAntigoDaConversa("Sessão-1")).toBeUndefined();
	});

	it("num id que não é UUID, vale o começo dele, só letras e números", () => {
		expect(idCurtoDaConversa("Sessão-1_abc")).toBe("sessão1a");
		expect(idCurtoDaConversa("---")).toBe("semid");
	});
});
