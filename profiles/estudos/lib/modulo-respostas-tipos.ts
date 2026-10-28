// As respostas das questões do módulo (docs/modulos.md, "Responder as
// questões", parte 2 do plano de 2026-10-28) sem nada do Node: a tela
// (profiles/estudos/paineis) importa daqui, e a extensão de módulos aplica as
// mesmas funções antes de gravar (lib/modulo-respostas.ts reexporta). As
// respostas ficam no próprio <módulo>.json, no campo `respostas`, pelo id do
// bloco; cada uma guarda a versão do bloco respondida, e uma resposta de
// outra versão não vale (respostaDoBloco).
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam. Quem confere o quiz, diz se a questão está
// feita e conta o progresso é o código, não o modelo.

import { type Confianca, type Correcao, type CriterioCorrigido, ehConfianca } from "./diagnostico-tipos.ts";
import { type Bloco, type BlocoAlternativa, type BlocoDissertativa, type BlocoVerificacao, ehPratica, ErroModulo, type Licao, type Modulo, type ModuloGerado, versaoDoBloco } from "./modulo-tipos.ts";

export type { Confianca } from "./diagnostico-tipos.ts";
export { CONFIANCAS, ehConfianca, NOMES_CONFIANCA } from "./diagnostico-tipos.ts";

/** Até quantos caracteres das explicações logo antes da pergunta vão para o modelo que a confere (explicacoesAntes). */
export const LIMITE_EXPLICACAO_VERIFICACAO = 6_000;

/** Quantas tentativas o quiz tem; a dissertativa tem a primeira e uma reescrita; a pergunta, uma só. */
export const TENTATIVAS_ALTERNATIVA = 2;
export const TENTATIVAS_DISSERTATIVA = 2;
export const TENTATIVAS_VERIFICACAO = 1;

// --- Formato (o campo respostas do <módulo>.json) -------------------------------------

/** A avaliação da pergunta rápida (verificacao), dada pelo modelo (prompts/verificacao.md). */
export const AVALIACOES_VERIFICACAO = ["certa", "parcial", "errada"] as const;
export type AvaliacaoVerificacao = (typeof AVALIACOES_VERIFICACAO)[number];
export const ehAvaliacaoVerificacao = (valor: unknown): valor is AvaliacaoVerificacao => (AVALIACOES_VERIFICACAO as readonly unknown[]).includes(valor);

/** Os blocos que são questões (TIPOS_PRATICA): a pergunta, o quiz e a dissertativa. */
export type BlocoQuestao = BlocoVerificacao | BlocoAlternativa | BlocoDissertativa;
export type TipoQuestao = BlocoQuestao["tipo"];

/** O bloco é uma questão (pergunta, quiz ou dissertativa)? */
export const ehQuestao = (bloco: Pick<Bloco, "tipo">): bloco is BlocoQuestao => ehPratica(bloco.tipo);

/** "Não sei": a questão acabou como não sabida. */
export interface NaoSei {
	/** ISO 8601. */
	em: string;
	/** O id do evento nao_sabia_questao. */
	evento?: string;
}

/** Uma tentativa do quiz, já conferida pela extensão (sem modelo). */
export interface TentativaAlternativa {
	/** O índice da alternativa escolhida. */
	escolha: number;
	correta: boolean;
	/** A confusão da alternativa errada escolhida. Só aparece quando está errada. */
	confusao?: string;
	/** Da marcação da confiança até a resposta. */
	tempoMs: number;
	/** ISO 8601. */
	em: string;
	/** O id do evento respondeu_questao. */
	evento?: string;
}

/** Uma tentativa da pergunta: sem avaliação, está sendo conferida (ou a conferência falhou). */
export interface TentativaVerificacao {
	texto: string;
	tempoMs: number;
	em: string;
	avaliacao?: AvaliacaoVerificacao;
	/** De 1 a 2 frases: o que está certo e o que faltou. */
	retorno?: string;
	/** provedor/id do modelo que conferiu. */
	modelo?: string;
	/** US$ da conferência. */
	custo?: number;
	/** O id do evento respondeu_verificacao (gravado quando a conferência chega). */
	evento?: string;
}

/** Uma tentativa da dissertativa: sem correção, está sendo corrigida (ou a correção falhou). */
export interface TentativaDissertativa {
	texto: string;
	tempoMs: number;
	em: string;
	/** A correção pela rubrica, como no diagnóstico (validarCorrecao). */
	correcao?: Correcao;
	/** O id do evento respondeu_dissertativa (gravado quando a correção chega). */
	evento?: string;
}

