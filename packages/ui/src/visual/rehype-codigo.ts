// Plugin de rehype do código no Markdown (roda depois do rehype-highlight):
// - código em linha (`code` fora de `pre`) ganha a classe "codigo-em-linha";
// - o código de um bloco (`pre > code`) é dividido em linhas, cada uma num
//   <span class="codigo__linha" data-linha="N">, com "\n" entre elas. O número
//   aparece pelo CSS (::before com o data-linha), então não vai junto ao copiar.
//   Os spans do destaque de sintaxe que atravessam linhas (string ou
//   comentário de várias linhas) são repartidos, um pedaço em cada linha.

interface No {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: No[];
}

export const CLASSE_EM_LINHA = "codigo-em-linha";
export const CLASSE_LINHA = "codigo__linha";

function classes(no: No): string[] {
	const valor = no.properties?.className;
	return Array.isArray(valor) ? valor.map(String) : typeof valor === "string" ? valor.split(/\s+/) : [];
}

/** Reparte os nós em linhas pelos "\n" dos textos, repetindo os elementos que atravessam linhas. */
export function dividirEmLinhas(nos: No[]): No[][] {
	const linhas: No[][] = [[]];
	const atual = () => linhas[linhas.length - 1]!;
	for (const no of nos) {
		if (no.type === "text") {
			(no.value ?? "").split("\n").forEach((parte, indice) => {
				if (indice > 0) linhas.push([]);
				if (parte) atual().push({ type: "text", value: parte });
			});
		} else if (no.type === "element" && no.children?.length) {
			dividirEmLinhas(no.children).forEach((pedaco, indice) => {
				if (indice > 0) linhas.push([]);
				if (pedaco.length) atual().push({ ...no, children: pedaco });
			});
		} else {
			atual().push(no);
		}
	}
	return linhas;
}

function linhasDoBloco(codigo: No): No[] {
	const linhas = dividirEmLinhas(codigo.children ?? []);
	// O bloco termina com "\n" (o mdast-util-to-hast põe um): a última linha vazia não conta.
	if (linhas.length > 1 && linhas[linhas.length - 1]!.length === 0) linhas.pop();
	const nos: No[] = [];
	linhas.forEach((filhos, indice) => {
		if (indice > 0) nos.push({ type: "text", value: "\n" });
		nos.push({ type: "element", tagName: "span", properties: { className: [CLASSE_LINHA], dataLinha: indice + 1 }, children: filhos });
	});
	return nos;
}

function percorrer(no: No, dentroDePre: boolean): void {
	for (const filho of no.children ?? []) {
		if (filho.type !== "element") continue;
		if (filho.tagName === "code") {
			if (dentroDePre) filho.children = linhasDoBloco(filho);
			else if (!classes(filho).includes(CLASSE_EM_LINHA)) filho.properties = { ...filho.properties, className: [...classes(filho), CLASSE_EM_LINHA] };
			continue;
		}
		percorrer(filho, filho.tagName === "pre");
	}
}

export default function rehypeCodigo() {
	return (arvore: No) => percorrer(arvore, false);
}
