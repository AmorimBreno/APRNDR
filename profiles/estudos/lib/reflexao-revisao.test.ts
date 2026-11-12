// Testes dos ajustes da revisão da reflexão do aprendiz (item 9, parte B): os eventos anteriores dos mesmos
// conceitos (criar com a evidência de uma reflexão anterior), o ultimoEvento com eventos fora de ordem, o texto
// da entrada, o hipoteses.json ilegível e o mínimo do gatilho. Pasta de dados temporária, eventos escritos à mão.
// Os dados reais do Breno não são usados.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acrescentarEvento, type Evento, lerEventos, novoIdEvento } from "./eventos.ts";
import { ErroHipoteses, lerHipoteses } from "./hipoteses.ts";
import { caminhoDoMapa } from "./mapa.ts";
import { arquivoMateria, eventosAprendiz } from "./materias.ts";
import { executarReflexao, janelaDaReflexao, linhaDoEventoParaReflexao, mensagemDaReflexao, MINIMO_DO_GATILHO, prepararReflexao, type RespostaDaReflexao } from "./reflexao.ts";

let dados = "";
let cache = "";
const AGORA = new Date("2026-11-11T12:00:00.000Z");

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-reflexao-rev-"));
	cache = await mkdtemp(join(tmpdir(), "estudos-reflexao-rev-cache-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
	await rm(cache, { recursive: true, force: true });
});

async function escrever(arquivo: string, conteudo: unknown): Promise<void> {
	await mkdir(dirname(arquivo), { recursive: true });
	await writeFile(arquivo, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo), "utf8");
}

async function cenarioDeMateria(): Promise<void> {
	await escrever(arquivoMateria(dados, "nlp"), { id: "nlp", nome: "Processamento de linguagem", cor: "moss", glifo: "学", provas: [], criadaEm: "2026-10-01T00:00:00.000Z" });
	await escrever(caminhoDoMapa(dados, "nlp"), {
		versao: 1,
		situacao: "aprovado",
		conceitos: [
			["token", "Tokenização"],
			["idf", "Frequência inversa"],
		].map(([id, nome]) => ({ id, nome, descricao: "", referencias: [], prioridade: "central", origem: "material", criadoEm: "2026-10-01T00:00:00.000Z" })),
		arquivos: {},
	});
}

/** Um evento com id no formato real (novoIdEvento do instante do ts), para as regras que olham o instante do id. */
function eventoReal(ts: string, sessao: string, extra: Partial<Evento> = {}): Evento {
	return {
		id: novoIdEvento(Date.parse(ts)),
		ts,
		sessao,
		verbo: "respondeu_questao",
		objeto: { materia: "nlp", curso: "c", questao: `q-${ts}`, conceitos: ["token"] },
		resultado: { correta: false, confianca: 4, confusao: "pontuação é ruído" },
		...extra,
	};
}

/** Um evento de id escrito à mão (evNNN). */
function eventoSimples(n: number, sessao: string, extra: Partial<Evento> = {}): Evento {
	return {
		id: `ev${String(n).padStart(3, "0")}`,
		ts: `2026-11-0${Math.min(n, 9)}T10:00:00.000Z`,
		sessao,
		verbo: "respondeu_questao",
		objeto: { materia: "nlp", curso: "c", questao: `q${n}`, conceitos: ["token"] },
		resultado: { correta: false, confianca: 4 },
		...extra,
	};
}

const gravar = async (...eventos: Evento[]) => {
	for (const item of eventos) await acrescentarEvento(eventosAprendiz(dados), item);
};
const naFila = <T>(tarefa: () => Promise<T>) => tarefa();

const proposta = (evidencias: string[], extra: Record<string, unknown> = {}) => ({
	acao: "criar",
	tipo: "misconception",
	escopo: { nivel: "conceito", materia: "nlp", conceitos: ["token"] },
	enunciado: "Em tokenização, confunde remover pontuação com remover ruído",
	evidencias,
	motivo: "errou duas vezes",
	...extra,
});

function modelo(propostas: unknown[]) {
	const chamadas: string[] = [];
	return {
		chamadas,
		chamar: async (mensagem: string): Promise<RespostaDaReflexao> => {
			chamadas.push(mensagem);
			return { propostas, custo: 0 };
		},
	};
}

