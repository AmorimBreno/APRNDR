// Testes da reflexão do aprendiz sem o modelo (item 9, parte B): a janela de eventos, o texto da entrada, a
// leitura da saída do modelo, a validação e uma reflexão inteira com um modelo falso (a função `chamar`), tudo
// numa pasta de dados temporária com eventos escritos à mão. Os dados reais do Breno não são usados.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acrescentarEvento, type Evento, lerEventos } from "./eventos.ts";
import { lerHipoteses } from "./hipoteses.ts";
import { caminhoDoMapa } from "./mapa.ts";
import { arquivoMateria, eventosAprendiz } from "./materias.ts";
import {
	cortarTexto,
	executarReflexao,
	janelaDaReflexao,
	LIMITE_EVENTOS_DA_REFLEXAO,
	MOTIVO_AUTOAVALIACAO_SOZINHA,
	prepararReflexao,
	propostasDaResposta,
	type RespostaDaReflexao,
} from "./reflexao.ts";

let dados = "";
let cache = "";
const AGORA = new Date("2026-11-11T12:00:00.000Z");

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-reflexao-"));
	cache = await mkdtemp(join(tmpdir(), "estudos-reflexao-cache-"));
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
	await rm(cache, { recursive: true, force: true });
});

async function escrever(arquivo: string, conteudo: unknown): Promise<void> {
	await mkdir(dirname(arquivo), { recursive: true });
	await writeFile(arquivo, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo), "utf8");
}

const criarMateria = (id: string, nome = id) => escrever(arquivoMateria(dados, id), { id, nome, cor: "moss", glifo: "学", provas: [], criadaEm: "2026-10-01T00:00:00.000Z" });
const criarMapa = (materia: string, conceitos: Array<[string, string]>) =>
	escrever(caminhoDoMapa(dados, materia), {
		versao: 1,
		situacao: "aprovado",
		conceitos: conceitos.map(([id, nome]) => ({ id, nome, descricao: "", referencias: [], prioridade: "central", origem: "material", criadoEm: "2026-10-01T00:00:00.000Z" })),
		arquivos: {},
	});

const idDe = (n: number) => `ev${String(n).padStart(3, "0")}`;

/** Um evento escrito à mão: o n vira o id evNNN (ordenável). */
function evento(n: number, sessao: string, extra: Partial<Evento> = {}): Evento {
	return {
		id: idDe(n),
		ts: `2026-11-0${Math.min(n, 9)}T10:00:00.000Z`,
		sessao,
		verbo: "respondeu_questao",
		objeto: { materia: "nlp", curso: "c", questao: `q${n}`, conceitos: ["token"] },
		resultado: { correta: false, confianca: 4, confusao: "pontuação é ruído" },
		...extra,
	};
}
const gravar = async (...eventos: Evento[]) => {
	for (const item of eventos) await acrescentarEvento(eventosAprendiz(dados), item);
};

async function cenario(): Promise<void> {
	await criarMateria("nlp", "Processamento de linguagem");
	await criarMapa("nlp", [
		["token", "Tokenização"],
		["idf", "Frequência inversa"],
	]);
	await gravar(evento(1, "s1"), evento(2, "s1"), evento(3, "s2"), evento(4, "s3", { resultado: { correta: true, confianca: 3 } }));
}

