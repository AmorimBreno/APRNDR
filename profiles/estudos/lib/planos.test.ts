// Testes dos planos no disco (docs/planos-de-estudo.md, R2 e R3): criar, listar, atualizar com versão e
// tentativas, a conversa no histórico, o desfazer com o hash e os eventos. Numa pasta temporária.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerEventos } from "./eventos.ts";
import { criarMateria, eventosMateria } from "./materias.ts";
import { hashDoArquivo } from "./nota-do-professor.ts";
import { arquivoNota, criarNota, listarNotas, renomearNota, salvarNota, versaoDe } from "./notas.ts";
import { lerPlano } from "./plano-tipos.ts";
import { acrescentarConversaNoPlano, atualizarPlano, criarPlano, desfazerPlano, lerPlanoDaNota, listarPlanos } from "./planos.ts";
import { idCurtoDaConversa } from "./trecho-guardado.ts";

// Faz o salvarNota de lib/notas.ts dar conflito `falhas` vezes (como se o arquivo tivesse mudado fora no meio da gravação).
const controle = vi.hoisted(() => ({ falhas: 0, chamadas: 0, aoFalhar: undefined as (() => Promise<void>) | undefined }));
vi.mock("./notas.ts", async (original) => {
	const real = await original<typeof import("./notas.ts")>();
	return {
		...real,
		salvarNota: async (...argumentos: Parameters<typeof real.salvarNota>) => {
			controle.chamadas++;
			if (controle.falhas > 0) {
				controle.falhas--;
				await controle.aoFalhar?.();
				throw new real.ErroConflito("fora");
			}
			return real.salvarNota(...argumentos);
		},
	};
});

let dados = "";
let materia = "";

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-lib-planos-"));
	materia = (await criarMateria(dados, { nome: "Ciência de Dados" })).id;
});

afterEach(async () => {
	await rm(dados, { recursive: true, force: true });
});

const lerArquivo = (titulo: string) => readFile(arquivoNota(dados, materia, titulo), "utf8");
const eventos = async () => (await lerEventos(eventosMateria(dados, materia))).eventos;
const verbos = async () => (await eventos()).map((evento) => evento.verbo);
const criar = (titulo = "Prova final", itens = ["Q1", "Q2", "Q3"]) => criarPlano(dados, materia, { titulo, objetivo: "prova de 26/11", itens, sessao: "sessao-1" });

describe("criarPlano", () => {
	it("grava a nota com a tag, o objetivo e os itens, a conversa no histórico e o evento com o hash", async () => {
		const criado = await criar();
		expect(criado).toMatchObject({ titulo: "Prova final", itens: 3 });
		const arquivo = await lerArquivo("Prova final");
		expect(arquivo).toBe(criado.conteudo);
		expect(arquivo).toContain("**Objetivo:** prova de 26/11");
		expect(lerPlano(arquivo)).toMatchObject({ total: 3, feitos: 0, atual: 1, conversas: [idCurtoDaConversa("sessao-1")] });
		expect(criado.versao).toBe(versaoDe(arquivo));
		const criou = (await eventos()).find((evento) => evento.verbo === "criou_plano")!;
		expect(criou.sessao).toBe("sessao-1");
		expect(criou.objeto).toEqual({ materia, titulo: "Prova final", itens: 3, hash: hashDoArquivo(arquivo) });
	});

	it("recusa título que já existe (sem sobrescrever), título ruim, sem itens, itens demais, longos ou com HTML", async () => {
		await criar();
		await expect(criar()).rejects.toThrow(/Já existe uma nota/);
		expect(await lerArquivo("Prova final")).toContain("- [ ] Q1");
		await expect(criar("a/b")).rejects.toThrow(/título não pode/);
		await expect(criar("Vazio", [])).rejects.toThrow(/pelo menos um item/);
		await expect(criar("Vazio2", ["a", "  "])).rejects.toThrow(/O item 2 está vazio/);
		await expect(criar("Muitos", Array.from({ length: 61 }, (_, i) => `i${i}`))).rejects.toThrow(/passa de 60 itens/);
		await expect(criar("Longo", ["x".repeat(301)])).rejects.toThrow(/O item 1 passa de 300/);
		await expect(criar("Html", ["<script>x</script>"])).rejects.toThrow(/HTML/);
		await expect(criar("Sessenta", Array.from({ length: 60 }, (_, i) => `i${i}`))).resolves.toMatchObject({ itens: 60 });
		// Nenhuma nota ficou criada pelas recusas.
		expect((await listarNotas(dados, materia)).notas.map((nota) => nota.titulo).sort()).toEqual(["Prova final", "Sessenta"]);
	});

	it("o hash cobre o arquivo como gravado: o desfazer apaga enquanto ele não mudou", async () => {
		await criar();
		await expect(desfazerPlano(dados, materia, "prova FINAL", "sessao-1")).resolves.toBe("Prova final");
		await expect(readFile(arquivoNota(dados, materia, "Prova final"), "utf8")).rejects.toThrow();
		expect(await verbos()).toContain("desfez_plano");
	});
});

