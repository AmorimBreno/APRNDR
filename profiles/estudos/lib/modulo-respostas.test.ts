// Testes das respostas das questões do módulo (docs/modulos.md, "Responder
// as questões"): as regras puras (a resposta que vale pela versão do bloco, a
// situação da questão, o que mostrar, o placar da dissertativa, o progresso,
// responder, conferir e encerrar) e o disco numa pasta de dados temporária
// com uma matéria e um curso pronto (o <módulo>.json com as respostas e os
// eventos no aprendiz/eventos.jsonl).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmarEtapa, gravarCurso, novoCurso } from "./cursos.ts";
import type { Correcao, Diagnostico } from "./diagnostico.ts";
import { calcularCalendario, type Modulo as ModuloDoEsqueleto } from "./esqueleto.ts";
import { lerEventos } from "./eventos.ts";
import { criarMateria, eventosAprendiz } from "./materias.ts";
import {
	type AlvoConferencia,
	alvoDaConferencia,
	alvoParaCorrigir,
	aplicarConferencia,
	conferenciaVale,
	encerrarQuestao,
	explicacoesAntes,
	gravarConferencia,
	gravarEncerrada,
	gravarResposta,
	marcaDoCriterio,
	notaDaDissertativa,
	oQueMostrar,
	placarDaDissertativa,
	progressoDaLicao,
	progressoDoModulo,
	questaoDoModulo,
	type RespostaModulo,
	respostaDoBloco,
	responderQuestao,
	situacaoDaQuestao,
	validarAvaliacao,
} from "./modulo-respostas.ts";
import {
	type BlocoAlternativa,
	type BlocoDissertativa,
	type BlocoExplicacao,
	type BlocoVerificacao,
	concluirModulo,
	ErroModulo,
	gravarModulo,
	lerModulo,
	type ModuloGerado,
} from "./modulos.ts";

const AGORA = new Date("2026-10-28T13:00:00.000Z");
const DEPOIS = new Date("2026-10-28T13:05:00.000Z");
const MODELO = "openrouter/openai/gpt-6.1-sol";

const explicacao = (id: string, texto: string, formato: BlocoExplicacao["formato"] = "conceito"): BlocoExplicacao => ({ id, tipo: "explicacao", conceitos: ["c-a"], formato, texto, referencias: [] });
const PERGUNTA: BlocoVerificacao = { id: "l1-b3", tipo: "verificacao", conceitos: ["c-a"], pergunta: "O que o TF conta?", respostaEsperada: "As ocorrências do termo." };
const QUIZ: BlocoAlternativa = {
	id: "l1-b5",
	tipo: "alternativa",
	conceitos: ["c-a"],
	enunciado: "Quanto vale?",
	alternativas: [{ texto: "1", confusao: "Conta documentos." }, { texto: "2", correta: true }, { texto: "3", confusao: "Soma tudo." }, { texto: "4" }],
	explicacao: "São duas ocorrências.",
	referencias: [],
};
const DISSERTATIVA: BlocoDissertativa = {
	id: "l2-b3",
	tipo: "dissertativa",
	conceitos: ["c-a", "c-b"],
	enunciado: "Por que termos raros pesam mais?",
	rubrica: [
		{ criterio: "Raridade", descricao: "Poucos documentos têm o termo.", pontos: 2 },
		{ criterio: "Log", descricao: "O log suaviza.", pontos: 2 },
		{ criterio: "Exemplo", descricao: "Dá um exemplo.", pontos: 1 },
	],
	respostaModelo: "Porque distinguem documentos.",
	referencias: [],
};

function moduloDeTeste(materia = "ri", curso = "p1-busca"): ModuloGerado {
	return {
		versao: 1,
		id: "m1",
		curso,
		materia,
		situacao: "gerado",
		licoes: [
			{
				id: "l1",
				titulo: "Contando termos",
				objetivo: "",
				conceitos: ["c-a"],
				blocos: [explicacao("l1-b1", "Introdução.", "introducao"), explicacao("l1-b2", "O TF conta as ocorrências."), PERGUNTA, { id: "l1-b4", tipo: "ideia_central", conceitos: ["c-a"], texto: "Guarde." }, QUIZ],
			},
			{ id: "l2", titulo: "Termos raros", objetivo: "", conceitos: ["c-a", "c-b"], blocos: [explicacao("l2-b1", "Intro.", "introducao"), explicacao("l2-b2", "O IDF."), DISSERTATIVA] },
		],
		geradoEm: AGORA.toISOString(),
		modelo: MODELO,
		custo: 0.1,
		materiaisUsados: [],
	};
}

/** Uma correção de 3 de 5 pontos: um critério coberto, um em parte, um que faltou. */
const CORRECAO: Correcao = {
	criterios: [
		{ criterio: "Raridade", trechos: ["poucos têm"], pontos: 2, max: 2, justificativa: "Disse." },
		{ criterio: "Log", trechos: ["log"], pontos: 1, max: 2, justificativa: "Em parte." },
		{ criterio: "Exemplo", trechos: [], pontos: 0, max: 1, justificativa: "Não deu." },
	],
	total: 3,
	max: 5,
	modelo: MODELO,
	custo: 0.01,
};
const CORRECAO_CHEIA: Correcao = { ...CORRECAO, criterios: CORRECAO.criterios.map((item) => ({ ...item, pontos: item.max })), total: 5 };

