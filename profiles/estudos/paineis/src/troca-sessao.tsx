// A troca de sessão da mesa vista pelas telas de baixo (docs/mesa-de-estudo.md,
// 2.3). A TelaEstudos decide e troca (sessao-materia.ts); o resto só precisa
// saber em que pé está para avisar o Breno (o cabeçalho do professor, WP5a), e
// poder segurar a troca até terminar um salvamento.

import { createContext, useContext } from "react";

export type SituacaoTroca =
	/** A sessão aberta é a da matéria (ou não há troca a fazer). */
	| "pronta"
	/** Salvando o que está aberto e abrindo a conversa da matéria. */
	| "trocando"
	/** Entrou no caderno, mas a conversa aberta ainda responde ou tem pedido pendente: troca quando acabar. */
	| "esperando_resposta"
	/** Outra aba do navegador trocou a sessão: a mesa não troca de volta sozinha. */
	| "outra_aba";

export interface TrocaSessao {
	situacao: SituacaoTroca;
	/** Uma entrada de novo no caderno: abre a conversa da matéria. */
	voltarParaMateria(): void;
	/**
	 * Registra o que precisa terminar antes da sessão trocar (salvar a nota e
	 * esperar). Devolve a função que desfaz o registro; a tela chama quando sai.
	 */
	registrarAntesDeTrocar(fn: () => Promise<void>): () => void;
	/**
	 * Roda tudo o que foi registrado e espera (cada um com prazo; um erro não
	 * segura os outros). Quem troca a sessão fora da entrada (Nova e o seletor de
	 * conversas, no cabeçalho do professor) chama antes de trocar.
	 */
	executarAntesDeTrocar(): Promise<void>;
}

/** Fora da TelaEstudos (um teste, uma tela solta) nada troca: valor neutro. */
const SEM_TROCA: TrocaSessao = {
	situacao: "pronta",
	voltarParaMateria: () => {},
	registrarAntesDeTrocar: () => () => {},
	executarAntesDeTrocar: () => Promise.resolve(),
};

export const TrocaSessaoContexto = createContext<TrocaSessao>(SEM_TROCA);

export function useTrocaSessao(): TrocaSessao {
	return useContext(TrocaSessaoContexto);
}
