// Pé da conversa: as mensagens na fila, o Parar enquanto o agente responde e
// a AskBar do design system. Enquanto o agente
// responde, Enter continua valendo: a mensagem entra na fila da sessão.

import { AskBar, Button, Icon } from "@estudos/design-system";
import { type RefObject, useLayoutEffect, useRef } from "react";

/** Quanto do trecho citado aparece no chip; o resto fica no title. */
const LIMITE_CITACAO = 90;

/** O trecho em uma linha, com os espaços e quebras apertados e cortado com reticências. */
export function trechoCurto(texto: string, limite = LIMITE_CITACAO): string {
	const linha = texto.replace(/\s+/g, " ").trim();
	return linha.length > limite ? `${linha.slice(0, limite - 1)}…` : linha;
}

export interface PropsBarraPergunta {
	texto: string;
	setTexto(texto: string): void;
	executando: boolean;
	/** Sem conexão ou com a sessão carregando. */
	desabilitado: boolean;
	fila: string[];
	enviar(): void;
	parar(): void;
	/**
	 * Recebe o campo de texto (para medir de onde a mensagem sai no voo). O
	 * AskBar do design system não repassa ref, então o campo é achado dentro
	 * desta barra, não no documento inteiro.
	 */
	campoRef?: RefObject<HTMLTextAreaElement | null>;
	/** Um trecho citado: chip removível acima do campo; vai junto da próxima mensagem. */
	citacao?: { texto: string; limpar(): void };
}

export function BarraPergunta(props: PropsBarraPergunta) {
	const raiz = useRef<HTMLDivElement>(null);
	const { campoRef } = props;
	useLayoutEffect(() => {
		if (campoRef) campoRef.current = raiz.current?.querySelector("textarea") ?? null;
	});
	return (
		<div className="barra" ref={raiz}>
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
			{props.citacao ? (
				<div className="barra__citacao" role="group" aria-label="Trecho citado">
					<Icon name="message" size={14} strokeWidth={2.5} />
					<span className="barra__citacao-texto body-sm" title={props.citacao.texto}>
						{trechoCurto(props.citacao.texto)}
					</span>
					<Button size="sm" variant="ghost" iconOnly icon="close" aria-label="Remover a citação" onClick={props.citacao.limpar} />
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
