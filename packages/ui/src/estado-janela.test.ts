import { describe, expect, it } from "vitest";
import { type AcaoJanela, type EstadoJanela, estadoInicial, LIMITE_ACOES_POR_PAINEL, reduzirJanela } from "./estado-janela.ts";
import type { EstadoSessao, EventoNucleo } from "./tipos.ts";

const PERFIL = "p1";

function aplicar(estado: EstadoJanela, ...acoes: AcaoJanela[]): EstadoJanela {
	return acoes.reduce(reduzirJanela, estado);
}

function ev(evento: EventoNucleo): AcaoJanela {
	return { tipo: "evento", perfil: PERFIL, evento };
}

function sessao(parcial: Partial<EstadoSessao> = {}): EstadoSessao {
	return {
		perfil: PERFIL,
		sessaoId: "s1",
		agente: "geral",
		modelo: "prov/m1",
		raciocinio: "medium",
		ferramentas: ["read"],
		skills: [],
		diagnosticos: [],
		...parcial,
	};
}

const uso = { tokensEntrada: 10, tokensSaida: 5, tokensCacheLeitura: 1, tokensCacheEscrita: 2, tokensTotal: 18, custo: 0.01 };

describe("reduzirJanela", () => {
	it("mostra o carregando até o primeiro histórico", () => {
		let estado = aplicar(estadoInicial(PERFIL), { tipo: "carregando", perfil: PERFIL, mensagem: "Montando..." });
		expect(estado.carregando).toBe("Montando...");
		expect(estado.pronto).toBe(false);
		estado = aplicar(estado, { tipo: "historico", perfil: PERFIL, itens: [] });
		expect(estado.carregando).toBeUndefined();
		expect(estado.pronto).toBe(true);
	});

	it("ignora mensagens de outro perfil", () => {
		const inicial = estadoInicial(PERFIL);
		const estado = aplicar(
			inicial,
			{ tipo: "carregando", perfil: "outro", mensagem: "x" },
			{ tipo: "evento", perfil: "outro", evento: { tipo: "execucao_inicio" } },
		);
		expect(estado).toBe(inicial);
	});

	it("monta a resposta aos pedaços e põe as ferramentas no lugar certo", () => {
		const estado = aplicar(
			estadoInicial(PERFIL),
			ev({ tipo: "execucao_inicio" }),
			ev({ tipo: "mensagem_usuario", texto: "oi" }),
			ev({ tipo: "raciocinio_delta", delta: "pen" }),
			ev({ tipo: "raciocinio_delta", delta: "sando" }),
			ev({ tipo: "texto_delta", delta: "Vou " }),
			ev({ tipo: "texto_delta", delta: "ler." }),
			ev({ tipo: "mensagem_assistente", texto: "Vou ler.", raciocinio: "pensando", modelo: "prov/m1", motivoParada: "toolUse" }),
			ev({ tipo: "ferramenta_inicio", id: "t1", nome: "read", argumentos: { path: "a.md" } }),
			ev({ tipo: "ferramenta_progresso", id: "t1", nome: "read", resumo: "lendo" }),
			ev({ tipo: "ferramenta_fim", id: "t1", nome: "read", erro: false, resumo: "conteúdo", duracaoMs: 12 }),
			ev({ tipo: "texto_delta", delta: "Pronto" }),
		);
		expect(estado.executando).toBe(true);
		expect(estado.conversa.map((item) => item.tipo)).toEqual(["usuario", "assistente", "ferramenta", "assistente"]);
		const [, primeira, ferramenta, segunda] = estado.conversa;
		expect(primeira).toMatchObject({ texto: "Vou ler.", raciocinio: "pensando", modelo: "prov/m1", emAndamento: false });
		expect(ferramenta).toMatchObject({
			chamada: { id: "t1", nome: "read", argumentos: { path: "a.md" }, status: "ok", progresso: "lendo", resumo: "conteúdo", duracaoMs: 12 },
		});
		expect(segunda).toMatchObject({ texto: "Pronto", emAndamento: true });

		const fim = aplicar(estado, ev({ tipo: "execucao_fim", abortada: false }));
		expect(fim.executando).toBe(false);
		expect(fim.conversa[3]).toMatchObject({ emAndamento: false });
	});

	it("tira a mensagem do assistente vazia (só chamada de ferramenta)", () => {
		const estado = aplicar(
			estadoInicial(PERFIL),
			ev({ tipo: "mensagem_assistente", texto: "", raciocinio: "", modelo: "m", motivoParada: "toolUse" }),
			ev({ tipo: "ferramenta_inicio", id: "t1", nome: "ls", argumentos: {} }),
		);
		expect(estado.conversa.map((item) => item.tipo)).toEqual(["ferramenta"]);
	});

	it("mostra o erro do provedor na mensagem e em erros", () => {
		const estado = aplicar(
			estadoInicial(PERFIL),
			ev({ tipo: "mensagem_assistente", texto: "", raciocinio: "", modelo: "m", motivoParada: "error", erro: "429" }),
			ev({ tipo: "erro", origem: "modelo", mensagem: "429" }),
		);
		expect(estado.conversa[0]).toMatchObject({ tipo: "assistente", erro: "429" });
		expect(estado.erros).toMatchObject([{ origem: "modelo", mensagem: "429" }]);
	});

	it("ferramenta sem fim vira sem_resultado quando a execução termina", () => {
		const estado = aplicar(
			estadoInicial(PERFIL),
			ev({ tipo: "ferramenta_inicio", id: "t1", nome: "bash", argumentos: {} }),
			ev({ tipo: "execucao_fim", abortada: true }),
		);
		expect(estado.conversa[0]).toMatchObject({ chamada: { status: "sem_resultado" } });
	});

	it("converte o histórico com os resultados das ferramentas", () => {
		const estado = aplicar(estadoInicial(PERFIL), {
			tipo: "historico",
			perfil: PERFIL,
			itens: [
				{ papel: "usuario", texto: "oi" },
				{ papel: "assistente", texto: "", raciocinio: "", modelo: "m", ferramentas: [{ id: "t1", nome: "read", argumentos: { p: 1 } }] },
				{ papel: "ferramenta", id: "t1", nome: "read", erro: true, resumo: "não achei" },
				{ papel: "assistente", texto: "Pronto.", raciocinio: "r", modelo: "m", ferramentas: [] },
			],
		});
		expect(estado.conversa).toMatchObject([
			{ tipo: "usuario", texto: "oi" },
			{ tipo: "ferramenta", chamada: { id: "t1", argumentos: { p: 1 }, status: "erro", resumo: "não achei" } },
			{ tipo: "assistente", texto: "Pronto.", raciocinio: "r", emAndamento: false },
		]);
		const chaves = estado.conversa.map((item) => item.chave);
		expect(new Set(chaves).size).toBe(chaves.length);
	});

	it("guarda o estado da sessão, soma o uso e zera ao trocar de sessão", () => {
		let estado = aplicar(
			estadoInicial(PERFIL),
			{ tipo: "resposta", pedido: "abrir_perfil", ok: true, dados: sessao() },
			ev({ tipo: "uso", modelo: "m", ...uso }),
			ev({ tipo: "uso", modelo: "m", agente: "researcher", idFerramenta: "t9", ...uso }),
		);
		expect(estado.sessao?.agente).toBe("geral");
		expect(estado.uso).toMatchObject({ tokensTotal: 36, respostas: 2 });
		expect(estado.uso.custo).toBeCloseTo(0.02);

		estado = aplicar(estado, ev({ tipo: "estado_sessao", estado: sessao({ modelo: "prov/m2" }) }));
		expect(estado.sessao?.modelo).toBe("prov/m2");
		expect(estado.uso.respostas).toBe(2);

		estado = aplicar(estado, ev({ tipo: "estado_sessao", estado: sessao({ sessaoId: "s2" }) }));
		expect(estado.uso.respostas).toBe(0);
	});

	it("não repete os diagnósticos da sessão que também chegam como evento", () => {
		const diagnostico = { nivel: "aviso" as const, mensagem: "ferramenta x não existe" };
		let estado = aplicar(
			estadoInicial(PERFIL),
			ev({ tipo: "estado_sessao", estado: sessao({ diagnosticos: [diagnostico] }) }),
			ev({ tipo: "diagnostico", ...diagnostico }),
			ev({ tipo: "diagnostico", nivel: "info", mensagem: "Compactando" }),
		);
		expect(estado.diagnosticos).toEqual([diagnostico, { nivel: "info", mensagem: "Compactando" }]);
		// O mesmo estado de novo (troca de modelo) mantém o diagnóstico de execução.
		estado = aplicar(estado, ev({ tipo: "estado_sessao", estado: sessao({ diagnosticos: [diagnostico] }) }));
		expect(estado.diagnosticos).toHaveLength(2);
		// Outra sessão fica só com os dela.
		estado = aplicar(estado, ev({ tipo: "estado_sessao", estado: sessao({ sessaoId: "s2", diagnosticos: [] }) }));
		expect(estado.diagnosticos).toEqual([]);
	});

	it("guarda a fila", () => {
		const estado = aplicar(estadoInicial(PERFIL), ev({ tipo: "fila", mensagens: ["a", "b"] }));
		expect(estado.fila).toEqual(["a", "b"]);
	});

	it("separa ações e pedidos da ponte por painel", () => {
		let estado = aplicar(
			estadoInicial(PERFIL),
			ev({ tipo: "acao_interface", painel: "teste", acao: "mostrar", dados: { x: 1 } }),
			ev({ tipo: "acao_interface", painel: "outro", acao: "abrir", dados: null }),
			ev({ tipo: "pedido_interface", id: "q1", painel: "teste", acao: "perguntar", dados: { p: "?" } }),
			ev({ tipo: "pedido_interface", id: "q2", painel: "teste", acao: "perguntar", dados: {} }),
		);
		expect(estado.acoesPorPainel.teste).toMatchObject([{ acao: "mostrar", dados: { x: 1 } }]);
		expect(estado.acoesPorPainel.outro).toHaveLength(1);
		expect(estado.pedidos.map((pedido) => pedido.id)).toEqual(["q1", "q2"]);

		estado = aplicar(
			estado,
			ev({ tipo: "pedido_interface_cancelado", id: "q1", motivo: "abortado" }),
			{ tipo: "local:pedido_respondido", id: "q2" },
		);
		expect(estado.pedidos).toEqual([]);
		expect(estado.cancelados).toEqual({ q1: "abortado" });
	});

	it("registra cada pedido: pendente, respondido com a resposta, cancelado com o motivo; zera ao trocar de sessão", () => {
		let estado = aplicar(
			estadoInicial(PERFIL),
			{ tipo: "resposta", pedido: "abrir_perfil", ok: true, dados: sessao({ sessaoId: "s1" }) },
			ev({ tipo: "pedido_interface", id: "q1", painel: "pergunta", acao: "perguntar", dados: { question: "?" } }),
			ev({ tipo: "pedido_interface", id: "q2", painel: "quiz", acao: "perguntar", dados: {} }),
			ev({ tipo: "pedido_interface", id: "q3", painel: "quiz", acao: "perguntar", dados: {} }),
		);
		expect(Object.values(estado.registrosPedidos).map((registro) => [registro.id, registro.estado])).toEqual([
			["q1", "pendente"],
			["q2", "pendente"],
			["q3", "pendente"],
		]);
		const ordens = Object.values(estado.registrosPedidos).map((registro) => registro.ordem);
		expect([...ordens].sort((a, b) => a - b)).toEqual(ordens);

		estado = aplicar(
			estado,
			{ tipo: "local:pedido_respondido", id: "q1", dados: { escolhas: [2] } },
			// Cancelar pela interface: o evento do núcleo chega antes da resposta do pedido.
			ev({ tipo: "pedido_interface_cancelado", id: "q2", motivo: "usuario" }),
			{ tipo: "local:pedido_respondido", id: "q2" },
			ev({ tipo: "pedido_interface_cancelado", id: "q3", motivo: "abortado" }),
		);
		expect(estado.registrosPedidos.q1).toMatchObject({ estado: "respondido", resposta: { escolhas: [2] } });
		expect(estado.registrosPedidos.q2).toMatchObject({ estado: "cancelado", motivo: "usuario" });
		expect(estado.registrosPedidos.q3).toMatchObject({ estado: "cancelado", motivo: "abortado" });
		expect(estado.pedidos).toEqual([]);

		// A mesma sessão (reconexão) mantém; outra sessão zera.
		estado = aplicar(estado, { tipo: "resposta", pedido: "abrir_perfil", ok: true, dados: sessao({ sessaoId: "s1" }) });
		expect(Object.keys(estado.registrosPedidos)).toHaveLength(3);
		estado = aplicar(estado, { tipo: "resposta", pedido: "abrir_sessao", ok: true, dados: sessao({ sessaoId: "s2" }) });
		expect(estado.registrosPedidos).toEqual({});
	});

	it("limita as ações guardadas por painel", () => {
		let estado = estadoInicial(PERFIL);
		for (let i = 0; i < LIMITE_ACOES_POR_PAINEL + 5; i++) {
			estado = aplicar(estado, ev({ tipo: "acao_interface", painel: "teste", acao: `a${i}`, dados: i }));
		}
		expect(estado.acoesPorPainel.teste).toHaveLength(LIMITE_ACOES_POR_PAINEL);
		expect(estado.acoesPorPainel.teste?.[0]?.acao).toBe("a5");
	});

	it("avisa o perfil recarregado e fecha o aviso", () => {
		let estado = aplicar(estadoInicial(PERFIL), {
			tipo: "perfil_recarregado",
			perfil: PERFIL,
			motivo: "arquivo",
			arquivos: ["extensions/x.ts"],
		});
		expect(estado.recarregado).toMatchObject({ motivo: "arquivo", arquivos: ["extensions/x.ts"] });
		estado = aplicar(estado, { tipo: "local:fechar_aviso_recarregado" });
		expect(estado.recarregado).toBeUndefined();
	});

	it("registra erros de pedido, do servidor e limpa", () => {
		let estado = aplicar(
			estadoInicial(PERFIL),
			{ tipo: "carregando", perfil: PERFIL, mensagem: "Montando" },
			{ tipo: "resposta", pedido: "abrir_perfil", ok: false, erro: "perfil inválido" },
			{ tipo: "erro", mensagem: "JSON inválido" },
		);
		expect(estado.carregando).toBeUndefined();
		expect(estado.erros).toMatchObject([
			{ origem: "pedido", mensagem: "abrir_perfil: perfil inválido" },
			{ origem: "servidor", mensagem: "JSON inválido" },
		]);
		estado = aplicar(estado, { tipo: "local:limpar_erros" });
		expect(estado.erros).toEqual([]);
	});

	it("a queda da conexão encerra a execução na tela", () => {
		const estado = aplicar(
			estadoInicial(PERFIL),
			ev({ tipo: "execucao_inicio" }),
			ev({ tipo: "texto_delta", delta: "meio" }),
			ev({ tipo: "fila", mensagens: ["depois"] }),
			{ tipo: "local:conexao_caiu" },
		);
		expect(estado.executando).toBe(false);
		expect(estado.fila).toEqual([]);
		expect(estado.conversa[0]).toMatchObject({ emAndamento: false });
	});
});
