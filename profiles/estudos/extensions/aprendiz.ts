// A memória do aprendiz no perfil de estudos (item 9; docs/aprendiz.md, seções 7 e 8). Arquivo do projeto,
// não do learn. O cálculo e o disco ficam em ../lib/ (aprendiz.ts, hipoteses.ts, reflexao.ts); aqui fica a
// ponte com a tela (painel "aprendiz", docs/ponte-de-eventos.md, todas as respostas passageiras: gravar: false):
//   indicadores {}                                  -> indicadores { indicadores }                  (parte A)
//   hipoteses {}                                    -> hipoteses { estado }
//   historico { materia? }                          -> historico { eventos }
//   refletir { pedido }                             -> refletindo { pedido } e, no fim, refletiu { pedido, resumo, estado } ou erro
//   decidir { pedido, alvo, id, decisao, enunciado? } e editar { pedido, id, enunciado?, status? } -> decidida { pedido, estado } ou erro
// Qualquer falha é `erro` ({ pedido?, ao, mensagem }). A extensão só fala depois de session_start (como as outras).
//
// Quem grava: SÓ esta extensão grava o aprendiz/hipoteses.json (e os eventos das hipóteses no
// aprendiz/eventos.jsonl), pelas operações de ../lib/hipoteses.ts, todas numa FILA única POR PASTA DE DADOS, do
// processo (naFilaDoProcesso: o pi cria uma instância da extensão por sessão e, ao trocar de conversa, a nova pode
// começar antes de a velha terminar; uma gravação de cada vez; a leitura e a gravação de uma reflexão ficam dentro
// dela, a chamada ao modelo fora) e com UMA trava de reflexão por instância (um segundo pedido enquanto uma roda
// entra nela e recebe o mesmo resultado). A reflexão é feita pelo modelo do prompts/reflexao.md (chamada separada
// da do professor, temperatura 0), pelo ctx.modelRegistry do pi como o mapa. Gatilhos: o botão, e
// "aprendiz:gatilho" ({ motivo: "modulo" | "licao" }), que o modulos.ts emite depois de gravar o concluiu_modulo e
// o avaliou_licao; a automática só chama o modelo com pelo menos MINIMO_DO_GATILHO eventos de desempenho novos
// (o botão chama sempre que há evento novo), roda em segundo plano e, falhando, só não registra nada.
//
// A ferramenta ler_perfil_aprendiz é só de leitura: devolve ao professor as hipóteses que o Breno APROVOU.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ErroCurso } from "../lib/curso-tipos.ts";
import { indicadoresDoAprendiz, materiasExistentes, nomesDosConceitos, PAINEL_APRENDIZ, pastaCacheAprendiz } from "../lib/aprendiz.ts";
import { lerEventos } from "../lib/eventos.ts";
import {
	decidirHipotese,
	decidirMudanca,
	editarHipotese,
	ErroHipoteses,
	type EstadoHipoteses,
	type EventoDoHistorico,
	hipotesesAprovadasRelevantes,
	type Hipotese,
	lerHipotesesComAvisos,
	LIMITE_HISTORICO,
	LIMITE_TEXTO_DO_HISTORICO,
	normalizarTexto,
	type ResumoDaReflexao,
	arquivoHipoteses,
} from "../lib/hipoteses.ts";
import { eventosAprendiz } from "../lib/materias.ts";
import { cortarTexto, executarReflexao, MINIMO_DO_GATILHO, propostasDaResposta } from "../lib/reflexao.ts";
import { pedirJson, type RegistroCursos } from "./cursos.ts";
import { lerPromptMapeador } from "./mapa.ts";
import { materiaDaConversa } from "./notas.ts";

/** O prompt do agente de reflexão (frontmatter com o modelo e o prompt no corpo). */
export const CAMINHO_PROMPT_REFLEXAO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "reflexao.md");

/** O teto de tokens da resposta da reflexão. */
const MAX_TOKENS_SAIDA = 16_000;

