// Testes do cálculo dos indicadores por conceito (item 9, parte A): as observações de cada verbo, o BKT,
// o decaimento, o ganho de Hake, o Brier, a matéria que não existe, a config e as confusões. Tudo puro,
// com eventos escritos à mão no formato real do aprendiz/eventos.jsonl.

import { describe, expect, it } from "vitest";
import {
	atualizarDominio,
	brierDasObservacoes,
	calcularIndicadores,
	CONFIG_APRENDIZ_PADRAO,
	dominioPorBkt,
	ganhoDeHake,
	ganhoDasSessoes,
	lerConfigAprendiz,
	observacoesDoEvento,
	pesoDoDecaimento,
	VERSAO_INDICADORES,
} from "./aprendiz-indicadores-tipos.ts";
import type { Evento } from "./eventos.ts";

const AGORA = new Date("2026-11-11T12:00:00.000Z");

let contador = 0;
/** Um evento do aprendiz: o id sai do contador e o ts pode ser dado ("2026-11-01T10:00:00.000Z"). */
function evento(verbo: Evento["verbo"], objeto: Evento["objeto"], resultado: Record<string, unknown> | undefined, extra: { ts?: string; sessao?: string; id?: string } = {}): Evento {
	contador++;
	return {
		id: extra.id ?? `e${String(contador).padStart(3, "0")}`,
		ts: extra.ts ?? `2026-11-01T10:00:${String(contador % 60).padStart(2, "0")}.000Z`,
		sessao: extra.sessao ?? "s1",
		verbo,
		objeto,
		...(resultado ? { resultado } : {}),
	};
}
const obj = (conceitos: string[], campos: Record<string, unknown> = {}) => ({ materia: "mat", curso: "curso", conceitos, ...campos });
const quiz = (correta: boolean, conceitos: string[] = ["c1"], extra: Parameters<typeof evento>[3] = {}, resultado: Record<string, unknown> = {}) =>
	evento("respondeu_questao", obj(conceitos, { questao: "q1" }), { correta, escolha: 0, ...resultado }, extra);

const calcular = (eventos: Evento[], extra: Partial<Parameters<typeof calcularIndicadores>[1]> = {}) => calcularIndicadores(eventos, { agora: AGORA, materias: ["mat"], ...extra });
const doConceito = (eventos: Evento[], conceito = "c1", extra: Partial<Parameters<typeof calcularIndicadores>[1]> = {}) => calcular(eventos, extra).conceitos.find((item) => item.conceito === conceito)!;

