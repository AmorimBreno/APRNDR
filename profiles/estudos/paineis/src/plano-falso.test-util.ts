// Só para os testes da tela dos planos: uma leitura mínima do plano (a mesma regra do contrato, sem os casos de borda),
// para os testes de tela não dependerem das funções reais de lib/plano-tipos.ts (que o WP1 implementa).
// Use assim: vi.mock("../../lib/plano-tipos.ts", async (original) => (await import("./plano-falso.test-util.ts")).comLeituraFalsa(await original()));

import type * as PlanoTipos from "../../lib/plano-tipos.ts";

export function ehPlanoFalso(markdown: string): boolean {
	const primeira = markdown
		.replace(/^﻿/, "")
		.split(/\r?\n/)
		.find((linha) => linha.trim() !== "");
	return primeira?.startsWith("Plano de estudos · ") ?? false;
}

export function lerPlanoFalso(markdown: string): PlanoTipos.PlanoLido | undefined {
	if (!ehPlanoFalso(markdown)) return undefined;
	const itens: PlanoTipos.ItemPlano[] = [];
	const conversas: string[] = [];
	for (const linha of markdown.split(/\r?\n/)) {
		const tarefa = /^- \[( |x)\] (.*)$/.exec(linha);
		if (tarefa) itens.push({ numero: itens.length + 1, texto: tarefa[2]!, feito: tarefa[1] === "x" });
		const conversa = /^- \[[^\]]*\]\(conversa:([^)]+)\)/.exec(linha);
		if (conversa) conversas.push(conversa[1]!);
	}
	const feitos = itens.filter((item) => item.feito).length;
	const atual = itens.find((item) => !item.feito)?.numero;
	return { itens, conversas, feitos, total: itens.length, concluido: itens.length > 0 && feitos === itens.length, ...(atual !== undefined ? { atual } : {}) };
}

export function comLeituraFalsa<T extends typeof PlanoTipos>(original: T): T {
	return { ...original, ehPlanoDeEstudos: ehPlanoFalso, lerPlano: lerPlanoFalso };
}
