// Faixa escura à esquerda das telas de faixa e folha (menu-rail do design
// system): o nome do app, uma linha de onde estou, o ornamento e um pé livre.
// Usada pela tela de carregamento e pelas telas iniciais dos perfis (os
// cadernos do perfil de estudos). Estilos em estilo.css (.tela, .faixa, .folha).
//
// `bandeira`: a faixa entra como uma bandeira descendo de cima e, perto do
// fim, os elementos de dentro aparecem de cima para baixo, um depois do outro.
// `sair()` (pela ref) faz o contrário: os elementos somem de baixo para cima
// enquanto a faixa sobe; quem chama espera e só então troca de tela.

import { Ornament, type OrnamentGlyph, Wordmark } from "@estudos/design-system";
import { animate, stagger } from "motion/react";
import { forwardRef, type ReactNode, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { semMovimento } from "./movimento.ts";

export interface PropsFaixaMarca {
	/** Linha de onde estou, abaixo do nome (overline). */
	legenda: ReactNode;
	/** Um ornamento por tela (design-system/README.md, Ornamento). */
	glifo: OrnamentGlyph;
	/** Entrar e sair como bandeira (ver o topo do arquivo). */
	bandeira?: boolean;
	children?: ReactNode;
}

export interface ControleFaixaMarca {
	/** Recolhe a bandeira (os elementos somem de baixo para cima e a faixa sobe). */
	sair(): Promise<void>;
}

const RAIO = "32px";
const ENROLADA = `inset(0% 0% 100% 0% round ${RAIO})`;
const ABERTA = `inset(0% 0% 0% 0% round ${RAIO})`;
/** Desce rápido e assenta sem passar (como pano caindo e esticando). */
const DESCER = [0.22, 1, 0.36, 1] as const;
/** Sobe acelerando (puxada de baixo para cima). */
const SUBIR = [0.64, 0, 0.78, 0] as const;

/** Os elementos de dentro, na ordem de cima para baixo. */
function elementosDa(faixa: HTMLElement): HTMLElement[] {
	return [...faixa.querySelectorAll<HTMLElement>(".faixa__topo > *, .faixa__ornamento, .faixa__pe > *")];
}

export const FaixaMarca = forwardRef<ControleFaixaMarca, PropsFaixaMarca>(function FaixaMarca({ legenda, glifo, bandeira = false, children }, ref) {
	const faixa = useRef<HTMLElement>(null);

	// Entrada: antes de pintar, a faixa está enrolada e os elementos, escondidos.
	useLayoutEffect(() => {
		const elemento = faixa.current;
		if (!bandeira || !elemento || semMovimento()) return;
		const itens = elementosDa(elemento);
		elemento.style.clipPath = ENROLADA;
		for (const item of itens) item.style.opacity = "0";
		const descer = animate(elemento, { clipPath: [ENROLADA, ABERTA] }, { duration: 0.6, ease: DESCER });
		// Perto do fim da descida, os elementos aparecem de cima para baixo.
		const aparecer = animate(
			itens,
			{ opacity: [0, 1], y: [-12, 0] },
			{ type: "spring", stiffness: 420, damping: 32, delay: stagger(0.07, { startDelay: 0.34 }) },
		);
		return () => {
			descer.stop();
			aparecer.stop();
			elemento.style.clipPath = "";
			for (const item of itens) item.style.opacity = "";
		};
	}, [bandeira]);

	useImperativeHandle(
		ref,
		() => ({
			sair: async () => {
				const elemento = faixa.current;
				if (!elemento || semMovimento()) return;
				const itens = elementosDa(elemento);
				// Os elementos somem de baixo para cima; a faixa começa a subir logo depois e os alcança.
				const sumir = animate(itens, { opacity: 0, y: -10 }, { duration: 0.16, ease: "easeIn", delay: stagger(0.045, { from: "last" }) });
				const subir = animate(elemento, { clipPath: ENROLADA }, { duration: 0.42, ease: SUBIR, delay: 0.12 });
				await Promise.all([sumir, subir]);
			},
		}),
		[],
	);

	return (
		<aside ref={faixa} className="faixa">
			<div className="faixa__topo">
				<Wordmark size={40} />
				<span className="overline">{legenda}</span>
			</div>
			<Ornament glyph={glifo} className="faixa__ornamento" />
			<div className="faixa__pe">{children}</div>
		</aside>
	);
});
