// Testes do servidor sem rede: rotas HTTP com app.request do Hono, mensagens
// do WebSocket com uma janela falsa e o watcher com mudanças simuladas.

import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EstadoSessao, EventoNucleo, Perfil } from "@estudos/core";
import type { MensagemServidor } from "@estudos/core/protocolo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarApp } from "./app.ts";
import { interpretarSaidaReg } from "./chaves.ts";
import { resumirMensagem, tratarMensagem } from "./conexao.ts";
import { type Conexao, type JanelaDoServidor, Janelas } from "./janelas.ts";
import { logMudo } from "./log.ts";
import { aplicarMudancas, mudancasVazias, ReferenciaArquivos, registrarMudancaGlobal, registrarMudancaPerfil } from "./observador.ts";

const profileJson = (id: string, pastaDados: string) => ({
	id,
	nome: `Perfil ${id}`,
	pastaDados,
	instrucoes: "AGENTS.md",
	agentePadrao: "geral",
	agentes: [
		{ arquivo: "agents/geral.md", papel: "geral", selecionavel: true },
		{ arquivo: "agents/oculto.md", papel: "desenho", selecionavel: false },
	],
	skills: [],
	extensoes: [],
	paineis: ["teste"],
});

async function criarPerfil(pastaPerfis: string, pasta: string, id: string, pastaDados: string): Promise<void> {
	const raiz = join(pastaPerfis, pasta);
	await mkdir(join(raiz, "agents"), { recursive: true });
	await writeFile(join(raiz, "AGENTS.md"), "");
	await writeFile(join(raiz, "agents", "geral.md"), "---\nname: geral\nmodel: openrouter/x/y\n---\n\nGeral.\n");
	await writeFile(join(raiz, "agents", "oculto.md"), "---\nname: oculto\n---\n\nOculto.\n");
	await writeFile(join(raiz, "profile.json"), JSON.stringify(profileJson(id, pastaDados)));
}

/** Janela falsa: guarda as chamadas e emite eventos como a de verdade. */
class JanelaFalsa implements JanelaDoServidor {
	estado: EstadoSessao | undefined;
	readonly chamadas: string[] = [];
	private readonly ouvintes = new Set<(evento: EventoNucleo) => void>();
	private sessao = 0;
	private conversa: string[] = [];

	constructor(readonly perfil: Perfil) {}

	private novoEstado(sessaoId: string, agente: string, modelo = "openrouter/x/y"): EstadoSessao {
		this.estado = { perfil: this.perfil.id, sessaoId, agente, modelo, raciocinio: "medium", ferramentas: [], skills: [], diagnosticos: [] };
		this.emitir({ tipo: "estado_sessao", estado: this.estado });
		return this.estado;
	}
	emitir(evento: EventoNucleo): void {
		for (const ouvinte of this.ouvintes) ouvinte(evento);
	}
	assinar(ouvinte: (evento: EventoNucleo) => void): () => void {
		this.ouvintes.add(ouvinte);
		return () => this.ouvintes.delete(ouvinte);
	}
	async iniciar(opcoes: { agente?: string; sessaoId?: string } = {}) {
		this.chamadas.push(`iniciar ${opcoes.sessaoId ?? "-"} ${opcoes.agente ?? "-"}`);
		if (opcoes.sessaoId === "nao-existe") throw new Error("Sessão nao-existe não encontrada");
		return this.novoEstado(opcoes.sessaoId ?? `s${++this.sessao}`, opcoes.agente ?? this.perfil.agentePadrao);
	}
	async enviar(texto: string) {
		this.chamadas.push(`enviar ${texto}`);
		this.conversa.push(texto);
		this.emitir({ tipo: "execucao_inicio" });
		return "iniciada" as const;
	}
	async abortar() {
		this.chamadas.push("abortar");
		return ["na fila"];
	}
	async trocarModelo(nome: string) {
		this.chamadas.push(`trocarModelo ${nome}`);
		return this.novoEstado(this.estado?.sessaoId ?? "?", this.estado?.agente ?? "?", nome);
	}
	async trocarAgente(nome: string) {
		this.chamadas.push(`trocarAgente ${nome}`);
		return this.novoEstado(this.estado?.sessaoId ?? "?", nome);
	}
	async listarSessoes() {
		return [];
	}
	async abrirSessao(id: string) {
		this.chamadas.push(`abrirSessao ${id}`);
		return this.novoEstado(id, this.estado?.agente ?? "geral");
	}
	async novaSessao(agente?: string) {
		this.chamadas.push(`novaSessao ${agente ?? "-"}`);
		this.conversa = [];
		return this.novoEstado(`s${++this.sessao}`, agente ?? this.estado?.agente ?? "geral");
	}
	async recarregar() {
		this.chamadas.push("recarregar");
		return this.novoEstado(this.estado?.sessaoId ?? "?", this.estado?.agente ?? "geral");
	}
	async modelosDisponiveis() {
		return [];
	}
	historico() {
		return this.conversa.map((texto) => ({ papel: "usuario" as const, texto }));
	}
	responder(id: string) {
		this.chamadas.push(`responder ${id}`);
		return id === "existe";
	}
	cancelarPedido(id: string) {
		this.chamadas.push(`cancelar ${id}`);
		return id === "existe";
	}
	acaoDaInterface(painel: string, acao: string) {
		this.chamadas.push(`acao ${painel} ${acao}`);
	}
	async descartar() {
		this.chamadas.push("descartar");
	}
}

