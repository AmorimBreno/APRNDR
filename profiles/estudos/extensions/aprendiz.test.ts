// Testes da extensão do aprendiz sem o pi: um "pi" falso com um barramento síncrono (como o pi.events), o pi.on e
// o registerTool, numa pasta de dados temporária e numa pasta de cache temporária, com eventos escritos à mão.
// O modelo é um registro falso com respostas prontas (ou que esperam, para testar a trava). A tela é simulada
// mandando "interface:acao". Os dados reais do Breno não são usados.

import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acrescentarEvento, type Evento, lerEventos } from "../lib/eventos.ts";
import { gravarHipoteses, lerHipoteses, VERSAO_HIPOTESES, type Hipotese } from "../lib/hipoteses.ts";
import { caminhoDoMapa } from "../lib/mapa.ts";
import { arquivoMateria, eventosAprendiz } from "../lib/materias.ts";
import aprendizPadrao, { CAMINHO_PROMPT_REFLEXAO, montarAprendiz, naFilaDoProcesso } from "./aprendiz.ts";
import { lerPromptMapeador } from "./mapa.ts";

type Entrada = { type: string; customType?: string; data?: unknown };
type Pedido = { contexto: { systemPrompt?: string; messages: Array<{ role: string; content: unknown }> }; opcoes: { signal?: AbortSignal; temperature?: number } };
type Resposta = string | ((pedido: Pedido) => Promise<string>);
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] }; modelRegistry: unknown };
type Mostrado = { painel: string; acao: string; dados: Record<string, any>; gravar?: boolean };
type Resultado = { content: Array<{ text: string }>; details: any; isError?: boolean };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };

let dados = "";
let cache = "";
let barramento: EventEmitter;
let tratadores: Record<string, (evento: unknown, ctx: Contexto) => void>;
let ferramentas: Record<string, Ferramenta>;
let mostrados: Mostrado[];
let entradas: Entrada[];
let ctx: Contexto;
let respostas: Resposta[];
let chamadas: Pedido[];
let credencial: boolean;
let caminhoPrompt = "";

const MODELO = { provider: "teste", id: "modelo-x", cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 } };

const registro = {
	find: (provedor: string, id: string) => (provedor === "teste" && id === "modelo-x" ? MODELO : undefined),
	hasConfiguredAuth: () => credencial,
	complete: async (_modelo: unknown, contexto: Pedido["contexto"], opcoes: Pedido["opcoes"]) => {
		const pedido = { contexto: { ...contexto, messages: [...contexto.messages] }, opcoes };
		chamadas.push(pedido);
		const resposta = respostas.shift();
		if (resposta === undefined) throw new Error("sem resposta pronta");
		let texto: string;
		try {
			texto = typeof resposta === "function" ? await resposta(pedido) : resposta;
		} catch (erro) {
			if (opcoes.signal?.aborted) return { role: "assistant", content: [], stopReason: "aborted", errorMessage: "abortado", usage: { cost: { total: 0 } } };
			throw erro;
		}
		return { role: "assistant", content: [{ type: "text", text: texto }], stopReason: "stop", usage: { cost: { total: 0.01 } } };
	},
};

function criarPi(): ExtensionAPI {
	return {
		events: {
			on: (canal: string, ouvinte: (dados: unknown) => void) => {
				barramento.on(canal, ouvinte);
				return () => barramento.off(canal, ouvinte);
			},
			emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
		},
		on: (evento: string, tratador: (evento: unknown, ctx: Contexto) => void) => {
			tratadores[evento] = tratador;
		},
		registerTool: (definicao: Ferramenta & { name: string }) => {
			ferramentas[definicao.name] = definicao;
		},
	} as unknown as ExtensionAPI;
}

const iniciar = () => tratadores.session_start?.({}, ctx);
const ligar = () => {
	montarAprendiz(criarPi(), { pastaCache: cache, caminhoPrompt });
	iniciar();
};

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-aprendiz-"));
	cache = await mkdtemp(join(tmpdir(), "estudos-ext-aprendiz-cache-"));
	caminhoPrompt = join(cache, "reflexao.md");
	await writeFile(caminhoPrompt, "---\nmodel: teste/modelo-x\n---\nReflita sobre os eventos.\n", "utf8");
	entradas = [];
	respostas = [];
	chamadas = [];
	credencial = true;
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas }, modelRegistry: registro };
	barramento = new EventEmitter();
	tratadores = {};
	ferramentas = {};
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
});

afterEach(async () => {
	tratadores.session_shutdown?.({}, ctx);
	await rm(dados, { recursive: true, force: true });
	await rm(cache, { recursive: true, force: true });
});

async function esperar(condicao: () => boolean): Promise<void> {
	for (let tentativa = 0; tentativa < 400 && !condicao(); tentativa++) await new Promise((resolver) => setTimeout(resolver, 5));
	if (!condicao()) throw new Error(`não aconteceu; mostrado: ${JSON.stringify(mostrados.map((item) => item.acao))}`);
}
const pausa = (ms = 60) => new Promise((resolver) => setTimeout(resolver, ms));

const pedir = (dadosAcao: Record<string, unknown> = {}, painel = "aprendiz", acao = "indicadores") => barramento.emit("interface:acao", { painel, acao, dados: dadosAcao });
const recebidas = (acao: string) => mostrados.filter((mensagem) => mensagem.acao === acao);
const doPedido = (pedido: string) => mostrados.filter((mensagem) => mensagem.dados.pedido === pedido);

