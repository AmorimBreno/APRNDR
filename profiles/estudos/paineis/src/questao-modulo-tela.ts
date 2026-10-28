// As partes puras das questões do módulo (docs/modulos.md, "Responder as
// questões", parte 2 do plano de 2026-10-28), que QuestaoModulo.tsx desenha:
// a pista do quiz, o que o QuizQuestion mostra em cada momento, a etiqueta da
// avaliação da pergunta e da marca de cada critério da dissertativa, o placar,
// a conferência (em andamento, falhou ou não terminou), o progresso no índice
// e no topo da visão, e a frase do pé quando todas estão feitas.
// Sem React e sem o design system (só os tipos): os testes
// (questao-modulo-tela.test.ts) rodam no Node.

import type { QuizResult } from "@estudos/design-system";
import {
	type AvaliacaoVerificacao,
	type BlocoQuestao,
	ehQuestao,
	type MarcaCriterio,
	notaDaDissertativa,
	type PlacarDissertativa,
	type Progresso,
	respostaDoBloco,
	type RespostaModulo,
	type RespostasModulo,
	type SituacaoQuestao,
	situacaoDaQuestao,
} from "../../lib/modulo-respostas-tipos.ts";
import type { BlocoAlternativa, Licao } from "../../lib/modulo-tipos.ts";
import { numeroCurto } from "./diagnostico-tela.ts";

// --- O quiz ------------------------------------------------------------------------

/**
 * A pista do quiz depois da primeira tentativa errada (o texto da confusão
 * da alternativa escolhida): "Confunde A com B." vira "Essa resposta confunde
 * A com B.". Sempre com ponto no fim. Vazia, "".
 */
