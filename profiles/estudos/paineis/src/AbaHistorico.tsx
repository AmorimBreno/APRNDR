// A aba Histórico da tela "Perfil do aprendiz" (docs/aprendiz.md, seção 3): a linha do tempo dos eventos de
// aprendizagem (camada 1), os mais novos primeiro e agrupados por dia. Cada evento diz o que foi (o verbo em português),
// a hora, a matéria, o conceito (quando a tela sabe o nome) e uma frase curta do resultado. O filtro de matéria é o da
// tela (vale nas três abas); o de tipo (Respostas, Autoavaliações, Perfil) é daqui. Uma ficha de evidência das
// Hipóteses leva para cá com o evento destacado (a rota aprendiz/historico?evento=<id>): ele rola até ficar à vista e o
// destaque é só cor, sem mexer no layout, e some no próximo clique. Um evento cuja hipótese o cita tem um botão que
// volta para ela.
//
// Padrões de interface (docs/padroes-de-interface.md): a lista só aparece pronta (o esqueleto fica escondido ocupando o
// lugar e "Carregando…" só depois de 1 s); trocar o filtro não desmonta a tela; o destaque não altera o tamanho de nada.

import { Button, EmptyState, Icon, Select } from "@estudos/design-system";
import { semMovimento, useValorEstavel } from "@estudos/ui";
import { motion } from "motion/react";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { LIMITE_HISTORICO } from "../../lib/hipoteses-tipos.ts";
import { acharPorAtributo, useDestaque } from "./aprendiz-destaque.ts";
import {
	agruparPorDia,
	conceitosNomeadosDoEvento,
	type EventoLido,
	filtrarEventos,
	fraseDoResultado,
	hipotesesQueCitam,
	horaDoEvento,
	maisNovosPrimeiro,
	materiaDoEvento,
	OPCOES_DE_TIPO,
	tipoDeValor,
	type TipoDoHistorico,
	verboEmPortugues,
} from "./aprendiz-historico-tela.ts";
import type { NomesDosConceitos } from "./aprendiz-hipoteses-tela.ts";
import type { HistoricoAberto } from "./aprendiz-hipoteses-ponte.ts";
import { type MateriaConhecida, formatarInteiro, idCurtoDoEvento, nomeDaMateria } from "./aprendiz-tela.ts";
import { classeDoTom, tomDaMateria } from "./calendario-tela.ts";
import { RotuloEstado } from "./RotuloEstado.tsx";
import type { Hipotese, MudancaPendente } from "../../lib/hipoteses-tipos.ts";

const NBSP = " ";

function LinhaDoEvento(props: {
	evento: EventoLido;
	destacado: boolean;
	materias: ReadonlyArray<MateriaConhecida>;
	nomes: NomesDosConceitos;
	citantes: readonly string[];
	abrirHipoteses(ids: readonly string[]): void;
}) {
	const { evento } = props;
	const materia = materiaDoEvento(evento);
	const aguardandoMaterias = props.materias.length === 0;
	const nomeMateria = materia ? (aguardandoMaterias ? NBSP : (nomeDaMateria(materia, props.materias) ?? "matéria removida")) : undefined;
	const conceitos = conceitosNomeadosDoEvento(evento, props.nomes);
	const frase = fraseDoResultado(evento);
	const partes: Array<{ chave: string; no: ReactNode }> = [];
	if (nomeMateria !== undefined) {
		partes.push({
			chave: "materia",
			no: (
				<span className={`apz-materia ${materia ? classeDoTom(tomDaMateria(materia, props.materias)) : ""}`}>
					<span className="lista-ponto" aria-hidden="true" />
					<span className="apz-materia__nome">{nomeMateria}</span>
				</span>
			),
		});
	}
	if (conceitos.length > 0) partes.push({ chave: "conceitos", no: <span className="apz-evento__conceitos">{conceitos.join(", ")}</span> });
	if (frase) partes.push({ chave: "frase", no: <span className="apz-evento__frase">{frase}</span> });
	return (
		<li className={`apz-evento${props.destacado ? " apz-evento--destaque" : ""}`} data-evento={evento.id}>
			<span className="apz-evento__hora data" title={evento.ts}>
				{horaDoEvento(evento.ts)}
			</span>
			<div className="apz-evento__corpo">
				<p className="apz-evento__verbo body-strong">{verboEmPortugues(evento.verbo)}</p>
				<p className="apz-evento__detalhe body-sm">
					{partes.length === 0
						? NBSP
						: partes.map((parte, indice) => (
								<Fragment key={parte.chave}>
									{indice > 0 ? <span className="apz-evento__sep" aria-hidden="true"> · </span> : null}
									{parte.no}
								</Fragment>
							))}
				</p>
			</div>
			<span className="apz-evento__citado">
				{props.citantes.length > 0 ? (
					<button
						type="button"
						className="apz-evento__volta"
						aria-label={props.citantes.length === 1 ? "Ver a hipótese que cita este evento" : `Ver as ${props.citantes.length} hipóteses que citam este evento`}
						title={props.citantes.length === 1 ? "Ver a hipótese que cita este evento" : `Ver as ${props.citantes.length} hipóteses que citam este evento`}
						onClick={() => props.abrirHipoteses(props.citantes)}
					>
						<Icon name="bulb" size={18} strokeWidth={2.25} />
					</button>
				) : null}
			</span>
		</li>
	);
}

