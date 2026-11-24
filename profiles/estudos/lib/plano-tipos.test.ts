// Testes das funções puras dos planos de estudos (docs/planos-de-estudo.md, R1): a tag, a leitura, as
// operações (o resto do arquivo fica byte a byte igual, CRLF incluído), a conversa, o plano novo, o
// resumo do professor e o plano seguido pela conversa.

import { describe, expect, it } from "vitest";
import { previaDaNota } from "./nota-tipos.ts";
import {
	acrescentarConversa,
	aplicarOperacoes,
	ehPlanoDeEstudos,
	LIMITE_ITENS_PLANO,
	LIMITE_RESUMO_PLANO,
	LIMITE_TEXTO_ITEM,
	lerPlano,
	montarPlano,
	type OperacaoPlano,
	type PlanoLido,
	planoSeguido,
	resumoParaProfessor,
	TIPO_ENTRADA_PLANO,
} from "./plano-tipos.ts";

const PLANO = [
	"Plano de estudos · criado em 24/11/2026",
	"**Objetivo:** prova final de 26/11",
	"",
	"## Itens",
	"- [x] **Q1 · k-means**",
	"- [ ] **Q2 · PCA**",
	"  - [ ] subitem do Breno",
	"  uma observação recuada",
	"- [ ] **Q3 · Curva ROC**",
	"",
	"## Conversas",
	"- [24/11/2026](conversa:abc12345)",
	"",
].join("\n");

const comCrlf = (texto: string) => texto.replace(/\n/g, "\r\n");

const aplicar = (markdown: string, ...operacoes: OperacaoPlano[]) => {
	const resultado = aplicarOperacoes(markdown, operacoes);
	if ("erro" in resultado) throw new Error(resultado.erro);
	return resultado.markdown;
};

describe("ehPlanoDeEstudos", () => {
	it("a primeira linha não vazia com a tag; com BOM, CRLF e linhas em branco antes", () => {
		expect(ehPlanoDeEstudos(PLANO)).toBe(true);
		expect(ehPlanoDeEstudos(comCrlf(PLANO))).toBe(true);
		expect(ehPlanoDeEstudos(`﻿${PLANO}`)).toBe(true);
		expect(ehPlanoDeEstudos(`\n  \n${PLANO}`)).toBe(true);
	});

	it("nota comum, tag fora da primeira linha, tag incompleta ou vazia não é plano", () => {
		expect(ehPlanoDeEstudos("# Limites\n- [ ] a\n")).toBe(false);
		expect(ehPlanoDeEstudos(`# Título\n${PLANO}`)).toBe(false);
		expect(ehPlanoDeEstudos("Plano de estudos criado em 24/11/2026\n")).toBe(false);
		expect(ehPlanoDeEstudos("")).toBe(false);
		expect(ehPlanoDeEstudos("  \n\n")).toBe(false);
	});
});

