// O modal de uma tarefa da agenda (docs/agenda.md): criar ou editar, com título,
// nota, data, hora, matéria (um Select com "Sem matéria") e coluna (outro Select).
// Na edição tem "Apagar", que pede confirmação no próprio modal (a faixa vira
// tijolo). Todas as telas da agenda usam este modal: o calendário compacto do
// caderno e a tela da agenda (as abas pedem o modal pela casca, TelaAgenda.tsx).
//
// Abre com valores iniciais (a data do dia clicado, a matéria do caderno…) ou
// com a tarefa que se edita. Os campos são lidos de novo toda vez que o modal
// abre (o conteúdo remonta com uma chave nova), então o que o Breno digitou e
// não salvou não volta na próxima abertura. Salvar espera a resposta da
// extensão: um erro dela (a frase já vem em português) aparece no modal e nada
// fecha. Mudar a coluna de uma tarefa que se edita é mover a tarefa para o fim
// da coluna nova. As regras do formulário estão em agenda-tela.ts.

import { Button, Modal, Select, TextArea, TextField } from "@estudos/design-system";
import { type FormEvent, useCallback, useState } from "react";
import { type Coluna, LIMITE_NOTA, LIMITE_TITULO, type MateriaDaAgenda, type Tarefa } from "../../lib/agenda-tipos.ts";
import type { AcoesDaAgenda } from "./agenda-ponte.ts";
import { RotuloEstado } from "./RotuloEstado.tsx";
import { entradaDoForm, erroDoForm, type FormTarefa, formDaTarefa, type InicialTarefa, mudancasDoForm, semMudancas } from "./agenda-tela.ts";

export interface PropsModalTarefa {
	aberto: boolean;
	fechar(): void;
	/** As colunas do quadro, na ordem dele. */
	colunas: Coluna[];
	/** Todas as matérias, para o Select. */
	materias: MateriaDaAgenda[];
	/** As ações da ponte que o modal usa (useAgenda devolve todas). */
	acoes: Pick<AcoesDaAgenda, "criarTarefa" | "editarTarefa" | "moverTarefa" | "apagarTarefa">;
	/** Com ela, o modal edita esta tarefa; sem ela, cria uma nova. */
	tarefa?: Tarefa;
	/** Os valores com que a tarefa nova abre (a data do dia, a matéria do caderno…). Vale só sem `tarefa`. */
	inicial?: InicialTarefa;
	/** Chamado depois de criar (com o id da tarefa nova), editar ou apagar, antes de fechar. */
	concluido?(resultado: { acao: "criou" | "editou" | "apagou"; id: string }): void;
}

/** O que o modal mostra agora: a tarefa que se edita ou os valores da tarefa nova; null = fechado. */
type EstadoModalTarefa = { tarefa?: Tarefa; inicial?: InicialTarefa } | null;

/**
 * O estado do modal de tarefa para uma tela: `abrirTarefa` abre para editar (guarda a tarefa como estava, para o modal
 * não virar "Nova tarefa" no instante em que a agenda nova chega sem ela, depois de apagar), `novaTarefa` abre para criar
 * com os valores iniciais. Passe `aberto`, `tarefa`, `inicial` e `fechar` ao ModalTarefa.
 */
export function useModalTarefa() {
	const [estado, setEstado] = useState<EstadoModalTarefa>(null);
	const abrirTarefa = useCallback((tarefa: Tarefa) => setEstado({ tarefa }), []);
	const novaTarefa = useCallback((inicial?: InicialTarefa) => setEstado(inicial ? { inicial } : {}), []);
	const fechar = useCallback(() => setEstado(null), []);
	return { aberto: estado !== null, tarefa: estado?.tarefa, inicial: estado?.inicial, abrirTarefa, novaTarefa, fechar };
}

/** A frase de um erro da ponte, ou uma frase geral. */
const frase = (falha: unknown) => (falha instanceof Error && falha.message ? falha.message : "Não consegui salvar a tarefa.");

export function ModalTarefa(props: PropsModalTarefa) {
	// Cada abertura (e cada tarefa) é um conteúdo novo, com os campos do zero.
	return <ConteudoModalTarefa key={`${props.aberto ? "aberto" : "fechado"}:${props.tarefa?.id ?? "nova"}`} {...props} />;
}

