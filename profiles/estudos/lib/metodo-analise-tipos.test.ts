// Testes da análise de um módulo concluído, o relatório da versão 2
// (docs/metodo-experimentos.md): a conferência do que o modelo devolve (os
// limites de manter e descartar pelos módulos testados, as vagas e o que vai
// para depois, a reescrita ocupando a vaga, os aprendizados duplicados, as
// revisões com id inexistente), o relatório gravado e lido de volta, e a
// leitura das duas versões.

import { describe, expect, it } from "vitest";
import {
	conferirQuePodeGerarDeNovo,
	type ExperimentoEmTeste,
	FRASE_JA_APLICADA,
	foiAplicada,
	idsCitadosNaAnalise,
	MAXIMO_EXPERIMENTOS,
	type ModuloTestado,
	novoRelatorio,
	PORQUE_NAO_DECIDIU,
	relatorioLido,
	relatorioNaOrdem,
	relatorioV2Lido,
	validarAnaliseDoModelo,
} from "./metodo-analise-tipos.ts";
import { ErroMetodo } from "./metodo-ciclo-tipos.ts";
import { compararComHistorico, placarDoModulo } from "./metodo-placar-tipos.ts";

const IDS = ["ev-a", "ev-b", "ev-c"];
const testado = (modulo: string, atual = false): ModuloTestado => ({ materia: "mat", curso: "curso-a", modulo, moduloNome: `Módulo ${modulo}`, atual });
const experimento = (arquivo: ExperimentoEmTeste["arquivo"], id: string, texto: string, ...modulos: ModuloTestado[]): ExperimentoEmTeste => ({ arquivo, id, texto, comecouEm: "2026-11-03", testadoEm: modulos });

const EXP_DISSERTATIVA = experimento("dissertativa.md", "a-1", "Confira a rubrica antes de entregar.", testado("m2"), testado("m3", true));
const EXP_EXEMPLOS = experimento("exemplos.md", "a-2", "Diga antes o que o exemplo vai mostrar.", testado("m3", true));
const EM_TESTE = [EXP_DISSERTATIVA, EXP_EXEMPLOS];

const proposta = (extra: Record<string, unknown> = {}) => ({ arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "Os quizzes foram fáceis.", evidencias: ["ev-a", "ev-b"], ...extra });
const base = (extra: Record<string, unknown> = {}) => ({ resumo: "R", funcionou: [], problemas: [], propostas: [], ...extra });
const decisao = (ajuste: string, decisao: string, extra: Record<string, unknown> = {}) => ({ ajuste, decisao, porque: "Subiu de 2 para 3,5.", ...extra });

const validar = (valor: unknown, extra: Partial<Parameters<typeof validarAnaliseDoModelo>[1]> = {}) => validarAnaliseDoModelo(valor, { evidencias: IDS, emTeste: EM_TESTE, ...extra });

describe("o formato (validarAnaliseDoModelo)", () => {
	it("fora do formato é ErroMetodo (a extensão tenta de novo)", () => {
		expect(() => validar([])).toThrow(ErroMetodo);
		expect(() => validar({ resumo: " ", funcionou: [], problemas: [], propostas: [] })).toThrow(/resumo/);
		expect(() => validar({ resumo: "R", problemas: [], propostas: [] })).toThrow(/funcionou/);
		expect(() => validar({ resumo: "R", funcionou: [], problemas: [], propostas: {} })).toThrow(/propostas/);
		expect(() => validar(base({ experimentos: {} }))).toThrow(/"experimentos" não é uma lista/);
		expect(() => validar(base({ aprendizados: "x" }))).toThrow(/"aprendizados"/);
		expect(() => validar(base({ revisoes: 3 }))).toThrow(/"revisoes"/);
	});

	it("as listas novas são opcionais; o resumo e os itens são conferidos como antes", () => {
		const { analise, consertos } = validar({
			resumo: "  O módulo foi bem.  ",
			funcionou: [{ texto: "Os exemplos.", evidencias: ["ev-a", "ev-x"] }, { texto: "Sem evidência.", evidencias: ["ev-y"] }, { texto: "" }, "solto"],
			problemas: [{ texto: "Longos.", evidencias: ["ev-b", "ev-b"] }],
			propostas: [],
		});
		expect(analise.resumo).toBe("O módulo foi bem.");
		expect(analise.funcionou).toEqual([{ texto: "Os exemplos.", evidencias: ["ev-a"] }]);
		expect(analise.problemas).toEqual([{ texto: "Longos.", evidencias: ["ev-b"] }]);
		expect(consertos).toEqual(
			expect.arrayContaining([expect.stringMatching(/^O que funcionou, item 1: o id "ev-x"/), expect.stringMatching(/^O que funcionou, item 2: sem nenhum evento/), expect.stringMatching(/^O que funcionou, item 3: sem texto/)]),
		);
		expect(validar({ ...base(), resumo: "r".repeat(1600) }).analise.resumo).toHaveLength(1500);
	});
});

