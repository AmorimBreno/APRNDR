// O diagnóstico do guia de cursos no disco (item 5, parte B, docs/cursos.md,
// "Parte B: o diagnóstico"): o progresso fica no curso.json, em
// diagnosticoEmAndamento, gravado inteiro pela gravarCurso; concluir confirma
// a etapa pela confirmarNoDisco. Os eventos de aprendizagem
// (autoavaliou_conceito, respondeu_questao, respondeu_dissertativa) vão para o
// aprendiz/eventos.jsonl; os da linha do tempo (gerou_diagnostico,
// concluiu_diagnostico), para o eventos.jsonl da matéria. As regras são puras
// e ficam em diagnostico-tipos.ts. Sem dependências: o pi carrega a extensão
// desta pasta. Quem chama segura a trava da matéria (a extensão de cursos).

import { type ContextoCurso, conferirOrdem, confirmarNoDisco, type Curso, type Etapa, gravarCurso, lerCurso } from "./cursos.ts";
import {
	aplicarCorrecao,
	aplicarResposta,
	autoavaliacaoCompleta,
	type Correcao,
	type DiagnosticoEmAndamento,
	ErroDiagnostico,
	type NivelAutoavaliacao,
	type Questao,
	type RespostaAlternativa,
	type RespostaDissertativa,
	type ResumoDiagnostico,
	resumoDoDiagnostico,
	validarAutoavaliacao,
} from "./diagnostico-tipos.ts";
import { acrescentarEvento, criarEvento } from "./eventos.ts";
import { type Conceito, ErroMapa, lerTrechos } from "./mapa.ts";
import { eventosAprendiz, eventosMateria } from "./materias.ts";

export * from "./diagnostico-tipos.ts";

/** Até quantos caracteres dos trechos citados vão para o modelo por conceito, e no total. */
export const LIMITE_TRECHOS_CONCEITO = 6_000;
export const LIMITE_TRECHOS_TOTAL = 40_000;

/** O prompt usado: o nome do arquivo (diagnostico.md, corretor.md) e o hash do conteúdo. */
export interface PromptUsado {
	nome: string;
	hash: string;
}

/** O ContextoCurso (sessão, momento, hoje) e o que vai no contexto dos eventos: o prompt e o modelo. */
export interface ContextoDiagnostico extends ContextoCurso {
	prompt?: PromptUsado;
	/** Sem ele, o modelo do próprio passo (o das questões ou o da correção), quando há. */
	modelo?: string;
}

const daSessao = (contexto: ContextoCurso) => (contexto.sessao ? { sessao: contexto.sessao } : {});

/** O contexto dos eventos do diagnóstico: {fase: "diagnostico", modelo?, prompt?}. */
function contextoDoEvento(contexto: ContextoDiagnostico, modelo?: string): Record<string, unknown> {
	const usado = contexto.modelo ?? modelo;
	return { fase: "diagnostico", ...(usado ? { modelo: usado } : {}), ...(contexto.prompt ? { prompt: { nome: contexto.prompt.nome, hash: contexto.prompt.hash } } : {}) };
}

const vazio = (): DiagnosticoEmAndamento => ({ autoavaliacao: {}, questoes: [], respostas: {} });

/** Os mesmos conceitos com os mesmos níveis (a ordem das chaves não importa). */
function mesmaAutoavaliacao(a: Record<string, NivelAutoavaliacao>, b: Record<string, NivelAutoavaliacao>): boolean {
	const chavesA = Object.keys(a);
	return chavesA.length === Object.keys(b).length && chavesA.every((id) => a[id] === b[id]);
}

/** O diagnóstico em andamento do curso, ou ErroDiagnostico se não há questões geradas. */
function comQuestoes(curso: Curso): DiagnosticoEmAndamento {
	const emAndamento = curso.diagnosticoEmAndamento;
	if (!emAndamento || emAndamento.questoes.length === 0) throw new ErroDiagnostico("Gere as questões do diagnóstico antes de responder.");
	return emAndamento;
}

