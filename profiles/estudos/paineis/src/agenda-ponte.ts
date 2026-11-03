// O painel "agenda" da ponte (docs/agenda.md, "Ponte"), que a extensão da
// agenda (extensions/agenda.ts) atende, e a leitura do que ela mandou. O
// calendário compacto do caderno (CalendarioCompacto.tsx) e a tela da agenda
// (TelaAgenda.tsx) usam o hook useAgenda.
//
// Toda ação leva um pedido e devolve uma promessa, resolvida quando chega a
// mensagem "agenda" com aquele pedido (a agenda inteira lida de novo do disco,
// com as provas e as matérias) e rejeitada com um ErroDaPonte quando chega um
// "erro" com ele; a espera é a EsperaDePedidos de escrita-ponte.ts.
//
// Mover uma tarefa e reordenar as colunas são otimistas, como o mapa de
// conteúdo (mapa-ponte.ts): a tela mostra a agenda do servidor com as
// mudanças ainda sem resposta aplicadas por cima, com as mesmas funções puras
// que a extensão usa (agenda-tipos.ts). Quando chega a resposta daquele pedido,
// a mudança já está no estado do servidor; quando chega um erro, ela some sozinha
// e o erro aparece em `erro`, porque quem arrasta não tem onde mostrá-lo. As
// outras ações esperam a resposta (criar, editar e apagar mostram o erro no
// próprio modal, por isso a promessa rejeita para quem chamou).

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type AcoesAgenda,
	type Agenda,
	type EntradaTarefa,
	hojeLocal,
	type MateriaDaAgenda,
	type MensagemAgenda,
	type MensagemErroAgenda,
	moverTarefa,
	type MudancasTarefa,
	PAINEL_AGENDA,
	type ProvaDaAgenda,
	reordenarColunas,
	VERSAO_AGENDA,
} from "../../lib/agenda-tipos.ts";
import { ErroDaPonte } from "./cursos-ponte.ts";
import { EsperaDePedidos, type RespostaDoPedido } from "./escrita-ponte.ts";

export { PAINEL_AGENDA };

// --- Ler o que a extensão mandou ------------------------------------------------

/** Um erro da extensão (ou de mandar a ação) para mostrar; a chave serve para fechar. */
export interface ErroVistoAgenda {
	chave: string;
	mensagem: string;
	/** A ação que falhou. */
	ao?: string;
}

/** A mensagem "agenda" tem o que a tela precisa (os campos vêm do JSON da extensão). */
const ehMensagemAgenda = (dados: unknown): dados is MensagemAgenda => {
	const mensagem = dados as Partial<MensagemAgenda> | undefined;
	return typeof mensagem === "object" && mensagem !== null && Array.isArray(mensagem.colunas) && Array.isArray(mensagem.tarefas);
};

/** A agenda de uma mensagem. */
export const agendaDaMensagem = (mensagem: MensagemAgenda): Agenda => ({ versao: VERSAO_AGENDA, colunas: mensagem.colunas, tarefas: mensagem.tarefas });

/** O que a extensão mandou: a última agenda, os pedidos já respondidos e o erro sem pedido que veio depois dela. */
export interface LidoAgenda {
	/** A última mensagem "agenda" (de qualquer ação, com ou sem pedido: ela é sempre a agenda inteira). */
	mensagem?: MensagemAgenda;
	/** Os pedidos que já têm resposta (uma "agenda" ou um "erro" com eles). */
	respondidos: Set<string>;
	/** Um erro sem pedido (o do abrir) que veio depois da última agenda. Os com pedido são de quem pediu. */
	erro?: ErroVistoAgenda;
}