describe("listarPlanos e listarNotas", () => {
	it("lista só as notas com a tag, com o progresso; listarNotas preenche plano e a prévia não traz a tag", async () => {
		await criar("Prova final", ["a", "b"]);
		await atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 1 }], { sessao: "sessao-1" });
		await criarNota(dados, materia, "Resumo");
		await writeFile(arquivoNota(dados, materia, "Resumo"), "# Limites\n- [ ] não conta\n", "utf8");
		expect(await listarPlanos(dados, materia)).toEqual([{ titulo: "Prova final", feitos: 1, total: 2, concluido: false }]);
		const { notas } = await listarNotas(dados, materia);
		const plano = notas.find((nota) => nota.titulo === "Prova final")!;
		expect(plano.plano).toEqual({ feitos: 1, total: 2 });
		expect(plano.previa.startsWith("Plano de estudos")).toBe(false);
		expect(notas.find((nota) => nota.titulo === "Resumo")!.plano).toBeUndefined();
	});

	it("concluído quando tudo está marcado", async () => {
		await criar("Curto", ["a"]);
		await atualizarPlano(dados, materia, "Curto", [{ tipo: "marcar", item: 1 }]);
		expect(await listarPlanos(dados, materia)).toEqual([{ titulo: "Curto", feitos: 1, total: 1, concluido: true }]);
	});
});

describe("lerPlanoDaNota", () => {
	it("lê pelo título sem diferença de maiúsculas; nota sem tag é recusada", async () => {
		await criar();
		expect((await lerPlanoDaNota(dados, materia, "prova final")).nota.titulo).toBe("Prova final");
		await criarNota(dados, materia, "Comum");
		await writeFile(arquivoNota(dados, materia, "Comum"), "- [ ] a\n", "utf8");
		await expect(lerPlanoDaNota(dados, materia, "Comum")).rejects.toThrow(/não é um plano de estudos/);
		await expect(lerPlanoDaNota(dados, materia, "Não existe")).rejects.toThrow(/Não achei a nota/);
	});
});

