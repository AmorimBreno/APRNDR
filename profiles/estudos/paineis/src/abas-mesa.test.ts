import { describe, expect, it } from "vitest";
import { type AbaMesa, abaDoCaminho, abrirAba, abrirPrevia, fecharAba, fixarAba, guardarRolagem, LIMITE_ABAS_MESA, mudarCaminho } from "./abas-mesa.ts";

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

describe("a vaga de prévia", () => {
	const previa = (titulo: string): AbaMesa => ({ ...nota(titulo), previa: true });
	const seis = () => Array.from({ length: LIMITE_ABAS_MESA }, (_, i) => nota(`N${i + 1}`));

	it("abre no fim, marcada como prévia", () => {
		expect(abrirPrevia([nota("A")], nota("P"))).toEqual([nota("A"), previa("P")]);
	});

	it("é uma só: o professor a reaproveita, no mesmo lugar", () => {
		const abas = abrirPrevia([nota("A"), previa("P"), nota("B")], nota("Q"));
		expect(abas).toEqual([nota("A"), previa("Q"), nota("B")]);
		expect(abas.filter((aba) => aba.previa)).toHaveLength(1);
	});

	it("uma aba já aberta não muda (a do Breno continua dele)", () => {
		const abas = [nota("A"), previa("P")];
		expect(abrirPrevia(abas, nota("A"))).toEqual(abas);
	});

	it("conta no limite de 6: sem prévia anterior, sai a mais antiga do Breno", () => {
		const abas = abrirPrevia(seis(), nota("P"));
		expect(abas).toHaveLength(LIMITE_ABAS_MESA);
		expect(abas[0]?.rotulo).toBe("N2");
		expect(abas.at(-1)).toEqual(previa("P"));
	});

	it("com as 6 cheias e uma prévia, a nova prévia fecha a anterior antes de qualquer aba do Breno", () => {
		const cheias = [...seis().slice(0, 5), previa("P")];
		const abas = abrirPrevia(cheias, nota("Q"));
		expect(abas).toEqual([...seis().slice(0, 5), previa("Q")]);
	});

	it("a aba protegida (em foco) nunca sai; se for a prévia anterior, vira fixa", () => {
		const abas = abrirPrevia([nota("A"), previa("P")], nota("Q"), previa("P").chave);
		expect(abas).toEqual([nota("A"), nota("P"), previa("Q")]);
		const cheias = abrirPrevia(seis(), nota("Q"), nota("N1").chave);
		expect(cheias.map((aba) => aba.rotulo)).toEqual(["N1", "N3", "N4", "N5", "N6", "Q"]);
	});

	it("vira fixa quando o Breno interage com ela", () => {
		const abas = [nota("A"), previa("P")];
		expect(fixarAba(abas, previa("P").chave)).toEqual([nota("A"), nota("P")]);
		// Sem prévia naquela chave, a mesma lista (sem gravar de novo).
		expect(fixarAba(abas, nota("A").chave)).toBe(abas);
	});

	it("abrirAba mantém a prévia ao navegar até ela, e uma aba nova do Breno tira a prévia antes das dele", () => {
		const abas = abrirAba([nota("A"), previa("P")], { ...nota("P"), caminho: "caderno/calc/notas/P" });
		expect(abas[1]?.previa).toBe(true);
		const cheias = abrirAba([...seis().slice(0, 5), previa("P")], nota("Z"));
		expect(cheias).toEqual([...seis().slice(0, 5), nota("Z")]);
	});

	it("mudarCaminho troca a rota guardada da aba", () => {
		const licao: AbaMesa = { chave: "caderno/calc/cursos/c1/modulos/m2", caminho: "caderno/calc/cursos/c1/modulos/m2/l1", tipo: "licao", rotulo: "Lição 1", previa: true };
		expect(mudarCaminho([licao], licao.chave, "caderno/calc/cursos/c1/modulos/m2/l3")[0]?.caminho).toBe("caderno/calc/cursos/c1/modulos/m2/l3");
	});
});

describe("guardarRolagem", () => {
	it("guarda só na aba da chave", () => {
		expect(guardarRolagem([nota("A"), nota("B")], nota("B").chave, 120)).toEqual([nota("A"), { ...nota("B"), rolagem: 120 }]);
	});
});
