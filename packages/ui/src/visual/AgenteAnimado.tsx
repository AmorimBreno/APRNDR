// O agente "vivo": a foto dele reage ao que está fazendo. Pensando, balança
// devagar com bolhas de "…"; escrevendo, dá pulinhos em ritmo irregular;
// pesquisando, inclina de um lado para o outro com uma lupa; preparando uma
// pergunta, dá um pulo com estica e achata e um "?" que estoura. Parado,
// fica quieto. Os ritmos são sorteados a cada ciclo, para não parecer
// mecânico. Com prefers-reduced-motion (MotionConfig reducedMotion="user"
// no App), as transformações param e sobram as bolhas e os selos.

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect } from "react";
import type { EstadoJanela } from "../estado-janela.ts";
import type { DadosAvatarAgente } from "../use-perfis.ts";
import { AvatarAgente } from "./Avatares.tsx";

export type AtividadeAgente = "parado" | "pensando" | "escrevendo" | "pesquisando" | "perguntando";

export const ROTULOS_ATIVIDADE: Record<Exclude<AtividadeAgente, "parado">, string> = {
	pensando: "Pensando",
	escrevendo: "Escrevendo",
	pesquisando: "Pesquisando",
	perguntando: "Preparando uma pergunta",
};

/** Ferramentas que contam como pesquisa (busca na web, leitura de página, subagente). */
const PESQUISA = /search|fetch|subagent|pesquis/i;

/** O que o agente está fazendo agora, pelo estado da janela. */
export function atividadeDoAgente(estado: Pick<EstadoJanela, "executando" | "conversa" | "registrosPedidos">): AtividadeAgente {
	if (Object.values(estado.registrosPedidos).some((registro) => registro.estado === "pendente")) return "perguntando";
	if (!estado.executando) return "parado";
	for (let i = estado.conversa.length - 1; i >= 0; i--) {
		const item = estado.conversa[i]!;
		if (item.tipo === "usuario") break;
		if (item.tipo === "ferramenta" && item.chamada.status === "executando") {
			return PESQUISA.test(item.chamada.nome) ? "pesquisando" : "pensando";
		}
		if (item.tipo === "assistente" && item.emAndamento) return item.texto ? "escrevendo" : "pensando";
	}
	return "pensando";
}

const sortear = (minimo: number, maximo: number) => minimo + Math.random() * (maximo - minimo);
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Laço de animação de cada atividade; para quando `vivo()` fica falso. */
async function animar(atividade: AtividadeAgente, alvo: Element, animate: ReturnType<typeof useAnimate>[1], vivo: () => boolean) {
	const mola = { type: "spring", stiffness: 520, damping: 14, mass: 0.6 } as const;
	switch (atividade) {
		case "escrevendo":
			while (vivo()) {
				const altura = sortear(2.5, 7);
				await animate(alvo, { y: -altura, scaleY: 1.04, scaleX: 0.97 }, { duration: sortear(0.09, 0.16), ease: "easeOut" });
				await animate(alvo, { y: 0, scaleY: 0.94, scaleX: 1.05 }, { duration: sortear(0.08, 0.14), ease: "easeIn" });
				await animate(alvo, { scaleY: 1, scaleX: 1 }, mola);
				await esperar(sortear(40, 420));
			}
			break;
		case "pensando":
			while (vivo()) {
				await animate(alvo, { rotate: sortear(-8, -4), y: -1 }, { duration: sortear(0.7, 1.1), ease: "easeInOut" });
				await animate(alvo, { rotate: sortear(4, 8), y: 0 }, { duration: sortear(0.7, 1.1), ease: "easeInOut" });
			}
			break;
		case "pesquisando":
			while (vivo()) {
				await animate(alvo, { rotate: -12, x: -2 }, { duration: sortear(0.25, 0.4), ease: "easeInOut" });
				await esperar(sortear(150, 500));
				await animate(alvo, { rotate: 12, x: 2 }, { duration: sortear(0.25, 0.4), ease: "easeInOut" });
				await esperar(sortear(150, 500));
			}
			break;
		case "perguntando":
			while (vivo()) {
				await animate(alvo, { scaleY: 0.86, scaleX: 1.1, y: 2 }, { duration: 0.12, ease: "easeIn" });
				await animate(alvo, { y: -12, scaleY: 1.1, scaleX: 0.92, rotate: sortear(-6, 6) }, { duration: 0.2, ease: "easeOut" });
				await animate(alvo, { y: 0, scaleY: 1, scaleX: 1, rotate: 0 }, mola);
				await esperar(sortear(900, 1800));
			}
			break;
		case "parado":
			await animate(alvo, { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 }, mola);
			break;
	}
}

function Bolhas() {
	return (
		<span className="agente-vivo__bolhas">
			{[0, 1, 2].map((indice) => (
				<motion.span
					key={indice}
					className="agente-vivo__bolha"
					animate={{ y: [0, -3, 0], opacity: [0.35, 1, 0.35] }}
					transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, delay: indice * 0.15, ease: "easeInOut" }}
				/>
			))}
		</span>
	);
}

function Lupa() {
	return (
		<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
			<circle cx="10" cy="10" r="6" />
			<path d="M15 15l6 6" />
		</svg>
	);
}

export interface PropsAgenteAnimado {
	nome: string;
	avatar?: DadosAvatarAgente;
	atividade: AtividadeAgente;
	tamanho?: number;
}

/** A foto do agente com a reação da atividade e o selo dela no canto. */
export function AgenteAnimado({ nome, avatar, atividade, tamanho = 36 }: PropsAgenteAnimado) {
	const [escopo, animate] = useAnimate<HTMLSpanElement>();

	useEffect(() => {
		let ativo = true;
		void animar(atividade, escopo.current, animate, () => ativo).catch(() => {});
		return () => {
			ativo = false;
		};
	}, [atividade, animate, escopo]);

	return (
		<span className={`agente-vivo agente-vivo--${atividade}`} style={{ width: tamanho, height: tamanho }}>
			<span ref={escopo} className="agente-vivo__corpo">
				<AvatarAgente nome={nome} {...(avatar ? { avatar } : {})} tamanho={tamanho} />
			</span>
			<AnimatePresence>
				{atividade === "pensando" ? (
					<motion.span key="pensando" className="agente-vivo__selo" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
						<Bolhas />
					</motion.span>
				) : null}
				{atividade === "pesquisando" ? (
					<motion.span
						key="pesquisando"
						className="agente-vivo__selo"
						initial={{ scale: 0, rotate: -40 }}
						animate={{ scale: 1, rotate: 0 }}
						exit={{ scale: 0 }}
						transition={{ type: "spring", stiffness: 600, damping: 15 }}
					>
						<Lupa />
					</motion.span>
				) : null}
				{atividade === "perguntando" ? (
					<motion.span
						key="perguntando"
						className="agente-vivo__selo agente-vivo__selo--pergunta"
						initial={{ scale: 0, y: 6 }}
						animate={{ scale: [0, 1.4, 1], y: 0 }}
						exit={{ scale: 0 }}
						transition={{ duration: 0.45, times: [0, 0.6, 1] }}
					>
						?
					</motion.span>
				) : null}
			</AnimatePresence>
		</span>
	);
}
