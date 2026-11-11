// Plugin de rehype das ações por bloco (Markdown.tsx, `acoesDoBloco`): embrulha cada
// bloco de PRIMEIRO NÍVEL do markdown (parágrafo, lista, tabela, bloco de código e
// fórmula em bloco, citação) num <div> marcado com o índice do bloco e as posições
// dele no texto original (position.start.offset e end.offset do nó). O Markdown troca
// esse div pelo bloco mais o espaço das ações.
//
// Por que um plugin e não os `components`: só aqui se sabe que o nó é filho direto da
// raiz (um parágrafo dentro de uma lista ou de uma citação não é de primeiro nível) e as
// posições ainda estão no nó. Ele roda ANTES do rehype-katex (que troca a fórmula em
// bloco por HTML sem posição) e só é ligado quando há ações: sem elas, o HTML da
// resposta é o de sempre.
//
// As extensões do micromark (remark-dinheiro, remark-math, GFM) não mudam as posições
// dos blocos, que são offsets de caracteres sobre o texto que entrou no react-markdown.

interface No {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: No[];
	position?: { start?: { offset?: number }; end?: { offset?: number } };
}

/** Os blocos de primeiro nível que ganham ações. Títulos e linhas horizontais ficam de fora. */
const TAGS_DE_BLOCO = new Set(["p", "ul", "ol", "table", "pre", "blockquote"]);

/** Onde o bloco está no texto original. */
export interface PosicaoDoBloco {
	indice: number;
	inicio: number;
	fim: number;
}

/** As propriedades que o div de um bloco leva (o `data-` vira atributo; o Markdown as lê do nó e não as repassa). */
export const PROPRIEDADE_BLOCO_INDICE = "dataBlocoIndice";
export const PROPRIEDADE_BLOCO_INICIO = "dataBlocoInicio";
export const PROPRIEDADE_BLOCO_FIM = "dataBlocoFim";

/** A posição guardada num div de bloco, ou undefined se o nó não é um. */
export function posicaoDoBloco(propriedades: Record<string, unknown> | undefined): PosicaoDoBloco | undefined {
	const indice = propriedades?.[PROPRIEDADE_BLOCO_INDICE];
	const inicio = propriedades?.[PROPRIEDADE_BLOCO_INICIO];
	const fim = propriedades?.[PROPRIEDADE_BLOCO_FIM];
	if (typeof indice !== "number" || typeof inicio !== "number" || typeof fim !== "number") return undefined;
	return { indice, inicio, fim };
}

/** O markdown original do bloco: o texto fatiado pelas posições do nó. */
export function fonteDoBloco(texto: string, posicao: Pick<PosicaoDoBloco, "inicio" | "fim">): string {
	return texto.slice(posicao.inicio, posicao.fim);
}

export default function rehypeBlocos() {
	return (arvore: No) => {
		let indice = 0;
		arvore.children = (arvore.children ?? []).map((filho) => {
			if (filho.type !== "element" || !filho.tagName || !TAGS_DE_BLOCO.has(filho.tagName)) return filho;
			const inicio = filho.position?.start?.offset;
			const fim = filho.position?.end?.offset;
			// Sem posição não há fonte para guardar: o bloco fica sem ações.
			if (typeof inicio !== "number" || typeof fim !== "number" || fim <= inicio) return filho;
			const embrulho: No = {
				type: "element",
				tagName: "div",
				properties: { [PROPRIEDADE_BLOCO_INDICE]: indice, [PROPRIEDADE_BLOCO_INICIO]: inicio, [PROPRIEDADE_BLOCO_FIM]: fim },
				children: [filho],
			};
			indice += 1;
			return embrulho;
		});
	};
}
