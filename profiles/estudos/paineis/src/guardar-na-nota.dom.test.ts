// @vitest-environment happy-dom
// "Ir ao trecho" e "Guardar na nota" na conversa do professor, no DOM (parte C1, WP3;
// docs/mesa-parte-c.md, seção 5): uma conversa de verdade (DocumentoConversa do núcleo) com os ganchos
// da mesa, o provedor do Vendo e uma janela falsa em que a ponte de notas responde como a extensão.
// Nada aqui toca a pasta de dados nem a rede.

import { DocumentoConversa, type AcaoRecebida, type ItemConversa, type JanelaPerfilHook } from "@estudos/ui";
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DURACAO_GUARDADO_MS } from "./GuardarNaNota.tsx";
import { useGanchosDaConversa } from "./ganchos-conversa.tsx";
import { ContextoMesa, type ValorMesa } from "./mesa-ir.ts";
import { formatarOrigem } from "./origem-mesa.ts";
import type { FonteVendo, ResultadoInserir } from "./vendo.ts";
import { ProvedorVendo, useVendo, type ValorVendoMesa } from "./vendo.tsx";

const PERFIL = "estudos";
const MATERIA = "calc";
const SESSAO = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";
const NOTA = "caderno/calc/notas/Séries";
const LICAO = "caderno/calc/cursos/c1/modulos/m1";

type Usuario = Extract<ItemConversa, { tipo: "usuario" }>;
const usuario = (chave: string, contextosTela?: Usuario["contextosTela"]): ItemConversa => ({ tipo: "usuario", chave, texto: "o que é isto?", ...(contextosTela ? { contextosTela } : {}) });
const resposta = (chave: string, texto: string, emAndamento = false): ItemConversa => ({ tipo: "assistente", chave, texto, raciocinio: "", emAndamento });
const ferramenta = (chave: string): ItemConversa => ({ tipo: "ferramenta", chave, chamada: { id: chave, nome: "ler_nota", argumentos: {}, status: "ok" } });
const ORIGEM_ANCORADA = formatarOrigem(NOTA, { bloco: "Convergência", antes: "a série ", depois: " converge" });
const comFoco = (selecao: string | null = "geométrica") => [{ tipo: "nota" as const, rotulo: "Séries", origem: ORIGEM_ANCORADA, olho: true, foco: true, ...(selecao !== null ? { selecao } : {}) }];

