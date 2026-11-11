// "Ir ao trecho" e "Guardar na nota": as decisões puras (guardar-na-nota.ts).

import type { AcaoRecebida, ItemConversa } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import { formatarTrechoGuardado } from "../../lib/trecho-guardado.ts";
import { formatarOrigem } from "./origem-mesa.ts";
import {
	alvoDoIrAoTrecho,
	avisoDaRecusa,
	chaveDaNota,
	enviarComRetentativa,
	esperarAcao,
	notaDaAba,
	respostaDoCriar,
	respostaDoPedido,
	ultimaRespostaDoTurno,
} from "./guardar-na-nota.ts";

type Usuario = Extract<ItemConversa, { tipo: "usuario" }>;

const u = (chave: string, extra: Partial<Usuario> = {}): ItemConversa => ({ tipo: "usuario", chave, texto: "pergunta", ...extra });
const a = (chave: string, texto = "resposta", extra: Partial<Extract<ItemConversa, { tipo: "assistente" }>> = {}): ItemConversa => ({
	tipo: "assistente",
	chave,
	texto,
	raciocinio: "",
	emAndamento: false,
	...extra,
});
const f = (chave: string): ItemConversa => ({ tipo: "ferramenta", chave, chamada: { id: chave, nome: "ler_nota", argumentos: {}, status: "ok" } });

describe("qual resposta recebe o rodapé", () => {
	it("só a última de assistente do turno (um turno com ferramentas tem várias)", () => {
		const conversa = [u("u1"), a("r1", "vou olhar"), f("f1"), a("r2", "olhei"), f("f2"), a("r3", "pronto"), u("u2"), a("r4", "outra")];
		const recebem = conversa.filter((item) => item.tipo === "assistente" && ultimaRespostaDoTurno(conversa, item.chave, false)).map((item) => item.chave);
		expect(recebem).toEqual(["r3", "r4"]);
	});

	it("uma mensagem do assistente que só chamou ferramentas (sem texto) não conta como a última", () => {
		const conversa = [u("u1"), a("r1", "texto final"), a("r2", "", {}), f("f1")];
		expect(ultimaRespostaDoTurno(conversa, "r1", false)).toBe(true);
		expect(ultimaRespostaDoTurno(conversa, "r2", false)).toBe(true);
	});

	it("uma resposta com só raciocínio ou só erro conta como resposta", () => {
		expect(ultimaRespostaDoTurno([u("u1"), a("r1", "texto"), a("r2", "", { erro: "falhou" })], "r1", false)).toBe(false);
		expect(ultimaRespostaDoTurno([u("u1"), a("r1", "texto"), a("r2", "", { raciocinio: "pensei" })], "r1", false)).toBe(false);
	});

	it("no turno em andamento ninguém recebe; num turno antigo, sim", () => {
		const conversa = [u("u1"), a("r1"), u("u2"), a("r2")];
		expect(ultimaRespostaDoTurno(conversa, "r2", true)).toBe(false);
		expect(ultimaRespostaDoTurno(conversa, "r1", true)).toBe(true);
	});

	it("resposta em andamento, chave que não existe e item que não é resposta: não", () => {
		expect(ultimaRespostaDoTurno([u("u1"), a("r1", "…", { emAndamento: true })], "r1", false)).toBe(false);
		expect(ultimaRespostaDoTurno([u("u1"), a("r1")], "nao-existe", false)).toBe(false);
		expect(ultimaRespostaDoTurno([u("u1"), a("r1")], "u1", false)).toBe(false);
	});
});

