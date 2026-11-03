// A faixa dos cursos do painel do caderno: os cursos da matéria em cards
// numerados lado a lado, mais um card tracejado "Novo curso" no fim. Um curso
// pronto abre a visão do curso (TelaCurso.tsx) pelo card inteiro; um rascunho
// volta ao guia de criação (TelaGuiaCurso.tsx) pelo card, e o "Descartar" fica
// num botão ao lado do card, não dentro dele, porque botão não aninha botão. O
// primeiro curso pronto (o que está em andamento) ganha a cor da matéria.

import { Button, Callout, Icon, Tag, type Tone } from "@estudos/design-system";
import { motion } from "motion/react";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import type { CursosDaMateria } from "./cursos-ponte.ts";
import { type CardCurso, cardsDosCursos, textoContagem } from "./faixa-cursos.ts";
import { useDescartarCurso } from "./useDescartarCurso.tsx";

export interface PropsFaixaCursos {
	cursos: CursosDaMateria;
	materia?: Materia;
	/** Cor da matéria: o primeiro curso pronto (o que está em andamento) ganha esse fundo. */
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

	const cards = lista ? cardsDosCursos(lista, props.materia) : [];
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

	const cardDoCurso = ({ curso, numero, destaque, rotulo, prazo, descricao }: CardCurso, indice: number) => {
		const rascunho = curso.situacao === "rascunho";
		return (
			<motion.li
				key={curso.id}
				className="faixa-cursos__celula"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ type: "spring", stiffness: 420, damping: 32, delay: Math.min(indice, 10) * 0.03 }}
			>
				<div className="faixa-cursos__item">
					<button
						type="button"
						className={`faixa-cursos__card${destaque ? " faixa-cursos__card--destaque" : ""}`}
						aria-label={`${rascunho ? "Continuar" : "Abrir"} o curso ${descricao}`}
						onClick={() => (rascunho ? props.continuar(curso) : props.abrir(curso))}
					>
						<span className="faixa-cursos__numero data">{numero}</span>
						<span className="faixa-cursos__nome">{curso.nome}</span>
						<span className="faixa-cursos__pe">
							<span className="faixa-cursos__rotulo">
								<Tag size="sm" tone={rotulo.tom} icon={rascunho ? "clock" : "check"}>
									{rotulo.texto}
								</Tag>
							</span>
							<span className="faixa-cursos__prazo data">{prazo}</span>
						</span>
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
		<section className={`faixa-cursos faixa-cursos--${props.tom}`} aria-label="Cursos da matéria">
			{aviso}
			<header className="faixa-cursos__topo">
				<h2 className="overline faixa-cursos__titulo">Cursos</h2>
				{contagem ? <span className="overline faixa-cursos__contagem">{contagem}</span> : null}
			</header>
			{!lista ? (
				<p className="body caderno__carregando">Abrindo os cursos…</p>
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