async function escrever(arquivo: string, conteudo: unknown): Promise<void> {
	await mkdir(dirname(arquivo), { recursive: true });
	await writeFile(arquivo, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo), "utf8");
}
const criarMateria = (id: string) => escrever(arquivoMateria(dados, id), { id, nome: id, cor: "moss", glifo: "学", provas: [], criadaEm: "2026-10-01T00:00:00.000Z" });
const criarMapa = (materia: string, ids: string[]) =>
	escrever(caminhoDoMapa(dados, materia), {
		versao: 1,
		situacao: "aprovado",
		conceitos: ids.map((id) => ({ id, nome: `Nome de ${id}`, descricao: "", referencias: [], prioridade: "central", origem: "material", criadoEm: "2026-10-01T00:00:00.000Z" })),
		arquivos: {},
	});

async function gravarAcerto(id: string): Promise<void> {
	await acrescentarEvento(eventosAprendiz(dados), {
		id,
		ts: "2026-11-01T10:00:00.000Z",
		sessao: "s1",
		verbo: "respondeu_questao",
		objeto: { materia: "mat", curso: "curso", conceitos: ["c1"], questao: "q1" },
		resultado: { correta: true, escolha: 0, confianca: 3 },
	});
}

/** Um erro de c1 na sessão dada. */
const erro = (n: number, sessao: string, extra: Partial<Evento> = {}): Evento => ({
	id: `ev${String(n).padStart(3, "0")}`,
	ts: `2026-11-0${Math.min(n, 9)}T10:00:00.000Z`,
	sessao,
	verbo: "respondeu_questao",
	objeto: { materia: "mat", curso: "curso", conceitos: ["c1"], questao: `q${n}` },
	resultado: { correta: false, confianca: 4 },
	...extra,
});
const gravarEventos = async (...eventos: Evento[]) => {
	for (const evento of eventos) await acrescentarEvento(eventosAprendiz(dados), evento);
};

/** A matéria "mat" com o mapa (c1, c2) e três erros de c1 em duas sessões. */
async function cenario(): Promise<void> {
	await criarMateria("mat");
	await criarMapa("mat", ["c1", "c2"]);
	await gravarEventos(erro(1, "s1"), erro(2, "s1"), erro(3, "s2"));
}

const propostaCriar = (evidencias: string[], enunciado = "Em c1, confunde o erro com acerto de confiança alta") =>
	JSON.stringify({
		propostas: [{ acao: "criar", tipo: "misconception", escopo: { nivel: "conceito", materia: "mat", conceitos: ["c1"] }, enunciado, evidencias, motivo: "errou com confiança 4" }],
	});

/** Uma resposta que só sai quando o teste mandar. */
function adiada(): { resposta: Resposta; soltar(texto: string): void; chegou(): boolean } {
	let soltar: (texto: string) => void = () => undefined;
	let chegou = false;
	const resposta: Resposta = (pedido) =>
		new Promise<string>((resolver, rejeitar) => {
			chegou = true;
			soltar = resolver;
			pedido.opcoes.signal?.addEventListener("abort", () => rejeitar(new Error("abortado")));
		});
	return { resposta, soltar: (texto) => soltar(texto), chegou: () => chegou };
}

function hipotese(extra: Partial<Hipotese> = {}): Hipotese {
	return {
		id: "h-1",
		tipo: "misconception",
		escopo: { nivel: "conceito", materia: "mat", conceitos: ["c1"] },
		enunciado: "Em c1, confunde o erro com acerto de confiança alta",
		aFavor: ["ev001", "ev003"],
		contra: [],
		confianca: "baixa",
		criadaEm: "2026-11-05T10:00:00.000Z",
		ultimaConfirmacao: "2026-11-05T10:00:00.000Z",
		validade: new Date(Date.now() + 30 * 86_400_000).toISOString(),
		status: "proposta",
		aprovadaPeloUsuario: false,
		versao: 1,
		anteriores: [],
		reflexao: "r-0",
		...extra,
	};
}
const guardarHipoteses = (...hipoteses: Hipotese[]) => gravarHipoteses(dados, { versao: VERSAO_HIPOTESES, hipoteses, mudancas: [] });

describe("ponte do aprendiz: indicadores", () => {
	it("responde indicadores com interface:mostrar passageiro (gravar: false), no painel aprendiz", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		ligar();
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados).toHaveLength(1);
		const resposta = mostrados[0]!;
		expect(resposta).toMatchObject({ painel: "aprendiz", acao: "indicadores", gravar: false });
		expect(resposta.dados.indicadores.ultimoEvento).toBe("e1");
		expect(resposta.dados.indicadores.conceitos[0]).toMatchObject({ conceito: "c1", materia: "mat", observacoes: 1 });
		expect(await readdir(cache)).toContain("indicadores.json");
	});

	it("repete o pedido (a tela abre de novo) e devolve o mesmo do cache; ecoa o pedido se vier", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		ligar();
		pedir({ pedido: "p1" });
		await esperar(() => mostrados.length === 1);
		pedir();
		await esperar(() => mostrados.length === 2);
		expect(mostrados[0]!.dados.pedido).toBe("p1");
		expect(mostrados[1]!.dados).not.toHaveProperty("pedido");
		expect(mostrados[1]!.dados.indicadores).toEqual(mostrados[0]!.dados.indicadores);
	});

	it("sem eventos nem matérias responde vazio, sem erro", async () => {
		ligar();
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]!.acao).toBe("indicadores");
		expect(mostrados[0]!.dados.indicadores.conceitos).toEqual([]);
	});

	it("responde erro ({ mensagem }, gravar: false) quando o cálculo falha", async () => {
		await mkdir(eventosAprendiz(dados), { recursive: true });
		ligar();
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]).toMatchObject({ painel: "aprendiz", acao: "erro", gravar: false });
		expect(mostrados[0]!.dados.mensagem).toMatch(/indicadores do aprendiz/);
	});

	it("uma fila só: pedidos em rajada são atendidos um de cada vez, na ordem, e um que falha não trava os seguintes", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		ligar();
		for (const pedido of ["a", "b", "c", "d"]) pedir({ pedido });
		await esperar(() => mostrados.length === 4);
		expect(mostrados.map((mensagem) => mensagem.dados.pedido)).toEqual(["a", "b", "c", "d"]);
		await rm(eventosAprendiz(dados));
		await mkdir(eventosAprendiz(dados));
		pedir({ pedido: "e" });
		await esperar(() => mostrados.length === 5);
		expect(mostrados[4]!.acao).toBe("erro");
		await rm(eventosAprendiz(dados), { recursive: true });
		pedir({ pedido: "f" });
		await esperar(() => mostrados.length === 6);
		expect(mostrados[5]).toMatchObject({ acao: "indicadores" });
	});

	it("a exportação padrão monta a ponte e a ferramenta (o pi chama a fábrica só com o pi)", () => {
		aprendizPadrao(criarPi());
		expect(barramento.listenerCount("interface:acao")).toBe(1);
		expect(barramento.listenerCount("aprendiz:gatilho")).toBe(1);
		expect(tratadores.session_start).toBeTypeOf("function");
		expect(ferramentas.ler_perfil_aprendiz).toBeDefined();
	});

	it("o prompt do perfil diz o modelo e tem o prompt da reflexão", async () => {
		const prompt = lerPromptMapeador(await readFile(CAMINHO_PROMPT_REFLEXAO, "utf8"));
		expect(prompt.modelo).toBe("openrouter/openai/gpt-6.1-sol");
		expect(prompt.instrucoes).toContain('{"propostas"');
		expect(prompt.instrucoes).toContain("autoavaliação");
	});
});

