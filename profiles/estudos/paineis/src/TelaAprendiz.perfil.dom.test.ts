// @vitest-environment happy-dom
// As abas Hipóteses e Histórico da tela "Perfil do aprendiz" (AbaHipoteses.tsx, AbaHistorico.tsx) com uma janela falsa em
// que a ponte responde como o contrato (lib/hipoteses-tipos.ts): as seções e a ordem, aprovar, editar (modal) e rejeitar
// mandando a ação certa e voltando pelo `decidida`, os botões desligados sem mudar a estrutura do cartão, "Salvando…" e
// "Refletindo…" só depois de 1 s, o erro no cartão, a linha da última reflexão, o aviso do conflito, a ficha de evidência
// que leva ao Histórico com o evento destacado, o filtro de matéria e de tipo, e as trocas de aba que não remontam o
// cabeçalho. O visual e os quadros da troca são conferidos no Edge; aqui vão as ligações e a estrutura.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	conceitoDeTeste,
	estadoDeTeste,
	eventoDeTeste,
	hipoteseDeTeste,
	hipotesesVariadas,
	indicadoresDeTeste,
	MATERIAS_DE_TESTE,
	mudancaDeTeste,
	resumoDeTeste,
	tsLocal,
} from "./aprendiz-fixtures.ts";
import { PAINEL_APRENDIZ } from "./aprendiz-ponte.ts";
import { type PropsTelaAprendiz, TelaAprendiz } from "./TelaAprendiz.tsx";
import type { EstadoHipoteses } from "../../lib/hipoteses-tipos.ts";
import type { EventoLido } from "./aprendiz-historico-tela.ts";

let container: HTMLDivElement;
let root: Root;
let pedir: ReturnType<typeof vi.fn>;
let acoesFalsas: { acaoDaInterface: ReturnType<typeof vi.fn> };
let recebidas: AcaoRecebida[];
let sessao: string;
let contador = 0;
const navegar = vi.fn();
const matchMediaOriginal = window.matchMedia.bind(window);
const rolagens: Element[] = [];

const janelaFalsa = (): JanelaPerfilHook =>
	({
		estado: { sessao: { sessaoId: sessao }, acoesPorPainel: { [PAINEL_APRENDIZ]: recebidas } },
		conexao: "aberta",
		acoes: acoesFalsas,
	}) as unknown as JanelaPerfilHook;

let extras: Partial<PropsTelaAprendiz> = {};
const desenhar = () =>
	act(() => {
		root.render(
			createElement(TelaAprendiz, {
				perfilId: "estudos",
				caminho: "aprendiz/hipoteses",
				navegar,
				abrirConversa: vi.fn(),
				voltar: vi.fn(),
				janela: janelaFalsa(),
				aba: "hipoteses",
				materias: MATERIAS_DE_TESTE,
				...extras,
			}),
		);
	});

/** A extensão responde: uma ação nova na lista da ponte. */
const responde = (acao: string, dados: unknown) => {
	recebidas = [...recebidas, { chave: `r${++contador}`, acao, dados }];
	desenhar();
};
const respondeHipoteses = (estado: EstadoHipoteses = hipotesesVariadas()) => responde("hipoteses", { estado });
const respondeHistorico = (eventos: EventoLido[] = eventosPadrao()) => responde("historico", { eventos });

/** Três eventos: duas respostas de Cálculo (as de e-1 e e-3, a última de Física) e uma autoavaliação. */
function eventosPadrao(): EventoLido[] {
	return [
		eventoDeTeste({ id: "e-1", ts: tsLocal(10, 14, 32), objeto: { materia: "calculo", conceitos: ["derivadas"] }, resultado: { correta: false } }),
		eventoDeTeste({ id: "e-2", ts: tsLocal(10, 10, 5), verbo: "autoavaliou_conceito", objeto: { materia: "calculo", conceitos: ["derivadas"] }, resultado: { nivel: 3 } }),
		eventoDeTeste({ id: "e-3", ts: tsLocal(9, 18, 0), objeto: { materia: "fisica", conceitos: ["series"] }, resultado: { correta: true } }),
	];
}
/** Abre a aba Hipóteses e responde os dois pedidos. */
const abrirHipoteses = (estado: EstadoHipoteses = hipotesesVariadas(), eventos: EventoLido[] = eventosPadrao()) => {
	desenhar();
	respondeHipoteses(estado);
	respondeHistorico(eventos);
};

beforeEach(() => {
	vi.stubGlobal("matchMedia", (query: string) => {
		const consulta = matchMediaOriginal(query);
		Object.defineProperty(consulta, "matches", { value: query.includes("prefers-reduced-motion") });
		return consulta;
	});
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 10, 11, 15, 0));
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	rolagens.length = 0;
	Element.prototype.scrollIntoView = function (this: Element) {
		rolagens.push(this);
	};
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	pedir = vi.fn(async () => {});
	acoesFalsas = { acaoDaInterface: pedir };
	recebidas = [];
	sessao = "s1";
	extras = {};
	navegar.mockClear();
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const achar = <E extends Element>(seletor: string, dentro: ParentNode = container): E => {
	const elemento = dentro.querySelector<E>(seletor);
	if (!elemento) throw new Error(`Não achei ${seletor}`);
	return elemento;
};
const todos = <E extends Element>(seletor: string, dentro: ParentNode = container): E[] => [...dentro.querySelectorAll<E>(seletor)];
const clicar = (alvo: Element) =>
	act(() => {
		(alvo as HTMLElement).click();
	});
const cartao = (id: string) => achar<HTMLElement>(`[data-hipotese="${id}"]`);
const cartaoDaMudanca = (id: string) => achar<HTMLElement>(`[data-mudanca="${id}"]`);
const evento = (id: string) => achar<HTMLElement>(`[data-evento="${id}"]`);
/** O botão pelo texto de repouso (o primeiro dos dois textos que o RotuloEstado deixa no lugar). */
const botao = (dentro: ParentNode, texto: string): HTMLButtonElement => {
	const achado = todos<HTMLButtonElement>("button", dentro).find((b) => (b.querySelector(".rotulo-estado__texto")?.textContent ?? b.textContent) === texto);
	if (!achado) throw new Error(`Não achei o botão ${texto}`);
	return achado;
};
const botoesDe = (dentro: ParentNode) => todos<HTMLButtonElement>(".apz-acoes button", dentro).map((b) => b.querySelector(".rotulo-estado__texto")?.textContent);
const secoes = () => todos<HTMLElement>(".apz-secao").map((s) => s.getAttribute("data-secao"));
const idsDaSecao = (id: string) => todos<HTMLElement>(`[data-secao="${id}"] .apz-hip`).map((c) => c.getAttribute("data-hipotese") ?? c.getAttribute("data-mudanca"));
const enviadas = (acao: string) => pedir.mock.calls.filter((chamada) => chamada[1] === acao).map((chamada) => chamada[2] as Record<string, unknown>);
const ultimoPedido = (acao: string) => String(enviadas(acao).at(-1)?.pedido);
/** A forma do elemento (tags e classes); o lugar do erro ao lado dos botões e o modificador de erro valem como o mesmo lugar. */
const estrutura = (elemento: Element) =>
	[...elemento.querySelectorAll("*")]
		.map((e) => `${e.tagName}.${String(e.getAttribute("class") ?? "").replace(" apz-reflexao__texto--erro", "")}`)
		.join("|")
		.replace(/SPAN\.apz-acoes__espaco|P\.apz-acoes__erro body-sm/, "LUGAR-DO-ERRO");
