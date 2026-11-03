// O placar de um módulo concluído (docs/metodo-experimentos.md, "O placar"),
// sem nada do Node (a tela importa daqui): calculado pelo código a partir dos
// eventos do aprendiz, nunca pelo modelo, e o histórico dos módulos anteriores
// com a comparação do atual com a média deles. Tudo é derivado dos eventos e
// dos arquivos de módulo; nada daqui é gravado. Todas as funções são puras.

import { type AjusteUsado, eventosDoModulo, localDoEvento, referenciaDoAjuste } from "./metodo-ciclo-tipos.ts";
import type { Evento } from "./eventos.ts";
import { avaliacaoLida, ehNivelLicao, PERGUNTAS_LICAO, type PerguntaLicao } from "./modulo-feedback-tipos.ts";
import type { ModuloGerado } from "./modulo-tipos.ts";

/** Quantos módulos concluídos antes do atual entram no histórico. */
export const MAXIMO_NO_HISTORICO = 8;

/** A probabilidade que cada confiança (1 a 4) diz, para o Brier: 1 = 0,25, 2 = 0,5, 3 = 0,75 e 4 = 0,95. */
export const PROBABILIDADE_DA_CONFIANCA: Readonly<Record<number, number>> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 0.95 };

/** Quiz na 1ª tentativa: os acertos e o total de questões. `taxa` é null sem questões. */
export interface QuizDoPlacar {
	acertos: number;
	total: number;
	taxa: number | null;
}

/** Perguntas (verificações), a primeira resposta de cada: certa vale 1, em parte 0,5 e errada 0. */
export interface PerguntasDoPlacar {
	pontos: number;
	total: number;
	taxa: number | null;
}

/** Dissertativas na 1ª tentativa: a soma das notas, a soma dos máximos e quantas questões. */
export interface DissertativasDoPlacar {
	pontos: number;
	max: number;
	questoes: number;
	taxa: number | null;
}

/** "Não sabia": quantas questões, de quantas com resposta ou com "Não sabia". */
export interface NaoSabiaDoPlacar {
	quantos: number;
	questoes: number;
	taxa: number | null;
}

/** A média de uma nota do questionário (de 1 a 5) e quantas lições a deram. */
export interface NotaDoQuestionario {
	media: number | null;
	n: number;
}

/** O questionário do fim da lição: vale o último de cada lição. */
export interface QuestionarioDoPlacar {
	/** Quantas lições têm questionário. */
	licoes: number;
	entendimento: NotaDoQuestionario;
	clareza: NotaDoQuestionario;
	exemplos: NotaDoQuestionario;
	questoes: NotaDoQuestionario;
	ritmo: NotaDoQuestionario;
}

/** O feedback dos blocos: a última nota de cada bloco. */
export interface BlocosDoPlacar {
	ruim: number;
	bom: number;
	otimo: number;
	total: number;
}

/** Uma contagem em número absoluto e por lição (`porLicao` é null sem lições). */
export interface ContagemDoPlacar {
	total: number;
	porLicao: number | null;
}

/** A calibração: o Brier das respostas com confiança (quizzes na 1ª tentativa e perguntas). Menor é melhor; null sem amostra. */
export interface CalibracaoDoPlacar {
	brier: number | null;
	n: number;
}

