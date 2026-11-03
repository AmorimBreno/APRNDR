// As partes puras do relatório do método na visão do módulo concluído e no
// card do curso (docs/metodo-experimentos.md, "A tela"): em que fase o
// relatório está, os textos de cada fase, o placar (as linhas da tabela, a
// formatação de cada métrica e se a média dos anteriores aparece), a decisão
// sobre cada experimento (o rótulo, o tom, "testado em: m2, m3"), os cartões
// dos aprendizados e das revisões, a contagem do cabeçalho e para onde leva o
// clique numa evidência. O relatório da versão 1 (com as propostas e a decisão
// que o Breno gravou) continua sendo desenhado, só para leitura.
// Sem React e sem o design system: os testes (relatorio-tela.test.ts) rodam
// no Node.

import type { IconName, Tone } from "@estudos/design-system";
import type { SituacaoAprendizado } from "../../lib/metodo-aprendizados-tipos.ts";
import { type DecisaoDoExperimento, MAXIMO_EXPERIMENTOS, type ModuloTestado, type RelatorioMetodoV2 } from "../../lib/metodo-analise-tipos.ts";
import {
	type DecisaoProposta,
	type EstadoRelatorio,
	type EvidenciaNaTela,
	MINIMO_RETORNOS,
	type PropostaRelatorio,
	type RelatorioMetodo,
} from "../../lib/metodo-ciclo-tipos.ts";
import { type Comparacao, type ItemDaComparacao, METRICAS, type MetricaDoPlacar } from "../../lib/metodo-placar-tipos.ts";
import { diaEMes } from "./modulo-tela.ts";

// --- Os textos ----------------------------------------------------------------------

export const TITULO_RELATORIO = "Relatório do método";
/** O id da seção, para o link do índice. */
export const ID_RELATORIO = "relatorio-metodo";
export const TEXTO_GERANDO = "O professor está lendo o seu retorno…";
export const TEXTO_POUCO_RETORNO = "Pouco retorno neste módulo para propor ajustes.";
export const ROTULO_GERAR = "Gerar o relatório do método";
export const ROTULO_GERAR_MESMO_ASSIM = "Gerar mesmo assim";
export const ROTULO_TENTAR_DE_NOVO = "Tentar de novo";
export const TEXTO_SEM_RELATORIO =
	"O professor lê o que você deixou neste módulo (notas, respostas e pedidos de explicação), compara com os módulos anteriores e decide o que fazer com os experimentos do método.";
export const TITULO_FUNCIONOU = "O que funcionou";
export const TITULO_PROBLEMAS = "O que não funcionou";
export const TITULO_PLACAR = "Placar do módulo";
export const TITULO_EXPERIMENTOS = "Experimentos";
export const TITULO_NOVOS = "Novos experimentos";
export const TITULO_PARA_DEPOIS = "Ficou para depois";
export const TITULO_FACILITA = "O que facilita";
/** O título da lista de propostas do relatório da versão 1. */
export const TITULO_PROPOSTAS = "Propostas de ajuste";
export const TEXTO_SEM_PROPOSTAS = "O professor não propôs ajustes desta vez.";
/** O que um experimento novo diz: ele só vale depois deste módulo. */
export const TEXTO_COMECA_NO_PROXIMO = "Começa no próximo módulo";
export const TEXTO_PARA_DEPOIS = `No máximo ${MAXIMO_EXPERIMENTOS} experimentos ficam em teste ao mesmo tempo. Estas ficaram de fora e não entram sozinhas depois.`;
export const COLUNA_METRICA = "Métrica";
export const COLUNA_ESTE_MODULO = "Este módulo";
export const COLUNA_MEDIA = "Média dos anteriores";

const plural = (quantos: number, um: string, varios: string) => `${quantos} ${quantos === 1 ? um : varios}`;

/** O relatório gravado é o da versão 2 (a análise dos experimentos)? Senão, é o da versão 1. */
export const ehRelatorioV2 = (relatorio: RelatorioMetodo): relatorio is RelatorioMetodoV2 => relatorio.versao === 2;

// --- A fase do relatório ----------------------------------------------------------------

/** O que a seção mostra: gerando, erro (o relatório anterior, se há, continua embaixo), pouco_retorno, pronto ou nenhum (concluído sem relatório). */
export type FaseRelatorio = "gerando" | "erro" | "pouco_retorno" | "pronto" | "nenhum";

/**
 * A fase pelo que a mensagem modulo trouxe: gerando vale sobre o resto (uma
 * nova tentativa em curso); depois o erro da última tentativa; senão o
 * relatório gravado; sem nenhum, nenhum.
 */
export function faseDoRelatorio(entrada: { relatorio?: Pick<RelatorioMetodo, "situacao"> | null | undefined; gerando?: boolean | undefined; erro?: string | undefined }): FaseRelatorio {
	if (entrada.gerando) return "gerando";
	if (entrada.erro) return "erro";
	return entrada.relatorio?.situacao ?? "nenhum";
}

