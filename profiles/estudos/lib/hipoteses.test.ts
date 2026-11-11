// Testes das hipóteses do aprendiz no disco (item 9, parte B): ler sem criar, gravar e reler, registrar uma
// reflexão, decidir, editar e os eventos acrescentados, tudo numa pasta de dados temporária e com eventos
// escritos à mão no formato real. Os dados reais do Breno não são usados nem tocados.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acrescentarEvento, type Evento, lerEventos } from "./eventos.ts";
import {
	arquivoHipoteses,
	contextoDeValidacao,
	decidirHipotese,
	decidirMudanca,
	editarHipotese,
	ErroHipoteses,
	gravarHipoteses,
	lerHipoteses,
	lerHipotesesComAvisos,
	materiasEConceitos,
	registrarReflexao,
	validarPropostas,
	VERBOS_DE_HIPOTESE,
	VERSAO_HIPOTESES,
	type ArquivoHipoteses,
	type Hipotese,
	type MudancaPendente,
	type ResumoDaReflexao,
} from "./hipoteses.ts";
import { caminhoDoMapa } from "./mapa.ts";
import { arquivoMateria, eventosAprendiz } from "./materias.ts";

let dados = "";
const AGORA = new Date("2026-11-11T12:00:00.000Z");
const SESSAO = "sessao-x";

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-hipoteses-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

async function escrever(arquivo: string, conteudo: unknown): Promise<void> {
	await mkdir(dirname(arquivo), { recursive: true });
	await writeFile(arquivo, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo), "utf8");
}

const criarMateria = (id: string) => escrever(arquivoMateria(dados, id), { id, nome: id, cor: "moss", glifo: "学", provas: [], criadaEm: "2026-10-01T00:00:00.000Z" });
const criarMapa = (materia: string, ids: string[]) =>
	escrever(caminhoDoMapa(dados, materia), {
		versao: 1,
		situacao: "aprovado",
		conceitos: ids.map((id) => ({ id, nome: id, descricao: "", referencias: [], prioridade: "central", origem: "material", criadoEm: "2026-10-01T00:00:00.000Z" })),
		arquivos: {},
	});

/** Um respondeu_questao escrito à mão: n vira o id ev00n e o dia (n a 9 de novembro). */
function resposta(n: number, sessao: string, ts?: string): Evento {
	return {
		id: `ev${String(n).padStart(3, "0")}`,
		ts: ts ?? `2026-11-0${Math.min(n, 9)}T10:00:00.000Z`,
		sessao,
		verbo: "respondeu_questao",
		objeto: { materia: "calc", curso: "c", questao: `q${n}`, conceitos: ["limites"] },
		resultado: { correta: false },
	};
}
const gravarEventos = async (...eventos: Evento[]) => {
	for (const evento of eventos) await acrescentarEvento(eventosAprendiz(dados), evento);
};
const eventosDoDisco = async () => (await lerEventos(eventosAprendiz(dados))).eventos;
const existe = (caminho: string) =>
	stat(caminho).then(
		() => true,
		() => false,
	);

function hipotese(extra: Partial<Hipotese> = {}): Hipotese {
	return {
		id: "h-1",
		tipo: "misconception",
		escopo: { nivel: "conceito", materia: "calc", conceitos: ["limites"] },
		enunciado: "Confunde limite com valor da função no ponto",
		aFavor: ["ev001", "ev003", "ev005"],
		contra: [],
		confianca: "media",
		criadaEm: "2026-10-01T10:00:00.000Z",
		ultimaConfirmacao: "2026-10-01T10:00:00.000Z",
		validade: "2026-11-30T10:00:00.000Z",
		status: "proposta",
		aprovadaPeloUsuario: false,
		versao: 1,
		anteriores: [],
		reflexao: "r-0",
		...extra,
	};
}
const mudanca = (extra: Partial<MudancaPendente> = {}): MudancaPendente => ({ id: "m-1", hipotese: "h-1", acao: "enfraquecer", evidencias: ["ev002"], motivo: "errou de novo", reflexao: "r-1", criadaEm: "2026-11-10T10:00:00.000Z", ...extra });
const arquivo = (hipoteses: Hipotese[], mudancas: MudancaPendente[] = []): ArquivoHipoteses => ({ versao: VERSAO_HIPOTESES, hipoteses, mudancas });

