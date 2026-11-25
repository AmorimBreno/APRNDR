// A ponte da bolinha que o front exige (apps/web/src/desktop.ts, lerPonteFlutuante) precisa existir inteira no
// preload: faltando uma função, o front trata a janela como navegador comum e o balão sai cortado (aconteceu com
// "disposicao" em 2026-11-25). O preload roda só no Electron, então o teste confere o texto dele.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(import.meta.dirname, "..", "..", "..");

describe("a ponte da bolinha no preload", () => {
	it("tem todas as funções que o front confere", () => {
		const front = readFileSync(join(raiz, "apps", "web", "src", "desktop.ts"), "utf8");
		const lista = /const nomes = \[([^\]]+)\]/.exec(front)?.[1];
		expect(lista).toBeDefined();
		const nomes = [...lista!.matchAll(/"([a-zA-Z]+)"/g)].map((achado) => achado[1]!);
		expect(nomes.length).toBeGreaterThan(5);
		const preload = readFileSync(join(raiz, "apps", "desktop", "src", "preload.cjs"), "utf8");
		for (const nome of nomes) expect(preload, nome).toMatch(new RegExp(`(^|[^A-Za-z])${nome}:`, "m"));
	});
});
