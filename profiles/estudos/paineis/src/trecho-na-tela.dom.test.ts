// @vitest-environment happy-dom
// O trecho na lição (trecho-na-tela.ts): a captura da âncora de uma seleção no DOM e a
// resolução em ordem (texto com contexto, texto, bloco, começo), com o destaque pelo CSS
// Custom Highlight API ou, sem ele, pela classe de reserva no bloco.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ancoraDoRange, CLASSE_DESTAQUE_BLOCO, destaqueTemporario, mostrarNoDom, NOME_DESTAQUE, textoComSegmentos } from "./trecho-na-tela.ts";

/** Uma lição como o TelaModulo desenha: blocos com data-bloco e data-versao, o texto de estudo marcado, rótulos fora dele. */
function licao(): HTMLElement {
	const artigo = document.createElement("article");
	artigo.innerHTML = `
		<div class="modulo__bloco" data-bloco="b1" data-versao="1">
			<span class="etiqueta">Explicação</span>
			<div data-texto-estudo="b1"><p>A série <strong>geométrica</strong> converge quando |r| &lt; 1.</p><p>Se |r| &lt; 1, a soma é a/(1-r).</p></div>
			<button>Retorno</button>
		</div>
		<div class="modulo__bloco" data-bloco="b2" data-versao="3">
			<div data-texto-estudo="b2"><p>Mais adiante: se |r| &lt; 1, a série também converge absolutamente.</p></div>
		</div>`;
	document.body.append(artigo);
	return artigo;
}

let artigo: HTMLElement;
let rolavel: HTMLElement;
const registro = new Map<string, unknown>();

class MarcaFalsa {
	ranges: Range[];
	constructor(...ranges: Range[]) {
		this.ranges = ranges;
	}
}

beforeEach(() => {
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {} }));
	artigo = licao();
	rolavel = document.createElement("div");
	rolavel.append(artigo);
	document.body.append(rolavel);
	registro.clear();
});

afterEach(() => {
	rolavel.remove();
	document.dispatchEvent(new Event("pointerdown"));
	vi.unstubAllGlobals();
});

function comApiDeDestaque() {
	vi.stubGlobal("CSS", { highlights: registro, escape: (valor: string) => valor });
	vi.stubGlobal("Highlight", MarcaFalsa);
}

describe("textoComSegmentos", () => {
	it("só o texto de estudo, com uma quebra entre os parágrafos", () => {
		const { texto } = textoComSegmentos(artigo.querySelector("[data-bloco='b1']")!);
		expect(texto).toBe("A série geométrica converge quando |r| < 1.\nSe |r| < 1, a soma é a/(1-r).");
	});
});

describe("ancoraDoRange", () => {
	it("na lição: o bloco, a versão e o contexto lidos no bloco", () => {
		const texto = artigo.querySelector("[data-bloco='b1'] p:nth-child(2)")!.firstChild as Text;
		const range = document.createRange();
		range.setStart(texto, 0);
		range.setEnd(texto, "Se |r| < 1".length);
		const ancora = ancoraDoRange(range, artigo.querySelector("[data-texto-estudo='b1']")!);
		expect(ancora.bloco).toBe("b1");
		expect(ancora.versao).toBe(1);
		expect(ancora.antes).toBe("A série geométrica converge quando |r| < 1. ".slice(-40));
		expect(ancora.depois).toBe(", a soma é a/(1-r).");
	});

	it("fora de um bloco (a nota só leitura): o título da seção acima", () => {
		const folha = document.createElement("div");
		folha.innerHTML = "<h2>Critério da razão</h2><p>Se o limite é menor que um, converge.</p>";
		document.body.append(folha);
		const texto = folha.querySelector("p")!.firstChild as Text;
		const range = document.createRange();
		range.setStart(texto, 3);
		range.setEnd(texto, "Se o limite".length);
		expect(ancoraDoRange(range, folha)).toMatchObject({ bloco: "Critério da razão", depois: " é menor que um, converge." });
		folha.remove();
	});
});

