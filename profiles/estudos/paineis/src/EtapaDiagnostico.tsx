// A etapa Diagnóstico do guia de curso (item 5, parte B, docs/cursos.md,
// "Parte B: o diagnóstico"), em três fases na mesma etapa: autoavaliação (um
// nível por conceito, salvo sozinho), questões (uma por vez, a confiança antes
// de responder, sem gabarito) e resultado (o placar, por conceito o que você
// disse e as questões com o gabarito e a correção). A fase vem do curso
// (faseDoDiagnostico); gerar as questões e corrigir a dissertativa correm em
// segundo plano na extensão dos cursos (cursos-ponte.ts).
//
// useEtapaDiagnostico devolve o corpo, o primário e o "Voltar" do rodapé do
// guia (TelaGuiaCurso.tsx), e o modal de "Gerar de novo".

import { Button, Callout, EssayAnswer, Icon, Modal, pad2, QuizFeedback, QuizProgress, QuizQuestion, StudentNote, Tag } from "@estudos/design-system";
import { AgenteAnimado, type DadosAvatarAgente, Markdown, semMovimento } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
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
	resumoDoDiagnostico,
} from "../../lib/diagnostico-tipos.ts";
import type { Conceito } from "../../lib/mapa-tipos.ts";
import type { CursoAberto } from "./cursos-ponte.ts";
import {
	contarMarcados,
	criarSalvadorAdiado,
	criteriosDoFeedback,
	FASES,
	faseDoDiagnostico,
	fraseDaConfusao,
	niveisDoCurso,
	NOMES_FASE,
	numeroCurto,
	partesDaQuestao,
	type SalvadorAdiado,
	situacaoDaCorrecao,
	statusDaCorrecao,
	textoMarcados,
	pontosDasDissertativas,
	textoPlacar,
} from "./diagnostico-tela.ts";
import type { MapaDaMateria } from "./mapa-ponte.ts";

