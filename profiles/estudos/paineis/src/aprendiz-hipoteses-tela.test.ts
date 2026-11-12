// As partes puras da aba Hipóteses (aprendiz-hipoteses-tela.ts): as seções e a ordem, o filtro de matéria, os
// rótulos, o escopo, o diff das mudanças, o aviso do conflito, a linha da última reflexão e o enunciado.

import { describe, expect, it } from "vitest";
import { estadoDeTeste, hipotesesVariadas, hipoteseDeTeste, mudancaDeTeste, MATERIAS_DE_TESTE, resumoDeTeste, tsLocal } from "./aprendiz-fixtures.ts";
import {
	AVISO_DO_CONFLITO,
	dicaDosDescartes,
	dividirEmSecoes,
	enunciadoMudou,
	enunciadoParaEnviar,
	erroDoEnunciado,
	formatarCusto,
	formatarDia,
	hipoteseNoFiltro,
	ladoDaMudanca,
	LIMITE_DO_ENUNCIADO,
	materiaParaAbrirHipoteses,
	nivelDaConfianca,
	rotuloDaConfianca,
	rotuloDoTipo,
	secaoDaHipotese,
	SECOES_RECOLHIDAS,
	TEXTO_SEM_REFLEXAO,
	textoDaUltimaReflexao,
	textoDaValidade,
	textoDasEvidencias,
	textoDoDiff,
	textoDoEscopo,
	totalDasSecoes,
	totalDescartadas,
	voltouParaRevisao,
} from "./aprendiz-hipoteses-tela.ts";

const AGORA = new Date(2026, 10, 11, 12, 0).getTime();

describe("os rótulos", () => {
	it("o tipo em português; um tipo desconhecido aparece como está", () => {
		expect(rotuloDoTipo("conhecimento")).toBe("Conhecimento");
		expect(rotuloDoTipo("preferencia_de_forma")).toBe("Preferência de forma");
		expect(rotuloDoTipo("metacognicao")).toBe("Metacognição");
		expect(rotuloDoTipo("tipo_novo")).toBe("tipo_novo");
	});

	it("a confiança escrita (baixa, média, alta) e o nível do marcador (1 a 3)", () => {
		expect([rotuloDaConfianca("baixa"), rotuloDaConfianca("media"), rotuloDaConfianca("alta")]).toEqual(["baixa", "média", "alta"]);
		expect([nivelDaConfianca("baixa"), nivelDaConfianca("media"), nivelDaConfianca("alta")]).toEqual([1, 2, 3]);
		expect(nivelDaConfianca("outra")).toBe(1);
	});

	it("a validade, as evidências e a data", () => {
		expect(textoDaValidade("2027-01-08")).toBe("Até 08/01/2027");
		expect(textoDaValidade("2027-01-08T10:00:00.000Z")).toBe("Até 08/01/2027");
		expect(textoDaValidade("")).toBe("—");
		expect(formatarDia("lixo")).toBe("—");
		expect(textoDasEvidencias(3, 1)).toBe("3 a favor · 1 contra");
	});
});

