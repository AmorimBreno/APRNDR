import { describe, expect, it, vi } from "vitest";
import { type FonteVendo, LIMITE_CONTEUDO_VENDO } from "./vendo.ts";
import { type AbaDaBancada, contextoDaFonte, LIMITE_SOMA_VENDO, lerFonte, montarContextos } from "./vendo.tsx";

function fonte(texto: () => string | undefined): FonteVendo {
	return { tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", texto };
}

describe("contextoDaFonte", () => {
	it("sem fonte, sem contexto", () => {
		expect(contextoDaFonte(undefined, true)).toBeUndefined();
	});

	it("olho aberto: chama texto() e manda o conteúdo inteiro", () => {
		const texto = vi.fn(() => "# Séries\nconteúdo");
		expect(contextoDaFonte(fonte(texto), true)).toEqual({ tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", olho: true, conteudo: "# Séries\nconteúdo" });
		expect(texto).toHaveBeenCalledOnce();
	});

	it("olho aberto: corta em LIMITE_CONTEUDO_VENDO e marca parcial", () => {
		const contexto = contextoDaFonte(fonte(() => "a".repeat(LIMITE_CONTEUDO_VENDO + 10)), true);
		expect(contexto?.conteudo).toHaveLength(LIMITE_CONTEUDO_VENDO);
		expect(contexto?.parcial).toBe(true);
	});

	it("no limite exato não é parcial", () => {
		const contexto = contextoDaFonte(fonte(() => "a".repeat(LIMITE_CONTEUDO_VENDO)), true);
		expect(contexto?.parcial).toBeUndefined();
	});

	it("olho fechado: não chama texto() e não manda conteúdo", () => {
		const texto = vi.fn(() => "segredo");
		const contexto = contextoDaFonte(fonte(texto), false);
		expect(texto).not.toHaveBeenCalled();
		expect(contexto).toEqual({ tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", olho: false });
	});

	it("texto() que devolve undefined ou vazio: sem conteúdo, sem aviso", () => {
		for (const texto of [() => undefined, () => ""]) {
			const leitura = lerFonte(fonte(texto), true);
			expect(leitura.contexto.conteudo).toBeUndefined();
			expect(leitura.falhou).toBe(false);
		}
	});

	it("texto() que lança: sem conteúdo e falhou = true para o chip avisar", () => {
		const leitura = lerFonte(
			fonte(() => {
				throw new Error("buffer indisponível");
			}),
			true,
		);
		expect(leitura.contexto).toEqual({ tipo: "nota", rotulo: "Séries", origem: "caderno/calc/notas/Séries", olho: true });
		expect(leitura.falhou).toBe(true);
	});
});

describe("montarContextos", () => {
	const nota = (chave: string): AbaDaBancada => ({ chave, tipo: "nota", rotulo: chave, caminho: chave });
	const licao: AbaDaBancada = { tipo: "licao", chave: "caderno/calc/cursos/c1/modulos/m1", rotulo: "Lição", caminho: "caderno/calc/cursos/c1/modulos/m1/l2" };
	const fonteDe = (chave: string, texto: () => string | undefined): FonteVendo => ({ tipo: "nota", rotulo: `Ativa ${chave}`, origem: chave, texto });
	const copias = new Map<string, string>();
	const entrada = (parcial: Partial<Parameters<typeof montarContextos>[0]> & Pick<Parameters<typeof montarContextos>[0], "abas">) => ({
		chaveFoco: undefined,
		selecionadas: new Set<string>(),
		ativa: undefined,
		copia: (chave: string) => copias.get(chave),
		guardarCopia: (chave: string, texto: string) => void copias.set(chave, texto),
		...parcial,
	});

	it("um contexto por aba, na ordem, com foco só na aba em foco; a não selecionada vai sem conteúdo", async () => {
		copias.clear();
		const { contextos } = await montarContextos(
			entrada({ abas: [nota("caderno/calc/notas/A"), nota("caderno/calc/notas/B")], chaveFoco: "caderno/calc/notas/B", selecionadas: new Set(["caderno/calc/notas/B"]), ativa: fonteDe("caderno/calc/notas/B", () => "texto B") }),
		);
		expect(contextos).toEqual([
			{ tipo: "nota", rotulo: "caderno/calc/notas/A", origem: "caderno/calc/notas/A", olho: false },
			{ tipo: "nota", rotulo: "Ativa caderno/calc/notas/B", origem: "caderno/calc/notas/B", olho: true, foco: true, conteudo: "texto B" },
		]);
	});

	it("a aba fora de foco selecionada manda a cópia guardada; o envio guarda a cópia da ativa", async () => {
		copias.clear();
		copias.set("caderno/calc/notas/A", "copia A");
		await montarContextos(entrada({ abas: [nota("caderno/calc/notas/A"), nota("caderno/calc/notas/B")], chaveFoco: "caderno/calc/notas/B", ativa: fonteDe("caderno/calc/notas/B", () => "texto B") }));
		expect(copias.get("caderno/calc/notas/B")).toBe("texto B");
		const { contextos } = await montarContextos(entrada({ abas: [nota("caderno/calc/notas/A")], selecionadas: new Set(["caderno/calc/notas/A"]) }));
		expect(contextos[0]).toMatchObject({ olho: true, conteudo: "copia A" });
	});

	it("nota sem cópia pede pela ponte; sem resposta vai só com o nome; lição sem cópia vai só com o nome", async () => {
		copias.clear();
		const pedirNota = vi.fn(async () => "da ponte");
		const a = nota("caderno/calc/notas/A");
		const com = await montarContextos(entrada({ abas: [a], selecionadas: new Set([a.chave]), pedirNota }));
		expect(com.contextos[0]?.conteudo).toBe("da ponte");
		copias.clear();
		const sem = await montarContextos(entrada({ abas: [a, licao], selecionadas: new Set([a.chave, licao.chave]), pedirNota: async () => undefined }));
		expect(sem.contextos.map((c) => [c.olho, c.conteudo])).toEqual([
			[true, undefined],
			[true, undefined],
		]);
		expect(pedirNota).toHaveBeenCalledOnce();
	});

	it("corta cada conteúdo e a soma, marcando parcial; a aba em foco é servida primeiro", async () => {
		copias.clear();
		const a = nota("caderno/calc/notas/A");
		const b = nota("caderno/calc/notas/B");
		copias.set(a.chave, "a".repeat(LIMITE_CONTEUDO_VENDO + 5));
		const { contextos } = await montarContextos(entrada({ abas: [a, b], chaveFoco: b.chave, selecionadas: new Set([a.chave, b.chave]), ativa: fonteDe(b.chave, () => "b".repeat(LIMITE_CONTEUDO_VENDO)) }));
		expect(contextos[1]?.conteudo).toHaveLength(LIMITE_CONTEUDO_VENDO);
		expect(contextos[1]?.parcial).toBeUndefined();
		expect(contextos[0]?.conteudo).toHaveLength(LIMITE_SOMA_VENDO - LIMITE_CONTEUDO_VENDO);
		expect(contextos[0]?.parcial).toBe(true);
	});

	it("texto() da ativa que lança: sem conteúdo e falhou", async () => {
		copias.clear();
		const a = nota("caderno/calc/notas/A");
		const resultado = await montarContextos(
			entrada({
				abas: [a],
				chaveFoco: a.chave,
				selecionadas: new Set([a.chave]),
				ativa: fonteDe(a.chave, () => {
					throw new Error("x");
				}),
			}),
		);
		expect(resultado.falhou).toBe(true);
		expect(resultado.contextos[0]?.conteudo).toBeUndefined();
	});
});
