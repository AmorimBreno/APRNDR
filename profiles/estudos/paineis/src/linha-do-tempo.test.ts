// @vitest-environment happy-dom
// As partes puras da faixa da linha do tempo (LinhaDoTempo.tsx): os eventos
// mais recentes, a marcação do dia só no primeiro marco de cada dia e o rótulo acessível de cada marca.

import { describe, expect, it } from "vitest";
import type { Evento } from "../../lib/eventos.ts";
import { eventosRecentes, marcosDaFaixa, porDia, rotuloDoMarco } from "./LinhaDoTempo.tsx";

// Horários perto do meio do dia em UTC e com poucos minutos de diferença entre os do mesmo dia,
// para a divisão por dia não mudar com o fuso do computador que roda o teste.
function evento(id: string, ts: string): Evento {
	return { id, ts, verbo: "criou_nota", objeto: { materia: "calculo", nota: id } };
}

const a = evento("a", "2026-11-01T10:00:00.000Z");
const b = evento("b", "2026-11-01T10:10:00.000Z");
const c = evento("c", "2026-11-03T10:00:00.000Z");
const d = evento("d", "2026-11-03T10:05:00.000Z");
const e = evento("e", "2026-11-05T10:00:00.000Z");

describe("eventosRecentes", () => {
	it("devolve do mais novo ao mais antigo, qualquer que seja a ordem de entrada", () => {
		expect(eventosRecentes([a, e, c, b, d], 10).map((item) => item.id)).toEqual(["e", "d", "c", "b", "a"]);
	});

	it("corta no limite, ficando com os mais novos", () => {
		expect(eventosRecentes([a, b, c, d, e], 3).map((item) => item.id)).toEqual(["e", "d", "c"]);
	});

	it("o limite padrão é 40", () => {
		const muitos = Array.from({ length: 60 }, (_, indice) => evento(`x${indice}`, new Date(Date.UTC(2026, 0, indice + 1, 10)).toISOString()));
		const recentes = eventosRecentes(muitos);
		expect(recentes).toHaveLength(40);
		expect(recentes[0]?.id).toBe("x59");
		expect(marcosDaFaixa(muitos)).toHaveLength(40);
	});

	it("aceita lista vazia e limite zero, e não altera a lista de entrada", () => {
		expect(eventosRecentes([], 5)).toEqual([]);
		const entrada = [a, c, b];
		expect(eventosRecentes(entrada, 0)).toEqual([]);
		eventosRecentes(entrada, 2);
		expect(entrada.map((item) => item.id)).toEqual(["a", "c", "b"]);
	});
});

describe("marcosDaFaixa", () => {
	it("marca o dia só no primeiro evento de cada dia", () => {
		const marcos = marcosDaFaixa([a, b, c, d, e], 10);
		expect(marcos.map((marco) => marco.evento.id)).toEqual(["e", "d", "c", "b", "a"]);
		expect(marcos.map((marco) => marco.dia !== undefined)).toEqual([true, true, false, true, false]);
	});

	it("o rótulo do dia é o mesmo do agrupamento por dia da lista vertical", () => {
		const rotulos = porDia([a, b, c, d, e]).map((grupo) => grupo.dia);
		const marcados = marcosDaFaixa([a, b, c, d, e], 10).flatMap((marco) => (marco.dia ? [marco.dia] : []));
		expect(marcados).toEqual(rotulos);
		expect(new Set(marcados).size).toBe(3);
	});

	it("o limite vale antes de marcar: o corte no meio de um dia não repete o rótulo", () => {
		const marcos = marcosDaFaixa([a, b, c, d, e], 4);
		expect(marcos.map((marco) => marco.evento.id)).toEqual(["e", "d", "c", "b"]);
		expect(marcos.map((marco) => marco.dia !== undefined)).toEqual([true, true, false, true]);
	});

	it("sem eventos, nenhum marco", () => {
		expect(marcosDaFaixa([])).toEqual([]);
	});
});

describe("rotuloDoMarco", () => {
	it("junta o dia, a hora, a frase e o detalhe, para o leitor de tela não depender do balão", () => {
		const material: Evento = { id: "m", ts: "2026-11-03T10:00:00.000Z", verbo: "adicionou_material", objeto: { materia: "calculo", arquivo: "aula.pdf" }, resultado: { tipo: "pdf", trechos: 4 } };
		const rotulo = rotuloDoMarco(material);
		expect(rotulo).toContain("Material adicionado: aula.pdf");
		expect(rotulo).toContain("PDF · 4 trechos");
		expect(rotulo).toMatch(/\d{2}:\d{2}/);
	});

	it("sem detalhe, termina na frase", () => {
		expect(rotuloDoMarco(a).endsWith("Nota criada: a")).toBe(true);
	});
});
