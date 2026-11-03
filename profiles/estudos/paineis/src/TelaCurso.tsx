// A visão do curso pronto (item 5, parte C, docs/cursos.md, "A tela"), em
// caderno/<matéria>/cursos/<curso>, no lugar do índice e da seção do
// caderno, com a aba no topo (como o guia). Em cima, "Curso · <matéria>", o
// nome e a ficha das leituras (prazo, horas por semana, módulos, conceitos,
// tipo e escopo), com "Rever o guia" (o guia só para leitura); embaixo, os
// módulos em ModuleCard numa grade de 2 colunas, com o objetivo e as datas de
// cada um, e o calendário gravado no dia da
// criação (o mesmo Calendario da etapa Esqueleto, só leitura), com
// "Recalcular o calendário" (recalcular_calendario, depois de confirmar no
// modal): as datas passam a ser as de hoje, e os módulos ficam.
//
// Os módulos são gerados sob demanda (item 6, docs/modulos.md, "A tela" e "O
// card de cada módulo"), pela ponte "modulos" (modulos-ponte.ts). Cada card
// mostra o estado do módulo (modulos-tela.ts, cardsDosModulos), com as
// classes do perfil por cima do ModuleCard (classesDoCard): o não gerado é
// preto, com "Gerar módulo", que abre o formulário (ModalGerarModulo);
// durante a geração, o card preto se enche de musgo pelo progresso e embaixo
// dele aparecem a etapa e "Parar"; o gerado é musgo, com "Abrir" (a visão do
// módulo gerado, TelaModulo.tsx) e, embaixo, "Gerado" com as lições e as
// questões, "Gerar de novo" (com confirmação) e "3 de 12 questões feitas"
// (o progresso do estado); o concluído é o holográfico,
// com "Rever" e, embaixo, a linha do relatório do método ("Gerando o relatório…",
// "Relatório: 2 propostas para decidir" ou "Relatório pronto"; docs/metodo-ciclo.md); o aguardando material é preto, com a etiqueta, a nota e "Gerar
// agora"; o erro, a mensagem e "Tentar de novo". Só o recomendado leva a
// etiqueta "Próximo". Nenhum card fica bloqueado.

import { Button, Callout, EmptyState, Modal, ModuleCard, Readout, SpecBox, Tag, type Tone } from "@estudos/design-system";
import { AgenteAnimado, type DadosAvatarAgente, type JanelaPerfilHook } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { hojeLocal } from "../../lib/curso-tipos.ts";
import { resumoDoEsqueleto, type ResumoEsqueleto } from "../../lib/esqueleto-tipos.ts";
import { type Materia, pastaMateriaisRelativa } from "../../lib/materia-tipos.ts";
import { useCurso } from "./cursos-ponte.ts";
import { numeroCurto } from "./diagnostico-tela.ts";
import { Calendario } from "./EtapaEsqueleto.tsx";
import { datasDoCard, leiturasDoCurso, rotuloPrazo } from "./esqueleto-tela.ts";
import { caminhoDoGuia } from "./guia-curso.ts";
import { ModalGerarModulo } from "./ModalGerarModulo.tsx";
import { caminhoDoModulo } from "./modulo-tela.ts";
import { useModulos } from "./modulos-ponte.ts";
import {
	acaoDoCard,
	type CamposPedido,
	type CardModulo,
	cardsDosModulos,
	classesDoCard,
	estiloDoCard,
	PERGUNTA_GERAR_DE_NOVO,
	resumoDoGerado,
	textoDasFeitas,
	textoDaEtapa,
} from "./modulos-tela.ts";
import { linhaDoRelatorioNoCard } from "./relatorio-tela.ts";

const MOLA = { type: "spring", stiffness: 380, damping: 32 } as const;

export interface PropsTelaCurso {
	janela: JanelaPerfilHook;
	materiaId: string;
	materia?: Materia;
	cursoId: string;
	navegar(caminho: string): void;
	/** Cor da capa, para o bloco do ideograma. */
	tom: Tone;
	/** O agente da sessão (a foto enquanto um módulo é gerado). */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
}

