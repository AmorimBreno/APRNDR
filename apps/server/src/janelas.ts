// Janelas de perfil do servidor: uma JanelaPerfil por perfil, criada sob
// demanda no primeiro abrir_perfil e compartilhada por todas as conexões. O app
// é de um usuário só; duas abas do mesmo perfil veem a mesma conversa. Os
// eventos da janela vão para todas as conexões que abriram aquele perfil.
//
// Também guarda a lista de perfis lida de profiles/ (relida quando um
// profile.json muda) e o registro de modelos do pi, compartilhado entre as
// janelas (ler auth.json e models.json uma vez só).

import {
	criarRegistroModelos,
	type EstadoSessao,
	type InfoModelo,
	JanelaPerfil,
	lerPerfisComErros,
	listarModelosDisponiveis,
	listarSessoes,
	type Perfil,
	type PerfilInvalido,
	type ModelRuntime,
	type ResumoSessao,
} from "@estudos/core";
import type { MensagemServidor } from "@estudos/core/protocolo";

import type { Log } from "./log.ts";

/** O que o servidor usa de uma JanelaPerfil (os testes passam uma falsa). */
export type JanelaDoServidor = Pick<
	JanelaPerfil,
	| "perfil"
	| "estado"
	| "iniciar"
	| "enviar"
	| "abortar"
	| "trocarModelo"
	| "trocarAgente"
	| "listarSessoes"
	| "abrirSessao"
	| "novaSessao"
	| "recarregar"
	| "modelosDisponiveis"
	| "historico"
	| "responder"
	| "acaoDaInterface"
	| "assinar"
	| "descartar"
>;

export type FabricaJanela = (
	perfil: Perfil,
	registro: () => Promise<ModelRuntime>,
) => JanelaDoServidor | Promise<JanelaDoServidor>;

/** Uma conexão WebSocket, vista pelo registro de janelas. */
export interface Conexao {
	readonly id: number;
	enviar(mensagem: MensagemServidor): void;
}

export interface OpcoesJanelas {
	pastaPerfis: string;
	log: Log;
	/** Padrão: JanelaPerfil de verdade com o registro de modelos compartilhado. */
	fabricaJanela?: FabricaJanela;
	/** Pasta global do pi. Padrão: a do pi (~/.pi/agent). */
	pastaPi?: string;
}

interface Entrada {
	perfil: string;
	janela: JanelaDoServidor;
	/** Primeiro iniciar() da janela; as outras conexões esperam por ele. */
	inicio?: Promise<EstadoSessao>;
	conexoes: Set<Conexao>;
}

export interface ListaPerfis {
	perfis: Perfil[];
	erros: PerfilInvalido[];
}

/** Fábrica padrão: JanelaPerfil de verdade com o registro de modelos compartilhado. */
const fabricaPadrao =
	(pastaPi: string | undefined): FabricaJanela =>
	async (perfil, registro) =>
		new JanelaPerfil(perfil, { registroModelos: await registro(), ...(pastaPi ? { pastaPi } : {}) });

export class Janelas {
	private readonly pastaPerfis: string;
	private readonly log: Log;
	private readonly fabrica: FabricaJanela;
	private readonly pastaPi?: string;
	private readonly entradas = new Map<string, Entrada>();
	/** Janelas sendo criadas (para duas conexões não criarem duas). */
	private readonly criando = new Map<string, Promise<Entrada>>();
	private lista?: Promise<ListaPerfis>;
	private registro?: Promise<ModelRuntime>;

	constructor(opcoes: OpcoesJanelas) {
		this.pastaPerfis = opcoes.pastaPerfis;
		this.log = opcoes.log;
		this.pastaPi = opcoes.pastaPi;
		this.fabrica = opcoes.fabricaJanela ?? fabricaPadrao(opcoes.pastaPi);
	}

	// --- Perfis -----------------------------------------------------------------

	/** Lista de perfis (lida uma vez e guardada; relerPerfis() força a releitura). */
	perfis(): Promise<ListaPerfis> {
		this.lista ??= this.lerLista();
		return this.lista;
	}

	/** Relê profiles/ (um profile.json mudou). */
	relerPerfis(): Promise<ListaPerfis> {
		this.lista = this.lerLista();
		return this.lista;
	}

