// As questões do módulo respondidas de verdade (docs/modulos.md, "Responder as
// questões", parte 2 do plano de 2026-10-28), dentro do cartão com o post-it
// do bloco (TelaModulo.tsx, BlocoDaLicao):
// - antes da primeira tentativa, a confiança (de 1 a 4, como no diagnóstico;
//   sem ela, "Responder" fica desligado). O tempo da resposta vai da
//   marcação da confiança (ou do "Tentar de novo" e do "Reescrever a
//   resposta") até o envio;
// - quiz: escolhe e "Responder". A errada da primeira tentativa fica marcada e
//   desligada, com a pista ("Pista: …") e "Tentar de novo"; no acerto, a
//   alternativa fica verde e aparece a explicação; ao fim sem acerto, o
//   gabarito inteiro (a correta, a confusão embaixo de cada errada e a
//   explicação);
// - pergunta: o texto, "Responder", "Conferindo…" e depois a etiqueta (Certa,
//   Em parte, Errada), o retorno e a resposta esperada;
// - dissertativa: o texto, "Responder", "Corrigindo…" e depois o placar, cada
//   critério com a marca, os pontos e a justificativa, "Reescrever a resposta"
//   (uma vez, com o texto anterior) e "Ver a resposta-modelo" (encerra). Depois
//   da reescrita, a primeira versão fica recolhida em "Primeira versão";
//   encerrada, a rubrica inteira e a resposta-modelo;
// - "Não sei" só quando a questão ainda aceita (situacaoDaQuestao.aceitaNaoSei);
// - uma tentativa sem conferência e sem nada conferindo (a conferência falhou,
//   ou a sessão acabou no meio dela): a mensagem, ou "A conferência não
//   terminou.", com "Tentar de novo" (corrigir).
// Enquanto um pedido da questão está em andamento, os botões dela ficam
// desligados. As respostas vêm do módulo (respostaDoBloco); as ações, da
// ponte "modulos" (modulos-ponte.ts, useModulos).

import { Button, Callout, QuizQuestion, StudentNote, Tag, TextArea } from "@estudos/design-system";
import { Markdown, semMovimento } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import type { Correcao } from "../../lib/diagnostico-tipos.ts";
import {
	type BlocoQuestao,
	type Confianca,
	type EntradaResponder,
	marcaDoCriterio,
	oQueMostrar,
	placarDaDissertativa,
	type RespostaModulo,
	type SituacaoQuestao,
	situacaoDaQuestao,
} from "../../lib/modulo-respostas-tipos.ts";
import type { BlocoAlternativa, BlocoDissertativa, BlocoVerificacao } from "../../lib/modulo-tipos.ts";
import { numeroCurto, partesDaQuestao } from "./diagnostico-tela.ts";
import { fraseDaConfusao } from "./modulo-tela.ts";
import type { ErroVistoModulo } from "./modulos-ponte.ts";
import { conferenciaDaQuestao, etiquetaDaAvaliacao, etiquetaDaMarca, fraseDaPista, textoConferindo, textoDoPlacar, vistaDoQuiz } from "./questao-modulo-tela.ts";
import { ConfiancaAntes } from "./Teclas.tsx";

const MOLA = { type: "spring", stiffness: 380, damping: 32 } as const;

const mensagemDe = (falha: unknown) => (falha instanceof Error ? falha.message : String(falha));

/** O que as questões da lição recebem da ponte (TelaModulo.tsx). */
export interface AcoesQuestoes {
	/** Os blocos cuja resposta está sendo conferida pelo modelo agora (o corrigindo do último "modulo"). */
	corrigindo: readonly string[];
	/** Os erros da conferência, pelo id do bloco (errosDasQuestoes). */
	erros: Readonly<Record<string, ErroVistoModulo>>;
	/** Uma tentativa ou "Não sei"; resolve com o "modulo" com a resposta. */
	responder(bloco: string, entrada: EntradaResponder): Promise<unknown>;
	/** Tenta de novo a conferência que falhou. */
	corrigir(bloco: string): Promise<unknown>;
	/** "Ver a resposta-modelo". */
	encerrar(bloco: string): Promise<unknown>;
}

type Pedido = "responder" | "nao_sei" | "corrigir" | "encerrar";

