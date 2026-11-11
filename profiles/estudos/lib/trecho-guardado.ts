// O que "Guardar na nota" escreve na nota (parte C1; docs/mesa-parte-c.md, seção 5). Puro
// e sem Node. Contrato escrito no WP0; a implementação é do WP1. A parte D usa o mesmo
// formato para as notas do professor (a marca "do professor" entra lá).
//
// O formato: uma citação em markdown com o texto do bloco, a linha de fonte e o id curto
// da conversa num comentário HTML, legível fora do app:
//
//     > texto do bloco
//     >
//     > — Professor, conversa de 11/11/2026
//     <!-- conversa:abc123 -->

export interface EntradaTrechoGuardado {
	/** O markdown do bloco como o professor escreveu. */
	texto: string;
	/** Quando o Breno clicou. */
	em: Date;
	/** O id da sessão do pi da conversa. */
	sessao: string;
}

/** O id curto da conversa (os primeiros caracteres úteis do id da sessão). */
export function idCurtoDaConversa(_sessao: string): string {
	throw new Error("idCurtoDaConversa: o WP1 implementa");
}

/** O markdown que entra na nota, sem linhas em branco nas pontas. */
export function formatarTrechoGuardado(_entrada: EntradaTrechoGuardado): string {
	throw new Error("formatarTrechoGuardado: o WP1 implementa");
}
