// Servidor do app: HTTP com Hono e WebSocket com a biblioteca ws, na mesma
// porta. Liga o núcleo (uma JanelaPerfil por perfil, em janelas.ts) ao front
// pelo protocolo de @estudos/core/protocolo.
//
// Por que ws direto em vez de @hono/node-ws: a versão atual do @hono/node-ws
// (1.3.1) exige @hono/node-server 1.x, e o atual é o 2.x. O ws atende o
// "upgrade" do mesmo servidor HTTP que o Hono usa, sem depender dessa ponte.
//
// Encerramento: descarta as janelas (aborta a resposta em andamento, avisa as
// extensões com session_shutdown) e fecha a porta. Vale para SIGINT, SIGTERM,
// SIGBREAK e para o pedido do dev.mjs ao reiniciar (mensagem "encerrar" pelo
// canal IPC). O pedido por IPC existe porque, no Windows, o tsx watch
// reiniciava matando o processo na hora (child.kill("SIGTERM") vira
// TerminateProcess), sem nenhum tratador de sinal rodar.

import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { getAgentDir } from "@estudos/core";
import { serve } from "@hono/node-server";
import type { MensagemServidor } from "@estudos/core/protocolo";
import { WebSocketServer, type WebSocket } from "ws";
import { criarApp } from "./app.ts";
import { carregarChaves } from "./chaves.ts";
import { CHAVES_API, ESPERA_WATCHER_MS, PASTA_LOGS, PASTA_PERFIS, PORTA_SERVIDOR } from "./config.ts";
import { tratarMensagem } from "./conexao.ts";
import { type Conexao, Janelas } from "./janelas.ts";
import { criarLog, ehSaidaQuebrada } from "./log.ts";
import { observar } from "./observador.ts";

const pacote = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const log = criarLog(PASTA_LOGS);

log.info(`Servidor iniciando (pid ${process.pid}, Node ${process.version}, versão ${pacote.version})`);

// Antes de qualquer sessão: as chaves podem estar só nas variáveis de usuário do Windows.
for (const [nome, origem] of Object.entries(carregarChaves(CHAVES_API))) {
	if (origem === "ausente") log.aviso(`${nome} não está definida (nem no processo nem nas variáveis de usuário do Windows).`);
	else log.info(`${nome}: ${origem === "processo" ? "veio do ambiente do processo" : "lida das variáveis de usuário do Windows"}`);
}

const janelas = new Janelas({ pastaPerfis: PASTA_PERFIS, log });
const app = criarApp(janelas, log, pacote.version);

// Lê os perfis já na partida, para o log e para o primeiro /api/perfis.
janelas.perfis().catch((erro: unknown) => log.erro("Erro ao ler os perfis", erro));

// --- WebSocket ------------------------------------------------------------------

const servidorWs = new WebSocketServer({ noServer: true });
let proximaConexao = 1;

servidorWs.on("connection", (socket: WebSocket) => {
	const conexao: Conexao = {
		id: proximaConexao++,
		enviar(mensagem: MensagemServidor) {
			if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(mensagem));
		},
	};
	log.info(`conexão ${conexao.id} aberta`);
	socket.on("message", (bruto) => {
		void tratarMensagem(janelas, conexao, bruto.toString(), log);
	});
	socket.on("close", () => {
		janelas.sair(conexao);
		log.info(`conexão ${conexao.id} fechada`);
	});
	socket.on("error", (erro) => log.erro(`conexão ${conexao.id}`, erro));
});

const servidor = serve({ fetch: app.fetch, port: PORTA_SERVIDOR }, (info) => {
	log.info(`Servidor em http://localhost:${info.port}`);
});

servidor.on("upgrade", (requisicao: IncomingMessage, socket: Duplex, cabeca: Buffer) => {
	const caminho = new URL(requisicao.url ?? "/", "http://localhost").pathname;
	if (caminho !== "/ws") {
		socket.destroy();
		return;
	}
	servidorWs.handleUpgrade(requisicao, socket, cabeca, (conexao) => {
		servidorWs.emit("connection", conexao, requisicao);
	});
});

// --- Watcher --------------------------------------------------------------------

const pararWatcher = observar({
	janelas,
	pastaPerfis: PASTA_PERFIS,
	pastaExtensoesGlobais: join(getAgentDir(), "extensions"),
	esperaMs: ESPERA_WATCHER_MS,
	log,
});

// --- Encerramento -----------------------------------------------------------------

let encerrando = false;

async function encerrar(motivo: string): Promise<void> {
	if (encerrando) return;
	encerrando = true;
	log.info(`Encerrando (${motivo})`);
	// Se algo travar, sai mesmo assim; o dev.mjs espera um pouco mais que isto.
	setTimeout(() => {
		log.aviso("Encerramento demorou demais; saindo sem terminar.");
		process.exit(1);
	}, 4000).unref();
	pararWatcher();
	for (const cliente of servidorWs.clients) cliente.close(1001, "servidor reiniciando");
	await janelas.descartarTodas();
	servidor.close();
	for (const cliente of servidorWs.clients) cliente.terminate();
	log.info("Servidor encerrado");
	process.exit(0);
}

for (const sinal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
	process.on(sinal, () => void encerrar(sinal));
}
// Pedido do apps/server/dev.mjs antes de reiniciar.
process.on("message", (mensagem) => {
	if (typeof mensagem === "object" && mensagem !== null && (mensagem as { tipo?: unknown }).tipo === "encerrar") {
		void encerrar("pedido do dev.mjs");
	}
});
// O dev.mjs morreu (canal IPC fechado): não fica servidor órfão segurando a porta.
process.on("disconnect", () => void encerrar("o processo pai saiu"));

process.on("uncaughtException", (erro) => {
	// Saída quebrada (EPIPE) já desliga o console no log.ts; registrar de novo faria um ciclo.
	if (ehSaidaQuebrada(erro)) return;
	log.erro("Exceção não tratada", erro);
});
process.on("unhandledRejection", (erro) => log.erro("Promessa rejeitada sem tratamento", erro));
