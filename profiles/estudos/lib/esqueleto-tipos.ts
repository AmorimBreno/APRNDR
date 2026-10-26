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
	/** O dia em que a avaliação do módulo fica disponível: o seguinte ao fim (nunca depois da avaliação geral). */
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
	/** Junto com horasPorSemanaNecessarias: as horas por dia de estudo que o plano pede (arredondadas a 0,1). */
	horasPorDiaNecessarias?: number;
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

/** 04/11: o dia e o mês, para o aviso das horas que o plano pede. */
const diaMesNaFrase = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

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
 * Os dias de estudo antes da avaliação geral, com prazo: de amanhã até o dia
 * anterior à avaliação geral (que fica no dia anterior ao prazo), ou seja,
 * os dias até o prazo menos 2. Sem prazo, ou com um prazo que não deixa
 * nenhum dia de estudo (já passou, é hoje, amanhã ou depois de amanhã),
 * null. Hoje ou prazo fora do formato, ErroEsqueleto.
 */
export function diasDeEstudo(prazo: string | null | undefined, hoje: string): number | null {
	const dia = conferirData(hoje, "O dia de hoje");
	if (prazo === null || prazo === undefined || prazo === "") return null;
	const dias = conferirData(prazo, "O prazo") - dia - 2;
	return dias >= 1 ? dias : null;
}

/**
 * O tempo disponível para os módulos até o prazo (docs/cursos.md, "O
 * modelo"): horas por semana × dias de estudo (diasDeEstudo) / 7, sem
 * arredondar. Sem prazo, ou sem dia de estudo, null.
 */
export function horasDisponiveis(basico: { prazo: string | null; horasPorSemana: number }, hoje: string): number | null {
	const dias = diasDeEstudo(basico.prazo, hoje);
	return dias === null ? null : (basico.horasPorSemana * dias) / 7;
}

/** Folga contra o erro de ponto flutuante nas frações de dia. */
const EPSILON = 1e-9;

