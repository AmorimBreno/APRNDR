// A faixa dos cursos do painel do caderno: os cursos da matéria em cards largos
// e baixos, cada um num tom pastel chapado, lado a lado, mais um card tracejado
// "Novo curso" no fim. Em cima, o chip redondo com o ícone, o rótulo ("Curso 01"
// ou "Rascunho") e o selo (os módulos, ou a etapa em que o rascunho parou); no
// meio, o nome; embaixo, o prazo ou a última edição. Um curso pronto abre a
// visão do curso (TelaCurso.tsx) pelo card inteiro; um rascunho volta ao guia
// de criação (TelaGuiaCurso.tsx) pelo card, e o "Descartar" fica num botão ao
// lado do card, não dentro dele, porque botão não aninha botão. O primeiro
// curso pronto (o que está em andamento) ganha o tom da matéria.

import { Button, Callout, Icon, type Tone } from "@estudos/design-system";
import { useValorEstavel } from "@estudos/ui";
import { motion } from "motion/react";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import { useAnimarEntrada } from "./comum.ts";
import type { CursosDaMateria } from "./cursos-ponte.ts";
import { type CardCurso, cardsDosCursos, textoContagem } from "./faixa-cursos.ts";
import { useDescartarCurso } from "./useDescartarCurso.tsx";

export interface PropsFaixaCursos {
	cursos: CursosDaMateria;
	/** O id da matéria: a lista só entra animada na primeira vez que aparece para ela. */
	materiaId: string;
	materia?: Materia;
	/** Cor da matéria: o primeiro curso pronto (o que está em andamento) ganha o tom pastel dela. */
	tom: Tone;
	novoCurso(): void;
	continuar(curso: ResumoCurso): void;
	/** Abre a visão de um curso pronto. */
	abrir(curso: ResumoCurso): void;
}

export function FaixaCursos(props: PropsFaixaCursos) {
	const { lista, erroLista } = props.cursos;
	const { pedirDescarte, modalDescarte } = useDescartarCurso(props.cursos);

	const aviso = erroLista ? (
		<Callout tone="amber" label="Não deu certo" icon="alert">
			<p>{erroLista}</p>
		</Callout>
	) : null;

	// "Abrindo os cursos…" só aparece se a lista demorar mais de 1 s; os cards só entram animados na primeira vez que a lista aparece.
	const semLista = !lista;
	const mostraAbrindo = useValorEstavel(semLista, semLista, false) && semLista;
	const animar = useAnimarEntrada(`cursos:${props.materiaId}`, !semLista);

	const cards = lista ? cardsDosCursos(lista, props.materia, props.tom) : [];
	const contagem = textoContagem(cards.length);

	const cardNovo = (
		<li className="faixa-cursos__celula">
			<div className="faixa-cursos__item">
				<button type="button" className="faixa-cursos__card faixa-cursos__card--novo" onClick={props.novoCurso}>
					<Icon name="plus" size={28} strokeWidth={2.25} />
					<span className="faixa-cursos__novo-texto">Novo curso</span>
				</button>
			</div>
		</li>
	);

	const cardDoCurso = ({ curso, tom, icone, categoria, selo, rodape, descricao }: CardCurso, indice: number) => {
		const rascunho = curso.situacao === "rascunho";
		return (
			<motion.li
				key={curso.id}
				className="faixa-cursos__celula"
				initial={animar ? { opacity: 0, y: 8 } : false}
				animate={{ opacity: 1, y: 0 }}
				transition={animar ? { type: "spring", stiffness: 420, damping: 32, delay: Math.min(indice, 10) * 0.03 } : { duration: 0 }}
			>
				<div className={`faixa-cursos__item faixa-cursos__item--${tom}`}>
					<button
						type="button"
						className="faixa-cursos__card"
						aria-label={`${rascunho ? "Continuar" : "Abrir"} o curso ${descricao}`}
						onClick={() => (rascunho ? props.continuar(curso) : props.abrir(curso))}
					>
						<span className="faixa-cursos__alto">
							<span className="faixa-cursos__chip">
								<Icon name={icone} size={16} />
							</span>
							<span className="faixa-cursos__categoria">{categoria}</span>
							<span className="faixa-cursos__selo">{selo}</span>
						</span>
						<span className="faixa-cursos__nome">{curso.nome}</span>
						<span className="faixa-cursos__rodape">{rodape}</span>
					</button>
					{rascunho ? (
						<Button
							variant="ghost"
							size="sm"
							className="faixa-cursos__descartar"
							aria-label={`Descartar o rascunho ${curso.nome}`}
							onClick={() => pedirDescarte(curso)}
						>
							Descartar
						</Button>
					) : null}
				</div>
			</motion.li>
		);
	};

	return (
		<section className="faixa-cursos" aria-label="Cursos da matéria">
			{aviso}
			<header className="faixa-cursos__topo">
				<h2 className="overline faixa-cursos__titulo">Cursos</h2>
				{contagem ? <span className="overline faixa-cursos__contagem">{contagem}</span> : null}
			</header>
			{!lista ? (
				<p className="body caderno__carregando" style={{ visibility: mostraAbrindo ? "visible" : "hidden" }} aria-hidden={!mostraAbrindo}>
					Abrindo os cursos…
				</p>
			) : (
				<ul className="faixa-cursos__trilho">
					{cards.map(cardDoCurso)}
					{cardNovo}
					{lista.length === 0 ? (
						<li className="faixa-cursos__vazio body">Um curso é um plano de estudo montado a partir dos materiais e do mapa de conteúdo.</li>
					) : null}
				</ul>
			)}
			{modalDescarte}
		</section>
	);
}
