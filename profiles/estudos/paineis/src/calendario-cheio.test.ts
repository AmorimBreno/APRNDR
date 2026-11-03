// As partes puras do calendário em tela cheia (calendario-cheio.ts): a visão
// guardada, a ordem dos itens do dia, o "N mais", os títulos, as setas e as teclas.

import { describe, expect, it } from "vitest";
import type { ItemCalendario } from "../../lib/agenda-tipos.ts";
import {
	CHAVE_DA_VISAO,
	capacidadeDaCelula,
	dataCurta,
	dataDoPasso,
	descricaoDoItem,
	ehVisao,
	guardarVisao,
	limitarLista,
	ordenarItensDoDia,
	resumoDoDia,
	teclaDaGrade,
	textoDoMais,
	tituloDaSemana,
	tituloDaVisao,
	VISAO_PADRAO,
	visaoGuardada,
} from "./calendario-cheio.ts";

const tarefa = (id: string, hora?: string, extra: Partial<ItemCalendario> = {}): ItemCalendario => ({
	tipo: "tarefa",
	data: "2026-11-03",
	titulo: `Tarefa ${id}`,
	id,
	feita: false,
	...(hora ? { hora } : {}),
	...extra,
});
const prova = (id: string): ItemCalendario => ({ tipo: "prova", data: "2026-11-03", titulo: id, materia: "calculo", id: `prova:calculo:2026-11-03:${id}` });

describe("a visão guardada", () => {
	const memoria = (inicial?: string) => {
		const guardados = new Map<string, string>(inicial === undefined ? [] : [[CHAVE_DA_VISAO, inicial]]);
		return { guardados, getItem: (chave: string) => guardados.get(chave) ?? null, setItem: (chave: string, valor: string) => void guardados.set(chave, valor) };
	};

	it("lembra a visão; sem nada guardado ou com lixo, a padrão", () => {
		expect(VISAO_PADRAO).toBe("mes");
		expect(visaoGuardada(memoria())).toBe("mes");
		expect(visaoGuardada(memoria("semana"))).toBe("semana");
		expect(visaoGuardada(memoria("dia"))).toBe("mes");
		const guardado = memoria();
		guardarVisao("semana", guardado);
		expect(guardado.guardados.get(CHAVE_DA_VISAO)).toBe("semana");
		expect(visaoGuardada(guardado)).toBe("semana");
	});

	it("sem localStorage, ou se ele falha, não quebra", () => {
		const quebrado = {
			getItem: () => {
				throw new Error("bloqueado");
			},
			setItem: () => {
				throw new Error("bloqueado");
			},
		};
		expect(visaoGuardada(quebrado)).toBe("mes");
		expect(() => guardarVisao("semana", quebrado)).not.toThrow();
		expect(visaoGuardada(undefined)).toBe("mes");
		expect(() => guardarVisao("semana", undefined)).not.toThrow();
	});

	it("só mes e semana valem", () => {
		expect(ehVisao("mes")).toBe(true);
		expect(ehVisao("semana")).toBe(true);
		expect(ehVisao("dia")).toBe(false);
		expect(ehVisao(null)).toBe(false);
	});
});

describe("a ordem dos itens do dia", () => {
	it("provas, depois as tarefas com hora em ordem de hora, depois as sem hora", () => {
		const itens = [tarefa("sem1"), tarefa("tarde", "14:00"), prova("P1"), tarefa("sem2"), tarefa("cedo", "08:30")];
		expect(ordenarItensDoDia(itens).map((item) => item.titulo)).toEqual(["P1", "Tarefa cedo", "Tarefa tarde", "Tarefa sem1", "Tarefa sem2"]);
	});

	it("não mexe na lista que recebeu e mantém a ordem de quem empata", () => {
		const itens = [tarefa("b", "10:00"), tarefa("a", "10:00")];
		const copia = [...itens];
		expect(ordenarItensDoDia(itens).map((item) => item.id)).toEqual(["b", "a"]);
		expect(itens).toEqual(copia);
		expect(ordenarItensDoDia([])).toEqual([]);
	});
});

describe("o N mais da célula", () => {
	const quatro = [tarefa("1"), tarefa("2"), tarefa("3"), tarefa("4")];

	it("cabendo todos, nada fica de fora", () => {
		expect(resumoDoDia(quatro, 4)).toEqual({ visiveis: quatro, escondidos: 0 });
		expect(resumoDoDia(quatro, 9).escondidos).toBe(0);
		expect(resumoDoDia([], 0)).toEqual({ visiveis: [], escondidos: 0 });
	});

	it("não cabendo, o N mais ocupa uma linha", () => {
		const resumo = resumoDoDia(quatro, 3);
		expect(resumo.visiveis.map((item) => item.id)).toEqual(["1", "2"]);
		expect(resumo.escondidos).toBe(2);
		expect(textoDoMais(resumo.escondidos)).toBe("2 mais");
	});

	it("com uma linha só, tudo vai para o N mais; sem nenhuma, também", () => {
		expect(resumoDoDia(quatro, 1)).toEqual({ visiveis: [], escondidos: 4 });
		expect(resumoDoDia(quatro, 0)).toEqual({ visiveis: [], escondidos: 4 });
		expect(resumoDoDia([tarefa("1")], 1)).toEqual({ visiveis: [tarefa("1")], escondidos: 0 });
	});
});

