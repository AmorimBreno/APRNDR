// A etapa Diagnóstico do guia de curso (item 5, parte B, docs/cursos.md,
// "Parte B: o diagnóstico"), em três fases na mesma etapa: autoavaliação (um
// nível por conceito, salvo sozinho), questões (uma por vez, a confiança antes
// de responder, sem gabarito) e resultado, em duas colunas: o índice (o placar
// e, por assunto, o que você disse e as questões) e uma questão por vez, num
// cartão na cor do resultado, com o gabarito e a correção. A fase vem do curso
// (faseDoDiagnostico); gerar as questões e corrigir a dissertativa correm em
// segundo plano na extensão dos cursos (cursos-ponte.ts).
//
// useEtapaDiagnostico devolve o corpo, o primário e o "Voltar" do rodapé do
// guia (TelaGuiaCurso.tsx), e o modal de "Gerar de novo".

import { Button, Callout, EssayAnswer, Icon, Modal, pad2, QuizFeedback, QuizProgress, QuizQuestion, StudentNote, Tag } from "@estudos/design-system";
import { AgenteAnimado, type DadosAvatarAgente, Markdown, semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Curso } from "../../lib/curso-tipos.ts";
import {
	CONFIANCAS,
	type Confianca,
	type DiagnosticoEmAndamento,
	type DiagnosticoNaTela,
	escolherConceitos,
	faltaCorrigir,
	NIVEIS,
	type NivelAutoavaliacao,
	NOMES_CONFIANCA,
	NOMES_NIVEL,
	type QuestaoNaTela,
	type RespostaAlternativa,
	type RespostaDissertativa,
	type RespostaNaTela,
	type ResumoDiagnostico,
	resumoDoDiagnostico,
} from "../../lib/diagnostico-tipos.ts";
import type { Conceito } from "../../lib/mapa-tipos.ts";
import type { CursoAberto } from "./cursos-ponte.ts";
import {
	contarMarcados,
	criarSalvadorAdiado,
	criteriosDoFeedback,
	type EntradaDoResultado,
	FASES,
	faseDoDiagnostico,
	fraseDaConfusao,
	gruposPorAssunto,
	niveisDoCurso,
	NOMES_FASE,
	numeroCurto,
	ordemDeNavegacao,
	partesDaQuestao,
	questaoEmVista,
	type ResultadoNaTela,
	resultadoNaTela,
	type SalvadorAdiado,
	situacaoDaCorrecao,
	statusDaCorrecao,
	suaRespostaAlternativa,
	textoMarcados,
	pontosDasDissertativas,
	textoPlacar,
	tomDoResultado,
	vizinhasNaOrdem,
} from "./diagnostico-tela.ts";
import type { MapaDaMateria } from "./mapa-ponte.ts";

/** A troca de questão no resultado: uma mola curta (fade e um leve deslocamento). */
const MOLA_CURTA = { type: "spring", stiffness: 520, damping: 42 } as const;
/** O atraso do salvamento da autoavaliação depois da última mudança. */
const ATRASO_AUTOAVALIACAO = 600;
/** O mínimo de caracteres da dissertativa. */
const MINIMO_DISSERTATIVA = 40;

const mensagemDe = (falha: unknown) => (falha instanceof Error ? falha.message : String(falha));

export interface PropsEtapaDiagnostico {
	curso: Curso | undefined;
	/** O curso aberto pela ponte (as ações e o que corre em segundo plano). */
	aberto: CursoAberto;
	mapa: MapaDaMateria;
	/** O agente da sessão, para a foto enquanto as questões são geradas. */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
	/** A etapa Diagnóstico está em vista. */
	ativo: boolean;
	/** O aviso de erro do guia. */
	mostrarErro(mensagem: string | undefined): void;
	/** Depois de concluir (ou "Continuar" num diagnóstico concluído): vai para a etapa seguinte. */
	seguir(curso: Curso): void;
}

export interface EtapaDiagnostico {
	corpo: ReactNode;
	/** O primário do rodapé; sem ele, o rodapé fica sem primário (nas questões, o envio é na própria questão). */
	primario?: { texto: string; desligado?: string; acao(): void; ocupado?: boolean };
	/** O "Voltar" do rodapé, quando não é ir para a etapa anterior. */
	voltar?: () => void;
	modal: ReactNode;
}

