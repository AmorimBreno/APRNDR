// Agrupamento das chamadas de ferramenta na conversa e o rótulo do grupo
// (sem DOM: só as funções puras).

import { describe, expect, it } from "vitest";
import type { ChamadaFerramenta, ItemConversa } from "../estado-janela.ts";
import { agruparConversa, argumentosLegiveis, rotuloGrupo } from "./Conversa.tsx";

const chamada = (id: string, status: ChamadaFerramenta["status"] = "ok", nome = "ler_nota"): ChamadaFerramenta => ({ id, nome, argumentos: { id }, status });
const ferramenta = (id: string, status?: ChamadaFerramenta["status"]): ItemConversa => ({ tipo: "ferramenta", chave: `f-${id}`, chamada: chamada(id, status) });
const resposta = (chave: string, texto: string): ItemConversa => ({ tipo: "assistente", chave, texto, raciocinio: "", emAndamento: false });
const usuario = (chave: string): ItemConversa => ({ tipo: "usuario", chave, texto: "oi" });

const forma = (conversa: ItemConversa[], viraPedido?: (id: string) => boolean) =>
	agruparConversa(conversa, viraPedido).map((trecho) => (trecho.tipo === "ferramentas" ? trecho.chamadas.map((item) => item.id).join("+") : trecho.item.chave));

describe("agrupar as ferramentas", () => {
	it("junta as chamadas seguidas, mesmo com respostas sem texto entre elas", () => {
		const conversa = [usuario("u1"), resposta("r0", ""), ferramenta("a"), resposta("r1", ""), ferramenta("b"), ferramenta("c"), resposta("r2", "pronto")];
		expect(forma(conversa)).toEqual(["u1", "a+b+c", "r2"]);
	});

	it("uma resposta com texto ou uma mensagem separa os grupos", () => {
		expect(forma([ferramenta("a"), resposta("r1", "olhei"), ferramenta("b"), usuario("u2"), ferramenta("c")])).toEqual(["a", "r1", "b", "u2", "c"]);
	});

	it("a chamada que vira botão de pedido fica fora e separa", () => {
		expect(forma([ferramenta("a"), ferramenta("quiz"), ferramenta("b")], (id) => id === "quiz")).toEqual(["a", "f-quiz", "b"]);
	});

	it("a chave do grupo é a da primeira chamada (não muda quando chega outra)", () => {
		const [grupo] = agruparConversa([ferramenta("a"), ferramenta("b")]);
		expect(grupo).toMatchObject({ tipo: "ferramentas", chave: "f-a" });
	});
});

describe("rótulo do grupo", () => {
	it("conta os comandos, no singular e no plural", () => {
		expect(rotuloGrupo([chamada("a")])).toEqual({ texto: "Executou 1 comando", erros: 0 });
		expect(rotuloGrupo([chamada("a"), chamada("b", "erro")])).toEqual({ texto: "Executou 2 comandos", erros: 1 });
	});
	it("enquanto roda, diz qual", () => {
		expect(rotuloGrupo([chamada("a"), chamada("b", "executando", "listar_notas")]).texto).toBe("Executando listar_notas…");
	});
	it("os argumentos inteiros vêm com recuo", () => {
		expect(argumentosLegiveis({ titulo: "Limites" })).toBe('{\n  "titulo": "Limites"\n}');
		expect(argumentosLegiveis(undefined)).toBe("");
	});
});
