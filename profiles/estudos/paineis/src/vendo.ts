// O que está aberto na mesa de estudo, para o chip "Vendo" e o contexto da
// mensagem ao professor (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md, 2.6
// e 2.7). Contrato escrito no WP0; o provedor do React (vendo.tsx) vem no
// WP5b, e a nota e a lição se registram nele no WP7b.

import type { NivelAncora, PedidoAncora } from "./ancora.ts";

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
	/**
	 * Parte C1 (docs/mesa-parte-c.md, seção 4): acha o trecho (ou o bloco) do pedido, rola até
	 * ele e destaca sem mudar o documento. undefined = o conteúdo ainda não está pronto (a mesa
	 * tenta de novo no próximo quadro, até o prazo); senão, o nível em que achou.
	 */
	mostrar?(pedido: PedidoAncora, opcoes: OpcoesMostrar): NivelAncora | undefined;
	/**
	 * Só a nota aberta no editor: acrescenta o markdown ao fim do buffer, pelo mesmo parser do
	 * editor, e o salvamento automático grava (o "Guardar na nota" do WP3). Recusa com o
	 * motivo se o editor está em conflito, só leitura, salvando ou ainda sem a nota.
	 */
	inserirNoBuffer?(markdown: string): ResultadoInserir;
}

export interface OpcoesMostrar {
	/** A área da esquerda da mesa (onde procurar o conteúdo desenhado). */
	raiz: HTMLElement;
	/** Rolar com animação (a aba já estava na tela) ou de uma vez (acabou de chegar). */
	suave: boolean;
}

/** Por que inserirNoBuffer recusou. */
export type MotivoRecusaInserir = "sem-nota" | "conflito" | "somente-leitura" | "salvando" | "vazio";

export type ResultadoInserir = { ok: true } | { ok: false; motivo: MotivoRecusaInserir };

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