export function useEtapaDiagnostico(props: PropsEtapaDiagnostico): EtapaDiagnostico {
	const { curso, aberto, mapa, ativo, mostrarErro } = props;
	const andamento = aberto.diagnostico;
	const concluido = Boolean(curso?.diagnostico);
	// Concluído, vale o da etapa; em andamento, o que a extensão mandou (sem gabarito enquanto falta responder).
	const diagnostico = (curso?.diagnostico ?? curso?.diagnosticoEmAndamento ?? null) as DiagnosticoNaTela | null;
	const conceitos = curso?.mapa?.conceitos ?? [];
	const porId = useMemo(() => new Map<string, Conceito>((mapa.mapa?.conceitos ?? []).map((conceito) => [conceito.id, conceito])), [mapa.mapa]);
	const nomeDe = (id: string) => porId.get(id)?.nome ?? id;

	// --- Autoavaliação: os níveis desta tela, salvos sozinhos ------------------------
	const [niveisLocais, setNiveisLocais] = useState<Record<string, NivelAutoavaliacao> | undefined>(undefined);
	const niveis = niveisLocais ?? diagnostico?.autoavaliacao ?? {};
	const autoavaliar = useRef(aberto.autoavaliar);
	autoavaliar.current = aberto.autoavaliar;
	const avisar = useRef(mostrarErro);
	avisar.current = mostrarErro;
	const salvador = useRef<SalvadorAdiado<Record<string, NivelAutoavaliacao>> | undefined>(undefined);
	salvador.current ??= criarSalvadorAdiado(
		(valor: Record<string, NivelAutoavaliacao>) => autoavaliar.current(valor),
		ATRASO_AUTOAVALIACAO,
		(falha) => avisar.current(mensagemDe(falha)),
	);
	// Saindo do guia: o que falta salvar sai já.
	useEffect(() => () => void salvador.current!.esvaziar(), []);
	const mudarNivel = (id: string, nivel: NivelAutoavaliacao) => {
		const novos = { ...niveis, [id]: nivel };
		setNiveisLocais(novos);
		salvador.current!.mudar(niveisDoCurso(conceitos, novos));
	};
	const marcados = contarMarcados(conceitos, niveis);
	const completa = conceitos.length > 0 && marcados === conceitos.length;

	// --- O que corre em segundo plano, como esta tela vê ---------------------------
	/** Os erros da extensão que você já tentou de novo (pela chave da ação recebida). */
	const [dispensados, setDispensados] = useState<ReadonlySet<string>>(() => new Set());
	const dispensar = (chave: string | undefined) => {
		if (chave) setDispensados((atuais) => new Set(atuais).add(chave));
	};
	const [pedindoGerar, setPedindoGerar] = useState(false);
	const [falhaGerar, setFalhaGerar] = useState<string | undefined>(undefined);
	/** As dissertativas respondidas (ou com a correção pedida de novo) nesta tela. */
	const [pedidasAqui, setPedidasAqui] = useState<ReadonlySet<string>>(() => new Set());
	const pedidaAqui = (questao: string) => setPedidasAqui((atuais) => new Set(atuais).add(questao));
	const [verAutoavaliacao, setVerAutoavaliacao] = useState(false);
	const [perguntarGerar, setPerguntarGerar] = useState(false);
	const [concluindo, setConcluindo] = useState(false);
	useEffect(() => {
		if (!ativo) setVerAutoavaliacao(false);
	}, [ativo]);

	const erroGerar = andamento.erroGerar && !dispensados.has(andamento.erroGerar.chave) ? andamento.erroGerar.mensagem : falhaGerar;
	const erroCorrigir = andamento.erroCorrigir && !dispensados.has(andamento.erroCorrigir.chave) ? andamento.erroCorrigir : undefined;
	const gerando = !concluido && (andamento.gerando || pedindoGerar);

	const gerar = () => {
		setPerguntarGerar(false);
		setVerAutoavaliacao(false);
		setFalhaGerar(undefined);
		setPedidasAqui(new Set());
		dispensar(andamento.erroGerar?.chave);
		setPedindoGerar(true);
		mostrarErro(undefined);
		(async () => {
			await salvador.current!.esvaziar();
			await aberto.gerarDiagnostico();
		})()
			.catch((falha: unknown) => setFalhaGerar(mensagemDe(falha)))
			.finally(() => setPedindoGerar(false));
	};
	const corrigirDeNovo = (questao: string) => {
		dispensar(erroCorrigir?.chave);
		pedidaAqui(questao);
		mostrarErro(undefined);
		aberto.corrigir(questao).catch((falha: unknown) => mostrarErro(mensagemDe(falha)));
	};
	const concluir = () => {
		if (!curso) return;
		setConcluindo(true);
		mostrarErro(undefined);
		aberto
			.concluirDiagnostico()
			.then((resposta) => props.seguir(resposta.curso))
			.catch((falha: unknown) => mostrarErro(mensagemDe(falha)))
			.finally(() => setConcluindo(false));
	};

	if (!curso) return { corpo: null, modal: null };

	const faseDoCurso = faseDoDiagnostico(diagnostico);
	const respondidas = diagnostico ? diagnostico.questoes.filter((questao) => diagnostico.respostas[questao.id] !== undefined).length : 0;
	const fase = gerando ? "questoes" : verAutoavaliacao && faseDoCurso === "questoes" && respondidas === 0 ? "autoavaliacao" : faseDoCurso;
	const podeGerarDeNovo = !concluido && !gerando && fase !== "autoavaliacao";

	const topo = (
		<div className="diag__topo">
			<p className="overline diag__fases" aria-label="Fases do diagnóstico">
				{FASES.map((item, indice) => (
					<span key={item} className={`diag__fase${item === fase ? " diag__fase--atual" : ""}`} aria-current={item === fase ? "step" : undefined}>
						{indice > 0 ? <span className="diag__fase-ponto" aria-hidden="true">·</span> : null}
						{indice + 1} {NOMES_FASE[item]}
					</span>
				))}
			</p>
			{podeGerarDeNovo ? (
				<Button variant="ghost" size="sm" icon="refresh" onClick={() => setPerguntarGerar(true)}>
					Gerar de novo
				</Button>
			) : null}
		</div>
	);

	let corpo: ReactNode;
	let primario: EtapaDiagnostico["primario"];
	let voltar: EtapaDiagnostico["voltar"];

	if (gerando) {
		const quantas = (() => {
			if (!porId.size) return undefined;
			const escolhidos = escolherConceitos(
				conceitos.map((id) => ({ id, prioridade: porId.get(id)?.prioridade ?? "normal" })),
				niveisDoCurso(conceitos, niveis),
				curso.objetivo?.tipo ?? "misto",
			);
			return escolhidos.alternativas.length + escolhidos.dissertativas.length;
		})();
		corpo = (
			<Callout tone="steel" label="Gerando" icon="clock" quote={false}>
				<div className="diag__gerando">
					<AgenteAnimado nome={props.agente?.nome ?? "professor"} {...(props.agente?.avatar ? { avatar: props.agente.avatar } : {})} atividade="pensando" tamanho={48} />
					<p>{quantas ? `O professor está preparando ${quantas} ${quantas === 1 ? "questão" : "questões"}…` : "O professor está preparando as questões…"}</p>
				</div>
			</Callout>
		);
	} else if (fase === "autoavaliacao") {
		corpo = (
			<>
				{erroGerar ? <ErroGerar mensagem={erroGerar} tentar={gerar} /> : null}
				<p className="body guia__texto">
					Para cada conceito, diga quanto você acha que sabe. Não precisa acertar: comparar o que você acha com o que acerta é parte do diagnóstico.
				</p>
				<div className="diag__lista">
					<span className="data guia__selecao-conta">{textoMarcados(marcados, conceitos.length)}</span>
					<ul className="diag__conceitos">
						{conceitos.map((id) => {
							const conceito = porId.get(id);
							return (
								<li key={id} className="diag__conceito">
									<span className="diag__conceito-texto">
										<span className="body-strong">{conceito?.nome ?? id}</span>
										{conceito?.descricao ? (
											<span className="body-sm diag__descricao" title={conceito.descricao}>
												{conceito.descricao}
											</span>
										) : null}
									</span>
									<Teclas<NivelAutoavaliacao>
										rotulo={conceito?.nome ?? id}
										opcoes={NIVEIS.map((nivel) => ({ valor: nivel, texto: NOMES_NIVEL[nivel] }))}
										valor={niveis[id]}
										mudar={(nivel) => mudarNivel(id, nivel)}
									/>
								</li>
							);
						})}
					</ul>
				</div>
			</>
		);
		primario =
			faseDoCurso === "autoavaliacao"
				? { texto: "Gerar as questões", acao: gerar, ...(completa ? {} : { desligado: "Marque um nível em todos os conceitos." }) }
				: { texto: "Continuar", acao: () => setVerAutoavaliacao(false) };
	} else if (fase === "questoes" && diagnostico) {
		const indice = diagnostico.questoes.findIndex((questao) => diagnostico.respostas[questao.id] === undefined);
		const questao = diagnostico.questoes[indice]!;
		corpo = (
			<>
				<QuizProgress className="diag__progresso" total={diagnostico.questoes.length} current={indice + 1} />
				<QuestaoAtual
					key={`${diagnostico.geradoEm ?? ""}|${questao.id}`}
					questao={questao}
					kicker={questao.conceitos.map(nomeDe).join(" · ")}
					responder={async (resposta) => {
						mostrarErro(undefined);
						await aberto.responder({ questao: questao.id, ...resposta });
						if (questao.tipo === "dissertativa") pedidaAqui(questao.id);
					}}
					aoFalhar={(falha) => mostrarErro(mensagemDe(falha))}
				/>
			</>
		);
		if (respondidas === 0) voltar = () => setVerAutoavaliacao(true);
	} else if (diagnostico) {
		const comoEmAndamento = diagnostico as unknown as DiagnosticoEmAndamento;
		const resumo = resumoDoDiagnostico(comoEmAndamento, conceitos);
		const pendentes = faltaCorrigir(comoEmAndamento);
		const erroDe = (id: string) => (erroCorrigir && (!erroCorrigir.questao || erroCorrigir.questao === id) ? erroCorrigir.mensagem : undefined);
		const situacao = (id: string) =>
			situacaoDaCorrecao({
				corrigida: !pendentes.includes(id),
				corrigindo: andamento.corrigindo.includes(id),
				erro: erroDe(id) !== undefined,
				pedidaAqui: pedidasAqui.has(id),
			});
		const falhou = pendentes.some((id) => situacao(id) === "falhou");
		corpo = (
			<ResultadoDiagnostico
				diagnostico={diagnostico}
				resumo={resumo}
				conceitos={conceitos}
				niveis={niveis}
				nomeDe={nomeDe}
				pontos={pontosDasDissertativas(comoEmAndamento)}
				pendentes={pendentes.length}
				situacao={situacao}
				erroDe={erroDe}
				corrigir={corrigirDeNovo}
			/>
		);
		primario = concluido
			? { texto: "Continuar", acao: () => props.seguir(curso) }
			: {
					texto: "Concluir diagnóstico",
					acao: concluir,
					ocupado: concluindo,
					...(pendentes.length > 0
						? { desligado: falhou ? "Corrija de novo a dissertativa sem correção." : "Espere a correção da dissertativa." }
						: {}),
				};
	}

	const modal = (
		<Modal
			open={perguntarGerar}
			onClose={() => setPerguntarGerar(false)}
			kicker={curso.nome}
			title="Gerar outras questões?"
			size="sm"
			tone="brick"
			footer={
				<>
					<Button variant="secondary" onClick={() => setPerguntarGerar(false)}>
						Manter estas
					</Button>
					<Button variant="danger" onClick={gerar}>
						Gerar outras
					</Button>
				</>
			}
		>
			<p className="body">As respostas destas são descartadas (os eventos já gravados ficam).</p>
		</Modal>
	);

	return {
		corpo: (
			<>
				{topo}
				{corpo}
			</>
		),
		...(primario ? { primario } : {}),
		...(voltar ? { voltar } : {}),
		modal,
	};
}