interface Controle {
	conversa: ItemConversa[];
	executando: boolean;
	acoesPorPainel: Record<string, AcaoRecebida[]>;
	sessaoId: string | undefined;
	/** A chave da aba em foco de agora (a mesa guarda isto). */
	chaveFoco: string | undefined;
	/** O id da matéria da mesa (uma própria quando o teste não pode herdar a lista de notas lembrada de outro). */
	materia: string;
	/** A nota aberta no editor (registrada no Vendo como a EditorNota faz), se o teste quiser. */
	fonte: { origem: string; inserir: (markdown: string) => ResultadoInserir } | undefined;
	irPara: ReturnType<typeof vi.fn>;
	mesa: ValorMesa;
	acoes: { acaoDaInterface(painel: string, acao: string, dados: Record<string, unknown>): Promise<void> };
	comMesa: boolean;
	/** Cada chamada de acaoDaInterface, em ordem. */
	enviadas: Array<{ painel: string; acao: string; dados: Record<string, unknown> }>;
	/** Como a "extensão" reage a uma ação (responde pela ponte); lança para simular a troca de sessão. */
	extensao: (painel: string, acao: string, dados: Record<string, unknown>) => void | Promise<void>;
	vendo: ValorVendoMesa | undefined;
	receber(painel: string, acao: string, dados: unknown): void;
	renderizar(): void;
	notas: Array<{ titulo: string; modificadaEm: string; tamanho: number; previa: string }>;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;
let contadorAcoes = 0;

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

/** A conversa com os ganchos da mesa, como a MesaEstudo os passa à conversa embutida. */
function ConversaDaMesa({ janela }: { janela: JanelaPerfilHook }) {
	const ganchos = useGanchosDaConversa({ janela, materiaId: controle.materia, chaveFoco: () => controle.chaveFoco });
	controle.vendo = useVendo();
	return createElement(DocumentoConversa, { conversa: janela.estado.conversa, rodapeDaResposta: ganchos.rodapeDaResposta, acoesDoBloco: ganchos.acoesDoBloco });
}

function Bancada() {
	const fonte = controle.fonte;
	const janela = {
		estado: { perfil: PERFIL, ...(controle.sessaoId ? { sessao: { sessaoId: controle.sessaoId } } : {}), conversa: controle.conversa, executando: controle.executando, acoesPorPainel: controle.acoesPorPainel, pedidos: [], registrosPedidos: {} },
		conexao: "aberta",
		// Estáveis, como no app (o hook da janela memoriza as ações): senão cada render pediria a lista de novo.
		acoes: controle.acoes,
	} as unknown as JanelaPerfilHook;
	const mesa = controle.mesa;
	const arvore = createElement("div", null, createElement(ConversaDaMesa, { janela }), fonte ? createElement(FonteFalsa, fonte) : null);
	return createElement(ProvedorVendo, { perfilId: PERFIL, materiaId: controle.materia, children: controle.comMesa ? createElement(ContextoMesa.Provider, { value: mesa }, arvore) : arvore });
}

/** Registra uma fonte falsa de nota no Vendo (como o EditorNota faz) e devolve o inserirNoBuffer espiado. */
function FonteFalsa({ origem, inserir }: { origem: string; inserir: (markdown: string) => ResultadoInserir }) {
	const vendo = useVendo();
	useEffect(() => {
		const fonte: FonteVendo = { tipo: "nota", rotulo: "Séries", origem, texto: () => "# Séries\n\ntexto", inserirNoBuffer: inserir };
		return vendo.registrar(fonte);
	}, [vendo.registrar, origem, inserir]);
	return null;
}

beforeEach(() => {
	contadorAcoes = 0;
	controle = {
		conversa: [usuario("hu1", comFoco()), resposta("hr1", "A série **geométrica** converge.\n\nSegundo bloco com R$ 20.")],
		executando: false,
		acoesPorPainel: {},
		sessaoId: SESSAO,
		chaveFoco: NOTA,
		materia: MATERIA,
		fonte: undefined,
		irPara: vi.fn(),
		mesa: undefined as never,
		acoes: undefined as never,
		comMesa: true,
		enviadas: [],
		extensao: () => {},
		vendo: undefined,
		receber: (painel, acao, dados) => {
			const chave = `i${++contadorAcoes}`;
			controle.acoesPorPainel = { ...controle.acoesPorPainel, [painel]: [...(controle.acoesPorPainel[painel] ?? []), { chave, acao, dados }] };
			controle.renderizar();
		},
		renderizar: () => root.render(createElement(Bancada)),
		notas: [{ titulo: "Séries", modificadaEm: "2026-11-10T10:00:00.000Z", tamanho: 100, previa: "Séries" }, { titulo: "Limites", modificadaEm: "2026-11-09T10:00:00.000Z", tamanho: 50, previa: "Limites" }],
	};
	controle.mesa = { irPara: (alvo) => void (controle.irPara as (alvo: unknown) => void)(alvo) };
	controle.acoes = {
		acaoDaInterface: async (painel, acao, dados) => {
			controle.enviadas.push({ painel, acao, dados });
			await controle.extensao(painel, acao, dados);
		},
	};
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	localStorage.clear();
	// Movimento reduzido: sem animações (o happy-dom rejeita animações nativas canceladas).
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => {
	root.unmount();
	container.remove();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** Desenha a conversa (e, se houver, a nota aberta no editor) e espera as respostas na tela. */
async function desenhar(fonte?: Controle["fonte"]) {
	controle.fonte = fonte;
	controle.renderizar();
	await ate(() => container.querySelector(".bloco") !== null);
	await esperar(20);
}

const botoesGuardar = () => [...container.querySelectorAll<HTMLButtonElement>(".guardar-nota__botao")];
const avisoDoGuardar = () => container.querySelector(".guardar-nota__aviso")?.textContent;
const statusDoGuardar = () => container.querySelector(".guardar-nota [role=status]")?.textContent;
const botaoIrAoTrecho = () => [...container.querySelectorAll<HTMLButtonElement>(".bloco__rodape button")].filter((botao) => botao.textContent?.includes("Ir ao trecho"));

describe("Ir ao trecho", () => {
	it("aparece na resposta e chama irPara com a origem com âncora, o trecho citado e quem: usuario", async () => {
		await desenhar();
		const botoes = botaoIrAoTrecho();
		expect(botoes).toHaveLength(1);
		botoes[0]!.click();
		expect(controle.irPara).toHaveBeenCalledWith({ origem: ORIGEM_ANCORADA, trecho: "geométrica", quem: "usuario" });
	});

	it("só no último item de assistente do turno (um turno com ferramentas tem vários)", async () => {
		controle.conversa = [usuario("hu1", comFoco()), resposta("hr1", "Vou olhar a nota."), ferramenta("hf1"), resposta("hr2", "Olhei a nota."), ferramenta("hf2"), resposta("hr3", "Pronto, é isto."), usuario("hu2"), resposta("hr4", "Outra, sem foco.")];
		await desenhar();
		const rodapes = [...container.querySelectorAll(".bloco__rodape")];
		// Quatro respostas, quatro linhas reservadas; só a r3 (última do turno da u1) tem o botão. A r4 é de uma pergunta sem foco.
		expect(rodapes).toHaveLength(4);
		expect(rodapes.map((rodape) => rodape.querySelectorAll("button").length)).toEqual([0, 0, 1, 0]);
	});

	it("só com o contexto em foco da pergunta: sem contextosTela, sem foco, ou sem trecho a que voltar, não há botão", async () => {
		controle.conversa = [usuario("hu1"), resposta("hr1", "sem contexto")];
		await desenhar();
		expect(botaoIrAoTrecho()).toHaveLength(0);
		controle.conversa = [usuario("hu1", [{ ...comFoco()[0]!, foco: undefined as never }]), resposta("hr1", "sem foco")];
		controle.renderizar();
		await esperar(30);
		expect(botaoIrAoTrecho()).toHaveLength(0);
		controle.conversa = [usuario("hu1", [{ ...comFoco(null)[0]!, origem: NOTA }]), resposta("hr1", "aba aberta, mas sem trecho nem bloco")];
		controle.renderizar();
		await esperar(30);
		expect(botaoIrAoTrecho()).toHaveLength(0);
		// Sem texto citado, mas com o bloco da âncora, o botão leva ao bloco.
		controle.conversa = [usuario("hu1", comFoco(null)), resposta("hr1", "só o bloco")];
		controle.renderizar();
		await ate(() => botaoIrAoTrecho().length === 1);
		botaoIrAoTrecho()[0]!.click();
		expect(controle.irPara).toHaveBeenCalledWith({ origem: ORIGEM_ANCORADA, quem: "usuario" });
	});

	it("nunca durante o streaming, nem no turno que ainda está rodando; chega quando termina", async () => {
		controle.conversa = [usuario("hu1", comFoco()), resposta("hr1", "chegando", true)];
		controle.executando = true;
		await desenhar();
		expect(botaoIrAoTrecho()).toHaveLength(0);
		const linha = container.querySelector(".bloco__rodape");
		expect(linha).not.toBeNull();
		// A resposta termina, mas o turno ainda roda (uma ferramenta pode vir): ainda não.
		controle.conversa = [usuario("hu1", comFoco()), resposta("hr1", "pronta")];
		controle.renderizar();
		await esperar(30);
		expect(botaoIrAoTrecho()).toHaveLength(0);
		controle.executando = false;
		controle.renderizar();
		await ate(() => botaoIrAoTrecho().length === 1);
		// A mesma linha reservada, nada remontado.
		expect(container.querySelector(".bloco__rodape")).toBe(linha);
	});

	it("sem a mesa (useMesa() undefined) o botão não aparece, mas a linha continua reservada", async () => {
		controle.comMesa = false;
		await desenhar();
		expect(botaoIrAoTrecho()).toHaveLength(0);
		expect(container.querySelectorAll(".bloco__rodape")).toHaveLength(1);
	});

	it("uma pergunta de aba de outra matéria não tem botão", async () => {
		controle.conversa = [usuario("hu1", [{ ...comFoco()[0]!, origem: "caderno/fisica/notas/Séries" }]), resposta("hr1", "texto")];
		await desenhar();
		expect(botaoIrAoTrecho()).toHaveLength(0);
	});
});

describe("Guardar na nota com a nota aberta no editor", () => {
	/** A nota aberta no editor: uma fonte no Vendo, com o inserirNoBuffer que o teste dá. */
	const desenharComFonte = (inserir: (markdown: string) => ResultadoInserir, origem = NOTA) => desenhar({ origem, inserir });

	it("insere a citação com a fonte no buffer e depois manda guardou na ponte (com a sessão e o tamanho)", async () => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		botoesGuardar()[0]!.click();
		await ate(() => controle.enviadas.length === 1);
		expect(inserir).toHaveBeenCalledTimes(1);
		const markdown = inserir.mock.calls[0]![0];
		expect(markdown.startsWith("> A série **geométrica** converge.\n>\n> — Professor, [conversa de ")).toBe(true);
		expect(markdown.endsWith("(conversa:e119b2a5)")).toBe(true);
		expect(controle.enviadas).toEqual([{ painel: "notas", acao: "guardou", dados: { materia: MATERIA, titulo: "Séries", sessao: SESSAO, tamanho: markdown.length } }]);
		await ate(() => botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase") === "guardado");
		expect(statusDoGuardar()).toBe("Guardado");
		expect(avisoDoGuardar()).toBeUndefined();
	});

	it("o segundo bloco guarda o segundo bloco (a fonte é a do bloco, com dinheiro)", async () => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		botoesGuardar()[1]!.click();
		await ate(() => inserir.mock.calls.length === 1);
		expect(inserir.mock.calls[0]![0].startsWith("> Segundo bloco com R$ 20.\n>\n")).toBe(true);
	});

	it("o feedback volta ao repouso sozinho e o botão não muda de tamanho em nenhum estado", async () => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		const botao = botoesGuardar()[0]!;
		const estrutura = () => ({ icones: botao.querySelectorAll(".guardar-nota__icone").length, classe: botao.className, estilo: botao.getAttribute("style"), filhos: botao.childElementCount });
		const repouso = estrutura();
		expect(repouso.icones).toBe(2);
		botao.click();
		await ate(() => botao.closest(".guardar-nota")!.getAttribute("data-fase") === "guardado");
		// Os dois desenhos continuam no mesmo lugar (um só some com visibility), o botão é o mesmo elemento e com o mesmo estilo.
		expect(estrutura()).toEqual(repouso);
		expect(botoesGuardar()[0]).toBe(botao);
		await ate(() => botao.closest(".guardar-nota")!.getAttribute("data-fase") === "ocioso", DURACAO_GUARDADO_MS + 1500);
		expect(estrutura()).toEqual(repouso);
		expect(statusDoGuardar()).toBe("");
	}, 10_000);

	it.each([
		["conflito", /conflito/],
		["somente-leitura", /só para leitura/],
		["salvando", /salvando.*instantes/],
		["sem-nota", /abrindo.*instantes/],
	] as const)("o editor recusa por %s: vira um aviso e nada é registrado", async (motivo, esperado) => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: false, motivo }));
		await desenharComFonte(inserir);
		botoesGuardar()[0]!.click();
		await ate(() => avisoDoGuardar() !== undefined);
		expect(avisoDoGuardar()).toMatch(esperado);
		expect(controle.enviadas).toEqual([]);
		expect(botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase")).toBe("ocioso");
		// E dá para tentar de novo: o aviso some no próximo clique.
		inserir.mockReturnValueOnce({ ok: true });
		botoesGuardar()[0]!.click();
		await ate(() => controle.enviadas.length === 1);
		expect(avisoDoGuardar()).toBeUndefined();
	});

