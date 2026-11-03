// Seleção, posição dos cartões e leitura da ponte, sem dados reais nem rede.
import type { AcaoRecebida } from "@estudos/ui";
import { QuizQuestion } from "@estudos/design-system";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExplicacaoPedida, LugarNaTela } from "../../lib/termos-tipos.ts";
import { errosDosTermos, lerModuloAberto, lerModulos } from "./modulos-ponte.ts";
import { type AcoesTermos, ExplicacoesDoBloco, ProvedorTermos } from "./TermosModulo.tsx";
import { noProprioBloco, posicionarFlutuante, rotuloDoLugar, trechoDaSelecao } from "./termos-tela.ts";
import type { ModuloGerado } from "../../lib/modulo-tipos.ts";

const lugar: LugarNaTela = {
	modulo: "m1",
	licao: "l1",
	bloco: "b1",
	numeroModulo: 1,
	tituloModulo: "Texto",
	numeroLicao: 1,
	tituloLicao: "Palavras",
};
const pedido: ExplicacaoPedida = {
	id: "x-1",
	licao: "l1",
	bloco: "b1",
	versao: 1,
	trecho: "radicais",
	tipo: "nao_sei",
	em: "2026-10-29T17:00:00Z",
};
const modulo = { id: "m1", situacao: "gerado", geradoEm: "geracao-1", licoes: [], explicacoes: [pedido] } as unknown as ModuloGerado;
const alvo = { materia: "m", curso: "c", modulo: "m1" };
const recebida = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });
const mensagem = (campos = {}) => ({ materia: "m", curso: "c", modulo, explicando: [pedido.id], glossario: [], corrigindo: [], ...campos });

describe("seleção e lugar", () => {
	it("aceita só um bloco e de 1 a 300 caracteres normalizados", () => {
		expect(trechoDaSelecao("  um\n termo  ", "b1", "b1")).toBe("um termo");
		expect(trechoDaSelecao("x".repeat(300), "b1", "b1")).toHaveLength(300);
		for (const texto of ["", "   ", "x".repeat(301)]) expect(trechoDaSelecao(texto, "b1", "b1")).toBeUndefined();
		expect(trechoDaSelecao("termo", "b1", "b2")).toBeUndefined();
		expect(trechoDaSelecao("termo", undefined, undefined)).toBeUndefined();
	});
	it("o rótulo e o clique no próprio bloco (uma explicação pedida ainda deve abrir)", () => {
		expect(rotuloDoLugar(lugar)).toBe("Módulo 01 · Lição 1");
		expect(rotuloDoLugar(null)).toBe("Não explicado no curso");
		expect(noProprioBloco(lugar, "m1", "l1", "b1")).toBe(true);
		expect(noProprioBloco(lugar, "m2", "l1", "b1")).toBe(false);
		expect(noProprioBloco({ ...lugar, explicacao: "x-1" }, "m1", "l1", "b1")).toBe(false);
	});
});

describe("cartão dentro da tela", () => {
	it("vira para baixo junto do topo e limita a largura em 375 px", () => {
		const pos = posicionarFlutuante({ left: 300, right: 370, top: 5, bottom: 25 }, 380, 180, { largura: 375, altura: 700 });
		expect(pos.abaixo).toBe(true);
		expect(pos.left).toBeGreaterThanOrEqual(12);
		expect(pos.left + pos.largura).toBeLessThanOrEqual(363);
		expect(pos.top).toBeGreaterThanOrEqual(25);
	});
	it("prefere acima quando cabe e não passa das margens", () => {
		const pos = posicionarFlutuante({ left: 0, right: 30, top: 400, bottom: 420 }, 320, 100, { largura: 1000, altura: 700 });
		expect(pos.abaixo).toBe(false);
		expect(pos.top).toBe(292);
		expect(pos.left).toBe(12);
		expect(pos.seta).toBeGreaterThanOrEqual(16);
	});
});

