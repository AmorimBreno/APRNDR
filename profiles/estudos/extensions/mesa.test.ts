// Testes da extensão da mesa sem o pi: um "pi" falso com um barramento síncrono (como o
// pi.events), o pi.on e o registerTool, numa pasta de dados temporária com uma matéria, notas
// e um módulo gerado gravado pela lib. Nenhum modelo e nenhuma rede.

import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmarEtapa, type Curso, gravarCurso, novoCurso } from "../lib/cursos.ts";
import type { Diagnostico } from "../lib/diagnostico.ts";
import { calcularCalendario, type Modulo as ModuloDoEsqueleto } from "../lib/esqueleto.ts";
import { criarMateria } from "../lib/materias.ts";
import { ACAO_COMANDO_MESA, LIMITE_TRECHO_DESTAQUE, PAINEL_MESA } from "../lib/mesa-tipos.ts";
import { gravarModulo, type Licao, type ModuloGerado, VERSAO_MODULO } from "../lib/modulos.ts";
import { arquivoNota, criarNota } from "../lib/notas.ts";
import mesa, { abaEmFocoDaConversa } from "./mesa.ts";

// Estes testes cobrem as lições, que só existem com os cursos na interface (pausados desde 2026-11-24,
// ESPECIFICACAO 13.21): aqui a chave fica ligada, e os testes da pausa a desligam (chaveCursos.ligada = false).
const chaveCursos = vi.hoisted(() => ({ ligada: true }));
vi.mock("../paineis/src/painel-caderno.ts", async (original) => ({
	...(await original<typeof import("../paineis/src/painel-caderno.ts")>()),
	get CURSOS_NA_INTERFACE() {
		return chaveCursos.ligada;
	},
}));

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown; details?: unknown };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] } };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, unknown>; gravar?: boolean };

const CURSO = "p1-busca";
const AGORA = new Date("2026-10-26T13:00:00.000Z");
const MODULOS: ModuloDoEsqueleto[] = [{ id: "m1", nome: "Pesos dos termos", objetivo: "Calcular o TF-IDF.", conceitos: ["c-tf"], tipo: "normal", horas: 2 }];

let dados = "";
let materia = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
let mostrados: Mostrado[];
let entradas: Entrada[];
let ctx: Contexto;

/** O curso pronto, pela lib (só o necessário para o listarCursos e o nome do módulo). */
function cursoPronto(): Curso {
	let curso = novoCurso(CURSO, materia, { nome: "P1: busca", prazo: null, prova: "P1", horasPorSemana: 4 }, AGORA);
	curso = confirmarEtapa(curso, "materiais", { arquivos: [] }, AGORA).curso;
	curso = confirmarEtapa(curso, "objetivo", { escopo: "livre", tipo: "aplicado", motivo: "Estudo livre, sem material." }, AGORA).curso;
	curso = confirmarEtapa(curso, "mapa", { conceitos: ["c-tf"] }, AGORA).curso;
	const diagnostico = { autoavaliacao: { "c-tf": 0 }, questoes: [], respostas: {}, geradoEm: AGORA.toISOString(), modelo: "teste/modelo-x", custo: 0, concluidoEm: AGORA.toISOString() } as unknown as Diagnostico;
	curso = confirmarEtapa(curso, "diagnostico", diagnostico, AGORA).curso;
	const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: null, hoje: "2026-10-26" });
	return confirmarEtapa(curso, "esqueleto", { modulos: MODULOS, geradoEm: AGORA.toISOString(), modelo: "teste/modelo-x", custo: 0, criadoEm: AGORA.toISOString(), calendario }, AGORA).curso;
}

const licao = (id: string, titulo: string, texto: string): Licao => ({
	id,
	titulo,
	objetivo: `Entender ${titulo}.`,
	conceitos: [],
	blocos: [{ id: `${id}-b1`, tipo: "explicacao", conceitos: [], formato: "conceito", texto, referencias: [] }],
});

const SEGREDO = "SEGREDO-GABARITO";

