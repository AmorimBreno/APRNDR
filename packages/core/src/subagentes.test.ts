// Testes dos subagentes sem rede: montagem da sessão filha com perfil, pasta
// global do pi e pasta de dados temporários (agentes sem modelo, nenhuma
// mensagem chega a um modelo), e as funções de progresso e uso.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarRegistroModelos } from "./modelos.ts";
import { lerPerfil } from "./perfis.ts";
import { pastaSubagentes } from "./sessoes.ts";
import {
	type ContextoSubagentes,
	criarAcompanhamento,
	descreverArgumentos,
	descreverFerramentaSubagente,
	executarSubagente,
	montarSessaoFilha,
	type SessaoFilha,
	somarUso,
} from "./subagentes.ts";

let raiz = "";
let pastaPerfil = "";
let pastaDados = "";
let contexto: ContextoSubagentes;
let filha: SessaoFilha | undefined;

async function escrever(caminho: string, texto: string): Promise<void> {
	await mkdir(dirname(caminho), { recursive: true });
	await writeFile(caminho, texto);
}

function extensaoComFerramenta(...nomes: string[]): string {
	const registros = nomes.map(
		(nome) =>
			`\tpi.registerTool({ name: "${nome}", label: "${nome}", description: "teste", parameters: Type.Object({}), async execute() { return { content: [{ type: "text", text: "ok" }], details: undefined }; } });`,
	);
	return ['import { Type } from "typebox";', "export default function (pi) {", ...registros, "}", ""].join("\n");
}

// Sem rede de verdade: com uma chave de provedor no ambiente (a
// OPENROUTER_API_KEY do Breno, por exemplo), o pi acharia um modelo para os
// agentes "sem modelo" e a filha chamaria a API. As chaves saem do ambiente
// durante cada teste e voltam depois.
const chavesGuardadas = new Map<string, string>();

beforeEach(() => {
	for (const [nome, valor] of Object.entries(process.env)) {
		if (!nome.endsWith("_API_KEY") || valor === undefined) continue;
		chavesGuardadas.set(nome, valor);
		delete process.env[nome];
	}
});

afterEach(() => {
	for (const [nome, valor] of chavesGuardadas) process.env[nome] = valor;
	chavesGuardadas.clear();
});

beforeEach(async () => {
	raiz = await mkdtemp(join(tmpdir(), "nucleo-subagentes-"));
	pastaPerfil = join(raiz, "perfil");
	pastaDados = join(raiz, "dados");
	const pastaPi = join(raiz, "pi-agent");
	await mkdir(pastaPi, { recursive: true });
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
				{ arquivo: "agents/desenhista.md", papel: "desenho", selecionavel: false },
				{ arquivo: "agents/calado.md", papel: "outro", selecionavel: false },
			],
			skills: ["skills/skill-a"],
			extensoes: ["extensions/do-perfil.ts"],
			extensoesSubagentes: ["extensions/das-filhas.ts"],
			paineis: [],
		}),
	);
	await escrever(join(pastaPerfil, "AGENTS.md"), "# Instruções do perfil de teste\n");
	await escrever(join(pastaPerfil, "agents", "geral.md"), "---\nname: geral\ndescription: agente geral\n---\n\nVocê é o agente geral.\n");
	await escrever(
		join(pastaPerfil, "agents", "desenhista.md"),
		"---\nname: desenhista\ndescription: Desenha uma coisa.\ntools: desenhar, read, ferramenta_perfil, inexistente\n---\n\nVocê é o desenhista.\n",
	);
	await escrever(join(pastaPerfil, "agents", "calado.md"), "---\nname: calado\ndescription: Não declara nada.\n---\n\nVocê é o calado.\n");
	await escrever(
		join(pastaPerfil, "skills", "skill-a", "SKILL.md"),
		"---\nname: skill-a\ndescription: Skill de teste.\n---\n\n# skill-a\n",
	);
	await escrever(join(pastaPerfil, "extensions", "do-perfil.ts"), extensaoComFerramenta("ferramenta_perfil"));
	await escrever(join(pastaPerfil, "extensions", "das-filhas.ts"), extensaoComFerramenta("desenhar", "apagar"));
	contexto = { perfil: await lerPerfil(pastaPerfil), pastaPi, registro: await criarRegistroModelos(pastaPi) };
});

