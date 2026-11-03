// Testes da extensão da agenda sem o pi: um "pi" falso com um barramento
// síncrono (como o pi.events), o pi.on e o registerTool, numa pasta de dados
// temporária com matérias. A tela é simulada mandando "interface:acao".

import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Agenda, agendaPadrao, arquivoAgenda, criarTarefaNoDisco, eventosAgenda, hojeLocal, lerAgenda, somarDias } from "../lib/agenda.ts";
import { lerEventos } from "../lib/eventos.ts";
import { alterarMateria, criarMateria, eventosMateria } from "../lib/materias.ts";
import agendaExtensao, { textoDaAgenda } from "./agenda.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): unknown[] } };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, any>; gravar?: boolean };

let dados = "";
let calculo = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
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
		registerTool: (definicao: Ferramenta & { name: string }) => (ferramentas[definicao.name] = definicao),
	} as unknown as ExtensionAPI;
}

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-agenda-"));
	calculo = (await criarMateria(dados, { nome: "Cálculo I", provas: [{ nome: "P1", data: somarDias(hojeLocal(), 10) }] })).id;
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => [] } };
	barramento = new EventEmitter();
	ferramentas = {};
	aoIniciar = undefined;
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
	agendaExtensao(criarPi());
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

const acao = (nome: string, dadosAcao: Record<string, unknown> = {}) => barramento.emit("interface:acao", { painel: "agenda", acao: nome, dados: dadosAcao });
const recebidas = (nome: string) => mostrados.filter((mensagem) => mensagem.acao === nome);
/** Manda a ação com um pedido novo e espera a resposta (agenda ou erro) desse pedido. */
async function pedir(nome: string, dadosAcao: Record<string, unknown> = {}): Promise<Mostrado> {
	const pedido = `p${mostrados.length}-${Math.random().toString(36).slice(2, 6)}`;
	acao(nome, { ...dadosAcao, pedido });
	await esperar(() => mostrados.some((mensagem) => mensagem.dados.pedido === pedido));
	return mostrados.find((mensagem) => mensagem.dados.pedido === pedido)!;
}

