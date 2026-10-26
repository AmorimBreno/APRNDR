// As partes puras da etapa Esqueleto do guia de curso (EtapaEsqueleto.tsx) e
// da visão do curso pronto (TelaCurso.tsx), docs/cursos.md, "Parte C: o
// esqueleto e o curso pronto": os rótulos das datas e do prazo, as linhas do
// calendário, o motivo do "Criar curso" desligado, o menu "Mover para…" e as
// leituras do cabeçalho do curso pronto.

import { pad2 } from "@estudos/design-system";
import type { Curso, DadosBasico } from "../../lib/curso-tipos.ts";
import { type CalendarioCurso, diasEntre, type Modulo, validarModulos } from "../../lib/esqueleto-tipos.ts";
import { quando } from "./comum.ts";
import { numeroCurto } from "./diagnostico-tela.ts";
import { dataNumerica, OPCOES_ESCOPO, OPCOES_TIPO } from "./guia-curso.ts";

// --- Datas e prazo ------------------------------------------------------------------

/** "de 27/10 a 02/11"; num módulo de um dia só, "em 27/10". */
export function periodoDoModulo(inicio: string, fim: string): string {
	return inicio === fim ? `em ${dataNumerica(inicio)}` : `de ${dataNumerica(inicio)} a ${dataNumerica(fim)}`;
}

/** "Prazo: P1 em 20/11", "Prazo: 20/11" (sem prova) ou "Sem prazo". */
export function rotuloPrazo(basico: Pick<DadosBasico, "prazo" | "prova"> | null | undefined): string {
	if (!basico?.prazo) return "Sem prazo";
	return basico.prova ? `Prazo: ${basico.prova} em ${dataNumerica(basico.prazo)}` : `Prazo: ${dataNumerica(basico.prazo)}`;
}

/** "4 h por semana", "2,5 h por semana". */
export const textoHorasPorSemana = (horas: number) => `${numeroCurto(horas)} h por semana`;

/** "6 módulos", "1 módulo". */
export const textoModulos = (quantos: number) => `${quantos} ${quantos === 1 ? "módulo" : "módulos"}`;

/**
 * O prazo da visão do curso: o nome da prova (se veio de uma) e a data, e
 * quanto falta: { valor: "P1 em 20/11", falta: "em 25 dias" }; "hoje" e
 * "amanhã" pelo quando(); um prazo que já passou, "já passou". Sem prazo,
 * { valor: "Sem prazo" }.
 */
export function prazoDoCurso(basico: Pick<DadosBasico, "prazo" | "prova"> | null | undefined, hoje: string): { valor: string; falta?: string } {
	if (!basico?.prazo) return { valor: "Sem prazo" };
	const valor = basico.prova ? `${basico.prova} em ${dataNumerica(basico.prazo)}` : dataNumerica(basico.prazo);
	const dias = diasEntre(hoje, basico.prazo);
	return { valor, falta: dias < 0 ? "já passou" : quando(dias) };
}

/** "P1 em 20/11, em 25 dias" ou "Sem prazo" (a frase inteira do prazo do curso). */
export function textoPrazoDoCurso(basico: Pick<DadosBasico, "prazo" | "prova"> | null | undefined, hoje: string): string {
	const prazo = prazoDoCurso(basico, hoje);
	return prazo.falta ? `${prazo.valor}, ${prazo.falta}` : prazo.valor;
}

// --- O calendário --------------------------------------------------------------------

/** Uma linha do calendário na tela. */
export interface LinhaCalendario {
	id: string;
	/** "01". */
	numero: string;
	/** "01 · A reta de regressão" (sem nome, "01 · Sem nome"). */
	titulo: string;
	/** "de 27/10 a 02/11". */
	periodo: string;
	/** "avaliação 03/11". */
	avaliacao: string;
}

/** O calendário como a tela mostra: uma linha por módulo (na ordem dos módulos), a avaliação geral e o resumo das horas e dos dias. */
export interface CalendarioNaTela {
	linhas: LinhaCalendario[];
	/** "Avaliação geral 19/11". */
	avaliacaoGeral: string;
	/** "12 h em 24 dias": a soma das horas dos módulos e os dias corridos do começo do primeiro módulo até a avaliação geral (os dois contados). */
	resumo: string;
	avisos: string[];
}

/**
 * As linhas do calendário, na ordem dos módulos, pelas datas do calendário
 * (pelo id do módulo; um módulo sem datas fica de fora).
 */
export function calendarioNaTela(modulos: ReadonlyArray<Pick<Modulo, "id" | "nome" | "horas">>, calendario: CalendarioCurso): CalendarioNaTela {
	const porId = new Map(calendario.modulos.map((item) => [item.id, item]));
	const linhas: LinhaCalendario[] = [];
	for (const [indice, modulo] of modulos.entries()) {
		const datas = porId.get(modulo.id);
		if (!datas) continue;
		const numero = pad2(indice + 1);
		linhas.push({
			id: modulo.id,
			numero,
			titulo: `${numero} · ${modulo.nome.trim() || "Sem nome"}`,
			periodo: periodoDoModulo(datas.inicio, datas.fim),
			avaliacao: `avaliação ${dataNumerica(datas.avaliacao)}`,
		});
	}
	const horas = modulos.reduce((soma, modulo) => soma + modulo.horas, 0);
	const primeiro = calendario.modulos[0];
	const dias = primeiro ? diasEntre(primeiro.inicio, calendario.avaliacaoGeral) + 1 : 0;
	return {
		linhas,
		avaliacaoGeral: `Avaliação geral ${dataNumerica(calendario.avaliacaoGeral)}`,
		resumo: `${numeroCurto(horas)} h em ${dias} ${dias === 1 ? "dia" : "dias"}`,
		avisos: [...calendario.avisos],
	};
}

