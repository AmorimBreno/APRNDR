// Tipos e regras dos cursos (item 5, docs/cursos.md) sem nada do Node: a tela
// (profiles/estudos/paineis) importa daqui para validar e avisar antes de
// confirmar uma etapa, e a extensão aplica as mesmas funções antes de gravar;
// cursos.ts reexporta. Cada curso é materias/<matéria>/cursos/<curso>/curso.json.
//
// Todas as funções daqui são puras: recebem o curso e devolvem um curso novo,
// sem mexer no que receberam.

// Só tipos de diagnostico-tipos.ts (apagados na compilação): os valores vão no
// sentido contrário (diagnostico-tipos importa daqui), sem ciclo ao carregar.
import type { Confianca, Diagnostico, DiagnosticoEmAndamento, NivelAutoavaliacao, RespostaDissertativa } from "./diagnostico-tipos.ts";
import type { MapaConteudo } from "./mapa-tipos.ts";

/** Muda quando o formato do curso.json mudar. */
export const VERSAO_CURSO = 1;

/** O painel da ponte de eventos (docs/ponte-de-eventos.md). */
export const PAINEL_CURSOS = "cursos";

/** As etapas do guia de criação, na ordem. */
export const ETAPAS = ["basico", "materiais", "objetivo", "mapa", "diagnostico", "esqueleto"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ESCOPOS = ["so_material", "material_base", "livre"] as const;
export type Escopo = (typeof ESCOPOS)[number];

export const TIPOS_CURSO = ["teorico", "aplicado", "misto"] as const;
export type TipoCurso = (typeof TIPOS_CURSO)[number];

/** rascunho: o guia não terminou; pronto: depois de "Criar curso" (parte C). */
export type SituacaoCurso = "rascunho" | "pronto";

export const HORAS_MINIMAS = 1;
export const HORAS_MAXIMAS = 60;
/** Até quantos caracteres o nome do curso pode ter (como o da matéria). */
export const TAMANHO_NOME_CURSO = 80;

/** A etapa Básico (o nome do curso fica em Curso.nome). */
export interface DadosBasico {
	/** AAAA-MM-DD, ou null = sem prazo. */
	prazo: string | null;
	/** O nome da prova da matéria escolhida, se veio de uma. Só aparece quando tem texto. */
	prova?: string;
	/** De 1 a 60 (aceita fração, como 2.5). */
	horasPorSemana: number;
}

/** Um material pronto: o caminho dentro de materiais/ e o hash do manifesto do .extraido. */
export interface ArquivoDoCurso {
	arquivo: string;
	hash: string;
}

/** A etapa Materiais: os arquivos prontos ao confirmar, em ordem de caminho (pode ser vazia). */
export interface DadosMateriais {
	arquivos: ArquivoDoCurso[];
}

/** A etapa Objetivo. */
export interface DadosObjetivo {
	escopo: Escopo;
	tipo: TipoCurso;
	/** Texto livre; pode ser vazio. */
	motivo: string;
}

/** A etapa Mapa: os ids dos conceitos do mapa da matéria que entram no curso, na ordem do mapa. */
export interface DadosMapa {
	conceitos: string[];
}

/** A etapa Diagnóstico (parte B, docs/cursos.md): o diagnóstico concluído, com concluidoEm (diagnostico-tipos.ts). */
export type DadosDiagnostico = Diagnostico;
/** Parte C: o formato chega com ela. */
export type DadosEsqueleto = Record<string, unknown>;

/** O que cada etapa guarda no curso.json. */
export interface DadosDasEtapas {
	basico: DadosBasico;
	materiais: DadosMateriais;
	objetivo: DadosObjetivo;
	mapa: DadosMapa;
	diagnostico: DadosDiagnostico;
	esqueleto: DadosEsqueleto;
}

/** O que a tela manda para confirmar o Básico: os dados da etapa e o nome do curso (o nome pode mudar; o id não). */
export interface EntradaBasico extends DadosBasico {
	nome: string;
}

/** O que a tela manda para confirmar cada etapa. */
export interface EntradasDasEtapas extends Omit<DadosDasEtapas, "basico"> {
	basico: EntradaBasico;
}

/** O curso.json. Uma etapa não confirmada é null. */
export interface Curso {
	versao: typeof VERSAO_CURSO;
	/** Do nome, como o da matéria; não muda. */
	id: string;
	nome: string;
	/** O id da matéria. */
	materia: string;
	situacao: SituacaoCurso;
	/** A primeira etapa ainda não confirmada (onde o guia reabre); com todas confirmadas, esqueleto. */
	etapa: Etapa;
	/** ISO 8601. */
	criadoEm: string;
	/** ISO 8601 da última mudança no curso. */
	alteradoEm: string;
	basico: DadosBasico | null;
	materiais: DadosMateriais | null;
	objetivo: DadosObjetivo | null;
	mapa: DadosMapa | null;
	/**
	 * O diagnóstico enquanto não termina (a etapa diagnostico continua null):
	 * a autoavaliação, as questões e as respostas. Concluir o diagnóstico o
	 * transforma na etapa; tudo o que invalida a etapa diagnostico o apaga.
	 * Ausente (ou null) quando não há.
	 */
	diagnosticoEmAndamento?: DiagnosticoEmAndamento | null;
	diagnostico: DadosDiagnostico | null;
	esqueleto: DadosEsqueleto | null;
}

/** Um curso na lista da seção Cursos do caderno. */
export interface ResumoCurso {
	id: string;
	nome: string;
	situacao: SituacaoCurso;
	etapa: Etapa;
	/** O prazo do Básico, ou null. */
	prazo: string | null;
	alteradoEm: string;
}

export interface ListaCursos {
	/** Na ordem de criação. */
	cursos: Curso[];
	/** Pastas em cursos/ com curso.json faltando ou ilegível (nunca sobrescritas). */
	erros: Array<{ pasta: string; mensagem: string }>;
}

// --- Ponte (painel "cursos") -------------------------------------------------

/** confirmar: os dados vêm no formato da etapa (para basico, com o nome). */
export type AcaoConfirmarCurso = {
	[E in Etapa]: { materia: string; curso: string; pedido: string; etapa: E; dados: EntradasDasEtapas[E] };
}[Etapa];

/** Os dados de cada ação da tela para a extensão (interface:acao, painel cursos). */
export interface AcoesCursos {
	listar: { materia: string };
	abrir: { materia: string; curso: string };
	/** Cria o rascunho com o Básico já confirmado. */
	comecar: { materia: string; pedido: string; basico: EntradaBasico };
	confirmar: AcaoConfirmarCurso;
	/** Só um rascunho. */
	descartar: { materia: string; curso: string; pedido: string };
	/** Manda de novo o curso com os materiais prontos de agora (a tela pede quando muda quantos materiais prontos a matéria tem). */
	prontos: { materia: string; curso: string };
	/** Diagnóstico: salva a autoavaliação (inteira: um nível por conceito avaliado) em andamento. */
	autoavaliar: { materia: string; curso: string; pedido: string; niveis: Record<string, NivelAutoavaliacao> };
	/** Diagnóstico: gera as questões (exige a autoavaliação completa); gerar de novo descarta as questões e as respostas anteriores. */
	gerar_diagnostico: { materia: string; curso: string; pedido: string };
	/** Diagnóstico: grava a resposta (escolha na alternativa, texto na dissertativa); a dissertativa é corrigida em seguida. */
	responder: { materia: string; curso: string; pedido: string; questao: string; confianca: Confianca; escolha?: number; texto?: string; tempoMs: number };
	/** Diagnóstico: exige todas as questões respondidas e corrigidas; confirma a etapa. */
	concluir_diagnostico: { materia: string; curso: string; pedido: string };
	/** Tenta de novo a correção de uma dissertativa que falhou. */
	corrigir: { materia: string; curso: string; pedido: string; questao: string };
}

export type AcaoCursos = keyof AcoesCursos;

/** A mensagem "lista" (interface:mostrar, gravar: false). */
export interface MensagemListaCursos {
	materia: string;
	cursos: ResumoCurso[];
}

/**
 * A mensagem "curso": o curso.json inteiro, depois de abrir, começar ou
 * confirmar. Enquanto alguma questão do diagnóstico está sem resposta, o
 * diagnosticoEmAndamento vem sem o gabarito (paraATela, em diagnostico-tipos.ts).
 */
export interface MensagemCurso {
	materia: string;
	curso: Curso;
	/** As etapas que a confirmação apagou. */
	invalidadas?: Etapa[];
	pedido?: string;
	/** Os materiais prontos da matéria agora ({arquivo, hash} dos manifestos do .extraido, em ordem de caminho), para a tela comparar com a etapa Materiais. */
	prontos?: ArquivoDoCurso[];
	/** Enquanto as questões do diagnóstico estão sendo geradas. */
	gerandoDiagnostico?: boolean;
	/** As dissertativas do diagnóstico que estão sendo corrigidas agora. */
	corrigindo?: string[];
}

/** A mensagem "descartado". */
export interface MensagemDescartado {
	materia: string;
	curso: string;
	pedido: string;
}

/** A mensagem "erro". */
export interface MensagemErroCursos {
	mensagem: string;
	/** A ação que falhou (listar, abrir, comecar…). */
	ao?: string;
	materia?: string;
	curso?: string;
	pedido?: string;
	/** A questão, num erro de correção (ao: "corrigir"). */
	questao?: string;
}

/** As mensagens da extensão para a tela (interface:mostrar, painel cursos, sempre gravar: false). */
export interface MensagensCursos {
	lista: MensagemListaCursos;
	curso: MensagemCurso;
	descartado: MensagemDescartado;
	erro: MensagemErroCursos;
}

// --- Funções -----------------------------------------------------------------

export class ErroCurso extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroCurso";
	}
}

