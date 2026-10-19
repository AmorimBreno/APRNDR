// Testes do serviço de materiais numa pasta de dados temporária: varredura,
// fila, .extraido, índice (inclusive remontado do .extraido), arquivos
// mudados e apagados, adicionar pelo app, visão falsa e as ferramentas.

import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarExtensaoMateriais, pastaDaBusca } from "./extensao.ts";
import { consultaFts } from "./indice.ts";
import { type EventoMateriais, seguePadrao, ServicoMateriais } from "./servico.ts";
import type { RegistroVisao } from "./visao.ts";

let dados = "";
let servicos: ServicoMateriais[] = [];
let eventos: EventoMateriais[] = [];

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-servico-"));
	servicos = [];
	eventos = [];
});

afterEach(async () => {
	for (const servico of servicos) await servico.parar();
	await rm(dados, { recursive: true, force: true });
});

const pastaCalc = "materias/calculo/materiais";

function novoServico(opcoes: Partial<ConstructorParameters<typeof ServicoMateriais>[0]> = {}): ServicoMateriais {
	const servico = new ServicoMateriais({
		pastaDados: dados,
		config: { pastas: ["materias/*/materiais"] },
		arquivoIndice: join(dados, "indice-padrao.sqlite"),
		intervaloMs: 0,
		...opcoes,
	});
	servico.assinar((evento) => {
		if (evento.tipo !== "situacao") eventos.push(evento);
	});
	servicos.push(servico);
	return servico;
}

async function escrever(relativo: string, conteudo: string | Uint8Array): Promise<void> {
	const destino = join(dados, ...relativo.split("/"));
	await mkdir(join(destino, ".."), { recursive: true });
	await writeFile(destino, conteudo);
}

async function pdfComSlide(): Promise<Uint8Array> {
	const documento = await PDFDocument.create();
	const fonte = await documento.embedFont(StandardFonts.Helvetica);
	const texto = documento.addPage([600, 800]);
	for (let linha = 0; linha < 8; linha++) {
		texto.drawText("A integral definida soma infinitas fatias de area sob a curva da funcao.", { x: 30, y: 760 - linha * 20, size: 10, font: fonte });
	}
	const slide = documento.addPage([800, 600]);
	slide.drawText("Grafico", { x: 40, y: 550, size: 24, font: fonte });
	slide.drawRectangle({ x: 100, y: 100, width: 500, height: 300, color: rgb(0.2, 0.5, 0.3) });
	return documento.save();
}

describe("padrões de pasta", () => {
	it("cada * vale um nível, sem pastas ocultas", () => {
		expect(seguePadrao("materias/calculo/materiais", ["materias/*/materiais"])).toBe(true);
		expect(seguePadrao("materias/calculo/materiais/sub", ["materias/*/materiais"])).toBe(false);
		expect(seguePadrao("materias/.x/materiais", ["materias/*/materiais"])).toBe(false);
		expect(seguePadrao("materias/../materiais", ["materias/*/materiais"])).toBe(false);
	});
	it("consulta do FTS sem operadores soltos", () => {
		expect(consultaFts('derivada "AND" OR x-y')).toBe('"derivada"* "AND"* "OR"* "x"* "y"*');
		expect(consultaFts("??")).toBeUndefined();
	});
});

