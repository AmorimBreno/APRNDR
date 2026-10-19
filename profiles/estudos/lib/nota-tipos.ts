// Tipos e regras das notas sem nada do Node: a tela (profiles/estudos/paineis)
// importa daqui, e notas.ts reexporta. Cada nota é o arquivo
// materias/<id>/notas/<Título>.md; o título é o nome do arquivo.

/** Uma nota na lista do caderno. */
export interface ResumoNota {
	titulo: string;
	/** ISO 8601 da última mudança no arquivo. */
	modificadaEm: string;
	/** Bytes do arquivo. */
	tamanho: number;
	/** O começo do texto, sem a marcação do markdown. */
	previa: string;
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
 * Se o markdown tem HTML fora do código. O editor da parte B não conhece
 * HTML e o descartaria ao salvar; uma nota assim abre só para leitura até
 * as decorações (parte C). Código em bloco (``` ou ~~~) e código na linha
 * (`...`) não contam. Um < seguido de letra, / ou ! (comentário) conta.
 */
export function temHtml(markdown: string): boolean {
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
		if (/<[a-zA-Z/!]/.test(semCodigo)) return true;
	}
	return false;
}

/** O começo do texto sem a marcação do markdown, para a lista de notas. */
export function previaDaNota(markdown: string, tamanho = 140): string {
	const texto = markdown
		.replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, "")
		.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g, "")
		.replace(/[*~`]+/g, "")
		// O _ de ênfase sai; o do meio da palavra ("x_1", "snake_case") fica.
		.replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, "")
		.replace(/\s+/g, " ")
		.trim();
	return texto.length > tamanho ? `${texto.slice(0, tamanho - 1).trimEnd()}…` : texto;
}