describe("o escopo", () => {
	const nomes = new Map([["calculo/derivadas", "Derivadas"], ["calculo/limites", "Limites"]]);

	it("global, matéria e conceitos com os nomes que a tela tem", () => {
		expect(textoDoEscopo({ nivel: "global" }, MATERIAS_DE_TESTE, nomes)).toBe("Todas as matérias");
		expect(textoDoEscopo({ nivel: "materia", materia: "fisica" }, MATERIAS_DE_TESTE, nomes)).toBe("Física");
		expect(textoDoEscopo({ nivel: "conceito", materia: "calculo", conceitos: ["limites", "derivadas"] }, MATERIAS_DE_TESTE, nomes)).toBe("Limites, Derivadas · Cálculo I");
	});

	it("uma matéria que a lista não tem mais é 'matéria removida'; antes da lista chegar fica em branco (nunca o id cru)", () => {
		expect(textoDoEscopo({ nivel: "materia", materia: "quimica" }, MATERIAS_DE_TESTE, nomes)).toBe("matéria removida");
		expect(textoDoEscopo({ nivel: "materia", materia: "quimica" }, [], nomes)).toBe(" ");
	});

	it("sem os nomes dos conceitos (indicadores ainda não chegaram) só conta; um conceito fora dos indicadores aparece pelo id curto", () => {
		expect(textoDoEscopo({ nivel: "conceito", materia: "calculo", conceitos: ["a", "b"] }, MATERIAS_DE_TESTE, new Map())).toBe("2 conceitos · Cálculo I");
		expect(textoDoEscopo({ nivel: "conceito", materia: "calculo", conceitos: ["a"] }, MATERIAS_DE_TESTE, undefined)).toBe("1 conceito · Cálculo I");
		expect(textoDoEscopo({ nivel: "conceito", materia: "calculo", conceitos: ["derivadas", "c-de-id-muito-comprido"] }, MATERIAS_DE_TESTE, nomes)).toBe("Derivadas, c-de-id-mui… · Cálculo I");
	});
});

describe("o diff de uma mudança", () => {
	it("reforçar, enfraquecer e expirar, no singular e no plural", () => {
		expect(textoDoDiff({ acao: "reforcar", evidencias: ["a", "b"] })).toBe("Reforçar: +2 eventos a favor");
		expect(textoDoDiff({ acao: "reforcar", evidencias: ["a"] })).toBe("Reforçar: +1 evento a favor");
		expect(textoDoDiff({ acao: "enfraquecer", evidencias: ["a"] })).toBe("Enfraquecer: +1 evento contra");
		expect(textoDoDiff({ acao: "enfraquecer", evidencias: ["a", "b", "c"] })).toBe("Enfraquecer: +3 eventos contra");
		expect(textoDoDiff({ acao: "expirar", evidencias: [] })).toBe("Expirar");
	});

	it("em que lado as evidências entram", () => {
		expect(ladoDaMudanca("reforcar")).toBe("favor");
		expect(ladoDaMudanca("enfraquecer")).toBe("contra");
		expect(ladoDaMudanca("expirar")).toBeUndefined();
	});
});

describe("o conflito", () => {
	it("uma proposta que já foi aprovada voltou para a revisão; uma proposta nova não", () => {
		expect(voltouParaRevisao(hipoteseDeTeste({ id: "h", status: "proposta", aprovadaPeloUsuario: true }))).toBe(true);
		expect(voltouParaRevisao(hipoteseDeTeste({ id: "h", status: "proposta", anteriores: [{ versao: 1, enunciado: "x", status: "aprovada", ts: tsLocal(5) }] }))).toBe(true);
		expect(voltouParaRevisao(hipoteseDeTeste({ id: "h", status: "proposta" }))).toBe(false);
		expect(voltouParaRevisao(hipoteseDeTeste({ id: "h", status: "aprovada", aprovadaPeloUsuario: true }))).toBe(false);
		expect(AVISO_DO_CONFLITO).toBe("Voltou para a sua revisão: as evidências contra recentes superam as a favor");
	});
});

