// Cliente do WebSocket do servidor (/ws). Genérico: só conhece o protocolo do
// núcleo. Faz três coisas:
// - reconecta sozinho quando a conexão cai, com espera crescente;
// - numera os pedidos (pedidoId) e devolve uma promessa da "resposta";
// - informa o estado da conexão (conectando, aberta, reconectando).
//
// Importa só tipos de "@estudos/core/protocolo" (import type): nada do núcleo
// vai para o navegador.

import type { DadosResposta, MensagemCliente, MensagemServidor, TipoMensagemCliente } from "@estudos/core/protocolo";

export type EstadoConexao = "conectando" | "aberta" | "reconectando";

/** O que o cliente usa de um WebSocket (os testes passam um falso). */
export interface SocketMinimo {
	readonly readyState: number;
	send(dados: string): void;
	close(): void;
	onopen: ((evento: unknown) => void) | null;
	onclose: ((evento: unknown) => void) | null;
	onerror: ((evento: unknown) => void) | null;
	onmessage: ((evento: { data: unknown }) => void) | null;
}

/** Mensagem do cliente sem o pedidoId (o cliente põe). Distribui o Omit pela união. */
export type PedidoCliente = MensagemCliente extends infer M ? (M extends unknown ? Omit<M, "pedidoId"> : never) : never;

export interface OpcoesCliente {
	/** Endereço do WebSocket. Padrão: /ws na mesma origem da página. */
	url?: string;
	/** Fábrica do socket. Padrão: new WebSocket(url). */
	criarSocket?: (url: string) => SocketMinimo;
	/** Primeira espera antes de reconectar. Padrão: 500 ms. */
	esperaInicialMs?: number;
	/** Espera máxima entre tentativas. Padrão: 10 s. */
	esperaMaximaMs?: number;
}

/** Erro de um pedido: a resposta veio com ok false, ou a conexão caiu antes. */
export class ErroPedido extends Error {
	constructor(
		mensagem: string,
		readonly pedido: TipoMensagemCliente,
	) {
		super(mensagem);
		this.name = "ErroPedido";
	}
}

interface Pendente {
	pedido: TipoMensagemCliente;
	resolver: (dados: unknown) => void;
	rejeitar: (erro: Error) => void;
}

const ABERTO = 1;

function urlPadrao(): string {
	const local = globalThis.location;
	if (!local) throw new Error("Sem location: passe a url do WebSocket.");
	return `${local.protocol === "https:" ? "wss" : "ws"}://${local.host}/ws`;
}

export class ClienteConexao {
	private readonly url: string;
	private readonly criarSocket: (url: string) => SocketMinimo;
	private readonly esperaInicial: number;
	private readonly esperaMaxima: number;

	private socket?: SocketMinimo;
	private estadoAtual: EstadoConexao = "conectando";
	private tentativas = 0;
	private temporizador?: ReturnType<typeof setTimeout>;
	private fechado = false;
	private proximoId = 0;
	private readonly pendentes = new Map<string, Pendente>();
	private readonly ouvintesMensagem = new Set<(mensagem: MensagemServidor) => void>();
	private readonly ouvintesEstado = new Set<(estado: EstadoConexao) => void>();
	private readonly ouvintesAbertura = new Set<(reconexao: boolean) => void>();
	/** true depois da primeira abertura: as próximas são reconexões. */
	private jaAbriu = false;

	constructor(opcoes: OpcoesCliente = {}) {
		this.url = opcoes.url ?? urlPadrao();
		this.criarSocket = opcoes.criarSocket ?? ((url) => new WebSocket(url) as unknown as SocketMinimo);
		this.esperaInicial = opcoes.esperaInicialMs ?? 500;
		this.esperaMaxima = opcoes.esperaMaximaMs ?? 10_000;
		this.conectar();
	}

	get estado(): EstadoConexao {
		return this.estadoAtual;
	}

	/** Recebe toda mensagem do servidor, inclusive as respostas. Devolve a função que cancela. */
	aoReceber(ouvinte: (mensagem: MensagemServidor) => void): () => void {
		this.ouvintesMensagem.add(ouvinte);
		return () => this.ouvintesMensagem.delete(ouvinte);
	}

	aoMudarEstado(ouvinte: (estado: EstadoConexao) => void): () => void {
		this.ouvintesEstado.add(ouvinte);
		return () => this.ouvintesEstado.delete(ouvinte);
	}

	/** Chamado a cada abertura; `reconexao` é true a partir da segunda. */
	aoAbrir(ouvinte: (reconexao: boolean) => void): () => void {
		this.ouvintesAbertura.add(ouvinte);
		return () => this.ouvintesAbertura.delete(ouvinte);
	}

