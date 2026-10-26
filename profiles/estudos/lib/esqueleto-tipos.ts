// Tipos e regras do esqueleto do guia de cursos (item 5, parte C,
// docs/cursos.md, "Parte C: o esqueleto e o curso pronto") sem nada do Node: a
// tela (profiles/estudos/paineis) importa daqui para editar os módulos e
// mostrar o calendário, e a extensão de cursos aplica as mesmas funções antes
// de gravar; esqueleto.ts reexporta. A proposta em edição fica no curso.json,
// em esqueletoEmAndamento; "Criar curso" a transforma na etapa esqueleto, com
// o calendário do dia (curso-tipos.ts).
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam. Quem conserta a proposta do modelo, confere a
// edição e calcula o calendário é o código, nunca o modelo.

import type { Curso } from "./curso-tipos.ts";
import {
	conferirOrdem,
	ehHorasModulo,
	ehIdModulo,
	ehTipoModulo,
	ErroEsqueleto,
	HORAS_MODULO_MAXIMAS,
	HORAS_MODULO_MINIMAS,
	MODULOS_MAXIMOS,
	MODULOS_MINIMOS,
	PASSO_HORAS_MODULO,
	TIPOS_MODULO,
	validarModulos,
} from "./curso-tipos.ts";

export {
	ehHorasModulo,
	ehIdModulo,
	ehTipoModulo,
	ErroEsqueleto,
	HORAS_MODULO_MAXIMAS,
	HORAS_MODULO_MINIMAS,
	MODULOS_MAXIMOS,
	MODULOS_MINIMOS,
	PASSO_HORAS_MODULO,
	TIPOS_MODULO,
	validarModulos,
};

// --- Formato (curso.json) ------------------------------------------------------

export type TipoModulo = (typeof TIPOS_MODULO)[number];

export const NOMES_TIPO_MODULO: Record<TipoModulo, string> = {
	normal: "Normal",
	curto: "Curto",
	revisao: "Revisão",
};

/** As horas que um módulo ganha quando o modelo manda horas fora do permitido (e o módulo novo da tela). */
export const HORAS_MODULO_PADRAO = 2;

/** Um módulo do curso. */
export interface Modulo {
	/** m1, m2… dados pelo código; um módulo novo ganha o próximo número livre. */
	id: string;
	nome: string;
	/** Uma frase; pode ser vazia. */
	objetivo: string;
	/** Os ids dos conceitos do curso (curso.mapa.conceitos) que o módulo cobre; cada conceito do curso está em exatamente um módulo. */
	conceitos: string[];
	tipo: TipoModulo;
	/** O tempo estimado: de 0,5 a 40, no passo de 0,5. */
	horas: number;
}

/** A proposta de esqueleto em edição (Curso.esqueletoEmAndamento). */
export interface EsqueletoEmAndamento {
	/** Na ordem do curso. */
	modulos: Modulo[];
	/** ISO 8601 da geração da proposta. */
	geradoEm: string;
	/** provedor/id do modelo que gerou a proposta. */
	modelo: string;
	/** US$ da geração. */
	custo: number;
}

/** As datas de um módulo no calendário (AAAA-MM-DD, datas locais). */
export interface CalendarioModulo {
	id: string;
	/** O primeiro dia do módulo. */
	inicio: string;
	/** O último dia do módulo. */
	fim: string;
	/** O dia em que a avaliação do módulo fica disponível: o seguinte ao fim. */
	avaliacao: string;
}

/** O calendário do curso, calculado pelo código (calcularCalendario). */
export interface CalendarioCurso {
	/** Um item por módulo, na ordem dos módulos. */
	modulos: CalendarioModulo[];
	/** AAAA-MM-DD: o dia anterior ao prazo, ou o seguinte ao fim do último módulo sem prazo. */
	avaliacaoGeral: string;
	/** Com prazo apertado: as horas por semana que o plano pede (arredondadas a 0,5). Só aparece quando passa das horas do Básico. */
	horasPorSemanaNecessarias?: number;
	/** As frases para a tela (prazo apertado, prazo que já passou…). */
	avisos: string[];
}

/** O esqueleto do curso criado: a etapa esqueleto. */
export interface Esqueleto extends EsqueletoEmAndamento {
	/** ISO 8601 do "Criar curso". */
	criadoEm: string;
	/** A foto do calendário no dia da criação. */
	calendario: CalendarioCurso;
}

