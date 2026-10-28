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
import { lerEventos } from "../lib/eventos.ts";
import { type Conceito, gravarMapa, lerMapa, mapaVazio, pastaExtraidoArquivo } from "../lib/mapa.ts";
import { criarMateria, eventosAprendiz, eventosMateria } from "../lib/materias.ts";
import { ARQUIVOS_METODO, caminhoDoModulo, type EstadoModuloNaTela, lerModulo, MINIMO_CARACTERES_EXEMPLO, type ModuloGerado } from "../lib/modulos.ts";
import { hashDoPrompt, lerMetodo, PASTA_METODO } from "./cursos.ts";
import type { RespostaModulo } from "../lib/modulo-respostas.ts";
import modulos, { CAMINHO_PROMPT_BLOCO, CAMINHO_PROMPT_LICAO, CAMINHO_PROMPT_PLANO, CAMINHO_PROMPT_VERIFICACAO, type MensagemEstado, type OpcoesModulos } from "./modulos.ts";
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
		for (const caminho of [CAMINHO_PROMPT_PLANO, CAMINHO_PROMPT_LICAO, CAMINHO_PROMPT_BLOCO]) {
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
			comMetodo("Escreva a lição.", ["estrutura-da-licao.md", "introducao.md", "conceito.md", "exemplos.md", "pergunta.md", "ideia-central.md", "quiz.md"]),
		);
		expect(plano).toContain("Lições pedidas: exatamente 2.");
		expect(plano).toContain("Motivo do aluno: Use os exercícios como base para as questões práticas.");
		expect(plano).toContain("Informações específicas do aluno para este módulo:\nFoco no IDF.");
		expect(plano).toContain("Nível do aluno: iniciante (exemplo no formato exemplo_resolvido");
		expect(plano).toContain("Nível do aluno: intermediário (exemplo no formato exemplo_incompleto");
		expect(plano).toContain("- aula.pdf, página 2");
		const licao2 = textoDaChamada(chamadas[2]!);
		expect(chamadas[2]!.contexto.systemPrompt).toBe(comMetodo("Escreva a lição.", ["estrutura-da-licao.md", "introducao.md", "conceito.md", "exemplos.md", "ideia-central.md", "dissertativa.md"]));
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

/** Grava um retorno "melhorar" (longo e abstrato) no l1-b1 e devolve o id do evento. */
async function retornoNoB1(pedido = "r1", extra: Record<string, unknown> = {}): Promise<string> {
	acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b1", pedido, avaliacao: "melhorar", motivos: ["longo", "abstrato", "longo"], texto: " Muito texto antes do exemplo. ", ...extra });
	await respondeu(pedido);
	const id = retornoDe(pedido);
	if (!id) throw new Error(`o retorno não foi gravado: ${JSON.stringify(erroDe(pedido))}`);
	return id;
}