/**
 * Salva a autoavaliação (inteira: a que vier substitui a anterior; pode ser
 * parcial) no diagnóstico em andamento, criando-o se não há. Níveis de 0 a 3,
 * só para conceitos do Mapa do curso (id de fora, ErroDiagnostico); exige as
 * etapas até o Mapa confirmadas. Grava um autoavaliou_conceito no
 * aprendiz/eventos.jsonl para cada conceito cujo nível mudou (em relação ao
 * em andamento, ou ao diagnóstico concluído quando não há em andamento).
 * Nada mudou, nada é gravado.
 */
export async function salvarAutoavaliacao(dados: string, materia: string, curso: string, niveis: unknown, contexto: ContextoDiagnostico = {}): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	conferirOrdem(atual, "diagnostico");
	const conceitos = atual.mapa?.conceitos ?? [];
	const validos = validarAutoavaliacao(niveis, conceitos);
	const emAndamento = atual.diagnosticoEmAndamento ?? null;
	const anterior = emAndamento?.autoavaliacao ?? atual.diagnostico?.autoavaliacao ?? {};
	if (mesmaAutoavaliacao(validos, emAndamento?.autoavaliacao ?? anterior)) return atual;
	const agora = contexto.agora ?? new Date();
	const novo: Curso = { ...structuredClone(atual), diagnosticoEmAndamento: { ...structuredClone(emAndamento ?? vazio()), autoavaliacao: validos }, alteradoEm: agora.toISOString() };
	await gravarCurso(dados, novo);
	for (const id of conceitos) {
		const nivel = validos[id];
		if (nivel === undefined || nivel === anterior[id]) continue;
		await acrescentarEvento(
			eventosAprendiz(dados),
			criarEvento(
				{ ...daSessao(contexto), verbo: "autoavaliou_conceito", objeto: { materia, curso: atual.id, conceitos: [id] }, resultado: { nivel }, contexto: contextoDoEvento(contexto) },
				agora,
			),
		);
	}
	return novo;
}

/**
 * Grava as questões geradas (já conferidas por validarQuestoes): substitui as
 * questões e as respostas anteriores e marca geradoEm, modelo e custo. Exige
 * a autoavaliação completa. Grava gerou_diagnostico no eventos.jsonl da
 * matéria (resultado {questoes, custo}).
 */
export async function gravarQuestoes(
	dados: string,
	materia: string,
	curso: string,
	questoes: Questao[],
	geracao: { modelo: string; custo: number },
	contexto: ContextoDiagnostico = {},
): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	conferirOrdem(atual, "diagnostico");
	if (!autoavaliacaoCompleta(atual)) throw new ErroDiagnostico("Dê um nível a todos os conceitos do curso antes de gerar as questões.");
	if (questoes.length === 0) throw new ErroDiagnostico("Não há questões para gravar.");
	const agora = contexto.agora ?? new Date();
	const emAndamento: DiagnosticoEmAndamento = {
		autoavaliacao: structuredClone(atual.diagnosticoEmAndamento!.autoavaliacao),
		questoes: structuredClone(questoes),
		geradoEm: agora.toISOString(),
		modelo: geracao.modelo,
		custo: geracao.custo,
		respostas: {},
	};
	const novo: Curso = { ...structuredClone(atual), diagnosticoEmAndamento: emAndamento, alteradoEm: agora.toISOString() };
	await gravarCurso(dados, novo);
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "gerou_diagnostico",
				objeto: { materia, curso: atual.id },
				resultado: { questoes: questoes.length, custo: geracao.custo },
				contexto: contextoDoEvento(contexto, geracao.modelo),
			},
			agora,
		),
	);
	return novo;
}

