// Testes da extensão dos módulos sem o pi: um "pi" falso com um barramento
// síncrono (como o pi.events), o pi.on e o registerTool, numa pasta de dados
// temporária com uma matéria, um .extraido de mentira, um mapa gravado à mão
// e um curso pronto montado pela lib. O modelo é um registro falso com
// respostas prontas; a tela é simulada mandando "interface:acao".

import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmarEtapa, type Curso, gravarCurso, novoCurso } from "../lib/cursos.ts";
import type { Diagnostico } from "../lib/diagnostico.ts";
import { calcularCalendario, type Modulo as ModuloDoEsqueleto } from "../lib/esqueleto.ts";
import { arquivoEscrita, lerEscrita, type RegraEscrita, salvarRegra } from "../lib/escrita.ts";
import { gravarGlossario, lerGlossario } from "../lib/termos.ts";
import { acrescentarEvento, criarEvento, lerEventos } from "../lib/eventos.ts";
import { type Conceito, gravarMapa, lerMapa, mapaVazio, pastaExtraidoArquivo } from "../lib/mapa.ts";
import { criarMateria, eventosAprendiz, eventosMateria } from "../lib/materias.ts";
import {
	caminhoDoRelatorio,
	caminhoDosAjustes,
	caminhoDosAprendizados,
	FRASE_DOS_AJUSTES,
	gravarAjustes,
	gravarAprendizados,
	lerAjustes,
	lerAprendizados,
	lerRelatorio,
	type RelatorioMetodo,
	type RelatorioMetodoV2,
} from "../lib/metodo-ciclo.ts";
import { ARQUIVOS_METODO, caminhoDoModulo, type EstadoModuloNaTela, gravarModulo, lerModulo, MINIMO_CARACTERES_EXEMPLO, type ModuloGerado } from "../lib/modulos.ts";
import { hashDoPrompt, lerMetodo, PASTA_METODO } from "./cursos.ts";
import type { RespostaModulo } from "../lib/modulo-respostas.ts";
import modulos, {
	CAMINHO_PROMPT_BLOCO,
	CAMINHO_PROMPT_EXPLICAR,
	CAMINHO_PROMPT_LICAO,
	CAMINHO_PROMPT_PLANO,
	CAMINHO_PROMPT_RELATORIO,
	CAMINHO_PROMPT_TERMOS,
	CAMINHO_PROMPT_VERIFICACAO,
	type MensagemEstado,
	type OpcoesModulos,
} from "./modulos.ts";
import { lerPromptMapeador } from "./mapa.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] }; modelRegistry: unknown };
type Pedido = { contexto: { systemPrompt?: string; messages: Array<{ role: string; content: unknown }> }; opcoes: { signal?: AbortSignal; maxTokens?: number } };
type Resposta = string | ((pedido: Pedido) => Promise<string>);
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, unknown>; gravar?: boolean };

const CURSO = "p1-busca";
const PROMPT_PLANO = "---\nmodel: teste/modelo-x\n---\nPlaneje as lições.\n";
const PROMPT_LICAO = "---\nmodel: teste/modelo-x\n---\nEscreva a lição.\n";
const PROMPT_BLOCO = "---\nmodel: teste/modelo-x\n---\nReescreva o bloco.\n";
const PROMPT_VERIFICACAO = "---\nmodel: teste/modelo-x\n---\nConfira a pergunta.\n";
const PROMPT_CORRETOR = "---\nmodel: teste/modelo-x\n---\nCorrija pela rubrica.\n";
const PROMPT_TERMOS = "---\nmodel: teste/modelo-x\n---\nMarque os termos.\n";
const PROMPT_EXPLICAR = "---\nmodel: teste/modelo-x\n---\nExplique o trecho.\n";
const PROMPT_RELATORIO = "---\nmodel: teste/modelo-x\n---\nEscreva o relatório do método.\n";
/** Os arquivos da metodologia de mentira, em <dados>/metodo. */
const METODO: Record<string, string> = Object.fromEntries(ARQUIVOS_METODO.map((arquivo) => [arquivo, `Como escrever (${arquivo}).\n`]));
/** O system prompt com a metodologia de mentira, como instrucoesComMetodo o monta. */
const comMetodo = (instrucoes: string, arquivos: string[]) =>
	[instrucoes, ...arquivos.map((arquivo) => `<metodologia arquivo="${arquivo}">\n${METODO[arquivo]!.trim()}\n</metodologia>`)].join("\n\n");
const metodoUsado = (arquivo: string) => ({ nome: `metodo/${arquivo}`, hash: hashDoPrompt(METODO[arquivo]!) });

let dados = "";
let materia = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
let tratadores: Record<string, (evento: unknown, ctx: Contexto) => void>;
let mostrados: Mostrado[];
let entradas: Entrada[];
let ctx: Contexto;
let respostas: Resposta[];
let chamadas: Pedido[];

const MODELO = { provider: "teste", id: "modelo-x", cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 } };

/** Um registro de modelos falso: cada chamada leva a próxima resposta pronta e custa US$ 0,01. */
const registro = {
	find: (provedor: string, id: string) => (provedor === "teste" && id === "modelo-x" ? MODELO : undefined),
	hasConfiguredAuth: () => true,
	complete: async (_modelo: unknown, contexto: Pedido["contexto"], opcoes: Pedido["opcoes"]) => {
		const pedido = { contexto: { ...contexto, messages: [...contexto.messages] }, opcoes };
		chamadas.push(pedido);
		const resposta = respostas.shift();
		if (resposta === undefined) throw new Error("sem resposta pronta");
		let texto: string;
		try {
			texto = typeof resposta === "function" ? await resposta(pedido) : resposta;
		} catch (erro) {
			if (opcoes.signal?.aborted) return { role: "assistant", content: [], stopReason: "aborted", errorMessage: "abortado", usage: { cost: { total: 0 } } };
			throw erro;
		}
		return { role: "assistant", content: [{ type: "text", text: texto }], stopReason: "stop", usage: { cost: { total: 0.01 } } };
	},
};

/** Uma resposta que só sai quando o teste mandar (ou falha quando a chamada é abortada). */
function adiada(): { resposta: Resposta; soltar(texto: string): void } {
	let soltar: (texto: string) => void = () => undefined;
	const resposta: Resposta = (pedido) =>
		new Promise<string>((resolver, rejeitar) => {
			soltar = resolver;
			pedido.opcoes.signal?.addEventListener("abort", () => rejeitar(new Error("abortado")));
		});
	return { resposta, soltar: (texto) => soltar(texto) };
}

/** Um "pi" falso no barramento do teste. */
function piFalso(registrar = true): ExtensionAPI {
	return {
		events: {
			on: (canal: string, ouvinte: (dados: unknown) => void) => {
				barramento.on(canal, ouvinte);
				return () => barramento.off(canal, ouvinte);
			},
			emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
		},
		on: (evento: string, tratador: (evento: unknown, ctx: Contexto) => void) => {
			if (registrar) tratadores[evento] = tratador;
		},
		registerTool: (definicao: Ferramenta & { name: string }) => {
			if (registrar) ferramentas[definicao.name] = definicao;
		},
	} as unknown as ExtensionAPI;
}

const opcoesDeTeste = (extra: OpcoesModulos = {}): OpcoesModulos => ({
	caminhoPromptPlano: join(dados, "modulo-plano.md"),
	caminhoPromptLicao: join(dados, "modulo-licao.md"),
	caminhoPromptBloco: join(dados, "modulo-bloco.md"),
	caminhoPromptVerificacao: join(dados, "verificacao.md"),
	caminhoPromptCorretor: join(dados, "corretor.md"),
	caminhoPromptTermos: join(dados, "modulo-termos.md"),
	caminhoPromptExplicar: join(dados, "explicar-trecho.md"),
	caminhoPromptRelatorio: join(dados, "relatorio-metodo.md"),
	pastaMetodo: join(dados, "metodo"),
	...extra,
});

/** Liga uma extensão nova (com as opções do teste) e dá a ela o session_start. */
function ligar(extra: OpcoesModulos = {}) {
	modulos(piFalso(), opcoesDeTeste(extra));
	tratadores.session_start?.({}, ctx);
}

/** Um .extraido de mentira com os trechos (o corpo de cada um num .md). */
async function extrair(arquivo: string, trechos: Array<{ local: string; nome: string; texto: string }>, hash = `h-${arquivo}`): Promise<void> {
	const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
	await mkdir(pasta, { recursive: true });
	for (const trecho of trechos) await writeFile(join(pasta, `${trecho.nome}.md`), `---\narquivo: ${arquivo}\nlocal: ${trecho.local}\norigem: texto\n---\n\n${trecho.texto}\n`, "utf8");
	const manifesto = { versao: 1, arquivo, hash, tamanho: 1, tipo: "pdf", extraidoEm: "2026-10-21T00:00:00.000Z", custo: 0, avisos: [], trechos: trechos.map(({ local, nome }) => ({ local, nome, origem: "texto" })) };
	await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");
}

const AGORA = new Date("2026-10-26T13:00:00.000Z");
const ref = (pagina: number) => ({ arquivo: "aula.pdf", local: `página ${pagina}`, trecho: `pagina-${pagina}` });
const conceito = (id: string, nome: string, referencias: Conceito["referencias"]): Conceito => ({
	id,
	nome,
	descricao: `Descrição de ${nome}.`,
	referencias,
	prioridade: "normal",
	origem: "material",
	criadoEm: AGORA.toISOString(),
});

const MODULOS: ModuloDoEsqueleto[] = [
	{ id: "m1", nome: "Pesos dos termos", objetivo: "Calcular o TF-IDF.", conceitos: ["c-tf", "c-idf"], tipo: "normal", horas: 2 },
	{ id: "m2", nome: "Similaridade", objetivo: "Comparar documentos.", conceitos: ["c-cos"], tipo: "curto", horas: 1 },
];

/** O curso pronto, pela lib: c-tf iniciante (nunca vi), c-idf intermediário (sei explicar), c-cos domina (sei aplicar). */
function cursoPronto(): Curso {
	let curso = novoCurso(CURSO, materia, { nome: "P1: busca", prazo: null, prova: "P1", horasPorSemana: 4 }, AGORA);
	curso = confirmarEtapa(curso, "materiais", { arquivos: [{ arquivo: "aula.pdf", hash: "h-aula.pdf" }] }, AGORA).curso;
	curso = confirmarEtapa(curso, "objetivo", { escopo: "so_material", tipo: "aplicado", motivo: "Use os exercícios como base para as questões práticas." }, AGORA).curso;
	curso = confirmarEtapa(curso, "mapa", { conceitos: ["c-tf", "c-idf", "c-cos"] }, AGORA).curso;
	const diagnostico = {
		autoavaliacao: { "c-tf": 0, "c-idf": 2, "c-cos": 3 },
		questoes: [],
		respostas: {},
		geradoEm: AGORA.toISOString(),
		modelo: "teste/modelo-x",
		custo: 0,
		concluidoEm: AGORA.toISOString(),
	} as unknown as Diagnostico;
	curso = confirmarEtapa(curso, "diagnostico", diagnostico, AGORA).curso;
	const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: null, hoje: "2026-10-26" });
	return confirmarEtapa(curso, "esqueleto", { modulos: MODULOS, geradoEm: AGORA.toISOString(), modelo: "teste/modelo-x", custo: 0, criadoEm: AGORA.toISOString(), calendario }, AGORA).curso;
}

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-modulos-"));
	materia = (await criarMateria(dados, { nome: "Recuperação de informação" })).id;
	entradas = [];
	respostas = [];
	chamadas = [];
	await writeFile(join(dados, "modulo-plano.md"), PROMPT_PLANO, "utf8");
	await writeFile(join(dados, "modulo-licao.md"), PROMPT_LICAO, "utf8");
	await writeFile(join(dados, "modulo-bloco.md"), PROMPT_BLOCO, "utf8");
	await writeFile(join(dados, "verificacao.md"), PROMPT_VERIFICACAO, "utf8");
	await writeFile(join(dados, "corretor.md"), PROMPT_CORRETOR, "utf8");
	await writeFile(join(dados, "modulo-termos.md"), PROMPT_TERMOS, "utf8");
	await writeFile(join(dados, "explicar-trecho.md"), PROMPT_EXPLICAR, "utf8");
	await writeFile(join(dados, "relatorio-metodo.md"), PROMPT_RELATORIO, "utf8");
	await mkdir(join(dados, "metodo"), { recursive: true });
	for (const [arquivo, conteudo] of Object.entries(METODO)) await writeFile(join(dados, "metodo", arquivo), conteudo, "utf8");
	await gravarMapa(dados, materia, {
		...mapaVazio(),
		situacao: "aprovado",
		aprovadoEm: AGORA.toISOString(),
		conceitos: [conceito("c-tf", "Frequência do termo", [ref(1)]), conceito("c-idf", "Frequência inversa", [ref(2)]), conceito("c-cos", "Similaridade do cosseno", [ref(3)])],
	});
	await extrair("aula.pdf", [
		{ local: "página 1", nome: "pagina-1", texto: "TF conta quantas vezes o termo aparece no documento." },
		{ local: "página 2", nome: "pagina-2", texto: "IDF é o log de N sobre o número de documentos com o termo." },
		{ local: "página 3", nome: "pagina-3", texto: "O cosseno compara os vetores de pesos." },
	]);
	await gravarCurso(dados, cursoPronto());
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas }, modelRegistry: registro };
	barramento = new EventEmitter();
	ferramentas = {};
	tratadores = {};
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
});

afterEach(async () => {
	tratadores.session_shutdown?.({}, ctx);
	await rm(dados, { recursive: true, force: true });
});

/** Espera até `condicao` valer; desiste em 3 s e diz os erros que a extensão mandou. */
async function esperar(condicao: () => boolean | Promise<boolean>): Promise<void> {
	const limite = Date.now() + 3000;
	while (Date.now() < limite) {
		if (await condicao()) return;
		await new Promise((resolver) => setTimeout(resolver, 5));
	}
	if (await condicao()) return;
	throw new Error(`não aconteceu; erros mandados: ${JSON.stringify(mostrados.filter((mensagem) => mensagem.acao === "erro").map((mensagem) => mensagem.dados))}`);
}

const acao = (nome: string, dadosAcao: Record<string, unknown> = {}) => barramento.emit("interface:acao", { painel: "modulos", acao: nome, dados: { materia, curso: CURSO, ...dadosAcao } });
const recebidas = (nome: string) => mostrados.filter((mensagem) => mensagem.acao === nome);
const estados = () => recebidas("estado").map((mensagem) => mensagem.dados as unknown as MensagemEstado);
const ultimo = () => estados().at(-1);
const doModulo = (estado: MensagemEstado | undefined, id: string) => estado?.modulos.find((item) => item.id === id);
const situacaoDe = (id: string) => doModulo(ultimo(), id)?.situacao;
const comPedido = (pedido: string) => mostrados.filter((mensagem) => mensagem.dados.pedido === pedido);
const respondeu = (pedido: string) => esperar(() => comPedido(pedido).length > 0);
const erroDe = (pedido: string) => comPedido(pedido).find((mensagem) => mensagem.acao === "erro")?.dados;
const doVerbo = async (verbo: string) => (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === verbo);
/** As situações de m1 em cada estado mandado, sem repetir em seguida (com a lição em escrevendo). */
const caminhoDe = (id: string) =>
	estados()
		.map((estado) => doModulo(estado, id))
		.filter((item): item is EstadoModuloNaTela => item !== undefined)
		.map((item) => (item.situacao === "escrevendo" ? `escrevendo ${item.licao}/${item.licoes}` : item.situacao))
		.filter((item, indice, lista) => indice === 0 || lista[indice - 1] !== item);
/** O texto da última mensagem do usuário de uma chamada. */
const textoDaChamada = (pedido: Pedido) => {
	const mensagens = pedido.contexto.messages.filter((mensagem) => mensagem.role === "user");
	const conteudo = mensagens.at(-1)!.content as Array<{ text: string }>;
	return conteudo.map((parte) => parte.text).join("");
};

// --- As respostas do modelo ---------------------------------------------------------------

const PLANO_M1 = JSON.stringify({
	licoes: [
		{ titulo: "Contando termos", objetivo: "Calcular o TF.", conceitos: ["c-tf"], roteiro: ["introducao", "conceito", "verificacao", "exemplo_resolvido", "ideia_central", "alternativa"] },
		{ titulo: "Termos raros pesam mais", objetivo: "Calcular o IDF.", conceitos: ["c-idf"], roteiro: ["introducao", "conceito", "exemplo_incompleto", "ideia_central", "dissertativa"] },
	],
});
/** Uma explicação acima do mínimo de caracteres do formato (o esquema da lição). */
const explicacao = (conceitoId: string, formato: string, local: string) => ({ tipo: "explicacao", conceitos: [conceitoId], formato, texto: `Texto sobre ${conceitoId}. ${"x".repeat(MINIMO_CARACTERES_EXEMPLO)}`, referencias: [{ arquivo: "aula.pdf", local }] });
const ideiaCentral = (conceitoId: string) => ({ tipo: "ideia_central", conceitos: [conceitoId], texto: `Guarde o essencial de ${conceitoId}.` });
const alternativa = (conceitoId: string) => ({
	tipo: "alternativa",
	conceitos: [conceitoId],
	contexto: "```python\ncontar('a', doc)\n```",
	enunciado: "Quanto vale?",
	alternativas: [
		{ texto: "1", confusao: "Conta documentos." },
		{ texto: "2", correta: true },
		{ texto: "3", confusao: "Soma tudo." },
		{ texto: "4", confusao: "Conta letras." },
	],
	explicacao: "São duas ocorrências.",
	referencias: [{ arquivo: "aula.pdf", local: "página 1" }],
});
const dissertativa = (conceitoId: string) => ({
	tipo: "dissertativa",
	conceitos: [conceitoId],
	enunciado: "Por que termos raros pesam mais?",
	rubrica: [
		{ criterio: "Raridade", descricao: "Diz que poucos documentos têm o termo.", pontos: 2 },
		{ criterio: "Log", descricao: "Diz que o log suaviza.", pontos: 2 },
		{ criterio: "Exemplo", descricao: "Dá um exemplo.", pontos: 1 },
	],
	respostaModelo: "Porque distinguem documentos.",
	referencias: [],
});
const LICAO_1 = JSON.stringify({
	blocos: [
		explicacao("c-tf", "introducao", "página 1"),
		explicacao("c-tf", "conceito", "página 1"),
		{ tipo: "verificacao", conceitos: ["c-tf"], pergunta: "O que o TF conta?", respostaEsperada: "As ocorrências do termo no documento." },
		explicacao("c-tf", "exemplo_resolvido", "página 1"),
		ideiaCentral("c-tf"),
		alternativa("c-tf"),
	],
});
const LICAO_2 = JSON.stringify({
	blocos: [explicacao("c-idf", "introducao", "página 2"), explicacao("c-idf", "conceito", "página 2"), explicacao("c-idf", "exemplo_incompleto", "página 2"), ideiaCentral("c-idf"), dissertativa("c-idf")],
});
/** Uma lição sem prática que valha (validarLicao pede a nova tentativa). */
const LICAO_SEM_PRATICA = JSON.stringify({ blocos: [explicacao("c-tf", "conceito", "página 1")] });
/** Uma lição fora do esquema: sem a introdução e sem a ideia central antes do quiz (problemasDaLicao). */
const LICAO_FORA_DO_ESQUEMA = JSON.stringify({ blocos: [explicacao("c-tf", "conceito", "página 1"), explicacao("c-tf", "exemplo_resolvido", "página 1"), alternativa("c-tf")] });
/** Um plano que precisa de conserto: a lição 1 sem a introdução e sem a ideia central. */
const PLANO_A_CONSERTAR = JSON.stringify({
	licoes: [
		{ titulo: "Contando termos", objetivo: "Calcular o TF.", conceitos: ["c-tf"], roteiro: ["conceito", "exemplo_resolvido", "verificacao", "conceito", "alternativa"] },
		{ titulo: "Termos raros pesam mais", objetivo: "Calcular o IDF.", conceitos: ["c-idf"], roteiro: ["introducao", "conceito", "exemplo_incompleto", "ideia_central", "dissertativa"] },
	],
});

/** Marca o arquivo como mapeado no mapa da matéria (mapa.arquivos com o hash do manifesto), como o mapeador faria. */
async function mapear(arquivo: string, hash = `h-${arquivo}`): Promise<void> {
	const mapa = await lerMapa(dados, materia);
	await gravarMapa(dados, materia, { ...mapa, arquivos: { ...mapa.arquivos, [arquivo]: { hash, mapeadoEm: AGORA.toISOString(), modelo: "teste/modelo-x", custo: 0, conceitos: 0 } } });
}

/** Põe as respostas de uma geração de m1 que dá certo. */
const geracaoQueDaCerto = () => respostas.push(PLANO_M1, LICAO_1, LICAO_2);

async function gerarM1(pedido = "p-gerar", extra: Record<string, unknown> = {}) {
	acao("gerar", { modulo: "m1", pedido, ...extra });
	await respondeu(pedido);
	await esperar(() => situacaoDe("m1") === "gerado" || situacaoDe("m1") === "erro");
}

// --- Testes -----------------------------------------------------------------------------------

