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

/**
 * Como um retângulo da tela está, para a casca começar ou terminar igual a ele:
 * posição, cantos, fundo, borda e uma faixa no topo (o cabeçalho colorido do
 * modal; no botão, a faixa cobre tudo com a cor do próprio botão).
 */
export interface EstadoCasca {
	rect: DOMRect;
	raio: number;
	fundo: string;
	borda: string;
	larguraBorda: number;
	/** Altura da faixa do topo, em px da tela. */
	faixa: number;
	corFaixa: string;
}

function transparente(cor: string): boolean {
	return cor === "transparent" || /rgba\([^)]*,\s*0\)$/.test(cor);
}

/** O fundo que se vê no elemento: o dele ou, se for transparente, o do primeiro ancestral com fundo. */
function fundoVisivel(elemento: Element): string {
	for (let atual: Element | null = elemento; atual; atual = atual.parentElement) {
		const cor = getComputedStyle(atual).backgroundColor;
		if (!transparente(cor)) return cor;
	}
	return corDoToken("--surface-ground");
}

/** O estado de um elemento comum (o botão do pedido): a faixa cobre tudo com o fundo dele. */
export function estadoDoElemento(elemento: HTMLElement): EstadoCasca {
	const estilo = getComputedStyle(elemento);
	const rect = elemento.getBoundingClientRect();
	const fundo = fundoVisivel(elemento);
	const larguraBorda = parseFloat(estilo.borderTopWidth) || 0;
	return {
		rect,
		raio: parseFloat(estilo.borderTopLeftRadius) || 0,
		fundo,
		borda: larguraBorda > 0 ? estilo.borderTopColor : fundo,
		larguraBorda,
		faixa: rect.height,
		corFaixa: fundo,
	};
}

/** O estado do diálogo do modal: o fundo do corpo, o contorno fino e a faixa do cabeçalho. */
export function estadoDoDialogo(dialogo: HTMLElement): EstadoCasca {
	const estilo = getComputedStyle(dialogo);
	const cabecalho = dialogo.querySelector<HTMLElement>(".ap-modal__head");
	return {
		rect: dialogo.getBoundingClientRect(),
		raio: parseFloat(estilo.borderTopLeftRadius) || 0,
		fundo: estilo.backgroundColor,
		borda: corDoToken("--line"),
		larguraBorda: 1,
		faixa: cabecalho?.getBoundingClientRect().height ?? 0,
		corFaixa: cabecalho ? getComputedStyle(cabecalho).backgroundColor : estilo.backgroundColor,
	};
}

/** O valor de um token de cor do tema ("--amber" vira "#e0a15e"), para a Motion interpolar. */
function corDoToken(token: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "transparent";
}

/**
 * Uma casca sai do estado `de` e vira o estado `para` (posição, tamanho, cantos,
 * fundo, borda e a faixa do topo), com mola. `viva`: com um pouco de passagem
 * (abrir); sem ela, chega e para (fechar). Resolve quando ela chega.
 */
export function morfar(de: EstadoCasca, para: EstadoCasca, viva: boolean): { pousou: Promise<void>; elemento: HTMLElement; cancelar(): void } {
	const escala = escalaDaTela();
	const px = (valor: number) => valor / escala;
	const casca = document.createElement("div");
	casca.className = "casca-modal";
	const faixa = document.createElement("div");
	faixa.className = "casca-modal__faixa";
	casca.appendChild(faixa);
	Object.assign(casca.style, {
		left: `${px(de.rect.left)}px`,
		top: `${px(de.rect.top)}px`,
		width: `${px(de.rect.width)}px`,
		height: `${px(de.rect.height)}px`,
		borderRadius: `${de.raio}px`,
		backgroundColor: de.fundo,
		borderColor: de.borda,
		borderWidth: `${de.larguraBorda}px`,
	});
	Object.assign(faixa.style, { height: `${px(de.faixa)}px`, backgroundColor: de.corFaixa });
	document.body.appendChild(casca);
	// restDelta: termina quando está a 1px do destino, sem esperar a mola assentar de vez.
	const mola = viva
		? { type: "spring" as const, stiffness: 340, damping: 28, mass: 0.85, restDelta: 1, restSpeed: 30 }
		: { type: "spring" as const, stiffness: 480, damping: 44, mass: 0.8, restDelta: 1, restSpeed: 30 };
	const animacoes = [
		animate(
			casca,
			{
				left: px(para.rect.left),
				top: px(para.rect.top),
				width: px(para.rect.width),
				height: px(para.rect.height),
				borderRadius: para.raio,
				backgroundColor: para.fundo,
				borderColor: para.borda,
				borderWidth: para.larguraBorda,
			},
			mola,
		),
		animate(faixa, { height: px(para.faixa), backgroundColor: para.corFaixa }, mola),
	];
	return {
		pousou: Promise.all(animacoes.map((animacao) => animacao.then(() => undefined))).then(() => undefined),
		elemento: casca,
		cancelar: () => {
			for (const animacao of animacoes) animacao.stop();
			casca.remove();
		},
	};
}
