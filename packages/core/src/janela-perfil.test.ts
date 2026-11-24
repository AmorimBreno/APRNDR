// Teste de integração da JanelaPerfil sem rede: perfil, pasta global do pi e
// pasta de dados temporários; agentes sem modelo; nenhuma mensagem é enviada
// ao modelo. A sessão gravada é escrita à mão no formato JSONL do pi.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashConteudo, TIPO_MENSAGEM_CONTEXTO_TELA } from "./contexto-tela.ts";
import type { ContextoTela, EventoNucleo } from "./eventos.ts";
import { JanelaPerfil } from "./janela-perfil.ts";
import { criarRegistroModelos } from "./modelos.ts";
import { lerPerfil } from "./perfis.ts";
import { pastaSessoes, TIPO_ENTRADA_AGENTE, TIPO_ENTRADA_CONTEXTO } from "./sessoes.ts";

let raiz = "";
let pastaPerfil = "";
let pastaPi = "";
let pastaDados = "";
let janela: JanelaPerfil | undefined;

async function escrever(caminho: string, texto: string): Promise<void> {
	await mkdir(join(caminho, ".."), { recursive: true });
	await writeFile(caminho, texto);
}

/** Código de uma extensão do pi que registra ferramentas vazias com esses nomes. */
function extensaoComFerramenta(...nomes: string[]): string {
	const registros = nomes.map(
		(nome) =>
			`\tpi.registerTool({ name: "${nome}", label: "${nome}", description: "teste", parameters: Type.Object({}), async execute() { return { content: [{ type: "text", text: "ok" }], details: undefined }; } });`,
	);
	return ['import { Type } from "typebox";', "export default function (pi) {", ...registros, "}", ""].join("\n");
}

beforeEach(async () => {
	raiz = await mkdtemp(join(tmpdir(), "nucleo-janela-"));
	pastaPerfil = join(raiz, "perfil");
	pastaPi = join(raiz, "pi-agent");
	pastaDados = join(raiz, "dados");
	await mkdir(pastaPi, { recursive: true });
	// Um AGENTS.md acima do cwd que não pode entrar no contexto.
	await escrever(join(raiz, "AGENTS.md"), "# Regras do projeto\nNão deve entrar.\n");
	await escrever(
		join(pastaPerfil, "profile.json"),
		JSON.stringify({
			id: "teste",
			nome: "Teste",
			pastaDados,
			instrucoes: "AGENTS.md",
			agentePadrao: "geral",
			agentes: [
				{ arquivo: "agents/geral.md", papel: "geral", selecionavel: true },
				{ arquivo: "agents/outro.md", papel: "outro", selecionavel: true },
			],
			skills: ["skills/skill-a", "skills/skill-b"],
			extensoes: [],
			extensoesSubagentes: ["extensions/filha.ts"],
			paineis: [],
		}),
	);
	// Extensão só das sessões filhas: não pode aparecer na sessão principal.
	await escrever(
		join(pastaPerfil, "extensions", "filha.ts"),
		extensaoComFerramenta("ferramenta_filha"),
	);
	await escrever(join(pastaPerfil, "AGENTS.md"), "# Instruções do perfil de teste\nResponda curto.\n");
	await escrever(
		join(pastaPerfil, "agents", "geral.md"),
		"---\nname: geral\ndescription: agente geral\ntools: read, grep, safe_bash\nskills: skill-a\nthinking: turbo\n---\n\nVocê é o agente geral.\n",
	);
	await escrever(join(pastaPerfil, "agents", "outro.md"), "---\nname: outro\ndescription: outro agente\n---\n\nVocê é o outro agente.\n");
	for (const nome of ["skill-a", "skill-b"]) {
		await escrever(
			join(pastaPerfil, "skills", nome, "SKILL.md"),
			`---\nname: ${nome}\ndescription: Skill ${nome} de teste.\n---\n\n# ${nome}\n`,
		);
	}
});

afterEach(async () => {
	await janela?.descartar();
	janela = undefined;
	await rm(raiz, { recursive: true, force: true });
});

/** Escreve uma sessão com uma pergunta e uma resposta, gravada com o agente `agente` (e o contexto, se vier). */
async function gravarSessao(id: string, agente: string, contexto?: Record<string, string>): Promise<string> {
	const pasta = pastaSessoes({ pastaDados });
	await mkdir(pasta, { recursive: true });
	const usoZero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const linhas = [
		{ type: "session", version: 3, id, timestamp: "2026-10-15T10:00:00.000Z", cwd: pastaDados },
		{ type: "custom", id: "e1", parentId: null, timestamp: "2026-10-15T10:00:00.000Z", customType: TIPO_ENTRADA_AGENTE, data: { agente } },
		...(contexto ? [{ type: "custom", id: "e1b", parentId: "e1", timestamp: "2026-10-15T10:00:00.500Z", customType: TIPO_ENTRADA_CONTEXTO, data: contexto }] : []),
		{ type: "message", id: "e2", parentId: contexto ? "e1b" : "e1", timestamp: "2026-10-15T10:00:01.000Z", message: { role: "user", content: "Pergunta antiga", timestamp: 1760522401000 } },
		{
			type: "message",
			id: "e3",
			parentId: "e2",
			timestamp: "2026-10-15T10:00:02.000Z",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Resposta antiga" }],
				api: "openai-completions",
				provider: "provedor-de-teste",
				model: "modelo-de-teste",
				usage: usoZero,
				stopReason: "stop",
				timestamp: 1760522402000,
			},
		},
	];
	const arquivo = join(pasta, `2026-10-15T10-00-00-000Z_${id}.jsonl`);
	await writeFile(arquivo, `${linhas.map((linha) => JSON.stringify(linha)).join("\n")}\n`);
	return arquivo;
}

