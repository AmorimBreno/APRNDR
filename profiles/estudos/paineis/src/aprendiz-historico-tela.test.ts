// As partes puras da aba Histórico (aprendiz-historico-tela.ts): os verbos em português, o filtro por tipo e matéria, o
// agrupamento por dia, a frase do resultado, as fichas de evidência e a leitura da mensagem da ponte.

import { describe, expect, it } from "vitest";
import { LIMITE_HISTORICO } from "../../lib/hipoteses-tipos.ts";
import { conceitoDeTeste, eventoDeTeste, hipoteseDeTeste, indicadoresDeTeste, mudancaDeTeste, tsLocal } from "./aprendiz-fixtures.ts";
import {
	agruparPorDia,
	conceitosNomeadosDoEvento,
	cortarTexto,
	diaLocal,
	eventosDaMensagem,
	fichaDaEvidencia,
	filtrarEventos,
	fraseDoResultado,
	hipotesesDoEvento,
	hipotesesQueCitam,
	horaDoEvento,
	maisNovosPrimeiro,
	materiaParaAbrirOEvento,
	nomesDosConceitos,
	rotuloDoDia,
	tipoDeValor,
	tipoDoVerbo,
	VERBOS_EM_PORTUGUES,
	verboEmPortugues,
} from "./aprendiz-historico-tela.ts";

const AGORA = new Date(2026, 10, 11, 15, 0).getTime();

describe("os verbos", () => {
	it("cada verbo conhecido tem o seu texto em português, e um verbo desconhecido aparece como está", () => {
		const conhecidos = [
			"autoavaliou_conceito",
			"respondeu_questao",
			"respondeu_verificacao",
			"respondeu_dissertativa",
			"nao_sabia_questao",
			"avaliou_licao",
			"avaliou_bloco",
			"aprovou_ajuste_metodo",
			"refletiu",
			"propos_hipotese",
			"propos_mudanca_hipotese",
			"aprovou_hipotese",
			"rejeitou_hipotese",
			"aprovou_mudanca_hipotese",
			"rejeitou_mudanca_hipotese",
			"editou_hipotese",
			"expirou_hipotese",
		];
		for (const verbo of conhecidos) {
			expect(VERBOS_EM_PORTUGUES[verbo]).toBeTruthy();
			expect(verboEmPortugues(verbo)).not.toContain("_");
		}
		expect(verboEmPortugues("respondeu_questao")).toBe("Respondeu uma questão");
		expect(verboEmPortugues("verbo_novo_do_futuro")).toBe("verbo_novo_do_futuro");
	});

	it("o tipo de cada verbo: respostas, autoavaliações e perfil; os outros não têm tipo", () => {
		expect(tipoDoVerbo("respondeu_questao")).toBe("respostas");
		expect(tipoDoVerbo("nao_sabia_questao")).toBe("respostas");
		expect(tipoDoVerbo("autoavaliou_conceito")).toBe("autoavaliacoes");
		expect(tipoDoVerbo("avaliou_licao")).toBe("autoavaliacoes");
		expect(tipoDoVerbo("refletiu")).toBe("perfil");
		expect(tipoDoVerbo("aprovou_hipotese")).toBe("perfil");
		expect(tipoDoVerbo("aprovou_mudanca_hipotese")).toBe("perfil");
		expect(tipoDoVerbo("aprovou_ajuste_metodo")).toBeUndefined();
		expect(tipoDoVerbo("verbo_novo")).toBeUndefined();
		expect(tipoDeValor("perfil")).toBe("perfil");
		expect(tipoDeValor("qualquer")).toBe("todos");
	});
});