class ConexaoFalsa implements Conexao {
	readonly recebidas: MensagemServidor[] = [];
	constructor(readonly id: number) {}
	enviar(mensagem: MensagemServidor): void {
		this.recebidas.push(mensagem);
	}
	tipos(): string[] {
		return this.recebidas.map((mensagem) => (mensagem.tipo === "evento" ? `evento:${mensagem.evento.tipo}` : mensagem.tipo));
	}
	ultima(): MensagemServidor | undefined {
		return this.recebidas.at(-1);
	}
	limpar(): void {
		this.recebidas.length = 0;
	}
}

let pasta: string;
let pastaPerfis: string;
let falsas: JanelaFalsa[];
let janelas: Janelas;

beforeEach(async () => {
	pasta = await mkdtemp(join(tmpdir(), "estudos-servidor-"));
	pastaPerfis = join(pasta, "profiles");
	await criarPerfil(pastaPerfis, "teste", "teste", join(pasta, "dados"));
	await mkdir(join(pastaPerfis, "quebrado"), { recursive: true });
	await writeFile(join(pastaPerfis, "quebrado", "profile.json"), JSON.stringify({ id: "quebrado" }));
	falsas = [];
	janelas = new Janelas({
		pastaPerfis,
		log: logMudo,
		fabricaJanela: (perfil) => {
			const janela = new JanelaFalsa(perfil);
			falsas.push(janela);
			return janela;
		},
	});
});

afterEach(async () => {
	await rm(pasta, { recursive: true, force: true });
});

describe("rotas HTTP", () => {
	it("GET /api/saude responde na hora", async () => {
		const app = criarApp(janelas, logMudo, "9.9.9");
		const resposta = await app.request("/api/saude");
		expect(resposta.status).toBe(200);
		expect(await resposta.json()).toEqual({ ok: true, versao: "9.9.9" });
	});

	it("GET /api/perfis lista os válidos e, à parte, os erros dos inválidos", async () => {
		const app = criarApp(janelas, logMudo, "1");
		const resposta = await app.request("/api/perfis");
		expect(resposta.status).toBe(200);
		const corpo = (await resposta.json()) as {
			perfis: Array<{ id: string; nome: string; agentes: Array<{ nome: string }>; paineis: string[]; aberto: boolean }>;
			erros: Array<{ arquivo: string; mensagem: string }>;
		};
		expect(corpo.perfis).toEqual([
			{
				id: "teste",
				nome: "Perfil teste",
				agentes: [{ nome: "geral", papel: "geral", modelo: "openrouter/x/y" }],
				agentePadrao: "geral",
				paineis: ["teste"],
				aberto: false,
			},
		]);
		expect(corpo.erros).toHaveLength(1);
		expect(corpo.erros[0]?.arquivo).toBe(join(pastaPerfis, "quebrado", "profile.json"));
		expect(corpo.erros[0]?.mensagem).toMatch(/campo/);
	});

	it("GET /api/perfis/:id/sessoes lista as sessões (nenhuma) e dá 404 para perfil desconhecido", async () => {
		const app = criarApp(janelas, logMudo, "1");
		const resposta = await app.request("/api/perfis/teste/sessoes");
		expect(resposta.status).toBe(200);
		expect(await resposta.json()).toEqual([]);
		expect((await app.request("/api/perfis/quebrado/sessoes")).status).toBe(404);
		expect((await app.request("/api/perfis/nada/sessoes")).status).toBe(404);
	});
});

