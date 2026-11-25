// @vitest-environment happy-dom
// A tela do professor flutuante (TelaFlutuante.tsx) no DOM, com as pontes do Electron falsas e a janela do perfil
// falsa (o useJanelaPerfil e o usePerfis são trocados; o resto do @estudos/ui é o de verdade). São duas páginas:
// a da bolinha (arrastar contra clicar, nunca pede foco, o anel pelo estado e pelo aviso de "ouvindo") e a do balão
// (o chat com a pontinha no lado da disposição, a captura indo junto do enviar, a voz com a contagem de 2 s e avisando
// o Electron, os erros do microfone e do servidor). Nada aqui toca a rede nem a pasta de dados.

import type { JanelaPerfilHook } from "@estudos/ui";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Disposicao, PonteBalao, PonteFlutuante } from "../desktop.ts";
import type { AmbienteVoz } from "../useVoz.ts";

interface Controle {
	executando: boolean;
	sessao: boolean;
	enviar: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<unknown>>>;
}
const controle: Controle = { executando: false, sessao: true, enviar: vi.fn<(...args: unknown[]) => Promise<unknown>>() };

vi.mock("@estudos/ui", async (original) => {
	const real = await original<typeof import("@estudos/ui")>();
	const acoes = {
		enviar: (...args: unknown[]) => controle.enviar(...args),
		abortar: async () => [],
		trocarModelo: async () => ({}),
		listarModelos: async () => [],
		acaoDaInterface: async () => {},
	};
	return {
		...real,
		useJanelaPerfil: (perfil: string) => ({
			estado: {
				...real.estadoInicial(perfil),
				pronto: true,
				executando: controle.executando,
				...(controle.sessao ? { sessao: { perfil, sessaoId: "s1", agente: "professor", raciocinio: "", ferramentas: [], skills: [], diagnosticos: [] } } : {}),
			},
			conexao: "aberta",
			acoes,
		}),
		usePerfis: () => ({
			lista: { perfis: [{ id: "estudos", nome: "Estudos", agentes: [{ nome: "professor", papel: "ensina" }], agentePadrao: "professor", paineis: [], aberto: true, aparencia: {} }], erros: [] },
			carregando: false,
			recarregar: () => {},
		}),
	};
});

const { TelaFlutuante, TEXTO_OLHA_MINHA_PAGINA } = await import("./TelaFlutuante.tsx");

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

let container: HTMLDivElement;
let root: Root;

/** A ponte da bolinha, mais o que o teste usa para fingir o Electron. */
interface PonteDaBolinha extends PonteFlutuante {
	alternarBalao: ReturnType<typeof vi.fn<() => Promise<void>>>;
	moverPara: ReturnType<typeof vi.fn<(x: number, y: number) => void>>;
	ouvir(ouvindo: boolean, segundos: number): void;
}
/** A ponte do balão, mais o que o teste usa para fingir o Electron. */
interface PonteDoBalao extends PonteBalao {
	mudarDisposicao(disposicao: Disposicao): void;
	alternarVoz(): void;
	avisarVoz: ReturnType<typeof vi.fn<(ouvindo: boolean, segundos: number) => void>>;
}

/** O balão à direita da bolinha: a janela dele tem 434 px (14 de vão e 420 de balão). */
const DISPOSICAO_DIREITA: Disposicao = { balao: { x: 1090, y: 500, width: 434, height: 620 }, lado: "direita", ponta: { y: 38 } };
/** O balão à esquerda; a bolinha embaixo. */
const DISPOSICAO_ESQUERDA: Disposicao = { balao: { x: 1000, y: 500, width: 434, height: 620 }, lado: "esquerda", ponta: { y: 582 } };
let disposicaoInicial: Disposicao | null = DISPOSICAO_DIREITA;
let captura: { tipo: "image/jpeg"; dados: string; largura: number; altura: number } | null;