describe("ponte do aprendiz: calada e sem gravar", () => {
	it("fica calada sem session_start, ignora outros painéis e outras ações, e para de falar depois do session_shutdown", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		montarAprendiz(criarPi(), { pastaCache: cache, caminhoPrompt });
		for (const acao of ["indicadores", "hipoteses", "historico", "refletir", "decidir", "editar"]) pedir({ pedido: "p" }, "aprendiz", acao);
		barramento.emit("aprendiz:gatilho", { motivo: "licao" });
		await pausa();
		expect(mostrados).toEqual([]);
		expect(chamadas).toEqual([]);
		iniciar();
		pedir({}, "agenda");
		pedir({}, "aprendiz", "outra");
		barramento.emit("aprendiz:gatilho", { motivo: "outro" });
		await pausa();
		expect(mostrados).toEqual([]);
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados).toHaveLength(1);
		tratadores.session_shutdown?.({}, ctx);
		pedir({ pedido: "x" }, "aprendiz", "hipoteses");
		await pausa();
		expect(mostrados).toHaveLength(1);
	});

	it("tudo o que responde é passageiro (gravar: false) e no painel aprendiz", async () => {
		await cenario();
		ligar();
		respostas.push(propostaCriar(["ev001", "ev003"]));
		pedir({ pedido: "h" }, "aprendiz", "hipoteses");
		pedir({ pedido: "i" }, "aprendiz", "historico");
		pedir({ pedido: "r" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		pedir({ pedido: "d", alvo: "hipotese", id: "nao-existe", decisao: "aprovar" }, "aprendiz", "decidir");
		await esperar(() => doPedido("d").length === 1);
		expect(mostrados.length).toBeGreaterThan(4);
		expect(mostrados.every((mensagem) => mensagem.painel === "aprendiz" && mensagem.gravar === false)).toBe(true);
	});
});

describe("ponte do aprendiz: hipoteses e historico", () => {
	it("hipoteses: sem arquivo, estado vazio (e nada é criado); com arquivo, o que há, com refletindo false", async () => {
		ligar();
		pedir({ pedido: "a" }, "aprendiz", "hipoteses");
		await esperar(() => mostrados.length === 1);
		expect(mostrados[0]).toMatchObject({ acao: "hipoteses", dados: { pedido: "a", estado: { hipoteses: [], mudancas: [], refletindo: false } } });
		expect(await readdir(dados)).toEqual([]);
		await guardarHipoteses(hipotese());
		pedir({}, "aprendiz", "hipoteses");
		await esperar(() => mostrados.length === 2);
		expect(mostrados[1]!.dados.estado.hipoteses.map((item: Hipotese) => item.id)).toEqual(["h-1"]);
	});

	it("hipoteses: arquivo ilegível vira erro com a mensagem, e não é sobrescrito", async () => {
		await escrever(join(dados, "aprendiz", "hipoteses.json"), "{ nao e json");
		ligar();
		pedir({ pedido: "a" }, "aprendiz", "hipoteses");
		await esperar(() => mostrados.length === 1);
		expect(mostrados[0]).toMatchObject({ acao: "erro", dados: { pedido: "a", ao: "hipoteses" } });
		expect(mostrados[0]!.dados.mensagem).toMatch(/Não consegui ler as hipóteses/);
		expect(await readFile(join(dados, "aprendiz", "hipoteses.json"), "utf8")).toBe("{ nao e json");
	});

	it("historico: os mais novos primeiro, sem contexto, com o texto cortado; filtra pela matéria só se pedido; matéria removida fica", async () => {
		await criarMateria("mat");
		await gravarEventos(
			erro(1, "s1", { contexto: { fase: "x" }, resultado: { correta: false, texto: "t".repeat(900) } }),
			erro(2, "s1", { objeto: { materia: "removida", conceitos: ["z"] } }),
			erro(3, "s2"),
		);
		ligar();
		pedir({ pedido: "a" }, "aprendiz", "historico");
		await esperar(() => mostrados.length === 1);
		const todos = mostrados[0]!.dados.eventos as Evento[];
		expect(mostrados[0]!.acao).toBe("historico");
		expect(todos.map((evento) => evento.id)).toEqual(["ev003", "ev002", "ev001"]);
		expect(todos.every((evento) => !("contexto" in evento))).toBe(true);
		const longo = todos[2]!.resultado!.texto as string;
		expect(longo).toHaveLength(600);
		expect(longo.endsWith("…")).toBe(true);
		pedir({ materia: "mat" }, "aprendiz", "historico");
		await esperar(() => mostrados.length === 2);
		expect((mostrados[1]!.dados.eventos as Evento[]).map((evento) => evento.id)).toEqual(["ev003", "ev001"]);
		pedir({ materia: "nao-existe" }, "aprendiz", "historico");
		await esperar(() => mostrados.length === 3);
		expect(mostrados[2]!.dados.eventos).toEqual([]);
	});

	it("historico: até LIMITE_HISTORICO eventos", async () => {
		await criarMateria("mat");
		for (let n = 1; n <= 510; n++) await acrescentarEvento(eventosAprendiz(dados), erro(n, "s1", { id: `e${String(n).padStart(4, "0")}` }));
		ligar();
		pedir({}, "aprendiz", "historico");
		await esperar(() => mostrados.length === 1);
		const eventos = mostrados[0]!.dados.eventos as Evento[];
		expect(eventos).toHaveLength(500);
		expect(eventos[0]!.id).toBe("e0510");
	});
});