const escrever = (campo: HTMLTextAreaElement, valor: string) =>
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(campo, valor);
		campo.dispatchEvent(new Event("input", { bubbles: true }));
	});
const textoDosRotulos = (b: Element) => todos(".rotulo-estado__texto", b).map((t) => ({ texto: t.textContent, oculto: t.hasAttribute("data-oculto") }));

describe("as abas e o pedido", () => {
	it("as três abas, a de Hipóteses escolhida; trocar de aba navega para a rota dela (com a matéria do filtro)", () => {
		abrirHipoteses();
		const abas = todos('[role="tab"]');
		expect(abas.map((aba) => aba.textContent)).toEqual(["Indicadores", "Hipóteses", "Histórico"]);
		expect(abas[1]?.getAttribute("aria-selected")).toBe("true");
		clicar(abas[2]!);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/historico");
		extras = { materia: "calculo" };
		desenhar();
		clicar(todos('[role="tab"]')[0]!);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/indicadores/calculo");
	});

	it("ao abrir a aba pede `hipoteses` e `historico`, e os indicadores (os nomes dos conceitos) logo na montagem", () => {
		desenhar();
		expect(enviadas("hipoteses")).toEqual([{}]);
		expect(enviadas("historico")).toEqual([{}]);
		expect(enviadas("indicadores")).toEqual([{}]);
	});

	it("a aba Indicadores não pede hipóteses nem histórico", () => {
		extras = { aba: "indicadores" };
		desenhar();
		expect(enviadas("indicadores")).toEqual([{}]);
		expect(enviadas("hipoteses")).toEqual([]);
		expect(enviadas("historico")).toEqual([]);
	});

	it("trocar de aba pede de novo (a de Histórico também pede as hipóteses para o botão de voltar) sem remontar o cabeçalho", () => {
		abrirHipoteses();
		const cabecalho = achar("header");
		const seletor = achar('[role="tablist"]');
		pedir.mockClear();
		extras = { aba: "historico" };
		desenhar();
		expect(achar("header")).toBe(cabecalho);
		expect(achar('[role="tablist"]')).toBe(seletor);
		expect(enviadas("hipoteses")).toHaveLength(1);
		expect(enviadas("historico")).toHaveLength(1);
		extras = { aba: "indicadores" };
		desenhar();
		expect(achar("header")).toBe(cabecalho);
		expect(achar<HTMLElement>("main").getAttribute("role")).toBe("tabpanel");
	});

	it("o filtro de matéria navega para a rota da aba atual; trocar o filtro não remonta o cabeçalho nem os cartões que continuam", () => {
		desenhar();
		responde("indicadores", { indicadores: indicadoresDeTeste([conceitoDeTeste({ conceito: "a" }), conceitoDeTeste({ conceito: "b", materia: "fisica" })]) });
		respondeHipoteses();
		respondeHistorico();
		const cabecalho = achar("header");
		const select = achar<HTMLSelectElement>("header select");
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "fisica");
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/hipoteses/fisica");
		clicar(achar('[data-secao="expiradas"] .apz-secao__alternar'));
		const global = cartao("h-d");
		extras = { materia: "fisica" };
		desenhar();
		expect(achar("header")).toBe(cabecalho);
		expect(cartao("h-d")).toBe(global);
		expect(achar(".ap-cbar__kicker").textContent).toBe("Física");
	});
});