function LinhaEsqueleto() {
	return (
		<li className="apz-evento apz-evento--esqueleto" aria-hidden="true">
			<span className="apz-evento__hora data">{NBSP}</span>
			<div className="apz-evento__corpo">
				<p className="apz-evento__verbo body-strong">{NBSP}</p>
				<p className="apz-evento__detalhe body-sm">{NBSP}</p>
			</div>
			<span className="apz-evento__citado" />
		</li>
	);
}

export interface PropsAbaHistorico {
	hist: HistoricoAberto;
	/** As hipóteses (se já chegaram), para o botão que volta a elas. */
	hipoteses: { hipoteses: readonly Hipotese[]; mudancas: readonly MudancaPendente[] } | undefined;
	materia?: string;
	materias: ReadonlyArray<MateriaConhecida>;
	nomes: NomesDosConceitos;
	/** O evento que a rota pede para destacar. */
	evento?: string;
	/** Abre as Hipóteses com essas hipóteses destacadas. */
	abrirHipoteses(ids: readonly string[]): void;
	/** Tira o destaque da rota (o próximo clique). */
	limparDestaque(): void;
	agora: number;
}

export function AbaHistorico(props: PropsAbaHistorico) {
	const { hist, materia, materias } = props;
	const eventos = hist.eventos;
	const parado = semMovimento();
	const primeira = useRef(true);
	useEffect(() => {
		primeira.current = false;
	}, []);

	// O tipo é desta aba. Chegar com um evento destacado mostra todos os tipos (o evento não pode ficar escondido por um filtro velho).
	const [tipo, setTipo] = useState<TipoDoHistorico>("todos");
	const [eventoVisto, setEventoVisto] = useState(props.evento);
	if (eventoVisto !== props.evento) {
		setEventoVisto(props.evento);
		if (props.evento && tipo !== "todos") setTipo("todos");
	}

	const semDados = !hist.erro && !eventos;
	const mostraCarregando = useValorEstavel(semDados, semDados, false) && semDados;
	const fase = hist.erro ? "erro" : eventos ? "dados" : "espera";

	const ordenados = useMemo(() => (eventos ? maisNovosPrimeiro(eventos) : undefined), [eventos]);
	const visiveis = useMemo(() => (ordenados ? filtrarEventos(ordenados, { ...(materia ? { materia } : {}), tipo }) : undefined), [ordenados, materia, tipo]);
	const dias = useMemo(() => (visiveis ? agruparPorDia(visiveis, props.agora) : undefined), [visiveis, props.agora]);
	const raiz = useRef<HTMLDivElement>(null);
	useDestaque({ ids: props.evento ? [props.evento] : [], pronto: dias !== undefined, achar: (ids) => acharPorAtributo(raiz.current, "data-evento", ids), limpar: props.limparDestaque });
	const achado = props.evento && ordenados ? ordenados.some((evento) => evento.id === props.evento) : undefined;

	return (
		<div className="apz-historico" ref={raiz}>
			<div className="apz-historico__barra">
				<Select
					size="sm"
					aria-label="Filtrar por tipo"
					className="apz-historico__tipo"
					options={OPCOES_DE_TIPO.map((opcao) => ({ value: opcao.value, label: opcao.label }))}
					value={tipo}
					onChange={(evento) => setTipo(tipoDeValor(evento.target.value))}
				/>
				<p className="apz-historico__conta body-sm data">
					{visiveis ? `${formatarInteiro(visiveis.length)} ${visiveis.length === 1 ? "evento" : "eventos"}${eventos && eventos.length >= LIMITE_HISTORICO ? ` · os ${formatarInteiro(LIMITE_HISTORICO)} mais recentes` : ""}` : NBSP}
				</p>
			</div>
			<motion.div key={fase} className="apz-historico__fase" initial={parado || primeira.current ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
				{hist.erro ? (
					<div className="aprendiz__erro" role="alert">
						<Icon name="alert" size={20} />
						<div className="aprendiz__erro-texto">
							<h2 className="heading" style={{ margin: 0 }}>
								Não consegui ler o histórico
							</h2>
							<p className="body" style={{ margin: 0 }}>
								{hist.erro.mensagem}
							</p>
						</div>
						<Button variant="secondary" size="sm" icon="refresh" onClick={() => hist.recarregar()} aria-busy={hist.tentando}>
							<RotuloEstado ocupado={hist.tentando} repouso="Tentar de novo" passageiro="Tentando…" />
						</Button>
					</div>
				) : !dias || !visiveis ? (
					<div className="aprendiz__espera" style={{ visibility: mostraCarregando ? "visible" : "hidden" }} aria-hidden={!mostraCarregando}>
						<p className="body aprendiz__carregando">Carregando o histórico…</p>
						<ol className="apz-eventos">
							<LinhaEsqueleto />
							<LinhaEsqueleto />
							<LinhaEsqueleto />
						</ol>
					</div>
				) : (
					<>
						{props.evento && achado === false ? (
							<p className="apz-historico__aviso body-sm" role="status">
								<Icon name="alert" size={16} />
								<span>O evento {idCurtoDoEvento(props.evento)} não está entre os {formatarInteiro(LIMITE_HISTORICO)} mais recentes do histórico, ou foi removido.</span>
							</p>
						) : null}
						{dias.length === 0 ? (
							<div className="aprendiz__vazio">
								{eventos && eventos.length === 0 ? (
									<EmptyState glyph="読" title="Ainda não há eventos">
										Os eventos aparecem conforme você responde questões, se autoavalia e avalia as lições. Cada um fica registrado aqui, do mais novo para o mais antigo.
									</EmptyState>
								) : (
									<EmptyState glyph="読" title="Nenhum evento nesta seleção">
										Nenhum evento combina com a matéria e o tipo escolhidos. Escolha outra matéria ou outro tipo.
									</EmptyState>
								)}
							</div>
						) : (
							dias.map((dia) => (
								<section key={dia.dia || "sem-data"} className="apz-dia" data-dia={dia.dia}>
									<h2 className="apz-dia__titulo overline">{dia.rotulo}</h2>
									<ol className="apz-eventos">
										{dia.eventos.map((evento) => (
											<LinhaDoEvento
												key={evento.id}
												evento={evento}
												destacado={evento.id === props.evento}
												materias={materias}
												nomes={props.nomes}
												citantes={hipotesesQueCitam(evento, props.hipoteses)}
												abrirHipoteses={props.abrirHipoteses}
											/>
										))}
									</ol>
								</section>
							))
						)}
					</>
				)}
			</motion.div>
		</div>
	);
}
