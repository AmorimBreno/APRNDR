// @vitest-environment happy-dom
// As partes puras da linha do tempo (LinhaDoTempo.tsx): o agrupamento dos eventos por dia e as frases dos eventos da agenda.

import { describe, expect, it } from "vitest";
import type { Evento } from "../../lib/eventos.ts";
import { descreverEvento, porDia } from "./LinhaDoTempo.tsx";

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

function eventoDaAgenda(verbo: Evento["verbo"], objeto: Evento["objeto"], resultado?: Evento["resultado"]): Evento {
	return { id: "x", ts: "2026-11-03T12:00:00.000Z", verbo, objeto, ...(resultado ? { resultado } : {}) };
}
const tarefa = { materia: "calculo", tarefa: "t-1", titulo: "Lista 3" };

describe("descreverEvento: a agenda", () => {
	it("tarefa criada, com a coluna e a data no detalhe", () => {
		const { icone, texto, detalhe } = descreverEvento(eventoDaAgenda("criou_tarefa", tarefa, { coluna: "a-fazer", colunaNome: "A fazer", data: "2026-11-10", hora: "14:00" }));
		expect(icone).toBe("plus");
		expect(texto).toBe("Tarefa criada: Lista 3");
		expect(detalhe).toBe("para 10/11 às 14:00 · em A fazer");
		expect(descreverEvento(eventoDaAgenda("criou_tarefa", tarefa, { coluna: "a-fazer", colunaNome: "A fazer" })).detalhe).toBe("em A fazer");
	});

	it("tarefa editada: só os campos que mudaram, com o valor de antes", () => {
		const evento = eventoDaAgenda("editou_tarefa", tarefa, {
			mudou: { titulo: "Lista 4", data: "2026-11-12", hora: null, nota: "nova" },
			antes: { titulo: "Lista 3", data: "2026-11-10", hora: "14:00" },
		});
		const { texto, detalhe } = descreverEvento(evento);
		expect(texto).toBe("Tarefa editada: Lista 3");
		expect(detalhe).toBe("título: Lista 3 → Lista 4 · data: 10/11 → 12/11 · hora: 14:00 → sem hora · nota alterada");
		expect(descreverEvento(eventoDaAgenda("editou_tarefa", tarefa, { mudou: { nota: null }, antes: { nota: "x" } })).detalhe).toBe("nota apagada");
		expect(descreverEvento(eventoDaAgenda("editou_tarefa", tarefa, { mudou: { materia: null }, antes: { materia: "calculo" } })).detalhe).toBe("matéria: calculo → sem matéria");
	});

	it("mover, concluir e reabrir mostram o caminho entre as colunas", () => {
		const resultado = { de: "a-fazer", deNome: "A fazer", para: "feito", paraNome: "Feito" };
		expect(descreverEvento(eventoDaAgenda("moveu_tarefa", tarefa, resultado))).toMatchObject({ icone: "arrow-right", texto: "Tarefa movida: Lista 3", detalhe: "A fazer → Feito" });
		expect(descreverEvento(eventoDaAgenda("concluiu_tarefa", tarefa, resultado))).toMatchObject({ icone: "check", texto: "Tarefa concluída: Lista 3", detalhe: "A fazer → Feito" });
		expect(descreverEvento(eventoDaAgenda("reabriu_tarefa", tarefa, { de: "feito", deNome: "Feito", para: "a-fazer", paraNome: "A fazer" }))).toMatchObject({
			texto: "Tarefa reaberta: Lista 3",
			detalhe: "Feito → A fazer",
		});
	});

	it("tarefa apagada", () => {
		const { icone, texto, detalhe } = descreverEvento(eventoDaAgenda("apagou_tarefa", tarefa, { coluna: "feito", colunaNome: "Feito", concluida: true, data: "2026-11-10" }));
		expect(icone).toBe("close");
		expect(texto).toBe("Tarefa apagada: Lista 3");
		expect(detalhe).toBe("estava em Feito · já concluída · era para 10/11");
	});

	it("sem título no evento, ainda diz que foi uma tarefa", () => {
		expect(descreverEvento(eventoDaAgenda("criou_tarefa", {})).texto).toBe("Tarefa criada: uma tarefa");
	});

	it("o quadro: uma frase por ação", () => {
		const quadro = { quadro: "agenda", coluna: "col-1", nome: "Revisar" };
		expect(descreverEvento(eventoDaAgenda("alterou_quadro", quadro, { acao: "criou_coluna", posicao: 1 }))).toMatchObject({ texto: "Coluna criada: Revisar", detalhe: "posição 2" });
		expect(descreverEvento(eventoDaAgenda("alterou_quadro", quadro, { acao: "renomeou_coluna", de: "Fazendo", para: "Revisar" }))).toMatchObject({
			texto: "Coluna renomeada: Revisar",
			detalhe: "antes: Fazendo",
		});
		expect(descreverEvento(eventoDaAgenda("alterou_quadro", { quadro: "agenda" }, { acao: "reordenou_colunas", antes: ["a"], depois: ["b"] })).texto).toBe("Colunas reordenadas");
		expect(descreverEvento(eventoDaAgenda("alterou_quadro", quadro, { acao: "marcou_feito", anterior: "feito", concluidas: 2, reabertas: 1 }))).toMatchObject({
			texto: "Coluna de feito: Revisar",
			detalhe: "2 tarefas concluídas · 1 tarefa reaberta",
		});
		expect(descreverEvento(eventoDaAgenda("alterou_quadro", quadro, { acao: "apagou_coluna", destino: "a-fazer", destinoNome: "A fazer", movidas: ["t1", "t2"] }))).toMatchObject({
			texto: "Coluna apagada: Revisar",
			detalhe: "2 tarefas foram para A fazer",
		});
		expect(descreverEvento(eventoDaAgenda("alterou_quadro", quadro, { acao: "apagou_coluna", movidas: [] })).detalhe).toBeUndefined();
		expect(descreverEvento(eventoDaAgenda("alterou_quadro", quadro)).texto).toBe("Quadro alterado");
	});
});
