// @vitest-environment happy-dom
// As notas do professor na tela (parte D, WP2; docs/mesa-parte-d.md, seções 2 e 3), no DOM: a mesa de verdade
// (MesaEstudo com o editor de nota), uma conversa de verdade (DocumentoConversa do núcleo com os ganchos da mesa)
// e uma janela falsa em que a ponte de notas responde como a extensão. Cobre o cartão "Nota criada" (Abrir,
// Desfazer, estados), a tag "do professor" na lista e o clique no link conversa:<id>. Nada aqui toca a pasta de
// dados nem a rede.

import { type AcaoRecebida, DocumentoConversa, type ItemConversa, type JanelaPerfilHook, type PropsConversaEmbutida } from "@estudos/ui";
import { createElement, type ReactNode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { idCurtoDaConversa } from "../../lib/trecho-guardado.ts";
import type { ListaNotas } from "../../lib/nota-tipos.ts";
import type { AbaMesa } from "./abas-mesa.ts";
import { EditorNota } from "./EditorNota.tsx";
import { MesaEstudo } from "./MesaEstudo.tsx";
import { SecaoNotas } from "./SecaoNotas.tsx";
import { type TrocaSessao, TrocaSessaoContexto } from "./troca-sessao.tsx";

const PERFIL = "estudos";
const MATERIA = "calc";
const SESSAO = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";
const rotaDa = (titulo: string) => `caderno/${MATERIA}/notas/${titulo}`;

// Duas conversas da matéria no mesmo milissegundo (o relógio do UUID v7 é igual): só a parte aleatória difere.
const CONVERSA_A = "019e0000-0000-7000-8000-e119b2a5aaaa";
const CONVERSA_B = "019e0000-0000-7000-8000-0123456789ab";
const CONTEXTO = { chave: `materia:${MATERIA}`, rotulo: "Cálculo" };
const resumo = (id: string, extra: Record<string, unknown> = {}) => ({ id, arquivo: `${id}.jsonl`, criadaEm: "2026-11-10T10:00:00.000Z", modificadaEm: "2026-11-10T10:00:00.000Z", titulo: id, mensagens: 2, contexto: CONTEXTO, ...extra });

const NOTAS: Record<string, string> = {
	A: "# Séries\n\nA série geométrica converge.",
	B: "# Limites\n\nO limite lateral.",
	// A nota do professor (a marca) e uma nota do Breno com o link do Guardar, nas duas formas: editável e só leitura (HTML desconhecido).
	P: `Nota do professor · [conversa de 11/11/2026](conversa:${idCurtoDaConversa(CONVERSA_A)})\n\n# Resumo\n\nTexto da nota.`,
	L: `# Leitura\n\n<kbd>Ctrl</kbd> abre.\n\n> Um trecho\n>\n> — Professor, [conversa de 11/11/2026](conversa:${idCurtoDaConversa(CONVERSA_B)})`,
	S: `# Sumida\n\n> Um trecho\n>\n> — Professor, [conversa de 11/11/2026](conversa:ffffffff)`,
};

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

type Usuario = Extract<ItemConversa, { tipo: "usuario" }>;
const usuario = (chave: string): Usuario => ({ tipo: "usuario", chave, texto: "faça uma nota" });
const resposta = (chave: string, texto = "Pronto."): ItemConversa => ({ tipo: "assistente", chave, texto, raciocinio: "", emAndamento: false });
const ferramenta = (chave: string, id: string): ItemConversa => ({ tipo: "ferramenta", chave, chamada: { id, nome: "criar_nota", argumentos: {}, status: "ok" } });
const notaCriada = (chave: string, chamada: string, titulo = "A"): AcaoRecebida => ({ chave, acao: "nota_criada", dados: { materia: MATERIA, titulo, rota: rotaDa(titulo), chamada, sessao: SESSAO } });

// Um turno que criou a nota A (call-1) e um segundo turno que não criou nada.
const CONVERSA_DO_CARTAO: ItemConversa[] = [usuario("hu1"), resposta("hr0", "Vou criar a nota."), ferramenta("hf1", "call-1"), resposta("hr1", "Criei a nota A."), usuario("hu2"), resposta("hr2", "Outra resposta.")];
const HISTORICO_DO_CARTAO: Record<string, AcaoRecebida[]> = { mesa: [notaCriada("hm1", "call-1")] };

interface Enviada {
	painel: string;
	acao: string;
	dados: Record<string, unknown>;
}

interface Controle {
	caminho: string;
	conversa: ItemConversa[];
	executando: boolean;
	enviadas: Enviada[];
	/** Os rótulos das abas no instante de cada ação enviada (para provar que a aba fechou antes do desfazer_nota). */
	abasNoEnvio: Array<{ acao: string; abas: Array<string | null> }>;
	sessoes: Array<ReturnType<typeof resumo>>;
	abrirSessao: Mock<(id: string, contexto?: unknown) => Promise<{ sessaoId: string }>>;
	salvamentos: number;
	antesDeTrocar: Mock<() => void>;
	/** Os títulos que a "lista de notas" da extensão devolve. */
	titulosDaLista: string[];
	/** Como a "extensão" reage a uma ação de notas além do `abrir` (responde pela ponte). */
	extensao: (acao: string, dados: Record<string, unknown>) => void | Promise<void>;
	receber(painel: string, acao: string, dados: unknown): void;
	renderizar(): void;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;
let contadorAcoes = 0;

/** O professor da mesa: a conversa de verdade, com os ganchos que a mesa entrega (rodapé e ações do bloco). */
function ConversaDaMesa(props: PropsConversaEmbutida) {
	return createElement(DocumentoConversa, { conversa: props.janela.estado.conversa, ...(props.rodapeDaResposta ? { rodapeDaResposta: props.rodapeDaResposta } : {}), ...(props.acoesDoBloco ? { acoesDoBloco: props.acoesDoBloco } : {}) });
}

function Bancada({ inicial, historico = {} }: { inicial: string; historico?: Record<string, AcaoRecebida[]> }) {
	const [caminho, setCaminho] = useState(inicial);
	const [acoesPorPainel, setAcoes] = useState<Record<string, AcaoRecebida[]>>(historico);
	const [, setVez] = useState(0);
	controle.caminho = caminho;
	controle.renderizar = () => setVez((vez) => vez + 1);
	controle.receber = (painel, acao, dados) => {
		const chave = `i${++contadorAcoes}`;
		setAcoes((atuais) => ({ ...atuais, [painel]: [...(atuais[painel] ?? []), { chave, acao, dados }] }));
	};
	const [acoes] = useState(() => ({
		acaoDaInterface: async (painel: string, acao: string, dados: Record<string, unknown>) => {
			controle.enviadas.push({ painel, acao, dados });
			controle.abasNoEnvio.push({ acao, abas: [...container.querySelectorAll(".mesa-aba__rotulo")].map((rotulo) => rotulo.textContent) });
			if (painel !== "notas") return;
			if (acao === "abrir") setTimeout(() => controle.receber("notas", "nota", { materia: MATERIA, titulo: dados.titulo, conteudo: NOTAS[dados.titulo as string] ?? "", versao: "v1", modificadaEm: "2026-11-11T10:00:00.000Z" }), 5);
			else if (acao === "listar") setTimeout(() => controle.receber("notas", "lista", { materia: MATERIA, notas: controle.titulosDaLista.map((titulo) => ({ titulo, modificadaEm: "2026-11-11T10:00:00.000Z", tamanho: 10, previa: "", doProfessor: false })) }), 5);
			else if (acao === "salvar") controle.salvamentos += 1;
			else await controle.extensao(acao, dados);
		},
		enviar: async () => "iniciada" as const,
		listarSessoes: async () => controle.sessoes,
		abrirSessao: (id: string, contexto?: unknown) => controle.abrirSessao(id, contexto),
	}));
	const janela = {
		estado: { perfil: PERFIL, sessao: { sessaoId: SESSAO, contexto: CONTEXTO }, acoesPorPainel, conversa: controle.conversa, executando: controle.executando, fila: [], pedidos: [], registrosPedidos: {} },
		conexao: "aberta",
		acoes,
	} as unknown as JanelaPerfilHook;
	// A navegação do app é assíncrona (hashchange): a rota chega depois.
	const navegar = (destino: string) => setTimeout(() => setCaminho(destino), 0);
	const titulo = caminho.split("/").slice(3).join("/");
	return createElement(MesaEstudo, {
		janela: janela as never,
		perfilId: PERFIL,
		materiaId: MATERIA,
		caminho,
		navegar,
		conversa: ConversaDaMesa,
		materia: { id: MATERIA, nome: "Cálculo", cor: "tijolo" } as never,
		children: (abas: ReactNode) =>
			createElement("section", { className: "cartao" }, createElement(EditorNota, { janela, materiaId: MATERIA, titulo, voltar: () => {}, renomeada: () => {}, abrirNota: () => {}, abrirMaterial: () => {}, abaixoDoCabecalho: abas })),
	});
}

/** O que a TelaEstudos faz: guarda o que as telas registram para rodar antes de trocar a conversa. */
function ComTroca({ filhos }: { filhos: ReactNode }) {
	const [registrados] = useState(() => new Set<() => Promise<void>>());
	const [valor] = useState<TrocaSessao>(() => ({
		situacao: "pronta",
		voltarParaMateria: () => {},
		registrarAntesDeTrocar: (fn) => {
			registrados.add(fn);
			return () => registrados.delete(fn);
		},
		executarAntesDeTrocar: async () => {
			controle.antesDeTrocar();
			await Promise.all([...registrados].map((fn) => fn()));
		},
	}));
	useEffect(() => undefined, []);
	return createElement(TrocaSessaoContexto.Provider, { value: valor }, filhos);
}

function desenhar(inicial: string, historico?: Record<string, AcaoRecebida[]>) {
	root.render(createElement(ComTroca, { filhos: createElement(Bancada, { inicial, ...(historico ? { historico } : {}) }) }));
}

function guardarAbas(abas: AbaMesa[]) {
	localStorage.setItem(`estudos:${PERFIL}:${MATERIA}:abas-mesa`, JSON.stringify(abas));
}
const aba = (titulo: string, extra: Partial<AbaMesa> = {}): AbaMesa => ({ chave: rotaDa(titulo), caminho: rotaDa(titulo), tipo: "nota", rotulo: titulo, ...extra });
const rotulosDasAbas = () => [...container.querySelectorAll(".mesa-aba__rotulo")].map((rotulo) => rotulo.textContent);
const notaPronta = (titulo: string) => {
	const pagina = container.querySelector(".editor-nota__pagina");
	const campo = container.querySelector<HTMLTextAreaElement>(".editor-nota__titulo");
	return Boolean(pagina && !pagina.classList.contains("editor-nota__pagina--carregando") && campo?.value === titulo);
};

const cartoes = () => [...container.querySelectorAll<HTMLElement>(".nota-criada")];
const botoesDoCartao = (cartao: HTMLElement) => [...cartao.querySelectorAll("button")].map((botao) => botao.textContent);
const textoDoCartao = (cartao: HTMLElement) => cartao.querySelector(".nota-criada__texto")?.textContent;
const clicar = (cartao: HTMLElement, rotulo: string) => {
	const botao = [...cartao.querySelectorAll("button")].find((candidato) => candidato.textContent === rotulo);
	if (!botao) throw new Error(`sem o botão ${rotulo}`);
	botao.click();
};
const desfazerEnviado = () => controle.enviadas.filter((enviada) => enviada.acao === "desfazer_nota");

beforeEach(() => {
	contadorAcoes = 0;
	controle = {
		caminho: "",
		conversa: CONVERSA_DO_CARTAO,
		executando: false,
		enviadas: [],
		abasNoEnvio: [],
		sessoes: [resumo(CONVERSA_A), resumo(CONVERSA_B), resumo("019e0000-0000-7000-8000-ffffffffffff", { contexto: { chave: "materia:fisica", rotulo: "Física" } })],
		abrirSessao: vi.fn(async (id: string) => ({ sessaoId: id })),
		salvamentos: 0,
		antesDeTrocar: vi.fn(),
		titulosDaLista: ["A", "B"],
		extensao: () => {},
		receber: () => {},
		renderizar: () => {},
	};
	localStorage.clear();
	// Movimento reduzido: sem animações (o happy-dom rejeita animações nativas canceladas).
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
	vi.spyOn(document, "hasFocus").mockReturnValue(true);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	root.unmount();
	container.remove();
	await esperar(10);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("o cartão Nota criada no rodapé da resposta", () => {
	it("aparece só no fim do turno que chamou a ferramenta, e não enquanto o turno ainda roda", async () => {
		// O turno da nota é o último e ainda roda: nada de cartão (a linha do rodapé já está reservada).
		controle.conversa = CONVERSA_DO_CARTAO.slice(0, 4);
		controle.executando = true;
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => container.querySelector(".bloco__rodape") !== null);
		await esperar(30);
		expect(cartoes()).toHaveLength(0);
		const linha = [...container.querySelectorAll(".bloco__rodape")].at(-1);
		// O turno termina: o cartão entra na MESMA linha reservada.
		controle.executando = false;
		controle.renderizar();
		await ate(() => cartoes().length === 1);
		expect(cartoes()[0]!.closest(".bloco__rodape")).toBe(linha);
		// Com um segundo turno, o cartão continua na resposta do turno que chamou a ferramenta (hr1), nunca na do segundo (hr2).
		controle.conversa = CONVERSA_DO_CARTAO;
		controle.renderizar();
		await ate(() => container.querySelectorAll(".bloco__rodape").length === 3);
		const linhas = [...container.querySelectorAll(".bloco__rodape")];
		expect(cartoes()).toHaveLength(1);
		expect(cartoes()[0]!.closest(".bloco__rodape")).toBe(linhas[1]);
		expect(linhas[2]!.querySelector(".nota-criada")).toBeNull();
		expect(textoDoCartao(cartoes()[0]!)).toBe("Nota criada: A");
		expect(botoesDoCartao(cartoes()[0]!)).toEqual(["Abrir", "Desfazer"]);
	});

	it("Abrir leva à nota na aba (rota do caderno), com o clique do Breno", async () => {
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => notaPronta("B") && cartoes().length === 1);
		clicar(cartoes()[0]!, "Abrir");
		await ate(() => controle.caminho === rotaDa("A") && notaPronta("A"));
		expect(rotulosDasAbas()).toContain("A");
		// Abrir é só navegar: nada foi mandado à extensão além do que o editor e a lista pedem.
		expect(controle.enviadas.map((enviada) => enviada.acao)).not.toContain("desfazer_nota");
	});

	it("Desfazer pede a confirmação no próprio cartão e Cancelar volta, sem mandar nada", async () => {
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => cartoes().length === 1);
		const cartao = cartoes()[0]!;
		clicar(cartao, "Desfazer");
		await ate(() => textoDoCartao(cartao) === "Apagar a nota? Não dá para voltar atrás.");
		expect(botoesDoCartao(cartao)).toEqual(["Apagar", "Cancelar"]);
		expect(cartoes()[0]).toBe(cartao);
		expect(document.activeElement?.textContent).toBe("Cancelar");
		clicar(cartao, "Cancelar");
		await ate(() => textoDoCartao(cartao) === "Nota criada: A");
		expect(botoesDoCartao(cartao)).toEqual(["Abrir", "Desfazer"]);
		expect(desfazerEnviado()).toHaveLength(0);
	});

	it("Apagar com a nota aberta numa aba: salva antes, FECHA a aba, manda desfazer_nota certo e vira 'Nota desfeita' com `desfeita`", async () => {
		controle.extensao = (acao, dados) => {
			if (acao === "desfazer_nota") setTimeout(() => controle.receber("notas", "desfeita", { materia: dados.materia, titulo: dados.titulo, pedido: dados.pedido }), 20);
		};
		guardarAbas([aba("A"), aba("B")]);
		desenhar(rotaDa("A"), HISTORICO_DO_CARTAO);
		await ate(() => notaPronta("A") && cartoes().length === 1);
		expect(rotulosDasAbas()).toEqual(["A", "B"]);
		const cartao = cartoes()[0]!;
		clicar(cartao, "Desfazer");
		await ate(() => botoesDoCartao(cartao).includes("Apagar"));
		clicar(cartao, "Apagar");
		await ate(() => desfazerEnviado().length === 1);
		const enviado = desfazerEnviado()[0]!;
		expect(enviado.painel).toBe("notas");
		expect(enviado.dados).toMatchObject({ materia: MATERIA, titulo: "A", sessao: SESSAO });
		expect(typeof enviado.dados.pedido).toBe("string");
		// A aba "A" já tinha saído da faixa quando a ação foi mandada, e o editor foi mandado salvar antes de a aba fechar.
		expect(controle.abasNoEnvio.find((registro) => registro.acao === "desfazer_nota")?.abas).toEqual(["B"]);
		expect(controle.antesDeTrocar).toHaveBeenCalled();
		await ate(() => textoDoCartao(cartao) === "Nota desfeita");
		expect(botoesDoCartao(cartao)).toEqual([]);
		expect(cartoes()[0]).toBe(cartao);
		expect(controle.salvamentos).toBe(0);
	});

	it("com a nota fechada, não mexe em aba nenhuma", async () => {
		controle.extensao = (acao, dados) => {
			if (acao === "desfazer_nota") controle.receber("notas", "desfeita", { materia: dados.materia, titulo: dados.titulo, pedido: dados.pedido });
		};
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => notaPronta("B") && cartoes().length === 1);
		clicar(cartoes()[0]!, "Desfazer");
		await ate(() => botoesDoCartao(cartoes()[0]!).includes("Apagar"));
		clicar(cartoes()[0]!, "Apagar");
		await ate(() => textoDoCartao(cartoes()[0]!) === "Nota desfeita");
		expect(rotulosDasAbas()).toEqual(["B"]);
	});

	it("o erro da extensão vira a mensagem no cartão, só com Abrir", async () => {
		controle.extensao = (acao, dados) => {
			if (acao === "desfazer_nota") controle.receber("notas", "erro", { ao: "desfazer_nota", mensagem: "Você mexeu na nota; ela não foi apagada.", pedido: dados.pedido, materia: dados.materia, titulo: dados.titulo });
		};
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => cartoes().length === 1);
		const cartao = cartoes()[0]!;
		clicar(cartao, "Desfazer");
		await ate(() => botoesDoCartao(cartao).includes("Apagar"));
		clicar(cartao, "Apagar");
		await ate(() => textoDoCartao(cartao) === "Você mexeu na nota; ela não foi apagada.");
		expect(botoesDoCartao(cartao)).toEqual(["Abrir"]);
		expect(cartao.dataset.estado).toBe("recusada");
	});

	it("'Desfazendo…' só aparece depois de 1 s; antes disso fica a confirmação, com os botões desligados", async () => {
		controle.extensao = (acao, dados) => {
			if (acao === "desfazer_nota") setTimeout(() => controle.receber("notas", "desfeita", { materia: dados.materia, titulo: dados.titulo, pedido: dados.pedido }), 1400);
		};
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => cartoes().length === 1);
		const cartao = cartoes()[0]!;
		clicar(cartao, "Desfazer");
		await ate(() => botoesDoCartao(cartao).includes("Apagar"));
		clicar(cartao, "Apagar");
		await ate(() => desfazerEnviado().length === 1);
		await esperar(400);
		expect(textoDoCartao(cartao)).toBe("Apagar a nota? Não dá para voltar atrás.");
		expect([...cartao.querySelectorAll("button")].every((botao) => botao.disabled)).toBe(true);
		await ate(() => textoDoCartao(cartao) === "Desfazendo…", 1500);
		await ate(() => textoDoCartao(cartao) === "Nota desfeita", 2000);
	}, 8000);

	it("ao reabrir a conversa o cartão volta 'Nota criada' sem repetir nada: só a lista de notas é lida", async () => {
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => notaPronta("B") && cartoes().length === 1);
		await esperar(100);
		expect(textoDoCartao(cartoes()[0]!)).toBe("Nota criada: A");
		const acoes = controle.enviadas.map((enviada) => `${enviada.painel}:${enviada.acao}`);
		for (const proibida of ["notas:desfazer_nota", "notas:guardar", "notas:guardou", "notas:criar", "notas:salvar"]) expect(acoes).not.toContain(proibida);
		// A lista (que a extensão respondeu com a nota) foi pedida uma vez só, e o cartão continua criado.
		expect(acoes.filter((acao) => acao === "notas:listar")).toHaveLength(1);
	});

	it("ao reabrir, se a lista nova não tem a nota, o cartão vira 'A nota não existe mais' (só com o título, sem botões)", async () => {
		controle.titulosDaLista = ["B"];
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => cartoes().length === 1 && textoDoCartao(cartoes()[0]!) === "A nota não existe mais");
		expect(botoesDoCartao(cartoes()[0]!)).toEqual([]);
	});

	it("uma nota criada ao vivo pede a lista de novo, e o `desfeita` também (a lista não se atualiza sozinha)", async () => {
		guardarAbas([aba("B")]);
		controle.conversa = [usuario("hu1"), ferramenta("hf1", "call-1"), resposta("hr1", "Criei.")];
		desenhar(rotaDa("B"));
		await ate(() => notaPronta("B"));
		const listas = () => controle.enviadas.filter((enviada) => enviada.acao === "listar").length;
		const antes = listas();
		controle.receber("mesa", "nota_criada", notaCriada("x", "call-1").dados);
		await ate(() => cartoes().length === 1 && listas() === antes + 1);
		controle.receber("notas", "desfeita", { materia: MATERIA, titulo: "A", pedido: "outro" });
		await ate(() => listas() === antes + 2);
		await ate(() => textoDoCartao(cartoes()[0]!) === "Nota desfeita");
	});

	it("o tamanho não muda entre os estados: o mesmo elemento na mesma linha reservada, e o CSS fixa a altura do cartão", async () => {
		guardarAbas([aba("B")]);
		desenhar(rotaDa("B"), HISTORICO_DO_CARTAO);
		await ate(() => cartoes().length === 1);
		const cartao = cartoes()[0]!;
		const linha = cartao.closest(".bloco__rodape");
		const irmaos = linha!.childElementCount;
		clicar(cartao, "Desfazer");
		await ate(() => botoesDoCartao(cartao).includes("Apagar"));
		clicar(cartao, "Cancelar");
		await ate(() => botoesDoCartao(cartao).includes("Abrir"));
		expect(cartoes()[0]).toBe(cartao);
		expect(cartao.closest(".bloco__rodape")).toBe(linha);
		expect(linha!.childElementCount).toBe(irmaos);
		const css = readFileSync(resolve(process.cwd(), "profiles/estudos/paineis/src/mesa.css"), "utf8");
		expect(css).toMatch(/\.nota-criada \{[^}]*height: 32px;/);
		expect(css).toMatch(/\.nota-criada__texto \{[^}]*-webkit-line-clamp: 2;/);
		expect(css).toMatch(/\.tag-professor \{[^}]*height: 18px;[^}]*white-space: nowrap;/);
	});
});

