// Markdown das respostas: react-markdown com GFM (tabelas, listas de tarefa,
// riscado) e matemática em LaTeX ($...$ e $$...$$, desenhada pelo KaTeX; a
// skill teach do perfil de estudos escreve toda conta assim). O embed de
// imagem do Obsidian (![[nome.png|650]]) mostra a imagem da pasta de dados do
// perfil (remark-embeds.ts e ImagemDoPerfil.tsx). HTML cru no texto não é
// interpretado: aparece como texto. Os estilos vêm do Prose do design system
// (ap-prose), aplicado por quem usa.

import { useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ImagemDoPerfil } from "./ImagemDoPerfil.tsx";
import rehypePalavras from "./rehype-palavras.ts";
import remarkEmbeds from "./remark-embeds.ts";

const pluginsRemark = [remarkGfm, remarkMath, remarkEmbeds];
// throwOnError false: uma fórmula com erro aparece em vermelho, sem derrubar o resto.
type PluginsRehype = NonNullable<Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]>;
const pluginsRehype: PluginsRehype = [[rehypeKatex, { throwOnError: false }]];

/** Intervalo normal entre uma palavra e a seguinte; com fila grande, encurta até o mínimo. */
const PASSO_MS = 35;
const PASSO_MINIMO_MS = 6;
const FILA_MAXIMA_MS = 1200;

/**
 * A fila das palavras: cada palavra nova ganha a hora de aparecer, logo depois
 * da anterior. O atraso de uma palavra é decidido uma vez só (e não muda nas
 * próximas renderizações, para não reiniciar a animação de quem está aparecendo).
 */
function useFilaDePalavras() {
	const fila = useRef<{ atrasos: number[]; proxima: number }>({ atrasos: [], proxima: 0 });
	return (indice: number): number => {
		const { atrasos } = fila.current;
		if (atrasos[indice] !== undefined) return atrasos[indice]!;
		const agora = performance.now();
		const quando = Math.max(agora, fila.current.proxima);
		const atraso = quando - agora;
		const passo = atraso > FILA_MAXIMA_MS ? PASSO_MINIMO_MS : PASSO_MS * (1 - atraso / (FILA_MAXIMA_MS * 1.2));
		fila.current.proxima = quando + Math.max(PASSO_MINIMO_MS, passo);
		atrasos[indice] = atraso;
		return atraso;
	};
}

// Links abrem fora do app (o app roda no Edge em modo app, sem barra de endereço).
const componentes: Components = {
	a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
	img: ({ node, ...props }) => {
		const caminho = node?.properties?.dataEmbed;
		if (typeof caminho !== "string" || !caminho) return <img {...props} />;
		const numero = (valor: unknown) => (valor === undefined ? undefined : Number(valor));
		return <ImagemDoPerfil caminho={caminho} largura={numero(props.width)} altura={numero(props.height)} />;
	},
};

// Em linha (rótulos de opção, enunciados curtos): os parágrafos viram texto solto.
const componentesEmLinha: Components = { ...componentes, p: ({ children }) => <>{children}</> };

/**
 * `emLinha`: sem os parágrafos, para caber num rótulo. `aparecendo`: o texto
 * está chegando (ou chegou nesta janela), e as palavras novas aparecem uma a
 * uma com fade. Fica ligado depois do fim, para as últimas terminarem de aparecer.
 */
export function Markdown({ texto, emLinha = false, aparecendo = false }: { texto: string; emLinha?: boolean; aparecendo?: boolean }) {
	const atrasoDe = useFilaDePalavras();
	// Enquanto a resposta chega: cada palavra num span, e as novas aparecem uma a uma (rehype-palavras.ts).
	const plugins: PluginsRehype = aparecendo ? [...pluginsRehype, [rehypePalavras, { atrasoDe }]] : pluginsRehype;
	return (
		<ReactMarkdown
			remarkPlugins={pluginsRemark}
			rehypePlugins={plugins}
			components={emLinha ? componentesEmLinha : componentes}
		>
			{texto}
		</ReactMarkdown>
	);
}
