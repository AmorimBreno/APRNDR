// A grade do calendário em tela cheia (CalendarioCheio.tsx), nas duas visões.
// - Mês: sete colunas (segunda a domingo) e uma linha por semana, as linhas
//   dividindo a altura que a tela dá. Cada dia tem o número no canto, hoje
//   destacado, os dias de fora do mês apagados e os itens como etiquetas
//   coloridas pela matéria (a prova com a bandeira, a tarefa feita riscada).
//   Quando as etiquetas não cabem, "N mais" escolhe o dia (a lista dele está na
//   lateral). A conta de quantas cabem vem da altura medida da célula
//   (capacidadeDaCelula, calendario-cheio.ts).
// - Semana: os sete dias lado a lado (um embaixo do outro na tela estreita), cada
//   um com a lista inteira, os com hora em ordem de hora e depois os sem hora.
// Na tela estreita, o Mês mostra só os pontinhos coloridos de cada dia (o CSS
// troca as etiquetas pelos pontos) e a lista do dia escolhido fica na lateral.
//
// Teclado: a grade é um grid com roving tabindex, só o dia escolhido entra na
// ordem do Tab. Setas movem o dia, Home e End vão às pontas da semana, PageUp e
// PageDown trocam o mês (a semana, na visão Semana) e Enter abre a tarefa nova
// daquele dia. As etiquetas e o "N mais" são para o mouse (tabIndex -1): pelo
// teclado, a lista do dia na lateral tem os mesmos itens e as mesmas ações.
// Clique no dia escolhe; duplo clique num lugar livre do dia (ou o botão "+" que
// aparece no hover) abre a tarefa nova com a data do dia.

import { Icon } from "@estudos/design-system";
import { type CSSProperties, type KeyboardEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ItemCalendario, MateriaDaAgenda } from "../../lib/agenda-tipos.ts";
import { capacidadeDaCelula, descricaoDoItem, resumoDoDia, teclaDaGrade, textoDoMais, type VisaoCalendario } from "./calendario-cheio.ts";
import {
	classeDoTom,
	dataPorExtenso,
	descricaoDoDia,
	mesDaData,
	NOMES_CURTOS_DOS_DIAS,
	NOMES_DOS_DIAS,
	nomeDaMateria,
	pontosDoDia,
	semanaDe,
	semanasDoMes,
	tomDoItem,
} from "./calendario-tela.ts";

export interface PropsGradeDoCalendario {
	visao: VisaoCalendario;
	/** O dia escolhido (AAAA-MM-DD): define o mês ou a semana mostrados e o dia que entra na ordem do Tab. */
	escolhido: string;
	hoje: string;
	/** Os itens de cada dia, já na ordem do dia (ordenarItensDoDia). */
	porDia: ReadonlyMap<string, ItemCalendario[]>;
	materias: MateriaDaAgenda[];
	/** Escolhe o dia com o mouse (a lateral mostra a lista dele). */
	escolher(data: string): void;
	/** Move o dia escolhido pelo teclado; o foco vai junto. */
	mover(data: string): void;
	/** Abre a tarefa para editar. */
	abrirTarefa(id: string): void;
	/** Abre a tarefa nova com a data. */
	novaTarefa(data: string): void;
	/** Entrega o elemento da grade ao pai, que devolve o foco depois de uma tecla que troca o mês. */
	registrarRaiz(elemento: HTMLElement | null): void;
}

export function GradeDoCalendario(props: PropsGradeDoCalendario) {
	const { visao, escolhido } = props;
	const mes = mesDaData(escolhido);
	const semanas = useMemo(() => (visao === "mes" ? semanasDoMes(mes) : [semanaDe(escolhido).map((data) => ({ data, dia: Number(data.slice(8, 10)), doMes: true }))]), [visao, mes, escolhido]);
	const corpo = useRef<HTMLDivElement | null>(null);
	const [capacidade, setCapacidade] = useState(3);

	// A altura da célula muda com a janela e com o número de semanas (5 ou 6): mede de novo e refaz o "N mais".
	useEffect(() => {
		const raiz = corpo.current;
		if (!raiz || visao !== "mes") return;
		const medir = () => setCapacidade(capacidadeDaCelula(raiz.querySelector<HTMLElement>(".cal-cheio__celula")?.clientHeight ?? 0));
		medir();
		if (typeof ResizeObserver === "undefined") return;
		const observador = new ResizeObserver(medir);
		observador.observe(raiz);
		return () => observador.disconnect();
	}, [visao, semanas.length]);

	const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, data: string) => {
		if (evento.key === "Enter") {
			evento.preventDefault();
			props.novaTarefa(data);
			return;
		}
		const alvo = teclaDaGrade(visao, data, evento.key);
		if (!alvo) return;
		evento.preventDefault();
		props.mover(alvo);
	};

	return (
		<div
			className={`cal-cheio__grade cal-cheio__grade--${visao}`}
			role="grid"
			aria-label={visao === "mes" ? "Dias do mês" : "Dias da semana"}
			style={{ "--semanas": semanas.length } as CSSProperties}
			ref={(elemento) => {
				corpo.current = elemento;
				props.registrarRaiz(elemento);
			}}
		>
			{visao === "mes" ? (
				<div className="cal-cheio__cabecas" role="row">
					{NOMES_CURTOS_DOS_DIAS.map((nome, indice) => (
						<span key={nome} role="columnheader" aria-label={NOMES_DOS_DIAS[indice]!} className="overline cal-cheio__cabeca-coluna">
							{nome}
						</span>
					))}
				</div>
			) : null}
			{semanas.map((semana) => (
				<div key={semana[0]!.data} className="cal-cheio__semana" role="row">
					{semana.map((dia, indice) => (
						<CelulaDoDia
							key={dia.data}
							{...props}
							data={dia.data}
							numero={dia.dia}
							doMes={dia.doMes}
							indiceDaSemana={indice}
							capacidade={capacidade}
							aoTeclar={aoTeclar}
						/>
					))}
				</div>
			))}
		</div>
	);
}

