// Teste de integração da JanelaPerfil sem rede: perfil, pasta global do pi e
// pasta de dados temporários; agentes sem modelo; nenhuma mensagem é enviada
// ao modelo. A sessão gravada é escrita à mão no formato JSONL do pi.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventoNucleo } from "./eventos.ts";
import { JanelaPerfil } from "./janela-perfil.ts";
import { lerPerfil } from "./perfis.ts";
import { pastaSessoes, TIPO_ENTRADA_AGENTE } from "./sessoes.ts";

let raiz = "";
let pastaPerfil = "";
let pastaPi = "";
let pastaDados = "";
let janela: JanelaPerfil | undefined;

async function escrever(caminho: string, texto: string): Promise<void> {
	await mkdir(join(caminho, ".."), { recursive: true });
	await writeFile(caminho, texto);
}

/** Código de uma extensão do pi que registra ferramentas vazias com esses nomes. */
function extensaoComFerramenta(...nomes: string[]): string {
	const registros = nomes.map(
		(nome) =>
			`\tpi.registerTool({ name: "${nome}", label: "${nome}", description: "teste", parameters: Type.Object({}), async execute() { return { content: [{ type: "text", text: "ok" }], details: undefined }; } });`,
	);
	return ['import { Type } from "typebox";', "export default function (pi) {", ...registros, "}", ""].join("\n");
}

beforeEach(async () => {
	raiz = await mkdtemp(join(tmpdir(), "nucleo-janela-"));
	pastaPerfil = join(raiz, "perfil");
	pastaPi = join(raiz, "pi-agent");
	pastaDados = join(raiz, "dados");
	await mkdir(pastaPi, { recursive: true });
	// Um AGENTS.md acima do cwd que não pode entrar no contexto.
	await escrever(join(raiz, "AGENTS.md"), "# Regras do projeto\nNão deve entrar.\n");
	await escrever(
		join(pastaPerfil, "profile.json"),
		JSON.stringify({
			id: "teste",
			nome: "Teste",
			pastaDados,
			instrucoes: "AGENTS.md",
			agentePadrao: "geral",
			agentes: [
				{ arquivo: "agents/geral.md", papel: "geral", selecionavel: true },
				{ arquivo: "agents/outro.md", papel: "outro", selecionavel: true },
			],
			skills: ["skills/skill-a", "skills/skill-b"],
			extensoes: [],
			extensoesSubagentes: ["extensions/filha.ts"],
			paineis: [],
		}),
	);
	// Extensão só das sessões filhas: não pode aparecer na sessão principal.
	await escrever(
		join(pastaPerfil, "extensions", "filha.ts"),
		extensaoComFerramenta("ferramenta_filha"),
	);
	await escrever(join(pastaPerfil, "AGENTS.md"), "# Instruções do perfil de teste\nResponda curto.\n");
	await escrever(
		join(pastaPerfil, "agents", "geral.md"),
		"---\nname: geral\ndescription: agente geral\ntools: read, grep, safe_bash\nskills: skill-a\nthinking: turbo\n---\n\nVocê é o agente geral.\n",
	);
	await escrever(join(pastaPerfil, "agents", "outro.md"), "---\nname: outro\ndescription: outro agente\n---\n\nVocê é o outro agente.\n");
	for (const nome of ["skill-a", "skill-b"]) {
		await escrever(
			join(pastaPerfil, "skills", nome, "SKILL.md"),
			`---\nname: ${nome}\ndescription: Skill ${nome} de teste.\n---\n\n# ${nome}\n`,
		);
	}
});

afterEach(async () => {
	await janela?.descartar();
	janela = undefined;
	await rm(raiz, { recursive: true, force: true });
});

/** Escreve uma sessão com uma pergunta e uma resposta, gravada com o agente `agente`. */
async function gravarSessao(id: string, agente: string): Promise<string> {
	const pasta = pastaSessoes({ pastaDados });
	await mkdir(pasta, { recursive: true });
	const usoZero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const linhas = [
		{ type: "session", version: 3, id, timestamp: "2026-10-15T10:00:00.000Z", cwd: pastaDados },
		{ type: "custom", id: "e1", parentId: null, timestamp: "2026-10-15T10:00:00.000Z", customType: TIPO_ENTRADA_AGENTE, data: { agente } },
		{ type: "message", id: "e2", parentId: "e1", timestamp: "2026-10-15T10:00:01.000Z", message: { role: "user", content: "Pergunta antiga", timestamp: 1760522401000 } },
		{
			type: "message",
			id: "e3",
			parentId: "e2",
			timestamp: "2026-10-15T10:00:02.000Z",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Resposta antiga" }],
				api: "openai-completions",
				provider: "provedor-de-teste",
				model: "modelo-de-teste",
				usage: usoZero,
				stopReason: "stop",
				timestamp: 1760522402000,
			},
		},
	];
	const arquivo = join(pasta, `2026-10-15T10-00-00-000Z_${id}.jsonl`);
	await writeFile(arquivo, `${linhas.map((linha) => JSON.stringify(linha)).join("\n")}\n`);
	return arquivo;
}

