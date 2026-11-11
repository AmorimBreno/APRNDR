import { describe, it } from "vitest";

// Contrato do WP0 (docs/mesa-parte-c.md, seção 3). O WP2 troca cada todo por um teste de verdade.
describe("acharNoTexto", () => {
	it.todo("acha o texto exato com o contexto (antes e depois) quando há mais de uma ocorrência");
	it.todo("sem contexto que case, acha a primeira ocorrência exata");
	it.todo("compara com espaços juntos e sem diferença de caixa, devolvendo índices do texto original");
	it.todo("não acha: devolve undefined, e quem chama cai no bloco e no começo da aba");
	it.todo("seleção de fórmula do KaTeX (texto duplicado) não acha e cai no bloco");
});

describe("resolução da âncora na tela", () => {
	it.todo("a rolagem guardada da aba não vence a âncora pendente");
	it.todo("a âncora espera o conteúdo ficar pronto e desiste depois do prazo");
	it.todo("lição com bloco reescrito (versão diferente) acha o texto ou cai no bloco, com aviso");
});