describe("lerPlano", () => {
	it("lê o objetivo, os itens de primeiro nível, as conversas e o progresso", () => {
		const plano = lerPlano(PLANO)!;
		expect(plano.objetivo).toBe("prova final de 26/11");
		expect(plano.itens).toEqual([
			{ numero: 1, texto: "**Q1 · k-means**", feito: true },
			{ numero: 2, texto: "**Q2 · PCA**", feito: false },
			{ numero: 3, texto: "**Q3 · Curva ROC**", feito: false },
		]);
		expect(plano.conversas).toEqual(["abc12345"]);
		expect(plano.atual).toBe(2);
		expect(plano).toMatchObject({ feitos: 1, total: 3, concluido: false });
	});

	it("aceita [X], os marcadores * e +, CRLF e BOM", () => {
		const plano = lerPlano(comCrlf(`﻿Plano de estudos · criado em 24/11/2026\n\n## Itens\n* [X] um\n+ [ ] dois\n- [x] três\n`))!;
		expect(plano.itens.map((item) => [item.texto, item.feito])).toEqual([
			["um", true],
			["dois", false],
			["três", true],
		]);
		expect(plano.atual).toBe(2);
	});

	it("concluído = todos marcados e pelo menos um; sem itens não é concluído e não tem atual", () => {
		const feito = lerPlano("Plano de estudos · x\n\n## Itens\n- [x] a\n- [x] b\n")!;
		expect(feito).toMatchObject({ concluido: true, feitos: 2, total: 2 });
		expect(feito.atual).toBeUndefined();
		const vazio = lerPlano("Plano de estudos · x\n\n## Itens\n")!;
		expect(vazio).toMatchObject({ concluido: false, total: 0 });
		expect(vazio.atual).toBeUndefined();
	});

	it("sem a seção Itens vale a nota toda; com ela, só a seção (tarefas de outras seções e de código não contam)", () => {
		expect(lerPlano("Plano de estudos · x\n- [ ] a\n- [x] b\n")!.total).toBe(2);
		const com = lerPlano("Plano de estudos · x\n- [ ] fora\n\n## Itens\n- [ ] dentro\n\n## Outra\n- [ ] depois\n\n## Conversas\n")!;
		expect(com.itens.map((item) => item.texto)).toEqual(["dentro"]);
		const codigo = lerPlano("Plano de estudos · x\n\n## Itens\n```\n- [ ] no código\n```\n- [ ] de verdade\n")!;
		expect(codigo.itens.map((item) => item.texto)).toEqual(["de verdade"]);
	});

	it("sem objetivo, sem seção Conversas", () => {
		const plano = lerPlano("Plano de estudos · x\n\n## Itens\n- [ ] a\n")!;
		expect(plano.objetivo).toBeUndefined();
		expect(plano.conversas).toEqual([]);
	});

	it("nota sem a tag: undefined", () => {
		expect(lerPlano("- [ ] a\n")).toBeUndefined();
	});
});

