// Testes da extensão do mapa de conteúdo sem o pi: um "pi" falso com um
// barramento síncrono (como o pi.events), o pi.on e o registerTool, numa pasta
// de dados temporária com uma matéria e um .extraido de mentira. O modelo é um
// registro falso que devolve respostas prontas (ou espera, para testar a fila
// e o cancelamento). A tela é simulada mandando "interface:acao".

import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerEventos } from "../lib/eventos.ts";
import { caminhoDoMapa, type EstadoMapa, gravarMapa, lerMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "../lib/mapa.ts";
import { criarMateria, eventosMateria } from "../lib/materias.ts";
import mapa, { CAMINHO_PROMPT, CAMINHO_PROMPT_TEMA, estimarCusto, lerPromptMapeador, lerRespostaMapeador, lerRespostaTema, textoDoMapa } from "./mapa.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown };
type Pedido = { contexto: { systemPrompt?: string; messages: Array<{ role: string; content: unknown }> }; opcoes: { signal?: AbortSignal; temperature?: number } };
type Resposta = string | ((pedido: Pedido) => Promise<string>);
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] }; modelRegistry: unknown };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, unknown>; gravar?: boolean };

let dados = "";
let materia = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
let tratadores: Record<string, (evento: unknown, ctx: Contexto) => void>;
let mostrados: Mostrado[];
let entradas: Entrada[];
let ctx: Contexto;
let respostas: Resposta[];
let chamadas: Pedido[];
let credencial: boolean;
let caminhoPrompt = "";
let caminhoPromptTema = "";

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

/** Um "pi" falso no barramento do teste. */
function piFalso(registrar = true): ExtensionAPI {
	return {
		events: {
			on: (canal: string, ouvinte: (dados: unknown) => void) => {
				barramento.on(canal, ouvinte);
				return () => barramento.off(canal, ouvinte);
			},
			emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
		},
		on: (evento: string, tratador: (evento: unknown, ctx: Contexto) => void) => {
			if (registrar) tratadores[evento] = tratador;
		},
		registerTool: (definicao: Ferramenta & { name: string }) => {
			if (registrar) ferramentas[definicao.name] = definicao;
		},
	} as unknown as ExtensionAPI;
}

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-mapa-"));
	materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
	caminhoPrompt = join(dados, "mapeador.md");
	await writeFile(caminhoPrompt, "---\nmodel: teste/modelo-x\n---\nMapeie os conceitos.\n", "utf8");
	caminhoPromptTema = join(dados, "mapa-do-tema.md");
	await writeFile(caminhoPromptTema, "---\nmodel: teste/modelo-x\n---\nListe os conceitos do tema.\n", "utf8");
	entradas = [];
	respostas = [];
	chamadas = [];
	credencial = true;
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas }, modelRegistry: registro };
	barramento = new EventEmitter();
	ferramentas = {};
	tratadores = {};
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
	mapa(piFalso(), { caminhoPrompt, caminhoPromptTema });
	tratadores.session_start?.({}, ctx);
});

afterEach(async () => {
	tratadores.session_shutdown?.({}, ctx);
	await rm(dados, { recursive: true, force: true });
});

/** Espera até `condicao` valer (os tratadores são assíncronos). */
async function esperar(condicao: () => boolean | Promise<boolean>): Promise<void> {
	for (let tentativa = 0; tentativa < 400; tentativa++) {
		if (await condicao()) return;
		await new Promise((resolver) => setTimeout(resolver, 5));
	}
	throw new Error("não aconteceu");
}

/** Um .extraido de mentira: o manifesto e um .md por trecho. */
async function extrair(arquivo: string, trechos: Array<[local: string, nome: string, texto: string]>, hash = `h-${arquivo}`): Promise<void> {
	const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
	await mkdir(pasta, { recursive: true });
	for (const [local, nome, texto] of trechos) await writeFile(join(pasta, `${nome}.md`), `---\narquivo: ${arquivo}\nlocal: ${local}\norigem: texto\n---\n\n${texto}\n`, "utf8");
	const manifesto = { versao: 1, arquivo, hash, tamanho: 1, tipo: "pdf", extraidoEm: "2026-10-21T00:00:00.000Z", custo: 0, avisos: [], trechos: trechos.map(([local, nome]) => ({ local, nome, origem: "texto" })) };
	await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");
}

