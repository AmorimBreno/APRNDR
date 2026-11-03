// @vitest-environment happy-dom
// As duas colunas da agenda no caderno: o calendário (a grade de dias, os pontinhos, o
// teclado, o dia escolhido) e a coluna de tarefas (a contagem, a lista do dia, as
// próximas por prazo, a caixinha de feita e o campo rápido).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Agenda, agendaPadrao, criarTarefa, moverTarefa } from "../../lib/agenda-tipos.ts";
import type { AgendaAberta } from "./agenda-ponte.ts";
import { itensDoIntervalo } from "./calendario-tela.ts";
import { CalendarioCompacto } from "./CalendarioCompacto.tsx";
import { contagemDeAbertas, proximasDaMateria, TarefasDoCaderno } from "./TarefasDoCaderno.tsx";

let container: HTMLDivElement;
let root: Root;
const matchMediaOriginal = window.matchMedia.bind(window);
const escolher = vi.fn();
const navegar = vi.fn();
const abrirTarefa = vi.fn();
const novaTarefa = vi.fn();
const moverTarefaDaPonte = vi.fn(async () => ({}));
const criarTarefaDaPonte = vi.fn(async () => ({}));

const HOJE = "2026-11-03";
const materias = [
	{ id: "calculo", nome: "Cálculo I", cor: "moss" as const },
	{ id: "fisica", nome: "Física", cor: "steel" as const },
];
const provas = [{ materia: "calculo", nome: "Cálculo I", cor: "moss" as const, prova: "P1", data: "2026-11-10" }];

function agendaDeTeste(): Agenda {
	let agenda = agendaPadrao();
	const entradas = [
		{ titulo: "Lista 3", data: "2026-11-10", hora: "14:00", materia: "calculo" },
		{ titulo: "Resumo", data: "2026-11-10", materia: "calculo" },
		{ titulo: "Outra", data: "2026-11-10", materia: "calculo" },
		{ titulo: "Mais uma", data: "2026-11-10", materia: "calculo" },
		{ titulo: "Hoje cedo", data: HOJE, hora: "08:00", materia: "calculo" },
		{ titulo: "Sem data", materia: "calculo" },
		{ titulo: "Atrasada", data: "2026-10-30", materia: "calculo" },
		{ titulo: "Feita", data: "2026-11-11", materia: "calculo" },
		{ titulo: "De física", data: HOJE, materia: "fisica" },
		{ titulo: "Amanhã cedo", data: "2026-11-04", materia: "calculo" },
	];
	for (const [indice, entrada] of entradas.entries()) {
		agenda = criarTarefa(agenda, entrada, { id: `t${indice}`, agora: new Date("2026-11-03T12:00:00Z") }).agenda;
	}
	return moverTarefa(agenda, "t7", "feito").agenda;
}

const ponteDeTeste = (agenda: Agenda | undefined = agendaDeTeste(), extra: Partial<AgendaAberta> = {}): AgendaAberta =>
	({
		...(agenda ? { agenda } : {}),
		provas,
		materias,
		moverTarefa: moverTarefaDaPonte,
		criarTarefa: criarTarefaDaPonte,
		fecharErro: vi.fn(),
		recarregar: vi.fn(),
		...extra,
	}) as unknown as AgendaAberta;

beforeEach(() => {
	// O happy-dom rejeita a promessa de uma animação nativa cancelada no unmount; aqui o movimento fica desligado.
	vi.stubGlobal("matchMedia", (query: string) => {
		const consulta = matchMediaOriginal(query);
		Object.defineProperty(consulta, "matches", { value: query.includes("prefers-reduced-motion") });
		return consulta;
	});
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	for (const simulada of [escolher, navegar, abrirTarefa, novaTarefa, moverTarefaDaPonte, criarTarefaDaPonte]) simulada.mockClear();
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
	vi.unstubAllGlobals();
});

async function clicar(elemento: Element) {
	await act(async () => (elemento as HTMLElement).click());
}
async function teclar(elemento: Element, key: string) {
	await act(async () => {
		elemento.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
	});
}

// --- O calendário ----------------------------------------------------------------------

