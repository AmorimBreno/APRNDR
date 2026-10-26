// O esqueleto do guia de cursos no disco (item 5, parte C, docs/cursos.md,
// "Parte C: o esqueleto e o curso pronto"): a proposta em edição fica no
// curso.json, em esqueletoEmAndamento, gravado inteiro pela gravarCurso;
// "Criar curso" confirma a etapa pela confirmarNoDisco, com o calendário do
// dia, e o curso fica pronto. Os eventos gerou_esqueleto, criou_curso e
// recalculou_calendario (recalcular o calendário de um curso pronto) vão
// para o eventos.jsonl da matéria (editar a proposta não grava evento). As
// regras são puras e ficam em esqueleto-tipos.ts. Sem dependências: o pi
// carrega a extensão desta pasta. Quem chama segura a trava da matéria (a
// extensão de cursos).

import { type ContextoCurso, conferirOrdem, confirmarNoDisco, type Curso, ErroCurso, gravarCurso, hojeLocal, lerCurso } from "./cursos.ts";
import type { PromptUsado } from "./diagnostico.ts";
import { type ResumoConceito, resumoDoDiagnostico } from "./diagnostico-tipos.ts";
import { calcularCalendario, type EsqueletoEmAndamento, ErroEsqueleto, type Modulo, validarModulos } from "./esqueleto-tipos.ts";
import { acrescentarEvento, criarEvento } from "./eventos.ts";
import { lerMapa, type Prioridade } from "./mapa.ts";
import { eventosMateria } from "./materias.ts";

export * from "./esqueleto-tipos.ts";

/** O ContextoCurso (sessão, momento, hoje) e o que vai no contexto do gerou_esqueleto: o prompt e o modelo. */
export interface ContextoEsqueleto extends ContextoCurso {
	/** O esqueleto.md: o nome e os 12 primeiros hex do sha256 do conteúdo. */
	prompt?: PromptUsado;
	/** Sem ele, o modelo da geração. */
	modelo?: string;
}

const daSessao = (contexto: ContextoCurso) => (contexto.sessao ? { sessao: contexto.sessao } : {});

/** Erro se o curso já está pronto (um curso pronto não volta a ser rascunho). */
function conferirRascunho(curso: Curso): void {
	if (curso.situacao === "pronto") throw new ErroCurso("O curso já foi criado; mudar um curso pronto fica para depois.");
}

/**
 * Grava a proposta gerada pelo modelo (já consertada por consertarProposta):
 * substitui a proposta anterior e marca geradoEm, modelo e custo. Exige um
 * rascunho com as etapas até o Diagnóstico confirmadas; os módulos passam
 * pela validarModulos. Grava gerou_esqueleto no eventos.jsonl da matéria
 * (resultado {modulos, custo}; contexto {modelo, prompt}).
 */
export async function gravarProposta(
	dados: string,
	materia: string,
	curso: string,
	modulos: Modulo[],
	geracao: { modelo: string; custo: number },
	contexto: ContextoEsqueleto = {},
): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	conferirRascunho(atual);
	conferirOrdem(atual, "esqueleto");
	const validos = validarModulos(modulos, atual.mapa?.conceitos ?? []);
	const agora = contexto.agora ?? new Date();
	const emAndamento: EsqueletoEmAndamento = { modulos: validos, geradoEm: agora.toISOString(), modelo: geracao.modelo, custo: geracao.custo };
	const novo: Curso = { ...structuredClone(atual), esqueletoEmAndamento: emAndamento, alteradoEm: agora.toISOString() };
	await gravarCurso(dados, novo);
	const modelo = contexto.modelo ?? geracao.modelo;
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "gerou_esqueleto",
				objeto: { materia, curso: atual.id },
				resultado: { modulos: validos.length, custo: geracao.custo },
				contexto: { modelo, ...(contexto.prompt ? { prompt: { nome: contexto.prompt.nome, hash: contexto.prompt.hash } } : {}) },
			},
			agora,
		),
	);
	return novo;
}

/**
 * Grava a proposta editada inteira (editar_esqueleto): validarModulos estrita
 * (sem conserto: conceito faltando ou repetido, módulo vazio, nome vazio…
 * são erro), mantendo geradoEm, modelo e custo. Sem proposta, ou com o curso
 * pronto, ErroCurso. Os mesmos módulos não gravam nada. Sem evento.
 */
export async function salvarEdicao(dados: string, materia: string, curso: string, modulos: unknown, contexto: ContextoCurso = {}): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	conferirRascunho(atual);
	const emAndamento = atual.esqueletoEmAndamento;
	if (!emAndamento) throw new ErroEsqueleto("Monte o esqueleto antes de editar os módulos.");
	const validos = validarModulos(modulos, atual.mapa?.conceitos ?? []);
	if (JSON.stringify(validos) === JSON.stringify(emAndamento.modulos)) return atual;
	const agora = contexto.agora ?? new Date();
	const novo: Curso = { ...structuredClone(atual), esqueletoEmAndamento: { ...structuredClone(emAndamento), modulos: validos }, alteradoEm: agora.toISOString() };
	await gravarCurso(dados, novo);
	return novo;
}

