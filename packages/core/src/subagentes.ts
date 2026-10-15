// Subagentes: a ferramenta `subagent` que o núcleo registra na sessão principal
// de cada janela. Ela cria uma sessão filha pelo SDK com o agente pedido, manda
// a tarefa, mostra o progresso como atualizações da própria ferramenta e devolve
// o texto final da filha, inteiro (é o entregável dela).
//
// O nome e os parâmetros são os que as skills do learn já usam
// (`subagent(agent="mermaid-maker", task="...")`, skills/visualize/SKILL.md), para
// elas não mudarem.
//
// A sessão filha é montada pelo mesmo caminho da principal (montagem.ts e
// montarOpcoesRecursos), no modo "subagente":
// - modelo e raciocínio do agente (frontmatter ou profile.json);
// - prompt = padrão do pi + AGENTS.md do perfil + corpo do agente;
// - skills e ferramentas: só as que o agente declara (nenhuma, se não declarar);
//   as declaradas que não existem viram diagnóstico;
// - extensões: as globais, as do perfil e as extensoesSubagentes do perfil;
//   nenhuma extensão do núcleo, então a filha não tem subagent (sem recursão)
//   nem a ponte de interface;
// - cwd = pasta de dados, sem arquivos de contexto descobertos;
// - gravada em <pasta de dados>/.sessoes-pi/subagentes/ para rastreio (fora da
//   lista de sessões do perfil, que não olha subpastas).
//
// Decisões, com a documentação do pi (1.2.0):
// - Progresso pelo onUpdate do execute (extensions.md, "Tools"; o pi emite
//   tool_execution_update, que a JanelaPerfil traduz em ferramenta_progresso).
// - Uso da filha no `usage` do resultado (extensions.md: "If the tool makes
//   nested model calls, include their usage in the result so session totals
//   remain accurate"; getSessionStats soma o usage dos toolResult), no details e
//   num EventoNucleo "uso" com o modelo da filha.
// - Falha da filha volta como resultado com isError e details, em vez de lançar
//   (extensions.md: "To report a failure that still carries data, return the
//   result with isError: true instead of throwing"), para o uso não se perder.
//   Erros antes de a filha existir (agente ou modelo inválido) são lançados.
// - Abortar a execução pai aborta a filha: o signal do execute vira abort() da
//   sessão filha.

