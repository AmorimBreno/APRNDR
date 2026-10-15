// Chaves de API. Elas ficam nas variáveis de ambiente do usuário do Windows
// (ESPECIFICACAO 13.8). O pnpm dev pode rodar num terminal aberto antes de o
// Breno criar as chaves; nesse caso o processo não as herda. Então, para cada
// chave que falta no process.env, o servidor lê o registro do usuário
// (HKCU\Environment, o mesmo lugar que scripts/instalar-pi-global.mjs olha) e
// põe no process.env. O valor nunca é impresso nem registrado no log.

import { execFileSync } from "node:child_process";

export type OrigemChave = "processo" | "registro" | "ausente";

/**
 * Valor de uma variável de usuário do Windows, ou indefinido. Saída do reg:
 * "    NOME    REG_SZ    valor". REG_EXPAND_SZ tem %VARIAVEIS% expandidas.
 */
export function lerVariavelDeUsuario(nome: string): string | undefined {
	if (process.platform !== "win32") return undefined;
	let saida: string;
	try {
		saida = execFileSync("reg", ["query", "HKCU\\Environment", "/v", nome], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		});
	} catch {
		return undefined;
	}
	return interpretarSaidaReg(saida, nome);
}

/** Tira o valor da saída do `reg query`. Separado para testar sem o registro. */
export function interpretarSaidaReg(saida: string, nome: string): string | undefined {
	for (const linha of saida.split(/\r?\n/)) {
		const partes = linha.trim().match(/^(\S+)\s+(REG_SZ|REG_EXPAND_SZ)\s+(.*)$/);
		if (!partes || partes[1]?.toUpperCase() !== nome.toUpperCase()) continue;
		const valor = partes[3]?.trim() ?? "";
		if (!valor) return undefined;
		return partes[2] === "REG_EXPAND_SZ" ? valor.replace(/%([^%]+)%/g, (todo, variavel: string) => process.env[variavel] ?? todo) : valor;
	}
	return undefined;
}

/** Garante as chaves no process.env. Devolve de onde cada uma veio (nunca o valor). */
export function carregarChaves(nomes: readonly string[]): Record<string, OrigemChave> {
	const origens: Record<string, OrigemChave> = {};
	for (const nome of nomes) {
		if (process.env[nome]) {
			origens[nome] = "processo";
			continue;
		}
		const valor = lerVariavelDeUsuario(nome);
		if (valor) {
			process.env[nome] = valor;
			origens[nome] = "registro";
		} else {
			origens[nome] = "ausente";
		}
	}
	return origens;
}
