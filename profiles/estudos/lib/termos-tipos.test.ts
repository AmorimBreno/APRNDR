// Testes das partes puras dos termos-chave e dos pedidos de explicação
// (docs/termos.md): o id do termo, a leitura e a colocação das marcas no
// markdown (a parte delicada: código, fórmula com a regra do $ de dinheiro,
// link e endereço), os termos de uma lição gerada, o glossário juntado, o
// lugar que vale, a marcação de um módulo antigo e os pedidos de explicação.

import { describe, expect, it } from "vitest";
import type { Bloco, Licao, ModuloGerado } from "./modulo-tipos.ts";
import {
	aplicarMarcas,
	aplicarPedidoExplicacao,
	aplicarRespostaExplicacao,
	aplicarTermoGuardado,
	conferirTermosDaLicao,
	desfazerMarcasDesconhecidas,
	type ExplicacaoPedida,
	explicacoesAteOBloco,
	explicacoesDoBloco,
	explicadoQueVale,
	formaDoTermo,
	type Glossario,
	glossarioNaTela,
	glossarioVazio,
	idDoTermo,
	incorporarTermosDaLicao,
	incorporarTermosMarcados,
	juntarTermos,
	lerMarcas,
	lerTermosMarcados,
	limparMarcasDoBloco,
	linhaDoGlossario,
	mapearTextosDoBloco,
	marcarTrecho,
	marcasDoBloco,
	moduloTemMarcas,
	regioesDoMarkdown,
	semMarcas,
	situacaoDaExplicacao,
	type Termo,
	termoPorId,
	termosParaMensagem,
	textosDoBloco,
	tirarPedidoPendente,
	trechoValido,
	trocarMarcas,
	trocarMarcasNovas,
	validarPedidoExplicacao,
	validarRespostaExplicacao,
} from "./termos-tipos.ts";

const AGORA = new Date("2026-10-29T13:00:00.000Z");
const DEPOIS = new Date("2026-10-29T14:00:00.000Z");

const termo = (id: string, nome: string, extra: Partial<Termo> = {}): Termo => ({
	id,
	termo: nome,
	definicao: `Definição de ${nome}.`,
	explicado: null,
	origem: "geracao",
	criadoEm: AGORA.toISOString(),
	alteradoEm: AGORA.toISOString(),
	...extra,
});

const explicacao = (id: string, texto: string, formato = "conceito"): Bloco => ({ id, tipo: "explicacao", conceitos: ["c-a"], formato, texto, referencias: [] }) as Bloco;
const ideia = (id: string, texto: string): Bloco => ({ id, tipo: "ideia_central", conceitos: ["c-a"], texto });
const pergunta = (id: string, texto: string, resposta = "Resposta."): Bloco => ({ id, tipo: "verificacao", conceitos: ["c-a"], pergunta: texto, respostaEsperada: resposta });
const quiz = (id: string, extra: Record<string, unknown> = {}): Bloco =>
	({
		id,
		tipo: "alternativa",
		conceitos: ["c-a"],
		contexto: "Contexto do quiz.",
		enunciado: "Qual é o radical?",
		alternativas: [
			{ texto: "estud", correta: true },
			{ texto: "estudar", confusao: "Confunde [radical](termo:t-radical) com a palavra." },
		],
		explicacao: "O radical é o que sobra.",
		referencias: [],
		...extra,
	}) as Bloco;
const dissertativa = (id: string): Bloco =>
	({
		id,
		tipo: "dissertativa",
		conceitos: ["c-a"],
		enunciado: "Explique o [radical](termo:t-radical).",
		rubrica: [{ criterio: "[Radical](termo:t-radical)", descricao: "Diz o que é.", pontos: 2 }],
		respostaModelo: "O [radical](termo:t-radical) é…",
		referencias: [],
	}) as Bloco;

const licao = (id: string, blocos: Bloco[]): Licao => ({ id, titulo: `Lição ${id}`, objetivo: "", conceitos: ["c-a"], blocos });

const modulo = (id: string, licoes: Licao[], extra: Partial<ModuloGerado> = {}): ModuloGerado => ({
	versao: 1,
	id,
	curso: "p1",
	materia: "ri",
	situacao: "gerado",
	licoes,
	geradoEm: AGORA.toISOString(),
	modelo: "teste/modelo-x",
	custo: 0.1,
	materiaisUsados: [],
	...extra,
});

describe("o id e a forma do termo", () => {
	it("t- e o termo sem acento, em minúsculas, com hífens; o repetido ganha -2, -3", () => {
		expect(idDoTermo("Fitação de polinômio")).toBe("t-fitacao-de-polinomio");
		expect(idDoTermo("radical")).toBe("t-radical");
		expect(idDoTermo("  TF-IDF (peso)  ")).toBe("t-tf-idf-peso");
		expect(idDoTermo("ação", ["t-acao"])).toBe("t-acao-2");
		expect(idDoTermo("ação", ["t-acao", "t-acao-2"])).toBe("t-acao-3");
		expect(idDoTermo("—")).toBe("t-termo");
		expect(idDoTermo("a".repeat(100))).toHaveLength(62);
	});

	it("a forma compara sem acento, caixa e espaços repetidos", () => {
		expect(formaDoTermo(" Fitação  de Polinômio ")).toBe(formaDoTermo("fitacao de polinomio"));
		expect(formaDoTermo("radical")).not.toBe(formaDoTermo("radicais"));
	});

	it("termoPorId e a linha do glossário na mensagem", () => {
		const termos = [termo("t-radical", "radical", { definicao: "A parte\nque sobra." })];
		expect(termoPorId(termos, "t-radical")?.termo).toBe("radical");
		expect(termoPorId(termos, "t-x")).toBeUndefined();
		expect(linhaDoGlossario(termos[0]!)).toBe("- t-radical · radical: A parte que sobra.");
	});
});

