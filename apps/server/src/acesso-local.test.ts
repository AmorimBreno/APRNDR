import { describe, expect, it } from "vitest";
import { ehEnderecoLocal, origemPermitida } from "./acesso-local.ts";

describe("ehEnderecoLocal", () => {
	it("aceita só o próprio computador", () => {
		for (const endereco of ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1"]) expect(ehEnderecoLocal(endereco), endereco).toBe(true);
		for (const endereco of ["192.168.0.10", "10.0.0.2", "::ffff:192.168.0.10", "fe80::1", "", undefined]) expect(ehEnderecoLocal(endereco), String(endereco)).toBe(false);
	});
});

describe("origemPermitida", () => {
	it("sem Origin pode; com Origin, só páginas deste computador", () => {
		expect(origemPermitida(undefined)).toBe(true);
		for (const origem of ["http://localhost:7430", "http://127.0.0.1:7440", "http://[::1]:7430"]) expect(origemPermitida(origem), origem).toBe(true);
		for (const origem of ["https://exemplo.com", "http://192.168.0.10:7430", "file://", "null", "http://localhost.exemplo.com"]) expect(origemPermitida(origem), origem).toBe(false);
	});
});
