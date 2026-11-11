// Abrir uma conversa pelo link `conversa:<id>` de uma nota (parte D, WP2; docs/mesa-parte-d.md, seção 3).
// A mesa expõe o resultado por ContextoMesa.abrirConversa; o EditorNota (na nota aberta para edição ou para leitura)
// chama no clique (conversa-link.ts).
//
// As regras de troca da mesa (docs/mesa-de-estudo.md, 2.3), as mesmas do seletor de conversas do cabeçalho:
// - a sessão é achada pelo id curto exato entre as conversas DESTA matéria (nunca por prefixo);
// - com o professor respondendo ou com pedido pendente, pede confirmação ("Trocar mesmo assim?") antes de trocar;
// - antes de trocar, chama executarAntesDeTrocar() (salva a nota aberta e espera);
// - reabre pela ação que o histórico usa (acoes.abrirSessao) e guarda a sessão para a conversa em tela cheia.
// Sessão que não existe mais vira um aviso curto. O painel do professor é aberto (aoAbrir).
//
// O aviso e a confirmação flutuam sobre a área de estudo (posição absoluta, como o aviso do trecho): aparecer ou
// sumir não muda o tamanho de nada.

import { Button } from "@estudos/design-system";
import { guardarSessaoDoPerfil, type JanelaPerfilHook } from "@estudos/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";
import { contextoDaMateria } from "./comum.ts";
import { AVISO_CONVERSA_SEM_LISTA, AVISO_CONVERSA_SUMIU, sessaoPorIdCurto, TEXTO_CONFIRMAR_TROCA } from "./conversa-link.ts";
import { AVISO_SEM_SESSAO } from "./guardar-na-nota.ts";
import { useTrocaSessao } from "./troca-sessao.tsx";

/** Quanto o aviso curto fica na tela. */
export const DURACAO_AVISO_CONVERSA_MS = 4000;
export const AVISO_CONVERSA_FALHOU = "Não consegui abrir a conversa.";

/** O que o aviso flutuante mostra: uma frase, ou a confirmação da troca (com o que fazer se o Breno confirmar). */
export type AvisoDaConversa = { tipo: "aviso"; texto: string } | { tipo: "confirmar"; fazer(): void };

export interface EntradaAbrirConversa {
	janela: JanelaPerfilHook;
	perfilId: string;
	materia: Materia | undefined;
	/** Abre o painel do professor (se estava fechado). */
	aoAbrir(): void;
}

export interface AbrirConversa {
	abrir(idCurto: string): void;
	aviso: AvisoDaConversa | undefined;
	dispensar(): void;
}

export function useAbrirConversa(entrada: EntradaAbrirConversa): AbrirConversa {
	const troca = useTrocaSessao();
	// Tudo o que o clique lê vem das refs: a função que o EditorNota guarda não fica velha.
	const atual = useRef({ entrada, troca });
	atual.current = { entrada, troca };
	const [aviso, setAviso] = useState<AvisoDaConversa | undefined>(undefined);
	const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const ocupado = useRef(false);
	const vivo = useRef(true);
	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
			clearTimeout(relogio.current);
		};
	}, []);

	const dispensar = useCallback(() => {
		clearTimeout(relogio.current);
		setAviso(undefined);
	}, []);
	const avisar = useCallback((texto: string) => {
		if (!vivo.current) return;
		clearTimeout(relogio.current);
		setAviso({ tipo: "aviso", texto });
		relogio.current = setTimeout(() => setAviso(undefined), DURACAO_AVISO_CONVERSA_MS);
	}, []);

	const abrir = useCallback(
		(idCurto: string) => {
			if (ocupado.current) return;
			ocupado.current = true;
			void (async () => {
				try {
					const { entrada: ent } = atual.current;
					const { materia, janela, perfilId } = ent;
					if (!materia) return avisar(AVISO_SEM_SESSAO);
					let sessoes: Awaited<ReturnType<JanelaPerfilHook["acoes"]["listarSessoes"]>>;
					try {
						sessoes = await janela.acoes.listarSessoes();
					} catch {
						return avisar(AVISO_CONVERSA_SEM_LISTA);
					}
					// Só as conversas desta matéria: é nelas que o Guardar e a marca do professor escrevem o link.
					const achada = sessaoPorIdCurto(
						sessoes.filter((sessao) => sessao.contexto?.chave === `materia:${materia.id}`),
						idCurto,
					);
					if (!achada) return avisar(AVISO_CONVERSA_SUMIU);
					ent.aoAbrir();
					if (achada.id === atual.current.entrada.janela.estado.sessao?.sessaoId) return;
					const trocar = async () => {
						try {
							await atual.current.troca.executarAntesDeTrocar();
							const aberta = await atual.current.entrada.janela.acoes.abrirSessao(achada.id, contextoDaMateria(materia));
							guardarSessaoDoPerfil(perfilId, aberta.sessaoId);
						} catch {
							avisar(AVISO_CONVERSA_FALHOU);
						}
					};
					const estado = atual.current.entrada.janela.estado;
					const respondendo = estado.executando || estado.fila.length > 0 || estado.pedidos.length > 0;
					if (!respondendo) {
						dispensar();
						await trocar();
						return;
					}
					clearTimeout(relogio.current);
					if (vivo.current) setAviso({ tipo: "confirmar", fazer: () => void trocar() });
				} finally {
					ocupado.current = false;
				}
			})();
		},
		[avisar, dispensar],
	);

	return { abrir, aviso, dispensar };
}

/** O aviso flutuante da troca de conversa: uma frase curta ou a confirmação "Trocar mesmo assim?". */
export function AvisoDaConversaFlutuante({ aviso, dispensar }: { aviso: AvisoDaConversa | undefined; dispensar(): void }) {
	const raiz = useRef<HTMLDivElement>(null);
	const confirmando = aviso?.tipo === "confirmar";
	useEffect(() => {
		if (confirmando) raiz.current?.querySelector<HTMLButtonElement>("button[data-cancelar]")?.focus({ preventScroll: true });
	}, [confirmando]);
	if (!aviso) return null;
	if (aviso.tipo === "aviso") {
		return (
			<div className="mesa__conversa-aviso body-sm" role="status">
				{aviso.texto}
			</div>
		);
	}
	return (
		<div
			ref={raiz}
			className="mesa__conversa-aviso mesa__conversa-aviso--acao body-sm"
			role="alertdialog"
			aria-label="Confirmar a troca de conversa"
			onKeyDown={(evento) => {
				if (evento.key !== "Escape") return;
				evento.preventDefault();
				evento.stopPropagation();
				dispensar();
			}}
		>
			<span>{TEXTO_CONFIRMAR_TROCA}</span>
			<span className="mesa__aviso-botoes">
				<Button
					size="sm"
					variant="danger"
					onClick={() => {
						const fazer = aviso.fazer;
						dispensar();
						fazer();
					}}
				>
					Trocar
				</Button>
				<Button size="sm" variant="ghost" data-cancelar="" onClick={dispensar}>
					Cancelar
				</Button>
			</span>
		</div>
	);
}