/**
 * Grava a resposta de uma questão (aplicarResposta: a alternativa já sai
 * corrigida). Na alternativa, grava respondeu_questao no
 * aprendiz/eventos.jsonl na hora; a dissertativa só ganha o evento quando a
 * correção chega (gravarCorrecao).
 */
export async function gravarResposta(dados: string, materia: string, curso: string, questao: string, entrada: unknown, contexto: ContextoDiagnostico = {}): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	const emAndamento = comQuestoes(atual);
	const agora = contexto.agora ?? new Date();
	const respondido = aplicarResposta(emAndamento, questao, entrada, agora);
	const novo: Curso = { ...structuredClone(atual), diagnosticoEmAndamento: respondido, alteradoEm: agora.toISOString() };
	await gravarCurso(dados, novo);
	const daQuestao = respondido.questoes.find((item) => item.id === questao)!;
	if (daQuestao.tipo === "alternativa") {
		const resposta = respondido.respostas[questao] as RespostaAlternativa;
		await acrescentarEvento(
			eventosAprendiz(dados),
			criarEvento(
				{
					...daSessao(contexto),
					verbo: "respondeu_questao",
					objeto: { materia, curso: atual.id, conceitos: daQuestao.conceitos, questao },
					resultado: {
						correta: resposta.correta,
						escolha: resposta.escolha,
						...(resposta.confusao ? { confusao: resposta.confusao } : {}),
						confianca: resposta.confianca,
						tempoMs: resposta.tempoMs,
					},
					contexto: contextoDoEvento(contexto, emAndamento.modelo),
				},
				agora,
			),
		);
	}
	return novo;
}

/**
 * Grava a correção de uma dissertativa (já conferida por validarCorrecao) e o
 * evento respondeu_dissertativa no aprendiz/eventos.jsonl (resultado
 * {confianca, tempoMs, total, max, criterios, texto}; o modelo do contexto é
 * o da correção).
 */
export async function gravarCorrecao(dados: string, materia: string, curso: string, questao: string, correcao: Correcao, contexto: ContextoDiagnostico = {}): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	const emAndamento = comQuestoes(atual);
	const agora = contexto.agora ?? new Date();
	const corrigido = aplicarCorrecao(emAndamento, questao, correcao);
	const novo: Curso = { ...structuredClone(atual), diagnosticoEmAndamento: corrigido, alteradoEm: agora.toISOString() };
	await gravarCurso(dados, novo);
	const daQuestao = corrigido.questoes.find((item) => item.id === questao)!;
	const resposta = corrigido.respostas[questao] as RespostaDissertativa;
	await acrescentarEvento(
		eventosAprendiz(dados),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "respondeu_dissertativa",
				objeto: { materia, curso: atual.id, conceitos: daQuestao.conceitos, questao },
				resultado: {
					confianca: resposta.confianca,
					tempoMs: resposta.tempoMs,
					total: correcao.total,
					max: correcao.max,
					criterios: correcao.criterios.map((item) => ({ criterio: item.criterio, pontos: item.pontos, max: item.max })),
					texto: resposta.texto,
				},
				contexto: contextoDoEvento(contexto, correcao.modelo),
			},
			agora,
		),
	);
	return novo;
}

/**
 * Conclui o diagnóstico: confirma a etapa diagnostico com o conteúdo do
 * diagnosticoEmAndamento (confirmarNoDisco; a validação exige as questões
 * todas respondidas e corrigidas e a autoavaliação completa), o que tira o
 * em andamento e pode invalidar o Esqueleto. Grava concluiu_diagnostico no
 * eventos.jsonl da matéria (resultado {acertos, alternativas, dissertativas,
 * nota}). Sem diagnóstico em andamento, ErroDiagnostico.
 */
