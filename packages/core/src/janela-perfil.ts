// Janela de perfil: a API de alto nível do núcleo. Cada janela de perfil do
// app tem uma JanelaPerfil, que mantém uma sessão do pi por vez (criada pelo
// SDK), traduz os eventos dela para EventoNucleo e cuida do histórico, da troca
// de agente e de modelo e do recarregamento.
//
// Troca de agente no meio da conversa: o pi permite fazer de forma limpa. O
// transcript guarda o prompt de sistema e as ferramentas como mensagens de
// sistema que fazem patch das seções, e as mudanças entram antes da próxima
// requisição (session-format.md, SessionMessageEntry: "later changes persist as
// system messages that patch sections by name ... and list
// toolsAdded/toolsRemoved"; extensions.md: "Pi records the initial prompt and
// tool set in the transcript's first system message, then appends tool and
// prompt changes before the next model request"). O modelo também troca no
// meio da sessão (model_change). Por isso trocar de agente continua a mesma
// conversa: a sessão é remontada sobre o mesmo arquivo com o prompt, as skills,
// as ferramentas e o modelo do novo agente, e a troca fica gravada numa entrada
// "custom". Remontar (em vez de mexer na sessão aberta) é o mesmo caminho do
// recarregar: as opções do DefaultResourceLoader (append, skills) são fixas por
// instância, e o loader as relê do disco.
//
// Substituição de sessão: segue o teardown do AgentSessionRuntime do pi
// (abort, evento session_shutdown para as extensões, dispose), com uma
// diferença: a sessão nova é montada antes de descartar a antiga. Se a montagem
// falhar, a antiga continua valendo (só a resposta em andamento foi abortada).
//
// Extensões do núcleo em toda sessão principal: a ponte de eventos (ponte.ts,
// com responder e acaoDaInterface aqui) e a ferramenta subagent
// (subagentes.ts), além das que vierem em opcoes.extensoesNucleo. As sessões
// filhas dos subagentes não recebem nenhuma delas.

import { existsSync } from "node:fs";
import {
	type AgentSession,
	getAgentDir,
	type ModelRuntime,
	type SessionStartEvent,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
	converterHistorico,
	criarTradutorEventos,
	type Diagnostico,
	type EstadoSessao,
	type EventoNucleo,
	type ItemHistorico,
} from "./eventos.ts";
import {
	criarRegistroModelos,
	type InfoModelo,
	interpretarRaciocinio,
	listarModelosDisponiveis,
	type ModeloPi,
	type NivelRaciocinio,
	nomeDoModelo,
	resolverModelo,
} from "./modelos.ts";
import { criarSessaoPi, encerrarSessaoPi, ligarSessaoPi } from "./montagem.ts";
import { type AgenteDoPerfil, lerPerfil, type Perfil } from "./perfis.ts";
import { PonteSessao } from "./ponte.ts";
import {
	acharAgente,
	acharArquivoSessao,
	adicionarDiagnostico,
	agenteGravado,
	ErroSessao,
	type FabricaExtensoesNucleo,
	garantirPastas,
	listarSessoes,
	montarOpcoesRecursos,
	pastaSessoes,
	type ResumoSessao,
	TIPO_ENTRADA_AGENTE,
} from "./sessoes.ts";
import { criarExtensaoSubagente } from "./subagentes.ts";

export interface OpcoesJanelaPerfil {
	/**
	 * Extensões inline a mais em toda sessão principal, além das do próprio
	 * núcleo (ponte de eventos e subagent). Não entram nas sessões filhas.
	 */
	extensoesNucleo?: FabricaExtensoesNucleo;
	/** Pasta global do pi. Padrão: ~/.pi/agent (ou PI_CODING_AGENT_DIR). */
	pastaPi?: string;
	/** Registro de modelos do pi já criado, para compartilhar entre janelas. */
	registroModelos?: ModelRuntime;
}

/**
 * Modelo da sessão montada: "sessao" = o gravado na sessão (o pi restaura; se
 * não estiver disponível, vale o do agente); ou um modelo e nível explícitos
 * (indefinido = o padrão do settings.json do pi).
 */
type EscolhaModelo = "sessao" | { modelo?: ModeloPi; raciocinio?: NivelRaciocinio };

