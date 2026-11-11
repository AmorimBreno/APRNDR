// O cartão "Nota criada" na conversa do professor (parte D, WP2; docs/mesa-parte-d.md, seção 2):
// as decisões puras, sem React, para testar sem a tela.
// - qual cartão vai em qual resposta: o rodapé da resposta que fecha o turno mostra um cartão por
//   ação `nota_criada` do painel "mesa" cuja `chamada` é a de uma ferramenta chamada nesse turno;
// - em que estado o cartão está (criada, desfeita, recusada, não existe mais);
// - esperar a resposta da extensão ao Desfazer (`desfeita` ou `erro` com o mesmo `pedido`).
// Só lê o que a ponte já entregou. Nada aqui manda nada nem toca disco.

import type { AcaoRecebida, ItemConversa } from "@estudos/ui";
import type { ListaNotas } from "../../lib/nota-tipos.ts";
import { mesmoTitulo } from "./notas-ponte.ts";

/** A ação do painel "mesa" que a extensão emite quando o professor cria uma nota (gravada). */
export const ACAO_NOTA_CRIADA = "nota_criada";
/** A ação do painel "notas" que o Desfazer manda à extensão. */
export const ACAO_DESFAZER_NOTA = "desfazer_nota";

/** O que a extensão grava em `nota_criada`. */
export interface DadosNotaCriada {
	materia: string;
	titulo: string;
	/** A rota da nota (caderno/<matéria>/notas/<título>). */
	rota: string;
	/** O id da chamada da ferramenta criar_nota. */
	chamada: string;
	/** O id da sessão em que a nota foi criada. */
	sessao: string;
}

/** Um cartão: os dados da ação mais a chave dela (a ordem de chegada, para comparar com as listas de notas). */
export interface CartaoNota extends DadosNotaCriada {
	chave: string;
}

/** Lê uma ação `nota_criada`; undefined se faltar algum campo (a ação vem de fora da tela). */
export function lerNotaCriada(recebida: AcaoRecebida): CartaoNota | undefined {
	if (recebida.acao !== ACAO_NOTA_CRIADA) return undefined;
	const { materia, titulo, rota, chamada, sessao } = (recebida.dados ?? {}) as Partial<Record<keyof DadosNotaCriada, unknown>>;
	if (typeof materia !== "string" || typeof titulo !== "string" || typeof rota !== "string" || typeof chamada !== "string") return undefined;
	return { chave: recebida.chave, materia, titulo, rota, chamada, sessao: typeof sessao === "string" ? sessao : "" };
}

/**
 * O número de ordem de uma chave de ação ("i42" ao vivo, "hm42" do histórico): o reducer da janela usa um contador
 * só, então comparar os números diz qual ação veio depois, mesmo entre painéis.
 */
export function ordemDaChave(chave: string): number {
	const digitos = chave.replace(/\D/g, "");
	return digitos === "" ? Number.NEGATIVE_INFINITY : Number(digitos);
}

/** Os ids das chamadas de ferramenta do turno da resposta `chaveResposta` (da mensagem do usuário à próxima). */
export function chamadasDoTurno(conversa: readonly ItemConversa[], chaveResposta: string): Set<string> {
	const ids = new Set<string>();
	const indice = conversa.findIndex((item) => item.chave === chaveResposta);
	if (indice < 0) return ids;
	let inicio = indice;
	while (inicio > 0 && conversa[inicio - 1]!.tipo !== "usuario") inicio -= 1;
	let fim = indice + 1;
	while (fim < conversa.length && conversa[fim]!.tipo !== "usuario") fim += 1;
	for (const item of conversa.slice(inicio, fim)) if (item.tipo === "ferramenta") ids.add(item.chamada.id);
	return ids;
}

/**
 * Os cartões do rodapé da resposta `chaveResposta`: uma ação `nota_criada` do painel da mesa por chamada de
 * ferramenta do turno (a ligação é o `chamada`). Só notas desta matéria; uma chamada gera no máximo um cartão.
 */
export function cartoesDoTurno(conversa: readonly ItemConversa[], chaveResposta: string, acoesDaMesa: readonly AcaoRecebida[] | undefined, materiaId: string): CartaoNota[] {
	if (!acoesDaMesa?.length) return [];
	const chamadas = chamadasDoTurno(conversa, chaveResposta);
	if (chamadas.size === 0) return [];
	const cartoes: CartaoNota[] = [];
	for (const recebida of acoesDaMesa) {
		const cartao = lerNotaCriada(recebida);
		if (!cartao || cartao.materia !== materiaId || !chamadas.has(cartao.chamada)) continue;
		if (cartoes.some((outro) => outro.chamada === cartao.chamada)) continue;
		cartoes.push(cartao);
	}
	return cartoes;
}

/** Há alguma nota criada nas ações da mesa? (Decide se vale pedir a lista de notas ao abrir a conversa.) */
export function haNotaCriada(acoesDaMesa: readonly AcaoRecebida[] | undefined, materiaId: string): boolean {
	return (acoesDaMesa ?? []).some((recebida) => lerNotaCriada(recebida)?.materia === materiaId);
}

