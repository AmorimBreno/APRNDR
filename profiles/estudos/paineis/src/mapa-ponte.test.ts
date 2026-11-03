// @vitest-environment happy-dom
// As partes puras da seção Mapa de conteúdo (mapa-ponte.ts): a situação, o
// resumo, as referências agrupadas por arquivo, a mudança otimista com lotes
// que chegam e que falham, o depoisDe depois de um arrasto e os textos dos
// avisos; e as linhas da linha do tempo dos eventos do mapa (descreverEvento).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { Evento } from "../../lib/eventos.ts";
import { aplicarOperacoes, type Conceito, type EstadoMapa, type MapaConteudo, mapaVazio } from "../../lib/mapa-tipos.ts";
import {
	abreviarLocal,
	agruparReferencias,
	custoDoMapa,
	type LoteMapa,
	lerMapa,
	mostrarMapa,
	moverDepoisDoArrasto,
	moverUmLugar,
	resumoMapa,
	rotuloSituacao,
	semResposta,
	textoAndamento,
	textoPendentes,
} from "./mapa-ponte.ts";
import { formatarDolar } from "./ModalMateriais.tsx";
import { descreverEvento } from "./LinhaDoTempo.tsx";

function conceito(id: string, extra: Partial<Conceito> = {}): Conceito {
	return {
		id,
		nome: `Conceito ${id}`,
		descricao: "",
		referencias: [{ arquivo: "aula-01.pdf", local: "página 1", trecho: "pagina-001" }],
		prioridade: "normal",
		origem: "material",
		criadoEm: "2026-10-21T13:00:00.000Z",
		...extra,
	};
}

function mapaCom(conceitos: Conceito[], extra: Partial<MapaConteudo> = {}): MapaConteudo {
	return { ...mapaVazio(), conceitos, ...extra };
}

const estadoDe = (mapa: MapaConteudo, pedido?: string): EstadoMapa => ({ materia: "calculo", mapa, pendentes: [], andamento: null, fila: [], ...(pedido ? { pedido } : {}) });