afterEach(async () => {
	filha?.sessao.dispose();
	filha = undefined;
	await rm(raiz, { recursive: true, force: true });
});

function nomesDe(sessao: AgentSession): string[] {
	return sessao.getAllTools().map((ferramenta) => ferramenta.name);
}

describe("montarSessaoFilha", () => {
	it("ferramentas: só as declaradas, das extensões do perfil e das filhas; sem subagent e sem ponte", async () => {
		filha = await montarSessaoFilha(contexto, "desenhista", { sessaoPai: "pai", idFerramenta: "chamada-1" });
		const { sessao } = filha;
		expect(sessao.getActiveToolNames()).toEqual(["desenhar", "read", "ferramenta_perfil"]);
		expect(nomesDe(sessao)).toEqual(expect.arrayContaining(["desenhar", "apagar", "ferramenta_perfil"]));
		expect(nomesDe(sessao)).not.toContain("subagent");
		const extensoes = sessao.resourceLoader.getExtensions().extensions.map((extensao) => extensao.path);
		expect(extensoes.filter((caminho) => caminho.startsWith("<inline"))).toEqual([]);
		expect(filha.diagnosticos.map((item) => item.mensagem)).toContain(
			'ferramenta "inexistente" do agente desenhista não existe nesta sessão; ignorada',
		);
	});

	it("prompt do agente com o AGENTS.md do perfil; sem skills se o agente não declara; gravada em subagentes/", async () => {
		filha = await montarSessaoFilha(contexto, "desenhista", { sessaoPai: "pai", idFerramenta: "chamada-1" });
		const prompt = filha.sessao.systemPrompt;
		expect(prompt).toContain("# Instruções do perfil de teste");
		expect(prompt).toContain("Você é o desenhista.");
		expect(prompt).not.toContain("Você é o agente geral.");
		expect(filha.sessao.resourceLoader.getSkills().skills).toEqual([]);
		expect(filha.sessao.sessionManager.getSessionDir()).toBe(pastaSubagentes(contexto.perfil));
		expect(filha.sessao.sessionManager.getCwd()).toBe(pastaDados);
		const entradas = filha.sessao.sessionManager.getEntries();
		expect(entradas).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "custom", customType: "nucleo.agente", data: { agente: "desenhista" } }),
				expect.objectContaining({ type: "custom", customType: "nucleo.subagente", data: { sessaoPai: "pai", idFerramenta: "chamada-1" } }),
			]),
		);
	});

	it("agente que não declara ferramentas fica sem nenhuma", async () => {
		filha = await montarSessaoFilha(contexto, "calado");
		expect(filha.sessao.getActiveToolNames()).toEqual([]);
	});

	it("agente inexistente dá erro com os nomes válidos", async () => {
		await expect(montarSessaoFilha(contexto, "fantasma")).rejects.toThrow(/não tem o agente "fantasma".*geral, desenhista, calado/);
	});
});

