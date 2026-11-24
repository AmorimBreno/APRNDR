// Tipos e regras das notas sem nada do Node: a tela (profiles/estudos/paineis)
// importa daqui, e notas.ts reexporta. Cada nota é o arquivo
// materias/<id>/notas/<Título>.md; o título é o nome do arquivo.

import { ehPlanoDeEstudos, type ProgressoPlano } from "./plano-tipos.ts";

/** Uma nota na lista do caderno. */
export interface ResumoNota {
	titulo: string;
	/** ISO 8601 da última mudança no arquivo. */
	modificadaEm: string;
	/** Bytes do arquivo. */
	tamanho: number;
	/** O começo do texto, sem a marcação do markdown (e sem a linha da marca "do professor"). */
	previa: string;
	/** A primeira linha é a marca de uma nota criada pelo professor (ehNotaDoProfessor). */
	doProfessor: boolean;
	/** Só nas notas com a tag de plano de estudos (ehPlanoDeEstudos): o progresso da checklist. */
	plano?: ProgressoPlano;
}

export interface ListaNotas {
	materia: string;
	notas: ResumoNota[];
}

/** Uma nota aberta: o conteúdo e a versão que a tela manda de volta ao salvar. */
export interface NotaAberta {
	materia: string;
	titulo: string;
	conteudo: string;
	/** Hash do conteúdo do arquivo; salvar com uma versão que não é mais a do arquivo dá conflito. */
	versao: string;
	modificadaEm: string;
}

/** A pasta das notas da matéria, relativa à pasta de dados. */
export const pastaNotasRelativa = (id: string) => `materias/${id}/notas`;

/** Até quantos caracteres um título pode ter (o caminho inteiro no Windows tem limite). */
export const TAMANHO_TITULO = 120;

