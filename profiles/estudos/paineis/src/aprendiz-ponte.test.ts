// @vitest-environment happy-dom
// A ponte do aprendiz (aprendiz-ponte.ts): a leitura do que a extensão mandou e o hook useIndicadores com uma
// janela falsa (só valem as respostas que chegaram depois da montagem e depois de cada troca de sessão).

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conceitoDeTeste, indicadoresDeTeste } from "./aprendiz-fixtures.ts";
import { indicadoresDaMensagem, type IndicadoresAbertos, lerAprendiz, PAINEL_APRENDIZ, useIndicadores } from "./aprendiz-ponte.ts";

let contador = 0;
const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++contador}`, acao, dados });
const comConceitos = (...ids: string[]) => ({ indicadores: indicadoresDeTeste(ids.map((conceito) => conceitoDeTeste({ conceito }))) });

describe("indicadoresDaMensagem", () => {
	it("aceita a mensagem da extensão", () => {
		const lidos = indicadoresDaMensagem(comConceitos("a", "b"));
		expect(lidos?.conceitos.map((c) => c.conceito)).toEqual(["a", "b"]);
	});

	it("recusa o que não tem a forma esperada", () => {
		expect(indicadoresDaMensagem(undefined)).toBeUndefined();
		expect(indicadoresDaMensagem({})).toBeUndefined();
		expect(indicadoresDaMensagem({ indicadores: { conceitos: "x" } })).toBeUndefined();
		expect(indicadoresDaMensagem([])).toBeUndefined();
	});

	it("descarta o conceito malformado e completa o que falta, sem quebrar", () => {
		const bruto = { indicadores: { versao: 1, conceitos: [{ conceito: "a", materia: "m", dominio: 0.4, observacoes: 1, sessoes: 1, acertosPonderados: 1, errosPonderados: 0, ultima: "2026-11-01T00:00:00.000Z" }, { conceito: "sem-dominio" }, null] } };
		const lidos = indicadoresDaMensagem(bruto);
		expect(lidos?.conceitos).toHaveLength(1);
		expect(lidos?.conceitos[0]).toMatchObject({ ganho: null, brier: null, confusoes: [], eventos: [] });
		expect(lidos?.ignorados).toEqual({ materiaInexistente: 0, semConceito: 0 });
	});
});

describe("lerAprendiz", () => {
	it("os últimos indicadores valem", () => {
		const lido = lerAprendiz([recebida("indicadores", comConceitos("a")), recebida("indicadores", comConceitos("a", "b"))]);
		expect(lido.indicadores?.conceitos).toHaveLength(2);
		expect(lido.erro).toBeUndefined();
		expect(lido.chaveDaUltima).toBeDefined();
	});

	it("um erro depois dos indicadores vale; indicadores depois do erro o apagam", () => {
		const erro = lerAprendiz([recebida("indicadores", comConceitos("a")), recebida("erro", { mensagem: "O eventos.jsonl não abre." })]);
		expect(erro.erro?.mensagem).toBe("O eventos.jsonl não abre.");
		expect(erro.indicadores).toBeUndefined();
		const depois = lerAprendiz([recebida("erro", { mensagem: "Ruim." }), recebida("indicadores", comConceitos("a"))]);
		expect(depois.erro).toBeUndefined();
		expect(depois.indicadores).toBeDefined();
	});

	it("erro sem mensagem vira 'Erro desconhecido.'; ações de outro nome e dados ruins são ignorados", () => {
		const lido = lerAprendiz([recebida("outra", {}), recebida("indicadores", { indicadores: 1 }), recebida("erro", undefined)]);
		expect(lido.erro?.mensagem).toBe("Erro desconhecido.");
	});

	it("as chaves ignoradas não valem", () => {
		const antiga = recebida("indicadores", comConceitos("velho"));
		const nova = recebida("indicadores", comConceitos("novo"));
		expect(lerAprendiz([antiga, nova], new Set([antiga.chave])).indicadores?.conceitos[0]?.conceito).toBe("novo");
		const so = lerAprendiz([antiga], new Set([antiga.chave]));
		expect(so.indicadores).toBeUndefined();
		expect(so.chaveDaUltima).toBeUndefined();
	});
});

// --- O hook com uma janela falsa ------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let pedir: ReturnType<typeof vi.fn>;
let acoesFalsas: { acaoDaInterface: ReturnType<typeof vi.fn> };
let recebidas: AcaoRecebida[];
let sessao: string | undefined;
let visto: IndicadoresAbertos | undefined;

function Sonda(props: { janela: JanelaPerfilHook }) {
	visto = useIndicadores(props.janela);
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
/** Uma ação nova chega (a lista é nova, como no reducer). */
const chega = (acao: string, dados: unknown) => {
	recebidas = [...recebidas, recebida(acao, dados)];
	desenhar();
};

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	pedir = vi.fn(async () => {});
	acoesFalsas = { acaoDaInterface: pedir };
	recebidas = [];
	sessao = "s1";
	visto = undefined;
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("useIndicadores", () => {
	it("pede `indicadores` ao abrir, e de novo quando a sessão troca; sem sessão, não pede", () => {
		sessao = undefined;
		desenhar();
		expect(pedir).not.toHaveBeenCalled();
		sessao = "s1";
		desenhar();
		expect(pedir).toHaveBeenCalledTimes(1);
		expect(pedir).toHaveBeenLastCalledWith(PAINEL_APRENDIZ, "indicadores", {});
		desenhar();
		expect(pedir).toHaveBeenCalledTimes(1);
		sessao = "s2";
		desenhar();
		expect(pedir).toHaveBeenCalledTimes(2);
	});

	it("sem resposta ainda, não há indicadores nem erro", () => {
		desenhar();
		expect(visto?.indicadores).toBeUndefined();
		expect(visto?.erro).toBeUndefined();
		expect(visto?.tentando).toBe(false);
	});

	it("uma resposta que já estava lá ao montar (de outra visita) não aparece; a nova sim", () => {
		recebidas = [recebida("indicadores", comConceitos("antigo")), recebida("erro", { mensagem: "Erro de antes." })];
		desenhar();
		expect(visto?.indicadores).toBeUndefined();
		expect(visto?.erro).toBeUndefined();
		chega("indicadores", comConceitos("novo"));
		expect(visto?.indicadores?.conceitos.map((c) => c.conceito)).toEqual(["novo"]);
		expect(visto?.erro).toBeUndefined();
	});

	it("depois de uma troca de sessão, o que estava na lista da sessão anterior não vale, mas o que já se via fica até a resposta nova", () => {
		desenhar();
		chega("indicadores", comConceitos("a"));
		expect(visto?.indicadores?.conceitos).toHaveLength(1);
		// Troca: a lista de ações ainda traz a resposta velha (ou outra de uma sessão que respondeu atrasada).
		sessao = "s2";
		chega("indicadores", comConceitos("atrasada-da-sessao-antiga", "b"));
		// A resposta chegou no mesmo render da troca: já pertence à sessão nova? Não: foi marcada como antiga junto com a troca.
		expect(visto?.indicadores?.conceitos.map((c) => c.conceito)).toEqual(["a"]);
		chega("indicadores", comConceitos("da-sessao-nova"));
		expect(visto?.indicadores?.conceitos.map((c) => c.conceito)).toEqual(["da-sessao-nova"]);
	});

	it("um erro da extensão aparece e tira os indicadores; 'Tentar de novo' pede de novo e marca tentando até a resposta chegar", () => {
		desenhar();
		chega("indicadores", comConceitos("a"));
		chega("erro", { mensagem: "Ilegível." });
		expect(visto?.erro?.mensagem).toBe("Ilegível.");
		expect(visto?.indicadores).toBeUndefined();
		pedir.mockClear();
		act(() => visto!.recarregar());
		expect(pedir).toHaveBeenCalledTimes(1);
		expect(visto?.tentando).toBe(true);
		expect(visto?.erro?.mensagem).toBe("Ilegível.");
		chega("indicadores", comConceitos("a", "b"));
		expect(visto?.tentando).toBe(false);
		expect(visto?.erro).toBeUndefined();
		expect(visto?.indicadores?.conceitos).toHaveLength(2);
	});

	it("outro erro depois do 'Tentar de novo' também encerra o tentando", () => {
		desenhar();
		chega("erro", { mensagem: "Ilegível." });
		act(() => visto!.recarregar());
		expect(visto?.tentando).toBe(true);
		chega("erro", { mensagem: "Ainda ilegível." });
		expect(visto?.tentando).toBe(false);
		expect(visto?.erro?.mensagem).toBe("Ainda ilegível.");
	});

	it("se a ação não consegue sair, aparece o erro de falar com a sessão", async () => {
		pedir.mockRejectedValueOnce(new Error("sem conexão"));
		await act(async () => {
			root.render(createElement(Sonda, { janela: janelaFalsa() }));
		});
		expect(visto?.erro?.mensagem).toBe("Não consegui falar com a sessão: sem conexão");
		expect(visto?.tentando).toBe(false);
	});
});
