// Testes que definem o contrato das funções puras de contexto-tela.ts
// (WP0, e a bancada: docs/mesa-de-estudo.md, 5b). Mudar um teste é mudar o
// contrato (só o orquestrador).

import { describe, expect, it } from "vitest";
import {
	hashConteudo,
	hashesVisiveis,
	mensagemDoContexto,
	resumoDaMensagemContexto,
	resumoDoContexto,
	TIPO_MENSAGEM_CONTEXTO_TELA,
	textoParaModelo,
} from "./contexto-tela.ts";
import type { ContextoTela } from "./eventos.ts";

const aberto: ContextoTela = {
	tipo: "nota",
	rotulo: "Séries convergentes",
	origem: "caderno/calc/notas/Séries convergentes",
	olho: true,
	conteudo: "# Critério da razão\nCom L = 1 o teste não decide.",
	selecao: "com L = 1 o teste não decide",
	foco: true,
};

const outra: ContextoTela = { tipo: "licao", rotulo: "Lição 2.3", olho: false };

const custom = (details: unknown) => ({ role: "custom", customType: TIPO_MENSAGEM_CONTEXTO_TELA, content: "…", display: false, details, timestamp: 1 });

describe("contexto-tela", () => {
	it("hashConteudo: sha256 em hexadecimal, estável e diferente para conteúdos diferentes", () => {
		const hash = hashConteudo("abc");
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hashConteudo("abc")).toBe(hash);
		expect(hashConteudo("abd")).not.toBe(hash);
	});

	it("resumoDoContexto: tira o conteúdo e mantém o resto, com o foco", () => {
		const resumo = resumoDoContexto({ ...aberto, parcial: true });
		expect(resumo).toEqual({
			tipo: "nota",
			rotulo: "Séries convergentes",
			origem: "caderno/calc/notas/Séries convergentes",
			olho: true,
			parcial: true,
			selecao: "com L = 1 o teste não decide",
			foco: true,
		});
		expect("conteudo" in resumo).toBe(false);
	});

	it("textoParaModelo com o olho aberto: diz que é o que o usuário via, o tipo, o rótulo, o trecho e o conteúdo", () => {
		const texto = textoParaModelo([aberto], [false]);
		expect(texto).toMatch(/mensagem acima/);
		expect(texto).toContain("nota");
		expect(texto).toContain("Séries convergentes");
		expect(texto).toMatch(/em foco/i);
		expect(texto).toContain("com L = 1 o teste não decide");
		expect(texto).toContain("# Critério da razão\nCom L = 1 o teste não decide.");
	});

	it("textoParaModelo repetido: troca o conteúdo pela frase com o rótulo", () => {
		const texto = textoParaModelo([aberto], [true]);
		expect(texto).not.toContain("# Critério da razão");
		expect(texto).toMatch(/mesmo conteúdo/);
		expect(texto).toContain("Séries convergentes");
		expect(texto).toContain("com L = 1 o teste não decide");
	});

	it("textoParaModelo com o olho fechado: só o rótulo e o trecho, e diz que o conteúdo não foi mandado", () => {
		const { conteudo: _conteudo, ...semConteudo } = aberto;
		const texto = textoParaModelo([{ ...semConteudo, olho: false }], [false]);
		expect(texto).toContain("Séries convergentes");
		expect(texto).toContain("com L = 1 o teste não decide");
		expect(texto).not.toContain("# Critério da razão");
		expect(texto).toMatch(/conteúdo não (foi )?mandado/);
	});

	it("textoParaModelo avisa o conteúdo cortado", () => {
		expect(textoParaModelo([{ ...aberto, parcial: true }], [false])).toMatch(/cortado/);
	});

	it("textoParaModelo com duas abas: a em foco primeiro; a outra só com o nome", () => {
		// Fora de ordem de propósito: a em foco vem depois na lista e sai primeiro no texto.
		const texto = textoParaModelo([outra, aberto], [false, false]);
		expect(texto.indexOf("Séries convergentes")).toBeLessThan(texto.indexOf("Lição 2.3"));
		expect(texto).toContain("# Critério da razão");
		expect(texto).toMatch(/conteúdo não mandado/);
	});

	it("hashesVisiveis: todos os hashes das mensagens custom do contexto, nos dois formatos", () => {
		const mensagens = [
			{ role: "user", content: "oi", timestamp: 1 },
			custom({ contextos: [{ tipo: "nota", rotulo: "A", olho: true, hash: "h1" }, { tipo: "nota", rotulo: "B", olho: true, hash: "h2" }] }),
			{ role: "assistant", content: [], timestamp: 2 },
			custom({ tipo: "nota", rotulo: "C", olho: true, hash: "h3" }),
			custom({ contextos: [{ tipo: "nota", rotulo: "D", olho: false }] }),
			{ role: "custom", customType: "outro", content: "", display: false, details: { hash: "h9" }, timestamp: 3 },
		];
		expect(hashesVisiveis(mensagens)).toEqual(new Set(["h1", "h2", "h3"]));
	});

	it("hashesVisiveis: sem mensagem com hash (sessão nova ou compactada), vazio", () => {
		expect(hashesVisiveis([]).size).toBe(0);
		expect(hashesVisiveis([{ role: "compactionSummary", summary: "…", timestamp: 1 }, custom({ olho: false })]).size).toBe(0);
		expect(hashesVisiveis([null, 3, "x", custom(null), custom({ contextos: [null, 4] })]).size).toBe(0);
	});

	it("resumoDaMensagemContexto: lista de resumos sem conteúdo nem hash; o formato antigo vira lista de um", () => {
		const nova = custom({ contextos: [{ ...resumoDoContexto(aberto), hash: "h1", conteudo: "segredo" }, { ...outra }] });
		const resumos = resumoDaMensagemContexto(nova);
		expect(resumos).toEqual([resumoDoContexto(aberto), outra]);
		expect(JSON.stringify(resumos)).not.toContain("h1");
		expect(JSON.stringify(resumos)).not.toContain("segredo");

		const antiga = custom({ tipo: "nota", rotulo: "A", olho: true, hash: "h1" });
		expect(resumoDaMensagemContexto(antiga)).toEqual([{ tipo: "nota", rotulo: "A", olho: true }]);

		expect(resumoDaMensagemContexto(custom(null))).toBeUndefined();
		expect(resumoDaMensagemContexto(custom({ contextos: [{ tipo: 1 }] }))).toBeUndefined();
		expect(resumoDaMensagemContexto({ role: "user", content: "x" })).toBeUndefined();
	});

	describe("mensagemDoContexto", () => {
		it("a aba selecionada leva conteúdo e hash; a não selecionada, nem um nem outro", () => {
			const mensagem = mensagemDoContexto([aberto, { ...outra, conteudo: "não deveria ir" } as ContextoTela], []);
			expect(mensagem.display).toBe(false);
			expect(mensagem.content).toContain("# Critério da razão");
			expect(mensagem.content).not.toContain("não deveria ir");
			expect(mensagem.details.contextos[0]?.hash).toBe(hashConteudo(aberto.conteudo ?? ""));
			expect(mensagem.details.contextos[1]).toEqual(outra);
			expect(JSON.stringify(mensagem.details)).not.toContain("# Critério");
		});

		it("conteúdo já visível: vai como repetido e sem hash", () => {
			const hash = hashConteudo(aberto.conteudo ?? "");
			const mensagem = mensagemDoContexto([aberto], [custom({ contextos: [{ tipo: "nota", rotulo: "X", olho: true, hash }] })]);
			expect(mensagem.content).toMatch(/mesmo conteúdo/);
			expect(mensagem.content).not.toContain("# Critério da razão");
			expect(mensagem.details.contextos[0]).not.toHaveProperty("hash");
		});
	});
});