/** O formulário aberto: o módulo, se é gerar de novo, o que foi pedido antes e a vez (monta o formulário de novo a cada abertura). */
interface FormularioAberto {
	modulo: string;
	deNovo: boolean;
	inicial?: CamposPedido;
	vez: number;
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

	// Os módulos (a ponte "modulos"): lista de novo quando o curso fica pronto e quando os materiais prontos da matéria mudam.
	const pasta = pastaMateriaisRelativa(materiaId);
	const materiais = props.janela.estado.materiais?.filter((material) => material.pasta === pasta);
	const prontos = materiais?.filter((material) => material.estado === "pronto").length ?? 0;
	const modulos = useModulos(props.janela, materiaId, cursoId, `${curso?.situacao ?? ""}/${prontos}`);
	const [formulario, setFormulario] = useState<FormularioAberto | undefined>(undefined);
	const [formularioAberto, setFormularioAberto] = useState(false);
	const abrirFormulario = (modulo: string, deNovo = false) => {
		const inicial = modulos.pedidos[modulo];
		setFormulario((antes) => ({ modulo, deNovo, vez: (antes?.vez ?? 0) + 1, ...(inicial ? { inicial } : {}) }));
		setFormularioAberto(true);
	};
	// "Gerar de novo": o módulo esperando a confirmação.
	const [perguntarDeNovo, setPerguntarDeNovo] = useState<string | undefined>(undefined);
	// "Parar": os módulos com a ação saindo e o erro de mandar.
	const [parando, setParando] = useState<string[]>([]);
	const [errosParar, setErrosParar] = useState<Record<string, string>>({});
	const parar = (modulo: string) => {
		if (parando.includes(modulo)) return;
		setParando((atuais) => [...atuais, modulo]);
		setErrosParar((atuais) => {
			const { [modulo]: _antigo, ...resto } = atuais;
			return resto;
		});
		modulos
			.cancelar(modulo)
			.catch((falha: unknown) => setErrosParar((atuais) => ({ ...atuais, [modulo]: falha instanceof Error ? falha.message : String(falha) })))
			.finally(() => setParando((atuais) => atuais.filter((id) => id !== modulo)));
	};

	let resumo: ResumoEsqueleto | undefined;
	if (curso?.esqueleto) {
		try {
			resumo = resumoDoEsqueleto(curso.esqueleto, curso.mapa?.conceitos ?? []);
		} catch {
			resumo = undefined;
		}
	}