describe("os prompts e a metodologia do perfil", () => {
	it("os prompts dizem o modelo e o formato; os arquivos da metodologia existem, cada um com o título", async () => {
		for (const caminho of [CAMINHO_PROMPT_PLANO, CAMINHO_PROMPT_LICAO, CAMINHO_PROMPT_BLOCO, CAMINHO_PROMPT_TERMOS, CAMINHO_PROMPT_EXPLICAR]) {
			const prompt = lerPromptMapeador(await readFile(caminho, "utf8"));
			expect(prompt.modelo).toBe("openrouter/openai/gpt-6.1-sol");
			expect(prompt.instrucoes).toContain("metodologia");
		}
		expect(lerPromptMapeador(await readFile(CAMINHO_PROMPT_LICAO, "utf8")).instrucoes).toContain('"tipo": "ideia_central"');
		const verificacao = lerPromptMapeador(await readFile(CAMINHO_PROMPT_VERIFICACAO, "utf8"));
		expect(verificacao.modelo).toBe("openrouter/openai/gpt-6.1-sol");
		expect(verificacao.instrucoes).toContain('"avaliacao"');
		expect(verificacao.instrucoes).toContain("metodologia");
		const lidos = await lerMetodo(PASTA_METODO, ARQUIVOS_METODO);
		expect(lidos.map((item) => item.usado.nome)).toEqual(ARQUIVOS_METODO.map((arquivo) => `metodo/${arquivo}`));
		for (const item of lidos) expect(item.conteudo).toMatch(/^# \S/);
	});
});

describe("ponte", () => {
	beforeEach(() => ligar());

	it("listar manda o estado de todos os módulos com o recomendado (proximo)", async () => {
		acao("listar", { pedido: "l1" });
		await respondeu("l1");
		expect(ultimo()).toEqual({
			materia,
			curso: CURSO,
			modulos: [
				{ id: "m1", situacao: "a_gerar" },
				{ id: "m2", situacao: "a_gerar" },
			],
			proximo: "m1",
			experimentosEmTeste: 0,
			pedido: "l1",
		});
		expect(mostrados.every((mensagem) => mensagem.painel === "modulos" && mensagem.gravar === false)).toBe(true);
	});

	it("matéria que não existe, curso ou módulo faltando é erro", async () => {
		barramento.emit("interface:acao", { painel: "modulos", acao: "listar", dados: { materia: "nao-existe", curso: CURSO, pedido: "e1" } });
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "listar", mensagem: 'Não achei a matéria "nao-existe".' });
		acao("gerar", { pedido: "e2" });
		await respondeu("e2");
		expect(erroDe("e2")).toMatchObject({ mensagem: "Falta o id do módulo." });
	});

	it("gerar: esperando nada, planejando, escrevendo cada lição e gerado; grava o arquivo, o evento e o custo", async () => {
		geracaoQueDaCerto();
		await gerarM1("p-gerar", { informacoes: "  Foco no IDF. ", observacoes: "" });
		expect(caminhoDe("m1")).toEqual(["planejando", "escrevendo 1/2", "escrevendo 2/2", "gerado"]);
		// A aceitação vai com o pedido.
		expect(comPedido("p-gerar")).toHaveLength(1);
		expect(doModulo(comPedido("p-gerar")[0]!.dados as unknown as MensagemEstado, "m1")?.situacao).toBe("planejando");

		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(gravado).toMatchObject({ situacao: "gerado", modelo: "teste/modelo-x", materiaisUsados: [{ arquivo: "aula.pdf", hash: "h-aula.pdf" }] });
		expect(gravado.custo).toBeCloseTo(0.03);
		expect(gravado.pedido).toMatchObject({ informacoes: "Foco no IDF." });
		expect(gravado.licoes.map((licao) => licao.blocos.map((bloco) => bloco.id))).toEqual([
			["l1-b1", "l1-b2", "l1-b3", "l1-b4", "l1-b5", "l1-b6"],
			["l2-b1", "l2-b2", "l2-b3", "l2-b4", "l2-b5"],
		]);
		expect(gravado.licoes[0]!.blocos[0]).toMatchObject({ formato: "introducao", referencias: [ref(1)] });

		const fim = doModulo(ultimo(), "m1")!;
		expect(fim).toMatchObject({ situacao: "gerado", licoesGeradas: 2, blocos: 11, questoes: 2, geradoEm: gravado.geradoEm, concluido: false });
		expect(fim.concluidoEm).toBeUndefined();
		// Gerado e não concluído, m1 continua o recomendado.
		expect(ultimo()!.proximo).toBe("m1");

		const eventos = await doVerbo("gerou_modulo");
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: CURSO, modulo: "m1" },
			resultado: { licoes: 2, blocos: 11, questoes: 2 },
			contexto: {
				modelo: "teste/modelo-x",
				// Os prompts e, depois, cada arquivo da metodologia usado (sem repetir), com o hash.
				prompts: [
					{ nome: "modulo-plano.md", hash: hashDoPrompt(PROMPT_PLANO) },
					{ nome: "modulo-licao.md", hash: hashDoPrompt(PROMPT_LICAO) },
					...ARQUIVOS_METODO.map(metodoUsado),
				],
			},
		});

		// As mensagens: o plano pede 2 lições (2 h) com os níveis e os locais; a lição leva o plano e os trechos.
		expect(chamadas).toHaveLength(3);
		const plano = textoDaChamada(chamadas[0]!);
		// O plano leva a estrutura da lição; cada lição, a estrutura e os arquivos dos itens do roteiro dela.
		expect(chamadas[0]!.contexto.systemPrompt).toBe(comMetodo("Planeje as lições.", ["estrutura-da-licao.md"]));
		expect(chamadas[1]!.contexto.systemPrompt).toBe(
			comMetodo("Escreva a lição.", ["estrutura-da-licao.md", "introducao.md", "conceito.md", "exemplos.md", "pergunta.md", "ideia-central.md", "quiz.md", "termos.md"]),
		);
		expect(plano).toContain("Lições pedidas: exatamente 2.");
		expect(plano).toContain("Motivo do aluno: Use os exercícios como base para as questões práticas.");
		expect(plano).toContain("Informações específicas do aluno para este módulo:\nFoco no IDF.");
		expect(plano).toContain("Nível do aluno: iniciante (exemplo no formato exemplo_resolvido");
		expect(plano).toContain("Nível do aluno: intermediário (exemplo no formato exemplo_incompleto");
		expect(plano).toContain("- aula.pdf, página 2");
		const licao2 = textoDaChamada(chamadas[2]!);
		expect(chamadas[2]!.contexto.systemPrompt).toBe(comMetodo("Escreva a lição.", ["estrutura-da-licao.md", "introducao.md", "conceito.md", "exemplos.md", "ideia-central.md", "dissertativa.md", "termos.md"]));
		expect(licao2).toContain("Roteiro (5 blocos, nesta ordem): 1. introducao; 2. conceito; 3. exemplo_incompleto; 4. ideia_central; 5. dissertativa");
		expect(licao2).toContain('Lição a escrever: l2, "Termos raros pesam mais"');
		expect(licao2).toContain('1. l1, "Contando termos"');
		expect(licao2).toContain('<trecho arquivo="aula.pdf" local="página 2">\nIDF é o log de N sobre o número de documentos com o termo.\n</trecho>');
		expect(licao2).not.toContain("TF conta quantas vezes");
	});

	it("uma lição inválida tem uma nova tentativa", async () => {
		respostas.push(PLANO_M1, LICAO_SEM_PRATICA, LICAO_1, LICAO_2);
		await gerarM1();
		expect(situacaoDe("m1")).toBe("gerado");
		expect(chamadas).toHaveLength(4);
		expect(textoDaChamada(chamadas[2]!)).toMatch(/^A lição l1 \("Contando termos"\) veio sem prática que valha\./);
		expect(textoDaChamada(chamadas[2]!)).toContain("Escreva a lição de novo, pelo esquema da lição e pela metodologia");
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).custo).toBeCloseTo(0.04);
	});

	it("uma lição fora do esquema tem uma nova tentativa com os problemas; duas, o erro com os problemas", async () => {
		respostas.push(PLANO_M1, LICAO_FORA_DO_ESQUEMA, LICAO_1, LICAO_2);
		await gerarM1("p1");
		expect(situacaoDe("m1")).toBe("gerado");
		const novaTentativa = textoDaChamada(chamadas[2]!);
		expect(novaTentativa).toContain('A lição l1 ("Contando termos") não segue o esquema da lição.');
		expect(novaTentativa).toContain("o primeiro bloco precisa ser a introdução");
		expect(novaTentativa).toContain("Falta a ideia central");
		expect(novaTentativa).toContain("Escreva a lição de novo");

		respostas.push(PLANO_M1, LICAO_FORA_DO_ESQUEMA, LICAO_FORA_DO_ESQUEMA);
		await gerarM1("p2");
		const emErro = doModulo(ultimo(), "m1")!;
		expect(emErro.situacao).toBe("erro");
		expect(emErro.mensagem).toContain('O modelo não devolveu a lição 1 de 2 ("Contando termos"), nem na segunda tentativa (A lição l1 ("Contando termos") não segue o esquema da lição.');
		expect(emErro.mensagem).not.toContain("Escreva a lição de novo");
	});

	it("um plano que precisou de conserto tem uma nova tentativa com os consertos; na segunda, vale o consertado", async () => {
		respostas.push(PLANO_A_CONSERTAR, PLANO_A_CONSERTAR, LICAO_1, LICAO_2);
		await gerarM1();
		expect(situacaoDe("m1")).toBe("gerado");
		expect(chamadas).toHaveLength(4);
		const novaTentativa = textoDaChamada(chamadas[1]!);
		expect(novaTentativa).toContain("O plano não seguiu tudo o que foi pedido, e o código precisou consertar:");
		expect(novaTentativa).toContain('- Lição l1 ("Contando termos"): faltava a introdução; entrou uma no começo do roteiro.');
		expect(novaTentativa).toContain("faltava a ideia central");
		// A lição 1 foi escrita pelo roteiro consertado.
		expect(textoDaChamada(chamadas[2]!)).toContain(
			"Roteiro (7 blocos, nesta ordem): 1. introducao; 2. conceito; 3. exemplo_resolvido; 4. verificacao; 5. conceito; 6. ideia_central; 7. alternativa",
		);

		// Um plano sem consertos não tem a nova tentativa.
		chamadas = [];
		respostas.push(PLANO_A_CONSERTAR, PLANO_M1, LICAO_1, LICAO_2);
		await gerarM1("p2");
		expect(chamadas).toHaveLength(4);
		expect(textoDaChamada(chamadas[2]!)).toContain("Roteiro (6 blocos, nesta ordem): 1. introducao; 2. conceito; 3. verificacao;");
	});

	it("uma lição que falha duas vezes deixa o módulo em erro, sem arquivo e sem evento", async () => {
		respostas.push(PLANO_M1, LICAO_SEM_PRATICA, LICAO_SEM_PRATICA);
		await gerarM1("p-falha");
		const emErro = doModulo(ultimo(), "m1")!;
		expect(emErro.situacao).toBe("erro");
		expect(emErro.mensagem).toContain("O modelo não devolveu a lição 1 de 2");
		expect(emErro.mensagem).toContain("Gasto das etapas anteriores: US$ 0.0100.");
		expect(recebidas("erro").at(-1)!.dados).toMatchObject({ ao: "gerar", curso: CURSO, modulo: "m1" });
		expect(await lerModulo(dados, materia, CURSO, "m1")).toBeUndefined();
		expect(await doVerbo("gerou_modulo")).toHaveLength(0);
		// Gerar de novo tira o erro.
		geracaoQueDaCerto();
		await gerarM1("p-de-novo");
		expect(situacaoDe("m1")).toBe("gerado");
	});

	it("qualquer módulo pode ser gerado, fora de ordem", async () => {
		respostas.push(
			JSON.stringify({ licoes: [{ titulo: "Cosseno", objetivo: "Comparar.", conceitos: ["c-cos"], roteiro: ["introducao", "conceito", "problema_aberto", "ideia_central", "alternativa"] }] }),
			JSON.stringify({
				blocos: [explicacao("c-cos", "introducao", "página 3"), explicacao("c-cos", "conceito", "página 3"), explicacao("c-cos", "problema_aberto", "página 3"), ideiaCentral("c-cos"), alternativa("c-cos")],
			}),
		);
		acao("gerar", { modulo: "m2", pedido: "p-m2" });
		await respondeu("p-m2");
		expect(erroDe("p-m2")).toBeUndefined();
		await esperar(() => situacaoDe("m2") === "gerado" || situacaoDe("m2") === "erro");
		expect(situacaoDe("m2")).toBe("gerado");
		expect(situacaoDe("m1")).toBe("a_gerar");
		expect(ultimo()!.proximo).toBe("m1");
	});

	it("concluir: grava o concluidoEm e o evento, manda o módulo e o estado com o pedido; a recomendação passa; gerar de novo e concluir de novo são erro", async () => {
		acao("concluir", { modulo: "m1", pedido: "c0" });
		await respondeu("c0");
		expect(erroDe("c0")).toMatchObject({ ao: "concluir", modulo: "m1", mensagem: expect.stringMatching(/ainda não foi gerado/) });

		geracaoQueDaCerto();
		await gerarM1();
		acao("concluir", { modulo: "m1", pedido: "c1" });
		await respondeu("c1");
		expect(erroDe("c1")).toBeUndefined();
		const resposta = comPedido("c1")[0]!;
		expect(resposta.acao).toBe("estado");
		const estado = resposta.dados as unknown as MensagemEstado;
		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(typeof gravado.concluidoEm).toBe("string");
		expect(doModulo(estado, "m1")).toMatchObject({ situacao: "gerado", concluido: true, concluidoEm: gravado.concluidoEm });
		expect(estado.proximo).toBe("m2");
		expect(recebidas("modulo").at(-1)!.dados).toMatchObject({ materia, curso: CURSO, modulo: { id: "m1", concluidoEm: gravado.concluidoEm } });
		const eventos = await doVerbo("concluiu_modulo");
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({ sessao: "sessao-1", objeto: { materia, curso: CURSO, modulo: "m1" }, resultado: { licoes: 2, questoes: 2 } });

		acao("concluir", { modulo: "m1", pedido: "c2" });
		await respondeu("c2");
		expect(erroDe("c2")).toMatchObject({ ao: "concluir", mensagem: "O módulo já foi concluído." });
		const antes = chamadas.length;
		acao("gerar", { modulo: "m1", pedido: "g-de-novo" });
		await respondeu("g-de-novo");
		expect(erroDe("g-de-novo")?.mensagem).toMatch(/já foi concluído/);
		expect(chamadas).toHaveLength(antes);
		expect(await doVerbo("concluiu_modulo")).toHaveLength(1);
	});

	it("concluir um módulo que está sendo gerado de novo é erro", async () => {
		geracaoQueDaCerto();
		await gerarM1("g1");
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar", { modulo: "m1", pedido: "g2" });
		await respondeu("g2");
		acao("concluir", { modulo: "m1", pedido: "c" });
		await respondeu("c");
		expect(erroDe("c")?.mensagem).toBe("Este módulo está sendo gerado. Pare a geração antes de concluí-lo.");
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).concluidoEm).toBeUndefined();
	});

	it("uma geração por curso de cada vez", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar", { modulo: "m1", pedido: "g1" });
		await esperar(() => chamadas.length === 1);
		acao("gerar", { modulo: "m1", pedido: "g2" });
		await respondeu("g2");
		expect(erroDe("g2")?.mensagem).toBe("Este módulo já está sendo gerado. Espere terminar (ou pare) antes de pedir de novo.");
	});

	it("aguardar marca o módulo, e um material que chega liga o materialNovo", async () => {
		acao("aguardar", { modulo: "m1", pedido: "a1", nota: " A aula 5 sai na quinta. " });
		await respondeu("a1");
		expect(doModulo(ultimo(), "m1")).toEqual({ id: "m1", situacao: "aguardando_material", nota: "A aula 5 sai na quinta.", materialNovo: false });
		expect(ultimo()!.proximo).toBe("m2");
		expect(await doVerbo("marcou_aguardando_material")).toHaveLength(1);

		const antes = estados().length;
		await extrair("aula-05.pdf", [{ local: "página 1", nome: "pagina-1", texto: "Aula 5." }]);
		barramento.emit("materiais:pronto", { caminho: `materias/${materia}/materiais/aula-05.pdf` });
		await esperar(() => estados().length > antes);
		expect(doModulo(ultimo(), "m1")).toMatchObject({ situacao: "aguardando_material", materialNovo: true });

		// Um aguardando pode ser gerado.
		geracaoQueDaCerto();
		await gerarM1("p-gera-aguardando");
		expect(situacaoDe("m1")).toBe("gerado");
	});

	it("esperando_materiais até o material do formulário ficar pronto (pelo aviso) e entrar no mapa", async () => {
		geracaoQueDaCerto();
		acao("gerar", { modulo: "m1", pedido: "p-esp", materiaisNovos: ["aula-05.pdf", "aula-05.pdf"] });
		await respondeu("p-esp");
		expect(doModulo(ultimo(), "m1")).toEqual({ id: "m1", situacao: "esperando_materiais", esperando: ["aula-05.pdf"], mensagem: "Esperando o processamento de aula-05.pdf" });
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(chamadas).toHaveLength(0);
		await extrair("aula-05.pdf", [{ local: "página 1", nome: "pagina-1", texto: "Aula 5." }]);
		barramento.emit("materiais:pronto", { caminho: `materias/${materia}/materiais/aula-05.pdf` });
		await esperar(() => doModulo(ultimo(), "m1")?.mensagem === "Esperando o mapa de conteúdo de aula-05.pdf");
		expect(doModulo(ultimo(), "m1")).toMatchObject({ situacao: "esperando_materiais", esperando: ["aula-05.pdf"] });
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(chamadas).toHaveLength(0);
		// O mapa grava o arquivo e manda o estado dele pela ponte.
		await mapear("aula-05.pdf");
		barramento.emit("interface:mostrar", { painel: "mapa", acao: "mapa", dados: { materia }, gravar: false });
		await esperar(() => situacaoDe("m1") === "gerado");
		expect(caminhoDe("m1")).toEqual(["esperando_materiais", "planejando", "escrevendo 1/2", "escrevendo 2/2", "gerado"]);
		expect(doModulo(ultimo(), "m1")!.aviso).toBeUndefined();
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).pedido?.materiaisNovos).toEqual(["aula-05.pdf"]);
	});

	it("um material já pronto e mapeado não faz esperar", async () => {
		await extrair("aula-05.pdf", [{ local: "página 1", nome: "pagina-1", texto: "Aula 5." }]);
		await mapear("aula-05.pdf");
		geracaoQueDaCerto();
		await gerarM1("p", { materiaisNovos: ["aula-05.pdf"] });
		expect(caminhoDe("m1")).toEqual(["planejando", "escrevendo 1/2", "escrevendo 2/2", "gerado"]);
	});

	it("o mapeamento que dá erro: gera assim mesmo, com o aviso no estado até a próxima ação", async () => {
		await extrair("aula-05.pdf", [{ local: "página 1", nome: "pagina-1", texto: "Aula 5." }]);
		geracaoQueDaCerto();
		acao("gerar", { modulo: "m1", pedido: "p", materiaisNovos: ["aula-05.pdf"] });
		await respondeu("p");
		await esperar(() => doModulo(ultimo(), "m1")?.mensagem === "Esperando o mapa de conteúdo de aula-05.pdf");
		barramento.emit("interface:mostrar", { painel: "mapa", acao: "erro", dados: { mensagem: "falhou", ao: "mapear", materia, arquivo: "aula-05.pdf" }, gravar: false });
		await esperar(() => situacaoDe("m1") === "gerado");
		const aviso = "aula-05.pdf entrou sem referências: o mapa não terminou.";
		// Durante a geração (planejando, escrevendo) e no gerado.
		expect(doModulo(estados().find((estado) => doModulo(estado, "m1")?.situacao === "escrevendo"), "m1")?.aviso).toBe(aviso);
		expect(doModulo(ultimo(), "m1")?.aviso).toBe(aviso);
		acao("listar", { pedido: "l" });
		await respondeu("l");
		expect(doModulo(ultimo(), "m1")?.aviso).toBe(aviso);
		acao("cancelar", { modulo: "m1", pedido: "c" });
		await respondeu("c");
		expect(doModulo(ultimo(), "m1")?.aviso).toBeUndefined();
	});

	it("cancelar para a geração e volta ao que estava", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar", { modulo: "m1", pedido: "g1" });
		await esperar(() => chamadas.length === 1);
		expect(situacaoDe("m1")).toBe("planejando");
		acao("cancelar", { modulo: "m1", pedido: "c1" });
		await respondeu("c1");
		expect(doModulo(ultimo(), "m1")).toEqual({ id: "m1", situacao: "a_gerar" });
		expect(chamadas[0]!.opcoes.signal?.aborted).toBe(true);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(recebidas("erro")).toHaveLength(0);
		expect(await lerModulo(dados, materia, CURSO, "m1")).toBeUndefined();
		// Pode gerar de novo.
		geracaoQueDaCerto();
		await gerarM1("g2");
		expect(situacaoDe("m1")).toBe("gerado");
	});

	it("gerar de novo um gerado mantém o anterior até o novo ficar pronto", async () => {
		geracaoQueDaCerto();
		await gerarM1("g1");
		const antes = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		const adiado = adiada();
		respostas.push(PLANO_M1, LICAO_1, adiado.resposta);
		acao("gerar", { modulo: "m1", pedido: "g2", informacoes: "Mais exemplos." });
		await respondeu("g2");
		await esperar(() => chamadas.length === 6);
		expect(situacaoDe("m1")).toBe("escrevendo");
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(antes);
		adiado.soltar(LICAO_2);
		await esperar(() => situacaoDe("m1") === "gerado");
		const depois = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(depois.pedido?.informacoes).toBe("Mais exemplos.");
		expect(await doVerbo("gerou_modulo")).toHaveLength(2);
	});

	it("abrir manda o módulo gerado; sem arquivo, erro", async () => {
		acao("abrir", { modulo: "m1", pedido: "o1" });
		await respondeu("o1");
		expect(erroDe("o1")?.mensagem).toBe("O módulo m1 ainda não foi gerado.");
		geracaoQueDaCerto();
		await gerarM1();
		acao("abrir", { modulo: "m1" });
		await esperar(() => recebidas("modulo").length > 0);
		expect(recebidas("modulo")[0]!.dados).toMatchObject({ materia, curso: CURSO, modulo: { id: "m1", situacao: "gerado" } });
	});

	it("um arquivo ilegível aparece em erro e não é sobrescrito", async () => {
		const arquivo = caminhoDoModulo(dados, materia, CURSO, "m1");
		await mkdir(join(arquivo, ".."), { recursive: true });
		await writeFile(arquivo, "{ quebrado", "utf8");
		acao("listar", { pedido: "l" });
		await respondeu("l");
		expect(doModulo(ultimo(), "m1")).toMatchObject({ situacao: "erro" });
		expect(doModulo(ultimo(), "m1")!.mensagem).toContain("Não consegui ler o módulo");
		acao("gerar", { modulo: "m1", pedido: "g" });
		await respondeu("g");
		expect(erroDe("g")?.mensagem).toContain("Não consegui ler o módulo");
		expect(await readFile(arquivo, "utf8")).toBe("{ quebrado");
		expect(chamadas).toHaveLength(0);
	});

	it("uma cópia sem session_start no mesmo barramento fica calada", async () => {
		modulos(piFalso(false), opcoesDeTeste());
		acao("listar", { pedido: "l" });
		await respondeu("l");
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(estados()).toHaveLength(1);
		geracaoQueDaCerto();
		await gerarM1();
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(chamadas).toHaveLength(3);
		expect(await doVerbo("gerou_modulo")).toHaveLength(1);
		expect(comPedido("p-gerar")).toHaveLength(1);
	});

	it("depois de session_shutdown a geração em andamento para sem gravar", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		acao("gerar", { modulo: "m1", pedido: "g1" });
		await esperar(() => chamadas.length === 1);
		const antes = mostrados.length;
		tratadores.session_shutdown?.({}, ctx);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toHaveLength(antes);
		expect(await lerModulo(dados, materia, CURSO, "m1")).toBeUndefined();
	});
});

describe("tempo limite dos materiais", () => {
	it("o mapa que não termina no tempo: gera assim mesmo, com o aviso", async () => {
		ligar({ tempoEsperaMateriaisMs: 60, intervaloVarreduraMs: 10 });
		await extrair("aula-05.pdf", [{ local: "página 1", nome: "pagina-1", texto: "Aula 5." }]);
		await extrair("aula-06.pdf", [{ local: "página 1", nome: "pagina-1", texto: "Aula 6." }]);
		geracaoQueDaCerto();
		acao("gerar", { modulo: "m1", pedido: "p", materiaisNovos: ["aula-05.pdf", "aula-06.pdf"] });
		await esperar(() => situacaoDe("m1") === "gerado");
		expect(doModulo(ultimo(), "m1")?.aviso).toBe("aula-05.pdf e aula-06.pdf entraram sem referências: o mapa não terminou.");
	});

	it("o material que não fica pronto vira erro claro", async () => {
		ligar({ tempoEsperaMateriaisMs: 60, intervaloVarreduraMs: 10 });
		acao("gerar", { modulo: "m1", pedido: "p", materiaisNovos: ["aula-09.pdf"] });
		await esperar(() => situacaoDe("m1") === "erro");
		expect(doModulo(ultimo(), "m1")!.mensagem).toBe(
			"O material aula-09.pdf não ficou pronto em 1 minuto (o processamento falhou ou ainda não terminou). O módulo não foi gerado; confira os materiais da matéria e gere de novo.",
		);
		expect(chamadas).toHaveLength(0);
	});
});