async function gravarModuloGerado(): Promise<void> {
	const modulo: ModuloGerado = {
		versao: VERSAO_MODULO,
		id: "m1",
		curso: CURSO,
		materia,
		situacao: "gerado",
		licoes: [
			licao("l1", "Frequência do termo", "O TF conta quantas vezes o termo aparece no documento."),
			{
				...licao("l2", "Frequência inversa", "O IDF pesa os termos raros."),
				blocos: [
					{ id: "l2-b1", tipo: "explicacao", conceitos: [], formato: "conceito", texto: "O IDF pesa os termos raros.", referencias: [] },
					{
						id: "l2-b2",
						tipo: "alternativa",
						conceitos: [],
						enunciado: "O que o IDF mede?",
						alternativas: [{ texto: "A raridade do termo", correta: true }, { texto: "O tamanho do documento", confusao: SEGREDO }],
						explicacao: `${SEGREDO}: raridade.`,
						referencias: [],
					},
				],
			},
		],
		geradoEm: AGORA.toISOString(),
		modelo: "teste/modelo-x",
		custo: 0,
		materiaisUsados: [],
	};
	await gravarModulo(dados, modulo);
}

const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });
const contextoTela = (contextos: Array<Record<string, unknown>>): Entrada => ({ type: "custom_message", customType: "nucleo.contexto-tela", details: { contextos } });

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-mesa-"));
	materia = (await criarMateria(dados, { nome: "Recuperação de informação" })).id;
	await gravarCurso(dados, cursoPronto());
	await gravarModuloGerado();
	await criarNota(dados, materia, "Limites");
	await writeFile(arquivoNota(dados, materia, "Limites"), "# Limites\n\nO **limite** existe quando os dois lados concordam.\n\n## Laterais\n\nOs limites laterais podem diferir.\n", "utf8");
	entradas = [contextoDe(`materia:${materia}`)];
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas } };
	barramento = new EventEmitter();
	ferramentas = {};
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
		on: () => undefined,
		registerTool: (definicao: Ferramenta & { name: string }) => (ferramentas[definicao.name] = definicao),
	} as unknown as ExtensionAPI;
	mesa(pi);
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

const abrir = (params: Record<string, unknown>) => ferramentas.abrir_na_mesa!.execute("a", params, undefined, undefined, ctx);
const destacar = (params: Record<string, unknown>) => ferramentas.destacar_trecho!.execute("d", params, undefined, undefined, ctx);

