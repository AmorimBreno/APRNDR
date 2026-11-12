// Testes das funções puras das hipóteses do aprendiz (item 9, parte B; docs/aprendiz.md, seção 8): a confiança
// nos limites, cada motivo de descarte da validação, aplicar a reflexão, decidir (com a regra do conflito em datas
// fixas), editar, expirar as vencidas, as relevantes e a leitura tolerante do arquivo. Eventos escritos à mão.

import { describe, expect, it } from "vitest";
import {
	aplicarReflexao,
	type ArquivoHipoteses,
	arquivoVazio,
	confiancaDe,
	conflitoRecente,
	type ContextoValidacao,
	decidir,
	editar,
	ErroHipoteses,
	type EventoDeEvidencia,
	expirarVencidas,
	FRASES_PROIBIDAS,
	type Hipotese,
	hipotesesAprovadasRelevantes,
	indexarEventos,
	lerArquivoHipoteses,
	MOTIVOS_DE_DESCARTE,
	type MudancaPendente,
	normalizarTexto,
	type PropostaValida,
	validarProposta,
	validarPropostas,
	VERBOS_DE_HIPOTESE,
	VERSAO_HIPOTESES,
} from "./hipoteses-tipos.ts";

const AGORA = new Date("2026-11-11T12:00:00.000Z");
const M = MOTIVOS_DE_DESCARTE;

function evento(id: string, sessao: string | undefined, ts: string, verbo: EventoDeEvidencia["verbo"] = "respondeu_questao"): EventoDeEvidencia {
	return { id, ts, verbo, ...(sessao ? { sessao } : {}) };
}

const EVENTOS = indexarEventos([
	evento("e1", "s1", "2026-10-20T10:00:00.000Z"),
	evento("e2", "s1", "2026-10-21T10:00:00.000Z"),
	evento("e3", "s2", "2026-10-25T10:00:00.000Z"),
	evento("e4", "s2", "2026-10-26T10:00:00.000Z"),
	evento("e5", "s3", "2026-11-02T10:00:00.000Z"),
	evento("e6", "s3", "2026-11-03T10:00:00.000Z"),
	evento("e7", "s3", "2026-11-04T10:00:00.000Z"),
	evento("e8", "s4", "2026-11-05T10:00:00.000Z"),
	evento("o1", "s1", "2026-01-10T10:00:00.000Z"),
	evento("o2", "s2", "2026-01-11T10:00:00.000Z"),
	evento("o3", "s3", "2026-01-12T10:00:00.000Z"),
	evento("sem", undefined, "2026-11-06T10:00:00.000Z"),
	evento("f1", "s9", "2026-11-07T10:00:00.000Z"),
	evento("x1", "s3", "2026-11-08T10:00:00.000Z", "propos_hipotese"),
]);

function hipotese(extra: Partial<Hipotese> = {}): Hipotese {
	return {
		id: "h-1",
		tipo: "misconception",
		escopo: { nivel: "conceito", materia: "calc", conceitos: ["limites"] },
		enunciado: "Confunde limite com valor da função no ponto",
		aFavor: ["e1", "e2", "e3"],
		contra: [],
		confianca: "media",
		criadaEm: "2026-10-01T10:00:00.000Z",
		ultimaConfirmacao: "2026-10-01T10:00:00.000Z",
		validade: "2026-11-30T10:00:00.000Z",
		status: "aprovada",
		aprovadaPeloUsuario: true,
		versao: 1,
		anteriores: [],
		reflexao: "r-0",
		...extra,
	};
}

const propostaH = (extra: Partial<Hipotese> = {}) => hipotese({ status: "proposta", aprovadaPeloUsuario: false, ...extra });
const mudanca = (extra: Partial<MudancaPendente> = {}): MudancaPendente => ({ id: "m-1", hipotese: "h-1", acao: "enfraquecer", evidencias: ["e5"], motivo: "errou de novo", reflexao: "r-1", criadaEm: "2026-11-10T10:00:00.000Z", ...extra });
const arquivo = (hipoteses: Hipotese[], mudancas: MudancaPendente[] = []): ArquivoHipoteses => ({ versao: VERSAO_HIPOTESES, hipoteses, mudancas });
const copia = <T>(valor: T): T => structuredClone(valor);

describe("confiancaDe", () => {
	const ids = (...numeros: number[]) => numeros.map((numero) => `e${numero}`);

	it("baixa com menos de 3 eventos", () => {
		expect(confiancaDe([], EVENTOS)).toBe("baixa");
		expect(confiancaDe(ids(1), EVENTOS)).toBe("baixa");
		expect(confiancaDe(ids(1, 3), EVENTOS)).toBe("baixa");
	});

	it("baixa com 3 ou mais eventos de uma sessão só", () => {
		expect(confiancaDe(ids(5, 6, 7), EVENTOS)).toBe("baixa");
		expect(confiancaDe(["e1", "e2", "o1", "e1"], EVENTOS)).toBe("baixa");
	});

	it("média com 3 eventos em 2 sessões, e com 4 eventos em 3 sessões", () => {
		expect(confiancaDe(ids(1, 2, 3), EVENTOS)).toBe("media");
		expect(confiancaDe(ids(1, 3, 5, 6), EVENTOS)).toBe("media");
	});

	it("média com 5 eventos em só 2 sessões", () => {
		expect(confiancaDe(["e1", "e2", "o1", "e3", "e4"], EVENTOS)).toBe("media");
	});

	it("alta com 5 eventos em 3 sessões", () => {
		expect(confiancaDe(ids(1, 2, 3, 5, 6), EVENTOS)).toBe("alta");
		expect(confiancaDe(ids(1, 2, 3, 4, 5, 6, 7, 8), EVENTOS)).toBe("alta");
	});

	it("id que não existe não conta (nem o evento de hipótese, nem a repetição)", () => {
		expect(confiancaDe([...ids(1, 2, 3, 5), "nao-existe"], EVENTOS)).toBe("media");
		expect(confiancaDe([...ids(1, 2, 3, 5), "x1"], EVENTOS)).toBe("media");
		expect(confiancaDe([...ids(1, 2, 3, 5), "e1", "e1"], EVENTOS)).toBe("media");
	});

	it("evento sem sessão conta como evento, mas não acrescenta sessão", () => {
		expect(confiancaDe(["e1", "e2", "sem"], EVENTOS)).toBe("baixa");
		expect(confiancaDe(["e1", "e3", "sem"], EVENTOS)).toBe("media");
	});
});

describe("normalizarTexto e as frases proibidas", () => {
	it("tira acento, caixa e pontuação", () => {
		expect(normalizarTexto("  É um APRENDIZ, Visual!! ")).toBe("e um aprendiz visual");
	});
	it("a lista traz as frases do contrato", () => {
		for (const frase of ["aprendiz visual", "aprendiz auditivo", "estilo de aprendizagem", "excelente aluno", "muito bom", "ótimo aluno", "parabéns"]) {
			expect(FRASES_PROIBIDAS).toContain(frase);
		}
	});
});

