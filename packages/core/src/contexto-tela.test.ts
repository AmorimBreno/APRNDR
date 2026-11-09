// Testes que definem o contrato das funções puras de contexto-tela.ts (WP0).
// O WP1 tira o .skip e implementa até passarem; mudar um teste é mudar o
// contrato (só o orquestrador).

import { describe, expect, it } from "vitest";
import { hashConteudo, resumoDoContexto, TIPO_MENSAGEM_CONTEXTO_TELA, textoParaModelo, ultimoHashVisivel } from "./contexto-tela.ts";
import type { ContextoTela } from "./eventos.ts";

const aberto: ContextoTela = {
	tipo: "nota",
	rotulo: "Séries convergentes",
	origem: "caderno/calc/notas/Séries convergentes",
	olho: true,
	conteudo: "# Critério da razão\nCom L = 1 o teste não decide.",
	selecao: "com L = 1 o teste não decide",
};

const custom = (details: unknown) => ({ role: "custom", customType: TIPO_MENSAGEM_CONTEXTO_TELA, content: "…", display: false, details, timestamp: 1 });

describe.skip("contexto-tela", () => {
	it("hashConteudo: sha256 em hexadecimal, estável e diferente para conteúdos diferentes", () => {
		const hash = hashConteudo("abc");
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hashConteudo("abc")).toBe(hash);
		expect(hashConteudo("abd")).not.toBe(hash);
	});

	it("resumoDoContexto: tira o conteúdo e mantém o resto", () => {
		const resumo = resumoDoContexto({ ...aberto, parcial: true });
		expect(resumo).toEqual({ tipo: "nota", rotulo: "Séries convergentes", origem: "caderno/calc/notas/Séries convergentes", olho: true, parcial: true, selecao: "com L = 1 o teste não decide" });
		expect("conteudo" in resumo).toBe(false);
	});

	it("textoParaModelo com o olho aberto: diz que é o que o usuário via, o tipo, o rótulo, o trecho e o conteúdo", () => {
		const texto = textoParaModelo(aberto, false);
		expect(texto).toMatch(/mensagem acima/);
		expect(texto).toContain("nota");
		expect(texto).toContain("Séries convergentes");
		expect(texto).toContain("com L = 1 o teste não decide");
		expect(texto).toContain("# Critério da razão\nCom L = 1 o teste não decide.");
	});

	it("textoParaModelo repetido: troca o conteúdo pela frase com o rótulo", () => {
		const texto = textoParaModelo(aberto, true);
		expect(texto).not.toContain("# Critério da razão");
		expect(texto).toMatch(/mesmo conteúdo/);
		expect(texto).toContain("Séries convergentes");
		expect(texto).toContain("com L = 1 o teste não decide");
	});

	it("textoParaModelo com o olho fechado: só o rótulo e o trecho, e diz que o conteúdo não foi mandado", () => {
		const { conteudo: _conteudo, ...semConteudo } = aberto;
		const texto = textoParaModelo({ ...semConteudo, olho: false }, false);
		expect(texto).toContain("Séries convergentes");
		expect(texto).toContain("com L = 1 o teste não decide");
		expect(texto).not.toContain("# Critério da razão");
		expect(texto).toMatch(/não (foi mandado|vê)/);
	});

	it("textoParaModelo avisa o conteúdo cortado", () => {
		expect(textoParaModelo({ ...aberto, parcial: true }, false)).toMatch(/cortado/);
	});

	it("ultimoHashVisivel: o hash da última mensagem custom do contexto, procurando de trás para a frente", () => {
		const mensagens = [
			{ role: "user", content: "oi", timestamp: 1 },
			custom({ tipo: "nota", rotulo: "A", olho: true, hash: "h1" }),
			{ role: "assistant", content: [], timestamp: 2 },
			custom({ tipo: "nota", rotulo: "B", olho: true, hash: "h2" }),
			custom({ tipo: "nota", rotulo: "B", olho: false }),
			{ role: "custom", customType: "outro", content: "", display: false, details: { hash: "h9" }, timestamp: 3 },
		];
		expect(ultimoHashVisivel(mensagens)).toBe("h2");
	});

	it("ultimoHashVisivel: sem mensagem com hash (sessão nova ou compactada), undefined", () => {
		expect(ultimoHashVisivel([])).toBeUndefined();
		expect(ultimoHashVisivel([{ role: "compactionSummary", summary: "…", timestamp: 1 }, custom({ olho: false })])).toBeUndefined();
		expect(ultimoHashVisivel([null, 3, "x", custom(null)])).toBeUndefined();
	});
});
