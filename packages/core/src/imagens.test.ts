import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acharImagem, conferirCaminhoImagem, ErroCaminhoImagem } from "./imagens.ts";

describe("conferirCaminhoImagem", () => {
	it("aceita nome solto e caminho com pasta", () => {
		expect(conferirCaminhoImagem("a.png")).toEqual(["a.png"]);
		expect(conferirCaminhoImagem("viz/a b.SVG")).toEqual(["viz", "a b.SVG"]);
	});

	it("recusa o que sairia da pasta de dados ou não é imagem", () => {
		for (const caminho of ["", "../a.png", "viz/../../a.png", ".sessoes-pi/a.png", "viz/.a.png", "viz//a.png", "viz\\a.png", "C:/a.png", "/a.png", "a.txt", "a"]) {
			expect(() => conferirCaminhoImagem(caminho), caminho).toThrow(ErroCaminhoImagem);
		}
	});
});

describe("acharImagem", () => {
	let raiz: string;
	let dados: string;
	beforeEach(async () => {
		raiz = await mkdtemp(join(tmpdir(), "estudos-imagens-"));
		dados = join(raiz, "dados");
		await mkdir(join(dados, "viz"), { recursive: true });
		await mkdir(join(dados, "outra"));
		await writeFile(join(dados, "viz", "a.png"), "png");
		await writeFile(join(dados, "outra", "a.png"), "outra");
		await writeFile(join(dados, "outra", "b.svg"), "<svg/>");
		await writeFile(join(raiz, "fora.png"), "fora");
	});
	afterEach(async () => {
		await rm(raiz, { recursive: true, force: true });
	});

	it("nome solto: procura nas pastas, em ordem", async () => {
		expect((await acharImagem(dados, ["viz", "outra"], "a.png"))?.arquivo).toBe(join(dados, "viz", "a.png"));
		expect((await acharImagem(dados, ["outra", "viz"], "a.png"))?.arquivo).toBe(join(dados, "outra", "a.png"));
		const svg = await acharImagem(dados, ["viz", "outra"], "b.svg");
		expect(svg).toMatchObject({ arquivo: join(dados, "outra", "b.svg"), tipo: "image/svg+xml", tamanho: 6 });
	});

	it("nome solto sem pastas, ou que não existe: undefined", async () => {
		expect(await acharImagem(dados, [], "a.png")).toBeUndefined();
		expect(await acharImagem(dados, ["viz"], "nao.png")).toBeUndefined();
	});

	it("caminho com pasta: o arquivo exato, mesmo fora das pastas de imagens", async () => {
		expect((await acharImagem(dados, ["viz"], "outra/a.png"))?.tipo).toBe("image/png");
		expect(await acharImagem(dados, ["viz"], "outra/nao.png")).toBeUndefined();
	});

	it("uma pasta que é atalho para fora da pasta de dados não vale", async () => {
		try {
			await symlink(raiz, join(dados, "atalho"), "junction");
		} catch {
			return; // sem permissão para criar o atalho nesta máquina
		}
		expect(await acharImagem(dados, ["atalho"], "fora.png")).toBeUndefined();
		expect(await acharImagem(dados, [], "atalho/fora.png")).toBeUndefined();
	});
});
