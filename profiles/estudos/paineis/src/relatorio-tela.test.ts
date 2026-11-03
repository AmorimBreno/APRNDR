// O relatório do método e os ajustes na tela (docs/metodo-ciclo.md, "A tela" e
// "Ponte"): as partes puras (relatorio-tela.ts e as dos ajustes em
// escrita-tela.ts), a leitura da ponte (o relatório na mensagem modulo, os
// erros por proposta e por ajuste, a mensagem ajustes) e o desenho das
// seções (RelatorioMetodo.tsx, SecaoAjustes em ModalEscrita.tsx).

import type { AcaoRecebida } from "@estudos/ui";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ArquivoDeAjustesNaTela, RelatorioMetodo } from "../../lib/metodo-ciclo-tipos.ts";
import { AJUSTE_MAXIMO, MOTIVO_MAXIMO } from "../../lib/metodo-ciclo-tipos.ts";
import { chaveDoAjuste, type AjustesDoMetodo, errosDosAjustes, lerAjustes } from "./ajustes-ponte.ts";
import { arquivosParaMostrar, contagemDosAjustes, LINHA_AJUSTES, rotuloDaOrigemDoAjuste, rotuloDoAjuste, TEXTO_SEM_AJUSTES, TITULO_AJUSTES } from "./escrita-tela.ts";
import { SecaoAjustes } from "./ModalEscrita.tsx";
import { errosDasPropostas, lerModuloAberto, lerModulos } from "./modulos-ponte.ts";
import { type AcoesRelatorio, RelatorioMetodo as SecaoRelatorio } from "./RelatorioMetodo.tsx";
import {
	aprovacaoDireta,
	aprovacaoEditada,
	conteudoDoRelatorio,
	contagemDasPropostas,
	destinoDaEvidencia,
	faseDoRelatorio,
	foiEditada,
	linhaDoPoucoRetorno,
	linhaDoRelatorioNoCard,
	pendentesDoRelatorio,
	problemaDoTextoEditado,
	rejeicao,
	rotuloDaDecisao,
	TEXTO_GERANDO,
	TEXTO_POUCO_RETORNO,
	textoDaProposta,
} from "./relatorio-tela.ts";

const recebida = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });
const alvo = { materia: "mat", curso: "cur", modulo: "m1" };

const relatorioDe = (extra: Partial<RelatorioMetodo> = {}): RelatorioMetodo => ({
	versao: 1,
	modulo: "m1",
	situacao: "pronto",
	geradoEm: "2026-11-03T12:00:00.000Z",
	modelo: "openrouter/openai/gpt-6.1-sol",
	custo: 0.06,
	prompt: { nome: "relatorio-metodo.md", hash: "abc" },
	eventosLidos: 12,
	retornos: 5,
	resumo: "O módulo **funcionou** bem nos exemplos.",
	funcionou: [{ texto: "Os exemplos resolvidos ajudaram.", evidencias: ["ev-1"] }],
	problemas: [{ texto: "Os conceitos ficaram abstratos.", evidencias: ["ev-2", "ev-3"] }],
	propostas: [
		{ id: "p1", arquivo: "exemplos.md", ajuste: "Antes do código, diga o que ele mostra.", porque: "Dois blocos foram Ruim por falta de contexto.", evidencias: ["ev-2", "ev-3"] },
		{
			id: "p2",
			arquivo: "conceito.md",
			ajuste: "Comece pelo caso concreto.",
			porque: "Pediu explicação do conceito.",
			evidencias: ["ev-2", "ev-4"],
			decisao: { tipo: "aprovada", texto: "Comece sempre pelo caso concreto.", em: "2026-11-03T15:00:00.000Z", evento: "ev-9", ajuste: "a-20261103-1" },
		},
		{
			id: "p3",
			arquivo: "quiz.md",
			ajuste: "Menos alternativas.",
			porque: "Quiz errado.",
			evidencias: ["ev-3", "ev-4"],
			decisao: { tipo: "rejeitada", motivo: "Gosto de quatro alternativas.", em: "2026-11-03T16:00:00.000Z", evento: "ev-10" },
		},
	],
	evidencias: [
		{ id: "ev-1", linha: "l1-b2 · exemplo resolvido · exemplos.md · Feedback Ótimo", licao: "l1", bloco: "l1-b2" },
		{ id: "ev-2", linha: "l2-b3 · conceito · conceito.md · Feedback Ruim, motivos longo demais", licao: "l2", bloco: "l2-b3" },
		{ id: "ev-3", linha: "Questionário da lição: ritmo Rápido", licao: "l2", bloco: null },
		{ id: "ev-4", linha: "Não sei o que é isso: «radicais»", licao: null, bloco: null },
	],
	...extra,
});

