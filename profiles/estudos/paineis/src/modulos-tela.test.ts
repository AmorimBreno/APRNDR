// As partes puras da geração de módulos na visão do curso: o card de cada
// módulo pelo estado que a extensão mandou (modulos-tela.ts), os textos das
// etapas, o primário do formulário e os nomes dos materiais mandados por
// ele; e a leitura da ponte "modulos" (modulos-ponte.ts): o último estado,
// os erros e a espera pelo pedido.

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { EstadoModuloNaTela, MensagemEstadoModulos } from "../../lib/modulo-tipos.ts";
import { ErroDosModulos, EsperaDosModulos, lerModulos, respostaModulos } from "./modulos-ponte.ts";
import {
	acaoDoCard,
	camposDoPedido,
	cardsDosModulos,
	listarNomes,
	nomesMandados,
	primarioDoFormulario,
	progressoDaEtapa,
	proximoDaTela,
	resumoDoGerado,
	textoDaEtapa,
	tituloDoFormulario,
} from "./modulos-tela.ts";

const ORDEM = ["m1", "m2", "m3", "m4"];
const estado = (...modulos: EstadoModuloNaTela[]) => ({ modulos });
const m = (id: string, situacao: EstadoModuloNaTela["situacao"], extra: Partial<EstadoModuloNaTela> = {}): EstadoModuloNaTela => ({ id, situacao, ...extra });

describe("cardsDosModulos", () => {
	it("sem estado: o primeiro carregando como próximo, os outros bloqueados", () => {
		const cards = cardsDosModulos(ORDEM, undefined);
		expect(cards.m1).toEqual({ tipo: "carregando", state: "next" });
		expect(cards.m2).toEqual({ tipo: "bloqueado", state: "locked" });
		expect(cards.m4).toEqual({ tipo: "bloqueado", state: "locked" });
	});

	it("nada gerado: o primeiro é o próximo (Gerar módulo) e os seguintes ficam bloqueados", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "a_gerar"), m("m2", "a_gerar"), m("m3", "a_gerar"), m("m4", "a_gerar")));
		expect(cards.m1).toMatchObject({ tipo: "gerar", state: "next" });
		expect(cards.m2).toMatchObject({ tipo: "bloqueado", state: "locked" });
		expect(cards.m3).toMatchObject({ tipo: "bloqueado", state: "locked" });
	});

	it("gerado e aguardando ficam liberados; o próximo é o primeiro sem arquivo", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "gerado", { licoesGeradas: 3, questoes: 8 }), m("m2", "aguardando_material", { nota: "Quinta" }), m("m3", "a_gerar"), m("m4", "a_gerar")));
		expect(cards.m1).toMatchObject({ tipo: "gerado", state: "next" });
		expect(cards.m1!.modulo?.licoesGeradas).toBe(3);
		expect(cards.m2).toMatchObject({ tipo: "aguardando", state: "next" });
		expect(cards.m3).toMatchObject({ tipo: "gerar", state: "next" });
		expect(cards.m4).toMatchObject({ tipo: "bloqueado", state: "locked" });
	});

	it("durante a geração o card fica em curso, e os seguintes continuam bloqueados", () => {
		for (const situacao of ["esperando_materiais", "planejando", "escrevendo"] as const) {
			const cards = cardsDosModulos(ORDEM, estado(m("m1", "gerado"), m("m2", situacao), m("m3", "a_gerar")));
			expect(cards.m2).toMatchObject({ tipo: "gerando", state: "current" });
			expect(cards.m3).toMatchObject({ tipo: "bloqueado", state: "locked" });
		}
	});

	it("erro: liberado, com a mensagem; os seguintes continuam bloqueados", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "erro", { mensagem: "O modelo não respondeu." }), m("m2", "a_gerar")));
		expect(cards.m1).toMatchObject({ tipo: "erro", state: "next" });
		expect(cards.m1!.modulo?.mensagem).toBe("O modelo não respondeu.");
		expect(cards.m2).toMatchObject({ tipo: "bloqueado", state: "locked" });
	});

	it("gerar de novo um módulo gerado (com geradoEm) não bloqueia o próximo", () => {
		const atual = estado(m("m1", "planejando", { geradoEm: "2026-10-26T12:00:00.000Z" }), m("m2", "a_gerar"));
		expect(proximoDaTela(ORDEM, atual)).toBe("m2");
		const cards = cardsDosModulos(ORDEM, atual);
		expect(cards.m1).toMatchObject({ tipo: "gerando", state: "current" });
		expect(cards.m2).toMatchObject({ tipo: "gerar", state: "next" });
	});

	it("módulo que não veio no estado conta como sem arquivo", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "gerado")));
		expect(cards.m2).toMatchObject({ tipo: "gerar", state: "next" });
		expect(cards.m3).toMatchObject({ tipo: "bloqueado", state: "locked" });
	});

	it("todos com arquivo: nenhum próximo", () => {
		expect(proximoDaTela(["m1", "m2"], estado(m("m1", "gerado"), m("m2", "aguardando_material")))).toBeNull();
	});
});

