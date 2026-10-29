// Testes dos termos-chave e dos pedidos de explicação no disco (docs/termos.md),
// numa pasta de dados temporária: o glossario.json (sem arquivo, ida e volta,
// ilegível nunca sobrescrito), o glossário na tela com os módulos do disco,
// "Marcar os termos" (o módulo, o glossário e o marcou_termos), os pedidos de
// explicação (o pedido, a explicação com o pediu_explicacao, o tirar), o
// "Guardar no glossário" (guardou_termo) e o <módulo>.json mantendo as
// explicacoes ao ser lido, gravado e reescrito.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gravarBlocoReescrito } from "./escrita.ts";
import { lerEventos } from "./eventos.ts";
import { eventosAprendiz, eventosMateria } from "./materias.ts";
import { type Bloco, caminhoDoModulo, gravarModulo, lerModulo, type ModuloGerado } from "./modulos.ts";
import {
	arquivoGlossario,
	type Glossario,
	glossarioParaATela,
	gravarExplicacao,
	gravarGlossario,
	guardarTermo,
	juntarNoDisco,
	lerGlossario,
	registrarMarcacao,
	registrarPedidoExplicacao,
	type Termo,
	tirarPedidoExplicacao,
} from "./termos.ts";

const AGORA = new Date("2026-10-29T13:00:00.000Z");
const DEPOIS = new Date("2026-10-29T14:00:00.000Z");
const MATERIA = "ri";
const CURSO = "p1-busca";

const explicacao = (id: string, texto: string): Bloco => ({ id, tipo: "explicacao", conceitos: ["c-a"], formato: "conceito", texto, referencias: [] });

const moduloGerado = (id = "m1"): ModuloGerado => ({
	versao: 1,
	id,
	curso: CURSO,
	materia: MATERIA,
	situacao: "gerado",
	licoes: [
		{ id: "l1", titulo: "Radicais", objetivo: "", conceitos: ["c-a"], blocos: [explicacao("l1-b1", "Um radical é a parte que sobra."), explicacao("l1-b2", "Os radicais e o lema.")] },
		{ id: "l2", titulo: "Lemas", objetivo: "", conceitos: ["c-a"], blocos: [explicacao("l2-b1", "O lema vem do dicionário; os radicais não.")] },
	],
	geradoEm: AGORA.toISOString(),
	modelo: "teste/modelo-x",
	custo: 0.1,
	materiaisUsados: [],
});

const termo = (id: string, nome: string, extra: Partial<Termo> = {}): Termo => ({
	id,
	termo: nome,
	definicao: `Definição de ${nome}.`,
	explicado: null,
	origem: "geracao",
	criadoEm: AGORA.toISOString(),
	alteradoEm: AGORA.toISOString(),
	...extra,
});

let dados = "";

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-termos-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

const texto = (modulo: ModuloGerado, licao: number, bloco: number) => (modulo.licoes[licao]!.blocos[bloco] as Extract<Bloco, { tipo: "explicacao" }>).texto;

describe("o glossario.json", () => {
	it("sem arquivo, vazio; gravar e ler: ida e volta, com os campos na ordem", async () => {
		expect(await lerGlossario(dados, MATERIA, CURSO)).toEqual({ versao: 1, termos: [] });
		const glossario: Glossario = {
			versao: 1,
			termos: [{ alteradoEm: AGORA.toISOString(), origem: "pedido", explicado: { explicacao: "x-1", bloco: "l1-b1", licao: "l1", modulo: "m1" }, definicao: "D.", termo: "radical", id: "t-radical", criadoEm: AGORA.toISOString() } as Termo],
		};
		await gravarGlossario(dados, MATERIA, CURSO, glossario);
		const lido = await lerGlossario(dados, MATERIA, CURSO);
		expect(lido).toEqual(glossario);
		const bruto = await readFile(arquivoGlossario(dados, MATERIA, CURSO), "utf8");
		expect(Object.keys(JSON.parse(bruto).termos[0])).toEqual(["id", "termo", "definicao", "explicado", "origem", "criadoEm", "alteradoEm"]);
		expect(Object.keys(JSON.parse(bruto).termos[0].explicado)).toEqual(["modulo", "licao", "bloco", "explicacao"]);
		expect(arquivoGlossario(dados, MATERIA, CURSO)).toBe(join(dados, "materias", MATERIA, "cursos", CURSO, "glossario.json"));
	});

	it("um arquivo ilegível é erro claro (e quem chama não grava por cima); um id que vira pasta é recusado", async () => {
		const arquivo = arquivoGlossario(dados, MATERIA, CURSO);
		await mkdir(dirname(arquivo), { recursive: true });
		for (const conteudo of ["{x", JSON.stringify({ versao: 2, termos: [] }), JSON.stringify({ versao: 1, termos: [{ id: "t-a" }] }), JSON.stringify({ versao: 1, termos: [termo("t-a", "a"), termo("t-a", "b")] }), JSON.stringify({ versao: 1, termos: [{ ...termo("t-a", "a"), origem: "outra" }] }), JSON.stringify({ versao: 1, termos: [{ ...termo("t-a", "a"), explicado: { modulo: "m1" } }] })]) {
			await writeFile(arquivo, conteudo, "utf8");
			await expect(lerGlossario(dados, MATERIA, CURSO)).rejects.toThrow("nada foi gravado por cima");
		}
		expect(() => arquivoGlossario(dados, MATERIA, "../x")).toThrow("não é válido");
	});
});

