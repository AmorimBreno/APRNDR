// Notas pessoais do caderno (item 4.3, parte B). Arquivo do projeto, não do learn.
// A lógica fica em ../lib/notas.ts; aqui ficam:
// - a ponte com o caderno (docs/ponte-de-eventos.md): a tela manda
//   "interface:acao" no painel "notas" (listar, abrir, criar, salvar,
//   renomear) e a extensão responde com "interface:mostrar" (lista, nota,
//   criada, salva, conflito, renomeada, erro), sempre passageiros (gravar:
//   false). Os de uma nota levam materia e titulo; salvar leva o "pedido" da
//   tela de volta, para ela saber a que salvamento a resposta é;
// - o evento editou_nota: um por abertura da nota em que ela mudou. A tela
//   gera um id ("edicao") quando abre a nota e o manda em cada salvamento;
//   só o primeiro salvamento de cada edicao grava o evento;
// - as ferramentas só de leitura do professor, listar_notas e ler_nota. Numa
//   conversa de caderno (contexto "materia:<id>" gravado pelo núcleo na
//   sessão) elas ficam na matéria da conversa. O professor nunca escreve nas
//   notas pessoais.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ErroMaterias } from "../lib/materias.ts";
import { criarNota, ErroConflito, lerNota, listarNotas, renomearNota, salvarNota } from "../lib/notas.ts";

const PAINEL = "notas";

/** customType da entrada com o contexto da sessão, gravada pelo núcleo (packages/core/src/sessoes.ts). */
const TIPO_ENTRADA_CONTEXTO = "nucleo.contexto";

/** Até quantos caracteres ler_nota devolve de uma vez. */
const LIMITE_LEITURA = 40_000;

interface DadosAcao {
	materia?: string;
	titulo?: string;
	conteudo?: string;
	versao?: string;
	forcar?: boolean;
	edicao?: string;
	pedido?: string;
	de?: string;
	para?: string;
}

/** A matéria da conversa: o último contexto "materia:<id>" gravado na sessão. */
export function materiaDaConversa(entradas: ReadonlyArray<{ type?: string; customType?: string; data?: unknown }>): string | undefined {
	let materia: string | undefined;
	for (const entrada of entradas) {
		if (entrada.type !== "custom" || entrada.customType !== TIPO_ENTRADA_CONTEXTO) continue;
		const chave = (entrada.data as { chave?: unknown } | undefined)?.chave;
		materia = typeof chave === "string" && chave.startsWith("materia:") ? chave.slice("materia:".length) : undefined;
	}
	return materia;
}

const mensagemDe = (erro: unknown, acao: string) => (erro instanceof ErroMaterias ? erro.message : `Não consegui ${acao} a nota: ${(erro as Error).message}`);