const aula = () =>
	extrair("aula.pdf", [
		["página 1", "pagina-001", "Regressão linear: ajuste de uma reta aos dados."],
		["página 2", "pagina-002", "Erro quadrático médio: a média dos quadrados dos resíduos."],
	]);

const json = (conceitos: Array<{ id?: string | null; nome: string; descricao?: string; locais: string[] }>) =>
	JSON.stringify({ conceitos: conceitos.map((conceito) => ({ id: null, descricao: "", ...conceito })) });

const RESPOSTA_AULA = json([
	{ nome: "Regressão linear", descricao: "Ajuste de uma reta.", locais: ["página 1"] },
	{ nome: "Erro quadrático médio", descricao: "Média dos quadrados.", locais: ["página 2", "página 9"] },
]);

const pronto = (arquivo: string) =>
	barramento.emit("materiais:pronto", { caminho: `materias/${materia}/materiais/${arquivo}`, pasta: `materias/${materia}/materiais`, nome: arquivo, tipo: "pdf", trechos: 2, custo: 0, novo: true });
const removido = (arquivo: string) => barramento.emit("materiais:removido", { caminho: `materias/${materia}/materiais/${arquivo}`, pasta: `materias/${materia}/materiais`, nome: arquivo });
const acao = (acao: string, dadosAcao: Record<string, unknown> = {}) => barramento.emit("interface:acao", { painel: "mapa", acao, dados: { materia, ...dadosAcao } });
const recebidas = (nome: string) => mostrados.filter((mensagem) => mensagem.acao === nome);
const estados = () => recebidas("mapa").map((mensagem) => mensagem.dados as unknown as EstadoMapa);
const ultimoEstado = () => estados().at(-1);
const eventos = async () => (await lerEventos(eventosMateria(dados, materia))).eventos;
const doVerbo = async (verbo: string) => (await eventos()).filter((evento) => evento.verbo === verbo);
const mapeou = async (quantos = 1) => (await doVerbo("mapeou_material")).length >= quantos;
/** O fim de um trabalho: nada em andamento nem na fila. */
const parado = () => {
	const estado = ultimoEstado();
	return estado !== undefined && estado.andamento === null && estado.fila.length === 0;
};

/** Uma resposta que só sai quando o teste mandar (ou falha quando a chamada é abortada). */
function adiada(): { resposta: Resposta; soltar(texto: string): void } {
	let soltar: (texto: string) => void = () => undefined;
	const resposta: Resposta = (pedido) =>
		new Promise<string>((resolver, rejeitar) => {
			soltar = resolver;
			pedido.opcoes.signal?.addEventListener("abort", () => rejeitar(new Error("abortado")));
		});
	return { resposta, soltar: (texto) => soltar(texto) };
}

const conceitoBase = { descricao: "", prioridade: "normal" as const, origem: "material" as const, criadoEm: "2026-10-20T00:00:00.000Z" };

