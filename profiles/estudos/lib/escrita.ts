// A escrita dos módulos no disco (docs/escrita.md): as regras de escrita do
// Breno em aprendiz/escrita.json (gravado inteiro de uma vez; só a versão
// atual), o retorno em cada bloco (o evento avaliou_bloco) e a gravação de um
// bloco reescrito no <módulo>.json. Todos os eventos (criou_regra_escrita,
// alterou_regra_escrita, apagou_regra_escrita, avaliou_bloco e
// reescreveu_bloco) vão para o aprendiz/eventos.jsonl. As regras são puras e
// ficam em escrita-tipos.ts. Sem dependências: o pi carrega a extensão desta
// pasta. Quem chama serializa as gravações (a extensão da escrita para o
// escrita.json; a trava da matéria, a extensão de módulos, para o módulo).

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gravarDeUmaVez } from "./arquivos.ts";
import type { ContextoCurso } from "./cursos.ts";
import type { PromptUsado } from "./diagnostico.ts";
import {
	type ArquivoEscrita,
	conferirLimite,
	ehAvaliacaoBloco,
	type EntradaRegra,
	ErroEscrita,
	ORIGENS_REGRA,
	type OrigemDaRegra,
	type RegraEscrita,
	substituirBloco,
	TEXTO_REGRA_MAXIMO,
	validarRegra,
	validarRetorno,
	VERSAO_ESCRITA,
} from "./escrita-tipos.ts";
import { acrescentarEvento, criarEvento, novoIdEvento } from "./eventos.ts";
import { eventosAprendiz, pastaAprendiz } from "./materias.ts";
import { type Bloco, type BlocoSemId, ehTipoBloco, type ModuloGerado, type TipoBloco, gravarModulo, lerModulo, versaoDoBloco } from "./modulos.ts";

export * from "./escrita-tipos.ts";

export const arquivoEscrita = (dados: string) => join(pastaAprendiz(dados), "escrita.json");

/** A sessão e o momento (sem ele, agora). */
export type ContextoEscrita = Pick<ContextoCurso, "sessao" | "agora">;

const daSessao = (contexto: ContextoEscrita) => (contexto.sessao ? { sessao: contexto.sessao } : {});
const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const daMateria = (materia: string | null) => (materia === null ? {} : { materia });

// --- Ler e gravar o escrita.json -----------------------------------------------------

/** O arquivo lido, conferido; erro (com a frase) se não estiver no formato. */
function escritaLida(valor: unknown): ArquivoEscrita {
	if (!ehObjeto(valor) || valor.versao !== VERSAO_ESCRITA) throw new Error(`não está no formato da versão ${VERSAO_ESCRITA}`);
	if (!Array.isArray(valor.regras)) throw new Error("falta a lista de regras");
	const ids = new Set<string>();
	const regras = (valor.regras as unknown[]).map((item, indice): RegraEscrita => {
		const numero = indice + 1;
		if (!ehObjeto(item)) throw new Error(`a regra ${numero} não é um objeto`);
		if (typeof item.id !== "string" || !item.id) throw new Error(`a regra ${numero} está sem id`);
		if (ids.has(item.id)) throw new Error(`o id "${item.id}" se repete`);
		ids.add(item.id);
		if (typeof item.texto !== "string" || !item.texto.trim() || item.texto.trim().length > TEXTO_REGRA_MAXIMO) throw new Error(`a regra ${item.id} está sem texto ou com mais de ${TEXTO_REGRA_MAXIMO} caracteres`);
		if (item.materia !== null && (typeof item.materia !== "string" || !item.materia)) throw new Error(`a matéria da regra ${item.id} não é null nem um id`);
		if (typeof item.ativa !== "boolean") throw new Error(`o ativa da regra ${item.id} não é true nem false`);
		if (typeof item.criadaEm !== "string" || typeof item.alteradaEm !== "string") throw new Error(`faltam criadaEm ou alteradaEm na regra ${item.id}`);
		if (!(ORIGENS_REGRA as readonly unknown[]).includes(item.origem)) throw new Error(`a origem da regra ${item.id} é desconhecida ("${String(item.origem)}")`);
		if (item.retorno !== undefined && typeof item.retorno !== "string") throw new Error(`o retorno da regra ${item.id} não é um texto`);
		return regraNaOrdem(item as unknown as RegraEscrita);
	});
	return { versao: VERSAO_ESCRITA, regras };
}

