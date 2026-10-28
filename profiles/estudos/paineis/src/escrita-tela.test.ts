// As partes puras da escrita dos módulos na tela (escrita-tela.ts): o balão de
// retorno (a avaliação, os motivos, o texto e o "Virar regra de escrita", e o
// que vai para a ponte), o texto da regra a partir do retorno, as versões
// anteriores de um bloco reescrito e os rótulos; e a leitura da ponte
// (escrita-ponte.ts, e o retorno e a reescrita em modulos-ponte.ts).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { RegraEscrita } from "../../lib/escrita-tipos.ts";
import type { Bloco, BlocoAnterior } from "../../lib/modulo-tipos.ts";
import { EsperaDePedidos, lerEscrita, respostaEscrita, respostaQualquer } from "./escrita-ponte.ts";
import {
	alternarMotivo,
	anteriorInicial,
	balaoVazio,
	contagemDasRegras,
	dadosDoRetorno,
	dataDaVersao,
	escolherAvaliacao,
	foiReescrito,
	marcarVirarRegra,
	materiaDaOpcao,
	mudarTextoRegra,
	mudarTextoRetorno,
	NOME_TODAS,
	nomeDaMateria,
	OPCAO_TODAS,
	opcaoDaMateria,
	opcoesDaRegra,
	opcoesDeMateria,
	podeReescrever,
	problemaDoBalao,
	ROTULO_DE_RETORNO,
	rotuloDaOrigem,
	rotuloDaVersao,
	textoDaRegra,
	tituloDoReescrito,
	versoesAnteriores,
} from "./escrita-tela.ts";
import { errosDaReescrita, idDoRetorno, lerModulos, reescrevendoNoModulo } from "./modulos-ponte.ts";

const MATERIAS = [
	{ id: "calculo", nome: "Cálculo I" },
	{ id: "estatistica", nome: "Estatística" },
];

const regra = (campos: Partial<RegraEscrita> = {}): RegraEscrita => ({
	id: "r-1",
	texto: "Sempre um exemplo antes da definição.",
	materia: null,
	ativa: true,
	criadaEm: "2026-10-28T10:00:00.000Z",
	alteradaEm: "2026-10-28T10:00:00.000Z",
	origem: "escrita",
	...campos,
});

const recebida = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });

