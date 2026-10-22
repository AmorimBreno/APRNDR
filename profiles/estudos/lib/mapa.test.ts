// Testes do mapa de conteúdo: as regras puras (fusão, operações, aprovação,
// material removido) e o disco numa pasta de dados temporária com uma matéria.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerEventos } from "./eventos.ts";
import {
	aplicarOperacoes,
	aprovar,
	caminhoDoMapa,
	type Conceito,
	contarMapa,
	dividirEmPartes,
	ErroMapa,
	fundirResultado,
	fundirTema,
	gravarMapa,
	lerMapa,
	lerPendentes,
	lerTrechos,
	type MapaConteudo,
	mapaVazio,
	marcarArquivoMapeado,
	novoIdConceito,
	pastaExtraidoArquivo,
	registrarAprovacaoMapa,
	registrarMapaDoTema,
	registrarMapeamento,
	registrarMaterialRemovidoDoMapa,
	registrarRevisaoMapa,
	removerArquivoDoMapa,
	type ResultadoMapeador,
	semFonte,
	tirarReferenciasDoArquivo,
} from "./mapa.ts";
import { criarMateria, eventosMateria } from "./materias.ts";

const AGORA = new Date("2026-10-21T13:00:00.000Z");
const TRECHOS = [
	{ local: "página 1", nome: "pagina-001" },
	{ local: "página 2", nome: "pagina-002" },
	{ local: "página 3", nome: "pagina-003" },
];

function conceito(id: string, nome: string, extra: Partial<Conceito> = {}): Conceito {
	return { id, nome, descricao: "", referencias: [], prioridade: "normal", origem: "material", criadoEm: AGORA.toISOString(), ...extra };
}

function mapaCom(conceitos: Conceito[], extra: Partial<MapaConteudo> = {}): MapaConteudo {
	return { ...mapaVazio(), conceitos, ...extra };
}

const ref = (arquivo: string, local: string, trecho: string) => ({ arquivo, local, trecho });
const ids = (mapa: MapaConteudo) => mapa.conceitos.map((item) => item.id);
const nomes = (mapa: MapaConteudo) => mapa.conceitos.map((item) => item.nome);
const fundir = (mapa: MapaConteudo, conceitos: ResultadoMapeador["conceitos"], arquivo = "aula.pdf") =>
	fundirResultado(mapa, { arquivo, trechos: TRECHOS, resultado: { conceitos }, agora: AGORA });

describe("ids", () => {
	it("c- + 12 base 36 de milissegundos + 4 hex", () => {
		const id = novoIdConceito(AGORA.getTime());
		expect(id).toMatch(/^c-[0-9a-z]{12}-[0-9a-f]{4}$/);
		expect(id.slice(2, 14)).toBe(AGORA.getTime().toString(36).padStart(12, "0"));
	});
});

