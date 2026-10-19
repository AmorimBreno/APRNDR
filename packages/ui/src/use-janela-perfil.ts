// Hook da janela de perfil: abre o perfil no servidor, aplica o reducer às
// mensagens e expõe as ações. Ao reconectar (o servidor reiniciou ou a rede
// caiu), reabre o perfil com a sessão que estava aberta; o servidor devolve o
// histórico dela. O id da sessão também fica no sessionStorage da aba, para
// o recarregar da página (o Vite recarrega quando o pnpm dev reinicia) voltar
// à mesma conversa.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { type ClienteConexao, type EstadoConexao, ErroPedido, obterCliente, type PedidoCliente } from "./cliente.ts";
import { type EstadoJanela, estadoInicial, reduzirJanela } from "./estado-janela.ts";
import type { ContextoSessao, DadosResposta, EstadoSessao, InfoModelo, ResumoSessao, SituacaoMaterial } from "./tipos.ts";

export interface AcoesJanela {
	/** "iniciada" ou "enfileirada" (a sessão estava respondendo). */
	enviar(texto: string): Promise<"iniciada" | "enfileirada">;
	/** Devolve as mensagens que estavam na fila, para voltarem ao campo de texto. */
	abortar(): Promise<string[]>;
	/** modelo no formato provedor/id. */
	trocarModelo(modelo: string): Promise<EstadoSessao>;
	trocarAgente(agente: string): Promise<EstadoSessao>;
	/** contexto: o assunto da sessão nova; null = sem contexto; sem ele = o da sessão atual. */
	novaSessao(agente?: string, contexto?: ContextoSessao | null): Promise<EstadoSessao>;
	/** contexto: atualiza o gravado na sessão, se mudou. */
	abrirSessao(sessaoId: string, contexto?: ContextoSessao): Promise<EstadoSessao>;
	listarSessoes(): Promise<ResumoSessao[]>;
	listarModelos(): Promise<InfoModelo[]>;
	recarregarPerfil(): Promise<EstadoSessao>;
	/** Responde a um pedido da ponte. false = o pedido não esperava mais resposta. */
	responderPedido(id: string, dados?: unknown): Promise<boolean>;
	/** Cancela um pedido da ponte (a ferramenta recebe motivo "usuario"). false = ele não esperava mais resposta. */
	cancelarPedido(id: string): Promise<boolean>;
	/** Ação feita num painel; vira "interface:acao" na sessão. */
	acaoDaInterface(painel: string, acao: string, dados?: unknown): Promise<void>;
	/** Pede a situação dos materiais (vai para estado.materiais; as mudanças chegam sozinhas depois). */
	listarMateriais(): Promise<SituacaoMaterial[]>;
	/** Manda arquivos para uma pasta de materiais do perfil (relativa à pasta de dados). Devolve os caminhos gravados. */
	enviarMateriais(pasta: string, arquivos: readonly File[]): Promise<string[]>;
	/** Processa um material de novo do zero. */
	reprocessarMaterial(caminho: string): Promise<void>;
	limparErros(): void;
	fecharAvisoRecarregado(): void;
}

function chaveSessao(perfilId: string): string {
	return `estudos-app:sessao:${perfilId}`;
}

