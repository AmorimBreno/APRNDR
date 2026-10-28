// As partes puras da geração de módulos na visão do curso: o card de cada
// módulo pelo estado que a extensão mandou (modulos-tela.ts), os textos das
// etapas, o primário do formulário e os nomes dos materiais mandados por
// ele; e a leitura da ponte "modulos" (modulos-ponte.ts): o último estado,
// os erros e a espera pelo pedido.

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { Evento } from "../../lib/eventos.ts";
import type { EstadoModuloNaTela, MensagemEstadoModulos } from "../../lib/modulo-tipos.ts";
import { ErroDosModulos, EsperaDosModulos, lerModulos, respostaModulos } from "./modulos-ponte.ts";
import {
	acaoDoCard,
	camposDoPedido,
	cardsDosModulos,
	classesDoCard,
	estiloDoCard,
	listarNomes,
	nomesMandados,
	primarioDoFormulario,
	progressoDaEtapa,
	proximoDaTela,
	resumoDoGerado,
	textoDaEtapa,
	textoDasFeitas,
	tituloDoFormulario,
} from "./modulos-tela.ts";
import { descreverEvento } from "./TelaCaderno.tsx";

const ORDEM = ["m1", "m2", "m3", "m4"];
const estado = (...modulos: EstadoModuloNaTela[]) => ({ modulos });
const m = (id: string, situacao: EstadoModuloNaTela["situacao"], extra: Partial<EstadoModuloNaTela> = {}): EstadoModuloNaTela => ({ id, situacao, ...extra });