describe("os experimentos em teste", () => {
	it("um que ficou de fora recebe continuar, com o porquê 'A análise não decidiu sobre ele.'; um item por experimento, na ordem", () => {
		const { analise } = validar(base());
		expect(analise.experimentos).toHaveLength(2);
		expect(analise.experimentos.map((item) => [item.ajuste, item.decisao, item.porque])).toEqual([
			["dissertativa.md#a-1", "continuar", PORQUE_NAO_DECIDIU],
			["exemplos.md#a-2", "continuar", PORQUE_NAO_DECIDIU],
		]);
		expect(PORQUE_NAO_DECIDIU).toBe("A análise não decidiu sobre ele.");
		expect(analise.experimentos[0]).toMatchObject({ arquivo: "dissertativa.md", texto: EXP_DISSERTATIVA.texto, modulosTestados: 2, testadoEm: [testado("m2"), testado("m3", true)] });
		expect(analise.experimentos[1]!.conserto).toBeUndefined();
	});

	it("manter exige 2 módulos testados (contando o atual); com 2 vale, com 1 vira continuar com a frase do conserto", () => {
		const { analise, consertos } = validar(base({ experimentos: [decisao("dissertativa.md#a-1", "manter"), decisao("exemplos.md#a-2", "manter")] }));
		expect(analise.experimentos[0]).toMatchObject({ decisao: "manter", porque: "Subiu de 2 para 3,5.", modulosTestados: 2 });
		expect(analise.experimentos[0]!.conserto).toBeUndefined();
		expect(analise.experimentos[1]).toMatchObject({ decisao: "continuar", porque: "Subiu de 2 para 3,5.", modulosTestados: 1, conserto: expect.stringMatching(/só valeu em 1 módulo \(o mínimo é 2\); continua em teste/) });
		expect(consertos).toEqual([expect.stringMatching(/^exemplos\.md#a-2: a análise pediu manter/)]);
	});

	it("descartar e reescrever exigem pelo menos 1 módulo; com 0 viram continuar", () => {
		const sem = experimento("quiz.md", "a-3", "Use distratores plausíveis.");
		const { analise } = validar(
			base({ experimentos: [decisao("quiz.md#a-3", "descartar"), decisao("exemplos.md#a-2", "descartar"), decisao("dissertativa.md#a-1", "reescrever", { texto: "Releia a rubrica e confira cada critério antes de entregar." })] }),
			{ emTeste: [sem, EXP_EXEMPLOS, EXP_DISSERTATIVA] },
		);
		expect(analise.experimentos.map((item) => [item.ajuste, item.decisao])).toEqual([
			["quiz.md#a-3", "continuar"],
			["exemplos.md#a-2", "descartar"],
			["dissertativa.md#a-1", "reescrever"],
		]);
		expect(analise.experimentos[0]!.conserto).toMatch(/ainda não valeu em nenhum módulo concluído/);
		expect(analise.experimentos[2]).toMatchObject({ textoNovo: "Releia a rubrica e confira cada critério antes de entregar.", porque: "Subiu de 2 para 3,5." });
		const reescrita = validar(base({ experimentos: [decisao("quiz.md#a-3", "reescrever", { texto: "Texto novo." })] }), { emTeste: [sem] });
		expect(reescrita.analise.experimentos[0]).toMatchObject({ decisao: "continuar", conserto: expect.stringContaining("ainda não valeu") });
	});

	it("reescrever exige um texto novo válido, de até 400 caracteres, diferente do atual e de outro ajuste que vale do arquivo", () => {
		const casos: Array<[Record<string, unknown>, RegExp]> = [
			[{}, /não tem um texto novo que valha/],
			[{ texto: "x".repeat(401) }, /400/],
			[{ texto: "## Título" }, /não pode ter uma linha/],
			[{ texto: "  CONFIRA a rubrica antes de entregar.  " }, /igual ao atual/],
			[{ texto: "Já existe outro." }, /igual a outro ajuste que vale/],
		];
		for (const [extra, frase] of casos) {
			const { analise } = validar(base({ experimentos: [decisao("dissertativa.md#a-1", "reescrever", extra)] }), { vigentes: { "dissertativa.md": [EXP_DISSERTATIVA.texto, "Já existe outro."] } });
			expect(analise.experimentos[0]).toMatchObject({ decisao: "continuar", conserto: expect.stringMatching(frase) });
			expect(analise.experimentos[0]!.textoNovo).toBeUndefined();
		}
	});

	it("só vale um experimento em teste, uma decisão por experimento; decisão ou porquê inválido sai; o porquê é cortado em 400", () => {
		const { analise, consertos } = validar(
			base({
				experimentos: [
					decisao("quiz.md#a-9", "manter"),
					decisao("dissertativa.md#a-1", "talvez"),
					decisao("dissertativa.md#a-1", "continuar", { porque: "" }),
					decisao("dissertativa.md#a-1", "descartar", { porque: "p".repeat(500) }),
					decisao("dissertativa.md#a-1", "manter"),
					"solto",
					decisao("exemplos.md#a-2", "continuar"),
				],
			}),
		);
		expect(analise.experimentos[0]).toMatchObject({ decisao: "descartar" });
		expect(analise.experimentos[0]!.porque).toHaveLength(400);
		expect(analise.experimentos[0]!.porque.endsWith("…")).toBe(true);
		expect(analise.experimentos[1]).toMatchObject({ decisao: "continuar", porque: "Subiu de 2 para 3,5." });
		expect(consertos).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^Experimento 1: "quiz.md#a-9" não é um experimento em teste/),
				expect.stringMatching(/^Experimento 2: a decisão "talvez"/),
				expect.stringMatching(/^Experimento 3: sem o porquê/),
				expect.stringMatching(/^Experimento 4: o porquê passava de 400/),
				expect.stringMatching(/^Experimento 5: mais de uma decisão para dissertativa.md#a-1/),
				expect.stringMatching(/^Experimento 6: não é um objeto/),
			]),
		);
	});

	it("o ajuste pode vir como metodo/Dissertativa#a-1 (o arquivo é normalizado)", () => {
		const { analise } = validar(base({ experimentos: [decisao(" metodo/Dissertativa#a-1 ", "descartar")] }));
		expect(analise.experimentos[0]).toMatchObject({ ajuste: "dissertativa.md#a-1", decisao: "descartar" });
	});
});