	private async lerLista(): Promise<ListaPerfis> {
		try {
			const lista = await lerPerfisComErros(this.pastaPerfis);
			this.log.info(
				`Perfis lidos: ${lista.perfis.map((perfil) => perfil.id).join(", ") || "(nenhum)"}${lista.erros.length ? `; ${lista.erros.length} inválido(s)` : ""}`,
			);
			for (const erro of lista.erros) this.log.aviso(`Perfil inválido: ${erro.mensagem}`);
			return lista;
		} catch (erro) {
			// Não guarda a falha: a próxima chamada tenta de novo.
			this.lista = undefined;
			throw erro;
		}
	}

	async acharPerfil(id: string): Promise<Perfil> {
		const perfil = (await this.perfis()).perfis.find((item) => item.id === id);
		if (!perfil) throw new Error(`O perfil "${id}" não existe ou é inválido.`);
		return perfil;
	}

	/** Sessões gravadas do perfil; não precisa da janela aberta. */
	async sessoes(id: string): Promise<ResumoSessao[]> {
		const entrada = this.entradas.get(id);
		if (entrada?.janela.estado) return entrada.janela.listarSessoes();
		return listarSessoes(await this.acharPerfil(id));
	}

	/** Modelos disponíveis; não precisa da janela aberta. */
	async modelos(id: string): Promise<InfoModelo[]> {
		const entrada = this.entradas.get(id);
		if (entrada) return entrada.janela.modelosDisponiveis();
		await this.acharPerfil(id);
		return listarModelosDisponiveis(await this.obterRegistro());
	}

	private obterRegistro(): Promise<ModelRuntime> {
		this.registro ??= criarRegistroModelos(this.pastaPi).catch((erro: unknown) => {
			this.registro = undefined;
			throw erro;
		});
		return this.registro;
	}

	// --- Janelas e conexões --------------------------------------------------------

	/** Manda uma mensagem para todas as conexões que abriram o perfil. */
	transmitir(perfil: string, mensagem: MensagemServidor): void {
		const entrada = this.entradas.get(perfil);
		if (!entrada) return;
		for (const conexao of entrada.conexoes) conexao.enviar(mensagem);
	}

	private entrada(id: string): Promise<Entrada> {
		const existente = this.entradas.get(id);
		if (existente) return Promise.resolve(existente);
		let criando = this.criando.get(id);
		if (!criando) {
			criando = this.criarEntrada(id).finally(() => this.criando.delete(id));
			this.criando.set(id, criando);
		}
		return criando;
	}

	private async criarEntrada(id: string): Promise<Entrada> {
		const perfil = await this.acharPerfil(id);
		const janela = await this.fabrica(perfil, () => this.obterRegistro());
		const entrada: Entrada = { perfil: id, janela, conexoes: new Set() };
		janela.assinar((evento) => {
			if (evento.tipo === "erro") this.log.aviso(`[${id}] erro (${evento.origem}): ${evento.mensagem}`);
			else if (evento.tipo === "diagnostico" && evento.nivel !== "info") this.log.aviso(`[${id}] ${evento.nivel}: ${evento.mensagem}`);
			else if (evento.tipo === "execucao_fim") this.log.info(`[${id}] execução terminada${evento.abortada ? " (abortada)" : ""}`);
			this.transmitir(id, { tipo: "evento", perfil: id, evento });
		});
		this.entradas.set(id, entrada);
		this.log.info(`[${id}] janela criada`);
		return entrada;
	}

	/** Janela já iniciada do perfil, para os pedidos que precisam de sessão. */
	janela(id: string): JanelaDoServidor {
		const entrada = this.entradas.get(id);
		if (!entrada?.janela.estado) throw new Error(`O perfil "${id}" não está aberto; mande abrir_perfil antes.`);
		return entrada.janela;
	}

	/** true se o perfil tem janela com sessão. */
	aberta(id: string): boolean {
		return Boolean(this.entradas.get(id)?.janela.estado);
	}

	/** Perfis com janela iniciada. */
	abertas(): string[] {
		return [...this.entradas.values()].filter((entrada) => entrada.janela.estado).map((entrada) => entrada.perfil);
	}

	/** Pasta do perfil de cada janela iniciada (para o watcher). */
	pastasAbertas(): Array<{ perfil: string; pasta: string }> {
		const saida: Array<{ perfil: string; pasta: string }> = [];
		for (const entrada of this.entradas.values()) {
			if (entrada.janela.estado) saida.push({ perfil: entrada.perfil, pasta: entrada.janela.perfil.pasta });
		}
		return saida;
	}