describe("as regiões do markdown (onde a marca não entra)", () => {
	const tipos = (texto: string) => regioesDoMarkdown(texto).map((regiao) => [regiao.tipo, texto.slice(regiao.inicio, regiao.fim)]);

	it("código em linha (com a mesma quantidade de crases) e blocos cercados, também vetor e matriz e com recuo", () => {
		expect(tipos("use `len(x)` e ``a ` b`` aqui")).toEqual([
			["codigo", "`len(x)`"],
			["codigo", "``a ` b``"],
		]);
		const cercado = "antes\n```python\nradical = 1\n```\ndepois";
		expect(tipos(cercado)).toEqual([["codigo", "```python\nradical = 1\n```"]]);
		expect(tipos("~~~\nx\n~~~")).toEqual([["codigo", "~~~\nx\n~~~"]]);
		expect(tipos("- item\n\n    ```vetor\n    [1, 2]\n    ```\nfim")).toEqual([["codigo", "    ```vetor\n    [1, 2]\n    ```"]]);
		// Sem fechar, o bloco vai até o fim; a crase solta é texto.
		expect(tipos("a\n```\nradical")).toEqual([["codigo", "```\nradical"]]);
		expect(tipos("uma ` solta")).toEqual([]);
	});

	it("a crase não fecha em outro parágrafo", () => {
		expect(tipos("a `b\n\nc` d")).toEqual([]);
	});

	it("fórmula: $…$ e $$…$$; o $ de dinheiro não abre fórmula", () => {
		expect(tipos("A derivada de $x^2$ é $2x$.")).toEqual([
			["formula", "$x^2$"],
			["formula", "$2x$"],
		]);
		expect(tipos("$$\n\\int_0^1 x\\,dx\n$$")).toEqual([["formula", "$$\n\\int_0^1 x\\,dx\n$$"]]);
		expect(tipos("compra por R$ 20 e vende a R$ 19")).toEqual([]);
		expect(tipos("R$20 e US$ 3")).toEqual([]);
		expect(tipos("custa $ 5 ou $ 6")).toEqual([]);
		expect(tipos("o lucro $L = R - C$ foi de R$ 300")).toEqual([["formula", "$L = R - C$"]]);
		expect(tipos("a variável $R$ cresce")).toEqual([["formula", "$R$"]]);
		expect(tipos("um \\$ literal e $x$")).toEqual([["formula", "$x$"]]);
		// Sem fechar no parágrafo, o $ é texto.
		expect(tipos("$x\n\ny$")).toEqual([]);
	});

	it("o que abre primeiro ganha: $ dentro de código não é fórmula; crase dentro de fórmula não é código", () => {
		expect(tipos("`a $b` e c$")).toEqual([["codigo", "`a $b`"]]);
		expect(tipos("$a `b$ c`")).toEqual([["formula", "$a `b$"]]);
	});

	it("link, imagem, embed e endereços", () => {
		expect(regioesDoMarkdown("ver [o radical](termo:t-radical) e ![fig](a.png)").map(({ tipo, alvo, imagem }) => ({ tipo, alvo, imagem }))).toEqual([
			{ tipo: "link", alvo: "termo:t-radical", imagem: undefined },
			{ tipo: "link", alvo: "a.png", imagem: true },
		]);
		expect(tipos("veja ![[grafico.png|650]] e <https://x.com/radical> e https://y.com/radical e www.z.com")).toEqual([
			["link", "![[grafico.png|650]]"],
			["endereco", "<https://x.com/radical>"],
			["endereco", "https://y.com/radical"],
			["endereco", "www.z.com"],
		]);
		expect(tipos("[a [b] c](u(1)) [sem alvo] e [x]\n(y)")).toEqual([["link", "[a [b] c](u(1))"]]);
	});
});

describe("ler, trocar e desfazer as marcas", () => {
	it("lerMarcas: os links termo: fora de código e fórmula, com o texto e o id", () => {
		const texto = "Os [radicais](termo:t-radical) e o [lema](termo:novo-1); `[x](termo:t-x)` e $[y](termo:t-y)$ não; [site](https://a.b) também não; [z]( Termo: t-z )";
		expect(lerMarcas(texto).map(({ texto, id }) => [texto, id])).toEqual([
			["radicais", "t-radical"],
			["lema", "novo-1"],
			["z", "t-z"],
		]);
		expect(lerMarcas("![radical](termo:t-radical)")).toEqual([]);
	});

	it("trocarMarcas: troca o id, desfaz com null e escreve do jeito certo", () => {
		const texto = "Os [radicais](termo:t-radical), o [lema](termo:novo-1) e [z](Termo: t-z).";
		expect(trocarMarcas(texto, (id) => (id === "novo-1" ? "t-lema" : id === "t-radical" ? null : id))).toBe("Os radicais, o [lema](termo:t-lema) e [z](termo:t-z).");
		expect(trocarMarcas("sem marca", () => null)).toBe("sem marca");
	});

	it("trocarMarcasNovas, desfazerMarcasDesconhecidas e semMarcas", () => {
		const texto = "[a](termo:novo-1) [b](termo:novo-2) [c](termo:t-c) [d](termo:t-d)";
		expect(trocarMarcasNovas(texto, { "novo-1": "t-a" })).toBe("[a](termo:t-a) b [c](termo:t-c) [d](termo:t-d)");
		expect(desfazerMarcasDesconhecidas(texto, new Set(["t-c"]))).toBe("a b [c](termo:t-c) d");
		expect(desfazerMarcasDesconhecidas(texto, (id) => id === "t-d")).toBe("a b c [d](termo:t-d)");
		expect(semMarcas(texto)).toBe("a b c d");
	});
});

