// As partes puras das questões do módulo (questao-modulo-tela.ts): a pista e o
// que o QuizQuestion mostra em cada momento do quiz, as etiquetas, o placar da
// dissertativa, a conferência, o progresso no índice e o placar do topo.

import { describe, expect, it } from "vitest";
import type { Correcao } from "../../lib/diagnostico-tipos.ts";
import { progressoDoModulo, type RespostaModulo, type RespostasModulo, situacaoDaQuestao } from "../../lib/modulo-respostas-tipos.ts";
import type { BlocoAlternativa, BlocoDissertativa, BlocoVerificacao, Licao } from "../../lib/modulo-tipos.ts";
import {
	conferenciaDaQuestao,
	etiquetaDaAvaliacao,
	etiquetaDaMarca,
	fraseDaPista,
	placarDoModulo,
	resultadoDaQuestao,
	TEXTO_NAO_TERMINOU,
	textoConferindo,
	textoDoPlacar,
	textoDoProgresso,
	todasFeitas,
	vistaDoQuiz,
} from "./questao-modulo-tela.ts";

const EM = "2026-10-28T12:00:00.000Z";

const quiz = (id: string): BlocoAlternativa => ({
	id,
	tipo: "alternativa",
	conceitos: ["c-a"],
	enunciado: "Qual?",
	alternativas: [{ texto: "A", confusao: "Confunde A com B." }, { texto: "B", correta: true }, { texto: "C", confusao: "Acha que C vale" }],
	explicacao: "Porque B.",
	referencias: [],
});
const pergunta = (id: string): BlocoVerificacao => ({ id, tipo: "verificacao", conceitos: ["c-a"], pergunta: "P?", respostaEsperada: "R." });
const dissertativa = (id: string): BlocoDissertativa => ({
	id,
	tipo: "dissertativa",
	conceitos: ["c-a"],
	enunciado: "Explique.",
	rubrica: [
		{ criterio: "Um", descricao: "d", pontos: 2 },
		{ criterio: "Dois", descricao: "d", pontos: 1 },
	],
	respostaModelo: "Modelo.",
	referencias: [],
});

const tentativaQuiz = (escolha: number, correta: boolean) => ({ escolha, correta, tempoMs: 1000, em: EM });
const respostaQuiz = (...tentativas: ReturnType<typeof tentativaQuiz>[]): RespostaModulo => ({ tipo: "alternativa", versao: 1, confianca: 3, tentativas });
const correcao = (pontos: [number, number]): Correcao => ({
	criterios: [
		{ criterio: "Um", trechos: [], pontos: pontos[0], max: 2, justificativa: "j" },
		{ criterio: "Dois", trechos: [], pontos: pontos[1], max: 1, justificativa: "j" },
	],
	total: pontos[0] + pontos[1],
	max: 3,
	modelo: "openrouter/openai/gpt-6.1-sol",
	custo: 0.01,
});

describe("o quiz", () => {
	it("a pista: a confusão como frase sobre a resposta, com ponto", () => {
		expect(fraseDaPista("Confunde correlação com causalidade.")).toBe("Essa resposta confunde correlação com causalidade.");
		expect(fraseDaPista("Acha que C vale")).toBe("Essa resposta acha que C vale.");
		expect(fraseDaPista("  ")).toBe("");
		expect(fraseDaPista(undefined)).toBe("");
		expect(fraseDaPista(null)).toBe("");
	});

	it("antes de responder: a escolha da tela, sem gabarito", () => {
		expect(vistaDoQuiz(quiz("b"), undefined)).toEqual({ valor: null, erradas: [], confusoes: false });
		expect(vistaDoQuiz(quiz("b"), undefined, 2)).toEqual({ valor: "2", erradas: [], confusoes: false });
	});

	it("depois da primeira errada: ela fica marcada, e não dá para escolhê-la de novo", () => {
		const resposta = respostaQuiz(tentativaQuiz(0, false));
		expect(vistaDoQuiz(quiz("b"), resposta)).toEqual({ valor: null, erradas: [0], confusoes: false });
		expect(vistaDoQuiz(quiz("b"), resposta, 0)).toEqual({ valor: null, erradas: [0], confusoes: false });
		expect(vistaDoQuiz(quiz("b"), resposta, 2)).toEqual({ valor: "2", erradas: [0], confusoes: false });
	});

	it("acertou: a certa verde; a errada de antes continua marcada; sem as confusões", () => {
		expect(vistaDoQuiz(quiz("b"), respostaQuiz(tentativaQuiz(1, true)))).toEqual({ valor: "1", correta: "1", erradas: [], confusoes: false });
		expect(vistaDoQuiz(quiz("b"), respostaQuiz(tentativaQuiz(0, false), tentativaQuiz(1, true)), 2)).toEqual({ valor: "1", correta: "1", erradas: [0], confusoes: false });
	});

	it("acabou sem acerto: o gabarito inteiro, a última como sua resposta", () => {
		expect(vistaDoQuiz(quiz("b"), respostaQuiz(tentativaQuiz(0, false), tentativaQuiz(2, false)))).toEqual({ valor: "2", correta: "1", erradas: [0], confusoes: true });
		const naoSei: RespostaModulo = { tipo: "alternativa", versao: 1, naoSei: { em: EM }, tentativas: [] };
		expect(vistaDoQuiz(quiz("b"), naoSei, 2)).toEqual({ valor: null, correta: "1", erradas: [], confusoes: true });
		const naoSeiDepois: RespostaModulo = { ...respostaQuiz(tentativaQuiz(0, false)), naoSei: { em: EM } };
		expect(vistaDoQuiz(quiz("b"), naoSeiDepois)).toEqual({ valor: "0", correta: "1", erradas: [], confusoes: true });
	});
});

