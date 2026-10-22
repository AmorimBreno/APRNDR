// O painel "cursos" da ponte, que a extensão dos cursos (docs/cursos.md,
// "Ponte") atende, e a leitura do que ela mandou. A seção Cursos do caderno
// (SecaoCursos.tsx) e o guia de criação (TelaGuiaCurso.tsx) usam daqui.
//
// Sem mudança otimista: cada ação que grava (comecar, confirmar, descartar)
// leva um pedido e devolve uma promessa, resolvida quando chega o "curso" ou o
// "descartado" com aquele pedido e rejeitada quando chega um "erro" com ele.
// Enquanto isso, o botão fica ocupado.

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	type AcoesCursos,
	type Curso,
	type EntradaBasico,
	type EntradasDasEtapas,
	type Etapa,
	type MensagemCurso,
	type MensagemDescartado,
	type MensagemErroCursos,
	type MensagemListaCursos,
	PAINEL_CURSOS,
	type ResumoCurso,
	resumoDoCurso,
} from "../../lib/curso-tipos.ts";

export { PAINEL_CURSOS };

/** O que a extensão mandou sobre os cursos de uma matéria. */
export interface LidoCursos {
	/** A última lista, com os cursos que chegaram depois dela atualizados (ou acrescentados) e sem os descartados depois dela. */
	lista?: ResumoCurso[];
	/** O último curso.json de cada curso que chegou (abrir, começar ou confirmar). */
	cursos: Record<string, Curso>;
	/** O erro da última listagem, se ele veio depois da lista. */
	erroLista?: string;
	/** O erro de abrir cada curso, se ele veio depois do curso. */
	errosAbrir: Record<string, string>;
}

/** Lê, em ordem, o que chegou ao painel "cursos" para a matéria. Um erro sem matéria também conta (só estas telas ouvem o painel). */
export function lerCursos(recebidas: readonly AcaoRecebida[], materia: string): LidoCursos {
	let lista: ResumoCurso[] | undefined;
	let erroLista: string | undefined;
	const cursos: Record<string, Curso> = {};
	const errosAbrir: Record<string, string> = {};
	for (const recebida of recebidas) {
		if (recebida.acao === "lista") {
			const dados = recebida.dados as MensagemListaCursos | undefined;
			if (!dados || dados.materia !== materia || !Array.isArray(dados.cursos)) continue;
			lista = [...dados.cursos];
			erroLista = undefined;
		} else if (recebida.acao === "curso") {
			const dados = recebida.dados as MensagemCurso | undefined;
			if (!dados || dados.materia !== materia || !dados.curso) continue;
			const curso = dados.curso;
			cursos[curso.id] = curso;
			delete errosAbrir[curso.id];
			if (lista) {
				const resumo = resumoDoCurso(curso);
				const indice = lista.findIndex((item) => item.id === curso.id);
				if (indice >= 0) lista[indice] = resumo;
				else lista.push(resumo);
			}
		} else if (recebida.acao === "descartado") {
			const dados = recebida.dados as MensagemDescartado | undefined;
			if (!dados || dados.materia !== materia) continue;
			delete cursos[dados.curso];
			if (lista) lista = lista.filter((item) => item.id !== dados.curso);
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroCursos | undefined;
			if (!dados || (dados.materia !== undefined && dados.materia !== materia)) continue;
			const mensagem = dados.mensagem || "Erro desconhecido.";
			if (dados.ao === "listar") erroLista = mensagem;
			else if (dados.ao === "abrir" && dados.curso) errosAbrir[dados.curso] = mensagem;
		}
	}
	return { ...(lista ? { lista } : {}), ...(erroLista ? { erroLista } : {}), cursos, errosAbrir };
}

// --- A espera pelo pedido ----------------------------------------------------

/** A resposta da extensão a uma ação com pedido. */
export type RespostaPedido =
	| { tipo: "curso"; dados: MensagemCurso }
	| { tipo: "descartado"; dados: MensagemDescartado }
	| { tipo: "erro"; dados: MensagemErroCursos };

