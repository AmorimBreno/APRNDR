// As partes puras do quadro de tarefas (quadro-tarefas.ts): as colunas com o
// filtro de matéria, a posição de soltar no quadro inteiro, o teclado e o menu
// da coluna.

import { describe, expect, it } from "vitest";
import { type Agenda, agendaPadrao, criarColuna, criarTarefa, moverTarefa, tarefasDaColuna } from "../../lib/agenda-tipos.ts";
import {
	acoesDaColuna,
	avisoDeMover,
	colunaNoPonto,
	colunasDoQuadro,
	destinoDoTeclado,
	destinoPadraoDeApagar,
	destinosParaApagar,
	direcaoDaTecla,
	idsComColunaMovida,
	indiceDeSoltar,
	mudaAoMover,
	posicaoDeSoltar,
	previaDaNota,
	velocidadeDaRolagem,
} from "./quadro-tarefas.ts";

const agora = new Date("2026-11-03T12:00:00Z");

/** A fazer: a1 (cálculo), a2 (física), a3 (cálculo), a4 (cálculo). Fazendo: f1 (física). Feito: d1. */
function agendaDeTeste(): Agenda {
	let agenda = agendaPadrao();
	const nova = (id: string, coluna: string, materia?: string) => {
		agenda = criarTarefa(agenda, { titulo: `Tarefa ${id}`, coluna, ...(materia ? { materia } : {}) }, { id, agora }).agenda;
	};
	nova("a1", "a-fazer", "calculo");
	nova("a2", "a-fazer", "fisica");
	nova("a3", "a-fazer", "calculo");
	nova("a4", "a-fazer", "calculo");
	nova("f1", "fazendo", "fisica");
	nova("d1", "feito", "calculo");
	return agenda;
}

const ordem = (agenda: Agenda, coluna: string) => tarefasDaColuna(agenda, coluna).map((tarefa) => tarefa.id);

describe("as colunas do quadro", () => {
	it("uma por coluna, na ordem do quadro, com todas as tarefas sem filtro", () => {
		const colunas = colunasDoQuadro(agendaDeTeste());
		expect(colunas.map((item) => item.coluna.id)).toEqual(["a-fazer", "fazendo", "feito"]);
		expect(colunas.map((item) => item.tarefas.map((tarefa) => tarefa.id))).toEqual([["a1", "a2", "a3", "a4"], ["f1"], ["d1"]]);
		expect(colunas.map((item) => item.total)).toEqual([4, 1, 1]);
	});

	it("com o filtro, só as da matéria; o total continua o do quadro", () => {
		const colunas = colunasDoQuadro(agendaDeTeste(), "calculo");
		expect(colunas.map((item) => item.tarefas.map((tarefa) => tarefa.id))).toEqual([["a1", "a3", "a4"], [], ["d1"]]);
		expect(colunas.map((item) => item.total)).toEqual([4, 1, 1]);
	});
});

describe("a prévia da nota", () => {
	it("a primeira linha que tem texto, sem marcadores", () => {
		expect(previaDaNota("\n\n  Exercícios   4 a 9.\nOutra linha")).toBe("Exercícios 4 a 9.");
		expect(previaDaNota("# Título da nota\ncorpo")).toBe("Título da nota");
		expect(previaDaNota("- primeiro item\n- segundo")).toBe("primeiro item");
		expect(previaDaNota("2. segundo passo")).toBe("segundo passo");
	});

	it("sem nota, vazio", () => {
		expect(previaDaNota(undefined)).toBe("");
		expect(previaDaNota("  \n ")).toBe("");
	});
});

