// Testes da extensão dos planos de estudos sem o pi: um "pi" falso com um barramento síncrono (como o
// pi.events), o pi.on, o appendEntry e o registerTool, numa pasta de dados temporária com uma matéria.
// A tela é simulada mandando "interface:acao" no painel "planos".

import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerEventos } from "../lib/eventos.ts";
import { criarMateria, eventosMateria } from "../lib/materias.ts";
import { arquivoNota, criarNota } from "../lib/notas.ts";
import { ACAO_MUDOU_FORA, ACAO_PLANO_CRIADO, lerPlano, planoSeguido, TIPO_ENTRADA_PLANO, TIPO_MENSAGEM_PLANO } from "../lib/plano-tipos.ts";
import { idCurtoDaConversa } from "../lib/trecho-guardado.ts";
import planos from "./planos.ts";

type Resultado = { content: Array<{ text: string }>; details: unknown; isError?: boolean };
type Entrada = { type: string; customType?: string; data?: unknown };
type Contexto = { cwd: string; sessionManager: { getSessionId(): string; getBranch(): Entrada[] } };
type Ferramenta = { execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: Contexto): Promise<Resultado> };
type Mostrado = { painel: string; acao: string; dados: Record<string, unknown>; gravar?: boolean };
type RespostaAntes = { message?: { customType: string; content: string; display: boolean } } | undefined;

let dados = "";
let materia = "";
let barramento: EventEmitter;
let ferramentas: Record<string, Ferramenta>;
let aoIniciar: ((evento: unknown, ctx: Contexto) => void) | undefined;
let aoAgente: ((evento: unknown, ctx: Contexto) => Promise<RespostaAntes>) | undefined;
let mostrados: Mostrado[];
let entradas: Entrada[];
let ctx: Contexto;

const contextoDe = (chave: string): Entrada => ({ type: "custom", customType: "nucleo.contexto", data: { chave, rotulo: "x" } });

/** Monta o "pi" falso e carrega a extensão; devolve o pi (para carregar uma segunda cópia). */
function carregar(iniciar: boolean) {
	const pi = {
		events: {
			on: (canal: string, ouvinte: (dados: unknown) => void) => {
				barramento.on(canal, ouvinte);
				return () => barramento.off(canal, ouvinte);
			},
			emit: (canal: string, dadosEmitidos: unknown) => barramento.emit(canal, dadosEmitidos),
		},
		on: (evento: string, tratador: (evento: unknown, contexto: Contexto) => unknown) => {
			if (evento === "session_start") aoIniciar = tratador as typeof aoIniciar;
			if (evento === "before_agent_start") aoAgente = tratador as typeof aoAgente;
		},
		appendEntry: (customType: string, dadosEntrada: unknown) => entradas.push({ type: "custom", customType, data: dadosEntrada }),
		registerTool: (definicao: Ferramenta & { name: string }) => (ferramentas[definicao.name] = definicao),
	} as unknown as ExtensionAPI;
	planos(pi);
	if (iniciar) aoIniciar?.({}, ctx);
}

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-ext-planos-"));
	materia = (await criarMateria(dados, { nome: "Ciência de Dados" })).id;
	entradas = [contextoDe(`materia:${materia}`)];
	ctx = { cwd: dados, sessionManager: { getSessionId: () => "sessao-1", getBranch: () => entradas } };
	barramento = new EventEmitter();
	ferramentas = {};
	aoIniciar = undefined;
	aoAgente = undefined;
	mostrados = [];
	barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
	carregar(true);
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

/** Espera até `condicao` valer (os tratadores da ponte são assíncronos). */
async function esperar(condicao: () => boolean): Promise<void> {
	for (let tentativa = 0; tentativa < 200 && !condicao(); tentativa++) await new Promise((resolver) => setTimeout(resolver, 5));
	if (!condicao()) throw new Error("não aconteceu");
}

