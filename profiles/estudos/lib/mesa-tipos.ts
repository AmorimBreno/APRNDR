// Os comandos que o professor manda para a mesa de estudo (parte C1; docs/mesa-parte-c.md,
// seção 2). Sem nada do Node: a extensão (extensions/mesa.ts) emite os comandos e a
// tela (paineis/src) os consome.
//
// Os comandos vão pela ponte com `interface:mostrar` e gravar: false: a extensão
// confere tudo no disco antes de emitir, a tela tenta e, se falhar, só avisa. Nunca
// são gravados na sessão, para reabrir a conversa não repetir nenhum.

/** O painel da ponte de eventos (docs/ponte-de-eventos.md); só da mesa, fora da área de painéis. */
export const PAINEL_MESA = "mesa";

/** A ação única que a extensão manda à tela neste painel. */
export const ACAO_COMANDO_MESA = "comando";

export type TipoAlvoMesa = "nota" | "licao";

/** Abrir uma aba. O professor só pode pedir "previa"; a tela decide se vira foco (docs/mesa-parte-c.md, seção 4). */
export interface ComandoAbrirMesa {
	cmd: "abrir";
	tipo: TipoAlvoMesa;
	/** A rota da aba (a mesma de abas-mesa.ts), já conferida pela extensão. */
	caminho: string;
	rotulo: string;
	foco: "previa";
}

/** Destacar um trecho da aba (ou só rolar até ele, para títulos de seção). */
export interface ComandoDestacarMesa {
	cmd: "destacar";
	caminho: string;
	/** O texto a achar, já conferido contra o texto da nota ou da lição. */
	trecho: string;
	soRolar: boolean;
}

export type ComandoMesa = (ComandoAbrirMesa | ComandoDestacarMesa) & {
	/** Único por comando: a tela não executa o mesmo duas vezes. */
	id: string;
};

/** O que a extensão emite no painel "mesa", ação "comando". */
export type DadosComandoMesa = ComandoMesa;

/** Até quantos caracteres tem o trecho de um destaque. */
export const LIMITE_TRECHO_DESTAQUE = 500;
