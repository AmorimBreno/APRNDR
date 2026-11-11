// Testes da extensão de notas sem o pi: um "pi" falso com um barramento
// síncrono (como o pi.events), o pi.on e o registerTool, numa pasta de dados
// temporária com uma matéria. O caderno é simulado mandando "interface:acao".

import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerEventos } from "../lib/eventos.ts";
import { criarMateria, eventosMateria } from "../lib/materias.ts";
import { hashDoArquivo } from "../lib/nota-do-professor.ts";
import { arquivoNota, criarNota, ehNotaDoProfessor, listarNotas, pastaNotas, versaoDe } from "../lib/notas.ts";
import { idCurtoDaConversa } from "../lib/trecho-guardado.ts";
import notas, { acrescentarAoFim, materiaDaConversa } from "./notas.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] } };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, unknown>; gravar?: boolean };

let dados = "";
let materia = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
let aoIniciar: ((evento: unknown, ctx: Contexto) => void) | undefined;
let mostrados: Mostrado[];
let entradas: Entrada[];
let ctx: Contexto;

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-notas-"));
	materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
	entradas = [];
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas } };
	barramento = new EventEmitter();
	ferramentas = {};
	aoIniciar = undefined;
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
	const pi = {
		events: {
			on: (canal: string, ouvinte: (dados: unknown) => void) => {
				barramento.on(canal, ouvinte);
				return () => barramento.off(canal, ouvinte);
			},
			emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
		},
		on: (evento: string, tratador: (evento: unknown, ctx: Contexto) => void) => {
			if (evento === "session_start") aoIniciar = tratador;
		},
		registerTool: (definicao: Ferramenta & { name: string }) => (ferramentas[definicao.name] = definicao),
	} as unknown as ExtensionAPI;
	notas(pi);
	aoIniciar?.({}, ctx);
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

/** Espera até `condicao` valer (os tratadores da ponte são assíncronos). */
async function esperar(condicao: () => boolean): Promise<void> {
	for (let tentativa = 0; tentativa < 200 && !condicao(); tentativa++) await new Promise((resolver) => setTimeout(resolver, 5));
	if (!condicao()) throw new Error("não aconteceu");
}

const acao = (acao: string, dadosAcao: Record<string, unknown>) => barramento.emit("interface:acao", { painel: "notas", acao, dados: { materia, ...dadosAcao } });
const recebidas = (nome: string) => mostrados.filter((mensagem) => mensagem.acao === nome);
const verbos = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.map((evento) => evento.verbo);