describe("validarProposta", () => {
	const materias = new Map([["calc", new Set(["limites", "series"])]]);
	const existentes = [
		hipotese(),
		hipotese({ id: "h-rej", status: "rejeitada", aprovadaPeloUsuario: false, enunciado: "Prefere ver o caso real antes da definição formal", aFavor: ["e4"] }),
		hipotese({ id: "h-exp", status: "expirada", aprovadaPeloUsuario: false, enunciado: "Troca derivada por integral nas contas longas", aFavor: ["e8"] }),
		propostaH({ id: "h-prop", enunciado: "Escreve o sinal do expoente ao contrário", aFavor: ["e2"] }),
	];
	const contexto: ContextoValidacao = { eventosPorId: EVENTOS, janela: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "o1", "sem", "x1"], hipoteses: existentes, materias };

	const criar = (extra: Record<string, unknown> = {}) => ({
		acao: "criar",
		tipo: "vocabulario",
		escopo: { nivel: "conceito", materia: "calc", conceitos: ["series"] },
		enunciado: "Usa convergência sem separar sequência de série",
		evidencias: ["e1", "e3"],
		motivo: "apareceu em duas sessões",
		...extra,
	});
	const motivoDe = (proposta: unknown, ctx: ContextoValidacao = contexto) => {
		const resultado = validarProposta(proposta, ctx);
		return resultado.ok ? "ok" : resultado.motivo;
	};

	describe("criar", () => {
		it("aceita a proposta válida e a normaliza", () => {
			const resultado = validarProposta(
				criar({ tipo: "Preferência de forma", enunciado: "  Em   demonstrações\nprefere passo a passo  ", escopo: { nivel: "materia", materia: "calc" }, evidencias: ["e1", " e3 ", "e1"], motivo: "  porque sim  " }),
				contexto,
			);
			expect(resultado).toEqual({
				ok: true,
				proposta: { acao: "criar", tipo: "preferencia_de_forma", escopo: { nivel: "materia", materia: "calc" }, enunciado: "Em demonstrações prefere passo a passo", evidencias: ["e1", "e3"], motivo: "porque sim" },
			});
		});

		it("aceita o escopo global (objeto ou a palavra) e o de conceito sem repetir", () => {
			expect(validarProposta(criar({ escopo: "global" }), contexto)).toMatchObject({ ok: true, proposta: { escopo: { nivel: "global" } } });
			expect(validarProposta(criar({ escopo: { nivel: "global" } }), contexto)).toMatchObject({ ok: true, proposta: { escopo: { nivel: "global" } } });
			expect(validarProposta(criar({ escopo: { nivel: "conceito", materia: "calc", conceitos: ["series", "limites", "series"] } }), contexto)).toMatchObject({
				ok: true,
				proposta: { escopo: { nivel: "conceito", materia: "calc", conceitos: ["series", "limites"] } },
			});
		});

		it("descarta o que não é objeto e a ação desconhecida", () => {
			expect(motivoDe(null)).toBe(M.formatoInvalido);
			expect(motivoDe("criar")).toBe(M.formatoInvalido);
			expect(motivoDe([])).toBe(M.formatoInvalido);
			expect(motivoDe(criar({ acao: "dançar" }))).toBe(M.acaoDesconhecida);
			expect(motivoDe(criar({ acao: undefined }))).toBe(M.acaoDesconhecida);
		});

		it("descarta o enunciado fora de 12 a 300 caracteres (e o que não é texto)", () => {
			expect(motivoDe(criar({ enunciado: "curto demais" }))).toBe("ok"); // 12 caracteres
			expect(motivoDe(criar({ enunciado: "onze chars" }))).toBe(M.enunciadoForaDoTamanho);
			expect(motivoDe(criar({ enunciado: "   " }))).toBe(M.enunciadoForaDoTamanho);
			expect(motivoDe(criar({ enunciado: `Erra ${"x".repeat(295)}` }))).toBe("ok"); // 300
			expect(motivoDe(criar({ enunciado: `Erra ${"x".repeat(296)}` }))).toBe(M.enunciadoForaDoTamanho);
			expect(motivoDe(criar({ enunciado: 42 }))).toBe(M.formatoInvalido);
			expect(motivoDe(criar({ enunciado: undefined }))).toBe(M.formatoInvalido);
		});

		it("descarta rótulos e elogios, com variações de acento, caixa e pontuação", () => {
			for (const texto of [
				"Ele é um aprendiz visual de verdade",
				"É um APRENDIZ  Visual!",
				"Parece um aprendiz auditivo nas aulas",
				"Tem um estilo de aprendizagem prático",
				"Tem ESTILO DE APRENDIZAGEM visual",
				"É um excelente aluno em cálculo",
				"Ele é um Ótimo aluno hoje",
				"Foi muito bom no limite lateral",
				"Parabéns pelo avanço no limite",
				"Parabens, acertou os limites",
			]) {
				expect(motivoDe(criar({ enunciado: texto })), texto).toBe(M.enunciadoGenerico);
			}
			// "bom" sozinho e uma palavra que só começa igual não são elogio genérico.
			expect(motivoDe(criar({ enunciado: "Erra o sinal do expoente, mas tem bom domínio de potências" }))).toBe("ok");
			expect(motivoDe(criar({ enunciado: "Responde muito bomba-relógio nas contas" }))).toBe("ok");
		});

		it("descarta tipo e escopo inválidos, matéria e conceito que não existem", () => {
			expect(motivoDe(criar({ tipo: "estilo" }))).toBe(M.tipoInvalido);
			expect(motivoDe(criar({ tipo: undefined }))).toBe(M.tipoInvalido);
			expect(motivoDe(criar({ escopo: "tudo" }))).toBe(M.escopoInvalido);
			expect(motivoDe(criar({ escopo: undefined }))).toBe(M.escopoInvalido);
			expect(motivoDe(criar({ escopo: { nivel: "planeta" } }))).toBe(M.escopoInvalido);
			expect(motivoDe(criar({ escopo: { nivel: "materia" } }))).toBe(M.escopoInvalido);
			expect(motivoDe(criar({ escopo: { nivel: "materia", materia: "historia" } }))).toBe(M.materiaInexistente);
			expect(motivoDe(criar({ escopo: { nivel: "conceito", materia: "historia", conceitos: ["a"] } }))).toBe(M.materiaInexistente);
			expect(motivoDe(criar({ escopo: { nivel: "conceito", materia: "calc", conceitos: [] } }))).toBe(M.escopoInvalido);
			expect(motivoDe(criar({ escopo: { nivel: "conceito", materia: "calc" } }))).toBe(M.escopoInvalido);
			expect(motivoDe(criar({ escopo: { nivel: "conceito", materia: "calc", conceitos: ["series", "derivadas"] } }))).toBe(M.conceitoInexistente);
		});

		it("descarta o enunciado repetido (texto normalizado) de uma hipótese existente, em qualquer status", () => {
			expect(motivoDe(criar({ enunciado: "confunde limite com valor da funcao, no ponto!" }))).toBe(M.enunciadoRepetido);
			expect(motivoDe(criar({ enunciado: "PREFERE VER O CASO REAL ANTES DA DEFINIÇÃO FORMAL." }))).toBe(M.enunciadoRepetido); // rejeitada
			expect(motivoDe(criar({ enunciado: "Troca derivada por integral nas contas longas" }))).toBe(M.enunciadoRepetido); // expirada
			expect(motivoDe(criar({ enunciado: "Escreve o sinal do expoente ao contrário" }))).toBe(M.enunciadoRepetido); // proposta
			expect(motivoDe(criar({ enunciado: "Escreve o sinal do expoente ao contrário em demonstrações" }))).toBe("ok");
		});

		it("descarta a evidência que falta, que não existe, que não está na janela ou é de hipótese", () => {
			expect(motivoDe(criar({ evidencias: [] }))).toBe(M.semEvidencia);
			expect(motivoDe(criar({ evidencias: undefined }))).toBe(M.semEvidencia);
			expect(motivoDe(criar({ evidencias: "e1" }))).toBe(M.formatoInvalido);
			expect(motivoDe(criar({ evidencias: ["e1", 3] }))).toBe(M.formatoInvalido);
			expect(motivoDe(criar({ evidencias: ["e1", "nao-existe"] }))).toBe(M.evidenciaInexistente);
			expect(motivoDe(criar({ evidencias: ["e1", "f1"] }))).toBe(M.evidenciaForaDaJanela);
			expect(motivoDe(criar({ evidencias: ["e1", "x1"] }))).toBe(M.evidenciaDeEventoDeHipotese);
			expect(VERBOS_DE_HIPOTESE).toContain("propos_hipotese");
		});

		it("descarta menos de 2 eventos e eventos de uma sessão só", () => {
			expect(motivoDe(criar({ evidencias: ["e1"] }))).toBe(M.evidenciaInsuficiente);
			expect(motivoDe(criar({ evidencias: ["e1", "e1", " e1"] }))).toBe(M.evidenciaInsuficiente);
			expect(motivoDe(criar({ evidencias: ["e1", "e2"] }))).toBe(M.evidenciaDeUmaSessao);
			expect(motivoDe(criar({ evidencias: ["e5", "e6", "e7"] }))).toBe(M.evidenciaDeUmaSessao);
			expect(motivoDe(criar({ evidencias: ["e1", "sem"] }))).toBe(M.evidenciaDeUmaSessao);
			expect(motivoDe(criar({ evidencias: ["e1", "e5"] }))).toBe("ok");
		});

		it("o enunciado vem antes da evidência na ordem das conferências", () => {
			expect(motivoDe(criar({ enunciado: "curto", evidencias: ["nao-existe"] }))).toBe(M.enunciadoForaDoTamanho);
		});
	});

	describe("reforçar e enfraquecer", () => {
		const mudar = (extra: Record<string, unknown> = {}) => ({ acao: "reforcar", hipotese: "h-1", evidencias: ["e5", "e6"], motivo: "de novo", ...extra });

		it("aceita e normaliza (a ação com ou sem acento)", () => {
			expect(validarProposta(mudar(), contexto)).toEqual({ ok: true, proposta: { acao: "reforcar", hipotese: "h-1", evidencias: ["e5", "e6"], motivo: "de novo" } });
			expect(validarProposta(mudar({ acao: "Reforçar" }), contexto)).toMatchObject({ ok: true, proposta: { acao: "reforcar" } });
			expect(validarProposta(mudar({ acao: "enfraquecer" }), contexto)).toMatchObject({ ok: true, proposta: { acao: "enfraquecer" } });
		});

		it("descarta a hipótese que não existe ou foi rejeitada", () => {
			expect(motivoDe(mudar({ hipotese: "h-nada" }))).toBe(M.hipoteseInexistente);
			expect(motivoDe(mudar({ hipotese: undefined }))).toBe(M.hipoteseInexistente);
			expect(motivoDe(mudar({ hipotese: "h-rej" }))).toBe(M.hipoteseRejeitada);
		});

		it("aceita reforçar a expirada e a proposta", () => {
			expect(motivoDe(mudar({ hipotese: "h-exp" }))).toBe("ok");
			expect(motivoDe(mudar({ hipotese: "h-prop" }))).toBe("ok");
		});

		it("tira as evidências que a hipótese já cita (a favor ou contra) e descarta se não sobra nenhuma", () => {
			expect(validarProposta(mudar({ evidencias: ["e1", "e5", "e2"] }), contexto)).toMatchObject({ ok: true, proposta: { evidencias: ["e5"] } });
			expect(motivoDe(mudar({ evidencias: ["e1", "e2"] }))).toBe(M.evidenciaJaCitada);
			const comContra = { ...contexto, hipoteses: [hipotese({ contra: ["e4"] })] };
			expect(motivoDe(mudar({ acao: "enfraquecer", evidencias: ["e4"] }), comContra)).toBe(M.evidenciaJaCitada);
		});

		it("tira também as evidências de uma mudança já pendente da mesma hipótese", () => {
			const comPendente = { ...contexto, mudancas: [mudanca({ evidencias: ["e5"] })] };
			expect(validarProposta(mudar({ evidencias: ["e5", "e6"] }), comPendente)).toMatchObject({ ok: true, proposta: { evidencias: ["e6"] } });
			expect(motivoDe(mudar({ evidencias: ["e5"] }), comPendente)).toBe(M.evidenciaJaCitada);
		});

		it("descarta sem evidência, com evidência que não existe e com evidência de hipótese", () => {
			expect(motivoDe(mudar({ evidencias: [] }))).toBe(M.semEvidencia);
			expect(motivoDe(mudar({ evidencias: ["zzz"] }))).toBe(M.evidenciaInexistente);
			expect(motivoDe(mudar({ evidencias: ["x1"] }))).toBe(M.evidenciaDeEventoDeHipotese);
		});

		it("não exige a janela nem 2 sessões", () => {
			expect(motivoDe(mudar({ evidencias: ["f1"] }))).toBe("ok");
			expect(motivoDe(mudar({ evidencias: ["e5"] }))).toBe("ok");
		});
	});

	describe("expirar", () => {
		const expirar = (extra: Record<string, unknown> = {}) => ({ acao: "expirar", hipotese: "h-1", evidencias: [], motivo: "não aparece mais", ...extra });

		it("aceita a aprovada e a proposta, com motivo, mesmo sem evidência", () => {
			expect(validarProposta(expirar(), contexto)).toEqual({ ok: true, proposta: { acao: "expirar", hipotese: "h-1", evidencias: [], motivo: "não aparece mais" } });
			expect(motivoDe(expirar({ hipotese: "h-prop" }))).toBe("ok");
			expect(motivoDe(expirar({ evidencias: ["e8"] }))).toBe("ok");
		});

		it("descarta a rejeitada, a expirada, a que não existe e a sem motivo", () => {
			expect(motivoDe(expirar({ hipotese: "h-rej" }))).toBe(M.hipoteseRejeitada);
			expect(motivoDe(expirar({ hipotese: "h-exp" }))).toBe(M.hipoteseNaoExpira);
			expect(motivoDe(expirar({ hipotese: "h-nada" }))).toBe(M.hipoteseInexistente);
			expect(motivoDe(expirar({ motivo: "   " }))).toBe(M.semMotivo);
			expect(motivoDe(expirar({ motivo: undefined }))).toBe(M.semMotivo);
		});

		it("descarta a evidência que não existe e a expiração repetida", () => {
			expect(motivoDe(expirar({ evidencias: ["zzz"] }))).toBe(M.evidenciaInexistente);
			expect(motivoDe(expirar(), { ...contexto, mudancas: [mudanca({ acao: "expirar", evidencias: [] })] })).toBe(M.mudancaRepetida);
		});
	});

	describe("validarPropostas (o lote)", () => {
		it("separa as válidas, agrupa as descartadas por motivo e conta a criação aceita como existente", () => {
			const lote = [
				criar(),
				criar(), // repete a anterior no mesmo lote
				criar({ enunciado: "Chama de série o que é só uma sequência de termos", evidencias: ["e1"] }),
				criar({ enunciado: "Outro enunciado válido sobre séries numéricas", evidencias: ["e1"] }),
				{ acao: "reforcar", hipotese: "h-1", evidencias: ["e5"], motivo: "" },
				{ acao: "reforcar", hipotese: "h-1", evidencias: ["e5", "e6"], motivo: "" }, // e5 já entrou na anterior
				{ acao: "reforcar", hipotese: "h-1", evidencias: ["e5"], motivo: "" },
				"lixo",
			];
			const { validas, descartadas } = validarPropostas(lote, contexto);
			expect(validas.map((proposta) => proposta.acao)).toEqual(["criar", "reforcar", "reforcar"]);
			expect(validas[2]).toMatchObject({ evidencias: ["e6"] });
			expect(descartadas).toEqual([
				{ motivo: M.enunciadoRepetido, quantas: 1 },
				{ motivo: M.evidenciaInsuficiente, quantas: 2 },
				{ motivo: M.evidenciaJaCitada, quantas: 1 },
				{ motivo: M.formatoInvalido, quantas: 1 },
			]);
		});

		it("o que não é lista perde tudo numa linha só; lista vazia não descarta nada", () => {
			expect(validarPropostas({ acao: "criar" }, contexto)).toEqual({ validas: [], descartadas: [{ motivo: M.formatoInvalido, quantas: 1 }] });
			expect(validarPropostas([], contexto)).toEqual({ validas: [], descartadas: [] });
		});
	});
});

