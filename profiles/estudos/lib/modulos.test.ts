// Testes dos módulos gerados sob demanda (item 6, docs/modulos.md): as regras
// puras (próximo módulo, nível dos conceitos, lições por horas, conserto do
// plano, validação das lições, material novo, podeGerar) e o disco numa pasta
// de dados temporária com uma matéria e um curso pronto (o <módulo>.json, os
// eventos e a mensagem para os modelos).

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmarEtapa, type Curso, ErroCurso, gravarCurso, materiaisProntos, novoCurso } from "./cursos.ts";
import type { Diagnostico } from "./diagnostico.ts";
import { calcularCalendario, type Modulo as ModuloDoEsqueleto } from "./esqueleto.ts";
import { lerEventos } from "./eventos.ts";
import { type Conceito, gravarMapa, mapaVazio, pastaExtraidoArquivo } from "./mapa.ts";
import { criarMateria, eventosMateria } from "./materias.ts";
import {
	caminhoDoModulo,
	concluirModulo,
	entradaDoModelo,
	ErroModulo,
	type Licao,
	lerModulo,
	licoesPorHoras,
	marcarAguardando,
	materialNovo,
	gravarModuloGerado,
	nivelDoConceito,
	niveisDoModulo,
	PAINEL_MODULOS,
	podeGerar,
	proximoModulo,
	resumoDoModulo,
	situacoesDoCurso,
	validarLicao,
	validarPlano,
} from "./modulos.ts";

const AGORA = new Date("2026-10-26T13:00:00.000Z");
const DEPOIS = new Date("2026-10-26T14:00:00.000Z");
const MODELO = "openrouter/openai/gpt-6.1-sol";

const esqueletoDe = (...ids: string[]) => ({ modulos: ids.map((id) => ({ id })) as ModuloDoEsqueleto[] });

describe("proximoModulo (o recomendado)", () => {
	it("nenhum gerado: o primeiro", () => {
		expect(proximoModulo(esqueletoDe("m1", "m2", "m3"), {}, [])).toBe("m1");
	});

	it("um gerado não concluído continua recomendado; concluído passa a recomendação para o seguinte, na ordem do esqueleto", () => {
		expect(proximoModulo(esqueletoDe("m1", "m2", "m3"), { m1: "gerado" }, [])).toBe("m1");
		expect(proximoModulo(esqueletoDe("m1", "m2", "m3"), { m1: "gerado" }, ["m1"])).toBe("m2");
		expect(proximoModulo(esqueletoDe("m2", "m1", "m3"), { m2: "gerado", m1: "gerado" }, ["m2"])).toBe("m1");
		expect(proximoModulo(esqueletoDe("m1", "m2", "m3"), { m1: "gerado", m2: "gerado" }, ["m1"])).toBe("m2");
	});

	it("aguardando material não é recomendado nem segura os seguintes", () => {
		expect(proximoModulo(esqueletoDe("m1", "m2", "m3"), { m1: "aguardando_material" }, [])).toBe("m2");
		expect(proximoModulo(esqueletoDe("m1", "m2", "m3"), { m1: "gerado", m2: "aguardando_material" }, ["m1"])).toBe("m3");
		expect(proximoModulo(esqueletoDe("m1", "m2"), { m1: "aguardando_material", m2: "gerado" }, ["m2"])).toBeNull();
	});

	it("um id em concluidos que não está gerado não conta como concluído", () => {
		expect(proximoModulo(esqueletoDe("m1", "m2"), {}, ["m1"])).toBe("m1");
	});
});

describe("podeGerar", () => {
	const curso = { situacao: "pronto" as const, esqueleto: { ...esqueletoDe("m1", "m2", "m3") } as Curso["esqueleto"] };

	it("qualquer módulo não concluído pode, gerado, aguardando ou sem arquivo, em qualquer ordem", () => {
		const situacoes = { m1: "gerado", m2: "aguardando_material" } as const;
		expect(podeGerar(curso, situacoes, "m3", []).id).toBe("m3");
		expect(podeGerar(curso, situacoes, "m2", []).id).toBe("m2");
		expect(podeGerar(curso, situacoes, "m1", []).id).toBe("m1");
		expect(podeGerar(curso, {}, "m3", []).id).toBe("m3");
	});

	it("gerar de novo um concluído é erro", () => {
		expect(() => podeGerar(curso, { m1: "gerado" }, "m1", ["m1"])).toThrow(/já foi concluído/);
		expect(() => podeGerar(curso, { m1: "gerado" }, "m1", ["m1"])).toThrow(ErroModulo);
		expect(podeGerar(curso, { m1: "gerado" }, "m2", ["m1"]).id).toBe("m2");
	});

	it("curso que não está pronto ou módulo que não existe é erro (um ErroCurso)", () => {
		expect(() => podeGerar({ situacao: "rascunho", esqueleto: null }, {}, "m1", [])).toThrow(/ainda não foi criado/);
		expect(() => podeGerar(curso, {}, "m9", [])).toThrow(/Não achei o módulo "m9"/);
		expect(() => podeGerar(curso, {}, "m9", [])).toThrow(ErroCurso);
	});
});

describe("materialNovo", () => {
	const aguardando = { prontos: [{ arquivo: "a.pdf", hash: "1" }, { arquivo: "b.pdf", hash: "2" }] };

	it("arquivo novo ou com outro hash é material novo; só sair não é", () => {
		expect(materialNovo(aguardando, [{ arquivo: "a.pdf", hash: "1" }, { arquivo: "b.pdf", hash: "2" }])).toBe(false);
		expect(materialNovo(aguardando, [{ arquivo: "a.pdf", hash: "1" }])).toBe(false);
		expect(materialNovo(aguardando, [{ arquivo: "a.pdf", hash: "1" }, { arquivo: "b.pdf", hash: "3" }])).toBe(true);
		expect(materialNovo(aguardando, [{ arquivo: "a.pdf", hash: "1" }, { arquivo: "b.pdf", hash: "2" }, { arquivo: "c.pdf", hash: "4" }])).toBe(true);
		expect(materialNovo(undefined, [{ arquivo: "c.pdf", hash: "4" }])).toBe(false);
	});
});

