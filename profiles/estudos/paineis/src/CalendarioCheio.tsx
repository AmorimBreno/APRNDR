// A aba Calendário da tela da agenda: o mês grande com os itens em cada dia e, à
// esquerda, o minicalendário e a lista do dia escolhido, com Mês e Semana
// (docs/agenda.md). A casca (TelaAgenda.tsx) já passa tudo pronto.
//
// Um estado só manda em tudo: o dia escolhido. O mês (ou a semana) da grade, o
// minimês e a lista do dia seguem ele; as setas do cabeçalho e as do minimês
// andam o dia escolhido um mês (ou uma semana) por vez, e "Hoje" volta a hoje.
// A visão (Mês ou Semana) fica guardada no localStorage (calendario-cheio.ts).
//
// - Lateral (LateralDoCalendario.tsx): o minimês, a lista do dia com "Nova
//   tarefa" e as listas curtas Atrasadas e Sem data. Na tela estreita ela sobe
//   para cima da grade, sem o minimês (a grade já mostra os pontinhos).
// - Cabeçalho: ‹ Hoje ›, o título da visão e o seletor Mês/Semana (SeletorAbas).
// - Grade (GradeDoCalendario.tsx): o mês com as etiquetas por dia, ou a semana.
//
// Props (PropsAbaAgenda, agenda-tela.ts): agenda, provas e materias vêm prontas;
// materia é o filtro (vazio = todas: só o que é dela entra na grade, na lateral
// e nas listas curtas); hoje atualiza na virada do dia; acoes tem o moverTarefa
// da caixinha de feita; abrirTarefa e novaTarefa abrem o ModalTarefa da casca (a
// novaTarefa já põe a matéria do filtro).

import { Button } from "@estudos/design-system";
import { semMovimento } from "@estudos/ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ItemCalendario, Tarefa } from "../../lib/agenda-tipos.ts";
import type { PropsAbaAgenda } from "./agenda-tela.ts";
import { dataDoPasso, guardarVisao, ordenarItensDoDia, tituloDaVisao, VISOES_DO_CALENDARIO, type VisaoCalendario, visaoGuardada } from "./calendario-cheio.ts";
import { itensDaGrade, mesDaData, semanasDoMes } from "./calendario-tela.ts";
import { GradeDoCalendario } from "./GradeDoCalendario.tsx";
import { ListaDoDia, MiniMes, TarefasDeApoio } from "./LateralDoCalendario.tsx";
import { idDaAba, idDoPainel, SeletorAbas } from "./SeletorTags.tsx";

type Onde = "grade" | "mini";

/** A largura (px) abaixo da qual a lateral sobe e a grade do mês mostra só pontinhos (igual ao @media do estilo.css). */
const LARGURA_ESTREITA = 760;

