import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Import dinâmico por variável: o tsc não segue o lançador (que não é checado como JS tipado).
const caminho = pathToFileURL(resolve(__dirname, "..", "..", "..", "launcher", "iniciar.mjs")).href;
const { lerArgumentos } = (await import(/* @vite-ignore */ caminho)) as { lerArgumentos: (argv: string[]) => { bandeja: boolean } };

describe("lerArgumentos do launcher/iniciar.mjs", () => {
	it("--bandeja liga o modo só bandeja", () => {
		expect(lerArgumentos(["--bandeja"])).toEqual({ bandeja: true });
		expect(lerArgumentos(["x", "--bandeja"])).toEqual({ bandeja: true });
	});

	it("sem argumentos, abre a janela principal", () => {
		expect(lerArgumentos([])).toEqual({ bandeja: false });
	});
});
