import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { esquemaMensagemCliente, validarMensagemCliente } from "./protocolo.ts";

describe("mensagens válidas do cliente", () => {
	const validas: unknown[] = [
		{ tipo: "ping" },
		{ tipo: "ping", pedidoId: "1" },
		{ tipo: "abrir_perfil", perfil: "estudos" },
		{ tipo: "abrir_perfil", pedidoId: "2", perfil: "estudos", sessaoId: "abc", agente: "professor" },
		{ tipo: "enviar", perfil: "estudos", texto: "Olá" },
		{ tipo: "abortar", perfil: "estudos" },
		{ tipo: "trocar_modelo", perfil: "estudos", modelo: "openrouter/anthropic/claude-sonnet-5.5" },
		{ tipo: "trocar_agente", perfil: "estudos", agente: "researcher" },
		{ tipo: "nova_sessao", perfil: "estudos" },
		{ tipo: "nova_sessao", perfil: "estudos", agente: "professor" },
		{ tipo: "abrir_sessao", perfil: "estudos", sessaoId: "abc" },
		{ tipo: "listar_sessoes", perfil: "estudos" },
		{ tipo: "listar_modelos", perfil: "estudos" },
		{ tipo: "recarregar_perfil", perfil: "estudos" },
		{ tipo: "responder_pedido", perfil: "estudos", id: "p1", dados: { escolha: 2 } },
		{ tipo: "responder_pedido", perfil: "estudos", id: "p1" },
		{ tipo: "cancelar_pedido", perfil: "estudos", id: "p1" },
		{ tipo: "acao_interface", perfil: "estudos", painel: "teste", acao: "clicou", dados: null },
		{ tipo: "listar_materiais", perfil: "estudos" },
		{ tipo: "nova_sessao", perfil: "estudos", contexto: { chave: "materia:x", rotulo: "X", instrucoes: "Do caderno X.", escopoMateriais: "materias/x" } },
		{ tipo: "nova_sessao", perfil: "estudos", contexto: null },
		{ tipo: "reprocessar_material", perfil: "estudos", caminho: "materias/x/materiais/a.pdf" },
	];

	it.each(validas)("aceita %j", (mensagem) => {
		const resultado = validarMensagemCliente(mensagem);
		expect(resultado.ok).toBe(true);
	});

	it("cobre todos os tipos do esquema", () => {
		const tipos = new Set(validas.map((mensagem) => (mensagem as { tipo: string }).tipo));
		expect([...tipos].sort()).toEqual(esquemaMensagemCliente.options.map((opcao) => opcao.shape.tipo.value).sort());
	});
});

describe("mensagens inválidas do cliente", () => {
	it("recusa tipo desconhecido, sem dizer qual pedido era", () => {
		const resultado = validarMensagemCliente({ tipo: "apagar_tudo", pedidoId: "9" });
		expect(resultado).toMatchObject({ ok: false, pedidoId: "9" });
		expect(resultado.ok ? undefined : resultado.pedido).toBeUndefined();
	});

	it("recusa campo que falta e devolve o pedidoId e o tipo para responder", () => {
		const resultado = validarMensagemCliente({ tipo: "enviar", pedidoId: "3", perfil: "estudos" });
		expect(resultado).toMatchObject({ ok: false, pedidoId: "3", pedido: "enviar" });
		expect(resultado.ok ? "" : resultado.erro).toMatch(/campo texto/);
	});

	it("recusa texto vazio, campo a mais e tipos errados", () => {
		expect(validarMensagemCliente({ tipo: "enviar", perfil: "estudos", texto: "" }).ok).toBe(false);
		expect(validarMensagemCliente({ tipo: "abortar", perfil: "estudos", extra: 1 }).ok).toBe(false);
		expect(validarMensagemCliente({ tipo: "trocar_modelo", perfil: "estudos", modelo: 5 }).ok).toBe(false);
		expect(validarMensagemCliente({ tipo: "acao_interface", perfil: "estudos", painel: "", acao: "a" }).ok).toBe(false);
		expect(validarMensagemCliente({ tipo: "abrir_perfil" }).ok).toBe(false);
		expect(validarMensagemCliente({ tipo: "ping", pedidoId: 7 }).ok).toBe(false);
	});

	it("recusa contexto com pasta fora da pasta de dados", () => {
		for (const escopoMateriais of ["../fora", "C:\\x", "/x", "materias\\..\\fora"]) {
			expect(validarMensagemCliente({ tipo: "nova_sessao", perfil: "estudos", contexto: { chave: "a", rotulo: "A", escopoMateriais } }).ok).toBe(false);
		}
		expect(validarMensagemCliente({ tipo: "nova_sessao", perfil: "estudos", contexto: { chave: "", rotulo: "A" } }).ok).toBe(false);
	});

	it("recusa o que não é objeto", () => {
		for (const valor of [null, 3, "ping", []]) expect(validarMensagemCliente(valor).ok).toBe(false);
	});
});

describe("isolamento do pi", () => {
	it("protocolo.ts só importa o zod e tipos (o front importa este arquivo)", () => {
		const codigo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "protocolo.ts"), "utf8");
		const importacoes = [...codigo.matchAll(/^import\s+(type\s+)?.*?from\s+"([^"]+)";/gms)].map((achado) => ({
			soTipo: Boolean(achado[1]),
			modulo: achado[2],
		}));
		expect(importacoes.filter((importacao) => !importacao.soTipo).map((importacao) => importacao.modulo)).toEqual(["zod"]);
	});
});