/**
 * O calendário do curso (docs/cursos.md, "O calendário"), o mesmo na tela e
 * na extensão:
 * - os módulos vão em sequência a partir de amanhã, cada um com
 *   diasDoModulo(horas, horasPorSemana) dias corridos; o seguinte começa no
 *   dia depois do fim do anterior;
 * - a avaliação de cada módulo fica no dia seguinte ao fim dele, e nunca
 *   depois da avaliação geral (se cair nela ou depois, fica nela);
 * - com prazo: a avaliação geral fica no dia anterior ao prazo, e os dias de
 *   estudo vão de amanhã até o dia anterior a ela (diasDeEstudo). Se a soma
 *   das durações não cabe nesses dias, o tempo é dividido na proporção das
 *   horas de cada módulo, em frações de dia: o módulo vai da fração
 *   acumulada antes dele até a fração acumulada depois dele, e as datas são
 *   os dias em que essas frações caem (um módulo pode começar e terminar no
 *   mesmo dia, e vários podem dividir um dia). Quando as horas por semana
 *   que o plano pede (horas dos módulos × 7 / dias de estudo, arredondadas a
 *   0,5) passam das do Básico, elas vão em horasPorSemanaNecessarias, as
 *   horas por dia (horas / dias de estudo, arredondadas a 0,1) em
 *   horasPorDiaNecessarias, e as duas num aviso;
 * - sem prazo: a avaliação geral fica no dia seguinte ao fim do último módulo
 *   (sem módulos, amanhã);
 * - prazo que já passou, que é hoje, amanhã ou depois de amanhã (nenhum dia
 *   de estudo antes da avaliação geral): aviso, e o calendário segue como
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
	const duracoes = modulos.map((modulo) => diasDoModulo(modulo.horas, horasPorSemana));
	const avisos: string[] = [];
	let avaliacaoGeral: number | null = null;
	/** Com prazo apertado: os dias de estudo, divididos em frações de dia. */
	let emFracoes: number | null = null;
	let horasPorSemanaNecessarias: number | undefined;
	let horasPorDiaNecessarias: number | undefined;
	if (prazo !== null && prazo !== undefined && prazo !== "") {
		const dia = conferirData(prazo, "O prazo");
		const naFrase = dataNaFrase(prazo);
		if (dia < hoje) avisos.push(`O prazo (${naFrase}) já passou; o calendário segue sem prazo.`);
		else if (dia === hoje) avisos.push(`O prazo (${naFrase}) é hoje; o calendário segue sem prazo.`);
		else if (dia === amanha) avisos.push(`O prazo (${naFrase}) é amanhã e não deixa dias para os módulos; o calendário segue sem prazo.`);
		else if (dia === amanha + 1) {
			avisos.push(`O prazo (${naFrase}) é depois de amanhã: a avaliação geral fica amanhã, sem dias para os módulos; o calendário segue sem prazo.`);
		} else {
			const geral = dia - 1;
			const disponiveis = geral - amanha;
			avaliacaoGeral = geral;
			const total = duracoes.reduce((soma, valor) => soma + valor, 0);
			if (total > disponiveis) emFracoes = disponiveis;
			const horas = modulos.reduce((soma, modulo) => soma + modulo.horas, 0);
			const porSemana = (horas * 7) / disponiveis;
			const pede = Math.round(porSemana * 2) / 2;
			if (porSemana > horasPorSemana + EPSILON && pede > horasPorSemana) {
				horasPorSemanaNecessarias = pede;
				horasPorDiaNecessarias = Math.round((horas / disponiveis) * 10) / 10;
				avisos.push(
					`Até ${diaMesNaFrase(dataDoNumero(geral))} (${disponiveis} ${disponiveis === 1 ? "dia" : "dias"}), este plano pede cerca de ${numeroNaFrase(horasPorDiaNecessarias)} h por dia (${numeroNaFrase(pede)} h por semana); você disse ${numeroNaFrase(horasPorSemana)} h por semana.`,
				);
			}
		}
	}
	let inicios: number[];
	let fins: number[];
	if (emFracoes !== null) {
		// Cada módulo fica com a parte dos dias de estudo na proporção das horas dele.
		const pesos = modulos.map((modulo) => (Number.isFinite(modulo.horas) && modulo.horas > 0 ? modulo.horas : 0));
		const soma = pesos.reduce((total, peso) => total + peso, 0);
		const fracoes = soma > 0 ? pesos.map((peso) => (peso * emFracoes!) / soma) : pesos.map(() => emFracoes! / modulos.length);
		let acumulado = 0;
		inicios = [];
		fins = [];
		for (const fracao of fracoes) {
			const comeco = acumulado;
			acumulado += fracao;
			const inicio = Math.min(emFracoes - 1, Math.floor(comeco + EPSILON));
			const fim = Math.min(emFracoes - 1, Math.max(inicio, Math.ceil(acumulado - EPSILON) - 1));
			inicios.push(amanha + inicio);
			fins.push(amanha + fim);
		}
	} else {
		let cursor = amanha;
		inicios = [];
		fins = [];
		for (const duracao of duracoes) {
			inicios.push(cursor);
			fins.push(cursor + duracao - 1);
			cursor += duracao;
		}
	}
	const geral = avaliacaoGeral ?? (fins.length > 0 ? fins.at(-1)! + 1 : amanha);
	const datas = modulos.map(
		(modulo, indice): CalendarioModulo => ({
			id: modulo.id,
			inicio: dataDoNumero(inicios[indice]!),
			fim: dataDoNumero(fins[indice]!),
			avaliacao: dataDoNumero(Math.min(fins[indice]! + 1, geral)),
		}),
	);
	return {
		modulos: datas,
		avaliacaoGeral: dataDoNumero(geral),
		...(horasPorSemanaNecessarias !== undefined ? { horasPorSemanaNecessarias } : {}),
		...(horasPorDiaNecessarias !== undefined ? { horasPorDiaNecessarias } : {}),
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