/** O que o modelo do esqueleto (prompts/esqueleto.md) devolve. */
export interface ResultadoEsqueleto {
	modulos: Array<{
		nome: string;
		objetivo: string;
		conceitos: string[];
		tipo: TipoModulo;
		horas: number;
	}>;
}

// --- Funções -------------------------------------------------------------------

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));
const limparTexto = (valor: unknown) => (typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "");

/** Arredonda ao passo de 0,5 e limita a 0,5–40. */
const horasNoPasso = (horas: number) =>
	Math.min(HORAS_MODULO_MAXIMAS, Math.max(HORAS_MODULO_MINIMAS, Math.round(horas / PASSO_HORAS_MODULO) * PASSO_HORAS_MODULO));

/**
 * Conserta a proposta que o modelo devolveu (ResultadoEsqueleto) e devolve os
 * módulos com ids m1, m2… na ordem (docs/cursos.md, "O modelo"):
 * - só ids de conceitos do curso (os outros saem); um conceito repetido fica
 *   no primeiro módulo em que apareceu;
 * - um conceito do curso que faltou entra no módulo do conceito anterior a
 *   ele na ordem do curso, logo depois dele (sem anterior, no começo do
 *   primeiro módulo);
 * - módulos sem conceitos (ou que não são objetos) saem;
 * - tipo fora do permitido vira normal; horas que não são número de 0,5 a 40
 *   viram 2, e as outras são arredondadas ao passo de 0,5;
 * - nome e objetivo sem espaços sobrando; nome vazio vira "Módulo N" (a
 *   posição).
 * Fora de 2 a 12 módulos (de 1 a 12 num curso de um conceito só),
 * ErroEsqueleto (a extensão tenta de novo).
 */
export function consertarProposta(resultado: unknown, conceitosDoCurso: readonly string[]): Modulo[] {
	if (!ehObjeto(resultado) || !Array.isArray(resultado.modulos)) throw new ErroEsqueleto('O modelo não devolveu a lista de módulos (falta "modulos").');
	const ordem = [...new Set(conceitosDoCurso)];
	const doCurso = new Set(ordem);
	const usados = new Set<string>();
	const lidos: Array<Omit<Modulo, "id">> = [];
	for (const item of resultado.modulos as unknown[]) {
		if (!ehObjeto(item) || !Array.isArray(item.conceitos)) continue;
		const conceitos: string[] = [];
		for (const valor of item.conceitos as unknown[]) {
			const id = typeof valor === "string" ? valor.trim() : "";
			if (!doCurso.has(id) || usados.has(id)) continue;
			usados.add(id);
			conceitos.push(id);
		}
		if (conceitos.length === 0) continue;
		const horas = typeof item.horas === "number" && Number.isFinite(item.horas) && item.horas >= HORAS_MODULO_MINIMAS && item.horas <= HORAS_MODULO_MAXIMAS
			? horasNoPasso(item.horas)
			: HORAS_MODULO_PADRAO;
		lidos.push({ nome: limparTexto(item.nome), objetivo: limparTexto(item.objetivo), conceitos, tipo: ehTipoModulo(item.tipo) ? item.tipo : "normal", horas });
	}
	if (lidos.length > 0) {
		for (const [indice, id] of ordem.entries()) {
			if (usados.has(id)) continue;
			let colocado = false;
			for (let anterior = indice - 1; anterior >= 0 && !colocado; anterior--) {
				const vizinho = ordem[anterior]!;
				const modulo = lidos.find((item) => item.conceitos.includes(vizinho));
				if (!modulo) continue;
				modulo.conceitos.splice(modulo.conceitos.indexOf(vizinho) + 1, 0, id);
				colocado = true;
			}
			if (!colocado) lidos[0]!.conceitos.unshift(id);
			usados.add(id);
		}
	}
	const minimo = Math.min(MODULOS_MINIMOS, ordem.length);
	if (lidos.length < minimo || lidos.length > MODULOS_MAXIMOS) {
		throw new ErroEsqueleto(
			`O modelo devolveu ${lidos.length} módulo${lidos.length === 1 ? "" : "s"} com conceitos do curso; o esqueleto precisa de ${minimo} a ${MODULOS_MAXIMOS}.`,
		);
	}
	return lidos.map((modulo, indice) => ({
		id: `m${indice + 1}`,
		nome: modulo.nome || `Módulo ${indice + 1}`,
		objetivo: modulo.objetivo,
		conceitos: modulo.conceitos,
		tipo: modulo.tipo,
		horas: modulo.horas,
	}));
}

