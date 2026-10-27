// A visão do módulo gerado (item 6, parte B, docs/modulos.md), em
// caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>] (sem a lição, a
// primeira; F5 volta na mesma). Tela inteira, como a visão do curso, mas no
// topo, no lugar da aba do caderno, a CourseBar: "Curso" volta para a visão do
// curso, a capa da matéria, "Módulo 03 · <nome>", "<curso> · lição 2 de 4", a
// trilha dos módulos do curso (os gerados dá para abrir; os outros e a
// avaliação geral, tracejados) e "Próxima lição" (na última, "Voltar ao
// curso").
//
// Embaixo, duas colunas (a partir de 900 px do contêiner; abaixo, o índice
// vira fichas por cima): à esquerda, fixo, o índice das lições e o resumo do
// módulo; à direita, o aviso de visualização (dá para fechar; lembrado no
// localStorage), o cabeçalho da lição e os blocos, cada um num LessonBlock
// na coluna de leitura, com a SectionRuler na margem (o bloco atual é o que
// está no meio da tela). As questões mostram o gabarito só quando pedido
// ("Ver gabarito", "Ver resposta", "Ver rubrica e resposta-modelo"); as
// referências abrem o material. Responder e pedir outra explicação chegam
// com a aula (item 7). No pé, a lição anterior e a próxima.
//
// O módulo vem da ponte "modulos" (useModuloAberto, a ação "abrir"); o nome
// e a ordem dos módulos, do curso (useCurso); quais estão gerados, do estado
// dos módulos (useModulos).

import {
	Button,
	Callout,
	CourseBar,
	EmptyState,
	LessonBlock,
	type OrnamentGlyph,
	pad2,
	QuizQuestion,
	SectionRuler,
	Tag,
	type Tone,
} from "@estudos/design-system";
import { type JanelaPerfilHook, Markdown, semMovimento } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";
import type { Bloco, BlocoAlternativa, BlocoDissertativa, BlocoVerificacao, EstadoModuloNaTela, Licao, Modulo } from "../../lib/modulo-tipos.ts";
import { rotuloCapa } from "./comum.ts";
import { useCurso } from "./cursos-ponte.ts";
import { numeroCurto, partesDaQuestao } from "./diagnostico-tela.ts";
import { agruparReferencias } from "./mapa-ponte.ts";
import {
	type Abertura,
	aberturaDoModulo,
	avisoFechado,
	caminhoDoModulo,
	ehComplemento,
	fraseDaConfusao,
	ID_AVALIACAO_GERAL,
	idDaCorreta,
	indiceDaLicao,
	itensDaRegua,
	itensDoIndice,
	kickerDaBarra,
	lembrarAvisoFechado,
	passosDaTrilha,
	proximoDaBarra,
	resumoDoIndice,
	rotuloDoBloco,
	TEXTO_AVISO,
	tituloDoModulo,
} from "./modulo-tela.ts";
import { useModuloAberto, useModulos } from "./modulos-ponte.ts";
import { EtiquetaReferencia } from "./SecaoMapa.tsx";

const MOLA = { type: "spring", stiffness: 380, damping: 32 } as const;

/** Os ideogramas de número (um a dez), para a tela vazia do módulo. */
const NUMEROS: readonly OrnamentGlyph[] = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

export interface PropsTelaModulo {
	janela: JanelaPerfilHook;
	materiaId: string;
	materia?: Materia;
	/** O número do caderno (para a capa). */
	numero?: number;
	cursoId: string;
	moduloId: string;
	/** A lição da rota; sem ela, a primeira. */
	licaoId?: string;
	navegar(caminho: string): void;
	tom: Tone;
}

