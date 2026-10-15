// Lançador do app, chamado pelo iniciar.vbs (o atalho "Estudos" da área de
// trabalho). Confere se o app já está no ar; se não, sobe o `pnpm dev` em
// segundo plano, sem janela; espera a saúde responder; e abre o Edge em modo
// app. Registra tudo em %LOCALAPPDATA%\estudos-app\logs\lancador-AAAA-MM-DD.log.
//
// Uso: node launcher\iniciar.mjs (ou wscript launcher\iniciar.vbs, sem janela).
// Variáveis de ambiente opcionais:
//   ESTUDOS_SEM_NAVEGADOR=1  não abre o navegador (para testes);
//   ESTUDOS_ESPERA_S=N       tempo limite para o app subir (padrão 90 s).
//
// Como o pnpm dev sobe sem janela (conferido na prática no Windows 11, onde o
// terminal padrão é o Windows Terminal):
// - Filho comum do node (spawn sem detached) não serve: o libuv põe os filhos
//   diretos num job object com "matar ao fechar", então o filho morre quando
//   este lançador sai (os netos escapam, mas a árvore fica pela metade).
// - spawn com detached também não: o filho nasce sem console, e cada neto de
//   console (pnpm -> node -> tsx, vite, esbuild) cria um console novo, que o
//   Windows 11 entrega ao Windows Terminal, com janela visível.
// - O que funciona: o PowerShell faz Start-Process -WindowStyle Hidden de um
//   cmd.exe que roda o pnpm dev. O cmd ganha um console próprio escondido, fora
//   do job do node; os netos herdam esse console (sem janela nova) e tudo
//   continua rodando depois que este lançador sai. O PID do cmd fica gravado
//   em lancador.pid.json para o parar.mjs encerrar a árvore inteira.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ARQUIVO_PID,
	PASTA_APP,
	PASTA_LOGS,
	RAIZ,
	URL_APP,
	URL_SAUDE,
	avisar,
	dataLocal,
	descreverProcesso,
	powershell,
	processoVivo,
	registrar,
} from "./comum.mjs";

const ESPERA_MS = (Number(process.env.ESTUDOS_ESPERA_S) || 90) * 1000;
const INTERVALO_MS = 1000;

/** GET com tempo limite curto; true se respondeu 2xx (e, se pedido, com { ok: true }). */
async function responde(url, conferirOk = false) {
	try {
		const resposta = await fetch(url, { signal: AbortSignal.timeout(2000) });
		if (!resposta.ok) return false;
		if (!conferirOk) return true;
		const corpo = await resposta.json();
		return corpo?.ok === true;
	} catch {
		return false;
	}
}

/** O app está no ar quando o servidor (saúde) e o Vite (página) respondem. */
async function appNoAr() {
	const [servidor, web] = await Promise.all([responde(URL_SAUDE, true), responde(`${URL_APP}/`)]);
	return { servidor, web, ambos: servidor && web };
}

/** PID gravado por um lançamento anterior, se o processo ainda for aquele cmd do pnpm dev. */
function pidAnteriorVivo() {
	if (!existsSync(ARQUIVO_PID)) return undefined;
	try {
		const { pid } = JSON.parse(readFileSync(ARQUIVO_PID, "utf8"));
		if (!pid || !processoVivo(pid)) return undefined;
		// O Windows reaproveita PIDs: só vale se ainda for o cmd que roda o pnpm dev.
		const processo = descreverProcesso(pid);
		if (processo?.nome?.toLowerCase() === "cmd.exe" && /pnpm\s+dev/i.test(processo.comando ?? "")) return pid;
	} catch {
		// Arquivo corrompido: trata como se não houvesse.
	}
	return undefined;
}

/** Sobe o pnpm dev escondido (ver o comentário do topo) e devolve o PID do cmd. */
function iniciarPnpmDev() {
	mkdirSync(PASTA_LOGS, { recursive: true });
	const logDev = join(PASTA_LOGS, `dev-${dataLocal()}.log`);
	// `< NUL`: entrada padrão vazia, como no script dev do servidor; `>>`: os
	// lançamentos do mesmo dia se acumulam no mesmo arquivo.
	const pid = powershell(
		`$p = Start-Process -FilePath cmd.exe -ArgumentList ('/d /c pnpm dev >> "' + $env:ESTUDOS_PS_LOG + '" 2>&1 < NUL') ` +
			`-WorkingDirectory $env:ESTUDOS_PS_RAIZ -WindowStyle Hidden -PassThru; $p.Id`,
		{ ESTUDOS_PS_LOG: logDev, ESTUDOS_PS_RAIZ: RAIZ },
	).trim();
	const numero = Number(pid);
	if (!Number.isInteger(numero) || numero <= 0) throw new Error(`o Start-Process não devolveu um PID válido: ${JSON.stringify(pid)}`);
	mkdirSync(PASTA_APP, { recursive: true });
	writeFileSync(ARQUIVO_PID, JSON.stringify({ pid: numero, inicio: new Date().toISOString(), log: logDev }, null, 2) + "\n");
	registrar(`pnpm dev iniciado escondido (cmd pid ${numero}); saída em ${logDev}`);
	return { pid: numero, logDev };
}