interface PedidoMontagem {
	/** Agente pedido. Sem ele: o gravado na sessão ou o padrão do perfil. */
	agente?: string;
	modelo: EscolhaModelo;
	/** Recarrega o código das extensões do disco (o pi guarda as fábricas em cache). */
	relerCodigo?: boolean;
}

/** Motivo da troca de sessão, no vocabulário dos eventos session_start/session_shutdown do pi. */
type MotivoTroca = Extract<SessionStartEvent["reason"], "startup" | "reload" | "new" | "resume">;

function mensagemDe(erro: unknown): string {
	return erro instanceof Error ? erro.message : String(erro);
}

export class JanelaPerfil {
	private perfilAtual: Perfil;
	private readonly pastaPi: string;
	private readonly fabricaExtensoes?: FabricaExtensoesNucleo;
	private registro?: ModelRuntime;
	private sessao?: AgentSession;
	private agenteAtual?: AgenteDoPerfil;
	/** Ponte de eventos da sessão atual. */
	private ponte?: PonteSessao;
	private diagnosticos: Diagnostico[] = [];
	private estadoAtual?: EstadoSessao;
	private readonly ouvintes = new Set<(evento: EventoNucleo) => void>();
	private cancelarAssinatura?: () => void;
	/** Operações que trocam ou mudam a sessão rodam uma de cada vez, nesta ordem. */
	private fila: Promise<unknown> = Promise.resolve();
	/** Promessa do prompt() em andamento (resolve quando a execução termina). */
	private execucao?: Promise<void>;
	/** true entre chamar prompt() e o pi começar a execução. */
	private iniciando = false;

	constructor(perfil: Perfil, opcoes: OpcoesJanelaPerfil = {}) {
		this.perfilAtual = perfil;
		this.pastaPi = opcoes.pastaPi ?? getAgentDir();
		this.fabricaExtensoes = opcoes.extensoesNucleo;
		this.registro = opcoes.registroModelos;
	}

	/** Perfil em uso (relido do disco em recarregar). */
	get perfil(): Perfil {
		return this.perfilAtual;
	}

	/** Sessão, agente, modelo e recursos ativos. Indefinido antes de iniciar. */
	get estado(): EstadoSessao | undefined {
		return this.estadoAtual;
	}

	/** Prompt de sistema efetivo da sessão (o que vai para o modelo). */
	get promptSistema(): string | undefined {
		return this.sessao?.systemPrompt;
	}

	/** true enquanto a sessão responde. */
	get respondendo(): boolean {
		return this.iniciando || (this.sessao?.isStreaming ?? false);
	}

	/** Sessão do pi por baixo, para o próprio núcleo e o servidor. Muda a cada troca. */
	get sessaoPi(): AgentSession | undefined {
		return this.sessao;
	}

	/** Recebe os eventos da janela. Devolve a função que cancela a assinatura. */
	assinar(ouvinte: (evento: EventoNucleo) => void): () => void {
		this.ouvintes.add(ouvinte);
		return () => this.ouvintes.delete(ouvinte);
	}

	/**
	 * Abre a janela: com `sessaoId`, continua essa sessão gravada; sem ele, cria
	 * uma sessão nova. `agente` padrão: o gravado na sessão ou o padrão do perfil.
	 */
	iniciar(opcoes: { agente?: string; sessaoId?: string } = {}): Promise<EstadoSessao> {
		return this.emOrdem(async () => {
			const perfil = this.perfilAtual;
			await garantirPastas(perfil);
			const motivoSemSessao: MotivoTroca = "startup";
			if (opcoes.sessaoId) {
				const gerente = this.abrirGerente(opcoes.sessaoId);
				const gravado = agenteGravado(gerente.getBranch());
				const pedido: PedidoMontagem =
					opcoes.agente && opcoes.agente !== gravado
						? await this.pedidoComAgente(opcoes.agente)
						: { modelo: "sessao" };
				return this.trocarSessao(gerente, pedido, this.sessao ? "resume" : motivoSemSessao);
			}
			const pedido = await this.pedidoComAgente(opcoes.agente ?? perfil.agentePadrao);
			const gerente = SessionManager.create(perfil.pastaDados, pastaSessoes(perfil));
			return this.trocarSessao(gerente, pedido, this.sessao ? "new" : motivoSemSessao);
		});
	}