describe("aplicarOperacoes", () => {
	it("marca e desmarca só a linha do item, o resto fica byte a byte igual", () => {
		const marcado = aplicar(PLANO, { tipo: "marcar", item: 2 });
		expect(marcado).toBe(PLANO.replace("- [ ] **Q2 · PCA**", "- [x] **Q2 · PCA**"));
		expect(aplicar(marcado, { tipo: "desmarcar", item: 1 })).toBe(marcado.replace("- [x] **Q1 · k-means**", "- [ ] **Q1 · k-means**"));
		// Marcar o que já está marcado não muda nada.
		expect(aplicar(PLANO, { tipo: "marcar", item: 1 })).toBe(PLANO);
	});

	it("mantém o CRLF do arquivo, inclusive na linha nova", () => {
		const crlf = comCrlf(PLANO);
		const feito = aplicar(crlf, { tipo: "marcar", item: 3 }, { tipo: "acrescentar", texto: "Q4 · embeddings" });
		expect(feito.replace(/\r\n/g, "\n")).not.toContain("\r");
		expect(feito).toBe(crlf.replace("- [ ] **Q3 · Curva ROC**", "- [x] **Q3 · Curva ROC**\r\n- [ ] Q4 · embeddings"));
	});

	it("subitens recuados nunca contam nem são mexidos", () => {
		const feito = aplicar(PLANO, { tipo: "marcar", item: 2 });
		expect(feito).toContain("  - [ ] subitem do Breno\n");
		expect(() => aplicar(PLANO, { tipo: "marcar", item: 4 })).toThrow(/não tem o item 4/);
	});

	it("o texto conferido aceita o item com ou sem marcas e rejeita outro", () => {
		expect(aplicar(PLANO, { tipo: "marcar", item: 2, texto: "q2 · pca" })).toContain("- [x] **Q2 · PCA**");
		expect(aplicar(PLANO, { tipo: "marcar", item: 2, texto: "PCA" })).toContain("- [x] **Q2 · PCA**");
		const erro = aplicarOperacoes(PLANO, [{ tipo: "marcar", item: 2, texto: "Curva ROC" }]);
		expect(erro).toEqual({ erro: expect.stringContaining('O item 2 é "**Q2 · PCA**"') });
	});

	it("item inexistente, zero e fracionário dão erro com a frase, e nada é devolvido", () => {
		for (const item of [0, 4, -1, 1.5]) {
			expect(aplicarOperacoes(PLANO, [{ tipo: "marcar", item }])).toEqual({ erro: expect.stringContaining("O plano não tem o item") });
		}
		expect(aplicarOperacoes("Plano de estudos · x\n", [{ tipo: "marcar", item: 1 }])).toEqual({ erro: "O plano não tem itens (pedi o item 1)." });
	});

	it("uma operação com erro no meio desfaz tudo (o resultado é só o erro)", () => {
		const resultado = aplicarOperacoes(PLANO, [{ tipo: "marcar", item: 2 }, { tipo: "marcar", item: 9 }]);
		expect("erro" in resultado).toBe(true);
	});

	it("acrescentar sem depois entra depois do último item e dos recuos dele, antes do resto", () => {
		const novo = aplicar(PLANO, { tipo: "acrescentar", texto: "Q4 · embeddings" });
		expect(novo).toBe(PLANO.replace("- [ ] **Q3 · Curva ROC**\n", "- [ ] **Q3 · Curva ROC**\n- [ ] Q4 · embeddings\n"));
		expect(lerPlano(novo)!.total).toBe(4);
	});

	it("acrescentar com depois: logo depois do item n e dos subitens dele", () => {
		const novo = aplicar(PLANO, { tipo: "acrescentar", texto: "Novo", depois: 2 });
		expect(novo).toBe(PLANO.replace("  uma observação recuada\n", "  uma observação recuada\n- [ ] Novo\n"));
		expect(lerPlano(novo)!.itens.map((item) => item.texto)).toEqual(["**Q1 · k-means**", "**Q2 · PCA**", "Novo", "**Q3 · Curva ROC**"]);
		const noComeco = aplicar(PLANO, { tipo: "acrescentar", texto: "Primeiro", depois: 0 });
		expect(lerPlano(noComeco)!.itens[0]!.texto).toBe("Primeiro");
		expect(() => aplicar(PLANO, { tipo: "acrescentar", texto: "x", depois: 7 })).toThrow(/não tem o item 7/);
	});

	it("as operações numeram na ordem em que são aplicadas", () => {
		const novo = aplicar(PLANO, { tipo: "acrescentar", texto: "Novo", depois: 1 }, { tipo: "marcar", item: 2 });
		expect(lerPlano(novo)!.itens.map((item) => [item.texto, item.feito])).toEqual([
			["**Q1 · k-means**", true],
			["Novo", true],
			["**Q2 · PCA**", false],
			["**Q3 · Curva ROC**", false],
		]);
	});

	it("acrescentar num plano sem itens: depois do cabeçalho Itens, ou numa seção nova no fim", () => {
		const vazio = "Plano de estudos · x\n\n## Itens\n\n## Conversas\n";
		expect(aplicar(vazio, { tipo: "acrescentar", texto: "a" })).toBe("Plano de estudos · x\n\n## Itens\n- [ ] a\n\n## Conversas\n");
		expect(aplicar("Plano de estudos · x", { tipo: "acrescentar", texto: "a" })).toBe("Plano de estudos · x\n\n## Itens\n- [ ] a\n");
	});

	it("arquivo sem fim de linha no fim: a última linha ganha um e a nova fica sem, como estava o fim", () => {
		const semFim = "Plano de estudos · x\n\n## Itens\n- [ ] a";
		expect(aplicar(semFim, { tipo: "acrescentar", texto: "b" })).toBe("Plano de estudos · x\n\n## Itens\n- [ ] a\n- [ ] b");
	});

	it("texto novo vazio, comprido demais ou com o plano cheio: erro; marcador e quebras são limpos", () => {
		expect(aplicarOperacoes(PLANO, [{ tipo: "acrescentar", texto: "  \n " }])).toEqual({ erro: expect.stringContaining("vazio") });
		expect(aplicarOperacoes(PLANO, [{ tipo: "acrescentar", texto: "x".repeat(LIMITE_TEXTO_ITEM + 1) }])).toEqual({ erro: expect.stringContaining("passa de 300") });
		expect(aplicar(PLANO, { tipo: "acrescentar", texto: "x".repeat(LIMITE_TEXTO_ITEM) })).toContain("x".repeat(LIMITE_TEXTO_ITEM));
		expect(aplicar(PLANO, { tipo: "acrescentar", texto: "- [ ] com\nquebra" })).toContain("\n- [ ] com quebra\n");
		const cheio = `Plano de estudos · x\n\n## Itens\n${Array.from({ length: LIMITE_ITENS_PLANO }, (_, i) => `- [ ] ${i}`).join("\n")}\n`;
		expect(aplicarOperacoes(cheio, [{ tipo: "acrescentar", texto: "mais um" }])).toEqual({ erro: expect.stringContaining("máximo") });
	});

	it("nota que não é plano é recusada", () => {
		expect(aplicarOperacoes("- [ ] a\n", [{ tipo: "marcar", item: 1 }])).toEqual({ erro: expect.stringContaining("não é um plano de estudos") });
	});
});

