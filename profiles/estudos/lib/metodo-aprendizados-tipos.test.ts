// Testes do que facilita para o Breno (docs/metodo-experimentos.md, "O que
// facilita"): ler e escrever aprendizados.md (observado, confirmado e
// contradito, o texto editado à mão preservado, o arquivo que não se lê dando
// erro), registrar e rever, e o bloco <o-que-facilita> das gerações.

import { describe, expect, it } from "vitest";
import {
	acrescentarAprendizado,
	aprendizadosNaTela,
	aprendizadosQueEntram,
	aprendizadosVazios,
	blocoOQueFacilita,
	comentarioDoAprendizado,
	escreverAprendizadosMarkdown,
	FRASE_O_QUE_FACILITA,
	lerAprendizadosMarkdown,
	mudarSituacaoDoAprendizado,
	validarTextoDoAprendizado,
} from "./metodo-aprendizados-tipos.ts";
import { ErroMetodo } from "./metodo-ciclo-tipos.ts";

const CANONICO = [
	"# O que facilita para o Breno",
	"",
	"## ap-20261103-1 · observado",
	"Exemplos concretos antes da definição deixaram o entendimento mais alto.",
	"<!-- origem: mat/curso-a/m2 · evidências: ev-1, ev-2 · registrado em 2026-11-03 -->",
	"",
	"## ap-20261103-2 · confirmado",
	"Blocos curtos funcionam.",
	"",
	"- E uma lista.",
	"",
	"## ap-20261103-3 · contradito",
	"Tabelas ajudam.",
	"<!-- origem: mat/curso-a/m3 · evidências: ev-9 · registrado em 2026-11-04 -->",
	"",
].join("\n");

describe("aprendizados.md em markdown", () => {
	it("lê e escreve o formato do contrato, ida e volta", () => {
		const lido = lerAprendizadosMarkdown(CANONICO);
		expect(lido.titulo).toBe("O que facilita para o Breno");
		expect(lido.aprendizados.map((item) => [item.id, item.situacao])).toEqual([
			["ap-20261103-1", "observado"],
			["ap-20261103-2", "confirmado"],
			["ap-20261103-3", "contradito"],
		]);
		expect(lido.aprendizados[1]).toEqual({ id: "ap-20261103-2", situacao: "confirmado", texto: "Blocos curtos funcionam.\n\n- E uma lista.", comentario: null });
		expect(escreverAprendizadosMarkdown(lido)).toBe(CANONICO);
		expect(lerAprendizadosMarkdown(escreverAprendizadosMarkdown(lido))).toEqual(lido);
		expect(escreverAprendizadosMarkdown(aprendizadosVazios())).toBe("# O que facilita para o Breno\n");
		expect(lerAprendizadosMarkdown("")).toEqual(aprendizadosVazios());
	});

	it("o texto editado à mão é preservado (CRLF, caixa, separador, título trocado)", () => {
		const aMao = "# Meu título\r\n\r\n## ap-1 - Observado\r\nTexto   com   espaços\r\n\r\n## outro | CONFIRMADO\r\nEscrito à mão.\r\n";
		const lido = lerAprendizadosMarkdown(aMao);
		expect(lido.titulo).toBe("Meu título");
		expect(lido.aprendizados).toEqual([
			{ id: "ap-1", situacao: "observado", texto: "Texto   com   espaços", comentario: null },
			{ id: "outro", situacao: "confirmado", texto: "Escrito à mão.", comentario: null },
		]);
		expect(escreverAprendizadosMarkdown(lido)).toBe("# Meu título\n\n## ap-1 · observado\nTexto   com   espaços\n\n## outro · confirmado\nEscrito à mão.\n");
	});

	it("um arquivo que não se lê dá erro com a linha (e os estados dos ajustes não valem aqui)", () => {
		const casos: Array<[string, RegExp]> = [
			["Uma nota solta.", /linha 1 tem texto fora de um aprendizado/],
			["## ap-1 · em teste\nTexto.", /linha 1 não está no formato "## <id> · observado" \(ou "· confirmado" ou "· contradito"\)/],
			["## ap-1 · ativo\nTexto.", /linha 1 não está no formato/],
			["## ap-1 · observado\nTexto.\n## ap-1 · observado\nOutro.", /"ap-1" se repete/],
			["## ap-1 · observado\n\n<!-- x -->", /o aprendizado ap-1 \(linha 1\) está sem texto/],
			["## ap-1 · observado\nTexto.\n<!-- sem fim", /não fecha na mesma linha/],
		];
		for (const [texto, erro] of casos) expect(() => lerAprendizadosMarkdown(texto)).toThrow(erro);
	});
});

