// O calendário compacto do caderno (docs/agenda.md): um cartão à direita das
// tags do painel (Notas, Materiais e Mapa de conteúdo) que mostra só a agenda
// da matéria do caderno. De cima para baixo:
// - o título e três botões pequenos que levam à tela da agenda (TelaAgenda.tsx)
//   com a matéria do caderno no filtro: Tarefas (a lista), Quadro (o kanban) e
//   Tela cheia (o calendário grande);
// - o mês, com as setas e "Hoje", e a grade de dias em círculos: os do mês em
//   destaque, os de fora apagados, hoje marcado na cor da matéria, o dia
//   escolhido com contorno e até três pontinhos coloridos embaixo dos dias com
//   itens (tarefas com data e provas; a tarefa feita aparece apagada);
// - a lista do dia escolhido: a prova com a etiqueta "Prova", a tarefa com a
//   caixinha que a marca como feita (move para a coluna de feito, ou de volta
//   para a primeira) e o clique que abre o ModalTarefa; e "Nova tarefa" com a
//   data do dia.
// A grade é uma tabela com roving tabindex: as setas andam entre os dias, Home e
// End vão às pontas da semana e PageUp e PageDown trocam de mês (diaVizinho em
// calendario-tela.ts); só o dia escolhido entra na ordem do Tab.
//
// O cartão tem a própria ponte (useAgenda) e o próprio modal de tarefa.

import { Button, Checkbox, Icon, Tag } from "@estudos/design-system";
import type { JanelaPerfilHook } from "@estudos/ui";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ItemCalendario, Tarefa } from "../../lib/agenda-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import { useAgenda, useHoje } from "./agenda-ponte.ts";
import { colunaDaCaixinha, rotaDaAgenda } from "./agenda-tela.ts";
import {
	capitalizar,
	classeDoTom,
	descricaoDoDia,
	diaVizinho,
	INICIAIS_DOS_DIAS,
	itensDaGrade,
	itensDoIntervalo,
	mesDaData,
	NOMES_DOS_DIAS,
	nomeDoMes,
	pontosDoDia,
	prazoDoItem,
	primeiroDiaDoMes,
	semanasDoMes,
	somarMeses,
	tituloDoDia,
} from "./calendario-tela.ts";
import { ModalTarefa, useModalTarefa } from "./ModalTarefa.tsx";

export interface PropsCalendarioCompacto {
	janela: JanelaPerfilHook;
	/** O id da matéria do caderno: o calendário mostra só ela, e a tarefa nova nasce com ela. */
	materiaId: string;
	/** A matéria (para a cor); sem ela, âmbar. */
	materia?: Materia;
	/** Vai a outra subtela do perfil (os botões levam à tela da agenda). */
	navegar(caminho: string): void;
	/** Muda quando a matéria pode ter mudado (as provas): a agenda é pedida de novo. */
	vez?: string;
}

