// Tipos das hipóteses do perfil do aprendiz (item 9, parte B; docs/aprendiz.md, seção 8): a camada 3
// da memória. Sem nada do Node: a tela (profiles/estudos/paineis) importa daqui. No fim do arquivo estão
// as funções puras (confiança, validação das propostas da reflexão, aplicar, decidir, editar, expirar,
// conflito e a leitura tolerante do arquivo); todas recebem o `agora` e os eventos como parâmetro e
// devolvem dados novos, sem mexer no que receberam. Cada hipótese cita ids de eventos (camada 1); nada
// vira aprovado nem muda uma hipótese aprovada sem a decisão do Breno (`decidir`, `editar`).

import type { Evento } from "./eventos.ts";

/** Muda quando o formato do hipoteses.json mudar. */
export const VERSAO_HIPOTESES = 1;

export const TIPOS_HIPOTESE = ["conhecimento", "misconception", "vocabulario", "preferencia_de_forma", "ritmo", "metacognicao"] as const;
export type TipoHipotese = (typeof TIPOS_HIPOTESE)[number];

export type EscopoHipotese =
	| { nivel: "global" }
	| { nivel: "materia"; materia: string }
	| { nivel: "conceito"; materia: string; conceitos: string[] };

/** proposta: esperando a decisão; aprovada e rejeitada: o Breno decidiu; expirada: sem confirmação recente. */
export type StatusHipotese = "proposta" | "aprovada" | "rejeitada" | "expirada";

export type ConfiancaHipotese = "baixa" | "media" | "alta";

/** Uma versão anterior da hipótese (cada mudança vira uma versão nova; nada é sobrescrito em silêncio). */
export interface VersaoAnterior {
	versao: number;
	enunciado: string;
	status: StatusHipotese;
	ts: string;
}

export interface Hipotese {
	/** h-<id ordenável>. */
	id: string;
	tipo: TipoHipotese;
	escopo: EscopoHipotese;
	enunciado: string;
	/** Os ids dos eventos (camada 1) que sustentam e que contrariam. */
	aFavor: string[];
	contra: string[];
	/** Calculada pelo código (confiancaDe), nunca pelo modelo. */
	confianca: ConfiancaHipotese;
	criadaEm: string;
	ultimaConfirmacao: string;
	/** O dia (ISO) depois do qual, sem confirmação, a hipótese expira. */
	validade: string;
	status: StatusHipotese;
	/** true só depois que o Breno aprovou (ou editou e aprovou). */
	aprovadaPeloUsuario: boolean;
	/** 1 na criação; cresce a cada mudança. */
	versao: number;
	anteriores: VersaoAnterior[];
	/** O id da reflexão que a propôs (ausente se o Breno a escreveu à mão). */
	reflexao?: string;
}

/** reforcar e enfraquecer acrescentam evidências; expirar propõe encerrar a hipótese. */
export type AcaoDeMudanca = "reforcar" | "enfraquecer" | "expirar";

/** Uma mudança proposta numa hipótese que já existe, esperando a decisão do Breno. */
export interface MudancaPendente {
	/** m-<id ordenável>. */
	id: string;
	hipotese: string;
	acao: AcaoDeMudanca;
	/** Os ids de eventos novos (que a hipótese ainda não cita). */
	evidencias: string[];
	motivo: string;
	reflexao: string;
	criadaEm: string;
}

/** O que a última reflexão fez (também gravado no evento `refletiu`). */
export interface ResumoDaReflexao {
	/** r-<id ordenável>. */
	id: string;
	ts: string;
	/** O que a disparou: o botão, o módulo concluído ou o questionário de fim de lição. */
	motivo: "botao" | "modulo" | "licao";
	/** O id do último evento de aprendizagem que ela leu (a próxima começa depois dele). */
	ultimoEvento?: string;
	lidos: number;
	/** Quantas propostas o modelo fez, quantas o código aceitou e quantas descartou (com o porquê em `descartadas`). */
	propostas: number;
	aceitas: number;
	descartadas: { motivo: string; quantas: number }[];
	/** O custo da chamada, em dólares. */
	custo?: number;
}

/** O arquivo aprendiz/hipoteses.json (gravado inteiro e legível). */
export interface ArquivoHipoteses {
	versao: number;
	hipoteses: Hipotese[];
	mudancas: MudancaPendente[];
	ultimaReflexao?: ResumoDaReflexao;
}

/** O que a tela recebe da ponte. */
export interface EstadoHipoteses {
	hipoteses: Hipotese[];
	mudancas: MudancaPendente[];
	ultimaReflexao?: ResumoDaReflexao;
	/** Há uma reflexão rodando agora. */
	refletindo: boolean;
}

/** Um evento da camada 1 como a aba Histórico mostra (o texto livre vem cortado). */
export type EventoDoHistorico = Pick<Evento, "id" | "ts" | "sessao" | "verbo" | "objeto" | "resultado">;

// --- A ponte (painel PAINEL_APRENDIZ, constante em aprendiz-indicadores-tipos.ts; tudo gravar: false) ---
//
// tela -> extensão (ação):
//   hipoteses {}                                  -> hipoteses { estado: EstadoHipoteses }
//   historico { materia?: string }                -> historico { eventos: EventoDoHistorico[] }   (os mais novos primeiro, até LIMITE_HISTORICO)
//   refletir { pedido }                           -> refletindo { pedido } e, no fim, refletiu { pedido, resumo: ResumoDaReflexao, estado }
//   decidir { pedido, alvo: "hipotese" | "mudanca", id, decisao: "aprovar" | "rejeitar", enunciado? }   -> decidida { pedido, estado }
//   editar { pedido, id, enunciado?, status?: "aprovada" | "rejeitada" }                               -> decidida { pedido, estado }
// Qualquer falha: erro { pedido?, ao, mensagem }. A extensão também manda `hipoteses` { estado } sozinha quando uma
// reflexão disparada por módulo ou lição termina (sem pedido), para a tela aberta se atualizar.

export const LIMITE_HISTORICO = 500;

/** Até quantos caracteres do texto livre de um evento o histórico leva. */
export const LIMITE_TEXTO_DO_HISTORICO = 600;


// --- As funções puras (WP1 da parte B) ----------------------------------------------------------------

const MS_POR_DIA = 86_400_000;

/** Quantos dias vale uma hipótese depois da última confirmação (aprovar, reforçar e editar o status confirmam). */
export const VALIDADE_DIAS = 60;

/** A janela "recente" da regra do conflito: evidências dos últimos 60 dias (pelo ts dos eventos). */
export const JANELA_DO_CONFLITO_DIAS = 60;

/** O enunciado de uma hipótese: de 12 a 300 caracteres (depois de aparado e com os espaços juntados). */
export const ENUNCIADO_MINIMO = 12;
export const ENUNCIADO_MAXIMO = 300;

/** Para criar: pelo menos 2 eventos, de pelo menos 2 sessões diferentes (um sinal isolado é evidência fraca). */
export const EVIDENCIAS_MINIMAS_PARA_CRIAR = 2;
export const SESSOES_MINIMAS_PARA_CRIAR = 2;

/** O motivo que o modelo dá é cortado neste tamanho. */
export const MOTIVO_MAXIMO = 400;

