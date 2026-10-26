// Leitor dos blocos ```vetor``` e ```matriz``` do Markdown (Markdown.tsx os
// desenha como estruturas). O conteúdo é uma lista no estilo Python/JSON:
// "[6, 3, 8]", "['a', \"b\"]", "[[1, 2], [3, 4]]". Lê números, strings com
// aspas simples ou duplas (com escapes \), true/false/True/False e None/null,
// com vírgula sobrando no fim e quebras de linha à vontade. Nada é avaliado
// (sem eval). Uma primeira linha opcional "# rótulo" vira a legenda.
// Qualquer coisa fora disso devolve null, e o bloco aparece como código comum.

export type TipoValor = "numero" | "texto" | "booleano" | "nulo";

/** Um valor da estrutura, com o texto como foi escrito (strings com as aspas). */
export interface Valor {
	texto: string;
	tipo: TipoValor;
}

export type Estrutura =
	| { tipo: "vetor"; rotulo?: string; valores: Valor[] }
	| { tipo: "matriz"; rotulo?: string; linhas: Valor[][]; colunas: number };

type Lido = Valor | Lido[];

const PALAVRAS: Record<string, TipoValor> = { true: "booleano", false: "booleano", True: "booleano", False: "booleano", None: "nulo", null: "nulo" };
const NUMERO = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const PALAVRA = /^[A-Za-z_]\w*/;

/** Separa a primeira linha "# rótulo" (se houver) do resto. */
function separarRotulo(fonte: string): { rotulo?: string; corpo: string } {
	const linhas = fonte.replace(/\r\n?/g, "\n").split("\n");
	const primeira = linhas.findIndex((linha) => linha.trim() !== "");
	if (primeira < 0 || !linhas[primeira]!.trim().startsWith("#")) return { corpo: fonte };
	const rotulo = linhas[primeira]!.trim().replace(/^#+/, "").trim();
	return { ...(rotulo ? { rotulo } : {}), corpo: linhas.slice(primeira + 1).join("\n") };
}

/** Lê uma lista (com listas dentro) a partir do texto; null se não for uma lista válida e só ela. */
export function lerLista(fonte: string): Lido[] | null {
	let pos = 0;
	const espacos = () => {
		while (pos < fonte.length && /\s/.test(fonte[pos]!)) pos++;
	};

	const lerTexto = (): Valor | null => {
		const aspas = fonte[pos]!;
		const inicio = pos++;
		while (pos < fonte.length) {
			const letra = fonte[pos]!;
			if (letra === "\n") return null;
			if (letra === "\\") pos += 2;
			else if (letra === aspas) return { texto: fonte.slice(inicio, ++pos), tipo: "texto" };
			else pos++;
		}
		return null;
	};

	const lerSimples = (): Valor | null => {
		const resto = fonte.slice(pos);
		const numero = NUMERO.exec(resto);
		if (numero && !/^\w/.test(resto.slice(numero[0].length))) {
			pos += numero[0].length;
			return { texto: numero[0], tipo: "numero" };
		}
		const palavra = PALAVRA.exec(resto)?.[0];
		const tipo = palavra === undefined ? undefined : PALAVRAS[palavra];
		if (!palavra || !tipo) return null;
		pos += palavra.length;
		return { texto: palavra, tipo };
	};

	const lerItem = (): Lido | null => {
		const letra = fonte[pos];
		if (letra === "[") return lerListaAqui();
		if (letra === "'" || letra === '"') return lerTexto();
		return lerSimples();
	};

	const lerListaAqui = (): Lido[] | null => {
		pos++; // o "["
		const itens: Lido[] = [];
		espacos();
		while (fonte[pos] !== "]") {
			const item = lerItem();
			if (item === null) return null;
			itens.push(item);
			espacos();
			if (fonte[pos] === ",") {
				pos++;
				espacos();
			} else if (fonte[pos] !== "]") return null;
		}
		pos++; // o "]"
		return itens;
	};

	espacos();
	if (fonte[pos] !== "[") return null;
	const lista = lerListaAqui();
	espacos();
	return lista && pos === fonte.length ? lista : null;
}

const ehValor = (item: Lido): item is Valor => !Array.isArray(item);

/**
 * Lê o conteúdo de um bloco ```vetor``` (lista de valores, ao menos um) ou
 * ```matriz``` (lista de linhas, todas do mesmo tamanho e com ao menos um
 * valor). Devolve null se o conteúdo não servir.
 */
export function lerEstrutura(tipo: "vetor" | "matriz", fonte: string): Estrutura | null {
	const { rotulo, corpo } = separarRotulo(fonte);
	const lista = lerLista(corpo);
	if (!lista || lista.length === 0) return null;
	const comRotulo = rotulo ? { rotulo } : {};
	if (tipo === "vetor") return lista.every(ehValor) ? { tipo, ...comRotulo, valores: lista } : null;
	const linhas: Valor[][] = [];
	for (const linha of lista) {
		if (!Array.isArray(linha) || linha.length === 0 || !linha.every(ehValor)) return null;
		linhas.push(linha);
	}
	const colunas = linhas[0]!.length;
	return linhas.every((linha) => linha.length === colunas) ? { tipo, ...comRotulo, linhas, colunas } : null;
}
