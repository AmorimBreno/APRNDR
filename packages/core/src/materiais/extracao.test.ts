// Testes dos extratores com arquivos montados na hora: PDFs do pdf-lib (uma
// página de texto, um slide quase sem texto, uma página com imagem grande),
// um .py, um notebook e um markdown. A visão é um "descrever" falso.

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extrairArquivo, hashDe, tipoDoArquivo } from "./extrair.ts";
import { gravarExtraido, lerManifesto, lerTrechos, pastaDoExtraido } from "./extraido.ts";
import { extrairNotebook } from "./notebook.ts";
import { precisaDeVisao } from "./pdf.ts";
import { comandoPython, trechosPython } from "./python.ts";
import { extrairTexto } from "./texto.ts";
import type { Descrever, PedidoDescricao } from "./tipos.ts";

let pasta = "";

beforeEach(async () => {
	pasta = await mkdtemp(join(tmpdir(), "estudos-materiais-"));
});

afterEach(async () => {
	await rm(pasta, { recursive: true, force: true });
	comandoPython.arquivo = "python";
});

/** Um "descrever" que guarda os pedidos e responde com o local. */
function visaoFalsa(): { descrever: Descrever; pedidos: PedidoDescricao[] } {
	const pedidos: PedidoDescricao[] = [];
	return {
		pedidos,
		descrever: async (pedido) => {
			pedidos.push(pedido);
			return { texto: `Descrição da ${pedido.local}.`, modelo: "modelo/falso", custo: 0.01 };
		},
	};
}

const PARAGRAFO =
	"A derivada mede a taxa de variação instantânea de uma função. Ela é o limite da razão entre o acréscimo da função e o acréscimo da variável quando este tende a zero. ";

async function pdfDeTeste(): Promise<Uint8Array> {
	const documento = await PDFDocument.create();
	const fonte = await documento.embedFont(StandardFonts.Helvetica);
	// 1: texto corrido (mais de 300 caracteres).
	const texto = documento.addPage([600, 800]);
	for (let linha = 0; linha < 6; linha++) texto.drawText(PARAGRAFO.slice(0, 90), { x: 30, y: 760 - linha * 20, size: 10, font: fonte });
	texto.drawText("Segunda linha com acentuação: função, variação.", { x: 30, y: 600, size: 10, font: fonte });
	// 2: slide quase sem texto, com um desenho.
	const slide = documento.addPage([800, 600]);
	slide.drawText("Gráfico da função", { x: 40, y: 550, size: 24, font: fonte });
	slide.drawRectangle({ x: 100, y: 100, width: 500, height: 300, color: rgb(0.2, 0.5, 0.3) });
	// 3: bastante texto, mas uma imagem cobrindo metade da página.
	const canvas = createCanvas(200, 200);
	const contexto = canvas.getContext("2d");
	contexto.fillStyle = "#336699";
	contexto.fillRect(0, 0, 200, 200);
	const imagem = await documento.embedPng(await canvas.encode("png"));
	const comImagem = documento.addPage([600, 800]);
	for (let linha = 0; linha < 6; linha++) comImagem.drawText(PARAGRAFO.slice(0, 90), { x: 30, y: 760 - linha * 20, size: 10, font: fonte });
	comImagem.drawImage(imagem, { x: 0, y: 0, width: 600, height: 400 });
	return documento.save();
}

