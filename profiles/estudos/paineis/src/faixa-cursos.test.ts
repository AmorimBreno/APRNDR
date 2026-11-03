// As partes puras da faixa de cursos do painel do caderno (faixa-cursos.ts):
// o card em destaque, a numeração, o tom de cada card, o selo, o rótulo e o pé
// (prazo ou última edição), e a contagem do cabeçalho.

import { describe, expect, it } from "vitest";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import { cardsDosCursos, indiceEmDestaque, TONS_DOS_CARDS, textoContagem } from "./faixa-cursos.ts";

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

	it("o rascunho diz em que etapa parou e o pronto quantos módulos tem", () => {
		const [rascunho, pronto] = cardsDosCursos(
			[resumo("a", { etapa: "diagnostico", prazo: "2026-11-20" }), resumo("b", { situacao: "pronto", modulos: 6, prazo: "2026-11-25" })],
			materia,
		);
		expect(rascunho).toMatchObject({ icone: "file", categoria: "Rascunho", selo: "parou em Diagnóstico", prazo: "P1 em 20/11", rodape: "Prazo: P1 em 20/11" });
		expect(rascunho?.descricao).toBe("01, Curso a. Rascunho · parou em Diagnóstico. P1 em 20/11.");
		expect(pronto).toMatchObject({ icone: "flag", categoria: "Curso 02", selo: "6 módulos", prazo: "25/11", rodape: "Prazo: 25/11" });
	});

	it("um módulo só fica no singular; sem módulos conhecidos, o selo do pronto é só Pronto", () => {
		const [um, semConta] = cardsDosCursos([resumo("a", { situacao: "pronto", modulos: 1 }), resumo("b", { situacao: "pronto" })], undefined);
		expect(um?.selo).toBe("1 módulo");
		expect(semConta?.selo).toBe("Pronto");
	});

	it("sem prazo, o pé diz quando o curso foi editado", () => {
		const agora = new Date("2026-10-23T15:00:00.000Z");
		const [card] = cardsDosCursos([resumo("a", { situacao: "pronto" })], undefined, "amber", agora);
		expect(card?.prazo).toBe("sem prazo");
		expect(card?.rodape).toBe("editado ontem");
	});
});

describe("o tom de cada card", () => {
	it("o destaque fica no tom da matéria e os outros alternam os tons sem repeti-lo", () => {
		const lista = [resumo("a", { situacao: "pronto" }), ...Array.from({ length: 7 }, (_, i) => resumo(`r${i}`))];
		const tons = cardsDosCursos(lista, materia, "sage").map((card) => card.tom);
		expect(tons[0]).toBe("sage");
		expect(tons.slice(1).includes("sage")).toBe(false);
	});

	it("dois vizinhos nunca têm o mesmo tom", () => {
		const lista = Array.from({ length: 14 }, (_, i) => resumo(`c${i}`, i === 3 ? { situacao: "pronto" } : {}));
		for (const tomDaMateria of TONS_DOS_CARDS) {
			const tons = cardsDosCursos(lista, materia, tomDaMateria).map((card) => card.tom);
			tons.slice(1).forEach((tom, i) => expect(tom).not.toBe(tons[i]));
		}
	});

	it("sem destaque, a ordem dos tons começa em tijolo (rosa), areia e aço", () => {
		const tons = cardsDosCursos([resumo("a"), resumo("b"), resumo("c")], materia, "amber").map((card) => card.tom);
		expect(tons).toEqual(["brick", "cream", "steel"]);
	});
});

describe("a contagem do cabeçalho", () => {
	it("usa o singular e o plural, e some quando não há curso", () => {
		expect(textoContagem(1)).toBe("1 curso");
		expect(textoContagem(3)).toBe("3 cursos");
		expect(textoContagem(0)).toBe("");
	});
});