describe("o <módulo>.json mantém as explicacoes", () => {
	it("ler, gravar e reescrever um bloco mantêm; uma lista que não é de objetos deixa o arquivo ilegível", async () => {
		const modulo = { ...moduloGerado(), explicacoes: [{ id: "x-1", licao: "l1", bloco: "l1-b1", versao: 1, trecho: "radical", tipo: "nao_sei" as const, em: AGORA.toISOString(), explicacao: "E.", termo: null }] };
		await gravarModulo(dados, modulo);
		expect((await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado).toMatchObject({ explicacoes: modulo.explicacoes });
		const reescrito = await gravarBlocoReescrito(dados, MATERIA, CURSO, "m1", "l1", "l1-b1", explicacao("l1-b1", "Outro texto."), { retornoId: "r-1", modelo: "teste/modelo-x", custo: 0 });
		expect(reescrito.explicacoes).toEqual(modulo.explicacoes);
		expect(((await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado).explicacoes).toEqual(modulo.explicacoes);
		await writeFile(caminhoDoModulo(dados, MATERIA, CURSO, "m1"), JSON.stringify({ ...modulo, explicacoes: ["x"] }), "utf8");
		await expect(lerModulo(dados, MATERIA, CURSO, "m1")).rejects.toThrow("explicacoes");
	});
});

describe("o glossário na tela e juntar no disco", () => {
	it("o lugar de cada termo pelos módulos do disco (um ilegível conta como sem módulo); o glossário ilegível é erro", async () => {
		await gravarModulo(dados, moduloGerado("m2"));
		await mkdir(dirname(caminhoDoModulo(dados, MATERIA, CURSO, "m3")), { recursive: true });
		await writeFile(caminhoDoModulo(dados, MATERIA, CURSO, "m3"), "{x", "utf8");
		await gravarGlossario(dados, MATERIA, CURSO, {
			versao: 1,
			termos: [
				termo("t-a", "a", { explicado: { modulo: "m1", licao: "l1", bloco: "l1-b1" } }),
				termo("t-b", "b", { explicado: { modulo: "m2", licao: "l2", bloco: "l2-b1" } }),
				termo("t-c", "c", { explicado: { modulo: "m3", licao: "l1", bloco: "l1-b1" } }),
				termo("t-d", "d"),
			],
		});
		const esqueleto = [
			{ id: "m1", nome: "Radicais e lemas" },
			{ id: "m2", nome: "Outro" },
			{ id: "m3", nome: "Ilegível" },
		];
		const naTela = await glossarioParaATela(dados, MATERIA, CURSO, moduloGerado("m1"), esqueleto);
		expect(naTela.map((item) => item.lugar && [item.lugar.numeroModulo, item.lugar.tituloModulo, item.lugar.numeroLicao, item.lugar.tituloLicao])).toEqual([[1, "Radicais e lemas", 1, "Radicais"], [2, "Outro", 2, "Lemas"], null, null]);
		await writeFile(arquivoGlossario(dados, MATERIA, CURSO), "{x", "utf8");
		await expect(glossarioParaATela(dados, MATERIA, CURSO, moduloGerado("m1"), esqueleto)).rejects.toThrow("glossário");
	});

	it("juntarNoDisco: o bloco que sumiu de um módulo do disco deixa o explicado ser trocado; não grava", async () => {
		await gravarModulo(dados, moduloGerado("m2"));
		await gravarGlossario(dados, MATERIA, CURSO, { versao: 1, termos: [termo("t-a", "a", { explicado: { modulo: "m2", licao: "l1", bloco: "l1-b9" } }), termo("t-b", "b", { explicado: { modulo: "m2", licao: "l1", bloco: "l1-b1" } })] });
		const lugar = { modulo: "m1", licao: "l1", bloco: "l1-b2" };
		const juntado = await juntarNoDisco(dados, MATERIA, CURSO, { novos: [], reexplicados: [{ id: "t-a", explicado: lugar }, { id: "t-b", explicado: lugar }] }, { agora: DEPOIS });
		expect(juntado.mudou).toBe(true);
		expect(juntado.glossario.termos.map((item) => item.explicado)).toEqual([lugar, { modulo: "m2", licao: "l1", bloco: "l1-b1" }]);
		expect((await lerGlossario(dados, MATERIA, CURSO)).termos[0]!.explicado).toEqual({ modulo: "m2", licao: "l1", bloco: "l1-b9" });
		expect((await juntarNoDisco(dados, MATERIA, CURSO, { novos: [] }, { agora: DEPOIS })).mudou).toBe(false);
	});
});

describe("Marcar os termos (registrarMarcacao)", () => {
	const novoRadical = termo("t-radical", "radical", { origem: "anotacao", explicado: { modulo: "m1", licao: "l1", bloco: "l1-b1" } });

	it("as marcas sem mudar a versão, só os termos novos com marca no glossário, e o evento marcou_termos", async () => {
		await gravarModulo(dados, moduloGerado());
		const feito = await registrarMarcacao(
			dados,
			MATERIA,
			CURSO,
			"m1",
			{
				geradoEm: AGORA.toISOString(),
				versoes: { "l1-b1": 1, "l1-b2": 1, "l2-b1": 1 },
				marcas: [
					{ bloco: "l1-b2", trecho: "radicais", id: "t-radical" },
					{ bloco: "l2-b1", trecho: "radicais", id: "t-radical" },
					{ bloco: "l2-b1", trecho: "lema", id: "t-lema" },
					{ bloco: "l2-b1", trecho: "não aparece", id: "t-sem-marca" },
				],
				novos: [novoRadical, termo("t-lema", "lema", { origem: "anotacao" }), termo("t-sem-marca", "sem marca", { origem: "anotacao" })],
				custo: 0.02,
			},
			{ sessao: "s-1", agora: DEPOIS },
		);
		expect(feito).toMatchObject({ termosNovos: 2, marcas: 3 });
		const gravado = (await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado;
		expect(texto(gravado, 0, 1)).toBe("Os [radicais](termo:t-radical) e o lema.");
		expect(texto(gravado, 1, 0)).toBe("O [lema](termo:t-lema) vem do dicionário; os [radicais](termo:t-radical) não.");
		expect(gravado.licoes.flatMap((licao) => licao.blocos.map((bloco) => bloco.versao))).toEqual([undefined, undefined, undefined]);
		expect((await lerGlossario(dados, MATERIA, CURSO)).termos.map((item) => item.id)).toEqual(["t-radical", "t-lema"]);
		const eventos = (await lerEventos(eventosMateria(dados, MATERIA))).eventos;
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({ sessao: "s-1", verbo: "marcou_termos", objeto: { materia: MATERIA, curso: CURSO, modulo: "m1" }, resultado: { termosNovos: 2, marcas: 3, custo: 0.02 } });
	});

	it("um termo igual a um que entrou no disco nesse meio-tempo vira o do disco (as marcas trocadas)", async () => {
		await gravarModulo(dados, moduloGerado());
		await gravarGlossario(dados, MATERIA, CURSO, { versao: 1, termos: [termo("t-rad", "Radical")] });
		const feito = await registrarMarcacao(dados, MATERIA, CURSO, "m1", { geradoEm: AGORA.toISOString(), versoes: {}, marcas: [{ bloco: "l1-b2", trecho: "radicais", id: "t-radical" }], novos: [novoRadical], custo: 0 });
		expect(feito.termosNovos).toBe(0);
		expect(texto(feito.modulo, 0, 1)).toBe("Os [radicais](termo:t-rad) e o lema.");
		// O do disco não tinha explicado: ganha o do termo novo igual.
		expect((await lerGlossario(dados, MATERIA, CURSO)).termos).toMatchObject([{ id: "t-rad", explicado: { modulo: "m1", licao: "l1", bloco: "l1-b1" } }]);
	});

	it("o módulo gerado de novo no meio é erro, sem gravar; sem nenhuma marca, o evento vai do mesmo jeito", async () => {
		await gravarModulo(dados, moduloGerado());
		await expect(registrarMarcacao(dados, MATERIA, CURSO, "m1", { geradoEm: "outro", versoes: {}, marcas: [], novos: [], custo: 0 })).rejects.toThrow("gerado de novo");
		const feito = await registrarMarcacao(dados, MATERIA, CURSO, "m1", { geradoEm: AGORA.toISOString(), versoes: {}, marcas: [{ bloco: "l1-b1", trecho: "nada", id: "t-x" }], novos: [], custo: 0.01 });
		expect(feito.marcas).toBe(0);
		expect((await lerEventos(eventosMateria(dados, MATERIA))).eventos.map((evento) => evento.resultado)).toEqual([{ termosNovos: 0, marcas: 0, custo: 0.01 }]);
	});
});

describe("os pedidos de explicação no disco", () => {
	const pedido = { licao: "l1", bloco: "l1-b2", trecho: "radicais", tipo: "nao_sei" as const };
	const explicador = { modelo: "teste/modelo-x", prompt: { nome: "explicar-trecho.md + metodo/conceito.md", hash: "a + b" }, custo: 0.01 };

	it("o pedido sem explicação; a explicação com o pediu_explicacao; o termo guardado com o guardou_termo", async () => {
		await gravarModulo(dados, moduloGerado());
		const { modulo: pedido1, id } = await registrarPedidoExplicacao(dados, MATERIA, CURSO, "m1", pedido, { agora: AGORA });
		expect(id).toMatch(/^x-/);
		expect(pedido1.explicacoes).toEqual([{ id, licao: "l1", bloco: "l1-b2", versao: 1, trecho: "radicais", tipo: "nao_sei", em: AGORA.toISOString() }]);
		expect(((await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado).explicacoes).toHaveLength(1);

		const respondido = await gravarExplicacao(dados, MATERIA, CURSO, "m1", id, { explicacao: "Um radical é…", termo: { termo: "radical", definicao: "A parte que sobra." } }, {
			sessao: "s-1",
			agora: DEPOIS,
			explicador,
			origem: async () => ({ modelo: "teste/modelo-x", prompt: { nome: "modulo-licao.md", hash: "h" } }),
		});
		const [evento] = (await lerEventos(eventosAprendiz(dados))).eventos;
		expect(evento).toMatchObject({
			sessao: "s-1",
			verbo: "pediu_explicacao",
			objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b2", conceitos: ["c-a"] },
			resultado: { trecho: "radicais", tipo: "nao_sei", explicacao: "Um radical é…" },
			contexto: { fase: "modulo", versao: 1, modelo: "teste/modelo-x", prompt: { nome: "modulo-licao.md", hash: "h" }, explicador },
		});
		expect(respondido!.explicacoes![0]).toMatchObject({ explicacao: "Um radical é…", termo: { termo: "radical" }, evento: evento!.id, modelo: "teste/modelo-x", custo: 0.01 });
		// A segunda resposta do mesmo pedido é jogada fora.
		expect(await gravarExplicacao(dados, MATERIA, CURSO, "m1", id, { explicacao: "De novo.", termo: null }, { explicador })).toBeUndefined();

		const guardado = await guardarTermo(dados, MATERIA, CURSO, "m1", id, { sessao: "s-1", agora: DEPOIS });
		expect(guardado.termo).toMatchObject({ id: "t-radical", origem: "pedido", explicado: { modulo: "m1", licao: "l1", bloco: "l1-b2", explicacao: id } });
		const gravado = (await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado;
		expect(texto(gravado, 0, 1)).toBe("Os [radicais](termo:t-radical) e o lema.");
		expect(gravado.explicacoes![0]!.guardado).toBe("t-radical");
		expect((await lerGlossario(dados, MATERIA, CURSO)).termos.map((item) => item.id)).toEqual(["t-radical"]);
		const eventos = (await lerEventos(eventosAprendiz(dados))).eventos;
		expect(eventos[1]).toMatchObject({
			verbo: "guardou_termo",
			objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b2", explicacao: id },
			resultado: { id: "t-radical", termo: "radical", definicao: "A parte que sobra.", novo: true, marcado: true },
		});
		await expect(guardarTermo(dados, MATERIA, CURSO, "m1", id)).rejects.toThrow("já foi guardado");
	});

	it("tirar o pedido que falhou; a explicação de um módulo gerado de novo é jogada fora; módulo sem arquivo é erro", async () => {
		await gravarModulo(dados, moduloGerado());
		const { id } = await registrarPedidoExplicacao(dados, MATERIA, CURSO, "m1", pedido, { agora: AGORA });
		const tirado = await tirarPedidoExplicacao(dados, MATERIA, CURSO, "m1", id);
		expect(tirado!.explicacoes).toBeUndefined();
		expect(await tirarPedidoExplicacao(dados, MATERIA, CURSO, "m1", id)).toBeUndefined();
		const { id: outro } = await registrarPedidoExplicacao(dados, MATERIA, CURSO, "m1", pedido, { agora: AGORA });
		await gravarModulo(dados, moduloGerado());
		expect(await gravarExplicacao(dados, MATERIA, CURSO, "m1", outro, { explicacao: "E.", termo: null }, { explicador })).toBeUndefined();
		expect((await lerEventos(eventosAprendiz(dados))).eventos).toEqual([]);
		await expect(registrarPedidoExplicacao(dados, MATERIA, CURSO, "m9", pedido)).rejects.toThrow("ainda não foi gerado");
		await expect(registrarPedidoExplicacao(dados, MATERIA, CURSO, "m1", { ...pedido, bloco: "l1-b9" })).rejects.toThrow("l1-b9");
	});
});