/** Responde e devolve o módulo novo. */
const responder = (modulo: ModuloGerado, bloco: string, entrada: Record<string, unknown>, agora = AGORA) => responderQuestao(modulo, bloco, entrada, agora).modulo;
const respostaDe = (modulo: ModuloGerado, bloco: string) => modulo.respostas?.[bloco] as RespostaModulo;

describe("respostaDoBloco (a resposta que vale)", () => {
	it("vale a do mesmo tipo e da versão atual do bloco; a de outra versão, de outro tipo ou fora do formato, não", () => {
		const resposta = { tipo: "alternativa", versao: 1, confianca: 3, tentativas: [] };
		expect(respostaDoBloco({ "l1-b5": resposta }, QUIZ)).toBe(resposta);
		expect(respostaDoBloco({ "l1-b5": resposta }, { ...QUIZ, versao: 2 })).toBeUndefined();
		expect(respostaDoBloco({ "l1-b5": { ...resposta, versao: 2 } }, { ...QUIZ, versao: 2 })).toBeDefined();
		expect(respostaDoBloco({ "l1-b5": { ...resposta, tipo: "dissertativa" } }, QUIZ)).toBeUndefined();
		expect(respostaDoBloco({ "l1-b5": { tipo: "alternativa", versao: 1 } }, QUIZ)).toBeUndefined();
		expect(respostaDoBloco({ "l1-b1": resposta }, explicacao("l1-b1", "x"))).toBeUndefined();
		expect(respostaDoBloco(undefined, QUIZ)).toBeUndefined();
	});
});

describe("questaoDoModulo", () => {
	it("acha a questão com a lição; bloco que não existe, que não é questão, ou módulo aguardando, ErroModulo", () => {
		const modulo = moduloDeTeste();
		expect(questaoDoModulo(modulo, "l2-b3").licao.id).toBe("l2");
		expect(() => questaoDoModulo(modulo, "l9-b1")).toThrow(/Não achei a questão/);
		expect(() => questaoDoModulo(modulo, "l1-b1")).toThrow(/não é uma questão/);
		expect(() => questaoDoModulo(modulo, undefined)).toThrow(ErroModulo);
		const aguardando = { ...modulo, situacao: "aguardando_material", aguardando: { nota: "", desde: "", prontos: [] } } as never;
		expect(() => questaoDoModulo(aguardando, "l1-b5")).toThrow(/aguardando material/);
	});
});