/** A primeira resposta (curso, descartado ou erro) com o pedido, ou undefined se ainda não chegou. */
export function respostaDoPedido(recebidas: readonly AcaoRecebida[], pedido: string): RespostaPedido | undefined {
	for (const recebida of recebidas) {
		const dados = recebida.dados as { pedido?: unknown } | undefined;
		if (!dados || dados.pedido !== pedido) continue;
		if (recebida.acao === "curso") return { tipo: "curso", dados: recebida.dados as MensagemCurso };
		if (recebida.acao === "descartado") return { tipo: "descartado", dados: recebida.dados as MensagemDescartado };
		if (recebida.acao === "erro") return { tipo: "erro", dados: recebida.dados as MensagemErroCursos };
	}
	return undefined;
}

/** Um erro que a extensão mandou (ou de mandar a ação): a mensagem é a frase para a tela. */
export class ErroDaPonte extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroDaPonte";
	}
}

/**
 * Os pedidos esperando resposta. `esperar` devolve uma promessa resolvida com
 * a resposta (curso ou descartado) e rejeitada com um ErroDaPonte se a
 * resposta é um erro; `receber` confere as ações que chegaram; `cancelar`
 * rejeita todas (a sessão mudou: a extensão antiga não vai responder).
 */
export class EsperaDePedidos {
	private esperando = new Map<string, { resolver(resposta: RespostaPedido): void; rejeitar(erro: Error): void }>();
	private ultimas: readonly AcaoRecebida[] = [];

	esperar(pedido: string): Promise<RespostaPedido> {
		return new Promise((resolver, rejeitar) => {
			this.esperando.set(pedido, { resolver, rejeitar });
			this.receber(this.ultimas);
		});
	}

	receber(recebidas: readonly AcaoRecebida[]): void {
		this.ultimas = recebidas;
		for (const [pedido, promessa] of [...this.esperando]) {
			const resposta = respostaDoPedido(recebidas, pedido);
			if (!resposta) continue;
			this.esperando.delete(pedido);
			if (resposta.tipo === "erro") promessa.rejeitar(new ErroDaPonte(resposta.dados.mensagem || "Erro desconhecido."));
			else promessa.resolver(resposta);
		}
	}

	/** Rejeita um pedido (a ação nem chegou a sair). */
	falhar(pedido: string, erro: Error): void {
		const promessa = this.esperando.get(pedido);
		if (!promessa) return;
		this.esperando.delete(pedido);
		promessa.rejeitar(erro);
	}

	cancelar(motivo: string): void {
		for (const [pedido] of [...this.esperando]) this.falhar(pedido, new ErroDaPonte(motivo));
	}

	get quantos(): number {
		return this.esperando.size;
	}
}

/** Manda a ação com pedido e espera a resposta: a espera começa antes de mandar, para nada se perder. */
function useMandarComPedido(janela: JanelaPerfilHook) {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	const recebidas = estado.acoesPorPainel[PAINEL_CURSOS];
	const espera = useRef<EsperaDePedidos | undefined>(undefined);
	espera.current ??= new EsperaDePedidos();
	useEffect(() => {
		espera.current!.receber(recebidas ?? []);
	}, [recebidas]);
	// Outra sessão: o que foi para a extensão antiga não vai ter resposta.
	useEffect(() => () => espera.current!.cancelar("A conversa mudou antes da resposta. Tente de novo."), [sessaoId]);
	return useCallback(
		<Acao extends keyof AcoesCursos>(acao: Acao, dados: AcoesCursos[Acao] & { pedido: string }): Promise<RespostaPedido> => {
			const promessa = espera.current!.esperar(dados.pedido);
			acoes.acaoDaInterface(PAINEL_CURSOS, acao, dados).catch((falha: unknown) => {
				espera.current!.falhar(dados.pedido, new ErroDaPonte(`Não consegui falar com a sessão: ${(falha as Error).message}`));
			});
			return promessa;
		},
		[acoes],
	);
}

// --- Os hooks ----------------------------------------------------------------

export interface CursosDaMateria {
	/** undefined até a primeira lista chegar. */
	lista?: ResumoCurso[];
	erroLista?: string;
	/** Cria o rascunho com o Básico confirmado; resolve com o curso. */
	comecar(basico: EntradaBasico): Promise<Curso>;
	/** Descarta um rascunho (a pasta é apagada). */
	descartar(curso: string): Promise<void>;
	listar(): void;
}