describe("fusão", () => {
	it("descarta locais inválidos e o conceito sem nenhum local válido", () => {
		const { mapa, novos, descartados } = fundir(mapaVazio(), [
			{ id: null, nome: "Limite", descricao: "d", locais: ["página 1", "página 9", "pagina 2", "página 1"] },
			{ id: null, nome: "Inventado", descricao: "", locais: ["página 99"] },
			{ id: null, nome: "Sem local", descricao: "", locais: [] },
		]);
		expect(novos).toBe(1);
		expect(descartados).toBe(2);
		expect(mapa.conceitos).toHaveLength(1);
		expect(mapa.conceitos[0]!.referencias).toEqual([ref("aula.pdf", "página 1", "pagina-001")]);
		expect(mapa.conceitos[0]).toMatchObject({ nome: "Limite", descricao: "d", origem: "material", prioridade: "normal", criadoEm: AGORA.toISOString() });
		expect(mapa.conceitos[0]!.novo).toBeUndefined();
	});

	it("id existente só ganha referências novas; nome, descrição, prioridade, posição e fora ficam", () => {
		const antes = mapaCom([
			conceito("c-a", "Derivada", { descricao: "minha", prioridade: "alta", fora: true, referencias: [ref("aula.pdf", "página 1", "pagina-001")] }),
			conceito("c-b", "Integral"),
		]);
		const copia = structuredClone(antes);
		const { mapa, reforcados, novos } = fundir(antes, [{ id: "c-a", nome: "Derivadas (outro nome)", descricao: "do modelo", locais: ["página 1", "página 2"] }]);
		expect(antes).toEqual(copia);
		expect(reforcados).toBe(1);
		expect(novos).toBe(0);
		expect(ids(mapa)).toEqual(["c-a", "c-b"]);
		expect(mapa.conceitos[0]).toMatchObject({ nome: "Derivada", descricao: "minha", prioridade: "alta", fora: true });
		expect(mapa.conceitos[0]!.referencias).toEqual([ref("aula.pdf", "página 1", "pagina-001"), ref("aula.pdf", "página 2", "pagina-002")]);
	});

	it("id desconhecido vira conceito novo", () => {
		const { mapa, novos, reforcados } = fundir(mapaCom([conceito("c-a", "A")]), [{ id: "c-nao-existe", nome: "B", descricao: "", locais: ["página 1"] }]);
		expect(novos).toBe(1);
		expect(reforcados).toBe(0);
		expect(nomes(mapa)).toEqual(["A", "B"]);
		expect(mapa.conceitos[1]!.id).toMatch(/^c-[0-9a-z]{12}-[0-9a-f]{4}$/);
	});

	it("id null com o nome de um conceito do mapa (sem maiúsculas e acentos) reforça esse conceito", () => {
		const { mapa, novos, reforcados } = fundir(mapaCom([conceito("c-a", "Função Exponencial", { descricao: "minha" })]), [
			{ id: null, nome: "funcao exponencial", descricao: "do modelo", locais: ["página 1"] },
			{ id: "c-nao-existe", nome: "FUNÇÃO EXPONENCIAL", descricao: "", locais: ["página 2"] },
		]);
		expect(novos).toBe(0);
		expect(reforcados).toBe(1);
		expect(mapa.conceitos).toHaveLength(1);
		expect(mapa.conceitos[0]).toMatchObject({ nome: "Função Exponencial", descricao: "minha" });
		expect(mapa.conceitos[0]!.referencias.map((item) => item.local)).toEqual(["página 1", "página 2"]);
	});

	it("o nome de um conceito que está fora reforça e ele continua fora", () => {
		const { mapa, novos } = fundir(mapaCom([conceito("c-a", "A"), conceito("c-f", "Fora", { fora: true })]), [{ id: null, nome: "fora", descricao: "", locais: ["página 3"] }]);
		expect(novos).toBe(0);
		expect(ids(mapa)).toEqual(["c-a", "c-f"]);
		expect(mapa.conceitos[1]!.fora).toBe(true);
		expect(mapa.conceitos[1]!.referencias).toEqual([ref("aula.pdf", "página 3", "pagina-003")]);
	});

	it("um item que casou pelo nome com outro nome e o mesmo id viram um só", () => {
		const { mapa, reforcados } = fundir(mapaCom([conceito("c-a", "Média")]), [
			{ id: "c-a", nome: "Média aritmética", descricao: "", locais: ["página 1"] },
			{ id: null, nome: "média", descricao: "", locais: ["página 2"] },
		]);
		expect(reforcados).toBe(1);
		expect(mapa.conceitos[0]!.referencias.map((item) => item.local)).toEqual(["página 1", "página 2"]);
	});

	it("o conceito casado pelo nome serve de anterior e de próximo para os novos", () => {
		const depois = fundir(mapaCom([conceito("c-a", "A"), conceito("c-b", "B")]), [
			{ id: null, nome: "a", descricao: "", locais: ["página 1"] },
			{ id: null, nome: "N", descricao: "", locais: ["página 2"] },
		]).mapa;
		expect(nomes(depois)).toEqual(["A", "N", "B"]);
		const antes = fundir(mapaCom([conceito("c-a", "A"), conceito("c-b", "B")]), [
			{ id: null, nome: "N", descricao: "", locais: ["página 1"] },
			{ id: null, nome: "b", descricao: "", locais: ["página 2"] },
		]).mapa;
		expect(nomes(antes)).toEqual(["A", "N", "B"]);
	});

	it("novo entra logo depois do item anterior da resposta", () => {
		const { mapa } = fundir(mapaCom([conceito("c-a", "A"), conceito("c-b", "B")]), [
			{ id: "c-a", nome: "A", descricao: "", locais: ["página 1"] },
			{ id: null, nome: "N1", descricao: "", locais: ["página 1"] },
			{ id: null, nome: "N2", descricao: "", locais: ["página 2"] },
		]);
		expect(nomes(mapa)).toEqual(["A", "N1", "N2", "B"]);
	});

	it("o primeiro da resposta entra logo antes do próximo item que já existe", () => {
		const { mapa } = fundir(mapaCom([conceito("c-a", "A"), conceito("c-b", "B")]), [
			{ id: null, nome: "N1", descricao: "", locais: ["página 1"] },
			{ id: null, nome: "N2", descricao: "", locais: ["página 1"] },
			{ id: "c-b", nome: "B", descricao: "", locais: ["página 2"] },
		]);
		expect(nomes(mapa)).toEqual(["A", "N1", "N2", "B"]);
	});

	it("sem nenhum item que já existe, os novos vão para o fim", () => {
		const { mapa } = fundir(mapaCom([conceito("c-a", "A")]), [
			{ id: null, nome: "N1", descricao: "", locais: ["página 1"] },
			{ id: null, nome: "N2", descricao: "", locais: ["página 2"] },
		]);
		expect(nomes(mapa)).toEqual(["A", "N1", "N2"]);
	});

	it("itens com o mesmo nome (sem maiúsculas e acentos) viram um só", () => {
		const { mapa, novos, descartados } = fundir(mapaVazio(), [
			{ id: null, nome: "Regressão Linear", descricao: "primeira", locais: ["página 1"] },
			{ id: null, nome: "regressao  linear", descricao: "segunda", locais: ["página 2", "página 1"] },
		]);
		expect(novos).toBe(1);
		expect(descartados).toBe(0);
		expect(mapa.conceitos).toHaveLength(1);
		expect(mapa.conceitos[0]).toMatchObject({ nome: "Regressão Linear", descricao: "primeira" });
		expect(mapa.conceitos[0]!.referencias.map((item) => item.local)).toEqual(["página 1", "página 2"]);
	});

	it("o mesmo nome com um id existente reforça esse conceito", () => {
		const { mapa, novos, reforcados } = fundir(mapaCom([conceito("c-a", "Média")]), [
			{ id: null, nome: "Média", descricao: "", locais: ["página 1"] },
			{ id: "c-a", nome: "média", descricao: "", locais: ["página 2"] },
		]);
		expect(novos).toBe(0);
		expect(reforcados).toBe(1);
		expect(mapa.conceitos[0]!.referencias.map((item) => item.local)).toEqual(["página 1", "página 2"]);
	});

	it("marca novo só depois da primeira aprovação, e aprovado passa a alterado", () => {
		const rascunho = fundir(mapaVazio(), [{ id: null, nome: "A", descricao: "", locais: ["página 1"] }]).mapa;
		expect(rascunho.conceitos[0]!.novo).toBeUndefined();
		expect(rascunho.situacao).toBe("rascunho");
		const aprovado = aprovar(rascunho, AGORA);
		const depois = fundir(aprovado, [{ id: null, nome: "B", descricao: "", locais: ["página 2"] }]).mapa;
		expect(depois.conceitos[1]!.novo).toBe(true);
		expect(depois.situacao).toBe("alterado");
		expect(depois.aprovadoEm).toBe(AGORA.toISOString());
	});

	it("uma fusão que não muda nada deixa o aprovado como está", () => {
		const aprovado = aprovar(mapaCom([conceito("c-a", "A", { referencias: [ref("aula.pdf", "página 1", "pagina-001")] })]), AGORA);
		const { mapa } = fundir(aprovado, [{ id: "c-a", nome: "A", descricao: "", locais: ["página 1"] }]);
		expect(mapa.situacao).toBe("aprovado");
	});

	it("ignora item malformado", () => {
		const resultado = { conceitos: [null, { id: 3, nome: "  ", locais: "x" }, { id: 7, nome: "Ok", locais: ["página 3"] }] } as unknown as ResultadoMapeador;
		const { mapa, descartados } = fundirResultado(mapaVazio(), { arquivo: "a.pdf", trechos: TRECHOS, resultado, agora: AGORA });
		expect(descartados).toBe(2);
		expect(nomes(mapa)).toEqual(["Ok"]);
		expect(fundirResultado(mapaVazio(), { arquivo: "a.pdf", trechos: TRECHOS, resultado: {} as ResultadoMapeador }).novos).toBe(0);
	});

	it("marcarArquivoMapeado grava arquivos[arquivo] e passa aprovado a alterado", () => {
		const aprovado = aprovar(
			mapaCom([conceito("c-a", "A", { referencias: [ref("aula.pdf", "página 1", "pagina-001")] }), conceito("c-b", "B", { origem: "usuario" })]),
			AGORA,
		);
		const mapa = marcarArquivoMapeado(aprovado, "aula.pdf", { hash: "h1", modelo: "openrouter/x", custo: 0.01, agora: AGORA });
		expect(mapa.arquivos["aula.pdf"]).toEqual({ hash: "h1", mapeadoEm: AGORA.toISOString(), modelo: "openrouter/x", custo: 0.01, conceitos: 1 });
		expect(mapa.situacao).toBe("alterado");
		expect(aprovado.arquivos).toEqual({});
	});
});