const resumo = (extra: Partial<ResumoDaReflexao> = {}): ResumoDaReflexao => ({ id: "r-9", ts: AGORA.toISOString(), motivo: "botao", ultimoEvento: "ev008", lidos: 8, propostas: 3, aceitas: 2, descartadas: [{ motivo: "enunciado_generico", quantas: 1 }], ...extra });
const contexto = { sessao: SESSAO, agora: AGORA };

/** A matéria "calc" com o mapa (limites, series) e oito respostas em quatro sessões. */
async function cenario(): Promise<void> {
	await criarMateria("calc");
	await criarMapa("calc", ["limites", "series"]);
	await gravarEventos(resposta(1, "s1"), resposta(2, "s1"), resposta(3, "s2"), resposta(4, "s2"), resposta(5, "s3"), resposta(6, "s3"), resposta(7, "s3"), resposta(8, "s4"));
}

describe("ler e gravar", () => {
	it("sem arquivo, o arquivo vazio, e ler NÃO cria nada", async () => {
		expect(await lerHipoteses(dados)).toEqual({ versao: VERSAO_HIPOTESES, hipoteses: [], mudancas: [] });
		expect(await lerHipotesesComAvisos(dados)).toEqual({ arquivo: { versao: VERSAO_HIPOTESES, hipoteses: [], mudancas: [] }, avisos: [] });
		expect(await existe(arquivoHipoteses(dados))).toBe(false);
		expect(await existe(join(dados, "aprendiz"))).toBe(false);
	});

	it("grava inteiro (criando a pasta aprendiz/), legível, com LF, e relê igual", async () => {
		const completo: ArquivoHipoteses = { ...arquivo([hipotese(), hipotese({ id: "h-2", escopo: { nivel: "global" }, enunciado: "Estuda melhor em blocos curtos", tipo: "ritmo" })], [mudanca()]), ultimaReflexao: resumo() };
		await gravarHipoteses(dados, completo);
		expect(arquivoHipoteses(dados)).toBe(join(dados, "aprendiz", "hipoteses.json"));
		const texto = await readFile(arquivoHipoteses(dados), "utf8");
		expect(texto).toContain("\n\t");
		expect(texto.endsWith("}\n")).toBe(true);
		expect(texto).not.toContain("\r");
		expect(await lerHipoteses(dados)).toEqual(completo);
		expect((await lerHipotesesComAvisos(dados)).avisos).toEqual([]);
	});

	it("regravar troca o arquivo inteiro e não deixa temporários", async () => {
		await gravarHipoteses(dados, arquivo([hipotese()]));
		await gravarHipoteses(dados, arquivo([hipotese({ id: "h-2", enunciado: "Outro enunciado qualquer aqui" })]));
		expect((await lerHipoteses(dados)).hipoteses.map((item) => item.id)).toEqual(["h-2"]);
		const { readdir } = await import("node:fs/promises");
		expect((await readdir(join(dados, "aprendiz"))).filter((nome) => nome.endsWith(".tmp"))).toEqual([]);
	});

	it("recusa gravar um arquivo fora do formato", async () => {
		await expect(gravarHipoteses(dados, { versao: 7, hipoteses: [], mudancas: [] })).rejects.toThrow(ErroHipoteses);
		await expect(gravarHipoteses(dados, arquivo([hipotese({ tipo: "estilo" as never })]))).rejects.toThrow(ErroHipoteses);
		expect(await existe(arquivoHipoteses(dados))).toBe(false);
	});

	it("JSON inválido: ler devolve vazio com aviso e as operações que gravam recusam sem sobrescrever", async () => {
		await cenario();
		await escrever(arquivoHipoteses(dados), "{ isto não é json");
		const lido = await lerHipotesesComAvisos(dados);
		expect(lido.arquivo.hipoteses).toEqual([]);
		expect(lido.avisos[0]).toMatch(/JSON/);
		const antes = (await eventosDoDisco()).length;

		await expect(registrarReflexao(dados, { resumo: resumo(), propostasValidas: [], ...contexto })).rejects.toThrow(/Não consegui ler as hipóteses/);
		await expect(decidirHipotese(dados, { id: "h-1", decisao: "aprovar" }, contexto)).rejects.toThrow(ErroHipoteses);
		await expect(decidirMudanca(dados, { id: "m-1", decisao: "rejeitar" }, contexto)).rejects.toThrow(ErroHipoteses);
		await expect(editarHipotese(dados, { id: "h-1", status: "aprovada" }, contexto)).rejects.toThrow(ErroHipoteses);
		expect(await readFile(arquivoHipoteses(dados), "utf8")).toBe("{ isto não é json");
		expect(await eventosDoDisco()).toHaveLength(antes);
	});

	it("versão desconhecida também não é sobrescrita", async () => {
		await escrever(arquivoHipoteses(dados), { versao: 99, hipoteses: [hipotese()], mudancas: [] });
		await expect(editarHipotese(dados, { id: "h-1", status: "aprovada" }, contexto)).rejects.toThrow(/versão desconhecida/);
		expect(JSON.parse(await readFile(arquivoHipoteses(dados), "utf8")).versao).toBe(99);
	});
});

