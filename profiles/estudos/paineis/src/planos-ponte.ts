// O painel "planos" da ponte (docs/planos-de-estudo.md, seção 7), que a extensão dos planos
// (extensions/planos.ts) atende, e a leitura do que ela mandou. O seletor do cabeçalho do professor usa o hook.
//
// - `listar` {materia}: pedido quando a sessão abre e quando a matéria muda; a extensão responde `lista` (e manda
//   outra depois de criar, atualizar, desfazer ou seguir). Vale a última `lista` da matéria; a última conhecida fica
//   até a nova chegar (regra 2 de docs/padroes-de-interface.md).
// - `seguir` {materia, titulo | null, sessao, pedido} e `desfazer_plano`: sem mudança otimista, como cursos-ponte:
//   levam um pedido e devolvem uma promessa, resolvida quando chega a resposta com aquele pedido (`seguindo` ou
//   `desfeito`) e rejeitada quando chega um `erro` com ele.

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { type ListaPlanos, type MensagensPlanos, PAINEL_PLANOS, type ResumoPlano } from "../../lib/plano-tipos.ts";
import { EsperaDePedidos, respostaQualquer } from "./escrita-ponte.ts";

export { PAINEL_PLANOS };

/** Um erro que a extensão dos planos mandou (ou de mandar a ação): a mensagem é a frase para a tela. */
export class ErroDosPlanos extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroDosPlanos";
	}
}

const ehResumo = (valor: unknown): valor is ResumoPlano =>
	typeof valor === "object" &&
	valor !== null &&
	typeof (valor as ResumoPlano).titulo === "string" &&
	typeof (valor as ResumoPlano).feitos === "number" &&
	typeof (valor as ResumoPlano).total === "number";

/** A última `lista` da matéria (as que vêm de fora são conferidas: planos que não são resumos saem). */
export function ultimaListaDePlanos(recebidas: readonly AcaoRecebida[], materia: string): ListaPlanos | undefined {
	for (let indice = recebidas.length - 1; indice >= 0; indice--) {
		const recebida = recebidas[indice]!;
		if (recebida.acao !== "lista") continue;
		const dados = recebida.dados as Partial<ListaPlanos> | undefined;
		if (!dados || dados.materia !== materia || !Array.isArray(dados.planos)) continue;
		return {
			materia,
			sessao: typeof dados.sessao === "string" ? dados.sessao : "",
			planos: dados.planos.filter(ehResumo).map((plano) => ({ titulo: plano.titulo, feitos: plano.feitos, total: plano.total, concluido: plano.concluido === true })),
			seguindo: typeof dados.seguindo === "string" ? dados.seguindo : null,
		};
	}
	return undefined;
}

/** O texto curto do progresso de um plano: "2 de 5", ou "concluído". */
export function progressoDoPlano(plano: Pick<ResumoPlano, "feitos" | "total" | "concluido">): string {
	return plano.concluido ? "concluído" : `${plano.feitos} de ${plano.total}`;
}

/** Os planos da matéria pelo título (sem diferença de maiúsculas: o Windows não diferencia). */
export function planoPorTitulo(planos: readonly ResumoPlano[] | undefined, titulo: string | null | undefined): ResumoPlano | undefined {
	if (!titulo) return undefined;
	return planos?.find((plano) => plano.titulo.toLowerCase() === titulo.toLowerCase());
}

/** A resposta a um pedido de seguir ou desfazer (`seguindo`, `desfeito` ou `erro` com o mesmo pedido). */
export function respostaDoPedidoDePlanos(recebidas: readonly AcaoRecebida[], pedido: string) {
	const resposta = respostaQualquer(recebidas, pedido);
	if (resposta?.tipo === "ok" && resposta.dados.acao !== "seguindo" && resposta.dados.acao !== "desfeito") return undefined;
	return resposta;
}

export interface PlanosDaMateria {
	/** Os planos da matéria; undefined enquanto nenhuma lista chegou (nem uma antiga). */
	planos: ResumoPlano[] | undefined;
	/** O título do plano que esta conversa segue; null = nenhum; undefined = ainda não se sabe. */
	seguindo: string | null | undefined;
	/** Segue o plano (null solta); resolve quando a extensão confirma e rejeita com a frase do erro. */
	seguir(titulo: string | null): Promise<void>;
	/** Apaga o plano criado pelo professor (só se o arquivo ainda é o que ele gravou). */
	desfazer(titulo: string): Promise<void>;
	listar(): void;
}