describe("para onde o Ir ao trecho leva", () => {
	const contexto = (extra: Record<string, unknown> = {}) => ({ tipo: "nota" as const, rotulo: "Séries", origem: "caderno/calc/notas/Séries", olho: true, foco: true, ...extra });
	const pergunta = (...contextos: ReturnType<typeof contexto>[]) => u("u1", { contextosTela: contextos }) as Usuario;

	it("a origem do contexto em foco e o trecho citado", () => {
		const origem = formatarOrigem("caderno/calc/notas/Séries", { bloco: "Convergência", antes: "A série ", depois: " converge" });
		expect(alvoDoIrAoTrecho(pergunta(contexto({ origem, selecao: "geométrica" })), "calc")).toEqual({ origem, trecho: "geométrica" });
	});

	it("sem trecho citado mas com bloco na âncora, vale (vai ao bloco)", () => {
		const origem = formatarOrigem("caderno/calc/notas/Séries", { bloco: "Convergência" });
		expect(alvoDoIrAoTrecho(pergunta(contexto({ origem })), "calc")).toEqual({ origem });
	});

	it("sem trecho nem bloco (só a aba aberta), não há a que voltar", () => {
		expect(alvoDoIrAoTrecho(pergunta(contexto()), "calc")).toBeUndefined();
	});

	it("sem contexto em foco, sem contextosTela ou sem pergunta: nada", () => {
		expect(alvoDoIrAoTrecho(pergunta(contexto({ foco: undefined, selecao: "x" })), "calc")).toBeUndefined();
		expect(alvoDoIrAoTrecho(u("u1") as Usuario, "calc")).toBeUndefined();
		expect(alvoDoIrAoTrecho(undefined, "calc")).toBeUndefined();
	});

	it("o contexto em foco é o que vale, mesmo com outros antes dele", () => {
		const outro = contexto({ foco: undefined, origem: "caderno/calc/notas/Outra", selecao: "de outra aba" });
		const certo = contexto({ selecao: "trecho certo" });
		expect(alvoDoIrAoTrecho(pergunta(outro, certo), "calc")?.trecho).toBe("trecho certo");
	});

	it("uma origem de outra matéria, ou que não é aba (painel do caderno), não leva a lugar nenhum", () => {
		expect(alvoDoIrAoTrecho(pergunta(contexto({ origem: "caderno/fis/notas/Séries", selecao: "x" })), "calc")).toBeUndefined();
		expect(alvoDoIrAoTrecho(pergunta(contexto({ origem: "caderno/calc/notas", selecao: "x" })), "calc")).toBeUndefined();
		expect(alvoDoIrAoTrecho(pergunta(contexto({ origem: undefined, selecao: "x" })), "calc")).toBeUndefined();
	});

	it("uma lição também serve (origem com a lição e âncora)", () => {
		const origem = formatarOrigem("caderno/calc/cursos/c1/modulos/m1/2", { bloco: "b7", versao: 3 });
		expect(alvoDoIrAoTrecho(pergunta(contexto({ tipo: "licao", origem, selecao: "razão" })), "calc")).toEqual({ origem, trecho: "razão" });
	});
});

describe("a nota-alvo", () => {
	it("a nota em foco desta matéria, com o título (que pode ter barras? não: o título vem inteiro da rota)", () => {
		expect(notaDaAba("caderno/calc/notas/Séries", "calc")).toEqual({ titulo: "Séries", chave: "caderno/calc/notas/Séries" });
	});

	it("lição, outra matéria, rota que não é aba ou sem foco: não é uma nota", () => {
		expect(notaDaAba("caderno/calc/cursos/c1/modulos/m1", "calc")).toBeUndefined();
		expect(notaDaAba("caderno/fis/notas/Séries", "calc")).toBeUndefined();
		expect(notaDaAba("caderno/calc/notas", "calc")).toBeUndefined();
		expect(notaDaAba(undefined, "calc")).toBeUndefined();
	});

	it("a chave da nota é a rota da aba", () => {
		expect(chaveDaNota("calc", "Séries")).toBe("caderno/calc/notas/Séries");
	});
});

describe("os avisos", () => {
	it("cada recusa do editor tem seu aviso", () => {
		expect(avisoDaRecusa("conflito")).toMatch(/conflito/);
		expect(avisoDaRecusa("somente-leitura")).toMatch(/só para leitura/);
		expect(avisoDaRecusa("salvando")).toMatch(/salvando.*instantes/);
		expect(avisoDaRecusa("sem-nota")).toMatch(/abrindo.*instantes/);
		expect(avisoDaRecusa("vazio")).toMatch(/nada para guardar/);
	});
});

describe("o texto que entra na nota", () => {
	const em = new Date(2026, 10, 11, 15, 30);
	const sessao = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";

	it("a fonte do bloco vira citação com acentos, dinheiro e a linha da fonte, sem mexer no que o professor escreveu", () => {
		const texto = formatarTrechoGuardado({ texto: "A série converge: custa R$ 20 e US$ 0,03.", em, sessao });
		expect(texto).toBe(["> A série converge: custa R$ 20 e US$ 0,03.", ">", "> — Professor, conversa de 11/11/2026", "<!-- conversa:e119b2a5 -->"].join("\n"));
	});

	it("fórmula em bloco, lista, tabela e código: toda linha ganha o '> '", () => {
		const formula = formatarTrechoGuardado({ texto: "$$\nx^2\n$$", em, sessao });
		expect(formula.split("\n").slice(0, 3)).toEqual(["> $$", "> x^2", "> $$"]);
		const lista = formatarTrechoGuardado({ texto: "- a\n- b\n  - c", em, sessao });
		expect(lista.split("\n").slice(0, 3)).toEqual(["> - a", "> - b", ">   - c"]);
		const tabela = formatarTrechoGuardado({ texto: "| a | b |\n| - | - |\n| 1 | 2 |", em, sessao });
		expect(tabela.split("\n").slice(0, 3)).toEqual(["> | a | b |", "> | - | - |", "> | 1 | 2 |"]);
		const codigo = formatarTrechoGuardado({ texto: "```py\nprint(1)\n\nprint(2)\n```", em, sessao });
		expect(codigo.split("\n").slice(0, 5)).toEqual(["> ```py", "> print(1)", ">", "> print(2)", "> ```"]);
	});

	it("termina com o comentário que liga a conversa e nunca com linha em branco sobrando", () => {
		const texto = formatarTrechoGuardado({ texto: "\n\nUm parágrafo.\n\n", em, sessao });
		expect(texto.endsWith("<!-- conversa:e119b2a5 -->")).toBe(true);
		expect(texto.startsWith("> Um parágrafo.")).toBe(true);
	});
});

