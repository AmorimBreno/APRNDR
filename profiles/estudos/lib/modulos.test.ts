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
	ARQUIVO_ESTRUTURA_LICAO,
	ARQUIVOS_METODO,
	arquivoDeMetodo,
	arquivosDeMetodo,
	type Bloco,
	caminhoDoModulo,
	caracteresDaLicao,
	concluirModulo,
	conferirPlano,
	entradaDoModelo,
	ErroModulo,
	frasesDoTexto,
	itemDoRoteiro,
	type Licao,
	type ModuloGerado,
	lerModulo,
	licoesPorHoras,
	marcarAguardando,
	materialNovo,
	MINIMO_CARACTERES_CONCEITO,
	MINIMO_CARACTERES_EXEMPLO,
	MINIMO_CARACTERES_INTRODUCAO,
	gravarModuloGerado,
	nivelDoConceito,
	niveisDoModulo,
	PAINEL_MODULOS,
	podeGerar,
	proximoModulo,
	REGRAS_DO_ESQUEMA,
	resumoDoModulo,
	roteiroDaLicao,
	situacoesDoCurso,
	validarBloco,
	validarLicao,
	validarPlano,
	violacoesDoEsquema,
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

describe("validarPlano e conferirPlano (o esquema da lição no roteiro)", () => {
	const doModulo = ["c-a", "c-b", "c-c"];
	const BOM = ["introducao", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"];
	const licao = (titulo: string, conceitos: unknown, roteiro: unknown = BOM, extra: Record<string, unknown> = {}) => ({ titulo, objetivo: `Objetivo de ${titulo}.`, conceitos, roteiro, ...extra });
	/** O roteiro consertado de uma lição só e os consertos (regra e frase). */
	const consertar = (roteiro: unknown, opcoes: Partial<Parameters<typeof conferirPlano>[1]> = {}) => {
		const { licoes, consertos } = conferirPlano({ licoes: [licao("Uma", ["c-a", "c-b", "c-c"], roteiro)] }, { conceitosDoModulo: doModulo, licoes: 1, ...opcoes });
		return { roteiro: licoes[0]!.roteiro, regras: consertos.map((item) => item.regra), mensagens: consertos.map((item) => item.mensagem) };
	};

	it("um plano bom pelo esquema: ids l1…, campos limpos e nenhum conserto", () => {
		const longo = ["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "exemplo_incompleto", "verificacao", "ideia_central", "alternativa"];
		const { licoes, consertos } = conferirPlano(
			{ licoes: [licao("  A   reta ", ["c-a"], longo, { objetivo: "  Objetivo de A reta. " }), licao("Resíduos", ["c-b", "c-c"])] },
			{ conceitosDoModulo: doModulo, licoes: 2 },
		);
		expect(licoes).toEqual([
			{ id: "l1", titulo: "A reta", objetivo: "Objetivo de A reta.", conceitos: ["c-a"], roteiro: longo },
			{ id: "l2", titulo: "Resíduos", objetivo: "Objetivo de Resíduos.", conceitos: ["c-b", "c-c"], roteiro: BOM },
		]);
		expect(consertos).toEqual([]);
		// validarPlano devolve só as lições.
		expect(validarPlano({ licoes: [licao("A reta", ["c-a"], longo)] }, { conceitosDoModulo: ["c-a"], licoes: 1 })).toEqual([licoes[0]]);
	});

	it("conceitos de fora saem; uma lição só com conceitos de fora sai, e o conserto diz qual", () => {
		const { licoes, consertos } = conferirPlano({ licoes: [licao("Fora", ["c-x"]), licao("Um", ["c-a", "c-x", " c-b ", "c-a"]), licao("Dois", ["c-c"])] }, { conceitosDoModulo: doModulo, licoes: 3 });
		expect(licoes.map((item) => [item.id, item.titulo, item.conceitos])).toEqual([
			["l1", "Um", ["c-a", "c-b"]],
			["l2", "Dois", ["c-c"]],
		]);
		expect(consertos).toEqual([{ licao: null, regra: "licao_sem_conceitos", mensagem: 'A 1ª lição do plano ("Fora") não cita nenhum conceito do módulo; saiu.' }]);
	});

	it("introdução: a que falta entra no começo; a que está em outro lugar vai para o começo; as a mais saem", () => {
		expect(consertar(["conceito", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"])).toEqual({
			roteiro: BOM,
			regras: ["introducao"],
			mensagens: ['Lição l1 ("Uma"): faltava a introdução; entrou uma no começo do roteiro.'],
		});
		expect(consertar(["conceito", "introducao", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"])).toMatchObject({ roteiro: BOM, mensagens: [expect.stringMatching(/não era o primeiro bloco; foi para o começo/)] });
		expect(consertar(["introducao", "conceito", "introducao", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"])).toMatchObject({ roteiro: BOM, mensagens: [expect.stringMatching(/mais de uma introdução/)] });
	});

	it("as questões antes do primeiro conceito saem", () => {
		expect(consertar(["introducao", "verificacao", "alternativa", "conceito", "exemplo_resolvido", "ideia_central", "alternativa"])).toEqual({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "ideia_central", "alternativa"],
			regras: ["questao_antes_do_conceito"],
			mensagens: ['Lição l1 ("Uma"): as questões antes do primeiro conceito (verificacao e alternativa) saíram.'],
		});
	});

	it("duas questões seguidas: sai a segunda", () => {
		expect(consertar(["introducao", "conceito", "exemplo_resolvido", "alternativa", "dissertativa", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"])).toEqual({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "alternativa", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"],
			regras: ["questoes_seguidas"],
			mensagens: ['Lição l1 ("Uma"): havia questões seguidas; saiu a segunda (dissertativa).'],
		});
	});

	it("a pergunta que não vem logo depois de um conceito ou exemplo sai", () => {
		expect(consertar(["introducao", "conceito", "exemplo_resolvido", "alternativa", "verificacao", "conceito", "ideia_central", "verificacao", "alternativa"])).toEqual({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "alternativa", "conceito", "ideia_central", "alternativa"],
			regras: ["pergunta_fora_do_lugar"],
			mensagens: ['Lição l1 ("Uma"): 2 perguntas (verificacao) que não vinham logo depois de um conceito ou exemplo saíram.'],
		});
	});

	it("ideia central: a que falta entra logo antes da questão final; a que está em outro lugar vai para lá; as a mais saem", () => {
		expect(consertar(["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "exemplo_resolvido", "alternativa"])).toEqual({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "exemplo_resolvido", "ideia_central", "alternativa"],
			regras: ["ideia_central"],
			mensagens: ['Lição l1 ("Uma"): faltava a ideia central; entrou uma logo antes da questão final (alternativa).'],
		});
		expect(consertar(["introducao", "conceito", "ideia_central", "exemplo_resolvido", "verificacao", "conceito", "exemplo_resolvido", "alternativa"])).toMatchObject({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "exemplo_resolvido", "ideia_central", "alternativa"],
			mensagens: [expect.stringMatching(/a ideia central foi para logo antes da questão final \(alternativa\)/)],
		});
		expect(consertar(["introducao", "conceito", "exemplo_resolvido", "ideia_central", "dissertativa", "conceito", "ideia_central", "alternativa"])).toMatchObject({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "dissertativa", "conceito", "ideia_central", "alternativa"],
			mensagens: [expect.stringMatching(/havia 2 ideias centrais; ficou uma/)],
		});
		// Só com perguntas (sem quiz nem dissertativa), a ideia central não é exigida.
		expect(consertar(["introducao", "conceito", "exemplo_resolvido", "verificacao"])).toEqual({ roteiro: ["introducao", "conceito", "exemplo_resolvido", "verificacao"], regras: [], mensagens: [] });
	});

	it("tirar a ideia central do lugar errado não deixa duas questões seguidas", () => {
		expect(consertar(["introducao", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa", "conceito", "exemplo_resolvido", "dissertativa"])).toEqual({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "exemplo_resolvido", "ideia_central", "dissertativa"],
			regras: ["ideia_central", "questoes_seguidas"],
			mensagens: [expect.stringMatching(/foi para logo antes da questão final \(dissertativa\)/), expect.stringMatching(/saiu a segunda \(alternativa\)/)],
		});
	});

	it("sem questão no fim, um quiz no fim (com a ideia central antes)", () => {
		expect(consertar(["introducao", "conceito", "exemplo_resolvido"])).toEqual({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "ideia_central", "alternativa"],
			regras: ["termina_sem_questao", "ideia_central"],
			mensagens: [expect.stringMatching(/não terminava com uma questão; entrou um quiz \(alternativa\) no fim/), expect.stringMatching(/faltava a ideia central/)],
		});
	});

	it("itens desconhecidos saem; a explicação sem formato vira introdução, conceito ou exemplo (pelo nível) pela posição", () => {
		const roteiro = ["explicacao", " explicacao ", "explicacao", "verificacao", "lixo", "explicacao", 3, "alternativa"];
		expect(consertar(roteiro)).toEqual({
			roteiro: ["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "ideia_central", "alternativa"],
			regras: ["item_desconhecido", "explicacao_sem_formato", "ideia_central"],
			mensagens: [
				'Lição l1 ("Uma"): os itens desconhecidos "lixo" e "3" saíram do roteiro.',
				'Lição l1 ("Uma"): as explicações sem formato viraram introducao, conceito, exemplo_resolvido e conceito, pela posição.',
				expect.stringMatching(/faltava a ideia central/),
			],
		});
		// O exemplo segue o nível mais baixo dos conceitos da lição.
		expect(consertar(roteiro, { niveis: { "c-a": "domina", "c-b": "domina", "c-c": "domina" } }).roteiro[2]).toBe("problema_aberto");
		expect(consertar(roteiro, { niveis: { "c-a": "domina", "c-b": "intermediario" } }).roteiro[2]).toBe("exemplo_incompleto");
	});

	it("um roteiro sem nenhum conceito não tem conserto: ErroModulo (a extensão tenta de novo)", () => {
		for (const roteiro of [["introducao", "verificacao", "alternativa"], null, [], ["explicacao", "alternativa"], ["introducao", "exemplo_resolvido", "alternativa"]]) {
			expect(() => consertar(roteiro)).toThrow(/A lição l1 do plano \("Uma"\) não tem nenhum conceito no roteiro/);
		}
		expect(() => consertar(null)).toThrow(ErroModulo);
	});

	it("o conceito que nenhuma lição cobriu entra na última, na ordem do módulo; as lições a mais saem; os consertos dizem", () => {
		const { licoes, consertos } = conferirPlano({ licoes: [licao("Um", ["c-b"]), licao("Dois", ["c-b"]), licao("Três", ["c-a"])] }, { conceitosDoModulo: doModulo, licoes: 2 });
		expect(licoes.map((item) => item.conceitos)).toEqual([["c-b"], ["c-b", "c-a", "c-c"]]);
		expect(consertos).toEqual([
			{ licao: null, regra: "licoes_a_mais", mensagem: "O plano veio com 3 lições; ficaram as 2 primeiras que valem, e as outras saíram." },
			{ licao: "l2", regra: "conceito_sem_licao", mensagem: 'Lição l2 ("Dois"): os conceitos c-a e c-c, que nenhuma lição cobria, entraram nesta (a última).' },
		]);
	});

	it("título vazio vira Lição N; teórico ou misto sem dissertativa: o quiz final da última vira dissertativa (sem quiz final, ela entra no fim, com a ideia central antes)", () => {
		const { licoes, consertos } = conferirPlano({ licoes: [licao("Um", ["c-a"]), licao("  ", ["c-b", "c-c"])] }, { conceitosDoModulo: doModulo, licoes: 2, tipo: "misto" });
		expect(licoes[0]!.roteiro).toEqual(BOM);
		expect(licoes[1]).toMatchObject({ titulo: "Lição 2", roteiro: ["introducao", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "dissertativa"] });
		expect(consertos).toEqual([
			{ licao: "l2", regra: "dissertativa", mensagem: 'Lição l2 ("Lição 2"): o curso é teórico ou misto e o plano não tinha dissertativa; o quiz final desta lição (a última) virou uma dissertativa.' },
		]);
		const soPerguntas = conferirPlano({ licoes: [licao("Um", doModulo, ["introducao", "conceito", "ideia_central", "exemplo_resolvido", "verificacao"])] }, { conceitosDoModulo: doModulo, licoes: 1, tipo: "teorico" });
		expect(soPerguntas.licoes[0]!.roteiro).toEqual(["introducao", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "dissertativa"]);
		expect(soPerguntas.consertos.map((item) => item.regra)).toEqual(["dissertativa"]);
		const aplicado = conferirPlano({ licoes: [licao("Um", ["c-a", "c-b", "c-c"])] }, { conceitosDoModulo: doModulo, licoes: 1, tipo: "aplicado" });
		expect(aplicado.licoes[0]!.roteiro).toEqual(BOM);
		expect(aplicado.consertos).toEqual([]);
		// Já com dissertativa no plano, nada entra.
		const comDissertativa = ["introducao", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "dissertativa"];
		expect(conferirPlano({ licoes: [licao("Um", ["c-a", "c-b", "c-c"], comDissertativa)] }, { conceitosDoModulo: doModulo, licoes: 1, tipo: "teorico" }).licoes[0]!.roteiro).toEqual(comDissertativa);
	});

	it("as regras do esquema são as que mudam a ordem; todo roteiro consertado segue o esquema", () => {
		expect(REGRAS_DO_ESQUEMA).toEqual(["explicacao_sem_formato", "introducao", "questao_antes_do_conceito", "questoes_seguidas", "pergunta_fora_do_lugar", "termina_sem_questao", "ideia_central"]);
		const roteiros = [
			["alternativa", "conceito", "verificacao", "verificacao", "ideia_central", "dissertativa", "alternativa", "exemplo_incompleto"],
			["conceito", "ideia_central", "ideia_central", "verificacao", "dissertativa", "dissertativa"],
			["introducao", "conceito", "verificacao", "exemplo_resolvido", "ideia_central", "verificacao"],
		];
		for (const roteiro of roteiros) {
			for (const tipo of ["teorico", "aplicado"] as const) expect(violacoesDoEsquema(consertar(roteiro, { tipo }).roteiro)).toEqual([]);
		}
	});

	it("sem lição que valha é erro", () => {
		expect(() => validarPlano({}, { conceitosDoModulo: doModulo, licoes: 2 })).toThrow(/falta "licoes"/);
		expect(() => validarPlano({ licoes: [licao("Fora", ["c-x"]), "lixo"] }, { conceitosDoModulo: doModulo, licoes: 2 })).toThrow(ErroModulo);
	});
});

describe("violacoesDoEsquema", () => {
	it("cada regra, no item que falha", () => {
		expect(violacoesDoEsquema(["introducao", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"])).toEqual([]);
		expect(violacoesDoEsquema(["conceito", "alternativa"])).toEqual([
			{ regra: "introducao", indice: 0 },
			{ regra: "ideia_central", indice: 1 },
		]);
		expect(violacoesDoEsquema(["introducao", "alternativa"])).toEqual([{ regra: "sem_conceito", indice: -1 }]);
		expect(violacoesDoEsquema(["introducao", "verificacao", "conceito", "verificacao", "alternativa", "ideia_central", "verificacao"])).toEqual([
			{ regra: "questao_antes_do_conceito", indice: 1 },
			{ regra: "questoes_seguidas", indice: 4 },
			{ regra: "pergunta_fora_do_lugar", indice: 6 },
			{ regra: "ideia_central", indice: 4 },
		]);
		// As lições antigas não seguem o esquema (e continuam válidas para ler).
		expect(violacoesDoEsquema(["conceito", "verificacao", "exemplo_resolvido", "alternativa"]).map((item) => item.regra)).toEqual(["introducao", "ideia_central"]);
	});
});

describe("arquivosDeMetodo", () => {
	it("a estrutura, os arquivos dos itens do roteiro e os termos, sem repetir, na ordem fixa", () => {
		expect(arquivosDeMetodo(["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "problema_aberto", "verificacao", "ideia_central", "alternativa", "dissertativa"])).toEqual([
			"estrutura-da-licao.md",
			"introducao.md",
			"conceito.md",
			"exemplos.md",
			"pergunta.md",
			"ideia-central.md",
			"quiz.md",
			"dissertativa.md",
			"termos.md",
		]);
		expect(arquivosDeMetodo(["dissertativa", "ideia_central", "conceito", "introducao", "exemplo_incompleto"])).toEqual(["estrutura-da-licao.md", "introducao.md", "conceito.md", "exemplos.md", "ideia-central.md", "dissertativa.md", "termos.md"]);
		expect(arquivosDeMetodo([])).toEqual(["estrutura-da-licao.md", "termos.md"]);
		expect(arquivosDeMetodo(["lixo", "explicacao", 3])).toEqual(["estrutura-da-licao.md", "termos.md"]);
		expect(ARQUIVOS_METODO[0]).toBe(ARQUIVO_ESTRUTURA_LICAO);
	});

	it("o arquivo de um bloco (a reescrita): pelo item do roteiro", () => {
		expect(arquivoDeMetodo(itemDoRoteiro({ tipo: "explicacao", formato: "exemplo_incompleto" }))).toBe("exemplos.md");
		expect(arquivoDeMetodo(itemDoRoteiro({ tipo: "explicacao", formato: "introducao" }))).toBe("introducao.md");
		expect(arquivoDeMetodo(itemDoRoteiro({ tipo: "verificacao" }))).toBe("pergunta.md");
		expect(arquivoDeMetodo(itemDoRoteiro({ tipo: "ideia_central" }))).toBe("ideia-central.md");
		expect(arquivoDeMetodo("alternativa")).toBe("quiz.md");
		expect(itemDoRoteiro({ tipo: "explicacao" })).toBe("conceito");
	});
});

// --- As lições ----------------------------------------------------------------------------

const LICAO = { id: "l2", titulo: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-a", "c-b"] };
const TRECHOS = [
	{ arquivo: "aula.pdf", local: "página 1", trecho: "pagina-1" },
	{ arquivo: "aula.pdf", local: "página 2", trecho: "pagina-2" },
];
/** Um texto de explicação com `n` caracteres depois de aparado. */
const texto = (n: number, comeco = "") => `${comeco}${"x".repeat(Math.max(0, n - comeco.length))}`;
const TEXTO_EXEMPLO = texto(MINIMO_CARACTERES_EXEMPLO, "Um **exemplo**.\n\nPasso 1. ");
const explicacao = (extra: Record<string, unknown> = {}) => ({ tipo: "explicacao", conceitos: ["c-a"], formato: "exemplo_resolvido", texto: `  ${TEXTO_EXEMPLO}  `, referencias: [{ arquivo: "aula.pdf", local: "página 1" }], ...extra });
const introducao = (extra: Record<string, unknown> = {}) => explicacao({ formato: "introducao", texto: texto(MINIMO_CARACTERES_INTRODUCAO, "Contexto. "), ...extra });
const conceito = (extra: Record<string, unknown> = {}) => explicacao({ formato: "conceito", texto: texto(MINIMO_CARACTERES_CONCEITO, "A teoria. "), ...extra });
const verificacao = (extra: Record<string, unknown> = {}) => ({ tipo: "verificacao", conceitos: ["c-a"], pergunta: " E aí? ", respostaEsperada: " Assim. ", ...extra });
const ideiaCentral = (extra: Record<string, unknown> = {}) => ({ tipo: "ideia_central", conceitos: ["c-a"], texto: "  A reta resume a tendência. Os resíduos mostram o que ela não explica.  ", ...extra });
const questaoAlternativa = (extra: Record<string, unknown> = {}) => ({
	tipo: "alternativa",
	conceitos: ["c-a"],
	enunciado: "Qual?",
	alternativas: [{ texto: "Certa", correta: true }, { texto: "Errada", confusao: "Confunde." }, { texto: "Outra", confusao: "Outra confusão." }],
	explicacao: "Porque.",
	referencias: [],
	...extra,
});
const dissertativa = (extra: Record<string, unknown> = {}) => ({ tipo: "dissertativa", conceitos: ["c-a", "c-b"], enunciado: "Explique.", rubrica: RUBRICA, respostaModelo: "Modelo.", ...extra });
/** Os blocos de uma lição pelo esquema: introdução, conceito, exemplo, pergunta, ideia central e quiz. */
const blocosDoEsquema = () => [introducao(), conceito(), explicacao(), verificacao(), ideiaCentral(), questaoAlternativa()];

describe("validarLicao", () => {
	it("uma lição pelo esquema: ids l<n>-b<n>, blocos limpos", () => {
		const { licao, descartes } = validarLicao(
			{ blocos: [introducao(), conceito(), explicacao(), verificacao(), conceito({ conceitos: ["c-b"] }), explicacao({ formato: "exemplo_incompleto" }), questaoAlternativa({ conceitos: ["c-b"], contexto: "  " }), ideiaCentral(), dissertativa()] },
			{ licao: LICAO, trechos: TRECHOS, escopo: "material_base" },
		);
		expect(descartes).toEqual([]);
		expect(licao).toMatchObject({ id: "l2", titulo: "A reta", objetivo: "Ajustar a reta.", conceitos: ["c-a", "c-b"] });
		expect(roteiroDaLicao(licao)).toEqual(["introducao", "conceito", "exemplo_resolvido", "verificacao", "conceito", "exemplo_incompleto", "alternativa", "ideia_central", "dissertativa"]);
		expect(licao.blocos.map((bloco) => bloco.id)).toEqual(["l2-b1", "l2-b2", "l2-b3", "l2-b4", "l2-b5", "l2-b6", "l2-b7", "l2-b8", "l2-b9"]);
		expect(licao.blocos[2]).toEqual({
			id: "l2-b3",
			tipo: "explicacao",
			conceitos: ["c-a"],
			formato: "exemplo_resolvido",
			texto: TEXTO_EXEMPLO,
			referencias: [{ arquivo: "aula.pdf", local: "página 1", trecho: "pagina-1" }],
		});
		expect(licao.blocos[3]).toEqual({ id: "l2-b4", tipo: "verificacao", conceitos: ["c-a"], pergunta: "E aí?", respostaEsperada: "Assim." });
		expect(licao.blocos[6]).not.toHaveProperty("contexto");
		expect(licao.blocos[7]).toEqual({ id: "l2-b8", tipo: "ideia_central", conceitos: ["c-a"], texto: "A reta resume a tendência. Os resíduos mostram o que ela não explica." });
		expect(licao.blocos[8]).toMatchObject({ referencias: [], rubrica: RUBRICA });
	});

	it("referência a um local que não foi mandado é descartada (o bloco fica)", () => {
		const blocos = blocosDoEsquema();
		blocos[2] = explicacao({
			referencias: [
				{ arquivo: "aula.pdf", local: "página 9" },
				{ arquivo: "outra.pdf", local: "página 1" },
				{ arquivo: "aula.pdf", local: "página 2", trecho: "inventado" },
				{ arquivo: "aula.pdf", local: "página 2" },
				"lixo",
			],
		});
		const { licao } = validarLicao({ blocos }, { licao: LICAO, trechos: TRECHOS, escopo: "material_base" });
		expect((licao.blocos[2] as { referencias: unknown }).referencias).toEqual([{ arquivo: "aula.pdf", local: "página 2", trecho: "pagina-2" }]);
	});

	it("complemento: em só o material, a explicação marcada ou sem referência válida; em material base, só a marcada; no livre, nenhuma", () => {
		const blocos = [introducao({ referencias: [] }), conceito({ complemento: true }), explicacao(), verificacao(), ideiaCentral(), questaoAlternativa()];
		const complementos = (escopo: "so_material" | "material_base" | "livre") =>
			validarLicao({ blocos }, { licao: LICAO, trechos: TRECHOS, escopo }).licao.blocos.filter((bloco) => bloco.tipo === "explicacao").map((bloco) => "complemento" in bloco);
		expect(complementos("so_material")).toEqual([true, true, false]);
		expect(complementos("material_base")).toEqual([false, true, false]);
		expect(complementos("livre")).toEqual([false, false, false]);
	});

	it("questão inválida, bloco vazio, formato desconhecido, conceito de fora e ideia central inválida são descartados, com o motivo", () => {
		const { licao, descartes } = validarLicao(
			{
				blocos: [
					introducao(),
					conceito(),
					questaoAlternativa({ alternativas: [{ texto: "A", correta: true }, { texto: "B", correta: true }, { texto: "C", confusao: "x" }] }),
					explicacao(),
					questaoAlternativa({ alternativas: [{ texto: "A", correta: true }, { texto: "B" }, { texto: "C", confusao: "x" }] }),
					{ tipo: "dissertativa", conceitos: ["c-a"], enunciado: "Explique.", rubrica: RUBRICA.slice(0, 2) },
					explicacao({ texto: "   " }),
					explicacao({ formato: "resumo" }),
					questaoAlternativa({ conceitos: ["c-x"] }),
					{ tipo: "verificacao", conceitos: ["c-a"], pergunta: "E?" },
					{ tipo: "video", conceitos: ["c-a"] },
					ideiaCentral({ texto: "  " }),
					ideiaCentral({ texto: "Um. Dois. Três. Quatro." }),
					ideiaCentral({ conceitos: ["c-x"] }),
					ideiaCentral(),
					questaoAlternativa({ conceitos: ["c-x", "c-b"] }),
				],
			},
			{ licao: LICAO, trechos: TRECHOS, escopo: "material_base" },
		);
		expect(licao.blocos.map((bloco) => [bloco.id, bloco.tipo, bloco.conceitos])).toEqual([
			["l2-b1", "explicacao", ["c-a"]],
			["l2-b2", "explicacao", ["c-a"]],
			["l2-b3", "explicacao", ["c-a"]],
			["l2-b4", "ideia_central", ["c-a"]],
			["l2-b5", "alternativa", ["c-b"]],
		]);
		expect(descartes).toEqual([
			"bloco 3: 2 alternativas corretas (precisa de exatamente uma)",
			"bloco 5: a alternativa errada 2 está sem a confusão que representa",
			"bloco 6: a rubrica precisa de 3 a 5 critérios (veio 2)",
			"bloco 7: explicação vazia",
			'bloco 8: formato de explicação desconhecido ("resumo")',
			"bloco 9: cita só conceitos fora da lição (c-x)",
			"bloco 10: verificação sem a resposta esperada",
			'bloco 11: tipo desconhecido ("video")',
			"bloco 12: ideia central vazia",
			"bloco 13: a ideia central tem 4 frases (precisa de 1 a 3)",
			"bloco 14: cita só conceitos fora da lição (c-x)",
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

	const erroDe = (blocos: unknown[]) => {
		try {
			validarLicao({ blocos }, { licao: LICAO, trechos: TRECHOS, escopo: "material_base" });
		} catch (erro) {
			expect(erro).toBeInstanceOf(ErroModulo);
			return (erro as Error).message;
		}
		throw new Error("validarLicao não deu erro");
	};

	it("sem introdução: o erro diz o que corrigir", () => {
		const [, ...semIntroducao] = blocosDoEsquema();
		expect(erroDe(semIntroducao)).toBe(
			'A lição l2 ("A reta") não segue o esquema da lição. A lição começa por l2-b1 (conceito); o primeiro bloco precisa ser a introdução (explicação de formato "introducao": o que é o tema, por que importa e onde se usa).',
		);
	});

	it("duas questões seguidas, questão antes do conceito, pergunta fora do lugar e ideia central faltando", () => {
		expect(erroDe([introducao(), conceito(), explicacao(), verificacao(), questaoAlternativa(), ideiaCentral(), questaoAlternativa()])).toMatch(
			/As questões l2-b4 \(verificacao\) e l2-b5 \(alternativa\) estão seguidas; ponha uma explicação entre elas ou tire uma\./,
		);
		expect(erroDe([introducao(), verificacao(), conceito(), explicacao(), ideiaCentral(), questaoAlternativa()])).toMatch(/A questão l2-b2 \(verificacao\) vem antes do primeiro conceito/);
		expect(erroDe([introducao(), conceito(), explicacao(), ideiaCentral(), verificacao(), conceito(), ideiaCentral(), questaoAlternativa()])).toMatch(
			/A pergunta l2-b5 \(verificacao\) vem depois de l2-b4 \(ideia_central\); uma pergunta \(verificacao\) vem logo depois de um conceito ou de um exemplo\./,
		);
		expect(erroDe([introducao(), conceito(), explicacao(), verificacao(), conceito(), questaoAlternativa()])).toMatch(/Falta a ideia central \(bloco "ideia_central", de 1 a 3 frases\) logo antes da questão final l2-b6 \(alternativa\)\./);
		expect(erroDe([introducao(), explicacao(), ideiaCentral(), questaoAlternativa()])).toMatch(/não tem nenhuma explicação de formato "conceito"/);
		// A ideia central inválida sai e o erro leva o motivo.
		const comIdeiaLonga = blocosDoEsquema();
		comIdeiaLonga[4] = ideiaCentral({ texto: "Um. Dois. Três. Quatro." });
		expect(erroDe(comIdeiaLonga)).toMatch(/Falta a ideia central .* Descartados: bloco 5: a ideia central tem 4 frases \(precisa de 1 a 3\)\.$/);
	});

	it("uma explicação curta: a mensagem diz o tamanho, o mínimo e o que desenvolver", () => {
		const blocos = blocosDoEsquema();
		blocos[1] = conceito({ texto: texto(420) });
		expect(erroDe(blocos)).toBe('A lição l2 ("A reta") não segue o esquema da lição. A explicação l2-b2 (conceito) tem 420 caracteres; o mínimo é 900. Desenvolva o porquê e um exemplo.');
		blocos[0] = introducao({ texto: texto(MINIMO_CARACTERES_INTRODUCAO - 1) });
		blocos[2] = explicacao({ formato: "problema_aberto", texto: texto(100) });
		const mensagem = erroDe(blocos);
		expect(mensagem).toMatch(/A explicação l2-b1 \(introducao\) tem 599 caracteres; o mínimo é 600\. Desenvolva o contexto/);
		expect(mensagem).toMatch(/A explicação l2-b3 \(problema_aberto\) tem 100 caracteres; o mínimo é 900\. Desenvolva o exemplo passo a passo e explique cada passo, não só o código\./);
	});

	it("pouco texto nas explicações: a proporção (o gabarito não conta)", () => {
		const blocos = blocosDoEsquema();
		// Explicações no mínimo: 600 + 900 + 900 + a ideia central; um quiz com um enunciado enorme passa dos 30 %.
		blocos[5] = questaoAlternativa({ enunciado: texto(1500) });
		expect(erroDe(blocos)).toMatch(/As explicações \(introdução, conceitos, exemplos e ideia central\) têm 6\d % dos caracteres da lição; o mínimo é 70 %\. Desenvolva mais as explicações ou enxugue as questões\./);
		// O gabarito enorme não pesa.
		blocos[5] = questaoAlternativa({ explicacao: texto(5000) });
		expect(() => validarLicao({ blocos }, { licao: LICAO, trechos: TRECHOS, escopo: "material_base" })).not.toThrow();
	});
});

describe("caracteresDaLicao e frasesDoTexto", () => {
	it("as explicações e a ideia central pelo texto; as questões pelo que o aluno lê antes de responder", () => {
		const blocos = [
			{ tipo: "explicacao", conceitos: [], formato: "conceito", texto: "abcde", referencias: [] },
			{ tipo: "ideia_central", conceitos: [], texto: "fgh" },
			{ tipo: "verificacao", conceitos: [], pergunta: "ij", respostaEsperada: "não conta" },
			{ tipo: "alternativa", conceitos: [], contexto: "k", enunciado: "l", alternativas: [{ texto: "m", correta: true }, { texto: "n", confusao: "não conta" }], explicacao: "não conta", referencias: [] },
			{ tipo: "dissertativa", conceitos: [], enunciado: "op", rubrica: RUBRICA, respostaModelo: "não conta", referencias: [] },
		] as unknown as Bloco[];
		expect(caracteresDaLicao(blocos)).toEqual({ explicacoes: 8, questoes: 8, total: 16, proporcao: 0.5 });
		expect(caracteresDaLicao([])).toEqual({ explicacoes: 0, questoes: 0, total: 0, proporcao: 0 });
	});

	it("frases pelo ponto, interrogação, exclamação ou reticências seguidos de espaço", () => {
		expect(frasesDoTexto("")).toBe(0);
		expect(frasesDoTexto("Sem ponto final")).toBe(1);
		expect(frasesDoTexto("O R² vale 0.85 aqui. Por quê? Porque sim!  E mais…\nFim.")).toBe(5);
	});
});

describe("validarLicao e validarBloco: os termos-chave (docs/termos.md)", () => {
	const opcoes = { licao: LICAO, trechos: TRECHOS, escopo: "material_base" as const };
	const GLOSSARIO = [{ id: "t-reta", termo: "reta" }];
	const comMarcas = () => [
		introducao({ texto: texto(MINIMO_CARACTERES_INTRODUCAO + 100, "A [reta](termo:t-reta) e o [x](termo:t-x). ") }),
		conceito({ texto: texto(MINIMO_CARACTERES_CONCEITO + 100, "Um [resíduo](termo:novo-1) é a distância até a reta. ") }),
		explicacao(),
		verificacao({ pergunta: "O [resíduo](termo:novo-1)?" }),
		ideiaCentral(),
		questaoAlternativa(),
	];
	const resíduo = { chave: "novo-1", termo: "resíduo", definicao: "A distância de um ponto até a reta.", conceito: "c-a", explicadoEm: 2 };

	it("os termos novos com o bloco que os explica; as marcas desconhecidas viram texto; as dos novos ficam com a chave", () => {
		const { licao, termos } = validarLicao({ blocos: comMarcas(), termos: [resíduo] }, { ...opcoes, glossario: GLOSSARIO });
		expect(termos.novos).toEqual([{ chave: "novo-1", termo: "resíduo", definicao: "A distância de um ponto até a reta.", conceito: "c-a", bloco: "l2-b2" }]);
		expect((licao.blocos[0] as { texto: string }).texto.startsWith("A [reta](termo:t-reta) e o x. ")).toBe(true);
		expect((licao.blocos[3] as { pergunta: string }).pergunta).toBe("O [resíduo](termo:novo-1)?");
		// Sem glossário (a chamada de antes), as marcas do glossário também viram texto.
		expect((validarLicao({ blocos: comMarcas(), termos: [resíduo] }, opcoes).licao.blocos[0] as { texto: string }).texto.startsWith("A reta e o x. ")).toBe(true);
	});

	it("o termo usado antes de explicado é problema da lição (junto dos do esquema); sem rigidoNosTermos, as marcas antes viram texto", () => {
		const blocos = comMarcas();
		blocos[0] = introducao({ texto: texto(MINIMO_CARACTERES_INTRODUCAO + 100, "Os [resíduos](termo:novo-1) aparecem. ") });
		expect(() => validarLicao({ blocos, termos: [resíduo] }, { ...opcoes, glossario: GLOSSARIO })).toThrow(
			'não segue o esquema da lição. O termo "resíduo" (novo-1) é usado no bloco 1 antes de ser explicado no bloco 2',
		);
		const brando = validarLicao({ blocos, termos: [resíduo] }, { ...opcoes, glossario: GLOSSARIO, rigidoNosTermos: false });
		expect((brando.licao.blocos[0] as { texto: string }).texto.startsWith("Os resíduos aparecem. ")).toBe(true);
		expect(brando.termos.consertos.some((frase) => frase.includes("viraram texto"))).toBe(true);
	});

	it("o explicadoEm segue as posições do modelo, mesmo com um bloco descartado antes", () => {
		const blocos: unknown[] = comMarcas();
		blocos.splice(1, 0, { tipo: "desconhecido", conceitos: ["c-a"] });
		const { termos, descartes } = validarLicao({ blocos, termos: [{ ...resíduo, explicadoEm: 3 }] }, { ...opcoes, glossario: GLOSSARIO });
		expect(descartes).toEqual(['bloco 2: tipo desconhecido ("desconhecido")']);
		expect(termos.novos[0]!.bloco).toBe("l2-b2");
	});

	it("validarBloco: só as marcas do glossário ficam (uma por termo; fora do lugar viram texto)", () => {
		const bloco = verificacao({ pergunta: "A [reta](termo:t-reta), a [reta](termo:t-reta) e o [novo](termo:novo-1)?", respostaEsperada: "A [reta](termo:t-reta)." });
		expect(validarBloco(bloco, { ...opcoes, tipo: "verificacao", glossario: GLOSSARIO })).toMatchObject({ pergunta: "A [reta](termo:t-reta), a reta e o novo?", respostaEsperada: "A reta." });
	});
});

describe("validarBloco (o esquema)", () => {
	const opcoes = { licao: LICAO, trechos: TRECHOS, escopo: "material_base" as const };

	it("aceita a ideia central e a explicação de formato introdução, com os mínimos do tipo", () => {
		expect(validarBloco(ideiaCentral(), { ...opcoes, tipo: "ideia_central" })).toEqual({ tipo: "ideia_central", conceitos: ["c-a"], texto: "A reta resume a tendência. Os resíduos mostram o que ela não explica." });
		expect(validarBloco({ bloco: introducao() }, { ...opcoes, tipo: "explicacao" })).toMatchObject({ tipo: "explicacao", formato: "introducao" });
		expect(() => validarBloco(introducao({ texto: texto(599) }), { ...opcoes, tipo: "explicacao" })).toThrow(
			"A explicação do bloco reescrito (introducao) tem 599 caracteres; o mínimo é 600. Desenvolva o contexto: o que é o tema, por que importa e onde se usa.",
		);
		expect(() => validarBloco(conceito({ texto: texto(899) }), { ...opcoes, tipo: "explicacao" })).toThrow(/tem 899 caracteres; o mínimo é 900/);
		expect(() => validarBloco(ideiaCentral({ texto: "Um. Dois. Três. Quatro." }), { ...opcoes, tipo: "ideia_central" })).toThrow(/a ideia central tem 4 frases/);
		expect(() => validarBloco(ideiaCentral(), { ...opcoes, tipo: "explicacao" })).toThrow(/precisava ser "explicacao"/);
		// As questões não têm mínimo de tamanho.
		expect(validarBloco(verificacao(), { ...opcoes, tipo: "verificacao" })).toMatchObject({ pergunta: "E aí?" });
	});
});

describe("resumoDoModulo", () => {
	it("lições, blocos e questões (só quiz e dissertativa; a pergunta e a ideia central não contam)", () => {
		const { licao } = validarLicao({ blocos: blocosDoEsquema() }, { licao: LICAO, trechos: TRECHOS, escopo: "livre" });
		expect(resumoDoModulo({ licoes: [licao, licao] })).toEqual({ licoes: 2, blocos: 12, questoes: 2 });
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
	const umaLicao = (): Licao => validarLicao({ blocos: blocosDoEsquema() }, { licao: { id: "l1", titulo: "A reta", objetivo: "", conceitos: ["c-a", "c-b"] }, trechos: TRECHOS, escopo: "so_material" }).licao;
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
			resultado: { licoes: 1, blocos: 6, questoes: 1, custo: 0.12 },
			contexto: { modelo: MODELO, prompts: [{ nome: "modulo-plano.md", hash: "abc" }, { nome: "modulo-licao.md", hash: "def" }] },
		});
	});

	it("os ajustes que valeram na geração (ajustesUsados) vão no módulo e no contexto do gerou_modulo; sem o campo, nada é gravado; ler e regravar os mantém", async () => {
		const ajustesUsados = [
			{ arquivo: "quiz.md" as const, ajuste: "a-20261103-1", estado: "em teste" as const },
			{ arquivo: "exemplos.md" as const, ajuste: "a-20261001-2", estado: "mantido" as const },
		];
		const gravado = await gravarModuloGerado(dados, materia, CURSO, { ...geracao("m1"), ajustesUsados }, { agora: AGORA, prompts: [{ nome: "modulo-licao.md", hash: "def" }] });
		expect(gravado.ajustesUsados).toEqual(ajustesUsados);
		expect(Object.keys(JSON.parse(await readFile(caminhoDoModulo(dados, materia, CURSO, "m1"), "utf8")))).toEqual([
			"versao",
			"id",
			"curso",
			"materia",
			"situacao",
			"licoes",
			"geradoEm",
			"modelo",
			"custo",
			"materiaisUsados",
			"ajustesUsados",
		]);
		const lido = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(lido.ajustesUsados).toEqual(ajustesUsados);
		expect((await daMateria()).at(-1)!.contexto).toEqual({ modelo: MODELO, prompts: [{ nome: "modulo-licao.md", hash: "def" }], ajustesUsados });
		// Uma geração sem experimentos guarda a lista vazia; uma sem o campo, nada.
		const vazio = await gravarModuloGerado(dados, materia, CURSO, { ...geracao("m2"), ajustesUsados: [] }, { agora: AGORA });
		expect(vazio.ajustesUsados).toEqual([]);
		const sem = await gravarModuloGerado(dados, materia, CURSO, geracao("m3"), { agora: AGORA });
		expect(sem.ajustesUsados).toBeUndefined();
		expect("ajustesUsados" in ((await daMateria()).at(-1)!.contexto ?? {})).toBe(false);
		// A lista que não é de objetos faz o arquivo não se ler.
		await writeFile(caminhoDoModulo(dados, materia, CURSO, "m3"), JSON.stringify({ ...sem, ajustesUsados: "x" }), "utf8");
		await expect(lerModulo(dados, materia, CURSO, "m3")).rejects.toThrow(/ajustesUsados não são uma lista/);
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

	it("um módulo gravado antes do esquema (sem introdução, sem ideia central, explicações curtas) continua lido, resumido e concluído", async () => {
		const antigas: Licao[] = [
			{
				id: "l1",
				titulo: "A reta",
				objetivo: "",
				conceitos: ["c-a"],
				blocos: [
					{ id: "l1-b1", tipo: "explicacao", conceitos: ["c-a"], formato: "conceito", texto: "Curta.", referencias: [] },
					{ id: "l1-b2", tipo: "verificacao", conceitos: ["c-a"], pergunta: "E?", respostaEsperada: "Sim." },
					{ id: "l1-b3", tipo: "explicacao", conceitos: ["c-a"], formato: "exemplo_resolvido", texto: "Exemplo curto.", referencias: [] },
					{ ...(questaoAlternativa() as unknown as Bloco), id: "l1-b4" } as Bloco,
				],
			},
		];
		const gravado = { versao: 1, id: "m1", curso: CURSO, materia, situacao: "gerado", licoes: antigas, geradoEm: AGORA.toISOString(), modelo: MODELO, custo: 0.1, materiaisUsados: [] };
		await mkdir(join(caminhoDoModulo(dados, materia, CURSO, "m1"), ".."), { recursive: true });
		await writeFile(caminhoDoModulo(dados, materia, CURSO, "m1"), JSON.stringify(gravado), "utf8");
		const lido = await lerModulo(dados, materia, CURSO, "m1");
		expect(lido).toMatchObject({ situacao: "gerado", licoes: antigas });
		expect(violacoesDoEsquema(roteiroDaLicao(lido!.licoes[0]!)).map((item) => item.regra)).toEqual(["introducao", "ideia_central"]);
		expect(resumoDoModulo(lido!)).toEqual({ licoes: 1, blocos: 4, questoes: 1 });
		expect(await concluirModulo(dados, materia, CURSO, "m1", { agora: DEPOIS })).toMatchObject({ licoes: antigas, concluidoEm: DEPOIS.toISOString() });
	});

	it("marcarAguardando num curso que não está pronto ou num módulo que não existe é erro", async () => {
		await expect(marcarAguardando(dados, materia, CURSO, "m9", "")).rejects.toThrow(/Não achei o módulo "m9"/);
		const rascunho = novoCurso("rascunho", materia, { nome: "Rascunho", prazo: null, horasPorSemana: 2 }, AGORA);
		await gravarCurso(dados, rascunho);
		await expect(marcarAguardando(dados, materia, "rascunho", "m1", "")).rejects.toThrow(/ainda não foi criado/);
	});

	describe("entradaDoModelo", () => {
		const ROTEIRO = ["introducao", "conceito", "exemplo_resolvido", "verificacao", "ideia_central", "alternativa"];

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

		it("um material que o Breno tirou do curso não aparece nos locais dos conceitos nem nos materiais usados", async () => {
			const semAula = { ...cursoPronto(), materiais: { arquivos: [], excluidos: ["aula.pdf"] } };
			const entrada = await entradaDoModelo(dados, materia, semAula, "m1");
			expect(entrada.plano.conceitos.map((conceito) => conceito.locais)).toEqual([[], []]);
			expect(entrada.materiaisUsados).toEqual([]);
		});

		it("com o plano: uma mensagem por lição, com os níveis, os trechos dos conceitos dela e as referências para validarLicao", async () => {
			const plano = validarPlano(
				{ licoes: [{ titulo: "Um", objetivo: "", conceitos: ["c-a"], roteiro: ROTEIRO }, { titulo: "Dois", objetivo: "", conceitos: ["c-b"], roteiro: ROTEIRO }] },
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
				{ blocos: blocosDoEsquema().map((bloco) => ({ ...bloco, conceitos: ["c-b"], ...(bloco.tipo === "explicacao" ? { referencias: [{ arquivo: "aula.pdf", local: "página 3" }, { arquivo: "aula.pdf", local: "página 1" }] } : {}) })) },
				{ licao: dois!.licao, trechos: dois!.referencias, escopo: "so_material" },
			);
			expect((licao.blocos[0] as { referencias: unknown }).referencias).toEqual([ref("aula.pdf", 3)]);
		});

		it("o limite dos trechos por lição, dividido entre os conceitos dela; o que não coube fica fora das referências", async () => {
			const plano = validarPlano({ licoes: [{ titulo: "Tudo", objetivo: "", conceitos: ["c-a", "c-b"], roteiro: ROTEIRO }] }, { conceitosDoModulo: ["c-a", "c-b"], licoes: 1 });
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
			const plano = validarPlano({ licoes: [{ titulo: "Um", objetivo: "", conceitos: ["c-a", "c-b"], roteiro: ROTEIRO }] }, { conceitosDoModulo: ["c-a", "c-b"], licoes: 1 });
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
