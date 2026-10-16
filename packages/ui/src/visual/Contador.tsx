// Número que rola até o valor novo, como um odômetro (o custo e os tokens da
// sessão). Com reduzir movimento, troca direto.

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

export function Contador({ valor, formatar }: { valor: number; formatar(valor: number): string }) {
	const atual = useMotionValue(valor);
	const texto = useTransform(atual, formatar);
	const reduzir = useReducedMotion();
	useEffect(() => {
		if (reduzir) {
			atual.set(valor);
			return;
		}
		const controle = animate(atual, valor, { type: "spring", stiffness: 120, damping: 20 });
		return () => controle.stop();
	}, [valor, atual, reduzir]);
	return <motion.span>{texto}</motion.span>;
}
