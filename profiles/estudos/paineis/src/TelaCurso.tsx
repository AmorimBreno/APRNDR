// A visão do curso pronto (item 5, parte C, docs/cursos.md, "A tela"), em
// caderno/<matéria>/cursos/<curso>, no lugar do índice e da seção do
// caderno, com a aba no topo (como o guia). Em cima, "Curso · <matéria>", o
// nome e a ficha das leituras (prazo, horas por semana, módulos, conceitos,
// tipo e escopo), com "Rever o guia" (o guia só para leitura); embaixo, os
// módulos em ModuleCard numa grade de 2 colunas (o primeiro como próximo, os
// outros bloqueados; gerar o módulo é do item 6 e aparece como "Em breve"),
// com o objetivo e as datas de cada um, e o calendário gravado no dia da
// criação (o mesmo Calendario da etapa Esqueleto, só leitura), com
// "Recalcular o calendário" (recalcular_calendario, depois de confirmar no
// modal): as datas passam a ser as de hoje, e os módulos ficam.

import { Button, EmptyState, Modal, ModuleCard, Readout, SpecBox, Tag, type Tone } from "@estudos/design-system";
import type { JanelaPerfilHook } from "@estudos/ui";
import { motion } from "motion/react";
import { useState } from "react";
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
	const aberto = useCurso(props.janela, materiaId, cursoId);
	const { curso, erro } = aberto;
	const voltarAosCursos = () => props.navegar(`caderno/${materiaId}/cursos`);
	const materia = props.materia?.nome ?? "Caderno";

	// "Recalcular o calendário": o modal de confirmação, o pedido em andamento e o erro dele.
	const [perguntarRecalcular, setPerguntarRecalcular] = useState(false);
	const [recalculando, setRecalculando] = useState(false);
	const [erroRecalcular, setErroRecalcular] = useState<string | undefined>(undefined);
	const fecharRecalcular = () => {
		if (recalculando) return;
		setPerguntarRecalcular(false);
		setErroRecalcular(undefined);
	};
	const recalcular = () => {
		if (recalculando) return;
		setRecalculando(true);
		setErroRecalcular(undefined);
		// A resposta é o "curso" com o calendário novo: a tela se atualiza por ele.
		aberto
			.recalcularCalendario()
			.then(() => setPerguntarRecalcular(false))
			.catch((falha: unknown) => setErroRecalcular(falha instanceof Error ? falha.message : String(falha)))
			.finally(() => setRecalculando(false));
	};

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
					<div>
						<Button variant="ghost" icon="refresh" onClick={() => setPerguntarRecalcular(true)} disabled={recalculando} aria-busy={recalculando}>
							{recalculando ? "Recalculando…" : "Recalcular o calendário"}
						</Button>
					</div>
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
			<Modal
				open={perguntarRecalcular}
				onClose={fecharRecalcular}
				kicker={curso?.nome ?? "Curso"}
				title="Recalcular o calendário a partir de hoje?"
				size="sm"
				dismissible={!recalculando}
				footer={
					<>
						<Button variant="secondary" onClick={fecharRecalcular} disabled={recalculando}>
							Manter
						</Button>
						<Button variant="primary" icon="refresh" onClick={recalcular} disabled={recalculando} aria-busy={recalculando}>
							{recalculando ? "Recalculando…" : "Recalcular"}
						</Button>
					</>
				}
			>
				<p className="body">As datas mudam; os módulos ficam como estão.</p>
				{erroRecalcular ? <p className="body-sm cursos__erro">{erroRecalcular}</p> : null}
			</Modal>
		</motion.section>
	);
}