describe("atualizarPlano", () => {
	it("marca, grava só a linha do item, devolve o plano como ficou e registra atualizou_plano", async () => {
		const criado = await criar();
		const gravado = await atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 1, texto: "Q1" }], { sessao: "sessao-1" });
		expect(gravado.mudou).toBe(true);
		expect(gravado.plano).toMatchObject({ feitos: 1, total: 3, atual: 2 });
		expect(gravado.conteudo).toBe(criado.conteudo.replace("- [ ] Q1", "- [x] Q1"));
		expect(await lerArquivo("Prova final")).toBe(gravado.conteudo);
		expect(gravado.versao).toBe(versaoDe(gravado.conteudo));
		const evento = (await eventos()).filter((e) => e.verbo === "atualizou_plano");
		expect(evento).toHaveLength(1);
		expect(evento[0]!.objeto).toEqual({ materia, titulo: "Prova final", operacoes: [{ tipo: "marcar", item: 1, texto: "Q1" }], antes: expect.any(String), hash: expect.any(String) });
	});

	it("o que o Breno escreveu fica como está (subitens, texto, CRLF)", async () => {
		await criarNota(dados, materia, "Do Breno");
		const arquivo = "Plano de estudos · criado em 24/11/2026\r\n\r\n## Itens\r\n- [ ] um\r\n  - [ ] mexe\r\n- [ ] dois\r\n\r\nPensar nisto depois.\r\n";
		await writeFile(arquivoNota(dados, materia, "Do Breno"), arquivo, "utf8");
		const gravado = await atualizarPlano(dados, materia, "Do Breno", [{ tipo: "marcar", item: 2 }, { tipo: "acrescentar", texto: "três" }]);
		expect(gravado.conteudo).toBe(arquivo.replace("- [ ] dois\r\n", "- [x] dois\r\n- [ ] três\r\n"));
	});

	it("operação que não muda nada não grava nem registra evento", async () => {
		await criar();
		await atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 1 }]);
		const de = await verbos();
		const repetido = await atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 1 }]);
		expect(repetido.mudou).toBe(false);
		expect(await verbos()).toEqual(de);
	});

	it("item que não existe, texto que não bate e nota sem tag: recusado com a frase, e nada muda", async () => {
		await criar();
		const antes = await lerArquivo("Prova final");
		await expect(atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 9 }])).rejects.toThrow(/não tem o item 9.*Nada foi mudado/);
		await expect(atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 1 }, { tipo: "marcar", item: 2, texto: "Q3" }])).rejects.toThrow(/O item 2 é "Q2"/);
		await expect(atualizarPlano(dados, materia, "Prova final", [{ tipo: "acrescentar", texto: "<div id=x>" }])).rejects.toThrow(/HTML/);
		await expect(atualizarPlano(dados, materia, "Prova final", [])).rejects.toThrow(/nenhuma operação/);
		expect(await lerArquivo("Prova final")).toBe(antes);
		await criarNota(dados, materia, "Sem tag");
		await writeFile(arquivoNota(dados, materia, "Sem tag"), "- [ ] a\n", "utf8");
		await expect(atualizarPlano(dados, materia, "Sem tag", [{ tipo: "marcar", item: 1 }])).rejects.toThrow(/não é um plano de estudos/);
		expect(await lerArquivo("Sem tag")).toBe("- [ ] a\n");
	});


	it("a nota mudou no meio da gravação: relê, reaplica e não perde o que mudou fora; passa de 3 tentativas, recusa", async () => {
		await criar("Duas", ["a", "b", "c"]);
		controle.falhas = 1;
		controle.aoFalhar = async () => {
			// O Breno marcou o item 3 no Explorador no meio da gravação.
			const atual = await readFile(arquivoNota(dados, materia, "Duas"), "utf8");
			await writeFile(arquivoNota(dados, materia, "Duas"), atual.replace("- [ ] c", "- [x] c"), "utf8");
		};
		controle.chamadas = 0;
		await atualizarPlano(dados, materia, "Duas", [{ tipo: "marcar", item: 1 }]);
		expect(controle.chamadas).toBe(2);
		expect(lerPlano(await lerArquivo("Duas"))!.itens.map((item) => item.feito)).toEqual([true, false, true]);

		controle.falhas = 3;
		controle.aoFalhar = undefined;
		controle.chamadas = 0;
		const antes = await lerArquivo("Duas");
		await expect(atualizarPlano(dados, materia, "Duas", [{ tipo: "marcar", item: 2 }])).rejects.toThrow(/mudou várias vezes.*Nada foi mudado/);
		expect(controle.chamadas).toBe(3);
		expect(await lerArquivo("Duas")).toBe(antes);
	});
});

