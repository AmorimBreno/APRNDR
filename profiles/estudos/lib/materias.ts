// Matérias do perfil de estudos (ESPECIFICACAO 7 e 8.1): cada matéria é a
// pasta <dados>/materias/<id>/ com um materia.json legível. As subpastas
// (materiais, notas, cursos…) só são criadas quando forem usadas, nos itens
// seguintes. Toda criação ou mudança grava um evento no eventos.jsonl da
// matéria (eventos.ts). Sem dependências: o pi carrega a extensão desta pasta.

import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acrescentarEvento, criarEvento } from "./eventos.ts";
import { CORES_MATERIA, type CorMateria, type EntradaMateria, GLIFOS_MATERIA, type ListaMaterias, type Materia, type Prova } from "./materia-tipos.ts";

export {
	CORES_MATERIA,
	type CorMateria,
	type EntradaMateria,
	GLIFOS_MATERIA,
	type ListaMaterias,
	type Materia,
	pastaMateriaisRelativa,
	type Prova,
} from "./materia-tipos.ts";

export class ErroMaterias extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroMaterias";
	}
}

export const pastaMaterias = (dados: string) => join(dados, "materias");
export const pastaMateria = (dados: string, id: string) => join(pastaMaterias(dados), id);
export const arquivoMateria = (dados: string, id: string) => join(pastaMateria(dados, id), "materia.json");
export const eventosMateria = (dados: string, id: string) => join(pastaMateria(dados, id), "eventos.jsonl");
export const pastaAprendiz = (dados: string) => join(dados, "aprendiz");
export const eventosAprendiz = (dados: string) => join(pastaAprendiz(dados), "eventos.jsonl");

/**
 * Confere a pasta de dados e cria materias/ e aprendiz/ se faltarem. Se a pasta
 * não existe ou não abre (o Google Drive ainda não montou o G:), o erro diz
 * como resolver.
 */
export async function garantirPastaDeDados(dados: string): Promise<void> {
	try {
		const info = await stat(dados);
		if (!info.isDirectory()) throw new Error("não é uma pasta");
	} catch {
		throw new ErroMaterias(
			`Não consegui abrir a pasta de dados ${dados}. Confira se o Google Drive está aberto e sincronizado (a pasta precisa estar disponível off-line) e tente de novo.`,
		);
	}
	await mkdir(pastaMaterias(dados), { recursive: true });
	await mkdir(pastaAprendiz(dados), { recursive: true });
}

/** O nome sem acento, em minúsculas, só letras, números e hífen ("Cálculo I" → "calculo-i"). */
export function idDoNome(nome: string): string {
	const base = nome
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/g, "");
	return base || "materia";
}

/** O id que ainda não existe: o do nome, ou ele com -2, -3… */
export function idLivre(nome: string, existentes: ReadonlySet<string>): string {
	const base = idDoNome(nome);
	if (!existentes.has(base)) return base;
	for (let numero = 2; ; numero++) {
		const candidato = `${base}-${numero}`;
		if (!existentes.has(candidato)) return candidato;
	}
}

