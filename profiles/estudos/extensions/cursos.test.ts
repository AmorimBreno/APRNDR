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
import { lerCurso, pastaDoCurso } from "../lib/cursos.ts";
import { lerEventos } from "../lib/eventos.ts";
import { gravarMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "../lib/mapa.ts";
import { criarMateria, eventosAprendiz, eventosMateria } from "../lib/materias.ts";
import cursos, { CAMINHO_PROMPT_CORRETOR, CAMINHO_PROMPT_DIAGNOSTICO, hashDoPrompt, textoDoCurso } from "./cursos.ts";
import { lerPromptMapeador } from "./mapa.ts";

/** Os prompts de mentira, na pasta de dados do teste (com o nome dos de verdade). */
const opcoesDeTeste = () => ({ caminhoPromptDiagnostico: join(dados, "diagnostico.md"), caminhoPromptCorretor: join(dados, "corretor.md") });

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

/** Espera até `condicao` valer (os tratadores são assíncronos). */
async function esperar(condicao: () => boolean | Promise<boolean>): Promise<void> {
	for (let tentativa = 0; tentativa < 400; tentativa++) {
		if (await condicao()) return;
		await new Promise((resolver) => setTimeout(resolver, 5));
	}
	throw new Error("não aconteceu");
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
		expect(eventos[0]).toMatchObject({ sessao: "sessao-1", objeto: { materia, curso: id }, contexto: { fase: "diagnostico", prompt: await promptDe("diagnostico.md") } });
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
		expect(chamadas[0]!.contexto.systemPrompt).toBe("Gere as questões.");
		expect(chamadas[0]!.opcoes.temperature).toBeUndefined();
		const mensagem = textoDaChamada(chamadas[0]!);
		expect(mensagem).toContain("Regressão linear ajusta uma reta aos dados.");
		expect(mensagem).toContain("O resíduo é o observado menos o previsto.");
		expect(mensagem).toContain("Sei aplicar");
		expect(mensagem).toContain("nenhum trecho do material cita este conceito");
		expect(mensagem).toContain("dissertativa sobre c-1");
		// A segunda tentativa leva a resposta ruim e o motivo.
		expect(chamadas[1]!.contexto.messages).toHaveLength(3);
		expect(textoDaChamada(chamadas[1]!, 2)).toContain("não veio como o pedido");

		const [evento] = await doVerbo("gerou_diagnostico");
		expect(evento).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: id },
			resultado: { questoes: 4, custo: 0.02 },
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptDe("diagnostico.md") },
		});
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
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptDe("diagnostico.md") },
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
		await esperar(async () => "correcao" in ((await emAndamento(id)).respostas.q4 ?? {}));
		await esperar(() => ultimoCurso().corrigindo === undefined);
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
		expect(corretor.contexto.systemPrompt).toBe("Corrija pela rubrica.");
		expect(corretor.opcoes.temperature).toBe(0);
		expect(textoDaChamada(corretor)).toContain(TEXTO);
		expect(textoDaChamada(corretor)).toContain("Mínimos quadrados");
		const [evento] = await doAprendiz("respondeu_dissertativa");
		expect(evento).toMatchObject({
			objeto: { materia, curso: id, conceitos: ["c-1"], questao: "q4" },
			resultado: { confianca: 2, tempoMs: 180000, total: 2.5, max: 5, texto: TEXTO, criterios: [{ criterio: "Reta", pontos: 2, max: 2 }, {}, {}] },
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptDe("corretor.md") },
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
			contexto: { fase: "diagnostico", modelo: "teste/modelo-x", prompt: await promptDe("diagnostico.md") },
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
