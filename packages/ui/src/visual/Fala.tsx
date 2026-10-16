// Fala: a foto de quem pergunta na frente e o enunciado num balão, como se a
// pessoa estivesse falando com você. Usada nos modais de pedido (o professor
// perguntando, propondo uma questão). Sem `quem`, mostra só o conteúdo.

import { motion } from "motion/react";
import type { ReactNode } from "react";

export function Fala({ quem, children }: { quem?: ReactNode; children: ReactNode }) {
	if (!quem) return <>{children}</>;
	return (
		<div className="fala">
			<span className="fala__quem">{quem}</span>
			<motion.div
				className="fala__balao"
				initial={{ opacity: 0, scale: 0.7, x: -12 }}
				animate={{ opacity: 1, scale: 1, x: 0 }}
				transition={{ type: "spring", stiffness: 420, damping: 20, delay: 0.08 }}
			>
				{children}
			</motion.div>
		</div>
	);
}