describe("prompt e resposta", () => {
	it("o mapeador.md do perfil diz o modelo e tem o prompt", async () => {
		const prompt = lerPromptMapeador(await readFile(CAMINHO_PROMPT, "utf8"));
		expect(prompt.modelo).toBe("openrouter/anthropic/claude-sonnet-5.5");
		expect(prompt.instrucoes).toContain('"conceitos"');
		expect(() => lerPromptMapeador("sem frontmatter")).toThrow(/model/);
	});

	it("lê o JSON com ```json em volta e recusa o que está fora do formato", () => {
		expect(lerRespostaMapeador('```json\n{"conceitos": [{"id": null, "nome": "A", "descricao": "d", "locais": ["p1"]}]}\n```').conceitos).toEqual([
			{ id: null, nome: "A", descricao: "d", locais: ["p1"] },
		]);
		expect(lerRespostaMapeador('Aqui está: {"conceitos": [{"nome": "A", "locais": []}]} pronto').conceitos[0]).toEqual({ id: null, nome: "A", descricao: "", locais: [] });
		expect(() => lerRespostaMapeador("nada")).toThrow();
		expect(() => lerRespostaMapeador('{"itens": []}')).toThrow(/conceitos/);
		expect(() => lerRespostaMapeador('{"conceitos": [{"nome": "A", "locais": "p1"}]}')).toThrow(/locais/);
	});

	it("estima o custo pelo preço do modelo, e null sem preço", () => {
		expect(estimarCusto(MODELO, { caracteres: 4000, partes: 1 }, { mapa: 0, prompt: 0 })).toBeCloseTo((1000 * 3 + 2000 * 15) / 1_000_000);
		expect(estimarCusto({ cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, { caracteres: 4000, partes: 1 }, { mapa: 0, prompt: 0 })).toBeNull();
		expect(estimarCusto(undefined, { caracteres: 1, partes: 1 }, { mapa: 0, prompt: 0 })).toBeNull();
	});
});

describe("mapeamento", () => {
	it("materiais:pronto mapeia o arquivo pendente: mapa gravado, mapeou_material e o estado", async () => {
		await aula();
		respostas.push(RESPOSTA_AULA);
		pronto("aula.pdf");
		await esperar(mapeou);
		await esperar(parado);
		const gravado = await lerMapa(dados, materia);
		expect(gravado.conceitos.map((conceito) => [conceito.nome, conceito.referencias.map((referencia) => referencia.local)])).toEqual([
			["Regressão linear", ["página 1"]],
			["Erro quadrático médio", ["página 2"]],
		]);
		expect(gravado.conceitos[0]!.referencias[0]).toEqual({ arquivo: "aula.pdf", local: "página 1", trecho: "pagina-001" });
		expect(gravado.arquivos["aula.pdf"]).toMatchObject({ hash: "h-aula.pdf", modelo: "teste/modelo-x", custo: 0.01, conceitos: 2 });
		const [evento] = await doVerbo("mapeou_material");
		expect(evento).toMatchObject({ sessao: "sessao-1", objeto: { materia, arquivo: "aula.pdf" }, resultado: { novos: 2, reforcados: 0, descartados: 0, partes: 1, custo: 0.01 }, contexto: { modelo: "teste/modelo-x" } });
		// A chamada: temperatura 0, com sinal, o prompt do arquivo e os trechos com o local.
		expect(chamadas).toHaveLength(1);
		expect(chamadas[0]!.opcoes.temperature).toBe(0);
		expect(chamadas[0]!.opcoes.signal).toBeInstanceOf(AbortSignal);
		expect(chamadas[0]!.contexto.systemPrompt).toBe("Mapeie os conceitos.");
		expect(JSON.stringify(chamadas[0]!.contexto.messages[0])).toContain('local=\\"página 2\\"');
		// O estado: andamento durante, e no fim nada pendente, tudo passageiro.
		expect(estados().some((estado) => estado.andamento?.arquivo === "aula.pdf" && estado.andamento.parte === 1 && estado.andamento.partes === 1)).toBe(true);
		expect(ultimoEstado()).toMatchObject({ materia, pendentes: [], andamento: null, fila: [] });
		expect(ultimoEstado()!.mapa.conceitos).toHaveLength(2);
		expect(mostrados.every((mensagem) => mensagem.painel === "mapa" && mensagem.gravar === false)).toBe(true);
	});

	it("um arquivo já mapeado com o mesmo hash não entra na fila", async () => {
		await aula();
		respostas.push(RESPOSTA_AULA);
		pronto("aula.pdf");
		await esperar(mapeou);
		await esperar(parado);
		const antes = mostrados.length;
		pronto("aula.pdf");
		await esperar(() => mostrados.length > antes);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(chamadas).toHaveLength(1);
	});

	it("um arquivo grande vai em duas partes, e a segunda vê o mapa fundido", async () => {
		const grande = "x".repeat(70_000);
		await extrair("livro.pdf", [
			["página 1", "pagina-001", `Limite. ${grande}`],
			["página 2", "pagina-002", `Derivada. ${grande}`],
		]);
		respostas.push(json([{ nome: "Limite", locais: ["página 1"] }]), (pedido) => {
			const texto = JSON.stringify(pedido.contexto.messages[0]);
			const id = /\\"id\\":\\"(c-[^\\]+)\\"/.exec(texto)?.[1];
			return Promise.resolve(json([{ id, nome: "Limite", locais: ["página 2"] }, { nome: "Derivada", locais: ["página 2"] }]));
		});
		acao("mapear");
		await esperar(mapeou);
		await esperar(parado);
		expect(chamadas).toHaveLength(2);
		expect(JSON.stringify(chamadas[1]!.contexto.messages[0])).toContain("parte 2 de 2");
		const gravado = await lerMapa(dados, materia);
		expect(gravado.conceitos.map((conceito) => [conceito.nome, conceito.referencias.map((referencia) => referencia.local)])).toEqual([
			["Limite", ["página 1", "página 2"]],
			["Derivada", ["página 2"]],
		]);
		expect((await doVerbo("mapeou_material"))[0]!.resultado).toMatchObject({ novos: 2, reforcados: 0, partes: 2, custo: 0.02 });
		expect(estados().some((estado) => estado.andamento?.parte === 2 && estado.andamento.partes === 2)).toBe(true);
	});

	it("JSON inválido: tenta de novo dizendo o erro", async () => {
		await aula();
		respostas.push("não sei fazer JSON", `\`\`\`json\n${RESPOSTA_AULA}\n\`\`\``);
		pronto("aula.pdf");
		await esperar(mapeou);
		expect(chamadas).toHaveLength(2);
		const segunda = chamadas[1]!.contexto.messages;
		expect(segunda.map((mensagem) => mensagem.role)).toEqual(["user", "assistant", "user"]);
		expect(JSON.stringify(segunda[2])).toContain("não veio no formato");
		expect((await lerMapa(dados, materia)).arquivos["aula.pdf"]!.custo).toBe(0.02);
	});

	it("JSON inválido duas vezes: erro para a tela e o arquivo fica pendente", async () => {
		await aula();
		respostas.push("{quebrado", '{"outra": 1}');
		pronto("aula.pdf");
		await esperar(() => recebidas("erro").length > 0);
		await esperar(parado);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "mapear", materia, arquivo: "aula.pdf" });
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("segunda tentativa");
		expect(ultimoEstado()!.pendentes.map((pendente) => pendente.arquivo)).toEqual(["aula.pdf"]);
		expect((await lerMapa(dados, materia)).arquivos).toEqual({});
		expect(await doVerbo("mapeou_material")).toHaveLength(0);
	});

	it("sem credencial: erro claro e nada gravado", async () => {
		await aula();
		credencial = false;
		pronto("aula.pdf");
		await esperar(() => recebidas("erro").length > 0);
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("credencial");
		expect(chamadas).toHaveLength(0);
		await expect(readFile(caminhoDoMapa(dados, materia), "utf8")).rejects.toThrow();
	});

	it("cancelar aborta a chamada, esvazia a fila e deixa os arquivos pendentes", async () => {
		await aula();
		await extrair("lista.pdf", [["página 1", "pagina-001", "Exercícios de regressão."]]);
		const espera = adiada();
		respostas.push(espera.resposta, RESPOSTA_AULA);
		acao("mapear");
		await esperar(() => chamadas.length === 1);
		expect(ultimoEstado()!.fila).toEqual(["lista.pdf"]);
		acao("cancelar");
		await esperar(parado);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(chamadas).toHaveLength(1);
		expect(chamadas[0]!.opcoes.signal!.aborted).toBe(true);
		expect(recebidas("erro")).toHaveLength(0);
		expect(ultimoEstado()!.pendentes.map((pendente) => pendente.arquivo)).toEqual(["aula.pdf", "lista.pdf"]);
		expect(await doVerbo("mapeou_material")).toHaveLength(0);
	});

	it("uma operação durante o mapeamento não espera o modelo, e a fusão seguinte vê a operação", async () => {
		const existente: MapaConteudo = {
			...mapaVazio(),
			conceitos: [{ ...conceitoBase, id: "c-000000000001-aaaa", nome: "Regressão linear", referencias: [{ arquivo: "outro.pdf", local: "página 5", trecho: "pagina-005" }] }],
		};
		await gravarMapa(dados, materia, existente);
		await aula();
		const espera = adiada();
		respostas.push(espera.resposta);
		pronto("aula.pdf");
		await esperar(() => chamadas.length === 1);
		acao("operar", { edicao: "e1", pedido: "p1", operacoes: [{ tipo: "tirar", id: "c-000000000001-aaaa" }, { tipo: "editar", id: "c-000000000001-aaaa", nome: "Regressão" }] });
		await esperar(() => estados().some((estado) => estado.pedido === "p1"));
		expect(estados().find((estado) => estado.pedido === "p1")!.mapa.conceitos[0]).toMatchObject({ nome: "Regressão", fora: true });
		expect(ultimoEstado()!.andamento).toMatchObject({ arquivo: "aula.pdf", parte: 1 });
		espera.soltar(json([{ id: "c-000000000001-aaaa", nome: "Regressão linear", locais: ["página 1"] }, { nome: "Erro quadrático médio", locais: ["página 2"] }]));
		await esperar(mapeou);
		const gravado = await lerMapa(dados, materia);
		expect(gravado.conceitos[0]).toMatchObject({ id: "c-000000000001-aaaa", nome: "Regressão", fora: true });
		expect(gravado.conceitos[0]!.referencias.map((referencia) => referencia.arquivo)).toEqual(["outro.pdf", "aula.pdf"]);
		expect(gravado.conceitos.map((conceito) => conceito.nome)).toEqual(["Regressão", "Erro quadrático médio"]);
		expect((await doVerbo("mapeou_material"))[0]!.resultado).toMatchObject({ novos: 1, reforcados: 1 });
	});

	it("refazer mapeia de novo todos os arquivos com manifesto, um por vez", async () => {
		await aula();
		respostas.push(RESPOSTA_AULA);
		pronto("aula.pdf");
		await esperar(mapeou);
		await esperar(parado);
		respostas.push(RESPOSTA_AULA);
		acao("refazer");
		await esperar(() => mapeou(2));
		const gravado = await lerMapa(dados, materia);
		expect(gravado.conceitos).toHaveLength(2);
		expect(gravado.conceitos[0]!.referencias).toHaveLength(1);
		expect(chamadas).toHaveLength(2);
		expect(JSON.stringify(chamadas[1]!.contexto.messages[0])).toContain(gravado.conceitos[0]!.id);
	});
});

