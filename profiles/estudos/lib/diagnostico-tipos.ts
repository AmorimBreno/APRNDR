// Tipos e regras do diagnóstico do guia de cursos (item 5, parte B,
// docs/cursos.md, "Parte B: o diagnóstico") sem nada do Node: a tela
// (profiles/estudos/paineis) importa daqui, e a extensão de cursos aplica as
// mesmas funções antes de gravar; diagnostico.ts reexporta. O diagnóstico em
// andamento fica no curso.json, em diagnosticoEmAndamento; concluído, vira a
// etapa diagnostico (curso-tipos.ts).
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam. Quem escolhe os conceitos, confere o que o
// modelo devolveu, corrige a alternativa e soma a nota da dissertativa é o
// código, não o modelo.

import type { Curso, TipoCurso } from "./curso-tipos.ts";
import { ErroCurso, faltaCorrigir, faltaResponder, podeConcluir } from "./curso-tipos.ts";
import type { Prioridade } from "./mapa-tipos.ts";

export { faltaCorrigir, faltaResponder, podeConcluir };

// --- Níveis e confiança --------------------------------------------------------

/** A autoavaliação de um conceito: 0 = nunca vi, 1 = já ouvi falar, 2 = sei explicar, 3 = sei aplicar. */
export const NIVEIS = [0, 1, 2, 3] as const;
export type NivelAutoavaliacao = (typeof NIVEIS)[number];

export const NOMES_NIVEL: Record<NivelAutoavaliacao, string> = {
	0: "Nunca vi",
	1: "Já ouvi falar",
	2: "Sei explicar",
	3: "Sei aplicar",
};

/** A confiança marcada antes de responder: 1 = chute, 2 = pouca, 3 = boa, 4 = certeza. */
export const CONFIANCAS = [1, 2, 3, 4] as const;
export type Confianca = (typeof CONFIANCAS)[number];

export const NOMES_CONFIANCA: Record<Confianca, string> = {
	1: "Chute",
	2: "Pouca",
	3: "Boa",
	4: "Certeza",
};

export const ehNivel = (valor: unknown): valor is NivelAutoavaliacao => (NIVEIS as readonly unknown[]).includes(valor);
export const ehConfianca = (valor: unknown): valor is Confianca => (CONFIANCAS as readonly unknown[]).includes(valor);

// --- Limites da escolha e das questões -----------------------------------------

/** Até quantos conceitos do curso entram nas questões. */
export const MAXIMO_CONCEITOS = 8;
/** Até quantas questões de alternativa (uma por conceito escolhido). */
export const MAXIMO_ALTERNATIVAS = 6;
/** Quantas opções uma questão de alternativa pode ter. */
export const OPCOES_MINIMAS = 3;
export const OPCOES_MAXIMAS = 5;
/** Quantos critérios a rubrica de uma dissertativa pode ter. */
export const CRITERIOS_MINIMOS = 3;
export const CRITERIOS_MAXIMOS = 5;

// --- Formato (curso.json) ------------------------------------------------------

/** Uma opção de uma questão de alternativa: a correta leva correta: true; cada errada, a confusão que ela representa (8.5). */
export interface AlternativaDaQuestao {
	texto: string;
	correta?: true;
	confusao?: string;
}

export interface QuestaoAlternativa {
	/** q1, q2… (dado pelo código, na ordem das questões). */
	id: string;
	tipo: "alternativa";
	/** Os ids dos conceitos do curso que a questão cobre. */
	conceitos: string[];
	/** O cenário da questão, em markdown: os dados, o código, os vetores. Falta nas questões antigas (e nas que não precisam). */
	contexto?: string;
	/** A pergunta direta, numa frase (nas questões antigas, sem contexto, pode trazer o cenário junto). */
	enunciado: string;
	/** Na ordem de exibição (o modelo já embaralha); exatamente uma correta. */
	alternativas: AlternativaDaQuestao[];
	explicacao: string;
}

export interface CriterioRubrica {
	criterio: string;
	descricao: string;
	/** Maior que zero. */
	pontos: number;
}

export interface QuestaoDissertativa {
	id: string;
	tipo: "dissertativa";
	conceitos: string[];
	/** Como em QuestaoAlternativa. */
	contexto?: string;
	enunciado: string;
	/** De 3 a 5 critérios. */
	rubrica: CriterioRubrica[];
	respostaModelo: string;
}

export type Questao = QuestaoAlternativa | QuestaoDissertativa;

/** A nota de um critério da rubrica: os trechos da resposta que o modelo extraiu, os pontos (de 0 a max) e o porquê. */
export interface CriterioCorrigido {
	criterio: string;
	trechos: string[];
	pontos: number;
	max: number;
	justificativa: string;
}