/** As últimas listas conhecidas, por matéria: voltar à matéria (ou trocar a sessão) mostra a que já se conhecia até a nova chegar. */
const ultimasListas = new Map<string, ListaPlanos>();

export function usePlanos(janela: JanelaPerfilHook, materiaId: string | undefined): PlanosDaMateria {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	const listar = useCallback(() => {
		if (materiaId) semEsperar(acoes.acaoDaInterface(PAINEL_PLANOS, "listar", { materia: materiaId }));
	}, [acoes, materiaId]);
	useEffect(() => {
		if (sessaoId && materiaId) listar();
	}, [sessaoId, materiaId, listar]);

	const recebidas = estado.acoesPorPainel[PAINEL_PLANOS];
	const lida = useMemo(() => (materiaId ? ultimaListaDePlanos(recebidas ?? [], materiaId) : undefined), [recebidas, materiaId]);
	if (lida && materiaId) ultimasListas.set(materiaId, lida);
	const conhecida = lida ?? (materiaId ? ultimasListas.get(materiaId) : undefined);
	// "Segue" é da sessão: uma lista que a extensão mandou para outra sessão não diz o que esta segue (regra 4). Mas o
	// valor mostrado não some na troca: vale o último até a lista desta sessão chegar.
	const dessaSessao = lida && lida.sessao === sessaoId ? lida : undefined;
	const ultimoSeguindo = useRef<{ materia: string; valor: string | null } | undefined>(undefined);
	if (dessaSessao && materiaId) ultimoSeguindo.current = { materia: materiaId, valor: dessaSessao.seguindo };
	const seguindoAntigo = ultimoSeguindo.current && ultimoSeguindo.current.materia === materiaId ? ultimoSeguindo.current.valor : undefined;

	const espera = useRef<EsperaDePedidos<{ acao: string; dados: Record<string, unknown> }> | undefined>(undefined);
	espera.current ??= new EsperaDePedidos(respostaDoPedidoDePlanos, (mensagem) => new ErroDosPlanos(mensagem));
	useEffect(() => {
		espera.current!.receber(recebidas ?? []);
	}, [recebidas]);
	// Outra sessão: o que foi para a extensão antiga não vai ter resposta.
	useEffect(() => () => espera.current!.cancelar("A conversa mudou antes da resposta. Tente de novo."), [sessaoId]);

	const mandar = useCallback(
		async <Acao extends "seguir" | "desfazer_plano">(acao: Acao, dados: Record<string, unknown> & { pedido: string }): Promise<void> => {
			const promessa = espera.current!.esperar(dados.pedido);
			acoes.acaoDaInterface(PAINEL_PLANOS, acao, dados).catch((falha: unknown) => {
				espera.current!.falhar(dados.pedido, `Não consegui falar com a sessão: ${(falha as Error).message}`);
			});
			await promessa;
		},
		[acoes],
	);

	const seguir = useCallback(
		async (titulo: string | null) => {
			if (!materiaId || !sessaoId) throw new ErroDosPlanos("A conversa ainda está abrindo. Tente de novo em instantes.");
			await mandar("seguir", { materia: materiaId, titulo, sessao: sessaoId, pedido: crypto.randomUUID() });
		},
		[mandar, materiaId, sessaoId],
	);
	const desfazer = useCallback(
		async (titulo: string) => {
			if (!materiaId || !sessaoId) throw new ErroDosPlanos("A conversa ainda está abrindo. Tente de novo em instantes.");
			await mandar("desfazer_plano", { materia: materiaId, titulo, sessao: sessaoId, pedido: crypto.randomUUID() });
		},
		[mandar, materiaId, sessaoId],
	);

	return { planos: conhecida?.planos, seguindo: dessaSessao ? dessaSessao.seguindo : seguindoAntigo, seguir, desfazer, listar };
}

export type { MensagensPlanos };
