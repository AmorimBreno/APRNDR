// Testes das notas numa pasta de dados temporária com uma matéria.

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerEventos } from "./eventos.ts";
import { criarMateria, ErroMaterias, eventosMateria } from "./materias.ts";
import {
	arquivoNota,
	conferirTitulo,
	criarNota,
	ErroConflito,
	lerNota,
	listarNotas,
	pastaNotas,
	previaDaNota,
	renomearNota,
	salvarNota,
	temHtmlDesconhecido,
	versaoDe,
} from "./notas.ts";

let dados = "";
let materia = "";

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-notas-"));
	materia = (await criarMateria(dados, { nome: "Cálculo I" })).id;
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

const verbos = async () => (await lerEventos(eventosMateria(dados, materia))).eventos.map((evento) => evento.verbo);

describe("títulos", () => {
	it("limpa os espaços e aceita acento e símbolos comuns", () => {
		expect(conferirTitulo("  Limites   e derivadas ")).toEqual({ titulo: "Limites e derivadas" });
		expect(conferirTitulo("Aula 3 — regra da cadeia (C# & 100%)")).toEqual({ titulo: "Aula 3 — regra da cadeia (C# & 100%)" });
	});
	it("recusa o que o Windows não aceita, colchetes, ponto e nomes reservados", () => {
		for (const ruim of ["", "   ", "a/b", "a:b", 'a"b', "a?", "a*", "a|b", "a<b>", "[[a]]", ".oculta", "fim.", "CON", "nul.txt", "x".repeat(121)]) {
			expect(conferirTitulo(ruim), ruim).toHaveProperty("erro");
		}
	});
});

describe("HTML e prévia", () => {
	it("acha HTML que o editor não conhece, fora do código", () => {
		expect(temHtmlDesconhecido('<div class="aviso">\noi\n</div>')).toBe(true);
		expect(temHtmlDesconhecido("<!-- comentário -->")).toBe(true);
		expect(temHtmlDesconhecido("um <b>negrito em HTML</b>")).toBe(true);
		expect(temHtmlDesconhecido('<span class="cor-roxo">x</span>')).toBe(true);
		expect(temHtmlDesconhecido('<div class="caixa perigo">')).toBe(true);
	});
	it("não conta o HTML das decorações e dos blocos", () => {
		const conhecidos = [
			'Um <mark>destaque</mark> e <span class="cor-ambar">cor</span>.',
			'Um <u>sublinhado</u> e um <mark class="fundo-tijolo">fundo</mark>.',
			'<div class="caixa atencao">\n\ntexto\n\n</div>',
			'<div class="definicao">\n<dfn>Termo</dfn>\n\nexplicação\n\n</div>',
			"<details>\n<summary>Título</summary>\n\nmiolo\n\n</details>",
			'<details class="pergunta">\n<summary>Pergunta?</summary>\n\nresposta\n\n</details>',
		];
		for (const markdown of conhecidos) expect(temHtmlDesconhecido(markdown), markdown).toBe(false);
	});
	it("não conta código nem comparações", () => {
		expect(temHtmlDesconhecido("use `<div>` no código")).toBe(false);
		expect(temHtmlDesconhecido("```html\n<div>oi</div>\n```\nfim")).toBe(false);
		expect(temHtmlDesconhecido("    <div>recuado</div>")).toBe(false);
		expect(temHtmlDesconhecido("se a < b e 3 > 2")).toBe(false);
		expect(temHtmlDesconhecido("[[Outra nota]] e **negrito**")).toBe(false);
	});
	it("a prévia tira a marcação", () => {
		expect(previaDaNota("# Título\n\n- [ ] item **forte** e [link](http://x)\n> citação")).toBe("Título item forte e link citação");
		expect(previaDaNota("a ".repeat(200)).length).toBeLessThanOrEqual(140);
		expect(previaDaNota("_ênfase_ em x_1 e snake_case")).toBe("ênfase em x_1 e snake_case");
		expect(previaDaNota("Antes.\n\n$$\nE = mc^2\n$$\n\nDepois.")).toBe("Antes. E = mc^2 Depois.");
		expect(previaDaNota('Um <mark>destaque</mark> e <span class="x">cor</span> <!-- nota --> a < b')).toBe("Um destaque e cor a < b");
	});
});