describe("criar com os eventos anteriores dos mesmos conceitos", () => {
	it("duas reflexões seguidas de uma sessão cada: a segunda cria a hipótese citando o evento da primeira", async () => {
		await cenarioDeMateria();
		const e1 = eventoReal("2026-11-03T12:00:00.000Z", "sessao-1");
		const e2 = eventoReal("2026-11-06T12:00:00.000Z", "sessao-2");
		await gravar(e1);
		const primeira = modelo([proposta([e1.id, e1.id])]);
		const r1 = await executarReflexao(dados, { motivo: "licao", agora: AGORA, pastaCache: cache, chamar: primeira.chamar, naFila });
		if (r1.semEventos) throw new Error("devia ter refletido");
		// um evento só e uma sessão só: nada vira hipótese
		expect(r1.resumo).toMatchObject({ lidos: 1, aceitas: 0 });
		expect(primeira.chamadas[0]).toContain("## Eventos anteriores dos mesmos conceitos");

		await gravar(e2);
		const segunda = modelo([proposta([e1.id, e2.id])]);
		const r2 = await executarReflexao(dados, { motivo: "licao", agora: AGORA, pastaCache: cache, chamar: segunda.chamar, naFila });
		if (r2.semEventos) throw new Error("devia ter refletido");
		// a entrada da segunda traz o e1 como anterior (já lido) e só o e2 como novo
		const [antes, novos] = segunda.chamadas[0]!.split("## Eventos novos");
		expect(antes).toContain(`- ${e1.id} | S1 | 2026-11-03`);
		expect(novos).toContain(`- ${e2.id} | S2 | 2026-11-06`);
		expect(novos).not.toContain(e1.id);
		expect(r2.resumo).toMatchObject({ lidos: 1, propostas: 1, aceitas: 1, descartadas: [] });
		const hipoteses = (await lerHipoteses(dados)).hipoteses;
		expect(hipoteses).toHaveLength(1);
		expect(hipoteses[0]).toMatchObject({ status: "proposta", aFavor: [e1.id, e2.id], confianca: "baixa" });
	});

	it("só anteriores (nenhum evento novo entre as evidências) não cria, e reforçar também só vale com ids da janela", async () => {
		await cenarioDeMateria();
		const e1 = eventoReal("2026-11-03T12:00:00.000Z", "sessao-1");
		const e2 = eventoReal("2026-11-06T12:00:00.000Z", "sessao-2");
		const e3 = eventoReal("2026-11-08T12:00:00.000Z", "sessao-3");
		await gravar(e1, e2);
		await executarReflexao(dados, { motivo: "licao", agora: AGORA, pastaCache: cache, chamar: modelo([proposta([e1.id, e2.id])]).chamar, naFila });
		const base = (await lerHipoteses(dados)).hipoteses[0]!;
		await gravar(e3);
		const feito = await executarReflexao(dados, {
			motivo: "licao",
			agora: AGORA,
			pastaCache: cache,
			chamar: modelo([
				proposta([e1.id, e2.id], { enunciado: "Em tokenização, esquece as contrações sempre" }),
				{ acao: "reforcar", hipotese: base.id, evidencias: [e1.id, e3.id], motivo: "x" },
				{ acao: "reforcar", hipotese: base.id, evidencias: [e3.id], motivo: "x" },
			]).chamar,
			naFila,
		});
		if (feito.semEventos) throw new Error("devia ter refletido");
		expect(Object.fromEntries(feito.resumo.descartadas.map((item) => [item.motivo, item.quantas]))).toEqual({ sem_evidencia_nova: 1, evidencia_fora_da_janela: 1 });
		expect(feito.resumo.aceitas).toBe(1);
	});

	it("os anteriores: últimos 90 dias, sem autoavaliação, só dos mesmos conceitos e de matéria que existe, os 60 mais recentes", async () => {
		await cenarioDeMateria();
		const velho = eventoReal("2026-07-01T12:00:00.000Z", "s0"); // mais de 90 dias antes de AGORA
		const auto = eventoReal("2026-11-01T12:00:00.000Z", "s0", { verbo: "autoavaliou_conceito", resultado: { nivel: 2 } });
		const outro = eventoReal("2026-11-01T13:00:00.000Z", "s0", { objeto: { materia: "nlp", curso: "c", questao: "z", conceitos: ["idf"] } });
		const apagada = eventoReal("2026-11-01T14:00:00.000Z", "s0", { objeto: { materia: "apagada", curso: "c", questao: "z", conceitos: ["token"] } });
		const muitos = Array.from({ length: 65 }, (_, i) => eventoReal(`2026-10-${String(1 + (i % 28)).padStart(2, "0")}T${String(Math.floor(i / 28) + 8).padStart(2, "0")}:00:00.000Z`, "s1"));
		const novo = eventoReal("2026-11-10T12:00:00.000Z", "s2");
		await gravar(velho, auto, outro, apagada, ...muitos);
		const ultimo = [...muitos, auto, outro, apagada, velho].map((e) => e.id).sort().at(-1)!;
		await escrever(join(dados, "aprendiz", "hipoteses.json"), { versao: 1, hipoteses: [], mudancas: [], ultimaReflexao: { id: "r-0", ts: "2026-11-02T00:00:00.000Z", motivo: "botao", ultimoEvento: ultimo, lidos: 1, propostas: 0, aceitas: 0, descartadas: [] } });
		await gravar(novo);
		const preparada = await prepararReflexao(dados, { pastaCache: cache, agora: AGORA });
		if (preparada.semEventos) throw new Error("devia ter eventos");
		expect(preparada.janela).toEqual([novo.id]);
		expect(preparada.anteriores).toHaveLength(60);
		expect(preparada.anteriores).toEqual([...muitos].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(-60).map((e) => e.id));
		for (const fora of [velho, auto, outro, apagada]) expect(preparada.anteriores).not.toContain(fora.id);
	});
});

