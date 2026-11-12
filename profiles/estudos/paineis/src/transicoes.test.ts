import { describe, expect, it } from "vitest";
import { trocaSemTransicao } from "./transicoes.ts";

describe("trocaSemTransicao", () => {
	it("tags do painel do mesmo caderno não animam a página", () => {
		expect(trocaSemTransicao("caderno/calc/notas", "caderno/calc/materiais")).toBe(true);
		expect(trocaSemTransicao("caderno/calc/materiais", "caderno/calc/mapa")).toBe(true);
		expect(trocaSemTransicao("caderno/calc", "caderno/calc/mapa")).toBe(true);
	});

	it("abas da mesa da mesma matéria não animam", () => {
		expect(trocaSemTransicao("caderno/calc/notas/A", "caderno/calc/notas/B")).toBe(true);
		expect(trocaSemTransicao("caderno/calc/notas/A", "caderno/calc/cursos/c1/modulos/m1/l2")).toBe(true);
	});

	it("abas da agenda não animam, com ou sem filtro", () => {
		expect(trocaSemTransicao("agenda/calendario", "agenda/tarefas")).toBe(true);
		expect(trocaSemTransicao("agenda/quadro/calc", "agenda/calendario/calc")).toBe(true);
		expect(trocaSemTransicao("agenda/tarefas", "agenda/tarefas/calc")).toBe(true);
	});

	it("a aba e o filtro de matéria do aprendiz não animam; entrar e sair dele anima", () => {
		expect(trocaSemTransicao("aprendiz/indicadores", "aprendiz/indicadores/calc")).toBe(true);
		expect(trocaSemTransicao("aprendiz/indicadores/calc", "aprendiz/indicadores/fisica")).toBe(true);
		expect(trocaSemTransicao("aprendiz/indicadores/calc", "aprendiz/indicadores")).toBe(true);
		expect(trocaSemTransicao("aprendiz/indicadores", "aprendiz/hipoteses")).toBe(true);
		expect(trocaSemTransicao("aprendiz/hipoteses/calc", "aprendiz/historico/calc?evento=0abc-1234")).toBe(true);
		expect(trocaSemTransicao("aprendiz/historico?evento=0abc-1234", "aprendiz/historico")).toBe(true);
		expect(trocaSemTransicao("aprendiz/historico", "aprendiz/hipoteses?hipotese=h-1")).toBe(true);
		expect(trocaSemTransicao("", "aprendiz/indicadores")).toBe(false);
		expect(trocaSemTransicao("aprendiz/indicadores", "")).toBe(false);
		expect(trocaSemTransicao("aprendiz/indicadores", "agenda/calendario")).toBe(false);
	});

	it("o resto anima como antes", () => {
		expect(trocaSemTransicao("", "caderno/calc")).toBe(false);
		expect(trocaSemTransicao("caderno/calc/notas", "caderno/fisica/notas")).toBe(false);
		expect(trocaSemTransicao("caderno/calc/notas", "caderno/calc/notas/A")).toBe(false);
		expect(trocaSemTransicao("caderno/calc/notas/A", "caderno/calc/notas")).toBe(false);
		expect(trocaSemTransicao("caderno/calc/notas", "agenda/calendario")).toBe(false);
		expect(trocaSemTransicao("caderno/calc/cursos/c1", "caderno/calc/notas")).toBe(false);
		expect(trocaSemTransicao("caderno/calc/notas", "caderno/calc/notas")).toBe(false);
	});
});
