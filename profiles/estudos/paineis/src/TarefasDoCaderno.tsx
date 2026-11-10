// A coluna de tarefas do caderno (docs/agenda.md): um cartão no mesmo visual do
// calendário, na coluna do meio do painel (BaixoDoCaderno.tsx), só com as tarefas
// da matéria do caderno. De cima para baixo:
// - o título "Tarefas" com a contagem das abertas e, à direita, os botões que
//   levam à tela da agenda com a matéria no filtro: a lista completa e o quadro
//   (ficam aqui, e não no calendário, porque são sobre as tarefas; o calendário
//   guarda só o Tela cheia);
// - o aviso de erro da ponte (um mover que a extensão recusou), se houver;
// - na parte que rola: a lista do dia escolhido no calendário ("Hoje, 3 de
//   novembro": a prova com a etiqueta, a tarefa com a caixinha de feita e o
//   clique que abre o ModalTarefa; "Nova tarefa" com a data do dia) e, abaixo,
//   as próximas tarefas abertas agrupadas por prazo (gruposDaLista, de
//   lista-tarefas.ts: Atrasadas, Hoje, Amanhã, Esta semana, Mais tarde e Sem data);
// - no pé, fixo: o campo rápido "Adicionar tarefa…" (Enter cria na hora, na
//   primeira coluna que não é de feito e com a matéria do caderno).
// O dia escolhido, a agenda e o modal vêm de AgendaDoCaderno.tsx.

import { Button, Checkbox, Icon, Tag } from "@estudos/design-system";
import { useValorEstavel } from "@estudos/ui";
import { useMemo } from "react";
import type { Agenda, ItemCalendario, Tarefa } from "../../lib/agenda-tipos.ts";
import type { AgendaAberta } from "./agenda-ponte.ts";
import { colunaDaCaixinha, type InicialTarefa, rotaDaAgenda } from "./agenda-tela.ts";
import { CampoRapido } from "./CampoRapido.tsx";
import { prazoDoItem, tituloDoDia } from "./calendario-tela.ts";
import { criacaoRapida, type GrupoDaLista, gruposDaLista, prazoCurto, totalDosGrupos } from "./lista-tarefas.ts";

export interface PropsTarefasDoCaderno {
	/** A agenda aberta (a ponte): a agenda, o erro e as ações. */
	ponte: AgendaAberta;
	/** O id da matéria do caderno: a lista é só dela, e a tarefa nova nasce com ela. */
	materiaId: string;
	/** O nome da matéria, para o leitor de tela. */
	materiaNome?: string;
	/** A data de hoje, AAAA-MM-DD. */
	hoje: string;
	/** O dia escolhido no calendário, AAAA-MM-DD. */
	escolhido: string;
	/** Os itens do dia escolhido, já na ordem do dia (itensDoIntervalo). */
	itensDoDia: readonly ItemCalendario[];
	abrirTarefa(tarefa: Tarefa): void;
	novaTarefa(inicial: InicialTarefa): void;
	/** Vai a outra subtela do perfil (os botões levam à tela da agenda). */
	navegar(caminho: string): void;
}

/** "3 abertas", "1 aberta" ou "Nenhuma aberta". */
export const contagemDeAbertas = (quantas: number): string => (quantas === 0 ? "Nenhuma aberta" : quantas === 1 ? "1 aberta" : `${quantas} abertas`);

/** As tarefas abertas da matéria, por prazo (as feitas ficam de fora). */
export const proximasDaMateria = (agenda: Agenda, hoje: string, materia: string): GrupoDaLista[] => gruposDaLista(agenda, hoje, { materia, mostrarFeitas: false });