describe("quiz: duas tentativas, a pista e o gabarito", () => {
	it("nova: aceita a primeira tentativa e o Não sei, sem pista nem gabarito", () => {
		expect(situacaoDaQuestao(QUIZ, undefined)).toEqual({
			feita: false,
			encerrada: false,
			aceitaResposta: true,
			tentativa: 1,
			aceitaNaoSei: true,
			aceitaEncerrar: false,
			aConferir: null,
			escolhas: [],
			confianca: null,
		});
		expect(oQueMostrar(QUIZ, undefined)).toEqual({ pista: null, explicacao: false, gabarito: false });
	});

	it("errada na primeira: a pista com a confusão, a alternativa desligada, a segunda tentativa; certa na segunda: a explicação, sem o gabarito", () => {
		const modulo = moduloDeTeste();
		const primeira = responderQuestao(modulo, "l1-b5", { confianca: 2, escolha: 0, tempoMs: 41000.4 }, AGORA);
		expect(primeira.feito).toEqual({ tipo: "tentativa", numero: 1, aConferir: false });
		expect(primeira.resposta).toEqual({ tipo: "alternativa", versao: 1, confianca: 2, tentativas: [{ escolha: 0, correta: false, confusao: "Conta documentos.", tempoMs: 41000, em: AGORA.toISOString() }] });
		// O módulo recebido não muda.
		expect(modulo.respostas).toBeUndefined();
		const situacao = situacaoDaQuestao(QUIZ, primeira.resposta);
		expect(situacao).toMatchObject({ feita: false, aceitaResposta: true, tentativa: 2, aceitaNaoSei: true, escolhas: [0], confianca: 2 });
		expect(oQueMostrar(QUIZ, primeira.resposta)).toEqual({ pista: "Conta documentos.", explicacao: false, gabarito: false });

		// A escolha repetida é erro; a confiança mandada de novo é ignorada (vale a marcada).
		expect(() => responderQuestao(primeira.modulo, "l1-b5", { escolha: 0, tempoMs: 1 })).toThrow(/já foi escolhida/);
		const segunda = responderQuestao(primeira.modulo, "l1-b5", { confianca: 4, escolha: 1, tempoMs: 12000 }, DEPOIS);
		expect(segunda.feito).toEqual({ tipo: "tentativa", numero: 2, aConferir: false });
		expect(segunda.resposta).toMatchObject({ confianca: 2, tentativas: [{ correta: false }, { escolha: 1, correta: true, tempoMs: 12000, em: DEPOIS.toISOString() }] });
		expect("confusao" in (segunda.resposta.tentativas[1] as object)).toBe(false);
		expect(situacaoDaQuestao(QUIZ, segunda.resposta)).toMatchObject({ feita: true, encerrada: true, aceitaResposta: false, tentativa: null, aceitaNaoSei: false });
		expect(oQueMostrar(QUIZ, segunda.resposta)).toEqual({ pista: null, explicacao: true, gabarito: false });
		expect(() => responderQuestao(segunda.modulo, "l1-b5", { escolha: 2, tempoMs: 1 })).toThrow(/já acabou/);
	});

	it("certa na primeira acaba; errada duas vezes mostra o gabarito inteiro", () => {
		const certa = responder(moduloDeTeste(), "l1-b5", { confianca: 3, escolha: 1, tempoMs: 1 });
		expect(situacaoDaQuestao(QUIZ, respostaDe(certa, "l1-b5"))).toMatchObject({ feita: true, encerrada: true });
		expect(oQueMostrar(QUIZ, respostaDe(certa, "l1-b5"))).toEqual({ pista: null, explicacao: true, gabarito: false });

		let errada = responder(moduloDeTeste(), "l1-b5", { confianca: 1, escolha: 0, tempoMs: 1 });
		errada = responder(errada, "l1-b5", { escolha: 3, tempoMs: 1 });
		// A alternativa sem confusão não leva pista nem confusão.
		expect(respostaDe(errada, "l1-b5").tentativas[1]).toEqual({ escolha: 3, correta: false, tempoMs: 1, em: AGORA.toISOString() });
		expect(situacaoDaQuestao(QUIZ, respostaDe(errada, "l1-b5"))).toMatchObject({ feita: true, encerrada: true, aceitaNaoSei: false });
		expect(oQueMostrar(QUIZ, respostaDe(errada, "l1-b5"))).toEqual({ pista: null, explicacao: true, gabarito: true });
	});

	it("a confiança é exigida na primeira tentativa; a escolha e o tempo são conferidos", () => {
		const modulo = moduloDeTeste();
		expect(() => responderQuestao(modulo, "l1-b5", { escolha: 1, tempoMs: 1 })).toThrow(/confiança/);
		expect(() => responderQuestao(modulo, "l1-b5", { confianca: 5, escolha: 1, tempoMs: 1 })).toThrow(/confiança/);
		expect(() => responderQuestao(modulo, "l1-b5", { confianca: 2, escolha: 4, tempoMs: 1 })).toThrow(/Escolha uma das alternativas/);
		expect(() => responderQuestao(modulo, "l1-b5", { confianca: 2, escolha: 1.5, tempoMs: 1 })).toThrow(/Escolha uma das alternativas/);
		expect(() => responderQuestao(modulo, "l1-b5", { confianca: 2, escolha: 1 })).toThrow(/tempo/);
		expect(() => responderQuestao(modulo, "l1-b5", { confianca: 2, escolha: 1, tempoMs: -1 })).toThrow(/tempo/);
		expect(() => responderQuestao(modulo, "l1-b5", null)).toThrow(/vazia/);
	});

	it("Não sei: sem confiança, acaba a questão como não sabida, com o gabarito; depois da primeira errada, acaba como errada", () => {
		const direto = responderQuestao(moduloDeTeste(), "l1-b5", { naoSei: true }, AGORA);
		expect(direto.feito).toEqual({ tipo: "nao_sei", tentativasAntes: 0 });
		expect(direto.resposta).toEqual({ tipo: "alternativa", versao: 1, naoSei: { em: AGORA.toISOString() }, tentativas: [] });
		expect(situacaoDaQuestao(QUIZ, direto.resposta)).toMatchObject({ feita: true, encerrada: true, aceitaNaoSei: false, aceitaResposta: false });
		expect(oQueMostrar(QUIZ, direto.resposta)).toEqual({ pista: null, explicacao: true, gabarito: true });
		expect(() => responderQuestao(direto.modulo, "l1-b5", { naoSei: true })).toThrow(/já acabou/);

		const errada = responder(moduloDeTeste(), "l1-b5", { confianca: 2, escolha: 0, tempoMs: 1 });
		const depois = responderQuestao(errada, "l1-b5", { naoSei: true }, DEPOIS);
		expect(depois.feito).toEqual({ tipo: "nao_sei", tentativasAntes: 1 });
		expect(depois.resposta).toMatchObject({ confianca: 2, naoSei: { em: DEPOIS.toISOString() }, tentativas: [{ escolha: 0, correta: false }] });
		expect(oQueMostrar(QUIZ, depois.resposta).gabarito).toBe(true);
	});

	it("a resposta de uma versão antiga do bloco não vale: a questão é nova, e a próxima resposta a substitui", () => {
		const respondido = responder(moduloDeTeste(), "l1-b5", { confianca: 3, escolha: 1, tempoMs: 1 });
		const reescrito = structuredClone(respondido);
		reescrito.licoes[0]!.blocos[4] = { ...QUIZ, versao: 2 };
		const bloco = reescrito.licoes[0]!.blocos[4] as BlocoAlternativa;
		expect(respostaDoBloco(reescrito.respostas, bloco)).toBeUndefined();
		expect(situacaoDaQuestao(bloco, respostaDoBloco(reescrito.respostas, bloco))).toMatchObject({ feita: false, tentativa: 1, confianca: null });
		expect(() => responderQuestao(reescrito, "l1-b5", { escolha: 1, tempoMs: 1 })).toThrow(/confiança/);
		const nova = responder(reescrito, "l1-b5", { confianca: 1, escolha: 0, tempoMs: 5 });
		expect(respostaDe(nova, "l1-b5")).toEqual({ tipo: "alternativa", versao: 2, confianca: 1, tentativas: [{ escolha: 0, correta: false, confusao: "Conta documentos.", tempoMs: 5, em: AGORA.toISOString() }] });
	});
});