function ErroGerar({ mensagem, tentar }: { mensagem: string; tentar(): void }) {
	return (
		<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
			<p>{mensagem}</p>
			<div className="diag__botoes">
				<Button variant="secondary" size="sm" icon="refresh" onClick={tentar}>
					Tentar de novo
				</Button>
			</div>
		</Callout>
	);
}

/**
 * Um seletor segmentado com radios nativos (as setas andam, Tab entra e sai
 * do grupo), no visual das teclas de papel; a marcada fica âmbar.
 */
function Teclas<V extends number>(props: { rotulo: string; opcoes: Array<{ valor: V; texto: string; tecla?: string }>; valor: V | undefined; mudar(valor: V): void }) {
	const nome = useId();
	return (
		<div role="radiogroup" aria-label={props.rotulo} className="diag__teclas">
			{props.opcoes.map((opcao) => {
				const marcada = props.valor === opcao.valor;
				return (
					<label key={opcao.valor} className={`diag__tecla${marcada ? " diag__tecla--marcada" : ""}`}>
						<input type="radio" className="diag__radio" name={nome} value={opcao.valor} checked={marcada} onChange={() => props.mudar(opcao.valor)} />
						{opcao.tecla ? (
							<span className="diag__tecla-num data" aria-hidden="true">
								{opcao.tecla}
							</span>
						) : null}
						<span className="body-sm diag__tecla-texto">{opcao.texto}</span>
					</label>
				);
			})}
		</div>
	);
}

