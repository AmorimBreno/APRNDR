// Testes do feedback nos módulos (docs/modulos.md, "O feedback"): as regras
// puras (as avaliações e a leitura da antiga melhorar, a nota pela versão do
// bloco, a validação e o resumo do questionário, aplicar a nota e o
// questionário) e o disco numa pasta de dados temporária (o <módulo>.json com
// feedback e questionarios, o avaliou_licao no aprendiz/eventos.jsonl e a
// reescrita de um bloco mantendo o feedback).

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gravarBlocoReescrito } from "./escrita.ts";
import { lerEventos } from "./eventos.ts";
import { eventosAprendiz } from "./materias.ts";
import {
	AVALIACOES_BLOCO,
	aplicarFeedback,
	aplicarQuestionario,
	avaliacaoLida,
	ehAvaliacaoBloco,
	ehAvaliacaoGravada,
	feedbackDoBloco,
	gravarFeedback,
	IDS_PERGUNTAS_LICAO,
	NOMES_AVALIACAO,
	NOMES_NIVEL,
	PERGUNTAS_LICAO,
	questionarioDaLicao,
	registrarQuestionario,
	resumoDoQuestionario,
	validarQuestionario,
} from "./modulo-feedback.ts";
import { type Bloco, caminhoDoModulo, ErroModulo, lerModulo, MINIMO_CARACTERES_EXEMPLO, type ModuloAguardando, type ModuloGerado } from "./modulos.ts";

const AGORA = new Date("2026-10-29T13:00:00.000Z");
const DEPOIS = new Date("2026-10-29T14:00:00.000Z");
const MODELO = "openrouter/openai/gpt-6.1-sol";
const MATERIA = "calculo-i";
const CURSO = "p1-regressao";

const explicacao = (id: string, extra: Partial<Bloco> = {}): Bloco =>
	({ id, tipo: "explicacao", conceitos: ["c-a"], formato: "exemplo_resolvido", texto: `Texto de ${id}. ${"x".repeat(MINIMO_CARACTERES_EXEMPLO)}`, referencias: [], ...extra }) as Bloco;

const moduloGerado = (): ModuloGerado => ({
	versao: 1,
	id: "m1",
	curso: CURSO,
	materia: MATERIA,
	situacao: "gerado",
	licoes: [
		{ id: "l1", titulo: "A reta", objetivo: "", conceitos: ["c-a", "c-b"], blocos: [explicacao("l1-b1"), explicacao("l1-b2")] },
		{ id: "l2", titulo: "A curva", objetivo: "", conceitos: ["c-b"], blocos: [explicacao("l2-b1", { conceitos: ["c-b"] })] },
	],
	geradoEm: AGORA.toISOString(),
	modelo: MODELO,
	custo: 0.12,
	materiaisUsados: [],
});

describe("as avaliações", () => {
	it("ruim, bom e otimo, com os nomes; a antiga melhorar tem o nome de ruim", () => {
		expect(AVALIACOES_BLOCO).toEqual(["ruim", "bom", "otimo"]);
		expect(NOMES_AVALIACAO).toEqual({ ruim: "Ruim", bom: "Bom", otimo: "Ótimo", melhorar: "Ruim" });
	});

	it("só as novas valem num feedback novo; a antiga é lida como ruim", () => {
		expect(ehAvaliacaoBloco("otimo")).toBe(true);
		expect(ehAvaliacaoBloco("melhorar")).toBe(false);
		expect(ehAvaliacaoGravada("melhorar")).toBe(true);
		expect(ehAvaliacaoGravada("excelente")).toBe(false);
		expect(avaliacaoLida("melhorar")).toBe("ruim");
		expect(avaliacaoLida("bom")).toBe("bom");
		expect(avaliacaoLida("otimo")).toBe("otimo");
		expect(avaliacaoLida("excelente")).toBeUndefined();
		expect(avaliacaoLida(undefined)).toBeUndefined();
	});
});