	/**
	 * Manda um pedido e espera a resposta com o mesmo pedidoId. Resolve com os
	 * dados; rejeita com ErroPedido se a resposta vier com erro, se não houver
	 * conexão ou se ela cair antes da resposta.
	 */
	pedir<M extends PedidoCliente>(mensagem: M): Promise<DadosResposta[M["tipo"]]> {
		const socket = this.socket;
		if (!socket || socket.readyState !== ABERTO || this.estadoAtual !== "aberta") {
			return Promise.reject(new ErroPedido("Sem conexão com o servidor.", mensagem.tipo));
		}
		const pedidoId = `p${++this.proximoId}`;
		return new Promise<DadosResposta[M["tipo"]]>((resolver, rejeitar) => {
			this.pendentes.set(pedidoId, {
				pedido: mensagem.tipo,
				resolver: resolver as (dados: unknown) => void,
				rejeitar,
			});
			try {
				socket.send(JSON.stringify({ ...mensagem, pedidoId }));
			} catch (erro) {
				this.pendentes.delete(pedidoId);
				rejeitar(new ErroPedido(erro instanceof Error ? erro.message : String(erro), mensagem.tipo));
			}
		});
	}

	/** Fecha de vez (sem reconectar) e rejeita os pedidos pendentes. */
	fechar(): void {
		this.fechado = true;
		if (this.temporizador) clearTimeout(this.temporizador);
		this.temporizador = undefined;
		const socket = this.socket;
		this.socket = undefined;
		if (socket) {
			socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
			try {
				socket.close();
			} catch {
				// já fechado
			}
		}
		this.rejeitarPendentes("A conexão foi fechada.");
	}

	private mudarEstado(estado: EstadoConexao): void {
		if (estado === this.estadoAtual) return;
		this.estadoAtual = estado;
		for (const ouvinte of [...this.ouvintesEstado]) ouvinte(estado);
	}

	private conectar(): void {
		if (this.fechado) return;
		let socket: SocketMinimo;
		try {
			socket = this.criarSocket(this.url);
		} catch {
			this.agendarReconexao();
			return;
		}
		this.socket = socket;
		socket.onopen = () => {
			if (this.socket !== socket) return;
			this.tentativas = 0;
			const reconexao = this.jaAbriu;
			this.jaAbriu = true;
			this.mudarEstado("aberta");
			for (const ouvinte of [...this.ouvintesAbertura]) ouvinte(reconexao);
		};
		socket.onmessage = (evento) => {
			if (this.socket !== socket) return;
			this.receber(evento.data);
		};
		socket.onerror = () => {
			// O close vem logo depois; a reconexão é tratada lá.
		};
		socket.onclose = () => {
			if (this.socket !== socket) return;
			this.socket = undefined;
			this.rejeitarPendentes("A conexão caiu antes da resposta.");
			this.agendarReconexao();
		};
	}

	private agendarReconexao(): void {
		if (this.fechado) return;
		this.mudarEstado(this.jaAbriu ? "reconectando" : "conectando");
		const espera = Math.min(this.esperaMaxima, this.esperaInicial * 2 ** this.tentativas);
		this.tentativas++;
		this.temporizador = setTimeout(() => {
			this.temporizador = undefined;
			this.conectar();
		}, espera);
	}

	private receber(bruto: unknown): void {
		if (typeof bruto !== "string") return;
		let mensagem: MensagemServidor;
		try {
			mensagem = JSON.parse(bruto) as MensagemServidor;
		} catch {
			return;
		}
		if (mensagem.tipo === "resposta" && mensagem.pedidoId) {
			const pendente = this.pendentes.get(mensagem.pedidoId);
			if (pendente) {
				this.pendentes.delete(mensagem.pedidoId);
				if (mensagem.ok) pendente.resolver(mensagem.dados);
				else pendente.rejeitar(new ErroPedido(mensagem.erro, mensagem.pedido));
			}
		}
		for (const ouvinte of [...this.ouvintesMensagem]) ouvinte(mensagem);
	}

	private rejeitarPendentes(motivo: string): void {
		const pendentes = [...this.pendentes.values()];
		this.pendentes.clear();
		for (const pendente of pendentes) pendente.rejeitar(new ErroPedido(motivo, pendente.pedido));
	}
}

let compartilhado: ClienteConexao | undefined;

/** Cliente único da página (criado na primeira chamada). */
export function obterCliente(): ClienteConexao {
	compartilhado ??= new ClienteConexao();
	return compartilhado;
}