/** A correção de uma dissertativa: um critério por item da rubrica, na ordem; total e max somados pelo código. */
export interface Correcao {
	criterios: CriterioCorrigido[];
	total: number;
	max: number;
	/** provedor/id do modelo corretor. */
	modelo: string;
	/** US$ da correção. */
	custo: number;
}

export interface RespostaAlternativa {
	confianca: Confianca;
	/** O índice da alternativa escolhida. */
	escolha: number;
	/** Corrigida pelo código: a escolhida é a correta. */
	correta: boolean;
	/** A confusão da alternativa errada escolhida. Só aparece quando a resposta está errada. */
	confusao?: string;
	/** Do momento em que a questão apareceu até a resposta. */
	tempoMs: number;
	/** ISO 8601. */
	respondidaEm: string;
}

export interface RespostaDissertativa {
	confianca: Confianca;
	texto: string;
	tempoMs: number;
	respondidaEm: string;
	/** Chega depois da resposta (a extensão corrige em seguida). */
	correcao?: Correcao;
}

export type Resposta = RespostaAlternativa | RespostaDissertativa;

/** O diagnóstico enquanto não termina (Curso.diagnosticoEmAndamento). */
export interface DiagnosticoEmAndamento {
	/** Um nível por conceito do curso já avaliado. */
	autoavaliacao: Record<string, NivelAutoavaliacao>;
	/** Vazia até gerar as questões. */
	questoes: Questao[];
	/** ISO 8601 da geração das questões; com geradoEm, modelo e custo também aparecem. */
	geradoEm?: string;
	/** provedor/id do modelo que gerou as questões. */
	modelo?: string;
	/** US$ da geração. */
	custo?: number;
	/** Por id de questão. */
	respostas: Record<string, Resposta>;
}

/** O diagnóstico concluído: a etapa diagnostico do curso. */
export interface Diagnostico extends DiagnosticoEmAndamento {
	geradoEm: string;
	modelo: string;
	custo: number;
	/** ISO 8601. */
	concluidoEm: string;
}

// --- O que os modelos devolvem -------------------------------------------------

/** O que o modelo das questões (prompts/diagnostico.md) devolve. */
export interface ResultadoGerador {
	questoes: Array<{
		tipo: "alternativa" | "dissertativa";
		conceitos: string[];
		/** Opcional: o cenário, os dados e o código, em markdown. */
		contexto?: string;
		/** Só a pergunta. */
		enunciado: string;
		/** Na alternativa. */
		alternativas?: Array<{ texto: string; correta?: boolean; confusao?: string }>;
		explicacao?: string;
		/** Na dissertativa. */
		rubrica?: Array<{ criterio: string; descricao?: string; pontos: number }>;
		respostaModelo?: string;
	}>;
}

/** O que o modelo corretor (prompts/corretor.md) devolve: um item por critério da rubrica, na ordem. */
export interface ResultadoCorretor {
	criterios: Array<{ criterio: string; trechos: string[]; pontos: number; justificativa: string }>;
}

// --- Funções -------------------------------------------------------------------

/** Um ErroCurso (a extensão mostra a frase como está), com o nome próprio do diagnóstico. */
export class ErroDiagnostico extends ErroCurso {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroDiagnostico";
	}
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));
const textoLimpo = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
/** Duas casas, para a soma de pontos fracionários não virar 2.9999999. */
const arredondar = (numero: number) => Math.round(numero * 100) / 100;

/**
 * Confere a autoavaliação que a tela manda: um nível de 0 a 3 por conceito,
 * só conceitos do curso (um id de fora é erro). Pode ser parcial (um conceito
 * sem nível ainda não foi avaliado). Devolve os níveis na ordem do curso.
 */
export function validarAutoavaliacao(niveis: unknown, conceitosDoCurso: readonly string[]): Record<string, NivelAutoavaliacao> {
	if (!ehObjeto(niveis)) throw new ErroDiagnostico("A autoavaliação precisa de um nível por conceito.");
	const doCurso = new Set(conceitosDoCurso);
	const fora = Object.keys(niveis).filter((id) => !doCurso.has(id));
	if (fora.length > 0) throw new ErroDiagnostico(`${fora.length === 1 ? "Este conceito não é" : "Estes conceitos não são"} do curso: ${fora.join(", ")}.`);
	const invalidos = Object.keys(niveis).filter((id) => !ehNivel(niveis[id]));
	if (invalidos.length > 0) {
		throw new ErroDiagnostico(`O nível precisa ser de 0 a 3 (veio ${invalidos.map((id) => `"${mostrar(niveis[id])}" em ${id}`).join(", ")}).`);
	}
	const saida: Record<string, NivelAutoavaliacao> = {};
	for (const id of conceitosDoCurso) if (niveis[id] !== undefined) saida[id] = niveis[id] as NivelAutoavaliacao;
	return saida;
}