	/**
	 * Envia uma mensagem do usuário. Se a sessão já está respondendo, a mensagem
	 * entra na fila como follow-up (o pi a entrega quando a execução atual
	 * termina). Não espera a resposta: ela chega pelos eventos. Erros também
	 * viram eventos ("erro"), nunca uma promessa rejeitada solta.
	 */
	enviar(texto: string): Promise<"iniciada" | "enfileirada"> {
		return this.emOrdem(async () => {
			const sessao = this.exigirSessao();
			if (this.iniciando || sessao.isStreaming) {
				await sessao.followUp(texto);
				return "enfileirada";
			}
			this.iniciando = true;
			const execucao: Promise<void> = sessao
				.prompt(texto)
				.catch((erro: unknown) => this.emitir({ tipo: "erro", origem: "nucleo", mensagem: mensagemDe(erro) }))
				.finally(() => {
					if (this.execucao === execucao) {
						this.execucao = undefined;
						this.iniciando = false;
					}
				});
			this.execucao = execucao;
			return "iniciada";
		});
	}

	/** Espera a resposta em andamento (e a fila dela) terminar. */
	async aguardarOcioso(): Promise<void> {
		await this.fila;
		await this.execucao;
		await this.sessao?.waitForIdle();
	}

	/**
	 * Interrompe a resposta em andamento e esvazia a fila de follow-ups.
	 * Devolve as mensagens que estavam na fila (para a interface devolvê-las ao campo de texto).
	 */
	async abortar(): Promise<string[]> {
		const sessao = this.sessao;
		if (!sessao) return [];
		const fila = sessao.clearQueue();
		// Antes do abort: uma ferramenta que espera a interface recebe o
		// cancelamento e pode terminar (o abort espera a sessão ficar ociosa).
		this.ponte?.cancelarPendentes("abortado");
		await sessao.abort();
		return [...fila.steering, ...fila.followUp];
	}

	/**
	 * Responde a um pedido da interface (EventoNucleo "pedido_interface"): a
	 * ferramenta que espera recebe "interface:resposta" {id, dados}. Devolve
	 * false se o pedido não existe ou não espera mais resposta.
	 */
	responder(id: string, dados: unknown): boolean {
		return this.ponte?.responder(id, dados) ?? false;
	}

	/**
	 * Ação feita na interface (por exemplo, um botão de um painel): emite
	 * "interface:acao" {painel, acao, dados} para a extensão do perfil reagir.
	 */
	acaoDaInterface(painel: string, acao: string, dados?: unknown): void {
		this.exigirSessao();
		if (!this.ponte) throw new ErroSessao("A sessão desta janela não tem a ponte de eventos.");
		this.ponte.acaoDaInterface(painel, acao, dados);
	}

	/** Troca o modelo da sessão aberta. Vale a partir da próxima requisição ao modelo. */
	trocarModelo(nome: string): Promise<EstadoSessao> {
		return this.emOrdem(async () => {
			const sessao = this.exigirSessao();
			const modelo = resolverModelo(await this.obterRegistro(), nome);
			await sessao.setModel(modelo);
			return this.atualizarEstado();
		});
	}

	/**
	 * Troca o agente e continua a mesma conversa: prompt do agente, skills,
	 * ferramentas, modelo e raciocínio do novo agente valem a partir da próxima
	 * mensagem. Não interrompe uma resposta em andamento: espera ela terminar
	 * (chame abortar() antes para interromper).
	 */
	trocarAgente(nome: string): Promise<EstadoSessao> {
		return this.emOrdem(async () => {
			const sessao = this.exigirSessao();
			const pedido = await this.pedidoComAgente(nome);
			await sessao.waitForIdle();
			return this.trocarSessao(this.gerenteDaSessaoAtual(), pedido, "reload");
		});
	}

	/** Sessões gravadas do perfil, da mais recente para a mais antiga. */
	listarSessoes(): Promise<ResumoSessao[]> {
		return listarSessoes(this.perfilAtual);
	}

	/** Abre uma sessão gravada (com o agente e o modelo dela). Interrompe a resposta em andamento. */
	abrirSessao(id: string): Promise<EstadoSessao> {
		return this.emOrdem(async () => {
			const gerente = this.abrirGerente(id);
			return this.trocarSessao(gerente, { modelo: "sessao" }, "resume");
		});
	}

