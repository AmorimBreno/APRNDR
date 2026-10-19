// Testes da extensão de notas sem o pi: um "pi" falso com um barramento
// síncrono (como o pi.events), o pi.on e o registerTool, numa pasta de dados
// temporária com uma matéria. O caderno é simulado mandando "interface:acao".

import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerEventos } from "../lib/eventos.ts";
import { criarMateria, eventosMateria } from "../lib/materias.ts";
import { arquivoNota, criarNota, versaoDe } from "../lib/notas.ts";
import notas, { materiaDaConversa } from "./notas.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] } };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, unknown>; gravar?: boolean };

let dados = "";
let materia = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
let aoIniciar: ((evento: unknown, ctx: Contexto) => void) | undefined;
let mostrados: Mostrado[];
let entradas: Entrada[];
let ctx: Contexto;

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-notas-"));
	materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
	entradas = [];
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas } };
	barramento = new EventEmitter();
	ferramentas = {};
	aoIniciar = undefined;
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
	const pi = {
		events: {
			on: (canal: string, ouvinte: (dados: unknown) => void) => {
				barramento.on(canal, ouvinte);
				return () => barramento.off(canal, ouvinte);
			},
			emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
		},
		on: (evento: string, tratador: (evento: unknown, ctx: Contexto) => void) => {
			if (evento === "session_start") aoIniciar = tratador;
		},
		registerTool: (definicao: Ferramenta & { name: string }) => (ferramentas[definicao.name] = definicao),
	} as unknown as ExtensionAPI;
	notas(pi);
	aoIniciar?.({}, ctx);
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

/** Espera até `condicao` valer (os tratadores da ponte são assíncronos). */
async function esperar(condicao: () => boolean): Promise<void> {
	for (let tentativa = 0; tentativa < 200 && !condicao(); tentativa++) await new Promise((resolver) => setTimeout(resolver, 5));
	if (!condicao()) throw new Error("não aconteceu");
}

const acao = (acao: string, dadosAcao: Record<string, unknown>) => barramento.emit("interface:acao", { painel: "notas", acao, dados: { materia, ...dadosAcao } });
const recebidas = (nome: string) => mostrados.filter((mensagem) => mensagem.acao === nome);
const verbos = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.map((evento) => evento.verbo);

