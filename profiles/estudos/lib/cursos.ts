// Os cursos no disco (item 5, docs/cursos.md): cada curso é a pasta
// materias/<matéria>/cursos/<curso>/ com o curso.json, gravado inteiro de uma
// vez. Começar e descartar um rascunho gravam um evento no eventos.jsonl da
// matéria; confirmar uma etapa não grava. As regras (validação, o que cada
// etapa invalida) são puras e ficam em curso-tipos.ts. Sem dependências: o pi
// carrega a extensão desta pasta.

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	type ArquivoDoCurso,
	conferirOrdem,
	confirmarEtapa,
	type Curso,
	type DadosBasico,
	ErroCurso,
	ETAPAS,
	type Etapa,
	hojeLocal,
	type ListaCursos,
	novoCurso,
	validarEtapa,
	VERSAO_CURSO,
} from "./curso-tipos.ts";
import { acrescentarEvento, criarEvento } from "./eventos.ts";
import { lerMapa, listarManifestos } from "./mapa.ts";
import { arquivoMateria, eventosMateria, idLivre, pastaMateria } from "./materias.ts";

export * from "./curso-tipos.ts";

export const pastaCursos = (dados: string, materia: string) => join(pastaMateria(dados, materia), "cursos");
export const pastaDoCurso = (dados: string, materia: string, curso: string) => join(pastaCursos(dados, materia), curso);
export const caminhoDoCurso = (dados: string, materia: string, curso: string) => join(pastaDoCurso(dados, materia, curso), "curso.json");

/** O que as funções que gravam aceitam: a sessão (para o evento), o momento e o "hoje" da validação do prazo. */
export interface ContextoCurso {
	sessao?: string;
	/** Sem ele, agora. */
	agora?: Date;
	/** AAAA-MM-DD; sem ele, hojeLocal(agora). */
	hoje?: string;
}

const daSessao = (contexto: ContextoCurso) => (contexto.sessao ? { sessao: contexto.sessao } : {});

