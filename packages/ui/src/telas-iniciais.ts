// Tela inicial de um perfil: o que abre ao escolher o perfil, antes da janela
// de conversa (no perfil de estudos, os cadernos). Genérico como o registro
// de painéis: o front liga o id do perfil a um componente; um perfil sem tela
// inicial abre direto na janela de conversa.

import type { ComponentType } from "react";
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
}

export interface EntradaTelaInicial {
	componente: ComponentType<PropsTelaInicial>;
	/** Rótulo do botão da janela de conversa que volta para esta tela ("Cadernos"). */
	rotuloVoltar: string;
	/** Rótulo do voltar quando a conversa foi aberta de uma subtela ("Caderno"). Sem ele, rotuloVoltar. */
	rotuloDoCaminho?(caminho: string): string | undefined;
}

/** Mapa de id do perfil para a tela inicial dele. */
export type RegistroTelasIniciais = Readonly<Record<string, EntradaTelaInicial>>;