describe("ponte do aprendiz: refletir", () => {
	it("refletindo { pedido } e depois refletiu { pedido, resumo, estado } com a hipótese proposta gravada, a sessão nos eventos e o custo", async () => {
		await cenario();
		ligar();
		respostas.push(propostaCriar(["ev001", "ev003"]));
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["refletindo", "refletiu"]);
		expect(mostrados[0]!.dados).toEqual({ pedido: "r1" });
		const { resumo, estado, pedido } = mostrados[1]!.dados;
		expect(pedido).toBe("r1");
		expect(resumo).toMatchObject({ motivo: "botao", lidos: 3, propostas: 1, aceitas: 1, descartadas: [], ultimoEvento: "ev003", custo: 0.01 });
		expect(estado.refletindo).toBe(false);
		expect(estado.hipoteses).toHaveLength(1);
		expect(estado.hipoteses[0]).toMatchObject({ status: "proposta", aprovadaPeloUsuario: false, aFavor: ["ev001", "ev003"] });
		expect(estado.ultimaReflexao).toEqual(resumo);
		// o modelo recebeu o prompt, a temperatura 0 e a entrada
		expect(chamadas).toHaveLength(1);
		expect(chamadas[0]!.contexto.systemPrompt).toBe("Reflita sobre os eventos.");
		expect(chamadas[0]!.opcoes.temperature).toBe(0);
		expect(JSON.stringify(chamadas[0]!.contexto.messages)).toContain("ev001");
		const gravados = (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => ["refletiu", "propos_hipotese"].includes(evento.verbo));
		expect(gravados.map((evento) => evento.verbo)).toEqual(["refletiu", "propos_hipotese"]);
		expect(gravados.every((evento) => evento.sessao === "sessao-1")).toBe(true);
		expect(await lerHipoteses(dados)).toMatchObject({ ultimaReflexao: resumo });
	});

	it("sem eventos novos: refletiu com 0 lidos, sem chamar o modelo e sem gravar reflexão", async () => {
		await criarMateria("mat");
		ligar();
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		expect(mostrados[1]!.dados.resumo).toMatchObject({ lidos: 0, propostas: 0, aceitas: 0, descartadas: [] });
		expect(chamadas).toEqual([]);
		expect(await readdir(dados)).toEqual(["materias"]);
	});

	it("depois de uma reflexão, outra sem evento novo não chama o modelo; com evento novo lê só o novo", async () => {
		await cenario();
		ligar();
		respostas.push('{"propostas": []}');
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		pedir({ pedido: "r2" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 2);
		expect(chamadas).toHaveLength(1);
		expect(recebidas("refletiu")[1]!.dados.resumo.lidos).toBe(0);
		await gravarEventos(erro(5, "s3"));
		respostas.push('{"propostas": []}');
		pedir({ pedido: "r3" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 3);
		expect(recebidas("refletiu")[2]!.dados.resumo).toMatchObject({ lidos: 1, ultimoEvento: "ev005" });
		const mensagem = JSON.stringify(chamadas[1]!.contexto.messages);
		expect(mensagem).toContain("ev005");
		// ev001 a ev003 já foram lidos: só aparecem na seção dos anteriores, não entre os eventos novos
		const [anteriores, novos] = mensagem.split("## Eventos novos");
		expect(novos).not.toMatch(/ev00[1-3] \|/);
		expect(anteriores).toMatch(/ev001 \|/);
	});

	it("uma reflexão por vez: o segundo pedido recebe refletindo, não chama o modelo de novo, e os dois recebem o mesmo refletiu; hipoteses diz refletindo true", async () => {
		await cenario();
		ligar();
		const espera = adiada();
		respostas.push(espera.resposta);
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => espera.chegou());
		pedir({ pedido: "r2" }, "aprendiz", "refletir");
		pedir({ pedido: "h" }, "aprendiz", "hipoteses");
		await esperar(() => doPedido("h").length === 1);
		expect(doPedido("h")[0]!.dados.estado.refletindo).toBe(true);
		expect(recebidas("refletindo").map((mensagem) => mensagem.dados.pedido)).toEqual(["r1", "r2"]);
		expect(chamadas).toHaveLength(1);
		espera.soltar(propostaCriar(["ev001", "ev003"]));
		await esperar(() => recebidas("refletiu").length === 2);
		expect(recebidas("refletiu").map((mensagem) => mensagem.dados.pedido).sort()).toEqual(["r1", "r2"]);
		expect(recebidas("refletiu")[0]!.dados.resumo).toEqual(recebidas("refletiu")[1]!.dados.resumo);
		expect(chamadas).toHaveLength(1);
		expect((await lerHipoteses(dados)).hipoteses).toHaveLength(1);
		// terminou: outra reflexão pode começar
		pedir({ pedido: "r3" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 3);
	});

	it("erro vira erro { pedido, ao: 'refletir', mensagem } e nada é gravado: sem credencial, JSON ruim duas vezes", async () => {
		await cenario();
		ligar();
		credencial = false;
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => recebidas("erro").length === 1);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ pedido: "r1", ao: "refletir" });
		expect(recebidas("erro")[0]!.dados.mensagem).toMatch(/não tem credencial/);
		credencial = true;
		respostas.push("isto não é json", "nem isto");
		pedir({ pedido: "r2" }, "aprendiz", "refletir");
		await esperar(() => recebidas("erro").length === 2);
		expect(recebidas("erro")[1]!.dados).toMatchObject({ pedido: "r2", ao: "refletir" });
		expect(recebidas("erro")[1]!.dados.mensagem).toMatch(/nem na segunda tentativa/);
		expect(chamadas).toHaveLength(2);
		expect((await lerHipoteses(dados)).ultimaReflexao).toBeUndefined();
		// a trava soltou: o pedido seguinte funciona
		respostas.push('{"propostas": []}');
		pedir({ pedido: "r3" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		expect(recebidas("refletiu")[0]!.dados.resumo.lidos).toBe(3);
	});

	it("refletir sem pedido é erro; prompt sem modelo é erro claro", async () => {
		await cenario();
		ligar();
		pedir({}, "aprendiz", "refletir");
		await esperar(() => recebidas("erro").length === 1);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "refletir" });
		expect(chamadas).toEqual([]);
		await writeFile(caminhoPrompt, "sem frontmatter\n", "utf8");
		pedir({ pedido: "r" }, "aprendiz", "refletir");
		await esperar(() => recebidas("erro").length === 2);
		expect(recebidas("erro")[1]!.dados.mensagem).toMatch(/não diz o modelo/);
	});

	it("propostas ruins são descartadas pelo código e contadas no resumo (sem evidência, evidência de evento que não existe)", async () => {
		await cenario();
		ligar();
		respostas.push(
			JSON.stringify({
				propostas: [
					{ acao: "criar", tipo: "misconception", escopo: { nivel: "global" }, enunciado: "É um aprendiz visual de verdade", evidencias: ["ev001", "ev003"], motivo: "x" },
					{ acao: "criar", tipo: "misconception", escopo: { nivel: "global" }, enunciado: "Erra com confiança alta em tudo", evidencias: [], motivo: "x" },
					{ acao: "criar", tipo: "misconception", escopo: { nivel: "global" }, enunciado: "Erra com confiança alta sempre", evidencias: ["ev001", "fantasma"], motivo: "x" },
				],
			}),
		);
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		const { resumo, estado } = recebidas("refletiu")[0]!.dados;
		expect(resumo).toMatchObject({ propostas: 3, aceitas: 0 });
		expect(Object.fromEntries(resumo.descartadas.map((item: { motivo: string; quantas: number }) => [item.motivo, item.quantas]))).toEqual({ enunciado_generico: 1, sem_evidencia: 1, evidencia_inexistente: 1 });
		expect(estado.hipoteses).toEqual([]);
	});
});

