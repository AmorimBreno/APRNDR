// Registro de painéis (ESPECIFICACAO 5.4): liga o id de um painel a um
// componente React. O perfil lista no profile.json os painéis que usa; a
// AreaPaineis mostra cada um com as ações (interface:mostrar) e os pedidos
// (interface:pedido) que chegaram para ele pela ponte de eventos.
//
// Um id sem componente registrado usa o PainelGenerico, que só mostra o que
// chegou em JSON e deixa responder aos pedidos com um texto.
//
// Visual provisório: elementos HTML com o estilo padrão do navegador.

import { type ComponentType, useState } from "react";
import type { AcaoRecebida, PedidoPendente } from "./estado-janela.ts";
import type { MotivoCancelamento } from "./tipos.ts";

export interface PropsPainel {
	painel: string;
	/** Ações recebidas para o painel, da mais antiga para a mais nova. */
	acoes: AcaoRecebida[];
	/** Pedidos esperando a resposta do usuário. */
	pedidos: PedidoPendente[];
	/** Responde ao pedido `id`. false = ele não esperava mais resposta. */
	responder(id: string, dados?: unknown): Promise<boolean>;
	/** Manda uma ação deste painel para a sessão ("interface:acao"). */
	acaoDaInterface(acao: string, dados?: unknown): Promise<void>;
}

export type ComponentePainel = ComponentType<PropsPainel>;

/** Mapa de id do painel para o componente. */
export type RegistroPaineis = Readonly<Record<string, ComponentePainel>>;

/** Componente do painel `id`, ou o genérico se não houver um registrado. */
export function componenteDoPainel(registro: RegistroPaineis, id: string): ComponentePainel {
	return Object.hasOwn(registro, id) ? registro[id]! : PainelGenerico;
}

/** Dados que um pedido recebe quando o usuário clica em "Cancelar" no painel genérico. */
export const RESPOSTA_CANCELADA = { cancelado: true } as const;

function emJson(dados: unknown): string {
	if (dados === undefined) return "(sem dados)";
	try {
		return JSON.stringify(dados, null, 2);
	} catch {
		return String(dados);
	}
}

function ResponderPedido(props: { pedido: PedidoPendente; responder: PropsPainel["responder"] }) {
	const [texto, setTexto] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<string>();

	const enviar = (dados: unknown) => {
		setEnviando(true);
		setErro(undefined);
		props.responder(props.pedido.id, dados).then(
			() => setEnviando(false),
			(falha: unknown) => {
				setEnviando(false);
				setErro(falha instanceof Error ? falha.message : String(falha));
			},
		);
	};

	return (
		<fieldset>
			<legend>
				Pedido {props.pedido.acao} ({props.pedido.id})
			</legend>
			<pre style={{ whiteSpace: "pre-wrap" }}>{emJson(props.pedido.dados)}</pre>
			<input
				type="text"
				value={texto}
				onChange={(evento) => setTexto(evento.target.value)}
				disabled={enviando}
				aria-label="Resposta"
			/>{" "}
			<button type="button" disabled={enviando} onClick={() => enviar({ resposta: texto })}>
				Responder
			</button>{" "}
			<button type="button" disabled={enviando} onClick={() => enviar(RESPOSTA_CANCELADA)}>
				Cancelar
			</button>
			{erro ? <p>Erro: {erro}</p> : null}
		</fieldset>
	);
}

/** Painel para qualquer id sem componente: mostra o que chegou e responde pedidos com texto. */
export function PainelGenerico(props: PropsPainel) {
	return (
		<div>
			{props.pedidos.map((pedido) => (
				<ResponderPedido key={pedido.id} pedido={pedido} responder={props.responder} />
			))}
			{props.acoes.length === 0 ? (
				<p>Nenhuma ação recebida.</p>
			) : (
				<ol>
					{props.acoes.map((acao) => (
						<li key={acao.chave}>
							<strong>{acao.acao}</strong>
							<pre style={{ whiteSpace: "pre-wrap" }}>{emJson(acao.dados)}</pre>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

export interface PropsAreaPaineis {
	/** Painéis do perfil (profile.json). Ids que receberam algo e não estão na lista aparecem no fim. */
	paineis: string[];
	registro: RegistroPaineis;
	acoesPorPainel: Record<string, AcaoRecebida[]>;
	pedidos: PedidoPendente[];
	/** Pedidos cancelados pelo núcleo (não usado pelo genérico; fica para os painéis próprios). */
	cancelados?: Record<string, MotivoCancelamento>;
	responder(id: string, dados?: unknown): Promise<boolean>;
	acaoDaInterface(painel: string, acao: string, dados?: unknown): Promise<void>;
}

/** Ids a mostrar: os do perfil e, depois, os que receberam ação ou pedido sem estar na lista. */
export function idsDosPaineis(paineis: string[], acoesPorPainel: Record<string, unknown>, pedidos: PedidoPendente[]): string[] {
	const ids = [...paineis];
	for (const id of [...Object.keys(acoesPorPainel), ...pedidos.map((pedido) => pedido.painel)]) {
		if (!ids.includes(id)) ids.push(id);
	}
	return ids;
}

export function AreaPaineis(props: PropsAreaPaineis) {
	const ids = idsDosPaineis(props.paineis, props.acoesPorPainel, props.pedidos);
	if (ids.length === 0) return <p>Este perfil não tem painéis.</p>;
	return (
		<div>
			{ids.map((id) => {
				const Componente = componenteDoPainel(props.registro, id);
				return (
					<section key={id}>
						<h3>Painel {id}</h3>
						<Componente
							painel={id}
							acoes={props.acoesPorPainel[id] ?? []}
							pedidos={props.pedidos.filter((pedido) => pedido.painel === id)}
							responder={props.responder}
							acaoDaInterface={(acao, dados) => props.acaoDaInterface(id, acao, dados)}
						/>
					</section>
				);
			})}
		</div>
	);
}