describe("JanelaPerfil sem rede", () => {
	it("monta a sessão do agente: prompt, ferramentas, skills, diagnósticos e extensões do núcleo", async () => {
		const montagens: string[] = [];
		const iniciosDeSessao: string[] = [];
		const perfil = await lerPerfil(pastaPerfil);
		janela = new JanelaPerfil(perfil, {
			pastaPi,
			extensoesNucleo: ({ agente }) => {
				montagens.push(agente.nome);
				return [
					(pi) => {
						pi.on("session_start", (evento) => {
							iniciosDeSessao.push(evento.reason);
						});
					},
				];
			},
		});
		const eventos: EventoNucleo[] = [];
		janela.assinar((evento) => eventos.push(evento));

		const estado = await janela.iniciar();
		expect(estado.agente).toBe("geral");
		expect(estado.ferramentas).toEqual(["read", "grep"]);
		expect(estado.skills).toEqual(["skill-a"]);
		expect(estado.diagnosticos.map((item) => item.mensagem)).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/raciocínio "turbo" desconhecido/),
				'ferramenta "safe_bash" do agente geral não existe nesta sessão; ignorada',
			]),
		);
		expect(eventos.some((evento) => evento.tipo === "estado_sessao")).toBe(true);
		expect(eventos.filter((evento) => evento.tipo === "diagnostico")).toHaveLength(estado.diagnosticos.length);

		const prompt = janela.promptSistema ?? "";
		expect(prompt).toContain("# Instruções do perfil de teste");
		expect(prompt).toContain("Você é o agente geral.");
		expect(prompt).toContain("skill-a");
		expect(prompt).not.toContain("skill-b");
		expect(prompt).not.toContain("# Regras do projeto");
		expect(montagens).toEqual(["geral"]);
		expect(iniciosDeSessao).toEqual(["startup"]);

		// Sessão vazia ainda não tem arquivo; trocar de agente começa outra.
		const outro = await janela.trocarAgente("outro");
		expect(outro.agente).toBe("outro");
		// Sem ferramentas declaradas: as do pi, a ask_user_question e a subagent do núcleo; a das sessões filhas não entra.
		expect(outro.ferramentas).toEqual(["read", "bash", "edit", "write", "ask_user_question", "subagent"]);
		expect(janela.sessaoPi?.getAllTools().map((ferramenta) => ferramenta.name)).not.toContain("ferramenta_filha");
		expect(janela.sessaoPi?.resourceLoader.getExtensions().extensions.map((extensao) => extensao.path)).toEqual(
			expect.arrayContaining(["<inline:nucleo-ponte>", "<inline:nucleo-pergunta>", "<inline:nucleo-subagente>"]),
		);
		expect(janela.promptSistema).toContain("Delegate a self-contained task to a specialist subagent (geral)");
		expect(outro.skills).toEqual(["skill-a", "skill-b"]);
		expect(janela.promptSistema).toContain("Você é o outro agente.");
		expect(janela.promptSistema).not.toContain("Você é o agente geral.");
		expect(montagens).toEqual(["geral", "outro"]);
		expect(await janela.listarSessoes()).toEqual([]);
	});

	it("abre uma sessão gravada, troca de agente e recarrega mantendo a conversa", async () => {
		const id = "01a10000-0000-7000-8000-0000000000aa";
		const arquivo = await gravarSessao(id, "outro");
		janela = new JanelaPerfil(await lerPerfil(pastaPerfil), { pastaPi });

		const aberta = await janela.iniciar({ sessaoId: id });
		expect(aberta).toMatchObject({ sessaoId: id, arquivo, agente: "outro" });
		// O agente de cada resposta vem da entrada nucleo.agente vigente na hora.
		expect(janela.historico()).toMatchObject([
			{ papel: "usuario", texto: "Pergunta antiga" },
			{ papel: "assistente", texto: "Resposta antiga", raciocinio: "", modelo: "provedor-de-teste/modelo-de-teste", ferramentas: [], agente: "outro" },
		]);

		// Troca de agente: mesma sessão, mesmo arquivo, conversa mantida, troca gravada.
		const trocada = await janela.trocarAgente("geral");
		expect(trocada).toMatchObject({ sessaoId: id, arquivo, agente: "geral", ferramentas: ["read", "grep"] });
		expect(janela.historico()).toHaveLength(2);
		const texto = await readFile(arquivo, "utf8");
		expect(texto).toContain(`"customType":"${TIPO_ENTRADA_AGENTE}","data":{"agente":"geral"}`);
		expect((await janela.listarSessoes()).map(({ id: sessao, agente }) => ({ sessao, agente }))).toEqual([
			{ sessao: id, agente: "geral" },
		]);

		// Recarregar relê o AGENTS.md do disco e mantém sessão, agente e conversa.
		await writeFile(join(pastaPerfil, "AGENTS.md"), "# Instruções do perfil de teste, versão 2\n");
		const recarregada = await janela.recarregar();
		expect(recarregada).toMatchObject({ sessaoId: id, agente: "geral" });
		expect(janela.promptSistema).toContain("versão 2");
		expect(janela.historico()).toHaveLength(2);

		// Uma sessão nova não carrega a conversa.
		const nova = await janela.novaSessao();
		expect(nova.sessaoId).not.toBe(id);
		expect(nova.agente).toBe("geral");
		expect(janela.historico()).toEqual([]);

		// E dá para voltar à sessão gravada.
		const reaberta = await janela.abrirSessao(id);
		expect(reaberta).toMatchObject({ sessaoId: id, agente: "geral" });
		expect(janela.historico()).toHaveLength(2);
	});

	it("contexto da sessão: vai para o prompt, é herdado pela conversa nova e pela troca de agente, e volta ao reabrir", async () => {
		janela = new JanelaPerfil(await lerPerfil(pastaPerfil), { pastaPi });
		const geral = await janela.iniciar();
		expect(geral.contexto).toBeUndefined();

		const contexto = { chave: "materia:calculo", rotulo: "Cálculo", cor: "moss", instrucoes: "Esta conversa é do caderno de Cálculo.", escopoMateriais: "materias/calculo" };
		const doCaderno = await janela.novaSessao(undefined, contexto);
		expect(doCaderno.contexto).toEqual({ chave: "materia:calculo", rotulo: "Cálculo", cor: "moss" });
		expect(janela.promptSistema).toContain("Esta conversa é do caderno de Cálculo.");

		// Conversa nova dentro do caderno continua no caderno; trocar de agente também.
		expect((await janela.novaSessao()).contexto).toEqual({ chave: "materia:calculo", rotulo: "Cálculo", cor: "moss" });
		expect((await janela.trocarAgente("outro")).contexto).toEqual({ chave: "materia:calculo", rotulo: "Cálculo", cor: "moss" });
		expect(janela.promptSistema).toContain("Esta conversa é do caderno de Cálculo.");

		// null = conversa geral.
		const semContexto = await janela.novaSessao(undefined, null);
		expect(semContexto.contexto).toBeUndefined();
		expect(janela.promptSistema).not.toContain("caderno de Cálculo");

		// Gravado na sessão: volta ao reabrir e aparece na lista.
		const id = "01a10000-0000-7000-8000-0000000000bb";
		const arquivo = await gravarSessao(id, "geral", contexto);
		expect((await janela.abrirSessao(id)).contexto).toEqual({ chave: "materia:calculo", rotulo: "Cálculo", cor: "moss" });
		expect(janela.promptSistema).toContain("Esta conversa é do caderno de Cálculo.");
		expect((await janela.listarSessoes()).find((sessao) => sessao.id === id)?.contexto).toEqual({ chave: "materia:calculo", rotulo: "Cálculo", cor: "moss" });

		// Reabrir com o contexto de agora (a matéria mudou de nome e de cor) grava o novo na sessão.
		const mudado = { ...contexto, rotulo: "Cálculo I", cor: "amber", instrucoes: "Esta conversa é do caderno de Cálculo I." };
		expect((await janela.abrirSessao(id, mudado)).contexto).toEqual({ chave: "materia:calculo", rotulo: "Cálculo I", cor: "amber" });
		expect(janela.promptSistema).toContain("caderno de Cálculo I.");
		expect(await readFile(arquivo, "utf8")).toContain('"rotulo":"Cálculo I"');
		expect((await janela.listarSessoes()).find((sessao) => sessao.id === id)?.contexto).toEqual({ chave: "materia:calculo", rotulo: "Cálculo I", cor: "amber" });
		// Reabrir com o mesmo contexto não grava outra entrada.
		const linhas = (await readFile(arquivo, "utf8")).split("nucleo.contexto").length;
		await janela.abrirSessao(id, mudado);
		expect((await readFile(arquivo, "utf8")).split("nucleo.contexto").length).toBe(linhas);
	});

	it("ponte: mostrar, pedido e resposta, cancelamento e ação da interface", async () => {
		// A extensão de teste faz o papel de uma ferramenta de perfil: só usa pi.events.
		let barramento: ExtensionAPI["events"] | undefined;
		janela = new JanelaPerfil(await lerPerfil(pastaPerfil), {
			pastaPi,
			extensoesNucleo: () => [
				(pi) => {
					barramento = pi.events;
				},
			],
		});
		const eventos: EventoNucleo[] = [];
		janela.assinar((evento) => eventos.push(evento));
		const respostas: unknown[] = [];
		const acoes: unknown[] = [];
		const assinarBarramento = () => {
			barramento?.on("interface:resposta", (dados) => respostas.push(dados));
			barramento?.on("interface:acao", (dados) => acoes.push(dados));
		};
		const daPonte = () =>
			eventos.filter((evento) => ["acao_interface", "pedido_interface", "pedido_interface_cancelado"].includes(evento.tipo));

		expect(janela.responder("nada", {})).toBe(false);
		expect(() => janela?.acaoDaInterface("teste", "clicou")).toThrow(/chame iniciar/);

		await janela.iniciar({ agente: "outro" });
		assinarBarramento();

		barramento?.emit("interface:mostrar", { painel: "teste", acao: "abrir", dados: { texto: "olá" } });
		barramento?.emit("interface:pedido", { id: "p1", painel: "teste", acao: "perguntar", dados: { pergunta: "?" } });
		expect(daPonte()).toEqual([
			{ tipo: "acao_interface", painel: "teste", acao: "abrir", dados: { texto: "olá" } },
			{ tipo: "pedido_interface", id: "p1", painel: "teste", acao: "perguntar", dados: { pergunta: "?" } },
		]);
		expect(janela.responder("p1", { escolha: "a" })).toBe(true);
		expect(respostas).toEqual([{ id: "p1", dados: { escolha: "a" } }]);

		// Abortar cancela os pedidos pendentes.
		barramento?.emit("interface:pedido", { id: "p2", painel: "teste", acao: "perguntar", dados: null });
		await janela.abortar();
		expect(respostas.at(-1)).toEqual({ id: "p2", cancelado: true, motivo: "abortado" });
		expect(daPonte().at(-1)).toEqual({ tipo: "pedido_interface_cancelado", id: "p2", motivo: "abortado" });
		expect(janela.responder("p2", {})).toBe(false);

		// Ação da interface chega à extensão do perfil.
		janela.acaoDaInterface("teste", "clicou", { botao: "ok" });
		expect(acoes).toEqual([{ painel: "teste", acao: "clicou", dados: { botao: "ok" } }]);

		// Trocar de agente encerra a sessão: o pendente é cancelado; a sessão nova tem outro barramento.
		const anterior = barramento;
		barramento?.emit("interface:pedido", { id: "p3", painel: "teste", acao: "perguntar", dados: null });
		await janela.trocarAgente("geral");
		expect(respostas.at(-1)).toEqual({ id: "p3", cancelado: true, motivo: "sessao_encerrada" });
		expect(barramento).not.toBe(anterior);
		assinarBarramento();
		janela.acaoDaInterface("teste", "clicou", 2);
		expect(acoes).toHaveLength(2);

		// Descartar a janela também cancela.
		barramento?.emit("interface:pedido", { id: "p4", painel: "teste", acao: "perguntar", dados: null });
		await janela.descartar();
		janela = undefined;
		expect(respostas.at(-1)).toEqual({ id: "p4", cancelado: true, motivo: "sessao_encerrada" });
	});

	it("erros claros: agente e sessão inexistentes, enviar sem iniciar", async () => {
		janela = new JanelaPerfil(await lerPerfil(pastaPerfil), { pastaPi });
		await expect(janela.enviar("oi")).rejects.toThrow(/não tem sessão; chame iniciar/);
		await expect(janela.iniciar({ agente: "fantasma" })).rejects.toThrow(/não tem o agente "fantasma"/);
		await expect(janela.iniciar({ sessaoId: "nao-existe" })).rejects.toThrow(/Sessão nao-existe não encontrada/);
		// Depois dos erros a janela continua utilizável.
		expect((await janela.iniciar()).agente).toBe("geral");
	});
});

