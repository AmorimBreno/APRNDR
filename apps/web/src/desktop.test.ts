// Leitura do ambiente da janela própria (sem DOM: só o objeto que o preload expõe).

import { describe, expect, it } from "vitest";
import { lerAmbienteDesktop } from "./desktop.ts";

describe("lerAmbienteDesktop", () => {
	it("no navegador comum não há ambiente", () => {
		expect(lerAmbienteDesktop({})).toBeUndefined();
	});

	it("lê o que o preload expõe", () => {
		const sair = async () => {};
		const ambiente = lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 32, sair } });
		expect(ambiente).toMatchObject({ plataforma: "win32", alturaBarra: 32 });
		expect(typeof ambiente?.sair).toBe("function");
	});

	it("o sair chama o sair do preload", async () => {
		let chamado = 0;
		const ambiente = lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 32, sair: async () => void chamado++ } });
		await ambiente?.sair();
		expect(chamado).toBe(1);
	});

	it("ignora algo inesperado em vez de ligar a barra", () => {
		expect(lerAmbienteDesktop({ estudosDesktop: "sim" })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: null })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32" } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 32 } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 0, sair() {} } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: Number.NaN, sair() {} } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: 1, alturaBarra: 32, sair() {} } })).toBeUndefined();
	});
});