// --- Datas -----------------------------------------------------------------------
// Datas locais em AAAA-MM-DD, sem fuso: a conta é feita em dias corridos sobre
// o calendário (UTC só como régua), então horário de verão não muda nada.

const MS_DIA = 86_400_000;

/** O número do dia (dias desde 1970-01-01) de uma data AAAA-MM-DD que existe; senão, null. */
function numeroDoDia(texto: string): number | null {
	const achado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
	if (!achado) return null;
	const [ano, mes, dia] = [Number(achado[1]), Number(achado[2]), Number(achado[3])];
	const data = new Date(Date.UTC(ano, mes - 1, dia));
	if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
	return Math.round(data.getTime() / MS_DIA);
}

function dataDoNumero(numero: number): string {
	const data = new Date(numero * MS_DIA);
	const dois = (valor: number) => String(valor).padStart(2, "0");
	return `${String(data.getUTCFullYear()).padStart(4, "0")}-${dois(data.getUTCMonth() + 1)}-${dois(data.getUTCDate())}`;
}

function conferirData(texto: unknown, oQue: string): number {
	const numero = typeof texto === "string" ? numeroDoDia(texto) : null;
	if (numero === null) throw new ErroEsqueleto(`${oQue} precisa ser uma data no formato AAAA-MM-DD (veio "${mostrar(texto)}").`);
	return numero;
}

/** A data `dias` dias depois (ou antes, com negativo) de `data` (AAAA-MM-DD). */
export function somarDias(data: string, dias: number): string {
	return dataDoNumero(conferirData(data, "A data") + dias);
}

/** Quantos dias de `de` até `ate` (AAAA-MM-DD): 0 no mesmo dia, negativo se `ate` vem antes. */
export function diasEntre(de: string, ate: string): number {
	return conferirData(ate, "A data") - conferirData(de, "A data");
}

/** 20/11/2026, para as frases dos avisos. */
const dataNaFrase = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

/** 7, 6,5: o número com vírgula, para as frases dos avisos. */
const numeroNaFrase = (numero: number) => String(numero).replace(".", ",");

// --- O calendário ------------------------------------------------------------------

/** O que o calendário precisa além dos módulos: o Básico do curso e o dia de hoje. */
export interface OpcoesCalendario {
	/** basico.horasPorSemana. */
	horasPorSemana: number;
	/** basico.prazo (AAAA-MM-DD), ou null = sem prazo. */
	prazo: string | null;
	/** AAAA-MM-DD (hojeLocal()). */
	hoje: string;
}

/** Os dias corridos de um módulo: ceil(horas / horasPorSemana × 7), pelo menos 1. */
export function diasDoModulo(horas: number, horasPorSemana: number): number {
	// O epsilon evita que um 7,0000000001 da conta em ponto flutuante vire 8.
	return Math.max(1, Math.ceil((horas * 7) / horasPorSemana - 1e-9));
}

/**
 * Encolhe as durações na mesma proporção para somarem exatamente `disponiveis`
 * dias, cada uma com pelo menos 1 (pede disponiveis >= quantidade). Quem a
 * proporção deixaria abaixo de 1 fica com 1, e a proporção é refeita com os
 * outros; a parte inteira vai para cada um, e os dias que sobram, um para
 * cada, para as maiores frações (no empate, o primeiro). Contas em inteiros.
 */
function encolher(duracoes: readonly number[], disponiveis: number): number[] {
	const fixos = new Set<number>();
	for (;;) {
		const livres = duracoes.map((_, indice) => indice).filter((indice) => !fixos.has(indice));
		const dias = disponiveis - fixos.size;
		const soma = livres.reduce((total, indice) => total + duracoes[indice]!, 0);
		const abaixo = livres.filter((indice) => duracoes[indice]! * dias < soma);
		if (abaixo.length === 0 || livres.length === 0) {
			const saida = duracoes.map((duracao, indice) => (fixos.has(indice) || soma === 0 ? 1 : Math.floor((duracao * dias) / soma)));
			let sobra = disponiveis - saida.reduce((total, valor) => total + valor, 0);
			const porFracao = livres
				.map((indice) => ({ indice, fracao: soma === 0 ? 0 : (duracoes[indice]! * dias) % soma }))
				.sort((a, b) => b.fracao - a.fracao || a.indice - b.indice);
			for (const { indice } of porFracao) {
				if (sobra <= 0) break;
				saida[indice]!++;
				sobra--;
			}
			return saida;
		}
		for (const indice of abaixo) fixos.add(indice);
	}
}

