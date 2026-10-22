// A leitura do que a extensão dos cursos mandou (cursos-ponte.ts): a lista
// com os cursos que chegaram depois dela, os descartados e os erros; e a
// espera pelo pedido (a promessa só resolve com a resposta daquele pedido, um
// "erro" com ele rejeita, e trocar de sessão rejeita o que ficou esperando).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { Curso, ResumoCurso } from "../../lib/curso-tipos.ts";
import { ErroDaPonte, EsperaDePedidos, lerCursos, respostaDoPedido } from "./cursos-ponte.ts";

let contador = 0;
const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++contador}`, acao, dados });

function curso(id: string, extra: Partial<Curso> = {}): Curso {
	return {
		versao: 1,
		id,
		nome: `Curso ${id}`,
		materia: "calculo",
		situacao: "rascunho",
		etapa: "materiais",
		criadoEm: "2026-10-22T13:00:00.000Z",
		alteradoEm: "2026-10-22T13:00:00.000Z",
		basico: { prazo: null, horasPorSemana: 4 },
		materiais: null,
		objetivo: null,
		mapa: null,
		diagnostico: null,
		esqueleto: null,
		...extra,
	};
}

const resumo = (id: string, extra: Partial<ResumoCurso> = {}): ResumoCurso => ({
	id,
	nome: `Curso ${id}`,
	situacao: "rascunho",
	etapa: "materiais",
	prazo: null,
	alteradoEm: "2026-10-22T13:00:00.000Z",
	...extra,
});

describe("lerCursos", () => {
	it("a lista da matéria, com os cursos que chegaram depois atualizados ou acrescentados e sem os descartados", () => {
		const lido = lerCursos(
			[
				recebida("lista", { materia: "outra", cursos: [resumo("x")] }),
				recebida("lista", { materia: "calculo", cursos: [resumo("a"), resumo("b")] }),
				recebida("curso", { materia: "calculo", curso: curso("b", { etapa: "objetivo", alteradoEm: "2026-10-22T14:00:00.000Z" }) }),
				recebida("curso", { materia: "calculo", curso: curso("c"), pedido: "p1" }),
				recebida("descartado", { materia: "calculo", curso: "a", pedido: "p2" }),
			],
			"calculo",
		);
		expect(lido.lista?.map((item) => [item.id, item.etapa])).toEqual([
			["b", "objetivo"],
			["c", "materiais"],
		]);
		expect(Object.keys(lido.cursos)).toEqual(["b", "c"]);
	});

	it("sem lista ainda, só os cursos; os erros de listar e de abrir ficam separados", () => {
		const lido = lerCursos(
			[
				recebida("curso", { materia: "calculo", curso: curso("a") }),
				recebida("erro", { materia: "calculo", ao: "abrir", curso: "z", mensagem: "Não achei o curso z." }),
				recebida("erro", { materia: "calculo", ao: "listar", mensagem: "Pasta ilegível." }),
				recebida("erro", { materia: "outra", ao: "listar", mensagem: "De outra matéria." }),
			],
			"calculo",
		);
		expect(lido.lista).toBeUndefined();
		expect(lido.cursos.a?.id).toBe("a");
		expect(lido.errosAbrir).toEqual({ z: "Não achei o curso z." });
		expect(lido.erroLista).toBe("Pasta ilegível.");
	});

	it("um curso que chega depois do erro de abrir apaga o erro", () => {
		const lido = lerCursos(
			[recebida("erro", { materia: "calculo", ao: "abrir", curso: "a", mensagem: "Falhou." }), recebida("curso", { materia: "calculo", curso: curso("a") })],
			"calculo",
		);
		expect(lido.errosAbrir).toEqual({});
	});
});

describe("a espera pelo pedido", () => {
	it("respostaDoPedido acha o curso, o descartado ou o erro com aquele pedido", () => {
		const lista = [
			recebida("curso", { materia: "calculo", curso: curso("a") }),
			recebida("curso", { materia: "calculo", curso: curso("b"), pedido: "p1" }),
			recebida("erro", { mensagem: "Ruim.", pedido: "p2" }),
			recebida("descartado", { materia: "calculo", curso: "c", pedido: "p3" }),
		];
		expect(respostaDoPedido(lista, "p1")).toMatchObject({ tipo: "curso", dados: { curso: { id: "b" } } });
		expect(respostaDoPedido(lista, "p2")).toMatchObject({ tipo: "erro", dados: { mensagem: "Ruim." } });
		expect(respostaDoPedido(lista, "p3")).toMatchObject({ tipo: "descartado" });
		expect(respostaDoPedido(lista, "p4")).toBeUndefined();
	});

	it("a promessa espera a resposta do pedido dela, e não a de outro", async () => {
		const espera = new EsperaDePedidos();
		let resolvida: unknown;
		const promessa = espera.esperar("p1").then((resposta) => (resolvida = resposta));
		const primeiras = [recebida("curso", { materia: "calculo", curso: curso("x"), pedido: "outro" })];
		espera.receber(primeiras);
		await Promise.resolve();
		expect(resolvida).toBeUndefined();
		expect(espera.quantos).toBe(1);
		espera.receber([...primeiras, recebida("curso", { materia: "calculo", curso: curso("a"), pedido: "p1" })]);
		await promessa;
		expect(resolvida).toMatchObject({ tipo: "curso", dados: { curso: { id: "a" } } });
		expect(espera.quantos).toBe(0);
	});

	it("uma resposta que já tinha chegado antes de esperar também vale", async () => {
		const espera = new EsperaDePedidos();
		espera.receber([recebida("descartado", { materia: "calculo", curso: "a", pedido: "p1" })]);
		await expect(espera.esperar("p1")).resolves.toMatchObject({ tipo: "descartado" });
	});

	it("um erro com o pedido rejeita com a frase da extensão", async () => {
		const espera = new EsperaDePedidos();
		const promessa = espera.esperar("p1");
		espera.receber([recebida("erro", { ao: "confirmar", mensagem: "Escolha pelo menos um conceito do mapa para o curso.", pedido: "p1" })]);
		await expect(promessa).rejects.toThrow("Escolha pelo menos um conceito do mapa para o curso.");
		await expect(promessa).rejects.toBeInstanceOf(ErroDaPonte);
	});

	it("falhar rejeita um pedido; cancelar rejeita todos os que ficaram esperando", async () => {
		const espera = new EsperaDePedidos();
		const um = espera.esperar("p1");
		const dois = espera.esperar("p2");
		const tres = espera.esperar("p3");
		espera.falhar("p1", new Error("A conexão caiu."));
		espera.cancelar("A conversa mudou.");
		await expect(um).rejects.toThrow("A conexão caiu.");
		await expect(dois).rejects.toThrow("A conversa mudou.");
		await expect(tres).rejects.toThrow("A conversa mudou.");
		expect(espera.quantos).toBe(0);
	});
});
