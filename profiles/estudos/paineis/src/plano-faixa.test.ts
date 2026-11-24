// As partes puras da faixa do plano (plano-faixa.ts), com a leitura do plano trocada pela falsa de plano-falso.test-util.ts.

import { describe, expect, it, vi } from "vitest";
import { comecaComATag, dadosDaFaixa, linksDeConversa, mesmaFaixa, textoDaFaixa } from "./plano-faixa.ts";

vi.mock("../../lib/plano-tipos.ts", async (original) => (await import("./plano-falso.test-util.ts")).comLeituraFalsa(await original()));

const PLANO = [
	"Plano de estudos · criado em 24/11/2026",
	"**Objetivo:** prova",
	"",
	"## Itens",
	"- [x] **Q1**",
	"- [ ] **Q2**",
	"- [ ] **Q3**",
	"",
	"## Conversas",
	"- [24/11/2026](conversa:abc12345)",
	"- [25/11/2026](conversa:def67890)",
].join("\n");

describe("dadosDaFaixa", () => {
	it("progresso, conversas na ordem e o texto do link como rótulo", () => {
		const faixa = dadosDaFaixa(PLANO)!;
		expect(faixa).toMatchObject({ feitos: 1, total: 3, concluido: false });
		expect(faixa.conversas).toEqual([
			{ id: "abc12345", rotulo: "24/11/2026" },
			{ id: "def67890", rotulo: "25/11/2026" },
		]);
		expect(textoDaFaixa(faixa)).toBe("1 de 3");
	});

	it("acompanha o markdown ao vivo: marcar um item muda o progresso; tudo marcado vira 'concluído'", () => {
		expect(dadosDaFaixa(PLANO.replace("- [ ] **Q2**", "- [x] **Q2**"))?.feitos).toBe(2);
		const feito = dadosDaFaixa(PLANO.replaceAll("- [ ]", "- [x]"))!;
		expect(feito.concluido).toBe(true);
		expect(textoDaFaixa(feito)).toBe("concluído");
	});

	it("sem a tag, não é plano", () => {
		expect(dadosDaFaixa(PLANO.split("\n").slice(1).join("\n"))).toBeUndefined();
		expect(dadosDaFaixa("# Uma nota")).toBeUndefined();
	});

	it("um link sem texto ganha 'conversa N'", () => {
		expect(dadosDaFaixa(`${PLANO.split("\n## Conversas")[0]}\n## Conversas\n- [](conversa:zzz)`)?.conversas).toEqual([{ id: "zzz", rotulo: "conversa 1" }]);
	});
});

describe("ajudas", () => {
	it("linksDeConversa lê os links e não repete", () => {
		expect([...linksDeConversa("[a](conversa:x1) e [b](conversa:X1) e [c](https://x)")]).toEqual([["x1", "a"]]);
	});

	it("mesmaFaixa compara o que a faixa mostra", () => {
		const a = dadosDaFaixa(PLANO)!;
		expect(mesmaFaixa(a, dadosDaFaixa(PLANO))).toBe(true);
		expect(mesmaFaixa(a, dadosDaFaixa(PLANO.replace("[ ] **Q3**", "[x] **Q3**")))).toBe(false);
		expect(mesmaFaixa(undefined, null)).toBe(true);
		expect(mesmaFaixa(a, undefined)).toBe(false);
	});

	it("comecaComATag olha só o começo", () => {
		expect(comecaComATag("Plano de estudos · criado em 24/11/2026")).toBe(true);
		expect(comecaComATag("Meu plano de estudos")).toBe(false);
		expect(comecaComATag(undefined)).toBe(false);
	});
});