const PROIBIDOS = /[<>:"/\\|?*[\]\u0000-\u001f]/;
const RESERVADOS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Confere o título (que vira nome de arquivo) e devolve ele limpo, ou a frase
 * do problema. As regras são as do Windows (sem < > : " / \ | ? *, sem ponto
 * ou espaço no fim, sem CON, NUL…) e mais duas: sem colchetes, que as menções
 * [[Nome da nota]] usam, e sem ponto no começo, que esconde o arquivo.
 */
export function conferirTitulo(bruto: string): { titulo: string } | { erro: string } {
	const titulo = bruto.trim().replace(/\s+/g, " ");
	if (!titulo) return { erro: "Escreva o título da nota." };
	if (titulo.length > TAMANHO_TITULO) return { erro: `O título pode ter até ${TAMANHO_TITULO} caracteres.` };
	if (PROIBIDOS.test(titulo)) return { erro: 'O título não pode ter < > : " / \\ | ? * nem colchetes.' };
	if (titulo.startsWith(".")) return { erro: "O título não pode começar com ponto." };
	if (titulo.endsWith(".")) return { erro: "O título não pode terminar com ponto." };
	if (RESERVADOS.test(titulo)) return { erro: `"${titulo}" é um nome reservado do Windows. Escolha outro título.` };
	return { titulo };
}

/**
 * O HTML que as notas usam (docs/notas-formato.md): os tons da caixa de
 * destaque e as cores do texto, pelos nomes das classes no arquivo.
 */
export const TONS_CAIXA = ["ideia", "atencao", "exemplo", "resumo"] as const;
export type TomCaixa = (typeof TONS_CAIXA)[number];
export const CORES_TEXTO = ["tijolo", "ambar", "musgo", "aco", "salvia"] as const;
export type CorTexto = (typeof CORES_TEXTO)[number];

/** As tags que o editor entende, exatamente como ele as escreve (abertura e fechamento). */
const TAGS_CONHECIDAS = new Set([
	"<mark>",
	...CORES_TEXTO.map((cor) => `<mark class="fundo-${cor}">`),
	"</mark>",
	"<u>",
	"</u>",
	...CORES_TEXTO.map((cor) => `<span class="cor-${cor}">`),
	"</span>",
	...TONS_CAIXA.map((tom) => `<div class="caixa ${tom}">`),
	'<div class="definicao">',
	"</div>",
	"<dfn>",
	"</dfn>",
	"<details>",
	'<details class="pergunta">',
	"</details>",
	"<summary>",
	"</summary>",
]);

/**
 * Se o markdown tem HTML que o editor não conhece (fora do código): ele o
 * descartaria ao salvar, então uma nota assim abre só para leitura. O HTML
 * das decorações e dos blocos (TAGS_CONHECIDAS) não conta. Código em bloco
 * (``` ou ~~~) e código na linha (`...`) também não. Um < seguido de letra,
 * / ou ! (comentário) que não é uma tag conhecida conta.
 */
export function temHtmlDesconhecido(markdown: string): boolean {
	let cerca: string | undefined;
	for (const linha of markdown.split(/\r?\n/)) {
		const abertura = /^ {0,3}(`{3,}|~{3,})/.exec(linha);
		if (cerca) {
			if (abertura && abertura[1]!.startsWith(cerca)) cerca = undefined;
			continue;
		}
		if (abertura) {
			cerca = abertura[1]!;
			continue;
		}
		// Bloco de código por recuo (4 espaços ou tab) também não conta.
		if (/^( {4}|\t)/.test(linha)) continue;
		const semCodigo = linha.replace(/(`+)[^`]*?\1/g, "");
		for (const achado of semCodigo.matchAll(/<[a-zA-Z/!][^>]*>?/g)) {
			if (!TAGS_CONHECIDAS.has(achado[0])) return true;
		}
	}
	return false;
}

/** O começo da marca "do professor", a primeira linha da nota (docs/notas-formato.md, "Nota do professor"). */
export const INICIO_MARCA_PROFESSOR = "Nota do professor · ";

/** Um link com o esquema conversa: (o do Guardar na nota e o da marca). */
const LINK_CONVERSA = /\]\(conversa:[^)\s]+\)/;

/** Separa a primeira linha não vazia do resto; undefined se o markdown é só espaço. */
function primeiraLinha(markdown: string): { linha: string; resto: string } | undefined {
	const semBom = markdown.charCodeAt(0) === 0xfeff ? markdown.slice(1) : markdown;
	const achado = /^(?:[ \t]*\r?\n)*([^\r\n]*)(?:\r?\n)?/.exec(semBom);
	if (!achado || achado[1]!.trim() === "") return undefined;
	return { linha: achado[1]!, resto: semBom.slice(achado[0].length) };
}

/**
 * A nota foi criada pelo professor: a primeira linha não vazia começa com
 * "Nota do professor · " e traz um link conversa:<id>. Se o Breno apaga a
 * linha, a nota deixa de ser "do professor" (passa a ser dele).
 */
export function ehNotaDoProfessor(markdown: string): boolean {
	const primeira = primeiraLinha(markdown);
	return primeira !== undefined && primeira.linha.startsWith(INICIO_MARCA_PROFESSOR) && LINK_CONVERSA.test(primeira.linha);
}

/** O começo do texto sem a marcação do markdown, para a lista de notas. A linha da marca "do professor" e a da tag de plano de estudos não entram. */
export function previaDaNota(markdown: string, tamanho = 140): string {
	const semMarca = ehNotaDoProfessor(markdown) || ehPlanoDeEstudos(markdown) ? (primeiraLinha(markdown)?.resto ?? "") : markdown;
	const texto = semMarca
		.replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, "")
		.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g, "")
		// A fórmula fica como o LaTeX, sem os $$.
		.replace(/\$\$([\s\S]*?)\$\$/g, "$1")
		.replace(/[*~`]+/g, "")
		// O _ de ênfase sai; o do meio da palavra ("x_1", "snake_case") fica.
		.replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, "")
		.replace(/\s+/g, " ")
		.trim();
	return texto.length > tamanho ? `${texto.slice(0, tamanho - 1).trimEnd()}…` : texto;
}