/**
 * Uma questão do módulo, pela resposta que vale (respostaDoBloco). Sem
 * `acoes` (sem ponte), os botões ficam desligados. Quem monta dá a key pela
 * versão do bloco: um bloco reescrito começa do zero.
 */
export function QuestaoModulo(props: { bloco: BlocoQuestao; resposta: RespostaModulo | undefined; acoes?: AcoesQuestoes }) {
	const { bloco, resposta, acoes } = props;
	const situacao = situacaoDaQuestao(bloco, resposta);
	const [confiancaTela, setConfiancaTela] = useState<Confianca | undefined>(undefined);
	const confianca = situacao.confianca ?? confiancaTela;
	const marcadaEm = useRef<number | undefined>(undefined);
	const [pedido, setPedido] = useState<Pedido | undefined>(undefined);
	const [erro, setErro] = useState<{ ao: Pedido; mensagem: string } | undefined>(undefined);
	const ocupado = pedido !== undefined;
	const semPonte = !acoes;

	const marcarConfianca = (valor: Confianca) => {
		marcadaEm.current ??= Date.now();
		setConfiancaTela(valor);
	};
	const recomecarTempo = () => {
		marcadaEm.current = Date.now();
	};
	const pedir = (qual: Pedido, acao: () => Promise<unknown>) => {
		if (ocupado || !acoes) return;
		setPedido(qual);
		setErro(undefined);
		acao()
			.catch((falha: unknown) => setErro({ ao: qual, mensagem: mensagemDe(falha) }))
			.finally(() => setPedido(undefined));
	};
	const responder = (resposta: { escolha: number } | { texto: string }) =>
		pedir("responder", () =>
			acoes!.responder(bloco.id, { ...(situacao.confianca === null && confianca !== undefined ? { confianca } : {}), ...resposta, tempoMs: Date.now() - (marcadaEm.current ?? Date.now()) }),
		);
	const naoSei = () => pedir("nao_sei", () => acoes!.responder(bloco.id, { naoSei: true }));
	const corrigir = () => pedir("corrigir", () => acoes!.corrigir(bloco.id));
	const encerrar = () => pedir("encerrar", () => acoes!.encerrar(bloco.id));

	// A conferência da tentativa que espera o modelo; o erro do corrigir desta tela vale antes do da ponte.
	const corrigindo = acoes?.corrigindo.includes(bloco.id) === true || pedido === "corrigir";
	const conferencia = conferenciaDaQuestao(situacao, corrigindo, erro?.ao === "corrigir" ? erro.mensagem : acoes?.erros[bloco.id]?.mensagem);
	const erroSolto = erro && !(erro.ao === "corrigir" && conferencia) ? erro.mensagem : undefined;

	const comum: PropsComum = {
		situacao,
		confianca,
		marcarConfianca,
		recomecarTempo,
		pedido,
		desligado: ocupado || semPonte,
		naoSei,
		corrigir,
		conferencia,
	};
	let corpo: ReactNode;
	if (bloco.tipo === "alternativa") corpo = <Quiz bloco={bloco} resposta={resposta} comum={comum} responder={(escolha) => responder({ escolha })} />;
	else if (bloco.tipo === "verificacao") corpo = <Pergunta bloco={bloco} resposta={resposta} comum={comum} responder={(texto) => responder({ texto })} />;
	else corpo = <Dissertativa bloco={bloco} resposta={resposta} comum={comum} responder={(texto) => responder({ texto })} encerrar={encerrar} />;

	return (
		<>
			{corpo}
			{erroSolto ? (
				<Callout className="modulo__questao-erro" tone="amber" label="Não deu certo" icon="alert" quote={false}>
					<p>{erroSolto}</p>
				</Callout>
			) : null}
		</>
	);
}

/** O que os três tipos recebem da QuestaoModulo. */
interface PropsComum {
	situacao: SituacaoQuestao;
	/** A confiança gravada, ou a marcada na tela. */
	confianca: Confianca | undefined;
	marcarConfianca(valor: Confianca): void;
	/** O "Tentar de novo" e o "Reescrever a resposta" recomeçam a contar o tempo. */
	recomecarTempo(): void;
	/** O pedido em andamento. */
	pedido: Pedido | undefined;
	/** Um pedido em andamento, ou sem ponte: os botões ficam desligados. */
	desligado: boolean;
	naoSei(): void;
	corrigir(): void;
	conferencia: ReturnType<typeof conferenciaDaQuestao>;
}

