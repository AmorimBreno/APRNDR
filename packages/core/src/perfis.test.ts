import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ErroPerfil, lerPerfil, lerPerfis, lerPerfisComErros, validarProfileJson } from "./perfis.ts";

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
		expect(perfil.extensoes).toEqual([
			join(pastaPerfis, "estudos", "extensions", "painel-teste.ts"),
			join(pastaPerfis, "estudos", "extensions", "quiz-web.ts"),
		]);
		expect(perfil.extensoesSubagentes).toEqual([
			join(pastaPerfis, "estudos", "extensions", "visual-tools", "tools", "mermaid_tools.ts"),
			join(pastaPerfis, "estudos", "extensions", "visual-tools", "tools", "svg_tools.ts"),
		]);
		expect(perfil.agentePadrao).toBe("professor");
		expect(perfil.paineis).toEqual(["quiz", "teste"]);
		expect(perfil.aparencia).toEqual({
			capa: join(pastaPerfis, "estudos", "capa.png"),
			cor: "moss",
			lema: "Entender antes de decorar",
			glifo: "学習",
		});
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

	it("aparencia é opcional; a capa precisa ser imagem e a cor, uma das do tema", () => {
		expect(validarProfileJson(valido, "x").aparencia).toBeUndefined();
		expect(validarProfileJson({ ...valido, aparencia: { cor: "moss", lema: "Oi" } }, "x").aparencia).toEqual({ cor: "moss", lema: "Oi" });
		expect(() => validarProfileJson({ ...valido, aparencia: { capa: "capa.txt" } }, "x")).toThrow(/use uma imagem/);
		expect(() => validarProfileJson({ ...valido, aparencia: { cor: "roxo" } }, "x")).toThrow(/aparencia/);
	});

	it("extensoesSubagentes é opcional e aceita só caminhos relativos", () => {
		expect(validarProfileJson(valido, "x").extensoesSubagentes).toBeUndefined();
		expect(validarProfileJson({ ...valido, extensoesSubagentes: ["extensions/a.ts"] }, "x").extensoesSubagentes).toEqual([
			"extensions/a.ts",
		]);
		expect(() => validarProfileJson({ ...valido, extensoesSubagentes: [resolve("/a.ts")] }, "x")).toThrow(
			/campo extensoesSubagentes\[0\]: deve ser um caminho relativo/,
		);
		expect(() => validarProfileJson({ ...valido, extensoesSubagentes: "extensions/a.ts" }, "x")).toThrow(/campo extensoesSubagentes/);
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

		it("sem extensoesSubagentes a lista fica vazia; com um arquivo que não existe, diz o campo", async () => {
			pasta = await mkdtemp(join(tmpdir(), "estudos-perfil-"));
			await writeFile(join(pasta, "AGENTS.md"), "");
			await mkdir(join(pasta, "agents"));
			await writeFile(join(pasta, "agents", "geral.md"), "---\nname: geral\n---\n\nGeral.\n");
			await writeFile(join(pasta, "profile.json"), JSON.stringify(valido));
			expect((await lerPerfil(pasta)).extensoesSubagentes).toEqual([]);
			await writeFile(join(pasta, "profile.json"), JSON.stringify({ ...valido, extensoesSubagentes: ["extensions/nao.ts"] }));
			await expect(lerPerfil(pasta)).rejects.toThrow(/campo extensoesSubagentes\[0\]: extensions\/nao\.ts não existe/);
		});

		it("lerPerfisComErros separa os perfis inválidos sem perder os válidos", async () => {
			pasta = await mkdtemp(join(tmpdir(), "estudos-perfis-"));
			const bom = join(pasta, "a-bom");
			await mkdir(join(bom, "agents"), { recursive: true });
			await writeFile(join(bom, "AGENTS.md"), "");
			await writeFile(join(bom, "agents", "geral.md"), "---\nname: geral\n---\n\nGeral.\n");
			await writeFile(join(bom, "profile.json"), JSON.stringify(valido));
			await mkdir(join(pasta, "b-quebrado"));
			await writeFile(join(pasta, "b-quebrado", "profile.json"), "{ isto não é json");
			await mkdir(join(pasta, "c-sem-profile"));

			const { perfis, erros } = await lerPerfisComErros(pasta);
			expect(perfis.map((perfil) => perfil.id)).toEqual(["teste"]);
			expect(erros).toHaveLength(1);
			expect(erros[0]?.arquivo).toBe(join(pasta, "b-quebrado", "profile.json"));
			expect(erros[0]?.mensagem).toMatch(/não foi possível ler o JSON/);
			await expect(lerPerfis(pasta)).rejects.toThrow(ErroPerfil);
		});

		it("acusa arquivo de agente que não existe", async () => {
			pasta = await mkdtemp(join(tmpdir(), "estudos-perfil-"));
			await writeFile(join(pasta, "AGENTS.md"), "");
			await writeFile(join(pasta, "profile.json"), JSON.stringify(valido));
			await expect(lerPerfil(pasta)).rejects.toThrow(/campo agentes\[0\]\.arquivo: agents\/geral\.md não existe/);
		});
	});
});