describe("a tag 'do professor' na lista de notas", () => {
	it("aparece só nos itens com doProfessor: true, e o item mantém a estrutura", async () => {
		const lista: ListaNotas = {
			materia: MATERIA,
			notas: [
				{ titulo: "Do professor", modificadaEm: "2026-11-11T10:00:00.000Z", tamanho: 10, previa: "Resumo", doProfessor: true },
				{ titulo: "Minha", modificadaEm: "2026-11-10T10:00:00.000Z", tamanho: 10, previa: "Texto", doProfessor: false },
			],
		};
		const janela = { estado: { perfil: PERFIL, sessao: { sessaoId: SESSAO }, acoesPorPainel: {} }, acoes: { acaoDaInterface: async () => {} } } as unknown as JanelaPerfilHook;
		root.render(createElement(SecaoNotas, { janela, materiaId: MATERIA, lista, tom: "tijolo" as never, abrirNota: () => {}, criando: false, definirCriando: () => {} }));
		await ate(() => container.querySelectorAll(".notas__item").length === 2);
		const itens = [...container.querySelectorAll<HTMLElement>(".notas__item")];
		expect(itens.map((item) => item.querySelector(".tag-professor")?.textContent ?? null)).toEqual(["do professor", null]);
		expect(itens.map((item) => item.querySelector(".notas__titulo")?.textContent)).toEqual(["Do professor", "Minha"]);
	});
});