describe("as propostas e as vagas", () => {
	it("sem nenhum em teste há 2 vagas: entram as duas primeiras, com ids p1 e p2, e as outras vão para depois", () => {
		const { analise, consertos } = validar(base({ propostas: [proposta(), proposta({ arquivo: "conceito.md", ajuste: "B." }), proposta({ arquivo: "termos.md", ajuste: "C." }), proposta({ arquivo: "pergunta.md", ajuste: "D." })] }), { emTeste: [] });
		expect(analise.propostas.map((item) => [item.id, item.arquivo])).toEqual([
			["p1", "quiz.md"],
			["p2", "conceito.md"],
		]);
		expect(analise.paraDepois.map((item) => [item.arquivo, item.ajuste])).toEqual([
			["termos.md", "C."],
			["pergunta.md", "D."],
		]);
		expect(analise.paraDepois[0]).toEqual({ arquivo: "termos.md", ajuste: "C.", porque: "Os quizzes foram fáceis.", evidencias: ["ev-a", "ev-b"] });
		expect(consertos).toEqual([expect.stringMatching(/2 propostas ficaram para depois: só há 2 vagas|2 propostas ficaram para depois/)]);
		expect(MAXIMO_EXPERIMENTOS).toBe(2);
	});

	it("com 2 em teste que continuam, não há vaga: todas vão para depois", () => {
		const { analise } = validar(base({ propostas: [proposta()] }));
		expect(analise.propostas).toEqual([]);
		expect(analise.paraDepois).toHaveLength(1);
	});

	it("manter ou descartar libera a vaga do experimento; reescrever ocupa a dele", () => {
		const liberando = validar(base({ experimentos: [decisao("dissertativa.md#a-1", "manter")], propostas: [proposta(), proposta({ arquivo: "conceito.md", ajuste: "B." })] }));
		expect(liberando.analise.propostas.map((item) => item.id)).toEqual(["p1"]);
		expect(liberando.analise.paraDepois).toHaveLength(1);
		const liberando2 = validar(base({ experimentos: [decisao("dissertativa.md#a-1", "manter"), decisao("exemplos.md#a-2", "descartar")], propostas: [proposta(), proposta({ arquivo: "conceito.md", ajuste: "B." })] }));
		expect(liberando2.analise.propostas).toHaveLength(2);
		expect(liberando2.analise.paraDepois).toHaveLength(0);
		const reescrevendo = validar(base({ experimentos: [decisao("dissertativa.md#a-1", "reescrever", { texto: "Texto novo e melhor." }), decisao("exemplos.md#a-2", "descartar")], propostas: [proposta(), proposta({ arquivo: "conceito.md", ajuste: "B." })] }));
		expect(reescrevendo.analise.experimentos[0]).toMatchObject({ decisao: "reescrever", textoNovo: "Texto novo e melhor." });
		expect(reescrevendo.analise.propostas.map((item) => item.id)).toEqual(["p1"]);
		expect(reescrevendo.analise.paraDepois).toHaveLength(1);
		// Uma decisão que virou continuar por conserto continua ocupando a vaga.
		const vencida = validar(base({ experimentos: [decisao("exemplos.md#a-2", "manter"), decisao("dissertativa.md#a-1", "manter")], propostas: [proposta(), proposta({ arquivo: "conceito.md", ajuste: "B." })] }));
		expect(vencida.analise.propostas).toHaveLength(1);
	});

	it("as regras de antes: arquivo válido, até 400 e 300 caracteres, 2 eventos, igual a um que vale, a um descartado, à reescrita e a outra proposta saem", () => {
		const { analise, consertos } = validar(
			base({
				propostas: [
					proposta({ arquivo: "outro.md" }),
					proposta({ ajuste: "" }),
					proposta({ ajuste: "x".repeat(401) }),
					proposta({ ajuste: "## Título" }),
					proposta({ porque: "" }),
					proposta({ evidencias: ["ev-a", "ev-z"] }),
					proposta({ arquivo: "exemplos.md", ajuste: "DIGA antes o que o exemplo vai mostrar." }),
					proposta({ arquivo: "exemplos.md", ajuste: "Um descartado." }),
					proposta({ arquivo: "dissertativa.md", ajuste: "Texto novo e melhor." }),
					proposta({ porque: "p".repeat(400), ajuste: "Longa" }),
					proposta({ ajuste: "Longa." }),
					7,
				],
				experimentos: [decisao("dissertativa.md#a-1", "reescrever", { texto: "Texto novo e melhor." }), decisao("exemplos.md#a-2", "descartar")],
			}),
			{ vigentes: { "exemplos.md": [EXP_EXEMPLOS.texto] }, descartados: { "exemplos.md": ["um descartado."] } },
		);
		expect(analise.propostas.map((item) => item.ajuste)).toEqual(["Longa"]);
		expect(analise.propostas[0]!.porque).toHaveLength(300);
		expect(consertos).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^Proposta 1: o arquivo "outro.md"/),
				expect.stringMatching(/^Proposta 2: sem o ajuste/),
				expect.stringMatching(/^Proposta 3: o ajuste tem 401 caracteres/),
				expect.stringMatching(/^Proposta 4: .*linha começando com "## "/),
				expect.stringMatching(/^Proposta 5: sem o porquê/),
				expect.stringMatching(/^Proposta 6: cita 1 evento da evidência \(o mínimo é 2\)/),
				expect.stringMatching(/^Proposta 7: igual a um ajuste que já vale em exemplos.md/),
				expect.stringMatching(/^Proposta 8: igual a um ajuste descartado de exemplos.md/),
				expect.stringMatching(/^Proposta 9: igual à reescrita de um experimento de dissertativa.md/),
				expect.stringMatching(/^Proposta 10: o porquê passava de 300/),
				expect.stringMatching(/^Proposta 12: não é um objeto/),
			]),
		);
		// A 11ª ("Longa.") difere da 10ª ("Longa") só pelo ponto, que conta na forma do ajuste: fica, e vai para depois por falta de vaga.
		expect(analise.paraDepois.map((item) => item.ajuste)).toEqual(["Longa."]);
	});

	it("no máximo 5 propostas valem; as de fora do limite saem com o conserto", () => {
		const muitas = ["a", "b", "c", "d", "e", "f", "g"].map((letra) => proposta({ ajuste: `Regra ${letra}.` }));
		const { analise, consertos } = validar(base({ propostas: muitas }), { emTeste: [] });
		expect(analise.propostas.length + analise.paraDepois.length).toBe(5);
		expect(consertos).toEqual(expect.arrayContaining([expect.stringMatching(/passa de 5 propostas/)]));
	});
});