describe("abrir_na_mesa", () => {
	it("abre uma nota: confere no disco, emite o comando passageiro e devolve 'pedido enviado à tela'", async () => {
		const resposta = await abrir({ tipo: "nota", titulo: "limites" });
		expect(resposta.isError).toBeUndefined();
		expect(resposta.content[0]!.text).toContain("Pedido enviado à tela");
		expect(mostrados).toHaveLength(1);
		const [mostrado] = mostrados;
		expect(mostrado).toMatchObject({
			painel: PAINEL_MESA,
			acao: ACAO_COMANDO_MESA,
			gravar: false,
			dados: { cmd: "abrir", tipo: "nota", caminho: `caderno/${materia}/notas/Limites`, rotulo: "Limites", foco: "previa" },
		});
		expect(typeof mostrado!.dados.id).toBe("string");
		expect(resposta.details).toEqual(mostrado!.dados);
	});

	it("abre uma lição pelo módulo e a lição (id ou título); sem lição, o módulo; o curso é achado sozinho", async () => {
		await abrir({ tipo: "licao", modulo: "m1", licao: "l2" });
		await abrir({ tipo: "licao", modulo: "m1", licao: "frequência do termo" });
		await abrir({ tipo: "licao", modulo: "m1", curso: CURSO });
		expect(mostrados.map((mostrado) => mostrado.dados)).toMatchObject([
			{ cmd: "abrir", tipo: "licao", caminho: `caderno/${materia}/cursos/${CURSO}/modulos/m1/l2`, rotulo: "Frequência inversa", foco: "previa" },
			{ cmd: "abrir", tipo: "licao", caminho: `caderno/${materia}/cursos/${CURSO}/modulos/m1/l1`, rotulo: "Frequência do termo" },
			{ cmd: "abrir", tipo: "licao", caminho: `caderno/${materia}/cursos/${CURSO}/modulos/m1`, rotulo: "Pesos dos termos" },
		]);
		expect(mostrados.every((mostrado) => mostrado.gravar === false)).toBe(true);
	});

	it("com os cursos pausados, a lição é recusada com uma frase clara e nada é emitido; a nota continua abrindo", async () => {
		chaveCursos.ligada = false;
		try {
			for (const resposta of [await abrir({ tipo: "licao", modulo: "m1", licao: "l2" }), await destacar({ trecho: "frequência", aba: "m1/l2" })]) {
				expect(resposta.isError).toBe(true);
				expect(resposta.content[0]!.text).toContain("lições estão pausadas");
			}
			expect(mostrados).toHaveLength(0);
			await abrir({ tipo: "nota", titulo: "Limites" });
			expect(mostrados.map((mostrado) => mostrado.dados)).toMatchObject([{ cmd: "abrir", tipo: "nota" }]);
		} finally {
			chaveCursos.ligada = true;
		}
	});

	it("cada comando leva um id diferente", async () => {
		await abrir({ tipo: "nota", titulo: "Limites" });
		await abrir({ tipo: "nota", titulo: "Limites" });
		await destacar({ trecho: "limites laterais", aba: "Limites" });
		const ids = mostrados.map((mostrado) => mostrado.dados.id);
		expect(ids).toHaveLength(3);
		expect(new Set(ids).size).toBe(3);
	});

	it("recusa na conversa geral (sem matéria) e não emite nada", async () => {
		entradas = [];
		for (const resposta of [await abrir({ tipo: "nota", titulo: "Limites" }), await destacar({ trecho: "limite", aba: "Limites" })]) {
			expect(resposta.isError).toBe(true);
			expect(resposta.content[0]!.text).toContain("conversa de uma matéria");
		}
		expect(mostrados).toEqual([]);
	});

	it("título inválido, com .. ou barras é recusado antes de tocar no disco; nota inexistente também", async () => {
		for (const titulo of ["../materia", "..", "a/b", "a\\b", "", "   ", "Nota: x", ".escondida", "[[Limites]]"]) {
			const resposta = await abrir({ tipo: "nota", titulo });
			expect(resposta.isError, titulo).toBe(true);
		}
		const inexistente = await abrir({ tipo: "nota", titulo: "Nada" });
		expect(inexistente).toMatchObject({ isError: true, content: [{ text: 'Não achei a nota "Nada".' }] });
		expect((await abrir({ tipo: "nota" })).isError).toBe(true);
		expect(mostrados).toEqual([]);
	});

	it("lição: módulo, lição ou curso que não existem, ids que não são ids e módulo que não foi gerado voltam como erro claro", async () => {
		const casos: Array<[Record<string, unknown>, string]> = [
			[{ tipo: "licao" }, "Diga o módulo"],
			[{ tipo: "licao", modulo: "..", licao: "l1" }, "não é um id de módulo"],
			[{ tipo: "licao", modulo: "../m1" }, "não é um id de módulo"],
			[{ tipo: "licao", modulo: "m9" }, "Não achei o módulo m9"],
			[{ tipo: "licao", modulo: "m1", licao: "l9" }, "Não achei a lição"],
			[{ tipo: "licao", modulo: "m1", licao: "../l1" }, "Não achei a lição"],
			[{ tipo: "licao", modulo: "m1", curso: "../outro" }, "Não achei o curso"],
			[{ tipo: "licao", modulo: "m1", curso: "inexistente" }, "Não achei o curso"],
		];
		for (const [params, trecho] of casos) {
			const resposta = await abrir(params);
			expect(resposta.isError, JSON.stringify(params)).toBe(true);
			expect(resposta.content[0]!.text, JSON.stringify(params)).toContain(trecho);
		}
		expect(mostrados).toEqual([]);
	});

	it("a matéria da conversa precisa existir no disco", async () => {
		entradas = [contextoDe("materia:fantasma")];
		const resposta = await abrir({ tipo: "nota", titulo: "Limites" });
		expect(resposta).toMatchObject({ isError: true, content: [{ text: 'Não achei a matéria "fantasma".' }] });
		entradas = [contextoDe("materia:../outra")];
		expect((await abrir({ tipo: "licao", modulo: "m1" })).isError).toBe(true);
		expect(mostrados).toEqual([]);
	});
});

