// Rotas HTTP. Separadas do index.ts para os testes chamarem com app.request,
// sem abrir porta.

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { acharImagem, ErroCaminhoImagem, TIPOS_IMAGEM } from "@estudos/core";
import { Hono } from "hono";
import type { Janelas } from "./janelas.ts";
import type { Log } from "./log.ts";

// Um SVG aberto direto no navegador não roda script nem busca nada (dentro de <img> o navegador já não roda).
const POLITICA_SVG = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

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
					.map((agente) => ({
						nome: agente.nome,
						papel: agente.papel,
						...(agente.modelo ? { modelo: agente.modelo } : {}),
						...(agente.avatar
							? {
									avatar: {
										url: `/api/perfis/${encodeURIComponent(perfil.id)}/agentes/${encodeURIComponent(agente.nome)}/avatar`,
										...(agente.avatar.recorte ? { recorte: agente.avatar.recorte } : {}),
									},
								}
							: {}),
					})),
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

	// A foto de um agente (agentes[].avatar do profile.json).
	app.get("/api/perfis/:id/agentes/:nome/avatar", async (c) => {
		const id = c.req.param("id");
		const nome = c.req.param("nome");
		const { perfis } = await janelas.perfis();
		const avatar = perfis.find((perfil) => perfil.id === id)?.agentes.find((agente) => agente.nome === nome)?.avatar;
		if (!avatar) return c.json({ ok: false, erro: `O agente "${nome}" do perfil "${id}" não tem foto.` }, 404);
		const tipo = TIPOS_IMAGEM[extname(avatar.arquivo).toLowerCase()] ?? "application/octet-stream";
		return c.body(new Uint8Array(await readFile(avatar.arquivo)), 200, { "content-type": tipo, "cache-control": "no-cache" });
	});

	// Uma imagem da pasta de dados do perfil (imagens.ts do núcleo): /api/perfis/<id>/imagens/<caminho>,
	// com o caminho relativo à pasta de dados ou só o nome (procurado nas pastas "imagens" do profile.json).
	app.get("/api/perfis/:id/imagens/*", async (c) => {
		const id = c.req.param("id");
		const { perfis } = await janelas.perfis();
		const perfil = perfis.find((item) => item.id === id);
		if (!perfil) return c.json({ ok: false, erro: `O perfil "${id}" não existe ou é inválido.` }, 404);
		const prefixo = `/api/perfis/${encodeURIComponent(id)}/imagens/`;
		const bruto = new URL(c.req.url).pathname;
		let caminho: string;
		try {
			caminho = decodeURIComponent(bruto.startsWith(prefixo) ? bruto.slice(prefixo.length) : "");
		} catch {
			return c.json({ ok: false, erro: "Caminho mal codificado." }, 400);
		}
		let imagem;
		try {
			imagem = await acharImagem(perfil.pastaDados, perfil.pastasImagens, caminho);
		} catch (erro) {
			if (erro instanceof ErroCaminhoImagem) return c.json({ ok: false, erro: erro.message }, 400);
			throw erro;
		}
		if (!imagem) return c.json({ ok: false, erro: `A imagem "${caminho}" não está na pasta de dados do perfil "${id}".` }, 404);
		const etag = `"${imagem.tamanho}-${Math.trunc(imagem.modificadoEm)}"`;
		const cabecalhos: Record<string, string> = {
			"content-type": imagem.tipo,
			"cache-control": "no-cache",
			etag,
			"x-content-type-options": "nosniff",
			...(imagem.tipo === "image/svg+xml" ? { "content-security-policy": POLITICA_SVG } : {}),
		};
		if (c.req.header("if-none-match") === etag) return c.body(null, 304, cabecalhos);
		return c.body(new Uint8Array(await readFile(imagem.arquivo)), 200, cabecalhos);
	});

	// Arquivos de material (multipart: "pasta", relativa à pasta de dados, e um ou mais "arquivos").
	// O perfil precisa estar aberto; o processamento segue em segundo plano e chega pelo evento "materiais".
	app.post("/api/perfis/:id/materiais", async (c) => {
		const id = c.req.param("id");
		const corpo = await c.req.parseBody({ all: true });
		const pasta = corpo.pasta;
		if (typeof pasta !== "string" || !pasta) return c.json({ ok: false, erro: 'Falta o campo "pasta".' }, 400);
		const recebidos = ([] as unknown[]).concat(corpo.arquivos ?? []).filter((item): item is File => item instanceof File);
		if (recebidos.length === 0) return c.json({ ok: false, erro: 'Nenhum arquivo em "arquivos".' }, 400);
		const arquivos = await Promise.all(recebidos.map(async (arquivo) => ({ nome: arquivo.name, dados: new Uint8Array(await arquivo.arrayBuffer()) })));
		try {
			const gravados = await janelas.janela(id).adicionarMateriais(pasta, arquivos);
			log.info(`[${id}] materiais adicionados em ${pasta}: ${gravados.length} de ${arquivos.length}`);
			return c.json({ ok: true, gravados });
		} catch (erro) {
			return c.json({ ok: false, erro: (erro as Error).message }, 400);
		}
	});

	app.onError((erro, c) => {
		log.erro(`HTTP ${c.req.method} ${c.req.path}`, erro);
		return c.json({ ok: false, erro: erro.message }, 500);
	});

	return app;
}