describe("aplicarReflexao", () => {
	const validas: PropostaValida[] = [
		{ acao: "criar", tipo: "misconception", escopo: { nivel: "conceito", materia: "calc", conceitos: ["series"] }, enunciado: "Usa convergência sem separar sequência de série", evidencias: ["e1", "e3", "e5"], motivo: "x" },
		{ acao: "reforcar", hipotese: "h-1", evidencias: ["e5", "e6"], motivo: "mais dois" },
		{ acao: "enfraquecer", hipotese: "h-1", evidencias: ["e4"], motivo: "acertou" },
		{ acao: "expirar", hipotese: "h-2", evidencias: [], motivo: "sumiu" },
	];
	const antes = arquivo([hipotese(), hipotese({ id: "h-2", enunciado: "Erra o sinal ao mover termos de lado", aFavor: ["e8"] })]);
	let contador = 0;
	const opcoes = { reflexao: "r-9", agora: AGORA, novoId: () => `id${++contador}`, eventosPorId: EVENTOS };

	it("criar vira proposta (não aprovada), as outras viram mudanças pendentes, e nada vira aprovada", () => {
		contador = 0;
		const congelado = copia(antes);
		const { arquivo: depois, criadas, mudancas } = aplicarReflexao(antes, validas, opcoes);
		expect(antes).toEqual(congelado);

		expect(criadas).toHaveLength(1);
		expect(criadas[0]).toEqual({
			id: "h-id1",
			tipo: "misconception",
			escopo: { nivel: "conceito", materia: "calc", conceitos: ["series"] },
			enunciado: "Usa convergência sem separar sequência de série",
			aFavor: ["e1", "e3", "e5"],
			contra: [],
			confianca: "media",
			criadaEm: "2026-11-11T12:00:00.000Z",
			ultimaConfirmacao: "2026-11-11T12:00:00.000Z",
			validade: "2027-01-10T12:00:00.000Z",
			status: "proposta",
			aprovadaPeloUsuario: false,
			versao: 1,
			anteriores: [],
			reflexao: "r-9",
		});
		expect(mudancas).toEqual([
			{ id: "m-id2", hipotese: "h-1", acao: "reforcar", evidencias: ["e5", "e6"], motivo: "mais dois", reflexao: "r-9", criadaEm: "2026-11-11T12:00:00.000Z" },
			{ id: "m-id3", hipotese: "h-1", acao: "enfraquecer", evidencias: ["e4"], motivo: "acertou", reflexao: "r-9", criadaEm: "2026-11-11T12:00:00.000Z" },
			{ id: "m-id4", hipotese: "h-2", acao: "expirar", evidencias: [], motivo: "sumiu", reflexao: "r-9", criadaEm: "2026-11-11T12:00:00.000Z" },
		]);
		// As hipóteses que já existiam ficam exatamente como estavam.
		expect(depois.hipoteses.slice(0, 2)).toEqual(antes.hipoteses);
		expect(depois.hipoteses).toHaveLength(3);
		expect(depois.mudancas).toHaveLength(3);
		expect(depois.hipoteses.filter((item) => item.status === "aprovada")).toEqual(antes.hipoteses);
		expect(criadas.every((item) => item.status === "proposta" && !item.aprovadaPeloUsuario)).toBe(true);
	});

	it("ignora a mudança de hipótese que não existe e a que não tem evidência nova", () => {
		contador = 0;
		const { mudancas } = aplicarReflexao(
			antes,
			[
				{ acao: "reforcar", hipotese: "h-nada", evidencias: ["e5"], motivo: "" },
				{ acao: "reforcar", hipotese: "h-1", evidencias: ["e1"], motivo: "" },
			],
			opcoes,
		);
		expect(mudancas).toEqual([]);
	});

	it("mantém a última reflexão do arquivo e as mudanças que já havia", () => {
		contador = 0;
		const ultimaReflexao = { id: "r-1", ts: "2026-11-01T00:00:00.000Z", motivo: "botao" as const, lidos: 3, propostas: 1, aceitas: 1, descartadas: [] };
		const base = { ...arquivo([hipotese()], [mudanca()]), ultimaReflexao };
		const { arquivo: depois } = aplicarReflexao(base, [{ acao: "reforcar", hipotese: "h-1", evidencias: ["e6"], motivo: "" }], opcoes);
		expect(depois.ultimaReflexao).toEqual(ultimaReflexao);
		expect(depois.mudancas.map((item) => item.id)).toEqual(["m-1", "m-id1"]);
	});
});