describe("mensagens do WebSocket", () => {
	const enviar = (conexao: ConexaoFalsa, mensagem: unknown) => tratarMensagem(janelas, conexao, JSON.stringify(mensagem), logMudo);

	it("ping, JSON inválido e mensagem inválida", async () => {
		const conexao = new ConexaoFalsa(1);
		await enviar(conexao, { tipo: "ping", pedidoId: "a" });
		expect(conexao.ultima()).toEqual({ tipo: "pong", pedidoId: "a" });
		await tratarMensagem(janelas, conexao, "{nada", logMudo);
		expect(conexao.ultima()).toEqual({ tipo: "erro", mensagem: "JSON inválido" });
		await enviar(conexao, { tipo: "enviar", pedidoId: "b", perfil: "teste" });
		expect(conexao.ultima()).toMatchObject({ tipo: "resposta", pedidoId: "b", pedido: "enviar", ok: false });
		await enviar(conexao, { tipo: "xyz" });
		expect(conexao.ultima()).toMatchObject({ tipo: "erro" });
	});

	it("abrir_perfil manda carregando, estado, histórico e a resposta", async () => {
		const conexao = new ConexaoFalsa(1);
		await enviar(conexao, { tipo: "abrir_perfil", pedidoId: "1", perfil: "teste" });
		expect(conexao.tipos()).toEqual(["carregando", "evento:estado_sessao", "historico", "resposta"]);
		expect(conexao.ultima()).toMatchObject({ tipo: "resposta", pedidoId: "1", ok: true, dados: { sessaoId: "s1", agente: "geral" } });
		expect(falsas).toHaveLength(1);
	});

	it("perfil inválido ou desconhecido dá erro na resposta; pedido sem abrir o perfil também", async () => {
		const conexao = new ConexaoFalsa(1);
		await enviar(conexao, { tipo: "abrir_perfil", pedidoId: "1", perfil: "quebrado" });
		expect(conexao.ultima()).toMatchObject({ ok: false, erro: expect.stringMatching(/não existe ou é inválido/) });
		await enviar(conexao, { tipo: "enviar", pedidoId: "2", perfil: "teste", texto: "oi" });
		expect(conexao.ultima()).toMatchObject({ ok: false, erro: expect.stringMatching(/não está aberto/) });
	});

	it("uma janela por perfil, compartilhada: a segunda conexão entra na mesma conversa e as duas recebem os eventos", async () => {
		const a = new ConexaoFalsa(1);
		const b = new ConexaoFalsa(2);
		await Promise.all([enviar(a, { tipo: "abrir_perfil", perfil: "teste" }), enviar(b, { tipo: "abrir_perfil", perfil: "teste" })]);
		expect(falsas).toHaveLength(1);
		expect(falsas[0]?.chamadas).toEqual(["iniciar - -"]);
		expect(b.tipos()).toContain("historico");
		a.limpar();
		b.limpar();
		await enviar(a, { tipo: "enviar", perfil: "teste", texto: "olá" });
		expect(a.tipos()).toEqual(["evento:execucao_inicio", "resposta"]);
		expect(b.tipos()).toEqual(["evento:execucao_inicio"]);

		// Uma conexão que fecha deixa de receber; a janela continua.
		janelas.sair(b);
		b.limpar();
		await enviar(a, { tipo: "enviar", perfil: "teste", texto: "de novo" });
		expect(b.recebidas).toEqual([]);
	});

	it("reabrir com outra sessão troca a sessão para todos; um início que falha pode ser tentado de novo", async () => {
		const a = new ConexaoFalsa(1);
		await enviar(a, { tipo: "abrir_perfil", perfil: "teste", sessaoId: "nao-existe" });
		expect(a.ultima()).toMatchObject({ ok: false });
		await enviar(a, { tipo: "abrir_perfil", perfil: "teste", sessaoId: "antiga" });
		expect(a.ultima()).toMatchObject({ ok: true, dados: { sessaoId: "antiga" } });
		const b = new ConexaoFalsa(2);
		await enviar(b, { tipo: "abrir_perfil", perfil: "teste", sessaoId: "outra" });
		expect(falsas[0]?.chamadas).toEqual(["iniciar nao-existe -", "iniciar antiga -", "abrirSessao outra"]);
		expect(a.tipos()).toContain("carregando");
		expect(a.recebidas.filter((mensagem) => mensagem.tipo === "historico")).toHaveLength(2);
	});

	it("pedidos que remontam a sessão mandam carregando e histórico; os outros chamam a janela", async () => {
		const conexao = new ConexaoFalsa(1);
		await enviar(conexao, { tipo: "abrir_perfil", perfil: "teste" });
		for (const mensagem of [
			{ tipo: "trocar_agente", perfil: "teste", agente: "outro" },
			{ tipo: "nova_sessao", perfil: "teste" },
			{ tipo: "abrir_sessao", perfil: "teste", sessaoId: "s1" },
		]) {
			conexao.limpar();
			await enviar(conexao, mensagem);
			expect(conexao.tipos()).toEqual(["carregando", "evento:estado_sessao", "historico", "resposta"]);
		}
		conexao.limpar();
		await enviar(conexao, { tipo: "recarregar_perfil", perfil: "teste" });
		expect(conexao.tipos()).toEqual(["carregando", "evento:estado_sessao", "historico", "perfil_recarregado", "resposta"]);
		expect(conexao.recebidas[3]).toEqual({ tipo: "perfil_recarregado", perfil: "teste", motivo: "pedido" });

		await enviar(conexao, { tipo: "abortar", perfil: "teste" });
		expect(conexao.ultima()).toMatchObject({ ok: true, dados: ["na fila"] });
		await enviar(conexao, { tipo: "trocar_modelo", perfil: "teste", modelo: "openrouter/a/b" });
		expect(conexao.ultima()).toMatchObject({ ok: true, dados: { modelo: "openrouter/a/b" } });
		await enviar(conexao, { tipo: "responder_pedido", perfil: "teste", id: "existe", dados: 1 });
		expect(conexao.ultima()).toMatchObject({ ok: true, dados: true });
		await enviar(conexao, { tipo: "cancelar_pedido", perfil: "teste", id: "sumiu" });
		expect(conexao.ultima()).toMatchObject({ ok: true, dados: false });
		await enviar(conexao, { tipo: "acao_interface", perfil: "teste", painel: "teste", acao: "clicou", dados: {} });
		expect(conexao.ultima()).toEqual({ tipo: "resposta", pedido: "acao_interface", ok: true });
		await enviar(conexao, { tipo: "listar_sessoes", perfil: "teste" });
		expect(conexao.ultima()).toMatchObject({ ok: true, dados: [] });
		expect(falsas[0]?.chamadas.slice(-5)).toEqual([
			"abortar",
			"trocarModelo openrouter/a/b",
			"responder existe",
			"cancelar sumiu",
			"acao teste clicou",
		]);
	});

	it("descartarTodas descarta cada janela", async () => {
		await enviar(new ConexaoFalsa(1), { tipo: "abrir_perfil", perfil: "teste" });
		await janelas.descartarTodas();
		expect(falsas[0]?.chamadas.at(-1)).toBe("descartar");
		expect(janelas.abertas()).toEqual([]);
	});

	it("o resumo do log não leva o texto do usuário", () => {
		const resumo = resumirMensagem({ tipo: "enviar", perfil: "teste", texto: "segredo do Breno" });
		expect(resumo).toBe("enviar perfil=teste texto=16 car.");
	});
});

