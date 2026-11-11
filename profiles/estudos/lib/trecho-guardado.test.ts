import { describe, it } from "vitest";

// Contrato do WP0 (docs/mesa-parte-c.md, seção 5). O WP1 troca cada todo por um teste de verdade.
describe("formatarTrechoGuardado", () => {
	it.todo("cita o bloco em markdown com a linha de fonte e o id curto da conversa em comentário");
	it.todo("mantém listas, código e fórmulas do bloco dentro da citação");
	it.todo("a data sai como dd/mm/aaaa");
});

describe("idCurtoDaConversa", () => {
	it.todo("é estável para a mesma sessão e diferente para sessões diferentes");
});