describe("conflitoRecente", () => {
	const eventos = indexarEventos([
		evento("d60", "s1", "2026-09-12T12:00:00.000Z"), // exatamente 60 dias antes de AGORA
		evento("d61", "s1", "2026-09-12T11:59:59.999Z"), // 1 ms além
		evento("hoje", "s2", "2026-11-11T11:00:00.000Z"),
	]);
	it("conta só os eventos dos últimos 60 dias (o limite entra)", () => {
		expect(conflitoRecente({ aFavor: [], contra: ["d60"] }, eventos, AGORA)).toEqual({ conflito: true, aFavorRecentes: 0, contraRecentes: 1 });
		expect(conflitoRecente({ aFavor: [], contra: ["d61"] }, eventos, AGORA)).toEqual({ conflito: false, aFavorRecentes: 0, contraRecentes: 0 });
	});
	it("conflito só quando o contra supera o a favor; empate não é conflito; id desconhecido não conta", () => {
		expect(conflitoRecente({ aFavor: ["hoje"], contra: ["d60"] }, eventos, AGORA).conflito).toBe(false);
		expect(conflitoRecente({ aFavor: ["hoje", "d61"], contra: ["d60", "hoje2"] }, eventos, AGORA)).toEqual({ conflito: false, aFavorRecentes: 1, contraRecentes: 1 });
		expect(conflitoRecente({ aFavor: ["d61"], contra: ["hoje"] }, eventos, AGORA).conflito).toBe(true);
	});
});

