import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ESPERAS_PADRAO, gravarDeUmaVez, renomearComInsistencia } from "./arquivos.ts";

function erroCom(codigo: string): NodeJS.ErrnoException {
	const erro = new Error(`${codigo}: falso`) as NodeJS.ErrnoException;
	erro.code = codigo;
	return erro;
}

const semEspera = async () => {};

let pasta: string;
beforeEach(async () => {
	pasta = await mkdtemp(join(tmpdir(), "estudos-arquivos-"));
});
afterEach(async () => {
	await rm(pasta, { recursive: true, force: true });
});

describe("renomearComInsistencia", () => {
	it("tenta de novo depois de três EPERM e passa", async () => {
		let chamadas = 0;
		const esperas: number[] = [];
		await renomearComInsistencia("a", "b", {
			renomear: async () => {
				chamadas++;
				if (chamadas <= 3) throw erroCom("EPERM");
			},
			esperar: async (ms) => {
				esperas.push(ms);
			},
		});
		expect(chamadas).toBe(4);
		expect(esperas).toEqual([10, 20, 40]);
	});

	it("tenta de novo também em EBUSY e EACCES", async () => {
		const erros = ["EBUSY", "EACCES"];
		let chamadas = 0;
		await renomearComInsistencia("a", "b", {
			renomear: async () => {
				const erro = erros[chamadas++];
				if (erro) throw erroCom(erro);
			},
			esperar: semEspera,
		});
		expect(chamadas).toBe(3);
	});

	it("erro de outro tipo sobe na hora", async () => {
		let chamadas = 0;
		await expect(
			renomearComInsistencia("a", "b", {
				renomear: async () => {
					chamadas++;
					throw erroCom("ENOENT");
				},
				esperar: semEspera,
			}),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(chamadas).toBe(1);
	});

	it("esgotadas as tentativas, sobe o último erro", async () => {
		let chamadas = 0;
		await expect(
			renomearComInsistencia("a", "b", {
				renomear: async () => {
					chamadas++;
					throw erroCom(chamadas < 34 ? "EBUSY" : "EPERM");
				},
				esperar: semEspera,
			}),
		).rejects.toMatchObject({ code: "EPERM" });
		expect(chamadas).toBe(34);
		expect(ESPERAS_PADRAO.length).toBe(33);
		expect(ESPERAS_PADRAO.reduce((a, b) => a + b, 0)).toBe(3050);
	});
});

describe("gravarDeUmaVez", () => {
	it("grava o conteúdo e não deixa o temporário", async () => {
		const arquivo = join(pasta, "x.json");
		await gravarDeUmaVez(arquivo, "um");
		await gravarDeUmaVez(arquivo, "dois");
		expect(await readFile(arquivo, "utf8")).toBe("dois");
		expect(await readdir(pasta)).toEqual(["x.json"]);
	});

	it("esgotadas as tentativas, sobe o erro e apaga o temporário", async () => {
		const arquivo = join(pasta, "x.json");
		await expect(
			gravarDeUmaVez(arquivo, "conteúdo", {
				renomear: async () => {
					throw erroCom("EPERM");
				},
				esperar: semEspera,
			}),
		).rejects.toMatchObject({ code: "EPERM" });
		expect(await readdir(pasta)).toEqual([]);
	});

	it("grava 200 vezes enquanto outro laço lê sem parar, sem nenhuma falha", async () => {
		const arquivo = join(pasta, "lido.json");
		await gravarDeUmaVez(arquivo, JSON.stringify({ n: -1 }));
		let gravando = true;
		let leituras = 0;
		const lendo = (async () => {
			while (gravando) {
				// Cada leitura precisa achar um arquivo inteiro, nunca pela metade.
				JSON.parse(await readFile(arquivo, "utf8"));
				leituras++;
			}
		})();
		try {
			for (let n = 0; n < 200; n++) await gravarDeUmaVez(arquivo, JSON.stringify({ n, texto: "x".repeat(2000) }));
		} finally {
			gravando = false;
			await lendo;
		}
		expect(JSON.parse(await readFile(arquivo, "utf8")).n).toBe(199);
		expect(leituras).toBeGreaterThan(0);
		expect(await readdir(pasta)).toEqual(["lido.json"]);
	}, 60_000);
});
