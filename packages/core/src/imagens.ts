// Imagens da pasta de dados que a interface mostra (um diagrama citado numa
// resposta, por exemplo). Genérico: o núcleo não sabe quem gravou a imagem,
// só onde procurar. Um caminho com pasta ("viz/a.png") é o arquivo exato; um
// nome solto ("a.png", como no embed ![[a.png]]) é procurado nas pastas de
// imagens do perfil, em ordem. Nada sai da pasta de dados: sem .., sem
// partes que começam com ponto (.sessoes-pi, .extraido) e sem atalhos para fora.

import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";

/** Tipo de cada extensão de imagem que a interface pode mostrar. */
export const TIPOS_IMAGEM: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".svg": "image/svg+xml",
};

/** O caminho pedido não é aceito (diferente de "não existe"). */
export class ErroCaminhoImagem extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroCaminhoImagem";
	}
}

export interface ImagemAchada {
	/** Caminho absoluto do arquivo. */
	arquivo: string;
	/** Tipo (content-type) pela extensão. */
	tipo: string;
	tamanho: number;
	modificadoEm: number;
}

/** Confere o caminho pedido e devolve as partes dele. Lança ErroCaminhoImagem. */
export function conferirCaminhoImagem(caminho: string): string[] {
	if (!caminho) throw new ErroCaminhoImagem("Falta o nome da imagem.");
	if (caminho.includes("\\") || caminho.includes(":") || isAbsolute(caminho)) {
		throw new ErroCaminhoImagem("Use um caminho relativo à pasta de dados, com barras normais.");
	}
	const partes = caminho.split("/");
	if (partes.some((parte) => parte === "" || parte.startsWith("."))) {
		throw new ErroCaminhoImagem("O caminho não pode ter partes vazias, .. nem pastas que começam com ponto.");
	}
	if (!TIPOS_IMAGEM[extname(caminho).toLowerCase()]) {
		throw new ErroCaminhoImagem("Só imagens png, jpg, webp ou svg.");
	}
	return partes;
}

async function dentroDaPasta(base: string, arquivo: string): Promise<boolean> {
	try {
		const resto = relative(await realpath(base), await realpath(arquivo));
		return resto !== "" && !resto.startsWith("..") && !isAbsolute(resto);
	} catch {
		return false;
	}
}

/**
 * Acha a imagem `caminho` na `pastaDados`. Nome solto: procura em cada uma das
 * `pastas` (relativas à pasta de dados, com barras normais). Devolve undefined
 * se não achar; lança ErroCaminhoImagem se o caminho não for aceito.
 */
export async function acharImagem(pastaDados: string, pastas: readonly string[], caminho: string): Promise<ImagemAchada | undefined> {
	const partes = conferirCaminhoImagem(caminho);
	const candidatos = partes.length > 1 ? [join(pastaDados, ...partes)] : pastas.map((pasta) => join(pastaDados, ...pasta.split("/"), partes[0]!));
	for (const arquivo of candidatos) {
		const info = await stat(arquivo).catch(() => undefined);
		if (!info?.isFile() || !(await dentroDaPasta(pastaDados, arquivo))) continue;
		return { arquivo, tipo: TIPOS_IMAGEM[extname(arquivo).toLowerCase()]!, tamanho: info.size, modificadoEm: info.mtimeMs };
	}
	return undefined;
}