/**
 * "Criar curso": calcula o calendário de hoje (calcularCalendario, com as
 * horas por semana e o prazo do Básico) e confirma a etapa esqueleto com a
 * proposta e o calendário (confirmarNoDisco: valida os módulos contra o Mapa
 * do curso, tira o em andamento e deixa o curso pronto). Grava criou_curso no
 * eventos.jsonl da matéria (resultado {nome, modulos, prazo,
 * avaliacaoGeral}). Sem proposta, ou com o curso já pronto, ErroCurso.
 */
export async function criarCurso(dados: string, materia: string, curso: string, contexto: ContextoCurso = {}): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	conferirRascunho(atual);
	conferirOrdem(atual, "esqueleto");
	const emAndamento = atual.esqueletoEmAndamento;
	if (!emAndamento) throw new ErroEsqueleto("Monte o esqueleto antes de criar o curso.");
	const agora = contexto.agora ?? new Date();
	const hoje = contexto.hoje ?? hojeLocal(agora);
	const basico = atual.basico!;
	const calendario = calcularCalendario(emAndamento.modulos, { horasPorSemana: basico.horasPorSemana, prazo: basico.prazo, hoje });
	const { curso: criado } = await confirmarNoDisco(dados, materia, curso, "esqueleto", { ...emAndamento, calendario }, { ...contexto, agora, hoje });
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "criou_curso",
				objeto: { materia, curso: criado.id },
				resultado: { nome: criado.nome, modulos: criado.esqueleto!.modulos.length, prazo: basico.prazo, avaliacaoGeral: calendario.avaliacaoGeral },
			},
			agora,
		),
	);
	return criado;
}

/**
 * "Recalcular o calendário" de um curso pronto: calcula o calendário com as
 * regras e os dias de hoje (calcularCalendario, com as horas por semana e o
 * prazo do Básico) e grava em esqueleto.calendario; os módulos ficam como
 * estão. Grava recalculou_calendario no eventos.jsonl da matéria (resultado
 * {avaliacaoGeral, avisos}). Um rascunho, ou um curso sem esqueleto, ErroCurso.
 */
export async function recalcularCalendario(dados: string, materia: string, curso: string, contexto: ContextoCurso = {}): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	if (atual.situacao !== "pronto" || !atual.esqueleto) throw new ErroCurso("Só um curso criado tem calendário para recalcular.");
	if (!atual.basico) throw new ErroCurso("Falta a etapa Básico (as horas por semana e o prazo) para recalcular o calendário.");
	const agora = contexto.agora ?? new Date();
	const hoje = contexto.hoje ?? hojeLocal(agora);
	const calendario = calcularCalendario(atual.esqueleto.modulos, { horasPorSemana: atual.basico.horasPorSemana, prazo: atual.basico.prazo, hoje });
	const novo: Curso = { ...structuredClone(atual), alteradoEm: agora.toISOString() };
	novo.esqueleto = { ...novo.esqueleto!, calendario };
	await gravarCurso(dados, novo);
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "recalculou_calendario",
				objeto: { materia, curso: atual.id },
				resultado: { avaliacaoGeral: calendario.avaliacaoGeral, avisos: calendario.avisos },
			},
			agora,
		),
	);
	return novo;
}

/** Um conceito do curso na mensagem do modelo do esqueleto. */
export interface ConceitoParaOModelo {
	id: string;
	nome: string;
	descricao: string;
	prioridade: Prioridade;
	/** O resumo do diagnóstico concluído para o conceito (o nível que ele disse, as questões e a calibração); null sem diagnóstico concluído. */
	diagnostico: Omit<ResumoConceito, "id"> | null;
}

/**
 * Os conceitos do curso na ordem do Mapa do curso, para a mensagem do modelo
 * do esqueleto: o nome, a descrição e a prioridade do mapa da matéria e o
 * resumo do diagnóstico concluído (resumoDoDiagnostico) de cada um. Um
 * conceito que não está mais no mapa da matéria vai com o id no lugar do
 * nome, descrição vazia e prioridade normal. Aceita o curso já lido ou o id.
 */
export async function conceitosParaOModelo(dados: string, materia: string, curso: string | Curso): Promise<ConceitoParaOModelo[]> {
	const atual = typeof curso === "string" ? await lerCurso(dados, materia, curso) : curso;
	const ids = atual.mapa?.conceitos ?? [];
	const mapa = await lerMapa(dados, materia);
	const doMapa = new Map(mapa.conceitos.map((conceito) => [conceito.id, conceito]));
	const resumo = atual.diagnostico ? resumoDoDiagnostico(atual.diagnostico, ids) : null;
	return ids.map((id, indice) => {
		const conceito = doMapa.get(id);
		let diagnostico: ConceitoParaOModelo["diagnostico"] = null;
		if (resumo) {
			const { id: _id, ...resto } = resumo.conceitos[indice]!;
			diagnostico = resto;
		}
		return { id, nome: conceito?.nome ?? id, descricao: conceito?.descricao ?? "", prioridade: conceito?.prioridade ?? "normal", diagnostico };
	});
}