describe("quantas etiquetas cabem na célula", () => {
	const medidas = { cabeca: 30, etiqueta: 20, vao: 2, folga: 4 };

	it("conta as linhas que cabem depois da cabeça", () => {
		// 30 + 4 de cabeça e folga; sobram 66: 3 etiquetas de 20 com 2 de vão = 64.
		expect(capacidadeDaCelula(100, 3, medidas)).toBe(3);
		expect(capacidadeDaCelula(34 + 20, 3, medidas)).toBe(1);
		expect(capacidadeDaCelula(34 + 19, 3, medidas)).toBe(0);
		expect(capacidadeDaCelula(20, 3, medidas)).toBe(0);
	});

	it("sem altura conhecida, o padrão", () => {
		expect(capacidadeDaCelula(0, 3, medidas)).toBe(3);
		expect(capacidadeDaCelula(Number.NaN, 5, medidas)).toBe(5);
		expect(capacidadeDaCelula(-10)).toBe(3);
	});
});

describe("as listas curtas da lateral", () => {
	it("corta no máximo e diz quantas ficaram de fora", () => {
		expect(limitarLista([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({ mostradas: [1, 2, 3, 4, 5], restantes: 2 });
		expect(limitarLista([1, 2], 5)).toEqual({ mostradas: [1, 2], restantes: 0 });
		expect(limitarLista([], 5)).toEqual({ mostradas: [], restantes: 0 });
	});
});

describe("os títulos", () => {
	it("a semana dentro de um mês", () => {
		// 2026-11-03 é terça: a semana vai de 2 a 8 de novembro.
		expect(tituloDaSemana("2026-11-03")).toBe("2 a 8 de novembro");
		expect(tituloDaSemana("2026-11-02")).toBe("2 a 8 de novembro");
		expect(tituloDaSemana("2026-11-08")).toBe("2 a 8 de novembro");
	});

	it("a semana que cruza o mês e a que cruza o ano", () => {
		expect(tituloDaSemana("2026-10-30")).toBe("26 de outubro a 1 de novembro");
		expect(tituloDaSemana("2026-12-31")).toBe("28 de dezembro de 2026 a 3 de janeiro de 2027");
	});

	it("o título de cada visão", () => {
		expect(tituloDaVisao("mes", "2026-11-03")).toBe("Novembro de 2026");
		expect(tituloDaVisao("semana", "2026-11-03")).toBe("2 a 8 de novembro");
	});
});

describe("as setas e as teclas", () => {
	it("a seta anda um mês no Mês (sem passar do fim do mês) e uma semana na Semana", () => {
		expect(dataDoPasso("mes", "2026-11-03", 1)).toBe("2026-12-03");
		expect(dataDoPasso("mes", "2026-03-31", -1)).toBe("2026-02-28");
		expect(dataDoPasso("semana", "2026-11-03", 1)).toBe("2026-11-10");
		expect(dataDoPasso("semana", "2026-11-03", -1)).toBe("2026-10-27");
	});

	it("as setas do teclado andam o dia; PageUp e PageDown trocam o mês (e a semana na Semana)", () => {
		expect(teclaDaGrade("mes", "2026-11-03", "ArrowRight")).toBe("2026-11-04");
		expect(teclaDaGrade("mes", "2026-11-03", "ArrowDown")).toBe("2026-11-10");
		expect(teclaDaGrade("mes", "2026-11-03", "PageDown")).toBe("2026-12-03");
		expect(teclaDaGrade("mes", "2026-11-03", "PageUp")).toBe("2026-10-03");
		expect(teclaDaGrade("semana", "2026-11-03", "PageDown")).toBe("2026-11-10");
		expect(teclaDaGrade("semana", "2026-11-03", "PageUp")).toBe("2026-10-27");
		expect(teclaDaGrade("semana", "2026-11-03", "ArrowLeft")).toBe("2026-11-02");
		expect(teclaDaGrade("mes", "2026-11-03", "Enter")).toBeUndefined();
	});
});

describe("o item para o leitor de tela", () => {
	it("prova e tarefa, com hora, matéria e feita", () => {
		expect(descricaoDoItem(prova("P1"), "Cálculo I")).toBe("Prova P1, Cálculo I");
		expect(descricaoDoItem(tarefa("x", "14:00", { feita: true }), "Física")).toBe("Tarefa Tarefa x, 14:00, Física, feita");
		expect(descricaoDoItem(tarefa("y"))).toBe("Tarefa Tarefa y");
	});
});

describe("a data curta", () => {
	it("dia e mês com dois dígitos", () => {
		expect(dataCurta("2026-11-03")).toBe("03/11");
		expect(dataCurta("2026-12-25")).toBe("25/12");
	});
});