describe("a posição de soltar", () => {
	it("sem filtro, o índice é a posição", () => {
		const agenda = agendaDeTeste();
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 0)).toBe(0);
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 2)).toBe(2);
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 4)).toBe(4);
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 99)).toBe(4);
	});

	it("dentro da própria coluna, a posição conta sem a tarefa que se move", () => {
		const agenda = agendaDeTeste();
		// Sem a2 a coluna é a1, a3, a4: antes de a4 é o lugar 2.
		expect(posicaoDeSoltar(agenda, "a2", "a-fazer", 2)).toBe(2);
		expect(ordem(moverTarefa(agenda, "a2", "a-fazer", 2).agenda, "a-fazer")).toEqual(["a1", "a3", "a2", "a4"]);
	});

	it("com o filtro, o lugar entre os visíveis vira a posição na coluna inteira", () => {
		const agenda = agendaDeTeste();
		// Vindo de fora, os visíveis de cálculo são a1, a3, a4 (a2 é de física e fica escondida entre a1 e a3).
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 0, "calculo")).toBe(0);
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 1, "calculo")).toBe(2);
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 2, "calculo")).toBe(3);
		// Depois do último visível, logo depois dele.
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 3, "calculo")).toBe(4);
	});

	it("com o filtro, soltar antes do cartão visível o põe antes dele na coluna inteira", () => {
		const agenda = agendaDeTeste();
		const posicao = posicaoDeSoltar(agenda, "f1", "a-fazer", 1, "calculo");
		expect(ordem(moverTarefa(agenda, "f1", "a-fazer", posicao).agenda, "a-fazer")).toEqual(["a1", "a2", "f1", "a3", "a4"]);
	});

	it("com o filtro e a própria tarefa na coluna, ela não conta", () => {
		const agenda = agendaDeTeste();
		// Arrastando a3 para depois de a4 (visíveis sem ela: a1, a4).
		const posicao = posicaoDeSoltar(agenda, "a3", "a-fazer", 2, "calculo");
		expect(ordem(moverTarefa(agenda, "a3", "a-fazer", posicao).agenda, "a-fazer")).toEqual(["a1", "a2", "a4", "a3"]);
		// Arrastando a1 para depois de a3 (visíveis sem ela: a3, a4): fica entre a3 e a4, depois da escondida a2.
		const outra = posicaoDeSoltar(agenda, "a1", "a-fazer", 1, "calculo");
		expect(ordem(moverTarefa(agenda, "a1", "a-fazer", outra).agenda, "a-fazer")).toEqual(["a2", "a3", "a1", "a4"]);
	});

	it("com o filtro e nenhum visível na coluna, no fim", () => {
		const agenda = agendaDeTeste();
		expect(posicaoDeSoltar(agenda, "a1", "fazendo", 0, "calculo")).toBe(1);
		expect(posicaoDeSoltar(agenda, "a1", "fazendo", 0)).toBe(0);
	});

	it("numa coluna vazia, 0", () => {
		const agenda = criarColuna(agendaDeTeste(), "Revisar", undefined, { id: "col-revisar", agora }).agenda;
		expect(posicaoDeSoltar(agenda, "a1", "col-revisar", 0, "calculo")).toBe(0);
	});

	it("um índice negativo ou quebrado vale 0 ou o inteiro de baixo", () => {
		const agenda = agendaDeTeste();
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", -3)).toBe(0);
		expect(posicaoDeSoltar(agenda, "f1", "a-fazer", 1.9)).toBe(1);
	});
});

describe("soltar no mesmo lugar", () => {
	it("não muda nada", () => {
		const agenda = agendaDeTeste();
		expect(mudaAoMover(agenda, "a2", "a-fazer", 1)).toBe(false);
		expect(mudaAoMover(agenda, "a2", "a-fazer", 2)).toBe(true);
		expect(mudaAoMover(agenda, "a2", "fazendo", 0)).toBe(true);
	});

	it("uma tarefa ou coluna que não existe não muda nada (e não quebra)", () => {
		expect(mudaAoMover(agendaDeTeste(), "nao-existe", "a-fazer", 0)).toBe(false);
		expect(mudaAoMover(agendaDeTeste(), "a1", "nao-existe", 0)).toBe(false);
	});
});

describe("o lugar sob o ponteiro", () => {
	it("conta os cartões cujo centro está acima", () => {
		const centros = [50, 130, 210];
		expect(indiceDeSoltar(centros, 10)).toBe(0);
		expect(indiceDeSoltar(centros, 51)).toBe(1);
		expect(indiceDeSoltar(centros, 130)).toBe(1);
		expect(indiceDeSoltar(centros, 200)).toBe(2);
		expect(indiceDeSoltar(centros, 900)).toBe(3);
		expect(indiceDeSoltar([], 100)).toBe(0);
	});

	it("a coluna sob o ponteiro, ou a mais próxima", () => {
		const faixas = [
			{ id: "a", esquerda: 0, direita: 300 },
			{ id: "b", esquerda: 316, direita: 616 },
			{ id: "c", esquerda: 632, direita: 932 },
		];
		expect(colunaNoPonto(faixas, 150)).toBe("a");
		expect(colunaNoPonto(faixas, 400)).toBe("b");
		// No vão entre as colunas: a mais perto.
		expect(colunaNoPonto(faixas, 306)).toBe("a");
		expect(colunaNoPonto(faixas, 312)).toBe("b");
		// Além das pontas.
		expect(colunaNoPonto(faixas, -50)).toBe("a");
		expect(colunaNoPonto(faixas, 2000)).toBe("c");
		expect(colunaNoPonto([], 10)).toBeUndefined();
	});
});

