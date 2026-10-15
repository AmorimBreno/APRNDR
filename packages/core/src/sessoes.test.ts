import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionEntry, Skill } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import type { Diagnostico } from "./eventos.ts";
import { lerPerfil } from "./perfis.ts";
import {
	acharAgente,
	acharArquivoSessao,
	agenteGravado,
	ErroSessao,
	filtrarFerramentas,
	filtrarSkills,
	listarSessoes,
	montarOpcoesRecursos,
	pastaSessoes,
	TIPO_ENTRADA_AGENTE,
} from "./sessoes.ts";

const raizRepositorio = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pastaEstudos = join(raizRepositorio, "profiles", "estudos");

const skill = (name: string) => ({ name, description: name, filePath: `/s/${name}/SKILL.md`, baseDir: `/s/${name}` }) as Skill;

describe("montarOpcoesRecursos com o perfil estudos", () => {
	it("professor: recursos do perfil, sem arquivos de contexto, AGENTS.md do perfil e prompt do agente no append", async () => {
		const perfil = await lerPerfil(pastaEstudos);
		const professor = acharAgente(perfil, "professor");
		const fabrica = () => {};
		const opcoes = montarOpcoesRecursos(perfil, professor, [fabrica], []);
		expect(opcoes.additionalExtensionPaths).toEqual(perfil.extensoes);
		expect(opcoes.additionalSkillPaths).toEqual(perfil.skills);
		expect(opcoes.noSkills).toBe(true);
		expect(opcoes.noContextFiles).toBe(true);
		expect(opcoes.noExtensions).toBeUndefined(); // as globais de ~/.pi/agent continuam
		expect(opcoes.appendSystemPrompt).toEqual([join(pastaEstudos, "AGENTS.md"), professor.definicao.prompt]);
		expect(opcoes.appendSystemPrompt?.[1]).toMatch(/^Você é o professor do Breno\./);
		expect(opcoes.extensionFactories).toEqual([fabrica]);
	});

	it("skillsOverride deixa só as skills declaradas pelo agente e avisa as que faltam", async () => {
		const perfil = await lerPerfil(pastaEstudos);
		const professor = acharAgente(perfil, "professor");
		const comExtra = { ...professor, definicao: { ...professor.definicao, skills: ["teach", "nao-existe"] } };
		const diagnosticos: Diagnostico[] = [];
		const opcoes = montarOpcoesRecursos(perfil, comExtra, [], diagnosticos);
		const base = { skills: [skill("teach"), skill("visualize")], diagnostics: [] };
		expect(opcoes.skillsOverride?.(base).skills.map((item) => item.name)).toEqual(["teach"]);
		// O loader pode chamar o override de novo; o aviso não se repete.
		opcoes.skillsOverride?.(base);
		expect(diagnosticos).toEqual([
			{ nivel: "aviso", mensagem: 'skill "nao-existe" do agente professor não existe no perfil estudos; ignorada' },
		]);
	});

	it("researcher não declara skills: ficam todas as do perfil", async () => {
		const perfil = await lerPerfil(pastaEstudos);
		const opcoes = montarOpcoesRecursos(perfil, acharAgente(perfil, "researcher"), [], []);
		const base = { skills: [skill("teach"), skill("visualize")], diagnostics: [] };
		expect(opcoes.skillsOverride?.(base).skills.map((item) => item.name)).toEqual(["teach", "visualize"]);
	});

	it("agente inexistente dá erro com os nomes válidos", async () => {
		const perfil = await lerPerfil(pastaEstudos);
		expect(() => acharAgente(perfil, "fantasma")).toThrow(ErroSessao);
		expect(() => acharAgente(perfil, "fantasma")).toThrow(/professor, researcher, mermaid-maker, svg-maker/);
	});
});

describe("filtros", () => {
	const disponiveis = ["read", "bash", "edit", "write", "web_fetch", "web_search"];

	it("ferramentas declaradas: só as que existem; as outras viram aviso", () => {
		expect(filtrarFerramentas(disponiveis, ["web_search", "web_fetch", "safe_bash"])).toEqual({
			ativas: ["web_search", "web_fetch"],
			faltando: ["safe_bash"],
		});
	});

	it("sem ferramentas declaradas: valem as do pi", () => {
		expect(filtrarFerramentas(disponiveis, [])).toEqual({ faltando: [] });
	});

	it("skills sem declaração ficam todas", () => {
		const todas = [skill("teach"), skill("visualize")];
		expect(filtrarSkills(todas, [])).toEqual({ skills: todas, faltando: [] });
		expect(filtrarSkills(todas, ["visualize", "x"])).toEqual({ skills: [todas[1]], faltando: ["x"] });
	});

	it("com semDeclaracao nenhuma (sessão filha), sem declaração não fica nada", () => {
		expect(filtrarFerramentas(disponiveis, [], "nenhuma")).toEqual({ ativas: [], faltando: [] });
		expect(filtrarSkills([skill("teach")], [], "nenhuma")).toEqual({ skills: [], faltando: [] });
		expect(filtrarFerramentas(disponiveis, ["read"], "nenhuma")).toEqual({ ativas: ["read"], faltando: [] });
	});
});

