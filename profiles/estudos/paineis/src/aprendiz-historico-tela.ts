// As partes puras da aba Histórico da tela "Perfil do aprendiz" (docs/aprendiz.md, seção 3 e 8): a linha do tempo
// dos eventos de aprendizagem, agrupada por dia, o verbo em português, a frase curta do resultado, o filtro por tipo
// e as fichas de evidência das hipóteses (que abrem o evento no Histórico). Sem React e sem nada do Node.

import type { IndicadoresAprendiz } from "../../lib/aprendiz-indicadores-tipos.ts";
import { conceitosDoEvento } from "../../lib/aprendiz-indicadores-tipos.ts";
import { type EventoDoHistorico, type Hipotese, LIMITE_HISTORICO, type MudancaPendente } from "../../lib/hipoteses-tipos.ts";
import { idCurtoDoEvento } from "./aprendiz-tela.ts";

/**
 * Um evento como o Histórico o mostra, com o verbo solto (a tela aceita um verbo que ainda não conhece: aparece como está).
 * Todo EventoDoHistorico do contrato serve onde a tela pede um EventoLido.
 */
export type EventoLido = Omit<EventoDoHistorico, "verbo"> & { verbo: string };

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const ehNumero = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor);
const texto = (valor: unknown): string | undefined => (typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined);

// --- Os verbos ---------------------------------------------------------------------

/** O verbo de cada evento que a aba conhece, em português. Um verbo que não está aqui aparece como está. */
export const VERBOS_EM_PORTUGUES: Readonly<Record<string, string>> = {
	autoavaliou_conceito: "Autoavaliou o conceito",
	respondeu_questao: "Respondeu uma questão",
	respondeu_verificacao: "Respondeu uma pergunta",
	respondeu_dissertativa: "Respondeu uma dissertativa",
	nao_sabia_questao: "Não sabia a questão",
	avaliou_licao: "Avaliou a lição",
	avaliou_bloco: "Avaliou um bloco",
	aprovou_ajuste_metodo: "Aprovou um ajuste do método",
	refletiu: "Reflexão do professor",
	propos_hipotese: "Hipótese proposta",
	propos_mudanca_hipotese: "Mudança de hipótese proposta",
	aprovou_hipotese: "Hipótese aprovada",
	rejeitou_hipotese: "Hipótese rejeitada",
	aprovou_mudanca_hipotese: "Mudança de hipótese aprovada",
	rejeitou_mudanca_hipotese: "Mudança de hipótese rejeitada",
	editou_hipotese: "Hipótese editada",
	expirou_hipotese: "Hipótese expirada",
};

export const verboEmPortugues = (verbo: string): string => VERBOS_EM_PORTUGUES[verbo] ?? verbo;

// --- O filtro por tipo ------------------------------------------------------------

export type TipoDoHistorico = "todos" | "respostas" | "autoavaliacoes" | "perfil";

export const OPCOES_DE_TIPO: ReadonlyArray<{ value: TipoDoHistorico; label: string }> = [
	{ value: "todos", label: "Todos os tipos" },
	{ value: "respostas", label: "Respostas" },
	{ value: "autoavaliacoes", label: "Autoavaliações" },
	{ value: "perfil", label: "Perfil" },
];

const DOS_TIPOS: Readonly<Record<string, Exclude<TipoDoHistorico, "todos">>> = {
	respondeu_questao: "respostas",
	respondeu_verificacao: "respostas",
	respondeu_dissertativa: "respostas",
	nao_sabia_questao: "respostas",
	autoavaliou_conceito: "autoavaliacoes",
	avaliou_licao: "autoavaliacoes",
	avaliou_bloco: "autoavaliacoes",
	refletiu: "perfil",
	propos_hipotese: "perfil",
	propos_mudanca_hipotese: "perfil",
	aprovou_hipotese: "perfil",
	rejeitou_hipotese: "perfil",
	aprovou_mudanca_hipotese: "perfil",
	rejeitou_mudanca_hipotese: "perfil",
	editou_hipotese: "perfil",
	expirou_hipotese: "perfil",
};

/** O tipo do verbo; undefined para um verbo que não é de nenhum (só aparece em "Todos os tipos"). */
export const tipoDoVerbo = (verbo: string): Exclude<TipoDoHistorico, "todos"> | undefined => DOS_TIPOS[verbo];

/** O valor de um select de tipo como um TipoDoHistorico (o que não é conhecido volta a "todos"). */
export const tipoDeValor = (valor: string): TipoDoHistorico => OPCOES_DE_TIPO.find((opcao) => opcao.value === valor)?.value ?? "todos";

export const materiaDoEvento = (evento: Pick<EventoLido, "objeto">): string | undefined => (ehObjeto(evento.objeto) ? texto(evento.objeto.materia) : undefined);