import { mkdir } from "node:fs/promises";
import {
	type AgentSession,
	type AgentToolResult,
	type InlineExtension,
	type ModelRuntime,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { criarTradutorEventos, type Diagnostico, type EventoNucleo, type UsoModelo } from "./eventos.ts";
import { criarSessaoPi, encerrarSessaoPi, ligarSessaoPi } from "./montagem.ts";
import { interpretarRaciocinio, nomeDoModelo, resolverModelo } from "./modelos.ts";
import type { AgenteDoPerfil, Perfil } from "./perfis.ts";
import { acharAgente, pastaSubagentes, TIPO_ENTRADA_AGENTE, TIPO_ENTRADA_SUBAGENTE } from "./sessoes.ts";

/** Nome da ferramenta, igual ao que as skills usam. */
export const NOME_FERRAMENTA_SUBAGENTE = "subagent";

/** Uso no formato do pi (o `usage` de AgentToolResult). */
export type UsoPi = NonNullable<AgentToolResult<unknown>["usage"]>;

/** O que a sessão principal sabe para criar filhas. */
export interface ContextoSubagentes {
	perfil: Perfil;
	/** Pasta global do pi (~/.pi/agent). */
	pastaPi: string;
	registro: ModelRuntime;
}

/** O que a ferramenta precisa além do contexto: o agente da sessão principal e a saída de eventos. */
export interface ContextoFerramentaSubagente extends ContextoSubagentes {
	/** Agente da sessão principal; fica fora da lista de agentes da descrição da ferramenta. */
	agentePrincipal: string;
	/** Eventos da janela (o uso da filha sai por aqui). */
	emitir: (evento: EventoNucleo) => void;
}

export interface SessaoFilha {
	sessao: AgentSession;
	agente: AgenteDoPerfil;
	diagnosticos: Diagnostico[];
}

/** details do resultado (e das atualizações) da ferramenta subagent. */
export interface DetalhesSubagente {
	agente: string;
	/** Modelo da filha, no formato provedor/id. */
	modelo?: string;
	sessaoId: string;
	/** Arquivo JSONL da sessão filha (existe depois da primeira resposta). */
	arquivo?: string;
	estado: "rodando" | "concluido" | "erro" | "abortado";
	/** Chamadas de ferramenta feitas pela filha. */
	ferramentas: number;
	uso: UsoModelo;
	duracaoMs: number;
	diagnosticos: Diagnostico[];
}

function mensagemDe(erro: unknown): string {
	return erro instanceof Error ? erro.message : String(erro);
}

function encurtar(texto: string, limite: number): string {
	const limpo = texto.replace(/\s+/g, " ").trim();
	return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

/** Primeiro argumento de texto de uma chamada de ferramenta, curto e entre aspas simples. */
export function descreverArgumentos(argumentos: unknown, limite = 60): string {
	if (!argumentos || typeof argumentos !== "object") return "";
	for (const valor of Object.values(argumentos as Record<string, unknown>)) {
		if (typeof valor === "string" && valor.trim()) return `'${encurtar(valor, limite)}'`;
	}
	return "";
}

/**
 * Transforma os eventos da sessão filha em frases curtas de progresso, por
 * exemplo "researcher: web_search 'r2 ajustado'". Devolve undefined quando o
 * evento não muda o que a filha está fazendo. Texto chegando gera no máximo
 * uma frase a cada `intervaloTextoMs`. O início ("começou", com o modelo) é
 * avisado por executarSubagente, não aqui.
 */
export function criarAcompanhamento(
	agente: string,
	opcoes: { intervaloTextoMs?: number; agora?: () => number } = {},
): (evento: EventoNucleo) => string | undefined {
	const intervalo = opcoes.intervaloTextoMs ?? 1000;
	const agora = opcoes.agora ?? Date.now;
	let texto = "";
	let ultimoTexto = Number.NEGATIVE_INFINITY;
	let pensando = false;
	return (evento) => {
		switch (evento.tipo) {
			case "raciocinio_delta":
				if (pensando) return undefined;
				pensando = true;
				return `${agente}: pensando`;
			case "texto_delta": {
				texto += evento.delta;
				const momento = agora();
				if (momento - ultimoTexto < intervalo) return undefined;
				ultimoTexto = momento;
				return `${agente}: escrevendo: ${encurtar(texto.slice(-200), 80)}`;
			}
			case "mensagem_assistente":
				texto = "";
				pensando = false;
				ultimoTexto = Number.NEGATIVE_INFINITY;
				return undefined;
			case "ferramenta_inicio": {
				const argumentos = descreverArgumentos(evento.argumentos);
				return `${agente}: ${evento.nome}${argumentos ? ` ${argumentos}` : ""}`;
			}
			case "ferramenta_fim":
				return `${agente}: ${evento.nome} ${evento.erro ? "falhou" : "terminou"}`;
			default:
				return undefined;
		}
	};
}

function usoVazio(): UsoPi {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

/** Soma o uso das respostas do modelo numa lista de mensagens do pi. */
export function somarUso(mensagens: AgentSession["messages"]): UsoPi {
	const total = usoVazio();
	for (const mensagem of mensagens) {
		if (mensagem.role !== "assistant" || !mensagem.usage) continue;
		const uso = mensagem.usage;
		total.input += uso.input ?? 0;
		total.output += uso.output ?? 0;
		total.cacheRead += uso.cacheRead ?? 0;
		total.cacheWrite += uso.cacheWrite ?? 0;
		total.totalTokens += uso.totalTokens ?? 0;
		total.cost.input += uso.cost?.input ?? 0;
		total.cost.output += uso.cost?.output ?? 0;
		total.cost.cacheRead += uso.cost?.cacheRead ?? 0;
		total.cost.cacheWrite += uso.cost?.cacheWrite ?? 0;
		total.cost.total += uso.cost?.total ?? 0;
	}
	return total;
}

function usoDoNucleo(uso: UsoPi): UsoModelo {
	return {
		tokensEntrada: uso.input,
		tokensSaida: uso.output,
		tokensCacheLeitura: uso.cacheRead,
		tokensCacheEscrita: uso.cacheWrite,
		tokensTotal: uso.totalTokens,
		custo: uso.cost.total,
	};
}

/**
 * Monta a sessão filha do agente `nomeAgente`, já com as extensões ligadas e as
 * ferramentas filtradas, pronta para receber a tarefa. Lança erro se o agente
 * não existe ou se o modelo dele não está disponível.
 */
export async function montarSessaoFilha(
	contexto: ContextoSubagentes,
	nomeAgente: string,
	vinculo: { sessaoPai?: string; idFerramenta?: string } = {},
	aoErroExtensao: (mensagem: string) => void = () => {},
): Promise<SessaoFilha> {
	const { perfil, registro } = contexto;
	const agente = acharAgente(perfil, nomeAgente);
	const modelo = agente.modelo ? resolverModelo(registro, agente.modelo) : undefined;
	const diagnosticos: Diagnostico[] = [];
	await mkdir(pastaSubagentes(perfil), { recursive: true });
	const gerente = SessionManager.create(perfil.pastaDados, pastaSubagentes(perfil));
	const sessao = await criarSessaoPi({
		perfil,
		agente,
		modo: "subagente",
		pastaPi: contexto.pastaPi,
		registro,
		gerente,
		inicio: { type: "session_start", reason: "startup" },
		modelo,
		raciocinio: interpretarRaciocinio(agente.definicao.raciocinio).nivel,
		extensoesNucleo: [],
		diagnosticos,
	});
	gerente.appendCustomEntry(TIPO_ENTRADA_AGENTE, { agente: agente.nome });
	gerente.appendCustomEntry(TIPO_ENTRADA_SUBAGENTE, vinculo);
	try {
		await ligarSessaoPi(sessao, agente, "subagente", diagnosticos, aoErroExtensao);
	} catch (erro) {
		sessao.dispose();
		throw erro;
	}
	return { sessao, agente, diagnosticos };
}

export interface PedidoSubagente {
	agente: string;
	tarefa: string;
	/** id da chamada subagent na sessão principal. */
	idFerramenta: string;
	/** id da sessão principal, gravado na filha para rastreio. */
	sessaoPai?: string;
	signal?: AbortSignal;
	/** Recebe cada frase de progresso e os details parciais. */
	aoProgresso?: (resumo: string, detalhes: DetalhesSubagente) => void;
	/** Recebe os eventos da filha já traduzidos e os diagnósticos da montagem dela. */
	aoEvento?: (evento: EventoNucleo) => void;
}

/**
 * Roda a tarefa num subagente e devolve o resultado da ferramenta: o texto
 * final da filha ou, se ela falhar, um resultado com isError. Erros de
 * montagem (agente ou modelo inválido) são lançados.
 */
export async function executarSubagente(
	contexto: ContextoSubagentes,
	pedido: PedidoSubagente,
): Promise<AgentToolResult<DetalhesSubagente>> {
	const inicio = Date.now();
	const errosExtensao: string[] = [];
	const filha = await montarSessaoFilha(
		contexto,
		pedido.agente,
		{ ...(pedido.sessaoPai ? { sessaoPai: pedido.sessaoPai } : {}), idFerramenta: pedido.idFerramenta },
		(mensagem) => errosExtensao.push(mensagem),
	);
	const { sessao, agente, diagnosticos } = filha;
	// Diagnósticos da montagem (por exemplo, ferramenta declarada que não existe) também saem como eventos.
	for (const diagnostico of diagnosticos) {
		pedido.aoEvento?.({ tipo: "diagnostico", nivel: diagnostico.nivel, mensagem: `subagente ${agente.nome}: ${diagnostico.mensagem}` });
	}
	let ferramentas = 0;
	const detalhes = (estado: DetalhesSubagente["estado"]): DetalhesSubagente => ({
		agente: agente.nome,
		...(sessao.model ? { modelo: nomeDoModelo(sessao.model) } : {}),
		sessaoId: sessao.sessionId,
		...(sessao.sessionFile ? { arquivo: sessao.sessionFile } : {}),
		estado,
		ferramentas,
		uso: usoDoNucleo(somarUso(sessao.messages)),
		duracaoMs: Date.now() - inicio,
		diagnosticos: [...diagnosticos, ...errosExtensao.map((mensagem): Diagnostico => ({ nivel: "erro", mensagem }))],
	});

	const traduzir = criarTradutorEventos();
	const acompanhar = criarAcompanhamento(agente.nome);
	const cancelarAssinatura = sessao.subscribe((eventoPi) => {
		for (const evento of traduzir(eventoPi)) {
			if (evento.tipo === "ferramenta_inicio") ferramentas++;
			pedido.aoEvento?.(evento);
			const resumo = acompanhar(evento);
			if (resumo) pedido.aoProgresso?.(resumo, detalhes("rodando"));
		}
	});
	const abortarFilha = () => {
		void sessao.abort();
	};
	pedido.signal?.addEventListener("abort", abortarFilha, { once: true });

	try {
		let falha: string | undefined;
		if (pedido.signal?.aborted) {
			falha = "interrompido antes de começar";
		} else {
			pedido.aoProgresso?.(`${agente.nome}: começou${sessao.model ? ` (${nomeDoModelo(sessao.model)})` : ""}`, detalhes("rodando"));
			try {
				await sessao.prompt(pedido.tarefa);
			} catch (erro) {
				falha = mensagemDe(erro);
			}
		}

		const ultima = [...sessao.messages].reverse().find((mensagem) => mensagem.role === "assistant");
		const abortada = pedido.signal?.aborted || ultima?.stopReason === "aborted";
		if (!falha && ultima?.stopReason === "error") falha = ultima.errorMessage ?? "erro do provedor";
		const texto = sessao.getLastAssistantText()?.trim() ?? "";
		if (!falha && !abortada && !texto) falha = "a sessão terminou sem resposta em texto";

		const uso = somarUso(sessao.messages);
		if (abortada || falha) {
			const estado = abortada ? "abortado" : "erro";
			const mensagem = abortada
				? `O subagente ${agente.nome} foi interrompido.`
				: `O subagente ${agente.nome} falhou: ${falha}`;
			return { content: [{ type: "text", text: mensagem }], details: detalhes(estado), usage: uso, isError: true };
		}
		return { content: [{ type: "text", text: texto }], details: detalhes("concluido"), usage: uso };
	} finally {
		pedido.signal?.removeEventListener("abort", abortarFilha);
		cancelarAssinatura();
		try {
			await encerrarSessaoPi(sessao, "quit");
		} catch {
			// A filha já terminou; uma falha no session_shutdown não muda o resultado.
		}
	}
}

/** Descrição da ferramenta com os agentes que podem ser chamados (todos menos o da sessão principal). */
export function descreverFerramentaSubagente(perfil: Perfil, agentePrincipal: string): string {
	const agentes = perfil.agentes
		.filter((agente) => agente.nome !== agentePrincipal)
		.map((agente) => `- ${agente.nome}: ${encurtar(agente.definicao.descricao ?? agente.papel, 300)}`);
	return [
		"Delegate ONE self-contained task to a specialist subagent of this profile.",
		"The subagent starts a fresh, isolated session: it does not see this conversation, so put everything it needs in `task`.",
		"It works with its own model and tools and returns its final answer, in full, as this tool's result.",
		"",
		"Available agents:",
		...(agentes.length > 0 ? agentes : ["(none)"]),
	].join("\n");
}

/**
 * Extensão inline do núcleo que registra a ferramenta subagent na sessão
 * principal. O uso de cada resposta da filha vira um EventoNucleo "uso" com o
 * modelo e o agente da filha; os diagnósticos da montagem dela viram
 * EventoNucleo "diagnostico".
 */
export function criarExtensaoSubagente(contexto: ContextoFerramentaSubagente): InlineExtension {
	const outros = contexto.perfil.agentes.filter((agente) => agente.nome !== contexto.agentePrincipal).map((agente) => agente.nome);
	return {
		name: "nucleo-subagente",
		factory: (pi) => {
			pi.registerTool({
				name: NOME_FERRAMENTA_SUBAGENTE,
				label: "Subagent",
				description: descreverFerramentaSubagente(contexto.perfil, contexto.agentePrincipal),
				promptSnippet: `Delegate a self-contained task to a specialist subagent (${outros.join(", ") || "none"})`,
				parameters: Type.Object({
					agent: Type.String({ description: `Name of the agent to run: ${outros.join(", ") || "none"}.` }),
					task: Type.String({
						description: "The complete, self-contained task. The subagent sees nothing else from this conversation.",
					}),
				}),
				async execute(idFerramenta, parametros, signal, onUpdate, ctx) {
					const tarefa = parametros.task.trim();
					if (!tarefa) throw new Error("subagent: `task` não pode ser vazia.");
					return executarSubagente(contexto, {
						agente: parametros.agent.trim(),
						tarefa,
						idFerramenta,
						sessaoPai: ctx?.sessionManager.getSessionId(),
						signal,
						aoProgresso: (resumo, detalhes) => onUpdate?.({ content: [{ type: "text", text: resumo }], details: detalhes }),
						aoEvento: (evento) => {
							if (evento.tipo === "uso") contexto.emitir({ ...evento, agente: parametros.agent.trim(), idFerramenta });
							else if (evento.tipo === "diagnostico") contexto.emitir(evento);
						},
					});
				},
			});
		},
	};
}
