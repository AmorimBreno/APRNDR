// Escolhe o extrator pela extensão do arquivo e calcula o hash (para não
// processar de novo um arquivo que não mudou).

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { extrairNotebook } from "./notebook.ts";
import { extrairPdf } from "./pdf.ts";
import { extrairPython } from "./python.ts";
import { extrairTexto } from "./texto.ts";
import type { Extracao, OpcoesExtracao, TipoMaterial } from "./tipos.ts";

export const EXTENSOES: Readonly<Record<string, TipoMaterial>> = {
	".pdf": "pdf",
	".py": "python",
	".ipynb": "notebook",
	".md": "texto",
	".markdown": "texto",
	".txt": "texto",
};

export function tipoDoArquivo(caminho: string): TipoMaterial | undefined {
	return EXTENSOES[extname(caminho).toLowerCase()];
}

export class ErroFormato extends Error {
	constructor(caminho: string) {
		super(`${basename(caminho)}: formato ainda não suportado (os suportados são ${Object.keys(EXTENSOES).join(", ")}).`);
		this.name = "ErroFormato";
	}
}

export function hashDe(dados: Uint8Array): string {
	return createHash("sha256").update(dados).digest("hex");
}

/** Extrai o arquivo pelo tipo dele. `dados` = o conteúdo já lido (o mesmo do hash). */
export async function extrairArquivo(caminho: string, opcoes: OpcoesExtracao = {}, dados?: Uint8Array): Promise<Extracao> {
	const tipo = tipoDoArquivo(caminho);
	if (!tipo) throw new ErroFormato(caminho);
	const conteudo = dados ?? (await readFile(caminho));
	const nome = basename(caminho);
	switch (tipo) {
		case "pdf":
			return extrairPdf(conteudo, nome, opcoes);
		case "python":
			return extrairPython(caminho, new TextDecoder().decode(conteudo));
		case "notebook":
			return extrairNotebook(new TextDecoder().decode(conteudo), nome, opcoes);
		case "texto":
			return extrairTexto(new TextDecoder().decode(conteudo), extname(caminho).toLowerCase() !== ".txt");
	}
}
