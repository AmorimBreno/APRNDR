// @vitest-environment happy-dom
// O cartão "Nota criada" (parte D, WP2; docs/mesa-parte-d.md, seção 2): as decisões puras de nota-criada.ts e o
// que o link `conversa:` (conversa-link.ts) precisa para achar a sessão pelo id curto.

import type { AcaoRecebida, ItemConversa } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import { idCurtoAntigoDaConversa, idCurtoDaConversa } from "../../lib/trecho-guardado.ts";
import { AVISO_CONVERSA_SUMIU, idDoLinkDeConversa, sessaoPorIdCurto } from "./conversa-link.ts";
import { cartoesDoTurno, chamadasDoTurno, estadoDoCartao, foiDesfeita, haNotaCriada, lerNotaCriada, ordemDaChave, respostaDoDesfazer, sumiuDaLista, textoDoCartao } from "./nota-criada.ts";

const MATERIA = "calc";
const usuario = (chave: string): ItemConversa => ({ tipo: "usuario", chave, texto: "faça uma nota" });
const resposta = (chave: string, texto = "ok"): ItemConversa => ({ tipo: "assistente", chave, texto, raciocinio: "", emAndamento: false });
const ferramenta = (chave: string, id: string): ItemConversa => ({ tipo: "ferramenta", chave, chamada: { id, nome: "criar_nota", argumentos: {}, status: "ok" } });
const notaCriada = (chave: string, chamada: string, titulo = "Séries", extra: Record<string, unknown> = {}): AcaoRecebida => ({
	chave,
	acao: "nota_criada",
	dados: { materia: MATERIA, titulo, rota: `caderno/${MATERIA}/notas/${titulo}`, chamada, sessao: "s1", ...extra },
});
const lista = (chave: string, titulos: string[], materia = MATERIA): AcaoRecebida => ({
	chave,
	acao: "lista",
	dados: { materia, notas: titulos.map((titulo) => ({ titulo, modificadaEm: "2026-11-11T10:00:00.000Z", tamanho: 10, previa: "", doProfessor: false })) },
});
const desfeita = (chave: string, titulo = "Séries", materia = MATERIA): AcaoRecebida => ({ chave, acao: "desfeita", dados: { materia, titulo, pedido: "p" } });

// Dois turnos: o primeiro chamou criar_nota (call-1) e terminou em hr1; o segundo chamou outra ferramenta e terminou em hr3.
const CONVERSA: ItemConversa[] = [
	usuario("hu1"),
	resposta("hr0", "Vou criar a nota."),
	ferramenta("hf1", "call-1"),
	resposta("hr1", "Pronto, criei a nota Séries."),
	usuario("hu2"),
	ferramenta("hf2", "call-2"),
	resposta("hr3", "Outra resposta."),
];