// Contexto da tela e fila própria (WP1; docs/mesa-de-estudo.md, 2.5). A sessão
// do pi é de verdade; o modelo é falso: um servidor HTTP local no formato de
// chat completions da OpenAI (models.json da pasta do pi, api
// "openai-completions"), que guarda os pedidos e pode segurar as respostas para
// simular "durante a resposta". Nada sai da máquina.

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Um pedido que chegou ao modelo falso: as mensagens, com o conteúdo em texto. */
interface PedidoFalso {
	mensagens: Array<{ role: string; texto: string }>;
	/** Quantas partes de imagem vieram nas mensagens. */
	imagens: number;
}

/** Texto de um conteúdo (string ou lista de partes com text, como na OpenAI e no pi). */
function textoDoConteudo(conteudo: unknown): string {
	if (typeof conteudo === "string") return conteudo;
	if (!Array.isArray(conteudo)) return "";
	return conteudo
		.map((parte: unknown) => (parte && typeof parte === "object" && "text" in parte && typeof parte.text === "string" ? parte.text : ""))
		.join("");
}

class ModeloFalso {
	readonly pedidos: PedidoFalso[] = [];
	private segurando = false;
	private presos: Array<() => void> = [];
	private esperas: Array<{ quantos: number; resolver: () => void }> = [];
	private readonly servidor: Server = createServer((pedido, resposta) => this.atender(pedido, resposta));