describe("decidir", () => {
	const opcoes = { agora: AGORA, eventosPorId: EVENTOS };
	const quando = AGORA.toISOString();
	const validadeNova = "2027-01-10T12:00:00.000Z";

	describe("a hipótese proposta", () => {
		const base = arquivo([propostaH(), propostaH({ id: "h-2", enunciado: "Erra o sinal ao mover termos de lado", aFavor: ["e4"] })], [mudanca({ id: "m-1" }), mudanca({ id: "m-2", hipotese: "h-2" })]);

		it("aprovar a torna aprovada, com versão nova guardando a anterior, confirmação agora e validade renovada", () => {
			const congelado = copia(base);
			const resultado = decidir(base, { alvo: "hipotese", id: "h-1", decisao: "aprovar" }, opcoes);
			expect(base).toEqual(congelado);
			expect(resultado.hipotese).toMatchObject({
				id: "h-1",
				status: "aprovada",
				aprovadaPeloUsuario: true,
				versao: 2,
				ultimaConfirmacao: quando,
				validade: validadeNova,
				confianca: "media",
				enunciado: "Confunde limite com valor da função no ponto",
			});
			expect(resultado.hipotese!.anteriores).toEqual([{ versao: 1, enunciado: "Confunde limite com valor da função no ponto", status: "proposta", ts: quando }]);
			expect(resultado.anterior).toEqual(base.hipoteses[0]);
			expect(resultado.arquivo.hipoteses[1]).toEqual(base.hipoteses[1]);
			expect(resultado.arquivo.mudancas).toEqual(base.mudancas); // aprovar não mexe nas mudanças
			expect(resultado.conflito).toBe(false);
		});

		it("aprovar com o enunciado editado grava o editado (a versão anterior guarda o original)", () => {
			const resultado = decidir(base, { alvo: "hipotese", id: "h-1", decisao: "aprovar", enunciado: "  Troca  o limite pelo valor da função  no ponto  " }, opcoes);
			expect(resultado.hipotese!.enunciado).toBe("Troca o limite pelo valor da função no ponto");
			expect(resultado.hipotese!.anteriores[0]!.enunciado).toBe("Confunde limite com valor da função no ponto");
		});

		it("aprovar com o enunciado editado inválido é recusado e nada muda", () => {
			for (const enunciado of ["curto", `x${"y".repeat(300)}`, "Ele é um aprendiz visual de verdade", "Erra o sinal ao mover termos de lado", ""]) {
				expect(() => decidir(base, { alvo: "hipotese", id: "h-1", decisao: "aprovar", enunciado }, opcoes), enunciado).toThrow(ErroHipoteses);
			}
		});

		it("o enunciado editado pode repetir o da própria hipótese", () => {
			const resultado = decidir(base, { alvo: "hipotese", id: "h-1", decisao: "aprovar", enunciado: "Confunde limite com valor da função no ponto" }, opcoes);
			expect(resultado.hipotese!.status).toBe("aprovada");
		});

		it("rejeitar a torna rejeitada, tira as mudanças pendentes dela e as devolve", () => {
			const resultado = decidir(base, { alvo: "hipotese", id: "h-1", decisao: "rejeitar" }, opcoes);
			expect(resultado.hipotese).toMatchObject({ status: "rejeitada", aprovadaPeloUsuario: false, versao: 2 });
			expect(resultado.hipotese!.anteriores).toEqual([{ versao: 1, enunciado: "Confunde limite com valor da função no ponto", status: "proposta", ts: quando }]);
			expect(resultado.mudancasRemovidas.map((item) => item.id)).toEqual(["m-1"]);
			expect(resultado.arquivo.mudancas.map((item) => item.id)).toEqual(["m-2"]);
		});

		it("só decide uma hipótese que existe e está proposta", () => {
			expect(() => decidir(base, { alvo: "hipotese", id: "h-nada", decisao: "aprovar" }, opcoes)).toThrow(ErroHipoteses);
			const aprovada = arquivo([hipotese()]);
			expect(() => decidir(aprovada, { alvo: "hipotese", id: "h-1", decisao: "rejeitar" }, opcoes)).toThrow(/aprovada/);
			expect(() => decidir(base, { alvo: "hipotese", id: "h-1", decisao: "talvez" as never }, opcoes)).toThrow(ErroHipoteses);
			expect(() => decidir(base, { alvo: "coisa" as never, id: "h-1", decisao: "aprovar" }, opcoes)).toThrow(ErroHipoteses);
		});

		it("a confiança é recalculada pelo código ao aprovar", () => {
			const resultado = decidir(arquivo([propostaH({ aFavor: ["e1", "e2", "e3", "e5", "e6"], confianca: "baixa" })]), { alvo: "hipotese", id: "h-1", decisao: "aprovar" }, opcoes);
			expect(resultado.hipotese!.confianca).toBe("alta");
		});
	});

	describe("a mudança", () => {
		it("rejeitar só a tira da lista (a hipótese não muda)", () => {
			const base = arquivo([hipotese()], [mudanca(), mudanca({ id: "m-2" })]);
			const resultado = decidir(base, { alvo: "mudanca", id: "m-1", decisao: "rejeitar" }, opcoes);
			expect(resultado.arquivo.hipoteses).toEqual(base.hipoteses);
			expect(resultado.arquivo.mudancas.map((item) => item.id)).toEqual(["m-2"]);
			expect(resultado.mudanca?.id).toBe("m-1");
			expect(resultado.conflito).toBe(false);
		});

		it("rejeitar a mudança de uma hipótese que já não existe a remove sem erro", () => {
			const resultado = decidir(arquivo([], [mudanca()]), { alvo: "mudanca", id: "m-1", decisao: "rejeitar" }, opcoes);
			expect(resultado.arquivo.mudancas).toEqual([]);
			expect(resultado.hipotese).toBeUndefined();
		});

		it("reforçar acrescenta a favor, confirma (confirmação e validade), recalcula a confiança e guarda a versão", () => {
			const base = arquivo([hipotese({ validade: "2026-11-20T10:00:00.000Z" })], [mudanca({ acao: "reforcar", evidencias: ["e1", "e5", "e6"] })]);
			const resultado = decidir(base, { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.hipotese).toMatchObject({ aFavor: ["e1", "e2", "e3", "e5", "e6"], status: "aprovada", aprovadaPeloUsuario: true, confianca: "alta", versao: 2, ultimaConfirmacao: quando, validade: validadeNova });
			expect(resultado.hipotese!.anteriores).toEqual([{ versao: 1, enunciado: "Confunde limite com valor da função no ponto", status: "aprovada", ts: quando }]);
			expect(resultado.evidenciasAcrescentadas).toEqual(["e5", "e6"]); // e1 já era citada
			expect(resultado.arquivo.mudancas).toEqual([]);
			expect(resultado.conflito).toBe(false);
		});

		it("reforçar uma hipótese proposta a mantém proposta; reforçar uma expirada a traz de volta como proposta", () => {
			const proposta = decidir(arquivo([propostaH()], [mudanca({ acao: "reforcar" })]), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(proposta.hipotese).toMatchObject({ status: "proposta", aprovadaPeloUsuario: false });
			const expirada = decidir(arquivo([hipotese({ status: "expirada", aprovadaPeloUsuario: false })], [mudanca({ acao: "reforcar" })]), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(expirada.hipotese).toMatchObject({ status: "proposta", aprovadaPeloUsuario: false, validade: validadeNova });
			expect(expirada.hipotese!.anteriores[0]!.status).toBe("expirada");
		});

		it("enfraquecer acrescenta contra e não confirma", () => {
			const base = arquivo([hipotese()], [mudanca({ evidencias: ["e5", "e6"] })]);
			const resultado = decidir(base, { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.hipotese).toMatchObject({ contra: ["e5", "e6"], aFavor: ["e1", "e2", "e3"], status: "aprovada", versao: 2, ultimaConfirmacao: "2026-10-01T10:00:00.000Z", validade: "2026-11-30T10:00:00.000Z" });
			expect(resultado.conflito).toBe(false);
			expect(resultado.conflitoDetalhe).toBeUndefined();
		});

		it("expirar põe expirada (e não aprovada)", () => {
			const base = arquivo([hipotese()], [mudanca({ acao: "expirar", evidencias: [], motivo: "sumiu" })]);
			const resultado = decidir(base, { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.hipotese).toMatchObject({ status: "expirada", aprovadaPeloUsuario: false, versao: 2 });
			expect(resultado.hipotese!.anteriores[0]).toMatchObject({ status: "aprovada", versao: 1 });
			expect(resultado.arquivo.mudancas).toEqual([]);
		});

		it("expirar uma que já expirou só tira a mudança, sem versão nova", () => {
			const expirada = hipotese({ status: "expirada", aprovadaPeloUsuario: false, versao: 3 });
			const resultado = decidir(arquivo([expirada], [mudanca({ acao: "expirar", evidencias: [] })]), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.hipotese).toEqual(expirada);
			expect(resultado.arquivo.mudancas).toEqual([]);
		});

		it("recusa aprovar a mudança de hipótese que não existe mais ou foi rejeitada, e o id que não existe", () => {
			expect(() => decidir(arquivo([], [mudanca()]), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes)).toThrow(ErroHipoteses);
			expect(() => decidir(arquivo([hipotese({ status: "rejeitada", aprovadaPeloUsuario: false })], [mudanca()]), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes)).toThrow(/rejeitada/);
			expect(() => decidir(arquivo([hipotese()]), { alvo: "mudanca", id: "m-9", decisao: "aprovar" }, opcoes)).toThrow(ErroHipoteses);
		});
	});

	describe("a regra do conflito", () => {
		const aprovada = (extra: Partial<Hipotese> = {}) => hipotese({ aFavor: ["e5", "e6", "e7"], contra: [], ...extra });
		const enfraquecer = (...evidencias: string[]) => [mudanca({ acao: "enfraquecer", evidencias })];

		it("contra recente maior que a favor recente tira a hipótese de aprovada e a devolve a proposta, com o aviso", () => {
			const base = arquivo([aprovada()], enfraquecer("e1", "e2", "e3", "e4"));
			const congelado = copia(base);
			const resultado = decidir(base, { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(base).toEqual(congelado);
			expect(resultado.conflito).toBe(true);
			expect(resultado.conflitoDetalhe).toEqual({ aFavorRecentes: 3, contraRecentes: 4 });
			expect(resultado.hipotese).toMatchObject({ status: "proposta", aprovadaPeloUsuario: false, versao: 2, contra: ["e1", "e2", "e3", "e4"] });
			expect(resultado.hipotese!.anteriores).toEqual([{ versao: 1, enunciado: "Confunde limite com valor da função no ponto", status: "aprovada", ts: quando }]);
		});

		it("empate não é conflito; contra menor também não", () => {
			const empate = decidir(arquivo([aprovada()], enfraquecer("e1", "e2", "e3")), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(empate.conflito).toBe(false);
			expect(empate.hipotese!.status).toBe("aprovada");
			const menor = decidir(arquivo([aprovada()], enfraquecer("e1", "e2")), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(menor.conflito).toBe(false);
			expect(menor.hipotese!.aprovadaPeloUsuario).toBe(true);
		});

		it("só o que é recente conta: a favor antigo não protege a hipótese", () => {
			// 3 a favor antigos (janeiro) + 1 recente; 2 contra recentes: no total 4 a 2 a favor, mas nos recentes é 1 a 2.
			const base = arquivo([aprovada({ aFavor: ["o1", "o2", "o3", "e5"] })], enfraquecer("e1", "e2"));
			const resultado = decidir(base, { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.conflito).toBe(true);
			expect(resultado.conflitoDetalhe).toEqual({ aFavorRecentes: 1, contraRecentes: 2 });
			expect(resultado.hipotese!.status).toBe("proposta");
		});

		it("o contra antigo não conta", () => {
			const resultado = decidir(arquivo([aprovada({ aFavor: ["e5"] })], enfraquecer("o1", "o2", "o3")), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.conflito).toBe(false);
			expect(resultado.hipotese!.status).toBe("aprovada");
		});

		it("uma hipótese que já é proposta não gera aviso de conflito", () => {
			const resultado = decidir(arquivo([propostaH({ aFavor: ["e5"] })], enfraquecer("e1", "e2")), { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.conflito).toBe(false);
			expect(resultado.hipotese!.status).toBe("proposta");
		});

		it("o conflito vale também depois de reforçar, se o contra recente já superava o a favor", () => {
			const base = arquivo([aprovada({ aFavor: ["o1"], contra: ["e1", "e2"] })], [mudanca({ acao: "reforcar", evidencias: ["e5"] })]);
			const resultado = decidir(base, { alvo: "mudanca", id: "m-1", decisao: "aprovar" }, opcoes);
			expect(resultado.conflito).toBe(true);
			expect(resultado.conflitoDetalhe).toEqual({ aFavorRecentes: 1, contraRecentes: 2 });
		});
	});
});

describe("editar", () => {
	const base = arquivo([propostaH(), propostaH({ id: "h-2", enunciado: "Erra o sinal ao mover termos de lado", aFavor: ["e4"] })], [mudanca(), mudanca({ id: "m-2", hipotese: "h-2" })]);
	const quando = AGORA.toISOString();

	it("muda o enunciado (conferido) numa versão nova, sem mexer no status", () => {
		const congelado = copia(base);
		const resultado = editar(base, { id: "h-1", enunciado: "  Confunde   o limite com o valor da função no ponto " }, { agora: AGORA });
		expect(base).toEqual(congelado);
		expect(resultado.mudou).toEqual(["enunciado"]);
		expect(resultado.hipotese).toMatchObject({ enunciado: "Confunde o limite com o valor da função no ponto", status: "proposta", aprovadaPeloUsuario: false, versao: 2 });
		expect(resultado.hipotese.anteriores).toEqual([{ versao: 1, enunciado: "Confunde limite com valor da função no ponto", status: "proposta", ts: quando }]);
		expect(resultado.arquivo.mudancas).toEqual(base.mudancas);
	});

	it("recusa o enunciado que não vale e o que repete outra hipótese", () => {
		for (const enunciado of ["curto", "Ele é um aprendiz visual de verdade", "erra o sinal ao mover termos de lado!"]) {
			expect(() => editar(base, { id: "h-1", enunciado }, { agora: AGORA }), enunciado).toThrow(ErroHipoteses);
		}
	});

	it("aprovada marca aprovadaPeloUsuario e confirma; rejeitada tira as mudanças pendentes", () => {
		const aprovada = editar(base, { id: "h-1", status: "aprovada" }, { agora: AGORA });
		expect(aprovada.mudou).toEqual(["status"]);
		expect(aprovada.hipotese).toMatchObject({ status: "aprovada", aprovadaPeloUsuario: true, ultimaConfirmacao: quando, validade: "2027-01-10T12:00:00.000Z", versao: 2 });
		expect(aprovada.mudancasRemovidas).toEqual([]);

		const rejeitada = editar(base, { id: "h-1", status: "rejeitada" }, { agora: AGORA });
		expect(rejeitada.hipotese).toMatchObject({ status: "rejeitada", aprovadaPeloUsuario: false });
		expect(rejeitada.mudancasRemovidas.map((item) => item.id)).toEqual(["m-1"]);
		expect(rejeitada.arquivo.mudancas.map((item) => item.id)).toEqual(["m-2"]);
	});

	it("enunciado e status juntos são uma versão só; reabrir uma rejeitada é possível", () => {
		const rejeitada = arquivo([hipotese({ status: "rejeitada", aprovadaPeloUsuario: false })]);
		const resultado = editar(rejeitada, { id: "h-1", enunciado: "Confunde limite com valor no ponto, só às vezes", status: "aprovada" }, { agora: AGORA });
		expect(resultado.mudou).toEqual(["enunciado", "status"]);
		expect(resultado.hipotese).toMatchObject({ versao: 2, status: "aprovada", aprovadaPeloUsuario: true });
		expect(resultado.hipotese.anteriores).toHaveLength(1);
	});

	it("a regra do conflito não vale na edição: o Breno decide", () => {
		const contra = hipotese({ status: "proposta", aprovadaPeloUsuario: false, aFavor: ["e5"], contra: ["e1", "e2", "e3"] });
		expect(editar(arquivo([contra]), { id: "h-1", status: "aprovada" }, { agora: AGORA }).hipotese.status).toBe("aprovada");
	});

	it("sem mudança de fato, devolve o mesmo arquivo, sem versão nova", () => {
		const aprovada = arquivo([hipotese()]);
		const resultado = editar(aprovada, { id: "h-1", status: "aprovada", enunciado: "confunde limite com valor da função no ponto" }, { agora: AGORA });
		// O texto mudou só na caixa: conta como mudança de enunciado.
		expect(resultado.mudou).toEqual(["enunciado"]);
		const igual = editar(aprovada, { id: "h-1", status: "aprovada", enunciado: "Confunde limite com valor da função no ponto" }, { agora: AGORA });
		expect(igual.mudou).toEqual([]);
		expect(igual.arquivo).toBe(aprovada);
		expect(igual.hipotese.versao).toBe(1);
	});

	it("erros de uso: id que não existe, nada para editar, status que o Breno não pode pôr", () => {
		expect(() => editar(base, { id: "h-nada", status: "aprovada" }, { agora: AGORA })).toThrow(ErroHipoteses);
		expect(() => editar(base, { id: "h-1" }, { agora: AGORA })).toThrow(ErroHipoteses);
		expect(() => editar(base, { id: "h-1", status: "expirada" as never }, { agora: AGORA })).toThrow(/aprovada ou rejeitada/);
		expect(() => editar(base, { id: "h-1", status: "proposta" as never }, { agora: AGORA })).toThrow(ErroHipoteses);
	});
});

describe("expirarVencidas", () => {
	const base = arquivo(
		[
			hipotese({ id: "h-venceu", validade: "2026-11-11T11:59:59.999Z" }),
			hipotese({ id: "h-agora", validade: "2026-11-11T12:00:00.000Z" }),
			propostaH({ id: "h-proposta", validade: "2026-10-01T00:00:00.000Z" }),
			hipotese({ id: "h-vale", validade: "2026-11-11T12:00:00.001Z" }),
			hipotese({ id: "h-rej", status: "rejeitada", aprovadaPeloUsuario: false, validade: "2026-01-01T00:00:00.000Z" }),
			hipotese({ id: "h-exp", status: "expirada", aprovadaPeloUsuario: false, validade: "2026-01-01T00:00:00.000Z" }),
		],
		[mudanca({ hipotese: "h-venceu" })],
	);

	it("expira as aprovadas e as propostas vencidas (versão nova) e devolve quais", () => {
		const congelado = copia(base);
		const { arquivo: depois, expiradas } = expirarVencidas(base, AGORA);
		expect(base).toEqual(congelado);
		expect(expiradas.map((item) => item.hipotese.id)).toEqual(["h-venceu", "h-agora", "h-proposta"]);
		expect(expiradas[0]!.anterior).toEqual(base.hipoteses[0]);
		const porId = new Map(depois.hipoteses.map((item) => [item.id, item]));
		for (const id of ["h-venceu", "h-agora", "h-proposta"]) {
			expect(porId.get(id)).toMatchObject({ status: "expirada", aprovadaPeloUsuario: false, versao: 2 });
		}
		expect(porId.get("h-venceu")!.anteriores).toEqual([{ versao: 1, enunciado: "Confunde limite com valor da função no ponto", status: "aprovada", ts: AGORA.toISOString() }]);
		expect(porId.get("h-proposta")!.anteriores[0]!.status).toBe("proposta");
		expect(porId.get("h-vale")).toEqual(base.hipoteses[3]);
		expect(porId.get("h-rej")).toEqual(base.hipoteses[4]);
		expect(porId.get("h-exp")).toEqual(base.hipoteses[5]);
		expect(depois.mudancas).toEqual(base.mudancas);
	});

	it("sem nada vencido devolve o mesmo arquivo", () => {
		const em = new Date("2026-06-01T00:00:00.000Z");
		const resultado = expirarVencidas(base, em);
		expect(resultado.expiradas).toEqual([]);
		expect(resultado.arquivo).toBe(base);
	});
});

describe("hipotesesAprovadasRelevantes", () => {
	const lista = arquivo([
		hipotese({ id: "global-media", escopo: { nivel: "global" }, confianca: "media", ultimaConfirmacao: "2026-11-01T00:00:00.000Z" }),
		hipotese({ id: "global-alta-velha", escopo: { nivel: "global" }, confianca: "alta", ultimaConfirmacao: "2026-10-01T00:00:00.000Z" }),
		hipotese({ id: "global-alta-nova", escopo: { nivel: "global" }, confianca: "alta", ultimaConfirmacao: "2026-11-05T00:00:00.000Z" }),
		hipotese({ id: "materia-calc", escopo: { nivel: "materia", materia: "calc" }, confianca: "baixa" }),
		hipotese({ id: "materia-fis", escopo: { nivel: "materia", materia: "fis" } }),
		hipotese({ id: "conceito-limites", escopo: { nivel: "conceito", materia: "calc", conceitos: ["limites", "continuidade"] }, confianca: "media", ultimaConfirmacao: "2026-11-09T00:00:00.000Z" }),
		hipotese({ id: "conceito-series", escopo: { nivel: "conceito", materia: "calc", conceitos: ["series"] } }),
		hipotese({ id: "conceito-fis", escopo: { nivel: "conceito", materia: "fis", conceitos: ["limites"] } }),
		hipotese({ id: "proposta", escopo: { nivel: "global" }, status: "proposta", aprovadaPeloUsuario: false }),
		hipotese({ id: "rejeitada", escopo: { nivel: "global" }, status: "rejeitada", aprovadaPeloUsuario: false }),
		hipotese({ id: "expirada", escopo: { nivel: "global" }, status: "expirada", aprovadaPeloUsuario: false }),
		hipotese({ id: "aprovada-sem-o-breno", escopo: { nivel: "global" }, aprovadaPeloUsuario: false }),
		hipotese({ id: "vencida", escopo: { nivel: "global" }, validade: "2026-11-10T00:00:00.000Z" }),
	]);
	const ids = (filtro: Parameters<typeof hipotesesAprovadasRelevantes>[1]) => hipotesesAprovadasRelevantes(lista, filtro).map((item) => item.id);

	it("sem matéria, só as globais aprovadas, por confiança e recência", () => {
		expect(ids({})).toEqual(["global-alta-nova", "global-alta-velha", "global-media", "vencida"]);
	});

	it("com a matéria, as globais, as da matéria e as de conceito que tenham algum dos conceitos pedidos", () => {
		expect(ids({ materia: "calc", conceitos: ["limites"] })).toEqual(["global-alta-nova", "global-alta-velha", "conceito-limites", "global-media", "vencida", "materia-calc"]);
		expect(ids({ materia: "calc", conceitos: ["series", "continuidade"] })).toEqual(expect.arrayContaining(["conceito-series", "conceito-limites"]));
		expect(ids({ materia: "calc" })).not.toContain("conceito-limites");
		expect(ids({ materia: "calc" })).toContain("materia-calc");
		expect(ids({ materia: "calc", conceitos: ["limites"] })).not.toContain("conceito-fis");
		expect(ids({ materia: "fis", conceitos: ["limites"] })).toContain("conceito-fis");
		expect(ids({ materia: "fis" })).not.toContain("materia-calc");
	});

	it("com o agora, as de validade vencida (ainda não marcadas) ficam de fora; o limite corta", () => {
		expect(ids({ agora: AGORA })).not.toContain("vencida");
		expect(ids({ agora: AGORA, limite: 2 })).toEqual(["global-alta-nova", "global-alta-velha"]);
		expect(ids({ limite: 0 })).toEqual([]);
	});
});

describe("lerArquivoHipoteses", () => {
	it("o que não é arquivo vira vazio com aviso, sem lançar", () => {
		for (const lixo of [null, undefined, 42, "texto", [], true]) {
			const { arquivo: lido, avisos } = lerArquivoHipoteses(lixo);
			expect(lido).toEqual(arquivoVazio());
			expect(avisos).toHaveLength(1);
		}
	});

	it("versão desconhecida vira vazio com aviso", () => {
		const { arquivo: lido, avisos } = lerArquivoHipoteses({ versao: 99, hipoteses: [hipotese()], mudancas: [] });
		expect(lido).toEqual({ versao: VERSAO_HIPOTESES, hipoteses: [], mudancas: [] });
		expect(avisos[0]).toMatch(/versão desconhecida/);
		expect(lerArquivoHipoteses({ hipoteses: [] }).avisos).toHaveLength(1);
	});

	it("o arquivo bom volta igual e sem aviso (com a última reflexão)", () => {
		const completo: ArquivoHipoteses = {
			versao: VERSAO_HIPOTESES,
			hipoteses: [hipotese({ anteriores: [{ versao: 1, enunciado: "antes", status: "proposta", ts: "2026-10-02T00:00:00.000Z" }], versao: 2 }), propostaH({ id: "h-2", enunciado: "Erra o sinal ao mover termos de lado", escopo: { nivel: "global" } })],
			mudancas: [mudanca()],
			ultimaReflexao: { id: "r-1", ts: "2026-11-01T00:00:00.000Z", motivo: "modulo", ultimoEvento: "e8", lidos: 8, propostas: 3, aceitas: 2, descartadas: [{ motivo: "enunciado_generico", quantas: 1 }], custo: 0.02 },
		};
		const { arquivo: lido, avisos } = lerArquivoHipoteses(JSON.parse(JSON.stringify(completo)));
		expect(avisos).toEqual([]);
		expect(lido).toEqual(completo);
	});

	it("descarta com aviso a hipótese sem os campos essenciais, o id repetido e a mudança estragada; o resto fica", () => {
		const { arquivo: lido, avisos } = lerArquivoHipoteses({
			versao: VERSAO_HIPOTESES,
			hipoteses: [
				hipotese({ id: "h-ok" }),
				{ id: "h-sem-tipo", escopo: { nivel: "global" }, enunciado: "Algo escrito aqui", status: "proposta", criadaEm: "2026-10-01T00:00:00.000Z" },
				{ ...hipotese({ id: "h-ok" }), enunciado: "repetida" },
				{ ...hipotese({ id: "h-escopo" }), escopo: { nivel: "conceito", materia: "calc", conceitos: [] } },
				{ ...hipotese({ id: "h-status" }), status: "talvez" },
				"texto solto",
				null,
			],
			mudancas: [mudanca({ id: "m-ok" }), { id: "m-sem-acao", hipotese: "h-ok", criadaEm: "x" }, mudanca({ id: "m-ok" }), 7],
		});
		expect(lido.hipoteses.map((item) => item.id)).toEqual(["h-ok"]);
		expect(lido.mudancas.map((item) => item.id)).toEqual(["m-ok"]);
		expect(avisos).toHaveLength(9);
	});

	it("completa os campos opcionais que faltam com os padrões", () => {
		const { arquivo: lido, avisos } = lerArquivoHipoteses({
			versao: VERSAO_HIPOTESES,
			hipoteses: [{ id: "h-min", tipo: "ritmo", escopo: { nivel: "materia", materia: "calc" }, enunciado: "Estuda melhor em blocos curtos", status: "aprovada", criadaEm: "2026-10-01T00:00:00.000Z" }],
			mudancas: [{ id: "m-min", hipotese: "h-min", acao: "expirar", criadaEm: "2026-10-02T00:00:00.000Z" }],
		});
		expect(avisos).toEqual([]);
		expect(lido.hipoteses[0]).toEqual({
			id: "h-min",
			tipo: "ritmo",
			escopo: { nivel: "materia", materia: "calc" },
			enunciado: "Estuda melhor em blocos curtos",
			aFavor: [],
			contra: [],
			confianca: "baixa",
			criadaEm: "2026-10-01T00:00:00.000Z",
			ultimaConfirmacao: "2026-10-01T00:00:00.000Z",
			validade: "2026-11-30T00:00:00.000Z",
			status: "aprovada",
			aprovadaPeloUsuario: true,
			versao: 1,
			anteriores: [],
		});
		expect(lido.mudancas[0]).toEqual({ id: "m-min", hipotese: "h-min", acao: "expirar", evidencias: [], motivo: "", reflexao: "", criadaEm: "2026-10-02T00:00:00.000Z" });
	});

	it("listas com lixo dentro viram listas de textos; a última reflexão inválida é descartada com aviso", () => {
		const { arquivo: lido, avisos } = lerArquivoHipoteses({
			versao: VERSAO_HIPOTESES,
			hipoteses: [{ ...hipotese(), aFavor: ["e1", 3], contra: "e2", anteriores: [{ versao: 1 }, { versao: 1, enunciado: "a", status: "proposta", ts: "t" }] }],
			mudancas: "não é lista",
			ultimaReflexao: { id: "r-1" },
		});
		expect(lido.hipoteses[0]!.aFavor).toEqual([]);
		expect(lido.hipoteses[0]!.contra).toEqual([]);
		expect(lido.hipoteses[0]!.anteriores).toHaveLength(1);
		expect(lido.mudancas).toEqual([]);
		expect(lido.ultimaReflexao).toBeUndefined();
		expect(avisos).toHaveLength(3);
	});
});

describe("confiancaDe e o que o Breno disse de si", () => {
	it("a autoavaliação (autoavaliou_conceito) não conta como evidência na confiança", () => {
		const eventos = indexarEventos([
			evento("e1", "s1", "2026-11-01T10:00:00.000Z"),
			evento("e2", "s2", "2026-11-02T10:00:00.000Z"),
			evento("e3", "s3", "2026-11-03T10:00:00.000Z"),
			evento("d1", "s1", "2026-11-01T09:00:00.000Z", "autoavaliou_conceito"),
			evento("d2", "s2", "2026-11-02T09:00:00.000Z", "autoavaliou_conceito"),
		]);
		// 3 respostas em 3 sessões = média; as duas autoavaliações a mais não a levariam a alta (5 eventos em 3 sessões).
		expect(confiancaDe(["e1", "e2", "e3", "d1", "d2"], eventos)).toBe("media");
		expect(confiancaDe(["e1", "d1", "d2"], eventos)).toBe("baixa");
	});
});