describe("a fase do relatório", () => {
	it("gerando vale sobre o erro e sobre o relatório gravado", () => {
		expect(faseDoRelatorio({ relatorio: relatorioDe(), gerando: true, erro: "falhou" })).toBe("gerando");
	});

	it("o erro da última tentativa vale sobre o relatório gravado", () => {
		expect(faseDoRelatorio({ relatorio: relatorioDe(), erro: "Não deu." })).toBe("erro");
		expect(faseDoRelatorio({ relatorio: null, erro: "Não deu." })).toBe("erro");
	});

	it("sem gerando nem erro, a situação do gravado; sem relatório, nenhum", () => {
		expect(faseDoRelatorio({ relatorio: relatorioDe() })).toBe("pronto");
		expect(faseDoRelatorio({ relatorio: relatorioDe({ situacao: "pouco_retorno" }) })).toBe("pouco_retorno");
		expect(faseDoRelatorio({ relatorio: null })).toBe("nenhum");
		expect(faseDoRelatorio({})).toBe("nenhum");
		expect(conteudoDoRelatorio(null)).toBeUndefined();
		expect(conteudoDoRelatorio(relatorioDe())).toBe("pronto");
	});

	it("a linha do pouco retorno diz quantos e o mínimo", () => {
		expect(linhaDoPoucoRetorno(2)).toBe("2 retornos neste módulo; o professor pede pelo menos 3.");
		expect(linhaDoPoucoRetorno(1)).toBe("1 retorno neste módulo; o professor pede pelo menos 3.");
	});
});

describe("as propostas e as decisões", () => {
	it("conta as que faltam decidir", () => {
		const relatorio = relatorioDe();
		expect(pendentesDoRelatorio(relatorio)).toBe(1);
		expect(contagemDasPropostas(relatorio)).toBe("3 propostas · 1 para decidir");
		expect(contagemDasPropostas({ propostas: relatorio.propostas.slice(1) })).toBe("2 propostas · todas decididas");
		expect(contagemDasPropostas({ propostas: relatorio.propostas.slice(1, 2) })).toBe("1 proposta · decidida");
		expect(contagemDasPropostas({ propostas: relatorio.propostas.slice(0, 1) })).toBe("1 proposta · 1 para decidir");
		expect(contagemDasPropostas({ propostas: [] })).toBe("Nenhuma proposta");
		expect(pendentesDoRelatorio(null)).toBe(0);
	});

	it("o rótulo da decisão: Aprovada em dd/mm ou Rejeitada", () => {
		const [, aprovada, rejeitada] = relatorioDe().propostas;
		expect(rotuloDaDecisao(aprovada!.decisao!)).toMatch(/^Aprovada em \d{2}\/\d{2}$/);
		expect(rotuloDaDecisao(rejeitada!.decisao!)).toBe("Rejeitada");
		expect(rotuloDaDecisao({ tipo: "aprovada", texto: "x", em: "não é data", evento: "e", ajuste: "a" })).toBe("Aprovada");
	});

	it("o texto que vale e se foi editado", () => {
		const [pendente, aprovada, rejeitada] = relatorioDe().propostas;
		expect(textoDaProposta(pendente!)).toBe("Antes do código, diga o que ele mostra.");
		expect(textoDaProposta(aprovada!)).toBe("Comece sempre pelo caso concreto.");
		expect(foiEditada(aprovada!)).toBe(true);
		expect(textoDaProposta(rejeitada!)).toBe("Menos alternativas.");
		expect(foiEditada(rejeitada!)).toBe(false);
		expect(foiEditada(pendente!)).toBe(false);
		const igual = { ajuste: "  Igual.  ", decisao: { tipo: "aprovada" as const, texto: "Igual.", em: "x", evento: "e", ajuste: "a" } };
		expect(foiEditada(igual)).toBe(false);
	});
});

