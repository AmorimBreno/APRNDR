// Painel "quiz" do perfil de estudos: a tela da ferramenta quiz web
// (profiles/estudos/extensions/quiz-web.ts), mostrada no modal do pedido. O
// pedido "perguntar" vira uma questão de alternativas (QuizQuestion, ou teclas
// marcáveis no multi-select), com "Não sei" e uma nota livre. Depois de
// responder, o modal fica aberto na revisão (revisarAoResponder no registro):
// a ação "resultado" com o mesmo id traz o gabarito e a explicação, mostrados
// com o QuizFeedback. O pedido nunca traz o gabarito.

import { Button, cx, Icon, letter, QuizFeedback, QuizQuestion, Tag, TextArea } from "@estudos/design-system";
import { Fala, Markdown, type PedidoPendente, type PropsPainel, type RegistroPedido } from "@estudos/ui";
import type { ReactNode } from "react";
import { useState } from "react";

interface OpcaoMostrada {
	index: number;
	label: string;
	description?: string;
}

interface DadosPergunta {
	question: string;
	details?: string;
	mode: "single-select" | "multi-select";
	options: OpcaoMostrada[];
	dontKnowLabel?: string;
}

interface DadosResultado {
	id: string;
	question: string;
	details?: string;
	mode: "single-select" | "multi-select";
	options: OpcaoMostrada[];
	escolhas: number[];
	correctIndices: number[];
	correct: boolean;
	dontKnow: boolean;
	note?: string;
	explanation?: string;
}

export function ehPergunta(pedido: PedidoPendente): pedido is PedidoPendente & { dados: DadosPergunta } {
	const dados = pedido.dados as Partial<DadosPergunta> | undefined;
	return pedido.acao === "perguntar" && typeof dados?.question === "string" && Array.isArray(dados.options);
}

function ehResultado(dados: unknown): dados is DadosResultado {
	const valor = dados as Partial<DadosResultado> | undefined;
	return typeof valor?.question === "string" && Array.isArray(valor.options) && Array.isArray(valor.correctIndices);
}

function Enunciado({ question, details }: { question: string; details?: string }) {
	return (
		<>
			<Markdown texto={question} emLinha />
			{details ? (
				<span className="quiz__detalhes body">
					<Markdown texto={details} emLinha />
				</span>
			) : null}
		</>
	);
}

type EstadoOpcao = "idle" | "selected" | "correct" | "incorrect" | "dim";