interface RespostaBase {
	/** A versão do bloco respondida (versaoDoBloco). Uma resposta de outra versão não vale. */
	versao: number;
	/** De 1 a 4, marcada uma vez por questão, antes da primeira tentativa. Falta só quando a questão acabou em "Não sei" sem tentativas. */
	confianca?: Confianca;
	/** A questão acabou como não sabida (pode vir depois de tentativas, no quiz). */
	naoSei?: NaoSei;
}

export interface RespostaAlternativaModulo extends RespostaBase {
	tipo: "alternativa";
	/** Até 2. */
	tentativas: TentativaAlternativa[];
}

export interface RespostaVerificacaoModulo extends RespostaBase {
	tipo: "verificacao";
	/** Até 1. */
	tentativas: TentativaVerificacao[];
}

export interface RespostaDissertativaModulo extends RespostaBase {
	tipo: "dissertativa";
	/** A primeira e, opcional, a reescrita. A nota da questão é a da última corrigida (notaDaDissertativa). */
	tentativas: TentativaDissertativa[];
	/** ISO 8601: "Ver a resposta-modelo" (encerrar) ou a reescrita corrigida. Depois, não dá mais para reescrever. */
	encerradaEm?: string;
}

export type RespostaModulo = RespostaAlternativaModulo | RespostaVerificacaoModulo | RespostaDissertativaModulo;

/** O campo respostas do <módulo>.json: pelo id do bloco. */
export type RespostasModulo = Record<string, RespostaModulo>;

// --- Funções -------------------------------------------------------------------

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));
const textoLimpo = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/**
 * A resposta que vale para o bloco: a gravada com o mesmo tipo e a versão
 * atual do bloco (versaoDoBloco). A de uma versão antiga (o bloco foi
 * reescrito depois), a de outro tipo, a que não está no formato, ou a de um
 * bloco que não é questão, undefined: a questão é tratada como nova.
 */
export function respostaDoBloco(respostas: Readonly<Record<string, unknown>> | null | undefined, bloco: Bloco): RespostaModulo | undefined {
	if (!ehQuestao(bloco) || !ehObjeto(respostas)) return undefined;
	const gravada = respostas[bloco.id];
	if (!ehObjeto(gravada) || gravada.tipo !== bloco.tipo || gravada.versao !== versaoDoBloco(bloco) || !Array.isArray(gravada.tentativas)) return undefined;
	return gravada as unknown as RespostaModulo;
}

/** Onde a questão está: o que ela ainda aceita e se conta no progresso. */
export interface SituacaoQuestao {
	/**
	 * Conta no progresso: o quiz acertado, errado duas vezes ou "Não sei"; a
	 * pergunta conferida ou "Não sei"; a dissertativa com a primeira tentativa
	 * corrigida ou "Não sei" (a reescrita é opcional).
	 */
	feita: boolean;
	/** Acabou: não aceita mais nada, e o gabarito aparece (oQueMostrar). */
	encerrada: boolean;
	/** Aceita uma resposta (responder com escolha ou texto). */
	aceitaResposta: boolean;
	/** O número da tentativa que a próxima resposta seria (1, 2), quando aceita resposta; senão null. */
	tentativa: number | null;
	/** Aceita "Não sei": no quiz, enquanto não acabou; na pergunta e na dissertativa, antes da primeira tentativa. */
	aceitaNaoSei: boolean;
	/** Dissertativa: aceita "Ver a resposta-modelo" (encerrar): a primeira corrigida, nada em correção, ainda não encerrada. */
	aceitaEncerrar: boolean;
	/** A tentativa (1, 2) gravada sem avaliação ou correção: está sendo conferida, ou a conferência falhou (corrigir tenta de novo). Sem nenhuma, null. */
	aConferir: number | null;
	/** Quiz: os índices já escolhidos (desligados na próxima tentativa). */
	escolhas: number[];
	/** A confiança marcada (vale para as tentativas da questão), ou null. */
	confianca: Confianca | null;
}

/**
 * A situação da questão pela resposta que vale (respostaDoBloco; sem ela, a
 * questão nova). Uma resposta de outro tipo é ignorada.
 */
