// A faixa fina no topo da nota de um plano de estudos (docs/planos-de-estudo.md, seção 7): o progresso ao vivo e as
// conversas do histórico (o clique abre a conversa, como o link `conversa:`).
//
// Padrões de interface (docs/padroes-de-interface.md): a faixa tem altura fixa (28 px) em todos os estados, o progresso
// muda só o texto e a largura da barra (sem piscar: o texto de antes fica até o novo), as conversas ficam numa linha
// que corta com reticências (nada de rolagem lateral no 375 px), e a barra anima só 150 ms, parada com movimento reduzido.

import { type DadosDaFaixa, textoDaFaixa } from "./plano-faixa.ts";

export interface PropsFaixaDoPlano {
	faixa: DadosDaFaixa;
	abrirConversa?(idCurto: string): void;
}

export function FaixaDoPlano({ faixa, abrirConversa }: PropsFaixaDoPlano) {
	const fracao = faixa.total > 0 ? faixa.feitos / faixa.total : 0;
	return (
		<div className="faixa-plano" role="group" aria-label="Plano de estudos" data-concluido={faixa.concluido || undefined}>
			<span className="faixa-plano__progresso data" aria-live="polite">
				{`Plano · ${textoDaFaixa(faixa)}`}
			</span>
			<span className="faixa-plano__trilho" role="progressbar" aria-valuemin={0} aria-valuemax={faixa.total} aria-valuenow={faixa.feitos} aria-label="Itens feitos">
				<span className="faixa-plano__barra" style={{ transform: `scaleX(${fracao})` }} />
			</span>
			<span className="faixa-plano__conversas">
				{faixa.conversas.length > 0 ? (
					<>
						<span className="faixa-plano__rotulo overline">Conversas</span>
						{faixa.conversas.map((conversa) => (
							<button key={conversa.id} type="button" className="faixa-plano__conversa data" title="Abrir a conversa" onClick={() => abrirConversa?.(conversa.id)}>
								{conversa.rotulo}
							</button>
						))}
					</>
				) : null}
			</span>
		</div>
	);
}
