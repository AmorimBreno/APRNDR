// Dados falsos dos testes da tela do aprendiz (aprendiz-tela.test.ts, aprendiz-ponte.test.ts, TelaAprendiz.dom.test.ts e,
// da parte B, os das hipóteses e do histórico). Nada disto toca a pasta de dados do Breno.

import { CONFIG_APRENDIZ_PADRAO, type IndicadoresAprendiz, type IndicadoresConceito, VERSAO_INDICADORES } from "../../lib/aprendiz-indicadores-tipos.ts";
import type { EstadoHipoteses, Hipotese, MudancaPendente, ResumoDaReflexao } from "../../lib/hipoteses-tipos.ts";
import type { EventoLido } from "./aprendiz-historico-tela.ts";

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

// --- Parte B: hipóteses e histórico ------------------------------------------------------

/** Um instante local (o dia agrupa pelo dia local; o teste não pode depender do fuso). */
export const tsLocal = (dia: number, hora = 12, minuto = 0, mes = 11): string => new Date(2026, mes - 1, dia, hora, minuto).toISOString();

/** Um evento do histórico de teste; o que não for dito é uma resposta errada de cálculo. */
export function eventoDeTeste(sobre: Partial<EventoLido> & { id: string }): EventoLido {
	return {
		ts: tsLocal(10, 14, 32),
		sessao: "s-teste",
		verbo: "respondeu_questao",
		objeto: { materia: "calculo", conceitos: ["derivadas"] },
		resultado: { correta: false },
		...sobre,
	};
}

/** Uma hipótese de teste; o que não for dito é uma proposta de conhecimento no conceito derivadas. */
export function hipoteseDeTeste(sobre: Partial<Hipotese> & { id: string }): Hipotese {
	return {
		tipo: "misconception",
		escopo: { nivel: "conceito", materia: "calculo", conceitos: ["derivadas"] },
		enunciado: "Confunde derivada com razão incremental.",
		aFavor: [],
		contra: [],
		confianca: "media",
		criadaEm: tsLocal(9, 10),
		ultimaConfirmacao: tsLocal(9, 10),
		validade: "2027-01-08",
		status: "proposta",
		aprovadaPeloUsuario: false,
		versao: 1,
		anteriores: [],
		...sobre,
	};
}

export function mudancaDeTeste(sobre: Partial<MudancaPendente> & { id: string; hipotese: string }): MudancaPendente {
	return { acao: "reforcar", evidencias: [], motivo: "Dois eventos novos apontam o mesmo erro.", reflexao: "r-1", criadaEm: tsLocal(10, 9), ...sobre };
}

export function resumoDeTeste(sobre: Partial<ResumoDaReflexao> = {}): ResumoDaReflexao {
	return { id: "r-1", ts: tsLocal(9, 12), motivo: "botao", lidos: 14, propostas: 5, aceitas: 3, descartadas: [{ motivo: "sem duas sessões", quantas: 2 }], custo: 0.03, ...sobre };
}

export function estadoDeTeste(hipoteses: Hipotese[], mudancas: MudancaPendente[] = [], sobre: Partial<EstadoHipoteses> = {}): EstadoHipoteses {
	return { hipoteses, mudancas, refletindo: false, ...sobre };
}

/** Quatro hipóteses, uma de cada status, mais uma global, e uma mudança pendente na aprovada. */
export function hipotesesVariadas(): EstadoHipoteses {
	return estadoDeTeste(
		[
			hipoteseDeTeste({ id: "h-a", enunciado: "Proposta de derivadas.", aFavor: ["e-1", "e-2"], contra: ["e-3"] }),
			hipoteseDeTeste({ id: "h-b", status: "aprovada", aprovadaPeloUsuario: true, enunciado: "Aprovada sobre limites.", escopo: { nivel: "materia", materia: "calculo" }, aFavor: ["e-1"], criadaEm: tsLocal(8, 10), confianca: "alta" }),
			hipoteseDeTeste({ id: "h-c", status: "rejeitada", enunciado: "Rejeitada de física.", escopo: { nivel: "materia", materia: "fisica" }, criadaEm: tsLocal(7, 10), confianca: "baixa" }),
			hipoteseDeTeste({ id: "h-d", status: "expirada", enunciado: "Expirada global.", escopo: { nivel: "global" }, tipo: "ritmo", criadaEm: tsLocal(6, 10) }),
		],
		[mudancaDeTeste({ id: "m-1", hipotese: "h-b", acao: "reforcar", evidencias: ["e-2", "e-3"] })],
		{ ultimaReflexao: resumoDeTeste() },
	);
}
