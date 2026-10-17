// Ponte de eventos entre as ferramentas dos perfis e a interface
// (ESPECIFICACAO.md, 5.3). As ferramentas falam com a interface só por nomes de
// evento e dados simples no barramento pi.events, sem importar o núcleo: as
// extensões de perfil são carregadas pelo pi de outra pasta e não enxergam o
// pacote @estudos/core. O protocolo está em docs/ponte-de-eventos.md.
//
// - "interface:mostrar" {painel, acao, dados}: o núcleo repassa sem interpretar
//   (EventoNucleo "acao_interface").
// - "interface:pedido" {id, painel, acao, dados}: a ferramenta espera a resposta
//   do usuário. O núcleo repassa ("pedido_interface") e guarda o pedido até
//   JanelaPerfil.responder(id, dados) emitir "interface:resposta" {id, dados}.
//   Se a execução é abortada, termina ou a sessão é encerrada, ou se o usuário
//   cancela na interface (JanelaPerfil.cancelarPedido), o núcleo emite
//   "interface:resposta" {id, cancelado: true, motivo}: nenhum pedido fica
//   pendurado.
// - "interface:acao" {painel, acao, dados}: o sentido contrário, uma ação feita
//   na interface (JanelaPerfil.acaoDaInterface) para a extensão do perfil reagir.
//
// Gravação: cada pedido, o fim dele (respondido, com a resposta, ou cancelado,
// com o motivo) e cada ação mostrada viram entradas "nucleo.ponte" na sessão
// (pi.appendEntry: ficam no arquivo e não vão para o modelo). O histórico as
// devolve, para a interface reconstruir os pedidos e os painéis ao reabrir a
// conversa ou depois de o servidor reiniciar (registrosDaPonte, em sessoes.ts).
//
// Decisões, com a documentação do pi (1.2.0):
// - pi.events é o canal entre extensões (extensions.md, tabela "Choose an
//   integration point": "Communicate with another extension | pi.events"). O
//   barramento é do DefaultResourceLoader de cada sessão (resource-loader.d.ts,
//   opção eventBus; sem ela, createEventBus() por loader), então cada sessão tem
//   o seu: as sessões filhas dos subagentes não enxergam a ponte da principal.
// - O emit do barramento é síncrono (event-bus.js usa o EventEmitter do Node):
//   quem assina "interface:resposta" antes de emitir o pedido nunca perde a
//   resposta, mesmo um cancelamento imediato.
// - A extensão do núcleo é inline (sdk.md, "Inline extension factories") e é
//   uma por sessão. O JanelaPerfil chama o reload() do loader duas vezes ao
//   recarregar o código, e o pi não desliga as assinaturas da primeira carga
//   (loader.js: só invalidate() as desliga, no dispose da sessão); por isso a
//   ponte cancela as assinaturas anteriores a cada nova carga da fábrica.

import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import type { EventoNucleo, MotivoCancelamento } from "./eventos.ts";

/** Nomes dos eventos da ponte no barramento pi.events. */
export const EVENTOS_PONTE = {
	/** Ferramenta → interface: mostrar algo num painel. Dados: {painel, acao, dados}. */
	mostrar: "interface:mostrar",
	/** Ferramenta → interface: pedido que espera resposta. Dados: {id, painel, acao, dados}. */
	pedido: "interface:pedido",
	/** Núcleo → ferramenta: resposta de um pedido. Dados: RespostaInterface. */
	resposta: "interface:resposta",
	/** Interface → extensão do perfil: ação feita na interface. Dados: {painel, acao, dados}. */
	acao: "interface:acao",
} as const;

/** Mensagem de "interface:mostrar" e de "interface:acao". */
export interface MensagemInterface {
	painel: string;
	acao: string;
	dados: unknown;
}

/** Mensagem de "interface:pedido". */
export interface PedidoInterface extends MensagemInterface {
	id: string;
}

/** Tipo da entrada da sessão com os registros da ponte. */
export const TIPO_ENTRADA_PONTE = "nucleo.ponte";

/** O que a ponte grava na sessão, na ordem em que aconteceu. */
export type RegistroPonte =
	| { tipo: "pedido"; id: string; painel: string; acao: string; dados: unknown }
	| { tipo: "fim"; id: string; estado: "respondido"; resposta?: unknown }
	| { tipo: "fim"; id: string; estado: "cancelado"; motivo: MotivoCancelamento }
	| { tipo: "mostrar"; painel: string; acao: string; dados: unknown };