/** Caminhos possíveis do Edge e do Chrome, na ordem de preferência. */
function acharNavegador() {
	const pastas = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
	const candidatos = [
		...pastas.map((p) => join(p, "Microsoft", "Edge", "Application", "msedge.exe")),
		...pastas.map((p) => join(p, "Google", "Chrome", "Application", "chrome.exe")),
	];
	return candidatos.find((c) => existsSync(c));
}

/**
 * Abre o app. detached é obrigatório aqui: sem ele, o navegador entraria no job
 * do node e seria fechado quando este lançador saísse.
 */
function abrirNavegador() {
	if (process.env.ESTUDOS_SEM_NAVEGADOR === "1") {
		registrar("ESTUDOS_SEM_NAVEGADOR=1: navegador não aberto.");
		return;
	}
	const navegador = acharNavegador();
	if (navegador) {
		registrar(`abrindo ${navegador} --app=${URL_APP}`);
		spawn(navegador, [`--app=${URL_APP}`], { detached: true, stdio: "ignore" }).unref();
	} else {
		registrar(`Edge e Chrome não encontrados; abrindo ${URL_APP} no navegador padrão.`);
		spawn("explorer.exe", [URL_APP], { detached: true, stdio: "ignore" }).unref();
	}
}

async function principal() {
	registrar(`lançador iniciado (Node ${process.version}, raiz ${RAIZ})`);

	const estado = await appNoAr();
	if (estado.ambos) {
		registrar("o app já está no ar; só abrindo o navegador.");
		abrirNavegador();
		return;
	}

	// Um clique duplo no atalho, ou o app ainda carregando de um clique anterior:
	// se o pnpm dev que o lançador subiu ainda está vivo, só espera por ele.
	let pid = pidAnteriorVivo();
	let logDev;
	if (pid) {
		registrar(`o pnpm dev de um lançamento anterior (cmd pid ${pid}) ainda está vivo; esperando ele responder.`);
		try {
			logDev = JSON.parse(readFileSync(ARQUIVO_PID, "utf8")).log;
		} catch {}
	} else {
		if (existsSync(ARQUIVO_PID)) rmSync(ARQUIVO_PID, { force: true });
		registrar(`app fora do ar (servidor: ${estado.servidor ? "sim" : "não"}, front: ${estado.web ? "sim" : "não"}); subindo o pnpm dev.`);
		({ pid, logDev } = iniciarPnpmDev());
	}
	logDev ??= join(PASTA_LOGS, `dev-${dataLocal()}.log`);

	const inicio = Date.now();
	while (Date.now() - inicio < ESPERA_MS) {
		await new Promise((r) => setTimeout(r, INTERVALO_MS));
		if ((await appNoAr()).ambos) {
			registrar(`app no ar em ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
			abrirNavegador();
			return;
		}
		if (!processoVivo(pid)) {
			// O pnpm dev saiu antes de responder (porta ocupada, erro de código, pnpm ausente...).
			rmSync(ARQUIVO_PID, { force: true });
			avisar(`O app não subiu: o pnpm dev terminou antes de responder.\n\nAbra o log para ver o erro:\n${logDev}`);
			process.exitCode = 1;
			return;
		}
	}
	avisar(
		`O app não respondeu em ${ESPERA_MS / 1000} s.\n\nAbra o log para ver o que aconteceu:\n${logDev}\n\n` +
			`O pnpm dev pode continuar subindo; para encerrá-lo, use o atalho "Parar Estudos".`,
	);
	process.exitCode = 1;
}

principal().catch((erro) => {
	registrar(`erro inesperado: ${erro?.stack ?? erro}`);
	avisar(`O lançador do app falhou: ${erro?.message ?? erro}\n\nVeja o log em ${PASTA_LOGS}`);
	process.exitCode = 1;
});