describe("observacoesDoEvento", () => {
	it("respondeu_questao: correta vale 1, errada 0, com a confiança; uma observação por conceito", () => {
		const certa = observacoesDoEvento(quiz(true, ["c1", "c2"], { id: "q-certa", sessao: "sx" }, { confianca: 3 }));
		expect(certa.map((item) => item.conceito)).toEqual(["c1", "c2"]);
		expect(certa[0]).toMatchObject({ evento: "q-certa", sessao: "sx", verbo: "respondeu_questao", materia: "mat", acerto: 1, confianca: 3 });
		expect(observacoesDoEvento(quiz(false))[0]).toMatchObject({ acerto: 0 });
		expect(observacoesDoEvento(quiz(false))[0]).not.toHaveProperty("confianca");
	});

	it("respondeu_questao: só a primeira tentativa conta (tentativa 2 não observa)", () => {
		expect(observacoesDoEvento(quiz(true, ["c1"], {}, { tentativa: 1 }))).toHaveLength(1);
		expect(observacoesDoEvento(quiz(true, ["c1"], {}, { tentativa: 2 }))).toHaveLength(0);
		// o diagnóstico não tem o campo tentativa: vale
		expect(observacoesDoEvento(quiz(true))).toHaveLength(1);
	});

	it("respondeu_verificacao: certa 1, parcial 0,5 (e em_parte também), errada 0, com a confiança", () => {
		const verif = (avaliacao: string) => evento("respondeu_verificacao", obj(["c1"], { questao: "l1-b2" }), { avaliacao, confianca: 4 });
		expect(observacoesDoEvento(verif("certa"))[0]).toMatchObject({ acerto: 1, confianca: 4 });
		expect(observacoesDoEvento(verif("parcial"))[0]!.acerto).toBe(0.5);
		expect(observacoesDoEvento(verif("em_parte"))[0]!.acerto).toBe(0.5);
		expect(observacoesDoEvento(verif("errada"))[0]!.acerto).toBe(0);
		expect(observacoesDoEvento(verif("estranha"))).toEqual([]);
	});

	it("respondeu_dissertativa: total / max, com a confiança; a reescrita (tentativa 2) não conta", () => {
		const dissertativa = (resultado: Record<string, unknown>) => evento("respondeu_dissertativa", obj(["c1", "c2", "c3"], { questao: "l1-b8" }), resultado);
		const primeira = observacoesDoEvento(dissertativa({ tentativa: 1, total: 6, max: 8, confianca: 2 }));
		expect(primeira).toHaveLength(3);
		expect(primeira[0]).toMatchObject({ acerto: 0.75, confianca: 2 });
		expect(observacoesDoEvento(dissertativa({ total: 4, max: 8 }))[0]!.acerto).toBe(0.5);
		expect(observacoesDoEvento(dissertativa({ tentativa: 2, total: 8, max: 8 }))).toEqual([]);
		expect(observacoesDoEvento(dissertativa({ total: 3, max: 0 }))).toEqual([]);
		expect(observacoesDoEvento(dissertativa({}))).toEqual([]);
	});

	it("nao_sabia_questao: acerto 0, sem confiança; se já houve tentativa, ela já foi a observação", () => {
		const naoSabia = (tentativas: number) => evento("nao_sabia_questao", obj(["c1"], { questao: "l2-b7" }), { tipo: "dissertativa", tentativas });
		expect(observacoesDoEvento(naoSabia(0))).toEqual([expect.objectContaining({ acerto: 0, verbo: "nao_sabia_questao" })]);
		expect(observacoesDoEvento(naoSabia(1))).toEqual([]);
	});

	it("autoavaliou_conceito e os outros verbos não observam", () => {
		expect(observacoesDoEvento(evento("autoavaliou_conceito", obj(["c1"]), { nivel: 3 }))).toEqual([]);
		expect(observacoesDoEvento(evento("avaliou_licao", obj(["c1"]), { notas: {} }))).toEqual([]);
		expect(observacoesDoEvento(evento("aprovou_ajuste_metodo", { materia: "mat" }, {}))).toEqual([]);
	});

	it("evento sem conceitos ou sem sessão", () => {
		expect(observacoesDoEvento(quiz(true, []))).toEqual([]);
		const semSessao = { ...quiz(true), sessao: undefined } as Evento;
		expect(observacoesDoEvento(semSessao)[0]!.sessao).toBe("sem-sessao");
	});
});

