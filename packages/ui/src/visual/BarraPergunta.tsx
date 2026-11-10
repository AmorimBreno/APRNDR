// Pé da conversa: as mensagens na fila, o Parar enquanto o agente responde e
// a AskBar do design system. Enquanto o agente
// responde, Enter continua valendo: a mensagem entra na fila da sessão.
//
// No painel embutido (a mesa de estudo) o campo vira uma caixa: as pills de
// contexto e a da citação numa fileira acima, e dentro da caixa, embaixo do
// texto, o modelo, a conexão e o enviar (ou o Parar).

import { AskBar, Button, Icon } from "@estudos/design-system";
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";
import type { EstadoConexao } from "../cliente.ts";
import { useValorEstavel } from "../valor-estavel.ts";

/** Quanto do trecho citado aparece no chip; o resto fica no title. */
const LIMITE_CITACAO = 90;
/** Quanto do trecho citado aparece na pill do painel embutido. */
const LIMITE_PILL = 40;
const MAX_LINHAS = 6;

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
	/**
	 * Só no painel embutido: o campo vira uma caixa, com as pills acima e a
	 * linha do modelo, da conexão e do enviar dentro. Sem isto, a barra de
	 * sempre (tela cheia).
	 */
	embutida?: {
		/** As pills de contexto do perfil, antes da pill da citação. */
		acima?: ReactNode;
		placeholder?: string;
		/** O seletor de modelo já montado (SeletorModelo em variante pill). */
		modelo?: ReactNode;
		conexao: EstadoConexao;
	};
}

const ROTULO_CONEXAO: Record<EstadoConexao, string> = { aberta: "Conectado", reconectando: "Reconectando", conectando: "Sem conexão" };

/** A caixa do painel embutido. */
function CaixaEmbutida({ props, embutida }: { props: PropsBarraPergunta; embutida: NonNullable<PropsBarraPergunta["embutida"]> }) {
	const campo = useRef<HTMLTextAreaElement>(null);
	// "Reconectando" e "Sem conexão" são estados passageiros: só aparecem se durarem mais de 1 s.
	const conexaoVisivel = useValorEstavel(embutida.conexao, embutida.conexao !== "aberta", "aberta");
	const medir = () => {
		const el = campo.current;
		if (!el) return;
		el.style.height = "auto";
		const altura = parseFloat(getComputedStyle(el).lineHeight) || 24;
		el.style.height = `${Math.min(el.scrollHeight, altura * MAX_LINHAS)}px`;
	};
	useLayoutEffect(medir, [props.texto]);
	// A largura muda (o professor abre e fecha, a janela redimensiona) e as quebras de linha mudam com ela.
	useLayoutEffect(() => {
		const el = campo.current;
		if (!el || typeof ResizeObserver !== "function") return;
		let largura = el.clientWidth;
		const observador = new ResizeObserver(() => {
			if (el.clientWidth === largura) return;
			largura = el.clientWidth;
			medir();
		});
		observador.observe(el);
		return () => observador.disconnect();
	}, []);
	const podeEnviar = !props.desabilitado && props.texto.trim().length > 0;
	const enviar = () => {
		if (podeEnviar) props.enviar();
	};
	return (
		<div className="barra__embutida">
			{embutida.acima || props.citacao ? (
				<div className="barra__pills">
					{embutida.acima}
					{props.citacao ? (
						<span className="barra__pill" role="group" aria-label="Trecho citado" title={props.citacao.texto}>
							<Icon name="message" size={14} strokeWidth={2.5} />
							<span className="barra__pill-texto body-sm">{trechoCurto(props.citacao.texto, LIMITE_PILL)}</span>
							<button type="button" className="barra__pill-x" aria-label="Remover a citação" onClick={props.citacao.limpar}>
								<Icon name="close" size={12} strokeWidth={2.75} />
							</button>
						</span>
					) : null}
				</div>
			) : null}
			<div className={`barra__caixa${props.desabilitado ? " barra__caixa--desabilitada" : ""}`}>
				<textarea
					ref={campo}
					className="barra__campo body"
					rows={1}
					value={props.texto}
					placeholder={embutida.placeholder ?? "Pergunte, peça ou responda…"}
					aria-label="Mensagem para o agente"
					disabled={props.desabilitado}
					onChange={(evento) => props.setTexto(evento.target.value)}
					onKeyDown={(evento) => {
						if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
							evento.preventDefault();
							enviar();
						}
					}}
				/>
				<div className="barra__rodape">
					{embutida.modelo}
					<span className={`barra__conexao barra__conexao--${conexaoVisivel}`} role="status">
						<span className="barra__conexao-ponto" aria-hidden="true" />
						<span className="body-sm">{ROTULO_CONEXAO[conexaoVisivel]}</span>
					</span>
					<span className="barra__rodape-fim">
						{props.executando ? (
							<Button size="sm" icon="stop" onClick={props.parar}>
								Parar
							</Button>
						) : (
							<Button variant="primary" size="sm" iconOnly icon="arrow-up" aria-label="Enviar" onClick={enviar} disabled={!podeEnviar} />
						)}
					</span>
				</div>
			</div>
		</div>
	);
}

export function BarraPergunta(props: PropsBarraPergunta) {
	const raiz = useRef<HTMLDivElement>(null);
	const { campoRef } = props;
	useLayoutEffect(() => {
		if (campoRef) campoRef.current = raiz.current?.querySelector("textarea") ?? null;
	});
	const { embutida } = props;
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
			{embutida ? (
				<CaixaEmbutida props={props} embutida={embutida} />
			) : (
				<>
					{/* O agente trabalhando aparece na conversa, no lugar da resposta; aqui fica só o Parar.
					    A faixa tem a altura reservada: o Parar aparece sem empurrar a conversa. */}
					<div className="barra__status" {...(props.executando ? {} : { style: { visibility: "hidden" as const }, "aria-hidden": true })}>
						<Button size="sm" icon="stop" onClick={props.parar}>
							Parar
						</Button>
					</div>
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
				</>
			)}
		</div>
	);
}
