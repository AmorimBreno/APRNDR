// Testes da extensão dos cursos sem o pi: um "pi" falso com um barramento
// síncrono (como o pi.events), o pi.on e o registerTool, numa pasta de dados
// temporária com uma matéria, um .extraido de mentira e um mapa gravado à mão.
// A tela é simulada mandando "interface:acao".

import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Curso, MensagemCurso, MensagemListaCursos } from "../lib/curso-tipos.ts";
import { lerCurso, pastaDoCurso } from "../lib/cursos.ts";
import { lerEventos } from "../lib/eventos.ts";
import { gravarMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "../lib/mapa.ts";
import { criarMateria, eventosMateria } from "../lib/materias.ts";
import cursos, { textoDoCurso } from "./cursos.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] } };
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
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas } };
	barramento = new EventEmitter();
	ferramentas = {};
	tratadores = {};
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
	cursos(piFalso());
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

	it("abrir manda o curso; um curso que não existe vira erro", async () => {
		const curso = await comecar();
		acao("abrir", { curso: curso.id });
		await esperar(() => recebidas("curso").length > 1);
		expect(recebidas("curso")[1]!.dados).toEqual({ materia, curso });
		acao("abrir", { curso: "nao-existe" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "abrir", materia, curso: "nao-existe" });
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
		cursos(piFalso(false));
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