/**
 * O calendário do curso (docs/cursos.md, "O calendário"), o mesmo na tela e
 * na extensão:
 * - os módulos vão em sequência a partir de amanhã, cada um com
 *   diasDoModulo(horas, horasPorSemana) dias corridos; o seguinte começa no
 *   dia depois do fim do anterior;
 * - a avaliação de cada módulo fica no dia seguinte ao fim dele;
 * - com prazo: a avaliação geral fica no dia anterior ao prazo, e os módulos
 *   precisam acabar antes dela; se não cabem, as durações encolhem na mesma
 *   proporção (cada módulo com pelo menos 1 dia), e quando as horas por
 *   semana que isso pede (horas dos módulos × 7 / dias disponíveis,
 *   arredondadas a 0,5) passam das do Básico, vão em
 *   horasPorSemanaNecessarias e num aviso;
 * - sem prazo: a avaliação geral fica no dia seguinte ao fim do último módulo
 *   (sem módulos, amanhã);
 * - prazo que já passou, que é hoje ou amanhã, ou que não deixa um dia para
 *   cada módulo antes da avaliação geral: aviso, e o calendário segue como
 *   sem prazo.
 * Hoje ou prazo fora do formato, ou horas por semana que não são um número
 * maior que zero, ErroEsqueleto.
 */
export function calcularCalendario(modulos: ReadonlyArray<Pick<Modulo, "id" | "horas">>, opcoes: OpcoesCalendario): CalendarioCurso {
	const hoje = conferirData(opcoes.hoje, "O dia de hoje");
	const { horasPorSemana, prazo } = opcoes;
	if (typeof horasPorSemana !== "number" || !Number.isFinite(horasPorSemana) || horasPorSemana <= 0) {
		throw new ErroEsqueleto(`As horas por semana precisam ser um número maior que zero (veio "${mostrar(horasPorSemana)}").`);
	}
	const amanha = hoje + 1;
	let duracoes = modulos.map((modulo) => diasDoModulo(modulo.horas, horasPorSemana));
	const avisos: string[] = [];
	let avaliacaoGeral: number | null = null;
	let horasPorSemanaNecessarias: number | undefined;
	if (prazo !== null && prazo !== undefined && prazo !== "") {
		const dia = conferirData(prazo, "O prazo");
		const naFrase = dataNaFrase(prazo);
		if (dia < hoje) avisos.push(`O prazo (${naFrase}) já passou; o calendário segue sem prazo.`);
		else if (dia === hoje) avisos.push(`O prazo (${naFrase}) é hoje; o calendário segue sem prazo.`);
		else if (dia === amanha) avisos.push(`O prazo (${naFrase}) é amanhã e não deixa dias para os módulos; o calendário segue sem prazo.`);
		else {
			const geral = dia - 1;
			const disponiveis = geral - amanha;
			const total = duracoes.reduce((soma, valor) => soma + valor, 0);
			if (total <= disponiveis) avaliacaoGeral = geral;
			else if (modulos.length > disponiveis) {
				avisos.push(`Até o prazo (${naFrase}) não há um dia para cada módulo antes da avaliação geral; o calendário segue sem prazo.`);
			} else {
				duracoes = encolher(duracoes, disponiveis);
				avaliacaoGeral = geral;
				const horas = modulos.reduce((soma, modulo) => soma + modulo.horas, 0);
				const pede = Math.round(((horas * 7) / disponiveis) * 2) / 2;
				if (pede > horasPorSemana) {
					horasPorSemanaNecessarias = pede;
					avisos.push(`No prazo, este plano pede cerca de ${numeroNaFrase(pede)} h por semana; você disse ${numeroNaFrase(horasPorSemana)}.`);
				}
			}
		}
	}
	let cursor = amanha;
	const datas = modulos.map((modulo, indice): CalendarioModulo => {
		const inicio = cursor;
		const fim = inicio + duracoes[indice]! - 1;
		cursor = fim + 1;
		return { id: modulo.id, inicio: dataDoNumero(inicio), fim: dataDoNumero(fim), avaliacao: dataDoNumero(fim + 1) };
	});
	return {
		modulos: datas,
		avaliacaoGeral: dataDoNumero(avaliacaoGeral ?? cursor),
		...(horasPorSemanaNecessarias !== undefined ? { horasPorSemanaNecessarias } : {}),
		avisos,
	};
}

