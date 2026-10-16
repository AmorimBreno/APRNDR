// Pedidos da ponte na conversa: cada pedido que espera resposta (de qualquer
// painel) vira um botão no lugar da linha da ferramenta que perguntou, e é
// respondido num modal. O modal abre sozinho quando o pedido chega; dá para
// minimizar e voltar pelo botão, que pulsa em âmbar enquanto espera. Depois
// de respondido, o botão fica só com o contorno e abre o modal para rever.

import { Button, Icon, Modal, pad2 } from "@estudos/design-system";
import type { ReactNode } from "react";
import type { AcaoRecebida, RegistroPedido } from "../estado-janela.ts";
import { entradaDoPainel, type PropsPainel, type RegistroPaineis, type ResumoPedido, situacaoDoPedido } from "../paineis.tsx";
import type { MotivoCancelamento } from "../tipos.ts";
import { Markdown } from "./Markdown.tsx";

/** Resumo do pedido pelo painel dele, ou o genérico. */
export function resumoDoPedido(registro: RegistroPaineis, pedido: RegistroPedido): ResumoPedido {
	const entrada = entradaDoPainel(registro, pedido.painel);
	return entrada.resumir?.(pedido) ?? { tipo: "Pedido", titulo: `${entrada.titulo ?? pedido.painel} · ${pedido.acao}` };
}

/** Número de cada pedido entre os do mesmo tipo, na ordem de chegada ("Pergunta 01", "Pergunta 02"). */
export function numerarPedidos(registro: RegistroPaineis, registros: Record<string, RegistroPedido>): Record<string, number> {
	const contagem = new Map<string, number>();
	const numeros: Record<string, number> = {};
	for (const pedido of Object.values(registros).sort((a, b) => a.ordem - b.ordem)) {
		const tipo = resumoDoPedido(registro, pedido).tipo;
		const numero = (contagem.get(tipo) ?? 0) + 1;
		contagem.set(tipo, numero);
		numeros[pedido.id] = numero;
	}
	return numeros;
}

export interface PropsBotaoPedido {
	pedido: RegistroPedido;
	resumo: ResumoPedido;
	numero: number;
	abrir(): void;
}

/** O botão do pedido na conversa: âmbar pulsando enquanto espera; depois, só o contorno. */
export function BotaoPedido({ pedido, resumo, numero, abrir }: PropsBotaoPedido) {
	const pendente = pedido.estado === "pendente";
	const rotulo = `${resumo.tipo} ${pad2(numero)}`;
	return (
		<button
			type="button"
			className={`botao-pedido${pendente ? " botao-pedido--pendente" : ""}`}
			aria-haspopup="dialog"
			aria-label={`${rotulo}: ${situacaoDoPedido(pedido)}. ${pendente ? "Abrir para responder" : "Abrir para rever"}`}
			onClick={abrir}
		>
			<Icon name={resumo.icone ?? "message"} size={22} strokeWidth={2.25} />
			<span className="botao-pedido__texto">
				<span className="overline">
					{rotulo} · {situacaoDoPedido(pedido)}
				</span>
				<span className="botao-pedido__titulo body-strong">
					<Markdown texto={resumo.titulo} emLinha />
				</span>
			</span>
			<Icon name={pendente ? "arrow-up-right" : "check"} size={20} strokeWidth={2.5} />
		</button>
	);
}

export interface PropsModalPedido {
	pedido: RegistroPedido;
	registro: RegistroPaineis;
	numero: number;
	/** Ações do painel do pedido (o quiz acha o resultado ali). */
	acoes: AcaoRecebida[];
	cancelados: Record<string, MotivoCancelamento>;
	responder: PropsPainel["responder"];
	cancelar: PropsPainel["cancelar"];
	acaoDaInterface(painel: string, acao: string, dados?: unknown): Promise<void>;
	/** Fecha o modal; se o pedido ainda espera, ele continua esperando (minimizar). */
	fechar(): void;
	/** A foto de quem pergunta, na frente do enunciado. */
	quemPergunta?: ReactNode;
}

/** O modal de um pedido: para responder, ou para rever depois. */
export function ModalPedido(props: PropsModalPedido) {
	const { pedido } = props;
	const entrada = entradaDoPainel(props.registro, pedido.painel);
	const resumo = resumoDoPedido(props.registro, pedido);
	const Componente = entrada.componente;
	const pendente = pedido.estado === "pendente";
	return (
		<Modal
			open
			onClose={props.fechar}
			title={`${resumo.tipo} ${pad2(props.numero)}`}
			kicker={entrada.titulo ?? pedido.painel}
			tone={pendente ? "amber" : "panel"}
			size="md"
			closeLabel={pendente ? "Minimizar" : "Fechar"}
			footer={
				<Button variant={pendente ? "ghost" : "secondary"} icon={pendente ? undefined : "close"} onClick={props.fechar}>
					{pendente ? "Responder depois" : "Fechar"}
				</Button>
			}
		>
			<Componente
				painel={pedido.painel}
				acoes={props.acoes}
				pedidos={pendente ? [pedido] : []}
				{...(pendente ? {} : { revisao: pedido })}
				cancelados={props.cancelados}
				responder={props.responder}
				cancelar={props.cancelar}
				acaoDaInterface={(acao, dados) => props.acaoDaInterface(pedido.painel, acao, dados)}
				{...(props.quemPergunta ? { quemPergunta: props.quemPergunta } : {})}
			/>
		</Modal>
	);
}
