// Testes do leitor do JSON das respostas dos modelos (json-do-modelo.ts).

import { describe, expect, it } from "vitest";
import { objetoJsonDoModelo } from "./json-do-modelo.ts";

const COM_CODIGO = { questoes: [{ contexto: "Rode:\n\n```python\nprint({'a': 1})\n```\n\nE depois `f()`.", enunciado: "O que sai?" }] };
const json = JSON.stringify(COM_CODIGO);

describe("objetoJsonDoModelo", () => {
	it("o JSON puro", () => {
		expect(objetoJsonDoModelo(json)).toEqual(COM_CODIGO);
		expect(objetoJsonDoModelo(`  \n${JSON.stringify(COM_CODIGO, null, 2)}\n `)).toEqual(COM_CODIGO);
	});

	it("a cerca ```json ou ``` em volta do texto inteiro, mesmo com cercas dentro das strings", () => {
		expect(objetoJsonDoModelo(`\`\`\`json\n${json}\n\`\`\``)).toEqual(COM_CODIGO);
		expect(objetoJsonDoModelo(`\`\`\`\n${JSON.stringify(COM_CODIGO, null, "\t")}\n\`\`\`\n`)).toEqual(COM_CODIGO);
	});

	it("texto antes e depois, com cerca no meio e chaves no texto", () => {
		expect(objetoJsonDoModelo(`Aqui está o JSON:\n${json}\nQualquer dúvida, diga.`)).toEqual(COM_CODIGO);
		expect(objetoJsonDoModelo(`Segue:\n\`\`\`json\n${json}\n\`\`\`\nPronto {fim}.`)).toEqual(COM_CODIGO);
		expect(objetoJsonDoModelo(`Usei a notação {x} da aula. ${json}`)).toEqual(COM_CODIGO);
	});

	it("chaves e aspas escapadas dentro das strings", () => {
		const valor = { texto: 'A fração $\\frac{a}{b}$, o conjunto {1, 2} e "aspas" com } solta', lista: [{ a: "}" }] };
		expect(objetoJsonDoModelo(`Resposta: ${JSON.stringify(valor)} fim }`)).toEqual(valor);
	});

	it("sem objeto é erro; JSON quebrado ou cortado também, sem devolver um objeto de dentro", () => {
		expect(() => objetoJsonDoModelo("nada aqui")).toThrow("a resposta não tem um objeto JSON");
		expect(() => objetoJsonDoModelo("[1, 2]")).toThrow("a resposta não tem um objeto JSON");
		expect(() => objetoJsonDoModelo("{ quebrado }")).toThrow(/^o JSON está inválido \(/);
		expect(() => objetoJsonDoModelo('{"questoes": [{"a": 1}, {"b": 2')).toThrow(/^o JSON está inválido \(/);
	});
});