describe("serviço de materiais", () => {
	it("varre, processa um de cada vez, grava o .extraido e indexa; formato desconhecido fica de fora", async () => {
		await escrever(`${pastaCalc}/derivadas.md`, "# Derivadas\nA derivada mede a taxa de variação.\n\n# Limites\nO limite descreve a aproximação.");
		await escrever(`${pastaCalc}/listas/lista1.py`, "def f(x):\n    return 2 * x\n");
		await escrever(`${pastaCalc}/ementa.docx`, "x");
		await escrever("materias/calculo/notas/solta.md", "fora da pasta observada");
		const servico = novoServico();
		servico.iniciar();
		await servico.ocioso();
		expect(servico.situacao().map((situacao) => [situacao.caminho, situacao.estado, situacao.trechos])).toEqual([
			[`${pastaCalc}/derivadas.md`, "pronto", 2],
			[`${pastaCalc}/ementa.docx`, "nao_suportado", undefined],
			[`${pastaCalc}/listas/lista1.py`, "pronto", 1],
		]);
		expect(eventos.filter((evento) => evento.tipo === "pronto").map((evento) => evento.tipo === "pronto" && [evento.material.nome, evento.material.novo])).toEqual([
			["derivadas.md", true],
			["listas/lista1.py", true],
		]);
		expect(existsSync(join(dados, "materias/calculo/.extraido/derivadas.md/manifesto.json"))).toBe(true);
		expect(existsSync(join(dados, "materias/calculo/.extraido/listas/lista1.py/trecho-001.md"))).toBe(true);

		const [achado] = servico.buscar("variacao derivada");
		expect(achado).toMatchObject({ caminho: `${pastaCalc}/derivadas.md`, local: 'seção "Derivadas"' });
		expect(achado!.recorte).toContain("«derivada»");
		expect(servico.buscar("derivada", { pasta: "materias/outra" })).toEqual([]);
		expect(servico.buscar("derivada", { pasta: "materias/calculo" })).toHaveLength(1);
	});

	it("de novo sem mudança: nada é processado; mudou: processa de novo; apagado: sai do índice e do .extraido", async () => {
		await escrever(`${pastaCalc}/a.md`, "# A\nprimeira versão do texto");
		const servico = novoServico();
		await servico.varrer();
		await servico.ocioso();
		const manifesto = await readFile(join(dados, "materias/calculo/.extraido/a.md/manifesto.json"), "utf8");
		eventos = [];
		await servico.varrer();
		await servico.ocioso();
		expect(eventos).toEqual([]);
		expect(await readFile(join(dados, "materias/calculo/.extraido/a.md/manifesto.json"), "utf8")).toBe(manifesto);

		await escrever(`${pastaCalc}/a.md`, "# A\nsegunda versão, bem diferente");
		await servico.varrer();
		await servico.ocioso();
		expect(eventos).toMatchObject([{ tipo: "pronto", material: { nome: "a.md", novo: false } }]);
		expect(servico.buscar("segunda")).toHaveLength(1);
		expect(servico.buscar("primeira")).toEqual([]);

		eventos = [];
		await rm(join(dados, pastaCalc, "a.md"));
		await servico.varrer();
		expect(eventos).toEqual([{ tipo: "removido", caminho: `${pastaCalc}/a.md`, pasta: pastaCalc, nome: "a.md" }]);
		expect(servico.situacao()).toEqual([]);
		expect(servico.buscar("segunda")).toEqual([]);
		expect(existsSync(join(dados, "materias/calculo/.extraido/a.md"))).toBe(false);
	});

	it("o índice apagado é remontado do .extraido, sem processar de novo", async () => {
		await escrever(`${pastaCalc}/a.md`, "# A\nintegrais por partes");
		const indice = join(dados, "indice.sqlite");
		const primeiro = novoServico({ arquivoIndice: indice });
		await primeiro.varrer();
		await primeiro.ocioso();
		await primeiro.parar();
		await rm(indice);
		eventos = [];
		const segundo = novoServico({ arquivoIndice: indice });
		await segundo.varrer();
		await segundo.ocioso();
		expect(eventos).toEqual([]);
		expect(segundo.situacao()[0]).toMatchObject({ estado: "pronto", trechos: 1 });
		expect(segundo.buscar("partes")).toHaveLength(1);
	});

	it("com a pasta de dados fora do ar, avisa e não apaga nada", async () => {
		const avisos: string[] = [];
		const servico = novoServico({ pastaDados: join(dados, "nao-montada"), aoAvisar: (mensagem) => avisos.push(mensagem) });
		await servico.varrer();
		expect(avisos[0]).toMatch(/não abriu/);
	});

	it("arquivo quebrado vira erro; reprocessar tenta de novo", async () => {
		await escrever(`${pastaCalc}/quebrado.ipynb`, "{");
		const servico = novoServico();
		await servico.varrer();
		await servico.ocioso();
		expect(servico.situacao()[0]).toMatchObject({ estado: "erro", erro: expect.stringMatching(/não é um JSON válido/) });
		// Sem mudança no arquivo, a varredura não insiste.
		await servico.varrer();
		await servico.ocioso();
		expect(servico.situacao()[0]!.estado).toBe("erro");
		await escrever(`${pastaCalc}/quebrado.ipynb`, JSON.stringify({ cells: [{ cell_type: "markdown", source: "consertado" }] }));
		await servico.reprocessar(`${pastaCalc}/quebrado.ipynb`);
		await servico.ocioso();
		expect(servico.situacao()[0]).toMatchObject({ estado: "pronto", trechos: 1 });
	});

	it("adicionar copia para a pasta (criando), pula o repetido e renomeia o diferente", async () => {
		const servico = novoServico();
		const um = new TextEncoder().encode("# Um\nconteúdo um");
		expect(await servico.adicionar(pastaCalc, [{ nome: "aula.md", dados: um }])).toEqual([`${pastaCalc}/aula.md`]);
		expect(await servico.adicionar(pastaCalc, [{ nome: "aula.md", dados: um }])).toEqual([]);
		expect(await servico.adicionar(pastaCalc, [{ nome: "C:\\x\\aula.md", dados: new TextEncoder().encode("outro") }])).toEqual([`${pastaCalc}/aula (2).md`]);
		await servico.ocioso();
		expect(servico.situacao().map((situacao) => [situacao.nome, situacao.estado])).toEqual([
			["aula (2).md", "pronto"],
			["aula.md", "pronto"],
		]);
		await expect(servico.adicionar("materias/calculo/notas", [{ nome: "a.md", dados: um }])).rejects.toThrow(/não é uma pasta de materiais/);
		await expect(servico.adicionar(pastaCalc, [{ nome: ".oculto", dados: um }])).rejects.toThrow(/inválido/);
	});

	it("com o modelo de visão, o slide do PDF é descrito e o custo fica no manifesto", async () => {
		await escrever(`${pastaCalc}/aula.pdf`, await pdfComSlide());
		const chamadas: string[] = [];
		const registro = {
			getModel: (provedor: string, id: string) => ({ provider: provedor, id, input: ["text", "image"] }),
			hasConfiguredAuth: () => true,
			getAvailable: async () => [],
			completeSimple: async (_modelo: unknown, contexto: { messages: Array<{ content: Array<{ type: string; text?: string }> }> }) => {
				chamadas.push(contexto.messages[0]!.content[0]!.text ?? "");
				return { stopReason: "stop", content: [{ type: "text", text: "Um retângulo verde." }], usage: { cost: { total: 0.005 } } };
			},
		} as unknown as RegistroVisao;
		const servico = novoServico({ config: { pastas: ["materias/*/materiais"], modeloVisao: "openrouter/visao/falsa" }, registro: async () => registro });
		await servico.varrer();
		await servico.ocioso();
		expect(chamadas).toHaveLength(1);
		expect(chamadas[0]).toContain("Local: página 2");
		expect(servico.situacao()[0]).toMatchObject({ estado: "pronto", trechos: 2, custo: 0.005 });
		expect(servico.buscar("retângulo")[0]).toMatchObject({ local: "página 2", origem: "visao" });
		const manifesto = JSON.parse(await readFile(join(dados, "materias/calculo/.extraido/aula.pdf/manifesto.json"), "utf8"));
		expect(manifesto.trechos[1]).toMatchObject({ nome: "pagina-002", origem: "visao", modelo: "openrouter/visao/falsa" });
	});

	it("sem credencial para a visão, processa só o texto e avisa no arquivo", async () => {
		await escrever(`${pastaCalc}/aula.pdf`, await pdfComSlide());
		const registro = { getModel: () => undefined, hasConfiguredAuth: () => false, getAvailable: async () => [] } as unknown as RegistroVisao;
		const servico = novoServico({ config: { pastas: ["materias/*/materiais"], modeloVisao: "openrouter/nao/existe" }, registro: async () => registro });
		await servico.varrer();
		await servico.ocioso();
		const situacao = servico.situacao()[0]!;
		expect(situacao.estado).toBe("pronto");
		expect(situacao.avisos?.[0]).toMatch(/^Sem a visão/);
	});
});