/** Quantas hipóteses a ferramenta do professor devolve, no máximo. */
const LIMITE_DA_FERRAMENTA = 20;

/** Onde o cache fica e o prompt; os testes passam uma pasta temporária e um prompt de mentira. */
export interface OpcoesAprendiz {
	pastaCache?: string;
	caminhoPrompt?: string;
}

const textoOuNada = (valor: unknown) => (typeof valor === "string" ? valor : undefined);

type Motivo = ResumoDaReflexao["motivo"];

/** Uma reflexão em andamento: quem pediu (pelo botão) espera o resultado junto. */
interface EmAndamento {
	controle: AbortController;
	pedidos: string[];
	/** Só o gatilho automático: o mínimo de eventos de desempenho novos para chamar o modelo. */
	minimo?: number;
}

// --- A fila de gravação do processo --------------------------------------------------------------------

const CHAVE_DAS_FILAS = Symbol.for("estudos.aprendiz.filas");

/** As filas do processo, uma por pasta de dados (em globalThis: cada carga da extensão tem o seu módulo). */
function filasDoProcesso(): Map<string, Promise<unknown>> {
	const global = globalThis as unknown as Record<symbol, Map<string, Promise<unknown>> | undefined>;
	return (global[CHAVE_DAS_FILAS] ??= new Map());
}

/**
 * Roda a tarefa na fila da pasta de dados: uma de cada vez, na ordem, mesmo que a anterior tenha falhado e mesmo
 * que venha de outra instância da extensão (outra sessão do pi sobre a mesma pasta).
 */
export function naFilaDoProcesso<T>(dados: string, tarefa: () => Promise<T>): Promise<T> {
	const filas = filasDoProcesso();
	const chave = process.platform === "win32" ? resolve(dados).toLowerCase() : resolve(dados);
	const proxima = (filas.get(chave) ?? Promise.resolve()).then(tarefa, tarefa);
	const cauda = proxima.catch(() => undefined);
	filas.set(chave, cauda);
	void cauda.then(() => {
		if (filas.get(chave) === cauda) filas.delete(chave);
	});
	return proxima;
}

/** "provedor/id" no registro do pi, com credencial. */
function resolverModelo(registro: RegistroCursos, nome: string) {
	const barra = nome.indexOf("/");
	const provedor = barra > 0 ? nome.slice(0, barra).trim() : "";
	const id = barra > 0 ? nome.slice(barra + 1).trim() : "";
	if (!provedor || !id) throw new ErroHipoteses(`O modelo da reflexão "${nome}" não está no formato provedor/id (por exemplo openrouter/openai/gpt-6.1-sol).`);
	const modelo = registro.find(provedor, id);
	if (!modelo) throw new ErroHipoteses(`O modelo da reflexão "${nome}" não existe no registro de modelos do pi (provedor "${provedor}", id "${id}").`);
	if (!registro.hasConfiguredAuth(modelo)) {
		throw new ErroHipoteses(`O modelo da reflexão "${nome}": o provedor "${provedor}" não tem credencial. Defina a variável de ambiente do provedor (por exemplo OPENROUTER_API_KEY) e reinicie o app.`);
	}
	return modelo;
}

/** A mensagem de erro que o Breno vê. */
const mensagemDe = (erro: unknown, oQue: string) =>
	erro instanceof ErroHipoteses || erro instanceof ErroCurso ? erro.message : `Não consegui ${oQue}: ${(erro as Error).message}`;

/** O evento do histórico: sem o contexto e com o texto livre cortado. */
function eventoDoHistorico(evento: { id: string; ts: string; sessao?: string; verbo: EventoDoHistorico["verbo"]; objeto: EventoDoHistorico["objeto"]; resultado?: Record<string, unknown> }): EventoDoHistorico {
	const resultado = evento.resultado && typeof evento.resultado.texto === "string" ? { ...evento.resultado, texto: cortarTexto(evento.resultado.texto, LIMITE_TEXTO_DO_HISTORICO) } : evento.resultado;
	return { id: evento.id, ts: evento.ts, ...(evento.sessao !== undefined ? { sessao: evento.sessao } : {}), verbo: evento.verbo, objeto: evento.objeto, ...(resultado !== undefined ? { resultado } : {}) };
}