describe("operações", () => {
	const base = () =>
		mapaCom([conceito("c-a", "A"), conceito("c-b", "B"), conceito("c-c", "C"), conceito("c-u", "Meu", { origem: "usuario" })]);

	it("tirar e trazer", () => {
		const fora = aplicarOperacoes(base(), [{ tipo: "tirar", id: "c-a" }]).mapa;
		expect(fora.conceitos[0]!.fora).toBe(true);
		const dentro = aplicarOperacoes(fora, [{ tipo: "trazer", id: "c-a" }]).mapa;
		expect("fora" in dentro.conceitos[0]!).toBe(false);
	});

	it("prioridade", () => {
		const { mapa, ignoradas } = aplicarOperacoes(base(), [
			{ tipo: "prioridade", id: "c-b", valor: "alta" },
			{ tipo: "prioridade", id: "c-c", valor: "urgente" as never },
		]);
		expect(mapa.conceitos[1]!.prioridade).toBe("alta");
		expect(mapa.conceitos[2]!.prioridade).toBe("normal");
		expect(ignoradas).toBe(1);
	});

	it("mover para o começo e para depois de outro", () => {
		expect(ids(aplicarOperacoes(base(), [{ tipo: "mover", id: "c-c", depoisDe: null }]).mapa)).toEqual(["c-c", "c-a", "c-b", "c-u"]);
		expect(ids(aplicarOperacoes(base(), [{ tipo: "mover", id: "c-a", depoisDe: "c-c" }]).mapa)).toEqual(["c-b", "c-c", "c-a", "c-u"]);
		const { ignoradas } = aplicarOperacoes(base(), [
			{ tipo: "mover", id: "c-a", depoisDe: "c-a" },
			{ tipo: "mover", id: "c-a", depoisDe: "c-x" },
		]);
		expect(ignoradas).toBe(2);
	});

	it("editar nome e descrição; nome vazio não vale", () => {
		const { mapa, ignoradas } = aplicarOperacoes(base(), [
			{ tipo: "editar", id: "c-a", nome: "  Novo   nome ", descricao: " desc " },
			{ tipo: "editar", id: "c-b", nome: "   ", descricao: "não entra" },
		]);
		expect(mapa.conceitos[0]).toMatchObject({ nome: "Novo nome", descricao: "desc" });
		expect(mapa.conceitos[1]).toMatchObject({ nome: "B", descricao: "" });
		expect(ignoradas).toBe(1);
	});

	it("adicionar no fim, no começo e depois de um", () => {
		const { mapa, ignoradas } = aplicarOperacoes(
			base(),
			[
				{ tipo: "adicionar", id: "c-n1", nome: "Fim" },
				{ tipo: "adicionar", id: "c-n2", nome: "Começo", descricao: "d", depoisDe: null },
				{ tipo: "adicionar", id: "c-n3", nome: "Meio", depoisDe: "c-a" },
				{ tipo: "adicionar", id: "c-a", nome: "Repetido" },
				{ tipo: "adicionar", id: "c-n4", nome: "" },
				{ tipo: "adicionar", id: "c-n5", nome: "X", depoisDe: "c-x" },
			],
			AGORA,
		);
		expect(ids(mapa)).toEqual(["c-n2", "c-a", "c-n3", "c-b", "c-c", "c-u", "c-n1"]);
		expect(mapa.conceitos[0]).toEqual({ id: "c-n2", nome: "Começo", descricao: "d", referencias: [], prioridade: "normal", origem: "usuario", criadoEm: AGORA.toISOString() });
		expect(ignoradas).toBe(3);
	});

	it("apagar só o de origem usuario", () => {
		const { mapa, ignoradas } = aplicarOperacoes(base(), [
			{ tipo: "apagar", id: "c-u" },
			{ tipo: "apagar", id: "c-a" },
		]);
		expect(ids(mapa)).toEqual(["c-a", "c-b", "c-c"]);
		expect(ignoradas).toBe(1);
	});

	it("id que não existe e tipo desconhecido são ignorados e contados; a entrada não muda", () => {
		const antes = base();
		const copia = structuredClone(antes);
		const { mapa, ignoradas, mudou } = aplicarOperacoes(antes, [
			{ tipo: "tirar", id: "c-x" },
			{ tipo: "trazer", id: "c-x" },
			{ tipo: "prioridade", id: "c-x", valor: "baixa" },
			{ tipo: "mover", id: "c-x", depoisDe: null },
			{ tipo: "editar", id: "c-x", nome: "x" },
			{ tipo: "apagar", id: "c-x" },
			{ tipo: "explodir", id: "c-a" } as never,
		]);
		expect(ignoradas).toBe(7);
		expect(mudou).toBe(false);
		expect(mapa).toEqual(copia);
		expect(antes).toEqual(copia);
	});

	it("aprovado passa a alterado só quando algo muda de verdade", () => {
		const aprovado = aprovar(base(), AGORA);
		const nada = aplicarOperacoes(aprovado, [
			{ tipo: "trazer", id: "c-a" },
			{ tipo: "prioridade", id: "c-a", valor: "normal" },
			{ tipo: "mover", id: "c-b", depoisDe: "c-a" },
			{ tipo: "editar", id: "c-a", nome: "A" },
			{ tipo: "tirar", id: "c-x" },
		]);
		expect(nada.mudou).toBe(false);
		expect(nada.mapa.situacao).toBe("aprovado");
		const algo = aplicarOperacoes(aprovado, [{ tipo: "tirar", id: "c-a" }]);
		expect(algo.mudou).toBe(true);
		expect(algo.mapa.situacao).toBe("alterado");
		expect(aplicarOperacoes(base(), [{ tipo: "tirar", id: "c-a" }]).mapa.situacao).toBe("rascunho");
	});
});