describe("a ligação entre o rodapé e o cartão pelo `chamada`", () => {
	it("as chamadas do turno vão da mensagem do usuário à próxima", () => {
		expect([...chamadasDoTurno(CONVERSA, "hr1")]).toEqual(["call-1"]);
		expect([...chamadasDoTurno(CONVERSA, "hr0")]).toEqual(["call-1"]);
		expect([...chamadasDoTurno(CONVERSA, "hr3")]).toEqual(["call-2"]);
		expect(chamadasDoTurno(CONVERSA, "nao-existe").size).toBe(0);
	});

	it("o cartão vai só na resposta do turno que chamou a ferramenta", () => {
		const acoes = [notaCriada("hm1", "call-1")];
		expect(cartoesDoTurno(CONVERSA, "hr1", acoes, MATERIA).map((cartao) => cartao.titulo)).toEqual(["Séries"]);
		expect(cartoesDoTurno(CONVERSA, "hr3", acoes, MATERIA)).toEqual([]);
	});

	it("uma ação sem chamada de ferramenta no turno (id diferente) não vira cartão", () => {
		expect(cartoesDoTurno(CONVERSA, "hr1", [notaCriada("hm1", "call-99")], MATERIA)).toEqual([]);
	});

	it("uma ação por chamada: duas notas no mesmo turno são dois cartões, e a mesma chamada repetida conta uma vez", () => {
		const conversa: ItemConversa[] = [usuario("u"), ferramenta("f1", "a"), ferramenta("f2", "b"), resposta("r")];
		const acoes = [notaCriada("hm1", "a", "Um"), notaCriada("hm2", "b", "Dois"), notaCriada("hm3", "a", "Um")];
		expect(cartoesDoTurno(conversa, "r", acoes, MATERIA).map((cartao) => cartao.titulo)).toEqual(["Um", "Dois"]);
	});

	it("só notas desta matéria, e ação malformada é ignorada", () => {
		const conversa: ItemConversa[] = [usuario("u"), ferramenta("f1", "a"), resposta("r")];
		expect(cartoesDoTurno(conversa, "r", [notaCriada("hm1", "a", "Séries", { materia: "fisica" })], MATERIA)).toEqual([]);
		expect(cartoesDoTurno(conversa, "r", [{ chave: "hm1", acao: "nota_criada", dados: { materia: MATERIA, titulo: "X" } }], MATERIA)).toEqual([]);
		expect(lerNotaCriada({ chave: "hm1", acao: "comando", dados: {} })).toBeUndefined();
		expect(cartoesDoTurno(conversa, "r", undefined, MATERIA)).toEqual([]);
	});

	it("haNotaCriada diz se vale pedir a lista de notas ao abrir a conversa", () => {
		expect(haNotaCriada([notaCriada("hm1", "a")], MATERIA)).toBe(true);
		expect(haNotaCriada([notaCriada("hm1", "a")], "fisica")).toBe(false);
		expect(haNotaCriada(undefined, MATERIA)).toBe(false);
	});
});

describe("o estado do cartão", () => {
	const cartao = lerNotaCriada(notaCriada("hm10", "call-1"))!;

	it("ordemDaChave compara chaves ao vivo (i) e do histórico (hm)", () => {
		expect(ordemDaChave("i42")).toBeGreaterThan(ordemDaChave("hm41"));
		expect(ordemDaChave("hm7")).toBe(7);
		expect(ordemDaChave("sem-numero")).toBe(Number.NEGATIVE_INFINITY);
	});

	it("sem nada mais, está criada (ao reabrir a conversa o cartão volta assim)", () => {
		expect(estadoDoCartao(cartao, undefined)).toEqual({ tipo: "criada" });
		expect(estadoDoCartao(cartao, [])).toEqual({ tipo: "criada" });
	});

	it("`desfeita` da mesma nota, depois da criação, vira desfeita (sem diferença de maiúsculas); a de antes, ou de outra nota, não", () => {
		expect(foiDesfeita(cartao, [desfeita("i11", "séries")])).toBe(true);
		expect(foiDesfeita(cartao, [desfeita("hm9")])).toBe(false);
		expect(foiDesfeita(cartao, [desfeita("i11", "Outra")])).toBe(false);
		expect(foiDesfeita(cartao, [desfeita("i11", "Séries", "fisica")])).toBe(false);
		expect(estadoDoCartao(cartao, [desfeita("i11")])).toEqual({ tipo: "desfeita" });
		expect(estadoDoCartao(cartao, undefined, undefined, true)).toEqual({ tipo: "desfeita" });
	});

	it("uma lista MAIS NOVA sem a nota vira 'não existe mais'; com a nota, continua criada; uma lista mais velha não vale", () => {
		expect(sumiuDaLista(cartao, [lista("i11", ["Outra"])])).toBe(true);
		expect(estadoDoCartao(cartao, [lista("i11", ["Outra"])])).toEqual({ tipo: "inexistente" });
		expect(estadoDoCartao(cartao, [lista("i11", ["séries", "Outra"])])).toEqual({ tipo: "criada" });
		// Uma lista de antes da criação não tinha como conhecer a nota.
		expect(estadoDoCartao(cartao, [lista("i5", ["Outra"])])).toEqual({ tipo: "criada" });
		// Vale a lista mais nova das que chegaram depois.
		expect(estadoDoCartao(cartao, [lista("i11", ["Outra"]), lista("i12", ["Séries"])])).toEqual({ tipo: "criada" });
		// Lista de outra matéria não conta.
		expect(estadoDoCartao(cartao, [lista("i11", [], "fisica")])).toEqual({ tipo: "criada" });
	});

	it("a recusa mostra a mensagem; desfeita e não existe mais vencem a recusa", () => {
		expect(estadoDoCartao(cartao, [], "A nota mudou")).toEqual({ tipo: "recusada", mensagem: "A nota mudou" });
		expect(estadoDoCartao(cartao, [lista("i11", [])], "A nota mudou")).toEqual({ tipo: "inexistente" });
		expect(estadoDoCartao(cartao, [desfeita("i11")], "A nota mudou")).toEqual({ tipo: "desfeita" });
	});

	it("o texto de cada estado", () => {
		expect(textoDoCartao(cartao, { tipo: "criada" })).toBe("Nota criada: Séries");
		expect(textoDoCartao(cartao, { tipo: "desfeita" })).toBe("Nota desfeita");
		expect(textoDoCartao(cartao, { tipo: "inexistente" })).toBe("A nota não existe mais");
		expect(textoDoCartao(cartao, { tipo: "recusada", mensagem: "A nota foi mexida." })).toBe("A nota foi mexida.");
	});
});

