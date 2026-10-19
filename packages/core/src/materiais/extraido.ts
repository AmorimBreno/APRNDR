// O .extraido: o que a extração tirou de cada arquivo, gravado ao lado dos
// materiais, em markdown legível (ESPECIFICACAO 7). Para cada pasta
// observada <x>/materiais, o extraído de <x>/materiais/<caminho> fica em
// <x>/.extraido/<caminho>/: um .md por trecho (pagina-012.md, celula-003.md,
// trecho-004.md), com um cabeçalho de origem, e o manifesto.json com o hash
// do arquivo, o custo e a lista de trechos. O índice (indice.ts) é montado a
// partir daqui e pode ser apagado: as descrições da visão não se perdem.

import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Extracao, TipoMaterial, Trecho } from "./tipos.ts";

export const PASTA_EXTRAIDO = ".extraido";
export const ARQUIVO_MANIFESTO = "manifesto.json";

/** Muda quando o formato do .extraido mudar. */
export const VERSAO_EXTRAIDO = 1;

export interface Manifesto {
	versao: number;
	/** Caminho do arquivo dentro da pasta observada, com barras normais ("aula-04.pdf", "listas/l1.py"). */
	arquivo: string;
	hash: string;
	tamanho: number;
	/** Data de modificação do arquivo (ms): igual a esta e ao tamanho, o arquivo não mudou e nem precisa do hash. */
	mtimeMs?: number;
	tipo: TipoMaterial;
	/** ISO 8601. */
	extraidoEm: string;
	/** US$ gastos com a visão. */
	custo: number;
	avisos: string[];
	trechos: Array<Omit<Trecho, "texto">>;
}

/** A pasta do extraído de `relativo` (caminho dentro da pasta observada). */
export function pastaDoExtraido(pastaObservada: string, relativo: string): string {
	return join(dirname(pastaObservada), PASTA_EXTRAIDO, ...relativo.split("/"));
}

function cabecalho(arquivo: string, trecho: Omit<Trecho, "texto">): string {
	const linhas = [`arquivo: ${arquivo}`, `local: ${trecho.local}`, `origem: ${trecho.origem}`];
	if (trecho.modelo) linhas.push(`modelo: ${trecho.modelo}`);
	return `---\n${linhas.join("\n")}\n---\n\n`;
}

/** O texto do .md, sem o cabeçalho. */
export function corpoDoTrecho(conteudo: string): string {
	const achado = /^---\n[\s\S]*?\n---\n\n?/.exec(conteudo.replace(/\r\n/g, "\n"));
	return (achado ? conteudo.replace(/\r\n/g, "\n").slice(achado[0].length) : conteudo).trimEnd();
}

/**
 * Grava o extraído: os .md dos trechos, apaga os .md que sobraram de uma
 * extração anterior e grava o manifesto por último (escrito ao lado e
 * renomeado), para um manifesto nunca apontar para trechos pela metade.
 */
export async function gravarExtraido(
	pasta: string,
	dados: { arquivo: string; hash: string; tamanho: number; mtimeMs?: number; extracao: Extracao; agora?: Date },
): Promise<Manifesto> {
	await mkdir(pasta, { recursive: true });
	const nomes = new Set<string>();
	for (const trecho of dados.extracao.trechos) {
		const { texto, ...semTexto } = trecho;
		nomes.add(`${trecho.nome}.md`);
		await writeFile(join(pasta, `${trecho.nome}.md`), `${cabecalho(basename(dados.arquivo), semTexto)}${texto}\n`, "utf8");
	}
	for (const nome of await readdir(pasta)) {
		if (nome.endsWith(".md") && !nomes.has(nome)) await rm(join(pasta, nome), { force: true });
	}
	const manifesto: Manifesto = {
		versao: VERSAO_EXTRAIDO,
		arquivo: dados.arquivo,
		hash: dados.hash,
		tamanho: dados.tamanho,
		...(dados.mtimeMs === undefined ? {} : { mtimeMs: dados.mtimeMs }),
		tipo: dados.extracao.tipo,
		extraidoEm: (dados.agora ?? new Date()).toISOString(),
		custo: dados.extracao.custo,
		avisos: dados.extracao.avisos,
		trechos: dados.extracao.trechos.map(({ texto: _texto, ...resto }) => resto),
	};
	await gravarManifesto(pasta, manifesto);
	return manifesto;
}

/** Grava o manifesto de uma vez (escrito ao lado e renomeado). */
export async function gravarManifesto(pasta: string, manifesto: Manifesto): Promise<void> {
	const destino = join(pasta, ARQUIVO_MANIFESTO);
	const temporario = `${destino}.${process.pid}.tmp`;
	await writeFile(temporario, `${JSON.stringify(manifesto, null, "\t")}\n`, "utf8");
	await rename(temporario, destino);
}

/** O manifesto, ou undefined se não houver (ou estiver ilegível: o arquivo é processado de novo). */
export async function lerManifesto(pasta: string): Promise<Manifesto | undefined> {
	try {
		const manifesto = JSON.parse(await readFile(join(pasta, ARQUIVO_MANIFESTO), "utf8")) as Manifesto;
		return typeof manifesto.hash === "string" && Array.isArray(manifesto.trechos) ? manifesto : undefined;
	} catch {
		return undefined;
	}
}

/** Os trechos com o texto, lidos dos .md (um .md que sumiu vira texto vazio). */
export async function lerTrechos(pasta: string, manifesto: Manifesto): Promise<Trecho[]> {
	const trechos: Trecho[] = [];
	for (const trecho of manifesto.trechos) {
		let texto = "";
		try {
			texto = corpoDoTrecho(await readFile(join(pasta, `${trecho.nome}.md`), "utf8"));
		} catch {
			// some .md apagado à mão: o trecho fica sem texto até o arquivo ser processado de novo
		}
		trechos.push({ ...trecho, texto });
	}
	return trechos;
}

export async function apagarExtraido(pasta: string): Promise<void> {
	await rm(pasta, { recursive: true, force: true });
}