describe("os aprendizados e as revisões", () => {
	const registrados = [
		{ id: "ap-1", texto: "Exemplos antes da definição ajudam.", situacao: "observado" as const },
		{ id: "ap-2", texto: "Blocos curtos funcionam.", situacao: "confirmado" as const },
	];
	const aprendizado = (extra: Record<string, unknown> = {}) => ({ texto: "Tabelas pequenas ajudam.", porque: "O entendimento subiu de 3 para 4,5.", evidencias: ["ev-a"], ...extra });

	it("até 3 por análise, texto e porquê até 300, pelo menos 1 evento; o igual a um registrado ou a outro da resposta sai", () => {
		const { analise, consertos } = validar(
			base({
				aprendizados: [
					aprendizado(),
					aprendizado({ texto: "  TABELAS pequenas ajudam. " }),
					aprendizado({ texto: "Exemplos antes da definição ajudam." }),
					aprendizado({ texto: "x".repeat(301) }),
					aprendizado({ texto: "" }),
					aprendizado({ texto: "Sem evidência.", evidencias: ["ev-x"] }),
					aprendizado({ texto: "Sem porquê.", porque: "" }),
					aprendizado({ texto: "Segundo.", porque: "p".repeat(400) }),
					aprendizado({ texto: "Terceiro." }),
					aprendizado({ texto: "Quarto." }),
					"solto",
				],
			}),
			{ aprendizados: registrados },
		);
		expect(analise.aprendizados.map((item) => item.texto)).toEqual(["Tabelas pequenas ajudam.", "Segundo.", "Terceiro."]);
		expect(analise.aprendizados[1]!.porque).toHaveLength(300);
		expect(consertos).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^Aprendizado 2: igual a um aprendizado anterior da resposta/),
				expect.stringMatching(/^Aprendizado 3: igual a um aprendizado já registrado/),
				expect.stringMatching(/^Aprendizado 4: .*o máximo é 300/),
				expect.stringMatching(/^Aprendizado 5: .*vazio/),
				expect.stringMatching(/^Aprendizado 6: sem nenhum evento/),
				expect.stringMatching(/^Aprendizado 7: sem o porquê/),
				expect.stringMatching(/^Aprendizado 8: o porquê passava de 300/),
				expect.stringMatching(/^Aprendizado 10: passa de 3 aprendizados por análise/),
				expect.stringMatching(/^Aprendizado 11: não é um objeto/),
			]),
		);
	});

	it("revisões: o id precisa existir, a situação é confirmado ou contradito e muda a de agora, uma por aprendizado, porquê até 300", () => {
		const revisao = (extra: Record<string, unknown> = {}) => ({ aprendizado: "ap-1", situacao: "confirmado", porque: "Voltou a acontecer.", ...extra });
		const { analise, consertos } = validar(
			base({
				revisoes: [
					revisao(),
					revisao({ situacao: "contradito" }),
					revisao({ aprendizado: "ap-9" }),
					revisao({ aprendizado: "ap-2", situacao: "observado" }),
					revisao({ aprendizado: "ap-2", situacao: "confirmado" }),
					revisao({ aprendizado: "ap-2", situacao: "contradito", porque: "p".repeat(400) }),
					revisao({ aprendizado: "ap-2", situacao: "contradito", porque: "" }),
					"solto",
				],
			}),
			{ aprendizados: registrados },
		);
		expect(analise.revisoes).toHaveLength(2);
		expect(analise.revisoes[0]).toEqual({ aprendizado: "ap-1", texto: "Exemplos antes da definição ajudam.", situacao: "confirmado", porque: "Voltou a acontecer.", anterior: "observado" });
		expect(analise.revisoes[1]).toMatchObject({ aprendizado: "ap-2", situacao: "contradito", anterior: "confirmado" });
		expect(analise.revisoes[1]!.porque).toHaveLength(300);
		expect(consertos).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^Revisão 2: mais de uma revisão para ap-1/),
				expect.stringMatching(/^Revisão 3: não há o aprendizado "ap-9"/),
				expect.stringMatching(/^Revisão 4: a situação "observado" não é confirmado nem contradito/),
				expect.stringMatching(/^Revisão 5: ap-2 já está confirmado/),
				expect.stringMatching(/^Revisão 6: o porquê passava de 300/),
				expect.stringMatching(/^Revisão 7: mais de uma revisão para ap-2/),
				expect.stringMatching(/^Revisão 8: não é um objeto/),
			]),
		);
	});

	it("sem aprendizados registrados, toda revisão tem id inexistente", () => {
		const { analise, consertos } = validar(base({ revisoes: [{ aprendizado: "ap-1", situacao: "confirmado", porque: "x" }] }));
		expect(analise.revisoes).toEqual([]);
		expect(consertos[0]).toMatch(/não há o aprendizado "ap-1"/);
	});
});