describe("as seções e a ordem", () => {
	it("Esperando, Aprovadas, Rejeitadas e Expiradas nesta ordem; as duas últimas recolhidas", () => {
		abrirHipoteses();
		expect(secoes()).toEqual(["esperando", "aprovadas", "rejeitadas", "expiradas"]);
		expect(todos(".apz-secao__nome").map((n) => n.textContent)).toEqual(["Esperando a sua decisão", "Aprovadas", "Rejeitadas", "Expiradas"]);
		expect(todos(".apz-secao__conta").map((n) => n.textContent)).toEqual(["2", "1", "1", "1"]);
		expect(idsDaSecao("esperando")).toEqual(["h-a", "m-1"]);
		expect(idsDaSecao("aprovadas")).toEqual(["h-b"]);
		expect(idsDaSecao("rejeitadas")).toEqual([]);
		expect(idsDaSecao("expiradas")).toEqual([]);
		const alternar = todos<HTMLButtonElement>(".apz-secao__alternar[aria-expanded]");
		expect(alternar.map((b) => b.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
	});

	it("abrir uma seção recolhida mostra os cartões dela; fechar esconde", () => {
		abrirHipoteses();
		const botaoRejeitadas = achar<HTMLButtonElement>('[data-secao="rejeitadas"] .apz-secao__alternar');
		clicar(botaoRejeitadas);
		expect(botaoRejeitadas.getAttribute("aria-expanded")).toBe("true");
		expect(idsDaSecao("rejeitadas")).toEqual(["h-c"]);
		expect(botoesDe(cartao("h-c"))).toEqual(["Aprovar de novo"]);
		clicar(botaoRejeitadas);
		expect(idsDaSecao("rejeitadas")).toEqual([]);
	});

	it("o filtro de matéria vale para as hipóteses (as globais valem em toda matéria) e para as mudanças", () => {
		extras = { materia: "fisica" };
		abrirHipoteses();
		expect(secoes()).toEqual(["esperando", "aprovadas", "rejeitadas", "expiradas"]);
		expect(idsDaSecao("esperando")).toEqual([]);
		expect(achar('[data-secao="esperando"]').textContent).toContain("Nada esperando pela sua decisão.");
		expect(achar('[data-secao="aprovadas"]').textContent).toContain("Nenhuma hipótese aprovada ainda.");
		clicar(achar('[data-secao="rejeitadas"] .apz-secao__alternar'));
		clicar(achar('[data-secao="expiradas"] .apz-secao__alternar'));
		expect(idsDaSecao("rejeitadas")).toEqual(["h-c"]);
		expect(idsDaSecao("expiradas")).toEqual(["h-d"]);
	});

	it("sem hipótese nenhuma, o EmptyState explica o Refletir e que nada entra sem aprovação", () => {
		abrirHipoteses(estadoDeTeste([]));
		expect(container.textContent).toContain("Ainda não há hipóteses");
		expect(container.textContent).toContain("nada entra no seu perfil sem a sua aprovação");
		expect(container.querySelector(".apz-secao")).toBeNull();
		expect(botao(container, "Refletir")).toBeDefined();
	});

	it("uma matéria sem nenhuma hipótese que a alcance mostra o vazio dela, não o geral", () => {
		extras = { materia: "quimica" };
		abrirHipoteses(estadoDeTeste([hipoteseDeTeste({ id: "h-1", escopo: { nivel: "materia", materia: "calculo" } })]));
		expect(container.textContent).toContain("Sem hipóteses em esta matéria");
		expect(container.textContent).not.toContain("Ainda não há hipóteses");
	});
});

describe("o cartão de uma hipótese", () => {
	it("o enunciado, o tipo, o escopo com os nomes, a confiança escrita e com marcador, a validade, a versão e as evidências", () => {
		desenhar();
		responde("indicadores", { indicadores: indicadoresDeTeste([conceitoDeTeste({ conceito: "derivadas", nome: "Derivadas" })]) });
		respondeHipoteses();
		respondeHistorico();
		const h = cartao("h-a");
		expect(achar(".apz-hip__enunciado", h).textContent).toBe("Proposta de derivadas.");
		expect(achar(".apz-hip__tipo", h).textContent).toBe("Concepção errada");
		expect(achar(".apz-hip__escopo", h).textContent).toBe("Derivadas · Cálculo I");
		expect(achar(".apz-hip__confianca dd", h).textContent).toBe("média");
		expect(achar<HTMLElement>(".apz-nivel", h).dataset.nivel).toBe("2");
		expect(achar(".apz-hip__validade dd", h).textContent).toBe("Até 08/01/2027");
		expect(achar(".apz-hip__versao dd", h).textContent).toBe("1");
		expect(achar(".apz-hip__conta", h).textContent).toBe("2 a favor · 1 contra");
		expect(todos(".apz-fichas--favor .apz-ev", h).map((f) => f.textContent)).toEqual(["Respondeu uma questão · 10/11", "Autoavaliou o conceito · 10/11"]);
		expect(todos(".apz-fichas--contra .apz-ev", h).map((f) => f.textContent)).toEqual(["Respondeu uma questão · 09/11"]);
		expect(achar<HTMLElement>(".apz-nivel", cartao("h-b")).dataset.nivel).toBe("3");
		expect(achar(".apz-hip__escopo", cartao("h-b")).textContent).toBe("Cálculo I");
	});

	it("o escopo global e a matéria que a lista não tem mais", () => {
		abrirHipoteses(estadoDeTeste([hipoteseDeTeste({ id: "h-1", escopo: { nivel: "global" } }), hipoteseDeTeste({ id: "h-2", escopo: { nivel: "materia", materia: "quimica" } })]));
		expect(achar(".apz-hip__escopo", cartao("h-1")).textContent).toBe("Todas as matérias");
		expect(achar(".apz-hip__escopo", cartao("h-2")).textContent).toBe("matéria removida");
	});

	it("os botões de cada status: proposta (Aprovar, Editar, Rejeitar), aprovada (Editar, Rejeitar), rejeitada e expirada (Aprovar de novo)", () => {
		abrirHipoteses();
		clicar(achar('[data-secao="rejeitadas"] .apz-secao__alternar'));
		clicar(achar('[data-secao="expiradas"] .apz-secao__alternar'));
		expect(botoesDe(cartao("h-a"))).toEqual(["Aprovar", "Editar", "Rejeitar"]);
		expect(botoesDe(cartao("h-b"))).toEqual(["Editar", "Rejeitar"]);
		expect(botoesDe(cartao("h-c"))).toEqual(["Aprovar de novo"]);
		expect(botoesDe(cartao("h-d"))).toEqual(["Aprovar de novo"]);
	});

	it("a proposta que voltou da aprovação pelo conflito mostra o aviso; a proposta nova não", () => {
		const estado = estadoDeTeste([
			hipoteseDeTeste({ id: "h-conflito", status: "proposta", aprovadaPeloUsuario: true, anteriores: [{ versao: 1, enunciado: "x", status: "aprovada", ts: tsLocal(5) }] }),
			hipoteseDeTeste({ id: "h-nova", status: "proposta" }),
		]);
		abrirHipoteses(estado);
		expect(achar(".apz-hip__aviso", cartao("h-conflito")).textContent).toBe("Voltou para a sua revisão: as evidências contra recentes superam as a favor");
		expect(cartao("h-nova").querySelector(".apz-hip__aviso")).toBeNull();
	});

	it("o cartão de uma mudança mostra o diff, o motivo, a hipótese dela, as evidências e Aprovar/Rejeitar", () => {
		abrirHipoteses();
		const m = cartaoDaMudanca("m-1");
		expect(achar(".apz-hip__diff", m).textContent).toBe("Reforçar: +2 eventos a favor");
		expect(achar(".apz-hip__motivo", m).textContent).toBe("Motivo: Dois eventos novos apontam o mesmo erro.");
		expect(achar(".apz-hip__contexto", m).textContent).toBe("Hipótese: Aprovada sobre limites.");
		expect(todos(".apz-fichas--favor .apz-ev", m)).toHaveLength(2);
		expect(botoesDe(m)).toEqual(["Aprovar", "Rejeitar"]);
	});

	it("a mudança de enfraquecer pões as evidências do lado contra; expirar não traz fichas; a hipótese removida é dita", () => {
		abrirHipoteses(
			estadoDeTeste(
				[hipoteseDeTeste({ id: "h-1", status: "aprovada" })],
				[mudancaDeTeste({ id: "m-e", hipotese: "h-1", acao: "enfraquecer", evidencias: ["e-1"] }), mudancaDeTeste({ id: "m-x", hipotese: "h-1", acao: "expirar" }), mudancaDeTeste({ id: "m-o", hipotese: "h-sumiu" })],
			),
		);
		expect(achar(".apz-hip__diff", cartaoDaMudanca("m-e")).textContent).toBe("Enfraquecer: +1 evento contra");
		expect(cartaoDaMudanca("m-e").querySelector(".apz-fichas--contra")).not.toBeNull();
		expect(achar(".apz-hip__diff", cartaoDaMudanca("m-x")).textContent).toBe("Expirar");
		expect(cartaoDaMudanca("m-x").querySelector(".apz-fichas")).toBeNull();
		expect(achar(".apz-hip__contexto", cartaoDaMudanca("m-o")).textContent).toBe("Hipótese removida.");
	});

	it("a mudança de uma proposta vem logo abaixo dela", () => {
		abrirHipoteses(estadoDeTeste([hipoteseDeTeste({ id: "h-1" }), hipoteseDeTeste({ id: "h-2", criadaEm: tsLocal(5) })], [mudancaDeTeste({ id: "m-1", hipotese: "h-2" })]));
		expect(idsDaSecao("esperando")).toEqual(["h-1", "h-2", "m-1"]);
	});
});

describe("as fichas de evidência", () => {
	it("uma ficha clicada leva ao Histórico com o evento (a matéria do filtro só continua se for a do evento)", () => {
		abrirHipoteses();
		clicar(todos(".apz-fichas--favor .apz-ev", cartao("h-a"))[0]!);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/historico?evento=e-1");
		extras = { materia: "calculo" };
		desenhar();
		clicar(todos(".apz-fichas--favor .apz-ev", cartao("h-a"))[0]!);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/historico/calculo?evento=e-1");
		// O evento e-3 é de Física: o filtro de Cálculo sai da rota para não esconder o evento.
		clicar(todos(".apz-fichas--contra .apz-ev", cartao("h-a"))[0]!);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/historico?evento=e-3");
	});

	it("um id que o Histórico não conhece é 'evento removido' e não abre nada", () => {
		abrirHipoteses(estadoDeTeste([hipoteseDeTeste({ id: "h-1", aFavor: ["e-1", "e-que-sumiu"] })]), eventosPadrao());
		const fichas = todos(".apz-fichas--favor .apz-ev", cartao("h-1"));
		expect(fichas.map((f) => f.textContent)).toEqual(["Respondeu uma questão · 10/11", "evento removido"]);
		expect(fichas[0]?.tagName).toBe("BUTTON");
		expect(fichas[1]?.tagName).toBe("SPAN");
		navegar.mockClear();
		clicar(fichas[1]!);
		expect(navegar).not.toHaveBeenCalled();
	});

	it("com o Histórico falhando, as fichas aparecem com o id curto e ainda abrem o evento", () => {
		desenhar();
		respondeHipoteses();
		responde("erro", { ao: "historico", mensagem: "eventos.jsonl ilegível." });
		const ficha = todos(".apz-fichas--favor .apz-ev", cartao("h-a"))[0]!;
		expect(ficha.textContent).toBe("1");
		clicar(ficha);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/historico?evento=e-1");
	});
});

describe("aprovar, editar e rejeitar", () => {
	beforeEach(() => abrirHipoteses());

	it("Aprovar numa proposta manda `decidir` aprovar; a `decidida` com o mesmo pedido traz o estado novo", () => {
		clicar(botao(cartao("h-a"), "Aprovar"));
		expect(enviadas("decidir")).toEqual([{ alvo: "hipotese", id: "h-a", decisao: "aprovar", pedido: ultimoPedido("decidir") }]);
		const aprovada = hipoteseDeTeste({ id: "h-a", status: "aprovada", aprovadaPeloUsuario: true, enunciado: "Proposta de derivadas." });
		responde("decidida", { pedido: ultimoPedido("decidir"), estado: estadoDeTeste([aprovada, hipoteseDeTeste({ id: "h-b", status: "aprovada" })]) });
		expect(idsDaSecao("esperando")).toEqual([]);
		expect(todos('[data-secao="aprovadas"] .apz-hip').map((c) => c.getAttribute("data-hipotese")).sort()).toEqual(["h-a", "h-b"]);
	});

	it("Rejeitar numa proposta manda `decidir` rejeitar", () => {
		clicar(botao(cartao("h-a"), "Rejeitar"));
		expect(enviadas("decidir")[0]).toMatchObject({ alvo: "hipotese", id: "h-a", decisao: "rejeitar" });
	});

	it("Rejeitar numa aprovada manda `editar` com status rejeitada; Aprovar de novo manda `editar` com status aprovada", () => {
		clicar(botao(cartao("h-b"), "Rejeitar"));
		expect(enviadas("editar")[0]).toMatchObject({ id: "h-b", status: "rejeitada" });
		clicar(achar('[data-secao="rejeitadas"] .apz-secao__alternar'));
		clicar(botao(cartao("h-c"), "Aprovar de novo"));
		expect(enviadas("editar")[1]).toMatchObject({ id: "h-c", status: "aprovada" });
	});

	it("Aprovar e Rejeitar numa mudança mandam `decidir` com alvo mudanca", () => {
		clicar(botao(cartaoDaMudanca("m-1"), "Aprovar"));
		expect(enviadas("decidir")[0]).toMatchObject({ alvo: "mudanca", id: "m-1", decisao: "aprovar" });
		responde("decidida", { pedido: ultimoPedido("decidir"), estado: hipotesesVariadas() });
		clicar(botao(cartaoDaMudanca("m-1"), "Rejeitar"));
		expect(enviadas("decidir")[1]).toMatchObject({ alvo: "mudanca", id: "m-1", decisao: "rejeitar" });
	});

	it("enquanto espera, todos os botões do cartão ficam desligados e os de outros cartões não; a estrutura do cartão não muda", () => {
		const h = cartao("h-a");
		const antes = estrutura(h);
		clicar(botao(h, "Aprovar"));
		expect(todos<HTMLButtonElement>(".apz-acoes button", h).map((b) => b.disabled)).toEqual([true, true, true]);
		expect(botao(cartao("h-b"), "Editar").disabled).toBe(false);
		expect(botao(cartaoDaMudanca("m-1"), "Aprovar").disabled).toBe(false);
		expect(estrutura(h)).toBe(antes);
		// Um segundo clique no botão desligado não manda outra ação.
		clicar(botao(h, "Aprovar"));
		expect(enviadas("decidir")).toHaveLength(1);
		responde("decidida", { pedido: ultimoPedido("decidir"), estado: hipotesesVariadas() });
		expect(todos<HTMLButtonElement>(".apz-acoes button", cartao("h-a")).map((b) => b.disabled)).toEqual([false, false, false]);
		expect(estrutura(cartao("h-a"))).toBe(antes);
	});

	it("um cartão e a mudança dele esperam juntos: a decisão de um desliga os botões do outro", () => {
		clicar(botao(cartao("h-b"), "Rejeitar"));
		expect(todos<HTMLButtonElement>(".apz-acoes button", cartaoDaMudanca("m-1")).map((b) => b.disabled)).toEqual([true, true]);
		expect(todos<HTMLButtonElement>(".apz-acoes button", cartao("h-b")).map((b) => b.disabled)).toEqual([true, true]);
	});

	it("o erro da resposta aparece no próprio cartão, sem mudar a estrutura, e os botões voltam; outro cartão não é tocado", () => {
		const h = cartao("h-a");
		const antes = estrutura(h);
		const outro = estrutura(cartao("h-b"));
		clicar(botao(h, "Aprovar"));
		responde("erro", { pedido: ultimoPedido("decidir"), ao: "decidir", mensagem: "Não consegui gravar o perfil." });
		expect(achar('[role="alert"]', h).textContent).toBe("Não consegui gravar o perfil.");
		expect(estrutura(h)).toBe(antes);
		expect(todos<HTMLButtonElement>(".apz-acoes button", h).map((b) => b.disabled)).toEqual([false, false, false]);
		expect(estrutura(cartao("h-b"))).toBe(outro);
		expect(cartao("h-b").querySelector('[role="alert"]')).toBeNull();
		// E os indicadores não foram derrubados pelo erro (a tela os carrega para os nomes).
		expect(container.querySelector(".aprendiz__erro")).toBeNull();
		// Tentar de novo tira a mensagem.
		clicar(botao(h, "Aprovar"));
		expect(h.querySelector('[role="alert"]')).toBeNull();
		expect(enviadas("decidir")).toHaveLength(2);
	});

	it("a resposta de outro pedido não resolve o cartão que espera", () => {
		clicar(botao(cartao("h-a"), "Aprovar"));
		responde("decidida", { pedido: "outro-pedido", estado: hipotesesVariadas() });
		expect(todos<HTMLButtonElement>(".apz-acoes button", cartao("h-a")).map((b) => b.disabled)).toEqual([true, true, true]);
		expect(cartao("h-a")).toBeDefined();
	});
});

describe("o modal de editar o enunciado", () => {
	beforeEach(() => abrirHipoteses());
	const modal = () => achar<HTMLElement>(".ap-modal", document.body);
	const campo = () => achar<HTMLTextAreaElement>("textarea", document.body);
	const salvar = () => botao(modal(), "Salvar");

	it("Editar abre o modal com o enunciado, o contador (até 300) e Salvar e Cancelar; Cancelar fecha sem mandar nada", () => {
		clicar(botao(cartao("h-a"), "Editar"));
		expect(campo().value).toBe("Proposta de derivadas.");
		expect(campo().maxLength).toBe(300);
		expect(modal().textContent).toContain("/300");
		expect(modal().textContent).toContain("Salvar aprova a hipótese com este enunciado.");
		clicar(botao(modal(), "Cancelar"));
		expect(document.body.querySelector(".ap-modal")).toBeNull();
		expect(pedir.mock.calls.filter((c) => c[1] === "decidir" || c[1] === "editar")).toHaveLength(0);
	});

	it("numa proposta, Salvar aprova com o enunciado novo (`decidir` com `enunciado`) e o modal fecha quando a `decidida` chega", () => {
		clicar(botao(cartao("h-a"), "Editar"));
		escrever(campo(), "  Confunde derivada com razão incremental no limite.  ");
		clicar(salvar());
		expect(enviadas("decidir")[0]).toMatchObject({ alvo: "hipotese", id: "h-a", decisao: "aprovar", enunciado: "Confunde derivada com razão incremental no limite." });
		// Esperando: o modal continua, com Salvar desligado.
		expect(salvar().disabled).toBe(true);
		responde("decidida", { pedido: ultimoPedido("decidir"), estado: hipotesesVariadas() });
		expect(document.body.querySelector(".ap-modal")).toBeNull();
	});

	it("numa aprovada, Salvar chama `editar` com o enunciado", () => {
		clicar(botao(cartao("h-b"), "Editar"));
		expect(modal().textContent).toContain("uma versão nova");
		escrever(campo(), "Aprovada, com outro texto agora.");
		clicar(salvar());
		expect(enviadas("editar")[0]).toMatchObject({ id: "h-b", enunciado: "Aprovada, com outro texto agora." });
		expect("status" in enviadas("editar")[0]!).toBe(false);
		responde("decidida", { pedido: ultimoPedido("editar"), estado: hipotesesVariadas() });
		expect(document.body.querySelector(".ap-modal")).toBeNull();
	});

	it("numa aprovada, salvar sem mudar o texto só fecha (nada a gravar); numa proposta, salvar sem mudar aprova", () => {
		clicar(botao(cartao("h-b"), "Editar"));
		clicar(salvar());
		expect(document.body.querySelector(".ap-modal")).toBeNull();
		expect(enviadas("editar")).toHaveLength(0);
		clicar(botao(cartao("h-a"), "Editar"));
		clicar(salvar());
		expect(enviadas("decidir")[0]).toMatchObject({ decisao: "aprovar", enunciado: "Proposta de derivadas." });
	});

	it("o enunciado vazio ou curto demais é recusado no cliente, com a mensagem no modal e nada enviado", () => {
		clicar(botao(cartao("h-a"), "Editar"));
		escrever(campo(), "   ");
		clicar(salvar());
		expect(achar('[role="alert"]', modal()).textContent).toBe("Escreva o enunciado da hipótese.");
		escrever(campo(), "curto");
		clicar(salvar());
		expect(achar('[role="alert"]', modal()).textContent).toContain("pelo menos 12");
		expect(enviadas("decidir")).toHaveLength(0);
		// Escrever tira o aviso.
		escrever(campo(), "Agora um enunciado válido.");
		expect(modal().querySelector('[role="alert"]')).toBeNull();
	});

	it("o erro da resposta fica no modal (que não fecha) e no cartão; o texto escrito não se perde e Salvar tenta de novo", () => {
		clicar(botao(cartao("h-b"), "Editar"));
		escrever(campo(), "Aprovada, com outro texto agora.");
		clicar(salvar());
		responde("erro", { pedido: ultimoPedido("editar"), ao: "editar", mensagem: "O enunciado repete uma hipótese rejeitada." });
		expect(achar('[role="alert"]', modal()).textContent).toBe("O enunciado repete uma hipótese rejeitada.");
		expect(campo().value).toBe("Aprovada, com outro texto agora.");
		expect(achar('[role="alert"]', cartao("h-b")).textContent).toBe("O enunciado repete uma hipótese rejeitada.");
		expect(salvar().disabled).toBe(false);
		clicar(salvar());
		expect(enviadas("editar")).toHaveLength(2);
	});

	it("um erro velho do cartão não aparece no modal que abre depois", () => {
		clicar(botao(cartao("h-b"), "Rejeitar"));
		responde("erro", { pedido: ultimoPedido("editar"), ao: "editar", mensagem: "Falhou." });
		clicar(botao(cartao("h-b"), "Editar"));
		expect(modal().querySelector('[role="alert"]')).toBeNull();
	});
});

describe("Refletir e a linha da última reflexão", () => {
	it("a linha diz há quanto tempo, quantos eventos leu, as propostas aceitas e descartadas e o custo", () => {
		abrirHipoteses();
		expect(achar(".apz-reflexao__texto").textContent).toBe("Última reflexão há 2 dias: leu 14 eventos, 3 propostas aceitas, 2 descartadas · US$ 0,03");
		expect(achar(".apz-reflexao__texto").getAttribute("title")).toBe("2: sem duas sessões");
	});

	it("sem reflexão ainda, a frase explica que o professor propõe a partir dos eventos e que nada entra sem aprovação", () => {
		abrirHipoteses(estadoDeTeste([hipoteseDeTeste({ id: "h-1" })]));
		expect(achar(".apz-reflexao__texto").textContent).toBe("O professor propõe hipóteses a partir dos seus eventos de aprendizagem. Nada entra no seu perfil sem a sua aprovação.");
	});

	it("antes de o estado chegar, a linha fica em branco (nunca a frase de 'sem reflexão' por um instante)", () => {
		desenhar();
		expect(achar(".apz-reflexao__texto").textContent).toBe(" ");
		expect(botao(container, "Refletir").disabled).toBe(false);
	});

	it("Refletir manda `refletir` com um pedido, e o botão fica desligado até o `refletiu`, que atualiza a linha", () => {
		abrirHipoteses();
		clicar(botao(container, "Refletir"));
		expect(enviadas("refletir")).toEqual([{ pedido: ultimoPedido("refletir") }]);
		expect(botao(container, "Refletir").disabled).toBe(true);
		responde("refletindo", { pedido: ultimoPedido("refletir") });
		expect(botao(container, "Refletir").disabled).toBe(true);
		const resumo = resumoDeTeste({ id: "r-2", ts: new Date().toISOString(), lidos: 1, aceitas: 1, descartadas: [], custo: undefined });
		responde("refletiu", { pedido: ultimoPedido("refletir"), resumo, estado: estadoDeTeste([hipoteseDeTeste({ id: "h-nova" })], [], { ultimaReflexao: resumo }) });
		expect(botao(container, "Refletir").disabled).toBe(false);
		expect(achar(".apz-reflexao__texto").textContent).toBe("Última reflexão agora: leu 1 evento, 1 proposta aceita");
		expect(idsDaSecao("esperando")).toEqual(["h-nova"]);
	});

	it("uma reflexão automática (`hipoteses` com refletindo) também desliga o botão, e o fim a liga", () => {
		abrirHipoteses();
		respondeHipoteses(estadoDeTeste([], [], { refletindo: true, ultimaReflexao: resumoDeTeste() }));
		expect(botao(container, "Refletir").disabled).toBe(true);
		respondeHipoteses(estadoDeTeste([], [], { ultimaReflexao: resumoDeTeste({ id: "r-5" }) }));
		expect(botao(container, "Refletir").disabled).toBe(false);
	});

	it("o erro mostra a mensagem na linha e o botão passa a dizer 'Tentar de novo', sem mudar a estrutura da barra", () => {
		abrirHipoteses();
		const barra = achar(".apz-reflexao");
		const antes = estrutura(barra);
		clicar(botao(container, "Refletir"));
		responde("erro", { pedido: ultimoPedido("refletir"), ao: "refletir", mensagem: "O modelo não respondeu." });
		expect(achar(".apz-reflexao__texto").textContent).toBe("O modelo não respondeu.");
		expect(achar('.apz-reflexao [role="alert"]').textContent).toBe("O modelo não respondeu.");
		expect(textoDosRotulos(achar(".apz-reflexao button")).map((t) => t.texto)).toEqual(["Tentar de novo", "Refletindo…"]);
		expect(estrutura(barra)).toBe(antes);
		clicar(botao(container, "Tentar de novo"));
		expect(enviadas("refletir")).toHaveLength(2);
		expect(achar(".apz-reflexao__texto").textContent).toContain("Última reflexão");
	});

	it("o erro de uma decisão não vira o erro da reflexão", () => {
		abrirHipoteses();
		clicar(botao(cartao("h-a"), "Aprovar"));
		responde("erro", { pedido: ultimoPedido("decidir"), ao: "decidir", mensagem: "Falhou." });
		expect(achar(".apz-reflexao__texto").textContent).toContain("Última reflexão");
	});

	it("uma reflexão nova pede o histórico de novo (as propostas citam eventos que a tela ainda não tinha)", () => {
		abrirHipoteses();
		pedir.mockClear();
		const resumo = resumoDeTeste({ id: "r-nova" });
		respondeHipoteses(estadoDeTeste([], [], { ultimaReflexao: resumo }));
		expect(enviadas("historico")).toHaveLength(1);
		// O mesmo resumo de novo não repete o pedido.
		respondeHipoteses(estadoDeTeste([], [], { ultimaReflexao: resumo }));
		expect(enviadas("historico")).toHaveLength(1);
	});

	it("o primeiro estado que chega não pede o histórico de novo", () => {
		desenhar();
		pedir.mockClear();
		respondeHipoteses();
		expect(enviadas("historico")).toHaveLength(0);
	});
});

describe("o erro de leitura e as respostas de antes", () => {
	it("o erro das hipóteses aparece com 'Tentar de novo', que pede de novo; a barra do Refletir continua", () => {
		desenhar();
		responde("erro", { ao: "hipoteses", mensagem: "hipoteses.json ilegível." });
		expect(achar('.aprendiz__erro[role="alert"]').textContent).toContain("hipoteses.json ilegível.");
		expect(botao(container, "Refletir")).toBeDefined();
		pedir.mockClear();
		clicar(botao(container, "Tentar de novo"));
		expect(enviadas("hipoteses")).toHaveLength(1);
		respondeHipoteses();
		respondeHistorico();
		expect(container.querySelector(".aprendiz__erro")).toBeNull();
		expect(secoes()).toHaveLength(4);
	});

	it("uma resposta que já estava na ponte ao montar não aparece; a nova sim", () => {
		recebidas = [{ chave: "velha", acao: "hipoteses", dados: { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-velha", enunciado: "Hipótese velha demais." })]) } }];
		desenhar();
		expect(container.textContent).not.toContain("Hipótese velha demais.");
		abrirHipoteses();
		expect(container.textContent).not.toContain("Hipótese velha demais.");
		expect(secoes()).toHaveLength(4);
	});

	it("depois de trocar de sessão, uma resposta que chegou com a troca não vale; a nova sim", () => {
		abrirHipoteses();
		sessao = "s2";
		responde("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-atrasada" })]) });
		expect(todos("[data-hipotese]").map((c) => c.getAttribute("data-hipotese"))).not.toContain("h-atrasada");
		expect(enviadas("hipoteses")).toHaveLength(2);
		respondeHipoteses(estadoDeTeste([hipoteseDeTeste({ id: "h-nova" })]));
		expect(todos("[data-hipotese]").map((c) => c.getAttribute("data-hipotese"))).toEqual(["h-nova"]);
	});
});