/**
 * A questão em vista: a confiança primeiro; só com ela marcada, as alternativas
 * (ou o campo) ficam ativas. Com contexto, o contexto vai numa coluna e a
 * pergunta, a confiança, as alternativas e o Responder na outra, nessa ordem
 * (o CSS põe a pergunta do QuizQuestion acima da confiança, estilo.css).
 */
function QuestaoAtual(props: {
	questao: QuestaoNaTela;
	kicker: string;
	responder(resposta: { confianca: Confianca; escolha?: number; texto?: string; tempoMs: number }): Promise<void>;
	aoFalhar(falha: unknown): void;
}) {
	const { questao } = props;
	const mostradaEm = useRef(Date.now());
	const [confianca, setConfianca] = useState<Confianca | undefined>(undefined);
	const [escolha, setEscolha] = useState<number | undefined>(undefined);
	const [texto, setTexto] = useState("");
	const [enviando, setEnviando] = useState(false);
	const ativa = confianca !== undefined && !enviando;
	const enviar = (resposta: { escolha: number } | { texto: string }) => {
		if (confianca === undefined) return;
		setEnviando(true);
		props
			.responder({ confianca, ...resposta, tempoMs: Date.now() - mostradaEm.current })
			.catch(props.aoFalhar)
			.finally(() => setEnviando(false));
	};
	// Com contexto (gravado, ou o enunciado antigo dividido), duas colunas: o contexto e, ao lado, a pergunta, a confiança e as alternativas.
	const partes = partesDaQuestao(questao);
	const enunciado = <Markdown texto={partes.pergunta} emLinha />;
	// Com contexto, o título da questão (os conceitos) vai no alto da coluna do contexto, não em cima da pergunta.
	const kicker = partes.contexto ? undefined : props.kicker;
	const conteudo = (
		<>
			<div className="diag__confianca">
				<p className="body-strong diag__pergunta">Antes de responder: quanto você confia que vai acertar?</p>
				<Teclas<Confianca>
					rotulo="Confiança"
					opcoes={CONFIANCAS.map((valor) => ({ valor, texto: NOMES_CONFIANCA[valor], tecla: String(valor) }))}
					valor={confianca}
					mudar={setConfianca}
				/>
			</div>
			<div className={`diag__resposta${confianca === undefined ? " diag__resposta--apagada" : ""}`} inert={confianca === undefined}>
				{questao.tipo === "alternativa" ? (
					<QuizQuestion
						{...(kicker ? { kicker } : {})}
						prompt={enunciado}
						options={questao.alternativas.map((alternativa, indice) => ({ id: String(indice), label: <Markdown texto={alternativa.texto} emLinha /> }))}
						value={escolha !== undefined ? String(escolha) : null}
						onChange={(valor) => setEscolha(Number(valor))}
						disabled={!ativa}
					>
						<div className="diag__botoes">
							<Button variant="primary" iconRight="arrow-right" disabled={!ativa || escolha === undefined} aria-busy={enviando} onClick={() => escolha !== undefined && enviar({ escolha })}>
								{enviando ? "Enviando…" : "Responder"}
							</Button>
						</div>
					</QuizQuestion>
				) : (
					<EssayAnswer
						{...(kicker ? { kicker } : {})}
						prompt={enunciado}
						value={texto}
						onChange={setTexto}
						minLength={MINIMO_DISSERTATIVA}
						disabled={!ativa}
						submitLabel={enviando ? "Enviando…" : "Enviar resposta"}
						hint="A correção sai no resultado, depois da última questão."
						onSubmit={(valor) => enviar({ texto: valor })}
					/>
				)}
			</div>
		</>
	);
	if (!partes.contexto) return <div className="diag__questao">{conteudo}</div>;
	return (
		<div className="diag__questao diag__questao--contexto">
			<div className="diag__colunas">
				<div className="diag__contexto" role="region" aria-label="Contexto da questão">
					<p className="overline diag__titulo">{props.kicker}</p>
					<div className="diag__contexto-caixa">
						<div className="ap-prose body diag__contexto-dentro">
							<Markdown texto={partes.contexto} />
						</div>
					</div>
				</div>
				<div className="diag__direita">{conteudo}</div>
			</div>
		</div>
	);
}