describe("BKT", () => {
	it("um acerto sobe o domínio de 0,3 para ~0,7098 (início, chute, deslize e aprendizado padrão)", () => {
		expect(atualizarDominio(0.3, 1, CONFIG_APRENDIZ_PADRAO.bkt)).toBeCloseTo(0.709756, 5);
	});

	it("só acertos sobem a cada passo; só erros descem do início", () => {
		const bkt = CONFIG_APRENDIZ_PADRAO.bkt;
		let anterior = bkt.inicio;
		for (let n = 1; n <= 5; n++) {
			const atual = dominioPorBkt(Array(n).fill(1), bkt);
			expect(atual).toBeGreaterThan(anterior);
			anterior = atual;
		}
		expect(dominioPorBkt([1, 1, 1], bkt)).toBeCloseTo(0.985846, 5);
		expect(dominioPorBkt([0], bkt)).toBeCloseTo(0.19322, 4);
		expect(dominioPorBkt([0, 0, 0], bkt)).toBeCloseTo(0.171912, 5);
		expect(dominioPorBkt([0, 0, 0], bkt)).toBeLessThan(bkt.inicio);
		expect(dominioPorBkt([], bkt)).toBe(bkt.inicio);
	});

	it("observação fracionária: a mistura ponderada fica entre o erro e o acerto", () => {
		const bkt = CONFIG_APRENDIZ_PADRAO.bkt;
		const meio = atualizarDominio(0.3, 0.5, bkt);
		expect(meio).toBeCloseTo(0.451488, 5);
		expect(meio).toBeGreaterThan(atualizarDominio(0.3, 0, bkt));
		expect(meio).toBeLessThan(atualizarDominio(0.3, 1, bkt));
	});

	it("com os parâmetros nos extremos não divide por zero", () => {
		const extremo = { inicio: 0, chute: 0, deslize: 1, aprendizado: 0 };
		expect(Number.isFinite(dominioPorBkt([1, 0, 1], extremo))).toBe(true);
	});

	it("o domínio do conceito vem dos eventos em ordem de ts, não de leitura", () => {
		const cedo = quiz(false, ["c1"], { ts: "2026-11-01T10:00:00.000Z" });
		const tarde = quiz(true, ["c1"], { ts: "2026-11-02T10:00:00.000Z" });
		const emOrdem = doConceito([cedo, tarde]);
		const embaralhado = doConceito([tarde, cedo]);
		expect(embaralhado.dominio).toBe(emOrdem.dominio);
		expect(emOrdem.dominio).toBeCloseTo(dominioPorBkt([0, 1], CONFIG_APRENDIZ_PADRAO.bkt), 4);
	});
});

describe("decaimento", () => {
	it("pesoDoDecaimento: meia-vida de 30 dias", () => {
		expect(pesoDoDecaimento(0, 30)).toBe(1);
		expect(pesoDoDecaimento(30, 30)).toBeCloseTo(0.5, 10);
		expect(pesoDoDecaimento(60, 30)).toBeCloseTo(0.25, 10);
		expect(pesoDoDecaimento(-5, 30)).toBe(1);
	});

	it("acertos e erros ponderados com o agora fixo", () => {
		// AGORA = 2026-11-11T12:00. Um acerto há 30 dias (peso 0,5), um erro agora (peso 1) e uma verificação em parte há 15 dias.
		const velho = quiz(true, ["c1"], { ts: "2026-10-12T12:00:00.000Z", sessao: "s1" });
		const novo = quiz(false, ["c1"], { ts: "2026-11-11T12:00:00.000Z", sessao: "s2" });
		const parcial = evento("respondeu_verificacao", obj(["c1"]), { avaliacao: "parcial" }, { ts: "2026-10-27T12:00:00.000Z", sessao: "s1" });
		const indicador = doConceito([velho, novo, parcial]);
		const pesoQuinze = 0.5 ** 0.5;
		expect(indicador.acertosPonderados).toBeCloseTo(0.5 + 0.5 * pesoQuinze, 4);
		expect(indicador.errosPonderados).toBeCloseTo(1 + 0.5 * pesoQuinze, 4);
	});

	it("a meia-vida da config muda o peso", () => {
		const velho = quiz(true, ["c1"], { ts: "2026-10-12T12:00:00.000Z" });
		const config = { ...CONFIG_APRENDIZ_PADRAO, meiaVidaDias: 15 };
		expect(doConceito([velho], "c1", { config }).acertosPonderados).toBeCloseTo(0.25, 4);
	});
});

