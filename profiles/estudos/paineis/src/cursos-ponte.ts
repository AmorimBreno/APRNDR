// O painel "cursos" da ponte, que a extensão dos cursos (docs/cursos.md,
// "Ponte") atende, e a leitura do que ela mandou. A seção Cursos do caderno
// (SecaoCursos.tsx) e o guia de criação (TelaGuiaCurso.tsx) usam daqui.
//
// Sem mudança otimista: cada ação que grava (comecar, confirmar, descartar)
// leva um pedido e devolve uma promessa, resolvida quando chega o "curso" ou o
// "descartado" com aquele pedido e rejeitada quando chega um "erro" com ele.
// Enquanto isso, o botão fica ocupado.
//
// O diagnóstico (parte B) usa as ações autoavaliar, gerar_diagnostico,
// responder, corrigir e concluir_diagnostico. Gerar e corrigir correm em
// segundo plano: o "curso" diz se está gerando (gerandoDiagnostico) ou
// corrigindo (corrigindo), e um "erro" com ao gerar_diagnostico, corrigir ou
// responder fica guardado (lerCursos, diagnosticos) até algo novo superá-lo.
//
// O esqueleto (parte C) usa gerar_esqueleto, editar_esqueleto e criar_curso.
// Gerar corre em segundo plano como o diagnóstico (gerandoEsqueleto no
// "curso", e o erro com ao gerar_esqueleto fica em esqueletos).

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	type AcoesCursos,
	type ArquivoDoCurso,
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
import type { Confianca, NivelAutoavaliacao } from "../../lib/diagnostico-tipos.ts";
import type { Modulo } from "../../lib/esqueleto-tipos.ts";

export { PAINEL_CURSOS };

/** As ações da tela: as da ponte "cursos" da lib (inclusive "corrigir"). */
export type AcoesDaTela = AcoesCursos;

/** Um erro que a extensão mandou, como a tela o guarda: a chave da ação recebida identifica este erro (para dispensá-lo). */
export interface ErroDoDiagnostico {
	chave: string;
	mensagem: string;
	/** A questão, se o erro diz qual. */
	questao?: string;
}

/** O que corre em segundo plano no diagnóstico de um curso. */
export interface AndamentoDiagnostico {
	/** As questões estão sendo geradas. */
	gerando: boolean;
	/** As dissertativas sendo corrigidas agora. */
	corrigindo: string[];
	/** O último erro de gerar as questões, até um "curso" dizer que está gerando de novo. */
	erroGerar?: ErroDoDiagnostico;
	/** O último erro de correção (corrigir ou responder), até um "curso" dizer que está corrigindo de novo. */
	erroCorrigir?: ErroDoDiagnostico;
}

const ANDAMENTO_VAZIO: AndamentoDiagnostico = { gerando: false, corrigindo: [] };

/** O que corre em segundo plano no esqueleto de um curso. */
export interface AndamentoEsqueleto {
	/** A proposta está sendo gerada. */
	gerando: boolean;
	/** O último erro de gerar a proposta, até um "curso" dizer que está gerando de novo. */
	erroGerar?: ErroDoDiagnostico;
}

const ESQUELETO_PARADO: AndamentoEsqueleto = { gerando: false };

/** O que a extensão mandou sobre os cursos de uma matéria. */
export interface LidoCursos {
	/** A última lista, com os cursos que chegaram depois dela atualizados (ou acrescentados) e sem os descartados depois dela. */
	lista?: ResumoCurso[];
	/** O último curso.json de cada curso que chegou (abrir, começar, confirmar ou prontos). */
	cursos: Record<string, Curso>;
	/** Os materiais prontos da matéria que chegaram com o último curso de cada curso. */
	prontos: Record<string, ArquivoDoCurso[]>;
	/** O erro da última listagem, se ele veio depois da lista. */
	erroLista?: string;
	/** O erro de abrir cada curso, se ele veio depois do curso. */
	errosAbrir: Record<string, string>;
	/** O que corre em segundo plano no diagnóstico de cada curso (pelo último "curso" e os erros depois dele). */
	diagnosticos: Record<string, AndamentoDiagnostico>;
	/** O que corre em segundo plano no esqueleto de cada curso. */
	esqueletos: Record<string, AndamentoEsqueleto>;
	/** Quantos módulos tem o esqueleto de cada curso pronto que chegou inteiro (a lista não traz). */
	modulos: Record<string, number>;
}

