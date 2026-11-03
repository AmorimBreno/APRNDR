// A agenda do perfil de estudos (calendário, tarefas e quadro kanban,
// docs/agenda.md). Arquivo do projeto, não do learn. As regras e o disco ficam
// em ../lib/agenda-tipos.ts e ../lib/agenda.ts; aqui ficam:
// - a ponte com a tela (painel "agenda", docs/ponte-de-eventos.md): a tela manda
//   "interface:acao" (abrir, criar_tarefa, editar_tarefa, mover_tarefa,
//   apagar_tarefa, criar_coluna, renomear_coluna, reordenar_colunas,
//   marcar_feito, apagar_coluna) e a extensão responde sempre com
//   "interface:mostrar": a mensagem "agenda" inteira (colunas, tarefas, provas
//   de todas as matérias e as matérias) ou "erro", as duas com o "pedido" da
//   tela de volta e passageiras (gravar: false). As provas não são copiadas:
//   saem do materia.json de cada matéria a cada resposta. Todo ler-mudar-gravar
//   passa por uma fila só (a agenda é um arquivo só);
// - a ferramenta só de leitura do professor, ler_agenda. O professor não cria
//   nem muda tarefas.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	abrirAgenda,
	type Agenda,
	apagarColunaNoDisco,
	apagarTarefaNoDisco,
	criarColunaNoDisco,
	criarTarefaNoDisco,
	editarTarefaNoDisco,
	ehData,
	type EntradaTarefa,
	ErroAgenda,
	hojeLocal,
	itensComProvas,
	marcarFeitoNoDisco,
	type MateriaDaAgenda,
	type MensagensAgenda,
	moverTarefaNoDisco,
	type MudancasTarefa,
	PAINEL_AGENDA,
	type ProvaDaAgenda,
	renomearColunaNoDisco,
	reordenarColunasNoDisco,
	somarDias,
	type Tarefa,
	tarefasAtrasadas,
	tarefasSemData,
} from "../lib/agenda.ts";
import { ErroMaterias } from "../lib/materias.ts";

/** Até quantos dias à frente ler_agenda olha quando não vem o fim do intervalo. */
export const DIAS_PADRAO = 30;
/** Até quantas linhas ler_agenda mostra em cada seção. */
const LIMITE_LINHAS = 40;
/** Até quantos caracteres da nota de uma tarefa ler_agenda mostra. */
const LIMITE_NOTA_NO_TEXTO = 140;

/** O que a tela manda numa ação (tudo pode vir errado: é JSON). */
type DadosAcao = Record<string, unknown>;

const textoOuNada = (valor: unknown) => (typeof valor === "string" ? valor : undefined);
const numeroOuNada = (valor: unknown) => (typeof valor === "number" ? valor : undefined);

const mensagemDe = (erro: unknown, acao: string) =>
	erro instanceof ErroAgenda || erro instanceof ErroMaterias ? erro.message : `Não consegui executar a ação "${acao}" da agenda: ${(erro as Error).message}`;

/**
 * O texto de ler_agenda: as tarefas atrasadas, as abertas com data no
 * intervalo (sem repetir as atrasadas), as abertas sem data e as provas no
 * intervalo. `hoje`, `de` e `ate` são AAAA-MM-DD.
 */