	/**
	 * Abre o perfil para a conexão. A primeira abre a janela (com a sessão
	 * pedida ou uma nova); as outras entram na conversa que está aberta. Se uma
	 * conexão pede outra sessão ou outro agente, a troca vale para todas.
	 * Manda "carregando" enquanto a sessão monta e o "historico" no fim.
	 */
	async abrirPerfil(conexao: Conexao, pedido: { perfil: string; sessaoId?: string; agente?: string }): Promise<EstadoSessao> {
		const entrada = await this.entrada(pedido.perfil);
		entrada.conexoes.add(conexao);
		const { janela, perfil } = entrada;

		if (!entrada.inicio) {
			conexao.enviar({ tipo: "carregando", perfil, mensagem: "Montando a sessão do perfil..." });
			const inicio = janela.iniciar({
				...(pedido.sessaoId ? { sessaoId: pedido.sessaoId } : {}),
				...(pedido.agente ? { agente: pedido.agente } : {}),
			});
			entrada.inicio = inicio;
			try {
				const estado = await inicio;
				this.log.info(`[${perfil}] sessão ${estado.sessaoId} aberta (agente ${estado.agente}, modelo ${estado.modelo ?? "padrão"})`);
				this.transmitir(perfil, { tipo: "historico", perfil, itens: janela.historico() });
				return estado;
			} catch (erro) {
				// Deixa a próxima abertura tentar de novo.
				if (entrada.inicio === inicio) entrada.inicio = undefined;
				throw erro;
			}
		}

		let estado = await entrada.inicio;
		estado = janela.estado ?? estado;
		let trocou = false;
		if (pedido.sessaoId && pedido.sessaoId !== estado.sessaoId) {
			this.transmitir(perfil, { tipo: "carregando", perfil, mensagem: "Abrindo a sessão..." });
			estado = await janela.abrirSessao(pedido.sessaoId);
			trocou = true;
		}
		if (pedido.agente && pedido.agente !== estado.agente) {
			this.transmitir(perfil, { tipo: "carregando", perfil, mensagem: `Trocando para o agente ${pedido.agente}...` });
			estado = await janela.trocarAgente(pedido.agente);
			trocou = true;
		}
		if (trocou) {
			this.transmitir(perfil, { tipo: "historico", perfil, itens: janela.historico() });
		} else {
			// Entrou numa conversa já aberta: o estado e o histórico vão só para ela.
			conexao.enviar({ tipo: "evento", perfil, evento: { tipo: "estado_sessao", estado } });
			conexao.enviar({ tipo: "historico", perfil, itens: janela.historico() });
		}
		return estado;
	}

	/**
	 * Roda uma operação que remonta a sessão (abrir ou criar sessão, trocar de
	 * agente, recarregar), avisando "carregando" antes e mandando o histórico depois.
	 */
	async remontar(perfil: string, mensagem: string, operacao: (janela: JanelaDoServidor) => Promise<EstadoSessao>): Promise<EstadoSessao> {
		const janela = this.janela(perfil);
		this.transmitir(perfil, { tipo: "carregando", perfil, mensagem });
		const estado = await operacao(janela);
		this.transmitir(perfil, { tipo: "historico", perfil, itens: janela.historico() });
		return estado;
	}

	/** Recarrega o perfil (watcher ou pedido) e avisa as conexões. */
	async recarregar(perfil: string, motivo: "arquivo" | "pedido", arquivos?: string[]): Promise<EstadoSessao> {
		const estado = await this.remontar(perfil, "Recarregando o perfil...", (janela) => janela.recarregar());
		this.transmitir(perfil, { tipo: "perfil_recarregado", perfil, motivo, ...(arquivos ? { arquivos } : {}) });
		this.log.info(`[${perfil}] perfil recarregado (${motivo})${arquivos?.length ? `: ${arquivos.join(", ")}` : ""}`);
		return estado;
	}

	/** A conexão fechou: deixa de receber os eventos. A janela continua aberta. */
	sair(conexao: Conexao): void {
		for (const entrada of this.entradas.values()) entrada.conexoes.delete(conexao);
	}

	/** Descarta todas as janelas (encerramento do servidor). */
	async descartarTodas(): Promise<void> {
		const entradas = [...this.entradas.values()];
		this.entradas.clear();
		await Promise.all(
			entradas.map(async (entrada) => {
				try {
					await entrada.janela.descartar();
					this.log.info(`[${entrada.perfil}] janela descartada`);
				} catch (erro) {
					this.log.erro(`[${entrada.perfil}] erro ao descartar a janela`, erro);
				}
			}),
		);
	}
}
