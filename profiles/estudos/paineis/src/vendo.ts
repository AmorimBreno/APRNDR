// O que está aberto na mesa de estudo, para o chip "Vendo" e o contexto da
// mensagem ao professor (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md, 2.6
// e 2.7). Contrato escrito no WP0; o provedor do React (vendo.tsx) vem no
// WP5b, e a nota e a lição se registram nele no WP7b.

/** Uma aba da mesa que pode ser mandada ao professor. Registrada pela nota ou pela lição aberta. */
export interface FonteVendo {
	/** "nota" ou "licao" (o tipo do ContextoTela). */
	tipo: "nota" | "licao";
	/** O nome no chip e para o modelo ("Séries convergentes", "Lição 2.3 · Critério da razão"). */
	rotulo: string;
	/** Onde voltar (a rota da aba, mais o bloco na parte C). */
	origem: string;
	/**
	 * O texto inteiro na hora de mandar: a nota, o markdown do buffer do
	 * editor (mesmo antes de salvar); a lição, textoDaLicao. undefined = sem
	 * texto (módulo aguardando material). Pode lançar: a mensagem vai sem
	 * conteúdo e o chip avisa.
	 */
	texto(): string | undefined;
	/** Chamado antes de qualquer troca de sessão (entrada no caderno, Nova, seletor): a nota salva e espera. */
	antesDeTrocar?(): Promise<void>;
}

/** O que o provedor oferece à mesa e às abas. */
export interface ValorVendo {
	/** A aba ativa se registra ao montar e devolve a função que a tira. */
	registrar(fonte: FonteVendo): () => void;
	/** A fonte da aba ativa, ou undefined (mesa sem aba). */
	ativa(): FonteVendo | undefined;
	/** O olho da matéria (lembrado por matéria no localStorage). */
	olho: boolean;
	alternarOlho(): void;
}

/** Quantos caracteres do texto vão no máximo; acima disso o conteúdo é cortado e vai com parcial. Abaixo do LIMITES_CONTEXTO_TELA.conteudo do núcleo. */
export const LIMITE_CONTEUDO_VENDO = 150_000;
