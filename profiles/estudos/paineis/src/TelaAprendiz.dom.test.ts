// @vitest-environment happy-dom
// A tela "Perfil do aprendiz" (TelaAprendiz.tsx) com uma janela falsa em que a ponte responde como a extensão:
// a ordem da lista, o resumo, o filtro de matéria, o vazio, o erro e "Tentar de novo", o carregando só depois de
// 1 s, os detalhes (que não mexem nas outras linhas) e as respostas de antes da montagem, que não valem. O visual e
// os quadros da troca são conferidos no Edge; aqui vão as ligações e a estrutura.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conceitoDeTeste, conceitosVariados, indicadoresDeTeste, MATERIAS_DE_TESTE } from "./aprendiz-fixtures.ts";
import { PAINEL_APRENDIZ } from "./aprendiz-ponte.ts";
import { type PropsTelaAprendiz, TelaAprendiz } from "./TelaAprendiz.tsx";

let container: HTMLDivElement;
let root: Root;
let pedir: ReturnType<typeof vi.fn>;
// Estável entre as renderizações, como o `acoes` do useJanelaPerfil.
let acoesFalsas: { acaoDaInterface: ReturnType<typeof vi.fn> };
let recebidas: AcaoRecebida[];
let sessao: string;
let contador = 0;
const navegar = vi.fn();
const matchMediaOriginal = window.matchMedia.bind(window);

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
				caminho: "aprendiz/indicadores",
				navegar,
				abrirConversa: vi.fn(),
				voltar: vi.fn(),
				janela: janelaFalsa(),
				aba: "indicadores",
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
const respondeIndicadores = (conceitos = conceitosVariados(), sobre = {}) => responde("indicadores", { indicadores: indicadoresDeTeste(conceitos, sobre) });