describe("pergunta: uma tentativa, conferida pelo modelo", () => {
	it("responder grava o texto sem avaliação (a conferir); a conferência dá a avaliação e o gabarito", () => {
		const aplicada = responderQuestao(moduloDeTeste(), "l1-b3", { confianca: 2, texto: "  As ocorrências.  ", tempoMs: 30000 }, AGORA);
		expect(aplicada.feito).toEqual({ tipo: "tentativa", numero: 1, aConferir: true });
		expect(aplicada.resposta).toEqual({ tipo: "verificacao", versao: 1, confianca: 2, tentativas: [{ texto: "As ocorrências.", tempoMs: 30000, em: AGORA.toISOString() }] });
		expect(situacaoDaQuestao(PERGUNTA, aplicada.resposta)).toMatchObject({ feita: false, encerrada: false, aceitaResposta: false, aceitaNaoSei: false, aConferir: 1 });
		expect(oQueMostrar(PERGUNTA, aplicada.resposta).gabarito).toBe(false);
		expect(() => responderQuestao(aplicada.modulo, "l1-b3", { texto: "outra", tempoMs: 1 })).toThrow(/sendo conferida/);
		expect(() => responderQuestao(aplicada.modulo, "l1-b3", { naoSei: true })).toThrow(/sendo conferida/);

		const alvo = alvoDaConferencia(aplicada.modulo, "l1-b3")!;
		expect(alvo).toEqual({ licao: "l1", bloco: "l1-b3", tipo: "verificacao", versao: 1, tentativa: 1, texto: "As ocorrências.", em: AGORA.toISOString(), geradoEm: AGORA.toISOString() });
		expect(conferenciaVale(aplicada.modulo, alvo)).toBe(true);
		const conferida = aplicarConferencia(aplicada.modulo, alvo, { tipo: "verificacao", avaliacao: "parcial", retorno: "Faltou dizer onde.", modelo: MODELO, custo: 0.002 }, DEPOIS);
		expect(conferida.resposta.tentativas[0]).toEqual({ texto: "As ocorrências.", tempoMs: 30000, em: AGORA.toISOString(), avaliacao: "parcial", retorno: "Faltou dizer onde.", modelo: MODELO, custo: 0.002 });
		expect(situacaoDaQuestao(PERGUNTA, conferida.resposta)).toMatchObject({ feita: true, encerrada: true, aConferir: null });
		expect(oQueMostrar(PERGUNTA, conferida.resposta).gabarito).toBe(true);
		// Já conferida: a conferência não vale mais, e não há alvo.
		expect(conferenciaVale(conferida.modulo, alvo)).toBe(false);
		expect(alvoDaConferencia(conferida.modulo, "l1-b3")).toBeUndefined();
		expect(() => aplicarConferencia(conferida.modulo, alvo, { tipo: "verificacao", avaliacao: "certa", retorno: "x", modelo: MODELO, custo: 0 })).toThrow(/jogada fora/);
	});

	it("texto vazio é erro; Não sei antes de responder acaba a questão com a resposta esperada", () => {
		expect(() => responderQuestao(moduloDeTeste(), "l1-b3", { confianca: 2, texto: "   ", tempoMs: 1 })).toThrow(/Escreva a resposta/);
		const naoSei = responderQuestao(moduloDeTeste(), "l1-b3", { naoSei: true }, AGORA);
		expect(situacaoDaQuestao(PERGUNTA, naoSei.resposta)).toMatchObject({ feita: true, encerrada: true, aceitaResposta: false });
		expect(oQueMostrar(PERGUNTA, naoSei.resposta).gabarito).toBe(true);
	});

	it("a conferência fica velha quando o módulo é gerado de novo, o bloco é reescrito ou a tentativa muda", () => {
		const respondido = responder(moduloDeTeste(), "l1-b3", { confianca: 2, texto: "Ocorrências.", tempoMs: 1 });
		const alvo = alvoDaConferencia(respondido, "l1-b3")!;
		expect(conferenciaVale({ ...respondido, geradoEm: DEPOIS.toISOString() }, alvo)).toBe(false);
		const reescrito = structuredClone(respondido);
		reescrito.licoes[0]!.blocos[2] = { ...PERGUNTA, versao: 2 };
		expect(conferenciaVale(reescrito, alvo)).toBe(false);
		expect(conferenciaVale(respondido, { ...alvo, texto: "Outra." })).toBe(false);
		expect(conferenciaVale(undefined, alvo)).toBe(false);
		const semRespostas = { ...respondido, respostas: undefined };
		expect(conferenciaVale(semRespostas, alvo)).toBe(false);
	});

	it("validarAvaliacao: certa, parcial ou errada e o retorno", () => {
		expect(validarAvaliacao({ avaliacao: " Parcial ", retorno: "  Faltou o porquê. " })).toEqual({ avaliacao: "parcial", retorno: "Faltou o porquê." });
		expect(() => validarAvaliacao({ avaliacao: "boa", retorno: "x" })).toThrow(/certa/);
		expect(() => validarAvaliacao({ avaliacao: "certa", retorno: "  " })).toThrow(/retorno/);
		expect(() => validarAvaliacao("certa")).toThrow(ErroModulo);
	});
});