// --- Nível ------------------------------------------------------------------------

const alternativa = (id: string, conceito: string) => ({
	id,
	tipo: "alternativa" as const,
	conceitos: [conceito],
	enunciado: `Sobre ${conceito}?`,
	alternativas: [{ texto: "Certa", correta: true as const }, { texto: "Errada", confusao: "Confunde." }, { texto: "Outra", confusao: "Acha que vale sempre." }],
	explicacao: "Porque sim.",
});
const respostaAlternativa = (correta: boolean) => ({ confianca: 3 as const, escolha: correta ? 0 : 1, correta, ...(correta ? {} : { confusao: "Confunde." }), tempoMs: 1000, respondidaEm: AGORA.toISOString() });
const RUBRICA = [
	{ criterio: "Um", descricao: "", pontos: 2 },
	{ criterio: "Dois", descricao: "", pontos: 1 },
	{ criterio: "Três", descricao: "", pontos: 1 },
];
const corrigida = (total: number) => ({
	confianca: 3 as const,
	texto: "Resposta.",
	tempoMs: 1000,
	respondidaEm: AGORA.toISOString(),
	correcao: { criterios: [], total, max: 4, modelo: MODELO, custo: 0 },
});

/**
 * c-a: sei aplicar e acertou; c-b: sei aplicar e errou; c-c: sei explicar e
 * acertou; c-d: sei aplicar e a dissertativa em parte; c-e: já ouvi falar,
 * sem questão; c-f: sei explicar, sem questão; c-g: sei aplicar, sem questão;
 * c-h: nunca vi e acertou; c-i: sei aplicar, uma certa e uma dissertativa
 * zerada (média 0,5: em parte); c-j: sem autoavaliação.
 */
const DIAGNOSTICO: Diagnostico = {
	autoavaliacao: { "c-a": 3, "c-b": 3, "c-c": 2, "c-d": 3, "c-e": 1, "c-f": 2, "c-g": 3, "c-h": 0, "c-i": 3 },
	questoes: [
		alternativa("q1", "c-a"),
		alternativa("q2", "c-b"),
		alternativa("q3", "c-c"),
		alternativa("q4", "c-h"),
		alternativa("q5", "c-i"),
		{ id: "q6", tipo: "dissertativa", conceitos: ["c-d"], enunciado: "Explique c-d.", rubrica: RUBRICA, respostaModelo: "…" },
		{ id: "q7", tipo: "dissertativa", conceitos: ["c-i"], enunciado: "Explique c-i.", rubrica: RUBRICA, respostaModelo: "…" },
	],
	geradoEm: AGORA.toISOString(),
	modelo: MODELO,
	custo: 0.03,
	respostas: {
		q1: respostaAlternativa(true),
		q2: respostaAlternativa(false),
		q3: respostaAlternativa(true),
		q4: respostaAlternativa(true),
		q5: respostaAlternativa(true),
		q6: corrigida(2),
		q7: corrigida(0),
	},
	concluidoEm: AGORA.toISOString(),
};

describe("nível dos conceitos", () => {
	it("cada caso do contrato", () => {
		const casos: Array<[string, string]> = [
			["c-a", "domina"],
			["c-b", "iniciante"],
			["c-c", "intermediario"],
			["c-d", "intermediario"],
			["c-e", "iniciante"],
			["c-f", "intermediario"],
			["c-g", "domina"],
			["c-h", "iniciante"],
			["c-i", "intermediario"],
			["c-j", "iniciante"],
		];
		for (const [conceito, nivel] of casos) expect([conceito, nivelDoConceito(DIAGNOSTICO, conceito)]).toEqual([conceito, nivel]);
	});

	it("niveisDoModulo: os conceitos do módulo; sem diagnóstico, todos iniciante", () => {
		expect(niveisDoModulo(DIAGNOSTICO, { conceitos: ["c-a", "c-e"] })).toEqual({ "c-a": "domina", "c-e": "iniciante" });
		expect(niveisDoModulo(null, { conceitos: ["c-a", "c-g"] })).toEqual({ "c-a": "iniciante", "c-g": "iniciante" });
	});

	it("uma questão sem resposta não conta: vale o que ele disse", () => {
		const semResposta = { ...DIAGNOSTICO, respostas: {} };
		expect(nivelDoConceito(semResposta, "c-b")).toBe("domina");
	});
});

describe("licoesPorHoras", () => {
	it("uma por uns 50 minutos, de 1 a 6", () => {
		const casos: Array<[number, number]> = [
			[0.5, 1],
			[1, 1],
			[1.5, 2],
			[2, 2],
			[3, 4],
			[4, 5],
			[5, 6],
			[40, 6],
			[0, 1],
			[Number.NaN, 1],
		];
		for (const [horas, licoes] of casos) expect([horas, licoesPorHoras(horas)]).toEqual([horas, licoes]);
	});
});

// --- O plano ------------------------------------------------------------------------------

