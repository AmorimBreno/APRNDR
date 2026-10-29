// O feedback do Breno nos módulos no disco (docs/modulos.md, "O feedback"):
// a última nota de cada bloco (feedback) e o último questionário de cada
// lição (questionarios) ficam no <módulo>.json, gravado inteiro
// (gravarModulo, lib/arquivos.ts); o evento avaliou_licao vai para o
// aprendiz/eventos.jsonl (o avaliou_bloco é gravado por registrarRetorno, em
// lib/escrita.ts). As regras são puras e ficam em modulo-feedback-tipos.ts.
// Sem dependências: o pi carrega a extensão desta pasta. Quem chama segura a
// trava da matéria (a extensão de módulos).

import type { ContextoCurso } from "./cursos.ts";
import type { PromptUsado } from "./diagnostico.ts";
import { acrescentarEvento, criarEvento, type Evento } from "./eventos.ts";
import { eventosAprendiz } from "./materias.ts";
import { aplicarFeedback, aplicarQuestionario, validarQuestionario } from "./modulo-feedback-tipos.ts";
import { ErroModulo, gravarModulo, lerModulo, type ModuloGerado } from "./modulos.ts";

export * from "./modulo-feedback-tipos.ts";

/** O módulo gravado; sem arquivo, ErroModulo. Um arquivo ilegível é ErroModulo e não é sobrescrito. */
async function moduloGravado(dados: string, materia: string, curso: string, modulo: string) {
	const lido = await lerModulo(dados, materia, curso, modulo);
	if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
	return lido;
}

/**
 * Grava a nota de um bloco no <módulo>.json (aplicarFeedback): a avaliação
 * nova, a versão atual do bloco, quando (agora) e o id do evento avaliou_bloco
 * que a deu. Devolve o módulo novo. Sem evento: ele é gravado antes, por
 * registrarRetorno.
 */
export async function gravarFeedback(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	licao: unknown,
	bloco: unknown,
	nota: { avaliacao: unknown; evento: string; agora?: Date },
): Promise<ModuloGerado> {
	const novo = aplicarFeedback(await moduloGravado(dados, materia, curso, modulo), licao, bloco, nota);
	await gravarModulo(dados, novo);
	return novo;
}

/** A sessão, o momento, o modelo e os prompts que geraram a lição (para o contexto do avaliou_licao). */
export interface ContextoQuestionario extends Pick<ContextoCurso, "sessao" | "agora"> {
	/** Sem ele, o modelo do módulo. */
	modelo?: string;
	/** O prompt da lição e os das reescritas dos blocos dela (nome e hash). */
	prompts?: PromptUsado[];
}

/**
 * Grava o questionário do fim da lição (validarQuestionario, depois
 * aplicarQuestionario): o <módulo>.json com questionarios[licao] = {notas,
 * texto, em, evento} e o evento avaliou_licao no aprendiz/eventos.jsonl, com
 * objeto {materia, curso, modulo, licao, conceitos (os da lição)}, resultado
 * {notas, texto} e contexto {fase: "modulo", modelo, prompts}. Enviar de novo
 * grava outro evento e troca o questionário gravado. Notas ou texto fora do
 * formato, módulo sem arquivo ou aguardando material, lição que não existe,
 * ErroModulo (nada gravado).
 */
export async function registrarQuestionario(
	dados: string,
	materia: string,
	curso: string,
	modulo: string,
	licao: unknown,
	entrada: unknown,
	contexto: ContextoQuestionario = {},
): Promise<{ modulo: ModuloGerado; evento: Evento }> {
	const questionario = validarQuestionario(entrada);
	const lido = await moduloGravado(dados, materia, curso, modulo);
	if (lido.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo} está aguardando material; não há lição para avaliar.`);
	const daLicao = lido.licoes.find((item) => item.id === licao);
	if (!daLicao) throw new ErroModulo(`Não achei a lição "${String(licao)}" no módulo ${modulo}.`);
	const agora = contexto.agora ?? new Date();
	const evento = criarEvento(
		{
			...(contexto.sessao ? { sessao: contexto.sessao } : {}),
			verbo: "avaliou_licao",
			objeto: { materia, curso, modulo, licao: daLicao.id, conceitos: [...daLicao.conceitos] },
			resultado: { notas: { ...questionario.notas }, texto: questionario.texto },
			contexto: { fase: "modulo", modelo: contexto.modelo ?? lido.modelo, prompts: (contexto.prompts ?? []).map((prompt) => ({ nome: prompt.nome, hash: prompt.hash })) },
		},
		agora,
	);
	const novo = aplicarQuestionario(lido, daLicao.id, { ...questionario, evento: evento.id, agora });
	await gravarModulo(dados, novo);
	await acrescentarEvento(eventosAprendiz(dados), evento);
	return { modulo: novo, evento };
}
