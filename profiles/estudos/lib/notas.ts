// Notas pessoais do caderno (ESPECIFICACAO 8.1, item 4.3, parte B): cada nota é
// materias/<id>/notas/<Título>.md, em markdown, e o título é o nome do
// arquivo. Só o Breno escreve nelas (o professor só lê). Criar, renomear e
// editar gravam eventos no eventos.jsonl da matéria (eventos.ts).
//
// Salvar leva a versão (hash) que a tela abriu: se o arquivo mudou fora do app
// (no Explorador, no Drive), nada é sobrescrito e vem um ErroConflito. A
// gravação é inteira de uma vez (ao lado e renomeia), para o Drive nunca
// sincronizar uma nota pela metade. Sem dependências: o pi carrega a extensão
// desta pasta.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acrescentarEvento, criarEvento } from "./eventos.ts";
import { ErroMaterias, arquivoMateria, eventosMateria, pastaMateria } from "./materias.ts";
import { conferirTitulo, type ListaNotas, type NotaAberta, previaDaNota, type ResumoNota } from "./nota-tipos.ts";

export { conferirTitulo, type ListaNotas, type NotaAberta, pastaNotasRelativa, previaDaNota, type ResumoNota, temHtmlDesconhecido } from "./nota-tipos.ts";

export const pastaNotas = (dados: string, id: string) => join(pastaMateria(dados, id), "notas");
export const arquivoNota = (dados: string, id: string, titulo: string) => join(pastaNotas(dados, id), `${titulo}.md`);

/** O arquivo mudou (ou sumiu) desde a versão que a tela abriu. */
export class ErroConflito extends Error {
	constructor(
		/** A versão do arquivo agora; undefined se ele foi apagado. */
		readonly versaoAtual: string | undefined,
	) {
		super(versaoAtual ? "A nota mudou fora do app depois que você a abriu." : "A nota foi apagada ou renomeada fora do app depois que você a abriu.");
		this.name = "ErroConflito";
	}
}

/** O hash do conteúdo (os bytes em UTF-8), curto. */
export const versaoDe = (conteudo: string) => createHash("sha256").update(conteudo, "utf8").digest("hex").slice(0, 16);

function tituloValido(bruto: string): string {
	const conferido = conferirTitulo(bruto);
	if ("erro" in conferido) throw new ErroMaterias(conferido.erro);
	return conferido.titulo;
}

/** A matéria precisa existir (o materia.json), para nunca criar notas numa pasta solta. */
async function garantirMateria(dados: string, id: string): Promise<void> {
	if (!/^[a-z0-9-]+$/.test(id)) throw new ErroMaterias(`Não achei a matéria "${id}".`);
	try {
		await stat(arquivoMateria(dados, id));
	} catch {
		throw new ErroMaterias(`Não achei a matéria "${id}".`);
	}
}

/** Os títulos das notas da matéria (nomes .md da pasta notas/, sem os escondidos). Sem a pasta, nenhum. */
async function titulosNaPasta(dados: string, id: string): Promise<string[]> {
	try {
		const nomes = await readdir(pastaNotas(dados, id), { withFileTypes: true });
		return nomes.filter((nome) => nome.isFile() && nome.name.toLowerCase().endsWith(".md") && !nome.name.startsWith(".")).map((nome) => nome.name.slice(0, -3));
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw erro;
	}
}

/** O título como está no disco, sem diferença de maiúsculas (o Windows não diferencia). */
async function tituloNoDisco(dados: string, id: string, titulo: string): Promise<string | undefined> {
	const procurado = titulo.toLowerCase();
	return (await titulosNaPasta(dados, id)).find((existente) => existente.toLowerCase() === procurado);
}

/** As notas da matéria, da mexida mais recente para a mais antiga. */
export async function listarNotas(dados: string, id: string): Promise<ListaNotas> {
	await garantirMateria(dados, id);
	const notas: ResumoNota[] = [];
	for (const titulo of await titulosNaPasta(dados, id)) {
		const arquivo = arquivoNota(dados, id, titulo);
		try {
			const [info, conteudo] = await Promise.all([stat(arquivo), readFile(arquivo, "utf8")]);
			notas.push({ titulo, modificadaEm: info.mtime.toISOString(), tamanho: info.size, previa: previaDaNota(conteudo) });
		} catch {
			// Sumiu entre a lista e a leitura (o Drive sincronizando): fica de fora desta vez.
		}
	}
	notas.sort((a, b) => b.modificadaEm.localeCompare(a.modificadaEm) || a.titulo.localeCompare(b.titulo, "pt-BR"));
	return { materia: id, notas };
}

/** Abre a nota: o conteúdo e a versão. */
export async function lerNota(dados: string, id: string, bruto: string): Promise<NotaAberta> {
	await garantirMateria(dados, id);
	const titulo = await tituloNoDisco(dados, id, tituloValido(bruto));
	if (!titulo) throw new ErroMaterias(`Não achei a nota "${bruto.trim()}".`);
	const arquivo = arquivoNota(dados, id, titulo);
	const [conteudo, info] = await Promise.all([readFile(arquivo, "utf8"), stat(arquivo)]);
	return { materia: id, titulo, conteudo, versao: versaoDe(conteudo), modificadaEm: info.mtime.toISOString() };
}