function criarPonteDaBolinha(): PonteDaBolinha {
	let aoOuvir: ((ouvindo: boolean, segundos: number) => void) | undefined;
	return {
		alternarBalao: vi.fn(async () => {}),
		moverPara: vi.fn(),
		abrirApp: vi.fn(async () => {}),
		esconder: vi.fn(async () => {}),
		aoOuvindo: vi.fn((cb) => {
			aoOuvir = cb;
			return () => {
				aoOuvir = undefined;
			};
		}),
		ouvir: (ouvindo, segundos) => aoOuvir?.(ouvindo, segundos),
	};
}

function criarPonteDoBalao(): PonteDoBalao {
	let aoDisposicao: ((disposicao: Disposicao) => void) | undefined;
	let aoVoz: (() => void) | undefined;
	return {
		disposicao: vi.fn(async () => disposicaoInicial),
		aoMudarDisposicao: vi.fn((cb) => {
			aoDisposicao = cb;
			return () => {
				aoDisposicao = undefined;
			};
		}),
		fecharBalao: vi.fn(async () => {}),
		capturarTela: vi.fn(async () => captura),
		abrirApp: vi.fn(async () => {}),
		aoAlternarVoz: vi.fn((cb) => {
			aoVoz = cb;
			return () => {
				aoVoz = undefined;
			};
		}),
		avisarVoz: vi.fn(),
		mudarDisposicao: (disposicao) => aoDisposicao?.(disposicao),
		alternarVoz: () => aoVoz?.(),
	};
}

let ponteBolinha: PonteDaBolinha;
let ponte: PonteDoBalao;

interface Voz {
	ambiente: AmbienteVoz;
	buscar: ReturnType<typeof vi.fn>;
	microfoneNegado: boolean;
	resposta: { ok: boolean; corpo: unknown };
}
let voz: Voz;

function criarVoz(): Voz {
	const estado: Voz = {
		microfoneNegado: false,
		resposta: { ok: true, corpo: { texto: "explica derivada" } },
		buscar: vi.fn(),
		ambiente: undefined as never,
	};
	estado.buscar = vi.fn(async () => ({ ok: estado.resposta.ok, status: estado.resposta.ok ? 200 : 500, json: async () => estado.resposta.corpo }));
	estado.ambiente = {
		obterMicrofone: async () => {
			if (estado.microfoneNegado) throw new Error("negado");
			return { getTracks: () => [] } as unknown as MediaStream;
		},
		iniciarCaptacao: () => ({ parar: async () => ({ blocos: [new Float32Array(16000).fill(0.1)], taxa: 16000 }) }),
		buscar: estado.buscar as unknown as typeof fetch,
		agora: () => Date.now(),
	};
	return estado;
}

const Cabecalho = ({ janela }: { janela: JanelaPerfilHook }) => createElement("span", { className: "cab-teste" }, `cabecalho:${janela.estado.perfil}`);

/** A página do balão (rota "#/flutuante/<perfil>/balao"). */
function desenhar(extra: { cabecalho?: typeof Cabecalho } = {}): void {
	root.render(createElement(TelaFlutuante, { perfilId: "estudos", balao: true, ponteBalao: ponte, ambienteVoz: voz.ambiente, ...extra }) as ReactNode as never);
}
/** A página da bolinha (rota "#/flutuante/<perfil>"). */
function desenharBolinha(): void {
	root.render(createElement(TelaFlutuante, { perfilId: "estudos", ponte: ponteBolinha }) as ReactNode as never);
}
const redesenharBolinha = desenharBolinha;

const bolinha = () => container.querySelector<HTMLElement>(".bolinha");
const corpo = () => container.querySelector<HTMLElement>(".bolinha__corpo")!;
const campo = () => container.querySelector<HTMLTextAreaElement>("textarea");
const botao = (rotulo: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);
const botaoTexto = (texto: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === texto);
const chip = (rotulo: string) => container.querySelector(`[aria-label="${rotulo}"]`);

function escrever(texto: string): void {
	const alvo = campo()!;
	Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(alvo, texto);
	alvo.dispatchEvent(new Event("input", { bubbles: true }));
}
function ponteiro(tipo: "pointerdown" | "pointermove" | "pointerup", x: number, y: number, extra: MouseEventInit = {}): void {
	corpo().dispatchEvent(new MouseEvent(tipo, { bubbles: true, button: 0, screenX: x, screenY: y, clientX: x - 1000, clientY: y - 500, ...extra }));
}

