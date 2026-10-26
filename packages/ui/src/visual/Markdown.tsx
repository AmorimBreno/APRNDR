// Markdown das respostas: react-markdown com GFM (tabelas, listas de tarefa,
// riscado) e matemática em LaTeX ($...$ e $$...$$, desenhada pelo KaTeX; a
// skill teach do perfil de estudos escreve toda conta assim). O $ de dinheiro
// não abre fórmula: o $ logo depois de uma letra (R$ 20, US$ 0,03, R$20) e o $
// seguido de espaço ("$ 5"; e, como no pandoc, "$ x $" fica texto) são texto
// comum (remark-dinheiro.ts, uma extensão do micromark tentada antes da do
// remark-math; código e o $$ em bloco não passam por ela). O embed de
// imagem do Obsidian (![[nome.png|650]]) mostra a imagem da pasta de dados do
// perfil (remark-embeds.ts e ImagemDoPerfil.tsx). HTML cru no texto não é
// interpretado: aparece como texto. Os estilos vêm do Prose do design system
// (ap-prose), aplicado por quem usa, e do estilo.css do pacote.
//
// Código: o bloco ```linguagem``` aparece numa caixa escura de editor, com
// destaque de sintaxe (rehype-highlight, só as LINGUAGENS abaixo), os números
// de linha à esquerda (rehype-codigo.ts) e uma barra com o nome da linguagem;
// sem linguagem, a mesma caixa sem destaque e sem barra. O código em linha
// (`len(x)`) ganha a classe codigo-em-linha. As cores ficam nas variáveis
// --codigo-* do estilo.css.
//
// Vetores e matrizes: um bloco ```vetor``` ou ```matriz``` com uma lista no
// estilo Python/JSON ("[6, 3, 8, 12, 11]", "['a', 'b']", "[[1, 2], [3, 4]]";
// números, strings com aspas simples ou duplas, true/false/None) é desenhado
// como estrutura: o vetor, uma fileira de caixas com o índice embaixo; a
// matriz, uma grade com os índices das linhas à esquerda e das colunas em cima
// (Estrutura.tsx). Uma primeira linha "# rótulo" vira a legenda acima. Se o
// conteúdo não for uma lista assim (ou a matriz tiver linhas de tamanhos
// diferentes), o bloco aparece como código comum (ler-estrutura.ts).

import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { DesenhoDaEstrutura } from "./Estrutura.tsx";
import { ImagemDoPerfil } from "./ImagemDoPerfil.tsx";
import { lerEstrutura } from "./ler-estrutura.ts";
import rehypeCodigo, { CLASSE_LINHA } from "./rehype-codigo.ts";
import rehypePalavras from "./rehype-palavras.ts";
import remarkDinheiro from "./remark-dinheiro.ts";
import remarkEmbeds from "./remark-embeds.ts";

/** As linguagens com destaque (os apelidos de cada uma, como py, js, ts, sh, também valem). */
export const LINGUAGENS = { python, javascript, typescript, sql, bash, json, r, java, c, cpp, plaintext };
/** Blocos que viram desenho: o rehype-highlight não mexe neles. */
const ESTRUTURAS = ["vetor", "matriz"] as const;

// remarkDinheiro depois do remarkMath: a extensão dele, com add "before", entra na frente da do remark-math (o micromark põe cada extensão "before" antes das já registradas).
const pluginsRemark = [remarkGfm, remarkMath, remarkDinheiro, remarkEmbeds];
// throwOnError false: uma fórmula com erro aparece em vermelho, sem derrubar o resto.
type PluginsRehype = NonNullable<Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]>;
const pluginsRehype: PluginsRehype = [
	[rehypeKatex, { throwOnError: false }],
	[rehypeHighlight, { languages: LINGUAGENS, plainText: [...ESTRUTURAS] }],
	rehypeCodigo,
];

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

interface NoHast {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: NoHast[];
}

const textoDe = (no: NoHast): string => (no.type === "text" ? (no.value ?? "") : (no.children ?? []).map(textoDe).join(""));

function linguagemDe(codigo: NoHast | undefined): string | undefined {
	const classes = codigo?.properties?.className;
	const lista = Array.isArray(classes) ? classes.map(String) : [];
	return lista.find((classe) => classe.startsWith("language-"))?.slice("language-".length);
}

/**
 * Um bloco de código (o `pre` do Markdown): a caixa de editor com a barra da
 * linguagem e os números de linha, ou o desenho do vetor ou da matriz.
 */
function BlocoDeCodigo({ no, emLinha, children }: { no: NoHast | undefined; emLinha: boolean; children: ReactNode }) {
	const codigo = no?.children?.find((filho) => filho.type === "element" && filho.tagName === "code");
	const linguagem = linguagemDe(codigo);
	if (codigo && (linguagem === "vetor" || linguagem === "matriz")) {
		const estrutura = lerEstrutura(linguagem, textoDe(codigo));
		if (estrutura) return <DesenhoDaEstrutura estrutura={estrutura} emLinha={emLinha} />;
	}
	const Caixa = emLinha ? "span" : "div";
	const linhas = codigo?.children?.filter((filho) => filho.type === "element" && (filho.properties?.className as unknown[] | undefined)?.includes(CLASSE_LINHA)).length ?? 1;
	// --digitos: a largura da coluna dos números de linha, em caracteres.
	const estilo = { "--digitos": String(Math.max(1, linhas)).length } as CSSProperties;
	return (
		<Caixa className="codigo">
			{linguagem ? <Caixa className="codigo__barra">{linguagem}</Caixa> : null}
			<pre className="codigo__pre" style={estilo}>
				{children}
			</pre>
		</Caixa>
	);
}

// Links abrem fora do app (o app roda no Edge em modo app, sem barra de endereço).
function criarComponentes(emLinha: boolean): Components {
	return {
		a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
		img: ({ node, ...props }) => {
			const caminho = node?.properties?.dataEmbed;
			if (typeof caminho !== "string" || !caminho) return <img {...props} />;
			const numero = (valor: unknown) => (valor === undefined ? undefined : Number(valor));
			return <ImagemDoPerfil caminho={caminho} largura={numero(props.width)} altura={numero(props.height)} />;
		},
		pre: ({ node, children }) => (
			<BlocoDeCodigo no={node as NoHast | undefined} emLinha={emLinha}>
				{children}
			</BlocoDeCodigo>
		),
		// Em linha (rótulos de opção, enunciados curtos): os parágrafos viram texto solto.
		...(emLinha ? { p: ({ children }) => <>{children}</> } : {}),
	};
}

const componentes = criarComponentes(false);
const componentesEmLinha = criarComponentes(true);

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
