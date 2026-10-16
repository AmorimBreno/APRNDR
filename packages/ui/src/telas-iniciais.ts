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
	/** Vai para a janela de conversa do perfil. */
	abrirConversa(): void;
	/** Volta para a tela de perfis. */
	voltar(): void;
}

export interface EntradaTelaInicial {
	componente: ComponentType<PropsTelaInicial>;
	/** Rótulo do botão da janela de conversa que volta para esta tela ("Cadernos"). */
	rotuloVoltar: string;
}

/** Mapa de id do perfil para a tela inicial dele. */
export type RegistroTelasIniciais = Readonly<Record<string, EntradaTelaInicial>>;