beforeEach(() => {
	controle.executando = false;
	controle.sessao = true;
	controle.enviar = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => "iniciada");
	disposicaoInicial = DISPOSICAO_DIREITA;
	captura = { tipo: "image/jpeg", dados: "AAAA", largura: 800, altura: 600 };
	ponteBolinha = criarPonteDaBolinha();
	ponte = criarPonteDoBalao();
	voz = criarVoz();
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	root.unmount();
	container.remove();
	document.documentElement.className = "";
	await esperar(10);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("a página da bolinha", () => {
	it("mostra só a foto do agente padrão (aqui a inicial, sem avatar), sem campo de texto nem balão, e a página fica transparente", async () => {
		desenharBolinha();
		await ate(() => bolinha() !== null);
		expect(bolinha()!.dataset.estado).toBe("parado");
		expect(container.querySelector(".bolinha__foto")?.textContent).toBe("P");
		expect(campo()).toBeNull();
		expect(container.querySelector(".flutuante-balao")).toBeNull();
		await ate(() => document.documentElement.classList.contains("rota-flutuante"));
		expect(document.documentElement.classList.contains("flutuante-solto")).toBe(false);
		expect(document.documentElement.classList.contains("flutuante-chat")).toBe(false);
	});

	it("o anel acompanha o estado: pensando com o professor respondendo", async () => {
		controle.executando = true;
		desenharBolinha();
		await ate(() => bolinha() !== null);
		expect(bolinha()!.dataset.estado).not.toBe("parado");
		controle.executando = false;
		redesenharBolinha();
		await ate(() => bolinha()!.dataset.estado === "parado");
	});

	it("ouvindo e os segundos vêm do Electron (a voz vive no balão), e o tempo ocupa sempre o mesmo lugar", async () => {
		desenharBolinha();
		await ate(() => bolinha() !== null);
		const tempo = container.querySelector<HTMLElement>(".bolinha__tempo")!;
		expect(tempo.style.visibility).toBe("hidden");
		ponteBolinha.ouvir(true, 7);
		await ate(() => bolinha()!.dataset.estado === "ouvindo");
		expect(container.querySelector<HTMLElement>(".bolinha__tempo")).toBe(tempo);
		expect(tempo.style.visibility).toBe("visible");
		expect(tempo.textContent).toBe("0:07");
		ponteBolinha.ouvir(false, 0);
		await ate(() => bolinha()!.dataset.estado === "parado");
		expect(tempo.style.visibility).toBe("hidden");
	});

	it("nunca pede foco", async () => {
		const foco = vi.spyOn(HTMLElement.prototype, "focus");
		desenharBolinha();
		await ate(() => bolinha() !== null);
		ponteiro("pointerdown", 1100, 600);
		ponteiro("pointerup", 1100, 600);
		await esperar(30);
		expect(foco).not.toHaveBeenCalled();
		expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
	});

	it("soltar sem ter arrastado alterna o balão; um movimento de até 3 px ainda é um clique", async () => {
		desenharBolinha();
		await ate(() => bolinha() !== null);
		ponteiro("pointerdown", 1100, 600);
		ponteiro("pointermove", 1102, 601);
		ponteiro("pointerup", 1102, 601);
		expect(ponteBolinha.alternarBalao).toHaveBeenCalledTimes(1);
		expect(ponteBolinha.moverPara).not.toHaveBeenCalled();
		// De novo: a página não guarda o estado do balão, quem decide abrir ou fechar é o Electron.
		ponteiro("pointerdown", 1100, 600);
		ponteiro("pointerup", 1100, 600);
		expect(ponteBolinha.alternarBalao).toHaveBeenCalledTimes(2);
	});

	it("depois de 4 px é arrasto: a janela anda com o ponteiro e soltar não alterna o balão", async () => {
		// A janela está em (1000, 500) na tela; o alvo sai de window.screenX/Y mais o ponto dentro dela.
		vi.spyOn(window, "screenX", "get").mockReturnValue(1000);
		vi.spyOn(window, "screenY", "get").mockReturnValue(500);
		desenharBolinha();
		await ate(() => bolinha() !== null);
		ponteiro("pointerdown", 1100, 600); // o ponteiro está a (100, 100) do canto da janela
		ponteiro("pointermove", 1110, 600);
		ponteiro("pointermove", 1140, 650);
		ponteiro("pointerup", 1140, 650);
		expect(ponteBolinha.alternarBalao).not.toHaveBeenCalled();
		expect(ponteBolinha.moverPara).toHaveBeenCalled();
		// O canto da janela é o ponteiro menos o deslocamento do clique: (1140 - 100, 650 - 100) no fim.
		await ate(() => JSON.stringify(vi.mocked(ponteBolinha.moverPara).mock.calls.at(-1)) === JSON.stringify([1040, 550]));
		// Um pedido por vez: o do meio, que chegou com outro a caminho, foi trocado pelo mais novo.
		await ate(() => vi.mocked(ponteBolinha.moverPara).mock.calls.length >= 2);
		expect(vi.mocked(ponteBolinha.moverPara).mock.calls.length).toBeLessThanOrEqual(3);
		vi.restoreAllMocks();
	});

	it("o botão direito não alterna o balão e abre o menu com 'Abrir o app' e 'Esconder o professor'", async () => {
		desenharBolinha();
		await ate(() => bolinha() !== null);
		corpo().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
		await ate(() => botaoTexto("Abrir o app") !== undefined);
		expect(ponteBolinha.alternarBalao).not.toHaveBeenCalled();
		botaoTexto("Esconder o professor")!.click();
		expect(ponteBolinha.esconder).toHaveBeenCalledTimes(1);
		await ate(() => botaoTexto("Abrir o app") === undefined);
		corpo().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
		await ate(() => botaoTexto("Abrir o app") !== undefined);
		botaoTexto("Abrir o app")!.click();
		expect(ponteBolinha.abrirApp).toHaveBeenCalledTimes(1);
	});

	it("com o menu nativo na ponte, o botão direito o pede e não desenha o da tela", async () => {
		ponteBolinha.menu = vi.fn(async () => {});
		desenharBolinha();
		await ate(() => bolinha() !== null);
		corpo().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
		expect(ponteBolinha.menu).toHaveBeenCalledTimes(1);
		expect(botaoTexto("Abrir o app")).toBeUndefined();
	});
});

describe("a página do balão", () => {
	const balao = () => container.querySelector<HTMLElement>(".flutuante-balao");

	it("mostra o topo do perfil e Abrir o app (sem Recolher), sem pôr o foco no campo (o teclado virtual não abre sozinho)", async () => {
		desenhar({ cabecalho: Cabecalho });
		await ate(() => campo() !== null);
		expect(container.querySelector(".cab-teste")?.textContent).toBe("cabecalho:estudos");
		await new Promise((pronto) => setTimeout(pronto, 50));
		expect(document.activeElement).not.toBe(campo());
		expect(botaoTexto("Recolher")).toBeUndefined();
		botaoTexto("Abrir o app")!.click();
		expect(ponte.abrirApp).toHaveBeenCalledTimes(1);
	});

	it("a página é transparente e liga o arrasto pelo topo; a bolinha não é desenhada aqui", async () => {
		desenhar();
		await ate(() => balao() !== null);
		await ate(() => document.documentElement.classList.contains("flutuante-chat"));
		expect(document.documentElement.classList.contains("rota-flutuante")).toBe(true);
		expect(document.documentElement.classList.contains("flutuante-solto")).toBe(false);
		expect(bolinha()).toBeNull();
	});

	it("com o balão à direita da bolinha, a pontinha fica do lado esquerdo, na altura da disposição", async () => {
		desenhar();
		await ate(() => balao() !== null);
		expect(balao()!.dataset.lado).toBe("direita");
		expect(balao()!.style.transformOrigin).toMatch(/^0(px)? 38px$/);
		expect(container.querySelector<HTMLElement>(".flutuante-balao__ponta")!.style.top).toBe("32px");
	});

	it("com o balão à esquerda, a pontinha vai para o outro lado", async () => {
		disposicaoInicial = DISPOSICAO_ESQUERDA;
		desenhar();
		await ate(() => balao()?.dataset.lado === "esquerda");
		expect(balao()!.style.transformOrigin).toBe("100% 582px");
		expect(container.querySelector<HTMLElement>(".flutuante-balao__ponta")!.style.top).toBe("576px");
	});

	it("uma disposição nova (o balão abriu de novo, noutro canto) troca o lado sem remontar o chat nem perder o rascunho", async () => {
		desenhar();
		await ate(() => campo() !== null);
		escrever("uma dúvida");
		const antes = campo();
		ponte.mudarDisposicao(DISPOSICAO_ESQUERDA);
		await ate(() => balao()?.dataset.lado === "esquerda");
		expect(campo()).toBe(antes);
		expect(campo()!.value).toBe("uma dúvida");
		ponte.mudarDisposicao(DISPOSICAO_DIREITA);
		await ate(() => balao()?.dataset.lado === "direita");
		expect(campo()!.value).toBe("uma dúvida");
	});

	it("uma disposição estragada é ignorada", async () => {
		desenhar();
		await ate(() => balao() !== null);
		ponte.mudarDisposicao({ lado: "cima" } as unknown as Disposicao);
		await esperar(30);
		expect(balao()!.dataset.lado).toBe("direita");
	});

	it("a animação de surgir recomeça quando a disposição chega e quando a janela fica visível", async () => {
		desenhar();
		await ate(() => balao() !== null);
		await ate(() => vi.mocked(ponte.aoMudarDisposicao).mock.calls.length > 0);
		await esperar(30);
		// Reiniciar a animação força o recálculo do layout (offsetWidth); conta quantas vezes isso acontece.
		const leituras = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get");
		ponte.mudarDisposicao(DISPOSICAO_ESQUERDA);
		await ate(() => leituras.mock.calls.length >= 1);
		const depoisDaDisposicao = leituras.mock.calls.length;
		document.dispatchEvent(new Event("visibilitychange"));
		await ate(() => leituras.mock.calls.length > depoisDaDisposicao);
		// A animação inline volta a "" (vale a da classe, que o movimento reduzido desliga no CSS).
		expect(balao()!.style.animation).toBe("");
	});

	it("sem ponte (navegador comum) é só o chat, sem câmera nem Recolher, e a página mantém o fundo e o zoom de sempre", async () => {
		root.render(createElement(TelaFlutuante, { perfilId: "estudos", balao: true, ambienteVoz: voz.ambiente }));
		await ate(() => campo() !== null);
		expect(botao("Olha minha página")).toBeNull();
		expect(botaoTexto("Recolher")).toBeUndefined();
		expect(botao("Gravar a voz")).not.toBeNull();
		expect(balao()).toBeNull();
		await ate(() => document.documentElement.classList.contains("flutuante-solto"));
		expect(document.documentElement.classList.contains("flutuante-chat")).toBe(false);
	});
});

describe("Olha minha página", () => {
	it("a captura vira o chip 'Captura da tela', com miniatura e X, e o campo vazio já leva o pedido de sempre", async () => {
		desenhar();
		await ate(() => botao("Olha minha página") !== null);
		botao("Olha minha página")!.click();
		await ate(() => chip("Captura da tela") !== null);
		expect(ponte.capturarTela).toHaveBeenCalledTimes(1);
		expect(container.querySelector<HTMLImageElement>(".flutuante__miniatura")!.src).toBe("data:image/jpeg;base64,AAAA");
		expect(campo()!.value).toBe(TEXTO_OLHA_MINHA_PAGINA);
		// O X tira a captura e o texto-modelo que ela trouxe.
		botao("Remover a captura da tela")!.click();
		await ate(() => chip("Captura da tela") === null);
		expect(campo()!.value).toBe("");
	});

	it("vai junto da próxima mensagem e some depois", async () => {
		desenhar();
		await ate(() => botao("Olha minha página") !== null);
		botao("Olha minha página")!.click();
		await ate(() => chip("Captura da tela") !== null);
		escrever("o que acha deste exercício?");
		await ate(() => !botao("Enviar")!.disabled);
		botao("Enviar")!.click();
		await ate(() => controle.enviar.mock.calls.length === 1);
		expect(controle.enviar.mock.calls[0]).toEqual(["o que acha deste exercício?", undefined, [{ tipo: "image/jpeg", dados: "AAAA" }]]);
		await ate(() => chip("Captura da tela") === null);
		// A mensagem seguinte vai sem imagem.
		escrever("e este?");
		await ate(() => !botao("Enviar")!.disabled);
		botao("Enviar")!.click();
		await ate(() => controle.enviar.mock.calls.length === 2);
		expect(controle.enviar.mock.calls[1]![2]).toBeUndefined();
	});

	it("com o campo vazio, só Enter manda 'Olha minha página: …' com a imagem", async () => {
		desenhar();
		await ate(() => botao("Olha minha página") !== null);
		botao("Olha minha página")!.click();
		await ate(() => campo()!.value === TEXTO_OLHA_MINHA_PAGINA);
		botao("Enviar")!.click();
		await ate(() => controle.enviar.mock.calls.length === 1);
		expect(controle.enviar.mock.calls[0]![0]).toBe(TEXTO_OLHA_MINHA_PAGINA);
		expect(controle.enviar.mock.calls[0]![2]).toEqual([{ tipo: "image/jpeg", dados: "AAAA" }]);
	});

	it("captura que falha mostra a frase e não deixa chip", async () => {
		captura = null;
		desenhar();
		await ate(() => botao("Olha minha página") !== null);
		botao("Olha minha página")!.click();
		await ate(() => container.querySelector('[role="alert"]') !== null);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não consegui capturar a tela.");
		expect(chip("Captura da tela")).toBeNull();
	});
});

describe("a voz", () => {
	const gravar = async () => {
		botao("Gravar a voz")!.click();
		await ate(() => botao("Parar de gravar") !== null);
	};
	const parar = () => botao("Parar de gravar")!.click();

	it("grava, transcreve no servidor, põe o texto no campo e envia sozinho depois de 2 s", async () => {
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		await gravar();
		expect(container.querySelector(".flutuante__chip--gravando")?.textContent).toContain("Gravando · 0:0");
		parar();
		await ate(() => campo()!.value === "explica derivada");
		expect(voz.buscar).toHaveBeenCalledTimes(1);
		const [url, init] = voz.buscar.mock.calls[0] as [string, { method: string; body: string }];
		expect(url).toBe("/api/transcrever");
		expect(init.method).toBe("POST");
		const corpo = JSON.parse(init.body) as { perfil: string; audio: string; formato: string };
		expect(corpo).toMatchObject({ perfil: "estudos", formato: "wav" });
		expect(atob(corpo.audio).slice(0, 4)).toBe("RIFF");
		expect(container.textContent).toContain("Envia em 2 s");
		expect(controle.enviar).not.toHaveBeenCalled();
		await ate(() => controle.enviar.mock.calls.length === 1, 4000);
		expect(controle.enviar.mock.calls[0]![0]).toBe("explica derivada");
		await ate(() => campo()!.value === "");
		expect(container.textContent).not.toContain("Envia em");
	}, 10000);

	it("o atalho alterna: com o chat aberto, o mesmo atalho começa e para", async () => {
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		await ate(() => vi.mocked(ponte.aoAlternarVoz).mock.calls.length > 0);
		ponte.alternarVoz();
		await ate(() => botao("Parar de gravar") !== null);
		ponte.alternarVoz();
		await ate(() => campo()!.value === "explica derivada");
	});

	it("Cancelar para a contagem e o texto fica no campo", async () => {
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		await gravar();
		parar();
		await ate(() => botaoTexto("Cancelar") !== undefined);
		botaoTexto("Cancelar")!.click();
		await ate(() => botaoTexto("Cancelar") === undefined);
		await esperar(2300);
		expect(controle.enviar).not.toHaveBeenCalled();
		expect(campo()!.value).toBe("explica derivada");
	}, 10000);

	it("qualquer edição do campo também para a contagem", async () => {
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		await gravar();
		parar();
		await ate(() => botaoTexto("Cancelar") !== undefined);
		escrever("explica derivada, por favor");
		await ate(() => botaoTexto("Cancelar") === undefined);
		await esperar(2300);
		expect(controle.enviar).not.toHaveBeenCalled();
	}, 10000);

	it("microfone negado: 'Não consegui usar o microfone.' e nada é gravado", async () => {
		voz.microfoneNegado = true;
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		botao("Gravar a voz")!.click();
		await ate(() => container.querySelector('[role="alert"]') !== null);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não consegui usar o microfone.");
		expect(botao("Gravar a voz")).not.toBeNull();
		expect(voz.buscar).not.toHaveBeenCalled();
		// O X fecha o aviso.
		botao("Fechar o aviso")!.click();
		await ate(() => container.querySelector('[role="alert"]') === null);
	});

	it("o erro do servidor aparece com a frase dele e o campo continua vazio", async () => {
		voz.resposta = { ok: false, corpo: { erro: "A chave do OpenRouter não está configurada." } };
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		await gravar();
		parar();
		await ate(() => container.querySelector('[role="alert"]') !== null);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("A chave do OpenRouter não está configurada.");
		expect(campo()!.value).toBe("");
		expect(controle.enviar).not.toHaveBeenCalled();
	});

	it("uma gravação sem fala (texto vazio) avisa e não envia", async () => {
		voz.resposta = { ok: true, corpo: { texto: "  " } };
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		await gravar();
		parar();
		await ate(() => container.querySelector('[role="alert"]') !== null);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não entendi");
	});

	it("o chip e os botões não mudam de tamanho entre os estados (a faixa é a mesma)", async () => {
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		const faixa = container.querySelector(".flutuante__faixa");
		const botoes = container.querySelector(".flutuante__botoes");
		expect(faixa).not.toBeNull();
		await gravar();
		// As mesmas faixas e o mesmo contêiner de botões continuam no lugar (o chip é filho da faixa, não a empurra).
		expect(container.querySelector(".flutuante__faixa")).toBe(faixa);
		expect(container.querySelector(".flutuante__botoes")).toBe(botoes);
		parar();
		await ate(() => campo()!.value === "explica derivada");
		expect(container.querySelector(".flutuante__faixa")).toBe(faixa);
	});
});

describe("a voz avisa a bolinha pelo Electron", () => {
	it("começa a gravar: avisarVoz(true, segundos); para: avisarVoz(false, 0)", async () => {
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		// Ao montar, o balão diz que não está gravando (a bolinha começa parada).
		await ate(() => ponte.avisarVoz.mock.calls.length > 0);
		expect(ponte.avisarVoz).toHaveBeenLastCalledWith(false, 0);
		botao("Gravar a voz")!.click();
		await ate(() => botao("Parar de gravar") !== null);
		await ate(() => ponte.avisarVoz.mock.calls.some(([ouvindo]) => ouvindo === true));
		expect(ponte.avisarVoz.mock.calls.at(-1)![0]).toBe(true);
		botao("Parar de gravar")!.click();
		await ate(() => ponte.avisarVoz.mock.calls.at(-1)![0] === false);
		expect(ponte.avisarVoz).toHaveBeenLastCalledWith(false, 0);
	});

	it("o atalho global (Ctrl+Alt+Espaço) no balão já aberto começa a gravar e avisa a bolinha", async () => {
		desenhar();
		await ate(() => botao("Gravar a voz") !== null);
		await ate(() => vi.mocked(ponte.aoAlternarVoz).mock.calls.length > 0);
		ponte.alternarVoz();
		await ate(() => botao("Parar de gravar") !== null);
		await ate(() => ponte.avisarVoz.mock.calls.some(([ouvindo]) => ouvindo === true));
	});
});