describe("o ultimoEvento e os eventos fora de ordem", () => {
	const todas = new Set(["nlp"]);

	it("o ultimoEvento é o último com instante anterior a antesDe; os dos últimos 2 s entram de novo na janela seguinte", () => {
		const a = eventoReal("2026-11-11T11:59:50.000Z", "s1");
		const b = eventoReal("2026-11-11T11:59:57.000Z", "s1");
		const c = eventoReal("2026-11-11T11:59:59.500Z", "s2");
		const corte = AGORA.getTime() - 2000;
		const janela = janelaDaReflexao([c, a, b], { materias: todas, antesDe: corte });
		expect(janela.eventos.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
		expect(janela.ultimoEvento).toBe(b.id);
		// a próxima começa depois de b: c entra de novo
		expect(janelaDaReflexao([a, b, c], { materias: todas, depoisDe: b.id, antesDe: corte + 10_000 }).eventos.map((e) => e.id)).toEqual([c.id]);
		// todos recentes: nenhum é estável
		expect(janelaDaReflexao([c], { materias: todas, antesDe: corte }).ultimoEvento).toBeUndefined();
	});

	it("E2 (id maior) gravado antes de E1 (id menor): E1 não se perde para sempre", async () => {
		await cenarioDeMateria();
		const antigo = eventoReal("2026-11-11T11:00:00.000Z", "s1");
		const e1 = eventoReal("2026-11-11T11:59:59.000Z", "s2"); // id menor, chega ao arquivo depois
		const e2 = eventoReal("2026-11-11T11:59:59.800Z", "s3");
		await gravar(antigo, e2);
		const r1 = await executarReflexao(dados, { motivo: "botao", agora: AGORA, pastaCache: cache, chamar: modelo([]).chamar, naFila });
		if (r1.semEventos) throw new Error("devia ter refletido");
		// e2 está nos últimos 2 s: o ultimoEvento fica no antigo
		expect(r1.resumo.ultimoEvento).toBe(antigo.id);
		expect(r1.resumo.jaLidos).toEqual([e2.id]);
		await gravar(e1);
		const m = modelo([]);
		const r2 = await executarReflexao(dados, { motivo: "botao", agora: new Date(AGORA.getTime() + 60_000), pastaCache: cache, chamar: m.chamar, naFila });
		if (r2.semEventos) throw new Error("devia ter refletido");
		expect(r2.resumo.lidos).toBe(2);
		expect(m.chamadas[0]).toContain(e1.id);
		expect(r2.resumo.ultimoEvento).toBe(e2.id);
	});

	it("uma reflexão só com eventos que a anterior já leu (os dos últimos 2 s) não chama o modelo", async () => {
		await cenarioDeMateria();
		await gravar(eventoReal("2026-11-11T11:59:59.500Z", "s1"));
		const m = modelo([]);
		await executarReflexao(dados, { motivo: "botao", agora: AGORA, pastaCache: cache, chamar: m.chamar, naFila });
		expect(m.chamadas).toHaveLength(1);
		const outra = await executarReflexao(dados, { motivo: "botao", agora: new Date(AGORA.getTime() + 1000), pastaCache: cache, chamar: m.chamar, naFila });
		expect(outra.semEventos).toBe(true);
		expect(m.chamadas).toHaveLength(1);
	});
});

describe("a mensagem da reflexão: textos e profundidade", () => {
	it("o cabeçalho diz que os mais NOVOS ficam para a próxima reflexão", () => {
		const mensagem = mensagemDaReflexao({
			agora: AGORA,
			janela: { eventos: [eventoSimples(1, "s1"), eventoSimples(2, "s1")], cortados: 7 },
			hipoteses: [],
			mudancas: [],
			indicadores: [],
			materias: [{ id: "nlp", nome: "NLP" }],
			nomes: new Map(),
		});
		expect(mensagem).toContain("os 7 mais novos ficam para a próxima reflexão");
		expect(mensagem).not.toContain("mais antigos ficaram de fora");
	});

	it("os criterios de uma dissertativa (lista de objetos) chegam inteiros ao modelo; objeto fundo demais continua cortado", () => {
		const dissertativa = eventoSimples(1, "s1", {
			verbo: "respondeu_dissertativa",
			resultado: {
				tentativa: 1,
				texto: "resposta",
				total: 3,
				max: 4,
				criterios: [
					{ criterio: "Define o conceito", pontos: 2, max: 2 },
					{ criterio: "Dá um exemplo", pontos: 1, max: 2 },
				],
				confianca: 3,
				tempoMs: 1000,
			},
		});
		const linha = linhaDoEventoParaReflexao(dissertativa, new Map([["s1", "S1"]]), new Map());
		expect(linha).toContain('"criterios":[{"criterio":"Define o conceito","pontos":2,"max":2},{"criterio":"Dá um exemplo","pontos":1,"max":2}]');
		expect(linha).not.toContain("…");
		const fundo = eventoSimples(2, "s1", { resultado: { a: { b: { c: { d: 1 } } } } });
		expect(linhaDoEventoParaReflexao(fundo, new Map(), new Map())).toContain('"a":{"b":{"c":"…"}}');
	});
});

describe("o hipoteses.json ilegível e o mínimo do gatilho", () => {
	it("hipoteses.json ilegível: a reflexão recusa já na preparação, sem chamar o modelo nem gravar", async () => {
		await cenarioDeMateria();
		await gravar(eventoSimples(1, "s1"), eventoSimples(2, "s2"));
		await escrever(join(dados, "aprendiz", "hipoteses.json"), "{ nao e json");
		const m = modelo([]);
		await expect(executarReflexao(dados, { motivo: "botao", agora: AGORA, pastaCache: cache, chamar: m.chamar, naFila })).rejects.toThrow(/Não consegui ler as hipóteses.*o modelo não foi chamado/);
		expect(m.chamadas).toEqual([]);
		await expect(prepararReflexao(dados, { pastaCache: cache, agora: AGORA })).rejects.toThrow(ErroHipoteses);
	});

	it("com minimoDeDesempenho: abaixo dele nada é chamado nem gravado e a janela não avança; sem o mínimo (o botão), chama", async () => {
		await cenarioDeMateria();
		// 4 eventos de desempenho e 1 que não é (avaliou_licao)
		await gravar(eventoSimples(1, "s1"), eventoSimples(2, "s1"), eventoSimples(3, "s2"), eventoSimples(4, "s2"), eventoSimples(5, "s2", { verbo: "avaliou_licao", resultado: { notas: { entendimento: 4 } } }));
		const m = modelo([]);
		const abaixo = await executarReflexao(dados, { motivo: "licao", agora: AGORA, pastaCache: cache, minimoDeDesempenho: MINIMO_DO_GATILHO, chamar: m.chamar, naFila });
		expect(abaixo).toMatchObject({ semEventos: true, abaixoDoMinimo: true });
		expect(abaixo.resumo.lidos).toBe(0);
		expect(m.chamadas).toEqual([]);
		expect((await lerHipoteses(dados)).ultimaReflexao).toBeUndefined();
		expect((await lerEventos(eventosAprendiz(dados))).eventos.map((e) => e.verbo)).not.toContain("refletiu");

		// o botão chama com os mesmos eventos
		const botao = await executarReflexao(dados, { motivo: "botao", agora: AGORA, pastaCache: cache, chamar: m.chamar, naFila });
		expect(botao.semEventos).toBe(false);
		expect(m.chamadas).toHaveLength(1);
	});

	it("com 5 eventos de desempenho o gatilho chama o modelo", async () => {
		await cenarioDeMateria();
		await gravar(eventoSimples(1, "s1"), eventoSimples(2, "s1"), eventoSimples(3, "s2"), eventoSimples(4, "s2"), eventoSimples(5, "s3"));
		const m = modelo([]);
		const feito = await executarReflexao(dados, { motivo: "licao", agora: AGORA, pastaCache: cache, minimoDeDesempenho: MINIMO_DO_GATILHO, chamar: m.chamar, naFila });
		expect(feito.semEventos).toBe(false);
		expect(m.chamadas).toHaveLength(1);
	});
});
