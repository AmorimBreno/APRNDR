// Painel "pergunta": a versão web do ask_user_question (packages/core/src/
// pergunta.ts). Mostra cada pergunta que espera resposta: texto livre, uma
// escolha ou várias, sempre com a opção "Outra" quando há opções. Responde com
// { escolhas, outra, texto } ou cancela pelo protocolo (motivo "usuario").

import { Button, Checkbox, RadioGroup, TextArea, TextField } from "@estudos/design-system";
import { useState } from "react";
import type { PedidoPendente } from "../estado-janela.ts";
import { type PropsPainel, PainelGenerico } from "../paineis.tsx";
import type { DadosPedidoPergunta, RespostaPergunta } from "../tipos.ts";
import { Markdown } from "./Markdown.tsx";

const OUTRA = "__outra__";

function ehPergunta(pedido: PedidoPendente): pedido is PedidoPendente & { dados: DadosPedidoPergunta } {
	const dados = pedido.dados as Partial<DadosPedidoPergunta> | undefined;
	return pedido.acao === "perguntar" && typeof dados?.question === "string" && Array.isArray(dados.options);
}

function Pergunta(props: { id: string; dados: DadosPedidoPergunta; responder: PropsPainel["responder"]; cancelar: PropsPainel["cancelar"] }) {
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
			<div className="pergunta__enunciado heading">
				<Markdown texto={dados.question} emLinha />
			</div>
			{dados.details ? (
				<div className="pergunta__detalhes ap-prose body">
					<Markdown texto={dados.details} />
				</div>
			) : null}

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

export function PainelPergunta(props: PropsPainel) {
	const perguntas = props.pedidos.filter(ehPergunta);
	const outros = props.pedidos.filter((pedido) => !ehPergunta(pedido));
	return (
		<div className="painel-pergunta">
			{perguntas.map((pedido) => (
				<Pergunta key={pedido.id} id={pedido.id} dados={pedido.dados} responder={props.responder} cancelar={props.cancelar} />
			))}
			{perguntas.length === 0 && outros.length === 0 ? <p className="body-sm painel-generico__vazio">Nenhuma pergunta esperando você.</p> : null}
			{outros.length > 0 || props.acoes.length > 0 ? <PainelGenerico {...props} pedidos={outros} /> : null}
		</div>
	);
}
