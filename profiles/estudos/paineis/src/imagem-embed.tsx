// O embed de imagem ![[nome.png]], ![[nome.png|650]] e ![[nome.png|650x300]] no editor das
// notas (o formato do Obsidian, o mesmo da conversa: packages/ui/src/visual/remark-embeds.ts).
// Vem do "Guardar na nota" quando o bloco da resposta é uma imagem do professor (os
// diagramas das visual-tools, que ficam em <dados>/viz). No arquivo continua o mesmo
// texto; na tela é a imagem, pela rota de imagens do perfil (ImagemDoPerfil). Sem
// isto, o [[...]] virava uma menção e o "!" ficava solto.

import { Node } from "@tiptap/core";
import { ImagemDoPerfil } from "@estudos/ui";
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";

/** ![[nome.ext]] ou ![[nome.ext|largura[xaltura]]] no começo do texto, só com extensão de imagem. */
const EMBED = /^!\[\[([^[\]|\n]+?\.(?:png|jpe?g|webp|svg))(?:\|(\d+)(?:x(\d+))?)?\]\]/i;

/** O embed como vai para o arquivo. */
export function textoDoEmbedImagem(caminho: string, largura?: number | null, altura?: number | null): string {
	return `![[${caminho}${largura ? `|${largura}${altura ? `x${altura}` : ""}` : ""}]]`;
}

function VisaoImagem({ node, selected }: ReactNodeViewProps) {
	const caminho = String(node.attrs.caminho);
	const largura = typeof node.attrs.largura === "number" ? node.attrs.largura : undefined;
	const altura = typeof node.attrs.altura === "number" ? node.attrs.altura : undefined;
	return (
		<NodeViewWrapper as="span" className={`imagem-nota${selected ? " imagem-nota--selecionada" : ""}`} data-imagem-embed={caminho} contentEditable={false}>
			<ImagemDoPerfil caminho={caminho} {...(largura ? { largura } : {})} {...(altura ? { altura } : {})} />
		</NodeViewWrapper>
	);
}

/** O nó sem a aparência da tela (os testes de formato usam este). */
export const ImagemEmbed = Node.create({
	name: "imagemEmbed",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			caminho: { default: "", parseHTML: (elemento) => elemento.getAttribute("data-imagem-embed") ?? "" },
			largura: { default: null, parseHTML: (elemento) => Number(elemento.getAttribute("data-largura")) || null },
			altura: { default: null, parseHTML: (elemento) => Number(elemento.getAttribute("data-altura")) || null },
		};
	},

	parseHTML() {
		return [{ tag: "span[data-imagem-embed]" }];
	},

	renderHTML({ node }) {
		const { caminho, largura, altura } = node.attrs as { caminho: string; largura: number | null; altura: number | null };
		return ["span", { "data-imagem-embed": caminho, ...(largura ? { "data-largura": String(largura) } : {}), ...(altura ? { "data-altura": String(altura) } : {}), class: "imagem-nota" }, textoDoEmbedImagem(caminho, largura, altura)];
	},

	renderText({ node }) {
		return textoDoEmbedImagem(String(node.attrs.caminho), node.attrs.largura as number | null, node.attrs.altura as number | null);
	},

	markdownTokenizer: {
		name: "imagemEmbed",
		level: "inline",
		start: (texto) => texto.indexOf("![["),
		tokenize: (texto) => {
			const achado = EMBED.exec(texto);
			if (!achado) return undefined;
			return { type: "imagemEmbed", raw: achado[0], caminho: achado[1]!.trim(), largura: achado[2] ? Number(achado[2]) : null, altura: achado[3] ? Number(achado[3]) : null };
		},
	},

	parseMarkdown: (token) => ({ type: "imagemEmbed", attrs: { caminho: token.caminho as string, largura: (token.largura as number | null) ?? null, altura: (token.altura as number | null) ?? null } }),

	renderMarkdown: (node) => textoDoEmbedImagem(String(node.attrs?.caminho ?? ""), node.attrs?.largura as number | null, node.attrs?.altura as number | null),
});

/** O nó com a imagem de verdade na tela (o EditorNota). */
export const ImagemEmbedNaTela = ImagemEmbed.extend({
	addNodeView() {
		return ReactNodeViewRenderer(VisaoImagem, { as: "span" });
	},
});