describe("a resposta ao Desfazer", () => {
	const vistas = new Set(["i1"]);
	it("`desfeita` com o mesmo pedido é sucesso", () => {
		const recebidas: AcaoRecebida[] = [{ chave: "i2", acao: "desfeita", dados: { materia: MATERIA, titulo: "Séries", pedido: "p1" } }];
		expect(respostaDoDesfazer(recebidas, vistas, "p1")).toEqual({ ok: true, materia: MATERIA, titulo: "Séries" });
	});

	it("`erro` com ao: desfazer_nota e o mesmo pedido é a mensagem; sem mensagem, uma frase padrão", () => {
		const com: AcaoRecebida[] = [{ chave: "i2", acao: "erro", dados: { ao: "desfazer_nota", mensagem: "A nota foi mexida.", pedido: "p1" } }];
		expect(respostaDoDesfazer(com, vistas, "p1")).toEqual({ ok: false, mensagem: "A nota foi mexida." });
		const sem: AcaoRecebida[] = [{ chave: "i2", acao: "erro", dados: { ao: "desfazer_nota", pedido: "p1" } }];
		expect(respostaDoDesfazer(sem, vistas, "p1")).toEqual({ ok: false, mensagem: "Não consegui desfazer a nota." });
	});

	it("ignora o que já existia, outro pedido e o erro de outra ação", () => {
		const recebidas: AcaoRecebida[] = [
			{ chave: "i1", acao: "desfeita", dados: { materia: MATERIA, titulo: "Séries", pedido: "p1" } },
			{ chave: "i2", acao: "desfeita", dados: { materia: MATERIA, titulo: "Séries", pedido: "outro" } },
			{ chave: "i3", acao: "erro", dados: { ao: "guardar", mensagem: "x", pedido: "p1" } },
		];
		expect(respostaDoDesfazer(recebidas, vistas, "p1")).toBeUndefined();
	});
});

