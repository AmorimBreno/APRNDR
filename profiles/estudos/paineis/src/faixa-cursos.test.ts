// As partes puras da faixa de cursos do painel do caderno (faixa-cursos.ts):
// o card em destaque, a numeração, a etiqueta e o prazo juntos, e a contagem
// do cabeçalho.

import { describe, expect, it } from "vitest";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import { cardsDosCursos, indiceEmDestaque, textoContagem } from "./faixa-cursos.ts";

const materia = { provas: [{ nome: "P1", data: "2026-11-20" }] };

function resumo(id: string, extra: Partial<ResumoCurso> = {}): ResumoCurso {
	return { id, nome: `Curso ${id}`, situacao: "rascunho", etapa: "mapa", prazo: null, alteradoEm: "2026-10-22T13:00:00.000Z", ...extra };
}

describe("o card em destaque", () => {
	it("é o primeiro curso pronto, não importa a posição", () => {
		expect(indiceEmDestaque([resumo("a"), resumo("b", { situacao: "pronto" }), resumo("c", { situacao: "pronto" })])).toBe(1);
		expect(indiceEmDestaque([resumo("a", { situacao: "pronto" })])).toBe(0);
	});

	it("sem nenhum pronto, nenhum fica em destaque", () => {
		expect(indiceEmDestaque([resumo("a"), resumo("b")])).toBeUndefined();
		expect(indiceEmDestaque([])).toBeUndefined();
		expect(cardsDosCursos([resumo("a")], materia).some((card) => card.destaque)).toBe(false);
	});

	it("só um card fica em destaque", () => {
		const cards = cardsDosCursos([resumo("a", { situacao: "pronto" }), resumo("b", { situacao: "pronto" })], materia);
		expect(cards.map((card) => card.destaque)).toEqual([true, false]);
	});
});

describe("os cards", () => {
	it("são numerados 01, 02… na ordem da lista", () => {
		const lista = Array.from({ length: 10 }, (_, i) => resumo(`c${i}`));
		const numeros = cardsDosCursos(lista, materia).map((card) => card.numero);
		expect(numeros[0]).toBe("01");
		expect(numeros[8]).toBe("09");
		expect(numeros[9]).toBe("10");
	});

	it("juntam a etiqueta e o prazo: o rascunho diz onde parou, o pronto quantos módulos tem", () => {
		const [rascunho, pronto] = cardsDosCursos(
			[resumo("a", { etapa: "diagnostico", prazo: "2026-11-20" }), resumo("b", { situacao: "pronto", modulos: 6, prazo: "2026-11-25" })],
			materia,
		);
		expect(rascunho?.rotulo).toEqual({ texto: "Rascunho · parou em Diagnóstico", tom: "amber" });
		expect(rascunho?.prazo).toBe("P1 em 20/11");
		expect(rascunho?.descricao).toBe("01, Curso a. Rascunho · parou em Diagnóstico. P1 em 20/11.");
		expect(pronto?.rotulo).toEqual({ texto: "Pronto · 6 módulos", tom: "sage" });
		expect(pronto?.prazo).toBe("25/11");
	});

	it("sem módulos conhecidos, o pronto é só Pronto; sem prazo, diz sem prazo", () => {
		const [card] = cardsDosCursos([resumo("a", { situacao: "pronto" })], undefined);
		expect(card?.rotulo.texto).toBe("Pronto");
		expect(card?.prazo).toBe("sem prazo");
	});
});

describe("a contagem do cabeçalho", () => {
	it("usa o singular e o plural, e some quando não há curso", () => {
		expect(textoContagem(1)).toBe("1 curso");
		expect(textoContagem(3)).toBe("3 cursos");
		expect(textoContagem(0)).toBe("");
	});
});