describe("acrescentarConversaNoPlano", () => {
	it("acrescenta a conversa uma vez, com a data local, e grava ligou_plano", async () => {
		await criar();
		const em = new Date(2026, 10, 25);
		const primeira = await acrescentarConversaNoPlano(dados, materia, "Prova final", "sessao-2", em);
		expect(primeira.mudou).toBe(true);
		expect(primeira.plano.conversas).toEqual([idCurtoDaConversa("sessao-1"), idCurtoDaConversa("sessao-2")]);
		expect(primeira.conteudo).toContain(`- [25/11/2026](conversa:${idCurtoDaConversa("sessao-2")})`);
		const segunda = await acrescentarConversaNoPlano(dados, materia, "Prova final", "sessao-2", em);
		expect(segunda.mudou).toBe(false);
		const ligou = (await eventos()).filter((evento) => evento.verbo === "ligou_plano");
		expect(ligou).toHaveLength(1);
		expect(ligou[0]!.objeto).toEqual({ materia, titulo: "Prova final", conversa: idCurtoDaConversa("sessao-2"), antes: expect.any(String), hash: expect.any(String) });
	});

	it("nota sem tag é recusada", async () => {
		await criarNota(dados, materia, "Sem tag");
		await expect(acrescentarConversaNoPlano(dados, materia, "Sem tag", "sessao-2")).rejects.toThrow(/não é um plano de estudos/);
	});
});

describe("desfazerPlano", () => {
	it("as gravações do professor (marcar, a conversa no histórico) não impedem o Desfazer", async () => {
		await criar();
		await atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 1 }], { sessao: "sessao-1" });
		await acrescentarConversaNoPlano(dados, materia, "Prova final", "01a20dee-32cd-7337-956f-b57bc81ec7ca");
		await expect(desfazerPlano(dados, materia, "Prova final", "sessao-1")).resolves.toBe("Prova final");
		expect(await verbos()).toContain("desfez_plano");
	});

	it("recusa se o Breno mudou o plano (antes ou entre as gravações do professor), e nada é apagado", async () => {
		const criado = await criar();
		await salvarNota(dados, materia, "Prova final", `${criado.conteudo}Uma linha minha.
`, { versao: criado.versao });
		await expect(desfazerPlano(dados, materia, "Prova final", "sessao-1")).rejects.toThrow(/Você mudou o plano.*Nada foi apagado/);
		// O professor marca depois da edição do Breno: a cadeia tem um buraco e continua recusando.
		await atualizarPlano(dados, materia, "Prova final", [{ tipo: "marcar", item: 1 }]);
		await expect(desfazerPlano(dados, materia, "Prova final", "sessao-1")).rejects.toThrow(/Você mudou o plano/);
		expect(await lerArquivo("Prova final")).toContain("Uma linha minha.");
		expect(await verbos()).not.toContain("desfez_plano");
	});

	it("acompanha a troca de nome: o cartão guarda o título da criação e o Desfazer apaga o arquivo de agora", async () => {
		await criar();
		await renomearNota(dados, materia, "Prova final", "Prova de dezembro");
		await atualizarPlano(dados, materia, "Prova de dezembro", [{ tipo: "marcar", item: 2 }]);
		await expect(desfazerPlano(dados, materia, "Prova final", "sessao-1")).resolves.toBe("Prova de dezembro");
		await expect(lerArquivo("Prova de dezembro")).rejects.toThrow();
	});

	it("recusa plano que não foi criado pelo professor, o que já foi desfeito e o que sumiu", async () => {
		await criarNota(dados, materia, "Do Breno");
		await expect(desfazerPlano(dados, materia, "Do Breno", "sessao-1")).rejects.toThrow(/não foi criado pelo professor/);
		await criar();
		await desfazerPlano(dados, materia, "Prova final", "sessao-1");
		await expect(desfazerPlano(dados, materia, "Prova final", "sessao-1")).rejects.toThrow(/já foi desfeito/);
		await criar("Some");
		await rm(arquivoNota(dados, materia, "Some"));
		await expect(desfazerPlano(dados, materia, "Some", "sessao-1")).rejects.toThrow(/não existe mais/);
	});

	it("depois de desfeito, criar de novo com o mesmo título vale de novo (o hash é o do último)", async () => {
		await criar();
		await desfazerPlano(dados, materia, "Prova final", "sessao-1");
		await criar();
		await expect(desfazerPlano(dados, materia, "Prova final", "sessao-1")).resolves.toBe("Prova final");
	});
});
