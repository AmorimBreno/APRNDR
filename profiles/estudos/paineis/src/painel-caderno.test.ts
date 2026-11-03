// As partes puras do painel do caderno (painel-caderno.ts): qual tag cada rota
// abre, a rota de cada tag e as setas do seletor.

import { describe, expect, it } from "vitest";
import { abaVizinha, rotaDaTag, TAGS_DO_CADERNO, tagDaRota, tagVizinha } from "./painel-caderno.ts";

describe("tagDaRota", () => {
	it("sem seção abre Notas", () => {
		expect(tagDaRota()).toBe("notas");
		expect(tagDaRota("")).toBe("notas");
	});

	it("cada tag abre a si mesma", () => {
		expect(tagDaRota("notas")).toBe("notas");
		expect(tagDaRota("materiais")).toBe("materiais");
		expect(tagDaRota("mapa")).toBe("mapa");
	});

	it("as rotas antigas (linha do tempo e cursos) e os ids desconhecidos abrem Notas", () => {
		expect(tagDaRota("linha-do-tempo")).toBe("notas");
		expect(tagDaRota("cursos")).toBe("notas");
		expect(tagDaRota("aulas")).toBe("notas");
		expect(tagDaRota("resumos")).toBe("notas");
		expect(tagDaRota("questionarios")).toBe("notas");
		expect(tagDaRota("qualquer-coisa")).toBe("notas");
	});

	it("só vale o id exato (sem maiúsculas nem espaços)", () => {
		expect(tagDaRota("Mapa")).toBe("notas");
		expect(tagDaRota(" mapa")).toBe("notas");
	});
});

describe("rotaDaTag", () => {
	it("monta caderno/<matéria>/<tag>, inclusive para Notas", () => {
		expect(rotaDaTag("ciencia-de-dados", "notas")).toBe("caderno/ciencia-de-dados/notas");
		expect(rotaDaTag("ciencia-de-dados", "materiais")).toBe("caderno/ciencia-de-dados/materiais");
		expect(rotaDaTag("calculo", "mapa")).toBe("caderno/calculo/mapa");
	});

	it("a rota de cada tag volta para a mesma tag", () => {
		for (const { id } of TAGS_DO_CADERNO) {
			const secao = rotaDaTag("calculo", id).split("/")[2];
			expect(tagDaRota(secao)).toBe(id);
		}
	});
});

describe("tagVizinha", () => {
	it("a seta para a direita (e para baixo) vai para a próxima e volta ao começo no fim", () => {
		expect(tagVizinha("notas", "ArrowRight")).toBe("materiais");
		expect(tagVizinha("materiais", "ArrowDown")).toBe("mapa");
		expect(tagVizinha("mapa", "ArrowRight")).toBe("notas");
	});

	it("a seta para a esquerda (e para cima) vai para a anterior e volta ao fim no começo", () => {
		expect(tagVizinha("mapa", "ArrowLeft")).toBe("materiais");
		expect(tagVizinha("materiais", "ArrowUp")).toBe("notas");
		expect(tagVizinha("notas", "ArrowLeft")).toBe("mapa");
	});

	it("Home vai para a primeira e End para a última", () => {
		expect(tagVizinha("mapa", "Home")).toBe("notas");
		expect(tagVizinha("notas", "End")).toBe("mapa");
	});

	it("as outras teclas não mexem", () => {
		expect(tagVizinha("notas", "Enter")).toBeUndefined();
		expect(tagVizinha("notas", "a")).toBeUndefined();
	});
});

describe("abaVizinha", () => {
	const abas = ["calendario", "tarefas", "quadro"] as const;

	it("anda numa lista qualquer, com volta ao redor, Home e End", () => {
		expect(abaVizinha(abas, "calendario", "ArrowRight")).toBe("tarefas");
		expect(abaVizinha(abas, "quadro", "ArrowRight")).toBe("calendario");
		expect(abaVizinha(abas, "calendario", "ArrowLeft")).toBe("quadro");
		expect(abaVizinha(abas, "tarefas", "Home")).toBe("calendario");
		expect(abaVizinha(abas, "tarefas", "End")).toBe("quadro");
		expect(abaVizinha(abas, "tarefas", "Enter")).toBeUndefined();
	});
});