describe("a rolagem durante o arrasto", () => {
	it("longe das bordas não rola", () => {
		expect(velocidadeDaRolagem(500, 0, 1000)).toBe(0);
	});

	it("perto da borda rola para o lado dela, mais rápido quanto mais perto", () => {
		expect(velocidadeDaRolagem(40, 0, 1000)).toBeLessThan(0);
		expect(velocidadeDaRolagem(960, 0, 1000)).toBeGreaterThan(0);
		expect(Math.abs(velocidadeDaRolagem(10, 0, 1000))).toBeGreaterThan(Math.abs(velocidadeDaRolagem(40, 0, 1000)));
	});

	it("além da borda vale o máximo", () => {
		expect(velocidadeDaRolagem(-300, 0, 1000)).toBe(-18);
		expect(velocidadeDaRolagem(2000, 0, 1000)).toBe(18);
	});
});

describe("o teclado", () => {
	it("as setas viram direções", () => {
		expect(direcaoDaTecla("ArrowLeft")).toBe("esquerda");
		expect(direcaoDaTecla("ArrowRight")).toBe("direita");
		expect(direcaoDaTecla("ArrowUp")).toBe("cima");
		expect(direcaoDaTecla("ArrowDown")).toBe("baixo");
		expect(direcaoDaTecla("Enter")).toBeUndefined();
	});

	it("cima e baixo andam um lugar na coluna", () => {
		const agenda = agendaDeTeste();
		expect(destinoDoTeclado(agenda, "a2", "cima")).toEqual({ coluna: "a-fazer", posicao: 0 });
		expect(destinoDoTeclado(agenda, "a2", "baixo")).toEqual({ coluna: "a-fazer", posicao: 2 });
		expect(destinoDoTeclado(agenda, "a1", "cima")).toBeUndefined();
		expect(destinoDoTeclado(agenda, "a4", "baixo")).toBeUndefined();
		expect(ordem(moverTarefa(agenda, "a2", "a-fazer", 2).agenda, "a-fazer")).toEqual(["a1", "a3", "a2", "a4"]);
	});

	it("com o filtro, cima e baixo pulam as escondidas", () => {
		const agenda = agendaDeTeste();
		// Visíveis de cálculo: a1, a3, a4. Descer a1 a põe depois de a3, ou seja, depois da escondida a2.
		const baixo = destinoDoTeclado(agenda, "a1", "baixo", "calculo")!;
		expect(ordem(moverTarefa(agenda, "a1", baixo.coluna, baixo.posicao).agenda, "a-fazer")).toEqual(["a2", "a3", "a1", "a4"]);
		const cima = destinoDoTeclado(agenda, "a4", "cima", "calculo")!;
		expect(ordem(moverTarefa(agenda, "a4", cima.coluna, cima.posicao).agenda, "a-fazer")).toEqual(["a1", "a2", "a4", "a3"]);
	});

	it("esquerda e direita mudam de coluna, no mesmo lugar ou no fim", () => {
		const agenda = agendaDeTeste();
		expect(destinoDoTeclado(agenda, "a1", "direita")).toEqual({ coluna: "fazendo", posicao: 0 });
		// a3 é o terceiro (índice 2) e Fazendo só tem uma: vai para o fim.
		expect(destinoDoTeclado(agenda, "a3", "direita")).toEqual({ coluna: "fazendo", posicao: 1 });
		expect(destinoDoTeclado(agenda, "f1", "esquerda")).toEqual({ coluna: "a-fazer", posicao: 0 });
		expect(destinoDoTeclado(agenda, "a1", "esquerda")).toBeUndefined();
		expect(destinoDoTeclado(agenda, "d1", "direita")).toBeUndefined();
	});

	it("com o filtro, o lugar vale entre os visíveis da outra coluna", () => {
		let agenda = agendaDeTeste();
		agenda = criarTarefa(agenda, { titulo: "Tarefa f2", coluna: "fazendo", materia: "calculo" }, { id: "f2", agora }).agenda;
		agenda = criarTarefa(agenda, { titulo: "Tarefa f3", coluna: "fazendo", materia: "calculo" }, { id: "f3", agora }).agenda;
		// Em Fazendo: f1 (física, escondida), f2, f3. a3 é o segundo visível de A fazer (a1, a3, a4): vai antes de f3.
		const destino = destinoDoTeclado(agenda, "a3", "direita", "calculo")!;
		expect(ordem(moverTarefa(agenda, "a3", destino.coluna, destino.posicao).agenda, "fazendo")).toEqual(["f1", "f2", "a3", "f3"]);
	});

	it("tarefa que não existe", () => {
		expect(destinoDoTeclado(agendaDeTeste(), "nada", "cima")).toBeUndefined();
	});

	it("o aviso diz a coluna e o lugar", () => {
		const agenda = agendaDeTeste();
		expect(avisoDeMover(agenda, "a2", "fazendo", 0)).toBe("Tarefa a2 em Fazendo, posição 1 de 2.");
		expect(avisoDeMover(agenda, "a2", "a-fazer", 2)).toBe("Tarefa a2 em A fazer, posição 3 de 4.");
		expect(avisoDeMover(agenda, "nada", "a-fazer", 0)).toBeUndefined();
	});
});