	/** O número, o nome e o rótulo ("Módulo 03 · Derivadas") de um módulo do esqueleto. */
	const moduloDoFormulario = (id: string | undefined) => {
		const achado = id ? resumo?.modulos.find((modulo) => modulo.id === id) : undefined;
		return achado ? { numero: achado.numero, nome: achado.nome, rotulo: `Módulo ${String(achado.numero).padStart(2, "0")} · ${achado.nome}` } : undefined;
	};

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
		const cards = cardsDosModulos(
			resumo.modulos.map((modulo) => modulo.id),
			modulos.estado,
		);
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
					{modulos.erroLista ? (
						<div className="mod__erro-lista">
							<p className="body-sm cursos__erro">{modulos.erroLista.mensagem}</p>
							<Button variant="ghost" size="sm" icon="refresh" onClick={modulos.listar}>
								Tentar de novo
							</Button>
						</div>
					) : null}
					<ul className="curso__modulos">
						{resumo.modulos.map((modulo, indice) => {
							const card: CardModulo = cards[modulo.id] ?? { tipo: "carregando", state: "next", cor: "preto", recomendado: false };
							const estado = card.modulo;
							const abreFormulario = card.tipo === "gerar" || card.tipo === "aguardando" || card.tipo === "erro";
							const abreModulo = card.tipo === "gerado" || card.tipo === "concluido";
							const estilo = estiloDoCard(card);
							const erroModulo = errosParar[modulo.id] ?? modulos.errosModulo[modulo.id]?.mensagem;
							return (
								<motion.li
									key={modulo.id}
									className="curso__modulo"
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ ...MOLA, delay: Math.min(indice, 10) * 0.04 }}
								>
									<ModuleCard
										as="div"
										className={classesDoCard(card)}
										{...(estilo ? { style: estilo as CSSProperties } : {})}
										state={card.state}
										number={modulo.numero}
										title={modulo.nome}
										readings={[
											abreModulo && typeof estado?.licoesGeradas === "number"
												? { label: "Lições", value: String(estado.licoesGeradas) }
												: { label: "Conceitos", value: String(modulo.conceitos) },
											{ label: "Horas", value: numeroCurto(modulo.horas), unit: "h" },
										]}
										action={acaoDoCard(card.tipo)}
										{...(abreFormulario
											? { onOpen: () => abrirFormulario(modulo.id) }
											: abreModulo
												? { onOpen: () => props.navegar(caminhoDoModulo(materiaId, cursoId, modulo.id)) }
												: {})}
									/>
									<RodapeModulo
										card={card}
										parando={parando.includes(modulo.id)}
										parar={() => parar(modulo.id)}
										gerarDeNovo={() => setPerguntarDeNovo(modulo.id)}
										{...(erroModulo && card.tipo !== "erro" ? { erro: erroModulo } : {})}
										{...(props.agente ? { agente: props.agente } : {})}
									/>
									<div className="curso__modulo-texto">
										{modulo.objetivo ? <p className="body-sm curso__objetivo">{modulo.objetivo}</p> : null}
										<p className="data curso__datas">{datasDoCard(modulo.inicio, modulo.fim, modulo.avaliacao)}</p>
									</div>
								</motion.li>
							);
						})}
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
			<Modal
				open={perguntarDeNovo !== undefined}
				onClose={() => setPerguntarDeNovo(undefined)}
				kicker={moduloDoFormulario(perguntarDeNovo)?.rotulo ?? "Módulo"}
				title={PERGUNTA_GERAR_DE_NOVO.titulo}
				size="sm"
				footer={
					<>
						<Button variant="secondary" onClick={() => setPerguntarDeNovo(undefined)}>
							Manter
						</Button>
						<Button
							variant="primary"
							icon="refresh"
							onClick={() => {
								const modulo = perguntarDeNovo;
								setPerguntarDeNovo(undefined);
								if (modulo) abrirFormulario(modulo, true);
							}}
						>
							Gerar de novo
						</Button>
					</>
				}
			>
				<p className="body">{PERGUNTA_GERAR_DE_NOVO.texto}</p>
			</Modal>
			{formulario && moduloDoFormulario(formulario.modulo) ? (
				<ModalGerarModulo
					key={formulario.vez}
					aberto={formularioAberto}
					fechar={() => setFormularioAberto(false)}
					numero={moduloDoFormulario(formulario.modulo)!.numero}
					nome={moduloDoFormulario(formulario.modulo)!.nome}
					{...(curso?.nome ? { curso: curso.nome } : {})}
					{...(formulario.inicial ? { inicial: formulario.inicial } : {})}
					deNovo={formulario.deNovo}
					{...(materiais ? { materiais } : {})}
					pasta={pasta}
					enviar={(arquivos) => props.janela.acoes.enviarMateriais(pasta, arquivos)}
					reprocessar={(caminho) => props.janela.acoes.reprocessarMaterial(caminho)}
					gerar={(campos) => modulos.gerar(formulario.modulo, campos)}
					aguardar={(nota) => modulos.aguardar(formulario.modulo, nota)}
				/>
			) : null}
		</motion.section>
	);
}