describe("contextoDeValidacao e materiasEConceitos", () => {
	it("monta o contexto do disco: eventos por id, janela, hipóteses, mudanças e as matérias com os conceitos", async () => {
		await cenario();
		await criarMateria("sem-mapa");
		await gravarHipoteses(dados, arquivo([hipotese()], [mudanca()]));
		const resultado = await contextoDeValidacao(dados, ["ev001", "ev002"]);
		expect([...resultado.eventosPorId.keys()]).toHaveLength(8);
		expect(resultado.eventosPorId.get("ev003")).toMatchObject({ sessao: "s2", verbo: "respondeu_questao" });
		expect([...(resultado.janela as Set<string>)]).toEqual(["ev001", "ev002"]);
		expect(resultado.hipoteses.map((item) => item.id)).toEqual(["h-1"]);
		expect(resultado.mudancas?.map((item) => item.hipotese)).toEqual(["h-1"]);
		expect(await materiasEConceitos(dados)).toEqual(
			new Map([
				["calc", new Set(["limites", "series"])],
				["sem-mapa", new Set()],
			]),
		);
	});

	it("valida as propostas contra os eventos e as matérias reais da pasta", async () => {
		await cenario();
		const ctx = await contextoDeValidacao(dados, ["ev001", "ev002", "ev003", "ev004"]);
		const { validas, descartadas } = validarPropostas(
			[
				{ acao: "criar", tipo: "misconception", escopo: { nivel: "conceito", materia: "calc", conceitos: ["limites"] }, enunciado: "Confunde limite lateral com limite no ponto", evidencias: ["ev001", "ev003"], motivo: "" },
				{ acao: "criar", tipo: "misconception", escopo: { nivel: "materia", materia: "historia" }, enunciado: "Mistura datas de dois períodos diferentes", evidencias: ["ev001", "ev003"], motivo: "" },
			],
			ctx,
		);
		expect(validas).toHaveLength(1);
		expect(descartadas).toEqual([{ motivo: "materia_inexistente", quantas: 1 }]);
	});
});