describe("validarPlano", () => {
	const doModulo = ["c-a", "c-b", "c-c"];
	const licao = (titulo: string, conceitos: unknown, roteiro: unknown = ["explicacao", "alternativa"], extra: Record<string, unknown> = {}) => ({ titulo, objetivo: `Objetivo de ${titulo}.`, conceitos, roteiro, ...extra });

	it("um plano bom: ids l1…, campos limpos", () => {
		const plano = validarPlano({ licoes: [licao("  A   reta ", ["c-a"], ["explicacao", "verificacao", "explicacao", "alternativa"], { objetivo: "  Objetivo de A reta. " }), licao("Resíduos", ["c-b", "c-c"])] }, { conceitosDoModulo: doModulo, licoes: 2 });
		expect(plano).toEqual([
			{ id: "l1", titulo: "A reta", objetivo: "Objetivo de A reta.", conceitos: ["c-a"], roteiro: ["explicacao", "verificacao", "explicacao", "alternativa"] },
			{ id: "l2", titulo: "Resíduos", objetivo: "Objetivo de Resíduos.", conceitos: ["c-b", "c-c"], roteiro: ["explicacao", "alternativa"] },
		]);
	});

	it("conceitos de fora saem; uma lição só com conceitos de fora sai", () => {
		const plano = validarPlano({ licoes: [licao("Fora", ["c-x"]), licao("Um", ["c-a", "c-x", " c-b ", "c-a"]), licao("Dois", ["c-c"])] }, { conceitosDoModulo: doModulo, licoes: 3 });
		expect(plano.map((item) => [item.id, item.titulo, item.conceitos])).toEqual([
			["l1", "Um", ["c-a", "c-b"]],
			["l2", "Dois", ["c-c"]],
		]);
	});

	it("roteiro sem prática ganha uma verificação no fim; sem explicação, uma no começo; tipos desconhecidos e explicações seguidas saem", () => {
		const plano = validarPlano(
			{
				licoes: [
					licao("Sem prática", ["c-a"], ["explicacao"]),
					licao("Sem explicação", ["c-b"], ["alternativa", "lixo"]),
					licao("Bagunçado", ["c-c"], ["explicacao", "explicacao", "quiz", "dissertativa", "explicacao"]),
					licao("Sem roteiro", ["c-c"], null),
				],
			},
			{ conceitosDoModulo: doModulo, licoes: 4 },
		);
		expect(plano.map((item) => item.roteiro)).toEqual([
			["explicacao", "verificacao"],
			["explicacao", "alternativa"],
			["explicacao", "dissertativa", "explicacao", "verificacao"],
			["explicacao", "verificacao"],
		]);
	});

	it("o conceito que nenhuma lição cobriu entra na última, na ordem do módulo; as lições a mais saem", () => {
		const plano = validarPlano({ licoes: [licao("Um", ["c-b"]), licao("Dois", ["c-b"]), licao("Três", ["c-a"])] }, { conceitosDoModulo: doModulo, licoes: 2 });
		expect(plano.map((item) => item.conceitos)).toEqual([["c-b"], ["c-b", "c-a", "c-c"]]);
	});

	it("título vazio vira Lição N; teórico ou misto sem dissertativa ganha uma no fim da última", () => {
		const plano = validarPlano({ licoes: [licao("  ", ["c-a", "c-b", "c-c"])] }, { conceitosDoModulo: doModulo, licoes: 1, tipo: "misto" });
		expect(plano[0]).toMatchObject({ titulo: "Lição 1", roteiro: ["explicacao", "alternativa", "dissertativa"] });
		const aplicado = validarPlano({ licoes: [licao("Um", ["c-a", "c-b", "c-c"])] }, { conceitosDoModulo: doModulo, licoes: 1, tipo: "aplicado" });
		expect(aplicado[0]!.roteiro).toEqual(["explicacao", "alternativa"]);
	});

	it("sem lição que valha é erro", () => {
		expect(() => validarPlano({}, { conceitosDoModulo: doModulo, licoes: 2 })).toThrow(/falta "licoes"/);
		expect(() => validarPlano({ licoes: [licao("Fora", ["c-x"]), "lixo"] }, { conceitosDoModulo: doModulo, licoes: 2 })).toThrow(ErroModulo);
	});
});

// --- As lições ----------------------------------------------------------------------------

