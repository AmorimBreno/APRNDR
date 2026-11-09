// Quando a mesa de estudo troca a sessão da janela para a conversa da matéria
// (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md, 2.3). Puro e sem React; a
// TelaEstudos (WP4) chama decidirSessao a cada mudança e faz o que ela diz.
//
// A regra:
// - só a entrada no caderno (a matéria da rota mudou, ou o hook caiu numa
//   sessão nova ao reconectar) troca a sessão;
// - a entrada espera enquanto a conversa aberta responde, tem pedido
//   pendente ou a conexão não está pronta;
// - fora da entrada, a mesa nunca troca sozinha: se a sessão aberta não é da
//   matéria (outra aba do navegador trocou), ela avisa. Isso impede duas
//   abas de trocarem a sessão uma da outra em laço.

export interface SituacaoMesa {
	/** A matéria do caderno aberto. */
	materiaId: string;
	/** A entrada ainda não foi atendida (a TelaEstudos marca ao mudar de matéria e desmarca ao trocar ou ao achar a sessão certa). */
	entrada: boolean;
	/** contexto.chave da sessão aberta; undefined = sem contexto (a conversa geral). */
	chaveSessao?: string;
	executando: boolean;
	pedidoPendente: boolean;
	/** A conexão não está aberta, ou a janela está carregando ou trocando de sessão. */
	carregando: boolean;
}

export type DecisaoSessao =
	/** A sessão aberta já é da matéria (ou não há o que fazer). */
	| { acao: "nada" }
	/** A entrada fica pendente; decidir de novo quando a situação mudar. */
	| { acao: "esperar"; motivo: "carregando" | "respondendo" }
	/** Abrir a conversa mais recente da matéria (ou criar uma com o contexto dela). */
	| { acao: "abrir" }
	/** A sessão mudou fora da entrada: mostrar "A conversa mudou em outra aba" com "Voltar para <matéria>". */
	| { acao: "avisar_outra_aba" };

/** A chave do contexto de sessão de uma matéria (a mesma de contextoDaMateria, em comum.ts). */
export function chaveDaMateria(materiaId: string): string {
	return `materia:${materiaId}`;
}

export function decidirSessao(situacao: SituacaoMesa): DecisaoSessao {
	if (situacao.chaveSessao === chaveDaMateria(situacao.materiaId)) return { acao: "nada" };
	if (!situacao.entrada) return situacao.carregando ? { acao: "nada" } : { acao: "avisar_outra_aba" };
	if (situacao.carregando) return { acao: "esperar", motivo: "carregando" };
	if (situacao.executando || situacao.pedidoPendente) return { acao: "esperar", motivo: "respondendo" };
	return { acao: "abrir" };
}