describe("registrarReflexao", () => {
	const criarProposta = {
		acao: "criar" as const,
		tipo: "misconception" as const,
		escopo: { nivel: "conceito" as const, materia: "calc", conceitos: ["limites"] },
		enunciado: "Confunde limite lateral com limite no ponto",
		evidencias: ["ev001", "ev003", "ev005"],
		motivo: "três erros em três sessões",
	};

	it("grava a hipótese como proposta, a mudança pendente, expira a vencida e acrescenta os eventos na ordem", async () => {
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese({ id: "h-velha", status: "aprovada", aprovadaPeloUsuario: true, validade: "2026-10-30T00:00:00.000Z", enunciado: "Escreve o sinal do expoente ao contrário", aFavor: ["ev002"] }), hipotese({ id: "h-viva", status: "aprovada", aprovadaPeloUsuario: true, enunciado: "Troca derivada por integral nas contas longas", aFavor: ["ev004"] })]));
		const eventosAntes = await eventosDoDisco();

		const feito = await registrarReflexao(dados, {
			resumo: resumo(),
			propostasValidas: [criarProposta, { acao: "reforcar", hipotese: "h-viva", evidencias: ["ev006", "ev007"], motivo: "mais dois" }, { acao: "expirar", hipotese: "h-viva", evidencias: [], motivo: "sumiu" }],
			...contexto,
		});

		// O arquivo.
		const gravado = await lerHipoteses(dados);
		expect(gravado).toEqual(feito.arquivo);
		expect(gravado.ultimaReflexao).toEqual(resumo());
		expect(gravado.hipoteses).toHaveLength(3);
		const [velha, viva, nova] = gravado.hipoteses as [Hipotese, Hipotese, Hipotese];
		expect(velha).toMatchObject({ id: "h-velha", status: "expirada", aprovadaPeloUsuario: false, versao: 2 });
		expect(viva).toMatchObject({ id: "h-viva", status: "aprovada", versao: 1 }); // mudança só pendente
		expect(nova).toMatchObject({ status: "proposta", aprovadaPeloUsuario: false, versao: 1, confianca: "media", reflexao: "r-9", aFavor: ["ev001", "ev003", "ev005"], criadaEm: AGORA.toISOString() });
		expect(nova.id).toMatch(/^h-[0-9a-z]{12}-[0-9a-f]{8}$/);
		expect(gravado.mudancas).toHaveLength(2);
		expect(gravado.mudancas.map((item) => item.acao)).toEqual(["reforcar", "expirar"]);
		expect(gravado.mudancas.every((item) => item.id.startsWith("m-") && item.hipotese === "h-viva" && item.reflexao === "r-9")).toBe(true);
		expect(gravado.hipoteses.filter((item) => item.id !== "h-velha" && item.id !== "h-viva").every((item) => item.status !== "aprovada")).toBe(true);
		expect(feito.criadas.map((item) => item.id)).toEqual([nova.id]);
		expect(feito.expiradas.map((item) => item.id)).toEqual(["h-velha"]);

		// Os eventos, só de acréscimo e na ordem certa.
		const todos = await eventosDoDisco();
		expect(todos.slice(0, eventosAntes.length)).toEqual(eventosAntes);
		const novos = todos.slice(eventosAntes.length);
		expect(novos).toEqual(feito.eventos);
		expect(novos.map((evento) => evento.verbo)).toEqual(["refletiu", "propos_hipotese", "propos_mudanca_hipotese", "propos_mudanca_hipotese", "expirou_hipotese"]);
		const ids = novos.map((evento) => evento.id);
		expect([...ids].sort()).toEqual(ids);
		expect(new Set(ids).size).toBe(ids.length);
		expect(novos.every((evento) => evento.sessao === SESSAO && evento.ts === AGORA.toISOString())).toBe(true);
		expect(novos[0]).toMatchObject({ objeto: { reflexao: "r-9" }, resultado: resumo() });
		expect(novos[1]).toMatchObject({
			objeto: { hipotese: nova.id, materia: "calc", conceitos: ["limites"] },
			resultado: { reflexao: "r-9", tipo: "misconception", enunciado: nova.enunciado, confianca: "media", evidencias: ["ev001", "ev003", "ev005"] },
		});
		expect(novos[2]).toMatchObject({ objeto: { hipotese: "h-viva", mudanca: gravado.mudancas[0]!.id, materia: "calc", conceitos: ["limites"] }, resultado: { acao: "reforcar", evidencias: ["ev006", "ev007"], motivo: "mais dois" } });
		expect(novos[4]).toMatchObject({ objeto: { hipotese: "h-velha" }, resultado: { motivo: "validade_vencida", validade: "2026-10-30T00:00:00.000Z", de: "aprovada", versao: 2 } });

		// Toda evidência citada nos eventos de hipótese é um evento que já existia, e nunca um evento de hipótese.
		const existentes = new Set(eventosAntes.map((evento) => evento.id));
		const verbosDeHipotese = new Set<string>(VERBOS_DE_HIPOTESE);
		for (const evento of novos.slice(1, 3)) {
			const evidencias = (evento.resultado as { evidencias: string[] }).evidencias;
			expect(evidencias.length).toBeGreaterThan(0);
			for (const id of evidencias) {
				expect(existentes.has(id)).toBe(true);
				expect(verbosDeHipotese.has(todos.find((item) => item.id === id)!.verbo)).toBe(false);
			}
		}
	});

	it("uma reflexão sem propostas só grava o resumo e o evento refletiu", async () => {
		await cenario();
		const feito = await registrarReflexao(dados, { resumo: resumo({ propostas: 0, aceitas: 0, descartadas: [] }), propostasValidas: [], ...contexto });
		expect(feito.criadas).toEqual([]);
		expect(feito.eventos.map((evento) => evento.verbo)).toEqual(["refletiu"]);
		expect((await lerHipoteses(dados)).ultimaReflexao?.id).toBe("r-9");
	});

	it("sem sessão, o evento não leva o campo sessao", async () => {
		await cenario();
		const feito = await registrarReflexao(dados, { resumo: resumo(), propostasValidas: [], agora: AGORA });
		expect(feito.eventos[0]).not.toHaveProperty("sessao");
	});

	it("recusa a matéria que não existe, o conceito que não existe e a evidência que não existe, sem gravar nada", async () => {
		await cenario();
		const antes = await eventosDoDisco();
		for (const proposta of [
			{ ...criarProposta, escopo: { nivel: "materia" as const, materia: "historia" } },
			{ ...criarProposta, escopo: { nivel: "conceito" as const, materia: "historia", conceitos: ["limites"] } },
			{ ...criarProposta, escopo: { nivel: "conceito" as const, materia: "calc", conceitos: ["derivadas"] } },
			{ ...criarProposta, evidencias: ["ev001", "ev999"] },
			{ ...criarProposta, evidencias: [] },
			{ acao: "reforcar" as const, hipotese: "h-1", evidencias: ["ev999"], motivo: "" },
		]) {
			await expect(registrarReflexao(dados, { resumo: resumo(), propostasValidas: [proposta], ...contexto })).rejects.toThrow(ErroHipoteses);
		}
		expect(await existe(arquivoHipoteses(dados))).toBe(false);
		expect(await eventosDoDisco()).toEqual(antes);
	});

	it("não cita um evento de hipótese como evidência (os eventos gravados nunca entram nas listas)", async () => {
		await cenario();
		const primeira = await registrarReflexao(dados, { resumo: resumo({ id: "r-1" }), propostasValidas: [criarProposta], ...contexto });
		const idsMeta = new Set(primeira.eventos.map((evento) => evento.id));
		const ctx = await contextoDeValidacao(dados, [...idsMeta, "ev001", "ev003"]);
		const { validas, descartadas } = validarPropostas([{ acao: "criar", tipo: "ritmo", escopo: "global", enunciado: "Responde melhor de manhã que à noite", evidencias: [[...idsMeta][1], "ev003"], motivo: "" }], ctx);
		expect(validas).toEqual([]);
		expect(descartadas).toEqual([{ motivo: "evidencia_de_evento_de_hipotese", quantas: 1 }]);
	});
});

