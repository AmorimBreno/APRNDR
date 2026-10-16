// Registro de painéis (ESPECIFICACAO 5.4): liga o id de um painel a um
// componente React. O perfil lista no profile.json os painéis que usa; a
// AreaPaineis mostra cada um num Card do design system, com as ações
// (interface:mostrar) e os pedidos (interface:pedido) que chegaram para ele
// pela ponte de eventos.
//
// Um id sem componente registrado usa o PainelGenerico, que mostra o que
// chegou em JSON e deixa responder aos pedidos com um texto ou cancelar.

import { Button, Card, pad2, TextArea } from "@estudos/design-system";
import { type ComponentType, useState } from "react";
import type { AcaoRecebida, PedidoPendente } from "./estado-janela.ts";
import type { MotivoCancelamento } from "./tipos.ts";

export interface PropsPainel {
	painel: string;
	/** Ações recebidas para o painel, da mais antiga para a mais nova. */
	acoes: AcaoRecebida[];
	/** Pedidos esperando a resposta do usuário. */
	pedidos: PedidoPendente[];
	/** Pedidos cancelados pelo núcleo ou pelo usuário, por id, com o motivo. */
	cancelados: Record<string, MotivoCancelamento>;
	/** Responde ao pedido `id`. false = ele não esperava mais resposta. */
	responder(id: string, dados?: unknown): Promise<boolean>;
	/** Cancela o pedido `id` (a ferramenta recebe motivo "usuario"). false = ele não esperava mais resposta. */
	cancelar(id: string): Promise<boolean>;
	/** Manda uma ação deste painel para a sessão ("interface:acao"). */
	acaoDaInterface(acao: string, dados?: unknown): Promise<void>;
}

export type ComponentePainel = ComponentType<PropsPainel>;

/** Um painel com título próprio no Card (sem ele, o título é o id). */
export interface EntradaPainel {
	componente: ComponentePainel;
	titulo?: string;
}

/** Mapa de id do painel para o componente (ou componente e título). */
export type RegistroPaineis = Readonly<Record<string, ComponentePainel | EntradaPainel>>;

function entradaDoPainel(registro: RegistroPaineis, id: string): EntradaPainel {
	if (!Object.hasOwn(registro, id)) return { componente: PainelGenerico };
	const valor = registro[id]!;
	return typeof valor === "object" && "componente" in valor ? valor : { componente: valor };
}

/** Componente do painel `id`, ou o genérico se não houver um registrado. */
export function componenteDoPainel(registro: RegistroPaineis, id: string): ComponentePainel {
	return entradaDoPainel(registro, id).componente;
}

/** Dados em JSON legível, para a caixa técnica. */
export function emJson(dados: unknown): string {
	if (dados === undefined) return "(sem dados)";
	try {
		return JSON.stringify(dados, null, 2);
	} catch {
		return String(dados);
	}
}

function mensagemDe(falha: unknown): string {
	return falha instanceof Error ? falha.message : String(falha);
}

function ResponderPedido(props: { pedido: PedidoPendente; responder: PropsPainel["responder"]; cancelar: PropsPainel["cancelar"] }) {
	const [texto, setTexto] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<string>();

	const executar = (acao: () => Promise<boolean>) => {
		setEnviando(true);
		setErro(undefined);
		acao().then(
			() => setEnviando(false),
			(falha: unknown) => {
				setEnviando(false);
				setErro(mensagemDe(falha));
			},
		);
	};

	return (
		<section className="pedido" aria-label={`Pedido ${props.pedido.acao}`}>
			<span className="overline">Pedido · {props.pedido.acao}</span>
			<pre className="caixa-json">{emJson(props.pedido.dados)}</pre>
			<TextArea
				label="Sua resposta"
				value={texto}
				onChange={(evento) => setTexto(evento.target.value)}
				disabled={enviando}
				rows={2}
				{...(erro ? { error: erro } : {})}
			/>
			<div className="pedido__botoes">
				<Button variant="ghost" size="sm" disabled={enviando} onClick={() => executar(() => props.cancelar(props.pedido.id))}>
					Cancelar
				</Button>
				<Button variant="primary" size="sm" disabled={enviando} onClick={() => executar(() => props.responder(props.pedido.id, { resposta: texto }))}>
					Responder
				</Button>
			</div>
		</section>
	);
}

/** Painel para qualquer id sem componente: mostra o que chegou e responde pedidos com texto. */
export function PainelGenerico(props: PropsPainel) {
	return (
		<div className="painel-generico">
			{props.pedidos.map((pedido) => (
				<ResponderPedido key={pedido.id} pedido={pedido} responder={props.responder} cancelar={props.cancelar} />
			))}
			{props.acoes.length === 0 ? (
				props.pedidos.length === 0 ? (
					<p className="body-sm painel-generico__vazio">Nada chegou ainda. O que as ferramentas mostrarem neste painel aparece aqui.</p>
				) : null
			) : (
				<ol className="painel-generico__acoes">
					{props.acoes.map((acao, indice) => (
						<li key={acao.chave}>
							<span className="overline">
								{pad2(indice + 1)} · {acao.acao}
							</span>
							<pre className="caixa-json">{emJson(acao.dados)}</pre>
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
	/** Pedidos cancelados, por id, com o motivo. */
	cancelados?: Record<string, MotivoCancelamento>;
	responder(id: string, dados?: unknown): Promise<boolean>;
	cancelar(id: string): Promise<boolean>;
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

const semCancelados: Record<string, MotivoCancelamento> = {};

export function AreaPaineis(props: PropsAreaPaineis) {
	const ids = idsDosPaineis(props.paineis, props.acoesPorPainel, props.pedidos);
	if (ids.length === 0) return <p className="body-sm paineis__vazio">Este perfil não tem painéis.</p>;
	return (
		<div className="paineis">
			{ids.map((id, indice) => {
				const { componente: Componente, titulo } = entradaDoPainel(props.registro, id);
				const pedidos = props.pedidos.filter((pedido) => pedido.painel === id);
				return (
					<Card
						key={id}
						index={pad2(indice + 1)}
						label={pedidos.length ? "Esperando você" : "Painel"}
						title={titulo ?? id}
						className={`paineis__card${pedidos.length ? " paineis__card--esperando" : ""}`}
					>
						<Componente
							painel={id}
							acoes={props.acoesPorPainel[id] ?? []}
							pedidos={pedidos}
							cancelados={props.cancelados ?? semCancelados}
							responder={props.responder}
							cancelar={props.cancelar}
							acaoDaInterface={(acao, dados) => props.acaoDaInterface(id, acao, dados)}
						/>
					</Card>
				);
			})}
		</div>
	);
}
