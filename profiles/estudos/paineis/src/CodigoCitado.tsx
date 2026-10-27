// O texto de uma explicação da visão do módulo (TelaModulo.tsx), com o código
// ao lado e o destaque do código citado.
//
// Código ao lado: quando a explicação tem blocos de código principais
// (codigo-citado.ts, separarCodigoPrincipal) e a largura dela chega a
// LARGURA_LADO_A_LADO, ela vira duas colunas: à esquerda o texto, sem esses
// blocos; à direita os blocos principais, empilhados, numa coluna fixa
// (position: sticky) que acompanha a leitura enquanto a explicação está à vista
// e rola sozinha quando é mais alta que a tela. Mais estreita, tudo numa
// coluna, com o código no lugar dele no texto.
//
// Destaque: passar o mouse (ou focar com o teclado) num `código em linha` do
// texto desenha um retângulo de fundo claro em cada lugar em que o trecho
// aparece nos blocos de código da explicação (uma camada absoluta dentro do
// pre, sem mexer no texto) e marca as caixas dos vetores e matrizes que casam.
// Se o casamento está fora da área visível do código (a coluna da direita na
// vertical, o pre na horizontal), o código rola até ele, sem rolar a página.
// As medidas vêm em pixels da tela e as posições valem dentro do zoom da
// interface: a escala é a razão entre as duas larguras do pre.

import { Markdown, semMovimento } from "@estudos/ui";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Casamento, casaComValor, casarTrecho, separarCodigoPrincipal } from "./codigo-citado.ts";

/** A largura da explicação (em px do CSS) a partir da qual o código vai para o lado. */
export const LARGURA_LADO_A_LADO = 900;
/** A folga do retângulo em volta do texto destacado, em px. */
const FOLGA_X = 3;
const FOLGA_Y = 2;
/** O respiro ao rolar o código até o casamento, em px. */
const RESPIRO = 12;

const CLASSE_VALOR_DESTACADO = "valor--destacado";

export function ExplicacaoComCodigo({ texto }: { texto: string }) {
	const raiz = useRef<HTMLDivElement>(null);
	const { texto: corrido, principais } = useMemo(() => separarCodigoPrincipal(texto), [texto]);
	const largo = useLargo(raiz, principais.length > 0);
	const ladoALado = largo && principais.length > 0;
	useAlturaDoLado(raiz, ladoALado);
	useDestaqueDoCodigoCitado(raiz, `${texto}\n${ladoALado}`);
	return (
		<div ref={raiz} className={`modulo__explicacao${ladoALado ? " modulo__explicacao--lado-a-lado" : ""}`}>
			{ladoALado ? (
				<>
					<div className="modulo__texto">
						<Markdown texto={corrido} />
					</div>
					<div className="modulo__codigo-lado">
						{principais.map((bloco, indice) => (
							<Markdown key={indice} texto={bloco} />
						))}
					</div>
				</>
			) : (
				<Markdown texto={texto} />
			)}
		</div>
	);
}

/** Se a explicação tem largura para o código ao lado (só observa quando há código principal). */
function useLargo(raiz: RefObject<HTMLElement | null>, observar: boolean): boolean {
	const [largo, setLargo] = useState(false);
	// Antes de pintar: sem um quadro com o código no texto antes de ir para o lado.
	useLayoutEffect(() => {
		const elemento = raiz.current;
		if (!observar || !elemento || typeof ResizeObserver !== "function") return;
		const medir = () => setLargo(elemento.offsetWidth >= LARGURA_LADO_A_LADO);
		medir();
		const observador = new ResizeObserver(medir);
		observador.observe(elemento);
		return () => observador.disconnect();
	}, [observar]);
	return largo;
}

/**
 * A altura máxima da coluna do código ao lado: a da área que rola (o corpo da
 * visão, embaixo da CourseBar), sem os respiros dela, em --altura-codigo-lado.
 * Medida em px do CSS (clientHeight já vem dentro do zoom da interface).
 */
function useAlturaDoLado(raiz: RefObject<HTMLElement | null>, ativo: boolean) {
	useLayoutEffect(() => {
		const elemento = raiz.current;
		const area = elemento ? areaQueRola(elemento) : undefined;
		if (!ativo || !elemento || !area || typeof ResizeObserver !== "function") return;
		const medir = () => {
			const estilo = getComputedStyle(area);
			const altura = area.clientHeight - Number.parseFloat(estilo.paddingTop) - Number.parseFloat(estilo.paddingBottom);
			elemento.style.setProperty("--altura-codigo-lado", `${Math.max(0, altura)}px`);
		};
		medir();
		const observador = new ResizeObserver(medir);
		observador.observe(area);
		return () => {
			observador.disconnect();
			elemento.style.removeProperty("--altura-codigo-lado");
		};
	}, [ativo]);
}