describe("decidirHipotese", () => {
	beforeEach(async () => {
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese(), hipotese({ id: "h-2", enunciado: "Estuda melhor em blocos curtos", tipo: "ritmo", escopo: { nivel: "global" }, aFavor: ["ev002", "ev004"] })], [mudanca(), mudanca({ id: "m-2", acao: "reforcar", evidencias: ["ev006"] }), mudanca({ id: "m-3", hipotese: "h-2" })]));
	});

	it("aprovar com o enunciado editado: arquivo, versão e o evento aprovou_hipotese com o antes e o depois", async () => {
		const antes = await eventosDoDisco();
		const feito = await decidirHipotese(dados, { id: "h-1", decisao: "aprovar", enunciado: "Confunde o limite lateral com o limite no ponto" }, contexto);
		const gravado = await lerHipoteses(dados);
		expect(gravado).toEqual(feito.arquivo);
		expect(gravado.hipoteses[0]).toMatchObject({ status: "aprovada", aprovadaPeloUsuario: true, versao: 2, enunciado: "Confunde o limite lateral com o limite no ponto", ultimaConfirmacao: AGORA.toISOString(), validade: "2027-01-10T12:00:00.000Z" });
		expect(gravado.hipoteses[0]!.anteriores[0]).toMatchObject({ versao: 1, status: "proposta", enunciado: "Confunde limite com valor da função no ponto" });
		expect(gravado.mudancas).toHaveLength(3);
		const novos = (await eventosDoDisco()).slice(antes.length);
		expect(novos).toEqual(feito.eventos);
		expect(novos).toHaveLength(1);
		expect(novos[0]).toMatchObject({
			verbo: "aprovou_hipotese",
			sessao: SESSAO,
			ts: AGORA.toISOString(),
			objeto: { hipotese: "h-1", materia: "calc", conceitos: ["limites"] },
			resultado: {
				enunciado: "Confunde o limite lateral com o limite no ponto",
				versao: 2,
				confianca: "media",
				evidencias: { aFavor: ["ev001", "ev003", "ev005"], contra: [] },
				editado: { antes: "Confunde limite com valor da função no ponto", depois: "Confunde o limite lateral com o limite no ponto" },
			},
		});
	});

	it("aprovar sem editar não leva o campo editado", async () => {
		const feito = await decidirHipotese(dados, { id: "h-2", decisao: "aprovar" }, contexto);
		expect(feito.eventos[0]!.objeto).toEqual({ hipotese: "h-2" });
		expect(feito.eventos[0]!.resultado).not.toHaveProperty("editado");
	});

	it("o enunciado editado inválido é recusado sem gravar nada", async () => {
		const antes = await eventosDoDisco();
		const arquivoAntes = await readFile(arquivoHipoteses(dados), "utf8");
		await expect(decidirHipotese(dados, { id: "h-1", decisao: "aprovar", enunciado: "É um aprendiz visual de verdade" }, contexto)).rejects.toThrow(ErroHipoteses);
		await expect(decidirHipotese(dados, { id: "h-1", decisao: "aprovar", enunciado: "curto" }, contexto)).rejects.toThrow(ErroHipoteses);
		await expect(decidirHipotese(dados, { id: "h-nada", decisao: "aprovar" }, contexto)).rejects.toThrow(ErroHipoteses);
		expect(await readFile(arquivoHipoteses(dados), "utf8")).toBe(arquivoAntes);
		expect(await eventosDoDisco()).toEqual(antes);
	});

	it("rejeitar: rejeitou_hipotese e, para cada mudança pendente dela, um rejeitou_mudanca_hipotese automático", async () => {
		const feito = await decidirHipotese(dados, { id: "h-1", decisao: "rejeitar" }, contexto);
		const gravado = await lerHipoteses(dados);
		expect(gravado.hipoteses[0]).toMatchObject({ status: "rejeitada", aprovadaPeloUsuario: false, versao: 2 });
		expect(gravado.mudancas.map((item) => item.id)).toEqual(["m-3"]);
		expect(feito.eventos.map((evento) => evento.verbo)).toEqual(["rejeitou_hipotese", "rejeitou_mudanca_hipotese", "rejeitou_mudanca_hipotese"]);
		expect(feito.eventos[1]).toMatchObject({ objeto: { hipotese: "h-1", mudanca: "m-1" }, resultado: { acao: "enfraquecer", evidencias: ["ev002"], automatica: true, motivo: "hipotese_rejeitada" } });
		expect(feito.eventos.map((evento) => evento.id)).toEqual([...feito.eventos.map((evento) => evento.id)].sort());
		expect((await eventosDoDisco()).slice(-3)).toEqual(feito.eventos);
	});
});

