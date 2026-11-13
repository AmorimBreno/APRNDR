// Leitura do ambiente da janela própria (sem DOM: só o objeto que o preload expõe).

import { describe, expect, it } from "vitest";
import { lerAmbienteDesktop } from "./desktop.ts";

describe("lerAmbienteDesktop", () => {
	it("no navegador comum não há ambiente", () => {
		expect(lerAmbienteDesktop({})).toBeUndefined();
	});

	it("lê o que o preload expõe", () => {
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 32 } })).toEqual({ plataforma: "win32", alturaBarra: 32 });
	});

	it("ignora algo inesperado em vez de ligar a barra", () => {
		expect(lerAmbienteDesktop({ estudosDesktop: "sim" })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: null })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32" } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 0 } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: Number.NaN } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: 1, alturaBarra: 32 } })).toBeUndefined();
	});
});