	async ligar(): Promise<number> {
		await new Promise<void>((resolver) => this.servidor.listen(0, "127.0.0.1", resolver));
		return (this.servidor.address() as AddressInfo).port;
	}

	async desligar(): Promise<void> {
		this.soltar();
		this.servidor.closeAllConnections();
		await new Promise<void>((resolver) => this.servidor.close(() => resolver()));
	}

	/** As próximas respostas ficam presas até soltar(). */
	segurar(): void {
		this.segurando = true;
	}

	/** Solta as respostas presas e para de segurar. */
	soltar(): void {
		this.segurando = false;
		const presos = this.presos;
		this.presos = [];
		for (const responder of presos) responder();
	}

	/** Espera chegarem `quantos` pedidos ao todo. */
	esperarPedidos(quantos: number): Promise<void> {
		if (this.pedidos.length >= quantos) return Promise.resolve();
		return new Promise((resolver) => this.esperas.push({ quantos, resolver }));
	}

	/**
	 * O contexto da tela que foi com a mensagem nova do pedido `indice`: a
	 * mensagem com o marcador depois da última mensagem do usuário que não é um
	 * contexto (as anteriores fazem parte da conversa já vista).
	 */
	contextoDoPedido(indice: number): string | undefined {
		const ehContexto = (mensagem: { texto: string }) => mensagem.texto.startsWith("[Contexto da tela]");
		const mensagens = this.pedidos[indice]?.mensagens ?? [];
		const ultimaDoUsuario = mensagens.findLastIndex((mensagem) => mensagem.role === "user" && !ehContexto(mensagem));
		return mensagens.slice(ultimaDoUsuario + 1).find(ehContexto)?.texto;
	}

	private atender(pedido: IncomingMessage, resposta: ServerResponse): void {
		let corpo = "";
		pedido.setEncoding("utf8");
		pedido.on("data", (parte: string) => {
			corpo += parte;
		});
		pedido.on("end", () => {
			const dados = JSON.parse(corpo) as { messages?: Array<{ role?: unknown; content?: unknown }> };
			this.pedidos.push({
				mensagens: (dados.messages ?? []).map((mensagem) => ({ role: String(mensagem.role), texto: textoDoConteudo(mensagem.content) })),
				imagens: (dados.messages ?? []).reduce(
					(soma, mensagem) => soma + (Array.isArray(mensagem.content) ? mensagem.content.filter((parte: { type?: unknown }) => parte?.type === "image_url").length : 0),
					0,
				),
			});
			const numero = this.pedidos.length;
			const prontas = this.esperas.filter((espera) => numero >= espera.quantos);
			this.esperas = this.esperas.filter((espera) => numero < espera.quantos);
			for (const espera of prontas) espera.resolver();
			const responder = () => this.responder(resposta, `Resposta ${numero}.`);
			if (this.segurando) this.presos.push(responder);
			else responder();
		});
	}

