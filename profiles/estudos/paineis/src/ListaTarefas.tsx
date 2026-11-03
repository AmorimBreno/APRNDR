// A aba Tarefas da tela da agenda (docs/agenda.md): as tarefas, respeitando o
// filtro de matéria da tela, agrupadas por prazo (lista-tarefas.ts): Atrasadas,
// Hoje, Amanhã, Esta semana, Mais tarde, Sem data e, no fim, as Feitas
// (recolhidas, com a contagem). De cima para baixo:
// - o campo "Adicionar tarefa…" (Enter cria na hora, só com o título, na
//   primeira coluna que não é de feito e com a matéria do filtro; um erro
//   aparece embaixo do campo) e dois filtros pequenos: a coluna e "Mostrar feitas";
// - os grupos. Cada linha tem a caixinha de feita (move para a coluna de feito,
//   ou reabre para a primeira que não é), o título, a data e a hora curtas, a
//   matéria com a bolinha da cor e a coluna como etiqueta; clicar na linha abre
//   a tarefa no modal da casca.
//
// Props (PropsAbaAgenda, agenda-tela.ts): agenda (com as mudanças otimistas do
// mover), materias (as cores, em tomDaMateria), materia (o filtro), hoje, acoes
// (a ponte) e abrirTarefa/novaTarefa (o ModalTarefa da casca). Se mover falhar,
// a casca mostra o aviso e a tarefa volta sozinha.

import { Checkbox, EmptyState, Icon, Select, Switch, Tag } from "@estudos/design-system";
import { useId, useMemo, useState } from "react";
import type { Tarefa } from "../../lib/agenda-tipos.ts";
import { colunaDaCaixinha, type PropsAbaAgenda, tarefasDaMateria } from "./agenda-tela.ts";
import { CampoRapido } from "./CampoRapido.tsx";
import { classeDoTom, nomeDaMateria, prazoDaData, tomDaMateria } from "./calendario-tela.ts";
import { criacaoRapida, gruposDaLista, type GrupoDaLista, opcoesDeColuna, prazoCurto, totalDosGrupos } from "./lista-tarefas.ts";

export function ListaTarefas(props: PropsAbaAgenda) {
	const { agenda, materia, hoje, acoes } = props;
	const [coluna, setColuna] = useState("");
	const [mostrarFeitas, setMostrarFeitas] = useState(true);
	const [feitasAbertas, setFeitasAbertas] = useState(false);
	const idFeitas = useId();

	// Uma coluna apagada depois de escolhida no filtro volta a "Todas".
	const colunaDoFiltro = agenda.colunas.some((item) => item.id === coluna) ? coluna : "";
	const grupos = useMemo(
		() => gruposDaLista(agenda, hoje, { ...(materia ? { materia } : {}), ...(colunaDoFiltro ? { coluna: colunaDoFiltro } : {}), mostrarFeitas }),
		[agenda, hoje, materia, colunaDoFiltro, mostrarFeitas],
	);
	const colunasPorId = useMemo(() => new Map(agenda.colunas.map((item) => [item.id, item])), [agenda.colunas]);
	const filtroEhDeFeito = colunasPorId.get(colunaDoFiltro)?.feito === true;

	const marcar = (tarefa: Tarefa) => {
		const destino = colunaDaCaixinha(agenda, tarefa);
		// O erro de mover aparece no aviso da casca.
		if (destino) acoes.moverTarefa(tarefa.id, destino).catch(() => {});
	};

	const criar = (titulo: string) => {
		const resultado = criacaoRapida(agenda, titulo, materia ? { materia } : {});
		if ("erro" in resultado) return Promise.reject(new Error(resultado.erro));
		return acoes.criarTarefa(resultado.entrada);
	};

	return (
		<div className="lista-tarefas">
			<div className="lista-tarefas__topo">
				<CampoRapido
					className="lista-tarefas__novo"
					icon="plus"
					placeholder="Adicionar tarefa…"
					rotulo="Adicionar tarefa"
					criar={criar}
				/>
				<div className="lista-tarefas__filtros">
					<Select
						size="sm"
						aria-label="Filtrar por coluna"
						options={opcoesDeColuna(agenda.colunas)}
						value={colunaDoFiltro}
						onChange={(evento) => setColuna(evento.target.value)}
					/>
					<Switch label="Mostrar feitas" checked={mostrarFeitas || filtroEhDeFeito} disabled={filtroEhDeFeito} onChange={(evento) => setMostrarFeitas(evento.target.checked)} />
				</div>
			</div>

			{grupos.length === 0 ? (
				<div className="agenda__vazio">{vazio(props, colunaDoFiltro, mostrarFeitas)}</div>
			) : (
				<div className="lista-tarefas__grupos">
					{grupos.map((grupo) => (
						<GrupoDaListaTarefas
							key={grupo.id}
							grupo={grupo}
							props={props}
							marcar={marcar}
							recolhido={grupo.id === "feitas" && !feitasAbertas && !filtroEhDeFeito}
							alternar={filtroEhDeFeito ? undefined : () => setFeitasAbertas((atual) => !atual)}
							idLista={`${idFeitas}-${grupo.id}`}
						/>
					))}
					<p className="body-sm lista-tarefas__total">
						{totalDosGrupos(grupos) === 1 ? "1 tarefa" : `${totalDosGrupos(grupos)} tarefas`}
					</p>
				</div>
			)}
		</div>
	);
}

