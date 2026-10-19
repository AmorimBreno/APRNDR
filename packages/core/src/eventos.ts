// Eventos do núcleo: a tradução dos eventos de uma sessão do pi para um tipo
// genérico, que o servidor e o front usam no protocolo. Nada aqui conhece um
// perfil específico: só execução, texto, raciocínio, ferramenta, uso, erro e
// as mensagens da ponte de interface (painel, ação e dados, sem interpretar).
//
// Fontes no pi: AgentSessionEvent (sdk.md, "Subscribing to events") e os tipos
// de mensagem de message-types.md. "agent_end" marca o fim de uma execução de
// baixo nível, mas o pi ainda pode continuar sozinho (nova tentativa, fila);
// "agent_settled" é o fim de verdade, por isso fecha a execução aqui.

import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { SituacaoMaterial } from "./materiais/tipos.ts";

/** Diagnóstico de montagem ou de execução (por exemplo, ferramenta inexistente). */
export interface Diagnostico {
	nivel: "info" | "aviso" | "erro";
	mensagem: string;
}

/** Uso e custo de uma resposta do modelo. Custo em dólares, como o pi informa. */
export interface UsoModelo {
	tokensEntrada: number;
	tokensSaida: number;
	tokensCacheLeitura: number;
	tokensCacheEscrita: number;
	tokensTotal: number;
	custo: number;
}

/** Estado de uma janela de perfil: qual sessão, agente, modelo e recursos estão ativos. */
export interface EstadoSessao {
	/** id do perfil. */
	perfil: string;
	sessaoId: string;
	/** Arquivo JSONL da sessão. Só existe em disco depois da primeira mensagem. */
	arquivo?: string;
	agente: string;
	/** Modelo no formato provedor/id. */
	modelo?: string;
	raciocinio: string;
	ferramentas: string[];
	skills: string[];
	diagnosticos: Diagnostico[];
	/** O assunto da sessão (ContextoSessao, sem as instruções e o escopo), se ela tiver um. */
	contexto?: { chave: string; rotulo: string; cor?: string };
}

/**
 * Por que um pedido da interface foi cancelado sem resposta do usuário:
 * - abortado: a execução foi interrompida (JanelaPerfil.abortar);
 * - execucao_terminada: a execução acabou e ninguém mais espera a resposta;
 * - sessao_encerrada: a sessão foi trocada, recarregada ou a janela descartada;
 * - pedido_invalido: o pedido veio sem painel ou sem ação;
 * - usuario: o usuário cancelou o pedido na interface (JanelaPerfil.cancelarPedido).
 */
export type MotivoCancelamento = "abortado" | "execucao_terminada" | "sessao_encerrada" | "pedido_invalido" | "usuario";