const NOMES_ETAPAS: Record<Etapa, string> = {
	basico: "Básico",
	materiais: "Materiais",
	objetivo: "Objetivo",
	mapa: "Mapa",
	diagnostico: "Diagnóstico",
	esqueleto: "Esqueleto",
};

/** O nome da etapa como a tela mostra ("Básico", "Diagnóstico"…). */
export function nomeDaEtapa(etapa: Etapa): string {
	return NOMES_ETAPAS[etapa];
}

const ehEtapa = (valor: unknown): valor is Etapa => (ETAPAS as readonly unknown[]).includes(valor);

/** A data local de agora em AAAA-MM-DD (o "hoje" da validação do prazo). */
export function hojeLocal(agora: Date = new Date()): string {
	const dois = (numero: number) => String(numero).padStart(2, "0");
	return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** AAAA-MM-DD de um dia que existe (2026-02-30 não). */
function ehData(texto: string): boolean {
	const achado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
	if (!achado) return false;
	const [ano, mes, dia] = [Number(achado[1]), Number(achado[2]), Number(achado[3])];
	const data = new Date(Date.UTC(ano, mes - 1, dia));
	return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

const limparTexto = (texto: string) => texto.trim().replace(/\s+/g, " ");

const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** O que a validação precisa saber além dos dados da etapa. */
export interface ContextoValidacao {
	/** AAAA-MM-DD; sem ele, hojeLocal(). O prazo não pode ser antes. */
	hoje?: string;
	/** O curso como está (o Objetivo confere os materiais confirmados nele; o Diagnóstico, a autoavaliação dos conceitos do Mapa). */
	curso?: (Pick<Curso, "materiais"> & Partial<Pick<Curso, "mapa">>) | null;
	/** O momento da confirmação (o concluidoEm do Diagnóstico); sem ele, agora. */
	agora?: Date;
	/** O mapa da matéria (a etapa Mapa precisa dele). */
	mapa?: MapaConteudo | null;
}

function validarBasico(dados: Record<string, unknown>, contexto: ContextoValidacao): EntradaBasico {
	const nome = typeof dados.nome === "string" ? limparTexto(dados.nome) : "";
	if (!nome) throw new ErroCurso("Escreva o nome do curso.");
	if (nome.length > TAMANHO_NOME_CURSO) throw new ErroCurso(`O nome do curso pode ter até ${TAMANHO_NOME_CURSO} caracteres.`);
	let prazo: string | null = null;
	if (dados.prazo !== undefined && dados.prazo !== null && dados.prazo !== "") {
		const texto = typeof dados.prazo === "string" ? dados.prazo.trim() : "";
		if (!ehData(texto)) throw new ErroCurso(`O prazo precisa ser uma data no formato AAAA-MM-DD (veio "${mostrar(dados.prazo)}").`);
		const hoje = contexto.hoje ?? hojeLocal();
		if (texto < hoje) throw new ErroCurso(`O prazo ${texto} já passou. Escolha uma data a partir de hoje (${hoje}) ou deixe o curso sem prazo.`);
		prazo = texto;
	}
	if (dados.prova !== undefined && dados.prova !== null && typeof dados.prova !== "string") {
		throw new ErroCurso(`A prova precisa ser um texto (veio "${mostrar(dados.prova)}").`);
	}
	const prova = typeof dados.prova === "string" ? limparTexto(dados.prova) : "";
	const horas = dados.horasPorSemana;
	if (typeof horas !== "number" || !Number.isFinite(horas) || horas < HORAS_MINIMAS || horas > HORAS_MAXIMAS) {
		throw new ErroCurso(`As horas por semana precisam ser um número de ${HORAS_MINIMAS} a ${HORAS_MAXIMAS} (veio "${mostrar(horas)}").`);
	}
	return { nome, prazo, ...(prova ? { prova } : {}), horasPorSemana: horas };
}

function validarMateriais(dados: Record<string, unknown>): DadosMateriais {
	if (!Array.isArray(dados.arquivos)) throw new ErroCurso("A etapa Materiais precisa da lista de arquivos (pode ser vazia).");
	const porArquivo = new Map<string, ArquivoDoCurso>();
	for (const item of dados.arquivos as unknown[]) {
		const arquivo = ehObjeto(item) && typeof item.arquivo === "string" ? item.arquivo.trim() : "";
		const hash = ehObjeto(item) && typeof item.hash === "string" ? item.hash.trim() : "";
		if (!arquivo || !hash) throw new ErroCurso(`Cada material precisa do caminho e do hash do extraído (veio ${mostrar(item)}).`);
		if (!porArquivo.has(arquivo)) porArquivo.set(arquivo, { arquivo, hash });
	}
	return { arquivos: [...porArquivo.values()].sort((a, b) => a.arquivo.localeCompare(b.arquivo)) };
}

function validarObjetivo(dados: Record<string, unknown>, contexto: ContextoValidacao): DadosObjetivo {
	if (!(ESCOPOS as readonly unknown[]).includes(dados.escopo)) {
		throw new ErroCurso(`O escopo precisa ser um de: ${ESCOPOS.join(", ")} (veio "${mostrar(dados.escopo)}").`);
	}
	if (!(TIPOS_CURSO as readonly unknown[]).includes(dados.tipo)) {
		throw new ErroCurso(`O tipo do curso precisa ser um de: ${TIPOS_CURSO.join(", ")} (veio "${mostrar(dados.tipo)}").`);
	}
	if (dados.motivo !== undefined && dados.motivo !== null && typeof dados.motivo !== "string") {
		throw new ErroCurso(`O motivo precisa ser um texto (veio "${mostrar(dados.motivo)}").`);
	}
	const escopo = dados.escopo as Escopo;
	if (escopo === "so_material" && !contexto.curso?.materiais?.arquivos.length) {
		throw new ErroCurso('O escopo "só o material" precisa de pelo menos um material confirmado na etapa Materiais. Adicione materiais ou escolha outro escopo.');
	}
	return { escopo, tipo: dados.tipo as TipoCurso, motivo: typeof dados.motivo === "string" ? dados.motivo.trim() : "" };
}

function validarMapa(dados: Record<string, unknown>, contexto: ContextoValidacao): DadosMapa {
	if (!Array.isArray(dados.conceitos) || !(dados.conceitos as unknown[]).every((id) => typeof id === "string")) {
		throw new ErroCurso("A etapa Mapa precisa da lista dos ids dos conceitos do curso.");
	}
	const escolhidos = new Set((dados.conceitos as string[]).map((id) => id.trim()).filter(Boolean));
	if (escolhidos.size === 0) throw new ErroCurso("Escolha pelo menos um conceito do mapa para o curso.");
	const mapa = contexto.mapa;
	if (!mapa) throw new ErroCurso("Falta o mapa da matéria para conferir os conceitos escolhidos.");
	if (mapa.situacao !== "aprovado") {
		throw new ErroCurso("O mapa da matéria precisa estar aprovado para confirmar esta etapa. Revise e aprove o mapa (seção Mapa do caderno) e confirme de novo.");
	}
	const dentro = mapa.conceitos.filter((conceito) => !conceito.fora).map((conceito) => conceito.id);
	const deDentro = new Set(dentro);
	const fora = [...escolhidos].filter((id) => !deDentro.has(id));
	if (fora.length > 0) {
		throw new ErroCurso(`${fora.length === 1 ? "Este conceito não está" : "Estes conceitos não estão"} dentro do mapa da matéria (saíram do mapa ou foram tirados dele): ${fora.join(", ")}.`);
	}
	return { conceitos: dentro.filter((id) => escolhidos.has(id)) };
}

// --- O diagnóstico em andamento (parte B) --------------------------------------
// Ficam aqui, e não em diagnostico-tipos.ts, porque validarEtapa usa; o
// diagnostico-tipos.ts reexporta.

const ehNivel = (valor: unknown): valor is NivelAutoavaliacao => valor === 0 || valor === 1 || valor === 2 || valor === 3;

/** Os ids das questões do diagnóstico sem resposta, na ordem das questões. Sem diagnóstico, nenhuma. */
export function faltaResponder(emAndamento: DiagnosticoEmAndamento | null | undefined): string[] {
	if (!emAndamento) return [];
	return emAndamento.questoes.filter((questao) => emAndamento.respostas[questao.id] === undefined).map((questao) => questao.id);
}

/** Os ids das dissertativas já respondidas cuja correção ainda não chegou, na ordem das questões. */
export function faltaCorrigir(emAndamento: DiagnosticoEmAndamento | null | undefined): string[] {
	if (!emAndamento) return [];
	return emAndamento.questoes
		.filter((questao) => {
			const resposta = emAndamento.respostas[questao.id] as RespostaDissertativa | undefined;
			return questao.tipo === "dissertativa" && resposta !== undefined && !resposta.correcao;
		})
		.map((questao) => questao.id);
}

/** Se o diagnóstico pode ser concluído: há questões, todas respondidas, e as dissertativas corrigidas. */
export function podeConcluir(emAndamento: DiagnosticoEmAndamento | null | undefined): boolean {
	return !!emAndamento && emAndamento.questoes.length > 0 && faltaResponder(emAndamento).length === 0 && faltaCorrigir(emAndamento).length === 0;
}

const listaDeIds = (ids: string[]) => ids.join(", ");

/**
 * O Diagnóstico: o conteúdo do diagnosticoEmAndamento, com podeConcluir
 * verdadeiro, vira o diagnóstico concluído (com concluidoEm: o que já vier, ou
 * agora). Com o Mapa do curso no contexto, todo conceito dele precisa de nível.
 */
function validarDiagnostico(dados: Record<string, unknown>, contexto: ContextoValidacao): Diagnostico {
	const { autoavaliacao, questoes, respostas } = dados;
	if (!ehObjeto(autoavaliacao) || !Array.isArray(questoes) || !ehObjeto(respostas)) {
		throw new ErroCurso("O diagnóstico precisa da autoavaliação, das questões e das respostas.");
	}
	const invalidos = Object.keys(autoavaliacao).filter((id) => !ehNivel(autoavaliacao[id]));
	if (invalidos.length > 0) throw new ErroCurso(`A autoavaliação precisa de um nível de 0 a 3 em cada conceito (veio outra coisa em ${listaDeIds(invalidos)}).`);
	const semNivel = (contexto.curso?.mapa?.conceitos ?? []).filter((id) => !ehNivel(autoavaliacao[id]));
	if (semNivel.length > 0) {
		throw new ErroCurso(`Falta a autoavaliação de ${semNivel.length === 1 ? "um conceito do curso" : `${semNivel.length} conceitos do curso`}: ${listaDeIds(semNivel)}.`);
	}
	if (questoes.length === 0 || typeof dados.geradoEm !== "string" || typeof dados.modelo !== "string" || typeof dados.custo !== "number") {
		throw new ErroCurso("Gere as questões do diagnóstico antes de concluir.");
	}
	if (!questoes.every((questao) => ehObjeto(questao) && typeof questao.id === "string" && (questao.tipo === "alternativa" || questao.tipo === "dissertativa"))) {
		throw new ErroCurso("As questões do diagnóstico não estão no formato (cada uma precisa de id e tipo).");
	}
	const emAndamento = dados as unknown as DiagnosticoEmAndamento;
	const semResposta = faltaResponder(emAndamento);
	if (semResposta.length > 0) {
		throw new ErroCurso(`Responda todas as questões antes de concluir o diagnóstico (falta${semResposta.length === 1 ? "" : "m"} ${listaDeIds(semResposta)}).`);
	}
	const semCorrecao = faltaCorrigir(emAndamento);
	if (semCorrecao.length > 0) {
		throw new ErroCurso(`Espere a correção da${semCorrecao.length === 1 ? " dissertativa" : "s dissertativas"} ${listaDeIds(semCorrecao)} antes de concluir o diagnóstico.`);
	}
	const concluidoEm = typeof dados.concluidoEm === "string" && dados.concluidoEm ? dados.concluidoEm : (contexto.agora ?? new Date()).toISOString();
	return structuredClone({
		autoavaliacao,
		questoes,
		geradoEm: dados.geradoEm,
		modelo: dados.modelo,
		custo: dados.custo,
		respostas,
		concluidoEm,
	}) as unknown as Diagnostico;
}

/**
 * Confere os dados de uma etapa e devolve eles limpos (espaços nas pontas,
 * campos na ordem do formato; Materiais em ordem de caminho e sem repetir;
 * Mapa na ordem do mapa e sem repetir; Diagnóstico com concluidoEm). Um
 * problema é um ErroCurso com a frase para a tela. Não confere a ordem das
 * etapas: isso é conferirOrdem.
 */
export function validarEtapa<E extends Etapa>(etapa: E, dados: unknown, contexto: ContextoValidacao = {}): EntradasDasEtapas[E] {
	if (!ehEtapa(etapa)) throw new ErroCurso(`Etapa desconhecida: "${mostrar(etapa)}".`);
	if (etapa === "esqueleto") throw new ErroCurso("A etapa Esqueleto chega na parte C do item 5.");
	if (!ehObjeto(dados)) throw new ErroCurso(`Os dados da etapa ${nomeDaEtapa(etapa)} vieram vazios.`);
	switch (etapa) {
		case "basico":
			return validarBasico(dados, contexto) as EntradasDasEtapas[E];
		case "materiais":
			return validarMateriais(dados) as EntradasDasEtapas[E];
		case "objetivo":
			return validarObjetivo(dados, contexto) as EntradasDasEtapas[E];
		case "diagnostico":
			return validarDiagnostico(dados, contexto) as EntradasDasEtapas[E];
		default:
			return validarMapa(dados, contexto) as EntradasDasEtapas[E];
	}
}

/** Chaves em ordem alfabética, sem as undefined, e textos sem espaços nas pontas, em qualquer profundidade. */
function canonico(valor: unknown): unknown {
	if (typeof valor === "string") return valor.trim();
	if (Array.isArray(valor)) return valor.map(canonico);
	if (ehObjeto(valor)) {
		const saida: Record<string, unknown> = {};
		for (const chave of Object.keys(valor).sort()) if (valor[chave] !== undefined) saida[chave] = canonico(valor[chave]);
		return saida;
	}
	return valor;
}

/**
 * Os dados de uma etapa num formato para comparar: chaves em ordem, textos
 * sem espaços nas pontas; no Básico, sem o nome do curso (ele não é dado da
 * etapa), com prova vazia igual a sem prova e prazo vazio igual a null; em
 * Materiais, os arquivos em ordem de caminho. null e undefined dão null.
 */
export function normalizar(etapa: Etapa, dados: unknown): unknown {
	if (dados === null || dados === undefined) return null;
	if (!ehObjeto(dados)) return canonico(dados);
	let valor: Record<string, unknown> = dados;
	if (etapa === "basico") {
		const { nome: _nome, ...resto } = valor;
		if (resto.prova === null || (typeof resto.prova === "string" && !resto.prova.trim())) delete resto.prova;
		if (resto.prazo === undefined || resto.prazo === "") resto.prazo = null;
		valor = resto;
	} else if (etapa === "materiais" && Array.isArray(valor.arquivos)) {
		const chave = (item: unknown) => (ehObjeto(item) && typeof item.arquivo === "string" ? item.arquivo.trim() : "");
		valor = { ...valor, arquivos: [...(valor.arquivos as unknown[])].sort((a, b) => chave(a).localeCompare(chave(b))) };
	}
	return canonico(valor);
}

/** Se os dados das duas confirmações da etapa são a mesma coisa (pela normalizar). */
export function iguais(etapa: Etapa, a: unknown, b: unknown): boolean {
	return JSON.stringify(normalizar(etapa, a)) === JSON.stringify(normalizar(etapa, b));
}

/** A tabela de docs/cursos.md: o que uma mudança em cada etapa invalida (sem a regra do escopo livre). */
const DEPENDENTES: Record<Etapa, readonly Etapa[]> = {
	basico: ["esqueleto"],
	materiais: ["mapa", "diagnostico", "esqueleto"],
	objetivo: ["diagnostico", "esqueleto"],
	mapa: ["diagnostico", "esqueleto"],
	diagnostico: ["esqueleto"],
	esqueleto: [],
};

/**
 * As etapas que confirmar `etapa` com `dados` apagaria, na ordem do guia,
 * para a tela avisar antes. Só entram as que estão confirmadas (as outras já
 * estão vazias). Nada se a etapa ainda não estava confirmada ou se os dados
 * são a mesma coisa (iguais). No Objetivo, o Mapa entra também se o escopo
 * mudou de ou para livre. Em Materiais, o Objetivo entra também se a lista
 * ficou vazia e o Objetivo confirmado é só o material. O Diagnóstico entra
 * também quando só há o diagnóstico em andamento (diagnosticoEmAndamento),
 * que a confirmação apagaria.
 */
export function oQueInvalida<E extends Etapa>(curso: Curso, etapa: E, dados: EntradasDasEtapas[E] | DadosDasEtapas[E]): Etapa[] {
	const atual = curso[etapa];
	if (atual === null || atual === undefined || iguais(etapa, atual, dados)) return [];
	const alvo = new Set<Etapa>(DEPENDENTES[etapa]);
	if (etapa === "objetivo") {
		const antes = (atual as DadosObjetivo).escopo === "livre";
		const depois = (dados as DadosObjetivo | null)?.escopo === "livre";
		if (antes !== depois) alvo.add("mapa");
	}
	if (etapa === "materiais" && curso.objetivo?.escopo === "so_material" && !(dados as DadosMateriais | null)?.arquivos?.length) alvo.add("objetivo");
	const emAndamento = curso.diagnosticoEmAndamento !== null && curso.diagnosticoEmAndamento !== undefined;
	return ETAPAS.filter((item) => alvo.has(item) && ((curso[item] !== null && curso[item] !== undefined) || (item === "diagnostico" && emAndamento)));
}

/** A primeira etapa não confirmada; com todas confirmadas, esqueleto. */
export function etapaDoCurso(curso: Curso): Etapa {
	return ETAPAS.find((etapa) => curso[etapa] === null || curso[etapa] === undefined) ?? "esqueleto";
}

/** Erro se alguma etapa antes de `etapa` não está confirmada (o guia só anda para a frente). */
export function conferirOrdem(curso: Curso, etapa: Etapa): void {
	if (!ehEtapa(etapa)) throw new ErroCurso(`Etapa desconhecida: "${mostrar(etapa)}".`);
	const faltando = ETAPAS.slice(0, ETAPAS.indexOf(etapa)).find((anterior) => curso[anterior] === null || curso[anterior] === undefined);
	if (faltando) throw new ErroCurso(`Confirme antes a etapa ${nomeDaEtapa(faltando)}.`);
}

/**
 * Confirma a etapa com os dados (já validados por validarEtapa): grava a
 * etapa, apaga as que ela invalida (oQueInvalida), recalcula `etapa` e, se
 * algo mudou, alteradoEm. No Básico, o nome que vier troca o nome do curso
 * (o id fica). Confirmar o Diagnóstico tira o diagnosticoEmAndamento, e
 * invalidar o Diagnóstico também o apaga. Confirmar com a mesma coisa não
 * muda nada. Se uma etapa anterior não está confirmada, ErroCurso.
 */
export function confirmarEtapa<E extends Etapa>(
	curso: Curso,
	etapa: E,
	dados: EntradasDasEtapas[E] | DadosDasEtapas[E],
	agora: Date = new Date(),
): { curso: Curso; invalidadas: Etapa[] } {
	conferirOrdem(curso, etapa);
	const invalidadas = oQueInvalida(curso, etapa, dados);
	const novo = structuredClone(curso);
	let valor = structuredClone(dados) as unknown as Record<string, unknown>;
	if (etapa === "basico") {
		const { nome, ...resto } = valor;
		if (typeof nome === "string" && limparTexto(nome)) novo.nome = limparTexto(nome);
		valor = resto;
	}
	const atual = curso[etapa];
	if (atual === null || atual === undefined || !iguais(etapa, atual, valor)) (novo as unknown as Record<Etapa, unknown>)[etapa] = valor;
	for (const item of invalidadas) novo[item] = null;
	if (etapa === "diagnostico" || invalidadas.includes("diagnostico")) delete novo.diagnosticoEmAndamento;
	novo.etapa = etapaDoCurso(novo);
	if (JSON.stringify(novo) !== JSON.stringify(curso)) novo.alteradoEm = agora.toISOString();
	return { curso: novo, invalidadas };
}

/** Um curso novo, rascunho, com o Básico (já validado) confirmado: a etapa fica materiais. */
export function novoCurso(id: string, materia: string, basico: EntradaBasico, agora: Date = new Date()): Curso {
	const momento = agora.toISOString();
	const vazio: Curso = {
		versao: VERSAO_CURSO,
		id,
		nome: limparTexto(basico.nome),
		materia,
		situacao: "rascunho",
		etapa: "basico",
		criadoEm: momento,
		alteradoEm: momento,
		basico: null,
		materiais: null,
		objetivo: null,
		mapa: null,
		diagnostico: null,
		esqueleto: null,
	};
	return confirmarEtapa(vazio, "basico", basico, agora).curso;
}

/** O curso na lista do caderno. */
export function resumoDoCurso(curso: Curso): ResumoCurso {
	return { id: curso.id, nome: curso.nome, situacao: curso.situacao, etapa: curso.etapa, prazo: curso.basico?.prazo ?? null, alteradoEm: curso.alteradoEm };
}

/**
 * Se os materiais prontos da matéria agora não são os que a etapa Materiais
 * confirmou (arquivo a mais, a menos ou com outro hash), para o aviso da
 * tela. Com Materiais não confirmada, false.
 */
export function materiaisMudaram(curso: Curso, prontos: readonly ArquivoDoCurso[]): boolean {
	const confirmados = curso.materiais?.arquivos;
	if (!confirmados) return false;
	const antes = new Map(confirmados.map((item) => [item.arquivo, item.hash]));
	const agora = new Map(prontos.map((item) => [item.arquivo, item.hash]));
	if (antes.size !== agora.size) return true;
	for (const [arquivo, hash] of agora) if (antes.get(arquivo) !== hash) return true;
	return false;
}

/** Os ids do Mapa do curso que não estão mais dentro do mapa da matéria (saíram ou foram tirados), para o aviso da tela. */
export function conceitosForaDoMapa(curso: Curso, mapa: MapaConteudo): string[] {
	const dentro = new Set(mapa.conceitos.filter((conceito) => !conceito.fora).map((conceito) => conceito.id));
	return (curso.mapa?.conceitos ?? []).filter((id) => !dentro.has(id));
}
