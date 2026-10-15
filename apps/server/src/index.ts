// Servidor do app: HTTP com Hono e WebSocket com a biblioteca ws, na mesma porta.
//
// Por que ws direto em vez de @hono/node-ws: a versão atual do @hono/node-ws
// (1.3.1) exige @hono/node-server 1.x, e o atual é o 2.x. O ws atende o
// "upgrade" do mesmo servidor HTTP que o Hono usa, sem depender dessa ponte.

import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { serve } from "@hono/node-server";
import { lerPerfis } from "@estudos/core";
import { Hono } from "hono";
import { WebSocketServer, type WebSocket } from "ws";
import { PASTA_PERFIS, PORTA_SERVIDOR } from "./config.ts";

const pacote = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const app = new Hono();

app.get("/api/saude", (c) => c.json({ ok: true, versao: pacote.version }));

app.get("/api/perfis", async (c) => {
	const perfis = await lerPerfis(PASTA_PERFIS);
	return c.json(
		perfis.map((perfil) => ({
			id: perfil.id,
			nome: perfil.nome,
			agentes: perfil.agentes
				.filter((agente) => agente.selecionavel)
				.map((agente) => ({ nome: agente.nome, papel: agente.papel, modelo: agente.modelo })),
		})),
	);
});

app.onError((erro, c) => {
	console.error(erro);
	return c.json({ ok: false, erro: erro.message }, 500);
});

// WebSocket. Por enquanto só responde a {tipo: "ping"} com {tipo: "pong"}.
// O protocolo tipado vem na tarefa 2.4.
const servidorWs = new WebSocketServer({ noServer: true });

servidorWs.on("connection", (socket: WebSocket) => {
	socket.on("message", (bruto) => {
		let mensagem: unknown;
		try {
			mensagem = JSON.parse(bruto.toString());
		} catch {
			socket.send(JSON.stringify({ tipo: "erro", mensagem: "JSON inválido" }));
			return;
		}
		if (typeof mensagem === "object" && mensagem !== null && (mensagem as { tipo?: unknown }).tipo === "ping") {
			socket.send(JSON.stringify({ tipo: "pong" }));
		}
	});
});

const servidor = serve({ fetch: app.fetch, port: PORTA_SERVIDOR }, (info) => {
	console.log(`Servidor em http://localhost:${info.port}`);
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

// O tsx watch reinicia o processo mandando SIGTERM; fechar o servidor libera a porta na hora.
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
	process.on(sinal, () => {
		for (const cliente of servidorWs.clients) cliente.terminate();
		servidor.close(() => process.exit(0));
		setTimeout(() => process.exit(0), 1000).unref();
	});
}
