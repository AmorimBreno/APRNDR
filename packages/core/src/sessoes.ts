// Sessões do pi: montagem das opções de uma sessão para (perfil, agente),
// filtros de skills e ferramentas, o registro de qual agente a sessão usa e a
// lista das sessões gravadas do perfil.
//
// Decisões, com a documentação do pi (1.2.0) que as sustenta:
// - cwd = pasta de dados do perfil e nenhum arquivo de contexto descoberto
//   (ESPECIFICACAO.md, 13.6). O DefaultResourceLoader tem a opção noContextFiles,
//   a mesma do --no-context-files do CLI (resource-loader.d.ts; no main.js do
//   CLI, parsed.noContextFiles vai direto para ela).
// - Prompt de sistema = o padrão do pi + appendSystemPrompt com o AGENTS.md do
//   perfil e o corpo do arquivo do agente. É o mesmo mecanismo do
//   --append-system-prompt do CLI; cada item é um caminho de arquivo ou texto.
// - Skills: só as do perfil (noSkills + additionalSkillPaths, como o --skill do
//   CLI) e, se o agente declara skills, só essas (skillsOverride, exemplo
//   04-skills.ts do SDK). Numa sessão filha (subagente), o agente que não
//   declara skills fica sem nenhuma.
// - Extensões: as do perfil (additionalExtensionPaths, como o -e do CLI) mais as
//   globais de ~/.pi/agent, que o loader descobre sozinho, mais as fábricas
//   inline do núcleo (extensionFactories, sdk.md "Inline extension factories").
//   As sessões filhas carregam também as extensoesSubagentes do perfil.
// - Sessões gravadas em <pasta de dados>/.sessoes-pi: o SessionManager aceita um
//   diretório próprio (exemplo 11-sessions.ts: "Custom session directory (no cwd
//   encoding)"; session-format.md e settings.md, sessionDir).
// - O agente da sessão é gravado como entrada "custom" (session-format.md,
//   CustomEntry: "Extension state persistence. Does NOT participate in LLM
//   context. Use customType to identify your extension's entries on reload").

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type CreateAgentSessionServicesOptions,
	type InlineExtension,
	type SessionEntry,
	SessionManager,
	type Skill,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostico } from "./eventos.ts";
import type { AgenteDoPerfil, Perfil } from "./perfis.ts";

/** Subpasta da pasta de dados onde ficam os arquivos de sessão do pi. */
export const PASTA_SESSOES = ".sessoes-pi";

/** Subpasta de PASTA_SESSOES com as sessões filhas (subagentes); fica fora da lista de sessões. */
export const PASTA_SUBAGENTES = "subagentes";

/** customType da entrada de sessão que diz qual agente a sessão usa. */
export const TIPO_ENTRADA_AGENTE = "nucleo.agente";

/** customType da entrada que liga uma sessão filha à sessão e à chamada subagent que a criaram. */
export const TIPO_ENTRADA_SUBAGENTE = "nucleo.subagente";

/**
 * Sessão principal (a da janela, com as extensões do núcleo) ou sessão filha
 * de um subagente (sem as extensões do núcleo, com as extensoesSubagentes do
 * perfil e só os recursos que o agente declara).
 */
export type ModoSessao = "principal" | "subagente";

/** O que fazer quando o agente não declara skills ou ferramentas. */
export type SemDeclaracao = "todas" | "nenhuma";

/** O que o núcleo sabe na hora de montar uma sessão. */
export interface ContextoMontagem {
	perfil: Perfil;
	agente: AgenteDoPerfil;
}

/**
 * Ponto de extensão do núcleo: devolve as extensões inline (fábricas do pi) que
 * entram em toda sessão, além das do perfil e das globais. É chamado a cada
 * montagem de sessão (iniciar, abrir, nova, troca de agente, recarregar).
 */
export type FabricaExtensoesNucleo = (contexto: ContextoMontagem) => InlineExtension[];

/** Opções do DefaultResourceLoader que o núcleo controla (sem cwd, agentDir e settings). */
export type OpcoesRecursos = NonNullable<CreateAgentSessionServicesOptions["resourceLoaderOptions"]>;

