// Testes da extensão dos cursos sem o pi: um "pi" falso com um barramento
// síncrono (como o pi.events), o pi.on e o registerTool, numa pasta de dados
// temporária com uma matéria, um .extraido de mentira e um mapa gravado à mão.
// A tela é simulada mandando "interface:acao".

import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Curso, MensagemCurso, MensagemListaCursos } from "../lib/curso-tipos.ts";
import { confirmarNoDisco, gravarCurso, hojeLocal, lerCurso, pastaDoCurso } from "../lib/cursos.ts";
import type { Diagnostico } from "../lib/diagnostico.ts";
import { arquivoEscrita, salvarRegra } from "../lib/escrita.ts";
import { somarDias } from "../lib/esqueleto.ts";
import { lerEventos } from "../lib/eventos.ts";
import { gravarMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "../lib/mapa.ts";
import { criarMateria, eventosAprendiz, eventosMateria } from "../lib/materias.ts";
import cursos, { CAMINHO_PROMPT_CORRETOR, CAMINHO_PROMPT_DIAGNOSTICO, CAMINHO_PROMPT_ESQUELETO, hashDoPrompt, linhaDoPrazo, pedidoDoLimite, textoDoCurso } from "./cursos.ts";
import { lerPromptMapeador } from "./mapa.ts";

/** Os prompts de mentira, na pasta de dados do teste (com o nome dos de verdade), e a metodologia de mentira em metodo/. */
const opcoesDeTeste = () => ({
	caminhoPromptDiagnostico: join(dados, "diagnostico.md"),
	caminhoPromptCorretor: join(dados, "corretor.md"),
	caminhoPromptEsqueleto: join(dados, "esqueleto.md"),
	pastaMetodo: join(dados, "metodo"),
});

/** Os arquivos da metodologia de mentira. */
const METODO: Record<string, string> = { "quiz.md": "Como escrever o quiz.\n", "dissertativa.md": "Como escrever a dissertativa.\n" };
/** O system prompt com a metodologia de mentira, como instrucoesComMetodo o monta. */
const comMetodo = (instrucoes: string, arquivos: string[]) =>
	[instrucoes, ...arquivos.map((arquivo) => `<metodologia arquivo="${arquivo}">\n${METODO[arquivo]!.trim()}\n</metodologia>`)].join("\n\n");

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] }; modelRegistry: unknown };
type Pedido = { contexto: { systemPrompt?: string; messages: Array<{ role: string; content: unknown }> }; opcoes: { signal?: AbortSignal; temperature?: number } };
type Resposta = string | ((pedido: Pedido) => Promise<string>);
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

const MODELO = { provider: "teste", id: "modelo-x", cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 } };

/** Um registro de modelos falso: cada chamada leva a próxima resposta pronta. */
const registro = {
	find: (provedor: string, id: string) => (provedor === "teste" && id === "modelo-x" ? MODELO : undefined),
	hasConfiguredAuth: () => true,
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
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-cursos-"));
	materia = (await criarMateria(dados, { nome: "Estatística" })).id;
	entradas = [];
	respostas = [];
	chamadas = [];
	await writeFile(join(dados, "diagnostico.md"), "---\nmodel: teste/modelo-x\n---\nGere as questões.\n", "utf8");
	await writeFile(join(dados, "corretor.md"), "---\nmodel: teste/modelo-x\n---\nCorrija pela rubrica.\n", "utf8");
	await writeFile(join(dados, "esqueleto.md"), "---\nmodel: teste/modelo-x\n---\nMonte os módulos.\n", "utf8");
	await mkdir(join(dados, "metodo"), { recursive: true });
	for (const [arquivo, conteudo] of Object.entries(METODO)) await writeFile(join(dados, "metodo", arquivo), conteudo, "utf8");
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas }, modelRegistry: registro };
	barramento = new EventEmitter();
	ferramentas = {};
	tratadores = {};
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
	cursos(piFalso(), opcoesDeTeste());
	tratadores.session_start?.({}, ctx);
});

afterEach(async () => {
	tratadores.session_shutdown?.({}, ctx);
	await rm(dados, { recursive: true, force: true });
});

/**
 * Espera até `condicao` valer (os tratadores são assíncronos). Desiste em 2 s
 * pelo relógio (e não por número de voltas: no Windows o setTimeout de 5 ms
 * pode levar 15), antes do tempo limite de 5 s do teste, e diz os erros que a
 * extensão mandou, para a falha mostrar a causa.
 */
async function esperar(condicao: () => boolean | Promise<boolean>): Promise<void> {
	const limite = Date.now() + 2000;
	while (Date.now() < limite) {
		if (await condicao()) return;
		await new Promise((resolver) => setTimeout(resolver, 5));
	}
	if (await condicao()) return;
	throw new Error(`não aconteceu; erros mandados: ${JSON.stringify(mostrados.filter((mensagem) => mensagem.acao === "erro").map((mensagem) => mensagem.dados))}`);
}

/** Um .extraido de mentira: só o manifesto (os cursos leem o arquivo e o hash). */
async function extrair(arquivo: string, hash = `h-${arquivo}`): Promise<void> {
	const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
	await mkdir(pasta, { recursive: true });
	const manifesto = { versao: 1, arquivo, hash, tamanho: 1, tipo: "pdf", extraidoEm: "2026-10-21T00:00:00.000Z", custo: 0, avisos: [], trechos: [{ local: "página 1", nome: "pagina-001", origem: "texto" }] };
	await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");
	await writeFile(join(pasta, "pagina-001.md"), `---\narquivo: ${arquivo}\nlocal: página 1\norigem: texto\n---\n\nTexto.\n`, "utf8");
}

const conceitoBase = { descricao: "", prioridade: "normal" as const, origem: "material" as const, criadoEm: "2026-10-20T00:00:00.000Z", referencias: [] };
const mapaDeTeste = (situacao: MapaConteudo["situacao"]): MapaConteudo => ({
	...mapaVazio(),
	situacao,
	...(situacao === "rascunho" ? {} : { aprovadoEm: "2026-10-21T00:00:00.000Z" }),
	conceitos: [
		{ ...conceitoBase, id: "c-1", nome: "Espaço amostral", descricao: "Os resultados possíveis." },
		{ ...conceitoBase, id: "c-2", nome: "Agenda", fora: true },
		{ ...conceitoBase, id: "c-3", nome: "Probabilidade condicional" },
	],
});

const BASICO = { nome: "P1: probabilidade", prazo: "2099-11-20", prova: "P1", horasPorSemana: 4 };

const acao = (nome: string, dadosAcao: Record<string, unknown> = {}) => barramento.emit("interface:acao", { painel: "cursos", acao: nome, dados: { materia, ...dadosAcao } });
const recebidas = (nome: string) => mostrados.filter((mensagem) => mensagem.acao === nome);
const comPedido = (pedido: string) => mostrados.filter((mensagem) => mensagem.dados.pedido === pedido);
const respondeu = (pedido: string) => esperar(() => comPedido(pedido).length > 0);
const cursoDe = (pedido: string) => comPedido(pedido).find((mensagem) => mensagem.acao === "curso")?.dados as unknown as MensagemCurso | undefined;
const erroDe = (pedido: string) => comPedido(pedido).find((mensagem) => mensagem.acao === "erro")?.dados;
const listas = () => recebidas("lista").map((mensagem) => mensagem.dados as unknown as MensagemListaCursos);
const doVerbo = async (verbo: string) => (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === verbo);

/** Começa um curso e devolve o curso mandado. */
async function comecar(pedido = "p-comecar"): Promise<Curso> {
	acao("comecar", { pedido, basico: BASICO });
	await respondeu(pedido);
	const mensagem = cursoDe(pedido);
	if (!mensagem) throw new Error(`não começou: ${JSON.stringify(erroDe(pedido))}`);
	return mensagem.curso;
}

/** Confirma uma etapa e espera a resposta (curso ou erro) do pedido. */
async function confirmar(curso: string, etapa: string, dadosEtapa: unknown, pedido: string): Promise<void> {
	acao("confirmar", { curso, pedido, etapa, dados: dadosEtapa });
	await respondeu(pedido);
}

