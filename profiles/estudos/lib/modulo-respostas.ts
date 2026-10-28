// As respostas das questões do módulo no disco (docs/modulos.md, "Responder
// as questões"): ficam no <módulo>.json, no campo `respostas`, gravado
// inteiro (gravarModulo, lib/arquivos.ts); os eventos respondeu_questao,
// respondeu_verificacao, respondeu_dissertativa e nao_sabia_questao vão para
// o aprendiz/eventos.jsonl, como os do diagnóstico (lib/diagnostico.ts), com
// fase "modulo". As regras são puras e ficam em modulo-respostas-tipos.ts.
// Sem dependências: o pi carrega a extensão desta pasta. Quem chama segura a
// trava da matéria (a extensão de módulos).

import { lerCurso, type ContextoCurso } from "./cursos.ts";
import type { PromptUsado } from "./diagnostico.ts";
import { acrescentarEvento, criarEvento, type Evento } from "./eventos.ts";
import { eventosAprendiz } from "./materias.ts";
import {
	type AlvoConferencia,
	alvoDaConferencia,
	aplicarConferencia,
	type BlocoQuestao,
	type Conferencia,
	conferenciaVale,
	encerrarQuestao,
	type RespostaAplicada,
	type RespostaModulo,
	responderQuestao,
	type TentativaAlternativa,
	type TentativaDissertativa,
	type TentativaVerificacao,
} from "./modulo-respostas-tipos.ts";
import { type Bloco, ErroModulo, gravarModulo, lerModulo, moduloDoEsqueleto, type ModuloGerado, versaoDoBloco } from "./modulos.ts";

export * from "./modulo-respostas-tipos.ts";

/** Como o bloco foi gerado: o modelo e o prompt (nome e hash), para o contexto dos eventos. */
export interface OrigemDoBloco {
	modelo: string;
	prompt?: PromptUsado;
}

/** A sessão, o momento e de onde vem a origem do bloco (a extensão lê dos eventos, como no avaliou_bloco). */
export interface ContextoResposta extends Pick<ContextoCurso, "sessao" | "agora"> {
	/** Sem ela, o modelo do módulo, sem prompt. */
	origem?: (modulo: ModuloGerado, licao: string, bloco: Bloco) => Promise<OrigemDoBloco>;
}

/** O corretor que conferiu: o modelo, o prompt usado (com a metodologia) e o custo. */
export interface Corretor {
	modelo: string;
	prompt?: PromptUsado;
	custo: number;
}

const daSessao = (contexto: ContextoResposta) => (contexto.sessao ? { sessao: contexto.sessao } : {});

