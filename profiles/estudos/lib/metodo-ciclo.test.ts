// Testes do ciclo do método no disco (docs/metodo-ciclo.md), numa pasta de
// dados temporária: o relatório gravado com o gerou_relatorio_metodo, a
// evidência lida do aprendiz/eventos.jsonl, os arquivos de ajustes (ler,
// gravar, listar, ligar e desligar, o ilegível nunca sobrescrito) e as
// decisões (aprovar, editar e aprovar, rejeitar, decidida de novo).

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acrescentarEvento, criarEvento, lerEventos } from "./eventos.ts";
import { eventosAprendiz, eventosMateria } from "./materias.ts";
import {
	ajustesAtivosDe,
	caminhoDoRelatorio,
	caminhoDosAjustes,
	decidirProposta,
	ErroMetodo,
	evidenciaDoModulo,
	gravarAjustes,
	gravarRelatorio,
	lerAjustes,
	lerRelatorio,
	ligarAjusteNoDisco,
	listarAjustes,
	novoRelatorio,
	registrarRelatorio,
	type RelatorioMetodo,
} from "./metodo-ciclo.ts";
import { MINIMO_CARACTERES_EXEMPLO, type ModuloGerado } from "./modulos.ts";

const MATERIA = "calculo-i";
const CURSO = "p1-regressao";
const AGORA = new Date(2026, 10, 3, 15, 0, 0);
const GERADO = "2026-11-01T10:00:00.000Z";

let dados = "";

const modulo = (): ModuloGerado => ({
	versao: 1,
	id: "m1",
	curso: CURSO,
	materia: MATERIA,
	situacao: "gerado",
	licoes: [
		{
			id: "l1",
			titulo: "A reta",
			objetivo: "",
			conceitos: ["c-a"],
			blocos: [{ id: "l1-b1", tipo: "explicacao", conceitos: ["c-a"], formato: "conceito", texto: `Texto. ${"x".repeat(MINIMO_CARACTERES_EXEMPLO)}`, referencias: [] }],
		},
	],
	geradoEm: GERADO,
	modelo: "teste/x",
	custo: 0,
	materiaisUsados: [],
	concluidoEm: "2026-11-02T10:00:00.000Z",
});

const pronto = (): RelatorioMetodo =>
	novoRelatorio({
		modulo: "m1",
		geradoEm: "2026-11-03T10:00:00.000Z",
		eventosLidos: 4,
		retornos: 3,
		doModelo: {
			relatorio: {
				resumo: "Resumo.",
				funcionou: [],
				problemas: [{ texto: "Longo.", evidencias: ["ev-a"] }],
				propostas: [
					{ id: "p1", arquivo: "exemplos.md", ajuste: "Diga antes o que o exemplo vai mostrar.", porque: "Ele se perdeu.", evidencias: ["ev-a", "ev-b"] },
					{ id: "p2", arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "Foram fáceis.", evidencias: ["ev-a", "ev-b"] },
				],
			},
			modelo: "teste/x",
			custo: 0.05,
			prompt: { nome: "relatorio-metodo.md", hash: "h1" },
			todas: [
				{ id: "ev-a", linha: "l1-b1 · a", licao: "l1", bloco: "l1-b1" },
				{ id: "ev-b", linha: "l1-b1 · b", licao: "l1", bloco: "l1-b1" },
			],
		},
	});

const doAprendiz = async (verbo: string) => (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => evento.verbo === verbo);

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-metodo-ciclo-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