async function renderizarCalendario(extra: Partial<Parameters<typeof CalendarioCompacto>[0]> = {}) {
	const agenda = agendaDeTeste();
	await act(async () =>
		root.render(
			createElement(CalendarioCompacto, {
				agenda,
				provas,
				materias,
				materiaId: "calculo",
				materia: { id: "calculo", nome: "Cálculo I", cor: "moss" } as never,
				hoje: HOJE,
				escolhido: HOJE,
				escolher,
				navegar,
				...extra,
			}),
		),
	);
}
const dia = (data: string) => container.querySelector<HTMLButtonElement>(`[data-dia="${data}"]`)!;
const pontosDe = (data: string) => dia(data).querySelectorAll(".cal-ponto").length;

describe("o calendário", () => {
	it("mostra o mês em seis semanas de sete dias, com hoje marcado e o escolhido pressionado", async () => {
		await renderizarCalendario({ escolhido: "2026-11-05" });
		expect(container.querySelector(".cal-compacto__titulo")!.textContent).toBe("Novembro de 2026");
		expect(container.querySelectorAll(".cal-compacto__linha:not(.cal-compacto__linha--cabeca)")).toHaveLength(6);
		expect(container.querySelectorAll("[data-dia]")).toHaveLength(42);
		expect(dia(HOJE).classList.contains("cal-dia--hoje")).toBe(true);
		expect(dia(HOJE).getAttribute("aria-current")).toBe("date");
		expect(dia("2026-11-05").getAttribute("aria-pressed")).toBe("true");
		expect(dia("2026-10-26").classList.contains("cal-dia--fora")).toBe(true);
	});

	it("põe até três pontinhos por dia e um +N com o resto; só as tarefas e provas da matéria entram", async () => {
		await renderizarCalendario();
		// Dia 10: a prova e quatro tarefas de Cálculo = 5 itens: 3 pontinhos e "+2".
		expect(pontosDe("2026-11-10")).toBe(3);
		expect(dia("2026-11-10").querySelector(".cal-dia__mais")!.textContent).toBe("+2");
		// Hoje tem a tarefa de Cálculo; a de Física fica de fora.
		expect(pontosDe(HOJE)).toBe(1);
		expect(dia(HOJE).querySelector(".cal-dia__mais")).toBeNull();
		expect(dia(HOJE).getAttribute("aria-label")).toBe("terça-feira, 3 de novembro, hoje, 1 item");
		// A prova leva o losango e a tarefa feita aparece apagada.
		expect(dia("2026-11-10").querySelector(".cal-ponto--prova")).not.toBeNull();
		expect(dia("2026-11-11").querySelector(".cal-ponto--feita")).not.toBeNull();
		expect(pontosDe("2026-11-12")).toBe(0);
	});

	it("clicar num dia o escolhe", async () => {
		await renderizarCalendario();
		await clicar(dia("2026-11-12"));
		expect(escolher).toHaveBeenCalledWith("2026-11-12");
	});

	it("só o dia escolhido entra na ordem do Tab, e as setas, Home, End e PageDown andam pelas datas", async () => {
		await renderizarCalendario();
		const focaveis = [...container.querySelectorAll<HTMLButtonElement>("[data-dia]")].filter((botao) => botao.tabIndex === 0);
		expect(focaveis.map((botao) => botao.dataset.dia)).toEqual([HOJE]);
		await teclar(dia(HOJE), "ArrowRight");
		expect(escolher).toHaveBeenLastCalledWith("2026-11-04");
		await teclar(dia(HOJE), "ArrowDown");
		expect(escolher).toHaveBeenLastCalledWith("2026-11-10");
		await teclar(dia(HOJE), "Home");
		expect(escolher).toHaveBeenLastCalledWith("2026-11-02");
		await teclar(dia(HOJE), "End");
		expect(escolher).toHaveBeenLastCalledWith("2026-11-08");
		await teclar(dia(HOJE), "PageDown");
		expect(escolher).toHaveBeenLastCalledWith("2026-12-03");
		// O mês acompanha o dia que a tecla escolheu.
		expect(container.querySelector(".cal-compacto__titulo")!.textContent).toBe("Dezembro de 2026");
	});

	it("as setas do mês trocam de mês e Hoje volta (e fica desligado quando já está em hoje)", async () => {
		await renderizarCalendario();
		const hoje = [...container.querySelectorAll<HTMLButtonElement>("button")].find((botao) => botao.textContent === "Hoje")!;
		expect(hoje.disabled).toBe(true);
		await clicar(container.querySelector('[aria-label="Próximo mês"]')!);
		expect(container.querySelector(".cal-compacto__titulo")!.textContent).toBe("Dezembro de 2026");
		expect(hoje.disabled).toBe(false);
		await clicar(hoje);
		expect(escolher).toHaveBeenLastCalledWith(HOJE);
		expect(container.querySelector(".cal-compacto__titulo")!.textContent).toBe("Novembro de 2026");
	});

	it("o botão Tela cheia leva ao calendário da matéria; sem agenda a grade abre sem pontinhos", async () => {
		await renderizarCalendario({ agenda: undefined as never });
		expect(container.querySelectorAll(".cal-ponto")).toHaveLength(0);
		await clicar(container.querySelector('[aria-label="Abrir o calendário em tela cheia"]')!);
		expect(navegar).toHaveBeenCalledWith("agenda/calendario/calculo");
	});
});