const LICAO = { id: "l2", titulo: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-a", "c-b"] };
const TRECHOS = [
	{ arquivo: "aula.pdf", local: "página 1", trecho: "pagina-1" },
	{ arquivo: "aula.pdf", local: "página 2", trecho: "pagina-2" },
];
const explicacao = (extra: Record<string, unknown> = {}) => ({ tipo: "explicacao", conceitos: ["c-a"], formato: "exemplo_resolvido", texto: "  Um **exemplo**.\n\nPasso 1.  ", referencias: [{ arquivo: "aula.pdf", local: "página 1" }], ...extra });
const questaoAlternativa = (extra: Record<string, unknown> = {}) => ({
	tipo: "alternativa",
	conceitos: ["c-a"],
	enunciado: "Qual?",
	alternativas: [{ texto: "Certa", correta: true }, { texto: "Errada", confusao: "Confunde." }, { texto: "Outra", confusao: "Outra confusão." }],
	explicacao: "Porque.",
	referencias: [],
	...extra,
});

describe("validarLicao", () => {
	it("uma lição boa: ids l<n>-b<n>, blocos limpos", () => {
		const { licao, descartes } = validarLicao(
			{
				blocos: [
					explicacao(),
					{ tipo: "verificacao", conceitos: ["c-a"], pergunta: " E aí? ", respostaEsperada: " Assim. " },
					questaoAlternativa({ conceitos: ["c-b"], contexto: "  " }),
					{ tipo: "dissertativa", conceitos: ["c-a", "c-b"], enunciado: "Explique.", rubrica: RUBRICA, respostaModelo: "Modelo." },
				],
			},
			{ licao: LICAO, trechos: TRECHOS, escopo: "material_base" },
		);
		expect(descartes).toEqual([]);
		expect(licao).toMatchObject({ id: "l2", titulo: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-a", "c-b"] });
		expect(licao.blocos.map((bloco) => [bloco.id, bloco.tipo])).toEqual([
			["l2-b1", "explicacao"],
			["l2-b2", "verificacao"],
			["l2-b3", "alternativa"],
			["l2-b4", "dissertativa"],
		]);
		expect(licao.blocos[0]).toEqual({
			id: "l2-b1",
			tipo: "explicacao",
			conceitos: ["c-a"],
			formato: "exemplo_resolvido",
			texto: "Um **exemplo**.\n\nPasso 1.",
			referencias: [{ arquivo: "aula.pdf", local: "página 1", trecho: "pagina-1" }],
		});
		expect(licao.blocos[1]).toEqual({ id: "l2-b2", tipo: "verificacao", conceitos: ["c-a"], pergunta: "E aí?", respostaEsperada: "Assim." });
		expect(licao.blocos[2]).not.toHaveProperty("contexto");
		expect(licao.blocos[3]).toMatchObject({ referencias: [], rubrica: RUBRICA });
	});

	it("referência a um local que não foi mandado é descartada (o bloco fica)", () => {
		const { licao } = validarLicao(
			{
				blocos: [
					explicacao({
						referencias: [
							{ arquivo: "aula.pdf", local: "página 9" },
							{ arquivo: "outra.pdf", local: "página 1" },
							{ arquivo: "aula.pdf", local: "página 2", trecho: "inventado" },
							{ arquivo: "aula.pdf", local: "página 2" },
							"lixo",
						],
					}),
					questaoAlternativa(),
				],
			},
			{ licao: LICAO, trechos: TRECHOS, escopo: "material_base" },
		);
		expect((licao.blocos[0] as { referencias: unknown }).referencias).toEqual([{ arquivo: "aula.pdf", local: "página 2", trecho: "pagina-2" }]);
	});

	it("complemento: em só o material, a explicação marcada ou sem referência válida; em material base, só a marcada; no livre, nenhuma", () => {
		const blocos = [explicacao({ referencias: [] }), explicacao({ complemento: true }), explicacao(), questaoAlternativa()];
		const complementos = (escopo: "so_material" | "material_base" | "livre") =>
			validarLicao({ blocos }, { licao: LICAO, trechos: TRECHOS, escopo }).licao.blocos.filter((bloco) => bloco.tipo === "explicacao").map((bloco) => "complemento" in bloco);
		expect(complementos("so_material")).toEqual([true, true, false]);
		expect(complementos("material_base")).toEqual([false, true, false]);
		expect(complementos("livre")).toEqual([false, false, false]);
	});

	it("questão inválida, bloco vazio, formato desconhecido e conceito de fora são descartados, com o motivo", () => {
		const { licao, descartes } = validarLicao(
			{
				blocos: [
					explicacao(),
					questaoAlternativa({ alternativas: [{ texto: "A", correta: true }, { texto: "B", correta: true }, { texto: "C", confusao: "x" }] }),
					questaoAlternativa({ alternativas: [{ texto: "A", correta: true }, { texto: "B" }, { texto: "C", confusao: "x" }] }),
					{ tipo: "dissertativa", conceitos: ["c-a"], enunciado: "Explique.", rubrica: RUBRICA.slice(0, 2) },
					explicacao({ texto: "   " }),
					explicacao({ formato: "resumo" }),
					questaoAlternativa({ conceitos: ["c-x"] }),
					{ tipo: "verificacao", conceitos: ["c-a"], pergunta: "E?" },
					{ tipo: "video", conceitos: ["c-a"] },
					questaoAlternativa({ conceitos: ["c-x", "c-b"] }),
				],
			},
			{ licao: LICAO, trechos: TRECHOS, escopo: "material_base" },
		);
		expect(licao.blocos.map((bloco) => [bloco.id, bloco.tipo, bloco.conceitos])).toEqual([
			["l2-b1", "explicacao", ["c-a"]],
			["l2-b2", "alternativa", ["c-b"]],
		]);
		expect(descartes).toEqual([
			"bloco 2: 2 alternativas corretas (precisa de exatamente uma)",
			"bloco 3: a alternativa errada 2 está sem a confusão que representa",
			"bloco 4: a rubrica precisa de 3 a 5 critérios (veio 2)",
			"bloco 5: explicação vazia",
			'bloco 6: formato de explicação desconhecido ("resumo")',
			"bloco 7: cita só conceitos fora da lição (c-x)",
			"bloco 8: verificação sem a resposta esperada",
			'bloco 9: tipo desconhecido ("video")',
		]);
	});

	it("sem prática, ou sem explicação, é erro (a extensão tenta de novo)", () => {
		expect(() => validarLicao({ blocos: [explicacao(), questaoAlternativa({ alternativas: [] })] }, { licao: LICAO, trechos: TRECHOS, escopo: "so_material" })).toThrow(
			/A lição l2 \("A reta"\) veio sem prática que valha\. Descartados: bloco 2: precisa de 3 a 5 alternativas/,
		);
		expect(() => validarLicao({ blocos: [questaoAlternativa()] }, { licao: LICAO, trechos: TRECHOS, escopo: "so_material" })).toThrow(/sem explicação que valha/);
		expect(() => validarLicao({ blocos: [] }, { licao: LICAO, trechos: TRECHOS, escopo: "so_material" })).toThrow(/sem explicação e sem prática/);
		expect(() => validarLicao({}, { licao: LICAO, trechos: TRECHOS, escopo: "so_material" })).toThrow(ErroModulo);
	});
});

describe("resumoDoModulo", () => {
	it("lições, blocos e questões", () => {
		const { licao } = validarLicao({ blocos: [explicacao(), { tipo: "verificacao", conceitos: ["c-a"], pergunta: "E?", respostaEsperada: "Sim." }, questaoAlternativa()] }, { licao: LICAO, trechos: TRECHOS, escopo: "livre" });
		expect(resumoDoModulo({ licoes: [licao, licao] })).toEqual({ licoes: 2, blocos: 6, questoes: 2 });
		expect(resumoDoModulo({ licoes: [] })).toEqual({ licoes: 0, blocos: 0, questoes: 0 });
	});

	it("o painel da ponte", () => {
		expect(PAINEL_MODULOS).toBe("modulos");
	});
});

// --- O disco ---------------------------------------------------------------------------------

describe("no disco", () => {
	let dados: string;
	let materia: string;
	const CURSO = "p1-regressao";

	const conceito = (id: string, referencias: Conceito["referencias"] = []): Conceito => ({
		id,
		nome: `Nome de ${id}`,
		descricao: `Descrição de ${id}.`,
		referencias,
		prioridade: id === "c-a" ? "alta" : "normal",
		origem: "material",
		criadoEm: AGORA.toISOString(),
	});
	const ref = (arquivo: string, pagina: number) => ({ arquivo, local: `página ${pagina}`, trecho: `pagina-${pagina}` });

	const MODULOS: ModuloDoEsqueleto[] = [
		{ id: "m1", nome: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-a", "c-b"], tipo: "normal", horas: 2 },
		{ id: "m2", nome: "Resíduos", objetivo: "Ler os resíduos.", conceitos: ["c-c"], tipo: "curto", horas: 1 },
		{ id: "m3", nome: "Revisão", objetivo: "", conceitos: ["c-d"], tipo: "revisao", horas: 0.5 },
	];

	function cursoPronto(escopo: "so_material" | "material_base" | "livre" = "so_material"): Curso {
		const basico = { nome: "P1: regressão", prazo: null, prova: "P1", horasPorSemana: 4 };
		let curso = novoCurso(CURSO, materia, basico, AGORA);
		curso = confirmarEtapa(curso, "materiais", { arquivos: [{ arquivo: "aula.pdf", hash: "h-aula" }] }, AGORA).curso;
		curso = confirmarEtapa(curso, "objetivo", { escopo, tipo: "misto", motivo: "Passar na P1." }, AGORA).curso;
		curso = confirmarEtapa(curso, "mapa", { conceitos: ["c-a", "c-b", "c-c", "c-d"] }, AGORA).curso;
		const diagnostico: Diagnostico = {
			...DIAGNOSTICO,
			autoavaliacao: { "c-a": 3, "c-b": 1, "c-c": 2, "c-d": 0 },
			questoes: [alternativa("q1", "c-a")],
			respostas: { q1: respostaAlternativa(true) },
		};
		curso = confirmarEtapa(curso, "diagnostico", diagnostico, AGORA).curso;
		const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: null, hoje: "2026-10-26" });
		return confirmarEtapa(curso, "esqueleto", { modulos: MODULOS, geradoEm: AGORA.toISOString(), modelo: MODELO, custo: 0.02, criadoEm: AGORA.toISOString(), calendario }, AGORA).curso;
	}

	async function extraido(arquivo: string, hash: string, trechos: Array<{ local: string; nome: string; texto: string }>) {
		const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
		await mkdir(pasta, { recursive: true });
		for (const trecho of trechos) {
			await writeFile(join(pasta, `${trecho.nome}.md`), `---\narquivo: ${arquivo}\nlocal: ${trecho.local}\norigem: texto\n---\n\n${trecho.texto}\n`, "utf8");
		}
		const manifesto = { versao: 1, arquivo, hash, tamanho: 1, tipo: "pdf", extraidoEm: AGORA.toISOString(), custo: 0, avisos: [], trechos: trechos.map(({ local, nome }) => ({ local, nome, origem: "texto" })) };
		await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");
	}

	/** Uma lição válida para gravar. */
	const umaLicao = (): Licao => validarLicao({ blocos: [explicacao(), questaoAlternativa()] }, { licao: { id: "l1", titulo: "A reta", objetivo: "", conceitos: ["c-a", "c-b"] }, trechos: TRECHOS, escopo: "so_material" }).licao;
	const geracao = (id: string) => ({ id, licoes: [umaLicao()], modelo: MODELO, custo: 0.12, materiaisUsados: [{ arquivo: "aula.pdf", hash: "h-aula" }] });
	const daMateria = async () => (await lerEventos(eventosMateria(dados, materia))).eventos;

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-modulos-"));
		materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
		await gravarMapa(dados, materia, {
			...mapaVazio(),
			situacao: "aprovado",
			aprovadoEm: AGORA.toISOString(),
			conceitos: [conceito("c-a", [ref("aula.pdf", 1), ref("aula.pdf", 2)]), conceito("c-b", [ref("aula.pdf", 2), ref("aula.pdf", 3)]), conceito("c-c", [ref("outra.pdf", 1)]), conceito("c-d")],
		});
		await extraido("aula.pdf", "h-aula", [
			{ local: "página 1", nome: "pagina-1", texto: "a".repeat(3000) },
			{ local: "página 2", nome: "pagina-2", texto: "b".repeat(3000) },
			{ local: "página 3", nome: "pagina-3", texto: "c".repeat(3000) },
		]);
		await extraido("outra.pdf", "h-outra", [{ local: "página 1", nome: "pagina-1", texto: "d".repeat(100) }]);
		await extraido("nada.pdf", "h-nada", [{ local: "página 1", nome: "pagina-1", texto: "e" }]);
		await gravarCurso(dados, cursoPronto());
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	it("o caminho do módulo; id inválido é erro", () => {
		expect(caminhoDoModulo(dados, materia, CURSO, "m3")).toBe(join(dados, "materias", materia, "cursos", CURSO, "modulos", "m3.json"));
		expect(() => caminhoDoModulo(dados, materia, CURSO, "../m1")).toThrow(ErroModulo);
	});

	it("sem arquivo, undefined e nenhuma situação", async () => {
		expect(await lerModulo(dados, materia, CURSO, "m1")).toBeUndefined();
		expect(await situacoesDoCurso(dados, materia, CURSO)).toEqual({ situacoes: {}, modulos: {}, concluidos: [], erros: [] });
	});

	it("gravar e ler: ida e volta, com o evento gerou_modulo", async () => {
		const pedido = { informacoes: "  Foco em resíduos. ", observacoes: "   ", materiaisNovos: ["aula-05.pdf", "aula-05.pdf"], pedidoEm: AGORA.toISOString() };
		const gravado = await gravarModuloGerado(dados, materia, CURSO, { ...geracao("m1"), pedido }, { agora: AGORA, sessao: "s1", prompts: [{ nome: "modulo-plano.md", hash: "abc" }, { nome: "modulo-licao.md", hash: "def" }] });
		expect(gravado).toMatchObject({ versao: 1, id: "m1", curso: CURSO, materia, situacao: "gerado", geradoEm: AGORA.toISOString(), modelo: MODELO, custo: 0.12 });
		expect(gravado.pedido).toEqual({ informacoes: "Foco em resíduos.", materiaisNovos: ["aula-05.pdf"], pedidoEm: AGORA.toISOString() });
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(gravado);
		const bruto = await readFile(caminhoDoModulo(dados, materia, CURSO, "m1"), "utf8");
		expect(Object.keys(JSON.parse(bruto))).toEqual(["versao", "id", "curso", "materia", "situacao", "pedido", "licoes", "geradoEm", "modelo", "custo", "materiaisUsados"]);
		expect(bruto.endsWith("}\n")).toBe(true);
		expect(await situacoesDoCurso(dados, materia, CURSO)).toMatchObject({ situacoes: { m1: "gerado" }, erros: [] });
		const eventos = await daMateria();
		expect(eventos.at(-1)).toMatchObject({
			verbo: "gerou_modulo",
			sessao: "s1",
			ts: AGORA.toISOString(),
			objeto: { materia, curso: CURSO, modulo: "m1" },
			resultado: { licoes: 1, blocos: 2, questoes: 1, custo: 0.12 },
			contexto: { modelo: MODELO, prompts: [{ nome: "modulo-plano.md", hash: "abc" }, { nome: "modulo-licao.md", hash: "def" }] },
		});
	});

	it("qualquer um pode ser gerado, fora de ordem; o gerado pode ser gerado de novo (substitui)", async () => {
		await gravarModuloGerado(dados, materia, CURSO, geracao("m2"), { agora: AGORA });
		await gravarModuloGerado(dados, materia, CURSO, geracao("m1"), { agora: AGORA });
		const denovo = await gravarModuloGerado(dados, materia, CURSO, { ...geracao("m1"), custo: 0.2 }, { agora: DEPOIS });
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(denovo);
		expect(denovo).toMatchObject({ custo: 0.2, geradoEm: DEPOIS.toISOString() });
		expect((await daMateria()).filter((evento) => evento.verbo === "gerou_modulo")).toHaveLength(3);
		await expect(gravarModuloGerado(dados, materia, CURSO, { ...geracao("m3"), licoes: [] })).rejects.toThrow(/Não há lições/);
	});

	it("um arquivo ilegível não é sobrescrito: lerModulo, gravar e marcar dão erro claro, e a lista o mostra em erros", async () => {
		const arquivo = caminhoDoModulo(dados, materia, CURSO, "m1");
		await mkdir(join(arquivo, ".."), { recursive: true });
		await writeFile(arquivo, "{ quebrado", "utf8");
		await expect(lerModulo(dados, materia, CURSO, "m1")).rejects.toThrow(/Não consegui ler o módulo .*m1\.json: o JSON está inválido.*nada foi gravado por cima/);
		await expect(gravarModuloGerado(dados, materia, CURSO, geracao("m1"))).rejects.toThrow(ErroModulo);
		await expect(marcarAguardando(dados, materia, CURSO, "m1", "nota")).rejects.toThrow(/Não consegui ler o módulo/);
		expect(await readFile(arquivo, "utf8")).toBe("{ quebrado");
		const lista = await situacoesDoCurso(dados, materia, CURSO);
		expect(lista.situacoes).toEqual({});
		expect(lista.erros).toEqual([{ modulo: "m1", mensagem: expect.stringMatching(/JSON está inválido/) }]);
		await writeFile(arquivo, JSON.stringify({ versao: 1, id: "m2", curso: CURSO, materia, situacao: "gerado", licoes: [] }), "utf8");
		await expect(lerModulo(dados, materia, CURSO, "m1")).rejects.toThrow(/o id "m2" não é o nome do arquivo/);
		expect((await daMateria()).filter((evento) => evento.verbo === "gerou_modulo")).toHaveLength(0);
	});

	it("marcarAguardando: foto dos prontos, evento, não segura os seguintes; material novo depois", async () => {
		const aguardando = await marcarAguardando(dados, materia, CURSO, "m1", "  A aula 5 sai na quinta. ", { agora: AGORA, sessao: "s1" });
		expect(aguardando).toEqual({
			versao: 1,
			id: "m1",
			curso: CURSO,
			materia,
			situacao: "aguardando_material",
			aguardando: {
				nota: "A aula 5 sai na quinta.",
				desde: AGORA.toISOString(),
				prontos: [
					{ arquivo: "aula.pdf", hash: "h-aula" },
					{ arquivo: "nada.pdf", hash: "h-nada" },
					{ arquivo: "outra.pdf", hash: "h-outra" },
				],
			},
			licoes: [],
		});
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(aguardando);
		expect((await daMateria()).at(-1)).toMatchObject({ verbo: "marcou_aguardando_material", sessao: "s1", objeto: { materia, curso: CURSO, modulo: "m1" }, resultado: { nota: "A aula 5 sai na quinta." } });
		// Qualquer um que não foi gerado pode aguardar, fora de ordem.
		await marcarAguardando(dados, materia, CURSO, "m3", undefined, { agora: AGORA });
		expect((await situacoesDoCurso(dados, materia, CURSO)).situacoes).toEqual({ m1: "aguardando_material", m3: "aguardando_material" });
		// Marcar de novo troca a nota e a foto.
		const denovo = await marcarAguardando(dados, materia, CURSO, "m1", "Ainda não.", { agora: DEPOIS });
		expect(denovo.aguardando).toMatchObject({ nota: "Ainda não.", desde: DEPOIS.toISOString() });
		// Material novo: um arquivo pronto que não estava na foto.
		expect(materialNovo(denovo.aguardando, [...denovo.aguardando.prontos])).toBe(false);
		await extraido("aula-05.pdf", "h5", [{ local: "página 1", nome: "pagina-1", texto: "f" }]);
		expect(materialNovo(denovo.aguardando, await materiaisProntos(dados, materia))).toBe(true);
		// Um aguardando pode ser gerado; um gerado não volta a aguardar.
		await gravarModuloGerado(dados, materia, CURSO, geracao("m1"), { agora: DEPOIS });
		await expect(marcarAguardando(dados, materia, CURSO, "m1", "")).rejects.toThrow(/um módulo gerado não volta a aguardar/);
		expect((await daMateria()).filter((evento) => evento.verbo === "marcou_aguardando_material")).toHaveLength(3);
	});

	it("concluirModulo: grava o concluidoEm sem mexer no resto, o evento concluiu_modulo, e a recomendação passa para o seguinte", async () => {
		const gerado = await gravarModuloGerado(dados, materia, CURSO, geracao("m1"), { agora: AGORA });
		const curso = cursoPronto();
		let lidos = await situacoesDoCurso(dados, materia, CURSO);
		expect(lidos.concluidos).toEqual([]);
		expect(proximoModulo(curso.esqueleto!, lidos.situacoes, lidos.concluidos)).toBe("m1");
		const concluido = await concluirModulo(dados, materia, CURSO, "m1", { agora: DEPOIS, sessao: "s1" });
		expect(concluido).toEqual({ ...gerado, concluidoEm: DEPOIS.toISOString() });
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(concluido);
		const bruto = await readFile(caminhoDoModulo(dados, materia, CURSO, "m1"), "utf8");
		expect(Object.keys(JSON.parse(bruto)).at(-1)).toBe("concluidoEm");
		lidos = await situacoesDoCurso(dados, materia, CURSO);
		expect(lidos.concluidos).toEqual(["m1"]);
		expect(proximoModulo(curso.esqueleto!, lidos.situacoes, lidos.concluidos)).toBe("m2");
		expect((await daMateria()).at(-1)).toMatchObject({
			verbo: "concluiu_modulo",
			sessao: "s1",
			ts: DEPOIS.toISOString(),
			objeto: { materia, curso: CURSO, modulo: "m1" },
			resultado: { licoes: 1, questoes: 1 },
		});
	});

	it("concluir duas vezes, sem arquivo ou aguardando é erro; gerar de novo um concluído é erro", async () => {
		await expect(concluirModulo(dados, materia, CURSO, "m1")).rejects.toThrow(/ainda não foi gerado/);
		await marcarAguardando(dados, materia, CURSO, "m2", "");
		await expect(concluirModulo(dados, materia, CURSO, "m2")).rejects.toThrow(/aguardando material/);
		await gravarModuloGerado(dados, materia, CURSO, geracao("m1"), { agora: AGORA });
		await concluirModulo(dados, materia, CURSO, "m1", { agora: AGORA });
		await expect(concluirModulo(dados, materia, CURSO, "m1", { agora: DEPOIS })).rejects.toThrow("O módulo já foi concluído.");
		await expect(concluirModulo(dados, materia, CURSO, "m1")).rejects.toThrow(ErroModulo);
		await expect(gravarModuloGerado(dados, materia, CURSO, geracao("m1"), { agora: DEPOIS })).rejects.toThrow(/já foi concluído/);
		expect(await lerModulo(dados, materia, CURSO, "m1")).toMatchObject({ concluidoEm: AGORA.toISOString(), geradoEm: AGORA.toISOString() });
		expect((await daMateria()).filter((evento) => evento.verbo === "concluiu_modulo")).toHaveLength(1);
		await expect(concluirModulo(dados, materia, CURSO, "m9")).rejects.toThrow(/Não achei o módulo "m9"/);
	});

	it("um concluidoEm que não é texto deixa o arquivo ilegível", async () => {
		const gerado = await gravarModuloGerado(dados, materia, CURSO, geracao("m1"), { agora: AGORA });
		await writeFile(caminhoDoModulo(dados, materia, CURSO, "m1"), JSON.stringify({ ...gerado, concluidoEm: 3 }), "utf8");
		await expect(lerModulo(dados, materia, CURSO, "m1")).rejects.toThrow(/concluidoEm não é um texto/);
	});

	it("marcarAguardando num curso que não está pronto ou num módulo que não existe é erro", async () => {
		await expect(marcarAguardando(dados, materia, CURSO, "m9", "")).rejects.toThrow(/Não achei o módulo "m9"/);
		const rascunho = novoCurso("rascunho", materia, { nome: "Rascunho", prazo: null, horasPorSemana: 2 }, AGORA);
		await gravarCurso(dados, rascunho);
		await expect(marcarAguardando(dados, materia, "rascunho", "m1", "")).rejects.toThrow(/ainda não foi criado/);
	});

	describe("entradaDoModelo", () => {
		it("o plano: o curso, o módulo, as lições, os conceitos com nível e locais, o formulário e os materiais usados", async () => {
			const entrada = await entradaDoModelo(dados, materia, CURSO, "m1", { pedido: { informacoes: " Foco nos resíduos. ", observacoes: "  " } });
			expect(entrada.licoes).toBeUndefined();
			expect(entrada.plano).toEqual({
				curso: { nome: "P1: regressão", prova: "P1", escopo: "so_material", tipo: "misto", motivo: "Passar na P1." },
				modulo: { id: "m1", nome: "A reta", objetivo: "Ajustar a reta.", tipo: "normal", horas: 2 },
				licoes: 2,
				conceitos: [
					{
						id: "c-a",
						nome: "Nome de c-a",
						descricao: "Descrição de c-a.",
						prioridade: "alta",
						nivel: "domina",
						locais: [
							{ arquivo: "aula.pdf", local: "página 1" },
							{ arquivo: "aula.pdf", local: "página 2" },
						],
					},
					{
						id: "c-b",
						nome: "Nome de c-b",
						descricao: "Descrição de c-b.",
						prioridade: "normal",
						nivel: "iniciante",
						locais: [
							{ arquivo: "aula.pdf", local: "página 2" },
							{ arquivo: "aula.pdf", local: "página 3" },
						],
					},
				],
				formulario: { informacoes: "Foco nos resíduos." },
			});
			expect(entrada.materiaisUsados).toEqual([{ arquivo: "aula.pdf", hash: "h-aula" }]);
		});

		it("com o plano: uma mensagem por lição, com os níveis, os trechos dos conceitos dela e as referências para validarLicao", async () => {
			const plano = validarPlano(
				{ licoes: [{ titulo: "Um", objetivo: "", conceitos: ["c-a"], roteiro: ["explicacao", "alternativa"] }, { titulo: "Dois", objetivo: "", conceitos: ["c-b"], roteiro: ["explicacao", "verificacao"] }] },
				{ conceitosDoModulo: ["c-a", "c-b"], licoes: 2 },
			);
			const entrada = await entradaDoModelo(dados, materia, CURSO, "m1", { plano });
			expect(entrada.licoes).toHaveLength(2);
			const [um, dois] = entrada.licoes!;
			expect(um!.plano).toEqual(plano);
			expect(um!.licao).toEqual(plano[0]);
			expect(um!.niveis).toEqual({ "c-a": "domina" });
			expect(um!.conceitos.map((item) => item.id)).toEqual(["c-a"]);
			expect(um!.trechos.map((item) => [item.id, item.trechos.map((trecho) => [trecho.local, trecho.texto.length])])).toEqual([["c-a", [["página 1", 3000], ["página 2", 3000]]]]);
			expect(um!.referencias).toEqual([ref("aula.pdf", 1), ref("aula.pdf", 2)]);
			expect(dois!.niveis).toEqual({ "c-b": "iniciante" });
			expect(dois!.referencias).toEqual([ref("aula.pdf", 2), ref("aula.pdf", 3)]);
			// As referências da entrada servem para validarLicao.
			const { licao } = validarLicao(
				{ blocos: [explicacao({ conceitos: ["c-b"], referencias: [{ arquivo: "aula.pdf", local: "página 3" }, { arquivo: "aula.pdf", local: "página 1" }] }), questaoAlternativa({ conceitos: ["c-b"] })] },
				{ licao: dois!.licao, trechos: dois!.referencias, escopo: "so_material" },
			);
			expect((licao.blocos[0] as { referencias: unknown }).referencias).toEqual([ref("aula.pdf", 3)]);
		});

		it("o limite dos trechos por lição, dividido entre os conceitos dela; o que não coube fica fora das referências", async () => {
			const plano = validarPlano({ licoes: [{ titulo: "Tudo", objetivo: "", conceitos: ["c-a", "c-b"], roteiro: [] }] }, { conceitosDoModulo: ["c-a", "c-b"], licoes: 1 });
			const [licao] = (await entradaDoModelo(dados, materia, CURSO, "m1", { plano, limiteTrechos: 5000 })).licoes!;
			expect(licao!.trechos.map((item) => item.trechos.map((trecho) => [trecho.local, trecho.texto.length, trecho.cortado ?? false]))).toEqual([
				[["página 1", 2500, true]],
				[["página 2", 2500, true]],
			]);
			expect(licao!.referencias).toEqual([ref("aula.pdf", 1), ref("aula.pdf", 2)]);
			const [padrao] = (await entradaDoModelo(dados, materia, CURSO, "m1", { plano })).licoes!;
			expect(padrao!.trechos.flatMap((item) => item.trechos).reduce((soma, trecho) => soma + trecho.texto.length, 0)).toBe(12_000);
		});

		it("no escopo livre, sem locais, trechos nem materiais usados; um conceito que saiu do mapa vai com o id", async () => {
			await gravarCurso(dados, cursoPronto("livre"));
			await gravarMapa(dados, materia, { ...mapaVazio(), situacao: "aprovado", aprovadoEm: AGORA.toISOString(), conceitos: [conceito("c-a", [ref("aula.pdf", 1)])] });
			const plano = validarPlano({ licoes: [{ titulo: "Um", objetivo: "", conceitos: ["c-a", "c-b"], roteiro: [] }] }, { conceitosDoModulo: ["c-a", "c-b"], licoes: 1 });
			const entrada = await entradaDoModelo(dados, materia, CURSO, "m1", { plano });
			expect(entrada.plano.conceitos.map((item) => item.locais)).toEqual([[], []]);
			expect(entrada.plano.conceitos[1]).toMatchObject({ id: "c-b", nome: "c-b", descricao: "", prioridade: "normal" });
			expect(entrada.licoes![0]!.trechos).toEqual([{ id: "c-a", trechos: [] }, { id: "c-b", trechos: [] }]);
			expect(entrada.licoes![0]!.referencias).toEqual([]);
			expect(entrada.materiaisUsados).toEqual([]);
		});

		it("módulo que não está no esqueleto é erro", async () => {
			await expect(entradaDoModelo(dados, materia, CURSO, "m9")).rejects.toThrow(ErroModulo);
		});
	});
});