describe("revisão", () => {
	const comConceito = () =>
		gravarMapa(dados, materia, { ...mapaVazio(), conceitos: [{ ...conceitoBase, id: "c-000000000001-aaaa", nome: "Limite", referencias: [{ arquivo: "a.pdf", local: "p1", trecho: "t1" }] }] });

	it("abrir manda o estado com os pendentes e o custo estimado", async () => {
		await aula();
		acao("abrir");
		await esperar(() => estados().length > 0);
		expect(ultimoEstado()).toMatchObject({ materia, andamento: null, fila: [], mapa: { situacao: "rascunho", conceitos: [] } });
		const [pendente] = ultimoEstado()!.pendentes;
		expect(pendente).toMatchObject({ arquivo: "aula.pdf", tipo: "pdf", partes: 1 });
		expect(pendente!.caracteres).toBeGreaterThan(0);
		expect(pendente!.custoEstimado).toBeGreaterThan(0);
	});

	it("revisou_mapa só no primeiro lote que mudou algo de cada edicao", async () => {
		await comConceito();
		acao("operar", { edicao: "e1", pedido: "p1", operacoes: [{ tipo: "prioridade", id: "c-000000000001-aaaa", valor: "alta" }] });
		await esperar(() => estados().some((estado) => estado.pedido === "p1"));
		acao("operar", { edicao: "e1", pedido: "p2", operacoes: [{ tipo: "tirar", id: "c-000000000001-aaaa" }] });
		await esperar(() => estados().some((estado) => estado.pedido === "p2"));
		acao("operar", { edicao: "e2", pedido: "p3", operacoes: [{ tipo: "tirar", id: "c-000000000001-aaaa" }] });
		await esperar(() => estados().some((estado) => estado.pedido === "p3"));
		acao("operar", { edicao: "e2", pedido: "p4", operacoes: [{ tipo: "trazer", id: "c-000000000001-aaaa" }] });
		await esperar(() => estados().some((estado) => estado.pedido === "p4"));
		const revisoes = await doVerbo("revisou_mapa");
		expect(revisoes.map((evento) => evento.resultado)).toEqual([
			{ edicao: "e1", tipo: "prioridade" },
			{ edicao: "e2", tipo: "trazer" },
		]);
		expect((await lerMapa(dados, materia)).conceitos[0]).toMatchObject({ prioridade: "alta" });
		expect((await lerMapa(dados, materia)).conceitos[0]!.fora).toBeUndefined();
	});

	it("aprovar: erro sem conceito dentro; com conceito, aprovado e aprovou_mapa", async () => {
		acao("aprovar", { pedido: "p1" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "aprovar", materia, pedido: "p1" });
		await comConceito();
		acao("aprovar", { pedido: "p2" });
		await esperar(() => estados().some((estado) => estado.pedido === "p2"));
		expect(estados().find((estado) => estado.pedido === "p2")!.mapa.situacao).toBe("aprovado");
		expect((await lerMapa(dados, materia)).situacao).toBe("aprovado");
		expect((await doVerbo("aprovou_mapa"))[0]!.resultado).toEqual({ conceitos: 1, fora: 0 });
	});

	it("matéria que não existe vira erro, sem criar pasta", async () => {
		barramento.emit("interface:acao", { painel: "mapa", acao: "abrir", dados: { materia: "nao-existe" } });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "abrir", materia: "nao-existe" });
	});
});

