// Lista de perfis do servidor (GET /api/perfis): os válidos e os erros dos
// inválidos, à parte.

import { useCallback, useEffect, useState } from "react";

/** Foto de um agente: a URL e, se houver, o quadrado do rosto [x, y, lado] em pixels da imagem. */
export interface DadosAvatarAgente {
	url: string;
	recorte?: [number, number, number];
}

export interface AgenteSelecionavel {
	nome: string;
	papel: string;
	modelo?: string;
	avatar?: DadosAvatarAgente;
}

/** Aparência do perfil na tela de perfis (aparencia do profile.json); tudo opcional. */
export interface AparenciaPerfil {
	/** Cor de marca do tema: amber, brick, sage, moss, cream ou steel. */
	cor?: "amber" | "brick" | "sage" | "moss" | "cream" | "steel";
	lema?: string;
	glifo?: string;
	/** URL da capa (/api/perfis/<id>/capa). */
	capa?: string;
}

/** Perfil como /api/perfis devolve (apps/server/src/app.ts). */
export interface ResumoPerfil {
	id: string;
	nome: string;
	/** Só os agentes selecionáveis. */
	agentes: AgenteSelecionavel[];
	agentePadrao: string;
	/** Painéis que o perfil usa (profile.json). */
	paineis: string[];
	/** true se o servidor já tem a janela do perfil aberta. */
	aberto: boolean;
	aparencia: AparenciaPerfil;
}

export interface ErroPerfil {
	arquivo: string;
	mensagem: string;
}

export interface ListaPerfis {
	perfis: ResumoPerfil[];
	erros: ErroPerfil[];
}

export interface PerfisHook {
	lista?: ListaPerfis;
	/** Falha ao buscar a lista (servidor fora do ar, por exemplo). */
	erro?: string;
	carregando: boolean;
	recarregar(): void;
}

export async function buscarPerfis(base = ""): Promise<ListaPerfis> {
	const resposta = await fetch(`${base}/api/perfis`);
	if (!resposta.ok) throw new Error(`GET /api/perfis: HTTP ${resposta.status}`);
	return (await resposta.json()) as ListaPerfis;
}

export function usePerfis(): PerfisHook {
	const [lista, setLista] = useState<ListaPerfis>();
	const [erro, setErro] = useState<string>();
	const [carregando, setCarregando] = useState(true);
	const [versao, setVersao] = useState(0);

	useEffect(() => {
		let ativo = true;
		setCarregando(true);
		buscarPerfis().then(
			(nova) => {
				if (!ativo) return;
				setLista(nova);
				setErro(undefined);
				setCarregando(false);
			},
			(falha: unknown) => {
				if (!ativo) return;
				setErro(falha instanceof Error ? falha.message : String(falha));
				setCarregando(false);
			},
		);
		return () => {
			ativo = false;
		};
	}, [versao]);

	const recarregar = useCallback(() => setVersao((anterior) => anterior + 1), []);
	return { ...(lista ? { lista } : {}), ...(erro ? { erro } : {}), carregando, recarregar };
}
