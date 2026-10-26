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
import { lerEventos } from "../lib/eventos.ts";
import { type Conceito, gravarMapa, lerMapa, mapaVazio, pastaExtraidoArquivo } from "../lib/mapa.ts";
import { criarMateria, eventosMateria } from "../lib/materias.ts";
import { caminhoDoModulo, type EstadoModuloNaTela, lerModulo, type ModuloGerado } from "../lib/modulos.ts";
import { hashDoPrompt } from "./cursos.ts";
import modulos, { type MensagemEstado, type OpcoesModulos } from "./modulos.ts";

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
		{ titulo: "Contando termos", objetivo: "Calcular o TF.", conceitos: ["c-tf"], roteiro: ["explicacao", "verificacao", "explicacao", "alternativa"] },
		{ titulo: "Termos raros pesam mais", objetivo: "Calcular o IDF.", conceitos: ["c-idf"], roteiro: ["explicacao", "dissertativa"] },
	],
});
const explicacao = (conceitoId: string, formato: string, local: string) => ({ tipo: "explicacao", conceitos: [conceitoId], formato, texto: `Texto sobre ${conceitoId}.`, referencias: [{ arquivo: "aula.pdf", local }] });
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
		explicacao("c-tf", "conceito", "página 1"),
		{ tipo: "verificacao", conceitos: ["c-tf"], pergunta: "O que o TF conta?", respostaEsperada: "As ocorrências do termo no documento." },
		explicacao("c-tf", "exemplo_resolvido", "página 1"),
		alternativa("c-tf"),
	],
});
const LICAO_2 = JSON.stringify({ blocos: [explicacao("c-idf", "exemplo_incompleto", "página 2"), dissertativa("c-idf")] });
/** Uma lição sem prática que valha (validarLicao pede a nova tentativa). */
const LICAO_SEM_PRATICA = JSON.stringify({ blocos: [explicacao("c-tf", "conceito", "página 1")] });

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

describe("ponte", () => {
	beforeEach(() => ligar());

	it("listar manda o estado de todos os módulos com o próximo", async () => {
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
			["l1-b1", "l1-b2", "l1-b3", "l1-b4"],
			["l2-b1", "l2-b2"],
		]);
		expect(gravado.licoes[0]!.blocos[0]).toMatchObject({ formato: "conceito", referencias: [ref(1)] });

		const fim = doModulo(ultimo(), "m1")!;
		expect(fim).toMatchObject({ situacao: "gerado", licoesGeradas: 2, blocos: 6, questoes: 2, geradoEm: gravado.geradoEm });
		expect(ultimo()!.proximo).toBe("m2");

		const eventos = await doVerbo("gerou_modulo");
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, curso: CURSO, modulo: "m1" },
			resultado: { licoes: 2, blocos: 6, questoes: 2 },
			contexto: {
				modelo: "teste/modelo-x",
				prompts: [
					{ nome: "modulo-plano.md", hash: hashDoPrompt(PROMPT_PLANO) },
					{ nome: "modulo-licao.md", hash: hashDoPrompt(PROMPT_LICAO) },
				],
			},
		});

		// As mensagens: o plano pede 2 lições (2 h) com os níveis e os locais; a lição leva o plano e os trechos.
		expect(chamadas).toHaveLength(3);
		const plano = textoDaChamada(chamadas[0]!);
		expect(chamadas[0]!.contexto.systemPrompt).toBe("Planeje as lições.");
		expect(plano).toContain("Lições pedidas: exatamente 2.");
		expect(plano).toContain("Motivo do aluno: Use os exercícios como base para as questões práticas.");
		expect(plano).toContain("Informações específicas do aluno para este módulo:\nFoco no IDF.");
		expect(plano).toContain("Nível do aluno: iniciante (explicação no formato exemplo_resolvido");
		expect(plano).toContain("Nível do aluno: intermediário (explicação no formato exemplo_incompleto");
		expect(plano).toContain("- aula.pdf, página 2");
		const licao2 = textoDaChamada(chamadas[2]!);
		expect(chamadas[2]!.contexto.systemPrompt).toBe("Escreva a lição.");
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
		expect(textoDaChamada(chamadas[2]!)).toContain("A sua resposta não veio como o pedido: A lição l1");
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).custo).toBeCloseTo(0.04);
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

	it("gerar um módulo que não é o próximo é erro, sem chamar o modelo", async () => {
		acao("gerar", { modulo: "m2", pedido: "p-m2" });
		await respondeu("p-m2");
		expect(erroDe("p-m2")).toMatchObject({ ao: "gerar", modulo: "m2", mensagem: "Só o próximo módulo pode ser gerado." });
		expect(chamadas).toHaveLength(0);
		acao("listar", { pedido: "l" });
		await respondeu("l");
		expect(situacaoDe("m2")).toBe("a_gerar");
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
		expect(sem).toContain("## Lição l1: Contando termos");
		expect(sem).toContain("### l1-b1 · Explicação (apresentação do conceito)");
		expect(sem).toContain("Texto sobre c-tf.");
		expect(sem).toContain("Conceitos: Frequência do termo.");
		expect(sem).toContain("Pergunta: O que o TF conta?");
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