interface PropsCelula extends PropsGradeDoCalendario {
	data: string;
	numero: number;
	doMes: boolean;
	indiceDaSemana: number;
	capacidade: number;
	aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, data: string): void;
}

function CelulaDoDia(props: PropsCelula) {
	const { visao, data, numero, doMes, indiceDaSemana, escolhido, hoje, materias, capacidade } = props;
	const itens = props.porDia.get(data);
	const { visiveis, escondidos } = visao === "mes" ? resumoDoDia(itens ?? [], capacidade) : { visiveis: itens ?? [], escondidos: 0 };
	const pontos = pontosDoDia(itens, materias);
	const classes = [
		"cal-cheio__celula",
		doMes ? "" : "cal-cheio__celula--fora",
		data === hoje ? "cal-cheio__celula--hoje" : "",
		data === escolhido ? "cal-cheio__celula--escolhida" : "",
	]
		.filter(Boolean)
		.join(" ");

	// Um duplo clique num lugar livre do dia cria a tarefa; nas etiquetas e nos botões, não.
	const aoDuploClique = (evento: MouseEvent<HTMLDivElement>) => {
		if ((evento.target as HTMLElement).closest(".cal-etq, .cal-cheio__mais, .cal-cheio__novo")) return;
		props.novaTarefa(data);
	};

	return (
		<div role="gridcell" className={classes} onClick={() => props.escolher(data)} onDoubleClick={aoDuploClique}>
			<div className="cal-cheio__cabeca">
				<button
					type="button"
					className="cal-cheio__dia"
					data-dia={data}
					tabIndex={data === escolhido ? 0 : -1}
					aria-label={descricaoDoDia(data, itens, hoje)}
					aria-pressed={data === escolhido}
					{...(data === hoje ? { "aria-current": "date" as const } : {})}
					onClick={(evento) => {
						evento.stopPropagation();
						props.escolher(data);
					}}
					onKeyDown={(evento) => props.aoTeclar(evento, data)}
				>
					{visao === "semana" ? <span className="overline cal-cheio__dia-nome">{NOMES_CURTOS_DOS_DIAS[indiceDaSemana]}</span> : null}
					<span className="data cal-cheio__numero">{numero}</span>
				</button>
				<button
					type="button"
					tabIndex={-1}
					className="cal-cheio__novo"
					title="Nova tarefa neste dia"
					aria-label={`Nova tarefa em ${dataPorExtenso(data, hoje)}`}
					onClick={(evento) => {
						evento.stopPropagation();
						props.novaTarefa(data);
					}}
				>
					<Icon name="plus" size={14} strokeWidth={2.5} />
				</button>
			</div>
			{visiveis.length > 0 || escondidos > 0 ? (
				<ul className="cal-cheio__etiquetas">
					{visiveis.map((item) => (
						<li key={item.id}>
							<Etiqueta item={item} materias={materias} abrirTarefa={props.abrirTarefa} />
						</li>
					))}
					{escondidos > 0 ? (
						<li>
							<button
								type="button"
								tabIndex={-1}
								className="body-sm cal-cheio__mais"
								aria-label={`${escondidos} itens a mais em ${dataPorExtenso(data, hoje)}. Mostrar a lista do dia`}
								onClick={(evento) => {
									evento.stopPropagation();
									props.escolher(data);
								}}
							>
								{textoDoMais(escondidos)}
							</button>
						</li>
					) : null}
				</ul>
			) : null}
			{/* Na tela estreita as etiquetas somem e ficam só os pontinhos. */}
			<span className="cal-cheio__pontos" aria-hidden="true">
				{pontos.map((ponto, indice) => (
					<i key={indice} className={`cal-ponto ${classeDoTom(ponto.tom)}${ponto.feita ? " cal-ponto--feita" : ""}${ponto.prova ? " cal-ponto--prova" : ""}`} />
				))}
			</span>
		</div>
	);
}

interface PropsEtiqueta {
	item: ItemCalendario;
	materias: MateriaDaAgenda[];
	abrirTarefa(id: string): void;
}

/** O item como etiqueta colorida pela matéria: a tarefa abre o modal; a prova é só informação (a bandeira marca). */
function Etiqueta({ item, materias, abrirTarefa }: PropsEtiqueta) {
	const classes = `cal-etq ${classeDoTom(tomDoItem(item, materias))}${item.feita ? " cal-etq--feita" : ""}${item.tipo === "prova" ? " cal-etq--prova" : ""}`;
	const texto = descricaoDoItem(item, nomeDaMateria(item.materia, materias));
	if (item.tipo === "prova") {
		return (
			<span className={classes} title={texto} aria-label={texto} role="img">
				<Icon name="flag" size={12} strokeWidth={2.5} />
				<span className="body-sm cal-etq__titulo">{item.titulo}</span>
			</span>
		);
	}
	return (
		<button
			type="button"
			tabIndex={-1}
			className={classes}
			title={texto}
			aria-label={texto}
			onClick={(evento) => {
				evento.stopPropagation();
				abrirTarefa(item.id);
			}}
		>
			{item.hora ? <span className="body-sm cal-etq__hora">{item.hora}</span> : null}
			<span className="body-sm cal-etq__titulo">{item.titulo}</span>
		</button>
	);
}
