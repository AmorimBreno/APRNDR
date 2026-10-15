// Leitura dos arquivos de agente: frontmatter YAML entre linhas "---" e o corpo
// em markdown, que é o prompt do agente. É o formato de profiles/<id>/agents/*.md.
//
// O frontmatter é lido com o parseFrontmatter que o próprio pi exporta (usa a
// biblioteca yaml). Assim o app e o pi leem os arquivos de agente do mesmo
// jeito. Um parser mínimo de "chave: valor" quebraria com comentários (os
// agentes do learn têm linhas "# [estudos-ia] ...") e aspas.

import { readFile } from "node:fs/promises";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

export interface DefinicaoAgente {
	/** Caminho absoluto do arquivo de onde a definição foi lida. */
	arquivo: string;
	nome: string;
	descricao?: string;
	/** Modelo do frontmatter, no formato provedor/modelo. */
	modelo?: string;
	/** Nível de raciocínio do frontmatter (thinking). */
	raciocinio?: string;
	ferramentas: string[];
	skills: string[];
	/** Campos do frontmatter que o núcleo não conhece, como vieram do YAML. */
	extra: Record<string, unknown>;
	/** Corpo do arquivo: o prompt do agente. */
	prompt: string;
}

export class ErroAgente extends Error {
	constructor(
		readonly arquivo: string,
		mensagem: string,
	) {
		super(`Agente ${arquivo}: ${mensagem}`);
		this.name = "ErroAgente";
	}
}

// Lista separada por vírgula ("read, web_search"). Também aceita lista YAML.
const lista = z
	.union([z.string(), z.array(z.string())])
	.transform((valor) =>
		(Array.isArray(valor) ? valor : valor.split(","))
			.map((item) => item.trim())
			.filter((item) => item.length > 0),
	);

const esquemaFrontmatter = z.looseObject({
	name: z.string().min(1),
	description: z.string().optional(),
	model: z.string().min(1).optional(),
	thinking: z.string().min(1).optional(),
	tools: lista.optional(),
	skills: lista.optional(),
});

const camposConhecidos = new Set(["name", "description", "model", "thinking", "tools", "skills"]);

/** Interpreta o texto de um arquivo de agente. `arquivo` só aparece nos erros e no resultado. */
export function interpretarAgente(texto: string, arquivo: string): DefinicaoAgente {
	if (!/^﻿?---/.test(texto)) {
		throw new ErroAgente(arquivo, "frontmatter não encontrado (o arquivo deve começar com uma linha ---)");
	}
	let frontmatter: Record<string, unknown>;
	let corpo: string;
	try {
		({ frontmatter, body: corpo } = parseFrontmatter(texto));
	} catch (erro) {
		throw new ErroAgente(arquivo, `frontmatter com YAML inválido: ${(erro as Error).message}`);
	}

	const resultado = esquemaFrontmatter.safeParse(frontmatter);
	if (!resultado.success) {
		const problemas = resultado.error.issues
			.map((problema) => `campo ${problema.path.join(".") || "(raiz)"}: ${problema.message}`)
			.join("; ");
		throw new ErroAgente(arquivo, problemas);
	}
	const dados = resultado.data;

	const extra: Record<string, unknown> = {};
	for (const [chave, valor] of Object.entries(dados)) {
		if (!camposConhecidos.has(chave)) extra[chave] = valor;
	}

	return {
		arquivo,
		nome: dados.name,
		descricao: dados.description,
		modelo: dados.model,
		raciocinio: dados.thinking,
		ferramentas: dados.tools ?? [],
		skills: dados.skills ?? [],
		extra,
		prompt: corpo.trim(),
	};
}

/** Lê e interpreta um arquivo de agente. */
export async function lerAgente(arquivo: string): Promise<DefinicaoAgente> {
	let texto: string;
	try {
		texto = await readFile(arquivo, "utf8");
	} catch (erro) {
		throw new ErroAgente(arquivo, `não foi possível ler o arquivo: ${(erro as Error).message}`);
	}
	return interpretarAgente(texto, arquivo);
}