// --- Edição na tela ------------------------------------------------------------------
// Cada operação devolve os módulos novos (cópias), na ordem. Elas não fazem a
// validação estrita (validarModulos): um módulo novo começa vazio e só é
// barrado ao salvar.

function indiceDoModulo(modulos: readonly Modulo[], id: string): number {
	const indice = modulos.findIndex((modulo) => modulo.id === id);
	if (indice < 0) throw new ErroEsqueleto(`Não achei o módulo "${mostrar(id)}".`);
	return indice;
}

/** Os módulos copiados, com `mudar` aplicado ao módulo `id`. */
function comModulo(modulos: readonly Modulo[], id: string, mudar: (modulo: Modulo) => void): Modulo[] {
	const indice = indiceDoModulo(modulos, id);
	const novos = structuredClone(modulos) as Modulo[];
	mudar(novos[indice]!);
	return novos;
}

/** Troca o nome do módulo (como veio; a limpeza é ao salvar). */
export function renomearModulo(modulos: readonly Modulo[], id: string, nome: string): Modulo[] {
	return comModulo(modulos, id, (modulo) => {
		modulo.nome = nome;
	});
}

/** Troca o objetivo do módulo (como veio; a limpeza é ao salvar). */
export function mudarObjetivo(modulos: readonly Modulo[], id: string, objetivo: string): Modulo[] {
	return comModulo(modulos, id, (modulo) => {
		modulo.objetivo = objetivo;
	});
}

/** Troca o tipo do módulo; tipo que não existe, ErroEsqueleto. */
export function mudarTipo(modulos: readonly Modulo[], id: string, tipo: TipoModulo): Modulo[] {
	if (!ehTipoModulo(tipo)) throw new ErroEsqueleto(`O tipo do módulo precisa ser um de: ${TIPOS_MODULO.join(", ")} (veio "${mostrar(tipo)}").`);
	return comModulo(modulos, id, (modulo) => {
		modulo.tipo = tipo;
	});
}

/** Troca as horas do módulo, arredondadas ao passo de 0,5 e limitadas a 0,5–40; o que não é número, ErroEsqueleto. */
export function mudarHoras(modulos: readonly Modulo[], id: string, horas: number): Modulo[] {
	if (typeof horas !== "number" || !Number.isFinite(horas)) throw new ErroEsqueleto(`As horas do módulo precisam ser um número (veio "${mostrar(horas)}").`);
	return comModulo(modulos, id, (modulo) => {
		modulo.horas = horasNoPasso(horas);
	});
}

/**
 * Move o conceito para o fim do módulo `paraModulo` (tirando-o de onde
 * estiver). No mesmo módulo, nada muda. O módulo de onde ele sai pode ficar
 * vazio. Conceito que não está em nenhum módulo, ou módulo que não existe,
 * ErroEsqueleto.
 */
export function moverConceito(modulos: readonly Modulo[], conceito: string, paraModulo: string): Modulo[] {
	const destino = indiceDoModulo(modulos, paraModulo);
	const origem = modulos.findIndex((modulo) => modulo.conceitos.includes(conceito));
	if (origem < 0) throw new ErroEsqueleto(`O conceito "${mostrar(conceito)}" não está em nenhum módulo.`);
	const novos = structuredClone(modulos) as Modulo[];
	if (origem === destino) return novos;
	novos[origem]!.conceitos = novos[origem]!.conceitos.filter((id) => id !== conceito);
	novos[destino]!.conceitos.push(conceito);
	return novos;
}

/** Troca o módulo de lugar com o anterior (subir) ou o seguinte (descer); na ponta, nada muda. Os ids ficam. */
export function moverModulo(modulos: readonly Modulo[], id: string, direcao: "subir" | "descer"): Modulo[] {
	const indice = indiceDoModulo(modulos, id);
	if (direcao !== "subir" && direcao !== "descer") throw new ErroEsqueleto(`A direção precisa ser subir ou descer (veio "${mostrar(direcao)}").`);
	const outro = direcao === "subir" ? indice - 1 : indice + 1;
	const novos = structuredClone(modulos) as Modulo[];
	if (outro < 0 || outro >= novos.length) return novos;
	[novos[indice], novos[outro]] = [novos[outro]!, novos[indice]!];
	return novos;
}

