// Montagem de uma sessão do pi para (perfil, agente): o caminho comum da sessão
// principal (JanelaPerfil) e das sessões filhas (ferramenta subagent). Os
// recursos vêm de montarOpcoesRecursos (sessoes.ts); aqui ficam a criação pelo
// SDK, a coleta dos diagnósticos, a ligação das extensões com o filtro de
// ferramentas do agente e o encerramento.
//
// Decisões, com a documentação do pi (1.2.0):
// - cwd = pasta de dados e SettingsManager sem confiança no projeto: a pasta de
//   dados não é um projeto, então nada de .pi/ local.
// - bindExtensions emite session_start para as extensões (sdk.md: o MCP, por
//   exemplo, conecta nesse evento). O filtro de ferramentas vem depois, porque
//   uma extensão pode registrar ferramentas no session_start.
// - Encerrar segue o teardown do AgentSessionRuntime do pi: abort, evento
//   session_shutdown para as extensões, dispose.

import {
	type AgentSession,
	createAgentSessionFromServices,
	createAgentSessionServices,
	type InlineExtension,
	type ModelRuntime,
	type SessionManager,
	type SessionStartEvent,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostico } from "./eventos.ts";
import { interpretarRaciocinio, type ModeloPi, type NivelRaciocinio } from "./modelos.ts";
import type { AgenteDoPerfil, Perfil } from "./perfis.ts";
import { adicionarDiagnostico, filtrarFerramentas, type ModoSessao, montarOpcoesRecursos, semDeclaracaoDo } from "./sessoes.ts";

export interface PedidoSessaoPi {
	perfil: Perfil;
	agente: AgenteDoPerfil;
	modo: ModoSessao;
	/** Pasta global do pi (~/.pi/agent). */
	pastaPi: string;
	registro: ModelRuntime;
	gerente: SessionManager;
	inicio: SessionStartEvent;
	/** Indefinido = o pi decide (o gravado na sessão ou o padrão do settings.json). */
	modelo?: ModeloPi;
	raciocinio?: NivelRaciocinio;
	extensoesNucleo: InlineExtension[];
	/** Recarrega o código das extensões do disco (o pi guarda as fábricas em cache). */
	relerCodigo?: boolean;
	/** Recebe os diagnósticos da montagem. */
	diagnosticos: Diagnostico[];
}

export function nivelDoPi(tipo: string): Diagnostico["nivel"] {
	if (tipo === "info") return "info";
	if (tipo === "error") return "erro";
	return "aviso";
}

/** Cria a sessão do pi pelo SDK. Não liga as extensões: chame ligarSessaoPi depois de assinar os eventos. */
export async function criarSessaoPi(pedido: PedidoSessaoPi): Promise<AgentSession> {
	const { perfil, agente, diagnosticos } = pedido;
	const avisoRaciocinio = interpretarRaciocinio(agente.definicao.raciocinio).aviso;
	if (avisoRaciocinio) adicionarDiagnostico(diagnosticos, { nivel: "aviso", mensagem: `agente ${agente.nome}: ${avisoRaciocinio}` });

	const cwd = perfil.pastaDados;
	// A pasta de dados não é um projeto: nada de .pi/ local (settings, extensões, skills).
	const settingsManager = SettingsManager.create(cwd, pedido.pastaPi, { projectTrusted: false });
	const servicos = await createAgentSessionServices({
		cwd,
		agentDir: pedido.pastaPi,
		settingsManager,
		modelRuntime: pedido.registro,
		resourceLoaderOptions: montarOpcoesRecursos(perfil, agente, pedido.extensoesNucleo, diagnosticos, pedido.modo),
	});
	// O pi guarda as fábricas das extensões em cache por caminho; um loader novo
	// reusaria o código antigo. Um segundo reload() limpa o cache e relê do disco.
	if (pedido.relerCodigo) await servicos.resourceLoader.reload();

	const criada = await createAgentSessionFromServices({
		services: servicos,
		sessionManager: pedido.gerente,
		sessionStartEvent: pedido.inicio,
		model: pedido.modelo,
		thinkingLevel: pedido.raciocinio,
	});

	for (const diagnostico of servicos.diagnostics) {
		adicionarDiagnostico(diagnosticos, { nivel: nivelDoPi(diagnostico.type), mensagem: diagnostico.message });
	}
	const extensoes = servicos.resourceLoader.getExtensions();
	for (const falha of extensoes.errors) {
		adicionarDiagnostico(diagnosticos, { nivel: "erro", mensagem: `extensão ${falha.path} não carregou: ${falha.error}` });
	}
	for (const aviso of extensoes.warnings ?? []) {
		adicionarDiagnostico(diagnosticos, { nivel: "aviso", mensagem: `extensão ${aviso.path}: ${aviso.warning}` });
	}
	for (const diagnostico of servicos.resourceLoader.getSkills().diagnostics) {
		adicionarDiagnostico(diagnosticos, {
			nivel: nivelDoPi(diagnostico.type),
			mensagem: `skill${diagnostico.path ? ` ${diagnostico.path}` : ""}: ${diagnostico.message}`,
		});
	}
	if (criada.modelFallbackMessage) {
		adicionarDiagnostico(diagnosticos, { nivel: "aviso", mensagem: criada.modelFallbackMessage });
	}
	return criada.session;
}

/**
 * Liga as extensões (session_start) e aplica as ferramentas do agente. As
 * ferramentas declaradas que não existem na sessão viram diagnóstico.
 */
export async function ligarSessaoPi(
	sessao: AgentSession,
	agente: AgenteDoPerfil,
	modo: ModoSessao,
	diagnosticos: Diagnostico[],
	aoErroExtensao: (mensagem: string) => void,
): Promise<void> {
	// Sem uiContext, ctx.hasUI fica falso e ctx.mode fica "print".
	await sessao.bindExtensions({
		onError: (erro) => aoErroExtensao(`${erro.extensionPath} (${erro.event}): ${erro.error}`),
	});
	const { ativas, faltando } = filtrarFerramentas(
		sessao.getAllTools().map((ferramenta) => ferramenta.name),
		agente.definicao.ferramentas,
		semDeclaracaoDo(modo),
	);
	for (const nome of faltando) {
		adicionarDiagnostico(diagnosticos, {
			nivel: "aviso",
			mensagem: `ferramenta "${nome}" do agente ${agente.nome} não existe nesta sessão; ignorada`,
		});
	}
	if (ativas) sessao.setActiveToolsByName(ativas);
}

/** Avisa as extensões (session_shutdown) e descarta a sessão, como o pi faz ao trocar de sessão. */
export async function encerrarSessaoPi(
	sessao: AgentSession,
	motivo: "quit" | "reload" | "new" | "resume",
	arquivoDestino?: string,
): Promise<void> {
	try {
		await sessao.abort();
		if (sessao.extensionRunner.hasHandlers("session_shutdown")) {
			await sessao.extensionRunner.emit({
				type: "session_shutdown",
				reason: motivo,
				...(arquivoDestino ? { targetSessionFile: arquivoDestino } : {}),
			});
		}
	} finally {
		sessao.dispose();
	}
}
