// Perfis: cada subpasta de profiles/ com um profile.json é um perfil.
// O esquema é genérico: o núcleo não sabe o que o perfil faz, só onde estão
// os dados, as instruções, os agentes, as skills, as extensões e os painéis.

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { lerAgente, type DefinicaoAgente } from "./agentes.ts";

const caminhoRelativo = z
	.string()
	.min(1)
	.refine((valor) => !isAbsolute(valor), "deve ser um caminho relativo à pasta do perfil");

export const esquemaAgenteDoPerfil = z.strictObject({
	/** Arquivo de definição do agente, relativo à pasta do perfil. */
	arquivo: caminhoRelativo,
	/** Papel livre do agente no perfil (por exemplo, geral, pesquisa, desenho). */
	papel: z.string().min(1),
	/** true = aparece no seletor de agente do chat. */
	selecionavel: z.boolean(),
	/** Sobrescreve o modelo do frontmatter do agente. */
	modelo: z.string().min(1).optional(),
});

export const esquemaPerfil = z.strictObject({
	id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use só letras minúsculas, números e hífen"),
	nome: z.string().min(1),
	/** Pasta de dados do perfil, fora do repositório. */
	pastaDados: z
		.string()
		.min(1)
		.refine((valor) => isAbsolute(valor), "deve ser um caminho absoluto"),
	/** Arquivo de instruções do agente (o AGENTS.md do perfil), relativo ao perfil. */
	instrucoes: caminhoRelativo,
	agentes: z.array(esquemaAgenteDoPerfil).min(1),
	/** Nome do agente que abre por padrão. */
	agentePadrao: z.string().min(1),
	skills: z.array(caminhoRelativo),
	extensoes: z.array(caminhoRelativo),
	/** Extensões carregadas só nas sessões filhas (subagentes), além das globais e das do perfil. */
	extensoesSubagentes: z.array(caminhoRelativo).optional(),
	/** Identificadores dos painéis que a janela do perfil usa. */
	paineis: z.array(z.string().min(1)),
});

export type ProfileJson = z.infer<typeof esquemaPerfil>;

export interface AgenteDoPerfil {
	/** Nome do agente, vindo do frontmatter. */
	nome: string;
	papel: string;
	selecionavel: boolean;
	/** Modelo efetivo: o do profile.json, se houver, senão o do frontmatter. */
	modelo?: string;
	definicao: DefinicaoAgente;
}

export interface Perfil {
	id: string;
	nome: string;
	/** Pasta do perfil (absoluta). */
	pasta: string;
	pastaDados: string;
	/** Caminho absoluto do arquivo de instruções. */
	instrucoes: string;
	agentes: AgenteDoPerfil[];
	agentePadrao: string;
	/** Caminhos absolutos. */
	skills: string[];
	/** Caminhos absolutos. */
	extensoes: string[];
	/** Caminhos absolutos; só nas sessões filhas (subagentes). Vazio se o profile.json não declarar. */
	extensoesSubagentes: string[];
	paineis: string[];
}

export class ErroPerfil extends Error {
	constructor(
		readonly arquivo: string,
		mensagem: string,
	) {
		super(`Perfil ${arquivo}: ${mensagem}`);
		this.name = "ErroPerfil";
	}
}

function descreverCampo(caminho: PropertyKey[]): string {
	let texto = "";
	for (const parte of caminho) {
		texto += typeof parte === "number" ? `[${parte}]` : `${texto ? "." : ""}${String(parte)}`;
	}
	return texto || "(raiz)";
}

async function existe(caminho: string): Promise<boolean> {
	try {
		await stat(caminho);
		return true;
	} catch {
		return false;
	}
}

/** Valida o conteúdo de um profile.json. `arquivo` só aparece nos erros. */
export function validarProfileJson(dados: unknown, arquivo: string): ProfileJson {
	const resultado = esquemaPerfil.safeParse(dados);
	if (!resultado.success) {
		const problemas = resultado.error.issues
			.map((problema) => `campo ${descreverCampo(problema.path)}: ${problema.message}`)
			.join("; ");
		throw new ErroPerfil(arquivo, problemas);
	}
	return resultado.data;
}