export function TarefasDoCaderno(props: PropsTarefasDoCaderno) {
	const { ponte, materiaId, hoje, escolhido, itensDoDia } = props;
	const { agenda } = ponte;
	const grupos = useMemo(() => (agenda ? proximasDaMateria(agenda, hoje, materiaId) : []), [agenda, hoje, materiaId]);
	const abertas = totalDosGrupos(grupos);
	// "Abrindo a agenda…" só aparece se a agenda demorar mais de 1 s (regra 1 de docs/padroes-de-interface.md).
	const semAgenda = !agenda && !ponte.erro;
	const mostraAbrindo = useValorEstavel(semAgenda, semAgenda, false) && semAgenda;

	const marcar = (tarefa: Tarefa) => {
		if (!agenda) return;
		const destino = colunaDaCaixinha(agenda, tarefa);
		// O erro de mover aparece no aviso do cartão (AgendaAberta.erro).
		if (destino) ponte.moverTarefa(tarefa.id, destino).catch(() => {});
	};
	const criar = (titulo: string) => {
		if (!agenda) return Promise.reject(new Error("A agenda ainda não abriu."));
		const resultado = criacaoRapida(agenda, titulo, { materia: materiaId });
		if ("erro" in resultado) return Promise.reject(new Error(resultado.erro));
		return ponte.criarTarefa(resultado.entrada);
	};

	return (
		<section className="tarefas-cad" aria-label={`Tarefas de ${props.materiaNome ?? "a matéria"}`}>
			<header className="tarefas-cad__topo">
				<div className="tarefas-cad__titulos">
					<h3 className="heading tarefas-cad__titulo">Tarefas</h3>
					{/* O lugar da contagem é reservado até a agenda chegar (visibility), para o título não mudar de altura. */}
					<span className="data tarefas-cad__conta" aria-hidden={!agenda || undefined} style={agenda ? undefined : { visibility: "hidden" }}>
						{contagemDeAbertas(abertas)}
					</span>
				</div>
				<div className="tarefas-cad__atalhos">
					<Button
						variant="secondary"
						size="sm"
						iconOnly
						icon="checklist"
						title="Lista de tarefas"
						aria-label="Ver a lista de tarefas"
						onClick={() => props.navegar(rotaDaAgenda("tarefas", materiaId))}
					/>
					<Button variant="secondary" size="sm" iconOnly icon="chart" title="Quadro" aria-label="Ver o quadro de tarefas" onClick={() => props.navegar(rotaDaAgenda("quadro", materiaId))} />
				</div>
			</header>

			{ponte.erro ? (
				<p className="body-sm agenda__erro" role="alert">
					<Icon name="alert" size={16} />
					<span>{ponte.erro.mensagem}</span>
					{ponte.erro.ao === "abrir" ? (
						<button type="button" className="agenda__erro-botao" onClick={() => ponte.recarregar()}>
							Tentar de novo
						</button>
					) : null}
					<button type="button" className="agenda__erro-botao" onClick={() => ponte.fecharErro(ponte.erro!.chave)} aria-label="Fechar o aviso">
						<Icon name="close" size={14} />
					</button>
				</p>
			) : null}

			<div className="tarefas-cad__corpo">
				<section className="tarefas-cad__dia" aria-label="Lista do dia escolhido">
					<div className="tarefas-cad__dia-topo">
						<h4 className="body-strong tarefas-cad__dia-titulo" aria-live="polite">
							{tituloDoDia(escolhido, hoje)}
						</h4>
						<Button variant="primary" size="sm" icon="plus" onClick={() => props.novaTarefa({ data: escolhido, materia: materiaId })} disabled={!agenda}>
							Nova tarefa
						</Button>
					</div>
					{!agenda ? (
						<p className="body-sm tarefas-cad__vazio" style={!ponte.erro && !mostraAbrindo ? { visibility: "hidden" } : undefined} aria-hidden={(!ponte.erro && !mostraAbrindo) || undefined}>
							{ponte.erro ? "A agenda não abriu." : "Abrindo a agenda…"}
						</p>
					) : itensDoDia.length === 0 ? (
						<p className="body-sm tarefas-cad__vazio">Nada marcado para este dia.</p>
					) : (
						<ul className="tarefas-cad__lista">
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
										<button type="button" className="cal-item__abrir" onClick={() => props.abrirTarefa(tarefa)} title="Editar a tarefa">
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
				</section>

				{!agenda ? (
					// O lugar das próximas é reservado (invisível) até a agenda chegar: a altura não salta.
					<section className="tarefas-cad__proximas" aria-hidden="true" style={{ visibility: "hidden" }}>
						<h4 className="overline tarefas-cad__proximas-titulo">Próximas</h4>
						<p className="body-sm tarefas-cad__vazio">Nenhuma tarefa aberta.</p>
					</section>
				) : null}
				{agenda ? (
					<section className="tarefas-cad__proximas" aria-label="Próximas tarefas abertas">
						<h4 className="overline tarefas-cad__proximas-titulo">Próximas</h4>
						{grupos.length === 0 ? (
							<p className="body-sm tarefas-cad__vazio">Nenhuma tarefa aberta.</p>
						) : (
							grupos.map((grupo) => (
								<section key={grupo.id} className="tarefas-cad__grupo" aria-label={grupo.rotulo}>
									<h5 className="overline lista-grupo__titulo">
										{grupo.id === "atrasadas" ? <Icon name="alert" size={16} strokeWidth={2.5} className="lista-grupo__alerta" /> : null}
										{grupo.rotulo}
										<span className="data lista-grupo__contagem">{grupo.tarefas.length}</span>
									</h5>
									<ul className="tarefas-cad__lista">
										{grupo.tarefas.map((tarefa) => (
											<li key={tarefa.id} className="cal-item">
												<Checkbox
													className="cal-item__caixa"
													checked={false}
													disabled={colunaDaCaixinha(agenda, tarefa) === undefined}
													onChange={() => marcar(tarefa)}
													label={<span className="agenda-so-leitor">{`Marcar a tarefa ${tarefa.titulo} como feita`}</span>}
												/>
												<button type="button" className="cal-item__abrir" onClick={() => props.abrirTarefa(tarefa)} title="Editar a tarefa">
													<span className="body cal-item__titulo">{tarefa.titulo}</span>
													{/* Hoje e Amanhã já dizem o dia no título do grupo; sem data não há o que mostrar. */}
													{tarefa.data && grupo.id !== "hoje" && grupo.id !== "amanha" ? (
														<span className={`data tarefas-cad__data${grupo.id === "atrasadas" ? " tarefas-cad__data--atrasada" : ""}`}>{prazoCurto(tarefa, hoje)}</span>
													) : null}
												</button>
											</li>
										))}
									</ul>
								</section>
							))
						)}
					</section>
				) : null}
			</div>

			{agenda ? <CampoRapido className="tarefas-cad__novo" icon="plus" placeholder="Adicionar tarefa…" rotulo="Adicionar tarefa" criar={criar} /> : null}
		</section>
	);
}