export function situacaoDaQuestao(bloco: BlocoQuestao, resposta: RespostaModulo | null | undefined): SituacaoQuestao {
	const valida = resposta && resposta.tipo === bloco.tipo ? resposta : undefined;
	const naoSei = Boolean(valida?.naoSei);
	const confianca = valida && ehConfianca(valida.confianca) ? valida.confianca : null;
	const base = { escolhas: [] as number[], confianca, aceitaEncerrar: false, aConferir: null as number | null };
	if (bloco.tipo === "alternativa") {
		const tentativas = valida?.tipo === "alternativa" ? valida.tentativas : [];
		const acertou = tentativas.some((tentativa) => tentativa.correta === true);
		const encerrada = naoSei || acertou || tentativas.length >= TENTATIVAS_ALTERNATIVA;
		return {
			...base,
			feita: encerrada,
			encerrada,
			aceitaResposta: !encerrada,
			tentativa: encerrada ? null : tentativas.length + 1,
			aceitaNaoSei: !encerrada,
			escolhas: tentativas.map((tentativa) => tentativa.escolha),
		};
	}
	if (bloco.tipo === "verificacao") {
		const tentativas = valida?.tipo === "verificacao" ? valida.tentativas : [];
		const conferida = tentativas.some((tentativa) => ehAvaliacaoVerificacao(tentativa.avaliacao));
		const pendente = tentativas.length > 0 && !ehAvaliacaoVerificacao(tentativas.at(-1)!.avaliacao);
		const encerrada = naoSei || conferida;
		const livre = !naoSei && tentativas.length === 0;
		return { ...base, feita: encerrada, encerrada, aceitaResposta: livre, tentativa: livre ? 1 : null, aceitaNaoSei: livre, aConferir: pendente ? tentativas.length : null };
	}
	const tentativas = valida?.tipo === "dissertativa" ? valida.tentativas : [];
	const encerradaEm = valida?.tipo === "dissertativa" ? valida.encerradaEm : undefined;
	const primeira = Boolean(tentativas[0]?.correcao);
	const pendente = tentativas.length > 0 && !tentativas.at(-1)!.correcao;
	const encerrada = naoSei || Boolean(encerradaEm) || (tentativas.length >= TENTATIVAS_DISSERTATIVA && !pendente);
	const aceitaResposta = !encerrada && !pendente && (tentativas.length === 0 || (tentativas.length === 1 && primeira));
	return {
		...base,
		feita: naoSei || primeira,
		encerrada,
		aceitaResposta,
		tentativa: aceitaResposta ? tentativas.length + 1 : null,
		aceitaNaoSei: !naoSei && tentativas.length === 0,
		aceitaEncerrar: !encerrada && primeira && !pendente,
		aConferir: pendente ? tentativas.length : null,
	};
}

/** O que a tela pode mostrar da questão agora. */
export interface MostrarDaQuestao {
	/** Quiz, depois da primeira tentativa errada e enquanto a questão não acabou: a confusão da alternativa escolhida (o texto da `confusao`, sem modelo). Senão, null. */
	pista: string | null;
	/** Quiz: a explicação (acertou, ou acabou). */
	explicacao: boolean;
	/**
	 * O gabarito: no quiz, a correta, a confusão de cada errada e a explicação
	 * (errou duas vezes, ou "Não sei"); na pergunta, a resposta esperada
	 * (conferida, ou "Não sei"); na dissertativa, a rubrica inteira com as
	 * descrições e a resposta-modelo (encerrada: "Ver a resposta-modelo", a
	 * reescrita corrigida, ou "Não sei"). Os nomes dos critérios da
	 * dissertativa vêm na correção, antes disso.
	 */
	gabarito: boolean;
}

/** O que a questão mostra agora (situacaoDaQuestao). */
export function oQueMostrar(bloco: BlocoQuestao, resposta: RespostaModulo | null | undefined): MostrarDaQuestao {
	const situacao = situacaoDaQuestao(bloco, resposta);
	if (bloco.tipo !== "alternativa") return { pista: null, explicacao: false, gabarito: situacao.encerrada };
	const tentativas = resposta?.tipo === "alternativa" ? resposta.tentativas : [];
	const acertou = tentativas.some((tentativa) => tentativa.correta === true);
	const primeira = tentativas[0];
	const pista =
		!situacao.encerrada && tentativas.length === 1 && primeira && !primeira.correta ? (primeira.confusao ?? bloco.alternativas[primeira.escolha]?.confusao ?? null) : null;
	return { pista: pista || null, explicacao: situacao.encerrada, gabarito: situacao.encerrada && !acertou };
}

