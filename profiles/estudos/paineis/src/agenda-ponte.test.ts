// @vitest-environment happy-dom
// A ponte da agenda (agenda-ponte.ts): a leitura do que a extensão mandou, a
// espera pelo pedido, a mudança otimista e o hook useAgenda com uma janela falsa.

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Agenda, agendaPadrao, criarTarefa, type MensagemAgenda } from "../../lib/agenda-tipos.ts";
import { ErroDaPonte } from "./cursos-ponte.ts";
import { EsperaDePedidos } from "./escrita-ponte.ts";
import {
	type AgendaAberta,
	agendaDaMensagem,
	lerAgenda,
	type LoteAgenda,
	mostrarAgenda,
	respostaAgenda,
	semResposta,
	useAgenda,
} from "./agenda-ponte.ts";

let contador = 0;
const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++contador}`, acao, dados });

function agendaComTarefas(...titulos: string[]): Agenda {
	let agenda = agendaPadrao();
	for (const [indice, titulo] of titulos.entries()) agenda = criarTarefa(agenda, { titulo }, { id: `t${indice + 1}`, agora: new Date("2026-11-03T12:00:00Z") }).agenda;
	return agenda;
}

const mensagem = (agenda: Agenda, extra: Partial<MensagemAgenda> = {}): MensagemAgenda => ({
	colunas: agenda.colunas,
	tarefas: agenda.tarefas,
	provas: [],
	materias: [{ id: "calculo", nome: "Cálculo I", cor: "moss" }],
	...extra,
});

const ids = (agenda: Agenda | undefined, coluna: string) => agenda?.tarefas.filter((tarefa) => tarefa.coluna === coluna).map((tarefa) => tarefa.id);

describe("lerAgenda", () => {
	it("a última agenda, com ou sem pedido, e os pedidos já respondidos", () => {
		const a = agendaComTarefas("a");
		const b = agendaComTarefas("a", "b");
		const lido = lerAgenda([recebida("agenda", mensagem(a)), recebida("agenda", mensagem(b, { pedido: "p1" })), recebida("erro", { mensagem: "Ruim.", pedido: "p2" })]);
		expect(lido.mensagem?.tarefas.map((tarefa) => tarefa.id)).toEqual(["t1", "t2"]);
		expect([...lido.respondidos]).toEqual(["p1", "p2"]);
		expect(lido.erro).toBeUndefined();
	});

	it("um erro sem pedido fica até uma agenda nova chegar; o erro com pedido é de quem pediu", () => {
		const a = agendaComTarefas("a");
		const comErro = lerAgenda([recebida("erro", { ao: "abrir", mensagem: "O agenda.json não abre." }), recebida("erro", { mensagem: "De uma ação.", pedido: "p1" })]);
		expect(comErro.erro).toMatchObject({ mensagem: "O agenda.json não abre.", ao: "abrir" });
		expect(comErro.mensagem).toBeUndefined();
		const depois = lerAgenda([recebida("erro", { ao: "abrir", mensagem: "Ruim." }), recebida("agenda", mensagem(a))]);
		expect(depois.erro).toBeUndefined();
	});

	it("ignora uma mensagem sem colunas ou tarefas e não quebra com dados que não são objeto", () => {
		const lido = lerAgenda([recebida("agenda", { colunas: "x" }), recebida("agenda", undefined), recebida("erro", undefined), recebida("outra", {})]);
		expect(lido.mensagem).toBeUndefined();
		expect(lido.erro).toBeUndefined();
	});

	it("a agenda da mensagem tem a versão e a ordem do quadro", () => {
		const agenda = agendaDaMensagem(mensagem(agendaComTarefas("a")));
		expect(agenda.versao).toBe(1);
		expect(agenda.colunas.map((coluna) => coluna.id)).toEqual(["a-fazer", "fazendo", "feito"]);
	});
});

describe("respostaAgenda e a espera pelo pedido", () => {
	it("acha a agenda ou o erro com o pedido", () => {
		const lista = [
			recebida("agenda", mensagem(agendaComTarefas("a"))),
			recebida("agenda", mensagem(agendaComTarefas("a", "b"), { pedido: "p1", criada: "t2" })),
			recebida("erro", { mensagem: "Escreva o título da tarefa.", ao: "criar_tarefa", pedido: "p2" }),
		];
		expect(respostaAgenda(lista, "p1")).toMatchObject({ tipo: "ok", dados: { criada: "t2" } });
		expect(respostaAgenda(lista, "p2")).toEqual({ tipo: "erro", mensagem: "Escreva o título da tarefa." });
		expect(respostaAgenda(lista, "p3")).toBeUndefined();
	});

	it("a promessa espera o pedido dela e um erro rejeita com ErroDaPonte", async () => {
		const espera = new EsperaDePedidos(respostaAgenda, (texto) => new ErroDaPonte(texto));
		const resolvida = espera.esperar("p1");
		const rejeitada = espera.esperar("p2");
		espera.receber([recebida("agenda", mensagem(agendaComTarefas("a"), { pedido: "outro" }))]);
		expect(espera.quantos).toBe(2);
		espera.receber([
			recebida("agenda", mensagem(agendaComTarefas("a"), { pedido: "p1" })),
			recebida("erro", { mensagem: "Não achei a tarefa.", pedido: "p2" }),
		]);
		await expect(resolvida).resolves.toMatchObject({ pedido: "p1" });
		await expect(rejeitada).rejects.toBeInstanceOf(ErroDaPonte);
		await expect(rejeitada).rejects.toThrow("Não achei a tarefa.");
	});
});

describe("mostrarAgenda", () => {
	const base = agendaComTarefas("a", "b", "c");

	it("aplica o mover na hora, na posição pedida, sem mexer na agenda de entrada", () => {
		const lotes: LoteAgenda[] = [{ tipo: "mover", pedido: "p1", id: "t3", coluna: "fazendo", posicao: 0 }];
		const visto = mostrarAgenda(base, lotes);
		expect(ids(visto, "a-fazer")).toEqual(["t1", "t2"]);
		expect(ids(visto, "fazendo")).toEqual(["t3"]);
		expect(ids(base, "fazendo")).toEqual([]);
	});

	it("mover para a coluna de feito conclui; vários lotes valem em ordem", () => {
		const visto = mostrarAgenda(base, [
			{ tipo: "mover", pedido: "p1", id: "t1", coluna: "feito" },
			{ tipo: "mover", pedido: "p2", id: "t2", coluna: "feito", posicao: 0 },
		]);
		expect(ids(visto, "feito")).toEqual(["t2", "t1"]);
		expect(visto.tarefas.find((tarefa) => tarefa.id === "t1")?.concluidaEm).toBeDefined();
	});

	it("reordenar as colunas", () => {
		const visto = mostrarAgenda(base, [{ tipo: "reordenar_colunas", pedido: "p1", ids: ["fazendo", "a-fazer", "feito"] }]);
		expect(visto.colunas.map((coluna) => coluna.id)).toEqual(["fazendo", "a-fazer", "feito"]);
	});

	it("um lote que não vale é pulado e os outros continuam", () => {
		const visto = mostrarAgenda(base, [
			{ tipo: "mover", pedido: "p1", id: "nao-existe", coluna: "feito" },
			{ tipo: "mover", pedido: "p2", id: "t1", coluna: "coluna-que-nao-existe" },
			{ tipo: "reordenar_colunas", pedido: "p3", ids: ["feito"] },
			{ tipo: "mover", pedido: "p4", id: "t2", coluna: "fazendo" },
		]);
		expect(ids(visto, "fazendo")).toEqual(["t2"]);
		expect(visto.colunas.map((coluna) => coluna.id)).toEqual(["a-fazer", "fazendo", "feito"]);
	});

	it("sem lotes, a mesma agenda", () => {
		expect(mostrarAgenda(base, [])).toBe(base);
	});

	it("semResposta tira os lotes já respondidos", () => {
		const lotes: LoteAgenda[] = [
			{ tipo: "mover", pedido: "p1", id: "t1", coluna: "feito" },
			{ tipo: "mover", pedido: "p2", id: "t2", coluna: "feito" },
		];
		expect(semResposta(lotes, new Set(["p1"])).map((lote) => lote.pedido)).toEqual(["p2"]);
	});
});

// --- O hook com uma janela falsa ------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let acoesDaTela: ReturnType<typeof vi.fn>;
// Estável entre as renderizações, como o `acoes` do useJanelaPerfil.
let acoesFalsas: { acaoDaInterface: ReturnType<typeof vi.fn> };
let recebidas: AcaoRecebida[];
let aberta: AgendaAberta | undefined;

function Sonda(props: { janela: JanelaPerfilHook; vez?: string }) {
	aberta = useAgenda(props.janela, props.vez);
	return null;
}

function janelaFalsa(): JanelaPerfilHook {
	return {
		estado: { sessao: { sessaoId: "s1" }, acoesPorPainel: { agenda: recebidas } },
		acoes: acoesFalsas,
	} as unknown as JanelaPerfilHook;
}

const desenhar = (vez?: string) =>
	act(() => {
		root.render(createElement(Sonda, { janela: janelaFalsa(), ...(vez !== undefined ? { vez } : {}) }));
	});

/** O pedido da última ação mandada com esse nome. */
const pedidoDe = (acao: string): string => {
	const chamada = [...acoesDaTela.mock.calls].reverse().find(([, nome]) => nome === acao);
	return (chamada?.[2] as { pedido: string }).pedido;
};

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	acoesDaTela = vi.fn(async () => {});
	acoesFalsas = { acaoDaInterface: acoesDaTela };
	recebidas = [];
	aberta = undefined;
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("useAgenda", () => {
	it("pede abrir ao montar e de novo quando a vez muda; só mostra a agenda depois que ela chega", () => {
		desenhar("a");
		expect(acoesDaTela).toHaveBeenCalledTimes(1);
		expect(acoesDaTela).toHaveBeenCalledWith("agenda", "abrir", {});
		expect(aberta?.agenda).toBeUndefined();
		expect(aberta?.provas).toEqual([]);
		recebidas = [recebida("agenda", mensagem(agendaComTarefas("a"), { provas: [{ materia: "calculo", nome: "Cálculo I", cor: "moss", prova: "P1", data: "2026-12-01" }] }))];
		desenhar("a");
		expect(acoesDaTela).toHaveBeenCalledTimes(1);
		expect(aberta?.agenda?.tarefas).toHaveLength(1);
		expect(aberta?.provas).toHaveLength(1);
		expect(aberta?.materias[0]?.nome).toBe("Cálculo I");
		desenhar("b");
		expect(acoesDaTela).toHaveBeenCalledTimes(2);
	});

	it("o erro do abrir aparece e fecha; uma agenda nova o tira", () => {
		recebidas = [recebida("erro", { ao: "abrir", mensagem: "O agenda.json não abre." })];
		desenhar();
		// O que já estava lá ao montar é de antes.
		expect(aberta?.erro).toBeUndefined();
		recebidas = [...recebidas, recebida("erro", { ao: "abrir", mensagem: "De novo." })];
		desenhar();
		expect(aberta?.erro?.mensagem).toBe("De novo.");
		act(() => aberta!.fecharErro(aberta!.erro!.chave));
		expect(aberta?.erro).toBeUndefined();
	});

	it("criar tarefa resolve com a resposta e um erro com o pedido rejeita", async () => {
		recebidas = [recebida("agenda", mensagem(agendaComTarefas()))];
		desenhar();
		let resposta: MensagemAgenda | undefined;
		act(() => {
			void aberta!.criarTarefa({ titulo: "Ler", data: "2026-11-10" }).then((mensagemRecebida) => (resposta = mensagemRecebida));
		});
		expect(acoesDaTela).toHaveBeenLastCalledWith("agenda", "criar_tarefa", expect.objectContaining({ titulo: "Ler", data: "2026-11-10", pedido: expect.any(String) }));
		const pedido = pedidoDe("criar_tarefa");
		recebidas = [...recebidas, recebida("agenda", mensagem(agendaComTarefas("Ler"), { pedido, criada: "t1" }))];
		await act(async () => desenhar());
		expect(resposta?.criada).toBe("t1");

		let falha: unknown;
		act(() => {
			aberta!.editarTarefa("t1", { titulo: "" }).catch((erro: unknown) => (falha = erro));
		});
		recebidas = [...recebidas, recebida("erro", { ao: "editar_tarefa", mensagem: "Escreva o título da tarefa.", pedido: pedidoDe("editar_tarefa") })];
		await act(async () => desenhar());
		expect(falha).toBeInstanceOf(ErroDaPonte);
		expect((falha as Error).message).toBe("Escreva o título da tarefa.");
		// O erro de uma ação não otimista vai para quem chamou, não para o erro da tela.
		expect(aberta?.erro).toBeUndefined();
	});

	it("mover é otimista: a tarefa muda de coluna na hora e a resposta não faz a tela piscar", async () => {
		recebidas = [recebida("agenda", mensagem(agendaComTarefas("a", "b")))];
		desenhar();
		expect(ids(aberta?.agenda, "a-fazer")).toEqual(["t1", "t2"]);
		act(() => {
			void aberta!.moverTarefa("t2", "fazendo");
		});
		expect(ids(aberta?.agenda, "fazendo")).toEqual(["t2"]);
		expect(acoesDaTela).toHaveBeenLastCalledWith("agenda", "mover_tarefa", expect.objectContaining({ id: "t2", coluna: "fazendo" }));
		// Uma agenda do servidor que ainda não tem a mudança (a resposta de outra ação) não desfaz.
		recebidas = [...recebidas, recebida("agenda", mensagem(agendaComTarefas("a", "b")))];
		desenhar();
		expect(ids(aberta?.agenda, "fazendo")).toEqual(["t2"]);
		// A resposta do pedido traz a mudança; o lote sai e o estado é o do servidor.
		const pedido = pedidoDe("mover_tarefa");
		const movida = mostrarAgenda(agendaComTarefas("a", "b"), [{ tipo: "mover", pedido, id: "t2", coluna: "fazendo" }]);
		recebidas = [...recebidas, recebida("agenda", mensagem(movida, { pedido }))];
		await act(async () => desenhar());
		expect(ids(aberta?.agenda, "fazendo")).toEqual(["t2"]);
		expect(ids(aberta?.agenda, "a-fazer")).toEqual(["t1"]);
	});

	it("um erro no mover desfaz a mudança e aparece em erro", async () => {
		recebidas = [recebida("agenda", mensagem(agendaComTarefas("a")))];
		desenhar();
		let rejeitada = false;
		act(() => {
			aberta!.moverTarefa("t1", "feito").catch(() => (rejeitada = true));
		});
		expect(ids(aberta?.agenda, "feito")).toEqual(["t1"]);
		recebidas = [...recebidas, recebida("erro", { ao: "mover_tarefa", mensagem: "Não achei a coluna.", pedido: pedidoDe("mover_tarefa") })];
		await act(async () => desenhar());
		expect(rejeitada).toBe(true);
		expect(ids(aberta?.agenda, "feito")).toEqual([]);
		expect(ids(aberta?.agenda, "a-fazer")).toEqual(["t1"]);
		expect(aberta?.erro).toMatchObject({ mensagem: "Não achei a coluna.", ao: "mover" });
	});

	it("reordenar as colunas também é otimista", () => {
		recebidas = [recebida("agenda", mensagem(agendaComTarefas()))];
		desenhar();
		act(() => {
			void aberta!.reordenarColunas(["fazendo", "a-fazer", "feito"]);
		});
		expect(aberta?.agenda?.colunas.map((coluna) => coluna.id)).toEqual(["fazendo", "a-fazer", "feito"]);
		expect(acoesDaTela).toHaveBeenLastCalledWith("agenda", "reordenar_colunas", expect.objectContaining({ ids: ["fazendo", "a-fazer", "feito"] }));
	});

	it("a ação que nem chegou a sair (a conexão caiu) rejeita com a frase", async () => {
		recebidas = [recebida("agenda", mensagem(agendaComTarefas("a")))];
		desenhar();
		acoesDaTela.mockRejectedValueOnce(new Error("sem conexão"));
		let falha: unknown;
		await act(async () => {
			await aberta!.apagarTarefa("t1").catch((erro: unknown) => (falha = erro));
		});
		expect((falha as Error).message).toBe("Não consegui falar com a sessão: sem conexão");
	});

	it("as outras ações mandam os dados do contrato", () => {
		recebidas = [recebida("agenda", mensagem(agendaComTarefas("a")))];
		desenhar();
		act(() => {
			void aberta!.criarColuna("Revisar", 1).catch(() => {});
			void aberta!.renomearColuna("fazendo", "Em andamento").catch(() => {});
			void aberta!.marcarFeito("feito").catch(() => {});
			void aberta!.apagarColuna("fazendo", "a-fazer").catch(() => {});
			void aberta!.apagarTarefa("t1").catch(() => {});
		});
		const mandadas = acoesDaTela.mock.calls.slice(1).map(([, acao, dados]) => [acao, dados]);
		expect(mandadas).toEqual([
			["criar_coluna", { nome: "Revisar", posicao: 1, pedido: expect.any(String) }],
			["renomear_coluna", { id: "fazendo", nome: "Em andamento", pedido: expect.any(String) }],
			["marcar_feito", { id: "feito", pedido: expect.any(String) }],
			["apagar_coluna", { id: "fazendo", destino: "a-fazer", pedido: expect.any(String) }],
			["apagar_tarefa", { id: "t1", pedido: expect.any(String) }],
		]);
	});
});