/** Os hooks da ponte e a navegação; quem desenha é a VisaoModulo. */
export function TelaModulo(props: PropsTelaModulo) {
	const { materiaId, cursoId, moduloId } = props;
	const { curso, erro: erroCurso } = useCurso(props.janela, materiaId, cursoId);
	const modulos = useModulos(props.janela, materiaId, cursoId);
	const aberto = useModuloAberto(props.janela, materiaId, cursoId, moduloId);
	const doCurso = curso?.esqueleto?.modulos.map((modulo, indice) => ({ id: modulo.id, numero: indice + 1, nome: modulo.nome })) ?? [];
	const abertura: Abertura = !curso && erroCurso ? { tipo: "ilegivel", mensagem: erroCurso } : aberturaDoModulo(aberto);
	return (
		<VisaoModulo
			{...(props.materia ? { materia: props.materia } : {})}
			{...(props.numero ? { numero: props.numero } : {})}
			tom={props.tom}
			{...(curso?.nome ? { cursoNome: curso.nome } : {})}
			modulosDoCurso={doCurso}
			{...(modulos.estado ? { estados: modulos.estado.modulos } : {})}
			moduloId={moduloId}
			abertura={abertura}
			{...(props.licaoId ? { licaoId: props.licaoId } : {})}
			voltarAoCurso={() => props.navegar(`caderno/${materiaId}/cursos/${cursoId}`)}
			abrirModulo={(id) => props.navegar(caminhoDoModulo(materiaId, cursoId, id))}
			abrirLicao={(id) => props.navegar(caminhoDoModulo(materiaId, cursoId, moduloId, id))}
			abrirMaterial={(arquivo) => props.navegar(`caderno/${materiaId}/materiais/${arquivo}`)}
			tentarDeNovo={aberto.abrirDeNovo}
		/>
	);
}

export interface PropsVisaoModulo {
	materia?: Materia;
	numero?: number;
	tom: Tone;
	cursoNome?: string;
	/** Os módulos do esqueleto, na ordem (vazio enquanto o curso não chega). */
	modulosDoCurso: ReadonlyArray<{ id: string; numero: number; nome: string }>;
	/** O estado dos módulos que a extensão mandou (para a trilha). */
	estados?: ReadonlyArray<Pick<EstadoModuloNaTela, "id" | "situacao" | "geradoEm">>;
	moduloId: string;
	abertura: Abertura;
	licaoId?: string;
	voltarAoCurso(): void;
	abrirModulo(id: string): void;
	abrirLicao(id: string): void;
	abrirMaterial(arquivo: string): void;
	tentarDeNovo(): void;
}

/** A CourseBar e o corpo da visão, pelos dados (sem ponte: dá para desenhar no servidor). */
export function VisaoModulo(props: PropsVisaoModulo) {
	const { materia, abertura, moduloId } = props;
	const doEsqueleto = props.modulosDoCurso.find((modulo) => modulo.id === moduloId);
	const modulo = abertura.tipo === "pronto" ? abertura.modulo : undefined;
	const indice = modulo ? indiceDaLicao(modulo.licoes, props.licaoId) : 0;
	const licao = modulo?.licoes[indice];
	const total = modulo?.licoes.length ?? 0;
	const proximo = modulo ? proximoDaBarra(indice, total) : undefined;
	const irParaProximo = () => {
		if (!modulo || !proximo) return;
		if (proximo.destino === "curso") props.voltarAoCurso();
		else props.abrirLicao(modulo.licoes[indice + 1]!.id);
	};

	let conteudo: ReactNode;
	if (abertura.tipo === "carregando") {
		conteudo = <p className="body caderno__carregando">Abrindo o módulo…</p>;
	} else if (abertura.tipo === "nao_gerado" || abertura.tipo === "ilegivel") {
		const naoGerado = abertura.tipo === "nao_gerado";
		conteudo = (
			<EmptyState
				glyph={naoGerado ? (doEsqueleto && doEsqueleto.numero <= NUMEROS.length ? NUMEROS[doEsqueleto.numero - 1]! : "新") : "問"}
				tone={props.tom}
				title={naoGerado ? "Este módulo ainda não foi gerado" : "Não consegui abrir este módulo"}
				action={
					<Button variant="primary" icon="arrow-left" onClick={props.voltarAoCurso}>
						Voltar ao curso
					</Button>
				}
			>
				{naoGerado ? "Gere o módulo pelo card dele, na visão do curso. As lições aparecem aqui quando ficarem prontas." : abertura.mensagem}
			</EmptyState>
		);
	} else if (abertura.tipo === "erro") {
		conteudo = (
			<div className="modulo__erro">
				<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
					<p>{abertura.mensagem}</p>
					<div className="modulo__erro-botoes">
						<Button variant="secondary" size="sm" icon="refresh" onClick={props.tentarDeNovo}>
							Tentar de novo
						</Button>
					</div>
				</Callout>
			</div>
		);
	} else if (modulo && licao) {
		conteudo = (
			<LicaoAberta
				modulo={modulo}
				licao={licao}
				indice={indice}
				abrirLicao={props.abrirLicao}
				abrirMaterial={props.abrirMaterial}
				voltarAoCurso={props.voltarAoCurso}
			/>
		);
	}

	return (
		<>
			<CourseBar
				className="aba-caderno aba-modulo"
				title={doEsqueleto ? tituloDoModulo(doEsqueleto.numero, doEsqueleto.nome) : "Módulo"}
				kicker={kickerDaBarra(props.cursoNome ?? "Curso", modulo ? { indice, total } : undefined)}
				{...(materia
					? {
							cover: {
								tone: materia.cor,
								glyph: materia.glifo as OrnamentGlyph,
								label: rotuloCapa(materia.nome),
								...(props.numero ? { number: pad2(props.numero) } : {}),
							},
						}
					: {})}
				steps={passosDaTrilha(props.modulosDoCurso, props.estados, moduloId)}
				onStepClick={(id) => {
					if (id !== moduloId && id !== ID_AVALIACAO_GERAL) props.abrirModulo(id);
				}}
				onBack={props.voltarAoCurso}
				backLabel="Curso"
				{...(proximo ? { next: { label: proximo.label, kicker: proximo.kicker, onClick: irParaProximo } } : {})}
			/>
			<motion.section
				className="curso modulo"
				aria-label={doEsqueleto ? tituloDoModulo(doEsqueleto.numero, doEsqueleto.nome) : "Módulo"}
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={MOLA}
			>
				{abertura.tipo === "pronto" ? conteudo : <div className="curso__corpo">{conteudo}</div>}
			</motion.section>
		</>
	);
}