describe("o balão de retorno", () => {
	it("começa vazio, sem avaliação, e não salva sem ela", () => {
		const balao = balaoVazio();
		expect(balao).toEqual({ motivos: [], texto: "", virarRegra: false, textoRegra: "", regraEditada: false, soEstaMateria: false });
		expect(problemaDoBalao(balao)).toBe("Escolha Bom ou Precisa melhorar.");
		expect(() => dadosDoRetorno(balao, "calculo")).toThrow("Escolha Bom ou Precisa melhorar.");
		expect(podeReescrever(balao)).toBe(false);
	});

	it("os motivos só valem com Precisa melhorar, na ordem da lista, e saem com Bom", () => {
		let balao = alternarMotivo(balaoVazio(), "longo");
		expect(balao.motivos).toEqual([]);
		balao = escolherAvaliacao(balao, "melhorar");
		balao = alternarMotivo(balao, "erro");
		balao = alternarMotivo(balao, "longo");
		balao = alternarMotivo(balao, "faltou_exemplo");
		expect(balao.motivos).toEqual(["longo", "faltou_exemplo", "erro"]);
		balao = alternarMotivo(balao, "longo");
		expect(balao.motivos).toEqual(["faltou_exemplo", "erro"]);
		expect(podeReescrever(balao)).toBe(true);
		balao = escolherAvaliacao(balao, "bom");
		expect(balao.motivos).toEqual([]);
		expect(podeReescrever(balao)).toBe(false);
	});

	it("a regra vem do texto do retorno e acompanha até o Breno mexer nela", () => {
		let balao = mudarTextoRetorno(escolherAvaliacao(balaoVazio(), "melhorar"), "  Mais exemplos com números.  ");
		expect(balao.textoRegra).toBe("Mais exemplos com números.");
		balao = marcarVirarRegra(balao, true);
		expect(balao.textoRegra).toBe("Mais exemplos com números.");
		balao = mudarTextoRetorno(balao, "Mais exemplos com números reais.");
		expect(balao.textoRegra).toBe("Mais exemplos com números reais.");
		balao = mudarTextoRegra(balao, "Comece por um exemplo com números.");
		balao = mudarTextoRetorno(balao, "Outro texto.");
		expect(balao.textoRegra).toBe("Comece por um exemplo com números.");
		// Desligar e ligar de novo não apaga o que ele escreveu.
		balao = marcarVirarRegra(marcarVirarRegra(balao, false), true);
		expect(balao.textoRegra).toBe("Comece por um exemplo com números.");
	});

	it("o texto da regra a partir do retorno: aparado e cortado em 300", () => {
		expect(textoDaRegra("  curto  ")).toBe("curto");
		expect(textoDaRegra("a".repeat(400))).toHaveLength(300);
		expect(textoDaRegra("")).toBe("");
	});

	it("com Virar regra, precisa do texto da regra", () => {
		const balao = marcarVirarRegra(escolherAvaliacao(balaoVazio(), "bom"), true);
		expect(problemaDoBalao(balao)).toBe("Escreva o texto da regra.");
		expect(problemaDoBalao(mudarTextoRegra(balao, "x".repeat(301)))).toBe("A regra tem 301 caracteres; o máximo é 300.");
		expect(problemaDoBalao(mudarTextoRegra(balao, "Use frases curtas."))).toBeUndefined();
	});

	it("o texto do retorno tem no máximo 1000 caracteres", () => {
		const balao = mudarTextoRetorno(escolherAvaliacao(balaoVazio(), "bom"), "y".repeat(1001));
		expect(problemaDoBalao(balao)).toBe("O texto tem 1001 caracteres; o máximo é 1000.");
	});

	it("o que vai para a ponte: sem texto vazio; a regra de todas as matérias ou desta", () => {
		expect(dadosDoRetorno(escolherAvaliacao(balaoVazio(), "bom"), "calculo")).toEqual({ avaliacao: "bom", motivos: [] });
		let balao = alternarMotivo(escolherAvaliacao(balaoVazio(), "melhorar"), "abstrato");
		balao = marcarVirarRegra(mudarTextoRetorno(balao, " Mais concreto, por favor. "), true);
		expect(dadosDoRetorno(balao, "calculo")).toEqual({
			avaliacao: "melhorar",
			motivos: ["abstrato"],
			texto: "Mais concreto, por favor.",
			virarRegra: { texto: "Mais concreto, por favor.", materia: null },
		});
		expect(dadosDoRetorno({ ...balao, soEstaMateria: true }, "calculo").virarRegra).toEqual({ texto: "Mais concreto, por favor.", materia: "calculo" });
	});
});

describe("as regras na tela", () => {
	it("a etiqueta da origem só para a regra que veio de um retorno", () => {
		expect(rotuloDaOrigem(regra())).toBeUndefined();
		expect(rotuloDaOrigem(regra({ origem: "retorno", retorno: "e-1" }))).toBe(ROTULO_DE_RETORNO);
	});

	it("a contagem: quantas regras e, se nem todas, quantas ligadas", () => {
		expect(contagemDasRegras([])).toBe("Nenhuma regra");
		expect(contagemDasRegras([regra()])).toBe("1 regra");
		expect(contagemDasRegras([regra(), regra({ id: "r-2" })])).toBe("2 regras");
		expect(contagemDasRegras([regra(), regra({ id: "r-2", ativa: false })])).toBe("2 regras · 1 ligada");
	});

	it("o seletor da matéria: Todas as matérias e cada uma pelo nome", () => {
		expect(opcoesDeMateria(MATERIAS)).toEqual([
			{ id: OPCAO_TODAS, titulo: NOME_TODAS },
			{ id: "calculo", titulo: "Cálculo I" },
			{ id: "estatistica", titulo: "Estatística" },
		]);
		expect(opcaoDaMateria(null)).toBe(OPCAO_TODAS);
		expect(opcaoDaMateria("calculo")).toBe("calculo");
		expect(materiaDaOpcao(OPCAO_TODAS)).toBeNull();
		expect(materiaDaOpcao("estatistica")).toBe("estatistica");
		expect(nomeDaMateria(null, MATERIAS)).toBe(NOME_TODAS);
		expect(nomeDaMateria("calculo", MATERIAS)).toBe("Cálculo I");
		// Uma matéria que não está na lista aparece pelo id, e continua no seletor.
		expect(nomeDaMateria("fisica", MATERIAS)).toBe("fisica");
		expect(opcoesDaRegra("fisica", MATERIAS).at(-1)).toEqual({ id: "fisica", titulo: "fisica" });
		expect(opcoesDaRegra("calculo", MATERIAS)).toHaveLength(3);
	});
});

