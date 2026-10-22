// Cursos da matéria e o guia de criação (item 5, parte A, docs/cursos.md).
// Arquivo do projeto, não do learn. As regras (validação, o que cada etapa
// invalida) e o disco ficam em ../lib/curso-tipos.ts e ../lib/cursos.ts; aqui
// ficam:
// - a ponte com a tela (painel "cursos", docs/ponte-de-eventos.md): listar,
//   abrir, comecar, confirmar, descartar e prontos; a extensão responde com "lista",
//   "curso", "descartado" e "erro", sempre passageiros (gravar: false). Uma
//   trava por matéria para todo ler-mudar-gravar dos cursos. Na etapa
//   Materiais, a lista de arquivos é a dos materiais prontos na hora
//   (materiaisProntos): o que a tela mandar é ignorado; toda mensagem "curso"
//   leva os materiais prontos de agora (prontos), para a tela avisar quando
//   eles mudaram desde a etapa Materiais;
// - a ferramenta só de leitura do professor, ler_curso. Numa conversa de
//   caderno, ela fica na matéria da conversa.
import { stat } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type AcoesCursos,
	comecarCurso,
	confirmarNoDisco,
	type Curso,
	descartarCurso,
	ErroCurso,
	ETAPAS,
	type Escopo,
	lerCurso,
	listarCursos,
	materiaisMudaram,
	materiaisProntos,
	type MensagensCursos,
	nomeDaEtapa,
	PAINEL_CURSOS,
	resumoDoCurso,
	type TipoCurso,
} from "../lib/cursos.ts";
import { ErroMapa, lerMapa, type MapaConteudo } from "../lib/mapa.ts";
import { arquivoMateria, ErroMaterias } from "../lib/materias.ts";
import { materiaDaConversa } from "./notas.ts";

/** Até quantos caracteres ler_curso devolve de uma vez. */
const LIMITE_LEITURA = 40_000;

const ACOES: ReadonlyArray<keyof AcoesCursos> = ["listar", "abrir", "comecar", "confirmar", "descartar", "prontos"];

interface DadosAcao {
	materia?: unknown;
	curso?: unknown;
	pedido?: unknown;
	basico?: unknown;
	etapa?: unknown;
	dados?: unknown;
}

const FRASES: Record<keyof AcoesCursos | "ler", string> = {
	listar: "listar os cursos",
	abrir: "abrir o curso",
	comecar: "começar o curso",
	confirmar: "confirmar a etapa do curso",
	descartar: "descartar o curso",
	prontos: "ler os materiais prontos",
	ler: "ler o curso",
};

const mensagemDe = (erro: unknown, acao: keyof typeof FRASES) =>
	erro instanceof ErroCurso || erro instanceof ErroMapa || erro instanceof ErroMaterias ? erro.message : `Não consegui ${FRASES[acao]}: ${(erro as Error).message}`;

// --- Texto para o professor ----------------------------------------------------

const ESCOPOS: Record<Escopo, string> = { so_material: "só o material", material_base: "o material como base, podendo ir além", livre: "livre (sem depender de material)" };
const TIPOS: Record<TipoCurso, string> = { teorico: "teórico", aplicado: "aplicado", misto: "misto (teoria e aplicação)" };

const situacaoDo = (curso: Pick<Curso, "situacao" | "etapa">) =>
	curso.situacao === "pronto" ? "pronto" : `rascunho, parado na etapa ${nomeDaEtapa(curso.etapa)}`;

/** O texto de ler_curso sem curso: os cursos da matéria, um por linha. */
export function textoDaLista(materia: string, cursos: readonly Curso[], erros: ReadonlyArray<{ pasta: string; mensagem: string }> = []): string {
	const linhas = [`# Cursos de ${materia}`];
	if (cursos.length === 0) linhas.push("", "A matéria ainda não tem cursos.");
	else
		linhas.push(
			"",
			...cursos.map((curso) => `- ${curso.nome} (id ${curso.id}): ${situacaoDo(curso)}; ${curso.basico?.prazo ? `prazo ${curso.basico.prazo}` : "sem prazo"}`),
		);
	if (erros.length) linhas.push("", "Pastas de curso que não deu para ler:", ...erros.map((erro) => `- ${erro.pasta}: ${erro.mensagem}`));
	return linhas.join("\n");
}

/**
 * O texto de ler_curso com curso: o resumo do curso.json (básico, materiais,
 * objetivo, os nomes dos conceitos do curso lidos do mapa) e o que falta.
 */