describe("as etiquetas e o placar", () => {
	it("a avaliação da pergunta e a marca do critério, nas cores do resultado", () => {
		expect(etiquetaDaAvaliacao("certa")).toEqual({ texto: "Certa", tom: "sage", icone: "check" });
		expect(etiquetaDaAvaliacao("parcial")).toEqual({ texto: "Em parte", tom: "cream", icone: "refresh" });
		expect(etiquetaDaAvaliacao("errada")).toEqual({ texto: "Errada", tom: "brick", icone: "close" });
		expect(etiquetaDaMarca("coberto").texto).toBe("Coberto");
		expect(etiquetaDaMarca("em_parte")).toEqual({ texto: "Em parte", tom: "cream", icone: "refresh" });
		expect(etiquetaDaMarca("faltou").tom).toBe("brick");
	});

	it("o placar da dissertativa, no singular e no plural", () => {
		expect(textoDoPlacar({ cobertos: 2, criterios: 3, total: 5, max: 8 })).toBe("Você cobriu 2 de 3 pontos-chave · 5 de 8 pontos");
		expect(textoDoPlacar({ cobertos: 0, criterios: 1, total: 0.5, max: 1 })).toBe("Você cobriu 0 de 1 ponto-chave · 0,5 de 1 ponto");
	});
});

describe("a conferência", () => {
	it("nada esperando, conferindo, falhou com o erro, ou não terminou", () => {
		expect(conferenciaDaQuestao({ aConferir: null }, true)).toBeNull();
		expect(conferenciaDaQuestao({ aConferir: 1 }, true, "Falhou.")).toEqual({ tipo: "conferindo" });
		expect(conferenciaDaQuestao({ aConferir: 1 }, false, "O modelo não respondeu.")).toEqual({ tipo: "falhou", mensagem: "O modelo não respondeu." });
		expect(conferenciaDaQuestao({ aConferir: 2 }, false)).toEqual({ tipo: "falhou", mensagem: TEXTO_NAO_TERMINOU });
		expect(conferenciaDaQuestao({ aConferir: 1 }, false, " ")).toEqual({ tipo: "falhou", mensagem: "A conferência não terminou." });
	});

	it("a pergunta confere, a dissertativa corrige", () => {
		expect(textoConferindo("verificacao")).toBe("Conferindo…");
		expect(textoConferindo("dissertativa")).toBe("Corrigindo…");
	});
});