describe("executarSubagente sem modelo", () => {
	it("falha da filha vira resultado com isError e details, sem lançar", async () => {
		const progresso: string[] = [];
		const resultado = await executarSubagente(contexto, {
			agente: "calado",
			tarefa: "Diga oi.",
			idFerramenta: "chamada-2",
			aoProgresso: (resumo) => progresso.push(resumo),
		});
		const diagnosticos: string[] = [];
		await executarSubagente(contexto, {
			agente: "desenhista",
			tarefa: "Desenhe.",
			idFerramenta: "chamada-4",
			aoEvento: (evento) => {
				if (evento.tipo === "diagnostico") diagnosticos.push(evento.mensagem);
			},
		});
		expect(diagnosticos).toContain('subagente desenhista: ferramenta "inexistente" do agente desenhista não existe nesta sessão; ignorada');
		expect(resultado.isError).toBe(true);
		expect(resultado.content[0]).toMatchObject({ type: "text", text: expect.stringMatching(/^O subagente calado falhou: /) });
		expect(resultado.details).toMatchObject({ agente: "calado", estado: "erro", ferramentas: 0 });
		expect(resultado.usage?.totalTokens).toBe(0);
		expect(progresso[0]).toMatch(/^calado: começou/);
	});

	it("execução pai já abortada: a filha nem começa", async () => {
		const controle = new AbortController();
		controle.abort();
		const resultado = await executarSubagente(contexto, {
			agente: "calado",
			tarefa: "Diga oi.",
			idFerramenta: "chamada-3",
			signal: controle.signal,
		});
		expect(resultado.isError).toBe(true);
		expect(resultado.details.estado).toBe("abortado");
		expect(resultado.content[0]).toMatchObject({ text: "O subagente calado foi interrompido." });
	});
});

describe("descrição, progresso e uso", () => {
	it("a descrição lista os agentes, menos o da sessão principal", () => {
		const descricao = descreverFerramentaSubagente(contexto.perfil, "geral");
		expect(descricao).toContain("- desenhista: Desenha uma coisa.");
		expect(descricao).toContain("- calado: Não declara nada.");
		expect(descricao).not.toContain("- geral:");
	});

	it("descreverArgumentos pega o primeiro texto", () => {
		expect(descreverArgumentos({ max: 3, query: "r2 ajustado" })).toBe("'r2 ajustado'");
		expect(descreverArgumentos({ n: 1 })).toBe("");
		expect(descreverArgumentos(undefined)).toBe("");
	});

	it("o acompanhamento diz o que a filha está fazendo, com texto limitado no tempo", () => {
		let agora = 0;
		const acompanhar = criarAcompanhamento("researcher", { intervaloTextoMs: 1000, agora: () => agora });
		expect(acompanhar({ tipo: "execucao_inicio" })).toBeUndefined();
		expect(acompanhar({ tipo: "raciocinio_delta", delta: "hm" })).toBe("researcher: pensando");
		expect(acompanhar({ tipo: "raciocinio_delta", delta: "hm" })).toBeUndefined();
		expect(
			acompanhar({ tipo: "ferramenta_inicio", id: "1", nome: "web_search", argumentos: { query: "r2 ajustado" } }),
		).toBe("researcher: web_search 'r2 ajustado'");
		expect(acompanhar({ tipo: "ferramenta_fim", id: "1", nome: "web_search", erro: false, resumo: "" })).toBe(
			"researcher: web_search terminou",
		);
		expect(acompanhar({ tipo: "texto_delta", delta: "O R² ajustado" })).toBe("researcher: escrevendo: O R² ajustado");
		agora = 500;
		expect(acompanhar({ tipo: "texto_delta", delta: " foi" })).toBeUndefined();
		agora = 1500;
		expect(acompanhar({ tipo: "texto_delta", delta: " proposto" })).toBe("researcher: escrevendo: O R² ajustado foi proposto");
		expect(acompanhar({ tipo: "uso", modelo: "x", tokensEntrada: 0, tokensSaida: 0, tokensCacheLeitura: 0, tokensCacheEscrita: 0, tokensTotal: 0, custo: 0 })).toBeUndefined();
	});

	it("somarUso soma só as respostas do modelo", () => {
		const uso = (total: number, custo: number) => ({
			input: total,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: total,
			cost: { input: custo, output: 0, cacheRead: 0, cacheWrite: 0, total: custo },
		});
		const mensagens = [
			{ role: "user", content: "oi", timestamp: 0 },
			{ role: "assistant", content: [], usage: uso(10, 0.01), stopReason: "toolUse", timestamp: 0 },
			{ role: "assistant", content: [], usage: uso(5, 0.02), stopReason: "stop", timestamp: 0 },
		] as unknown as AgentSession["messages"];
		const total = somarUso(mensagens);
		expect(total.totalTokens).toBe(15);
		expect(total.cost.total).toBeCloseTo(0.03);
	});
});