describe("as seções", () => {
	it("esperando, aprovadas, rejeitadas e expiradas, com as mudanças em esperando", () => {
		const secoes = dividirEmSecoes(hipotesesVariadas());
		expect(secoes.esperando.map((item) => (item.tipo === "hipotese" ? item.hipotese.id : item.mudanca.id))).toEqual(["h-a", "m-1"]);
		expect(secoes.aprovadas.map((h) => h.id)).toEqual(["h-b"]);
		expect(secoes.rejeitadas.map((h) => h.id)).toEqual(["h-c"]);
		expect(secoes.expiradas.map((h) => h.id)).toEqual(["h-d"]);
		expect(totalDasSecoes(secoes)).toBe(5);
		expect(SECOES_RECOLHIDAS).toEqual(["rejeitadas", "expiradas"]);
	});

	it("as propostas, as mais novas primeiro; a mudança de uma proposta vem logo abaixo dela; as outras mudanças depois, as mais antigas primeiro", () => {
		const estado = estadoDeTeste(
			[
				hipoteseDeTeste({ id: "h-1", criadaEm: tsLocal(1) }),
				hipoteseDeTeste({ id: "h-2", criadaEm: tsLocal(5) }),
				hipoteseDeTeste({ id: "h-ap", status: "aprovada", aprovadaPeloUsuario: true }),
			],
			[
				mudancaDeTeste({ id: "m-b", hipotese: "h-ap", criadaEm: tsLocal(7) }),
				mudancaDeTeste({ id: "m-a", hipotese: "h-ap", criadaEm: tsLocal(6) }),
				mudancaDeTeste({ id: "m-c", hipotese: "h-1", criadaEm: tsLocal(8) }),
			],
		);
		const ordem = dividirEmSecoes(estado).esperando.map((item) => (item.tipo === "hipotese" ? item.hipotese.id : item.mudanca.id));
		expect(ordem).toEqual(["h-2", "h-1", "m-c", "m-a", "m-b"]);
	});

	it("o filtro de matéria vale para as hipóteses e, pela hipótese, para as mudanças; as globais valem em toda matéria", () => {
		const estado = estadoDeTeste(
			[
				hipoteseDeTeste({ id: "h-calc", status: "aprovada", escopo: { nivel: "materia", materia: "calculo" } }),
				hipoteseDeTeste({ id: "h-fis", status: "aprovada", escopo: { nivel: "materia", materia: "fisica" } }),
				hipoteseDeTeste({ id: "h-glob", status: "aprovada", escopo: { nivel: "global" } }),
			],
			[mudancaDeTeste({ id: "m-calc", hipotese: "h-calc" }), mudancaDeTeste({ id: "m-fis", hipotese: "h-fis" }), mudancaDeTeste({ id: "m-orfa", hipotese: "h-sumiu" })],
		);
		const fisica = dividirEmSecoes(estado, "fisica");
		expect(fisica.aprovadas.map((h) => h.id).sort()).toEqual(["h-fis", "h-glob"]);
		expect(fisica.esperando.map((item) => (item.tipo === "mudanca" ? item.mudanca.id : "?"))).toEqual(["m-fis"]);
		// Sem filtro, a mudança de uma hipótese que o estado não traz mais aparece (sem a hipótese); com filtro, não.
		const todas = dividirEmSecoes(estado);
		expect(todas.esperando.map((item) => (item.tipo === "mudanca" ? item.mudanca.id : "?")).sort()).toEqual(["m-calc", "m-fis", "m-orfa"]);
		expect(hipoteseNoFiltro(hipoteseDeTeste({ id: "x", escopo: { nivel: "conceito", materia: "calculo", conceitos: [] } }), "calculo")).toBe(true);
		expect(hipoteseNoFiltro(hipoteseDeTeste({ id: "x", escopo: { nivel: "global" } }), "fisica")).toBe(true);
	});

	it("a seção de cada hipótese, para abrir a recolhida", () => {
		expect(secaoDaHipotese({ status: "proposta" })).toBe("esperando");
		expect(secaoDaHipotese({ status: "aprovada" })).toBe("aprovadas");
		expect(secaoDaHipotese({ status: "rejeitada" })).toBe("rejeitadas");
		expect(secaoDaHipotese({ status: "expirada" })).toBe("expiradas");
	});

	it("o clique de volta do evento mantém o filtro só se todas as hipóteses passam por ele", () => {
		const global = hipoteseDeTeste({ id: "g", escopo: { nivel: "global" } });
		const fisica = hipoteseDeTeste({ id: "f", escopo: { nivel: "materia", materia: "fisica" } });
		expect(materiaParaAbrirHipoteses(undefined, [fisica])).toBeUndefined();
		expect(materiaParaAbrirHipoteses("fisica", [global, fisica])).toBe("fisica");
		expect(materiaParaAbrirHipoteses("calculo", [global, fisica])).toBeUndefined();
	});
});

