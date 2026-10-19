// O painel "notas" da ponte, que a extensão de notas (extensions/notas.ts)
// atende, e a leitura do que ela mandou. A seção Notas do caderno e o editor
// usam daqui.

import type { AcaoRecebida } from "@estudos/ui";
import { useEffect, useRef } from "react";
import type { ListaNotas } from "../../lib/nota-tipos.ts";

export const PAINEL_NOTAS = "notas";

/** O que a extensão manda, pelo nome da ação. */
export interface RespostasNotas {
	lista: ListaNotas;
	nota: { materia: string; titulo: string; conteudo: string; versao: string; modificadaEm: string };
	criada: { materia: string; titulo: string };
	salva: { materia: string; titulo: string; versao: string; modificadaEm: string; pedido?: string };
	conflito: { materia: string; titulo: string; mensagem: string; versaoAtual?: string; pedido?: string };
	renomeada: { materia: string; de: string; para: string };
	erro: { mensagem: string; ao?: string; materia?: string; titulo?: string; pedido?: string };
}

export type RespostaNotas = { [Acao in keyof RespostasNotas]: { acao: Acao; dados: RespostasNotas[Acao] } }[keyof RespostasNotas];

/** A última lista de notas da matéria. */
export function ultimaLista(recebidas: readonly AcaoRecebida[], materia: string): ListaNotas | undefined {
	for (let indice = recebidas.length - 1; indice >= 0; indice--) {
		const recebida = recebidas[indice]!;
		if (recebida.acao === "lista" && (recebida.dados as ListaNotas).materia === materia) return recebida.dados as ListaNotas;
	}
	return undefined;
}

/** Mesmo título, sem diferença de maiúsculas (o Windows não diferencia). */
export const mesmoTitulo = (a: string | undefined, b: string | undefined) => a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

/**
 * Chama `tratar` uma vez para cada ação nova do painel (as que chegaram
 * depois de montar). As que já estavam lá quando a tela abriu não contam:
 * são respostas a pedidos de antes.
 */
export function useNovasRespostas(recebidas: readonly AcaoRecebida[] | undefined, tratar: (resposta: RespostaNotas) => void): void {
	const vistas = useRef<Set<string> | undefined>(undefined);
	const tratador = useRef(tratar);
	tratador.current = tratar;
	useEffect(() => {
		const lista = recebidas ?? [];
		if (!vistas.current) {
			vistas.current = new Set(lista.map((recebida) => recebida.chave));
			return;
		}
		for (const recebida of lista) {
			if (vistas.current.has(recebida.chave)) continue;
			vistas.current.add(recebida.chave);
			tratador.current({ acao: recebida.acao, dados: recebida.dados } as RespostaNotas);
		}
	}, [recebidas]);
}
