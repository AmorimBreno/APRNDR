// A tag "plano de estudos · 2 de 5" nos itens da lista de notas que têm a marca de plano (docs/planos-de-estudo.md,
// seção 7; a lista traz `plano: {feitos, total}`). Do mesmo estilo e do mesmo tamanho da tag "do professor"
// (mesa.css, .tag-professor): uma linha, sem quebrar, que não muda a altura do item.

import type { ProgressoPlano } from "../../lib/plano-tipos.ts";

export const textoDaTagDoPlano = (plano: ProgressoPlano) => `plano de estudos · ${plano.feitos} de ${plano.total}`;

export function TagDoPlano({ plano }: { plano: ProgressoPlano }) {
	return (
		<span className="tag-professor tag-plano overline" title="Plano de estudos">
			{textoDaTagDoPlano(plano)}
		</span>
	);
}