describe("o clique no link conversa:<id> da nota", () => {
	const linkDaNota = () => container.querySelector<HTMLAnchorElement>('a[href^="conversa:"]');

	it("na nota editável: reabre a conversa pelo id curto exato (não pelo prefixo), salvando antes, abre o professor e não navega", async () => {
		guardarAbas([aba("P")]);
		desenhar(rotaDa("P"));
		await ate(() => notaPronta("P") && linkDaNota() !== null);
		const link = linkDaNota()!;
		// O href chega inteiro ao DOM (o Link do TipTap só deixa passar protocolos registrados).
		expect(link.getAttribute("href")).toBe(`conversa:${idCurtoDaConversa(CONVERSA_A)}`);
		const aberto = () => container.querySelector(".mesa")?.getAttribute("data-aberta");
		expect(aberto()).toBe("nao");
		const clique = new MouseEvent("click", { bubbles: true, cancelable: true });
		link.dispatchEvent(clique);
		expect(clique.defaultPrevented).toBe(true);
		await ate(() => controle.abrirSessao.mock.calls.length === 1);
		expect(controle.abrirSessao.mock.calls[0]![0]).toBe(CONVERSA_A);
		expect(controle.abrirSessao.mock.calls[0]![1]).toMatchObject({ chave: `materia:${MATERIA}` });
		expect(controle.antesDeTrocar).toHaveBeenCalled();
		expect(controle.antesDeTrocar.mock.invocationCallOrder[0]!).toBeLessThan(controle.abrirSessao.mock.invocationCallOrder[0]!);
		await ate(() => aberto() === "sim");
	});

	it("o clique em outro link (o da outra conversa, na nota em leitura) abre a conversa dele", async () => {
		guardarAbas([aba("L")]);
		desenhar(rotaDa("L"));
		await ate(() => notaPronta("L") && linkDaNota() !== null);
		// A nota tem HTML desconhecido: abre só para leitura.
		expect(container.textContent).toContain("Só leitura");
		const clique = new MouseEvent("click", { bubbles: true, cancelable: true });
		linkDaNota()!.dispatchEvent(clique);
		expect(clique.defaultPrevented).toBe(true);
		await ate(() => controle.abrirSessao.mock.calls.length === 1);
		expect(controle.abrirSessao.mock.calls[0]![0]).toBe(CONVERSA_B);
	});

	it("conversa que não existe mais: aviso curto, nada é trocado, e o clique também não navega", async () => {
		guardarAbas([aba("S")]);
		desenhar(rotaDa("S"));
		await ate(() => notaPronta("S") && linkDaNota() !== null);
		const clique = new MouseEvent("click", { bubbles: true, cancelable: true });
		linkDaNota()!.dispatchEvent(clique);
		expect(clique.defaultPrevented).toBe(true);
		await ate(() => container.querySelector(".mesa__conversa-aviso")?.textContent === "Essa conversa não existe mais.");
		expect(controle.abrirSessao).not.toHaveBeenCalled();
		expect(controle.antesDeTrocar).not.toHaveBeenCalled();
	});

	it("uma conversa de outra matéria com o mesmo id curto não vale", async () => {
		controle.sessoes = [resumo(CONVERSA_A, { contexto: { chave: "materia:fisica", rotulo: "Física" } })];
		guardarAbas([aba("P")]);
		desenhar(rotaDa("P"));
		await ate(() => notaPronta("P") && linkDaNota() !== null);
		linkDaNota()!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await ate(() => container.querySelector(".mesa__conversa-aviso") !== null);
		expect(controle.abrirSessao).not.toHaveBeenCalled();
	});

	it("com o professor respondendo, pede confirmação antes de trocar; Trocar troca, Cancelar não", async () => {
		controle.executando = true;
		guardarAbas([aba("P")]);
		desenhar(rotaDa("P"));
		await ate(() => notaPronta("P") && linkDaNota() !== null);
		linkDaNota()!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await ate(() => container.querySelector(".mesa__conversa-aviso--acao") !== null);
		expect(container.querySelector(".mesa__conversa-aviso--acao")?.textContent).toContain("O professor está respondendo. Trocar mesmo assim?");
		expect(controle.abrirSessao).not.toHaveBeenCalled();
		const botao = (rotulo: string) => [...container.querySelectorAll<HTMLButtonElement>(".mesa__conversa-aviso button")].find((candidato) => candidato.textContent === rotulo)!;
		botao("Cancelar").click();
		await ate(() => container.querySelector(".mesa__conversa-aviso") === null);
		expect(controle.abrirSessao).not.toHaveBeenCalled();
		linkDaNota()!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await ate(() => container.querySelector(".mesa__conversa-aviso--acao") !== null);
		botao("Trocar").click();
		await ate(() => controle.abrirSessao.mock.calls.length === 1);
		expect(controle.abrirSessao.mock.calls[0]![0]).toBe(CONVERSA_A);
	});

	it("um link comum da nota continua como era (o clique no texto da nota não abre conversa)", async () => {
		guardarAbas([aba("P")]);
		desenhar(rotaDa("P"));
		await ate(() => notaPronta("P"));
		container.querySelector(".editor-nota__texto")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await esperar(50);
		expect(controle.abrirSessao).not.toHaveBeenCalled();
	});
});
