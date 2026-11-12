// As partes puras da aba Hipóteses da tela "Perfil do aprendiz" (docs/aprendiz.md, seções 3 e 8): as seções e a ordem
// delas, o filtro de matéria, os rótulos de tipo, escopo e confiança, a validade, o diff de uma mudança pendente, o
// aviso do conflito, a linha da última reflexão e a validação do enunciado no cliente. Sem React e sem nada do Node.
// As regras do perfil (confiança, validade, conflito) são do código da extensão (lib/hipoteses-tipos.ts, WP1): aqui
// a tela só apresenta o que a ponte mandou.

import type { AcaoDeMudanca, ConfiancaHipotese, EscopoHipotese, EstadoHipoteses, Hipotese, MudancaPendente, ResumoDaReflexao, StatusHipotese, TipoHipotese } from "../../lib/hipoteses-tipos.ts";
import { formatarInteiro, idCurtoDoConceito, nomeDaMateria, textoHaQuanto } from "./aprendiz-tela.ts";

const NBSP = " ";
const plural = (quantos: number, singular: string, pluralDe: string): string => `${formatarInteiro(quantos)} ${quantos === 1 ? singular : pluralDe}`;

// --- Tipo, confiança e status ---------------------------------------------------------

export const ROTULO_DO_TIPO: Readonly<Record<TipoHipotese, string>> = {
	conhecimento: "Conhecimento",
	misconception: "Concepção errada",
	vocabulario: "Vocabulário",
	preferencia_de_forma: "Preferência de forma",
	ritmo: "Ritmo",
	metacognicao: "Metacognição",
};

/** O tipo em português; um tipo que a tela não conhece aparece como está. */
export const rotuloDoTipo = (tipo: string): string => (ROTULO_DO_TIPO as Record<string, string>)[tipo] ?? tipo;

export const ROTULO_DA_CONFIANCA: Readonly<Record<ConfiancaHipotese, string>> = { baixa: "baixa", media: "média", alta: "alta" };
/** Quantos dos três traços do marcador de confiança ficam cheios. */
export const NIVEL_DA_CONFIANCA: Readonly<Record<ConfiancaHipotese, 1 | 2 | 3>> = { baixa: 1, media: 2, alta: 3 };

export const rotuloDaConfianca = (confianca: string): string => (ROTULO_DA_CONFIANCA as Record<string, string>)[confianca] ?? confianca;
export const nivelDaConfianca = (confianca: string): 1 | 2 | 3 => (NIVEL_DA_CONFIANCA as Record<string, 1 | 2 | 3>)[confianca] ?? 1;

export const ROTULO_DO_STATUS: Readonly<Record<StatusHipotese, string>> = { proposta: "Proposta", aprovada: "Aprovada", rejeitada: "Rejeitada", expirada: "Expirada" };

// --- Escopo -----------------------------------------------------------------------------

/** Os nomes dos conceitos que a tela conhece, pela chave "<matéria>/<conceito>" (nomesDosConceitos, no histórico). */
export type NomesDosConceitos = ReadonlyMap<string, string>;

/**
 * O escopo em palavras: "Todas as matérias", o nome da matéria ou "Limites, Derivadas · Cálculo I". `materiasProntas`
 * diz se a lista de matérias já chegou: antes disso o nome fica em branco (nunca o id cru por um instante); depois,
 * uma matéria que a lista não tem é "matéria removida". Um conceito que os indicadores não trazem aparece pelo id curto
 * (os nomes só vêm dos indicadores, que podem não ter chegado) e, se nenhum nome é conhecido ainda, só "N conceitos".
 */
export function textoDoEscopo(
	escopo: EscopoHipotese,
	materias: ReadonlyArray<{ id: string; nome: string }>,
	nomes: NomesDosConceitos | undefined,
): string {
	if (escopo.nivel === "global") return "Todas as matérias";
	const materiaPronta = materias.length > 0;
	const nomeDaMateriaTexto = materiaPronta ? (nomeDaMateria(escopo.materia, materias) ?? "matéria removida") : NBSP;
	if (escopo.nivel === "materia") return nomeDaMateriaTexto;
	const conceitos = escopo.conceitos ?? [];
	const lista =
		nomes === undefined || nomes.size === 0
			? plural(conceitos.length, "conceito", "conceitos")
			: conceitos.map((conceito) => nomes.get(`${escopo.materia}/${conceito}`) ?? idCurtoDoConceito(conceito)).join(", ");
	return `${lista} · ${nomeDaMateriaTexto}`;
}