	it("a fonte registrada é de outra aba (a troca ainda não terminou): não insere em nota errada", async () => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir, "caderno/calc/notas/Outra");
		botoesGuardar()[0]!.click();
		await ate(() => avisoDoGuardar() !== undefined);
		expect(inserir).not.toHaveBeenCalled();
		expect(avisoDoGuardar()).toMatch(/abrindo/);
	});

	it("a troca de sessão faz o envio lançar: tenta de novo uma vez e dá certo", async () => {
		let tentativas = 0;
		controle.extensao = () => {
			tentativas++;
			if (tentativas === 1) throw new Error("trocando de sessão");
		};
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		botoesGuardar()[0]!.click();
		await ate(() => botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase") === "guardado", 3000);
		expect(tentativas).toBe(2);
		expect(avisoDoGuardar()).toBeUndefined();
	});

	it("se o envio lança de novo, o trecho já está na nota: guarda e avisa que o registro não saiu", async () => {
		controle.extensao = () => {
			throw new Error("sem conexão");
		};
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		botoesGuardar()[0]!.click();
		await ate(() => avisoDoGuardar() !== undefined, 3000);
		expect(avisoDoGuardar()).toMatch(/registro não foi gravado/);
		expect(inserir).toHaveBeenCalledTimes(1);
		expect(botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase")).toBe("guardado");
	});

	it("sem a sessão da janela ainda, avisa e não insere", async () => {
		controle.sessaoId = undefined;
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		botoesGuardar()[0]!.click();
		await ate(() => avisoDoGuardar() !== undefined);
		expect(inserir).not.toHaveBeenCalled();
	});

	it("se a instância passa a mostrar outro bloco ou outra conversa, o 'Guardado' e o aviso não vazam para ele", async () => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		botoesGuardar()[0]!.click();
		await ate(() => botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase") === "guardado");
		const botao = botoesGuardar()[0]!;
		// A mesma chave de resposta (as do histórico se repetem entre conversas) com outro texto.
		controle.conversa = [usuario("hu1", comFoco()), resposta("hr1", "Outra conversa, outro bloco.")];
		controle.renderizar();
		await ate(() => container.textContent?.includes("Outra conversa") === true);
		expect(botoesGuardar()[0]).toBe(botao);
		expect(botao.closest(".guardar-nota")!.getAttribute("data-fase")).toBe("ocioso");
		expect(statusDoGuardar()).toBe("");
	});

	it("dois cliques seguidos guardam uma vez só", async () => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		await desenharComFonte(inserir);
		const botao = botoesGuardar()[0]!;
		botao.click();
		botao.click();
		await ate(() => controle.enviadas.length >= 1);
		await esperar(50);
		expect(inserir).toHaveBeenCalledTimes(1);
	});
});

