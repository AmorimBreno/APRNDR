// O endereço do link da barra da seleção: sem o protocolo, o markdown teria um link relativo.

import { describe, expect, it } from "vitest";
import { comProtocolo } from "./BarraFormatacao.tsx";

describe("link da barra da seleção", () => {
	it("põe https:// num endereço sem protocolo", () => {
		expect(comProtocolo("exemplo.com/limites")).toBe("https://exemplo.com/limites");
		expect(comProtocolo("www.ime.usp.br")).toBe("https://www.ime.usp.br");
	});
	it("deixa como está o que já tem protocolo, as âncoras e os caminhos", () => {
		for (const endereco of ["https://exemplo.com", "http://x.org", "mailto:breno@exemplo.com", "#secao", "/notas", ""]) {
			expect(comProtocolo(endereco), endereco).toBe(endereco);
		}
	});
});
