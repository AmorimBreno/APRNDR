// Testes dos cursos: as regras puras (validação de cada etapa, o que cada
// confirmação invalida, a ordem das etapas, os avisos) e o disco numa pasta de
// dados temporária com uma matéria.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	caminhoDoCurso,
	comecarCurso,
	conceitosForaDoMapa,
	confirmarEtapa,
	confirmarNoDisco,
	type Curso,
	descartarCurso,
	ErroCurso,
	ETAPAS,
	type Etapa,
	etapaDoCurso,
	gravarCurso,
	hojeLocal,
	iguais,
	lerCurso,
	listarCursos,
	materiaisMudaram,
	materiaisProntos,
	nomeDaEtapa,
	novoCurso,
	oQueInvalida,
	pastaDoCurso,
	resumoDoCurso,
	validarEtapa,
} from "./cursos.ts";
import { lerEventos } from "./eventos.ts";
import { aprovar, type Conceito, gravarMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "./mapa.ts";
import { criarMateria, eventosMateria } from "./materias.ts";

const AGORA = new Date("2026-10-22T13:00:00.000Z");
const DEPOIS = new Date("2026-10-22T14:00:00.000Z");
const HOJE = "2026-10-22";

const conceito = (id: string, extra: Partial<Conceito> = {}): Conceito => ({
	id,
	nome: id,
	descricao: "",
	referencias: [],
	prioridade: "normal",
	origem: "material",
	criadoEm: AGORA.toISOString(),
	...extra,
});

/** Um mapa aprovado com c-a, c-b, c-c dentro e c-f fora. */
const mapaAprovado = (): MapaConteudo =>
	aprovar({ ...mapaVazio(), conceitos: [conceito("c-a"), conceito("c-b"), conceito("c-f", { fora: true }), conceito("c-c")] }, AGORA);

const BASICO = { nome: "P1: regressão", prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 };
const MATERIAIS = { arquivos: [{ arquivo: "aula-04.pdf", hash: "h4" }] };
const OBJETIVO = { escopo: "material_base" as const, tipo: "misto" as const, motivo: "Passar na P1." };
const MAPA = { conceitos: ["c-a", "c-b"] };

/** Um curso com as seis etapas confirmadas (diagnóstico e esqueleto com conteúdo de mentira até as partes B e C). */
function cursoCompleto(): Curso {
	let curso = novoCurso("p1-regressao", "calculo-i", BASICO, AGORA);
	curso = confirmarEtapa(curso, "materiais", MATERIAIS, AGORA).curso;
	curso = confirmarEtapa(curso, "objetivo", OBJETIVO, AGORA).curso;
	curso = confirmarEtapa(curso, "mapa", MAPA, AGORA).curso;
	curso = confirmarEtapa(curso, "diagnostico", { nivel: 1 }, AGORA).curso;
	return confirmarEtapa(curso, "esqueleto", { modulos: 2 }, AGORA).curso;
}

describe("validarEtapa", () => {
	const contexto = { hoje: HOJE };

	it("Básico: limpa o nome, tira a prova vazia e aceita sem prazo e prazo hoje", () => {
		expect(validarEtapa("basico", { nome: "  P1:   regressão ", prazo: null, prova: "  ", horasPorSemana: 2.5 }, contexto)).toEqual({
			nome: "P1: regressão",
			prazo: null,
			horasPorSemana: 2.5,
		});
		expect(validarEtapa("basico", { ...BASICO, prazo: HOJE }, contexto)).toEqual({ ...BASICO, prazo: HOJE });
		expect(validarEtapa("basico", { ...BASICO, prazo: "" }, contexto).prazo).toBeNull();
	});

	it("Básico: nome vazio, prazo inválido ou no passado e horas fora de 1 a 60", () => {
		expect(() => validarEtapa("basico", { ...BASICO, nome: "  " }, contexto)).toThrow(/nome do curso/);
		for (const prazo of ["2026-13-01", "22/11/2026", "2026-02-30", 20261120]) {
			expect(() => validarEtapa("basico", { ...BASICO, prazo }, contexto)).toThrow(/AAAA-MM-DD/);
		}
		expect(() => validarEtapa("basico", { ...BASICO, prazo: "2026-10-21" }, contexto)).toThrow(/já passou/);
		for (const horasPorSemana of [0, 61, 0.5, "4", Number.NaN, undefined]) {
			expect(() => validarEtapa("basico", { ...BASICO, horasPorSemana }, contexto)).toThrow(/de 1 a 60/);
		}
		expect(validarEtapa("basico", { ...BASICO, horasPorSemana: 1 }, contexto).horasPorSemana).toBe(1);
		expect(validarEtapa("basico", { ...BASICO, horasPorSemana: 60 }, contexto).horasPorSemana).toBe(60);
		expect(() => validarEtapa("basico", null, contexto)).toThrow(ErroCurso);
	});

	it("Materiais: em ordem de caminho, sem repetir; vazia vale; item sem hash não", () => {
		expect(
			validarEtapa("materiais", {
				arquivos: [
					{ arquivo: "b.pdf", hash: "hb" },
					{ arquivo: " a.pdf ", hash: "ha" },
					{ arquivo: "b.pdf", hash: "outro" },
				],
			}),
		).toEqual({ arquivos: [{ arquivo: "a.pdf", hash: "ha" }, { arquivo: "b.pdf", hash: "hb" }] });
		expect(validarEtapa("materiais", { arquivos: [] })).toEqual({ arquivos: [] });
		expect(() => validarEtapa("materiais", { arquivos: [{ arquivo: "a.pdf" }] })).toThrow(/hash/);
		expect(() => validarEtapa("materiais", {})).toThrow(/lista de arquivos/);
	});

	it("Objetivo: escopo e tipo conhecidos; só o material precisa de materiais confirmados", () => {
		expect(validarEtapa("objetivo", { escopo: "livre", tipo: "teorico" })).toEqual({ escopo: "livre", tipo: "teorico", motivo: "" });
		expect(() => validarEtapa("objetivo", { ...OBJETIVO, escopo: "tudo" })).toThrow(/escopo/);
		expect(() => validarEtapa("objetivo", { ...OBJETIVO, tipo: "pratico" })).toThrow(/tipo/);
		const soMaterial = { ...OBJETIVO, escopo: "so_material" };
		expect(() => validarEtapa("objetivo", soMaterial, { curso: { materiais: null } })).toThrow(/pelo menos um material/);
		expect(() => validarEtapa("objetivo", soMaterial, { curso: { materiais: { arquivos: [] } } })).toThrow(/pelo menos um material/);
		expect(validarEtapa("objetivo", soMaterial, { curso: { materiais: MATERIAIS } }).escopo).toBe("so_material");
	});

	it("Mapa: não vazio, mapa aprovado, só conceitos de dentro; fica na ordem do mapa e sem repetir", () => {
		const mapa = mapaAprovado();
		expect(validarEtapa("mapa", { conceitos: ["c-c", "c-a", "c-c"] }, { mapa })).toEqual({ conceitos: ["c-a", "c-c"] });
		expect(() => validarEtapa("mapa", { conceitos: [] }, { mapa })).toThrow(/pelo menos um conceito/);
		expect(() => validarEtapa("mapa", { conceitos: ["c-a"] }, {})).toThrow(/Falta o mapa/);
		expect(() => validarEtapa("mapa", { conceitos: ["c-a"] }, { mapa: { ...mapa, situacao: "alterado" } })).toThrow(/aprovado/);
		expect(() => validarEtapa("mapa", { conceitos: ["c-a"] }, { mapa: { ...mapa, situacao: "rascunho" } })).toThrow(/aprovado/);
		expect(() => validarEtapa("mapa", { conceitos: ["c-a", "c-f"] }, { mapa })).toThrow(/não está dentro do mapa.*c-f/);
		expect(() => validarEtapa("mapa", { conceitos: ["c-x", "c-f"] }, { mapa })).toThrow(/não estão dentro do mapa.*c-x, c-f/);
	});

	it("Diagnóstico e Esqueleto: partes B e C", () => {
		expect(() => validarEtapa("diagnostico", {})).toThrow(/parte B/);
		expect(() => validarEtapa("esqueleto", {})).toThrow(/parte C/);
		expect(() => validarEtapa("outra" as Etapa, {})).toThrow(/Etapa desconhecida/);
	});

	it("hojeLocal: a data local em AAAA-MM-DD", () => {
		expect(hojeLocal(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
	});
});

describe("iguais", () => {
	it("ignora a ordem das chaves, os espaços nas pontas e, no Básico, o nome e a prova vazia", () => {
		expect(iguais("objetivo", { tipo: "misto", escopo: "livre", motivo: " x " }, { escopo: "livre", tipo: "misto", motivo: "x" })).toBe(true);
		expect(iguais("basico", { ...BASICO, nome: "Outro" }, { prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 })).toBe(true);
		expect(iguais("basico", { prazo: null, horasPorSemana: 4, prova: "" }, { prazo: null, horasPorSemana: 4 })).toBe(true);
		expect(iguais("materiais", { arquivos: [{ arquivo: "b", hash: "1" }, { arquivo: "a", hash: "2" }] }, { arquivos: [{ arquivo: "a", hash: "2" }, { arquivo: "b", hash: "1" }] })).toBe(true);
		expect(iguais("mapa", { conceitos: ["c-a", "c-b"] }, { conceitos: ["c-b", "c-a"] })).toBe(false);
		expect(iguais("basico", BASICO, { ...BASICO, horasPorSemana: 5 })).toBe(false);
		expect(iguais("mapa", null, undefined)).toBe(true);
	});
});

describe("oQueInvalida e confirmarEtapa pela tabela", () => {
	const casos: Array<[string, Etapa, unknown, Etapa[]]> = [
		["basico: prazo", "basico", { ...BASICO, prazo: "2026-12-01" }, ["esqueleto"]],
		["basico: só o nome", "basico", { ...BASICO, nome: "Outro nome" }, []],
		["materiais: outro hash", "materiais", { arquivos: [{ arquivo: "aula-04.pdf", hash: "novo" }] }, ["mapa", "diagnostico", "esqueleto"]],
		["objetivo: motivo", "objetivo", { ...OBJETIVO, motivo: "Outro" }, ["diagnostico", "esqueleto"]],
		["objetivo: material_base → so_material", "objetivo", { ...OBJETIVO, escopo: "so_material" }, ["diagnostico", "esqueleto"]],
		["objetivo: material_base → livre", "objetivo", { ...OBJETIVO, escopo: "livre" }, ["mapa", "diagnostico", "esqueleto"]],
		["mapa: outro conceito", "mapa", { conceitos: ["c-a", "c-c"] }, ["diagnostico", "esqueleto"]],
		["diagnostico", "diagnostico", { nivel: 2 }, ["esqueleto"]],
		["esqueleto", "esqueleto", { modulos: 3 }, []],
	];

	for (const [nome, etapa, dados, esperado] of casos) {
		it(nome, () => {
			const curso = cursoCompleto();
			expect(oQueInvalida(curso, etapa, dados as never)).toEqual(esperado);
			const { curso: novo, invalidadas } = confirmarEtapa(curso, etapa, dados as never, DEPOIS);
			expect(invalidadas).toEqual(esperado);
			for (const item of ETAPAS) expect(novo[item] === null).toBe(esperado.includes(item));
			expect(novo.etapa).toBe(esperado[0] ?? "esqueleto");
			expect(novo.alteradoEm).toBe(DEPOIS.toISOString());
		});
	}

	it("de livre para outro escopo também invalida o Mapa; livre → livre não", () => {
		const curso = confirmarEtapa(cursoCompleto(), "objetivo", { ...OBJETIVO, escopo: "livre" }, AGORA).curso;
		const comMapa = confirmarEtapa(curso, "mapa", MAPA, AGORA).curso;
		expect(oQueInvalida(comMapa, "objetivo", { ...OBJETIVO, escopo: "material_base" })).toEqual(["mapa"]);
		expect(oQueInvalida(comMapa, "objetivo", { ...OBJETIVO, escopo: "livre", tipo: "teorico" })).toEqual([]);
	});

	it("a mesma coisa não invalida nada nem muda o curso", () => {
		const curso = cursoCompleto();
		const mesmas: Array<[Etapa, unknown]> = [
			["basico", { ...BASICO, prova: " P1 " }],
			["materiais", MATERIAIS],
			["objetivo", { motivo: "Passar na P1.  ", tipo: "misto", escopo: "material_base" }],
			["mapa", MAPA],
			["diagnostico", { nivel: 1 }],
			["esqueleto", { modulos: 2 }],
		];
		for (const [etapa, dados] of mesmas) {
			expect(oQueInvalida(curso, etapa, dados as never)).toEqual([]);
			const resultado = confirmarEtapa(curso, etapa, dados as never, DEPOIS);
			expect(resultado.invalidadas).toEqual([]);
			expect(resultado.curso).toEqual(curso);
		}
	});

	it("só conta as etapas que estão confirmadas", () => {
		const curso = confirmarEtapa(cursoCompleto(), "diagnostico", { nivel: 9 }, AGORA).curso;
		expect(curso.esqueleto).toBeNull();
		expect(oQueInvalida(curso, "materiais", { arquivos: [] })).toEqual(["mapa", "diagnostico"]);
	});

	it("o Básico troca o nome do curso (o id fica) sem invalidar", () => {
		const { curso, invalidadas } = confirmarEtapa(cursoCompleto(), "basico", { ...BASICO, nome: "  P1 de  verdade " }, DEPOIS);
		expect(invalidadas).toEqual([]);
		expect(curso.nome).toBe("P1 de verdade");
		expect(curso.id).toBe("p1-regressao");
		expect(curso.basico).toEqual({ prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 });
		expect(curso.alteradoEm).toBe(DEPOIS.toISOString());
	});

	it("não mexe no curso recebido", () => {
		const curso = cursoCompleto();
		const copia = structuredClone(curso);
		confirmarEtapa(curso, "materiais", { arquivos: [] }, DEPOIS);
		expect(curso).toEqual(copia);
	});
});

describe("ordem das etapas", () => {
	it("o curso novo começa com o Básico confirmado e a etapa materiais", () => {
		const curso = novoCurso("p1", "calculo-i", BASICO, AGORA);
		expect(curso).toMatchObject({ versao: 1, id: "p1", nome: "P1: regressão", materia: "calculo-i", situacao: "rascunho", etapa: "materiais" });
		expect(curso.basico).toEqual({ prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 });
		expect(curso.criadoEm).toBe(AGORA.toISOString());
		expect(curso.alteradoEm).toBe(AGORA.toISOString());
	});

	it("não deixa confirmar uma etapa com uma anterior vazia", () => {
		const curso = novoCurso("p1", "calculo-i", BASICO, AGORA);
		expect(() => confirmarEtapa(curso, "objetivo", OBJETIVO, AGORA)).toThrow(/Confirme antes a etapa Materiais/);
		expect(() => confirmarEtapa(curso, "mapa", MAPA, AGORA)).toThrow(ErroCurso);
		const invalidado = confirmarEtapa(cursoCompleto(), "materiais", { arquivos: [] }, AGORA).curso;
		expect(() => confirmarEtapa(invalidado, "diagnostico", { nivel: 1 }, AGORA)).toThrow(/Confirme antes a etapa Mapa/);
	});

	it("a etapa é a primeira não confirmada, e esqueleto com todas", () => {
		let curso = novoCurso("p1", "calculo-i", BASICO, AGORA);
		const vistas: Etapa[] = [curso.etapa];
		curso = confirmarEtapa(curso, "materiais", MATERIAIS, AGORA).curso;
		vistas.push(curso.etapa);
		curso = confirmarEtapa(curso, "objetivo", OBJETIVO, AGORA).curso;
		vistas.push(curso.etapa);
		curso = confirmarEtapa(curso, "mapa", MAPA, AGORA).curso;
		vistas.push(curso.etapa);
		expect(vistas).toEqual(["materiais", "objetivo", "mapa", "diagnostico"]);
		expect(etapaDoCurso(cursoCompleto())).toBe("esqueleto");
		expect(confirmarEtapa(cursoCompleto(), "objetivo", { ...OBJETIVO, escopo: "livre" }, AGORA).curso.etapa).toBe("mapa");
	});
});

describe("resumo e avisos", () => {
	it("resumoDoCurso e nomeDaEtapa", () => {
		const curso = cursoCompleto();
		expect(resumoDoCurso(curso)).toEqual({ id: "p1-regressao", nome: "P1: regressão", situacao: "rascunho", etapa: "esqueleto", prazo: "2026-11-20", alteradoEm: AGORA.toISOString() });
		expect(resumoDoCurso(novoCurso("x", "m", { nome: "X", prazo: null, horasPorSemana: 1 }, AGORA)).prazo).toBeNull();
		expect(ETAPAS.map(nomeDaEtapa)).toEqual(["Básico", "Materiais", "Objetivo", "Mapa", "Diagnóstico", "Esqueleto"]);
	});

	it("materiaisMudaram: arquivo a mais, a menos ou com outro hash; a ordem não importa", () => {
		const curso = confirmarEtapa(novoCurso("p1", "m", BASICO, AGORA), "materiais", { arquivos: [{ arquivo: "a", hash: "1" }, { arquivo: "b", hash: "2" }] }, AGORA).curso;
		expect(materiaisMudaram(curso, [{ arquivo: "b", hash: "2" }, { arquivo: "a", hash: "1" }])).toBe(false);
		expect(materiaisMudaram(curso, [{ arquivo: "a", hash: "1" }, { arquivo: "b", hash: "3" }])).toBe(true);
		expect(materiaisMudaram(curso, [{ arquivo: "a", hash: "1" }])).toBe(true);
		expect(materiaisMudaram(curso, [{ arquivo: "a", hash: "1" }, { arquivo: "b", hash: "2" }, { arquivo: "c", hash: "4" }])).toBe(true);
		expect(materiaisMudaram(novoCurso("p1", "m", BASICO, AGORA), [{ arquivo: "a", hash: "1" }])).toBe(false);
	});

	it("conceitosForaDoMapa: os que saíram ou foram tirados", () => {
		const curso = confirmarEtapa(cursoCompleto(), "mapa", { conceitos: ["c-a", "c-b", "c-c"] }, AGORA).curso;
		const mapa = mapaAprovado();
		expect(conceitosForaDoMapa(curso, mapa)).toEqual([]);
		mapa.conceitos = mapa.conceitos.filter((item) => item.id !== "c-b");
		mapa.conceitos.find((item) => item.id === "c-c")!.fora = true;
		expect(conceitosForaDoMapa(curso, mapa)).toEqual(["c-b", "c-c"]);
		expect(conceitosForaDoMapa(novoCurso("p1", "m", BASICO, AGORA), mapa)).toEqual([]);
	});
});

describe("no disco", () => {
	let dados = "";
	let materia = "";
	const ctx = { agora: AGORA, hoje: HOJE };

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-cursos-"));
		materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	const eventosDoCurso = async () =>
		(await lerEventos(eventosMateria(dados, materia))).eventos.slice(1).map(({ verbo, objeto, resultado, sessao }) => ({ verbo, objeto, resultado, sessao }));

	it("começar: id pelo nome, curso.json com tabulação, Básico confirmado e o evento comecou_curso", async () => {
		const curso = await comecarCurso(dados, materia, { ...BASICO, nome: " P1:  regressão " }, { ...ctx, sessao: "s1" });
		expect(curso.id).toBe("p1-regressao");
		expect(curso.etapa).toBe("materiais");
		const texto = await readFile(caminhoDoCurso(dados, materia, curso.id), "utf8");
		expect(texto.startsWith('{\n\t"versao": 1,\n\t"id": "p1-regressao",\n\t"nome": "P1: regressão",\n\t"materia": "calculo-i"')).toBe(true);
		expect(texto.endsWith("}\n")).toBe(true);
		expect(JSON.parse(texto)).toEqual(curso);
		expect(await lerCurso(dados, materia, curso.id)).toEqual(curso);
		expect(await eventosDoCurso()).toEqual([{ verbo: "comecou_curso", objeto: { materia, curso: "p1-regressao" }, resultado: { nome: "P1: regressão" }, sessao: "s1" }]);
	});

	it("o mesmo nome dá -2; nome sem letras dá curso; validação e matéria que não existe dão erro sem criar nada", async () => {
		expect((await comecarCurso(dados, materia, BASICO, ctx)).id).toBe("p1-regressao");
		expect((await comecarCurso(dados, materia, { ...BASICO, nome: "p1 REGRESSÃO" }, ctx)).id).toBe("p1-regressao-2");
		expect((await comecarCurso(dados, materia, { ...BASICO, nome: "!!!" }, ctx)).id).toBe("curso");
		await expect(comecarCurso(dados, materia, { ...BASICO, prazo: "2026-10-01" }, ctx)).rejects.toThrow(/já passou/);
		await expect(comecarCurso(dados, "nao-existe", BASICO, ctx)).rejects.toThrow(/Não achei a matéria/);
		await expect(comecarCurso(dados, "../fora", BASICO, ctx)).rejects.toThrow(ErroCurso);
		expect((await listarCursos(dados, materia)).cursos.map((curso) => curso.id)).toEqual(["curso", "p1-regressao", "p1-regressao-2"]);
	});

	it("listar: na ordem de criação; um curso.json ilegível vai para os erros e não é sobrescrito", async () => {
		expect(await listarCursos(dados, materia)).toEqual({ cursos: [], erros: [] });
		await comecarCurso(dados, materia, { ...BASICO, nome: "Segundo" }, { ...ctx, agora: DEPOIS });
		await comecarCurso(dados, materia, { ...BASICO, nome: "Primeiro" }, ctx);
		await mkdir(pastaDoCurso(dados, materia, "quebrado"), { recursive: true });
		await writeFile(caminhoDoCurso(dados, materia, "quebrado"), "{ quebrado", "utf8");
		await mkdir(pastaDoCurso(dados, materia, "vazio"), { recursive: true });
		const lista = await listarCursos(dados, materia);
		expect(lista.cursos.map((curso) => curso.nome)).toEqual(["Primeiro", "Segundo"]);
		expect(lista.erros.map((erro) => erro.pasta).sort()).toEqual(["quebrado", "vazio"]);
		expect(lista.erros.find((erro) => erro.pasta === "quebrado")!.mensagem).toMatch(/^curso\.json: o JSON está inválido/);
		expect(await readFile(caminhoDoCurso(dados, materia, "quebrado"), "utf8")).toBe("{ quebrado");
		await expect(lerCurso(dados, materia, "quebrado")).rejects.toThrow(/nada foi gravado por cima/);
		await expect(lerCurso(dados, materia, "nao-tem")).rejects.toThrow(/Não achei o curso/);
	});

	it("lerCurso aceita etapas ausentes como null", async () => {
		await mkdir(pastaDoCurso(dados, materia, "velho"), { recursive: true });
		const { diagnostico: _d, esqueleto: _e, ...semAsUltimas } = novoCurso("velho", materia, BASICO, AGORA);
		await writeFile(caminhoDoCurso(dados, materia, "velho"), JSON.stringify(semAsUltimas), "utf8");
		const curso = await lerCurso(dados, materia, "velho");
		expect(curso.diagnostico).toBeNull();
		expect(curso.esqueleto).toBeNull();
	});

	it("confirmar no disco: valida com o mapa da matéria e os materiais do curso, grava e invalida", async () => {
		const { id } = await comecarCurso(dados, materia, BASICO, ctx);
		await expect(confirmarNoDisco(dados, materia, id, "objetivo", OBJETIVO, ctx)).rejects.toThrow(/Confirme antes a etapa Materiais/);
		await confirmarNoDisco(dados, materia, id, "materiais", { arquivos: [] }, ctx);
		await expect(confirmarNoDisco(dados, materia, id, "objetivo", { ...OBJETIVO, escopo: "so_material" }, ctx)).rejects.toThrow(/pelo menos um material/);
		await confirmarNoDisco(dados, materia, id, "materiais", MATERIAIS, ctx);
		await confirmarNoDisco(dados, materia, id, "objetivo", { ...OBJETIVO, escopo: "so_material" }, ctx);
		await expect(confirmarNoDisco(dados, materia, id, "mapa", MAPA, ctx)).rejects.toThrow(/aprovado/);
		await gravarMapa(dados, materia, mapaAprovado());
		const comMapa = await confirmarNoDisco(dados, materia, id, "mapa", { conceitos: ["c-b", "c-a"] }, { ...ctx, agora: DEPOIS });
		expect(comMapa.curso.mapa).toEqual({ conceitos: ["c-a", "c-b"] });
		expect(comMapa.curso.etapa).toBe("diagnostico");
		expect(await lerCurso(dados, materia, id)).toEqual(comMapa.curso);
		const mudou = await confirmarNoDisco(dados, materia, id, "materiais", { arquivos: [] }, ctx);
		expect(mudou.invalidadas).toEqual(["mapa"]);
		expect((await lerCurso(dados, materia, id)).mapa).toBeNull();
		expect((await lerCurso(dados, materia, id)).etapa).toBe("mapa");
		expect((await eventosDoCurso()).map((evento) => evento.verbo)).toEqual(["comecou_curso"]);
	});

	it("descartar: apaga a pasta do rascunho e grava descartou_curso; um curso pronto não", async () => {
		const rascunho = await comecarCurso(dados, materia, BASICO, ctx);
		const descartado = await descartarCurso(dados, materia, rascunho.id, ctx);
		expect(descartado.id).toBe(rascunho.id);
		await expect(stat(pastaDoCurso(dados, materia, rascunho.id))).rejects.toThrow();
		expect((await eventosDoCurso())[1]).toEqual({ verbo: "descartou_curso", objeto: { materia, curso: rascunho.id }, resultado: { nome: "P1: regressão", etapa: "materiais" }, sessao: undefined });

		const pronto = await comecarCurso(dados, materia, { ...BASICO, nome: "Pronto" }, ctx);
		await gravarCurso(dados, { ...pronto, situacao: "pronto" });
		await expect(descartarCurso(dados, materia, pronto.id, ctx)).rejects.toThrow(/já está pronto/);
		expect((await lerCurso(dados, materia, pronto.id)).situacao).toBe("pronto");
		await expect(descartarCurso(dados, materia, "nao-tem", ctx)).rejects.toThrow(/Não achei o curso/);
		expect((await eventosDoCurso()).map((evento) => evento.verbo)).toEqual(["comecou_curso", "descartou_curso", "comecou_curso"]);
	});

	it("materiaisProntos: arquivo e hash dos manifestos do .extraido, em ordem de caminho", async () => {
		expect(await materiaisProntos(dados, materia)).toEqual([]);
		for (const [arquivo, hash] of [["listas/l1.pdf", "h2"], ["aula-01.pdf", "h1"]] as const) {
			const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
			await mkdir(pasta, { recursive: true });
			await writeFile(join(pasta, "manifesto.json"), JSON.stringify({ versao: 1, arquivo, hash, tipo: "pdf", trechos: [] }), "utf8");
		}
		const ilegivel = pastaExtraidoArquivo(dados, materia, "ruim.pdf");
		await mkdir(ilegivel, { recursive: true });
		await writeFile(join(ilegivel, "manifesto.json"), "{", "utf8");
		expect(await materiaisProntos(dados, materia)).toEqual([
			{ arquivo: "aula-01.pdf", hash: "h1" },
			{ arquivo: "listas/l1.pdf", hash: "h2" },
		]);
	});
});