/** O ancestral mais próximo que rola na vertical. */
function areaQueRola(elemento: HTMLElement): HTMLElement | undefined {
	for (let pai = elemento.parentElement; pai; pai = pai.parentElement) {
		if (/(auto|scroll)/.test(getComputedStyle(pai).overflowY)) return pai;
	}
	return undefined;
}

/** O `código em linha` do texto em que o evento aconteceu (o de dentro de um bloco de código não conta). */
function citacaoDe(alvo: EventTarget | null, raiz: HTMLElement): HTMLElement | undefined {
	if (!(alvo instanceof Element)) return undefined;
	const codigo = alvo.closest<HTMLElement>("code.codigo-em-linha");
	return codigo && raiz.contains(codigo) && !codigo.closest("pre") ? codigo : undefined;
}

/** Liga o destaque nas citações da explicação; `chave` muda quando o conteúdo ou o arranjo mudam. */
function useDestaqueDoCodigoCitado(raiz: RefObject<HTMLElement | null>, chave: string) {
	useEffect(() => {
		const elemento = raiz.current;
		if (!elemento) return;
		// As citações que casam com algo entram na ordem do Tab (foco simples, sem anunciar).
		const marcadas: HTMLElement[] = [];
		for (const codigo of elemento.querySelectorAll<HTMLElement>("code.codigo-em-linha")) {
			if (codigo.closest("pre") || !temCasamento(elemento, codigo.textContent ?? "")) continue;
			codigo.tabIndex = 0;
			codigo.classList.add("codigo-citado");
			marcadas.push(codigo);
		}

		let atual: HTMLElement | undefined;
		let apagar: (() => void) | undefined;
		const limpar = () => {
			apagar?.();
			apagar = undefined;
			atual = undefined;
		};
		const entrar = (evento: Event) => {
			const citacao = citacaoDe(evento.target, elemento);
			if (!citacao || citacao === atual) return;
			limpar();
			atual = citacao;
			apagar = destacar(elemento, citacao.textContent ?? "");
		};
		const sair = (evento: Event) => {
			if (!atual) return;
			const para = (evento as MouseEvent | FocusEvent).relatedTarget;
			if (para instanceof Node && atual.contains(para)) return;
			limpar();
		};
		elemento.addEventListener("mouseover", entrar);
		elemento.addEventListener("mouseout", sair);
		elemento.addEventListener("focusin", entrar);
		elemento.addEventListener("focusout", sair);
		return () => {
			elemento.removeEventListener("mouseover", entrar);
			elemento.removeEventListener("mouseout", sair);
			elemento.removeEventListener("focusin", entrar);
			elemento.removeEventListener("focusout", sair);
			limpar();
			for (const codigo of marcadas) {
				codigo.removeAttribute("tabindex");
				codigo.classList.remove("codigo-citado");
			}
		};
	}, [chave]);
}

const blocosDe = (raiz: HTMLElement) => raiz.querySelectorAll<HTMLElement>("pre.codigo__pre");
const valoresDe = (raiz: HTMLElement) => raiz.querySelectorAll<HTMLElement>(".vetor__valor, .matriz__valor");

function temCasamento(raiz: HTMLElement, trecho: string): boolean {
	for (const pre of blocosDe(raiz)) if (casarTrecho(trecho, pre.querySelector("code")?.textContent ?? "").length > 0) return true;
	for (const valor of valoresDe(raiz)) if (casaComValor(trecho, valor.textContent ?? "")) return true;
	return false;
}

/** Desenha os destaques do trecho na explicação; devolve quem os apaga. */
function destacar(raiz: HTMLElement, trecho: string): () => void {
	const camadas: HTMLElement[] = [];
	const marcados: HTMLElement[] = [];
	const lado = raiz.querySelector<HTMLElement>(".modulo__codigo-lado");
	const noLado: DOMRect[] = [];
	for (const pre of blocosDe(raiz)) {
		const codigo = pre.querySelector("code");
		if (!codigo) continue;
		const retangulos = casarTrecho(trecho, codigo.textContent ?? "").flatMap((casamento) => retangulosDe(codigo, casamento));
		if (retangulos.length === 0) continue;
		const caixa = pre.getBoundingClientRect();
		const escala = pre.offsetWidth > 0 ? caixa.width / pre.offsetWidth : 1;
		const camada = document.createElement("span");
		camada.className = "codigo__destaques";
		camada.setAttribute("aria-hidden", "true");
		for (const retangulo of retangulos) {
			const destaque = document.createElement("span");
			destaque.className = "codigo__destaque";
			destaque.style.left = `${(retangulo.left - caixa.left) / escala + pre.scrollLeft - pre.clientLeft - FOLGA_X}px`;
			destaque.style.top = `${(retangulo.top - caixa.top) / escala + pre.scrollTop - pre.clientTop - FOLGA_Y}px`;
			destaque.style.width = `${retangulo.width / escala + 2 * FOLGA_X}px`;
			destaque.style.height = `${retangulo.height / escala + 2 * FOLGA_Y}px`;
			camada.append(destaque);
		}
		pre.append(camada);
		camadas.push(camada);
		trazerParaVista(pre, retangulos, "horizontal");
		if (lado?.contains(pre)) noLado.push(...retangulos);
	}
	if (lado && noLado.length > 0) trazerParaVista(lado, noLado, "vertical");
	for (const valor of valoresDe(raiz)) {
		if (!casaComValor(trecho, valor.textContent ?? "")) continue;
		valor.classList.add(CLASSE_VALOR_DESTACADO);
		marcados.push(valor);
	}
	return () => {
		for (const camada of camadas) camada.remove();
		for (const valor of marcados) valor.classList.remove(CLASSE_VALOR_DESTACADO);
	};
}