/** Um id que vem da tela vira nome de pasta: nada de barras, dois pontos ou "..". */
function conferirId(id: unknown, oQue: "matéria" | "curso"): string {
	if (typeof id !== "string" || !id || id === "." || id === ".." || /[\\/:*?"<>|\u0000-\u001f]/.test(id)) {
		throw new ErroCurso(`O id d${oQue === "curso" ? "o curso" : "a matéria"} não é válido ("${String(id)}").`);
	}
	return id;
}

/** O curso.json lido, conferido e com as etapas ausentes como null. Erro (com a frase) se não estiver no formato. */
function cursoLido(valor: unknown, materia: string, pasta: string): Curso {
	const curso = valor as Partial<Record<keyof Curso, unknown>> | null;
	if (typeof curso !== "object" || curso === null || Array.isArray(curso) || curso.versao !== VERSAO_CURSO) {
		throw new Error(`não está no formato da versão ${VERSAO_CURSO}`);
	}
	if (typeof curso.id !== "string" || typeof curso.nome !== "string" || typeof curso.materia !== "string") throw new Error("faltam campos (id, nome, materia)");
	if (curso.id !== pasta) throw new Error(`o id "${curso.id}" não é o nome da pasta`);
	if (curso.materia !== materia) throw new Error(`a matéria "${curso.materia}" não é a da pasta`);
	if (curso.situacao !== "rascunho" && curso.situacao !== "pronto") throw new Error(`situação desconhecida ("${String(curso.situacao)}")`);
	if (!(ETAPAS as readonly unknown[]).includes(curso.etapa)) throw new Error(`etapa desconhecida ("${String(curso.etapa)}")`);
	if (typeof curso.criadoEm !== "string" || typeof curso.alteradoEm !== "string") throw new Error("faltam criadoEm ou alteradoEm");
	for (const etapa of ETAPAS) {
		const dados = curso[etapa];
		if (dados !== undefined && dados !== null && (typeof dados !== "object" || Array.isArray(dados))) throw new Error(`a etapa ${etapa} não é um objeto`);
	}
	const emAndamento = curso.diagnosticoEmAndamento;
	if (emAndamento !== undefined && emAndamento !== null && (typeof emAndamento !== "object" || Array.isArray(emAndamento))) {
		throw new Error("o diagnosticoEmAndamento não é um objeto");
	}
	return cursoNaOrdem(curso as Curso);
}

/** O curso com os campos na ordem do formato (etapas ausentes como null; o diagnosticoEmAndamento só quando há). */
function cursoNaOrdem(curso: Curso): Curso {
	const basico: DadosBasico | null = curso.basico
		? { prazo: curso.basico.prazo ?? null, ...(curso.basico.prova ? { prova: curso.basico.prova } : {}), horasPorSemana: curso.basico.horasPorSemana }
		: null;
	return {
		versao: VERSAO_CURSO,
		id: curso.id,
		nome: curso.nome,
		materia: curso.materia,
		situacao: curso.situacao,
		etapa: curso.etapa,
		criadoEm: curso.criadoEm,
		alteradoEm: curso.alteradoEm,
		basico,
		materiais: curso.materiais ?? null,
		objetivo: curso.objetivo ?? null,
		mapa: curso.mapa ?? null,
		...(curso.diagnosticoEmAndamento ? { diagnosticoEmAndamento: curso.diagnosticoEmAndamento } : {}),
		diagnostico: curso.diagnostico ?? null,
		esqueleto: curso.esqueleto ?? null,
	};
}

async function lerDaPasta(dados: string, materia: string, pasta: string): Promise<Curso> {
	const conteudo = await readFile(caminhoDoCurso(dados, materia, pasta), "utf8");
	let valor: unknown;
	try {
		valor = JSON.parse(conteudo);
	} catch (erro) {
		throw new Error(`o JSON está inválido (${(erro as Error).message})`);
	}
	return cursoLido(valor, materia, pasta);
}

/**
 * Os cursos da matéria, na ordem de criação. Uma pasta em cursos/ com
 * curso.json faltando ou ilegível vai para `erros` (como listarMaterias) e
 * nunca é sobrescrita. Sem cursos/, nenhum.
 */
export async function listarCursos(dados: string, materia: string): Promise<ListaCursos> {
	conferirId(materia, "matéria");
	const cursos: Curso[] = [];
	const erros: ListaCursos["erros"] = [];
	let pastas;
	try {
		pastas = await readdir(pastaCursos(dados, materia), { withFileTypes: true });
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return { cursos, erros };
		throw erro;
	}
	for (const pasta of pastas) {
		if (!pasta.isDirectory()) continue;
		try {
			cursos.push(await lerDaPasta(dados, materia, pasta.name));
		} catch (erro) {
			const mensagem = (erro as NodeJS.ErrnoException).code === "ENOENT" ? "não existe" : (erro as Error).message;
			erros.push({ pasta: pasta.name, mensagem: `curso.json: ${mensagem}` });
		}
	}
	cursos.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id));
	return { cursos, erros };
}

/** O curso. Sem curso.json, ou um curso.json ilegível, ErroCurso (e nada é gravado por cima). */
export async function lerCurso(dados: string, materia: string, curso: string): Promise<Curso> {
	conferirId(materia, "matéria");
	conferirId(curso, "curso");
	try {
		return await lerDaPasta(dados, materia, curso);
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") throw new ErroCurso(`Não achei o curso "${curso}" da matéria "${materia}".`);
		throw new ErroCurso(`Não consegui ler o curso ${caminhoDoCurso(dados, materia, curso)}: ${(erro as Error).message}. Corrija o arquivo; nada foi gravado por cima.`);
	}
}

/** Grava o curso.json inteiro de uma vez (escreve ao lado e renomeia), em JSON com tabulação. */
export async function gravarCurso(dados: string, curso: Curso): Promise<void> {
	const arquivo = caminhoDoCurso(dados, conferirId(curso.materia, "matéria"), conferirId(curso.id, "curso"));
	await mkdir(dirname(arquivo), { recursive: true });
	const temporario = `${arquivo}.${process.pid}.tmp`;
	await writeFile(temporario, `${JSON.stringify(cursoNaOrdem(curso), null, "\t")}\n`, "utf8");
	await rename(temporario, arquivo);
}