/** Os eventos da matéria (sem matéria no filtro, todos) e do tipo ("todos" não filtra), na ordem em que vieram. */
export function filtrarEventos(eventos: readonly EventoLido[], filtro: { materia?: string; tipo?: TipoDoHistorico }): EventoLido[] {
	const tipo = filtro.tipo ?? "todos";
	return eventos.filter((evento) => (!filtro.materia || materiaDoEvento(evento) === filtro.materia) && (tipo === "todos" || tipoDoVerbo(evento.verbo) === tipo));
}

/** Do mais novo para o mais antigo (o instante; no empate, o id, que ordena pelo tempo). Devolve uma lista nova. */
export function maisNovosPrimeiro(eventos: readonly EventoLido[]): EventoLido[] {
	return [...eventos].sort((a, b) => {
		const dif = Date.parse(b.ts) - Date.parse(a.ts);
		if (!Number.isNaN(dif) && dif !== 0) return dif;
		return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
	});
}

// --- Os dias ---------------------------------------------------------------------------

const dia2 = (valor: number) => String(valor).padStart(2, "0");

/** O dia local de um instante ("2026-11-11"); "" se não for data. */
export function diaLocal(ts: string | number | Date): string {
	const data = ts instanceof Date ? ts : new Date(ts);
	if (Number.isNaN(data.getTime())) return "";
	return `${data.getFullYear()}-${dia2(data.getMonth() + 1)}-${dia2(data.getDate())}`;
}

const formatoDoDia = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });
const formatoCurto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const formatoDaHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "Hoje", "Ontem" ou "10 de novembro de 2026"; "Sem data" para um instante que não é data. */
export function rotuloDoDia(dia: string, agora: number | Date = Date.now()): string {
	if (!dia) return "Sem data";
	const hoje = new Date(agora);
	if (dia === diaLocal(hoje)) return "Hoje";
	const ontem = new Date(hoje);
	ontem.setDate(ontem.getDate() - 1);
	if (dia === diaLocal(ontem)) return "Ontem";
	const [ano, mes, numero] = dia.split("-").map(Number);
	return formatoDoDia.format(new Date(ano!, mes! - 1, numero));
}

export interface DiaDoHistorico {
	/** O dia local ("2026-11-11"). */
	dia: string;
	rotulo: string;
	eventos: EventoLido[];
}

/** Agrupa por dia local, mantendo a ordem de entrada (os mais novos primeiro); eventos sem data vão num grupo "Sem data" no fim. */
export function agruparPorDia(eventos: readonly EventoLido[], agora: number | Date = Date.now()): DiaDoHistorico[] {
	const grupos: DiaDoHistorico[] = [];
	const semData: EventoLido[] = [];
	for (const evento of eventos) {
		const dia = diaLocal(evento.ts);
		if (!dia) {
			semData.push(evento);
			continue;
		}
		const ultimo = grupos[grupos.length - 1];
		if (ultimo && ultimo.dia === dia) ultimo.eventos.push(evento);
		else grupos.push({ dia, rotulo: rotuloDoDia(dia, agora), eventos: [evento] });
	}
	if (semData.length > 0) grupos.push({ dia: "", rotulo: rotuloDoDia(""), eventos: semData });
	return grupos;
}

/** A hora local ("14:32"); "—" se não for data. */
export function horaDoEvento(ts: string): string {
	const data = new Date(ts);
	return Number.isNaN(data.getTime()) ? "—" : formatoDaHora.format(data);
}

/** O dia e o mês ("08/11"); "—" se não for data. */
export function diaCurtoDoEvento(ts: string): string {
	const data = new Date(ts);
	return Number.isNaN(data.getTime()) ? "—" : formatoCurto.format(data);
}

// --- A frase do resultado -------------------------------------------------------------

/** Até quantos caracteres do texto livre a frase leva. */
export const LIMITE_TEXTO_NA_FRASE = 90;