describe("cardsDosModulos", () => {
	const GERADO_EM = "2026-10-26T12:00:00.000Z";

	it("sem estado: todos carregando, pretos e sem etiqueta; nada bloqueado", () => {
		const cards = cardsDosModulos(ORDEM, undefined);
		for (const id of ORDEM) expect(cards[id]).toEqual({ tipo: "carregando", state: "next", cor: "preto", recomendado: false });
	});

	it("nada gerado: todos pretos com Gerar módulo; só o primeiro é o recomendado", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "a_gerar"), m("m2", "a_gerar"), m("m3", "a_gerar"), m("m4", "a_gerar")));
		expect(cards.m1).toMatchObject({ tipo: "gerar", state: "next", cor: "preto", recomendado: true });
		for (const id of ["m2", "m3", "m4"]) expect(cards[id]).toMatchObject({ tipo: "gerar", state: "next", cor: "preto", recomendado: false });
	});

	it("o curso do Breno: m1 gerado e não concluído é musgo e recomendado; os outros, pretos com Gerar módulo e sem etiqueta", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "gerado", { licoesGeradas: 3, questoes: 8, concluido: false }), m("m2", "a_gerar"), m("m3", "a_gerar"), m("m4", "a_gerar")));
		expect(cards.m1).toMatchObject({ tipo: "gerado", state: "next", cor: "musgo", recomendado: true });
		expect(cards.m1!.modulo?.licoesGeradas).toBe(3);
		for (const id of ["m2", "m3", "m4"]) expect(cards[id]).toMatchObject({ tipo: "gerar", cor: "preto", recomendado: false });
	});

	it("concluído: done (holográfico, Rever), nunca recomendado; a recomendação passa para o seguinte, gerado ou não", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "gerado", { concluido: true }), m("m2", "gerado"), m("m3", "a_gerar")));
		expect(cards.m1).toMatchObject({ tipo: "concluido", state: "done", cor: "holografico", recomendado: false });
		expect(cards.m2).toMatchObject({ tipo: "gerado", cor: "musgo", recomendado: true });
		expect(cards.m3).toMatchObject({ tipo: "gerar", cor: "preto", recomendado: false });
		const depois = cardsDosModulos(ORDEM, estado(m("m1", "gerado", { concluido: true }), m("m2", "a_gerar"), m("m3", "gerado")));
		expect(depois.m2).toMatchObject({ tipo: "gerar", recomendado: true });
		expect(depois.m3).toMatchObject({ tipo: "gerado", cor: "musgo", recomendado: false });
	});

	it("aguardando material: preto, com a nota, e não é recomendado", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "aguardando_material", { nota: "Quinta" }), m("m2", "a_gerar")));
		expect(cards.m1).toMatchObject({ tipo: "aguardando", state: "next", cor: "preto", recomendado: false });
		expect(cards.m1!.modulo?.nota).toBe("Quinta");
		expect(cards.m2).toMatchObject({ recomendado: true });
	});

	it("durante a geração: preto enchendo de musgo pelo progresso, de qualquer módulo", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "gerado"), m("m3", "escrevendo", { licao: 2, licoes: 4 })));
		expect(cards.m3).toMatchObject({ tipo: "gerando", state: "next", cor: "preto", recomendado: false });
		expect(cards.m3!.enchimento).toBeCloseTo(0.1 + 0.9 * (1 / 4));
		const planejando = cardsDosModulos(ORDEM, estado(m("m1", "planejando", { geradoEm: GERADO_EM })));
		expect(planejando.m1).toMatchObject({ tipo: "gerando", cor: "preto", enchimento: 0.1, recomendado: true });
	});

	it("erro: musgo se há a versão gravada, senão preto; Tentar de novo", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "erro", { mensagem: "O modelo não respondeu.", geradoEm: GERADO_EM }), m("m2", "erro", { mensagem: "Falhou." })));
		expect(cards.m1).toMatchObject({ tipo: "erro", cor: "musgo", recomendado: true });
		expect(cards.m1!.modulo?.mensagem).toBe("O modelo não respondeu.");
		expect(cards.m2).toMatchObject({ tipo: "erro", cor: "preto", recomendado: false });
	});

	it("o recomendado da extensão (proximo) vale sobre o da tela; null, nenhum", () => {
		const atual = { modulos: [m("m1", "planejando"), m("m2", "a_gerar")], proximo: "m2" };
		expect(proximoDaTela(ORDEM, atual)).toBe("m1");
		expect(cardsDosModulos(ORDEM, atual).m2).toMatchObject({ recomendado: true });
		expect(cardsDosModulos(ORDEM, atual).m1).toMatchObject({ recomendado: false });
		const nenhum = cardsDosModulos(ORDEM, { modulos: [m("m1", "a_gerar")], proximo: null });
		expect(Object.values(nenhum).some((card) => card.recomendado)).toBe(false);
	});

	it("módulo que não veio no estado conta como não gerado", () => {
		const cards = cardsDosModulos(ORDEM, estado(m("m1", "gerado", { concluido: true })));
		expect(cards.m2).toMatchObject({ tipo: "gerar", cor: "preto", recomendado: true });
		expect(cards.m3).toMatchObject({ tipo: "gerar", cor: "preto", recomendado: false });
	});

	it("todos concluídos ou aguardando: nenhum recomendado", () => {
		expect(proximoDaTela(["m1", "m2"], estado(m("m1", "gerado", { concluido: true }), m("m2", "aguardando_material")))).toBeNull();
		expect(proximoDaTela(["m1", "m2"], estado(m("m1", "gerado"), m("m2", "aguardando_material")))).toBe("m1");
	});

	it("as classes do perfil e o enchimento", () => {
		expect(classesDoCard({ state: "next", cor: "musgo", recomendado: true })).toBe("mod__card");
		expect(classesDoCard({ state: "next", cor: "musgo", recomendado: false })).toBe("mod__card mod__card--sem-proximo");
		expect(classesDoCard({ state: "next", cor: "preto", recomendado: false })).toBe("mod__card mod__card--preto mod__card--sem-proximo");
		expect(classesDoCard({ state: "next", cor: "preto", recomendado: true, enchimento: 0.4 })).toBe("mod__card mod__card--preto mod__card--enchendo");
		expect(classesDoCard({ state: "done", cor: "holografico", recomendado: false })).toBe("mod__card");
		expect(estiloDoCard({})).toBeUndefined();
		expect(estiloDoCard({ enchimento: 0.325 })).toEqual({ "--mod-enchimento": "0.325" });
		expect(estiloDoCard({ enchimento: 2 })).toEqual({ "--mod-enchimento": "1" });
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

	it("o progresso anda com a etapa (5 %, 10 %, 10 + 90 × (i − 1) / n %) e fica entre 0 e 1", () => {
		const esperando = progressoDaEtapa(m("m1", "esperando_materiais"))!;
		const planejando = progressoDaEtapa(m("m1", "planejando"))!;
		const licao1 = progressoDaEtapa(m("m1", "escrevendo", { licao: 1, licoes: 4 }))!;
		const licao4 = progressoDaEtapa(m("m1", "escrevendo", { licao: 4, licoes: 4 }))!;
		expect(esperando).toBe(0.05);
		expect(planejando).toBe(0.1);
		expect(licao1).toBeCloseTo(0.1);
		expect(licao4).toBeCloseTo(0.1 + 0.9 * 0.75);
		expect(licao4).toBeLessThan(1);
		expect(progressoDaEtapa(m("m1", "escrevendo", { licao: 9, licoes: 4 }))).toBeLessThanOrEqual(1);
		expect(progressoDaEtapa(m("m1", "gerado"))).toBeUndefined();
	});

	it("o resumo do gerado, no singular e no plural", () => {
		expect(resumoDoGerado({ licoesGeradas: 3, questoes: 8 })).toBe("3 lições · 8 questões");
		expect(resumoDoGerado({ licoesGeradas: 1, questoes: 1 })).toBe("1 lição · 1 questão");
		expect(resumoDoGerado({})).toBe("");
	});

	it("as questões feitas do gerado, no singular e no plural", () => {
		expect(textoDasFeitas({ feitas: 3, questoes: 12 })).toBe("3 de 12 questões feitas");
		expect(textoDasFeitas({ feitas: 0, questoes: 1 })).toBe("0 de 1 questão feita");
		expect(textoDasFeitas({ feitas: 0, questoes: 0 })).toBe("");
		expect(textoDasFeitas(undefined)).toBe("");
	});

	it("a ação de cada card", () => {
		expect(acaoDoCard("gerar")).toBe("Gerar módulo");
		expect(acaoDoCard("aguardando")).toBe("Gerar agora");
		expect(acaoDoCard("erro")).toBe("Tentar de novo");
		expect(acaoDoCard("gerado")).toBe("Abrir");
		expect(acaoDoCard("concluido")).toBe("Rever");
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

describe("a linha do tempo do caderno", () => {
	it("concluiu_modulo: o módulo, o curso, as lições e as questões", () => {
		const evento = (resultado: Record<string, unknown>) =>
			({ id: "e", ts: "2026-10-27T13:00:00.000Z", verbo: "concluiu_modulo", objeto: { materia: "x", curso: "p1-busca", modulo: "m1" }, resultado }) as unknown as Evento;
		expect(descreverEvento(evento({ licoes: 3, questoes: 8 }))).toEqual({ icone: "check", texto: "Módulo concluído: m1 de p1-busca", detalhe: "3 lições · 8 questões" });
		expect(descreverEvento(evento({ licoes: 1, questoes: 1 })).detalhe).toBe("1 lição · 1 questão");
		expect(descreverEvento(evento({})).detalhe).toBeUndefined();
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