/** O índice das lições e a lição aberta, com a régua dos blocos e o pé. */
function LicaoAberta(props: {
	modulo: Modulo;
	licao: Licao;
	indice: number;
	abrirLicao(id: string): void;
	abrirMaterial(arquivo: string): void;
	voltarAoCurso(): void;
}) {
	const { modulo, licao, indice } = props;
	const total = modulo.licoes.length;
	const corpo = useRef<HTMLDivElement>(null);
	const artigo = useRef<HTMLElement>(null);
	const [atual, setAtual] = useState<string | undefined>(licao.blocos[0]?.id);
	const [aviso, setAviso] = useState(() => !avisoFechado());

	// Outra lição: volta para o topo e o primeiro bloco é o atual.
	const primeira = useRef(true);
	useEffect(() => {
		setAtual(licao.blocos[0]?.id);
		if (primeira.current) {
			primeira.current = false;
			return;
		}
		corpo.current?.scrollTo({ top: 0 });
	}, [licao.id]);

	// O bloco atual da régua: o que cruza a linha do meio da área que rola.
	useEffect(() => {
		const raiz = corpo.current;
		const blocos = artigo.current?.querySelectorAll<HTMLElement>("[data-bloco]");
		if (!raiz || !blocos?.length || typeof IntersectionObserver !== "function") return;
		const observador = new IntersectionObserver(
			(entradas) => {
				for (const entrada of entradas) {
					const id = (entrada.target as HTMLElement).dataset.bloco;
					if (entrada.isIntersecting && id) setAtual(id);
				}
			},
			{ root: raiz, rootMargin: "-50% 0px -50% 0px", threshold: 0 },
		);
		for (const bloco of blocos) observador.observe(bloco);
		return () => observador.disconnect();
	}, [licao.id]);

	const irParaBloco = (id: string) => {
		const alvo = artigo.current?.querySelector<HTMLElement>(`[data-bloco="${CSS.escape(id)}"]`);
		if (!alvo) return;
		setAtual(id);
		alvo.scrollIntoView({ block: "start", behavior: semMovimento() ? "auto" : "smooth" });
	};
	const fecharAviso = () => {
		setAviso(false);
		lembrarAvisoFechado();
	};
	const ultima = indice + 1 >= total;

	return (
		<div ref={corpo} className="curso__corpo modulo__corpo">
			<div className="modulo__grade">
				<nav className="modulo__indice" aria-label="Lições do módulo">
					<p className="overline modulo__indice-titulo">Lições</p>
					<ol className="modulo__licoes">
						{itensDoIndice(modulo.licoes, indice).map((item) => (
							<li key={item.id}>
								<button
									type="button"
									className={`modulo__item${item.atual ? " modulo__item--atual" : ""}`}
									aria-current={item.atual ? "page" : undefined}
									title={item.titulo}
									onClick={() => props.abrirLicao(item.id)}
								>
									<span className="data modulo__item-num">{item.numero}</span>
									<span className="body modulo__item-titulo">{item.titulo}</span>
								</button>
							</li>
						))}
					</ol>
					<p className="data modulo__resumo">{resumoDoIndice(modulo)}</p>
				</nav>
				<div className="modulo__leitura">
					<SectionRuler className="modulo__regua" label="Blocos da lição" items={itensDaRegua(licao)} {...(atual ? { current: atual } : {})} onSelect={irParaBloco} />
					<motion.article
						ref={artigo}
						key={licao.id}
						className="modulo__licao"
						aria-labelledby="modulo-licao-titulo"
						initial={semMovimento() ? false : { opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={MOLA}
					>
						<AnimatePresence initial={false}>
							{aviso ? (
								<motion.div
									key="aviso"
									className="modulo__aviso"
									exit={semMovimento() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.16 } }}
								>
									<Callout tone="steel" label="Visualização" icon="help" quote={false}>
										<p>{TEXTO_AVISO}</p>
									</Callout>
									<Button variant="ghost" size="sm" iconOnly icon="close" className="modulo__aviso-fechar" aria-label="Fechar o aviso" onClick={fecharAviso} />
								</motion.div>
							) : null}
						</AnimatePresence>
						<header className="modulo__cabeca">
							<p className="overline modulo__cabeca-rotulo">
								Lição {indice + 1} de {total}
							</p>
							<h2 id="modulo-licao-titulo" className="heading modulo__titulo">
								{licao.titulo}
							</h2>
							{licao.objetivo ? <p className="body modulo__objetivo">{licao.objetivo}</p> : null}
						</header>
						<div className="modulo__blocos">
							{licao.blocos.map((bloco, posicao) => (
								<BlocoDaLicao key={bloco.id} bloco={bloco} numero={posicao + 1} abrirMaterial={props.abrirMaterial} />
							))}
						</div>
						<footer className="modulo__pe">
							<Button
								variant="ghost"
								icon="arrow-left"
								disabled={indice === 0}
								onClick={() => {
									if (indice > 0) props.abrirLicao(modulo.licoes[indice - 1]!.id);
								}}
							>
								Lição anterior
							</Button>
							<Button
								variant="secondary"
								iconRight="arrow-right"
								onClick={() => (ultima ? props.voltarAoCurso() : props.abrirLicao(modulo.licoes[indice + 1]!.id))}
							>
								{ultima ? "Voltar ao curso" : "Próxima lição"}
							</Button>
						</footer>
					</motion.article>
				</div>
			</div>
		</div>
	);
}

