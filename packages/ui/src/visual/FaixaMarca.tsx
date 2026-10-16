// Faixa escura à esquerda das telas de fora do perfil (menu-rail do design
// system): o nome do app, uma linha de onde estou, o ornamento e um pé livre.

import { Ornament, type OrnamentGlyph, Wordmark } from "@estudos/design-system";
import type { ReactNode } from "react";

export interface PropsFaixaMarca {
	/** Linha de onde estou, abaixo do nome (overline). */
	legenda: ReactNode;
	/** Um ornamento por tela (design-system/README.md, Ornamento). */
	glifo: OrnamentGlyph;
	children?: ReactNode;
}

export function FaixaMarca({ legenda, glifo, children }: PropsFaixaMarca) {
	return (
		<aside className="faixa">
			<div className="faixa__topo">
				<Wordmark size={40} />
				<span className="overline">{legenda}</span>
			</div>
			<Ornament glyph={glifo} className="faixa__ornamento" />
			<div className="faixa__pe">{children}</div>
		</aside>
	);
}