/** Rótulos e elogios proibidos nos enunciados (comparados sem acento, sem caixa e sem pontuação, como palavras inteiras). */
export const FRASES_PROIBIDAS = [
	"aprendiz visual",
	"aprendiz auditivo",
	"aprendiz cinestésico",
	"aprendizes visuais",
	"aprendizes auditivos",
	"estilo de aprendizagem",
	"estilos de aprendizagem",
	"excelente aluno",
	"ótimo aluno",
	"muito bom",
	"parabéns",
] as const;

/** Os verbos dos eventos de hipótese: nenhum deles pode ser citado como evidência nem é lido como observação. */
export const VERBOS_DE_HIPOTESE = [
	"refletiu",
	"propos_hipotese",
	"propos_mudanca_hipotese",
	"aprovou_hipotese",
	"rejeitou_hipotese",
	"aprovou_mudanca_hipotese",
	"rejeitou_mudanca_hipotese",
	"editou_hipotese",
	"expirou_hipotese",
] as const;

/** O que a confiança, a validação e o conflito precisam de um evento citado como evidência. */
export type EventoDeEvidencia = Pick<Evento, "id" | "ts" | "sessao" | "verbo">;

/** Indexa os eventos por id (o `eventosPorId` de todas as funções daqui). */
export function indexarEventos(eventos: Iterable<EventoDeEvidencia>): Map<string, EventoDeEvidencia> {
	const mapa = new Map<string, EventoDeEvidencia>();
	for (const evento of eventos) mapa.set(evento.id, evento);
	return mapa;
}

/** Erro de uma operação sobre as hipóteses (a frase é para o Breno ver). */
export class ErroHipoteses extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroHipoteses";
	}
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const ehTexto = (valor: unknown): valor is string => typeof valor === "string" && valor.trim() !== "";
const listaDeTextos = (valor: unknown): string[] | undefined => (Array.isArray(valor) && valor.every((item) => typeof item === "string") ? (valor as string[]) : undefined);
const unicos = <T>(lista: readonly T[]): T[] => [...new Set(lista)];
const emDias = (de: Date, dias: number) => new Date(de.getTime() + dias * MS_POR_DIA).toISOString();
const juntarEspacos = (texto: string) => texto.replace(/\s+/gu, " ").trim();
const ehEventoDeHipotese = (verbo: string) => (VERBOS_DE_HIPOTESE as readonly string[]).includes(verbo);

