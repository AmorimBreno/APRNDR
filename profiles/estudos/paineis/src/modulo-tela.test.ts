// As partes puras da visão do módulo gerado (modulo-tela.ts): a rota com e
// sem lição, o rótulo e o ícone de cada bloco pelo tipo e pelo formato, as
// estações da trilha, o "Próximo" da CourseBar, o índice das lições (as
// fichas no estreito), o resumo, a linha de dados da lição, a confusão no gabarito e o aviso; e a
// leitura da resposta ao "abrir" na ponte (modulos-ponte.ts).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { Bloco, Licao, Modulo } from "../../lib/modulo-tipos.ts";
import {
	aberturaDoModulo,
	avisoFechado,
	caminhoDoModulo,
	CHAVE_AVISO,
	dadosDaLicao,
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
	perguntaConcluir,
	podeConcluir,
	postItDaQuestao,
	proximoDaBarra,
	resumoDoIndice,
	rotaDoModulo,
	rotuloConcluido,
	rotuloDoBloco,
	tituloDoModulo,
} from "./modulo-tela.ts";
import { errosDasQuestoes, lerModuloAberto, lerModulos } from "./modulos-ponte.ts";

const explicacao = (id: string, formato: "introducao" | "conceito" | "exemplo_resolvido" | "exemplo_incompleto" | "problema_aberto", complemento = false): Bloco => ({
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
const ideiaCentral = (id: string): Bloco => ({ id, tipo: "ideia_central", conceitos: ["c-a"], texto: "O que guardar." });
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
		expect(rotuloDoBloco(explicacao("b", "introducao"))).toEqual({ rotulo: "Introdução", icone: "flag" });
		expect(rotuloDoBloco(explicacao("b", "conceito"))).toEqual({ rotulo: "Explicação", icone: "bulb" });
		expect(rotuloDoBloco(explicacao("b", "exemplo_resolvido"))).toEqual({ rotulo: "Exemplo resolvido", icone: "code" });
		expect(rotuloDoBloco(explicacao("b", "exemplo_incompleto"))).toEqual({ rotulo: "Exemplo para completar", icone: "code" });
		expect(rotuloDoBloco(explicacao("b", "problema_aberto"))).toEqual({ rotulo: "Problema aberto", icone: "flag" });
	});

	it("as práticas: o rótulo e o ícone pelo tipo", () => {
		expect(rotuloDoBloco(verificacao("b"))).toEqual({ rotulo: "Pergunta", icone: "help" });
		expect(rotuloDoBloco(alternativa("b"))).toEqual({ rotulo: "Quiz", icone: "checklist" });
		expect(rotuloDoBloco(dissertativa("b"))).toEqual({ rotulo: "Dissertativa", icone: "message" });
	});

	it("a ideia central: o rótulo e o ícone do Callout", () => {
		expect(rotuloDoBloco(ideiaCentral("b"))).toEqual({ rotulo: "Ideia central", icone: "bulb" });
	});

	it("o post-it de cada questão: o nome, o ícone e a cor; a explicação e a ideia central não têm", () => {
		expect(postItDaQuestao(alternativa("b"))).toEqual({ nome: "Quiz", icone: "checklist", tom: "amber" });
		expect(postItDaQuestao(dissertativa("b"))).toEqual({ nome: "Dissertativa", icone: "message", tom: "brick" });
		expect(postItDaQuestao(verificacao("b"))).toEqual({ nome: "Pergunta", icone: "help", tom: "moss" });
		expect(postItDaQuestao(explicacao("b", "introducao"))).toBeUndefined();
		expect(postItDaQuestao(explicacao("b", "conceito"))).toBeUndefined();
		expect(postItDaQuestao(ideiaCentral("b"))).toBeUndefined();
	});

	it("o complemento é só a explicação marcada", () => {
		expect(ehComplemento(explicacao("b", "conceito", true))).toBe(true);
		expect(ehComplemento(explicacao("b", "conceito"))).toBe(false);
		expect(ehComplemento(alternativa("b"))).toBe(false);
	});

	it("a régua: um traço por bloco, com o rótulo", () => {
		expect(itensDaRegua(licao("l1", "Um", [explicacao("l1-b1", "exemplo_resolvido"), alternativa("l1-b2")]))).toEqual([
			{ id: "l1-b1", label: "Exemplo resolvido" },
			{ id: "l1-b2", label: "Quiz" },
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

	it("o resumo: lições, questões (perguntas, quizzes e dissertativas) e o dia", () => {
		const modulo = gerado([
			licao("l1", "Um", [explicacao("l1-b1", "conceito"), verificacao("l1-b2"), alternativa("l1-b3")]),
			licao("l2", "Dois", [explicacao("l2-b1", "conceito"), alternativa("l2-b2"), dissertativa("l2-b3")]),
		]);
		expect(resumoDoIndice(modulo)).toBe("2 lições · 4 questões · gerado em 26/10");
		expect(resumoDoIndice({ licoes: [licao("l1", "Um", [explicacao("l1-b1", "conceito"), alternativa("l1-b2")])] })).toBe("1 lição · 1 questão");
		expect(diaEMes("nada")).toBe("");
	});

	it("a linha de dados da lição: os blocos e as questões (sem questão, só os blocos)", () => {
		expect(dadosDaLicao(licao("l1", "Um", [explicacao("l1-b1", "conceito"), verificacao("l1-b2"), alternativa("l1-b3"), dissertativa("l1-b4")]))).toBe("4 blocos · 3 questões");
		expect(dadosDaLicao(licao("l1", "Um", [explicacao("l1-b1", "conceito"), alternativa("l1-b2")]))).toBe("2 blocos · 1 questão");
		expect(dadosDaLicao(licao("l1", "Um", [explicacao("l1-b1", "conceito")]))).toBe("1 bloco");
	});
});

describe("concluir o módulo", () => {
	it("o modal, quem pode concluir e a etiqueta Concluído em dd/mm", () => {
		expect(perguntaConcluir(3)).toEqual({ titulo: "Concluir o módulo 03?", texto: "A recomendação passa para o próximo." });
		const modulo = gerado([licao("l1", "Um", [explicacao("l1-b1", "conceito"), alternativa("l1-b2")])]);
		expect(podeConcluir(modulo)).toBe(true);
		expect(rotuloConcluido(modulo)).toBe("");
		const concluido = { ...modulo, concluidoEm: "2026-10-27T15:00:00" } as Modulo;
		expect(podeConcluir(concluido)).toBe(false);
		expect(rotuloConcluido(concluido)).toBe("Concluído em 27/10");
		const aguardando: Modulo = { versao: 1, id: "m3", curso: "curso", materia: "materia", situacao: "aguardando_material", aguardando: { nota: "", desde: "2026-10-26T15:00:00", prontos: [] }, licoes: [] };
		expect(podeConcluir(aguardando)).toBe(false);
		expect(rotuloConcluido(aguardando)).toBe("");
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
		expect(lerModuloAberto(recebidas, "materia", "curso", "m2")).toEqual({ modulo, corrigindo: [] });
		const comErro = [...recebidas, recebida("5", "erro", { mensagem: "O módulo m2 ainda não foi gerado.", ao: "abrir", materia: "materia", curso: "curso", modulo: "m2" })];
		expect(lerModuloAberto(comErro, "materia", "curso", "m2")).toEqual({ erro: "O módulo m2 ainda não foi gerado." });
		expect(lerModuloAberto([...comErro, recebida("6", "modulo", { materia: "materia", curso: "curso", modulo })], "materia", "curso", "m2")).toEqual({ modulo, corrigindo: [] });
	});

	it("guarda o corrigindo do último módulo (só os ids em texto)", () => {
		const recebidas = [
			recebida("1", "modulo", { materia: "materia", curso: "curso", modulo, corrigindo: ["l1-b2"] }),
			recebida("2", "modulo", { materia: "materia", curso: "curso", modulo: { ...modulo, id: "m3" }, corrigindo: [] }),
		];
		expect(lerModuloAberto(recebidas, "materia", "curso", "m2")).toEqual({ modulo, corrigindo: ["l1-b2"] });
		const depois = [...recebidas, recebida("3", "modulo", { materia: "materia", curso: "curso", modulo, corrigindo: ["l1-b2", 3, "", null] })];
		expect(lerModuloAberto(depois, "materia", "curso", "m2").corrigindo).toEqual(["l1-b2"]);
		const semCampo = [...depois, recebida("4", "modulo", { materia: "materia", curso: "curso", modulo })];
		expect(lerModuloAberto(semCampo, "materia", "curso", "m2").corrigindo).toEqual([]);
	});

	it("os erros do abrir não viram erro do card na visão do curso", () => {
		const lido = lerModulos([recebida("1", "erro", { mensagem: "O módulo m2 ainda não foi gerado.", ao: "abrir", materia: "materia", curso: "curso", modulo: "m2" })], "materia", "curso");
		expect(lido.errosModulo).toEqual({});
		expect(lido.erroLista).toBeUndefined();
	});

	it("os erros das questões (responder, corrigir, encerrar) também não viram erro do card", () => {
		const lido = lerModulos(
			[
				recebida("1", "erro", { mensagem: "O modelo não respondeu.", ao: "corrigir", materia: "materia", curso: "curso", modulo: "m2", bloco: "l1-b2" }),
				recebida("2", "erro", { mensagem: "Já acabou.", ao: "responder", materia: "materia", curso: "curso", modulo: "m2", bloco: "l1-b2" }),
				recebida("3", "erro", { mensagem: "Já encerrada.", ao: "encerrar", materia: "materia", curso: "curso", modulo: "m2", bloco: "l1-b2" }),
			],
			"materia",
			"curso",
		);
		expect(lido.errosModulo).toEqual({});
		expect(lido.erroLista).toBeUndefined();
	});
});

describe("a ponte: os erros da conferência das questões", () => {
	const recebida = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });
	const modulo = gerado([licao("l1", "Um", [explicacao("l1-b1", "conceito"), verificacao("l1-b2"), alternativa("l1-b3")])]);
	const alvo = { materia: "materia", curso: "curso", modulo: "m2" };
	const erro = (chave: string, dados: Record<string, unknown>) => recebida(chave, "erro", { materia: "materia", curso: "curso", modulo: "m2", ...dados });

	it("o erro do corrigir fica no bloco, com ou sem pedido; os de outras ações e de outros módulos, não", () => {
		expect(errosDasQuestoes([], alvo)).toEqual({});
		const recebidas = [
			erro("1", { mensagem: "O modelo não respondeu.", ao: "corrigir", bloco: "l1-b2" }),
			erro("2", { mensagem: "Escolha repetida.", ao: "responder", bloco: "l1-b3", pedido: "p1" }),
			erro("3", { mensagem: "Outro módulo.", ao: "corrigir", bloco: "l1-b3", modulo: "m3" }),
			erro("4", { mensagem: "Sem bloco.", ao: "corrigir" }),
			recebida("5", "erro", { mensagem: "Outro curso.", ao: "corrigir", bloco: "l1-b3", materia: "materia", curso: "outro" }),
			erro("6", { mensagem: "", ao: "corrigir", bloco: "l1-b9", pedido: "p2" }),
		];
		expect(errosDasQuestoes(recebidas, alvo)).toEqual({
			"l1-b2": { chave: "1", mensagem: "O modelo não respondeu.", ao: "corrigir" },
			"l1-b9": { chave: "6", mensagem: "Erro desconhecido.", ao: "corrigir" },
		});
	});

	it("o módulo com o bloco no corrigindo (a conferência recomeçou) apaga o erro; depois, um erro novo volta", () => {
		const primeiro = erro("1", { mensagem: "Falhou.", ao: "corrigir", bloco: "l1-b2" });
		const outroModulo = recebida("2", "modulo", { materia: "materia", curso: "curso", modulo: { ...modulo, id: "m3" }, corrigindo: ["l1-b2"] });
		expect(errosDasQuestoes([primeiro, outroModulo], alvo)).toHaveProperty("l1-b2");
		const semEle = recebida("3", "modulo", { materia: "materia", curso: "curso", modulo, corrigindo: [] });
		expect(errosDasQuestoes([primeiro, semEle], alvo)).toHaveProperty("l1-b2");
		const recomecou = recebida("4", "modulo", { materia: "materia", curso: "curso", modulo, corrigindo: ["l1-b2"] });
		expect(errosDasQuestoes([primeiro, recomecou], alvo)).toEqual({});
		const deNovo = erro("5", { mensagem: "Falhou de novo.", ao: "corrigir", bloco: "l1-b2" });
		expect(errosDasQuestoes([primeiro, recomecou, deNovo], alvo)).toEqual({ "l1-b2": { chave: "5", mensagem: "Falhou de novo.", ao: "corrigir" } });
	});
});
