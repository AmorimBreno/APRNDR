// O relatório do método e os experimentos na tela (docs/metodo-experimentos.md,
// "A tela" e "Ponte"): as partes puras (relatorio-tela.ts e as dos
// experimentos em escrita-tela.ts), a leitura da ponte (o relatório na
// mensagem modulo e a mensagem ajustes, com os aprendizados) e o desenho das
// seções (RelatorioMetodo.tsx, SecaoExperimentos em ModalEscrita.tsx).

import type { AcaoRecebida } from "@estudos/ui";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RelatorioMetodoV2 } from "../../lib/metodo-analise-tipos.ts";
import type { ArquivoDeAjustesNaTela, RelatorioMetodoV1 } from "../../lib/metodo-ciclo-tipos.ts";
import { type Comparacao, IDS_METRICAS, METRICAS, placarDoModulo } from "../../lib/metodo-placar-tipos.ts";
import { type AjustesDoMetodo, lerAjustes } from "./ajustes-ponte.ts";
import { agruparExperimentos, arquivosComErro, contagemDosAjustes, LINHA_AJUSTES, notaDoSubstituido, rotuloDaOrigemDoAjuste, TEXTO_SEM_AJUSTES, TITULO_AJUSTES } from "./escrita-tela.ts";
import { SecaoExperimentos } from "./ModalEscrita.tsx";
import { lerModuloAberto, lerModulos } from "./modulos-ponte.ts";
import { type AcoesRelatorio, RelatorioMetodo as SecaoRelatorio } from "./RelatorioMetodo.tsx";
import {
	conteudoDoRelatorio,
	contagemDoRelatorio,
	destinoDaEvidencia,
	ehRelatorioV2,
	faseDoRelatorio,
	foiEditada,
	linhaDaRevisao,
	linhaDoPoucoRetorno,
	linhaDoRelatorioNoCard,
	linhaDoTestadoEm,
	linhasDoPlacar,
	rotuloDaDecisao,
	rotuloDaDecisaoDoExperimento,
	rotuloDaSituacao,
	temFacilita,
	temMediaDosAnteriores,
	TEXTO_GERANDO,
	TEXTO_POUCO_RETORNO,
	textoDaProposta,
	valorDaMetrica,
} from "./relatorio-tela.ts";

const recebida = (chave: string, acao: string, dados: unknown): AcaoRecebida => ({ chave, acao, dados });
const alvo = { materia: "mat", curso: "cur", modulo: "m1" };

const evidencias = [
	{ id: "ev-1", linha: "l1-b2 · exemplo resolvido · exemplos.md · Feedback Ótimo", licao: "l1", bloco: "l1-b2" },
	{ id: "ev-2", linha: "l2-b3 · conceito · conceito.md · Feedback Ruim, motivos longo demais", licao: "l2", bloco: "l2-b3" },
	{ id: "ev-3", linha: "Questionário da lição: ritmo Rápido", licao: "l2", bloco: null },
	{ id: "ev-4", linha: "Não sei o que é isso: «radicais»", licao: null, bloco: null },
];

/** O relatório da versão 1: três propostas, uma sem decisão, uma aprovada com o texto editado e uma rejeitada. */
const relatorioDe = (extra: Partial<RelatorioMetodoV1> = {}): RelatorioMetodoV1 => ({
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
	evidencias,
	...extra,
});

const semAmostra = { atual: null, nAtual: 0, media: null, nMedia: 0, modulos: 0 };
/** Uma comparação sem amostra nenhuma, com as métricas dadas no lugar. */
const comparacaoDe = (extra: Partial<Comparacao> = {}): Comparacao => ({ ...(Object.fromEntries(IDS_METRICAS.map((id) => [id, { ...semAmostra }])) as unknown as Comparacao), ...extra });

const testado = (modulo: string, atual = false) => ({ materia: "mat", curso: "c1", modulo, moduloNome: `Módulo ${modulo}`, atual });