describe("ponte das notas", () => {
	it("ignora outros painéis e manda tudo passageiro", async () => {
		barramento.emit("interface:acao", { painel: "cadernos", acao: "listar", dados: { materia } });
		acao("listar", {});
		await esperar(() => mostrados.length > 0);
		expect(mostrados).toEqual([{ painel: "notas", acao: "lista", dados: { materia, notas: [] }, gravar: false }]);
	});

	it("cria: avisa a criada e manda a lista; título ruim vira erro do criar", async () => {
		acao("criar", { titulo: "Limites" });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("criada")[0]!.dados).toEqual({ materia, titulo: "Limites" });
		acao("criar", { titulo: "a/b" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "criar", materia, titulo: "a/b" });
	});

	it("abre a nota com o conteúdo e a versão", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "# Limites\n", "utf8");
		acao("abrir", { titulo: "limites" });
		await esperar(() => recebidas("nota").length > 0);
		expect(recebidas("nota")[0]!.dados).toMatchObject({ materia, titulo: "Limites", conteudo: "# Limites\n", versao: versaoDe("# Limites\n") });
	});

	it("salva em fila, devolve o pedido e grava editou_nota uma vez por edicao", async () => {
		await criarNota(dados, materia, "Limites");
		acao("salvar", { titulo: "Limites", conteudo: "um", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		await esperar(() => recebidas("salva").length === 1);
		const primeira = recebidas("salva")[0]!.dados;
		expect(primeira).toMatchObject({ materia, titulo: "Limites", versao: versaoDe("um\n"), pedido: "p1" });
		acao("salvar", { titulo: "Limites", conteudo: "dois", versao: primeira.versao, edicao: "e1", pedido: "p2" });
		await esperar(() => recebidas("salva").length === 2);
		acao("salvar", { titulo: "Limites", conteudo: "três", versao: versaoDe("dois\n"), edicao: "e2", pedido: "p3" });
		await esperar(() => recebidas("salva").length === 3);
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("três\n");
		expect((await verbos()).filter((verbo) => verbo === "editou_nota")).toHaveLength(2);
	});

	it("conflito quando o arquivo mudou fora; forcar grava por cima", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "de fora\n", "utf8");
		acao("salvar", { titulo: "Limites", conteudo: "meu", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		await esperar(() => recebidas("conflito").length > 0);
		expect(recebidas("conflito")[0]!.dados).toMatchObject({ materia, titulo: "Limites", versaoAtual: versaoDe("de fora\n"), pedido: "p1" });
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("de fora\n");
		acao("salvar", { titulo: "Limites", conteudo: "meu", forcar: true, edicao: "e1", pedido: "p2" });
		await esperar(() => recebidas("salva").length > 0);
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("meu\n");
	});

	it("a lista pedida logo depois de salvar espera o salvamento", async () => {
		await criarNota(dados, materia, "Limites");
		acao("salvar", { titulo: "Limites", conteudo: "texto novo", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		acao("listar", {});
		await esperar(() => recebidas("lista").length > 0);
		expect((recebidas("lista")[0]!.dados as { notas: Array<{ previa: string }> }).notas[0]!.previa).toBe("texto novo");
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["salva", "lista"]);
	});

	it("uma cópia sem sessão no mesmo barramento (a carga a mais ao recarregar) fica calada", async () => {
		const copia = {
			events: {
				on: (canal: string, ouvinte: (dados: unknown) => void) => {
					barramento.on(canal, ouvinte);
					return () => barramento.off(canal, ouvinte);
				},
				emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
			},
			on: () => undefined,
			registerTool: () => undefined,
		} as unknown as ExtensionAPI;
		notas(copia);
		await criarNota(dados, materia, "Limites");
		acao("salvar", { titulo: "Limites", conteudo: "um", versao: versaoDe(""), edicao: "e1", pedido: "p1" });
		await esperar(() => recebidas("salva").length > 0);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["salva"]);
	});

	it("renomeia, avisa e manda a lista", async () => {
		await criarNota(dados, materia, "Limites");
		acao("renomear", { de: "Limites", para: "Limites laterais" });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("renomeada")[0]!.dados).toEqual({ materia, de: "Limites", para: "Limites laterais", mencoesAtualizadas: [] });
		expect((recebidas("lista")[0]!.dados as { notas: Array<{ titulo: string }> }).notas.map((nota) => nota.titulo)).toEqual(["Limites laterais"]);
	});
});