describe("destacar_trecho", () => {
	it("destaca um trecho da nota: confere no disco (espaços juntos, sem caixa), emite o comando e devolve o pedido enviado", async () => {
		const resposta = await destacar({ trecho: "  os  LIMITES\nlaterais podem  diferir. ", aba: "Limites" });
		expect(resposta.isError).toBeUndefined();
		expect(resposta.content[0]!.text).toContain("Pedido enviado à tela");
		expect(mostrados).toHaveLength(1);
		expect(mostrados[0]).toMatchObject({
			painel: PAINEL_MESA,
			acao: ACAO_COMANDO_MESA,
			gravar: false,
			dados: { cmd: "destacar", caminho: `caderno/${materia}/notas/Limites`, trecho: "os LIMITES laterais podem diferir.", soRolar: false },
		});
	});

	it("na nota, vale o texto sem a marcação do markdown (o que a tela mostra) e o título de seção com so_rolar", async () => {
		await destacar({ trecho: "O limite existe quando os dois lados concordam.", aba: "Limites" });
		await destacar({ trecho: "Laterais", aba: "Limites", so_rolar: true });
		expect(mostrados.map((mostrado) => mostrado.dados)).toMatchObject([
			{ cmd: "destacar", trecho: "O limite existe quando os dois lados concordam.", soRolar: false },
			{ cmd: "destacar", trecho: "Laterais", soRolar: true },
		]);
	});

	it("destaca um trecho de lição (módulo/lição, ou curso/módulo/lição) e só do que o professor vê: o gabarito não vale", async () => {
		await destacar({ trecho: "o idf pesa os termos raros", aba: "m1/l2" });
		await destacar({ trecho: "Pergunta nenhuma", aba: "m1/l1" }); // não está na l1
		await destacar({ trecho: "TF conta quantas vezes", aba: `${CURSO}/m1/l1`, so_rolar: true });
		await destacar({ trecho: SEGREDO, aba: "m1/l2" });
		expect(mostrados.map((mostrado) => mostrado.dados)).toMatchObject([
			{ cmd: "destacar", caminho: `caderno/${materia}/cursos/${CURSO}/modulos/m1/l2`, soRolar: false },
			{ cmd: "destacar", caminho: `caderno/${materia}/cursos/${CURSO}/modulos/m1/l1`, soRolar: true },
		]);
	});

	it("aba só com o módulo (m1) vale para qualquer lição dele", async () => {
		await destacar({ trecho: "O que o IDF mede?", aba: "m1" });
		expect(mostrados[0]!.dados).toMatchObject({ cmd: "destacar", caminho: `caderno/${materia}/cursos/${CURSO}/modulos/m1` });
	});

	it("trecho inexistente volta ao modelo como erro claro e não emite nada", async () => {
		const naNota = await destacar({ trecho: "texto que não existe", aba: "Limites" });
		expect(naNota).toMatchObject({ isError: true });
		expect(naNota.content[0]!.text).toContain('Trecho não encontrado na nota "Limites"');
		const naLicao = await destacar({ trecho: "texto que não existe", aba: "m1/l1" });
		expect(naLicao.isError).toBe(true);
		expect(naLicao.content[0]!.text).toContain('Trecho não encontrado na lição "Frequência do termo"');
		expect((await destacar({ trecho: "   ", aba: "Limites" })).isError).toBe(true);
		expect(mostrados).toEqual([]);
	});

	it("trecho maior que o limite é recusado, mesmo que exista", async () => {
		const longo = "palavra ".repeat(100);
		await writeFile(arquivoNota(dados, materia, "Limites"), `${longo}\n`, "utf8");
		const resposta = await destacar({ trecho: longo, aba: "Limites" });
		expect(resposta.isError).toBe(true);
		expect(resposta.content[0]!.text).toContain(String(LIMITE_TRECHO_DESTAQUE));
		expect((await destacar({ trecho: "palavra ".repeat(60).trim(), aba: "Limites" })).isError).toBeUndefined();
		expect(mostrados).toHaveLength(1);
	});

	it("aba inválida (.., barras, nota ou módulo que não existem) é recusada", async () => {
		for (const aba of ["../materia", "../../x/y", "a/b/c/d", "Nada", "m9", "m1/../l1", "x/m1/l1"]) {
			const resposta = await destacar({ trecho: "limite", aba });
			expect(resposta.isError, aba).toBe(true);
		}
		expect(mostrados).toEqual([]);
	});

	it("sem aba, vale a aba em foco do último contexto da tela da conversa", async () => {
		entradas = [
			contextoDe(`materia:${materia}`),
			contextoTela([{ tipo: "licao", rotulo: "Frequência do termo", origem: `caderno/${materia}/cursos/${CURSO}/modulos/m1/l1?bloco=l1-b1&v=1&antes=x`, olho: true }]),
			// O último contexto manda: aqui a nota está em foco (a origem com âncora perde o que vem depois do "?").
			contextoTela([
				{ tipo: "licao", rotulo: "Frequência do termo", origem: `caderno/${materia}/cursos/${CURSO}/modulos/m1/l1`, olho: false },
				{ tipo: "nota", rotulo: "Limites", origem: `caderno/${materia}/notas/Limites?bloco=Laterais`, olho: true, foco: true },
			]),
		];
		const resposta = await destacar({ trecho: "limites laterais podem diferir" });
		expect(resposta.isError).toBeUndefined();
		expect(mostrados[0]!.dados).toMatchObject({ cmd: "destacar", caminho: `caderno/${materia}/notas/Limites` });
	});

	it("sem aba e sem foco no contexto: pede a aba; foco em outra matéria ou em rota que não é aba: recusa", async () => {
		const semAba = await destacar({ trecho: "limite" });
		expect(semAba.isError).toBe(true);
		expect(semAba.content[0]!.text).toContain("aba em foco");
		entradas = [contextoDe(`materia:${materia}`), contextoTela([{ tipo: "nota", rotulo: "X", origem: "caderno/outra/notas/Limites", olho: true, foco: true }])];
		expect((await destacar({ trecho: "limite" })).content[0]!.text).toContain("outra matéria");
		entradas = [contextoDe(`materia:${materia}`), contextoTela([{ tipo: "mapa", rotulo: "Mapa", origem: `caderno/${materia}/mapa`, olho: true, foco: true }])];
		expect((await destacar({ trecho: "limite" })).isError).toBe(true);
		entradas = [contextoDe(`materia:${materia}`), contextoTela([{ tipo: "nota", rotulo: "Limites", olho: true, foco: true }])];
		expect((await destacar({ trecho: "limite" })).isError).toBe(true);
		expect(mostrados).toEqual([]);
	});

	it("abaEmFocoDaConversa lê só o último contexto da tela", () => {
		expect(abaEmFocoDaConversa([])).toBeUndefined();
		expect(abaEmFocoDaConversa([contextoTela([{ origem: "caderno/a/notas/N", foco: true }]), contextoTela([{ origem: "caderno/a/notas/N", olho: true }])])).toBeUndefined();
		expect(abaEmFocoDaConversa([contextoTela([{ origem: "caderno/a/notas/N", foco: true }])])).toBe("caderno/a/notas/N");
	});
});