describe("o relatório no disco", () => {
	it("sem arquivo, null; gravado e lido de volta; o gerou_relatorio_metodo na matéria", async () => {
		expect(await lerRelatorio(dados, MATERIA, CURSO, "m1")).toBeNull();
		const relatorio = pronto();
		const evento = await registrarRelatorio(dados, MATERIA, CURSO, relatorio, { sessao: "s1", agora: AGORA });
		expect(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1")).toBe(join(dados, "materias", MATERIA, "cursos", CURSO, "relatorios", "m1.json"));
		expect(await lerRelatorio(dados, MATERIA, CURSO, "m1")).toEqual(relatorio);
		const [gravado] = (await lerEventos(eventosMateria(dados, MATERIA))).eventos;
		expect(gravado).toEqual(evento);
		expect(gravado).toMatchObject({
			sessao: "s1",
			verbo: "gerou_relatorio_metodo",
			objeto: { materia: MATERIA, curso: CURSO, modulo: "m1" },
			resultado: { situacao: "pronto", propostas: 2, custo: 0.05 },
			contexto: { modelo: "teste/x", prompt: { nome: "relatorio-metodo.md", hash: "h1" } },
		});
		const pouco = novoRelatorio({ modulo: "m1", geradoEm: "2026-11-03T11:00:00.000Z", eventosLidos: 1, retornos: 1 });
		const outro = await registrarRelatorio(dados, MATERIA, CURSO, pouco);
		expect(outro.contexto).toBeUndefined();
		expect(outro.resultado).toEqual({ situacao: "pouco_retorno", propostas: 0, custo: 0 });
		expect(await lerRelatorio(dados, MATERIA, CURSO, "m1")).toEqual(pouco);
	});

	it("um relatório ilegível é ErroMetodo e não é sobrescrito; um id inválido também é erro", async () => {
		const arquivo = caminhoDoRelatorio(dados, MATERIA, CURSO, "m1");
		await mkdir(join(arquivo, ".."), { recursive: true });
		await writeFile(arquivo, "{ quebrado", "utf8");
		await expect(lerRelatorio(dados, MATERIA, CURSO, "m1")).rejects.toThrow(/Não consegui ler o relatório do método .*JSON está inválido.*nada foi gravado por cima/);
		await expect(registrarRelatorio(dados, MATERIA, CURSO, pronto())).rejects.toThrow(ErroMetodo);
		expect(await readFile(arquivo, "utf8")).toBe("{ quebrado");
		expect((await lerEventos(eventosMateria(dados, MATERIA))).eventos).toHaveLength(0);
		expect(() => caminhoDoRelatorio(dados, MATERIA, CURSO, "../x")).toThrow(ErroMetodo);
	});
});

describe("a evidência lida do aprendiz", () => {
	it("os eventos do módulo, com as linhas e os retornos", async () => {
		const ev = (verbo: Parameters<typeof criarEvento>[0]["verbo"], objeto: Record<string, unknown>, resultado: Record<string, unknown>, ts: string) =>
			acrescentarEvento(eventosAprendiz(dados), criarEvento({ verbo, objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", ...objeto }, resultado }, new Date(ts)));
		await ev("avaliou_bloco", { licao: "l1", bloco: "l1-b1" }, { avaliacao: "ruim", motivos: [], texto: "" }, "2026-10-31T10:00:00.000Z");
		await ev("avaliou_bloco", { licao: "l1", bloco: "l1-b1" }, { avaliacao: "ruim", motivos: ["longo"], texto: "" }, "2026-11-01T11:00:00.000Z");
		await ev("pediu_explicacao", { licao: "l1", bloco: "l1-b1" }, { trecho: "reta", tipo: "nao_sei" }, "2026-11-01T12:00:00.000Z");
		const montada = await evidenciaDoModulo(dados, modulo());
		expect(montada.eventosLidos).toBe(2);
		expect(montada.retornos).toBe(2);
		expect(montada.mandadas.map((item) => item.linha)).toEqual(["l1-b1 · conceito · conceito.md · Feedback Ruim, motivos longo demais", "l1-b1 · conceito · conceito.md · Não sei o que é isso: «reta»"]);
		expect(montada.blocos.map((item) => item.bloco)).toEqual(["l1-b1"]);
	});
});

describe("os ajustes no disco", () => {
	it("sem arquivo, vazio; gravar, ler, listar; o arquivo de ajustes fica em aprendiz/metodo", async () => {
		expect((await lerAjustes(dados, "exemplos.md")).ajustes).toEqual([]);
		expect(await listarAjustes(dados)).toEqual([]);
		await gravarAjustes(dados, {
			arquivo: "exemplos.md",
			titulo: "Ajustes do Breno para exemplos.md",
			ajustes: [
				{ id: "a-1", ativo: true, texto: "Primeiro.", comentario: "proposta: m1/p1 · aprovado em 2026-11-03" },
				{ id: "a-2", ativo: false, texto: "Segundo.", comentario: null },
			],
		});
		expect(caminhoDosAjustes(dados, "exemplos.md")).toBe(join(dados, "aprendiz", "metodo", "exemplos.md"));
		expect(await readFile(caminhoDosAjustes(dados, "exemplos.md"), "utf8")).toBe(
			"# Ajustes do Breno para exemplos.md\n\n## a-1 · ativo\nPrimeiro.\n<!-- proposta: m1/p1 · aprovado em 2026-11-03 -->\n\n## a-2 · desligado\nSegundo.\n",
		);
		expect((await ajustesAtivosDe(dados, "exemplos.md")).map((item) => item.id)).toEqual(["a-1"]);
		expect(await listarAjustes(dados)).toEqual([
			{
				arquivo: "exemplos.md",
				ajustes: [
					{ id: "a-1", texto: "Primeiro.", ativo: true, origem: { materia: null, curso: null, modulo: "m1", proposta: "p1", evidencias: [], aprovadoEm: "2026-11-03" } },
					{ id: "a-2", texto: "Segundo.", ativo: false, origem: null },
				],
			},
		]);
		expect(() => caminhoDosAjustes(dados, "outro.md")).toThrow(/não é um arquivo de metodologia/);
	});

	it("ligar e desligar grava o alterou_ajuste_metodo; sem mudança, nada; um arquivo ilegível não é sobrescrito e aparece com o erro na lista", async () => {
		await gravarAjustes(dados, { arquivo: "quiz.md", titulo: "Ajustes do Breno para quiz.md", ajustes: [{ id: "a-1", ativo: true, texto: "Um.", comentario: null }] });
		const desligado = await ligarAjusteNoDisco(dados, "quiz.md", "a-1", false, { sessao: "s1", agora: AGORA });
		expect(desligado.conteudo.ajustes[0]!.ativo).toBe(false);
		expect(desligado.evento).toMatchObject({ sessao: "s1", verbo: "alterou_ajuste_metodo", objeto: { arquivo: "quiz.md", ajuste: "a-1" }, resultado: { ativo: false, texto: "Um." } });
		expect(await ajustesAtivosDe(dados, "quiz.md")).toEqual([]);
		expect((await ligarAjusteNoDisco(dados, "quiz.md", "a-1", false)).evento).toBeUndefined();
		expect(await doAprendiz("alterou_ajuste_metodo")).toHaveLength(1);
		await expect(ligarAjusteNoDisco(dados, "quiz.md", "a-9", true)).rejects.toThrow('Não achei o ajuste "a-9" em quiz.md.');
		await expect(ligarAjusteNoDisco(dados, "quiz.md", "a-1", "sim")).rejects.toThrow(/true nem false/);

		const quebrado = "Nota solta.\n## a-1 · ativo\nTexto.\n";
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAjustes(dados, "conceito.md"), quebrado, "utf8");
		await expect(lerAjustes(dados, "conceito.md")).rejects.toThrow(/Não consegui ler os ajustes do método .*conceito\.md: a linha 1 tem texto fora de um ajuste\. Corrija/);
		await expect(ligarAjusteNoDisco(dados, "conceito.md", "a-1", false)).rejects.toThrow(ErroMetodo);
		expect(await readFile(caminhoDosAjustes(dados, "conceito.md"), "utf8")).toBe(quebrado);
		const lista = await listarAjustes(dados);
		expect(lista.map((item) => item.arquivo)).toEqual(["conceito.md", "quiz.md"]);
		expect(lista[0]).toMatchObject({ arquivo: "conceito.md", ajustes: [], erro: expect.stringContaining("texto fora de um ajuste") });
	});
});

describe("as decisões", () => {
	beforeEach(async () => {
		await gravarRelatorio(dados, MATERIA, CURSO, pronto());
	});

	it("aprovar acrescenta o ajuste com a origem, grava o evento e a decisão; decidir de novo é erro", async () => {
		const feito = await decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p1", decisao: "aprovar" }, { sessao: "s1", agora: AGORA });
		expect(feito.ajuste).toEqual({
			id: "a-20261103-1",
			ativo: true,
			texto: "Diga antes o que o exemplo vai mostrar.",
			comentario: `proposta: ${MATERIA}/${CURSO}/m1/p1 · evidências: ev-a, ev-b · aprovado em 2026-11-03`,
		});
		expect(await readFile(caminhoDosAjustes(dados, "exemplos.md"), "utf8")).toBe(
			`# Ajustes do Breno para exemplos.md\n\n## a-20261103-1 · ativo\nDiga antes o que o exemplo vai mostrar.\n<!-- proposta: ${MATERIA}/${CURSO}/m1/p1 · evidências: ev-a, ev-b · aprovado em 2026-11-03 -->\n`,
		);
		const [evento] = await doAprendiz("aprovou_ajuste_metodo");
		expect(evento).toEqual(feito.evento);
		expect(evento).toMatchObject({
			sessao: "s1",
			objeto: { arquivo: "exemplos.md", ajuste: "a-20261103-1", materia: MATERIA, curso: CURSO, modulo: "m1", proposta: "p1" },
			resultado: { texto: "Diga antes o que o exemplo vai mostrar.", editado: false, evidencias: ["ev-a", "ev-b"] },
		});
		const gravado = (await lerRelatorio(dados, MATERIA, CURSO, "m1"))!;
		expect(gravado.propostas[0]!.decisao).toEqual({ tipo: "aprovada", texto: "Diga antes o que o exemplo vai mostrar.", em: AGORA.toISOString(), evento: evento!.id, ajuste: "a-20261103-1" });
		expect(gravado).toEqual(feito.relatorio);
		await expect(decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p1", decisao: "rejeitar" })).rejects.toThrow("A proposta p1 já foi aprovada.");
		expect(await doAprendiz("rejeitou_ajuste_metodo")).toHaveLength(0);
	});

	it("editar e aprovar grava o texto editado; um ajuste ativo igual não é repetido", async () => {
		await gravarAjustes(dados, { arquivo: "quiz.md", titulo: "Ajustes do Breno para quiz.md", ajustes: [{ id: "a-velho", ativo: true, texto: "Alternativas parecidas com a certa.", comentario: null }] });
		const editado = await decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p2", decisao: "aprovar", texto: " alternativas PARECIDAS com a certa. " }, { agora: AGORA });
		expect(editado.ajuste!.id).toBe("a-velho");
		expect((await lerAjustes(dados, "quiz.md")).ajustes).toHaveLength(1);
		expect(editado.evento.resultado).toMatchObject({ texto: "Alternativas parecidas com a certa.", editado: true });
		expect(editado.relatorio.propostas[1]!.decisao).toMatchObject({ tipo: "aprovada", ajuste: "a-velho", texto: "Alternativas parecidas com a certa." });

		const outro = await decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p1", decisao: "aprovar", texto: "Antes do exemplo, diga em uma frase o que ele mostra." }, { agora: AGORA });
		expect(outro.ajuste).toMatchObject({ id: "a-20261103-1", texto: "Antes do exemplo, diga em uma frase o que ele mostra." });
		expect(outro.evento.resultado).toMatchObject({ editado: true });
	});

	it("rejeitar grava o motivo e o texto da proposta; sem relatório, com relatório ilegível ou com ajustes ilegíveis, erro sem gravar", async () => {
		const rejeitado = await decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p2", decisao: "rejeitar", motivo: " Não combina comigo. " }, { agora: AGORA });
		expect(rejeitado.evento).toMatchObject({
			verbo: "rejeitou_ajuste_metodo",
			objeto: { arquivo: "quiz.md", materia: MATERIA, curso: CURSO, modulo: "m1", proposta: "p2" },
			resultado: { texto: "Use alternativas plausíveis.", evidencias: ["ev-a", "ev-b"], motivo: "Não combina comigo." },
		});
		expect(rejeitado.relatorio.propostas[1]!.decisao).toEqual({ tipo: "rejeitada", motivo: "Não combina comigo.", em: AGORA.toISOString(), evento: rejeitado.evento.id });
		const semMotivo = await decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p1", decisao: "rejeitar" }, { agora: AGORA });
		expect(semMotivo.relatorio.propostas[0]!.decisao).toEqual({ tipo: "rejeitada", em: AGORA.toISOString(), evento: semMotivo.evento.id });
		expect(semMotivo.evento.resultado).toMatchObject({ motivo: "" });

		await expect(decidirProposta(dados, MATERIA, CURSO, "m2", { proposta: "p1", decisao: "aprovar" })).rejects.toThrow("O módulo m2 ainda não tem relatório do método.");

		await rm(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1"));
		await gravarRelatorio(dados, MATERIA, CURSO, pronto());
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAjustes(dados, "exemplos.md"), "## a-1 · talvez\n", "utf8");
		const antes = (await lerEventos(eventosAprendiz(dados))).eventos.length;
		await expect(decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p1", decisao: "aprovar" })).rejects.toThrow(/Não consegui ler os ajustes do método/);
		expect((await lerRelatorio(dados, MATERIA, CURSO, "m1"))!.propostas[0]!.decisao).toBeUndefined();
		expect((await lerEventos(eventosAprendiz(dados))).eventos).toHaveLength(antes);
		expect(await readFile(caminhoDosAjustes(dados, "exemplos.md"), "utf8")).toBe("## a-1 · talvez\n");

		await writeFile(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1"), "[]", "utf8");
		await expect(decidirProposta(dados, MATERIA, CURSO, "m1", { proposta: "p2", decisao: "rejeitar" })).rejects.toThrow(/Não consegui ler o relatório do método/);
		expect(await readFile(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1"), "utf8")).toBe("[]");
	});
});