export function textoDoCurso(curso: Curso, extra: { mapa?: MapaConteudo; prontos?: ReadonlyArray<{ arquivo: string; hash: string }> } = {}): string {
	const linhas = [`# Curso ${curso.nome} (id ${curso.id}, matéria ${curso.materia})`, `Situação: ${situacaoDo(curso)}.`];
	const naoConfirmada = "ainda não confirmada";

	linhas.push("", "## Básico");
	if (curso.basico) {
		linhas.push(`Prazo: ${curso.basico.prazo ?? "sem prazo"}.`);
		if (curso.basico.prova) linhas.push(`Prova: ${curso.basico.prova}.`);
		linhas.push(`Horas por semana: ${curso.basico.horasPorSemana}.`);
	} else linhas.push(`(${naoConfirmada})`);

	linhas.push("", "## Materiais");
	if (curso.materiais) {
		linhas.push(curso.materiais.arquivos.length ? curso.materiais.arquivos.map((item) => `- ${item.arquivo}`).join("\n") : "Nenhum material (o curso não usa arquivos).");
		if (extra.prontos && materiaisMudaram(curso, extra.prontos)) linhas.push("Aviso: os materiais prontos da matéria mudaram depois desta confirmação.");
	} else linhas.push(`(${naoConfirmada})`);

	linhas.push("", "## Objetivo");
	if (curso.objetivo) {
		linhas.push(`Escopo: ${ESCOPOS[curso.objetivo.escopo] ?? curso.objetivo.escopo}.`, `Tipo: ${TIPOS[curso.objetivo.tipo] ?? curso.objetivo.tipo}.`);
		if (curso.objetivo.motivo) linhas.push(`Motivo: ${curso.objetivo.motivo}`);
	} else linhas.push(`(${naoConfirmada})`);

	linhas.push("", "## Mapa (os conceitos do curso, na ordem do mapa)");
	if (curso.mapa) {
		const porId = new Map((extra.mapa?.conceitos ?? []).map((conceito) => [conceito.id, conceito]));
		const largura = Math.max(2, String(curso.mapa.conceitos.length).length);
		linhas.push(
			...curso.mapa.conceitos.map((id, indice) => {
				const conceito = porId.get(id);
				const rotulo = `${String(indice + 1).padStart(largura, "0")}.`;
				if (!conceito) return `${rotulo} (${id}: não está mais no mapa da matéria)`;
				return `${rotulo} ${conceito.nome}${conceito.fora ? " [tirado do mapa da matéria depois]" : ""}${conceito.descricao ? ` — ${conceito.descricao}` : ""}`;
			}),
		);
	} else linhas.push(`(${naoConfirmada})`);

	const faltam = ETAPAS.filter((etapa) => curso[etapa] === null || curso[etapa] === undefined);
	linhas.push("", faltam.length ? `Falta confirmar: ${faltam.map(nomeDaEtapa).join(", ")}.` : "Todas as etapas estão confirmadas.");
	const texto = linhas.join("\n");
	return texto.length > LIMITE_LEITURA ? `${texto.slice(0, LIMITE_LEITURA)}\n\n[… o curso continua; mostrei os primeiros ${LIMITE_LEITURA} caracteres]` : texto;
}

// --- A extensão -----------------------------------------------------------------