describe("a janela de eventos", () => {
	const todas = new Set(["nlp"]);

	it("só os depois do último lido, em ordem de id, sem os de hipótese, do método e de matéria que não existe mais", () => {
		const eventos: Evento[] = [
			evento(5, "s2"),
			evento(1, "s1"),
			evento(3, "s1", { verbo: "refletiu", objeto: { reflexao: "r-1" } }),
			evento(4, "s1", { verbo: "aprovou_hipotese", objeto: { hipotese: "h-1" } }),
			evento(6, "s2", { verbo: "iniciou_experimento_metodo" }),
			evento(7, "s2", { objeto: { materia: "apagada", conceitos: ["x"] } }),
			evento(8, "s3", { verbo: "autoavaliou_conceito", resultado: { nivel: 3 } }),
		];
		const janela = janelaDaReflexao(eventos, { materias: todas });
		expect(janela.eventos.map((item) => item.id)).toEqual(["ev001", "ev005", "ev008"]);
		expect(janela.ultimoEvento).toBe("ev008");
		expect(janela.cortados).toBe(0);
		expect(janelaDaReflexao(eventos, { materias: todas, depoisDe: "ev005" }).eventos.map((item) => item.id)).toEqual(["ev008"]);
		const vazia = janelaDaReflexao(eventos, { materias: todas, depoisDe: "ev008" });
		expect(vazia.eventos).toEqual([]);
		expect(vazia.ultimoEvento).toBeUndefined();
	});

	it("passando do limite entram os mais antigos e o último é o último que entrou (o resto fica para a próxima reflexão)", () => {
		const muitos = Array.from({ length: LIMITE_EVENTOS_DA_REFLEXAO + 30 }, (_, indice) => evento(indice + 1, "s1"));
		const janela = janelaDaReflexao(muitos, { materias: todas });
		expect(janela.eventos).toHaveLength(LIMITE_EVENTOS_DA_REFLEXAO);
		expect(janela.cortados).toBe(30);
		expect(janela.eventos[0]!.id).toBe(idDe(1));
		expect(janela.ultimoEvento).toBe(idDe(LIMITE_EVENTOS_DA_REFLEXAO));
	});

	it("cortarTexto junta os espaços e corta com reticências", () => {
		expect(cortarTexto("  a   b\n c ", 10)).toBe("a b c");
		const cortado = cortarTexto("x".repeat(500), 400);
		expect(cortado).toHaveLength(400);
		expect(cortado.endsWith("…")).toBe(true);
	});
});

