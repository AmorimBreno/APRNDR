// O remendo do cliente do Vite (vite-sem-recarregar.ts): troca só o trecho que recarrega a página ao voltar a
// conexão, e o ajudante gerado só recarrega quando o id do servidor muda.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { remendarClienteDoVite, ROTA_ID_DO_SERVIDOR } from "./vite-sem-recarregar.ts";

const TRECHO = `
				console.log(\`[vite] server connection lost. Polling for restart...\`);
				await waitForSuccessfulPing(url.href);
				location.reload();
			}
		}
		break;
	case "full-reload":
		pageReload();`;

describe("remendarClienteDoVite", () => {
	it("troca só a recarga depois do ping e mantém o resto", () => {
		const remendado = remendarClienteDoVite(TRECHO)!;
		expect(remendado).toContain("await waitForSuccessfulPing(url.href); await __recarregarSeOServidorMudou();");
		expect(remendado).not.toContain("await waitForSuccessfulPing(url.href);\n\t\t\t\tlocation.reload();");
		// A recarga do full-reload (pageReload) e a do servidor reiniciado continuam.
		expect(remendado).toContain("pageReload();");
		expect(remendado).toContain("if (!antes || !agora || antes !== agora) location.reload();");
		expect(remendado).toContain(ROTA_ID_DO_SERVIDOR);
	});

	it("não mexe em código que não tem o trecho (outra versão do Vite)", () => {
		expect(remendarClienteDoVite("location.reload();")).toBeUndefined();
	});

	it("acha o trecho no cliente do Vite instalado (se mudar de versão, o remendo precisa ser revisto)", () => {
		const pacote = createRequire(import.meta.url).resolve("vite/package.json");
		const cliente = readFileSync(join(dirname(pacote), "dist", "client", "client.mjs"), "utf8");
		expect(remendarClienteDoVite(cliente)).toBeDefined();
	});

	it("o ajudante recarrega se o id do servidor mudou ou não deu para conferir, e não recarrega com o mesmo id", async () => {
		const remendado = remendarClienteDoVite(TRECHO)!;
		const ajudante = remendado.slice(remendado.indexOf("const __idDoServidorAoAbrir"));
		const rodar = async (ids: Array<string | Error>) => {
			const recarregar = vi.fn();
			const respostas = [...ids];
			const buscar = vi.fn(async () => {
				const proxima = respostas.shift()!;
				if (proxima instanceof Error) throw proxima;
				return { text: async () => proxima };
			});
			const executar = new Function("fetch", "location", "console", `${ajudante}\nreturn __recarregarSeOServidorMudou();`);
			await executar(buscar, { reload: recarregar }, { log: () => {} });
			return recarregar.mock.calls.length;
		};
		expect(await rodar(["a", "a"])).toBe(0);
		expect(await rodar(["a", "b"])).toBe(1);
		expect(await rodar([new Error("fora"), "b"])).toBe(1);
		expect(await rodar(["a", new Error("fora")])).toBe(1);
	});
});