describe("materiais:removido", () => {
	it("tira as referências e o arquivo do mapa e grava atualizou_mapa; um arquivo fora do mapa não grava nada", async () => {
		await gravarMapa(dados, materia, {
			...mapaVazio(),
			situacao: "aprovado",
			aprovadoEm: "2026-10-21T00:00:00.000Z",
			conceitos: [{ ...conceitoBase, id: "c-000000000001-aaaa", nome: "Limite", referencias: [{ arquivo: "aula.pdf", local: "p1", trecho: "t1" }] }],
			arquivos: { "aula.pdf": { hash: "h", mapeadoEm: "2026-10-21T00:00:00.000Z", modelo: "teste/modelo-x", custo: 0.01, conceitos: 1 } },
		});
		removido("aula.pdf");
		await esperar(async () => (await doVerbo("atualizou_mapa")).length > 0);
		const gravado = await lerMapa(dados, materia);
		expect(gravado).toMatchObject({ situacao: "alterado", arquivos: {} });
		expect(gravado.conceitos[0]!.referencias).toEqual([]);
		expect((await doVerbo("atualizou_mapa"))[0]).toMatchObject({ objeto: { materia, arquivo: "aula.pdf" }, resultado: { motivo: "material_removido", semFonte: 1 } });
		const antes = estados().length;
		removido("outro.pdf");
		await esperar(() => estados().length > antes);
		expect(await doVerbo("atualizou_mapa")).toHaveLength(1);
	});
});

