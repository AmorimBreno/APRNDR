// As partes puras do código ao lado e do destaque do código citado, na visão
// do módulo (TelaModulo.tsx, CodigoCitado.tsx):
//
// - separarCodigoPrincipal: tira do markdown de uma explicação os blocos de
//   código "principais" (cerca no começo da linha, com linguagem que não seja
//   vetor nem matriz e com 3 linhas ou mais), que vão para a coluna fixa à
//   direita. As saídas curtas (1 ou 2 linhas), os vetores, as matrizes e os
//   blocos sem linguagem ficam no texto.
// - casarTrecho: onde um `código em linha` do texto aparece num bloco de
//   código (ou no valor de uma caixa de vetor). Os espaços são normalizados
//   (qualquer sequência vira um espaço) e as aspas simples e duplas valem o
//   mesmo. Um trecho entre aspas casa com o literal ('escola' e "escola"); um
//   trecho de palavra casa só em limite de palavra (o `a` não pega a letra a de
//   "casa", só o identificador a sozinho ou o item 'a'); um trecho com
//   símbolos casa como subsequência exata, com limite de palavra nas pontas
//   que são letra ou número. Um caractere só que não é letra nem número (`.`,
//   `,`) casa só como literal entre aspas ('.'), nunca solto. Quando o
//   casamento é exatamente o conteúdo de um literal entre aspas, o destaque
//   pega as aspas também.
// Sem React: os testes (codigo-citado.test.ts) rodam no Node.

/** Um casamento, em posições do texto original do código (fim exclusivo). */
export interface Casamento {
	inicio: number;
	fim: number;
}

const LETRA = /[\p{L}\p{N}_]/u;
const PALAVRA = /^[\p{L}\p{N}_]+$/u;
const ESPACO = /\s/;

const ehLetra = (caractere: string | undefined) => caractere !== undefined && LETRA.test(caractere);

/** O código com os espaços juntados num só e as aspas duplas trocadas por simples; `origem[i]` é a posição no original. */
function normalizar(fonte: string): { texto: string; origem: number[] } {
	let texto = "";
	const origem: number[] = [];
	let posicao = 0;
	while (posicao < fonte.length) {
		const caractere = fonte[posicao]!;
		if (ESPACO.test(caractere)) {
			origem.push(posicao);
			texto += " ";
			while (posicao < fonte.length && ESPACO.test(fonte[posicao]!)) posicao++;
			continue;
		}
		origem.push(posicao);
		texto += caractere === '"' ? "'" : caractere;
		posicao++;
	}
	return { texto, origem };
}