// --- A dissertativa -------------------------------------------------------------

/** A marca de um critério corrigido: coberto (todos os pontos), em parte, faltou (zero). */
export const MARCAS_CRITERIO = ["coberto", "em_parte", "faltou"] as const;
export type MarcaCriterio = (typeof MARCAS_CRITERIO)[number];

export function marcaDoCriterio(criterio: Pick<CriterioCorrigido, "pontos" | "max">): MarcaCriterio {
	if (criterio.pontos >= criterio.max) return "coberto";
	return criterio.pontos > 0 ? "em_parte" : "faltou";
}

/** O placar da dissertativa: os critérios cobertos (com todos os pontos) de quantos, os pontos na escala da rubrica e a marca de cada critério, na ordem. */
export interface PlacarDissertativa {
	cobertos: number;
	criterios: number;
	total: number;
	max: number;
	marcas: MarcaCriterio[];
}

/** O placar de uma correção ("2 de 3 pontos-chave", "5 de 8 pontos"). */
export function placarDaDissertativa(correcao: Pick<Correcao, "criterios" | "total" | "max">): PlacarDissertativa {
	const marcas = correcao.criterios.map(marcaDoCriterio);
	return { cobertos: marcas.filter((marca) => marca === "coberto").length, criterios: marcas.length, total: correcao.total, max: correcao.max, marcas };
}

/** A nota da dissertativa: a correção da última tentativa corrigida (a reescrita, quando corrigida, passa a ser a nota). Sem nenhuma, undefined. */
export function notaDaDissertativa(resposta: RespostaModulo | null | undefined): Correcao | undefined {
	if (resposta?.tipo !== "dissertativa") return undefined;
	return resposta.tentativas.findLast((tentativa) => tentativa.correcao)?.correcao;
}

// --- O progresso ------------------------------------------------------------------

/** Questões feitas de quantas (as questões: pergunta, quiz e dissertativa). */
export interface Progresso {
	feitas: number;
	questoes: number;
}

/** O progresso de cada lição, na ordem, e o do módulo (a soma). */
export interface ProgressoModulo extends Progresso {
	licoes: Array<Progresso & { licao: string }>;
}

/** O progresso da lição: as questões dela e as feitas (situacaoDaQuestao), pelas respostas da versão atual de cada bloco. */
export function progressoDaLicao(licao: Pick<Licao, "blocos">, respostas: Readonly<Record<string, unknown>> | null | undefined): Progresso {
	let feitas = 0;
	let questoes = 0;
	for (const bloco of licao.blocos) {
		if (!ehQuestao(bloco)) continue;
		questoes++;
		if (situacaoDaQuestao(bloco, respostaDoBloco(respostas, bloco)).feita) feitas++;
	}
	return { feitas, questoes };
}

/** O progresso do módulo: o de cada lição e a soma. Aguardando material, zeros. */
export function progressoDoModulo(modulo: Pick<Modulo, "licoes"> & { respostas?: RespostasModulo }): ProgressoModulo {
	const licoes = modulo.licoes.map((licao) => ({ licao: licao.id, ...progressoDaLicao(licao, modulo.respostas) }));
	return { feitas: licoes.reduce((soma, item) => soma + item.feitas, 0), questoes: licoes.reduce((soma, item) => soma + item.questoes, 0), licoes };
}

// --- Responder ----------------------------------------------------------------------