describe("pdf", () => {
	it("a regra da visão: pouco texto, imagem grande ou gráfico", () => {
		expect(precisaDeVisao({ caracteres: 120, maiorImagem: 0, caminhos: 0 })).toBe(true);
		expect(precisaDeVisao({ caracteres: 2000, maiorImagem: 0.5, caminhos: 0 })).toBe(true);
		expect(precisaDeVisao({ caracteres: 900, maiorImagem: 0.05, caminhos: 80 })).toBe(true);
		expect(precisaDeVisao({ caracteres: 2000, maiorImagem: 0.05, caminhos: 80 })).toBe(false);
		expect(precisaDeVisao({ caracteres: 2000, maiorImagem: 0.05, caminhos: 3 })).toBe(false);
	});

	it("texto por página; o slide e a página com imagem grande vão para a visão com o PNG e o texto", async () => {
		const arquivo = join(pasta, "aula-04.pdf");
		await writeFile(arquivo, await pdfDeTeste());
		const { descrever, pedidos } = visaoFalsa();
		const progresso: string[] = [];
		const extracao = await extrairArquivo(arquivo, { descrever, aoProgredir: ({ etapa }) => progresso.push(etapa) });
		expect(extracao.tipo).toBe("pdf");
		expect(extracao.trechos.map((trecho) => [trecho.local, trecho.nome, trecho.origem])).toEqual([
			["página 1", "pagina-001", "texto"],
			["página 2", "pagina-002", "visao"],
			["página 3", "pagina-003", "visao"],
		]);
		expect(extracao.trechos[0]!.texto).toContain("função, variação");
		expect(extracao.trechos[1]).toMatchObject({ modelo: "modelo/falso", texto: "Descrição da página 2." });
		expect(pedidos.map((pedido) => [pedido.local, pedido.arquivo])).toEqual([
			["página 2", "aula-04.pdf"],
			["página 3", "aula-04.pdf"],
		]);
		expect(pedidos[0]!.texto).toBe("Gráfico da função");
		// É um PNG de verdade.
		expect([...pedidos[0]!.png.slice(1, 4)].map((byte) => String.fromCharCode(byte)).join("")).toBe("PNG");
		expect(extracao.custo).toBeCloseTo(0.02);
		expect(progresso).toContain("descrevendo a página 2 de 3");
	});

	it("sem modelo de visão, fica o texto e um aviso", async () => {
		const arquivo = join(pasta, "aula.pdf");
		await writeFile(arquivo, await pdfDeTeste());
		const extracao = await extrairArquivo(arquivo);
		expect(extracao.trechos.every((trecho) => trecho.origem === "texto")).toBe(true);
		expect(extracao.trechos[1]!.texto).toBe("Gráfico da função");
		expect(extracao.avisos).toHaveLength(2);
		expect(extracao.custo).toBe(0);
	});

	it("uma descrição que falha não derruba o arquivo", async () => {
		const arquivo = join(pasta, "aula.pdf");
		await writeFile(arquivo, await pdfDeTeste());
		const extracao = await extrairArquivo(arquivo, {
			descrever: async () => {
				throw new Error("sem crédito");
			},
		});
		expect(extracao.trechos.map((trecho) => trecho.origem)).toEqual(["texto", "texto", "texto"]);
		expect(extracao.avisos[0]).toMatch(/página 2: a descrição falhou \(sem crédito\)/);
	});
});

const FONTE_PY = `"""Estatística básica."""
import math

PI = math.pi

# Média aritmética.
@cache
def media(xs):
    """Soma dividida pela quantidade."""
    return sum(xs) / len(xs)


class Amostra:
    def __init__(self, xs):
        self.xs = xs

print(media([1, 2, 3]))
`;

describe("python", () => {
	it("cada função e classe vira um trecho, com o decorador e o comentário de cima; o resto é código do módulo", async () => {
		const arquivo = join(pasta, "estatistica.py");
		await writeFile(arquivo, FONTE_PY);
		const extracao = await extrairArquivo(arquivo);
		expect(extracao.avisos).toEqual([]);
		expect(extracao.trechos.map((trecho) => trecho.local)).toEqual([
			"código do módulo (linhas 1–5)",
			"def media (linhas 6–10)",
			"class Amostra (linhas 13–15)",
			"código do módulo (linhas 16–18)",
		]);
		expect(extracao.trechos[1]!.texto).toBe('# Média aritmética.\n@cache\ndef media(xs):\n    """Soma dividida pela quantidade."""\n    return sum(xs) / len(xs)');
		expect(extracao.trechos[3]!.texto.trim()).toBe("print(media([1, 2, 3]))");
		expect(extracao.trechos.every((trecho) => trecho.origem === "codigo")).toBe(true);
	});

	it("sem Python, o arquivo entra em pedaços de linhas com um aviso", async () => {
		comandoPython.arquivo = "python-que-nao-existe";
		const arquivo = join(pasta, "estatistica.py");
		await writeFile(arquivo, FONTE_PY);
		const extracao = await extrairArquivo(arquivo);
		expect(extracao.trechos.map((trecho) => trecho.local)).toEqual(["código do módulo (linhas 1–18)"]);
		expect(extracao.avisos[0]).toMatch(/Sem a estrutura do Python/);
	});

	it("pedaços grandes são divididos", () => {
		const fonte = Array.from({ length: 300 }, (_, indice) => `x${indice} = ${indice}`).join("\n");
		expect(trechosPython(fonte, []).map((trecho) => trecho.linhas)).toEqual([
			[1, 120],
			[121, 240],
			[241, 300],
		]);
	});
});

