// Markdown das respostas: react-markdown com GFM (tabelas, listas de tarefa,
// riscado) e matemática em LaTeX ($...$ e $$...$$, desenhada pelo KaTeX; a
// skill teach do perfil de estudos escreve toda conta assim). HTML cru no
// texto não é interpretado: aparece como texto. Os estilos vêm do Prose do
// design system (ap-prose), aplicado por quem usa.

import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const pluginsRemark = [remarkGfm, remarkMath];
// throwOnError false: uma fórmula com erro aparece em vermelho, sem derrubar o resto.
const pluginsRehype: NonNullable<Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]> = [[rehypeKatex, { throwOnError: false }]];

// Links abrem fora do app (o app roda no Edge em modo app, sem barra de endereço).
const componentes: Components = {
	a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

export function Markdown({ texto }: { texto: string }) {
	return (
		<ReactMarkdown remarkPlugins={pluginsRemark} rehypePlugins={pluginsRehype} components={componentes}>
			{texto}
		</ReactMarkdown>
	);
}