	/** Começa uma sessão nova. Agente padrão: o atual. Interrompe a resposta em andamento. */
	novaSessao(agente?: string): Promise<EstadoSessao> {
		return this.emOrdem(async () => {
			const perfil = this.perfilAtual;
			await garantirPastas(perfil);
			const pedido = await this.pedidoComAgente(agente ?? this.agenteAtual?.nome ?? perfil.agentePadrao);
			const gerente = SessionManager.create(perfil.pastaDados, pastaSessoes(perfil));
			return this.trocarSessao(gerente, pedido, this.sessao ? "new" : "startup");
		});
	}

	/**
	 * Relê do disco o profile.json, os agentes, as skills, o AGENTS.md do perfil
	 * e o código das extensões, e remonta a sessão atual sobre o mesmo arquivo,
	 * mantendo a conversa, o agente e o modelo. Interrompe a resposta em andamento.
	 */
	recarregar(): Promise<EstadoSessao> {
		return this.emOrdem(async () => {
			const sessao = this.exigirSessao();
			const anterior = this.perfilAtual;
			const perfil = await lerPerfil(anterior.pasta);
			const agente = perfil.agentes.some((item) => item.nome === this.agenteAtual?.nome)
				? this.agenteAtual?.nome
				: perfil.agentePadrao;
			const pedido: PedidoMontagem = {
				agente,
				modelo: { modelo: sessao.model, raciocinio: sessao.thinkingLevel },
				relerCodigo: true,
			};
			this.perfilAtual = perfil;
			try {
				await garantirPastas(perfil);
				const gerente =
					perfil.pastaDados === anterior.pastaDados
						? this.gerenteDaSessaoAtual()
						: SessionManager.create(perfil.pastaDados, pastaSessoes(perfil));
				return await this.trocarSessao(gerente, pedido, "reload");
			} catch (erro) {
				this.perfilAtual = anterior;
				throw erro;
			}
		});
	}

	/** Modelos que o pi tem com as credenciais configuradas, para o seletor. */
	async modelosDisponiveis(): Promise<InfoModelo[]> {
		return listarModelosDisponiveis(await this.obterRegistro());
	}

	/** Conversa da sessão aberta (ramo ativo), no formato genérico. */
	historico(): ItemHistorico[] {
		return this.sessao ? converterHistorico(this.sessao.messages) : [];
	}

	/** Encerra a janela: interrompe a resposta, avisa as extensões e descarta a sessão. */
	async descartar(): Promise<void> {
		this.ponte?.cancelarPendentes("sessao_encerrada");
		await this.sessao?.abort();
		await this.emOrdem(async () => {
			const sessao = this.sessao;
			this.sessao = undefined;
			this.estadoAtual = undefined;
			this.ponte?.encerrar("sessao_encerrada");
			this.ponte = undefined;
			this.cancelarAssinatura?.();
			this.cancelarAssinatura = undefined;
			if (sessao) await encerrarSessaoPi(sessao, "quit");
		});
		this.ouvintes.clear();
	}

	// ---------------------------------------------------------------------------

	private emOrdem<T>(operacao: () => Promise<T>): Promise<T> {
		const resultado = this.fila.then(operacao);
		this.fila = resultado.catch(() => undefined);
		return resultado;
	}

	private emitir(evento: EventoNucleo): void {
		if (evento.tipo === "execucao_inicio") this.iniciando = false;
		for (const ouvinte of this.ouvintes) {
			try {
				ouvinte(evento);
			} catch {
				// Um ouvinte com erro não pode derrubar a sessão nem os outros ouvintes.
			}
		}
	}

	private exigirSessao(): AgentSession {
		if (!this.sessao) throw new ErroSessao(`A janela do perfil ${this.perfilAtual.id} não tem sessão; chame iniciar().`);
		return this.sessao;
	}

	private async obterRegistro(): Promise<ModelRuntime> {
		this.registro ??= await criarRegistroModelos(this.pastaPi);
		return this.registro;
	}

	/** Modelo e raciocínio do agente, validados antes de mexer na sessão. */
	private async pedidoComAgente(nome: string): Promise<PedidoMontagem> {
		const agente = acharAgente(this.perfilAtual, nome);
		const registro = await this.obterRegistro();
		return {
			agente: agente.nome,
			modelo: {
				modelo: agente.modelo ? resolverModelo(registro, agente.modelo) : undefined,
				raciocinio: interpretarRaciocinio(agente.definicao.raciocinio).nivel,
			},
		};
	}

