// Testes do ciclo do método no disco (docs/metodo-ciclo.md e
// docs/metodo-experimentos.md), numa pasta de dados temporária: o relatório
// gravado com o gerou_relatorio_metodo (as duas versões), a evidência lida do
// aprendiz/eventos.jsonl, os arquivos de ajustes com os estados novos e o
// formato antigo, o aprendizados.md, o histórico lido dos módulos concluídos e
// aplicar a análise (os estados, os eventos, o aplicadoEm e o erro ao aplicar).

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmarEtapa, gravarCurso, novoCurso } from "./cursos.ts";
import { acrescentarEvento, criarEvento, lerEventos } from "./eventos.ts";
import { criarMateria, eventosAprendiz, eventosMateria } from "./materias.ts";
import {
	aplicarAnalise,
	caminhoDoRelatorio,
	caminhoDosAjustes,
	caminhoDosAprendizados,
	compararComHistorico,
	contarEmTeste,
	ErroMetodo,
	evidenciaDoModulo,
	FRASE_JA_APLICADA,
	gravarAjustes,
	gravarAprendizados,
	gravarRelatorio,
	lerAjustes,
	lerAprendizados,
	lerOQueFacilita,
	lerRelatorio,
	lerTodosOsAjustes,
	listarAjustes,
	listarAprendizados,
	modulosConcluidos,
	montarContextoDaAnalise,
	novoRelatorio,
	placarDoModuloNosEventos,
	registrarRelatorio,
	type RelatorioMetodoV2,
	validarAnaliseDoModelo,
} from "./metodo-ciclo.ts";
import { gravarModulo, MINIMO_CARACTERES_EXEMPLO, type ModuloGerado } from "./modulos.ts";

const MATERIA = "calculo-i";
const CURSO = "p1-regressao";
const AGORA = new Date(2026, 10, 3, 15, 0, 0);
const GERADO = "2026-11-01T10:00:00.000Z";

let dados = "";

const modulo = (id = "m1", extra: Partial<ModuloGerado> = {}): ModuloGerado => ({
	versao: 1,
	id,
	curso: CURSO,
	materia: MATERIA,
	situacao: "gerado",
	licoes: [
		{
			id: "l1",
			titulo: "A reta",
			objetivo: "",
			conceitos: ["c-a"],
			blocos: [{ id: "l1-b1", tipo: "explicacao", conceitos: ["c-a"], formato: "conceito", texto: `Texto. ${"x".repeat(MINIMO_CARACTERES_EXEMPLO)}`, referencias: [] }],
		},
	],
	geradoEm: GERADO,
	modelo: "teste/x",
	custo: 0,
	materiaisUsados: [],
	concluidoEm: "2026-11-02T10:00:00.000Z",
	...extra,
});

const IDS = ["ev-a", "ev-b", "ev-c"];
const todas = IDS.map((id) => ({ id, linha: `linha ${id}`, licao: "l1", bloco: "l1-b1" }));

/** Um relatório pronto da versão 2 a partir de uma resposta do modelo, conferida como a extensão a confere. */
function pronto(resposta: Record<string, unknown> = {}, opcoes: Parameters<typeof validarAnaliseDoModelo>[1] = { evidencias: IDS, emTeste: [] }): RelatorioMetodoV2 {
	const placar = placarDoModuloNosEventos([], modulo());
	const { analise } = validarAnaliseDoModelo(
		{
			resumo: "Resumo.",
			funcionou: [],
			problemas: [{ texto: "Longo.", evidencias: ["ev-a"] }],
			propostas: [
				{ arquivo: "exemplos.md", ajuste: "Diga antes o que o exemplo vai mostrar.", porque: "Ele se perdeu.", evidencias: ["ev-a", "ev-b"] },
				{ arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "Foram fáceis.", evidencias: ["ev-a", "ev-b"] },
			],
			...resposta,
		},
		opcoes,
	);
	return novoRelatorio({
		modulo: "m1",
		geradoEm: "2026-11-03T10:00:00.000Z",
		eventosLidos: 4,
		retornos: 3,
		placar,
		comparacao: compararComHistorico(placar, []),
		doModelo: { analise, modelo: "teste/x", custo: 0.05, prompt: { nome: "relatorio-metodo.md", hash: "h1" }, todas },
	});
}

const doAprendiz = async (verbo: string) => (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => evento.verbo === verbo);

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-metodo-ciclo-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