describe("a entrada da reflexão", () => {
	it("sem evento novo (ou só de hipótese), semEventos e nenhuma mensagem", async () => {
		await cenario();
		await gravar(evento(10, "s3", { verbo: "refletiu", objeto: { reflexao: "r-1" } }));
		const preparada = await prepararReflexao(dados, { pastaCache: cache, agora: AGORA });
		expect(preparada.semEventos).toBe(false);
		await rm(eventosAprendiz(dados));
		await gravar(evento(10, "s3", { verbo: "refletiu", objeto: { reflexao: "r-1" } }));
		expect(await prepararReflexao(dados, { pastaCache: cache, agora: AGORA })).toEqual({ semEventos: true });
	});

	it("a mensagem traz as sessões, os nomes, os indicadores, a autoavaliação como 'o aluno disse' e o texto cortado em 400", async () => {
		await cenario();
		await gravar(
			evento(5, "s3", { verbo: "autoavaliou_conceito", resultado: { nivel: 3 } }),
			evento(6, "s3", { verbo: "respondeu_verificacao", resultado: { avaliacao: "errada", texto: `começo ${"y".repeat(600)}`, confianca: 2 } }),
		);
		const preparada = await prepararReflexao(dados, { pastaCache: cache, agora: AGORA });
		if (preparada.semEventos) throw new Error("devia ter eventos");
		expect(preparada.lidos).toBe(6);
		expect(preparada.ultimoEvento).toBe("ev006");
		expect(preparada.janela).toEqual(["ev001", "ev002", "ev003", "ev004", "ev005", "ev006"]);
		const { mensagem } = preparada;
		expect(mensagem).toContain("## Hipóteses atuais");
		expect(mensagem).toContain("- nlp = Processamento de linguagem");
		expect(mensagem).toContain("- nlp/token = Tokenização");
		expect(mensagem).toMatch(/- ev001 \| S1 \| 2026-11-01 \| respondeu_questao \| materia=nlp curso=c questao=q1 \| conceitos: token \(Tokenização\) \| resultado: \{"correta":false,"confianca":4,"confusao":"pontuação é ruído"\}/);
		expect(mensagem).toMatch(/- ev003 \| S2 /);
		expect(mensagem).toMatch(/- ev005 \| S3 \| 2026-11-05 \| autoavaliou_conceito \| .* \| O ALUNO DISSE \(autoavaliação, não é o que ele fez\): nível 3 «Sei aplicar»/);
		expect(mensagem).not.toMatch(/ev005 .*resultado:/);
		const linha6 = mensagem.split("\n").find((linha) => linha.startsWith("- ev006"))!;
		expect(linha6).toContain("começo yyy");
		expect(linha6).toContain("…");
		expect(linha6.length).toBeLessThan(900);
		expect(mensagem).toContain("## Indicadores");
		expect(mensagem).toMatch(/- nlp\/token «Tokenização»: domínio \d+% /);
		expect(mensagem).toMatch(/o aluno DISSE nível 3/);
		expect(mensagem).toContain("confusões: «pontuação é ruído»");
		expect(mensagem).not.toContain("idf");
	});

	it("as hipóteses atuais e as rejeitadas ('não repetir') entram; as expiradas não; continua depois do último evento da reflexão anterior", async () => {
		await cenario();
		const base = { tipo: "misconception", escopo: { nivel: "conceito", materia: "nlp", conceitos: ["token"] }, aFavor: ["ev001", "ev003"], contra: [], confianca: "baixa", criadaEm: "2026-11-01T10:00:00.000Z", ultimaConfirmacao: "2026-11-01T10:00:00.000Z", validade: "2027-01-01T10:00:00.000Z", aprovadaPeloUsuario: false, versao: 1, anteriores: [] };
		await escrever(join(dados, "aprendiz", "hipoteses.json"), {
			versao: 1,
			hipoteses: [
				{ ...base, id: "h-1", enunciado: "Em tokenização, confunde pontuação com ruído", status: "proposta" },
				{ ...base, id: "h-2", enunciado: "Em tokenização, ignora números sempre", status: "rejeitada" },
				{ ...base, id: "h-3", enunciado: "Em tokenização, esquece o espaço inicial", status: "expirada" },
				{ ...base, id: "h-4", enunciado: "Em tokenização, trata hífen como separador", status: "expirada", ultimaConfirmacao: "2026-05-01T10:00:00.000Z" },
			],
			mudancas: [{ id: "m-1", hipotese: "h-1", acao: "reforcar", evidencias: ["ev002"], motivo: "x", reflexao: "r-0", criadaEm: "2026-11-02T10:00:00.000Z" }],
			ultimaReflexao: { id: "r-0", ts: "2026-11-02T10:00:00.000Z", motivo: "botao", ultimoEvento: "ev002", lidos: 2, propostas: 1, aceitas: 1, descartadas: [] },
		});
		const preparada = await prepararReflexao(dados, { pastaCache: cache, agora: AGORA });
		if (preparada.semEventos) throw new Error("devia ter eventos");
		expect(preparada.janela).toEqual(["ev003", "ev004"]);
		expect(preparada.mensagem).toContain("- h-1 | proposta | misconception | conceito token da matéria nlp | confiança baixa | 2 a favor, 0 contra | «Em tokenização, confunde pontuação com ruído» | mudança pendente esperando o aluno: reforcar");
		expect(preparada.mensagem).toContain("- «Em tokenização, ignora números sempre»");
		// as expiradas dos últimos 90 dias aparecem (para reforçar pelo id e trazer de volta); as mais antigas, não
		expect(preparada.mensagem).toContain("## Hipóteses expiradas nos últimos 90 dias");
		expect(preparada.mensagem).toContain("- h-3 | misconception | conceito token da matéria nlp | «Em tokenização, esquece o espaço inicial»");
		expect(preparada.mensagem).not.toContain("trata hífen");
		expect(preparada.mensagem).not.toContain("- h-2 |");
	});
});