describe("as versões de um bloco", () => {
	const anterior = (versao: number, substituidoEm: string): BlocoAnterior =>
		({ id: "l1-b1", tipo: "verificacao", conceitos: [], pergunta: `v${versao}`, respostaEsperada: "", versao, substituidoEm, retorno: `e-${versao}` }) as BlocoAnterior;
	const bloco = (campos: Partial<Bloco> = {}): Bloco => ({ id: "l1-b1", tipo: "verificacao", conceitos: [], pergunta: "atual", respostaEsperada: "", ...campos }) as Bloco;

	it("sem versão, o bloco é a versão 1 e não foi reescrito", () => {
		expect(foiReescrito(bloco())).toBe(false);
		expect(versoesAnteriores(bloco())).toEqual([]);
		expect(foiReescrito(bloco({ versao: 2 }))).toBe(true);
	});

	it("as anteriores na ordem do arquivo; a primeira a ver é a mais recente", () => {
		const reescrito = bloco({ versao: 3, reescritoEm: "2026-10-28T15:00:00", anteriores: [anterior(1, "2026-10-27T10:00:00"), anterior(2, "2026-10-28T15:00:00")] });
		const lista = versoesAnteriores(reescrito);
		expect(lista.map((item) => item.versao)).toEqual([1, 2]);
		expect(anteriorInicial(lista)).toBe(1);
		expect(anteriorInicial([])).toBe(0);
		expect(rotuloDaVersao(lista[0]!, reescrito)).toBe("Versão 1 de 3");
		expect(rotuloDaVersao(lista[1]!, reescrito)).toBe("Versão 2 de 3");
		expect(dataDaVersao(lista[0]!)).toBe("Substituída em 27/10");
		expect(dataDaVersao({ substituidoEm: "não é data" })).toBe("");
		expect(tituloDoReescrito(reescrito)).toBe("Reescrito em 28/10 (versão 3)");
	});

	it("ignora o que não é bloco na lista das anteriores", () => {
		expect(versoesAnteriores(bloco({ anteriores: [null, anterior(1, "2026-10-27T10:00:00")] as unknown as BlocoAnterior[] }))).toHaveLength(1);
	});
});

describe("a ponte das regras", () => {
	it("lerEscrita: as últimas regras (com ou sem pedido) e o erro sem pedido depois delas", () => {
		expect(lerEscrita([])).toEqual({});
		const lido = lerEscrita([
			recebida("1", "regras", { regras: [regra()] }),
			recebida("2", "erro", { mensagem: "Falhou ao salvar.", pedido: "p-1" }),
			recebida("3", "regras", { regras: [regra(), regra({ id: "r-2" })], pedido: "p-2" }),
		]);
		expect(lido.regras?.map((item) => item.id)).toEqual(["r-1", "r-2"]);
		expect(lido.erro).toBeUndefined();
		expect(lerEscrita([recebida("1", "regras", { regras: [] }), recebida("2", "erro", { mensagem: "Não li o escrita.json.", ao: "listar" })]).erro).toEqual({
			chave: "2",
			mensagem: "Não li o escrita.json.",
			ao: "listar",
		});
	});

	it("respostaEscrita: as regras ou o erro com o pedido", () => {
		const recebidas = [recebida("1", "regras", { regras: [regra()] }), recebida("2", "erro", { mensagem: "Texto vazio.", pedido: "p-1" }), recebida("3", "regras", { regras: [], pedido: "p-2" })];
		expect(respostaEscrita(recebidas, "p-1")).toEqual({ tipo: "erro", mensagem: "Texto vazio." });
		expect(respostaEscrita(recebidas, "p-2")).toEqual({ tipo: "ok", dados: [] });
		expect(respostaEscrita(recebidas, "p-3")).toBeUndefined();
	});

	it("EsperaDePedidos: resolve e rejeita pelo pedido, e cancela os que ficaram", async () => {
		const espera = new EsperaDePedidos(respostaEscrita);
		const ok = espera.esperar("p-1");
		const falha = espera.esperar("p-2");
		const sobra = espera.esperar("p-3");
		espera.receber([recebida("1", "regras", { regras: [regra()], pedido: "p-1" }), recebida("2", "erro", { mensagem: "Não deu.", pedido: "p-2" })]);
		await expect(ok).resolves.toHaveLength(1);
		await expect(falha).rejects.toThrow("Não deu.");
		expect(espera.quantos).toBe(1);
		espera.cancelar("A conversa mudou.");
		await expect(sobra).rejects.toThrow("A conversa mudou.");
	});
});

