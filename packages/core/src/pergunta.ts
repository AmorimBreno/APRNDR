// ask_user_question no app (ESPECIFICACAO 13.9): a mesma ferramenta da versão
// de terminal (profiles/estudos/extensions/ask-user-question.ts, do learn),
// com o mesmo nome, os mesmos parâmetros e o mesmo resultado para o modelo,
// mas perguntando pela ponte de eventos em vez de desenhar no terminal. É do
// núcleo porque qualquer perfil pergunta; entra em toda sessão principal,
// como o subagent.
//
// O pedido vai para o painel "pergunta" (registrado pelo @estudos/ui), com o
// id da chamada da ferramenta. A interface responde com
// { escolhas: number[] (1 em diante, na ordem das opções), outra?: string,
// texto?: string }; o cancelamento chega como {cancelado: true, motivo}.

import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { EVENTOS_PONTE, type RespostaInterface } from "./ponte.ts";

export const NOME_FERRAMENTA_PERGUNTA = "ask_user_question";
/** Painel do front que mostra a pergunta. */
export const PAINEL_PERGUNTA = "pergunta";

export type ModoPergunta = "text" | "single-select" | "multi-select";

/** Opção como a interface recebe (já normalizada). */
export interface OpcaoPergunta {
	label: string;
	value: string;
	description?: string;
}

/** Dados do pedido "perguntar" no painel "pergunta". */
export interface DadosPedidoPergunta {
	question: string;
	details?: string;
	mode: ModoPergunta;
	options: OpcaoPergunta[];
	/** Rótulo da opção livre ("Outra"), quando há opções. */
	otherLabel?: string;
}

/** Resposta que a interface manda. */
export interface RespostaPergunta {
	/** Índices das opções escolhidas, de 1 em diante. */
	escolhas?: number[];
	/** Texto da opção "Outra". */
	outra?: string;
	/** Resposta livre (modo text). */
	texto?: string;
}

// Os tipos e textos abaixo seguem a versão de terminal, para o resultado ser igual.
type Resposta =
	| { type: "text"; label: string; value: string }
	| { type: "option"; label: string; value: string; index: number }
	| { type: "other"; label: string; value: string };
type Status = "answered" | "cancelled" | "unavailable";

interface DetalhesResultado {
	status: Status;
	question: string;
	context?: string;
	mode: ModoPergunta;
	answers: Resposta[];
	message?: string;
}

const OptionSchema = Type.Object({
	label: Type.String({
		description:
			'Display label for the option. If you recommend an option, place it first and append "(Recommended)" to the label.',
	}),
	value: Type.Optional(
		Type.String({
			description: "Optional machine-readable value returned for the option. Defaults to the label.",
		}),
	),
	description: Type.Optional(Type.String({ description: "Optional extra detail shown below the option." })),
});

const AskUserQuestionParams = Type.Object({
	question: Type.String({
		description: "The single question to ask the user. Ask exactly one question per tool call.",
	}),
	details: Type.Optional(
		Type.String({
			description: "Optional extra context or instructions shown under the question.",
		}),
	),
	options: Type.Optional(
		Type.Array(OptionSchema, {
			description:
				"Optional multiple-choice options. Omit or pass an empty array for free-form text input. Users will always be able to choose Other and type a custom answer when options are provided.",
		}),
	),
	multiSelect: Type.Optional(
		Type.Boolean({
			description: "Set to true to allow multiple answers to be selected for a question.",
		}),
	),
});

export function normalizarOpcoes(opcoes: Array<{ label: string; value?: string; description?: string }> | undefined): OpcaoPergunta[] {
	return (opcoes ?? [])
		.map((opcao) => {
			const label = opcao.label.trim();
			const descricao = opcao.description?.trim();
			return { label, value: opcao.value?.trim() || label, ...(descricao ? { description: descricao } : {}) };
		})
		.filter((opcao) => opcao.label.length > 0);
}

function rotuloOutra(opcoes: OpcaoPergunta[]): string {
	return opcoes.some((opcao) => opcao.label.toLowerCase() === "outra") ? "Outra (personalizada)" : "Outra";
}

function formatarParaModelo(resposta: Resposta): string {
	switch (resposta.type) {
		case "text":
			return resposta.label;
		case "other":
			return `Other: ${resposta.label}`;
		case "option":
			return `${resposta.index}. ${resposta.label}`;
	}
}

function detalhes(status: Status, question: string, mode: ModoPergunta, answers: Resposta[], context?: string, message?: string): DetalhesResultado {
	return { status, question, ...(context ? { context } : {}), mode, answers, ...(message ? { message } : {}) };
}

function resultadoCancelado(question: string, mode: ModoPergunta, context?: string) {
	const message = "User cancelled the question";
	return { content: [{ type: "text" as const, text: message }], details: detalhes("cancelled", question, mode, [], context, message) };
}

function resultadoIndisponivel(question: string, mode: ModoPergunta, message: string, context?: string) {
	return { content: [{ type: "text" as const, text: message }], details: detalhes("unavailable", question, mode, [], context, message) };
}