/** O "Não sei" (só quando a questão aceita) e o primário, à direita. */
function Botoes(props: { comum: PropsComum; children?: ReactNode }) {
	const { comum } = props;
	return (
		<div className="diag__botoes modulo__questao-botoes">
			{comum.situacao.aceitaNaoSei ? (
				<Button variant="ghost" onClick={comum.naoSei} disabled={comum.desligado} aria-busy={comum.pedido === "nao_sei"}>
					{comum.pedido === "nao_sei" ? "Enviando…" : "Não sei"}
				</Button>
			) : null}
			{props.children}
		</div>
	);
}

/** O "Responder" (desligado sem a confiança, sem a resposta ou com um pedido em andamento). */
function BotaoResponder(props: { comum: PropsComum; pronto: boolean; responder(): void }) {
	const { comum } = props;
	const enviando = comum.pedido === "responder";
	return (
		<Button variant="primary" iconRight="arrow-right" disabled={comum.desligado || !props.pronto || comum.confianca === undefined} aria-busy={enviando} onClick={props.responder}>
			{enviando ? "Enviando…" : "Responder"}
		</Button>
	);
}

/** A etiqueta de quem marcou "Não sei". */
function MarcouNaoSei() {
	return (
		<Tag className="modulo__nao-sei" tone="neutral" size="sm" icon="help">
			Não sei
		</Tag>
	);
}

