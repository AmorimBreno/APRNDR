// Rotas HTTP. Separadas do index.ts para os testes chamarem com app.request,
// sem abrir porta.

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Hono } from "hono";
import type { Janelas } from "./janelas.ts";
import type { Log } from "./log.ts";

const TIPOS_IMAGEM: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".svg": "image/svg+xml",
};

export function criarApp(janelas: Janelas, log: Log, versao: string): Hono {
	const app = new Hono();

	// Responde na hora, sem esperar perfis nem sessões: o lançador usa para saber se o servidor subiu.
	app.get("/api/saude", (c) => c.json({ ok: true, versao }));

	app.get("/api/perfis", async (c) => {
		const { perfis, erros } = await janelas.perfis();
		return c.json({
			perfis: perfis.map((perfil) => ({
				id: perfil.id,
				nome: perfil.nome,
				agentes: perfil.agentes
					.filter((agente) => agente.selecionavel)
					.map((agente) => ({ nome: agente.nome, papel: agente.papel, ...(agente.modelo ? { modelo: agente.modelo } : {}) })),
				agentePadrao: perfil.agentePadrao,
				paineis: perfil.paineis,
				aberto: janelas.aberta(perfil.id),
				aparencia: {
					...(perfil.aparencia.cor ? { cor: perfil.aparencia.cor } : {}),
					...(perfil.aparencia.lema ? { lema: perfil.aparencia.lema } : {}),
					...(perfil.aparencia.glifo ? { glifo: perfil.aparencia.glifo } : {}),
					...(perfil.aparencia.capa ? { capa: `/api/perfis/${encodeURIComponent(perfil.id)}/capa` } : {}),
				},
			})),
			erros: erros.map((erro) => ({ arquivo: erro.arquivo, mensagem: erro.mensagem })),
		});
	});

	app.get("/api/perfis/:id/sessoes", async (c) => {
		const id = c.req.param("id");
		const { perfis } = await janelas.perfis();
		if (!perfis.some((perfil) => perfil.id === id)) return c.json({ ok: false, erro: `O perfil "${id}" não existe ou é inválido.` }, 404);
		return c.json(await janelas.sessoes(id));
	});

	// A capa do perfil (aparencia.capa do profile.json). Sem cache: trocar a imagem aparece ao recarregar.
	app.get("/api/perfis/:id/capa", async (c) => {
		const id = c.req.param("id");
		const { perfis } = await janelas.perfis();
		const capa = perfis.find((perfil) => perfil.id === id)?.aparencia.capa;
		if (!capa) return c.json({ ok: false, erro: `O perfil "${id}" não tem capa.` }, 404);
		const tipo = TIPOS_IMAGEM[extname(capa).toLowerCase()] ?? "application/octet-stream";
		return c.body(new Uint8Array(await readFile(capa)), 200, { "content-type": tipo, "cache-control": "no-cache" });
	});

	app.onError((erro, c) => {
		log.erro(`HTTP ${c.req.method} ${c.req.path}`, erro);
		return c.json({ ok: false, erro: erro.message }, 500);
	});

	return app;
}
