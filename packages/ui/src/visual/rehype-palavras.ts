// Plugin de rehype que embrulha cada palavra do texto num <span class="palavra">,
// para as palavras novas de uma resposta que está chegando aparecerem com um
// fade (a animação é CSS e só roda quando o span nasce; o React reaproveita os
// spans que já existiam). Código, fórmulas (KaTeX) e SVG ficam inteiros.

interface No {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: No[];
}

const PULAR = new Set(["pre", "code", "svg", "math", "annotation", "script", "style"]);

function classes(no: No): string[] {
	const valor = no.properties?.className;
	return Array.isArray(valor) ? valor.map(String) : typeof valor === "string" ? valor.split(/\s+/) : [];
}

function pular(no: No): boolean {
	return no.type === "element" && (PULAR.has(no.tagName ?? "") || classes(no).some((classe) => classe.startsWith("katex")));
}

/** Divide um texto em palavras (em span) e espaços (como texto). */
export function dividirEmPalavras(texto: string): No[] {
	return texto
		.split(/(\s+)/)
		.filter((parte) => parte.length > 0)
		.map((parte) =>
			/^\s+$/.test(parte)
				? { type: "text", value: parte }
				: { type: "element", tagName: "span", properties: { className: ["palavra"] }, children: [{ type: "text", value: parte }] },
		);
}

function percorrer(no: No): void {
	if (!no.children || pular(no)) return;
	const filhos: No[] = [];
	for (const filho of no.children) {
		if (filho.type === "text" && filho.value) filhos.push(...dividirEmPalavras(filho.value));
		else {
			percorrer(filho);
			filhos.push(filho);
		}
	}
	no.children = filhos;
}

export default function rehypePalavras() {
	return (arvore: No) => percorrer(arvore);
}