describe("o menu da coluna", () => {
	it("a do meio tem tudo", () => {
		expect(acoesDaColuna(agendaDeTeste(), "fazendo").map((opcao) => opcao.id)).toEqual(["renomear", "feito", "esquerda", "direita", "apagar"]);
	});

	it("a primeira não vai para a esquerda; a última (de feito) não vai para a direita, não se marca de novo e não se apaga", () => {
		expect(acoesDaColuna(agendaDeTeste(), "a-fazer").map((opcao) => opcao.id)).toEqual(["renomear", "feito", "direita", "apagar"]);
		expect(acoesDaColuna(agendaDeTeste(), "feito").map((opcao) => opcao.id)).toEqual(["renomear", "esquerda"]);
	});

	it("os títulos estão em português", () => {
		expect(acoesDaColuna(agendaDeTeste(), "fazendo").map((opcao) => opcao.titulo)).toEqual([
			"Renomear",
			"Marcar como feito",
			"Mover para a esquerda",
			"Mover para a direita",
			"Apagar…",
		]);
	});

	it("uma coluna que não existe não tem menu", () => {
		expect(acoesDaColuna(agendaDeTeste(), "nada")).toEqual([]);
	});

	it("trocar a coluna de lugar", () => {
		const colunas = agendaDeTeste().colunas;
		expect(idsComColunaMovida(colunas, "fazendo", "esquerda")).toEqual(["fazendo", "a-fazer", "feito"]);
		expect(idsComColunaMovida(colunas, "fazendo", "direita")).toEqual(["a-fazer", "feito", "fazendo"]);
		expect(idsComColunaMovida(colunas, "a-fazer", "esquerda")).toBeUndefined();
		expect(idsComColunaMovida(colunas, "feito", "direita")).toBeUndefined();
		expect(idsComColunaMovida(colunas, "nada", "direita")).toBeUndefined();
	});
});

describe("apagar uma coluna", () => {
	it("os destinos são as outras, na ordem do quadro", () => {
		expect(destinosParaApagar(agendaDeTeste(), "fazendo").map((coluna) => coluna.id)).toEqual(["a-fazer", "feito"]);
	});

	it("o destino já escolhido é a primeira outra que não é de feito", () => {
		expect(destinoPadraoDeApagar(agendaDeTeste(), "a-fazer")).toBe("fazendo");
		expect(destinoPadraoDeApagar(agendaDeTeste(), "fazendo")).toBe("a-fazer");
	});

	it("se só sobra a de feito, ela", () => {
		let agenda = agendaDeTeste();
		agenda = { ...agenda, colunas: agenda.colunas.filter((coluna) => coluna.id !== "fazendo"), tarefas: agenda.tarefas.filter((tarefa) => tarefa.coluna !== "fazendo") };
		agenda = { ...agenda, colunas: agenda.colunas.filter((coluna) => coluna.id !== "a-fazer"), tarefas: agenda.tarefas.filter((tarefa) => tarefa.coluna !== "a-fazer") };
		agenda = criarColuna(agenda, "Revisar", undefined, { id: "col-revisar", agora }).agenda;
		expect(destinoPadraoDeApagar(agenda, "col-revisar")).toBe("feito");
	});
});