/** A questão do módulo pelo id do bloco, com a lição. Módulo que não está gerado, bloco que não existe ou que não é questão, ErroModulo. */
export function questaoDoModulo(modulo: Modulo, bloco: unknown): { licao: Licao; bloco: BlocoQuestao } {
	if (modulo.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo.id} está aguardando material; não há questão para responder.`);
	if (typeof bloco !== "string" || !bloco) throw new ErroModulo("Falta o id do bloco da questão.");
	for (const licao of modulo.licoes) {
		const achado = licao.blocos.find((item) => item.id === bloco);
		if (!achado) continue;
		if (!ehQuestao(achado)) throw new ErroModulo(`O bloco ${bloco} não é uma questão.`);
		return { licao, bloco: achado };
	}
	throw new ErroModulo(`Não achei a questão "${mostrar(bloco)}" no módulo ${modulo.id}.`);
}

/** O que a tela manda no responder (sem materia, curso, modulo, pedido e bloco). */
export interface EntradaResponder {
	/** De 1 a 4. Obrigatória na primeira tentativa; depois vale a marcada (a mandada é ignorada). "Não sei" não pede. */
	confianca?: Confianca;
	/** Quiz: o índice da alternativa. */
	escolha?: number;
	/** Pergunta e dissertativa. */
	texto?: string;
	/** "Não sei": a questão acaba como não sabida. */
	naoSei?: boolean;
	/** Da marcação da confiança até a resposta. Obrigatório numa tentativa; ignorado no "Não sei". */
	tempoMs?: number;
}

/** O que responderQuestao fez: "Não sei" (com quantas tentativas havia antes) ou uma tentativa (o número, e se ela ainda precisa da conferência do modelo). */
export type FeitoNaResposta = { tipo: "nao_sei"; tentativasAntes: number } | { tipo: "tentativa"; numero: number; aConferir: boolean };

export interface RespostaAplicada {
	/** O módulo novo, com a resposta. */
	modulo: ModuloGerado;
	licao: Licao;
	bloco: BlocoQuestao;
	/** A resposta nova do bloco (a mesma que está em modulo.respostas). */
	resposta: RespostaModulo;
	feito: FeitoNaResposta;
}

/** A resposta que vale, ou uma nova (sem tentativas) na versão atual do bloco. */
function respostaOuNova(modulo: ModuloGerado, bloco: BlocoQuestao): RespostaModulo {
	const atual = respostaDoBloco(modulo.respostas, bloco);
	if (atual) return structuredClone(atual);
	return { tipo: bloco.tipo, versao: versaoDoBloco(bloco), tentativas: [] } as RespostaModulo;
}

/** A resposta na ordem do formato: tipo, versao, confianca, naoSei, tentativas, encerradaEm. */
function respostaNaOrdem(resposta: RespostaModulo): RespostaModulo {
	const encerradaEm = resposta.tipo === "dissertativa" ? resposta.encerradaEm : undefined;
	return {
		tipo: resposta.tipo,
		versao: resposta.versao,
		...(resposta.confianca !== undefined ? { confianca: resposta.confianca } : {}),
		...(resposta.naoSei ? { naoSei: resposta.naoSei } : {}),
		tentativas: resposta.tentativas,
		...(encerradaEm ? { encerradaEm } : {}),
	} as RespostaModulo;
}

/** O módulo com a resposta do bloco trocada (os outros campos e as outras respostas como estavam). */
function comResposta(modulo: ModuloGerado, bloco: string, resposta: RespostaModulo): ModuloGerado {
	const copia = structuredClone(modulo);
	copia.respostas = { ...(copia.respostas ?? {}), [bloco]: respostaNaOrdem(resposta) };
	return copia;
}

/** Por que a questão não aceita resposta, para a frase do erro. */
function porQueNaoAceita(bloco: BlocoQuestao, situacao: SituacaoQuestao): string {
	if (situacao.aConferir !== null) return `A resposta da questão ${bloco.id} ainda está sendo conferida, ou a conferência falhou (peça para conferir de novo).`;
	if (situacao.encerrada) return `A questão ${bloco.id} já acabou.`;
	return `A questão ${bloco.id} já foi respondida.`;
}

/**
 * Aplica a resposta da tela (docs/modulos.md, "Responder as questões") e
 * devolve o módulo novo. Confere que a questão ainda aceita
 * (situacaoDaQuestao, pela resposta da versão atual do bloco; a de uma versão
 * antiga é substituída):
 * - "Não sei" (naoSei: true): só quando aceitaNaoSei; grava naoSei {em};
 * - uma tentativa: só quando aceitaResposta; a confiança de 1 a 4 na
 *   primeira (depois vale a marcada), o tempoMs (número não negativo,
 *   arredondado) e, no quiz, a escolha (um índice das alternativas, não
 *   repetida) ou, na pergunta e na dissertativa, o texto (não vazio,
 *   aparado). O quiz sai conferido aqui (correta e a confusão da errada); a
 *   pergunta e a dissertativa ficam sem avaliação ou correção, à espera do
 *   modelo (feito.aConferir).
 * Sem o id do evento: quem grava põe (lib/modulo-respostas.ts). Problema,
 * ErroModulo.
 */
export function responderQuestao(modulo: Modulo, blocoId: unknown, entrada: unknown, agora: Date = new Date()): RespostaAplicada {
	const { licao, bloco } = questaoDoModulo(modulo, blocoId);
	const gerado = modulo as ModuloGerado;
	if (!ehObjeto(entrada)) throw new ErroModulo("A resposta veio vazia.");
	const resposta = respostaOuNova(gerado, bloco);
	const situacao = situacaoDaQuestao(bloco, resposta);
	const em = agora.toISOString();
	if (entrada.naoSei === true) {
		if (!situacao.aceitaNaoSei) throw new ErroModulo(porQueNaoAceita(bloco, situacao));
		const tentativasAntes = resposta.tentativas.length;
		resposta.naoSei = { em };
		const novo = comResposta(gerado, bloco.id, resposta);
		return { modulo: novo, licao, bloco, resposta: novo.respostas![bloco.id]!, feito: { tipo: "nao_sei", tentativasAntes } };
	}
	if (!situacao.aceitaResposta) throw new ErroModulo(porQueNaoAceita(bloco, situacao));
	const confianca = situacao.confianca ?? entrada.confianca;
	if (!ehConfianca(confianca)) throw new ErroModulo(`Marque a confiança, de 1 a 4, antes de responder (veio "${mostrar(entrada.confianca)}").`);
	const tempoMs = entrada.tempoMs;
	if (typeof tempoMs !== "number" || !Number.isFinite(tempoMs) || tempoMs < 0) throw new ErroModulo(`O tempo da resposta precisa ser um número de milissegundos (veio "${mostrar(tempoMs)}").`);
	resposta.confianca = confianca;
	const numero = resposta.tentativas.length + 1;
	if (bloco.tipo === "alternativa") {
		const escolha = entrada.escolha;
		if (typeof escolha !== "number" || !Number.isInteger(escolha) || escolha < 0 || escolha >= bloco.alternativas.length) {
			throw new ErroModulo(`Escolha uma das alternativas da questão ${bloco.id} (veio "${mostrar(escolha)}").`);
		}
		if (situacao.escolhas.includes(escolha)) throw new ErroModulo("Essa alternativa já foi escolhida; escolha outra.");
		const escolhida = bloco.alternativas[escolha]!;
		const correta = escolhida.correta === true;
		(resposta as RespostaAlternativaModulo).tentativas.push({ escolha, correta, ...(!correta && escolhida.confusao ? { confusao: escolhida.confusao } : {}), tempoMs: Math.round(tempoMs), em });
	} else {
		const texto = textoLimpo(entrada.texto);
		if (!texto) throw new ErroModulo(`Escreva a resposta da questão ${bloco.id}.`);
		(resposta as RespostaVerificacaoModulo | RespostaDissertativaModulo).tentativas.push({ texto, tempoMs: Math.round(tempoMs), em });
	}
	const novo = comResposta(gerado, bloco.id, resposta);
	return { modulo: novo, licao, bloco, resposta: novo.respostas![bloco.id]!, feito: { tipo: "tentativa", numero, aConferir: bloco.tipo !== "alternativa" } };
}

// --- A conferência pelo modelo -----------------------------------------------------------

/**
 * A tentativa que o modelo confere: de onde ela é (a lição, o bloco, a versão
 * dele e o geradoEm do módulo) e como ela foi gravada (o número, o texto e
 * quando). Serve para jogar fora a conferência que ficou velha
 * (conferenciaVale).
 */
export interface AlvoConferencia {
	licao: string;
	bloco: string;
	tipo: "verificacao" | "dissertativa";
	versao: number;
	/** 1, 2. */
	tentativa: number;
	texto: string;
	em: string;
	/** O geradoEm do módulo: gerar de novo troca. */
	geradoEm: string;
}

/** A tentativa do bloco que espera a conferência (situacaoDaQuestao.aConferir). Sem ela (ou quiz), undefined. */
export function alvoDaConferencia(modulo: Modulo, blocoId: unknown): AlvoConferencia | undefined {
	const { licao, bloco } = questaoDoModulo(modulo, blocoId);
	if (bloco.tipo === "alternativa" || modulo.situacao !== "gerado") return undefined;
	const resposta = respostaDoBloco(modulo.respostas, bloco);
	const numero = situacaoDaQuestao(bloco, resposta).aConferir;
	if (numero === null || !resposta || resposta.tipo === "alternativa") return undefined;
	const tentativa = resposta.tentativas[numero - 1]!;
	return { licao: licao.id, bloco: bloco.id, tipo: bloco.tipo, versao: resposta.versao, tentativa: numero, texto: tentativa.texto, em: tentativa.em, geradoEm: modulo.geradoEm };
}

/**
 * A conferência ainda vale: o módulo é o mesmo (gerado, com o mesmo
 * geradoEm), o bloco está na mesma versão, e a tentativa continua a mesma
 * (texto e momento) e sem avaliação ou correção. Senão (o módulo foi gerado
 * de novo, o bloco reescrito, ou a tentativa já foi conferida), ela é jogada
 * fora.
 */
export function conferenciaVale(modulo: Modulo | null | undefined, alvo: AlvoConferencia): boolean {
	if (!modulo || modulo.situacao !== "gerado" || modulo.geradoEm !== alvo.geradoEm) return false;
	const licao = modulo.licoes.find((item) => item.id === alvo.licao);
	const bloco = licao?.blocos.find((item) => item.id === alvo.bloco);
	if (!bloco || bloco.tipo !== alvo.tipo || versaoDoBloco(bloco) !== alvo.versao) return false;
	const resposta = respostaDoBloco(modulo.respostas, bloco);
	if (!resposta || resposta.tipo !== alvo.tipo) return false;
	const tentativa = resposta.tentativas[alvo.tentativa - 1] as TentativaVerificacao | TentativaDissertativa | undefined;
	if (!tentativa || tentativa.texto !== alvo.texto || tentativa.em !== alvo.em) return false;
	return alvo.tipo === "verificacao" ? !ehAvaliacaoVerificacao((tentativa as TentativaVerificacao).avaliacao) : !(tentativa as TentativaDissertativa).correcao;
}

/** O que o modelo da pergunta (prompts/verificacao.md) devolve. */
export interface ResultadoVerificacao {
	avaliacao: AvaliacaoVerificacao;
	retorno: string;
}

/** A conferência da pergunta, como fica na tentativa: a avaliação, o retorno, o modelo e o custo. */
export interface ConferenciaVerificacao extends ResultadoVerificacao {
	modelo: string;
	custo: number;
}

/**
 * Confere o que o modelo da pergunta devolveu: `avaliacao` certa, parcial ou
 * errada (aparada, sem diferença de maiúsculas) e `retorno` não vazio
 * (aparado). Problema, ErroModulo (a extensão tenta de novo, uma vez).
 */
export function validarAvaliacao(resultado: unknown): ResultadoVerificacao {
	if (!ehObjeto(resultado)) throw new ErroModulo("A conferência não veio como um objeto JSON.");
	const avaliacao = typeof resultado.avaliacao === "string" ? resultado.avaliacao.trim().toLowerCase() : resultado.avaliacao;
	if (!ehAvaliacaoVerificacao(avaliacao)) throw new ErroModulo(`A avaliação veio "${mostrar(resultado.avaliacao)}"; precisa ser "certa", "parcial" ou "errada".`);
	const retorno = textoLimpo(resultado.retorno);
	if (!retorno) throw new ErroModulo('Falta o "retorno": uma ou duas frases dizendo o que está certo e o que faltou.');
	return { avaliacao, retorno };
}

/** A conferência que chegou: a da pergunta (ConferenciaVerificacao) ou a correção da dissertativa (validarCorrecao). */
export type Conferencia = ({ tipo: "verificacao" } & ConferenciaVerificacao) | { tipo: "dissertativa"; correcao: Correcao };

/**
 * Junta a conferência à tentativa do alvo e devolve o módulo novo. Na
 * dissertativa, a reescrita (tentativa 2) corrigida encerra a questão
 * (encerradaEm = agora). A conferência que não vale mais (conferenciaVale) ou
 * de outro tipo é ErroModulo: quem chama confere antes e joga fora.
 */
export function aplicarConferencia(
	modulo: Modulo,
	alvo: AlvoConferencia,
	conferencia: Conferencia,
	agora: Date = new Date(),
): { modulo: ModuloGerado; licao: Licao; bloco: BlocoQuestao; resposta: RespostaModulo } {
	if (!conferenciaVale(modulo, alvo)) throw new ErroModulo(`A resposta da questão ${alvo.bloco} mudou enquanto era conferida; a conferência foi jogada fora.`);
	if (conferencia.tipo !== alvo.tipo) throw new ErroModulo(`A conferência é de ${conferencia.tipo}, e a questão ${alvo.bloco} é ${alvo.tipo}.`);
	const { licao, bloco } = questaoDoModulo(modulo, alvo.bloco);
	const gerado = modulo as ModuloGerado;
	const resposta = respostaOuNova(gerado, bloco);
	if (resposta.tipo === "verificacao" && conferencia.tipo === "verificacao") {
		const tentativa = resposta.tentativas[alvo.tentativa - 1]!;
		resposta.tentativas[alvo.tentativa - 1] = { ...tentativa, avaliacao: conferencia.avaliacao, retorno: conferencia.retorno, modelo: conferencia.modelo, custo: conferencia.custo };
	} else if (resposta.tipo === "dissertativa" && conferencia.tipo === "dissertativa") {
		const tentativa = resposta.tentativas[alvo.tentativa - 1]!;
		resposta.tentativas[alvo.tentativa - 1] = { ...tentativa, correcao: structuredClone(conferencia.correcao) };
		if (alvo.tentativa >= TENTATIVAS_DISSERTATIVA && !resposta.encerradaEm) resposta.encerradaEm = agora.toISOString();
	}
	const novo = comResposta(gerado, bloco.id, resposta);
	return { modulo: novo, licao, bloco, resposta: novo.respostas![bloco.id]! };
}

/**
 * "Ver a resposta-modelo": a dissertativa com a primeira tentativa corrigida
 * passa a encerrada (encerradaEm = agora) e não aceita mais a reescrita.
 * Questão que não é dissertativa, ainda sem correção, com uma correção em
 * andamento ou já encerrada, ErroModulo.
 */
export function encerrarQuestao(modulo: Modulo, blocoId: unknown, agora: Date = new Date()): { modulo: ModuloGerado; licao: Licao; bloco: BlocoDissertativa; resposta: RespostaDissertativaModulo } {
	const { licao, bloco } = questaoDoModulo(modulo, blocoId);
	if (bloco.tipo !== "dissertativa") throw new ErroModulo(`A questão ${bloco.id} não é dissertativa; só a dissertativa é encerrada.`);
	const gerado = modulo as ModuloGerado;
	const resposta = respostaOuNova(gerado, bloco) as RespostaDissertativaModulo;
	const situacao = situacaoDaQuestao(bloco, resposta);
	if (!situacao.aceitaEncerrar) {
		if (situacao.encerrada) throw new ErroModulo(`A questão ${bloco.id} já está encerrada.`);
		if (situacao.aConferir !== null) throw new ErroModulo(`A resposta da questão ${bloco.id} ainda está sendo corrigida, ou a correção falhou (peça para corrigir de novo).`);
		throw new ErroModulo(`A questão ${bloco.id} ainda não foi respondida e corrigida.`);
	}
	resposta.encerradaEm = agora.toISOString();
	const novo = comResposta(gerado, bloco.id, resposta);
	return { modulo: novo, licao, bloco, resposta: novo.respostas![bloco.id] as RespostaDissertativaModulo };
}

/**
 * Os textos dos blocos de explicação logo antes do bloco na lição (o que
 * acabou de ser explicado), na ordem da lição: volta do bloco até o primeiro
 * que não é explicação, até `limite` caracteres. A explicação mais próxima
 * entra sempre (cortada no começo, com "[…] ", se passar do limite sozinha);
 * as outras entram enquanto couberem. Bloco que não existe ou sem explicação
 * antes, [].
 */
export function explicacoesAntes(licao: Pick<Licao, "blocos">, blocoId: string, limite: number = LIMITE_EXPLICACAO_VERIFICACAO): string[] {
	const indice = licao.blocos.findIndex((bloco) => bloco.id === blocoId);
	const saida: string[] = [];
	let usados = 0;
	for (let posicao = indice - 1; posicao >= 0; posicao--) {
		const bloco = licao.blocos[posicao]!;
		if (bloco.tipo !== "explicacao") break;
		const texto = bloco.texto.trim();
		if (usados + texto.length <= limite) {
			saida.unshift(texto);
			usados += texto.length;
			continue;
		}
		if (saida.length === 0) saida.unshift(`[…] ${texto.slice(texto.length - limite)}`);
		break;
	}
	return saida;
}