/** Um bloco da lição num LessonBlock: o rótulo (e "Além do material"), o conteúdo, o gabarito para ver e as referências. */
export function BlocoDaLicao(props: { bloco: Bloco; numero: number; abrirMaterial(arquivo: string): void }) {
	const { bloco } = props;
	const [aberto, setAberto] = useState(false);
	const { rotulo, icone } = rotuloDoBloco(bloco);
	const referencias = "referencias" in bloco ? agruparReferencias(bloco.referencias) : [];

	let conteudo: ReactNode;
	let gabarito: ReactNode = null;
	let botao: { ver: string; esconder: string } | undefined;
	if (bloco.tipo === "explicacao") {
		conteudo = <Markdown texto={bloco.texto} />;
	} else if (bloco.tipo === "verificacao") {
		conteudo = <Markdown texto={bloco.pergunta} />;
		botao = { ver: "Ver resposta", esconder: "Esconder resposta" };
		gabarito = <RespostaEsperada bloco={bloco} />;
	} else if (bloco.tipo === "alternativa") {
		conteudo = <QuestaoAlternativa bloco={bloco} gabarito={aberto} />;
		botao = { ver: "Ver gabarito", esconder: "Esconder gabarito" };
		gabarito = bloco.explicacao ? (
			<div className="modulo__gabarito">
				<p className="overline modulo__gabarito-rotulo">Explicação</p>
				<Markdown texto={bloco.explicacao} />
			</div>
		) : null;
	} else {
		conteudo = <QuestaoDissertativa bloco={bloco} />;
		botao = { ver: "Ver rubrica e resposta-modelo", esconder: "Esconder rubrica e resposta-modelo" };
		gabarito = <RubricaEResposta bloco={bloco} />;
	}

	return (
		<div className="modulo__bloco" data-bloco={bloco.id}>
			<LessonBlock
				index={props.numero}
				{...(botao
					? {
							actions: (
								<Button variant="ghost" size="sm" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
									{aberto ? botao.esconder : botao.ver}
								</Button>
							),
						}
					: {})}
			>
				<header className="ap-block__head modulo__bloco-cabeca">
					<Tag className="ap-block__label" tone="steel" size="sm" icon={icone}>
						{rotulo}
					</Tag>
					{ehComplemento(bloco) ? (
						<Tag tone="amber" size="sm" title="Este bloco vai além dos seus materiais.">
							Além do material
						</Tag>
					) : null}
				</header>
				{conteudo}
				<AnimatePresence initial={false}>
					{aberto && gabarito ? (
						<motion.div
							key="gabarito"
							className="modulo__revelado"
							initial={semMovimento() ? false : { opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={semMovimento() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.12 } }}
							transition={MOLA}
						>
							{gabarito}
						</motion.div>
					) : null}
				</AnimatePresence>
			</LessonBlock>
			{referencias.length > 0 ? (
				<div className="mapa__marcas modulo__referencias" aria-label="Referências ao material">
					{referencias.map((referencia) => (
						<EtiquetaReferencia key={referencia.arquivo} arquivo={referencia.arquivo} locais={referencia.locais} abrir={() => props.abrirMaterial(referencia.arquivo)} />
					))}
				</div>
			) : null}
		</div>
	);
}