describe("JanelaPerfil sem rede", () => {
	it("monta a sessão do agente: prompt, ferramentas, skills, diagnósticos e extensões do núcleo", async () => {
		const montagens: string[] = [];
		const iniciosDeSessao: string[] = [];
		const perfil = await lerPerfil(pastaPerfil);
		janela = new JanelaPerfil(perfil, {
			pastaPi,
			extensoesNucleo: ({ agente }) => {
				montagens.push(agente.nome);
				return [
					(pi) => {
						pi.on("session_start", (evento) => {
							iniciosDeSessao.push(evento.reason);
						});
					},
				];
			},
		});
		const eventos: EventoNucleo[] = [];
		janela.assinar((evento) => eventos.push(evento));

		const estado = await janela.iniciar();
		expect(estado.agente).toBe("geral");
		expect(estado.ferramentas).toEqual(["read", "grep"]);
		expect(estado.skills).toEqual(["skill-a"]);
		expect(estado.diagnosticos.map((item) => item.mensagem)).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/raciocínio "turbo" desconhecido/),
				'ferramenta "safe_bash" do agente geral não existe nesta sessão; ignorada',
			]),
		);
		expect(eventos.some((evento) => evento.tipo === "estado_sessao")).toBe(true);
		expect(eventos.filter((evento) => evento.tipo === "diagnostico")).toHaveLength(estado.diagnosticos.length);

		const prompt = janela.promptSistema ?? "";
		expect(prompt).toContain("# Instruções do perfil de teste");
		expect(prompt).toContain("Você é o agente geral.");
		expect(prompt).toContain("skill-a");
		expect(prompt).not.toContain("skill-b");
		expect(prompt).not.toContain("# Regras do projeto");
		expect(montagens).toEqual(["geral"]);
		expect(iniciosDeSessao).toEqual(["startup"]);

		// Sessão vazia ainda não tem arquivo; trocar de agente começa outra.
		const outro = await janela.trocarAgente("outro");
		expect(outro.agente).toBe("outro");
		// Sem ferramentas declaradas: as do pi, a ask_user_question e a subagent do núcleo; a das sessões filhas não entra.
		expect(outro.ferramentas).toEqual(["read", "bash", "edit", "write", "ask_user_question", "subagent"]);
		expect(janela.sessaoPi?.getAllTools().map((ferramenta) => ferramenta.name)).not.toContain("ferramenta_filha");
		expect(janela.sessaoPi?.resourceLoader.getExtensions().extensions.map((extensao) => extensao.path)).toEqual(
			expect.arrayContaining(["<inline:nucleo-ponte>", "<inline:nucleo-pergunta>", "<inline:nucleo-subagente>"]),
		);
		expect(janela.promptSistema).toContain("Delegate a self-contained task to a specialist subagent (geral)");
		expect(outro.skills).toEqual(["skill-a", "skill-b"]);
		expect(janela.promptSistema).toContain("Você é o outro agente.");
		expect(janela.promptSistema).not.toContain("Você é o agente geral.");
		expect(montagens).toEqual(["geral", "outro"]);
		expect(await janela.listarSessoes()).toEqual([]);
	});

	it("abre uma sessão gravada, troca de agente e recarrega mantendo a conversa", async () => {
		const id = "01a10000-0000-7000-8000-0000000000aa";
		const arquivo = await gravarSessao(id, "outro");
		janela = new JanelaPerfil(await lerPerfil(pastaPerfil), { pastaPi });

		const aberta = await janela.iniciar({ sessaoId: id });
		expect(aberta).toMatchObject({ sessaoId: id, arquivo, agente: "outro" });
		// O agente de cada resposta vem da entrada nucleo.agente vigente na hora.
		expect(janela.historico()).toMatchObject([
			{ papel: "usuario", texto: "Pergunta antiga" },
			{ papel: "assistente", texto: "Resposta antiga", raciocinio: "", modelo: "provedor-de-teste/modelo-de-teste", ferramentas: [], agente: "outro" },
		]);

		// Troca de agente: mesma sessão, mesmo arquivo, conversa mantida, troca gravada.
		const trocada = await janela.trocarAgente("geral");
		expect(trocada).toMatchObject({ sessaoId: id, arquivo, agente: "geral", ferramentas: ["read", "grep"] });
		expect(janela.historico()).toHaveLength(2);
		const texto = await readFile(arquivo, "utf8");
		expect(texto).toContain(`"customType":"${TIPO_ENTRADA_AGENTE}","data":{"agente":"geral"}`);
		expect((await janela.listarSessoes()).map(({ id: sessao, agente }) => ({ sessao, agente }))).toEqual([
			{ sessao: id, agente: "geral" },
		]);

		// Recarregar relê o AGENTS.md do disco e mantém sessão, agente e conversa.
		await writeFile(join(pastaPerfil, "AGENTS.md"), "# Instruções do perfil de teste, versão 2\n");
		const recarregada = await janela.recarregar();
		expect(recarregada).toMatchObject({ sessaoId: id, agente: "geral" });
		expect(janela.promptSistema).toContain("versão 2");
		expect(janela.historico()).toHaveLength(2);

		// Uma sessão nova não carrega a conversa.
		const nova = await janela.novaSessao();
		expect(nova.sessaoId).not.toBe(id);
		expect(nova.agente).toBe("geral");
		expect(janela.historico()).toEqual([]);

		// E dá para voltar à sessão gravada.
		const reaberta = await janela.abrirSessao(id);
		expect(reaberta).toMatchObject({ sessaoId: id, agente: "geral" });
		expect(janela.historico()).toHaveLength(2);
	});

	it("ponte: mostrar, pedido e resposta, cancelamento e ação da interface", async () => {
		// A extensão de teste faz o papel de uma ferramenta de perfil: só usa pi.events.
		let barramento: ExtensionAPI["events"] | undefined;
		janela = new JanelaPerfil(await lerPerfil(pastaPerfil), {
			pastaPi,
			extensoesNucleo: () => [
				(pi) => {
					barramento = pi.events;
				},
			],
		});
		const eventos: EventoNucleo[] = [];
		janela.assinar((evento) => eventos.push(evento));
		const respostas: unknown[] = [];
		const acoes: unknown[] = [];
		const assinarBarramento = () => {
			barramento?.on("interface:resposta", (dados) => respostas.push(dados));
			barramento?.on("interface:acao", (dados) => acoes.push(dados));
		};
		const daPonte = () =>
			eventos.filter((evento) => ["acao_interface", "pedido_interface", "pedido_interface_cancelado"].includes(evento.tipo));

		expect(janela.responder("nada", {})).toBe(false);
		expect(() => janela?.acaoDaInterface("teste", "clicou")).toThrow(/chame iniciar/);

		await janela.iniciar({ agente: "outro" });
		assinarBarramento();

		barramento?.emit("interface:mostrar", { painel: "teste", acao: "abrir", dados: { texto: "olá" } });
		barramento?.emit("interface:pedido", { id: "p1", painel: "teste", acao: "perguntar", dados: { pergunta: "?" } });
		expect(daPonte()).toEqual([
			{ tipo: "acao_interface", painel: "teste", acao: "abrir", dados: { texto: "olá" } },
			{ tipo: "pedido_interface", id: "p1", painel: "teste", acao: "perguntar", dados: { pergunta: "?" } },
		]);
		expect(janela.responder("p1", { escolha: "a" })).toBe(true);
		expect(respostas).toEqual([{ id: "p1", dados: { escolha: "a" } }]);

		// Abortar cancela os pedidos pendentes.
		barramento?.emit("interface:pedido", { id: "p2", painel: "teste", acao: "perguntar", dados: null });
		await janela.abortar();
		expect(respostas.at(-1)).toEqual({ id: "p2", cancelado: true, motivo: "abortado" });
		expect(daPonte().at(-1)).toEqual({ tipo: "pedido_interface_cancelado", id: "p2", motivo: "abortado" });
		expect(janela.responder("p2", {})).toBe(false);

		// Ação da interface chega à extensão do perfil.
		janela.acaoDaInterface("teste", "clicou", { botao: "ok" });
		expect(acoes).toEqual([{ painel: "teste", acao: "clicou", dados: { botao: "ok" } }]);

		// Trocar de agente encerra a sessão: o pendente é cancelado; a sessão nova tem outro barramento.
		const anterior = barramento;
		barramento?.emit("interface:pedido", { id: "p3", painel: "teste", acao: "perguntar", dados: null });
		await janela.trocarAgente("geral");
		expect(respostas.at(-1)).toEqual({ id: "p3", cancelado: true, motivo: "sessao_encerrada" });
		expect(barramento).not.toBe(anterior);
		assinarBarramento();
		janela.acaoDaInterface("teste", "clicou", 2);
		expect(acoes).toHaveLength(2);

		// Descartar a janela também cancela.
		barramento?.emit("interface:pedido", { id: "p4", painel: "teste", acao: "perguntar", dados: null });
		await janela.descartar();
		janela = undefined;
		expect(respostas.at(-1)).toEqual({ id: "p4", cancelado: true, motivo: "sessao_encerrada" });
	});

	it("erros claros: agente e sessão inexistentes, enviar sem iniciar", async () => {
		janela = new JanelaPerfil(await lerPerfil(pastaPerfil), { pastaPi });
		await expect(janela.enviar("oi")).rejects.toThrow(/não tem sessão; chame iniciar/);
		await expect(janela.iniciar({ agente: "fantasma" })).rejects.toThrow(/não tem o agente "fantasma"/);
		await expect(janela.iniciar({ sessaoId: "nao-existe" })).rejects.toThrow(/Sessão nao-existe não encontrada/);
		// Depois dos erros a janela continua utilizável.
		expect((await janela.iniciar()).agente).toBe("geral");
	});
});
