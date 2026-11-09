// Rotas por hash do front (sem DOM: só a leitura do hash).

import { describe, expect, it } from "vitest";
import { rotaDoHash, trocaSemTransicao } from "./App.tsx";

describe("rotaDoHash", () => {
	it("tela de perfis, tela inicial do perfil e conversa", () => {
		expect(rotaDoHash("")).toEqual({ conversa: false });
		expect(rotaDoHash("#/")).toEqual({ conversa: false });
		expect(rotaDoHash("#/perfil/estudos")).toEqual({ perfil: "estudos", conversa: false });
		expect(rotaDoHash("#/perfil/estudos/conversa")).toEqual({ perfil: "estudos", conversa: true });
		expect(rotaDoHash("#/perfil/meu%20perfil")).toEqual({ perfil: "meu perfil", conversa: false });
		expect(rotaDoHash("#/perfil/estudos/outra")).toEqual({ perfil: "estudos", conversa: false, caminho: "outra" });
		expect(rotaDoHash("#/perfil/estudos/caderno/c%C3%A1lculo/notas/")).toEqual({ perfil: "estudos", conversa: false, caminho: "caderno/cálculo/notas" });
		expect(rotaDoHash("#/outra")).toEqual({ conversa: false });
	});
});

// Contrato do WP3 (docs/mesa-de-estudo.md, 2.9).
describe("semTransicao da tela inicial (WP3)", () => {
	// As abas da mesa: só as trocas entre notas/lições do caderno não animam.
	const entrada = { semTransicao: (de: string, para: string) => de.startsWith("caderno/") && para.startsWith("caderno/") };

	it("a troca de subtela que a entrada marca com semTransicao acontece sem a View Transition", () => {
		expect(trocaSemTransicao(entrada, "#/perfil/estudos/caderno/calculo/notas/a", "#/perfil/estudos/caderno/calculo/notas/b")).toBe(true);
		// Voltar e avançar são hashchange como os outros: o sentido não importa.
		expect(trocaSemTransicao(entrada, "#/perfil/estudos/caderno/calculo/notas/b", "#/perfil/estudos/caderno/calculo/notas/a")).toBe(true);
	});

	it("as outras trocas animam como antes", () => {
		// A entrada diz que não (da tela principal para o caderno).
		expect(trocaSemTransicao(entrada, "#/perfil/estudos", "#/perfil/estudos/caderno/calculo")).toBe(false);
		// Outro perfil, a conversa em tela cheia e a tela de perfis nunca passam pela entrada.
		expect(trocaSemTransicao(entrada, "#/perfil/estudos/caderno/a", "#/perfil/outro/caderno/a")).toBe(false);
		expect(trocaSemTransicao(entrada, "#/perfil/estudos/caderno/a", "#/perfil/estudos/conversa")).toBe(false);
		expect(trocaSemTransicao(entrada, "#/perfil/estudos/conversa", "#/perfil/estudos/caderno/a")).toBe(false);
		expect(trocaSemTransicao(entrada, "#/", "#/perfil/estudos/caderno/a")).toBe(false);
		// Sem semTransicao na entrada (ou sem entrada), toda troca anima.
		expect(trocaSemTransicao({}, "#/perfil/estudos/caderno/a", "#/perfil/estudos/caderno/b")).toBe(false);
		expect(trocaSemTransicao(undefined, "#/perfil/estudos/caderno/a", "#/perfil/estudos/caderno/b")).toBe(false);
	});
});
