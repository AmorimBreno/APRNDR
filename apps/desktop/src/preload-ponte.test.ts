// As pontes que o front exige (apps/web/src/desktop.ts: nomesFlutuante e nomesBalao) precisam existir inteiras no preload:
// faltando uma função, o front trata a janela como navegador comum e o balão sai sem ponte (aconteceu com "disposicao" em
// 2026-11-25). O preload roda só no Electron, então o teste confere o texto dele: cada função das duas listas está na
// ponte certa (a da bolinha em "flutuante", a do balão em "balao"), e cada ponte só vai para a sua janela.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(import.meta.dirname, "..", "..", "..");
const front = readFileSync(join(raiz, "apps", "web", "src", "desktop.ts"), "utf8");
const preload = readFileSync(join(raiz, "apps", "desktop", "src", "preload.cjs"), "utf8");

function lista(nome: string): string[] {
	const texto = new RegExp(`const ${nome} = \\[([^\\]]+)\\]`).exec(front)?.[1];
	expect(texto, nome).toBeDefined();
	return [...texto!.matchAll(/"([a-zA-Z]+)"/g)].map((achado) => achado[1]!);
}

/** O texto do objeto `const <nome> = { ... };` do preload. */
function ponte(nome: string): string {
	const achado = new RegExp(`const ${nome} = \\{([\\s\\S]*?)\\n\\};`).exec(preload)?.[1];
	expect(achado, nome).toBeDefined();
	return achado!;
}

describe("as pontes do preload", () => {
	it("a ponte da bolinha tem todas as funções que o front confere", () => {
		const nomes = lista("nomesFlutuante");
		expect(nomes.length).toBeGreaterThan(3);
		const corpo = ponte("flutuante");
		for (const nome of [...nomes, "menu"]) expect(corpo, nome).toMatch(new RegExp(`(^|[^A-Za-z])${nome}:`, "m"));
	});

	it("a ponte do balão tem todas as funções que o front confere", () => {
		const nomes = lista("nomesBalao");
		expect(nomes.length).toBeGreaterThan(5);
		const corpo = ponte("balao");
		for (const nome of nomes) expect(corpo, nome).toMatch(new RegExp(`(^|[^A-Za-z])${nome}:`, "m"));
	});

	it("cada ponte só vai para a sua janela, e o liga e desliga vai para todas", () => {
		expect(preload).toMatch(/ehFlutuante \? \{ flutuante \}/);
		expect(preload).toMatch(/ehBalao \? \{ balao \}/);
		expect(preload).toContain("--estudos-janela=flutuante");
		expect(preload).toContain("--estudos-janela=balao");
		expect(preload).toMatch(/bolinha: \{[\s\S]*ligada:[\s\S]*ligar:/);
	});

	it("os canais do preload têm quem responda no Electron (flutuante.mjs)", () => {
		const principal = readFileSync(join(raiz, "apps", "desktop", "src", "flutuante.mjs"), "utf8");
		const canais = [...preload.matchAll(/"(estudos:[a-z:-]+)"/g)].map((achado) => achado[1]!);
		expect(canais.length).toBeGreaterThan(8);
		for (const canal of new Set(canais)) {
			// "estudos:sair" é do main.mjs, não do flutuante.
			if (canal === "estudos:sair") continue;
			expect(principal, canal).toContain(`"${canal}"`);
		}
	});
});