describe("textos dos cards", () => {
	it("a etapa de cada estado da geração", () => {
		expect(textoDaEtapa(m("m1", "esperando_materiais", { esperando: ["aula-05.pdf"] }))).toBe("Esperando o processamento de aula-05.pdf");
		expect(textoDaEtapa(m("m1", "esperando_materiais", { esperando: ["materias/x/materiais/a.pdf", "b.pdf", "c.py"] }))).toBe(
			"Esperando o processamento de a.pdf, b.pdf e c.py",
		);
		expect(textoDaEtapa(m("m1", "esperando_materiais"))).toBe("Esperando o processamento dos materiais");
		expect(textoDaEtapa(m("m1", "planejando"))).toBe("Planejando as lições…");
		expect(textoDaEtapa(m("m1", "escrevendo", { licao: 2, licoes: 4 }))).toBe("Escrevendo a lição 2 de 4");
		expect(textoDaEtapa(m("m1", "escrevendo"))).toBe("Escrevendo as lições…");
		expect(textoDaEtapa(m("m1", "gerado"))).toBeUndefined();
	});

	it("o progresso anda com a etapa e fica entre 0 e 1", () => {
		const esperando = progressoDaEtapa(m("m1", "esperando_materiais"))!;
		const planejando = progressoDaEtapa(m("m1", "planejando"))!;
		const licao1 = progressoDaEtapa(m("m1", "escrevendo", { licao: 1, licoes: 4 }))!;
		const licao4 = progressoDaEtapa(m("m1", "escrevendo", { licao: 4, licoes: 4 }))!;
		expect(esperando).toBeLessThan(planejando);
		expect(planejando).toBeLessThanOrEqual(licao1);
		expect(licao1).toBeLessThan(licao4);
		expect(licao4).toBeLessThan(1);
		expect(progressoDaEtapa(m("m1", "escrevendo", { licao: 9, licoes: 4 }))).toBeLessThanOrEqual(1);
		expect(progressoDaEtapa(m("m1", "gerado"))).toBeUndefined();
	});

	it("o resumo do gerado, no singular e no plural", () => {
		expect(resumoDoGerado({ licoesGeradas: 3, questoes: 8 })).toBe("3 lições · 8 questões");
		expect(resumoDoGerado({ licoesGeradas: 1, questoes: 1 })).toBe("1 lição · 1 questão");
		expect(resumoDoGerado({})).toBe("");
	});

	it("a ação de cada card", () => {
		expect(acaoDoCard("gerar")).toBe("Gerar módulo");
		expect(acaoDoCard("aguardando")).toBe("Gerar agora");
		expect(acaoDoCard("erro")).toBe("Tentar de novo");
		expect(acaoDoCard("gerado")).toBe("Abrir");
		expect(acaoDoCard("bloqueado")).toBeUndefined();
	});

	it("listarNomes junta com vírgula e \"e\"", () => {
		expect(listarNomes([])).toBe("");
		expect(listarNomes(["a"])).toBe("a");
		expect(listarNomes(["a", "b"])).toBe("a e b");
	});
});

describe("o formulário", () => {
	it("o título e o primário", () => {
		expect(tituloDoFormulario(3, "Derivadas")).toBe("Gerar o módulo 03 · Derivadas");
		expect(tituloDoFormulario(12, "TF-IDF")).toBe("Gerar o módulo 12 · TF-IDF");
		expect(primarioDoFormulario(false)).toBe("Gerar módulo");
		expect(primarioDoFormulario(true)).toBe("Marcar como aguardando material");
	});

	it("os nomes mandados: o caminho dentro de materiais/, sem repetir, na ordem", () => {
		const pasta = "materias/ciencia-de-dados/materiais";
		const primeiro = nomesMandados([], [`${pasta}/aula-05.pdf`, `${pasta}/lista (2).pdf`], pasta);
		expect(primeiro).toEqual(["aula-05.pdf", "lista (2).pdf"]);
		const segundo = nomesMandados(primeiro, [`${pasta}/aula-05.pdf`, `${pasta}/sub/notas.md`], `${pasta}/`);
		expect(segundo).toEqual(["aula-05.pdf", "lista (2).pdf", "sub/notas.md"]);
		expect(primeiro).toEqual(["aula-05.pdf", "lista (2).pdf"]);
		expect(nomesMandados([], [], pasta)).toEqual([]);
	});

	it("os campos do pedido: aparados, e os vazios ficam de fora", () => {
		expect(camposDoPedido({ informacoes: "  só TF-IDF ", observacoes: "   ", materiaisNovos: [] })).toEqual({ informacoes: "só TF-IDF" });
		expect(camposDoPedido({ informacoes: "", observacoes: "mais código", materiaisNovos: ["aula-05.pdf"] })).toEqual({
			observacoes: "mais código",
			materiaisNovos: ["aula-05.pdf"],
		});
		expect(camposDoPedido({ informacoes: "", observacoes: "", materiaisNovos: [] })).toEqual({});
	});
});