	private responder(resposta: ServerResponse, texto: string): void {
		if (resposta.destroyed || resposta.writableEnded) return;
		const pedaco = (dados: object) => `data: ${JSON.stringify({ id: "r", object: "chat.completion.chunk", created: 0, model: "modelo", ...dados })}\n\n`;
		resposta.writeHead(200, { "content-type": "text/event-stream" });
		resposta.write(pedaco({ choices: [{ index: 0, delta: { role: "assistant", content: texto }, finish_reason: null }] }));
		resposta.write(pedaco({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
		resposta.write(pedaco({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }));
		resposta.end("data: [DONE]\n\n");
	}
}

/** A conversa gravada no arquivo, na ordem: ["usuario", texto], ["contexto", details] e ["assistente", texto]. */
async function conversaGravada(arquivo: string): Promise<Array<[string, unknown]>> {
	const saida: Array<[string, unknown]> = [];
	for (const texto of (await readFile(arquivo, "utf8")).split("\n")) {
		if (!texto.trim()) continue;
		const linha = JSON.parse(texto) as { type?: unknown; customType?: unknown; display?: unknown; details?: unknown; message?: { role?: unknown; content?: unknown } };
		if (linha.type === "custom_message" && linha.customType === TIPO_MENSAGEM_CONTEXTO_TELA) {
			expect(linha.display).toBe(false);
			saida.push(["contexto", linha.details]);
		} else if (linha.type === "message" && linha.message?.role === "user") {
			saida.push(["usuario", textoDoConteudo(linha.message.content)]);
		} else if (linha.type === "message" && linha.message?.role === "assistant") {
			saida.push(["assistente", textoDoConteudo(linha.message.content)]);
		}
	}
	return saida;
}

async function contextosGravados(arquivo: string): Promise<unknown[]> {
	// Os itens de todas as mensagens custom, em sequência (cada uma tem details.contextos).
	return (await conversaGravada(arquivo)).filter(([tipo]) => tipo === "contexto").flatMap(([, dados]) => (dados as { contextos?: unknown[] }).contextos ?? []);
}

describe("contexto da tela e fila própria (WP1)", () => {
	let modelo: ModeloFalso;
	let eventos: EventoNucleo[];
	const notaA: ContextoTela = {
		tipo: "nota",
		rotulo: "Nota A",
		origem: "caderno/x/notas/Nota A",
		olho: true,
		conteudo: "# Nota A\nConteúdo da nota A.",
		selecao: "trecho de A",
	};
	const notaB: ContextoTela = { tipo: "nota", rotulo: "Nota B", olho: true, conteudo: "# Nota B\nConteúdo da nota B." };
	const conteudoA = "# Nota A\nConteúdo da nota A.";

	beforeEach(async () => {
		modelo = new ModeloFalso();
		const porta = await modelo.ligar();
		// O modelo falso é o padrão do pi nesta pasta; o "semchave" serve para o prompt() lançar.
		await escrever(
			join(pastaPi, "models.json"),
			JSON.stringify({
				providers: {
					falso: {
						baseUrl: `http://127.0.0.1:${porta}/v1`,
						api: "openai-completions",
						apiKey: "chave-de-teste",
						models: [{ id: "modelo", input: ["text", "image"], cost: { input: 1000, output: 2000, cacheRead: 0, cacheWrite: 0 } }],
					},
					semchave: {
						baseUrl: `http://127.0.0.1:${porta}/v1`,
						api: "openai-completions",
						apiKey: "$ESTUDOS_TESTE_VARIAVEL_QUE_NAO_EXISTE",
						models: [{ id: "modelo" }],
					},
				},
			}),
		);
		await escrever(join(pastaPi, "settings.json"), JSON.stringify({ defaultProvider: "falso", defaultModel: "modelo" }));
		eventos = [];
	});

	afterEach(async () => {
		await janela?.descartar();
		janela = undefined;
		await modelo.desligar();
	});

	async function abrirJanela(sessaoId?: string): Promise<JanelaPerfil> {
		const aberta = new JanelaPerfil(await lerPerfil(pastaPerfil), { pastaPi });
		aberta.assinar((evento) => eventos.push(evento));
		janela = aberta;
		await aberta.iniciar(sessaoId ? { sessaoId } : {});
		expect(aberta.estado?.modelo).toBe("falso/modelo");
		return aberta;
	}

	function arquivoDaSessao(aberta: JanelaPerfil): string {
		const arquivo = aberta.sessaoPi?.sessionFile;
		if (!arquivo) throw new Error("sessão sem arquivo");
		return arquivo;
	}

	const ultimaFila = () => eventos.filter((evento) => evento.tipo === "fila").at(-1);

	it("enviar com contextoTela grava a mensagem custom nucleo.contexto-tela (display false) logo depois da mensagem do usuário, pelo before_agent_start", async () => {
		const aberta = await abrirJanela();
		expect(await aberta.enviar("O que é o critério da razão?", [notaA])).toBe("iniciada");
		await aberta.aguardarOcioso();

		expect(await conversaGravada(arquivoDaSessao(aberta))).toEqual([
			["usuario", "O que é o critério da razão?"],
			["contexto", { contextos: [{ tipo: "nota", rotulo: "Nota A", origem: "caderno/x/notas/Nota A", olho: true, selecao: "trecho de A", hash: hashConteudo(conteudoA) }] }],
			["assistente", "Resposta 1."],
		]);
		// O modelo viu a mensagem do usuário e, logo depois, o contexto com o conteúdo inteiro.
		const vistas = (modelo.pedidos[0]?.mensagens ?? []).filter((mensagem) => mensagem.role === "user").map((mensagem) => mensagem.texto);
		expect(vistas[0]).toBe("O que é o critério da razão?");
		expect(vistas[1]).toContain(`<conteudo>\n${conteudoA}\n</conteudo>`);
		expect(vistas[1]).toContain("trecho de A");

		// Sem contexto, nenhuma mensagem custom.
		await aberta.enviar("E sem nada aberto?");
		await aberta.aguardarOcioso();
		expect(await contextosGravados(arquivoDaSessao(aberta))).toHaveLength(1);
		expect(modelo.contextoDoPedido(1)).toBeUndefined();
	});

	it("enviar durante uma resposta guarda {texto, contextoTela} na fila própria, emite o evento fila e manda com prompt() quando a execução termina sem abortar", async () => {
		const aberta = await abrirJanela();
		modelo.segurar();
		expect(await aberta.enviar("primeira", [notaA])).toBe("iniciada");
		await modelo.esperarPedidos(1);
		expect(await aberta.enviar("segunda", [notaB])).toBe("enfileirada");
		expect(ultimaFila()).toEqual({ tipo: "fila", mensagens: ["segunda"] });
		// Nada foi para a fila do pi: a segunda só sai quando a primeira terminar.
		expect(aberta.sessaoPi?.pendingMessageCount).toBe(0);
		expect(modelo.pedidos).toHaveLength(1);

		modelo.soltar();
		await aberta.aguardarOcioso();
		expect(modelo.pedidos).toHaveLength(2);
		expect(modelo.contextoDoPedido(1)).toContain('"Nota B"');
		expect(ultimaFila()).toEqual({ tipo: "fila", mensagens: [] });
		// Cada mensagem foi uma execução própria.
		expect(eventos.filter((evento) => evento.tipo === "execucao_fim")).toEqual([
			{ tipo: "execucao_fim", abortada: false },
			{ tipo: "execucao_fim", abortada: false },
		]);
	});

	it("as imagens vão ao modelo junto da mensagem, a fila própria as guarda e o evento e o histórico só contam", async () => {
		const aberta = await abrirJanela();
		// Um PNG de 1x1 de verdade: o pi decodifica a imagem antes de mandar.
		const imagem = { tipo: "image/png" as const, dados: PNG_1X1 };
		modelo.segurar();
		expect(await aberta.enviar("olha isto", undefined, [imagem])).toBe("iniciada");
		await modelo.esperarPedidos(1);
		expect(await aberta.enviar("e isto", undefined, [imagem, imagem])).toBe("enfileirada");
		modelo.soltar();
		await aberta.aguardarOcioso();
		expect(modelo.pedidos.map((pedido) => pedido.imagens)).toEqual([1, 3]);
		expect(eventos.filter((evento) => evento.tipo === "mensagem_usuario")).toMatchObject([
			{ texto: "olha isto", imagens: 1 },
			{ texto: "e isto", imagens: 2 },
		]);
		expect(JSON.stringify(eventos)).not.toContain(PNG_1X1);
		expect(aberta.historico().flatMap((item) => (item.papel === "usuario" ? [[item.texto, item.imagens]] : []))).toEqual([
			["olha isto", 1],
			["e isto", 2],
		]);
		// Sem imagem, o campo nem aparece.
		await aberta.enviar("sem imagem");
		await aberta.aguardarOcioso();
		expect(modelo.pedidos.at(-1)?.imagens).toBe(3); // as mesmas três, já na conversa
		expect(aberta.historico().filter((item) => item.papel === "usuario").at(-1)).not.toHaveProperty("imagens");
	});

	it("dois envios seguidos, um durante a resposta, deixam dois contextos na sessão, cada um com o seu texto", async () => {
		const aberta = await abrirJanela();
		modelo.segurar();
		const envios = await Promise.all([aberta.enviar("sobre a nota A", [notaA]), aberta.enviar("e a nota B?", [notaB])]);
		expect(envios).toEqual(["iniciada", "enfileirada"]);
		await modelo.esperarPedidos(1);
		modelo.soltar();
		await aberta.aguardarOcioso();

		const conversa = await conversaGravada(arquivoDaSessao(aberta));
		expect(conversa.map(([tipo, dados]) => (tipo === "contexto" ? `contexto ${(dados as { contextos: Array<{ rotulo: string }> }).contextos.map((contexto) => contexto.rotulo).join("+")}` : `${tipo} ${String(dados)}`))).toEqual([
			"usuario sobre a nota A",
			"contexto Nota A",
			"assistente Resposta 1.",
			"usuario e a nota B?",
			"contexto Nota B",
			"assistente Resposta 2.",
		]);
		// E o histórico prende cada resumo ao seu texto.
		expect(aberta.historico().flatMap((item) => (item.papel === "usuario" ? [[item.texto, item.contextosTela?.map((contexto) => contexto.rotulo).join("+")]] : []))).toEqual([
			["sobre a nota A", "Nota A"],
			["e a nota B?", "Nota B"],
		]);
	});

	it("abortar e trocar de sessão esvaziam a fila própria; abortar devolve os textos da fila", async () => {
		const aberta = await abrirJanela();
		modelo.segurar();
		await aberta.enviar("primeira", [notaA]);
		await modelo.esperarPedidos(1);
		await aberta.enviar("segunda", [notaB]);
		await aberta.enviar("terceira");
		expect(await aberta.abortar()).toEqual(["segunda", "terceira"]);
		expect(ultimaFila()).toEqual({ tipo: "fila", mensagens: [] });
		await aberta.aguardarOcioso();
		expect(modelo.pedidos).toHaveLength(1);
		expect((await conversaGravada(arquivoDaSessao(aberta))).filter(([tipo]) => tipo === "usuario")).toEqual([["usuario", "primeira"]]);

		// Trocar de sessão: a fila da conversa que sai não vai para a nova.
		modelo.segurar();
		await aberta.enviar("quarta", [notaA]);
		await modelo.esperarPedidos(2);
		expect(await aberta.enviar("quinta", [notaB])).toBe("enfileirada");
		await aberta.novaSessao();
		expect(ultimaFila()).toEqual({ tipo: "fila", mensagens: [] });
		modelo.soltar();
		await aberta.aguardarOcioso();
		expect(modelo.pedidos).toHaveLength(2);
		expect(aberta.historico()).toEqual([]);
	});

	it("se prompt() lançar, o contexto pendente é limpo e não vai na mensagem seguinte", async () => {
		const registro = await criarRegistroModelos(pastaPi);
		const aberta = new JanelaPerfil(await lerPerfil(pastaPerfil), { pastaPi, registroModelos: registro });
		aberta.assinar((evento) => eventos.push(evento));
		janela = aberta;
		await aberta.iniciar();
		const sessao = aberta.sessaoPi;
		const semChave = registro.getModel("semchave", "modelo");
		const falso = registro.getModel("falso", "modelo");
		if (!sessao || !semChave || !falso) throw new Error("faltou a sessão ou os modelos de teste");

		// Um modelo sem credencial: o prompt() lança antes de começar a execução.
		sessao.agent.state.model = semChave;
		expect(await aberta.enviar("vai falhar", [notaA])).toBe("iniciada");
		await aberta.aguardarOcioso();
		expect(eventos.filter((evento) => evento.tipo === "erro").at(-1)).toMatchObject({ tipo: "erro", origem: "nucleo" });
		expect(modelo.pedidos).toHaveLength(0);

		sessao.agent.state.model = falso;
		await aberta.enviar("agora sem contexto");
		await aberta.aguardarOcioso();
		expect(modelo.pedidos).toHaveLength(1);
		expect(modelo.contextoDoPedido(0)).toBeUndefined();
		expect(await contextosGravados(arquivoDaSessao(aberta))).toEqual([]);
	});

	it("conteúdo com o mesmo hash do último contexto ainda em sessao.messages vai como repetido; depois de compactar, de reabrir a sessão e de trocar de agente, o hash vem das mensagens", async () => {
		const aberta = await abrirJanela();
		const hashA = hashConteudo(conteudoA);

		await aberta.enviar("um", [notaA]);
		await aberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(0)).toContain("<conteudo>");

		// Mesmo conteúdo: só a frase, e a mensagem não grava hash (o conteúdo não foi nela).
		await aberta.enviar("dois", [{ ...notaA, selecao: "outro trecho" }]);
		await aberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(1)).not.toContain("<conteudo>");
		expect(modelo.contextoDoPedido(1)).toMatch(/mesmo conteúdo de "Nota A"/);
		expect(modelo.contextoDoPedido(1)).toContain("outro trecho");
		expect((await contextosGravados(arquivoDaSessao(aberta))).at(-1)).not.toHaveProperty("hash");

		// Trocar de agente remonta a sessão: o hash vem das mensagens, não da memória.
		await aberta.trocarAgente("outro");
		await aberta.enviar("três", [notaA]);
		await aberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(2)).toMatch(/mesmo conteúdo/);

		// Reabrir a sessão numa janela nova (como depois de reiniciar o servidor).
		const id = aberta.estado?.sessaoId ?? "";
		await aberta.descartar();
		const reaberta = await abrirJanela(id);
		await reaberta.enviar("quatro", [notaA]);
		await reaberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(3)).toMatch(/mesmo conteúdo/);

		// O conteúdo mudou: vai inteiro de novo, com o hash novo.
		const mudada = `${conteudoA}\nUma linha nova.`;
		await reaberta.enviar("cinco", [{ ...notaA, conteudo: mudada }]);
		await reaberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(4)).toContain("Uma linha nova.");
		expect((await contextosGravados(arquivoDaSessao(reaberta))).at(-1)).toMatchObject({ hash: hashConteudo(mudada) });

		// Compactada: a mensagem com o conteúdo saiu do que o modelo vê; vai inteiro de novo.
		const compactada = "01a10000-0000-7000-8000-0000000000cc";
		await gravarSessaoCompactada(compactada, hashA);
		await reaberta.abrirSessao(compactada);
		await reaberta.enviar("seis", [notaA]);
		await reaberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(5)).toContain("<conteudo>");
		expect((await contextosGravados(arquivoDaSessao(reaberta))).at(-1)).toMatchObject({ hash: hashA });
	});

	it("olho fechado nunca leva conteúdo nem hash", async () => {
		const aberta = await abrirJanela();
		await aberta.enviar("olho fechado", [{ ...notaA, olho: false }]);
		await aberta.aguardarOcioso();
		const texto = modelo.contextoDoPedido(0) ?? "";
		expect(texto).toContain('"Nota A"');
		expect(texto).toContain("trecho de A");
		expect(texto).not.toContain("Conteúdo da nota A");
		const gravado = await readFile(arquivoDaSessao(aberta), "utf8");
		expect(gravado).not.toContain("Conteúdo da nota A");
		expect(gravado).not.toContain(hashConteudo(conteudoA));
		expect(await contextosGravados(arquivoDaSessao(aberta))).toEqual([
			{ tipo: "nota", rotulo: "Nota A", origem: "caderno/x/notas/Nota A", olho: false, selecao: "trecho de A" },
		]);

		// Depois de um olho fechado, o mesmo conteúdo com o olho aberto vai inteiro (não há hash visível).
		await aberta.enviar("agora aberto", [notaA]);
		await aberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(1)).toContain("<conteudo>");
	});

	it("o evento contexto_tela sai depois do mensagem_usuario, com o resumo sem o conteúdo", async () => {
		const aberta = await abrirJanela();
		await aberta.enviar("pergunta", [{ ...notaA, parcial: true }]);
		await aberta.aguardarOcioso();
		const tipos = new Set(["mensagem_usuario", "contexto_tela", "mensagem_assistente"]);
		expect(eventos.filter((evento) => tipos.has(evento.tipo)).map((evento) => evento.tipo)).toEqual(["mensagem_usuario", "contexto_tela", "mensagem_assistente"]);
		expect(eventos.find((evento) => evento.tipo === "contexto_tela")).toEqual({
			tipo: "contexto_tela",
			contextos: [{ tipo: "nota", rotulo: "Nota A", origem: "caderno/x/notas/Nota A", olho: true, parcial: true, selecao: "trecho de A" }],
		});
		expect(JSON.stringify(eventos)).not.toContain("Conteúdo da nota A");
	});

	it("duas abas, uma selecionada e outra não: o texto leva o conteúdo de uma e só o nome da outra, e o resumo traz as duas", async () => {
		const aberta = await abrirJanela();
		const licao: ContextoTela = { tipo: "licao", rotulo: "Lição 2.3", olho: false };
		await aberta.enviar("compare", [licao, { ...notaA, foco: true }]);
		await aberta.aguardarOcioso();

		const texto = modelo.contextoDoPedido(0) ?? "";
		expect(texto).toContain(`<conteudo>\n${conteudoA}\n</conteudo>`);
		expect(texto).toContain('"Lição 2.3"');
		expect(texto).toMatch(/conteúdo não mandado/);
		// A em foco vem primeiro, mesmo estando depois na lista.
		expect(texto.indexOf('"Nota A"')).toBeLessThan(texto.indexOf('"Lição 2.3"'));
		expect(await contextosGravados(arquivoDaSessao(aberta))).toEqual([
			// A não selecionada não leva conteúdo nem hash; a ordem gravada é a das abas.
			{ tipo: "licao", rotulo: "Lição 2.3", olho: false },
			{ tipo: "nota", rotulo: "Nota A", origem: "caderno/x/notas/Nota A", olho: true, selecao: "trecho de A", foco: true, hash: hashConteudo(conteudoA) },
		]);
		expect(aberta.historico()).toMatchObject([{ papel: "usuario", contextosTela: [{ rotulo: "Lição 2.3" }, { rotulo: "Nota A", foco: true }] }, { papel: "assistente" }]);
		expect(JSON.stringify(aberta.historico())).not.toContain("Conteúdo da nota A");

		// O mesmo conteúdo de novo, com outra aba junto: a frase de repetido só na selecionada.
		await aberta.enviar("de novo", [licao, { ...notaA, foco: true }]);
		await aberta.aguardarOcioso();
		expect(modelo.contextoDoPedido(1)).toMatch(/mesmo conteúdo de "Nota A"/);
		expect(modelo.contextoDoPedido(1)).not.toContain("<conteudo>");
	});

	it("historico() prende o resumo do contexto ao item do usuário anterior e o estado do historico traz o uso somado do ramo inteiro, com os subagentes", async () => {
		const id = "01a10000-0000-7000-8000-0000000000dd";
		await gravarSessaoComUso(id);
		const aberta = await abrirJanela(id);
		// A primeira pergunta foi compactada: o histórico começa na segunda, com o contexto dela.
		// A sessão é do formato antigo (details de um contexto só): vira uma lista de um.
		expect(aberta.historico()).toMatchObject([
			{ papel: "usuario", texto: "Pergunta 2", contextosTela: [{ tipo: "nota", rotulo: "Nota B", olho: true }] },
			{ papel: "assistente", ferramentas: [{ nome: "subagent" }] },
			{ papel: "ferramenta", nome: "subagent" },
			{ papel: "assistente", texto: "Resposta 2" },
		]);
		expect(JSON.stringify(aberta.historico())).not.toContain("conteúdo gravado");
		// O uso soma o ramo inteiro do arquivo: as respostas (inclusive a compactada) e o subagente.
		const antes = aberta.usoDoRamo();
		expect(antes).toMatchObject({ tokensEntrada: 1111, tokensSaida: 111, tokensCacheLeitura: 11, tokensCacheEscrita: 0, tokensTotal: 1233 });
		expect(antes?.custo).toBeCloseTo(1.111, 9);
		// Uma resposta nova soma a ela (100 de entrada a 1000/milhão e 10 de saída a 2000/milhão).
		await aberta.enviar("Pergunta 3");
		await aberta.aguardarOcioso();
		const depois = aberta.usoDoRamo();
		expect(depois?.tokensTotal).toBe(1233 + 110);
		expect(depois?.custo).toBeCloseTo((antes?.custo ?? 0) + (100 * 1000 + 10 * 2000) / 1_000_000, 9);
	});
});

