// @vitest-environment happy-dom
// As abas Tarefas e Quadro da agenda (ListaTarefas.tsx e QuadroTarefas.tsx) com uma
// agenda de teste e as ações da ponte trocadas por funções falsas: os grupos, a
// caixinha de feita, o campo de adicionar, o teclado, o arrasto e apagar uma coluna.
// O movimento e o visual são conferidos no Edge; aqui vão as ligações.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Agenda, agendaPadrao, criarTarefa } from "../../lib/agenda-tipos.ts";
import type { AcoesDaAgenda } from "./agenda-ponte.ts";
import type { PropsAbaAgenda } from "./agenda-tela.ts";
import { ListaTarefas } from "./ListaTarefas.tsx";
import { QuadroTarefas } from "./QuadroTarefas.tsx";

const HOJE = "2026-11-04";
const agora = new Date("2026-11-03T12:00:00Z");

/** A fazer: a1 (cálculo, atrasada), a2 (física, hoje), a3 (sem data). Fazendo: f1 (cálculo, sem data). Feito: d1. */
function agendaDeTeste(): Agenda {
	let agenda = agendaPadrao();
	const nova = (id: string, titulo: string, resto: { data?: string; hora?: string; materia?: string; coluna?: string; nota?: string }) => {
		agenda = criarTarefa(agenda, { titulo, ...resto }, { id, agora }).agenda;
	};
	nova("a1", "Resolver a lista 3", { data: "2026-11-01", materia: "calculo", nota: "Exercícios 4 a 9.\nSegunda linha" });
	nova("a2", "Ler o capítulo", { data: HOJE, hora: "14:00", materia: "fisica" });
	nova("a3", "Organizar os resumos", { coluna: "a-fazer" });
	nova("f1", "Revisar a prova", { coluna: "fazendo", materia: "calculo" });
	nova("d1", "Entregar o trabalho", { coluna: "feito", data: "2026-11-02" });
	return agenda;
}

let container: HTMLDivElement;
let root: Root;
const acoes = {
	criarTarefa: vi.fn(async () => ({})),
	editarTarefa: vi.fn(async () => ({})),
	moverTarefa: vi.fn(async () => ({})),
	apagarTarefa: vi.fn(async () => ({})),
	criarColuna: vi.fn(async () => ({})),
	renomearColuna: vi.fn(async () => ({})),
	reordenarColunas: vi.fn(async () => ({})),
	marcarFeito: vi.fn(async () => ({})),
	apagarColuna: vi.fn(async () => ({})),
};
const abrirTarefa = vi.fn();
const novaTarefa = vi.fn();
const matchMediaOriginal = window.matchMedia.bind(window);

beforeEach(() => {
	vi.stubGlobal("matchMedia", (query: string) => {
		const consulta = matchMediaOriginal(query);
		Object.defineProperty(consulta, "matches", { value: query.includes("prefers-reduced-motion") });
		return consulta;
	});
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	for (const funcao of Object.values(acoes)) funcao.mockClear();
	abrirTarefa.mockClear();
	novaTarefa.mockClear();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
});

const materias = [
	{ id: "calculo", nome: "Cálculo I", cor: "moss" as const },
	{ id: "fisica", nome: "Física", cor: "steel" as const },
];

function propsDeTeste(sobre: Partial<PropsAbaAgenda> = {}): PropsAbaAgenda {
	return { agenda: agendaDeTeste(), provas: [], materias, hoje: HOJE, acoes: acoes as unknown as AcoesDaAgenda, abrirTarefa, novaTarefa, ...sobre };
}

const desenhar = (componente: typeof ListaTarefas, props: PropsAbaAgenda) => act(() => root.render(createElement(componente, props)));

const achar = <E extends Element>(seletor: string, de: ParentNode = document): E => {
	const elemento = de.querySelector<E>(seletor);
	if (!elemento) throw new Error(`Não achei ${seletor}`);
	return elemento;
};
const texto = (seletor: string) => achar(seletor).textContent;

