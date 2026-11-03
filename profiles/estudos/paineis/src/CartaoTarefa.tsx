// O cartão de uma tarefa no quadro (QuadroTarefas.tsx): o título, a data e a hora
// com o rótulo do prazo (atrasada em âmbar), a matéria com a bolinha da cor e a
// primeira linha da nota. Clicar (ou Enter) abre a tarefa no modal da casca.
// Pelo mouse o cartão se arrasta (useArrastoQuadro.ts); pelo teclado, com o foco
// nele, Alt+setas esquerda e direita mudam de coluna e Alt+setas cima e baixo mudam
// o lugar na coluna; e o botão "Mover para…" (um menu com as colunas) leva a tarefa
// para o fim da coluna escolhida.
//
// A raiz é o <li> com data-cartao (o lugar de soltar é medido nele). O cartão em si
// é um role="button" focável; o menu de mover fica ao lado dele, não dentro (um
// botão não cabe dentro de outro). ConteudoDoCartao também desenha o cartão que
// segue o ponteiro durante o arrasto.

import { Icon } from "@estudos/design-system";
import { MenuSuspenso } from "@estudos/ui";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Agenda, MateriaDaAgenda, Tarefa } from "../../lib/agenda-tipos.ts";
import { classeDoTom, nomeDaMateria, prazoDaData, ROTULOS_DO_PRAZO, tomDaMateria } from "./calendario-tela.ts";
import { prazoCurto } from "./lista-tarefas.ts";
import { type DirecaoDoCartao, direcaoDaTecla, previaDaNota } from "./quadro-tarefas.ts";

export interface PropsConteudoDoCartao {
	tarefa: Tarefa;
	agenda: Agenda;
	materias: MateriaDaAgenda[];
	hoje: string;
}

/** O que o cartão mostra: título, data com o prazo, matéria e a linha da nota. */
export function ConteudoDoCartao({ tarefa, agenda, materias, hoje }: PropsConteudoDoCartao) {
	const feita = agenda.colunas.find((coluna) => coluna.id === tarefa.coluna)?.feito === true;
	const prazo = prazoCurto(tarefa, hoje);
	const situacao = prazoDaData(tarefa.data, hoje, !feita);
	const materia = nomeDaMateria(tarefa.materia, materias);
	const previa = previaDaNota(tarefa.nota);
	return (
		<>
			<span className={`body-strong quadro-cartao__titulo${feita ? " quadro-cartao__titulo--feita" : ""}`}>{tarefa.titulo}</span>
			{prazo || materia ? (
				<span className="quadro-cartao__meta">
					{prazo ? (
						<span className={`data quadro-cartao__data${situacao === "atrasada" ? " quadro-cartao__data--atrasada" : ""}`}>
							{situacao === "atrasada" ? <Icon name="alert" size={14} strokeWidth={2.5} /> : <Icon name="clock" size={14} />}
							{prazo}
							{situacao ? <span className="quadro-cartao__prazo">{ROTULOS_DO_PRAZO[situacao]}</span> : null}
						</span>
					) : null}
					{materia ? (
						<span className="body-sm quadro-cartao__materia">
							<i className="lista-ponto" aria-hidden="true" />
							{materia}
						</span>
					) : null}
				</span>
			) : null}
			{previa ? <span className="body-sm quadro-cartao__nota">{previa}</span> : null}
		</>
	);
}

export interface PropsCartaoTarefa extends PropsConteudoDoCartao {
	/** As colunas do quadro, para o menu "Mover para…". */
	colunas: Array<{ id: string; nome: string }>;
	/** Este é o cartão que se arrasta agora: fica apagado no lugar. */
	arrastando: boolean;
	/** A linha do lugar de soltar: logo antes deste cartão ou logo depois dele. */
	marca?: "antes" | "depois";
	/** O id do texto que explica as teclas (descrição do cartão). */
	idDaAjuda: string;
	abrir(): void;
	/** Leva a tarefa ao fim da coluna (o menu). */
	moverPara(coluna: string): void;
	moverComTeclado(direcao: DirecaoDoCartao): void;
	aoPressionar(evento: PointerEvent<HTMLElement>): void;
	/** O clique que vem do fim de um arrasto não abre o cartão. */
	cliqueDoArrasto(): boolean;
}

export function CartaoTarefa(props: PropsCartaoTarefa) {
	const { tarefa } = props;
	const tecla = (evento: KeyboardEvent<HTMLElement>) => {
		if (evento.target !== evento.currentTarget) return;
		if (evento.altKey && !evento.ctrlKey && !evento.metaKey && !evento.shiftKey) {
			const direcao = direcaoDaTecla(evento.key);
			if (direcao) {
				evento.preventDefault();
				props.moverComTeclado(direcao);
			}
			return;
		}
		if (evento.key === "Enter" || evento.key === " ") {
			evento.preventDefault();
			props.abrir();
		}
	};
	const classes = ["quadro-item", props.arrastando ? "quadro-item--arrastando" : "", props.marca ? `quadro-item--${props.marca}` : ""].filter(Boolean).join(" ");
	return (
		<li className={classes} data-cartao={tarefa.id}>
			<div
				className={`quadro-cartao ${classeDoTom(tomDaMateria(tarefa.materia, props.materias))}`}
				role="button"
				tabIndex={0}
				aria-describedby={props.idDaAjuda}
				aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
				onPointerDown={props.aoPressionar}
				onClick={() => {
					if (!props.cliqueDoArrasto()) props.abrir();
				}}
				onKeyDown={tecla}
			>
				<ConteudoDoCartao tarefa={tarefa} agenda={props.agenda} materias={props.materias} hoje={props.hoje} />
			</div>
			<MenuSuspenso
				className="quadro-item__mover"
				classeBotao="quadro-item__mover-botao"
				opcoes={props.colunas.map((coluna) => ({ id: coluna.id, titulo: coluna.nome }))}
				atual={tarefa.coluna}
				escolher={props.moverPara}
				conteudoBotao={<Icon name="arrow-right" size={14} strokeWidth={2.5} />}
				rotulo={`Mover a tarefa ${tarefa.titulo} para outra coluna`}
				rotuloMenu="Mover para…"
			/>
		</li>
	);
}