type Situacao = "corrigida" | "corrigindo" | "falhou";

/** O primeiro ancestral que rola na vertical (o corpo do guia). */
function rolagemDe(elemento: HTMLElement): HTMLElement | undefined {
	for (let pai = elemento.parentElement; pai; pai = pai.parentElement) {
		const { overflowY } = getComputedStyle(pai);
		if (overflowY === "auto" || overflowY === "scroll") return pai;
	}
	return undefined;
}

/**
 * Rola `caixa` (só ela, nenhum ancestral) até `alvo` aparecer inteiro. As
 * medidas da tela vêm com o zoom do body e o scroll anda em px da caixa, por
 * isso a escala.
 */
function trazerParaVista(caixa: HTMLElement, alvo: HTMLElement) {
	const fora = caixa.getBoundingClientRect();
	const dentro = alvo.getBoundingClientRect();
	const escalaY = caixa.offsetHeight ? fora.height / caixa.offsetHeight : 1;
	const escalaX = caixa.offsetWidth ? fora.width / caixa.offsetWidth : 1;
	if (dentro.top < fora.top) caixa.scrollTop -= (fora.top - dentro.top) / escalaY;
	else if (dentro.bottom > fora.bottom) caixa.scrollTop += (dentro.bottom - fora.bottom) / escalaY;
	if (dentro.left < fora.left) caixa.scrollLeft -= (fora.left - dentro.left) / escalaX;
	else if (dentro.right > fora.right) caixa.scrollLeft += (dentro.right - fora.right) / escalaX;
}

/**
 * A fase Resultado em duas colunas: à esquerda, o índice (o placar e, por
 * assunto, as questões; fixo ao rolar o corpo do guia); à direita, uma questão
 * por vez, num cartão na cor do resultado, com "Anterior" e "Próxima" na ordem
 * do índice. Com o contêiner estreito, o índice vira uma faixa de fichas no
 * topo (estilo.css).
 */