describe("o relatório no disco", () => {
	it("sem arquivo, null; gravado e lido de volta; o gerou_relatorio_metodo na matéria", async () => {
		expect(await lerRelatorio(dados, MATERIA, CURSO, "m1")).toBeNull();
		const relatorio = pronto();
		const evento = await registrarRelatorio(dados, MATERIA, CURSO, relatorio, { sessao: "s1", agora: AGORA });
		expect(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1")).toBe(join(dados, "materias", MATERIA, "cursos", CURSO, "relatorios", "m1.json"));
		expect(await lerRelatorio(dados, MATERIA, CURSO, "m1")).toEqual(relatorio);
		const [gravado] = (await lerEventos(eventosMateria(dados, MATERIA))).eventos;
		expect(gravado).toEqual(evento);
		expect(gravado).toMatchObject({
			sessao: "s1",
			verbo: "gerou_relatorio_metodo",
			objeto: { materia: MATERIA, curso: CURSO, modulo: "m1" },
			resultado: { situacao: "pronto", propostas: 2, custo: 0.05 },
			contexto: { modelo: "teste/x", prompt: { nome: "relatorio-metodo.md", hash: "h1" } },
		});
		expect(JSON.parse(await readFile(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1"), "utf8")).versao).toBe(2);
		const placar = placarDoModuloNosEventos([], modulo());
		const pouco = novoRelatorio({ modulo: "m1", geradoEm: "2026-11-03T11:00:00.000Z", eventosLidos: 1, retornos: 1, placar, comparacao: compararComHistorico(placar, []) });
		const outro = await registrarRelatorio(dados, MATERIA, CURSO, pouco);
		expect(outro.contexto).toBeUndefined();
		expect(outro.resultado).toEqual({ situacao: "pouco_retorno", propostas: 0, custo: 0 });
		expect(await lerRelatorio(dados, MATERIA, CURSO, "m1")).toEqual(pouco);
	});

	it("um relatório da versão 1 gravado antes continua sendo lido, com as decisões", async () => {
		const v1 = {
			versao: 1,
			modulo: "m1",
			situacao: "pronto",
			geradoEm: "2026-11-03T10:00:00.000Z",
			modelo: "teste/x",
			custo: 0.05,
			prompt: { nome: "relatorio-metodo.md", hash: "h1" },
			eventosLidos: 4,
			retornos: 3,
			resumo: "Resumo.",
			funcionou: [],
			problemas: [],
			propostas: [{ id: "p1", arquivo: "exemplos.md", ajuste: "Ajuste.", porque: "Porque.", evidencias: ["ev-a", "ev-b"], decisao: { tipo: "aprovada", texto: "Ajuste.", em: "2026-11-03T12:00:00.000Z", evento: "ev-d", ajuste: "a-1" } }],
			evidencias: [],
		};
		await mkdir(join(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1"), ".."), { recursive: true });
		await writeFile(caminhoDoRelatorio(dados, MATERIA, CURSO, "m1"), JSON.stringify(v1), "utf8");
		const lido = (await lerRelatorio(dados, MATERIA, CURSO, "m1"))!;
		expect(lido.versao).toBe(1);
		expect(lido.propostas[0]).toMatchObject({ id: "p1", decisao: { tipo: "aprovada", ajuste: "a-1" } });
		// A versão 1 pode ser gerada de novo (substituída pela 2).
		await registrarRelatorio(dados, MATERIA, CURSO, pronto());
		expect((await lerRelatorio(dados, MATERIA, CURSO, "m1"))!.versao).toBe(2);
	});

	it("gerar de novo um relatório já aplicado é erro, sem gravar nem criar evento", async () => {
		const aplicado = { ...pronto(), aplicadoEm: "2026-11-03T11:00:00.000Z" };
		await gravarRelatorio(dados, MATERIA, CURSO, aplicado);
		await expect(registrarRelatorio(dados, MATERIA, CURSO, pronto())).rejects.toThrow(FRASE_JA_APLICADA);
		await expect(registrarRelatorio(dados, MATERIA, CURSO, pronto())).rejects.toThrow(ErroMetodo);
		expect(await lerRelatorio(dados, MATERIA, CURSO, "m1")).toEqual(aplicado);
		expect((await lerEventos(eventosMateria(dados, MATERIA))).eventos).toHaveLength(0);
	});

	it("um relatório ilegível é ErroMetodo e não é sobrescrito; um id inválido também é erro", async () => {
		const arquivo = caminhoDoRelatorio(dados, MATERIA, CURSO, "m1");
		await mkdir(join(arquivo, ".."), { recursive: true });
		await writeFile(arquivo, "{ quebrado", "utf8");
		await expect(lerRelatorio(dados, MATERIA, CURSO, "m1")).rejects.toThrow(/Não consegui ler o relatório do método .*JSON está inválido.*nada foi gravado por cima/);
		await expect(registrarRelatorio(dados, MATERIA, CURSO, pronto())).rejects.toThrow(ErroMetodo);
		expect(await readFile(arquivo, "utf8")).toBe("{ quebrado");
		expect((await lerEventos(eventosMateria(dados, MATERIA))).eventos).toHaveLength(0);
		expect(() => caminhoDoRelatorio(dados, MATERIA, CURSO, "../x")).toThrow(ErroMetodo);
	});
});

describe("a evidência lida do aprendiz", () => {
	it("os eventos do módulo, com as linhas e os retornos", async () => {
		const ev = (verbo: Parameters<typeof criarEvento>[0]["verbo"], objeto: Record<string, unknown>, resultado: Record<string, unknown>, ts: string) =>
			acrescentarEvento(eventosAprendiz(dados), criarEvento({ verbo, objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", ...objeto }, resultado }, new Date(ts)));
		await ev("avaliou_bloco", { licao: "l1", bloco: "l1-b1" }, { avaliacao: "ruim", motivos: [], texto: "" }, "2026-10-31T10:00:00.000Z");
		await ev("avaliou_bloco", { licao: "l1", bloco: "l1-b1" }, { avaliacao: "ruim", motivos: ["longo"], texto: "" }, "2026-11-01T11:00:00.000Z");
		await ev("pediu_explicacao", { licao: "l1", bloco: "l1-b1" }, { trecho: "reta", tipo: "nao_sei" }, "2026-11-01T12:00:00.000Z");
		const montada = await evidenciaDoModulo(dados, modulo());
		expect(montada.eventosLidos).toBe(2);
		expect(montada.retornos).toBe(2);
		expect(montada.mandadas.map((item) => item.linha)).toEqual(["l1-b1 · conceito · conceito.md · Feedback Ruim, motivos longo demais", "l1-b1 · conceito · conceito.md · Não sei o que é isso: «reta»"]);
		expect(montada.blocos.map((item) => item.bloco)).toEqual(["l1-b1"]);
	});
});

describe("os ajustes no disco", () => {
	it("sem arquivo, vazio; gravar com os estados novos, ler, listar; o arquivo fica em aprendiz/metodo", async () => {
		expect((await lerAjustes(dados, "exemplos.md")).ajustes).toEqual([]);
		expect(await listarAjustes(dados)).toEqual([]);
		expect(await contarEmTeste(dados)).toBe(0);
		await gravarAjustes(dados, {
			arquivo: "exemplos.md",
			titulo: "Ajustes do Breno para exemplos.md",
			ajustes: [
				{ id: "a-1", estado: "em teste", texto: "Primeiro.", comentario: "origem: calculo-i/p1-regressao/m1/p1 · evidências: e1, e2 · começou em 2026-11-03" },
				{ id: "a-2", estado: "descartado", texto: "Segundo.", comentario: null },
				{ id: "a-3", estado: "mantido", texto: "Terceiro.", comentario: null },
			],
		});
		expect(caminhoDosAjustes(dados, "exemplos.md")).toBe(join(dados, "aprendiz", "metodo", "exemplos.md"));
		expect(await readFile(caminhoDosAjustes(dados, "exemplos.md"), "utf8")).toBe(
			"# Ajustes do Breno para exemplos.md\n\n## a-1 · em teste\nPrimeiro.\n<!-- origem: calculo-i/p1-regressao/m1/p1 · evidências: e1, e2 · começou em 2026-11-03 -->\n\n## a-2 · descartado\nSegundo.\n\n## a-3 · mantido\nTerceiro.\n",
		);
		expect(await contarEmTeste(dados)).toBe(1);
		const lista = await listarAjustes(dados);
		expect(lista).toHaveLength(1);
		expect(lista[0]!.ajustes.map((item) => [item.id, item.estado])).toEqual([
			["a-1", "em teste"],
			["a-2", "descartado"],
			["a-3", "mantido"],
		]);
		expect(lista[0]!.ajustes[0]!.origem).toMatchObject({ materia: MATERIA, curso: CURSO, modulo: "m1", proposta: "p1", em: "2026-11-03" });
		expect(() => caminhoDosAjustes(dados, "outro.md")).toThrow(/não é um arquivo de metodologia/);
	});

	it("o arquivo no formato antigo (ativo e desligado) é lido e regravado com os estados novos", async () => {
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAjustes(dados, "quiz.md"), "# Ajustes do Breno para quiz.md\n\n## a-20261103-1 · ativo\nUm.\n<!-- proposta: m1/p1 · aprovado em 2026-11-03 -->\n\n## a-20261103-2 · desligado\nDois.\n", "utf8");
		const lido = await lerAjustes(dados, "quiz.md");
		expect(lido.ajustes.map((item) => item.estado)).toEqual(["em teste", "descartado"]);
		expect(await contarEmTeste(dados)).toBe(1);
		await gravarAjustes(dados, lido);
		const texto = await readFile(caminhoDosAjustes(dados, "quiz.md"), "utf8");
		expect(texto).toContain("## a-20261103-1 · em teste");
		expect(texto).toContain("## a-20261103-2 · descartado");
	});

	it("um arquivo ilegível não é sobrescrito, aparece com o erro na lista e a leitura de todos dá erro", async () => {
		const quebrado = "Nota solta.\n## a-1 · em teste\nTexto.\n";
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAjustes(dados, "conceito.md"), quebrado, "utf8");
		await gravarAjustes(dados, { arquivo: "quiz.md", titulo: "Ajustes do Breno para quiz.md", ajustes: [{ id: "a-1", estado: "em teste", texto: "Um.", comentario: null }] });
		await expect(lerAjustes(dados, "conceito.md")).rejects.toThrow(/Não consegui ler os ajustes do método .*conceito\.md: a linha 1 tem texto fora de um ajuste\. Corrija/);
		await expect(lerTodosOsAjustes(dados)).rejects.toThrow(ErroMetodo);
		expect(await readFile(caminhoDosAjustes(dados, "conceito.md"), "utf8")).toBe(quebrado);
		const lista = await listarAjustes(dados);
		expect(lista.map((item) => item.arquivo)).toEqual(["conceito.md", "quiz.md"]);
		expect(lista[0]).toMatchObject({ arquivo: "conceito.md", ajustes: [], erro: expect.stringContaining("texto fora de um ajuste") });
		// O contador ignora o arquivo ilegível.
		expect(await contarEmTeste(dados)).toBe(1);
	});
});

describe("o aprendizados.md no disco", () => {
	it("sem arquivo, nenhum; gravar, ler, listar na tela; o bloco <o-que-facilita> só com observado e confirmado", async () => {
		expect((await lerAprendizados(dados)).aprendizados).toEqual([]);
		expect(await lerOQueFacilita(dados)).toBe("");
		expect(await listarAprendizados(dados)).toEqual({ itens: [] });
		await gravarAprendizados(dados, {
			titulo: "O que facilita para o Breno",
			aprendizados: [
				{ id: "ap-1", situacao: "observado", texto: "Exemplos primeiro.", comentario: "origem: calculo-i/p1-regressao/m2 · evidências: e1 · registrado em 2026-11-03" },
				{ id: "ap-2", situacao: "contradito", texto: "Tabelas.", comentario: null },
			],
		});
		expect(caminhoDosAprendizados(dados)).toBe(join(dados, "aprendiz", "metodo", "aprendizados.md"));
		expect(await readFile(caminhoDosAprendizados(dados), "utf8")).toBe(
			"# O que facilita para o Breno\n\n## ap-1 · observado\nExemplos primeiro.\n<!-- origem: calculo-i/p1-regressao/m2 · evidências: e1 · registrado em 2026-11-03 -->\n\n## ap-2 · contradito\nTabelas.\n",
		);
		expect((await lerOQueFacilita(dados)).split("\n")).toEqual(["<o-que-facilita>", "O que já se observou que facilita o aprendizado do Breno. Use como orientação, não como regra.", "", "- Exemplos primeiro.", "</o-que-facilita>"]);
		const tela = await listarAprendizados(dados);
		expect(tela.itens.map((item) => [item.id, item.situacao])).toEqual([
			["ap-1", "observado"],
			["ap-2", "contradito"],
		]);
		expect(tela.itens[0]!.origem).toMatchObject({ modulo: "m2", em: "2026-11-03" });
	});

	it("um arquivo que não se lê dá erro, não é sobrescrito, e a listagem vai com o erro", async () => {
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAprendizados(dados), "## ap-1 · talvez\nTexto.\n", "utf8");
		await expect(lerAprendizados(dados)).rejects.toThrow(/Não consegui ler os aprendizados do método .*aprendizados\.md: a linha 1 não está no formato.*nada foi gravado por cima/);
		await expect(lerOQueFacilita(dados)).rejects.toThrow(ErroMetodo);
		expect(await listarAprendizados(dados)).toEqual({ itens: [], erro: expect.stringContaining("Não consegui ler os aprendizados do método") });
		expect(await readFile(caminhoDosAprendizados(dados), "utf8")).toBe("## ap-1 · talvez\nTexto.\n");
	});
});

describe("o histórico lido do disco e o contexto da análise", () => {
	const concluir = async (id: string, em: string, extra: Partial<ModuloGerado> = {}, curso = CURSO) => {
		await gravarModulo(dados, modulo(id, { concluidoEm: em, curso, ...extra }));
	};

	beforeEach(async () => {
		await criarMateria(dados, { nome: "Cálculo I" });
		let curso = novoCurso(CURSO, MATERIA, { nome: "P1: regressão", prazo: null, prova: "P1", horasPorSemana: 4 }, AGORA);
		curso = confirmarEtapa(curso, "materiais", { arquivos: [] }, AGORA).curso;
		await gravarCurso(dados, curso);
	});

	it("modulosConcluidos lê os módulos concluídos de todas as matérias e cursos, com os nomes", async () => {
		await concluir("m1", "2026-10-20T10:00:00.000Z");
		await concluir("m2", "2026-10-22T10:00:00.000Z");
		await gravarModulo(dados, modulo("m3", { concluidoEm: undefined }));
		const lidos = await modulosConcluidos(dados);
		expect(lidos.map((item) => [item.modulo.id, item.cursoNome, item.moduloNome])).toEqual([
			["m1", "P1: regressão", "m1"],
			["m2", "P1: regressão", "m2"],
		]);
	});

	it("o contexto: o placar, o histórico, a comparação, os experimentos em teste com os módulos em que valeram, os mantidos, os descartados e os aprendizados", async () => {
		await concluir("m1", "2026-10-20T10:00:00.000Z", { ajustesUsados: [{ arquivo: "dissertativa.md", ajuste: "a-1", estado: "em teste" }] });
		await concluir("m2", "2026-10-25T10:00:00.000Z", {
			ajustesUsados: [
				{ arquivo: "dissertativa.md", ajuste: "a-1", estado: "em teste" },
				{ arquivo: "quiz.md", ajuste: "a-9", estado: "mantido" },
			],
		});
		await concluir("m3", "2026-11-02T10:00:00.000Z", { ajustesUsados: [{ arquivo: "dissertativa.md", ajuste: "a-1", estado: "em teste" }] });
		await concluir("m4", "2026-11-04T10:00:00.000Z");
		await gravarAjustes(dados, {
			arquivo: "dissertativa.md",
			titulo: "Ajustes do Breno para dissertativa.md",
			ajustes: [
				{ id: "a-1", estado: "em teste", texto: "Confira a rubrica.", comentario: "origem: calculo-i/p1-regressao/m1/p1 · evidências: e1 · começou em 2026-10-20" },
				{ id: "a-2", estado: "descartado", texto: "Um que não deu.", comentario: null },
			],
		});
		await gravarAjustes(dados, { arquivo: "quiz.md", titulo: "Ajustes do Breno para quiz.md", ajustes: [{ id: "a-9", estado: "mantido", texto: "Alternativas plausíveis.", comentario: null }] });
		await gravarAprendizados(dados, { titulo: "O que facilita para o Breno", aprendizados: [{ id: "ap-1", situacao: "observado", texto: "Exemplos primeiro.", comentario: null }] });
		const eventos = [
			criarEvento({ verbo: "respondeu_questao", objeto: { materia: MATERIA, curso: CURSO, modulo: "m3", licao: "l1", questao: "q1" }, resultado: { tentativa: 1, correta: true, confianca: 3 } }, new Date("2026-11-01T12:00:00.000Z")),
			criarEvento({ verbo: "respondeu_questao", objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", licao: "l1", questao: "q1" }, resultado: { tentativa: 1, correta: false, confianca: 3 } }, new Date("2026-10-19T12:00:00.000Z")),
		];
		const atual = (await modulosConcluidos(dados)).find((item) => item.modulo.id === "m3")!.modulo;
		const contexto = await montarContextoDaAnalise(dados, atual, eventos);
		expect(contexto.historico.map((item) => item.modulo)).toEqual(["m1", "m2"]);
		expect(contexto.placar.quiz).toEqual({ acertos: 1, total: 1, taxa: 1 });
		expect(contexto.comparacao.quiz).toMatchObject({ atual: 1, nAtual: 1, modulos: 0 });
		expect(contexto.ajustesUsados).toEqual([{ arquivo: "dissertativa.md", ajuste: "a-1", estado: "em teste" }]);
		expect(contexto.emTeste).toEqual([
			{
				arquivo: "dissertativa.md",
				id: "a-1",
				texto: "Confira a rubrica.",
				comecouEm: "2026-10-20",
				testadoEm: [
					{ materia: MATERIA, curso: CURSO, modulo: "m1", moduloNome: "m1", atual: false },
					{ materia: MATERIA, curso: CURSO, modulo: "m2", moduloNome: "m2", atual: false },
					{ materia: MATERIA, curso: CURSO, modulo: "m3", moduloNome: "m3", atual: true },
				],
			},
		]);
		expect(contexto.mantidos).toEqual([{ arquivo: "quiz.md", id: "a-9", texto: "Alternativas plausíveis." }]);
		expect(contexto.descartados).toEqual([{ arquivo: "dissertativa.md", id: "a-2", texto: "Um que não deu." }]);
		expect(contexto.aprendizados.map((item) => item.id)).toEqual(["ap-1"]);
	});

	it("um arquivo de ajustes ou de aprendizados ilegível impede montar o contexto", async () => {
		await concluir("m1", "2026-10-20T10:00:00.000Z");
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAprendizados(dados), "texto solto\n", "utf8");
		await expect(montarContextoDaAnalise(dados, modulo("m1"), [])).rejects.toThrow(/aprendizados do método/);
	});
});

describe("aplicar a análise", () => {
	const ajusteDe = (id: string, texto: string, estado: "em teste" | "mantido" | "descartado" = "em teste") => ({ id, estado, texto, comentario: `origem: ${MATERIA}/${CURSO}/m1/p1 · evidências: e1, e2 · começou em 2026-10-30` });
	const testado = (modulo: string, atual = false) => ({ materia: MATERIA, curso: CURSO, modulo, moduloNome: modulo, atual });
	const EM_TESTE = [
		{ arquivo: "dissertativa.md" as const, id: "a-1", texto: "Confira a rubrica antes de entregar.", testadoEm: [testado("m1"), testado("m2", true)] },
		{ arquivo: "exemplos.md" as const, id: "a-2", texto: "Diga antes o que o exemplo vai mostrar.", testadoEm: [testado("m2", true)] },
	];

	beforeEach(async () => {
		await gravarAjustes(dados, { arquivo: "dissertativa.md", titulo: "Ajustes do Breno para dissertativa.md", ajustes: [ajusteDe("a-1", EM_TESTE[0]!.texto)] });
		await gravarAjustes(dados, { arquivo: "exemplos.md", titulo: "Ajustes do Breno para exemplos.md", ajustes: [ajusteDe("a-2", EM_TESTE[1]!.texto)] });
		await gravarAprendizados(dados, {
			titulo: "O que facilita para o Breno",
			aprendizados: [{ id: "ap-20261102-1", situacao: "observado", texto: "Blocos curtos funcionam.", comentario: null }],
		});
	});

	const analisar = (resposta: Record<string, unknown>) =>
		pronto(resposta, { evidencias: IDS, emTeste: EM_TESTE, vigentes: { "dissertativa.md": [EM_TESTE[0]!.texto], "exemplos.md": [EM_TESTE[1]!.texto] }, aprendizados: [{ id: "ap-20261102-1", texto: "Blocos curtos funcionam.", situacao: "observado" }] });

	it("manter e descartar mudam o estado; continuar não muda; os eventos decidiu_experimento_metodo; aplicadoEm e o relatório de entrada não mudam", async () => {
		const relatorio = analisar({
			propostas: [],
			experimentos: [
				{ ajuste: "dissertativa.md#a-1", decisao: "manter", porque: "Subiu de 2 para 3,5 (n=2)." },
				{ ajuste: "exemplos.md#a-2", decisao: "continuar", porque: "Só um módulo." },
			],
		});
		const aplicado = await aplicarAnalise(dados, MATERIA, CURSO, relatorio, { sessao: "s1", agora: AGORA });
		expect(aplicado.aplicadoEm).toBe(AGORA.toISOString());
		expect(aplicado.erroAoAplicar).toBeUndefined();
		expect(relatorio.aplicadoEm).toBeUndefined();
		expect((await lerAjustes(dados, "dissertativa.md")).ajustes[0]).toMatchObject({ id: "a-1", estado: "mantido", comentario: ajusteDe("a-1", "").comentario });
		expect((await lerAjustes(dados, "exemplos.md")).ajustes[0]!.estado).toBe("em teste");
		const eventos = await doAprendiz("decidiu_experimento_metodo");
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({
			sessao: "s1",
			objeto: { arquivo: "dissertativa.md", ajuste: "a-1", materia: MATERIA, curso: CURSO, modulo: "m1" },
			resultado: { decisao: "manter", porque: "Subiu de 2 para 3,5 (n=2).", modulosTestados: 2 },
		});
		expect(eventos[0]!.resultado!.novo).toBeUndefined();

		// Descartar.
		const descartando = analisar({ propostas: [], experimentos: [{ ajuste: "exemplos.md#a-2", decisao: "descartar", porque: "Não mudou nada." }] });
		await aplicarAnalise(dados, MATERIA, CURSO, descartando, { agora: AGORA });
		expect((await lerAjustes(dados, "exemplos.md")).ajustes[0]!.estado).toBe("descartado");
		expect(await contarEmTeste(dados)).toBe(0);
	});

	it("reescrever deixa o antigo descartado com 'substituído por' e acrescenta o novo em teste com 'reescrita de', e grava os dois eventos", async () => {
		const relatorio = analisar({
			propostas: [],
			experimentos: [{ ajuste: "dissertativa.md#a-1", decisao: "reescrever", texto: "Releia a rubrica e confira cada critério antes de entregar.", porque: "O professor não seguiu: vago." }],
		});
		const aplicado = await aplicarAnalise(dados, MATERIA, CURSO, relatorio, { agora: AGORA });
		const dia = "2026-11-03";
		expect(aplicado.experimentos[0]).toMatchObject({ decisao: "reescrever", novo: "dissertativa.md#a-20261103-1", textoNovo: "Releia a rubrica e confira cada critério antes de entregar." });
		const arquivo = await lerAjustes(dados, "dissertativa.md");
		expect(arquivo.ajustes).toEqual([
			{ id: "a-1", estado: "descartado", texto: EM_TESTE[0]!.texto, comentario: `${ajusteDe("a-1", "").comentario} · substituído por a-20261103-1` },
			{
				id: "a-20261103-1",
				estado: "em teste",
				texto: "Releia a rubrica e confira cada critério antes de entregar.",
				comentario: `origem: ${MATERIA}/${CURSO}/m1 · reescrita de dissertativa.md#a-1 · começou em ${dia}`,
			},
		]);
		const [decidiu] = await doAprendiz("decidiu_experimento_metodo");
		expect(decidiu).toMatchObject({ objeto: { arquivo: "dissertativa.md", ajuste: "a-1" }, resultado: { decisao: "reescrever", modulosTestados: 2, novo: "dissertativa.md#a-20261103-1" } });
		const [iniciou] = await doAprendiz("iniciou_experimento_metodo");
		expect(iniciou).toMatchObject({
			objeto: { arquivo: "dissertativa.md", ajuste: "a-20261103-1", materia: MATERIA, curso: CURSO, modulo: "m1", reescritaDe: "dissertativa.md#a-1" },
			resultado: { texto: "Releia a rubrica e confira cada critério antes de entregar." },
		});
		expect(iniciou!.objeto.proposta).toBeUndefined();
		expect(await contarEmTeste(dados)).toBe(2);
	});

	it("as propostas que entraram viram ajustes em teste com a origem e o evento iniciou_experimento_metodo; os aprendizados e as revisões vão para o aprendizados.md", async () => {
		const relatorio = analisar({
			propostas: [
				{ arquivo: "exemplos.md", ajuste: "Abra cada exemplo com um caso concreto.", porque: "Ele se perdeu.", evidencias: ["ev-a", "ev-b"] },
				{ arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "Foram fáceis.", evidencias: ["ev-a", "ev-b"] },
			],
			experimentos: [
				{ ajuste: "dissertativa.md#a-1", decisao: "manter", porque: "Subiu." },
				{ ajuste: "exemplos.md#a-2", decisao: "descartar", porque: "Nada mudou." },
			],
			aprendizados: [{ texto: "Exemplos concretos antes da definição ajudam.", porque: "O entendimento subiu de 3 para 4,5.", evidencias: ["ev-c"] }],
			revisoes: [{ aprendizado: "ap-20261102-1", situacao: "confirmado", porque: "Voltou a acontecer em 4 blocos." }],
		});
		expect(relatorio.propostas.map((item) => item.id)).toEqual(["p1", "p2"]);
		const aplicado = await aplicarAnalise(dados, MATERIA, CURSO, relatorio, { sessao: "s1", agora: AGORA });
		expect(aplicado.erroAoAplicar).toBeUndefined();
		expect(aplicado.propostas.map((item) => item.novo)).toEqual(["exemplos.md#a-20261103-1", "quiz.md#a-20261103-1"]);
		expect(aplicado.aprendizados[0]!.novo).toBe("ap-20261103-1");
		const exemplos = await lerAjustes(dados, "exemplos.md");
		expect(exemplos.ajustes.map((item) => [item.id, item.estado])).toEqual([
			["a-2", "descartado"],
			["a-20261103-1", "em teste"],
		]);
		expect(exemplos.ajustes[1]).toMatchObject({ texto: "Abra cada exemplo com um caso concreto.", comentario: `origem: ${MATERIA}/${CURSO}/m1/p1 · evidências: ev-a, ev-b · começou em 2026-11-03` });
		expect((await lerAjustes(dados, "quiz.md")).ajustes[0]).toMatchObject({ id: "a-20261103-1", estado: "em teste", texto: "Use alternativas plausíveis.", comentario: expect.stringContaining("/m1/p2 ·") });
		const iniciados = await doAprendiz("iniciou_experimento_metodo");
		expect(iniciados.map((item) => [item.objeto.arquivo, item.objeto.ajuste, item.objeto.proposta])).toEqual([
			["exemplos.md", "a-20261103-1", "p1"],
			["quiz.md", "a-20261103-1", "p2"],
		]);
		expect(iniciados[0]!.resultado).toEqual({ texto: "Abra cada exemplo com um caso concreto.", evidencias: ["ev-a", "ev-b"] });
		expect(iniciados[0]!.sessao).toBe("s1");
		const aprendizados = await lerAprendizados(dados);
		expect(aprendizados.aprendizados.map((item) => [item.id, item.situacao])).toEqual([
			["ap-20261102-1", "confirmado"],
			["ap-20261103-1", "observado"],
		]);
		expect(aprendizados.aprendizados[1]!.comentario).toBe(`origem: ${MATERIA}/${CURSO}/m1 · evidências: ev-c · registrado em 2026-11-03`);
		const [registrou] = await doAprendiz("registrou_aprendizado_metodo");
		expect(registrou).toMatchObject({ objeto: { aprendizado: "ap-20261103-1", materia: MATERIA, curso: CURSO, modulo: "m1" }, resultado: { texto: "Exemplos concretos antes da definição ajudam.", porque: "O entendimento subiu de 3 para 4,5.", evidencias: ["ev-c"] } });
		const [reviu] = await doAprendiz("reviu_aprendizado_metodo");
		expect(reviu).toMatchObject({ objeto: { aprendizado: "ap-20261102-1" }, resultado: { situacao: "confirmado", porque: "Voltou a acontecer em 4 blocos." } });
		// Os eventos de uma aplicação saem com instantes crescentes e só de acréscimo.
		const todos = (await lerEventos(eventosAprendiz(dados))).eventos;
		expect(todos.map((item) => item.verbo)).toEqual([
			"decidiu_experimento_metodo",
			"decidiu_experimento_metodo",
			"iniciou_experimento_metodo",
			"iniciou_experimento_metodo",
			"registrou_aprendizado_metodo",
			"reviu_aprendizado_metodo",
		]);
		expect([...todos.map((item) => item.ts)].sort()).toEqual(todos.map((item) => item.ts));
		expect(await contarEmTeste(dados)).toBe(2);
	});

	it("o relatório pouco_retorno ou sem decisões não muda nada", async () => {
		const placar = placarDoModuloNosEventos([], modulo());
		const pouco = novoRelatorio({ modulo: "m1", geradoEm: "2026-11-03T10:00:00.000Z", eventosLidos: 0, retornos: 0, placar, comparacao: compararComHistorico(placar, []) });
		const feito = await aplicarAnalise(dados, MATERIA, CURSO, pouco, { agora: AGORA });
		expect(feito.aplicadoEm).toBeUndefined();
		expect((await lerEventos(eventosAprendiz(dados))).eventos).toHaveLength(0);
		const vazio = await aplicarAnalise(dados, MATERIA, CURSO, analisar({ propostas: [] }), { agora: AGORA });
		expect(vazio.aplicadoEm).toBe(AGORA.toISOString());
		expect((await lerEventos(eventosAprendiz(dados))).eventos).toHaveLength(0);
		expect(await readFile(caminhoDosAjustes(dados, "exemplos.md"), "utf8")).toContain("## a-2 · em teste");
	});

	it("se falhar no meio, o relatório guarda o erroAoAplicar e o aplicadoEm do que já foi feito; o arquivo ilegível não é sobrescrito", async () => {
		await writeFile(caminhoDosAprendizados(dados), "texto solto\n", "utf8");
		const relatorio = analisar({
			propostas: [],
			experimentos: [{ ajuste: "dissertativa.md#a-1", decisao: "manter", porque: "Subiu." }],
			aprendizados: [{ texto: "Um aprendizado.", porque: "Porque sim.", evidencias: ["ev-c"] }],
		});
		const aplicado = await aplicarAnalise(dados, MATERIA, CURSO, relatorio, { agora: AGORA });
		expect(aplicado.erroAoAplicar).toMatch(/Não consegui ler os aprendizados do método/);
		expect(aplicado.aplicadoEm).toBe(AGORA.toISOString());
		expect((await lerAjustes(dados, "dissertativa.md")).ajustes[0]!.estado).toBe("mantido");
		expect(await readFile(caminhoDosAprendizados(dados), "utf8")).toBe("texto solto\n");
		expect(await doAprendiz("decidiu_experimento_metodo")).toHaveLength(1);
		expect(await doAprendiz("registrou_aprendizado_metodo")).toHaveLength(0);
		expect(aplicado.aprendizados[0]!.novo).toBeUndefined();
	});

	it("se falhar antes de aplicar qualquer coisa, só o erroAoAplicar (sem aplicadoEm): dá para gerar de novo", async () => {
		// O Breno descartou o experimento à mão entre a conferência e a aplicação.
		await gravarAjustes(dados, { arquivo: "dissertativa.md", titulo: "Ajustes do Breno para dissertativa.md", ajustes: [ajusteDe("a-1", EM_TESTE[0]!.texto, "descartado")] });
		const relatorio = analisar({ propostas: [], experimentos: [{ ajuste: "dissertativa.md#a-1", decisao: "manter", porque: "Subiu." }] });
		const aplicado = await aplicarAnalise(dados, MATERIA, CURSO, relatorio, { agora: AGORA });
		expect(aplicado.erroAoAplicar).toBe("O experimento dissertativa.md#a-1 não está mais em teste; a decisão sobre ele não foi aplicada.");
		expect(aplicado.aplicadoEm).toBeUndefined();
		expect((await lerEventos(eventosAprendiz(dados))).eventos).toHaveLength(0);
		// E o relatório com erro e sem aplicadoEm pode ser gerado de novo.
		await gravarRelatorio(dados, MATERIA, CURSO, aplicado);
		await expect(registrarRelatorio(dados, MATERIA, CURSO, pronto())).resolves.toBeDefined();
	});

	it("uma proposta igual a um ajuste que já vale (escrito à mão depois da conferência) não repete o ajuste nem o evento", async () => {
		await gravarAjustes(dados, { arquivo: "quiz.md", titulo: "Ajustes do Breno para quiz.md", ajustes: [{ id: "a-77", estado: "mantido", texto: "use alternativas PLAUSÍVEIS.", comentario: null }] });
		const aplicado = await aplicarAnalise(dados, MATERIA, CURSO, analisar({ propostas: [{ arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "Foram fáceis.", evidencias: ["ev-a", "ev-b"] }], experimentos: [{ ajuste: "dissertativa.md#a-1", decisao: "descartar", porque: "Nada." }] }), { agora: AGORA });
		expect(aplicado.propostas.map((item) => item.novo)).toEqual(["quiz.md#a-77"]);
		expect((await lerAjustes(dados, "quiz.md")).ajustes).toHaveLength(1);
		expect(await doAprendiz("iniciou_experimento_metodo")).toHaveLength(0);
	});
});