/** A situação do relatório gravado que se desenha (num erro, o anterior). Sem relatório, undefined. */
export const conteudoDoRelatorio = (relatorio: Pick<RelatorioMetodo, "situacao"> | null | undefined): "pronto" | "pouco_retorno" | undefined => relatorio?.situacao;

/** "2 retornos neste módulo; o professor pede pelo menos 3." (pouco retorno). */
export function linhaDoPoucoRetorno(retornos: number): string {
	return `${plural(retornos, "retorno", "retornos")} neste módulo; o professor pede pelo menos ${MINIMO_RETORNOS}.`;
}

// --- O cabeçalho ------------------------------------------------------------------------

/**
 * O cabeçalho do relatório pronto. Versão 2: "2 experimentos analisados · 1
 * novo experimento" (só as partes que existem; sem nenhuma, "Nenhum
 * experimento"). Versão 1: "3 propostas" ou "Nenhuma proposta".
 */
export function contagemDoRelatorio(relatorio: RelatorioMetodo): string {
	if (!ehRelatorioV2(relatorio)) return relatorio.propostas.length === 0 ? "Nenhuma proposta" : plural(relatorio.propostas.length, "proposta", "propostas");
	const partes = [
		relatorio.experimentos.length > 0 ? plural(relatorio.experimentos.length, "experimento analisado", "experimentos analisados") : "",
		relatorio.propostas.length > 0 ? plural(relatorio.propostas.length, "novo experimento", "novos experimentos") : "",
	].filter(Boolean);
	return partes.length > 0 ? partes.join(" · ") : "Nenhum experimento";
}

// --- O placar -----------------------------------------------------------------------------

/** 3,5 e 0,21: o número com vírgula e `casas` casas. */
const comVirgula = (valor: number, casas: number) => valor.toFixed(casas).replace(".", ",");

/**
 * Uma métrica como a tabela a mostra, sem o n: taxa em porcentagem inteira
 * ("75%"), nota com uma casa ("3,5"), Brier com duas ("0,21") e contagem por
 * lição com uma ("1,5"). Sem amostra (null), "—".
 */
export function valorDaMetrica(metrica: Pick<MetricaDoPlacar, "tipo">, valor: number | null): string {
	if (valor === null) return "—";
	if (metrica.tipo === "taxa") return `${Math.round(valor * 100)}%`;
	if (metrica.tipo === "brier") return comVirgula(valor, 2);
	return comVirgula(valor, 1);
}

/** Uma linha da tabela do placar. `n` e `nMedia` (o texto pequeno) são "" sem amostra. */
export interface LinhaDoPlacar {
	id: string;
	nome: string;
	/** Este módulo: "75%" ou "—". */
	atual: string;
	/** "n = 8", ou "" sem amostra. */
	n: string;
	/** A média dos módulos anteriores: "68%" ou "—". */
	media: string;
	/** "n = 24 · 3 módulos", ou "" sem média. */
	nMedia: string;
}

const textoDoN = (n: number) => `n = ${n}`;

function linhaDaMetrica(metrica: MetricaDoPlacar, item: ItemDaComparacao): LinhaDoPlacar {
	return {
		id: metrica.id,
		nome: metrica.nome,
		atual: valorDaMetrica(metrica, item.atual),
		n: item.atual === null ? "" : textoDoN(item.nAtual),
		media: valorDaMetrica(metrica, item.media),
		nMedia: item.media === null ? "" : `${textoDoN(item.nMedia)} · ${plural(item.modulos, "módulo", "módulos")}`,
	};
}

/** Alguma métrica tem a média de módulos anteriores? Sem nenhuma, a coluna da média some. */
export const temMediaDosAnteriores = (comparacao: Comparacao): boolean => METRICAS.some((metrica) => comparacao[metrica.id].media !== null);

/**
 * As linhas da tabela do placar, na ordem de METRICAS. A métrica sem amostra
 * nenhuma, nem neste módulo nem nos anteriores, não diz nada e fica de fora.
 */
export function linhasDoPlacar(comparacao: Comparacao): LinhaDoPlacar[] {
	return METRICAS.filter((metrica) => comparacao[metrica.id].atual !== null || comparacao[metrica.id].media !== null).map((metrica) => linhaDaMetrica(metrica, comparacao[metrica.id]));
}

// --- Os experimentos ---------------------------------------------------------------------

/** "Mantido: virou regra", "Descartado", "Reescrito" ou "Continua em teste". */
export const ROTULO_DA_DECISAO: Readonly<Record<DecisaoDoExperimento, string>> = {
	manter: "Mantido: virou regra",
	descartar: "Descartado",
	reescrever: "Reescrito",
	continuar: "Continua em teste",
};

export const rotuloDaDecisaoDoExperimento = (decisao: DecisaoDoExperimento): string => ROTULO_DA_DECISAO[decisao];

/** A cor e o ícone da etiqueta da decisão. */
export const ESTILO_DA_DECISAO: Readonly<Record<DecisaoDoExperimento, { tom: Tone; icone: IconName }>> = {
	manter: { tom: "sage", icone: "check" },
	descartar: { tom: "brick", icone: "close" },
	reescrever: { tom: "amber", icone: "refresh" },
	continuar: { tom: "steel", icone: "clock" },
};