describe("ponte das notas", () => {
	it("ignora outros painéis e manda tudo passageiro", async () => {
		barramento.emit("interface:acao", { painel: "cadernos", acao: "listar", dados: { materia } });
		acao("listar", {});
		await esperar(() => mostrados.length > 0);
		expect(mostrados).toEqual([{ painel: "notas", acao: "lista", dados: { materia, notas: [] }, gravar: false }]);
	});

	it("cria: avisa a criada e manda a lista; título ruim vira erro do criar", async () => {
		acao("criar", { titulo: "Limites" });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("criada")[0]!.dados).toEqual({ materia, titulo: "Limites" });
		acao("criar", { titulo: "a/b" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "criar", materia, titulo: "a/b" });
	});

	it("abre a nota com o conteúdo e a versão", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "# Limites\n", "utf8");
		acao("abrir", { titulo: "limites" });
		await esperar(() => recebidas("nota").length > 0);
		expect(recebidas("nota")[0]!.dados).toMatchObject({ materia, titulo: "Limites", conteudo: "# Limites\n", versao: versaoDe("# Limites\n") });
	});

	it("salva em fila, devolve o pedido e grava editou_nota uma vez por edicao", async () => {
		await criarNota(dados, materia, "Limites");
		acao("salvar", { titulo: "Limites", conteudo: "um", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		await esperar(() => recebidas("salva").length === 1);
		const primeira = recebidas("salva")[0]!.dados;
		expect(primeira).toMatchObject({ materia, titulo: "Limites", versao: versaoDe("um\n"), pedido: "p1" });
		acao("salvar", { titulo: "Limites", conteudo: "dois", versao: primeira.versao, edicao: "e1", pedido: "p2" });
		await esperar(() => recebidas("salva").length === 2);
		acao("salvar", { titulo: "Limites", conteudo: "três", versao: versaoDe("dois\n"), edicao: "e2", pedido: "p3" });
		await esperar(() => recebidas("salva").length === 3);
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("três\n");
		expect((await verbos()).filter((verbo) => verbo === "editou_nota")).toHaveLength(2);
	});

	it("conflito quando o arquivo mudou fora; forcar grava por cima", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "de fora\n", "utf8");
		acao("salvar", { titulo: "Limites", conteudo: "meu", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		await esperar(() => recebidas("conflito").length > 0);
		expect(recebidas("conflito")[0]!.dados).toMatchObject({ materia, titulo: "Limites", versaoAtual: versaoDe("de fora\n"), pedido: "p1" });
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("de fora\n");
		acao("salvar", { titulo: "Limites", conteudo: "meu", forcar: true, edicao: "e1", pedido: "p2" });
		await esperar(() => recebidas("salva").length > 0);
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("meu\n");
	});

	it("a lista pedida logo depois de salvar espera o salvamento", async () => {
		await criarNota(dados, materia, "Limites");
		acao("salvar", { titulo: "Limites", conteudo: "texto novo", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		acao("listar", {});
		await esperar(() => recebidas("lista").length > 0);
		expect((recebidas("lista")[0]!.dados as { notas: Array<{ previa: string }> }).notas[0]!.previa).toBe("texto novo");
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["salva", "lista"]);
	});

	it("uma cópia sem sessão no mesmo barramento (a carga a mais ao recarregar) fica calada", async () => {
		const copia = {
			events: {
				on: (canal: string, ouvinte: (dados: unknown) => void) => {
					barramento.on(canal, ouvinte);
					return () => barramento.off(canal, ouvinte);
				},
				emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
			},
			on: () => undefined,
			registerTool: () => undefined,
		} as unknown as ExtensionAPI;
		notas(copia);
		await criarNota(dados, materia, "Limites");
		acao("salvar", { titulo: "Limites", conteudo: "um", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		await esperar(() => recebidas("salva").length > 0);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["salva"]);
	});

	it("renomeia, avisa e manda a lista", async () => {
		await criarNota(dados, materia, "Limites");
		acao("renomear", { de: "Limites", para: "Limites laterais" });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("renomeada")[0]!.dados).toEqual({ materia, de: "Limites", para: "Limites laterais" });
		expect((recebidas("lista")[0]!.dados as { notas: Array<{ titulo: string }> }).notas.map((nota) => nota.titulo)).toEqual(["Limites laterais"]);
	});
});

describe("ferramentas do professor", () => {
	const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });

	it("acha a matéria da conversa pelo último contexto gravado", () => {
		expect(materiaDaConversa([])).toBeUndefined();
		expect(materiaDaConversa([contextoDe("materia:a"), { type: "message" }, contextoDe("materia:b")])).toBe("b");
		expect(materiaDaConversa([contextoDe("materia:a"), contextoDe("outra:c")])).toBeUndefined();
	});

	it("na conversa geral, pede a matéria; com ela, lista e lê", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "# Limites\n\nε e δ\n", "utf8");
		const semMateria = await ferramentas.listar_notas!.execute("1", {}, undefined, undefined, ctx);
		expect(semMateria.isError).toBe(true);
		const lista = await ferramentas.listar_notas!.execute("2", { materia }, undefined, undefined, ctx);
		expect(lista.content[0]!.text).toContain("- Limites");
		const lida = await ferramentas.ler_nota!.execute("3", { materia, titulo: "Limites" }, undefined, undefined, ctx);
		expect(lida.content[0]!.text).toContain("ε e δ");
		expect(lida.isError).toBeUndefined();
	});

	it("na conversa do caderno, fica na matéria dela e não lê outra", async () => {
		await criarNota(dados, materia, "Limites");
		entradas = [contextoDe(`materia:${materia}`)];
		const lista = await ferramentas.listar_notas!.execute("1", {}, undefined, undefined, ctx);
		expect(lista.content[0]!.text).toContain("- Limites");
		const outra = await ferramentas.ler_nota!.execute("2", { materia: "fisica", titulo: "Limites" }, undefined, undefined, ctx);
		expect(outra.isError).toBe(true);
		const inexistente = await ferramentas.ler_nota!.execute("3", { titulo: "Nada" }, undefined, undefined, ctx);
		expect(inexistente).toMatchObject({ isError: true, content: [{ text: 'Não achei a nota "Nada".' }] });
	});
});