describe("sessões, ganho de Hake e Brier", () => {
	it("conta as sessões distintas", () => {
		const indicador = doConceito([quiz(true, ["c1"], { sessao: "a" }), quiz(true, ["c1"], { sessao: "a" }), quiz(false, ["c1"], { sessao: "b" })]);
		expect(indicador.sessoes).toBe(2);
		expect(indicador.observacoes).toBe(3);
	});

	it("ganhoDeHake nos três casos e nos extremos", () => {
		expect(ganhoDeHake(0.5, 1)).toBe(1);
		expect(ganhoDeHake(0.25, 0.75)).toBeCloseTo(2 / 3, 10); // subiu: (0,75 - 0,25) / (1 - 0,25)
		expect(ganhoDeHake(0.75, 0.25)).toBeCloseTo(-2 / 3, 10); // caiu: (0,25 - 0,75) / 0,75
		expect(ganhoDeHake(1, 1)).toBeNull();
		expect(ganhoDeHake(0, 0)).toBe(0);
		expect(ganhoDeHake(0.5, 0.5)).toBe(0);
	});

	it("o ganho do conceito: média da primeira sessão contra a da última; null com uma sessão só", () => {
		const subiu = doConceito([
			quiz(false, ["c1"], { ts: "2026-11-01T10:00:00.000Z", sessao: "s1" }),
			quiz(true, ["c1"], { ts: "2026-11-01T10:05:00.000Z", sessao: "s1" }), // média 0,5
			quiz(true, ["c1"], { ts: "2026-11-05T10:00:00.000Z", sessao: "s2" }), // meio do caminho: não conta
			quiz(true, ["c1"], { ts: "2026-11-09T10:00:00.000Z", sessao: "s3" }), // média 1
		]);
		expect(subiu.ganho).toBe(1);
		const caiu = doConceito([
			quiz(true, ["c1"], { ts: "2026-11-01T10:00:00.000Z", sessao: "s1" }),
			quiz(true, ["c1"], { ts: "2026-11-01T10:05:00.000Z", sessao: "s1" }),
			quiz(true, ["c1"], { ts: "2026-11-09T10:00:00.000Z", sessao: "s2" }),
			quiz(false, ["c1"], { ts: "2026-11-09T10:05:00.000Z", sessao: "s2" }),
		]);
		expect(caiu.ganho).toBe(-0.5); // pré 1, pós 0,5: (0,5 - 1) / 1
		const perfeito = doConceito([quiz(true, ["c1"], { sessao: "s1", ts: "2026-11-01T10:00:00.000Z" }), quiz(true, ["c1"], { sessao: "s2", ts: "2026-11-02T10:00:00.000Z" })]);
		expect(perfeito.ganho).toBeNull();
		expect(doConceito([quiz(true), quiz(false)]).ganho).toBeNull();
		expect(ganhoDasSessoes([])).toBeNull();
	});

	it("o Brier: média de (p - acerto)^2 só das observações com confiança; null sem nenhuma", () => {
		// confiança 4 (0,95) e acertou: 0,0025; confiança 1 (0,25) e errou: 0,0625; sem confiança: fora.
		const indicador = doConceito([quiz(true, ["c1"], {}, { confianca: 4 }), quiz(false, ["c1"], {}, { confianca: 1 }), quiz(true)]);
		expect(indicador.brier).toBeCloseTo((0.0025 + 0.0625) / 2, 4);
		expect(doConceito([quiz(true)]).brier).toBeNull();
		expect(brierDasObservacoes([{ acerto: 0.5, confianca: 2 }])).toBe(0);
	});
});