describe("aprovar", () => {
	it("aprova, guarda a data e limpa os novos", () => {
		const antes = mapaCom([conceito("c-a", "A", { novo: true }), conceito("c-b", "B", { fora: true, novo: true })], { situacao: "alterado", aprovadoEm: "2026-01-01T00:00:00.000Z" });
		const mapa = aprovar(antes, AGORA);
		expect(mapa.situacao).toBe("aprovado");
		expect(mapa.aprovadoEm).toBe(AGORA.toISOString());
		expect(mapa.conceitos.some((item) => "novo" in item)).toBe(false);
		expect(mapa.conceitos[1]!.fora).toBe(true);
		expect(antes.conceitos[0]!.novo).toBe(true);
	});

	it("sem nenhum conceito dentro, erro", () => {
		expect(() => aprovar(mapaVazio(), AGORA)).toThrow(ErroMapa);
		expect(() => aprovar(mapaCom([conceito("c-a", "A", { fora: true })]), AGORA)).toThrow(/nenhum conceito dentro/);
	});
});

describe("material removido e sem fonte", () => {
	const doisArquivos = () =>
		mapaCom(
			[
				conceito("c-a", "A", { referencias: [ref("aula.pdf", "página 1", "pagina-001")] }),
				conceito("c-b", "B", { referencias: [ref("aula.pdf", "página 2", "pagina-002"), ref("lista.pdf", "página 1", "pagina-001")] }),
				conceito("c-u", "U", { origem: "usuario" }),
			],
			{ arquivos: { "aula.pdf": { hash: "h", mapeadoEm: AGORA.toISOString(), modelo: "m", custo: 0, conceitos: 2 } } },
		);

	it("semFonte: só o de origem material sem referência", () => {
		expect(semFonte(conceito("c", "x"))).toBe(true);
		expect(semFonte(conceito("c", "x", { origem: "usuario" }))).toBe(false);
		expect(semFonte(conceito("c", "x", { referencias: [ref("a", "b", "c")] }))).toBe(false);
	});

	it("tirarReferenciasDoArquivo tira as referências e conta os que ficaram sem fonte, sem tirar arquivos[...]", () => {
		const { mapa, semFonte: quantos } = tirarReferenciasDoArquivo(doisArquivos(), "aula.pdf");
		expect(quantos).toBe(1);
		expect(mapa.conceitos[0]!.referencias).toEqual([]);
		expect(mapa.conceitos[1]!.referencias).toEqual([ref("lista.pdf", "página 1", "pagina-001")]);
		expect(mapa.arquivos["aula.pdf"]).toBeDefined();
	});

	it("removerArquivoDoMapa tira também arquivos[arquivo]; o sem fonte fica; aprovado passa a alterado", () => {
		const aprovado = aprovar(doisArquivos(), AGORA);
		const { mapa, semFonte: quantos } = removerArquivoDoMapa(aprovado, "aula.pdf");
		expect(quantos).toBe(1);
		expect(ids(mapa)).toEqual(["c-a", "c-b", "c-u"]);
		expect(mapa.arquivos).toEqual({});
		expect(mapa.situacao).toBe("alterado");
		expect(contarMapa(mapa)).toEqual({ dentro: 3, fora: 0, semFonte: 1, novos: 0, arquivos: 0 });
		expect(removerArquivoDoMapa(aprovado, "outro.pdf").mapa.situacao).toBe("aprovado");
	});
});

