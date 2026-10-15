// Modo de desenvolvimento do servidor: roda src/index.ts com o tsx e reinicia
// quando o código do servidor ou do núcleo muda. Faz o papel do "tsx watch",
// com uma diferença que importa no Windows.
//
// Por que não o tsx watch: para reiniciar, ele chama child.kill("SIGTERM"), e
// no Windows isso vira TerminateProcess: o processo morre na hora, sem nenhum
// tratador de sinal rodar (conferido com um script de teste: nem o SIGTERM nem
// o evento "exit" chegam). O servidor então não descartava as janelas. Aqui o
// reinício pede o encerramento pelo canal IPC ({tipo: "encerrar"}); o servidor
// descarta as janelas, fecha a porta e sai. Se não sair em 6 s, é morto.
//
// O que observa: apps/server/src e packages/core/src (o núcleo é consumido do
// código-fonte, então mudar o núcleo também precisa reiniciar). Arquivos de
// teste (*.test.ts) não reiniciam.

import { fork } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pastaServidor = dirname(fileURLToPath(import.meta.url));
const pastas = [join(pastaServidor, "src"), join(pastaServidor, "..", "..", "packages", "core", "src")];
const ESPERA_MS = 200;
const LIMITE_ENCERRAMENTO_MS = 6000;

function registrar(mensagem) {
	console.log(`[dev] ${mensagem}`);
}

/** @type {import("node:child_process").ChildProcess | undefined} */
let filho;
let encerrandoTudo = false;

function iniciar() {
	filho = fork(join(pastaServidor, "src", "index.ts"), [], {
		cwd: pastaServidor,
		execArgv: ["--import", "tsx"],
		stdio: ["ignore", "inherit", "inherit", "ipc"],
	});
	const atual = filho;
	atual.on("exit", (codigo, sinal) => {
		if (filho === atual) filho = undefined;
		if (!encerrandoTudo && !reiniciando) registrar(`o servidor saiu (${sinal ?? codigo}); esperando mudança no código para subir de novo.`);
	});
}

/** Pede ao servidor para encerrar e espera ele sair (ou mata depois do limite). */
function parar() {
	const atual = filho;
	if (!atual || atual.exitCode !== null || atual.signalCode !== null) return Promise.resolve();
	return new Promise((resolver) => {
		const limite = setTimeout(() => {
			registrar("o servidor não saiu a tempo; matando.");
			atual.kill("SIGKILL");
		}, LIMITE_ENCERRAMENTO_MS);
		atual.once("exit", () => {
			clearTimeout(limite);
			resolver();
		});
		if (atual.connected) atual.send({ tipo: "encerrar" });
		else atual.kill("SIGKILL");
	});
}

let reiniciando = false;
let pendente = false;
async function reiniciar(arquivo) {
	if (reiniciando) {
		pendente = true;
		return;
	}
	reiniciando = true;
	registrar(`mudança em ${arquivo}; reiniciando o servidor.`);
	await parar();
	reiniciando = false;
	if (encerrandoTudo) return;
	iniciar();
	if (pendente) {
		pendente = false;
		void reiniciar("(mudanças durante o reinício)");
	}
}

let temporizador;
let ultimo = "";
for (const pasta of pastas) {
	if (!existsSync(pasta)) continue;
	watch(pasta, { recursive: true }, (_tipo, nome) => {
		if (!nome) return;
		const relativo = nome.toString();
		if (!/\.(ts|mts|js|mjs|json)$/.test(relativo) || /\.test\.ts$/.test(relativo)) return;
		ultimo = relativo;
		clearTimeout(temporizador);
		temporizador = setTimeout(() => void reiniciar(ultimo), ESPERA_MS);
	});
}

async function sair() {
	if (encerrandoTudo) return;
	encerrandoTudo = true;
	await parar();
	process.exit(0);
}
for (const sinal of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sinal, () => void sair());

iniciar();
