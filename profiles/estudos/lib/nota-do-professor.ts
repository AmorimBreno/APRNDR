// A nota que o professor cria com criar_nota (parte D da mesa; docs/mesa-parte-d.md, seção 1).
// O arquivo é a nota comum (docs/notas-formato.md) com uma primeira linha de marca, que liga a
// nota à conversa em que nasceu, e uma linha em branco antes do conteúdo:
//
//     Nota do professor · [conversa de 11/11/2026](conversa:abc12345)
//
//     # Conteúdo da nota…
//
// A marca é lida por ehNotaDoProfessor (nota-tipos.ts). O hash (sha256 do arquivo como foi
// gravado) vai no evento criou_nota_do_professor; o Desfazer só apaga a nota se o arquivo ainda
// tem esse hash, isto é, se o Breno não mexeu nela. Só Node (crypto): o pi carrega esta lib.

import { createHash } from "node:crypto";
import { idCurtoDaConversa } from "./trecho-guardado.ts";
import { INICIO_MARCA_PROFESSOR } from "./nota-tipos.ts";

/** Até quantos caracteres o conteúdo de uma nota criada pelo professor pode ter. */
export const LIMITE_NOTA_DO_PROFESSOR = 100_000;

const doisDigitos = (numero: number) => String(numero).padStart(2, "0");

/** A primeira linha da nota: a marca e o link da conversa (a data é a local, dd/mm/aaaa). */
export function linhaDaMarca(sessao: string, em: Date): string {
	const data = `${doisDigitos(em.getDate())}/${doisDigitos(em.getMonth() + 1)}/${em.getFullYear()}`;
	return `${INICIO_MARCA_PROFESSOR}[conversa de ${data}](conversa:${idCurtoDaConversa(sessao)})`;
}

/**
 * O arquivo inteiro da nota: a marca, uma linha em branco e o conteúdo (sem linhas em branco no
 * começo nem espaço no fim), terminando numa quebra de linha. O que vem daqui é o que se grava, byte a byte.
 */
export function montarNotaDoProfessor(entrada: { conteudo: string; sessao: string; em: Date }): string {
	const corpo = entrada.conteudo.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();
	const marca = linhaDaMarca(entrada.sessao, entrada.em);
	return corpo === "" ? `${marca}\n` : `${marca}\n\n${corpo}\n`;
}

/** O sha256 (hexadecimal) dos bytes do arquivo; um texto vale como os seus bytes em UTF-8. */
export const hashDoArquivo = (arquivo: string | Uint8Array) => createHash("sha256").update(arquivo).digest("hex");

/** O arquivo continua igual ao que foi gravado (os bytes dão o mesmo hash). */
export const arquivoContinuaIgual = (arquivo: string | Uint8Array, hash: string) => hashDoArquivo(arquivo) === hash;
