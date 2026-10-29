// Os termos-chave e os pedidos de explicação no disco (docs/termos.md): o
// glossario.json do curso (materias/<matéria>/cursos/<curso>/glossario.json),
// gravado inteiro de uma vez (lib/arquivos.ts); os pedidos de explicação no
// <módulo>.json (gravarModulo); os eventos marcou_termos (no eventos.jsonl da
// matéria), pediu_explicacao e guardou_termo (no aprendiz/eventos.jsonl). As
// regras são puras e ficam em termos-tipos.ts. Sem dependências: o pi carrega
// a extensão desta pasta. Quem chama segura a trava da matéria (a extensão de
// módulos): o glossário do curso fica na mesma trava dos módulos.

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gravarDeUmaVez } from "./arquivos.ts";
import { type ContextoCurso, pastaDoCurso } from "./cursos.ts";
import type { PromptUsado } from "./diagnostico.ts";
import { acrescentarEvento, criarEvento, type Evento, novoIdEvento } from "./eventos.ts";
import { eventosAprendiz, eventosMateria } from "./materias.ts";
import type { OrigemDoBloco } from "./modulo-respostas.ts";
import { type Bloco, ErroModulo, gravarModulo, lerModulo, type Modulo, type ModuloGerado, situacoesDoCurso } from "./modulos.ts";
import {
	aplicarMarcas,
	aplicarPedidoExplicacao,
	aplicarRespostaExplicacao,
	aplicarTermoGuardado,
	type ExplicadoDeNovo,
	explicadoQueVale,
	type Glossario,
	glossarioNaTela,
	glossarioVazio,
	ehOrigemTermo,
	juntarTermos,
	type LugarDoTermo,
	type MarcaAPor,
	type ModuloDoLugar,
	type PedidoDeExplicacao,
	type Termo,
	type TermoDaExplicacao,
	type TermoNaTela,
	tirarPedidoPendente,
	trocarMarcasNasLicoes,
	VERSAO_GLOSSARIO,
} from "./termos-tipos.ts";

export * from "./termos-tipos.ts";

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const daSessao = (contexto: Pick<ContextoCurso, "sessao">) => (contexto.sessao ? { sessao: contexto.sessao } : {});