describe("dissertativa: a correção, a reescrita e o encerrar", () => {
	const corrigir = (modulo: ModuloGerado, correcao: Correcao = CORRECAO, agora = DEPOIS) =>
		aplicarConferencia(modulo, alvoDaConferencia(modulo, "l2-b3")!, { tipo: "dissertativa", correcao }, agora).modulo;

	it("a primeira corrigida conta como feita e libera a reescrita e o encerrar; a reescrita corrigida encerra e passa a ser a nota", () => {
		const respondido = responder(moduloDeTeste(), "l2-b3", { confianca: 2, texto: "Primeira.", tempoMs: 180000 });
		expect(situacaoDaQuestao(DISSERTATIVA, respostaDe(respondido, "l2-b3"))).toMatchObject({ feita: false, aceitaResposta: false, aceitaEncerrar: false, aConferir: 1 });
		expect(() => encerrarQuestao(respondido, "l2-b3")).toThrow(/sendo corrigida/);

		const corrigido = corrigir(respondido);
		const primeira = respostaDe(corrigido, "l2-b3");
		expect(primeira.tentativas[0]).toMatchObject({ texto: "Primeira.", correcao: CORRECAO });
		expect(situacaoDaQuestao(DISSERTATIVA, primeira)).toMatchObject({ feita: true, encerrada: false, aceitaResposta: true, tentativa: 2, aceitaNaoSei: false, aceitaEncerrar: true, aConferir: null });
		expect(oQueMostrar(DISSERTATIVA, primeira).gabarito).toBe(false);
		expect(notaDaDissertativa(primeira)).toEqual(CORRECAO);

		const reescrita = responderQuestao(corrigido, "l2-b3", { confianca: 4, texto: "Segunda, melhor.", tempoMs: 60000 }, DEPOIS);
		expect(reescrita.feito).toEqual({ tipo: "tentativa", numero: 2, aConferir: true });
		expect(reescrita.resposta).toMatchObject({ confianca: 2, tentativas: [{ texto: "Primeira." }, { texto: "Segunda, melhor.", tempoMs: 60000 }] });
		expect(situacaoDaQuestao(DISSERTATIVA, reescrita.resposta)).toMatchObject({ feita: true, aceitaResposta: false, aceitaEncerrar: false, aConferir: 2 });
		expect(alvoDaConferencia(reescrita.modulo, "l2-b3")).toMatchObject({ tentativa: 2, texto: "Segunda, melhor." });

		const final = respostaDe(corrigir(reescrita.modulo, CORRECAO_CHEIA, new Date("2026-10-28T13:10:00.000Z")), "l2-b3");
		expect(final).toMatchObject({ encerradaEm: "2026-10-28T13:10:00.000Z" });
		expect(situacaoDaQuestao(DISSERTATIVA, final)).toMatchObject({ feita: true, encerrada: true, aceitaResposta: false, aceitaEncerrar: false });
		expect(oQueMostrar(DISSERTATIVA, final).gabarito).toBe(true);
		expect(notaDaDissertativa(final)).toEqual(CORRECAO_CHEIA);
	});

	it("encerrar (Ver a resposta-modelo) depois da primeira corrigida: encerrada, sem reescrita; encerrar de novo é erro", () => {
		const corrigido = corrigir(responder(moduloDeTeste(), "l2-b3", { confianca: 2, texto: "Primeira.", tempoMs: 1 }));
		const { modulo, resposta } = encerrarQuestao(corrigido, "l2-b3", DEPOIS);
		expect(resposta).toMatchObject({ tipo: "dissertativa", encerradaEm: DEPOIS.toISOString() });
		// A ordem do formato: encerradaEm depois das tentativas.
		expect(Object.keys(resposta)).toEqual(["tipo", "versao", "confianca", "tentativas", "encerradaEm"]);
		expect(situacaoDaQuestao(DISSERTATIVA, resposta)).toMatchObject({ feita: true, encerrada: true, aceitaResposta: false });
		expect(oQueMostrar(DISSERTATIVA, resposta).gabarito).toBe(true);
		expect(() => encerrarQuestao(modulo, "l2-b3")).toThrow(/já está encerrada/);
		expect(() => responderQuestao(modulo, "l2-b3", { texto: "De novo.", tempoMs: 1 })).toThrow(/já acabou/);
		expect(() => encerrarQuestao(moduloDeTeste(), "l2-b3")).toThrow(/ainda não foi respondida/);
		expect(() => encerrarQuestao(moduloDeTeste(), "l1-b5")).toThrow(/não é dissertativa/);
	});

	it("Não sei antes de responder: feita e encerrada, com a rubrica e a resposta-modelo", () => {
		const naoSei = responderQuestao(moduloDeTeste(), "l2-b3", { naoSei: true }, AGORA).resposta;
		expect(situacaoDaQuestao(DISSERTATIVA, naoSei)).toMatchObject({ feita: true, encerrada: true, aceitaEncerrar: false });
		expect(oQueMostrar(DISSERTATIVA, naoSei).gabarito).toBe(true);
	});

	it("o placar em critérios cobertos e pontos, com a marca de cada critério", () => {
		expect(placarDaDissertativa(CORRECAO)).toEqual({ cobertos: 1, criterios: 3, total: 3, max: 5, marcas: ["coberto", "em_parte", "faltou"] });
		expect(placarDaDissertativa(CORRECAO_CHEIA).cobertos).toBe(3);
		expect(marcaDoCriterio({ pontos: 0.5, max: 1 })).toBe("em_parte");
		expect(notaDaDissertativa(undefined)).toBeUndefined();
	});
});