	private abrirGerente(id: string): SessionManager {
		const arquivo = acharArquivoSessao(this.perfilAtual, id);
		if (!arquivo) throw new ErroSessao(`Sessão ${id} não encontrada em ${pastaSessoes(this.perfilAtual)}.`);
		return SessionManager.open(arquivo, pastaSessoes(this.perfilAtual));
	}

	/**
	 * Gerente para remontar a sessão atual. O arquivo só existe depois da
	 * primeira mensagem; uma sessão ainda vazia vira uma sessão nova.
	 */
	private gerenteDaSessaoAtual(): SessionManager {
		const perfil = this.perfilAtual;
		const arquivo = this.sessao?.sessionFile;
		if (arquivo && existsSync(arquivo)) return SessionManager.open(arquivo, pastaSessoes(perfil));
		return SessionManager.create(perfil.pastaDados, pastaSessoes(perfil));
	}

	/** Monta a sessão nova e só então descarta a antiga. */
	private async trocarSessao(gerente: SessionManager, pedido: PedidoMontagem, motivo: MotivoTroca): Promise<EstadoSessao> {
		const antiga = this.sessao;
		// Aborta primeiro para a resposta interrompida ficar gravada antes de o
		// arquivo ser relido. Os pedidos da interface são cancelados antes, para
		// nenhuma ferramenta segurar o abort esperando o usuário.
		this.ponte?.cancelarPendentes("sessao_encerrada");
		if (antiga) await antiga.abort();
		const anterior = antiga?.sessionFile;
		const inicio: SessionStartEvent =
			(motivo === "new" || motivo === "resume") && anterior
				? { type: "session_start", reason: motivo, previousSessionFile: anterior }
				: { type: "session_start", reason: motivo };

		const montada = await this.montarSessao(gerente, pedido, inicio);

		if (antiga) {
			this.cancelarAssinatura?.();
			this.cancelarAssinatura = undefined;
			this.ponte?.encerrar("sessao_encerrada");
			try {
				await encerrarSessaoPi(antiga, motivo === "startup" ? "quit" : motivo, gerente.getSessionFile());
			} catch (erro) {
				this.emitir({ tipo: "erro", origem: "extensao", mensagem: `ao encerrar a sessão anterior: ${mensagemDe(erro)}` });
			}
		}
		this.sessao = montada.sessao;
		this.ponte = montada.ponte;
		this.agenteAtual = montada.agente;
		this.diagnosticos = montada.diagnosticos;
		this.execucao = undefined;
		this.iniciando = false;
		await this.vincular(montada.sessao, montada.agente, montada.ponte);
		const estado = this.atualizarEstado();
		for (const diagnostico of this.diagnosticos) this.emitir({ tipo: "diagnostico", ...diagnostico });
		return estado;
	}

	/** Cria a sessão do pi para o pedido. Não mexe no estado da janela. */
	private async montarSessao(
		gerente: SessionManager,
		pedido: PedidoMontagem,
		inicio: SessionStartEvent,
	): Promise<{ sessao: AgentSession; agente: AgenteDoPerfil; diagnosticos: Diagnostico[]; ponte: PonteSessao }> {
		const perfil = this.perfilAtual;
		const diagnosticos: Diagnostico[] = [];
		const registro = await this.obterRegistro();

		const gravado = agenteGravado(gerente.getBranch());
		const nome = pedido.agente ?? gravado ?? perfil.agentePadrao;
		let agente = perfil.agentes.find((item) => item.nome === nome);
		if (!agente) {
			adicionarDiagnostico(diagnosticos, {
				nivel: "aviso",
				mensagem: `o agente "${nome}" gravado na sessão não existe mais no perfil; usando ${perfil.agentePadrao}`,
			});
			agente = acharAgente(perfil, perfil.agentePadrao);
		}

		const escolha = this.escolherModelo(pedido.modelo, agente, gerente, registro, diagnosticos);

		const ponte = new PonteSessao((evento) => this.emitir(evento));
		const extensoesNucleo = [
			ponte.extensao,
			criarExtensaoSubagente({
				perfil,
				pastaPi: this.pastaPi,
				registro,
				agentePrincipal: agente.nome,
				emitir: (evento) => this.emitir(evento),
			}),
			...(this.fabricaExtensoes?.({ perfil, agente }) ?? []),
		];
		const sessao = await criarSessaoPi({
			perfil,
			agente,
			modo: "principal",
			pastaPi: this.pastaPi,
			registro,
			gerente,
			inicio,
			modelo: escolha.modelo,
			raciocinio: escolha.raciocinio,
			extensoesNucleo,
			relerCodigo: pedido.relerCodigo,
			diagnosticos,
		});

		// O createAgentSession só grava modelo e raciocínio numa sessão nova. Numa
		// sessão com conversa, a escolha explícita (troca de agente, recarregar) é
		// gravada aqui, para voltar ao reabrir a sessão (o pi restaura o último
		// model_change ou o modelo da última resposta, e o último thinking_level_change).
		const gravadoNaSessao = gerente.buildSessionContext();
		if (gravadoNaSessao.messages.length > 0) {
			const modelo = sessao.model;
			const salvo = gravadoNaSessao.model;
			if (escolha.modelo && modelo && (salvo?.provider !== modelo.provider || salvo?.modelId !== modelo.id)) {
				gerente.appendModelChange(modelo.provider, modelo.id);
			}
			if (escolha.raciocinio !== undefined && gravadoNaSessao.thinkingLevel !== sessao.thinkingLevel) {
				gerente.appendThinkingLevelChange(sessao.thinkingLevel);
			}
		}
		if (gravado !== agente.nome) gerente.appendCustomEntry(TIPO_ENTRADA_AGENTE, { agente: agente.nome });
		return { sessao, agente, diagnosticos, ponte };
	}

