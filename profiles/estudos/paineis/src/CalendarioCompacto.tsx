// O calendário do caderno (docs/agenda.md): o cartão da coluna da direita do
// painel (BaixoDoCaderno.tsx), que mostra só a agenda da matéria do caderno e
// ocupa a altura toda da coluna, do topo do bloco até o fim da janela. De cima
// para baixo:
// - o título e o botão Tela cheia, que leva à tela da agenda (TelaAgenda.tsx)
//   com a matéria do caderno no filtro;
// - o mês, com ‹ Hoje › (o título e as setas quebram para duas linhas se a
//   coluna estiver estreita);
// - a grade do mês: as seis semanas dividem a altura que sobra no cartão e cada
//   dia é uma célula grande, com o número no alto e, embaixo, até três
//   pontinhos coloridos (um por tarefa com data ou prova; a tarefa feita aparece
//   apagada, a prova em losango) e um "+N" se houver mais. A coluna tem um
//   quarto da largura: uma etiqueta de texto não cabe, então os pontinhos ficam.
//   Os de fora do mês são apagados, hoje leva o número na cor da matéria e o dia
//   escolhido ganha contorno.
// A grade tem roving tabindex: as setas andam entre os dias, Home e End vão às
// pontas da semana e PageUp e PageDown trocam de mês (diaVizinho em
// calendario-tela.ts); só o dia escolhido entra na ordem do Tab.
//
// O dia escolhido é de quem desenha as duas colunas (AgendaDoCaderno.tsx): a lista
// desse dia fica em TarefasDoCaderno.tsx.

import { Button } from "@estudos/design-system";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Agenda, ItemCalendario, MateriaDaAgenda, ProvaDaAgenda } from "../../lib/agenda-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import { rotaDaAgenda } from "./agenda-tela.ts";
import {
	capitalizar,
	classeDoTom,
	descricaoDoDia,
	diaVizinho,
	INICIAIS_DOS_DIAS,
	itensDaGrade,
	mesDaData,
	NOMES_DOS_DIAS,
	nomeDoMes,
	pontosDoDia,
	primeiroDiaDoMes,
	semanasDoMes,
	somarMeses,
} from "./calendario-tela.ts";

export interface PropsCalendarioCompacto {
	/** A agenda como a tela mostra; sem ela (ainda abrindo), a grade aparece sem pontinhos. */
	agenda?: Agenda;
	provas: ProvaDaAgenda[];
	materias: MateriaDaAgenda[];
	/** O id da matéria do caderno: o calendário mostra só ela. */
	materiaId: string;
	/** A matéria (para a cor e o nome); sem ela, âmbar. */
	materia?: Materia;
	/** A data de hoje, AAAA-MM-DD. */
	hoje: string;
	/** O dia escolhido (AAAA-MM-DD), compartilhado com a coluna de tarefas. */
	escolhido: string;
	escolher(data: string): void;
	/** Vai a outra subtela do perfil (o botão leva à tela da agenda). */
	navegar(caminho: string): void;
}