/** O texto cortado em `limite` caracteres, com reticências; em branco vira undefined. */
export function cortarTexto(valor: unknown, limite = LIMITE_TEXTO_NA_FRASE): string | undefined {
	const limpo = texto(valor)?.replace(/\s+/g, " ");
	if (!limpo) return undefined;
	return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

const umaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const numero = (valor: number) => umaCasa.format(valor);
const plural = (quantos: number, singular: string, pluralDe: string) => `${quantos} ${quantos === 1 ? singular : pluralDe}`;

const AVALIACAO_DA_VERIFICACAO: Readonly<Record<string, string>> = { certa: "certa", errada: "errada", parcial: "em parte", em_parte: "em parte" };
const AVALIACAO_DO_BLOCO: Readonly<Record<string, string>> = { ruim: "ruim", bom: "bom", otimo: "ótimo" };

/** Junta as partes que existem com " · ". */
const juntar = (...partes: Array<string | undefined>): string => partes.filter((parte): parte is string => Boolean(parte)).join(" · ");

/**
 * A frase curta do resultado de um evento ("certa", "errada · 2ª tentativa", "nível 3 de 4", "nota média 4,2 de 5",
 * "leu 14 eventos · 3 propostas aceitas"); o texto livre vem cortado e entre aspas. Vazia se o evento não tem nada
 * a dizer ou se o verbo não é conhecido (o resultado dele é de um formato que a tela não sabe ler).
 */
export function fraseDoResultado(evento: Pick<EventoLido, "verbo" | "resultado">): string {
	const resultado = ehObjeto(evento.resultado) ? evento.resultado : {};
	const citado = (valor: unknown) => {
		const cortado = cortarTexto(valor);
		return cortado ? `“${cortado}”` : undefined;
	};
	switch (evento.verbo) {
		case "respondeu_questao": {
			const tentativa = ehNumero(resultado.tentativa) && resultado.tentativa > 1 ? `${resultado.tentativa}ª tentativa` : undefined;
			const correta = resultado.correta === true ? "certa" : resultado.correta === false ? "errada" : undefined;
			return juntar(correta, tentativa);
		}
		case "respondeu_verificacao":
			return juntar(typeof resultado.avaliacao === "string" ? (AVALIACAO_DA_VERIFICACAO[resultado.avaliacao] ?? resultado.avaliacao) : undefined, citado(resultado.texto));
		case "respondeu_dissertativa": {
			const pontos = ehNumero(resultado.total) && ehNumero(resultado.max) ? `${numero(resultado.total)} de ${numero(resultado.max)} pontos` : undefined;
			return juntar(pontos, citado(resultado.texto));
		}
		case "nao_sabia_questao":
			return "";
		case "autoavaliou_conceito":
			return ehNumero(resultado.nivel) ? `nível ${numero(resultado.nivel)} de 4` : "";
		case "avaliou_licao": {
			const notas = ehObjeto(resultado.notas) ? Object.values(resultado.notas).filter(ehNumero) : [];
			const media = notas.length > 0 ? `nota média ${numero(notas.reduce((soma, nota) => soma + nota, 0) / notas.length)} de 5` : undefined;
			return juntar(media, citado(resultado.texto));
		}
		case "avaliou_bloco":
			return juntar(typeof resultado.avaliacao === "string" ? (AVALIACAO_DO_BLOCO[resultado.avaliacao] ?? resultado.avaliacao) : undefined, citado(resultado.texto));
		case "aprovou_ajuste_metodo":
			return citado(resultado.texto) ?? "";
		case "refletiu": {
			const lidos = ehNumero(resultado.lidos) ? `leu ${plural(resultado.lidos, "evento", "eventos")}` : undefined;
			const aceitas = ehNumero(resultado.aceitas) ? plural(resultado.aceitas, "proposta aceita", "propostas aceitas") : undefined;
			return juntar(lidos, aceitas);
		}
		case "propos_hipotese":
		case "propos_mudanca_hipotese":
		case "aprovou_hipotese":
		case "rejeitou_hipotese":
		case "aprovou_mudanca_hipotese":
		case "rejeitou_mudanca_hipotese":
		case "editou_hipotese":
		case "expirou_hipotese":
			return citado(resultado.enunciado) ?? citado(resultado.motivo) ?? "";
		default:
			return "";
	}
}

// --- Os conceitos e as matérias nos eventos ------------------------------------------

/** Os nomes dos conceitos que a tela conhece (dos indicadores), pela chave "<matéria>/<conceito>". */
export function nomesDosConceitos(indicadores: Pick<IndicadoresAprendiz, "conceitos"> | undefined): ReadonlyMap<string, string> {
	const nomes = new Map<string, string>();
	for (const conceito of indicadores?.conceitos ?? []) if (conceito.nome) nomes.set(`${conceito.materia}/${conceito.conceito}`, conceito.nome);
	return nomes;
}

/** Os nomes dos conceitos do evento que a tela conhece; os que não estão nos indicadores ficam de fora. */
export function conceitosNomeadosDoEvento(evento: Pick<EventoLido, "objeto">, nomes: ReadonlyMap<string, string>): string[] {
	const materia = materiaDoEvento(evento) ?? "";
	return conceitosDoEvento(evento)
		.map((conceito) => nomes.get(`${materia}/${conceito}`))
		.filter((nome): nome is string => nome !== undefined);
}

/** Os ids de hipótese que o evento cita (objeto.hipotese, ou o objeto.id das mudanças), para voltar às hipóteses. */
export function hipotesesDoEvento(evento: Pick<EventoLido, "objeto">): string[] {
	const objeto = ehObjeto(evento.objeto) ? evento.objeto : {};
	const ids = [objeto.hipotese, objeto.hipoteses].flat().filter((id): id is string => typeof id === "string" && id !== "");
	return [...new Set(ids)];
}

/** Os ids das hipóteses que citam o evento (nas evidências, nas mudanças pendentes ou no objeto do próprio evento). */
export function hipotesesQueCitam(
	evento: Pick<EventoLido, "id" | "objeto">,
	estado: { hipoteses: readonly Pick<Hipotese, "id" | "aFavor" | "contra">[]; mudancas: readonly Pick<MudancaPendente, "hipotese" | "evidencias">[] } | undefined,
): string[] {
	if (!estado) return [];
	const existentes = new Set(estado.hipoteses.map((hipotese) => hipotese.id));
	const ids = new Set<string>();
	for (const hipotese of estado.hipoteses) if (hipotese.aFavor.includes(evento.id) || hipotese.contra.includes(evento.id)) ids.add(hipotese.id);
	for (const mudanca of estado.mudancas) if (mudanca.evidencias.includes(evento.id)) ids.add(mudanca.hipotese);
	for (const id of hipotesesDoEvento(evento)) ids.add(id);
	return [...ids].filter((id) => existentes.has(id));
}

// --- As fichas de evidência -------------------------------------------------------------

/** O que a ficha de uma evidência mostra: o evento, se o Histórico o conhece. */
export interface FichaDeEvidencia {
	id: string;
	/** O id em forma curta. */
	curto: string;
	/** conhecido: o Histórico tem o evento; antigo: passou do limite do Histórico; removido: nenhum arquivo o tem. */
	situacao: "conhecido" | "antigo" | "removido" | "pendente";
	/** O texto da ficha: "Respondeu uma questão · 08/11", ou "evento removido". */
	rotulo: string;
	/** A explicação completa (a dica da ficha). */
	dica: string;
}

/**
 * A ficha de uma evidência. Com o Histórico ainda sem chegar (`eventos` undefined), a ficha mostra só o id curto
 * ("pendente"). Um id que não está nos eventos lidos é "evento removido"; só quando o Histórico está cheio (até o
 * limite) e o id é mais antigo que o mais antigo lido (os ids ordenam pelo tempo) ele é "antigo": pode existir.
 */
export function fichaDaEvidencia(id: string, eventos: readonly EventoLido[] | undefined): FichaDeEvidencia {
	const curto = idCurtoDoEvento(id);
	if (!eventos) return { id, curto, situacao: "pendente", rotulo: curto, dica: `Evento ${id}` };
	const achado = eventos.find((evento) => evento.id === id);
	if (achado) {
		const rotulo = `${verboEmPortugues(achado.verbo)} · ${diaCurtoDoEvento(achado.ts)}`;
		return { id, curto, situacao: "conhecido", rotulo, dica: `${rotulo} (${curto}). Abre o evento no Histórico.` };
	}
	const maisAntigo = eventos.reduce<string | undefined>((menor, evento) => (menor === undefined || evento.id < menor ? evento.id : menor), undefined);
	if (eventos.length >= LIMITE_HISTORICO && maisAntigo !== undefined && id < maisAntigo) {
		return { id, curto, situacao: "antigo", rotulo: `evento antigo · ${curto}`, dica: `O evento ${id} é mais antigo que os ${LIMITE_HISTORICO} que o Histórico mostra.` };
	}
	return { id, curto, situacao: "removido", rotulo: "evento removido", dica: `O evento ${id} não está mais nos arquivos.` };
}

/** Para onde levar uma ficha: a matéria da rota só continua se for a do evento (senão o filtro esconderia o evento). */
export function materiaParaAbrirOEvento(materiaDaRota: string | undefined, evento: Pick<EventoLido, "objeto"> | undefined): string | undefined {
	if (!materiaDaRota) return undefined;
	if (!evento) return materiaDaRota;
	return materiaDoEvento(evento) === materiaDaRota ? materiaDaRota : undefined;
}

// --- Dados que chegam da ponte ---------------------------------------------------------

/** Os eventos de uma mensagem `historico`; o que não tem id, instante e verbo é descartado. */
export function eventosDaMensagem(dados: unknown): EventoLido[] | undefined {
	if (!ehObjeto(dados) || !Array.isArray(dados.eventos)) return undefined;
	const eventos: EventoLido[] = [];
	for (const bruto of dados.eventos) {
		if (!ehObjeto(bruto) || typeof bruto.id !== "string" || typeof bruto.ts !== "string" || typeof bruto.verbo !== "string") continue;
		eventos.push({
			id: bruto.id,
			ts: bruto.ts,
			...(typeof bruto.sessao === "string" ? { sessao: bruto.sessao } : {}),
			verbo: bruto.verbo,
			objeto: ehObjeto(bruto.objeto) ? bruto.objeto : {},
			...(ehObjeto(bruto.resultado) ? { resultado: bruto.resultado } : {}),
		});
	}
	return eventos;
}