describe("ciclo de vida", () => {
	it("uma cópia sem session_start no mesmo barramento fica calada e não mapeia", async () => {
		mapa(piFalso(false), { caminhoPrompt, caminhoPromptTema });
		await aula();
		respostas.push(RESPOSTA_AULA);
		pronto("aula.pdf");
		await esperar(mapeou);
		await esperar(parado);
		acao("abrir");
		await esperar(() => estados().length > 0);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(chamadas).toHaveLength(1);
		expect(await doVerbo("mapeou_material")).toHaveLength(1);
		const depois = mostrados.length;
		acao("abrir");
		await esperar(() => mostrados.length > depois);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados.length).toBe(depois + 1);
	});

	it("session_shutdown aborta o mapeamento em andamento", async () => {
		await aula();
		const espera = adiada();
		respostas.push(espera.resposta);
		pronto("aula.pdf");
		await esperar(() => chamadas.length === 1);
		tratadores.session_shutdown?.({}, ctx);
		await esperar(() => chamadas[0]!.opcoes.signal!.aborted);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(await doVerbo("mapeou_material")).toHaveLength(0);
		expect(recebidas("erro")).toHaveLength(0);
	});
});

describe("mapa a partir do tema", () => {
	const RESPOSTA_TEMA = JSON.stringify({
		conceitos: [
			{ nome: "Espaço amostral", descricao: "O conjunto dos resultados possíveis." },
			{ nome: "LIMITE", descricao: "Repetido do mapa: não entra." },
			{ nome: "Probabilidade condicional", descricao: "A probabilidade dado um evento." },
		],
	});
	const aprovadoComLimite = () =>
		gravarMapa(dados, materia, {
			...mapaVazio(),
			situacao: "aprovado",
			aprovadoEm: "2026-10-21T00:00:00.000Z",
			conceitos: [{ ...conceitoBase, id: "c-000000000001-aaaa", nome: "Límite", referencias: [{ arquivo: "a.pdf", local: "p1", trecho: "t1" }] }],
		});
	const doTema = (pedido: string, extra: Record<string, unknown> = {}) => acao("do_tema", { pedido, tema: "Probabilidade básica", tipo: "teorico", motivo: "  Passar na P1. ", ...extra });
	const comPedido = (pedido: string) => estados().find((estado) => estado.pedido === pedido);

	it("o mapa-do-tema.md do perfil diz o modelo, e a resposta é lida como {conceitos: [{nome, descricao}]}", async () => {
		const prompt = lerPromptMapeador(await readFile(CAMINHO_PROMPT_TEMA, "utf8"), CAMINHO_PROMPT_TEMA);
		expect(prompt.modelo).toBe("openrouter/anthropic/claude-sonnet-5.5");
		expect(prompt.instrucoes).toContain('"conceitos"');
		expect(lerRespostaTema('```json\n{"conceitos": [{"nome": "A"}]}\n```').conceitos).toEqual([{ nome: "A", descricao: "" }]);
		expect(() => lerRespostaTema('{"conceitos": [{"descricao": "sem nome"}]}')).toThrow(/nome/);
	});

	it("do_tema: estado com montandoTema, fusão no fim do mapa, evento e o estado com o pedido", async () => {
		await aprovadoComLimite();
		const espera = adiada();
		respostas.push(espera.resposta);
		doTema("p1");
		await esperar(() => chamadas.length === 1);
		expect(ultimoEstado()).toMatchObject({ materia, montandoTema: true });
		expect(ultimoEstado()!.pedido).toBeUndefined();
		const mensagem = JSON.stringify(chamadas[0]!.contexto.messages[0]);
		expect(chamadas[0]!.contexto.systemPrompt).toBe("Liste os conceitos do tema.");
		expect(chamadas[0]!.opcoes.temperature).toBe(0);
		expect(mensagem).toContain("Tema do curso: Probabilidade básica");
		expect(mensagem).toContain("teórico");
		expect(mensagem).toContain("Motivo do aluno: Passar na P1.");
		expect(mensagem).toContain("- Límite");
		espera.soltar(RESPOSTA_TEMA);
		await esperar(() => comPedido("p1") !== undefined);
		const final = comPedido("p1")!;
		expect(final.montandoTema).toBeUndefined();
		const gravado = await lerMapa(dados, materia);
		expect(gravado.situacao).toBe("alterado");
		expect(gravado.conceitos.map((conceito) => conceito.nome)).toEqual(["Límite", "Espaço amostral", "Probabilidade condicional"]);
		expect(gravado.conceitos[1]).toMatchObject({ origem: "tema", referencias: [], prioridade: "normal", novo: true, descricao: "O conjunto dos resultados possíveis." });
		expect(final.mapa).toEqual(gravado);
		const [evento] = await doVerbo("montou_mapa_do_tema");
		expect(evento).toMatchObject({ sessao: "sessao-1", objeto: { materia }, resultado: { novos: 2, custo: 0.01, tema: "Probabilidade básica" }, contexto: { modelo: "teste/modelo-x" } });
		expect(recebidas("erro")).toHaveLength(0);
		expect(mostrados.every((recebida) => recebida.gravar === false)).toBe(true);
	});

	it("um do_tema com outro em andamento na mesma matéria dá erro", async () => {
		const espera = adiada();
		respostas.push(espera.resposta);
		doTema("p1");
		await esperar(() => chamadas.length === 1);
		doTema("p2");
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "do_tema", materia, pedido: "p2" });
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("já está sendo montado");
		espera.soltar(RESPOSTA_TEMA);
		await esperar(() => comPedido("p1") !== undefined);
		expect(chamadas).toHaveLength(1);
		expect((await lerMapa(dados, materia)).conceitos).toHaveLength(3);
	});

	it("JSON inválido: tenta de novo; inválido duas vezes, erro e o mapa fica como estava", async () => {
		respostas.push("não sei", RESPOSTA_TEMA);
		doTema("p1");
		await esperar(() => comPedido("p1") !== undefined);
		expect(chamadas).toHaveLength(2);
		expect(JSON.stringify(chamadas[1]!.contexto.messages[2])).toContain("não veio no formato");
		expect((await doVerbo("montou_mapa_do_tema"))[0]!.resultado).toMatchObject({ novos: 3, custo: 0.02 });

		respostas.push("{quebrado", '{"outra": 1}');
		doTema("p2", { tema: "Outro tema" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "do_tema", materia, pedido: "p2" });
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("segunda tentativa");
		await esperar(() => ultimoEstado()?.montandoTema === undefined);
		expect((await lerMapa(dados, materia)).conceitos).toHaveLength(3);
		expect(await doVerbo("montou_mapa_do_tema")).toHaveLength(1);
	});

	it("sem credencial ou sem tema: erro claro, sem chamada", async () => {
		credencial = false;
		doTema("p1");
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "do_tema", pedido: "p1" });
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("credencial");
		await esperar(() => ultimoEstado()?.montandoTema === undefined);
		doTema("p2", { tema: "  " });
		await esperar(() => recebidas("erro").length > 1);
		expect(String(recebidas("erro")[1]!.dados.mensagem)).toContain("tema");
		expect(chamadas).toHaveLength(0);
		await expect(readFile(caminhoDoMapa(dados, materia), "utf8")).rejects.toThrow();
	});

	it("cancelar aborta o do_tema: nada gravado, sem erro, e o estado com o pedido sem montandoTema", async () => {
		const espera = adiada();
		respostas.push(espera.resposta);
		doTema("p1");
		await esperar(() => chamadas.length === 1);
		acao("cancelar");
		await esperar(() => comPedido("p1") !== undefined);
		expect(chamadas[0]!.opcoes.signal!.aborted).toBe(true);
		expect(comPedido("p1")!.montandoTema).toBeUndefined();
		expect(ultimoEstado()!.montandoTema).toBeUndefined();
		expect(recebidas("erro")).toHaveLength(0);
		expect(await doVerbo("montou_mapa_do_tema")).toHaveLength(0);
		await expect(readFile(caminhoDoMapa(dados, materia), "utf8")).rejects.toThrow();
		// Depois de cancelar, um novo do_tema pode começar.
		respostas.push(RESPOSTA_TEMA);
		doTema("p2");
		await esperar(() => comPedido("p2") !== undefined);
		expect((await lerMapa(dados, materia)).conceitos).toHaveLength(3);
	});
});