describe("a resposta da ponte", () => {
	const acao = (chave: string, nome: string, dados: Record<string, unknown>): AcaoRecebida => ({ chave, acao: nome, dados });

	it("guardada com o mesmo pedido: ok; erro com o mesmo pedido: a mensagem", () => {
		const vistas = new Set(["i1"]);
		const ok = [acao("i1", "guardada", { pedido: "p1", materia: "calc", titulo: "A" }), acao("i2", "guardada", { pedido: "p1", materia: "calc", titulo: "Séries" })];
		expect(respostaDoPedido(ok, vistas, "p1")).toEqual({ ok: true, materia: "calc", titulo: "Séries" });
		const falha = [acao("i3", "erro", { pedido: "p1", ao: "guardar", mensagem: "A nota mudou. Nada foi guardado." })];
		expect(respostaDoPedido(falha, vistas, "p1")).toEqual({ ok: false, mensagem: "A nota mudou. Nada foi guardado." });
	});

	it("resposta de outro pedido, ou antiga (já vista), é ignorada", () => {
		const recebidas = [acao("i1", "guardada", { pedido: "p1", materia: "calc", titulo: "A" }), acao("i2", "guardada", { pedido: "p2", materia: "calc", titulo: "B" })];
		expect(respostaDoPedido(recebidas, new Set(["i1"]), "p1")).toBeUndefined();
		expect(respostaDoPedido(recebidas, new Set(), "p3")).toBeUndefined();
	});

	it("criar: criada com o título (sem diferença de caixa) ou erro ao criar", () => {
		const vistas = new Set<string>();
		expect(respostaDoCriar([acao("i1", "criada", { materia: "calc", titulo: "séries" })], vistas, "calc", "Séries")).toEqual({ ok: true, titulo: "séries" });
		expect(respostaDoCriar([acao("i1", "erro", { materia: "calc", titulo: "Séries", ao: "criar", mensagem: "Já existe." })], vistas, "calc", "Séries")).toEqual({ ok: false, mensagem: "Já existe." });
		expect(respostaDoCriar([acao("i1", "criada", { materia: "fis", titulo: "Séries" })], vistas, "calc", "Séries")).toBeUndefined();
		expect(respostaDoCriar([acao("i1", "criada", { materia: "calc", titulo: "Outra" })], vistas, "calc", "Séries")).toBeUndefined();
	});

	it("esperarAcao devolve quando a ação chega e desiste no prazo", async () => {
		const lista: AcaoRecebida[] = [];
		setTimeout(() => lista.push(acao("i1", "guardada", { pedido: "p", materia: "m", titulo: "t" })), 30);
		const achada = await esperarAcao(() => lista, (recebidas) => respostaDoPedido(recebidas, new Set(), "p"), 1000, 5);
		expect(achada).toEqual({ ok: true, materia: "m", titulo: "t" });
		expect(await esperarAcao(() => [], () => undefined, 40, 5)).toBeUndefined();
	});
});

describe("tentar de novo uma vez", () => {
	it("o primeiro envio lança (troca de sessão) e o segundo passa: sem erro", async () => {
		let chamadas = 0;
		await enviarComRetentativa(async () => {
			chamadas++;
			if (chamadas === 1) throw new Error("trocando de sessão");
		}, 1);
		expect(chamadas).toBe(2);
	});

	it("se o segundo também lança, o erro sobe", async () => {
		let chamadas = 0;
		await expect(
			enviarComRetentativa(async () => {
				chamadas++;
				throw new Error("sem conexão");
			}, 1),
		).rejects.toThrow("sem conexão");
		expect(chamadas).toBe(2);
	});

	it("sem erro, manda uma vez só", async () => {
		let chamadas = 0;
		await enviarComRetentativa(async () => {
			chamadas++;
		}, 1);
		expect(chamadas).toBe(1);
	});
});
