// As decisões puras do cartão "Plano criado" (plano-criado.ts): qual cartão vai em qual resposta, o estado dele e a
// resposta ao Desfazer.

import type { AcaoRecebida, ItemConversa } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import { cartoesDePlanoDoTurno, contarPlanosCriados, estadoDoCartaoDePlano, lerPlanoCriado, respostaDoDesfazerPlano, textoDoCartaoDePlano } from "./plano-criado.ts";

const MATERIA = "calc";
const usuario = (chave: string): ItemConversa => ({ tipo: "usuario", chave, texto: "monte um plano" });
const resposta = (chave: string): ItemConversa => ({ tipo: "assistente", chave, texto: "Pronto.", raciocinio: "", emAndamento: false });
const ferramenta = (chave: string, id: string): ItemConversa => ({ tipo: "ferramenta", chave, chamada: { id, nome: "criar_plano", argumentos: {}, status: "ok" } });
const criado = (chave: string, chamada: string, titulo = "Prova final"): AcaoRecebida => ({
	chave,
	acao: "plano_criado",
	dados: { materia: MATERIA, titulo, rota: `caderno/${MATERIA}/notas/${titulo}`, chamada, sessao: "s1" },
});
const doPlanos = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });

const CONVERSA: ItemConversa[] = [usuario("u1"), ferramenta("f1", "call-1"), resposta("r1"), usuario("u2"), resposta("r2")];

describe("os cartões do turno", () => {
	it("vão só na resposta do turno que chamou o criar_plano, ligados pela chamada", () => {
		const acoes = [criado("hm1", "call-1")];
		expect(cartoesDePlanoDoTurno(CONVERSA, "r1", acoes, MATERIA).map((c) => c.titulo)).toEqual(["Prova final"]);
		expect(cartoesDePlanoDoTurno(CONVERSA, "r2", acoes, MATERIA)).toEqual([]);
		expect(cartoesDePlanoDoTurno(CONVERSA, "r1", [criado("hm1", "call-99")], MATERIA)).toEqual([]);
	});

	it("só planos desta matéria, e uma chamada gera um cartão", () => {
		const outra: AcaoRecebida = { chave: "hm2", acao: "plano_criado", dados: { materia: "fis", titulo: "X", rota: "r", chamada: "call-1", sessao: "s" } };
		expect(cartoesDePlanoDoTurno(CONVERSA, "r1", [outra, criado("hm1", "call-1"), criado("hm3", "call-1", "Repetido")], MATERIA)).toHaveLength(1);
		expect(contarPlanosCriados([outra, criado("hm1", "call-1")], MATERIA)).toBe(1);
	});

	it("uma ação sem campos não vira cartão", () => {
		expect(lerPlanoCriado({ chave: "x", acao: "plano_criado", dados: { materia: MATERIA } })).toBeUndefined();
		expect(lerPlanoCriado({ chave: "x", acao: "nota_criada", dados: {} })).toBeUndefined();
	});
});

describe("o estado do cartão", () => {
	const cartao = lerPlanoCriado(criado("i10", "call-1"))!;

	it("criado, enquanto nada diz o contrário (uma lista antiga não vale)", () => {
		expect(estadoDoCartaoDePlano(cartao, [])).toEqual({ tipo: "criada" });
		const antiga = doPlanos("i5", "lista", { materia: MATERIA, sessao: "s1", planos: [], seguindo: null });
		expect(estadoDoCartaoDePlano(cartao, [antiga])).toEqual({ tipo: "criada" });
	});

	it("desfeito: a resposta desfeito depois do cartão, ou o desfeito local", () => {
		expect(estadoDoCartaoDePlano(cartao, [doPlanos("i11", "desfeito", { materia: MATERIA, titulo: "prova final", pedido: "p" })])).toEqual({ tipo: "desfeita" });
		expect(estadoDoCartaoDePlano(cartao, [doPlanos("i9", "desfeito", { materia: MATERIA, titulo: "Prova final" })])).toEqual({ tipo: "criada" });
		expect(estadoDoCartaoDePlano(cartao, [], undefined, true)).toEqual({ tipo: "desfeita" });
	});

	it("uma lista sem o plano não muda o cartão (pode ter sido renomeado): quem diz se sumiu é a resposta ao Desfazer", () => {
		const sem = doPlanos("i12", "lista", { materia: MATERIA, sessao: "s1", planos: [], seguindo: null });
		expect(estadoDoCartaoDePlano(cartao, [sem])).toEqual({ tipo: "criada" });
		expect(estadoDoCartaoDePlano(cartao, [sem], "O plano não existe mais (foi apagado). Nada foi apagado.")).toEqual({
			tipo: "recusada",
			mensagem: "O plano não existe mais (foi apagado). Nada foi apagado.",
		});
	});

	it("recusado leva a mensagem; os textos de cada estado", () => {
		const recusado = estadoDoCartaoDePlano(cartao, [], "O plano mudou.");
		expect(recusado).toEqual({ tipo: "recusada", mensagem: "O plano mudou." });
		expect(textoDoCartaoDePlano(cartao, { tipo: "criada" })).toBe("Plano criado: Prova final");
		expect(textoDoCartaoDePlano(cartao, { tipo: "desfeita" })).toBe("Plano desfeito");
		expect(textoDoCartaoDePlano(cartao, { tipo: "inexistente" })).toBe("O plano não existe mais");
		expect(textoDoCartaoDePlano(cartao, recusado)).toBe("O plano mudou.");
	});
});

describe("respostaDoDesfazerPlano", () => {
	it("desfeito ou erro com o mesmo pedido, só entre as ações novas", () => {
		const recebidas = [
			doPlanos("i1", "desfeito", { pedido: "antigo", materia: MATERIA, titulo: "A" }),
			doPlanos("i2", "erro", { pedido: "p1", mensagem: "Mudou." }),
			doPlanos("i3", "desfeito", { pedido: "p2", materia: MATERIA, titulo: "B" }),
		];
		expect(respostaDoDesfazerPlano(recebidas, new Set(["i1"]), "antigo")).toBeUndefined();
		expect(respostaDoDesfazerPlano(recebidas, new Set(), "p1")).toEqual({ ok: false, mensagem: "Mudou." });
		expect(respostaDoDesfazerPlano(recebidas, new Set(), "p2")).toEqual({ ok: true, materia: MATERIA, titulo: "B" });
		expect(respostaDoDesfazerPlano([doPlanos("i4", "erro", { pedido: "p3" })], new Set(), "p3")).toEqual({ ok: false, mensagem: "Não consegui desfazer o plano." });
	});
});