/** Grava o arquivo de uma vez: escreve ao lado (escondido, fora da lista) e renomeia por cima. */
async function gravarArquivo(arquivo: string, conteudo: string): Promise<void> {
	const pasta = join(arquivo, "..");
	const temporario = join(pasta, `.${process.pid}-${Date.now().toString(36)}.tmp`);
	await writeFile(temporario, conteudo, "utf8");
	await rename(temporario, arquivo);
}

/** Cria a nota vazia (e a pasta notas/, se faltar) e grava criou_nota. */
export async function criarNota(dados: string, id: string, bruto: string, contexto: { sessao?: string } = {}): Promise<NotaAberta> {
	await garantirMateria(dados, id);
	const titulo = tituloValido(bruto);
	if (await tituloNoDisco(dados, id, titulo)) throw new ErroMaterias(`Já existe uma nota "${titulo}" neste caderno.`);
	await mkdir(pastaNotas(dados, id), { recursive: true });
	const arquivo = arquivoNota(dados, id, titulo);
	// wx: se o arquivo apareceu entre a conferência e agora, falha em vez de apagar.
	await writeFile(arquivo, "", { encoding: "utf8", flag: "wx" });
	await acrescentarEvento(
		eventosMateria(dados, id),
		criarEvento({ ...(contexto.sessao ? { sessao: contexto.sessao } : {}), verbo: "criou_nota", objeto: { materia: id, nota: titulo } }),
	);
	const info = await stat(arquivo);
	return { materia: id, titulo, conteudo: "", versao: versaoDe(""), modificadaEm: info.mtime.toISOString() };
}

export interface OpcoesSalvar {
	/** A versão que a tela abriu. Sem ela (e sem forcar), salva só se o arquivo não existe. */
	versao?: string;
	/** Grava por cima mesmo que o arquivo tenha mudado ("Manter a minha"). */
	forcar?: boolean;
	/** Grava o evento editou_nota (a extensão manda só no primeiro salvamento de cada abertura). */
	registrarEdicao?: boolean;
	sessao?: string;
}

/**
 * Salva o conteúdo da nota. O arquivo termina com uma quebra de linha. Se a
 * versão do arquivo não é a que a tela abriu, lança ErroConflito e não grava.
 */
export async function salvarNota(dados: string, id: string, bruto: string, conteudo: string, opcoes: OpcoesSalvar = {}): Promise<{ versao: string; modificadaEm: string }> {
	await garantirMateria(dados, id);
	const pedido = tituloValido(bruto);
	const noDisco = await tituloNoDisco(dados, id, pedido);
	const titulo = noDisco ?? pedido;
	const arquivo = arquivoNota(dados, id, titulo);
	if (!opcoes.forcar) {
		let atual: string | undefined;
		try {
			atual = noDisco ? versaoDe(await readFile(arquivo, "utf8")) : undefined;
		} catch (erro) {
			if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
		}
		if (atual !== opcoes.versao) throw new ErroConflito(atual);
	}
	const texto = conteudo === "" || conteudo.endsWith("\n") ? conteudo : `${conteudo}\n`;
	await mkdir(pastaNotas(dados, id), { recursive: true });
	await gravarArquivo(arquivo, texto);
	if (opcoes.registrarEdicao) {
		await acrescentarEvento(
			eventosMateria(dados, id),
			criarEvento({ ...(opcoes.sessao ? { sessao: opcoes.sessao } : {}), verbo: "editou_nota", objeto: { materia: id, nota: titulo } }),
		);
	}
	const info = await stat(arquivo);
	return { versao: versaoDe(texto), modificadaEm: info.mtime.toISOString() };
}

/**
 * Renomeia a nota (o arquivo) e grava renomeou_nota com o título antigo e o
 * novo. Só mudar maiúsculas também vale (passa por um nome temporário, porque
 * o Windows acha que é o mesmo arquivo). As menções [[Título]] em outras notas
 * ficam como estão (a parte C cuida delas).
 */
export async function renomearNota(dados: string, id: string, deBruto: string, paraBruto: string, contexto: { sessao?: string } = {}): Promise<{ titulo: string }> {
	await garantirMateria(dados, id);
	const de = await tituloNoDisco(dados, id, tituloValido(deBruto));
	if (!de) throw new ErroMaterias(`Não achei a nota "${deBruto.trim()}".`);
	const para = tituloValido(paraBruto);
	if (para === de) return { titulo: de };
	const ocupado = await tituloNoDisco(dados, id, para);
	if (ocupado && ocupado !== de) throw new ErroMaterias(`Já existe uma nota "${ocupado}" neste caderno.`);
	const origem = arquivoNota(dados, id, de);
	const destino = arquivoNota(dados, id, para);
	if (ocupado === de) {
		const meio = join(pastaNotas(dados, id), `.${process.pid}-${Date.now().toString(36)}.renomeando`);
		await rename(origem, meio);
		await rename(meio, destino);
	} else {
		await rename(origem, destino);
	}
	await acrescentarEvento(
		eventosMateria(dados, id),
		criarEvento({
			...(contexto.sessao ? { sessao: contexto.sessao } : {}),
			verbo: "renomeou_nota",
			objeto: { materia: id, nota: para },
			resultado: { de, para },
		}),
	);
	return { titulo: para };
}