describe("ler_modulo", () => {
	beforeEach(() => ligar());
	const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });

	it("sem gabarito por padrão; com comGabarito, as respostas", async () => {
		const antes = await ferramentas.ler_modulo!.execute("1", { materia, curso: CURSO, modulo: "m1" }, undefined, undefined, ctx);
		expect(antes.isError).toBeUndefined();
		expect(antes.content[0]!.text).toBe("O módulo m1 (Pesos dos termos) ainda não foi gerado.");

		geracaoQueDaCerto();
		await gerarM1();
		const sem = (await ferramentas.ler_modulo!.execute("2", { materia, curso: CURSO, modulo: "m1" }, undefined, undefined, ctx)).content[0]!.text;
		expect(sem).toContain("# Módulo m1: Pesos dos termos");
		expect(sem).toContain(", ainda não concluído;");
		expect(sem).toContain("## Lição l1: Contando termos");
		expect(sem).toContain("### l1-b2 · Explicação (apresentação do conceito)");
		expect(sem).toContain("Texto sobre c-tf.");
		expect(sem).toContain("Conceitos: Frequência do termo.");
		expect(sem).toContain("Pergunta: O que o TF conta?");
		expect(sem).toContain("### l1-b1 · Explicação (introdução: o contexto do tema)");
		expect(sem).toContain("### l1-b5 · Ideia central\nConceitos: Frequência do termo.\n\nGuarde o essencial de c-tf.");
		expect(sem).toContain("B) 2\n");
		expect(sem).toContain("Referências: aula.pdf, página 1.");
		expect(sem).not.toContain("As ocorrências do termo no documento.");
		expect(sem).not.toContain("[correta]");
		expect(sem).not.toContain("Conta documentos.");
		expect(sem).not.toContain("Rubrica:");
		expect(sem).not.toContain("Porque distinguem documentos.");

		const com = (await ferramentas.ler_modulo!.execute("3", { materia, curso: CURSO, modulo: "m1", comGabarito: true }, undefined, undefined, ctx)).content[0]!.text;
		expect(com).toContain("Resposta esperada: As ocorrências do termo no documento.");
		expect(com).toContain("B) 2 [correta]");
		expect(com).toContain("A) 1 [errada; confusão: Conta documentos.]");
		expect(com).toContain("Explicação: São duas ocorrências.");
		expect(com).toContain("- Raridade (2 pontos): Diz que poucos documentos têm o termo.");
		expect(com).toContain("Resposta-modelo: Porque distinguem documentos.");

		acao("concluir", { modulo: "m1", pedido: "c" });
		await respondeu("c");
		const concluido = await ferramentas.ler_modulo!.execute("4", { materia, curso: CURSO, modulo: "m1" }, undefined, undefined, ctx);
		const data = ((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).concluidoEm!.slice(0, 10);
		expect(concluido.content[0]!.text).toContain(`, concluído pelo aluno em ${data};`);
		expect(concluido.details).toMatchObject({ situacao: "gerado", concluido: true });
	});

	it("numa conversa de caderno fica na matéria da conversa; módulo fora do esqueleto é erro", async () => {
		entradas = [contextoDe(`materia:${materia}`)];
		const doCaderno = await ferramentas.ler_modulo!.execute("1", { curso: CURSO, modulo: "m2" }, undefined, undefined, ctx);
		expect(doCaderno.content[0]!.text).toContain("O módulo m2 (Similaridade) ainda não foi gerado.");
		const outra = await ferramentas.ler_modulo!.execute("2", { materia: "fisica", curso: CURSO, modulo: "m1" }, undefined, undefined, ctx);
		expect(outra.isError).toBe(true);
		expect(outra.content[0]!.text).toContain("caderno");
		const fora = await ferramentas.ler_modulo!.execute("3", { curso: CURSO, modulo: "m9" }, undefined, undefined, ctx);
		expect(fora.isError).toBe(true);
		expect(fora.content[0]!.text).toContain('Não achei o módulo "m9"');
	});
});

// --- A escrita: as regras, o retorno e a reescrita do bloco ------------------------------------

const acaoEscrita = (nome: string, dadosAcao: Record<string, unknown> = {}) => barramento.emit("interface:acao", { painel: "escrita", acao: nome, dados: dadosAcao });
const daEscrita = (nome: string) => mostrados.filter((mensagem) => mensagem.painel === "escrita" && mensagem.acao === nome);
const doAprendiz = async (verbo: string) => (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => evento.verbo === verbo);
const regrasDe = (pedido: string) => (comPedido(pedido).find((mensagem) => mensagem.painel === "escrita" && mensagem.acao === "regras")?.dados.regras ?? []) as RegraEscrita[];

describe("painel escrita", () => {
	beforeEach(() => ligar());

	it("listar, salvar (criar e alterar) e apagar, com o pedido e os eventos", async () => {
		acaoEscrita("listar", { pedido: "l0" });
		await respondeu("l0");
		expect(comPedido("l0")[0]).toMatchObject({ painel: "escrita", acao: "regras", dados: { regras: [] }, gravar: false });

		acaoEscrita("salvar", { pedido: "s1", regra: { texto: "  Comece sempre por um exemplo. ", materia: null, ativa: true } });
		await respondeu("s1");
		const [criada] = regrasDe("s1");
		expect(criada).toMatchObject({ texto: "Comece sempre por um exemplo.", materia: null, ativa: true, origem: "escrita" });
		expect(criada!.id).toMatch(/^r-/);

		acaoEscrita("salvar", { pedido: "s2", regra: { id: criada!.id, texto: "Comece sempre por um exemplo.", materia, ativa: false } });
		await respondeu("s2");
		expect(regrasDe("s2")).toEqual([expect.objectContaining({ id: criada!.id, materia, ativa: false })]);

		acaoEscrita("apagar", { pedido: "a1", id: criada!.id });
		await respondeu("a1");
		expect(regrasDe("a1")).toEqual([]);
		expect((await lerEscrita(dados)).regras).toEqual([]);
		expect((await doAprendiz("criou_regra_escrita")).map((evento) => evento.sessao)).toEqual(["sessao-1"]);
		expect(await doAprendiz("alterou_regra_escrita")).toHaveLength(1);
		expect(await doAprendiz("apagou_regra_escrita")).toHaveLength(1);
		expect(mostrados.every((mensagem) => mensagem.gravar === false)).toBe(true);
	});

	it("erros voltam com o pedido: sem texto, matéria que não existe, id que não existe", async () => {
		acaoEscrita("salvar", { pedido: "e1", regra: { texto: "  ", materia: null, ativa: true } });
		await respondeu("e1");
		expect(erroDe("e1")).toEqual({ mensagem: "A regra está sem texto.", ao: "salvar", pedido: "e1" });
		acaoEscrita("salvar", { pedido: "e2", regra: { texto: "Uma regra.", materia: "nao-existe", ativa: true } });
		await respondeu("e2");
		expect(erroDe("e2")?.mensagem).toBe('Não achei a matéria "nao-existe".');
		acaoEscrita("apagar", { pedido: "e3", id: "r-nada" });
		await respondeu("e3");
		expect(erroDe("e3")?.mensagem).toContain('Não achei a regra "r-nada"');
		expect(daEscrita("erro")).toHaveLength(3);
		expect((await lerEscrita(dados)).regras).toEqual([]);
	});

	it("uma trava só: dois salvar ao mesmo tempo gravam as duas regras", async () => {
		acaoEscrita("salvar", { pedido: "s1", regra: { texto: "Regra um.", materia: null, ativa: true } });
		acaoEscrita("salvar", { pedido: "s2", regra: { texto: "Regra dois.", materia, ativa: true } });
		await respondeu("s1");
		await respondeu("s2");
		expect(regrasDe("s1").map((regra) => regra.texto)).toEqual(["Regra um."]);
		expect(regrasDe("s2").map((regra) => regra.texto)).toEqual(["Regra um.", "Regra dois."]);
		expect((await lerEscrita(dados)).regras.map((regra) => regra.texto)).toEqual(["Regra um.", "Regra dois."]);
	});

	it("um escrita.json ilegível é erro e não é sobrescrito", async () => {
		await mkdir(join(arquivoEscrita(dados), ".."), { recursive: true });
		await writeFile(arquivoEscrita(dados), "{ quebrado", "utf8");
		acaoEscrita("listar", { pedido: "l" });
		await respondeu("l");
		expect(erroDe("l")?.mensagem).toContain("Não consegui ler as regras de escrita");
		acaoEscrita("salvar", { pedido: "s", regra: { texto: "Uma regra.", materia: null, ativa: true } });
		await respondeu("s");
		expect(erroDe("s")?.mensagem).toContain("nada foi gravado por cima");
		expect(await readFile(arquivoEscrita(dados), "utf8")).toBe("{ quebrado");
		// A geração do módulo também não segue sem as regras.
		acao("gerar", { modulo: "m1", pedido: "g" });
		await respondeu("g");
		expect(erroDe("g")?.mensagem).toContain("Não consegui ler as regras de escrita");
		expect(chamadas).toHaveLength(0);
	});

	it("uma cópia sem session_start fica calada", async () => {
		modulos(piFalso(false), opcoesDeTeste());
		acaoEscrita("salvar", { pedido: "s", regra: { texto: "Uma regra.", materia: null, ativa: true } });
		await respondeu("s");
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(comPedido("s")).toHaveLength(1);
		expect((await lerEscrita(dados)).regras).toHaveLength(1);
	});
});

/** Um bloco de explicação reescrito pelo modelo falso. */
const EXPLICACAO_NOVA = JSON.stringify({
	bloco: { tipo: "explicacao", conceitos: ["c-tf"], formato: "exemplo_resolvido", texto: `No documento "a a b", o termo a aparece 2 vezes: TF = 2. ${"x".repeat(MINIMO_CARACTERES_EXEMPLO)}`, referencias: [{ arquivo: "aula.pdf", local: "página 1" }] },
});

const retornoDe = (pedido: string) => (comPedido(pedido).find((mensagem) => mensagem.acao === "estado")?.dados as unknown as MensagemEstado | undefined)?.retorno;

/**
 * Espera a mensagem modulo com o bloco na versão 2 (a reescrita chegou): o
 * retorno também manda um modulo (com a nota em feedback), então só contar as
 * mensagens não basta.
 */
const reescritoNa = (bloco: string, versao = 2) =>
	esperar(() =>
		recebidas("modulo").some((mensagem) => ((mensagem.dados.modulo as ModuloGerado).licoes.flatMap((licao) => licao.blocos).find((item) => item.id === bloco)?.versao ?? 1) === versao),
	);

/** Grava um retorno "ruim" (longo e abstrato) no l1-b1 e devolve o id do evento. */
async function retornoNoB1(pedido = "r1", extra: Record<string, unknown> = {}): Promise<string> {
	acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b1", pedido, avaliacao: "ruim", motivos: ["longo", "abstrato", "longo"], texto: " Muito texto antes do exemplo. ", ...extra });
	await respondeu(pedido);
	const id = retornoDe(pedido);
	if (!id) throw new Error(`o retorno não foi gravado: ${JSON.stringify(erroDe(pedido))}`);
	return id;
}

/** O prompt da reescrita com a metodologia da introdução (o l1-b1), como o reescreveu_bloco o guarda. */
const PROMPT_BLOCO_COM_INTRODUCAO = () => ({ nome: "modulo-bloco.md + metodo/introducao.md + metodo/termos.md", hash: `${hashDoPrompt(PROMPT_BLOCO)} + ${hashDoPrompt(METODO["introducao.md"]!)} + ${hashDoPrompt(METODO["termos.md"]!)}` });

const reescrever = (pedido: string, retorno: string, bloco = "l1-b1") => acao("reescrever_bloco", { modulo: "m1", licao: "l1", bloco, pedido, retorno });

describe("retorno e reescrita do bloco", () => {
	beforeEach(async () => {
		ligar();
		geracaoQueDaCerto();
		await gerarM1();
	});

	it("retorno sem virarRegra: o evento avaliou_bloco com o contexto do bloco e o estado com o pedido e o id", async () => {
		const id = await retornoNoB1();
		expect(comPedido("r1")[0]).toMatchObject({ painel: "modulos", acao: "estado", dados: { materia, curso: CURSO, pedido: "r1", retorno: id } });
		const [evento] = await doAprendiz("avaliou_bloco");
		expect(evento).toEqual({
			id,
			ts: expect.any(String),
			sessao: "sessao-1",
			verbo: "avaliou_bloco",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b1", tipo: "explicacao", conceitos: ["c-tf"] },
			resultado: { avaliacao: "ruim", motivos: ["longo", "abstrato"], texto: "Muito texto antes do exemplo." },
			contexto: { modelo: "teste/modelo-x", prompt: { nome: "modulo-licao.md", hash: hashDoPrompt(PROMPT_LICAO) }, versao: 1 },
		});
		expect(daEscrita("regras")).toHaveLength(0);
		expect(await doAprendiz("criou_regra_escrita")).toHaveLength(0);
	});

	it("retorno com virarRegra: grava o evento e a regra (origem retorno) e manda as regras no painel escrita", async () => {
		const id = await retornoNoB1("r1", { virarRegra: { texto: "Exemplo antes da definição.", materia } });
		await esperar(() => daEscrita("regras").length > 0);
		const regras = daEscrita("regras")[0]!.dados.regras as RegraEscrita[];
		expect(regras).toEqual([expect.objectContaining({ texto: "Exemplo antes da definição.", materia, ativa: true, origem: "retorno", retorno: id })]);
		expect((await lerEscrita(dados)).regras).toEqual(regras);
		const [criou] = await doAprendiz("criou_regra_escrita");
		expect(criou).toMatchObject({ resultado: { origem: "retorno", retorno: id } });
		expect(await doAprendiz("avaliou_bloco")).toHaveLength(1);
	});

	it("retorno inválido, ou de um bloco que não existe, é erro com o pedido e não grava", async () => {
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b1", pedido: "e1", avaliacao: "excelente" });
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "retorno", modulo: "m1", mensagem: expect.stringContaining("A avaliação do bloco não é válida") });
		// A antiga "melhorar" não vale num retorno novo.
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b1", pedido: "e0", avaliacao: "melhorar" });
		await respondeu("e0");
		expect(erroDe("e0")?.mensagem).toBe('A avaliação do bloco não é válida ("melhorar"): é ruim, bom ou otimo.');
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b9", pedido: "e2", avaliacao: "bom" });
		await respondeu("e2");
		expect(erroDe("e2")?.mensagem).toBe('Não achei o bloco "l1-b9" na lição l1.');
		expect(await doAprendiz("avaliou_bloco")).toHaveLength(0);
	});

	it("reescrever_bloco: reescrevendo no estado, o bloco novo com versao 2 e o antigo em anteriores, o evento e o módulo novo", async () => {
		const id = await retornoNoB1();
		const antes = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		const antigo = antes.licoes[0]!.blocos[0]!;
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const chamadasAntes = chamadas.length;
		reescrever("w1", id);
		await respondeu("w1");
		expect(doModulo(comPedido("w1")[0]!.dados as unknown as MensagemEstado, "m1")).toMatchObject({ situacao: "gerado", reescrevendo: { licao: "l1", bloco: "l1-b1" } });
		await esperar(() => chamadas.length > chamadasAntes);

		// A mensagem: a lição com os outros blocos, o bloco atual, o retorno, o nível e os trechos do conceito do bloco.
		const pedido = chamadas.at(-1)!;
		// O system prompt leva o arquivo da metodologia do tipo do bloco (l1-b1 é a introdução).
		expect(pedido.contexto.systemPrompt).toBe(comMetodo("Reescreva o bloco.", ["introducao.md", "termos.md"]));
		const mensagem = textoDaChamada(pedido);
		expect(mensagem).toContain('Lição do bloco: l1, "Contando termos"');
		expect(mensagem).toContain("### l1-b1 · Explicação (posição 1): ESTE É O BLOCO A REESCREVER");
		expect(mensagem).toContain("Pergunta: O que o TF conta?");
		expect(mensagem).toContain("Resposta esperada: As ocorrências do termo no documento.");
		expect(mensagem).toContain("Bloco a reescrever: l1-b1, do tipo explicacao, posição 1 de 6, versão 1.");
		expect(mensagem).toContain('"texto": "Texto sobre c-tf. x');
		expect(mensagem).not.toContain('"id": "l1-b1"');
		expect(mensagem).toContain("Avaliação: Ruim\nMotivos: Longo demais (longo); Abstrato demais (abstrato)\nTexto do aluno: Muito texto antes do exemplo.");
		expect(mensagem).toContain("Nível do aluno: iniciante");
		expect(mensagem).toContain('<trecho arquivo="aula.pdf" local="página 1">\nTF conta quantas vezes o termo aparece no documento.\n</trecho>');
		expect(mensagem).not.toContain("IDF é o log");
		expect(mensagem).toContain("Escopo: só o material");
		expect(mensagem).toContain("Motivo do aluno: Use os exercícios como base para as questões práticas.");
		expect(mensagem).not.toContain("Regras de escrita");

		adiado.soltar(EXPLICACAO_NOVA);
		await reescritoNa("l1-b1");
		const novo = recebidas("modulo").at(-1)!.dados.modulo as ModuloGerado;
		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(novo).toEqual(gravado);
		const bloco = gravado.licoes[0]!.blocos[0]!;
		expect(bloco).toMatchObject({ id: "l1-b1", tipo: "explicacao", formato: "exemplo_resolvido", versao: 2, referencias: [ref(1)] });
		expect(bloco.reescritoEm).toEqual(expect.any(String));
		expect(bloco.anteriores).toEqual([{ ...antigo, versao: 1, substituidoEm: bloco.reescritoEm, retorno: id }]);
		// O resto do módulo não muda (nem o custo, que é o da geração).
		expect(gravado.licoes[0]!.blocos.slice(1)).toEqual(antes.licoes[0]!.blocos.slice(1));
		expect(gravado.custo).toBe(antes.custo);
		await esperar(() => doModulo(ultimo(), "m1")?.reescrevendo === undefined);
		expect(situacaoDe("m1")).toBe("gerado");

		const [evento] = await doAprendiz("reescreveu_bloco");
		expect(evento).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b1", tipo: "explicacao", conceitos: ["c-tf"] },
			resultado: { de: 1, para: 2, retorno: id },
			contexto: { modelo: "teste/modelo-x", prompt: PROMPT_BLOCO_COM_INTRODUCAO(), custo: 0.01 },
		});

		// Um retorno na versão 2 leva o modelo e o prompt da reescrita.
		await retornoNoB1("r2");
		const ultimoRetorno = (await doAprendiz("avaliou_bloco")).at(-1)!;
		expect(ultimoRetorno.contexto).toEqual({ modelo: "teste/modelo-x", prompt: PROMPT_BLOCO_COM_INTRODUCAO(), versao: 2 });
	});

	it("a ideia central também é reescrita, com o arquivo dela na metodologia", async () => {
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b5", pedido: "r1", avaliacao: "ruim", motivos: ["confuso"], texto: "Mais direto." });
		await respondeu("r1");
		const id = retornoDe("r1")!;
		respostas.push(JSON.stringify({ bloco: { tipo: "ideia_central", conceitos: ["c-tf"], texto: "O TF conta as ocorrências do termo no documento." } }));
		reescrever("w1", id, "l1-b5");
		await respondeu("w1");
		await reescritoNa("l1-b5");
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(comMetodo("Reescreva o bloco.", ["ideia-central.md", "termos.md"]));
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("### l1-b5 · Ideia central (posição 5): ESTE É O BLOCO A REESCREVER");
		const bloco = ((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).licoes[0]!.blocos[4]!;
		expect(bloco).toMatchObject({ id: "l1-b5", tipo: "ideia_central", texto: "O TF conta as ocorrências do termo no documento.", versao: 2 });
		const [evento] = await doAprendiz("reescreveu_bloco");
		expect(evento!.contexto).toMatchObject({
			prompt: { nome: "modulo-bloco.md + metodo/ideia-central.md + metodo/termos.md", hash: `${hashDoPrompt(PROMPT_BLOCO)} + ${hashDoPrompt(METODO["ideia-central.md"]!)} + ${hashDoPrompt(METODO["termos.md"]!)}` },
		});
	});

	it("uma resposta inválida tem uma nova tentativa; duas, o erro, e o bloco fica como estava", async () => {
		const id = await retornoNoB1();
		const errado = JSON.stringify({ bloco: { tipo: "verificacao", conceitos: ["c-tf"], pergunta: "?", respostaEsperada: "!" } });
		respostas.push(errado, EXPLICACAO_NOVA);
		reescrever("w1", id);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		expect(textoDaChamada(chamadas.at(-1)!)).toContain('A sua resposta não veio como o pedido: O bloco reescrito veio do tipo "verificacao", e precisava ser "explicacao".');
		expect((await doAprendiz("reescreveu_bloco"))[0]!.contexto).toMatchObject({ custo: 0.02 });

		const id2 = await retornoNoB1("r2");
		// Depois do retorno (que grava a nota em feedback): a reescrita que falha não muda mais nada.
		const antes = await lerModulo(dados, materia, CURSO, "m1");
		respostas.push(errado, "isto não é JSON");
		reescrever("w2", id2);
		await respondeu("w2");
		await esperar(() => recebidas("erro").some((mensagem) => mensagem.dados.ao === "reescrever_bloco"));
		const erro = recebidas("erro").find((mensagem) => mensagem.dados.ao === "reescrever_bloco")!.dados;
		expect(erro).toMatchObject({ materia, curso: CURSO, modulo: "m1", mensagem: expect.stringContaining("O modelo não devolveu o bloco reescrito (l1-b1), nem na segunda tentativa") });
		expect(String(erro.mensagem)).toContain("O bloco não mudou. Gasto: US$ 0.0200.");
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(antes);
		expect(await doAprendiz("reescreveu_bloco")).toHaveLength(1);
		await esperar(() => doModulo(ultimo(), "m1")?.reescrevendo === undefined);
		expect(situacaoDe("m1")).toBe("gerado");
	});

	it("o retorno de outro bloco, ou que não existe, é erro com o pedido e não chama o modelo", async () => {
		const id = await retornoNoB1();
		const antes = chamadas.length;
		reescrever("w1", id, "l1-b3");
		await respondeu("w1");
		expect(erroDe("w1")).toMatchObject({ ao: "reescrever_bloco", mensagem: expect.stringContaining("é de outro bloco") });
		reescrever("w2", "nao-existe");
		await respondeu("w2");
		expect(erroDe("w2")?.mensagem).toBe('Não achei o retorno "nao-existe" nos eventos.');
		expect(chamadas).toHaveLength(antes);
		expect(doModulo(ultimo(), "m1")?.reescrevendo).toBeUndefined();
	});

	it("o retorno de uma sessão anterior é lido do eventos.jsonl", async () => {
		const id = await retornoNoB1();
		tratadores.session_shutdown?.({}, ctx);
		ligar();
		respostas.push(EXPLICACAO_NOVA);
		reescrever("w1", id);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("Texto do aluno: Muito texto antes do exemplo.");
	});

	it("uma operação por curso: gerar ou reescrever de novo durante a reescrita é erro; cancelar aborta", async () => {
		const id = await retornoNoB1();
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const antes = chamadas.length;
		reescrever("w1", id);
		await esperar(() => chamadas.length > antes);
		acao("gerar", { modulo: "m2", pedido: "g" });
		await respondeu("g");
		expect(erroDe("g")?.mensagem).toBe("Um bloco do módulo m1 deste curso está sendo reescrito. Espere terminar (ou pare) antes de gerar um módulo.");
		reescrever("w2", id);
		await respondeu("w2");
		expect(erroDe("w2")?.mensagem).toBe("Este bloco já está sendo reescrito. Espere terminar (ou pare) antes de pedir de novo.");

		acao("cancelar", { modulo: "m1", pedido: "c" });
		await respondeu("c");
		expect(chamadas.at(-1)!.opcoes.signal?.aborted).toBe(true);
		expect(doModulo(ultimo(), "m1")).toMatchObject({ situacao: "gerado" });
		expect(doModulo(ultimo(), "m1")?.reescrevendo).toBeUndefined();
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(recebidas("erro").filter((mensagem) => mensagem.dados.ao === "reescrever_bloco" && !mensagem.dados.pedido)).toHaveLength(0);
		expect(await doAprendiz("reescreveu_bloco")).toHaveLength(0);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).licoes[0]!.blocos[0]!.versao).toBeUndefined();

		// Durante uma geração, reescrever é erro.
		const outro = adiada();
		respostas.push(outro.resposta);
		acao("gerar", { modulo: "m2", pedido: "g2" });
		await respondeu("g2");
		reescrever("w3", id);
		await respondeu("w3");
		expect(erroDe("w3")?.mensagem).toBe("O módulo m2 deste curso está sendo gerado. Espere terminar (ou pare) antes de reescrever um bloco.");
	});
});