/** O relatório da versão 2: um experimento de cada decisão, um novo, um para depois, um aprendizado e uma revisão. */
const relatorioV2De = (extra: Partial<RelatorioMetodoV2> = {}): RelatorioMetodoV2 => ({
	versao: 2,
	modulo: "m3",
	situacao: "pronto",
	geradoEm: "2026-11-20T12:00:00.000Z",
	modelo: "openrouter/openai/gpt-6.1-sol",
	custo: 0.08,
	prompt: { nome: "relatorio-metodo.md", hash: "abc" },
	eventosLidos: 30,
	retornos: 9,
	resumo: "Os **exemplos** antes da definição subiram o entendimento.",
	funcionou: [{ texto: "Os exemplos resolvidos ajudaram.", evidencias: ["ev-1"] }],
	problemas: [{ texto: "Os conceitos ficaram abstratos.", evidencias: ["ev-2", "ev-3"] }],
	evidencias,
	placar: placarDoModulo([], 3),
	comparacao: comparacaoDe({
		quiz: { atual: 0.75, nAtual: 8, media: 0.6667, nMedia: 24, modulos: 3 },
		entendimento: { atual: 3.5, nAtual: 2, media: 3.25, nMedia: 4, modulos: 2 },
		brier: { atual: 0.2134, nAtual: 11, media: null, nMedia: 0, modulos: 0 },
		dissertativas: { atual: null, nAtual: 0, media: 0.5, nMedia: 6, modulos: 2 },
	}),
	experimentos: [
		{ ajuste: "dissertativa.md#a-1", arquivo: "dissertativa.md", texto: "Antes de entregar uma dissertativa, releia a pergunta.", decisao: "manter", porque: "A nota subiu de 52% para 71%.", modulosTestados: 2, testadoEm: [testado("m2"), testado("m3", true)] },
		{ ajuste: "quiz.md#a-1", arquivo: "quiz.md", texto: "Use cinco alternativas.", decisao: "descartar", porque: "Nada mudou.", modulosTestados: 1, testadoEm: [testado("m3", true)] },
		{
			ajuste: "exemplos.md#a-1",
			arquivo: "exemplos.md",
			texto: "Dê exemplos.",
			decisao: "reescrever",
			porque: "O professor foi vago.",
			modulosTestados: 1,
			testadoEm: [testado("m3", true)],
			textoNovo: "Dê um exemplo com números antes de cada definição.",
			novo: "exemplos.md#a-20261120-1",
		},
		{
			ajuste: "conceito.md#a-1",
			arquivo: "conceito.md",
			texto: "Comece pelo caso concreto.",
			decisao: "continuar",
			porque: "A análise não decidiu sobre ele.",
			modulosTestados: 1,
			testadoEm: [testado("m3", true)],
			conserto: "Valeu em 1 módulo; para manter, precisa de 2.",
		},
	],
	propostas: [{ id: "p1", arquivo: "introducao.md", ajuste: "Abra com a pergunta do módulo.", porque: "Dois blocos Ruim na introdução.", evidencias: ["ev-2", "ev-3"], novo: "introducao.md#a-20261120-2" }],
	paraDepois: [{ arquivo: "termos.md", ajuste: "Explique os termos no primeiro uso.", porque: "Três pedidos de explicação.", evidencias: ["ev-3", "ev-4"] }],
	aprendizados: [{ texto: "Exemplos antes da definição deixam o entendimento mais alto.", porque: "Entendimento de 3,5 contra 3,25.", evidencias: ["ev-1"], novo: "ap-20261120-1" }],
	revisoes: [{ aprendizado: "ap-1", texto: "Textos curtos ajudam.", situacao: "contradito", porque: "O ritmo piorou.", anterior: "observado" }],
	aplicadoEm: "2026-11-20T12:01:00.000Z",
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
		expect(faseDoRelatorio({ relatorio: relatorioV2De() })).toBe("pronto");
		expect(faseDoRelatorio({ relatorio: null })).toBe("nenhum");
		expect(faseDoRelatorio({})).toBe("nenhum");
		expect(conteudoDoRelatorio(null)).toBeUndefined();
		expect(conteudoDoRelatorio(relatorioDe())).toBe("pronto");
	});

	it("a linha do pouco retorno diz quantos e o mínimo", () => {
		expect(linhaDoPoucoRetorno(2)).toBe("2 retornos neste módulo; o professor pede pelo menos 3.");
		expect(linhaDoPoucoRetorno(1)).toBe("1 retorno neste módulo; o professor pede pelo menos 3.");
	});

	it("a versão do relatório decide o desenho", () => {
		expect(ehRelatorioV2(relatorioV2De())).toBe(true);
		expect(ehRelatorioV2(relatorioDe())).toBe(false);
	});
});

describe("o cabeçalho do relatório", () => {
	it("versão 2: os experimentos analisados e os novos, só o que existe", () => {
		expect(contagemDoRelatorio(relatorioV2De())).toBe("4 experimentos analisados · 1 novo experimento");
		expect(contagemDoRelatorio(relatorioV2De({ experimentos: relatorioV2De().experimentos.slice(0, 1) }))).toBe("1 experimento analisado · 1 novo experimento");
		expect(contagemDoRelatorio(relatorioV2De({ propostas: [], experimentos: relatorioV2De().experimentos.slice(0, 2) }))).toBe("2 experimentos analisados");
		expect(contagemDoRelatorio(relatorioV2De({ experimentos: [], propostas: relatorioV2De().propostas.concat(relatorioV2De().propostas) }))).toBe("2 novos experimentos");
		expect(contagemDoRelatorio(relatorioV2De({ experimentos: [], propostas: [] }))).toBe("Nenhum experimento");
	});

	it("versão 1: as propostas", () => {
		expect(contagemDoRelatorio(relatorioDe())).toBe("3 propostas");
		expect(contagemDoRelatorio(relatorioDe({ propostas: relatorioDe().propostas.slice(0, 1) }))).toBe("1 proposta");
		expect(contagemDoRelatorio(relatorioDe({ propostas: [] }))).toBe("Nenhuma proposta");
	});
});