/** Lê, em ordem, as ações que chegaram ao painel "agenda". */
export function lerAgenda(recebidas: readonly AcaoRecebida[]): LidoAgenda {
	let mensagem: MensagemAgenda | undefined;
	let erro: ErroVistoAgenda | undefined;
	const respondidos = new Set<string>();
	for (const recebida of recebidas) {
		if (recebida.acao === "agenda") {
			if (!ehMensagemAgenda(recebida.dados)) continue;
			mensagem = recebida.dados;
			erro = undefined;
			if (typeof mensagem.pedido === "string") respondidos.add(mensagem.pedido);
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroAgenda | undefined;
			if (!dados || typeof dados !== "object") continue;
			if (dados.pedido) respondidos.add(dados.pedido);
			else erro = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido.", ...(dados.ao ? { ao: dados.ao } : {}) };
		}
	}
	return { ...(mensagem ? { mensagem } : {}), respondidos, ...(erro ? { erro } : {}) };
}

/** A resposta a um pedido: a "agenda" com ele resolve; o "erro" com ele rejeita; undefined se ainda não chegou. */
export function respostaAgenda(recebidas: readonly AcaoRecebida[], pedido: string): RespostaDoPedido<MensagemAgenda> | undefined {
	for (const recebida of recebidas) {
		const dados = recebida.dados as { pedido?: unknown } | undefined;
		if (!dados || typeof dados !== "object" || dados.pedido !== pedido) continue;
		if (recebida.acao === "agenda" && ehMensagemAgenda(recebida.dados)) return { tipo: "ok", dados: recebida.dados };
		if (recebida.acao === "erro") return { tipo: "erro", mensagem: (recebida.dados as MensagemErroAgenda).mensagem || "Erro desconhecido." };
	}
	return undefined;
}

// --- A mudança otimista ------------------------------------------------------

/** Uma mudança do Breno mandada à extensão e ainda sem resposta. */
export type LoteAgenda =
	| { tipo: "mover"; pedido: string; id: string; coluna: string; posicao?: number }
	| { tipo: "reordenar_colunas"; pedido: string; ids: string[] };

/**
 * A agenda como a tela mostra: a do servidor com os lotes sem resposta
 * aplicados em ordem. Um lote que não vale (a tarefa sumiu, a lista de colunas
 * não bate) é pulado: a extensão vai responder com o erro.
 */
export function mostrarAgenda(agenda: Agenda, lotes: readonly LoteAgenda[]): Agenda {
	let atual = agenda;
	for (const lote of lotes) {
		try {
			atual = lote.tipo === "mover" ? moverTarefa(atual, lote.id, lote.coluna, lote.posicao).agenda : reordenarColunas(atual, lote.ids).agenda;
		} catch {
			// A extensão responde com o erro e o lote sai.
		}
	}
	return atual;
}

/** Os lotes que ainda esperam resposta. */
export const semResposta = (lotes: readonly LoteAgenda[], respondidos: ReadonlySet<string>): LoteAgenda[] => lotes.filter((lote) => !respondidos.has(lote.pedido));

// --- O hook ------------------------------------------------------------------

/** As ações da agenda. Cada uma resolve com a mensagem "agenda" da resposta e rejeita com um ErroDaPonte. */
export interface AcoesDaAgenda {
	/** Cria a tarefa; `criada` da resposta é o id dela. */
	criarTarefa(entrada: EntradaTarefa): Promise<MensagemAgenda>;
	/** Muda só os campos enviados; null limpa nota, data, hora e matéria. */
	editarTarefa(id: string, mudancas: MudancasTarefa): Promise<MensagemAgenda>;
	/** Otimista. Põe a tarefa na coluna, na posição (0 = primeira; sem posição, no fim). */
	moverTarefa(id: string, coluna: string, posicao?: number): Promise<MensagemAgenda>;
	apagarTarefa(id: string): Promise<MensagemAgenda>;
	/** Cria a coluna; `criada` da resposta é o id dela. */
	criarColuna(nome: string, posicao?: number): Promise<MensagemAgenda>;
	renomearColuna(id: string, nome: string): Promise<MensagemAgenda>;
	/** Otimista. Todos os ids das colunas, na nova ordem. */
	reordenarColunas(ids: string[]): Promise<MensagemAgenda>;
	/** Marca a coluna como a de feito (a marca da outra sai). */
	marcarFeito(coluna: string): Promise<MensagemAgenda>;
	/** Com tarefas na coluna, `destino` é obrigatório. */
	apagarColuna(id: string, destino?: string): Promise<MensagemAgenda>;
}

