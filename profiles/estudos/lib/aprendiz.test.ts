// Testes da leitura do disco da memória do aprendiz (item 9, parte A): a lista de matérias que existem, a
// config, os nomes do mapa, as confusões lidas do curso e do módulo e o cache de indicadores. Tudo numa
// pasta de dados temporária e numa pasta de cache temporária, com eventos escritos à mão.

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	arquivoCacheIndicadores,
	arquivoConfigAprendiz,
	confusoesDosEventos,
	indicadoresDoAprendiz,
	lerConfig,
	materiasExistentes,
	pastaCacheAprendiz,
	VALIDADE_DO_CACHE_MS,
	VERSAO_INDICADORES,
} from "./aprendiz.ts";
import { CONFIG_APRENDIZ_PADRAO } from "./aprendiz-indicadores-tipos.ts";
import { caminhoDoCurso } from "./cursos.ts";
import { acrescentarEvento, type Evento } from "./eventos.ts";
import { caminhoDoMapa } from "./mapa.ts";
import { arquivoMateria, eventosAprendiz } from "./materias.ts";
import { caminhoDoModulo } from "./modulos.ts";

let dados = "";
let cache = "";
const AGORA = new Date("2026-11-11T12:00:00.000Z");

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-aprendiz-dados-"));
	cache = await mkdtemp(join(tmpdir(), "estudos-aprendiz-cache-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
	await rm(cache, { recursive: true, force: true });
});

async function escrever(arquivo: string, conteudo: unknown): Promise<void> {
	await mkdir(dirname(arquivo), { recursive: true });
	await writeFile(arquivo, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo), "utf8");
}

const criarMateria = (id: string) => escrever(arquivoMateria(dados, id), { id, nome: id, cor: "moss", glifo: "学", provas: [], criadaEm: "2026-10-01T00:00:00.000Z" });

let contador = 0;
function evento(verbo: Evento["verbo"], objeto: Evento["objeto"], resultado: Record<string, unknown>, extra: { ts?: string; id?: string; sessao?: string } = {}): Evento {
	contador++;
	return { id: extra.id ?? `ev${String(contador).padStart(3, "0")}`, ts: extra.ts ?? `2026-11-0${(contador % 9) + 1}T10:00:00.000Z`, sessao: extra.sessao ?? "s1", verbo, objeto, resultado };
}
const gravar = async (...eventos: Evento[]) => {
	for (const item of eventos) await acrescentarEvento(eventosAprendiz(dados), item);
};

/** O mapa mínimo que lerMapa aceita. */
const mapaCom = (conceitos: Array<{ id: string; nome: string }>) => ({
	versao: 1,
	situacao: "aprovado",
	conceitos: conceitos.map((conceito) => ({ ...conceito, descricao: "", referencias: [], prioridade: "central", origem: "material", criadoEm: "2026-10-01T00:00:00.000Z" })),
	arquivos: {},
});

/** O que a pasta de dados tinha (arquivos e tamanhos), para provar que nada foi gravado nela. */
async function fotografia(pasta: string): Promise<string[]> {
	const saida: string[] = [];
	const visitar = async (atual: string) => {
		for (const entrada of await readdir(atual, { withFileTypes: true })) {
			const caminho = join(atual, entrada.name);
			if (entrada.isDirectory()) await visitar(caminho);
			else saida.push(`${caminho}:${(await readFile(caminho)).length}`);
		}
	};
	await visitar(pasta);
	return saida.sort();
}

describe("pastaCacheAprendiz", () => {
	it("termina em estudos-app/aprendiz, sob o LOCALAPPDATA", () => {
		const pasta = pastaCacheAprendiz();
		expect(pasta.replace(/\\/g, "/")).toMatch(/estudos-app\/aprendiz$/);
		if (process.env.LOCALAPPDATA) expect(pasta.startsWith(process.env.LOCALAPPDATA)).toBe(true);
	});
});