describe("o placar", () => {
	const metrica = (id: string) => METRICAS.find((item) => item.id === id)!;

	it("formata taxa em porcentagem, nota com uma casa, Brier com duas e sem amostra com travessão", () => {
		expect(valorDaMetrica(metrica("quiz"), 0.75)).toBe("75%");
		expect(valorDaMetrica(metrica("quiz"), 0.6667)).toBe("67%");
		expect(valorDaMetrica(metrica("quiz"), 0)).toBe("0%");
		expect(valorDaMetrica(metrica("entendimento"), 3.5)).toBe("3,5");
		expect(valorDaMetrica(metrica("entendimento"), 4)).toBe("4,0");
		expect(valorDaMetrica(metrica("entendimento"), 3.25)).toBe("3,3");
		expect(valorDaMetrica(metrica("brier"), 0.2134)).toBe("0,21");
		expect(valorDaMetrica(metrica("brier"), 0.1)).toBe("0,10");
		expect(valorDaMetrica(metrica("pedidosPorLicao"), 1.5)).toBe("1,5");
		expect(valorDaMetrica(metrica("quiz"), null)).toBe("—");
	});

	it("as linhas: o nome da métrica, o valor, o n em texto pequeno e a média com os módulos", () => {
		const linhas = linhasDoPlacar(relatorioV2De().comparacao);
		expect(linhas.map((linha) => linha.id)).toEqual(["quiz", "dissertativas", "entendimento", "brier"]);
		expect(linhas[0]).toEqual({ id: "quiz", nome: "Quiz na 1ª tentativa", atual: "75%", n: "n = 8", media: "67%", nMedia: "n = 24 · 3 módulos" });
		// Sem amostra neste módulo: travessão e nada de n; a média continua.
		expect(linhas[1]).toEqual({ id: "dissertativas", nome: "Dissertativas na 1ª tentativa", atual: "—", n: "", media: "50%", nMedia: "n = 6 · 2 módulos" });
		// Sem média (nenhum módulo anterior tem amostra): travessão e nada de n.
		expect(linhas[3]).toEqual({ id: "brier", nome: "Brier (calibração)", atual: "0,21", n: "n = 11", media: "—", nMedia: "" });
		expect(linhas[2]!.nMedia).toBe("n = 4 · 2 módulos");
		expect(linhasDoPlacar(comparacaoDe({ quiz: { atual: 1, nAtual: 1, media: 0.5, nMedia: 2, modulos: 1 } }))[0]!.nMedia).toBe("n = 2 · 1 módulo");
	});

	it("a métrica sem amostra em nenhum lado fica de fora; sem nenhuma, a tabela some", () => {
		expect(linhasDoPlacar(comparacaoDe())).toEqual([]);
	});

	it("a coluna da média só existe com algum módulo anterior com amostra", () => {
		expect(temMediaDosAnteriores(relatorioV2De().comparacao)).toBe(true);
		expect(temMediaDosAnteriores(comparacaoDe({ quiz: { atual: 0.8, nAtual: 5, media: null, nMedia: 0, modulos: 0 } }))).toBe(false);
		expect(temMediaDosAnteriores(comparacaoDe())).toBe(false);
	});
});

describe("os experimentos decididos", () => {
	it("o rótulo da decisão", () => {
		expect(rotuloDaDecisaoDoExperimento("manter")).toBe("Mantido: virou regra");
		expect(rotuloDaDecisaoDoExperimento("descartar")).toBe("Descartado");
		expect(rotuloDaDecisaoDoExperimento("reescrever")).toBe("Reescrito");
		expect(rotuloDaDecisaoDoExperimento("continuar")).toBe("Continua em teste");
	});

	it("testado em: os ids dos módulos; com o mesmo id em dois cursos, o curso também; sem módulos, nada", () => {
		expect(linhaDoTestadoEm([testado("m2"), testado("m3", true)])).toBe("testado em: m2, m3");
		expect(linhaDoTestadoEm([testado("m3", true)])).toBe("testado em: m3");
		expect(linhaDoTestadoEm([{ curso: "c1", modulo: "m1" }, { curso: "c2", modulo: "m1" }, { curso: "c2", modulo: "m2" }])).toBe("testado em: c1/m1, c2/m1, m2");
		expect(linhaDoTestadoEm([])).toBe("");
	});
});

describe("o que facilita", () => {
	it("a situação e a revisão", () => {
		expect(rotuloDaSituacao("observado")).toBe("Observado");
		expect(rotuloDaSituacao("confirmado")).toBe("Confirmado");
		expect(rotuloDaSituacao("contradito")).toBe("Contradito");
		expect(linhaDaRevisao({ anterior: "observado", situacao: "confirmado" })).toBe("Observado → Confirmado");
	});

	it("só há a seção com um aprendizado novo ou uma revisão", () => {
		expect(temFacilita(relatorioV2De())).toBe(true);
		expect(temFacilita(relatorioV2De({ revisoes: [] }))).toBe(true);
		expect(temFacilita(relatorioV2De({ aprendizados: [] }))).toBe(true);
		expect(temFacilita(relatorioV2De({ aprendizados: [], revisoes: [] }))).toBe(false);
	});
});