describe("ponte do aprendiz: os gatilhos automáticos", () => {
	/** O cenário com 5 eventos de desempenho, o mínimo do gatilho automático. */
	async function cenarioDoGatilho(): Promise<void> {
		await cenario();
		await gravarEventos(erro(4, "s2"), erro(5, "s3"));
	}

	it("aprendiz:gatilho (lição ou módulo) reflete em segundo plano e manda hipoteses { estado } sozinha, sem pedido", async () => {
		await cenarioDoGatilho();
		ligar();
		respostas.push(propostaCriar(["ev001", "ev003"]));
		barramento.emit("aprendiz:gatilho", { motivo: "licao" });
		await esperar(() => recebidas("hipoteses").length === 1);
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["hipoteses"]);
		expect(mostrados[0]!.dados).not.toHaveProperty("pedido");
		expect(mostrados[0]!.dados.estado.hipoteses).toHaveLength(1);
		expect(mostrados[0]!.dados.estado.ultimaReflexao).toMatchObject({ motivo: "licao", lidos: 5 });
		await gravarEventos(erro(6, "s3"), erro(7, "s3"), erro(8, "s3"), erro(9, "s3"), erro(10, "s3"));
		respostas.push('{"propostas": []}');
		barramento.emit("aprendiz:gatilho", { motivo: "modulo" });
		await esperar(() => recebidas("hipoteses").length === 2);
		expect(recebidas("hipoteses")[1]!.dados.estado.ultimaReflexao).toMatchObject({ motivo: "modulo", lidos: 5 });
	});

	it("o gatilho com menos de 5 eventos de desempenho novos não chama o modelo, não mostra nada e a janela não avança; o botão chama", async () => {
		await cenario(); // 3 eventos de desempenho
		ligar();
		barramento.emit("aprendiz:gatilho", { motivo: "licao" });
		await pausa(100);
		expect(chamadas).toEqual([]);
		expect(mostrados).toEqual([]);
		expect((await lerHipoteses(dados)).ultimaReflexao).toBeUndefined();
		// só 2 de desempenho novos: continua sem chamar
		await gravarEventos(erro(4, "s2"), erro(5, "s3", { verbo: "avaliou_licao", resultado: { notas: { entendimento: 4 } } }));
		barramento.emit("aprendiz:gatilho", { motivo: "modulo" });
		await pausa(100);
		expect(chamadas).toEqual([]);
		// o botão chama sempre que há evento novo, com a janela inteira
		respostas.push('{"propostas": []}');
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		expect(recebidas("refletiu")[0]!.dados.resumo).toMatchObject({ motivo: "botao", lidos: 5 });
		expect(chamadas).toHaveLength(1);
	});

	it("um pedido do botão que entra numa reflexão automática parada no mínimo ainda recebe a reflexão", async () => {
		await cenario();
		ligar();
		respostas.push('{"propostas": []}');
		barramento.emit("aprendiz:gatilho", { motivo: "licao" });
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => recebidas("refletiu").length === 1);
		expect(recebidas("refletiu")[0]!.dados.resumo.lidos).toBe(3);
		expect(chamadas).toHaveLength(1);
	});

	it("sem evento novo não chama o modelo nem mostra nada; falha não mostra nada e não registra", async () => {
		await cenarioDoGatilho();
		ligar();
		credencial = false;
		barramento.emit("aprendiz:gatilho", { motivo: "modulo" });
		await pausa(100);
		expect(mostrados).toEqual([]);
		expect((await lerHipoteses(dados)).ultimaReflexao).toBeUndefined();
		credencial = true;
		respostas.push('{"propostas": []}');
		barramento.emit("aprendiz:gatilho", { motivo: "modulo" });
		await esperar(() => recebidas("hipoteses").length === 1);
		barramento.emit("aprendiz:gatilho", { motivo: "licao" });
		await pausa(100);
		expect(mostrados).toHaveLength(1);
		expect(chamadas).toHaveLength(1);
	});

	it("o gatilho durante uma reflexão não começa outra, e um pedido do botão que chega no meio recebe o resultado dela", async () => {
		await cenarioDoGatilho();
		ligar();
		const espera = adiada();
		respostas.push(espera.resposta);
		barramento.emit("aprendiz:gatilho", { motivo: "licao" });
		await esperar(() => espera.chegou());
		barramento.emit("aprendiz:gatilho", { motivo: "modulo" });
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await pausa();
		expect(chamadas).toHaveLength(1);
		espera.soltar('{"propostas": []}');
		await esperar(() => recebidas("refletiu").length === 1);
		expect(recebidas("refletiu")[0]!.dados.pedido).toBe("r1");
		await pausa();
		expect(chamadas).toHaveLength(1);
	});

	it("se a sessão acaba no meio, a reflexão para e não grava nem mostra nada", async () => {
		await cenarioDoGatilho();
		ligar();
		const espera = adiada();
		respostas.push(espera.resposta);
		barramento.emit("aprendiz:gatilho", { motivo: "licao" });
		await esperar(() => espera.chegou());
		tratadores.session_shutdown?.({}, ctx);
		await pausa(100);
		expect(mostrados).toEqual([]);
		expect((await lerHipoteses(dados)).ultimaReflexao).toBeUndefined();
	});
});