/** A matéria do escopo, se tiver (global não tem). */
export const materiaDoEscopo = (escopo: EscopoHipotese): string | undefined => (escopo.nivel === "global" ? undefined : escopo.materia);

// --- Validade e datas ---------------------------------------------------------------------

/** "10/01/2027" de um dia ISO (os 10 primeiros caracteres, sem passar pelo fuso); "—" se não for data. */
export function formatarDia(iso: string): string {
	const achado = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	return achado ? `${achado[3]}/${achado[2]}/${achado[1]}` : "—";
}

/** "Até 10/01/2027" para a validade; "—" sem validade. */
export const textoDaValidade = (validade: string): string => (/^\d{4}-\d{2}-\d{2}/.test(validade) ? `Até ${formatarDia(validade)}` : "—");

/** "3 a favor · 1 contra". */
export const textoDasEvidencias = (aFavor: number, contra: number): string => `${formatarInteiro(aFavor)} a favor · ${formatarInteiro(contra)} contra`;

// --- O conflito -------------------------------------------------------------------------------

export const AVISO_DO_CONFLITO = "Voltou para a sua revisão: as evidências contra recentes superam as a favor";

/**
 * A hipótese voltou de aprovada para proposta pela regra do conflito: está como proposta mas o Breno já a aprovou
 * (ou a versão anterior era aprovada). Uma proposta nova, que nunca foi aprovada, não tem o aviso.
 */
export function voltouParaRevisao(hipotese: Pick<Hipotese, "status" | "aprovadaPeloUsuario" | "anteriores">): boolean {
	if (hipotese.status !== "proposta") return false;
	return hipotese.aprovadaPeloUsuario === true || (hipotese.anteriores ?? []).some((anterior) => anterior.status === "aprovada");
}

// --- Mudanças pendentes -------------------------------------------------------------------

/** O diff de uma mudança em palavras: "Reforçar: +2 eventos a favor", "Enfraquecer: +1 evento contra", "Expirar". */
export function textoDoDiff(mudanca: Pick<MudancaPendente, "acao" | "evidencias">): string {
	const quantos = mudanca.evidencias?.length ?? 0;
	switch (mudanca.acao as AcaoDeMudanca) {
		case "reforcar":
			return `Reforçar: +${quantos} ${quantos === 1 ? "evento a favor" : "eventos a favor"}`;
		case "enfraquecer":
			return `Enfraquecer: +${quantos} ${quantos === 1 ? "evento contra" : "eventos contra"}`;
		case "expirar":
			return "Expirar";
		default:
			return String(mudanca.acao);
	}
}

/** Em que lado as evidências de uma mudança entram: reforçar a favor, enfraquecer contra; expirar não acrescenta. */
export const ladoDaMudanca = (acao: string): "favor" | "contra" | undefined => (acao === "reforcar" ? "favor" : acao === "enfraquecer" ? "contra" : undefined);

// --- As seções ---------------------------------------------------------------------------------

/** Um item da seção "Esperando a sua decisão": uma hipótese proposta ou uma mudança pendente (com a hipótese dela, se existe). */
export type ItemEsperando = { tipo: "hipotese"; hipotese: Hipotese } | { tipo: "mudanca"; mudanca: MudancaPendente; hipotese?: Hipotese };

export type SecaoDeHipoteses = "esperando" | "aprovadas" | "rejeitadas" | "expiradas";

export const TITULO_DA_SECAO: Readonly<Record<SecaoDeHipoteses, string>> = {
	esperando: "Esperando a sua decisão",
	aprovadas: "Aprovadas",
	rejeitadas: "Rejeitadas",
	expiradas: "Expiradas",
};

