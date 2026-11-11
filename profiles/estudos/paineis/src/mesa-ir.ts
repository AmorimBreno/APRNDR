// A porta única para a mesa navegar (parte C1; docs/mesa-parte-c.md, seção 4): serve aos
// comandos do professor e ao "Ir ao trecho" da resposta. A mesa (MesaEstudo.tsx) a
// implementa e a expõe pelo contexto daqui (useMesa).
//
// irPara troca ou ativa a aba ("usuario" leva na hora; "previa" abre na vaga de prévia e
// só toma o foco se o Breno não estiver editando), guarda a âncora pendente e, quando o
// conteúdo da aba fica pronto, rola até o trecho e destaca. A âncora pendente vence a
// rolagem guardada da aba; sem conteúdo pronto no prazo, desiste em silêncio.

import { createContext, useContext } from "react";

/** Para onde ir. */
export interface AlvoIrPara {
	/** A origem da aba, com ou sem âncora (origem-mesa.ts). */
	origem: string;
	/** O texto a achar (a seleção da pergunta, ou o trecho do professor). Sem ele, usa o bloco da âncora. */
	trecho?: string;
	/** Só rolar até o trecho, sem marcar (títulos de seção). */
	soRolar?: boolean;
	/**
	 * "usuario": o clique do Breno, que leva à aba na hora. "previa": o professor pediu;
	 * a aba abre na vaga de prévia e só vira o foco se o Breno não estiver editando.
	 */
	quem: "usuario" | "previa";
}

export interface ValorMesa {
	irPara(alvo: AlvoIrPara): void;
	/**
	 * Parte D: fecha a aba da nota `rota` se ela estiver aberta na mesa (o cartão "Nota criada" fecha a aba antes de
	 * desfazer). Se a nota é a aba em foco, espera o salvamento terminar antes de fechar. Resolve quando a aba já foi
	 * fechada (ou quando não havia aba). Opcional: uma mesa de teste pode não ter.
	 */
	fecharAbaDaNota?(rota: string): Promise<void>;
	/**
	 * Parte D: o clique num link `conversa:<id>` (conversa-link.ts). Reabre a conversa da matéria cujo id curto é `idCurto`,
	 * pelas regras de troca da mesa (abrir-conversa.tsx), e abre o painel do professor. Opcional como o de cima.
	 */
	abrirConversa?(idCurto: string): void;
}

export const ContextoMesa = createContext<ValorMesa | undefined>(undefined);

/** A porta da mesa; undefined fora dela (o painel do caderno, a conversa em tela cheia). */
export function useMesa(): ValorMesa | undefined {
	return useContext(ContextoMesa);
}
