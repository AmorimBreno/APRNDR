// A reação do quiz logo depois de conferir (só ao vivo, não ao rever):
// acerto carimba um 完 girando (o carimbo do professor do design system) e
// solta confete de papel nas cores do tema, com gravidade; erro dá um tremido
// nas alternativas; "Não sei" dá um balanço curto. Com reduzir movimento, o
// carimbo aparece parado e não há confete nem tremido.

import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";

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

/** Confete de papel: sobe, abre e cai com gravidade (a subida é rápida e a queda, mais lenta). */
export function Confete() {
	const pecas = useMemo(sortearPecas, []);
	return (
		<span className="confete" aria-hidden="true">
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
		</span>
	);
}

/** O carimbo 完: cai girando e bate (mola viva), como o carimbo do professor. */
export function Carimbo() {
	const reduzir = useReducedMotion();
	return (
		<motion.span
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