/** As seções que começam recolhidas. */
export const SECOES_RECOLHIDAS: readonly SecaoDeHipoteses[] = ["rejeitadas", "expiradas"];

export interface SecoesDeHipoteses {
	esperando: ItemEsperando[];
	aprovadas: Hipotese[];
	rejeitadas: Hipotese[];
	expiradas: Hipotese[];
}

/** A matéria passa o filtro se não há filtro, se o escopo é global (vale para todas) ou se é a matéria do escopo. */
export const hipoteseNoFiltro = (hipotese: Pick<Hipotese, "escopo">, materia?: string): boolean => !materia || hipotese.escopo.nivel === "global" || hipotese.escopo.materia === materia;

/** Do mais novo para o mais antigo (a criação; no empate, o id). */
const maisNovasPrimeiro = (a: { criadaEm: string; id: string }, b: { criadaEm: string; id: string }): number => {
	const dif = Date.parse(b.criadaEm) - Date.parse(a.criadaEm);
	if (!Number.isNaN(dif) && dif !== 0) return dif;
	return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
};

/**
 * Divide o estado nas quatro seções. "Esperando" traz as propostas (as mais novas primeiro), cada uma com as mudanças
 * pendentes dela logo abaixo, e depois as mudanças das outras hipóteses (as mais antigas primeiro: a fila de revisão).
 * O filtro de matéria vale para as hipóteses e, pela hipótese dela, para as mudanças (uma mudança de hipótese que o
 * estado não traz mais não passa por um filtro de matéria).
 */
export function dividirEmSecoes(estado: Pick<EstadoHipoteses, "hipoteses" | "mudancas">, materia?: string): SecoesDeHipoteses {
	const hipoteses = estado.hipoteses.filter((hipotese) => hipoteseNoFiltro(hipotese, materia));
	const porId = new Map(estado.hipoteses.map((hipotese) => [hipotese.id, hipotese]));
	const mudancas = estado.mudancas
		.filter((mudanca) => {
			const dela = porId.get(mudanca.hipotese);
			return dela ? hipoteseNoFiltro(dela, materia) : !materia;
		})
		.sort((a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm) || (a.id < b.id ? -1 : 1));
	const propostas = hipoteses.filter((hipotese) => hipotese.status === "proposta").sort(maisNovasPrimeiro);
	const esperando: ItemEsperando[] = [];
	const colocadas = new Set<string>();
	for (const proposta of propostas) {
		esperando.push({ tipo: "hipotese", hipotese: proposta });
		for (const mudanca of mudancas.filter((item) => item.hipotese === proposta.id)) {
			esperando.push({ tipo: "mudanca", mudanca, hipotese: proposta });
			colocadas.add(mudanca.id);
		}
	}
	for (const mudanca of mudancas) if (!colocadas.has(mudanca.id)) esperando.push({ tipo: "mudanca", mudanca, ...(porId.get(mudanca.hipotese) ? { hipotese: porId.get(mudanca.hipotese)! } : {}) });
	const doStatus = (status: StatusHipotese) => hipoteses.filter((hipotese) => hipotese.status === status).sort(maisNovasPrimeiro);
	return { esperando, aprovadas: doStatus("aprovada"), rejeitadas: doStatus("rejeitada"), expiradas: doStatus("expirada") };
}

/** Quantas hipóteses e mudanças as seções têm no total. */
export const totalDasSecoes = (secoes: SecoesDeHipoteses): number => secoes.esperando.length + secoes.aprovadas.length + secoes.rejeitadas.length + secoes.expiradas.length;

/** A seção em que uma hipótese aparece (para abrir a recolhida quando a rota pede o destaque dela). */
export function secaoDaHipotese(hipotese: Pick<Hipotese, "status">): SecaoDeHipoteses {
	return hipotese.status === "aprovada" ? "aprovadas" : hipotese.status === "rejeitada" ? "rejeitadas" : hipotese.status === "expirada" ? "expiradas" : "esperando";
}

// --- A última reflexão ------------------------------------------------------------------------

/** O que a linha do topo diz enquanto o professor ainda não refletiu. */
export const TEXTO_SEM_REFLEXAO = "O professor propõe hipóteses a partir dos seus eventos de aprendizagem. Nada entra no seu perfil sem a sua aprovação.";

