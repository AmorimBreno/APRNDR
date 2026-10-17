// A reação do quiz logo depois de conferir (só ao vivo, não ao rever):
// acerto carimba um 完 girando (o carimbo do professor do design system) e
// solta confete de papel nas cores do tema, com gravidade; erro dá um tremido
// nas alternativas; "Não sei" dá um balanço curto. Com reduzir movimento, o
// carimbo aparece parado e não há confete nem tremido.

import { escalaDaTela } from "@estudos/ui";
import { animate, motion, useReducedMotion } from "motion/react";
import { type Ref, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CORES = ["var(--amber)", "var(--brick)", "var(--sage)", "var(--moss)", "var(--cream)", "var(--steel)", "var(--paper)"];
const PECAS = 28;

interface Peca {
	cor: string;
	x: number;
	subida: number;
	queda: number;
	giro: number;
	largura: number;
	altura: number;
	atraso: number;
	duracao: number;
}

function sortearPecas(): Peca[] {
	return Array.from({ length: PECAS }, (_, indice) => {
		const angulo = (indice / PECAS) * Math.PI - Math.PI;
		const forca = 90 + Math.random() * 120;
		return {
			cor: CORES[indice % CORES.length]!,
			x: Math.cos(angulo) * forca * (0.6 + Math.random() * 0.6),
			subida: Math.sin(angulo) * forca * (0.5 + Math.random() * 0.5),
			queda: 140 + Math.random() * 160,
			giro: (Math.random() - 0.5) * 720,
			largura: 5 + Math.random() * 6,
			altura: 8 + Math.random() * 8,
			atraso: Math.random() * 0.08,
			duracao: 1.1 + Math.random() * 0.5,
		};
	});
}

/**
 * Confete de papel: sobe, abre e cai com gravidade (a subida é rápida e a
 * queda, mais lenta). Voa numa camada fixa sobre a página, ancorada no
 * elemento `ancora` (o carimbo): dentro do corpo do modal, as peças criavam
 * rolagem. A camada some quando a última peça termina.
 */
export function Confete({ ancora }: { ancora: RefObject<HTMLElement | null> }) {
	const pecas = useMemo(sortearPecas, []);
	const [origem, setOrigem] = useState<{ left: number; top: number }>();
	const [acabou, setAcabou] = useState(false);
	useLayoutEffect(() => {
		const elemento = ancora.current;
		if (!elemento) return;
		// O body tem zoom (o app roda em 90%): a camada fixa usa px de CSS.
		const sonda = elemento.getBoundingClientRect();
		const escala = escalaDaTela();
		setOrigem({ left: (sonda.left + sonda.width / 2) / escala, top: (sonda.top + sonda.height / 2) / escala });
		const fim = setTimeout(() => setAcabou(true), 2000);
		return () => clearTimeout(fim);
	}, [ancora]);
	if (!origem || acabou) return null;
	return createPortal(
		<span className="confete" style={{ left: origem.left, top: origem.top }} aria-hidden="true">
			{pecas.map((peca, indice) => (
				<motion.span
					key={indice}
					className="confete__peca"
					style={{ background: peca.cor, width: peca.largura, height: peca.altura }}
					initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
					animate={{ x: peca.x, y: [0, peca.subida, peca.queda], rotate: peca.giro, opacity: [1, 1, 0] }}
					transition={{ duration: peca.duracao, delay: peca.atraso, times: [0, 0.3, 1], ease: ["easeOut", "easeIn"] }}
				/>
			))}
		</span>,
		document.body,
	);
}

/** O carimbo 完: cai girando e bate (mola viva), como o carimbo do professor. */
export function Carimbo({ ref }: { ref?: Ref<HTMLSpanElement> }) {
	const reduzir = useReducedMotion();
	return (
		<motion.span
			ref={ref}
			className="carimbo"
			lang="ja"
			aria-hidden="true"
			initial={reduzir ? { rotate: -12 } : { scale: 2.6, rotate: -48, opacity: 0 }}
			animate={{ scale: 1, rotate: -12, opacity: 1 }}
			transition={{ type: "spring", stiffness: 420, damping: 13, mass: 0.8 }}
		>
			完
		</motion.span>
	);
}

/** Tremido no elemento quando ele nasce (resposta errada). */
export function useTremido<T extends HTMLElement>(ligado: boolean) {
	const alvo = useRef<T>(null);
	const reduzir = useReducedMotion();
	useEffect(() => {
		if (!ligado || reduzir || !alvo.current) return;
		void animate(alvo.current, { x: [0, -10, 9, -7, 5, -2, 0] }, { duration: 0.5, ease: "easeOut", delay: 0.1 });
	}, [ligado, reduzir]);
	return alvo;
}
