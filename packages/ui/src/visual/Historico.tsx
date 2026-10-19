// Histórico de sessões do perfil: a nova conversa no topo e as sessões
// gravadas, da mais recente para a mais antiga, em duas seções que abrem e
// fecham pela linha do título:
// - "Outras conversas", em cima e fechada: as de outros contextos (numa
//   conversa de caderno, as das outras matérias e as gerais; na conversa geral,
//   as dos cadernos), cada uma com uma etiqueta com o rótulo do contexto;
// - a seção da conversa aberta, aberta: as do mesmo contexto (as do caderno,
//   ou as gerais).
// A seção de outras fica em cima para a linha dela estar sempre à mão, sem
// rolar a lista. A aberta fica marcada.

import { Button, Icon, Tag } from "@estudos/design-system";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
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
	/** Contexto da sessão aberta: a seção dela mostra as conversas do mesmo contexto. */
	contexto?: { chave: string; rotulo: string };
	desabilitado?: boolean;
	novaSessao(): void;
	abrirSessao(id: string): void;
}

export function Historico(props: PropsHistorico) {
	const { contexto } = props;
	const chave = contexto?.chave;
	const destas = props.sessoes.filter((sessao) => sessao.contexto?.chave === chave);
	const outras = props.sessoes.filter((sessao) => sessao.contexto?.chave !== chave);
	const [verOutras, setVerOutras] = useState(false);
	const [verDestas, setVerDestas] = useState(true);
	return (
		<nav className="historico" aria-label="Conversas">
			<Button icon="plus" block onClick={props.novaSessao} disabled={props.desabilitado}>
				Nova conversa
			</Button>
			{outras.length > 0 ? (
				<SecaoHistorico
					{...props}
					titulo="Outras conversas"
					sessoes={outras}
					aberta={verOutras}
					alternar={() => setVerOutras((valor) => !valor)}
					comEtiqueta
				/>
			) : null}
			<SecaoHistorico
				{...props}
				titulo={contexto ? `Conversas de ${contexto.rotulo}` : "Conversas"}
				sessoes={destas}
				aberta={verDestas}
				alternar={() => setVerDestas((valor) => !valor)}
				vazio={
					contexto
						? `Nenhuma conversa de ${contexto.rotulo} gravada ainda. Ela aparece aqui depois da primeira mensagem.`
						: "Nenhuma conversa gravada ainda. Ela aparece aqui depois da primeira mensagem."
				}
			/>
		</nav>
	);
}

interface PropsSecao extends Omit<PropsHistorico, "sessoes"> {
	titulo: string;
	sessoes: ResumoSessao[];
	aberta: boolean;
	alternar(): void;
	/** Mostra a etiqueta do contexto de cada conversa (a seção mistura assuntos). */
	comEtiqueta?: boolean;
	/** Texto da seção aberta sem conversas. */
	vazio?: string;
}

function SecaoHistorico(props: PropsSecao) {
	return (
		<section className="historico__secao-grupo">
			<button type="button" className="historico__cabeca" aria-expanded={props.aberta} onClick={props.alternar}>
				<span className="overline">{props.titulo}</span>
				<span className="historico__conta data">{props.sessoes.length}</span>
				<motion.span className="historico__seta" animate={{ rotate: props.aberta ? 90 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
					<Icon name="chevron-right" size={16} strokeWidth={2.5} />
				</motion.span>
			</button>
			<AnimatePresence initial={false}>
				{props.aberta ? (
					<motion.div
						key="lista"
						className="historico__dobra"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ type: "spring", stiffness: 420, damping: 38 }}
					>
						{props.sessoes.length === 0 ? (
							props.vazio ? <p className="historico__vazio body-sm">{props.vazio}</p> : null
						) : (
							<ul className="historico__lista">
								{props.sessoes.map((sessao, indice) => (
									<ItemHistorico
										key={sessao.id}
										sessao={sessao}
										indice={indice}
										comEtiqueta={props.comEtiqueta}
										{...(props.atual ? { atual: props.atual } : {})}
										{...(props.desabilitado ? { desabilitado: true } : {})}
										abrirSessao={props.abrirSessao}
									/>
								))}
							</ul>
						)}
					</motion.div>
				) : null}
			</AnimatePresence>
		</section>
	);
}

function ItemHistorico(props: { sessao: ResumoSessao; indice: number; comEtiqueta?: boolean | undefined } & Pick<PropsHistorico, "atual" | "desabilitado" | "abrirSessao">) {
	const { sessao } = props;
	const atual = sessao.id === props.atual;
	const meta = [formatarData(sessao.modificadaEm), `${sessao.mensagens} mensagens`, sessao.agente].filter(Boolean).join(" · ");
	const etiqueta = props.comEtiqueta ? sessao.contexto?.rotulo : undefined;
	return (
		<motion.li
			initial={{ opacity: 0, x: -12 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ type: "spring", stiffness: 420, damping: 30, delay: Math.min(props.indice, 12) * 0.03 }}
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
				{atual ? <motion.span layoutId="historico-atual" className="historico__marca" transition={{ type: "spring", stiffness: 420, damping: 32 }} /> : null}
				{etiqueta ? (
					<Tag size="sm" tone="outline" icon="notebook" className="historico__etiqueta" title={etiqueta}>
						{etiqueta}
					</Tag>
				) : null}
				<span className="historico__titulo body-strong">{sessao.titulo || "Sem título"}</span>
				<span className="historico__meta data">{meta}</span>
			</button>
		</motion.li>
	);
}