/** Confere e normaliza o que veio da tela ou do agente. */
export function validarEntrada(entrada: EntradaMateria): Omit<Materia, "id" | "criadaEm"> {
	const nome = (entrada.nome ?? "").trim().replace(/\s+/g, " ");
	if (!nome) throw new ErroMaterias("Escreva o nome da matéria.");
	if (nome.length > 80) throw new ErroMaterias("O nome da matéria pode ter até 80 caracteres.");
	const cor = (entrada.cor ?? "moss") as CorMateria;
	if (!CORES_MATERIA.includes(cor)) throw new ErroMaterias(`A cor precisa ser uma de: ${CORES_MATERIA.join(", ")}.`);
	const glifo = entrada.glifo ?? "学";
	if (!(GLIFOS_MATERIA as readonly string[]).includes(glifo)) throw new ErroMaterias(`O ideograma precisa ser um de: ${GLIFOS_MATERIA.join(" ")}.`);
	const provas: Prova[] = [];
	for (const prova of entrada.provas ?? []) {
		const data = (prova.data ?? "").trim();
		if (!data) continue;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00`))) {
			throw new ErroMaterias(`A data da prova precisa estar no formato AAAA-MM-DD (veio "${data}").`);
		}
		provas.push({ nome: (prova.nome ?? "").trim() || "Prova", data });
	}
	return { nome, cor, glifo, provas };
}

function ehMateria(valor: unknown): valor is Materia {
	const materia = valor as Partial<Materia> | null;
	return typeof materia?.id === "string" && typeof materia.nome === "string" && Array.isArray(materia.provas);
}

/** As matérias da pasta de dados, na ordem de criação. */
export async function listarMaterias(dados: string): Promise<ListaMaterias> {
	await garantirPastaDeDados(dados);
	const materias: Materia[] = [];
	const erros: ListaMaterias["erros"] = [];
	for (const pasta of await readdir(pastaMaterias(dados), { withFileTypes: true })) {
		if (!pasta.isDirectory()) continue;
		try {
			const conteudo = JSON.parse(await readFile(arquivoMateria(dados, pasta.name), "utf8")) as unknown;
			if (!ehMateria(conteudo)) throw new Error("faltam campos (id, nome, provas)");
			materias.push(conteudo);
		} catch (erro) {
			erros.push({ pasta: pasta.name, mensagem: `materia.json: ${(erro as Error).message}` });
		}
	}
	materias.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
	return { materias, erros };
}

/** Grava o materia.json de uma vez (escreve ao lado e renomeia, para não sobrar arquivo pela metade). */
async function gravarMateria(dados: string, materia: Materia): Promise<void> {
	const arquivo = arquivoMateria(dados, materia.id);
	const temporario = `${arquivo}.${process.pid}.tmp`;
	await writeFile(temporario, `${JSON.stringify(materia, null, "\t")}\n`, "utf8");
	await rename(temporario, arquivo);
}

/** Cria a matéria (pasta, materia.json e o evento criou_materia). */
export async function criarMateria(dados: string, entrada: EntradaMateria, contexto: { sessao?: string } = {}): Promise<Materia> {
	const valores = validarEntrada(entrada);
	const { materias } = await listarMaterias(dados);
	const existentes = new Set((await readdir(pastaMaterias(dados))).map((nome) => nome.toLowerCase()));
	for (const materia of materias) existentes.add(materia.id);
	const materia: Materia = { id: idLivre(valores.nome, existentes), ...valores, criadaEm: new Date().toISOString() };
	await mkdir(pastaMateria(dados, materia.id), { recursive: true });
	await gravarMateria(dados, materia);
	await acrescentarEvento(
		eventosMateria(dados, materia.id),
		criarEvento({
			...(contexto.sessao ? { sessao: contexto.sessao } : {}),
			verbo: "criou_materia",
			objeto: { materia: materia.id },
			resultado: { nome: materia.nome, cor: materia.cor, glifo: materia.glifo, provas: materia.provas },
		}),
	);
	return materia;
}

/** O id da matéria de um caminho de material ("materias/calculo-i/materiais/aula.pdf" → "calculo-i"). */
export function materiaDoMaterial(caminho: string): string | undefined {
	const partes = caminho.replace(/\\/g, "/").split("/");
	return partes[0] === "materias" && partes[2] === "materiais" && partes[1] && partes.length > 3 ? partes[1] : undefined;
}

/** O que o serviço de materiais avisa ("materiais:pronto" e "materiais:removido" no barramento da sessão). */
export interface AvisoMaterial {
	caminho: string;
	nome: string;
	tipo?: string;
	trechos?: number;
	custo?: number;
	novo?: boolean;
}

/**
 * Grava no eventos.jsonl da matéria que um material ficou pronto (adicionou ou
 * atualizou) ou foi removido. Caminho fora de uma matéria: nada.
 */
export async function registrarMaterial(
	dados: string,
	aviso: AvisoMaterial,
	removido: boolean,
	contexto: { sessao?: string } = {},
): Promise<string | undefined> {
	const materia = materiaDoMaterial(aviso.caminho);
	if (!materia) return undefined;
	const verbo = removido ? "removeu_material" : aviso.novo === false ? "atualizou_material" : "adicionou_material";
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({
			...(contexto.sessao ? { sessao: contexto.sessao } : {}),
			verbo,
			objeto: { materia, arquivo: aviso.nome },
			...(removido ? {} : { resultado: { tipo: aviso.tipo, trechos: aviso.trechos, custo: aviso.custo } }),
		}),
	);
	return materia;
}

/** Muda nome, cor, ideograma ou provas (o id e a pasta ficam) e grava o evento alterou_materia com o que mudou. */
export async function alterarMateria(
	dados: string,
	id: string,
	mudancas: Partial<EntradaMateria>,
	contexto: { sessao?: string } = {},
): Promise<Materia> {
	const { materias } = await listarMaterias(dados);
	const atual = materias.find((materia) => materia.id === id);
	if (!atual) throw new ErroMaterias(`Não achei a matéria "${id}".`);
	const valores = validarEntrada({ ...atual, ...mudancas, nome: mudancas.nome ?? atual.nome });
	const nova: Materia = { ...atual, ...valores };
	const mudou = (Object.keys(valores) as Array<keyof typeof valores>).filter((campo) => JSON.stringify(atual[campo]) !== JSON.stringify(nova[campo]));
	if (mudou.length === 0) return atual;
	await gravarMateria(dados, nova);
	await acrescentarEvento(
		eventosMateria(dados, id),
		criarEvento({
			...(contexto.sessao ? { sessao: contexto.sessao } : {}),
			verbo: "alterou_materia",
			objeto: { materia: id },
			resultado: Object.fromEntries(mudou.map((campo) => [campo, nova[campo]])),
		}),
	);
	return nova;
}