describe("mostrarNoDom", () => {
	it("acha o texto com o contexto no bloco da âncora e destaca pelo CSS.highlights, sem mexer no DOM", () => {
		comApiDeDestaque();
		const antes = artigo.innerHTML;
		const nivel = mostrarNoDom(artigo, { trecho: "se |r| < 1", ancora: { bloco: "b2", antes: "Mais adiante: ", depois: ", a série também" }, soRolar: false }, { rolavel, suave: false });
		expect(nivel).toBe("exato-com-contexto");
		const marca = registro.get(NOME_DESTAQUE) as MarcaFalsa;
		expect(marca.ranges[0]?.toString()).toBe("se |r| < 1");
		expect(artigo.closest("div")?.contains(marca.ranges[0]!.startContainer)).toBe(true);
		expect(artigo.innerHTML).toBe(antes);
		// O próximo clique tira o destaque.
		document.dispatchEvent(new Event("pointerdown"));
		expect(registro.has(NOME_DESTAQUE)).toBe(false);
	});

	it("o trecho atravessando elementos (negrito) vira um Range só", () => {
		comApiDeDestaque();
		expect(mostrarNoDom(artigo, { trecho: "série geométrica converge", soRolar: false }, { rolavel, suave: false })).toBe("exato");
		expect((registro.get(NOME_DESTAQUE) as MarcaFalsa).ranges[0]?.toString()).toBe("série geométrica converge");
	});

	it("bloco reescrito (versão diferente) com o texto ainda lá: acha o texto", () => {
		comApiDeDestaque();
		expect(mostrarNoDom(artigo, { trecho: "converge absolutamente", ancora: { bloco: "b2", versao: 1 }, soRolar: false }, { rolavel, suave: false })).toBe("exato");
	});

	it("o texto saiu do bloco reescrito: cai no bloco, sem destaque do trecho", () => {
		comApiDeDestaque();
		expect(mostrarNoDom(artigo, { trecho: "um texto que não existe mais", ancora: { bloco: "b2", versao: 1 }, soRolar: false }, { rolavel, suave: false })).toBe("bloco");
		expect(registro.has(NOME_DESTAQUE)).toBe(false);
	});

	it("fórmula do KaTeX (seleção com o texto duplicado): cai no bloco", () => {
		expect(mostrarNoDom(artigo, { trecho: "a/(1-r)a/(1−r)", ancora: { bloco: "b1" }, soRolar: false }, { rolavel, suave: false })).toBe("bloco");
	});

	it("sem bloco nem texto: o começo, rolando ao topo", () => {
		rolavel.scrollTop = 300;
		expect(mostrarNoDom(artigo, { trecho: "nada disso", soRolar: false }, { rolavel, suave: false })).toBe("inicio");
		expect(rolavel.scrollTop).toBe(0);
	});

	it("só rolar não marca nada", () => {
		comApiDeDestaque();
		expect(mostrarNoDom(artigo, { trecho: "Mais adiante", soRolar: true }, { rolavel, suave: false })).toBe("exato");
		expect(registro.has(NOME_DESTAQUE)).toBe(false);
	});

	it("sem a API de destaque, o bloco ganha a classe de reserva (sem movimento: parada) e ela sai no clique", () => {
		vi.stubGlobal("CSS", undefined);
		vi.stubGlobal("Highlight", undefined);
		mostrarNoDom(artigo, { trecho: "converge absolutamente", soRolar: false }, { rolavel, suave: false });
		const bloco = artigo.querySelector("[data-bloco='b2']")!;
		expect(bloco.classList.contains(CLASSE_DESTAQUE_BLOCO)).toBe(true);
		expect(bloco.classList.contains(`${CLASSE_DESTAQUE_BLOCO}--parado`)).toBe(true);
		document.dispatchEvent(new Event("pointerdown"));
		expect(bloco.classList.contains(CLASSE_DESTAQUE_BLOCO)).toBe(false);
	});
});

describe("destaqueTemporario", () => {
	it("some sozinho no prazo, e um novo tira o anterior", () => {
		vi.useFakeTimers();
		const primeiro = vi.fn();
		const segundo = vi.fn();
		destaqueTemporario(primeiro, 3000);
		destaqueTemporario(segundo, 3000);
		expect(primeiro).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(3000);
		expect(segundo).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});
});