describe("ler_mapa_conteudo", () => {
	const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });
	const mapaDeTeste: MapaConteudo = {
		...mapaVazio(),
		situacao: "alterado",
		aprovadoEm: "2026-10-21T00:00:00.000Z",
		conceitos: [
			{ ...conceitoBase, id: "c-1", nome: "Regressão linear", descricao: "Ajuste de uma reta.", prioridade: "alta", referencias: [{ arquivo: "aula-04.pdf", local: "página 12", trecho: "a" }, { arquivo: "aula-04.pdf", local: "página 13", trecho: "b" }] },
			{ ...conceitoBase, id: "c-2", nome: "Erro quadrático médio", referencias: [], novo: true },
			{ ...conceitoBase, id: "c-3", nome: "Agenda", referencias: [{ arquivo: "aula-04.pdf", local: "página 1", trecho: "c" }], fora: true },
		],
	};

	it("o texto: situação, os de dentro numerados e os de fora à parte", () => {
		const texto = textoDoMapa("calculo-i", mapaDeTeste, { incluirFora: true });
		expect(texto).toContain("alterado depois da aprovação de 2026-10-21");
		expect(texto).toContain("01. Regressão linear [alta] — Ajuste de uma reta. (aula-04.pdf: página 12, página 13)");
		expect(texto).toContain("02. Erro quadrático médio [novo] (sem fonte)");
		expect(texto).toContain("Fora do mapa (o usuário tirou):\n- Agenda (aula-04.pdf: página 1)");
		expect(textoDoMapa("calculo-i", mapaDeTeste)).not.toContain("Agenda");
	});

	it("na conversa geral pede a matéria; na do caderno fica nela", async () => {
		await gravarMapa(dados, materia, mapaDeTeste);
		const semMateria = await ferramentas.ler_mapa_conteudo!.execute("1", {}, undefined, undefined, ctx);
		expect(semMateria.isError).toBe(true);
		const comMateria = await ferramentas.ler_mapa_conteudo!.execute("2", { materia }, undefined, undefined, ctx);
		expect(comMateria.content[0]!.text).toContain("01. Regressão linear");
		entradas = [contextoDe(`materia:${materia}`)];
		const doCaderno = await ferramentas.ler_mapa_conteudo!.execute("3", { incluirFora: true }, undefined, undefined, ctx);
		expect(doCaderno.content[0]!.text).toContain("- Agenda");
		const outra = await ferramentas.ler_mapa_conteudo!.execute("4", { materia: "fisica" }, undefined, undefined, ctx);
		expect(outra.isError).toBe(true);
	});
});