describe("o progresso", () => {
	it("no índice, \"3 de 5\"; sem questão, nada", () => {
		expect(textoDoProgresso({ feitas: 3, questoes: 5 })).toBe("3 de 5");
		expect(textoDoProgresso({ feitas: 0, questoes: 0 })).toBe("");
	});

	it("todas feitas só com alguma questão", () => {
		expect(todasFeitas({ feitas: 3, questoes: 3 })).toBe(true);
		expect(todasFeitas({ feitas: 2, questoes: 3 })).toBe(false);
		expect(todasFeitas({ feitas: 0, questoes: 0 })).toBe(false);
	});

	it("o resultado de cada questão feita", () => {
		expect(resultadoDaQuestao(quiz("b"), undefined)).toBeUndefined();
		expect(resultadoDaQuestao(quiz("b"), respostaQuiz(tentativaQuiz(0, false)))).toBeUndefined();
		expect(resultadoDaQuestao(quiz("b"), respostaQuiz(tentativaQuiz(1, true)))).toBe("correct");
		expect(resultadoDaQuestao(quiz("b"), respostaQuiz(tentativaQuiz(0, false), tentativaQuiz(1, true)))).toBe("partial");
		expect(resultadoDaQuestao(quiz("b"), respostaQuiz(tentativaQuiz(0, false), tentativaQuiz(2, false)))).toBe("incorrect");
		expect(resultadoDaQuestao(quiz("b"), { ...respostaQuiz(tentativaQuiz(0, false)), naoSei: { em: EM } })).toBe("incorrect");
		expect(resultadoDaQuestao(quiz("b"), { tipo: "alternativa", versao: 1, naoSei: { em: EM }, tentativas: [] })).toBe("skipped");

		const texto = { texto: "t", tempoMs: 1, em: EM };
		expect(resultadoDaQuestao(pergunta("b"), { tipo: "verificacao", versao: 1, confianca: 2, tentativas: [texto] })).toBeUndefined();
		expect(resultadoDaQuestao(pergunta("b"), { tipo: "verificacao", versao: 1, confianca: 2, tentativas: [{ ...texto, avaliacao: "parcial", retorno: "r" }] })).toBe("partial");
		expect(resultadoDaQuestao(pergunta("b"), { tipo: "verificacao", versao: 1, confianca: 2, tentativas: [{ ...texto, avaliacao: "errada", retorno: "r" }] })).toBe("incorrect");
		expect(resultadoDaQuestao(pergunta("b"), { tipo: "verificacao", versao: 1, naoSei: { em: EM }, tentativas: [] })).toBe("skipped");

		const corrigida = (pontos: [number, number]) => ({ ...texto, correcao: correcao(pontos) });
		expect(resultadoDaQuestao(dissertativa("b"), { tipo: "dissertativa", versao: 1, confianca: 2, tentativas: [corrigida([2, 1])] })).toBe("correct");
		expect(resultadoDaQuestao(dissertativa("b"), { tipo: "dissertativa", versao: 1, confianca: 2, tentativas: [corrigida([1, 0])] })).toBe("partial");
		expect(resultadoDaQuestao(dissertativa("b"), { tipo: "dissertativa", versao: 1, confianca: 2, tentativas: [corrigida([0, 0])] })).toBe("incorrect");
		// A reescrita corrigida passa a ser a nota; enquanto ela é corrigida, vale a primeira.
		expect(resultadoDaQuestao(dissertativa("b"), { tipo: "dissertativa", versao: 1, confianca: 2, tentativas: [corrigida([0, 0]), corrigida([2, 1])] })).toBe("correct");
		expect(resultadoDaQuestao(dissertativa("b"), { tipo: "dissertativa", versao: 1, confianca: 2, tentativas: [corrigida([0, 0]), texto] })).toBe("incorrect");
		// Uma resposta de outro tipo não vale.
		expect(resultadoDaQuestao(dissertativa("b"), respostaQuiz(tentativaQuiz(1, true)))).toBeUndefined();
	});

	it("o placar do topo: as feitas primeiro, na ordem do módulo, com as mesmas contas do progresso", () => {
		const licoes: Licao[] = [
			{ id: "l1", titulo: "Um", objetivo: "", conceitos: [], blocos: [quiz("l1-b1"), pergunta("l1-b2")] },
			{ id: "l2", titulo: "Dois", objetivo: "", conceitos: [], blocos: [dissertativa("l2-b1"), quiz("l2-b2")] },
		];
		const respostas: RespostasModulo = {
			"l1-b1": respostaQuiz(tentativaQuiz(0, false)),
			"l1-b2": { tipo: "verificacao", versao: 1, naoSei: { em: EM }, tentativas: [] },
			"l2-b2": respostaQuiz(tentativaQuiz(1, true)),
			// De uma versão antiga do bloco: não vale.
			"l2-b1": { tipo: "dissertativa", versao: 2, confianca: 1, tentativas: [{ texto: "t", tempoMs: 1, em: EM, correcao: correcao([2, 1]) }] },
		};
		const placar = placarDoModulo({ licoes, respostas });
		expect(placar).toEqual({ feitas: 2, questoes: 4, resultados: ["skipped", "correct"] });
		const progresso = progressoDoModulo({ licoes, respostas });
		expect({ feitas: placar.feitas, questoes: placar.questoes }).toEqual({ feitas: progresso.feitas, questoes: progresso.questoes });
		expect(placarDoModulo({ licoes })).toEqual({ feitas: 0, questoes: 4, resultados: [] });
		expect(situacaoDaQuestao(quiz("l1-b1"), respostas["l1-b1"]).feita).toBe(false);
	});
});