/** Uma sessão gravada do perfil, para o histórico. */
export interface ResumoSessao {
	id: string;
	arquivo: string;
	/** Datas em ISO 8601. */
	criadaEm: string;
	modificadaEm: string;
	/** Nome da sessão, se tiver; senão o começo da primeira mensagem do usuário. */
	titulo: string;
	/** Agente gravado na sessão (o último, se houve troca). */
	agente?: string;
	mensagens: number;
}

export class ErroSessao extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroSessao";
	}
}

const LIMITE_TITULO = 80;

/** Pasta dos arquivos de sessão do perfil. */
export function pastaSessoes(perfil: Pick<Perfil, "pastaDados">): string {
	return join(perfil.pastaDados, PASTA_SESSOES);
}

/** Pasta dos arquivos das sessões filhas (subagentes) do perfil. */
export function pastaSubagentes(perfil: Pick<Perfil, "pastaDados">): string {
	return join(pastaSessoes(perfil), PASTA_SUBAGENTES);
}

/** Cria a pasta de dados e a de sessões, se ainda não existirem. */
export async function garantirPastas(perfil: Pick<Perfil, "pastaDados">): Promise<void> {
	await mkdir(pastaSessoes(perfil), { recursive: true });
}

/** Acha o agente pelo nome. Lança ErroSessao com os nomes válidos. */
export function acharAgente(perfil: Perfil, nome: string): AgenteDoPerfil {
	const agente = perfil.agentes.find((item) => item.nome === nome);
	if (!agente) {
		const nomes = perfil.agentes.map((item) => item.nome).join(", ");
		throw new ErroSessao(`O perfil ${perfil.id} não tem o agente "${nome}". Agentes: ${nomes}.`);
	}
	return agente;
}

/** Acrescenta um diagnóstico sem repetir um igual. */
export function adicionarDiagnostico(lista: Diagnostico[], diagnostico: Diagnostico): void {
	if (!lista.some((item) => item.nivel === diagnostico.nivel && item.mensagem === diagnostico.mensagem)) {
		lista.push(diagnostico);
	}
}

/**
 * Skills do agente: se ele declara skills, só essas (pelo nome do SKILL.md);
 * se não declara, todas (ou nenhuma, com semDeclaracao "nenhuma").
 * `faltando` = nomes declarados que não foram achados.
 */
export function filtrarSkills(
	skills: Skill[],
	declaradas: readonly string[],
	semDeclaracao: SemDeclaracao = "todas",
): { skills: Skill[]; faltando: string[] } {
	if (declaradas.length === 0) return { skills: semDeclaracao === "todas" ? skills : [], faltando: [] };
	return {
		skills: skills.filter((skill) => declaradas.includes(skill.name)),
		faltando: declaradas.filter((nome) => !skills.some((skill) => skill.name === nome)),
	};
}

/**
 * Ferramentas do agente: se ele declara ferramentas, ativa só as que existem
 * na sessão; se não declara, `ativas` fica indefinido e valem as do pi (as
 * padrão mais as das extensões), ou fica vazio com semDeclaracao "nenhuma".
 * `faltando` = declaradas que não existem.
 */
export function filtrarFerramentas(
	disponiveis: readonly string[],
	declaradas: readonly string[],
	semDeclaracao: SemDeclaracao = "todas",
): { ativas?: string[]; faltando: string[] } {
	if (declaradas.length === 0) return semDeclaracao === "todas" ? { faltando: [] } : { ativas: [], faltando: [] };
	return {
		ativas: declaradas.filter((nome) => disponiveis.includes(nome)),
		faltando: declaradas.filter((nome) => !disponiveis.includes(nome)),
	};
}

/** Na sessão principal valem todas as skills e ferramentas sem declaração; na filha, nenhuma. */
export function semDeclaracaoDo(modo: ModoSessao): SemDeclaracao {
	return modo === "principal" ? "todas" : "nenhuma";
}

/**
 * Opções do DefaultResourceLoader para (perfil, agente). Os avisos de skills
 * declaradas e não achadas vão para `diagnosticos` quando o loader roda.
 */
