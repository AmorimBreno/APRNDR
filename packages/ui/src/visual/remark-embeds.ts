// Plugin de remark que entende o embed de imagem no formato do Obsidian:
// ![[nome.png]], ![[nome.png|650]] (largura) e ![[nome.png|650x300]] (largura
// e altura). Vira uma imagem com o caminho em data-embed (o url do markdown sai
// codificado no caminho até o HTML), que o Markdown.tsx mostra
// pela rota de imagens do perfil (ImagemDoPerfil). Só nos textos comuns: em
// código e fórmulas o embed fica como está. Sem extensão de imagem
// (![[Outra nota]]), continua texto.

interface No {
	type: string;
	value?: string;
	url?: string;
	alt?: string;
	data?: { hProperties?: Record<string, unknown> };
	children?: No[];
}

const EMBED = /!\[\[([^[\]|\n]+?\.(?:png|jpe?g|webp|svg))(?:\|(\d+)(?:x(\d+))?)?\]\]/gi;

/** As partes de um texto: texto solto e embeds de imagem, na ordem. */
export function dividirEmbeds(texto: string): Array<{ texto: string } | { caminho: string; largura?: number; altura?: number }> {
	const partes: Array<{ texto: string } | { caminho: string; largura?: number; altura?: number }> = [];
	let inicio = 0;
	for (const achado of texto.matchAll(EMBED)) {
		if (achado.index > inicio) partes.push({ texto: texto.slice(inicio, achado.index) });
		const [, caminho, largura, altura] = achado;
		partes.push({ caminho: caminho!.trim(), ...(largura ? { largura: Number(largura) } : {}), ...(altura ? { altura: Number(altura) } : {}) });
		inicio = achado.index + achado[0].length;
	}
	if (inicio < texto.length) partes.push({ texto: texto.slice(inicio) });
	return partes;
}

function percorrer(no: No): void {
	if (!no.children) return;
	const filhos: No[] = [];
	for (const filho of no.children) {
		if (filho.type !== "text" || !filho.value?.includes("![[")) {
			percorrer(filho);
			filhos.push(filho);
			continue;
		}
		for (const parte of dividirEmbeds(filho.value)) {
			if ("texto" in parte) {
				filhos.push({ type: "text", value: parte.texto });
				continue;
			}
			filhos.push({
				type: "image",
				url: parte.caminho,
				alt: parte.caminho,
				data: {
					hProperties: {
						dataEmbed: parte.caminho,
						...(parte.largura ? { width: parte.largura } : {}),
						...(parte.altura ? { height: parte.altura } : {}),
					},
				},
			});
		}
	}
	no.children = filhos;
}

export default function remarkEmbeds() {
	return (arvore: No) => percorrer(arvore);
}
