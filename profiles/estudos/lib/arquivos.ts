/**
 * Gravação de arquivos do perfil que aguenta o Windows.
 *
 * O perfil grava "escrito ao lado e renomeado" para nunca deixar um arquivo
 * pela metade. No Windows, porém, o rename por cima de um arquivo falha com
 * EPERM (às vezes EBUSY ou EACCES) quando outro processo está com o destino
 * aberto para leitura naquele instante: num teste, 1201 de 2000 renames com
 * leitura simultânea falharam. A pasta de dados fica no Google Drive (G:),
 * onde o Drive, o antivírus e o próprio app leem os arquivos a todo momento,
 * então a falha é passageira e some se tentarmos de novo logo depois.
 *
 * Só Node, sem dependências: o pi carrega esta lib.
 */

import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Erros que o Windows dá quando o arquivo está ocupado por um instante. */
const ERROS_PASSAGEIROS = new Set(["EPERM", "EBUSY", "EACCES"]);

/**
 * Esperas entre as tentativas: 10 ms dobrando até 100 ms e depois 100 ms
 * fixos, somando uns 3 s (34 tentativas). Esperas curtas e muitas tentativas,
 * e não poucas e longas: quem lê segura o arquivo por pouco tempo, e com um
 * leitor sem pausa cerca de metade das tentativas ainda bate numa leitura, de
 * modo que o que salva é tentar de novo muitas vezes nas brechas entre elas.
 */
export const ESPERAS_PADRAO: readonly number[] = [10, 20, 40, 80, ...Array<number>(29).fill(100)];

export interface OpcoesRenomear {
	/** O rename usado (os testes trocam por um falso). */
	renomear?: (de: string, para: string) => Promise<void>;
	/** A espera entre as tentativas (os testes trocam por uma instantânea). */
	esperar?: (ms: number) => Promise<void>;
	/** As esperas entre as tentativas; o número de tentativas é uma a mais. */
	esperas?: readonly number[];
}

/** Espera de verdade, sorteada entre metade e uma vez e meia o pedido, para não cair sempre no mesmo passo de quem lê. */
const esperarDeVerdade = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms * (0.5 + Math.random())));

/**
 * Renomeia `de` para `para`. Em EPERM, EBUSY ou EACCES espera e tenta de novo;
 * outros erros sobem na hora; esgotadas as tentativas, sobe o último erro.
 */
export async function renomearComInsistencia(de: string, para: string, opcoes: OpcoesRenomear = {}): Promise<void> {
	const renomear = opcoes.renomear ?? rename;
	const esperar = opcoes.esperar ?? esperarDeVerdade;
	const esperas = opcoes.esperas ?? ESPERAS_PADRAO;
	for (let tentativa = 0; ; tentativa++) {
		try {
			await renomear(de, para);
			return;
		} catch (erro) {
			const codigo = (erro as NodeJS.ErrnoException).code;
			if (!codigo || !ERROS_PASSAGEIROS.has(codigo) || tentativa >= esperas.length) throw erro;
			await esperar(esperas[tentativa]!);
		}
	}
}

/**
 * Grava o arquivo de uma vez: escreve num temporário escondido ao lado (com o
 * pid e um sufixo aleatório, para dois gravadores não se pisarem) e o renomeia
 * por cima com insistência. Se o rename falhar de vez, apaga o temporário
 * antes de subir o erro.
 */
export async function gravarDeUmaVez(arquivo: string, conteudo: string, opcoes: OpcoesRenomear = {}): Promise<void> {
	const temporario = join(dirname(arquivo), `.${basename(arquivo)}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
	try {
		await writeFile(temporario, conteudo, "utf8");
		await renomearComInsistencia(temporario, arquivo, opcoes);
	} catch (erro) {
		await rm(temporario, { force: true }).catch(() => {});
		throw erro;
	}
}
