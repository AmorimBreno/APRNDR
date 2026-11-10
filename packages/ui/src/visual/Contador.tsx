// Número que rola até o valor novo, como um odômetro (o custo e os tokens da
// sessão). Com reduzir movimento, troca direto. Quando `chave` muda (outra
// sessão), pula direto ao valor novo: só os incrementos ao vivo rolam.

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

export function Contador({ valor, formatar, chave }: { valor: number; formatar(valor: number): string; chave?: string }) {
	const atual = useMotionValue(valor);
	const texto = useTransform(atual, formatar);
	const reduzir = useReducedMotion();
	const chaveAntes = useRef(chave);
	useEffect(() => {
		const trocou = chaveAntes.current !== chave;
		chaveAntes.current = chave;
		if (reduzir || trocou) {
			atual.set(valor);
			return;
		}
		const controle = animate(atual, valor, { type: "spring", stiffness: 120, damping: 20 });
		return () => controle.stop();
	}, [valor, chave, atual, reduzir]);
	return <motion.span>{texto}</motion.span>;
}