describe("as regras de escrita nas mensagens dos módulos", () => {
	beforeEach(() => ligar());

	it("as regras que valem para a matéria vão no fim do plano, da lição e da reescrita; as de outra matéria e as desligadas, não", async () => {
		await salvarRegra(dados, { texto: "Comece sempre por um exemplo concreto com números.", materia: null, ativa: true });
		await salvarRegra(dados, { texto: "Frases curtas.", materia, ativa: true });
		await salvarRegra(dados, { texto: "Regra de outra matéria.", materia: "outra-materia", ativa: true });
		await salvarRegra(dados, { texto: "Regra desligada.", materia: null, ativa: false });
		const secao = "Regras de escrita do Breno (obedeça sempre):\n1. Comece sempre por um exemplo concreto com números.\n2. Frases curtas.";
		geracaoQueDaCerto();
		await gerarM1();
		expect(chamadas).toHaveLength(3);
		for (const chamada of chamadas) {
			const texto = textoDaChamada(chamada);
			expect(texto.endsWith(`\n\n${secao}`)).toBe(true);
			expect(texto).not.toContain("Regra de outra matéria.");
			expect(texto).not.toContain("Regra desligada.");
		}
		const id = await retornoNoB1();
		respostas.push(EXPLICACAO_NOVA);
		reescrever("w1", id);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		expect(textoDaChamada(chamadas.at(-1)!).endsWith(`\n\n${secao}`)).toBe(true);
	});

	it("sem regras, as mensagens ficam sem a seção", async () => {
		geracaoQueDaCerto();
		await gerarM1();
		for (const chamada of chamadas) expect(textoDaChamada(chamada)).not.toContain("Regras de escrita");
	});
});

// --- As respostas das questões (docs/modulos.md, "Responder as questões") -------------------------

/** A correção que o modelo falso devolve para a dissertativa l2-b5 (3 de 5 pontos). */
const CORRECAO_M1 = JSON.stringify({
	criterios: [
		{ criterio: "Raridade", trechos: ["poucos documentos"], pontos: 2, justificativa: "Disse." },
		{ criterio: "Log", trechos: [], pontos: 0, justificativa: "Não disse." },
		{ criterio: "Exemplo", trechos: ["um exemplo"], pontos: 1, justificativa: "Deu." },
	],
});
const CONFERENCIA_PARCIAL = JSON.stringify({ avaliacao: "parcial", retorno: "Você disse o que conta, faltou dizer onde." });

type MensagemModuloDoTeste = { materia: string; curso: string; modulo: ModuloGerado; corrigindo: string[]; pedido?: string };
const mensagensModulo = () => recebidas("modulo").map((mensagem) => mensagem.dados as unknown as MensagemModuloDoTeste);
const ultimoModulo = () => mensagensModulo().at(-1)!;
const moduloDoPedido = (pedido: string) => comPedido(pedido).find((mensagem) => mensagem.acao === "modulo")?.dados as unknown as MensagemModuloDoTeste | undefined;
const respostaNa = (mensagem: MensagemModuloDoTeste | undefined, bloco: string) => mensagem?.modulo.respostas?.[bloco] as RespostaModulo | undefined;
const progressoDe = () => doModulo(ultimo(), "m1")?.progresso;
/** O prompt da lição que gerou os blocos (o contexto dos eventos das respostas). */
const PROMPT_DA_LICAO = () => ({ nome: "modulo-licao.md", hash: hashDoPrompt(PROMPT_LICAO) });

const responder = async (pedido: string, dadosAcao: Record<string, unknown>) => {
	acao("responder", { modulo: "m1", pedido, ...dadosAcao });
	await respondeu(pedido);
};

describe("responder as questões", () => {
	beforeEach(async () => {
		ligar();
		geracaoQueDaCerto();
		await gerarM1();
	});

	it("o estado leva o progresso de cada módulo gerado (a pergunta, o quiz e a dissertativa contam)", async () => {
		expect(progressoDe()).toEqual({ feitas: 0, questoes: 3 });
		expect(doModulo(ultimo(), "m2")?.progresso).toBeUndefined();
	});

	it("quiz: sem confiança é erro com o bloco; errada na primeira, a confusão e o evento; escolha repetida é erro; certa na segunda acaba; sem modelo", async () => {
		const chamadasAntes = chamadas.length;
		await responder("q0", { bloco: "l1-b6", escolha: 0, tempoMs: 1000 });
		expect(erroDe("q0")).toMatchObject({ ao: "responder", modulo: "m1", bloco: "l1-b6", mensagem: expect.stringContaining("confiança") });

		await responder("q1", { bloco: "l1-b6", confianca: 2, escolha: 0, tempoMs: 41000 });
		const primeira = moduloDoPedido("q1")!;
		expect(primeira.corrigindo).toEqual([]);
		expect(respostaNa(primeira, "l1-b6")).toMatchObject({ tipo: "alternativa", versao: 1, confianca: 2, tentativas: [{ escolha: 0, correta: false, confusao: "Conta documentos.", tempoMs: 41000 }] });
		const [evento] = await doAprendiz("respondeu_questao");
		expect(evento).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l1", questao: "l1-b6", conceitos: ["c-tf"] },
			resultado: { tentativa: 1, escolha: 0, correta: false, confusao: "Conta documentos.", confianca: 2, tempoMs: 41000 },
			contexto: { fase: "modulo", versao: 1, modelo: "teste/modelo-x", prompt: PROMPT_DA_LICAO() },
		});
		expect(respostaNa(primeira, "l1-b6")!.tentativas[0]!.evento).toBe(evento!.id);
		await esperar(() => estados().length > 0 && progressoDe() !== undefined);

		await responder("q2", { bloco: "l1-b6", escolha: 0, tempoMs: 1 });
		expect(erroDe("q2")?.mensagem).toContain("já foi escolhida");
		await responder("q3", { bloco: "l1-b6", escolha: 1, tempoMs: 12000 });
		expect(respostaNa(moduloDoPedido("q3"), "l1-b6")!.tentativas).toHaveLength(2);
		await esperar(() => progressoDe()?.feitas === 1);
		expect((await doAprendiz("respondeu_questao")).map((item) => item.resultado)).toEqual([
			{ tentativa: 1, escolha: 0, correta: false, confusao: "Conta documentos.", confianca: 2, tempoMs: 41000 },
			{ tentativa: 2, escolha: 1, correta: true, confianca: 2, tempoMs: 12000 },
		]);
		await responder("q4", { bloco: "l1-b6", escolha: 2, tempoMs: 1 });
		expect(erroDe("q4")?.mensagem).toContain("já acabou");
		expect(chamadas.length).toBe(chamadasAntes);
	});

	it("Não sei: sem confiança, o evento nao_sabia_questao e a questão feita", async () => {
		await responder("n1", { bloco: "l2-b5", naoSei: true });
		expect(respostaNa(moduloDoPedido("n1"), "l2-b5")).toMatchObject({ tipo: "dissertativa", naoSei: { em: expect.any(String) }, tentativas: [] });
		const [evento] = await doAprendiz("nao_sabia_questao");
		expect(evento).toMatchObject({ objeto: { questao: "l2-b5", licao: "l2", conceitos: ["c-idf"] }, resultado: { tipo: "dissertativa", tentativas: 0 }, contexto: { fase: "modulo", versao: 1 } });
		await esperar(() => progressoDe()?.feitas === 1);
		await responder("n2", { bloco: "l2-b5", confianca: 2, texto: "Agora sei.", tempoMs: 1 });
		expect(erroDe("n2")?.mensagem).toContain("já acabou");
	});

	it("pergunta: corrigindo até a conferência chegar; a mensagem ao modelo; a avaliação e o evento com o corretor", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const chamadasAntes = chamadas.length;
		await responder("v1", { bloco: "l1-b3", confianca: 3, texto: "  As ocorrências do termo.  ", tempoMs: 30000 });
		expect(moduloDoPedido("v1")!.corrigindo).toEqual(["l1-b3"]);
		expect(respostaNa(moduloDoPedido("v1"), "l1-b3")).toEqual({ tipo: "verificacao", versao: 1, confianca: 3, tentativas: [{ texto: "As ocorrências do termo.", tempoMs: 30000, em: expect.any(String) }] });
		await esperar(() => chamadas.length > chamadasAntes);
		// Uma mensagem modulo no meio (abrir) também leva o corrigindo.
		acao("abrir", { modulo: "m1" });
		await esperar(() => mensagensModulo().length >= 2);
		expect(ultimoModulo().corrigindo).toEqual(["l1-b3"]);
		// Responder de novo enquanto confere é erro.
		await responder("v2", { bloco: "l1-b3", texto: "Outra.", tempoMs: 1 });
		expect(erroDe("v2")?.mensagem).toContain("sendo conferida");

		const pedido = chamadas.at(-1)!;
		expect(pedido.contexto.systemPrompt).toBe(comMetodo("Confira a pergunta.", ["pergunta.md"]));
		expect((pedido.opcoes as { temperature?: number }).temperature).toBe(0);
		const mensagem = textoDaChamada(pedido);
		expect(mensagem).toContain("Pergunta: O que o TF conta?");
		expect(mensagem).toContain("Resposta esperada: As ocorrências do termo no documento.");
		expect(mensagem).toContain("<explicacoes>\nTexto sobre c-tf. x");
		expect(mensagem.match(/Texto sobre c-tf\./g)).toHaveLength(2);
		expect(mensagem).toContain("Resposta do aluno:\n<resposta>\nAs ocorrências do termo.\n</resposta>");

		adiado.soltar(CONFERENCIA_PARCIAL);
		await esperar(() => ultimoModulo().corrigindo.length === 0 && respostaNa(ultimoModulo(), "l1-b3")?.tentativas[0] !== undefined && "avaliacao" in respostaNa(ultimoModulo(), "l1-b3")!.tentativas[0]!);
		const conferida = ultimoModulo();
		expect(conferida.pedido).toBeUndefined();
		expect(respostaNa(conferida, "l1-b3")!.tentativas[0]).toMatchObject({ avaliacao: "parcial", retorno: "Você disse o que conta, faltou dizer onde.", modelo: "teste/modelo-x", custo: 0.01 });
		await esperar(() => progressoDe()?.feitas === 1);
		const [evento] = await doAprendiz("respondeu_verificacao");
		expect(evento).toMatchObject({
			objeto: { questao: "l1-b3", licao: "l1", conceitos: ["c-tf"] },
			resultado: { texto: "As ocorrências do termo.", avaliacao: "parcial", retorno: "Você disse o que conta, faltou dizer onde.", confianca: 3, tempoMs: 30000 },
			contexto: {
				fase: "modulo",
				versao: 1,
				modelo: "teste/modelo-x",
				prompt: PROMPT_DA_LICAO(),
				corretor: { modelo: "teste/modelo-x", prompt: { nome: "verificacao.md + metodo/pergunta.md", hash: `${hashDoPrompt(PROMPT_VERIFICACAO)} + ${hashDoPrompt(METODO["pergunta.md"]!)}` }, custo: 0.01 },
			},
		});
		expect(respostaNa(conferida, "l1-b3")!.tentativas[0]!.evento).toBe(evento!.id);
		expect(recebidas("erro").filter((mensagem) => mensagem.dados.ao === "corrigir")).toEqual([]);
	});

	it("dissertativa: a correção pela rubrica; a reescrita corrigida encerra; encerrar depois é erro", async () => {
		respostas.push(CORRECAO_M1);
		await responder("d1", { bloco: "l2-b5", confianca: 2, texto: "Poucos documentos têm o termo.", tempoMs: 180000 });
		expect(moduloDoPedido("d1")!.corrigindo).toEqual(["l2-b5"]);
		await esperar(() => ultimoModulo().corrigindo.length === 0 && Boolean((respostaNa(ultimoModulo(), "l2-b5")?.tentativas[0] as { correcao?: unknown } | undefined)?.correcao));
		const corretor = chamadas.at(-1)!;
		expect(corretor.contexto.systemPrompt).toBe(comMetodo("Corrija pela rubrica.", ["dissertativa.md"]));
		expect((corretor.opcoes as { temperature?: number }).temperature).toBe(0);
		expect(textoDaChamada(corretor)).toContain("Pergunta: Por que termos raros pesam mais?");
		expect(respostaNa(ultimoModulo(), "l2-b5")!.tentativas[0]).toMatchObject({ correcao: { total: 3, max: 5, modelo: "teste/modelo-x", custo: 0.01 } });
		await esperar(() => progressoDe()?.feitas === 1);

		respostas.push(JSON.stringify({ criterios: JSON.parse(CORRECAO_M1).criterios.map((item: { pontos: number }, indice: number) => ({ ...item, pontos: [2, 2, 1][indice] })) }));
		await responder("d2", { bloco: "l2-b5", texto: "Poucos documentos têm o termo, e o log suaviza. Por exemplo...", tempoMs: 60000 });
		await esperar(() => Boolean((respostaNa(ultimoModulo(), "l2-b5") as { encerradaEm?: string } | undefined)?.encerradaEm));
		const final = respostaNa(ultimoModulo(), "l2-b5")!;
		expect(final.tentativas).toHaveLength(2);
		expect(final.tentativas[1]).toMatchObject({ correcao: { total: 5, max: 5 } });
		const eventos = await doAprendiz("respondeu_dissertativa");
		expect(eventos.map((evento) => [evento.resultado?.tentativa, evento.resultado?.total])).toEqual([
			[1, 3],
			[2, 5],
		]);
		expect(eventos[0]).toMatchObject({
			objeto: { questao: "l2-b5", licao: "l2", conceitos: ["c-idf"] },
			resultado: { texto: "Poucos documentos têm o termo.", max: 5, criterios: [{ criterio: "Raridade", pontos: 2, max: 2 }, {}, {}], confianca: 2, tempoMs: 180000 },
			contexto: { fase: "modulo", corretor: { modelo: "teste/modelo-x", prompt: { nome: "corretor.md + metodo/dissertativa.md" }, custo: 0.01 } },
		});
		acao("encerrar", { modulo: "m1", bloco: "l2-b5", pedido: "e1" });
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "encerrar", bloco: "l2-b5", mensagem: expect.stringContaining("já está encerrada") });
	});

	it("encerrar (Ver a resposta-modelo) depois da primeira correção: o módulo com o pedido e o encerradaEm", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		await responder("d1", { bloco: "l2-b5", confianca: 2, texto: "Poucos documentos.", tempoMs: 1 });
		acao("encerrar", { modulo: "m1", bloco: "l2-b5", pedido: "e0" });
		await respondeu("e0");
		// Antes da correção chegar, encerrar é erro.
		expect(erroDe("e0")?.mensagem).toContain("sendo corrigida");
		adiado.soltar(CORRECAO_M1);
		await esperar(() => ultimoModulo().corrigindo.length === 0 && Boolean((respostaNa(ultimoModulo(), "l2-b5")?.tentativas[0] as { correcao?: unknown } | undefined)?.correcao));
		acao("encerrar", { modulo: "m1", bloco: "l2-b5", pedido: "e1" });
		await respondeu("e1");
		expect(respostaNa(moduloDoPedido("e1"), "l2-b5")).toMatchObject({ encerradaEm: expect.any(String) });
		await responder("d2", { bloco: "l2-b5", texto: "Reescrita.", tempoMs: 1 });
		expect(erroDe("d2")?.mensagem).toContain("já acabou");
	});

	it("a conferência que falha vira erro com o bloco, sem pedido; corrigir tenta de novo com o pedido", async () => {
		respostas.push("ruim", '{"avaliacao": "talvez", "retorno": ""}');
		await responder("v1", { bloco: "l1-b3", confianca: 1, texto: "Não lembro bem.", tempoMs: 1 });
		await esperar(() => recebidas("erro").some((mensagem) => mensagem.dados.ao === "corrigir"));
		const erro = recebidas("erro").find((mensagem) => mensagem.dados.ao === "corrigir")!.dados;
		expect(erro).toMatchObject({ ao: "corrigir", materia, curso: CURSO, modulo: "m1", bloco: "l1-b3" });
		expect(erro.pedido).toBeUndefined();
		expect(String(erro.mensagem)).toContain("continua sem conferência");
		await esperar(() => ultimoModulo().corrigindo.length === 0);
		expect(await doAprendiz("respondeu_verificacao")).toHaveLength(0);

		respostas.push(CONFERENCIA_PARCIAL);
		acao("corrigir", { modulo: "m1", bloco: "l1-b3", pedido: "c1" });
		await respondeu("c1");
		expect(moduloDoPedido("c1")!.corrigindo).toEqual([]);
		expect(respostaNa(moduloDoPedido("c1"), "l1-b3")!.tentativas[0]).toMatchObject({ avaliacao: "parcial" });
		expect(await doAprendiz("respondeu_verificacao")).toHaveLength(1);
		acao("corrigir", { modulo: "m1", bloco: "l1-b3", pedido: "c2" });
		await respondeu("c2");
		expect(erroDe("c2")).toMatchObject({ ao: "corrigir", bloco: "l1-b3", mensagem: expect.stringContaining("esperando a conferência") });
	});

	it("a conferência que ficou velha (o módulo foi gerado de novo) é jogada fora sem gravar", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const chamadasAntes = chamadas.length;
		await responder("v1", { bloco: "l1-b3", confianca: 3, texto: "Ocorrências.", tempoMs: 1 });
		await esperar(() => chamadas.length > chamadasAntes);
		geracaoQueDaCerto();
		acao("gerar", { modulo: "m1", pedido: "g2" });
		await respondeu("g2");
		await esperar(() => chamadas.length === chamadasAntes + 4 && situacaoDe("m1") === "gerado" && doModulo(ultimo(), "m1")?.geradoEm !== undefined);
		await esperar(async () => (await doVerbo("gerou_modulo")).length === 2);
		// O módulo novo não tem as respostas, e a conferência em andamento não conta mais.
		acao("abrir", { modulo: "m1" });
		await esperar(() => mensagensModulo().length >= 2 && ultimoModulo().modulo.respostas === undefined);
		expect(ultimoModulo().corrigindo).toEqual([]);
		const mensagensAntes = mensagensModulo().length;
		adiado.soltar(CONFERENCIA_PARCIAL);
		await esperar(() => mensagensModulo().length > mensagensAntes);
		expect(ultimoModulo().modulo.respostas).toBeUndefined();
		expect(await doAprendiz("respondeu_verificacao")).toHaveLength(0);
		expect(recebidas("erro")).toEqual([]);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).respostas).toBeUndefined();
	});

	it("reescrever um bloco mantém as respostas; a do bloco reescrito fica sem valor (o progresso cai), sem apagar nada", async () => {
		await responder("q1", { bloco: "l1-b6", confianca: 3, escolha: 1, tempoMs: 1 });
		await responder("n1", { bloco: "l2-b5", naoSei: true });
		await esperar(() => progressoDe()?.feitas === 2);
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b6", pedido: "r1", avaliacao: "ruim", motivos: ["confuso"], texto: "" });
		await respondeu("r1");
		const retorno = retornoDe("r1")!;
		respostas.push(JSON.stringify({ bloco: { ...alternativa("c-tf"), enunciado: "Quantas vezes aparece?" } }));
		acao("reescrever_bloco", { modulo: "m1", licao: "l1", bloco: "l1-b6", pedido: "w1", retorno });
		await respondeu("w1");
		await esperar(() => mensagensModulo().some((mensagem) => (mensagem.modulo.licoes[0]!.blocos[5]!.versao ?? 1) === 2));
		const novo = ultimoModulo().modulo;
		expect(novo.respostas!["l1-b6"]).toMatchObject({ versao: 1, tentativas: [{ escolha: 1, correta: true }] });
		expect(novo.respostas!["l2-b5"]).toMatchObject({ naoSei: { em: expect.any(String) } });
		await esperar(() => progressoDe()?.feitas === 1);
		// A questão reescrita é nova: pede a confiança de novo, e a resposta nova substitui a antiga.
		await responder("q2", { bloco: "l1-b6", escolha: 0, tempoMs: 1 });
		expect(erroDe("q2")?.mensagem).toContain("confiança");
		await responder("q3", { bloco: "l1-b6", confianca: 1, escolha: 0, tempoMs: 1 });
		expect(respostaNa(moduloDoPedido("q3"), "l1-b6")).toMatchObject({ versao: 2, confianca: 1, tentativas: [{ escolha: 0, correta: false }] });
		const eventos = await doAprendiz("respondeu_questao");
		expect(eventos.map((evento) => evento.contexto?.versao)).toEqual([1, 2]);
		expect(eventos[1]!.contexto).toMatchObject({ prompt: { nome: "modulo-bloco.md + metodo/quiz.md + metodo/termos.md" } });
	});

	it("concluir o módulo mantém as respostas, e ler_modulo continua lendo", async () => {
		await responder("q1", { bloco: "l1-b6", confianca: 3, escolha: 1, tempoMs: 1 });
		acao("concluir", { modulo: "m1", pedido: "c" });
		await respondeu("c");
		const concluido = moduloDoPedido("c") ?? (recebidas("modulo").at(-1)!.dados as unknown as MensagemModuloDoTeste);
		expect(concluido.modulo).toMatchObject({ concluidoEm: expect.any(String), respostas: { "l1-b6": { tentativas: [{ correta: true }] } } });
		const lido = await ferramentas.ler_modulo!.execute("1", { materia, curso: CURSO, modulo: "m1" }, undefined, undefined, ctx);
		expect(lido.isError).toBeUndefined();
		expect(lido.content[0]!.text).toContain("concluído pelo aluno");
	});

	it("depois de session_shutdown a conferência em andamento para sem gravar", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const chamadasAntes = chamadas.length;
		await responder("v1", { bloco: "l1-b3", confianca: 3, texto: "Ocorrências.", tempoMs: 1 });
		await esperar(() => chamadas.length > chamadasAntes);
		const antes = mostrados.length;
		tratadores.session_shutdown?.({}, ctx);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toHaveLength(antes);
		expect(await doAprendiz("respondeu_verificacao")).toHaveLength(0);
		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(gravado.respostas!["l1-b3"]!.tentativas[0]).not.toHaveProperty("avaliacao");
	});
});