/** Lê, em ordem, o que chegou ao painel "cursos" para a matéria. Um erro sem matéria também conta (só estas telas ouvem o painel). */
export function lerCursos(recebidas: readonly AcaoRecebida[], materia: string): LidoCursos {
	let lista: ResumoCurso[] | undefined;
	let erroLista: string | undefined;
	const cursos: Record<string, Curso> = {};
	const prontos: Record<string, ArquivoDoCurso[]> = {};
	const errosAbrir: Record<string, string> = {};
	const diagnosticos: Record<string, AndamentoDiagnostico> = {};
	const esqueletos: Record<string, AndamentoEsqueleto> = {};
	const modulos: Record<string, number> = {};
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
			if (Array.isArray(dados.prontos)) prontos[curso.id] = dados.prontos;
			delete errosAbrir[curso.id];
			const antes = diagnosticos[curso.id];
			const gerando = dados.gerandoDiagnostico === true;
			const corrigindo = Array.isArray(dados.corrigindo) ? dados.corrigindo.filter((id): id is string => typeof id === "string") : [];
			diagnosticos[curso.id] = {
				gerando,
				corrigindo,
				...(antes?.erroGerar && !gerando ? { erroGerar: antes.erroGerar } : {}),
				...(antes?.erroCorrigir && corrigindo.length === 0 ? { erroCorrigir: antes.erroCorrigir } : {}),
			};
			const esqueletoAntes = esqueletos[curso.id];
			const gerandoEsqueleto = dados.gerandoEsqueleto === true;
			esqueletos[curso.id] = { gerando: gerandoEsqueleto, ...(esqueletoAntes?.erroGerar && !gerandoEsqueleto ? { erroGerar: esqueletoAntes.erroGerar } : {}) };
			if (curso.esqueleto && Array.isArray(curso.esqueleto.modulos)) modulos[curso.id] = curso.esqueleto.modulos.length;
			else delete modulos[curso.id];
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
			delete prontos[dados.curso];
			delete diagnosticos[dados.curso];
			delete esqueletos[dados.curso];
			delete modulos[dados.curso];
			if (lista) lista = lista.filter((item) => item.id !== dados.curso);
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroCursos | undefined;
			if (!dados || (dados.materia !== undefined && dados.materia !== materia)) continue;
			const mensagem = dados.mensagem || "Erro desconhecido.";
			if (dados.ao === "listar") erroLista = mensagem;
			else if (dados.ao === "abrir" && dados.curso) errosAbrir[dados.curso] = mensagem;
			else if (dados.ao === "gerar_esqueleto" && dados.curso) {
				esqueletos[dados.curso] = { gerando: false, erroGerar: { chave: recebida.chave, mensagem } };
			}
			else if (dados.curso && (dados.ao === "gerar_diagnostico" || dados.ao === "corrigir" || dados.ao === "responder")) {
				const antes = diagnosticos[dados.curso] ?? ANDAMENTO_VAZIO;
				const daQuestao = (dados as { questao?: unknown }).questao;
				const questao = typeof daQuestao === "string" && daQuestao ? daQuestao : undefined;
				const erro: ErroDoDiagnostico = { chave: recebida.chave, mensagem, ...(questao ? { questao } : {}) };
				if (dados.ao === "gerar_diagnostico") diagnosticos[dados.curso] = { ...antes, gerando: false, erroGerar: erro };
				else {
					// Sem a questão no erro: uma falha de corrigir vale para todas; uma de responder (pode ser só a resposta recusada) não mexe nas outras.
					const corrigindo = questao ? antes.corrigindo.filter((id) => id !== questao) : dados.ao === "corrigir" ? [] : antes.corrigindo;
					diagnosticos[dados.curso] = { ...antes, corrigindo, erroCorrigir: erro };
				}
			}
		}
	}
	return { ...(lista ? { lista } : {}), ...(erroLista ? { erroLista } : {}), cursos, prontos, errosAbrir, diagnosticos, esqueletos, modulos };
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
		<Acao extends keyof AcoesDaTela>(acao: Acao, dados: AcoesDaTela[Acao] & { pedido: string }): Promise<RespostaPedido> => {
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
	/** Quantos módulos tem cada curso pronto da lista, quando já se sabe (pelo curso inteiro). */
	modulos: Record<string, number>;
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
	// A lista não diz quantos módulos tem um curso pronto: pede cada um inteiro uma vez (por sessão).
	const pedidos = useRef<{ sessao: string | undefined; ids: Set<string> }>({ sessao: undefined, ids: new Set() });
	const faltam = (lista ?? []).filter((item) => item.situacao === "pronto" && lido.modulos[item.id] === undefined).map((item) => item.id);
	const chaveFaltam = faltam.join("\n");
	useEffect(() => {
		if (!sessaoId) return;
		if (pedidos.current.sessao !== sessaoId) pedidos.current = { sessao: sessaoId, ids: new Set() };
		for (const curso of faltam) {
			if (pedidos.current.ids.has(`${materiaId}/${curso}`)) continue;
			pedidos.current.ids.add(`${materiaId}/${curso}`);
			semEsperar(acoes.acaoDaInterface(PAINEL_CURSOS, "abrir", { materia: materiaId, curso } satisfies AcoesCursos["abrir"]));
		}
	}, [sessaoId, acoes, materiaId, chaveFaltam]);
	const mandar = useMandarComPedido(janela);
	return {
		...(lista ? { lista } : {}),
		...(lido.erroLista ? { erroLista: lido.erroLista } : {}),
		modulos: lido.modulos,
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
	/** Os materiais prontos da matéria agora, como a extensão mandou com o curso; undefined até chegar. */
	prontos?: ArquivoDoCurso[];
	/** Pede o curso de novo com os materiais prontos de agora (quando muda quantos materiais prontos a matéria tem). */
	pedirProntos(): void;
	/** Confirma a etapa; resolve com a mensagem "curso" (o curso novo e as etapas invalidadas). */
	confirmar<E extends Etapa>(etapa: E, dados: EntradasDasEtapas[E] | Record<string, never>): Promise<MensagemCurso>;
	/** O que corre em segundo plano no diagnóstico (gerando, corrigindo e os erros). */
	diagnostico: AndamentoDiagnostico;
	/** Diagnóstico: salva a autoavaliação inteira. */
	autoavaliar(niveis: Record<string, NivelAutoavaliacao>): Promise<MensagemCurso>;
	/** Diagnóstico: gera as questões (de novo, descarta as anteriores e as respostas). */
	gerarDiagnostico(): Promise<MensagemCurso>;
	/** Diagnóstico: grava a resposta de uma questão. */
	responder(resposta: { questao: string; confianca: Confianca; escolha?: number; texto?: string; tempoMs: number }): Promise<MensagemCurso>;
	/** Diagnóstico: tenta de novo a correção de uma dissertativa. */
	corrigir(questao: string): Promise<MensagemCurso>;
	/** Diagnóstico: confirma a etapa (todas as questões respondidas e corrigidas). */
	concluirDiagnostico(): Promise<MensagemCurso>;
	/** O que corre em segundo plano no esqueleto (gerando e o erro de gerar). */
	esqueleto: AndamentoEsqueleto;
	/** Esqueleto: gera a proposta (de novo, substitui a anterior); resolve quando ela chega. */
	gerarEsqueleto(): Promise<MensagemCurso>;
	/** Esqueleto: grava a proposta editada inteira. */
	editarEsqueleto(modulos: Modulo[]): Promise<MensagemCurso>;
	/** Esqueleto: confirma a etapa com a proposta e o calendário de hoje; o curso fica pronto. */
	criarCurso(): Promise<MensagemCurso>;
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
	const ultimosProntos = useRef<{ curso: string; prontos: ArquivoDoCurso[] } | undefined>(undefined);
	const prontosDoServidor = cursoId ? lido.prontos[cursoId] : undefined;
	if (cursoId && prontosDoServidor) ultimosProntos.current = { curso: cursoId, prontos: prontosDoServidor };
	const prontos = prontosDoServidor ?? (cursoId && ultimosProntos.current?.curso === cursoId ? ultimosProntos.current.prontos : undefined);
	const mandar = useMandarComPedido(janela);
	const diagnostico = (cursoId ? lido.diagnosticos[cursoId] : undefined) ?? ANDAMENTO_VAZIO;
	const esqueleto = (cursoId ? lido.esqueletos[cursoId] : undefined) ?? ESQUELETO_PARADO;
	/** Uma ação do diagnóstico ou do esqueleto com pedido; resolve com a mensagem "curso". */
	const doDiagnostico = async <
		Acao extends "autoavaliar" | "gerar_diagnostico" | "responder" | "corrigir" | "concluir_diagnostico" | "gerar_esqueleto" | "editar_esqueleto" | "criar_curso",
	>(
		acao: Acao,
		resto: Omit<AcoesDaTela[Acao], "materia" | "curso" | "pedido">,
	): Promise<MensagemCurso> => {
		if (!cursoId) throw new ErroDaPonte("O curso ainda não existe: confirme o Básico primeiro.");
		const resposta = await mandar(acao, { ...resto, materia: materiaId, curso: cursoId, pedido: crypto.randomUUID() } as AcoesDaTela[Acao] & { pedido: string });
		if (resposta.tipo !== "curso") throw new ErroDaPonte("A extensão respondeu sem o curso.");
		return resposta.dados;
	};
	return {
		...(curso ? { curso } : {}),
		...(erro ? { erro } : {}),
		...(prontos ? { prontos } : {}),
		pedirProntos: () => {
			if (sessaoId && cursoId) semEsperar(acoes.acaoDaInterface(PAINEL_CURSOS, "prontos", { materia: materiaId, curso: cursoId } satisfies AcoesCursos["prontos"]));
		},
		confirmar: async (etapa, dados) => {
			if (!cursoId) throw new ErroDaPonte("O curso ainda não existe: confirme o Básico primeiro.");
			const resposta = await mandar("confirmar", { materia: materiaId, curso: cursoId, pedido: crypto.randomUUID(), etapa, dados } as AcoesCursos["confirmar"]);
			if (resposta.tipo !== "curso") throw new ErroDaPonte("A extensão respondeu sem o curso.");
			return resposta.dados;
		},
		diagnostico,
		autoavaliar: (niveis) => doDiagnostico("autoavaliar", { niveis }),
		gerarDiagnostico: () => doDiagnostico("gerar_diagnostico", {}),
		responder: (resposta) => doDiagnostico("responder", resposta),
		corrigir: (questao) => doDiagnostico("corrigir", { questao }),
		concluirDiagnostico: () => doDiagnostico("concluir_diagnostico", {}),
		esqueleto,
		gerarEsqueleto: () => doDiagnostico("gerar_esqueleto", {}),
		editarEsqueleto: (modulos) => doDiagnostico("editar_esqueleto", { modulos }),
		criarCurso: () => doDiagnostico("criar_curso", {}),
	};
}