function ConteudoModalTarefa(props: PropsModalTarefa) {
	const { tarefa, colunas, materias, acoes } = props;
	const editando = tarefa !== undefined;
	const [form, setForm] = useState<FormTarefa>(() => formDaTarefa(tarefa, props.inicial, colunas));
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [ocupado, setOcupado] = useState(false);
	const [confirmando, setConfirmando] = useState(false);
	const mudar = (campo: keyof FormTarefa, valor: string) => setForm((atual) => ({ ...atual, [campo]: valor }));

	// Uma matéria que sumiu depois continua escolhível na tarefa que ainda aponta para ela.
	const opcoesMateria = [
		{ value: "", label: "Sem matéria" },
		...materias.map((materia) => ({ value: materia.id, label: materia.nome })),
		...(form.materia && !materias.some((materia) => materia.id === form.materia) ? [{ value: form.materia, label: form.materia }] : []),
	];
	const opcoesColuna = colunas.map((coluna) => ({ value: coluna.id, label: coluna.nome }));
	const colunaEscolhida = colunas.find((coluna) => coluna.id === form.coluna);

	/** Roda o trabalho esperando a extensão; um erro fica no modal e nada fecha. */
	const rodar = async (trabalho: () => Promise<{ acao: "criou" | "editou" | "apagou"; id: string } | undefined>) => {
		setErro(undefined);
		setOcupado(true);
		try {
			const resultado = await trabalho();
			if (resultado) props.concluido?.(resultado);
			props.fechar();
		} catch (falha) {
			setOcupado(false);
			setErro(frase(falha));
		}
	};

	const salvar = (evento?: FormEvent) => {
		evento?.preventDefault();
		if (ocupado) return;
		const problema = erroDoForm(form);
		if (problema) {
			setErro(problema);
			return;
		}
		if (!tarefa) {
			void rodar(async () => ({ acao: "criou", id: (await acoes.criarTarefa(entradaDoForm(form))).criada ?? "" }));
			return;
		}
		const alteracao = mudancasDoForm(tarefa, form);
		void rodar(async () => {
			if (semMudancas(alteracao)) return undefined;
			if (Object.keys(alteracao.mudancas).length > 0) await acoes.editarTarefa(tarefa.id, alteracao.mudancas);
			if (alteracao.coluna) await acoes.moverTarefa(tarefa.id, alteracao.coluna);
			return { acao: "editou", id: tarefa.id };
		});
	};

	const apagar = () => {
		if (!tarefa || ocupado) return;
		void rodar(async () => {
			await acoes.apagarTarefa(tarefa.id);
			return { acao: "apagou", id: tarefa.id };
		});
	};

	if (confirmando && tarefa) {
		return (
			<Modal
				open={props.aberto}
				onClose={props.fechar}
				title="Apagar tarefa"
				kicker="Agenda"
				size="md"
				tone="brick"
				dismissible={!ocupado}
				footer={
					<>
						<Button variant="ghost" onClick={() => setConfirmando(false)} disabled={ocupado}>
							Voltar
						</Button>
						<Button variant="danger" icon="close" onClick={apagar} disabled={ocupado}>
							<RotuloEstado ocupado={ocupado} repouso="Apagar tarefa" passageiro="Apagando…" />
						</Button>
					</>
				}
			>
				<div className="tarefa-modal">
					<p className="body tarefa-modal__confirma">
						Apagar “{tarefa.titulo}”? Não dá para desfazer.
					</p>
					{erro ? (
						<p className="body-sm tarefa-modal__erro" role="alert">
							{erro}
						</p>
					) : null}
				</div>
			</Modal>
		);
	}

	return (
		<Modal
			open={props.aberto}
			onClose={props.fechar}
			title={editando ? "Editar tarefa" : "Nova tarefa"}
			kicker="Agenda"
			size="md"
			dismissible={!ocupado}
			footer={
				<>
					{editando ? (
						<Button variant="ghost" icon="close" className="tarefa-modal__apagar" onClick={() => setConfirmando(true)} disabled={ocupado}>
							Apagar
						</Button>
					) : null}
					<Button variant="ghost" onClick={props.fechar} disabled={ocupado}>
						Cancelar
					</Button>
					<Button variant="primary" iconRight={editando ? "check" : "arrow-right"} onClick={() => salvar()} disabled={ocupado}>
						<RotuloEstado ocupado={ocupado} repouso={editando ? "Salvar" : "Criar tarefa"} passageiro="Salvando…" />
					</Button>
				</>
			}
		>
			<form className="tarefa-modal" onSubmit={salvar}>
				<TextField label="Título" placeholder="Resolver a lista 3" value={form.titulo} maxLength={LIMITE_TITULO} onChange={(evento) => mudar("titulo", evento.target.value)} autoFocus />
				<TextArea
					label="Nota"
					placeholder="Exercícios 4 a 9."
					value={form.nota}
					maxLength={LIMITE_NOTA}
					rows={3}
					onChange={(evento) => mudar("nota", evento.target.value)}
				/>
				<div className="tarefa-modal__par">
					<TextField
						label="Data"
						type="date"
						value={form.data}
						onChange={(evento) => setForm((atual) => ({ ...atual, data: evento.target.value, hora: evento.target.value ? atual.hora : "" }))}
						hint="Com data, a tarefa aparece no calendário."
					/>
					<TextField
						label="Hora"
						type="time"
						value={form.hora}
						disabled={!form.data}
						onChange={(evento) => mudar("hora", evento.target.value)}
						hint={form.data ? "Opcional." : "Escolha uma data primeiro."}
					/>
				</div>
				<div className="tarefa-modal__par">
					<Select label="Matéria" options={opcoesMateria} value={form.materia} onChange={(evento) => mudar("materia", evento.target.value)} />
					<Select
						label="Coluna"
						options={opcoesColuna}
						value={form.coluna}
						onChange={(evento) => mudar("coluna", evento.target.value)}
						{...(colunaEscolhida?.feito ? { hint: "Esta é a coluna de feito: a tarefa fica concluída." } : {})}
					/>
				</div>
				{erro ? (
					<p className="body-sm tarefa-modal__erro" role="alert">
						{erro}
					</p>
				) : null}
				{/* Enter no campo salva: o form precisa de um submit. */}
				<button type="submit" hidden />
			</form>
		</Modal>
	);
}