describe("acrescentarConversa", () => {
	it("acrescenta depois da última conversa, no fim de linha do arquivo", () => {
		const novo = acrescentarConversa(PLANO, "def67890", "25/11/2026");
		expect(novo).toBe(PLANO.replace("(conversa:abc12345)\n", "(conversa:abc12345)\n- [25/11/2026](conversa:def67890)\n"));
		expect(lerPlano(novo)!.conversas).toEqual(["abc12345", "def67890"]);
		const crlf = acrescentarConversa(comCrlf(PLANO), "def67890", "25/11/2026");
		expect(crlf).toBe(comCrlf(PLANO).replace("(conversa:abc12345)\r\n", "(conversa:abc12345)\r\n- [25/11/2026](conversa:def67890)\r\n"));
	});

	it("se o id já está lá, devolve igual", () => {
		expect(acrescentarConversa(PLANO, "abc12345", "25/11/2026")).toBe(PLANO);
	});

	it("seção vazia, seção que falta e arquivo sem fim de linha", () => {
		expect(acrescentarConversa("Plano de estudos · x\n\n## Itens\n- [ ] a\n\n## Conversas\n", "i1", "01/01/2026")).toBe(
			"Plano de estudos · x\n\n## Itens\n- [ ] a\n\n## Conversas\n- [01/01/2026](conversa:i1)\n",
		);
		expect(acrescentarConversa("Plano de estudos · x\n\n## Itens\n- [ ] a\n", "i1", "01/01/2026")).toBe(
			"Plano de estudos · x\n\n## Itens\n- [ ] a\n\n## Conversas\n- [01/01/2026](conversa:i1)\n",
		);
		expect(acrescentarConversa("Plano de estudos · x\n## Conversas", "i1", "01/01/2026")).toBe("Plano de estudos · x\n## Conversas\n- [01/01/2026](conversa:i1)");
	});

	it("o id em outra seção não conta como já ligado", () => {
		const texto = "Plano de estudos · x\n\n## Itens\n- [ ] ver (conversa:i1)\n\n## Conversas\n";
		expect(lerPlano(acrescentarConversa(texto, "i1", "01/01/2026"))!.conversas).toEqual(["i1"]);
	});
});

describe("montarPlano", () => {
	const em = new Date(2026, 10, 24, 15, 30);

	it("a tag com a data local, o objetivo, os itens e a seção Conversas vazia", () => {
		const texto = montarPlano({ objetivo: "prova final", itens: ["Q1", "Q2"], em });
		expect(texto).toBe("Plano de estudos · criado em 24/11/2026\n**Objetivo:** prova final\n\n## Itens\n- [ ] Q1\n- [ ] Q2\n\n## Conversas\n");
		expect(ehPlanoDeEstudos(texto)).toBe(true);
		expect(lerPlano(texto)).toMatchObject({ objetivo: "prova final", total: 2, feitos: 0, atual: 1, conversas: [] });
	});

	it("sem objetivo; itens limpos de quebras e marcadores", () => {
		const texto = montarPlano({ itens: ["- [ ] com\nquebra", "  outro  "], em });
		expect(texto).toBe("Plano de estudos · criado em 24/11/2026\n\n## Itens\n- [ ] com quebra\n- [ ] outro\n\n## Conversas\n");
	});

	it("a data do dia 5 do mês 3 tem dois dígitos", () => {
		expect(montarPlano({ itens: ["a"], em: new Date(2026, 2, 5) }).startsWith("Plano de estudos · criado em 05/03/2026\n")).toBe(true);
	});

	it("a prévia da lista não mostra a linha da tag", () => {
		expect(previaDaNota(montarPlano({ objetivo: "prova final", itens: ["Q1"], em }))).toBe("Objetivo: prova final Itens Q1 Conversas");
	});
});

