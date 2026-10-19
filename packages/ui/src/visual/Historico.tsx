// Histórico de sessões do perfil: a nova conversa no topo e as sessões
// gravadas, da mais recente para a mais antiga. A aberta fica marcada.
//
// Numa conversa com contexto (a de um caderno), a lista mostra só as conversas
// daquele contexto; o menu no topo da lista troca para "Todas as conversas" e
// volta. Na lista com tudo, cada conversa com contexto tem uma etiqueta com o
// rótulo dele (a matéria).

import { Button, Tag } from "@estudos/design-system";
import { motion } from "motion/react";
import { useState } from "react";
import type { ResumoSessao } from "../tipos.ts";
import { MenuSuspenso } from "./MenuSuspenso.tsx";

const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function formatarData(iso: string): string {
	const data = new Date(iso);
	return Number.isNaN(data.getTime()) ? iso : dataHora.format(data);
}

export interface PropsHistorico {
	sessoes: ResumoSessao[];
	/** Sessão aberta agora. */
	atual?: string;
	/** Contexto da sessão aberta: com ele, a lista mostra só as conversas dele. */
	contexto?: { chave: string; rotulo: string };
	desabilitado?: boolean;
	novaSessao(): void;
	abrirSessao(id: string): void;
}

export function Historico(props: PropsHistorico) {
	const [todas, setTodas] = useState(false);
	const { contexto } = props;
	const filtrar = Boolean(contexto) && !todas;
	const sessoes = filtrar ? props.sessoes.filter((sessao) => sessao.contexto?.chave === contexto?.chave) : props.sessoes;
	const doContexto = contexto ? props.sessoes.filter((sessao) => sessao.contexto?.chave === contexto.chave).length : 0;
	const quantas = (numero: number) => `${numero} ${numero === 1 ? "conversa" : "conversas"}`;
	return (
		<nav className="historico" aria-label="Conversas">
			<Button icon="plus" block onClick={props.novaSessao} disabled={props.desabilitado}>
				Nova conversa
			</Button>
			{contexto ? (
				<MenuSuspenso
					className="historico__menu"
					classeBotao="historico__filtro"
					opcoes={[
						{ id: "contexto", titulo: contexto.rotulo, detalhe: quantas(doContexto) },
						{ id: "todas", titulo: "Todas as conversas", detalhe: quantas(props.sessoes.length) },
					]}
					atual={todas ? "todas" : "contexto"}
					escolher={(id) => setTodas(id === "todas")}
					rotulo={`Mostrando ${todas ? "todas as conversas" : `as conversas de ${contexto.rotulo}`}. Trocar`}
					rotuloMenu="Quais conversas mostrar"
					conteudoBotao={
						<>
							<span className="overline">{todas ? "Conversas" : "Conversas de"}</span>
							<span className="historico__filtro-valor body-strong">{todas ? "Todas" : contexto.rotulo}</span>
						</>
					}
				/>
			) : (
				<p className="historico__secao overline">Conversas</p>
			)}
			{sessoes.length === 0 ? (
				<p className="historico__vazio body-sm">
					{filtrar && contexto
						? `Nenhuma conversa de ${contexto.rotulo} gravada ainda. Ela aparece aqui depois da primeira mensagem.`
						: "Nenhuma conversa gravada ainda. Ela aparece aqui depois da primeira mensagem."}
				</p>
			) : (
				<ul className="historico__lista">
					{sessoes.map((sessao, indice) => {
						const atual = sessao.id === props.atual;
						const meta = [formatarData(sessao.modificadaEm), `${sessao.mensagens} mensagens`, sessao.agente].filter(Boolean).join(" · ");
						// A etiqueta só faz falta quando a lista mistura assuntos.
						const etiqueta = !filtrar ? sessao.contexto?.rotulo : undefined;
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
					})}
				</ul>
			)}
		</nav>
	);
}