describe("watcher", () => {
	it("junta as mudanças por perfil, ignora node_modules e marca profile.json", () => {
		const mudancas = mudancasVazias();
		registrarMudancaPerfil(mudancas, pastaPerfis, "teste\\agents\\geral.md");
		registrarMudancaPerfil(mudancas, pastaPerfis, "teste\\extensions\\x\\node_modules\\y\\index.js");
		registrarMudancaPerfil(mudancas, pastaPerfis, "teste\\AGENTS.md");
		// O código de tela do perfil é recarregado pelo Vite, não pela sessão.
		registrarMudancaPerfil(mudancas, pastaPerfis, "teste\\paineis\\src\\PainelQuiz.tsx");
		expect(mudancas.relerLista).toBe(false);
		expect([...(mudancas.perfis.get(join(pastaPerfis, "teste")) ?? [])]).toEqual(["agents/geral.md", "AGENTS.md"]);
		registrarMudancaPerfil(mudancas, pastaPerfis, "teste\\profile.json");
		expect(mudancas.relerLista).toBe(true);
		registrarMudancaGlobal(mudancas, "web-search\\index.ts");
		registrarMudancaGlobal(mudancas, "web-search\\node_modules\\a.js");
		expect([...mudancas.globais]).toEqual(["web-search/index.ts"]);
	});

	it("recarrega só as janelas abertas afetadas e manda perfil_recarregado com os arquivos", async () => {
		const conexao = new ConexaoFalsa(1);
		// Sem janela: nada a recarregar.
		const antes = mudancasVazias();
		registrarMudancaPerfil(antes, pastaPerfis, "teste\\AGENTS.md");
		await aplicarMudancas(janelas, antes, logMudo);
		expect(falsas).toHaveLength(0);

		await tratarMensagem(janelas, conexao, JSON.stringify({ tipo: "abrir_perfil", perfil: "teste" }), logMudo);
		conexao.limpar();
		const mudancas = mudancasVazias();
		registrarMudancaPerfil(mudancas, pastaPerfis, "outro\\AGENTS.md");
		await aplicarMudancas(janelas, mudancas, logMudo);
		expect(conexao.recebidas).toEqual([]);

		registrarMudancaPerfil(mudancas, pastaPerfis, "teste\\AGENTS.md");
		registrarMudancaGlobal(mudancas, "web-fetch\\index.ts");
		await aplicarMudancas(janelas, mudancas, logMudo);
		expect(falsas[0]?.chamadas.at(-1)).toBe("recarregar");
		expect(conexao.recebidas.find((mensagem) => mensagem.tipo === "perfil_recarregado")).toEqual({
			tipo: "perfil_recarregado",
			perfil: "teste",
			motivo: "arquivo",
			arquivos: ["AGENTS.md", "~/.pi/agent/extensions/web-fetch/index.ts"],
		});
		expect(conexao.tipos()).toContain("historico");
	});
});