/** Teclas marcáveis para o multi-select, com o visual das alternativas do QuizQuestion. */
function OpcoesMultiplas(props: { opcoes: OpcaoMostrada[]; estado(indice: number): EstadoOpcao; alternar?(indice: number): void; rotulo: string }) {
	return (
		<div className="ap-quiz__options" role="group" aria-label={props.rotulo}>
			{props.opcoes.map((opcao, posicao) => {
				const estado = props.estado(opcao.index);
				return (
					<button
						key={opcao.index}
						type="button"
						role="checkbox"
						aria-checked={estado === "selected" || estado === "incorrect" || undefined}
						aria-disabled={!props.alternar || undefined}
						className={cx("ap-opt", `ap-opt--${estado}`)}
						onClick={() => props.alternar?.(opcao.index)}
					>
						<span className="ap-key data" aria-hidden="true">
							{estado === "correct" ? <Icon name="check" size={16} strokeWidth={3} /> : estado === "incorrect" ? <Icon name="close" size={16} strokeWidth={3} /> : letter(posicao)}
						</span>
						<span className="ap-opt__label body">
							<Markdown texto={opcao.label} emLinha />
						</span>
						{estado === "correct" ? (
							<Tag tone="sage" size="sm" icon="check" className="ap-opt__tag">
								Correta
							</Tag>
						) : null}
						{estado === "incorrect" ? (
							<Tag tone="brick" size="sm" icon="close" className="ap-opt__tag">
								Sua resposta
							</Tag>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

function Pergunta(props: { pedido: PedidoPendente & { dados: DadosPergunta }; responder: PropsPainel["responder"]; cancelar: PropsPainel["cancelar"]; quem?: ReactNode }) {
	const { dados, id } = props.pedido;
	const [escolhas, setEscolhas] = useState<number[]>([]);
	const [nota, setNota] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<string>();

	const executar = (acao: () => Promise<boolean>) => {
		setEnviando(true);
		setErro(undefined);
		acao().then(
			() => setEnviando(false),
			(falha: unknown) => {
				setEnviando(false);
				setErro(falha instanceof Error ? falha.message : String(falha));
			},
		);
	};
	const comNota = nota.trim() ? { nota } : {};
	const multipla = dados.mode === "multi-select";
	const enunciado = <Enunciado question={dados.question} {...(dados.details ? { details: dados.details } : {})} />;

	return (
		<div className={`quiz__item${props.quem ? " quiz__item--fala" : ""}`}>
			{props.quem ? (
				<Fala quem={props.quem}>
					<p className="ap-quiz__prompt heading">{enunciado}</p>
				</Fala>
			) : null}
			{multipla ? (
				<section className="ap-quiz" aria-label="Questão">
					<header className="ap-quiz__head">
						<span className="ap-quiz__kicker overline">Marque todas as corretas</span>
					</header>
					{props.quem ? null : <h3 className="ap-quiz__prompt heading">{enunciado}</h3>}
					<OpcoesMultiplas
						opcoes={dados.options}
						rotulo="Alternativas"
						estado={(indice) => (escolhas.includes(indice) ? "selected" : "idle")}
						{...(enviando
							? {}
							: { alternar: (indice: number) => setEscolhas((atuais) => (atuais.includes(indice) ? atuais.filter((item) => item !== indice) : [...atuais, indice])) })}
					/>
				</section>
			) : (
				<QuizQuestion
					kicker="Uma resposta"
					prompt={enunciado}
					options={dados.options.map((opcao) => ({ id: String(opcao.index), label: <Markdown texto={opcao.label} emLinha /> }))}
					value={escolhas[0] !== undefined ? String(escolhas[0]) : null}
					onChange={(valor) => setEscolhas([Number(valor)])}
					disabled={enviando}
				/>
			)}
			<TextArea
				label="Nota (opcional)"
				hint="O que você pensou ou ficou em dúvida. Vai junto com a resposta."
				value={nota}
				onChange={(evento) => setNota(evento.target.value)}
				rows={2}
				disabled={enviando}
				{...(erro ? { error: erro } : {})}
			/>
			<div className="quiz__botoes">
				<Button variant="ghost" size="sm" disabled={enviando} onClick={() => executar(() => props.cancelar(id))}>
					Pular
				</Button>
				<Button size="sm" disabled={enviando} onClick={() => executar(() => props.responder(id, { escolhas: [], naoSei: true, ...comNota }))}>
					{dados.dontKnowLabel ?? "Não sei"}
				</Button>
				<Button variant="primary" size="sm" disabled={enviando || escolhas.length === 0} onClick={() => executar(() => props.responder(id, { escolhas, ...comNota }))}>
					Conferir
				</Button>
			</div>
		</div>
	);
}

function Resultado({ dados, quem }: { dados: DadosResultado; quem?: ReactNode }) {
	const estado = (indice: number): EstadoOpcao =>
		dados.correctIndices.includes(indice) ? "correct" : dados.escolhas.includes(indice) ? "incorrect" : "dim";
	const enunciado = <Enunciado question={dados.question} {...(dados.details ? { details: dados.details } : {})} />;
	const feedback = (
		<QuizFeedback
			status={dados.dontKnow ? "partial" : dados.correct ? "correct" : "incorrect"}
			{...(dados.dontKnow ? { title: "Você marcou Não sei" } : {})}
		>
			{dados.explanation ? <Markdown texto={dados.explanation} /> : null}
			{dados.note ? (
				<p className="quiz__nota">
					<span className="overline">Sua nota</span> {dados.note}
				</p>
			) : null}
		</QuizFeedback>
	);

	if (dados.mode === "single-select") {
		const correta = dados.correctIndices[0];
		return (
			<div className={`quiz__item quiz__item--resultado${quem ? " quiz__item--fala" : ""}`}>
				{quem ? (
					<Fala quem={quem}>
						<p className="ap-quiz__prompt heading">{enunciado}</p>
					</Fala>
				) : null}
				<QuizQuestion
					prompt={enunciado}
					options={dados.options.map((opcao) => ({ id: String(opcao.index), label: <Markdown texto={opcao.label} emLinha /> }))}
					value={dados.escolhas[0] !== undefined ? String(dados.escolhas[0]) : null}
					{...(correta !== undefined ? { correctId: String(correta) } : {})}
				>
					{feedback}
				</QuizQuestion>
			</div>
		);
	}
	return (
		<div className="quiz__item quiz__item--resultado">
			<section className="ap-quiz" aria-label="Questão respondida">
				{quem ? (
					<Fala quem={quem}>
						<p className="ap-quiz__prompt heading">{enunciado}</p>
					</Fala>
				) : (
					<h3 className="ap-quiz__prompt heading">{enunciado}</h3>
				)}
				<OpcoesMultiplas opcoes={dados.options} rotulo="Alternativas com o gabarito" estado={estado} />
				{feedback}
			</section>
		</div>
	);
}

/** Revisão no modal: o resultado da correção, ou o que aconteceu com a questão. */
function Revisao({ registro, acoes, quem }: { registro: RegistroPedido; acoes: PropsPainel["acoes"]; quem?: ReactNode }) {
	const resultado = acoes.find((acao) => acao.acao === "resultado" && ehResultado(acao.dados) && acao.dados.id === registro.id);
	if (resultado) return <Resultado dados={resultado.dados as DadosResultado} {...(quem ? { quem } : {})} />;
	const dados = ehPergunta(registro) ? registro.dados : undefined;
	return (
		<div className="quiz__item">
			{dados ? (
				<Fala quem={quem}>
					<p className="ap-quiz__prompt heading">
						<Enunciado question={dados.question} {...(dados.details ? { details: dados.details } : {})} />
					</p>
				</Fala>
			) : null}
			<p className="body quiz__vazio">
				{registro.estado === "respondido"
					? "Corrigindo a sua resposta…"
					: registro.motivo === "usuario"
						? "Você pulou esta questão."
						: "A questão foi cancelada antes da resposta."}
			</p>
		</div>
	);
}

export function PainelQuiz(props: PropsPainel) {
	if (props.revisao) return <Revisao registro={props.revisao} acoes={props.acoes} {...(props.quemPergunta ? { quem: props.quemPergunta } : {})} />;
	const perguntas = props.pedidos.filter(ehPergunta);
	if (perguntas.length === 0) return <p className="body-sm quiz__vazio">Nenhuma questão esperando você.</p>;
	return (
		<div className="quiz">
			{perguntas.map((pedido) => (
				<Pergunta key={pedido.id} pedido={pedido} responder={props.responder} cancelar={props.cancelar} {...(props.quemPergunta ? { quem: props.quemPergunta } : {})} />
			))}
		</div>
	);
}
