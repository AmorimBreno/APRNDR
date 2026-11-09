import { describe, expect, it } from "vitest";
import { type AbaMesa, abaDoCaminho, abrirAba, fecharAba, guardarRolagem, LIMITE_ABAS_MESA } from "./abas-mesa.ts";

const nota = (titulo: string): AbaMesa => ({ chave: `caderno/calc/notas/${titulo}`, caminho: `caderno/calc/notas/${titulo}`, tipo: "nota", rotulo: titulo });

describe("abaDoCaminho", () => {
	it("nota: a rota é a chave, mesmo com barras no título", () => {
		expect(abaDoCaminho("caderno/calc/notas/Séries")).toEqual({ tipo: "nota", chave: "caderno/calc/notas/Séries" });
		expect(abaDoCaminho("caderno/calc/notas/a/b")).toEqual({ tipo: "nota", chave: "caderno/calc/notas/a/b" });
	});

	it("lição: a chave é o módulo, com ou sem a lição", () => {
		expect(abaDoCaminho("caderno/calc/cursos/c1/modulos/m2/l3")).toEqual({ tipo: "licao", chave: "caderno/calc/cursos/c1/modulos/m2" });
		expect(abaDoCaminho("caderno/calc/cursos/c1/modulos/m2")).toEqual({ tipo: "licao", chave: "caderno/calc/cursos/c1/modulos/m2" });
	});

	it("as outras rotas não viram aba", () => {
		for (const caminho of ["", "caderno/calc", "caderno/calc/notas", "caderno/calc/materiais/aula.pdf", "caderno/calc/mapa", "caderno/calc/cursos/c1", "caderno/calc/cursos/novo", "caderno/calc/cursos/c1/guia/mapa", "agenda/calendario", "caderno/calc/notas//x"]) {
			expect(abaDoCaminho(caminho), caminho).toBeUndefined();
		}
	});
});

describe("abrirAba", () => {
	it("acrescenta no fim e, passando do limite, tira a mais antiga", () => {
		let abas: AbaMesa[] = [];
		for (let i = 1; i <= LIMITE_ABAS_MESA + 1; i++) abas = abrirAba(abas, nota(`N${i}`));
		expect(abas).toHaveLength(LIMITE_ABAS_MESA);
		expect(abas[0]?.rotulo).toBe("N2");
		expect(abas.at(-1)?.rotulo).toBe(`N${LIMITE_ABAS_MESA + 1}`);
	});

	it("a mesma chave atualiza no lugar e mantém a rolagem", () => {
		const licao: AbaMesa = { chave: "caderno/calc/cursos/c1/modulos/m2", caminho: "caderno/calc/cursos/c1/modulos/m2/l1", tipo: "licao", rotulo: "Lição 1", rolagem: 300 };
		const abas = abrirAba([licao, nota("A")], { ...licao, caminho: "caderno/calc/cursos/c1/modulos/m2/l2", rotulo: "Lição 2", rolagem: undefined });
		expect(abas).toHaveLength(2);
		expect(abas[0]).toEqual({ ...licao, caminho: "caderno/calc/cursos/c1/modulos/m2/l2", rotulo: "Lição 2", rolagem: 300 });
	});
});

describe("fecharAba", () => {
	const abas = [nota("A"), nota("B"), nota("C")];

	it("fechar a ativa ativa a da direita, senão a da esquerda", () => {
		expect(fecharAba(abas, nota("B").chave, nota("B").chave)).toEqual({ abas: [nota("A"), nota("C")], ativar: nota("C").caminho });
		expect(fecharAba(abas, nota("C").chave, nota("C").chave)).toEqual({ abas: [nota("A"), nota("B")], ativar: nota("B").caminho });
	});

	it("fechar outra não muda a ativa; fechar a última não ativa nada", () => {
		expect(fecharAba(abas, nota("A").chave, nota("C").chave)).toEqual({ abas: [nota("B"), nota("C")] });
		expect(fecharAba([nota("A")], nota("A").chave, nota("A").chave)).toEqual({ abas: [] });
	});

	it("chave desconhecida não muda nada", () => {
		expect(fecharAba(abas, "x", nota("A").chave)).toEqual({ abas });
	});
});

describe("guardarRolagem", () => {
	it("guarda só na aba da chave", () => {
		expect(guardarRolagem([nota("A"), nota("B")], nota("B").chave, 120)).toEqual([nota("A"), { ...nota("B"), rolagem: 120 }]);
	});
});