/** O trecho citado, sem espaço nas pontas, com os espaços juntados e as aspas unificadas. */
function normalizarTrecho(trecho: string): string {
	return trecho.trim().replace(/\s+/g, " ").replace(/"/g, "'");
}

/** As ocorrências do trecho no texto, sem sobrepor, que passam no teste. */
function ocorrencias(texto: string, trecho: string, aceita: (inicio: number, fim: number) => boolean): Array<[number, number]> {
	const achados: Array<[number, number]> = [];
	let desde = 0;
	while (desde <= texto.length - trecho.length) {
		const inicio = texto.indexOf(trecho, desde);
		if (inicio < 0) break;
		const fim = inicio + trecho.length;
		if (aceita(inicio, fim)) {
			achados.push([inicio, fim]);
			desde = fim;
		} else {
			desde = inicio + 1;
		}
	}
	return achados;
}

/** Onde o trecho citado aparece no código; nenhum casamento, lista vazia. */
export function casarTrecho(trecho: string, codigo: string): Casamento[] {
	const procurado = normalizarTrecho(trecho);
	if (!procurado || !codigo) return [];
	const { texto, origem } = normalizar(codigo);
	const caracteres = Array.from(procurado);
	const literal = procurado.length >= 2 && procurado.startsWith("'") && procurado.endsWith("'");

	let achados: Array<[number, number]>;
	if (literal) {
		// 'escola' casa com 'escola' e "escola" (as aspas já estão unificadas).
		achados = ocorrencias(texto, procurado, () => true);
	} else if (caracteres.length === 1 && !PALAVRA.test(procurado)) {
		// Um símbolo só (`.`, `,`, `%`): só o literal entre aspas, nunca o símbolo solto.
		achados = ocorrencias(texto, `'${procurado}'`, () => true);
	} else {
		// Palavra ou trecho com símbolos: limite de palavra nas pontas que são letra ou número.
		const pontaInicial = ehLetra(caracteres[0]);
		const pontaFinal = ehLetra(caracteres[caracteres.length - 1]);
		achados = ocorrencias(
			texto,
			procurado,
			(inicio, fim) => !(pontaInicial && ehLetra(texto[inicio - 1])) && !(pontaFinal && ehLetra(texto[fim])),
		).map(([inicio, fim]) => (texto[inicio - 1] === "'" && texto[fim] === "'" ? [inicio - 1, fim + 1] : [inicio, fim]));
	}
	return achados.map(([inicio, fim]) => ({ inicio: origem[inicio]!, fim: origem[fim - 1]! + 1 }));
}

/** Se o trecho citado casa com o valor de uma caixa de vetor ou matriz (o texto como foi escrito, com as aspas). */
export function casaComValor(trecho: string, valor: string): boolean {
	return casarTrecho(trecho, valor).length > 0;
}

// --- O código ao lado ----------------------------------------------------------------

/** Os blocos que viram desenho (Markdown do núcleo): nunca vão para o lado. */
const ESTRUTURAS = new Set(["vetor", "matriz"]);
/** A partir de quantas linhas um bloco de código é principal (as saídas curtas ficam no texto). */
export const LINHAS_DO_PRINCIPAL = 3;

/** O texto sem os blocos principais e os blocos principais, cada um com as cercas, na ordem. */
export interface Separacao {
	texto: string;
	principais: string[];
}

/**
 * Separa os blocos de código principais do resto do markdown. Só as cercas no
 * começo da linha (sem recuo) contam: as de dentro de listas e citações ficam
 * no texto. Uma cerca sem fechamento também fica.
 */
export function separarCodigoPrincipal(markdown: string): Separacao {
	const linhas = markdown.replace(/\r\n?/g, "\n").split("\n");
	const fica: string[] = [];
	const principais: string[] = [];
	let posicao = 0;
	while (posicao < linhas.length) {
		const linha = linhas[posicao]!;
		const abre = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(linha);
		if (!abre || (abre[2]!.startsWith("`") && abre[3]!.includes("`"))) {
			fica.push(linha);
			posicao++;
			continue;
		}
		const cerca = abre[2]!;
		const fecha = new RegExp(`^ {0,3}${cerca[0] === "`" ? "`" : "~"}{${cerca.length},}[ \\t]*$`);
		let fim = posicao + 1;
		while (fim < linhas.length && !fecha.test(linhas[fim]!)) fim++;
		const fechado = fim < linhas.length;
		const bloco = linhas.slice(posicao, fechado ? fim + 1 : linhas.length);
		const conteudo = linhas.slice(posicao + 1, fim);
		while (conteudo.length > 0 && conteudo[conteudo.length - 1]!.trim() === "") conteudo.pop();
		const linguagem = (abre[3]!.trim().split(/\s+/)[0] ?? "").toLowerCase();
		const principal = fechado && abre[1] === "" && linguagem !== "" && !ESTRUTURAS.has(linguagem) && conteudo.length >= LINHAS_DO_PRINCIPAL;
		if (principal) {
			principais.push(bloco.join("\n"));
			fica.push("");
		} else {
			fica.push(...bloco);
		}
		posicao = fechado ? fim + 1 : linhas.length;
	}
	// Sem juntar as linhas em branco do meio: elas podem estar dentro de um bloco que ficou no texto.
	return { texto: fica.join("\n").replace(/^\n+|\n+$/g, ""), principais };
}