// --- A ponte -------------------------------------------------------------------

let contador = 0;
const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++contador}`, acao, dados });
const mensagem = (modulos: EstadoModuloNaTela[], extra: Partial<MensagemEstadoModulos> = {}): MensagemEstadoModulos => ({
	materia: "ciencia-de-dados",
	curso: "c1",
	modulos,
	...extra,
});

describe("lerModulos", () => {
	it("fica com o último estado do curso e ignora os de outros cursos", () => {
		const lido = lerModulos(
			[
				recebida("estado", mensagem([m("m1", "a_gerar")])),
				recebida("estado", mensagem([m("m1", "planejando")])),
				recebida("estado", mensagem([m("m1", "gerado")], { curso: "outro" })),
			],
			"ciencia-de-dados",
			"c1",
		);
		expect(lido.estado?.modulos[0]?.situacao).toBe("planejando");
	});

	it("o erro de listar some com um estado novo; o de parar fica até o módulo parar", () => {
		const lido = lerModulos(
			[
				recebida("erro", { mensagem: "Sem curso.", ao: "listar", materia: "ciencia-de-dados", curso: "c1" }),
				recebida("estado", mensagem([m("m1", "planejando")])),
				recebida("erro", { mensagem: "Não deu para parar.", ao: "cancelar", materia: "ciencia-de-dados", curso: "c1", modulo: "m1" }),
				recebida("estado", mensagem([m("m1", "escrevendo", { licao: 1, licoes: 2 })])),
			],
			"ciencia-de-dados",
			"c1",
		);
		expect(lido.erroLista).toBeUndefined();
		expect(lido.errosModulo.m1?.mensagem).toBe("Não deu para parar.");
		const depois = lerModulos(
			[
				recebida("erro", { mensagem: "Não deu para parar.", ao: "cancelar", modulo: "m1" }),
				recebida("estado", mensagem([m("m1", "a_gerar")])),
			],
			"ciencia-de-dados",
			"c1",
		);
		expect(depois.errosModulo.m1).toBeUndefined();
	});

	it("um erro com pedido é do formulário, não da tela", () => {
		const lido = lerModulos([recebida("erro", { mensagem: "Só o próximo módulo pode ser gerado.", ao: "gerar", modulo: "m3", pedido: "p1" })], "ciencia-de-dados", "c1");
		expect(lido.errosModulo).toEqual({});
		expect(lido.erroLista).toBeUndefined();
	});
});

describe("a espera pelo pedido", () => {
	it("resolve com o estado do pedido e rejeita com o erro do pedido", async () => {
		const espera = new EsperaDosModulos();
		const gerar = espera.esperar("p1");
		const aguardar = espera.esperar("p2");
		espera.receber([recebida("estado", mensagem([m("m1", "planejando")])), recebida("estado", mensagem([m("m1", "planejando")], { pedido: "p1" }))]);
		await expect(gerar).resolves.toMatchObject({ pedido: "p1" });
		expect(espera.quantos).toBe(1);
		espera.receber([recebida("erro", { mensagem: "Só o próximo módulo pode ser gerado.", pedido: "p2" })]);
		await expect(aguardar).rejects.toThrow(ErroDosModulos);
		expect(espera.quantos).toBe(0);
	});

	it("uma resposta que já tinha chegado resolve na hora; trocar de sessão rejeita o resto", async () => {
		const espera = new EsperaDosModulos();
		espera.receber([recebida("estado", mensagem([], { pedido: "p1" }))]);
		await expect(espera.esperar("p1")).resolves.toMatchObject({ pedido: "p1" });
		const pendente = espera.esperar("p9");
		espera.cancelar("A conversa mudou.");
		await expect(pendente).rejects.toThrow("A conversa mudou.");
	});

	it("respostaModulos acha a primeira resposta com o pedido", () => {
		expect(respostaModulos([recebida("estado", mensagem([]))], "p1")).toBeUndefined();
		expect(respostaModulos([recebida("erro", { mensagem: "x", pedido: "p1" })], "p1")?.tipo).toBe("erro");
	});
});
