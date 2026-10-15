// Instala a configuração global do pi versionada em pi-global/ no diretório do
// agente (~/.pi/agent, ou PI_CODING_AGENT_DIR, como diz a doc configuration.md).
// Rode de novo sempre que mudar algo em pi-global/.
//
// Por que copiar em vez de criar link: a doc do pi avisa que links podem não ser
// encontrados na descoberta de extensões. Copiar é mais previsível no Windows.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "pi-global");
const agente = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");

console.log(`Diretório do agente: ${agente}`);

// 1. Extensões: cada subpasta é apagada e copiada de novo, para não sobrar
// arquivo antigo que já foi removido do repositório.
const extOrigem = join(origem, "extensions");
const extDestino = join(agente, "extensions");
mkdirSync(extDestino, { recursive: true });
for (const item of readdirSync(extOrigem, { withFileTypes: true })) {
	if (!item.isDirectory()) continue;
	const destino = join(extDestino, item.name);
	rmSync(destino, { recursive: true, force: true });
	cpSync(join(extOrigem, item.name), destino, { recursive: true });
	console.log(`Extensão copiada: ${item.name}`);
}

// 2. settings.json: mescla raso. Chaves que só existem no arquivo local (por
// exemplo, mudadas pelo /settings do pi) são preservadas; as do repo vencem.
const settingsRepo = JSON.parse(readFileSync(join(origem, "settings.json"), "utf8"));
const settingsCaminho = join(agente, "settings.json");
const settingsAtual = existsSync(settingsCaminho)
	? JSON.parse(readFileSync(settingsCaminho, "utf8"))
	: {};
let mudou = false;
for (const [chave, valor] of Object.entries(settingsRepo)) {
	const antes = settingsAtual[chave];
	if (JSON.stringify(antes) !== JSON.stringify(valor)) {
		console.log(`settings: ${chave}: ${JSON.stringify(antes)} -> ${JSON.stringify(valor)}`);
		mudou = true;
	}
}
const settingsFinal = { ...settingsAtual, ...settingsRepo };
writeFileSync(settingsCaminho, JSON.stringify(settingsFinal, null, 2) + "\n");
console.log(mudou ? `settings.json atualizado: ${settingsCaminho}` : "settings.json já estava em dia.");

// 3. Chaves de API: só avisa se faltam, nunca mostra o valor. No Windows também
// olha as variáveis de usuário no registro, porque este processo pode ter sido
// aberto antes de o Breno defini-las.
function definidaNoRegistro(nome) {
	if (process.platform !== "win32") return false;
	try {
		execFileSync("reg", ["query", "HKCU\\Environment", "/v", nome], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
for (const nome of ["OPENROUTER_API_KEY", "TAVILY_API_KEY"]) {
	if (process.env[nome]) continue;
	if (definidaNoRegistro(nome)) {
		console.log(`Aviso: ${nome} está nas variáveis de usuário, mas não neste terminal. Abra um terminal novo.`);
	} else {
		console.log(`Aviso: ${nome} não está definida. Defina nas variáveis de ambiente do usuário do Windows.`);
	}
}