function resultadoRespondido(question: string, mode: ModoPergunta, answers: Resposta[], context?: string) {
	let text: string;
	if (mode === "text") {
		const resposta = answers[0];
		text = resposta && resposta.label.trim().length > 0 ? `User answered: ${resposta.label}` : "User submitted an empty response";
	} else if (mode === "single-select") {
		text = `User selected: ${formatarParaModelo(answers[0]!)}`;
	} else {
		text = `User selected:\n${answers.map((resposta) => `- ${formatarParaModelo(resposta)}`).join("\n")}`;
	}
	return { content: [{ type: "text" as const, text }], details: detalhes("answered", question, mode, answers, context) };
}

/**
 * Converte a resposta da interface nas respostas da versão de terminal.
 * Devolve uma mensagem de erro se ela não combina com o modo e as opções.
 */
export function interpretarResposta(dados: unknown, mode: ModoPergunta, opcoes: OpcaoPergunta[]): Resposta[] | string {
	if (!dados || typeof dados !== "object") return "a interface mandou uma resposta vazia";
	const { escolhas, outra, texto } = dados as RespostaPergunta;
	if (mode === "text") {
		const valor = typeof texto === "string" ? texto.trim() : "";
		return [{ type: "text", label: valor, value: valor }];
	}
	const indices = Array.isArray(escolhas) ? [...new Set(escolhas)].sort((a, b) => a - b) : [];
	if (indices.some((indice) => !Number.isInteger(indice) || indice < 1 || indice > opcoes.length)) {
		return "a interface mandou uma opção que não existe";
	}
	const respostas: Resposta[] = indices.map((indice) => {
		const opcao = opcoes[indice - 1]!;
		return { type: "option", label: opcao.label, value: opcao.value, index: indice };
	});
	const livre = typeof outra === "string" ? outra.trim() : "";
	if (livre) respostas.push({ type: "other", label: livre, value: livre });
	if (respostas.length === 0) return "a interface não mandou nenhuma escolha";
	if (mode === "single-select" && respostas.length > 1) return "a pergunta aceita uma escolha só";
	return respostas;
}

/** Emite o pedido e espera a resposta ou o cancelamento (docs/ponte-de-eventos.md). */
function perguntar(pi: ExtensionAPI, id: string, dados: DadosPedidoPergunta): Promise<RespostaInterface> {
	return new Promise((resolver) => {
		const parar = pi.events.on(EVENTOS_PONTE.resposta, (recebido) => {
			const resposta = recebido as RespostaInterface;
			if (resposta.id !== id) return;
			parar();
			resolver(resposta);
		});
		pi.events.emit(EVENTOS_PONTE.pedido, { id, painel: PAINEL_PERGUNTA, acao: "perguntar", dados });
	});
}

/** Extensão inline do núcleo com a ferramenta ask_user_question. */
export function criarExtensaoPergunta(): InlineExtension {
	return {
		name: "nucleo-pergunta",
		factory: (pi) => {
			pi.registerTool({
				name: NOME_FERRAMENTA_PERGUNTA,
				label: "ask_user_question",
				description:
					"Ask the user a single question and pause execution until they answer. Use this when requirements are ambiguous, user preferences are needed, a decision would materially affect implementation, or you need confirmation before proceeding. Ask exactly one question per tool call, and prefer multiple separate tool calls over bundling unrelated questions together.",
				promptSnippet:
					"Use this tool to ask exactly one clarifying question, missing-requirement question, preference question, or decision question before continuing.",
				promptGuidelines: [
					"Ask exactly one question per tool call.",
					"If you need answers to multiple questions, make multiple separate ask_user_question tool calls instead of combining them into one prompt.",
					'Users will always be able to select "Outra" (Other) to provide custom text input when options are provided.',
					"Use multiSelect: true only when you need multiple answers to the same question.",
					'If you recommend a specific option, make it the first option in the list and add "(Recommended)" at the end of the label.',
					"Prefer this tool over guessing when requirements, preferences, or implementation choices are unclear.",
					"Use this tool when multiple valid implementation paths exist and the preferred path depends on user choice.",
				],
				parameters: AskUserQuestionParams,
				async execute(idChamada, params, signal) {
					const opcoes = normalizarOpcoes(params.options);
					const contexto = params.details?.trim() || undefined;
					const modo: ModoPergunta = opcoes.length === 0 ? "text" : params.multiSelect ? "multi-select" : "single-select";
					if (signal?.aborted) return resultadoCancelado(params.question, modo, contexto);

					const resposta = await perguntar(pi, idChamada, {
						question: params.question,
						...(contexto ? { details: contexto } : {}),
						mode: modo,
						options: opcoes,
						...(opcoes.length > 0 ? { otherLabel: rotuloOutra(opcoes) } : {}),
					});
					if ("cancelado" in resposta) {
						if (resposta.motivo === "pedido_invalido") {
							return resultadoIndisponivel(params.question, modo, `ask_user_question: ${resposta.erro ?? "pedido inválido"}`, contexto);
						}
						return resultadoCancelado(params.question, modo, contexto);
					}
					const respostas = interpretarResposta(resposta.dados, modo, opcoes);
					if (typeof respostas === "string") {
						return resultadoIndisponivel(params.question, modo, `ask_user_question: ${respostas}`, contexto);
					}
					return resultadoRespondido(params.question, modo, respostas, contexto);
				},
			});
		},
	};
}