/** Se todo conceito do Mapa do curso tem nível no diagnóstico em andamento. Sem Mapa (ou sem conceitos), false. */
export function autoavaliacaoCompleta(curso: Pick<Curso, "mapa"> & Partial<Pick<Curso, "diagnosticoEmAndamento">>): boolean {
	const conceitos = curso.mapa?.conceitos ?? [];
	const autoavaliacao = curso.diagnosticoEmAndamento?.autoavaliacao ?? {};
	return conceitos.length > 0 && conceitos.every((id) => ehNivel(autoavaliacao[id]));
}

/** Um conceito do curso para a escolha: o id e a prioridade no mapa da matéria. */
export interface ConceitoParaEscolha {
	id: string;
	prioridade: Prioridade;
}

/** Os conceitos de cada questão: um por alternativa e um por dissertativa, na ordem do curso. */
export interface ConceitosEscolhidos {
	alternativas: string[];
	dissertativas: string[];
}

/**
 * Escolhe os conceitos das questões (docs/cursos.md, "Quais conceitos entram
 * nas questões"). Determinística: a mesma entrada dá a mesma saída.
 *
 * - Dissertativas: 1; 2 no tipo teórico com pelo menos 4 conceitos.
 * - Entram até 8 conceitos, e nunca mais do que 6 alternativas mais as
 *   dissertativas (todo conceito escolhido ganha pelo menos uma questão).
 * - A ordem de escolha: primeiro os de prioridade alta (na ordem do curso);
 *   depois os outros, alternando entre os níveis da autoavaliação (uma
 *   rodada pega um de cada nível, de 3 a 0; dentro de um nível, normal antes
 *   de baixa e depois a ordem do curso). Sem nível conta como 0.
 * - Pelo menos 2 de nível 2 ou 3 quando houver (1 se o curso só tem 1, ou se
 *   só 1 conceito entra): os que faltam entram no lugar dos últimos escolhidos
 *   de nível 0 ou 1, mesmo que sejam de prioridade alta.
 * - Cada dissertativa vai para um dos escolhidos de maior nível (é onde
 *   "sei explicar" se confere). Se entram mais de 6, os que passam de 6 ficam
 *   só com a dissertativa; os outros ficam com uma alternativa cada, e a
 *   dissertativa pode cair num conceito que também tem alternativa.
 */
export function escolherConceitos(
	conceitosDoCurso: readonly ConceitoParaEscolha[],
	autoavaliacao: Readonly<Record<string, NivelAutoavaliacao>>,
	tipo: TipoCurso,
): ConceitosEscolhidos {
	const vistos = new Set<string>();
	const unicos = conceitosDoCurso.filter((conceito) => !vistos.has(conceito.id) && vistos.add(conceito.id));
	const posicao = new Map(unicos.map((conceito, indice) => [conceito.id, indice]));
	const naOrdemDoCurso = (ids: string[]) => [...ids].sort((a, b) => posicao.get(a)! - posicao.get(b)!);
	const nivelDe = (id: string): number => (ehNivel(autoavaliacao[id]) ? autoavaliacao[id]! : 0);
	const alto = (id: string) => nivelDe(id) >= 2;

	const dissertativas = tipo === "teorico" && unicos.length >= 4 ? 2 : 1;
	const quantos = Math.min(MAXIMO_CONCEITOS, unicos.length, MAXIMO_ALTERNATIVAS + dissertativas);
	if (quantos === 0) return { alternativas: [], dissertativas: [] };

	const altas = unicos.filter((conceito) => conceito.prioridade === "alta").map((conceito) => conceito.id);
	const pesoPrioridade = (conceito: ConceitoParaEscolha) => (conceito.prioridade === "baixa" ? 1 : 0);
	const resto = unicos.filter((conceito) => conceito.prioridade !== "alta");
	// sort é estável: dentro do mesmo nível e da mesma prioridade, fica a ordem do curso.
	const grupos = [3, 2, 1, 0].map((nivel) =>
		resto
			.filter((conceito) => nivelDe(conceito.id) === nivel)
			.sort((a, b) => pesoPrioridade(a) - pesoPrioridade(b))
			.map((conceito) => conceito.id),
	);
	const alternados: string[] = [];
	for (let rodada = 0; alternados.length < resto.length; rodada++) {
		for (const grupo of grupos) if (grupo[rodada] !== undefined) alternados.push(grupo[rodada]!);
	}
	const candidatos = [...altas, ...alternados];
	const escolhidos = candidatos.slice(0, quantos);

	const minimoAltos = Math.min(2, candidatos.filter(alto).length, quantos);
	const altosDeFora = candidatos.slice(quantos).filter(alto);
	while (escolhidos.filter(alto).length < minimoAltos && altosDeFora.length > 0) {
		const trocado = escolhidos.findLastIndex((id) => !alto(id));
		if (trocado < 0) break;
		escolhidos[trocado] = altosDeFora.shift()!;
	}

	// Para as dissertativas: maior nível primeiro; no empate, a ordem de escolha.
	const preferidos = [...escolhidos].sort((a, b) => nivelDe(b) - nivelDe(a));
	const soDissertativa = preferidos.slice(0, Math.max(0, escolhidos.length - MAXIMO_ALTERNATIVAS));
	const comAlternativa = escolhidos.filter((id) => !soDissertativa.includes(id));
	const dissertativasTambem = preferidos.filter((id) => !soDissertativa.includes(id)).slice(0, dissertativas - soDissertativa.length);
	return { alternativas: naOrdemDoCurso(comAlternativa), dissertativas: naOrdemDoCurso([...soDissertativa, ...dissertativasTambem]) };
}