describe("o relatório da versão 2", () => {
	const todas = [
		{ id: "ev-a", linha: "linha a", licao: "l1", bloco: "l1-b2" },
		{ id: "ev-b", linha: "linha b", licao: "l1", bloco: "l1-b3" },
		{ id: "ev-c", linha: "linha c", licao: "l2", bloco: null },
	];
	const placar = placarDoModulo([], 2);
	const comparacao = compararComHistorico(placar, []);
	const analise = () =>
		validar(
			base({
				funcionou: [{ texto: "Bom.", evidencias: ["ev-a"] }],
				experimentos: [decisao("dissertativa.md#a-1", "reescrever", { texto: "Texto novo e melhor." }), decisao("exemplos.md#a-2", "descartar")],
				propostas: [proposta({ evidencias: ["ev-b", "ev-c"] }), proposta({ arquivo: "conceito.md", ajuste: "B.", evidencias: ["ev-a", "ev-b"] }), proposta({ arquivo: "termos.md", ajuste: "C.", evidencias: ["ev-a", "ev-c"] })],
				aprendizados: [{ texto: "Um aprendizado.", porque: "Porque sim.", evidencias: ["ev-c"] }],
			}),
		).analise;
	const pronto = () =>
		novoRelatorio({ modulo: "m1", geradoEm: "2026-11-03T10:00:00.000Z", eventosLidos: 3, retornos: 3, placar, comparacao, doModelo: { analise: analise(), modelo: "teste/x", custo: 0.06, prompt: { nome: "relatorio-metodo.md", hash: "abc" }, todas } });

	it("o relatório pronto guarda tudo, as evidências citadas na ordem (inclusive as das propostas de fora) e lido de volta fica igual", () => {
		const relatorio = pronto();
		expect(relatorio).toMatchObject({ versao: 2, modulo: "m1", situacao: "pronto", modelo: "teste/x", custo: 0.06, eventosLidos: 3, retornos: 3 });
		expect(relatorio.evidencias.map((item) => item.id)).toEqual(["ev-a", "ev-b", "ev-c"]);
		expect(relatorio.experimentos.map((item) => item.decisao)).toEqual(["reescrever", "descartar"]);
		expect(relatorio.propostas.map((item) => item.id)).toEqual(["p1"]);
		expect(relatorio.paraDepois).toHaveLength(2);
		expect(relatorio.aprendizados).toEqual([{ texto: "Um aprendizado.", porque: "Porque sim.", evidencias: ["ev-c"] }]);
		expect(relatorio.aplicadoEm).toBeUndefined();
		expect(idsCitadosNaAnalise(analise())).toEqual(new Set(["ev-a", "ev-b", "ev-c"]));
		const lido = relatorioLido(JSON.parse(JSON.stringify(relatorio)), "m1");
		expect(lido).toEqual(relatorio);
		expect(relatorioNaOrdem(lido)).toEqual(relatorio);
		expect(lido.versao).toBe(2);
	});

	it("com o que a aplicação acrescenta (novo, aplicadoEm, erroAoAplicar) o relatório também é lido de volta", () => {
		const relatorio = pronto();
		relatorio.experimentos[0]!.novo = "dissertativa.md#a-20261103-5";
		relatorio.propostas[0]!.novo = "quiz.md#a-20261103-6";
		relatorio.aprendizados[0]!.novo = "ap-20261103-1";
		relatorio.aplicadoEm = "2026-11-03T11:00:00.000Z";
		relatorio.erroAoAplicar = "Deu errado no meio.";
		const lido = relatorioLido(JSON.parse(JSON.stringify(relatorio)), "m1");
		expect(lido).toEqual(relatorio);
		expect(foiAplicada(lido)).toBe(true);
	});

	it("o pouco_retorno guarda o placar e a comparação, sem modelo e sem nenhum experimento", () => {
		const pouco = novoRelatorio({ modulo: "m1", geradoEm: "2026-11-03T10:00:00.000Z", eventosLidos: 2, retornos: 1, placar, comparacao });
		expect(pouco).toMatchObject({ versao: 2, situacao: "pouco_retorno", custo: 0, resumo: "", experimentos: [], propostas: [], paraDepois: [], aprendizados: [], revisoes: [], evidencias: [] });
		expect(pouco.placar).toEqual(placar);
		expect(pouco.comparacao).toEqual(comparacao);
		expect(pouco.modelo).toBeUndefined();
		expect(relatorioLido(JSON.parse(JSON.stringify(pouco)), "m1")).toEqual(pouco);
		expect(foiAplicada(pouco)).toBe(false);
	});

	it("relatorioLido aceita as versões 1 e 2 e recusa o resto", () => {
		const v1 = { versao: 1, modulo: "m1", situacao: "pouco_retorno", geradoEm: "x", custo: 0, eventosLidos: 1, retornos: 1, resumo: "", funcionou: [], problemas: [], propostas: [], evidencias: [] };
		expect(relatorioLido(v1, "m1")).toMatchObject({ versao: 1, situacao: "pouco_retorno" });
		expect(() => relatorioLido({ ...v1, versao: 3 }, "m1")).toThrow(/versão 2 \(nem da 1\)/);
		const bom = JSON.parse(JSON.stringify(pronto())) as Record<string, unknown>;
		expect(() => relatorioV2Lido(bom, "m2")).toThrow(/não é o nome do arquivo/);
		expect(() => relatorioV2Lido({ ...bom, situacao: "gerando" }, "m1")).toThrow(/situação/);
		expect(() => relatorioV2Lido({ ...bom, placar: undefined }, "m1")).toThrow(/placar/);
		expect(() => relatorioV2Lido({ ...bom, comparacao: {} }, "m1")).toThrow(/comparação/);
		expect(() => relatorioV2Lido({ ...bom, experimentos: [{ ...(bom.experimentos as object[])[0], decisao: "talvez" }] }, "m1")).toThrow(/decisão/);
		expect(() => relatorioV2Lido({ ...bom, propostas: [{ id: "p1" }] }, "m1")).toThrow(/proposta 1/);
		expect(() => relatorioV2Lido({ ...bom, aplicadoEm: 3 }, "m1")).toThrow(/aplicadoEm/);
		expect(() => relatorioV2Lido({ ...bom, revisoes: [{ aprendizado: "ap-1", texto: "x", porque: "y", situacao: "observado", anterior: "observado" }] }, "m1")).toThrow(/confirmado nem contradito/);
	});

	it("gerar de novo um relatório com aplicadoEm é erro; os da versão 1, pouco_retorno ou sem relatório podem", () => {
		const aplicado = { ...pronto(), aplicadoEm: "2026-11-03T11:00:00.000Z" };
		expect(() => conferirQuePodeGerarDeNovo(aplicado)).toThrow(FRASE_JA_APLICADA);
		expect(FRASE_JA_APLICADA).toBe("A análise deste módulo já foi aplicada.");
		expect(() => conferirQuePodeGerarDeNovo(pronto())).not.toThrow();
		expect(() => conferirQuePodeGerarDeNovo(null)).not.toThrow();
		expect(() => conferirQuePodeGerarDeNovo(relatorioLido({ versao: 1, modulo: "m1", situacao: "pronto", geradoEm: "x", custo: 0, eventosLidos: 1, retornos: 1, resumo: "", funcionou: [], problemas: [], propostas: [], evidencias: [] }, "m1"))).not.toThrow();
	});
});
