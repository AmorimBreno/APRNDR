// @vitest-environment happy-dom
// A tela do professor flutuante (TelaFlutuante.tsx) no DOM, com a ponte do Electron falsa e a janela do perfil
// falsa (o useJanelaPerfil e o usePerfis são trocados; o resto do @estudos/ui é o de verdade): a bolinha e o chat,
// arrastar contra clicar, a bolinha que nunca pede foco, a captura indo junto do enviar, a voz com a contagem de
// 2 s (Cancelar e a edição param) e os erros do microfone e do servidor. Nada aqui toca a rede nem a pasta de dados.

import type { JanelaPerfilHook } from "@estudos/ui";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PonteFlutuante } from "../desktop.ts";
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

interface Ponte extends PonteFlutuante {
	mudarModo(modo: "bolinha" | "chat"): void;
	alternarVoz(): void;
}
let modoInicial: "bolinha" | "chat";
let captura: { tipo: "image/jpeg"; dados: string; largura: number; altura: number } | null;

function criarPonte(): Ponte {
	let aoModo: ((modo: "bolinha" | "chat") => void) | undefined;
	let aoVoz: (() => void) | undefined;
	return {
		modo: vi.fn(async () => modoInicial),
		expandir: vi.fn(async () => {}),
		recolher: vi.fn(async () => {}),
		moverPara: vi.fn(),
		capturarTela: vi.fn(async () => captura),
		abrirApp: vi.fn(async () => {}),
		esconder: vi.fn(async () => {}),
		aoMudarModo: vi.fn((cb) => {
			aoModo = cb;
			return () => {
				aoModo = undefined;
			};
		}),
		aoAlternarVoz: vi.fn((cb) => {
			aoVoz = cb;
			return () => {
				aoVoz = undefined;
			};
		}),
		mudarModo: (modo) => aoModo?.(modo),
		alternarVoz: () => aoVoz?.(),
	};
}

let ponte: Ponte;

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

function desenhar(extra: { cabecalho?: typeof Cabecalho } = {}): void {
	root.render(createElement(TelaFlutuante, { perfilId: "estudos", ponte, ambienteVoz: voz.ambiente, ...extra }) as ReactNode as never);
}
const redesenhar = () => desenhar();

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
	modoInicial = "chat";
	captura = { tipo: "image/jpeg", dados: "AAAA", largura: 800, altura: 600 };
	ponte = criarPonte();
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

