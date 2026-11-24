// O cartão "Plano criado" na conversa do professor (docs/planos-de-estudo.md, seção 7): as decisões puras, sem React,
// como nota-criada.ts. O rodapé da resposta que fecha o turno mostra um cartão por ação `plano_criado` do painel
// "mesa" cuja `chamada` é a de uma ferramenta chamada nesse turno (o criar_plano), e o cartão diz em que estado está
// (criado, desfeito, recusado, não existe mais) lendo só o que a ponte "planos" já entregou.

import type { AcaoRecebida, ItemConversa } from "@estudos/ui";
import { ACAO_PLANO_CRIADO, type DadosPlanoCriado } from "../../lib/plano-tipos.ts";
import { type EstadoCartao, chamadasDoTurno, ordemDaChave } from "./nota-criada.ts";
import { mesmoTitulo } from "./notas-ponte.ts";

export { ACAO_PLANO_CRIADO };

/** A ação do painel "planos" que o Desfazer manda à extensão. */
export const ACAO_DESFAZER_PLANO = "desfazer_plano";

/** Um cartão: os dados da ação mais a chave dela (a ordem de chegada, para comparar com as listas de planos). */
export interface CartaoPlano extends DadosPlanoCriado {
	chave: string;
}

/** Lê uma ação `plano_criado`; undefined se faltar algum campo (a ação vem de fora da tela). */
export function lerPlanoCriado(recebida: AcaoRecebida): CartaoPlano | undefined {
	if (recebida.acao !== ACAO_PLANO_CRIADO) return undefined;
	const { materia, titulo, rota, chamada, sessao } = (recebida.dados ?? {}) as Partial<Record<keyof DadosPlanoCriado, unknown>>;
	if (typeof materia !== "string" || typeof titulo !== "string" || typeof rota !== "string" || typeof chamada !== "string") return undefined;
	return { chave: recebida.chave, materia, titulo, rota, chamada, sessao: typeof sessao === "string" ? sessao : "" };
}

/** Os cartões do rodapé da resposta `chaveResposta`: um por chamada de ferramenta do turno, só planos desta matéria. */
export function cartoesDePlanoDoTurno(conversa: readonly ItemConversa[], chaveResposta: string, acoesDaMesa: readonly AcaoRecebida[] | undefined, materiaId: string): CartaoPlano[] {
	if (!acoesDaMesa?.length) return [];
	const chamadas = chamadasDoTurno(conversa, chaveResposta);
	if (chamadas.size === 0) return [];
	const cartoes: CartaoPlano[] = [];
	for (const recebida of acoesDaMesa) {
		const cartao = lerPlanoCriado(recebida);
		if (!cartao || cartao.materia !== materiaId || !chamadas.has(cartao.chamada)) continue;
		if (cartoes.some((outro) => outro.chamada === cartao.chamada)) continue;
		cartoes.push(cartao);
	}
	return cartoes;
}

/** Quantos planos criados há nas ações da mesa (a lista de planos é pedida de novo quando esse número muda). */
export function contarPlanosCriados(acoesDaMesa: readonly AcaoRecebida[] | undefined, materiaId: string): number {
	return (acoesDaMesa ?? []).filter((recebida) => lerPlanoCriado(recebida)?.materia === materiaId).length;
}

/** Há uma resposta `desfeito` deste plano, depois da criação do cartão? */
export function planoFoiDesfeito(cartao: CartaoPlano, acoesDePlanos: readonly AcaoRecebida[] | undefined): boolean {
	const criadoEm = ordemDaChave(cartao.chave);
	return (acoesDePlanos ?? []).some((recebida) => {
		if (recebida.acao !== "desfeito" || ordemDaChave(recebida.chave) <= criadoEm) return false;
		const dados = (recebida.dados ?? {}) as { materia?: unknown; titulo?: unknown };
		return dados.materia === cartao.materia && typeof dados.titulo === "string" && mesmoTitulo(dados.titulo, cartao.titulo);
	});
}

/**
 * O estado do cartão. Vale a ordem: desfeito, recusado (a extensão recusou o Desfazer, inclusive com "o plano não
 * existe mais"), criado. A lista de planos não decide "não existe mais": o Breno pode ter renomeado o plano, e o
 * Desfazer segue a troca de nome (lib/planos.ts, desfazerPlano); quem diz se o plano sumiu é a resposta ao Desfazer.
 */
export function estadoDoCartaoDePlano(cartao: CartaoPlano, acoesDePlanos: readonly AcaoRecebida[] | undefined, recusa?: string, desfeitoLocal = false): EstadoCartao {
	if (desfeitoLocal || planoFoiDesfeito(cartao, acoesDePlanos)) return { tipo: "desfeita" };
	if (recusa) return { tipo: "recusada", mensagem: recusa };
	return { tipo: "criada" };
}

/** O texto de cada estado (o cartão tem o mesmo tamanho em todos). */
export function textoDoCartaoDePlano(cartao: CartaoPlano, estado: EstadoCartao): string {
	switch (estado.tipo) {
		case "criada":
			return `Plano criado: ${cartao.titulo}`;
		case "desfeita":
			return "Plano desfeito";
		case "inexistente":
			return "O plano não existe mais";
		case "recusada":
			return estado.mensagem;
	}
}

export const TEXTO_CONFIRMAR_DESFAZER_PLANO = "Apagar o plano? Não dá para voltar atrás.";

/** O que a extensão respondeu ao Desfazer: o plano apagado, ou por que não. */
export type DesfechoDoDesfazerPlano = { ok: true; materia: string; titulo: string } | { ok: false; mensagem: string };

/** Procura, entre as ações que não existiam antes do pedido, a resposta dele (`desfeito` ou `erro` com o mesmo `pedido`). */
export function respostaDoDesfazerPlano(recebidas: readonly AcaoRecebida[], vistas: ReadonlySet<string>, pedido: string): DesfechoDoDesfazerPlano | undefined {
	for (const recebida of recebidas) {
		if (vistas.has(recebida.chave)) continue;
		const dados = (recebida.dados ?? {}) as { pedido?: unknown; materia?: unknown; titulo?: unknown; mensagem?: unknown };
		if (dados.pedido !== pedido) continue;
		if (recebida.acao === "desfeito" && typeof dados.materia === "string" && typeof dados.titulo === "string") return { ok: true, materia: dados.materia, titulo: dados.titulo };
		if (recebida.acao === "erro") return { ok: false, mensagem: typeof dados.mensagem === "string" && dados.mensagem ? dados.mensagem : "Não consegui desfazer o plano." };
	}
	return undefined;
}