export function montarOpcoesRecursos(
	perfil: Perfil,
	agente: AgenteDoPerfil,
	extensoesNucleo: InlineExtension[],
	diagnosticos: Diagnostico[],
	modo: ModoSessao = "principal",
): OpcoesRecursos {
	return {
		additionalExtensionPaths: modo === "principal" ? [...perfil.extensoes] : [...perfil.extensoes, ...perfil.extensoesSubagentes],
		additionalSkillPaths: [...perfil.skills],
		// Só as skills do perfil: nada de ~/.pi/agent/skills nem de .pi/skills.
		noSkills: true,
		// Nenhum AGENTS.md ou CLAUDE.md descoberto no cwd e acima.
		noContextFiles: true,
		// Caminho do AGENTS.md do perfil (o loader lê o arquivo) e o prompt do agente (texto).
		appendSystemPrompt: [perfil.instrucoes, agente.definicao.prompt].filter((parte) => parte.trim().length > 0),
		extensionFactories: extensoesNucleo,
		skillsOverride: (base) => {
			const { skills, faltando } = filtrarSkills(base.skills, agente.definicao.skills, semDeclaracaoDo(modo));
			for (const nome of faltando) {
				adicionarDiagnostico(diagnosticos, {
					nivel: "aviso",
					mensagem: `skill "${nome}" do agente ${agente.nome} não existe no perfil ${perfil.id}; ignorada`,
				});
			}
			return { skills, diagnostics: base.diagnostics };
		},
	};
}

function nomeDaEntradaAgente(entrada: { type?: unknown; customType?: unknown; data?: unknown }): string | undefined {
	if (entrada.type !== "custom" || entrada.customType !== TIPO_ENTRADA_AGENTE) return undefined;
	const dados = entrada.data as { agente?: unknown } | undefined;
	return typeof dados?.agente === "string" ? dados.agente : undefined;
}

/** Agente gravado num caminho de entradas da sessão (o último vale). */
export function agenteGravado(entradas: readonly SessionEntry[]): string | undefined {
	let agente: string | undefined;
	for (const entrada of entradas) agente = nomeDaEntradaAgente(entrada) ?? agente;
	return agente;
}

/** Agente gravado num arquivo de sessão, lendo o JSONL sem abrir a sessão. */
export async function lerAgenteDoArquivo(arquivo: string): Promise<string | undefined> {
	let texto: string;
	try {
		texto = await readFile(arquivo, "utf8");
	} catch {
		return undefined;
	}
	let agente: string | undefined;
	for (const linha of texto.split("\n")) {
		if (!linha.includes(TIPO_ENTRADA_AGENTE)) continue;
		try {
			agente = nomeDaEntradaAgente(JSON.parse(linha)) ?? agente;
		} catch {
			// Linha incompleta (por exemplo, gravação em andamento): ignora.
		}
	}
	return agente;
}

/** Acha o arquivo de uma sessão do perfil pelo id. */
export function acharArquivoSessao(perfil: Pick<Perfil, "pastaDados">, id: string): string | undefined {
	return SessionManager.findById(perfil.pastaDados, id, pastaSessoes(perfil));
}

/** Sessões gravadas do perfil, da mais recente para a mais antiga. */
export async function listarSessoes(perfil: Pick<Perfil, "pastaDados">): Promise<ResumoSessao[]> {
	const infos = await SessionManager.list(perfil.pastaDados, pastaSessoes(perfil));
	return Promise.all(
		infos.map(async (info) => {
			const primeira = info.firstMessage.replace(/\s+/g, " ").trim();
			const titulo =
				info.name ?? (primeira.length > LIMITE_TITULO ? `${primeira.slice(0, LIMITE_TITULO - 1)}…` : primeira);
			const agente = await lerAgenteDoArquivo(info.path);
			return {
				id: info.id,
				arquivo: info.path,
				criadaEm: info.created.toISOString(),
				modificadaEm: info.modified.toISOString(),
				titulo: titulo || "(sem mensagens)",
				...(agente ? { agente } : {}),
				mensagens: info.messageCount,
			};
		}),
	);
}
