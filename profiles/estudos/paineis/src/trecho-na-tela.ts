// O trecho na tela da mesa (parte C1; docs/mesa-parte-c.md, seções 3 e 4): capturar a
// âncora de uma seleção no DOM, achar um trecho no DOM da lição, rolar até ele e
// destacá-lo sem mexer no documento. A nota usa o mesmo destaque temporário, mas acha o
// trecho no documento do editor (destaque-nota.ts).
//
// O destaque da lição é o CSS Custom Highlight API (CSS.highlights, presente no Edge)
// sobre um Range nos nós de texto: nada no DOM muda. Sem a API, cai numa classe no
// bloco (fundo, sem mudar tamanho). Some sozinho em DURACAO_DESTAQUE_MS ou no próximo
// clique. Com movimento reduzido, a rolagem é instantânea e o fundo não anima.

import { semMovimento } from "@estudos/ui";
import { acharNoTexto, localizarNosSegmentos, type NivelAncora, type PedidoAncora, type Segmento } from "./ancora.ts";
import type { Ancora } from "./origem-mesa.ts";
import { ancoraDaSelecao } from "./selecao.ts";

/** Quanto o destaque fica na tela. */
export const DURACAO_DESTAQUE_MS = 3000;
/** O nome do destaque no registro do CSS (::highlight(mesa-destaque) no mesa.css). */
export const NOME_DESTAQUE = "mesa-destaque";
/** A classe da reserva sem a API (e do bloco na nota sem o trecho). */
export const CLASSE_DESTAQUE_BLOCO = "mesa-destaque-bloco";

/** Quanto texto em volta da seleção a captura lê (a âncora guarda até 40 caracteres). */
const LEITURA_CONTEXTO = 200;

/** Elementos que separam blocos de texto: entre dois deles o texto montado leva uma quebra de linha. */
const BLOCOS = "p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th,tr,table,section,article,header,footer,dt,dd,dl,figure,figcaption,details,summary";

const elementoDe = (no: Node): Element | null => (no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement);

/**
 * O texto de um elemento, montado dos nós de texto, com uma quebra entre blocos diferentes,
 * e de onde veio cada pedaço. Se há texto de estudo marcado ([data-texto-estudo], a lição),
 * só ele conta: rótulos, botões e respostas ficam de fora.
 */
export function textoComSegmentos(raiz: Element): { texto: string; segmentos: Segmento<Text>[] } {
	const estudo = raiz.matches("[data-texto-estudo]") || raiz.querySelector("[data-texto-estudo]") !== null;
	const andarilho = raiz.ownerDocument.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
	const segmentos: Segmento<Text>[] = [];
	let texto = "";
	let blocoAnterior: Element | null | undefined;
	for (let no = andarilho.nextNode(); no; no = andarilho.nextNode()) {
		const pai = no.parentElement;
		if (!pai || !no.nodeValue) continue;
		if (estudo && !pai.closest("[data-texto-estudo]")) continue;
		const bloco = pai.closest(BLOCOS);
		if (blocoAnterior !== undefined && bloco !== blocoAnterior) texto += "\n";
		blocoAnterior = bloco;
		segmentos.push({ no: no as Text, inicio: texto.length, fim: texto.length + no.nodeValue.length });
		texto += no.nodeValue;
	}
	return { texto, segmentos };
}

/** O índice de um ponto (nó e deslocamento) no texto montado, se o nó é um dos segmentos. */
function indiceDoPonto(segmentos: readonly Segmento<Text>[], no: Node, deslocamento: number): number | undefined {
	const segmento = segmentos.find((candidato) => candidato.no === no);
	return segmento ? segmento.inicio + Math.min(deslocamento, segmento.fim - segmento.inicio) : undefined;
}