/** O texto da ferramenta: as hipóteses aprovadas, uma por linha. */
export function textoDoPerfil(hipoteses: readonly Hipotese[], nomes: ReadonlyMap<string, ReadonlyMap<string, string>>, foco: { materia?: string }): string {
	const onde = foco.materia ? ` para a matéria ${foco.materia}` : " (só as globais)";
	if (hipoteses.length === 0) {
		return `Nada aprovado ainda${onde}: o aluno não aprovou nenhuma hipótese sobre si que valha aqui. Ensine normalmente, sem supor nada do perfil dele.`;
	}
	const linhas = hipoteses.map((hipotese) => {
		const escopo =
			hipotese.escopo.nivel === "global"
				? "global"
				: hipotese.escopo.nivel === "materia"
					? `matéria ${hipotese.escopo.materia}`
					: `conceito ${hipotese.escopo.conceitos.map((id) => nomes.get((hipotese.escopo as { materia: string }).materia)?.get(id) ?? id).join(", ")} (matéria ${hipotese.escopo.materia})`;
		return `- ${hipotese.enunciado} [${hipotese.tipo}; escopo: ${escopo}; confiança ${hipotese.confianca}; válida até ${hipotese.validade.slice(0, 10)}]`;
	});
	return [`Perfil do aluno${onde}: hipóteses que ELE aprovou (valem enquanto a validade não vence; são hipóteses, não verdades).`, ...linhas].join("\n");
}

