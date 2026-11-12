// @vitest-environment happy-dom
// O cliente da ponte das abas Hipóteses e Histórico (aprendiz-hipoteses-ponte.ts): a leitura do que a extensão mandou, as
// ações que só valem se chegaram depois da montagem, os pedidos casados pelo `pedido`, a retentativa quando o envio lança
// e o prazo da resposta. As janelas são falsas (nada de rede nem de pasta de dados).

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventoDeTeste, estadoDeTeste, hipoteseDeTeste, hipotesesVariadas, indicadoresDeTeste, mudancaDeTeste, resumoDeTeste } from "./aprendiz-fixtures.ts";
import {
	AVISO_SEM_CONFIRMACAO,
	estadoDaMensagem,
	type HipotesesAbertas,
	type HistoricoAberto,
	lerHipoteses,
	lerHistorico,
	PRAZO_DA_RESPOSTA_MS,
	useHipoteses,
	useHistorico,
} from "./aprendiz-hipoteses-ponte.ts";
import { erroEhDosIndicadores, lerAprendiz, PAINEL_APRENDIZ } from "./aprendiz-ponte.ts";
import { AVISO_SESSAO_TROCANDO, ESPERA_RETENTATIVA_MS } from "./guardar-na-nota.ts";

let contador = 0;
const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++contador}`, acao, dados });

describe("estadoDaMensagem", () => {
	it("aceita o estado da extensão e completa o que falta", () => {
		const lido = estadoDaMensagem({ estado: hipotesesVariadas() });
		expect(lido?.hipoteses).toHaveLength(4);
		expect(lido?.mudancas).toHaveLength(1);
		expect(lido?.ultimaReflexao?.lidos).toBe(14);
		expect(lido?.refletindo).toBe(false);
	});

	it("descarta a hipótese sem id, sem enunciado, sem status válido ou sem escopo; completa os campos opcionais", () => {
		const lido = estadoDaMensagem({
			estado: {
				hipoteses: [
					{ id: "h-ok", enunciado: "Um enunciado.", status: "proposta", escopo: { nivel: "global" } },
					{ id: "h-sem-escopo", enunciado: "x", status: "proposta" },
					{ id: "h-status", enunciado: "x", status: "ligada", escopo: { nivel: "global" } },
					{ enunciado: "sem id", status: "proposta", escopo: { nivel: "global" } },
					{ id: "h-materia", enunciado: "x", status: "aprovada", escopo: { nivel: "materia" } },
					null,
				],
				mudancas: [{ id: "m-1", hipotese: "h-ok", acao: "expirar" }, { id: "m-sem-hipotese" }],
				refletindo: true,
			},
		});
		expect(lido?.hipoteses.map((h) => h.id)).toEqual(["h-ok"]);
		expect(lido?.hipoteses[0]).toMatchObject({ aFavor: [], contra: [], anteriores: [], versao: 1, aprovadaPeloUsuario: false, confianca: "baixa" });
		expect(lido?.mudancas.map((m) => m.id)).toEqual(["m-1"]);
		expect(lido?.mudancas[0]).toMatchObject({ evidencias: [], motivo: "" });
		expect(lido?.refletindo).toBe(true);
	});

	it("recusa o que não tem a forma esperada", () => {
		expect(estadoDaMensagem(undefined)).toBeUndefined();
		expect(estadoDaMensagem({})).toBeUndefined();
		expect(estadoDaMensagem({ estado: { hipoteses: "x" } })).toBeUndefined();
	});
});

describe("lerHipoteses", () => {
	it("o último estado vale (hipoteses, decidida ou refletiu)", () => {
		const a = estadoDeTeste([hipoteseDeTeste({ id: "h-1" })]);
		const b = estadoDeTeste([hipoteseDeTeste({ id: "h-1" }), hipoteseDeTeste({ id: "h-2" })]);
		const lido = lerHipoteses([recebida("hipoteses", { estado: a }), recebida("decidida", { pedido: "p1", estado: b })]);
		expect(lido.valor?.hipoteses).toHaveLength(2);
		expect(lido.respostas.get("p1")).toEqual({ tipo: "ok" });
		expect(lido.chaveDaUltima).toBeDefined();
	});

	it("refletindo: o `refletindo` liga, o `refletiu` desliga e traz o resumo; o estado manda no resto", () => {
		const parado = estadoDeTeste([], [], { refletindo: false });
		const ligado = lerHipoteses([recebida("hipoteses", { estado: parado }), recebida("refletindo", { pedido: "p1" })]);
		expect(ligado.refletindo).toBe(true);
		expect(ligado.reconhecidos.has("p1")).toBe(true);
		const resumo = resumoDeTeste({ id: "r-9" });
		const fim = lerHipoteses([recebida("refletindo", { pedido: "p1" }), recebida("refletiu", { pedido: "p1", resumo, estado: parado })]);
		expect(fim.refletindo).toBe(false);
		expect(fim.respostas.get("p1")).toMatchObject({ tipo: "ok", resumo: { id: "r-9" } });
		expect(fim.valor?.ultimaReflexao?.id).toBe("r-9");
		// Uma reflexão automática: a extensão manda `hipoteses` sozinha, com refletindo true e depois false.
		const automatica = lerHipoteses([recebida("hipoteses", { estado: estadoDeTeste([], [], { refletindo: true }) })]);
		expect(automatica.refletindo).toBe(true);
		const acabou = lerHipoteses([recebida("hipoteses", { estado: estadoDeTeste([], [], { refletindo: true }) }), recebida("hipoteses", { estado: parado })]);
		expect(acabou.refletindo).toBe(false);
	});

	it("um erro com o pedido de uma reflexão que já começou a encerra; um erro com o pedido antes de começar (já rodava) não muda nada", () => {
		const rodando = estadoDeTeste([], [], { refletindo: true });
		const antes = lerHipoteses([recebida("hipoteses", { estado: rodando }), recebida("erro", { pedido: "p1", ao: "refletir", mensagem: "Já há uma reflexão." })]);
		expect(antes.refletindo).toBe(true);
		expect(antes.respostas.get("p1")).toEqual({ tipo: "erro", mensagem: "Já há uma reflexão." });
		const depois = lerHipoteses([recebida("refletindo", { pedido: "p2" }), recebida("erro", { pedido: "p2", ao: "refletir", mensagem: "O modelo falhou." })]);
		expect(depois.refletindo).toBe(false);
	});

	it("o erro de leitura (sem pedido, ao hipoteses) tira o estado; um estado depois o apaga; o erro de outro `ao` não é desta leitura", () => {
		const estado = estadoDeTeste([hipoteseDeTeste({ id: "h-1" })]);
		const comErro = lerHipoteses([recebida("hipoteses", { estado }), recebida("erro", { ao: "hipoteses", mensagem: "Arquivo ilegível." })]);
		expect(comErro.erro?.mensagem).toBe("Arquivo ilegível.");
		expect(comErro.valor).toBeUndefined();
		const curado = lerHipoteses([recebida("erro", { ao: "hipoteses", mensagem: "x" }), recebida("hipoteses", { estado })]);
		expect(curado.erro).toBeUndefined();
		expect(curado.valor).toBeDefined();
		const dosOutros = lerHipoteses([recebida("hipoteses", { estado }), recebida("erro", { ao: "historico", mensagem: "x" }), recebida("erro", { mensagem: "dos indicadores" })]);
		expect(dosOutros.erro).toBeUndefined();
		expect(dosOutros.valor).toBeDefined();
	});

	it("a reflexão automática que falha (erro sem pedido, ao refletir) vira o erro solto, que o `refletindo` seguinte apaga", () => {
		const falha = lerHipoteses([recebida("refletindo", {}), recebida("erro", { ao: "refletir", mensagem: "Sem chave de API." })]);
		expect(falha.erroSolto?.mensagem).toBe("Sem chave de API.");
		expect(falha.refletindo).toBe(false);
		const outra = lerHipoteses([recebida("erro", { ao: "refletir", mensagem: "x" }), recebida("refletindo", {})]);
		expect(outra.erroSolto).toBeUndefined();
	});

	it("as chaves ignoradas não valem", () => {
		const velha = recebida("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-velha" })]) });
		const nova = recebida("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-nova" })]) });
		expect(lerHipoteses([velha, nova], new Set([velha.chave])).valor?.hipoteses[0]?.id).toBe("h-nova");
		const so = lerHipoteses([velha], new Set([velha.chave]));
		expect(so.valor).toBeUndefined();
		expect(so.chaveDaUltima).toBeUndefined();
	});
});

describe("lerHistorico", () => {
	it("o último histórico vale; o erro de `historico` tira os eventos; os erros de outros não", () => {
		const a = recebida("historico", { eventos: [eventoDeTeste({ id: "e-1" })] });
		const b = recebida("historico", { eventos: [eventoDeTeste({ id: "e-1" }), eventoDeTeste({ id: "e-2" })] });
		expect(lerHistorico([a, b]).valor).toHaveLength(2);
		const erro = lerHistorico([a, recebida("erro", { ao: "historico", mensagem: "Sem eventos.jsonl." })]);
		expect(erro.erro?.mensagem).toBe("Sem eventos.jsonl.");
		expect(erro.valor).toBeUndefined();
		const outros = lerHistorico([a, recebida("erro", { ao: "hipoteses", mensagem: "x" }), recebida("erro", { pedido: "p", ao: "historico", mensagem: "x" }), recebida("erro", { mensagem: "dos indicadores" })]);
		expect(outros.erro).toBeUndefined();
		expect(outros.valor).toHaveLength(1);
	});
});

describe("os erros da parte B não derrubam os indicadores", () => {
	it("um erro com pedido ou de outro `ao` não é dos indicadores; um sem `ao` (parte A) ou com ao indicadores é", () => {
		expect(erroEhDosIndicadores({ mensagem: "x" })).toBe(true);
		expect(erroEhDosIndicadores({ ao: "indicadores", mensagem: "x" })).toBe(true);
		expect(erroEhDosIndicadores(undefined)).toBe(true);
		expect(erroEhDosIndicadores({ pedido: "p1", mensagem: "x" })).toBe(false);
		expect(erroEhDosIndicadores({ ao: "decidir", mensagem: "x" })).toBe(false);
		expect(erroEhDosIndicadores({ ao: "historico", mensagem: "x" })).toBe(false);
	});

	it("lerAprendiz mantém os indicadores quando chega o erro de uma decisão", () => {
		const lido = lerAprendiz([recebida("indicadores", { indicadores: indicadoresDeTeste([]) }), recebida("erro", { pedido: "p1", ao: "decidir", mensagem: "Não deu." })]);
		expect(lido.indicadores).toBeDefined();
		expect(lido.erro).toBeUndefined();
	});
});

// --- Os hooks com uma janela falsa ----------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let pedir: ReturnType<typeof vi.fn>;
let acoesFalsas: { acaoDaInterface: ReturnType<typeof vi.fn> };
let recebidas: AcaoRecebida[];
let sessao: string | undefined;
let abertura: string | undefined;
let hip: HipotesesAbertas | undefined;
let hist: HistoricoAberto | undefined;

function Sonda(props: { janela: JanelaPerfilHook }) {
	hip = useHipoteses(props.janela, abertura);
	hist = useHistorico(props.janela, abertura);
	return null;
}

const janelaFalsa = (): JanelaPerfilHook =>
	({
		estado: { ...(sessao ? { sessao: { sessaoId: sessao } } : {}), acoesPorPainel: { [PAINEL_APRENDIZ]: recebidas } },
		acoes: acoesFalsas,
	}) as unknown as JanelaPerfilHook;

const desenhar = () =>
	act(() => {
		root.render(createElement(Sonda, { janela: janelaFalsa() }));
	});
const chega = (acao: string, dados: unknown) => {
	recebidas = [...recebidas, recebida(acao, dados)];
	desenhar();
};
/** As ações que a tela mandou à extensão, sem as dos indicadores. */
const enviadas = (acao: string) => pedir.mock.calls.filter((chamada) => chamada[1] === acao).map((chamada) => chamada[2] as Record<string, unknown>);
const ultimoPedido = (acao: string): string => String(enviadas(acao).at(-1)?.pedido);

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	pedir = vi.fn(async () => {});
	acoesFalsas = { acaoDaInterface: pedir };
	recebidas = [];
	sessao = "s1";
	abertura = "hipoteses";
	hip = undefined;
	hist = undefined;
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

describe("o pedido ao abrir a aba", () => {
	it("pede `hipoteses` e `historico` ao abrir, de novo a cada abertura (e a cada troca de sessão); aba fechada ou sem sessão não pede", () => {
		abertura = undefined;
		desenhar();
		expect(pedir).not.toHaveBeenCalled();
		abertura = "hipoteses";
		sessao = undefined;
		desenhar();
		expect(pedir).not.toHaveBeenCalled();
		sessao = "s1";
		desenhar();
		expect(enviadas("hipoteses")).toEqual([{}]);
		expect(enviadas("historico")).toEqual([{}]);
		desenhar();
		expect(pedir).toHaveBeenCalledTimes(2);
		abertura = "historico";
		desenhar();
		expect(pedir).toHaveBeenCalledTimes(4);
		sessao = "s2";
		desenhar();
		expect(pedir).toHaveBeenCalledTimes(6);
		abertura = undefined;
		desenhar();
		expect(pedir).toHaveBeenCalledTimes(6);
	});

	it("o histórico pedido não leva matéria (o filtro é da tela)", () => {
		desenhar();
		expect(enviadas("historico")[0]).toEqual({});
	});

	it("sem resposta ainda, nada a mostrar e nenhum erro", () => {
		desenhar();
		expect(hip?.estado).toBeUndefined();
		expect(hip?.erro).toBeUndefined();
		expect(hist?.eventos).toBeUndefined();
		expect(hip?.reflexao).toEqual({ ocupada: false });
	});
});

describe("só valem as respostas desta visita", () => {
	it("o que já estava na ponte ao montar não aparece; o novo sim", () => {
		recebidas = [recebida("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-velha" })]) }), recebida("historico", { eventos: [eventoDeTeste({ id: "e-velho" })] })];
		desenhar();
		expect(hip?.estado).toBeUndefined();
		expect(hist?.eventos).toBeUndefined();
		chega("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-nova" })]) });
		chega("historico", { eventos: [eventoDeTeste({ id: "e-novo" })] });
		expect(hip?.estado?.hipoteses.map((h) => h.id)).toEqual(["h-nova"]);
		expect(hist?.eventos?.map((e) => e.id)).toEqual(["e-novo"]);
	});

	it("depois da troca de sessão, uma resposta que chegou junto com ela não vale, mas o que já se via fica até a nova", () => {
		desenhar();
		chega("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-a" })]) });
		sessao = "s2";
		chega("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-atrasada" })]) });
		expect(hip?.estado?.hipoteses.map((h) => h.id)).toEqual(["h-a"]);
		chega("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-nova" })]) });
		expect(hip?.estado?.hipoteses.map((h) => h.id)).toEqual(["h-nova"]);
	});

	it("uma operação à espera quando a sessão troca é esquecida: o cartão volta a ficar livre", () => {
		desenhar();
		chega("hipoteses", { estado: hipotesesVariadas() });
		act(() => hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "aprovar", rotulo: "aprovar" }));
		expect(hip?.situacao("h-a")).toEqual({ tipo: "salvando", rotulo: "aprovar" });
		const pedidoAntigo = ultimoPedido("decidir");
		sessao = "s2";
		desenhar();
		expect(hip?.situacao("h-a")).toEqual({ tipo: "livre" });
		// A resposta da sessão antiga, que chega junto com a troca (a lista de ações é zerada), não vale.
		sessao = "s3";
		chega("decidida", { pedido: pedidoAntigo, estado: estadoDeTeste([]) });
		expect(hip?.estado?.hipoteses).toHaveLength(4);
	});
});

describe("decidir e editar", () => {
	beforeEach(() => {
		desenhar();
		chega("hipoteses", { estado: hipotesesVariadas() });
	});

	it("manda a ação com um pedido, espera salvando e volta a livre quando chega a `decidida` com o mesmo pedido (e traz o estado novo)", () => {
		act(() => hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "aprovar", rotulo: "aprovar" }));
		const mandada = enviadas("decidir")[0]!;
		expect(mandada).toMatchObject({ alvo: "hipotese", id: "h-a", decisao: "aprovar" });
		expect(typeof mandada.pedido).toBe("string");
		expect("enunciado" in mandada).toBe(false);
		expect(hip?.situacao("h-a")).toEqual({ tipo: "salvando", rotulo: "aprovar" });
		expect(hip?.situacao("h-b")).toEqual({ tipo: "livre" });
		// Uma decidida com outro pedido não resolve este.
		chega("decidida", { pedido: "outro", estado: estadoDeTeste([]) });
		expect(hip?.situacao("h-a").tipo).toBe("salvando");
		chega("decidida", { pedido: String(mandada.pedido), estado: estadoDeTeste([hipoteseDeTeste({ id: "h-a", status: "aprovada", aprovadaPeloUsuario: true })]) });
		expect(hip?.situacao("h-a")).toEqual({ tipo: "livre" });
		expect(hip?.estado?.hipoteses[0]?.status).toBe("aprovada");
	});

	it("decidir com o enunciado novo e editar com enunciado ou status mandam só o que foi dito", () => {
		act(() => hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "aprovar", rotulo: "editar", enunciado: "Novo enunciado." }));
		expect(enviadas("decidir")[0]).toMatchObject({ alvo: "hipotese", id: "h-a", decisao: "aprovar", enunciado: "Novo enunciado." });
		act(() => hip!.editar({ id: "h-b", rotulo: "editar", enunciado: "Outro." }));
		expect(enviadas("editar")[0]).toMatchObject({ id: "h-b", enunciado: "Outro." });
		expect("status" in enviadas("editar")[0]!).toBe(false);
		act(() => hip!.editar({ id: "h-c", rotulo: "reaprovar", status: "aprovada" }));
		expect(enviadas("editar")[1]).toMatchObject({ id: "h-c", status: "aprovada" });
		expect("enunciado" in enviadas("editar")[1]!).toBe(false);
	});

	it("a resposta fica guardada: quando a lista de ações da ponte (limitada) a deixa para trás, o cartão não volta a 'salvando'", () => {
		act(() => hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "aprovar", rotulo: "aprovar" }));
		chega("decidida", { pedido: ultimoPedido("decidir"), estado: hipotesesVariadas() });
		expect(hip?.situacao("h-a")).toEqual({ tipo: "livre" });
		// 60 ações novas depois: a decidida saiu da lista, mas o estado mais novo ficou.
		recebidas = [...Array.from({ length: 49 }, () => recebida("hipoteses", { estado: hipotesesVariadas() }))];
		desenhar();
		expect(hip?.situacao("h-a")).toEqual({ tipo: "livre" });
		act(() => {
			vi.advanceTimersByTime(PRAZO_DA_RESPOSTA_MS * 2);
		});
		expect(hip?.situacao("h-a")).toEqual({ tipo: "livre" });
	});

	it("a mudança é decidida com alvo mudanca", () => {
		act(() => hip!.decidir({ alvo: "mudanca", id: "m-1", decisao: "rejeitar", rotulo: "rejeitar" }));
		expect(enviadas("decidir")[0]).toMatchObject({ alvo: "mudanca", id: "m-1", decisao: "rejeitar" });
		expect(hip?.situacao("m-1").tipo).toBe("salvando");
		expect(hip?.situacao("h-b").tipo).toBe("livre");
	});

	it("um clique enquanto a operação do mesmo alvo espera não manda outra", () => {
		act(() => hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "aprovar", rotulo: "aprovar" }));
		act(() => hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "rejeitar", rotulo: "rejeitar" }));
		expect(enviadas("decidir")).toHaveLength(1);
	});

	it("o erro com o pedido fica no alvo, com a mensagem; outra tentativa tira o erro e manda um pedido novo", () => {
		act(() => hip!.editar({ id: "h-b", rotulo: "rejeitar", status: "rejeitada" }));
		const pedido = ultimoPedido("editar");
		chega("erro", { pedido, ao: "editar", mensagem: "Não consegui gravar o perfil." });
		expect(hip?.situacao("h-b")).toEqual({ tipo: "erro", mensagem: "Não consegui gravar o perfil.", rotulo: "rejeitar" });
		expect(hip?.estado).toBeDefined();
		act(() => hip!.editar({ id: "h-b", rotulo: "rejeitar", status: "rejeitada" }));
		expect(enviadas("editar")).toHaveLength(2);
		expect(ultimoPedido("editar")).not.toBe(pedido);
		expect(hip?.situacao("h-b").tipo).toBe("salvando");
	});

	it("o envio que lança (a troca de sessão) é tentado uma vez mais; se lança de novo, o alvo mostra o aviso", async () => {
		pedir.mockRejectedValueOnce(new Error("trocando")).mockResolvedValueOnce(undefined);
		await act(async () => {
			hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "aprovar", rotulo: "aprovar" });
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(ESPERA_RETENTATIVA_MS + 10);
		});
		expect(enviadas("decidir")).toHaveLength(2);
		expect(enviadas("decidir")[0]?.pedido).toBe(enviadas("decidir")[1]?.pedido);
		expect(hip?.situacao("h-a").tipo).toBe("salvando");

		pedir.mockRejectedValue(new Error("trocando"));
		await act(async () => {
			hip!.editar({ id: "h-b", rotulo: "rejeitar", status: "rejeitada" });
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(ESPERA_RETENTATIVA_MS + 10);
		});
		expect(hip?.situacao("h-b")).toEqual({ tipo: "erro", mensagem: AVISO_SESSAO_TROCANDO, rotulo: "rejeitar" });
	});

	it("sem resposta no prazo, o alvo diz que o app não confirmou; a resposta que chega depois cura", () => {
		act(() => hip!.decidir({ alvo: "hipotese", id: "h-a", decisao: "aprovar", rotulo: "aprovar" }));
		const pedido = ultimoPedido("decidir");
		act(() => {
			vi.advanceTimersByTime(PRAZO_DA_RESPOSTA_MS - 100);
		});
		expect(hip?.situacao("h-a").tipo).toBe("salvando");
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(hip?.situacao("h-a")).toEqual({ tipo: "erro", mensagem: AVISO_SEM_CONFIRMACAO, rotulo: "aprovar" });
		chega("decidida", { pedido, estado: estadoDeTeste([]) });
		expect(hip?.situacao("h-a")).toEqual({ tipo: "livre" });
	});
});

describe("refletir", () => {
	beforeEach(() => {
		desenhar();
		chega("hipoteses", { estado: estadoDeTeste([], [], { ultimaReflexao: resumoDeTeste() }) });
	});

	it("manda `refletir` com um pedido; fica ocupada até o `refletiu`, que traz o resumo e o estado", () => {
		act(() => hip!.refletir());
		const pedido = ultimoPedido("refletir");
		expect(enviadas("refletir")[0]).toEqual({ pedido });
		expect(hip?.reflexao).toEqual({ ocupada: true });
		chega("refletindo", { pedido });
		expect(hip?.reflexao.ocupada).toBe(true);
		expect(hip?.estado?.refletindo).toBe(true);
		// Sem prazo depois do `refletindo`: a reflexão pode demorar.
		act(() => {
			vi.advanceTimersByTime(PRAZO_DA_RESPOSTA_MS * 3);
		});
		expect(hip?.reflexao).toEqual({ ocupada: true });
		const resumo = resumoDeTeste({ id: "r-2", lidos: 4 });
		chega("refletiu", { pedido, resumo, estado: estadoDeTeste([hipoteseDeTeste({ id: "h-nova" })], [], { ultimaReflexao: resumo }) });
		expect(hip?.reflexao).toEqual({ ocupada: false });
		expect(hip?.estado?.ultimaReflexao?.id).toBe("r-2");
		expect(hip?.estado?.refletindo).toBe(false);
	});

	it("um clique enquanto ocupada não manda outro pedido", () => {
		act(() => hip!.refletir());
		act(() => hip!.refletir());
		expect(enviadas("refletir")).toHaveLength(1);
	});

	it("o erro com o pedido mostra a mensagem; tentar de novo manda outro pedido", () => {
		act(() => hip!.refletir());
		chega("erro", { pedido: ultimoPedido("refletir"), ao: "refletir", mensagem: "O modelo não respondeu." });
		expect(hip?.reflexao).toEqual({ ocupada: false, erro: "O modelo não respondeu." });
		act(() => hip!.refletir());
		expect(enviadas("refletir")).toHaveLength(2);
		expect(hip?.reflexao).toEqual({ ocupada: true });
	});

	it("uma reflexão automática (a extensão manda `hipoteses` com refletindo) ocupa o botão sem pedido da tela", () => {
		chega("hipoteses", { estado: estadoDeTeste([], [], { refletindo: true }) });
		expect(hip?.reflexao.ocupada).toBe(true);
		act(() => hip!.refletir());
		expect(enviadas("refletir")).toHaveLength(0);
		chega("hipoteses", { estado: estadoDeTeste([], [], { ultimaReflexao: resumoDeTeste({ id: "r-3" }) }) });
		expect(hip?.reflexao.ocupada).toBe(false);
	});

	it("sem o primeiro sinal no prazo, diz que o app não confirmou", () => {
		act(() => hip!.refletir());
		act(() => {
			vi.advanceTimersByTime(PRAZO_DA_RESPOSTA_MS + 100);
		});
		expect(hip?.reflexao.erro).toBe(AVISO_SEM_CONFIRMACAO);
		expect(hip?.reflexao.ocupada).toBe(false);
	});
});

describe("o erro de leitura e o Tentar de novo", () => {
	it("o erro de `hipoteses` aparece; 'Tentar de novo' pede de novo e marca tentando até a resposta chegar", () => {
		desenhar();
		chega("erro", { ao: "hipoteses", mensagem: "hipoteses.json ilegível." });
		expect(hip?.erro?.mensagem).toBe("hipoteses.json ilegível.");
		expect(hip?.estado).toBeUndefined();
		pedir.mockClear();
		act(() => hip!.recarregar());
		expect(enviadas("hipoteses")).toHaveLength(1);
		expect(hip?.tentando).toBe(true);
		chega("hipoteses", { estado: estadoDeTeste([]) });
		expect(hip?.tentando).toBe(false);
		expect(hip?.erro).toBeUndefined();
	});

	it("o erro de `historico` é do histórico e não derruba as hipóteses", () => {
		desenhar();
		chega("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-1" })]) });
		chega("erro", { ao: "historico", mensagem: "eventos.jsonl ilegível." });
		expect(hist?.erro?.mensagem).toBe("eventos.jsonl ilegível.");
		expect(hist?.eventos).toBeUndefined();
		expect(hip?.erro).toBeUndefined();
		expect(hip?.estado?.hipoteses).toHaveLength(1);
		chega("historico", { eventos: [eventoDeTeste({ id: "e-1" })] });
		expect(hist?.erro).toBeUndefined();
		expect(hist?.eventos).toHaveLength(1);
	});

	it("se o envio lança duas vezes, aparece o erro de falar com a sessão", async () => {
		pedir.mockRejectedValue(new Error("sem conexão"));
		await act(async () => {
			root.render(createElement(Sonda, { janela: janelaFalsa() }));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(ESPERA_RETENTATIVA_MS + 10);
		});
		expect(hip?.erro?.mensagem).toBe("Não consegui falar com a sessão: sem conexão");
		expect(hist?.erro?.mensagem).toBe("Não consegui falar com a sessão: sem conexão");
	});

	it("`atualizar` pede o histórico de novo sem marcar tentando", () => {
		desenhar();
		pedir.mockClear();
		act(() => hist!.atualizar());
		expect(enviadas("historico")).toHaveLength(1);
		expect(hist?.tentando).toBe(false);
	});
});

describe("as mensagens de mudança chegam com a forma do contrato", () => {
	it("a mudança pendente e o estado que a tela recebe", () => {
		desenhar();
		chega("hipoteses", { estado: estadoDeTeste([hipoteseDeTeste({ id: "h-1", status: "aprovada" })], [mudancaDeTeste({ id: "m-1", hipotese: "h-1", acao: "enfraquecer", evidencias: ["e-1"] })]) });
		expect(hip?.estado?.mudancas[0]).toMatchObject({ id: "m-1", acao: "enfraquecer", evidencias: ["e-1"] });
	});
});