beforeEach(() => {
	// O movimento reduzido liga: o happy-dom rejeita a promessa de uma animação nativa cancelada no unmount.
	vi.stubGlobal("matchMedia", (query: string) => {
		const consulta = matchMediaOriginal(query);
		Object.defineProperty(consulta, "matches", { value: query.includes("prefers-reduced-motion") });
		return consulta;
	});
	// Só a data é falsa: os temporizadores continuam reais (o carregando tem o seu próprio teste, com todos).
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-11T12:00:00.000Z"));
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

const achar = <E extends Element>(seletor: string): E => {
	const elemento = container.querySelector<E>(seletor);
	if (!elemento) throw new Error(`Não achei ${seletor}`);
	return elemento;
};
const ordem = () => [...container.querySelectorAll(".apz-item:not(.apz-item--esqueleto)")].map((item) => item.getAttribute("data-conceito"));
const linha = (chave: string) => achar<HTMLElement>(`[data-conceito="${chave}"]`);
const clicar = (alvo: Element) =>
	act(() => {
		(alvo as HTMLElement).click();
	});
const fichas = () => Object.fromEntries([...container.querySelectorAll(".apz-ficha")].map((ficha) => [ficha.querySelector(".apz-ficha__rotulo")!.textContent, ficha.querySelector(".apz-ficha__valor")!.textContent]));

describe("o cabeçalho e a aba", () => {
	it("o título, as três abas (Indicadores, Hipóteses e Histórico) e o pedido dos indicadores", () => {
		desenhar();
		expect(achar("h1").textContent).toBe("Perfil do aprendiz");
		const abas = [...container.querySelectorAll('[role="tab"]')];
		expect(abas.map((aba) => aba.textContent)).toEqual(["Indicadores", "Hipóteses", "Histórico"]);
		expect(abas[0]?.getAttribute("aria-selected")).toBe("true");
		expect(pedir).toHaveBeenCalledWith(PAINEL_APRENDIZ, "indicadores", {});
	});

	it("o voltar leva aos cadernos", () => {
		desenhar();
		clicar(achar(".ap-cbar__back"));
		expect(navegar).toHaveBeenCalledWith("");
	});
});

describe("a lista", () => {
	it("do menor domínio para o maior, com o empate pela observação mais recente e o sem respostas no fim", () => {
		desenhar();
		respondeIndicadores();
		expect(ordem()).toEqual(["calculo/derivadas", "fisica/series", "calculo/integrais", "calculo/limites", "fisica/vetores"]);
	});

	it("o resumo conta as faixas e põe os só autoavaliados à parte", () => {
		desenhar();
		respondeIndicadores();
		expect(fichas()).toEqual({ Conceitos: "5", "Domínio alto": "1", "Domínio médio": "1", "Domínio baixo": "2", "Só autoavaliados": "1" });
	});

	it("cada linha mostra nome, matéria, barra com percentual, números em pt-BR, calibração, última atividade e o dito × o feito", () => {
		desenhar();
		respondeIndicadores();
		const derivadas = linha("calculo/derivadas");
		expect(derivadas.querySelector(".apz-nome")!.textContent).toBe("Derivadas");
		expect(derivadas.querySelector(".apz-materia__nome")!.textContent).toBe("Cálculo I");
		const barra = derivadas.querySelector('[role="meter"]')!;
		expect(barra.getAttribute("aria-valuenow")).toBe("20");
		expect(derivadas.querySelector(".apz-dominio__pct")!.textContent).toBe("20%");
		expect(derivadas.querySelector(".apz-dominio__faixa")!.textContent).toBe("baixo");
		expect((derivadas.querySelector(".apz-barra__cheio") as HTMLElement).style.width).toBe("20%");
		const numeros = Object.fromEntries([...derivadas.querySelectorAll(".apz-num")].map((n) => [n.querySelector("dt")!.textContent, n.querySelector("dd")!.textContent]));
		expect(numeros).toEqual({ Acertos: "0,9", Erros: "3,1", Sessões: "2", Ganho: "—", Calibração: "0,31 · pouco calibrado", "Você disse": "—", "Você fez": "domínio 20%" });
		expect(derivadas.querySelector(".apz-quando")!.textContent).toBe("há 2 dias");
		const limites = linha("calculo/limites");
		expect(limites.querySelector(".apz-dominio__faixa")!.textContent).toBe("alto");
		const dos = Object.fromEntries([...limites.querySelectorAll(".apz-num")].map((n) => [n.querySelector("dt")!.textContent, n.querySelector("dd")!.textContent]));
		expect(dos["Ganho"]).toBe("+0,45");
		expect(dos["Calibração"]).toBe("0,08 · bem calibrado");
		expect(dos["Você disse"]).toBe("nível 4 de 4");
	});

	it("o conceito que o mapa não tem mais mostra o aviso e o id curto", () => {
		desenhar();
		const { nome: _nome, ...semNome } = conceitoDeTeste({ conceito: "c-apagado" });
		respondeIndicadores([semNome]);
		const item = linha("calculo/c-apagado");
		expect(item.querySelector(".apz-nome")!.textContent).toBe("Conceito removido do mapa");
		expect(item.querySelector(".apz-nome__id")!.textContent?.trim()).toBe("c-apagado");
	});

	it("o conceito só autoavaliado: 'Sem respostas ainda', sem barra nem 30%, e o que o Breno disse", () => {
		desenhar();
		respondeIndicadores();
		const vetores = linha("fisica/vetores");
		expect(vetores.textContent).toContain("Sem respostas ainda");
		expect(vetores.querySelector('[role="meter"]')).toBeNull();
		expect(vetores.querySelector(".apz-barra")).toBeNull();
		expect(vetores.textContent).not.toContain("30%");
		const dd = [...vetores.querySelectorAll(".apz-num")].find((n) => n.querySelector("dt")!.textContent === "Você disse")!;
		expect(dd.querySelector("dd")!.textContent).toBe("nível 3 de 4");
	});

	it("o aviso dos eventos ignorados e o porquê", () => {
		desenhar();
		respondeIndicadores(conceitosVariados(), { ignorados: { materiaInexistente: 13, semConceito: 2 } });
		expect(achar(".apz-ignorados").textContent).toBe("15 eventos ignorados no cálculo: 13 de matéria que não existe mais e 2 sem conceito do mapa.");
	});

	it("sem ignorados, não há aviso", () => {
		desenhar();
		respondeIndicadores();
		expect(container.querySelector(".apz-ignorados")).toBeNull();
	});
});

describe("o filtro de matéria", () => {
	it("as opções são Todas e as matérias que aparecem nos dados, com o nome do que a TelaEstudos conhece", () => {
		desenhar();
		respondeIndicadores();
		const opcoes = [...container.querySelectorAll("select option")].map((o) => [o.getAttribute("value"), o.textContent]);
		expect(opcoes).toEqual([["", "Todas as matérias"], ["calculo", "Cálculo I"], ["fisica", "Física"]]);
	});

	it("escolher uma matéria navega para a rota com o filtro (e Todas tira o filtro)", () => {
		desenhar();
		respondeIndicadores();
		const select = achar<HTMLSelectElement>("select");
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "fisica");
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/indicadores/fisica");
		extras = { materia: "fisica" };
		desenhar();
		const todas = achar<HTMLSelectElement>("select");
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(todas, "");
			todas.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(navegar).toHaveBeenLastCalledWith("aprendiz/indicadores");
	});

	it("com a matéria na rota, a lista e o resumo são só dela, e o título diz qual", () => {
		desenhar();
		respondeIndicadores();
		extras = { materia: "fisica" };
		desenhar();
		expect(ordem()).toEqual(["fisica/series", "fisica/vetores"]);
		expect(fichas()).toEqual({ Conceitos: "2", "Domínio alto": "0", "Domínio médio": "0", "Domínio baixo": "1", "Só autoavaliados": "1" });
		expect(achar(".ap-cbar__kicker").textContent).toBe("Física");
		expect(achar<HTMLSelectElement>("select").value).toBe("fisica");
	});

	it("o filtro não desmonta a tela: o cabeçalho e a lista são os mesmos elementos", () => {
		desenhar();
		respondeIndicadores();
		const cabecalho = achar("header");
		const lista = achar(".apz-lista");
		const derivadas = linha("fisica/series");
		extras = { materia: "fisica" };
		desenhar();
		expect(achar("header")).toBe(cabecalho);
		expect(achar(".apz-lista")).toBe(lista);
		expect(linha("fisica/series")).toBe(derivadas);
	});

	it("enquanto a lista de matérias não chegou, o nome do filtro fica em branco (nunca o id cru)", () => {
		extras = { materia: "fisica", materias: [] };
		desenhar();
		respondeIndicadores();
		expect(achar(".ap-cbar__kicker").textContent).toBe(" ");
		const select = achar<HTMLSelectElement>("select");
		expect(select.options[select.selectedIndex]?.textContent).toBe(" ");
		expect(linha("fisica/series").querySelector(".apz-materia__nome")!.textContent).toBe(" ");
	});

	it("uma matéria da rota que não tem conceito mostra o vazio dela, não o geral", () => {
		extras = { materia: "quimica" };
		desenhar();
		respondeIndicadores();
		expect(container.textContent).toContain("Sem observações em quimica");
		expect(container.textContent).not.toContain("Ainda não há indicadores");
	});
});

describe("o vazio", () => {
	it("sem nenhum conceito, o EmptyState explica que os indicadores aparecem depois de responder questões", () => {
		desenhar();
		respondeIndicadores([]);
		expect(container.textContent).toContain("Ainda não há indicadores");
		expect(container.textContent).toContain("depois que você responde questões");
		expect(container.querySelector(".apz-lista")).toBeNull();
		expect(fichas().Conceitos).toBe("0");
	});
});

describe("o erro", () => {
	it("a mensagem da extensão aparece na hora, com 'Tentar de novo', que pede de novo", () => {
		desenhar();
		responde("erro", { mensagem: "O eventos.jsonl não abre." });
		expect(achar('[role="alert"]').textContent).toContain("O eventos.jsonl não abre.");
		pedir.mockClear();
		const botao = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Tentar de novo"))!;
		clicar(botao);
		expect(pedir).toHaveBeenCalledWith(PAINEL_APRENDIZ, "indicadores", {});
		// A mensagem fica até a resposta chegar (nada some na troca).
		expect(container.textContent).toContain("O eventos.jsonl não abre.");
		respondeIndicadores();
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(ordem().length).toBe(5);
	});

	it("o botão tem o mesmo tamanho nos dois rótulos (os dois textos ocupam o mesmo lugar)", () => {
		desenhar();
		responde("erro", { mensagem: "Ruim." });
		const botao = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Tentar de novo"))!;
		expect(botao.querySelectorAll(".rotulo-estado__texto")).toHaveLength(2);
	});
});

describe("só valem as respostas desta visita", () => {
	it("uma resposta que já estava na ponte ao montar (de outra visita ou sessão) não aparece", () => {
		recebidas = [{ chave: "velha", acao: "indicadores", dados: { indicadores: indicadoresDeTeste([conceitoDeTeste({ conceito: "antigo", nome: "Conceito Antigo" })]) } }];
		desenhar();
		expect(container.textContent).not.toContain("Conceito Antigo");
		expect(ordem()).toEqual([]);
		respondeIndicadores([conceitoDeTeste({ conceito: "novo", nome: "Conceito Novo" })]);
		expect(ordem()).toEqual(["calculo/novo"]);
		expect(container.textContent).not.toContain("Conceito Antigo");
	});

	it("depois de trocar de sessão, uma resposta atrasada da anterior não troca a tela; a nova sim", () => {
		desenhar();
		respondeIndicadores([conceitoDeTeste({ conceito: "a", nome: "Conceito A" })]);
		sessao = "s2";
		responde("indicadores", { indicadores: indicadoresDeTeste([conceitoDeTeste({ conceito: "atrasado", nome: "Conceito Atrasado" })]) });
		expect(container.textContent).toContain("Conceito A");
		expect(container.textContent).not.toContain("Conceito Atrasado");
		expect(pedir).toHaveBeenCalledTimes(2);
		respondeIndicadores([conceitoDeTeste({ conceito: "b", nome: "Conceito B" })]);
		expect(ordem()).toEqual(["calculo/b"]);
	});
});

describe("os detalhes", () => {
	it("abrem e fecham com um clique; mostram as confusões com o número de eventos e os ids curtos", () => {
		desenhar();
		respondeIndicadores();
		const derivadas = linha("calculo/derivadas");
		const botao = derivadas.querySelector<HTMLButtonElement>(".apz-alternar")!;
		expect(botao.getAttribute("aria-expanded")).toBe("false");
		expect(derivadas.querySelector(".apz-detalhes")).toBeNull();
		clicar(botao);
		expect(botao.getAttribute("aria-expanded")).toBe("true");
		const detalhes = derivadas.querySelector(".apz-detalhes")!;
		expect(botao.getAttribute("aria-controls")).toBe(detalhes.id);
		expect(detalhes.textContent).toContain("Confunde derivada com razão incremental");
		expect(detalhes.textContent).toContain("2 eventos");
		const ids = [...detalhes.querySelectorAll(".apz-id")].map((id) => id.textContent);
		expect(ids).toContain("11111111");
		expect(ids).toContain("33333333");
		expect(detalhes.textContent).toContain("Eventos que entraram (3)");
		clicar(botao);
		expect(derivadas.querySelector(".apz-detalhes")).toBeNull();
		expect(botao.getAttribute("aria-expanded")).toBe("false");
	});

	it("sem confusões, diz que não há; a autoavaliação aparece como só informação", () => {
		desenhar();
		respondeIndicadores();
		clicar(linha("calculo/limites").querySelector(".apz-alternar")!);
		const detalhes = linha("calculo/limites").querySelector(".apz-detalhes")!;
		expect(detalhes.textContent).toContain("Nenhuma confusão observada ainda.");
		expect(detalhes.textContent).toContain("Nível 4 de 4");
		expect(detalhes.textContent).toContain("não entra no cálculo");
	});

	it("abrir os detalhes de uma linha não muda a estrutura (nem a altura) da linha fechada nem das outras", () => {
		desenhar();
		respondeIndicadores();
		const chaves = ordem() as string[];
		const antes = Object.fromEntries(chaves.map((chave) => [chave, linha(chave).querySelector(".apz-linha")!.outerHTML]));
		clicar(linha("calculo/derivadas").querySelector(".apz-alternar")!);
		for (const chave of chaves.filter((c) => c !== "calculo/derivadas")) {
			expect(linha(chave).querySelector(".apz-linha")!.outerHTML).toBe(antes[chave]);
		}
		// A linha aberta só muda o aria-expanded do botão; o resto da linha é o mesmo.
		const depois = linha("calculo/derivadas").querySelector(".apz-linha")!.outerHTML;
		expect(depois.replace('aria-expanded="true"', 'aria-expanded="false"')).toBe(antes["calculo/derivadas"]);
		clicar(linha("calculo/derivadas").querySelector(".apz-alternar")!);
		for (const chave of chaves) expect(linha(chave).querySelector(".apz-linha")!.outerHTML).toBe(antes[chave]);
		// A ordem das linhas é a mesma.
		expect(ordem()).toEqual(chaves);
	});

	it("o que está aberto continua aberto depois de trocar o filtro", () => {
		desenhar();
		respondeIndicadores();
		clicar(linha("fisica/series").querySelector(".apz-alternar")!);
		extras = { materia: "fisica" };
		desenhar();
		expect(linha("fisica/series").querySelector(".apz-detalhes")).not.toBeNull();
	});
});

describe("tela estreita e movimento", () => {
	it("a linha tem a mesma estrutura em todos os conceitos, com ou sem dados (a altura não depende do conteúdo)", () => {
		desenhar();
		respondeIndicadores();
		const forma = (chave: string) => [...linha(chave).querySelectorAll(".apz-linha > *, .apz-linha__topo > *, .apz-numeros > *, .apz-dito > *, .apz-dominio > *")].map((e) => e.className);
		const base = forma("calculo/limites");
		for (const chave of ordem() as string[]) expect(forma(chave).length).toBe(base.length);
	});

	it("nada na tela usa largura fixa em px nem rolagem para o lado (a largura vem do CSS)", () => {
		desenhar();
		respondeIndicadores();
		for (const elemento of container.querySelectorAll<HTMLElement>("*")) {
			const largura = elemento.style.width;
			// Só o preenchimento da barra tem largura inline, e é em porcentagem.
			if (largura) expect(largura).toMatch(/%$/);
		}
	});
});

describe("o carregando só depois de 1 s", () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.useFakeTimers();
	});

	it("o esqueleto fica escondido ocupando o lugar e aparece só se passar de 1 s; a resposta rápida nunca o mostra", () => {
		desenhar();
		const espera = () => achar<HTMLElement>(".aprendiz__espera");
		expect(espera().style.visibility).toBe("hidden");
		expect(espera().getAttribute("aria-hidden")).toBe("true");
		// O esqueleto tem as mesmas linhas, para o tamanho não pular quando os dados chegam.
		expect(espera().querySelectorAll(".apz-item--esqueleto")).toHaveLength(3);
		act(() => {
			vi.advanceTimersByTime(900);
		});
		expect(espera().style.visibility).toBe("hidden");
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(espera().style.visibility).toBe("visible");
		expect(espera().textContent).toContain("Calculando os indicadores…");
		respondeIndicadores();
		expect(container.querySelector(".aprendiz__espera")).toBeNull();
		expect(ordem().length).toBe(5);
	});

	it("uma resposta antes de 1 s: o texto de carregando nunca ficou visível", () => {
		desenhar();
		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(achar<HTMLElement>(".aprendiz__espera").style.visibility).toBe("hidden");
		respondeIndicadores();
		act(() => {
			vi.advanceTimersByTime(2000);
		});
		expect(container.querySelector(".aprendiz__espera")).toBeNull();
	});

	it("o 'Tentar de novo' só muda o rótulo para 'Tentando…' depois de 1 s", () => {
		desenhar();
		responde("erro", { mensagem: "Ruim." });
		const botao = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Tentar de novo"))!;
		clicar(botao);
		const ocultos = () => [...botao.querySelectorAll(".rotulo-estado__texto")].map((t) => t.hasAttribute("data-oculto"));
		// Repouso visível, passageiro oculto.
		expect(ocultos()).toEqual([false, true]);
		act(() => {
			vi.advanceTimersByTime(1100);
		});
		expect(ocultos()).toEqual([true, false]);
	});
});
