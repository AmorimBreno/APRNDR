import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ErroPerfil, lerPerfil, lerPerfis, validarProfileJson } from "./perfis.ts";

const raizRepositorio = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pastaPerfis = join(raizRepositorio, "profiles");

describe("perfil estudos real", () => {
	it("o profile.json é válido e os caminhos ficam absolutos", async () => {
		const perfil = await lerPerfil(join(pastaPerfis, "estudos"));
		expect(perfil.id).toBe("estudos");
		expect(perfil.nome).toBe("Estudos");
		expect(perfil.pastaDados).toBe("G:\\Meu Drive\\estudos-dados");
		expect(perfil.instrucoes).toBe(join(pastaPerfis, "estudos", "AGENTS.md"));
		expect(perfil.skills).toEqual([
			join(pastaPerfis, "estudos", "skills", "teach"),
			join(pastaPerfis, "estudos", "skills", "visualize"),
		]);
		expect(perfil.extensoes).toEqual([join(pastaPerfis, "estudos", "extensions", "visual-tools")]);
		expect(perfil.agentePadrao).toBe("professor");
		expect(perfil.paineis).toEqual(["teste"]);
	});

	it("os quatro agentes têm nome, papel e modelo certos", async () => {
		const perfil = await lerPerfil(join(pastaPerfis, "estudos"));
		const resumo = perfil.agentes.map(({ nome, papel, selecionavel, modelo }) => ({ nome, papel, selecionavel, modelo }));
		expect(resumo).toEqual([
			{ nome: "professor", papel: "geral", selecionavel: true, modelo: "openrouter/openai/gpt-6.1-sol" },
			{ nome: "researcher", papel: "pesquisa", selecionavel: true, modelo: "openrouter/z-ai/glm-5.3" },
			{ nome: "mermaid-maker", papel: "desenho", selecionavel: false, modelo: "openrouter/anthropic/claude-sonnet-5.5" },
			{ nome: "svg-maker", papel: "desenho", selecionavel: false, modelo: "openrouter/anthropic/claude-sonnet-5.5" },
		]);
	});

	it("lerPerfis encontra o perfil estudos", async () => {
		const perfis = await lerPerfis(pastaPerfis);
		expect(perfis.map((perfil) => perfil.id)).toContain("estudos");
	});
});

describe("profile.json inválido", () => {
	const valido = {
		id: "teste",
		nome: "Teste",
		pastaDados: resolve("/dados"),
		instrucoes: "AGENTS.md",
		agentePadrao: "geral",
		agentes: [{ arquivo: "agents/geral.md", papel: "geral", selecionavel: true }],
		skills: [],
		extensoes: [],
		paineis: [],
	};

	it("cita o campo que falhou", () => {
		const invalido = { ...valido, agentes: [{ arquivo: "agents/geral.md", papel: "geral", selecionavel: "sim" }] };
		expect(() => validarProfileJson(invalido, "teste/profile.json")).toThrow(ErroPerfil);
		expect(() => validarProfileJson(invalido, "teste/profile.json")).toThrow(/teste\/profile\.json.*agentes\[0\]\.selecionavel/);
	});

	it("recusa pastaDados relativa e campo desconhecido", () => {
		expect(() => validarProfileJson({ ...valido, pastaDados: "dados" }, "x")).toThrow(/campo pastaDados/);
		expect(() => validarProfileJson({ ...valido, caderno: true }, "x")).toThrow(/caderno/);
	});

	describe("em disco", () => {
		let pasta: string | undefined;
		afterEach(async () => {
			if (pasta) await rm(pasta, { recursive: true, force: true });
			pasta = undefined;
		});

		it("diz qual perfil e qual campo", async () => {
			pasta = await mkdtemp(join(tmpdir(), "estudos-perfil-"));
			await writeFile(join(pasta, "profile.json"), JSON.stringify({ ...valido, nome: "" }));
			await expect(lerPerfil(pasta)).rejects.toThrow(/profile\.json: campo nome/);
		});

		it("acusa arquivo de agente que não existe", async () => {
			pasta = await mkdtemp(join(tmpdir(), "estudos-perfil-"));
			await writeFile(join(pasta, "AGENTS.md"), "");
			await writeFile(join(pasta, "profile.json"), JSON.stringify(valido));
			await expect(lerPerfil(pasta)).rejects.toThrow(/campo agentes\[0\]\.arquivo: agents\/geral\.md não existe/);
		});
	});
});
