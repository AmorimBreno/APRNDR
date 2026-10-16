// Registro de painéis (ESPECIFICACAO 5.4): liga o id de um painel a um
// componente React. O perfil lista no profile.json os painéis que usa.
//
// Dois lugares mostram um painel:
// - a AreaPaineis, à direita, com as ações (interface:mostrar) de cada um num
//   Card do design system;
// - o modal do pedido (ModalPedido), aberto pelo botão do pedido na conversa:
//   todo pedido que espera resposta (interface:pedido), de qualquer painel, é
//   respondido ali e depois pode ser revisto.
//
// Um id sem componente registrado usa o PainelGenerico, que mostra o que
// chegou em JSON e deixa responder aos pedidos com um texto ou cancelar.

import { Button, Card, type IconName, pad2, TextArea } from "@estudos/design-system";
import { type ComponentType, type ReactNode, useState } from "react";
import type { AcaoRecebida, PedidoPendente, RegistroPedido } from "./estado-janela.ts";
import type { MotivoCancelamento } from "./tipos.ts";

export interface PropsPainel {
	painel: string;
	/** Ações recebidas para o painel, da mais antiga para a mais nova. */
	acoes: AcaoRecebida[];
	/** Pedidos esperando a resposta do usuário (no modal, só o pedido aberto). */
	pedidos: PedidoPendente[];
	/** No modal, um pedido já respondido ou cancelado: mostrar só para rever. */
	revisao?: RegistroPedido;
	/** No modal, a foto de quem pergunta (o agente), para ir na frente do enunciado (Fala). */
	quemPergunta?: ReactNode;
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

/** Como um pedido aparece no botão da conversa e no título do modal. */
export interface ResumoPedido {
	/** "Pergunta", "Questão". Vira "Pergunta 01". */
	tipo: string;
	/** O texto do botão (markdown em linha). */
	titulo: string;
	icone?: IconName;
}

/** Um painel com título, resumo dos pedidos e comportamento próprios. */
export interface EntradaPainel {
	componente: ComponentePainel;
	/** Título no Card e no modal. Sem ele, o id. */
	titulo?: string;
	/** Só tem pedidos: não aparece na área de painéis. */
	soModal?: boolean;
	/** Resumo do pedido para o botão na conversa. Sem ele, "Pedido" e o título do painel. */
	resumir?(pedido: PedidoPendente): ResumoPedido;
	/** Depois de responder, o modal continua aberto na revisão (o quiz mostra o retorno ali). */
	revisarAoResponder?: boolean;
}

/** Mapa de id do painel para o componente (ou componente e título). */
export type RegistroPaineis = Readonly<Record<string, ComponentePainel | EntradaPainel>>;

export function entradaDoPainel(registro: RegistroPaineis, id: string): EntradaPainel {
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

/** O que aconteceu com o pedido, em palavras, para a revisão e o botão. */
export function situacaoDoPedido(registro: RegistroPedido): string {
	if (registro.estado === "respondido") return "Respondido";
	if (registro.estado === "pendente") return "Esperando você";
	return registro.motivo === "usuario" ? "Você não respondeu" : "Cancelado";
}

/** Painel para qualquer id sem componente: mostra o que chegou e responde pedidos com texto. */
export function PainelGenerico(props: PropsPainel) {
	if (props.revisao) {
		return (
			<div className="painel-generico">
				<section className="pedido" aria-label={`Pedido ${props.revisao.acao}`}>
					<span className="overline">Pedido · {props.revisao.acao}</span>
					<pre className="caixa-json">{emJson(props.revisao.dados)}</pre>
					<span className="overline">{situacaoDoPedido(props.revisao)}</span>
					{props.revisao.resposta !== undefined ? <pre className="caixa-json">{emJson(props.revisao.resposta)}</pre> : null}
				</section>
			</div>
		);
	}
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
	/** Pedidos cancelados, por id, com o motivo. */
	cancelados?: Record<string, MotivoCancelamento>;
	responder(id: string, dados?: unknown): Promise<boolean>;
	cancelar(id: string): Promise<boolean>;
	acaoDaInterface(painel: string, acao: string, dados?: unknown): Promise<void>;
}

/**
 * Ids da área de painéis: os do perfil e, depois, os que receberam ação sem
 * estar na lista. Os só de pedidos (soModal) ficam de fora: os pedidos são
 * respondidos no modal, pelo botão na conversa.
 */
export function idsDosPaineis(paineis: string[], acoesPorPainel: Record<string, unknown>, registro: RegistroPaineis = {}): string[] {
	const ids = [...paineis];
	for (const id of Object.keys(acoesPorPainel)) {
		if (!ids.includes(id)) ids.push(id);
	}
	return ids.filter((id) => !entradaDoPainel(registro, id).soModal);
}

const semCancelados: Record<string, MotivoCancelamento> = {};
const semPedidos: PedidoPendente[] = [];

export function AreaPaineis(props: PropsAreaPaineis) {
	const ids = idsDosPaineis(props.paineis, props.acoesPorPainel, props.registro);
	if (ids.length === 0) return <p className="body-sm paineis__vazio">Este perfil não tem painéis.</p>;
	return (
		<div className="paineis">
			{ids.map((id, indice) => {
				const { componente: Componente, titulo } = entradaDoPainel(props.registro, id);
				return (
					<Card key={id} index={pad2(indice + 1)} label="Painel" title={titulo ?? id} className="paineis__card">
						<Componente
							painel={id}
							acoes={props.acoesPorPainel[id] ?? []}
							pedidos={semPedidos}
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