describe("guardar na nota (mesa, parte C1)", () => {
	const TEXTO = "> Um bloco do professor.\n>\n> — Professor, conversa de 11/11/2026\n<!-- conversa:abcd1234 -->";
	const guardados = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "guardou_na_nota");

	it("guardar: acrescenta ao fim da nota fechada, com uma linha em branco antes, na versão lida, e grava guardou_na_nota", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "# Limites\n\nTexto do Breno.\n", "utf8");
		acao("guardar", { titulo: "limites", texto: TEXTO, sessao: "sessao-1", pedido: "g1" });
		await esperar(() => recebidas("guardada").length > 0);
		const esperado = `# Limites\n\nTexto do Breno.\n\n${TEXTO}\n`;
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe(esperado);
		expect(recebidas("guardada")[0]).toMatchObject({
			painel: "notas",
			gravar: false,
			dados: { materia, titulo: "Limites", conteudo: esperado, versao: versaoDe(esperado), tamanho: TEXTO.length, pedido: "g1" },
		});
		const eventos = await guardados();
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({ sessao: "sessao-1", objeto: { materia, titulo: "Limites", sessao: "sessao-1", tamanho: TEXTO.length } });
		// A versão devolvida é a do arquivo: o próximo salvamento da tela, com ela, não dá conflito.
		acao("salvar", { titulo: "Limites", conteudo: "outra", versao: recebidas("guardada")[0]!.dados.versao, edicao: "e1", pedido: "p1" });
		await esperar(() => recebidas("salva").length > 0);
		expect(recebidas("conflito")).toHaveLength(0);
	});

	it("guardar em nota vazia grava só o texto; duas seguidas entram na ordem, cada uma com a sua linha em branco", async () => {
		await criarNota(dados, materia, "Limites");
		acao("guardar", { titulo: "Limites", texto: "primeiro", sessao: "sessao-1", pedido: "g1" });
		acao("guardar", { titulo: "Limites", texto: "segundo", sessao: "sessao-1", pedido: "g2" });
		await esperar(() => recebidas("guardada").length === 2);
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("primeiro\n\nsegundo\n");
		expect(await guardados()).toHaveLength(2);
		// Quem já termina com linha em branco não ganha outra.
		await writeFile(arquivoNota(dados, materia, "Limites"), "a\n\n", "utf8");
		acao("guardar", { titulo: "Limites", texto: "b", sessao: "sessao-1", pedido: "g3" });
		await esperar(() => recebidas("guardada").length === 3);
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("a\n\nb\n");
	});

	it("guardar com a sessão de outra conversa, sem sessão, sem texto, com título ruim ou inexistente: erro, e nada é gravado nem registrado", async () => {
		await criarNota(dados, materia, "Limites");
		acao("guardar", { titulo: "Limites", texto: TEXTO, sessao: "outra-sessao", pedido: "g1" });
		acao("guardar", { titulo: "Limites", texto: TEXTO, pedido: "g2" });
		acao("guardar", { titulo: "Limites", texto: "  \n", sessao: "sessao-1", pedido: "g3" });
		acao("guardar", { titulo: "../Limites", texto: TEXTO, sessao: "sessao-1", pedido: "g4" });
		acao("guardar", { titulo: "Não existe", texto: TEXTO, sessao: "sessao-1", pedido: "g5" });
		await esperar(() => recebidas("erro").length === 5);
		expect(recebidas("erro").map((mensagem) => [mensagem.dados.ao, mensagem.dados.pedido])).toEqual([
			["guardar", "g1"],
			["guardar", "g2"],
			["guardar", "g3"],
			["guardar", "g4"],
			["guardar", "g5"],
		]);
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("outra conversa");
		expect(String(recebidas("erro")[4]!.dados.mensagem)).toContain("Não achei a nota");
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("");
		expect(await guardados()).toHaveLength(0);
		expect(recebidas("guardada")).toHaveLength(0);
	});

	it("guardar espera o salvamento que já estava na fila da nota e entra depois dele, sem perder nada", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "versão um\n", "utf8");
		// O salvamento do editor já estava na fila quando o guardar foi pedido.
		acao("salvar", { titulo: "Limites", conteudo: "versão do editor", versao: versaoDe("versão um\n"), edicao: "e1", pedido: "p1" });
		acao("guardar", { titulo: "Limites", texto: "citação", sessao: "sessao-1", pedido: "g1" });
		await esperar(() => recebidas("guardada").length > 0);
		// Na fila, o guardar leu o arquivo já salvo pelo editor: o texto entra depois dele, sem perder nada.
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("versão do editor\n\ncitação\n");
	});

	it("guardou: só registra o evento (a nota não é tocada) e não responde nada à tela", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "do editor\n", "utf8");
		acao("guardou", { titulo: "LIMITES", sessao: "sessao-1", tamanho: 42 });
		for (let tentativa = 0; tentativa < 200 && (await guardados()).length === 0; tentativa++) await new Promise((resolver) => setTimeout(resolver, 5));
		const eventos = await guardados();
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({ sessao: "sessao-1", objeto: { materia, titulo: "Limites", sessao: "sessao-1", tamanho: 42 } });
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("do editor\n");
		expect(mostrados).toEqual([]);
	});

	it("guardou com a sessão errada, sem tamanho ou de uma nota que não existe: erro e nenhum evento", async () => {
		await criarNota(dados, materia, "Limites");
		acao("guardou", { titulo: "Limites", sessao: "outra", tamanho: 5, pedido: "x1" });
		acao("guardou", { titulo: "Limites", sessao: "sessao-1", pedido: "x2" });
		acao("guardou", { titulo: "Limites", sessao: "sessao-1", tamanho: -1, pedido: "x3" });
		acao("guardou", { titulo: "Fantasma", sessao: "sessao-1", tamanho: 5, pedido: "x4" });
		await esperar(() => recebidas("erro").length === 4);
		expect(recebidas("erro").map((mensagem) => mensagem.dados.ao)).toEqual(["guardou", "guardou", "guardou", "guardou"]);
		expect(await guardados()).toHaveLength(0);
	});

	it("uma cópia sem sessão no mesmo barramento fica calada também no guardar", async () => {
		const copia = {
			events: {
				on: (canal: string, ouvinte: (dados: unknown) => void) => {
					barramento.on(canal, ouvinte);
					return () => barramento.off(canal, ouvinte);
				},
				emit: (canal: string, dados: unknown) => barramento.emit(canal, dados),
			},
			on: () => undefined,
			registerTool: () => undefined,
		} as unknown as ExtensionAPI;
		notas(copia);
		await criarNota(dados, materia, "Limites");
		acao("guardar", { titulo: "Limites", texto: "x", sessao: "sessao-1", pedido: "g1" });
		await esperar(() => recebidas("guardada").length > 0);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados.map((mensagem) => mensagem.acao)).toEqual(["guardada"]);
		expect(await guardados()).toHaveLength(1);
	});

	it("acrescentarAoFim: uma linha em branco antes, sem mexer no que já estava", () => {
		expect(acrescentarAoFim("", "x")).toBe("x");
		expect(acrescentarAoFim("a", "x")).toBe("a\n\nx");
		expect(acrescentarAoFim("a\n", "x")).toBe("a\n\nx");
		expect(acrescentarAoFim("a\n\n", "x")).toBe("a\n\nx");
		expect(acrescentarAoFim("a\n\n\n", "x")).toBe("a\n\n\nx");
	});
});

