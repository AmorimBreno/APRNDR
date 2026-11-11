// As partes puras da tela "Perfil do aprendiz" (TelaAprendiz.tsx; docs/aprendiz.md, seções 2 e 7): a aba e a
// rota, o filtro de matéria, a ordem da lista, as faixas de domínio, os números em pt-BR e os textos curtos
// ("há 3 dias", a leitura do Brier). Sem React e sem nada do Node.
//
// Caminho da tela: aprendiz/<aba>[/<matéria>]. Nesta parte só existe a aba indicadores (as outras entram na
// parte B); a matéria é o id dela e filtra tudo, e sem matéria a tela mostra todas.

import type { IconName } from "@estudos/design-system";
import type { IndicadoresAprendiz, IndicadoresConceito } from "../../lib/aprendiz-indicadores-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";

// --- As abas e as rotas ------------------------------------------------------

export type AbaAprendiz = "indicadores";

export interface InfoAbaAprendiz {
	id: AbaAprendiz;
	nome: string;
	icone: IconName;
}

/** As abas da tela, na ordem em que aparecem. A parte A só tem Indicadores: nada de aba desligada no lugar das outras. */
export const ABAS_DO_APRENDIZ: readonly InfoAbaAprendiz[] = [{ id: "indicadores", nome: "Indicadores", icone: "chart" }];

/** A aba que a rota abre; sem aba ou com uma que não existe, Indicadores. */
export const abaDaRotaAprendiz = (aba?: string): AbaAprendiz => ABAS_DO_APRENDIZ.find((item) => item.id === aba)?.id ?? "indicadores";

/** A rota da tela, com a matéria do filtro quando houver (aprendiz/indicadores/calculo-i). */
export const rotaDoAprendiz = (aba: AbaAprendiz = "indicadores", materia?: string): string => `aprendiz/${aba}${materia ? `/${materia}` : ""}`;

/** A dica do botão que abre a tela, na tela de cadernos. */
export const TITULO_APRENDIZ = "Indicadores por conceito, calculados das suas respostas";

/** O caminho é o da tela do aprendiz. */
export const ehRotaDoAprendiz = (caminho: string): boolean => caminho === "aprendiz" || caminho.startsWith("aprendiz/");

/** Para onde o voltar da tela leva: os cadernos (de onde ela foi aberta). */
export const rotaDeVoltarDoAprendiz = (): string => "";

// --- O filtro de matéria ----------------------------------------------------------

/** A matéria como a tela de cadernos a conhece (o que a TelaEstudos já tem). */
export type MateriaConhecida = Pick<Materia, "id" | "nome" | "cor">;

/** Os conceitos da matéria; sem matéria no filtro, todos (a mesma lista, sem copiar). */
export const filtrarPorMateria = (conceitos: readonly IndicadoresConceito[], materia?: string): IndicadoresConceito[] =>
	materia ? conceitos.filter((conceito) => conceito.materia === materia) : [...conceitos];

/** Os ids das matérias que aparecem nos dados, sem repetir, na ordem em que aparecem. */
export function materiasDosDados(conceitos: readonly IndicadoresConceito[]): string[] {
	return [...new Set(conceitos.map((conceito) => conceito.materia))];
}

/** O nome da matéria, se a tela já o conhece. */
export const nomeDaMateria = (id: string, materias: ReadonlyArray<Pick<MateriaConhecida, "id" | "nome">>): string | undefined => materias.find((materia) => materia.id === id)?.nome;

/**
 * As opções do filtro: "Todas as matérias" (valor vazio) e uma por matéria que aparece nos dados, em ordem
 * alfabética pelo nome (o id, se o nome não é conhecido). O id do filtro que não está nos dados continua
 * escolhível (a rota pode vir de um link). Com `aguardando` (a lista de matérias ainda não chegou), o rótulo
 * do filtro escolhido fica em branco em vez de mostrar o id cru por um instante.
 */