describe("registrar e rever", () => {
	const agora = new Date(2026, 10, 3, 15, 0, 0);

	it("registra observado no fim, com o id ap-AAAAMMDD-N e a origem; o recebido não muda", () => {
		const inicio = aprendizadosVazios();
		const comentario = comentarioDoAprendizado({ materia: "mat", curso: "curso-a", modulo: "m2", evidencias: ["ev-1", "ev-2"], em: "2026-11-03" });
		expect(comentario).toBe("origem: mat/curso-a/m2 · evidências: ev-1, ev-2 · registrado em 2026-11-03");
		const primeiro = acrescentarAprendizado(inicio, { texto: "  Exemplos primeiro.  ", comentario, agora });
		expect(inicio.aprendizados).toHaveLength(0);
		expect(primeiro.aprendizado).toEqual({ id: "ap-20261103-1", situacao: "observado", texto: "Exemplos primeiro.", comentario });
		const segundo = acrescentarAprendizado(primeiro.conteudo, { texto: "Blocos curtos.", comentario: null, agora });
		expect(segundo.aprendizado.id).toBe("ap-20261103-2");
		expect(segundo.conteudo.aprendizados.map((item) => item.id)).toEqual(["ap-20261103-1", "ap-20261103-2"]);
		expect(() => acrescentarAprendizado(inicio, { texto: "## x", comentario: null, agora })).toThrow(ErroMetodo);
		expect(() => acrescentarAprendizado(inicio, { texto: "x".repeat(301), comentario: null, agora })).toThrow(/o máximo é 300/);
		expect(() => validarTextoDoAprendizado("a --> b")).toThrow(/-->/);
		expect(() => validarTextoDoAprendizado("  ")).toThrow(/vazio/);
	});

	it("rever muda a situação; sem mudança, mudou é false; um id que não existe é erro", () => {
		const lido = lerAprendizadosMarkdown(CANONICO);
		const confirmado = mudarSituacaoDoAprendizado(lido, "ap-20261103-1", "confirmado");
		expect(confirmado.mudou).toBe(true);
		expect(confirmado.aprendizado.situacao).toBe("confirmado");
		expect(lido.aprendizados[0]!.situacao).toBe("observado");
		expect(mudarSituacaoDoAprendizado(confirmado.conteudo, "ap-20261103-1", "confirmado").mudou).toBe(false);
		expect(() => mudarSituacaoDoAprendizado(lido, "ap-9", "contradito")).toThrow('Não achei o aprendizado "ap-9" em aprendizados.md.');
	});

	it("os aprendizados na tela levam a situação e a origem", () => {
		expect(aprendizadosNaTela(lerAprendizadosMarkdown(CANONICO))).toEqual([
			{ id: "ap-20261103-1", texto: "Exemplos concretos antes da definição deixaram o entendimento mais alto.", situacao: "observado", origem: { materia: "mat", curso: "curso-a", modulo: "m2", proposta: null, evidencias: ["ev-1", "ev-2"], em: "2026-11-03", reescritaDe: null, substituidoPor: null } },
			{ id: "ap-20261103-2", texto: "Blocos curtos funcionam.\n\n- E uma lista.", situacao: "confirmado", origem: null },
			{ id: "ap-20261103-3", texto: "Tabelas ajudam.", situacao: "contradito", origem: { materia: "mat", curso: "curso-a", modulo: "m3", proposta: null, evidencias: ["ev-9"], em: "2026-11-04", reescritaDe: null, substituidoPor: null } },
		]);
	});
});

describe("o bloco <o-que-facilita>", () => {
	const lista = (n: number, situacao = "observado" as const) => ({
		aprendizados: Array.from({ length: n }, (_, i) => ({ id: `ap-${i + 1}`, situacao, texto: `Aprendizado ${i + 1}.`, comentario: null })),
	});

	it("só observado e confirmado entram, na ordem do arquivo; contradito fica de fora; sem nenhum, vazio", () => {
		const conteudo = lerAprendizadosMarkdown(CANONICO);
		expect(aprendizadosQueEntram(conteudo).map((item) => item.id)).toEqual(["ap-20261103-1", "ap-20261103-2"]);
		expect(blocoOQueFacilita(conteudo)).toBe(
			`<o-que-facilita>\n${FRASE_O_QUE_FACILITA}\n\n- Exemplos concretos antes da definição deixaram o entendimento mais alto.\n- Blocos curtos funcionam.\n  \n  - E uma lista.\n</o-que-facilita>`,
		);
		expect(blocoOQueFacilita(aprendizadosVazios())).toBe("");
		expect(blocoOQueFacilita({ aprendizados: [{ id: "ap-1", situacao: "contradito", texto: "Nada.", comentario: null }] })).toBe("");
		expect(FRASE_O_QUE_FACILITA).toBe("O que já se observou que facilita o aprendizado do Breno. Use como orientação, não como regra.");
	});

	it("no máximo os 10 mais recentes (os últimos do arquivo)", () => {
		const entram = aprendizadosQueEntram(lista(12));
		expect(entram).toHaveLength(10);
		expect(entram[0]!.id).toBe("ap-3");
		expect(entram.at(-1)!.id).toBe("ap-12");
		const bloco = blocoOQueFacilita(lista(12));
		expect(bloco).not.toContain("Aprendizado 2.");
		expect(bloco).toContain("- Aprendizado 3.");
		expect(bloco.match(/^- /gm)).toHaveLength(10);
		expect(blocoOQueFacilita(lista(12), 2)).toContain("- Aprendizado 11.\n- Aprendizado 12.\n");
	});
});