/** O próximo id livre: m com o maior número dos ids de agora mais 1 (um id apagado não volta). */
export function proximoIdModulo(modulos: readonly Pick<Modulo, "id">[]): string {
	const numeros = modulos.map((modulo) => (ehIdModulo(modulo.id) ? Number(modulo.id.slice(1)) : 0));
	return `m${Math.max(0, ...numeros) + 1}`;
}

/** Um módulo novo, vazio, no fim (tipo normal, 2 horas, objetivo vazio, nome o que vier ou vazio), com o próximo id livre. */
export function adicionarModulo(modulos: readonly Modulo[], nome = ""): Modulo[] {
	const novos = structuredClone(modulos) as Modulo[];
	novos.push({ id: proximoIdModulo(modulos), nome, objetivo: "", conceitos: [], tipo: "normal", horas: HORAS_MODULO_PADRAO });
	return novos;
}

/**
 * Apaga o módulo; os conceitos dele vão para o fim do anterior (ou para o
 * começo do seguinte, se ele é o primeiro). O único módulo não pode ser
 * apagado (ErroEsqueleto).
 */
export function apagarModulo(modulos: readonly Modulo[], id: string): Modulo[] {
	const indice = indiceDoModulo(modulos, id);
	if (modulos.length === 1) throw new ErroEsqueleto("O esqueleto precisa de pelo menos um módulo.");
	const novos = structuredClone(modulos) as Modulo[];
	const [apagado] = novos.splice(indice, 1);
	if (indice > 0) novos[indice - 1]!.conceitos.push(...apagado!.conceitos);
	else novos[0]!.conceitos.unshift(...apagado!.conceitos);
	return novos;
}

// --- Criar o curso e o resumo -------------------------------------------------------

/**
 * Se o curso pode ser criado agora: rascunho, as etapas até o Diagnóstico
 * confirmadas e uma proposta de esqueleto que passa na validarModulos contra
 * o Mapa do curso.
 */
export function podeCriar(curso: Curso): boolean {
	if (curso.situacao !== "rascunho" || !curso.esqueletoEmAndamento || !curso.mapa) return false;
	try {
		conferirOrdem(curso, "esqueleto");
		validarModulos(curso.esqueletoEmAndamento.modulos, curso.mapa.conceitos);
		return true;
	} catch {
		return false;
	}
}

/** Um módulo no resumo do curso pronto. */
export interface ResumoModulo {
	id: string;
	/** A posição: 1, 2… */
	numero: number;
	nome: string;
	objetivo: string;
	tipo: TipoModulo;
	horas: number;
	/** Quantos conceitos do curso o módulo cobre. */
	conceitos: number;
	inicio: string;
	fim: string;
	avaliacao: string;
}

export interface ResumoEsqueleto {
	/** Na ordem do curso. */
	modulos: ResumoModulo[];
	/** A soma das horas dos módulos. */
	horas: number;
	avaliacaoGeral: string;
	avisos: string[];
}

/**
 * O resumo do esqueleto para a visão do curso pronto: por módulo, o nome, o
 * tipo, as horas, quantos conceitos do curso ele tem e as datas do
 * calendário gravado; e o total de horas, a avaliação geral e os avisos. Um
 * módulo sem datas no calendário, ErroEsqueleto.
 */
export function resumoDoEsqueleto(esqueleto: Esqueleto, conceitosDoCurso: readonly string[]): ResumoEsqueleto {
	const doCurso = new Set(conceitosDoCurso);
	const porId = new Map(esqueleto.calendario.modulos.map((item) => [item.id, item]));
	const modulos = esqueleto.modulos.map((modulo, indice): ResumoModulo => {
		const datas = porId.get(modulo.id);
		if (!datas) throw new ErroEsqueleto(`O calendário do curso não tem as datas do módulo ${modulo.id}.`);
		return {
			id: modulo.id,
			numero: indice + 1,
			nome: modulo.nome,
			objetivo: modulo.objetivo,
			tipo: modulo.tipo,
			horas: modulo.horas,
			conceitos: modulo.conceitos.filter((id) => doCurso.has(id)).length,
			inicio: datas.inicio,
			fim: datas.fim,
			avaliacao: datas.avaliacao,
		};
	});
	return {
		modulos,
		horas: modulos.reduce((soma, modulo) => soma + modulo.horas, 0),
		avaliacaoGeral: esqueleto.calendario.avaliacaoGeral,
		avisos: [...esqueleto.calendario.avisos],
	};
}