const acao = (nome: string, dadosAcao: Record<string, unknown>) => barramento.emit("interface:acao", { painel: "planos", acao: nome, dados: { materia, ...dadosAcao } });
const recebidas = (nome: string, painel = "planos") => mostrados.filter((mensagem) => mensagem.painel === painel && mensagem.acao === nome);
const eventos = async () => (await lerEventos(eventosMateria(dados, materia))).eventos;
const verbos = async () => (await eventos()).map((evento) => evento.verbo);
const lerArquivo = (titulo: string) => readFile(arquivoNota(dados, materia, titulo), "utf8");
const ferramenta = (nome: string, params: unknown, id = "chamada-1") => ferramentas[nome]!.execute(id, params, undefined, undefined, ctx);
const criar = (titulo = "Prova final", itens = ["Q1", "Q2", "Q3"]) => ferramenta("criar_plano", { titulo, objetivo: "prova de 26/11", itens });
const seguido = () => planoSeguido(entradas);
const hoje = () => {
	const agora = new Date();
	return `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;
};
/** Deixa terminar as listas que o criar_plano manda sozinho (void) antes de limpar o que foi mostrado. */
const assentar = () => new Promise((resolver) => setTimeout(resolver, 40));
const antesDoAgente = (evento: unknown = { messageType: "user", prompt: "oi" }) => aoAgente!(evento, ctx);

describe("criar_plano", () => {
	it("cria a nota, a conversa passa a seguir, grava os eventos e emite mudou_fora, plano_criado (gravar: true, com a chamada) e a lista", async () => {
		const resposta = await criar();
		expect(resposta.isError).toBeUndefined();
		expect(resposta.content[0]!.text).toContain('Plano "Prova final" criado');
		expect(resposta.content[0]!.text).toContain("Desfazer");
		const arquivo = await lerArquivo("Prova final");
		expect(lerPlano(arquivo)).toMatchObject({ total: 3, objetivo: "prova de 26/11" });
		expect(entradas.at(-1)).toEqual({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: "Prova final" } });
		expect(seguido()).toBe("Prova final");
		expect(await verbos()).toEqual(expect.arrayContaining(["criou_nota", "criou_plano", "seguiu_plano"]));
		expect((await eventos()).find((evento) => evento.verbo === "seguiu_plano")!.objeto).toEqual({ materia, titulo: "Prova final" });

		const cartao = recebidas(ACAO_PLANO_CRIADO, "mesa");
		expect(cartao).toEqual([
			{
				painel: "mesa",
				acao: "plano_criado",
				dados: { materia, titulo: "Prova final", rota: `caderno/${materia}/notas/Prova final`, chamada: "chamada-1", sessao: "sessao-1" },
				gravar: true,
			},
		]);
		const fora = recebidas(ACAO_MUDOU_FORA, "notas");
		expect(fora).toHaveLength(1);
		expect(fora[0]).toMatchObject({ gravar: false, dados: { materia, titulo: "Prova final", conteudo: arquivo } });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("lista")[0]!.dados).toEqual({ materia, sessao: "sessao-1", planos: [{ titulo: "Prova final", feitos: 0, total: 3, concluido: false }], seguindo: "Prova final" });
		expect(recebidas("lista")[0]!.gravar).toBe(false);
	});

	it("título que já existe, título ruim, sem itens ou fora de uma matéria: recusa e nada é criado nem emitido", async () => {
		await criar();
		await assentar();
		mostrados.length = 0;
		const antes = entradas.length;
		for (const params of [
			{ titulo: "prova FINAL", itens: ["a"] },
			{ titulo: "a/b", itens: ["a"] },
			{ titulo: "Vazio", itens: [] },
			{ titulo: "Html", itens: ["<script>"] },
		]) {
			const resposta = await ferramenta("criar_plano", params);
			expect(resposta.isError).toBe(true);
			expect(resposta.content[0]!.text).toContain("Nada foi criado");
		}
		expect(existsSync(arquivoNota(dados, materia, "Vazio"))).toBe(false);
		expect(existsSync(arquivoNota(dados, materia, "Html"))).toBe(false);
		expect(entradas).toHaveLength(antes);
		expect(mostrados).toEqual([]);
		entradas = [];
		const fora = await criar("Fora da matéria");
		expect(fora.isError).toBe(true);
		expect(fora.content[0]!.text).toContain("só funciona na conversa do caderno de uma matéria");
	});
});

describe("listar_planos e ler_plano", () => {
	it("listar mostra o progresso e qual a conversa segue; sem planos, diz que não há", async () => {
		expect((await ferramenta("listar_planos", {})).content[0]!.text).toContain("ainda não tem planos de estudos");
		await criar("Prova final", ["a", "b"]);
		await criar("Lab", ["x"]);
		entradas.push({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: "Prova final" } });
		const texto = (await ferramenta("listar_planos", {})).content[0]!.text;
		expect(texto).toContain("- Prova final: 0 de 2 itens [esta conversa segue este plano]");
		expect(texto).toContain("- Lab: 0 de 1 itens");
		expect(texto).not.toContain("- Lab: 0 de 1 itens [");
	});

	it("ler sem título lê o plano seguido, com o item atual; com título lê outro e diz que não segue", async () => {
		await criar("Prova final", ["a", "b"]);
		await criar("Lab", ["x"]);
		entradas.push({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: "Prova final" } });
		await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] });
		const seguindo = (await ferramenta("ler_plano", {})).content[0]!.text;
		expect(seguindo).toContain('Plano "Prova final": 1 de 2 itens feitos.');
		expect(seguindo).toContain("1. [x] a\n2. [ ] b   <- item atual");
		expect(seguindo).toContain("Esta conversa segue este plano.");
		const outro = (await ferramenta("ler_plano", { titulo: "lab" })).content[0]!.text;
		expect(outro).toContain('Plano "Lab"');
		expect(outro).toContain("Esta conversa não segue este plano.");
	});

	it("sem plano seguido e sem título: erro; nota sem tag ou que não existe: erro", async () => {
		entradas.push({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: null } });
		expect((await ferramenta("ler_plano", {})).isError).toBe(true);
		await criarNota(dados, materia, "Comum");
		const semTag = await ferramenta("ler_plano", { titulo: "Comum" });
		expect(semTag.isError).toBe(true);
		expect(semTag.content[0]!.text).toContain("não é um plano de estudos");
		expect((await ferramenta("ler_plano", { titulo: "Nada" })).isError).toBe(true);
	});

	it("fora de uma matéria, as duas recusam", async () => {
		entradas = [];
		expect((await ferramenta("listar_planos", {})).isError).toBe(true);
		expect((await ferramenta("ler_plano", { titulo: "x" })).isError).toBe(true);
	});
});

describe("atualizar_plano", () => {
	it("marca, acrescenta, devolve o plano como ficou, avisa o editor e manda a lista", async () => {
		await criar("Prova final", ["a", "b"]);
		await assentar();
		mostrados.length = 0;
		const resposta = await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1, texto: "a" }, { tipo: "acrescentar", texto: "c", depois: 1 }] });
		expect(resposta.isError).toBeUndefined();
		expect(resposta.content[0]!.text).toContain("Plano atualizado.");
		expect(resposta.content[0]!.text).toContain("1. [x] a\n2. [ ] c   <- item atual\n3. [ ] b");
		const arquivo = await lerArquivo("Prova final");
		expect(lerPlano(arquivo)!.itens.map((item) => [item.texto, item.feito])).toEqual([["a", true], ["c", false], ["b", false]]);
		expect(recebidas(ACAO_MUDOU_FORA, "notas")[0]).toMatchObject({ gravar: false, dados: { materia, titulo: "Prova final", conteudo: arquivo } });
		await esperar(() => recebidas("lista").length > 0);
		expect((recebidas("lista")[0]!.dados as { planos: Array<{ feitos: number }> }).planos[0]!.feitos).toBe(1);
		expect((await eventos()).filter((evento) => evento.verbo === "atualizou_plano")).toHaveLength(1);
	});

	it("várias chamadas ao mesmo tempo entram na fila da nota e nenhuma se perde", async () => {
		await criar("Prova final", ["a", "b", "c", "d"]);
		await Promise.all([1, 2, 3, 4].map((item) => ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item }] })));
		expect(lerPlano(await lerArquivo("Prova final"))).toMatchObject({ feitos: 4, concluido: true });
	});

	it("item que não existe, texto que não bate, operação incompleta, sem plano seguido e fora da matéria: erro e nada muda", async () => {
		await criar("Prova final", ["a", "b"]);
		const antes = await lerArquivo("Prova final");
		await assentar();
		mostrados.length = 0;
		const ruins = [
			{ operacoes: [{ tipo: "marcar", item: 5 }] },
			{ operacoes: [{ tipo: "marcar", item: 1, texto: "zzz" }] },
			{ operacoes: [{ tipo: "marcar" }] },
			{ operacoes: [{ tipo: "acrescentar" }] },
			{ operacoes: [] },
		];
		for (const params of ruins) {
			const resposta = await ferramenta("atualizar_plano", params);
			expect(resposta.isError).toBe(true);
		}
		expect(await lerArquivo("Prova final")).toBe(antes);
		expect(mostrados.filter((mensagem) => mensagem.acao === ACAO_MUDOU_FORA)).toEqual([]);
		entradas.push({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: null } });
		expect((await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] })).content[0]!.text).toContain("não segue nenhum plano");
		entradas = [];
		expect((await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] })).isError).toBe(true);
	});

	it("o plano seguido que perdeu a tag ou foi apagado: erro, e a nota do Breno fica como está", async () => {
		await criar("Prova final", ["a"]);
		await writeFile(arquivoNota(dados, materia, "Prova final"), "- [ ] a\n", "utf8");
		const semTag = await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] });
		expect(semTag.isError).toBe(true);
		expect(semTag.content[0]!.text).toContain("não é um plano de estudos");
		expect(await lerArquivo("Prova final")).toBe("- [ ] a\n");
		await rm(arquivoNota(dados, materia, "Prova final"));
		expect((await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] })).isError).toBe(true);
	});

	it("operação que não muda nada não grava nem avisa", async () => {
		await criar("Prova final", ["a"]);
		await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] });
		await assentar();
		mostrados.length = 0;
		const resposta = await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] });
		expect(resposta.content[0]!.text).toContain("Nada mudou");
		expect(mostrados.filter((mensagem) => mensagem.acao === ACAO_MUDOU_FORA)).toEqual([]);
	});
});

describe("o resumo no before_agent_start", () => {
	it("em execução do Breno e com plano: devolve a mensagem escondida com o resumo", async () => {
		await criar("Prova final", ["a", "b"]);
		await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] });
		const resposta = await antesDoAgente();
		expect(resposta!.message).toMatchObject({ customType: TIPO_MENSAGEM_PLANO, display: false });
		const conteudo = resposta!.message!.content;
		expect(conteudo).toContain('Esta conversa segue o plano de estudos "Prova final"');
		expect(conteudo).toContain("1. [x] a\n2. [ ] b (atual)");
		expect(conteudo.length).toBeLessThanOrEqual(2000);
	});

	it("não vai em execução que não é do usuário, sem plano seguido, com null, com o plano apagado ou sem a tag", async () => {
		await criar("Prova final", ["a"]);
		expect(await antesDoAgente({ messageType: "custom" })).toBeUndefined();
		entradas.push({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: null } });
		expect(await antesDoAgente()).toBeUndefined();
		entradas.push({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: "Prova final" } });
		expect(await antesDoAgente()).toBeDefined();
		await writeFile(arquivoNota(dados, materia, "Prova final"), "- [ ] a\n", "utf8");
		expect(await antesDoAgente()).toBeUndefined();
		await rm(arquivoNota(dados, materia, "Prova final"));
		expect(await antesDoAgente()).toBeUndefined();
		entradas = [];
		expect(await antesDoAgente()).toBeUndefined();
	});

	it("uma conversa que ainda não está no histórico entra uma vez, com a data local, ligou_plano e mudou_fora", async () => {
		await criar("Prova final", ["a"]);
		// Outra conversa passa a seguir o plano.
		const outra: Contexto = { cwd: dados, sessionManager: { getSessionId: () => "sessao-2", getBranch: () => entradas } };
		await assentar();
		mostrados.length = 0;
		await aoAgente!({ messageType: "user", prompt: "oi" }, outra);
		const arquivo = await lerArquivo("Prova final");
		expect(arquivo).toContain(`- [${hoje()}](conversa:${idCurtoDaConversa("sessao-2")})`);
		expect(lerPlano(arquivo)!.conversas).toEqual([idCurtoDaConversa("sessao-1"), idCurtoDaConversa("sessao-2")]);
		expect(recebidas(ACAO_MUDOU_FORA, "notas")).toHaveLength(1);
		expect((await eventos()).filter((evento) => evento.verbo === "ligou_plano")).toHaveLength(1);
		await aoAgente!({ messageType: "user", prompt: "de novo" }, outra);
		expect(await lerArquivo("Prova final")).toBe(arquivo);
		expect((await eventos()).filter((evento) => evento.verbo === "ligou_plano")).toHaveLength(1);
		expect(recebidas(ACAO_MUDOU_FORA, "notas")).toHaveLength(1);
	});

	it("a conversa que criou o plano já está no histórico: não grava de novo", async () => {
		await criar("Prova final", ["a"]);
		const antes = await lerArquivo("Prova final");
		await antesDoAgente();
		expect(await lerArquivo("Prova final")).toBe(antes);
		expect((await eventos()).filter((evento) => evento.verbo === "ligou_plano")).toHaveLength(0);
	});
});

describe("ponte dos planos", () => {
	it("ignora outros painéis; listar responde a lista, passageira, com a sessão e o plano seguido", async () => {
		await criar("Prova final", ["a", "b"]);
		await criar("Lab", ["x"]);
		await assentar();
		mostrados.length = 0;
		barramento.emit("interface:acao", { painel: "notas", acao: "listar", dados: { materia } });
		acao("listar", {});
		await esperar(() => recebidas("lista").length > 0);
		expect(mostrados).toHaveLength(1);
		const lista = mostrados[0]!;
		expect(lista).toMatchObject({ painel: "planos", acao: "lista", gravar: false });
		expect(lista.dados).toMatchObject({ materia, sessao: "sessao-1", seguindo: "Lab" });
		expect((lista.dados.planos as Array<{ titulo: string }>).map((plano) => plano.titulo).sort()).toEqual(["Lab", "Prova final"]);
	});

	it("seguir: grava a entrada e o evento, responde seguindo com o pedido e manda a lista; null solta", async () => {
		await criar("Prova final", ["a"]);
		await criar("Lab", ["x"]);
		await assentar();
		mostrados.length = 0;
		acao("seguir", { titulo: "prova final", sessao: "sessao-1", pedido: "p1" });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("seguindo")[0]).toMatchObject({ gravar: false, dados: { materia, sessao: "sessao-1", pedido: "p1", titulo: "Prova final" } });
		expect(seguido()).toBe("Prova final");
		expect((recebidas("lista")[0]!.dados as { seguindo: string }).seguindo).toBe("Prova final");
		const eventosSeguiu = (await eventos()).filter((evento) => evento.verbo === "seguiu_plano");
		expect(eventosSeguiu.at(-1)!.objeto).toEqual({ materia, titulo: "Prova final" });

		await assentar();
		mostrados.length = 0;
		acao("seguir", { titulo: null, sessao: "sessao-1", pedido: "p2" });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("seguindo")[0]!.dados).toMatchObject({ pedido: "p2", titulo: null });
		expect(seguido()).toBeUndefined();
		expect((recebidas("lista")[0]!.dados as { seguindo: string | null }).seguindo).toBeNull();
		expect((await eventos()).filter((evento) => evento.verbo === "seguiu_plano").at(-1)!.objeto).toEqual({ materia, titulo: null });
	});

	it("seguir com a sessão de outra conversa, matéria errada, nota sem tag ou que não existe: erro com o pedido e nada muda", async () => {
		await criar("Prova final", ["a"]);
		await criarNota(dados, materia, "Comum");
		const antes = entradas.length;
		await assentar();
		mostrados.length = 0;
		acao("seguir", { titulo: "Prova final", sessao: "outra", pedido: "p1" });
		acao("seguir", { titulo: "Prova final", sessao: "sessao-1", pedido: "p2", materia: "outra-materia" });
		acao("seguir", { titulo: "Comum", sessao: "sessao-1", pedido: "p3" });
		acao("seguir", { titulo: "Nada", sessao: "sessao-1", pedido: "p4" });
		await esperar(() => recebidas("erro").length === 4);
		expect(recebidas("erro").map((mensagem) => mensagem.dados.pedido).sort()).toEqual(["p1", "p2", "p3", "p4"]);
		expect(recebidas("erro")[0]!.dados).toMatchObject({ ao: "seguir", materia, mensagem: expect.stringContaining("outra conversa") });
		expect(entradas).toHaveLength(antes);
		expect(recebidas("seguindo")).toEqual([]);
	});

	it("desfazer_plano: apaga, solta a conversa, grava desfez_plano, responde desfeito e manda a lista", async () => {
		await criar("Prova final", ["a"]);
		await assentar();
		mostrados.length = 0;
		acao("desfazer_plano", { titulo: "Prova final", sessao: "sessao-1", pedido: "p1" });
		await esperar(() => recebidas("lista").length > 0);
		expect(recebidas("desfeito")[0]).toMatchObject({ gravar: false, dados: { materia, titulo: "Prova final", pedido: "p1" } });
		expect(existsSync(arquivoNota(dados, materia, "Prova final"))).toBe(false);
		expect(entradas.at(-1)).toEqual({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: null } });
		expect(seguido()).toBeUndefined();
		expect(await verbos()).toContain("desfez_plano");
		expect((recebidas("lista")[0]!.dados as { planos: unknown[] }).planos).toEqual([]);
	});

	it("desfazer_plano de um plano que esta conversa não segue deixa a conversa como está", async () => {
		await criar("Lab", ["x"]);
		await criar("Prova final", ["a"]);
		await assentar();
		mostrados.length = 0;
		acao("desfazer_plano", { titulo: "Lab", sessao: "sessao-1", pedido: "p1" });
		await esperar(() => recebidas("desfeito").length > 0);
		expect(seguido()).toBe("Prova final");
	});

	it("desfazer_plano com o plano alterado, sessão de outra conversa, título ruim ou sem criou_plano: erro e nada é apagado", async () => {
		await criar("Prova final", ["a"]);
		await ferramenta("atualizar_plano", { operacoes: [{ tipo: "marcar", item: 1 }] });
		await criarNota(dados, materia, "Do Breno");
		await assentar();
		mostrados.length = 0;
		acao("desfazer_plano", { titulo: "Prova final", sessao: "sessao-1", pedido: "p1" });
		acao("desfazer_plano", { titulo: "Prova final", sessao: "outra", pedido: "p2" });
		acao("desfazer_plano", { titulo: "a/b", sessao: "sessao-1", pedido: "p3" });
		acao("desfazer_plano", { titulo: "Do Breno", sessao: "sessao-1", pedido: "p4" });
		await esperar(() => recebidas("erro").length === 4);
		expect(recebidas("erro").map((mensagem) => mensagem.dados.pedido).sort()).toEqual(["p1", "p2", "p3", "p4"]);
		expect(recebidas("erro").every((mensagem) => mensagem.dados.ao === "desfazer_plano")).toBe(true);
		expect(recebidas("erro").find((mensagem) => mensagem.dados.pedido === "p1")!.dados.mensagem).toContain("alterado depois de criado");
		expect(existsSync(arquivoNota(dados, materia, "Prova final"))).toBe(true);
		expect(existsSync(arquivoNota(dados, materia, "Do Breno"))).toBe(true);
		expect(recebidas("desfeito")).toEqual([]);
		expect(seguido()).toBe("Prova final");
	});

	it("uma cópia sem sessão no mesmo barramento (a carga a mais ao recarregar) fica calada", async () => {
		const antes = mostrados.length;
		carregar(false);
		acao("listar", {});
		await esperar(() => recebidas("lista").length > 0);
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados.length - antes).toBe(1);
		expect(recebidas("lista")).toHaveLength(1);
	});

	it("sem session_start nada responde e o before_agent_start não devolve nada", async () => {
		// Recria tudo sem iniciar a sessão.
		barramento.removeAllListeners();
		mostrados = [];
		barramento.on("interface:mostrar", (mensagem: Mostrado) => mostrados.push(mensagem));
		carregar(false);
		acao("listar", {});
		acao("seguir", { titulo: null, sessao: "sessao-1", pedido: "p1" });
		barramento.emit("notas:renomeada", { materia, de: "a", para: "b" });
		await new Promise((resolver) => setTimeout(resolver, 30));
		expect(mostrados).toEqual([]);
		expect(await antesDoAgente()).toBeUndefined();
	});
});

describe("notas:renomeada", () => {
	it("se a conversa segue a nota renomeada, a entrada passa para o título novo, com o evento e a lista", async () => {
		await criar("Prova final", ["a"]);
		await assentar();
		mostrados.length = 0;
		barramento.emit("notas:renomeada", { materia, de: "prova FINAL", para: "Prova da P2" });
		expect(entradas.at(-1)).toEqual({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: "Prova da P2" } });
		expect(seguido()).toBe("Prova da P2");
		await esperar(() => recebidas("lista").length > 0);
		expect((await eventos()).filter((evento) => evento.verbo === "seguiu_plano").at(-1)!.objeto).toEqual({ materia, titulo: "Prova da P2" });
	});

	it("outra nota, outra matéria, conversa sem plano ou dados incompletos: nada muda", async () => {
		await criar("Prova final", ["a"]);
		const antes = entradas.length;
		barramento.emit("notas:renomeada", { materia, de: "Outra", para: "Nova" });
		barramento.emit("notas:renomeada", { materia: "outra", de: "Prova final", para: "Nova" });
		barramento.emit("notas:renomeada", { materia });
		barramento.emit("notas:renomeada", undefined);
		expect(entradas).toHaveLength(antes);
		entradas.push({ type: "custom", customType: TIPO_ENTRADA_PLANO, data: { titulo: null } });
		const depois = entradas.length;
		barramento.emit("notas:renomeada", { materia, de: "Prova final", para: "Nova" });
		expect(entradas).toHaveLength(depois);
	});
});
