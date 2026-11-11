// A porta única para a mesa navegar (parte C1; docs/mesa-parte-c.md, seção 4): serve aos
// comandos do professor e ao "Ir ao trecho" da resposta. Só tipos no WP0; a mesa
// (MesaEstudo.tsx) a implementa e a expõe por um contexto do React no WP2.

/** Para onde ir. */
export interface AlvoIrPara {
	/** A origem da aba, com ou sem âncora (origem-mesa.ts). */
	origem: string;
	/** O texto a achar (a seleção da pergunta, ou o trecho do professor). Sem ele, usa o contexto da âncora. */
	trecho?: string;
	/** Só rolar até o trecho, sem marcar (títulos de seção). */
	soRolar?: boolean;
	/**
	 * "usuario": o clique do Breno, que leva à aba na hora. "previa": o professor pediu;
	 * a aba abre na vaga de prévia e só vira o foco se o Breno não estiver editando.
	 */
	quem: "usuario" | "previa";
}

export interface ValorMesa {
	irPara(alvo: AlvoIrPara): void;
}