describe("marcarTrecho (a primeira ocorrência fora de código, fórmula e link)", () => {
	it("marca a primeira ocorrência, sem mudar o resto", () => {
		expect(marcarTrecho("Stemming leva palavras aos radicais. Os radicais…", "radicais", "t-radical")).toBe(
			"Stemming leva palavras aos [radicais](termo:t-radical). Os radicais…",
		);
		expect(marcarTrecho("**radicais** e mais", "radicais", "t-radical")).toBe("**[radicais](termo:t-radical)** e mais");
		expect(marcarTrecho("### Radicais\ntexto", "Radicais", "t-radical")).toBe("### [Radicais](termo:t-radical)\ntexto");
	});

	it("pula código em linha, blocos cercados, vetor e matriz", () => {
		expect(marcarTrecho("`radical` e radical", "radical", "t-r")).toBe("`radical` e [radical](termo:t-r)");
		expect(marcarTrecho("```python\nradical = 1\n```\nO radical", "radical", "t-r")).toBe("```python\nradical = 1\n```\nO [radical](termo:t-r)");
		expect(marcarTrecho("```matriz\n# pesos\n[[1, 2]]\n```\npesos", "pesos", "t-p")).toBe("```matriz\n# pesos\n[[1, 2]]\n```\n[pesos](termo:t-p)");
		expect(marcarTrecho("só `radical`", "radical", "t-r")).toBeUndefined();
	});

	it("pula fórmulas, respeitando o $ de dinheiro", () => {
		expect(marcarTrecho("A fórmula $idf = log(N)$ usa o idf", "idf", "t-idf")).toBe("A fórmula $idf = log(N)$ usa o [idf](termo:t-idf)");
		expect(marcarTrecho("$$\nidf\n$$\nidf", "idf", "t-idf")).toBe("$$\nidf\n$$\n[idf](termo:t-idf)");
		// O $ de dinheiro não abre fórmula: o texto entre dois preços é marcável.
		expect(marcarTrecho("De R$ 20 o lucro foi a R$ 19", "lucro", "t-lucro")).toBe("De R$ 20 o [lucro](termo:t-lucro) foi a R$ 19");
		expect(marcarTrecho("custa $ 5 de lucro $ 6", "lucro", "t-lucro")).toBe("custa $ 5 de [lucro](termo:t-lucro) $ 6");
		expect(marcarTrecho("o lucro $L = R - C$ foi de R$ 300 de custo C", "C", "t-c")).toBe("o lucro $L = R - C$ foi de R$ 300 de custo [C](termo:t-c)");
		expect(marcarTrecho("só $x$", "x", "t-x")).toBeUndefined();
	});

	it("pula links (e marcas que já existem), imagens, embeds e endereços", () => {
		expect(marcarTrecho("[radical](termo:t-radical) e radical", "radical", "t-radical")).toBe("[radical](termo:t-radical) e [radical](termo:t-radical)");
		expect(marcarTrecho("[o radical](https://a.b) ![radical](r.png) ![[radical.png]] https://a.b/radical", "radical", "t-r")).toBeUndefined();
	});

	it("só uma palavra inteira: dentro de outra palavra não conta", () => {
		expect(marcarTrecho("Os radicais; o radical.", "radical", "t-radical")).toBe("Os radicais; o [radical](termo:t-radical).");
		expect(marcarTrecho("radicalismo", "radical", "t-radical")).toBeUndefined();
		expect(marcarTrecho("C++ e C", "C++", "t-cpp")).toBe("[C++](termo:t-cpp) e C");
		expect(marcarTrecho("o_radical e radical", "radical", "t-r")).toBe("o_radical e [radical](termo:t-r)");
	});

	it("não marca logo depois de ! ou \\, e recusa trecho vazio, longo, com quebra ou colchetes; caixa diferente não é exata", () => {
		expect(marcarTrecho("!radical e radical", "radical", "t-r")).toBe("!radical e [radical](termo:t-r)");
		expect(marcarTrecho("\\radical", "radical", "t-r")).toBeUndefined();
		expect(marcarTrecho("radical", "  ", "t-r")).toBeUndefined();
		expect(marcarTrecho("x".repeat(400), "x".repeat(301), "t-r")).toBeUndefined();
		expect(marcarTrecho("a\nb", "a\nb", "t-r")).toBeUndefined();
		expect(marcarTrecho("[a] b", "[a]", "t-r")).toBeUndefined();
		expect(marcarTrecho("Radical", "radical", "t-r")).toBeUndefined();
		expect(marcarTrecho("o radical", " radical ", "t-r")).toBe("o [radical](termo:t-r)");
	});
});

describe("as marcas nos blocos", () => {
	it("os textos onde a marca vale, na ordem de leitura", () => {
		expect(textosDoBloco(quiz("l1-b1")).map((item) => item.campo)).toEqual(["contexto", "enunciado", "alternativas.0", "alternativas.1", "explicacao"]);
		expect(textosDoBloco(pergunta("l1-b2", "P?")).map((item) => item.campo)).toEqual(["pergunta"]);
		expect(textosDoBloco(dissertativa("l1-b3")).map((item) => item.campo)).toEqual(["enunciado"]);
		expect(textosDoBloco(ideia("l1-b4", "I.")).map((item) => item.campo)).toEqual(["texto"]);
	});

	it("mapearTextosDoBloco desfaz por padrão as marcas dos outros textos (resposta esperada, confusão, rubrica, resposta-modelo)", () => {
		const limpo = mapearTextosDoBloco(dissertativa("l1-b3"), (texto) => texto) as Extract<Bloco, { tipo: "dissertativa" }>;
		expect(limpo.enunciado).toBe("Explique o [radical](termo:t-radical).");
		expect(limpo.rubrica[0]!.criterio).toBe("Radical");
		expect(limpo.respostaModelo).toBe("O radical é…");
		const doQuiz = mapearTextosDoBloco(quiz("l1-b1"), (texto) => texto) as Extract<Bloco, { tipo: "alternativa" }>;
		expect(doQuiz.alternativas[1]!.confusao).toBe("Confunde radical com a palavra.");
		const comPergunta = mapearTextosDoBloco(pergunta("l1-b2", "O [r](termo:t-r)?", "O [r](termo:t-r)."), (texto) => texto) as Extract<Bloco, { tipo: "verificacao" }>;
		expect(comPergunta).toMatchObject({ pergunta: "O [r](termo:t-r)?", respostaEsperada: "O r." });
	});

	it("limparMarcasDoBloco: desconhecidas, repetidas no bloco e fora do lugar viram texto", () => {
		const bloco = quiz("l1-b1", { contexto: "O [radical](termo:t-radical) e o [x](termo:t-x).", enunciado: "Qual é o [radical](termo:t-radical)?" });
		const limpo = limparMarcasDoBloco(bloco, (id) => id === "t-radical");
		expect(limpo).toMatchObject({ desconhecidas: 1, repetidas: 1, foraDoLugar: 1 });
		expect(marcasDoBloco(limpo.bloco).map((marca) => [marca.campo, marca.id])).toEqual([["contexto", "t-radical"]]);
		expect((limpo.bloco as Extract<Bloco, { tipo: "alternativa" }>).enunciado).toBe("Qual é o radical?");
	});

	it("moduloTemMarcas", () => {
		expect(moduloTemMarcas({ licoes: [licao("l1", [explicacao("l1-b1", "Sem marca.")])] })).toBe(false);
		expect(moduloTemMarcas({ licoes: [licao("l1", [explicacao("l1-b1", "O [r](termo:t-r).")])] })).toBe(true);
	});
});