describe("config e matérias", () => {
	it("config ausente = padrão, e o arquivo não é criado; parcial completa; ilegível volta ao padrão", async () => {
		await mkdir(join(dados, "aprendiz"), { recursive: true });
		expect(await lerConfig(dados)).toEqual(CONFIG_APRENDIZ_PADRAO);
		expect(await readdir(join(dados, "aprendiz"))).toEqual([]);
		await escrever(arquivoConfigAprendiz(dados), { bkt: { chute: 0.3 }, meiaVidaDias: 10 });
		expect(await lerConfig(dados)).toEqual({ bkt: { ...CONFIG_APRENDIZ_PADRAO.bkt, chute: 0.3 }, meiaVidaDias: 10 });
		await escrever(arquivoConfigAprendiz(dados), "{ não é json");
		expect(await lerConfig(dados)).toEqual(CONFIG_APRENDIZ_PADRAO);
	});

	it("materiasExistentes: só as pastas com materia.json; sem materias/ nenhuma", async () => {
		expect(await materiasExistentes(dados)).toEqual([]);
		await criarMateria("b");
		await criarMateria("a");
		await mkdir(join(dados, "materias", "sem-json"), { recursive: true });
		await escrever(join(dados, "materias", "solto.txt"), "x");
		expect(await materiasExistentes(dados)).toEqual(["a", "b"]);
	});
});

describe("confusoesDosEventos", () => {
	const questaoComConfusoes = (id: string) => ({
		id,
		tipo: "alternativa",
		conceitos: ["c1"],
		enunciado: "?",
		alternativas: [{ texto: "certa", correta: true }, { texto: "errada 1", confusao: "Confusão da alternativa 1." }, { texto: "errada 2", confusao: "Confusão da alternativa 2." }],
		explicacao: "",
	});

	it("acha no diagnóstico do curso.json (concluído e em andamento) e no bloco do módulo; o que falta não dá erro", async () => {
		await criarMateria("mat");
		await escrever(caminhoDoCurso(dados, "mat", "curso"), { diagnostico: { questoes: [questaoComConfusoes("q1")] }, diagnosticoEmAndamento: { questoes: [questaoComConfusoes("q9")] } });
		await escrever(caminhoDoModulo(dados, "mat", "curso", "m1"), { licoes: [{ id: "l1", blocos: [{ id: "l1-b7", tipo: "alternativa", alternativas: [{ texto: "a" }, { texto: "b", confusao: "Do bloco do módulo." }] }] }] });
		const objeto = (campos: Record<string, unknown>) => ({ materia: "mat", curso: "curso", conceitos: ["c1"], ...campos });
		const eventos = [
			evento("respondeu_questao", objeto({ questao: "q1" }), { correta: false, escolha: 2 }, { id: "diag" }),
			evento("respondeu_questao", objeto({ questao: "q9" }), { correta: false, escolha: 1 }, { id: "andamento" }),
			evento("respondeu_questao", objeto({ modulo: "m1", licao: "l1", questao: "l1-b7" }), { correta: false, escolha: 1, tentativa: 1 }, { id: "modulo" }),
			evento("respondeu_questao", objeto({ questao: "q1" }), { correta: false, escolha: 1, confusao: "Já veio no evento." }, { id: "ja-tem" }),
			evento("respondeu_questao", objeto({ questao: "q1" }), { correta: true, escolha: 0 }, { id: "certa" }),
			evento("respondeu_questao", objeto({ questao: "q404" }), { correta: false, escolha: 1 }, { id: "sumiu" }),
			evento("respondeu_questao", objeto({ curso: "outro", questao: "q1" }), { correta: false, escolha: 1 }, { id: "curso-sumiu" }),
			evento("respondeu_questao", objeto({ modulo: "m9", licao: "l1", questao: "l1-b7" }), { correta: false, escolha: 1 }, { id: "modulo-sumiu" }),
			evento("respondeu_questao", objeto({ modulo: "../fora", licao: "l1", questao: "l1-b7" }), { correta: false, escolha: 1 }, { id: "modulo-invalido" }),
			evento("respondeu_questao", objeto({ questao: "q1" }), { correta: false, escolha: 9 }, { id: "escolha-fora" }),
			evento("respondeu_questao", { materia: "apagada", curso: "curso", conceitos: ["c1"], questao: "q1" }, { correta: false, escolha: 2 }, { id: "materia-apagada" }),
		];
		const resolvidas = await confusoesDosEventos(dados, eventos, new Set(["mat"]));
		expect(resolvidas).toEqual({ diag: "Confusão da alternativa 2.", andamento: "Confusão da alternativa 1.", modulo: "Do bloco do módulo." });
	});

	it("curso.json corrompido: sem confusão, nunca erro", async () => {
		await criarMateria("mat");
		await escrever(caminhoDoCurso(dados, "mat", "curso"), "{ quebrado");
		const eventos = [evento("respondeu_questao", { materia: "mat", curso: "curso", conceitos: ["c1"], questao: "q1" }, { correta: false, escolha: 1 })];
		expect(await confusoesDosEventos(dados, eventos, new Set(["mat"]))).toEqual({});
	});
});