describe("a linha da última reflexão", () => {
	it("o exemplo do contrato", () => {
		const resumo = resumoDeTeste({ ts: new Date(AGORA - 2 * 86_400_000).toISOString() });
		expect(textoDaUltimaReflexao(resumo, AGORA)).toBe("Última reflexão há 2 dias: leu 14 eventos, 3 propostas aceitas, 2 descartadas · US$ 0,03");
	});

	it("sem descartadas ou sem custo, essas partes saem; nenhuma aceita; singular", () => {
		const resumo = resumoDeTeste({ ts: new Date(AGORA - 60_000 * 5).toISOString(), lidos: 1, aceitas: 1, descartadas: [] });
		const { custo: _custo, ...semCusto } = resumo;
		expect(textoDaUltimaReflexao(semCusto, AGORA)).toBe("Última reflexão há 5 min: leu 1 evento, 1 proposta aceita");
		expect(textoDaUltimaReflexao({ ...semCusto, aceitas: 0, lidos: 0 }, AGORA)).toBe("Última reflexão há 5 min: leu 0 eventos, nenhuma proposta aceita");
		expect(textoDaUltimaReflexao({ ...semCusto, ts: new Date(AGORA).toISOString() }, AGORA).startsWith("Última reflexão agora:")).toBe(true);
	});

	it("o custo em dólares com duas casas; menos de um centavo; sem custo vazio", () => {
		expect(formatarCusto(0.03)).toBe("US$ 0,03");
		expect(formatarCusto(1.5)).toBe("US$ 1,50");
		expect(formatarCusto(0.001)).toBe("menos de US$ 0,01");
		expect(formatarCusto(0)).toBe("US$ 0,00");
		expect(formatarCusto(undefined)).toBe("");
	});

	it("os descartes somam, e a dica traz o porquê de cada um", () => {
		const resumo = resumoDeTeste({ descartadas: [{ motivo: "sem duas sessões", quantas: 2 }, { motivo: "enunciado genérico", quantas: 1 }] });
		expect(totalDescartadas(resumo)).toBe(3);
		expect(dicaDosDescartes(resumo)).toBe("2: sem duas sessões\n1: enunciado genérico");
	});

	it("sem reflexão ainda, o texto explica que o professor propõe e que nada entra sem aprovação", () => {
		expect(TEXTO_SEM_REFLEXAO).toContain("propõe hipóteses a partir dos seus eventos");
		expect(TEXTO_SEM_REFLEXAO).toContain("Nada entra no seu perfil sem a sua aprovação");
	});
});

describe("o enunciado", () => {
	it("vazio, curto demais e comprido demais são recusados; o resto serve", () => {
		expect(erroDoEnunciado("")).toBe("Escreva o enunciado da hipótese.");
		expect(erroDoEnunciado("   ")).toBe("Escreva o enunciado da hipótese.");
		expect(erroDoEnunciado("curto")).toContain("pelo menos 12");
		expect(erroDoEnunciado("a".repeat(LIMITE_DO_ENUNCIADO + 1))).toContain("passa de 300");
		expect(erroDoEnunciado("a".repeat(LIMITE_DO_ENUNCIADO))).toBeUndefined();
		expect(erroDoEnunciado("Confunde derivada com razão.")).toBeUndefined();
	});

	it("vale o texto sem os espaços das pontas (também nos limites)", () => {
		expect(erroDoEnunciado(`  ${"a".repeat(LIMITE_DO_ENUNCIADO)}  `)).toBeUndefined();
		expect(enunciadoParaEnviar("  texto aqui \n")).toBe("texto aqui");
		expect(enunciadoMudou("  igual ", "igual")).toBe(false);
		expect(enunciadoMudou("diferente", "igual")).toBe(true);
	});
});