describe("o id curto do link da conversa", () => {
	// Três UUID v7 de milissegundos diferentes; A e C têm a mesma parte "aleatória" (o pi gera os ids de um processo
	// em sequência), como as conversas abertas no mesmo servidor.
	const A = "019e0000-0001-7000-8000-e119b2a5aaaa";
	const B = "019e0000-0002-7000-8000-0123456789ab";
	const C = "019e0000-0003-7000-8000-e119b2a5aaaa";

	it("acha a sessão pelo id curto exato", () => {
		const sessoes = [{ id: B }, { id: A }, { id: C }];
		expect(sessaoPorIdCurto(sessoes, idCurtoDaConversa(A))?.id).toBe(A);
		expect(sessaoPorIdCurto(sessoes, idCurtoDaConversa(B))?.id).toBe(B);
		expect(sessaoPorIdCurto(sessoes, idCurtoDaConversa(C))?.id).toBe(C);
	});

	it("nunca por prefixo: o começo do UUID é igual nas três e não acha nenhuma", () => {
		const sessoes = [{ id: A }, { id: B }, { id: C }];
		expect(sessaoPorIdCurto(sessoes, "019e0000")).toBeUndefined();
		expect(sessaoPorIdCurto(sessoes, "019e0000-0001-7000")).toBeUndefined();
		// Um prefixo do próprio id curto também não vale.
		expect(sessaoPorIdCurto(sessoes, idCurtoDaConversa(A).slice(0, 5))).toBeUndefined();
		expect(sessaoPorIdCurto(sessoes, "")).toBeUndefined();
	});

	it("maiúsculas e espaços no link não atrapalham; sem a sessão na lista, undefined", () => {
		expect(sessaoPorIdCurto([{ id: A }], ` ${idCurtoDaConversa(A).toUpperCase()} `)?.id).toBe(A);
		expect(sessaoPorIdCurto([{ id: B }], idCurtoDaConversa(A))).toBeUndefined();
		expect(sessaoPorIdCurto([], idCurtoDaConversa(A))).toBeUndefined();
		expect(AVISO_CONVERSA_SUMIU.length).toBeGreaterThan(0);
	});

	it("o link antigo (a parte depois do dígito de versão) ainda acha a conversa; repetido, vale a mais recente", () => {
		const sessoes = [
			{ id: A, modificadaEm: "2026-11-01T10:00:00.000Z" },
			{ id: B, modificadaEm: "2026-11-02T10:00:00.000Z" },
			{ id: C, modificadaEm: "2026-11-03T10:00:00.000Z" },
		];
		expect(sessaoPorIdCurto(sessoes, idCurtoAntigoDaConversa(B)!)?.id).toBe(B);
		// A e C têm o mesmo id antigo: vale a mais recente. O id de hoje separa as duas.
		expect(sessaoPorIdCurto(sessoes, idCurtoAntigoDaConversa(A)!)?.id).toBe(C);
		expect(idCurtoDaConversa(A)).not.toBe(idCurtoDaConversa(C));
	});

	it("com dois ids curtos iguais (quase impossível), vale a conversa mais recente", () => {
		const iguais = [
			{ id: A, modificadaEm: "2026-11-01T10:00:00.000Z" },
			{ id: A.toUpperCase(), modificadaEm: "2026-11-05T10:00:00.000Z" },
		];
		expect(sessaoPorIdCurto(iguais, idCurtoDaConversa(A))?.modificadaEm).toBe("2026-11-05T10:00:00.000Z");
	});
});

describe("reconhecer o link conversa: num clique", () => {
	const montar = (html: string) => {
		const caixa = document.createElement("div");
		caixa.innerHTML = html;
		return caixa;
	};

	it("devolve o id do link, também quando o clique cai num filho do <a>", () => {
		const caixa = montar('<p>Veja <a href="conversa:e119b2a5"><strong>a conversa</strong></a></p>');
		expect(idDoLinkDeConversa(caixa.querySelector("strong"))).toBe("e119b2a5");
		expect(idDoLinkDeConversa(caixa.querySelector("a"))).toBe("e119b2a5");
	});

	it("link comum, texto fora do link e alvo que não é elemento não são de conversa", () => {
		const caixa = montar('<p>Texto <a href="https://exemplo.com">site</a> <a href="">vazio</a></p>');
		expect(idDoLinkDeConversa(caixa.querySelector("a"))).toBeUndefined();
		expect(idDoLinkDeConversa(caixa.querySelector("p"))).toBeUndefined();
		expect(idDoLinkDeConversa(null)).toBeUndefined();
		expect(idDoLinkDeConversa(document.createTextNode("x"))).toBeUndefined();
	});

	it("o esquema vale em qualquer caixa; link sem id vem vazio (quebrado, mas ainda é de conversa)", () => {
		expect(idDoLinkDeConversa(montar('<a href="Conversa:abc"></a>').firstElementChild)).toBe("abc");
		expect(idDoLinkDeConversa(montar('<a href="conversa:"></a>').firstElementChild)).toBe("");
	});
});