describe("indicadoresDoAprendiz", () => {
	/** Uma matéria com mapa, um curso com diagnóstico e dois eventos (um acerto e um erro sem confusão no resultado). */
	async function montarCenario() {
		await criarMateria("mat");
		await escrever(caminhoDoMapa(dados, "mat"), mapaCom([{ id: "c1", nome: "Tokenização" }]));
		await escrever(caminhoDoCurso(dados, "mat", "curso"), {
			diagnostico: { questoes: [{ id: "q2", alternativas: [{ texto: "x", correta: true }, { texto: "y", confusao: "Remove pontuação achando que é ruído." }] }] },
		});
		await gravar(
			evento("respondeu_questao", { materia: "mat", curso: "curso", conceitos: ["c1", "c2"], questao: "q1" }, { correta: true, escolha: 0, confianca: 3 }, { id: "e1", ts: "2026-11-01T10:00:00.000Z" }),
			evento("respondeu_questao", { materia: "mat", curso: "curso", conceitos: ["c1"], questao: "q2" }, { correta: false, escolha: 1, confianca: 4 }, { id: "e2", ts: "2026-11-02T10:00:00.000Z", sessao: "s2" }),
			evento("autoavaliou_conceito", { materia: "mat", curso: "curso", conceitos: ["c1"] }, { nivel: 3 }, { id: "e3", ts: "2026-11-02T09:00:00.000Z", sessao: "s2" }),
			evento("respondeu_questao", { materia: "apagada", curso: "x", conceitos: ["cz"], questao: "q1" }, { correta: true }, { id: "e4", ts: "2026-11-03T10:00:00.000Z" }),
		);
	}

	it("calcula tudo: nome do mapa, confusão lida do curso, domínio, matéria apagada ignorada; e não grava nada nos dados", async () => {
		await montarCenario();
		const antes = await fotografia(dados);
		const resultado = await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(resultado.versao).toBe(VERSAO_INDICADORES);
		expect(resultado.ultimoEvento).toBe("e4");
		expect(resultado.ignorados).toEqual({ materiaInexistente: 1, semConceito: 0 });
		const c1 = resultado.conceitos.find((item) => item.conceito === "c1")!;
		expect(c1).toMatchObject({ nome: "Tokenização", materia: "mat", observacoes: 2, sessoes: 2, disse: { nivel: 3, evento: "e3" } });
		expect(c1.confusoes).toEqual([{ texto: "Remove pontuação achando que é ruído.", eventos: ["e2"] }]);
		expect(c1.brier).toBeCloseTo(((0.75 - 1) ** 2 + (0.95 - 0) ** 2) / 2, 4);
		expect(resultado.conceitos.find((item) => item.conceito === "c2")).not.toHaveProperty("nome");
		expect(await fotografia(dados)).toEqual(antes);
	});

	it("grava o cache fora dos dados e o segundo pedido o reaproveita sem recalcular", async () => {
		await montarCenario();
		const primeiro = await indicadoresDoAprendiz(dados, cache, AGORA);
		const guardado = JSON.parse(await readFile(arquivoCacheIndicadores(cache), "utf8"));
		expect(guardado).toMatchObject({ versao: VERSAO_INDICADORES, ultimoEvento: "e4", quantos: 4 });
		// Marca o cache para provar que o segundo pedido o devolveu em vez de recalcular.
		guardado.indicadores.calculadoEm = "2026-11-11T11:00:00.000Z";
		await writeFile(arquivoCacheIndicadores(cache), JSON.stringify(guardado));
		const segundo = await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(segundo.calculadoEm).toBe("2026-11-11T11:00:00.000Z");
		expect(segundo.conceitos).toEqual(primeiro.conceitos);
	});

	it("o nome do mapa não fica no cache: um mapa mudado vale sem evento novo", async () => {
		await montarCenario();
		await indicadoresDoAprendiz(dados, cache, AGORA);
		const guardado = JSON.parse(await readFile(arquivoCacheIndicadores(cache), "utf8"));
		expect(JSON.stringify(guardado)).not.toContain("Tokenização");
		await escrever(caminhoDoMapa(dados, "mat"), mapaCom([{ id: "c1", nome: "Tokens" }]));
		const resultado = await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(resultado.conceitos.find((item) => item.conceito === "c1")!.nome).toBe("Tokens");
	});

	async function ehHit(): Promise<boolean> {
		const arquivo = arquivoCacheIndicadores(cache);
		const guardado = JSON.parse(await readFile(arquivo, "utf8"));
		guardado.indicadores.calculadoEm = "2026-11-11T11:00:00.000Z";
		await writeFile(arquivo, JSON.stringify(guardado));
		return (await indicadoresDoAprendiz(dados, cache, AGORA)).calculadoEm === "2026-11-11T11:00:00.000Z";
	}

	it("evento novo = miss (recalcula e regrava)", async () => {
		await montarCenario();
		await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(await ehHit()).toBe(true);
		await gravar(evento("respondeu_questao", { materia: "mat", curso: "curso", conceitos: ["c1"], questao: "q3" }, { correta: true }, { id: "e5", ts: "2026-11-05T10:00:00.000Z" }));
		const resultado = await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(resultado.ultimoEvento).toBe("e5");
		expect(resultado.calculadoEm).toBe(AGORA.toISOString());
		expect(resultado.conceitos.find((item) => item.conceito === "c1")!.observacoes).toBe(3);
		expect(JSON.parse(await readFile(arquivoCacheIndicadores(cache), "utf8")).ultimoEvento).toBe("e5");
	});

	it("config nova = miss", async () => {
		await montarCenario();
		await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(await ehHit()).toBe(true);
		await escrever(arquivoConfigAprendiz(dados), { meiaVidaDias: 7 });
		const resultado = await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(resultado.calculadoEm).toBe(AGORA.toISOString());
		expect(resultado.config.meiaVidaDias).toBe(7);
	});

	it("matéria criada ou apagada = miss", async () => {
		await montarCenario();
		await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(await ehHit()).toBe(true);
		await criarMateria("apagada");
		const resultado = await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(resultado.calculadoEm).toBe(AGORA.toISOString());
		expect(resultado.ignorados.materiaInexistente).toBe(0);
	});

	it("cache velho (passou um dia) = miss, porque o decaimento muda com os dias", async () => {
		await montarCenario();
		await indicadoresDoAprendiz(dados, cache, AGORA);
		const depois = new Date(AGORA.getTime() + VALIDADE_DO_CACHE_MS + 1000);
		const resultado = await indicadoresDoAprendiz(dados, cache, depois);
		expect(resultado.calculadoEm).toBe(depois.toISOString());
	});

	it("cache corrompido ou de outra versão = recalcula e conserta o arquivo", async () => {
		await montarCenario();
		await mkdir(cache, { recursive: true });
		await writeFile(arquivoCacheIndicadores(cache), "{ lixo");
		expect((await indicadoresDoAprendiz(dados, cache, AGORA)).calculadoEm).toBe(AGORA.toISOString());
		expect(JSON.parse(await readFile(arquivoCacheIndicadores(cache), "utf8")).versao).toBe(VERSAO_INDICADORES);

		const guardado = JSON.parse(await readFile(arquivoCacheIndicadores(cache), "utf8"));
		guardado.versao = VERSAO_INDICADORES + 1;
		guardado.indicadores.calculadoEm = "2026-11-11T11:00:00.000Z";
		await writeFile(arquivoCacheIndicadores(cache), JSON.stringify(guardado));
		expect((await indicadoresDoAprendiz(dados, cache, AGORA)).calculadoEm).toBe(AGORA.toISOString());

		await writeFile(arquivoCacheIndicadores(cache), JSON.stringify({ versao: VERSAO_INDICADORES, indicadores: 5 }));
		expect((await indicadoresDoAprendiz(dados, cache, AGORA)).calculadoEm).toBe(AGORA.toISOString());
	});

	it("sem eventos nem arquivo de aprendiz: resultado vazio, sem erro", async () => {
		await criarMateria("mat");
		const resultado = await indicadoresDoAprendiz(dados, cache, AGORA);
		expect(resultado.conceitos).toEqual([]);
		expect(resultado.ultimoEvento).toBeUndefined();
		expect(resultado.ignorados).toEqual({ materiaInexistente: 0, semConceito: 0 });
	});

	it("pasta de cache impossível de criar não derruba a resposta", async () => {
		await montarCenario();
		const arquivoNoLugarDaPasta = join(cache, "arquivo");
		await writeFile(arquivoNoLugarDaPasta, "x");
		const resultado = await indicadoresDoAprendiz(dados, join(arquivoNoLugarDaPasta, "dentro"), AGORA);
		expect(resultado.conceitos.length).toBeGreaterThan(0);
	});
});