describe("referência de arquivos do watcher", () => {
	it("ler não conta; mudar a data, criar e apagar contam; pasta existente não conta", async () => {
		const referencia = new ReferenciaArquivos();
		const agentes = join(pastaPerfis, "teste", "AGENTS.md");
		await referencia.varrer(pastaPerfis);
		await readFile(agentes);
		expect(await referencia.mudou(agentes)).toBe(false);
		expect(await referencia.mudou(join(pastaPerfis, "teste"))).toBe(false);
		expect(await referencia.mudou(join(pastaPerfis, "teste", "agents"))).toBe(false);
		const depois = new Date(Date.now() + 5000);
		await utimes(agentes, depois, depois);
		expect(await referencia.mudou(agentes)).toBe(true);
		expect(await referencia.mudou(agentes)).toBe(false);
		const novo = join(pastaPerfis, "teste", "novo.md");
		await writeFile(novo, "x");
		expect(await referencia.mudou(novo)).toBe(true);
		await rm(novo);
		expect(await referencia.mudou(novo)).toBe(true);
		expect(await referencia.mudou(join(pastaPerfis, "teste", "nunca-existiu.md"))).toBe(false);
	});
});

describe("chaves", () => {
	it("lê o valor da saída do reg query", () => {
		const saida = "\r\nHKEY_CURRENT_USER\\Environment\r\n    MINHA_CHAVE    REG_SZ    abc 123\r\n\r\n";
		expect(interpretarSaidaReg(saida, "MINHA_CHAVE")).toBe("abc 123");
		expect(interpretarSaidaReg(saida, "OUTRA")).toBeUndefined();
	});
});