/**
 * Cria o rascunho: valida o Básico (com o nome), escolhe o id pelo nome (como
 * o da matéria, com -2, -3… se já houver um curso com ele na matéria), cria a
 * pasta e o curso.json com o Básico confirmado (etapa materiais) e grava o
 * evento comecou_curso. Matéria que não existe, ErroCurso.
 */
export async function comecarCurso(dados: string, materia: string, basico: unknown, contexto: ContextoCurso = {}): Promise<Curso> {
	conferirId(materia, "matéria");
	const agora = contexto.agora ?? new Date();
	const entrada = validarEtapa("basico", basico, { hoje: contexto.hoje ?? hojeLocal(agora) });
	try {
		await stat(arquivoMateria(dados, materia));
	} catch {
		throw new ErroCurso(`Não achei a matéria "${materia}".`);
	}
	const pasta = pastaCursos(dados, materia);
	await mkdir(pasta, { recursive: true });
	const existentes = new Set((await readdir(pasta)).map((nome) => nome.toLowerCase()));
	let id: string;
	for (;;) {
		id = idLivre(entrada.nome, existentes, "curso");
		try {
			// Sem recursive: se outra criação pegou o mesmo id agora, EEXIST e tenta o próximo.
			await mkdir(join(pasta, id));
			break;
		} catch (erro) {
			if ((erro as NodeJS.ErrnoException).code !== "EEXIST") throw erro;
			existentes.add(id);
		}
	}
	const curso = novoCurso(id, materia, entrada, agora);
	try {
		await gravarCurso(dados, curso);
	} catch (erro) {
		await rm(pastaDoCurso(dados, materia, id), { recursive: true, force: true });
		throw erro;
	}
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ ...daSessao(contexto), verbo: "comecou_curso", objeto: { materia, curso: id }, resultado: { nome: curso.nome } }, agora),
	);
	return curso;
}

/**
 * Lê o curso, confere a ordem das etapas, valida os dados (o Objetivo vê os
 * materiais confirmados; o Mapa lê o mapa da matéria), confirma
 * (confirmarEtapa) e grava se algo mudou. Não grava evento.
 */
export async function confirmarNoDisco(
	dados: string,
	materia: string,
	curso: string,
	etapa: Etapa,
	entrada: unknown,
	contexto: ContextoCurso = {},
): Promise<{ curso: Curso; invalidadas: Etapa[] }> {
	const atual = await lerCurso(dados, materia, curso);
	const agora = contexto.agora ?? new Date();
	conferirOrdem(atual, etapa);
	const mapa = etapa === "mapa" ? await lerMapa(dados, materia) : undefined;
	const validos = validarEtapa(etapa, entrada, { hoje: contexto.hoje ?? hojeLocal(agora), curso: atual, mapa, agora });
	const resultado = confirmarEtapa(atual, etapa, validos, agora);
	if (JSON.stringify(resultado.curso) !== JSON.stringify(atual)) await gravarCurso(dados, resultado.curso);
	return resultado;
}

/**
 * Descarta um rascunho: apaga a pasta do curso e grava o evento
 * descartou_curso (resultado: o nome e a etapa onde parou). Devolve o curso
 * como estava. Um curso pronto não pode ser descartado (ErroCurso).
 */
export async function descartarCurso(dados: string, materia: string, curso: string, contexto: ContextoCurso = {}): Promise<Curso> {
	const atual = await lerCurso(dados, materia, curso);
	if (atual.situacao !== "rascunho") throw new ErroCurso(`O curso "${atual.nome}" já está pronto e não pode ser descartado: só um rascunho pode.`);
	await rm(pastaDoCurso(dados, materia, atual.id), { recursive: true, force: true });
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento(
			{ ...daSessao(contexto), verbo: "descartou_curso", objeto: { materia, curso: atual.id }, resultado: { nome: atual.nome, etapa: atual.etapa } },
			contexto.agora ?? new Date(),
		),
	);
	return atual;
}

/** Os materiais prontos da matéria agora ({arquivo, hash} dos manifestos do .extraido), em ordem de caminho. */
export async function materiaisProntos(dados: string, materia: string): Promise<ArquivoDoCurso[]> {
	return listarManifestos(dados, conferirId(materia, "matéria"));
}
