// As partes puras do feedback na visão do módulo (docs/modulos.md, "O
// feedback", parte 3 do plano de 2026-10-28): no pé de cada bloco, o
// "Feedback" (o rótulo com a nota que vale, as teclas Ruim, Bom e Ótimo, a
// tecla marcada e o que o "Detalhar" leva para o balão de retorno); e, no fim
// de cada lição, o questionário "Como foi esta lição?" (o rascunho no estado
// local, o que falta para enviar, o que vai para a ponte e o cartão recolhido
// "Respostas enviadas em dd/mm").
// Sem React e sem o design system: os testes (feedback-tela.test.ts) rodam no
// Node. Os dados e as regras ficam no contrato, lib/modulo-feedback-tipos.ts.

import {
	AVALIACOES_BLOCO,
	type AvaliacaoNova,
	type FeedbackBloco,
	ehNivelLicao,
	type NivelLicao,
	NOMES_AVALIACAO,
	type NotasLicao,
	PERGUNTAS_LICAO,
	type PerguntaLicao,
	type QuestionarioLicao,
	TEXTO_QUESTIONARIO_MAXIMO,
	validarQuestionario,
} from "../../lib/modulo-feedback-tipos.ts";
import { diaEMes } from "./modulo-tela.ts";

// --- O feedback de cada bloco ---------------------------------------------------------

export const ROTULO_FEEDBACK = "Feedback";
export const ROTULO_DETALHAR = "Detalhar";

/** O botão do pé do bloco: "Feedback" ou, com a nota que vale para a versão atual (feedbackDoBloco), "Feedback: Bom". */
export function rotuloDoFeedback(nota?: Pick<FeedbackBloco, "avaliacao">): string {
	return nota ? `${ROTULO_FEEDBACK}: ${NOMES_AVALIACAO[nota.avaliacao]}` : ROTULO_FEEDBACK;
}

/** As teclas da nota rápida, na ordem da tela: Ruim, Bom e Ótimo. */
export const OPCOES_DA_NOTA: ReadonlyArray<{ valor: AvaliacaoNova; texto: string }> = AVALIACOES_BLOCO.map((valor) => ({ valor, texto: NOMES_AVALIACAO[valor] }));

/** A tecla marcada: a nota que está sendo gravada agora (pendente) ou, sem ela, a que vale. */
export const notaMarcada = (pendente: AvaliacaoNova | undefined, valendo: Pick<FeedbackBloco, "avaliacao"> | undefined): AvaliacaoNova | undefined =>
	pendente ?? valendo?.avaliacao;

/**
 * O que o "Detalhar" leva para o balão: a nota marcada e o id do evento da
 * nota que vale (o detalha). Com uma nota diferente ainda sendo gravada, sem o
 * evento: a que vale não é mais a marcada, e a nova ainda não tem id.
 */
export function notaParaDetalhar(
	pendente: AvaliacaoNova | undefined,
	valendo: Pick<FeedbackBloco, "avaliacao" | "evento"> | undefined,
): { avaliacao?: AvaliacaoNova; evento?: string } {
	const avaliacao = notaMarcada(pendente, valendo);
	const evento = valendo && (pendente === undefined || pendente === valendo.avaliacao) ? valendo.evento : undefined;
	return { ...(avaliacao ? { avaliacao } : {}), ...(evento ? { evento } : {}) };
}

// --- O questionário do fim da lição ---------------------------------------------------

export const TITULO_QUESTIONARIO = "Como foi esta lição?";
export const LINHA_QUESTIONARIO = "Opcional. Ajuda o professor a ajustar o jeito de ensinar.";
export const ROTULO_TEXTO_QUESTIONARIO = "Quer dizer mais alguma coisa?";
export const ROTULO_ENVIADO = "Respostas enviadas";

/** O que o Breno marcou no questionário, no estado local até o envio. */
export interface RascunhoQuestionario {
	/** Só as perguntas tocadas. */
	notas: NotasLicao;
	texto: string;
}

export const rascunhoVazio = (): RascunhoQuestionario => ({ notas: {}, texto: "" });

/** "Responder de novo": o rascunho com as notas (e o texto) da última vez; sem envio, vazio. */
export function rascunhoDoEnviado(enviado?: Partial<Pick<QuestionarioLicao, "notas" | "texto">>): RascunhoQuestionario {
	const notas: NotasLicao = {};
	for (const { id } of PERGUNTAS_LICAO) {
		const nota = enviado?.notas?.[id];
		if (ehNivelLicao(nota)) notas[id] = nota;
	}
	return { notas, texto: typeof enviado?.texto === "string" ? enviado.texto : "" };
}

/** A nota de uma pergunta no rascunho; não tocada, null (a PerguntaSlider vazia). */
export const notaDaPergunta = (rascunho: RascunhoQuestionario, pergunta: PerguntaLicao): NivelLicao | null => rascunho.notas[pergunta] ?? null;

/** Muda a nota de uma pergunta (as outras ficam). */
export function mudarNota(rascunho: RascunhoQuestionario, pergunta: PerguntaLicao, nivel: NivelLicao): RascunhoQuestionario {
	return { ...rascunho, notas: { ...rascunho.notas, [pergunta]: nivel } };
}

/** Quantas perguntas foram respondidas. */
export const respondidas = (rascunho: RascunhoQuestionario): number => PERGUNTAS_LICAO.filter(({ id }) => ehNivelLicao(rascunho.notas[id])).length;

/** O que falta para enviar, numa frase; pronto, undefined. "Enviar" fica ligado sem problema. */
export function problemaDoQuestionario(rascunho: RascunhoQuestionario): string | undefined {
	if (respondidas(rascunho) === 0) return "Responda pelo menos uma pergunta.";
	const texto = rascunho.texto.trim();
	if (texto.length > TEXTO_QUESTIONARIO_MAXIMO) return `O texto tem ${texto.length} caracteres; o máximo é ${TEXTO_QUESTIONARIO_MAXIMO}.`;
	return undefined;
}

/**
 * O questionário para a ponte (avaliar_licao), conferido como a extensão
 * confere (validarQuestionario): as notas na ordem das perguntas e o texto só
 * se não for vazio. Com algo faltando, um Error com a frase.
 */
export function dadosDoQuestionario(rascunho: RascunhoQuestionario): { notas: NotasLicao; texto?: string } {
	const problema = problemaDoQuestionario(rascunho);
	if (problema) throw new Error(problema);
	const conferido = validarQuestionario({ notas: rascunho.notas, texto: rascunho.texto });
	return { notas: conferido.notas, ...(conferido.texto ? { texto: conferido.texto } : {}) };
}

/** O título do cartão recolhido: "Respostas enviadas em 28/10" (sem data legível, "Respostas enviadas"). */
export function tituloDoEnviado(enviado: Pick<QuestionarioLicao, "em">): string {
	const dia = diaEMes(enviado.em);
	return dia ? `${ROTULO_ENVIADO} em ${dia}` : ROTULO_ENVIADO;
}