/** Mensagem de "interface:resposta": a resposta do usuário ou o cancelamento do pedido. */
export type RespostaInterface =
	| { id: string; dados: unknown }
	| { id: string; cancelado: true; motivo: MotivoCancelamento; erro?: string };

type Barramento = ExtensionAPI["events"];

function textoNaoVazio(valor: unknown): valor is string {
	return typeof valor === "string" && valor.trim().length > 0;
}

/** Confere painel e ação. Devolve a mensagem de erro, ou undefined se estiver certo. */
function problemaDaMensagem(dados: unknown): string | undefined {
	if (!dados || typeof dados !== "object") return "os dados devem ser um objeto {painel, acao, dados}";
	const { painel, acao } = dados as { painel?: unknown; acao?: unknown };
	if (!textoNaoVazio(painel)) return "falta painel (texto)";
	if (!textoNaoVazio(acao)) return "falta acao (texto)";
	return undefined;
}

/**
 * A ponte de uma sessão do pi: a extensão inline que entra na sessão, os
 * pedidos pendentes e os métodos que a JanelaPerfil usa para responder e para
 * mandar ações da interface. Uma instância por sessão montada.
 */
export class PonteSessao {
	private barramento?: Barramento;
	/** Grava um registro na sessão (pi.appendEntry da carga atual da extensão). */
	private gravarNaSessao?: (registro: RegistroPonte) => void;
	private assinaturas: Array<() => void> = [];
	private readonly pendentes = new Map<string, PedidoInterface>();
	private ativa = true;

	/** Extensão inline que liga a ponte ao barramento da sessão. */
	readonly extensao: InlineExtension = {
		name: "nucleo-ponte",
		factory: (pi) => {
			this.gravarNaSessao = (registro) => pi.appendEntry(TIPO_ENTRADA_PONTE, registro);
			this.ligar(pi.events);
		},
	};

	constructor(private readonly emitir: (evento: EventoNucleo) => void) {}

	/** ids dos pedidos que esperam resposta. */
	get pedidosPendentes(): string[] {
		return [...this.pendentes.keys()];
	}

	/**
	 * Entrega a resposta do usuário ao pedido `id`. Devolve false se o pedido
	 * não existe ou não espera mais resposta (já respondido ou cancelado).
	 */
	responder(id: string, dados: unknown): boolean {
		if (!this.ativa || !this.pendentes.delete(id)) return false;
		this.gravar({ tipo: "fim", id, estado: "respondido", ...(dados === undefined ? {} : { resposta: dados }) });
		return this.publicar(EVENTOS_PONTE.resposta, { id, dados } satisfies RespostaInterface);
	}

	/** Emite "interface:acao" para a extensão do perfil reagir. Lança erro se painel ou ação faltarem. */
	acaoDaInterface(painel: string, acao: string, dados: unknown): void {
		const problema = problemaDaMensagem({ painel, acao });
		if (problema) throw new Error(`Ação da interface inválida: ${problema}.`);
		if (!this.ativa || !this.barramento) throw new Error("A ponte desta sessão já foi encerrada.");
		this.publicar(EVENTOS_PONTE.acao, { painel, acao, dados } satisfies MensagemInterface);
	}

	/**
	 * O usuário cancelou o pedido `id` na interface: a ferramenta recebe
	 * {id, cancelado: true, motivo: "usuario"}. Devolve false se o pedido não
	 * existe ou não espera mais resposta.
	 */
	cancelarPeloUsuario(id: string): boolean {
		if (!this.ativa || !this.pendentes.has(id)) return false;
		this.cancelar(id, "usuario");
		return true;
	}

	/** Cancela todos os pedidos pendentes: cada ferramenta recebe {id, cancelado: true, motivo}. */
	cancelarPendentes(motivo: MotivoCancelamento): void {
		for (const id of [...this.pendentes.keys()]) this.cancelar(id, motivo);
	}

	/** Cancela os pendentes e desliga a ponte (sessão trocada ou janela descartada). Idempotente. */
	encerrar(motivo: MotivoCancelamento = "sessao_encerrada"): void {
		if (!this.ativa) return;
		this.cancelarPendentes(motivo);
		this.ativa = false;
		this.desligarAssinaturas();
		this.barramento = undefined;
	}

