// @vitest-environment happy-dom
// Interação do calendário em tela cheia: as etiquetas e o "N mais", o clique e o
// duplo clique, o teclado da grade, a lista do dia, o filtro de matéria e a visão
// guardada.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Agenda, agendaPadrao, criarTarefa, moverTarefa, type ProvaDaAgenda } from "../../lib/agenda-tipos.ts";
import type { AcoesDaAgenda } from "./agenda-ponte.ts";
import type { PropsAbaAgenda } from "./agenda-tela.ts";
import { CHAVE_DA_VISAO } from "./calendario-cheio.ts";
import { CalendarioCheio } from "./CalendarioCheio.tsx";

let container: HTMLDivElement;
let root: Root;
const matchMediaOriginal = window.matchMedia.bind(window);
const abrirTarefa = vi.fn();
const novaTarefa = vi.fn();
const moverTarefaDaPonte = vi.fn(async () => ({}));

const materias = [
	{ id: "calculo", nome: "Cálculo I", cor: "moss" as const },
	{ id: "fisica", nome: "Física", cor: "steel" as const },
];
const provas: ProvaDaAgenda[] = [{ materia: "calculo", nome: "Cálculo I", cor: "moss", prova: "P1", data: "2026-11-10" }];

function agendaDeTeste(): Agenda {
	let agenda = agendaPadrao();
	const entradas = [
		{ titulo: "Lista 3", data: "2026-11-10", hora: "14:00", materia: "calculo" },
		{ titulo: "Resumo", data: "2026-11-10", materia: "fisica" },
		{ titulo: "Outra", data: "2026-11-10", materia: "fisica" },
		{ titulo: "Mais uma", data: "2026-11-10" },
		{ titulo: "Hoje cedo", data: "2026-11-03", hora: "08:00" },
		{ titulo: "Sem data", materia: "calculo" },
		{ titulo: "Atrasada", data: "2026-10-30", materia: "calculo" },
		{ titulo: "Feita", data: "2026-11-11", materia: "calculo" },
	];
	for (const [indice, entrada] of entradas.entries()) {
		agenda = criarTarefa(agenda, entrada, { id: `t${indice}`, agora: new Date("2026-11-03T12:00:00Z") }).agenda;
	}
	return moverTarefa(agenda, "t7", "feito").agenda;
}

const props = (extra: Partial<PropsAbaAgenda> = {}): PropsAbaAgenda => ({
	agenda: agendaDeTeste(),
	provas,
	materias,
	hoje: "2026-11-03",
	acoes: { moverTarefa: moverTarefaDaPonte } as unknown as AcoesDaAgenda,
	abrirTarefa,
	novaTarefa,
	...extra,
});

beforeEach(() => {
	// O happy-dom rejeita a promessa de uma animação nativa cancelada no unmount; aqui o movimento fica desligado.
	vi.stubGlobal("matchMedia", (query: string) => {
		const consulta = matchMediaOriginal(query);
		Object.defineProperty(consulta, "matches", { value: query.includes("prefers-reduced-motion") });
		return consulta;
	});
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	globalThis.localStorage?.clear();
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	abrirTarefa.mockClear();
	novaTarefa.mockClear();
	moverTarefaDaPonte.mockClear();
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
	vi.unstubAllGlobals();
});

async function renderizar(extra: Partial<PropsAbaAgenda> = {}) {
	await act(async () => root.render(createElement(CalendarioCheio, props(extra))));
}
const dia = (data: string, dentro: ParentNode = container.querySelector(".cal-cheio__grade")!) => dentro.querySelector<HTMLButtonElement>(`[data-dia="${data}"]`)!;
const celula = (data: string) => dia(data).closest<HTMLElement>(".cal-cheio__celula")!;
const etiquetasDe = (data: string) => [...celula(data).querySelectorAll(".cal-etq")].map((elemento) => elemento.textContent);
const titulo = () => container.querySelector(".cal-cheio__titulo")!.textContent;
const listaDoDia = () => [...container.querySelectorAll(".cal-cheio__lista-dia .cal-item")].map((item) => item.textContent);
const escolhida = () => container.querySelector<HTMLElement>(".cal-cheio__celula--escolhida [data-dia]")?.dataset.dia;
async function clicar(elemento: Element) {
	await act(async () => (elemento as HTMLElement).click());
}
async function teclar(elemento: Element, key: string) {
	await act(async () => {
		elemento.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
	});
}

