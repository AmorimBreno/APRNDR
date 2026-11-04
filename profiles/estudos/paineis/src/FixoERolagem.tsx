// A divisão de uma seção do caderno (Notas, Materiais, Mapa de conteúdo) em
// duas partes: as de controle e de entrada em cima, sempre à vista (o
// formulário da nota nova, a área de soltar, a barra do mapa com os botões), e
// a lista embaixo, que é a única que rola. O contêiner que rola é um
// motion.div com layoutScroll: o arrasto do mapa (Reorder) mede as posições
// por ele. Fora do caderno (o modal de materiais, por exemplo) `dividir` fica
// desligado e as duas partes saem uma depois da outra, na mesma div de sempre.

import { motion } from "motion/react";
import type { ReactNode } from "react";

export interface PropsFixoERolagem {
	/** A classe da seção ("notas", "materiais" ou "mapa"). */
	classe: string;
	/** Liga a divisão. Desligada, `fixo` e `children` ficam juntos, na mesma div. */
	dividir?: boolean;
	/** A parte de controle e de entrada, fixa no topo. null = não tem (só a lista). */
	fixo: ReactNode;
	/** A lista, que rola por baixo da parte fixa. */
	children: ReactNode;
}

export function FixoERolagem({ classe, dividir = false, fixo, children }: PropsFixoERolagem) {
	if (!dividir) {
		return (
			<div className={classe}>
				{fixo}
				{children}
			</div>
		);
	}
	return (
		<div className={`${classe} painel-caderno__secao`}>
			{fixo ? <div className="painel-caderno__fixo">{fixo}</div> : null}
			<motion.div layoutScroll className="painel-caderno__rolagem">
				{children}
			</motion.div>
		</div>
	);
}