// --- A coluna de tarefas -----------------------------------------------------------------

async function renderizarTarefas(extra: Partial<Parameters<typeof TarefasDoCaderno>[0]> = {}) {
	const ponte = extra.ponte ?? ponteDeTeste();
	const escolhido = extra.escolhido ?? HOJE;
	const itensDoDia = ponte.agenda ? (itensDoIntervalo(ponte.agenda, provas, escolhido, escolhido, "calculo").get(escolhido) ?? []) : [];
	await act(async () =>
		root.render(
			createElement(TarefasDoCaderno, {
				ponte,
				materiaId: "calculo",
				materiaNome: "Cálculo I",
				hoje: HOJE,
				escolhido,
				itensDoDia,
				abrirTarefa,
				novaTarefa,
				navegar,
				...extra,
			}),
		),
	);
}
const texto = (seletor: string) => container.querySelector(seletor)?.textContent;
const linhas = (seletor: string) => [...container.querySelectorAll(`${seletor} .cal-item`)].map((item) => item.textContent);

describe("as funções da coluna de tarefas", () => {
	it("contagemDeAbertas fala em singular e plural", () => {
		expect(contagemDeAbertas(0)).toBe("Nenhuma aberta");
		expect(contagemDeAbertas(1)).toBe("1 aberta");
		expect(contagemDeAbertas(7)).toBe("7 abertas");
	});

	it("proximasDaMateria agrupa só as abertas da matéria por prazo", () => {
		const grupos = proximasDaMateria(agendaDeTeste(), HOJE, "calculo");
		expect(grupos.map((grupo) => [grupo.id, grupo.tarefas.map((tarefa) => tarefa.titulo)])).toEqual([
			["atrasadas", ["Atrasada"]],
			["hoje", ["Hoje cedo"]],
			["amanha", ["Amanhã cedo"]],
			// 10 de novembro é na semana que vem: sem hora primeiro, depois a das 14:00.
			["depois", ["Resumo", "Outra", "Mais uma", "Lista 3"]],
			["sem-data", ["Sem data"]],
		]);
	});
});