describe("conferirTermosDaLicao (os termos de uma lição gerada)", () => {
	const blocos = () => [
		explicacao("l1-b1", "Introdução sobre palavras.", "introducao"),
		explicacao("l1-b2", "Um [radical](termo:novo-1) é a parte da palavra que sobra. O [lema](termo:t-lema) também."),
		pergunta("l1-b3", "Qual é o [radical](termo:novo-1) de estudar?"),
	];
	const glossario = [termo("t-lema", "lema")];
	const base = { glossario, conceitos: ["c-a"], posicoes: [0, 1, 2], rigido: true };
	const novo = (extra: Record<string, unknown> = {}) => ({ chave: "novo-1", termo: "radical", definicao: "A parte da palavra que sobra.", conceito: "c-a", explicadoEm: 2, ...extra });

	it("um termo bom: os novos com o bloco, as marcas ficam, sem problema", () => {
		const conferido = conferirTermosDaLicao(blocos(), [novo()], base);
		expect(conferido.problemas).toEqual([]);
		expect(conferido.termos.novos).toEqual([{ chave: "novo-1", termo: "radical", definicao: "A parte da palavra que sobra.", conceito: "c-a", bloco: "l1-b2" }]);
		expect(conferido.blocos).toEqual(blocos());
	});

	it("sem termos: nada; as marcas desconhecidas viram texto (conserto, sem problema)", () => {
		const conferido = conferirTermosDaLicao(blocos(), undefined, base);
		expect(conferido.problemas).toEqual([]);
		expect(conferido.termos.consertos[0]).toContain("2 marcas");
		expect(marcasDoBloco(conferido.blocos[1]!).map((marca) => marca.id)).toEqual(["t-lema"]);
		expect((conferido.blocos[2] as Extract<Bloco, { tipo: "verificacao" }>).pergunta).toBe("Qual é o radical de estudar?");
	});

	it("usado antes de explicado é problema (as posições do modelo); sem rigido, as marcas antes viram texto", () => {
		const antes = [explicacao("l1-b1", "Os [radicais](termo:novo-1) aparecem.", "introducao"), ...blocos().slice(1)];
		// O bloco 2 do modelo foi descartado: as posições nas frases são as do modelo.
		expect(conferirTermosDaLicao(antes, [novo({ explicadoEm: 3 })], { ...base, posicoes: [0, undefined, 1, 2] }).problemas).toEqual([
			'O termo "radical" (novo-1) é usado no bloco 1 antes de ser explicado no bloco 3; explique cada termo novo antes da primeira marca dele (ou no mesmo bloco), ou marque-o só a partir do bloco que o explica.',
		]);
		expect(conferirTermosDaLicao(antes, [novo()], base).problemas[0]).toBe(
			'O termo "radical" (novo-1) é usado no bloco 1 antes de ser explicado no bloco 2; explique cada termo novo antes da primeira marca dele (ou no mesmo bloco), ou marque-o só a partir do bloco que o explica.',
		);
		const brando = conferirTermosDaLicao(antes, [novo()], { ...base, rigido: false });
		expect(brando.problemas).toEqual([]);
		expect((brando.blocos[0] as Extract<Bloco, { tipo: "explicacao" }>).texto).toBe("Os radicais aparecem.");
		expect(marcasDoBloco(brando.blocos[1]!).map((marca) => marca.id)).toEqual(["novo-1", "t-lema"]);
		expect(brando.termos.novos).toHaveLength(1);
		expect(brando.termos.consertos.some((frase) => frase.includes("viraram texto"))).toBe(true);
	});

	it("explicadoEm que não é explicação, fora da lição, descartado ou ausente é problema; sem rigido, o termo sai", () => {
		const casos: Array<[Record<string, unknown>, string]> = [
			[{ explicadoEm: 3 }, "que não é uma explicação"],
			[{ explicadoEm: 9 }, "tem explicadoEm 9, e a lição tem 3 blocos"],
			[{ explicadoEm: undefined }, 'está sem "explicadoEm"'],
		];
		for (const [extra, frase] of casos) expect(conferirTermosDaLicao(blocos(), [novo(extra)], base).problemas[0]).toContain(frase);
		expect(conferirTermosDaLicao(blocos(), [novo()], { ...base, posicoes: [0, undefined, 1] }).problemas[0]).toContain("que foi descartado");
		const brando = conferirTermosDaLicao(blocos(), [novo({ explicadoEm: 3 })], { ...base, rigido: false });
		expect(brando.problemas).toEqual([]);
		expect(brando.termos.novos).toEqual([]);
		expect(marcasDoBloco(brando.blocos[1]!).map((marca) => marca.id)).toEqual(["t-lema"]);
	});

	it("os limites do termo e da definição, a chave e o objeto", () => {
		expect(conferirTermosDaLicao(blocos(), [novo({ termo: "x".repeat(81) })], base).problemas[0]).toContain("tem 81 caracteres; o máximo é 80");
		expect(conferirTermosDaLicao(blocos(), [novo({ definicao: "x".repeat(301) })], base).problemas[0]).toContain("definição com 301 caracteres");
		expect(conferirTermosDaLicao(blocos(), [novo({ definicao: "" })], base).problemas[0]).toContain('sem "definicao"');
		expect(conferirTermosDaLicao(blocos(), [novo({ definicao: "```py\nx\n```" })], base).problemas[0]).toContain("bloco de código");
		expect(conferirTermosDaLicao(blocos(), [novo({ chave: "t-lema" })], base).problemas[0]).toContain("chave válida");
		expect(conferirTermosDaLicao(blocos(), [novo(), novo({ termo: "outro" })], base).problemas[0]).toContain("aparece em mais de um item");
		expect(conferirTermosDaLicao(blocos(), ["x"], base).problemas[0]).toContain("não é um objeto");
		expect(conferirTermosDaLicao(blocos(), { a: 1 }, base).problemas[0]).toContain("não é uma lista");
		// O conceito de fora da lição vira null.
		expect(conferirTermosDaLicao(blocos(), [novo({ conceito: "c-z" })], base).termos.novos[0]!.conceito).toBeNull();
	});

	it("um termo novo igual a um do glossário vira o do glossário (reexplicado); dois iguais viram o primeiro", () => {
		const comLema = [explicacao("l1-b1", "Intro.", "introducao"), explicacao("l1-b2", "O [Lema](termo:novo-1) e o [radical](termo:novo-2) e a [raiz](termo:novo-3)."), pergunta("l1-b3", "O [lema](termo:novo-1)?")];
		const conferido = conferirTermosDaLicao(
			comLema,
			[
				{ chave: "novo-1", termo: "Lêma", definicao: "Outra.", explicadoEm: 2 },
				{ chave: "novo-2", termo: "radical", definicao: "A parte.", explicadoEm: 2 },
				{ chave: "novo-3", termo: "Radical", definicao: "Repetido.", explicadoEm: 2 },
			],
			base,
		);
		expect(conferido.problemas).toEqual([]);
		expect(conferido.termos.reexplicados).toEqual([{ id: "t-lema", bloco: "l1-b2" }]);
		expect(conferido.termos.novos.map((item) => item.chave)).toEqual(["novo-2"]);
		// A marca do terceiro aponta para o segundo; as duas no mesmo bloco: fica a primeira.
		expect(marcasDoBloco(conferido.blocos[1]!).map((marca) => marca.id)).toEqual(["t-lema", "novo-2"]);
		expect(marcasDoBloco(conferido.blocos[2]!).map((marca) => marca.id)).toEqual(["t-lema"]);
	});
});