/**
 * "testado em: m2, m3" (os módulos em que o experimento valeu, contando o
 * atual). Dois módulos de cursos diferentes com o mesmo id vão com o curso
 * ("c1/m1, c2/m1"). Sem módulos, "".
 */
export function linhaDoTestadoEm(testadoEm: readonly Pick<ModuloTestado, "curso" | "modulo">[]): string {
	if (testadoEm.length === 0) return "";
	const repetidos = new Set(testadoEm.map((item) => item.modulo).filter((modulo, indice, todos) => todos.indexOf(modulo) !== indice));
	return `testado em: ${testadoEm.map((item) => (repetidos.has(item.modulo) ? `${item.curso}/${item.modulo}` : item.modulo)).join(", ")}`;
}

// --- O que facilita ------------------------------------------------------------------------

/** "Observado", "Confirmado" ou "Contradito". */
export const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoAprendizado, string>> = {
	observado: "Observado",
	confirmado: "Confirmado",
	contradito: "Contradito",
};

export const rotuloDaSituacao = (situacao: SituacaoAprendizado): string => ROTULO_DA_SITUACAO[situacao];

/** A cor e o ícone da etiqueta da situação de um aprendizado. */
export const ESTILO_DA_SITUACAO: Readonly<Record<SituacaoAprendizado, { tom: Tone; icone: IconName }>> = {
	observado: { tom: "steel", icone: "bulb" },
	confirmado: { tom: "sage", icone: "check" },
	contradito: { tom: "brick", icone: "close" },
};

/** Alguma coisa para a seção "O que facilita" (aprendizados novos ou revisões)? */
export const temFacilita = (relatorio: Pick<RelatorioMetodoV2, "aprendizados" | "revisoes">): boolean => relatorio.aprendizados.length > 0 || relatorio.revisoes.length > 0;

/** "Observado → Confirmado": a revisão de um aprendizado, da situação de antes para a nova. */
export const linhaDaRevisao = (revisao: { anterior: SituacaoAprendizado; situacao: SituacaoAprendizado }): string => `${rotuloDaSituacao(revisao.anterior)} → ${rotuloDaSituacao(revisao.situacao)}`;

// --- As propostas do relatório da versão 1 ---------------------------------------------------

/** "Aprovada em 03/11" ou "Rejeitada". */
export function rotuloDaDecisao(decisao: DecisaoProposta): string {
	if (decisao.tipo === "rejeitada") return "Rejeitada";
	const dia = diaEMes(decisao.em);
	return dia ? `Aprovada em ${dia}` : "Aprovada";
}

/** O texto que vale na proposta: o final da aprovação (editado ou não) ou, sem aprovação, o ajuste proposto. */
export const textoDaProposta = (proposta: Pick<PropostaRelatorio, "ajuste" | "decisao">): string =>
	proposta.decisao?.tipo === "aprovada" ? proposta.decisao.texto : proposta.ajuste;

/** A aprovação mudou o texto proposto (o Breno editou antes de aprovar). */
export const foiEditada = (proposta: Pick<PropostaRelatorio, "ajuste" | "decisao">): boolean =>
	proposta.decisao?.tipo === "aprovada" && proposta.decisao.texto.trim() !== proposta.ajuste.trim();

// --- As evidências ------------------------------------------------------------------------

/** Para onde leva o clique numa evidência: o bloco (navegação dos termos, apontarTermo), a lição (quando o evento é do questionário) ou lugar nenhum. */
export type DestinoDaEvidencia = { tipo: "bloco"; modulo: string; licao: string; bloco: string } | { tipo: "licao"; modulo: string; licao: string };

export function destinoDaEvidencia(evidencia: Pick<EvidenciaNaTela, "licao" | "bloco">, modulo: string): DestinoDaEvidencia | undefined {
	if (!evidencia.licao) return undefined;
	return evidencia.bloco ? { tipo: "bloco", modulo, licao: evidencia.licao, bloco: evidencia.bloco } : { tipo: "licao", modulo, licao: evidencia.licao };
}

// --- O card do curso ----------------------------------------------------------------------

/**
 * A linha do relatório no card do módulo concluído: "Gerando o relatório…",
 * "Relatório pronto · 2 experimentos em teste" (com nenhum em teste, só
 * "Relatório pronto"; com um, "1 experimento em teste"). `experimentosEmTeste`
 * é o número de agora, do estado do curso. Erro, pouco retorno e sem
 * relatório, "" (nada).
 */
export function linhaDoRelatorioNoCard(relatorio: Pick<EstadoRelatorio, "situacao"> | undefined, experimentosEmTeste: number | undefined): string {
	if (!relatorio) return "";
	if (relatorio.situacao === "gerando") return "Gerando o relatório…";
	if (relatorio.situacao !== "pronto") return "";
	const quantos = experimentosEmTeste ?? 0;
	if (quantos <= 0) return "Relatório pronto";
	return `Relatório pronto · ${plural(quantos, "experimento", "experimentos")} em teste`;
}
