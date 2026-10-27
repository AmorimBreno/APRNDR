// As partes puras do código ao lado e do destaque do código citado
// (codigo-citado.ts): o casamento de um `código em linha` com o código (literal,
// palavra, símbolos, um caractere só, nenhum e vários) e a separação dos
// blocos de código principais do texto da explicação.

import { describe, expect, it } from "vitest";
import { casaComValor, casarTrecho, separarCodigoPrincipal } from "./codigo-citado.ts";

/** Os pedaços do código que o trecho destaca. */
const pedacos = (trecho: string, codigo: string) => casarTrecho(trecho, codigo).map(({ inicio, fim }) => codigo.slice(inicio, fim));

const CODIGO = [
	"stop_words_port = stopwords.words(\"portuguese\")",
	"",
	'doc = "A escola tem livros."',
	"tokens = word_tokenize(doc.lower())",
	"tokens_clean = [each for each in tokens if each not in stop_words_port]",
].join("\n");

describe("casarTrecho", () => {
	it("casa um literal entre aspas com as aspas simples e as duplas", () => {
		const codigo = "a = ['escola', 'tem']\nb = \"escola\"\nc = 'escolas'";
		expect(pedacos("'escola'", codigo)).toEqual(["'escola'", '"escola"']);
		expect(pedacos('"escola"', codigo)).toEqual(["'escola'", '"escola"']);
	});

	it("casa uma palavra só em limite de palavra e pega as aspas do literal que ela preenche", () => {
		expect(pedacos("escola", CODIGO)).toEqual(["escola"]);
		expect(pedacos("escola", "['a', 'escola', 'escolas', 'pre_escola']")).toEqual(["'escola'"]);
		expect(pedacos("doc", CODIGO)).toEqual(["doc", "doc"]);
		expect(pedacos("each", CODIGO)).toEqual(["each", "each", "each"]);
	});

	it("casa um trecho com símbolos como subsequência exata, com os espaços normalizados", () => {
		expect(pedacos("each not in stop_words_port", CODIGO)).toEqual(["each not in stop_words_port"]);
		expect(pedacos("each  not\nin   stop_words_port", CODIGO)).toEqual(["each not in stop_words_port"]);
		expect(pedacos("doc.lower()", CODIGO)).toEqual(["doc.lower()"]);
		expect(pedacos("stopwords.words('portuguese')", CODIGO)).toEqual(['stopwords.words("portuguese")']);
		// Os espaços e as quebras de linha do código também são normalizados.
		expect(pedacos("each not in stop_words_port", "x = [e for e in t if each not  in\n stop_words_port]")).toEqual(["each not  in\n stop_words_port"]);
		expect(pedacos("doc.lower()", "mydoc.lower()")).toEqual([]);
	});

	it("não destaca um caractere solto: a letra só como identificador ou item, o símbolo só como literal", () => {
		const codigo = "casa = ['a', 'b', '.']\nfor a in casa:\n    print(a.upper())";
		expect(pedacos("a", codigo)).toEqual(["'a'", "a", "a"]);
		expect(pedacos(".", codigo)).toEqual(["'.'"]);
		expect(pedacos(",", codigo)).toEqual([]);
		expect(pedacos("'.'", codigo)).toEqual(["'.'"]);
	});

	it("sem casamento, nada", () => {
		expect(casarTrecho("trash", CODIGO)).toEqual([]);
		expect(casarTrecho("", CODIGO)).toEqual([]);
		expect(casarTrecho("   ", CODIGO)).toEqual([]);
		expect(casarTrecho("escola", "")).toEqual([]);
	});

	it("vários casamentos: todos, sem sobrepor, com as posições do código original", () => {
		const codigo = "x = 1\nx  =  x + 1\nprint(x)";
		expect(casarTrecho("x", codigo)).toEqual([
			{ inicio: 0, fim: 1 },
			{ inicio: 6, fim: 7 },
			{ inicio: 12, fim: 13 },
			{ inicio: 24, fim: 25 },
		]);
		expect(pedacos("x = x + 1", codigo)).toEqual(["x  =  x + 1"]);
	});

	it("casa o valor de uma caixa de vetor", () => {
		expect(casaComValor("escola", "'escola'")).toBe(true);
		expect(casaComValor("'escola'", '"escola"')).toBe(true);
		expect(casaComValor("a", "'a'")).toBe(true);
		expect(casaComValor("a", "'casa'")).toBe(false);
		expect(casaComValor("6", "6")).toBe(true);
		expect(casaComValor("6", "16")).toBe(false);
		expect(casaComValor(".", "'.'")).toBe(true);
	});
});

describe("separarCodigoPrincipal", () => {
	const principal = "```python\nimport nltk\ndoc = 'A escola'\nprint(doc)\n```";

	it("tira o bloco com linguagem e 3 linhas ou mais e deixa o texto em volta", () => {
		const { texto, principais } = separarCodigoPrincipal(`Antes do código.\n\n${principal}\n\nDepois do código.`);
		expect(principais).toEqual([principal]);
		expect(texto).not.toContain("import nltk");
		expect(texto).toContain("Antes do código.");
		expect(texto).toContain("Depois do código.");
	});

	it("deixa no texto a saída curta, o vetor, a matriz e o bloco sem linguagem", () => {
		const curta = "```python\n['a', 'escola', 'tem', 'livros', '.']\n```";
		const duas = "```text\necon\neconom\n```";
		const vetor = "```vetor\n# pesos\n[6, 3,\n 8, 12]\n```";
		const matriz = "```matriz\n[[1, 2],\n [3, 4],\n [5, 6]]\n```";
		const semLinguagem = "```\num\ndois\ntrês\n```";
		const markdown = [principal, curta, duas, vetor, matriz, semLinguagem].join("\n\nTexto.\n\n");
		const { texto, principais } = separarCodigoPrincipal(markdown);
		expect(principais).toEqual([principal]);
		for (const bloco of [curta, duas, vetor, matriz, semLinguagem]) expect(texto).toContain(bloco);
	});

	it("conta as linhas sem as linhas em branco do fim e guarda vários principais na ordem", () => {
		const outro = "~~~js\nconst a = 1;\n\nconsole.log(a);\n~~~";
		const quaseVazio = "```python\nx = 1\n\n\n```";
		const { texto, principais } = separarCodigoPrincipal(`${principal}\n\nMeio.\n\n${quaseVazio}\n\n${outro}`);
		expect(principais).toEqual([principal, outro]);
		expect(texto).toContain(quaseVazio);
	});

	it("deixa no texto o bloco recuado (dentro de uma lista) e a cerca sem fechamento", () => {
		const naLista = "1. Passo:\n\n   ```python\n   a = 1\n   b = 2\n   c = 3\n   ```";
		expect(separarCodigoPrincipal(naLista)).toEqual({ texto: naLista, principais: [] });
		const aberta = "Texto.\n\n```python\na = 1\nb = 2\nc = 3";
		expect(separarCodigoPrincipal(aberta)).toEqual({ texto: aberta, principais: [] });
	});

	it("sem bloco principal, o texto como veio", () => {
		expect(separarCodigoPrincipal("Só texto com `código`.")).toEqual({ texto: "Só texto com `código`.", principais: [] });
	});
});