/** A regra com os campos na ordem do formato. */
function regraNaOrdem(regra: RegraEscrita): RegraEscrita {
	return {
		id: regra.id,
		texto: regra.texto,
		materia: regra.materia,
		ativa: regra.ativa,
		criadaEm: regra.criadaEm,
		alteradaEm: regra.alteradaEm,
		origem: regra.origem,
		...(regra.retorno !== undefined ? { retorno: regra.retorno } : {}),
	};
}

/**
 * As regras de escrita. Sem arquivo, nenhuma regra. Um arquivo que não dá
 * para ler (JSON inválido, outro formato) é um ErroEscrita: quem chama não
 * tem regras para gravar, então o arquivo nunca é sobrescrito sem ter sido
 * lido.
 */
export async function lerEscrita(dados: string): Promise<ArquivoEscrita> {
	const arquivo = arquivoEscrita(dados);
	let conteudo: string;
	try {
		conteudo = await readFile(arquivo, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return { versao: VERSAO_ESCRITA, regras: [] };
		throw erro;
	}
	try {
		let valor: unknown;
		try {
			valor = JSON.parse(conteudo);
		} catch (erro) {
			throw new Error(`o JSON está inválido (${(erro as Error).message})`);
		}
		return escritaLida(valor);
	} catch (erro) {
		throw new ErroEscrita(`Não consegui ler as regras de escrita ${arquivo}: ${(erro as Error).message}. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
}

/** Grava o escrita.json inteiro de uma vez (escreve ao lado e renomeia), em JSON com tabulação. */
async function gravarEscrita(dados: string, escrita: ArquivoEscrita): Promise<void> {
	await mkdir(pastaAprendiz(dados), { recursive: true });
	const limpo: ArquivoEscrita = { versao: VERSAO_ESCRITA, regras: escrita.regras.map(regraNaOrdem) };
	await gravarDeUmaVez(arquivoEscrita(dados), `${JSON.stringify(limpo, null, "\t")}\n`);
}

// --- Regras ----------------------------------------------------------------------------

/** A regra gravada e todas as regras, na ordem do arquivo. */
export interface RegraSalva {
	regra: RegraEscrita;
	regras: RegraEscrita[];
}

/**
 * Cria (sem id) ou altera (com id) uma regra (validarRegra). A nova vai para
 * o fim da lista, com id r-<tempo>-<aleatório>, criadaEm e alteradaEm agora e
 * a `origem` (escrita, ou retorno com o id do evento). Alterar muda o texto,
 * a matéria e o ativa e o alteradaEm; a origem fica. Confere o limite de 30
 * regras ativas por matéria (conferirLimite). Grava o escrita.json e o evento
 * no aprendiz/eventos.jsonl: criou_regra_escrita (resultado {texto, ativa,
 * origem, retorno?}) ou alterou_regra_escrita (resultado {texto, mudou,
 * antes, depois}: os campos que mudaram e os valores deles); objeto {regra,
 * materia?} (a matéria da regra, se não é global). Alterar sem mudar nada não
 * grava nem cria evento. Id que não existe, ErroEscrita; um escrita.json
 * ilegível é ErroEscrita e não é sobrescrito.
 */
export async function salvarRegra(dados: string, entrada: EntradaRegra, contexto: ContextoEscrita = {}, origem: OrigemDaRegra = { origem: "escrita" }): Promise<RegraSalva> {
	const valida = validarRegra(entrada);
	const atual = await lerEscrita(dados);
	const agora = contexto.agora ?? new Date();
	const quando = agora.toISOString();

	if (valida.id === undefined) {
		if (origem.origem === "retorno" && (typeof origem.retorno !== "string" || !origem.retorno)) throw new ErroEscrita("Falta o id do retorno de onde a regra saiu.");
		const regra: RegraEscrita = {
			id: `r-${novoIdEvento(agora.getTime())}`,
			texto: valida.texto,
			materia: valida.materia,
			ativa: valida.ativa,
			criadaEm: quando,
			alteradaEm: quando,
			origem: origem.origem,
			...(origem.origem === "retorno" ? { retorno: origem.retorno } : {}),
		};
		const regras = [...atual.regras, regra];
		conferirLimite(regras, regra);
		await gravarEscrita(dados, { versao: VERSAO_ESCRITA, regras });
		await acrescentarEvento(
			eventosAprendiz(dados),
			criarEvento(
				{
					...daSessao(contexto),
					verbo: "criou_regra_escrita",
					objeto: { regra: regra.id, ...daMateria(regra.materia) },
					resultado: { texto: regra.texto, ativa: regra.ativa, origem: regra.origem, ...(regra.retorno ? { retorno: regra.retorno } : {}) },
				},
				agora,
			),
		);
		return { regra: structuredClone(regra), regras: structuredClone(regras) };
	}

	const indice = atual.regras.findIndex((regra) => regra.id === valida.id);
	if (indice < 0) throw new ErroEscrita(`Não achei a regra "${valida.id}"; ela pode ter sido apagada.`);
	const antiga = atual.regras[indice]!;
	const campos = ["texto", "materia", "ativa"] as const;
	const mudou = campos.filter((campo) => antiga[campo] !== valida[campo]);
	if (mudou.length === 0) return { regra: structuredClone(antiga), regras: structuredClone(atual.regras) };
	const regra: RegraEscrita = { ...antiga, texto: valida.texto, materia: valida.materia, ativa: valida.ativa, alteradaEm: quando };
	const regras = atual.regras.map((item, posicao) => (posicao === indice ? regra : item));
	conferirLimite(regras, regra);
	await gravarEscrita(dados, { versao: VERSAO_ESCRITA, regras });
	await acrescentarEvento(
		eventosAprendiz(dados),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "alterou_regra_escrita",
				objeto: { regra: regra.id, ...daMateria(regra.materia) },
				resultado: {
					texto: regra.texto,
					mudou: [...mudou],
					antes: Object.fromEntries(mudou.map((campo) => [campo, antiga[campo]])),
					depois: Object.fromEntries(mudou.map((campo) => [campo, regra[campo]])),
				},
			},
			agora,
		),
	);
	return { regra: structuredClone(regra), regras: structuredClone(regras) };
}

/**
 * Apaga a regra: tira do escrita.json e grava apagou_regra_escrita no
 * aprendiz/eventos.jsonl (objeto {regra, materia?}; resultado {texto}).
 * Devolve as regras que ficaram. Id que não existe, ErroEscrita.
 */
export async function apagarRegra(dados: string, id: string, contexto: ContextoEscrita = {}): Promise<RegraEscrita[]> {
	const atual = await lerEscrita(dados);
	const apagada = atual.regras.find((regra) => regra.id === id);
	if (!apagada) throw new ErroEscrita(`Não achei a regra "${String(id)}"; ela pode já ter sido apagada.`);
	const regras = atual.regras.filter((regra) => regra.id !== id);
	const agora = contexto.agora ?? new Date();
	await gravarEscrita(dados, { versao: VERSAO_ESCRITA, regras });
	await acrescentarEvento(
		eventosAprendiz(dados),
		criarEvento({ ...daSessao(contexto), verbo: "apagou_regra_escrita", objeto: { regra: apagada.id, ...daMateria(apagada.materia) }, resultado: { texto: apagada.texto } }, agora),
	);
	return structuredClone(regras);
}

// --- Retorno ---------------------------------------------------------------------------

/** O que vai no avaliou_bloco: de onde é o bloco, o retorno (validarRetorno) e como o bloco foi gerado. */
export interface DadosRetorno {
	materia: string;
	curso: string;
	modulo: string;
	licao: string;
	bloco: string;
	tipo: TipoBloco;
	conceitos: string[];
	avaliacao: unknown;
	motivos?: unknown;
	texto?: unknown;
	/** "Virar regra de escrita": a matéria é null (todas) ou a do bloco. */
	virarRegra?: { texto: string; materia: string | null } | null;
	/** A versão do bloco avaliado (versaoDoBloco); sem ela, 1. */
	versao?: number;
	/** O modelo que gerou (ou reescreveu) o bloco. */
	modelo: string;
	/** O nome e o hash do prompt que gerou o bloco, quando se sabe. */
	prompt?: PromptUsado | null;
	/** O id do avaliou_bloco (a nota rápida) do mesmo bloco que este retorno detalha; quem chama confere que é do bloco. */
	detalha?: string | null;
}

/**
 * Grava o retorno do Breno num bloco (docs/escrita.md, "Retorno em cada
 * bloco"): o evento avaliou_bloco no aprendiz/eventos.jsonl, com objeto
 * {materia, curso, modulo, licao, bloco, tipo, conceitos}, resultado
 * {avaliacao, motivos, texto, detalha?} e contexto {modelo, prompt?, versao}.
 * A avaliação é uma das novas (ruim, bom ou otimo): a antiga melhorar só
 * vale nos eventos já gravados. Com
 * virarRegra, cria também a regra (salvarRegra, ativa, origem "retorno" com o
 * id do evento); o limite de regras é conferido antes de gravar o evento.
 * Devolve o id do evento (o que o reescrever_bloco manda de volta) e a regra
 * criada, se houve. Um bloco pode receber vários retornos: todos ficam.
 */
export async function registrarRetorno(dados: string, entrada: DadosRetorno, contexto: ContextoEscrita = {}): Promise<{ retorno: string; regra?: RegraEscrita; regras?: RegraEscrita[] }> {
	for (const campo of ["materia", "curso", "modulo", "licao", "bloco", "tipo"] as const) {
		if (typeof entrada[campo] !== "string" || !entrada[campo]) throw new ErroEscrita(`O retorno está sem ${campo === "licao" ? "lição" : campo === "materia" ? "matéria" : campo === "modulo" ? "módulo" : campo}.`);
	}
	if (!ehTipoBloco(entrada.tipo)) throw new ErroEscrita(`O tipo do bloco não é válido ("${String(entrada.tipo)}").`);
	if (!Array.isArray(entrada.conceitos) || !entrada.conceitos.every((id) => typeof id === "string")) throw new ErroEscrita("Os conceitos do bloco não vieram numa lista de ids.");
	if (!ehAvaliacaoBloco(entrada.avaliacao)) throw new ErroEscrita(`A avaliação do bloco não é válida ("${String(entrada.avaliacao)}"): é ruim, bom ou otimo.`);
	if (entrada.detalha !== undefined && entrada.detalha !== null && (typeof entrada.detalha !== "string" || !entrada.detalha)) throw new ErroEscrita("O detalha do retorno não é o id de um evento.");
	const retorno = validarRetorno({ avaliacao: entrada.avaliacao, motivos: entrada.motivos, texto: entrada.texto, virarRegra: entrada.virarRegra });
	if (retorno.virarRegra && retorno.virarRegra.materia !== null && retorno.virarRegra.materia !== entrada.materia) {
		throw new ErroEscrita("A regra criada de um retorno vale para todas as matérias ou só para a matéria do bloco.");
	}
	if (retorno.virarRegra) {
		const { regras } = await lerEscrita(dados);
		conferirLimite([...regras, { ...retorno.virarRegra, ativa: true } as RegraEscrita], { materia: retorno.virarRegra.materia, ativa: true });
	}
	const agora = contexto.agora ?? new Date();
	const evento = criarEvento(
		{
			...daSessao(contexto),
			verbo: "avaliou_bloco",
			objeto: {
				materia: entrada.materia,
				curso: entrada.curso,
				modulo: entrada.modulo,
				licao: entrada.licao,
				bloco: entrada.bloco,
				tipo: entrada.tipo,
				conceitos: [...entrada.conceitos],
			},
			resultado: { avaliacao: retorno.avaliacao, motivos: retorno.motivos, texto: retorno.texto, ...(entrada.detalha ? { detalha: entrada.detalha } : {}) },
			contexto: {
				modelo: entrada.modelo,
				...(entrada.prompt ? { prompt: { nome: entrada.prompt.nome, hash: entrada.prompt.hash } } : {}),
				versao: versaoDoBloco({ versao: entrada.versao }),
			},
		},
		agora,
	);
	await acrescentarEvento(eventosAprendiz(dados), evento);
	if (!retorno.virarRegra) return { retorno: evento.id };
	const salva = await salvarRegra(dados, { texto: retorno.virarRegra.texto, materia: retorno.virarRegra.materia, ativa: true }, contexto, { origem: "retorno", retorno: evento.id });
	return { retorno: evento.id, regra: salva.regra, regras: salva.regras };
}

// --- Reescrita de um bloco -------------------------------------------------------------

/** O que a extensão manda gravar depois de reescrever um bloco. */
export interface Reescrita {
	/** O id do evento avaliou_bloco que pediu a reescrita. */
	retornoId: string;
	/** provedor/id do modelo da reescrita. */
	modelo: string;
	/** modulo-bloco.md: o nome e o hash do conteúdo. */
	prompt?: PromptUsado | null;
	/** US$ da reescrita. */
	custo: number;
}

/**
 * Grava o bloco reescrito (já conferido por validarBloco): lê o módulo, troca
 * o bloco (substituirBloco: versao + 1, reescritoEm, o antigo em anteriores,
 * o id igual), grava o <módulo>.json e o evento reescreveu_bloco no
 * aprendiz/eventos.jsonl (objeto {materia, curso, modulo, licao, bloco, tipo,
 * conceitos} como o do retorno, com os conceitos do bloco novo; resultado
 * {de, para, retorno}; contexto {modelo, prompt?, custo}). Devolve o módulo
 * novo. O custo do módulo não muda (é o da geração). Módulo sem arquivo ou
 * aguardando material, lição ou bloco que não existe, tipo diferente,
 * ErroEscrita; um arquivo ilegível é ErroModulo e não é sobrescrito.
 */
export async function gravarBlocoReescrito(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	licao: string,
	bloco: string,
	novo: BlocoSemId | Bloco,
	reescrita: Reescrita,
	contexto: ContextoEscrita = {},
): Promise<ModuloGerado> {
	const atual = await lerModulo(dados, materia, curso, modulo);
	if (!atual) throw new ErroEscrita("O módulo ainda não foi gerado; não há bloco para reescrever.");
	const agora = contexto.agora ?? new Date();
	const reescrito = substituirBloco(atual, licao, bloco, novo, { retornoId: reescrita.retornoId, agora });
	const blocoNovo = reescrito.licoes.find((item) => item.id === licao)!.blocos.find((item) => item.id === bloco)!;
	const para = versaoDoBloco(blocoNovo);
	await gravarModulo(dados, reescrito);
	await acrescentarEvento(
		eventosAprendiz(dados),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "reescreveu_bloco",
				objeto: { materia, curso, modulo, licao, bloco, tipo: blocoNovo.tipo, conceitos: [...blocoNovo.conceitos] },
				resultado: { de: para - 1, para, retorno: reescrita.retornoId },
				contexto: { modelo: reescrita.modelo, ...(reescrita.prompt ? { prompt: { nome: reescrita.prompt.nome, hash: reescrita.prompt.hash } } : {}), custo: reescrita.custo },
			},
			agora,
		),
	);
	return reescrito;
}