describe("decidirMudanca", () => {
	it("aprovar reforçar: aplica e grava aprovou_mudanca_hipotese com as evidências acrescentadas", async () => {
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese({ status: "aprovada", aprovadaPeloUsuario: true })], [mudanca({ acao: "reforcar", evidencias: ["ev001", "ev006", "ev007"] })]));
		const feito = await decidirMudanca(dados, { id: "m-1", decisao: "aprovar" }, contexto);
		const gravado = await lerHipoteses(dados);
		expect(gravado.hipoteses[0]).toMatchObject({ aFavor: ["ev001", "ev003", "ev005", "ev006", "ev007"], confianca: "alta", versao: 2, ultimaConfirmacao: AGORA.toISOString() });
		expect(gravado.mudancas).toEqual([]);
		expect(feito.eventos.map((evento) => evento.verbo)).toEqual(["aprovou_mudanca_hipotese"]);
		expect(feito.eventos[0]).toMatchObject({
			objeto: { hipotese: "h-1", mudanca: "m-1", materia: "calc", conceitos: ["limites"] },
			resultado: { acao: "reforcar", evidencias: ["ev006", "ev007"], versao: 2, de: "aprovada", para: "aprovada", confianca: "alta" },
		});
		expect(feito.eventos[0]!.resultado).not.toHaveProperty("conflito");
	});

	it("o conflito vira aviso no evento: a hipótese aprovada volta a proposta", async () => {
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese({ status: "aprovada", aprovadaPeloUsuario: true, aFavor: ["ev005", "ev006", "ev007"] })], [mudanca({ evidencias: ["ev001", "ev002", "ev003", "ev004"] })]));
		const feito = await decidirMudanca(dados, { id: "m-1", decisao: "aprovar" }, contexto);
		expect(feito.conflito).toBe(true);
		const gravado = await lerHipoteses(dados);
		expect(gravado.hipoteses[0]).toMatchObject({ status: "proposta", aprovadaPeloUsuario: false, contra: ["ev001", "ev002", "ev003", "ev004"], versao: 2 });
		expect(feito.eventos[0]).toMatchObject({ verbo: "aprovou_mudanca_hipotese", resultado: { acao: "enfraquecer", de: "aprovada", para: "proposta", conflito: true, aFavorRecentes: 3, contraRecentes: 4 } });
	});

	it("aprovar expirar grava aprovou_mudanca_hipotese e expirou_hipotese; a hipótese fica expirada", async () => {
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese({ status: "aprovada", aprovadaPeloUsuario: true })], [mudanca({ acao: "expirar", evidencias: [], motivo: "não aparece mais" })]));
		const feito = await decidirMudanca(dados, { id: "m-1", decisao: "aprovar" }, contexto);
		expect((await lerHipoteses(dados)).hipoteses[0]).toMatchObject({ status: "expirada", aprovadaPeloUsuario: false, versao: 2 });
		expect(feito.eventos.map((evento) => evento.verbo)).toEqual(["aprovou_mudanca_hipotese", "expirou_hipotese"]);
		expect(feito.eventos[1]).toMatchObject({ objeto: { hipotese: "h-1", mudanca: "m-1" }, resultado: { motivo: "não aparece mais", mudanca: "m-1", de: "aprovada", versao: 2 } });
		expect(feito.eventos[0]!.id < feito.eventos[1]!.id).toBe(true);
	});

	it("rejeitar só tira a mudança e grava rejeitou_mudanca_hipotese", async () => {
		await cenario();
		const base = arquivo([hipotese()], [mudanca(), mudanca({ id: "m-2" })]);
		await gravarHipoteses(dados, base);
		const feito = await decidirMudanca(dados, { id: "m-1", decisao: "rejeitar" }, contexto);
		const gravado = await lerHipoteses(dados);
		expect(gravado.hipoteses).toEqual(base.hipoteses);
		expect(gravado.mudancas.map((item) => item.id)).toEqual(["m-2"]);
		expect(feito.eventos).toHaveLength(1);
		expect(feito.eventos[0]).toMatchObject({ verbo: "rejeitou_mudanca_hipotese", objeto: { hipotese: "h-1", mudanca: "m-1" }, resultado: { acao: "enfraquecer", evidencias: ["ev002"], motivo: "errou de novo" } });
	});

	it("erro de uso não grava nada", async () => {
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese({ status: "rejeitada" })], [mudanca()]));
		const antes = await eventosDoDisco();
		await expect(decidirMudanca(dados, { id: "m-9", decisao: "aprovar" }, contexto)).rejects.toThrow(ErroHipoteses);
		await expect(decidirMudanca(dados, { id: "m-1", decisao: "aprovar" }, contexto)).rejects.toThrow(/rejeitada/);
		expect(await eventosDoDisco()).toEqual(antes);
		expect((await lerHipoteses(dados)).mudancas).toHaveLength(1);
	});
});