describe("a ponte do retorno e da reescrita", () => {
	it("respostaQualquer: a primeira com o pedido; erro rejeita", () => {
		expect(respostaQualquer([recebida("1", "estado", { pedido: "p-1", modulos: [] })], "p-1")).toEqual({ tipo: "ok", dados: { acao: "estado", dados: { pedido: "p-1", modulos: [] } } });
		expect(respostaQualquer([recebida("1", "erro", { pedido: "p-1", mensagem: "Sem bloco." })], "p-1")).toEqual({ tipo: "erro", mensagem: "Sem bloco." });
		expect(respostaQualquer([recebida("1", "estado", { modulos: [] })], "p-1")).toBeUndefined();
	});

	it("idDoRetorno: o campo retorno, ou evento", () => {
		expect(idDoRetorno({ retorno: "e-1" })).toBe("e-1");
		expect(idDoRetorno({ evento: "e-2" })).toBe("e-2");
		expect(idDoRetorno({ evento: { id: "e-3" } })).toBe("e-3");
		expect(idDoRetorno({ pedido: "p-1" })).toBeUndefined();
		expect(idDoRetorno(undefined)).toBeUndefined();
	});

	const estado = (reescrevendo?: { licao: string; bloco: string }, pedido?: string) => ({
		materia: "calculo",
		curso: "c1",
		modulos: [{ id: "m1", situacao: "gerado", ...(reescrevendo ? { reescrevendo } : {}) }],
		...(pedido ? { pedido } : {}),
	});

	it("reescrevendoNoModulo: o bloco do estado do módulo", () => {
		expect(reescrevendoNoModulo(estado({ licao: "l1", bloco: "l1-b2" }) as never, "m1")).toEqual({ licao: "l1", bloco: "l1-b2" });
		expect(reescrevendoNoModulo(estado() as never, "m1")).toBeUndefined();
		expect(reescrevendoNoModulo(undefined, "m1")).toBeUndefined();
	});

	it("errosDaReescrita: pelo pedido, ou sem pedido pelo bloco dito ou pelo último; um estado reescrevendo de novo apaga", () => {
		const alvo = { materia: "calculo", curso: "c1", modulo: "m1" };
		const pedidos = { "p-1": "l1/l1-b2" };
		expect(errosDaReescrita([recebida("1", "erro", { pedido: "p-1", mensagem: "Sem crédito.", ao: "reescrever_bloco" })], alvo, pedidos)).toEqual({
			"l1/l1-b2": { chave: "1", mensagem: "Sem crédito.", ao: "reescrever_bloco" },
		});
		expect(errosDaReescrita([recebida("1", "erro", { ao: "reescrever_bloco", modulo: "m1", mensagem: "JSON inválido." })], alvo, {}, "l2/l2-b1")).toHaveProperty(["l2/l2-b1", "mensagem"], "JSON inválido.");
		expect(errosDaReescrita([recebida("1", "erro", { ao: "reescrever_bloco", modulo: "m1", licao: "l3", bloco: "l3-b4", mensagem: "x" })], alvo, {}, "l2/l2-b1")).toHaveProperty("l3/l3-b4");
		// De outro módulo ou de outra ação, não.
		expect(errosDaReescrita([recebida("1", "erro", { ao: "reescrever_bloco", modulo: "m2", mensagem: "x" })], alvo, {}, "l1/l1-b1")).toEqual({});
		expect(errosDaReescrita([recebida("1", "erro", { pedido: "p-9", mensagem: "x" })], alvo, pedidos)).toEqual({});
		expect(
			errosDaReescrita([recebida("1", "erro", { pedido: "p-1", mensagem: "x" }), recebida("2", "estado", estado({ licao: "l1", bloco: "l1-b2" }))], alvo, pedidos),
		).toEqual({});
	});

	it("os erros do retorno e da reescrita não vão para o card do módulo (lerModulos)", () => {
		const lido = lerModulos(
			[
				recebida("1", "estado", estado()),
				recebida("2", "erro", { materia: "calculo", curso: "c1", modulo: "m1", ao: "reescrever_bloco", mensagem: "x" }),
				recebida("3", "erro", { materia: "calculo", curso: "c1", modulo: "m1", ao: "retorno", mensagem: "y" }),
			],
			"calculo",
			"c1",
		);
		expect(lido.errosModulo).toEqual({});
		expect(lido.erroLista).toBeUndefined();
	});
});