describe("incorporarTermosDaLicao e juntarTermos", () => {
	it("os termos novos ganham id (sem repetir) e entram no glossário; as marcas novo-n viram o id", () => {
		const glossario: Glossario = { versao: 1, termos: [termo("t-radical", "radical antigo")] };
		const daLicao = licao("l2", [explicacao("l2-b1", "Um [radical](termo:novo-1) e um [x](termo:novo-9).")]);
		const feito = incorporarTermosDaLicao(glossario, daLicao, [{ chave: "novo-1", termo: "Radical", definicao: "A parte.", conceito: "c-a", bloco: "l2-b1" }], { modulo: "m1", agora: AGORA });
		expect(feito.ids).toEqual({ "novo-1": "t-radical-2" });
		expect(feito.glossario.termos[1]).toEqual({
			id: "t-radical-2",
			termo: "Radical",
			definicao: "A parte.",
			conceito: "c-a",
			explicado: { modulo: "m1", licao: "l2", bloco: "l2-b1" },
			origem: "geracao",
			criadoEm: AGORA.toISOString(),
			alteradoEm: AGORA.toISOString(),
		});
		// A marca novo-9, sem termo, vira texto.
		expect((feito.licao.blocos[0] as Extract<Bloco, { tipo: "explicacao" }>).texto).toBe("Um [radical](termo:t-radical-2) e um x.");
		expect(glossario.termos).toHaveLength(1);
	});

	it("juntarTermos: um igual no disco vira o do disco; um id ocupado ganha outro; os explicados de novo pela regra", () => {
		const disco: Glossario = {
			versao: 1,
			termos: [
				termo("t-lema", "lema"),
				termo("t-a", "outro a"),
				termo("t-velho", "velho", { explicado: { modulo: "m1", licao: "l1", bloco: "l1-b9" } }),
				termo("t-fixo", "fixo", { explicado: { modulo: "m2", licao: "l1", bloco: "l1-b1" } }),
				termo("t-sumiu", "sumiu", { explicado: { modulo: "m2", licao: "l1", bloco: "l1-b7" } }),
			],
		};
		const lugar = { modulo: "m1", licao: "l1", bloco: "l1-b2" };
		const juntado = juntarTermos(
			disco,
			{
				novos: [termo("t-lema-2", "Lema", { explicado: lugar }), termo("t-a", "a"), termo("t-novo", "novo", { explicado: lugar })],
				reexplicados: [
					{ id: "t-velho", explicado: lugar },
					{ id: "t-fixo", explicado: lugar },
					{ id: "t-sumiu", explicado: lugar },
					{ id: "t-novo", explicado: { ...lugar, bloco: "l1-b5" } },
				],
			},
			{ agora: DEPOIS, moduloRegerado: "m1", blocoExiste: (onde) => onde.bloco !== "l1-b7" },
		);
		expect(juntado.trocas).toEqual({ "t-lema-2": "t-lema", "t-a": "t-a-2" });
		expect(juntado.acrescentados).toEqual(["t-a-2", "t-novo"]);
		const de = (id: string) => juntado.glossario.termos.find((item) => item.id === id)!;
		// O igual no disco sem explicado ganha o lugar novo.
		expect(de("t-lema").explicado).toEqual(lugar);
		// O do módulo regerado e o que apontava para um bloco que sumiu mudam; o que vale em outro módulo fica.
		expect(de("t-velho")).toMatchObject({ explicado: lugar, alteradoEm: DEPOIS.toISOString() });
		expect(de("t-sumiu").explicado).toEqual(lugar);
		expect(de("t-fixo").explicado).toEqual({ modulo: "m2", licao: "l1", bloco: "l1-b1" });
		// Um termo que entrou agora não é trocado por um explicado de novo.
		expect(de("t-novo").explicado).toEqual(lugar);
		expect(disco.termos).toHaveLength(5);
	});
});

describe("o glossário nas mensagens", () => {
	it("os termos dos conceitos da chamada primeiro, até o limite, na ordem do glossário", () => {
		const termos = [termo("t-a", "a"), termo("t-b", "b", { conceito: "c-b" }), termo("t-c", "c"), termo("t-d", "d", { conceito: "c-b" })];
		const tamanho = linhaDoGlossario(termos[0]!).length + 1;
		expect(termosParaMensagem(termos, ["c-b"], tamanho * 3).map((item) => item.id)).toEqual(["t-a", "t-b", "t-d"]);
		expect(termosParaMensagem(termos, [], tamanho * 2).map((item) => item.id)).toEqual(["t-a", "t-b"]);
		expect(termosParaMensagem(termos, [], 0)).toEqual([]);
	});
});

