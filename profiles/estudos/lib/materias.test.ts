// Testes das matérias e dos eventos numa pasta de dados temporária.

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acrescentarEvento, criarEvento, lerEventos, novoIdEvento } from "./eventos.ts";
import {
	alterarMateria,
	arquivoMateria,
	criarMateria,
	ErroMaterias,
	eventosMateria,
	garantirPastaDeDados,
	idDoNome,
	idLivre,
	listarMaterias,
	pastaAprendiz,
	pastaMaterias,
} from "./materias.ts";

let dados = "";

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-materias-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

const linhas = async (arquivo: string) => (await readFile(arquivo, "utf8")).split("\n").filter(Boolean).map((linha) => JSON.parse(linha));

describe("ids", () => {
	it("o nome sem acento, minúsculo, com hífen", () => {
		expect(idDoNome("Cálculo I")).toBe("calculo-i");
		expect(idDoNome("  Mercado Financeiro & de Capitais! ")).toBe("mercado-financeiro-de-capitais");
		expect(idDoNome("***")).toBe("materia");
	});
	it("repetido ganha número", () => {
		expect(idLivre("Física", new Set(["fisica"]))).toBe("fisica-2");
		expect(idLivre("Física", new Set(["fisica", "fisica-2"]))).toBe("fisica-3");
	});
	it("ids de evento ordenam no tempo", () => {
		const a = novoIdEvento(1000);
		const b = novoIdEvento(2000);
		expect([b, a].sort()).toEqual([a, b]);
	});
});

describe("pasta de dados", () => {
	it("cria materias/ e aprendiz/ se faltarem", async () => {
		await garantirPastaDeDados(dados);
		expect(await readdir(dados)).toEqual(expect.arrayContaining(["materias", "aprendiz"]));
		expect(pastaAprendiz(dados)).toBe(join(dados, "aprendiz"));
	});
	it("pasta que não existe dá um erro que diz como resolver", async () => {
		await expect(garantirPastaDeDados(join(dados, "nao-existe"))).rejects.toThrow(/Google Drive/);
	});
});

describe("matérias", () => {
	it("cria com materia.json e o evento criou_materia; lista na ordem de criação", async () => {
		const calculo = await criarMateria(dados, { nome: "Cálculo I", cor: "moss", glifo: "解", provas: [{ nome: "P1", data: "2026-11-20" }] }, { sessao: "s1" });
		const fisica = await criarMateria(dados, { nome: "Física" });
		expect(calculo).toMatchObject({ id: "calculo-i", nome: "Cálculo I", cor: "moss", glifo: "解", provas: [{ nome: "P1", data: "2026-11-20" }] });
		expect(fisica).toMatchObject({ id: "fisica", cor: "moss", glifo: "学", provas: [] });
		expect(JSON.parse(await readFile(arquivoMateria(dados, "calculo-i"), "utf8"))).toEqual(calculo);
		const [evento] = await linhas(eventosMateria(dados, "calculo-i"));
		expect(evento).toMatchObject({ sessao: "s1", verbo: "criou_materia", objeto: { materia: "calculo-i" }, resultado: { nome: "Cálculo I" } });
		expect((await listarMaterias(dados)).materias.map((materia) => materia.id)).toEqual(["calculo-i", "fisica"]);
	});

	it("nome repetido vira outro id; nada de subpastas além do necessário", async () => {
		await criarMateria(dados, { nome: "Física" });
		const outra = await criarMateria(dados, { nome: "física" });
		expect(outra.id).toBe("fisica-2");
		expect((await readdir(join(pastaMaterias(dados), "fisica"))).sort()).toEqual(["eventos.jsonl", "materia.json"]);
	});

	it("recusa nome vazio, cor e ideograma fora da lista e data inválida", async () => {
		await expect(criarMateria(dados, { nome: "  " })).rejects.toThrow(ErroMaterias);
		await expect(criarMateria(dados, { nome: "X", cor: "brick" })).rejects.toThrow(/cor/);
		await expect(criarMateria(dados, { nome: "X", glifo: "猫" })).rejects.toThrow(/ideograma/);
		await expect(criarMateria(dados, { nome: "X", provas: [{ data: "20/11/2026" }] })).rejects.toThrow(/AAAA-MM-DD/);
	});

	it("alterar grava só o que mudou num evento novo e mantém o id", async () => {
		await criarMateria(dados, { nome: "Cálculo I" });
		const nova = await alterarMateria(dados, "calculo-i", { cor: "amber", nome: "Cálculo I" });
		expect(nova).toMatchObject({ id: "calculo-i", cor: "amber" });
		const eventos = await linhas(eventosMateria(dados, "calculo-i"));
		expect(eventos.map((evento) => evento.verbo)).toEqual(["criou_materia", "alterou_materia"]);
		expect(eventos[1].resultado).toEqual({ cor: "amber" });
		// Sem mudança, nenhum evento a mais.
		await alterarMateria(dados, "calculo-i", { cor: "amber" });
		expect(await linhas(eventosMateria(dados, "calculo-i"))).toHaveLength(2);
	});

	it("pasta com materia.json quebrado vira erro na lista, sem derrubar as outras", async () => {
		await criarMateria(dados, { nome: "Física" });
		await mkdir(join(pastaMaterias(dados), "quebrada"), { recursive: true });
		await writeFile(join(pastaMaterias(dados), "quebrada", "materia.json"), "{");
		const lista = await listarMaterias(dados);
		expect(lista.materias.map((materia) => materia.id)).toEqual(["fisica"]);
		expect(lista.erros).toMatchObject([{ pasta: "quebrada" }]);
	});
});

describe("eventos", () => {
	it("só acrescentam: o que já estava no arquivo fica igual", async () => {
		const arquivo = join(dados, "materias", "x", "eventos.jsonl");
		await acrescentarEvento(arquivo, criarEvento({ verbo: "criou_materia", objeto: { materia: "x" } }));
		const antes = await readFile(arquivo, "utf8");
		await acrescentarEvento(arquivo, criarEvento({ verbo: "alterou_materia", objeto: { materia: "x" }, resultado: { nome: "linha\ncom quebra" } }));
		const depois = await readFile(arquivo, "utf8");
		expect(depois.startsWith(antes)).toBe(true);
		expect(depois.split("\n").filter(Boolean)).toHaveLength(2);
	});

	it("ler pula linha quebrada sem mexer no arquivo; sem arquivo, nenhum evento", async () => {
		const arquivo = join(dados, "materias", "x", "eventos.jsonl");
		expect(await lerEventos(arquivo)).toEqual({ eventos: [], invalidas: 0 });
		await acrescentarEvento(arquivo, criarEvento({ verbo: "criou_materia", objeto: { materia: "x" } }));
		await writeFile(arquivo, `${await readFile(arquivo, "utf8")}{"cortado\n`);
		const antes = await readFile(arquivo, "utf8");
		const lidos = await lerEventos(arquivo);
		expect(lidos.eventos.map((evento) => evento.verbo)).toEqual(["criou_materia"]);
		expect(lidos.invalidas).toBe(1);
		expect(await readFile(arquivo, "utf8")).toBe(antes);
	});
});