// --- O feedback (docs/modulos.md, "O feedback") -------------------------------------------------

/** A nota rápida de um bloco da lição l1. */
const avaliar = (pedido: string, bloco: string, avaliacao: unknown, extra: Record<string, unknown> = {}) => acao("avaliar_bloco", { modulo: "m1", licao: "l1", bloco, pedido, avaliacao, ...extra });

describe("o feedback", () => {
	beforeEach(async () => {
		ligar();
		geracaoQueDaCerto();
		await gerarM1();
	});

	it("avaliar_bloco: o avaliou_bloco sem motivos nem texto, a nota em feedback e o modulo com o pedido; outra nota fica no lugar", async () => {
		avaliar("a1", "l1-b2", "bom");
		await respondeu("a1");
		expect(comPedido("a1").map((mensagem) => mensagem.acao)).toEqual(["modulo"]);
		const primeira = moduloDoPedido("a1")!;
		const [evento] = await doAprendiz("avaliou_bloco");
		expect(evento).toEqual({
			id: expect.any(String),
			ts: expect.any(String),
			sessao: "sessao-1",
			verbo: "avaliou_bloco",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b2", tipo: "explicacao", conceitos: ["c-tf"] },
			resultado: { avaliacao: "bom", motivos: [], texto: "" },
			contexto: { modelo: "teste/modelo-x", prompt: PROMPT_DA_LICAO(), versao: 1 },
		});
		expect(primeira.modulo.feedback).toEqual({ "l1-b2": { avaliacao: "bom", versao: 1, em: evento!.ts, evento: evento!.id } });
		expect(primeira.corrigindo).toEqual([]);
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(primeira.modulo);

		// Motivos, texto, regra e detalha não entram na nota rápida.
		avaliar("a2", "l1-b2", "otimo", { motivos: ["longo"], texto: "x", virarRegra: { texto: "Regra.", materia: null }, detalha: evento!.id });
		await respondeu("a2");
		const eventos = await doAprendiz("avaliou_bloco");
		expect(eventos).toHaveLength(2);
		expect(eventos[1]!.resultado).toEqual({ avaliacao: "otimo", motivos: [], texto: "" });
		expect(moduloDoPedido("a2")!.modulo.feedback!["l1-b2"]).toMatchObject({ avaliacao: "otimo", evento: eventos[1]!.id });
		expect(await doAprendiz("criou_regra_escrita")).toHaveLength(0);
	});

	it("avaliar_bloco com a antiga melhorar, avaliação inválida ou bloco que não existe: erro com o bloco e o pedido, nada gravado", async () => {
		avaliar("e1", "l1-b2", "melhorar");
		await respondeu("e1");
		expect(erroDe("e1")).toEqual({ mensagem: 'A avaliação do bloco não é válida ("melhorar"): é ruim, bom ou otimo.', ao: "avaliar_bloco", materia, curso: CURSO, modulo: "m1", bloco: "l1-b2", pedido: "e1" });
		avaliar("e2", "l1-b9", "bom");
		await respondeu("e2");
		expect(erroDe("e2")?.mensagem).toBe('Não achei o bloco "l1-b9" na lição l1.');
		expect(await doAprendiz("avaliou_bloco")).toHaveLength(0);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).feedback).toBeUndefined();
	});

	it("retorno com detalha: o id da nota no resultado, a nota em feedback; manda o modulo sem pedido e o estado com o pedido", async () => {
		avaliar("a1", "l1-b1", "ruim");
		await respondeu("a1");
		const nota = (await doAprendiz("avaliou_bloco"))[0]!.id;
		const antes = recebidas("modulo").length;
		const id = await retornoNoB1("r1", { detalha: nota });
		const [, detalhado] = await doAprendiz("avaliou_bloco");
		expect(detalhado).toMatchObject({ id, resultado: { avaliacao: "ruim", motivos: ["longo", "abstrato"], texto: "Muito texto antes do exemplo.", detalha: nota } });
		const modulos = recebidas("modulo").slice(antes);
		expect(modulos).toHaveLength(1);
		expect(modulos[0]!.dados.pedido).toBeUndefined();
		expect((modulos[0]!.dados as unknown as MensagemModuloDoTeste).modulo.feedback!["l1-b1"]).toEqual({ avaliacao: "ruim", versao: 1, em: detalhado!.ts, evento: id });
		expect(comPedido("r1").map((mensagem) => mensagem.acao)).toEqual(["estado"]);
		// Sem detalha, o resultado fica sem o campo.
		const outro = await retornoNoB1("r2", { avaliacao: "otimo", motivos: [] });
		const ultimoEvento = (await doAprendiz("avaliou_bloco")).at(-1)!;
		expect(ultimoEvento).toMatchObject({ id: outro, resultado: { avaliacao: "otimo", motivos: [], texto: "Muito texto antes do exemplo." } });
		expect(ultimoEvento.resultado).not.toHaveProperty("detalha");
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).feedback!["l1-b1"]).toMatchObject({ avaliacao: "otimo", evento: outro });
	});

	it("retorno com detalha de outro bloco, que não existe ou que não é um id: erro com o pedido, nada gravado", async () => {
		avaliar("a1", "l1-b2", "bom");
		await respondeu("a1");
		const nota = (await doAprendiz("avaliou_bloco"))[0]!.id;
		const detalhar = (pedido: string, detalha: unknown) => acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b1", pedido, avaliacao: "ruim", motivos: [], detalha });
		detalhar("e1", nota);
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "retorno", pedido: "e1", mensagem: `A nota "${nota}" é de outro bloco (m1, l1-b2); o retorno detalha uma nota do próprio bloco.` });
		detalhar("e2", "nao-existe");
		await respondeu("e2");
		expect(erroDe("e2")?.mensagem).toBe('Não achei a nota "nao-existe" nos eventos.');
		detalhar("e3", 42);
		await respondeu("e3");
		expect(erroDe("e3")?.mensagem).toBe("O detalha do retorno não é o id de um evento.");
		expect(await doAprendiz("avaliou_bloco")).toHaveLength(1);
		expect(Object.keys(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).feedback!)).toEqual(["l1-b2"]);
	});

	it("um retorno antigo com melhorar, de uma sessão anterior: vale como Ruim na reescrita e pode ser detalhado", async () => {
		const antigo = criarEvento({
			sessao: "sessao-0",
			verbo: "avaliou_bloco",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b1", tipo: "explicacao", conceitos: ["c-tf"] },
			resultado: { avaliacao: "melhorar", motivos: ["confuso"], texto: "Não entendi." },
			contexto: { modelo: "teste/modelo-x", versao: 1 },
		});
		await acrescentarEvento(eventosAprendiz(dados), antigo);
		respostas.push(EXPLICACAO_NOVA);
		reescrever("w1", antigo.id);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("Avaliação: Ruim\nMotivos: Confuso (confuso)\nTexto do aluno: Não entendi.");
		const id = await retornoNoB1("r1", { detalha: antigo.id });
		expect((await doAprendiz("avaliou_bloco")).find((evento) => evento.id === id)!.resultado).toMatchObject({ detalha: antigo.id });
	});

	it("a reescrita de um bloco e as respostas mantêm feedback e questionarios; a nota do bloco reescrito fica com a versão antiga", async () => {
		avaliar("a1", "l1-b1", "ruim");
		await respondeu("a1");
		avaliar("a2", "l1-b6", "otimo", { licao: "l1" });
		await respondeu("a2");
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "q1", notas: { clareza: 2 } });
		await respondeu("q1");
		const antes = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(Object.keys(antes.feedback!)).toEqual(["l1-b1", "l1-b6"]);

		await responder("r-q", { bloco: "l1-b6", confianca: 3, escolha: 1, tempoMs: 1 });
		const respondido = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(respondido.feedback).toEqual(antes.feedback);
		expect(respondido.questionarios).toEqual(antes.questionarios);

		const retorno = (await doAprendiz("avaliou_bloco"))[0]!.id;
		respostas.push(EXPLICACAO_NOVA);
		reescrever("w1", retorno);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		const reescrito = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(reescrito.licoes[0]!.blocos[0]!.versao).toBe(2);
		expect(reescrito.feedback).toEqual(antes.feedback);
		expect(reescrito.feedback!["l1-b1"]!.versao).toBe(1);
		expect(reescrito.questionarios).toEqual(antes.questionarios);
		expect(ultimoModulo().modulo).toEqual(reescrito);

		// Uma nota no bloco reescrito leva a versão 2.
		avaliar("a3", "l1-b1", "bom");
		await respondeu("a3");
		expect(moduloDoPedido("a3")!.modulo.feedback!["l1-b1"]).toMatchObject({ avaliacao: "bom", versao: 2 });
	});

	it("avaliar_licao: o avaliou_licao com os prompts que geraram a lição, o questionário em questionarios e o modulo com o pedido; enviar de novo troca", async () => {
		acao("avaliar_licao", { modulo: "m1", licao: "l2", pedido: "q1", notas: { ritmo: 5, entendimento: 3 }, texto: "  Ótima lição.  " });
		await respondeu("q1");
		expect(comPedido("q1").map((mensagem) => mensagem.acao)).toEqual(["modulo"]);
		const [evento] = await doAprendiz("avaliou_licao");
		expect(evento).toEqual({
			id: expect.any(String),
			ts: expect.any(String),
			sessao: "sessao-1",
			verbo: "avaliou_licao",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l2", conceitos: ["c-idf"] },
			resultado: { notas: { entendimento: 3, ritmo: 5 }, texto: "Ótima lição." },
			contexto: { fase: "modulo", modelo: "teste/modelo-x", prompts: [PROMPT_DA_LICAO()] },
		});
		const mensagem = moduloDoPedido("q1")!;
		expect(mensagem.modulo.questionarios).toEqual({ l2: { notas: { entendimento: 3, ritmo: 5 }, texto: "Ótima lição.", em: evento!.ts, evento: evento!.id } });
		expect(await lerModulo(dados, materia, CURSO, "m1")).toEqual(mensagem.modulo);

		acao("avaliar_licao", { modulo: "m1", licao: "l2", pedido: "q2", notas: { clareza: 1 } });
		await respondeu("q2");
		const eventos = await doAprendiz("avaliou_licao");
		expect(eventos).toHaveLength(2);
		expect(moduloDoPedido("q2")!.modulo.questionarios).toEqual({ l2: { notas: { clareza: 1 }, texto: "", em: eventos[1]!.ts, evento: eventos[1]!.id } });
	});

	it("avaliar_licao numa lição com um bloco reescrito leva também o prompt da reescrita", async () => {
		const retorno = await retornoNoB1();
		respostas.push(EXPLICACAO_NOVA);
		reescrever("w1", retorno);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "q1", notas: { exemplos: 4 } });
		await respondeu("q1");
		const [evento] = await doAprendiz("avaliou_licao");
		expect(evento!.contexto).toEqual({ fase: "modulo", modelo: "teste/modelo-x", prompts: [PROMPT_DA_LICAO(), PROMPT_BLOCO_COM_INTRODUCAO()] });
	});

	it("avaliar_licao e concluir emitem aprendiz:gatilho (licao e modulo) só depois de gravar o evento; erro não emite", async () => {
		const gatilhos: unknown[] = [];
		barramento.on("aprendiz:gatilho", (recebido: unknown) => gatilhos.push(recebido));
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "e1", notas: {} });
		await respondeu("e1");
		expect(gatilhos).toEqual([]);
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "q1", notas: { clareza: 4 } });
		await respondeu("q1");
		expect(gatilhos).toEqual([{ motivo: "licao" }]);
		expect(await doAprendiz("avaliou_licao")).toHaveLength(1);
		acao("concluir", { modulo: "m1", pedido: "c1" });
		await respondeu("c1");
		expect(gatilhos).toEqual([{ motivo: "licao" }, { motivo: "modulo" }]);
		expect(await doVerbo("concluiu_modulo")).toHaveLength(1);
		await esperarEventosDoRelatorio(1); // o relatório em segundo plano termina antes de apagar a pasta
		acao("concluir", { modulo: "m1", pedido: "c2" });
		await respondeu("c2");
		expect(gatilhos).toHaveLength(2);
	});

	it("avaliar_licao inválido ou de lição que não existe: erro com o pedido, nada gravado", async () => {
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "e1", notas: {} });
		await respondeu("e1");
		expect(erroDe("e1")).toEqual({ mensagem: "Responda pelo menos uma pergunta do questionário.", ao: "avaliar_licao", materia, curso: CURSO, modulo: "m1", pedido: "e1" });
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "e2", notas: { clareza: 6 } });
		await respondeu("e2");
		expect(erroDe("e2")?.mensagem).toBe('A nota de "clareza" não é válida ("6"): é um inteiro de 1 a 5.');
		acao("avaliar_licao", { modulo: "m1", licao: "l9", pedido: "e3", notas: { clareza: 3 } });
		await respondeu("e3");
		expect(erroDe("e3")?.mensagem).toBe('Não achei a lição "l9" no módulo m1.');
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "e4", notas: { clareza: 3 }, texto: "x".repeat(1001) });
		await respondeu("e4");
		expect(erroDe("e4")?.mensagem).toBe("O texto do questionário tem 1001 caracteres; o máximo é 1000.");
		expect(await doAprendiz("avaliou_licao")).toHaveLength(0);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).questionarios).toBeUndefined();
	});

	it("gerar de novo começa sem feedback e sem questionarios (os eventos ficam)", async () => {
		avaliar("a1", "l1-b1", "bom");
		await respondeu("a1");
		acao("avaliar_licao", { modulo: "m1", licao: "l1", pedido: "q1", notas: { clareza: 4 } });
		await respondeu("q1");
		geracaoQueDaCerto();
		acao("gerar", { modulo: "m1", pedido: "g2" });
		await respondeu("g2");
		await esperar(async () => (await doVerbo("gerou_modulo")).length === 2 && situacaoDe("m1") === "gerado");
		const novo = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(novo).not.toHaveProperty("feedback");
		expect(novo).not.toHaveProperty("questionarios");
		expect(await doAprendiz("avaliou_bloco")).toHaveLength(1);
		expect(await doAprendiz("avaliou_licao")).toHaveLength(1);
	});
});

// --- Os termos-chave (docs/termos.md) ----------------------------------------------------------

/** Um texto de explicação acima do mínimo, começando por `comeco` (com as marcas). */
const textoCom = (comeco: string) => `${comeco} ${"x".repeat(MINIMO_CARACTERES_EXEMPLO)}`;
/** A lição 1 com um termo novo (contagem), marcado no conceito que o explica e na pergunta. */
const LICAO_1_COM_TERMO = (antes = false) =>
	JSON.stringify({
		blocos: [
			{ ...explicacao("c-tf", "introducao", "página 1"), texto: textoCom(antes ? "A [contagem](termo:novo-1) importa." : "A contagem importa.") },
			{ ...explicacao("c-tf", "conceito", "página 1"), texto: textoCom("Uma [contagem](termo:novo-1) é o número de ocorrências; o [x](termo:t-x) some.") },
			{ tipo: "verificacao", conceitos: ["c-tf"], pergunta: "O que a [contagem](termo:novo-1) mede?", respostaEsperada: "As ocorrências." },
			explicacao("c-tf", "exemplo_resolvido", "página 1"),
			ideiaCentral("c-tf"),
			alternativa("c-tf"),
		],
		termos: [{ chave: "novo-1", termo: "contagem", definicao: "O número de vezes que o termo aparece.", conceito: "c-tf", explicadoEm: 2 }],
	});
/** A lição 2 reusa o termo da lição 1 pelo id. */
const LICAO_2_COM_TERMO = JSON.stringify({
	blocos: [
		explicacao("c-idf", "introducao", "página 2"),
		{ ...explicacao("c-idf", "conceito", "página 2"), texto: textoCom("Diferente da [contagem](termo:t-contagem), o IDF olha a coleção.") },
		explicacao("c-idf", "exemplo_incompleto", "página 2"),
		ideiaCentral("c-idf"),
		dissertativa("c-idf"),
	],
	termos: [],
});

const textoDoBloco = (modulo: ModuloGerado, licao: number, bloco: number) => {
	const atual = modulo.licoes[licao]!.blocos[bloco]! as { texto?: string; pergunta?: string };
	return atual.texto ?? atual.pergunta ?? "";
};

describe("os termos-chave na geração e na reescrita", () => {
	beforeEach(() => ligar());

	it("a lição leva o glossário da geração; os termos novos ganham id, as marcas também, e o glossário é gravado", async () => {
		await gravarGlossario(dados, materia, CURSO, { versao: 1, termos: [{ id: "t-peso", termo: "peso", definicao: "Quanto o termo vale.", conceito: "c-idf", explicado: null, origem: "geracao", criadoEm: AGORA.toISOString(), alteradoEm: AGORA.toISOString() }] });
		respostas.push(PLANO_M1, LICAO_1_COM_TERMO(), LICAO_2_COM_TERMO);
		await gerarM1();
		expect(situacaoDe("m1")).toBe("gerado");
		const primeira = textoDaChamada(chamadas[1]!);
		expect(primeira).toContain("Glossário do curso (1 termo, os já explicados no curso: marque-os com o id deles, sem explicar de novo):\n- t-peso · peso: Quanto o termo vale.");
		// A lição 2 já vê o termo da lição 1, pelo id.
		expect(textoDaChamada(chamadas[2]!)).toContain("- t-contagem · contagem: O número de vezes que o termo aparece.");

		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(textoDoBloco(gravado, 0, 1).startsWith("Uma [contagem](termo:t-contagem) é o número de ocorrências; o x some.")).toBe(true);
		expect(textoDoBloco(gravado, 0, 2)).toBe("O que a [contagem](termo:t-contagem) mede?");
		expect(textoDoBloco(gravado, 1, 1).startsWith("Diferente da [contagem](termo:t-contagem)")).toBe(true);
		const glossario = await lerGlossario(dados, materia, CURSO);
		expect(glossario.termos.map((termo) => termo.id)).toEqual(["t-peso", "t-contagem"]);
		expect(glossario.termos[1]).toMatchObject({ termo: "contagem", conceito: "c-tf", explicado: { modulo: "m1", licao: "l1", bloco: "l1-b2" }, origem: "geracao" });
	});

	it("um termo usado antes de explicado pede a lição de novo com o problema; na segunda, as marcas antes viram texto", async () => {
		respostas.push(PLANO_M1, LICAO_1_COM_TERMO(true), LICAO_1_COM_TERMO(true), LICAO_2_COM_TERMO);
		await gerarM1();
		expect(situacaoDe("m1")).toBe("gerado");
		expect(chamadas).toHaveLength(4);
		expect(textoDaChamada(chamadas[2]!)).toContain('O termo "contagem" (novo-1) é usado no bloco 1 antes de ser explicado no bloco 2');
		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(textoDoBloco(gravado, 0, 0).startsWith("A contagem importa.")).toBe(true);
		expect(textoDoBloco(gravado, 0, 1).startsWith("Uma [contagem](termo:t-contagem)")).toBe(true);
	});

	it("um glossário ilegível impede a geração antes de chamar o modelo, com o pedido", async () => {
		await mkdir(join(dados, "materias", materia, "cursos", CURSO), { recursive: true });
		await writeFile(join(dados, "materias", materia, "cursos", CURSO, "glossario.json"), "{x", "utf8");
		acao("gerar", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toMatchObject({ ao: "gerar", mensagem: expect.stringContaining("Não consegui ler o glossário") });
		expect(chamadas).toHaveLength(0);
	});

	it("a reescrita leva o glossário, mantém as marcas do glossário e desfaz as outras", async () => {
		respostas.push(PLANO_M1, LICAO_1_COM_TERMO(), LICAO_2_COM_TERMO);
		await gerarM1();
		const id = await retornoNoB1();
		respostas.push(
			JSON.stringify({ bloco: { ...JSON.parse(EXPLICACAO_NOVA).bloco, formato: "introducao", texto: textoCom("A [contagem](termo:t-contagem) e o [lema](termo:novo-1).") } }),
		);
		reescrever("w1", id);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("- t-contagem · contagem:");
		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(textoDoBloco(gravado, 0, 0).startsWith("A [contagem](termo:t-contagem) e o lema.")).toBe(true);
	});
});

// --- Marcar os termos num módulo já gerado (docs/termos.md) -------------------------------------

/** As respostas de "Marcar os termos" para as duas lições de m1 (LICAO_1 e LICAO_2, sem marcas). */
const TERMOS_L1 = JSON.stringify({
	termos: [
		{ bloco: "l1-b2", trecho: "Texto", id: null, termo: "texto", definicao: "O conteúdo de um documento.", explicadoEm: "l1-b2" },
		{ bloco: "l1-b3", trecho: "TF", id: null, termo: "TF", definicao: "Quantas vezes o termo aparece no documento.", explicadoEm: null },
		{ bloco: "l1-b9", trecho: "x", id: null, termo: "fora", definicao: "Bloco que não existe." },
	],
});
const TERMOS_L2 = JSON.stringify({ termos: [{ bloco: "l2-b2", trecho: "Texto", id: "t-texto", explicadoEm: null }] });

type MensagemModuloComTermos = { modulo: ModuloGerado; glossario: Array<{ id: string; lugar: unknown }>; explicando: string[]; pedido?: string };
const ultimaModulo = () => recebidas("modulo").at(-1)?.dados as unknown as MensagemModuloComTermos;
const textoDoBlocoGravado = async (licao: number, bloco: number) => {
	const atual = ((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).licoes[licao]!.blocos[bloco]! as { texto?: string; pergunta?: string };
	return atual.texto ?? atual.pergunta ?? "";
};

describe("Marcar os termos (marcar_termos)", () => {
	beforeEach(async () => {
		ligar();
		geracaoQueDaCerto();
		await gerarM1();
	});

	it("uma chamada por lição com o glossário que cresce; as marcas, o glossário, o evento e o modulo com o glossário na tela", async () => {
		const chamadasAntes = chamadas.length;
		respostas.push(TERMOS_L1, TERMOS_L2);
		acao("marcar_termos", { modulo: "m1", pedido: "mt" });
		await respondeu("mt");
		expect(doModulo(comPedido("mt")[0]!.dados as unknown as MensagemEstado, "m1")).toMatchObject({ situacao: "gerado", marcando: { licao: 1, licoes: 2 } });
		await esperar(async () => (await doVerbo("marcou_termos")).length === 1 && doModulo(ultimo(), "m1")?.marcando === undefined);
		expect(estados().some((estado) => doModulo(estado, "m1")?.marcando?.licao === 2)).toBe(true);

		expect(chamadas).toHaveLength(chamadasAntes + 2);
		const primeira = chamadas[chamadasAntes]!;
		expect(primeira.contexto.systemPrompt).toBe(comMetodo("Marque os termos.", ["termos.md"]));
		expect((primeira.opcoes as { temperature?: number }).temperature).toBe(0);
		const mensagem = textoDaChamada(primeira);
		expect(mensagem).toContain('Lição: l1, "Contando termos"');
		expect(mensagem).toContain("### l1-b3 · Verificação\nPergunta:\nO que o TF conta?");
		expect(mensagem).toContain("### l1-b6 · Questão de alternativa\nContexto:\n");
		expect(mensagem).toContain("Alternativa B:\n2");
		expect(mensagem).toContain("Glossário do curso: nenhum termo ainda.");
		// A segunda lição já vê o termo novo da primeira, pelo id.
		expect(textoDaChamada(chamadas[chamadasAntes + 1]!)).toContain("- t-texto · texto: O conteúdo de um documento.");

		expect((await textoDoBlocoGravado(0, 1)).startsWith("[Texto](termo:t-texto) sobre c-tf.")).toBe(true);
		expect(await textoDoBlocoGravado(0, 2)).toBe("O que o [TF](termo:t-tf) conta?");
		expect((await textoDoBlocoGravado(1, 1)).startsWith("[Texto](termo:t-texto) sobre c-idf.")).toBe(true);
		// A versão dos blocos não muda.
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).licoes.flatMap((licao) => licao.blocos.map((bloco) => bloco.versao ?? 1))).toEqual(Array(11).fill(1));
		const glossario = await lerGlossario(dados, materia, CURSO);
		expect(glossario.termos).toMatchObject([
			{ id: "t-texto", termo: "texto", origem: "anotacao", explicado: { modulo: "m1", licao: "l1", bloco: "l1-b2" } },
			{ id: "t-tf", termo: "TF", origem: "anotacao", explicado: null },
		]);
		const [evento] = await doVerbo("marcou_termos");
		expect(evento).toMatchObject({ sessao: "sessao-1", objeto: { materia, curso: CURSO, modulo: "m1" }, resultado: { termosNovos: 2, marcas: 3, custo: 0.02 } });

		const final = ultimaModulo();
		expect(final.pedido).toBeUndefined();
		expect(final.explicando).toEqual([]);
		expect(final.glossario).toEqual([
			expect.objectContaining({ id: "t-texto", lugar: { modulo: "m1", licao: "l1", bloco: "l1-b2", numeroModulo: 1, tituloModulo: "Pesos dos termos", numeroLicao: 1, tituloLicao: "Contando termos" } }),
			expect.objectContaining({ id: "t-tf", lugar: null }),
		]);
		// Toda mensagem modulo leva o glossário (abrir também).
		acao("abrir", { modulo: "m1" });
		await esperar(() => recebidas("modulo").length >= 2 && ultimaModulo().glossario.length === 2);
	});

	it("JSON inválido tem uma nova tentativa; duas vezes inválido é erro sem pedido, sem gravar, e o estado sem marcando", async () => {
		respostas.push("ruim", TERMOS_L1, "{}", '{"x": 1}');
		acao("marcar_termos", { modulo: "m1", pedido: "mt" });
		await respondeu("mt");
		await esperar(() => recebidas("erro").some((mensagem) => mensagem.dados.ao === "marcar_termos"));
		const erro = recebidas("erro").find((mensagem) => mensagem.dados.ao === "marcar_termos")!.dados;
		expect(erro).toMatchObject({ materia, curso: CURSO, modulo: "m1", mensagem: expect.stringContaining("Nenhum termo foi marcado.") });
		expect(erro.pedido).toBeUndefined();
		expect(String(erro.mensagem)).toContain("Gasto das lições já marcadas: US$ 0.0200");
		await esperar(() => doModulo(ultimo(), "m1")?.marcando === undefined);
		expect(await doVerbo("marcou_termos")).toHaveLength(0);
		expect((await lerGlossario(dados, materia, CURSO)).termos).toEqual([]);
		expect(await textoDoBlocoGravado(0, 2)).toBe("O que o TF conta?");
	});

	it("módulo não gerado, ou já sendo marcado, é erro com o pedido; o fim da sessão cancela sem gravar", async () => {
		acao("marcar_termos", { modulo: "m2", pedido: "e1" });
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "marcar_termos", modulo: "m2", mensagem: "O módulo m2 ainda não foi gerado." });

		const adiado = adiada();
		respostas.push(adiado.resposta);
		const chamadasAntes = chamadas.length;
		acao("marcar_termos", { modulo: "m1", pedido: "mt" });
		await respondeu("mt");
		await esperar(() => chamadas.length > chamadasAntes);
		acao("marcar_termos", { modulo: "m1", pedido: "e2" });
		await respondeu("e2");
		expect(erroDe("e2")?.mensagem).toContain("já estão sendo marcados");
		const antes = mostrados.length;
		tratadores.session_shutdown?.({}, ctx);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toHaveLength(antes);
		expect(await doVerbo("marcou_termos")).toHaveLength(0);
	});
});