export async function concluirDiagnostico(
	dados: string,
	materia: string,
	curso: string,
	contexto: ContextoDiagnostico = {},
): Promise<{ curso: Curso; invalidadas: Etapa[]; resumo: ResumoDiagnostico }> {
	const atual = await lerCurso(dados, materia, curso);
	const emAndamento = atual.diagnosticoEmAndamento;
	if (!emAndamento) throw new ErroDiagnostico("Não há diagnóstico em andamento para concluir.");
	const agora = contexto.agora ?? new Date();
	const resultado = await confirmarNoDisco(dados, materia, curso, "diagnostico", emAndamento, { ...contexto, agora });
	const resumo = resumoDoDiagnostico(emAndamento, atual.mapa?.conceitos ?? []);
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "concluiu_diagnostico",
				objeto: { materia, curso: atual.id },
				resultado: { acertos: resumo.total.acertos, alternativas: resumo.total.alternativas, dissertativas: resumo.total.dissertativas, nota: resumo.total.nota },
				contexto: contextoDoEvento(contexto, emAndamento.modelo),
			},
			agora,
		),
	);
	return { ...resultado, resumo };
}

/** Um trecho do .extraido citado nas referências de um conceito. */
export interface TrechoCitado {
	arquivo: string;
	local: string;
	texto: string;
	/** O texto foi cortado para caber no limite. Só aparece quando é verdadeiro. */
	cortado?: true;
}

/** Os trechos citados de um conceito, na ordem das referências. */
export interface TrechosDoConceito {
	id: string;
	trechos: TrechoCitado[];
}

/**
 * Os trechos do .extraido citados nas referências de cada conceito, para a
 * mensagem do modelo das questões: até `porConceito` caracteres por conceito
 * (6 mil) e `total` no todo (40 mil), na ordem dos conceitos e das
 * referências; o trecho que não cabe inteiro é cortado (cortado: true) e os
 * seguintes ficam de fora. Um arquivo sem extraído (o material saiu) ou um
 * trecho que não está no manifesto é pulado; um trecho citado por dois
 * conceitos vai nos dois. Todo conceito recebido aparece na saída, mesmo sem
 * trechos.
 */
export async function trechosDosConceitos(
	dados: string,
	materia: string,
	conceitos: ReadonlyArray<Pick<Conceito, "id" | "referencias">>,
	limites: { porConceito?: number; total?: number } = {},
): Promise<TrechosDoConceito[]> {
	const porConceito = limites.porConceito ?? LIMITE_TRECHOS_CONCEITO;
	const limiteTotal = limites.total ?? LIMITE_TRECHOS_TOTAL;
	const lidos = new Map<string, Awaited<ReturnType<typeof lerTrechos>> | null>();
	const doArquivo = async (arquivo: string) => {
		if (!lidos.has(arquivo)) {
			try {
				lidos.set(arquivo, await lerTrechos(dados, materia, arquivo));
			} catch (erro) {
				if (!(erro instanceof ErroMapa)) throw erro;
				lidos.set(arquivo, null);
			}
		}
		return lidos.get(arquivo) ?? null;
	};
	let total = 0;
	const saida: TrechosDoConceito[] = [];
	for (const conceito of conceitos) {
		const trechos: TrechoCitado[] = [];
		const vistos = new Set<string>();
		let doConceito = 0;
		for (const referencia of conceito.referencias) {
			const cabe = Math.min(porConceito - doConceito, limiteTotal - total);
			if (cabe <= 0) break;
			const chave = `${referencia.arquivo}\u0000${referencia.trecho}`;
			if (vistos.has(chave)) continue;
			vistos.add(chave);
			const trecho = (await doArquivo(referencia.arquivo))?.find((item) => item.nome === referencia.trecho);
			if (!trecho?.texto) continue;
			const cortado = trecho.texto.length > cabe;
			const texto = cortado ? trecho.texto.slice(0, cabe) : trecho.texto;
			trechos.push({ arquivo: referencia.arquivo, local: referencia.local, texto, ...(cortado ? { cortado: true as const } : {}) });
			doConceito += texto.length;
			total += texto.length;
		}
		saida.push({ id: conceito.id, trechos });
	}
	return saida;
}