describe("ponte do aprendiz: decidir e editar", () => {
	it("decidir aprova uma hipótese proposta (com o enunciado editado) e responde decidida { pedido, estado }; o evento leva a sessão", async () => {
		await cenario();
		await guardarHipoteses(hipotese());
		ligar();
		pedir({ pedido: "d1", alvo: "hipotese", id: "h-1", decisao: "aprovar", enunciado: "Em c1, confunde erro com acerto quando confia muito" }, "aprendiz", "decidir");
		await esperar(() => recebidas("decidida").length === 1);
		const { estado, pedido } = recebidas("decidida")[0]!.dados;
		expect(pedido).toBe("d1");
		expect(estado.hipoteses[0]).toMatchObject({ status: "aprovada", aprovadaPeloUsuario: true, versao: 2, enunciado: "Em c1, confunde erro com acerto quando confia muito" });
		const aprovou = (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => evento.verbo === "aprovou_hipotese");
		expect(aprovou).toHaveLength(1);
		expect(aprovou[0]!.sessao).toBe("sessao-1");
	});

	it("decidir sobre uma mudança, editar o status e o enunciado", async () => {
		await cenario();
		await gravarHipoteses(dados, {
			versao: VERSAO_HIPOTESES,
			hipoteses: [hipotese({ status: "aprovada", aprovadaPeloUsuario: true })],
			mudancas: [{ id: "m-1", hipotese: "h-1", acao: "reforcar", evidencias: ["ev002"], motivo: "de novo", reflexao: "r-1", criadaEm: "2026-11-06T10:00:00.000Z" }],
		});
		ligar();
		pedir({ pedido: "d1", alvo: "mudanca", id: "m-1", decisao: "aprovar" }, "aprendiz", "decidir");
		await esperar(() => doPedido("d1").length === 1);
		expect(doPedido("d1")[0]!.dados.estado.mudancas).toEqual([]);
		expect(doPedido("d1")[0]!.dados.estado.hipoteses[0]!.aFavor).toEqual(["ev001", "ev003", "ev002"]);
		pedir({ pedido: "e1", id: "h-1", enunciado: "Em c1, confunde acerto com erro" }, "aprendiz", "editar");
		await esperar(() => doPedido("e1").length === 1);
		expect(doPedido("e1")[0]!.acao).toBe("decidida");
		expect(doPedido("e1")[0]!.dados.estado.hipoteses[0]!.enunciado).toBe("Em c1, confunde acerto com erro");
		pedir({ pedido: "e2", id: "h-1", status: "rejeitada" }, "aprendiz", "editar");
		await esperar(() => doPedido("e2").length === 1);
		expect(doPedido("e2")[0]!.dados.estado.hipoteses[0]).toMatchObject({ status: "rejeitada", aprovadaPeloUsuario: false });
		expect((await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => evento.verbo === "editou_hipotese")).toHaveLength(2);
	});

	it("erros viram erro { pedido, ao, mensagem }: id que não existe, enunciado genérico, entrada incompleta, status inválido", async () => {
		await cenario();
		await guardarHipoteses(hipotese());
		ligar();
		pedir({ pedido: "a", alvo: "hipotese", id: "h-9", decisao: "aprovar" }, "aprendiz", "decidir");
		pedir({ pedido: "b", alvo: "hipotese", id: "h-1", decisao: "aprovar", enunciado: "É um aprendiz visual mesmo" }, "aprendiz", "decidir");
		pedir({ pedido: "c", alvo: "coisa", id: "h-1", decisao: "aprovar" }, "aprendiz", "decidir");
		pedir({ pedido: "d", id: "h-1" }, "aprendiz", "editar");
		pedir({ pedido: "e", id: "h-1", status: "expirada" }, "aprendiz", "editar");
		pedir({ pedido: "f" }, "aprendiz", "editar");
		await esperar(() => recebidas("erro").length === 6);
		const por = (pedido: string) => doPedido(pedido)[0]!;
		expect(por("a").dados).toMatchObject({ ao: "decidir", mensagem: expect.stringMatching(/Não achei a hipótese/) });
		expect(por("b").dados.mensagem).toMatch(/enunciado não vale/);
		expect(por("c").dados).toMatchObject({ ao: "decidir" });
		expect(por("d").dados).toMatchObject({ ao: "editar", mensagem: expect.stringMatching(/Não há o que editar/) });
		expect(por("e").dados.mensagem).toMatch(/só põe aprovada ou rejeitada/);
		expect(por("f").dados).toMatchObject({ ao: "editar" });
		expect((await lerHipoteses(dados)).hipoteses[0]).toMatchObject({ status: "proposta", versao: 1 });
	});

	it("a fila de gravação: decisões em rajada e uma reflexão ao mesmo tempo não se pisam", async () => {
		await cenario();
		await guardarHipoteses(
			hipotese(),
			hipotese({ id: "h-2", enunciado: "Em c2, confunde duas fórmulas parecidas", escopo: { nivel: "conceito", materia: "mat", conceitos: ["c2"] } }),
			hipotese({ id: "h-3", enunciado: "Em c1, erra quando a questão tem código", tipo: "conhecimento" }),
		);
		ligar();
		const espera = adiada();
		respostas.push(espera.resposta);
		pedir({ pedido: "r" }, "aprendiz", "refletir");
		await esperar(() => espera.chegou());
		pedir({ pedido: "d1", alvo: "hipotese", id: "h-1", decisao: "aprovar" }, "aprendiz", "decidir");
		pedir({ pedido: "d2", alvo: "hipotese", id: "h-2", decisao: "rejeitar" }, "aprendiz", "decidir");
		pedir({ pedido: "d3", alvo: "hipotese", id: "h-3", decisao: "aprovar" }, "aprendiz", "decidir");
		await esperar(() => recebidas("decidida").length === 3);
		espera.soltar(propostaCriar(["ev001", "ev003"], "Em c1, mistura o erro com o acerto sempre"));
		await esperar(() => recebidas("refletiu").length === 1);
		const arquivo = await lerHipoteses(dados);
		expect(arquivo.hipoteses.map((item) => [item.id, item.status])).toEqual([
			["h-1", "aprovada"],
			["h-2", "rejeitada"],
			["h-3", "aprovada"],
			[expect.stringMatching(/^h-/), "proposta"],
		]);
		expect(arquivo.ultimaReflexao).toBeDefined();
	});
});

