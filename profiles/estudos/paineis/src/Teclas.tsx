// As teclas de papel (um seletor segmentado com radios nativos) e a confiança
// antes de responder (seção 8 da especificação: de 1 = chute a 4 = certeza),
// usadas no diagnóstico (EtapaDiagnostico.tsx), nas questões do módulo
// (QuestaoModulo.tsx) e na nota rápida do feedback de cada bloco
// (TelaModulo.tsx: Ruim, Bom e Ótimo).

import { useId } from "react";
import { CONFIANCAS, type Confianca, NOMES_CONFIANCA } from "../../lib/diagnostico-tipos.ts";

/**
 * Um seletor segmentado com radios nativos (as setas andam, Tab entra e sai
 * do grupo), no visual das teclas de papel; a marcada fica âmbar.
 */
export function Teclas<V extends string | number>(props: {
	rotulo: string;
	opcoes: Array<{ valor: V; texto: string; tecla?: string }>;
	valor: V | undefined;
	mudar(valor: V): void;
	desligado?: boolean;
	className?: string;
}) {
	const nome = useId();
	return (
		<div role="radiogroup" aria-label={props.rotulo} aria-disabled={props.desligado || undefined} className={`diag__teclas${props.className ? ` ${props.className}` : ""}`}>
			{props.opcoes.map((opcao) => {
				const marcada = props.valor === opcao.valor;
				return (
					<label key={opcao.valor} className={`diag__tecla${marcada ? " diag__tecla--marcada" : ""}`}>
						<input
							type="radio"
							className="diag__radio"
							name={nome}
							value={opcao.valor}
							checked={marcada}
							disabled={props.desligado}
							onChange={() => props.mudar(opcao.valor)}
						/>
						{opcao.tecla ? (
							<span className="diag__tecla-num data" aria-hidden="true">
								{opcao.tecla}
							</span>
						) : null}
						<span className="body-sm diag__tecla-texto">{opcao.texto}</span>
					</label>
				);
			})}
		</div>
	);
}

/** "Antes de responder: quanto você confia que vai acertar?" e as teclas da confiança, de 1 a 4. */
export function ConfiancaAntes(props: { valor: Confianca | undefined; mudar(valor: Confianca): void; desligado?: boolean; className?: string }) {
	return (
		<div className={`diag__confianca${props.className ? ` ${props.className}` : ""}`}>
			<p className="body-strong diag__pergunta">Antes de responder: quanto você confia que vai acertar?</p>
			<Teclas<Confianca>
				rotulo="Confiança"
				opcoes={CONFIANCAS.map((valor) => ({ valor, texto: NOMES_CONFIANCA[valor], tecla: String(valor) }))}
				valor={props.valor}
				mudar={props.mudar}
				{...(props.desligado ? { desligado: true } : {})}
			/>
		</div>
	);
}