describe("Guardar na nota com uma lição em foco: o seletor", () => {
	beforeEach(() => {
		controle.chaveFoco = LICAO;
		// A extensão responde "listar" com as notas e "guardar" com guardada (ou o que o teste mandar).
		controle.extensao = (painel, acao, dados) => {
			if (painel !== "notas") return;
			if (acao === "listar") setTimeout(() => controle.receber("notas", "lista", { materia: MATERIA, notas: controle.notas }), 5);
			if (acao === "guardar") setTimeout(() => controle.receber("notas", "guardada", { materia: MATERIA, titulo: dados.titulo, conteudo: "novo", versao: "v2", modificadaEm: "2026-11-11T10:00:00.000Z", tamanho: String(dados.texto).length, pedido: dados.pedido }), 5);
			if (acao === "criar") setTimeout(() => controle.receber("notas", "criada", { materia: MATERIA, titulo: dados.titulo }), 5);
		};
	});

	const seletor = () => container.querySelector<HTMLElement>(".seletor-nota");
	const opcoes = () => [...container.querySelectorAll<HTMLButtonElement>(".seletor-nota__item")];

	it("abre o seletor com as notas da matéria (ação listar) e foco na primeira", async () => {
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => seletor() !== null && opcoes().length === 3);
		expect(controle.enviadas[0]).toEqual({ painel: "notas", acao: "listar", dados: { materia: MATERIA } });
		expect(opcoes().map((opcao) => opcao.querySelector(".seletor-nota__nome")?.textContent)).toEqual(["Séries", "Limites", "Nova nota…"]);
		expect(seletor()!.getAttribute("role")).toBe("dialog");
		await ate(() => document.activeElement === opcoes()[0]);
	});

	it("escolher uma nota fechada usa a ação guardar da ponte com o texto formatado, o pedido e a sessão, e apaga a cópia velha do Vendo", async () => {
		const inserir = vi.fn((_markdown: string): ResultadoInserir => ({ ok: true }));
		void inserir;
		await desenhar();
		// A nota "Limites" tem uma cópia velha no Vendo (de quando ela deixou de ser a aba ativa).
		const desregistrar = controle.vendo!.registrar({ tipo: "nota", rotulo: "Limites", origem: "caderno/calc/notas/Limites", texto: () => "cópia velha" });
		desregistrar();
		expect(controle.vendo!.copia("caderno/calc/notas/Limites")).toBe("cópia velha");

		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		opcoes()[1]!.click();
		await ate(() => botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase") === "guardado");
		const guardar = controle.enviadas.find((enviada) => enviada.acao === "guardar")!;
		expect(guardar.painel).toBe("notas");
		expect(guardar.dados).toMatchObject({ materia: MATERIA, titulo: "Limites", sessao: SESSAO });
		expect(String(guardar.dados.texto).startsWith("> A série **geométrica** converge.\n>\n> — Professor, [conversa de ")).toBe(true);
		expect(typeof guardar.dados.pedido).toBe("string");
		expect(controle.enviadas.some((enviada) => enviada.acao === "guardou")).toBe(false);
		expect(controle.vendo!.copia("caderno/calc/notas/Limites")).toBeUndefined();
		// O seletor fechou e o foco voltou ao botão.
		expect(seletor()).toBeNull();
		expect(document.activeElement).toBe(botoesGuardar()[0]);
	});

	it("o erro da extensão (ao: guardar) vira aviso, a cópia fica e nada aparece como guardado", async () => {
		const antes = controle.extensao;
		controle.extensao = (painel, acao, dados) => {
			if (acao === "guardar") return void setTimeout(() => controle.receber("notas", "erro", { mensagem: "A nota mudou fora do app. Nada foi guardado.", ao: "guardar", materia: MATERIA, titulo: dados.titulo, pedido: dados.pedido }), 5);
			return antes(painel, acao, dados);
		};
		await desenhar();
		controle.vendo!.registrar({ tipo: "nota", rotulo: "Limites", origem: "caderno/calc/notas/Limites", texto: () => "cópia" })();
		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		opcoes()[1]!.click();
		await ate(() => avisoDoGuardar() !== undefined);
		expect(avisoDoGuardar()).toBe("A nota mudou fora do app. Nada foi guardado.");
		expect(botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase")).toBe("ocioso");
		expect(controle.vendo!.copia("caderno/calc/notas/Limites")).toBe("cópia");
	});

	it("a resposta de outro pedido não conta", async () => {
		controle.extensao = (_painel, acao, dados) => {
			if (acao === "listar") setTimeout(() => controle.receber("notas", "lista", { materia: MATERIA, notas: controle.notas }), 5);
			if (acao === "guardar") setTimeout(() => controle.receber("notas", "guardada", { materia: MATERIA, titulo: dados.titulo, conteudo: "", versao: "v", modificadaEm: "x", tamanho: 1, pedido: "de-outro-pedido" }), 5);
		};
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		opcoes()[0]!.click();
		await esperar(150);
		expect(botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase")).toBe("guardando");
		expect(avisoDoGuardar()).toBeUndefined();
	});

	it("a troca de sessão lança no guardar: tenta de novo uma vez; falhando de novo, avisa", async () => {
		const antes = controle.extensao;
		controle.extensao = (painel, acao, dados) => {
			if (acao === "guardar") throw new Error("trocando de sessão");
			return antes(painel, acao, dados);
		};
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		opcoes()[0]!.click();
		await ate(() => avisoDoGuardar() !== undefined, 3000);
		expect(avisoDoGuardar()).toMatch(/trocando/);
		expect(controle.enviadas.filter((enviada) => enviada.acao === "guardar")).toHaveLength(2);
	});

	it("Esc fecha o seletor e devolve o foco ao botão, sem guardar nada", async () => {
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		await ate(() => document.activeElement === opcoes()[0]);
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await ate(() => seletor() === null);
		expect(document.activeElement).toBe(botoesGuardar()[0]);
		expect(controle.enviadas.map((enviada) => enviada.acao)).toEqual(["listar"]);
	});

	it("um clique fora fecha; as setas andam pelas notas", async () => {
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		await ate(() => document.activeElement === opcoes()[0]);
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(document.activeElement).toBe(opcoes()[1]);
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
		expect(document.activeElement).toBe(opcoes()[2]);
		container.querySelector(".bloco__margem")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		await ate(() => seletor() === null);
	});

	it("Nova nota…: confere o título, cria pela ponte e guarda nela", async () => {
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		opcoes()[2]!.click();
		const campo = await vi.waitFor(() => {
			const achado = container.querySelector<HTMLInputElement>(".seletor-nota__campo");
			if (!achado) throw new Error("sem campo");
			return achado;
		});
		const digitar = (valor: string) => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(campo, valor);
			campo.dispatchEvent(new Event("input", { bubbles: true }));
		};
		const enviarForm = () => container.querySelector("form.seletor-nota__nova")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		// Título inválido: a mensagem aparece na linha reservada e nada é enviado.
		digitar("Série: de Taylor");
		enviarForm();
		await ate(() => (container.querySelector(".seletor-nota__erro")?.textContent ?? "") !== "");
		expect(container.querySelector(".seletor-nota__erro")?.textContent).toMatch(/não pode ter/);
		expect(controle.enviadas.some((enviada) => enviada.acao === "criar")).toBe(false);
		// Já existe.
		digitar("séries");
		enviarForm();
		await ate(() => /Já existe/.test(container.querySelector(".seletor-nota__erro")?.textContent ?? ""));
		// Título bom.
		digitar("Série de Taylor");
		enviarForm();
		await ate(() => botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase") === "guardado", 3000);
		const acoes = controle.enviadas.map((enviada) => enviada.acao);
		expect(acoes).toEqual(["listar", "criar", "guardar"]);
		expect(controle.enviadas[1]!.dados).toEqual({ materia: MATERIA, titulo: "Série de Taylor" });
		expect(controle.enviadas[2]!.dados).toMatchObject({ materia: MATERIA, titulo: "Série de Taylor", sessao: SESSAO });
	}, 10_000);

	it("se o erro vem ao criar, fica no seletor (na linha reservada) e nada é guardado", async () => {
		const antes = controle.extensao;
		controle.extensao = (painel, acao, dados) => {
			if (acao === "criar") return void setTimeout(() => controle.receber("notas", "erro", { mensagem: "Não consegui criar a nota.", ao: "criar", materia: MATERIA, titulo: dados.titulo }), 5);
			return antes(painel, acao, dados);
		};
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => opcoes().length === 3);
		opcoes()[2]!.click();
		const campo = await vi.waitFor(() => container.querySelector<HTMLInputElement>(".seletor-nota__campo") ?? Promise.reject(new Error("sem campo")));
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(campo, "Nova");
		campo.dispatchEvent(new Event("input", { bubbles: true }));
		container.querySelector("form.seletor-nota__nova")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await ate(() => /Não consegui criar/.test(container.querySelector(".seletor-nota__erro")?.textContent ?? ""));
		expect(seletor()).not.toBeNull();
		expect(controle.enviadas.some((enviada) => enviada.acao === "guardar")).toBe(false);
	});

	it("o seletor só aparece pronto: escondido (sem sumir do layout) até a lista chegar", async () => {
		const antes = controle.extensao;
		controle.extensao = (painel, acao, dados) => {
			if (acao === "listar") return void setTimeout(() => controle.receber("notas", "lista", { materia: "isolada", notas: controle.notas }), 250);
			return antes(painel, acao, dados);
		};
		// Uma matéria só deste teste: a lista de notas lembrada de outra matéria (useListaNotas) apareceria na hora.
		controle.materia = "isolada";
		controle.chaveFoco = "caderno/isolada/cursos/c1/modulos/m1";
		controle.conversa = [usuario("hu1", [{ ...comFoco()[0]!, origem: "caderno/isolada/notas/Séries" }]), resposta("hr1", "Texto.")];
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => seletor() !== null);
		expect(seletor()!.style.visibility).toBe("hidden");
		// O "Abrindo as notas…" existe (reserva o lugar), mas escondido: só aparece se passar de 1 s.
		expect(container.querySelector(".seletor-nota__vazio")!.getAttribute("aria-hidden")).toBe("true");
		await ate(() => opcoes().length === 3);
		expect(seletor()!.style.visibility).toBe("visible");
	});

	it("o mesmo botão não muda de estrutura com o seletor aberto", async () => {
		await desenhar();
		const botao = botoesGuardar()[0]!;
		const antes = botao.className + botao.childElementCount;
		botao.click();
		await ate(() => opcoes().length === 3);
		expect(botoesGuardar()[0]).toBe(botao);
		expect(botao.className + botao.childElementCount).toBe(antes);
		expect(botao.getAttribute("aria-expanded")).toBe("true");
	});
});