export type QuestaoSemId = Omit<QuestaoAlternativa, "id"> | Omit<QuestaoDissertativa, "id">;

/** Lê uma questão do modelo: a questão limpa, ou o motivo do descarte. As questões dos módulos (modulo-tipos.ts) usam a mesma leitura. */
export function lerQuestao(item: unknown, permitidos: ReadonlySet<string>): { questao: QuestaoSemId } | { motivo: string } {
	if (!ehObjeto(item)) return { motivo: "não é um objeto" };
	if (item.tipo !== "alternativa" && item.tipo !== "dissertativa") return { motivo: `tipo desconhecido ("${mostrar(item.tipo)}")` };
	const enunciado = textoLimpo(item.enunciado);
	if (!enunciado) return { motivo: "enunciado vazio" };
	if (!Array.isArray(item.conceitos) || !item.conceitos.every((id) => typeof id === "string")) return { motivo: "sem a lista de conceitos" };
	const conceitos = [...new Set((item.conceitos as string[]).map((id) => id.trim()).filter(Boolean))];
	if (conceitos.length === 0) return { motivo: "sem conceitos" };
	const fora = conceitos.filter((id) => !permitidos.has(id));
	if (fora.length > 0) return { motivo: `cita conceito fora dos pedidos (${fora.join(", ")})` };
	// O contexto é opcional: vazio (ou que não é texto) some, para a questão ficar só com a pergunta.
	const contexto = textoLimpo(item.contexto);
	const comContexto = contexto ? { contexto } : {};

	if (item.tipo === "alternativa") {
		const lista = item.alternativas;
		if (!Array.isArray(lista) || lista.length < OPCOES_MINIMAS || lista.length > OPCOES_MAXIMAS) {
			return { motivo: `precisa de ${OPCOES_MINIMAS} a ${OPCOES_MAXIMAS} alternativas (veio ${Array.isArray(lista) ? lista.length : "nenhuma lista"})` };
		}
		const alternativas: AlternativaDaQuestao[] = [];
		let corretas = 0;
		for (const [indice, opcao] of lista.entries()) {
			const texto = ehObjeto(opcao) ? textoLimpo(opcao.texto) : "";
			if (!texto) return { motivo: `a alternativa ${indice + 1} está sem texto` };
			if (ehObjeto(opcao) && opcao.correta === true) {
				corretas++;
				alternativas.push({ texto, correta: true });
				continue;
			}
			const confusao = ehObjeto(opcao) ? textoLimpo(opcao.confusao) : "";
			if (!confusao) return { motivo: `a alternativa errada ${indice + 1} está sem a confusão que representa` };
			alternativas.push({ texto, confusao });
		}
		if (corretas !== 1) return { motivo: corretas === 0 ? "nenhuma alternativa correta" : `${corretas} alternativas corretas (precisa de exatamente uma)` };
		return { questao: { tipo: "alternativa", conceitos, ...comContexto, enunciado, alternativas, explicacao: textoLimpo(item.explicacao) } };
	}

	const lista = item.rubrica;
	if (!Array.isArray(lista) || lista.length < CRITERIOS_MINIMOS || lista.length > CRITERIOS_MAXIMOS) {
		return { motivo: `a rubrica precisa de ${CRITERIOS_MINIMOS} a ${CRITERIOS_MAXIMOS} critérios (veio ${Array.isArray(lista) ? lista.length : "nenhuma lista"})` };
	}
	const rubrica: CriterioRubrica[] = [];
	for (const [indice, entrada] of lista.entries()) {
		const criterio = ehObjeto(entrada) ? textoLimpo(entrada.criterio) : "";
		if (!criterio) return { motivo: `o critério ${indice + 1} da rubrica está sem nome` };
		const pontos = ehObjeto(entrada) ? entrada.pontos : undefined;
		if (typeof pontos !== "number" || !Number.isFinite(pontos) || pontos <= 0) {
			return { motivo: `o critério "${criterio}" precisa de pontos maiores que zero (veio "${mostrar(pontos)}")` };
		}
		rubrica.push({ criterio, descricao: textoLimpo((entrada as Record<string, unknown>).descricao), pontos });
	}
	return { questao: { tipo: "dissertativa", conceitos, ...comContexto, enunciado, rubrica, respostaModelo: textoLimpo(item.respostaModelo) } };
}