describe("o lugar que vale e o glossário na tela", () => {
	const m1 = modulo("m1", [licao("l1", [explicacao("l1-b1", "x")]), licao("l2", [explicacao("l2-b1", "y")])], {
		explicacoes: [{ id: "x-1", licao: "l2", bloco: "l2-b1", versao: 1, trecho: "y", tipo: "nao_sei", em: AGORA.toISOString(), explicacao: "Expl." }],
	});

	it("explicadoQueVale: o bloco precisa existir (e o pedido, com a explicação)", () => {
		const modulos = { m1 };
		expect(explicadoQueVale({ modulo: "m1", licao: "l2", bloco: "l2-b1" }, modulos)).toEqual({ modulo: "m1", licao: "l2", bloco: "l2-b1" });
		expect(explicadoQueVale({ modulo: "m1", licao: "l2", bloco: "l2-b9" }, modulos)).toBeNull();
		expect(explicadoQueVale({ modulo: "m1", licao: "l9", bloco: "l2-b1" }, modulos)).toBeNull();
		expect(explicadoQueVale({ modulo: "m2", licao: "l1", bloco: "l1-b1" }, modulos)).toBeNull();
		expect(explicadoQueVale({ modulo: "m1", licao: "l2", bloco: "l2-b1", explicacao: "x-1" }, modulos)).not.toBeNull();
		expect(explicadoQueVale({ modulo: "m1", licao: "l2", bloco: "l2-b1", explicacao: "x-2" }, modulos)).toBeNull();
		expect(explicadoQueVale(null, modulos)).toBeNull();
		expect(explicadoQueVale({ modulo: "m1", licao: "l1", bloco: "l1-b1" }, { m1: { situacao: "aguardando_material", licoes: [] } })).toBeNull();
	});

	it("glossarioNaTela: o lugar com o número e o título do módulo e da lição; null quando não vale", () => {
		const glossario = { termos: [termo("t-a", "a", { explicado: { modulo: "m1", licao: "l2", bloco: "l2-b1" } }), termo("t-b", "b"), termo("t-c", "c", { explicado: { modulo: "m1", licao: "l2", bloco: "l2-b7" } })] };
		const naTela = glossarioNaTela(glossario, { esqueleto: [{ id: "m0", nome: "Antes" }, { id: "m1", nome: "Pesos" }], modulos: { m1 } });
		expect(naTela[0]!.lugar).toEqual({ modulo: "m1", licao: "l2", bloco: "l2-b1", numeroModulo: 2, tituloModulo: "Pesos", numeroLicao: 2, tituloLicao: "Lição l2" });
		expect(naTela[1]!.lugar).toBeNull();
		expect(naTela[2]!.lugar).toBeNull();
		expect(naTela[2]!.explicado).toEqual({ modulo: "m1", licao: "l2", bloco: "l2-b7" });
		expect(glossarioNaTela(glossario, { esqueleto: [], modulos: { m1 } })[0]!.lugar).toBeNull();
	});
});

describe("Marcar os termos num módulo já gerado", () => {
	const m1 = () =>
		modulo("m1", [
			licao("l1", [explicacao("l1-b1", "O radical é a parte da palavra que sobra."), explicacao("l1-b2", "O lema vem do dicionário.")]),
			licao("l2", [explicacao("l2-b1", "Stemming leva palavras aos radicais. `radicais` no código."), quiz("l2-b2", { contexto: "Os radicais e o lema.", alternativas: [{ texto: "estud", correta: true }, { texto: "lema", confusao: "c" }] }), pergunta("l2-b3", "E o lema?")]),
		]);
	const glossario = [termo("t-lema", "lema")];

	it("lerTermosMarcados: confere cada item; sem a lista, erro", () => {
		const lido = lerTermosMarcados(
			{
				termos: [
					{ bloco: "l2-b1", trecho: "radicais", id: null, termo: "radical", definicao: "A parte que sobra.", explicadoEm: "l1-b1" },
					{ bloco: "l2-b2", trecho: "lema", id: "t-lema", explicadoEm: "l2-b2" },
					{ bloco: "l2-b3", trecho: "lema", id: "t-x", termo: "Lêma", definicao: "Outro." },
					{ bloco: "l1-b1", trecho: "radical", id: null, termo: "radical", definicao: "x" },
					{ bloco: "l2-b1", trecho: "", id: "t-lema" },
					{ bloco: "l2-b1", trecho: "radicais", termo: "Radical", definicao: "Repetido." },
					{ bloco: "l2-b2", trecho: "radicais", termo: "y".repeat(81), definicao: "x" },
					{ bloco: "l2-b2", trecho: "sem termo" },
					"x",
				],
			},
			{ licao: m1().licoes[1]!, modulo: m1(), glossario },
		);
		expect(lido.termos).toEqual([
			{ bloco: "l2-b1", trecho: "radicais", id: null, termo: "radical", definicao: "A parte que sobra.", explicadoEm: "l1-b1" },
			// Um explicadoEm que não é explicação vira null.
			{ bloco: "l2-b2", trecho: "lema", id: "t-lema", termo: "lema", definicao: "", explicadoEm: null },
			// Um id desconhecido com um termo igual ao do glossário vira o do glossário.
			{ bloco: "l2-b3", trecho: "lema", id: "t-lema", termo: "lema", definicao: "", explicadoEm: null },
		]);
		expect(lido.descartes).toHaveLength(6);
		expect(() => lerTermosMarcados({}, { licao: m1().licoes[1]!, modulo: m1(), glossario })).toThrow('lista "termos"');
	});

	it("incorporarTermosMarcados e aplicarMarcas: os termos novos entram (com o explicado), as marcas na primeira ocorrência fora de código", () => {
		const incorporado = incorporarTermosMarcados(
			{ versao: 1, termos: glossario },
			[
				{ bloco: "l2-b1", trecho: "radicais", id: null, termo: "radical", definicao: "A parte.", explicadoEm: null },
				{ bloco: "l2-b2", trecho: "radicais", id: null, termo: "Radical", definicao: "A parte.", explicadoEm: "l1-b1" },
				{ bloco: "l2-b2", trecho: "lema", id: "t-lema", termo: "lema", definicao: "", explicadoEm: "l1-b2" },
				{ bloco: "l2-b3", trecho: "inexistente", id: "t-lema", termo: "lema", definicao: "", explicadoEm: null },
			],
			{ modulo: m1(), agora: AGORA },
		);
		expect(incorporado.novos).toEqual([
			{ id: "t-radical", termo: "radical", definicao: "A parte.", explicado: { modulo: "m1", licao: "l1", bloco: "l1-b1" }, origem: "anotacao", criadoEm: AGORA.toISOString(), alteradoEm: AGORA.toISOString() },
		]);
		expect(incorporado.glossario.termos.map((item) => item.id)).toEqual(["t-lema", "t-radical"]);
		expect(incorporado.reexplicados).toEqual([{ id: "t-lema", explicado: { modulo: "m1", licao: "l1", bloco: "l1-b2" } }]);
		const { modulo: marcado, aplicadas } = aplicarMarcas(m1(), incorporado.marcas, { "l2-b1": 1, "l2-b2": 1, "l2-b3": 1 });
		expect(aplicadas.map((item) => [item.bloco, item.id])).toEqual([
			["l2-b1", "t-radical"],
			["l2-b2", "t-radical"],
			["l2-b2", "t-lema"],
		]);
		const blocos = marcado.licoes[1]!.blocos;
		expect((blocos[0] as Extract<Bloco, { tipo: "explicacao" }>).texto).toBe("Stemming leva palavras aos [radicais](termo:t-radical). `radicais` no código.");
		expect((blocos[1] as Extract<Bloco, { tipo: "alternativa" }>).contexto).toBe("Os [radicais](termo:t-radical) e o [lema](termo:t-lema).");
		// O texto de outros campos do quiz não muda (a alternativa "lema" fica sem marca: uma por termo no bloco).
		expect((blocos[1] as Extract<Bloco, { tipo: "alternativa" }>).alternativas[1]!.texto).toBe("lema");
		// Rodar de novo só acrescenta: o que já está marcado fica, e não ganha outra marca.
		const deNovo = aplicarMarcas(marcado, incorporado.marcas);
		expect(deNovo.aplicadas).toEqual([]);
		expect(deNovo.modulo).toEqual(marcado);
	});

	it("aplicarMarcas: um bloco que mudou de versão desde a leitura fica de fora", () => {
		const atual = m1();
		(atual.licoes[1]!.blocos[0] as Bloco).versao = 2;
		const { aplicadas } = aplicarMarcas(atual, [{ bloco: "l2-b1", trecho: "radicais", id: "t-r" }], { "l2-b1": 1 });
		expect(aplicadas).toEqual([]);
		expect(aplicarMarcas(atual, [{ bloco: "l9-b1", trecho: "x", id: "t-r" }]).aplicadas).toEqual([]);
	});
});