/** Os retângulos (na tela) de um casamento dentro do code, um por linha. */
function retangulosDe(codigo: Element, { inicio, fim }: Casamento): DOMRect[] {
	const comeco = pontoDoTexto(codigo, inicio, false);
	const final = pontoDoTexto(codigo, fim, true);
	if (!comeco || !final) return [];
	const faixa = document.createRange();
	faixa.setStart(comeco[0], comeco[1]);
	faixa.setEnd(final[0], final[1]);
	// Os pedaços (um por nó de texto do destaque de sintaxe) da mesma linha viram um retângulo só.
	const linhas: DOMRect[] = [];
	for (const pedaco of faixa.getClientRects()) {
		if (pedaco.width < 0.5 || pedaco.height < 0.5) continue;
		const mesma = linhas.find((linha) => Math.abs(linha.top - pedaco.top) < 2);
		if (!mesma) {
			linhas.push(DOMRect.fromRect(pedaco));
			continue;
		}
		const esquerda = Math.min(mesma.left, pedaco.left);
		const direita = Math.max(mesma.right, pedaco.right);
		const topo = Math.min(mesma.top, pedaco.top);
		const base = Math.max(mesma.bottom, pedaco.bottom);
		linhas.splice(linhas.indexOf(mesma), 1, new DOMRect(esquerda, topo, direita - esquerda, base - topo));
	}
	return linhas;
}

/** O nó de texto e a posição dentro dele para a posição `alvo` do textContent; `fim` prefere o fim de um nó ao começo do próximo. */
function pontoDoTexto(raiz: Node, alvo: number, fim: boolean): [Text, number] | undefined {
	const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
	let antes = 0;
	for (let no = andador.nextNode() as Text | null; no; no = andador.nextNode() as Text | null) {
		const tamanho = no.data.length;
		if (fim ? alvo <= antes + tamanho : alvo < antes + tamanho) return [no, alvo - antes];
		antes += tamanho;
	}
	return undefined;
}

/** Rola o contêiner (só ele, não a página) até o primeiro casamento, se nenhum estiver à vista. */
function trazerParaVista(conteiner: HTMLElement, retangulos: readonly DOMRect[], sentido: "horizontal" | "vertical") {
	const caixa = conteiner.getBoundingClientRect();
	const escala = conteiner.offsetWidth > 0 ? caixa.width / conteiner.offsetWidth : 1;
	const comportamento: ScrollBehavior = semMovimento() ? "auto" : "smooth";
	if (sentido === "vertical") {
		if (conteiner.scrollHeight <= conteiner.clientHeight) return;
		if (retangulos.some((retangulo) => retangulo.top >= caixa.top && retangulo.bottom <= caixa.bottom)) return;
		const primeiro = retangulos[0]!;
		const delta = primeiro.top < caixa.top ? (primeiro.top - caixa.top) / escala - RESPIRO : (primeiro.bottom - caixa.bottom) / escala + RESPIRO;
		conteiner.scrollBy({ top: delta, behavior: comportamento });
		return;
	}
	if (conteiner.scrollWidth <= conteiner.clientWidth) return;
	if (retangulos.some((retangulo) => retangulo.left >= caixa.left && retangulo.right <= caixa.right)) return;
	// Na horizontal, se o casamento cabe com o código no começo, volta ao começo (os nomes do começo da linha ficam à vista).
	const primeiro = retangulos[0]!;
	const fimNoConteudo = (primeiro.right - caixa.left) / escala + conteiner.scrollLeft;
	const delta = primeiro.left < caixa.left ? (primeiro.left - caixa.left) / escala - RESPIRO : (primeiro.right - caixa.right) / escala + RESPIRO;
	const destino = fimNoConteudo + RESPIRO <= conteiner.clientWidth ? 0 : conteiner.scrollLeft + delta;
	conteiner.scrollTo({ left: destino, behavior: comportamento });
}
