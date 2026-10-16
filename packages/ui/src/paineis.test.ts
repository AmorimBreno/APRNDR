// Ordem dos painéis na área de painéis (sem DOM: só a função pura).

import { describe, expect, it } from "vitest";
import { idsDosPaineis } from "./paineis.tsx";

const pedido = (painel: string) => ({ id: `p-${painel}`, painel, acao: "perguntar", dados: null });

describe("idsDosPaineis", () => {
	it("os do perfil primeiro e, depois, os que receberam algo sem estar na lista", () => {
		expect(idsDosPaineis(["quiz", "teste"], { extra: [], teste: [] }, [])).toEqual(["quiz", "teste", "extra"]);
	});
	it("os que esperam resposta sobem para o topo, na mesma ordem entre si", () => {
		expect(idsDosPaineis(["quiz", "teste"], {}, [pedido("pergunta"), pedido("teste")])).toEqual(["teste", "pergunta", "quiz"]);
	});
});
