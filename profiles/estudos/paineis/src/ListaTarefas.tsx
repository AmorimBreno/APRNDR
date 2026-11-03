// A aba Tarefas da tela da agenda: a lista das tarefas (atrasadas, por dia e sem data).
// Hoje é só o lugar da aba: a casca (TelaAgenda.tsx) já passa tudo pronto e o
// próximo passo escreve o conteúdo aqui.
//
// Props (PropsAbaAgenda, agenda-tela.ts):
// - agenda: a agenda como a tela mostra (com as mudanças otimistas do mover);
// - provas e materias: as provas e as matérias de todas as matérias (cores em
//   tomDaMateria, calendario-tela.ts);
// - materia: o id da matéria do filtro; sem ele, todas (tarefasDaMateria,
//   agenda-tela.ts, e os itens de calendario-tela.ts já aceitam o filtro);
// - hoje: AAAA-MM-DD, atualizado na virada do dia;
// - acoes: as ações da ponte (moverTarefa, marcarFeito, criarColuna…), cada uma
//   uma promessa que rejeita com ErroDaPonte;
// - abrirTarefa(tarefa) e novaTarefa(inicial?): abrem o ModalTarefa da casca.

import { EmptyState } from "@estudos/design-system";
import type { PropsAbaAgenda } from "./agenda-tela.ts";

export function ListaTarefas(_props: PropsAbaAgenda) {
	return (
		<div className="agenda__vazio">
			<EmptyState glyph="新" title="Em construção">
				A lista de tarefas vai aparecer aqui.
			</EmptyState>
		</div>
	);
}