describe("o que vai para a ponte", () => {
	it("Aprovar não leva texto", () => {
		expect(aprovacaoDireta()).toEqual({ decisao: "aprovar" });
	});

	it("Editar e aprovar leva o texto aparado; igual ao proposto vira Aprovar", () => {
		const proposta = { ajuste: "Antes do código, diga o que ele mostra." };
		expect(aprovacaoEditada(proposta, "  Diga o que o código mostra.  ")).toEqual({ decisao: "aprovar", texto: "Diga o que o código mostra." });
		expect(aprovacaoEditada(proposta, " Antes do código, diga o que ele mostra. ")).toEqual({ decisao: "aprovar" });
		expect(() => aprovacaoEditada(proposta, "   ")).toThrow(/vazio/);
	});

	it("o texto editado é conferido como a extensão confere", () => {
		expect(problemaDoTextoEditado("Um ajuste curto.")).toBeUndefined();
		expect(problemaDoTextoEditado("")).toMatch(/vazio/);
		expect(problemaDoTextoEditado("a".repeat(AJUSTE_MAXIMO))).toBeUndefined();
		expect(problemaDoTextoEditado("a".repeat(AJUSTE_MAXIMO + 1))).toMatch(/máximo é 400/);
		expect(problemaDoTextoEditado("Texto\n## a-1 · ativo")).toMatch(/## /);
		expect(problemaDoTextoEditado("Texto <!-- comentário -->")).toMatch(/<!--/);
	});

	it("Rejeitar leva o motivo aparado e cortado; sem motivo, nenhum", () => {
		expect(rejeicao("")).toEqual({ decisao: "rejeitar" });
		expect(rejeicao("   ")).toEqual({ decisao: "rejeitar" });
		expect(rejeicao("  Prefiro como está.  ")).toEqual({ decisao: "rejeitar", motivo: "Prefiro como está." });
		const longo = rejeicao("a".repeat(MOTIVO_MAXIMO + 50));
		expect(longo.decisao === "rejeitar" && longo.motivo?.length).toBe(MOTIVO_MAXIMO);
	});

	it("o clique numa evidência leva ao bloco, à lição ou a lugar nenhum", () => {
		const [e1, e2, e3, e4] = relatorioDe().evidencias;
		expect(destinoDaEvidencia(e1!, "m1")).toEqual({ tipo: "bloco", modulo: "m1", licao: "l1", bloco: "l1-b2" });
		expect(destinoDaEvidencia(e2!, "m1")).toEqual({ tipo: "bloco", modulo: "m1", licao: "l2", bloco: "l2-b3" });
		expect(destinoDaEvidencia(e3!, "m1")).toEqual({ tipo: "licao", modulo: "m1", licao: "l2" });
		expect(destinoDaEvidencia(e4!, "m1")).toBeUndefined();
	});
});

describe("a linha do relatório no card do curso", () => {
	it("gerando, propostas para decidir, pronto ou nada", () => {
		expect(linhaDoRelatorioNoCard({ situacao: "gerando", pendentes: 0 })).toBe("Gerando o relatório…");
		expect(linhaDoRelatorioNoCard({ situacao: "pronto", pendentes: 2 })).toBe("Relatório: 2 propostas para decidir");
		expect(linhaDoRelatorioNoCard({ situacao: "pronto", pendentes: 1 })).toBe("Relatório: 1 proposta para decidir");
		expect(linhaDoRelatorioNoCard({ situacao: "pronto", pendentes: 0 })).toBe("Relatório pronto");
		expect(linhaDoRelatorioNoCard({ situacao: "pouco_retorno", pendentes: 0 })).toBe("");
		expect(linhaDoRelatorioNoCard({ situacao: "erro", pendentes: 0 })).toBe("");
		expect(linhaDoRelatorioNoCard({ situacao: "nenhum", pendentes: 0 })).toBe("");
		expect(linhaDoRelatorioNoCard(undefined)).toBe("");
	});
});

describe("a ponte do relatório", () => {
	const modulo = { id: "m1", situacao: "gerado", licoes: [{ id: "l1", blocos: [] }] };
	const mensagem = (extra: Record<string, unknown> = {}) => ({ ...alvo, modulo, corrigindo: [], glossario: [], explicando: [], ...extra });

	it("lê o relatório, o gerando e o erro da mensagem modulo, e só o que há", () => {
		const relatorio = relatorioDe();
		const lido = lerModuloAberto([recebida("1", "modulo", mensagem({ relatorio, relatorioGerando: false, relatorioErro: "Falhou." }))], "mat", "cur", "m1");
		expect(lido.relatorio).toEqual(relatorio);
		expect(lido.relatorioGerando).toBeUndefined();
		expect(lido.relatorioErro).toBe("Falhou.");
		const gerando = lerModuloAberto([recebida("1", "modulo", mensagem({ relatorio: null, relatorioGerando: true }))], "mat", "cur", "m1");
		expect(gerando.relatorio).toBeUndefined();
		expect(gerando.relatorioGerando).toBe(true);
	});

	it("o relatório pronto chega numa mensagem modulo sem pedido e substitui o estado de gerando", () => {
		const relatorio = relatorioDe();
		const mensagens = [
			recebida("1", "modulo", mensagem({ relatorio: null, relatorioGerando: true, pedido: "g1" })),
			recebida("2", "modulo", mensagem({ relatorio, relatorioGerando: false })),
		];
		const lido = lerModuloAberto(mensagens, "mat", "cur", "m1");
		expect(lido.relatorioGerando).toBeUndefined();
		expect(faseDoRelatorio({ relatorio: lido.relatorio, gerando: lido.relatorioGerando, erro: lido.relatorioErro })).toBe("pronto");
	});

	it("um módulo sem os campos novos (mensagem antiga) não ganha relatório", () => {
		const lido = lerModuloAberto([recebida("1", "modulo", mensagem())], "mat", "cur", "m1");
		expect(lido).not.toHaveProperty("relatorio");
		expect(lido).not.toHaveProperty("relatorioGerando");
		expect(lido).not.toHaveProperty("relatorioErro");
	});

	it("os erros do relatório e dos ajustes não vão para o card do curso", () => {
		const erros = [
			recebida("1", "erro", { ...alvo, ao: "gerar_relatorio", mensagem: "Falhou o relatório." }),
			recebida("2", "erro", { ao: "ligar_ajuste", arquivo: "exemplos.md", ajuste: "a-1", mensagem: "Falhou." }),
			recebida("3", "erro", { ao: "listar_ajustes", mensagem: "Falhou." }),
			recebida("4", "erro", { ...alvo, ao: "decidir_proposta", proposta: "p1", mensagem: "Falhou." }),
		];
		const lido = lerModulos(erros, "mat", "cur");
		expect(lido.errosModulo).toEqual({});
		expect(lido.erroLista).toBeUndefined();
	});

	describe("os erros por proposta", () => {
		const decidido = relatorioDe();
		const pendente = relatorioDe({ propostas: relatorioDe().propostas.map(({ decisao: _decisao, ...resto }) => resto) });

		it("guarda o erro na proposta que o erro diz, só do módulo", () => {
			const mensagens = [
				recebida("1", "erro", { ...alvo, ao: "decidir_proposta", proposta: "p1", mensagem: "Não gravou.", pedido: "d1" }),
				recebida("2", "erro", { ...alvo, modulo: "m2", ao: "decidir_proposta", proposta: "p1", mensagem: "Outro módulo." }),
				recebida("3", "erro", { ...alvo, ao: "gerar_relatorio", mensagem: "Outra ação." }),
			];
			expect(errosDasPropostas(mensagens, alvo)).toEqual({ p1: { chave: "1", mensagem: "Não gravou.", ao: "decidir_proposta" } });
			expect(errosDasPropostas([], alvo)).toEqual({});
		});

		it("uma decisão desta tela que dá certo apaga o erro dela", () => {
			const erro = recebida("1", "erro", { ...alvo, ao: "decidir_proposta", proposta: "p1", mensagem: "Não gravou.", pedido: "d1" });
			const depois = recebida("2", "modulo", { ...alvo, modulo: { id: "m1" }, relatorio: pendente, pedido: "d2" });
			expect(Object.keys(errosDasPropostas([erro, depois], alvo, { d2: "p1" }))).toEqual([]);
			// Um pedido que não é desta tela para essa proposta não apaga.
			expect(Object.keys(errosDasPropostas([erro, depois], alvo, { d2: "p9" }))).toEqual(["p1"]);
		});

		it("uma proposta que o relatório já traz decidida perde o erro", () => {
			const erro = recebida("1", "erro", { ...alvo, ao: "decidir_proposta", proposta: "p2", mensagem: "Não gravou." });
			const depois = recebida("2", "modulo", { ...alvo, modulo: { id: "m1" }, relatorio: decidido });
			expect(errosDasPropostas([erro, depois], alvo)).toEqual({});
		});
	});
});

describe("a ponte dos ajustes", () => {
	const arquivos: ArquivoDeAjustesNaTela[] = [
		{
			arquivo: "exemplos.md",
			ajustes: [
				{ id: "a-1", texto: "Diga o que o exemplo mostra.", ativo: true, origem: { materia: null, curso: null, modulo: "m1", proposta: "p1", evidencias: ["ev-1"], aprovadoEm: "2026-11-03" } },
				{ id: "a-2", texto: "Escrito à mão.", ativo: false, origem: null },
			],
		},
		{ arquivo: "quiz.md", ajustes: [], erro: "Não consegui ler os ajustes do método quiz.md: a linha 3 não está no formato." },
	];

	it("lê os últimos ajustes, com ou sem pedido", () => {
		expect(lerAjustes([])).toEqual({});
		const lido = lerAjustes([recebida("1", "ajustes", { arquivos: [] }), recebida("2", "ajustes", { arquivos, pedido: "l1" })]);
		expect(lido.arquivos).toEqual(arquivos);
		expect(lerAjustes([recebida("1", "ajustes", { sem: "lista" })])).toEqual({});
	});

	it("o erro do listar_ajustes sem pedido fica até uma lista nova chegar", () => {
		const erro = recebida("1", "erro", { ao: "listar_ajustes", mensagem: "Não listou." });
		expect(lerAjustes([erro])).toEqual({ erro: { chave: "1", mensagem: "Não listou." } });
		expect(lerAjustes([erro, recebida("2", "ajustes", { arquivos })]).erro).toBeUndefined();
		// Com pedido, o erro é de quem pediu (a promessa).
		expect(lerAjustes([recebida("1", "erro", { ao: "listar_ajustes", mensagem: "x", pedido: "p" })])).toEqual({});
		expect(lerAjustes([recebida("1", "erro", { ao: "ligar_ajuste", mensagem: "x" })])).toEqual({});
	});

	it("o erro do ligar_ajuste fica no ajuste, até um ligar dele dar certo", () => {
		const erro = recebida("1", "erro", { ao: "ligar_ajuste", arquivo: "exemplos.md", ajuste: "a-1", mensagem: "Não gravou.", pedido: "l1" });
		expect(errosDosAjustes([erro])).toEqual({ [chaveDoAjuste("exemplos.md", "a-1")]: "Não gravou." });
		const depois = recebida("2", "ajustes", { arquivos, pedido: "l2" });
		expect(errosDosAjustes([erro, depois], { l2: chaveDoAjuste("exemplos.md", "a-1") })).toEqual({});
		expect(errosDosAjustes([erro, depois], { l2: chaveDoAjuste("exemplos.md", "a-2") })).toEqual({ "exemplos.md/a-1": "Não gravou." });
		// Um erro sem arquivo e ajuste não é de nenhum ajuste.
		expect(errosDosAjustes([recebida("1", "erro", { ao: "ligar_ajuste", mensagem: "x" })])).toEqual({});
	});
});

describe("os ajustes em Como o professor escreve", () => {
	const arquivos: ArquivoDeAjustesNaTela[] = [
		{ arquivo: "conceito.md", ajustes: [] },
		{ arquivo: "exemplos.md", ajustes: [{ id: "a-1", texto: "Um.", ativo: true, origem: { materia: null, curso: null, modulo: "m1", proposta: "p1", evidencias: [], aprovadoEm: null } }, { id: "a-2", texto: "Dois.", ativo: false, origem: null }] },
		{ arquivo: "quiz.md", ajustes: [], erro: "Não consegui ler." },
	];

	it("os textos do contrato", () => {
		expect(TITULO_AJUSTES).toBe("Ajustes do método");
		expect(LINHA_AJUSTES).toBe("Estes ajustes vieram dos relatórios dos módulos e entram em toda geração.");
		expect(TEXTO_SEM_AJUSTES).toBe("Nenhum ajuste aprovado ainda.");
		expect(rotuloDoAjuste(true)).toBe("Ligado");
		expect(rotuloDoAjuste(false)).toBe("Desligado");
	});

	it("a origem: do módulo 01, outro nome como está, sem origem escrito à mão", () => {
		expect(rotuloDaOrigemDoAjuste({ modulo: "m1" })).toBe("do módulo 01");
		expect(rotuloDaOrigemDoAjuste({ modulo: "m12" })).toBe("do módulo 12");
		expect(rotuloDaOrigemDoAjuste({ modulo: "intro" })).toBe("do módulo intro");
		expect(rotuloDaOrigemDoAjuste({ modulo: null })).toBe("de um relatório");
		expect(rotuloDaOrigemDoAjuste(null)).toBe("escrito à mão");
	});

	it("conta os ajustes e escolhe os arquivos a mostrar", () => {
		expect(contagemDosAjustes([])).toBe("Nenhum ajuste");
		expect(contagemDosAjustes([arquivos[0]!])).toBe("Nenhum ajuste");
		expect(contagemDosAjustes(arquivos)).toBe("2 ajustes · 1 ligado");
		expect(contagemDosAjustes([{ ajustes: [arquivos[1]!.ajustes[0]!] }])).toBe("1 ajuste");
		expect(arquivosParaMostrar(arquivos).map((arquivo) => arquivo.arquivo)).toEqual(["exemplos.md", "quiz.md"]);
	});

	const ajustesDe = (extra: Partial<AjustesDoMetodo> = {}): AjustesDoMetodo => ({ listar: () => undefined, ligar: async () => undefined, erros: {}, ...extra });

	it("a seção desenha o texto, a origem, a chave e a frase do contrato", () => {
		const html = renderToString(createElement(SecaoAjustes, { ajustes: ajustesDe({ arquivos }) }));
		expect(html).toContain("Ajustes do método");
		expect(html).toContain(LINHA_AJUSTES);
		expect(html).toContain("Exemplos");
		expect(html).toContain("Um.");
		expect(html).toContain("do módulo 01");
		expect(html).toContain("escrito à mão");
		expect(html).toContain("Ligado");
		expect(html).toContain("Desligado");
		// O arquivo que não se lê mostra o erro; o sem ajustes e sem erro não aparece.
		expect(html).toContain("Não consegui ler.");
		expect(html).not.toContain("Conceito");
	});

	it("sem ajustes, a frase do vazio; antes da lista, abrindo; com erro de lista, o erro", () => {
		expect(renderToString(createElement(SecaoAjustes, { ajustes: ajustesDe({ arquivos: [] }) }))).toContain("Nenhum ajuste aprovado ainda.");
		expect(renderToString(createElement(SecaoAjustes, { ajustes: ajustesDe() }))).toContain("Abrindo os ajustes…");
		const comErro = renderToString(createElement(SecaoAjustes, { ajustes: ajustesDe({ erro: { chave: "1", mensagem: "Não listou." } }) }));
		expect(comErro).toContain("Não listou.");
		expect(comErro).toContain("Tentar de novo");
		expect(comErro).not.toContain("Abrindo os ajustes…");
	});

	it("o erro do ligar aparece embaixo do ajuste", () => {
		const html = renderToString(createElement(SecaoAjustes, { ajustes: ajustesDe({ arquivos, erros: { [chaveDoAjuste("exemplos.md", "a-1")]: "Não gravou." } }) }));
		expect(html).toContain("Não gravou.");
	});
});

describe("a seção do relatório", () => {
	const acoesDe = (extra: Partial<AcoesRelatorio> = {}): AcoesRelatorio => ({
		modulo: "m1",
		relatorio: null,
		gerando: false,
		erros: {},
		gerar: async () => undefined,
		decidir: async () => undefined,
		ir: () => undefined,
		...extra,
	});
	const desenhar = (extra: Partial<AcoesRelatorio> = {}) => renderToString(createElement(SecaoRelatorio, { acoes: acoesDe(extra) }));

	it("gerando: a frase e o professor, sem botões", () => {
		const html = desenhar({ gerando: true, relatorio: relatorioDe() });
		expect(html).toContain("Relatório do método");
		expect(html).toContain(TEXTO_GERANDO);
		expect(html).toContain("Professor contente");
		expect(html).not.toContain("Aprovar");
		expect(html).not.toContain("Gerar o relatório");
	});

	it("erro: a frase e Tentar de novo (e o relatório anterior continua)", () => {
		const html = desenhar({ erro: "O modelo não respondeu." });
		expect(html).toContain("O modelo não respondeu.");
		expect(html).toContain("Tentar de novo");
		expect(html).not.toContain("Gerar o relatório do método");
		expect(desenhar({ erro: "Falhou.", relatorio: relatorioDe() })).toContain("Aprovar");
	});

	it("pouco retorno: a frase, quantos retornos e Gerar mesmo assim", () => {
		const html = desenhar({ relatorio: relatorioDe({ situacao: "pouco_retorno", retornos: 2, resumo: "", funcionou: [], problemas: [], propostas: [], evidencias: [] }) });
		expect(html).toContain(TEXTO_POUCO_RETORNO);
		expect(html).toContain("2 retornos neste módulo");
		expect(html).toContain("Gerar mesmo assim");
	});

	it("nenhum: Gerar o relatório do método", () => {
		const html = desenhar();
		expect(html).toContain("Gerar o relatório do método");
		expect(html).not.toContain("Tentar de novo");
	});

	it("pronto: o resumo em Markdown, o que funcionou, o que não funcionou e as evidências", () => {
		const html = desenhar({ relatorio: relatorioDe() });
		expect(html).toContain("<strong>funcionou</strong>");
		expect(html).toContain("O que funcionou");
		expect(html).toContain("O que não funcionou");
		expect(html).toContain("Os exemplos resolvidos ajudaram.");
		expect(html).toContain("l1-b2 · exemplo resolvido · exemplos.md · Feedback Ótimo");
		// A evidência com lugar é um botão; a sem lugar, só o texto.
		expect(html).toMatch(/<button[^>]*relatorio__evidencia[^>]*>.*Feedback Ótimo/);
		expect(html).not.toMatch(/<button[^>]*relatorio__evidencia[^>]*>[^<]*<span[^>]*>Não sei o que é isso/);
		expect(html).toContain("Não sei o que é isso");
	});

	it("pronto: cada proposta com a etiqueta do arquivo, o ajuste, o porquê e os botões; a decidida, a decisão", () => {
		const html = desenhar({ relatorio: relatorioDe() });
		expect(html).toContain("3 propostas · 1 para decidir");
		expect(html).toContain("1 para decidir");
		// A pendente.
		expect(html).toContain(">Exemplos<");
		expect(html).toContain("Antes do código, diga o que ele mostra.");
		expect(html).toContain("Dois blocos foram Ruim por falta de contexto.");
		expect(html).toContain("Aprovar");
		expect(html).toContain("Editar e aprovar");
		expect(html).toContain("Rejeitar");
		// A aprovada com o texto final; a rejeitada com o motivo; as duas sem botões próprios (só a pendente os tem).
		expect(html).toMatch(/Aprovada em \d{2}\/\d{2}/);
		expect(html).toContain("Comece sempre pelo caso concreto.");
		expect(html).toContain("Texto proposto");
		expect(html).toContain("Rejeitada");
		expect(html).toContain("Gosto de quatro alternativas.");
		expect(html.match(/>Aprovar</g)?.length).toBe(1);
		expect(html.match(/>Editar e aprovar</g)?.length).toBe(1);
	});

	it("pronto sem propostas: diz que o professor não propôs ajustes", () => {
		expect(desenhar({ relatorio: relatorioDe({ propostas: [] }) })).toContain("O professor não propôs ajustes desta vez.");
	});

	it("o erro de decidir aparece na proposta", () => {
		const html = desenhar({ relatorio: relatorioDe(), erros: { p1: { chave: "1", mensagem: "Não consegui gravar o ajuste.", ao: "decidir_proposta" } } });
		expect(html).toContain("Não consegui gravar o ajuste.");
	});
});