describe("calcularIndicadores", () => {
	it("matéria que não existe entra em ignorados.materiaInexistente e não conta em nada", () => {
		const outra = evento("respondeu_questao", { materia: "apagada", curso: "x", conceitos: ["cz"], questao: "q1" }, { correta: true });
		const auto = evento("autoavaliou_conceito", { materia: "apagada", curso: "x", conceitos: ["cz"] }, { nivel: 2 });
		const resultado = calcular([outra, auto, quiz(true)]);
		expect(resultado.ignorados).toEqual({ materiaInexistente: 2, semConceito: 0 });
		expect(resultado.conceitos.map((item) => item.conceito)).toEqual(["c1"]);
	});

	it("evento sem conceitos conta em ignorados.semConceito; verbos que não observam nem contam", () => {
		const resultado = calcular([quiz(true, []), evento("avaliou_licao", obj(["c1"]), { notas: {} }), evento("aprovou_ajuste_metodo", { materia: "mat" }, {})]);
		expect(resultado.ignorados).toEqual({ materiaInexistente: 0, semConceito: 1 });
		expect(resultado.conceitos).toEqual([]);
	});

	it("o que ele disse (a última autoavaliação) fica ao lado e nunca entra no BKT", () => {
		const antes = evento("autoavaliou_conceito", obj(["c1"]), { nivel: 1 }, { id: "auto1", ts: "2026-10-01T10:00:00.000Z" });
		const depois = evento("autoavaliou_conceito", obj(["c1"]), { nivel: 4 }, { id: "auto2", ts: "2026-10-20T10:00:00.000Z" });
		const sem = doConceito([quiz(false)]);
		const com = doConceito([antes, depois, quiz(false)]);
		expect(com.disse).toEqual({ nivel: 4, evento: "auto2", ts: "2026-10-20T10:00:00.000Z" });
		expect(com.dominio).toBe(sem.dominio);
		expect(com.observacoes).toBe(1);
		expect(com.eventos).not.toContain("auto2");
	});

	it("um conceito só autoavaliado aparece sem observações, com o domínio inicial", () => {
		const resultado = calcular([evento("autoavaliou_conceito", obj(["c9"]), { nivel: 3 }, { id: "auto9", ts: "2026-10-01T10:00:00.000Z" })]);
		expect(resultado.conceitos).toHaveLength(1);
		expect(resultado.conceitos[0]).toMatchObject({ conceito: "c9", observacoes: 0, sessoes: 0, dominio: 0.3, ganho: null, brier: null, ultima: "2026-10-01T10:00:00.000Z", eventos: [] });
		expect(resultado.conceitos[0]!.disse!.nivel).toBe(3);
	});

	it("autoavaliação com nível inválido é descartada", () => {
		expect(calcular([evento("autoavaliou_conceito", obj(["c1"]), { nivel: 7 })]).conceitos).toEqual([]);
	});

	it("os campos do cabeçalho: versão, calculadoEm, ultimoEvento (o último lido) e a config", () => {
		const resultado = calcular([quiz(true, ["c1"], { id: "primeiro" }), quiz(true, ["c1"], { id: "ultimo" })]);
		expect(resultado).toMatchObject({ versao: VERSAO_INDICADORES, calculadoEm: AGORA.toISOString(), ultimoEvento: "ultimo", config: CONFIG_APRENDIZ_PADRAO });
		expect(calcular([]).ultimoEvento).toBeUndefined();
	});

	it("o mesmo conceito em matérias diferentes não se mistura", () => {
		const outra = evento("respondeu_questao", { materia: "mat2", curso: "x", conceitos: ["c1"], questao: "q1" }, { correta: false });
		const resultado = calcular([quiz(true), outra], { materias: ["mat", "mat2"] });
		expect(resultado.conceitos.map((item) => [item.materia, item.observacoes]).sort()).toEqual([
			["mat", 1],
			["mat2", 1],
		]);
	});

	it("a lista de conceitos é estável: a última observação primeiro", () => {
		const resultado = calcular([quiz(true, ["velho"], { ts: "2026-10-01T10:00:00.000Z" }), quiz(true, ["novo"], { ts: "2026-11-01T10:00:00.000Z" })]);
		expect(resultado.conceitos.map((item) => item.conceito)).toEqual(["novo", "velho"]);
	});
});

