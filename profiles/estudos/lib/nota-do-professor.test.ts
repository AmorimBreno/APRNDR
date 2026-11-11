// Testes da nota do professor (a marca, o hash) e da leitura da marca em nota-tipos.ts.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { arquivoContinuaIgual, hashDoArquivo, linhaDaMarca, montarNotaDoProfessor } from "./nota-do-professor.ts";
import { ehNotaDoProfessor, previaDaNota } from "./nota-tipos.ts";
import { idCurtoDaConversa } from "./trecho-guardado.ts";

const SESSAO = "0192f8a0-7b3c-7d4e-8a1f-123456789abc";
const EM = new Date(2026, 10, 11, 15, 30);
const MARCA = `Nota do professor · [conversa de 11/11/2026](conversa:${idCurtoDaConversa(SESSAO)})`;

describe("montarNotaDoProfessor", () => {
	it("a marca na primeira linha, uma linha em branco e o conteúdo, terminando em quebra de linha", () => {
		expect(linhaDaMarca(SESSAO, EM)).toBe(MARCA);
		expect(montarNotaDoProfessor({ conteudo: "# Limites\n\nTexto.", sessao: SESSAO, em: EM })).toBe(`${MARCA}\n\n# Limites\n\nTexto.\n`);
	});

	it("tira linhas em branco do começo e espaço do fim, e normaliza o fim de linha", () => {
		expect(montarNotaDoProfessor({ conteudo: "\n  \r\n# A\r\nb  \n\n\n", sessao: SESSAO, em: EM })).toBe(`${MARCA}\n\n# A\nb\n`);
	});

	it("o arquivo montado é lido como nota do professor", () => {
		expect(ehNotaDoProfessor(montarNotaDoProfessor({ conteudo: "x", sessao: SESSAO, em: EM }))).toBe(true);
	});
});

describe("hash do arquivo", () => {
	it("é o sha256 dos bytes; um texto vale pelo UTF-8 e mudar um byte muda o hash", () => {
		const texto = `${MARCA}\n\nação\n`;
		const esperado = createHash("sha256").update(Buffer.from(texto, "utf8")).digest("hex");
		expect(hashDoArquivo(texto)).toBe(esperado);
		expect(hashDoArquivo(Buffer.from(texto, "utf8"))).toBe(esperado);
		expect(arquivoContinuaIgual(Buffer.from(texto, "utf8"), esperado)).toBe(true);
		expect(arquivoContinuaIgual(`${texto} `, esperado)).toBe(false);
	});
});

describe("ehNotaDoProfessor", () => {
	it("vale para a primeira linha não vazia com a marca e o link conversa:", () => {
		expect(ehNotaDoProfessor(`${MARCA}\n\ntexto`)).toBe(true);
		expect(ehNotaDoProfessor(`\n  \n${MARCA}\n`)).toBe(true);
		expect(ehNotaDoProfessor(`﻿${MARCA}\r\n\r\ntexto`)).toBe(true);
	});

	it("não vale sem a marca, sem o link, fora da primeira linha ou com a marca no meio da linha", () => {
		expect(ehNotaDoProfessor("")).toBe(false);
		expect(ehNotaDoProfessor("   \n\n")).toBe(false);
		expect(ehNotaDoProfessor("# Limites\n\ntexto")).toBe(false);
		expect(ehNotaDoProfessor("Nota do professor · sem link\n\ntexto")).toBe(false);
		expect(ehNotaDoProfessor("Nota do professor · [conversa](https://x.com)\n")).toBe(false);
		expect(ehNotaDoProfessor(`Antes\n${MARCA}\n`)).toBe(false);
		expect(ehNotaDoProfessor(`> ${MARCA}\n`)).toBe(false);
		expect(ehNotaDoProfessor(`Nota do professor: [conversa de 11/11/2026](conversa:abc12345)`)).toBe(false);
	});

	it("se o Breno apaga a linha, a nota deixa de ser do professor", () => {
		const nota = montarNotaDoProfessor({ conteudo: "# Resumo\n\ntexto", sessao: SESSAO, em: EM });
		expect(ehNotaDoProfessor(nota.split("\n").slice(2).join("\n"))).toBe(false);
	});
});

describe("previaDaNota com a marca", () => {
	it("a prévia da nota do professor começa depois da linha da marca", () => {
		const nota = montarNotaDoProfessor({ conteudo: "# Resumo de limites\n\nO limite **existe**.", sessao: SESSAO, em: EM });
		expect(previaDaNota(nota)).toBe("Resumo de limites O limite existe.");
		expect(previaDaNota(`${MARCA}\n`)).toBe("");
	});

	it("a mesma linha numa nota que não é do professor continua na prévia (o link vira só o texto)", () => {
		expect(previaDaNota(`Antes\n${MARCA}`)).toContain("conversa de 11/11/2026");
	});
});
