// A barra de título do app, só na janela própria (apps/desktop). O Windows
// desenha os botões de minimizar, maximizar e fechar por cima do canto direito;
// o resto é área de arrastar a janela (o duplo clique maximiza). Não tem estado
// nem nada que mude de tamanho (docs/padroes-de-interface.md).

import { Wordmark } from "@estudos/design-system";
import type { ReactNode } from "react";
import type { AmbienteDesktop } from "./desktop.ts";

export function BarraDoApp() {
	return (
		<div className="barra-app">
			<Wordmark size={13} />
		</div>
	);
}

/**
 * No navegador comum devolve só o conteúdo, sem nenhum elemento a mais. Na
 * janela própria, empilha a barra e o conteúdo, que ocupa o resto da altura.
 */
export function CascaDoApp({ desktop, children }: { desktop: AmbienteDesktop | undefined; children: ReactNode }) {
	if (!desktop) return <>{children}</>;
	return (
		<div className="casca-app">
			<BarraDoApp />
			<div className="casca-app__conteudo">{children}</div>
		</div>
	);
}