export function CalendarioCheio(props: PropsAbaAgenda) {
	const { agenda, provas, materias, materia, hoje, acoes, abrirTarefa, novaTarefa } = props;
	const [escolhido, setEscolhido] = useState(hoje);
	const [visao, setVisao] = useState<VisaoCalendario>(() => visaoGuardada());
	const base = useId();
	const parado = semMovimento();
	const lateral = useRef<HTMLElement | null>(null);
	const raizes = useRef<Record<Onde, HTMLElement | null>>({ grade: null, mini: null });
	const foco = useRef<{ onde: Onde; data: string } | undefined>(undefined);

	const mes = mesDaData(escolhido);
	// Os itens do minimês (seis semanas) cobrem também o mês ou a semana da grade grande.
	const semanasDoMini = useMemo(() => semanasDoMes(mes, { seisSemanas: true }), [mes]);
	const porDia = useMemo(() => {
		const bruto = itensDaGrade(agenda, provas, semanasDoMini, materia);
		return new Map<string, ItemCalendario[]>([...bruto].map(([data, itens]) => [data, ordenarItensDoDia(itens)]));
	}, [agenda, provas, semanasDoMini, materia]);
	const itensDoDia = porDia.get(escolhido) ?? [];
	const tarefaPorId = useMemo(() => new Map<string, Tarefa>(agenda.tarefas.map((tarefa) => [tarefa.id, tarefa])), [agenda.tarefas]);

	// Depois de uma tecla que trocou de mês ou de semana, o foco vai para o dia novo assim que a grade desenha.
	useEffect(() => {
		const alvo = foco.current;
		if (!alvo) return;
		foco.current = undefined;
		raizes.current[alvo.onde]?.querySelector<HTMLElement>(`[data-dia="${alvo.data}"]`)?.focus();
	}, [escolhido, visao]);

	// Clique: escolhe o dia; na tela estreita a lista fica em cima da grade, então ela é trazida para a vista.
	const escolher = (data: string) => {
		setEscolhido(data);
		if (typeof matchMedia === "function" && matchMedia(`(max-width: ${LARGURA_ESTREITA}px)`).matches) {
			lateral.current?.scrollIntoView({ block: "nearest", behavior: parado ? "auto" : "smooth" });
		}
	};
	const mover = (onde: Onde) => (data: string) => {
		foco.current = { onde, data };
		setEscolhido(data);
	};
	const trocarVisao = (nova: VisaoCalendario) => {
		setVisao(nova);
		guardarVisao(nova);
	};
	const abrirPorId = (id: string) => {
		const tarefa = tarefaPorId.get(id);
		if (tarefa) abrirTarefa(tarefa);
	};
	const nova = (data: string) => novaTarefa({ data });

	const titulo = tituloDaVisao(visao, escolhido);
	const rotuloAnterior = visao === "mes" ? "Mês anterior" : "Semana anterior";
	const rotuloProximo = visao === "mes" ? "Próximo mês" : "Próxima semana";
	return (
		<div className="cal-cheio">
			<aside className="cal-cheio__lateral" aria-label="Dia escolhido" ref={lateral}>
				<MiniMes
					escolhido={escolhido}
					hoje={hoje}
					porDia={porDia}
					materias={materias}
					escolher={setEscolhido}
					mover={mover("mini")}
					mudarMes={(passo) => setEscolhido(dataDoPasso("mes", escolhido, passo))}
					registrarRaiz={(elemento) => {
						raizes.current.mini = elemento;
					}}
				/>
				<ListaDoDia agenda={agenda} materias={materias} acoes={acoes} hoje={hoje} escolhido={escolhido} itens={itensDoDia} abrirTarefa={abrirTarefa} novaTarefa={nova} />
				<TarefasDeApoio agenda={agenda} materias={materias} hoje={hoje} {...(materia ? { materia } : {})} abrirTarefa={abrirTarefa} />
			</aside>

			<section className="cal-cheio__principal" aria-label="Calendário">
				<header className="cal-cheio__topo">
					<div className="cal-cheio__navega">
						<Button variant="ghost" size="sm" iconOnly icon="arrow-left" title={rotuloAnterior} aria-label={rotuloAnterior} onClick={() => setEscolhido(dataDoPasso(visao, escolhido, -1))} />
						<Button variant="secondary" size="sm" onClick={() => setEscolhido(hoje)} disabled={escolhido === hoje}>
							Hoje
						</Button>
						<Button variant="ghost" size="sm" iconOnly icon="arrow-right" title={rotuloProximo} aria-label={rotuloProximo} onClick={() => setEscolhido(dataDoPasso(visao, escolhido, 1))} />
					</div>
					<h2 className="heading cal-cheio__titulo" aria-live="polite">
						{titulo}
					</h2>
					<span className="cal-cheio__espaco" />
					<SeletorAbas rotulo="Visão do calendário" abas={VISOES_DO_CALENDARIO} base={base} atual={visao} escolher={trocarVisao} />
				</header>
				<div id={idDoPainel(base)} role="tabpanel" aria-labelledby={idDaAba(base, visao)} className="cal-cheio__painel">
					<GradeDoCalendario
						visao={visao}
						escolhido={escolhido}
						hoje={hoje}
						porDia={porDia}
						materias={materias}
						escolher={escolher}
						mover={mover("grade")}
						abrirTarefa={abrirPorId}
						novaTarefa={nova}
						registrarRaiz={(elemento) => {
							raizes.current.grade = elemento;
						}}
					/>
				</div>
			</section>
		</div>
	);
}
