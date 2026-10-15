// Partes comuns do iniciar.mjs e do parar.mjs: caminhos, portas, log do
// lançador e chamadas ao PowerShell. Node puro, sem dependências, para o
// lançador funcionar mesmo antes do pnpm install.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz do repositório: launcher/ -> uma pasta acima. */
export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Mesmas portas de apps/web/vite.config.ts (front) e apps/server/src/config.ts (servidor). */
export const PORTA_WEB = 7430;
export const PORTA_SERVIDOR = 7431;
export const URL_APP = `http://localhost:${PORTA_WEB}`;
export const URL_SAUDE = `http://localhost:${PORTA_SERVIDOR}/api/saude`;

/** %LOCALAPPDATA%\estudos-app, a mesma pasta local do servidor (fora da pasta de dados). */
export const PASTA_APP = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "estudos-app");
export const PASTA_LOGS = join(PASTA_APP, "logs");

/**
 * Arquivo com o PID do processo raiz do pnpm dev que o lançador iniciou. O
 * parar.mjs usa para encerrar a árvore inteira, e o iniciar.mjs para não subir
 * uma segunda cópia enquanto a primeira ainda está carregando.
 */
export const ARQUIVO_PID = join(PASTA_APP, "lancador.pid.json");

/** Data local AAAA-MM-DD, no mesmo formato dos logs do servidor. */
export function dataLocal(agora = new Date()) {
	const dois = (n) => String(n).padStart(2, "0");
	return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** Escreve uma linha em logs\lancador-AAAA-MM-DD.log (e no console, útil ao rodar no terminal). */
export function registrar(mensagem) {
	const agora = new Date();
	const linha = `${agora.toISOString()} [pid ${process.pid}] ${mensagem}`;
	console.log(linha);
	try {
		mkdirSync(PASTA_LOGS, { recursive: true });
		appendFileSync(join(PASTA_LOGS, `lancador-${dataLocal(agora)}.log`), `${linha}\n`);
	} catch {
		// Sem log não é motivo para o lançador falhar.
	}
}

/**
 * Roda um trecho de PowerShell e devolve a saída. Valores variáveis vão por
 * variáveis de ambiente (ESTUDOS_PS_*), nunca colados no texto do comando,
 * para não ter problema de aspas com caminhos.
 *
 * windowsHide: quando o lançador roda pelo .vbs, o node já está num console
 * escondido e o PowerShell herda esse console; quando roda num terminal, o
 * PowerShell usa o próprio terminal. Em nenhum caso abre janela nova.
 */
export function powershell(script, ambiente = {}) {
	return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
		encoding: "utf8",
		windowsHide: true,
		env: { ...process.env, ...ambiente },
	});
}

/**
 * Mostra uma mensagem do Windows e espera o Breno clicar em OK. Usa o Popup do
 * WScript.Shell pelo PowerShell (não precisa carregar o WPF). Se até isso
 * falhar, a mensagem fica pelo menos no log do lançador.
 */
export function avisar(mensagem, titulo = "Estudos") {
	registrar(`aviso mostrado: ${mensagem.replace(/\r?\n/g, " | ")}`);
	try {
		powershell(
			"$null = (New-Object -ComObject WScript.Shell).Popup($env:ESTUDOS_PS_MENSAGEM, 0, $env:ESTUDOS_PS_TITULO, 48)",
			{ ESTUDOS_PS_MENSAGEM: mensagem, ESTUDOS_PS_TITULO: titulo },
		);
	} catch (erro) {
		registrar(`não consegui mostrar o aviso: ${erro.message}`);
	}
}

/** true se o processo existe (process.kill com sinal 0 só testa, no Windows também). */
export function processoVivo(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (erro) {
		return erro.code === "EPERM";
	}
}

/**
 * Processos que escutam nas portas do app, com nome e linha de comando, para o
 * parar.mjs decidir se são do app. Devolve [{ porta, pid, nome, comando }].
 */
export function processosNasPortas() {
	const saida = powershell(`
		$lista = @(Get-NetTCPConnection -State Listen -LocalPort ${PORTA_WEB},${PORTA_SERVIDOR} -ErrorAction SilentlyContinue |
			ForEach-Object {
				$p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
				[pscustomobject]@{ porta = $_.LocalPort; pid = $_.OwningProcess; nome = $p.Name; comando = $p.CommandLine }
			})
		ConvertTo-Json -InputObject $lista -Compress
	`).trim();
	if (!saida) return [];
	const lista = JSON.parse(saida);
	// Um listener em IPv4 e outro em IPv6 do mesmo processo aparecem duas vezes.
	const vistos = new Set();
	return lista.filter((item) => {
		const chave = `${item.porta}:${item.pid}`;
		if (vistos.has(chave)) return false;
		vistos.add(chave);
		return true;
	});
}

/** Todos os processos, para o parar.mjs subir pelos pais: Map pid -> { pid, ppid, nome, comando }. */
export function listarProcessos() {
	const saida = powershell(
		"ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; ppid = $_.ParentProcessId; nome = $_.Name; comando = $_.CommandLine } })",
	);
	return new Map(JSON.parse(saida).map((p) => [p.pid, p]));
}

/** Nome e linha de comando de um PID, ou undefined se ele não existe mais. */
export function descreverProcesso(pid) {
	const saida = powershell(
		"$p = Get-CimInstance Win32_Process -Filter \"ProcessId=$env:ESTUDOS_PS_PID\"; if ($p) { ConvertTo-Json -Compress @{ nome = $p.Name; comando = $p.CommandLine } }",
		{ ESTUDOS_PS_PID: String(pid) },
	).trim();
	return saida ? JSON.parse(saida) : undefined;
}
