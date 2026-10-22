// A seção Cursos do caderno (item 5, parte A, docs/cursos.md): os cursos da
// matéria, na ordem de criação, e "Novo curso", que abre o guia de criação
// (TelaGuiaCurso.tsx) em caderno/<matéria>/cursos/novo. Um rascunho mostra a
// etapa onde parou, "Continuar" (volta ao guia) e "Descartar" (com
// confirmação: a pasta do curso é apagada). Um curso pronto é só a linha por
// enquanto: a visão do curso chega na parte C.

import { Button, Callout, EmptyState, Icon, Modal, Tag, type Tone } from "@estudos/design-system";
import { motion } from "motion/react";
import { useState } from "react";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import type { CursosDaMateria } from "./cursos-ponte.ts";
import { rotuloCurso, textoEditado, textoPrazo } from "./guia-curso.ts";

export interface PropsSecaoCursos {
	cursos: CursosDaMateria;
	materia?: Materia;
	/** Cor da capa, para o bloco do ideograma da seção vazia. */
	tom: Tone;
	novoCurso(): void;
	continuar(curso: ResumoCurso): void;
}

export function SecaoCursos(props: PropsSecaoCursos) {
	const { lista, erroLista } = props.cursos;
	const [descartando, setDescartando] = useState<ResumoCurso | undefined>(undefined);
	// O último pedido de descarte: o título do modal continua enquanto ele fecha.
	const [alvo, setAlvo] = useState<ResumoCurso | undefined>(undefined);
	const [ocupado, setOcupado] = useState(false);
	const [erro, setErro] = useState<string | undefined>(undefined);

	const fecharModal = () => {
		if (ocupado) return;
		setDescartando(undefined);
		setErro(undefined);
	};
	const descartar = () => {
		if (!descartando || ocupado) return;
		setOcupado(true);
		setErro(undefined);
		props.cursos
			.descartar(descartando.id)
			.then(() => setDescartando(undefined))
			.catch((falha: unknown) => setErro((falha as Error).message))
			.finally(() => setOcupado(false));
	};

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
					const rotulo = rotuloCurso(curso);
					return (
						<motion.li
							key={curso.id}
							className="cursos__item"
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
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											setAlvo(curso);
											setDescartando(curso);
										}}
									>
										Descartar
									</Button>
									<Button variant="secondary" size="sm" iconRight="arrow-right" onClick={() => props.continuar(curso)}>
										Continuar
									</Button>
								</span>
							) : null}
						</motion.li>
					);
				})}
			</ul>
			<Modal
				open={Boolean(descartando)}
				onClose={fecharModal}
				kicker="Curso em rascunho"
				title={`Descartar o rascunho ${alvo?.nome ?? ""}?`}
				size="sm"
				tone="brick"
				dismissible={!ocupado}
				footer={
					<>
						<Button variant="secondary" onClick={fecharModal} disabled={ocupado}>
							Manter
						</Button>
						<Button variant="danger" onClick={descartar} disabled={ocupado} aria-busy={ocupado}>
							{ocupado ? "Descartando…" : "Descartar"}
						</Button>
					</>
				}
			>
				<p className="body">A pasta do curso é apagada.</p>
				{erro ? <p className="body-sm cursos__erro">{erro}</p> : null}
			</Modal>
		</div>
	);
}