describe("a nota pela versão do bloco", () => {
	const nota = { avaliacao: "bom", versao: 1, em: AGORA.toISOString(), evento: "e-1" };

	it("vale a da versão atual; um bloco reescrito começa sem nota", () => {
		expect(feedbackDoBloco({ "l1-b1": nota }, explicacao("l1-b1"))).toEqual(nota);
		expect(feedbackDoBloco({ "l1-b1": nota }, explicacao("l1-b1", { versao: 2 }))).toBeUndefined();
		expect(feedbackDoBloco({ "l1-b1": { ...nota, versao: 2 } }, explicacao("l1-b1", { versao: 2 }))).toEqual({ ...nota, versao: 2 });
	});

	it("sem feedback, de outro bloco ou fora do formato: sem nota", () => {
		expect(feedbackDoBloco(undefined, explicacao("l1-b1"))).toBeUndefined();
		expect(feedbackDoBloco({ "l1-b2": nota }, explicacao("l1-b1"))).toBeUndefined();
		expect(feedbackDoBloco({ "l1-b1": { ...nota, avaliacao: "melhorar" } }, explicacao("l1-b1"))).toBeUndefined();
		expect(feedbackDoBloco({ "l1-b1": "bom" }, explicacao("l1-b1"))).toBeUndefined();
	});

	it("aplicarFeedback: a nota com a versão atual do bloco, no lugar da anterior; o recebido não muda", () => {
		const modulo = moduloGerado();
		modulo.licoes[0]!.blocos[1] = explicacao("l1-b2", { versao: 3 });
		const antes = structuredClone(modulo);
		const primeiro = aplicarFeedback(modulo, "l1", "l1-b2", { avaliacao: "ruim", evento: "e-1", agora: AGORA });
		expect(primeiro.feedback).toEqual({ "l1-b2": { avaliacao: "ruim", versao: 3, em: AGORA.toISOString(), evento: "e-1" } });
		const segundo = aplicarFeedback(primeiro, "l1", "l1-b1", { avaliacao: "otimo", evento: "e-2", agora: DEPOIS });
		const terceiro = aplicarFeedback(segundo, "l1", "l1-b2", { avaliacao: "bom", evento: "e-3", agora: DEPOIS });
		expect(terceiro.feedback).toEqual({
			"l1-b2": { avaliacao: "bom", versao: 3, em: DEPOIS.toISOString(), evento: "e-3" },
			"l1-b1": { avaliacao: "otimo", versao: 1, em: DEPOIS.toISOString(), evento: "e-2" },
		});
		expect(modulo).toEqual(antes);
	});

	it("aplicarFeedback: avaliação antiga ou inválida, lição ou bloco que não existe, módulo aguardando: erro", () => {
		const modulo = moduloGerado();
		expect(() => aplicarFeedback(modulo, "l1", "l1-b1", { avaliacao: "melhorar", evento: "e" })).toThrow(ErroModulo);
		expect(() => aplicarFeedback(modulo, "l9", "l1-b1", { avaliacao: "bom", evento: "e" })).toThrow('Não achei a lição "l9" no módulo m1.');
		expect(() => aplicarFeedback(modulo, "l1", "l2-b1", { avaliacao: "bom", evento: "e" })).toThrow('Não achei o bloco "l2-b1" na lição l1.');
		const aguardando: ModuloAguardando = { versao: 1, id: "m1", curso: CURSO, materia: MATERIA, situacao: "aguardando_material", aguardando: { nota: "", desde: "", prontos: [] }, licoes: [] };
		expect(() => aplicarFeedback(aguardando, "l1", "l1-b1", { avaliacao: "bom", evento: "e" })).toThrow(/aguardando material/);
	});
});