/** O texto sem acento, sem caixa, sem pontuação e com um espaço entre as palavras (para comparar enunciados e achar rótulos). */
export function normalizarTexto(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/\p{M}+/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

const FRASES_PROIBIDAS_NORMALIZADAS = FRASES_PROIBIDAS.map((frase) => ` ${normalizarTexto(frase)} `);

/** Os conceitos de um escopo (vazio se não for de conceito). */
export const conceitosDoEscopo = (escopo: EscopoHipotese): string[] => (escopo.nivel === "conceito" ? [...escopo.conceitos] : []);
/** A matéria de um escopo (undefined se for global). */
export const materiaDoEscopo = (escopo: EscopoHipotese): string | undefined => (escopo.nivel === "global" ? undefined : escopo.materia);

// --- Confiança -----------------------------------------------------------------------------------------

/**
 * A confiança (do código, nunca do modelo) pelas evidências a favor: baixa com menos de 3 eventos ou
 * eventos de uma sessão só; média com 3 ou mais eventos em 2 ou mais sessões; alta com 5 ou mais eventos
 * em 3 ou mais sessões. A sessão vem do evento; id que não existe (e evento de hipótese) não conta, e
 * evento sem sessão conta como evento mas não acrescenta sessão.
 */
export function confiancaDe(aFavor: readonly string[], eventosPorId: ReadonlyMap<string, EventoDeEvidencia>): ConfiancaHipotese {
	const sessoes = new Set<string>();
	let eventos = 0;
	for (const id of unicos(aFavor)) {
		const evento = eventosPorId.get(id);
		// O que o Breno DISSE de si (autoavaliou_conceito) não é evidência do que ele faz: não conta na confiança.
		if (!evento || ehEventoDeHipotese(evento.verbo) || evento.verbo === "autoavaliou_conceito") continue;
		eventos++;
		if (typeof evento.sessao === "string" && evento.sessao !== "") sessoes.add(evento.sessao);
	}
	if (eventos >= 5 && sessoes.size >= 3) return "alta";
	if (eventos >= 3 && sessoes.size >= 2) return "media";
	return "baixa";
}

// --- Validar a proposta do modelo ----------------------------------------------------------------------

export type AcaoDeProposta = "criar" | AcaoDeMudanca;

/** O que o modelo devolve em cada proposta (o código não confia nele: validarProposta confere tudo). */
export interface PropostaDoModelo {
	acao: AcaoDeProposta;
	/** Reforçar, enfraquecer e expirar: o id da hipótese. */
	hipotese?: string;
	/** Criar. */
	tipo?: string;
	escopo?: unknown;
	enunciado?: string;
	evidencias: string[];
	motivo: string;
}

export interface PropostaDeCriar {
	acao: "criar";
	tipo: TipoHipotese;
	escopo: EscopoHipotese;
	enunciado: string;
	evidencias: string[];
	motivo: string;
}

export interface PropostaDeMudanca {
	acao: AcaoDeMudanca;
	hipotese: string;
	evidencias: string[];
	motivo: string;
}

/** Uma proposta que passou na validação, já normalizada. */
export type PropostaValida = PropostaDeCriar | PropostaDeMudanca;

/** Um motivo por tipo de descarte (o que o `descartadas` do resumo agrupa). */
export const MOTIVOS_DE_DESCARTE = {
	formatoInvalido: "formato_invalido",
	acaoDesconhecida: "acao_desconhecida",
	tipoInvalido: "tipo_invalido",
	escopoInvalido: "escopo_invalido",
	materiaInexistente: "materia_inexistente",
	conceitoInexistente: "conceito_inexistente",
	enunciadoForaDoTamanho: "enunciado_fora_do_tamanho",
	enunciadoGenerico: "enunciado_generico",
	enunciadoRepetido: "enunciado_repetido",
	semEvidencia: "sem_evidencia",
	evidenciaInexistente: "evidencia_inexistente",
	evidenciaDeEventoDeHipotese: "evidencia_de_evento_de_hipotese",
	evidenciaForaDaJanela: "evidencia_fora_da_janela",
	evidenciaInsuficiente: "evidencia_insuficiente",
	evidenciaDeUmaSessao: "evidencia_de_uma_sessao",
	evidenciaJaCitada: "evidencia_ja_citada",
	hipoteseInexistente: "hipotese_inexistente",
	hipoteseRejeitada: "hipotese_rejeitada",
	hipoteseNaoExpira: "hipotese_nao_pode_expirar",
	semMotivo: "sem_motivo",
	mudancaRepetida: "mudanca_repetida",
} as const;
export type MotivoDeDescarte = (typeof MOTIVOS_DE_DESCARTE)[keyof typeof MOTIVOS_DE_DESCARTE];

/** O que a validação precisa saber do mundo. */
export interface ContextoValidacao {
	eventosPorId: ReadonlyMap<string, EventoDeEvidencia>;
	/** Os ids dos eventos que a reflexão leu (a evidência de uma criação precisa estar aqui). */
	janela: ReadonlySet<string> | readonly string[];
	/** As hipóteses que existem, em qualquer status. */
	hipoteses: readonly Hipotese[];
	/** As matérias que existem e, de cada uma, os ids dos conceitos do mapa. */
	materias: ReadonlyMap<string, ReadonlySet<string>>;
	/** As mudanças ainda pendentes (as evidências delas contam como já citadas). Opcional. */
	mudancas?: readonly Pick<MudancaPendente, "hipotese" | "acao" | "evidencias">[];
	/** Enunciados a tratar como já existentes (as criações aceitas antes, num mesmo lote). Opcional. */
	enunciadosExtras?: readonly string[];
}

export type ResultadoValidacao = { ok: true; proposta: PropostaValida } | { ok: false; motivo: MotivoDeDescarte };

const recusa = (motivo: MotivoDeDescarte): ResultadoValidacao => ({ ok: false, motivo });

/**
 * Confere o texto de um enunciado (criar, editar e aprovar com edição usam as mesmas regras): é texto, tem
 * de 12 a 300 caracteres e não traz rótulo nem elogio proibido. Devolve o texto aparado e com os espaços juntados.
 */
export function conferirEnunciado(valor: unknown): { ok: true; texto: string } | { ok: false; motivo: MotivoDeDescarte } {
	if (typeof valor !== "string") return { ok: false, motivo: MOTIVOS_DE_DESCARTE.formatoInvalido };
	const texto = juntarEspacos(valor);
	if (texto.length < ENUNCIADO_MINIMO || texto.length > ENUNCIADO_MAXIMO) return { ok: false, motivo: MOTIVOS_DE_DESCARTE.enunciadoForaDoTamanho };
	const normal = ` ${normalizarTexto(texto)} `;
	if (FRASES_PROIBIDAS_NORMALIZADAS.some((frase) => normal.includes(frase))) return { ok: false, motivo: MOTIVOS_DE_DESCARTE.enunciadoGenerico };
	return { ok: true, texto };
}

const MENSAGEM_DO_MOTIVO: Record<MotivoDeDescarte, string> = {
	formato_invalido: "formato inválido",
	acao_desconhecida: "ação desconhecida",
	tipo_invalido: "tipo inválido",
	escopo_invalido: "escopo inválido",
	materia_inexistente: "a matéria não existe",
	conceito_inexistente: "o conceito não existe",
	enunciado_fora_do_tamanho: `o enunciado precisa ter de ${ENUNCIADO_MINIMO} a ${ENUNCIADO_MAXIMO} caracteres`,
	enunciado_generico: "o enunciado traz um rótulo ou elogio genérico (como \"aprendiz visual\" ou \"muito bom\")",
	enunciado_repetido: "já existe uma hipótese com esse enunciado",
	sem_evidencia: "sem evidência",
	evidencia_inexistente: "a evidência cita um evento que não existe",
	evidencia_de_evento_de_hipotese: "a evidência é um evento de hipótese",
	evidencia_fora_da_janela: "a evidência não está nos eventos lidos",
	evidencia_insuficiente: `são precisos pelo menos ${EVIDENCIAS_MINIMAS_PARA_CRIAR} eventos`,
	evidencia_de_uma_sessao: `os eventos precisam ser de pelo menos ${SESSOES_MINIMAS_PARA_CRIAR} sessões diferentes`,
	evidencia_ja_citada: "a hipótese já cita essas evidências",
	hipotese_inexistente: "a hipótese não existe",
	hipotese_rejeitada: "a hipótese foi rejeitada",
	hipotese_nao_pode_expirar: "só uma hipótese aprovada ou proposta pode expirar",
	sem_motivo: "falta o motivo",
	mudanca_repetida: "já há uma mudança igual esperando decisão",
};

/** A frase de um motivo de descarte, para a mensagem de erro de quem edita à mão. */
export const mensagemDoMotivo = (motivo: MotivoDeDescarte): string => MENSAGEM_DO_MOTIVO[motivo];

const ACOES: Record<string, AcaoDeProposta> = { criar: "criar", reforcar: "reforcar", enfraquecer: "enfraquecer", expirar: "expirar" };

function lerTipo(valor: unknown): TipoHipotese | undefined {
	if (typeof valor !== "string") return undefined;
	const chave = normalizarTexto(valor).replace(/ /gu, "_");
	return (TIPOS_HIPOTESE as readonly string[]).includes(chave) ? (chave as TipoHipotese) : undefined;
}

/** O escopo que o modelo escreveu, conferido com as matérias e os conceitos que existem. */
function lerEscopoDoModelo(valor: unknown, materias: ReadonlyMap<string, ReadonlySet<string>>): { escopo: EscopoHipotese } | { motivo: MotivoDeDescarte } {
	if (valor === "global") return { escopo: { nivel: "global" } };
	if (!ehObjeto(valor) || typeof valor.nivel !== "string") return { motivo: MOTIVOS_DE_DESCARTE.escopoInvalido };
	const nivel = normalizarTexto(valor.nivel);
	if (nivel === "global") return { escopo: { nivel: "global" } };
	if (nivel !== "materia" && nivel !== "conceito") return { motivo: MOTIVOS_DE_DESCARTE.escopoInvalido };
	if (!ehTexto(valor.materia)) return { motivo: MOTIVOS_DE_DESCARTE.escopoInvalido };
	const materia = valor.materia.trim();
	const conceitosDaMateria = materias.get(materia);
	if (!conceitosDaMateria) return { motivo: MOTIVOS_DE_DESCARTE.materiaInexistente };
	if (nivel === "materia") return { escopo: { nivel: "materia", materia } };
	const conceitos = listaDeTextos(valor.conceitos)?.map((id) => id.trim()).filter(Boolean);
	if (!conceitos || conceitos.length === 0) return { motivo: MOTIVOS_DE_DESCARTE.escopoInvalido };
	const ids = unicos(conceitos);
	if (ids.some((id) => !conceitosDaMateria.has(id))) return { motivo: MOTIVOS_DE_DESCARTE.conceitoInexistente };
	return { escopo: { nivel: "conceito", materia, conceitos: ids } };
}

/** Os ids de evidência: texto, sem repetição; todos existem e nenhum é evento de hipótese. */
function lerEvidencias(valor: unknown, contexto: ContextoValidacao): { ids: string[] } | { motivo: MotivoDeDescarte } {
	if (valor === undefined) return { ids: [] };
	const lista = listaDeTextos(valor);
	if (!lista) return { motivo: MOTIVOS_DE_DESCARTE.formatoInvalido };
	const ids = unicos(lista.map((id) => id.trim()).filter(Boolean));
	if (ids.some((id) => !contexto.eventosPorId.has(id))) return { motivo: MOTIVOS_DE_DESCARTE.evidenciaInexistente };
	if (ids.some((id) => ehEventoDeHipotese(contexto.eventosPorId.get(id)!.verbo))) return { motivo: MOTIVOS_DE_DESCARTE.evidenciaDeEventoDeHipotese };
	return { ids };
}

/**
 * Valida uma proposta do modelo (a entrada é `unknown`: o modelo erra). Devolve a proposta normalizada ou o
 * motivo do descarte (uma das MOTIVOS_DE_DESCARTE, curto e agrupável).
 * - criar: enunciado de 12 a 300 caracteres sem rótulo nem elogio proibido; tipo e escopo válidos (matéria e
 *   conceitos que existem); pelo menos 2 ids que existem, estão na janela lida e são de pelo menos 2 sessões
 *   diferentes; e o enunciado (texto normalizado) não repete o de nenhuma hipótese existente, de qualquer status.
 * - reforçar e enfraquecer: a hipótese existe e não está rejeitada; as evidências existem e a hipótese ainda não
 *   as cita (as já citadas saem da lista; se não sobrar nenhuma, descarta).
 * - expirar: hipótese aprovada ou proposta, com o motivo.
 */
export function validarProposta(proposta: unknown, contexto: ContextoValidacao): ResultadoValidacao {
	if (!ehObjeto(proposta)) return recusa(MOTIVOS_DE_DESCARTE.formatoInvalido);
	if (typeof proposta.acao !== "string") return recusa(MOTIVOS_DE_DESCARTE.acaoDesconhecida);
	const acao = ACOES[normalizarTexto(proposta.acao)];
	if (!acao) return recusa(MOTIVOS_DE_DESCARTE.acaoDesconhecida);
	const motivo = typeof proposta.motivo === "string" ? juntarEspacos(proposta.motivo).slice(0, MOTIVO_MAXIMO) : "";
	if (acao === "criar") {
		const enunciado = conferirEnunciado(proposta.enunciado);
		if (!enunciado.ok) return recusa(enunciado.motivo);
		const tipo = lerTipo(proposta.tipo);
		if (!tipo) return recusa(MOTIVOS_DE_DESCARTE.tipoInvalido);
		const escopo = lerEscopoDoModelo(proposta.escopo, contexto.materias);
		if ("motivo" in escopo) return recusa(escopo.motivo);
		const normal = normalizarTexto(enunciado.texto);
		const existentes = [...contexto.hipoteses.map((hipotese) => hipotese.enunciado), ...(contexto.enunciadosExtras ?? [])];
		if (existentes.some((texto) => normalizarTexto(texto) === normal)) return recusa(MOTIVOS_DE_DESCARTE.enunciadoRepetido);

		const evidencias = lerEvidencias(proposta.evidencias, contexto);
		if ("motivo" in evidencias) return recusa(evidencias.motivo);
		const janela = contexto.janela instanceof Set ? contexto.janela : new Set(contexto.janela);
		if (evidencias.ids.some((id) => !janela.has(id))) return recusa(MOTIVOS_DE_DESCARTE.evidenciaForaDaJanela);
		if (evidencias.ids.length < EVIDENCIAS_MINIMAS_PARA_CRIAR) return recusa(evidencias.ids.length === 0 ? MOTIVOS_DE_DESCARTE.semEvidencia : MOTIVOS_DE_DESCARTE.evidenciaInsuficiente);
		const sessoes = new Set<string>();
		for (const id of evidencias.ids) {
			const sessao = contexto.eventosPorId.get(id)!.sessao;
			if (typeof sessao === "string" && sessao !== "") sessoes.add(sessao);
		}
		if (sessoes.size < SESSOES_MINIMAS_PARA_CRIAR) return recusa(MOTIVOS_DE_DESCARTE.evidenciaDeUmaSessao);
		return { ok: true, proposta: { acao: "criar", tipo, escopo: escopo.escopo, enunciado: enunciado.texto, evidencias: evidencias.ids, motivo } };
	}

	const idDaHipotese = typeof proposta.hipotese === "string" ? proposta.hipotese.trim() : "";
	const alvo = contexto.hipoteses.find((hipotese) => hipotese.id === idDaHipotese);
	if (!alvo) return recusa(MOTIVOS_DE_DESCARTE.hipoteseInexistente);
	if (alvo.status === "rejeitada") return recusa(MOTIVOS_DE_DESCARTE.hipoteseRejeitada);
	const pendentes = (contexto.mudancas ?? []).filter((mudanca) => mudanca.hipotese === alvo.id);

	if (acao === "expirar") {
		if (alvo.status !== "aprovada" && alvo.status !== "proposta") return recusa(MOTIVOS_DE_DESCARTE.hipoteseNaoExpira);
		if (motivo === "") return recusa(MOTIVOS_DE_DESCARTE.semMotivo);
		if (pendentes.some((mudanca) => mudanca.acao === "expirar")) return recusa(MOTIVOS_DE_DESCARTE.mudancaRepetida);
		const evidencias = lerEvidencias(proposta.evidencias, contexto);
		if ("motivo" in evidencias) return recusa(evidencias.motivo);
		return { ok: true, proposta: { acao: "expirar", hipotese: alvo.id, evidencias: evidencias.ids, motivo } };
	}

	const evidencias = lerEvidencias(proposta.evidencias, contexto);
	if ("motivo" in evidencias) return recusa(evidencias.motivo);
	if (evidencias.ids.length === 0) return recusa(MOTIVOS_DE_DESCARTE.semEvidencia);
	const citadas = new Set([...alvo.aFavor, ...alvo.contra, ...pendentes.filter((mudanca) => mudanca.acao !== "expirar").flatMap((mudanca) => mudanca.evidencias)]);
	const novas = evidencias.ids.filter((id) => !citadas.has(id));
	if (novas.length === 0) return recusa(MOTIVOS_DE_DESCARTE.evidenciaJaCitada);
	return { ok: true, proposta: { acao, hipotese: alvo.id, evidencias: novas, motivo } };
}

/**
 * Valida o lote inteiro que o modelo devolveu (`unknown`: se não for uma lista, tudo se perde numa linha de
 * formato_invalido). Uma criação aceita conta como já existente para as seguintes (um enunciado repetido no mesmo
 * lote é descartado) e uma mudança aceita conta como pendente para as seguintes. As descartadas voltam agrupadas
 * por motivo, na ordem em que cada motivo apareceu, prontas para o `descartadas` do ResumoDaReflexao.
 */
export function validarPropostas(propostas: unknown, contexto: ContextoValidacao): { validas: PropostaValida[]; descartadas: { motivo: string; quantas: number }[] } {
	if (!Array.isArray(propostas)) return { validas: [], descartadas: [{ motivo: MOTIVOS_DE_DESCARTE.formatoInvalido, quantas: 1 }] };
	const validas: PropostaValida[] = [];
	const contagem = new Map<string, number>();
	const enunciadosExtras = [...(contexto.enunciadosExtras ?? [])];
	const mudancas = [...(contexto.mudancas ?? [])];
	for (const proposta of propostas) {
		const resultado = validarProposta(proposta, { ...contexto, enunciadosExtras, mudancas });
		if (!resultado.ok) {
			contagem.set(resultado.motivo, (contagem.get(resultado.motivo) ?? 0) + 1);
			continue;
		}
		validas.push(resultado.proposta);
		if (resultado.proposta.acao === "criar") enunciadosExtras.push(resultado.proposta.enunciado);
		else mudancas.push({ hipotese: resultado.proposta.hipotese, acao: resultado.proposta.acao, evidencias: resultado.proposta.evidencias });
	}
	return { validas, descartadas: [...contagem].map(([motivo, quantas]) => ({ motivo, quantas })) };
}

// --- Aplicar a reflexão --------------------------------------------------------------------------------

export interface OpcoesAplicarReflexao {
	/** O id da reflexão (r-...), gravado nas hipóteses criadas e nas mudanças. */
	reflexao: string;
	agora: Date;
	/** Dá um id ordenável novo e único (o prefixo h- ou m- é posto aqui). */
	novoId: () => string;
	/** Para calcular a confiança das hipóteses criadas. */
	eventosPorId: ReadonlyMap<string, EventoDeEvidencia>;
}

export interface ReflexaoAplicada {
	arquivo: ArquivoHipoteses;
	/** As hipóteses novas (status "proposta"). */
	criadas: Hipotese[];
	/** As mudanças que ficaram esperando a decisão. */
	mudancas: MudancaPendente[];
}

/**
 * Aplica as propostas válidas de uma reflexão. Criar vira uma hipótese nova com status "proposta" (não aprovada,
 * versão 1, confiança calculada, validade de 60 dias, última confirmação = criação, a reflexão que a propôs); reforçar,
 * enfraquecer e expirar viram uma MudancaPendente. NADA vira "aprovada" aqui e nenhuma hipótese que já existe é
 * mexida: só o Breno decide (`decidir`). Proposta de mudança numa hipótese que não existe, ou sem evidência nova
 * para acrescentar, é ignorada (a validação já a teria descartado).
 */
export function aplicarReflexao(arquivo: ArquivoHipoteses, propostas: readonly PropostaValida[], opcoes: OpcoesAplicarReflexao): ReflexaoAplicada {
	const quando = opcoes.agora.toISOString();
	const criadas: Hipotese[] = [];
	const mudancas: MudancaPendente[] = [];
	for (const proposta of propostas) {
		if (proposta.acao === "criar") {
			criadas.push({
				id: `h-${opcoes.novoId()}`,
				tipo: proposta.tipo,
				escopo: proposta.escopo,
				enunciado: proposta.enunciado,
				aFavor: [...proposta.evidencias],
				contra: [],
				confianca: confiancaDe(proposta.evidencias, opcoes.eventosPorId),
				criadaEm: quando,
				ultimaConfirmacao: quando,
				validade: emDias(opcoes.agora, VALIDADE_DIAS),
				status: "proposta",
				aprovadaPeloUsuario: false,
				versao: 1,
				anteriores: [],
				reflexao: opcoes.reflexao,
			});
			continue;
		}
		const alvo = arquivo.hipoteses.find((hipotese) => hipotese.id === proposta.hipotese);
		if (!alvo) continue;
		const citadas = new Set([...alvo.aFavor, ...alvo.contra]);
		const evidencias = proposta.acao === "expirar" ? [...proposta.evidencias] : proposta.evidencias.filter((id) => !citadas.has(id));
		if (proposta.acao !== "expirar" && evidencias.length === 0) continue;
		mudancas.push({ id: `m-${opcoes.novoId()}`, hipotese: alvo.id, acao: proposta.acao, evidencias, motivo: proposta.motivo, reflexao: opcoes.reflexao, criadaEm: quando });
	}
	return { arquivo: { ...arquivo, hipoteses: [...arquivo.hipoteses, ...criadas], mudancas: [...arquivo.mudancas, ...mudancas] }, criadas, mudancas };
}

// --- Conflito, versões e expirar -----------------------------------------------------------------------

/**
 * A regra do conflito: nas evidências recentes (eventos dos últimos 60 dias, pelo ts), as contra superam as a
 * favor? Evento que não se acha em `eventosPorId` não conta.
 */
export function conflitoRecente(
	hipotese: Pick<Hipotese, "aFavor" | "contra">,
	eventosPorId: ReadonlyMap<string, EventoDeEvidencia>,
	agora: Date,
): { conflito: boolean; aFavorRecentes: number; contraRecentes: number } {
	const limite = agora.getTime() - JANELA_DO_CONFLITO_DIAS * MS_POR_DIA;
	const recentes = (ids: readonly string[]) =>
		unicos(ids).filter((id) => {
			const instante = Date.parse(eventosPorId.get(id)?.ts ?? "");
			return Number.isFinite(instante) && instante >= limite;
		}).length;
	const aFavorRecentes = recentes(hipotese.aFavor);
	const contraRecentes = recentes(hipotese.contra);
	return { conflito: contraRecentes > aFavorRecentes, aFavorRecentes, contraRecentes };
}

/** A hipótese com os campos novos como uma versão nova: a anterior vai para `anteriores` (com o instante em que foi substituída). */
function novaVersao(hipotese: Hipotese, mudou: Partial<Omit<Hipotese, "id" | "versao" | "anteriores">>, agora: Date): Hipotese {
	const nova: Hipotese = { ...hipotese, ...mudou };
	if (mudou.status !== undefined) nova.aprovadaPeloUsuario = mudou.status === "aprovada";
	nova.versao = hipotese.versao + 1;
	nova.anteriores = [...hipotese.anteriores, { versao: hipotese.versao, enunciado: hipotese.enunciado, status: hipotese.status, ts: agora.toISOString() }];
	return nova;
}

const confirmada = (agora: Date) => ({ ultimaConfirmacao: agora.toISOString(), validade: emDias(agora, VALIDADE_DIAS) });

const trocarHipotese = (arquivo: ArquivoHipoteses, nova: Hipotese): Hipotese[] => arquivo.hipoteses.map((hipotese) => (hipotese.id === nova.id ? nova : hipotese));

/** O enunciado novo, conferido (texto e repetição de outra hipótese); erro com a frase. */
function enunciadoConferido(arquivo: ArquivoHipoteses, id: string, valor: unknown): string {
	const resultado = conferirEnunciado(valor);
	if (!resultado.ok) throw new ErroHipoteses(`O enunciado não vale: ${mensagemDoMotivo(resultado.motivo)}.`);
	const normal = normalizarTexto(resultado.texto);
	if (arquivo.hipoteses.some((hipotese) => hipotese.id !== id && normalizarTexto(hipotese.enunciado) === normal)) {
		throw new ErroHipoteses(`O enunciado não vale: ${mensagemDoMotivo(MOTIVOS_DE_DESCARTE.enunciadoRepetido)}.`);
	}
	return resultado.texto;
}

/**
 * As hipóteses aprovadas ou propostas com a validade vencida (validade <= agora) viram "expirada" (versão nova).
 * Quem chama grava e registra um expirou_hipotese por item de `expiradas`. As mudanças pendentes ficam como estão.
 */
export function expirarVencidas(arquivo: ArquivoHipoteses, agora: Date): { arquivo: ArquivoHipoteses; expiradas: { anterior: Hipotese; hipotese: Hipotese }[] } {
	const expiradas: { anterior: Hipotese; hipotese: Hipotese }[] = [];
	const hipoteses = arquivo.hipoteses.map((hipotese) => {
		if ((hipotese.status !== "aprovada" && hipotese.status !== "proposta") || !(Date.parse(hipotese.validade) <= agora.getTime())) return hipotese;
		const nova = novaVersao(hipotese, { status: "expirada" }, agora);
		expiradas.push({ anterior: hipotese, hipotese: nova });
		return nova;
	});
	return { arquivo: expiradas.length === 0 ? arquivo : { ...arquivo, hipoteses }, expiradas };
}

// --- Decidir -------------------------------------------------------------------------------------------

export interface EntradaDecisao {
	alvo: "hipotese" | "mudanca";
	id: string;
	decisao: "aprovar" | "rejeitar";
	/** Só ao aprovar uma hipótese: o enunciado editado pelo Breno (conferido pelas mesmas regras de texto). */
	enunciado?: string;
}

export interface ResultadoDecisao {
	arquivo: ArquivoHipoteses;
	alvo: "hipotese" | "mudanca";
	decisao: "aprovar" | "rejeitar";
	/** A hipótese depois da decisão (ausente só se a mudança rejeitada era de uma hipótese que já não existe). */
	hipotese?: Hipotese;
	/** A hipótese antes da decisão. */
	anterior?: Hipotese;
	/** Ao decidir sobre uma mudança: a mudança decidida. */
	mudanca?: MudancaPendente;
	/** Aprovar a mudança fez as evidências contra recentes superarem as a favor: a hipótese voltou a "proposta" (nunca em silêncio). */
	conflito: boolean;
	conflitoDetalhe?: { aFavorRecentes: number; contraRecentes: number };
	/** As evidências que a mudança aprovada acrescentou de fato (as já citadas não entram). */
	evidenciasAcrescentadas: string[];
	/** As mudanças pendentes que saíram junto, porque a hipótese foi rejeitada. */
	mudancasRemovidas: MudancaPendente[];
}

/**
 * A decisão do Breno.
 * - hipótese proposta: aprovar a torna "aprovada" (aprovadaPeloUsuario true, versão nova com a anterior em
 *   `anteriores`, última confirmação agora, validade renovada), com o enunciado editado se vier (conferido: mesmas
 *   regras do texto e não repetir outra hipótese); rejeitar a torna "rejeitada" e tira as mudanças pendentes dela.
 *   Só uma hipótese "proposta" se decide aqui; para o resto, `editar`.
 * - mudança: rejeitar só a tira da lista; aprovar a aplica (reforçar acrescenta a favor e confirma, enfraquecer
 *   acrescenta contra, expirar põe "expirada") numa versão nova, recalcula a confiança e aplica a regra do
 *   conflito: se as evidências contra recentes superam as a favor recentes, a hipótese aprovada volta a "proposta"
 *   (aprovadaPeloUsuario false) e o resultado leva `conflito: true`. Reforçar uma expirada a traz de volta como proposta.
 * Erros de uso (id que não existe, hipótese que não está proposta, hipótese rejeitada) são ErroHipoteses.
 */
export function decidir(arquivo: ArquivoHipoteses, entrada: EntradaDecisao, opcoes: { agora: Date; eventosPorId: ReadonlyMap<string, EventoDeEvidencia> }): ResultadoDecisao {
	if (entrada.decisao !== "aprovar" && entrada.decisao !== "rejeitar") throw new ErroHipoteses(`A decisão "${String(entrada.decisao)}" não existe (aprovar ou rejeitar).`);
	if (entrada.alvo === "hipotese") return decidirSobreHipotese(arquivo, entrada, opcoes);
	if (entrada.alvo === "mudanca") return decidirSobreMudanca(arquivo, entrada, opcoes);
	throw new ErroHipoteses(`O alvo "${String(entrada.alvo)}" não existe (hipotese ou mudanca).`);
}

function decidirSobreHipotese(arquivo: ArquivoHipoteses, entrada: EntradaDecisao, opcoes: { agora: Date; eventosPorId: ReadonlyMap<string, EventoDeEvidencia> }): ResultadoDecisao {
	const anterior = arquivo.hipoteses.find((hipotese) => hipotese.id === entrada.id);
	if (!anterior) throw new ErroHipoteses(`Não achei a hipótese "${String(entrada.id)}".`);
	if (anterior.status !== "proposta") throw new ErroHipoteses(`A hipótese está ${anterior.status}; só uma hipótese proposta se aprova ou rejeita aqui (para mudar o status, edite a hipótese).`);
	const { agora } = opcoes;

	if (entrada.decisao === "rejeitar") {
		const hipotese = novaVersao(anterior, { status: "rejeitada" }, agora);
		const mudancasRemovidas = arquivo.mudancas.filter((mudanca) => mudanca.hipotese === anterior.id);
		return {
			arquivo: { ...arquivo, hipoteses: trocarHipotese(arquivo, hipotese), mudancas: arquivo.mudancas.filter((mudanca) => mudanca.hipotese !== anterior.id) },
			alvo: "hipotese",
			decisao: "rejeitar",
			hipotese,
			anterior,
			conflito: false,
			evidenciasAcrescentadas: [],
			mudancasRemovidas,
		};
	}

	const enunciado = entrada.enunciado === undefined ? anterior.enunciado : enunciadoConferido(arquivo, anterior.id, entrada.enunciado);
	const hipotese = novaVersao(anterior, { status: "aprovada", enunciado, confianca: confiancaDe(anterior.aFavor, opcoes.eventosPorId), ...confirmada(agora) }, agora);
	return { arquivo: { ...arquivo, hipoteses: trocarHipotese(arquivo, hipotese) }, alvo: "hipotese", decisao: "aprovar", hipotese, anterior, conflito: false, evidenciasAcrescentadas: [], mudancasRemovidas: [] };
}

function decidirSobreMudanca(arquivo: ArquivoHipoteses, entrada: EntradaDecisao, opcoes: { agora: Date; eventosPorId: ReadonlyMap<string, EventoDeEvidencia> }): ResultadoDecisao {
	const mudanca = arquivo.mudancas.find((item) => item.id === entrada.id);
	if (!mudanca) throw new ErroHipoteses(`Não achei a mudança "${String(entrada.id)}".`);
	const semAMudanca = arquivo.mudancas.filter((item) => item.id !== mudanca.id);
	const anterior = arquivo.hipoteses.find((hipotese) => hipotese.id === mudanca.hipotese);
	const { agora, eventosPorId } = opcoes;

	if (entrada.decisao === "rejeitar") {
		return { arquivo: { ...arquivo, mudancas: semAMudanca }, alvo: "mudanca", decisao: "rejeitar", hipotese: anterior, anterior, mudanca, conflito: false, evidenciasAcrescentadas: [], mudancasRemovidas: [] };
	}

	if (!anterior) throw new ErroHipoteses("A hipótese dessa mudança não existe mais; rejeite a mudança.");
	if (anterior.status === "rejeitada") throw new ErroHipoteses("A hipótese dessa mudança foi rejeitada; rejeite a mudança.");

	const citadas = new Set([...anterior.aFavor, ...anterior.contra]);
	const novas = mudanca.acao === "expirar" ? [] : unicos(mudanca.evidencias).filter((id) => !citadas.has(id));
	if (mudanca.acao === "expirar" && anterior.status === "expirada") {
		// Já expirou (a validade venceu antes da decisão): só tira a mudança da lista, sem versão nova.
		return { arquivo: { ...arquivo, mudancas: semAMudanca }, alvo: "mudanca", decisao: "aprovar", hipotese: anterior, anterior, mudanca, conflito: false, evidenciasAcrescentadas: [], mudancasRemovidas: [] };
	}

	let mudou: Partial<Omit<Hipotese, "id" | "versao" | "anteriores">>;
	let aFavor = anterior.aFavor;
	let contra = anterior.contra;
	if (mudanca.acao === "reforcar") {
		aFavor = [...anterior.aFavor, ...novas];
		mudou = { aFavor, ...confirmada(agora), ...(anterior.status === "expirada" ? { status: "proposta" as const } : {}) };
	} else if (mudanca.acao === "enfraquecer") {
		contra = [...anterior.contra, ...novas];
		mudou = { contra };
	} else {
		mudou = { status: "expirada" };
	}

	let status = mudou.status ?? anterior.status;
	const verificacao = conflitoRecente({ aFavor, contra }, eventosPorId, agora);
	const conflito = status === "aprovada" && verificacao.conflito;
	if (conflito) {
		status = "proposta";
		mudou = { ...mudou, status };
	}
	const hipotese = novaVersao(anterior, { ...mudou, confianca: confiancaDe(aFavor, eventosPorId) }, agora);
	return {
		arquivo: { ...arquivo, hipoteses: trocarHipotese(arquivo, hipotese), mudancas: semAMudanca },
		alvo: "mudanca",
		decisao: "aprovar",
		hipotese,
		anterior,
		mudanca,
		conflito,
		...(conflito ? { conflitoDetalhe: { aFavorRecentes: verificacao.aFavorRecentes, contraRecentes: verificacao.contraRecentes } } : {}),
		evidenciasAcrescentadas: novas,
		mudancasRemovidas: [],
	};
}

// --- Editar --------------------------------------------------------------------------------------------

export interface EntradaEdicao {
	id: string;
	enunciado?: string;
	/** Só aprovada ou rejeitada: o Breno é quem diz. */
	status?: "aprovada" | "rejeitada";
}

export interface ResultadoEdicao {
	arquivo: ArquivoHipoteses;
	anterior: Hipotese;
	hipotese: Hipotese;
	/** O que mudou de fato; vazio = nada mudou (o arquivo volta igual, sem versão nova). */
	mudou: ("enunciado" | "status")[];
	/** Ao rejeitar, as mudanças pendentes da hipótese saem junto. */
	mudancasRemovidas: MudancaPendente[];
}

/**
 * O Breno edita o enunciado (conferido pelas mesmas regras de texto, sem repetir outra hipótese) e/ou o status
 * (só "aprovada" ou "rejeitada"; aprovada marca aprovadaPeloUsuario e confirma: última confirmação agora e validade
 * renovada; rejeitada tira as mudanças pendentes da hipótese). Cada edição que muda algo é uma versão nova. A regra
 * do conflito não se aplica aqui: a decisão é do Breno.
 */
export function editar(arquivo: ArquivoHipoteses, entrada: EntradaEdicao, opcoes: { agora: Date }): ResultadoEdicao {
	const anterior = arquivo.hipoteses.find((hipotese) => hipotese.id === entrada.id);
	if (!anterior) throw new ErroHipoteses(`Não achei a hipótese "${String(entrada.id)}".`);
	if (entrada.enunciado === undefined && entrada.status === undefined) throw new ErroHipoteses("Não há o que editar: falta o enunciado ou o status.");
	if (entrada.status !== undefined && entrada.status !== "aprovada" && entrada.status !== "rejeitada") throw new ErroHipoteses(`O status "${String(entrada.status)}" não vale: o Breno só põe aprovada ou rejeitada.`);

	const mudou: ("enunciado" | "status")[] = [];
	const campos: Partial<Omit<Hipotese, "id" | "versao" | "anteriores">> = {};
	if (entrada.enunciado !== undefined) {
		const texto = enunciadoConferido(arquivo, anterior.id, entrada.enunciado);
		if (texto !== anterior.enunciado) {
			campos.enunciado = texto;
			mudou.push("enunciado");
		}
	}
	if (entrada.status !== undefined && entrada.status !== anterior.status) {
		campos.status = entrada.status;
		if (entrada.status === "aprovada") Object.assign(campos, confirmada(opcoes.agora));
		mudou.push("status");
	}
	if (mudou.length === 0) return { arquivo, anterior, hipotese: anterior, mudou, mudancasRemovidas: [] };

	const hipotese = novaVersao(anterior, campos, opcoes.agora);
	const rejeitou = campos.status === "rejeitada";
	const mudancasRemovidas = rejeitou ? arquivo.mudancas.filter((mudanca) => mudanca.hipotese === anterior.id) : [];
	return {
		arquivo: { ...arquivo, hipoteses: trocarHipotese(arquivo, hipotese), mudancas: rejeitou ? arquivo.mudancas.filter((mudanca) => mudanca.hipotese !== anterior.id) : arquivo.mudancas },
		anterior,
		hipotese,
		mudou,
		mudancasRemovidas,
	};
}

// --- Quais hipóteses o resumo e o professor usam -------------------------------------------------------

export interface FiltroRelevantes {
	/** A matéria em foco; sem ela, só as globais. */
	materia?: string;
	/** Os conceitos em foco (ids do mapa da matéria); uma hipótese de conceito só vale se tiver algum deles. */
	conceitos?: readonly string[];
	/** Com o `agora`, as de validade vencida (que ainda não foram marcadas "expirada", porque ler não grava) ficam de fora. */
	agora?: Date;
	/** Quantas, no máximo. */
	limite?: number;
}

const PESO_DA_CONFIANCA: Record<ConfiancaHipotese, number> = { baixa: 1, media: 2, alta: 3 };

/**
 * As hipóteses que o Breno aprovou (status "aprovada" e aprovadaPeloUsuario) e que valem para o foco: as globais,
 * as da matéria pedida e as de conceito que tenham algum dos conceitos pedidos. Por confiança (alta primeiro) e,
 * no empate, pela confirmação mais recente.
 */
export function hipotesesAprovadasRelevantes(arquivo: ArquivoHipoteses, filtro: FiltroRelevantes = {}): Hipotese[] {
	const conceitos = new Set(filtro.conceitos ?? []);
	const relevantes = arquivo.hipoteses.filter((hipotese) => {
		if (hipotese.status !== "aprovada" || !hipotese.aprovadaPeloUsuario) return false;
		if (filtro.agora && Date.parse(hipotese.validade) <= filtro.agora.getTime()) return false;
		const escopo = hipotese.escopo;
		if (escopo.nivel === "global") return true;
		if (escopo.materia !== filtro.materia) return false;
		return escopo.nivel === "materia" || escopo.conceitos.some((conceito) => conceitos.has(conceito));
	});
	relevantes.sort((a, b) => PESO_DA_CONFIANCA[b.confianca] - PESO_DA_CONFIANCA[a.confianca] || (a.ultimaConfirmacao < b.ultimaConfirmacao ? 1 : a.ultimaConfirmacao > b.ultimaConfirmacao ? -1 : a.id < b.id ? -1 : 1));
	return filtro.limite === undefined ? relevantes : relevantes.slice(0, Math.max(0, filtro.limite));
}

// --- Ler o arquivo, com tolerância ---------------------------------------------------------------------

/** O arquivo sem hipótese nenhuma. */
export const arquivoVazio = (): ArquivoHipoteses => ({ versao: VERSAO_HIPOTESES, hipoteses: [], mudancas: [] });

const STATUS: readonly string[] = ["proposta", "aprovada", "rejeitada", "expirada"];
const CONFIANCAS: readonly string[] = ["baixa", "media", "alta"];
const ACOES_DE_MUDANCA: readonly string[] = ["reforcar", "enfraquecer", "expirar"];
const MOTIVOS_DA_REFLEXAO: readonly string[] = ["botao", "modulo", "licao"];

function escopoSalvo(valor: unknown): EscopoHipotese | undefined {
	if (!ehObjeto(valor)) return undefined;
	if (valor.nivel === "global") return { nivel: "global" };
	if (!ehTexto(valor.materia)) return undefined;
	if (valor.nivel === "materia") return { nivel: "materia", materia: valor.materia };
	const conceitos = listaDeTextos(valor.conceitos);
	if (valor.nivel === "conceito" && conceitos && conceitos.length > 0) return { nivel: "conceito", materia: valor.materia, conceitos: unicos(conceitos) };
	return undefined;
}

function resumoSalvo(valor: unknown): ResumoDaReflexao | undefined {
	if (!ehObjeto(valor) || !ehTexto(valor.id) || !ehTexto(valor.ts) || !MOTIVOS_DA_REFLEXAO.includes(valor.motivo as string)) return undefined;
	const numeros = [valor.lidos, valor.propostas, valor.aceitas];
	if (numeros.some((numero) => typeof numero !== "number" || !Number.isFinite(numero))) return undefined;
	if (!Array.isArray(valor.descartadas) || !valor.descartadas.every((item) => ehObjeto(item) && typeof item.motivo === "string" && typeof item.quantas === "number")) return undefined;
	return {
		id: valor.id,
		ts: valor.ts,
		motivo: valor.motivo as ResumoDaReflexao["motivo"],
		...(typeof valor.ultimoEvento === "string" ? { ultimoEvento: valor.ultimoEvento } : {}),
		lidos: valor.lidos as number,
		propostas: valor.propostas as number,
		aceitas: valor.aceitas as number,
		descartadas: (valor.descartadas as { motivo: string; quantas: number }[]).map(({ motivo, quantas }) => ({ motivo, quantas })),
		...(typeof valor.custo === "number" && Number.isFinite(valor.custo) ? { custo: valor.custo } : {}),
	};
}

/**
 * Lê o conteúdo de um hipoteses.json (já em JSON.parse) sem lançar. Devolve sempre um ArquivoHipoteses válido e a
 * lista de avisos do que foi descartado ou corrigido. Algo que não é um objeto ou de uma versão desconhecida vira o
 * arquivo vazio, com aviso. Hipótese ou mudança sem os campos essenciais (id, tipo, escopo, enunciado, status e
 * criadaEm; id, hipótese, ação e criadaEm) é descartada com aviso; campo opcional ausente ganha o valor-padrão
 * (listas vazias, confiança baixa, versão 1, última confirmação = criação, validade 60 dias depois da criação,
 * aprovadaPeloUsuario conforme o status). Quem vai gravar o arquivo deve recusar se houver avisos (não sobrescrever
 * o que não leu por inteiro).
 */
export function lerArquivoHipoteses(json: unknown): { arquivo: ArquivoHipoteses; avisos: string[] } {
	const avisos: string[] = [];
	if (!ehObjeto(json)) return { arquivo: arquivoVazio(), avisos: ["o arquivo não é um objeto JSON"] };
	if (json.versao !== VERSAO_HIPOTESES) return { arquivo: arquivoVazio(), avisos: [`versão desconhecida do arquivo (${String(json.versao)}); esperada a ${VERSAO_HIPOTESES}`] };

	const hipoteses: Hipotese[] = [];
	const ids = new Set<string>();
	const lista = Array.isArray(json.hipoteses) ? json.hipoteses : [];
	if (json.hipoteses !== undefined && !Array.isArray(json.hipoteses)) avisos.push("a lista de hipóteses não é uma lista");
	lista.forEach((item, indice) => {
		const rotulo = `hipótese ${indice + 1}`;
		if (!ehObjeto(item)) return void avisos.push(`${rotulo}: não é um objeto`);
		const escopo = escopoSalvo(item.escopo);
		if (!ehTexto(item.id) || !(TIPOS_HIPOTESE as readonly string[]).includes(item.tipo as string) || !escopo || !ehTexto(item.enunciado) || !STATUS.includes(item.status as string) || !ehTexto(item.criadaEm)) {
			return void avisos.push(`${rotulo}${ehTexto(item.id) ? ` (${item.id})` : ""}: faltam campos essenciais ou estão inválidos (id, tipo, escopo, enunciado, status, criadaEm)`);
		}
		if (ids.has(item.id)) return void avisos.push(`${rotulo}: o id ${item.id} se repete`);
		ids.add(item.id);
		const status = item.status as StatusHipotese;
		const anteriores = (Array.isArray(item.anteriores) ? item.anteriores : []).filter(
			(versao): versao is VersaoAnterior => ehObjeto(versao) && typeof versao.versao === "number" && typeof versao.enunciado === "string" && STATUS.includes(versao.status as string) && typeof versao.ts === "string",
		);
		if (Array.isArray(item.anteriores) && anteriores.length !== item.anteriores.length) avisos.push(`${rotulo} (${item.id}): versões anteriores inválidas foram descartadas`);
		hipoteses.push({
			id: item.id,
			tipo: item.tipo as TipoHipotese,
			escopo,
			enunciado: item.enunciado,
			aFavor: unicos(listaDeTextos(item.aFavor) ?? []),
			contra: unicos(listaDeTextos(item.contra) ?? []),
			confianca: CONFIANCAS.includes(item.confianca as string) ? (item.confianca as ConfiancaHipotese) : "baixa",
			criadaEm: item.criadaEm,
			ultimaConfirmacao: ehTexto(item.ultimaConfirmacao) ? item.ultimaConfirmacao : item.criadaEm,
			validade: ehTexto(item.validade) ? item.validade : emDias(new Date(Date.parse(item.criadaEm)), VALIDADE_DIAS),
			status,
			aprovadaPeloUsuario: typeof item.aprovadaPeloUsuario === "boolean" ? item.aprovadaPeloUsuario : status === "aprovada",
			versao: typeof item.versao === "number" && Number.isInteger(item.versao) && item.versao >= 1 ? item.versao : 1,
			anteriores,
			...(ehTexto(item.reflexao) ? { reflexao: item.reflexao } : {}),
		});
	});

	const mudancas: MudancaPendente[] = [];
	const idsDasMudancas = new Set<string>();
	const listaDeMudancas = Array.isArray(json.mudancas) ? json.mudancas : [];
	if (json.mudancas !== undefined && !Array.isArray(json.mudancas)) avisos.push("a lista de mudanças não é uma lista");
	listaDeMudancas.forEach((item, indice) => {
		const rotulo = `mudança ${indice + 1}`;
		if (!ehObjeto(item)) return void avisos.push(`${rotulo}: não é um objeto`);
		if (!ehTexto(item.id) || !ehTexto(item.hipotese) || !ACOES_DE_MUDANCA.includes(item.acao as string) || !ehTexto(item.criadaEm)) {
			return void avisos.push(`${rotulo}: faltam campos essenciais ou estão inválidos (id, hipotese, acao, criadaEm)`);
		}
		if (idsDasMudancas.has(item.id)) return void avisos.push(`${rotulo}: o id ${item.id} se repete`);
		idsDasMudancas.add(item.id);
		mudancas.push({
			id: item.id,
			hipotese: item.hipotese,
			acao: item.acao as AcaoDeMudanca,
			evidencias: unicos(listaDeTextos(item.evidencias) ?? []),
			motivo: typeof item.motivo === "string" ? item.motivo : "",
			reflexao: typeof item.reflexao === "string" ? item.reflexao : "",
			criadaEm: item.criadaEm,
		});
	});

	const ultimaReflexao = json.ultimaReflexao === undefined ? undefined : resumoSalvo(json.ultimaReflexao);
	if (json.ultimaReflexao !== undefined && !ultimaReflexao) avisos.push("a última reflexão está inválida e foi descartada");
	return { arquivo: { versao: VERSAO_HIPOTESES, hipoteses, mudancas, ...(ultimaReflexao ? { ultimaReflexao } : {}) }, avisos };
}