/**
 * O que fica embaixo do card, pelo estado do módulo: durante a geração, a
 * etapa e "Parar" (o progresso é o enchimento do card); no gerado, "Gerado",
 * as lições e as questões, "Gerar de novo" e "3 de 12 questões feitas"; no aguardando material, a
 * etiqueta, a nota e o aviso de material novo; no erro, a mensagem; no
 * concluído, a linha do relatório do método (docs/metodo-ciclo.md; ou nada).
 */
function RodapeModulo(props: {
	card: CardModulo;
	parando: boolean;
	parar(): void;
	gerarDeNovo(): void;
	/** O erro de parar (ou outro erro do módulo sem pedido). */
	erro?: string;
	agente?: { nome: string; avatar?: DadosAvatarAgente };
}) {
	const { card } = props;
	const estado = card.modulo;
	let conteudo: ReactNode = null;
	if (card.tipo === "gerando" && estado) {
		conteudo = (
			<div className="mod__gerando">
				<div className="mod__linha">
					<AgenteAnimado nome={props.agente?.nome ?? "professor"} {...(props.agente?.avatar ? { avatar: props.agente.avatar } : {})} atividade="pensando" tamanho={32} />
					<p className="body-sm mod__etapa" aria-live="polite">
						{textoDaEtapa(estado)}
					</p>
					<Button variant="ghost" size="sm" icon="stop" onClick={props.parar} disabled={props.parando} aria-busy={props.parando}>
						{props.parando ? "Parando…" : "Parar"}
					</Button>
				</div>
			</div>
		);
	} else if (card.tipo === "gerado") {
		const resumo = estado ? resumoDoGerado(estado) : "";
		const feitas = textoDasFeitas(estado?.progresso);
		conteudo = (
			<>
				<div className="mod__linha">
					<Tag size="sm" tone="sage" icon="check">
						Gerado
					</Tag>
					{resumo ? <span className="data mod__resumo">{resumo}</span> : null}
					<Button variant="ghost" size="sm" icon="refresh" className="mod__de-novo" onClick={props.gerarDeNovo}>
						Gerar de novo
					</Button>
				</div>
				{feitas ? <p className="data mod__feitas">{feitas}</p> : null}
			</>
		);
	} else if (card.tipo === "aguardando") {
		conteudo = (
			<>
				<div className="mod__linha">
					<Tag size="sm" tone="amber" icon="clock">
						Aguardando material
					</Tag>
					{estado?.nota ? <span className="body-sm mod__nota">{estado.nota}</span> : null}
				</div>
				{estado?.materialNovo ? (
					<Callout tone="amber" label="Material novo" icon="paperclip" quote={false}>
						<p>Material novo na matéria: gerar agora?</p>
					</Callout>
				) : null}
			</>
		);
	} else if (card.tipo === "erro") {
		conteudo = (
			<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
				<p>{estado?.mensagem || "A geração falhou."}</p>
			</Callout>
		);
	} else if (card.tipo === "concluido") {
		// O relatório do método: gerando, com propostas para decidir ou pronto (erro, pouco retorno e sem relatório, nada).
		const linha = linhaDoRelatorioNoCard(estado?.relatorio);
		if (linha) {
			const gerando = estado?.relatorio?.situacao === "gerando";
			const pendentes = (estado?.relatorio?.pendentes ?? 0) > 0;
			conteudo = (
				<div className="mod__linha mod__relatorio">
					<Tag size="sm" tone={gerando ? "steel" : pendentes ? "amber" : "sage"} icon={gerando ? "clock" : pendentes ? "checklist" : "check"}>
						{linha}
					</Tag>
				</div>
			);
		}
	}
	if (!conteudo && !props.erro) return null;
	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.div
				key={card.tipo}
				className="mod__rodape"
				initial={{ opacity: 0, y: -4 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
				transition={MOLA}
			>
				{conteudo}
				{props.erro ? <p className="body-sm cursos__erro mod__erro">{props.erro}</p> : null}
			</motion.div>
		</AnimatePresence>
	);
}