describe("as propostas do relatório da versão 1 (só leitura)", () => {
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

describe("as evidências", () => {
	it("o clique leva ao bloco, à lição ou a lugar nenhum", () => {
		const [e1, e2, e3, e4] = evidencias;
		expect(destinoDaEvidencia(e1!, "m1")).toEqual({ tipo: "bloco", modulo: "m1", licao: "l1", bloco: "l1-b2" });
		expect(destinoDaEvidencia(e2!, "m1")).toEqual({ tipo: "bloco", modulo: "m1", licao: "l2", bloco: "l2-b3" });
		expect(destinoDaEvidencia(e3!, "m1")).toEqual({ tipo: "licao", modulo: "m1", licao: "l2" });
		expect(destinoDaEvidencia(e4!, "m1")).toBeUndefined();
	});
});

describe("a linha do relatório no card do curso", () => {
	it("gerando, pronto com os experimentos em teste ou nada", () => {
		expect(linhaDoRelatorioNoCard({ situacao: "gerando" }, 2)).toBe("Gerando o relatório…");
		expect(linhaDoRelatorioNoCard({ situacao: "pronto" }, 2)).toBe("Relatório pronto · 2 experimentos em teste");
		expect(linhaDoRelatorioNoCard({ situacao: "pronto" }, 1)).toBe("Relatório pronto · 1 experimento em teste");
		expect(linhaDoRelatorioNoCard({ situacao: "pronto" }, 0)).toBe("Relatório pronto");
		expect(linhaDoRelatorioNoCard({ situacao: "pronto" }, undefined)).toBe("Relatório pronto");
		expect(linhaDoRelatorioNoCard({ situacao: "pouco_retorno" }, 2)).toBe("");
		expect(linhaDoRelatorioNoCard({ situacao: "erro" }, 2)).toBe("");
		expect(linhaDoRelatorioNoCard({ situacao: "nenhum" }, 2)).toBe("");
		expect(linhaDoRelatorioNoCard(undefined, 2)).toBe("");
	});
});

describe("a ponte do relatório", () => {
	const modulo = { id: "m1", situacao: "gerado", licoes: [{ id: "l1", blocos: [] }] };
	const mensagem = (extra: Record<string, unknown> = {}) => ({ ...alvo, modulo, corrigindo: [], glossario: [], explicando: [], ...extra });

	it("lê o relatório, o gerando e o erro da mensagem modulo, e só o que há", () => {
		const relatorio = relatorioV2De();
		const lido = lerModuloAberto([recebida("1", "modulo", mensagem({ relatorio, relatorioGerando: false, relatorioErro: "Falhou." }))], "mat", "cur", "m1");
		expect(lido.relatorio).toEqual(relatorio);
		expect(lido.relatorioGerando).toBeUndefined();
		expect(lido.relatorioErro).toBe("Falhou.");
		const gerando = lerModuloAberto([recebida("1", "modulo", mensagem({ relatorio: null, relatorioGerando: true }))], "mat", "cur", "m1");
		expect(gerando.relatorio).toBeUndefined();
		expect(gerando.relatorioGerando).toBe(true);
	});

	it("o relatório pronto chega numa mensagem modulo sem pedido e substitui o estado de gerando", () => {
		const relatorio = relatorioV2De();
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

	it("os erros do relatório e da lista de experimentos não vão para o card do curso", () => {
		const erros = [
			recebida("1", "erro", { ...alvo, ao: "gerar_relatorio", mensagem: "Falhou o relatório." }),
			recebida("2", "erro", { ao: "listar_ajustes", mensagem: "Falhou." }),
		];
		const lido = lerModulos(erros, "mat", "cur");
		expect(lido.errosModulo).toEqual({});
		expect(lido.erroLista).toBeUndefined();
	});

	it("o estado traz quantos experimentos estão em teste", () => {
		const lido = lerModulos([recebida("1", "estado", { materia: "mat", curso: "cur", modulos: [], experimentosEmTeste: 2 })], "mat", "cur");
		expect(lido.estado?.experimentosEmTeste).toBe(2);
	});
});

describe("a ponte dos experimentos", () => {
	const arquivos: ArquivoDeAjustesNaTela[] = [
		{
			arquivo: "exemplos.md",
			ajustes: [
				{ id: "a-1", texto: "Diga o que o exemplo mostra.", estado: "em teste", origem: { materia: null, curso: "estudo-x", modulo: "m1", proposta: "p1", evidencias: ["ev-1"], em: "2026-11-03", reescritaDe: null, substituidoPor: null } },
				{ id: "a-2", texto: "Escrito à mão.", estado: "descartado", origem: null },
			],
		},
		{ arquivo: "quiz.md", ajustes: [], erro: "Não consegui ler os ajustes do método quiz.md: a linha 3 não está no formato." },
	];
	const aprendizados = { itens: [{ id: "ap-1", texto: "Exemplos antes da definição.", situacao: "observado" as const, origem: null }] };

	it("lê os últimos experimentos e os aprendizados, com ou sem pedido", () => {
		expect(lerAjustes([])).toEqual({});
		const lido = lerAjustes([recebida("1", "ajustes", { arquivos: [], aprendizados: { itens: [] } }), recebida("2", "ajustes", { arquivos, aprendizados, pedido: "l1" })]);
		expect(lido.arquivos).toEqual(arquivos);
		expect(lido.aprendizados).toEqual(aprendizados);
		expect(lerAjustes([recebida("1", "ajustes", { sem: "lista" })])).toEqual({});
	});

	it("uma mensagem sem aprendizados (extensão antiga) ou com o arquivo ilegível", () => {
		expect(lerAjustes([recebida("1", "ajustes", { arquivos })]).aprendizados).toBeUndefined();
		const comErro = lerAjustes([recebida("1", "ajustes", { arquivos, aprendizados: { itens: [], erro: "Não consegui ler aprendizados.md." } })]);
		expect(comErro.aprendizados).toEqual({ itens: [], erro: "Não consegui ler aprendizados.md." });
		// Um item fora do formato sai.
		expect(lerAjustes([recebida("1", "ajustes", { arquivos, aprendizados: { itens: [{ id: "ap-1" }, ...aprendizados.itens] } })]).aprendizados?.itens).toEqual(aprendizados.itens);
	});

	it("o erro do listar_ajustes sem pedido fica até uma lista nova chegar", () => {
		const erro = recebida("1", "erro", { ao: "listar_ajustes", mensagem: "Não listou." });
		expect(lerAjustes([erro])).toEqual({ erro: { chave: "1", mensagem: "Não listou." } });
		expect(lerAjustes([erro, recebida("2", "ajustes", { arquivos })]).erro).toBeUndefined();
		// Com pedido, o erro é de quem pediu.
		expect(lerAjustes([recebida("1", "erro", { ao: "listar_ajustes", mensagem: "x", pedido: "p" })])).toEqual({});
	});
});

describe("os experimentos em Como o professor escreve", () => {
	const origem = (extra: Record<string, unknown> = {}) => ({ materia: null, curso: null, modulo: "m1", proposta: "p1", evidencias: [], em: null, reescritaDe: null, substituidoPor: null, ...extra });
	const arquivos: ArquivoDeAjustesNaTela[] = [
		{ arquivo: "conceito.md", ajustes: [] },
		{
			arquivo: "exemplos.md",
			ajustes: [
				{ id: "a-1", texto: "Um.", estado: "em teste", origem: origem({ curso: "estudo-x" }) },
				{ id: "a-2", texto: "Dois.", estado: "descartado", origem: origem({ substituidoPor: "a-3" }) },
				{ id: "a-3", texto: "Três.", estado: "em teste", origem: origem({ reescritaDe: "exemplos.md#a-2" }) },
			],
		},
		{ arquivo: "quiz.md", ajustes: [{ id: "a-1", texto: "Quatro.", estado: "mantido", origem: null }] },
		{ arquivo: "termos.md", ajustes: [], erro: "Não consegui ler." },
	];

	it("os textos do contrato", () => {
		expect(TITULO_AJUSTES).toBe("Experimentos do método");
		expect(LINHA_AJUSTES).toBe("A análise de cada módulo concluído decide sobre os experimentos e registra o que facilita para você.");
		expect(TEXTO_SEM_AJUSTES).toBe("Nenhum experimento ainda.");
	});

	it("a origem: do módulo 01 e o curso, reescrita de…, outro nome como está, sem origem escrito à mão", () => {
		expect(rotuloDaOrigemDoAjuste({ modulo: "m1" })).toBe("do módulo 01");
		expect(rotuloDaOrigemDoAjuste({ modulo: "m12", curso: "estudo-x" })).toBe("do módulo 12, curso estudo-x");
		expect(rotuloDaOrigemDoAjuste({ modulo: "intro" })).toBe("do módulo intro");
		expect(rotuloDaOrigemDoAjuste({ modulo: null })).toBe("de um relatório");
		expect(rotuloDaOrigemDoAjuste({ modulo: "m1", curso: "x", reescritaDe: "exemplos.md#a-2" })).toBe("reescrita de exemplos.md#a-2");
		expect(rotuloDaOrigemDoAjuste(null)).toBe("escrito à mão");
		expect(notaDoSubstituido({ substituidoPor: "a-3" })).toBe("substituído por a-3");
		expect(notaDoSubstituido({ substituidoPor: null })).toBe("");
		expect(notaDoSubstituido(null)).toBe("");
	});

	it("agrupa em teste, mantidos e descartados, só os grupos com algum, cada item com o arquivo", () => {
		const grupos = agruparExperimentos(arquivos);
		expect(grupos.map((grupo) => [grupo.titulo, grupo.itens.map((item) => `${item.arquivo}#${item.id}`)])).toEqual([
			["Em teste", ["exemplos.md#a-1", "exemplos.md#a-3"]],
			["Mantidos", ["quiz.md#a-1"]],
			["Descartados", ["exemplos.md#a-2"]],
		]);
		expect(agruparExperimentos([{ arquivo: "quiz.md", ajustes: arquivos[2]!.ajustes }]).map((grupo) => grupo.titulo)).toEqual(["Mantidos"]);
		expect(agruparExperimentos([])).toEqual([]);
	});

	it("conta os experimentos por estado e acha os arquivos com erro", () => {
		expect(contagemDosAjustes([])).toBe("Nenhum experimento");
		expect(contagemDosAjustes([arquivos[0]!])).toBe("Nenhum experimento");
		expect(contagemDosAjustes(arquivos)).toBe("2 em teste · 1 mantido · 1 descartado");
		expect(contagemDosAjustes([{ arquivo: "exemplos.md", ajustes: [arquivos[1]!.ajustes[1]!, arquivos[1]!.ajustes[1]!] }])).toBe("2 descartados");
		expect(arquivosComErro(arquivos).map((arquivo) => arquivo.arquivo)).toEqual(["termos.md"]);
	});

	const ajustesDe = (extra: Partial<AjustesDoMetodo> = {}): AjustesDoMetodo => ({ listar: () => undefined, ...extra });
	const aprendizados = {
		itens: [
			{ id: "ap-1", texto: "Exemplos antes da definição.", situacao: "observado" as const, origem: origem({ curso: "estudo-x", modulo: "m2" }) },
			{ id: "ap-2", texto: "Textos curtos ajudam.", situacao: "contradito" as const, origem: null },
		],
	};

	it("a seção desenha os grupos, o texto, o arquivo, a origem, o que facilita e a frase do contrato", () => {
		const html = renderToString(createElement(SecaoExperimentos, { ajustes: ajustesDe({ arquivos, aprendizados }) }));
		expect(html).toContain("Experimentos do método");
		expect(html).toContain(LINHA_AJUSTES);
		expect(html).toContain("2 em teste · 1 mantido · 1 descartado");
		for (const titulo of ["Em teste", "Mantidos", "Descartados"]) expect(html).toContain(titulo);
		expect(html).toContain("Um.");
		expect(html).toContain("Quatro.");
		expect(html).toContain(">Exemplos<");
		expect(html).toContain(">Quiz<");
		expect(html).toContain("do módulo 01, curso estudo-x");
		expect(html).toContain("reescrita de exemplos.md#a-2");
		expect(html).toContain("substituído por a-3");
		expect(html).toContain("escrito à mão");
		// O que facilita, com a situação de cada aprendizado.
		expect(html).toContain("O que facilita");
		expect(html).toContain("Exemplos antes da definição.");
		expect(html).toContain("Observado");
		expect(html).toContain("Contradito");
		expect(html).toContain("do módulo 02, curso estudo-x");
		// O arquivo que não se lê mostra o erro; o sem ajustes e sem erro não aparece; não há chave nem botão.
		expect(html).toContain("Não consegui ler.");
		expect(html).not.toContain("Conceito");
		expect(html).not.toContain("Ligado");
		expect(html).not.toContain("Desligado");
		expect(html).not.toContain("<button");
	});

	it("sem nada, a frase do vazio; antes da lista, abrindo; com erro de lista, o erro", () => {
		expect(renderToString(createElement(SecaoExperimentos, { ajustes: ajustesDe({ arquivos: [], aprendizados: { itens: [] } }) }))).toContain("Nenhum experimento ainda.");
		// "Abrindo os experimentos…" é passageiro: só aparece depois de 1 s; no primeiro quadro, a linha vazia (aria-hidden) guarda o espaço.
		const abrindo = renderToString(createElement(SecaoExperimentos, { ajustes: ajustesDe() }));
		expect(abrindo).not.toContain("Abrindo os experimentos…");
		expect(abrindo).toContain('class="body ajustes__texto" aria-hidden="true"');
		const comErro = renderToString(createElement(SecaoExperimentos, { ajustes: ajustesDe({ erro: { chave: "1", mensagem: "Não listou." } }) }));
		expect(comErro).toContain("Não listou.");
		expect(comErro).toContain("Tentar de novo");
		expect(comErro).not.toContain("Abrindo os experimentos…");
	});

	it("só aprendizados (sem experimentos) não mostra o vazio; um aprendizados.md ilegível mostra o erro", () => {
		const html = renderToString(createElement(SecaoExperimentos, { ajustes: ajustesDe({ arquivos: [], aprendizados }) }));
		expect(html).not.toContain("Nenhum experimento ainda.");
		expect(html).toContain("O que facilita");
		const ilegivel = renderToString(createElement(SecaoExperimentos, { ajustes: ajustesDe({ arquivos: [], aprendizados: { itens: [], erro: "Não consegui ler aprendizados.md." } }) }));
		expect(ilegivel).toContain("Não consegui ler aprendizados.md.");
	});
});

describe("a seção do relatório", () => {
	const acoesDe = (extra: Partial<AcoesRelatorio> = {}): AcoesRelatorio => ({
		modulo: "m1",
		relatorio: null,
		gerando: false,
		gerar: async () => undefined,
		ir: () => undefined,
		...extra,
	});
	const desenhar = (extra: Partial<AcoesRelatorio> = {}) => renderToString(createElement(SecaoRelatorio, { acoes: acoesDe(extra) }));
	/** A posição de um texto no html (para conferir a ordem das seções). */
	const posicao = (html: string, texto: string) => {
		const indice = html.indexOf(texto);
		expect(indice, `falta "${texto}"`).toBeGreaterThanOrEqual(0);
		return indice;
	};

	it("gerando: a frase e o professor, sem botões", () => {
		const html = desenhar({ gerando: true, relatorio: relatorioV2De() });
		expect(html).toContain("Relatório do método");
		expect(html).toContain(TEXTO_GERANDO);
		expect(html).toContain("Professor contente");
		expect(html).not.toContain("Placar do módulo");
		expect(html).not.toContain("Gerar o relatório");
	});

	it("erro: a frase e Tentar de novo (e o relatório anterior continua)", () => {
		const html = desenhar({ erro: "O modelo não respondeu." });
		expect(html).toContain("O modelo não respondeu.");
		expect(html).toContain("Tentar de novo");
		expect(html).not.toContain("Gerar o relatório do método");
		expect(desenhar({ erro: "Falhou.", relatorio: relatorioV2De() })).toContain("Placar do módulo");
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

	describe("versão 2", () => {
		it("as seções na ordem do contrato", () => {
			const html = desenhar({ relatorio: relatorioV2De() });
			const ordem = ["<strong>exemplos</strong>", "Placar do módulo", ">Experimentos<", "Novos experimentos", "Ficou para depois", "O que facilita", "O que funcionou", "O que não funcionou"].map((texto) => posicao(html, texto));
			expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
			expect(html).toContain("4 experimentos analisados · 1 novo experimento");
		});

		it("o placar: a tabela com a métrica, este módulo e a média dos anteriores, o n em texto pequeno e o travessão sem amostra", () => {
			const html = desenhar({ relatorio: relatorioV2De() });
			expect(html).toContain("Média dos anteriores");
			expect(html).toContain("Quiz na 1ª tentativa");
			expect(html).toContain(">75%<");
			expect(html).toContain(">67%<");
			expect(html).toContain("n = 8");
			expect(html).toContain("n = 24 · 3 módulos");
			expect(html).toContain(">0,21<");
			expect(html).toContain(">3,5<");
			expect(html).toContain(">—<");
			// A métrica sem amostra nenhuma não aparece.
			expect(html).not.toContain("Ritmo");
		});

		it("sem módulo anterior, a coluna da média some", () => {
			const html = desenhar({ relatorio: relatorioV2De({ comparacao: comparacaoDe({ quiz: { atual: 0.75, nAtual: 8, media: null, nMedia: 0, modulos: 0 } }) }) });
			expect(html).toContain("Placar do módulo");
			expect(html).toContain(">75%<");
			expect(html).not.toContain("Média dos anteriores");
			expect(html).not.toContain("relatorio__placar-n\">n = 0");
		});

		it("um cartão por experimento: o arquivo, o texto, a decisão em destaque, testado em e o porquê", () => {
			const html = desenhar({ relatorio: relatorioV2De() });
			expect(html).toContain(">Dissertativa<");
			expect(html).toContain("Antes de entregar uma dissertativa, releia a pergunta.");
			for (const decisao of ["Mantido: virou regra", "Descartado", "Reescrito", "Continua em teste"]) expect(html).toContain(decisao);
			expect(html).toContain("testado em: m2, m3");
			expect(html).toContain("testado em: m3");
			expect(html).toContain("A nota subiu de 52% para 71%.");
			// A reescrita mostra o texto novo; o conserto aparece em texto discreto.
			expect(html).toContain("Dê um exemplo com números antes de cada definição.");
			expect(html).toContain("Texto novo");
			expect(html).toContain("Valeu em 1 módulo; para manter, precisa de 2.");
			// Sem botões de decisão.
			expect(html).not.toContain("<button type=\"button\" class=\"ap-btn");
			expect(html).not.toContain("Aprovar");
			expect(html).not.toContain("Rejeitar");
		});

		it("os novos começam no próximo módulo, com o porquê e as evidências recolhidas", () => {
			const html = desenhar({ relatorio: relatorioV2De() });
			expect(html).toContain(">Introdução<");
			expect(html).toContain("Abra com a pergunta do módulo.");
			expect(html).toContain("Começa no próximo módulo");
			expect(html).toContain("Dois blocos Ruim na introdução.");
			expect(html).toMatch(/<button[^>]*relatorio__evidencia[^>]*>.*Feedback Ruim/);
		});

		it("o que ficou para depois: só leitura, em tom apagado", () => {
			const html = desenhar({ relatorio: relatorioV2De() });
			expect(html).toContain("relatorio__proposta--depois");
			expect(html).toContain("Explique os termos no primeiro uso.");
			expect(html).toContain("Três pedidos de explicação.");
			expect(html).toContain("não entram sozinhas depois");
		});

		it("o que facilita: o aprendizado novo e a revisão com a situação", () => {
			const html = desenhar({ relatorio: relatorioV2De() });
			expect(html).toContain("Exemplos antes da definição deixam o entendimento mais alto.");
			expect(html).toContain("Observado");
			expect(html).toContain("Entendimento de 3,5 contra 3,25.");
			expect(html).toContain("Textos curtos ajudam.");
			expect(html).toContain("Observado → Contradito");
			expect(html).toContain("O ritmo piorou.");
		});

		it("o que funcionou e o que não funcionou, com as evidências", () => {
			const html = desenhar({ relatorio: relatorioV2De() });
			expect(html).toContain("Os exemplos resolvidos ajudaram.");
			expect(html).toContain("l1-b2 · exemplo resolvido · exemplos.md · Feedback Ótimo");
			// A evidência com lugar é um botão; a sem lugar, só o texto.
			expect(html).toMatch(/<button[^>]*relatorio__evidencia[^>]*>.*Feedback Ótimo/);
			expect(html).not.toMatch(/<button[^>]*relatorio__evidencia[^>]*>[^<]*<span[^>]*>Não sei o que é isso/);
		});

		it("seção vazia não aparece", () => {
			const html = desenhar({ relatorio: relatorioV2De({ comparacao: comparacaoDe(), experimentos: [], propostas: [], paraDepois: [], aprendizados: [], revisoes: [], funcionou: [], problemas: [] }) });
			expect(html).toContain("Nenhum experimento");
			for (const titulo of ["Placar do módulo", ">Experimentos<", "Novos experimentos", "Ficou para depois", "O que facilita", "O que funcionou", "O que não funcionou"]) expect(html).not.toContain(titulo);
			// O resumo continua.
			expect(html).toContain("<strong>exemplos</strong>");
		});

		it("o erro ao aplicar aparece no topo do relatório", () => {
			const html = desenhar({ relatorio: relatorioV2De({ erroAoAplicar: "Não consegui gravar o ajuste de exemplos.md." }) });
			expect(html).toContain("Não consegui gravar o ajuste de exemplos.md.");
			expect(posicao(html, "Não consegui gravar o ajuste")).toBeLessThan(posicao(html, "<strong>exemplos</strong>"));
			expect(desenhar({ relatorio: relatorioV2De() })).not.toContain("não foi aplicada");
		});
	});

	describe("versão 1", () => {
		it("o resumo em Markdown, o que funcionou, o que não funcionou e as evidências", () => {
			const html = desenhar({ relatorio: relatorioDe() });
			expect(html).toContain("<strong>funcionou</strong>");
			expect(html).toContain("O que funcionou");
			expect(html).toContain("O que não funcionou");
			expect(html).toContain("Os exemplos resolvidos ajudaram.");
			expect(html).toContain("l1-b2 · exemplo resolvido · exemplos.md · Feedback Ótimo");
			expect(html).not.toContain("Placar do módulo");
		});

		it("as propostas sem botões: a decisão gravada, se houver", () => {
			const html = desenhar({ relatorio: relatorioDe() });
			expect(html).toContain("3 propostas");
			expect(html).toContain("Propostas de ajuste");
			expect(html).toContain(">Exemplos<");
			expect(html).toContain("Antes do código, diga o que ele mostra.");
			expect(html).toContain("Dois blocos foram Ruim por falta de contexto.");
			expect(html).toMatch(/Aprovada em \d{2}\/\d{2}/);
			expect(html).toContain("Comece sempre pelo caso concreto.");
			expect(html).toContain("Texto proposto");
			expect(html).toContain("Rejeitada");
			expect(html).toContain("Gosto de quatro alternativas.");
			expect(html).not.toContain(">Aprovar<");
			expect(html).not.toContain("Editar e aprovar");
			expect(html).not.toContain(">Rejeitar<");
			expect(html).not.toContain("para decidir");
		});

		it("sem propostas: diz que o professor não propôs ajustes", () => {
			expect(desenhar({ relatorio: relatorioDe({ propostas: [] }) })).toContain("O professor não propôs ajustes desta vez.");
		});
	});
});