describe("a ferramenta ler_perfil_aprendiz", () => {
	const executar = (params: Record<string, unknown> = {}) => ferramentas.ler_perfil_aprendiz!.execute("id", params, undefined, undefined, ctx);

	const aprovada = (extra: Partial<Hipotese>) => hipotese({ status: "aprovada", aprovadaPeloUsuario: true, confianca: "media", ...extra });

	it("nada aprovado ainda: diz isso (só leitura; nada é criado)", async () => {
		await cenario();
		await guardarHipoteses(hipotese());
		ligar();
		const resultado = await executar({ materia: "mat" });
		expect(resultado.isError).toBeUndefined();
		expect(resultado.content[0]!.text).toMatch(/^Nada aprovado ainda/);
		expect((await lerHipoteses(dados)).hipoteses[0]!.status).toBe("proposta");
	});

	it("devolve só as aprovadas relevantes, com tipo, escopo, confiança e validade; pelo nome do conceito também", async () => {
		await cenario();
		await guardarHipoteses(
			aprovada({ id: "h-1", validade: "2099-01-31T00:00:00.000Z" }),
			aprovada({ id: "h-2", enunciado: "Em c2, só acerta com exemplo numérico", escopo: { nivel: "conceito", materia: "mat", conceitos: ["c2"] } }),
			aprovada({ id: "h-3", enunciado: "Estuda melhor em blocos curtos", tipo: "ritmo", escopo: { nivel: "global" } }),
			aprovada({ id: "h-4", enunciado: "Na matéria mat, prefere código antes da teoria", tipo: "preferencia_de_forma", escopo: { nivel: "materia", materia: "mat" } }),
			aprovada({ id: "h-5", enunciado: "Em c1, hipótese vencida há muito tempo", validade: "2020-01-01T00:00:00.000Z" }),
			hipotese({ id: "h-6", enunciado: "Em c1, só proposta ainda não aprovada" }),
		);
		ligar();
		const texto = (await executar({ materia: "mat", conceitos: ["c1"] })).content[0]!.text;
		expect(texto).toContain("Em c1, confunde o erro com acerto de confiança alta [misconception; escopo: conceito Nome de c1 (matéria mat); confiança media; válida até 2099-01-31]");
		expect(texto).toContain("Estuda melhor em blocos curtos [ritmo; escopo: global;");
		expect(texto).toContain("prefere código antes da teoria [preferencia_de_forma; escopo: matéria mat;");
		expect(texto).not.toContain("c2, só acerta");
		expect(texto).not.toContain("vencida");
		expect(texto).not.toContain("só proposta");
		const porNome = (await executar({ materia: "mat", conceitos: ["nome de c2"] })).content[0]!.text;
		expect(porNome).toContain("Em c2, só acerta com exemplo numérico");
		const global = (await executar()).content[0]!.text;
		expect(global).toContain("Estuda melhor em blocos curtos");
		expect(global).not.toContain("prefere código");
	});

	it("numa conversa de caderno usa a matéria da conversa; outra matéria é erro; matéria que não existe é erro", async () => {
		await cenario();
		await guardarHipoteses(aprovada({}));
		ligar();
		entradas = [{ type: "custom", customType: "nucleo.contexto", data: { chave: "materia:mat" } }];
		const daConversa = await executar({ conceitos: ["c1"] });
		expect(daConversa.content[0]!.text).toContain("confunde o erro");
		const outra = await executar({ materia: "outra" });
		expect(outra.isError).toBe(true);
		expect(outra.content[0]!.text).toMatch(/caderno "mat"/);
		entradas = [];
		const inexistente = await executar({ materia: "nao-existe" });
		expect(inexistente.isError).toBe(true);
		expect(inexistente.content[0]!.text).toMatch(/Não achei a matéria/);
	});

	it("arquivo ilegível: erro que manda ensinar normalmente", async () => {
		await escrever(join(dados, "aprendiz", "hipoteses.json"), "{ ruim");
		ligar();
		const resultado = await executar();
		expect(resultado.isError).toBe(true);
		expect(resultado.content[0]!.text).toMatch(/Ensine normalmente/);
	});
});