// --- Os pedidos de explicação (docs/termos.md) ---------------------------------------------------

type PedidoNaMensagem = { id: string; bloco: string; trecho: string; tipo: string; explicacao?: string; termo?: unknown; evento?: string; modelo?: string; custo?: number; guardado?: string };
const pedidosDe = (mensagem: MensagemModuloComTermos | undefined) => ((mensagem?.modulo as (ModuloGerado & { explicacoes?: PedidoNaMensagem[] }) | undefined)?.explicacoes ?? []) as PedidoNaMensagem[];
const moduloComPedido = (pedido: string) => comPedido(pedido).find((mensagem) => mensagem.acao === "modulo")?.dados as unknown as MensagemModuloComTermos | undefined;
const explicar = (pedido: string, extra: Record<string, unknown> = {}) => acao("explicar_trecho", { modulo: "m1", licao: "l1", bloco: "l1-b2", pedido, trecho: " Texto ", tipo: "nao_sei", ...extra });
const EXPLICACAO_COM_TERMO = JSON.stringify({ explicacao: "Um [texto](termo:t-x) é o conteúdo do documento.", termo: { termo: "texto", definicao: "O conteúdo de um documento." } });

describe("os pedidos de explicação (explicar_trecho e guardar_termo)", () => {
	beforeEach(async () => {
		ligar();
		geracaoQueDaCerto();
		await gerarM1();
	});

	it("o pedido entra com explicando; a mensagem ao modelo; a explicação com o pediu_explicacao; guardar no glossário com a marca", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const chamadasAntes = chamadas.length;
		explicar("x1");
		await respondeu("x1");
		const aceito = moduloComPedido("x1")!;
		const [pedido] = pedidosDe(aceito);
		expect(pedido).toEqual({ id: expect.stringMatching(/^x-/), licao: "l1", bloco: "l1-b2", versao: 1, trecho: "Texto", tipo: "nao_sei", em: expect.any(String) });
		expect(aceito.explicando).toEqual([pedido!.id]);
		await esperar(() => chamadas.length > chamadasAntes);

		const chamada = chamadas.at(-1)!;
		expect(chamada.contexto.systemPrompt).toBe(comMetodo("Explique o trecho.", ["conceito.md", "termos.md"]));
		const mensagem = textoDaChamada(chamada);
		expect(mensagem).toContain('Lição: l1, "Contando termos"');
		expect(mensagem).toContain("<explicacoes>\nTexto sobre c-tf. x");
		expect(mensagem).toContain("O bloco onde está o trecho:\n### l1-b2 · Explicação");
		expect(mensagem).toContain("<trecho>\nTexto\n</trecho>");
		expect(mensagem).toContain("Pedido do aluno: Não sei o que é isso (nao_sei)");
		expect(mensagem).toContain("Nível do aluno: iniciante");
		expect(mensagem).toContain("Glossário do curso: nenhum termo ainda.");

		adiado.soltar(EXPLICACAO_COM_TERMO);
		await esperar(() => pedidosDe(ultimaModulo())[0]?.explicacao !== undefined);
		const respondido = ultimaModulo();
		expect(respondido.pedido).toBeUndefined();
		expect(respondido.explicando).toEqual([]);
		expect(pedidosDe(respondido)[0]).toMatchObject({ explicacao: "Um texto é o conteúdo do documento.", termo: { termo: "texto", definicao: "O conteúdo de um documento." }, modelo: "teste/modelo-x", custo: 0.01 });
		const [evento] = await doAprendiz("pediu_explicacao");
		expect(evento).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b2", conceitos: ["c-tf"] },
			resultado: { trecho: "Texto", tipo: "nao_sei", explicacao: "Um texto é o conteúdo do documento." },
			contexto: {
				fase: "modulo",
				versao: 1,
				modelo: "teste/modelo-x",
				prompt: PROMPT_DA_LICAO(),
				explicador: {
					modelo: "teste/modelo-x",
					prompt: { nome: "explicar-trecho.md + metodo/conceito.md + metodo/termos.md", hash: `${hashDoPrompt(PROMPT_EXPLICAR)} + ${hashDoPrompt(METODO["conceito.md"]!)} + ${hashDoPrompt(METODO["termos.md"]!)}` },
					custo: 0.01,
				},
			},
		});
		expect(pedidosDe(respondido)[0]!.evento).toBe(evento!.id);

		acao("guardar_termo", { modulo: "m1", pedido: "g1", explicacao: pedido!.id });
		await respondeu("g1");
		const guardado = moduloComPedido("g1")!;
		expect(pedidosDe(guardado)[0]!.guardado).toBe("t-texto");
		expect((await textoDoBlocoGravado(0, 1)).startsWith("[Texto](termo:t-texto) sobre c-tf.")).toBe(true);
		expect(guardado.glossario).toEqual([
			expect.objectContaining({
				id: "t-texto",
				origem: "pedido",
				lugar: { modulo: "m1", licao: "l1", bloco: "l1-b2", explicacao: pedido!.id, numeroModulo: 1, tituloModulo: "Pesos dos termos", numeroLicao: 1, tituloLicao: "Contando termos" },
			}),
		]);
		const [guardou] = await doAprendiz("guardou_termo");
		expect(guardou).toMatchObject({ objeto: { modulo: "m1", licao: "l1", bloco: "l1-b2", explicacao: pedido!.id }, resultado: { id: "t-texto", termo: "texto", novo: true, marcado: true } });
		acao("guardar_termo", { modulo: "m1", pedido: "g2", explicacao: pedido!.id });
		await respondeu("g2");
		expect(erroDe("g2")).toMatchObject({ ao: "guardar_termo", explicacao: pedido!.id, mensagem: "O termo deste pedido já foi guardado no glossário." });
	});

	it("Explique melhor: o termo é sempre null; o pedido que falha duas vezes sai, com o erro sem pedido (bloco e id)", async () => {
		respostas.push(EXPLICACAO_COM_TERMO);
		explicar("x1", { tipo: "explique_melhor" });
		await respondeu("x1");
		await esperar(() => pedidosDe(ultimaModulo())[0]?.explicacao !== undefined);
		expect(pedidosDe(ultimaModulo())[0]!.termo).toBeNull();
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("Pedido do aluno: Explique melhor (explique_melhor)");

		respostas.push("ruim", '{"explicacao": ""}');
		explicar("x2", { bloco: "l1-b3", trecho: "conta" });
		await respondeu("x2");
		const id = pedidosDe(moduloComPedido("x2")).at(-1)!.id;
		await esperar(() => recebidas("erro").some((mensagem) => mensagem.dados.ao === "explicar_trecho"));
		const erro = recebidas("erro").find((mensagem) => mensagem.dados.ao === "explicar_trecho")!.dados;
		expect(erro).toMatchObject({ modulo: "m1", bloco: "l1-b3", explicacao: id, mensagem: expect.stringContaining("O pedido de explicação saiu; peça de novo.") });
		expect(erro.pedido).toBeUndefined();
		await esperar(() => pedidosDe(ultimaModulo()).length === 1);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).explicacoes!.map((item) => item.id)).not.toContain(id);
		expect(await doAprendiz("pediu_explicacao")).toHaveLength(1);
	});

	it("o que vem da tela é conferido: trecho, tipo, lição e bloco; o erro vem com o pedido e o bloco", async () => {
		const casos: Array<[Record<string, unknown>, string]> = [
			[{ trecho: "x".repeat(301) }, "301 caracteres"],
			[{ trecho: "   " }, "vazio"],
			[{ tipo: "outro" }, "nao_sei ou explique_melhor"],
			[{ bloco: "l1-b9" }, 'Não achei o bloco "l1-b9"'],
			[{ licao: "l9" }, 'Não achei a lição "l9"'],
		];
		for (const [indice, [extra, frase]] of casos.entries()) {
			explicar(`e${indice}`, extra);
			await respondeu(`e${indice}`);
			expect(erroDe(`e${indice}`)).toMatchObject({ ao: "explicar_trecho", modulo: "m1", bloco: extra.bloco ?? "l1-b2", mensagem: expect.stringContaining(frase) });
		}
		acao("guardar_termo", { modulo: "m1", pedido: "g0" });
		await respondeu("g0");
		expect(erroDe("g0")).toMatchObject({ ao: "guardar_termo", mensagem: "Falta o id do pedido de explicação." });
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).explicacoes).toBeUndefined();
	});

	it("o fim da sessão cancela sem gravar; o pedido que ficou sem explicação sai no próximo pedido", async () => {
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const chamadasAntes = chamadas.length;
		explicar("x1");
		await respondeu("x1");
		const velho = pedidosDe(moduloComPedido("x1"))[0]!.id;
		await esperar(() => chamadas.length > chamadasAntes);
		const antes = mostrados.length;
		tratadores.session_shutdown?.({}, ctx);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toHaveLength(antes);
		expect(await doAprendiz("pediu_explicacao")).toHaveLength(0);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).explicacoes!.map((item) => item.id)).toEqual([velho]);

		ligar();
		respostas.push(EXPLICACAO_COM_TERMO);
		explicar("x2");
		await respondeu("x2");
		expect(pedidosDe(moduloComPedido("x2")).map((item) => item.id)).not.toContain(velho);
		await esperar(() => pedidosDe(ultimaModulo())[0]?.explicacao !== undefined);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).explicacoes).toHaveLength(1);
	});
});

// --- Os ajustes do Breno nas gerações (docs/metodo-ciclo.md, "Os ajustes aprovados") ------------

describe("os ajustes do Breno nas gerações dos módulos", () => {
	const ajusteDe = (arquivo: string) => `Ajuste de ${arquivo}.`;
	const mantidoDe = (arquivo: string) => `Regra de ${arquivo}.`;
	const blocoDe = (arquivo: string) => `<ajustes-do-breno arquivo="${arquivo}">\n${FRASE_DOS_AJUSTES}\n\n- (em teste) ${ajusteDe(arquivo)}\n- (mantido) ${mantidoDe(arquivo)}\n</ajustes-do-breno>`;
	/** O system prompt com a metodologia de mentira e, depois de cada arquivo, os ajustes dele. */
	const comAjustes = (instrucoes: string, arquivos: string[]) =>
		[instrucoes, ...arquivos.flatMap((arquivo) => [`<metodologia arquivo="${arquivo}">\n${METODO[arquivo]!.trim()}\n</metodologia>`, blocoDe(arquivo)])].join("\n\n");
	const ajustesUsado = (arquivo: string) => ({ nome: `aprendiz/metodo/${arquivo}`, hash: hashDoPrompt(blocoDe(arquivo)) });
	/** O prompt com a metodologia e os ajustes, como os eventos que guardam um prompt só o guardam. */
	const comAjustesUsado = (nome: string, conteudo: string, arquivos: string[]) => {
		const usados = [{ nome, hash: hashDoPrompt(conteudo) }, ...arquivos.flatMap((arquivo) => [metodoUsado(arquivo), ajustesUsado(arquivo)])];
		return { nome: usados.map((item) => item.nome).join(" + "), hash: usados.map((item) => item.hash).join(" + ") };
	};

	beforeEach(async () => {
		for (const arquivo of ARQUIVOS_METODO) {
			await gravarAjustes(dados, {
				arquivo,
				titulo: `Ajustes do Breno para ${arquivo}`,
				ajustes: [
					{ id: "a-1", estado: "em teste", texto: ajusteDe(arquivo), comentario: null },
					{ id: "a-2", estado: "descartado", texto: "Um ajuste descartado.", comentario: null },
					{ id: "a-3", estado: "mantido", texto: mantidoDe(arquivo), comentario: null },
				],
			});
		}
		ligar();
	});

	it("o plano, as lições, a reescrita, a pergunta, a dissertativa, a explicação e os termos levam os ajustes (em teste e mantido, cada um com o estado); os eventos, o hash deles", async () => {
		geracaoQueDaCerto();
		await gerarM1();
		expect(chamadas[0]!.contexto.systemPrompt).toBe(comAjustes("Planeje as lições.", ["estrutura-da-licao.md"]));
		expect(chamadas[1]!.contexto.systemPrompt).toBe(
			comAjustes("Escreva a lição.", ["estrutura-da-licao.md", "introducao.md", "conceito.md", "exemplos.md", "pergunta.md", "ideia-central.md", "quiz.md", "termos.md"]),
		);
		for (const chamada of chamadas) expect(chamada.contexto.systemPrompt).not.toContain("Um ajuste descartado.");
		const [gerou] = await doVerbo("gerou_modulo");
		expect(gerou!.contexto!.prompts).toEqual([
			{ nome: "modulo-plano.md", hash: hashDoPrompt(PROMPT_PLANO) },
			{ nome: "modulo-licao.md", hash: hashDoPrompt(PROMPT_LICAO) },
			...ARQUIVOS_METODO.flatMap((arquivo) => [metodoUsado(arquivo), ajustesUsado(arquivo)]),
		]);

		// Os ajustes que valeram na geração das lições: no módulo e no contexto do evento, com o estado.
		const esperados = ARQUIVOS_METODO.flatMap((arquivo) => [
			{ arquivo, ajuste: "a-1", estado: "em teste" },
			{ arquivo, ajuste: "a-3", estado: "mantido" },
		]);
		const ordenar = <T extends { arquivo: string; ajuste: string }>(lista: T[]) => [...lista].sort((a, b) => `${a.arquivo}#${a.ajuste}`.localeCompare(`${b.arquivo}#${b.ajuste}`));
		const gravado = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(ordenar(gravado.ajustesUsados!)).toEqual(ordenar(esperados));
		expect(gerou!.contexto!.ajustesUsados).toEqual(gravado.ajustesUsados);

		// A reescrita de um bloco não muda o ajustesUsados.
		const id = await retornoNoB1();
		respostas.push(EXPLICACAO_NOVA);
		reescrever("w1", id);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(comAjustes("Reescreva o bloco.", ["introducao.md", "termos.md"]));
		const [reescreveu] = await doAprendiz("reescreveu_bloco");
		expect(reescreveu!.contexto!.prompt).toEqual(comAjustesUsado("modulo-bloco.md", PROMPT_BLOCO, ["introducao.md", "termos.md"]));
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).ajustesUsados).toEqual(gravado.ajustesUsados);

		// A conferência da pergunta e a correção da dissertativa.
		respostas.push(CONFERENCIA_PARCIAL);
		await responder("v1", { bloco: "l1-b3", confianca: 3, texto: "As ocorrências.", tempoMs: 1 });
		await esperar(async () => (await doAprendiz("respondeu_verificacao")).length === 1);
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(comAjustes("Confira a pergunta.", ["pergunta.md"]));
		const [verificacao] = await doAprendiz("respondeu_verificacao");
		expect((verificacao!.contexto!.corretor as { prompt: unknown }).prompt).toEqual(comAjustesUsado("verificacao.md", PROMPT_VERIFICACAO, ["pergunta.md"]));
		respostas.push(CORRECAO_M1);
		await responder("d1", { bloco: "l2-b5", confianca: 2, texto: "Poucos documentos.", tempoMs: 1 });
		await esperar(async () => (await doAprendiz("respondeu_dissertativa")).length === 1);
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(comAjustes("Corrija pela rubrica.", ["dissertativa.md"]));
		const [dissertativa] = await doAprendiz("respondeu_dissertativa");
		expect((dissertativa!.contexto!.corretor as { prompt: unknown }).prompt).toEqual(comAjustesUsado("corretor.md", PROMPT_CORRETOR, ["dissertativa.md"]));

		// A explicação de um trecho e "Marcar os termos".
		respostas.push(EXPLICACAO_COM_TERMO);
		explicar("x1");
		await respondeu("x1");
		await esperar(async () => (await doAprendiz("pediu_explicacao")).length === 1);
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(comAjustes("Explique o trecho.", ["conceito.md", "termos.md"]));
		const [explicou] = await doAprendiz("pediu_explicacao");
		expect((explicou!.contexto!.explicador as { prompt: unknown }).prompt).toEqual(comAjustesUsado("explicar-trecho.md", PROMPT_EXPLICAR, ["conceito.md", "termos.md"]));
		respostas.push(TERMOS_L1, TERMOS_L2);
		acao("marcar_termos", { modulo: "m1", pedido: "t1" });
		await respondeu("t1");
		await esperar(async () => (await doVerbo("marcou_termos")).length === 1);
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(comAjustes("Marque os termos.", ["termos.md"]));
	});

	it("um arquivo de ajustes ilegível impede a geração antes de chamar o modelo, e não é sobrescrito", async () => {
		await writeFile(caminhoDosAjustes(dados, "estrutura-da-licao.md"), "## sem formato\n", "utf8");
		geracaoQueDaCerto();
		acao("gerar", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toMatchObject({ ao: "gerar", modulo: "m1", mensagem: expect.stringMatching(/^Não consegui ler os ajustes do método .*estrutura-da-licao\.md: a linha 1 não está no formato/) });
		expect(chamadas).toHaveLength(0);
		expect(await readFile(caminhoDosAjustes(dados, "estrutura-da-licao.md"), "utf8")).toBe("## sem formato\n");
	});
});

