// Testes da extensão do aprendiz sem o pi: um "pi" falso com um barramento síncrono (como o pi.events) e o
// pi.on, numa pasta de dados temporária e numa pasta de cache temporária. A tela é simulada mandando
// "interface:acao".

import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acrescentarEvento } from "../lib/eventos.ts";
import { arquivoMateria, eventosAprendiz } from "../lib/materias.ts";
import aprendizPadrao, { montarAprendiz } from "./aprendiz.ts";

type Contexto = { cwd: string; sessionManager: { getSessionId(): string } };
type Mostrado = { painel: string; acao: string; dados: Record<string, any>; gravar?: boolean };

let dados = "";
let cache = "";
let barramento: EventEmitter;
let aoIniciar: ((evento: unknown, ctx: Contexto) => void) | undefined;
let mostrados: Mostrado[];
let ctx: Contexto;

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
			if (evento === "session_start") aoIniciar = tratador;
		},
	} as unknown as ExtensionAPI;
}

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-aprendiz-"));
	cache = await mkdtemp(join(tmpdir(), "estudos-ext-aprendiz-cache-"));
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1" } };
	barramento = new EventEmitter();
	aoIniciar = undefined;
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
	await rm(cache, { recursive: true, force: true });
});

async function esperar(condicao: () => boolean): Promise<void> {
	for (let tentativa = 0; tentativa < 200 && !condicao(); tentativa++) await new Promise((resolver) => setTimeout(resolver, 5));
	if (!condicao()) throw new Error("não aconteceu");
}

const pedir = (dadosAcao: Record<string, unknown> = {}, painel = "aprendiz", acao = "indicadores") => barramento.emit("interface:acao", { painel, acao, dados: dadosAcao });

async function criarMateria(id: string): Promise<void> {
	await mkdir(dirname(arquivoMateria(dados, id)), { recursive: true });
	await writeFile(arquivoMateria(dados, id), JSON.stringify({ id, nome: id, cor: "moss", glifo: "学", provas: [], criadaEm: "2026-10-01T00:00:00.000Z" }));
}

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

describe("ponte do aprendiz", () => {
	it("responde indicadores com interface:mostrar passageiro (gravar: false), no painel aprendiz", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		montarAprendiz(criarPi(), { pastaCache: cache });
		aoIniciar?.({}, ctx);
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados).toHaveLength(1);
		const resposta = mostrados[0]!;
		expect(resposta).toMatchObject({ painel: "aprendiz", acao: "indicadores", gravar: false });
		expect(resposta.dados.indicadores.ultimoEvento).toBe("e1");
		expect(resposta.dados.indicadores.conceitos).toHaveLength(1);
		expect(resposta.dados.indicadores.conceitos[0]).toMatchObject({ conceito: "c1", materia: "mat", observacoes: 1 });
		// o cache foi para a pasta de cache temporária
		expect(await readdir(cache)).toContain("indicadores.json");
	});

	it("repete o pedido (a tela abre de novo) e devolve o mesmo do cache; ecoa o pedido se vier", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		montarAprendiz(criarPi(), { pastaCache: cache });
		aoIniciar?.({}, ctx);
		pedir({ pedido: "p1" });
		await esperar(() => mostrados.length === 1);
		pedir();
		await esperar(() => mostrados.length === 2);
		expect(mostrados[0]!.dados.pedido).toBe("p1");
		expect(mostrados[1]!.dados).not.toHaveProperty("pedido");
		expect(mostrados[1]!.dados.indicadores).toEqual(mostrados[0]!.dados.indicadores);
	});

	it("sem eventos nem matérias responde vazio, sem erro", async () => {
		montarAprendiz(criarPi(), { pastaCache: cache });
		aoIniciar?.({}, ctx);
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]!.acao).toBe("indicadores");
		expect(mostrados[0]!.dados.indicadores.conceitos).toEqual([]);
	});

	it("responde erro ({ mensagem }, gravar: false) quando o cálculo falha", async () => {
		// eventos.jsonl é uma pasta: a leitura falha com EISDIR
		await mkdir(eventosAprendiz(dados), { recursive: true });
		montarAprendiz(criarPi(), { pastaCache: cache });
		aoIniciar?.({}, ctx);
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]).toMatchObject({ painel: "aprendiz", acao: "erro", gravar: false });
		expect(mostrados[0]!.dados.mensagem).toMatch(/indicadores do aprendiz/);
	});

	it("fica calada sem session_start, ignora outros painéis e outras ações", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		montarAprendiz(criarPi(), { pastaCache: cache });
		pedir(); // sem session_start
		await new Promise((resolver) => setTimeout(resolver, 50));
		expect(mostrados).toEqual([]);
		aoIniciar?.({}, ctx);
		pedir({}, "agenda");
		pedir({}, "aprendiz", "outra");
		await new Promise((resolver) => setTimeout(resolver, 50));
		expect(mostrados).toEqual([]);
		pedir();
		await esperar(() => mostrados.length > 0);
		expect(mostrados).toHaveLength(1);
	});

	it("uma fila só: pedidos em rajada são atendidos um de cada vez, na ordem, e um que falha não trava os seguintes", async () => {
		await criarMateria("mat");
		await gravarAcerto("e1");
		montarAprendiz(criarPi(), { pastaCache: cache });
		aoIniciar?.({}, ctx);
		for (const pedido of ["a", "b", "c", "d"]) pedir({ pedido });
		await esperar(() => mostrados.length === 4);
		expect(mostrados.map((mensagem) => mensagem.dados.pedido)).toEqual(["a", "b", "c", "d"]);
		expect(mostrados.every((mensagem) => mensagem.acao === "indicadores")).toBe(true);

		// agora quebra a leitura, pede, e conserta: o pedido seguinte volta a funcionar
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

	it("a exportação padrão monta a ponte (o pi chama a fábrica só com o pi)", () => {
		aprendizPadrao(criarPi());
		expect(barramento.listenerCount("interface:acao")).toBe(1);
		expect(aoIniciar).toBeTypeOf("function");
	});
});