/**
 * Confere as questões que o modelo devolveu (ResultadoGerador) contra os
 * conceitos pedidos (escolherConceitos) e devolve as questões na ordem: uma
 * alternativa por conceito de `alternativas` e uma dissertativa por conceito
 * de `dissertativas`, nessa ordem, com ids q1, q2… dados aqui.
 *
 * Uma questão vale com: enunciado; conceitos, todos entre os pedidos; o
 * contexto é opcional (aparado; vazio, sai); na
 * alternativa, de 3 a 5 opções com texto, exatamente uma correta e toda
 * errada com a confusão; na dissertativa, rubrica de 3 a 5 critérios com nome
 * e pontos maiores que zero. Para cada conceito pedido vai a primeira questão
 * do tipo que vale e o cobre (a que o tem como primeiro conceito antes); o
 * resto é descartado. Se faltar questão para algum conceito pedido,
 * ErroDiagnostico com os conceitos sem questão e o motivo de cada descarte.
 */
export function validarQuestoes(resultado: unknown, pedidos: ConceitosEscolhidos): Questao[] {
	if (!ehObjeto(resultado) || !Array.isArray(resultado.questoes)) throw new ErroDiagnostico('O modelo não devolveu a lista de questões (falta "questoes").');
	const permitidos = new Set([...pedidos.alternativas, ...pedidos.dissertativas]);
	const validas: QuestaoSemId[] = [];
	const descartes: string[] = [];
	for (const [indice, item] of resultado.questoes.entries()) {
		const lida = lerQuestao(item, permitidos);
		if ("motivo" in lida) descartes.push(`questão ${indice + 1}: ${lida.motivo}`);
		else validas.push(lida.questao);
	}
	const usadas = new Set<number>();
	const pegar = (tipo: Questao["tipo"], conceito: string): QuestaoSemId | undefined => {
		const livre = (questao: QuestaoSemId, indice: number) => !usadas.has(indice) && questao.tipo === tipo;
		let achada = validas.findIndex((questao, indice) => livre(questao, indice) && questao.conceitos[0] === conceito);
		if (achada < 0) achada = validas.findIndex((questao, indice) => livre(questao, indice) && questao.conceitos.includes(conceito));
		if (achada < 0) return undefined;
		usadas.add(achada);
		return validas[achada];
	};
	const escolhidas: QuestaoSemId[] = [];
	const faltando: string[] = [];
	for (const [tipo, conceitos] of [["alternativa", pedidos.alternativas], ["dissertativa", pedidos.dissertativas]] as const) {
		for (const conceito of conceitos) {
			const questao = pegar(tipo, conceito);
			if (questao) escolhidas.push(questao);
			else faltando.push(`${tipo} de ${conceito}`);
		}
	}
	if (faltando.length > 0) {
		const motivos = descartes.length > 0 ? ` Descartadas: ${descartes.join("; ")}.` : "";
		throw new ErroDiagnostico(`O modelo não devolveu questão válida para: ${faltando.join(", ")}.${motivos}`);
	}
	return escolhidas.map((questao, indice) => ({ id: `q${indice + 1}`, ...structuredClone(questao) }) as Questao);
}

/**
 * Confere a correção que o modelo devolveu (ResultadoCorretor) para a
 * dissertativa: um item por critério da rubrica (pelo nome, se todos os nomes
 * batem uma vez; senão pela ordem, e aí a quantidade tem que ser a mesma),
 * pontos de 0 ao máximo do critério. O nome e o máximo de cada critério vêm
 * da rubrica; o total e o max são somados aqui, não pelo modelo. Trechos e
 * justificativa ausentes viram vazios. Problema, ErroDiagnostico.
 */
