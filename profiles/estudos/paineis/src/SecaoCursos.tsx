// A seção Cursos do caderno (item 5, parte A, docs/cursos.md): os cursos da
// matéria, na ordem de criação, e "Novo curso", que abre o guia de criação
// (TelaGuiaCurso.tsx) em caderno/<matéria>/cursos/novo. Um rascunho mostra a
// etapa onde parou, "Continuar" (volta ao guia) e "Descartar" (com
// confirmação: a pasta do curso é apagada). Um curso pronto mostra quantos
// módulos tem e abre a visão do curso (TelaCurso.tsx), pela linha inteira ou
// por "Abrir".

import { Button, Callout, EmptyState, Icon, Tag, type Tone } from "@estudos/design-system";
import { motion } from "motion/react";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import type { CursosDaMateria } from "./cursos-ponte.ts";
import { rotuloCurso, textoEditado, textoPrazo } from "./guia-curso.ts";
import { useDescartarCurso } from "./useDescartarCurso.tsx";

export interface PropsSecaoCursos {
	cursos: CursosDaMateria;
	materia?: Materia;
	/** Cor da capa, para o bloco do ideograma da seção vazia. */
	tom: Tone;
	novoCurso(): void;
	continuar(curso: ResumoCurso): void;
	/** Abre a visão de um curso pronto. */
	abrir(curso: ResumoCurso): void;
}

export function SecaoCursos(props: PropsSecaoCursos) {
	const { lista, erroLista } = props.cursos;
	const { pedirDescarte, modalDescarte } = useDescartarCurso(props.cursos);

	const aviso = erroLista ? (
		<Callout tone="amber" label="Não deu certo" icon="alert">
			<p>{erroLista}</p>
		</Callout>
	) : null;

	if (!lista) {
		return (
			<div className="cursos">
				{aviso}
				<p className="body caderno__carregando">Abrindo os cursos…</p>
			</div>
		);
	}

	if (lista.length === 0) {
		return (
			<div className="cursos">
				{aviso}
				<EmptyState
					glyph="新"
					tone={props.tom}
					title="Nenhum curso ainda"
					action={
						<Button variant="primary" icon="plus" onClick={props.novoCurso}>
							Novo curso
						</Button>
					}
				>
					Um curso é um plano de estudo montado a partir dos materiais e do mapa de conteúdo.
				</EmptyState>
			</div>
		);
	}

	return (
		<div className="cursos">
			{aviso}
			<div className="cursos__topo">
				<Button variant="primary" icon="plus" onClick={props.novoCurso}>
					Novo curso
				</Button>
			</div>
			<ul className="cursos__lista">
				{lista.map((curso, indice) => {
					const rotulo = rotuloCurso(curso, curso.modulos);
					const pronto = curso.situacao === "pronto";
					return (
						<motion.li
							key={curso.id}
							className={`cursos__item${pronto ? " cursos__item--abre" : ""}`}
							{...(pronto ? { onClick: () => props.abrir(curso) } : {})}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ type: "spring", stiffness: 420, damping: 32, delay: Math.min(indice, 10) * 0.03 }}
						>
							<Icon name="flag" size={20} strokeWidth={2.25} />
							<span className="cursos__texto">
								<span className="body-strong cursos__nome">{curso.nome}</span>
								<span className="cursos__meta">
									<Tag size="sm" tone={rotulo.tom} icon={curso.situacao === "pronto" ? "check" : "clock"}>
										{rotulo.texto}
									</Tag>
									<span className="data cursos__quando">
										{textoPrazo(curso.prazo, props.materia)} · {textoEditado(curso.alteradoEm)}
									</span>
								</span>
							</span>
							{curso.situacao === "rascunho" ? (
								<span className="cursos__acoes">
									<Button variant="ghost" size="sm" onClick={() => pedirDescarte(curso)}>
										Descartar
									</Button>
									<Button variant="secondary" size="sm" iconRight="arrow-right" onClick={() => props.continuar(curso)}>
										Continuar
									</Button>
								</span>
							) : (
								<span className="cursos__acoes">
									<Button
										variant="secondary"
										size="sm"
										iconRight="arrow-right"
										onClick={(evento) => {
											evento.stopPropagation();
											props.abrir(curso);
										}}
									>
										Abrir
									</Button>
								</span>
							)}
						</motion.li>
					);
				})}
			</ul>
			{modalDescarte}
		</div>
	);
}
