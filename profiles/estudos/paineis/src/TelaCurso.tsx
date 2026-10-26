// A visão do curso pronto (item 5, parte C, docs/cursos.md, "A tela"), em
// caderno/<matéria>/cursos/<curso>, no lugar do índice e da seção do
// caderno, com a aba no topo (como o guia). Em cima, "Curso · <matéria>", o
// nome e a ficha das leituras (prazo, horas por semana, módulos, conceitos,
// tipo e escopo), com "Rever o guia" (o guia só para leitura); embaixo, os
// módulos em ModuleCard numa grade de 2 colunas (o primeiro como próximo, os
// outros bloqueados; gerar o módulo é do item 6 e aparece como "Em breve"),
// com o objetivo e as datas de cada um, e o calendário gravado no dia da
// criação (o mesmo Calendario da etapa Esqueleto, só leitura).

import { Button, EmptyState, ModuleCard, Readout, SpecBox, Tag, type Tone } from "@estudos/design-system";
import type { JanelaPerfilHook } from "@estudos/ui";
import { motion } from "motion/react";
import { hojeLocal } from "../../lib/curso-tipos.ts";
import { resumoDoEsqueleto, type ResumoEsqueleto } from "../../lib/esqueleto-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import { useCurso } from "./cursos-ponte.ts";
import { numeroCurto } from "./diagnostico-tela.ts";
import { Calendario } from "./EtapaEsqueleto.tsx";
import { datasDoCard, leiturasDoCurso, rotuloPrazo } from "./esqueleto-tela.ts";
import { caminhoDoGuia } from "./guia-curso.ts";

const MOLA = { type: "spring", stiffness: 380, damping: 32 } as const;

export interface PropsTelaCurso {
	janela: JanelaPerfilHook;
	materiaId: string;
	materia?: Materia;
	cursoId: string;
	navegar(caminho: string): void;
	/** Cor da capa, para o bloco do ideograma. */
	tom: Tone;
}

export function TelaCurso(props: PropsTelaCurso) {
	const { materiaId, cursoId } = props;
	const { curso, erro } = useCurso(props.janela, materiaId, cursoId);
	const voltarAosCursos = () => props.navegar(`caderno/${materiaId}/cursos`);
	const materia = props.materia?.nome ?? "Caderno";

	let resumo: ResumoEsqueleto | undefined;
	if (curso?.esqueleto) {
		try {
			resumo = resumoDoEsqueleto(curso.esqueleto, curso.mapa?.conceitos ?? []);
		} catch {
			resumo = undefined;
		}
	}

	let conteudo;
	if (!curso) {
		conteudo = erro ? (
			<EmptyState
				glyph="問"
				tone={props.tom}
				title="Não achei este curso"
				action={
					<Button variant="primary" icon="arrow-left" onClick={voltarAosCursos}>
						Voltar para os cursos
					</Button>
				}
			>
				{erro}
			</EmptyState>
		) : (
			<p className="body caderno__carregando">Abrindo o curso…</p>
		);
	} else if (curso.situacao !== "pronto" || !curso.esqueleto || !resumo) {
		conteudo = (
			<EmptyState
				glyph="新"
				tone={props.tom}
				title="Este curso ainda é um rascunho"
				action={
					<Button variant="primary" iconRight="arrow-right" onClick={() => props.navegar(caminhoDoGuia(materiaId, curso.id))}>
						Continuar o guia
					</Button>
				}
			>
				A visão do curso aparece depois de "Criar curso", na última etapa do guia.
			</EmptyState>
		);
	} else {
		const esqueleto = curso.esqueleto;
		const leituras = leiturasDoCurso(curso, hojeLocal());
		conteudo = (
			<>
				<SpecBox className="curso__ficha" title="Ficha do curso" code={`${numeroCurto(resumo.horas)} h no total`}>
					<div className="curso__leituras">
						{leituras.map((leitura) => (
							<Readout
								key={leitura.id}
								className={`curso__leitura${leitura.texto ? " curso__leitura--texto" : ""}`}
								label={
									leitura.detalhe ? (
										<>
											{leitura.rotulo}
											<span className="curso__leitura-detalhe">{leitura.detalhe}</span>
										</>
									) : (
										leitura.rotulo
									)
								}
								value={leitura.texto ? <span className="body-strong">{leitura.valor}</span> : leitura.valor}
								{...(leitura.unidade ? { unit: leitura.unidade } : {})}
							/>
						))}
					</div>
				</SpecBox>
				<section className="curso__parte" aria-labelledby="curso-modulos">
					<h3 id="curso-modulos" className="overline curso__parte-titulo">
						Módulos
					</h3>
					<ul className="curso__modulos">
						{resumo.modulos.map((modulo, indice) => (
							<motion.li
								key={modulo.id}
								className="curso__modulo"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ ...MOLA, delay: Math.min(indice, 10) * 0.04 }}
							>
								<ModuleCard
									as="div"
									state={indice === 0 ? "next" : "locked"}
									number={modulo.numero}
									title={modulo.nome}
									readings={[
										{ label: "Conceitos", value: String(modulo.conceitos) },
										{ label: "Horas", value: numeroCurto(modulo.horas), unit: "h" },
									]}
									{...(indice === 0
										? {
												action: (
													<span className="curso__acao">
														Gerar módulo
														<Tag size="sm" tone="outline" icon="clock">
															Em breve
														</Tag>
													</span>
												),
											}
										: {})}
								/>
								<div className="curso__modulo-texto">
									{modulo.objetivo ? <p className="body-sm curso__objetivo">{modulo.objetivo}</p> : null}
									<p className="data curso__datas">{datasDoCard(modulo.inicio, modulo.fim, modulo.avaliacao)}</p>
								</div>
							</motion.li>
						))}
					</ul>
				</section>
				<section className="curso__parte curso__parte--calendario" aria-label="Calendário">
					<Calendario
						modulos={esqueleto.modulos}
						calendario={esqueleto.calendario}
						prazo={rotuloPrazo(curso.basico)}
						{...(curso.basico ? { horasPorSemana: curso.basico.horasPorSemana } : {})}
					/>
				</section>
			</>
		);
	}

	return (
		<motion.section className="curso" aria-labelledby="curso-titulo" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={MOLA}>
			<header className="curso__cabeca">
				<div className="curso__titulos">
					<span className="overline">Curso · {materia}</span>
					<h2 id="curso-titulo" className="display-sm curso__titulo">
						{curso?.nome ?? "Curso"}
					</h2>
				</div>
				<span className="curso__botoes">
					<Button variant="ghost" icon="arrow-left" onClick={voltarAosCursos}>
						Cursos
					</Button>
					{curso?.situacao === "pronto" ? (
						<Button variant="ghost" icon="book" onClick={() => props.navegar(caminhoDoGuia(materiaId, curso.id))}>
							Rever o guia
						</Button>
					) : null}
				</span>
			</header>
			<div className="curso__corpo">{conteudo}</div>
		</motion.section>
	);
}