export function fraseDaPista(confusao: string | null | undefined): string {
	const texto = confusao?.trim() ?? "";
	if (!texto) return "";
	const frase = `Essa resposta ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
	return /[.!?…]$/.test(frase) ? frase : `${frase}.`;
}

/** O que o QuizQuestion do quiz mostra agora. */
export interface VistaDoQuiz {
	/** O id (o índice em texto) da alternativa marcada; nenhuma, null. */
	valor: string | null;
	/** Com ele, o QuizQuestion revela: a correta fica verde e a marcada errada, tijolo. */
	correta?: string;
	/** As alternativas erradas de tentativas anteriores que o QuizQuestion não marca sozinho: ficam marcadas como erradas e desligadas. */
	erradas: number[];
	/** Embaixo de cada errada, a confusão dela (o gabarito inteiro). */
	confusoes: boolean;
}

/**
 * O que o QuizQuestion mostra (docs/modulos.md, "Quiz: duas tentativas"):
 * - antes de acabar: a escolha da tela (`escolhida`) e as erradas das
 *   tentativas anteriores, marcadas e desligadas;
 * - acertou: a certa, verde (a correta e a marcada são ela), e as erradas de
 *   antes, marcadas;
 * - acabou sem acerto (duas erradas ou "Não sei"): o gabarito inteiro, com a
 *   última escolha como "Sua resposta", a de antes marcada e a confusão
 *   embaixo de cada errada.
 */
export function vistaDoQuiz(bloco: BlocoAlternativa, resposta: RespostaModulo | null | undefined, escolhida?: number): VistaDoQuiz {
	const situacao = situacaoDaQuestao(bloco, resposta);
	const tentativas = resposta?.tipo === "alternativa" ? resposta.tentativas : [];
	const erradas = tentativas.filter((tentativa) => !tentativa.correta).map((tentativa) => tentativa.escolha);
	if (!situacao.encerrada) {
		const livre = escolhida !== undefined && !situacao.escolhas.includes(escolhida) ? String(escolhida) : null;
		return { valor: livre, erradas, confusoes: false };
	}
	const indiceCorreta = bloco.alternativas.findIndex((alternativa) => alternativa.correta === true);
	const correta = indiceCorreta >= 0 ? String(indiceCorreta) : undefined;
	const acerto = tentativas.find((tentativa) => tentativa.correta === true);
	if (acerto) return { valor: String(acerto.escolha), ...(correta !== undefined ? { correta } : {}), erradas, confusoes: false };
	const ultima = tentativas.at(-1);
	return {
		valor: ultima ? String(ultima.escolha) : null,
		...(correta !== undefined ? { correta } : {}),
		erradas: ultima ? erradas.filter((indice) => indice !== ultima.escolha) : erradas,
		confusoes: true,
	};
}

// --- As etiquetas ------------------------------------------------------------------

/** Uma Tag de resultado: o texto, a cor (as do resultado no design system: sálvia certo, creme parcial, tijolo errado) e o ícone (nunca só a cor). */
export interface EtiquetaResultado {
	texto: string;
	tom: "sage" | "cream" | "brick";
	icone: "check" | "refresh" | "close";
}

const CERTO = { tom: "sage", icone: "check" } as const;
const PARCIAL = { tom: "cream", icone: "refresh" } as const;
const ERRADO = { tom: "brick", icone: "close" } as const;

const ETIQUETAS_AVALIACAO: Record<AvaliacaoVerificacao, EtiquetaResultado> = {
	certa: { texto: "Certa", ...CERTO },
	parcial: { texto: "Em parte", ...PARCIAL },
	errada: { texto: "Errada", ...ERRADO },
};

/** A etiqueta da avaliação da pergunta: Certa, Em parte ou Errada. */
export const etiquetaDaAvaliacao = (avaliacao: AvaliacaoVerificacao): EtiquetaResultado => ETIQUETAS_AVALIACAO[avaliacao];

const ETIQUETAS_MARCA: Record<MarcaCriterio, EtiquetaResultado> = {
	coberto: { texto: "Coberto", ...CERTO },
	em_parte: { texto: "Em parte", ...PARCIAL },
	faltou: { texto: "Faltou", ...ERRADO },
};

/** A etiqueta da marca de um critério corrigido: Coberto, Em parte ou Faltou. */
export const etiquetaDaMarca = (marca: MarcaCriterio): EtiquetaResultado => ETIQUETAS_MARCA[marca];

/** O placar da dissertativa: "Você cobriu 2 de 3 pontos-chave · 5 de 8 pontos". */
export function textoDoPlacar(placar: Pick<PlacarDissertativa, "cobertos" | "criterios" | "total" | "max">): string {
	const chave = placar.criterios === 1 ? "ponto-chave" : "pontos-chave";
	const pontos = placar.max === 1 ? "ponto" : "pontos";
	return `Você cobriu ${placar.cobertos} de ${placar.criterios} ${chave} · ${numeroCurto(placar.total)} de ${numeroCurto(placar.max)} ${pontos}`;
}

// --- A conferência pelo modelo -------------------------------------------------------

/** A frase de quando a tentativa ficou sem conferência e nada está conferindo (a sessão acabou no meio, por exemplo). */
export const TEXTO_NAO_TERMINOU = "A conferência não terminou.";

/** "Conferindo…" na pergunta, "Corrigindo…" na dissertativa. */
export const textoConferindo = (tipo: BlocoQuestao["tipo"]): string => (tipo === "dissertativa" ? "Corrigindo…" : "Conferindo…");

/** Onde está a conferência da tentativa que espera o modelo. */
export type ConferenciaNaTela = { tipo: "conferindo" } | { tipo: "falhou"; mensagem: string };

/**
 * A conferência da questão: sem tentativa esperando (situacao.aConferir
 * null), null; com o bloco no corrigindo, conferindo; senão, falhou, com a
 * mensagem do erro (o da ponte ou o de pedir de novo) ou, sem nenhum, "A
 * conferência não terminou." (a sessão acabou no meio da conferência). As
 * duas falhas têm "Tentar de novo" (corrigir).
 */
export function conferenciaDaQuestao(situacao: Pick<SituacaoQuestao, "aConferir">, corrigindo: boolean, erro?: string): ConferenciaNaTela | null {
	if (situacao.aConferir === null) return null;
	if (corrigindo) return { tipo: "conferindo" };
	return { tipo: "falhou", mensagem: erro?.trim() || TEXTO_NAO_TERMINOU };
}

// --- O progresso -----------------------------------------------------------------------

/** "3 de 5" no índice; uma lição sem questão, "". */
export const textoDoProgresso = (progresso: Progresso): string => (progresso.questoes > 0 ? `${progresso.feitas} de ${progresso.questoes}` : "");

/** Todas as questões feitas (e há alguma). */
export const todasFeitas = (progresso: Progresso): boolean => progresso.questoes > 0 && progresso.feitas >= progresso.questoes;

/** A frase do pé da última lição quando todas as questões estão feitas. */
export const TEXTO_TODAS_FEITAS = "Você fez todas as questões.";

/**
 * Como a questão feita acabou, para o bloco dela no QuizProgress: certa
 * (correct), em parte (partial), errada (incorrect) ou "Não sei" sem
 * tentativa (skipped). Quiz: acertou de primeira, certa; na segunda, em
 * parte; duas erradas, ou "Não sei" depois de errar, errada. Pergunta: a
 * avaliação. Dissertativa: a nota (a última corrigida) cheia, certa; zero,
 * errada; no meio, em parte. Questão não feita, undefined.
 */
export function resultadoDaQuestao(bloco: BlocoQuestao, resposta: RespostaModulo | null | undefined): Exclude<QuizResult, null | undefined> | undefined {
	if (!situacaoDaQuestao(bloco, resposta).feita || !resposta || resposta.tipo !== bloco.tipo) return undefined;
	if (resposta.tipo === "alternativa") {
		const acerto = resposta.tentativas.findIndex((tentativa) => tentativa.correta === true);
		if (acerto === 0) return "correct";
		if (acerto > 0) return "partial";
		return resposta.naoSei && resposta.tentativas.length === 0 ? "skipped" : "incorrect";
	}
	if (resposta.naoSei) return "skipped";
	if (resposta.tipo === "verificacao") {
		const avaliacao = resposta.tentativas.find((tentativa) => tentativa.avaliacao)?.avaliacao;
		return avaliacao === "certa" ? "correct" : avaliacao === "parcial" ? "partial" : "incorrect";
	}
	const nota = notaDaDissertativa(resposta);
	if (!nota) return undefined;
	if (nota.total >= nota.max) return "correct";
	return nota.total > 0 ? "partial" : "incorrect";
}

/** O que o QuizProgress do topo da visão recebe: as feitas, quantas questões e os blocos. */
export interface PlacarDoModulo extends Progresso {
	/**
	 * Um bloco por questão feita, na ordem do módulo, com o resultado dela
	 * (resultadoDaQuestao); as não feitas ficam depois, vazias. Assim o "atual"
	 * do QuizProgress (as feitas) cai sempre num bloco feito, e nenhum bloco
	 * fica âmbar.
	 */
	resultados: Array<Exclude<QuizResult, null | undefined>>;
}

/** O placar do módulo para o QuizProgress do topo, pelas respostas da versão atual de cada bloco. */
export function placarDoModulo(modulo: { licoes: ReadonlyArray<Pick<Licao, "blocos">>; respostas?: RespostasModulo }): PlacarDoModulo {
	const resultados: PlacarDoModulo["resultados"] = [];
	let questoes = 0;
	for (const licao of modulo.licoes) {
		for (const bloco of licao.blocos) {
			if (!ehQuestao(bloco)) continue;
			questoes++;
			const resultado = resultadoDaQuestao(bloco, respostaDoBloco(modulo.respostas, bloco));
			if (resultado) resultados.push(resultado);
		}
	}
	return { feitas: resultados.length, questoes, resultados };
}
