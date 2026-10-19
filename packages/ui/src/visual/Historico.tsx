// Histórico de sessões do perfil: a nova conversa no topo e as sessões
// gravadas, da mais recente para a mais antiga. A aberta fica marcada.

import { Button } from "@estudos/design-system";
import { motion } from "motion/react";
import type { ResumoSessao } from "../tipos.ts";

const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function formatarData(iso: string): string {
	const data = new Date(iso);
	return Number.isNaN(data.getTime()) ? iso : dataHora.format(data);
}

export interface PropsHistorico {
	sessoes: ResumoSessao[];
	/** Sessão aberta agora. */
	atual?: string;
	desabilitado?: boolean;
	novaSessao(): void;
	abrirSessao(id: string): void;
}

export function Historico(props: PropsHistorico) {
	return (
		<nav className="historico" aria-label="Conversas">
			<Button icon="plus" block onClick={props.novaSessao} disabled={props.desabilitado}>
				Nova conversa
			</Button>
			<p className="historico__secao overline">Conversas</p>
			{props.sessoes.length === 0 ? (
				<p className="historico__vazio body-sm">Nenhuma conversa gravada ainda. Ela aparece aqui depois da primeira mensagem.</p>
			) : (
				<ul className="historico__lista">
					{props.sessoes.map((sessao, indice) => {
						const atual = sessao.id === props.atual;
						const meta = [sessao.contexto?.rotulo, formatarData(sessao.modificadaEm), `${sessao.mensagens} mensagens`, sessao.agente].filter(Boolean).join(" · ");
						return (
							<motion.li
								key={sessao.id}
								initial={{ opacity: 0, x: -12 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ type: "spring", stiffness: 420, damping: 30, delay: Math.min(indice, 12) * 0.03 }}
							>
								<button
									type="button"
									className={`historico__item${atual ? " historico__item--atual" : ""}`}
									aria-current={atual || undefined}
									disabled={props.desabilitado}
									onClick={() => {
										if (!atual) props.abrirSessao(sessao.id);
									}}
								>
									{/* A marca da conversa aberta desliza de um item para o outro (layoutId). */}
									{atual ? (
										<motion.span
											layoutId="historico-atual"
											className="historico__marca"
											transition={{ type: "spring", stiffness: 420, damping: 32 }}
										/>
									) : null}
									<span className="historico__titulo body-strong">{sessao.titulo || "Sem título"}</span>
									<span className="historico__meta data">{meta}</span>
								</button>
							</motion.li>
						);
					})}
				</ul>
			)}
		</nav>
	);
}