let chave = 0;
const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++chave}`, acao, dados });

describe("rotuloSituacao", () => {
	it("dá o texto e o tom de cada situação", () => {
		expect(rotuloSituacao(mapaCom([]))).toEqual({ texto: "Rascunho", tom: "neutral" });
		expect(rotuloSituacao(mapaCom([], { situacao: "aprovado", aprovadoEm: "2026-10-21T14:00:00.000Z" }))).toEqual({ texto: "Aprovado · 21/10", tom: "sage" });
		expect(rotuloSituacao(mapaCom([], { situacao: "alterado", aprovadoEm: "2026-10-21T14:00:00.000Z" }))).toEqual({ texto: "Mudou depois da aprovação", tom: "amber" });
		expect(rotuloSituacao(mapaCom([], { situacao: "aprovado" })).texto).toBe("Aprovado");
	});
});

describe("resumoMapa", () => {
	it("conta os de dentro e os arquivos, e só mostra novos e sem fonte quando há", () => {
		const arquivo = { hash: "h", mapeadoEm: "", modelo: "m", custo: 0.01, conceitos: 1 };
		expect(resumoMapa(mapaCom([conceito("a"), conceito("b"), conceito("c", { fora: true })], { arquivos: { "aula-01.pdf": arquivo, "aula-02.pdf": arquivo } }))).toBe(
			"2 conceitos · 2 arquivos",
		);
		expect(resumoMapa(mapaCom([conceito("a", { novo: true }), conceito("b", { referencias: [] })], { arquivos: { "aula-01.pdf": arquivo } }))).toBe(
			"2 conceitos · 1 arquivo · 1 novo · 1 sem fonte",
		);
		expect(resumoMapa(mapaCom([conceito("a")]))).toBe("1 conceito · 0 arquivos");
	});

	it("soma o custo dos arquivos mapeados", () => {
		const arquivo = (custo: number) => ({ hash: "h", mapeadoEm: "", modelo: "m", custo, conceitos: 1 });
		expect(custoDoMapa(mapaCom([], { arquivos: { a: arquivo(0.012), b: arquivo(0.03) } }))).toBeCloseTo(0.042);
		expect(custoDoMapa(mapaCom([]))).toBe(0);
	});
});

describe("referências", () => {
	it("abrevia página e deixa os outros locais como vieram", () => {
		expect(abreviarLocal("página 12")).toBe("p. 12");
		expect(abreviarLocal("Página 3")).toBe("p. 3");
		expect(abreviarLocal("célula 4")).toBe("célula 4");
		expect(abreviarLocal("linhas 10-20")).toBe("linhas 10-20");
	});

	it("agrupa por arquivo, na ordem em que aparecem, com as páginas juntas e em ordem", () => {
		const grupos = agruparReferencias([
			{ arquivo: "aula-04.pdf", local: "página 13", trecho: "pagina-013" },
			{ arquivo: "lista.ipynb", local: "célula 2", trecho: "celula-002" },
			{ arquivo: "aula-04.pdf", local: "página 12", trecho: "pagina-012" },
			{ arquivo: "aula-04.pdf", local: "página 12", trecho: "pagina-012" },
			{ arquivo: "lista.ipynb", local: "célula 5", trecho: "celula-005" },
		]);
		expect(grupos).toEqual([
			{ arquivo: "aula-04.pdf", texto: "aula-04.pdf · p. 12, 13", locais: ["p. 12", "13"] },
			{ arquivo: "lista.ipynb", texto: "lista.ipynb · célula 2, célula 5", locais: ["célula 2", "célula 5"] },
		]);
	});

	it("põe as páginas antes dos outros locais do mesmo arquivo", () => {
		expect(
			agruparReferencias([
				{ arquivo: "notas.md", local: "seção Limites", trecho: "secao-1" },
				{ arquivo: "notas.md", local: "página 2", trecho: "pagina-002" },
			]),
		).toEqual([{ arquivo: "notas.md", texto: "notas.md · p. 2, seção Limites", locais: ["p. 2", "seção Limites"] }]);
		expect(agruparReferencias([])).toEqual([]);
	});
});

describe("mudança otimista", () => {
	const servidor = mapaCom([conceito("a"), conceito("b"), conceito("c")], { situacao: "aprovado", aprovadoEm: "2026-10-21T14:00:00.000Z" });
	const lote1: LoteMapa = { tipo: "operar", pedido: "p1", edicao: "e", operacoes: [{ tipo: "tirar", id: "b" }] };
	const lote2: LoteMapa = { tipo: "operar", pedido: "p2", edicao: "e", operacoes: [{ tipo: "prioridade", id: "a", valor: "alta" }] };

	it("mostra o mapa do servidor com os lotes sem resposta por cima, sem mexer no do servidor", () => {
		const visto = mostrarMapa(servidor, [lote1, lote2]);
		expect(visto.conceitos.find((item) => item.id === "b")?.fora).toBe(true);
		expect(visto.conceitos.find((item) => item.id === "a")?.prioridade).toBe("alta");
		expect(visto.situacao).toBe("alterado");
		expect(servidor.conceitos.find((item) => item.id === "b")?.fora).toBeUndefined();
		expect(servidor.situacao).toBe("aprovado");
	});

	it("um lote sai quando chega o mapa com o pedido dele; o outro continua por cima", () => {
		const comLote1 = aplicarOperacoes(servidor, lote1.operacoes).mapa;
		const lido = lerMapa([recebida("mapa", estadoDe(servidor)), recebida("mapa", estadoDe(comLote1, "p1"))], "calculo");
		expect(lido.estado?.mapa).toEqual(comLote1);
		const pendentes = semResposta([lote1, lote2], lido.respondidos);
		expect(pendentes).toEqual([lote2]);
		const visto = mostrarMapa(lido.estado!.mapa, pendentes);
		expect(visto.conceitos.find((item) => item.id === "b")?.fora).toBe(true);
		expect(visto.conceitos.find((item) => item.id === "a")?.prioridade).toBe("alta");
	});

	it("um erro com o pedido do lote tira o lote (a mudança desfaz) e aparece", () => {
		const lido = lerMapa([recebida("mapa", estadoDe(servidor)), recebida("erro", { mensagem: "Não gravei o mapa.", ao: "operar", materia: "calculo", pedido: "p2" })], "calculo");
		const pendentes = semResposta([lote2], lido.respondidos);
		expect(pendentes).toEqual([]);
		expect(mostrarMapa(lido.estado!.mapa, pendentes).conceitos.find((item) => item.id === "a")?.prioridade).toBe("normal");
		expect(lido.erros).toHaveLength(1);
		expect(lido.erros[0]).toMatchObject({ mensagem: "Não gravei o mapa.", pedido: "p2" });
	});

	it("ignora o estado e os erros de outra matéria", () => {
		const lido = lerMapa(
			[
				recebida("mapa", { ...estadoDe(servidor), materia: "fisica" }),
				recebida("erro", { mensagem: "outra", materia: "fisica", pedido: "p9" }),
				recebida("erro", { mensagem: "sem matéria" }),
			],
			"calculo",
		);
		expect(lido.estado).toBeUndefined();
		expect(lido.respondidos.has("p9")).toBe(false);
		expect(lido.erros.map((erro) => erro.mensagem)).toEqual(["sem matéria"]);
	});

	it("a aprovação otimista aprova na hora e limpa os novos; sem conceito dentro, não muda nada", () => {
		const comNovo = mapaCom([conceito("a", { novo: true })], { situacao: "alterado", aprovadoEm: "2026-10-01T10:00:00.000Z" });
		const visto = mostrarMapa(comNovo, [{ tipo: "aprovar", pedido: "p3" }]);
		expect(visto.situacao).toBe("aprovado");
		expect(visto.conceitos[0]?.novo).toBeUndefined();
		const todosFora = mapaCom([conceito("a", { fora: true })]);
		expect(mostrarMapa(todosFora, [{ tipo: "aprovar", pedido: "p4" }])).toEqual(todosFora);
	});
});

describe("ordem", () => {
	it("depois de um arrasto, depoisDe é o conceito de dentro que ficou logo antes (null no primeiro)", () => {
		const antes = ["a", "b", "c", "d"];
		expect(moverDepoisDoArrasto(antes, ["c", "a", "b", "d"], "c")).toEqual({ tipo: "mover", id: "c", depoisDe: null });
		expect(moverDepoisDoArrasto(antes, ["b", "c", "a", "d"], "a")).toEqual({ tipo: "mover", id: "a", depoisDe: "c" });
		expect(moverDepoisDoArrasto(antes, ["a", "b", "d", "c"], "d")).toEqual({ tipo: "mover", id: "d", depoisDe: "b" });
		expect(moverDepoisDoArrasto(antes, antes, "b")).toBeUndefined();
	});

	it("a operação do arrasto deixa os de dentro na ordem da tela, mesmo com os de fora no meio", () => {
		const mapa = mapaCom([conceito("a"), conceito("x", { fora: true }), conceito("b"), conceito("c"), conceito("y", { fora: true }), conceito("d")]);
		const tela = ["c", "a", "d", "b"];
		const antes = ["a", "b", "c", "d"];
		// Um arrasto de cada vez: c para o começo, depois d para depois de a.
		let atual = mapa;
		let ordem = antes;
		for (const [id, depois] of [
			["c", ["c", "a", "b", "d"]],
			["d", tela],
		] as const) {
			const operacao = moverDepoisDoArrasto(ordem, depois, id)!;
			atual = aplicarOperacoes(atual, [operacao]).mapa;
			ordem = atual.conceitos.filter((item) => !item.fora).map((item) => item.id);
		}
		expect(ordem).toEqual(tela);
		expect(atual.conceitos.filter((item) => item.fora).map((item) => item.id)).toEqual(["x", "y"]);
	});

	it("subir e descer um lugar", () => {
		const ordem = ["a", "b", "c", "d"];
		expect(moverUmLugar(ordem, "c", "subir")).toEqual({ tipo: "mover", id: "c", depoisDe: "a" });
		expect(moverUmLugar(ordem, "b", "subir")).toEqual({ tipo: "mover", id: "b", depoisDe: null });
		expect(moverUmLugar(ordem, "a", "subir")).toBeUndefined();
		expect(moverUmLugar(ordem, "b", "descer")).toEqual({ tipo: "mover", id: "b", depoisDe: "c" });
		expect(moverUmLugar(ordem, "d", "descer")).toBeUndefined();
		const mapa = mapaCom(ordem.map((id) => conceito(id)));
		const subiu = aplicarOperacoes(mapa, [moverUmLugar(ordem, "c", "subir")!]).mapa;
		expect(subiu.conceitos.map((item) => item.id)).toEqual(["a", "c", "b", "d"]);
		const desceu = aplicarOperacoes(mapa, [moverUmLugar(ordem, "a", "descer")!]).mapa;
		expect(desceu.conceitos.map((item) => item.id)).toEqual(["b", "a", "c", "d"]);
	});
});

describe("avisos", () => {
	it("pendentes: quantos e o custo estimado, ou custo desconhecido", () => {
		// O Intl separa "US$" do número com um espaço sem quebra.
		expect(formatarDolar(0.04).replace(/\s/u, " ")).toBe("US$ 0,04");
		const pendente = (arquivo: string, custoEstimado: number | null) => ({ arquivo, tipo: "pdf", caracteres: 100, partes: 1, custoEstimado });
		expect(textoPendentes([pendente("a.pdf", 0.01), pendente("b.pdf", 0.02), pendente("c.pdf", 0.01)])).toBe(`3 arquivos ainda fora do mapa · cerca de ${formatarDolar(0.04)}`);
		expect(textoPendentes([pendente("a.pdf", 0.01), pendente("b.pdf", null)])).toBe("2 arquivos ainda fora do mapa · custo desconhecido");
		expect(textoPendentes([pendente("a.pdf", 0.005)])).toBe(`1 arquivo ainda fora do mapa · cerca de ${formatarDolar(0.005)}`);
	});

	it("andamento: o arquivo, a parte e a fila", () => {
		expect(textoAndamento({ arquivo: "aula-05.pdf", parte: 2, partes: 3 }, ["aula-06.pdf", "aula-07.pdf"])).toEqual({
			texto: "Mapeando aula-05.pdf · parte 2 de 3",
			fila: "+ 2 na fila",
		});
		expect(textoAndamento({ arquivo: "aula-05.pdf", parte: 1, partes: 1 }, ["aula-05.pdf"])).toEqual({ texto: "Mapeando aula-05.pdf" });
	});
});

describe("descreverEvento do mapa", () => {
	const evento = (verbo: Evento["verbo"], objeto: Evento["objeto"], resultado?: Record<string, unknown>): Evento => ({
		id: "x",
		ts: "2026-10-21T14:00:00.000Z",
		verbo,
		objeto,
		...(resultado ? { resultado } : {}),
	});

	it("mapeou_material, sem as partes zeradas", () => {
		expect(descreverEvento(evento("mapeou_material", { materia: "calculo", arquivo: "aula-04.pdf" }, { novos: 3, reforcados: 5, descartados: 1, partes: 1, custo: 0.01 }))).toEqual({
			icone: "bulb",
			texto: "Mapa atualizado com aula-04.pdf",
			detalhe: `3 conceitos novos · 5 reforçados · ${formatarDolar(0.01)}`,
		});
		expect(descreverEvento(evento("mapeou_material", { materia: "calculo", arquivo: "a.pdf" }, { novos: 1, reforcados: 0, custo: 0 }))).toEqual({
			icone: "bulb",
			texto: "Mapa atualizado com a.pdf",
			detalhe: "1 conceito novo",
		});
		expect(descreverEvento(evento("mapeou_material", { materia: "calculo", arquivo: "a.pdf" }, { novos: 0, reforcados: 0, custo: 0 })).detalhe).toBeUndefined();
	});

	it("atualizou_mapa, revisou_mapa e aprovou_mapa", () => {
		expect(descreverEvento(evento("atualizou_mapa", { materia: "calculo", arquivo: "aula-02.pdf" }, { motivo: "material_removido", semFonte: 2 }))).toEqual({
			icone: "bulb",
			texto: "Mapa sem aula-02.pdf",
			detalhe: "2 conceitos ficaram sem fonte",
		});
		expect(descreverEvento(evento("atualizou_mapa", { materia: "calculo", arquivo: "aula-02.pdf" }, { motivo: "material_removido", semFonte: 0 })).detalhe).toBeUndefined();
		expect(descreverEvento(evento("revisou_mapa", { materia: "calculo" }, { edicao: "e", tipo: "tirar" }))).toEqual({ icone: "bulb", texto: "Mapa revisado" });
		expect(descreverEvento(evento("aprovou_mapa", { materia: "calculo" }, { conceitos: 14, fora: 2 }))).toEqual({ icone: "check", texto: "Mapa aprovado", detalhe: "14 conceitos" });
	});
});