function ResultadoDiagnostico(props: {
	diagnostico: DiagnosticoNaTela;
	resumo: ResumoDiagnostico;
	conceitos: readonly string[];
	niveis: Readonly<Record<string, NivelAutoavaliacao>>;
	nomeDe(id: string): string;
	pontos: { total: number; max: number } | undefined;
	/** Quantas dissertativas ainda sem correção. */
	pendentes: number;
	situacao(questao: string): Situacao;
	erroDe(questao: string): string | undefined;
	corrigir(questao: string): void;
}) {
	const { diagnostico, resumo, nomeDe } = props;
	const grupos = gruposPorAssunto(props.conceitos, diagnostico.questoes);
	const ordem = ordemDeNavegacao(grupos);
	const [escolhida, setEscolhida] = useState<EntradaDoResultado | undefined>(undefined);
	const vista = questaoEmVista(grupos, escolhida);
	const questao = vista ? diagnostico.questoes.find((item) => item.id === vista.questao) : undefined;
	const vizinhas = vizinhasNaOrdem(ordem, vista?.questao ?? "");
	const numeroDe = (id: string) => diagnostico.questoes.findIndex((item) => item.id === id) + 1;
	const situacaoDe = (item: QuestaoNaTela): Situacao => (item.tipo === "dissertativa" ? props.situacao(item.id) : "corrigida");
	const resultadoDe = (item: QuestaoNaTela) => resultadoNaTela(item, diagnostico.respostas[item.id], situacaoDe(item));
	const resumoDe = (id: string) => resumo.conceitos.find((item) => item.id === id);
	const placar = textoPlacar(resumo.total, props.pontos);
	const semQuestao = props.conceitos.filter((id) => !grupos.some((grupo) => grupo.conceito === id));

	const raiz = useRef<HTMLDivElement>(null);
	const indice = useRef<HTMLElement>(null);
	const faixa = useRef<HTMLUListElement>(null);
	const coluna = useRef<HTMLDivElement>(null);

	// A altura do índice fixo: a do corpo do guia que rola (o índice rola por dentro quando passa dela).
	const [altura, setAltura] = useState<number | undefined>(undefined);
	useLayoutEffect(() => {
		const rolagem = raiz.current ? rolagemDe(raiz.current) : undefined;
		if (!rolagem) return;
		const medir = () => setAltura(Math.max(0, rolagem.clientHeight - (Number.parseFloat(getComputedStyle(rolagem).paddingBottom) || 0)));
		medir();
		const observador = new ResizeObserver(medir);
		observador.observe(rolagem);
		return () => observador.disconnect();
	}, []);

	// Trocou de questão: a linha dela aparece no índice e o cartão volta para o topo da coluna.
	const chave = vista ? `${vista.conceito}|${vista.questao}` : "";
	const primeira = useRef(true);
	useEffect(() => {
		if (primeira.current) {
			primeira.current = false;
			return;
		}
		const linha = indice.current?.querySelector<HTMLElement>(".diag__linha--aberta");
		if (linha) for (const caixa of [indice.current, faixa.current]) if (caixa) trazerParaVista(caixa, linha);
		const alvo = coluna.current;
		const rolagem = alvo ? rolagemDe(alvo) : undefined;
		if (!alvo || !rolagem) return;
		const topo = rolagem.getBoundingClientRect();
		const doAlvo = alvo.getBoundingClientRect();
		if (doAlvo.top >= topo.top) return;
		const escala = rolagem.offsetHeight ? topo.height / rolagem.offsetHeight : 1;
		const respiro = Number.parseFloat(getComputedStyle(rolagem).paddingTop) || 0;
		rolagem.scrollTo({ top: Math.max(0, rolagem.scrollTop - (topo.top - doAlvo.top) / escala - respiro), behavior: semMovimento() ? "auto" : "smooth" });
	}, [chave]);

	// ↑ ↓ (e ← →, na faixa estreita) trocam de questão com o foco no índice.
	const teclas = (evento: ReactKeyboardEvent<HTMLUListElement>) => {
		const passo = evento.key === "ArrowDown" || evento.key === "ArrowRight" ? 1 : evento.key === "ArrowUp" || evento.key === "ArrowLeft" ? -1 : 0;
		if (!passo) return;
		const linhas = [...evento.currentTarget.querySelectorAll<HTMLButtonElement>("button.diag__linha")];
		const atual = linhas.indexOf(document.activeElement as HTMLButtonElement);
		const proxima = atual >= 0 ? linhas[atual + passo] : undefined;
		if (!proxima) return;
		evento.preventDefault();
		proxima.focus();
		proxima.click();
	};

	const assunto = vista ? resumoDe(vista.conceito) : undefined;
	const nivelDoAssunto = assunto?.nivel ?? null;

	return (
		<div ref={raiz} className="diag__resultado" style={altura !== undefined ? ({ "--diag-indice-altura": `${altura}px` } as CSSProperties) : undefined}>
			<div className="diag__res-grade">
				<nav ref={indice} className="diag__indice" aria-label="Questões do diagnóstico por assunto">
					<div className="diag__placar">
						<p className="overline diag__placar-titulo">Resultado</p>
						{placar.alternativas ? <p className="body-strong">{placar.alternativas}</p> : null}
						{placar.dissertativa ? <p className="body-strong">{placar.dissertativa}</p> : null}
						{props.pendentes > 0 ? <p className="body-sm guia__texto">A nota da dissertativa entra quando a correção chegar.</p> : null}
						{ordem.length > 0 ? (
							<QuizProgress
								className="diag__placar-blocos"
								label="Resultado por questão"
								total={ordem.length}
								current={Math.max(1, vizinhas.posicao)}
								results={ordem.map((entrada) => {
									const item = diagnostico.questoes.find((q) => q.id === entrada.questao);
									return item ? (tomDoResultado(resultadoDe(item)).progresso ?? null) : null;
								})}
							/>
						) : null}
					</div>
					<ul ref={faixa} className="diag__grupos" onKeyDown={teclas}>
						{grupos.map((grupo) => {
							const nivel = resumoDe(grupo.conceito)?.nivel ?? null;
							return (
								<li key={grupo.conceito} className="diag__grupo">
									<div className="diag__grupo-cabeca">
										<span className="body-strong diag__grupo-nome" title={nomeDe(grupo.conceito)}>
											{nomeDe(grupo.conceito)}
										</span>
										{nivel !== null ? (
											<Tag tone="cream" size="sm" className="diag__grupo-nivel">
												{NOMES_NIVEL[nivel]}
											</Tag>
										) : null}
									</div>
									<ul className="diag__linhas">
										{grupo.questoes.map((item) => {
											const resultado = resultadoDe(item);
											const tom = tomDoResultado(resultado);
											const aberta = vista?.conceito === grupo.conceito && vista.questao === item.id;
											return (
												<li key={item.id}>
													<button
														type="button"
														className={`diag__linha${aberta ? " diag__linha--aberta" : ""}`}
														aria-current={aberta ? "true" : undefined}
														onClick={() => setEscolhida({ conceito: grupo.conceito, questao: item.id })}
													>
														<Icon name={tom.icone} size={18} strokeWidth={2.5} className={`diag__icone diag__icone--${resultado}`} />
														<span className="body diag__linha-num">
															<span className="diag__so-largo">Questão </span>
															{pad2(numeroDe(item.id))}
														</span>
														<span className="body-sm diag__linha-tipo">{item.tipo === "alternativa" ? "Alternativa" : "Dissertativa"}</span>
														<span className="ap-visually-hidden">: {tom.palavra}</span>
													</button>
												</li>
											);
										})}
									</ul>
								</li>
							);
						})}
					</ul>
					{semQuestao.length > 0 ? (
						<details className="diag__sem-questao">
							<summary className="body-sm">Sem questão no diagnóstico ({semQuestao.length})</summary>
							<ul>
								{semQuestao.map((id) => (
									<li key={id} className="body-sm">
										{nomeDe(id)} <span className="diag__sem-nivel">· {props.niveis[id] !== undefined ? NOMES_NIVEL[props.niveis[id]!] : "sem nível"}</span>
									</li>
								))}
							</ul>
						</details>
					) : null}
				</nav>
				<div ref={coluna} className="diag__coluna">
					{vista && questao ? (
						<motion.div
							key={chave}
							className="diag__vista"
							initial={semMovimento() ? false : { opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={MOLA_CURTA}
						>
							<header className="diag__assunto">
								<p className="overline diag__assunto-rotulo">Assunto</p>
								<div className="diag__assunto-linha">
									<h3 className="heading diag__assunto-nome">{nomeDe(vista.conceito)}</h3>
									{nivelDoAssunto !== null ? (
										<Tag tone="cream" size="sm">
											Você disse: {NOMES_NIVEL[nivelDoAssunto]}
										</Tag>
									) : null}
								</div>
								{assunto && assunto.questoes.length > 0 ? <p className="body-sm diag__assunto-frase">{assunto.frase}</p> : null}
							</header>
							<CartaoDaQuestao
								numero={numeroDe(questao.id)}
								questao={questao}
								resposta={diagnostico.respostas[questao.id]}
								resultado={resultadoDe(questao)}
								situacao={situacaoDe(questao)}
								{...(props.erroDe(questao.id) !== undefined ? { erro: props.erroDe(questao.id)! } : {})}
								corrigir={() => props.corrigir(questao.id)}
								posicao={vizinhas.posicao}
								total={vizinhas.total}
								{...(vizinhas.anterior ? { anterior: () => setEscolhida(vizinhas.anterior) } : {})}
								{...(vizinhas.proxima ? { proxima: () => setEscolhida(vizinhas.proxima) } : {})}
							/>
						</motion.div>
					) : null}
				</div>
			</div>
		</div>
	);
}

/**
 * A questão aberta no resultado, num cartão na cor do resultado: o cabeçalho
 * (número, tipo, resultado, confiança e nota), o contexto e a pergunta, as
 * alternativas com o gabarito (ou a sua resposta e a correção, na
 * dissertativa), a sua resposta, o porquê do erro e a explicação; no pé,
 * "Anterior" e "Próxima".
 */
function CartaoDaQuestao(props: {
	numero: number;
	questao: QuestaoNaTela;
	resposta: RespostaNaTela | undefined;
	resultado: ResultadoNaTela;
	situacao: Situacao;
	erro?: string;
	corrigir(): void;
	posicao: number;
	total: number;
	anterior?: () => void;
	proxima?: () => void;
}) {
	const { questao, resposta, resultado } = props;
	const tom = tomDoResultado(resultado);
	const partes = partesDaQuestao(questao);
	const enunciado = <Markdown texto={partes.pergunta} emLinha />;
	const contexto = partes.contexto ? (
		<div className="ap-prose body diag__contexto-dentro diag__cartao-contexto">
			<Markdown texto={partes.contexto} />
		</div>
	) : null;
	const correcao = questao.tipo === "dissertativa" ? (resposta as RespostaDissertativa | undefined)?.correcao : undefined;

	let miolo: ReactNode;
	if (questao.tipo === "alternativa") {
		const daAlternativa = resposta as RespostaAlternativa | undefined;
		const correta = questao.alternativas.findIndex((alternativa) => alternativa.correta === true);
		const acertou = daAlternativa?.correta === true;
		const confusao = daAlternativa && !acertou ? (daAlternativa.confusao ?? questao.alternativas[daAlternativa.escolha]?.confusao) : undefined;
		const sua = daAlternativa ? suaRespostaAlternativa(questao.alternativas, daAlternativa.escolha) : undefined;
		miolo = (
			<>
				<div className="diag__secao">
					{contexto}
					<QuizQuestion
						prompt={enunciado}
						options={questao.alternativas.map((alternativa, indice) => ({ id: String(indice), label: <Markdown texto={alternativa.texto} emLinha /> }))}
						value={daAlternativa ? String(daAlternativa.escolha) : null}
						{...(correta >= 0 ? { correctId: String(correta) } : {})}
					/>
				</div>
				{sua ? (
					<div className="diag__secao diag__secao--fio">
						<p className={`body-strong diag__sua-escolha diag__sua-escolha--${resultado}`}>
							{sua.rotulo}
							{sua.texto ? (
								<>
									{" · "}
									<Markdown texto={sua.texto} emLinha />
								</>
							) : null}
						</p>
						{confusao ? (
							<div className="diag__porque">
								<p className="overline diag__secao-rotulo">Por que você pode ter errado</p>
								<p className="body">{fraseDaConfusao(confusao)}</p>
							</div>
						) : null}
					</div>
				) : null}
				{questao.explicacao ? (
					<div className="diag__secao diag__secao--fio">
						<p className="overline diag__secao-rotulo">Explicação</p>
						<div className="ap-prose body">
							<Markdown texto={questao.explicacao} />
						</div>
					</div>
				) : null}
			</>
		);
	} else {
		const daDissertativa = resposta as RespostaDissertativa | undefined;
		miolo = (
			<>
				<div className="diag__secao">
					{contexto}
					<h3 className="ap-quiz__prompt heading">{enunciado}</h3>
				</div>
				{daDissertativa ? (
					<div className="diag__secao diag__secao--fio">
						<StudentNote label="Sua resposta" className="diag__sua-resposta">
							<p className="body">{daDissertativa.texto}</p>
						</StudentNote>
					</div>
				) : null}
				{props.situacao === "falhou" ? (
					<Callout tone="amber" label="Atenção" icon="alert" quote={false}>
						<p>{props.erro ?? "A correção desta dissertativa não chegou."}</p>
						<div className="diag__botoes">
							<Button variant="secondary" size="sm" icon="refresh" onClick={props.corrigir}>
								Corrigir de novo
							</Button>
						</div>
					</Callout>
				) : null}
				{correcao ? (
					<div className="diag__secao diag__secao--fio">
						<QuizFeedback status={statusDaCorrecao(correcao)} score={`${numeroCurto(correcao.total)}/${numeroCurto(correcao.max)}`} criteria={criteriosDoFeedback(correcao)} />
						<ul className="diag__criterios">
							{correcao.criterios.map((item) => (
								<li key={item.criterio} className="diag__criterio">
									<p className="body-strong">
										{item.criterio} <span className="data diag__nota">{numeroCurto(item.pontos)}/{numeroCurto(item.max)}</span>
									</p>
									{item.trechos.length > 0 ? (
										item.trechos.map((trecho, indice) => (
											<blockquote key={indice} className="body diag__trecho">
												{trecho}
											</blockquote>
										))
									) : (
										<p className="body-sm guia__texto">Nenhum trecho da sua resposta para este critério.</p>
									)}
									{item.justificativa ? <p className="body diag__justificativa">{item.justificativa}</p> : null}
								</li>
							))}
						</ul>
					</div>
				) : props.situacao === "corrigindo" ? (
					<p className="body guia__texto">Corrigindo…</p>
				) : null}
			</>
		);
	}

	return (
		<article className={`diag__cartao diag__cartao--${tom.tom}`} aria-label={`Questão ${pad2(props.numero)}: ${tom.palavra}`}>
			<header className="diag__cartao-cabeca">
				<span className="diag__cartao-titulo">
					<Icon name={tom.icone} size={20} strokeWidth={2.5} className={`diag__icone diag__icone--${resultado}`} />
					<span className="overline">
						Questão {pad2(props.numero)} · {questao.tipo === "alternativa" ? "Alternativa" : "Dissertativa"}
					</span>
					<span className={`overline diag__cartao-palavra diag__sua-escolha--${resultado}`}>{tom.palavra}</span>
				</span>
				<span className="diag__cartao-meta">
					{resposta ? <span className="data">Confiança: {NOMES_CONFIANCA[resposta.confianca]}</span> : null}
					{correcao ? (
						<span className="data">
							Nota: {numeroCurto(correcao.total)}/{numeroCurto(correcao.max)}
						</span>
					) : null}
				</span>
			</header>
			{miolo}
			<footer className="diag__cartao-pe">
				<Button variant="ghost" size="sm" icon="arrow-left" disabled={!props.anterior} onClick={props.anterior}>
					Anterior
				</Button>
				<span className="data diag__cartao-posicao">
					{props.posicao} de {props.total} no índice
				</span>
				<Button variant="secondary" size="sm" iconRight="arrow-right" disabled={!props.proxima} onClick={props.proxima}>
					Próxima
				</Button>
			</footer>
		</article>
	);
}