describe("o que facilita (o bloco <o-que-facilita> nas lições e na reescrita)", () => {
	const aprendizados = [
		{ id: "ap-1", situacao: "observado" as const, texto: "Exemplos concretos antes da definição.", comentario: null },
		{ id: "ap-2", situacao: "contradito" as const, texto: "Tabelas ajudam.", comentario: null },
		{ id: "ap-3", situacao: "confirmado" as const, texto: "Blocos curtos funcionam.", comentario: null },
	];
	const bloco = `<o-que-facilita>\nO que já se observou que facilita o aprendizado do Breno. Use como orientação, não como regra.\n\n- Exemplos concretos antes da definição.\n- Blocos curtos funcionam.\n</o-que-facilita>`;
	const usadoDoBloco = { nome: "aprendiz/metodo/aprendizados.md", hash: hashDoPrompt(bloco) };

	beforeEach(() => {
		ligar();
	});

	it("observado e confirmado vão no fim do system prompt das lições (não do plano) e da reescrita; o hash dos eventos inclui o bloco; contradito fica de fora", async () => {
		await gravarAprendizados(dados, { titulo: "O que facilita para o Breno", aprendizados });
		geracaoQueDaCerto();
		await gerarM1();
		expect(chamadas[0]!.contexto.systemPrompt).toBe(comMetodo("Planeje as lições.", ["estrutura-da-licao.md"]));
		expect(chamadas[1]!.contexto.systemPrompt).toBe(
			`${comMetodo("Escreva a lição.", ["estrutura-da-licao.md", "introducao.md", "conceito.md", "exemplos.md", "pergunta.md", "ideia-central.md", "quiz.md", "termos.md"])}\n\n${bloco}`,
		);
		expect(chamadas[2]!.contexto.systemPrompt).toContain(bloco);
		expect(chamadas[1]!.contexto.systemPrompt).not.toContain("Tabelas ajudam.");
		const [gerou] = await doVerbo("gerou_modulo");
		expect(gerou!.contexto!.prompts).toEqual([
			{ nome: "modulo-plano.md", hash: hashDoPrompt(PROMPT_PLANO) },
			{ nome: "modulo-licao.md", hash: hashDoPrompt(PROMPT_LICAO) },
			...ARQUIVOS_METODO.map(metodoUsado),
			usadoDoBloco,
		]);

		const id = await retornoNoB1();
		respostas.push(EXPLICACAO_NOVA);
		reescrever("w1", id);
		await respondeu("w1");
		await reescritoNa("l1-b1");
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(`${comMetodo("Reescreva o bloco.", ["introducao.md", "termos.md"])}\n\n${bloco}`);
		const [reescreveu] = await doAprendiz("reescreveu_bloco");
		const sem = PROMPT_BLOCO_COM_INTRODUCAO();
		expect(reescreveu!.contexto!.prompt).toEqual({ nome: `${sem.nome} + aprendiz/metodo/aprendizados.md`, hash: `${sem.hash} + ${usadoDoBloco.hash}` });
	});

	it("mudar o aprendizado muda o hash; sem aprendizado que entre, nada vai no prompt nem no evento", async () => {
		await gravarAprendizados(dados, { titulo: "O que facilita para o Breno", aprendizados: [aprendizados[1]!] });
		geracaoQueDaCerto();
		await gerarM1();
		expect(chamadas[1]!.contexto.systemPrompt).not.toContain("<o-que-facilita>");
		const [gerou] = await doVerbo("gerou_modulo");
		expect((gerou!.contexto!.prompts as Array<{ nome: string }>).some((prompt) => prompt.nome.includes("aprendizados.md"))).toBe(false);
		expect(hashDoPrompt(bloco)).not.toBe(hashDoPrompt(bloco.replace("Blocos curtos funcionam.", "Blocos médios funcionam.")));
	});

	it("um aprendizados.md ilegível impede a geração e a reescrita antes de chamar o modelo, e não é sobrescrito", async () => {
		geracaoQueDaCerto();
		await gerarM1();
		const id = await retornoNoB1();
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAprendizados(dados), "texto solto\n", "utf8");
		const antes = chamadas.length;
		reescrever("w1", id);
		await respondeu("w1");
		await esperar(() => erroDe("w1") !== undefined || recebidas("erro").some((mensagem) => mensagem.dados.ao === "reescrever_bloco"));
		expect(recebidas("erro").find((mensagem) => mensagem.dados.ao === "reescrever_bloco")?.dados.mensagem).toMatch(/Não consegui ler os aprendizados do método/);
		expect(chamadas).toHaveLength(antes);

		acao("gerar", { modulo: "m2", pedido: "g2" });
		await respondeu("g2");
		await esperar(() => erroDe("g2") !== undefined || recebidas("erro").some((mensagem) => mensagem.dados.ao === "gerar" && mensagem.dados.modulo === "m2"));
		expect(recebidas("erro").find((mensagem) => mensagem.dados.ao === "gerar" && mensagem.dados.modulo === "m2")?.dados.mensagem).toMatch(/Não consegui ler os aprendizados do método/);
		expect(chamadas).toHaveLength(antes);
		expect(await readFile(caminhoDosAprendizados(dados), "utf8")).toBe("texto solto\n");
	});
});

// --- O ciclo do método: a análise do módulo (docs/metodo-experimentos.md) -------------------------

type MensagemModuloComRelatorio = MensagemModuloDoTeste & { relatorio: RelatorioMetodo | null; relatorioGerando: boolean; relatorioErro?: string };
const moduloComRelatorio = (pedido?: string) => (pedido ? moduloDoPedido(pedido) : recebidas("modulo").at(-1)?.dados) as unknown as MensagemModuloComRelatorio;
const relatorioNoEstado = () => doModulo(ultimo(), "m1")?.relatorio;
const esperarRelatorio = (situacao: string) => esperar(() => relatorioNoEstado()?.situacao === situacao);
const esperarEventosDoRelatorio = (quantos: number) => esperar(async () => (await doVerbo("gerou_relatorio_metodo")).length >= quantos);
const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
/** Uma ação do painel modulos sem matéria nem curso (listar_ajustes e as que saíram). */
const acaoAjustes = (nome: string, dadosAcao: Record<string, unknown> = {}) => barramento.emit("interface:acao", { painel: "modulos", acao: nome, dados: dadosAcao });
type MensagemAjustesDoTeste = { arquivos: Array<Record<string, unknown>>; aprendizados: { itens: Array<Record<string, unknown>>; erro?: string }; pedido?: string };
const ajustesDoPedido = (pedido: string) => comPedido(pedido).find((mensagem) => mensagem.acao === "ajustes")?.dados as unknown as MensagemAjustesDoTeste | undefined;
const erroSemPedido = (ao: string) => recebidas("erro").find((mensagem) => mensagem.dados.ao === ao && mensagem.dados.pedido === undefined)?.dados;
/** Espera o relatório do m1 gravado ter a análise aplicada (aplicadoEm). */
const esperarAplicada = () => esperar(async () => ((await lerRelatorio(dados, materia, CURSO, "m1")) as RelatorioMetodoV2 | null)?.aplicadoEm !== undefined);
/** O relatório gravado do m1, da versão 2. */
const gravadoV2 = async () => (await lerRelatorio(dados, materia, CURSO, "m1")) as RelatorioMetodoV2;

const TEXTO_P1 = "Antes do código de um exemplo, diga em uma frase o que ele vai mostrar.";
const TEXTO_P2 = "Abra cada conceito pelo caso concreto.";

/** O que o modelo do relatório devolve: um item em cada lista e duas propostas (exemplos.md e conceito.md). Com `extra`, troca campos. */
function relatorioDoModelo(ids: string[], extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		resumo: "Os blocos curtos funcionaram; o bloco 2 ficou abstrato.",
		funcionou: [{ texto: "Os blocos curtos foram bem avaliados.", evidencias: [ids[0]] }],
		problemas: [{ texto: "O bloco 2 ficou abstrato.", evidencias: [ids[1]] }],
		experimentos: [],
		propostas: [
			{ arquivo: "exemplos.md", ajuste: TEXTO_P1, porque: "Dois blocos foram mal avaliados.", evidencias: [ids[0], ids[1]] },
			{ arquivo: "conceito.md", ajuste: TEXTO_P2, porque: "O Breno pediu explicação.", evidencias: [ids[0], ids[2] ?? ids[1]] },
		],
		aprendizados: [],
		revisoes: [],
		...extra,
	});
}

/** Notas rápidas em blocos de l1 (bom, ruim, ótimo): os eventos de retorno que o relatório conta. Devolve os ids deles, na ordem. */
async function darRetorno(quantos: number): Promise<string[]> {
	const notas: Array<[string, string]> = [
		["l1-b1", "bom"],
		["l1-b2", "ruim"],
		["l1-b4", "otimo"],
	];
	for (const [indice, [bloco, nota]] of notas.slice(0, quantos).entries()) {
		avaliar(`nota-${indice}`, bloco, nota);
		await respondeu(`nota-${indice}`);
	}
	return (await doAprendiz("avaliou_bloco")).map((evento) => evento.id);
}

const concluirM1 = async (pedido = "c1") => {
	acao("concluir", { modulo: "m1", pedido });
	await respondeu(pedido);
};

