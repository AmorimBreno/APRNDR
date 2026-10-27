// As partes puras da visão do módulo gerado (modulo-tela.ts): a rota com e
// sem lição, o rótulo e o ícone de cada bloco pelo tipo e pelo formato, as
// estações da trilha, o "Próximo" da CourseBar, o índice das lições (as
// fichas no estreito), o resumo, a confusão no gabarito e o aviso; e a
// leitura da resposta ao "abrir" na ponte (modulos-ponte.ts).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { Bloco, Licao, Modulo } from "../../lib/modulo-tipos.ts";
import {
	aberturaDoModulo,
	avisoFechado,
	caminhoDoModulo,
	CHAVE_AVISO,
	diaEMes,
	ehComplemento,
	fraseDaConfusao,
	ID_AVALIACAO_GERAL,
	idDaCorreta,
	indiceDaLicao,
	itensDaRegua,
	itensDoIndice,
	kickerDaBarra,
	lembrarAvisoFechado,
	passosDaTrilha,
	proximoDaBarra,
	resumoDoIndice,
	rotaDoModulo,
	rotuloDoBloco,
	tituloDoModulo,
} from "./modulo-tela.ts";
import { lerModuloAberto, lerModulos } from "./modulos-ponte.ts";

const explicacao = (id: string, formato: "conceito" | "exemplo_resolvido" | "exemplo_incompleto" | "problema_aberto", complemento = false): Bloco => ({
	id,
	tipo: "explicacao",
	conceitos: ["c-a"],
	formato,
	texto: "Texto.",
	referencias: [],
	...(complemento ? { complemento: true as const } : {}),
});
const verificacao = (id: string): Bloco => ({ id, tipo: "verificacao", conceitos: ["c-a"], pergunta: "P?", respostaEsperada: "R." });
const alternativa = (id: string): Bloco => ({
	id,
	tipo: "alternativa",
	conceitos: ["c-a"],
	enunciado: "Qual?",
	alternativas: [{ texto: "A", confusao: "Confunde A com B." }, { texto: "B", correta: true }],
	explicacao: "Porque B.",
	referencias: [],
});
const dissertativa = (id: string): Bloco => ({
	id,
	tipo: "dissertativa",
	conceitos: ["c-a"],
	enunciado: "Explique.",
	rubrica: [
		{ criterio: "Um", descricao: "d", pontos: 2 },
		{ criterio: "Dois", descricao: "d", pontos: 1 },
		{ criterio: "Três", descricao: "d", pontos: 1 },
	],
	respostaModelo: "Modelo.",
	referencias: [],
});
const licao = (id: string, titulo: string, blocos: Bloco[]): Licao => ({ id, titulo, objetivo: "", conceitos: ["c-a"], blocos });
const gerado = (licoes: Licao[]): Modulo => ({
	versao: 1,
	id: "m2",
	curso: "curso",
	materia: "materia",
	situacao: "gerado",
	licoes,
	geradoEm: "2026-10-26T15:00:00",
	modelo: "openrouter/openai/gpt-6.1-sol",
	custo: 0.12,
	materiaisUsados: [],
});

describe("a rota", () => {
	it("monta o caminho com e sem lição", () => {
		expect(caminhoDoModulo("dados", "c1", "m3")).toBe("caderno/dados/cursos/c1/modulos/m3");
		expect(caminhoDoModulo("dados", "c1", "m3", "l2")).toBe("caderno/dados/cursos/c1/modulos/m3/l2");
	});

	it("lê o que vem depois de cursos/", () => {
		expect(rotaDoModulo(["c1", "modulos", "m3"])).toEqual({ curso: "c1", modulo: "m3" });
		expect(rotaDoModulo(["c1", "modulos", "m3", "l2"])).toEqual({ curso: "c1", modulo: "m3", licao: "l2" });
		expect(rotaDoModulo(["c1"])).toBeUndefined();
		expect(rotaDoModulo(["c1", "guia"])).toBeUndefined();
		expect(rotaDoModulo(["c1", "modulos"])).toBeUndefined();
		expect(rotaDoModulo(["c1", "modulos", "m3", "l2", "x"])).toBeUndefined();
	});

	it("a lição da rota; sem ela, ou com uma que não existe, a primeira", () => {
		const licoes = [{ id: "l1" }, { id: "l2" }, { id: "l3" }];
		expect(indiceDaLicao(licoes, "l2")).toBe(1);
		expect(indiceDaLicao(licoes, undefined)).toBe(0);
		expect(indiceDaLicao(licoes, "l9")).toBe(0);
	});
});

