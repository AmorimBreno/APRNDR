// Dados falsos dos testes da tela do aprendiz (aprendiz-tela.test.ts, aprendiz-ponte.test.ts e
// TelaAprendiz.dom.test.ts). Nada disto toca a pasta de dados do Breno.

import { CONFIG_APRENDIZ_PADRAO, type IndicadoresAprendiz, type IndicadoresConceito, VERSAO_INDICADORES } from "../../lib/aprendiz-indicadores-tipos.ts";

/** Um conceito de teste; o que não for dito é um conceito com respostas, de domínio médio. */
export function conceitoDeTeste(sobre: Partial<IndicadoresConceito> & { conceito: string }): IndicadoresConceito {
	return {
		materia: "calculo",
		nome: `Nome de ${sobre.conceito}`,
		dominio: 0.5,
		observacoes: 4,
		sessoes: 2,
		acertosPonderados: 2.4,
		errosPonderados: 0.8,
		ganho: null,
		brier: null,
		ultima: "2026-11-08T12:00:00.000Z",
		confusoes: [],
		eventos: [],
		...sobre,
	};
}

export function indicadoresDeTeste(conceitos: IndicadoresConceito[], sobre: Partial<IndicadoresAprendiz> = {}): IndicadoresAprendiz {
	return {
		versao: VERSAO_INDICADORES,
		calculadoEm: "2026-11-11T12:00:00.000Z",
		config: CONFIG_APRENDIZ_PADRAO,
		conceitos,
		ignorados: { materiaInexistente: 0, semConceito: 0 },
		...sobre,
	};
}

/** Cinco conceitos em duas matérias: um baixo, um médio, um alto, um empatado com o baixo (mais antigo) e um só autoavaliado. */
export function conceitosVariados(): IndicadoresConceito[] {
	return [
		conceitoDeTeste({ conceito: "limites", nome: "Limites", dominio: 0.9, observacoes: 6, sessoes: 3, ganho: 0.45, brier: 0.08, ultima: "2026-11-10T12:00:00.000Z", disse: { nivel: 4, evento: "e-dito-1", ts: "2026-11-01T12:00:00.000Z" } }),
		conceitoDeTeste({
			conceito: "derivadas",
			nome: "Derivadas",
			dominio: 0.2,
			observacoes: 5,
			acertosPonderados: 0.9,
			errosPonderados: 3.1,
			brier: 0.31,
			ultima: "2026-11-09T12:00:00.000Z",
			confusoes: [{ texto: "Confunde derivada com razão incremental", eventos: ["000aaa-11111111", "000bbb-22222222"] }],
			eventos: ["000aaa-11111111", "000bbb-22222222", "000ccc-33333333"],
		}),
		conceitoDeTeste({ conceito: "series", nome: "Séries", materia: "fisica", dominio: 0.2, observacoes: 3, ultima: "2026-11-05T12:00:00.000Z" }),
		conceitoDeTeste({ conceito: "integrais", nome: "Integrais", dominio: 0.55, observacoes: 4, ultima: "2026-11-07T12:00:00.000Z", brier: 0.18 }),
		conceitoDeTeste({ conceito: "vetores", nome: "Vetores", materia: "fisica", dominio: 0.3, observacoes: 0, sessoes: 0, acertosPonderados: 0, errosPonderados: 0, ultima: "2026-11-02T12:00:00.000Z", disse: { nivel: 3, evento: "e-dito-2", ts: "2026-11-02T12:00:00.000Z" } }),
	];
}

export const MATERIAS_DE_TESTE = [
	{ id: "calculo", nome: "Cálculo I", cor: "moss" as const },
	{ id: "fisica", nome: "Física", cor: "steel" as const },
];
