// Painéis da área de painéis (sem DOM: só a função pura).

import { describe, expect, it } from "vitest";
import { idsDosPaineis, PainelGenerico } from "./paineis.tsx";

describe("idsDosPaineis", () => {
	it("os do perfil primeiro e, depois, os que receberam algo sem estar na lista", () => {
		expect(idsDosPaineis(["quiz", "teste"], { extra: [], teste: [] })).toEqual(["quiz", "teste", "extra"]);
	});
	it("os só de pedidos ficam de fora (são respondidos no modal)", () => {
		const registro = { quiz: { componente: PainelGenerico, soModal: true } };
		expect(idsDosPaineis(["quiz", "teste"], { quiz: [] }, registro)).toEqual(["teste"]);
	});
});
