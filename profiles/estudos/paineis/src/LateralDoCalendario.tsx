// A lateral do calendário em tela cheia (CalendarioCheio.tsx), de cima para baixo:
// - MiniMes: o minicalendário, com as setas e os pontinhos coloridos nos dias
//   com itens. Anda junto com a grade grande (os dois seguem o dia escolhido) e é
//   um grid com roving tabindex, como o do CalendarioCompacto: setas, Home, End,
//   PageUp e PageDown (diaVizinho, calendario-tela.ts);
// - ListaDoDia: a lista do dia escolhido, com "Nova tarefa" daquele dia. A prova
//   leva a etiqueta "Prova"; a tarefa, a caixinha de feita (move para a coluna de
//   feito ou de volta para a primeira, colunaDaCaixinha), a hora, o título e a
//   matéria, e o clique abre o ModalTarefa;
// - TarefasDeApoio: as tarefas abertas Atrasadas (se houver) e Sem data, só os
//   títulos, até MAXIMO_DAS_LISTAS_CURTAS cada, clicáveis.

import { Button, Checkbox, Tag } from "@estudos/design-system";
import { type KeyboardEvent, useMemo } from "react";
import { type Agenda, type ItemCalendario, type MateriaDaAgenda, type Tarefa, tarefasAtrasadas, tarefasSemData } from "../../lib/agenda-tipos.ts";
import type { AcoesDaAgenda } from "./agenda-ponte.ts";
import { colunaDaCaixinha } from "./agenda-tela.ts";
import { dataCurta, limitarLista, MAXIMO_DAS_LISTAS_CURTAS } from "./calendario-cheio.ts";
import {
	capitalizar,
	classeDoTom,
	descricaoDoDia,
	diaVizinho,
	INICIAIS_DOS_DIAS,
	mesDaData,
	NOMES_DOS_DIAS,
	nomeDaMateria,
	nomeDoMes,
	pontosDoDia,
	prazoDoItem,
	semanasDoMes,
	tituloDoDia,
	tomDoItem,
} from "./calendario-tela.ts";

// --- O minimês -------------------------------------------------------------------------

export interface PropsMiniMes {
	escolhido: string;
	hoje: string;
	porDia: ReadonlyMap<string, ItemCalendario[]>;
	materias: MateriaDaAgenda[];
	/** Escolhe o dia com o mouse. */
	escolher(data: string): void;
	/** Move o dia escolhido pelo teclado; o foco vai junto. */
	mover(data: string): void;
	/** A seta do mês: o dia escolhido vai um mês para trás ou para a frente. */
	mudarMes(passo: -1 | 1): void;
	/** Entrega a tabela ao pai, que devolve o foco depois de uma tecla que troca o mês. */
	registrarRaiz(elemento: HTMLElement | null): void;
}