export function montarAprendiz(pi: ExtensionAPI, opcoes: OpcoesAprendiz = {}): void {
	const caminhoPrompt = opcoes.caminhoPrompt ?? CAMINHO_PROMPT_REFLEXAO;
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	let registro: RegistroCursos | undefined;
	/** A reflexão que está rodando (a trava: uma por vez). */
	let reflexao: EmAndamento | undefined;

	const mostrar = (acao: string, dados: Record<string, unknown>) => pi.events.emit("interface:mostrar", { painel: PAINEL_APRENDIZ, acao, dados, gravar: false });

	/** A fila de leituras e gravações da pasta de dados (do processo, não desta instância). */
	const filaDe =
		(dados: string) =>
		<T>(tarefa: () => Promise<T>): Promise<T> =>
			naFilaDoProcesso(dados, tarefa);

	/** O estado das hipóteses como a tela o recebe (ler não grava: a validade vencida só expira numa gravação). */
	const estadoDeAgora = async (dados: string): Promise<EstadoHipoteses> => {
		const { arquivo, avisos } = await lerHipotesesComAvisos(dados);
		if (avisos.length > 0) throw new ErroHipoteses(`Não consegui ler as hipóteses ${arquivoHipoteses(dados)}: ${avisos.join("; ")}. Corrija o arquivo ou tire-o da pasta.`);
		return { hipoteses: arquivo.hipoteses, mudancas: arquivo.mudancas, ...(arquivo.ultimaReflexao ? { ultimaReflexao: arquivo.ultimaReflexao } : {}), refletindo: reflexao !== undefined };
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
		registro = ctx.modelRegistry;
	});

	// Fim da sessão (sair, recarregar, trocar de conversa): a reflexão em andamento para (nada é gravado) e a cópia fica calada.
	pi.on("session_shutdown", () => {
		pastaDados = undefined;
		reflexao?.controle.abort();
	});

	/** A chamada ao modelo da reflexão (fora da fila). */
	const chamarModelo = async (mensagem: string, sinal: AbortSignal) => {
		if (!registro) throw new ErroHipoteses("A sessão ainda não tem o registro de modelos.");
		let conteudo: string;
		try {
			conteudo = await readFile(caminhoPrompt, "utf8");
		} catch (erro) {
			throw new ErroHipoteses(`Não consegui ler o prompt ${caminhoPrompt}: ${(erro as Error).message}`);
		}
		let prompt: { modelo: string; instrucoes: string };
		try {
			prompt = lerPromptMapeador(conteudo, caminhoPrompt);
		} catch (erro) {
			throw new ErroHipoteses((erro as Error).message);
		}
		const modelo = resolverModelo(registro, prompt.modelo);
		const resposta = await pedirJson(registro, modelo, prompt.instrucoes, mensagem, propostasDaResposta, sinal, {
			temperatura: 0,
			maxTokens: MAX_TOKENS_SAIDA,
			formato: '{"propostas": [...]}',
			oQue: "as propostas da reflexão",
			depois: "Nada foi gravado; a próxima reflexão lê os mesmos eventos de novo.",
		});
		return { propostas: resposta.resultado, custo: resposta.custo };
	};

	/**
	 * Faz uma reflexão, na trava de uma só. Se já há uma rodando, o pedido entra nela e recebe o mesmo resultado.
	 * Quem pediu (`pedido`) recebe `refletiu` ou `erro`; sem pedido (a automática), só `hipoteses` quando deu certo, e
	 * falhando não aparece nada.
	 */
	const refletir = (dados: string, motivo: Motivo, pedido?: string, minimo?: number) => {
		if (reflexao) {
			if (pedido && !reflexao.pedidos.includes(pedido)) reflexao.pedidos.push(pedido);
			return;
		}
		const atual: EmAndamento = { controle: new AbortController(), pedidos: pedido ? [pedido] : [], ...(minimo !== undefined ? { minimo } : {}) };
		reflexao = atual;
		const naFilaGlobal = filaDe(dados);
		// A sessão pode acabar enquanto a tarefa espera na fila (a instância nova já gravando): então nada é gravado.
		const naFila = <T>(tarefa: () => Promise<T>): Promise<T> =>
			naFilaGlobal(async () => {
				if (atual.controle.signal.aborted) throw new ErroHipoteses("A sessão acabou; a reflexão parou e nada foi gravado.");
				return tarefa();
			});
		void (async () => {
			let resultado: Awaited<ReturnType<typeof executarReflexao>> | undefined;
			let falha: unknown;
			const rodar = (minimoDeDesempenho?: number) =>
				executarReflexao(dados, {
					motivo,
					...(sessao ? { sessao } : {}),
					...(opcoes.pastaCache !== undefined ? { pastaCache: opcoes.pastaCache } : { pastaCache: pastaCacheAprendiz() }),
					...(minimoDeDesempenho !== undefined ? { minimoDeDesempenho } : {}),
					chamar: (mensagem) => chamarModelo(mensagem, atual.controle.signal),
					naFila,
				});
			try {
				resultado = await rodar(atual.minimo);
				// Um pedido do botão entrou numa reflexão automática que parou no mínimo: o botão chama sempre que há evento novo.
				if (resultado.semEventos && resultado.abaixoDoMinimo && atual.pedidos.length > 0) resultado = await rodar(undefined);
			} catch (erro) {
				falha = erro;
			}
			if (reflexao === atual) reflexao = undefined;
			// A sessão acabou (ou esta cópia ficou velha): nada aparece.
			if (pastaDados !== dados || atual.controle.signal.aborted) return;
			try {
				const pedidos = atual.pedidos;
				if (falha !== undefined) {
					for (const alvo of pedidos) mostrar("erro", { pedido: alvo, ao: "refletir", mensagem: mensagemDe(falha, "refletir sobre os eventos") });
					return;
				}
				const estado = await naFilaGlobal(() => estadoDeAgora(dados));
				for (const alvo of pedidos) mostrar("refletiu", { pedido: alvo, resumo: resultado!.resumo, estado });
				if (pedidos.length === 0 && !resultado!.semEventos) mostrar("hipoteses", { estado });
			} catch (erro) {
				for (const alvo of atual.pedidos) mostrar("erro", { pedido: alvo, ao: "refletir", mensagem: mensagemDe(erro, "ler as hipóteses") });
			}
		})();
	};

	// Os gatilhos automáticos: o modulos.ts avisa depois de gravar o concluiu_modulo e o avaliou_licao.
	pi.events.on("aprendiz:gatilho", (recebido) => {
		const dados = pastaDados;
		if (!dados) return;
		const motivo = (recebido as { motivo?: unknown } | undefined)?.motivo;
		if (motivo !== "modulo" && motivo !== "licao") return;
		refletir(dados, motivo, undefined, MINIMO_DO_GATILHO);
	});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = (recebido ?? {}) as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_APRENDIZ || typeof acao !== "string" || !["indicadores", "hipoteses", "historico", "refletir", "decidir", "editar"].includes(acao)) return;
		// Sem session_start, esta cópia não é a da sessão: ao recarregar o código, o núcleo carrega as
		// extensões uma vez a mais (montagem.ts), e essa carga continua ouvindo o barramento. Ela fica calada.
		const dados = pastaDados;
		if (!dados) return;
		const naFila = filaDe(dados);
		const dadosAcao = (typeof bruto === "object" && bruto !== null ? bruto : {}) as Record<string, unknown>;
		const pedido = textoOuNada(dadosAcao.pedido) || undefined;
		const eco = pedido ? { pedido } : {};
		const falhou = (erro: unknown, oQue: string) => mostrar("erro", { ...eco, ao: acao, mensagem: mensagemDe(erro, oQue) });

		if (acao === "indicadores") {
			void naFila(async () => {
				try {
					const indicadores = await indicadoresDoAprendiz(dados, opcoes.pastaCache ?? pastaCacheAprendiz());
					mostrar("indicadores", { indicadores, ...eco });
				} catch (erro) {
					mostrar("erro", { mensagem: `Não consegui calcular os indicadores do aprendiz: ${(erro as Error).message}`, ...eco });
				}
			});
		} else if (acao === "hipoteses") {
			void naFila(async () => {
				try {
					mostrar("hipoteses", { estado: await estadoDeAgora(dados), ...eco });
				} catch (erro) {
					falhou(erro, "ler as hipóteses");
				}
			});
		} else if (acao === "historico") {
			const materia = textoOuNada(dadosAcao.materia);
			void naFila(async () => {
				try {
					const { eventos } = await lerEventos(eventosAprendiz(dados));
					const doHistorico = eventos
						.filter((evento) => !materia || evento.objeto?.materia === materia)
						.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
						.slice(0, LIMITE_HISTORICO)
						.map(eventoDoHistorico);
					mostrar("historico", { eventos: doHistorico, ...eco });
				} catch (erro) {
					falhou(erro, "ler o histórico do aprendiz");
				}
			});
		} else if (acao === "refletir") {
			if (!pedido) {
				mostrar("erro", { ao: acao, mensagem: "O pedido de reflexão veio sem o identificador do pedido." });
				return;
			}
			mostrar("refletindo", { pedido });
			refletir(dados, "botao", pedido);
		} else if (acao === "decidir") {
			const { alvo, id, decisao, enunciado } = dadosAcao;
			if ((alvo !== "hipotese" && alvo !== "mudanca") || typeof id !== "string" || (decisao !== "aprovar" && decisao !== "rejeitar")) {
				mostrar("erro", { ...eco, ao: acao, mensagem: "A decisão precisa do alvo (hipotese ou mudanca), do id e da decisão (aprovar ou rejeitar)." });
				return;
			}
			void naFila(async () => {
				try {
					if (alvo === "hipotese") await decidirHipotese(dados, { id, decisao, ...(typeof enunciado === "string" ? { enunciado } : {}) }, { ...(sessao ? { sessao } : {}) });
					else await decidirMudanca(dados, { id, decisao }, { ...(sessao ? { sessao } : {}) });
					mostrar("decidida", { ...eco, estado: await estadoDeAgora(dados) });
				} catch (erro) {
					falhou(erro, "gravar a decisão");
				}
			});
		} else if (acao === "editar") {
			const { id, enunciado, status } = dadosAcao;
			if (typeof id !== "string") {
				mostrar("erro", { ...eco, ao: acao, mensagem: "A edição precisa do id da hipótese." });
				return;
			}
			void naFila(async () => {
				try {
					await editarHipotese(
						dados,
						{ id, ...(typeof enunciado === "string" ? { enunciado } : {}), ...(status !== undefined ? { status: status as "aprovada" | "rejeitada" } : {}) },
						{ ...(sessao ? { sessao } : {}) },
					);
					mostrar("decidida", { ...eco, estado: await estadoDeAgora(dados) });
				} catch (erro) {
					falhou(erro, "gravar a edição");
				}
			});
		}
	});

	// A ferramenta de leitura do professor: as hipóteses que o Breno aprovou.
	pi.registerTool({
		name: "ler_perfil_aprendiz",
		label: "Ler perfil do aprendiz",
		description:
			"Read the student's learner profile: the hypotheses about how he learns (what he knows, his recurring misconceptions, vocabulary, preferred forms of explanation, pace and self-assessment) that HE reviewed and approved, each with scope, confidence and expiry. The profile belongs to the student: these are approved hypotheses, not facts, and you never change them (only he approves, edits or rejects). Use it to adapt an explanation to what he has confirmed about himself; with nothing approved it says so and you teach as usual. In a notebook conversation, the subject is the conversation's.",
		parameters: Type.Object({
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation; without it only the global hypotheses are returned." })),
			conceitos: Type.Optional(Type.Array(Type.String(), { description: "Concept ids (or names) from the subject's map, to include the hypotheses about those concepts." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const falha = (texto: string) => ({ content: [{ type: "text" as const, text: texto }], details: undefined, isError: true });
			const daConversa = materiaDaConversa(ctx.sessionManager.getBranch());
			if (daConversa && params.materia && params.materia !== daConversa) return falha(`Esta conversa é do caderno "${daConversa}": o perfil de outras matérias fica de fora aqui.`);
			const materia = daConversa ?? params.materia;
			try {
				const { arquivo, avisos } = await lerHipotesesComAvisos(ctx.cwd);
				if (avisos.length > 0) return falha("Não consegui ler o perfil do aluno agora. Ensine normalmente.");
				const materias = await materiasExistentes(ctx.cwd);
				if (materia && !materias.includes(materia)) return falha(`Não achei a matéria "${materia}".`);
				const nomes = await nomesDosConceitos(ctx.cwd, materia ? [materia] : []);
				// Aceita o nome do conceito no lugar do id.
				const doMapa = materia ? [...(nomes.get(materia) ?? [])] : [];
				const conceitos = (params.conceitos ?? []).map((pedido) => doMapa.find(([id, nome]) => id === pedido || normalizarTexto(nome) === normalizarTexto(pedido))?.[0] ?? pedido);
				const hipoteses = hipotesesAprovadasRelevantes(arquivo, { ...(materia ? { materia } : {}), conceitos, agora: new Date(), limite: LIMITE_DA_FERRAMENTA });
				return { content: [{ type: "text" as const, text: textoDoPerfil(hipoteses, nomes, materia ? { materia } : {}) }], details: { materia, hipoteses: hipoteses.map((hipotese) => hipotese.id) } };
			} catch (erro) {
				return falha(`Não consegui ler o perfil do aluno: ${(erro as Error).message}`);
			}
		},
	});
}

export default function aprendizExtensao(pi: ExtensionAPI) {
	montarAprendiz(pi);
}
