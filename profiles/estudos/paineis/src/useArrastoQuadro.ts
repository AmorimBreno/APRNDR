// O arrasto dos cartões do quadro (QuadroTarefas.tsx), com pointer events e sem
// dependência: o mouse (ou a caneta) desce num cartão, passa de uns poucos pixels
// e o arrasto começa. Aí o hook acompanha o ponteiro e diz, a cada movimento, a
// coluna sob ele e o lugar entre os cartões dela (colunaNoPonto e indiceDeSoltar,
// quadro-tarefas.ts); a tela desenha o cartão que segue o ponteiro e a linha do
// lugar de soltar. Soltar chama `soltar(id, coluna, indice)` (o lugar entre os
// cartões visíveis, sem o arrastado; a tela transforma na posição do quadro
// inteiro). Esc cancela. Perto da borda do quadro ele rola sozinho, para as
// colunas que não cabem.
//
// A tela marca as colunas com data-coluna="id" e os cartões com data-cartao="id"
// (o lugar é medido no DOM). O clique que vem logo depois de soltar não deve abrir
// o cartão: `cliqueDoArrasto()` diz se é o caso.

import { type PointerEvent as EventoDoPonteiro, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { colunaNoPonto, indiceDeSoltar, velocidadeDaRolagem } from "./quadro-tarefas.ts";

/** Quantos pixels o ponteiro anda antes de virar um arrasto (abaixo disso é um clique). */
const LIMITE_DO_ARRASTO = 5;

export interface AlvoDoArrasto {
	coluna: string;
	/** O lugar entre os cartões visíveis da coluna, sem o arrastado (0 = antes do primeiro). */
	indice: number;
}

export interface EstadoDoArrasto {
	/** O id da tarefa. */
	id: string;
	/** Onde está o ponteiro (viewport). */
	x: number;
	y: number;
	/** Onde o ponteiro pegou o cartão, a partir do canto dele. */
	dx: number;
	dy: number;
	/** O tamanho do cartão. */
	largura: number;
	altura: number;
	alvo?: AlvoDoArrasto;
}

export interface OpcoesDoArrasto {
	/** O elemento que rola e tem as colunas. */
	quadro: RefObject<HTMLElement | null>;
	/** Soltou com um alvo. */
	soltar(id: string, alvo: AlvoDoArrasto): void;
}

/** O alvo sob o ponteiro: a coluna mais perto na horizontal e o lugar entre os cartões dela (sem o arrastado). */
export function acharAlvo(quadro: HTMLElement, id: string, x: number, y: number): AlvoDoArrasto | undefined {
	const colunas = Array.from(quadro.querySelectorAll<HTMLElement>("[data-coluna]"));
	const faixas = colunas.map((elemento) => {
		const caixa = elemento.getBoundingClientRect();
		return { id: elemento.dataset.coluna!, esquerda: caixa.left, direita: caixa.right };
	});
	const coluna = colunaNoPonto(faixas, x);
	const elemento = colunas.find((item) => item.dataset.coluna === coluna);
	if (!coluna || !elemento) return undefined;
	const centros = Array.from(elemento.querySelectorAll<HTMLElement>("[data-cartao]"))
		.filter((cartao) => cartao.dataset.cartao !== id)
		.map((cartao) => {
			const caixa = cartao.getBoundingClientRect();
			return caixa.top + caixa.height / 2;
		});
	return { coluna, indice: indiceDeSoltar(centros, y) };
}

export function useArrastoQuadro(opcoes: OpcoesDoArrasto) {
	const [arrasto, setArrasto] = useState<EstadoDoArrasto | undefined>(undefined);
	const limpar = useRef<(() => void) | undefined>(undefined);
	const ignorarClique = useRef(false);
	const ultimas = useRef(opcoes);
	ultimas.current = opcoes;
	useEffect(() => () => limpar.current?.(), []);

	/** O pointerdown do cartão: guarda o começo e só vira arrasto quando o ponteiro anda. */
	const iniciar = useCallback((evento: EventoDoPonteiro<HTMLElement>, id: string) => {
		if (evento.button !== 0 || !evento.isPrimary) return;
		limpar.current?.();
		const caixa = evento.currentTarget.getBoundingClientRect();
		const comeco = { x: evento.clientX, y: evento.clientY };
		const ponteiro = { x: evento.clientX, y: evento.clientY };
		let atual: EstadoDoArrasto | undefined;
		let quadro = 0;

		const atualizar = () => {
			const area = ultimas.current.quadro.current;
			if (!atual || !area) return;
			const alvo = acharAlvo(area, id, ponteiro.x, ponteiro.y);
			const { alvo: _antigo, ...resto } = atual;
			atual = { ...resto, x: ponteiro.x, y: ponteiro.y, ...(alvo ? { alvo } : {}) };
			setArrasto(atual);
		};
		// Perto da borda do quadro ele rola sozinho; o alvo é medido de novo depois de rolar.
		const rolar = () => {
			quadro = requestAnimationFrame(rolar);
			const area = ultimas.current.quadro.current;
			if (!atual || !area) return;
			const bordas = area.getBoundingClientRect();
			const horizontal = velocidadeDaRolagem(ponteiro.x, bordas.left, bordas.right);
			const vertical = velocidadeDaRolagem(ponteiro.y, bordas.top, bordas.bottom);
			if (!horizontal && !vertical) return;
			const antesX = area.scrollLeft;
			const antesY = area.scrollTop;
			area.scrollBy(horizontal, vertical);
			if (area.scrollLeft !== antesX || area.scrollTop !== antesY) atualizar();
		};

		const terminar = () => {
			cancelAnimationFrame(quadro);
			document.removeEventListener("pointermove", mover);
			document.removeEventListener("pointerup", soltar);
			document.removeEventListener("pointercancel", cancelar);
			document.removeEventListener("keydown", tecla, true);
			limpar.current = undefined;
			setArrasto(undefined);
		};
		const mover = (outro: PointerEvent) => {
			if (outro.pointerId !== evento.pointerId) return;
			ponteiro.x = outro.clientX;
			ponteiro.y = outro.clientY;
			if (!atual) {
				if (Math.hypot(ponteiro.x - comeco.x, ponteiro.y - comeco.y) < LIMITE_DO_ARRASTO) return;
				atual = { id, x: ponteiro.x, y: ponteiro.y, dx: comeco.x - caixa.left, dy: comeco.y - caixa.top, largura: caixa.width, altura: caixa.height };
				ignorarClique.current = true;
				quadro = requestAnimationFrame(rolar);
			}
			atualizar();
		};
		const soltar = (outro: PointerEvent) => {
			if (outro.pointerId !== evento.pointerId) return;
			const alvo = atual?.alvo;
			const arrastou = atual !== undefined;
			terminar();
			if (arrastou) {
				// O clique que o navegador manda logo depois de soltar não abre o cartão.
				setTimeout(() => {
					ignorarClique.current = false;
				}, 0);
				if (alvo) ultimas.current.soltar(id, alvo);
			}
		};
		const cancelar = (outro: PointerEvent) => {
			if (outro.pointerId !== evento.pointerId) return;
			terminar();
			setTimeout(() => {
				ignorarClique.current = false;
			}, 0);
		};
		const tecla = (outra: KeyboardEvent) => {
			if (outra.key !== "Escape" || !atual) return;
			outra.preventDefault();
			outra.stopPropagation();
			atual = undefined;
			terminar();
			// O ponteiro ainda está embaixo: o clique do fim dele não abre o cartão.
			ignorarClique.current = true;
			document.addEventListener(
				"pointerup",
				() => {
					setTimeout(() => {
						ignorarClique.current = false;
					}, 0);
				},
				{ once: true },
			);
		};

		document.addEventListener("pointermove", mover);
		document.addEventListener("pointerup", soltar);
		document.addEventListener("pointercancel", cancelar);
		document.addEventListener("keydown", tecla, true);
		limpar.current = terminar;
	}, []);

	/** O clique que vem do fim de um arrasto não deve abrir o cartão. */
	const cliqueDoArrasto = useCallback(() => ignorarClique.current, []);

	return { arrasto, iniciar, cliqueDoArrasto };
}
