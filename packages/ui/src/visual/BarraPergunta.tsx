// Pé da conversa: as mensagens na fila, o Parar enquanto o agente responde e
// a AskBar do design system. Enquanto o agente
// responde, Enter continua valendo: a mensagem entra na fila da sessão.

import { AskBar, Button } from "@estudos/design-system";

export interface PropsBarraPergunta {
	texto: string;
	setTexto(texto: string): void;
	executando: boolean;
	/** Sem conexão ou com a sessão carregando. */
	desabilitado: boolean;
	fila: string[];
	enviar(): void;
	parar(): void;
}

export function BarraPergunta(props: PropsBarraPergunta) {
	return (
		<div className="barra">
			{props.fila.length > 0 ? (
				<ol className="barra__fila" aria-label="Mensagens na fila">
					{props.fila.map((mensagem, indice) => (
						<li key={indice} className="barra__item body">
							<span className="overline">Na fila</span>
							<span className="barra__item-texto">{mensagem}</span>
						</li>
					))}
				</ol>
			) : null}
			{props.executando ? (
				// O agente trabalhando aparece na conversa, no lugar da resposta; aqui fica só o Parar.
				<div className="barra__status">
					<Button size="sm" icon="stop" onClick={props.parar}>
						Parar
					</Button>
				</div>
			) : null}
			<AskBar
				value={props.texto}
				onChange={props.setTexto}
				onSend={props.enviar}
				disabled={props.desabilitado}
				label="Mensagem para o agente"
				placeholder="Pergunte, peça ou responda…"
				hint={props.executando ? "Enter põe a mensagem na fila · Shift + Enter quebra a linha" : undefined}
			/>
		</div>
	);
}