export default function notas(pi: ExtensionAPI) {
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	/** As aberturas (edicao) que já gravaram editou_nota. */
	const edicoesRegistradas = new Set<string>();
	/** Uma fila por nota: um salvamento ou uma troca de nome espera o anterior da mesma nota. */
	const filas = new Map<string, Promise<unknown>>();

	const mostrar = (acao: string, dados: unknown) => pi.events.emit("interface:mostrar", { painel: PAINEL, acao, dados, gravar: false });

	const naFila = (chave: string, tarefa: () => Promise<void>) => {
		const anterior = filas.get(chave) ?? Promise.resolve();
		const proxima = anterior.then(tarefa, tarefa);
		filas.set(chave, proxima);
		void proxima.finally(() => {
			if (filas.get(chave) === proxima) filas.delete(chave);
		});
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
	});

	const mostrarLista = async (dados: string, materia: string) => {
		try {
			mostrar("lista", await listarNotas(dados, materia));
		} catch (erro) {
			mostrar("erro", { mensagem: mensagemDe(erro, "listar"), ao: "listar", materia });
		}
	};

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL) return;
		const dadosAcao = (bruto ?? {}) as DadosAcao;
		const { materia } = dadosAcao;
		if (typeof materia !== "string") return;
		const dados = pastaDados;
		if (!dados) {
			mostrar("erro", { mensagem: "A sessão ainda não abriu a pasta de dados. Tente de novo.", ao: acao, materia, ...(dadosAcao.pedido ? { pedido: dadosAcao.pedido } : {}) });
			return;
		}
		const daSessao = sessao ? { sessao } : {};

		if (acao === "listar") {
			void mostrarLista(dados, materia);
		} else if (acao === "abrir" && typeof dadosAcao.titulo === "string") {
			const titulo = dadosAcao.titulo;
			void (async () => {
				try {
					mostrar("nota", await lerNota(dados, materia, titulo));
				} catch (erro) {
					mostrar("erro", { mensagem: mensagemDe(erro, "abrir"), ao: "abrir", materia, titulo });
				}
			})();
		} else if (acao === "criar" && typeof dadosAcao.titulo === "string") {
			const titulo = dadosAcao.titulo;
			void (async () => {
				try {
					const nota = await criarNota(dados, materia, titulo, daSessao);
					mostrar("criada", { materia, titulo: nota.titulo });
					await mostrarLista(dados, materia);
				} catch (erro) {
					mostrar("erro", { mensagem: mensagemDe(erro, "criar"), ao: "criar", materia, titulo });
				}
			})();
		} else if (acao === "salvar" && typeof dadosAcao.titulo === "string" && typeof dadosAcao.conteudo === "string") {
			const { titulo, conteudo, edicao, pedido } = dadosAcao;
			naFila(`${materia}/${titulo.toLowerCase()}`, async () => {
				const registrarEdicao = typeof edicao === "string" && !edicoesRegistradas.has(edicao);
				try {
					const salva = await salvarNota(dados, materia, titulo, conteudo, {
						...(typeof dadosAcao.versao === "string" ? { versao: dadosAcao.versao } : {}),
						...(dadosAcao.forcar ? { forcar: true } : {}),
						registrarEdicao,
						...daSessao,
					});
					if (registrarEdicao) edicoesRegistradas.add(edicao);
					mostrar("salva", { materia, titulo, ...salva, ...(pedido ? { pedido } : {}) });
				} catch (erro) {
					if (erro instanceof ErroConflito) {
						mostrar("conflito", { materia, titulo, mensagem: erro.message, ...(erro.versaoAtual ? { versaoAtual: erro.versaoAtual } : {}), ...(pedido ? { pedido } : {}) });
					} else {
						mostrar("erro", { mensagem: mensagemDe(erro, "salvar"), ao: "salvar", materia, titulo, ...(pedido ? { pedido } : {}) });
					}
				}
			});
		} else if (acao === "renomear" && typeof dadosAcao.de === "string" && typeof dadosAcao.para === "string") {
			const { de, para } = dadosAcao;
			naFila(`${materia}/${de.toLowerCase()}`, async () => {
				try {
					const { titulo } = await renomearNota(dados, materia, de, para, daSessao);
					mostrar("renomeada", { materia, de, para: titulo });
					await mostrarLista(dados, materia);
				} catch (erro) {
					mostrar("erro", { mensagem: mensagemDe(erro, "renomear"), ao: "renomear", materia, titulo: de });
				}
			});
		}
	});

	/** A matéria que a ferramenta lê: a da conversa, se ela for de um caderno; senão, a do parâmetro. */
	const escolherMateria = (pedida: string | undefined, entradas: Parameters<typeof materiaDaConversa>[0]): { materia: string } | { erro: string } => {
		const daConversa = materiaDaConversa(entradas);
		if (daConversa) {
			if (pedida && pedida !== daConversa) return { erro: `Esta conversa é do caderno "${daConversa}": as notas de outras matérias ficam de fora aqui.` };
			return { materia: daConversa };
		}
		if (!pedida) return { erro: "Diga a matéria (o id, de listar_materias)." };
		return { materia: pedida };
	};

	pi.registerTool({
		name: "listar_notas",
		label: "Listar notas",
		description:
			"List the user's personal notes in a subject's notebook: title, last change and a short preview. In a notebook conversation, the subject is the conversation's. Notes are the user's own writing: read them to understand what they wrote, never write or change them.",
		parameters: Type.Object({
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			try {
				const lista = await listarNotas(ctx.cwd, escolha.materia);
				const linhas = lista.notas.map((nota) => `- ${nota.titulo} (mudou em ${nota.modificadaEm.slice(0, 10)})${nota.previa ? `: ${nota.previa}` : ""}`);
				const texto = linhas.length ? `Notas de ${escolha.materia}:\n${linhas.join("\n")}` : `O caderno ${escolha.materia} ainda não tem notas.`;
				return { content: [{ type: "text", text: texto }], details: lista };
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "listar") }], details: undefined, isError: true };
			}
		},
	});

	pi.registerTool({
		name: "ler_nota",
		label: "Ler nota",
		description:
			"Read one of the user's personal notes (markdown) by its title. In a notebook conversation, the subject is the conversation's. Read only: never write or change the user's notes.",
		parameters: Type.Object({
			titulo: Type.String({ description: "Note title, as listar_notas shows it." }),
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			try {
				const nota = await lerNota(ctx.cwd, escolha.materia, params.titulo);
				const cortada = nota.conteudo.length > LIMITE_LEITURA;
				const corpo = cortada ? `${nota.conteudo.slice(0, LIMITE_LEITURA)}\n\n[… a nota continua; mostrei os primeiros ${LIMITE_LEITURA} caracteres]` : nota.conteudo;
				return {
					content: [{ type: "text", text: `# Nota "${nota.titulo}" (${escolha.materia}, mudou em ${nota.modificadaEm.slice(0, 10)})\n\n${corpo || "(vazia)"}` }],
					details: { materia: nota.materia, titulo: nota.titulo, modificadaEm: nota.modificadaEm, caracteres: nota.conteudo.length },
				};
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "ler") }], details: undefined, isError: true };
			}
		},
	});
}