// --- A edição --------------------------------------------------------------------------

/**
 * Por que o "Criar curso" está desligado (undefined = ligado), na ordem: um
 * módulo vazio, um módulo sem nome, outra regra da validarModulos (a frase
 * dela) e, por último, um salvamento pendente.
 */
export function motivoCriarDesligado(modulos: readonly Modulo[], conceitosDoCurso: readonly string[], pendente: boolean): string | undefined {
	const vazio = modulos.findIndex((modulo) => modulo.conceitos.length === 0);
	if (vazio >= 0) return `O módulo ${pad2(vazio + 1)} está vazio: mova conceitos para ele ou apague-o.`;
	const semNome = modulos.findIndex((modulo) => !modulo.nome.trim());
	if (semNome >= 0) return `Dê um nome ao módulo ${pad2(semNome + 1)}.`;
	const problema = problemaDosModulos(modulos, conceitosDoCurso);
	if (problema) return problema;
	if (pendente) return "Salvando as edições…";
	return undefined;
}

/** A frase da validarModulos para os módulos (undefined = passam). */
export function problemaDosModulos(modulos: unknown, conceitosDoCurso: readonly string[]): string | undefined {
	try {
		validarModulos(modulos, conceitosDoCurso);
		return undefined;
	} catch (falha) {
		return falha instanceof Error ? falha.message : String(falha);
	}
}

/** As opções do menu "Mover para…" de um conceito: os outros módulos, na ordem ("Módulo 02 · Derivadas"). */
export function opcoesMoverPara(modulos: ReadonlyArray<Pick<Modulo, "id" | "nome">>, atual: string): Array<{ id: string; titulo: string }> {
	return modulos.flatMap((modulo, indice) =>
		modulo.id === atual ? [] : [{ id: modulo.id, titulo: `Módulo ${pad2(indice + 1)} · ${modulo.nome.trim() || "Sem nome"}` }],
	);
}

/** Para onde vão os conceitos de um módulo apagado (apagarModulo): o anterior, ou o seguinte se ele é o primeiro. */
export const destinoAoApagar = (indice: number) => (indice > 0 ? "Os conceitos vão para o módulo anterior." : "Os conceitos vão para o módulo seguinte.");

/**
 * Os módulos que a tela mostra: os desta tela (as edições ainda não
 * confirmadas pela extensão) enquanto a proposta é a mesma (o mesmo geradoEm);
 * senão, os da proposta do curso.
 */
export function modulosEmVista(
	emAndamento: { modulos: Modulo[]; geradoEm: string } | null | undefined,
	locais: { geradoEm: string; modulos: Modulo[] } | undefined,
): Modulo[] {
	if (!emAndamento) return [];
	return locais && locais.geradoEm === emAndamento.geradoEm ? locais.modulos : emAndamento.modulos;
}

// --- O curso pronto ------------------------------------------------------------------

/** Uma leitura do cabeçalho do curso pronto. */
export interface LeituraCurso {
	id: "prazo" | "horas" | "modulos" | "conceitos" | "tipo" | "escopo";
	rotulo: string;
	valor: string;
	unidade?: string;
	/** A segunda linha do rótulo (no prazo, quanto falta). */
	detalhe?: string;
	/** O valor é texto, e não número (vai em Archivo, e não na fonte dos números). */
	texto?: boolean;
}

/** As leituras do curso pronto, nesta ordem: prazo, horas por semana, módulos, conceitos, tipo e escopo (os nomes do guia). */
export function leiturasDoCurso(curso: Pick<Curso, "basico" | "mapa" | "objetivo" | "esqueleto">, hoje: string): LeituraCurso[] {
	const prazo = prazoDoCurso(curso.basico, hoje);
	const tipo = OPCOES_TIPO.find((opcao) => opcao.value === curso.objetivo?.tipo)?.label ?? "—";
	const escopo = OPCOES_ESCOPO.find((opcao) => opcao.value === curso.objetivo?.escopo)?.label ?? "—";
	return [
		{ id: "prazo", rotulo: "Prazo", valor: prazo.valor, ...(prazo.falta ? { detalhe: prazo.falta } : {}), texto: true },
		{ id: "horas", rotulo: "Horas por semana", valor: curso.basico ? numeroCurto(curso.basico.horasPorSemana) : "—", unidade: "h" },
		{ id: "modulos", rotulo: "Módulos", valor: String(curso.esqueleto?.modulos.length ?? 0) },
		{ id: "conceitos", rotulo: "Conceitos", valor: String(curso.mapa?.conceitos.length ?? 0) },
		{ id: "tipo", rotulo: "Tipo", valor: tipo, texto: true },
		{ id: "escopo", rotulo: "Escopo", valor: escopo, texto: true },
	];
}

/** As datas de um módulo embaixo do card: "de 27/10 a 02/11 · avaliação 03/11". */
export const datasDoCard = (inicio: string, fim: string, avaliacao: string) => `${periodoDoModulo(inicio, fim)} · avaliação ${dataNumerica(avaliacao)}`;
