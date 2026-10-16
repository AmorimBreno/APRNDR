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
		expect(rotaDoHash("#/perfil/estudos/outra")).toEqual({ conversa: false });
	});
});
