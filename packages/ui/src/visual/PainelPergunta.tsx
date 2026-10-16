// Painel "pergunta": a versão web do ask_user_question (packages/core/src/
// pergunta.ts), mostrado no modal do pedido. Para responder: texto livre, uma
// escolha ou várias, sempre com a opção "Outra" quando há opções; responde com
// { escolhas, outra, texto } ou cancela pelo protocolo (motivo "usuario").
// Para rever (props.revisao): a pergunta e o que você respondeu.

import { Button, Checkbox, RadioGroup, TextArea, TextField } from "@estudos/design-system";
import { type ReactNode, useState } from "react";
import type { PedidoPendente, RegistroPedido } from "../estado-janela.ts";
import { type PropsPainel, PainelGenerico, situacaoDoPedido } from "../paineis.tsx";
import type { DadosPedidoPergunta, RespostaPergunta } from "../tipos.ts";
import { Fala } from "./Fala.tsx";
import { Markdown } from "./Markdown.tsx";

const OUTRA = "__outra__";

function ehPergunta(pedido: PedidoPendente): pedido is PedidoPendente & { dados: DadosPedidoPergunta } {
	const dados = pedido.dados as Partial<DadosPedidoPergunta> | undefined;
	return pedido.acao === "perguntar" && typeof dados?.question === "string" && Array.isArray(dados.options);
}

function Pergunta(props: { id: string; dados: DadosPedidoPergunta; responder: PropsPainel["responder"]; cancelar: PropsPainel["cancelar"]; quemPergunta?: ReactNode }) {
	const { dados } = props;
	const [escolhidas, setEscolhidas] = useState<string[]>([]);
	const [outra, setOutra] = useState("");
	const [texto, setTexto] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<string>();

	const comOutra = escolhidas.includes(OUTRA);
	const resposta: RespostaPergunta =
		dados.mode === "text"
			? { texto }
			: {
					escolhas: escolhidas.filter((valor) => valor !== OUTRA).map(Number),
					...(comOutra && outra.trim() ? { outra } : {}),
				};
	const podeEnviar = dados.mode === "text" ? true : Boolean(resposta.escolhas?.length || resposta.outra);

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

	const alternar = (valor: string, marcado: boolean) =>
		setEscolhidas((atuais) => (marcado ? [...atuais, valor] : atuais.filter((item) => item !== valor)));

	const opcoes = dados.options.map((opcao, indice) => ({
		value: String(indice + 1),
		label: <Markdown texto={opcao.label} emLinha />,
		...(opcao.description ? { description: <Markdown texto={opcao.description} emLinha /> } : {}),
	}));
	const rotuloOutra = dados.otherLabel ?? "Outra";

	return (
		<section className="pergunta" aria-label="Pergunta do agente">
			<Fala quem={props.quemPergunta}>
				<div className="pergunta__enunciado heading">
					<Markdown texto={dados.question} emLinha />
				</div>
				{dados.details ? (
					<div className="pergunta__detalhes ap-prose body">
						<Markdown texto={dados.details} />
					</div>
				) : null}
			</Fala>

			{dados.mode === "text" ? (
				<TextArea label="Sua resposta" value={texto} onChange={(evento) => setTexto(evento.target.value)} rows={3} disabled={enviando} />
			) : dados.mode === "single-select" ? (
				<RadioGroup
					legend="Escolha uma"
					options={[...opcoes, { value: OUTRA, label: rotuloOutra }]}
					value={escolhidas[0] ?? ""}
					onChange={(valor) => setEscolhidas([valor])}
				/>
			) : (
				<fieldset className="pergunta__varias">
					<legend className="overline">Escolha uma ou mais</legend>
					{opcoes.map((opcao) => (
						<Checkbox
							key={opcao.value}
							label={opcao.label}
							{...(opcao.description ? { description: opcao.description } : {})}
							checked={escolhidas.includes(opcao.value)}
							onChange={(evento) => alternar(opcao.value, evento.target.checked)}
							disabled={enviando}
						/>
					))}
					<Checkbox label={rotuloOutra} checked={comOutra} onChange={(evento) => alternar(OUTRA, evento.target.checked)} disabled={enviando} />
				</fieldset>
			)}
			{comOutra ? (
				<TextField label={`${rotuloOutra}: escreva a sua`} value={outra} onChange={(evento) => setOutra(evento.target.value)} autoFocus disabled={enviando} />
			) : null}
			{erro ? <p className="pergunta__erro body-sm">{erro}</p> : null}

			<div className="pedido__botoes">
				<Button variant="ghost" size="sm" disabled={enviando} onClick={() => executar(() => props.cancelar(props.id))}>
					Não responder
				</Button>
				<Button variant="primary" size="sm" iconRight="arrow-right" disabled={enviando || !podeEnviar} onClick={() => executar(() => props.responder(props.id, resposta))}>
					Enviar resposta
				</Button>
			</div>
		</section>
	);
}

