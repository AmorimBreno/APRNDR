// Plugin de remark que impede o $ de dinheiro de abrir uma fórmula. O
// remark-math trata qualquer par de $ como LaTeX, e "compra por R$ 20 e vende a
// R$ 19" virava uma fórmula entre os dois $. Aqui, o $ fica como texto comum:
// - logo depois de uma letra (R$, US$, A$, C$; R$20 também);
// - seguido de espaço ou fim de linha ("$ 5", "custa $ 20"; e, como no pandoc,
//   o $ de abertura seguido de espaço não abre fórmula: "$ x $" fica texto).
// Fórmulas continuam: "$x^2$", "$\frac{a}{b}$", "$R$" (sem letra antes) e o
// bloco "$$ … $$".
//
// Onde: uma extensão do micromark (o leitor de Markdown por baixo do remark),
// para o caractere $ no texto, registrada antes da do remark-math (add
// "before"). Um plugin de remark comum, que mexe na árvore, chegaria tarde: a
// fórmula já teria sido lida. Um pré-processamento do texto bruto teria de
// reconhecer sozinho código em linha, blocos de código (vetor e matriz também)
// e o $$ em bloco. Com a extensão, o próprio micromark resolve isso: dentro de
// código o $ nunca chega ao leitor do texto, e o $$ em bloco é lido no nível
// dos blocos, onde a extensão não atua. O $ de dinheiro sai como um pedaço
// comum de texto (o token data), que vira o mesmo nó de texto da frase; o
// rehype-palavras e o streaming não percebem diferença (texto pela metade só
// faz o $ não casar, nunca lança erro).

type Codigo = number | null;
type Estado = (codigo: Codigo) => Estado | undefined;
interface Efeitos {
	enter(tipo: string): unknown;
	consume(codigo: Codigo): void;
	exit(tipo: string): unknown;
}
interface Leitor {
	/** O caractere antes do $ (null no começo; negativos são espaços e quebras virtuais). */
	previous: Codigo;
}

const CIFRAO = 36;

const ehLetra = (codigo: Codigo): boolean => codigo !== null && codigo > 0 && /\p{L}/u.test(String.fromCodePoint(codigo));
/** Espaço, tabulação ou fim de linha (no micromark, os negativos são tabulação, espaço virtual e quebras). */
const ehEspaco = (codigo: Codigo): boolean => codigo !== null && (codigo < 0 || codigo === 32 || codigo === 9 || codigo === 10 || codigo === 13);

function lerDinheiro(this: Leitor, efeitos: Efeitos, ok: Estado, nok: Estado): Estado {
	const depoisDeLetra = ehLetra(this.previous);
	const depois: Estado = (codigo) => {
		if (!depoisDeLetra && !ehEspaco(codigo)) return nok(codigo);
		efeitos.exit("data");
		return ok(codigo);
	};
	return (codigo) => {
		if (codigo !== CIFRAO) return nok(codigo);
		efeitos.enter("data");
		efeitos.consume(codigo);
		return depois;
	};
}

/**
 * Só depois de um caractere que não é $, como a fórmula do remark-math: o
 * micromark tenta a lista inteira do $ quando um dos leitores aceita o
 * caractere anterior, e a fórmula não pode ser tentada logo depois de outro $
 * (no texto pela metade, "resto $$", isso lançava erro).
 */
const anteriorAceito = (codigo: Codigo): boolean => codigo !== CIFRAO;

/** A extensão do micromark: o $ de dinheiro, tentado antes da fórmula na linha do remark-math. */
export const extensaoDinheiro = {
	text: { [CIFRAO]: { name: "dinheiro", tokenize: lerDinheiro, previous: anteriorAceito, add: "before" as const } },
};

/** O plugin: registra a extensão nos dados do processador (o remark-parse lê micromarkExtensions). */
export default function remarkDinheiro(this: { data(): object }) {
	const dados = this.data() as { micromarkExtensions?: unknown[] };
	(dados.micromarkExtensions ??= []).push(extensaoDinheiro);
}
