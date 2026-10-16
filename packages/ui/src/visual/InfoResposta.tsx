// Botão de informações de uma resposta: fica ao lado do número na margem do
// bloco e abre um balão com a data e hora, o agente, o modelo, quanto levou,
// os tokens e o custo. Substitui o nome do modelo no pé de cada resposta.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { ItemConversa } from "../estado-janela.ts";

type ItemAssistente = Extract<ItemConversa, { tipo: "assistente" }>;

const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const inteiro = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dolar = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** "4,2 s" ou "1 min 12 s". */
export function formatarDuracao(ms: number): string {
	const segundos = ms / 1000;
	if (segundos < 60) return `${decimal.format(segundos)} s`;
	const minutos = Math.floor(segundos / 60);
	return `${minutos} min ${Math.round(segundos - minutos * 60)} s`;
}

/** As linhas do balão, só com o que a resposta tem. */
export function linhasDaResposta(item: ItemAssistente): Array<[string, string]> {
	const linhas: Array<[string, string]> = [];
	if (item.momento) {
		const data = new Date(item.momento);
		if (!Number.isNaN(data.getTime())) linhas.push(["Quando", dataHora.format(data)]);
	}
	if (item.agente) linhas.push(["Agente", item.agente]);
	if (item.modelo) linhas.push(["Modelo", item.modelo.replace(/^openrouter\//, "")]);
	if (item.duracaoMs !== undefined) linhas.push(["Levou", formatarDuracao(item.duracaoMs)]);
	if (item.uso) {
		const { tokensTotal, tokensEntrada, tokensSaida, tokensCacheLeitura, tokensCacheEscrita } = item.uso;
		const cache = tokensCacheLeitura + tokensCacheEscrita;
		const partes = [`entrada ${inteiro.format(tokensEntrada)}`, ...(cache > 0 ? [`cache ${inteiro.format(cache)}`] : []), `saída ${inteiro.format(tokensSaida)}`];
		linhas.push(["Tokens", `${inteiro.format(tokensTotal)} (${partes.join(" · ")})`]);
		linhas.push(["Custo", `US$ ${dolar.format(item.uso.custo)}`]);
	}
	return linhas;
}

export function InfoResposta({ item, numero }: { item: ItemAssistente; numero: number }) {
	const [aberto, setAberto] = useState(false);
	const raiz = useRef<HTMLSpanElement>(null);
	const id = useId();
	const linhas = linhasDaResposta(item);

	useEffect(() => {
		if (!aberto) return;
		const fora = (evento: PointerEvent) => {
			if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false);
		};
		const tecla = (evento: KeyboardEvent) => {
			if (evento.key === "Escape") setAberto(false);
		};
		document.addEventListener("pointerdown", fora);
		document.addEventListener("keydown", tecla);
		return () => {
			document.removeEventListener("pointerdown", fora);
			document.removeEventListener("keydown", tecla);
		};
	}, [aberto]);

	return (
		<span ref={raiz} className="info-resposta">
			<button
				type="button"
				className="info-resposta__botao data"
				aria-label={`Informações da resposta ${numero}`}
				aria-expanded={aberto}
				aria-controls={aberto ? id : undefined}
				disabled={linhas.length === 0}
				onClick={() => setAberto((atual) => !atual)}
			>
				i
			</button>
			<AnimatePresence>
				{aberto ? (
					<motion.div
						id={id}
						role="dialog"
						aria-label={`Informações da resposta ${numero}`}
						className="info-resposta__balao"
						initial={{ opacity: 0, scale: 0.6, y: -6 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.85, y: -4, transition: { duration: 0.12 } }}
						transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.7 }}
					>
						<dl>
							{linhas.map(([rotulo, valor]) => (
								<div key={rotulo} className="info-resposta__linha">
									<dt className="overline">{rotulo}</dt>
									<dd className="data">{valor}</dd>
								</div>
							))}
						</dl>
					</motion.div>
				) : null}
			</AnimatePresence>
		</span>
	);
}