describe("ponte", () => {
	it("listar sem cursos manda a lista vazia", async () => {
		acao("listar");
		await esperar(() => listas().length > 0);
		expect(listas()[0]).toEqual({ materia, cursos: [] });
		expect(mostrados.every((mensagem) => mensagem.painel === "cursos" && mensagem.gravar === false)).toBe(true);
	});

	it("comecar cria o rascunho, manda o curso e a lista e grava comecou_curso", async () => {
		const curso = await comecar("p1");
		await esperar(() => listas().length > 0);
		expect(curso).toMatchObject({ id: "p1-probabilidade", nome: "P1: probabilidade", materia, situacao: "rascunho", etapa: "materiais", basico: { prazo: "2099-11-20", prova: "P1", horasPorSemana: 4 } });
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["curso", "lista"]);
		expect(listas()[0]!.cursos).toEqual([{ id: "p1-probabilidade", nome: "P1: probabilidade", situacao: "rascunho", etapa: "materiais", prazo: "2099-11-20", alteradoEm: curso.alteradoEm }]);
		expect(await lerCurso(dados, materia, curso.id)).toEqual(curso);
		const [evento] = await doVerbo("comecou_curso");
		expect(evento).toMatchObject({ sessao: "sessao-1", objeto: { materia, curso: "p1-probabilidade" }, resultado: { nome: "P1: probabilidade" } });
		expect(mostrados.every((mensagem) => mensagem.gravar === false)).toBe(true);
	});

	it("abrir manda o curso com os prontos; um curso que não existe vira erro", async () => {
		const curso = await comecar();
		acao("abrir", { curso: curso.id });
		await esperar(() => recebidas("curso").length > 1);
		expect(recebidas("curso")[1]!.dados).toEqual({ materia, curso, prontos: [] });
		acao("abrir", { curso: "nao-existe" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "abrir", materia, curso: "nao-existe" });
	});

	it("prontos manda de novo o curso com os materiais prontos de agora; comecar e confirmar também levam", async () => {
		const curso = await comecar("p-c");
		expect(cursoDe("p-c")!.prontos).toEqual([]);
		await extrair("aula-02.pdf", "h2");
		await extrair("aula-01.pdf", "h1");
		acao("prontos", { curso: curso.id });
		await esperar(() => recebidas("curso").length > 1);
		expect(recebidas("curso")[1]!.dados).toEqual({
			materia,
			curso,
			prontos: [
				{ arquivo: "aula-01.pdf", hash: "h1" },
				{ arquivo: "aula-02.pdf", hash: "h2" },
			],
		});
		await confirmar(curso.id, "materiais", {}, "p-m");
		expect(cursoDe("p-m")!.prontos).toEqual(cursoDe("p-m")!.curso.materiais!.arquivos);
		acao("prontos", { curso: "nao-existe" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "prontos", materia, curso: "nao-existe" });
	});

	it("confirma cada etapa até o Mapa: materiais do disco, e o Mapa só com o mapa aprovado", async () => {
		await extrair("aula-01.pdf");
		const { id } = await comecar();
		// Materiais: o que a tela manda é ignorado; vale o que está pronto no disco.
		await confirmar(id, "materiais", { arquivos: [{ arquivo: "inventado.pdf", hash: "x" }] }, "p-mat");
		expect(cursoDe("p-mat")).toMatchObject({ materia, invalidadas: [], curso: { etapa: "objetivo", materiais: { arquivos: [{ arquivo: "aula-01.pdf", hash: "h-aula-01.pdf" }] } } });
		await confirmar(id, "objetivo", { escopo: "material_base", tipo: "misto", motivo: " Passar na P1. " }, "p-obj");
		expect(cursoDe("p-obj")!.curso).toMatchObject({ etapa: "mapa", objetivo: { escopo: "material_base", tipo: "misto", motivo: "Passar na P1." } });
		// Mapa não aprovado: erro com o pedido, e nada muda.
		await gravarMapa(dados, materia, mapaDeTeste("rascunho"));
		await confirmar(id, "mapa", { conceitos: ["c-3", "c-1"] }, "p-mapa-1");
		expect(erroDe("p-mapa-1")).toMatchObject({ ao: "confirmar", materia, curso: id });
		expect(String(erroDe("p-mapa-1")!.mensagem)).toContain("aprovado");
		expect((await lerCurso(dados, materia, id)).mapa).toBeNull();
		// Aprovado: entra na ordem do mapa.
		await gravarMapa(dados, materia, mapaDeTeste("aprovado"));
		await confirmar(id, "mapa", { conceitos: ["c-3", "c-1"] }, "p-mapa-2");
		expect(cursoDe("p-mapa-2")!.curso).toMatchObject({ etapa: "diagnostico", mapa: { conceitos: ["c-1", "c-3"] } });
		expect((await lerCurso(dados, materia, id)).etapa).toBe("diagnostico");
		// Confirmar etapas não grava evento.
		expect((await lerEventos(eventosMateria(dados, materia))).eventos.map((evento) => evento.verbo)).toEqual(["criou_materia", "comecou_curso"]);
	});

	it("confirmar os materiais de novo, com o disco mudado, invalida o Mapa", async () => {
		await extrair("aula-01.pdf");
		await gravarMapa(dados, materia, mapaDeTeste("aprovado"));
		const { id } = await comecar();
		await confirmar(id, "materiais", {}, "p1");
		await confirmar(id, "objetivo", { escopo: "material_base", tipo: "teorico", motivo: "" }, "p2");
		await confirmar(id, "mapa", { conceitos: ["c-1"] }, "p3");
		// Mesmos materiais: nada invalidado.
		await confirmar(id, "materiais", {}, "p4");
		expect(cursoDe("p4")).toMatchObject({ invalidadas: [], curso: { etapa: "diagnostico" } });
		// Um material novo pronto: a foto muda e o Mapa cai.
		await extrair("aula-02.pdf");
		await confirmar(id, "materiais", {}, "p5");
		expect(cursoDe("p5")).toMatchObject({ invalidadas: ["mapa"], curso: { etapa: "mapa", mapa: null } });
		expect(cursoDe("p5")!.curso.materiais!.arquivos.map((item) => item.arquivo)).toEqual(["aula-01.pdf", "aula-02.pdf"]);
		expect((await lerCurso(dados, materia, id)).mapa).toBeNull();
	});

	it("erro de validação volta com o pedido, a matéria e o curso", async () => {
		const { id } = await comecar();
		await confirmar(id, "basico", { ...BASICO, horasPorSemana: 0 }, "p1");
		expect(erroDe("p1")).toMatchObject({ ao: "confirmar", materia, curso: id, pedido: "p1" });
		expect(String(erroDe("p1")!.mensagem)).toContain("horas por semana");
		acao("comecar", { pedido: "p2", basico: { ...BASICO, nome: "  " } });
		await respondeu("p2");
		expect(erroDe("p2")).toMatchObject({ ao: "comecar", materia, pedido: "p2" });
		await confirmar(id, "objetivo", { escopo: "livre", tipo: "misto", motivo: "" }, "p3");
		expect(String(erroDe("p3")!.mensagem)).toContain("Materiais");
	});

	it("descartar apaga o rascunho, manda descartado e a lista e grava descartou_curso", async () => {
		const { id } = await comecar();
		const antes = listas().length;
		acao("descartar", { curso: id, pedido: "p1" });
		await respondeu("p1");
		await esperar(() => listas().length > antes);
		expect(recebidas("descartado")[0]!.dados).toEqual({ materia, curso: id, pedido: "p1" });
		expect(listas().at(-1)).toEqual({ materia, cursos: [] });
		await expect(stat(pastaDoCurso(dados, materia, id))).rejects.toThrow();
		expect((await doVerbo("descartou_curso"))[0]).toMatchObject({ objeto: { materia, curso: id }, resultado: { nome: "P1: probabilidade", etapa: "materiais" } });
	});

	it("matéria que não existe vira erro", async () => {
		barramento.emit("interface:acao", { painel: "cursos", acao: "listar", dados: { materia: "nao-existe" } });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "listar", materia: "nao-existe" });
	});

	it("uma cópia sem session_start no mesmo barramento fica calada", async () => {
		cursos(piFalso(false), opcoesDeTeste());
		acao("listar");
		await esperar(() => listas().length > 0);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toHaveLength(1);
		acao("comecar", { pedido: "p1", basico: BASICO });
		await respondeu("p1");
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(recebidas("curso")).toHaveLength(1);
		expect(await doVerbo("comecou_curso")).toHaveLength(1);
	});

	it("depois de session_shutdown a extensão fica calada", async () => {
		tratadores.session_shutdown?.({}, ctx);
		acao("listar");
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toHaveLength(0);
	});
});

describe("ler_curso", () => {
	const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });

	it("sem curso lista os cursos; com curso, o resumo com os nomes dos conceitos e o que falta", async () => {
		await extrair("aula-01.pdf");
		await gravarMapa(dados, materia, mapaDeTeste("aprovado"));
		const { id } = await comecar();
		await confirmar(id, "materiais", {}, "p1");
		await confirmar(id, "objetivo", { escopo: "so_material", tipo: "aplicado", motivo: "Passar na P1." }, "p2");
		await confirmar(id, "mapa", { conceitos: ["c-1", "c-3"] }, "p3");

		const semMateria = await ferramentas.ler_curso!.execute("1", {}, undefined, undefined, ctx);
		expect(semMateria.isError).toBe(true);
		const lista = await ferramentas.ler_curso!.execute("2", { materia }, undefined, undefined, ctx);
		expect(lista.content[0]!.text).toContain(`- P1: probabilidade (id ${id}): rascunho, parado na etapa Diagnóstico; prazo 2099-11-20`);

		const resumo = (await ferramentas.ler_curso!.execute("3", { materia, curso: id }, undefined, undefined, ctx)).content[0]!.text;
		expect(resumo).toContain("Prazo: 2099-11-20.");
		expect(resumo).toContain("Prova: P1.");
		expect(resumo).toContain("Horas por semana: 4.");
		expect(resumo).toContain("- aula-01.pdf");
		expect(resumo).toContain("Escopo: só o material.");
		expect(resumo).toContain("Tipo: aplicado.");
		expect(resumo).toContain("Motivo: Passar na P1.");
		expect(resumo).toContain("01. Espaço amostral — Os resultados possíveis.");
		expect(resumo).toContain("02. Probabilidade condicional");
		expect(resumo).toContain("Falta confirmar: Diagnóstico, Esqueleto.");

		const naoExiste = await ferramentas.ler_curso!.execute("4", { materia, curso: "nao-existe" }, undefined, undefined, ctx);
		expect(naoExiste.isError).toBe(true);
	});

	it("numa conversa de caderno fica na matéria da conversa", async () => {
		const { id } = await comecar();
		entradas = [contextoDe(`materia:${materia}`)];
		const doCaderno = await ferramentas.ler_curso!.execute("1", { curso: id }, undefined, undefined, ctx);
		expect(doCaderno.isError).toBeUndefined();
		expect(doCaderno.content[0]!.text).toContain("Falta confirmar: Materiais, Objetivo, Mapa, Diagnóstico, Esqueleto.");
		const outra = await ferramentas.ler_curso!.execute("2", { materia: "fisica" }, undefined, undefined, ctx);
		expect(outra.isError).toBe(true);
		expect(outra.content[0]!.text).toContain("caderno");
	});

	it("o resumo marca o conceito que saiu do mapa e o que foi tirado depois", () => {
		const curso = { ...({} as Curso), id: "c", nome: "C", materia: "m", situacao: "rascunho", etapa: "diagnostico", basico: null, materiais: null, objetivo: null, mapa: { conceitos: ["c-1", "c-2", "c-9"] }, diagnostico: null, esqueleto: null } as Curso;
		const texto = textoDoCurso(curso, { mapa: mapaDeTeste("aprovado") });
		expect(texto).toContain("02. Agenda [tirado do mapa da matéria depois]");
		expect(texto).toContain("03. (c-9: não está mais no mapa da matéria)");
	});
});