/** O prompt da reescrita com a metodologia da introdução (o l1-b1), como o reescreveu_bloco o guarda. */
const PROMPT_BLOCO_COM_INTRODUCAO = () => ({ nome: "modulo-bloco.md + metodo/introducao.md", hash: `${hashDoPrompt(PROMPT_BLOCO)} + ${hashDoPrompt(METODO["introducao.md"]!)}` });

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
			resultado: { avaliacao: "melhorar", motivos: ["longo", "abstrato"], texto: "Muito texto antes do exemplo." },
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
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b1", pedido: "e1", avaliacao: "otimo" });
		await respondeu("e1");
		expect(erroDe("e1")).toMatchObject({ ao: "retorno", modulo: "m1", mensagem: expect.stringContaining("A avaliação do bloco não é válida") });
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
		expect(pedido.contexto.systemPrompt).toBe(comMetodo("Reescreva o bloco.", ["introducao.md"]));
		const mensagem = textoDaChamada(pedido);
		expect(mensagem).toContain('Lição do bloco: l1, "Contando termos"');
		expect(mensagem).toContain("### l1-b1 · Explicação (posição 1): ESTE É O BLOCO A REESCREVER");
		expect(mensagem).toContain("Pergunta: O que o TF conta?");
		expect(mensagem).toContain("Resposta esperada: As ocorrências do termo no documento.");
		expect(mensagem).toContain("Bloco a reescrever: l1-b1, do tipo explicacao, posição 1 de 6, versão 1.");
		expect(mensagem).toContain('"texto": "Texto sobre c-tf. x');
		expect(mensagem).not.toContain('"id": "l1-b1"');
		expect(mensagem).toContain("Avaliação: Precisa melhorar\nMotivos: Longo demais (longo); Abstrato demais (abstrato)\nTexto do aluno: Muito texto antes do exemplo.");
		expect(mensagem).toContain("Nível do aluno: iniciante");
		expect(mensagem).toContain('<trecho arquivo="aula.pdf" local="página 1">\nTF conta quantas vezes o termo aparece no documento.\n</trecho>');
		expect(mensagem).not.toContain("IDF é o log");
		expect(mensagem).toContain("Escopo: só o material");
		expect(mensagem).toContain("Motivo do aluno: Use os exercícios como base para as questões práticas.");
		expect(mensagem).not.toContain("Regras de escrita");

		adiado.soltar(EXPLICACAO_NOVA);
		await esperar(() => recebidas("modulo").length > 0);
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
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b5", pedido: "r1", avaliacao: "melhorar", motivos: ["confuso"], texto: "Mais direto." });
		await respondeu("r1");
		const id = retornoDe("r1")!;
		respostas.push(JSON.stringify({ bloco: { tipo: "ideia_central", conceitos: ["c-tf"], texto: "O TF conta as ocorrências do termo no documento." } }));
		reescrever("w1", id, "l1-b5");
		await respondeu("w1");
		await esperar(() => recebidas("modulo").length > 0);
		expect(chamadas.at(-1)!.contexto.systemPrompt).toBe(comMetodo("Reescreva o bloco.", ["ideia-central.md"]));
		expect(textoDaChamada(chamadas.at(-1)!)).toContain("### l1-b5 · Ideia central (posição 5): ESTE É O BLOCO A REESCREVER");
		const bloco = ((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).licoes[0]!.blocos[4]!;
		expect(bloco).toMatchObject({ id: "l1-b5", tipo: "ideia_central", texto: "O TF conta as ocorrências do termo no documento.", versao: 2 });
		const [evento] = await doAprendiz("reescreveu_bloco");
		expect(evento!.contexto).toMatchObject({
			prompt: { nome: "modulo-bloco.md + metodo/ideia-central.md", hash: `${hashDoPrompt(PROMPT_BLOCO)} + ${hashDoPrompt(METODO["ideia-central.md"]!)}` },
		});
	});

	it("uma resposta inválida tem uma nova tentativa; duas, o erro, e o bloco fica como estava", async () => {
		const id = await retornoNoB1();
		const errado = JSON.stringify({ bloco: { tipo: "verificacao", conceitos: ["c-tf"], pergunta: "?", respostaEsperada: "!" } });
		respostas.push(errado, EXPLICACAO_NOVA);
		reescrever("w1", id);
		await respondeu("w1");
		await esperar(() => recebidas("modulo").length > 0);
		expect(textoDaChamada(chamadas.at(-1)!)).toContain('A sua resposta não veio como o pedido: O bloco reescrito veio do tipo "verificacao", e precisava ser "explicacao".');
		expect((await doAprendiz("reescreveu_bloco"))[0]!.contexto).toMatchObject({ custo: 0.02 });

		const antes = await lerModulo(dados, materia, CURSO, "m1");
		const id2 = await retornoNoB1("r2");
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
		await esperar(() => recebidas("modulo").length > 0);
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
		await esperar(() => recebidas("modulo").length > 0);
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
		acao("retorno", { modulo: "m1", licao: "l1", bloco: "l1-b6", pedido: "r1", avaliacao: "melhorar", motivos: ["confuso"], texto: "" });
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
		expect(eventos[1]!.contexto).toMatchObject({ prompt: { nome: "modulo-bloco.md + metodo/quiz.md" } });
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