/** O título (h1 a h6) dentro da raiz que está acima do nó (ou o contém). */
function tituloAcima(raiz: Element, no: Node): string | undefined {
	const titulos = [...raiz.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((titulo) => {
		const posicao = titulo.compareDocumentPosition(no);
		return Boolean(posicao & Node.DOCUMENT_POSITION_FOLLOWING) || Boolean(posicao & Node.DOCUMENT_POSITION_CONTAINED_BY) || titulo === no;
	});
	return titulos.at(-1)?.textContent ?? undefined;
}

/**
 * A âncora de uma seleção do DOM (docs/mesa-parte-c.md, seção 3). Na lição, o bloco é o
 * data-bloco mais próximo (com a versão do data-versao) e o contexto é lido nele; fora de um
 * bloco (a nota só leitura), o bloco é o título da seção acima e o contexto vem da raiz.
 */
export function ancoraDoRange(range: Range, raiz: Element): Ancora {
	const inicio = elementoDe(range.startContainer);
	const blocoEl = inicio?.closest<HTMLElement>("[data-bloco]") ?? undefined;
	const conteiner = blocoEl ?? raiz;
	const { texto, segmentos } = textoComSegmentos(conteiner);
	const de = indiceDoPonto(segmentos, range.startContainer, range.startOffset);
	const ate = indiceDoPonto(segmentos, range.endContainer, range.endOffset);
	let antes: string;
	let depois: string;
	if (de !== undefined && ate !== undefined) {
		antes = texto.slice(Math.max(0, de - LEITURA_CONTEXTO), de);
		depois = texto.slice(ate, ate + LEITURA_CONTEXTO);
	} else {
		// Começo ou fim fora de um nó de texto (seleção de um elemento inteiro): o texto corrido do DOM.
		const antesRange = range.cloneRange();
		antesRange.setStart(conteiner, 0);
		antesRange.setEnd(range.startContainer, range.startOffset);
		const depoisRange = range.cloneRange();
		depoisRange.setStart(range.endContainer, range.endOffset);
		depoisRange.setEnd(conteiner, conteiner.childNodes.length);
		antes = antesRange.toString().slice(-LEITURA_CONTEXTO);
		depois = depoisRange.toString().slice(0, LEITURA_CONTEXTO);
	}
	const versao = blocoEl?.dataset.versao !== undefined ? Number(blocoEl.dataset.versao) : undefined;
	return ancoraDaSelecao({
		bloco: blocoEl ? blocoEl.dataset.bloco : tituloAcima(raiz, range.startContainer),
		...(versao !== undefined && Number.isFinite(versao) ? { versao } : {}),
		antes,
		depois,
	});
}

/** Rola o elemento que rola até o retângulo: centrado (um trecho) ou no topo, com folga (um bloco). */
export function rolarAte(rolavel: HTMLElement, alvo: { top: number; height: number }, suave: boolean, alinhar: "centro" | "topo" = "centro"): void {
	const caixa = rolavel.getBoundingClientRect();
	const relativo = alvo.top - caixa.top + rolavel.scrollTop;
	const topo = Math.max(0, alinhar === "centro" ? relativo - rolavel.clientHeight / 2 + alvo.height / 2 : relativo - 24);
	const comportamento: ScrollBehavior = suave && !semMovimento() ? "smooth" : "auto";
	if (typeof rolavel.scrollTo === "function") rolavel.scrollTo({ top: topo, behavior: comportamento });
	else rolavel.scrollTop = topo;
}

let tirarAtual: (() => void) | undefined;

/**
 * Mostra um destaque por DURACAO_DESTAQUE_MS ou até o próximo clique (o que vier antes).
 * Há um destaque por vez: um novo tira o anterior. `limpar` desfaz o que foi posto.
 */
export function destaqueTemporario(limpar: () => void, duracao = DURACAO_DESTAQUE_MS): () => void {
	tirarAtual?.();
	let feito = false;
	let temporizador: ReturnType<typeof setTimeout> | undefined;
	const tirar = () => {
		if (feito) return;
		feito = true;
		clearTimeout(temporizador);
		document.removeEventListener("pointerdown", tirar, true);
		if (tirarAtual === tirar) tirarAtual = undefined;
		limpar();
	};
	temporizador = setTimeout(tirar, duracao);
	document.addEventListener("pointerdown", tirar, true);
	tirarAtual = tirar;
	return tirar;
}

/** A classe de reserva num elemento, por um tempo (sem a API de destaque, ou o bloco inteiro). */
export function destacarElemento(elemento: Element): void {
	elemento.classList.add(CLASSE_DESTAQUE_BLOCO);
	if (semMovimento()) elemento.classList.add(`${CLASSE_DESTAQUE_BLOCO}--parado`);
	destaqueTemporario(() => elemento.classList.remove(CLASSE_DESTAQUE_BLOCO, `${CLASSE_DESTAQUE_BLOCO}--parado`));
}

/** Destaca o Range com o CSS Custom Highlight API; sem ela, o bloco em volta ganha a classe de reserva. */
export function destacarRange(range: Range): void {
	const api = globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...ranges: Range[]) => unknown };
	const registro = api.CSS?.highlights;
	const Marca = api.Highlight;
	if (registro && Marca) {
		const marca = new Marca(range);
		registro.set(NOME_DESTAQUE, marca);
		destaqueTemporario(() => {
			if (registro.get(NOME_DESTAQUE) === marca) registro.delete(NOME_DESTAQUE);
		});
		return;
	}
	const comum = elementoDe(range.commonAncestorContainer);
	const alvo = comum?.closest("[data-bloco]") ?? comum;
	if (alvo) destacarElemento(alvo);
}

/**
 * Acha o trecho do pedido na lição desenhada (`conteudo`, o artigo), rola o `rolavel` até ele
 * e destaca (ou só rola). Ordem: no bloco da âncora, depois na lição inteira, o texto exato
 * (com o contexto, se houver); senão o bloco (mesmo com outra versão); senão o começo.
 */
export function mostrarNoDom(conteudo: Element, pedido: PedidoAncora, opcoes: { rolavel: HTMLElement | null; suave: boolean }): NivelAncora {
	const { rolavel, suave } = opcoes;
	const idBloco = pedido.ancora?.bloco;
	const blocoEl = idBloco ? [...conteudo.querySelectorAll<HTMLElement>("[data-bloco]")].find((elemento) => elemento.dataset.bloco === idBloco) : undefined;
	if (pedido.trecho) {
		for (const escopo of blocoEl ? [blocoEl, conteudo] : [conteudo]) {
			const { texto, segmentos } = textoComSegmentos(escopo);
			const achado = acharNoTexto(texto, pedido.trecho, pedido.ancora);
			const pontos = achado ? localizarNosSegmentos(segmentos, achado.inicio, achado.fim) : undefined;
			if (!achado || !pontos) continue;
			const range = conteudo.ownerDocument.createRange();
			range.setStart(pontos.de.no, pontos.de.deslocamento);
			range.setEnd(pontos.ate.no, pontos.ate.deslocamento);
			if (rolavel) rolarAte(rolavel, range.getBoundingClientRect(), suave, pedido.soRolar ? "topo" : "centro");
			if (!pedido.soRolar) destacarRange(range);
			return achado.nivel;
		}
	}
	if (blocoEl) {
		if (rolavel) rolarAte(rolavel, blocoEl.getBoundingClientRect(), suave, "topo");
		return "bloco";
	}
	if (rolavel) rolarAte(rolavel, { top: rolavel.getBoundingClientRect().top - rolavel.scrollTop, height: 0 }, suave, "topo");
	return "inicio";
}