describe("o questionário da lição", () => {
	it("as cinco perguntas fixas, na ordem, e os níveis de 1 a 5 com os nomes", () => {
		expect(IDS_PERGUNTAS_LICAO).toEqual(["entendimento", "clareza", "exemplos", "questoes", "ritmo"]);
		expect(PERGUNTAS_LICAO[0]).toEqual({ id: "entendimento", texto: "Você sente que entendeu os conceitos?" });
		expect(PERGUNTAS_LICAO[4]!.texto).toBe("O tamanho e o ritmo da lição foram bons para você?");
		expect(NOMES_NIVEL).toEqual({ 1: "Muito ruim", 2: "Ruim", 3: "Bom", 4: "Ótimo", 5: "Excelente" });
	});

	it("validarQuestionario: as notas na ordem das perguntas, o texto aparado; sem texto, vazio", () => {
		expect(validarQuestionario({ notas: { ritmo: 2, entendimento: 5 }, texto: "  Gostei.  " })).toEqual({ notas: { entendimento: 5, ritmo: 2 }, texto: "Gostei." });
		expect(Object.keys(validarQuestionario({ notas: { ritmo: 2, entendimento: 5 } }).notas)).toEqual(["entendimento", "ritmo"]);
		expect(validarQuestionario({ notas: { clareza: 1 }, texto: null })).toEqual({ notas: { clareza: 1 }, texto: "" });
		expect(validarQuestionario({ notas: { clareza: 3 }, texto: "x".repeat(1000) }).texto).toHaveLength(1000);
	});

	it("validarQuestionario: nota fora de 1 a 5 ou não inteira, pergunta desconhecida, nenhuma nota, texto longo: erro", () => {
		expect(() => validarQuestionario({ notas: { clareza: 0 } })).toThrow('A nota de "clareza" não é válida ("0"): é um inteiro de 1 a 5.');
		expect(() => validarQuestionario({ notas: { clareza: 6 } })).toThrow(/inteiro de 1 a 5/);
		expect(() => validarQuestionario({ notas: { clareza: 2.5 } })).toThrow(/inteiro de 1 a 5/);
		expect(() => validarQuestionario({ notas: { clareza: "3" } })).toThrow(/inteiro de 1 a 5/);
		expect(() => validarQuestionario({ notas: { humor: 3 } })).toThrow('Pergunta do questionário desconhecida ("humor").');
		expect(() => validarQuestionario({ notas: {} })).toThrow("Responda pelo menos uma pergunta do questionário.");
		expect(() => validarQuestionario({ notas: [3] })).toThrow(/formato/);
		expect(() => validarQuestionario({})).toThrow(/formato/);
		expect(() => validarQuestionario({ notas: { clareza: 3 }, texto: 3 })).toThrow("O texto do questionário não é um texto.");
		expect(() => validarQuestionario({ notas: { clareza: 3 }, texto: "x".repeat(1001) })).toThrow("O texto do questionário tem 1001 caracteres; o máximo é 1000.");
	});

	it("resumoDoQuestionario: só as respondidas, na ordem das perguntas, com o nome do nível", () => {
		expect(resumoDoQuestionario({ notas: { ritmo: 1, clareza: 5 } })).toEqual([
			{ pergunta: "clareza", texto: "As explicações estavam claras?", nota: 5, nome: "Excelente" },
			{ pergunta: "ritmo", texto: "O tamanho e o ritmo da lição foram bons para você?", nota: 1, nome: "Muito ruim" },
		]);
		expect(resumoDoQuestionario({ notas: {} })).toEqual([]);
	});

	it("aplicarQuestionario e questionarioDaLicao: o último de cada lição; o recebido não muda", () => {
		const modulo = moduloGerado();
		const um = aplicarQuestionario(modulo, "l1", { notas: { clareza: 4 }, texto: "", evento: "e-1", agora: AGORA });
		const dois = aplicarQuestionario(um, "l1", { notas: { clareza: 2, ritmo: 3 }, texto: "Rápido demais.", evento: "e-2", agora: DEPOIS });
		expect(modulo.questionarios).toBeUndefined();
		expect(questionarioDaLicao(dois.questionarios, "l1")).toEqual({ notas: { clareza: 2, ritmo: 3 }, texto: "Rápido demais.", em: DEPOIS.toISOString(), evento: "e-2" });
		expect(questionarioDaLicao(dois.questionarios, "l2")).toBeUndefined();
		expect(questionarioDaLicao(undefined, "l1")).toBeUndefined();
		expect(() => aplicarQuestionario(modulo, "l9", { notas: { clareza: 4 }, texto: "", evento: "e" })).toThrow('Não achei a lição "l9" no módulo m1.');
	});
});

