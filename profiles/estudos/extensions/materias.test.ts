// Testes da extensão de matérias sem o pi: um "pi" falso com um barramento
// síncrono (como o pi.events), o pi.on e o registerTool, numa pasta de dados
// temporária. A tela de cadernos é simulada mandando "interface:acao".

import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eventosMateria } from "../lib/materias.ts";
import materias from "./materias.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string } };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, unknown>; gravar?: boolean };

let dados = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
let aoIniciar: ((evento: unknown, ctx: Contexto) => void) | undefined;
let mostrados: Mostrado[];
let ctx: Contexto;

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-materias-"));
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1" } };
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
	materias(pi);
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

/** Espera até `condicao` valer (os tratadores da ponte são assíncronos). */
async function esperar(condicao: () => boolean): Promise<void> {
	for (let tentativa = 0; tentativa < 100 && !condicao(); tentativa++) await new Promise((resolver) => setTimeout(resolver, 5));
	if (!condicao()) throw new Error("não aconteceu");
}

const acao = (acao: string, dadosAcao?: unknown) => barramento.emit("interface:acao", { painel: "cadernos", acao, dados: dadosAcao });

describe("extensão de matérias", () => {
	it("a tela pede a lista e recebe um mostrar passageiro", async () => {
		aoIniciar?.({}, ctx);
		acao("listar");
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]).toEqual({ painel: "cadernos", acao: "lista", dados: { materias: [], erros: [] }, gravar: false });
	});

	it("a tela cria: avisa a criada, manda a lista nova e grava o evento com a sessão", async () => {
		aoIniciar?.({}, ctx);
		acao("criar", { nome: "Cálculo I", cor: "amber", glifo: "解", provas: [{ nome: "P1", data: "2026-11-20" }] });
		await esperar(() => mostrados.some((mensagem) => mensagem.acao === "lista"));
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["criada", "lista"]);
		expect(mostrados[0]!.dados).toEqual({ id: "calculo-i" });
		const lista = mostrados[1]!.dados as { materias: Array<{ id: string; cor: string }> };
		expect(lista.materias).toMatchObject([{ id: "calculo-i", cor: "amber" }]);
		const [evento] = (await readFile(eventosMateria(dados, "calculo-i"), "utf8")).split("\n").filter(Boolean).map((linha) => JSON.parse(linha));
		expect(evento).toMatchObject({ verbo: "criou_materia", sessao: "sessao-1" });
	});

	it("criar com dados inválidos devolve o erro para o modal", async () => {
		aoIniciar?.({}, ctx);
		acao("criar", { nome: "  " });
		await esperar(() => mostrados.length > 0);
		expect(mostrados).toEqual([{ painel: "cadernos", acao: "erro", dados: { mensagem: "Escreva o nome da matéria.", ao: "criar" }, gravar: false }]);
	});

	it("pasta de dados fora do ar vira erro na tela", async () => {
		aoIniciar?.({}, { ...ctx, cwd: join(dados, "nao-existe") });
		acao("listar");
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]).toMatchObject({ acao: "erro", dados: { mensagem: expect.stringMatching(/Google Drive/) } });
	});

	it("ignora ações de outros painéis", async () => {
		aoIniciar?.({}, ctx);
		barramento.emit("interface:acao", { painel: "quiz", acao: "listar" });
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toEqual([]);
	});

	it("abrir manda a matéria e os eventos; alterar grava, avisa e manda a lista e o caderno de novo", async () => {
		aoIniciar?.({}, ctx);
		acao("criar", { nome: "Física" });
		await esperar(() => mostrados.some((mensagem) => mensagem.acao === "lista"));
		mostrados.length = 0;
		acao("abrir", { id: "fisica" });
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]).toMatchObject({ acao: "caderno", gravar: false, dados: { materia: { id: "fisica" }, invalidas: 0 } });
		expect((mostrados[0]!.dados as { eventos: Array<{ verbo: string }> }).eventos.map((evento) => evento.verbo)).toEqual(["criou_materia"]);

		mostrados.length = 0;
		acao("alterar", { id: "fisica", mudancas: { cor: "amber", provas: [{ nome: "P1", data: "2026-12-01" }] } });
		await esperar(() => mostrados.some((mensagem) => mensagem.acao === "caderno"));
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["alterada", "lista", "caderno"]);
		const caderno = mostrados[2]!.dados as { materia: { cor: string }; eventos: Array<{ verbo: string; resultado: unknown }> };
		expect(caderno.materia.cor).toBe("amber");
		expect(caderno.eventos.at(-1)).toMatchObject({ verbo: "alterou_materia", resultado: { cor: "amber", provas: [{ nome: "P1", data: "2026-12-01" }] } });

		mostrados.length = 0;
		acao("abrir", { id: "nao-existe" });
		await esperar(() => mostrados.length > 0);
		expect(mostrados[0]).toMatchObject({ acao: "erro", dados: { ao: "abrir", id: "nao-existe" } });
	});

	it("os avisos do serviço de materiais viram eventos da matéria; fora de uma matéria, nada", async () => {
		aoIniciar?.({}, ctx);
		barramento.emit("materiais:pronto", { caminho: "materias/calculo/materiais/aula.pdf", nome: "aula.pdf", tipo: "pdf", trechos: 12, custo: 0.03, novo: true });
		barramento.emit("materiais:pronto", { caminho: "materias/calculo/materiais/aula.pdf", nome: "aula.pdf", tipo: "pdf", trechos: 13, custo: 0, novo: false });
		barramento.emit("materiais:removido", { caminho: "materias/calculo/materiais/aula.pdf", nome: "aula.pdf" });
		barramento.emit("materiais:pronto", { caminho: "outra/coisa/x.md", nome: "x.md", novo: true });
		const arquivo = eventosMateria(dados, "calculo");
		const ler = async () => {
			try {
				return (await readFile(arquivo, "utf8")).split("\n").filter(Boolean).map((linha) => JSON.parse(linha));
			} catch {
				return [];
			}
		};
		let eventos: Array<Record<string, unknown>> = [];
		for (let tentativa = 0; tentativa < 50 && eventos.length < 3; tentativa++) {
			eventos = await ler();
			await new Promise((resolver) => setTimeout(resolver, 5));
		}
		expect(eventos.map((evento) => evento.verbo).sort()).toEqual(["adicionou_material", "atualizou_material", "removeu_material"]);
		expect(eventos.find((evento) => evento.verbo === "adicionou_material")).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia: "calculo", arquivo: "aula.pdf" },
			resultado: { tipo: "pdf", trechos: 12, custo: 0.03 },
		});
		expect(mostrados).toEqual([]);
	});

	it("as ferramentas do agente criam e listam; a tela recebe a lista nova", async () => {
		const criada = await ferramentas.criar_materia!.execute("c1", { nome: "Física", glifo: "考" }, undefined, undefined, ctx);
		expect(criada.isError).toBeUndefined();
		expect(criada.content[0]!.text).toBe("Matéria criada: Física (id fisica).");
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["lista"]);
		const lista = await ferramentas.listar_materias!.execute("c2", {}, undefined, undefined, ctx);
		expect(lista.content[0]!.text).toBe("Matérias:\n- Física (id fisica)");
		const errada = await ferramentas.criar_materia!.execute("c3", { nome: "X", glifo: "猫" }, undefined, undefined, ctx);
		expect(errada.isError).toBe(true);
	});
});
