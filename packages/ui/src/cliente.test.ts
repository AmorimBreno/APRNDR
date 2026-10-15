import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClienteConexao, type EstadoConexao, type SocketMinimo } from "./cliente.ts";
import type { MensagemServidor } from "./tipos.ts";

/** WebSocket falso: o teste abre, fecha e entrega mensagens à mão. */
class SocketFalso implements SocketMinimo {
	readyState = 0;
	enviadas: Array<Record<string, unknown>> = [];
	onopen: ((evento: unknown) => void) | null = null;
	onclose: ((evento: unknown) => void) | null = null;
	onerror: ((evento: unknown) => void) | null = null;
	onmessage: ((evento: { data: unknown }) => void) | null = null;

	constructor(readonly url: string) {}

	send(dados: string): void {
		this.enviadas.push(JSON.parse(dados) as Record<string, unknown>);
	}
	close(): void {
		this.readyState = 3;
	}
	abrir(): void {
		this.readyState = 1;
		this.onopen?.({});
	}
	cair(): void {
		this.readyState = 3;
		this.onclose?.({});
	}
	receber(mensagem: MensagemServidor): void {
		this.onmessage?.({ data: JSON.stringify(mensagem) });
	}
}

let sockets: SocketFalso[];
let cliente: ClienteConexao;

function ultimo(): SocketFalso {
	return sockets.at(-1)!;
}

beforeEach(() => {
	vi.useFakeTimers();
	sockets = [];
	cliente = new ClienteConexao({
		url: "ws://teste/ws",
		criarSocket: (url) => {
			const socket = new SocketFalso(url);
			sockets.push(socket);
			return socket;
		},
		esperaInicialMs: 100,
		esperaMaximaMs: 1000,
	});
});

afterEach(() => {
	cliente.fechar();
	vi.useRealTimers();
});

describe("ClienteConexao", () => {
	it("conecta e informa o estado", () => {
		const estados: EstadoConexao[] = [];
		cliente.aoMudarEstado((estado) => estados.push(estado));
		expect(cliente.estado).toBe("conectando");
		expect(ultimo().url).toBe("ws://teste/ws");
		ultimo().abrir();
		expect(cliente.estado).toBe("aberta");
		expect(estados).toEqual(["aberta"]);
	});

	it("resolve o pedido com os dados da resposta de mesmo pedidoId", async () => {
		ultimo().abrir();
		const promessa = cliente.pedir({ tipo: "listar_sessoes", perfil: "p" });
		const enviada = ultimo().enviadas[0]!;
		expect(enviada).toMatchObject({ tipo: "listar_sessoes", perfil: "p" });
		expect(typeof enviada.pedidoId).toBe("string");

		// Resposta de outro pedido não resolve este.
		ultimo().receber({ tipo: "resposta", pedidoId: "outro", pedido: "listar_sessoes", ok: true, dados: ["x"] });
		ultimo().receber({ tipo: "resposta", pedidoId: enviada.pedidoId as string, pedido: "listar_sessoes", ok: true, dados: [] });
		await expect(promessa).resolves.toEqual([]);
	});

	it("rejeita com o erro da resposta", async () => {
		ultimo().abrir();
		const promessa = cliente.pedir({ tipo: "enviar", perfil: "p", texto: "oi" });
		const pedidoId = ultimo().enviadas[0]!.pedidoId as string;
		ultimo().receber({ tipo: "resposta", pedidoId, pedido: "enviar", ok: false, erro: "não está aberto" });
		await expect(promessa).rejects.toMatchObject({ message: "não está aberto", pedido: "enviar" });
	});

	it("rejeita na hora sem conexão", async () => {
		await expect(cliente.pedir({ tipo: "abortar", perfil: "p" })).rejects.toThrow("Sem conexão");
	});

	it("repassa as outras mensagens aos ouvintes", () => {
		const recebidas: MensagemServidor[] = [];
		cliente.aoReceber((mensagem) => recebidas.push(mensagem));
		ultimo().abrir();
		ultimo().receber({ tipo: "carregando", perfil: "p", mensagem: "m" });
		ultimo().onmessage?.({ data: "não é json" });
		expect(recebidas).toEqual([{ tipo: "carregando", perfil: "p", mensagem: "m" }]);
	});

	it("reconecta com espera crescente e avisa a reconexão", async () => {
		const aberturas: boolean[] = [];
		const estados: EstadoConexao[] = [];
		cliente.aoAbrir((reconexao) => aberturas.push(reconexao));
		cliente.aoMudarEstado((estado) => estados.push(estado));
		ultimo().abrir();
		const pendente = cliente.pedir({ tipo: "listar_modelos", perfil: "p" });
		ultimo().cair();
		await expect(pendente).rejects.toThrow("caiu");
		expect(cliente.estado).toBe("reconectando");
		expect(sockets).toHaveLength(1);

		vi.advanceTimersByTime(99);
		expect(sockets).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(sockets).toHaveLength(2);

		// Falhou de novo: espera o dobro.
		ultimo().cair();
		vi.advanceTimersByTime(199);
		expect(sockets).toHaveLength(2);
		vi.advanceTimersByTime(1);
		expect(sockets).toHaveLength(3);

		ultimo().abrir();
		expect(aberturas).toEqual([false, true]);
		expect(estados).toEqual(["aberta", "reconectando", "aberta"]);

		// Depois de abrir, a espera volta ao início.
		ultimo().cair();
		vi.advanceTimersByTime(100);
		expect(sockets).toHaveLength(4);
	});

	it("não passa da espera máxima", () => {
		for (let i = 0; i < 6; i++) {
			ultimo().cair();
			vi.advanceTimersByTime(1000);
		}
		expect(sockets).toHaveLength(7);
	});

	it("fechar não reconecta", () => {
		ultimo().abrir();
		cliente.fechar();
		vi.advanceTimersByTime(5000);
		expect(sockets).toHaveLength(1);
	});
});