describe("editarHipotese", () => {
	beforeEach(async () => {
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese({ status: "aprovada", aprovadaPeloUsuario: true })], [mudanca()]));
	});

	it("editar o enunciado grava editou_hipotese com o antes e o depois", async () => {
		const feito = await editarHipotese(dados, { id: "h-1", enunciado: "Confunde limite lateral com valor da função" }, contexto);
		expect((await lerHipoteses(dados)).hipoteses[0]).toMatchObject({ enunciado: "Confunde limite lateral com valor da função", versao: 2, status: "aprovada" });
		expect(feito.eventos).toHaveLength(1);
		expect(feito.eventos[0]).toMatchObject({
			verbo: "editou_hipotese",
			sessao: SESSAO,
			objeto: { hipotese: "h-1", materia: "calc", conceitos: ["limites"] },
			resultado: {
				mudou: ["enunciado"],
				antes: { enunciado: "Confunde limite com valor da função no ponto" },
				depois: { enunciado: "Confunde limite lateral com valor da função" },
				versao: 2,
				evidencias: { aFavor: ["ev001", "ev003", "ev005"], contra: [] },
			},
		});
	});

	it("rejeitar pelo status tira as mudanças pendentes, cada uma com seu evento", async () => {
		const feito = await editarHipotese(dados, { id: "h-1", status: "rejeitada" }, contexto);
		expect(feito.eventos.map((evento) => evento.verbo)).toEqual(["editou_hipotese", "rejeitou_mudanca_hipotese"]);
		expect(feito.eventos[0]).toMatchObject({ resultado: { mudou: ["status"], antes: { status: "aprovada" }, depois: { status: "rejeitada" } } });
		expect((await lerHipoteses(dados)).mudancas).toEqual([]);
	});

	it("sem mudança de fato não grava nada: nem o arquivo nem evento", async () => {
		const antes = await eventosDoDisco();
		const arquivoAntes = await readFile(arquivoHipoteses(dados), "utf8");
		const feito = await editarHipotese(dados, { id: "h-1", status: "aprovada", enunciado: "Confunde limite com valor da função no ponto" }, contexto);
		expect(feito.mudou).toEqual([]);
		expect(feito.eventos).toEqual([]);
		expect(await readFile(arquivoHipoteses(dados), "utf8")).toBe(arquivoAntes);
		expect(await eventosDoDisco()).toEqual(antes);
	});

	it("enunciado inválido e status que não vale são recusados", async () => {
		await expect(editarHipotese(dados, { id: "h-1", enunciado: "Muito bom em limites hoje" }, contexto)).rejects.toThrow(ErroHipoteses);
		await expect(editarHipotese(dados, { id: "h-1", status: "expirada" as never }, contexto)).rejects.toThrow(ErroHipoteses);
		await expect(editarHipotese(dados, { id: "h-nada", status: "aprovada" }, contexto)).rejects.toThrow(ErroHipoteses);
	});
});

describe("os eventos de hipótese não são observações", () => {
	it("a camada 2 os ignora mesmo com conceitos no objeto", async () => {
		const { calcularIndicadores } = await import("./aprendiz-indicadores-tipos.ts");
		await cenario();
		await gravarHipoteses(dados, arquivo([hipotese({ status: "aprovada", aprovadaPeloUsuario: true })]));
		await editarHipotese(dados, { id: "h-1", enunciado: "Confunde limite lateral com valor da função" }, contexto);
		await registrarReflexao(dados, { resumo: resumo(), propostasValidas: [], ...contexto });
		const eventos = await eventosDoDisco();
		const sozinhos = calcularIndicadores(eventos.filter((evento) => evento.verbo.endsWith("_hipotese") || evento.verbo === "refletiu"), { agora: AGORA, materias: ["calc"] });
		expect(sozinhos.conceitos).toEqual([]);
		expect(sozinhos.ignorados).toEqual({ materiaInexistente: 0, semConceito: 0 });
		const todos = calcularIndicadores(eventos, { agora: AGORA, materias: ["calc"] });
		expect(todos.conceitos.find((conceito) => conceito.conceito === "limites")?.observacoes).toBe(8);
	});
});