export type EventoNucleo =
	/** A sessão começou a responder. */
	| { tipo: "execucao_inicio" }
	/** A sessão terminou de verdade (agent_settled): não vai continuar sozinha. */
	| { tipo: "execucao_fim"; abortada: boolean }
	| { tipo: "mensagem_usuario"; texto: string; momento?: string }
	| { tipo: "texto_delta"; delta: string }
	| { tipo: "raciocinio_delta"; delta: string }
	/** Mensagem do assistente concluída. `erro` vem quando o provedor falhou. */
	| {
			tipo: "mensagem_assistente";
			texto: string;
			raciocinio: string;
			modelo: string;
			motivoParada: string;
			erro?: string;
			/** Quando o pedido ao modelo começou (ISO 8601). */
			momento?: string;
			/** Quanto a resposta levou, em ms (o pi mede; falta em mensagens antigas). */
			duracaoMs?: number;
			/** Tokens e custo desta resposta. */
			uso?: UsoModelo;
	  }
	/** `idPai` existe quando outra ferramenta fez a chamada (ctx.executeTool). */
	| { tipo: "ferramenta_inicio"; id: string; nome: string; argumentos: unknown; idPai?: string }
	| { tipo: "ferramenta_progresso"; id: string; nome: string; resumo: string; idPai?: string }
	| { tipo: "ferramenta_fim"; id: string; nome: string; erro: boolean; resumo: string; duracaoMs?: number; idPai?: string }
	/**
	 * Uso e custo de uma resposta. Quando vem de uma sessão filha (subagente),
	 * `agente` é o agente da filha e `idFerramenta` é a chamada subagent que a criou.
	 */
	| ({ tipo: "uso"; modelo: string; agente?: string; idFerramenta?: string } & UsoModelo)
	/** Mensagens esperando na fila (enviadas enquanto a sessão respondia). */
	| { tipo: "fila"; mensagens: string[] }
	| { tipo: "erro"; origem: "modelo" | "extensao" | "nucleo"; mensagem: string }
	| ({ tipo: "diagnostico" } & Diagnostico)
	/** Mudou a sessão, o agente, o modelo ou os recursos ativos. */
	| { tipo: "estado_sessao"; estado: EstadoSessao }
	/** Serviço de materiais: a situação de todos os arquivos das pastas observadas mudou. */
	| { tipo: "materiais"; materiais: SituacaoMaterial[] }
	/** Ponte: uma ferramenta pediu para mostrar algo num painel ("interface:mostrar"). */
	| { tipo: "acao_interface"; painel: string; acao: string; dados: unknown }
	/** Ponte: uma ferramenta espera a resposta do usuário ("interface:pedido"); responda com JanelaPerfil.responder. */
	| { tipo: "pedido_interface"; id: string; painel: string; acao: string; dados: unknown }
	/** Ponte: o pedido `id` não espera mais resposta (a ferramenta recebeu o cancelamento). */
	| { tipo: "pedido_interface_cancelado"; id: string; motivo: MotivoCancelamento };

/** Item do histórico de uma sessão, para mostrar a conversa ao reabrir. */
export type ItemHistorico =
	| { papel: "usuario"; texto: string; momento?: string }
	| {
			papel: "assistente";
			texto: string;
			raciocinio: string;
			modelo: string;
			ferramentas: Array<{ id: string; nome: string; argumentos: unknown }>;
			erro?: string;
			/** Quando o pedido ao modelo começou (ISO 8601). */
			momento?: string;
			duracaoMs?: number;
			uso?: UsoModelo;
			/** Agente que respondeu (a entrada nucleo.agente vigente na hora). */
			agente?: string;
	  }
	| { papel: "ferramenta"; id: string; nome: string; erro: boolean; resumo: string };

type MensagemPi = AgentSession["messages"][number];

const LIMITE_RESUMO = 200;