// --- O diagnóstico (parte B) ---------------------------------------------------------

/** Um .extraido de mentira com o texto de cada trecho. */
async function extrairTrechos(arquivo: string, trechos: Array<[local: string, nome: string, texto: string]>): Promise<void> {
	const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
	await mkdir(pasta, { recursive: true });
	for (const [local, nome, texto] of trechos) await writeFile(join(pasta, `${nome}.md`), `---\narquivo: ${arquivo}\nlocal: ${local}\norigem: texto\n---\n\n${texto}\n`, "utf8");
	const manifesto = { versao: 1, arquivo, hash: `h-${arquivo}`, tamanho: 1, tipo: "pdf", extraidoEm: "2026-10-21T00:00:00.000Z", custo: 0, avisos: [], trechos: trechos.map(([local, nome]) => ({ local, nome, origem: "texto" })) };
	await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");
}

const referencia = (local: string, trecho: string) => ({ arquivo: "aula.pdf", local, trecho });
const mapaDoDiagnostico = (): MapaConteudo => ({
	...mapaVazio(),
	situacao: "aprovado",
	aprovadoEm: "2026-10-21T00:00:00.000Z",
	conceitos: [
		{ ...conceitoBase, id: "c-1", nome: "Regressão linear", descricao: "Ajuste de uma reta.", referencias: [referencia("página 1", "pagina-001")] },
		{ ...conceitoBase, id: "c-2", nome: "Resíduo", descricao: "Observado menos previsto.", referencias: [referencia("página 2", "pagina-002")] },
		{ ...conceitoBase, id: "c-3", nome: "R²", descricao: "Fração da variância explicada.", referencias: [] },
	],
});

/** Um curso com as etapas até o Mapa confirmadas pela ponte (etapa diagnostico), com 3 conceitos. */
async function cursoNoDiagnostico(escopo = "so_material"): Promise<string> {
	await extrairTrechos("aula.pdf", [
		["página 1", "pagina-001", "Regressão linear ajusta uma reta aos dados."],
		["página 2", "pagina-002", "O resíduo é o observado menos o previsto."],
	]);
	await gravarMapa(dados, materia, mapaDoDiagnostico());
	const { id } = await comecar("p-c");
	await confirmar(id, "materiais", {}, "p-mat");
	await confirmar(id, "objetivo", { escopo, tipo: "misto", motivo: "Passar na P1." }, "p-obj");
	await confirmar(id, "mapa", { conceitos: ["c-1", "c-2", "c-3"] }, "p-mapa");
	return id;
}

/** Com estes níveis: alternativas de c-1, c-2 e c-3 (q1 a q3) e a dissertativa de c-1 (q4). */
const NIVEIS = { "c-1": 3, "c-2": 1, "c-3": 0 };

const alternativa = (conceito: string, correta = 1) => ({
	tipo: "alternativa",
	conceitos: [conceito],
	enunciado: `Sobre ${conceito}?`,
	alternativas: [0, 1, 2, 3].map((indice) => (indice === correta ? { texto: `Certa ${conceito}`, correta: true } : { texto: `Errada ${indice} ${conceito}`, confusao: `Confusão ${indice} de ${conceito}.` })),
	explicacao: "Porque sim.",
});
const DISSERTATIVA = {
	tipo: "dissertativa",
	conceitos: ["c-1"],
	contexto: "Os dados: as colunas `x` e `y` de uma tabela.",
	enunciado: "Explique a regressão linear.",
	rubrica: [
		{ criterio: "Reta", descricao: "Diz que ajusta uma reta.", pontos: 2 },
		{ criterio: "Mínimos quadrados", descricao: "Diz como a reta é escolhida.", pontos: 2 },
		{ criterio: "Previsão", descricao: "Diz para que serve.", pontos: 1 },
	],
	respostaModelo: "Ajusta uma reta pelos mínimos quadrados para prever y.",
};
const QUESTOES = JSON.stringify({ questoes: [alternativa("c-1"), alternativa("c-2"), alternativa("c-3"), DISSERTATIVA] });
const CORRECAO = JSON.stringify({
	criterios: [
		{ criterio: "Reta", trechos: ["ajusta uma reta"], pontos: 2, justificativa: "Disse." },
		{ criterio: "Mínimos quadrados", trechos: [], pontos: 0, justificativa: "Não disse." },
		{ criterio: "Previsão", trechos: ["prever"], pontos: 0.5, justificativa: "Incompleto." },
	],
});
const TEXTO = "A regressão ajusta uma reta aos pontos para prever.";

const doAprendiz = async (verbo: string) => (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => evento.verbo === verbo);
const promptDe = async (nome: string) => ({ nome, hash: hashDoPrompt(await readFile(join(dados, nome), "utf8")) });
/** O prompt com a metodologia, como o contexto dos eventos o guarda (usadoComMetodo): os nomes e os hashes juntos por " + ". */
const promptComMetodo = async (nome: string, arquivos: string[]) => {
	const prompt = await promptDe(nome);
	return {
		nome: [prompt.nome, ...arquivos.map((arquivo) => `metodo/${arquivo}`)].join(" + "),
		hash: [prompt.hash, ...arquivos.map((arquivo) => hashDoPrompt(METODO[arquivo]!))].join(" + "),
	};
};
const textoDaChamada = (pedido: Pedido, indice = 0) => JSON.stringify(pedido.contexto.messages[indice]?.content);
const emAndamento = async (id: string) => (await lerCurso(dados, materia, id)).diagnosticoEmAndamento!;

/** Salva a autoavaliação e gera as questões (a resposta do modelo já pronta). */
async function gerar(id: string, pedido = "p-gerar"): Promise<MensagemCurso> {
	acao("autoavaliar", { curso: id, pedido: "p-auto", niveis: NIVEIS });
	await respondeu("p-auto");
	respostas.push(QUESTOES);
	acao("gerar_diagnostico", { curso: id, pedido });
	await respondeu(pedido);
	const mensagem = cursoDe(pedido);
	if (!mensagem) throw new Error(`não gerou: ${JSON.stringify(erroDe(pedido))}`);
	return mensagem;
}

async function responder(id: string, pedido: string, resposta: Record<string, unknown>): Promise<void> {
	acao("responder", { curso: id, pedido, ...resposta });
	await respondeu(pedido);
}

/** A última mensagem "curso" que chegou. */
const ultimoCurso = () => recebidas("curso").at(-1)!.dados as unknown as MensagemCurso;