describe("ponte dos termos", () => {
	it("guarda glossário e explicando sem exigir campos em sessões antigas", () => {
		expect(lerModuloAberto([recebida("1", "modulo", mensagem())], "m", "c", "m1").explicando).toEqual(["x-1"]);
		expect(lerModuloAberto([recebida("1", "modulo", { materia: "m", curso: "c", modulo })], "m", "c", "m1").glossario).toEqual([]);
	});
	it("preserva o pedido que falhou quando o servidor o remove", () => {
		const mensagens = [
			recebida("1", "modulo", mensagem()),
			recebida("2", "erro", { ...alvo, ao: "explicar_trecho", explicacao: "x-1", mensagem: "Rede indisponível" }),
			recebida("3", "modulo", mensagem({ modulo: { ...modulo, explicacoes: [] }, explicando: [] })),
		];
		expect(lerModuloAberto(mensagens, "m", "c", "m1").explicacoesFalhas).toEqual([pedido]);
		expect(errosDosTermos(mensagens, alvo)["x-1"]).toBe("Rede indisponível");
		mensagens.push(recebida("4", "modulo", mensagem({ modulo: { ...modulo, geradoEm: "geracao-2", explicacoes: [] }, explicando: [] })));
		expect(lerModuloAberto(mensagens, "m", "c", "m1").explicacoesFalhas).toEqual([]);
	});
	it("não mistura módulos, cursos nem erros dos cards; uma nova marcação limpa o erro", () => {
		const mensagens = [
			recebida("1", "erro", { ...alvo, ao: "marcar_termos", mensagem: "Falhou" }),
			recebida("2", "erro", { ...alvo, modulo: "m2", ao: "guardar_termo", explicacao: "x-1", mensagem: "Outro módulo" }),
		];
		expect(errosDosTermos(mensagens, alvo)).toEqual({ marcar_termos: "Falhou" });
		expect(lerModulos(mensagens, "m", "c").errosModulo).toEqual({});
		mensagens.push(recebida("3", "estado", { materia: "m", curso: "c", modulos: [{ id: "m1", marcando: { licao: 1, licoes: 2 } }] }));
		expect(errosDosTermos(mensagens, alvo)).toEqual({});
	});
	it("guardar de novo limpa o erro de guardar só depois de dar certo", () => {
		const mensagens = [
			recebida("1", "erro", { ...alvo, ao: "guardar_termo", explicacao: "x-1", mensagem: "Não salvou" }),
			recebida(
				"2",
				"modulo",
				mensagem({ modulo: { ...modulo, explicacoes: [{ ...pedido, explicacao: "Resposta", guardado: "t-radical" }] }, explicando: [] }),
			),
		];
		expect(errosDosTermos(mensagens, alvo)).toEqual({});
	});
});

it("alternativas com conteúdo interativo não aninham botões", () => {
	const html = renderToString(
		createElement(QuizQuestion, {
			interactiveLabels: true,
			prompt: "Qual termo?",
			options: [{ id: "a", label: createElement("button", { type: "button", className: "termo-chave" }, "radical") }],
		}),
	);
	expect(html).toContain('role="radio"');
	expect(html).toMatch(/<\/button><span[^>]+class="ap-opt__label body"><button/);
	expect(html).toContain("aria-labelledby=");
});

it("desenha a explicação, o termo guardado e os pedidos antigos recolhidos", () => {
	const respondido = {
		...pedido,
		explicacao: "Uma **forma reduzida**.",
		termo: { termo: "radical", definicao: "Forma reduzida." },
		guardado: "t-radical",
	};
	const acoes: AcoesTermos = {
		modulo: "m1",
		glossario: [],
		explicando: [],
		falhas: [],
		erros: {},
		marcar: async () => {},
		explicar: async () => {},
		guardar: async () => {},
		ir: () => {},
	};
	const html = renderToString(
		createElement(ProvedorTermos, {
			acoes,
			children: createElement(ExplicacoesDoBloco, {
				modulo: { ...modulo, explicacoes: [pedido, { ...respondido, id: "x-2" }] },
				bloco: "b1",
			}),
		}),
	);
	expect(html.replace(/<!-- -->/g, "")).toContain("1 explicação pedida");
	expect(html).toContain("<strong>forma reduzida</strong>");
	expect(html).toContain("Guardado no glossário");
	expect(html).toContain("A explicação não terminou");
});
