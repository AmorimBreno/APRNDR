// Tipos e regras da agenda (calendário, tarefas e quadro kanban, docs/agenda.md)
// sem nada do Node: a tela (profiles/estudos/paineis) importa daqui para mostrar
// a mudança na hora e montar o calendário, e a extensão aplica as mesmas funções
// antes de gravar; agenda.ts reexporta. A agenda é uma só, global:
// <dados>/agenda/agenda.json.
//
// Todas as operações daqui são puras: recebem a agenda e devolvem uma agenda
// nova (sem mexer na que receberam), validando antes. Uma operação que não muda
// nada devolve a mesma agenda (a mesma referência), e quem grava não grava.

import type { CorMateria, Materia } from "./materia-tipos.ts";

/** Muda quando o formato do agenda.json mudar. */
export const VERSAO_AGENDA = 1;

/** O painel da ponte de eventos (docs/ponte-de-eventos.md). */
export const PAINEL_AGENDA = "agenda";

/** Até quantos caracteres tem o título de uma tarefa. */
export const LIMITE_TITULO = 200;
/** Até quantos caracteres tem a nota de uma tarefa. */
export const LIMITE_NOTA = 5000;
/** Até quantos caracteres tem o nome de uma coluna. */
export const LIMITE_NOME_COLUNA = 40;

/** Uma coluna do quadro. A ordem do array de colunas é a ordem do quadro. */
export interface Coluna {
	/** As três padrão têm a-fazer, fazendo e feito; as outras, col- + 12 dígitos base 36 de milissegundos + - + 4 hex. */
	id: string;
	nome: string;
	/** Exatamente uma coluna tem feito: a das tarefas concluídas. */
	feito: boolean;
}

/** Uma tarefa. A coluna dela é a situação dela. */
export interface Tarefa {
	/** t- + 12 dígitos base 36 de milissegundos + - + 4 hex aleatórios. */
	id: string;
	titulo: string;
	nota?: string;
	/** O id da coluna. */
	coluna: string;
	/** A posição dentro da coluna (0, 1, 2…, sempre renumerada). */
	ordem: number;
	/** AAAA-MM-DD. */
	data?: string;
	/** HH:MM; só existe com data. */
	hora?: string;
	/** O id da matéria. */
	materia?: string;
	/** ISO 8601. */
	criadaEm: string;
	/** ISO 8601. */
	alteradaEm: string;
	/** ISO 8601; preenchida ao entrar na coluna de feito e apagada ao sair dela. */
	concluidaEm?: string;
}

/** O agenda.json. */
export interface Agenda {
	versao: typeof VERSAO_AGENDA;
	colunas: Coluna[];
	tarefas: Tarefa[];
}

export class ErroAgenda extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroAgenda";
	}
}