function encurtar(texto: string, limite: number): string {
	const limpo = texto.replace(/\s+/g, " ").trim();
	return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

/** Junta os blocos de um conteúdo do pi (string ou lista de blocos) do tipo pedido. */
function juntarBlocos(conteudo: unknown, tipo: "text" | "thinking"): string {
	if (typeof conteudo === "string") return tipo === "text" ? conteudo : "";
	if (!Array.isArray(conteudo)) return "";
	const partes: string[] = [];
	for (const bloco of conteudo) {
		if (bloco && typeof bloco === "object" && "type" in bloco && bloco.type === tipo) {
			const valor = tipo === "text" ? (bloco as { text?: unknown }).text : (bloco as { thinking?: unknown }).thinking;
			if (typeof valor === "string") partes.push(valor);
		}
	}
	return partes.join("");
}

/**
 * Resumo curto do resultado de uma ferramenta: o texto do `content`, numa linha,
 * com até `limite` caracteres. Imagens viram "[imagem]".
 */
export function resumirResultado(resultado: unknown, limite = LIMITE_RESUMO): string {
	if (typeof resultado === "string") return encurtar(resultado, limite);
	if (!resultado || typeof resultado !== "object") return "";
	const conteudo = (resultado as { content?: unknown }).content;
	if (!Array.isArray(conteudo)) return "";
	const partes: string[] = [];
	for (const bloco of conteudo) {
		if (!bloco || typeof bloco !== "object") continue;
		const tipo = (bloco as { type?: unknown }).type;
		if (tipo === "text" && typeof (bloco as { text?: unknown }).text === "string") {
			partes.push((bloco as { text: string }).text);
		} else if (tipo === "image") {
			partes.push("[imagem]");
		}
	}
	return encurtar(partes.join(" "), limite);
}

function lerUso(uso: unknown): UsoModelo | undefined {
	if (!uso || typeof uso !== "object") return undefined;
	const u = uso as {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		totalTokens?: number;
		cost?: { total?: number };
	};
	return {
		tokensEntrada: u.input ?? 0,
		tokensSaida: u.output ?? 0,
		tokensCacheLeitura: u.cacheRead ?? 0,
		tokensCacheEscrita: u.cacheWrite ?? 0,
		tokensTotal: u.totalTokens ?? 0,
		custo: u.cost?.total ?? 0,
	};
}

function nomeModeloDaMensagem(mensagem: { provider?: string; model?: string }): string {
	return mensagem.provider && mensagem.model ? `${mensagem.provider}/${mensagem.model}` : (mensagem.model ?? "");
}

function idPai(evento: { parentToolCallId?: string }): { idPai?: string } {
	return evento.parentToolCallId ? { idPai: evento.parentToolCallId } : {};
}

/**
 * Cria um tradutor de eventos para uma sessão. Ele guarda se há execução em
 * andamento, para emitir um único "execucao_inicio" mesmo quando o pi faz várias
 * execuções de baixo nível (nova tentativa, fila) antes de "agent_settled".
 */
export function criarTradutorEventos(): (evento: AgentSessionEvent) => EventoNucleo[] {
	let emExecucao = false;

	return (evento) => {
		switch (evento.type) {
			case "agent_start":
				if (emExecucao) return [];
				emExecucao = true;
				return [{ tipo: "execucao_inicio" }];

			case "agent_settled":
				emExecucao = false;
				return [{ tipo: "execucao_fim", abortada: evento.aborted }];

			case "message_update": {
				const parcial = evento.assistantMessageEvent;
				if (parcial.type === "text_delta") return [{ tipo: "texto_delta", delta: parcial.delta }];
				if (parcial.type === "thinking_delta") return [{ tipo: "raciocinio_delta", delta: parcial.delta }];
				return [];
			}

			case "message_end": {
				const mensagem = evento.message;
				if (mensagem.role === "user") {
					const momento = momentoDe((mensagem as { timestamp?: unknown }).timestamp);
					return [{ tipo: "mensagem_usuario", texto: juntarBlocos(mensagem.content, "text"), ...(momento ? { momento } : {}) }];
				}
				if (mensagem.role !== "assistant") return [];
				const modelo = nomeModeloDaMensagem(mensagem);
				const uso = lerUso(mensagem.usage);
				const saida: EventoNucleo[] = [
					{
						tipo: "mensagem_assistente",
						texto: juntarBlocos(mensagem.content, "text"),
						raciocinio: juntarBlocos(mensagem.content, "thinking"),
						modelo,
						motivoParada: mensagem.stopReason,
						...(mensagem.stopReason === "error" ? { erro: mensagem.errorMessage ?? "erro do provedor" } : {}),
						...dadosDaResposta(mensagem, uso),
					},
				];
				if (uso && (uso.tokensTotal > 0 || uso.custo > 0)) saida.push({ tipo: "uso", modelo, ...uso });
				if (mensagem.stopReason === "error") {
					saida.push({ tipo: "erro", origem: "modelo", mensagem: mensagem.errorMessage ?? "erro do provedor" });
				}
				return saida;
			}

			case "tool_execution_start":
				return [
					{ tipo: "ferramenta_inicio", id: evento.toolCallId, nome: evento.toolName, argumentos: evento.args, ...idPai(evento) },
				];

			case "tool_execution_update":
				return [
					{
						tipo: "ferramenta_progresso",
						id: evento.toolCallId,
						nome: evento.toolName,
						resumo: resumirResultado(evento.partialResult),
						...idPai(evento),
					},
				];

			case "tool_execution_end":
				return [
					{
						tipo: "ferramenta_fim",
						id: evento.toolCallId,
						nome: evento.toolName,
						erro: evento.isError,
						resumo: resumirResultado(evento.result),
						...(evento.durationMs !== undefined ? { duracaoMs: evento.durationMs } : {}),
						...idPai(evento),
					},
				];

			case "queue_update":
				return [{ tipo: "fila", mensagens: [...evento.steering, ...evento.followUp] }];

			case "auto_retry_start":
				return [
					{
						tipo: "diagnostico",
						nivel: "aviso",
						mensagem: `Falha do provedor (${evento.errorMessage}); nova tentativa ${evento.attempt} de ${evento.maxAttempts} em ${Math.round(evento.delayMs / 1000)} s.`,
					},
				];

			case "auto_retry_end":
				return evento.success
					? []
					: [{ tipo: "erro", origem: "modelo", mensagem: evento.finalError ?? "as novas tentativas falharam" }];

			case "compaction_start":
				return [{ tipo: "diagnostico", nivel: "info", mensagem: `Compactando a conversa (${evento.reason}).` }];

			case "compaction_end":
				return evento.errorMessage
					? [{ tipo: "erro", origem: "nucleo", mensagem: `Falha ao compactar a conversa: ${evento.errorMessage}` }]
					: [];

			default:
				return [];
		}
	};
}

/** Momento ISO de um timestamp em ms, se ele for válido. */
function momentoDe(timestamp: unknown): string | undefined {
	return typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : undefined;
}

/** Momento, duração e uso de uma resposta do modelo, quando a mensagem os tem. */
function dadosDaResposta(mensagem: { timestamp?: unknown; durationMs?: unknown }, uso: UsoModelo | undefined): { momento?: string; duracaoMs?: number; uso?: UsoModelo } {
	const momento = momentoDe(mensagem.timestamp);
	const duracaoMs = typeof mensagem.durationMs === "number" && Number.isFinite(mensagem.durationMs) ? mensagem.durationMs : undefined;
	return {
		...(momento ? { momento } : {}),
		...(duracaoMs !== undefined ? { duracaoMs } : {}),
		...(uso && (uso.tokensTotal > 0 || uso.custo > 0) ? { uso } : {}),
	};
}

/**
 * Converte as mensagens de uma sessão do pi no histórico genérico.
 * `agentes`: agente de cada resposta, pelo timestamp da mensagem (agentesPorMomento, em sessoes.ts).
 */
export function converterHistorico(mensagens: readonly MensagemPi[], agentes?: ReadonlyMap<number, string>): ItemHistorico[] {
	const historico: ItemHistorico[] = [];
	for (const mensagem of mensagens) {
		if (mensagem.role === "user") {
			const momento = momentoDe((mensagem as { timestamp?: unknown }).timestamp);
			historico.push({ papel: "usuario", texto: juntarBlocos(mensagem.content, "text"), ...(momento ? { momento } : {}) });
		} else if (mensagem.role === "assistant") {
			const ferramentas: Array<{ id: string; nome: string; argumentos: unknown }> = [];
			for (const bloco of mensagem.content) {
				if (bloco.type === "toolCall") ferramentas.push({ id: bloco.id, nome: bloco.name, argumentos: bloco.arguments });
			}
			historico.push({
				papel: "assistente",
				texto: juntarBlocos(mensagem.content, "text"),
				raciocinio: juntarBlocos(mensagem.content, "thinking"),
				modelo: nomeModeloDaMensagem(mensagem),
				ferramentas,
				...(mensagem.stopReason === "error" ? { erro: mensagem.errorMessage ?? "erro do provedor" } : {}),
				...dadosDaResposta(mensagem, lerUso(mensagem.usage)),
				...(agentes?.get(mensagem.timestamp) ? { agente: agentes.get(mensagem.timestamp)! } : {}),
			});
		} else if (mensagem.role === "toolResult") {
			historico.push({
				papel: "ferramenta",
				id: mensagem.toolCallId,
				nome: mensagem.toolName,
				erro: mensagem.isError,
				resumo: resumirResultado(mensagem),
			});
		}
	}
	return historico;
}
