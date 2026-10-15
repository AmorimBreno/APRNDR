// Encerra o app que o lançador subiu. Chamado pelo parar.vbs (atalho "Parar
// Estudos") ou direto: node launcher\parar.mjs.
//
// Duas etapas:
// 1. A árvore do pnpm dev: o iniciar.mjs grava o PID do cmd raiz em
//    %LOCALAPPDATA%\estudos-app\lancador.pid.json. Antes de matar, confere que
//    o PID ainda é aquele cmd do pnpm dev (o Windows reaproveita PIDs) e então
//    roda taskkill /T /F, que leva junto pnpm, servidor, Vite e esbuild.
// 2. O que ainda escuta nas portas 7430 e 7431: só é encerrado se for um
//    node.exe cuja linha de comando aponta para este repositório. Qualquer outra
//    coisa (outro programa, o Edge) fica de fora e só aparece no log.
//
// O /F é necessário porque processos de console sem janela não recebem pedido
// de fechamento do taskkill. O servidor morre sem a limpeza do encerramento; a
// especificação aceita interromper uma resposta em andamento.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
	ARQUIVO_PID,
	RAIZ,
	avisar,
	descreverProcesso,
	listarProcessos,
	processoVivo,
	processosNasPortas,
	registrar,
} from "./comum.mjs";

function matarArvore(pid, motivo) {
	registrar(`taskkill /T /F /PID ${pid} (${motivo})`);
	try {
		execFileSync("taskkill.exe", ["/T", "/F", "/PID", String(pid)], { encoding: "utf8", windowsHide: true, stdio: "pipe" });
	} catch (erro) {
		// Sai com erro também quando parte da árvore já tinha morrido; o que
		// importa é conferir as portas depois.
		registrar(`taskkill terminou com aviso: ${(erro.stdout || erro.stderr || erro.message).toString().trim()}`);
	}
}

/** A linha de comando aponta para este repositório? (comparação sem caixa, como no Windows) */
function eDoRepositorio(comando) {
	return typeof comando === "string" && comando.toLowerCase().includes(RAIZ.toLowerCase());
}

/**
 * Processo de um pnpm dev que não foi o lançador que subiu (por exemplo, rodado
 * num terminal)? Matar só o node da porta deixaria vivos o dev.mjs (que fica
 * esperando mudança de código) e o pnpm. Por isso sobe pelos pais enquanto eles
 * forem claramente da cadeia do pnpm dev: node.exe ou cmd.exe com o caminho do
 * repositório, o dev.mjs, o vite ou o pnpm dev na linha de comando. Para no
 * primeiro que não for (o terminal, o PowerShell, o explorer), que fica intocado.
 */
function topoDoApp(pid, todos) {
	const daCadeia = (p) =>
		p &&
		["node.exe", "cmd.exe"].includes(p.nome?.toLowerCase()) &&
		(eDoRepositorio(p.comando) || /dev\.mjs|\bvite\b|\bpnpm\b.*\bdev\b/i.test(p.comando ?? ""));
	let atual = pid;
	const vistos = new Set([pid]);
	for (;;) {
		const pai = todos.get(todos.get(atual)?.ppid);
		if (!daCadeia(pai) || vistos.has(pai.pid)) return atual;
		vistos.add(pai.pid);
		atual = pai.pid;
	}
}

function principal() {
	registrar("parar: início.");
	let matouAlgo = false;

	// 1. Árvore do pnpm dev gravada pelo lançador.
	if (existsSync(ARQUIVO_PID)) {
		let pid;
		try {
			pid = JSON.parse(readFileSync(ARQUIVO_PID, "utf8")).pid;
		} catch {
			registrar("lancador.pid.json ilegível; ignorado.");
		}
		if (pid && processoVivo(pid)) {
			const processo = descreverProcesso(pid);
			if (processo?.nome?.toLowerCase() === "cmd.exe" && /pnpm\s+dev/i.test(processo.comando ?? "")) {
				matarArvore(pid, "pnpm dev iniciado pelo lançador");
				matouAlgo = true;
			} else {
				registrar(`o PID ${pid} gravado agora é outro processo (${processo?.nome ?? "?"}); não foi tocado.`);
			}
		} else {
			registrar("o pnpm dev gravado pelo lançador já não estava rodando.");
		}
		rmSync(ARQUIVO_PID, { force: true });
	} else {
		registrar("nenhum pnpm dev gravado pelo lançador.");
	}

	// 2. Sobras nas portas (por exemplo, um pnpm dev que não foi o lançador que
	// subiu, ou um neto que escapou da árvore). Se a etapa 1 matou algo, dá meio
	// segundo para o sistema liberar as portas antes de olhar.
	if (matouAlgo) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); // pausa síncrona
	const sobras = processosNasPortas();
	const recusados = [];
	const encerrados = new Set();
	const todos = sobras.length ? listarProcessos() : new Map();
	for (const { porta, pid, nome, comando } of sobras) {
		if (nome?.toLowerCase() === "node.exe" && eDoRepositorio(comando)) {
			const topo = topoDoApp(pid, todos);
			if (encerrados.has(topo)) continue; // a mesma árvore escuta nas duas portas
			encerrados.add(topo);
			matarArvore(topo, `node do app na porta ${porta}${topo !== pid ? ` (a partir do ancestral ${topo})` : ""}`);
		} else {
			registrar(`porta ${porta}: processo ${pid} (${nome ?? "?"}) não é do app; não foi tocado.`);
			recusados.push(`porta ${porta}: ${nome ?? "?"} (pid ${pid})`);
		}
	}

	const restantes = processosNasPortas();
	if (restantes.length === 0) {
		registrar("parar: portas 7430 e 7431 livres.");
		return;
	}
	const lista = restantes.map((r) => `porta ${r.porta}: ${r.nome ?? "?"} (pid ${r.pid})`).join("\n");
	registrar(`parar: portas ainda ocupadas: ${lista.replace(/\n/g, "; ")}`);
	avisar(
		`Nem tudo foi encerrado. Ainda escutando:\n${lista}\n\n` +
			(recusados.length ? "Esses processos não parecem ser do app, por isso não foram encerrados." : "Tente de novo em alguns segundos."),
	);
	process.exitCode = 1;
}

try {
	principal();
} catch (erro) {
	registrar(`parar: erro inesperado: ${erro?.stack ?? erro}`);
	avisar(`Não consegui parar o app: ${erro?.message ?? erro}`);
	process.exitCode = 1;
}
