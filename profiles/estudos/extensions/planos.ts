// Planos de estudos (docs/planos-de-estudo.md, decisão 13.21). Arquivo do projeto, não do learn.
// Um plano é uma nota comum da matéria com a tag "Plano de estudos · " na primeira linha (as regras
// e o disco ficam em ../lib/plano-tipos.ts e ../lib/planos.ts); aqui ficam:
// - as quatro ferramentas do professor, só na conversa de uma matéria: listar_planos, ler_plano,
//   criar_plano e atualizar_plano. O professor só grava em notas com a tag, e só por operações
//   (marcar, desmarcar, acrescentar), nunca reescrevendo a nota. criar_plano cria a nota, faz a
//   conversa segui-la e emite no painel "mesa" a ação plano_criado (gravar: true) para o cartão
//   com Abrir e Desfazer, como o nota_criada do criar_nota;
// - qual plano a conversa segue: uma entrada da sessão "estudos.plano" {titulo | null} (pi.appendEntry,
//   não vai ao modelo); vale a última do ramo (planoSeguido);
// - o before_agent_start: se a execução veio do Breno e a conversa segue um plano que existe, o
//   professor recebe o resumo numa mensagem escondida (display: false) e, se a conversa ainda não
//   está na seção Conversas do plano, ela entra (ligou_plano);
// - a ponte "planos" (docs/ponte-de-eventos.md): a tela manda listar, seguir e desfazer_plano no
//   painel "planos"; a extensão responde lista, seguindo, desfeito e erro, sempre passageiros
//   (gravar: false). seguir e desfazer_plano levam a `sessao` da tela, que precisa ser a desta extensão;
// - depois de cada gravação de um plano, avisa o editor das notas (painel "notas", ação mudou_fora);
// - o aviso "notas:renomeada" da extensão de notas: se a conversa segue a nota renomeada, a entrada
//   passa para o título novo.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ErroMaterias } from "../lib/materias.ts";
import { PAINEL_MESA } from "../lib/mesa-tipos.ts";
import { conferirTitulo } from "../lib/nota-tipos.ts";
import {
	ACAO_MUDOU_FORA,
	ACAO_PLANO_CRIADO,
	type DadosMudouFora,
	type DadosPlanoCriado,
	type MensagensPlanos,
	type OperacaoPlano,
	PAINEL_PLANOS,
	type PlanoLido,
	planoSeguido,
	resumoParaProfessor,
	TIPO_ENTRADA_PLANO,
	TIPO_MENSAGEM_PLANO,
} from "../lib/plano-tipos.ts";
import { acrescentarConversaNoPlano, atualizarPlano, criarPlano, desfazerPlano, lerPlanoDaNota, listarPlanos, type PlanoGravado, registrarEventoPlano } from "../lib/planos.ts";
import { idCurtoDaConversa } from "../lib/trecho-guardado.ts";
import { materiaDaConversa } from "./notas.ts";

const PAINEL_NOTAS = "notas";

type Entradas = Parameters<typeof materiaDaConversa>[0];
/** O que a extensão usa do gerenciador da sessão do pi. */
interface Gerente {
	getSessionId(): string;
	getBranch(): Entradas;
}

interface DadosAcao {
	materia?: string;
	titulo?: string | null;
	pedido?: string;
	sessao?: string;
}

const mensagemDe = (erro: unknown, acao: string) => (erro instanceof ErroMaterias ? erro.message : `Não consegui ${acao}: ${(erro as Error).message}`);

const chaveDaNota = (materia: string, titulo: string) => `${materia}/${titulo.toLowerCase()}`;

/** O plano em texto para o professor: título, progresso, objetivo e os itens numerados com o atual. */
function descreverPlano(titulo: string, plano: PlanoLido): string {
	const cabeca = `Plano "${titulo}": ${plano.feitos} de ${plano.total} itens feitos${plano.concluido ? " (concluído)" : ""}.`;
	const objetivo = plano.objetivo ? `\nObjetivo: ${plano.objetivo}` : "";
	const itens = plano.itens.length
		? plano.itens.map((item) => `${item.numero}. [${item.feito ? "x" : " "}] ${item.texto}${item.numero === plano.atual ? "   <- item atual" : ""}`).join("\n")
		: "(sem itens)";
	return `${cabeca}${objetivo}\n${itens}`;
}

