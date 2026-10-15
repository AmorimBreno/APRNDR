import { describe, expect, it } from "vitest";
import {
	ErroModelo,
	interpretarRaciocinio,
	listarModelosDisponiveis,
	type ModeloPi,
	type RegistroModelos,
	resolverModelo,
	separarNomeModelo,
} from "./modelos.ts";

function modelo(provider: string, id: string, extra: Partial<ModeloPi> = {}): ModeloPi {
	return {
		provider,
		id,
		name: id,
		api: "openai-completions",
		baseUrl: "",
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		reasoning: false,
		contextWindow: 1000,
		maxTokens: 100,
		...extra,
	} as ModeloPi;
}

function registro(modelos: ModeloPi[], provedoresComChave: string[]): RegistroModelos {
	return {
		getModel: (provedor, id) => modelos.find((item) => item.provider === provedor && item.id === id),
		hasConfiguredAuth: (provedor) => provedoresComChave.includes(provedor),
		getAvailable: async () => modelos.filter((item) => provedoresComChave.includes(item.provider)),
	};
}

describe("separarNomeModelo", () => {
	it("separa o provedor na primeira barra e mantém as outras no id", () => {
		expect(separarNomeModelo("openrouter/openai/gpt-6.1-sol")).toEqual({ provedor: "openrouter", id: "openai/gpt-6.1-sol" });
	});

	it("recusa nomes sem provedor ou sem id", () => {
		for (const nome of ["gpt-6.1-sol", "/openai/gpt", "openrouter/", ""]) {
			expect(() => separarNomeModelo(nome)).toThrow(ErroModelo);
		}
	});
});

describe("resolverModelo", () => {
	const sol = modelo("openrouter", "openai/gpt-6.1-sol");
	const reg = registro([sol, modelo("anthropic", "claude-sonnet-5.5")], ["openrouter"]);

	it("acha o modelo pelo provedor e id", () => {
		expect(resolverModelo(reg, "openrouter/openai/gpt-6.1-sol")).toBe(sol);
	});

	it("erro claro com o nome quando o modelo não existe", () => {
		expect(() => resolverModelo(reg, "openrouter/openai/gpt-9")).toThrow(
			/Modelo "openrouter\/openai\/gpt-9" não existe no registro de modelos do pi/,
		);
	});

	it("erro claro quando o provedor não tem credencial", () => {
		expect(() => resolverModelo(reg, "anthropic/claude-sonnet-5.5")).toThrow(/provedor "anthropic" não tem credencial/);
	});
});

describe("interpretarRaciocinio", () => {
	it("aceita os níveis do pi, sem diferenciar maiúsculas", () => {
		expect(interpretarRaciocinio("medium")).toEqual({ nivel: "medium" });
		expect(interpretarRaciocinio(" High ")).toEqual({ nivel: "high" });
		expect(interpretarRaciocinio(undefined)).toEqual({});
	});

	it("nível desconhecido vira aviso", () => {
		const resultado = interpretarRaciocinio("turbo");
		expect(resultado.nivel).toBeUndefined();
		expect(resultado.aviso).toMatch(/"turbo" desconhecido/);
	});
});

describe("listarModelosDisponiveis", () => {
	it("só os provedores com credencial, em ordem de nome", async () => {
		const reg = registro(
			[
				modelo("openrouter", "z-ai/glm-5.3", { reasoning: true }),
				modelo("openrouter", "anthropic/claude-sonnet-5.5", { input: ["text", "image"] }),
				modelo("anthropic", "claude-sonnet-5.5"),
			],
			["openrouter"],
		);
		const lista = await listarModelosDisponiveis(reg);
		expect(lista.map((item) => item.nome)).toEqual(["openrouter/anthropic/claude-sonnet-5.5", "openrouter/z-ai/glm-5.3"]);
		expect(lista[0]).toMatchObject({ provedor: "openrouter", id: "anthropic/claude-sonnet-5.5", imagem: true, raciocinio: false });
		expect(lista[1]).toMatchObject({ raciocinio: true, imagem: false });
	});
});
