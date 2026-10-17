// Plugin de rehype que embrulha cada palavra do texto num <span class="palavra">,
// para as palavras novas de uma resposta que está chegando aparecerem com um
// fade, uma a uma (a animação é CSS e só roda quando o span nasce; o React
// reaproveita os spans que já existiam). `atrasoDe(indice)` dá o atraso de cada
// palavra (Markdown.tsx agenda uma fila). Código, fórmulas (KaTeX) e SVG ficam
// inteiros.

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

function percorrer(no: No, palavras: No[]): void {
	if (!no.children || pular(no)) return;
	const filhos: No[] = [];
	for (const filho of no.children) {
		if (filho.type === "text" && filho.value) {
			for (const parte of dividirEmPalavras(filho.value)) {
				if (parte.type === "element") palavras.push(parte);
				filhos.push(parte);
			}
		} else {
			percorrer(filho, palavras);
			filhos.push(filho);
		}
	}
	no.children = filhos;
}

export interface OpcoesPalavras {
	/** O atraso da animação da palavra `indice` (na ordem do texto), em ms. */
	atrasoDe?(indice: number): number;
}

export default function rehypePalavras(opcoes: OpcoesPalavras = {}) {
	return (arvore: No) => {
		const palavras: No[] = [];
		percorrer(arvore, palavras);
		if (!opcoes.atrasoDe) return;
		palavras.forEach((palavra, indice) => {
			const atraso = opcoes.atrasoDe!(indice);
			if (atraso > 0) palavra.properties = { ...palavra.properties, style: `animation-delay:${Math.round(atraso)}ms` };
		});
	};
}