const falha = (texto: string) => ({ content: [{ type: "text" as const, text: texto }], details: undefined, isError: true });

export default function planos(pi: ExtensionAPI) {
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	let gerente: Gerente | undefined;
	/** Uma fila por nota: uma gravação espera a anterior da mesma nota. */
	const filas = new Map<string, Promise<unknown>>();

	const naFilaComResultado = <T>(chave: string, tarefa: () => Promise<T>): Promise<T> => {
		const anterior = filas.get(chave) ?? Promise.resolve();
		const proxima = anterior.then(tarefa, tarefa);
		filas.set(chave, proxima);
		void proxima
			.finally(() => {
				if (filas.get(chave) === proxima) filas.delete(chave);
			})
			.catch(() => undefined);
		return proxima;
	};

	const mostrar = <A extends keyof MensagensPlanos>(acao: A, dados: MensagensPlanos[A]) => pi.events.emit("interface:mostrar", { painel: PAINEL_PLANOS, acao, dados, gravar: false });

	/** Avisa o editor das notas: a nota mudou fora dele (ele recarrega se não tem mudança pendente). */
	const avisarMudouFora = (materia: string, gravado: Pick<PlanoGravado, "titulo" | "versao" | "conteudo">) => {
		const dados: DadosMudouFora = { materia, titulo: gravado.titulo, versao: gravado.versao, conteudo: gravado.conteudo };
		pi.events.emit("interface:mostrar", { painel: PAINEL_NOTAS, acao: ACAO_MUDOU_FORA, dados, gravar: false });
	};

	/** Manda a lista de planos da matéria e qual a conversa segue (só se ela é da matéria e o plano ainda existe). */
	const mostrarLista = async (dados: string, materia: string, sessaoAtual: Gerente) => {
		try {
			const lista = await listarPlanos(dados, materia);
			const ramo = sessaoAtual.getBranch();
			const seguido = materiaDaConversa(ramo) === materia ? planoSeguido(ramo) : undefined;
			const seguindo = seguido ? (lista.find((plano) => plano.titulo.toLowerCase() === seguido.toLowerCase())?.titulo ?? null) : null;
			mostrar("lista", { materia, sessao: sessaoAtual.getSessionId(), planos: lista, seguindo });
		} catch (erro) {
			mostrar("erro", { ao: "listar", materia, mensagem: mensagemDe(erro, "listar os planos") });
		}
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
		gerente = ctx.sessionManager;
	});

	// O resumo do plano para o professor (seção 5 do contrato), só em execução que veio do Breno.
	pi.on("before_agent_start", async (evento, ctx) => {
		if (!pastaDados || evento.messageType !== "user") return undefined;
		try {
			const ramo = ctx.sessionManager.getBranch();
			const materia = materiaDaConversa(ramo);
			const seguido = planoSeguido(ramo);
			if (!materia || !seguido) return undefined;
			const sessaoId = ctx.sessionManager.getSessionId();
			const lido = await lerPlanoDaNota(ctx.cwd, materia, seguido);
			let plano = lido.plano;
			if (!plano.conversas.includes(idCurtoDaConversa(sessaoId))) {
				try {
					const gravado = await naFilaComResultado(chaveDaNota(materia, lido.nota.titulo), () => acrescentarConversaNoPlano(ctx.cwd, materia, lido.nota.titulo, sessaoId));
					if (gravado.mudou) avisarMudouFora(materia, gravado);
					plano = gravado.plano;
				} catch {
					// O histórico é só um registro: se não deu para gravar agora, o professor ainda recebe o resumo.
				}
			}
			return { message: { customType: TIPO_MENSAGEM_PLANO, content: resumoParaProfessor(lido.nota.titulo, plano), display: false } };
		} catch {
			// Sem plano (apagado, sem a tag, matéria sumida): a conversa segue sem resumo.
			return undefined;
		}
	});

	// A extensão de notas avisa quando renomeia: se a conversa segue a nota, passa a seguir o título novo.
	pi.events.on("notas:renomeada", (recebido) => {
		const { materia, de, para } = (recebido ?? {}) as { materia?: unknown; de?: unknown; para?: unknown };
		const dados = pastaDados;
		const atual = gerente;
		if (!dados || !atual || typeof materia !== "string" || typeof de !== "string" || typeof para !== "string") return;
		const ramo = atual.getBranch();
		if (materiaDaConversa(ramo) !== materia) return;
		const seguido = planoSeguido(ramo);
		if (!seguido || seguido.toLowerCase() !== de.toLowerCase()) return;
		pi.appendEntry(TIPO_ENTRADA_PLANO, { titulo: para });
		void (async () => {
			try {
				await registrarEventoPlano(dados, materia, atual.getSessionId(), "seguiu_plano", { titulo: para });
			} catch {
				// O registro do evento não impede a conversa de seguir o título novo.
			}
			await mostrarLista(dados, materia, atual);
		})();
	});

	// A ponte "planos" (seção 7).
	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_PLANOS) return;
		const dadosAcao = (bruto ?? {}) as DadosAcao;
		const { materia, pedido } = dadosAcao;
		if (typeof materia !== "string") return;
		// Sem session_start, esta cópia não é a da sessão (docs/ponte-de-eventos.md, regra 6): fica calada.
		const dados = pastaDados;
		const atual = gerente;
		if (!dados || !atual || !sessao) return;
		const idSessao = sessao;
		const comPedido = pedido ? { pedido } : {};

		if (acao === "listar") {
			void mostrarLista(dados, materia, atual);
		} else if (acao === "seguir" && (typeof dadosAcao.titulo === "string" || dadosAcao.titulo === null)) {
			const titulo = dadosAcao.titulo;
			const falhou = (mensagem: string) => mostrar("erro", { ao: "seguir", materia, mensagem, ...comPedido });
			if (dadosAcao.sessao !== idSessao) return falhou("Este pedido é de outra conversa, não da que está aberta. Nada mudou.");
			if (materiaDaConversa(atual.getBranch()) !== materia) return falhou("Esta conversa não é do caderno dessa matéria. Nada mudou.");
			void (async () => {
				try {
					let seguido: string | null = null;
					if (titulo !== null) seguido = (await lerPlanoDaNota(dados, materia, titulo)).nota.titulo;
					pi.appendEntry(TIPO_ENTRADA_PLANO, { titulo: seguido });
					await registrarEventoPlano(dados, materia, idSessao, "seguiu_plano", { titulo: seguido });
					mostrar("seguindo", { materia, sessao: idSessao, pedido: pedido ?? "", titulo: seguido });
					await mostrarLista(dados, materia, atual);
				} catch (erro) {
					falhou(mensagemDe(erro, "seguir o plano"));
				}
			})();
		} else if (acao === "desfazer_plano" && typeof dadosAcao.titulo === "string") {
			const pedidoTitulo = dadosAcao.titulo;
			const falhou = (mensagem: string) => mostrar("erro", { ao: "desfazer_plano", materia, mensagem, ...comPedido });
			// Como no desfazer_nota: a tela manda o id da sessão que ela mostra.
			if (dadosAcao.sessao !== idSessao) return falhou("Este pedido é de outra conversa, não da que está aberta. Nada foi apagado.");
			const conferido = conferirTitulo(pedidoTitulo);
			if ("erro" in conferido) return falhou(`${conferido.erro} Nada foi apagado.`);
			void naFilaComResultado(chaveDaNota(materia, conferido.titulo), async () => {
				try {
					const apagado = await desfazerPlano(dados, materia, conferido.titulo, idSessao);
					// Se esta conversa seguia o plano, deixa de seguir.
					const seguido = planoSeguido(atual.getBranch());
					if (seguido && seguido.toLowerCase() === apagado.toLowerCase()) pi.appendEntry(TIPO_ENTRADA_PLANO, { titulo: null });
					mostrar("desfeito", { materia, titulo: apagado, pedido: pedido ?? "" });
					await mostrarLista(dados, materia, atual);
				} catch (erro) {
					falhou(erro instanceof ErroMaterias ? erro.message : `Não consegui desfazer o plano: ${(erro as Error).message}`);
				}
			});
		}
	});

	pi.registerTool({
		name: "listar_planos",
		label: "Listar planos",
		description:
			"List the study plans of this conversation's subject (only available in a subject's notebook conversation). A study plan is a note with a checklist of topics; each is listed with its progress, and the one this conversation follows is marked.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const ramo = ctx.sessionManager.getBranch();
			const materia = materiaDaConversa(ramo);
			if (!materia) return falha("listar_planos só funciona na conversa do caderno de uma matéria.");
			try {
				const lista = await listarPlanos(ctx.cwd, materia);
				const seguido = planoSeguido(ramo)?.toLowerCase();
				const linhas = lista.map((plano) => `- ${plano.titulo}: ${plano.feitos} de ${plano.total} itens${plano.concluido ? " (concluído)" : ""}${plano.titulo.toLowerCase() === seguido ? " [esta conversa segue este plano]" : ""}`);
				const texto = linhas.length ? `Planos de estudos de ${materia}:\n${linhas.join("\n")}` : `A matéria ${materia} ainda não tem planos de estudos.`;
				return { content: [{ type: "text" as const, text: texto }], details: { materia, planos: lista } };
			} catch (erro) {
				return falha(mensagemDe(erro, "listar os planos"));
			}
		},
	});

	pi.registerTool({
		name: "ler_plano",
		label: "Ler plano",
		description:
			"Read a study plan of this conversation's subject: the objective and the numbered items with [x]/[ ] and the current one (the first not done). Without a title, reads the plan this conversation follows. Only available in a subject's notebook conversation.",
		parameters: Type.Object({
			titulo: Type.Optional(Type.String({ description: "Plan title, as listar_planos shows it. Omit to read the plan this conversation follows." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const ramo = ctx.sessionManager.getBranch();
			const materia = materiaDaConversa(ramo);
			if (!materia) return falha("ler_plano só funciona na conversa do caderno de uma matéria.");
			const seguido = planoSeguido(ramo);
			const titulo = params.titulo?.trim() || seguido;
			if (!titulo) return falha("Esta conversa não segue nenhum plano. Diga o título (veja listar_planos) ou crie um com criar_plano.");
			try {
				const { nota, plano } = await lerPlanoDaNota(ctx.cwd, materia, titulo);
				const segue = seguido?.toLowerCase() === nota.titulo.toLowerCase() ? "\nEsta conversa segue este plano." : "\nEsta conversa não segue este plano.";
				return { content: [{ type: "text" as const, text: `${descreverPlano(nota.titulo, plano)}${segue}` }], details: { materia, titulo: nota.titulo, feitos: plano.feitos, total: plano.total } };
			} catch (erro) {
				return falha(mensagemDe(erro, "ler o plano"));
			}
		},
	});

	pi.registerTool({
		name: "criar_plano",
		label: "Criar plano",
		description:
			"Create a NEW study plan in the notebook of the subject of this conversation (only available in a subject's notebook conversation) and make this conversation follow it. A plan is a checklist of topics, one per item, in the order to study them. Takes a title, an optional objective (one line) and the items (up to 60, each up to 300 characters, markdown without raw HTML). Use it when the user asks for a study plan, after at most 2 or 3 quick questions (deadline, what they already know). It never overwrites: if a note with that title exists it fails. The app shows the user a card with Open and Undo buttons. After creating, say the plan's title and that there is an Undo button, and start with the first item.",
		parameters: Type.Object({
			titulo: Type.String({ description: 'Plan title (it becomes the note file name: no < > : " / \\ | ? * or square brackets; up to 120 characters).' }),
			objetivo: Type.Optional(Type.String({ description: "The goal in one line (e.g. what the exam covers and when)." })),
			itens: Type.Array(Type.String({ description: "One topic, in one line (markdown allowed, no raw HTML)." }), { description: "The topics, in the order to study them." }),
		}),
		async execute(chamada, params, _signal, _onUpdate, ctx) {
			const materia = materiaDaConversa(ctx.sessionManager.getBranch());
			if (!materia) return falha("criar_plano só funciona na conversa do caderno de uma matéria. Nada foi criado.");
			const sessaoId = ctx.sessionManager.getSessionId();
			try {
				const criado = await naFilaComResultado(chaveDaNota(materia, params.titulo.trim()), () =>
					criarPlano(ctx.cwd, materia, { titulo: params.titulo, ...(params.objetivo ? { objetivo: params.objetivo } : {}), itens: params.itens, sessao: sessaoId }),
				);
				// A conversa passa a seguir o plano (entrada da sessão e evento).
				pi.appendEntry(TIPO_ENTRADA_PLANO, { titulo: criado.titulo });
				await registrarEventoPlano(ctx.cwd, materia, sessaoId, "seguiu_plano", { titulo: criado.titulo }).catch(() => undefined);
				avisarMudouFora(materia, criado);
				// Só depois de gravar o arquivo e o evento: o cartão da tela parte do que existe.
				const cartao: DadosPlanoCriado = { materia, titulo: criado.titulo, rota: `caderno/${materia}/notas/${criado.titulo}`, chamada, sessao: sessaoId };
				pi.events.emit("interface:mostrar", { painel: PAINEL_MESA, acao: ACAO_PLANO_CRIADO, dados: cartao, gravar: true });
				void mostrarLista(ctx.cwd, materia, ctx.sessionManager);
				return {
					content: [
						{
							type: "text" as const,
							text: `Plano "${criado.titulo}" criado no caderno ${materia}, com ${criado.itens} ${criado.itens === 1 ? "item" : "itens"}. O Breno vê na conversa um cartão com os botões Abrir e Desfazer, e esta conversa já segue o plano. Diga o título e que há um botão Desfazer.`,
						},
					],
					details: { materia, titulo: criado.titulo, itens: criado.itens },
				};
			} catch (erro) {
				return falha(`${mensagemDe(erro, "criar o plano")} Nada foi criado.`);
			}
		},
	});

	pi.registerTool({
		name: "atualizar_plano",
		label: "Atualizar plano",
		description:
			"Change the study plan this conversation follows, only with operations (you never rewrite the note): {tipo:'marcar', item:N} marks item N as done (use it when you finish teaching that item); {tipo:'desmarcar', item:N} unmarks it; {tipo:'acrescentar', texto, depois?:N} adds a new item at the end of the list, or right after item N. Items are numbered from 1 as ler_plano shows. 'texto' on marcar/desmarcar is optional and checks that item N is the one you mean. Returns the plan as it is now. Only available in a subject's notebook conversation, on the plan the conversation follows.",
		parameters: Type.Object({
			operacoes: Type.Array(
				Type.Object({
					tipo: Type.Union([Type.Literal("marcar"), Type.Literal("desmarcar"), Type.Literal("acrescentar")], { description: "The operation." }),
					item: Type.Optional(Type.Integer({ description: "Item number (marcar and desmarcar)." })),
					texto: Type.Optional(Type.String({ description: "acrescentar: the new item's text (one line, up to 300 characters). marcar/desmarcar: the item's text, to check it." })),
					depois: Type.Optional(Type.Integer({ description: "acrescentar: add right after this item number. Omit to add at the end." })),
				}),
				{ description: "The operations, applied in order." },
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const ramo = ctx.sessionManager.getBranch();
			const materia = materiaDaConversa(ramo);
			if (!materia) return falha("atualizar_plano só funciona na conversa do caderno de uma matéria. Nada foi mudado.");
			const seguido = planoSeguido(ramo);
			if (!seguido) return falha("Esta conversa não segue nenhum plano. Crie um com criar_plano. Nada foi mudado.");
			const operacoes: OperacaoPlano[] = [];
			for (const bruta of params.operacoes) {
				if (bruta.tipo === "acrescentar") {
					if (typeof bruta.texto !== "string") return falha("Para acrescentar, diga o texto do item. Nada foi mudado.");
					operacoes.push({ tipo: "acrescentar", texto: bruta.texto, ...(typeof bruta.depois === "number" ? { depois: bruta.depois } : {}) });
				} else {
					if (typeof bruta.item !== "number") return falha(`Para ${bruta.tipo}, diga o número do item. Nada foi mudado.`);
					operacoes.push({ tipo: bruta.tipo, item: bruta.item, ...(typeof bruta.texto === "string" ? { texto: bruta.texto } : {}) });
				}
			}
			const sessaoId = ctx.sessionManager.getSessionId();
			try {
				const gravado = await naFilaComResultado(chaveDaNota(materia, seguido), () => atualizarPlano(ctx.cwd, materia, seguido, operacoes, { sessao: sessaoId }));
				if (gravado.mudou) {
					avisarMudouFora(materia, gravado);
					void mostrarLista(ctx.cwd, materia, ctx.sessionManager);
				}
				const abertura = gravado.mudou ? "Plano atualizado." : "Nada mudou: o plano já estava assim.";
				return {
					content: [{ type: "text" as const, text: `${abertura}\n${descreverPlano(gravado.titulo, gravado.plano)}` }],
					details: { materia, titulo: gravado.titulo, feitos: gravado.plano.feitos, total: gravado.plano.total, mudou: gravado.mudou },
				};
			} catch (erro) {
				return falha(mensagemDe(erro, "atualizar o plano"));
			}
		},
	});
}