describe("diagnóstico", () => {
	it("os prompts do perfil dizem o modelo e o formato", async () => {
		const questoes = lerPromptMapeador(await readFile(CAMINHO_PROMPT_DIAGNOSTICO, "utf8"));
		expect(questoes.modelo).toBe("openrouter/openai/gpt-6.1-sol");
		expect(questoes.instrucoes).toContain('"questoes"');
		expect(questoes.instrucoes).toContain('"contexto"');
		const corretor = lerPromptMapeador(await readFile(CAMINHO_PROMPT_CORRETOR, "utf8"));
		expect(corretor.modelo).toBe("openrouter/openai/gpt-6.1-sol");
		expect(corretor.instrucoes).toContain('"criterios"');
	});

	it("autoavaliar salva os níveis e grava autoavaliou_conceito só dos que mudaram", async () => {
		const id = await cursoNoDiagnostico();
		acao("autoavaliar", { curso: id, pedido: "a1", niveis: { "c-1": 2 } });
		await respondeu("a1");
		expect(cursoDe("a1")!.curso.diagnosticoEmAndamento).toEqual({ autoavaliacao: { "c-1": 2 }, questoes: [], respostas: {} });
		acao("autoavaliar", { curso: id, pedido: "a2", niveis: { "c-1": 2, "c-2": 1, "c-3": 0 } });
		await respondeu("a2");
		const eventos = await doAprendiz("autoavaliou_conceito");
		expect(eventos.map((evento) => [evento.objeto.conceitos, evento.resultado])).toEqual([
			[["c-1"], { nivel: 2 }],
			[["c-2"], { nivel: 1 }],
			[["c-3"], { nivel: 0 }],
		]);
		expect(eventos[0]).toMatchObject({ sessao: "sessao-1", objeto: { materia, curso: id }, contexto: { fase: "diagnostico", prompt: await promptComMetodo("diagnostico.md", ["quiz.md", "dissertativa.md"]) } });
		acao("autoavaliar", { curso: id, pedido: "a3", niveis: { "c-1": 7 } });
		await respondeu("a3");
		expect(erroDe("a3")).toMatchObject({ ao: "autoavaliar", materia, curso: id });
		expect(await doAprendiz("autoavaliou_conceito")).toHaveLength(3);
	});

	it("gerar_diagnostico sem a autoavaliação completa dá erro e não chama o modelo", async () => {
		const id = await cursoNoDiagnostico();
		acao("autoavaliar", { curso: id, pedido: "a1", niveis: { "c-1": 2 } });
		await respondeu("a1");
		acao("gerar_diagnostico", { curso: id, pedido: "g1" });
		await respondeu("g1");
		expect(String(erroDe("g1")!.mensagem)).toContain("nível a todos os conceitos");
		expect(chamadas).toHaveLength(0);
	});

	it("gerar_diagnostico lê de primeira uma resposta com código em bloco no contexto, numa cerca ```json e com texto em volta", async () => {
		const id = await cursoNoDiagnostico();
		acao("autoavaliar", { curso: id, pedido: "a1", niveis: NIVEIS });
		await respondeu("a1");
		const contexto = "Rode o trecho:\n\n```python\nfreq = {'a': 2}\nprint(len(freq))\n```";
		const comCodigo = JSON.stringify({ questoes: [{ ...alternativa("c-1"), contexto }, alternativa("c-2"), alternativa("c-3"), DISSERTATIVA] }, null, 2);
		respostas.push(`Seguem as questões:\n\n\`\`\`json\n${comCodigo}\n\`\`\`\n\nQualquer {ajuste}, avise.`);
		acao("gerar_diagnostico", { curso: id, pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toBeUndefined();
		expect(chamadas).toHaveLength(1);
		expect((await emAndamento(id)).questoes[0]).toMatchObject({ id: "q1", contexto, enunciado: "Sobre c-1?" });
	});

	it("gerar_diagnostico chama o modelo com os trechos, tenta de novo com JSON inválido, grava e esconde o gabarito", async () => {
		const id = await cursoNoDiagnostico();
		acao("autoavaliar", { curso: id, pedido: "a1", niveis: NIVEIS });
		await respondeu("a1");
		respostas.push("isto não é JSON", QUESTOES);
		acao("gerar_diagnostico", { curso: id, pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toBeUndefined();
		// Antes: o curso com gerandoDiagnostico, sem o pedido; no fim, sem gerandoDiagnostico, com o pedido.
		const doCurso = recebidas("curso").map((mensagem) => mensagem.dados as unknown as MensagemCurso);
		const indiceGerando = doCurso.findIndex((mensagem) => mensagem.gerandoDiagnostico === true);
		expect(indiceGerando).toBeGreaterThanOrEqual(0);
		expect(doCurso[indiceGerando]!.pedido).toBeUndefined();
		const final = cursoDe("g1")!;
		expect(final.gerandoDiagnostico).toBeUndefined();

		// Na tela, sem o gabarito.
		const naTela = final.curso.diagnosticoEmAndamento!;
		expect(naTela.questoes.map((questao) => [questao.id, questao.tipo, questao.conceitos])).toEqual([
			["q1", "alternativa", ["c-1"]],
			["q2", "alternativa", ["c-2"]],
			["q3", "alternativa", ["c-3"]],
			["q4", "dissertativa", ["c-1"]],
		]);
		const q1 = naTela.questoes[0]! as unknown as Record<string, unknown>;
		expect(q1.alternativas).toEqual([{ texto: "Errada 0 c-1" }, { texto: "Certa c-1" }, { texto: "Errada 2 c-1" }, { texto: "Errada 3 c-1" }]);
		expect(q1.explicacao).toBeUndefined();
		const q4 = naTela.questoes[3]! as unknown as Record<string, unknown>;
		expect(q4.rubrica).toBeUndefined();
		expect(q4.respostaModelo).toBeUndefined();
		expect(JSON.stringify(mostrados)).not.toContain("Confusão");

		// No disco, inteiro.
		const gravado = await emAndamento(id);
		expect(gravado).toMatchObject({ modelo: "teste/modelo-x", custo: 0.02, respostas: {} });
		expect(gravado.questoes[0]).toMatchObject({ alternativas: [{ confusao: "Confusão 0 de c-1." }, { correta: true }, {}, {}], explicacao: "Porque sim." });

		// A mensagem ao modelo: os conceitos, os níveis e os trechos (escopo só o material).
		expect(chamadas).toHaveLength(2);
		expect(chamadas[0]!.contexto.systemPrompt).toBe(comMetodo("Gere as questões.", ["quiz.md", "dissertativa.md"]));
		expect(chamadas[0]!.opcoes.temperature).toBeUndefined();
		const mensagem = textoDaChamada(chamadas[0]!);
		expect(mensagem).toContain("Regressão linear ajusta uma reta aos dados.");
		expect(mensagem).toContain("O resíduo é o observado menos o previsto.");
		expect(mensagem).toContain("Sei aplicar");
		expect(mensagem).toContain("nenhum trecho do material cita este conceito");
		expect(mensagem).toContain("dissertativa sobre c-1");
		// Sem regras de escrita, a mensagem fica sem a seção.
		expect(mensagem).not.toContain("Regras de escrita");
		// A segunda tentativa leva a resposta ruim e o motivo.
		expect(chamadas[1]!.contexto.messages).toHaveLength(3);
		expect(textoDaChamada(chamadas[1]!, 2)).toContain("não veio como o pedido");

		const [evento] = await doVerbo("gerou_diagnostico");
		expect(evento).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: id },
			resultado: { questoes: 4, custo: 0.02 },
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptComMetodo("diagnostico.md", ["quiz.md", "dissertativa.md"]) },
		});
	});

	it("as regras de escrita que valem para a matéria entram no fim da mensagem das questões; um escrita.json ilegível é erro", async () => {
		const id = await cursoNoDiagnostico();
		await salvarRegra(dados, { texto: "Comece por um exemplo com números.", materia: null, ativa: true });
		await salvarRegra(dados, { texto: "Nada de pegadinha.", materia, ativa: true });
		await salvarRegra(dados, { texto: "Regra de outra matéria.", materia: "outra-materia", ativa: true });
		await salvarRegra(dados, { texto: "Regra desligada.", materia: null, ativa: false });
		await gerar(id, "g1");
		const mensagem = textoDaChamada(chamadas[0]!);
		const secao = JSON.stringify("Regras de escrita do Breno (obedeça sempre):\n1. Comece por um exemplo com números.\n2. Nada de pegadinha.").slice(1, -1);
		expect(mensagem).toContain(secao);
		expect(mensagem.endsWith(`${secao}"}]`)).toBe(true);
		expect(mensagem).not.toContain("Regra de outra matéria.");
		expect(mensagem).not.toContain("Regra desligada.");

		// Ilegível: as questões não saem sem as regras, e o arquivo não muda.
		const outro = await cursoNoDiagnostico();
		await writeFile(arquivoEscrita(dados), "{ quebrado", "utf8");
		acao("autoavaliar", { curso: outro, pedido: "a2", niveis: NIVEIS });
		await respondeu("a2");
		acao("gerar_diagnostico", { curso: outro, pedido: "g2" });
		await respondeu("g2");
		expect(String(erroDe("g2")!.mensagem)).toContain("Não consegui ler as regras de escrita");
		expect(chamadas).toHaveLength(1);
		expect(await readFile(arquivoEscrita(dados), "utf8")).toBe("{ quebrado");
	});

	it("gerar com outro em andamento no mesmo curso dá erro; no escopo livre não vão trechos", async () => {
		const id = await cursoNoDiagnostico("livre");
		acao("autoavaliar", { curso: id, pedido: "a1", niveis: NIVEIS });
		await respondeu("a1");
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar_diagnostico", { curso: id, pedido: "g1" });
		await esperar(() => chamadas.length === 1);
		acao("gerar_diagnostico", { curso: id, pedido: "g2" });
		await respondeu("g2");
		expect(String(erroDe("g2")!.mensagem)).toContain("já estão sendo geradas");
		// abrir no meio mostra que está gerando.
		acao("abrir", { curso: id });
		await esperar(() => ultimoCurso().gerandoDiagnostico === true && ultimoCurso().pedido === undefined);
		expect(textoDaChamada(chamadas[0]!)).not.toContain("<trecho");
		adiado.soltar(QUESTOES);
		await respondeu("g1");
		expect(cursoDe("g1")!.curso.diagnosticoEmAndamento!.questoes).toHaveLength(4);
		expect(chamadas).toHaveLength(1);
	});

	it("o modelo que falha duas vezes vira erro com o pedido, e o diagnóstico não muda", async () => {
		const id = await cursoNoDiagnostico();
		acao("autoavaliar", { curso: id, pedido: "a1", niveis: NIVEIS });
		await respondeu("a1");
		respostas.push('{"questoes": []}', '{"questoes": [{"tipo": "alternativa"}]}');
		acao("gerar_diagnostico", { curso: id, pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toMatchObject({ ao: "gerar_diagnostico", materia, curso: id });
		expect(String(erroDe("g1")!.mensagem)).toContain("segunda tentativa");
		await esperar(() => ultimoCurso().gerandoDiagnostico === undefined);
		expect((await emAndamento(id)).questoes).toEqual([]);
		expect(await doVerbo("gerou_diagnostico")).toHaveLength(0);
	});

	it("responder uma alternativa: corrigida pelo código, evento no aprendiz, sem gabarito na tela", async () => {
		const id = await cursoNoDiagnostico();
		await gerar(id);
		await responder(id, "r1", { questao: "q1", confianca: 3, escolha: 1, tempoMs: 41000.4 });
		const naTela = cursoDe("r1")!.curso.diagnosticoEmAndamento!.respostas.q1 as unknown as Record<string, unknown>;
		expect(naTela).toMatchObject({ confianca: 3, escolha: 1, tempoMs: 41000 });
		expect(naTela.correta).toBeUndefined();
		await responder(id, "r2", { questao: "q2", confianca: 4, escolha: 0, tempoMs: 1000 });
		const gravado = await emAndamento(id);
		expect(gravado.respostas.q1).toMatchObject({ correta: true });
		expect(gravado.respostas.q2).toMatchObject({ correta: false, confusao: "Confusão 0 de c-2." });
		const eventos = await doAprendiz("respondeu_questao");
		expect(eventos.map((evento) => evento.resultado)).toEqual([
			{ correta: true, escolha: 1, confianca: 3, tempoMs: 41000 },
			{ correta: false, escolha: 0, confusao: "Confusão 0 de c-2.", confianca: 4, tempoMs: 1000 },
		]);
		expect(eventos[0]).toMatchObject({
			objeto: { materia, curso: id, conceitos: ["c-1"], questao: "q1" },
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptComMetodo("diagnostico.md", ["quiz.md", "dissertativa.md"]) },
		});
		// Responder de novo, ou sem confiança, dá erro com a questão.
		await responder(id, "r3", { questao: "q1", confianca: 3, escolha: 0, tempoMs: 1 });
		expect(erroDe("r3")).toMatchObject({ ao: "responder", curso: id, questao: "q1" });
		await responder(id, "r4", { questao: "q3", escolha: 0, tempoMs: 1 });
		expect(String(erroDe("r4")!.mensagem)).toContain("confiança");
	});

	it("responder a dissertativa: corrigindo, a correção pelo corretor e o evento", async () => {
		const id = await cursoNoDiagnostico();
		await gerar(id);
		const adiado = adiada();
		respostas.push(adiado.resposta);
		await responder(id, "r1", { questao: "q4", confianca: 2, texto: TEXTO, tempoMs: 180000 });
		expect(cursoDe("r1")!.corrigindo).toEqual(["q4"]);
		await esperar(() => chamadas.length === 2);
		adiado.soltar(CORRECAO);
		// Espera pela mensagem, nunca lendo o curso.json enquanto a extensão grava:
		// no Windows, ler o arquivo na hora em que ela renomeia o novo por cima
		// faz o rename falhar com EPERM (a correção se perdia e o teste esperava
		// para sempre). A mensagem sem corrigindo sai depois de gravar.
		await esperar(() => ultimoCurso().corrigindo === undefined);
		expect(recebidas("erro")).toEqual([]);
		const correcao = ((await emAndamento(id)).respostas.q4 as { correcao?: unknown }).correcao;
		expect(correcao).toEqual({
			criterios: [
				{ criterio: "Reta", trechos: ["ajusta uma reta"], pontos: 2, max: 2, justificativa: "Disse." },
				{ criterio: "Mínimos quadrados", trechos: [], pontos: 0, max: 2, justificativa: "Não disse." },
				{ criterio: "Previsão", trechos: ["prever"], pontos: 0.5, max: 1, justificativa: "Incompleto." },
			],
			total: 2.5,
			max: 5,
			modelo: "teste/modelo-x",
			custo: 0.01,
		});
		// Com questões sem resposta, a tela não vê a correção.
		expect((ultimoCurso().curso.diagnosticoEmAndamento!.respostas.q4 as { correcao?: unknown }).correcao).toBeUndefined();
		const corretor = chamadas[1]!;
		expect(corretor.contexto.systemPrompt).toBe(comMetodo("Corrija pela rubrica.", ["dissertativa.md"]));
		expect(corretor.opcoes.temperature).toBe(0);
		expect(textoDaChamada(corretor)).toContain(TEXTO);
		expect(textoDaChamada(corretor)).toContain("Mínimos quadrados");
		// O contexto vai antes da pergunta (a chamada vem em JSON, com as quebras de linha escapadas).
		expect(textoDaChamada(corretor)).toContain(JSON.stringify("Contexto da questão:\nOs dados: as colunas `x` e `y` de uma tabela.\n\nPergunta: Explique a regressão linear.").slice(1, -1));
		const [evento] = await doAprendiz("respondeu_dissertativa");
		expect(evento).toMatchObject({
			objeto: { materia, curso: id, conceitos: ["c-1"], questao: "q4" },
			resultado: { confianca: 2, tempoMs: 180000, total: 2.5, max: 5, texto: TEXTO, criterios: [{ criterio: "Reta", pontos: 2, max: 2 }, {}, {}] },
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptComMetodo("corretor.md", ["dissertativa.md"]) },
		});
		expect(await doAprendiz("respondeu_questao")).toHaveLength(0);
	});

	it("a correção que falha vira erro com a questão; corrigir tenta de novo", async () => {
		const id = await cursoNoDiagnostico();
		await gerar(id);
		respostas.push("ruim", '{"criterios": [{"criterio": "Reta", "trechos": [], "pontos": 9, "justificativa": ""}]}');
		await responder(id, "r1", { questao: "q4", confianca: 2, texto: TEXTO, tempoMs: 1000 });
		await esperar(() => recebidas("erro").length > 0);
		const erro = recebidas("erro")[0]!.dados;
		expect(erro).toMatchObject({ ao: "corrigir", materia, curso: id, questao: "q4" });
		expect(erro.pedido).toBeUndefined();
		expect(String(erro.mensagem)).toContain("continua sem correção");
		await esperar(() => ultimoCurso().corrigindo === undefined);
		expect("correcao" in (await emAndamento(id)).respostas.q4!).toBe(false);
		expect(await doAprendiz("respondeu_dissertativa")).toHaveLength(0);

		respostas.push(CORRECAO);
		acao("corrigir", { curso: id, pedido: "c1", questao: "q4" });
		await respondeu("c1");
		expect(cursoDe("c1")!.corrigindo).toBeUndefined();
		expect((await emAndamento(id)).respostas.q4).toMatchObject({ correcao: { total: 2.5, max: 5 } });
		expect(await doAprendiz("respondeu_dissertativa")).toHaveLength(1);
		acao("corrigir", { curso: id, pedido: "c2", questao: "q4" });
		await respondeu("c2");
		expect(erroDe("c2")).toMatchObject({ ao: "corrigir", questao: "q4" });
		expect(String(erroDe("c2")!.mensagem)).toContain("já foi corrigida");
		acao("corrigir", { curso: id, pedido: "c3", questao: "q1" });
		await respondeu("c3");
		expect(String(erroDe("c3")!.mensagem)).toContain("dissertativa");
	});

	it("com tudo respondido a mensagem vem inteira; concluir confirma a etapa e grava concluiu_diagnostico", async () => {
		const id = await cursoNoDiagnostico();
		await gerar(id);
		await responder(id, "r1", { questao: "q1", confianca: 3, escolha: 1, tempoMs: 1 });
		acao("concluir_diagnostico", { curso: id, pedido: "cedo" });
		await respondeu("cedo");
		expect(String(erroDe("cedo")!.mensagem)).toContain("Responda todas");

		const durante = (await ferramentas.ler_curso!.execute("1", { materia, curso: id }, undefined, undefined, ctx)).content[0]!.text;
		expect(durante).toContain("Fase: questões (1 de 4 respondidas).");
		expect(durante).toContain("- Regressão linear: Sei aplicar");
		expect(durante).not.toContain("Certa");
		expect(durante).not.toContain("Confusão");
		expect(durante).not.toContain("Sobre c-1");

		await responder(id, "r2", { questao: "q2", confianca: 3, escolha: 0, tempoMs: 1 });
		await responder(id, "r3", { questao: "q3", confianca: 1, escolha: 1, tempoMs: 1 });
		respostas.push(CORRECAO);
		await responder(id, "r4", { questao: "q4", confianca: 2, texto: TEXTO, tempoMs: 1 });
		// A última resposta: a mensagem já vem inteira, com corrigindo.
		expect(cursoDe("r4")!.corrigindo).toEqual(["q4"]);
		expect(cursoDe("r4")!.curso.diagnosticoEmAndamento!.questoes[0]).toMatchObject({ alternativas: [{ confusao: "Confusão 0 de c-1." }, { correta: true }, {}, {}], explicacao: "Porque sim." });
		expect(cursoDe("r4")!.curso.diagnosticoEmAndamento!.respostas.q2).toMatchObject({ correta: false, confusao: "Confusão 0 de c-2." });
		await esperar(() => ultimoCurso().corrigindo === undefined);
		expect(ultimoCurso().curso.diagnosticoEmAndamento!.respostas.q4).toMatchObject({ correcao: { total: 2.5 } });
		expect(ultimoCurso().curso.diagnosticoEmAndamento!.questoes[3]).toMatchObject({ rubrica: DISSERTATIVA.rubrica, respostaModelo: DISSERTATIVA.respostaModelo });

		const resultado = (await ferramentas.ler_curso!.execute("2", { materia, curso: id }, undefined, undefined, ctx)).content[0]!.text;
		expect(resultado).toContain("Fase: resultado");
		expect(resultado).toContain("Resultado: 2 de 3 alternativas certas; dissertativas: 50% dos pontos.");
		expect(resultado).toContain("- Resíduo: Disse \"Já ouvi falar\" e foi mal nas questões: a autoavaliação bateu. (q2 errada)");

		acao("concluir_diagnostico", { curso: id, pedido: "fim" });
		await respondeu("fim");
		const concluido = cursoDe("fim")!;
		expect(concluido.invalidadas).toEqual([]);
		expect(concluido.curso.etapa).toBe("esqueleto");
		expect(concluido.curso.diagnosticoEmAndamento).toBeUndefined();
		expect(concluido.curso.diagnostico).toMatchObject({ modelo: "teste/modelo-x", custo: 0.01 });
		expect((await lerCurso(dados, materia, id)).diagnostico?.concluidoEm).toBeTruthy();
		const [evento] = await doVerbo("concluiu_diagnostico");
		expect(evento).toMatchObject({
			objeto: { materia, curso: id },
			resultado: { acertos: 2, alternativas: 3, dissertativas: 1, nota: 0.5 },
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptComMetodo("diagnostico.md", ["quiz.md", "dissertativa.md"]) },
		});
		const depois = (await ferramentas.ler_curso!.execute("3", { materia, curso: id }, undefined, undefined, ctx)).content[0]!.text;
		expect(depois).toContain("Concluído em");
		expect(depois).toContain("Falta confirmar: Esqueleto.");
	});

	it("uma cópia sem session_start não chama o modelo nem grava em dobro", async () => {
		const id = await cursoNoDiagnostico();
		cursos(piFalso(false), opcoesDeTeste());
		await gerar(id);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(chamadas).toHaveLength(1);
		expect(await doVerbo("gerou_diagnostico")).toHaveLength(1);
		expect(recebidas("curso").filter((mensagem) => mensagem.dados.pedido === "p-gerar")).toHaveLength(1);
	});

	it("depois de session_shutdown a geração em andamento para sem gravar", async () => {
		const id = await cursoNoDiagnostico();
		acao("autoavaliar", { curso: id, pedido: "a1", niveis: NIVEIS });
		await respondeu("a1");
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar_diagnostico", { curso: id, pedido: "g1" });
		await esperar(() => chamadas.length === 1);
		tratadores.session_shutdown?.({}, ctx);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(comPedido("g1")).toHaveLength(0);
		expect((await emAndamento(id)).questoes).toEqual([]);
	});
});