describe("o que abrir mostra", () => {
	it("carregando, pronto, não gerado, ilegível e erro", () => {
		const modulo = gerado([licao("l1", "Um", [explicacao("l1-b1", "conceito"), verificacao("l1-b2")])]);
		expect(aberturaDoModulo({})).toEqual({ tipo: "carregando" });
		expect(aberturaDoModulo({ modulo })).toEqual({ tipo: "pronto", modulo });
		expect(aberturaDoModulo({ modulo: gerado([]) })).toEqual({ tipo: "nao_gerado" });
		expect(
			aberturaDoModulo({ modulo: { versao: 1, id: "m2", curso: "c", materia: "m", situacao: "aguardando_material", aguardando: { nota: "", desde: "", prontos: [] }, licoes: [] } }),
		).toEqual({ tipo: "nao_gerado" });
		expect(aberturaDoModulo({ erro: "O módulo m2 ainda não foi gerado." })).toEqual({ tipo: "nao_gerado" });
		const ilegivel = "Não consegui ler o módulo C:/x/m2.json: o JSON está inválido. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.";
		expect(aberturaDoModulo({ erro: ilegivel })).toEqual({ tipo: "ilegivel", mensagem: ilegivel });
		expect(aberturaDoModulo({ erro: "Não consegui abrir o módulo: EBUSY" })).toEqual({ tipo: "erro", mensagem: "Não consegui abrir o módulo: EBUSY" });
	});
});

describe("os blocos", () => {
	it("explicação: o rótulo e o ícone pelo formato", () => {
		expect(rotuloDoBloco(explicacao("b", "conceito"))).toEqual({ rotulo: "Explicação", icone: "bulb" });
		expect(rotuloDoBloco(explicacao("b", "exemplo_resolvido"))).toEqual({ rotulo: "Exemplo resolvido", icone: "code" });
		expect(rotuloDoBloco(explicacao("b", "exemplo_incompleto"))).toEqual({ rotulo: "Exemplo para completar", icone: "code" });
		expect(rotuloDoBloco(explicacao("b", "problema_aberto"))).toEqual({ rotulo: "Problema aberto", icone: "flag" });
	});

	it("as práticas: o rótulo e o ícone pelo tipo", () => {
		expect(rotuloDoBloco(verificacao("b"))).toEqual({ rotulo: "Pergunta", icone: "help" });
		expect(rotuloDoBloco(alternativa("b"))).toEqual({ rotulo: "Questão", icone: "checklist" });
		expect(rotuloDoBloco(dissertativa("b"))).toEqual({ rotulo: "Dissertativa", icone: "message" });
	});

	it("o complemento é só a explicação marcada", () => {
		expect(ehComplemento(explicacao("b", "conceito", true))).toBe(true);
		expect(ehComplemento(explicacao("b", "conceito"))).toBe(false);
		expect(ehComplemento(alternativa("b"))).toBe(false);
	});

	it("a régua: um traço por bloco, com o rótulo", () => {
		expect(itensDaRegua(licao("l1", "Um", [explicacao("l1-b1", "exemplo_resolvido"), alternativa("l1-b2")]))).toEqual([
			{ id: "l1-b1", label: "Exemplo resolvido" },
			{ id: "l1-b2", label: "Questão" },
		]);
	});

	it("a confusão embaixo da errada, e a correta", () => {
		expect(fraseDaConfusao("Confunde correlação com causalidade.")).toBe("Quem escolhe esta confunde correlação com causalidade.");
		expect(fraseDaConfusao("Acha que o R² mede a inclinação")).toBe("Quem escolhe esta acha que o R² mede a inclinação.");
		expect(fraseDaConfusao("  ")).toBe("");
		expect(fraseDaConfusao(undefined)).toBe("");
		expect(idDaCorreta([{}, { correta: true }, {}])).toBe("1");
		expect(idDaCorreta([{}, {}])).toBeUndefined();
	});
});

describe("a CourseBar", () => {
	const modulos = [
		{ id: "m1", numero: 1, nome: "Estatística" },
		{ id: "m2", numero: 2, nome: "Regressão" },
		{ id: "m3", numero: 3, nome: "Classificação" },
		{ id: "m4", numero: 4, nome: "Árvores" },
	];

	it("o título e o kicker", () => {
		expect(tituloDoModulo(3, "Derivadas")).toBe("Módulo 03 · Derivadas");
		expect(kickerDaBarra("Cálculo I", { indice: 1, total: 4 })).toBe("Cálculo I · lição 2 de 4");
		expect(kickerDaBarra("Cálculo I")).toBe("Cálculo I");
	});

	it("a trilha: o aberto é current, os gerados todo, o resto e a avaliação geral locked", () => {
		const passos = passosDaTrilha(
			modulos,
			[
				{ id: "m1", situacao: "gerado", geradoEm: "x" },
				{ id: "m2", situacao: "gerado", geradoEm: "x" },
				{ id: "m3", situacao: "aguardando_material" },
				{ id: "m4", situacao: "a_gerar" },
			],
			"m2",
		);
		expect(passos.map((passo) => [passo.id, passo.kind, passo.state])).toEqual([
			["m1", "module", "todo"],
			["m2", "module", "current"],
			["m3", "module", "locked"],
			["m4", "module", "locked"],
			[ID_AVALIACAO_GERAL, "final", "locked"],
		]);
		expect(passos[0]!.label).toBe("Módulo 01 · Estatística");
		expect(passos.at(-1)!.label).toBe("Avaliação geral");
	});

	it("a trilha: um gerado sendo gerado de novo continua abrível; sem o estado, só o aberto", () => {
		const passos = passosDaTrilha(modulos, [{ id: "m1", situacao: "escrevendo", geradoEm: "x" }, { id: "m3", situacao: "planejando" }], "m2");
		expect(passos.map((passo) => passo.state)).toEqual(["todo", "current", "locked", "locked", "locked"]);
		expect(passosDaTrilha(modulos, undefined, "m1").map((passo) => passo.state)).toEqual(["current", "locked", "locked", "locked", "locked"]);
	});

	it("o próximo: a próxima lição; na última, voltar ao curso", () => {
		expect(proximoDaBarra(0, 3)).toEqual({ label: "Próxima lição", kicker: "Lição 2", destino: "licao" });
		expect(proximoDaBarra(1, 3)).toEqual({ label: "Próxima lição", kicker: "Lição 3", destino: "licao" });
		expect(proximoDaBarra(2, 3)).toEqual({ label: "Voltar ao curso", kicker: "Fim do módulo", destino: "curso" });
		expect(proximoDaBarra(0, 1).destino).toBe("curso");
	});
});