describe("Guardando… e o que fica na tela", () => {
	it("o 'Guardando…' só é dito depois de 1 s (a extensão demorou)", async () => {
		controle.chaveFoco = LICAO;
		controle.extensao = (_painel, acao, dados) => {
			if (acao === "listar") setTimeout(() => controle.receber("notas", "lista", { materia: MATERIA, notas: controle.notas }), 5);
			if (acao === "guardar") setTimeout(() => controle.receber("notas", "guardada", { materia: MATERIA, titulo: dados.titulo, conteudo: "", versao: "v", modificadaEm: "x", tamanho: 1, pedido: dados.pedido }), 1500);
		};
		await desenhar();
		botoesGuardar()[0]!.click();
		await ate(() => container.querySelectorAll(".seletor-nota__item").length === 3);
		(container.querySelectorAll<HTMLButtonElement>(".seletor-nota__item")[0]!).click();
		await ate(() => botoesGuardar()[0]!.closest(".guardar-nota")!.getAttribute("data-fase") === "guardando");
		await esperar(300);
		expect(statusDoGuardar()).toBe("");
		await ate(() => statusDoGuardar() === "Guardando…", 1500);
		await ate(() => statusDoGuardar() === "Guardado", 2500);
	}, 10_000);
});

describe("o streaming", () => {
	it("nenhuma ação nem rodapé é pedido enquanto a resposta chega, e o espaço já existe", async () => {
		controle.conversa = [usuario("hu1", comFoco()), resposta("hr1", "Primeiro bloco.\n\nSegundo bloco ainda chegando", true)];
		controle.executando = true;
		await desenhar();
		expect(botoesGuardar()).toHaveLength(0);
		expect(container.querySelectorAll(".bloco-md")).toHaveLength(2);
		expect(container.querySelectorAll(".bloco-md__acoes")).toHaveLength(2);
		expect(botaoIrAoTrecho()).toHaveLength(0);
	});
});