// --- O esqueleto (parte C) -----------------------------------------------------------

type QuestaoAlternativaSemId = Omit<Extract<Diagnostico["questoes"][number], { tipo: "alternativa" }>, "id">;

/** Um diagnóstico concluído para os 3 conceitos do cursoNoDiagnostico: c-1 "sei aplicar" e acertou; c-2 "já ouvi falar" e errou; c-3 "nunca vi", sem questão. */
const DIAGNOSTICO_CONCLUIDO: Diagnostico = {
	autoavaliacao: { "c-1": 3, "c-2": 1, "c-3": 0 },
	questoes: [
		{ id: "q1", ...(alternativa("c-1") as QuestaoAlternativaSemId) },
		{ id: "q2", ...(alternativa("c-2") as QuestaoAlternativaSemId) },
	],
	geradoEm: "2026-10-21T00:00:00.000Z",
	modelo: "teste/modelo-x",
	custo: 0.02,
	respostas: {
		q1: { confianca: 4, escolha: 1, correta: true, tempoMs: 1000, respondidaEm: "2026-10-21T00:01:00.000Z" },
		q2: { confianca: 2, escolha: 0, correta: false, confusao: "Confusão 0 de c-2.", tempoMs: 1000, respondidaEm: "2026-10-21T00:02:00.000Z" },
	},
	concluidoEm: "2026-10-21T00:03:00.000Z",
};