/** O placar de um módulo. Cada número leva o `n` em que se baseia. */
export interface PlacarDoModulo {
	/** Quantas lições o módulo tem (o denominador do "por lição"). */
	licoes: number;
	quiz: QuizDoPlacar;
	perguntas: PerguntasDoPlacar;
	dissertativas: DissertativasDoPlacar;
	naoSabia: NaoSabiaDoPlacar;
	questionario: QuestionarioDoPlacar;
	blocos: BlocosDoPlacar;
	pedidosDeExplicacao: ContagemDoPlacar;
	termosGuardados: ContagemDoPlacar;
	calibracao: CalibracaoDoPlacar;
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** Arredonda a `casas` casas (os números do placar ficam estáveis no JSON). */
const arredondar = (valor: number, casas: number) => Math.round(valor * 10 ** casas) / 10 ** casas;

/** A razão, arredondada a 4 casas; null sem denominador. */
const razao = (parte: number, total: number) => (total > 0 ? arredondar(parte / total, 4) : null);

/** O primeiro evento de cada questão (o id vem de localDoEvento: objeto.questao ou objeto.bloco), na ordem dos eventos. */
function primeiroDeCada(eventos: readonly Evento[]): Evento[] {
	const vistos = new Set<string>();
	const saida: Evento[] = [];
	for (const evento of eventos) {
		const { bloco } = localDoEvento(evento);
		if (!bloco || vistos.has(bloco)) continue;
		vistos.add(bloco);
		saida.push(evento);
	}
	return saida;
}

/** O último evento de cada chave, na ordem em que a chave apareceu pela primeira vez. */
function ultimoDeCada(eventos: readonly Evento[], chave: (evento: Evento) => string | null): Evento[] {
	const porChave = new Map<string, Evento>();
	for (const evento of eventos) {
		const id = chave(evento);
		if (id) porChave.set(id, evento);
	}
	return [...porChave.values()];
}

const resultadoDe = (evento: Evento): Record<string, unknown> => (ehObjeto(evento.resultado) ? evento.resultado : {});
const confiancaValida = (valor: unknown): number | undefined => (typeof valor === "number" && valor in PROBABILIDADE_DA_CONFIANCA ? valor : undefined);

/**
 * O placar do módulo (docs/metodo-experimentos.md, "O placar") sobre os
 * eventos do aprendiz dele (quem chama filtra: eventosDoModulo). Uma taxa sem
 * amostra (n = 0) é null, nunca 0.
 * - Quiz: o respondeu_questao com tentativa 1, o primeiro de cada questão.
 * - Perguntas: o primeiro respondeu_verificacao de cada questão (certa 1, em parte 0,5, errada 0).
 * - Dissertativas: o respondeu_dissertativa com tentativa 1, o primeiro de cada questão (soma de total e de max).
 * - "Não sabia": as questões distintas com nao_sabia_questao, de todas as questões
 *   distintas com resposta (dos três tipos) ou com "Não sabia".
 * - Questionário: a média de cada nota do último avaliou_licao de cada lição.
 * - Feedback dos blocos: a última nota de cada bloco (avaliou_bloco; a antiga "melhorar" vale Ruim).
 * - Pedidos de explicação e termos guardados: o número de eventos e por lição.
 * - Calibração: o Brier de quizzes na 1ª tentativa e perguntas com confiança de 1 a 4.
 * `licoes` é quantas lições o módulo tem (o "por lição"); sem ele, as lições
 * distintas que aparecem nos eventos.
 */
export function placarDoModulo(eventos: readonly Evento[], licoes?: number): PlacarDoModulo {
	const doVerbo = (verbo: string) => eventos.filter((evento) => evento.verbo === verbo);
	const nLicoes = licoes ?? new Set(eventos.map((evento) => localDoEvento(evento).licao).filter((licao): licao is string => licao !== null)).size;

	// Quiz e perguntas, e o Brier.
	const respostas: Array<{ acerto: number; confianca: number | undefined }> = [];
	const quizzes = primeiroDeCada(doVerbo("respondeu_questao").filter((evento) => resultadoDe(evento).tentativa === 1));
	let acertosDoQuiz = 0;
	for (const evento of quizzes) {
		const resultado = resultadoDe(evento);
		const acerto = resultado.correta === true ? 1 : 0;
		acertosDoQuiz += acerto;
		respostas.push({ acerto, confianca: confiancaValida(resultado.confianca) });
	}
	const perguntas = primeiroDeCada(doVerbo("respondeu_verificacao"));
	let pontosDasPerguntas = 0;
	for (const evento of perguntas) {
		const resultado = resultadoDe(evento);
		const acerto = resultado.avaliacao === "certa" ? 1 : resultado.avaliacao === "parcial" ? 0.5 : 0;
		pontosDasPerguntas += acerto;
		respostas.push({ acerto, confianca: confiancaValida(resultado.confianca) });
	}
	const comConfianca = respostas.filter((resposta): resposta is { acerto: number; confianca: number } => resposta.confianca !== undefined);
	const soma = comConfianca.reduce((total, resposta) => total + (PROBABILIDADE_DA_CONFIANCA[resposta.confianca]! - resposta.acerto) ** 2, 0);

	// Dissertativas na 1ª tentativa.
	const dissertativas = primeiroDeCada(doVerbo("respondeu_dissertativa").filter((evento) => resultadoDe(evento).tentativa === 1));
	let pontos = 0;
	let max = 0;
	let corrigidas = 0;
	for (const evento of dissertativas) {
		const { total, max: maximo } = resultadoDe(evento);
		if (typeof total !== "number" || typeof maximo !== "number") continue;
		pontos += total;
		max += maximo;
		corrigidas++;
	}

	// "Não sabia".
	const idsDe = (lista: readonly Evento[]) => lista.map((evento) => localDoEvento(evento).bloco).filter((id): id is string => id !== null);
	const naoSabiam = new Set(idsDe(doVerbo("nao_sabia_questao")));
	const respondidas = new Set([...idsDe(doVerbo("respondeu_questao")), ...idsDe(doVerbo("respondeu_verificacao")), ...idsDe(doVerbo("respondeu_dissertativa")), ...naoSabiam]);

	// O questionário: o último de cada lição.
	const questionarios = ultimoDeCada(doVerbo("avaliou_licao"), (evento) => localDoEvento(evento).licao);
	const nota = (pergunta: PerguntaLicao): NotaDoQuestionario => {
		const dadas = questionarios.flatMap((evento) => {
			const notas = resultadoDe(evento).notas;
			const valor = ehObjeto(notas) ? notas[pergunta] : undefined;
			return ehNivelLicao(valor) ? [valor] : [];
		});
		return { media: dadas.length > 0 ? arredondar(dadas.reduce((total, valor) => total + valor, 0) / dadas.length, 2) : null, n: dadas.length };
	};
	const notas = Object.fromEntries(PERGUNTAS_LICAO.map(({ id }) => [id, nota(id)])) as Record<PerguntaLicao, NotaDoQuestionario>;

	// O feedback dos blocos: a última nota de cada bloco.
	const blocos: BlocosDoPlacar = { ruim: 0, bom: 0, otimo: 0, total: 0 };
	for (const evento of ultimoDeCada(doVerbo("avaliou_bloco"), (item) => localDoEvento(item).bloco)) {
		const avaliacao = avaliacaoLida(resultadoDe(evento).avaliacao);
		if (!avaliacao) continue;
		blocos[avaliacao]++;
		blocos.total++;
	}

	const porLicao = (total: number) => (nLicoes > 0 ? arredondar(total / nLicoes, 2) : null);
	const pedidos = doVerbo("pediu_explicacao").length;
	const termos = doVerbo("guardou_termo").length;
	return {
		licoes: nLicoes,
		quiz: { acertos: acertosDoQuiz, total: quizzes.length, taxa: razao(acertosDoQuiz, quizzes.length) },
		perguntas: { pontos: pontosDasPerguntas, total: perguntas.length, taxa: razao(pontosDasPerguntas, perguntas.length) },
		dissertativas: { pontos: arredondar(pontos, 2), max: arredondar(max, 2), questoes: corrigidas, taxa: razao(pontos, max) },
		naoSabia: { quantos: naoSabiam.size, questoes: respondidas.size, taxa: razao(naoSabiam.size, respondidas.size) },
		questionario: { licoes: questionarios.length, ...notas },
		blocos,
		pedidosDeExplicacao: { total: pedidos, porLicao: porLicao(pedidos) },
		termosGuardados: { total: termos, porLicao: porLicao(termos) },
		calibracao: { brier: comConfianca.length > 0 ? arredondar(soma / comConfianca.length, 4) : null, n: comConfianca.length },
	};
}

/** O placar de um módulo lido dos eventos do aprendiz: os eventos dele (eventosDoModulo, só da geração atual) e as lições dele. */
export const placarDoModuloNosEventos = (eventos: readonly Evento[], modulo: Pick<ModuloGerado, "materia" | "curso" | "id" | "geradoEm" | "licoes">): PlacarDoModulo =>
	placarDoModulo(eventosDoModulo(eventos, modulo), modulo.licoes.length);

/** Lê um placar de um relatório gravado; fora do formato (faltam as partes), Error com a frase. */
export function placarLido(valor: unknown): PlacarDoModulo {
	const campo = (objeto: unknown, nome: string, tipo: "number"): number => {
		if (!ehObjeto(objeto) || typeof objeto[nome] !== tipo) throw new Error(`o placar não tem ${nome}`);
		return objeto[nome] as number;
	};
	const umOuNull = (objeto: unknown, nome: string): number | null => {
		if (!ehObjeto(objeto) || (objeto[nome] !== null && typeof objeto[nome] !== "number")) throw new Error(`o placar não tem ${nome}`);
		return objeto[nome] as number | null;
	};
	if (!ehObjeto(valor)) throw new Error("o placar não é um objeto");
	const nota = (pergunta: PerguntaLicao): NotaDoQuestionario => {
		const questionario = valor.questionario;
		const item = ehObjeto(questionario) ? questionario[pergunta] : undefined;
		return { media: umOuNull(item, "media"), n: campo(item, "n", "number") };
	};
	const { quiz, perguntas, dissertativas, naoSabia, questionario, blocos, pedidosDeExplicacao, termosGuardados, calibracao } = valor;
	return {
		licoes: campo(valor, "licoes", "number"),
		quiz: { acertos: campo(quiz, "acertos", "number"), total: campo(quiz, "total", "number"), taxa: umOuNull(quiz, "taxa") },
		perguntas: { pontos: campo(perguntas, "pontos", "number"), total: campo(perguntas, "total", "number"), taxa: umOuNull(perguntas, "taxa") },
		dissertativas: { pontos: campo(dissertativas, "pontos", "number"), max: campo(dissertativas, "max", "number"), questoes: campo(dissertativas, "questoes", "number"), taxa: umOuNull(dissertativas, "taxa") },
		naoSabia: { quantos: campo(naoSabia, "quantos", "number"), questoes: campo(naoSabia, "questoes", "number"), taxa: umOuNull(naoSabia, "taxa") },
		questionario: {
			licoes: campo(questionario, "licoes", "number"),
			entendimento: nota("entendimento"),
			clareza: nota("clareza"),
			exemplos: nota("exemplos"),
			questoes: nota("questoes"),
			ritmo: nota("ritmo"),
		},
		blocos: { ruim: campo(blocos, "ruim", "number"), bom: campo(blocos, "bom", "number"), otimo: campo(blocos, "otimo", "number"), total: campo(blocos, "total", "number") },
		pedidosDeExplicacao: { total: campo(pedidosDeExplicacao, "total", "number"), porLicao: umOuNull(pedidosDeExplicacao, "porLicao") },
		termosGuardados: { total: campo(termosGuardados, "total", "number"), porLicao: umOuNull(termosGuardados, "porLicao") },
		calibracao: { brier: umOuNull(calibracao, "brier"), n: campo(calibracao, "n", "number") },
	};
}

// --- O histórico e a comparação -----------------------------------------------------------------

/** Um módulo concluído que pode entrar no histórico: o arquivo dele e os nomes (do curso e do esqueleto). */
export interface ModuloConcluido {
	modulo: ModuloGerado;
	cursoNome: string;
	moduloNome: string;
}

/** Uma entrada do histórico: o curso e o módulo (ids e nomes), quando foi concluído, os ajustes que valeram na geração e o placar recalculado dos eventos. */
export interface EntradaDoHistorico {
	materia: string;
	curso: string;
	cursoNome: string;
	modulo: string;
	moduloNome: string;
	/** ISO 8601. */
	concluidoEm: string;
	ajustesUsados: AjusteUsado[];
	placar: PlacarDoModulo;
}

/** Os ajustes que valeram na geração do módulo (o campo ajustesUsados; um módulo gerado antes dele conta como gerado sem experimentos). */
export const ajustesUsadosDoModulo = (modulo: Pick<ModuloGerado, "ajustesUsados">): AjusteUsado[] => (modulo.ajustesUsados ?? []).map((item) => ({ ...item }));

/**
 * O histórico: os módulos concluídos antes do atual (concluidoEm anterior ao
 * dele; sem o `concluidoEm` do atual, todos os outros), de todas as matérias e
 * cursos, em ordem de concluidoEm, os `limite` últimos, cada um com o placar
 * recalculado dos eventos (placarDoModuloNosEventos). Derivado: nada novo é
 * gravado.
 */
export function historicoDosModulos(
	concluidos: readonly ModuloConcluido[],
	eventos: readonly Evento[],
	atual: { materia: string; curso: string; modulo: string; concluidoEm?: string },
	limite: number = MAXIMO_NO_HISTORICO,
): EntradaDoHistorico[] {
	return concluidos
		.filter(({ modulo }) => modulo.concluidoEm && !(modulo.materia === atual.materia && modulo.curso === atual.curso && modulo.id === atual.modulo) && (!atual.concluidoEm || modulo.concluidoEm < atual.concluidoEm))
		.sort((a, b) => a.modulo.concluidoEm!.localeCompare(b.modulo.concluidoEm!) || `${a.modulo.materia}/${a.modulo.curso}/${a.modulo.id}`.localeCompare(`${b.modulo.materia}/${b.modulo.curso}/${b.modulo.id}`))
		.slice(-limite)
		.map(({ modulo, cursoNome, moduloNome }) => ({
			materia: modulo.materia,
			curso: modulo.curso,
			cursoNome,
			modulo: modulo.id,
			moduloNome,
			concluidoEm: modulo.concluidoEm!,
			ajustesUsados: ajustesUsadosDoModulo(modulo),
			placar: placarDoModuloNosEventos(eventos, modulo),
		}));
}

/** Uma métrica do placar: o nome, como o número se mostra e de onde sai (o valor e o `n`). */
export interface MetricaDoPlacar {
	id: IdMetrica;
	nome: string;
	/** taxa: de 0 a 1 (porcentagem); nota: de 1 a 5; brier: de 0 a 1 (menor é melhor); contagem: por lição. */
	tipo: "taxa" | "nota" | "brier" | "contagem";
	extrair(placar: PlacarDoModulo): { valor: number | null; n: number };
}

export const IDS_METRICAS = [
	"quiz",
	"perguntas",
	"dissertativas",
	"naoSabia",
	"entendimento",
	"clareza",
	"exemplos",
	"questoes",
	"ritmo",
	"blocosRuins",
	"blocosOtimos",
	"pedidosPorLicao",
	"termosPorLicao",
	"brier",
] as const;
export type IdMetrica = (typeof IDS_METRICAS)[number];

const notaDoQuestionario = (pergunta: PerguntaLicao) => (placar: PlacarDoModulo) => ({ valor: placar.questionario[pergunta].media, n: placar.questionario[pergunta].n });

/** As métricas, na ordem em que a tabela e a comparação as mostram. */
export const METRICAS: readonly MetricaDoPlacar[] = [
	{ id: "quiz", nome: "Quiz na 1ª tentativa", tipo: "taxa", extrair: (placar) => ({ valor: placar.quiz.taxa, n: placar.quiz.total }) },
	{ id: "perguntas", nome: "Perguntas", tipo: "taxa", extrair: (placar) => ({ valor: placar.perguntas.taxa, n: placar.perguntas.total }) },
	{ id: "dissertativas", nome: "Dissertativas na 1ª tentativa", tipo: "taxa", extrair: (placar) => ({ valor: placar.dissertativas.taxa, n: placar.dissertativas.questoes }) },
	{ id: "naoSabia", nome: "Não sabia", tipo: "taxa", extrair: (placar) => ({ valor: placar.naoSabia.taxa, n: placar.naoSabia.questoes }) },
	{ id: "entendimento", nome: "Entendimento", tipo: "nota", extrair: notaDoQuestionario("entendimento") },
	{ id: "clareza", nome: "Clareza", tipo: "nota", extrair: notaDoQuestionario("clareza") },
	{ id: "exemplos", nome: "Exemplos", tipo: "nota", extrair: notaDoQuestionario("exemplos") },
	{ id: "questoes", nome: "Questões", tipo: "nota", extrair: notaDoQuestionario("questoes") },
	{ id: "ritmo", nome: "Ritmo", tipo: "nota", extrair: notaDoQuestionario("ritmo") },
	{ id: "blocosRuins", nome: "Blocos Ruim", tipo: "taxa", extrair: (placar) => ({ valor: razao(placar.blocos.ruim, placar.blocos.total), n: placar.blocos.total }) },
	{ id: "blocosOtimos", nome: "Blocos Ótimo", tipo: "taxa", extrair: (placar) => ({ valor: razao(placar.blocos.otimo, placar.blocos.total), n: placar.blocos.total }) },
	{ id: "pedidosPorLicao", nome: "Pedidos de explicação por lição", tipo: "contagem", extrair: (placar) => ({ valor: placar.pedidosDeExplicacao.porLicao, n: placar.licoes }) },
	{ id: "termosPorLicao", nome: "Termos guardados por lição", tipo: "contagem", extrair: (placar) => ({ valor: placar.termosGuardados.porLicao, n: placar.licoes }) },
	{ id: "brier", nome: "Brier (calibração)", tipo: "brier", extrair: (placar) => ({ valor: placar.calibracao.brier, n: placar.calibracao.n }) },
];

/**
 * Uma métrica do módulo atual contra a média dos módulos do histórico.
 * `media` é a média simples dos valores dos módulos do histórico que têm
 * amostra (null sem nenhum), `modulos` é quantos são e `nMedia` a soma dos `n`
 * deles; `atual` e `nAtual` são os do módulo atual.
 */
export interface ItemDaComparacao {
	atual: number | null;
	nAtual: number;
	media: number | null;
	nMedia: number;
	modulos: number;
}

/** A comparação do módulo atual com o histórico, por métrica (para a tela mostrar sem calcular). */
export type Comparacao = Record<IdMetrica, ItemDaComparacao>;

/** Compara o placar do módulo atual com a média do histórico, métrica a métrica. */
export function compararComHistorico(placar: PlacarDoModulo, historico: readonly Pick<EntradaDoHistorico, "placar">[]): Comparacao {
	const itens = METRICAS.map((metrica) => {
		const atual = metrica.extrair(placar);
		const anteriores = historico.map((entrada) => metrica.extrair(entrada.placar)).filter((item): item is { valor: number; n: number } => item.valor !== null);
		const media = anteriores.length > 0 ? arredondar(anteriores.reduce((total, item) => total + item.valor, 0) / anteriores.length, 4) : null;
		const item: ItemDaComparacao = { atual: atual.valor, nAtual: atual.n, media, nMedia: anteriores.reduce((total, anterior) => total + anterior.n, 0), modulos: anteriores.length };
		return [metrica.id, item] as const;
	});
	return Object.fromEntries(itens) as Comparacao;
}

/** Lê uma comparação de um relatório gravado; fora do formato, Error com a frase. */
export function comparacaoLida(valor: unknown): Comparacao {
	if (!ehObjeto(valor)) throw new Error("a comparação não é um objeto");
	const saida: Partial<Comparacao> = {};
	for (const id of IDS_METRICAS) {
		const item = valor[id];
		const numeroOuNull = (campo: string) => ehObjeto(item) && (item[campo] === null || typeof item[campo] === "number");
		if (!ehObjeto(item) || !numeroOuNull("atual") || !numeroOuNull("media") || typeof item.nAtual !== "number" || typeof item.nMedia !== "number" || typeof item.modulos !== "number") {
			throw new Error(`a comparação não tem a métrica ${id}`);
		}
		saida[id] = { atual: item.atual as number | null, nAtual: item.nAtual, media: item.media as number | null, nMedia: item.nMedia, modulos: item.modulos };
	}
	return saida as Comparacao;
}

// --- O texto (a tabela da mensagem ao modelo) ------------------------------------------------------

/** 7, 6,5: o número com vírgula. */
const comVirgula = (valor: number, casas: number) => String(arredondar(valor, casas)).replace(".", ",");

/** Uma métrica como vai na tabela de texto: "75% (n=4)", "3,5 (n=2)", "0,21 (n=5)" ou "—" sem amostra. */
export function textoDaMetrica(metrica: Pick<MetricaDoPlacar, "tipo">, medida: { valor: number | null; n: number }): string {
	if (medida.valor === null) return "—";
	if (metrica.tipo === "taxa") return `${Math.round(medida.valor * 100)}% (n=${medida.n})`;
	if (metrica.tipo === "brier") return `${comVirgula(medida.valor, 2)} (n=${medida.n})`;
	return `${comVirgula(medida.valor, 2)} (n=${medida.n})`;
}

/** O nome de um módulo nas linhas de texto: "Curso · Módulo (curso-id/m1)". */
export const rotuloDoModulo = (item: Pick<EntradaDoHistorico, "cursoNome" | "moduloNome" | "curso" | "modulo">) => `${item.cursoNome} · ${item.moduloNome} (${item.curso}/${item.modulo})`;

/** Os experimentos que valeram num módulo, como vão na tabela: "dissertativa.md#a-1, quiz.md#a-2" ou "nenhum". */
export const textoDosAjustesUsados = (usados: readonly AjusteUsado[]) => (usados.length === 0 ? "nenhum" : usados.map((item) => `${referenciaDoAjuste(item.arquivo, item.ajuste)} (${item.estado})`).join(", "));

/**
 * A tabela de texto do histórico e do módulo atual: uma linha por módulo (os do
 * histórico em ordem e, por último, o atual) e uma coluna por métrica, com os
 * `n`; a última coluna diz quais ajustes valeram na geração do módulo.
 */
export function tabelaDoHistorico(historico: readonly EntradaDoHistorico[], atual: { rotulo: string; placar: PlacarDoModulo; ajustesUsados: readonly AjusteUsado[] }): string {
	const cabecalho = ["Módulo", ...METRICAS.map((metrica) => metrica.nome), "Ajustes que valeram na geração"];
	const linha = (rotulo: string, placar: PlacarDoModulo, usados: readonly AjusteUsado[]) => [
		rotulo,
		...METRICAS.map((metrica) => textoDaMetrica(metrica, metrica.extrair(placar))),
		textoDosAjustesUsados(usados),
	];
	const linhas = [cabecalho, ...historico.map((item) => linha(rotuloDoModulo(item), item.placar, item.ajustesUsados)), linha(`${atual.rotulo} [ATUAL]`, atual.placar, atual.ajustesUsados)];
	return linhas.map((celulas) => `| ${celulas.join(" | ")} |`).join("\n");
}