describe("ferramentas do professor", () => {
	const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });

	it("acha a matéria da conversa pelo último contexto gravado", () => {
		expect(materiaDaConversa([])).toBeUndefined();
		expect(materiaDaConversa([contextoDe("materia:a"), { type: "message" }, contextoDe("materia:b")])).toBe("b");
		expect(materiaDaConversa([contextoDe("materia:a"), contextoDe("outra:c")])).toBeUndefined();
	});

	it("na conversa geral, pede a matéria; com ela, lista e lê", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "# Limites\n\nε e δ\n", "utf8");
		const semMateria = await ferramentas.listar_notas!.execute("1", {}, undefined, undefined, ctx);
		expect(semMateria.isError).toBe(true);
		const lista = await ferramentas.listar_notas!.execute("2", { materia }, undefined, undefined, ctx);
		expect(lista.content[0]!.text).toContain("- Limites");
		const lida = await ferramentas.ler_nota!.execute("3", { materia, titulo: "Limites" }, undefined, undefined, ctx);
		expect(lida.content[0]!.text).toContain("ε e δ");
		expect(lida.isError).toBeUndefined();
	});

	it("na conversa do caderno, fica na matéria dela e não lê outra", async () => {
		await criarNota(dados, materia, "Limites");
		entradas = [contextoDe(`materia:${materia}`)];
		const lista = await ferramentas.listar_notas!.execute("1", {}, undefined, undefined, ctx);
		expect(lista.content[0]!.text).toContain("- Limites");
		const outra = await ferramentas.ler_nota!.execute("2", { materia: "fisica", titulo: "Limites" }, undefined, undefined, ctx);
		expect(outra.isError).toBe(true);
		const inexistente = await ferramentas.ler_nota!.execute("3", { titulo: "Nada" }, undefined, undefined, ctx);
		expect(inexistente).toMatchObject({ isError: true, content: [{ text: 'Não achei a nota "Nada".' }] });
	});
});

