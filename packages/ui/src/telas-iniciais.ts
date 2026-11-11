// Tela inicial de um perfil: o que abre ao escolher o perfil, antes da janela
// de conversa (no perfil de estudos, os cadernos). Genérico como o registro
// de painéis: o front liga o id do perfil a um componente; um perfil sem tela
// inicial abre direto na janela de conversa.

import type { ContextoTela } from "@estudos/core/protocolo";
import type { ComponentType, ReactNode } from "react";
import type { ItemConversa } from "./estado-janela.ts";
import type { JanelaPerfilHook } from "./use-janela-perfil.ts";
import type { ResumoPerfil } from "./use-perfis.ts";

export interface PropsTelaInicial {
	perfilId: string;
	/** O perfil como /api/perfis devolve; undefined enquanto a lista carrega. */
	perfil?: ResumoPerfil;
	/** Subtela aberta, sem barras nas pontas; "" é a tela principal. O perfil decide o que cada caminho é. */
	caminho: string;
	/** Vai para outra subtela ("" = a principal). Muda o hash: recarregar a página volta para ela. */
	navegar(caminho: string): void;
	/** Vai para a janela de conversa do perfil. */
	abrirConversa(): void;
	/** Volta para a tela de perfis. */
	voltar(): void;
	/**
	 * A conversa do perfil para embutir na própria tela (a mesa de estudo,
	 * 13.19; docs/mesa-de-estudo.md, 2.9). O app monta este componente com os
	 * mesmos pedaços da janela de conversa em tela cheia. Ausente num app que
	 * não oferece a conversa embutida.
	 */
	conversa?: ComponentType<PropsConversaEmbutida>;
}

/** Um item de resposta e um de mensagem do usuário da conversa. */
export type ItemAssistenteConversa = Extract<ItemConversa, { tipo: "assistente" }>;
export type ItemUsuarioConversa = Extract<ItemConversa, { tipo: "usuario" }>;

/** O que a tela inicial passa à conversa embutida. */
export interface PropsConversaEmbutida {
	/** A janela que a tela inicial já usa (um useJanelaPerfil só: abrir de novo duplicaria o perfil). */
	janela: JanelaPerfilHook;
	/** false = escondida (hidden e inert), nunca desmontada: o rascunho, a citação e a resposta em andamento continuam. */
	aberta: boolean;
	/**
	 * Os contextos da tela na hora de mandar (lidos a cada envio), um por aba
	 * aberta; ausente ou lista vazia = a mensagem vai sem contexto. Pode ser
	 * assíncrono (um perfil pode precisar buscar o conteúdo de uma aba).
	 */
	obterContextos?(): ContextoTela[] | Promise<ContextoTela[]>;
	/** O topo, desenhado pelo perfil (na mesa: o custo, o seletor de conversas, Nova e abrir na tela cheia). */
	cabecalho?: ReactNode;
	/** O trecho citado (Perguntar): aparece acima do campo com um X; vai como selecao no contexto com foco (ou no primeiro, se nenhum tiver foco) da próxima mensagem e é limpo depois. */
	citacao?: { texto: string; limpar(): void };
	/**
	 * As pills de contexto do perfil, flutuando logo acima do campo, na mesma
	 * fileira da pill da citação (na mesa: a aba ativa com o olho). Ausente = só a citação.
	 */
	acimaDoCampo?: ReactNode;
	/**
	 * Desenhado pelo perfil logo depois de cada resposta pronta (nunca com a resposta
	 * em andamento). `perguntaAnterior` é a mensagem do usuário que abriu o turno, com
	 * os contextosTela. Só o último item de assistente do turno pede o rodapé; quem
	 * decide é o perfil. Na mesa: "Ir ao trecho". Ausente = nada (docs/mesa-parte-c.md, seção 5).
	 */
	rodapeDaResposta?(resposta: ItemAssistenteConversa, perguntaAnterior?: ItemUsuarioConversa): ReactNode;
	/**
	 * Ações por bloco de primeiro nível da resposta (parágrafo, lista, tabela, código,
	 * fórmula, citação), desenhadas à direita do bloco, com o mouse ou o foco. `fonte` é
	 * o markdown original do bloco, pelas posições do nó. Na mesa: "Guardar na nota".
	 */
	acoesDoBloco?(fonte: string, indice: number, resposta: ItemAssistenteConversa): ReactNode;
	/** O texto de exemplo do campo ("Pergunte sobre Árvores de Decisão…"); sem ele, o padrão da conversa. */
	placeholder?: string;
	/** Avisa se há pedido esperando resposta, para a tela mostrar isso com a conversa fechada (a foto pulsa). */
	aoPedidoPendente?(pendente: boolean): void;
}

export interface EntradaTelaInicial {
	componente: ComponentType<PropsTelaInicial>;
	/** Rótulo do botão da janela de conversa que volta para esta tela ("Cadernos"). */
	rotuloVoltar: string;
	/** Rótulo do voltar quando a conversa foi aberta de uma subtela ("Caderno"). Sem ele, rotuloVoltar. */
	rotuloDoCaminho?(caminho: string): string | undefined;
	/**
	 * Hook do React que a janela de conversa do perfil chama (sempre, a cada
	 * render): o rótulo e a cor de agora de cada contexto de sessão, pela chave
	 * (no perfil de estudos, o nome e a cor de cada matéria). O histórico pinta
	 * a pílula com isto; sem ele (ou para uma chave que ele não conhece), valem
	 * o rótulo e a cor gravados na sessão.
	 */
	usarAparenciaContextos?(janela: JanelaPerfilHook): AparenciaContextos;
	/**
	 * Diz se a troca de subtela `de` -> `para` (caminhos sem barras nas pontas)
	 * deve acontecer sem a View Transition da página (as abas da mesa de estudo,
	 * para a conversa ao lado não piscar). Sem ele, toda troca anima.
	 */
	semTransicao?(de: string, para: string): boolean;
}

/** Rótulo e cor de agora de cada contexto, pela chave. */
export type AparenciaContextos = Readonly<Record<string, { rotulo?: string; cor?: string }>>;

/** Mapa de id do perfil para a tela inicial dele. */
export type RegistroTelasIniciais = Readonly<Record<string, EntradaTelaInicial>>;
