// A casca da tela da agenda (docs/agenda.md): a subtela do perfil no caminho
// agenda/<aba>[/<matéria>], com as abas calendario (a padrão), tarefas e
// quadro; a matéria do caminho filtra tudo (sem ela, todas as matérias). No
// topo, uma barra no estilo da aba tijolo do caderno (as classes ap-cbar da
// CourseBar): o voltar (para o caderno do filtro, ou para as matérias), o título,
// as três abas (SeletorAbas), o filtro de matéria (com a cor da escolhida) e
// "Nova tarefa". Embaixo, a aba escolhida (CalendarioCheio, ListaTarefas ou
// QuadroTarefas), que recebe as props combinadas (PropsAbaAgenda, agenda-tela.ts).
//
// A casca guarda o useAgenda e o ModalTarefa, para as três abas dividirem os
// dois. Trocar de aba ou de matéria navega (o F5 e o histórico voltam na mesma
// tela). Um erro de mover ou do abrir aparece num aviso embaixo da barra.

import { Button, EmptyState, Icon, Select } from "@estudos/design-system";
import { type JanelaPerfilHook, type PropsTelaInicial, semMovimento, useValorEstavel } from "@estudos/ui";
import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { useAgenda, useHoje } from "./agenda-ponte.ts";
import { ABAS_DA_AGENDA, type AbaAgenda, FILTROS_INICIAIS, type FiltrosLista, type InicialTarefa, type MemoriaDaAgenda, opcoesDeMateria, type PropsAbaAgenda, rotaDaAgenda, rotaDeVoltarDaAgenda } from "./agenda-tela.ts";
import { classeDoTom, tomDaMateria } from "./calendario-tela.ts";
import { CalendarioCheio } from "./CalendarioCheio.tsx";
import { ListaTarefas } from "./ListaTarefas.tsx";
import { ModalTarefa, useModalTarefa } from "./ModalTarefa.tsx";
import { QuadroTarefas } from "./QuadroTarefas.tsx";
import { idDaAba, idDoPainel, SeletorAbas } from "./SeletorTags.tsx";

export interface PropsTelaAgenda extends PropsTelaInicial {
	janela: JanelaPerfilHook;
	aba: AbaAgenda;
	/** O id da matéria do filtro; sem ele, todas. */
	materia?: string;
}