const usoPi = (input: number, output: number, cacheRead: number, custo: number) => ({
	input,
	output,
	cacheRead,
	cacheWrite: 0,
	totalTokens: input + output + cacheRead,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: custo },
});

async function gravarLinhas(id: string, linhas: unknown[]): Promise<void> {
	const pasta = pastaSessoes({ pastaDados });
	await mkdir(pasta, { recursive: true });
	await writeFile(join(pasta, `2026-10-16T10-00-00-000Z_${id}.jsonl`), `${linhas.map((linha) => JSON.stringify(linha)).join("\n")}\n`);
}

function respostaGravada(id: string, parentId: string, texto: string, timestamp: number, usage: unknown) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date(timestamp).toISOString(),
		message: { role: "assistant", content: [{ type: "text", text: texto }], api: "openai-completions", provider: "falso", model: "modelo", usage, stopReason: "stop", timestamp },
	};
}

function perguntaGravada(id: string, parentId: string, texto: string, timestamp: number) {
	return { type: "message", id, parentId, timestamp: new Date(timestamp).toISOString(), message: { role: "user", content: texto, timestamp } };
}

function contextoGravado(id: string, parentId: string, timestamp: number, conteudo: string, details: unknown) {
	return { type: "custom_message", id, parentId, timestamp: new Date(timestamp).toISOString(), customType: TIPO_MENSAGEM_CONTEXTO_TELA, content: conteudo, display: false, details };
}