describe("o índice das lições", () => {
	it("as fichas (e a lista): o número com dois dígitos, o título e a atual", () => {
		const licoes = [licao("l1", "Média", []), licao("l2", "Variância", []), licao("l3", "Desvio", [])];
		expect(itensDoIndice(licoes, 1)).toEqual([
			{ id: "l1", numero: "01", titulo: "Média", atual: false },
			{ id: "l2", numero: "02", titulo: "Variância", atual: true },
			{ id: "l3", numero: "03", titulo: "Desvio", atual: false },
		]);
	});

	it("o resumo: lições, questões (alternativas e dissertativas) e o dia", () => {
		const modulo = gerado([
			licao("l1", "Um", [explicacao("l1-b1", "conceito"), verificacao("l1-b2"), alternativa("l1-b3")]),
			licao("l2", "Dois", [explicacao("l2-b1", "conceito"), alternativa("l2-b2"), dissertativa("l2-b3")]),
		]);
		expect(resumoDoIndice(modulo)).toBe("2 lições · 3 questões · gerado em 26/10");
		expect(resumoDoIndice({ licoes: [licao("l1", "Um", [explicacao("l1-b1", "conceito"), alternativa("l1-b2")])] })).toBe("1 lição · 1 questão");
		expect(diaEMes("nada")).toBe("");
	});
});

describe("o aviso de visualização", () => {
	it("lembra que foi fechado; sem localStorage, ou se ele falha, aparece de novo", () => {
		const guardados = new Map<string, string>();
		const memoria = { getItem: (chave: string) => guardados.get(chave) ?? null, setItem: (chave: string, valor: string) => void guardados.set(chave, valor) };
		expect(avisoFechado(memoria)).toBe(false);
		lembrarAvisoFechado(memoria);
		expect(guardados.get(CHAVE_AVISO)).toBe("1");
		expect(avisoFechado(memoria)).toBe(true);
		const quebrado = {
			getItem: () => {
				throw new Error("bloqueado");
			},
			setItem: () => {
				throw new Error("bloqueado");
			},
		};
		expect(avisoFechado(quebrado)).toBe(false);
		expect(() => lembrarAvisoFechado(quebrado)).not.toThrow();
		expect(avisoFechado(undefined)).toBe(false);
	});
});

describe("a ponte: a resposta ao abrir", () => {
	const recebida = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });
	const modulo = gerado([licao("l1", "Um", [explicacao("l1-b1", "conceito"), verificacao("l1-b2")])]);

	it("o último módulo daquele curso, ou o último erro do abrir dele", () => {
		expect(lerModuloAberto([], "materia", "curso", "m2")).toEqual({});
		const recebidas = [
			recebida("1", "modulo", { materia: "materia", curso: "outro", modulo: { ...modulo, curso: "outro" } }),
			recebida("2", "modulo", { materia: "materia", curso: "curso", modulo: { ...modulo, id: "m3" } }),
			recebida("3", "erro", { mensagem: "Falhou o listar.", ao: "listar", materia: "materia", curso: "curso" }),
			recebida("4", "modulo", { materia: "materia", curso: "curso", modulo }),
		];
		expect(lerModuloAberto(recebidas, "materia", "curso", "m2")).toEqual({ modulo });
		const comErro = [...recebidas, recebida("5", "erro", { mensagem: "O módulo m2 ainda não foi gerado.", ao: "abrir", materia: "materia", curso: "curso", modulo: "m2" })];
		expect(lerModuloAberto(comErro, "materia", "curso", "m2")).toEqual({ erro: "O módulo m2 ainda não foi gerado." });
		expect(lerModuloAberto([...comErro, recebida("6", "modulo", { materia: "materia", curso: "curso", modulo })], "materia", "curso", "m2")).toEqual({ modulo });
	});

	it("os erros do abrir não viram erro do card na visão do curso", () => {
		const lido = lerModulos([recebida("1", "erro", { mensagem: "O módulo m2 ainda não foi gerado.", ao: "abrir", materia: "materia", curso: "curso", modulo: "m2" })], "materia", "curso");
		expect(lido.errosModulo).toEqual({});
		expect(lido.erroLista).toBeUndefined();
	});
});