/** O que as operações aceitam além dos argumentos. */
export interface ContextoOperacao {
	/** O momento (os testes fixam). Sem ele, agora. */
	agora?: Date;
	/** O id do que será criado (os testes fixam). Sem ele, um novo. */
	id?: string;
	/** Os ids das matérias que existem. Com ele, uma matéria informada precisa estar na lista. Sem ele, não confere. */
	materias?: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Datas, horas, ids e textos
// ---------------------------------------------------------------------------

/** A data local de agora em AAAA-MM-DD. */
export function hojeLocal(agora: Date = new Date()): string {
	const dois = (numero: number) => String(numero).padStart(2, "0");
	return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** AAAA-MM-DD de um dia que existe (2026-02-30 não). */
export function ehData(texto: unknown): texto is string {
	if (typeof texto !== "string") return false;
	const achado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
	if (!achado) return false;
	const [ano, mes, dia] = [Number(achado[1]), Number(achado[2]), Number(achado[3])] as [number, number, number];
	const data = new Date(Date.UTC(ano, mes - 1, dia));
	return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** HH:MM de 00:00 a 23:59. */
export function ehHora(texto: unknown): texto is string {
	return typeof texto === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);
}

/** A data `dias` dias depois (ou antes, se negativo). */
export function somarDias(data: string, dias: number): string {
	const [ano, mes, dia] = data.split("-").map(Number) as [number, number, number];
	return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Um id novo com o prefixo: prefixo + - + 12 dígitos base 36 de milissegundos + - + 4 hex aleatórios; nunca um dos existentes. */
function gerarId(prefixo: string, agora: number, existentes: ReadonlySet<string>): string {
	for (;;) {
		const bytes = globalThis.crypto.getRandomValues(new Uint8Array(2));
		const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
		const id = `${prefixo}-${agora.toString(36).padStart(12, "0")}-${hex}`;
		if (!existentes.has(id)) return id;
	}
}

/** O texto sem acento e em minúsculas, para comparar nomes. */
const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lê um campo de texto que veio da tela ou do agente: undefined = não veio;
 * null = veio para limpar (null ou só espaços); senão o texto aparado.
 * Qualquer outra coisa que não seja texto é erro.
 */
function textoDoCampo(valor: unknown, rotulo: string): string | null | undefined {
	if (valor === undefined) return undefined;
	if (valor === null) return null;
	if (typeof valor !== "string") throw new ErroAgenda(`${rotulo} precisa ser um texto.`);
	return valor.trim() || null;
}

function tituloValido(bruto: unknown): string {
	if (typeof bruto !== "string") throw new ErroAgenda("Escreva o título da tarefa.");
	const titulo = bruto.trim().replace(/\s+/g, " ");
	if (!titulo) throw new ErroAgenda("Escreva o título da tarefa.");
	if (titulo.length > LIMITE_TITULO) throw new ErroAgenda(`O título da tarefa pode ter até ${LIMITE_TITULO} caracteres.`);
	return titulo;
}

function nomeDeColunaValido(bruto: unknown, agenda: Agenda, ignorar?: string): string {
	if (typeof bruto !== "string") throw new ErroAgenda("Escreva o nome da coluna.");
	const nome = bruto.trim().replace(/\s+/g, " ");
	if (!nome) throw new ErroAgenda("Escreva o nome da coluna.");
	if (nome.length > LIMITE_NOME_COLUNA) throw new ErroAgenda(`O nome da coluna pode ter até ${LIMITE_NOME_COLUNA} caracteres.`);
	const igual = agenda.colunas.find((coluna) => coluna.id !== ignorar && semAcento(coluna.nome) === semAcento(nome));
	if (igual) throw new ErroAgenda(`Já existe uma coluna "${igual.nome}".`);
	return nome;
}

/** Confere o valor de um campo opcional da tarefa (que já veio aparado e não vazio). */
function campoValido(campo: "nota" | "data" | "hora" | "materia", valor: string, contexto: ContextoOperacao): string {
	if (campo === "nota" && valor.length > LIMITE_NOTA) throw new ErroAgenda(`A nota pode ter até ${LIMITE_NOTA} caracteres.`);
	if (campo === "data" && !ehData(valor)) throw new ErroAgenda(`A data precisa estar no formato AAAA-MM-DD e existir (veio "${valor}").`);
	if (campo === "hora" && !ehHora(valor)) throw new ErroAgenda(`A hora precisa estar no formato HH:MM, de 00:00 a 23:59 (veio "${valor}").`);
	if (campo === "materia" && contexto.materias && !contexto.materias.includes(valor)) throw new ErroAgenda(`Não achei a matéria "${valor}".`);
	return valor;
}

// ---------------------------------------------------------------------------
// A agenda
// ---------------------------------------------------------------------------

/** As colunas de quem ainda não mexeu: A fazer, Fazendo e Feito (esta com feito). */
export const COLUNAS_PADRAO: ReadonlyArray<Coluna> = [
	{ id: "a-fazer", nome: "A fazer", feito: false },
	{ id: "fazendo", nome: "Fazendo", feito: false },
	{ id: "feito", nome: "Feito", feito: true },
];

/** A agenda de quem ainda não tem agenda.json: as colunas padrão e nenhuma tarefa. */
export function agendaPadrao(): Agenda {
	return { versao: VERSAO_AGENDA, colunas: COLUNAS_PADRAO.map((coluna) => ({ ...coluna })), tarefas: [] };
}

/** A tarefa com os campos na ordem em que vão para o agenda.json (só os que existem). */
function tarefaNaOrdem(t: Tarefa): Tarefa {
	return {
		id: t.id,
		titulo: t.titulo,
		...(t.nota !== undefined ? { nota: t.nota } : {}),
		coluna: t.coluna,
		ordem: t.ordem,
		...(t.data !== undefined ? { data: t.data } : {}),
		...(t.hora !== undefined ? { hora: t.hora } : {}),
		...(t.materia !== undefined ? { materia: t.materia } : {}),
		criadaEm: t.criadaEm,
		alteradaEm: t.alteradaEm,
		...(t.concluidaEm !== undefined ? { concluidaEm: t.concluidaEm } : {}),
	};
}

/**
 * Deixa a agenda arrumada: as tarefas na ordem do quadro (coluna e depois
 * posição) e a ordem renumerada 0, 1, 2… em cada coluna. Todas as operações
 * chamam isto antes de devolver.
 */
export function normalizar(agenda: Agenda): Agenda {
	const posicao = new Map(agenda.colunas.map((coluna, indice) => [coluna.id, indice]));
	const ordenadas = [...agenda.tarefas].sort(
		(a, b) =>
			(posicao.get(a.coluna) ?? 0) - (posicao.get(b.coluna) ?? 0) || a.ordem - b.ordem || a.criadaEm.localeCompare(b.criadaEm) || a.id.localeCompare(b.id),
	);
	const contagem = new Map<string, number>();
	const tarefas = ordenadas.map((tarefa) => {
		const ordem = contagem.get(tarefa.coluna) ?? 0;
		contagem.set(tarefa.coluna, ordem + 1);
		return tarefaNaOrdem({ ...tarefa, ordem });
	});
	return { versao: VERSAO_AGENDA, colunas: agenda.colunas.map((coluna) => ({ id: coluna.id, nome: coluna.nome, feito: coluna.feito })), tarefas };
}

/** As tarefas da coluna, na ordem dela. */
export const tarefasDaColuna = (agenda: Agenda, coluna: string): Tarefa[] =>
	agenda.tarefas.filter((tarefa) => tarefa.coluna === coluna).sort((a, b) => a.ordem - b.ordem);

/** A coluna de feito. */
export const colunaDeFeito = (agenda: Agenda): Coluna => agenda.colunas.find((coluna) => coluna.feito) ?? agenda.colunas[agenda.colunas.length - 1]!;

/** Uma tarefa está aberta quando a coluna dela não é a de feito. */
export const tarefaAberta = (agenda: Agenda, tarefa: Tarefa): boolean => !agenda.colunas.find((coluna) => coluna.id === tarefa.coluna)?.feito;

/**
 * Confere o que veio do agenda.json e devolve a agenda arrumada. Qualquer
 * problema é um ErroAgenda com o motivo (quem lê acrescenta o caminho e diz
 * que nada foi gravado por cima).
 */
export function validarAgenda(valor: unknown): Agenda {
	const bruta = valor as Partial<Agenda> | null;
	if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) throw new ErroAgenda("o arquivo não é um objeto JSON");
	if (bruta.versao !== VERSAO_AGENDA) throw new ErroAgenda(`a versão do formato é ${JSON.stringify(bruta.versao)} e este app entende a ${VERSAO_AGENDA}`);
	if (!Array.isArray(bruta.colunas) || bruta.colunas.length === 0) throw new ErroAgenda("faltam as colunas (precisa haver ao menos uma)");
	if (!Array.isArray(bruta.tarefas)) throw new ErroAgenda("faltam as tarefas (a lista pode estar vazia)");
	const colunas: Coluna[] = [];
	const ids = new Set<string>();
	for (const [indice, item] of (bruta.colunas as unknown[]).entries()) {
		const coluna = item as Partial<Coluna> | null;
		if (typeof coluna?.id !== "string" || !coluna.id || typeof coluna.nome !== "string" || !coluna.nome.trim() || typeof coluna.feito !== "boolean") {
			throw new ErroAgenda(`a coluna ${indice + 1} precisa de id, nome e feito (verdadeiro ou falso)`);
		}
		if (ids.has(coluna.id)) throw new ErroAgenda(`o id de coluna "${coluna.id}" aparece duas vezes`);
		ids.add(coluna.id);
		colunas.push({ id: coluna.id, nome: coluna.nome, feito: coluna.feito });
	}
	const feitas = colunas.filter((coluna) => coluna.feito).length;
	if (feitas !== 1) throw new ErroAgenda(`exatamente uma coluna precisa ter feito: true (tem ${feitas})`);
	const tarefas: Tarefa[] = [];
	const idsTarefas = new Set<string>();
	for (const item of bruta.tarefas as unknown[]) {
		const t = item as Partial<Tarefa> | null;
		if (typeof t?.id !== "string" || !t.id) throw new ErroAgenda("uma tarefa está sem id");
		const rotulo = `a tarefa "${t.id}"`;
		if (idsTarefas.has(t.id)) throw new ErroAgenda(`o id de tarefa "${t.id}" aparece duas vezes`);
		idsTarefas.add(t.id);
		if (typeof t.titulo !== "string" || !t.titulo.trim()) throw new ErroAgenda(`${rotulo} está sem título`);
		if (typeof t.coluna !== "string" || !ids.has(t.coluna)) throw new ErroAgenda(`${rotulo} está numa coluna que não existe (${JSON.stringify(t.coluna)})`);
		if (typeof t.criadaEm !== "string" || typeof t.alteradaEm !== "string") throw new ErroAgenda(`${rotulo} está sem criadaEm ou alteradaEm`);
		if (t.nota !== undefined && typeof t.nota !== "string") throw new ErroAgenda(`${rotulo} tem a nota que não é um texto`);
		if (t.data !== undefined && !ehData(t.data)) throw new ErroAgenda(`${rotulo} tem a data fora do formato AAAA-MM-DD (${JSON.stringify(t.data)})`);
		if (t.hora !== undefined && !ehHora(t.hora)) throw new ErroAgenda(`${rotulo} tem a hora fora do formato HH:MM (${JSON.stringify(t.hora)})`);
		if (t.hora !== undefined && t.data === undefined) throw new ErroAgenda(`${rotulo} tem hora e não tem data`);
		if (t.materia !== undefined && typeof t.materia !== "string") throw new ErroAgenda(`${rotulo} tem a matéria que não é um texto`);
		if (t.concluidaEm !== undefined && typeof t.concluidaEm !== "string") throw new ErroAgenda(`${rotulo} tem concluidaEm que não é um texto`);
		tarefas.push({
			id: t.id,
			titulo: t.titulo,
			...(t.nota !== undefined ? { nota: t.nota } : {}),
			coluna: t.coluna,
			ordem: typeof t.ordem === "number" && Number.isFinite(t.ordem) ? t.ordem : 0,
			...(t.data !== undefined ? { data: t.data } : {}),
			...(t.hora !== undefined ? { hora: t.hora } : {}),
			...(t.materia !== undefined ? { materia: t.materia } : {}),
			criadaEm: t.criadaEm,
			alteradaEm: t.alteradaEm,
			...(t.concluidaEm !== undefined ? { concluidaEm: t.concluidaEm } : {}),
		});
	}
	return normalizar({ versao: VERSAO_AGENDA, colunas, tarefas });
}

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------

/** O que criar uma tarefa aceita. Sem coluna, vai para a primeira do quadro; entra no fim da coluna. */
export interface EntradaTarefa {
	titulo: string;
	nota?: string | null;
	coluna?: string;
	data?: string | null;
	hora?: string | null;
	materia?: string | null;
}

/** Os campos que editar uma tarefa muda. Para limpar nota, data, hora ou matéria: null (ou texto vazio). */
export const CAMPOS_EDITAVEIS = ["titulo", "nota", "data", "hora", "materia"] as const;
export type CampoTarefa = (typeof CAMPOS_EDITAVEIS)[number];
export type MudancasTarefa = { [campo in CampoTarefa]?: string | null };

const colunaOuErro = (agenda: Agenda, id: unknown): Coluna => {
	const coluna = typeof id === "string" ? agenda.colunas.find((item) => item.id === id) : undefined;
	if (!coluna) throw new ErroAgenda(`Não achei a coluna "${String(id)}".`);
	return coluna;
};

const tarefaOuErro = (agenda: Agenda, id: unknown): Tarefa => {
	const tarefa = typeof id === "string" ? agenda.tarefas.find((item) => item.id === id) : undefined;
	if (!tarefa) throw new ErroAgenda(`Não achei a tarefa "${String(id)}".`);
	return tarefa;
};

/** Cria a tarefa no fim da coluna (a primeira, se não vier outra). Na coluna de feito, ela já nasce concluída. */
export function criarTarefa(agenda: Agenda, entrada: EntradaTarefa, contexto: ContextoOperacao = {}): { agenda: Agenda; tarefa: Tarefa } {
	const agora = contexto.agora ?? new Date();
	const titulo = tituloValido(entrada.titulo);
	const coluna = entrada.coluna === undefined || entrada.coluna === null ? agenda.colunas[0]! : colunaOuErro(agenda, entrada.coluna);
	const nota = textoDoCampo(entrada.nota, "A nota");
	const data = textoDoCampo(entrada.data, "A data");
	const hora = textoDoCampo(entrada.hora, "A hora");
	const materia = textoDoCampo(entrada.materia, "A matéria");
	if (hora && !data) throw new ErroAgenda("A hora precisa de uma data.");
	const id = contexto.id ?? gerarId("t", agora.getTime(), new Set(agenda.tarefas.map((tarefa) => tarefa.id)));
	if (agenda.tarefas.some((tarefa) => tarefa.id === id)) throw new ErroAgenda(`Já existe a tarefa "${id}".`);
	const iso = agora.toISOString();
	const nova = tarefaNaOrdem({
		id,
		titulo,
		...(nota ? { nota: campoValido("nota", nota, contexto) } : {}),
		coluna: coluna.id,
		ordem: tarefasDaColuna(agenda, coluna.id).length,
		...(data ? { data: campoValido("data", data, contexto) } : {}),
		...(hora ? { hora: campoValido("hora", hora, contexto) } : {}),
		...(materia ? { materia: campoValido("materia", materia, contexto) } : {}),
		criadaEm: iso,
		alteradaEm: iso,
		...(coluna.feito ? { concluidaEm: iso } : {}),
	});
	const resultado = normalizar({ ...agenda, tarefas: [...agenda.tarefas, nova] });
	return { agenda: resultado, tarefa: resultado.tarefas.find((tarefa) => tarefa.id === id)! };
}

/**
 * Muda título, nota, data, hora ou matéria. Só entram os campos que vieram (e
 * os que valem de verdade mudam). Tirar a data sem dizer a hora tira a hora
 * junto; uma hora sem data é erro. Devolve a tarefa de antes, para o evento.
 */
export function editarTarefa(
	agenda: Agenda,
	id: string,
	mudancas: MudancasTarefa,
	contexto: ContextoOperacao = {},
): { agenda: Agenda; tarefa: Tarefa; antes: Tarefa; mudou: CampoTarefa[] } {
	const antes = tarefaOuErro(agenda, id);
	if (!mudancas || typeof mudancas !== "object") throw new ErroAgenda("Faltou dizer o que mudar na tarefa.");
	const novo: Tarefa = { ...antes };
	const quais: CampoTarefa[] = [];
	if (mudancas.titulo !== undefined) {
		const titulo = tituloValido(mudancas.titulo);
		if (titulo !== antes.titulo) {
			novo.titulo = titulo;
			quais.push("titulo");
		}
	}
	let horaPedida = false;
	for (const campo of ["nota", "data", "hora", "materia"] as const) {
		const bruto = textoDoCampo(mudancas[campo], `O campo ${campo}`);
		if (bruto === undefined) continue;
		if (campo === "hora" && bruto !== null) horaPedida = true;
		// Só confere o que mudou: uma matéria que sumiu não impede mudar o título.
		const valor = bruto === null || bruto === antes[campo] ? bruto : campoValido(campo, bruto, contexto);
		if ((valor ?? undefined) === antes[campo]) continue;
		if (valor === null) delete novo[campo];
		else novo[campo] = valor;
		quais.push(campo);
	}
	if (novo.hora && !novo.data) {
		if (horaPedida) throw new ErroAgenda("A hora precisa de uma data.");
		delete novo.hora;
		if (!quais.includes("hora")) quais.push("hora");
	}
	if (quais.length === 0) return { agenda, tarefa: antes, antes, mudou: [] };
	novo.alteradaEm = (contexto.agora ?? new Date()).toISOString();
	const nova = normalizar({ ...agenda, tarefas: agenda.tarefas.map((tarefa) => (tarefa.id === id ? novo : tarefa)) });
	return { agenda: nova, tarefa: nova.tarefas.find((tarefa) => tarefa.id === id)!, antes, mudou: quais };
}

export interface ResultadoMover {
	agenda: Agenda;
	tarefa: Tarefa;
	de: Coluna;
	para: Coluna;
	/** Mudou de coluna. */
	mudouDeColuna: boolean;
	/** Entrou na coluna de feito. */
	concluiu: boolean;
	/** Saiu da coluna de feito. */
	reabriu: boolean;
	/** A tarefa mudou de lugar (de coluna ou de posição). */
	mudou: boolean;
}

/**
 * Põe a tarefa na coluna, na posição dada (0 = primeira; sem posição ou maior
 * que o tamanho, no fim; conta sem a própria tarefa) e renumera as ordens das
 * colunas mexidas. Entrar na coluna de feito preenche concluidaEm; sair
 * dela apaga.
 */
export function moverTarefa(agenda: Agenda, id: string, colunaDestino: string, posicao?: number, contexto: ContextoOperacao = {}): ResultadoMover {
	const tarefa = tarefaOuErro(agenda, id);
	const de = colunaOuErro(agenda, tarefa.coluna);
	const para = colunaOuErro(agenda, colunaDestino);
	if (posicao !== undefined && (!Number.isInteger(posicao) || posicao < 0)) throw new ErroAgenda("A posição precisa ser um número inteiro, de 0 em diante.");
	const outras = tarefasDaColuna(agenda, para.id).filter((item) => item.id !== id);
	const lugar = Math.min(posicao ?? outras.length, outras.length);
	const mudouDeColuna = de.id !== para.id;
	if (!mudouDeColuna && tarefasDaColuna(agenda, para.id).findIndex((item) => item.id === id) === lugar) {
		return { agenda, tarefa, de, para, mudouDeColuna: false, concluiu: false, reabriu: false, mudou: false };
	}
	const iso = (contexto.agora ?? new Date()).toISOString();
	const movida: Tarefa = { ...tarefa, coluna: para.id, alteradaEm: iso };
	const concluiu = !de.feito && para.feito;
	const reabriu = de.feito && !para.feito;
	if (concluiu) movida.concluidaEm = iso;
	if (reabriu) delete movida.concluidaEm;
	const ordenadas = [...outras.slice(0, lugar), movida, ...outras.slice(lugar)];
	const lugares = new Map(ordenadas.map((item, indice) => [item.id, indice]));
	const nova = normalizar({
		...agenda,
		tarefas: agenda.tarefas.map((item) => (item.id === id ? { ...movida, ordem: lugares.get(id)! } : lugares.has(item.id) ? { ...item, ordem: lugares.get(item.id)! } : item)),
	});
	return { agenda: nova, tarefa: nova.tarefas.find((item) => item.id === id)!, de, para, mudouDeColuna, concluiu, reabriu, mudou: true };
}

/** Apaga a tarefa (e renumera a coluna). */
export function apagarTarefa(agenda: Agenda, id: string): { agenda: Agenda; tarefa: Tarefa } {
	const tarefa = tarefaOuErro(agenda, id);
	return { agenda: normalizar({ ...agenda, tarefas: agenda.tarefas.filter((item) => item.id !== id) }), tarefa };
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

/** Cria uma coluna (não é a de feito). `posicao` é o lugar no quadro (0 = primeira); sem ela, no fim. */
export function criarColuna(agenda: Agenda, nome: string, posicao?: number, contexto: ContextoOperacao = {}): { agenda: Agenda; coluna: Coluna } {
	const valido = nomeDeColunaValido(nome, agenda);
	if (posicao !== undefined && (!Number.isInteger(posicao) || posicao < 0)) throw new ErroAgenda("A posição precisa ser um número inteiro, de 0 em diante.");
	const id = contexto.id ?? gerarId("col", (contexto.agora ?? new Date()).getTime(), new Set(agenda.colunas.map((coluna) => coluna.id)));
	if (agenda.colunas.some((coluna) => coluna.id === id)) throw new ErroAgenda(`Já existe a coluna "${id}".`);
	const coluna: Coluna = { id, nome: valido, feito: false };
	const lugar = Math.min(posicao ?? agenda.colunas.length, agenda.colunas.length);
	const colunas = [...agenda.colunas.slice(0, lugar), coluna, ...agenda.colunas.slice(lugar)];
	return { agenda: normalizar({ ...agenda, colunas }), coluna };
}

/** Troca o nome da coluna. O mesmo nome, sem mudar nada. */
export function renomearColuna(agenda: Agenda, id: string, nome: string): { agenda: Agenda; coluna: Coluna; anterior: string } {
	const atual = colunaOuErro(agenda, id);
	const valido = nomeDeColunaValido(nome, agenda, id);
	if (valido === atual.nome) return { agenda, coluna: atual, anterior: atual.nome };
	const colunas = agenda.colunas.map((coluna) => (coluna.id === id ? { ...coluna, nome: valido } : coluna));
	return { agenda: normalizar({ ...agenda, colunas }), coluna: { ...atual, nome: valido }, anterior: atual.nome };
}

/** Põe as colunas na ordem dada: precisa ter todos os ids, uma vez cada. */
export function reordenarColunas(agenda: Agenda, ids: string[]): { agenda: Agenda; anterior: string[] } {
	const anterior = agenda.colunas.map((coluna) => coluna.id);
	if (!Array.isArray(ids) || ids.length !== anterior.length || new Set(ids).size !== ids.length || !ids.every((id) => anterior.includes(id))) {
		throw new ErroAgenda("A nova ordem precisa ter todas as colunas, cada uma uma vez.");
	}
	if (ids.every((id, indice) => id === anterior[indice])) return { agenda, anterior };
	const colunas = ids.map((id) => agenda.colunas.find((coluna) => coluna.id === id)!);
	return { agenda: normalizar({ ...agenda, colunas }), anterior };
}

/**
 * Marca a coluna como a de feito (a marca da outra sai). As tarefas da nova
 * coluna de feito ganham concluidaEm; as da antiga perdem.
 */
export function marcarFeito(
	agenda: Agenda,
	id: string,
	contexto: ContextoOperacao = {},
): { agenda: Agenda; coluna: Coluna; anterior: Coluna; concluidas: number; reabertas: number } {
	const coluna = colunaOuErro(agenda, id);
	const anterior = colunaDeFeito(agenda);
	if (coluna.feito) return { agenda, coluna, anterior, concluidas: 0, reabertas: 0 };
	const iso = (contexto.agora ?? new Date()).toISOString();
	let concluidas = 0;
	let reabertas = 0;
	const tarefas = agenda.tarefas.map((tarefa) => {
		if (tarefa.coluna === id) {
			concluidas++;
			return { ...tarefa, concluidaEm: iso, alteradaEm: iso };
		}
		if (tarefa.coluna === anterior.id) {
			reabertas++;
			const { concluidaEm: _, ...resto } = tarefa;
			return { ...resto, alteradaEm: iso };
		}
		return tarefa;
	});
	const colunas = agenda.colunas.map((item) => ({ ...item, feito: item.id === id }));
	return { agenda: normalizar({ ...agenda, colunas, tarefas }), coluna: { ...coluna, feito: true }, anterior, concluidas, reabertas };
}

/**
 * Apaga a coluna. Nunca a última, nem a de feito (marque outra antes). Com
 * tarefas, precisa de um destino (outra coluna): elas vão para o fim dele, na
 * mesma ordem; se o destino é a coluna de feito, elas ficam concluídas.
 */
export function apagarColuna(
	agenda: Agenda,
	id: string,
	destino?: string,
	contexto: ContextoOperacao = {},
): { agenda: Agenda; coluna: Coluna; destino?: Coluna; movidas: Tarefa[] } {
	const coluna = colunaOuErro(agenda, id);
	if (agenda.colunas.length <= 1) throw new ErroAgenda("Não dá para apagar a última coluna: o quadro precisa de pelo menos uma.");
	if (coluna.feito) throw new ErroAgenda(`"${coluna.nome}" é a coluna de feito. Marque outra coluna como a de feito antes de apagar esta.`);
	const dela = tarefasDaColuna(agenda, id);
	if (dela.length === 0) return { agenda: normalizar({ ...agenda, colunas: agenda.colunas.filter((item) => item.id !== id) }), coluna, movidas: [] };
	if (destino === undefined || destino === null) {
		throw new ErroAgenda(`A coluna "${coluna.nome}" tem ${dela.length} ${dela.length === 1 ? "tarefa" : "tarefas"}. Escolha para onde elas vão antes de apagá-la.`);
	}
	if (destino === id) throw new ErroAgenda("O destino das tarefas precisa ser outra coluna.");
	const para = colunaOuErro(agenda, destino);
	const iso = (contexto.agora ?? new Date()).toISOString();
	const base = tarefasDaColuna(agenda, para.id).length;
	const movidas = dela.map((tarefa, indice): Tarefa => ({ ...tarefa, coluna: para.id, ordem: base + indice, alteradaEm: iso, ...(para.feito ? { concluidaEm: iso } : {}) }));
	const porId = new Map(movidas.map((tarefa) => [tarefa.id, tarefa]));
	const nova = normalizar({
		...agenda,
		colunas: agenda.colunas.filter((item) => item.id !== id),
		tarefas: agenda.tarefas.map((tarefa) => porId.get(tarefa.id) ?? tarefa),
	});
	return { agenda: nova, coluna, destino: para, movidas: movidas.map((tarefa) => nova.tarefas.find((item) => item.id === tarefa.id)!) };
}

// ---------------------------------------------------------------------------
// O calendário
// ---------------------------------------------------------------------------

/** A prova de uma matéria, como a tela e o ler_agenda a veem (lida do materia.json na hora, nunca copiada). */
export interface ProvaDaAgenda {
	/** O id da matéria. */
	materia: string;
	/** O nome da matéria. */
	nome: string;
	cor: CorMateria;
	/** O nome da prova (P1…). */
	prova: string;
	/** AAAA-MM-DD. */
	data: string;
}

/** Um item do calendário: uma tarefa com data ou uma prova. */
export interface ItemCalendario {
	tipo: "tarefa" | "prova";
	/** AAAA-MM-DD. */
	data: string;
	hora?: string;
	/** O título da tarefa ou o nome da prova. */
	titulo: string;
	/** O id da matéria. */
	materia?: string;
	/** Só nas tarefas: está na coluna de feito. */
	feita?: boolean;
	/** O id da tarefa ou, nas provas, prova:<matéria>:<data>:<nome>. */
	id: string;
}

export interface FiltroCalendario {
	/** AAAA-MM-DD, incluído. */
	de: string;
	/** AAAA-MM-DD, incluído. */
	ate: string;
	/** Só os itens dessa matéria. */
	materia?: string;
}

/** As provas de todas as matérias, na ordem das matérias e das provas. */
export function provasDasMaterias(materias: ReadonlyArray<Pick<Materia, "id" | "nome" | "cor" | "provas">>): ProvaDaAgenda[] {
	return materias.flatMap((materia) => materia.provas.map((prova) => ({ materia: materia.id, nome: materia.nome, cor: materia.cor, prova: prova.nome, data: prova.data })));
}

/** Os itens do calendário no intervalo, com as provas já prontas (a tela, que recebe as provas na mensagem agenda, usa esta). */
export function itensComProvas(agenda: Agenda, provas: ReadonlyArray<ProvaDaAgenda>, filtro: FiltroCalendario): ItemCalendario[] {
	if (!ehData(filtro.de) || !ehData(filtro.ate)) throw new ErroAgenda("O intervalo do calendário precisa ter as datas no formato AAAA-MM-DD.");
	if (filtro.de > filtro.ate) throw new ErroAgenda("O início do intervalo é depois do fim.");
	const dentro = (data: string) => data >= filtro.de && data <= filtro.ate;
	const itens: ItemCalendario[] = [];
	for (const tarefa of agenda.tarefas) {
		if (!tarefa.data || !dentro(tarefa.data)) continue;
		if (filtro.materia !== undefined && tarefa.materia !== filtro.materia) continue;
		itens.push({
			tipo: "tarefa",
			data: tarefa.data,
			...(tarefa.hora ? { hora: tarefa.hora } : {}),
			titulo: tarefa.titulo,
			...(tarefa.materia ? { materia: tarefa.materia } : {}),
			feita: !tarefaAberta(agenda, tarefa),
			id: tarefa.id,
		});
	}
	for (const prova of provas) {
		if (!dentro(prova.data)) continue;
		if (filtro.materia !== undefined && prova.materia !== filtro.materia) continue;
		itens.push({ tipo: "prova", data: prova.data, titulo: prova.prova, materia: prova.materia, id: `prova:${prova.materia}:${prova.data}:${prova.prova}` });
	}
	// Por dia; no dia, os sem hora primeiro, depois por hora; a prova antes da tarefa.
	return itens.sort(
		(a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? "") || (a.tipo === b.tipo ? 0 : a.tipo === "prova" ? -1 : 1) || a.titulo.localeCompare(b.titulo),
	);
}

/**
 * Os itens do calendário no intervalo: as tarefas com data e as provas das
 * matérias (do materia.json de cada uma, lidas na hora). Para a tela e para o ler_agenda.
 */
export function itensDoCalendario(agenda: Agenda, materias: ReadonlyArray<Pick<Materia, "id" | "nome" | "cor" | "provas">>, filtro: FiltroCalendario): ItemCalendario[] {
	return itensComProvas(agenda, provasDasMaterias(materias), filtro);
}

/** As tarefas abertas com data antes de `hoje`, da mais antiga para a mais nova (e, no mesmo dia, por hora). */
export function tarefasAtrasadas(agenda: Agenda, hoje: string, materia?: string): Tarefa[] {
	return agenda.tarefas
		.filter((tarefa) => tarefa.data !== undefined && tarefa.data < hoje && tarefaAberta(agenda, tarefa) && (materia === undefined || tarefa.materia === materia))
		.sort((a, b) => a.data!.localeCompare(b.data!) || (a.hora ?? "").localeCompare(b.hora ?? "") || a.titulo.localeCompare(b.titulo));
}

/** As tarefas abertas sem data, na ordem do quadro. */
export function tarefasSemData(agenda: Agenda, materia?: string): Tarefa[] {
	return agenda.tarefas.filter((tarefa) => tarefa.data === undefined && tarefaAberta(agenda, tarefa) && (materia === undefined || tarefa.materia === materia));
}

// ---------------------------------------------------------------------------
// A ponte (painel "agenda", docs/agenda.md)
// ---------------------------------------------------------------------------

/** Uma matéria como a tela a vê na agenda (para escolher a matéria de uma tarefa). */
export interface MateriaDaAgenda {
	id: string;
	nome: string;
	cor: CorMateria;
}

/** A resposta a toda ação: a agenda inteira, as provas de todas as matérias e as matérias. */
export interface MensagemAgenda {
	colunas: Coluna[];
	tarefas: Tarefa[];
	provas: ProvaDaAgenda[];
	materias: MateriaDaAgenda[];
	/** O pedido da tela, quando a mensagem responde a uma ação. */
	pedido?: string;
	/** O id da tarefa ou da coluna que a ação criou (criar_tarefa, criar_coluna). */
	criada?: string;
}

export interface MensagemErroAgenda {
	mensagem: string;
	/** A ação que falhou. */
	ao?: string;
	pedido?: string;
}

/** O que a extensão manda à tela ("interface:mostrar", painel "agenda", sempre passageiro). */
export interface MensagensAgenda {
	agenda: MensagemAgenda;
	erro: MensagemErroAgenda;
}

/** O que a tela manda à extensão ("interface:acao", painel "agenda"). Todas levam pedido, que volta na resposta. */
export interface AcoesAgenda {
	abrir: { pedido?: string };
	criar_tarefa: EntradaTarefa & { pedido?: string };
	editar_tarefa: { id: string; mudancas: MudancasTarefa; pedido?: string };
	mover_tarefa: { id: string; coluna: string; posicao?: number; pedido?: string };
	apagar_tarefa: { id: string; pedido?: string };
	criar_coluna: { nome: string; posicao?: number; pedido?: string };
	renomear_coluna: { id: string; nome: string; pedido?: string };
	reordenar_colunas: { ids: string[]; pedido?: string };
	marcar_feito: { id: string; pedido?: string };
	apagar_coluna: { id: string; destino?: string; pedido?: string };
}