describe("ponte da agenda", () => {
	it("ignora outros painéis; abrir devolve as colunas padrão, as provas e as matérias, passageiro, com o pedido", async () => {
		barramento.emit("interface:acao", { painel: "notas", acao: "abrir", dados: {} });
		acao("desconhecida");
		const resposta = await pedir("abrir");
		expect(mostrados).toHaveLength(1);
		expect(resposta).toMatchObject({ painel: "agenda", acao: "agenda", gravar: false });
		expect(resposta.dados.colunas.map((c: { nome: string }) => c.nome)).toEqual(["A fazer", "Fazendo", "Feito"]);
		expect(resposta.dados.tarefas).toEqual([]);
		expect(resposta.dados.provas).toEqual([{ materia: calculo, nome: "Cálculo I", cor: "moss", prova: "P1", data: somarDias(hojeLocal(), 10) }]);
		expect(resposta.dados.materias).toEqual([{ id: calculo, nome: "Cálculo I", cor: "moss" }]);
		// Abrir não grava a agenda.
		await expect(readFile(arquivoAgenda(dados), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("as provas vêm do materia.json na hora: pedir abrir de novo traz a data nova", async () => {
		await alterarMateria(dados, calculo, { provas: [{ nome: "P1", data: "2030-01-02" }] });
		expect((await pedir("abrir")).dados.provas[0].data).toBe("2030-01-02");
	});

	it("cria a tarefa e devolve a agenda inteira com o pedido e o id criado", async () => {
		const resposta = await pedir("criar_tarefa", { titulo: " Ler capítulo 2 ", data: "2026-12-01", hora: "08:30", materia: calculo });
		expect(resposta.acao).toBe("agenda");
		expect(resposta.dados.tarefas).toHaveLength(1);
		expect(resposta.dados.tarefas[0]).toMatchObject({ titulo: "Ler capítulo 2", coluna: "a-fazer", ordem: 0, data: "2026-12-01", hora: "08:30", materia: calculo });
		expect(resposta.dados.criada).toBe(resposta.dados.tarefas[0].id);
		expect((await lerEventos(eventosMateria(dados, calculo))).eventos.map((e) => e.verbo)).toEqual(["criou_materia", "criou_tarefa"]);
	});

	it("erro de validação volta como erro com o pedido e a ação, e nada é gravado", async () => {
		const resposta = await pedir("criar_tarefa", { titulo: "   " });
		expect(resposta).toMatchObject({ acao: "erro", gravar: false, dados: { mensagem: "Escreva o título da tarefa.", ao: "criar_tarefa" } });
		const outra = await pedir("criar_tarefa", { titulo: "x", materia: "fantasma" });
		expect(outra.dados.mensagem).toMatch(/matéria "fantasma"/);
		await expect(readFile(arquivoAgenda(dados), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("falta de dado obrigatório vira erro, não silêncio", async () => {
		const resposta = await pedir("mover_tarefa", { id: "t" });
		expect(resposta.acao).toBe("erro");
		expect(resposta.dados.mensagem).toMatch(/coluna de destino/);
		expect((await pedir("reordenar_colunas", {})).dados.mensagem).toMatch(/lista de ids/);
	});

	it("edita, move (concluir e reabrir) e apaga", async () => {
		const id = (await pedir("criar_tarefa", { titulo: "Estudar" })).dados.criada as string;
		let r = await pedir("editar_tarefa", { id, mudancas: { titulo: "Estudar limites", nota: "capítulo 1", data: "2026-12-05" } });
		expect(r.dados.tarefas[0]).toMatchObject({ titulo: "Estudar limites", nota: "capítulo 1", data: "2026-12-05" });
		r = await pedir("mover_tarefa", { id, coluna: "feito" });
		expect(r.dados.tarefas[0].concluidaEm).toEqual(expect.any(String));
		r = await pedir("mover_tarefa", { id, coluna: "fazendo", posicao: 0 });
		expect(r.dados.tarefas[0]).toMatchObject({ coluna: "fazendo", ordem: 0 });
		expect(r.dados.tarefas[0]).not.toHaveProperty("concluidaEm");
		r = await pedir("apagar_tarefa", { id });
		expect(r.dados.tarefas).toEqual([]);
		expect((await lerEventos(eventosAgenda(dados))).eventos.map((e) => e.verbo)).toEqual(["criou_tarefa", "editou_tarefa", "concluiu_tarefa", "reabriu_tarefa", "apagou_tarefa"]);
		expect((await pedir("editar_tarefa", { id, mudancas: { titulo: "x" } })).dados.mensagem).toMatch(/Não achei a tarefa/);
	});

	it("colunas: criar, renomear, reordenar, marcar feito e apagar (com destino)", async () => {
		let r = await pedir("criar_coluna", { nome: "Revisar" });
		const nova = r.dados.criada as string;
		expect(r.dados.colunas.map((c: { nome: string }) => c.nome)).toEqual(["A fazer", "Fazendo", "Feito", "Revisar"]);
		r = await pedir("renomear_coluna", { id: nova, nome: "Revisão" });
		r = await pedir("reordenar_colunas", { ids: ["a-fazer", nova, "fazendo", "feito"] });
		expect(r.dados.colunas.map((c: { id: string }) => c.id)).toEqual(["a-fazer", nova, "fazendo", "feito"]);
		const tarefa = (await pedir("criar_tarefa", { titulo: "T", coluna: nova })).dados.criada as string;
		r = await pedir("apagar_coluna", { id: nova });
		expect(r).toMatchObject({ acao: "erro", dados: { ao: "apagar_coluna" } });
		expect(r.dados.mensagem).toMatch(/Escolha para onde/);
		r = await pedir("marcar_feito", { id: "fazendo" });
		expect(r.dados.colunas.find((c: { id: string; feito: boolean }) => c.id === "fazendo").feito).toBe(true);
		r = await pedir("apagar_coluna", { id: nova, destino: "fazendo" });
		expect(r.dados.colunas.map((c: { id: string }) => c.id)).toEqual(["a-fazer", "fazendo", "feito"]);
		expect(r.dados.tarefas.find((t: { id: string }) => t.id === tarefa)).toMatchObject({ coluna: "fazendo" });
		expect((await pedir("apagar_coluna", { id: "fazendo" })).dados.mensagem).toMatch(/coluna de feito/);
	});

	it("as escritas seguidas entram em fila e nenhuma se perde", async () => {
		for (let i = 0; i < 8; i++) acao("criar_tarefa", { titulo: `T${i}`, pedido: `q${i}` });
		await esperar(() => recebidas("agenda").length === 8);
		expect(mostrados.map((m) => m.dados.tarefas.length)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect((await lerAgenda(dados)).tarefas.map((t) => t.titulo)).toEqual(["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"]);
	});

	it("agenda.json ilegível: erro claro na tela e o arquivo fica como está", async () => {
		await mkdir(join(dados, "agenda"), { recursive: true });
		await writeFile(arquivoAgenda(dados), "isto não é json", "utf8");
		const resposta = await pedir("abrir");
		expect(resposta.acao).toBe("erro");
		expect(resposta.dados.mensagem).toMatch(/nada foi gravado por cima/);
		expect((await pedir("criar_tarefa", { titulo: "x" })).acao).toBe("erro");
		expect(await readFile(arquivoAgenda(dados), "utf8")).toBe("isto não é json");
	});

	it("uma cópia sem sessão no mesmo barramento (a carga a mais ao recarregar) fica calada", async () => {
		const copia = { ...criarPi(), on: () => undefined } as unknown as ExtensionAPI;
		agendaExtensao(copia);
		await pedir("abrir");
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toHaveLength(1);
	});
});

describe("ler_agenda", () => {
	const hoje = () => hojeLocal();
	const ler = async (params: Record<string, unknown> = {}) => ferramentas.ler_agenda!.execute("c1", params, undefined, undefined, ctx);

	async function prepararTarefas() {
		const base = hoje();
		await criarTarefaNoDisco(dados, { titulo: "Atrasada", data: somarDias(base, -3), materia: calculo, nota: "faltou o exercício 4" });
		await criarTarefaNoDisco(dados, { titulo: "Amanhã cedo", data: somarDias(base, 1), hora: "08:00" });
		await criarTarefaNoDisco(dados, { titulo: "Daqui a 40 dias", data: somarDias(base, 40) });
		await criarTarefaNoDisco(dados, { titulo: "Sem data" });
		const pronta = (await criarTarefaNoDisco(dados, { titulo: "Já feita", data: somarDias(base, 2), coluna: "feito" })).tarefa;
		return pronta;
	}

	it("registra a ferramenta só de leitura", () => {
		expect(Object.keys(ferramentas)).toEqual(["ler_agenda"]);
	});

	it("padrão: hoje até 30 dias; atrasadas, abertas com data, sem data e provas; feitas e fora do intervalo ficam de fora", async () => {
		await prepararTarefas();
		const r = await ler();
		expect(r.isError).toBeUndefined();
		const texto = r.content[0]!.text;
		expect(texto).toContain(`de ${hoje()} a ${somarDias(hoje(), 30)}`);
		expect(texto).toMatch(/## Atrasadas.* \(1\)\n- Atrasada \(id t-.*; matéria Cálculo I; coluna A fazer\)\. Nota: faltou o exercício 4/);
		expect(texto).toMatch(/## Abertas com data no intervalo \(1\)\n- Amanhã cedo \(.*; \d{4}-\d{2}-\d{2} 08:00; coluna A fazer\)/);
		expect(texto).toMatch(/## Abertas sem data \(1\)\n- Sem data/);
		expect(texto).toMatch(new RegExp(`## Provas no intervalo \\(1\\)\\n- ${somarDias(hoje(), 10)}: P1 \\(matéria Cálculo I\\)`));
		expect(texto).not.toContain("Já feita");
		expect(texto).not.toContain("Daqui a 40 dias");
	});

	it("de e ate mudam o intervalo; matéria filtra tudo", async () => {
		await prepararTarefas();
		const largo = (await ler({ ate: somarDias(hoje(), 60) })).content[0]!.text;
		expect(largo).toContain("Daqui a 40 dias");
		const soCalculo = (await ler({ materia: calculo })).content[0]!.text;
		expect(soCalculo).toContain("só a matéria Cálculo I");
		expect(soCalculo).toContain("Atrasada");
		expect(soCalculo).not.toContain("Amanhã cedo");
		expect(soCalculo).not.toContain("Sem data (");
		const longe = (await ler({ de: "2031-01-01", ate: "2031-01-31" })).content[0]!.text;
		expect(longe).toMatch(/## Abertas com data no intervalo \(0\)\n\(nenhuma\)/);
		expect(longe).toMatch(/## Provas no intervalo \(0\)/);
	});

	it("datas ruins e matéria que não existe viram erro; agenda ilegível também", async () => {
		expect((await ler({ de: "2026-02-30" })).isError).toBe(true);
		expect((await ler({ de: "2026-12-01", ate: "2026-11-01" })).content[0]!.text).toMatch(/depois do fim/);
		expect((await ler({ materia: "fantasma" })).content[0]!.text).toMatch(/Não achei a matéria/);
		await mkdir(join(dados, "agenda"), { recursive: true });
		await writeFile(arquivoAgenda(dados), "{", "utf8");
		const r = await ler();
		expect(r.isError).toBe(true);
		expect(r.content[0]!.text).toMatch(/nada foi gravado por cima/);
	});

	it("não escreve nada: sem agenda.json, ler não cria o arquivo", async () => {
		const r = await ler();
		expect(r.content[0]!.text).toMatch(/Atrasadas.*\(0\)/);
		await expect(readFile(arquivoAgenda(dados), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	});
});

describe("textoDaAgenda", () => {
	it("corta as seções compridas e diz quantas faltam", () => {
		let agenda: Agenda = agendaPadrao();
		agenda = { ...agenda, tarefas: Array.from({ length: 45 }, (_, i) => ({ id: `t${i}`, titulo: `Tarefa ${i}`, coluna: "a-fazer", ordem: i, criadaEm: "x", alteradaEm: "x" })) };
		const texto = textoDaAgenda({ agenda, materias: [], provas: [], hoje: "2026-11-03", de: "2026-11-03", ate: "2026-12-03" });
		expect(texto).toContain("## Abertas sem data (45)");
		expect(texto).toContain("… e mais 5");
		expect(texto).not.toContain("Tarefa 44");
	});
});