/** O que a lista diz quando não tem nada para mostrar. */
function vazio(props: PropsAbaAgenda, coluna: string, mostrarFeitas: boolean) {
	const { agenda, materia } = props;
	const feitas = tarefasDaMateria(agenda, materia).filter((tarefa) => agenda.colunas.find((item) => item.id === tarefa.coluna)?.feito).length;
	if (!mostrarFeitas && !coluna && feitas > 0) {
		return (
			<EmptyState glyph="完" title="Tudo feito" tone="sage">
				Ligue "Mostrar feitas" para rever o que você concluiu.
			</EmptyState>
		);
	}
	if (coluna) {
		return (
			<EmptyState glyph="新" title="Nenhuma tarefa nesta coluna">
				Mude o filtro de coluna ou escreva uma tarefa no campo acima.
			</EmptyState>
		);
	}
	return (
		<EmptyState glyph="新" title="Nenhuma tarefa ainda">
			Escreva uma no campo acima, ou use "Nova tarefa" para marcar a data e a matéria.
		</EmptyState>
	);
}

interface PropsGrupo {
	grupo: GrupoDaLista;
	props: PropsAbaAgenda;
	marcar(tarefa: Tarefa): void;
	/** As feitas recolhidas (só o cabeçalho). */
	recolhido: boolean;
	/** Só as feitas recolhem: o clique no cabeçalho. Sem ele, o cabeçalho é só um título. */
	alternar: (() => void) | undefined;
	idLista: string;
}

/** Um grupo de prazo: o título com a contagem e as linhas. As feitas têm um botão que recolhe e abre. */
function GrupoDaListaTarefas({ grupo, props, marcar, recolhido, alternar, idLista }: PropsGrupo) {
	const feitas = grupo.id === "feitas";
	const contagem = <span className="data lista-grupo__contagem">{grupo.tarefas.length}</span>;
	return (
		<section className={`lista-grupo lista-grupo--${grupo.id}`} aria-label={grupo.rotulo}>
			{feitas && alternar ? (
				<h3 className="lista-grupo__titulo">
					<button type="button" className="overline lista-grupo__alternar" aria-expanded={!recolhido} aria-controls={idLista} onClick={alternar}>
						<Icon name="chevron-right" size={16} strokeWidth={2.5} className="lista-grupo__seta" />
						{grupo.rotulo}
						{contagem}
					</button>
				</h3>
			) : (
				<h3 className="overline lista-grupo__titulo">
					{grupo.id === "atrasadas" ? <Icon name="alert" size={16} strokeWidth={2.5} className="lista-grupo__alerta" /> : null}
					{grupo.rotulo}
					{contagem}
				</h3>
			)}
			{recolhido ? null : (
				<ul id={idLista} className="lista-grupo__linhas">
					{grupo.tarefas.map((tarefa) => (
						<LinhaDaLista key={tarefa.id} tarefa={tarefa} props={props} marcar={marcar} />
					))}
				</ul>
			)}
		</section>
	);
}

/** Uma tarefa: a caixinha de feita e, num botão que abre a tarefa, o título, a data, a matéria e a coluna. */
function LinhaDaLista({ tarefa, props, marcar }: { tarefa: Tarefa; props: PropsAbaAgenda; marcar(tarefa: Tarefa): void }) {
	const { agenda, materias, hoje } = props;
	const coluna = agenda.colunas.find((item) => item.id === tarefa.coluna);
	const feita = coluna?.feito === true;
	const prazo = prazoCurto(tarefa, hoje);
	const atrasada = prazoDaData(tarefa.data, hoje, !feita) === "atrasada";
	const nomeMateria = nomeDaMateria(tarefa.materia, materias);
	return (
		<li className={`lista-linha ${classeDoTom(tomDaMateria(tarefa.materia, materias))}${feita ? " lista-linha--feita" : ""}`}>
			<Checkbox
				className="lista-linha__caixa"
				checked={feita}
				disabled={colunaDaCaixinha(agenda, tarefa) === undefined}
				onChange={() => marcar(tarefa)}
				label={<span className="agenda-so-leitor">{feita ? `Reabrir a tarefa ${tarefa.titulo}` : `Marcar a tarefa ${tarefa.titulo} como feita`}</span>}
			/>
			<button type="button" className="lista-linha__abrir" onClick={() => props.abrirTarefa(tarefa)} title="Editar a tarefa">
				<span className="body lista-linha__titulo">{tarefa.titulo}</span>
				<span className="lista-linha__meta">
					{prazo ? (
						<span className={`data lista-linha__data${atrasada ? " lista-linha__data--atrasada" : ""}`}>
							{atrasada ? <Icon name="alert" size={14} strokeWidth={2.5} label="Atrasada" /> : null}
							{prazo}
						</span>
					) : null}
					{nomeMateria ? (
						<span className="body-sm lista-linha__materia">
							<i className="lista-ponto" aria-hidden="true" />
							{nomeMateria}
						</span>
					) : null}
					{coluna ? (
						<Tag size="sm" tone="outline" className="lista-linha__coluna">
							{coluna.nome}
						</Tag>
					) : null}
				</span>
			</button>
		</li>
	);
}