const formatoDoCusto = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O custo em dólares com duas casas ("US$ 0,03"); abaixo de um centavo, "menos de US$ 0,01"; vazio sem custo. */
export function formatarCusto(custo: number | undefined): string {
	if (custo === undefined || !Number.isFinite(custo) || custo < 0) return "";
	if (custo > 0 && custo < 0.005) return "menos de US$ 0,01";
	return `US$ ${formatoDoCusto.format(custo)}`;
}

/** Quantas propostas o código descartou (a soma de `quantas`). */
export const totalDescartadas = (resumo: Pick<ResumoDaReflexao, "descartadas">): number => (resumo.descartadas ?? []).reduce((soma, item) => soma + (Number.isFinite(item.quantas) ? item.quantas : 0), 0);

/**
 * "Última reflexão há 2 dias: leu 14 eventos, 3 propostas aceitas, 2 descartadas · US$ 0,03".
 * Sem descartadas ou sem custo, essas partes saem.
 */
export function textoDaUltimaReflexao(resumo: ResumoDaReflexao, agora: number = Date.now()): string {
	const quando = textoHaQuanto(resumo.ts, agora);
	const lidos = `leu ${plural(resumo.lidos, "evento", "eventos")}`;
	const aceitas = resumo.aceitas === 0 ? "nenhuma proposta aceita" : plural(resumo.aceitas, "proposta aceita", "propostas aceitas");
	const descartadas = totalDescartadas(resumo);
	const partes = [lidos, aceitas, ...(descartadas > 0 ? [plural(descartadas, "descartada", "descartadas")] : [])];
	const custo = formatarCusto(resumo.custo);
	const inicio = quando === "agora" ? "Última reflexão agora" : quando === "—" ? "Última reflexão" : `Última reflexão ${quando}`;
	return `${inicio}: ${partes.join(", ")}${custo ? ` · ${custo}` : ""}`;
}

/** Os motivos dos descartes, para a dica da linha ("2 sem evidência de sessões diferentes"). */
export function dicaDosDescartes(resumo: Pick<ResumoDaReflexao, "descartadas">): string {
	return (resumo.descartadas ?? []).map((item) => `${formatarInteiro(item.quantas)}: ${item.motivo}`).join("\n");
}

// --- Editar o enunciado -------------------------------------------------------------------------

/** O tamanho do enunciado (o contrato: de 12 a 300 caracteres). */
export const LIMITE_DO_ENUNCIADO = 300;
export const MINIMO_DO_ENUNCIADO = 12;

/** O problema do enunciado escrito, ou undefined se serve. Vale o texto sem os espaços das pontas. */
export function erroDoEnunciado(enunciado: string): string | undefined {
	const limpo = enunciado.trim();
	if (limpo === "") return "Escreva o enunciado da hipótese.";
	if (limpo.length < MINIMO_DO_ENUNCIADO) return `O enunciado precisa de pelo menos ${MINIMO_DO_ENUNCIADO} caracteres.`;
	if (limpo.length > LIMITE_DO_ENUNCIADO) return `O enunciado passa de ${LIMITE_DO_ENUNCIADO} caracteres.`;
	return undefined;
}

/** O enunciado que vai para a ponte: sem os espaços das pontas. */
export const enunciadoParaEnviar = (enunciado: string): string => enunciado.trim();

/** O enunciado novo é diferente do que a hipótese tem (comparando sem os espaços das pontas)? */
export const enunciadoMudou = (novo: string, atual: string): boolean => enunciadoParaEnviar(novo) !== enunciadoParaEnviar(atual);

/** Para onde levar o clique que volta de um evento às hipóteses: o filtro só continua se todas elas passam por ele. */
export function materiaParaAbrirHipoteses(materiaDaRota: string | undefined, hipoteses: ReadonlyArray<Pick<Hipotese, "escopo">>): string | undefined {
	if (!materiaDaRota) return undefined;
	return hipoteses.every((hipotese) => hipoteseNoFiltro(hipotese, materiaDaRota)) ? materiaDaRota : undefined;
}