/** O que você respondeu, em texto, a partir da resposta guardada. */
function respostasEmTexto(dados: DadosPedidoPergunta, resposta: unknown): string[] {
	const { escolhas, outra, texto } = (resposta ?? {}) as RespostaPergunta;
	if (dados.mode === "text") return [typeof texto === "string" && texto.trim() ? texto.trim() : "(resposta vazia)"];
	const itens = (Array.isArray(escolhas) ? escolhas : []).map((indice) => dados.options[indice - 1]?.label ?? `opção ${indice}`);
	if (typeof outra === "string" && outra.trim()) itens.push(`${dados.otherLabel ?? "Outra"}: ${outra.trim()}`);
	return itens;
}

function Revisao(props: { registro: RegistroPedido & { dados: DadosPedidoPergunta }; quemPergunta?: ReactNode }) {
	const { registro } = props;
	const { dados } = registro;
	const respostas = registro.estado === "respondido" ? respostasEmTexto(dados, registro.resposta) : [];
	return (
		<section className="pergunta" aria-label="Pergunta respondida">
			<Fala quem={props.quemPergunta}>
				<div className="pergunta__enunciado heading">
					<Markdown texto={dados.question} emLinha />
				</div>
				{dados.details ? (
					<div className="pergunta__detalhes ap-prose body">
						<Markdown texto={dados.details} />
					</div>
				) : null}
			</Fala>
			<div className="pergunta__resposta">
				<span className="overline">{registro.estado === "respondido" ? "Sua resposta" : situacaoDoPedido(registro)}</span>
				{respostas.length > 0 ? (
					<ul>
						{respostas.map((item, indice) => (
							<li key={indice} className="body-lg">
								<Markdown texto={item} emLinha />
							</li>
						))}
					</ul>
				) : null}
			</div>
		</section>
	);
}

export function PainelPergunta(props: PropsPainel) {
	if (props.revisao) {
		return ehPergunta(props.revisao) ? (
			<Revisao registro={props.revisao} {...(props.quemPergunta ? { quemPergunta: props.quemPergunta } : {})} />
		) : (
			<PainelGenerico {...props} />
		);
	}
	const perguntas = props.pedidos.filter(ehPergunta);
	const outros = props.pedidos.filter((pedido) => !ehPergunta(pedido));
	return (
		<div className="painel-pergunta">
			{perguntas.map((pedido) => (
				<Pergunta
					key={pedido.id}
					id={pedido.id}
					dados={pedido.dados}
					responder={props.responder}
					cancelar={props.cancelar}
					{...(props.quemPergunta ? { quemPergunta: props.quemPergunta } : {})}
				/>
			))}
			{perguntas.length === 0 && outros.length === 0 ? <p className="body-sm painel-generico__vazio">Nenhuma pergunta esperando você.</p> : null}
			{outros.length > 0 || props.acoes.length > 0 ? <PainelGenerico {...props} pedidos={outros} /> : null}
		</div>
	);
}
