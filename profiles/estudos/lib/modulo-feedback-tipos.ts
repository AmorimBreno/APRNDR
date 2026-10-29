// O feedback do Breno nos módulos (docs/modulos.md, "O feedback", parte 3 do
// plano de 2026-10-28) sem nada do Node: a tela (profiles/estudos/paineis)
// importa daqui, e a extensão de módulos aplica as mesmas funções antes de
// gravar (lib/modulo-feedback.ts reexporta). São duas coisas:
// - a nota de cada bloco (Ruim, Bom, Ótimo), no campo `feedback` do
//   <módulo>.json, pelo id do bloco, com a versão do bloco avaliada;
// - o questionário do fim de cada lição (cinco perguntas fixas, de 1 a 5, e
//   um texto), no campo `questionarios`, pelo id da lição.
// Os eventos (avaliou_bloco e avaliou_licao) ficam no aprendiz/eventos.jsonl;
// no arquivo do módulo fica só a última nota e o último questionário.
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam.

import { type Bloco, ErroModulo, type Licao, type Modulo, type ModuloGerado, versaoDoBloco } from "./modulo-tipos.ts";

// --- A nota de cada bloco ---------------------------------------------------------

/** As avaliações de um bloco, na ordem da tela: as do feedback rápido e as do retorno detalhado. */
export const AVALIACOES_BLOCO = ["ruim", "bom", "otimo"] as const;
export type AvaliacaoNova = (typeof AVALIACOES_BLOCO)[number];

/** A avaliação dos retornos gravados antes da parte 3 ("Precisa melhorar"): vale como `ruim` na leitura (avaliacaoLida). Não é mais aceita num retorno novo. */
export const AVALIACOES_ANTIGAS = ["melhorar"] as const;
export type AvaliacaoAntiga = (typeof AVALIACOES_ANTIGAS)[number];

/** Uma avaliação que pode estar gravada num evento avaliou_bloco: as novas e a antiga. */
export type AvaliacaoBloco = AvaliacaoNova | AvaliacaoAntiga;

/** Os nomes que a tela mostra. A antiga tem o nome de `ruim`, que é como ela vale. */
export const NOMES_AVALIACAO: Record<AvaliacaoBloco, string> = { ruim: "Ruim", bom: "Bom", otimo: "Ótimo", melhorar: "Ruim" };

/** Uma avaliação nova (ruim, bom ou otimo): a única aceita num feedback ou retorno novo. */
export const ehAvaliacaoBloco = (valor: unknown): valor is AvaliacaoNova => (AVALIACOES_BLOCO as readonly unknown[]).includes(valor);

/** Uma avaliação que pode estar gravada: as novas e a antiga melhorar. */
export const ehAvaliacaoGravada = (valor: unknown): valor is AvaliacaoBloco => ehAvaliacaoBloco(valor) || (AVALIACOES_ANTIGAS as readonly unknown[]).includes(valor);

/** A avaliação de um evento gravado, como vale hoje: `melhorar` vira `ruim`; outra coisa, undefined. */
export function avaliacaoLida(valor: unknown): AvaliacaoNova | undefined {
	if (ehAvaliacaoBloco(valor)) return valor;
	return valor === "melhorar" ? "ruim" : undefined;
}

/** A última nota de um bloco, no campo feedback do <módulo>.json. */
export interface FeedbackBloco {
	avaliacao: AvaliacaoNova;
	/** A versão do bloco avaliada (versaoDoBloco). Depois de uma reescrita, a nota não vale mais (feedbackDoBloco). */
	versao: number;
	/** ISO 8601. */
	em: string;
	/** O id do evento avaliou_bloco que deu a nota. */
	evento: string;
}

/** O campo feedback do <módulo>.json: pelo id do bloco. */
export type FeedbackModulo = Record<string, FeedbackBloco>;

// --- O questionário do fim da lição -------------------------------------------------

/** As cinco perguntas fixas do questionário, na ordem da tela. */
export const PERGUNTAS_LICAO = [
	{ id: "entendimento", texto: "Você sente que entendeu os conceitos?" },
	{ id: "clareza", texto: "As explicações estavam claras?" },
	{ id: "exemplos", texto: "Os exemplos ajudaram a entender?" },
	{ id: "questoes", texto: "As questões ajudaram a fixar o que foi explicado?" },
	{ id: "ritmo", texto: "O tamanho e o ritmo da lição foram bons para você?" },
] as const;
export type PerguntaLicao = (typeof PERGUNTAS_LICAO)[number]["id"];