describe("estados passageiros só depois de 1 s", () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.useFakeTimers();
	});
	const passar = (ms: number) =>
		act(() => {
			vi.advanceTimersByTime(ms);
		});

	it("'Salvando…' só aparece no botão clicado depois de 1 s; os outros ficam com o texto de sempre", () => {
		abrirHipoteses();
		const h = cartao("h-a");
		clicar(botao(h, "Aprovar"));
		const aprovar = botao(h, "Aprovar");
		expect(textoDosRotulos(aprovar)).toEqual([{ texto: "Aprovar", oculto: false }, { texto: "Salvando…", oculto: true }]);
		passar(900);
		expect(textoDosRotulos(aprovar)[1]?.oculto).toBe(true);
		passar(200);
		expect(textoDosRotulos(aprovar)).toEqual([{ texto: "Aprovar", oculto: true }, { texto: "Salvando…", oculto: false }]);
		expect(textoDosRotulos(botao(h, "Editar")).map((t) => t.oculto)).toEqual([false, true]);
		responde("decidida", { pedido: ultimoPedido("decidir"), estado: hipotesesVariadas() });
		expect(textoDosRotulos(botao(cartao("h-a"), "Aprovar")).map((t) => t.oculto)).toEqual([false, true]);
	});

	it("uma resposta antes de 1 s: 'Salvando…' nunca ficou visível", () => {
		abrirHipoteses();
		clicar(botao(cartao("h-a"), "Aprovar"));
		passar(400);
		responde("decidida", { pedido: ultimoPedido("decidir"), estado: hipotesesVariadas() });
		passar(2000);
		expect(textoDosRotulos(botao(cartao("h-a"), "Aprovar"))).toEqual([{ texto: "Aprovar", oculto: false }, { texto: "Salvando…", oculto: true }]);
	});

	it("'Refletindo…' só depois de 1 s, e o botão tem os dois textos no mesmo lugar", () => {
		abrirHipoteses();
		clicar(botao(container, "Refletir"));
		const refletir = botao(container, "Refletir");
		expect(textoDosRotulos(refletir)).toEqual([{ texto: "Refletir", oculto: false }, { texto: "Refletindo…", oculto: true }]);
		passar(1100);
		expect(textoDosRotulos(refletir)).toEqual([{ texto: "Refletir", oculto: true }, { texto: "Refletindo…", oculto: false }]);
		expect(refletir.getAttribute("aria-busy")).toBe("true");
	});

	it("o conteúdo das hipóteses espera o histórico até 400 ms; passado o prazo aparece assim mesmo, com as fichas pelo id curto", () => {
		desenhar();
		respondeHipoteses();
		expect(container.querySelector(".apz-secao")).toBeNull();
		expect(achar<HTMLElement>(".aprendiz__espera").style.visibility).toBe("hidden");
		passar(450);
		expect(secoes()).toHaveLength(4);
		expect(todos(".apz-fichas--favor .apz-ev", cartao("h-a"))[0]?.textContent).toBe("1");
		respondeHistorico();
		expect(todos(".apz-fichas--favor .apz-ev", cartao("h-a"))[0]?.textContent).toBe("Respondeu uma questão · 10/11");
	});

	it("'Carregando as hipóteses…' só fica visível depois de 1 s", () => {
		desenhar();
		const espera = () => achar<HTMLElement>(".aprendiz__espera");
		expect(espera().style.visibility).toBe("hidden");
		expect(espera().querySelectorAll(".apz-hip--esqueleto")).toHaveLength(2);
		passar(900);
		expect(espera().style.visibility).toBe("hidden");
		passar(200);
		expect(espera().style.visibility).toBe("visible");
		expect(espera().textContent).toContain("Carregando as hipóteses…");
	});
});