const MOLA = { type: "spring", stiffness: 420, damping: 38 } as const;
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
		const placar = textoPlacar(resumo.total, pontosDasDissertativas(comoEmAndamento));
		const pendentes = faltaCorrigir(comoEmAndamento);
		const situacao = (id: string) =>
			situacaoDaCorrecao({
				corrigida: !pendentes.includes(id),
				corrigindo: andamento.corrigindo.includes(id),
				erro: Boolean(erroCorrigir && (!erroCorrigir.questao || erroCorrigir.questao === id)),
				pedidaAqui: pedidasAqui.has(id),
			});
		const falhou = pendentes.some((id) => situacao(id) === "falhou");
		const semQuestao = conceitos.filter((id) => !diagnostico.questoes.some((questao) => questao.conceitos.includes(id)));
		corpo = (
			<>
				<div className="diag__placar">
					{placar.alternativas ? <p className="heading diag__placar-linha">{placar.alternativas}</p> : null}
					{placar.dissertativa ? <p className="heading diag__placar-linha">{placar.dissertativa}</p> : null}
					{pendentes.length > 0 ? <p className="body-sm guia__texto">A nota da dissertativa entra quando a correção chegar.</p> : null}
				</div>
				<ul className="diag__blocos">
					{resumo.conceitos.map((item) => {
						const questoes = diagnostico.questoes.filter((questao) => questao.conceitos.includes(item.id));
						if (questoes.length === 0) return null;
						return (
							<li key={item.id} className="diag__bloco">
								<div className="diag__bloco-cabeca">
									<span className="body-strong">{nomeDe(item.id)}</span>
									{item.nivel !== null ? (
										<Tag tone="cream" size="sm">
											{NOMES_NIVEL[item.nivel]}
										</Tag>
									) : null}
								</div>
								{item.questoes.length > 0 ? <p className="body-sm guia__texto">{item.frase}</p> : null}
								<ul className="diag__questoes">
									{questoes.map((questao) => (
										<QuestaoResultado
											key={questao.id}
											numero={diagnostico.questoes.indexOf(questao) + 1}
											questao={questao}
											resposta={diagnostico.respostas[questao.id]}
											situacao={questao.tipo === "dissertativa" ? situacao(questao.id) : "corrigida"}
											{...(erroCorrigir && (!erroCorrigir.questao || erroCorrigir.questao === questao.id) ? { erro: erroCorrigir.mensagem } : {})}
											corrigir={() => corrigirDeNovo(questao.id)}
										/>
									))}
								</ul>
							</li>
						);
					})}
				</ul>
				{semQuestao.length > 0 ? (
					<p className="body-sm guia__texto">
						Sem questão no diagnóstico:{" "}
						{semQuestao.map((id) => `${nomeDe(id)} (${niveis[id] !== undefined ? NOMES_NIVEL[niveis[id]!] : "sem nível"})`).join(", ")}.
					</p>
				) : null}
			</>
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

/** Uma questão no resultado: a linha com o resultado e, aberta, o enunciado com o gabarito e a correção. */
function QuestaoResultado(props: {
	numero: number;
	questao: QuestaoNaTela;
	resposta: RespostaNaTela | undefined;
	situacao: "corrigida" | "corrigindo" | "falhou";
	erro?: string;
	corrigir(): void;
}) {
	const { questao, resposta } = props;
	const [aberta, setAberta] = useState(false);
	const dobra = useId();
	const partes = partesDaQuestao(questao);
	const enunciado = <Markdown texto={partes.pergunta} emLinha />;
	// O contexto, quando há, vem acima da pergunta, numa coluna só.
	const contexto = partes.contexto ? (
		<div className="ap-prose body diag__contexto-dentro">
			<Markdown texto={partes.contexto} />
		</div>
	) : null;

	let etiqueta: ReactNode = null;
	let conteudo: ReactNode = null;
	if (questao.tipo === "alternativa") {
		const daAlternativa = resposta as RespostaAlternativa | undefined;
		const correta = questao.alternativas.findIndex((alternativa) => alternativa.correta === true);
		const acertou = daAlternativa?.correta === true;
		const confusao = daAlternativa && !acertou ? (daAlternativa.confusao ?? questao.alternativas[daAlternativa.escolha]?.confusao) : undefined;
		etiqueta = acertou ? (
			<Tag tone="sage" size="sm" icon="check">
				Correta
			</Tag>
		) : (
			<Tag tone="brick" size="sm" icon="close">
				Ainda não
			</Tag>
		);
		conteudo = (
			<>
				{contexto}
				<QuizQuestion
					prompt={enunciado}
					options={questao.alternativas.map((alternativa, indice) => ({ id: String(indice), label: <Markdown texto={alternativa.texto} emLinha /> }))}
					value={daAlternativa ? String(daAlternativa.escolha) : null}
					{...(correta >= 0 ? { correctId: String(correta) } : {})}
				>
					<QuizFeedback status={acertou ? "correct" : "incorrect"}>
						{confusao ? <p>{fraseDaConfusao(confusao)}</p> : null}
						{questao.explicacao ? <Markdown texto={questao.explicacao} /> : null}
					</QuizFeedback>
				</QuizQuestion>
			</>
		);
	} else {
		const daDissertativa = resposta as RespostaDissertativa | undefined;
		const correcao = daDissertativa?.correcao;
		if (correcao) {
			const status = statusDaCorrecao(correcao);
			etiqueta = (
				<>
					<Tag tone={status === "correct" ? "sage" : status === "incorrect" ? "brick" : "cream"} size="sm" icon={status === "correct" ? "check" : status === "incorrect" ? "close" : "refresh"}>
						{status === "correct" ? "Correta" : status === "incorrect" ? "Ainda não" : "Quase lá"}
					</Tag>
					<span className="data diag__nota">
						{numeroCurto(correcao.total)}/{numeroCurto(correcao.max)}
					</span>
				</>
			);
		} else {
			etiqueta =
				props.situacao === "corrigindo" ? (
					<Tag tone="amber" size="sm" icon="clock">
						Corrigindo
					</Tag>
				) : (
					<Tag tone="brick" size="sm" icon="alert">
						Sem correção
					</Tag>
				);
		}
		conteudo = (
			<div className="diag__dissertativa">
				{contexto}
				<h3 className="ap-quiz__prompt heading">{enunciado}</h3>
				{daDissertativa ? (
					<StudentNote label="Sua resposta" className="diag__sua-resposta">
						<p className="body">{daDissertativa.texto}</p>
					</StudentNote>
				) : null}
				{correcao ? (
					<>
						<QuizFeedback
							status={statusDaCorrecao(correcao)}
							score={`${numeroCurto(correcao.total)}/${numeroCurto(correcao.max)}`}
							criteria={criteriosDoFeedback(correcao)}
						/>
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
					</>
				) : props.situacao === "corrigindo" ? (
					<p className="body guia__texto">Corrigindo…</p>
				) : null}
			</div>
		);
	}

	return (
		<li className="diag__item">
			<button type="button" className="diag__item-cabeca" aria-expanded={aberta} {...(aberta ? { "aria-controls": dobra } : {})} onClick={() => setAberta((valor) => !valor)}>
				<span className="overline">
					Questão {pad2(props.numero)} · {questao.tipo === "alternativa" ? "Alternativa" : "Dissertativa"}
				</span>
				<span className="diag__item-meta">
					{etiqueta}
					{resposta ? <span className="data diag__confianca-dita">Confiança: {NOMES_CONFIANCA[resposta.confianca]}</span> : null}
				</span>
				<motion.span className="mapa__seta" animate={{ rotate: aberta ? 90 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
					<Icon name="chevron-right" size={16} strokeWidth={2.5} />
				</motion.span>
			</button>
			{questao.tipo === "dissertativa" && props.situacao === "falhou" ? (
				<Callout tone="amber" label="Atenção" icon="alert" quote={false}>
					<p>{props.erro ?? "A correção desta dissertativa não chegou."}</p>
					<div className="diag__botoes">
						<Button variant="secondary" size="sm" icon="refresh" onClick={props.corrigir}>
							Corrigir de novo
						</Button>
					</div>
				</Callout>
			) : null}
			<AnimatePresence initial={false}>
				{aberta ? (
					<motion.div
						key="dobra"
						id={dobra}
						className="diag__dobra"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={semMovimento() ? { duration: 0 } : MOLA}
					>
						<div className="diag__dobra-dentro">{conteudo}</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</li>
	);
}
