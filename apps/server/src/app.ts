// Rotas HTTP. Separadas do index.ts para os testes chamarem com app.request,
// sem abrir porta.

import { Hono } from "hono";
import type { Janelas } from "./janelas.ts";
import type { Log } from "./log.ts";

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

	app.onError((erro, c) => {
		log.erro(`HTTP ${c.req.method} ${c.req.path}`, erro);
		return c.json({ ok: false, erro: erro.message }, 500);
	});

	return app;
}