/** O que aparece depois de responder, embaixo de um fio, com uma entrada curta. */
function Depois(props: { children: ReactNode }) {
	return (
		<motion.div className="modulo__revelado" initial={semMovimento() ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={MOLA}>
			{props.children}
		</motion.div>
	);
}

/** A conferência da tentativa que espera o modelo: "Conferindo…" (ou "Corrigindo…"), ou a falha com "Tentar de novo". */
function Conferencia(props: { tipo: BlocoQuestao["tipo"]; comum: PropsComum }) {
	const { conferencia, pedido, desligado } = props.comum;
	if (!conferencia) return null;
	if (conferencia.tipo === "conferindo") {
		return (
			<p className="body modulo__conferindo" role="status">
				{textoConferindo(props.tipo)}
			</p>
		);
	}
	return (
		<Callout className="modulo__questao-erro" tone="amber" label="Atenção" icon="alert" quote={false}>
			<p>{conferencia.mensagem}</p>
			<div className="diag__botoes">
				<Button variant="secondary" size="sm" icon="refresh" onClick={props.comum.corrigir} disabled={desligado} aria-busy={pedido === "corrigir"}>
					Tentar de novo
				</Button>
			</div>
		</Callout>
	);
}

/** A resposta escrita do Breno, no papel do StudentNote. */
function SuaResposta({ texto, rotulo = "Sua resposta" }: { texto: string; rotulo?: string }) {
	return (
		<StudentNote label={rotulo} className="diag__sua-resposta">
			<p className="body">{texto}</p>
		</StudentNote>
	);
}

// --- O quiz ---------------------------------------------------------------------------

function Quiz(props: { bloco: BlocoAlternativa; resposta: RespostaModulo | undefined; comum: PropsComum; responder(escolha: number): void }) {
	const { bloco, resposta, comum } = props;
	const { situacao } = comum;
	const [escolha, setEscolha] = useState<number | undefined>(undefined);
	const [tentandoDeNovo, setTentandoDeNovo] = useState(false);
	const partes = partesDaQuestao(bloco);
	const primeira = situacao.aceitaResposta && situacao.tentativa === 1;
	// "Tentar de novo" só vale enquanto a segunda tentativa está livre.
	const segunda = situacao.aceitaResposta && situacao.tentativa === 2;
	const escolhendo = primeira || (segunda && tentandoDeNovo);
	const ativa = escolhendo && comum.confianca !== undefined && !comum.desligado;
	const vista = vistaDoQuiz(bloco, resposta, escolhendo ? escolha : undefined);
	const mostrar = oQueMostrar(bloco, resposta);
	const pista = fraseDaPista(mostrar.pista);
	const livre = escolha !== undefined && !situacao.escolhas.includes(escolha);

	return (
		<div className="modulo__questao modulo__questao--quiz">
			<Contexto texto={partes.contexto} />
			{primeira ? (
				<ConfiancaAntes className="modulo__confianca" valor={comum.confianca} mudar={comum.marcarConfianca} desligado={comum.desligado} />
			) : null}
			<div className={primeira && comum.confianca === undefined ? "diag__resposta--apagada modulo__alternativas" : "modulo__alternativas"}>
				<QuizQuestion
					interactiveLabels
					prompt={<Markdown texto={partes.pergunta} emLinha />}
					value={vista.valor}
					onChange={(id) => {
						const indice = Number(id);
						if (!situacao.escolhas.includes(indice)) setEscolha(indice);
					}}
					disabled={!ativa}
					{...(vista.correta !== undefined ? { correctId: vista.correta } : {})}
					options={bloco.alternativas.map((alternativa, indice) => {
						const errada = vista.erradas.includes(indice);
						const confusao = vista.confusoes && alternativa.correta !== true ? fraseDaConfusao(alternativa.confusao) : "";
						return {
							id: String(indice),
							label: (
								<>
									<span className="modulo__alt-texto">
										<Markdown texto={alternativa.texto} emLinha />
									</span>
									{confusao ? <span className="body-sm modulo__confusao">{confusao}</span> : null}
									{errada ? (
										<Tag className="modulo__alt-errada" tone="brick" size="sm" icon="close">
											Errada
										</Tag>
									) : null}
								</>
							),
						};
					})}
				/>
			</div>
			{pista ? (
				<Callout className="modulo__pista" tone="amber" label="Pista" icon="bulb" quote={false}>
					<p className="body-sm">{pista}</p>
				</Callout>
			) : null}
			{situacao.aceitaResposta ? (
				<Botoes comum={comum}>
					{escolhendo ? (
						<BotaoResponder comum={comum} pronto={livre} responder={() => livre && props.responder(escolha!)} />
					) : (
						<Button
							variant="primary"
							icon="refresh"
							disabled={comum.desligado}
							onClick={() => {
								setEscolha(undefined);
								setTentandoDeNovo(true);
								comum.recomecarTempo();
							}}
						>
							Tentar de novo
						</Button>
					)}
				</Botoes>
			) : null}
			{situacao.encerrada ? (
				<Depois>
					{resposta?.naoSei ? <MarcouNaoSei /> : null}
					{mostrar.explicacao && bloco.explicacao ? (
						<div className="modulo__gabarito">
							<p className="overline modulo__gabarito-rotulo">Explicação</p>
							<Markdown texto={bloco.explicacao} />
						</div>
					) : null}
				</Depois>
			) : null}
		</div>
	);
}

// --- A pergunta -----------------------------------------------------------------------

function Pergunta(props: { bloco: BlocoVerificacao; resposta: RespostaModulo | undefined; comum: PropsComum; responder(texto: string): void }) {
	const { bloco, resposta, comum } = props;
	const { situacao } = comum;
	const [texto, setTexto] = useState("");
	const tentativa = resposta?.tipo === "verificacao" ? resposta.tentativas[0] : undefined;
	const avaliacao = tentativa?.avaliacao;
	const etiqueta = avaliacao ? etiquetaDaAvaliacao(avaliacao) : undefined;

	return (
		<div className="modulo__questao">
			<div className="modulo__pergunta">
				<Markdown texto={bloco.pergunta} />
			</div>
			{situacao.aceitaResposta ? (
				<CampoDaResposta comum={comum} confiancaAntes texto={texto} mudar={setTexto} responder={() => props.responder(texto)} />
			) : (
				<Depois>
					{resposta?.naoSei ? <MarcouNaoSei /> : null}
					{tentativa ? <SuaResposta texto={tentativa.texto} /> : null}
					<Conferencia tipo="verificacao" comum={comum} />
					{etiqueta ? (
						<div className="modulo__avaliacao">
							<Tag tone={etiqueta.tom} size="sm" icon={etiqueta.icone}>
								{etiqueta.texto}
							</Tag>
							{tentativa?.retorno ? <p className="body modulo__retorno">{tentativa.retorno}</p> : null}
						</div>
					) : null}
					{situacao.encerrada ? <RespostaEsperada bloco={bloco} /> : null}
				</Depois>
			)}
		</div>
	);
}

/**
 * O campo da resposta escrita (pergunta e dissertativa): a confiança antes
 * (na primeira tentativa; o campo fica apagado até ela), o TextArea e os
 * botões. Na reescrita, sem a confiança e com "Cancelar".
 */
function CampoDaResposta(props: { comum: PropsComum; confiancaAntes: boolean; texto: string; mudar(texto: string): void; responder(): void; cancelar?: () => void }) {
	const { comum } = props;
	const apagado = props.confiancaAntes && comum.confianca === undefined;
	return (
		<>
			{props.confiancaAntes ? <ConfiancaAntes className="modulo__confianca" valor={comum.confianca} mudar={comum.marcarConfianca} desligado={comum.desligado} /> : null}
			<div className={apagado ? "diag__resposta--apagada modulo__campo" : "modulo__campo"} inert={apagado}>
				<TextArea label="Sua resposta" rows={props.confiancaAntes ? 4 : 6} value={props.texto} onChange={(evento) => props.mudar(evento.target.value)} disabled={apagado || comum.desligado} />
			</div>
			<Botoes comum={comum}>
				{props.cancelar ? (
					<Button variant="ghost" onClick={props.cancelar} disabled={comum.desligado}>
						Cancelar
					</Button>
				) : null}
				<BotaoResponder comum={comum} pronto={props.texto.trim() !== ""} responder={props.responder} />
			</Botoes>
		</>
	);
}

// --- A dissertativa ------------------------------------------------------------------

function Dissertativa(props: { bloco: BlocoDissertativa; resposta: RespostaModulo | undefined; comum: PropsComum; responder(texto: string): void; encerrar(): void }) {
	const { bloco, resposta, comum } = props;
	const { situacao } = comum;
	const tentativas = resposta?.tipo === "dissertativa" ? resposta.tentativas : [];
	const [texto, setTexto] = useState("");
	const [reescrevendo, setReescrevendo] = useState(false);
	const [vendoPrimeira, setVendoPrimeira] = useState(false);
	// A reescrita só vale enquanto a segunda tentativa está livre.
	const reescrita = reescrevendo && situacao.aceitaResposta && situacao.tentativa === 2;
	const primeira = tentativas[0];
	const ultima = tentativas.at(-1);
	const mostrar = oQueMostrar(bloco, resposta);

	let corpo: ReactNode;
	if (situacao.aceitaResposta && situacao.tentativa === 1) {
		corpo = <CampoDaResposta comum={comum} confiancaAntes texto={texto} mudar={setTexto} responder={() => props.responder(texto)} />;
	} else {
		corpo = (
			<Depois>
				{resposta?.naoSei ? <MarcouNaoSei /> : null}
				{tentativas.length > 1 && primeira ? (
					<div className="modulo__primeira">
						<Button variant="ghost" size="sm" icon={vendoPrimeira ? "chevron-down" : "chevron-right"} aria-expanded={vendoPrimeira} onClick={() => setVendoPrimeira(!vendoPrimeira)}>
							Primeira versão
						</Button>
						<AnimatePresence initial={false}>
							{vendoPrimeira ? (
								<motion.div
									key="primeira"
									className="modulo__primeira-corpo"
									initial={semMovimento() ? false : { height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={semMovimento() ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
									transition={semMovimento() ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
								>
									<SuaResposta texto={primeira.texto} />
									{primeira.correcao ? <CorrecaoDaDissertativa correcao={primeira.correcao} /> : null}
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
				) : null}
				{ultima ? <SuaResposta texto={ultima.texto} rotulo={tentativas.length > 1 ? "Resposta reescrita" : "Sua resposta"} /> : null}
				<Conferencia tipo="dissertativa" comum={comum} />
				{ultima?.correcao ? <CorrecaoDaDissertativa correcao={ultima.correcao} /> : null}
				{reescrita ? (
					<CampoDaResposta comum={comum} confiancaAntes={false} texto={texto} mudar={setTexto} responder={() => props.responder(texto)} cancelar={() => setReescrevendo(false)} />
				) : situacao.aceitaResposta || situacao.aceitaEncerrar ? (
					<div className="diag__botoes modulo__questao-botoes">
						{situacao.aceitaResposta && situacao.tentativa === 2 ? (
							<Button
								variant="secondary"
								icon="refresh"
								disabled={comum.desligado}
								onClick={() => {
									setTexto(ultima?.texto ?? "");
									setReescrevendo(true);
									comum.recomecarTempo();
								}}
							>
								Reescrever a resposta
							</Button>
						) : null}
						{situacao.aceitaEncerrar ? (
							<Button variant="primary" icon="book" disabled={comum.desligado} aria-busy={comum.pedido === "encerrar"} onClick={props.encerrar}>
								{comum.pedido === "encerrar" ? "Abrindo…" : "Ver a resposta-modelo"}
							</Button>
						) : null}
					</div>
				) : null}
				{mostrar.gabarito ? <RubricaEResposta bloco={bloco} /> : null}
			</Depois>
		);
	}
	return (
		<div className="modulo__questao">
			<EnunciadoDissertativa bloco={bloco} />
			{corpo}
		</div>
	);
}

/** O placar e cada critério da correção: o nome, a marca (coberto, em parte, faltou), os pontos e a justificativa. */
function CorrecaoDaDissertativa({ correcao }: { correcao: Correcao }) {
	const placar = placarDaDissertativa(correcao);
	return (
		<div className="modulo__correcao">
			<p className="body-strong modulo__placar-texto">{textoDoPlacar(placar)}</p>
			<ul className="diag__criterios modulo__criterios">
				{correcao.criterios.map((item, indice) => {
					const etiqueta = etiquetaDaMarca(placar.marcas[indice] ?? marcaDoCriterio(item));
					return (
						<li key={`${indice}-${item.criterio}`} className="diag__criterio">
							<p className="body-strong modulo__criterio-linha">
								<span className="modulo__criterio-nome">{item.criterio}</span>
								<Tag tone={etiqueta.tom} size="sm" icon={etiqueta.icone}>
									{etiqueta.texto}
								</Tag>
								<span className="data diag__nota">
									{numeroCurto(item.pontos)}/{numeroCurto(item.max)}
								</span>
							</p>
							{item.justificativa ? <p className="body diag__justificativa">{item.justificativa}</p> : null}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

// --- Só para ler (a versão anterior de um bloco reescrito) ------------------------------

/** O contexto de uma questão (o cenário, em markdown), quando ela tem. */
function Contexto({ texto }: { texto: string | undefined }) {
	if (!texto) return null;
	return (
		<div className="modulo__contexto">
			<Markdown texto={texto} />
		</div>
	);
}

/** O enunciado da dissertativa (o contexto e a pergunta). */
function EnunciadoDissertativa({ bloco }: { bloco: Pick<BlocoDissertativa, "enunciado" | "contexto"> }) {
	const partes = partesDaQuestao(bloco);
	return (
		<>
			<Contexto texto={partes.contexto} />
			<h3 className="ap-quiz__prompt heading">
				<Markdown texto={partes.pergunta} emLinha />
			</h3>
		</>
	);
}

/** Uma questão só para ler, sem resposta e sem gabarito (a versão anterior de um bloco reescrito). */
export function QuestaoParaLer({ bloco }: { bloco: Omit<BlocoVerificacao, "anteriores"> | Omit<BlocoAlternativa, "anteriores"> | Omit<BlocoDissertativa, "anteriores"> }) {
	if (bloco.tipo === "verificacao") return <Markdown texto={bloco.pergunta} />;
	if (bloco.tipo === "dissertativa") {
		return (
			<div className="modulo__questao">
				<EnunciadoDissertativa bloco={bloco} />
			</div>
		);
	}
	const partes = partesDaQuestao(bloco);
	return (
		<div className="modulo__questao">
			<Contexto texto={partes.contexto} />
			<QuizQuestion
				interactiveLabels
				prompt={<Markdown texto={partes.pergunta} emLinha />}
				value={null}
				disabled
				options={bloco.alternativas.map((alternativa, indice) => ({ id: String(indice), label: (
					<span className="modulo__alt-texto">
						<Markdown texto={alternativa.texto} emLinha />
					</span>
				) }))}
			/>
		</div>
	);
}

/** A resposta esperada da pergunta, num bloco recuado. */
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