describe("a saída do modelo", () => {
	it("lê o JSON puro, o JSON na cerca de código e o JSON com texto em volta; a lista pode ser vazia", () => {
		const corpo = '{"propostas":[{"acao":"expirar","hipotese":"h-1","evidencias":[],"motivo":"x"}]}';
		expect(propostasDaResposta(corpo)).toHaveLength(1);
		expect(propostasDaResposta(`\`\`\`json\n${corpo}\n\`\`\``)).toHaveLength(1);
		expect(propostasDaResposta(`Aqui vai:\n${corpo}\nPronto.`)).toHaveLength(1);
		expect(propostasDaResposta('{"propostas": []}')).toEqual([]);
	});

	it("lixo, JSON sem 'propostas' ou com 'propostas' que não é lista: erro com o motivo", () => {
		expect(() => propostasDaResposta("não sei")).toThrow(/não tem um objeto JSON/);
		expect(() => propostasDaResposta('{"propostas": ')).toThrow(/inválido/);
		expect(() => propostasDaResposta('{"outra": []}')).toThrow(/propostas/);
		expect(() => propostasDaResposta('{"propostas": "nada"}')).toThrow(/propostas/);
	});
});

describe("uma reflexão inteira com o modelo falso", () => {
	const naFila = <T>(tarefa: () => Promise<T>) => tarefa();

	function modeloFalso(propostas: unknown[] | (() => unknown[]), custo = 0.02) {
		const chamadas: string[] = [];
		const chamar = async (mensagem: string): Promise<RespostaDaReflexao> => {
			chamadas.push(mensagem);
			return { propostas: typeof propostas === "function" ? propostas() : propostas, custo };
		};
		return { chamar, chamadas };
	}

	const criarMisconception = (evidencias: string[]) => ({
		acao: "criar",
		tipo: "misconception",
		escopo: { nivel: "conceito", materia: "nlp", conceitos: ["token"] },
		enunciado: "Em tokenização, confunde remover pontuação com remover ruído",
		evidencias,
		motivo: "errou duas vezes com a mesma confusão",
	});

	it("grava a hipótese 'proposta', o resumo e os eventos; a próxima reflexão sem evento novo não chama o modelo", async () => {
		await cenario();
		const modelo = modeloFalso([criarMisconception(["ev001", "ev003"])]);
		const feito = await executarReflexao(dados, { motivo: "botao", sessao: "sessao-1", agora: AGORA, pastaCache: cache, chamar: modelo.chamar, naFila });
		if (feito.semEventos) throw new Error("devia ter refletido");
		expect(modelo.chamadas).toHaveLength(1);
		expect(feito.resumo).toMatchObject({ motivo: "botao", ultimoEvento: "ev004", lidos: 4, propostas: 1, aceitas: 1, descartadas: [], custo: 0.02 });
		const arquivo = await lerHipoteses(dados);
		expect(arquivo.hipoteses).toHaveLength(1);
		expect(arquivo.hipoteses[0]).toMatchObject({ status: "proposta", aprovadaPeloUsuario: false, aFavor: ["ev001", "ev003"], confianca: "baixa", reflexao: feito.resumo.id });
		expect(arquivo.ultimaReflexao).toEqual(feito.resumo);
		const verbos = (await lerEventos(eventosAprendiz(dados))).eventos.map((item) => item.verbo);
		expect(verbos).toContain("refletiu");
		expect(verbos).toContain("propos_hipotese");

		const outra = modeloFalso([]);
		const de_novo = await executarReflexao(dados, { motivo: "licao", agora: AGORA, pastaCache: cache, chamar: outra.chamar, naFila });
		expect(de_novo.semEventos).toBe(true);
		expect(de_novo.resumo).toMatchObject({ lidos: 0, propostas: 0, aceitas: 0, descartadas: [], ultimoEvento: "ev004" });
		expect(outra.chamadas).toEqual([]);
		expect((await lerEventos(eventosAprendiz(dados))).eventos.filter((item) => item.verbo === "refletiu")).toHaveLength(1);
	});

	it("descarta a proposta sem evidência, com evidência que não existe, de uma sessão só, de fora da janela e a que repete; o motivo vai no resumo", async () => {
		await cenario();
		// ev005 é de outro conceito (idf): nunca é "anterior dos mesmos conceitos" dos eventos de token
		await gravar(evento(5, "s4", { objeto: { materia: "nlp", curso: "c", questao: "q5", conceitos: ["idf"] } }), evento(6, "s5"));
		// a primeira reflexão lê tudo; a segunda só ev007 e ev008 (a janela dela); ev001 e ev006 viram "anteriores"
		await executarReflexao(dados, { motivo: "botao", agora: AGORA, pastaCache: cache, chamar: modeloFalso([]).chamar, naFila });
		await gravar(evento(7, "s6"), evento(8, "s7"));
		const modelo = modeloFalso([
			criarMisconception([]),
			{ ...criarMisconception(["ev007", "naoexiste"]), enunciado: "Em tokenização, ignora os números" },
			{ ...criarMisconception(["ev005", "ev007"]), enunciado: "Em tokenização, esquece as contrações" },
			{ ...criarMisconception(["ev007", "ev008"]), enunciado: "Em tokenização, divide palavras compostas" },
			{ ...criarMisconception(["ev007", "ev008"]), enunciado: "Em tokenização, divide palavras compostas" },
			"lixo",
		]);
		const feito = await executarReflexao(dados, { motivo: "modulo", agora: AGORA, pastaCache: cache, chamar: modelo.chamar, naFila });
		if (feito.semEventos) throw new Error("devia ter refletido");
		expect(feito.resumo).toMatchObject({ lidos: 2, propostas: 6, aceitas: 1, ultimoEvento: "ev008" });
		const motivos = Object.fromEntries(feito.resumo.descartadas.map((item) => [item.motivo, item.quantas]));
		expect(motivos).toEqual({ sem_evidencia: 1, evidencia_inexistente: 1, evidencia_fora_da_janela: 1, enunciado_repetido: 1, formato_invalido: 1 });
		expect((await lerHipoteses(dados)).hipoteses.map((item) => item.enunciado)).toEqual(["Em tokenização, divide palavras compostas"]);
	});

	it("a autoavaliação não sustenta sozinha uma hipótese de conhecimento (descarte próprio)", async () => {
		await cenario();
		await gravar(evento(5, "s3", { verbo: "autoavaliou_conceito", resultado: { nivel: 3 } }), evento(6, "s4", { verbo: "autoavaliou_conceito", resultado: { nivel: 3 } }));
		const modelo = modeloFalso([{ ...criarMisconception(["ev005", "ev006"]), tipo: "conhecimento", enunciado: "Em tokenização, sabe aplicar bem" }]);
		const feito = await executarReflexao(dados, { motivo: "botao", agora: AGORA, pastaCache: cache, chamar: modelo.chamar, naFila });
		if (feito.semEventos) throw new Error("devia ter refletido");
		expect(feito.resumo.aceitas).toBe(0);
		expect(feito.resumo.descartadas).toEqual([{ motivo: MOTIVO_AUTOAVALIACAO_SOZINHA, quantas: 1 }]);
		expect((await lerHipoteses(dados)).hipoteses).toEqual([]);
	});

	it("se o modelo falha nada é gravado e o último evento não avança", async () => {
		await cenario();
		await expect(
			executarReflexao(dados, {
				motivo: "botao",
				agora: AGORA,
				pastaCache: cache,
				chamar: async () => {
					throw new Error("sem rede");
				},
				naFila,
			}),
		).rejects.toThrow("sem rede");
		expect((await lerHipoteses(dados)).ultimaReflexao).toBeUndefined();
		expect((await lerEventos(eventosAprendiz(dados))).eventos.map((item) => item.verbo)).not.toContain("refletiu");
		const modelo = modeloFalso([]);
		const feito = await executarReflexao(dados, { motivo: "botao", agora: AGORA, pastaCache: cache, chamar: modelo.chamar, naFila });
		expect(feito.resumo.lidos).toBe(4);
	});
});