describe("confusões", () => {
	it("agrupa as iguais por conceito com os ids dos eventos; usa o mapa resolvido ou a confusão do próprio resultado", () => {
		const a = quiz(false, ["c1"], { id: "ea", ts: "2026-11-01T10:00:00.000Z" }, { confusao: "Soma resíduos com sinal." });
		const b = quiz(false, ["c1"], { id: "eb", ts: "2026-11-02T10:00:00.000Z", sessao: "s2" }, { confusao: "Soma resíduos com sinal." });
		const c = quiz(false, ["c1", "c2"], { id: "ec", ts: "2026-11-03T10:00:00.000Z", sessao: "s3" }); // só a resolvida pelo disco
		const certa = quiz(true, ["c1"], { id: "ed", ts: "2026-11-04T10:00:00.000Z" });
		const resultado = calcular([a, b, c, certa], { confusoes: { ec: "Confunde ajuste com causalidade." } });
		const c1 = resultado.conceitos.find((item) => item.conceito === "c1")!;
		expect(c1.confusoes).toEqual([
			{ texto: "Soma resíduos com sinal.", eventos: ["ea", "eb"] },
			{ texto: "Confunde ajuste com causalidade.", eventos: ["ec"] },
		]);
		expect(resultado.conceitos.find((item) => item.conceito === "c2")!.confusoes).toEqual([{ texto: "Confunde ajuste com causalidade.", eventos: ["ec"] }]);
		expect(c1.eventos).toEqual(expect.arrayContaining(["ea", "eb", "ec", "ed"]));
	});

	it("a segunda tentativa errada não entra no BKT mas conta a confusão", () => {
		const primeira = quiz(false, ["c1"], { id: "t1", ts: "2026-11-01T10:00:00.000Z" }, { tentativa: 1, confusao: "A" });
		const segunda = quiz(false, ["c1"], { id: "t2", ts: "2026-11-01T10:01:00.000Z" }, { tentativa: 2, confusao: "B" });
		const indicador = doConceito([primeira, segunda]);
		expect(indicador.observacoes).toBe(1);
		expect(indicador.confusoes.map((item) => item.texto)).toEqual(["A", "B"]);
	});

	it("acerto e outros verbos não geram confusão", () => {
		const certa = quiz(true, ["c1"], { id: "x" }, { confusao: "não deveria" });
		const verif = evento("respondeu_verificacao", obj(["c1"]), { avaliacao: "errada", confusao: "nem esta" });
		expect(doConceito([certa, verif]).confusoes).toEqual([]);
	});
});

describe("lerConfigAprendiz", () => {
	it("sem nada ou com lixo, os padrões", () => {
		expect(lerConfigAprendiz(undefined)).toEqual(CONFIG_APRENDIZ_PADRAO);
		expect(lerConfigAprendiz(null)).toEqual(CONFIG_APRENDIZ_PADRAO);
		expect(lerConfigAprendiz("texto")).toEqual(CONFIG_APRENDIZ_PADRAO);
		expect(lerConfigAprendiz([1, 2])).toEqual(CONFIG_APRENDIZ_PADRAO);
		expect(lerConfigAprendiz({ bkt: "x", meiaVidaDias: "y" })).toEqual(CONFIG_APRENDIZ_PADRAO);
	});

	it("config parcial completa com os padrões", () => {
		expect(lerConfigAprendiz({ bkt: { chute: 0.25 }, perfilDesligadoAte: "2026-12-01" })).toEqual({
			bkt: { inicio: 0.3, chute: 0.25, deslize: 0.1, aprendizado: 0.15 },
			meiaVidaDias: 30,
		});
		expect(lerConfigAprendiz({ meiaVidaDias: 10 })).toEqual({ ...CONFIG_APRENDIZ_PADRAO, meiaVidaDias: 10 });
	});

	it("números fora de 0 a 1 no BKT e meia-vida <= 0 voltam ao padrão; 0 e 1 valem no BKT", () => {
		const lida = lerConfigAprendiz({ bkt: { inicio: 1.5, chute: -0.1, deslize: Number.NaN, aprendizado: 1 }, meiaVidaDias: 0 });
		expect(lida).toEqual({ bkt: { inicio: 0.3, chute: 0.2, deslize: 0.1, aprendizado: 1 }, meiaVidaDias: 30 });
		expect(lerConfigAprendiz({ meiaVidaDias: -3 }).meiaVidaDias).toBe(30);
		expect(lerConfigAprendiz({ bkt: { inicio: 0 } }).bkt.inicio).toBe(0);
	});

	it("não devolve o objeto padrão (pode ser alterado sem estragar o padrão)", () => {
		const lida = lerConfigAprendiz({});
		expect(lida).not.toBe(CONFIG_APRENDIZ_PADRAO);
		expect(lida.bkt).not.toBe(CONFIG_APRENDIZ_PADRAO.bkt);
	});
});
