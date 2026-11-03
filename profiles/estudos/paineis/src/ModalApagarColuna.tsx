// A confirmação de apagar uma coluna do quadro (QuadroTarefas.tsx), num Modal de
// faixa tijolo. Coluna vazia: só confirma. Com tarefas: escolhe para qual outra
// coluna elas vão (para o fim dela, na mesma ordem; na de feito ficam concluídas).
// As tarefas contadas são as do quadro inteiro, mesmo com o filtro de matéria
// ligado. Um erro da extensão (a frase já vem em português) aparece no modal e
// nada fecha.

import { Button, Modal, Select } from "@estudos/design-system";
import { useState } from "react";
import { type Agenda, type Coluna, tarefasDaColuna } from "../../lib/agenda-tipos.ts";
import { destinoPadraoDeApagar, destinosParaApagar } from "./quadro-tarefas.ts";

export interface PropsModalApagarColuna {
	/** A coluna a apagar; sem ela, o modal está fechado. */
	coluna: Coluna | undefined;
	agenda: Agenda;
	fechar(): void;
	/** Apaga a coluna (com o destino das tarefas, se tiver); rejeita com a frase do erro. */
	apagar(id: string, destino?: string): Promise<unknown>;
}

export function ModalApagarColuna(props: PropsModalApagarColuna) {
	// Cada coluna é um conteúdo novo, com a escolha do zero.
	return props.coluna ? <ConteudoModalApagarColuna key={props.coluna.id} {...props} coluna={props.coluna} /> : null;
}

function ConteudoModalApagarColuna(props: PropsModalApagarColuna & { coluna: Coluna }) {
	const { coluna, agenda } = props;
	const tarefas = tarefasDaColuna(agenda, coluna.id).length;
	const destinos = destinosParaApagar(agenda, coluna.id);
	const [destino, setDestino] = useState(() => destinoPadraoDeApagar(agenda, coluna.id) ?? "");
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [ocupado, setOcupado] = useState(false);
	const destinoEscolhido = destinos.find((item) => item.id === destino);

	const confirmar = async () => {
		if (ocupado) return;
		setOcupado(true);
		setErro(undefined);
		try {
			await props.apagar(coluna.id, tarefas > 0 ? destino : undefined);
			props.fechar();
		} catch (falha) {
			setErro(falha instanceof Error && falha.message ? falha.message : "Não consegui apagar a coluna.");
			setOcupado(false);
		}
	};

	return (
		<Modal
			open
			onClose={ocupado ? undefined : props.fechar}
			dismissible={!ocupado}
			tone="brick"
			size="sm"
			kicker="Quadro"
			title={`Apagar a coluna "${coluna.nome}"?`}
			footer={
				<>
					<Button variant="secondary" onClick={props.fechar} disabled={ocupado}>
						Cancelar
					</Button>
					<Button variant="danger" onClick={() => void confirmar()} disabled={ocupado || (tarefas > 0 && !destinoEscolhido)}>
						Apagar coluna
					</Button>
				</>
			}
		>
			<div className="quadro-apagar">
				{tarefas === 0 ? (
					<p className="body">A coluna está vazia: nenhuma tarefa é apagada.</p>
				) : (
					<>
						<p className="body">
							{tarefas === 1 ? "A coluna tem 1 tarefa." : `A coluna tem ${tarefas} tarefas.`} Nenhuma é apagada: elas vão para o fim da coluna que você escolher, na mesma ordem.
						</p>
						<Select
							label="Mandar as tarefas para"
							options={destinos.map((item) => ({ value: item.id, label: item.feito ? `${item.nome} (feito)` : item.nome }))}
							value={destino}
							onChange={(evento) => setDestino(evento.target.value)}
							disabled={ocupado}
						/>
						{destinoEscolhido?.feito ? <p className="body-sm quadro-apagar__nota">Nessa coluna as tarefas ficam concluídas.</p> : null}
					</>
				)}
				{erro ? (
					<p className="body-sm quadro-apagar__erro" role="alert">
						{erro}
					</p>
				) : null}
			</div>
		</Modal>
	);
}