/** Sessão com um contexto de olho aberto (hash `hash`) que a compactação tirou do que o modelo vê. */
async function gravarSessaoCompactada(id: string, hash: string): Promise<void> {
	const t = Date.parse("2026-10-16T10:00:00.000Z");
	await gravarLinhas(id, [
		{ type: "session", version: 3, id, timestamp: new Date(t).toISOString(), cwd: pastaDados },
		{ type: "custom", id: "c1", parentId: null, timestamp: new Date(t).toISOString(), customType: TIPO_ENTRADA_AGENTE, data: { agente: "geral" } },
		perguntaGravada("c2", "c1", "Pergunta antiga", t + 1000),
		contextoGravado("c3", "c2", t + 1000, "[Contexto da tela] conteúdo gravado", { tipo: "nota", rotulo: "Nota A", olho: true, hash }),
		respostaGravada("c4", "c3", "Resposta antiga", t + 2000, usoPi(10, 1, 0, 0)),
		perguntaGravada("c5", "c4", "Pergunta nova", t + 3000),
		respostaGravada("c6", "c5", "Resposta nova", t + 4000, usoPi(10, 1, 0, 0)),
		{ type: "compaction", id: "c7", parentId: "c6", timestamp: new Date(t + 5000).toISOString(), summary: "Resumo da conversa.", firstKeptEntryId: "c5", tokensBefore: 100 },
	]);
}