/** O módulo gerado do curso pronto; sem arquivo ou aguardando material, ErroModulo. Um arquivo ilegível é ErroModulo e não é sobrescrito. */
async function moduloGerado(dados: string, materia: string, curso: string, modulo: string): Promise<ModuloGerado> {
	moduloDoEsqueleto(await lerCurso(dados, materia, curso), modulo);
	const lido = await lerModulo(dados, materia, curso, modulo);
	if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
	if (lido.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo} está aguardando material; não há questão para responder.`);
	return lido;
}

/** O objeto dos eventos: {materia, curso, modulo, licao, questao (o id do bloco), conceitos}. */
const objetoDo = (modulo: ModuloGerado, licao: string, bloco: BlocoQuestao) => ({
	materia: modulo.materia,
	curso: modulo.curso,
	modulo: modulo.id,
	licao,
	questao: bloco.id,
	conceitos: [...bloco.conceitos],
});

/** O contexto dos eventos: {fase: "modulo", versao (do bloco), modelo, prompt?} e, com a conferência pelo modelo, corretor {modelo, prompt?, custo}. */
async function contextoDoEvento(modulo: ModuloGerado, licao: string, bloco: BlocoQuestao, contexto: ContextoResposta, corretor?: Corretor): Promise<Record<string, unknown>> {
	const origem: OrigemDoBloco = contexto.origem ? await contexto.origem(modulo, licao, bloco) : { modelo: modulo.modelo };
	return {
		fase: "modulo",
		versao: versaoDoBloco(bloco),
		modelo: origem.modelo,
		...(origem.prompt ? { prompt: { nome: origem.prompt.nome, hash: origem.prompt.hash } } : {}),
		...(corretor
			? { corretor: { modelo: corretor.modelo, ...(corretor.prompt ? { prompt: { nome: corretor.prompt.nome, hash: corretor.prompt.hash } } : {}), custo: corretor.custo } }
			: {}),
	};
}

/** O que gravarResposta fez. */
export interface RespostaGravada {
	/** O módulo novo (gravado). */
	modulo: ModuloGerado;
	aplicada: RespostaAplicada;
	/** Na pergunta e na dissertativa: a tentativa que o modelo vai conferir. */
	alvo?: AlvoConferencia;
	/** O evento gravado (quiz e "Não sei"). */
	evento?: Evento;
}

/**
 * Grava a resposta da tela (responderQuestao): o módulo inteiro, com a
 * tentativa ou o "Não sei", e, no quiz, o respondeu_questao (resultado
 * {tentativa, escolha, correta, confusao?, confianca, tempoMs}) ou, no "Não
 * sei", o nao_sabia_questao (resultado {tipo, tentativas}), com o id do
 * evento na tentativa ou no naoSei. A pergunta e a dissertativa só ganham o
 * evento quando a conferência chega (gravarConferencia); a resposta devolve o
 * alvo dela. Curso, módulo ou questão que não vale, ErroModulo (nada gravado).
 */
export async function gravarResposta(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	bloco: unknown,
	entrada: unknown,
	contexto: ContextoResposta = {},
): Promise<RespostaGravada> {
	const lido = await moduloGerado(dados, materia, curso, modulo);
	const agora = contexto.agora ?? new Date();
	const aplicada = responderQuestao(lido, bloco, entrada, agora);
	const { licao, bloco: questao, resposta, feito } = aplicada;
	let evento: Evento | undefined;
	if (feito.tipo === "nao_sei") {
		evento = criarEvento(
			{
				...daSessao(contexto),
				verbo: "nao_sabia_questao",
				objeto: objetoDo(lido, licao.id, questao),
				resultado: { tipo: questao.tipo, tentativas: feito.tentativasAntes },
				contexto: await contextoDoEvento(lido, licao.id, questao, contexto),
			},
			agora,
		);
		resposta.naoSei = { ...resposta.naoSei!, evento: evento.id };
	} else if (resposta.tipo === "alternativa") {
		const tentativa: TentativaAlternativa = resposta.tentativas[feito.numero - 1]!;
		evento = criarEvento(
			{
				...daSessao(contexto),
				verbo: "respondeu_questao",
				objeto: objetoDo(lido, licao.id, questao),
				resultado: {
					tentativa: feito.numero,
					escolha: tentativa.escolha,
					correta: tentativa.correta,
					...(tentativa.confusao ? { confusao: tentativa.confusao } : {}),
					confianca: resposta.confianca,
					tempoMs: tentativa.tempoMs,
				},
				contexto: await contextoDoEvento(lido, licao.id, questao, contexto),
			},
			agora,
		);
		tentativa.evento = evento.id;
	}
	await gravarModulo(dados, aplicada.modulo);
	if (evento) await acrescentarEvento(eventosAprendiz(dados), evento);
	const alvo = feito.tipo === "tentativa" && feito.aConferir ? alvoDaConferencia(aplicada.modulo, questao.id) : undefined;
	return { modulo: aplicada.modulo, aplicada, ...(alvo ? { alvo } : {}), ...(evento ? { evento } : {}) };
}

/**
 * A tentativa do bloco que espera a conferência, para corrigir (tentar de
 * novo): a resposta da versão atual com a última tentativa sem avaliação ou
 * correção. Quiz, sem resposta, ou já conferida, ErroModulo.
 */
export async function alvoParaCorrigir(dados: string, materia: string, curso: string, modulo: string, bloco: unknown): Promise<{ modulo: ModuloGerado; alvo: AlvoConferencia }> {
	const lido = await moduloGerado(dados, materia, curso, modulo);
	const alvo = alvoDaConferencia(lido, bloco);
	if (!alvo) throw new ErroModulo(`A questão ${String(bloco)} não tem resposta esperando a conferência do modelo.`);
	return { modulo: lido, alvo };
}

/**
 * Grava a conferência que chegou (aplicarConferencia) e o evento:
 * respondeu_verificacao (resultado {texto, avaliacao, retorno, confianca,
 * tempoMs}) ou respondeu_dissertativa (resultado {tentativa, texto, total,
 * max, criterios: [{criterio, pontos, max}], confianca, tempoMs}), com o
 * corretor no contexto e o id do evento na tentativa. Se a resposta mudou
 * enquanto era conferida (conferenciaVale: o módulo gerado de novo, o bloco
 * reescrito, a tentativa já conferida), nada é gravado e devolve undefined
 * (a conferência é jogada fora).
 */
export async function gravarConferencia(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	alvo: AlvoConferencia,
	conferencia: Conferencia,
	contexto: ContextoResposta & { corretor: Corretor },
): Promise<ModuloGerado | undefined> {
	const lido = await lerModulo(dados, materia, curso, modulo);
	if (!conferenciaVale(lido, alvo)) return undefined;
	const agora = contexto.agora ?? new Date();
	const aplicada = aplicarConferencia(lido!, alvo, conferencia, agora);
	const { licao, bloco, resposta } = aplicada;
	const tentativa = resposta.tentativas[alvo.tentativa - 1] as TentativaVerificacao | TentativaDissertativa;
	const resultado: Record<string, unknown> =
		resposta.tipo === "verificacao"
			? {
					texto: tentativa.texto,
					avaliacao: (tentativa as TentativaVerificacao).avaliacao,
					retorno: (tentativa as TentativaVerificacao).retorno,
					confianca: resposta.confianca,
					tempoMs: tentativa.tempoMs,
				}
			: dissertativaNoEvento(alvo.tentativa, tentativa as TentativaDissertativa, resposta);
	const evento = criarEvento(
		{
			...daSessao(contexto),
			verbo: resposta.tipo === "verificacao" ? "respondeu_verificacao" : "respondeu_dissertativa",
			objeto: objetoDo(aplicada.modulo, licao.id, bloco),
			resultado,
			contexto: await contextoDoEvento(aplicada.modulo, licao.id, bloco, contexto, contexto.corretor),
		},
		agora,
	);
	tentativa.evento = evento.id;
	await gravarModulo(dados, aplicada.modulo);
	await acrescentarEvento(eventosAprendiz(dados), evento);
	return aplicada.modulo;
}

/** O resultado do respondeu_dissertativa do módulo. */
function dissertativaNoEvento(numero: number, tentativa: TentativaDissertativa, resposta: RespostaModulo): Record<string, unknown> {
	const correcao = tentativa.correcao!;
	return {
		tentativa: numero,
		texto: tentativa.texto,
		total: correcao.total,
		max: correcao.max,
		criterios: correcao.criterios.map((item) => ({ criterio: item.criterio, pontos: item.pontos, max: item.max })),
		confianca: resposta.confianca,
		tempoMs: tentativa.tempoMs,
	};
}

/** "Ver a resposta-modelo" (encerrarQuestao): grava a dissertativa encerrada. Sem evento. */
export async function gravarEncerrada(dados: string, materia: string, curso: string, modulo: string, bloco: unknown, contexto: Pick<ContextoCurso, "agora"> = {}): Promise<ModuloGerado> {
	const lido = await moduloGerado(dados, materia, curso, modulo);
	const encerrada = encerrarQuestao(lido, bloco, contexto.agora ?? new Date());
	await gravarModulo(dados, encerrada.modulo);
	return encerrada.modulo;
}