export function CalendarioCompacto(props: PropsCalendarioCompacto) {
	const { janela, materiaId, materia, navegar } = props;
	const aberta = useAgenda(janela, props.vez);
	const { agenda, provas, materias } = aberta;
	const hoje = useHoje();
	const modal = useModalTarefa();
	const [escolhido, setEscolhido] = useState(hoje);
	const [mes, setMes] = useState(() => mesDaData(hoje));
	const grade = useRef<HTMLTableElement | null>(null);
	const focoPendente = useRef<string | undefined>(undefined);

	// O cartão sempre usa a cor da matéria do caderno (âmbar sem ela).
	const tom = materia?.cor ?? "amber";
	const semanas = useMemo(() => semanasDoMes(mes, { seisSemanas: true }), [mes]);
	const itensDaGradeDoMes = useMemo(() => (agenda ? itensDaGrade(agenda, provas, semanas, materiaId) : new Map<string, ItemCalendario[]>()), [agenda, provas, semanas, materiaId]);
	const itensDoDia = useMemo(
		() => (agenda ? (itensDoIntervalo(agenda, provas, escolhido, escolhido, materiaId).get(escolhido) ?? []) : []),
		[agenda, provas, escolhido, materiaId],
	);
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
		setEscolhido(data);
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

	const marcar = (tarefa: Tarefa) => {
		if (!agenda) return;
		const destino = colunaDaCaixinha(agenda, tarefa);
		// O erro de mover aparece no aviso do cartão (useAgenda.erro).
		if (destino) aberta.moverTarefa(tarefa.id, destino).catch(() => {});
	};

	const tituloMes = capitalizar(nomeDoMes(mes));
	return (
		<section className={`cal-compacto ${classeDoTom(tom)}`} aria-label={`Agenda de ${materia?.nome ?? "a matéria"}`}>
			<header className="cal-compacto__topo">
				<span className="overline cal-compacto__rotulo">Agenda</span>
				<div className="cal-compacto__atalhos">
					<Button
						variant="secondary"
						size="sm"
						iconOnly
						icon="checklist"
						title="Tarefas"
						aria-label="Ver a lista de tarefas"
						onClick={() => navegar(rotaDaAgenda("tarefas", materiaId))}
					/>
					<Button variant="secondary" size="sm" iconOnly icon="chart" title="Quadro" aria-label="Ver o quadro de tarefas" onClick={() => navegar(rotaDaAgenda("quadro", materiaId))} />
					<Button
						variant="secondary"
						size="sm"
						iconOnly
						icon="arrow-up-right"
						title="Tela cheia"
						aria-label="Abrir o calendário em tela cheia"
						onClick={() => navegar(rotaDaAgenda("calendario", materiaId))}
					/>
				</div>
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

			<table className="cal-compacto__grade" role="grid" aria-label={tituloMes} ref={grade}>
				<thead>
					<tr role="row">
						{INICIAIS_DOS_DIAS.map((inicial, indice) => (
							<th key={NOMES_DOS_DIAS[indice]} scope="col" role="columnheader" abbr={NOMES_DOS_DIAS[indice]!} className="overline cal-compacto__cabeca">
								{inicial}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{semanas.map((semana) => (
						<tr key={semana[0]!.data} role="row">
							{semana.map((dia) => {
								const itens = itensDaGradeDoMes.get(dia.data);
								const pontos = pontosDoDia(itens, materias);
								const classes = [
									"cal-dia",
									dia.doMes ? "" : "cal-dia--fora",
									dia.data === hoje ? "cal-dia--hoje" : "",
									dia.data === escolhido ? "cal-dia--escolhido" : "",
								]
									.filter(Boolean)
									.join(" ");
								return (
									<td key={dia.data} role="gridcell" className="cal-compacto__celula">
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
											</span>
										</button>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>

			<div className="cal-compacto__dia">
				<div className="cal-compacto__dia-topo">
					<h4 className="body-strong cal-compacto__dia-titulo">{tituloDoDia(escolhido, hoje)}</h4>
					<Button variant="primary" size="sm" icon="plus" onClick={() => modal.novaTarefa({ data: escolhido, materia: materiaId })} disabled={!agenda}>
						Nova tarefa
					</Button>
				</div>

				{aberta.erro ? (
					<p className="body-sm cal-compacto__erro" role="alert">
						<Icon name="alert" size={16} />
						<span>{aberta.erro.mensagem}</span>
						{aberta.erro.ao === "abrir" ? (
							<button type="button" className="cal-compacto__erro-botao" onClick={() => aberta.recarregar()}>
								Tentar de novo
							</button>
						) : null}
						<button type="button" className="cal-compacto__erro-botao" onClick={() => aberta.fecharErro(aberta.erro!.chave)} aria-label="Fechar o aviso">
							<Icon name="close" size={14} />
						</button>
					</p>
				) : null}

				{!agenda ? (
					<p className="body-sm cal-compacto__vazio">{aberta.erro ? "A agenda não abriu." : "Abrindo a agenda…"}</p>
				) : itensDoDia.length === 0 ? (
					<p className="body-sm cal-compacto__vazio">Nada marcado para este dia.</p>
				) : (
					<ul className="cal-compacto__lista">
						{itensDoDia.map((item) => {
							if (item.tipo === "prova") {
								return (
									<li key={item.id} className="cal-item cal-item--prova">
										<Tag tone="moss" icon="flag" size="sm">
											Prova
										</Tag>
										<span className="body-strong cal-item__titulo">{item.titulo}</span>
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
									<button type="button" className="cal-item__abrir" onClick={() => modal.abrirTarefa(tarefa)} title="Editar a tarefa">
										{item.hora ? <span className="data cal-item__hora">{item.hora}</span> : null}
										<span className="body cal-item__titulo">{item.titulo}</span>
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
			</div>

			<ModalTarefa
				aberto={modal.aberto}
				fechar={modal.fechar}
				colunas={agenda?.colunas ?? []}
				materias={materias}
				acoes={aberta}
				{...(modal.tarefa ? { tarefa: modal.tarefa } : {})}
				{...(modal.inicial ? { inicial: modal.inicial } : {})}
			/>
		</section>
	);
}
