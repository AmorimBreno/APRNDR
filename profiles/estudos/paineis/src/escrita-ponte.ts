// O painel "escrita" da ponte (docs/escrita.md, "Ponte"), que a extensão dos
// módulos (extensions/modulos.ts) atende, e a leitura do que ela mandou.
// "Como o professor escreve" (ModalEscrita.tsx) usa o hook, na tela de
// cadernos e na visão do módulo.
//
// Sem mudança otimista, como cursos-ponte e modulos-ponte: salvar e apagar
// levam um pedido e devolvem uma promessa, resolvida quando chegam as
// "regras" com aquele pedido e rejeitada quando chega um "erro" com ele.
//
// A espera por pedido (EsperaDePedidos) também serve às ações retorno e
// reescrever_bloco do painel "modulos" (modulos-ponte.ts).

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { type AcoesEscrita, type EntradaRegra, type MensagensEscrita, PAINEL_ESCRITA, type RegraEscrita } from "../../lib/escrita-tipos.ts";

export { PAINEL_ESCRITA };

// --- A espera pelo pedido ----------------------------------------------------

/** A resposta a um pedido: o que resolve a promessa, ou a frase do erro. */
export type RespostaDoPedido<T> = { tipo: "ok"; dados: T } | { tipo: "erro"; mensagem: string };

/**
 * Os pedidos esperando resposta, para qualquer painel: `ler` acha, nas ações
 * recebidas, a resposta a um pedido (ou undefined, se ainda não chegou);
 * `esperar` devolve a promessa; `receber` confere as ações que chegaram;
 * `cancelar` rejeita todas (a sessão mudou: a extensão antiga não vai
 * responder).
 */
export class EsperaDePedidos<T> {
	private esperando = new Map<string, { resolver(dados: T): void; rejeitar(erro: Error): void }>();
	private ultimas: readonly AcaoRecebida[] = [];

	constructor(
		private readonly ler: (recebidas: readonly AcaoRecebida[], pedido: string) => RespostaDoPedido<T> | undefined,
		private readonly criarErro: (mensagem: string) => Error = (mensagem) => new Error(mensagem),
	) {}

	esperar(pedido: string): Promise<T> {
		return new Promise((resolver, rejeitar) => {
			this.esperando.set(pedido, { resolver, rejeitar });
			this.receber(this.ultimas);
		});
	}

	receber(recebidas: readonly AcaoRecebida[]): void {
		this.ultimas = recebidas;
		for (const [pedido, promessa] of [...this.esperando]) {
			const resposta = this.ler(recebidas, pedido);
			if (!resposta) continue;
			this.esperando.delete(pedido);
			if (resposta.tipo === "erro") promessa.rejeitar(this.criarErro(resposta.mensagem));
			else promessa.resolver(resposta.dados);
		}
	}

	falhar(pedido: string, mensagem: string): void {
		const promessa = this.esperando.get(pedido);
		if (!promessa) return;
		this.esperando.delete(pedido);
		promessa.rejeitar(this.criarErro(mensagem));
	}

	cancelar(motivo: string): void {
		for (const [pedido] of [...this.esperando]) this.falhar(pedido, motivo);
	}

	get quantos(): number {
		return this.esperando.size;
	}
}

/**
 * A primeira ação recebida com o pedido: um "erro" rejeita com a mensagem;
 * qualquer outra resolve com os dados dela. Serve às ações cuja resposta a
 * ponte não fixa no nome (retorno, reescrever_bloco).
 */
export function respostaQualquer(recebidas: readonly AcaoRecebida[], pedido: string): RespostaDoPedido<{ acao: string; dados: Record<string, unknown> }> | undefined {
	for (const recebida of recebidas) {
		const dados = recebida.dados as { pedido?: unknown; mensagem?: unknown } | undefined;
		if (!dados || typeof dados !== "object" || dados.pedido !== pedido) continue;
		if (recebida.acao === "erro") return { tipo: "erro", mensagem: typeof dados.mensagem === "string" && dados.mensagem ? dados.mensagem : "Erro desconhecido." };
		return { tipo: "ok", dados: { acao: recebida.acao, dados: dados as Record<string, unknown> } };
	}
	return undefined;
}

// --- As regras -------------------------------------------------------------------

/** Um erro sem pedido que a extensão mandou (o do listar): a chave da ação recebida identifica este erro. */
export interface ErroVistoEscrita {
	chave: string;
	mensagem: string;
	ao?: string;
}

/** O que a extensão mandou sobre as regras. */
export interface LidoEscrita {
	/** As últimas regras que chegaram (de listar, salvar ou apagar). */
	regras?: RegraEscrita[];
	/** Um erro sem pedido que veio depois delas. */
	erro?: ErroVistoEscrita;
}

const ehRegra = (valor: unknown): valor is RegraEscrita =>
	typeof valor === "object" && valor !== null && typeof (valor as RegraEscrita).id === "string" && typeof (valor as RegraEscrita).texto === "string";

