// Qual atividade o agente mostra, pelo estado da janela (sem DOM).

import { describe, expect, it } from "vitest";
import type { ItemConversa, RegistroPedido } from "../estado-janela.ts";
import { atividadeDoAgente } from "./AgenteAnimado.tsx";

const usuario: ItemConversa = { tipo: "usuario", chave: "u", texto: "oi" };
const escrevendo: ItemConversa = { tipo: "assistente", chave: "a", texto: "Vou", raciocinio: "", emAndamento: true };
const pensando: ItemConversa = { tipo: "assistente", chave: "a", texto: "", raciocinio: "hmm", emAndamento: true };
const ferramenta = (nome: string, status: "executando" | "ok"): ItemConversa => ({ tipo: "ferramenta", chave: "f", chamada: { id: "c", nome, argumentos: {}, status } });
const pendente: RegistroPedido = { id: "p", painel: "quiz", acao: "perguntar", dados: null, estado: "pendente", ordem: 1 };

const estado = (executando: boolean, conversa: ItemConversa[], registrosPedidos: Record<string, RegistroPedido> = {}) => ({ executando, conversa, registrosPedidos });

describe("atividadeDoAgente", () => {
	it("parado sem execução; pensando antes do primeiro texto; escrevendo com texto chegando", () => {
		expect(atividadeDoAgente(estado(false, [usuario]))).toBe("parado");
		expect(atividadeDoAgente(estado(true, [usuario]))).toBe("pensando");
		expect(atividadeDoAgente(estado(true, [usuario, pensando]))).toBe("pensando");
		expect(atividadeDoAgente(estado(true, [usuario, escrevendo]))).toBe("escrevendo");
	});
	it("ferramenta de busca é pesquisa; outra ferramenta é pensar; pedido esperando é pergunta", () => {
		expect(atividadeDoAgente(estado(true, [usuario, ferramenta("web_search", "executando")]))).toBe("pesquisando");
		expect(atividadeDoAgente(estado(true, [usuario, ferramenta("subagent", "executando")]))).toBe("pesquisando");
		expect(atividadeDoAgente(estado(true, [usuario, ferramenta("read", "executando")]))).toBe("pensando");
		expect(atividadeDoAgente(estado(true, [usuario, ferramenta("quiz", "executando")], { p: pendente }))).toBe("perguntando");
		// Uma ferramenta que já terminou não conta: volta a pensar.
		expect(atividadeDoAgente(estado(true, [usuario, ferramenta("web_search", "ok")]))).toBe("pensando");
	});
});
