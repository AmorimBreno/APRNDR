// O escape do texto comum quando o editor das notas escreve o markdown. O
// @tiptap/markdown põe barra antes de todo \ ` * _ [ ] ~ e troca < e & por
// &lt; e &amp;: "snake_case" vira "snake\_case" e "a < b" vira "a &lt; b", e a
// nota fica feia para quem lê o arquivo (você, fora do app, e o professor).
// Aqui só se escapa o que mudaria o sentido ao ler o markdown de novo; os
// testes de ida e volta (editor-nota.test.ts) conferem os dois sentidos.
//
// EscapeEnxuto troca o método do MarkdownManager que faz isso
// (encodeTextForMarkdown, interno ao @tiptap/markdown 3.31.4, fixo no
// package.json). Se uma versão nova mudar esse método, os testes acusam.

import { Extension, type JSONContent } from "@tiptap/core";

const ehEspaco = (caractere: string | undefined) => caractere === undefined || /\s/.test(caractere);
const ehLetraOuNumero = (caractere: string | undefined) => caractere !== undefined && /[\p{L}\p{N}]/u.test(caractere);
const PONTUACAO_ASCII = /[!-/:-@[-`{-~]/;
const ENTIDADE = /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

/** Escapa só o necessário num pedaço de texto comum (fora de código). */
export function escaparEnxuto(texto: string): string {
	let saida = "";
	for (let indice = 0; indice < texto.length; indice++) {
		const caractere = texto[indice]!;
		const antes = texto[indice - 1];
		const depois = texto[indice + 1];
		let escapar = false;
		switch (caractere) {
			case "\\":
				// "\alpha" fica como está; barra antes de pontuação ou no fim (quebra de linha) não.
				escapar = depois === undefined || PONTUACAO_ASCII.test(depois);
				break;
			case "`":
				escapar = true;
				break;
			case "*":
				// Entre espaços ("2 * 3") não abre nem fecha ênfase.
				escapar = !(antes !== undefined && ehEspaco(antes) && ehEspaco(depois));
				break;
			case "_":
				// Dentro da palavra ("snake_case", "x_1") ou entre espaços não abre ênfase.
				escapar = !((ehLetraOuNumero(antes) && ehLetraOuNumero(depois)) || (antes !== undefined && ehEspaco(antes) && ehEspaco(depois)));
				break;
			case "~":
				escapar = !((ehLetraOuNumero(antes) && ehLetraOuNumero(depois)) || (antes !== undefined && ehEspaco(antes) && ehEspaco(depois)));
				break;
			case "[":
				// "[[" seria uma menção.
				escapar = depois === "[";
				break;
			case "]":
				// "](" ou "][" fariam um link; "]:" uma definição de link; "]]" fecharia uma menção.
				escapar = depois === "(" || depois === "[" || depois === ":" || depois === "]";
				break;
			case "<":
				// Só o que pareceria uma tag ou um comentário ("<b>", "</x>", "<!--").
				escapar = depois !== undefined && /[a-zA-Z/!?]/.test(depois);
				break;
			case "&":
				// Só o que pareceria uma entidade ("&amp;", "&#169;").
				escapar = ENTIDADE.test(texto.slice(indice));
				break;
		}
		saida += escapar ? `\\${caractere}` : caractere;
	}
	return saida;
}

interface ManagerInterno {
	codeTypes: Set<string>;
	encodeTextForMarkdown(texto: string, node: JSONContent, pai?: JSONContent): string;
}

/** Troca o escape do texto comum do markdown pelo enxuto (depois que o Markdown montou o manager). */
export const EscapeEnxuto = Extension.create({
	name: "escapeEnxuto",
	// Prioridade baixa: roda depois do onBeforeCreate do Markdown, que monta o manager.
	// (O onCreate só vem num setTimeout, tarde demais para um getMarkdown logo depois de criar.)
	priority: 1,
	onBeforeCreate() {
		const manager = this.editor.markdown as unknown as ManagerInterno | undefined;
		if (!manager) return;
		manager.encodeTextForMarkdown = (texto, node, pai) => {
			const emCodigo =
				(pai?.type != null && manager.codeTypes.has(pai.type)) || (node.marks ?? []).some((marca) => manager.codeTypes.has(typeof marca === "string" ? marca : marca.type));
			return emCodigo ? texto : escaparEnxuto(texto);
		};
	},
});