/** Os ids das perguntas, na ordem. */
export const IDS_PERGUNTAS_LICAO: readonly PerguntaLicao[] = PERGUNTAS_LICAO.map((pergunta) => pergunta.id);

/** Os níveis de cada pergunta, de 1 a 5. */
export const NIVEIS_LICAO = [1, 2, 3, 4, 5] as const;
export type NivelLicao = (typeof NIVEIS_LICAO)[number];

/** Os nomes dos níveis. */
export const NOMES_NIVEL: Record<NivelLicao, string> = { 1: "Muito ruim", 2: "Ruim", 3: "Bom", 4: "Ótimo", 5: "Excelente" };

/** O nome de uma pergunta não tocada. */
export const NOME_SEM_NIVEL = "—";

/** O texto livre do questionário ("Quer dizer mais alguma coisa?"): até 1000 caracteres. */
export const TEXTO_QUESTIONARIO_MAXIMO = 1000;

export const ehPerguntaLicao = (valor: unknown): valor is PerguntaLicao => (IDS_PERGUNTAS_LICAO as readonly unknown[]).includes(valor);
export const ehNivelLicao = (valor: unknown): valor is NivelLicao => (NIVEIS_LICAO as readonly unknown[]).includes(valor);

/** As notas de um questionário: só as perguntas tocadas. */
export type NotasLicao = Partial<Record<PerguntaLicao, NivelLicao>>;

/** O questionário conferido (validarQuestionario). */
export interface QuestionarioEnviado {
	/** Pelo menos uma; na ordem de PERGUNTAS_LICAO. */
	notas: NotasLicao;
	/** Aparado; pode ser vazio. */
	texto: string;
}

/** O último questionário de uma lição, no campo questionarios do <módulo>.json. */
export interface QuestionarioLicao extends QuestionarioEnviado {
	/** ISO 8601. */
	em: string;
	/** O id do evento avaliou_licao. */
	evento: string;
}

/** O campo questionarios do <módulo>.json: pelo id da lição. */
export type QuestionariosModulo = Record<string, QuestionarioLicao>;

// --- Funções -------------------------------------------------------------------------

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));

/**
 * A nota que vale para o bloco: a gravada com a versão atual do bloco
 * (versaoDoBloco) e uma avaliação nova. A de uma versão antiga (o bloco foi
 * reescrito depois) ou fora do formato, undefined: o bloco está sem nota.
 */
export function feedbackDoBloco(feedback: Readonly<Record<string, unknown>> | null | undefined, bloco: Pick<Bloco, "id" | "versao">): FeedbackBloco | undefined {
	if (!ehObjeto(feedback)) return undefined;
	const gravado = feedback[bloco.id];
	if (!ehObjeto(gravado) || !ehAvaliacaoBloco(gravado.avaliacao) || gravado.versao !== versaoDoBloco(bloco)) return undefined;
	return gravado as unknown as FeedbackBloco;
}

/** O último questionário enviado da lição; sem nenhum (ou fora do formato), undefined. */
export function questionarioDaLicao(questionarios: Readonly<Record<string, unknown>> | null | undefined, licao: string): QuestionarioLicao | undefined {
	if (!ehObjeto(questionarios)) return undefined;
	const gravado = questionarios[licao];
	if (!ehObjeto(gravado) || !ehObjeto(gravado.notas)) return undefined;
	return gravado as unknown as QuestionarioLicao;
}

/**
 * Confere o questionário que a tela mandou: as notas (um objeto pelo id da
 * pergunta) só dos ids conhecidos, cada uma um inteiro de 1 a 5, pelo menos
 * uma; o texto (opcional) aparado, até 1000 caracteres. Devolve as notas na
 * ordem das perguntas. Fora disso, ErroModulo.
 */