export function MiniMes(props: PropsMiniMes) {
	const { escolhido, hoje, porDia, materias } = props;
	const mes = mesDaData(escolhido);
	// Seis semanas sempre, para o minimês não mudar de altura de um mês para o outro.
	const semanas = useMemo(() => semanasDoMes(mes, { seisSemanas: true }), [mes]);
	const titulo = capitalizar(nomeDoMes(mes));

	const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, data: string) => {
		const alvo = diaVizinho(data, evento.key);
		if (!alvo) return;
		evento.preventDefault();
		props.mover(alvo);
	};

	return (
		<section className="cal-cheio__mini" aria-label="Minicalendário">
			<div className="cal-cheio__mini-topo">
				<h3 className="body-strong cal-cheio__mini-titulo">{titulo}</h3>
				<div className="cal-cheio__mini-setas">
					<Button variant="ghost" size="sm" iconOnly icon="arrow-left" title="Mês anterior" aria-label="Mês anterior" onClick={() => props.mudarMes(-1)} />
					<Button variant="ghost" size="sm" iconOnly icon="arrow-right" title="Próximo mês" aria-label="Próximo mês" onClick={() => props.mudarMes(1)} />
				</div>
			</div>
			<table className="cal-cheio__mini-grade" role="grid" aria-label={titulo} ref={props.registrarRaiz}>
				<thead>
					<tr role="row">
						{INICIAIS_DOS_DIAS.map((inicial, indice) => (
							<th key={NOMES_DOS_DIAS[indice]} scope="col" role="columnheader" abbr={NOMES_DOS_DIAS[indice]!} className="overline cal-cheio__mini-cabeca">
								{inicial}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{semanas.map((semana) => (
						<tr key={semana[0]!.data} role="row">
							{semana.map((dia) => {
								const itens = porDia.get(dia.data);
								const pontos = pontosDoDia(itens, materias);
								const classes = [
									"cal-cheio__mini-dia",
									dia.doMes ? "" : "cal-cheio__mini-dia--fora",
									dia.data === hoje ? "cal-cheio__mini-dia--hoje" : "",
									dia.data === escolhido ? "cal-cheio__mini-dia--escolhido" : "",
								]
									.filter(Boolean)
									.join(" ");
								return (
									<td key={dia.data} role="gridcell" className="cal-cheio__mini-celula">
										<button
											type="button"
											className={classes}
											data-dia={dia.data}
											tabIndex={dia.data === escolhido ? 0 : -1}
											aria-label={descricaoDoDia(dia.data, itens, hoje)}
											aria-pressed={dia.data === escolhido}
											{...(dia.data === hoje ? { "aria-current": "date" as const } : {})}
											onClick={() => props.escolher(dia.data)}
											onKeyDown={(evento) => aoTeclar(evento, dia.data)}
										>
											<span className="data cal-cheio__mini-numero">{dia.dia}</span>
											<span className="cal-cheio__mini-pontos" aria-hidden="true">
												{pontos.map((ponto, indice) => (
													<i
														key={indice}
														className={`cal-ponto ${classeDoTom(ponto.tom)}${ponto.feita ? " cal-ponto--feita" : ""}${ponto.prova ? " cal-ponto--prova" : ""}`}
													/>
												))}
											</span>
										</button>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

// --- A lista do dia escolhido --------------------------------------------------------------

export interface PropsListaDoDia {
	agenda: Agenda;
	materias: MateriaDaAgenda[];
	acoes: AcoesDaAgenda;
	hoje: string;
	escolhido: string;
	/** Os itens do dia escolhido, já na ordem do dia (ordenarItensDoDia). */
	itens: readonly ItemCalendario[];
	abrirTarefa(tarefa: Tarefa): void;
	novaTarefa(data: string): void;
}

export function ListaDoDia(props: PropsListaDoDia) {
	const { agenda, materias, acoes, hoje, escolhido, itens } = props;

	const marcar = (tarefa: Tarefa) => {
		const destino = colunaDaCaixinha(agenda, tarefa);
		// O erro de mover aparece no aviso da casca (TelaAgenda.tsx).
		if (destino) acoes.moverTarefa(tarefa.id, destino).catch(() => {});
	};

	return (
		<section className="cal-cheio__lista-dia" aria-label="Lista do dia escolhido">
			<div className="cal-cheio__lista-topo">
				<h3 className="body-strong cal-cheio__lista-titulo" aria-live="polite">
					{tituloDoDia(escolhido, hoje)}
				</h3>
				<Button variant="primary" size="sm" icon="plus" onClick={() => props.novaTarefa(escolhido)}>
					Nova tarefa
				</Button>
			</div>
			{itens.length === 0 ? (
				<p className="body-sm cal-cheio__vazio">Nada marcado para este dia.</p>
			) : (
				<ul className="cal-cheio__itens">
					{itens.map((item) => {
						const materia = nomeDaMateria(item.materia, materias);
						const bolinha = <span className={`cal-cheio__bolinha ${classeDoTom(tomDoItem(item, materias))}`} aria-hidden="true" />;
						if (item.tipo === "prova") {
							return (
								<li key={item.id} className="cal-item cal-item--prova">
									<Tag tone="outline" icon="flag" size="sm">
										Prova
									</Tag>
									{bolinha}
									<span className="cal-cheio__texto">
										<span className="body-strong cal-item__titulo">{item.titulo}</span>
										{materia ? <span className="body-sm cal-cheio__materia">{materia}</span> : null}
									</span>
								</li>
							);
						}
						const tarefa = agenda.tarefas.find((candidata) => candidata.id === item.id);
						if (!tarefa) return null;
						const atrasada = prazoDoItem(item, hoje) === "atrasada";
						return (
							<li key={item.id} className={`cal-item${item.feita ? " cal-item--feita" : ""}`}>
								<Checkbox
									className="cal-item__caixa"
									checked={item.feita === true}
									disabled={colunaDaCaixinha(agenda, tarefa) === undefined}
									onChange={() => marcar(tarefa)}
									label={<span className="agenda-so-leitor">{item.feita ? `Reabrir a tarefa ${item.titulo}` : `Marcar a tarefa ${item.titulo} como feita`}</span>}
								/>
								<button type="button" className="cal-item__abrir" onClick={() => props.abrirTarefa(tarefa)} title="Editar a tarefa">
									{item.hora ? <span className="data cal-item__hora">{item.hora}</span> : null}
									{bolinha}
									<span className="cal-cheio__texto">
										<span className="body cal-item__titulo">{item.titulo}</span>
										{materia ? <span className="body-sm cal-cheio__materia">{materia}</span> : null}
									</span>
									{atrasada ? (
										<Tag tone="brick" icon="alert" size="sm">
											Atrasada
										</Tag>
									) : null}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

// --- Atrasadas e Sem data ----------------------------------------------------------------------

export interface PropsTarefasDeApoio {
	agenda: Agenda;
	materias: MateriaDaAgenda[];
	hoje: string;
	/** O id da matéria do filtro; sem ele, todas. */
	materia?: string;
	abrirTarefa(tarefa: Tarefa): void;
}

export function TarefasDeApoio(props: PropsTarefasDeApoio) {
	const { agenda, materias, hoje, materia, abrirTarefa } = props;
	const atrasadas = useMemo(() => tarefasAtrasadas(agenda, hoje, materia), [agenda, hoje, materia]);
	const semData = useMemo(() => tarefasSemData(agenda, materia), [agenda, materia]);
	if (atrasadas.length === 0 && semData.length === 0) return null;
	return (
		<>
			<SecaoCurta titulo="Atrasadas" tarefas={atrasadas} materias={materias} abrirTarefa={abrirTarefa} comData />
			<SecaoCurta titulo="Sem data" tarefas={semData} materias={materias} abrirTarefa={abrirTarefa} />
		</>
	);
}

interface PropsSecaoCurta {
	titulo: string;
	tarefas: Tarefa[];
	materias: MateriaDaAgenda[];
	abrirTarefa(tarefa: Tarefa): void;
	/** Mostra a data (curta) antes do título: as atrasadas. */
	comData?: boolean;
}

function SecaoCurta({ titulo, tarefas, materias, abrirTarefa, comData }: PropsSecaoCurta) {
	if (tarefas.length === 0) return null;
	const { mostradas, restantes } = limitarLista(tarefas, MAXIMO_DAS_LISTAS_CURTAS);
	return (
		<section className="cal-cheio__curta" aria-label={titulo}>
			<h3 className="overline cal-cheio__curta-titulo">
				{titulo} <span className="cal-cheio__curta-conta">{tarefas.length}</span>
			</h3>
			<ul className="cal-cheio__curta-lista">
				{mostradas.map((tarefa) => (
					<li key={tarefa.id}>
						<button type="button" className="cal-cheio__curta-item" onClick={() => abrirTarefa(tarefa)} title={tarefa.titulo}>
							<span className={`cal-cheio__bolinha ${classeDoTom(tomDoItem(tarefa, materias))}`} aria-hidden="true" />
							{comData && tarefa.data ? <span className="data cal-item__hora">{dataCurta(tarefa.data)}</span> : null}
							<span className="body-sm cal-item__titulo">{tarefa.titulo}</span>
						</button>
					</li>
				))}
			</ul>
			{restantes > 0 ? <p className="body-sm cal-cheio__vazio">e mais {restantes}</p> : null}
		</section>
	);
}