export function textoDaAgenda(entrada: {
	agenda: Agenda;
	materias: ReadonlyArray<MateriaDaAgenda>;
	provas: ReadonlyArray<ProvaDaAgenda>;
	hoje: string;
	de: string;
	ate: string;
	materia?: string;
}): string {
	const { agenda, materias, provas, hoje, de, ate, materia } = entrada;
	const nomeDaMateria = (id: string) => materias.find((item) => item.id === id)?.nome ?? id;
	const linhaDaTarefa = (tarefa: Tarefa) => {
		const coluna = agenda.colunas.find((item) => item.id === tarefa.coluna)?.nome ?? tarefa.coluna;
		const partes = [
			`id ${tarefa.id}`,
			...(tarefa.data ? [`${tarefa.data}${tarefa.hora ? ` ${tarefa.hora}` : ""}`] : []),
			...(tarefa.materia ? [`matéria ${nomeDaMateria(tarefa.materia)}`] : []),
			`coluna ${coluna}`,
		];
		const nota = tarefa.nota ? ` Nota: ${tarefa.nota.replace(/\s+/g, " ").slice(0, LIMITE_NOTA_NO_TEXTO)}${tarefa.nota.length > LIMITE_NOTA_NO_TEXTO ? "…" : ""}` : "";
		return `- ${tarefa.titulo} (${partes.join("; ")}).${nota}`;
	};
	const secao = (titulo: string, linhas: string[]) => {
		const vistas = linhas.slice(0, LIMITE_LINHAS);
		const resto = linhas.length - vistas.length;
		return [`## ${titulo} (${linhas.length})`, ...(vistas.length ? vistas : ["(nenhuma)"]), ...(resto > 0 ? [`… e mais ${resto}`] : [])].join("\n");
	};

	const atrasadas = tarefasAtrasadas(agenda, hoje, materia);
	const idsAtrasadas = new Set(atrasadas.map((tarefa) => tarefa.id));
	const itens = itensComProvas(agenda, provas, { de, ate, ...(materia ? { materia } : {}) });
	const porId = new Map(agenda.tarefas.map((tarefa) => [tarefa.id, tarefa]));
	const noIntervalo = itens.filter((item) => item.tipo === "tarefa" && !item.feita && !idsAtrasadas.has(item.id)).map((item) => porId.get(item.id)!);
	const provasNoIntervalo = itens.filter((item) => item.tipo === "prova").map((item) => `- ${item.data}: ${item.titulo} (matéria ${nomeDaMateria(item.materia!)})`);

	return [
		`# Agenda de ${de} a ${ate} (hoje é ${hoje})${materia ? `, só a matéria ${nomeDaMateria(materia)}` : ""}`,
		`Colunas do quadro, em ordem: ${agenda.colunas.map((coluna) => (coluna.feito ? `${coluna.nome} (feito)` : coluna.nome)).join(", ")}. Tarefa aberta é a que não está na coluna de feito.`,
		"",
		secao("Atrasadas (abertas, com data antes de hoje)", atrasadas.map(linhaDaTarefa)),
		"",
		secao("Abertas com data no intervalo", noIntervalo.map(linhaDaTarefa)),
		"",
		secao("Abertas sem data", tarefasSemData(agenda, materia).map(linhaDaTarefa)),
		"",
		secao("Provas no intervalo", provasNoIntervalo),
	].join("\n");
}