describe("notebook", () => {
	const notebook = {
		cells: [
			{ cell_type: "markdown", source: ["# Regressão\n", "Ajuste linear."] },
			{
				cell_type: "code",
				source: "print(2 + 2)",
				outputs: [{ output_type: "stream", text: ["4\n"] }],
			},
			{
				cell_type: "code",
				source: ["plt.plot(x, y)"],
				outputs: [{ output_type: "display_data", data: { "image/png": "iVBORw0KGgo=\n", "text/plain": ["<Figure>"] } }],
			},
			{ cell_type: "code", source: "1/0", outputs: [{ output_type: "error", ename: "ZeroDivisionError", evalue: "division by zero" }] },
			{ cell_type: "markdown", source: "" },
		],
	};

	it("uma célula por trecho, com as saídas de texto e a figura descrita", async () => {
		const { descrever, pedidos } = visaoFalsa();
		const extracao = await extrairNotebook(JSON.stringify(notebook), "aula.ipynb", { descrever });
		expect(extracao.trechos.map((trecho) => [trecho.local, trecho.nome, trecho.origem])).toEqual([
			["célula 1", "celula-001", "texto"],
			["célula 2", "celula-002", "codigo"],
			["célula 3", "celula-003", "codigo"],
			["célula 4", "celula-004", "codigo"],
		]);
		expect(extracao.trechos[1]!.texto).toBe("print(2 + 2)\n\nSaída:\n4");
		expect(extracao.trechos[2]!.texto).toBe("plt.plot(x, y)\n\nFigura 1 (descrita por modelo/falso):\nDescrição da figura 1 da célula 3.");
		expect(extracao.trechos[2]!.modelo).toBe("modelo/falso");
		expect(extracao.trechos[3]!.texto).toContain("ZeroDivisionError: division by zero");
		expect(pedidos).toHaveLength(1);
		expect(pedidos[0]!.texto).toBe("plt.plot(x, y)");
		expect(extracao.custo).toBeCloseTo(0.01);
	});

	it("notebook quebrado dá um erro que diz o porquê", async () => {
		await expect(extrairNotebook("{", "x.ipynb")).rejects.toThrow(/não é um JSON válido/);
	});
});

describe("markdown e texto", () => {
	it("seções pelos títulos # e ##, sem confundir com comentário dentro de código", () => {
		const extracao = extrairTexto("Intro.\n\n# Média\nTexto.\n```py\n# não é título\n```\n## Mediana\nOutro.", true);
		expect(extracao.trechos.map((trecho) => trecho.local)).toEqual(["linhas 1–2", 'seção "Média"', 'seção "Mediana"']);
		expect(extracao.trechos[1]!.texto).toContain("# não é título");
	});
	it("texto puro não tem títulos", () => {
		expect(extrairTexto("# um\n# dois", false).trechos).toHaveLength(1);
	});
	it("tipos pela extensão", () => {
		expect(["a.PDF", "b.py", "c.ipynb", "d.md", "e.txt", "f.docx"].map(tipoDoArquivo)).toEqual(["pdf", "python", "notebook", "texto", "texto", undefined]);
	});
	it("formato não suportado dá um erro claro", async () => {
		await writeFile(join(pasta, "a.docx"), "x");
		await expect(extrairArquivo(join(pasta, "a.docx"))).rejects.toThrow(/formato ainda não suportado/);
	});
});

describe(".extraido", () => {
	it("grava um .md por trecho com o cabeçalho e o manifesto; lê de volta; regravar apaga o que sobrou", async () => {
		const observada = join(pasta, "materias", "calculo", "materiais");
		const destino = pastaDoExtraido(observada, "listas/l1.md");
		expect(destino).toBe(join(pasta, "materias", "calculo", ".extraido", "listas", "l1.md"));
		const dados = new TextEncoder().encode("# A\num\n# B\ndois");
		const extracao = extrairTexto(new TextDecoder().decode(dados), true);
		const manifesto = await gravarExtraido(destino, { arquivo: "listas/l1.md", hash: hashDe(dados), tamanho: dados.length, extracao });
		expect((await readdir(destino)).sort()).toEqual(["manifesto.json", "trecho-001.md", "trecho-002.md"]);
		expect(await readFile(join(destino, "trecho-002.md"), "utf8")).toBe('---\narquivo: l1.md\nlocal: seção "B"\norigem: texto\n---\n\n# B\ndois\n');
		expect(await lerManifesto(destino)).toEqual(manifesto);
		expect((await lerTrechos(destino, manifesto)).map((trecho) => trecho.texto)).toEqual(["# A\num", "# B\ndois"]);
		await gravarExtraido(destino, { arquivo: "listas/l1.md", hash: "outro", tamanho: 1, extracao: extrairTexto("só um", true) });
		expect((await readdir(destino)).sort()).toEqual(["manifesto.json", "trecho-001.md"]);
	});
	it("sem manifesto, não há extraído", async () => {
		expect(await lerManifesto(join(pasta, "nada"))).toBeUndefined();
	});
});