/**
 * Os cursos da matéria: pede "listar" ao montar, quando a sessão muda e
 * quando `vez` muda (o caderno passa a tela aberta: voltar do guia para a
 * seção traz a lista nova). Trocar de sessão zera as ações da ponte; até a
 * nova lista chegar, vale a última.
 */
export function useCursos(janela: JanelaPerfilHook, materiaId: string, vez?: string): CursosDaMateria {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	const listar = useCallback(() => {
		semEsperar(acoes.acaoDaInterface(PAINEL_CURSOS, "listar", { materia: materiaId } satisfies AcoesCursos["listar"]));
	}, [acoes, materiaId]);
	useEffect(() => {
		if (sessaoId) listar();
	}, [sessaoId, listar, vez]);
	const recebidas = estado.acoesPorPainel[PAINEL_CURSOS];
	const lido = useMemo(() => lerCursos(recebidas ?? [], materiaId), [recebidas, materiaId]);
	const ultima = useRef<{ materia: string; lista: ResumoCurso[] } | undefined>(undefined);
	if (lido.lista) ultima.current = { materia: materiaId, lista: lido.lista };
	const lista = lido.lista ?? (ultima.current?.materia === materiaId ? ultima.current.lista : undefined);
	const mandar = useMandarComPedido(janela);
	return {
		...(lista ? { lista } : {}),
		...(lido.erroLista ? { erroLista: lido.erroLista } : {}),
		listar,
		comecar: async (basico) => {
			const resposta = await mandar("comecar", { materia: materiaId, pedido: crypto.randomUUID(), basico });
			if (resposta.tipo !== "curso") throw new ErroDaPonte("A extensão respondeu sem o curso.");
			return resposta.dados.curso;
		},
		descartar: async (curso) => {
			await mandar("descartar", { materia: materiaId, curso, pedido: crypto.randomUUID() });
			listar();
		},
	};
}

export interface CursoAberto {
	/** O curso.json; undefined até chegar (ou sem curso, no guia de um curso novo). */
	curso?: Curso;
	/** O erro de abrir o curso (não existe, ilegível). */
	erro?: string;
	/** Confirma a etapa; resolve com a mensagem "curso" (o curso novo e as etapas invalidadas). */
	confirmar<E extends Etapa>(etapa: E, dados: EntradasDasEtapas[E] | Record<string, never>): Promise<MensagemCurso>;
}

/** Um curso da matéria: pede "abrir" ao montar, quando a sessão muda e quando o curso muda. */
export function useCurso(janela: JanelaPerfilHook, materiaId: string, cursoId: string | undefined): CursoAberto {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	useEffect(() => {
		if (sessaoId && cursoId) semEsperar(acoes.acaoDaInterface(PAINEL_CURSOS, "abrir", { materia: materiaId, curso: cursoId } satisfies AcoesCursos["abrir"]));
	}, [sessaoId, acoes, materiaId, cursoId]);
	const recebidas = estado.acoesPorPainel[PAINEL_CURSOS];
	const lido = useMemo(() => lerCursos(recebidas ?? [], materiaId), [recebidas, materiaId]);
	const ultimo = useRef<Curso | undefined>(undefined);
	const doServidor = cursoId ? lido.cursos[cursoId] : undefined;
	if (doServidor) ultimo.current = doServidor;
	const curso = doServidor ?? (cursoId && ultimo.current?.id === cursoId && ultimo.current.materia === materiaId ? ultimo.current : undefined);
	const erro = cursoId ? lido.errosAbrir[cursoId] : undefined;
	const mandar = useMandarComPedido(janela);
	return {
		...(curso ? { curso } : {}),
		...(erro ? { erro } : {}),
		confirmar: async (etapa, dados) => {
			if (!cursoId) throw new ErroDaPonte("O curso ainda não existe: confirme o Básico primeiro.");
			const resposta = await mandar("confirmar", { materia: materiaId, curso: cursoId, pedido: crypto.randomUUID(), etapa, dados } as AcoesCursos["confirmar"]);
			if (resposta.tipo !== "curso") throw new ErroDaPonte("A extensão respondeu sem o curso.");
			return resposta.dados;
		},
	};
}