export function opcoesDeMateriaAprendiz(
	ids: readonly string[],
	materias: ReadonlyArray<Pick<MateriaConhecida, "id" | "nome">>,
	atual?: string,
	aguardando = false,
): Array<{ value: string; label: string }> {
	const todos = atual && !ids.includes(atual) ? [...ids, atual] : [...ids];
	const rotulo = (id: string) => (aguardando && id === atual ? " " : (nomeDaMateria(id, materias) ?? id));
	const opcoes = todos.map((id) => ({ value: id, label: rotulo(id) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
	return [{ value: "", label: "Todas as matérias" }, ...opcoes];
}

// --- A ordem e as faixas de domínio -------------------------------------------------

export type FaixaDominio = "baixo" | "medio" | "alto";

/** Abaixo disto, o domínio é baixo. */
export const LIMITE_DOMINIO_MEDIO = 0.4;
/** Daqui para cima, o domínio é alto. Um acerto isolado do BKT dá cerca de 71%: fica "médio" até haver mais evidência. */
export const LIMITE_DOMINIO_ALTO = 0.75;

export const faixaDoDominio = (dominio: number): FaixaDominio => (dominio >= LIMITE_DOMINIO_ALTO ? "alto" : dominio >= LIMITE_DOMINIO_MEDIO ? "medio" : "baixo");

/** O nome da faixa como a tela o escreve. */
export const NOME_DA_FAIXA: Readonly<Record<FaixaDominio, string>> = { baixo: "baixo", medio: "médio", alto: "alto" };

/** A frase que diz onde passam as faixas (a tela a mostra abaixo do resumo). */
export const LEGENDA_DAS_FAIXAS = `Domínio alto: ${Math.round(LIMITE_DOMINIO_ALTO * 100)}% ou mais. Médio: de ${Math.round(LIMITE_DOMINIO_MEDIO * 100)}% a ${Math.round(LIMITE_DOMINIO_ALTO * 100)}%. Baixo: abaixo de ${Math.round(LIMITE_DOMINIO_MEDIO * 100)}%.`;

/**
 * O conceito não tem nenhuma resposta observada (só a autoavaliação, ou nada). O `dominio` dele é o início do BKT,
 * não um domínio medido: a tela não o mostra como porcentagem nem o conta nas faixas.
 */
export const semRespostas = (conceito: Pick<IndicadoresConceito, "observacoes">): boolean => conceito.observacoes === 0;

/** Os conceitos de cada faixa, na ordem em que vieram. Os sem respostas ficam de fora (ver semRespostas). */
export function agruparPorFaixa(conceitos: readonly IndicadoresConceito[]): Record<FaixaDominio, IndicadoresConceito[]> {
	const grupos: Record<FaixaDominio, IndicadoresConceito[]> = { baixo: [], medio: [], alto: [] };
	for (const conceito of conceitos) if (!semRespostas(conceito)) grupos[faixaDoDominio(conceito.dominio)].push(conceito);
	return grupos;
}

/** O resumo do topo: quantos conceitos, quantos em cada faixa e quantos só têm autoavaliação (à parte das faixas). */
export interface ResumoDosConceitos {
	conceitos: number;
	alto: number;
	medio: number;
	baixo: number;
	soAutoavaliados: number;
}

export function resumirConceitos(conceitos: readonly IndicadoresConceito[]): ResumoDosConceitos {
	const grupos = agruparPorFaixa(conceitos);
	return {
		conceitos: conceitos.length,
		alto: grupos.alto.length,
		medio: grupos.medio.length,
		baixo: grupos.baixo.length,
		soAutoavaliados: conceitos.filter(semRespostas).length,
	};
}

const instante = (ts: string): number => {
	const valor = Date.parse(ts);
	return Number.isNaN(valor) ? Number.NEGATIVE_INFINITY : valor;
};

/** A chave estável de um conceito na lista (o id do mapa só vale dentro da matéria). */
export const chaveDoConceito = (conceito: Pick<IndicadoresConceito, "materia" | "conceito">): string => `${conceito.materia}/${conceito.conceito}`;

/**
 * Do menor domínio para o maior; no empate, a observação mais recente primeiro; no empate de novo, a matéria e o
 * id do conceito (a ordem não pode depender da ordem em que os dados chegaram). Os conceitos sem respostas (domínio
 * que não foi medido) vão para o fim, entre si pela atividade mais recente. Devolve uma lista nova.
 */
export function ordenarConceitos(conceitos: readonly IndicadoresConceito[]): IndicadoresConceito[] {
	return [...conceitos].sort((a, b) => {
		if (semRespostas(a) !== semRespostas(b)) return semRespostas(a) ? 1 : -1;
		if (!semRespostas(a) && a.dominio !== b.dominio) return a.dominio - b.dominio;
		const recente = instante(b.ultima) - instante(a.ultima);
		if (recente !== 0 && !Number.isNaN(recente)) return recente;
		return chaveDoConceito(a).localeCompare(chaveDoConceito(b), "pt-BR");
	});
}

// --- Números em pt-BR -----------------------------------------------------------

const umaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const duasCasas = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Um inteiro com o separador de milhar do pt-BR. */
export const formatarInteiro = (valor: number): string => inteiro.format(valor);

/** Acertos e erros ponderados: no máximo uma casa, com vírgula ("2,4"). */
export const formatarPonderado = (valor: number): string => umaCasa.format(Math.round(valor * 10) / 10);

/** O domínio de 0 a 1 como porcentagem inteira ("71%"). */
export const formatarDominio = (dominio: number): string => `${Math.round(Math.max(0, Math.min(1, dominio)) * 100)}%`;

/** O ganho normalizado com sinal e duas casas ("+0,45", "−0,20"); "—" quando não há (menos de 2 sessões). */
export function formatarGanho(ganho: number | null): string {
	if (ganho === null || !Number.isFinite(ganho)) return "—";
	const arredondado = Math.round(ganho * 100) / 100;
	const texto = duasCasas.format(Math.abs(arredondado));
	return arredondado > 0 ? `+${texto}` : arredondado < 0 ? `−${texto}` : texto;
}

/** O Brier com duas casas ("0,18"); "—" quando o conceito não teve resposta com confiança. */
export const formatarBrier = (brier: number | null): string => (brier === null || !Number.isFinite(brier) ? "—" : duasCasas.format(brier));

/** Com menos observações que isto, o Brier é só uma pista e a tela não o interpreta. */
export const MINIMO_PARA_LER_O_BRIER = 3;

/**
 * Uma leitura curta do Brier, só com base nele e com cuidado: com poucas observações, "poucos dados"; depois,
 * "bem calibrado" até 0,10, "razoável" até 0,25 (o que um palpite fixo em 50% daria) e "pouco calibrado" acima.
 * Não diz se foi excesso ou falta de confiança: o Brier sozinho não mostra o lado. Vazio quando não há Brier.
 */
export function leituraDoBrier(brier: number | null, observacoes: number): string {
	if (brier === null || !Number.isFinite(brier)) return "";
	if (observacoes < MINIMO_PARA_LER_O_BRIER) return "poucos dados";
	if (brier <= 0.1) return "bem calibrado";
	if (brier <= 0.25) return "razoável";
	return "pouco calibrado";
}

/** A autoavaliação ("3 de 4"); "—" se o Breno nunca se avaliou no conceito. */
export const formatarQueDisse = (nivel: number | undefined): string => (nivel === undefined ? "—" : `${formatarInteiro(nivel)} de 4`);

const plural = (quantos: number, singular: string, pluralDe: string): string => `${formatarInteiro(quantos)} ${quantos === 1 ? singular : pluralDe}`;

/** "1 evento", "3 eventos". */
export const contarEventos = (quantos: number): string => plural(quantos, "evento", "eventos");

// --- Textos curtos ------------------------------------------------------------------

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * Quanto tempo faz, em português: "agora", "há 5 min", "há 3 h", "há 1 dia", "há 3 dias", "há 2 meses", "há 1 ano".
 * "—" para um instante que não é data. Um instante no futuro (relógios diferentes) vale "agora".
 */
export function textoHaQuanto(ts: string, agora: Date | number = Date.now()): string {
	const valor = Date.parse(ts);
	if (Number.isNaN(valor)) return "—";
	const passou = (typeof agora === "number" ? agora : agora.getTime()) - valor;
	if (passou < MINUTO) return "agora";
	if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`;
	if (passou < DIA) return `há ${Math.floor(passou / HORA)} h`;
	const dias = Math.floor(passou / DIA);
	if (dias < 30) return `há ${plural(dias, "dia", "dias")}`;
	if (dias < 365) return `há ${plural(Math.floor(dias / 30), "mês", "meses")}`;
	return `há ${plural(Math.floor(dias / 365), "ano", "anos")}`;
}

/** O id de um evento em forma curta: a parte aleatória (os ids começam todos iguais dentro do mesmo minuto). */
export function idCurtoDoEvento(id: string): string {
	const depois = id.includes("-") ? id.slice(id.lastIndexOf("-") + 1) : id;
	return (depois || id).slice(-8);
}

/** O id de um conceito em forma curta (os do mapa já são curtos; um id comprido é cortado). */
export const idCurtoDoConceito = (id: string): string => (id.length > 12 ? `${id.slice(0, 11)}…` : id);

/** O nome do conceito, ou o aviso de que o mapa não o tem mais. */
export const nomeDoConceito = (conceito: Pick<IndicadoresConceito, "nome">): string => conceito.nome || "Conceito removido do mapa";

/** Os eventos mostrados nos detalhes de um conceito: os mais recentes (os ids ordenam pelo tempo), e quantos ficaram de fora. */
export const LIMITE_EVENTOS_NOS_DETALHES = 20;

export function eventosParaMostrar(eventos: readonly string[]): { ids: string[]; escondidos: number } {
	const ordenados = [...eventos].sort();
	const escondidos = Math.max(0, ordenados.length - LIMITE_EVENTOS_NOS_DETALHES);
	return { ids: ordenados.slice(escondidos), escondidos };
}

/**
 * O que a tela diz dos eventos que o cálculo ignorou (vale para todas as matérias): vazio se nenhum;
 * senão, a contagem e o motivo de cada parte ("2 de matéria que não existe mais", "1 sem conceito do mapa").
 */
export function textoDosIgnorados(ignorados: IndicadoresAprendiz["ignorados"]): string {
	const { materiaInexistente, semConceito } = ignorados;
	const total = materiaInexistente + semConceito;
	if (total <= 0) return "";
	const partes: string[] = [];
	if (materiaInexistente > 0) partes.push(`${formatarInteiro(materiaInexistente)} de matéria que não existe mais`);
	if (semConceito > 0) partes.push(`${formatarInteiro(semConceito)} sem conceito do mapa`);
	return `${plural(total, "evento ignorado", "eventos ignorados")} no cálculo: ${partes.join(" e ")}.`;
}