describe("o mês", () => {
	it("abre em hoje, com o título do mês, as semanas, os dias de fora e as etiquetas", async () => {
		await renderizar();
		expect(titulo()).toBe("Novembro de 2026");
		expect(escolhida()).toBe("2026-11-03");
		expect(container.querySelectorAll(".cal-cheio__semana")).toHaveLength(6);
		expect(container.querySelector(".cal-cheio__celula--hoje [data-dia]")?.getAttribute("data-dia")).toBe("2026-11-03");
		expect(celula("2026-10-26").classList.contains("cal-cheio__celula--fora")).toBe(true);
		expect(etiquetasDe("2026-11-03")).toEqual(["08:00Hoje cedo"]);
		// Um dia de outubro na grade de novembro mostra os itens dele.
		expect(etiquetasDe("2026-10-30")).toEqual(["Atrasada"]);
	});

	it("o que não cabe vira N mais, e o N mais escolhe o dia", async () => {
		await renderizar();
		// Cinco itens no dia 10 (a prova, 14:00 e três sem hora) e capacidade 3 sem altura medida: duas etiquetas e "3 mais".
		expect(etiquetasDe("2026-11-10")).toEqual(["P1", "14:00Lista 3"]);
		const mais = celula("2026-11-10").querySelector<HTMLButtonElement>(".cal-cheio__mais")!;
		expect(mais.textContent).toBe("3 mais");
		await clicar(mais);
		expect(escolhida()).toBe("2026-11-10");
		expect(listaDoDia()).toHaveLength(5);
		expect(novaTarefa).not.toHaveBeenCalled();
	});

	it("a tarefa feita aparece riscada, a prova é só informação", async () => {
		await renderizar();
		expect(celula("2026-11-11").querySelector(".cal-etq--feita")).not.toBeNull();
		expect(celula("2026-11-10").querySelector(".cal-etq--prova")?.tagName).toBe("SPAN");
	});

	it("clicar numa etiqueta de tarefa abre o modal e não muda o dia escolhido", async () => {
		await renderizar();
		await clicar(celula("2026-11-03").querySelector(".cal-etq")!);
		expect(abrirTarefa).toHaveBeenCalledTimes(1);
		expect(abrirTarefa.mock.calls[0]![0]).toMatchObject({ id: "t4", titulo: "Hoje cedo" });
		expect(escolhida()).toBe("2026-11-03");
	});

	it("clicar no dia escolhe; duplo clique num lugar livre e o + abrem a tarefa nova com a data", async () => {
		await renderizar();
		await clicar(celula("2026-11-05"));
		expect(escolhida()).toBe("2026-11-05");
		await act(async () => {
			celula("2026-11-05").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		expect(novaTarefa).toHaveBeenLastCalledWith({ data: "2026-11-05" });
		await clicar(celula("2026-11-06").querySelector(".cal-cheio__novo")!);
		expect(novaTarefa).toHaveBeenLastCalledWith({ data: "2026-11-06" });
		// O duplo clique numa etiqueta não cria tarefa.
		novaTarefa.mockClear();
		await act(async () => {
			celula("2026-11-03").querySelector(".cal-etq")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		expect(novaTarefa).not.toHaveBeenCalled();
	});
});

describe("a navegação", () => {
	it("as setas trocam o mês e Hoje volta", async () => {
		await renderizar();
		const botao = (nome: string) => container.querySelector<HTMLButtonElement>(`.cal-cheio__navega button[aria-label='${nome}']`)!;
		await clicar(botao("Próximo mês"));
		expect(titulo()).toBe("Dezembro de 2026");
		expect(escolhida()).toBe("2026-12-03");
		await clicar(botao("Mês anterior"));
		await clicar(botao("Mês anterior"));
		expect(titulo()).toBe("Outubro de 2026");
		const hoje = [...container.querySelectorAll<HTMLButtonElement>(".cal-cheio__navega button")].find((item) => item.textContent === "Hoje")!;
		expect(hoje.disabled).toBe(false);
		await clicar(hoje);
		expect(titulo()).toBe("Novembro de 2026");
		expect(hoje.disabled).toBe(true);
	});

	it("o teclado da grade: setas movem o dia (com o foco), PageDown troca o mês e Enter abre a tarefa nova", async () => {
		await renderizar();
		await teclar(dia("2026-11-03"), "ArrowRight");
		expect(escolhida()).toBe("2026-11-04");
		expect(document.activeElement).toBe(dia("2026-11-04"));
		await teclar(dia("2026-11-04"), "ArrowDown");
		expect(escolhida()).toBe("2026-11-11");
		await teclar(dia("2026-11-11"), "PageDown");
		expect(titulo()).toBe("Dezembro de 2026");
		expect(escolhida()).toBe("2026-12-11");
		expect(document.activeElement).toBe(dia("2026-12-11"));
		await teclar(dia("2026-12-11"), "Enter");
		expect(novaTarefa).toHaveBeenLastCalledWith({ data: "2026-12-11" });
		// Só o dia escolhido entra na ordem do Tab.
		expect(dia("2026-12-11").tabIndex).toBe(0);
		expect(dia("2026-12-12").tabIndex).toBe(-1);
	});

	it("o minimês anda junto: clicar nele escolhe o dia e a grade segue", async () => {
		await renderizar();
		const mini = container.querySelector(".cal-cheio__mini-grade")!;
		await clicar(dia("2026-11-10", mini));
		expect(escolhida()).toBe("2026-11-10");
		expect(listaDoDia()).toHaveLength(5);
		await clicar(container.querySelector<HTMLButtonElement>(".cal-cheio__mini-setas button[aria-label='Próximo mês']")!);
		expect(titulo()).toBe("Dezembro de 2026");
		expect(container.querySelector(".cal-cheio__mini-titulo")?.textContent).toBe("Dezembro de 2026");
	});
});

describe("a visão Semana", () => {
	const trocar = async (nome: string) => {
		const aba = [...container.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((item) => item.textContent === nome)!;
		await clicar(aba);
	};

	it("troca de visão, guarda a escolha e mostra o título e os itens da semana inteira", async () => {
		await renderizar();
		await trocar("Semana");
		expect(globalThis.localStorage.getItem(CHAVE_DA_VISAO)).toBe("semana");
		expect(titulo()).toBe("2 a 8 de novembro");
		expect(container.querySelectorAll(".cal-cheio__semana")).toHaveLength(1);
		expect(container.querySelectorAll(".cal-cheio__grade [data-dia]")).toHaveLength(7);
		expect(etiquetasDe("2026-11-03")).toEqual(["08:00Hoje cedo"]);
	});

	it("a semana mostra todos os itens do dia (a prova, os com hora e os sem hora, nessa ordem), sem N mais", async () => {
		await renderizar();
		await trocar("Semana");
		await clicar(container.querySelector<HTMLButtonElement>(".cal-cheio__navega button[aria-label='Próxima semana']")!);
		expect(titulo()).toBe("9 a 15 de novembro");
		expect(etiquetasDe("2026-11-10")).toEqual(["P1", "14:00Lista 3", "Mais uma", "Outra", "Resumo"]);
		expect(container.querySelector(".cal-cheio__mais")).toBeNull();
	});

	it("PageDown troca de semana", async () => {
		await renderizar();
		await trocar("Semana");
		await teclar(dia("2026-11-03"), "PageDown");
		expect(escolhida()).toBe("2026-11-10");
		expect(titulo()).toBe("9 a 15 de novembro");
	});

	it("abre na visão que ficou guardada", async () => {
		globalThis.localStorage.setItem(CHAVE_DA_VISAO, "semana");
		await renderizar();
		expect(titulo()).toBe("2 a 8 de novembro");
		expect(container.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Semana");
	});
});

describe("a lateral", () => {
	it("a lista do dia: hoje, a hora e a tarefa abre o modal; Nova tarefa leva a data do dia", async () => {
		await renderizar();
		expect(container.querySelector(".cal-cheio__lista-titulo")?.textContent).toBe("Hoje, 3 de novembro");
		expect(listaDoDia()).toHaveLength(1);
		await clicar(container.querySelector<HTMLButtonElement>(".cal-cheio__lista-dia .cal-item__abrir")!);
		expect(abrirTarefa.mock.calls[0]![0]).toMatchObject({ id: "t4" });
		const nova = [...container.querySelectorAll<HTMLButtonElement>(".cal-cheio__lista-topo button")].find((item) => item.textContent?.includes("Nova tarefa"))!;
		await clicar(nova);
		expect(novaTarefa).toHaveBeenLastCalledWith({ data: "2026-11-03" });
	});

	it("a caixinha move a tarefa para a coluna de feito", async () => {
		await renderizar();
		await clicar(container.querySelector<HTMLInputElement>(".cal-cheio__lista-dia input[type=checkbox]")!);
		expect(moverTarefaDaPonte).toHaveBeenCalledWith("t4", "feito");
	});

	it("o dia sem nada diz que não há nada marcado; a prova leva a etiqueta Prova", async () => {
		await renderizar();
		await clicar(celula("2026-11-05"));
		expect(container.querySelector(".cal-cheio__lista-dia .cal-cheio__vazio")?.textContent).toBe("Nada marcado para este dia.");
		await clicar(celula("2026-11-10"));
		expect(container.querySelector(".cal-cheio__lista-dia .cal-item--prova")?.textContent).toContain("Prova");
	});

	it("Atrasadas e Sem data: só as abertas, clicáveis", async () => {
		await renderizar();
		const secoes = [...container.querySelectorAll(".cal-cheio__curta")].map((secao) => secao.getAttribute("aria-label"));
		expect(secoes).toEqual(["Atrasadas", "Sem data"]);
		const semData = container.querySelector(".cal-cheio__curta[aria-label='Sem data']")!;
		expect(semData.textContent).toContain("Sem data");
		await clicar(semData.querySelector("button")!);
		expect(abrirTarefa.mock.calls[0]![0]).toMatchObject({ id: "t5" });
		expect(container.querySelector(".cal-cheio__curta[aria-label='Atrasadas']")?.textContent).toContain("30/10");
	});
});

describe("o filtro de matéria", () => {
	it("mostra só as tarefas e as provas da matéria, na grade e na lateral", async () => {
		await renderizar({ materia: "fisica" });
		expect(etiquetasDe("2026-11-10")).toEqual(["Outra", "Resumo"]);
		expect(etiquetasDe("2026-11-03")).toEqual([]);
		await clicar(celula("2026-11-10"));
		expect(listaDoDia()).toHaveLength(2);
		// Nenhuma tarefa de Física sem data ou atrasada.
		expect(container.querySelector(".cal-cheio__curta")).toBeNull();
	});

	it("a prova de outra matéria some", async () => {
		await renderizar({ materia: "calculo" });
		expect(etiquetasDe("2026-11-10")).toEqual(["P1", "14:00Lista 3"]);
		await renderizar({ materia: "fisica" });
		expect(celula("2026-11-10").querySelector(".cal-etq--prova")).toBeNull();
	});
});
