// O mapa de conteúdo no disco (item 4.4, docs/mapa-conteudo.md): o
// materias/<id>/mapa-conteudo.json, os arquivos pendentes (os manifestos do
// .extraido da matéria cujo hash o mapa ainda não tem), os trechos que vão
// para o modelo e os eventos do mapa no eventos.jsonl da matéria. As regras
// (fusão, operações, aprovação) são puras e ficam em mapa-tipos.ts. Sem
// dependências: o pi carrega a extensão desta pasta.

import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gravarDeUmaVez } from "./arquivos.ts";
import { acrescentarEvento, criarEvento } from "./eventos.ts";
import { type Conceito, ErroMapa, LIMITE_PARTE, type MapaConteudo, mapaVazio, type TipoOperacao, type TrechoDoArquivo, VERSAO_MAPA } from "./mapa-tipos.ts";
import { eventosMateria, pastaMateria } from "./materias.ts";

export * from "./mapa-tipos.ts";

export const caminhoDoMapa = (dados: string, materia: string) => join(pastaMateria(dados, materia), "mapa-conteudo.json");
/** A pasta do .extraido da matéria (o serviço de materiais do núcleo grava ao lado de materiais/). */
export const pastaExtraidoMateria = (dados: string, materia: string) => join(pastaMateria(dados, materia), ".extraido");
/** A pasta do extraído de um arquivo (caminho dentro de materiais/, com barras normais). */
export const pastaExtraidoArquivo = (dados: string, materia: string, arquivo: string) => join(pastaExtraidoMateria(dados, materia), ...arquivo.split("/"));

function ehMapa(valor: unknown): valor is MapaConteudo {
	const mapa = valor as Partial<MapaConteudo> | null;
	return (
		typeof mapa === "object" &&
		mapa !== null &&
		mapa.versao === VERSAO_MAPA &&
		(mapa.situacao === "rascunho" || mapa.situacao === "aprovado" || mapa.situacao === "alterado") &&
		Array.isArray(mapa.conceitos) &&
		typeof mapa.arquivos === "object" &&
		mapa.arquivos !== null &&
		!Array.isArray(mapa.arquivos)
	);
}

/**
 * O mapa da matéria. Sem mapa-conteudo.json, o mapa vazio. Um arquivo que não
 * dá para ler (JSON inválido, outro formato) é um ErroMapa: quem chama não
 * tem mapa para gravar, então o arquivo nunca é sobrescrito sem ter sido lido.
 */