describe("notas do professor (mesa, parte D)", () => {
	const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });
	const hoje = () => {
		const agora = new Date();
		return `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;
	};
	const MARCA = `Nota do professor · [conversa de ${hoje()}](conversa:${idCurtoDaConversa("sessao-1")})`;
	const criar = (titulo: string, conteudo: string, id = "chamada-1") => ferramentas.criar_nota!.execute(id, { titulo, conteudo }, undefined, undefined, ctx);
	const criados = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "criou_nota_do_professor");
	const desfeitos = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "desfez_nota_do_professor");
	const criadas = () => mostrados.filter((mensagem) => mensagem.acao === "nota_criada");
	const desfazer = (dadosAcao: Record<string, unknown>) => acao("desfazer_nota", { sessao: "sessao-1", ...dadosAcao });
	const existe = (titulo: string) => existsSync(arquivoNota(dados, materia, titulo));

	beforeEach(() => {
		entradas.push(contextoDe(`materia:${materia}`));
	});

	it("criar_nota grava o arquivo com a marca, o evento com o hash e só depois emite nota_criada (gravar: true, com a chamada)", async () => {
		// No instante da emissão, o arquivo e o evento já têm que existir.
		const noInstante: Array<{ arquivo: boolean; eventos: string }> = [];
		barramento.on("interface:mostrar", (mensagem: Mostrado) => {
			if (mensagem.acao !== "nota_criada") return;
			const eventos = existsSync(eventosMateria(dados, materia)) ? readFileSync(eventosMateria(dados, materia), "utf8") : "";
			noInstante.push({ arquivo: existe("Resumo de limites"), eventos });
		});
		const resultado = await criar("  Resumo de limites ", "# Resumo\n\nO limite existe.", "chamada-42");
		expect(resultado.isError).toBeUndefined();
		const texto = `${MARCA}\n\n# Resumo\n\nO limite existe.\n`;
		expect(await readFile(arquivoNota(dados, materia, "Resumo de limites"), "utf8")).toBe(texto);
		expect(ehNotaDoProfessor(texto)).toBe(true);

		const eventos = await criados();
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({
			sessao: "sessao-1",
			objeto: { materia, titulo: "Resumo de limites", tamanho: Buffer.byteLength(texto, "utf8"), hash: hashDoArquivo(texto) },
		});

		expect(criadas()).toEqual([
			{
				painel: "mesa",
				acao: "nota_criada",
				gravar: true,
				dados: { materia, titulo: "Resumo de limites", rota: `caderno/${materia}/notas/Resumo de limites`, chamada: "chamada-42", sessao: "sessao-1" },
			},
		]);
		expect(noInstante).toHaveLength(1);
		expect(noInstante[0]!.arquivo).toBe(true);
		expect(noInstante[0]!.eventos).toContain("criou_nota_do_professor");

		// O que o modelo lê: o título e o botão Desfazer, sem "salvei".
		expect(resultado.content[0]!.text).toContain("Resumo de limites");
		expect(resultado.content[0]!.text).toContain("Desfazer");
		expect(resultado.content[0]!.text.toLowerCase()).not.toContain("salv");
		// A lista da matéria marca a nota e a prévia começa depois da marca.
		const { notas } = await listarNotas(dados, materia);
		expect(notas[0]).toMatchObject({ titulo: "Resumo de limites", doProfessor: true, previa: "Resumo O limite existe." });
	});

	it("criar_nota só existe na conversa de uma matéria: fora dela recusa e não cria nem registra nada", async () => {
		entradas.length = 0;
		const resultado = await criar("Limites", "texto");
		expect(resultado.isError).toBe(true);
		expect(resultado.content[0]!.text).toContain("conversa do caderno");
		expect(existe("Limites")).toBe(false);
		expect(await criados()).toHaveLength(0);
		expect(criadas()).toHaveLength(0);
	});

	it("título que já existe (inclusive só nas maiúsculas): recusa e não sobrescreve nem registra", async () => {
		await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "do Breno\n", "utf8");
		const resultado = await criar("limites", "texto do professor");
		expect(resultado.isError).toBe(true);
		expect(resultado.content[0]!.text).toContain("Já existe");
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("do Breno\n");
		expect(await criados()).toHaveLength(0);
		expect(criadas()).toHaveLength(0);
		// A segunda tentativa com o mesmo título de uma nota do professor também recusa.
		expect((await criar("Nova", "a")).isError).toBeUndefined();
		const repetida = await criar("Nova", "b");
		expect(repetida.isError).toBe(true);
		expect(await readFile(arquivoNota(dados, materia, "Nova"), "utf8")).toBe(`${MARCA}\n\na\n`);
		expect(await criados()).toHaveLength(1);
	});

	it("duas chamadas ao mesmo tempo com o mesmo título: uma cria e a outra recusa", async () => {
		const [a, b] = await Promise.all([criar("Igual", "primeira", "c1"), criar("Igual", "segunda", "c2")]);
		expect([a.isError, b.isError].filter(Boolean)).toHaveLength(1);
		expect(await criados()).toHaveLength(1);
		expect(criadas()).toHaveLength(1);
	});

	it("título inválido, com .. ou barra: recusa e nada é criado", async () => {
		for (const titulo of ["", "   ", "..", "../fora", "a/b", "a\\b", "CON", "x".repeat(121), ".escondida", "com [colchetes]"]) {
			const resultado = await criar(titulo, "texto");
			expect(resultado.isError, titulo).toBe(true);
		}
		expect(await readdir(pastaNotas(dados, materia)).catch(() => [])).toEqual([]);
		expect(await criados()).toHaveLength(0);
		expect(criadas()).toHaveLength(0);
	});

	it("conteúdo vazio, grande demais ou com HTML que o editor não conhece: recusa; no limite, cria", async () => {
		expect((await criar("Vazia", "  \n ")).isError).toBe(true);
		const grande = await criar("Grande", "a".repeat(100_001));
		expect(grande.isError).toBe(true);
		expect(grande.content[0]!.text).toContain("100000");
		expect((await criar("Com html", "<script>x</script>")).isError).toBe(true);
		expect(existe("Vazia") || existe("Grande") || existe("Com html")).toBe(false);
		expect(await criados()).toHaveLength(0);
		expect((await criar("No limite", "a".repeat(100_000))).isError).toBeUndefined();
		expect(existe("No limite")).toBe(true);
	});

	it("desfazer com o arquivo igual ao do hash: apaga, grava desfez_nota_do_professor e responde desfeita", async () => {
		await criar("Resumo", "# Resumo\n\ntexto");
		desfazer({ titulo: "resumo", pedido: "d1" });
		await esperar(() => recebidas("desfeita").length > 0);
		expect(recebidas("desfeita")[0]).toMatchObject({ painel: "notas", gravar: false, dados: { materia, titulo: "Resumo", pedido: "d1" } });
		expect(existe("Resumo")).toBe(false);
		const eventos = await desfeitos();
		expect(eventos).toHaveLength(1);
		expect(eventos[0]).toMatchObject({ sessao: "sessao-1", objeto: { materia, titulo: "Resumo" } });
		expect(recebidas("erro")).toHaveLength(0);
	});

	it("desfazer com a nota alterada depois de criada: recusa e não apaga nada", async () => {
		await criar("Resumo", "# Resumo\n\ntexto");
		const arquivo = arquivoNota(dados, materia, "Resumo");
		// Até um espaço a mais conta.
		await writeFile(arquivo, `${await readFile(arquivo, "utf8")} `, "utf8");
		desfazer({ titulo: "Resumo", pedido: "d1" });
		await esperar(() => recebidas("erro").length > 0);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "desfazer_nota", materia, titulo: "Resumo", pedido: "d1" });
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("alterada");
		expect(existe("Resumo")).toBe(true);
		expect(await desfeitos()).toHaveLength(0);
		expect(recebidas("desfeita")).toHaveLength(0);
	});

	it("desfazer uma nota que já não existe (apagada ou renomeada fora): erro claro, e nada é registrado", async () => {
		await criar("Resumo", "texto");
		await rm(arquivoNota(dados, materia, "Resumo"));
		desfazer({ titulo: "Resumo", pedido: "d1" });
		await esperar(() => recebidas("erro").length > 0);
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("não existe mais");
		expect(await desfeitos()).toHaveLength(0);
	});

	it("desfazer depois de já desfeita: erro; recriada com o mesmo título, a nova vale de novo (hash do último)", async () => {
		await criar("Resumo", "um");
		desfazer({ titulo: "Resumo", pedido: "d1" });
		await esperar(() => recebidas("desfeita").length === 1);
		desfazer({ titulo: "Resumo", pedido: "d2" });
		await esperar(() => recebidas("erro").length === 1);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "desfazer_nota", pedido: "d2" });
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("já foi desfeita");
		expect(await desfeitos()).toHaveLength(1);

		await criar("Resumo", "dois", "chamada-2");
		desfazer({ titulo: "Resumo", pedido: "d3" });
		await esperar(() => recebidas("desfeita").length === 2);
		expect(existe("Resumo")).toBe(false);
		expect(await criados()).toHaveLength(2);
		expect(await desfeitos()).toHaveLength(2);
	});

	it("depois de desfeita, uma nota do Breno com o mesmo título não é apagada pelo Desfazer antigo", async () => {
		await criar("Resumo", "um");
		desfazer({ titulo: "Resumo", pedido: "d1" });
		await esperar(() => recebidas("desfeita").length === 1);
		// O Breno cria a sua própria nota com o mesmo título.
		await criarNota(dados, materia, "Resumo");
		await writeFile(arquivoNota(dados, materia, "Resumo"), "minha\n", "utf8");
		desfazer({ titulo: "Resumo", pedido: "d2" });
		await esperar(() => recebidas("erro").length === 1);
		expect(await readFile(arquivoNota(dados, materia, "Resumo"), "utf8")).toBe("minha\n");
	});

	it("desfazer uma nota do Breno (sem criou_nota_do_professor): erro e a nota fica", async () => {
		await criarNota(dados, materia, "Minha");
		await writeFile(arquivoNota(dados, materia, "Minha"), "do Breno\n", "utf8");
		desfazer({ titulo: "Minha", pedido: "d1" });
		await esperar(() => recebidas("erro").length > 0);
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("não foi criada pelo professor");
		expect(await readFile(arquivoNota(dados, materia, "Minha"), "utf8")).toBe("do Breno\n");
	});

	it("desfazer com a sessão de outra conversa, sem sessão, com título ruim ou matéria ruim: erro e nada é apagado", async () => {
		await criar("Resumo", "texto");
		desfazer({ titulo: "Resumo", sessao: "outra-sessao", pedido: "d1" });
		desfazer({ titulo: "Resumo", sessao: undefined, pedido: "d2" });
		desfazer({ titulo: "../Resumo", pedido: "d3" });
		barramento.emit("interface:acao", { painel: "notas", acao: "desfazer_nota", dados: { materia: "../x", titulo: "Resumo", sessao: "sessao-1", pedido: "d4" } });
		await esperar(() => recebidas("erro").length === 4);
		expect(recebidas("erro").map((mensagem) => [mensagem.dados.ao, mensagem.dados.pedido])).toEqual([
			["desfazer_nota", "d1"],
			["desfazer_nota", "d2"],
			["desfazer_nota", "d3"],
			["desfazer_nota", "d4"],
		]);
		expect(String(recebidas("erro")[0]!.dados.mensagem)).toContain("outra conversa");
		expect(existe("Resumo")).toBe(true);
		expect(await desfeitos()).toHaveLength(0);
		expect(recebidas("desfeita")).toHaveLength(0);
	});

	it("listar_notas mostra [do professor] nas notas criadas por ele", async () => {
		await criarNota(dados, materia, "Do Breno");
		await criar("Do professor", "texto");
		const lista = await ferramentas.listar_notas!.execute("1", {}, undefined, undefined, ctx);
		expect(lista.content[0]!.text).toContain("- Do professor [do professor]");
		expect(lista.content[0]!.text).toMatch(/- Do Breno \(/);
	});
});