export default function agendaExtensao(pi: ExtensionAPI) {
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	/** A fila das escritas (e das leituras da tela): cada uma espera a anterior, mesmo que ela tenha falhado. */
	let fila: Promise<unknown> = Promise.resolve();

	const mostrar = <A extends keyof MensagensAgenda>(acao: A, dados: MensagensAgenda[A]) => pi.events.emit("interface:mostrar", { painel: PAINEL_AGENDA, acao, dados, gravar: false });

	const naFila = (tarefa: () => Promise<void>) => {
		const proxima = fila.then(tarefa, tarefa);
		fila = proxima.catch(() => undefined);
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
	});

	/** Lê tudo de novo (agenda e provas) e manda a mensagem "agenda", com o pedido e o id do que foi criado. */
	const mandarAgenda = async (dados: string, extra: { pedido?: string; criada?: string }) => {
		const { agenda, provas, materias } = await abrirAgenda(dados);
		mostrar("agenda", {
			colunas: agenda.colunas,
			tarefas: agenda.tarefas,
			provas,
			materias,
			...(extra.pedido ? { pedido: extra.pedido } : {}),
			...(extra.criada ? { criada: extra.criada } : {}),
		});
	};

	/** Roda a ação na fila e responde: a agenda inteira (com o pedido) ou o erro (com o pedido). `fazer` devolve o id criado, se houver. */
	const executar = (dados: string, acao: string, pedido: string | undefined, fazer: () => Promise<string | undefined>) =>
		naFila(async () => {
			try {
				const criada = await fazer();
				await mandarAgenda(dados, { ...(pedido ? { pedido } : {}), ...(criada ? { criada } : {}) });
			} catch (erro) {
				mostrar("erro", { mensagem: mensagemDe(erro, acao), ao: acao, ...(pedido ? { pedido } : {}) });
			}
		});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_AGENDA || typeof acao !== "string") return;
		// Sem session_start, esta cópia não é a da sessão: ao recarregar o código, o
		// núcleo carrega as extensões uma vez a mais (montagem.ts), e essa carga
		// continua ouvindo o barramento (ver packages/core/src/ponte.ts). Ela fica
		// calada; quem responde é a cópia da sessão.
		const dados = pastaDados;
		if (!dados) return;
		const d = (bruto ?? {}) as DadosAcao;
		const pedido = textoOuNada(d.pedido);
		const daSessao = sessao ? { sessao } : {};
		const falta = (oQue: string) => mostrar("erro", { mensagem: `Faltou ${oQue} na ação "${acao}" da agenda.`, ao: acao, ...(pedido ? { pedido } : {}) });

		switch (acao) {
			case "abrir":
				executar(dados, acao, pedido, async () => undefined);
				break;
			case "criar_tarefa":
				executar(dados, acao, pedido, async () => {
					const entrada: EntradaTarefa = {
						titulo: d.titulo as string,
						...("nota" in d ? { nota: d.nota as string | null } : {}),
						...("coluna" in d ? { coluna: d.coluna as string } : {}),
						...("data" in d ? { data: d.data as string | null } : {}),
						...("hora" in d ? { hora: d.hora as string | null } : {}),
						...("materia" in d ? { materia: d.materia as string | null } : {}),
					};
					return (await criarTarefaNoDisco(dados, entrada, daSessao)).tarefa.id;
				});
				break;
			case "editar_tarefa": {
				const id = textoOuNada(d.id);
				if (!id) return falta("o id da tarefa");
				executar(dados, acao, pedido, async () => {
					await editarTarefaNoDisco(dados, id, (d.mudancas ?? {}) as MudancasTarefa, daSessao);
					return undefined;
				});
				break;
			}
			case "mover_tarefa": {
				const id = textoOuNada(d.id);
				const coluna = textoOuNada(d.coluna);
				if (!id) return falta("o id da tarefa");
				if (!coluna) return falta("a coluna de destino");
				executar(dados, acao, pedido, async () => {
					await moverTarefaNoDisco(dados, id, coluna, numeroOuNada(d.posicao), daSessao);
					return undefined;
				});
				break;
			}
			case "apagar_tarefa": {
				const id = textoOuNada(d.id);
				if (!id) return falta("o id da tarefa");
				executar(dados, acao, pedido, async () => {
					await apagarTarefaNoDisco(dados, id, daSessao);
					return undefined;
				});
				break;
			}
			case "criar_coluna":
				executar(dados, acao, pedido, async () => (await criarColunaNoDisco(dados, d.nome as string, numeroOuNada(d.posicao), daSessao)).coluna.id);
				break;
			case "renomear_coluna": {
				const id = textoOuNada(d.id);
				if (!id) return falta("o id da coluna");
				executar(dados, acao, pedido, async () => {
					await renomearColunaNoDisco(dados, id, d.nome as string, daSessao);
					return undefined;
				});
				break;
			}
			case "reordenar_colunas":
				if (!Array.isArray(d.ids)) return falta("a lista de ids das colunas");
				executar(dados, acao, pedido, async () => {
					await reordenarColunasNoDisco(dados, d.ids as string[], daSessao);
					return undefined;
				});
				break;
			case "marcar_feito": {
				const id = textoOuNada(d.id);
				if (!id) return falta("o id da coluna");
				executar(dados, acao, pedido, async () => {
					await marcarFeitoNoDisco(dados, id, daSessao);
					return undefined;
				});
				break;
			}
			case "apagar_coluna": {
				const id = textoOuNada(d.id);
				if (!id) return falta("o id da coluna");
				executar(dados, acao, pedido, async () => {
					await apagarColunaNoDisco(dados, id, textoOuNada(d.destino), daSessao);
					return undefined;
				});
				break;
			}
		}
	});

	pi.registerTool({
		name: "ler_agenda",
		label: "Ler agenda",
		description:
			"Read the user's agenda (one global calendar + kanban board of tasks; each task may belong to a subject). Returns, as short text: overdue open tasks, open tasks dated within the interval, open tasks without a date, and the exams (provas) of the subjects within the interval. Interval: `de` to `ate` (YYYY-MM-DD, inclusive); default is today through the next 30 days. `materia` limits everything to one subject (id from listar_materias). A task is open when it is not in the board's done column. Read only: never create or change tasks; if the user wants a task, tell them to add it in the agenda screen.",
		parameters: Type.Object({
			de: Type.Optional(Type.String({ description: "Interval start, YYYY-MM-DD. Default: today." })),
			ate: Type.Optional(Type.String({ description: "Interval end, YYYY-MM-DD. Default: 30 days after the start (or after today)." })),
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Without it, all subjects and tasks without a subject." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const erro = (texto: string) => ({ content: [{ type: "text" as const, text: texto }], details: undefined, isError: true });
			const hoje = hojeLocal();
			const de = params.de ?? hoje;
			const ate = params.ate ?? somarDias(de, DIAS_PADRAO);
			if (!ehData(de) || !ehData(ate)) return erro("As datas precisam estar no formato AAAA-MM-DD (e existir).");
			if (de > ate) return erro("O início do intervalo (de) é depois do fim (ate).");
			try {
				const { agenda, provas, materias } = await abrirAgenda(ctx.cwd);
				if (params.materia && !materias.some((materia) => materia.id === params.materia)) return erro(`Não achei a matéria "${params.materia}".`);
				const texto = textoDaAgenda({ agenda, materias, provas, hoje, de, ate, ...(params.materia ? { materia: params.materia } : {}) });
				return {
					content: [{ type: "text" as const, text: texto }],
					details: { de, ate, ...(params.materia ? { materia: params.materia } : {}), tarefas: agenda.tarefas.length },
				};
			} catch (falha) {
				return erro(mensagemDe(falha, "ler"));
			}
		},
	});
}