/**
 * Sessão com contexto da tela e uso: a primeira pergunta (uso 1000/100/10,
 * custo 1) foi compactada; a segunda tem contexto, chama um subagente (o
 * usage do resultado é o da filha: 100/10/1, custo 0,1) e responde duas vezes
 * (10/1/0, custo 0,01; 1/0/0, custo 0,001).
 */
async function gravarSessaoComUso(id: string): Promise<void> {
	const t = Date.parse("2026-10-16T11:00:00.000Z");
	await gravarLinhas(id, [
		{ type: "session", version: 3, id, timestamp: new Date(t).toISOString(), cwd: pastaDados },
		{ type: "custom", id: "u1", parentId: null, timestamp: new Date(t).toISOString(), customType: TIPO_ENTRADA_AGENTE, data: { agente: "geral" } },
		perguntaGravada("u2", "u1", "Pergunta 1", t + 1000),
		contextoGravado("u3", "u2", t + 1000, "conteúdo gravado A", { tipo: "nota", rotulo: "Nota A", olho: true, hash: "a".repeat(64) }),
		respostaGravada("u4", "u3", "Resposta 1", t + 2000, usoPi(1000, 100, 10, 1)),
		perguntaGravada("u5", "u4", "Pergunta 2", t + 3000),
		contextoGravado("u6", "u5", t + 3000, "conteúdo gravado B", { tipo: "nota", rotulo: "Nota B", olho: true, hash: "b".repeat(64) }),
		{
			type: "message",
			id: "u7",
			parentId: "u6",
			timestamp: new Date(t + 4000).toISOString(),
			message: {
				role: "assistant",
				content: [{ type: "toolCall", id: "s1", name: "subagent", arguments: { agent: "outro", task: "x" } }],
				api: "openai-completions",
				provider: "falso",
				model: "modelo",
				usage: usoPi(10, 1, 0, 0.01),
				stopReason: "toolUse",
				timestamp: t + 4000,
			},
		},
		{
			type: "message",
			id: "u8",
			parentId: "u7",
			timestamp: new Date(t + 5000).toISOString(),
			message: { role: "toolResult", toolCallId: "s1", toolName: "subagent", content: [{ type: "text", text: "feito" }], usage: usoPi(100, 10, 1, 0.1), isError: false, timestamp: t + 5000 },
		},
		respostaGravada("u9", "u8", "Resposta 2", t + 6000, usoPi(1, 0, 0, 0.001)),
		{ type: "compaction", id: "u10", parentId: "u9", timestamp: new Date(t + 7000).toISOString(), summary: "Resumo.", firstKeptEntryId: "u5", tokensBefore: 1000 },
	]);
}