export function validarQuestionario(entrada: unknown): QuestionarioEnviado {
	if (!ehObjeto(entrada) || !ehObjeto(entrada.notas)) throw new ErroModulo("As notas do questionário não vieram no formato (um objeto pelo id da pergunta).");
	const recebidas = entrada.notas;
	for (const [id, nota] of Object.entries(recebidas)) {
		if (!ehPerguntaLicao(id)) throw new ErroModulo(`Pergunta do questionário desconhecida ("${id}").`);
		if (!ehNivelLicao(nota)) throw new ErroModulo(`A nota de "${id}" não é válida ("${mostrar(nota)}"): é um inteiro de 1 a 5.`);
	}
	const notas: NotasLicao = {};
	for (const id of IDS_PERGUNTAS_LICAO) if (recebidas[id] !== undefined) notas[id] = recebidas[id] as NivelLicao;
	if (Object.keys(notas).length === 0) throw new ErroModulo("Responda pelo menos uma pergunta do questionário.");
	if (entrada.texto !== undefined && entrada.texto !== null && typeof entrada.texto !== "string") throw new ErroModulo("O texto do questionário não é um texto.");
	const texto = typeof entrada.texto === "string" ? entrada.texto.trim() : "";
	if (texto.length > TEXTO_QUESTIONARIO_MAXIMO) throw new ErroModulo(`O texto do questionário tem ${texto.length} caracteres; o máximo é ${TEXTO_QUESTIONARIO_MAXIMO}.`);
	return { notas, texto };
}

/** Uma linha do resumo do questionário enviado. */
export interface ItemResumoQuestionario {
	pergunta: PerguntaLicao;
	/** O texto da pergunta. */
	texto: string;
	nota: NivelLicao;
	/** O nome do nível (NOMES_NIVEL). */
	nome: string;
}

/** O resumo do questionário enviado ("Respostas enviadas em dd/mm"): as perguntas respondidas, na ordem, com a nota e o nome do nível. */
export function resumoDoQuestionario(questionario: Pick<QuestionarioEnviado, "notas">): ItemResumoQuestionario[] {
	return PERGUNTAS_LICAO.flatMap((pergunta) => {
		const nota = questionario.notas[pergunta.id];
		return ehNivelLicao(nota) ? [{ pergunta: pergunta.id, texto: pergunta.texto, nota, nome: NOMES_NIVEL[nota] }] : [];
	});
}

/** O módulo gerado e a lição (e o bloco); senão, ErroModulo. */
function lugarNoModulo(modulo: Modulo, licao: unknown, bloco?: unknown): { licao: Licao; bloco?: Bloco } {
	if (modulo.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo.id} está aguardando material; não há o que avaliar.`);
	const daLicao = modulo.licoes.find((item) => item.id === licao);
	if (!daLicao) throw new ErroModulo(`Não achei a lição "${mostrar(licao)}" no módulo ${modulo.id}.`);
	if (bloco === undefined) return { licao: daLicao };
	const doBloco = daLicao.blocos.find((item) => item.id === bloco);
	if (!doBloco) throw new ErroModulo(`Não achei o bloco "${mostrar(bloco)}" na lição ${daLicao.id}.`);
	return { licao: daLicao, bloco: doBloco };
}

/**
 * Grava a nota de um bloco no módulo: feedback[bloco] = {avaliacao, versao
 * (a atual do bloco), em, evento}, no lugar da anterior. Devolve o módulo
 * novo; o recebido não muda. Avaliação que não é nova, módulo que não está
 * gerado, lição ou bloco que não existe, ErroModulo.
 */
export function aplicarFeedback(modulo: Modulo, licao: unknown, bloco: unknown, nota: { avaliacao: unknown; evento: string; agora?: Date }): ModuloGerado {
	if (!ehAvaliacaoBloco(nota.avaliacao)) throw new ErroModulo(`A avaliação do bloco não é válida ("${mostrar(nota.avaliacao)}"): é ruim, bom ou otimo.`);
	const lugar = lugarNoModulo(modulo, licao, bloco);
	const copia = structuredClone(modulo) as ModuloGerado;
	const em = (nota.agora ?? new Date()).toISOString();
	copia.feedback = { ...copia.feedback, [lugar.bloco!.id]: { avaliacao: nota.avaliacao, versao: versaoDoBloco(lugar.bloco!), em, evento: nota.evento } };
	return copia;
}

/**
 * Grava o questionário de uma lição no módulo (já conferido por
 * validarQuestionario): questionarios[licao] = {notas, texto, em, evento},
 * no lugar do anterior. Devolve o módulo novo; o recebido não muda. Módulo
 * que não está gerado ou lição que não existe, ErroModulo.
 */
export function aplicarQuestionario(modulo: Modulo, licao: unknown, questionario: QuestionarioEnviado & { evento: string; agora?: Date }): ModuloGerado {
	const lugar = lugarNoModulo(modulo, licao);
	const copia = structuredClone(modulo) as ModuloGerado;
	const em = (questionario.agora ?? new Date()).toISOString();
	copia.questionarios = { ...copia.questionarios, [lugar.licao.id]: { notas: { ...questionario.notas }, texto: questionario.texto, em, evento: questionario.evento } };
	return copia;
}