	private escolherModelo(
		escolha: EscolhaModelo,
		agente: AgenteDoPerfil,
		gerente: SessionManager,
		registro: ModelRuntime,
		diagnosticos: Diagnostico[],
	): { modelo?: ModeloPi; raciocinio?: NivelRaciocinio } {
		if (escolha !== "sessao") return escolha;
		const contexto = gerente.buildSessionContext();
		const salvo = contexto.model;
		if (contexto.messages.length > 0 && salvo) {
			if (registro.getModel(salvo.provider, salvo.modelId) && registro.hasConfiguredAuth(salvo.provider)) {
				// O pi restaura o modelo e o raciocínio gravados na sessão.
				return {};
			}
			adicionarDiagnostico(diagnosticos, {
				nivel: "aviso",
				mensagem: `o modelo da sessão (${salvo.provider}/${salvo.modelId}) não está disponível; usando o do agente ${agente.nome}`,
			});
		}
		const raciocinio = interpretarRaciocinio(agente.definicao.raciocinio).nivel;
		if (!agente.modelo) return { raciocinio };
		try {
			return { modelo: resolverModelo(registro, agente.modelo), raciocinio };
		} catch (erro) {
			adicionarDiagnostico(diagnosticos, { nivel: "erro", mensagem: `${mensagemDe(erro)} Usando o modelo padrão do pi.` });
			return { raciocinio };
		}
	}

	/** Assina os eventos da sessão nova, liga as extensões e aplica as ferramentas do agente. */
	private async vincular(sessao: AgentSession, agente: AgenteDoPerfil, ponte: PonteSessao): Promise<void> {
		const traduzir = criarTradutorEventos();
		this.cancelarAssinatura = sessao.subscribe((evento) => {
			for (const traduzido of traduzir(evento)) {
				// A execução acabou: nenhuma ferramenta espera mais a interface.
				if (traduzido.tipo === "execucao_fim") ponte.cancelarPendentes("execucao_terminada");
				this.emitir(traduzido);
			}
		});
		await ligarSessaoPi(sessao, agente, "principal", this.diagnosticos, (mensagem) =>
			this.emitir({ tipo: "erro", origem: "extensao", mensagem }),
		);
	}

	private atualizarEstado(): EstadoSessao {
		const sessao = this.exigirSessao();
		const estado: EstadoSessao = {
			perfil: this.perfilAtual.id,
			sessaoId: sessao.sessionId,
			...(sessao.sessionFile ? { arquivo: sessao.sessionFile } : {}),
			agente: this.agenteAtual?.nome ?? this.perfilAtual.agentePadrao,
			...(sessao.model ? { modelo: nomeDoModelo(sessao.model) } : {}),
			raciocinio: sessao.thinkingLevel,
			ferramentas: sessao.getActiveToolNames(),
			skills: sessao.resourceLoader.getSkills().skills.map((skill) => skill.name),
			diagnosticos: [...this.diagnosticos],
		};
		this.estadoAtual = estado;
		this.emitir({ tipo: "estado_sessao", estado });
		return estado;
	}
}