export function TelaAgenda(props: PropsTelaAgenda) {
	const { aba, materia, navegar } = props;
	const aberta = useAgenda(props.janela);
	const { agenda, provas, materias } = aberta;
	const hoje = useHoje();
	const modal = useModalTarefa();
	const baseIds = useId();
	const parado = semMovimento();

	// O que as abas dividem e não pode zerar ao trocar de aba: o dia escolhido do calendário e os filtros da lista.
	const [escolhido, setEscolhido] = useState(hoje);
	const [filtros, setFiltros] = useState<FiltrosLista>(FILTROS_INICIAIS);
	const memoria = useMemo<MemoriaDaAgenda>(
		() => ({ escolhido, definirEscolhido: setEscolhido, filtros, definirFiltros: setFiltros }),
		[escolhido, filtros],
	);

	// Enquanto a lista de matérias não chegou, o nome e a cor do filtro esperam (nada do id cru nem a cor neutra por um instante).
	const aguardandoMaterias = Boolean(materia) && materias.length === 0;
	const nomeDaMateria = materia ? (aguardandoMaterias ? " " : (materias.find((item) => item.id === materia)?.nome ?? materia)) : undefined;
	const tomDoFiltro = materia ? tomDaMateria(materia, materias) : "neutro";
	// "Abrindo a agenda…" só aparece se demorar mais de 1 s (regra 1 de docs/padroes-de-interface.md).
	const semAgenda = !agenda && !aberta.erro;
	const mostraAbrindo = useValorEstavel(semAgenda, semAgenda, false) && semAgenda;
	const novaTarefa = (inicial?: InicialTarefa) => modal.novaTarefa({ ...(materia ? { materia } : {}), ...inicial });

	const abaProps: PropsAbaAgenda | undefined = agenda
		? { agenda, provas, materias, ...(materia ? { materia } : {}), hoje, acoes: aberta, abrirTarefa: modal.abrirTarefa, novaTarefa, memoria }
		: undefined;

	return (
		<div className="agenda">
			<header className="ap-cbar agenda__barra">
				<button type="button" className="ap-cbar__back button" onClick={() => navegar(rotaDeVoltarDaAgenda(materia))}>
					<Icon name="arrow-left" size={18} strokeWidth={2.5} />
					{materia ? "Caderno" : "Matérias"}
				</button>
				<div className="ap-cbar__course agenda__titulo">
					<div className="ap-cbar__titles">
						<span className="ap-cbar__kicker overline">{nomeDaMateria ?? "Todas as matérias"}</span>
						<span className="ap-cbar__title display-sm">Agenda</span>
					</div>
				</div>
				<SeletorAbas rotulo="Telas da agenda" abas={ABAS_DA_AGENDA} base={baseIds} atual={aba} escolher={(nova) => navegar(rotaDaAgenda(nova, materia))} />
				<span className="agenda__espaco" />
				<div className="agenda__filtro">
					<span className={`agenda__tom ${classeDoTom(tomDoFiltro)}`} aria-hidden="true" style={aguardandoMaterias ? { visibility: "hidden" } : undefined} />
					<Select
						size="sm"
						aria-label="Filtrar por matéria"
						options={aguardandoMaterias && materia ? [{ value: materia, label: " " }] : opcoesDeMateria(materias, materia)}
						value={materia ?? ""}
						onChange={(evento) => navegar(rotaDaAgenda(aba, evento.target.value || undefined))}
					/>
				</div>
				<Button variant="primary" icon="plus" className="agenda__nova" onClick={() => novaTarefa()} disabled={!agenda}>
					Nova tarefa
				</Button>
			</header>

			{aberta.erro ? (
				<p className="body-sm agenda__erro" role="alert">
					<Icon name="alert" size={16} />
					<span>{aberta.erro.mensagem}</span>
					{aberta.erro.ao === "abrir" ? (
						<Button variant="ghost" size="sm" onClick={() => aberta.recarregar()}>
							Tentar de novo
						</Button>
					) : null}
					<Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Fechar o aviso" onClick={() => aberta.fecharErro(aberta.erro!.chave)} />
				</p>
			) : null}

			{/* O painel fica montado ao trocar de aba; só o conteúdo da aba troca, com um fade curto de opacidade (regra 7 de docs/padroes-de-interface.md). */}
			<main id={idDoPainel(baseIds)} role="tabpanel" aria-labelledby={idDaAba(baseIds, aba)} className="agenda__corpo">
				<motion.div
					key={aba}
					className="agenda__aba"
					initial={parado ? false : { opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
				>
					{!abaProps ? (
						aberta.erro ? (
							<div className="agenda__vazio">
								<EmptyState glyph="問" title="A agenda não abriu">
									Veja o aviso acima e tente de novo.
								</EmptyState>
							</div>
						) : (
							<p className="body agenda__carregando" style={{ visibility: mostraAbrindo ? "visible" : "hidden" }} aria-hidden={!mostraAbrindo}>
								Abrindo a agenda…
							</p>
						)
					) : aba === "tarefas" ? (
						<ListaTarefas {...abaProps} />
					) : aba === "quadro" ? (
						<QuadroTarefas {...abaProps} />
					) : (
						<CalendarioCheio {...abaProps} />
					)}
				</motion.div>
			</main>

			<ModalTarefa
				aberto={modal.aberto}
				fechar={modal.fechar}
				colunas={agenda?.colunas ?? []}
				materias={materias}
				acoes={aberta}
				{...(modal.tarefa ? { tarefa: modal.tarefa } : {})}
				{...(modal.inicial ? { inicial: modal.inicial } : {})}
			/>
		</div>
	);
}