describe("origem tema", () => {
	const tema = (nome: string, descricao = "") => ({ nome, descricao });

	it("fundirTema: no fim, na ordem, origem tema, sem referências, prioridade normal", () => {
		const antes = mapaCom([conceito("c-a", "Limite")]);
		const { mapa, novos } = fundirTema(antes, [tema(" Derivada ", " taxa "), tema("Integral")], AGORA);
		expect(novos).toBe(2);
		expect(nomes(mapa)).toEqual(["Limite", "Derivada", "Integral"]);
		expect(mapa.conceitos[1]).toMatchObject({ nome: "Derivada", descricao: "taxa", referencias: [], prioridade: "normal", origem: "tema", criadoEm: AGORA.toISOString() });
		expect(mapa.conceitos[1]!.id).toMatch(/^c-[0-9a-z]{12}-[0-9a-f]{4}$/);
		expect(mapa.conceitos[1]!.novo).toBeUndefined();
		expect(new Set(ids(mapa)).size).toBe(3);
		expect(mapa.situacao).toBe("rascunho");
		expect(antes.conceitos).toHaveLength(1);
	});

	it("fundirTema: não repete nome do mapa (inclusive fora) nem da própria lista; item sem nome não entra", () => {
		const antes = mapaCom([conceito("c-a", "Regressão linear"), conceito("c-b", "Resíduo", { fora: true })]);
		const { mapa, novos } = fundirTema(
			antes,
			[tema("regressao  LINEAR"), tema("Residuo"), tema("Correlação", "primeira"), tema("correlacao", "segunda"), tema("  "), null as never, { descricao: "x" } as never],
			AGORA,
		);
		expect(novos).toBe(1);
		expect(nomes(mapa)).toEqual(["Regressão linear", "Resíduo", "Correlação"]);
		expect(mapa.conceitos[2]!.descricao).toBe("primeira");
	});

	it("fundirTema: novo se o mapa tem aprovadoEm; aprovado passa a alterado só se entrou algo", () => {
		const aprovado = aprovar(mapaCom([conceito("c-a", "A")]), AGORA);
		const { mapa } = fundirTema(aprovado, [tema("B")], AGORA);
		expect(mapa.conceitos[1]!.novo).toBe(true);
		expect(mapa.situacao).toBe("alterado");
		const nada = fundirTema(aprovado, [tema("a")], AGORA);
		expect(nada.novos).toBe(0);
		expect(nada.mapa.situacao).toBe("aprovado");
		expect(fundirTema(aprovado, [], AGORA).mapa).toEqual(aprovado);
	});

	it("apagar vale para usuario e tema, não para material", () => {
		const base = mapaCom([conceito("c-m", "M"), conceito("c-u", "U", { origem: "usuario" }), conceito("c-t", "T", { origem: "tema" })]);
		const { mapa, ignoradas, mudou } = aplicarOperacoes(base, [
			{ tipo: "apagar", id: "c-t" },
			{ tipo: "apagar", id: "c-u" },
			{ tipo: "apagar", id: "c-m" },
		]);
		expect(ids(mapa)).toEqual(["c-m"]);
		expect(ignoradas).toBe(1);
		expect(mudou).toBe(true);
	});

	it("semFonte: um conceito de tema sem referência não é sem fonte", () => {
		expect(semFonte(conceito("c", "x", { origem: "tema" }))).toBe(false);
		expect(contarMapa(mapaCom([conceito("c-t", "T", { origem: "tema" })])).semFonte).toBe(0);
	});
});