describe("o progresso", () => {
	it("por lição e no módulo, só pelas respostas da versão atual: a pergunta, o quiz e a dissertativa contam", () => {
		let modulo = moduloDeTeste();
		expect(progressoDoModulo(modulo)).toEqual({ feitas: 0, questoes: 3, licoes: [{ licao: "l1", feitas: 0, questoes: 2 }, { licao: "l2", feitas: 0, questoes: 1 }] });
		// O quiz errado uma vez não está feito; a pergunta a conferir também não.
		modulo = responder(modulo, "l1-b5", { confianca: 2, escolha: 0, tempoMs: 1 });
		modulo = responder(modulo, "l1-b3", { confianca: 2, texto: "Ocorrências.", tempoMs: 1 });
		expect(progressoDaLicao(modulo.licoes[0]!, modulo.respostas)).toEqual({ feitas: 0, questoes: 2 });
		modulo = responder(modulo, "l1-b5", { escolha: 1, tempoMs: 1 });
		modulo = responder(modulo, "l2-b3", { naoSei: true });
		expect(progressoDoModulo(modulo)).toEqual({ feitas: 2, questoes: 3, licoes: [{ licao: "l1", feitas: 1, questoes: 2 }, { licao: "l2", feitas: 1, questoes: 1 }] });
		// O quiz reescrito volta a não feito.
		modulo.licoes[0]!.blocos[4] = { ...QUIZ, versao: 2 };
		expect(progressoDoModulo(modulo).feitas).toBe(1);
		expect(progressoDoModulo({ licoes: [] })).toEqual({ feitas: 0, questoes: 0, licoes: [] });
	});
});

describe("explicacoesAntes (o que vai para o modelo da pergunta)", () => {
	it("as explicações logo antes, na ordem, até o bloco que não é explicação, dentro do limite", () => {
		const licao = moduloDeTeste().licoes[0]!;
		expect(explicacoesAntes(licao, "l1-b3")).toEqual(["Introdução.", "O TF conta as ocorrências."]);
		// A ideia central para a volta: o quiz não leva explicação nenhuma.
		expect(explicacoesAntes(licao, "l1-b5")).toEqual([]);
		expect(explicacoesAntes(licao, "l1-b3", 30)).toEqual(["O TF conta as ocorrências."]);
		// A mais próxima entra cortada no começo quando passa do limite sozinha.
		expect(explicacoesAntes(licao, "l1-b3", 10)).toEqual(["[…] orrências."]);
		expect(explicacoesAntes(licao, "nao-existe")).toEqual([]);
	});
});

// --- O disco ----------------------------------------------------------------------------