/** Sessão guardada na aba (try/catch: o storage pode estar bloqueado). */
function lerSessaoGuardada(perfilId: string): string | undefined {
	try {
		return globalThis.sessionStorage?.getItem(chaveSessao(perfilId)) ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * Guarda na aba a sessão do perfil que a próxima tela deve abrir. Uma tela que
 * troca a sessão e logo navega para outra (o caderno abrindo a conversa da
 * matéria) chama isto antes de navegar.
 */
export function guardarSessaoDoPerfil(perfilId: string, sessaoId: string): void {
	guardarSessao(perfilId, sessaoId);
}

function guardarSessao(perfilId: string, sessaoId: string): void {
	try {
		globalThis.sessionStorage?.setItem(chaveSessao(perfilId), sessaoId);
	} catch {
		// sem storage: só a reconexão sem recarregar volta à sessão
	}
}

export interface JanelaPerfilHook {
	estado: EstadoJanela;
	conexao: EstadoConexao;
	acoes: AcoesJanela;
}

/**
 * Liga a tela ao perfil `perfilId`. Os erros dos pedidos entram em
 * estado.erros (pelo reducer) e também rejeitam a promessa da ação.
 */
export function useJanelaPerfil(perfilId: string, cliente: ClienteConexao = obterCliente()): JanelaPerfilHook {
	const [estado, despachar] = useReducer(reduzirJanela, perfilId, estadoInicial);
	const [conexao, setConexao] = useState<EstadoConexao>(cliente.estado);
	/** Sessão aberta, para reabrir depois de uma reconexão. */
	const sessaoAberta = useRef<string | undefined>(undefined);
	sessaoAberta.current ??= lerSessaoGuardada(perfilId);
	const sessaoAtual = estado.sessao?.sessaoId;
	if (sessaoAtual) sessaoAberta.current = sessaoAtual;
	useEffect(() => {
		if (sessaoAtual) guardarSessao(perfilId, sessaoAtual);
	}, [perfilId, sessaoAtual]);

	/** Manda o pedido e despacha a resposta (ok ou erro) para o reducer. */
	const pedir = useCallback(
		async <M extends PedidoCliente>(mensagem: M): Promise<DadosResposta[M["tipo"]]> => {
			try {
				const dados = await cliente.pedir(mensagem);
				despachar({ tipo: "resposta", pedido: mensagem.tipo, ok: true, ...(dados === undefined ? {} : { dados }) });
				return dados;
			} catch (erro) {
				const texto = erro instanceof Error ? erro.message : String(erro);
				despachar({ tipo: "resposta", pedido: mensagem.tipo, ok: false, erro: texto });
				throw erro instanceof ErroPedido ? erro : new ErroPedido(texto, mensagem.tipo);
			}
		},
		[cliente],
	);

	useEffect(() => {
		const abrir = () => {
			const sessaoId = sessaoAberta.current;
			if (!sessaoId) {
				pedir({ tipo: "abrir_perfil", perfil: perfilId }).catch(() => {});
				return;
			}
			// Com a sessão guardada: ela pode não existir em disco (nova e ainda
			// sem mensagem). Esse erro é esperado, então só aparece se abrir o
			// perfil sem ela também falhar.
			const pedido = { tipo: "abrir_perfil", perfil: perfilId, sessaoId } as const;
			cliente.pedir(pedido).then(
				(dados) => despachar({ tipo: "resposta", pedido: pedido.tipo, ok: true, dados }),
				(erro: unknown) => {
					if (cliente.estado !== "aberta") {
						despachar({ tipo: "resposta", pedido: pedido.tipo, ok: false, erro: erro instanceof Error ? erro.message : String(erro) });
						return;
					}
					sessaoAberta.current = undefined;
					pedir({ tipo: "abrir_perfil", perfil: perfilId }).catch(() => {
						despachar({ tipo: "resposta", pedido: pedido.tipo, ok: false, erro: erro instanceof Error ? erro.message : String(erro) });
					});
				},
			);
		};
		const pararMensagens = cliente.aoReceber((mensagem) => {
			// As respostas dos pedidos deste hook são despachadas por pedir().
			if (mensagem.tipo === "resposta" || mensagem.tipo === "pong") return;
			despachar(mensagem);
		});
		const pararEstado = cliente.aoMudarEstado((novo) => {
			setConexao(novo);
			if (novo === "reconectando") despachar({ tipo: "local:conexao_caiu" });
		});
		const pararAbertura = cliente.aoAbrir(() => abrir());
		setConexao(cliente.estado);
		if (cliente.estado === "aberta") abrir();
		return () => {
			pararMensagens();
			pararEstado();
			pararAbertura();
		};
	}, [cliente, perfilId, pedir]);

	const acoes = useMemo<AcoesJanela>(() => {
		const perfil = perfilId;
		return {
			enviar: (texto) => pedir({ tipo: "enviar", perfil, texto }),
			abortar: () => pedir({ tipo: "abortar", perfil }),
			trocarModelo: (modelo) => pedir({ tipo: "trocar_modelo", perfil, modelo }),
			trocarAgente: (agente) => pedir({ tipo: "trocar_agente", perfil, agente }),
			novaSessao: (agente, contexto) => pedir({ tipo: "nova_sessao", perfil, ...(agente ? { agente } : {}), ...(contexto === undefined ? {} : { contexto }) }),
			abrirSessao: (sessaoId, contexto) => pedir({ tipo: "abrir_sessao", perfil, sessaoId, ...(contexto ? { contexto } : {}) }),
			listarSessoes: () => pedir({ tipo: "listar_sessoes", perfil }),
			listarModelos: () => pedir({ tipo: "listar_modelos", perfil }),
			recarregarPerfil: () => pedir({ tipo: "recarregar_perfil", perfil }),
			responderPedido: async (id, dados) => {
				const resultado = await pedir({ tipo: "responder_pedido", perfil, id, ...(dados === undefined ? {} : { dados }) });
				despachar({ tipo: "local:pedido_respondido", id, ...(dados === undefined ? {} : { dados }) });
				return resultado;
			},
			cancelarPedido: async (id) => {
				const resultado = await pedir({ tipo: "cancelar_pedido", perfil, id });
				despachar({ tipo: "local:pedido_respondido", id });
				return resultado;
			},
			acaoDaInterface: async (painel, acao, dados) => {
				await pedir({ tipo: "acao_interface", perfil, painel, acao, ...(dados === undefined ? {} : { dados }) });
			},
			listarMateriais: () => pedir({ tipo: "listar_materiais", perfil }),
			enviarMateriais: async (pasta, arquivos) => {
				const corpo = new FormData();
				corpo.append("pasta", pasta);
				for (const arquivo of arquivos) corpo.append("arquivos", arquivo, arquivo.name);
				const resposta = await fetch(`/api/perfis/${encodeURIComponent(perfil)}/materiais`, { method: "POST", body: corpo });
				const dados = (await resposta.json().catch(() => ({}))) as { ok?: boolean; gravados?: string[]; erro?: string };
				if (!resposta.ok || !dados.ok) throw new Error(dados.erro ?? `O servidor respondeu ${resposta.status}.`);
				return dados.gravados ?? [];
			},
			reprocessarMaterial: async (caminho) => {
				await pedir({ tipo: "reprocessar_material", perfil, caminho });
			},
			limparErros: () => despachar({ tipo: "local:limpar_erros" }),
			fecharAvisoRecarregado: () => despachar({ tipo: "local:fechar_aviso_recarregado" }),
		};
	}, [perfilId, pedir]);

	return { estado, conexao, acoes };
}

/** Engole a rejeição de uma ação cujo erro já aparece em estado.erros. */
export function semEsperar(promessa: Promise<unknown>): void {
	promessa.catch(() => {});
}