	// ---------------------------------------------------------------------------

	private ligar(barramento: Barramento): void {
		this.desligarAssinaturas();
		this.barramento = barramento;
		this.assinaturas = [
			barramento.on(EVENTOS_PONTE.mostrar, (dados) => this.aoMostrar(dados)),
			barramento.on(EVENTOS_PONTE.pedido, (dados) => this.aoPedido(dados)),
		];
	}

	private desligarAssinaturas(): void {
		for (const cancelar of this.assinaturas) {
			try {
				cancelar();
			} catch {
				// Assinatura de um runtime já invalidado pelo pi: nada a desligar.
			}
		}
		this.assinaturas = [];
	}

	private aoMostrar(dados: unknown): void {
		if (!this.ativa) return;
		const problema = problemaDaMensagem(dados);
		if (problema) {
			this.emitir({ tipo: "erro", origem: "extensao", mensagem: `${EVENTOS_PONTE.mostrar} ignorado: ${problema}` });
			return;
		}
		const mensagem = dados as MensagemInterface;
		this.gravar({ tipo: "mostrar", painel: mensagem.painel, acao: mensagem.acao, dados: mensagem.dados });
		this.emitir({ tipo: "acao_interface", painel: mensagem.painel, acao: mensagem.acao, dados: mensagem.dados });
	}

	private aoPedido(dados: unknown): void {
		const id = dados && typeof dados === "object" ? (dados as { id?: unknown }).id : undefined;
		if (!textoNaoVazio(id)) {
			// Sem id não há como avisar a ferramenta; fica só o erro.
			this.emitir({ tipo: "erro", origem: "extensao", mensagem: `${EVENTOS_PONTE.pedido} ignorado: falta id (texto)` });
			return;
		}
		if (!this.ativa) {
			this.publicar(EVENTOS_PONTE.resposta, { id, cancelado: true, motivo: "sessao_encerrada" } satisfies RespostaInterface);
			return;
		}
		const problema = problemaDaMensagem(dados) ?? (this.pendentes.has(id) ? `já existe um pedido pendente com id ${id}` : undefined);
		if (problema) {
			this.emitir({ tipo: "erro", origem: "extensao", mensagem: `${EVENTOS_PONTE.pedido} ${id} recusado: ${problema}` });
			this.publicar(EVENTOS_PONTE.resposta, {
				id,
				cancelado: true,
				motivo: "pedido_invalido",
				erro: problema,
			} satisfies RespostaInterface);
			return;
		}
		const mensagem = dados as PedidoInterface;
		const pedido: PedidoInterface = { id, painel: mensagem.painel, acao: mensagem.acao, dados: mensagem.dados };
		this.pendentes.set(id, pedido);
		this.gravar({ tipo: "pedido", ...pedido });
		this.emitir({ tipo: "pedido_interface", ...pedido });
	}

	private cancelar(id: string, motivo: MotivoCancelamento): void {
		if (!this.pendentes.delete(id)) return;
		this.gravar({ tipo: "fim", id, estado: "cancelado", motivo });
		this.publicar(EVENTOS_PONTE.resposta, { id, cancelado: true, motivo } satisfies RespostaInterface);
		this.emitir({ tipo: "pedido_interface_cancelado", id, motivo });
	}

	/** Grava na sessão; uma sessão que já foi trocada ou descartada não grava mais (sem erro). */
	private gravar(registro: RegistroPonte): void {
		try {
			this.gravarNaSessao?.(registro);
		} catch {
			// O runtime da sessão já foi invalidado (troca de sessão): o registro se perde, e o
			// pedido sem fim aparece como cancelado ao reabrir.
		}
	}

	/** Emite no barramento da sessão. Devolve false se o pi já invalidou o runtime da sessão. */
	private publicar(canal: string, dados: unknown): boolean {
		if (!this.barramento) return false;
		try {
			this.barramento.emit(canal, dados);
			return true;
		} catch (erro) {
			this.emitir({
				tipo: "erro",
				origem: "nucleo",
				mensagem: `ponte: não foi possível emitir ${canal}: ${erro instanceof Error ? erro.message : String(erro)}`,
			});
			return false;
		}
	}
}