describe("no disco", () => {
	let dados: string;
	const doAprendiz = async () => (await lerEventos(eventosAprendiz(dados))).eventos;

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-feedback-"));
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	async function gravarNoDisco(modulo: ModuloGerado): Promise<void> {
		const arquivo = caminhoDoModulo(dados, modulo.materia, modulo.curso, modulo.id);
		await mkdir(dirname(arquivo), { recursive: true });
		await writeFile(arquivo, `${JSON.stringify(modulo, null, "\t")}\n`, "utf8");
	}

	it("gravarFeedback: a nota no <módulo>.json, lida de volta; sem módulo, erro", async () => {
		await gravarNoDisco(moduloGerado());
		const gravado = await gravarFeedback(dados, MATERIA, CURSO, "m1", "l1", "l1-b1", { avaliacao: "otimo", evento: "e-1", agora: AGORA });
		expect(await lerModulo(dados, MATERIA, CURSO, "m1")).toEqual(gravado);
		expect(gravado.feedback).toEqual({ "l1-b1": { avaliacao: "otimo", versao: 1, em: AGORA.toISOString(), evento: "e-1" } });
		await expect(gravarFeedback(dados, MATERIA, CURSO, "m2", "l1", "l1-b1", { avaliacao: "bom", evento: "e" })).rejects.toThrow("O módulo m2 ainda não foi gerado.");
	});

	it("registrarQuestionario: o questionário no <módulo>.json e o avaliou_licao; enviar de novo troca o gravado e grava outro evento", async () => {
		await gravarNoDisco(moduloGerado());
		const prompts = [{ nome: "modulo-licao.md", hash: "abc" }];
		const primeiro = await registrarQuestionario(dados, MATERIA, CURSO, "m1", "l1", { notas: { ritmo: 2, entendimento: 4 }, texto: " Bom. " }, { agora: AGORA, sessao: "s1", prompts });
		expect(primeiro.evento).toEqual({
			id: primeiro.evento.id,
			ts: AGORA.toISOString(),
			sessao: "s1",
			verbo: "avaliou_licao",
			objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", licao: "l1", conceitos: ["c-a", "c-b"] },
			resultado: { notas: { entendimento: 4, ritmo: 2 }, texto: "Bom." },
			contexto: { fase: "modulo", modelo: MODELO, prompts },
		});
		expect(primeiro.modulo.questionarios).toEqual({ l1: { notas: { entendimento: 4, ritmo: 2 }, texto: "Bom.", em: AGORA.toISOString(), evento: primeiro.evento.id } });
		expect(await lerModulo(dados, MATERIA, CURSO, "m1")).toEqual(primeiro.modulo);

		const segundo = await registrarQuestionario(dados, MATERIA, CURSO, "m1", "l1", { notas: { clareza: 5 } }, { agora: DEPOIS, modelo: "outro/modelo" });
		expect(segundo.evento).toMatchObject({ resultado: { notas: { clareza: 5 }, texto: "" }, contexto: { fase: "modulo", modelo: "outro/modelo", prompts: [] } });
		expect(segundo.evento).not.toHaveProperty("sessao");
		expect(((await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado).questionarios).toEqual({
			l1: { notas: { clareza: 5 }, texto: "", em: DEPOIS.toISOString(), evento: segundo.evento.id },
		});
		expect((await doAprendiz()).map((evento) => evento.id)).toEqual([primeiro.evento.id, segundo.evento.id]);
	});

	it("registrarQuestionario inválido, de lição que não existe ou sem módulo: erro e nada gravado", async () => {
		await gravarNoDisco(moduloGerado());
		const antes = await readFile(caminhoDoModulo(dados, MATERIA, CURSO, "m1"), "utf8");
		await expect(registrarQuestionario(dados, MATERIA, CURSO, "m1", "l1", { notas: { clareza: 7 } })).rejects.toThrow(ErroModulo);
		await expect(registrarQuestionario(dados, MATERIA, CURSO, "m1", "l9", { notas: { clareza: 3 } })).rejects.toThrow('Não achei a lição "l9" no módulo m1.');
		await expect(registrarQuestionario(dados, MATERIA, CURSO, "m3", "l1", { notas: { clareza: 3 } })).rejects.toThrow("O módulo m3 ainda não foi gerado.");
		expect(await readFile(caminhoDoModulo(dados, MATERIA, CURSO, "m1"), "utf8")).toBe(antes);
		expect(await doAprendiz()).toEqual([]);
	});

	it("o módulo lido e gravado mantém feedback e questionarios; a reescrita de um bloco também, e a nota do bloco reescrito perde o valor", async () => {
		const modulo = aplicarQuestionario(
			aplicarFeedback(aplicarFeedback(moduloGerado(), "l1", "l1-b1", { avaliacao: "ruim", evento: "e-1", agora: AGORA }), "l1", "l1-b2", { avaliacao: "bom", evento: "e-2", agora: AGORA }),
			"l1",
			{ notas: { clareza: 3 }, texto: "", evento: "e-3", agora: AGORA },
		);
		await gravarNoDisco(modulo);
		expect(await lerModulo(dados, MATERIA, CURSO, "m1")).toEqual(modulo);

		const novo = { tipo: "explicacao", conceitos: ["c-a"], formato: "exemplo_resolvido", texto: `Versão 2. ${"x".repeat(MINIMO_CARACTERES_EXEMPLO)}`, referencias: [] } as unknown as Bloco;
		const reescrito = await gravarBlocoReescrito(dados, MATERIA, CURSO, "m1", "l1", "l1-b1", novo, { retornoId: "e-1", modelo: MODELO, custo: 0.01 }, { agora: DEPOIS });
		const lido = (await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado;
		expect(lido).toEqual(reescrito);
		expect(lido.feedback).toEqual(modulo.feedback);
		expect(lido.questionarios).toEqual(modulo.questionarios);
		expect(feedbackDoBloco(lido.feedback, lido.licoes[0]!.blocos[0]!)).toBeUndefined();
		expect(feedbackDoBloco(lido.feedback, lido.licoes[0]!.blocos[1]!)).toMatchObject({ avaliacao: "bom" });
	});

	it("um feedback ou questionarios que não é objeto: o módulo é ilegível", async () => {
		await gravarNoDisco({ ...moduloGerado(), feedback: [] as unknown as ModuloGerado["feedback"] });
		await expect(lerModulo(dados, MATERIA, CURSO, "m1")).rejects.toThrow(/o feedback não é um objeto/);
		await gravarNoDisco({ ...moduloGerado(), questionarios: "x" as unknown as ModuloGerado["questionarios"] });
		await expect(lerModulo(dados, MATERIA, CURSO, "m1")).rejects.toThrow(/os questionarios não são um objeto/);
	});
});
