// @vitest-environment happy-dom
// As partes puras da linha do tempo (LinhaDoTempo.tsx): o agrupamento dos eventos por dia.

import { describe, expect, it } from "vitest";
import type { Evento } from "../../lib/eventos.ts";
import { porDia } from "./LinhaDoTempo.tsx";

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

describe("porDia", () => {
	it("agrupa por dia, do mais novo ao mais antigo, qualquer que seja a ordem de entrada", () => {
		const grupos = porDia([a, e, c, b, d]);
		expect(grupos.map((grupo) => grupo.eventos.map((item) => item.id))).toEqual([["e"], ["d", "c"], ["b", "a"]]);
		expect(new Set(grupos.map((grupo) => grupo.dia)).size).toBe(3);
	});

	it("sem eventos, nenhum grupo", () => {
		expect(porDia([])).toEqual([]);
	});

	it("não altera a lista de entrada", () => {
		const entrada = [a, c, b];
		porDia(entrada);
		expect(entrada.map((item) => item.id)).toEqual(["a", "c", "b"]);
	});
});
