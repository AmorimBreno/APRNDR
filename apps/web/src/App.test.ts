// Rotas por hash do front (sem DOM: só a leitura do hash).

import { describe, expect, it } from "vitest";
import { rotaDoHash } from "./App.tsx";

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