/** Lê, valida e resolve um perfil a partir da pasta dele. */
export async function lerPerfil(pasta: string): Promise<Perfil> {
	const pastaAbsoluta = resolve(pasta);
	const arquivo = join(pastaAbsoluta, "profile.json");

	let bruto: unknown;
	try {
		bruto = JSON.parse(await readFile(arquivo, "utf8"));
	} catch (erro) {
		throw new ErroPerfil(arquivo, `não foi possível ler o JSON: ${(erro as Error).message}`);
	}
	const json = validarProfileJson(bruto, arquivo);

	const erroDeCampo = (campo: string, mensagem: string) => new ErroPerfil(arquivo, `campo ${campo}: ${mensagem}`);
	const resolverExistente = async (campo: string, relativo: string) => {
		const absoluto = resolve(pastaAbsoluta, relativo);
		if (!(await existe(absoluto))) throw erroDeCampo(campo, `${relativo} não existe`);
		return absoluto;
	};

	const instrucoes = await resolverExistente("instrucoes", json.instrucoes);

	const agentes: AgenteDoPerfil[] = [];
	for (const [indice, agente] of json.agentes.entries()) {
		const campo = `agentes[${indice}].arquivo`;
		const caminhoAgente = await resolverExistente(campo, agente.arquivo);
		let definicao: DefinicaoAgente;
		try {
			definicao = await lerAgente(caminhoAgente);
		} catch (erro) {
			throw erroDeCampo(campo, (erro as Error).message);
		}
		if (agentes.some((outro) => outro.nome === definicao.nome)) {
			throw erroDeCampo(campo, `agente ${definicao.nome} repetido`);
		}
		agentes.push({
			nome: definicao.nome,
			papel: agente.papel,
			selecionavel: agente.selecionavel,
			modelo: agente.modelo ?? definicao.modelo,
			definicao,
		});
	}

	if (!agentes.some((agente) => agente.nome === json.agentePadrao)) {
		throw erroDeCampo("agentePadrao", `nenhum agente se chama ${json.agentePadrao}`);
	}

	const skills: string[] = [];
	for (const [indice, skill] of json.skills.entries()) {
		skills.push(await resolverExistente(`skills[${indice}]`, skill));
	}
	const extensoes: string[] = [];
	for (const [indice, extensao] of json.extensoes.entries()) {
		extensoes.push(await resolverExistente(`extensoes[${indice}]`, extensao));
	}
	const extensoesSubagentes: string[] = [];
	for (const [indice, extensao] of (json.extensoesSubagentes ?? []).entries()) {
		extensoesSubagentes.push(await resolverExistente(`extensoesSubagentes[${indice}]`, extensao));
	}

	return {
		id: json.id,
		nome: json.nome,
		pasta: pastaAbsoluta,
		pastaDados: json.pastaDados,
		instrucoes,
		agentes,
		agentePadrao: json.agentePadrao,
		skills,
		extensoes,
		extensoesSubagentes,
		paineis: json.paineis,
	};
}

/** Um perfil que não pôde ser lido, com a mensagem do ErroPerfil. */
export interface PerfilInvalido {
	/** Pasta do perfil (absoluta). */
	pasta: string;
	arquivo: string;
	mensagem: string;
}

/**
 * Como lerPerfis, mas um perfil inválido não interrompe a leitura: ele vai
 * para `erros` e os outros continuam valendo. É o que o servidor usa, para um
 * perfil quebrado não esconder os demais.
 */
export async function lerPerfisComErros(pastaPerfis: string): Promise<{ perfis: Perfil[]; erros: PerfilInvalido[] }> {
	const raiz = resolve(pastaPerfis);
	const itens = await readdir(raiz, { withFileTypes: true });
	const pastas = itens
		.filter((item) => item.isDirectory())
		.map((item) => join(raiz, item.name))
		.sort();

	const perfis: Perfil[] = [];
	const erros: PerfilInvalido[] = [];
	for (const pasta of pastas) {
		const arquivo = join(pasta, "profile.json");
		if (!(await existe(arquivo))) continue;
		try {
			const perfil = await lerPerfil(pasta);
			const repetido = perfis.find((outro) => outro.id === perfil.id);
			if (repetido) {
				throw new ErroPerfil(arquivo, `campo id: ${perfil.id} já é usado pelo perfil da pasta ${basename(repetido.pasta)}`);
			}
			perfis.push(perfil);
		} catch (erro) {
			erros.push({ pasta, arquivo, mensagem: erro instanceof Error ? erro.message : String(erro) });
		}
	}
	return { perfis, erros };
}

/**
 * Lê todas as subpastas de `pastaPerfis` que têm profile.json, em ordem
 * alfabética. Um perfil inválido gera ErroPerfil dizendo o arquivo e o campo.
 */
export async function lerPerfis(pastaPerfis: string): Promise<Perfil[]> {
	const raiz = resolve(pastaPerfis);
	const itens = await readdir(raiz, { withFileTypes: true });
	const pastas = itens
		.filter((item) => item.isDirectory())
		.map((item) => join(raiz, item.name))
		.sort();

	const perfis: Perfil[] = [];
	for (const pasta of pastas) {
		if (!(await existe(join(pasta, "profile.json")))) continue;
		const perfil = await lerPerfil(pasta);
		const repetido = perfis.find((outro) => outro.id === perfil.id);
		if (repetido) {
			throw new ErroPerfil(
				join(pasta, "profile.json"),
				`campo id: ${perfil.id} já é usado pelo perfil da pasta ${basename(repetido.pasta)}`,
			);
		}
		perfis.push(perfil);
	}
	return perfis;
}
