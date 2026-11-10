// As duas colunas da agenda no painel do caderno (docs/agenda.md): as tarefas
// (TarefasDoCaderno.tsx) e o calendário (CalendarioCompacto.tsx), as duas só com a
// matéria do caderno. É este componente que guarda o que elas dividem:
// - a ponte da agenda (useAgenda), que vem pronta da TelaCaderno (ela fica lá
//   para a agenda conhecida sobreviver quando estas colunas são remontadas) e é
//   pedida de novo quando `vez` muda (as provas vêm do materia.json: depois de
//   editar a matéria a agenda vem de novo);
// - o dia escolhido: o clique no calendário muda a lista do dia na coluna de
//   tarefas; começa em hoje;
// - o ModalTarefa, aberto por qualquer uma das duas.
// Devolve as duas colunas como filhas diretas da grade do BaixoDoCaderno.tsx
// (um fragmento, sem elemento no meio), cada uma num `painel-caderno__coluna`.

import { useMemo, useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";
import { type AgendaAberta, useHoje } from "./agenda-ponte.ts";
import { itensDoIntervalo } from "./calendario-tela.ts";
import { CalendarioCompacto } from "./CalendarioCompacto.tsx";
import { ModalTarefa, useModalTarefa } from "./ModalTarefa.tsx";
import { TarefasDoCaderno } from "./TarefasDoCaderno.tsx";

export interface PropsAgendaDoCaderno {
	/** A ponte da agenda (useAgenda), guardada por quem monta estas colunas. */
	ponte: AgendaAberta;
	/** O id da matéria do caderno. */
	materiaId: string;
	/** A matéria (a cor e o nome); sem ela, âmbar. */
	materia?: Materia;
	/** Vai a outra subtela do perfil (os botões levam à tela da agenda). */
	navegar(caminho: string): void;
}

export function AgendaDoCaderno(props: PropsAgendaDoCaderno) {
	const { ponte, materiaId, materia, navegar } = props;
	const { agenda, provas, materias } = ponte;
	const hoje = useHoje();
	const modal = useModalTarefa();
	const [escolhido, setEscolhido] = useState(hoje);
	const itensDoDia = useMemo(
		() => (agenda ? (itensDoIntervalo(agenda, provas, escolhido, escolhido, materiaId).get(escolhido) ?? []) : []),
		[agenda, provas, escolhido, materiaId],
	);

	return (
		<>
			<div className="painel-caderno__coluna painel-caderno__coluna--tarefas">
				<TarefasDoCaderno
					ponte={ponte}
					materiaId={materiaId}
					{...(materia ? { materiaNome: materia.nome } : {})}
					hoje={hoje}
					escolhido={escolhido}
					itensDoDia={itensDoDia}
					abrirTarefa={modal.abrirTarefa}
					novaTarefa={modal.novaTarefa}
					navegar={navegar}
				/>
			</div>
			<div className="painel-caderno__coluna painel-caderno__coluna--calendario">
				<CalendarioCompacto
					{...(agenda ? { agenda } : {})}
					provas={provas}
					materias={materias}
					materiaId={materiaId}
					{...(materia ? { materia } : {})}
					hoje={hoje}
					escolhido={escolhido}
					escolher={setEscolhido}
					navegar={navegar}
				/>
			</div>
			<ModalTarefa
				aberto={modal.aberto}
				fechar={modal.fechar}
				colunas={agenda?.colunas ?? []}
				materias={materias}
				acoes={ponte}
				{...(modal.tarefa ? { tarefa: modal.tarefa } : {})}
				{...(modal.inicial ? { inicial: modal.inicial } : {})}
			/>
		</>
	);
}