/** Um id de matéria ou de curso que pode virar nome de pasta (como o conferirId de cursos.ts). */
function conferirId(id: string, oQue: string): string {
	if (!id || id === "." || id === ".." || /[\\/:*?"<>|\u0000-\u001f]/.test(id)) throw new ErroModulo(`O id ${oQue} não é válido ("${id}").`);
	return id;
}

/** O caminho do glossario.json do curso. */
export const arquivoGlossario = (dados: string, materia: string, curso: string) =>
	join(pastaDoCurso(dados, conferirId(materia, "da matéria"), conferirId(curso, "do curso")), "glossario.json");

// --- Ler e gravar o glossário ---------------------------------------------------------

/** Um lugar gravado (o explicado): modulo, licao e bloco em texto e, quando há, a explicacao. */
function lugarLido(valor: unknown, onde: string): LugarDoTermo | null {
	if (valor === null) return null;
	if (!ehObjeto(valor) || typeof valor.modulo !== "string" || typeof valor.licao !== "string" || typeof valor.bloco !== "string") throw new Error(`${onde}: o explicado não é null nem {modulo, licao, bloco}`);
	if (valor.explicacao !== undefined && typeof valor.explicacao !== "string") throw new Error(`${onde}: a explicacao do explicado não é um texto`);
	return { modulo: valor.modulo, licao: valor.licao, bloco: valor.bloco, ...(typeof valor.explicacao === "string" ? { explicacao: valor.explicacao } : {}) };
}

/** O glossário lido, conferido e com os campos na ordem; erro (com a frase) se não estiver no formato. */
function glossarioLido(valor: unknown): Glossario {
	if (!ehObjeto(valor) || valor.versao !== VERSAO_GLOSSARIO) throw new Error(`não está no formato da versão ${VERSAO_GLOSSARIO}`);
	if (!Array.isArray(valor.termos)) throw new Error("falta a lista de termos");
	const ids = new Set<string>();
	const termos = (valor.termos as unknown[]).map((item, indice): Termo => {
		const onde = `o termo ${indice + 1}`;
		if (!ehObjeto(item)) throw new Error(`${onde} não é um objeto`);
		for (const campo of ["id", "termo", "definicao", "criadoEm", "alteradoEm"] as const) if (typeof item[campo] !== "string") throw new Error(`${onde}: falta ${campo}`);
		if (ids.has(item.id as string)) throw new Error(`o id "${String(item.id)}" aparece em mais de um termo`);
		ids.add(item.id as string);
		if (!ehOrigemTermo(item.origem)) throw new Error(`${onde}: origem desconhecida ("${String(item.origem)}")`);
		if (item.conceito !== undefined && typeof item.conceito !== "string") throw new Error(`${onde}: o conceito não é um texto`);
		return termoNaOrdem({ ...(item as unknown as Termo), explicado: lugarLido(item.explicado ?? null, onde) });
	});
	return { versao: VERSAO_GLOSSARIO, termos };
}

/** O termo com os campos na ordem do formato. */
const termoNaOrdem = (termo: Termo): Termo => ({
	id: termo.id,
	termo: termo.termo,
	definicao: termo.definicao,
	...(termo.conceito ? { conceito: termo.conceito } : {}),
	explicado: termo.explicado ? { modulo: termo.explicado.modulo, licao: termo.explicado.licao, bloco: termo.explicado.bloco, ...(termo.explicado.explicacao ? { explicacao: termo.explicado.explicacao } : {}) } : null,
	origem: termo.origem,
	criadoEm: termo.criadoEm,
	alteradoEm: termo.alteradoEm,
});

/**
 * O glossário do curso. Sem arquivo, o glossário vazio. Um arquivo que não dá
 * para ler (JSON inválido, outro formato) é ErroModulo: quem chama não tem
 * glossário para gravar, então o arquivo nunca é sobrescrito sem ter sido lido.
 */
export async function lerGlossario(dados: string, materia: string, curso: string): Promise<Glossario> {
	const arquivo = arquivoGlossario(dados, materia, curso);
	let conteudo: string;
	try {
		conteudo = await readFile(arquivo, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return glossarioVazio();
		throw erro;
	}
	try {
		let valor: unknown;
		try {
			valor = JSON.parse(conteudo);
		} catch (erro) {
			throw new Error(`o JSON está inválido (${(erro as Error).message})`);
		}
		return glossarioLido(valor);
	} catch (erro) {
		throw new ErroModulo(`Não consegui ler o glossário ${arquivo}: ${(erro as Error).message}. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
}

/** Grava o glossario.json inteiro de uma vez (escreve ao lado e renomeia), em JSON com tabulação. Quem chama já leu o glossário (lerGlossario) e segura a trava da matéria. */
export async function gravarGlossario(dados: string, materia: string, curso: string, glossario: Glossario): Promise<void> {
	const arquivo = arquivoGlossario(dados, materia, curso);
	await mkdir(dirname(arquivo), { recursive: true });
	await gravarDeUmaVez(arquivo, `${JSON.stringify({ versao: VERSAO_GLOSSARIO, termos: glossario.termos.map(termoNaOrdem) }, null, "\t")}\n`);
}

const mesmoGlossario = (a: Glossario, b: Glossario) => JSON.stringify(a.termos.map(termoNaOrdem)) === JSON.stringify(b.termos.map(termoNaOrdem));

// --- O glossário na tela ------------------------------------------------------------------

/**
 * O glossário do curso como vai na mensagem "modulo" (glossarioNaTela): o
 * módulo aberto e os outros módulos onde os termos foram explicados, lidos do
 * disco (um ilegível conta como sem módulo: o lugar fica null), com o número e
 * o título pelo `esqueleto`. Um glossário ilegível é ErroModulo.
 */
export async function glossarioParaATela(dados: string, materia: string, curso: string, aberto: Modulo, esqueleto: readonly { id: string; nome: string }[]): Promise<TermoNaTela[]> {
	const glossario = await lerGlossario(dados, materia, curso);
	const modulos: Record<string, ModuloDoLugar | undefined> = { [aberto.id]: aberto };
	for (const termo of glossario.termos) {
		const outro = termo.explicado?.modulo;
		if (!outro || Object.hasOwn(modulos, outro)) continue;
		try {
			modulos[outro] = await lerModulo(dados, materia, curso, outro);
		} catch {
			modulos[outro] = undefined;
		}
	}
	return glossarioNaTela(glossario, { esqueleto, modulos });
}

// --- Juntar os termos de uma geração ou de uma marcação --------------------------------------

/** O que juntarNoDisco devolve: o glossário novo (ainda não gravado), as trocas de id e os ids acrescentados, e se ele mudou. */
export interface TermosJuntados {
	glossario: Glossario;
	trocas: Record<string, string>;
	acrescentados: string[];
	mudou: boolean;
}

/**
 * Junta ao glossário do disco os termos criados numa geração ou marcação
 * (juntarTermos), com os módulos do disco para saber se um explicado ainda
 * aponta para um bloco que existe. Não grava: quem chama troca as marcas
 * (trocas), grava o módulo e depois o glossário, se mudou.
 */
export async function juntarNoDisco(
	dados: string,
	materia: string,
	curso: string,
	entrada: { novos: readonly Termo[]; reexplicados?: readonly ExplicadoDeNovo[] },
	opcoes: { agora: Date; moduloRegerado?: string },
): Promise<TermosJuntados> {
	const disco = await lerGlossario(dados, materia, curso);
	const { modulos } = await situacoesDoCurso(dados, materia, curso);
	const juntado = juntarTermos(disco, entrada, { ...opcoes, blocoExiste: (lugar) => explicadoQueVale(lugar, modulos) !== null });
	return { ...juntado, mudou: !mesmoGlossario(disco, juntado.glossario) };
}

// --- Marcar os termos num módulo já gerado -----------------------------------------------------

/** O que a extensão juntou das chamadas de "Marcar os termos" (uma por lição). */
export interface Marcacao {
	/** O geradoEm do módulo lido no começo: se mudou (o módulo foi gerado de novo), nada é gravado. */
	geradoEm: string;
	/** A versão de cada bloco no começo: um bloco reescrito nesse meio-tempo não recebe marca. */
	versoes: Record<string, number>;
	marcas: readonly MarcaAPor[];
	/** Os termos novos (com os ids provisórios das marcas). */
	novos: readonly Termo[];
	reexplicados?: readonly ExplicadoDeNovo[];
	/** US$ das chamadas. */
	custo: number;
}

/**
 * Grava "Marcar os termos" (docs/termos.md): lê o módulo (gerado, com o mesmo
 * geradoEm do começo; senão, ErroModulo e nada gravado), põe as marcas
 * (aplicarMarcas: sem mudar a versão dos blocos), junta ao glossário do disco
 * só os termos novos que ganharam marca (juntarNoDisco, origem anotacao, e
 * as marcas trocadas pelas trocas de id), grava o módulo e o glossário e o
 * evento marcou_termos no eventos.jsonl da matéria (objeto {materia, curso,
 * modulo}; resultado {termosNovos, marcas, custo}), mesmo sem nenhuma marca
 * (o modelo foi chamado).
 */
export async function registrarMarcacao(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	marcacao: Marcacao,
	contexto: Pick<ContextoCurso, "sessao" | "agora"> = {},
): Promise<{ modulo: ModuloGerado; glossario: Glossario; termosNovos: number; marcas: number; evento: Evento }> {
	const agora = contexto.agora ?? new Date();
	const lido = await lerModulo(dados, materia, curso, modulo);
	if (!lido || lido.situacao !== "gerado" || lido.geradoEm !== marcacao.geradoEm) {
		throw new ErroModulo(`O módulo ${modulo} foi gerado de novo (ou saiu) enquanto os termos eram marcados; nada foi gravado. Marque os termos de novo.`);
	}
	const { modulo: marcado, aplicadas } = aplicarMarcas(lido, marcacao.marcas, marcacao.versoes);
	const usados = new Set(aplicadas.map((marca) => marca.id));
	const juntado = await juntarNoDisco(dados, materia, curso, { novos: marcacao.novos.filter((termo) => usados.has(termo.id)), reexplicados: marcacao.reexplicados ?? [] }, { agora });
	let novo = marcado;
	if (Object.keys(juntado.trocas).length > 0) novo = { ...marcado, licoes: trocarMarcasNasLicoes(marcado.licoes, (id) => juntado.trocas[id] ?? id) };
	if (aplicadas.length > 0) await gravarModulo(dados, novo);
	if (juntado.mudou) await gravarGlossario(dados, materia, curso, juntado.glossario);
	const evento = criarEvento(
		{
			...daSessao(contexto),
			verbo: "marcou_termos",
			objeto: { materia, curso, modulo },
			resultado: { termosNovos: juntado.acrescentados.length, marcas: aplicadas.length, custo: marcacao.custo },
		},
		agora,
	);
	await acrescentarEvento(eventosMateria(dados, materia), evento);
	return { modulo: novo, glossario: juntado.glossario, termosNovos: juntado.acrescentados.length, marcas: aplicadas.length, evento };
}

// --- Os pedidos de explicação -------------------------------------------------------------

/** O módulo gerado; sem arquivo ou aguardando material, ErroModulo. */
async function moduloGerado(dados: string, materia: string, curso: string, modulo: string): Promise<ModuloGerado> {
	const lido = await lerModulo(dados, materia, curso, modulo);
	if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
	if (lido.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo} está aguardando material; não há bloco para explicar.`);
	return lido;
}

/** O id de um pedido de explicação novo: x- e um id ordenável no tempo. */
export const novoIdExplicacao = (agora: Date = new Date()) => `x-${novoIdEvento(agora.getTime())}`;

/**
 * Grava um pedido de explicação novo no <módulo>.json, sem a explicação
 * (aplicarPedidoExplicacao: os pedidos sem explicação que não estão
 * `emAndamento` saem). Devolve o módulo novo e o id do pedido. Módulo que não
 * está gerado, lição ou bloco que não existe, erro (nada gravado). Sem
 * evento: o pediu_explicacao é gravado com a explicação.
 */
export async function registrarPedidoExplicacao(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	pedido: PedidoDeExplicacao,
	contexto: Pick<ContextoCurso, "agora"> & { emAndamento?: ReadonlySet<string> } = {},
): Promise<{ modulo: ModuloGerado; id: string }> {
	const agora = contexto.agora ?? new Date();
	const lido = await moduloGerado(dados, materia, curso, modulo);
	const id = novoIdExplicacao(agora);
	const novo = aplicarPedidoExplicacao(lido, pedido, { id, agora, ...(contexto.emAndamento ? { emAndamento: contexto.emAndamento } : {}) });
	await gravarModulo(dados, novo);
	return { modulo: novo, id };
}

/** Quem explicou: o modelo, o prompt usado (com a metodologia) e o custo. */
export interface Explicador {
	modelo: string;
	prompt?: PromptUsado;
	custo: number;
}

/**
 * Grava a explicação que chegou no pedido (aplicarRespostaExplicacao) e o
 * evento pediu_explicacao no aprendiz/eventos.jsonl: objeto {materia, curso,
 * modulo, licao, bloco, conceitos (os do bloco)}; resultado {trecho, tipo,
 * explicacao}; contexto {fase: "modulo", versao (a do bloco no pedido),
 * modelo e prompt (de onde o bloco veio: `origem`, como nos eventos das
 * respostas), explicador: {modelo, prompt, custo}}. Se o pedido não está mais
 * no módulo (o módulo foi gerado de novo) ou já foi respondido, nada é
 * gravado e devolve undefined (a explicação é jogada fora).
 */
export async function gravarExplicacao(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	id: string,
	resposta: { explicacao: string; termo: TermoDaExplicacao | null },
	contexto: Pick<ContextoCurso, "sessao" | "agora"> & { explicador: Explicador; origem?: (modulo: ModuloGerado, licao: string, bloco: Bloco) => Promise<OrigemDoBloco> },
): Promise<ModuloGerado | undefined> {
	const lido = await lerModulo(dados, materia, curso, modulo);
	if (!lido || lido.situacao !== "gerado") return undefined;
	const pedido = (lido.explicacoes ?? []).find((item) => item.id === id);
	if (!pedido || typeof pedido.explicacao === "string") return undefined;
	const agora = contexto.agora ?? new Date();
	const bloco = lido.licoes.find((licao) => licao.id === pedido.licao)?.blocos.find((item) => item.id === pedido.bloco);
	const origem: OrigemDoBloco = bloco && contexto.origem ? await contexto.origem(lido, pedido.licao, bloco) : { modelo: lido.modelo };
	const { explicador } = contexto;
	const evento = criarEvento(
		{
			...daSessao(contexto),
			verbo: "pediu_explicacao",
			objeto: { materia, curso, modulo, licao: pedido.licao, bloco: pedido.bloco, conceitos: [...(bloco?.conceitos ?? [])] },
			resultado: { trecho: pedido.trecho, tipo: pedido.tipo, explicacao: resposta.explicacao },
			contexto: {
				fase: "modulo",
				versao: pedido.versao,
				modelo: origem.modelo,
				...(origem.prompt ? { prompt: { nome: origem.prompt.nome, hash: origem.prompt.hash } } : {}),
				explicador: { modelo: explicador.modelo, ...(explicador.prompt ? { prompt: { nome: explicador.prompt.nome, hash: explicador.prompt.hash } } : {}), custo: explicador.custo },
			},
		},
		agora,
	);
	const novo = aplicarRespostaExplicacao(lido, id, { ...resposta, evento: evento.id, modelo: explicador.modelo, custo: explicador.custo })!;
	await gravarModulo(dados, novo);
	await acrescentarEvento(eventosAprendiz(dados), evento);
	return novo;
}

/** Tira do <módulo>.json um pedido que ficou sem explicação (a explicação falhou). Devolve o módulo novo; sem o pedido (ou já respondido), undefined e nada gravado. */
export async function tirarPedidoExplicacao(dados: string, materia: string, curso: string, modulo: string, id: string): Promise<ModuloGerado | undefined> {
	const lido = await lerModulo(dados, materia, curso, modulo);
	if (!lido || lido.situacao !== "gerado") return undefined;
	const novo = tirarPedidoPendente(lido, id);
	if (novo) await gravarModulo(dados, novo);
	return novo;
}

/**
 * "Guardar no glossário" (aplicarTermoGuardado): o termo do pedido entra no
 * glossário (origem pedido, explicado com o id do pedido), ou o pedido só se
 * liga ao termo que já existe; o trecho ganha a marca no bloco; o pedido
 * ganha `guardado`. Grava o módulo, o glossário (se mudou) e o evento
 * guardou_termo no aprendiz/eventos.jsonl: objeto {materia, curso, modulo,
 * licao, bloco, explicacao (o id do pedido)}; resultado {id (do termo),
 * termo, definicao, novo (se entrou agora), marcado (se a marca entrou)}.
 */
export async function guardarTermo(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	id: string,
	contexto: Pick<ContextoCurso, "sessao" | "agora"> = {},
): Promise<{ modulo: ModuloGerado; glossario: Glossario; termo: Termo; evento: Evento }> {
	const agora = contexto.agora ?? new Date();
	const lido = await moduloGerado(dados, materia, curso, modulo);
	const glossario = await lerGlossario(dados, materia, curso);
	const guardado = aplicarTermoGuardado(lido, glossario, id, agora);
	const evento = criarEvento(
		{
			...daSessao(contexto),
			verbo: "guardou_termo",
			objeto: { materia, curso, modulo, licao: guardado.pedido.licao, bloco: guardado.pedido.bloco, explicacao: id },
			resultado: { id: guardado.termo.id, termo: guardado.termo.termo, definicao: guardado.termo.definicao, novo: guardado.novo, marcado: guardado.marcado },
		},
		agora,
	);
	await gravarModulo(dados, guardado.modulo);
	if (guardado.novo) await gravarGlossario(dados, materia, curso, guardado.glossario);
	await acrescentarEvento(eventosAprendiz(dados), evento);
	return { modulo: guardado.modulo, glossario: guardado.glossario, termo: guardado.termo, evento };
}