describe("o destaque de uma hipótese pela rota", () => {
	it("o cartão destacado ganha a classe, rola até ficar à vista e some no próximo clique", () => {
		extras = { hipotese: "h-b" };
		abrirHipoteses();
		expect(cartao("h-b").classList.contains("apz-hip--destaque")).toBe(true);
		expect(cartao("h-a").classList.contains("apz-hip--destaque")).toBe(false);
		expect(rolagens).toContain(cartao("h-b"));
		// O destaque é só cor: a estrutura do cartão é a mesma de um sem destaque.
		extras = {};
		const estruturaSem = estrutura(cartao("h-b"));
		extras = { hipotese: "h-b" };
		desenhar();
		expect(estrutura(cartao("h-b"))).toBe(estruturaSem);
	});

	it("a seção recolhida que tem a hipótese destacada abre sozinha", () => {
		extras = { hipotese: "h-c" };
		abrirHipoteses();
		expect(idsDaSecao("rejeitadas")).toEqual(["h-c"]);
		expect(cartao("h-c").classList.contains("apz-hip--destaque")).toBe(true);
	});

	it("vários ids separados por vírgula destacam todos, e a mudança de uma hipótese destacada também", () => {
		extras = { hipotese: "h-a,h-b" };
		abrirHipoteses();
		expect(cartao("h-a").classList.contains("apz-hip--destaque")).toBe(true);
		expect(cartao("h-b").classList.contains("apz-hip--destaque")).toBe(true);
		expect(cartaoDaMudanca("m-1").classList.contains("apz-hip--destaque")).toBe(true);
	});

	it("o próximo clique em qualquer lugar manda a rota sem o destaque", async () => {
		extras = { hipotese: "h-b", materia: "calculo" };
		abrirHipoteses();
		await act(async () => {
			await new Promise((resolver) => setTimeout(resolver, 5));
		});
		navegar.mockClear();
		clicar(achar("h1"));
		expect(navegar).toHaveBeenCalledWith("aprendiz/hipoteses/calculo");
	});
});