describe("resumoParaProfessor", () => {
	const plano = lerPlano(PLANO) as PlanoLido;

	it("título, objetivo, itens numerados, o atual e a regra", () => {
		const texto = resumoParaProfessor("Prova final", plano);
		expect(texto).toContain('Esta conversa segue o plano de estudos "Prova final" (uma nota do caderno).');
		expect(texto).toContain("Objetivo: prova final de 26/11");
		expect(texto).toContain("1. [x] **Q1 · k-means**\n2. [ ] **Q2 · PCA** (atual)\n3. [ ] **Q3 · Curva ROC**");
		expect(texto).toContain("marque com atualizar_plano");
		expect(texto).toContain("ler_plano");
	});

	it("concluído: sem item atual e a regra diz que acabou", () => {
		const feito = lerPlano("Plano de estudos · x\n\n## Itens\n- [x] a\n")!;
		const texto = resumoParaProfessor("P", feito);
		expect(texto).not.toContain("(atual)");
		expect(texto).toContain("Todos os itens estão marcados");
	});

	it("itens longos são cortados e o resumo cabe em 2000 caracteres", () => {
		const itens = Array.from({ length: LIMITE_ITENS_PLANO }, (_, i) => `- [ ] ${i}: ${"assunto muito longo ".repeat(15)}`).join("\n");
		const grande = lerPlano(`Plano de estudos · x\n**Objetivo:** ${"o".repeat(800)}\n\n## Itens\n${itens}\n`)!;
		const texto = resumoParaProfessor("Plano enorme", grande);
		expect(texto.length).toBeLessThanOrEqual(LIMITE_RESUMO_PLANO);
		expect(texto).toContain("1. [ ]");
		expect(texto).toContain("(atual)");
		expect(texto).toContain("ler_plano");
	});

	it("itens que não cabem nem curtos: corta do fim, mas mantém o atual", () => {
		const feitos = Array.from({ length: 30 }, (_, i) => `- [x] feito ${i}`);
		const faltam = Array.from({ length: 30 }, (_, i) => `- [ ] falta ${i} ${"x".repeat(250)}`);
		const grande = lerPlano(`Plano de estudos · x\n\n## Itens\n${[...feitos, ...faltam].join("\n")}\n`)!;
		const texto = resumoParaProfessor("P", grande);
		expect(texto.length).toBeLessThanOrEqual(LIMITE_RESUMO_PLANO);
		expect(texto).toContain("31. [ ]");
		expect(texto).toContain("(atual)");
	});
});

describe("planoSeguido", () => {
	const entrada = (titulo: unknown, tipo = TIPO_ENTRADA_PLANO) => ({ type: "custom", customType: tipo, data: { titulo } });

	it("vale a última entrada do ramo; null solta", () => {
		expect(planoSeguido([])).toBeUndefined();
		expect(planoSeguido([entrada("A")])).toBe("A");
		expect(planoSeguido([entrada("A"), entrada("B")])).toBe("B");
		expect(planoSeguido([entrada("A"), entrada(null)])).toBeUndefined();
		expect(planoSeguido([entrada("A"), entrada(null), entrada("C")])).toBe("C");
	});

	it("ignora outros tipos de entrada e de mensagem, e dados sem título", () => {
		expect(planoSeguido([entrada("A"), entrada("Z", "nucleo.contexto"), { type: "message", customType: TIPO_ENTRADA_PLANO, data: { titulo: "Y" } }])).toBe("A");
		expect(planoSeguido([entrada("A"), { type: "custom", customType: TIPO_ENTRADA_PLANO }])).toBeUndefined();
		expect(planoSeguido([entrada(""), entrada(7)])).toBeUndefined();
	});
});