describe("o filtro", () => {
	const eventos = [
		eventoDeTeste({ id: "a", objeto: { materia: "calculo" } }),
		eventoDeTeste({ id: "b", objeto: { materia: "fisica" }, verbo: "autoavaliou_conceito" }),
		eventoDeTeste({ id: "c", objeto: {}, verbo: "refletiu" }),
		eventoDeTeste({ id: "d", objeto: { materia: "calculo" }, verbo: "aprovou_ajuste_metodo" }),
	];

	it("por matéria: só a dela; sem matéria, todos", () => {
		expect(filtrarEventos(eventos, { materia: "calculo" }).map((e) => e.id)).toEqual(["a", "d"]);
		expect(filtrarEventos(eventos, {}).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("por tipo: um verbo sem tipo só aparece em Todos", () => {
		expect(filtrarEventos(eventos, { tipo: "respostas" }).map((e) => e.id)).toEqual(["a"]);
		expect(filtrarEventos(eventos, { tipo: "autoavaliacoes" }).map((e) => e.id)).toEqual(["b"]);
		expect(filtrarEventos(eventos, { tipo: "perfil" }).map((e) => e.id)).toEqual(["c"]);
		expect(filtrarEventos(eventos, { tipo: "todos" }).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("matéria e tipo juntos", () => {
		expect(filtrarEventos(eventos, { materia: "calculo", tipo: "respostas" }).map((e) => e.id)).toEqual(["a"]);
		expect(filtrarEventos(eventos, { materia: "fisica", tipo: "respostas" })).toEqual([]);
	});
});

describe("os dias", () => {
	it("agrupa por dia local, os mais novos primeiro, com Hoje e Ontem", () => {
		const eventos = maisNovosPrimeiro([
			eventoDeTeste({ id: "a", ts: tsLocal(11, 9, 5) }),
			eventoDeTeste({ id: "b", ts: tsLocal(10, 23, 50) }),
			eventoDeTeste({ id: "c", ts: tsLocal(11, 14, 0) }),
			eventoDeTeste({ id: "d", ts: tsLocal(3, 8, 0) }),
			eventoDeTeste({ id: "e", ts: tsLocal(10, 7, 0) }),
		]);
		const dias = agruparPorDia(eventos, AGORA);
		expect(dias.map((dia) => dia.rotulo)).toEqual(["Hoje", "Ontem", "3 de novembro de 2026"]);
		expect(dias.map((dia) => dia.eventos.map((e) => e.id))).toEqual([["c", "a"], ["b", "e"], ["d"]]);
		expect(dias[0]?.dia).toBe("2026-11-11");
	});

	it("o instante igual desempata pelo id (o mais novo primeiro); um instante que não é data vai para o grupo Sem data, no fim", () => {
		const ordenados = maisNovosPrimeiro([eventoDeTeste({ id: "0a", ts: tsLocal(10, 8) }), eventoDeTeste({ id: "0b", ts: tsLocal(10, 8) }), eventoDeTeste({ id: "x", ts: "lixo" })]);
		const dias = agruparPorDia(ordenados, AGORA);
		expect(dias[0]?.eventos.map((e) => e.id)).toEqual(["0b", "0a"]);
		expect(dias[dias.length - 1]?.rotulo).toBe("Sem data");
		expect(dias[dias.length - 1]?.eventos.map((e) => e.id)).toEqual(["x"]);
	});

	it("o rótulo do dia, a hora local e o dia local", () => {
		expect(rotuloDoDia("2026-11-11", AGORA)).toBe("Hoje");
		expect(rotuloDoDia("2026-11-10", AGORA)).toBe("Ontem");
		expect(rotuloDoDia("2026-01-05", AGORA)).toBe("5 de janeiro de 2026");
		expect(horaDoEvento(tsLocal(10, 9, 7))).toBe("09:07");
		expect(horaDoEvento("lixo")).toBe("—");
		expect(diaLocal(tsLocal(10, 23, 59))).toBe("2026-11-10");
		expect(diaLocal("lixo")).toBe("");
	});
});

describe("a frase do resultado", () => {
	const frase = (verbo: string, resultado?: Record<string, unknown>) => fraseDoResultado({ verbo, ...(resultado ? { resultado } : {}) });

	it("respostas", () => {
		expect(frase("respondeu_questao", { correta: true })).toBe("certa");
		expect(frase("respondeu_questao", { correta: false, tentativa: 2 })).toBe("errada · 2ª tentativa");
		expect(frase("respondeu_verificacao", { avaliacao: "parcial" })).toBe("em parte");
		expect(frase("respondeu_verificacao", { avaliacao: "errada", texto: "x" })).toBe("errada · “x”");
		expect(frase("respondeu_dissertativa", { total: 7.5, max: 10 })).toBe("7,5 de 10 pontos");
		expect(frase("nao_sabia_questao")).toBe("");
	});

	it("autoavaliação, lição e bloco", () => {
		expect(frase("autoavaliou_conceito", { nivel: 3 })).toBe("nível 3 de 4");
		expect(frase("avaliou_licao", { notas: { a: 4, b: 5, c: 3 }, texto: "Foi boa." })).toBe("nota média 4 de 5 · “Foi boa.”");
		expect(frase("avaliou_bloco", { avaliacao: "otimo" })).toBe("ótimo");
	});

	it("o texto livre vem cortado", () => {
		const longo = "a".repeat(200);
		const cortado = frase("avaliou_bloco", { avaliacao: "ruim", texto: longo });
		expect(cortado.startsWith("ruim · “aaa")).toBe(true);
		expect(cortado.endsWith("…”")).toBe(true);
		expect(cortado.length).toBeLessThan(110);
		expect(cortarTexto("  muitos \n espaços  ")).toBe("muitos espaços");
		expect(cortarTexto("   ")).toBeUndefined();
		expect(cortarTexto("abcdefghij", 5)).toBe("abcd…");
	});

	it("reflexão e hipóteses; verbo desconhecido ou resultado ilegível não dizem nada", () => {
		expect(frase("refletiu", { lidos: 14, aceitas: 3 })).toBe("leu 14 eventos · 3 propostas aceitas");
		expect(frase("refletiu", { lidos: 1, aceitas: 1 })).toBe("leu 1 evento · 1 proposta aceita");
		expect(frase("editou_hipotese", { enunciado: "Novo texto." })).toBe("“Novo texto.”");
		expect(frase("verbo_novo", { correta: true })).toBe("");
		expect(frase("respondeu_questao", { correta: "sim" })).toBe("");
		expect(fraseDoResultado({ verbo: "respondeu_questao" })).toBe("");
	});
});

describe("os conceitos e as hipóteses de um evento", () => {
	const nomes = nomesDosConceitos(indicadoresDeTeste([conceitoDeTeste({ conceito: "derivadas", nome: "Derivadas" }), conceitoDeTeste({ conceito: "series", materia: "fisica", nome: "Séries" })]));

	it("o nome vem da matéria do evento e do conceito; o que a tela não conhece fica de fora", () => {
		expect(conceitosNomeadosDoEvento(eventoDeTeste({ id: "a", objeto: { materia: "calculo", conceitos: ["derivadas", "limites"] } }), nomes)).toEqual(["Derivadas"]);
		expect(conceitosNomeadosDoEvento(eventoDeTeste({ id: "a", objeto: { materia: "fisica", conceitos: ["derivadas"] } }), nomes)).toEqual([]);
		expect(conceitosNomeadosDoEvento(eventoDeTeste({ id: "a", objeto: {} }), nomes)).toEqual([]);
		expect(nomesDosConceitos(undefined).size).toBe(0);
	});

	it("as hipóteses que o evento cita pelo objeto, e as que o citam nas evidências ou nas mudanças", () => {
		expect(hipotesesDoEvento({ objeto: { hipotese: "h-1" } })).toEqual(["h-1"]);
		expect(hipotesesDoEvento({ objeto: {} })).toEqual([]);
		const estado = {
			hipoteses: [hipoteseDeTeste({ id: "h-1", aFavor: ["e-1"] }), hipoteseDeTeste({ id: "h-2", contra: ["e-1"] }), hipoteseDeTeste({ id: "h-3" })],
			mudancas: [mudancaDeTeste({ id: "m-1", hipotese: "h-3", evidencias: ["e-1"] })],
		};
		expect(hipotesesQueCitam({ id: "e-1", objeto: {} }, estado).sort()).toEqual(["h-1", "h-2", "h-3"]);
		expect(hipotesesQueCitam({ id: "e-9", objeto: { hipotese: "h-2" } }, estado)).toEqual(["h-2"]);
		expect(hipotesesQueCitam({ id: "e-9", objeto: { hipotese: "h-que-nao-existe" } }, estado)).toEqual([]);
		expect(hipotesesQueCitam({ id: "e-1", objeto: {} }, undefined)).toEqual([]);
	});
});

describe("as fichas de evidência", () => {
	const eventos = [eventoDeTeste({ id: "0002-aaaaaaaa", ts: tsLocal(8, 10), verbo: "respondeu_questao" })];

	it("sem o histórico ainda, só o id curto", () => {
		const ficha = fichaDaEvidencia("0001-12345678", undefined);
		expect(ficha).toMatchObject({ situacao: "pendente", rotulo: "12345678", curto: "12345678" });
	});

	it("um evento conhecido mostra o verbo e o dia", () => {
		const ficha = fichaDaEvidencia("0002-aaaaaaaa", eventos);
		expect(ficha.situacao).toBe("conhecido");
		expect(ficha.rotulo).toBe("Respondeu uma questão · 08/11");
	});

	it("um id que o histórico não conhece é 'evento removido'", () => {
		const ficha = fichaDaEvidencia("0001-12345678", eventos);
		expect(ficha.situacao).toBe("removido");
		expect(ficha.rotulo).toBe("evento removido");
	});

	it("com o histórico cheio, um id mais antigo que o mais antigo lido é 'antigo' (pode existir), não 'removido'", () => {
		const cheio = Array.from({ length: LIMITE_HISTORICO }, (_, i) => eventoDeTeste({ id: `1${String(i).padStart(5, "0")}-aaaaaaaa` }));
		expect(fichaDaEvidencia("0000-12345678", cheio).situacao).toBe("antigo");
		expect(fichaDaEvidencia("2000-12345678", cheio).situacao).toBe("removido");
		expect(fichaDaEvidencia("0000-12345678", eventos).situacao).toBe("removido");
	});

	it("o clique leva ao histórico com a matéria da rota só se for a do evento", () => {
		const evento = eventoDeTeste({ id: "a", objeto: { materia: "calculo" } });
		expect(materiaParaAbrirOEvento(undefined, evento)).toBeUndefined();
		expect(materiaParaAbrirOEvento("calculo", evento)).toBe("calculo");
		expect(materiaParaAbrirOEvento("fisica", evento)).toBeUndefined();
		expect(materiaParaAbrirOEvento("fisica", undefined)).toBe("fisica");
	});
});

describe("a mensagem do histórico", () => {
	it("aceita os eventos com id, instante e verbo; descarta o resto e completa o que falta", () => {
		const lidos = eventosDaMensagem({ eventos: [{ id: "a", ts: "2026-11-10T10:00:00.000Z", verbo: "respondeu_questao" }, { id: "sem-verbo", ts: "x" }, null, { id: "b", ts: "t", verbo: "novo", objeto: { materia: "m" }, resultado: { x: 1 } }] });
		expect(lidos?.map((e) => e.id)).toEqual(["a", "b"]);
		expect(lidos?.[0]?.objeto).toEqual({});
		expect(lidos?.[1]).toMatchObject({ verbo: "novo", objeto: { materia: "m" }, resultado: { x: 1 } });
	});

	it("recusa o que não tem a lista", () => {
		expect(eventosDaMensagem(undefined)).toBeUndefined();
		expect(eventosDaMensagem({})).toBeUndefined();
		expect(eventosDaMensagem({ eventos: "x" })).toBeUndefined();
		expect(eventosDaMensagem({ eventos: [] })).toEqual([]);
	});
});