export default function cursos(pi: ExtensionAPI) {
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	/** Uma trava por matéria: cada ler-mudar-gravar dos cursos espera o anterior. */
	const travas = new Map<string, Promise<unknown>>();

	const daSessao = () => (sessao ? { sessao } : {});

	const mostrar = <A extends keyof MensagensCursos>(acao: A, dados: MensagensCursos[A]) =>
		pi.events.emit("interface:mostrar", { painel: PAINEL_CURSOS, acao, dados, gravar: false });

	/** Roda `tarefa` na trava da matéria (depois da anterior, mesmo que ela tenha falhado). */
	const naTrava = <T>(materia: string, tarefa: () => Promise<T>): Promise<T> => {
		const resultado = (travas.get(materia) ?? Promise.resolve()).then(tarefa, tarefa);
		travas.set(materia, resultado.catch(() => undefined));
		return resultado;
	};

	const mostrarLista = async (dados: string, materia: string) => {
		const { cursos: lista } = await listarCursos(dados, materia);
		mostrar("lista", { materia, cursos: lista.map(resumoDoCurso) });
	};

	/** A matéria existe (o materia.json)? O id vem da tela; nunca cria pasta solta. */
	const materiaExiste = async (dados: string, materia: string) => {
		if (!/^[a-z0-9-]+$/.test(materia)) return false;
		try {
			await stat(arquivoMateria(dados, materia));
			return true;
		} catch {
			return false;
		}
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
	});

	// Fim da sessão (sair, recarregar, trocar de conversa): a cópia fica calada.
	pi.on("session_shutdown", () => {
		pastaDados = undefined;
	});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_CURSOS || !ACOES.includes(acao as keyof AcoesCursos)) return;
		const dadosAcao = (bruto ?? {}) as DadosAcao;
		const materia = dadosAcao.materia;
		if (typeof materia !== "string") return;
		// Sem session_start, esta cópia não é a da sessão (a carga a mais ao
		// recarregar o código, como em mapa.ts): ela fica calada, senão cada
		// ação seria feita em dobro.
		const dados = pastaDados;
		if (!dados) return;
		const ao = acao as keyof AcoesCursos;
		const pedido = typeof dadosAcao.pedido === "string" ? dadosAcao.pedido : undefined;
		const comPedido = pedido ? { pedido } : {};
		const curso = typeof dadosAcao.curso === "string" ? dadosAcao.curso : undefined;
		const comCurso = curso ? { curso } : {};

		void (async () => {
			if (!(await materiaExiste(dados, materia))) {
				mostrar("erro", { mensagem: `Não achei a matéria "${materia}".`, ao, materia, ...comCurso, ...comPedido });
				return;
			}
			try {
				if (ao === "listar") {
					await naTrava(materia, () => mostrarLista(dados, materia));
					return;
				}
				if (ao === "comecar") {
					await naTrava(materia, async () => {
						const novo = await comecarCurso(dados, materia, dadosAcao.basico, daSessao());
						mostrar("curso", { materia, curso: novo, ...comPedido, prontos: await materiaisProntos(dados, materia) });
						await mostrarLista(dados, materia);
					});
					return;
				}
				if (!curso) {
					mostrar("erro", { mensagem: "Falta o id do curso.", ao, materia, ...comPedido });
					return;
				}
				if (ao === "abrir" || ao === "prontos") {
					await naTrava(materia, async () =>
						mostrar("curso", { materia, curso: await lerCurso(dados, materia, curso), prontos: await materiaisProntos(dados, materia) }),
					);
				} else if (ao === "confirmar") {
					await naTrava(materia, async () => {
						const etapa = dadosAcao.etapa as Parameters<typeof confirmarNoDisco>[3];
						// A foto dos materiais é a do disco na hora, nunca a que a tela mandou.
						const prontos = await materiaisProntos(dados, materia);
						const entrada = etapa === "materiais" ? { arquivos: prontos } : dadosAcao.dados;
						const resultado = await confirmarNoDisco(dados, materia, curso, etapa, entrada, daSessao());
						mostrar("curso", { materia, curso: resultado.curso, invalidadas: resultado.invalidadas, ...comPedido, prontos });
					});
				} else if (ao === "descartar") {
					await naTrava(materia, async () => {
						const descartado = await descartarCurso(dados, materia, curso, daSessao());
						mostrar("descartado", { materia, curso: descartado.id, pedido: pedido ?? "" });
						await mostrarLista(dados, materia);
					});
				}
			} catch (erro) {
				mostrar("erro", { mensagem: mensagemDe(erro, ao), ao, materia, ...comCurso, ...comPedido });
			}
		})();
	});

	/** A matéria que a ferramenta lê: a da conversa, se ela for de um caderno; senão, a do parâmetro. */
	const escolherMateria = (pedida: string | undefined, entradas: Parameters<typeof materiaDaConversa>[0]): { materia: string } | { erro: string } => {
		const daConversa = materiaDaConversa(entradas);
		if (daConversa) {
			if (pedida && pedida !== daConversa) return { erro: `Esta conversa é do caderno "${daConversa}": os cursos de outras matérias ficam de fora aqui.` };
			return { materia: daConversa };
		}
		if (!pedida) return { erro: "Diga a matéria (o id, de listar_materias)." };
		return { materia: pedida };
	};

	pi.registerTool({
		name: "ler_curso",
		label: "Ler curso",
		description:
			"Read a subject's courses (study plans the user builds in the notebook's course guide). Without `curso`, lists the subject's courses: name, id, status (draft and the step where it stopped, or ready) and deadline. With `curso`, summarizes that course: deadline and hours per week, chosen materials, scope, type and the user's goal, the concepts of the content map the course covers (in map order) and which guide steps are still missing. In a notebook conversation, the subject is the conversation's. Read only: never change a course.",
		parameters: Type.Object({
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
			curso: Type.Optional(Type.String({ description: "Course id (from the list). Without it, lists the subject's courses." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			const { materia } = escolha;
			if (!(await materiaExiste(ctx.cwd, materia))) return { content: [{ type: "text", text: `Não achei a matéria "${materia}".` }], details: undefined, isError: true };
			try {
				if (!params.curso) {
					const lista = await listarCursos(ctx.cwd, materia);
					return { content: [{ type: "text", text: textoDaLista(materia, lista.cursos, lista.erros) }], details: { materia, cursos: lista.cursos.length } };
				}
				const lido = await lerCurso(ctx.cwd, materia, params.curso);
				const mapa = lido.mapa ? await lerMapa(ctx.cwd, materia) : undefined;
				const prontos = lido.materiais ? await materiaisProntos(ctx.cwd, materia) : undefined;
				return {
					content: [{ type: "text", text: textoDoCurso(lido, { mapa, prontos }) }],
					details: { materia, curso: lido.id, situacao: lido.situacao, etapa: lido.etapa },
				};
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "ler") }], details: undefined, isError: true };
			}
		},
	});
}