describe("dividirEmPartes", () => {
	const t = (tamanho: number) => ({ texto: "x".repeat(tamanho) });
	it("junta até o limite sem cortar um trecho", () => {
		expect(dividirEmPartes([t(4), t(4), t(2), t(3)], 10).map((parte) => parte.map((item) => item.texto.length))).toEqual([[4, 4, 2], [3]]);
	});
	it("um trecho maior que o limite fica sozinho", () => {
		expect(dividirEmPartes([t(3), t(15), t(3)], 10).map((parte) => parte.map((item) => item.texto.length))).toEqual([[3], [15], [3]]);
	});
	it("aceita os caracteres contados e nenhum trecho dá nenhuma parte", () => {
		expect(dividirEmPartes([{ caracteres: 70_000 }, { caracteres: 60_000 }])).toHaveLength(2);
		expect(dividirEmPartes([])).toEqual([]);
	});
});

describe("no disco", () => {
	let dados = "";
	let materia = "";

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-mapa-"));
		materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	/** Grava um .extraido como o núcleo grava: os .md com cabeçalho e o manifesto. */
	async function extraido(arquivo: string, hash: string, trechos: Array<{ local: string; nome: string; texto: string }>) {
		const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
		await mkdir(pasta, { recursive: true });
		for (const trecho of trechos) {
			await writeFile(join(pasta, `${trecho.nome}.md`), `---\narquivo: ${arquivo}\nlocal: ${trecho.local}\norigem: texto\n---\n\n${trecho.texto}\n`, "utf8");
		}
		const manifesto = { versao: 1, arquivo, hash, tamanho: 1, tipo: "pdf", extraidoEm: AGORA.toISOString(), custo: 0, avisos: [], trechos: trechos.map(({ local, nome }) => ({ local, nome, origem: "texto" })) };
		await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");
	}

	it("sem arquivo, o mapa vazio; grava e lê de volta, em JSON com tabulação", async () => {
		expect(await lerMapa(dados, materia)).toEqual(mapaVazio());
		const mapa = aprovar(mapaCom([conceito("c-a", "A", { novo: true, fora: true }), conceito("c-b", "B")]), AGORA);
		await gravarMapa(dados, materia, mapa);
		expect(await lerMapa(dados, materia)).toEqual(mapa);
		const texto = await readFile(caminhoDoMapa(dados, materia), "utf8");
		expect(texto.startsWith('{\n\t"versao": 1,\n\t"situacao": "aprovado",\n\t"aprovadoEm"')).toBe(true);
		expect(texto.endsWith("}\n")).toBe(true);
	});

	it("JSON inválido dá erro claro e o arquivo não é sobrescrito", async () => {
		await writeFile(caminhoDoMapa(dados, materia), "{ quebrado", "utf8");
		await expect(lerMapa(dados, materia)).rejects.toThrow(ErroMapa);
		await expect(lerMapa(dados, materia)).rejects.toThrow(/JSON está inválido/);
		expect(await readFile(caminhoDoMapa(dados, materia), "utf8")).toBe("{ quebrado");
		await writeFile(caminhoDoMapa(dados, materia), '{"versao": 2}', "utf8");
		await expect(lerMapa(dados, materia)).rejects.toThrow(/formato/);
	});

	it("pendentes: hash ausente ou diferente; caracteres sem o cabeçalho", async () => {
		await extraido("aula-01.pdf", "h1", [
			{ local: "página 1", nome: "pagina-001", texto: "abcde" },
			{ local: "página 2", nome: "pagina-002", texto: "xyz" },
		]);
		await extraido("listas/l1.pdf", "h2", [{ local: "página 1", nome: "pagina-001", texto: "1234567890" }]);
		await extraido("velha.pdf", "h3", [{ local: "página 1", nome: "pagina-001", texto: "a" }]);
		let mapa = marcarArquivoMapeado(mapaVazio(), "listas/l1.pdf", { hash: "antigo", modelo: "m", custo: 0 });
		mapa = marcarArquivoMapeado(mapa, "velha.pdf", { hash: "h3", modelo: "m", custo: 0 });
		const pendentes = await lerPendentes(dados, materia, mapa);
		expect(pendentes.map((item) => item.arquivo)).toEqual(["aula-01.pdf", "listas/l1.pdf"]);
		expect(pendentes[0]).toEqual({
			arquivo: "aula-01.pdf",
			tipo: "pdf",
			hash: "h1",
			trechos: [
				{ local: "página 1", nome: "pagina-001", caracteres: 5 },
				{ local: "página 2", nome: "pagina-002", caracteres: 3 },
			],
			caracteres: 8,
		});
		expect(pendentes[1]!.caracteres).toBe(10);
	});

	it("sem .extraido, nenhum pendente; lerTrechos devolve o corpo sem cabeçalho", async () => {
		expect(await lerPendentes(dados, materia, mapaVazio())).toEqual([]);
		await extraido("listas/l1.pdf", "h", [{ local: "célula 1", nome: "celula-001", texto: "print(1)\n\nfim" }]);
		expect(await lerTrechos(dados, materia, "listas/l1.pdf")).toEqual([{ local: "célula 1", nome: "celula-001", texto: "print(1)\n\nfim" }]);
		await expect(lerTrechos(dados, materia, "nao-tem.pdf")).rejects.toThrow(ErroMapa);
	});

	it("lê um mapa com conceitos de origem tema e um antigo, sem tema", async () => {
		const comTema = fundirTema(mapaCom([conceito("c-a", "A")]), [{ nome: "B", descricao: "" }], AGORA).mapa;
		await gravarMapa(dados, materia, comTema);
		expect(await lerMapa(dados, materia)).toEqual(comTema);
		const antigo = { versao: 1, situacao: "rascunho", conceitos: [conceito("c-a", "A"), conceito("c-u", "U", { origem: "usuario" })], arquivos: {} };
		await writeFile(caminhoDoMapa(dados, materia), JSON.stringify(antigo), "utf8");
		expect(await lerMapa(dados, materia)).toEqual(antigo);
	});

	it("montou_mapa_do_tema no eventos.jsonl da matéria", async () => {
		await registrarMapaDoTema(dados, materia, { tema: "P1: regressão", novos: 7, custo: 0.02, modelo: "openrouter/x" }, { sessao: "s2" });
		const [evento] = (await lerEventos(eventosMateria(dados, materia))).eventos.slice(1);
		expect(evento).toMatchObject({ verbo: "montou_mapa_do_tema", sessao: "s2", objeto: { materia }, resultado: { novos: 7, custo: 0.02, tema: "P1: regressão" }, contexto: { modelo: "openrouter/x" } });
	});

	it("grava os quatro eventos no eventos.jsonl da matéria", async () => {
		await registrarMapeamento(dados, materia, { arquivo: "a.pdf", novos: 2, reforcados: 1, descartados: 0, partes: 1, custo: 0.01, modelo: "openrouter/x" }, { sessao: "s1" });
		await registrarMaterialRemovidoDoMapa(dados, materia, "a.pdf", 2);
		await registrarRevisaoMapa(dados, materia, "e1", "tirar");
		await registrarAprovacaoMapa(dados, materia, mapaCom([conceito("c-a", "A"), conceito("c-b", "B", { fora: true })]));
		const eventos = (await lerEventos(eventosMateria(dados, materia))).eventos.slice(1);
		expect(eventos.map(({ verbo, objeto, resultado, contexto }) => ({ verbo, objeto, resultado, contexto }))).toEqual([
			{ verbo: "mapeou_material", objeto: { materia, arquivo: "a.pdf" }, resultado: { novos: 2, reforcados: 1, descartados: 0, partes: 1, custo: 0.01 }, contexto: { modelo: "openrouter/x" } },
			{ verbo: "atualizou_mapa", objeto: { materia, arquivo: "a.pdf" }, resultado: { motivo: "material_removido", semFonte: 2 }, contexto: undefined },
			{ verbo: "revisou_mapa", objeto: { materia }, resultado: { edicao: "e1", tipo: "tirar" }, contexto: undefined },
			{ verbo: "aprovou_mapa", objeto: { materia }, resultado: { conceitos: 1, fora: 1 }, contexto: undefined },
		]);
		expect(eventos[0]!.sessao).toBe("s1");
	});
});
