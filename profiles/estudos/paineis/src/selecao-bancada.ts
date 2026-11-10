// Quais abas da bancada estão selecionadas, isto é, vão com o conteúdo para o
// professor (docs/mesa-de-estudo.md, 5b). Puro e sem React.
//
// Padrão: a aba em foco selecionada, as outras não. Um clique numa pill é uma
// escolha manual: inverte a seleção daquela aba. As escolhas valem enquanto a
// aba em foco for a mesma; quando o foco muda, somem e volta o padrão. Uma aba
// fechada também some das escolhas.

export interface EscolhasBancada {
	/** A aba em foco quando as escolhas foram feitas; se o foco de agora for outro, elas não valem mais. */
	foco: string | undefined;
	/** As chaves cuja seleção foi invertida em relação ao padrão. */
	invertidas: readonly string[];
}

export const SEM_ESCOLHAS: EscolhasBancada = { foco: undefined, invertidas: [] };

/** As escolhas que ainda valem: nenhuma se o foco mudou; sem as abas que já não existem. */
export function escolhasVigentes(escolhas: EscolhasBancada, chaves: readonly string[], chaveFoco: string | undefined): EscolhasBancada {
	if (escolhas.foco !== chaveFoco) return { foco: chaveFoco, invertidas: [] };
	const existentes = escolhas.invertidas.filter((chave) => chaves.includes(chave));
	return existentes.length === escolhas.invertidas.length ? escolhas : { foco: chaveFoco, invertidas: existentes };
}

/** As chaves selecionadas, na ordem das abas. */
export function chavesSelecionadas(chaves: readonly string[], chaveFoco: string | undefined, escolhas: EscolhasBancada): string[] {
	const { invertidas } = escolhasVigentes(escolhas, chaves, chaveFoco);
	return chaves.filter((chave) => (chave === chaveFoco) !== invertidas.includes(chave));
}

/** O clique numa pill: inverte a seleção daquela aba (a abas desconhecidas não mudam nada). */
export function alternarEscolha(escolhas: EscolhasBancada, chaves: readonly string[], chaveFoco: string | undefined, chave: string): EscolhasBancada {
	const vigentes = escolhasVigentes(escolhas, chaves, chaveFoco);
	if (!chaves.includes(chave)) return vigentes;
	const invertidas = vigentes.invertidas.includes(chave) ? vigentes.invertidas.filter((outra) => outra !== chave) : [...vigentes.invertidas, chave];
	return { foco: chaveFoco, invertidas };
}