function digitar(campo: HTMLInputElement, valor: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(campo, valor);
		campo.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
const teclar = (alvo: Element, key: string, extra: KeyboardEventInit = {}) =>
	act(() => {
		alvo.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
	});
const clicar = (alvo: Element) =>
	act(() => {
		(alvo as HTMLElement).click();
	});

describe("a lista de tarefas", () => {
	it("agrupa por prazo, com as feitas recolhidas e a contagem", () => {
		desenhar(ListaTarefas, propsDeTeste());
		const titulos = Array.from(document.querySelectorAll(".lista-grupo__titulo")).map((item) => item.textContent);
		expect(titulos).toEqual(["Atrasadas1", "Hoje1", "Sem data2", "Feitas1"]);
		expect(document.body.textContent).toContain("Resolver a lista 3");
		expect(document.body.textContent).not.toContain("Entregar o trabalho");
		clicar(achar(".lista-grupo__alternar"));
		expect(document.body.textContent).toContain("Entregar o trabalho");
	});

	it("a linha mostra a data curta, a hora, a matéria e a coluna", () => {
		desenhar(ListaTarefas, propsDeTeste());
		const linha = Array.from(document.querySelectorAll(".lista-linha")).find((item) => item.textContent?.includes("Ler o capítulo"))!;
		expect(linha.textContent).toContain("4 nov, 14:00");
		expect(linha.textContent).toContain("Física");
		expect(linha.textContent).toContain("A fazer");
	});

	it("o filtro de matéria vale", () => {
		desenhar(ListaTarefas, propsDeTeste({ materia: "fisica" }));
		expect(document.body.textContent).toContain("Ler o capítulo");
		expect(document.body.textContent).not.toContain("Resolver a lista 3");
	});

	it("a caixinha manda a tarefa para a coluna de feito", () => {
		desenhar(ListaTarefas, propsDeTeste());
		clicar(achar('.lista-linha input[type="checkbox"]'));
		expect(acoes.moverTarefa).toHaveBeenCalledWith("a1", "feito");
	});

	it("clicar na linha abre a tarefa", () => {
		desenhar(ListaTarefas, propsDeTeste());
		clicar(achar(".lista-linha__abrir"));
		expect(abrirTarefa).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
	});

	it("Enter no campo cria na primeira coluna que não é de feito, com a matéria do filtro", async () => {
		desenhar(ListaTarefas, propsDeTeste({ materia: "calculo" }));
		const campo = achar<HTMLInputElement>('input[aria-label="Adicionar tarefa"]');
		digitar(campo, "  Estudar   limites ");
		await act(async () => {
			campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		expect(acoes.criarTarefa).toHaveBeenCalledWith({ titulo: "Estudar limites", coluna: "a-fazer", materia: "calculo" });
		expect(campo.value).toBe("");
	});

	it("um erro da extensão aparece embaixo do campo e o texto fica", async () => {
		acoes.criarTarefa.mockRejectedValueOnce(new Error("A agenda está ilegível."));
		desenhar(ListaTarefas, propsDeTeste());
		const campo = achar<HTMLInputElement>('input[aria-label="Adicionar tarefa"]');
		digitar(campo, "Algo");
		await act(async () => {
			campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		expect(document.body.textContent).toContain("A agenda está ilegível.");
		expect(campo.value).toBe("Algo");
	});

	it("título vazio: a frase de erro, sem mandar nada", async () => {
		desenhar(ListaTarefas, propsDeTeste());
		const campo = achar<HTMLInputElement>('input[aria-label="Adicionar tarefa"]');
		await act(async () => {
			campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		expect(document.body.textContent).toContain("Escreva o título da tarefa.");
		expect(acoes.criarTarefa).not.toHaveBeenCalled();
	});

	it("sem tarefas, um EmptyState", () => {
		desenhar(ListaTarefas, propsDeTeste({ agenda: agendaPadrao() }));
		expect(document.body.textContent).toContain("Nenhuma tarefa ainda");
	});
});

describe("o quadro", () => {
	it("uma coluna por coluna do quadro, com a contagem e a marca da de feito", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		const colunas = Array.from(document.querySelectorAll("[data-coluna]")).map((item) => item.getAttribute("data-coluna"));
		expect(colunas).toEqual(["a-fazer", "fazendo", "feito"]);
		expect(texto('[data-coluna="a-fazer"] .quadro-coluna__contagem')).toBe("3");
		expect(document.querySelectorAll('[data-coluna="feito"] .quadro-coluna__feito')).toHaveLength(1);
		expect(document.querySelectorAll('[data-coluna="fazendo"] .quadro-coluna__feito')).toHaveLength(0);
	});

	it("o cartão mostra a data, o rótulo do prazo, a matéria e a prévia da nota", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		const atrasada = achar('[data-cartao="a1"]');
		expect(atrasada.textContent).toContain("1 nov");
		expect(atrasada.textContent).toContain("atrasada");
		expect(atrasada.textContent).toContain("Cálculo I");
		expect(achar('[data-cartao="a1"] .quadro-cartao__nota').textContent).toBe("Exercícios 4 a 9.");
		expect(achar('[data-cartao="a2"]').textContent).toContain("hoje");
		// A feita não mostra o prazo.
		expect(achar('[data-cartao="d1"]').textContent).not.toContain("atrasada");
	});

	it("o filtro de matéria esconde as outras e a contagem mostra 'visíveis/total'", () => {
		desenhar(QuadroTarefas, propsDeTeste({ materia: "calculo" }));
		expect(document.querySelector('[data-cartao="a2"]')).toBeNull();
		expect(texto('[data-coluna="a-fazer"] .quadro-coluna__contagem')).toBe("1/3");
	});

	it("clicar no cartão abre a tarefa", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		clicar(achar('[data-cartao="a2"] .quadro-cartao'));
		expect(abrirTarefa).toHaveBeenCalledWith(expect.objectContaining({ id: "a2" }));
	});

	it("Alt+seta para a direita muda de coluna; Alt+seta para baixo muda o lugar; sem lugar, nada", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		const cartao = achar('[data-cartao="a1"] .quadro-cartao');
		teclar(cartao, "ArrowRight", { altKey: true });
		expect(acoes.moverTarefa).toHaveBeenLastCalledWith("a1", "fazendo", 0);
		teclar(cartao, "ArrowDown", { altKey: true });
		expect(acoes.moverTarefa).toHaveBeenLastCalledWith("a1", "a-fazer", 1);
		const antes = acoes.moverTarefa.mock.calls.length;
		teclar(cartao, "ArrowLeft", { altKey: true });
		teclar(cartao, "ArrowUp", { altKey: true });
		expect(acoes.moverTarefa.mock.calls.length).toBe(antes);
		// Sem Alt, a seta não move.
		teclar(cartao, "ArrowRight");
		expect(acoes.moverTarefa.mock.calls.length).toBe(antes);
	});

	it("Enter no cartão abre a tarefa", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		teclar(achar('[data-cartao="a3"] .quadro-cartao'), "Enter");
		expect(abrirTarefa).toHaveBeenCalledWith(expect.objectContaining({ id: "a3" }));
	});

	it("'+ Adicionar' abre o campo na coluna e Enter cria nela", async () => {
		desenhar(QuadroTarefas, propsDeTeste({ materia: "fisica" }));
		clicar(achar('[data-coluna="fazendo"] .quadro-coluna__pe button'));
		const campo = achar<HTMLInputElement>('[data-coluna="fazendo"] input');
		digitar(campo, "Problemas do capítulo 2");
		await act(async () => {
			campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		expect(acoes.criarTarefa).toHaveBeenCalledWith({ titulo: "Problemas do capítulo 2", coluna: "fazendo", materia: "fisica" });
	});

	it("'+ Nova coluna' cria com o nome", async () => {
		desenhar(QuadroTarefas, propsDeTeste());
		clicar(achar(".quadro-nova__botao"));
		const campo = achar<HTMLInputElement>('.quadro-nova input');
		digitar(campo, "  Em revisão ");
		await act(async () => {
			campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		expect(acoes.criarColuna).toHaveBeenCalledWith("Em revisão");
	});

	it("o menu da coluna: marcar como feito e mover para a direita", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		clicar(achar('[data-coluna="fazendo"] .quadro-coluna__menu-botao'));
		const itens = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
		expect(itens.map((item) => item.textContent)).toEqual(["Renomear", "Marcar como feito", "Mover para a esquerda", "Mover para a direita", "Apagar…"]);
		clicar(itens[1]!);
		expect(acoes.marcarFeito).toHaveBeenCalledWith("fazendo");
		clicar(achar('[data-coluna="fazendo"] .quadro-coluna__menu-botao'));
		clicar(Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))[3]!);
		expect(acoes.reordenarColunas).toHaveBeenCalledWith(["a-fazer", "feito", "fazendo"]);
	});

	it("Renomear abre o campo e Enter manda o nome", async () => {
		desenhar(QuadroTarefas, propsDeTeste());
		clicar(achar('[data-coluna="fazendo"] .quadro-coluna__menu-botao'));
		clicar(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')[0]!);
		const campo = achar<HTMLInputElement>('[data-coluna="fazendo"] .quadro-coluna__campo');
		digitar(campo, "Em andamento");
		await act(async () => {
			campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		expect(acoes.renomearColuna).toHaveBeenCalledWith("fazendo", "Em andamento");
		expect(document.querySelector('[data-coluna="fazendo"] .quadro-coluna__campo')).toBeNull();
	});

	it("duplo clique no nome também renomeia, e o erro da extensão aparece sem fechar o campo", async () => {
		acoes.renomearColuna.mockRejectedValueOnce(new Error('Já existe uma coluna "Feito".'));
		desenhar(QuadroTarefas, propsDeTeste());
		act(() => {
			achar('[data-coluna="fazendo"] .quadro-coluna__nome').dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		const campo = achar<HTMLInputElement>('[data-coluna="fazendo"] .quadro-coluna__campo');
		digitar(campo, "Feito");
		await act(async () => {
			campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		expect(texto('[data-coluna="fazendo"] .quadro-coluna__erro')).toContain('Já existe uma coluna "Feito".');
		expect(document.querySelector('[data-coluna="fazendo"] .quadro-coluna__campo')).not.toBeNull();
	});

	it("apagar uma coluna com tarefas pede o destino", async () => {
		desenhar(QuadroTarefas, propsDeTeste());
		clicar(achar('[data-coluna="a-fazer"] .quadro-coluna__menu-botao'));
		const apagar = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find((item) => item.textContent === "Apagar…")!;
		clicar(apagar);
		expect(document.body.textContent).toContain('Apagar a coluna "A fazer"?');
		expect(document.body.textContent).toContain("A coluna tem 3 tarefas.");
		const destino = achar<HTMLSelectElement>("select");
		expect(destino.value).toBe("fazendo");
		const confirmar = Array.from(document.querySelectorAll("button")).find((botao) => botao.textContent === "Apagar coluna")!;
		await act(async () => {
			confirmar.click();
		});
		expect(acoes.apagarColuna).toHaveBeenCalledWith("a-fazer", "fazendo");
	});

	it("a coluna de feito não oferece apagar", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		clicar(achar('[data-coluna="feito"] .quadro-coluna__menu-botao'));
		expect(Array.from(document.querySelectorAll('[role="menuitemradio"]')).map((item) => item.textContent)).toEqual(["Renomear", "Mover para a esquerda"]);
	});
});

describe("arrastar um cartão", () => {
	/** Põe caixas falsas nas colunas e nos cartões (o happy-dom não tem layout): colunas de 300 de largura, cartões de 80 de altura, 8 de vão. */
	function medir() {
		document.querySelectorAll<HTMLElement>("[data-coluna]").forEach((coluna, indice) => {
			const esquerda = indice * 316;
			coluna.getBoundingClientRect = () => ({ left: esquerda, right: esquerda + 300, top: 0, bottom: 600, width: 300, height: 600, x: esquerda, y: 0, toJSON() {} }) as DOMRect;
			coluna.querySelectorAll<HTMLElement>("[data-cartao]").forEach((cartao, posicao) => {
				const topo = 60 + posicao * 88;
				cartao.getBoundingClientRect = () => ({ left: esquerda, right: esquerda + 300, top: topo, bottom: topo + 80, width: 300, height: 80, x: esquerda, y: topo, toJSON() {} }) as DOMRect;
			});
		});
	}
	const ponteiro = (tipo: string, x: number, y: number, alvo: EventTarget = document) =>
		act(() => {
			const evento = new PointerEvent(tipo, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true });
			alvo.dispatchEvent(evento);
		});

	it("soltar numa coluna manda moverTarefa com a posição certa", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		medir();
		const cartao = achar('[data-cartao="a1"] .quadro-cartao');
		// a1 é o primeiro de A fazer. Pega no meio e leva para o começo de Fazendo (x 316 a 616; f1 tem o centro em y 100).
		ponteiro("pointerdown", 100, 100, cartao);
		ponteiro("pointermove", 400, 70);
		expect(document.querySelector(".quadro-cartao--fantasma")).not.toBeNull();
		expect(document.querySelector('[data-coluna="fazendo"].quadro-coluna--alvo')).not.toBeNull();
		expect(document.querySelector('[data-cartao="f1"].quadro-item--antes')).not.toBeNull();
		ponteiro("pointerup", 400, 70);
		expect(acoes.moverTarefa).toHaveBeenCalledWith("a1", "fazendo", 0);
		expect(document.querySelector(".quadro-cartao--fantasma")).toBeNull();
	});

	it("soltar depois do último cartão põe no fim da coluna", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		medir();
		ponteiro("pointerdown", 100, 100, achar('[data-cartao="a1"] .quadro-cartao'));
		ponteiro("pointermove", 400, 500);
		expect(document.querySelector('[data-cartao="f1"].quadro-item--depois')).not.toBeNull();
		ponteiro("pointerup", 400, 500);
		expect(acoes.moverTarefa).toHaveBeenCalledWith("a1", "fazendo", 1);
	});

	it("dentro da própria coluna, soltar no mesmo lugar não manda nada", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		medir();
		const cartao = achar('[data-cartao="a2"] .quadro-cartao');
		ponteiro("pointerdown", 100, 200, cartao);
		// a1 está em cima (centro 100), a3 embaixo (centro 276): y 200 fica entre eles, o lugar de a2.
		ponteiro("pointermove", 120, 200);
		ponteiro("pointerup", 120, 200);
		expect(acoes.moverTarefa).not.toHaveBeenCalled();
	});

	it("um movimento curto é um clique, não um arrasto", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		medir();
		ponteiro("pointerdown", 100, 100, achar('[data-cartao="a1"] .quadro-cartao'));
		ponteiro("pointermove", 102, 101);
		expect(document.querySelector(".quadro-cartao--fantasma")).toBeNull();
		ponteiro("pointerup", 102, 101);
		expect(acoes.moverTarefa).not.toHaveBeenCalled();
	});

	it("Esc cancela o arrasto", () => {
		desenhar(QuadroTarefas, propsDeTeste());
		medir();
		ponteiro("pointerdown", 100, 100, achar('[data-cartao="a1"] .quadro-cartao'));
		ponteiro("pointermove", 400, 70);
		teclar(document.body, "Escape");
		expect(document.querySelector(".quadro-cartao--fantasma")).toBeNull();
		ponteiro("pointerup", 400, 70);
		expect(acoes.moverTarefa).not.toHaveBeenCalled();
	});

	it("com o filtro de matéria, a posição é a do quadro inteiro", () => {
		let agenda = agendaDeTeste();
		agenda = criarTarefa(agenda, { titulo: "Outra de cálculo", coluna: "a-fazer", materia: "calculo" }, { id: "a4", agora }).agenda;
		// Em A fazer: a1 (cálculo), a2 (física, escondida), a3 (sem matéria, escondida), a4 (cálculo). Visíveis: a1, a4.
		desenhar(QuadroTarefas, propsDeTeste({ agenda, materia: "calculo" }));
		medir();
		// Arrasta f1 (cálculo, de Fazendo) para antes de a4 (o segundo cartão visível de A fazer, centro em y 148).
		ponteiro("pointerdown", 400, 100, achar('[data-cartao="f1"] .quadro-cartao'));
		ponteiro("pointermove", 100, 140);
		ponteiro("pointerup", 100, 140);
		expect(acoes.moverTarefa).toHaveBeenCalledWith("f1", "a-fazer", 3);
	});
});