describe("a coluna de tarefas", () => {
	it("mostra o título com a contagem das abertas da matéria (a feita e as de outra matéria ficam de fora)", async () => {
		await renderizarTarefas();
		expect(texto(".tarefas-cad__titulo")).toBe("Tarefas");
		expect(texto(".tarefas-cad__conta")).toBe("8 abertas");
	});

	it("a lista do dia escolhido tem o título do dia, a prova com a etiqueta e as tarefas com caixinha", async () => {
		await renderizarTarefas({ escolhido: "2026-11-10" });
		expect(texto(".tarefas-cad__dia-titulo")).toBe("Terça-feira, 10 de novembro");
		const itens = linhas(".tarefas-cad__dia");
		expect(itens).toHaveLength(5);
		expect(itens[0]).toContain("Prova");
		expect(itens[0]).toContain("P1");
		// A prova vem antes; as sem hora vêm antes da das 14:00.
		expect(itens.at(-1)).toContain("14:00");
		expect(itens.at(-1)).toContain("Lista 3");
		expect(container.querySelectorAll(".tarefas-cad__dia .cal-item--prova input")).toHaveLength(0);
		expect(container.querySelectorAll(".tarefas-cad__dia input[type=checkbox]")).toHaveLength(4);
	});

	it("hoje usa 'Hoje, 3 de novembro' e um dia vazio diz que não tem nada", async () => {
		await renderizarTarefas();
		expect(texto(".tarefas-cad__dia-titulo")).toBe("Hoje, 3 de novembro");
		await renderizarTarefas({ escolhido: "2026-11-20" });
		expect(texto(".tarefas-cad__dia")).toContain("Nada marcado para este dia.");
	});

	it("as próximas ficam agrupadas por prazo, com a data nos grupos que não dizem o dia", async () => {
		await renderizarTarefas();
		const grupos = [...container.querySelectorAll(".tarefas-cad__grupo")].map((grupo) => grupo.getAttribute("aria-label"));
		expect(grupos).toEqual(["Atrasadas", "Hoje", "Amanhã", "Mais tarde", "Sem data"]);
		const atrasadas = container.querySelector('[aria-label="Atrasadas"]')!;
		expect(atrasadas.querySelector(".tarefas-cad__data--atrasada")!.textContent).toBe("30 out");
		expect(container.querySelector('[aria-label="Hoje"] .tarefas-cad__data')).toBeNull();
		expect(container.querySelector('[aria-label="Sem data"] .tarefas-cad__data')).toBeNull();
		expect(container.querySelector('[aria-label="Mais tarde"] .tarefas-cad__data')!.textContent).toBe("10 nov");
	});

	it("clicar numa tarefa abre o modal; Nova tarefa leva a data do dia e a matéria", async () => {
		await renderizarTarefas({ escolhido: "2026-11-10" });
		const abrir = [...container.querySelectorAll<HTMLButtonElement>(".tarefas-cad__dia .cal-item__abrir")].find((botao) => botao.textContent?.includes("Lista 3"))!;
		await clicar(abrir);
		expect(abrirTarefa.mock.calls[0]![0]).toMatchObject({ id: "t0", titulo: "Lista 3" });
		const nova = [...container.querySelectorAll<HTMLButtonElement>("button")].find((botao) => botao.textContent?.includes("Nova tarefa"))!;
		await clicar(nova);
		expect(novaTarefa).toHaveBeenCalledWith({ data: "2026-11-10", materia: "calculo" });
	});

	it("a caixinha move a tarefa para a coluna de feito (e a feita do dia volta para a primeira)", async () => {
		await renderizarTarefas({ escolhido: "2026-11-11" });
		const caixa = container.querySelector<HTMLInputElement>(".tarefas-cad__dia input[type=checkbox]")!;
		expect(caixa.checked).toBe(true);
		await clicar(caixa);
		expect(moverTarefaDaPonte).toHaveBeenCalledWith("t7", "a-fazer");
		await clicar(container.querySelector('.tarefas-cad__grupo[aria-label="Hoje"] input[type=checkbox]')!);
		expect(moverTarefaDaPonte).toHaveBeenLastCalledWith("t4", "feito");
	});

	it("os botões do cabeçalho levam à lista e ao quadro da matéria", async () => {
		await renderizarTarefas();
		await clicar(container.querySelector('[aria-label="Ver a lista de tarefas"]')!);
		expect(navegar).toHaveBeenLastCalledWith("agenda/tarefas/calculo");
		await clicar(container.querySelector('[aria-label="Ver o quadro de tarefas"]')!);
		expect(navegar).toHaveBeenLastCalledWith("agenda/quadro/calculo");
	});

	it("o campo rápido cria a tarefa com a matéria do caderno", async () => {
		await renderizarTarefas();
		const campo = container.querySelector<HTMLInputElement>('input[aria-label="Adicionar tarefa"]')!;
		await act(async () => {
			const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
			definir.call(campo, "  Revisar a lista 4 ");
			campo.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await teclar(campo, "Enter");
		expect(criarTarefaDaPonte).toHaveBeenCalledWith({ titulo: "Revisar a lista 4", coluna: "a-fazer", materia: "calculo" });
	});

	it("sem agenda ainda, mostra que está abrindo e não tem campo nem contagem", async () => {
		await renderizarTarefas({ ponte: ponteDeTeste(null as never) });
		expect(container.textContent).toContain("Abrindo a agenda…");
		expect(container.querySelector(".tarefas-cad__conta")).toBeNull();
		expect(container.querySelector('input[aria-label="Adicionar tarefa"]')).toBeNull();
	});

	it("mostra o erro da ponte e deixa fechá-lo", async () => {
		const ponte = ponteDeTeste(agendaDeTeste(), { erro: { chave: "e1", mensagem: "Não consegui mover a tarefa.", ao: "mover" } });
		await renderizarTarefas({ ponte });
		expect(texto(".agenda__erro")).toContain("Não consegui mover a tarefa.");
		await clicar(container.querySelector('[aria-label="Fechar o aviso"]')!);
		expect(ponte.fecharErro).toHaveBeenCalledWith("e1");
	});
});