describe("a bolinha", () => {
	beforeEach(() => {
		modoInicial = "bolinha";
	});

	it("mostra a foto do agente padrão (aqui a inicial, sem avatar) e nenhum campo de texto", async () => {
		desenhar();
		await ate(() => bolinha() !== null);
		expect(bolinha()!.dataset.estado).toBe("parado");
		expect(container.querySelector(".bolinha__foto")?.textContent).toBe("P");
		expect(campo()).toBeNull();
		// A página fica transparente: a rota marca o html.
		expect(document.documentElement.classList.contains("rota-flutuante")).toBe(true);
		expect(document.documentElement.classList.contains("flutuante-chat")).toBe(false);
	});

	it("o anel acompanha o estado: pensando com o professor respondendo, ouvindo ao gravar", async () => {
		controle.executando = true;
		desenhar();
		await ate(() => bolinha() !== null);
		expect(bolinha()!.dataset.estado).not.toBe("parado");
		controle.executando = false;
		redesenhar();
		await ate(() => bolinha()!.dataset.estado === "parado");
		ponte.alternarVoz();
		await ate(() => bolinha()!.dataset.estado === "ouvindo");
		// A bolinha pede o chat para a voz ter onde mostrar o texto, e o tempo aparece nela.
		expect(ponte.expandir).toHaveBeenCalled();
		expect(container.querySelector<HTMLElement>(".bolinha__tempo")!.style.visibility).toBe("visible");
		expect(container.querySelector(".bolinha__tempo")?.textContent).toBe("0:00");
	});

	it("nunca pede foco", async () => {
		const foco = vi.spyOn(HTMLElement.prototype, "focus");
		desenhar();
		await ate(() => bolinha() !== null);
		ponteiro("pointerdown", 1100, 600);
		ponteiro("pointerup", 1100, 600);
		await esperar(30);
		expect(foco).not.toHaveBeenCalled();
		expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
	});

	it("soltar sem ter arrastado expande; um movimento de até 3 px ainda é um clique", async () => {
		desenhar();
		await ate(() => bolinha() !== null);
		ponteiro("pointerdown", 1100, 600);
		ponteiro("pointermove", 1102, 601);
		ponteiro("pointerup", 1102, 601);
		expect(ponte.expandir).toHaveBeenCalledTimes(1);
		expect(ponte.moverPara).not.toHaveBeenCalled();
	});

	it("depois de 4 px é arrasto: a janela anda com o ponteiro e soltar não expande", async () => {
		desenhar();
		await ate(() => bolinha() !== null);
		ponteiro("pointerdown", 1100, 600); // o ponteiro está a (100, 100) do canto da janela
		ponteiro("pointermove", 1110, 600);
		ponteiro("pointermove", 1140, 650);
		ponteiro("pointerup", 1140, 650);
		expect(ponte.expandir).not.toHaveBeenCalled();
		expect(ponte.moverPara).toHaveBeenCalled();
		// O canto da janela é o ponteiro menos o deslocamento do clique: (1140 - 100, 650 - 100) no fim.
		expect(vi.mocked(ponte.moverPara).mock.calls.at(-1)).toEqual([1040, 550]);
		// Um pedido por quadro: dois movimentos seguidos não viram dois pedidos antes de soltar.
		expect(vi.mocked(ponte.moverPara).mock.calls.length).toBeLessThanOrEqual(2);
	});

	it("o botão direito não expande e abre o menu com 'Abrir o app' e 'Esconder a bolinha'", async () => {
		desenhar();
		await ate(() => bolinha() !== null);
		corpo().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
		await ate(() => botaoTexto("Abrir o app") !== undefined);
		expect(ponte.expandir).not.toHaveBeenCalled();
		botaoTexto("Esconder a bolinha")!.click();
		expect(ponte.esconder).toHaveBeenCalledTimes(1);
		await ate(() => botaoTexto("Abrir o app") === undefined);
		corpo().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
		await ate(() => botaoTexto("Abrir o app") !== undefined);
		botaoTexto("Abrir o app")!.click();
		expect(ponte.abrirApp).toHaveBeenCalledTimes(1);
	});

	it("a ponte manda o modo chat e a tela vira o chat, com o fundo de sempre", async () => {
		desenhar();
		await ate(() => bolinha() !== null);
		ponte.mudarModo("chat");
		await ate(() => campo() !== null);
		expect(bolinha()).toBeNull();
		await ate(() => document.documentElement.classList.contains("flutuante-chat"));
	});
});

describe("o chat compacto", () => {
	it("mostra o topo do perfil, Recolher e Abrir o app, e põe o foco no campo", async () => {
		desenhar({ cabecalho: Cabecalho });
		await ate(() => campo() !== null);
		expect(container.querySelector(".cab-teste")?.textContent).toBe("cabecalho:estudos");
		await ate(() => document.activeElement === campo());
		botaoTexto("Recolher")!.click();
		expect(ponte.recolher).toHaveBeenCalledTimes(1);
		botaoTexto("Abrir o app")!.click();
		expect(ponte.abrirApp).toHaveBeenCalledTimes(1);
	});

	it("sem ponte (navegador comum) é só o chat, sem câmera nem Recolher", async () => {
		root.render(createElement(TelaFlutuante, { perfilId: "estudos", ambienteVoz: voz.ambiente }));
		await ate(() => campo() !== null);
		expect(botao("Olha minha página")).toBeNull();
		expect(botaoTexto("Recolher")).toBeUndefined();
		expect(botao("Gravar a voz")).not.toBeNull();
	});

	it("recolher e expandir não perdem o rascunho", async () => {
		desenhar();
		await ate(() => campo() !== null);
		escrever("uma dúvida");
		ponte.mudarModo("bolinha");
		await ate(() => bolinha() !== null);
		ponte.mudarModo("chat");
		await ate(() => campo() !== null);
		expect(campo()!.value).toBe("uma dúvida");
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
