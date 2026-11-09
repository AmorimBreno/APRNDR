// As abas da mesa de estudo (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md,
// 2.2): as notas e lições abertas de uma matéria, lembradas por matéria. Puro
// e sem React; a gravação no localStorage e a faixa das abas ficam no WP5b.
//
// Uma aba é identificada pela chave: a rota da nota, ou a rota do módulo sem
// a lição (andar de lição em lição fica na mesma aba). O caminho guarda a rota
// de agora, para voltar à mesma lição.

export type TipoAbaMesa = "nota" | "licao";

export interface AbaMesa {
	/** chaveDaAba(caminho). */
	chave: string;
	/** A rota de agora (subtela do perfil, sem barras nas pontas). */
	caminho: string;
	tipo: TipoAbaMesa;
	rotulo: string;
	/** A rolagem guardada da área da aba, em px. */
	rolagem?: number;
}

/** Quantas abas ficam abertas por matéria. Abrir mais uma fecha a mais antiga. */
export const LIMITE_ABAS_MESA = 6;

/**
 * O tipo e a chave de uma rota que vira aba, ou undefined para as outras
 * rotas do caderno (painel, materiais, mapa, curso, guia):
 * - caderno/<m>/notas/<título> (o título pode ter barras): nota, chave = a rota;
 * - caderno/<m>/cursos/<c>/modulos/<mód>[/<lição>]: lição, chave = a rota sem a lição.
 */
export function abaDoCaminho(caminho: string): { tipo: TipoAbaMesa; chave: string } | undefined {
	const partes = caminho.split("/");
	if (partes[0] !== "caderno" || !partes[1]) return undefined;
	if (partes[2] === "notas" && partes.length > 3 && partes.slice(3).every(Boolean)) return { tipo: "nota", chave: caminho };
	if (partes[2] === "cursos" && partes[3] && partes[4] === "modulos" && partes[5] && partes.length <= 7) {
		return { tipo: "licao", chave: partes.slice(0, 6).join("/") };
	}
	return undefined;
}

/**
 * Abre a aba (ou atualiza a que tem a mesma chave: caminho e rótulo novos,
 * mesma posição, rolagem mantida). Uma aba nova entra no fim; passando de
 * LIMITE_ABAS_MESA, sai a primeira (a mais antiga), que nunca é a nova.
 */
export function abrirAba(abas: readonly AbaMesa[], nova: AbaMesa): AbaMesa[] {
	const indice = abas.findIndex((aba) => aba.chave === nova.chave);
	if (indice >= 0) {
		const atual = abas[indice] as AbaMesa;
		const atualizada: AbaMesa = { ...nova, ...(nova.rolagem === undefined && atual.rolagem !== undefined ? { rolagem: atual.rolagem } : {}) };
		return abas.map((aba, i) => (i === indice ? atualizada : aba));
	}
	const juntas = [...abas, nova];
	return juntas.length > LIMITE_ABAS_MESA ? juntas.slice(juntas.length - LIMITE_ABAS_MESA) : juntas;
}

/**
 * Fecha a aba da chave. Se era a ativa, devolve em `ativar` o caminho da que
 * fica ativa: a da direita, senão a da esquerda; sem nenhuma, undefined (a
 * mesa volta para o painel do caderno).
 */
export function fecharAba(abas: readonly AbaMesa[], chave: string, chaveAtiva?: string): { abas: AbaMesa[]; ativar?: string } {
	const indice = abas.findIndex((aba) => aba.chave === chave);
	if (indice < 0) return { abas: [...abas] };
	const restantes = abas.filter((_, i) => i !== indice);
	if (chave !== chaveAtiva) return { abas: restantes };
	const proxima = restantes[indice] ?? restantes[indice - 1];
	return proxima ? { abas: restantes, ativar: proxima.caminho } : { abas: restantes };
}

/** Guarda a rolagem da aba da chave. */
export function guardarRolagem(abas: readonly AbaMesa[], chave: string, rolagem: number): AbaMesa[] {
	return abas.map((aba) => (aba.chave === chave ? { ...aba, rolagem } : aba));
}
