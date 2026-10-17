// Utilitários de movimento do app (design-system/ESTUDOS.md: animação com
// física, e tudo para com "reduzir movimento").
//
// - comTransicao: muda o estado dentro de uma View Transition do navegador,
//   para dois elementos com o mesmo view-transition-name se transformarem um
//   no outro (o botão do pedido virando o modal, a faixa virando a barra).
// - iniciarVoo: a mensagem que você enviou sai do campo como um "fantasma" e
//   pousa na nota da conversa quando ela aparece (o eco vem do servidor).
// - morfar: uma "casca" de cor se transforma de um retângulo em outro (o botão
//   do pedido virando o modal e voltando), animando posição e tamanho de
//   verdade, sem escalar o conteúdo.

import { animate } from "motion/react";
import { flushSync } from "react-dom";

/** true se o sistema pede menos movimento. */
export function semMovimento(): boolean {
	return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type DocumentoComTransicao = Document & { startViewTransition?: (atualizar: () => void) => { finished: Promise<void> } };

/**
 * Aplica `atualizar` numa View Transition (se o navegador tiver e o sistema
 * não pedir menos movimento). `antes` roda no estado velho (dar nomes), e
 * `atualizar`, já no novo (trocar os nomes de lugar).
 */
export function comTransicao(atualizar: () => void, opcoes: { antes?: () => void; classe?: string } = {}): Promise<void> {
	const documento = document as DocumentoComTransicao;
	if (!documento.startViewTransition || semMovimento()) {
		atualizar();
		return Promise.resolve();
	}
	opcoes.antes?.();
	if (opcoes.classe) document.documentElement.classList.add(opcoes.classe);
	const transicao = documento.startViewTransition(() => flushSync(atualizar));
	return transicao.finished
		.catch(() => {})
		.finally(() => {
			if (opcoes.classe) document.documentElement.classList.remove(opcoes.classe);
		});
}

/**
 * Fator para converter um retângulo da tela (getBoundingClientRect) em
 * coordenadas CSS de um elemento fixo dentro do body com zoom (o app roda em
 * 90%): mede uma sonda de 100px.
 */
export function escalaDaTela(): number {
	const sonda = document.createElement("div");
	sonda.style.cssText = "position:fixed;left:0;top:0;width:100px;height:1px;visibility:hidden;pointer-events:none";
	document.body.appendChild(sonda);
	const largura = sonda.getBoundingClientRect().width;
	sonda.remove();
	return largura > 0 ? largura / 100 : 1;
}

export interface Voo {
	texto: string;
	/** Leva o fantasma até o elemento da nota e o mostra no fim. */
	pousar(destino: HTMLElement): void;
	/** Some com o fantasma (a nota não veio, ou a mensagem foi para a fila). */
	cancelar(): void;
}

/**
 * Cria o fantasma da mensagem sobre o campo e o faz subir um pouco, à espera
 * da nota. Sem movimento, devolve um voo que não faz nada.
 */
export function iniciarVoo(texto: string, origem: DOMRect): Voo {
	if (semMovimento() || origem.width === 0) return { texto, pousar: (destino) => (destino.style.opacity = ""), cancelar: () => {} };
	const escala = escalaDaTela();
	const fantasma = document.createElement("div");
	fantasma.className = "voo-mensagem body-lg";
	fantasma.textContent = texto;
	Object.assign(fantasma.style, {
		left: `${origem.left / escala}px`,
		top: `${origem.top / escala}px`,
		width: `${origem.width / escala}px`,
	});
	document.body.appendChild(fantasma);
	let acabou = false;
	const subir = animate(fantasma, { y: -18, scale: 0.98 }, { type: "spring", stiffness: 300, damping: 18 });
	const limite = setTimeout(() => cancelar(), 6000);

	function cancelar() {
		if (acabou) return;
		acabou = true;
		clearTimeout(limite);
		subir.stop();
		void animate(fantasma, { opacity: 0, y: -40, scale: 0.9 }, { duration: 0.25, ease: "easeIn" }).then(() => fantasma.remove());
	}

	function pousar(destino: HTMLElement) {
		if (acabou) {
			destino.style.opacity = "";
			return;
		}
		acabou = true;
		clearTimeout(limite);
		subir.stop();
		const de = fantasma.getBoundingClientRect();
		const para = destino.getBoundingClientRect();
		// O fantasma já subiu um pouco: o y final soma o deslocamento atual.
		const yAtual = Number(/translateY\((-?[\d.]+)px\)/.exec(fantasma.style.transform)?.[1] ?? 0);
		const dx = (para.left - de.left) / escala;
		const dy = (para.top - de.top) / escala;
		fantasma.classList.add("voo-mensagem--pousando");
		void animate(
			fantasma,
			{ x: dx, y: yAtual + dy, width: para.width / escala, rotate: -0.6, scale: 1 },
			{ type: "spring", stiffness: 260, damping: 22, mass: 0.9 },
		).then(() => {
			destino.style.opacity = "";
			fantasma.remove();
			// A nota "cola": achata e volta, como um post-it batendo na folha.
			void animate(destino, { scaleY: [0.9, 1.04, 1], scaleX: [1.04, 0.99, 1] }, { duration: 0.42, ease: "easeOut" });
		});
	}

	return { texto, pousar, cancelar };
}

export interface OpcoesMorfar {
	/** Cor da casca no começo e no fim (nomes de tokens do tema, como "--amber"). */
	corDe: string;
	corPara: string;
	raioDe: number;
	raioPara: number;
	/** true: mola com um pouco de passagem (abrir); false: chega sem passar (fechar). */
	viva: boolean;
}

/** O valor de um token de cor do tema ("--amber" vira "#e0a15e"), para a Motion interpolar. */
function corDoToken(token: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "transparent";
}

/**
 * Uma casca de cor sai do retângulo `de` e vira o retângulo `para` (posição,
 * tamanho e cantos), com mola; some no fim. Resolve quando ela pousa.
 */
export function morfar(de: DOMRect, para: DOMRect, opcoes: OpcoesMorfar): { pousou: Promise<void>; cancelar(): void } {
	const escala = escalaDaTela();
	const casca = document.createElement("div");
	casca.className = "casca-modal";
	Object.assign(casca.style, {
		left: `${de.left / escala}px`,
		top: `${de.top / escala}px`,
		width: `${de.width / escala}px`,
		height: `${de.height / escala}px`,
		borderRadius: `${opcoes.raioDe}px`,
		backgroundColor: corDoToken(opcoes.corDe),
	});
	document.body.appendChild(casca);
	// restDelta: termina quando está a 2px do destino, sem esperar a mola assentar de vez.
	const mola = opcoes.viva
		? { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.85, restDelta: 2, restSpeed: 40 }
		: { type: "spring" as const, stiffness: 460, damping: 42, mass: 0.8, restDelta: 2, restSpeed: 40 };
	const animacao = animate(
		casca,
		{
			left: para.left / escala,
			top: para.top / escala,
			width: para.width / escala,
			height: para.height / escala,
			borderRadius: opcoes.raioPara,
			backgroundColor: corDoToken(opcoes.corPara),
		},
		mola,
	);
	return {
		pousou: animacao.then(() => undefined),
		cancelar: () => {
			animacao.stop();
			casca.remove();
		},
	};
}

/** Remove a casca que pousou (depois de o elemento de verdade aparecer por cima). */
export function removerCascas(): void {
	for (const casca of document.querySelectorAll(".casca-modal")) {
		void animate(casca, { opacity: 0 }, { duration: 0.12 }).then(() => casca.remove());
	}
}