describe("ferramentas de materiais", () => {
	type Ferramenta = { execute(id: string, params: unknown): Promise<{ content: Array<{ text: string }>; isError?: boolean }> };

	function ligar(servico: ServicoMateriais, escopo?: string) {
		const ferramentas: Record<string, Ferramenta> = {};
		const barramento = new EventEmitter();
		const emitidos: Array<[string, unknown]> = [];
		const ao: Record<string, () => void> = {};
		const pi = {
			registerTool: (definicao: Ferramenta & { name: string }) => (ferramentas[definicao.name] = definicao),
			events: { emit: (canal: string, dados: unknown) => emitidos.push([canal, dados]), on: barramento.on.bind(barramento) },
			on: (evento: string, tratador: () => void) => (ao[evento] = tratador),
		} as unknown as ExtensionAPI;
		(criarExtensaoMateriais(servico, escopo) as InlineExtension & { factory(pi: ExtensionAPI): void }).factory(pi);
		return { ferramentas, emitidos, ao };
	}

	it("a pasta da busca fica no escopo, a não ser que peça todas", () => {
		expect(pastaDaBusca(undefined, undefined, undefined)).toBeUndefined();
		expect(pastaDaBusca(undefined, "materias/x/", undefined)).toBe("materias/x");
		expect(pastaDaBusca("materias/calculo", undefined, undefined)).toBe("materias/calculo");
		expect(pastaDaBusca("materias/calculo", "materias/calculo/materiais", undefined)).toBe("materias/calculo/materiais");
		expect(pastaDaBusca("materias/calculo", "materias/fisica", undefined)).toBe("materias/calculo");
		expect(pastaDaBusca("materias/calculo", "materias/calculo-ii", undefined)).toBe("materias/calculo");
		expect(pastaDaBusca("materias/calculo", undefined, true)).toBeUndefined();
		expect(pastaDaBusca("materias/calculo", "materias/fisica", true)).toBe("materias/fisica");
	});

	it("numa conversa de caderno, buscar e listar ficam na matéria; todas: true sai dela", async () => {
		const servico = novoServico();
		const { ferramentas } = ligar(servico, "materias/calculo");
		await escrever(`${pastaCalc}/derivadas.md`, "# Derivadas\nA média da variação.");
		await escrever("materias/estatistica/materiais/media.md", "# Média\nA média aritmética.");
		await servico.varrer();
		await servico.ocioso();
		const naMateria = await ferramentas.buscar_material!.execute("1", { consulta: "média" });
		expect(naMateria.content[0]!.text).toMatch(/^1 trechos para "média" \(em materias\/calculo\):/);
		expect(naMateria.content[0]!.text).not.toContain("estatistica");
		const fora = await ferramentas.buscar_material!.execute("2", { consulta: "média", pasta: "materias/estatistica" });
		expect(fora.content[0]!.text).not.toContain("estatistica");
		const emTudo = await ferramentas.buscar_material!.execute("3", { consulta: "média", todas: true });
		expect(emTudo.content[0]!.text).toMatch(/^2 trechos/);
		const lista = await ferramentas.listar_arquivos_de_material!.execute("4", {});
		expect(lista.content[0]!.text).toBe(`- ${pastaCalc}/derivadas.md [texto; pronto, 1 trechos]`);
	});

	it("buscar, ler por página e listar; os avisos de pronto e removido vão para o barramento da sessão", async () => {
		const servico = novoServico();
		const { ferramentas, emitidos, ao } = ligar(servico);
		await escrever(`${pastaCalc}/aula.pdf`, await pdfComSlide());
		await escrever(`${pastaCalc}/notas.md`, "# Séries\nSérie geométrica converge se |r| < 1.");
		await servico.varrer();
		await servico.ocioso();

		const busca = await ferramentas.buscar_material!.execute("1", { consulta: "integral definida" });
		expect(busca.content[0]!.text).toMatch(/^1 trechos para "integral definida":\n1\. materias\/calculo\/materiais\/aula\.pdf, página 1\n/);

		const leitura = await ferramentas.ler_material!.execute("2", { caminho: `${pastaCalc}/aula.pdf`, de: 2 });
		expect(leitura.content[0]!.text).toBe(`# ${pastaCalc}/aula.pdf\n\n## página 2\n\nGrafico`);
		const fora = await ferramentas.ler_material!.execute("3", { caminho: `${pastaCalc}/nao.pdf` });
		expect(fora.isError).toBe(true);

		const lista = await ferramentas.listar_arquivos_de_material!.execute("4", { pasta: "materias/calculo" });
		expect(lista.content[0]!.text).toBe(`- ${pastaCalc}/aula.pdf [pdf; pronto, 2 trechos]\n- ${pastaCalc}/notas.md [texto; pronto, 1 trechos]`);

		expect(emitidos.map(([canal]) => canal)).toEqual(["materiais:pronto", "materiais:pronto"]);
		expect(emitidos[0]![1]).toMatchObject({ caminho: `${pastaCalc}/aula.pdf`, pasta: pastaCalc, nome: "aula.pdf", tipo: "pdf", novo: true });

		await rm(join(dados, pastaCalc, "notas.md"));
		await servico.varrer();
		expect(emitidos.at(-1)).toEqual(["materiais:removido", { caminho: `${pastaCalc}/notas.md`, pasta: pastaCalc, nome: "notas.md" }]);

		// Depois do session_shutdown, a sessão velha não recebe mais nada.
		ao.session_shutdown!();
		await rm(join(dados, pastaCalc, "aula.pdf"));
		await servico.varrer();
		expect(emitidos.at(-1)![0]).toBe("materiais:removido");
		expect(emitidos.filter(([canal]) => canal === "materiais:removido")).toHaveLength(1);
	});
});