describe("a aba Histórico", () => {
	const abrirHistorico = (eventos: EventoLido[] = eventosPadrao()) => {
		extras = { aba: "historico", ...extras };
		desenhar();
		respondeHistorico(eventos);
		respondeHipoteses();
	};
	const dias = () => todos<HTMLElement>(".apz-dia").map((d) => d.querySelector(".apz-dia__titulo")!.textContent);
	const ordem = () => todos<HTMLElement>(".apz-evento").map((e) => e.getAttribute("data-evento"));

	it("pede o histórico (e as hipóteses, para o botão de voltar) ao abrir", () => {
		extras = { aba: "historico" };
		desenhar();
		expect(enviadas("historico")).toEqual([{}]);
		expect(enviadas("hipoteses")).toEqual([{}]);
	});

	it("agrupa por dia, os mais novos primeiro, com Ontem e a data por extenso", () => {
		abrirHistorico();
		expect(dias()).toEqual(["Ontem", "9 de novembro de 2026"]);
		expect(ordem()).toEqual(["e-1", "e-2", "e-3"]);
	});

	it("cada evento tem o verbo em português, a hora, a matéria, o conceito pelo nome e a frase do resultado", () => {
		extras = { aba: "historico" };
		desenhar();
		responde("indicadores", { indicadores: indicadoresDeTeste([conceitoDeTeste({ conceito: "derivadas", nome: "Derivadas" })]) });
		respondeHistorico();
		respondeHipoteses();
		const e1 = evento("e-1");
		expect(achar(".apz-evento__verbo", e1).textContent).toBe("Respondeu uma questão");
		expect(achar(".apz-evento__hora", e1).textContent).toBe("14:32");
		expect(achar(".apz-materia__nome", e1).textContent).toBe("Cálculo I");
		expect(achar(".apz-evento__conceitos", e1).textContent).toBe("Derivadas");
		expect(achar(".apz-evento__frase", e1).textContent).toBe("errada");
		expect(achar(".apz-evento__detalhe", e1).textContent).toBe("Cálculo I · Derivadas · errada");
		expect(achar(".apz-evento__verbo", evento("e-2")).textContent).toBe("Autoavaliou o conceito");
		expect(achar(".apz-evento__frase", evento("e-2")).textContent).toBe("nível 3 de 4");
		// Física: o conceito não está nos indicadores, então não há nome.
		expect(evento("e-3").querySelector(".apz-evento__conceitos")).toBeNull();
	});

	it("um verbo desconhecido aparece como está; uma matéria que a lista não tem é 'matéria removida'; sem matéria, nada", () => {
		abrirHistorico([
			eventoDeTeste({ id: "e-a", verbo: "verbo_do_futuro" as never, objeto: { materia: "quimica" }, resultado: undefined }),
			eventoDeTeste({ id: "e-b", verbo: "refletiu" as never, objeto: {}, resultado: { lidos: 3, aceitas: 1 } }),
		]);
		expect(achar(".apz-evento__verbo", evento("e-a")).textContent).toBe("verbo_do_futuro");
		expect(achar(".apz-materia__nome", evento("e-a")).textContent).toBe("matéria removida");
		expect(evento("e-b").querySelector(".apz-materia")).toBeNull();
		expect(achar(".apz-evento__detalhe", evento("e-b")).textContent).toBe("leu 3 eventos · 1 proposta aceita");
	});

	it("o filtro de matéria vale aqui também; o de tipo (Respostas, Autoavaliações, Perfil) filtra os eventos", () => {
		abrirHistorico([...eventosPadrao(), eventoDeTeste({ id: "e-4", ts: tsLocal(10, 9, 0), verbo: "aprovou_hipotese" as never, objeto: { materia: "calculo", hipotese: "h-a" }, resultado: undefined })]);
		expect(ordem()).toEqual(["e-1", "e-2", "e-4", "e-3"]);
		const tipo = achar<HTMLSelectElement>(".apz-historico__barra select");
		const escolher = (valor: string) =>
			act(() => {
				Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(tipo, valor);
				tipo.dispatchEvent(new Event("change", { bubbles: true }));
			});
		expect(todos("option", tipo).map((o) => o.textContent)).toEqual(["Todos os tipos", "Respostas", "Autoavaliações", "Perfil"]);
		escolher("respostas");
		expect(ordem()).toEqual(["e-1", "e-3"]);
		escolher("autoavaliacoes");
		expect(ordem()).toEqual(["e-2"]);
		escolher("perfil");
		expect(ordem()).toEqual(["e-4"]);
		escolher("todos");
		extras = { aba: "historico", materia: "fisica" };
		desenhar();
		expect(ordem()).toEqual(["e-3"]);
		expect(achar(".apz-historico__conta").textContent).toBe("1 evento");
	});

	it("trocar o filtro de matéria não remonta o cabeçalho nem os eventos que continuam", () => {
		abrirHistorico();
		const cabecalho = achar("header");
		const e3 = evento("e-3");
		extras = { aba: "historico", materia: "fisica" };
		desenhar();
		expect(achar("header")).toBe(cabecalho);
		expect(evento("e-3")).toBe(e3);
		expect(ordem()).toEqual(["e-3"]);
	});

	it("o vazio: sem nenhum evento, e com o filtro que não casa com nenhum", () => {
		abrirHistorico([]);
		expect(container.textContent).toContain("Ainda não há eventos");
		extras = { aba: "historico" };
		abrirHistorico(eventosPadrao());
		extras = { aba: "historico", materia: "quimica" };
		desenhar();
		expect(container.textContent).toContain("Nenhum evento nesta seleção");
		expect(container.querySelector(".apz-dia")).toBeNull();
	});

	it("o erro do histórico aparece com 'Tentar de novo', que pede de novo", () => {
		extras = { aba: "historico" };
		desenhar();
		responde("erro", { ao: "historico", mensagem: "eventos.jsonl ilegível." });
		expect(achar('.aprendiz__erro[role="alert"]').textContent).toContain("eventos.jsonl ilegível.");
		pedir.mockClear();
		clicar(botao(container, "Tentar de novo"));
		expect(enviadas("historico")).toHaveLength(1);
		respondeHistorico();
		expect(container.querySelector(".aprendiz__erro")).toBeNull();
		expect(ordem()).toHaveLength(3);
	});

	it("o limite do histórico é dito na contagem", () => {
		const cheio = Array.from({ length: 500 }, (_, i) => eventoDeTeste({ id: `${String(1000 + i)}-aaaaaaaa`, ts: tsLocal(10, 8, i % 60) }));
		abrirHistorico(cheio);
		expect(achar(".apz-historico__conta").textContent).toBe("500 eventos · os 500 mais recentes");
	});

	it("o evento destacado pela rota ganha a classe, rola até ficar à vista, mostra todos os tipos e o destaque não muda a estrutura", () => {
		extras = { evento: "e-2" };
		abrirHistorico();
		expect(evento("e-2").classList.contains("apz-evento--destaque")).toBe(true);
		expect(evento("e-1").classList.contains("apz-evento--destaque")).toBe(false);
		expect(rolagens).toContain(evento("e-2"));
		const comDestaque = estrutura(evento("e-2"));
		extras = { aba: "historico" };
		desenhar();
		expect(estrutura(evento("e-2"))).toBe(comDestaque);
		expect(evento("e-2").classList.contains("apz-evento--destaque")).toBe(false);
	});

	it("chegar com um evento destacado zera um filtro de tipo que o esconderia", () => {
		abrirHistorico();
		const tipo = achar<HTMLSelectElement>(".apz-historico__barra select");
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(tipo, "respostas");
			tipo.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(ordem()).toEqual(["e-1", "e-3"]);
		extras = { aba: "historico", evento: "e-2" };
		desenhar();
		expect(achar<HTMLSelectElement>(".apz-historico__barra select").value).toBe("todos");
		expect(ordem()).toContain("e-2");
		expect(evento("e-2").classList.contains("apz-evento--destaque")).toBe(true);
	});

	it("um evento da rota que o histórico não tem avisa, sem destacar nada", () => {
		extras = { evento: "000-que-sumiu" };
		abrirHistorico();
		expect(achar('[role="status"]').textContent).toContain("não está entre os 500 mais recentes");
		expect(container.querySelector(".apz-evento--destaque")).toBeNull();
	});

	it("o próximo clique tira o destaque (a rota sem o evento, com a matéria)", async () => {
		extras = { evento: "e-1", materia: "calculo" };
		abrirHistorico();
		await act(async () => {
			await new Promise((resolver) => setTimeout(resolver, 5));
		});
		navegar.mockClear();
		clicar(achar("h1"));
		expect(navegar).toHaveBeenCalledWith("aprendiz/historico/calculo");
	});

	it("o evento citado por uma hipótese tem o botão que volta a ela (a rota das hipóteses com a hipótese destacada)", () => {
		abrirHistorico();
		const volta = achar<HTMLButtonElement>(".apz-evento__volta", evento("e-1"));
		expect(volta.getAttribute("aria-label")).toBe("Ver as 2 hipóteses que citam este evento");
		clicar(volta);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/hipoteses?hipotese=h-a%2Ch-b");
		clicar(achar<HTMLButtonElement>(".apz-evento__volta", evento("e-3")));
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/hipoteses?hipotese=h-a%2Ch-b");
	});

	it("com uma só hipótese citando, o botão diz 'a hipótese'; o filtro de matéria continua só se a hipótese passa por ele", () => {
		extras = { aba: "historico", materia: "calculo" };
		desenhar();
		respondeHistorico();
		respondeHipoteses(estadoDeTeste([hipoteseDeTeste({ id: "h-1", escopo: { nivel: "materia", materia: "calculo" }, aFavor: ["e-1"] }), hipoteseDeTeste({ id: "h-2", escopo: { nivel: "materia", materia: "fisica" }, aFavor: ["e-3"] })]));
		const volta = achar<HTMLButtonElement>(".apz-evento__volta", evento("e-1"));
		expect(volta.getAttribute("aria-label")).toBe("Ver a hipótese que cita este evento");
		clicar(volta);
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/hipoteses/calculo?hipotese=h-1");
		// e-3 é de Física: com o filtro de Cálculo ele nem aparece; sem o filtro, o clique leva a Física sem filtro.
		extras = { aba: "historico" };
		desenhar();
		clicar(achar<HTMLButtonElement>(".apz-evento__volta", evento("e-3")));
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/hipoteses?hipotese=h-2");
	});

	it("um evento que nenhuma hipótese cita não tem o botão, mas a coluna dele existe (o layout não depende disso)", () => {
		abrirHistorico([eventoDeTeste({ id: "e-solto" })]);
		expect(evento("e-solto").querySelector(".apz-evento__volta")).toBeNull();
		expect(evento("e-solto").querySelector(".apz-evento__citado")).not.toBeNull();
	});
});

describe("a tela estreita e o movimento", () => {
	it("nada nas abas novas usa largura fixa em px nem rolagem para o lado (a largura vem do CSS)", () => {
		abrirHipoteses();
		for (const elemento of container.querySelectorAll<HTMLElement>("*")) {
			const largura = elemento.style.width;
			if (largura) expect(largura).toMatch(/%$/);
		}
	});

	it("o cartão tem a mesma estrutura em todos os status (a altura não depende do estado)", () => {
		abrirHipoteses();
		clicar(achar('[data-secao="rejeitadas"] .apz-secao__alternar'));
		const forma = (id: string) => todos(".apz-hip__topo > *, .apz-hip__meta > *, .apz-hip__conta, .apz-acoes", cartao(id)).map((e) => e.className.split(" ")[0]);
		expect(forma("h-a")).toEqual(forma("h-c"));
		expect(forma("h-a")).toEqual(forma("h-b"));
	});
});
