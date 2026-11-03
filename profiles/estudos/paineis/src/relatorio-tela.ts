// As partes puras do relatório do método na visão do módulo concluído e no
// card do curso (docs/metodo-ciclo.md, "A tela"): em que fase o relatório
// está, os textos de cada fase, a contagem das propostas, a decisão (o
// rótulo, o texto final), o que vai para a ponte ao aprovar, editar e aprovar
// ou rejeitar, e para onde leva o clique numa evidência.
// Sem React e sem o design system: os testes (relatorio-tela.test.ts) rodam
// no Node.

import {
	AJUSTE_MAXIMO,
	type DecisaoProposta,
	type EstadoRelatorio,
	type EvidenciaNaTela,
	MINIMO_RETORNOS,
	MOTIVO_MAXIMO,
	type PropostaRelatorio,
	type RelatorioMetodo,
	validarTextoAjuste,
} from "../../lib/metodo-ciclo-tipos.ts";
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
export const TEXTO_SEM_RELATORIO = "O professor lê o que você deixou neste módulo (notas, respostas e pedidos de explicação) e propõe ajustes ao jeito de ensinar. Você decide cada um.";
export const TITULO_FUNCIONOU = "O que funcionou";
export const TITULO_PROBLEMAS = "O que não funcionou";
export const TITULO_PROPOSTAS = "Propostas de ajuste";
export const TEXTO_SEM_PROPOSTAS = "O professor não propôs ajustes desta vez.";
export const ROTULO_APROVAR = "Aprovar";
export const ROTULO_EDITAR_E_APROVAR = "Editar e aprovar";
export const ROTULO_REJEITAR = "Rejeitar";
export const ROTULO_TEXTO_DO_AJUSTE = "Texto do ajuste";
export const ROTULO_MOTIVO = "Motivo (opcional)";

const plural = (quantos: number, um: string, varios: string) => `${quantos} ${quantos === 1 ? um : varios}`;

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

// --- As propostas ---------------------------------------------------------------------

/** As propostas sem decisão. */
export const pendentesDoRelatorio = (relatorio: Pick<RelatorioMetodo, "propostas"> | null | undefined): number =>
	(relatorio?.propostas ?? []).filter((proposta) => !proposta.decisao).length;

/** O cabeçalho das propostas: "3 propostas · 2 para decidir", "1 proposta · todas decididas" ou "Nenhuma proposta". */
export function contagemDasPropostas(relatorio: Pick<RelatorioMetodo, "propostas">): string {
	const total = relatorio.propostas.length;
	if (total === 0) return "Nenhuma proposta";
	const pendentes = pendentesDoRelatorio(relatorio);
	return `${plural(total, "proposta", "propostas")} · ${pendentes === 0 ? (total === 1 ? "decidida" : "todas decididas") : `${pendentes} para decidir`}`;
}

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

// --- O que vai para a ponte --------------------------------------------------------------

/** O que a tela manda em decidir_proposta (além do módulo, do pedido e da proposta). */
export type DadosDaDecisao = { decisao: "aprovar"; texto?: string } | { decisao: "rejeitar"; motivo?: string };

/** O contador e o limite do texto de um ajuste (o TextArea tem o mesmo maxLength). */
export const LIMITE_DO_AJUSTE = AJUSTE_MAXIMO;
export const LIMITE_DO_MOTIVO = MOTIVO_MAXIMO;

/** "Aprovar": o ajuste como está (a extensão grava o texto da proposta). */
export const aprovacaoDireta = (): DadosDaDecisao => ({ decisao: "aprovar" });

/**
 * O problema do texto de "Editar e aprovar" (validarTextoAjuste: vazio, mais
 * de 400 caracteres, linha começando com "## ", "<!--" ou "-->"); sem
 * problema, undefined.
 */
export function problemaDoTextoEditado(texto: string): string | undefined {
	try {
		validarTextoAjuste(texto);
		return undefined;
	} catch (falha) {
		return (falha as Error).message;
	}
}

/**
 * "Editar e aprovar": o texto conferido. Igual ao proposto (sem espaços nas
 * pontas), vai como "Aprovar", sem texto: a aprovação não conta como editada.
 * Texto com problema, ErroMetodo (problemaDoTextoEditado diz antes).
 */
export function aprovacaoEditada(proposta: Pick<PropostaRelatorio, "ajuste">, texto: string): DadosDaDecisao {
	const conferido = validarTextoAjuste(texto);
	return conferido === proposta.ajuste.trim() ? aprovacaoDireta() : { decisao: "aprovar", texto: conferido };
}

/** "Rejeitar": o motivo aparado, até MOTIVO_MAXIMO caracteres; vazio, sem motivo. */
export function rejeicao(motivo: string): DadosDaDecisao {
	const limpo = motivo.trim().slice(0, MOTIVO_MAXIMO).trimEnd();
	return limpo ? { decisao: "rejeitar", motivo: limpo } : { decisao: "rejeitar" };
}

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
 * "Relatório: 2 propostas para decidir" ou "Relatório pronto". Erro, pouco
 * retorno e sem relatório, "" (nada).
 */
export function linhaDoRelatorioNoCard(relatorio: Pick<EstadoRelatorio, "situacao" | "pendentes"> | undefined): string {
	if (!relatorio) return "";
	if (relatorio.situacao === "gerando") return "Gerando o relatório…";
	if (relatorio.situacao !== "pronto") return "";
	if (relatorio.pendentes > 0) return `Relatório: ${plural(relatorio.pendentes, "proposta", "propostas")} para decidir`;
	return "Relatório pronto";
}