describe("a fila de gravação é do processo, não da instância da extensão", () => {
	it("naFilaDoProcesso: tarefas da mesma pasta rodam uma de cada vez, na ordem, mesmo se uma falhar; pastas diferentes não se esperam", async () => {
		const ordem: string[] = [];
		let soltar: () => void = () => undefined;
		const porta = new Promise<void>((resolver) => (soltar = resolver));
		const primeira = naFilaDoProcesso(dados, async () => {
			ordem.push("1 começa");
			await porta;
			ordem.push("1 termina");
			throw new Error("falhou");
		});
		const segunda = naFilaDoProcesso(`${dados}${"/"}.`, async () => {
			ordem.push("2");
			return "ok";
		});
		const outraPasta = await naFilaDoProcesso(cache, async () => "livre");
		expect(outraPasta).toBe("livre");
		await pausa(30);
		expect(ordem).toEqual(["1 começa"]);
		soltar();
		await expect(primeira).rejects.toThrow("falhou");
		expect(await segunda).toBe("ok");
		expect(ordem).toEqual(["1 começa", "1 termina", "2"]);
	});

	it("duas instâncias da extensão sobre a mesma pasta (duas sessões do pi) não perdem gravações uma da outra", async () => {
		await cenario();
		const nomes = ["a", "b", "c", "d", "e", "f"];
		await guardarHipoteses(
			...nomes.map((nome, indice) =>
				hipotese({ id: `h-${nome}`, enunciado: `Em c1, comete o erro número ${indice + 1} nas contas longas`, validade: new Date(Date.now() + 30 * 86_400_000).toISOString() }),
			),
		);
		// A segunda instância: outro barramento, outros tratadores, a mesma pasta de dados.
		const barramentoB = new EventEmitter();
		const tratadoresB: Record<string, (evento: unknown, contexto: Contexto) => void> = {};
		const mostradosB: Mostrado[] = [];
		barramentoB.on("interface:mostrar", (mensagem: Mostrado) => mostradosB.push(mensagem));
		const piB = {
			events: { on: (canal: string, ouvinte: (dados: unknown) => void) => barramentoB.on(canal, ouvinte), emit: (canal: string, dadosEvento: unknown) => barramentoB.emit(canal, dadosEvento) },
			on: (evento: string, tratador: (evento: unknown, contexto: Contexto) => void) => {
				tratadoresB[evento] = tratador;
			},
			registerTool: () => undefined,
		} as unknown as ExtensionAPI;
		ligar(); // a instância A
		montarAprendiz(piB, { pastaCache: cache, caminhoPrompt });
		tratadoresB.session_start?.({}, ctx);
		try {
			nomes.forEach((nome, indice) => {
				const alvo = indice % 2 === 0 ? barramento : barramentoB;
				alvo.emit("interface:acao", { painel: "aprendiz", acao: "editar", dados: { pedido: `e-${nome}`, id: `h-${nome}`, enunciado: `Em c1, comete o erro editado ${indice + 1} nas contas` } });
			});
			await esperar(() => recebidas("decidida").length + mostradosB.filter((mensagem) => mensagem.acao === "decidida").length === 6);
			const arquivo = await lerHipoteses(dados);
			expect(arquivo.hipoteses.map((item) => item.enunciado)).toEqual(nomes.map((_, indice) => `Em c1, comete o erro editado ${indice + 1} nas contas`));
			expect(arquivo.hipoteses.every((item) => item.versao === 2)).toBe(true);
		} finally {
			tratadoresB.session_shutdown?.({}, ctx);
		}
	});

	it("a reflexão de uma sessão que acabou enquanto esperava na fila não grava", async () => {
		await cenario();
		ligar();
		const espera = adiada();
		respostas.push(espera.resposta);
		pedir({ pedido: "r1" }, "aprendiz", "refletir");
		await esperar(() => espera.chegou());
		// a fila da pasta está ocupada por outra instância quando a reflexão tenta gravar
		let soltar: () => void = () => undefined;
		const porta = new Promise<void>((resolver) => (soltar = resolver));
		const ocupada = naFilaDoProcesso(dados, () => porta);
		espera.soltar(propostaCriar(["ev001", "ev003"]));
		await pausa(30);
		tratadores.session_shutdown?.({}, ctx);
		soltar();
		await ocupada;
		await pausa(60);
		expect((await lerHipoteses(dados)).ultimaReflexao).toBeUndefined();
		expect((await lerHipoteses(dados)).hipoteses).toEqual([]);
	});
});