describe("notas", () => {
	it("cria vazia, lista e grava criou_nota", async () => {
		const nota = await criarNota(dados, materia, " Limites ", { sessao: "s1" });
		expect(nota).toMatchObject({ materia, titulo: "Limites", conteudo: "", versao: versaoDe("") });
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("");
		const lista = await listarNotas(dados, materia);
		expect(lista.notas.map((item) => item.titulo)).toEqual(["Limites"]);
		const { eventos } = await lerEventos(eventosMateria(dados, materia));
		expect(eventos.at(-1)).toMatchObject({ sessao: "s1", verbo: "criou_nota", objeto: { materia, nota: "Limites" } });
	});

	it("sem a pasta notas/, a lista é vazia; matéria que não existe é erro", async () => {
		expect((await listarNotas(dados, materia)).notas).toEqual([]);
		await expect(listarNotas(dados, "nao-existe")).rejects.toThrow(ErroMaterias);
		await expect(criarNota(dados, "../fora", "x")).rejects.toThrow(ErroMaterias);
	});

	it("não cria nota repetida, nem só mudando maiúsculas", async () => {
		await criarNota(dados, materia, "Limites");
		await expect(criarNota(dados, materia, "limites")).rejects.toThrow("Já existe");
	});

	it("salva com a versão aberta, termina com quebra de linha e registra a edição só quando pedido", async () => {
		const nota = await criarNota(dados, materia, "Limites");
		const salva = await salvarNota(dados, materia, "Limites", "# Limites\n\ntexto", { versao: nota.versao, registrarEdicao: true });
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("# Limites\n\ntexto\n");
		expect(salva.versao).toBe(versaoDe("# Limites\n\ntexto\n"));
		await salvarNota(dados, materia, "Limites", "outro", { versao: salva.versao });
		expect(await verbos()).toEqual(["criou_materia", "criou_nota", "editou_nota"]);
		const lida = await lerNota(dados, materia, "limites");
		expect(lida).toMatchObject({ titulo: "Limites", conteudo: "outro\n" });
		// Não sobra arquivo temporário na pasta.
		expect(await readdir(pastaNotas(dados, materia))).toEqual(["Limites.md"]);
	});

	it("não sobrescreve o que mudou fora do app; forcar grava por cima", async () => {
		const nota = await criarNota(dados, materia, "Limites");
		await writeFile(arquivoNota(dados, materia, "Limites"), "mudei no Explorador\n", "utf8");
		const erro = await salvarNota(dados, materia, "Limites", "minha versão", { versao: nota.versao }).catch((falha: unknown) => falha);
		expect(erro).toBeInstanceOf(ErroConflito);
		expect((erro as ErroConflito).versaoAtual).toBe(versaoDe("mudei no Explorador\n"));
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("mudei no Explorador\n");
		await salvarNota(dados, materia, "Limites", "minha versão", { forcar: true });
		expect(await readFile(arquivoNota(dados, materia, "Limites"), "utf8")).toBe("minha versão\n");
	});

	it("nota apagada fora do app também é conflito", async () => {
		const nota = await criarNota(dados, materia, "Limites");
		await rm(arquivoNota(dados, materia, "Limites"));
		const erro = await salvarNota(dados, materia, "Limites", "texto", { versao: nota.versao }).catch((falha: unknown) => falha);
		expect(erro).toBeInstanceOf(ErroConflito);
		expect((erro as ErroConflito).versaoAtual).toBeUndefined();
	});

	it("renomeia, inclusive só as maiúsculas, e grava renomeou_nota", async () => {
		await criarNota(dados, materia, "limites");
		expect(await renomearNota(dados, materia, "limites", "Limites")).toMatchObject({ titulo: "Limites" });
		expect(await readdir(pastaNotas(dados, materia))).toEqual(["Limites.md"]);
		await renomearNota(dados, materia, "Limites", "Limites laterais", { sessao: "s2" });
		expect(await readdir(pastaNotas(dados, materia))).toEqual(["Limites laterais.md"]);
		const { eventos } = await lerEventos(eventosMateria(dados, materia));
		expect(eventos.at(-1)).toMatchObject({ sessao: "s2", verbo: "renomeou_nota", objeto: { nota: "Limites laterais" }, resultado: { de: "Limites", para: "Limites laterais" } });
		// Mesmo título: nada muda e não grava evento.
		await renomearNota(dados, materia, "Limites laterais", " Limites laterais ");
		expect((await verbos()).filter((verbo) => verbo === "renomeou_nota")).toHaveLength(2);
	});

	it("renomear atualiza as menções nas outras notas e o evento diz quais", async () => {
		await criarNota(dados, materia, "Limites");
		await criarNota(dados, materia, "Derivadas");
		await criarNota(dados, materia, "Sem menção");
		await writeFile(arquivoNota(dados, materia, "Derivadas"), "Ver [[Limites]], [[ limites ]] e [[Limites laterais]].\n", "utf8");
		await writeFile(arquivoNota(dados, materia, "Sem menção"), "Nada aqui. Texto \\[[Limites\\]] escapado fica.\n", "utf8");
		await writeFile(arquivoNota(dados, materia, "Limites"), "Eu mesma: [[Limites]].\n", "utf8");
		const { mencoesAtualizadas } = await renomearNota(dados, materia, "Limites", "Limites (introdução)");
		expect(mencoesAtualizadas).toEqual(["Derivadas"]);
		expect(await readFile(arquivoNota(dados, materia, "Derivadas"), "utf8")).toBe("Ver [[Limites (introdução)]], [[Limites (introdução)]] e [[Limites laterais]].\n");
		expect(await readFile(arquivoNota(dados, materia, "Sem menção"), "utf8")).toBe("Nada aqui. Texto \\[[Limites\\]] escapado fica.\n");
		// A própria nota renomeada não é reescrita (ela pode estar aberta no editor).
		expect(await readFile(arquivoNota(dados, materia, "Limites (introdução)"), "utf8")).toBe("Eu mesma: [[Limites]].\n");
		const { eventos } = await lerEventos(eventosMateria(dados, materia));
		expect(eventos.at(-1)).toMatchObject({ verbo: "renomeou_nota", resultado: { de: "Limites", para: "Limites (introdução)", mencoesAtualizadas: ["Derivadas"] } });
	});

	it("não renomeia por cima de outra nota", async () => {
		await criarNota(dados, materia, "A");
		await criarNota(dados, materia, "B");
		await expect(renomearNota(dados, materia, "A", "b")).rejects.toThrow("Já existe");
		await expect(renomearNota(dados, materia, "C", "D")).rejects.toThrow("Não achei");
	});

	it("a lista ignora arquivos escondidos e que não são .md, e põe a mais recente primeiro", async () => {
		await criarNota(dados, materia, "Velha");
		await writeFile(join(pastaNotas(dados, materia), ".temporario.tmp"), "x");
		await writeFile(join(pastaNotas(dados, materia), "imagem.png"), "x");
		await new Promise((resolver) => setTimeout(resolver, 20));
		await criarNota(dados, materia, "Nova");
		await salvarNota(dados, materia, "Nova", "# Nova\n\nconteúdo", { versao: versaoDe("") });
		const { notas } = await listarNotas(dados, materia);
		expect(notas.map((nota) => nota.titulo)).toEqual(["Nova", "Velha"]);
		expect(notas[0]).toMatchObject({ previa: "Nova conteúdo", tamanho: Buffer.byteLength("# Nova\n\nconteúdo\n") });
	});
});