describe("os pedidos de explicação", () => {
	const m1 = () => modulo("m1", [licao("l1", [explicacao("l1-b1", "Primeira."), pergunta("l1-b2", "P?"), explicacao("l1-b3", "Os radicais."), quiz("l1-b4")])]);

	it("validarPedidoExplicacao: lição, bloco, trecho de 1 a 300 (os espaços juntados) e o tipo", () => {
		expect(validarPedidoExplicacao({ licao: "l1", bloco: "l1-b3", trecho: "  os\n radicais ", tipo: "nao_sei" })).toEqual({ licao: "l1", bloco: "l1-b3", trecho: "os radicais", tipo: "nao_sei" });
		expect(() => validarPedidoExplicacao({ bloco: "l1-b3", trecho: "a", tipo: "nao_sei" })).toThrow("lição");
		expect(() => validarPedidoExplicacao({ licao: "l1", trecho: "a", tipo: "nao_sei" })).toThrow("bloco");
		expect(() => validarPedidoExplicacao({ licao: "l1", bloco: "b", tipo: "nao_sei" })).toThrow("trecho");
		expect(() => validarPedidoExplicacao({ licao: "l1", bloco: "b", trecho: "  ", tipo: "nao_sei" })).toThrow("vazio");
		expect(() => validarPedidoExplicacao({ licao: "l1", bloco: "b", trecho: "x".repeat(301), tipo: "nao_sei" })).toThrow("301");
		expect(() => validarPedidoExplicacao({ licao: "l1", bloco: "b", trecho: "x", tipo: "outro" })).toThrow("nao_sei ou explique_melhor");
		expect(() => validarPedidoExplicacao(null)).toThrow();
		expect([trechoValido("a"), trechoValido(" "), trechoValido("x".repeat(301)), trechoValido(3)]).toEqual([true, false, false, false]);
	});

	it("validarRespostaExplicacao: a explicação (sem marcas, até o máximo) e o termo (só no nao_sei)", () => {
		expect(validarRespostaExplicacao({ explicacao: " Um [radical](termo:t-r) é… ", termo: { termo: " radical ", definicao: "A parte." } }, "nao_sei")).toEqual({
			explicacao: "Um radical é…",
			termo: { termo: "radical", definicao: "A parte." },
		});
		expect(validarRespostaExplicacao({ explicacao: "Outro jeito.", termo: { termo: "x", definicao: "y" } }, "explique_melhor").termo).toBeNull();
		expect(validarRespostaExplicacao({ explicacao: "E.", termo: null }, "nao_sei").termo).toBeNull();
		expect(() => validarRespostaExplicacao({ explicacao: "" }, "nao_sei")).toThrow("explicacao");
		expect(() => validarRespostaExplicacao({ explicacao: "x".repeat(2501) }, "nao_sei")).toThrow("2501");
		expect(() => validarRespostaExplicacao({ explicacao: "E.", termo: { termo: "x", definicao: "y".repeat(301) } }, "nao_sei")).toThrow("301");
		expect(validarRespostaExplicacao({ explicacao: "E.", termo: { termo: "x", definicao: "y".repeat(301) } }, "nao_sei", false).termo).toBeNull();
		expect(() => validarRespostaExplicacao([], "nao_sei")).toThrow();
	});

	it("explicacoesAteOBloco: as explicações antes do bloco, as mais próximas primeiro até o limite, na ordem da lição", () => {
		const daLicao = m1().licoes[0]!;
		expect(explicacoesAteOBloco(daLicao, "l1-b4")).toEqual(["Primeira.", "Os radicais."]);
		expect(explicacoesAteOBloco(daLicao, "l1-b4", 15)).toEqual(["Os radicais."]);
		expect(explicacoesAteOBloco(daLicao, "l1-b4", 5)).toEqual(["[…] cais."]);
		expect(explicacoesAteOBloco(daLicao, "l1-b1")).toEqual([]);
	});

	it("pedir, responder, falhar e a situação na tela", () => {
		const pedido = { licao: "l1", bloco: "l1-b3", trecho: "radicais", tipo: "nao_sei" as const };
		const comPedido = aplicarPedidoExplicacao(m1(), pedido, { id: "x-1", agora: AGORA });
		expect(comPedido.explicacoes).toEqual([{ id: "x-1", licao: "l1", bloco: "l1-b3", versao: 1, trecho: "radicais", tipo: "nao_sei", em: AGORA.toISOString() }]);
		expect(situacaoDaExplicacao(comPedido.explicacoes![0]!, ["x-1"])).toBe("explicando");
		expect(situacaoDaExplicacao(comPedido.explicacoes![0]!, [])).toBe("falhou");
		// Um pedido novo tira os que ficaram sem explicação e não estão em andamento.
		const dois = aplicarPedidoExplicacao(comPedido, { ...pedido, tipo: "explique_melhor" }, { id: "x-2", agora: DEPOIS });
		expect(dois.explicacoes!.map((item) => item.id)).toEqual(["x-2"]);
		const emAndamento = aplicarPedidoExplicacao(comPedido, pedido, { id: "x-2", agora: DEPOIS, emAndamento: new Set(["x-1"]) });
		expect(emAndamento.explicacoes!.map((item) => item.id)).toEqual(["x-1", "x-2"]);
		const respondido = aplicarRespostaExplicacao(emAndamento, "x-1", { explicacao: "E.", termo: { termo: "radical", definicao: "A parte." }, evento: "ev-1", modelo: "teste/modelo-x", custo: 0.01 })!;
		expect(respondido.explicacoes![0]).toMatchObject({ explicacao: "E.", termo: { termo: "radical" }, evento: "ev-1", modelo: "teste/modelo-x", custo: 0.01 });
		expect(situacaoDaExplicacao(respondido.explicacoes![0]!, [])).toBe("pronta");
		expect(aplicarRespostaExplicacao(respondido, "x-1", { explicacao: "De novo.", termo: null, evento: "e", modelo: "m", custo: 0 })).toBeUndefined();
		expect(aplicarRespostaExplicacao(respondido, "x-9", { explicacao: "E.", termo: null, evento: "e", modelo: "m", custo: 0 })).toBeUndefined();
		expect(explicacoesDoBloco(respondido, "l1-b3").map((item) => item.id)).toEqual(["x-1", "x-2"]);
		expect(explicacoesDoBloco(respondido, "l1-b1")).toEqual([]);
		expect(tirarPedidoPendente(respondido, "x-1")).toBeUndefined();
		expect(tirarPedidoPendente(respondido, "x-2")!.explicacoes!.map((item) => item.id)).toEqual(["x-1"]);
		expect(tirarPedidoPendente(comPedido, "x-1")!.explicacoes).toBeUndefined();
		expect(() => aplicarPedidoExplicacao(m1(), { ...pedido, bloco: "l1-b9" }, { id: "x", agora: AGORA })).toThrow("l1-b9");
		expect(() => aplicarPedidoExplicacao(m1(), { ...pedido, licao: "l9" }, { id: "x", agora: AGORA })).toThrow("l9");
		expect(m1().explicacoes).toBeUndefined();
	});

	it("aplicarTermoGuardado: o termo novo entra com origem pedido e a marca no bloco; um que já existe só liga; duas vezes é erro", () => {
		const pedido: ExplicacaoPedida = { id: "x-1", licao: "l1", bloco: "l1-b3", versao: 1, trecho: "radicais", tipo: "nao_sei", em: AGORA.toISOString(), explicacao: "E.", termo: { termo: "radical", definicao: "A parte." } };
		const atual = { ...m1(), explicacoes: [pedido] };
		const guardado = aplicarTermoGuardado(atual, glossarioVazio(), "x-1", DEPOIS);
		expect(guardado.novo).toBe(true);
		expect(guardado.marcado).toBe(true);
		expect(guardado.termo).toEqual({
			id: "t-radical",
			termo: "radical",
			definicao: "A parte.",
			explicado: { modulo: "m1", licao: "l1", bloco: "l1-b3", explicacao: "x-1" },
			origem: "pedido",
			criadoEm: DEPOIS.toISOString(),
			alteradoEm: DEPOIS.toISOString(),
		});
		expect((guardado.modulo.licoes[0]!.blocos[2] as Extract<Bloco, { tipo: "explicacao" }>).texto).toBe("Os [radicais](termo:t-radical).");
		expect(guardado.modulo.explicacoes![0]!.guardado).toBe("t-radical");
		expect(() => aplicarTermoGuardado(guardado.modulo, guardado.glossario, "x-1", DEPOIS)).toThrow("já foi guardado");

		const existente = aplicarTermoGuardado(atual, { versao: 1, termos: [termo("t-rad", "Radical")] }, "x-1", DEPOIS);
		expect(existente).toMatchObject({ novo: false, termo: { id: "t-rad" } });
		expect(existente.glossario.termos).toHaveLength(1);
		expect(existente.modulo.explicacoes![0]!.guardado).toBe("t-rad");

		expect(() => aplicarTermoGuardado(atual, glossarioVazio(), "x-9", DEPOIS)).toThrow("x-9");
		expect(() => aplicarTermoGuardado({ ...m1(), explicacoes: [{ ...pedido, explicacao: undefined }] }, glossarioVazio(), "x-1", DEPOIS)).toThrow("ainda não chegou");
		expect(() => aplicarTermoGuardado({ ...m1(), explicacoes: [{ ...pedido, termo: null }] }, glossarioVazio(), "x-1", DEPOIS)).toThrow("não tem termo");
	});
});