export function CalendarioCompacto(props: PropsCalendarioCompacto) {
	const { agenda, provas, materias, materiaId, materia, hoje, escolhido } = props;
	const [mes, setMes] = useState(() => mesDaData(escolhido));
	const grade = useRef<HTMLDivElement | null>(null);
	const focoPendente = useRef<string | undefined>(undefined);

	// O cartão sempre usa a cor da matéria do caderno (âmbar sem ela).
	const tom = materia?.cor ?? "amber";
	const semanas = useMemo(() => semanasDoMes(mes, { seisSemanas: true }), [mes]);
	const itensDaGradeDoMes = useMemo(() => (agenda ? itensDaGrade(agenda, provas, semanas, materiaId) : new Map<string, ItemCalendario[]>()), [agenda, provas, semanas, materiaId]);
	// O dia que entra na ordem do Tab: o escolhido, se está na grade; senão hoje, ou o primeiro do mês.
	const diasDaGrade = useMemo(() => new Set(semanas.flat().map((dia) => dia.data)), [semanas]);
	const focavel = diasDaGrade.has(escolhido) ? escolhido : diasDaGrade.has(hoje) ? hoje : primeiroDiaDoMes(mes);
	const mesDeHoje = mesDaData(hoje);

	// Depois de uma seta que trocou de mês, o foco vai para o dia novo assim que a grade desenha.
	useEffect(() => {
		const alvo = focoPendente.current;
		if (!alvo) return;
		focoPendente.current = undefined;
		grade.current?.querySelector<HTMLButtonElement>(`[data-dia="${alvo}"]`)?.focus();
	}, [escolhido, mes]);

	const irParaODia = (data: string) => {
		props.escolher(data);
		setMes(mesDaData(data));
	};
	const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, data: string) => {
		const alvo = diaVizinho(data, evento.key);
		if (!alvo) return;
		evento.preventDefault();
		focoPendente.current = alvo;
		irParaODia(alvo);
	};
	const irParaHoje = () => irParaODia(hoje);

	const tituloMes = capitalizar(nomeDoMes(mes));
	return (
		<section className={`cal-compacto ${classeDoTom(tom)}`} aria-label={`Calendário de ${materia?.nome ?? "a matéria"}`}>
			<header className="cal-compacto__topo">
				<span className="overline cal-compacto__rotulo">Calendário</span>
				<Button
					variant="secondary"
					size="sm"
					iconOnly
					icon="arrow-up-right"
					title="Tela cheia"
					aria-label="Abrir o calendário em tela cheia"
					onClick={() => props.navegar(rotaDaAgenda("calendario", materiaId))}
				/>
			</header>

			<div className="cal-compacto__mes">
				<h3 className="heading cal-compacto__titulo" aria-live="polite">
					{tituloMes}
				</h3>
				<div className="cal-compacto__navega">
					<Button variant="ghost" size="sm" iconOnly icon="arrow-left" title="Mês anterior" aria-label="Mês anterior" onClick={() => setMes((atual) => somarMeses(atual, -1))} />
					<Button variant="secondary" size="sm" onClick={irParaHoje} disabled={escolhido === hoje && mes === mesDeHoje}>
						Hoje
					</Button>
					<Button variant="ghost" size="sm" iconOnly icon="arrow-right" title="Próximo mês" aria-label="Próximo mês" onClick={() => setMes((atual) => somarMeses(atual, 1))} />
				</div>
			</div>

			<div className="cal-compacto__grade" role="grid" aria-label={tituloMes} ref={grade}>
				<div role="row" className="cal-compacto__linha cal-compacto__linha--cabeca">
					{INICIAIS_DOS_DIAS.map((inicial, indice) => (
						<span key={NOMES_DOS_DIAS[indice]} role="columnheader" aria-label={NOMES_DOS_DIAS[indice]!} className="overline cal-compacto__cabeca">
							{inicial}
						</span>
					))}
				</div>
				{semanas.map((semana) => (
					<div key={semana[0]!.data} role="row" className="cal-compacto__linha">
						{semana.map((dia) => {
							const itens = itensDaGradeDoMes.get(dia.data);
							const pontos = pontosDoDia(itens, materias);
							const extras = (itens?.length ?? 0) - pontos.length;
							const classes = [
								"cal-dia",
								dia.doMes ? "" : "cal-dia--fora",
								dia.data === hoje ? "cal-dia--hoje" : "",
								dia.data === escolhido ? "cal-dia--escolhido" : "",
							]
								.filter(Boolean)
								.join(" ");
							return (
								<div key={dia.data} role="gridcell" className="cal-compacto__celula">
									<button
										type="button"
										className={classes}
										data-dia={dia.data}
										tabIndex={dia.data === focavel ? 0 : -1}
										aria-label={descricaoDoDia(dia.data, itens, hoje)}
										aria-pressed={dia.data === escolhido}
										{...(dia.data === hoje ? { "aria-current": "date" as const } : {})}
										onClick={() => irParaODia(dia.data)}
										onKeyDown={(evento) => aoTeclar(evento, dia.data)}
									>
										<span className="cal-dia__numero data">{dia.dia}</span>
										<span className="cal-dia__pontos" aria-hidden="true">
											{pontos.map((ponto, indice) => (
												<i
													key={indice}
													className={`cal-ponto ${classeDoTom(ponto.tom)}${ponto.feita ? " cal-ponto--feita" : ""}${ponto.prova ? " cal-ponto--prova" : ""}`}
												/>
											))}
											{extras > 0 ? <span className="overline cal-dia__mais">+{extras}</span> : null}
										</span>
									</button>
								</div>
							);
						})}
					</div>
				))}
			</div>
		</section>
	);
}