describe("montarOpcoesRecursos no modo subagente", () => {
	it("researcher: extensões do perfil e das filhas, nenhuma skill, prompt do researcher", async () => {
		const perfil = await lerPerfil(pastaEstudos);
		const researcher = acharAgente(perfil, "researcher");
		const opcoes = montarOpcoesRecursos(perfil, researcher, [], [], "subagente");
		expect(opcoes.additionalExtensionPaths).toEqual([...perfil.extensoes, ...perfil.extensoesSubagentes]);
		expect(opcoes.additionalExtensionPaths).toContain(join(pastaEstudos, "extensions", "visual-tools", "tools", "mermaid_tools.ts"));
		expect(opcoes.noContextFiles).toBe(true);
		expect(opcoes.extensionFactories).toEqual([]);
		expect(opcoes.appendSystemPrompt?.[1]).toMatch(/^You are a research specialist/);
		const base = { skills: [skill("teach"), skill("visualize")], diagnostics: [] };
		expect(opcoes.skillsOverride?.(base).skills).toEqual([]);
		// Na sessão principal, as extensões das filhas não entram.
		expect(montarOpcoesRecursos(perfil, researcher, [], []).additionalExtensionPaths).toEqual(perfil.extensoes);
	});

	it("researcher declara só web_search e web_fetch (safe_bash saiu)", async () => {
		const perfil = await lerPerfil(pastaEstudos);
		expect(acharAgente(perfil, "researcher").definicao.ferramentas).toEqual(["web_search", "web_fetch"]);
	});
});

describe("agente gravado na sessão", () => {
	it("vale a última entrada do núcleo no caminho", () => {
		const entradas = [
			{ type: "custom", id: "1", parentId: null, timestamp: "", customType: TIPO_ENTRADA_AGENTE, data: { agente: "professor" } },
			{ type: "custom", id: "2", parentId: "1", timestamp: "", customType: "outra-extensao", data: { agente: "x" } },
			{ type: "custom", id: "3", parentId: "2", timestamp: "", customType: TIPO_ENTRADA_AGENTE, data: { agente: "researcher" } },
		] as SessionEntry[];
		expect(agenteGravado(entradas)).toBe("researcher");
		expect(agenteGravado([])).toBeUndefined();
	});
});

describe("listarSessoes", () => {
	let pastaDados = "";
	afterEach(async () => {
		if (pastaDados) await rm(pastaDados, { recursive: true, force: true });
	});

	it("lê id, título, agente e mensagens dos arquivos em .sessoes-pi", async () => {
		pastaDados = await mkdtemp(join(tmpdir(), "nucleo-sessoes-"));
		const pasta = pastaSessoes({ pastaDados });
		await mkdir(pasta, { recursive: true });
		const id = "01a10000-0000-7000-8000-000000000001";
		const linhas = [
			{ type: "session", version: 3, id, timestamp: "2026-10-15T10:00:00.000Z", cwd: pastaDados },
			{ type: "custom", id: "e1", parentId: null, timestamp: "2026-10-15T10:00:00.000Z", customType: TIPO_ENTRADA_AGENTE, data: { agente: "professor" } },
			{
				type: "message",
				id: "e2",
				parentId: "e1",
				timestamp: "2026-10-15T10:00:01.000Z",
				message: { role: "user", content: "Em uma frase: o que é desvio padrão?", timestamp: 1760522401000 },
			},
			{ type: "custom", id: "e3", parentId: "e2", timestamp: "2026-10-15T10:00:02.000Z", customType: TIPO_ENTRADA_AGENTE, data: { agente: "researcher" } },
		];
		await writeFile(join(pasta, `2026-10-15T10-00-00-000Z_${id}.jsonl`), `${linhas.map((linha) => JSON.stringify(linha)).join("\n")}\n`);

		const sessoes = await listarSessoes({ pastaDados });
		expect(sessoes).toEqual([
			{
				id,
				arquivo: join(pasta, `2026-10-15T10-00-00-000Z_${id}.jsonl`),
				criadaEm: "2026-10-15T10:00:00.000Z",
				modificadaEm: expect.any(String),
				titulo: "Em uma frase: o que é desvio padrão?",
				agente: "researcher",
				mensagens: 1,
			},
		]);
		expect(acharArquivoSessao({ pastaDados }, id)).toBe(sessoes[0]?.arquivo);
		expect(acharArquivoSessao({ pastaDados }, "nao-existe")).toBeUndefined();
	});

	it("pasta sem sessões devolve lista vazia", async () => {
		pastaDados = await mkdtemp(join(tmpdir(), "nucleo-sessoes-"));
		expect(await listarSessoes({ pastaDados })).toEqual([]);
	});
});