export function validarCorrecao(resultado: unknown, questao: QuestaoDissertativa, origem: { modelo: string; custo: number }): Correcao {
	if (!ehObjeto(resultado) || !Array.isArray(resultado.criterios)) throw new ErroDiagnostico('A correção não trouxe a lista de critérios (falta "criterios").');
	const itens = resultado.criterios as unknown[];
	const nomes = itens.map((item) => (ehObjeto(item) ? textoLimpo(item.criterio) : ""));
	const pelosNomes = questao.rubrica.every((item) => nomes.filter((nome) => nome === item.criterio.trim()).length === 1);
	if (!pelosNomes && itens.length !== questao.rubrica.length) {
		throw new ErroDiagnostico(`A correção trouxe ${itens.length} critério${itens.length === 1 ? "" : "s"}, e a rubrica tem ${questao.rubrica.length}.`);
	}
	const criterios = questao.rubrica.map((item, indice): CriterioCorrigido => {
		const corrigido = pelosNomes ? itens[nomes.indexOf(item.criterio.trim())] : itens[indice];
		if (!ehObjeto(corrigido)) throw new ErroDiagnostico(`A correção do critério "${item.criterio}" não é um objeto.`);
		const pontos = corrigido.pontos;
		if (typeof pontos !== "number" || !Number.isFinite(pontos) || pontos < 0 || pontos > item.pontos) {
			throw new ErroDiagnostico(`O critério "${item.criterio}" veio com "${mostrar(pontos)}" pontos; precisa ser de 0 a ${item.pontos}.`);
		}
		const trechos = Array.isArray(corrigido.trechos) ? corrigido.trechos.map(textoLimpo).filter(Boolean) : [];
		return { criterio: item.criterio, trechos, pontos, max: item.pontos, justificativa: textoLimpo(corrigido.justificativa) };
	});
	return {
		criterios,
		total: arredondar(criterios.reduce((soma, item) => soma + item.pontos, 0)),
		max: arredondar(criterios.reduce((soma, item) => soma + item.max, 0)),
		modelo: origem.modelo,
		custo: origem.custo,
	};
}

/** O que a tela manda ao responder (a ação responder, sem materia, curso e pedido). */
export interface EntradaResposta {
	confianca: Confianca;
	/** Na alternativa: o índice da escolhida. */
	escolha?: number;
	/** Na dissertativa. */
	texto?: string;
	tempoMs: number;
}

/**
 * Grava a resposta de uma questão e devolve o diagnóstico novo. Confere a
 * confiança (1 a 4), o tempo (número não negativo, arredondado) e, na
 * alternativa, a escolha (um índice das alternativas) ou, na dissertativa, o
 * texto (não vazio). A alternativa é corrigida aqui: correta = a escolhida é
 * a correta; errada, guarda a confusão da escolhida. Questão que não existe
 * ou já respondida, ErroDiagnostico.
 */
export function aplicarResposta(emAndamento: DiagnosticoEmAndamento, questaoId: string, entrada: unknown, agora: Date = new Date()): DiagnosticoEmAndamento {
	const questao = emAndamento.questoes.find((item) => item.id === questaoId);
	if (!questao) throw new ErroDiagnostico(`Não achei a questão "${mostrar(questaoId)}" no diagnóstico.`);
	if (emAndamento.respostas[questao.id] !== undefined) throw new ErroDiagnostico(`A questão ${questao.id} já foi respondida.`);
	if (!ehObjeto(entrada)) throw new ErroDiagnostico("A resposta veio vazia.");
	const { confianca, tempoMs } = entrada;
	if (!ehConfianca(confianca)) throw new ErroDiagnostico(`Marque a confiança, de 1 a 4, antes de responder (veio "${mostrar(confianca)}").`);
	if (typeof tempoMs !== "number" || !Number.isFinite(tempoMs) || tempoMs < 0) throw new ErroDiagnostico(`O tempo da resposta precisa ser um número de milissegundos (veio "${mostrar(tempoMs)}").`);
	const respondidaEm = agora.toISOString();
	let resposta: Resposta;
	if (questao.tipo === "alternativa") {
		const escolha = entrada.escolha;
		if (typeof escolha !== "number" || !Number.isInteger(escolha) || escolha < 0 || escolha >= questao.alternativas.length) {
			throw new ErroDiagnostico(`Escolha uma das alternativas da questão ${questao.id} (veio "${mostrar(escolha)}").`);
		}
		const escolhida = questao.alternativas[escolha]!;
		const correta = escolhida.correta === true;
		resposta = { confianca, escolha, correta, ...(!correta && escolhida.confusao ? { confusao: escolhida.confusao } : {}), tempoMs: Math.round(tempoMs), respondidaEm };
	} else {
		const texto = textoLimpo(entrada.texto);
		if (!texto) throw new ErroDiagnostico(`Escreva a resposta da questão ${questao.id}.`);
		resposta = { confianca, texto, tempoMs: Math.round(tempoMs), respondidaEm };
	}
	const novo = structuredClone(emAndamento);
	novo.respostas[questao.id] = resposta;
	return novo;
}