export interface AgendaAberta extends AcoesDaAgenda {
	/** A agenda como a tela mostra (com as mudanças otimistas); undefined até a primeira resposta chegar. */
	agenda?: Agenda;
	/** As provas de todas as matérias, lidas na hora pela extensão (vazio até a agenda chegar). */
	provas: ProvaDaAgenda[];
	/** Todas as matérias (vazio até a agenda chegar). */
	materias: MateriaDaAgenda[];
	/**
	 * O erro a mostrar: o do abrir (a agenda não abre) ou o de uma mudança
	 * otimista que a extensão recusou. Os erros das outras ações vão para quem as chamou.
	 */
	erro?: ErroVistoAgenda;
	fecharErro(chave: string): void;
	/** Pede a agenda de novo (as provas e as matérias podem ter mudado: a extensão não avisa). */
	recarregar(): void;
}

/**
 * A agenda: pede "abrir" ao montar, quando a sessão muda e quando `vez` muda
 * (o caderno passa a tela aberta e se o modal da matéria está aberto: depois de
 * editar as provas, a agenda vem de novo). Trocar de sessão zera as ações da
 * ponte; até a nova agenda chegar, vale a última.
 */
export function useAgenda(janela: JanelaPerfilHook, vez = ""): AgendaAberta {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	const recarregar = useCallback(() => {
		semEsperar(acoes.acaoDaInterface(PAINEL_AGENDA, "abrir", {} satisfies AcoesAgenda["abrir"]));
	}, [acoes]);
	useEffect(() => {
		if (sessaoId) recarregar();
	}, [sessaoId, vez, recarregar]);

	const recebidas = estado.acoesPorPainel[PAINEL_AGENDA];
	const lido = useMemo(() => lerAgenda(recebidas ?? []), [recebidas]);
	const ultima = useRef<MensagemAgenda | undefined>(undefined);
	if (lido.mensagem) ultima.current = lido.mensagem;
	const servidor = lido.mensagem ?? ultima.current;

	// As respostas chegam às promessas.
	const espera = useRef<EsperaDePedidos<MensagemAgenda> | undefined>(undefined);
	espera.current ??= new EsperaDePedidos(respostaAgenda, (mensagem) => new ErroDaPonte(mensagem));
	useEffect(() => {
		espera.current!.receber(recebidas ?? []);
	}, [recebidas]);
	// Outra sessão: o que foi para a extensão antiga não vai ter resposta.
	useEffect(() => () => espera.current!.cancelar("A conversa mudou antes da resposta. Tente de novo."), [sessaoId]);

	// As mudanças otimistas ainda sem resposta.
	const [lotes, setLotes] = useState<LoteAgenda[]>([]);
	useEffect(() => setLotes([]), [sessaoId]);
	const pendentes = useMemo(() => semResposta(lotes, lido.respondidos), [lotes, lido.respondidos]);
	useEffect(() => {
		if (pendentes.length !== lotes.length) setLotes((atuais) => semResposta(atuais, lido.respondidos));
	}, [pendentes, lotes, lido.respondidos]);

	// Os erros que já estavam lá ao abrir são de antes: começam fechados.
	const [fechados, setFechados] = useState<ReadonlySet<string>>(() => new Set(lido.erro ? [lido.erro.chave] : []));
	const [locais, setLocais] = useState<ErroVistoAgenda[]>([]);
	const erro = useMemo(() => [...(lido.erro ? [lido.erro] : []), ...locais].filter((item) => !fechados.has(item.chave)).at(-1), [lido.erro, locais, fechados]);

	const agenda = useMemo(() => (servidor ? mostrarAgenda(agendaDaMensagem(servidor), pendentes) : undefined), [servidor, pendentes]);

	const mandar = useCallback(
		<Acao extends keyof AcoesAgenda>(acao: Acao, dados: Omit<AcoesAgenda[Acao], "pedido"> & { pedido: string }): Promise<MensagemAgenda> => {
			const promessa = espera.current!.esperar(dados.pedido);
			acoes.acaoDaInterface(PAINEL_AGENDA, acao, dados).catch((falha: unknown) => {
				espera.current!.falhar(dados.pedido, `Não consegui falar com a sessão: ${(falha as Error).message}`);
			});
			return promessa;
		},
		[acoes],
	);

	const contador = useRef(0);
	/** Mostra o lote já e manda a ação; se falhar, o lote sai e o erro aparece. */
	const otimista = useCallback(
		(lote: LoteAgenda, enviar: () => Promise<MensagemAgenda>): Promise<MensagemAgenda> => {
			setLotes((atuais) => [...atuais, lote]);
			const promessa = enviar();
			promessa.catch((falha: unknown) => {
				setLotes((atuais) => atuais.filter((atual) => atual.pedido !== lote.pedido));
				setLocais((atuais) => [...atuais, { chave: `local-${++contador.current}`, ao: lote.tipo, mensagem: (falha as Error).message }]);
			});
			return promessa;
		},
		[],
	);

	return {
		...(agenda ? { agenda } : {}),
		provas: servidor?.provas ?? [],
		materias: servidor?.materias ?? [],
		...(erro ? { erro } : {}),
		fecharErro: (chave) => setFechados((atuais) => new Set([...atuais, chave])),
		recarregar,
		criarTarefa: (entrada) => mandar("criar_tarefa", { ...entrada, pedido: crypto.randomUUID() }),
		editarTarefa: (id, mudancas) => mandar("editar_tarefa", { id, mudancas, pedido: crypto.randomUUID() }),
		moverTarefa: (id, coluna, posicao) => {
			const pedido = crypto.randomUUID();
			return otimista({ tipo: "mover", pedido, id, coluna, ...(posicao !== undefined ? { posicao } : {}) }, () =>
				mandar("mover_tarefa", { id, coluna, ...(posicao !== undefined ? { posicao } : {}), pedido }),
			);
		},
		apagarTarefa: (id) => mandar("apagar_tarefa", { id, pedido: crypto.randomUUID() }),
		criarColuna: (nome, posicao) => mandar("criar_coluna", { nome, ...(posicao !== undefined ? { posicao } : {}), pedido: crypto.randomUUID() }),
		renomearColuna: (id, nome) => mandar("renomear_coluna", { id, nome, pedido: crypto.randomUUID() }),
		reordenarColunas: (ids) => {
			const pedido = crypto.randomUUID();
			return otimista({ tipo: "reordenar_colunas", pedido, ids }, () => mandar("reordenar_colunas", { ids, pedido }));
		},
		marcarFeito: (coluna) => mandar("marcar_feito", { id: coluna, pedido: crypto.randomUUID() }),
		apagarColuna: (id, destino) => mandar("apagar_coluna", { id, ...(destino !== undefined ? { destino } : {}), pedido: crypto.randomUUID() }),
	};
}

/** A data de hoje (AAAA-MM-DD) que se atualiza sozinha na virada do dia. */
export function useHoje(): string {
	const [hoje, setHoje] = useState(() => hojeLocal());
	useEffect(() => {
		const intervalo = window.setInterval(() => setHoje((atual) => (atual === hojeLocal() ? atual : hojeLocal())), 60_000);
		return () => window.clearInterval(intervalo);
	}, []);
	return hoje;
}