/** Quantas notas criadas há nas ações da mesa (a lista de notas é pedida de novo quando esse número muda). */
export function contarNotasCriadas(acoesDaMesa: readonly AcaoRecebida[] | undefined, materiaId: string): number {
	return (acoesDaMesa ?? []).filter((recebida) => lerNotaCriada(recebida)?.materia === materiaId).length;
}

/** Quantas respostas `desfeita` desta matéria há nas ações do painel de notas. */
export function contarDesfeitas(acoesDeNotas: readonly AcaoRecebida[] | undefined, materiaId: string): number {
	return (acoesDeNotas ?? []).filter((recebida) => recebida.acao === "desfeita" && (recebida.dados as { materia?: unknown } | undefined)?.materia === materiaId).length;
}

/** O estado de um cartão. `recusada` leva a mensagem da recusa. */
export type EstadoCartao = { tipo: "criada" } | { tipo: "desfeita" } | { tipo: "recusada"; mensagem: string } | { tipo: "inexistente" };

/** Há uma resposta `desfeita` desta nota, depois da criação do cartão? */
export function foiDesfeita(cartao: CartaoNota, acoesDeNotas: readonly AcaoRecebida[] | undefined): boolean {
	const criadaEm = ordemDaChave(cartao.chave);
	return (acoesDeNotas ?? []).some((recebida) => {
		if (recebida.acao !== "desfeita" || ordemDaChave(recebida.chave) <= criadaEm) return false;
		const dados = (recebida.dados ?? {}) as { materia?: unknown; titulo?: unknown };
		return dados.materia === cartao.materia && typeof dados.titulo === "string" && mesmoTitulo(dados.titulo, cartao.titulo);
	});
}

/**
 * A nota sumiu? Só uma lista que chegou DEPOIS da criação do cartão vale (uma lista mais velha não tinha como
 * conhecer a nota). Sem lista nova, a nota é dada como existente.
 */
export function sumiuDaLista(cartao: CartaoNota, acoesDeNotas: readonly AcaoRecebida[] | undefined): boolean {
	const criadaEm = ordemDaChave(cartao.chave);
	let ultima: { ordem: number; lista: ListaNotas } | undefined;
	for (const recebida of acoesDeNotas ?? []) {
		if (recebida.acao !== "lista") continue;
		const lista = recebida.dados as ListaNotas | undefined;
		const ordem = ordemDaChave(recebida.chave);
		if (!lista || lista.materia !== cartao.materia || !Array.isArray(lista.notas) || ordem <= criadaEm) continue;
		if (!ultima || ordem > ultima.ordem) ultima = { ordem, lista };
	}
	return ultima !== undefined && !ultima.lista.notas.some((nota) => mesmoTitulo(nota.titulo, cartao.titulo));
}

/**
 * O estado do cartão. Vale a ordem: desfeita (a extensão confirmou), não existe mais (a lista nova não tem a
 * nota), recusada (a extensão recusou o Desfazer) e, por fim, criada.
 */
export function estadoDoCartao(cartao: CartaoNota, acoesDeNotas: readonly AcaoRecebida[] | undefined, recusa?: string, desfeitaLocal = false): EstadoCartao {
	if (desfeitaLocal || foiDesfeita(cartao, acoesDeNotas)) return { tipo: "desfeita" };
	if (sumiuDaLista(cartao, acoesDeNotas)) return { tipo: "inexistente" };
	if (recusa) return { tipo: "recusada", mensagem: recusa };
	return { tipo: "criada" };
}

/** O texto de cada estado (o cartão tem o mesmo tamanho em todos). */
export function textoDoCartao(cartao: CartaoNota, estado: EstadoCartao): string {
	switch (estado.tipo) {
		case "criada":
			return `Nota criada: ${cartao.titulo}`;
		case "desfeita":
			return "Nota desfeita";
		case "inexistente":
			return "A nota não existe mais";
		case "recusada":
			return estado.mensagem;
	}
}

export const TEXTO_CONFIRMAR_DESFAZER = "Apagar a nota? Não dá para voltar atrás.";
export const TEXTO_DESFAZENDO = "Desfazendo…";

/** O que a extensão respondeu ao Desfazer: a nota apagada, ou por que não. */
export type DesfechoDoDesfazer = { ok: true; materia: string; titulo: string } | { ok: false; mensagem: string };

/** Procura, entre as ações que não existiam antes do pedido, a resposta dele (`desfeita` ou `erro` do desfazer_nota, com o mesmo `pedido`). */
export function respostaDoDesfazer(recebidas: readonly AcaoRecebida[], vistas: ReadonlySet<string>, pedido: string): DesfechoDoDesfazer | undefined {
	for (const recebida of recebidas) {
		if (vistas.has(recebida.chave)) continue;
		const dados = (recebida.dados ?? {}) as { pedido?: unknown; materia?: unknown; titulo?: unknown; mensagem?: unknown; ao?: unknown };
		if (dados.pedido !== pedido) continue;
		if (recebida.acao === "desfeita" && typeof dados.materia === "string" && typeof dados.titulo === "string") return { ok: true, materia: dados.materia, titulo: dados.titulo };
		if (recebida.acao === "erro" && dados.ao === ACAO_DESFAZER_NOTA) return { ok: false, mensagem: typeof dados.mensagem === "string" && dados.mensagem ? dados.mensagem : "Não consegui desfazer a nota." };
	}
	return undefined;
}