/** Junta a correção (validarCorrecao) à resposta da dissertativa. Questão que não é dissertativa, sem resposta ou já corrigida, ErroDiagnostico. */
export function aplicarCorrecao(emAndamento: DiagnosticoEmAndamento, questaoId: string, correcao: Correcao): DiagnosticoEmAndamento {
	const questao = emAndamento.questoes.find((item) => item.id === questaoId);
	if (!questao || questao.tipo !== "dissertativa") throw new ErroDiagnostico(`Não achei a dissertativa "${mostrar(questaoId)}" no diagnóstico.`);
	const resposta = emAndamento.respostas[questao.id] as RespostaDissertativa | undefined;
	if (!resposta) throw new ErroDiagnostico(`A questão ${questao.id} ainda não foi respondida.`);
	if (resposta.correcao) throw new ErroDiagnostico(`A questão ${questao.id} já foi corrigida.`);
	const novo = structuredClone(emAndamento);
	(novo.respostas[questao.id] as RespostaDissertativa).correcao = structuredClone(correcao);
	return novo;
}

// --- Resumo e calibração ---------------------------------------------------------

/** certa: alternativa certa ou dissertativa com a nota toda; errada: alternativa errada ou dissertativa com zero; parcial: o resto. */
export type ResultadoQuestao = "certa" | "errada" | "parcial";

/** Como a autoavaliação de um conceito se compara com as respostas dele. */
export type Calibracao = "achou_que_sabia_mais" | "sabia_mais" | "bateu" | "sem_questoes" | "sem_autoavaliacao";

export interface ResumoConceito {
	id: string;
	/** null: sem autoavaliação. */
	nivel: NivelAutoavaliacao | null;
	/** As questões respondidas (e, na dissertativa, corrigidas) que cobrem o conceito, na ordem das questões. */
	questoes: Array<{ id: string; tipo: Questao["tipo"]; resultado: ResultadoQuestao; nota?: { total: number; max: number } }>;
	calibracao: Calibracao;
	/** A frase da calibração, para a tela. */
	frase: string;
}

export interface ResumoDiagnostico {
	/** Na ordem do curso. */
	conceitos: ResumoConceito[];
	total: {
		/** Alternativas certas. */
		acertos: number;
		/** Quantas alternativas o diagnóstico tem. */
		alternativas: number;
		/** Quantas dissertativas o diagnóstico tem. */
		dissertativas: number;
		/** A soma dos pontos das dissertativas corrigidas sobre a soma dos máximos (0 a 1, duas casas); null sem dissertativa corrigida. */
		nota: number | null;
	};
}

/**
 * Compara, por conceito, o que ele disse com o que acertou. O desempenho do
 * conceito é a média das questões dele (alternativa certa 1, errada 0;
 * dissertativa total/max). Nível 2 ou 3 com desempenho abaixo da metade:
 * achou que sabia mais; nível 0 ou 1 com metade ou mais: sabia mais do que
 * achou; o resto, bateu. Sem modelo estatístico (BKT e Brier são do item 9).
 */
function calibrar(nivel: NivelAutoavaliacao | null, desempenhos: number[]): { calibracao: Calibracao; frase: string } {
	if (nivel === null) return { calibracao: "sem_autoavaliacao", frase: "Sem autoavaliação." };
	const disse = `Disse "${NOMES_NIVEL[nivel]}"`;
	if (desempenhos.length === 0) return { calibracao: "sem_questoes", frase: `${disse}; nenhuma questão cobrou este conceito.` };
	const media = desempenhos.reduce((soma, valor) => soma + valor, 0) / desempenhos.length;
	const foiBem = media >= 0.5;
	if (nivel >= 2 && !foiBem) return { calibracao: "achou_que_sabia_mais", frase: `${disse} e foi mal nas questões: achou que sabia mais.` };
	if (nivel <= 1 && foiBem) return { calibracao: "sabia_mais", frase: `${disse} e foi bem nas questões: sabia mais do que achou.` };
	return { calibracao: "bateu", frase: `${disse} e foi ${foiBem ? "bem" : "mal"} nas questões: a autoavaliação bateu.` };
}

/**
 * O resumo do diagnóstico para a fase Resultado e o evento
 * concluiu_diagnostico: por conceito do curso (na ordem de
 * `conceitosDoCurso`), o nível, as questões e a calibração; e o total. Uma
 * questão sem resposta, ou uma dissertativa sem correção, fica de fora.
 */