export async function lerMapa(dados: string, materia: string): Promise<MapaConteudo> {
	const arquivo = caminhoDoMapa(dados, materia);
	let conteudo: string;
	try {
		conteudo = await readFile(arquivo, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return mapaVazio();
		throw erro;
	}
	let mapa: unknown;
	try {
		mapa = JSON.parse(conteudo);
	} catch (erro) {
		throw new ErroMapa(`Não consegui ler o mapa de conteúdo ${arquivo}: o JSON está inválido (${(erro as Error).message}). Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
	if (!ehMapa(mapa)) {
		throw new ErroMapa(`Não consegui ler o mapa de conteúdo ${arquivo}: ele não está no formato da versão ${VERSAO_MAPA} (faltam versao, situacao, conceitos ou arquivos). Nada foi gravado por cima.`);
	}
	return mapa;
}

/** O conceito com os campos na ordem do formato (fora e novo só quando verdadeiros). */
function conceitoNaOrdem(conceito: Conceito): Conceito {
	return {
		id: conceito.id,
		nome: conceito.nome,
		descricao: conceito.descricao,
		referencias: conceito.referencias.map((referencia) => ({ arquivo: referencia.arquivo, local: referencia.local, trecho: referencia.trecho })),
		prioridade: conceito.prioridade,
		origem: conceito.origem,
		criadoEm: conceito.criadoEm,
		...(conceito.fora ? { fora: true as const } : {}),
		...(conceito.novo ? { novo: true as const } : {}),
	};
}

/** Grava o mapa inteiro de uma vez (escreve ao lado e renomeia), em JSON com tabulação. */
export async function gravarMapa(dados: string, materia: string, mapa: MapaConteudo): Promise<void> {
	const arquivo = caminhoDoMapa(dados, materia);
	const naOrdem: MapaConteudo = {
		versao: VERSAO_MAPA,
		situacao: mapa.situacao,
		...(mapa.aprovadoEm ? { aprovadoEm: mapa.aprovadoEm } : {}),
		conceitos: mapa.conceitos.map(conceitoNaOrdem),
		arquivos: mapa.arquivos,
	};
	await mkdir(dirname(arquivo), { recursive: true });
	await gravarDeUmaVez(arquivo, `${JSON.stringify(naOrdem, null, "\t")}\n`);
}

/** O texto do .md de um trecho, sem o cabeçalho ---…--- (o mesmo corpoDoTrecho de packages/core/src/materiais/extraido.ts). */
export function corpoDoTrecho(conteudo: string): string {
	const normalizado = conteudo.replace(/\r\n/g, "\n");
	const achado = /^---\n[\s\S]*?\n---\n\n?/.exec(normalizado);
	return (achado ? normalizado.slice(achado[0].length) : normalizado).trimEnd();
}

/** O que o mapa usa do manifesto.json do .extraido. */
interface ManifestoLido {
	arquivo: string;
	hash: string;
	tipo: string;
	trechos: TrechoDoArquivo[];
}

async function lerManifesto(arquivo: string): Promise<ManifestoLido | undefined> {
	try {
		const manifesto = JSON.parse(await readFile(arquivo, "utf8")) as Partial<ManifestoLido>;
		if (typeof manifesto.arquivo !== "string" || typeof manifesto.hash !== "string" || !Array.isArray(manifesto.trechos)) return undefined;
		const trechos = manifesto.trechos.filter((trecho) => typeof trecho?.local === "string" && typeof trecho.nome === "string").map(({ local, nome }) => ({ local, nome }));
		return { arquivo: manifesto.arquivo, hash: manifesto.hash, tipo: typeof manifesto.tipo === "string" ? manifesto.tipo : "texto", trechos };
	} catch {
		// Ilegível (o núcleo está regravando, ou o Drive sincronizando): fica de fora desta vez.
		return undefined;
	}
}

/** O corpo do .md do trecho; um .md que sumiu vira texto vazio (como no núcleo). */
async function lerCorpo(pasta: string, nome: string): Promise<string> {
	try {
		return corpoDoTrecho(await readFile(join(pasta, `${nome}.md`), "utf8"));
	} catch {
		return "";
	}
}

/** Um arquivo com manifesto que o mapa ainda não tem (ou tem com outro hash). */
export interface ArquivoPendente {
	arquivo: string;
	tipo: string;
	hash: string;
	/** Os trechos do manifesto, com o tamanho do corpo de cada um (para dividirEmPartes sem ler o texto de novo). */
	trechos: Array<TrechoDoArquivo & { caracteres: number }>;
	/** A soma do tamanho do corpo dos .md dos trechos, sem o cabeçalho. */
	caracteres: number;
}

/**
 * Os manifestos legíveis em materias/<id>/.extraido/**\/manifesto.json, com a
 * pasta de cada um, em ordem de caminho do arquivo. Manifesto ilegível fica de
 * fora. Sem .extraido, nenhum.
 */
async function manifestosDaMateria(dados: string, materia: string): Promise<Array<{ pasta: string; manifesto: ManifestoLido }>> {
	let entradas: Dirent[];
	try {
		entradas = await readdir(pastaExtraidoMateria(dados, materia), { recursive: true, withFileTypes: true });
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw erro;
	}
	const lidos: Array<{ pasta: string; manifesto: ManifestoLido }> = [];
	for (const entrada of entradas) {
		if (!entrada.isFile() || entrada.name !== "manifesto.json") continue;
		const manifesto = await lerManifesto(join(entrada.parentPath, entrada.name));
		if (manifesto) lidos.push({ pasta: entrada.parentPath, manifesto });
	}
	lidos.sort((a, b) => a.manifesto.arquivo.localeCompare(b.manifesto.arquivo));
	return lidos;
}

/**
 * Os arquivos prontos da matéria (os que têm manifesto legível no .extraido),
 * com o hash do manifesto, em ordem de caminho. Os cursos guardam esta lista
 * na etapa Materiais (docs/cursos.md).
 */
export async function listarManifestos(dados: string, materia: string): Promise<Array<{ arquivo: string; hash: string }>> {
	return (await manifestosDaMateria(dados, materia)).map(({ manifesto }) => ({ arquivo: manifesto.arquivo, hash: manifesto.hash }));
}

/**
 * Os arquivos pendentes da matéria: os manifestos em
 * materias/<id>/.extraido/**\/manifesto.json cujo hash não está em
 * mapa.arquivos (ou é diferente), em ordem de caminho. Manifesto ilegível
 * fica de fora. Sem .extraido, nenhum.
 */
export async function lerPendentes(dados: string, materia: string, mapa: MapaConteudo): Promise<ArquivoPendente[]> {
	const pendentes: ArquivoPendente[] = [];
	for (const { pasta, manifesto } of await manifestosDaMateria(dados, materia)) {
		if (mapa.arquivos[manifesto.arquivo]?.hash === manifesto.hash) continue;
		const trechos: ArquivoPendente["trechos"] = [];
		for (const trecho of manifesto.trechos) trechos.push({ ...trecho, caracteres: (await lerCorpo(pasta, trecho.nome)).length });
		pendentes.push({
			arquivo: manifesto.arquivo,
			tipo: manifesto.tipo,
			hash: manifesto.hash,
			trechos,
			caracteres: trechos.reduce((soma, trecho) => soma + trecho.caracteres, 0),
		});
	}
	return pendentes;
}

/** Os trechos do arquivo com o texto (corpo sem cabeçalho), na ordem do manifesto. Sem manifesto, ErroMapa. */
export async function lerTrechos(dados: string, materia: string, arquivo: string): Promise<Array<TrechoDoArquivo & { texto: string }>> {
	const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
	const manifesto = await lerManifesto(join(pasta, "manifesto.json"));
	if (!manifesto) throw new ErroMapa(`Não achei o extraído de "${arquivo}" (o manifesto.json do .extraido falta ou está ilegível).`);
	const trechos: Array<TrechoDoArquivo & { texto: string }> = [];
	for (const trecho of manifesto.trechos) trechos.push({ ...trecho, texto: await lerCorpo(pasta, trecho.nome) });
	return trechos;
}

/** O tamanho de um trecho: o texto, se tiver, ou os caracteres contados por lerPendentes. */
const tamanhoDe = (trecho: { texto: string } | { caracteres: number }) => ("texto" in trecho ? trecho.texto.length : trecho.caracteres);

/**
 * Divide os trechos em partes de até `limite` caracteres, na ordem, sem
 * cortar um trecho: um trecho maior que o limite fica sozinho numa parte.
 * Sem trechos, nenhuma parte.
 */
export function dividirEmPartes<T extends { texto: string } | { caracteres: number }>(trechos: readonly T[], limite: number = LIMITE_PARTE): T[][] {
	const partes: T[][] = [];
	let atual: T[] = [];
	let tamanho = 0;
	for (const trecho of trechos) {
		const deste = tamanhoDe(trecho);
		if (atual.length > 0 && tamanho + deste > limite) {
			partes.push(atual);
			atual = [];
			tamanho = 0;
		}
		atual.push(trecho);
		tamanho += deste;
	}
	if (atual.length > 0) partes.push(atual);
	return partes;
}

// --- Eventos (no eventos.jsonl da matéria) ------------------------------------

type ContextoEvento = { sessao?: string };
const daSessao = (contexto: ContextoEvento) => (contexto.sessao ? { sessao: contexto.sessao } : {});

/** mapeou_material: um arquivo inteiro (todas as partes) foi mapeado. */
export async function registrarMapeamento(
	dados: string,
	materia: string,
	mapeamento: { arquivo: string; novos: number; reforcados: number; descartados: number; partes: number; custo: number; modelo: string },
	contexto: ContextoEvento = {},
): Promise<void> {
	const { arquivo, modelo, ...resultado } = mapeamento;
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ ...daSessao(contexto), verbo: "mapeou_material", objeto: { materia, arquivo }, resultado, contexto: { modelo } }),
	);
}

/** atualizou_mapa: um material saiu; semFonte = quantos conceitos ficaram sem fonte por isso. */
export async function registrarMaterialRemovidoDoMapa(dados: string, materia: string, arquivo: string, semFonte: number, contexto: ContextoEvento = {}): Promise<void> {
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ ...daSessao(contexto), verbo: "atualizou_mapa", objeto: { materia, arquivo }, resultado: { motivo: "material_removido", semFonte } }),
	);
}

/** revisou_mapa: a extensão manda só no primeiro lote de cada edicao (tipo = o da primeira operação). */
export async function registrarRevisaoMapa(dados: string, materia: string, edicao: string, tipo: TipoOperacao, contexto: ContextoEvento = {}): Promise<void> {
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ ...daSessao(contexto), verbo: "revisou_mapa", objeto: { materia }, resultado: { edicao, tipo } }),
	);
}

/** aprovou_mapa: conceitos = quantos ficaram dentro; fora = quantos estão fora. */
export async function registrarAprovacaoMapa(dados: string, materia: string, mapa: MapaConteudo, contexto: ContextoEvento = {}): Promise<void> {
	const fora = mapa.conceitos.filter((conceito) => conceito.fora).length;
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ ...daSessao(contexto), verbo: "aprovou_mapa", objeto: { materia }, resultado: { conceitos: mapa.conceitos.length - fora, fora } }),
	);
}

/** montou_mapa_do_tema: o mapa montado a partir do tema de um curso (docs/cursos.md); novos = quantos conceitos entraram. */
export async function registrarMapaDoTema(
	dados: string,
	materia: string,
	montagem: { tema: string; novos: number; custo: number; modelo: string },
	contexto: ContextoEvento = {},
): Promise<void> {
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({
			...daSessao(contexto),
			verbo: "montou_mapa_do_tema",
			objeto: { materia },
			resultado: { novos: montagem.novos, custo: montagem.custo, tema: montagem.tema },
			contexto: { modelo: montagem.modelo },
		}),
	);
}