/**
 * Lê, em ordem, o que chegou ao painel "escrita": as últimas "regras" (com ou
 * sem pedido: a lista é sempre a do arquivo inteiro) e um "erro" sem pedido
 * que veio depois delas. Os erros com pedido são de quem pediu (a promessa).
 */
export function lerEscrita(recebidas: readonly AcaoRecebida[]): LidoEscrita {
	let regras: RegraEscrita[] | undefined;
	let erro: ErroVistoEscrita | undefined;
	for (const recebida of recebidas) {
		if (recebida.acao === "regras") {
			const dados = recebida.dados as MensagensEscrita["regras"] | undefined;
			if (!dados || !Array.isArray(dados.regras)) continue;
			regras = dados.regras.filter(ehRegra);
			erro = undefined;
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagensEscrita["erro"] | undefined;
			if (!dados || dados.pedido) continue;
			erro = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido.", ...(dados.ao ? { ao: dados.ao } : {}) };
		}
	}
	return { ...(regras ? { regras } : {}), ...(erro ? { erro } : {}) };
}

/** A resposta a salvar ou apagar: as "regras" com o pedido, ou o "erro" com ele. */
export function respostaEscrita(recebidas: readonly AcaoRecebida[], pedido: string): RespostaDoPedido<RegraEscrita[]> | undefined {
	for (const recebida of recebidas) {
		const dados = recebida.dados as { pedido?: unknown } | undefined;
		if (!dados || dados.pedido !== pedido) continue;
		if (recebida.acao === "regras") {
			const lista = (recebida.dados as MensagensEscrita["regras"]).regras;
			return { tipo: "ok", dados: Array.isArray(lista) ? lista.filter(ehRegra) : [] };
		}
		if (recebida.acao === "erro") return { tipo: "erro", mensagem: (recebida.dados as MensagensEscrita["erro"]).mensagem || "Erro desconhecido." };
	}
	return undefined;
}

/** Um erro que a extensão das regras mandou (ou de mandar a ação): a mensagem é a frase para a tela. */
export class ErroDaEscrita extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroDaEscrita";
	}
}

export interface EscritaDoProfessor extends LidoEscrita {
	listar(): void;
	/** Cria (sem id) ou altera (com id) uma regra; resolve com a lista nova. */
	salvar(regra: EntradaRegra): Promise<RegraEscrita[]>;
	/** Apaga a regra; resolve com a lista nova. */
	apagar(id: string): Promise<RegraEscrita[]>;
}

/**
 * As regras de escrita: pede "listar" quando `ativo` (o modal abriu), ao
 * montar e quando a sessão muda. Trocar de sessão zera as ações da ponte; até
 * a nova lista chegar, vale a última.
 */
export function useEscrita(janela: JanelaPerfilHook, ativo = true): EscritaDoProfessor {
	const { estado: estadoJanela, acoes } = janela;
	const sessaoId = estadoJanela.sessao?.sessaoId;
	const listar = useCallback(() => {
		semEsperar(acoes.acaoDaInterface(PAINEL_ESCRITA, "listar", {} satisfies AcoesEscrita["listar"]));
	}, [acoes]);
	useEffect(() => {
		if (sessaoId && ativo) listar();
	}, [sessaoId, ativo, listar]);

	const recebidas = estadoJanela.acoesPorPainel[PAINEL_ESCRITA];
	const lido = useMemo(() => lerEscrita(recebidas ?? []), [recebidas]);
	const ultimas = useRef<RegraEscrita[] | undefined>(undefined);
	if (lido.regras) ultimas.current = lido.regras;
	const regras = lido.regras ?? ultimas.current;

	const espera = useRef<EsperaDePedidos<RegraEscrita[]> | undefined>(undefined);
	espera.current ??= new EsperaDePedidos(respostaEscrita, (mensagem) => new ErroDaEscrita(mensagem));
	useEffect(() => {
		espera.current!.receber(recebidas ?? []);
	}, [recebidas]);
	// Outra sessão: o que foi para a extensão antiga não vai ter resposta.
	useEffect(() => () => espera.current!.cancelar("A conversa mudou antes da resposta. Tente de novo."), [sessaoId]);

	const mandar = useCallback(
		<Acao extends "salvar" | "apagar">(acao: Acao, dados: AcoesEscrita[Acao]): Promise<RegraEscrita[]> => {
			const promessa = espera.current!.esperar(dados.pedido);
			acoes.acaoDaInterface(PAINEL_ESCRITA, acao, dados).catch((falha: unknown) => {
				espera.current!.falhar(dados.pedido, `Não consegui falar com a sessão: ${(falha as Error).message}`);
			});
			return promessa;
		},
		[acoes],
	);

	return {
		...(regras ? { regras } : {}),
		...(lido.erro ? { erro: lido.erro } : {}),
		listar,
		salvar: (regra) => mandar("salvar", { pedido: crypto.randomUUID(), regra }),
		apagar: (id) => mandar("apagar", { pedido: crypto.randomUUID(), id }),
	};
}