/** Um curso com as etapas até o Diagnóstico confirmadas (etapa esqueleto); o diagnóstico concluído vai direto pela lib. */
async function cursoNoEsqueleto(): Promise<string> {
	const id = await cursoNoDiagnostico();
	await confirmarNoDisco(dados, materia, id, "diagnostico", DIAGNOSTICO_CONCLUIDO);
	return id;
}

const PROPOSTA = JSON.stringify({
	modulos: [
		{ nome: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-1", "c-2"], tipo: "curto", horas: 3 },
		{ nome: "O R²", objetivo: "Interpretar o R².", conceitos: ["c-3"], tipo: "normal", horas: 2 },
	],
});
const MODULOS_DA_PROPOSTA = [
	{ id: "m1", nome: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-1", "c-2"], tipo: "curto", horas: 3 },
	{ id: "m2", nome: "O R²", objetivo: "Interpretar o R².", conceitos: ["c-3"], tipo: "normal", horas: 2 },
];

const propostaNoDisco = async (id: string) => (await lerCurso(dados, materia, id)).esqueletoEmAndamento;

/** O texto da primeira mensagem de uma chamada ao modelo. */
const textoPedido = (pedido: Pedido) => (pedido.contexto.messages[0]!.content as Array<{ text: string }>)[0]!.text;

/** Gera a proposta (a resposta do modelo já pronta) e devolve a mensagem com o pedido. */
async function montar(id: string, pedido = "p-esq", resposta: string = PROPOSTA): Promise<MensagemCurso> {
	respostas.push(resposta);
	acao("gerar_esqueleto", { curso: id, pedido });
	await respondeu(pedido);
	const mensagem = cursoDe(pedido);
	if (!mensagem) throw new Error(`não montou: ${JSON.stringify(erroDe(pedido))}`);
	return mensagem;
}

describe("esqueleto", () => {
	it("o prompt do perfil diz o modelo e o formato", async () => {
		const esqueleto = lerPromptMapeador(await readFile(CAMINHO_PROMPT_ESQUELETO, "utf8"));
		expect(esqueleto.modelo).toBe("openrouter/openai/gpt-6.1-sol");
		expect(esqueleto.instrucoes).toContain('"modulos"');
	});

	it("gerar_esqueleto sem o diagnóstico concluído dá erro e não chama o modelo", async () => {
		const id = await cursoNoDiagnostico();
		respostas.push(PROPOSTA);
		acao("gerar_esqueleto", { curso: id, pedido: "e1" });
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "gerar_esqueleto", materia, curso: id, pedido: "e1" });
		expect(String(erroDe("e1")!.mensagem)).toContain("Diagnóstico");
		expect(chamadas).toHaveLength(0);
		expect(await propostaNoDisco(id)).toBeUndefined();
	});

	it("gerar_esqueleto chama o modelo, tenta de novo com proposta inválida, conserta, grava e grava gerou_esqueleto", async () => {
		const id = await cursoNoEsqueleto();
		// 1 módulo só: ErroEsqueleto na leitura e a nova tentativa. Na segunda, um conceito repetido, um faltando, um de fora e horas e tipo fora do permitido.
		const umSo = JSON.stringify({ modulos: [{ nome: "Tudo", objetivo: "Tudo.", conceitos: ["c-1", "c-2", "c-3"], tipo: "normal", horas: 4 }] });
		const consertavel = JSON.stringify({
			modulos: [
				{ nome: "  A   reta ", objetivo: " Ajustar a reta. ", conceitos: ["c-1", "c-9"], tipo: "curto", horas: 2.3 },
				{ nome: "Resto", conceitos: ["c-1", "c-3"], tipo: "outro", horas: 99 },
			],
		});
		respostas.push(umSo, consertavel);
		acao("gerar_esqueleto", { curso: id, pedido: "e1" });
		await respondeu("e1");
		expect(erroDe("e1")).toBeUndefined();
		// Antes: o curso com gerandoEsqueleto, sem o pedido; no fim, sem gerandoEsqueleto, com o pedido.
		const doCurso = recebidas("curso").map((mensagem) => mensagem.dados as unknown as MensagemCurso);
		const indiceGerando = doCurso.findIndex((mensagem) => mensagem.gerandoEsqueleto === true);
		expect(indiceGerando).toBeGreaterThanOrEqual(0);
		expect(doCurso[indiceGerando]!.pedido).toBeUndefined();
		const final = cursoDe("e1")!;
		expect(final.gerandoEsqueleto).toBeUndefined();
		const esperado = [
			{ id: "m1", nome: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-1", "c-2"], tipo: "curto", horas: 2.5 },
			{ id: "m2", nome: "Resto", objetivo: "", conceitos: ["c-3"], tipo: "normal", horas: 2 },
		];
		expect(final.curso.esqueletoEmAndamento!.modulos).toEqual(esperado);
		expect(await propostaNoDisco(id)).toMatchObject({ modulos: esperado, modelo: "teste/modelo-x", custo: 0.02 });
		expect((await lerCurso(dados, materia, id)).situacao).toBe("rascunho");

		// A mensagem ao modelo: os conceitos na ordem, a prioridade, o diagnóstico, as horas e o prazo.
		expect(chamadas).toHaveLength(2);
		expect(chamadas[0]!.contexto.systemPrompt).toBe("Monte os módulos.");
		const mensagem = textoPedido(chamadas[0]!);
		expect(mensagem).toContain("Curso: P1: probabilidade");
		expect(mensagem).toContain("Horas por semana: 4");
		expect(mensagem).toContain("Prazo: 2099-11-20, daqui a");
		expect(mensagem).toContain("Tempo disponível para os módulos");
		expect(mensagem.indexOf('id="c-1"')).toBeLessThan(mensagem.indexOf('id="c-2"'));
		expect(mensagem.indexOf('id="c-2"')).toBeLessThan(mensagem.indexOf('id="c-3"'));
		expect(mensagem).toContain("Nome: Regressão linear");
		expect(mensagem).toContain("Prioridade: normal");
		expect(mensagem).toContain('Disse "Sei aplicar"');
		expect(mensagem).toContain("q1 (alternativa) certa");
		expect(mensagem).toContain("q2 (alternativa) errada");
		expect(mensagem).toContain("Questões sobre ele: nenhuma");
		// A segunda tentativa leva a resposta ruim e o motivo.
		expect(chamadas[1]!.contexto.messages).toHaveLength(3);
		expect(textoDaChamada(chamadas[1]!, 2)).toContain("1 módulo");

		const [evento] = await doVerbo("gerou_esqueleto");
		expect(evento).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: id },
			resultado: { modulos: 2, custo: 0.02 },
			contexto: { modelo: "teste/modelo-x", prompt: await promptDe("esqueleto.md") },
		});

		// Gerar de novo substitui a proposta.
		await montar(id, "e2");
		expect((await propostaNoDisco(id))!.modulos).toEqual(MODULOS_DA_PROPOSTA);
		expect(await doVerbo("gerou_esqueleto")).toHaveLength(2);
	});

	it("o modelo que falha duas vezes vira erro com o pedido, e nada é gravado", async () => {
		const id = await cursoNoEsqueleto();
		respostas.push("não é JSON", '{"modulos": []}');
		acao("gerar_esqueleto", { curso: id, pedido: "e1" });
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "gerar_esqueleto", materia, curso: id });
		expect(String(erroDe("e1")!.mensagem)).toContain("segunda tentativa");
		await esperar(() => ultimoCurso().gerandoEsqueleto === undefined);
		expect(await propostaNoDisco(id)).toBeUndefined();
		expect(await doVerbo("gerou_esqueleto")).toHaveLength(0);
	});

	/** Muda o Básico do curso no disco para um prazo daqui a `dias` dias (pelo dia de hoje de verdade, o que a extensão usa). */
	async function prazoDaquiA(id: string, dias: number, horasPorSemana = 4): Promise<void> {
		const curso = await lerCurso(dados, materia, id);
		await gravarCurso(dados, { ...curso, basico: { ...curso.basico!, prazo: somarDias(hojeLocal(), dias), horasPorSemana } });
	}

	/** Uma proposta com as horas dadas: c-1 e c-2 no primeiro módulo, c-3 no segundo. */
	const propostaCom = (primeiro: number, segundo: number) =>
		JSON.stringify({
			modulos: [
				{ nome: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-1", "c-2"], tipo: "normal", horas: primeiro },
				{ nome: "O R²", objetivo: "Interpretar o R².", conceitos: ["c-3"], tipo: "normal", horas: segundo },
			],
		});

	it("o limite de horas: a mensagem leva as horas disponíveis; acima de 1,5 vez, uma nova tentativa com a soma e o limite", async () => {
		const id = await cursoNoEsqueleto();
		// Prazo daqui a 10 dias com 4 h por semana: 8 dias de estudo, 4 × 8 / 7 = 4,57 h (cerca de 4,5); 1,5 vez = 6,86 h.
		await prazoDaquiA(id, 10);
		respostas.push(propostaCom(10, 6), propostaCom(3, 2));
		acao("gerar_esqueleto", { curso: id, pedido: "l1" });
		await respondeu("l1");
		expect(erroDe("l1")).toBeUndefined();
		expect(chamadas).toHaveLength(2);
		const primeira = textoPedido(chamadas[0]!);
		expect(primeira).toContain("Tempo disponível para os módulos: cerca de 4,5 h (4 h por semana × 8 dias).");
		expect(primeira).toContain("Este tempo é o limite");
		// A nova tentativa leva a resposta e o pedido com a soma e o limite.
		expect(chamadas[1]!.contexto.messages).toHaveLength(3);
		const pedido = textoDaChamada(chamadas[1]!, 2);
		expect(pedido).toContain("A soma das horas dos módulos deu 16 h, mas o limite até o prazo é de cerca de 4,5 h (4 h por semana × 8 dias).");
		expect(pedido).toContain("menos módulos e mais curtos");
		expect((await propostaNoDisco(id))!.modulos.map((modulo) => modulo.horas)).toEqual([3, 2]);
	});

	it("o limite de horas pede de novo uma vez só: a segunda proposta acima do limite é aceita", async () => {
		const id = await cursoNoEsqueleto();
		await prazoDaquiA(id, 10);
		respostas.push(propostaCom(10, 6), propostaCom(8, 4));
		acao("gerar_esqueleto", { curso: id, pedido: "l2" });
		await respondeu("l2");
		expect(erroDe("l2")).toBeUndefined();
		expect(chamadas).toHaveLength(2);
		expect((await propostaNoDisco(id))!.modulos.map((modulo) => modulo.horas)).toEqual([8, 4]);
	});

	it("dentro de 1,5 vez o limite, ou sem prazo, não há nova tentativa", async () => {
		const id = await cursoNoEsqueleto();
		await prazoDaquiA(id, 10);
		// 6,5 h ≤ 6,86 h.
		await montar(id, "l3", propostaCom(4, 2.5));
		expect(chamadas).toHaveLength(1);
		const curso = await lerCurso(dados, materia, id);
		await gravarCurso(dados, { ...curso, basico: { ...curso.basico!, prazo: null } });
		await montar(id, "l4", propostaCom(30, 20));
		expect(chamadas).toHaveLength(2);
		expect(textoPedido(chamadas[1]!)).toContain("Prazo: sem prazo");
	});

	it("pedidoDoLimite: a frase só acima de 1,5 vez as horas disponíveis, e nada sem prazo ou sem dia de estudo", () => {
		const hoje = "2026-10-26";
		const basico = { prazo: "2026-11-05", horasPorSemana: 4 };
		// 8 dias de estudo: 4,57 h; 1,5 vez = 6,86 h.
		expect(pedidoDoLimite([{ horas: 4 }, { horas: 2.5 }], basico, hoje)).toBeUndefined();
		expect(pedidoDoLimite([{ horas: 4 }, { horas: 3 }], basico, hoje)).toContain("deu 7 h, mas o limite até o prazo é de cerca de 4,5 h (4 h por semana × 8 dias)");
		expect(pedidoDoLimite([{ horas: 32.5 }], basico, hoje)).toContain("deu 32,5 h");
		expect(pedidoDoLimite([{ horas: 40 }], { prazo: null, horasPorSemana: 4 }, hoje)).toBeUndefined();
		expect(pedidoDoLimite([{ horas: 40 }], { prazo: "2026-10-28", horasPorSemana: 4 }, hoje)).toBeUndefined();
	});

	it("gerar com outro em andamento no mesmo curso dá erro; abrir mostra gerandoEsqueleto; criar_curso espera", async () => {
		const id = await cursoNoEsqueleto();
		await montar(id, "e0");
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar_esqueleto", { curso: id, pedido: "e1" });
		await esperar(() => chamadas.length === 2);
		acao("gerar_esqueleto", { curso: id, pedido: "e2" });
		await respondeu("e2");
		expect(String(erroDe("e2")!.mensagem)).toContain("já está sendo montado");
		acao("abrir", { curso: id });
		await esperar(() => ultimoCurso().gerandoEsqueleto === true && ultimoCurso().pedido === undefined);
		acao("criar_curso", { curso: id, pedido: "c1" });
		await respondeu("c1");
		expect(erroDe("c1")).toMatchObject({ ao: "criar_curso", curso: id });
		expect((await lerCurso(dados, materia, id)).situacao).toBe("rascunho");
		adiado.soltar(JSON.stringify({ modulos: [{ nome: "Um", conceitos: ["c-1"], tipo: "normal", horas: 1 }, { nome: "Dois", conceitos: ["c-2", "c-3"], tipo: "normal", horas: 1 }] }));
		await respondeu("e1");
		expect(cursoDe("e1")!.curso.esqueletoEmAndamento!.modulos.map((modulo) => modulo.nome)).toEqual(["Um", "Dois"]);
		expect(chamadas).toHaveLength(2);
	});

	it("depois de session_shutdown a montagem em andamento para sem gravar", async () => {
		const id = await cursoNoEsqueleto();
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar_esqueleto", { curso: id, pedido: "e1" });
		await esperar(() => chamadas.length === 1);
		tratadores.session_shutdown?.({}, ctx);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(comPedido("e1")).toHaveLength(0);
		expect(await propostaNoDisco(id)).toBeUndefined();
	});

	it("editar_esqueleto grava a proposta válida e recusa a inválida sem mudar nada", async () => {
		const id = await cursoNoEsqueleto();
		acao("editar_esqueleto", { curso: id, pedido: "s0", modulos: MODULOS_DA_PROPOSTA });
		await respondeu("s0");
		expect(String(erroDe("s0")!.mensagem)).toContain("Monte o esqueleto");
		await montar(id);
		const editados = [
			{ ...MODULOS_DA_PROPOSTA[0]!, nome: " Reta e resíduo ", conceitos: ["c-2", "c-1"], horas: 4.5 },
			{ ...MODULOS_DA_PROPOSTA[1]!, tipo: "revisao" },
		];
		acao("editar_esqueleto", { curso: id, pedido: "s1", modulos: editados });
		await respondeu("s1");
		expect(erroDe("s1")).toBeUndefined();
		const gravado = await propostaNoDisco(id);
		expect(gravado!.modulos).toEqual([
			{ id: "m1", nome: "Reta e resíduo", objetivo: "Ajustar a reta.", conceitos: ["c-2", "c-1"], tipo: "curto", horas: 4.5 },
			{ id: "m2", nome: "O R²", objetivo: "Interpretar o R².", conceitos: ["c-3"], tipo: "revisao", horas: 2 },
		]);
		expect(gravado).toMatchObject({ modelo: "teste/modelo-x", custo: 0.01 });
		expect(cursoDe("s1")!.curso.esqueletoEmAndamento!.modulos).toEqual(gravado!.modulos);
		// Um conceito faltando: erro, e nada muda.
		acao("editar_esqueleto", { curso: id, pedido: "s2", modulos: [MODULOS_DA_PROPOSTA[0]] });
		await respondeu("s2");
		expect(erroDe("s2")).toMatchObject({ ao: "editar_esqueleto", materia, curso: id });
		expect(String(erroDe("s2")!.mensagem)).toContain("sem módulo");
		expect((await propostaNoDisco(id))!.modulos).toEqual(gravado!.modulos);
		// Editar não grava evento.
		expect(await doVerbo("gerou_esqueleto")).toHaveLength(1);
	});

	it("criar_curso deixa o curso pronto com o calendário, grava criou_curso e manda a lista; depois, mudar o curso dá erro", async () => {
		const id = await cursoNoEsqueleto();
		acao("criar_curso", { curso: id, pedido: "c0" });
		await respondeu("c0");
		expect(String(erroDe("c0")!.mensagem)).toContain("Monte o esqueleto");
		await montar(id);
		const antes = listas().length;
		acao("criar_curso", { curso: id, pedido: "c1" });
		await respondeu("c1");
		await esperar(() => listas().length > antes);
		const criado = cursoDe("c1")!.curso;
		expect(criado).toMatchObject({ situacao: "pronto", etapa: "esqueleto", esqueleto: { modulos: MODULOS_DA_PROPOSTA, modelo: "teste/modelo-x", custo: 0.01 } });
		expect(criado.esqueletoEmAndamento).toBeUndefined();
		const calendario = criado.esqueleto!.calendario;
		expect(calendario.modulos.map((modulo) => modulo.id)).toEqual(["m1", "m2"]);
		// 3 h e 2 h com 4 h por semana: 6 e 4 dias seguidos.
		const dia = (data: string) => Math.round(new Date(`${data}T00:00:00Z`).getTime() / 86_400_000);
		expect(dia(calendario.modulos[0]!.fim) - dia(calendario.modulos[0]!.inicio) + 1).toBe(6);
		expect(dia(calendario.modulos[1]!.inicio)).toBe(dia(calendario.modulos[0]!.fim) + 1);
		expect(dia(calendario.modulos[1]!.fim) - dia(calendario.modulos[1]!.inicio) + 1).toBe(4);
		expect(calendario.avaliacaoGeral).toBe("2099-11-19");
		expect(await lerCurso(dados, materia, id)).toEqual(criado);
		expect(listas().at(-1)!.cursos[0]).toMatchObject({ id, situacao: "pronto" });
		const [evento] = await doVerbo("criou_curso");
		expect(evento).toMatchObject({ sessao: "sessao-1", objeto: { materia, curso: id }, resultado: { nome: "P1: probabilidade", modulos: 2, prazo: "2099-11-20", avaliacaoGeral: "2099-11-19" } });

		// Pronto: confirmar uma etapa, gerar, editar ou criar de novo dão erro, e nada muda.
		await confirmar(id, "basico", { ...BASICO, horasPorSemana: 8 }, "d1");
		expect(erroDe("d1")).toMatchObject({ ao: "confirmar", curso: id });
		expect(String(erroDe("d1")!.mensagem)).toContain("já foi criado");
		await confirmar(id, "esqueleto", criado.esqueleto, "d2");
		expect(erroDe("d2")).toMatchObject({ ao: "confirmar", curso: id });
		respostas.push(PROPOSTA);
		acao("gerar_esqueleto", { curso: id, pedido: "d3" });
		await respondeu("d3");
		expect(String(erroDe("d3")!.mensagem)).toContain("já foi criado");
		acao("editar_esqueleto", { curso: id, pedido: "d4", modulos: MODULOS_DA_PROPOSTA });
		await respondeu("d4");
		expect(String(erroDe("d4")!.mensagem)).toContain("já foi criado");
		acao("criar_curso", { curso: id, pedido: "d5" });
		await respondeu("d5");
		expect(String(erroDe("d5")!.mensagem)).toContain("já foi criado");
		expect(await lerCurso(dados, materia, id)).toEqual(criado);
		expect(await doVerbo("criou_curso")).toHaveLength(1);
		expect(chamadas).toHaveLength(1);
	});

	it("recalcular_calendario: só no curso pronto; grava o calendário de hoje, manda o curso com o pedido e grava recalculou_calendario", async () => {
		const id = await cursoNoEsqueleto();
		await montar(id);
		acao("recalcular_calendario", { curso: id, pedido: "r0" });
		await respondeu("r0");
		expect(erroDe("r0")).toMatchObject({ ao: "recalcular_calendario", materia, curso: id, mensagem: "Só um curso criado tem calendário para recalcular." });
		acao("criar_curso", { curso: id, pedido: "c1" });
		await respondeu("c1");
		const criado = cursoDe("c1")!.curso;
		// O prazo mudou no disco (como se fosse outro dia): o calendário recalculado segue o prazo de agora.
		await prazoDaquiA(id, 10);
		acao("recalcular_calendario", { curso: id, pedido: "r1" });
		await respondeu("r1");
		expect(erroDe("r1")).toBeUndefined();
		const novo = cursoDe("r1")!.curso;
		const geral = somarDias(hojeLocal(), 9);
		expect(novo.esqueleto!.modulos).toEqual(criado.esqueleto!.modulos);
		expect(novo.esqueleto!.calendario.avaliacaoGeral).toBe(geral);
		expect(novo.esqueleto!.calendario.modulos.every((item) => item.fim < geral && item.avaliacao <= geral)).toBe(true);
		expect(await lerCurso(dados, materia, id)).toEqual(novo);
		const [evento] = await doVerbo("recalculou_calendario");
		expect(evento).toMatchObject({ sessao: "sessao-1", objeto: { materia, curso: id }, resultado: { avaliacaoGeral: geral, avisos: novo.esqueleto!.calendario.avisos } });
		// 3 h e 2 h (6 e 4 dias) não cabem nos 8 dias de estudo: frações, e o aviso (5 × 7 / 8 = 4,375 → 4,5 h por semana).
		expect(novo.esqueleto!.calendario.avisos).toEqual(["Até " + `${geral.slice(8, 10)}/${geral.slice(5, 7)}` + " (8 dias), este plano pede cerca de 0,6 h por dia (4,5 h por semana); você disse 4 h por semana."]);
	});

	it("confirmar o esqueleto pela ação confirmar dá erro: ele vem por criar_curso", async () => {
		const id = await cursoNoEsqueleto();
		await montar(id);
		const proposta = (await propostaNoDisco(id))!;
		await confirmar(id, "esqueleto", { ...proposta, calendario: { modulos: [], avaliacaoGeral: "2099-11-19", avisos: [] } }, "x1");
		expect(String(erroDe("x1")!.mensagem)).toContain("Criar curso");
		expect((await lerCurso(dados, materia, id)).situacao).toBe("rascunho");
	});

	it("ler_curso mostra a proposta com o calendário de hoje e, pronto, o esqueleto com o calendário gravado", async () => {
		const id = await cursoNoEsqueleto();
		const semProposta = (await ferramentas.ler_curso!.execute("1", { materia, curso: id }, undefined, undefined, ctx)).content[0]!.text;
		expect(semProposta).toContain("## Esqueleto\n(ainda não montado)");
		await montar(id);
		const proposta = (await ferramentas.ler_curso!.execute("2", { materia, curso: id }, undefined, undefined, ctx)).content[0]!.text;
		expect(proposta).toContain("Proposta em edição");
		expect(proposta).toContain("O calendário é o de hoje");
		expect(proposta).toContain("1. A reta (m1; Curto; 3 h): Ajustar a reta.");
		expect(proposta).toContain("   Conceitos: Regressão linear, Resíduo.");
		expect(proposta).toContain("2. O R² (m2; Normal; 2 h): Interpretar o R².");
		expect(proposta).toMatch(/ {3}De \d{4}-\d{2}-\d{2} a \d{4}-\d{2}-\d{2}; avaliação do módulo em \d{4}-\d{2}-\d{2}\./);
		expect(proposta).toContain("Total: 5 h em 2 módulos.");
		expect(proposta).toContain("Avaliação geral: 2099-11-19.");
		expect(proposta).toContain("Falta confirmar: Esqueleto.");

		acao("criar_curso", { curso: id, pedido: "c1" });
		await respondeu("c1");
		const calendario = cursoDe("c1")!.curso.esqueleto!.calendario;
		const pronto = (await ferramentas.ler_curso!.execute("3", { materia, curso: id }, undefined, undefined, ctx)).content[0]!.text;
		expect(pronto).toContain("Situação: pronto.");
		expect(pronto).toContain("o calendário é o da criação");
		expect(pronto).toContain(`   De ${calendario.modulos[1]!.inicio} a ${calendario.modulos[1]!.fim}; avaliação do módulo em ${calendario.modulos[1]!.avaliacao}.`);
		expect(pronto).toContain("Todas as etapas estão confirmadas.");
	});

	it("linhaDoPrazo faz as contas do calendário: sem prazo, prazo passado ou perto, e o tempo disponível", () => {
		expect(linhaDoPrazo({ prazo: null, horasPorSemana: 4 }, "2026-10-26")).toContain("sem prazo");
		expect(linhaDoPrazo({ prazo: "2026-10-20", horasPorSemana: 4 }, "2026-10-26")).toContain("já passou");
		expect(linhaDoPrazo({ prazo: "2026-10-27", horasPorSemana: 4 }, "2026-10-26")).toContain("é amanhã");
		expect(linhaDoPrazo({ prazo: "2026-10-28", horasPorSemana: 4 }, "2026-10-26")).toContain("não sobra dia");
		// 28 dias até o prazo: os módulos têm 26 (de amanhã até a véspera da avaliação geral); 4 × 26 / 7 = 14,86, cerca de 15 h.
		const linha = linhaDoPrazo({ prazo: "2026-11-23", horasPorSemana: 4 }, "2026-10-26");
		expect(linha).toContain("daqui a 28 dias");
		expect(linha).toContain("26 dias");
		expect(linha).toContain("cerca de 15 h (4 h por semana × 26 dias)");
	});
});
