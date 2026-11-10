// O rótulo de um botão que tem um estado passageiro ("Salvando…", "Enviando…", "Abrindo…"), pelas regras 1 e 5 de
// docs/padroes-de-interface.md: o estado só aparece depois de 1 s (useValorEstavel; até lá fica o rótulo de repouso) e
// o botão não muda de largura, porque os dois textos ocupam o mesmo lugar e a largura é a do maior.

import { useValorEstavel } from "@estudos/ui";

export function RotuloEstado(props: {
	/** O estado passageiro está valendo (o pedido em andamento). */
	ocupado: boolean;
	/** O rótulo de sempre ("Enviar"). */
	repouso: string;
	/** O rótulo do estado passageiro ("Enviando…"). */
	passageiro: string;
}) {
	const mostrando = useValorEstavel(props.ocupado, props.ocupado, false) && props.ocupado;
	return (
		<span className="rotulo-estado">
			<span className="rotulo-estado__texto" aria-hidden={mostrando || undefined} data-oculto={mostrando || undefined}>
				{props.repouso}
			</span>
			<span className="rotulo-estado__texto" aria-hidden={!mostrando || undefined} data-oculto={!mostrando || undefined}>
				{props.passageiro}
			</span>
		</span>
	);
}