describe("a análise do módulo (concluir e gerar_relatorio)", () => {
	beforeEach(async () => {
		ligar();
		geracaoQueDaCerto();
		await gerarM1();
	});

	it("o prompt do perfil pede o modelo da decisão do Breno e fala dos experimentos e dos aprendizados", async () => {
		const prompt = lerPromptMapeador(await readFile(CAMINHO_PROMPT_RELATORIO, "utf8"));
		expect(prompt.modelo).toBe("openrouter/openai/gpt-6.1-sol");
		expect(prompt.instrucoes.length).toBeGreaterThan(200);
		for (const trecho of ['"experimentos"', '"aprendizados"', '"revisoes"', "manter", "reescrever", "descartar", "continuar", "vagas", "[ATUAL]"]) expect(prompt.instrucoes).toContain(trecho);
		expect(prompt.instrucoes).not.toMatch(/Breno aprova ou rejeita/);
	});

	it("concluir responde sem esperar o modelo e dispara a análise: a mensagem com o placar e o histórico, o relatório gravado, os experimentos novos aplicados, os eventos, o módulo e o estado", async () => {
		const ids = await darRetorno(3);
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const antes = chamadas.length;
		await concluirM1("c1");
		expect(erroDe("c1")).toBeUndefined();
		const aceito = comPedido("c1")[0]!.dados as unknown as MensagemEstado;
		expect(doModulo(aceito, "m1")).toMatchObject({ situacao: "gerado", concluido: true, relatorio: { situacao: "gerando" } });
		expect(doModulo(aceito, "m1")!.relatorio).toEqual({ situacao: "gerando" });
		expect(aceito.experimentosEmTeste).toBe(0);
		expect(moduloComRelatorio()).toMatchObject({ relatorio: null, relatorioGerando: true });
		expect(moduloComRelatorio().relatorioErro).toBeUndefined();

		// Enquanto o modelo pensa, nem gerar de novo.
		await esperar(() => chamadas.length > antes);
		acao("gerar_relatorio", { modulo: "m1", pedido: "g0" });
		await respondeu("g0");
		expect(erroDe("g0")).toMatchObject({ ao: "gerar_relatorio", modulo: "m1", mensagem: expect.stringContaining("já está sendo gerado") });
		expect(chamadas).toHaveLength(antes + 1);

		const chamada = chamadas.at(-1)!;
		expect(chamada.contexto.systemPrompt).toBe("Escreva o relatório do método.");
		expect(chamada.opcoes.maxTokens).toBe(16_000);
		const mensagem = textoDaChamada(chamada);
		expect(mensagem).toContain("Lições do módulo (2):");
		expect(mensagem).toContain('1. l1, "Contando termos": Calcular o TF.');
		expect(mensagem).toContain("Eventos do módulo (3 lidos, 3 de retorno)");
		expect(mensagem).toContain(`- ${ids[0]}: l1-b1 · `);
		expect(mensagem).toMatch(new RegExp(`- ${ids[1]}: l1-b2 · .*Feedback Ruim`));
		expect(mensagem).toMatch(new RegExp(`- ${ids[2]}: l1-b4 · .*Feedback Ótimo`));
		expect(mensagem).toContain('<bloco id="l1-b2" licao="l1"');
		expect(mensagem).toContain('<metodologia arquivo="exemplos.md">\nComo escrever (exemplos.md).\n</metodologia>');
		// O placar do módulo atual e o histórico (vazio), numa tabela de texto, com os n.
		expect(mensagem).toContain("O placar do módulo atual (última linha) e dos módulos concluídos antes dele (0, do mais antigo ao mais novo)");
		expect(mensagem).toContain(
			"| P1: busca · Pesos dos termos (p1-busca/m1) [ATUAL] | — | — | — | — | — | — | — | — | — | 33% (n=3) | 33% (n=3) | 0 (n=2) | 0 (n=2) | — | nenhum |",
		);
		expect(mensagem).toContain("Experimentos em teste: nenhum.");
		expect(mensagem).toContain("Ajustes mantidos: nenhum.");
		expect(mensagem).toContain("Vagas para experimentos novos: 2 (no máximo 2 em teste ao mesmo tempo");
		expect(mensagem).toContain("Aprendizados registrados: nenhum.");

		adiado.soltar(relatorioDoModelo(ids));
		await esperarRelatorio("pronto");
		await esperarAplicada();
		expect(relatorioNoEstado()).toEqual({ situacao: "pronto" });
		const gravado = await gravadoV2();
		expect(gravado).toMatchObject({
			versao: 2,
			modulo: "m1",
			situacao: "pronto",
			modelo: "teste/modelo-x",
			custo: 0.01,
			prompt: { nome: "relatorio-metodo.md", hash: hashDoPrompt(PROMPT_RELATORIO) },
			eventosLidos: 3,
			retornos: 3,
			resumo: "Os blocos curtos funcionaram; o bloco 2 ficou abstrato.",
			funcionou: [{ texto: "Os blocos curtos foram bem avaliados.", evidencias: [ids[0]] }],
			problemas: [{ texto: "O bloco 2 ficou abstrato.", evidencias: [ids[1]] }],
			experimentos: [],
			paraDepois: [],
			aprendizados: [],
			revisoes: [],
			aplicadoEm: expect.any(String),
		});
		expect(gravado.erroAoAplicar).toBeUndefined();
		expect(gravado.placar).toMatchObject({ licoes: 2, blocos: { ruim: 1, bom: 1, otimo: 1, total: 3 } });
		expect(gravado.comparacao.blocosRuins).toEqual({ atual: 0.3333, nAtual: 3, media: null, nMedia: 0, modulos: 0 });
		expect(gravado.propostas).toEqual([
			{ id: "p1", arquivo: "exemplos.md", ajuste: TEXTO_P1, porque: "Dois blocos foram mal avaliados.", evidencias: [ids[0], ids[1]], novo: expect.stringMatching(/^exemplos\.md#a-\d{8}-1$/) },
			{ id: "p2", arquivo: "conceito.md", ajuste: TEXTO_P2, porque: "O Breno pediu explicação.", evidencias: [ids[0], ids[2]], novo: expect.stringMatching(/^conceito\.md#a-\d{8}-1$/) },
		]);
		expect(gravado.evidencias).toEqual([
			{ id: ids[0], linha: expect.stringContaining("l1-b1 · "), licao: "l1", bloco: "l1-b1" },
			{ id: ids[1], linha: expect.stringContaining("Feedback Ruim"), licao: "l1", bloco: "l1-b2" },
			{ id: ids[2], linha: expect.stringContaining("Feedback Ótimo"), licao: "l1", bloco: "l1-b4" },
		]);

		// Os experimentos novos entraram sozinhos, em teste, com a origem; o estado conta os dois.
		const exemplos = (await lerAjustes(dados, "exemplos.md")).ajustes;
		expect(exemplos).toHaveLength(1);
		expect(exemplos[0]).toMatchObject({ estado: "em teste", texto: TEXTO_P1, comentario: expect.stringMatching(new RegExp(`^origem: ${materia}/${CURSO}/m1/p1 · evidências: ${ids[0]}, ${ids[1]} · começou em \\d{4}-\\d{2}-\\d{2}$`)) });
		expect((await lerAjustes(dados, "conceito.md")).ajustes[0]).toMatchObject({ estado: "em teste", texto: TEXTO_P2 });
		expect(ultimo()!.experimentosEmTeste).toBe(2);
		const iniciados = await doAprendiz("iniciou_experimento_metodo");
		expect(iniciados.map((evento) => evento.objeto.proposta)).toEqual(["p1", "p2"]);
		expect(iniciados[0]).toMatchObject({ sessao: "sessao-1", objeto: { arquivo: "exemplos.md", materia, curso: CURSO, modulo: "m1" }, resultado: { texto: TEXTO_P1, evidencias: [ids[0], ids[1]] } });

		const final = moduloComRelatorio();
		expect(final.relatorioGerando).toBe(false);
		expect(final.relatorioErro).toBeUndefined();
		expect(final.relatorio).toEqual(gravado);
		expect(final.pedido).toBeUndefined();

		const eventos = await doVerbo("gerou_relatorio_metodo");
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: CURSO, modulo: "m1" },
			resultado: { situacao: "pronto", propostas: 2, custo: 0.01 },
			contexto: { modelo: "teste/modelo-x", prompt: { nome: "relatorio-metodo.md", hash: hashDoPrompt(PROMPT_RELATORIO) } },
		});
		expect(await doVerbo("concluiu_modulo")).toHaveLength(1);
	});

	it("com menos de 3 retornos grava pouco_retorno só com o placar, sem chamar o modelo nem mudar nenhum experimento; gerar de novo só chama com forcar", async () => {
		const ids = await darRetorno(2);
		await gravarAjustes(dados, { arquivo: "quiz.md", titulo: "Ajustes do Breno para quiz.md", ajustes: [{ id: "a-1", estado: "em teste", texto: "Um experimento.", comentario: null }] });
		const antes = chamadas.length;
		await concluirM1();
		await esperarRelatorio("pouco_retorno");
		await esperarEventosDoRelatorio(1);
		expect(chamadas).toHaveLength(antes);
		const gravado = await gravadoV2();
		expect(gravado).toMatchObject({ versao: 2, situacao: "pouco_retorno", custo: 0, eventosLidos: 2, retornos: 2, resumo: "", funcionou: [], problemas: [], experimentos: [], propostas: [], paraDepois: [], aprendizados: [], revisoes: [], evidencias: [] });
		expect(gravado.placar.blocos).toEqual({ ruim: 1, bom: 1, otimo: 0, total: 2 });
		expect(gravado.comparacao.blocosRuins).toMatchObject({ atual: 0.5, nAtual: 2 });
		expect(gravado.aplicadoEm).toBeUndefined();
		expect(gravado.modelo).toBeUndefined();
		expect(gravado.prompt).toBeUndefined();
		expect(relatorioNoEstado()).toEqual({ situacao: "pouco_retorno" });
		expect(moduloComRelatorio()).toMatchObject({ relatorioGerando: false, relatorio: { situacao: "pouco_retorno" } });
		const [evento] = await doVerbo("gerou_relatorio_metodo");
		expect(evento).toMatchObject({ objeto: { materia, curso: CURSO, modulo: "m1" }, resultado: { situacao: "pouco_retorno", propostas: 0, custo: 0 } });
		expect(evento!.contexto).toBeUndefined();
		expect((await lerAjustes(dados, "quiz.md")).ajustes[0]!.estado).toBe("em teste");
		expect(await doAprendiz("decidiu_experimento_metodo")).toHaveLength(0);

		// Sem forcar, de novo pouco_retorno (substitui o arquivo, com outro evento).
		acao("gerar_relatorio", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		await esperarEventosDoRelatorio(2);
		await esperar(() => !moduloComRelatorio().relatorioGerando);
		expect(chamadas).toHaveLength(antes);

		// "Gerar mesmo assim": chama o modelo e aplica.
		respostas.push(relatorioDoModelo(ids));
		acao("gerar_relatorio", { modulo: "m1", pedido: "g2", forcar: true });
		await respondeu("g2");
		expect(moduloComRelatorio("g2")).toMatchObject({ relatorioGerando: true });
		expect(comPedido("g2").map((mensagem) => mensagem.acao)).toEqual(["modulo"]);
		await esperarRelatorio("pronto");
		await esperarAplicada();
		expect(chamadas).toHaveLength(antes + 1);
		expect(await gravadoV2()).toMatchObject({ situacao: "pronto", eventosLidos: 2, retornos: 2, propostas: [{ id: "p1" }] });
		expect(await doVerbo("gerou_relatorio_metodo")).toHaveLength(3);
	});

	it("gerar de novo uma análise já aplicada é erro ('A análise deste módulo já foi aplicada.'), antes de chamar o modelo", async () => {
		const ids = await darRetorno(3);
		respostas.push(relatorioDoModelo(ids));
		await concluirM1();
		await esperar(async () => ((await lerRelatorio(dados, materia, CURSO, "m1")) as RelatorioMetodoV2 | null)?.aplicadoEm !== undefined);
		await esperar(() => !moduloComRelatorio().relatorioGerando);
		const antes = chamadas.length;
		const gravado = await gravadoV2();
		acao("gerar_relatorio", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toMatchObject({ ao: "gerar_relatorio", modulo: "m1", mensagem: "A análise deste módulo já foi aplicada." });
		acao("gerar_relatorio", { modulo: "m1", pedido: "g2", forcar: true });
		await respondeu("g2");
		expect(erroDe("g2")).toMatchObject({ mensagem: "A análise deste módulo já foi aplicada." });
		expect(chamadas).toHaveLength(antes);
		expect(await gravadoV2()).toEqual(gravado);
		expect(await doVerbo("gerou_relatorio_metodo")).toHaveLength(1);
		expect(await doAprendiz("iniciou_experimento_metodo")).toHaveLength(2);
	});

	it("gerar_relatorio de um módulo que não está concluído, ou que não foi gerado, é erro", async () => {
		const antes = chamadas.length;
		acao("gerar_relatorio", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toMatchObject({ ao: "gerar_relatorio", modulo: "m1", mensagem: expect.stringContaining("não está concluído") });
		acao("gerar_relatorio", { modulo: "m2", pedido: "g2" });
		await respondeu("g2");
		expect(erroDe("g2")).toMatchObject({ ao: "gerar_relatorio", modulo: "m2", mensagem: expect.stringContaining("ainda não foi gerado") });
		expect(chamadas).toHaveLength(antes);
		expect(await doVerbo("gerou_relatorio_metodo")).toHaveLength(0);
	});

	it("JSON inválido: uma nova tentativa com a frase do problema; o custo das duas vai no relatório", async () => {
		const ids = await darRetorno(3);
		const antes = chamadas.length;
		respostas.push("isso não é um JSON", relatorioDoModelo(ids));
		await concluirM1("c1");
		await esperar(async () => ((await lerRelatorio(dados, materia, CURSO, "m1")) as RelatorioMetodoV2 | null)?.aplicadoEm !== undefined);
		expect(chamadas).toHaveLength(antes + 2);
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("A sua resposta não veio como o pedido");
		const feito = await gravadoV2();
		expect(feito.custo).toBeCloseTo(0.02, 5);
		expect((await doVerbo("gerou_relatorio_metodo"))[0]!.resultado!.custo).toBeCloseTo(0.02, 5);
	});

	it("fora do esquema (sem o resumo): a frase do conferidor vai na nova tentativa", async () => {
		const ids = await darRetorno(3);
		const antes = chamadas.length;
		respostas.push('{"funcionou": [], "problemas": [], "propostas": []}', relatorioDoModelo(ids, { resumo: "Outro resumo." }));
		await concluirM1("c1");
		await esperar(async () => ((await lerRelatorio(dados, materia, CURSO, "m1")) as RelatorioMetodoV2 | null)?.aplicadoEm !== undefined);
		expect(chamadas).toHaveLength(antes + 2);
		expect(textoDaChamada(chamadas.at(-1)!)).toContain('Falta o "resumo"');
		expect((await gravadoV2()).resumo).toBe("Outro resumo.");
	});

	it("duas respostas ruins: o erro sai sem pedido, não deixa arquivo nem evento nem experimento; o estado fica em erro até Tentar de novo", async () => {
		const ids = await darRetorno(3);
		respostas.push("ruim", "ainda ruim");
		await concluirM1("c1");
		await esperar(() => erroSemPedido("gerar_relatorio") !== undefined);
		expect(erroSemPedido("gerar_relatorio")).toMatchObject({
			ao: "gerar_relatorio",
			materia,
			curso: CURSO,
			modulo: "m1",
			mensagem: expect.stringContaining("O modelo não devolveu o relatório do método, nem na segunda tentativa"),
		});
		await esperarRelatorio("erro");
		expect(relatorioNoEstado()).toMatchObject({ situacao: "erro", mensagem: expect.stringContaining("nem na segunda tentativa") });
		await esperar(() => moduloComRelatorio().relatorioErro !== undefined);
		expect(moduloComRelatorio()).toMatchObject({ relatorio: null, relatorioGerando: false, relatorioErro: expect.stringContaining("nem na segunda tentativa") });
		expect(await lerRelatorio(dados, materia, CURSO, "m1")).toBeNull();
		expect(await doVerbo("gerou_relatorio_metodo")).toHaveLength(0);
		expect(await doAprendiz("iniciou_experimento_metodo")).toHaveLength(0);

		respostas.push(relatorioDoModelo(ids));
		acao("gerar_relatorio", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		expect(moduloComRelatorio("g1")).toMatchObject({ relatorioGerando: true });
		expect(moduloComRelatorio("g1").relatorioErro).toBeUndefined();
		await esperarRelatorio("pronto");
		expect(moduloComRelatorio()).toMatchObject({ relatorioGerando: false, relatorio: { situacao: "pronto" } });
		expect(moduloComRelatorio().relatorioErro).toBeUndefined();
	});

	it("a evidência é só do módulo: o evento de outro módulo não vai ao modelo, e citá-lo tira o item e a proposta", async () => {
		const ids = await darRetorno(3);
		const doOutroModulo = criarEvento({ sessao: "sessao-1", verbo: "avaliou_bloco", objeto: { materia, curso: CURSO, modulo: "m2", licao: "l1", bloco: "l1-b1" }, resultado: { avaliacao: "ruim", motivos: [], texto: "" } });
		const doOutroCurso = criarEvento({ sessao: "sessao-1", verbo: "avaliou_bloco", objeto: { materia, curso: "outro-curso", modulo: "m1", licao: "l1", bloco: "l1-b1" }, resultado: { avaliacao: "ruim", motivos: [], texto: "" } });
		await acrescentarEvento(eventosAprendiz(dados), doOutroModulo);
		await acrescentarEvento(eventosAprendiz(dados), doOutroCurso);
		respostas.push(
			relatorioDoModelo(ids, {
				funcionou: [{ texto: "Só do outro módulo.", evidencias: [doOutroModulo.id] }],
				propostas: [
					{ arquivo: "exemplos.md", ajuste: TEXTO_P1, porque: "Um evento do módulo e um de outro.", evidencias: [ids[0], doOutroModulo.id] },
					{ arquivo: "conceito.md", ajuste: TEXTO_P2, porque: "Dois do módulo e um inventado.", evidencias: [ids[0], ids[1], doOutroCurso.id, "ev-que-nao-existe"] },
				],
			}),
		);
		await concluirM1();
		await esperarRelatorio("pronto");
		const mensagem = textoDaChamada(chamadas.at(-1)!);
		expect(mensagem).toContain("Eventos do módulo (3 lidos, 3 de retorno)");
		expect(mensagem).not.toContain(doOutroModulo.id);
		expect(mensagem).not.toContain(doOutroCurso.id);
		const gravado = await gravadoV2();
		expect(gravado).toMatchObject({ eventosLidos: 3, retornos: 3, funcionou: [], problemas: [{ evidencias: [ids[1]] }] });
		expect(gravado.propostas).toEqual([expect.objectContaining({ id: "p1", arquivo: "conceito.md", ajuste: TEXTO_P2, porque: "Dois do módulo e um inventado.", evidencias: [ids[0], ids[1]] })]);
		expect(gravado.evidencias.map((item) => item.id)).toEqual([ids[0], ids[1]]);
	});

	it("o fim da sessão cancela a chamada sem gravar nem mostrar; na sessão nova o relatório é 'nenhum' e dá para gerar", async () => {
		const ids = await darRetorno(3);
		const adiado = adiada();
		respostas.push(adiado.resposta);
		const antes = chamadas.length;
		await concluirM1();
		await esperar(() => chamadas.length > antes);
		const sinal = chamadas.at(-1)!.opcoes.signal!;
		expect(sinal.aborted).toBe(false);
		const mostradosAntes = mostrados.length;
		tratadores.session_shutdown?.({}, ctx);
		await dormir(40);
		expect(sinal.aborted).toBe(true);
		expect(mostrados).toHaveLength(mostradosAntes);
		expect(await lerRelatorio(dados, materia, CURSO, "m1")).toBeNull();
		expect(await doVerbo("gerou_relatorio_metodo")).toHaveLength(0);
		expect(await doAprendiz("iniciou_experimento_metodo")).toHaveLength(0);

		ligar();
		acao("listar", { pedido: "l1" });
		await respondeu("l1");
		expect(doModulo(ultimo(), "m1")).toMatchObject({ concluido: true, relatorio: { situacao: "nenhum" } });
		respostas.push(relatorioDoModelo(ids));
		acao("gerar_relatorio", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		await esperarRelatorio("pronto");
		expect(await doVerbo("gerou_relatorio_metodo")).toHaveLength(1);
	});

	it("um relatório gravado que não se lê não é sobrescrito: gerar_relatorio é erro antes de chamar o modelo, e o estado diz erro", async () => {
		const ids = await darRetorno(3);
		respostas.push(relatorioDoModelo(ids));
		await concluirM1();
		await esperarAplicada();
		const caminho = caminhoDoRelatorio(dados, materia, CURSO, "m1");
		await writeFile(caminho, "{ isto não é JSON", "utf8");
		const antes = chamadas.length;
		acao("gerar_relatorio", { modulo: "m1", pedido: "g1" });
		await respondeu("g1");
		expect(erroDe("g1")).toMatchObject({ ao: "gerar_relatorio", mensagem: expect.stringMatching(/^Não consegui ler o relatório do método .*m1\.json/) });
		expect(chamadas).toHaveLength(antes);
		expect(await readFile(caminho, "utf8")).toBe("{ isto não é JSON");
		acao("listar", { pedido: "l1" });
		await respondeu("l1");
		expect(doModulo(ultimo(), "m1")?.relatorio).toMatchObject({ situacao: "erro", mensagem: expect.stringContaining("Não consegui ler o relatório do método") });
	});

	it("um arquivo de ajustes ilegível impede a análise antes de chamar o modelo (erro sem pedido), e não é sobrescrito", async () => {
		await darRetorno(3);
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAjustes(dados, "conceito.md"), "## sem formato\n", "utf8");
		const antes = chamadas.length;
		await concluirM1();
		await esperar(() => erroSemPedido("gerar_relatorio") !== undefined);
		expect(erroSemPedido("gerar_relatorio")).toMatchObject({ ao: "gerar_relatorio", mensagem: expect.stringContaining("Não consegui ler os ajustes do método") });
		expect(chamadas).toHaveLength(antes);
		expect(await readFile(caminhoDosAjustes(dados, "conceito.md"), "utf8")).toBe("## sem formato\n");
	});
});

describe("as decisões da análise sobre os experimentos em teste", () => {
	const TEXTO_EXP = "Diga antes o que o exemplo vai mostrar.";
	let ids: string[];

	beforeEach(async () => {
		// Um experimento em teste que já valeu num módulo concluído antes (m2) e vale na geração de m1: 2 módulos, contando o atual.
		await gravarAjustes(dados, {
			arquivo: "exemplos.md",
			titulo: "Ajustes do Breno para exemplos.md",
			ajustes: [{ id: "a-1", estado: "em teste", texto: TEXTO_EXP, comentario: `origem: ${materia}/${CURSO}/m2/p1 · evidências: e1, e2 · começou em 2026-10-30` }],
		});
		ligar();
		geracaoQueDaCerto();
		await gerarM1();
		await gravarModulo(dados, {
			...((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado),
			id: "m2",
			concluidoEm: "2026-10-30T10:00:00.000Z",
			ajustesUsados: [{ arquivo: "exemplos.md", ajuste: "a-1", estado: "em teste" }],
		});
		ids = await darRetorno(3);
	});

	const concluirEAnalisar = async (resposta: string) => {
		respostas.push(resposta);
		await concluirM1();
		await esperarAplicada();
		await esperarRelatorio("pronto");
	};

	it("a mensagem leva o experimento com os módulos em que valeu (o histórico e o atual), as vagas que sobram e o histórico no placar", async () => {
		await concluirEAnalisar(relatorioDoModelo(ids, { propostas: [] }));
		const mensagem = textoDaChamada(chamadas.at(-1)!);
		expect(mensagem).toContain(`- exemplos.md#a-1 (começou em 2026-10-30; valeu em 2 módulos: ${CURSO}/m2 Similaridade; ${CURSO}/m1 Pesos dos termos (atual)): ${TEXTO_EXP}`);
		expect(mensagem).toContain("Experimentos em teste (1):");
		expect(mensagem).toContain("Vagas para experimentos novos: 1 (no máximo 2 em teste");
		expect(mensagem).toContain('<ajustes-do-breno arquivo="exemplos.md">');
		expect(mensagem).toContain(`- (em teste) ${TEXTO_EXP}`);
		expect(mensagem).toContain("(1, do mais antigo ao mais novo)");
		expect(mensagem).toContain(`| P1: busca · Similaridade (p1-busca/m2) |`);
		expect(mensagem).toContain("| exemplos.md#a-1 (em teste) |");
		expect(mensagem).toContain("[ATUAL]");
	});

	it("manter (valeu em 2 módulos): o ajuste vira mantido, o evento decidiu_experimento_metodo, a vaga é liberada para uma proposta", async () => {
		await concluirEAnalisar(
			relatorioDoModelo(ids, {
				experimentos: [{ ajuste: "exemplos.md#a-1", decisao: "manter", porque: "As notas de exemplos subiram de 2 (n=1) para 4 (n=2)." }],
				propostas: [{ arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "Foram fáceis.", evidencias: [ids[0], ids[1]] }],
			}),
		);
		const gravado = await gravadoV2();
		expect(gravado.experimentos).toEqual([
			expect.objectContaining({ ajuste: "exemplos.md#a-1", arquivo: "exemplos.md", texto: TEXTO_EXP, decisao: "manter", modulosTestados: 2, porque: "As notas de exemplos subiram de 2 (n=1) para 4 (n=2)." }),
		]);
		expect(gravado.experimentos[0]!.testadoEm.map((item) => [item.modulo, item.atual])).toEqual([
			["m2", false],
			["m1", true],
		]);
		expect(gravado.experimentos[0]!.conserto).toBeUndefined();
		expect((await lerAjustes(dados, "exemplos.md")).ajustes[0]!.estado).toBe("mantido");
		expect((await lerAjustes(dados, "quiz.md")).ajustes[0]).toMatchObject({ estado: "em teste", texto: "Use alternativas plausíveis." });
		const [decidiu] = await doAprendiz("decidiu_experimento_metodo");
		expect(decidiu).toMatchObject({
			sessao: "sessao-1",
			objeto: { arquivo: "exemplos.md", ajuste: "a-1", materia, curso: CURSO, modulo: "m1" },
			resultado: { decisao: "manter", modulosTestados: 2 },
		});
		expect(ultimo()!.experimentosEmTeste).toBe(1);

	});

	it("manter com o experimento valendo em um módulo só vira continuar, com o conserto anotado e nada muda; descartar e reescrever mudam", async () => {
		// Sem m2 no histórico, o experimento só valeu no módulo atual.
		await rm(caminhoDoModulo(dados, materia, CURSO, "m2"));
		await concluirEAnalisar(relatorioDoModelo(ids, { propostas: [], experimentos: [{ ajuste: "exemplos.md#a-1", decisao: "manter", porque: "Subiu." }] }));
		const gravado = await gravadoV2();
		expect(gravado.experimentos[0]).toMatchObject({ decisao: "continuar", modulosTestados: 1, conserto: expect.stringContaining("só valeu em 1 módulo (o mínimo é 2)") });
		expect((await lerAjustes(dados, "exemplos.md")).ajustes[0]!.estado).toBe("em teste");
		expect(await doAprendiz("decidiu_experimento_metodo")).toHaveLength(0);
	});

	it("reescrever: o antigo fica descartado (substituído por) e o texto novo entra em teste, ocupando a vaga; descartar libera", async () => {
		await concluirEAnalisar(
			relatorioDoModelo(ids, {
				experimentos: [{ ajuste: "exemplos.md#a-1", decisao: "reescrever", texto: "Comece o exemplo dizendo, em uma frase, o que ele mostra.", porque: "O professor não seguiu: vago." }],
				propostas: [
					{ arquivo: "quiz.md", ajuste: "Use alternativas plausíveis.", porque: "Foram fáceis.", evidencias: [ids[0], ids[1]] },
					{ arquivo: "termos.md", ajuste: "Defina antes de usar.", porque: "Pediu explicação.", evidencias: [ids[0], ids[2]] },
				],
			}),
		);
		const gravado = await gravadoV2();
		expect(gravado.experimentos[0]).toMatchObject({ decisao: "reescrever", textoNovo: "Comece o exemplo dizendo, em uma frase, o que ele mostra.", novo: expect.stringMatching(/^exemplos\.md#a-\d{8}-1$/) });
		// A reescrita ocupa a vaga: só 1 vaga sobra, entra a primeira proposta e a outra vai para depois.
		expect(gravado.propostas.map((item) => item.arquivo)).toEqual(["quiz.md"]);
		expect(gravado.paraDepois.map((item) => item.arquivo)).toEqual(["termos.md"]);
		await expect(readFile(caminhoDosAjustes(dados, "termos.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		const exemplos = (await lerAjustes(dados, "exemplos.md")).ajustes;
		expect(exemplos.map((item) => item.estado)).toEqual(["descartado", "em teste"]);
		expect(exemplos[0]!.comentario).toMatch(/ · substituído por a-\d{8}-1$/);
		expect(exemplos[1]).toMatchObject({ texto: "Comece o exemplo dizendo, em uma frase, o que ele mostra.", comentario: expect.stringContaining(`reescrita de exemplos.md#a-1`) });
		const iniciados = await doAprendiz("iniciou_experimento_metodo");
		expect(iniciados.map((evento) => [evento.objeto.arquivo, evento.objeto.reescritaDe ?? evento.objeto.proposta])).toEqual([
			["exemplos.md", "exemplos.md#a-1"],
			["quiz.md", "p1"],
		]);
		expect(ultimo()!.experimentosEmTeste).toBe(2);
	});

	it("o experimento que o modelo não decidiu continua em teste, com 'A análise não decidiu sobre ele.'", async () => {
		await concluirEAnalisar(relatorioDoModelo(ids, { propostas: [] }));
		const gravado = await gravadoV2();
		expect(gravado.experimentos[0]).toMatchObject({ decisao: "continuar", porque: "A análise não decidiu sobre ele." });
		expect((await lerAjustes(dados, "exemplos.md")).ajustes[0]!.estado).toBe("em teste");
	});

	it("os aprendizados novos e as revisões vão para o aprendizados.md, com os eventos; a mensagem seguinte leva os registrados", async () => {
		await gravarAprendizados(dados, { titulo: "O que facilita para o Breno", aprendizados: [{ id: "ap-20261001-1", situacao: "observado", texto: "Blocos curtos funcionam.", comentario: null }] });
		await concluirEAnalisar(
			relatorioDoModelo(ids, {
				propostas: [],
				aprendizados: [{ texto: "Exemplos concretos antes da definição ajudam.", porque: "O entendimento subiu.", evidencias: [ids[2]] }],
				revisoes: [{ aprendizado: "ap-20261001-1", situacao: "confirmado", porque: "Voltou a acontecer." }],
			}),
		);
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("Aprendizados registrados (o que facilita para o Breno; 1):\n- ap-20261001-1 (observado): Blocos curtos funcionam.");
		const lidos = (await lerAprendizados(dados)).aprendizados;
		expect(lidos.map((item) => [item.id, item.situacao])).toEqual([
			["ap-20261001-1", "confirmado"],
			[expect.stringMatching(/^ap-\d{8}-1$/), "observado"],
		]);
		const gravado = await gravadoV2();
		expect(gravado.aprendizados[0]).toMatchObject({ texto: "Exemplos concretos antes da definição ajudam.", novo: lidos[1]!.id });
		expect(gravado.revisoes).toEqual([{ aprendizado: "ap-20261001-1", texto: "Blocos curtos funcionam.", situacao: "confirmado", porque: "Voltou a acontecer.", anterior: "observado" }]);
		expect(await doAprendiz("registrou_aprendizado_metodo")).toHaveLength(1);
		expect(await doAprendiz("reviu_aprendizado_metodo")).toHaveLength(1);
	});

	it("um aprendizados.md ilegível impede a análise antes de chamar o modelo: erro sem pedido, nenhum relatório e nenhum experimento muda", async () => {
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAprendizados(dados), "texto solto\n", "utf8");
		respostas.push(relatorioDoModelo(ids, { propostas: [], experimentos: [{ ajuste: "exemplos.md#a-1", decisao: "manter", porque: "Subiu." }] }));
		const antes = chamadas.length;
		await concluirM1();
		await esperar(() => erroSemPedido("gerar_relatorio") !== undefined);
		expect(erroSemPedido("gerar_relatorio")).toMatchObject({ mensagem: expect.stringContaining("Não consegui ler os aprendizados do método") });
		expect(chamadas).toHaveLength(antes);
		expect(await lerRelatorio(dados, materia, CURSO, "m1")).toBeNull();
		expect((await lerAjustes(dados, "exemplos.md")).ajustes[0]!.estado).toBe("em teste");
	});
});

describe("listar_ajustes e as ações que saíram", () => {
	beforeEach(() => {
		ligar();
	});

	it("listar_ajustes sem nenhum ajuste devolve as listas vazias, com o pedido", async () => {
		acaoAjustes("listar_ajustes", { pedido: "la" });
		await respondeu("la");
		expect(ajustesDoPedido("la")).toEqual({ arquivos: [], aprendizados: { itens: [] }, pedido: "la" });
	});

	it("devolve os ajustes com o estado e a origem e os aprendizados com a situação; um arquivo ilegível vai com o erro", async () => {
		await gravarAjustes(dados, {
			arquivo: "exemplos.md",
			titulo: "Ajustes do Breno para exemplos.md",
			ajustes: [
				{ id: "a-1", estado: "em teste", texto: "Um.", comentario: `origem: ${materia}/${CURSO}/m1/p1 · evidências: e1, e2 · começou em 2026-11-03` },
				{ id: "a-2", estado: "mantido", texto: "Dois.", comentario: null },
				{ id: "a-3", estado: "descartado", texto: "Três.", comentario: null },
			],
		});
		await gravarAprendizados(dados, { titulo: "O que facilita para o Breno", aprendizados: [{ id: "ap-1", situacao: "confirmado", texto: "Exemplos antes.", comentario: `origem: ${materia}/${CURSO}/m2 · evidências: e3 · registrado em 2026-11-04` }] });
		await mkdir(join(dados, "aprendiz", "metodo"), { recursive: true });
		await writeFile(caminhoDosAjustes(dados, "conceito.md"), "## sem formato\n", "utf8");
		acaoAjustes("listar_ajustes", { pedido: "la" });
		await respondeu("la");
		const resposta = ajustesDoPedido("la")!;
		expect(resposta.arquivos.map((item) => item.arquivo)).toEqual(["conceito.md", "exemplos.md"]);
		expect(resposta.arquivos[0]).toMatchObject({ ajustes: [], erro: expect.stringContaining("Não consegui ler os ajustes do método") });
		expect(resposta.arquivos[1]).toEqual({
			arquivo: "exemplos.md",
			ajustes: [
				{ id: "a-1", texto: "Um.", estado: "em teste", origem: { materia, curso: CURSO, modulo: "m1", proposta: "p1", evidencias: ["e1", "e2"], em: "2026-11-03", reescritaDe: null, substituidoPor: null } },
				{ id: "a-2", texto: "Dois.", estado: "mantido", origem: null },
				{ id: "a-3", texto: "Três.", estado: "descartado", origem: null },
			],
		});
		expect(resposta.aprendizados).toEqual({ itens: [{ id: "ap-1", texto: "Exemplos antes.", situacao: "confirmado", origem: { materia, curso: CURSO, modulo: "m2", proposta: null, evidencias: ["e3"], em: "2026-11-04", reescritaDe: null, substituidoPor: null } }] });
		expect(await readFile(caminhoDosAjustes(dados, "conceito.md"), "utf8")).toBe("## sem formato\n");

		await writeFile(caminhoDosAprendizados(dados), "texto solto\n", "utf8");
		acaoAjustes("listar_ajustes", { pedido: "lb" });
		await respondeu("lb");
		expect(ajustesDoPedido("lb")!.aprendizados).toEqual({ itens: [], erro: expect.stringContaining("Não consegui ler os aprendizados do método") });
		expect(await readFile(caminhoDosAprendizados(dados), "utf8")).toBe("texto solto\n");
	});

	it("o estado leva experimentosEmTeste no topo e o relatório sem pendentes", async () => {
		await gravarAjustes(dados, {
			arquivo: "quiz.md",
			titulo: "Ajustes do Breno para quiz.md",
			ajustes: [
				{ id: "a-1", estado: "em teste", texto: "Um.", comentario: null },
				{ id: "a-2", estado: "em teste", texto: "Dois.", comentario: null },
				{ id: "a-3", estado: "mantido", texto: "Três.", comentario: null },
			],
		});
		acao("listar", { pedido: "l1" });
		await respondeu("l1");
		expect((comPedido("l1")[0]!.dados as unknown as MensagemEstado).experimentosEmTeste).toBe(2);
		expect("pendentes" in ((doModulo(ultimo(), "m1") as { relatorio?: object }).relatorio ?? {})).toBe(false);
	});

	it("decidir_proposta e ligar_ajuste não existem mais: a extensão responde com um erro de ação desconhecida e não grava nada", async () => {
		await gravarAjustes(dados, { arquivo: "quiz.md", titulo: "Ajustes do Breno para quiz.md", ajustes: [{ id: "a-1", estado: "em teste", texto: "Um.", comentario: null }] });
		const antes = await readFile(caminhoDosAjustes(dados, "quiz.md"), "utf8");
		for (const [indice, nome] of ["decidir_proposta", "ligar_ajuste"].entries()) {
			barramento.emit("interface:acao", { painel: "modulos", acao: nome, dados: { materia, curso: CURSO, modulo: "m1", pedido: `x${indice}`, proposta: "p1", decisao: "aprovar", arquivo: "quiz.md", ajuste: "a-1", ativo: false } });
			await respondeu(`x${indice}`);
			expect(erroDe(`x${indice}`)).toMatchObject({ ao: nome, mensagem: expect.stringContaining(`Ação desconhecida: "${nome}"`) });
		}
		expect(await readFile(caminhoDosAjustes(dados, "quiz.md"), "utf8")).toBe(antes);
		expect(await doAprendiz("aprovou_ajuste_metodo")).toHaveLength(0);
		expect(await doAprendiz("alterou_ajuste_metodo")).toHaveLength(0);
		expect(await doAprendiz("rejeitou_ajuste_metodo")).toHaveLength(0);
	});
});