export function resumoDoDiagnostico(emAndamento: DiagnosticoEmAndamento, conceitosDoCurso: readonly string[]): ResumoDiagnostico {
	const resultados = new Map<string, { item: ResumoConceito["questoes"][number]; desempenho: number }>();
	let acertos = 0;
	let pontos = 0;
	let maximo = 0;
	let corrigidas = 0;
	for (const questao of emAndamento.questoes) {
		const resposta = emAndamento.respostas[questao.id];
		if (!resposta) continue;
		if (questao.tipo === "alternativa") {
			const correta = (resposta as RespostaAlternativa).correta === true;
			if (correta) acertos++;
			resultados.set(questao.id, { item: { id: questao.id, tipo: "alternativa", resultado: correta ? "certa" : "errada" }, desempenho: correta ? 1 : 0 });
			continue;
		}
		const correcao = (resposta as RespostaDissertativa).correcao;
		if (!correcao) continue;
		corrigidas++;
		pontos += correcao.total;
		maximo += correcao.max;
		const resultado: ResultadoQuestao = correcao.total >= correcao.max ? "certa" : correcao.total <= 0 ? "errada" : "parcial";
		resultados.set(questao.id, {
			item: { id: questao.id, tipo: "dissertativa", resultado, nota: { total: correcao.total, max: correcao.max } },
			desempenho: correcao.max > 0 ? correcao.total / correcao.max : 0,
		});
	}
	const conceitos = conceitosDoCurso.map((id): ResumoConceito => {
		const valor = emAndamento.autoavaliacao[id];
		const nivel = ehNivel(valor) ? valor : null;
		const doConceito = emAndamento.questoes.filter((questao) => questao.conceitos.includes(id) && resultados.has(questao.id)).map((questao) => resultados.get(questao.id)!);
		return { id, nivel, questoes: doConceito.map((item) => item.item), ...calibrar(nivel, doConceito.map((item) => item.desempenho)) };
	});
	return {
		conceitos,
		total: {
			acertos,
			alternativas: emAndamento.questoes.filter((questao) => questao.tipo === "alternativa").length,
			dissertativas: emAndamento.questoes.filter((questao) => questao.tipo === "dissertativa").length,
			nota: corrigidas > 0 && maximo > 0 ? arredondar(pontos / maximo) : null,
		},
	};
}

// --- O que a tela vê ---------------------------------------------------------------

/** Uma questão como a tela pode ver: sem o gabarito enquanto alguma questão está sem resposta. */
export type QuestaoNaTela =
	| (Omit<QuestaoAlternativa, "explicacao"> & { explicacao?: string })
	| (Omit<QuestaoDissertativa, "rubrica" | "respostaModelo"> & { rubrica?: CriterioRubrica[]; respostaModelo?: string });

/** Uma resposta como a tela pode ver: sem correta, confusao e correcao enquanto alguma questão está sem resposta. */
export type RespostaNaTela =
	| (Omit<RespostaAlternativa, "correta"> & { correta?: boolean })
	| RespostaDissertativa;

export interface DiagnosticoNaTela extends Omit<DiagnosticoEmAndamento, "questoes" | "respostas"> {
	questoes: QuestaoNaTela[];
	respostas: Record<string, RespostaNaTela>;
}

/**
 * A cópia do diagnóstico em andamento que a tela pode ver (docs/cursos.md,
 * "Ponte"): enquanto alguma questão está sem resposta, sem correta e confusao
 * das alternativas, explicacao, respostaModelo e rubrica, e sem correta,
 * confusao e correcao das respostas (o pré-teste não mostra o gabarito). O
 * contexto da questão fica (é parte da pergunta, não do gabarito). Com
 * todas respondidas (ou sem questões ainda), a cópia inteira.
 */
export function paraATela(emAndamento: DiagnosticoEmAndamento): DiagnosticoNaTela {
	const copia = structuredClone(emAndamento) as DiagnosticoNaTela;
	if (faltaResponder(emAndamento).length === 0) return copia;
	copia.questoes = copia.questoes.map((questao): QuestaoNaTela => {
		if (questao.tipo === "alternativa") {
			const { explicacao: _explicacao, ...resto } = questao;
			return { ...resto, alternativas: resto.alternativas.map((alternativa) => ({ texto: alternativa.texto })) };
		}
		const { rubrica: _rubrica, respostaModelo: _respostaModelo, ...resto } = questao;
		return resto;
	});
	const respostas: Record<string, RespostaNaTela> = {};
	for (const [id, resposta] of Object.entries(copia.respostas)) {
		const { correta: _correta, confusao: _confusao, correcao: _correcao, ...resto } = resposta as Partial<RespostaAlternativa> & Partial<RespostaDissertativa>;
		respostas[id] = resto as RespostaNaTela;
	}
	copia.respostas = respostas;
	return copia;
}