describe("no disco", () => {
	let dados: string;
	let materia: string;
	const CURSO = "p1-busca";
	const MODULOS: ModuloDoEsqueleto[] = [{ id: "m1", nome: "Pesos", objetivo: "TF-IDF.", conceitos: ["c-a", "c-b"], tipo: "normal", horas: 2 }];
	const origem = async () => ({ modelo: MODELO, prompt: { nome: "modulo-licao.md", hash: "abc123" } });
	const doAprendiz = async (verbo: string) => (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => evento.verbo === verbo);

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-respostas-"));
		materia = (await criarMateria(dados, { nome: "Recuperação de informação" })).id;
		let curso = novoCurso(CURSO, materia, { nome: "P1: busca", prazo: null, prova: "P1", horasPorSemana: 4 }, AGORA);
		curso = confirmarEtapa(curso, "materiais", { arquivos: [] }, AGORA).curso;
		curso = confirmarEtapa(curso, "objetivo", { escopo: "livre", tipo: "misto", motivo: "" }, AGORA).curso;
		curso = confirmarEtapa(curso, "mapa", { conceitos: ["c-a", "c-b"] }, AGORA).curso;
		const diagnostico = { autoavaliacao: { "c-a": 0, "c-b": 0 }, questoes: [], respostas: {}, geradoEm: AGORA.toISOString(), modelo: MODELO, custo: 0, concluidoEm: AGORA.toISOString() } as unknown as Diagnostico;
		curso = confirmarEtapa(curso, "diagnostico", diagnostico, AGORA).curso;
		const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: null, hoje: "2026-10-28" });
		curso = confirmarEtapa(curso, "esqueleto", { modulos: MODULOS, geradoEm: AGORA.toISOString(), modelo: MODELO, custo: 0, criadoEm: AGORA.toISOString(), calendario }, AGORA).curso;
		await gravarCurso(dados, curso);
		await gravarModulo(dados, moduloDeTeste(materia, CURSO));
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	it("o quiz: grava a tentativa com o id do evento respondeu_questao (fase modulo, versão, modelo e prompt do bloco)", async () => {
		const { modulo, evento, alvo } = await gravarResposta(dados, materia, CURSO, "m1", "l1-b5", { confianca: 2, escolha: 0, tempoMs: 41000 }, { sessao: "s1", agora: AGORA, origem });
		expect(alvo).toBeUndefined();
		const lido = (await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado;
		expect(lido.respostas).toEqual(modulo.respostas);
		expect(lido.respostas!["l1-b5"]!.tentativas[0]).toMatchObject({ escolha: 0, correta: false, evento: evento!.id });
		const [gravado] = await doAprendiz("respondeu_questao");
		expect(gravado).toEqual({
			id: evento!.id,
			ts: AGORA.toISOString(),
			sessao: "s1",
			verbo: "respondeu_questao",
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l1", questao: "l1-b5", conceitos: ["c-a"] },
			resultado: { tentativa: 1, escolha: 0, correta: false, confusao: "Conta documentos.", confianca: 2, tempoMs: 41000 },
			contexto: { fase: "modulo", versao: 1, modelo: MODELO, prompt: { nome: "modulo-licao.md", hash: "abc123" } },
		});
		await gravarResposta(dados, materia, CURSO, "m1", "l1-b5", { escolha: 1, tempoMs: 2000 }, { agora: DEPOIS });
		const eventos = await doAprendiz("respondeu_questao");
		expect(eventos).toHaveLength(2);
		// Sem a origem, o modelo do módulo e nada de prompt.
		expect(eventos[1]).toMatchObject({ resultado: { tentativa: 2, escolha: 1, correta: true, confianca: 2, tempoMs: 2000 }, contexto: { fase: "modulo", versao: 1, modelo: MODELO } });
		expect(eventos[1]!.contexto!.prompt).toBeUndefined();
	});

	it("Não sei: o naoSei com o id do evento nao_sabia_questao (tipo e quantas tentativas havia)", async () => {
		await gravarResposta(dados, materia, CURSO, "m1", "l1-b5", { confianca: 2, escolha: 0, tempoMs: 1 }, { agora: AGORA });
		const { evento } = await gravarResposta(dados, materia, CURSO, "m1", "l1-b5", { naoSei: true }, { agora: DEPOIS, origem });
		const [gravado] = await doAprendiz("nao_sabia_questao");
		expect(gravado).toMatchObject({ id: evento!.id, objeto: { questao: "l1-b5" }, resultado: { tipo: "alternativa", tentativas: 1 }, contexto: { fase: "modulo", versao: 1 } });
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).respostas!["l1-b5"]!.naoSei).toEqual({ em: DEPOIS.toISOString(), evento: evento!.id });
	});

	it("a dissertativa: o alvo; a correção grava o respondeu_dissertativa com o corretor; a velha é jogada fora sem gravar", async () => {
		const { alvo, evento } = await gravarResposta(dados, materia, CURSO, "m1", "l2-b3", { confianca: 3, texto: "Primeira.", tempoMs: 180000 }, { agora: AGORA });
		expect(evento).toBeUndefined();
		expect(await doAprendiz("respondeu_dissertativa")).toHaveLength(0);
		expect(alvo).toMatchObject({ bloco: "l2-b3", tentativa: 1, texto: "Primeira." });
		expect((await alvoParaCorrigir(dados, materia, CURSO, "m1", "l2-b3")).alvo).toEqual(alvo);

		const corretor = { modelo: MODELO, prompt: { nome: "corretor.md + metodo/dissertativa.md", hash: "c1 + d1" }, custo: 0.01 };
		const corrigido = await gravarConferencia(dados, materia, CURSO, "m1", alvo!, { tipo: "dissertativa", correcao: CORRECAO }, { agora: DEPOIS, origem, corretor });
		expect(corrigido!.respostas!["l2-b3"]!.tentativas[0]).toMatchObject({ correcao: CORRECAO });
		const [gravado] = await doAprendiz("respondeu_dissertativa");
		expect(gravado).toMatchObject({
			objeto: { materia, curso: CURSO, modulo: "m1", licao: "l2", questao: "l2-b3", conceitos: ["c-a", "c-b"] },
			resultado: { tentativa: 1, texto: "Primeira.", total: 3, max: 5, criterios: [{ criterio: "Raridade", pontos: 2, max: 2 }, { criterio: "Log", pontos: 1, max: 2 }, { criterio: "Exemplo", pontos: 0, max: 1 }], confianca: 3, tempoMs: 180000 },
			contexto: { fase: "modulo", versao: 1, modelo: MODELO, prompt: { nome: "modulo-licao.md", hash: "abc123" }, corretor },
		});
		expect(corrigido!.respostas!["l2-b3"]!.tentativas[0]!.evento).toBe(gravado!.id);
		await expect(alvoParaCorrigir(dados, materia, CURSO, "m1", "l2-b3")).rejects.toThrow(/esperando a conferência/);

		// A mesma conferência de novo (já corrigida): jogada fora, sem gravar.
		expect(await gravarConferencia(dados, materia, CURSO, "m1", alvo!, { tipo: "dissertativa", correcao: CORRECAO_CHEIA }, { corretor })).toBeUndefined();
		expect(await doAprendiz("respondeu_dissertativa")).toHaveLength(1);
		const velha: AlvoConferencia = { ...alvo!, geradoEm: "2026-01-01T00:00:00.000Z" };
		expect(await gravarConferencia(dados, materia, CURSO, "m1", velha, { tipo: "dissertativa", correcao: CORRECAO }, { corretor })).toBeUndefined();

		// Encerrar grava o encerradaEm, sem evento.
		const encerrado = await gravarEncerrada(dados, materia, CURSO, "m1", "l2-b3", { agora: DEPOIS });
		expect(encerrado.respostas!["l2-b3"]).toMatchObject({ encerradaEm: DEPOIS.toISOString() });
		expect((await lerEventos(eventosAprendiz(dados))).eventos).toHaveLength(1);
	});

	it("a pergunta: o respondeu_verificacao chega com a conferência", async () => {
		const { alvo } = await gravarResposta(dados, materia, CURSO, "m1", "l1-b3", { confianca: 1, texto: "Ocorrências.", tempoMs: 30000 }, { agora: AGORA });
		const corretor = { modelo: MODELO, custo: 0.002 };
		await gravarConferencia(dados, materia, CURSO, "m1", alvo!, { tipo: "verificacao", avaliacao: "certa", retorno: "Isso.", modelo: MODELO, custo: 0.002 }, { agora: DEPOIS, corretor });
		const [gravado] = await doAprendiz("respondeu_verificacao");
		expect(gravado).toMatchObject({
			objeto: { questao: "l1-b3", licao: "l1" },
			resultado: { texto: "Ocorrências.", avaliacao: "certa", retorno: "Isso.", confianca: 1, tempoMs: 30000 },
			contexto: { fase: "modulo", versao: 1, modelo: MODELO, corretor: { modelo: MODELO, custo: 0.002 } },
		});
	});

	it("erros não gravam: módulo sem arquivo, questão que não existe, resposta inválida", async () => {
		await expect(gravarResposta(dados, materia, CURSO, "m2", "l1-b5", { naoSei: true })).rejects.toThrow(ErroModulo);
		await expect(gravarResposta(dados, materia, CURSO, "m1", "l9-b9", { naoSei: true })).rejects.toThrow(/Não achei a questão/);
		await expect(gravarResposta(dados, materia, CURSO, "m1", "l1-b5", { escolha: 1, tempoMs: 1 })).rejects.toThrow(/confiança/);
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).respostas).toBeUndefined();
		expect((await lerEventos(eventosAprendiz(dados))).eventos).toHaveLength(0);
	});

	it("concluir o módulo mantém as respostas", async () => {
		await gravarResposta(dados, materia, CURSO, "m1", "l1-b5", { confianca: 3, escolha: 1, tempoMs: 1 }, { agora: AGORA });
		const concluido = await concluirModulo(dados, materia, CURSO, "m1", { agora: DEPOIS });
		expect(concluido.respostas!["l1-b5"]).toMatchObject({ tentativas: [{ correta: true }] });
		expect(((await lerModulo(dados, materia, CURSO, "m1")) as ModuloGerado).respostas!["l1-b5"]).toBeDefined();
	});
});