/** O contexto de uma questão (o cenário, em markdown), quando ela tem. */
function Contexto({ texto }: { texto: string | undefined }) {
	if (!texto) return null;
	return (
		<div className="modulo__contexto">
			<Markdown texto={texto} />
		</div>
	);
}

/** A alternativa sem valor e desligada; com o gabarito, a correta e, embaixo de cada errada, a confusão dela. */
function QuestaoAlternativa({ bloco, gabarito }: { bloco: BlocoAlternativa; gabarito: boolean }) {
	const partes = partesDaQuestao(bloco);
	const correta = idDaCorreta(bloco.alternativas);
	return (
		<div className="modulo__questao">
			<Contexto texto={partes.contexto} />
			<QuizQuestion
				prompt={<Markdown texto={partes.pergunta} emLinha />}
				value={null}
				disabled
				options={bloco.alternativas.map((alternativa, indice) => {
					const confusao = gabarito && alternativa.correta !== true ? fraseDaConfusao(alternativa.confusao) : "";
					return {
						id: String(indice),
						label: (
							<>
								<Markdown texto={alternativa.texto} emLinha />
								{confusao ? <span className="body-sm modulo__confusao">{confusao}</span> : null}
							</>
						),
					};
				})}
				{...(gabarito && correta !== undefined ? { correctId: correta } : {})}
			/>
		</div>
	);
}

/** A pergunta da dissertativa (o contexto e o enunciado). */
function QuestaoDissertativa({ bloco }: { bloco: BlocoDissertativa }) {
	const partes = partesDaQuestao(bloco);
	return (
		<div className="modulo__questao">
			<Contexto texto={partes.contexto} />
			<h3 className="ap-quiz__prompt heading">
				<Markdown texto={partes.pergunta} emLinha />
			</h3>
		</div>
	);
}

/** A resposta esperada da verificação, num bloco recuado. */
function RespostaEsperada({ bloco }: { bloco: BlocoVerificacao }) {
	return (
		<div className="modulo__gabarito modulo__gabarito--recuado">
			<p className="overline modulo__gabarito-rotulo">Resposta esperada</p>
			<Markdown texto={bloco.respostaEsperada} />
		</div>
	);
}

/** Os critérios da rubrica (nome, descrição e pontos) e a resposta-modelo da dissertativa. */
function RubricaEResposta({ bloco }: { bloco: BlocoDissertativa }) {
	const pontos = bloco.rubrica.reduce((soma, item) => soma + (item.pontos || 0), 0);
	return (
		<>
			<div className="modulo__gabarito">
				<p className="overline modulo__gabarito-rotulo">Rubrica · {numeroCurto(pontos)} pontos</p>
				<ul className="modulo__rubrica">
					{bloco.rubrica.map((item) => (
						<li key={item.criterio} className="modulo__criterio">
							<p className="body-strong modulo__criterio-nome">
								{item.criterio} <span className="data modulo__criterio-pontos">{numeroCurto(item.pontos)} {item.pontos === 1 ? "ponto" : "pontos"}</span>
							</p>
							{item.descricao ? <p className="body modulo__criterio-descricao">{item.descricao}</p> : null}
						</li>
					))}
				</ul>
			</div>
			<div className="modulo__gabarito modulo__gabarito--recuado">
				<p className="overline modulo__gabarito-rotulo">Resposta-modelo</p>
				<Markdown texto={bloco.respostaModelo} />
			</div>
		</>
	);
}
