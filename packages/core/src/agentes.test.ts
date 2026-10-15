import { describe, expect, it } from "vitest";
import { ErroAgente, interpretarAgente } from "./agentes.ts";

describe("interpretarAgente", () => {
	it("separa campos conhecidos, extra e prompt", () => {
		const texto = [
			"---",
			"name: pesquisador",
			"description: \"Pesquisa: busca na web\"",
			"tools: web_search, web_fetch ,read",
			"# comentário ignorado",
			"model: openrouter/z-ai/glm-5.3",
			"thinking: medium",
			"auto-exit: true",
			"---",
			"",
			"Você pesquisa.",
			"",
		].join("\r\n");
		const agente = interpretarAgente(texto, "pesquisador.md");
		expect(agente.nome).toBe("pesquisador");
		expect(agente.descricao).toBe("Pesquisa: busca na web");
		expect(agente.ferramentas).toEqual(["web_search", "web_fetch", "read"]);
		expect(agente.skills).toEqual([]);
		expect(agente.modelo).toBe("openrouter/z-ai/glm-5.3");
		expect(agente.raciocinio).toBe("medium");
		expect(agente.extra).toEqual({ "auto-exit": true });
		expect(agente.prompt).toBe("Você pesquisa.");
	});

	it("exige frontmatter e name", () => {
		expect(() => interpretarAgente("sem frontmatter", "a.md")).toThrow(ErroAgente);
		expect(() => interpretarAgente("---\nmodel: x\n---\ncorpo", "a.md")).toThrow(/campo name/);
	});
});
