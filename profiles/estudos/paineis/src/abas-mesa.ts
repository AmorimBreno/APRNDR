// As abas da mesa de estudo (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md,
// 2.2): as notas e lições abertas de uma matéria, lembradas por matéria. Puro
// e sem React; a gravação no localStorage e a faixa das abas ficam no WP5b.
//
// Uma aba é identificada pela chave: a rota da nota, ou a rota do módulo sem
// a lição (andar de lição em lição fica na mesma aba). O caminho guarda a rota
// de agora, para voltar à mesma lição.

import { rotaDaOrigem } from "./origem-mesa.ts";

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
	/**
	 * A vaga de prévia (docs/mesa-parte-c.md, seção 4; decisão D1): a aba que o professor
	 * abriu e o Breno ainda não tocou. Há no máximo uma; o professor a reaproveita, e ela
	 * vira uma aba comum (fixa) quando o Breno interage com ela.
	 */
	previa?: boolean;
}

/** Quantas abas ficam abertas por matéria. Abrir mais uma fecha a mais antiga. */
export const LIMITE_ABAS_MESA = 6;

/**
 * O tipo e a chave de uma rota que vira aba, ou undefined para as outras
 * rotas do caderno (painel, materiais, mapa, curso, guia):
 * - caderno/<m>/notas/<título> (o título pode ter barras): nota, chave = a rota;
 * - caderno/<m>/cursos/<c>/modulos/<mód>[/<lição>]: lição, chave = a rota sem a lição.
 */
export function abaDoCaminho(origem: string): { tipo: TipoAbaMesa; chave: string } | undefined {
	// A âncora de uma origem (depois do "?", origem-mesa.ts) não faz parte da chave da aba.
	const caminho = rotaDaOrigem(origem);
	const partes = caminho.split("/");
	if (partes[0] !== "caderno" || !partes[1]) return undefined;
	if (partes[2] === "notas" && partes.length > 3 && partes.slice(3).every(Boolean)) return { tipo: "nota", chave: caminho };
	if (partes[2] === "cursos" && partes[3] && partes[4] === "modulos" && partes[5] && partes.length <= 7) {
		return { tipo: "licao", chave: partes.slice(0, 6).join("/") };
	}
	return undefined;
}

/** Passando do limite, tira primeiro a prévia e depois as mais antigas, nunca as chaves protegidas. */
function caberNoLimite(abas: AbaMesa[], protegidas: ReadonlySet<string>): AbaMesa[] {
	let resultado = abas;
	while (resultado.length > LIMITE_ABAS_MESA) {
		const sair = resultado.find((aba) => aba.previa && !protegidas.has(aba.chave)) ?? resultado.find((aba) => !protegidas.has(aba.chave));
		if (!sair) break;
		resultado = resultado.filter((aba) => aba !== sair);
	}
	return resultado;
}

/**
 * Abre a aba (ou atualiza a que tem a mesma chave: caminho e rótulo novos,
 * mesma posição, rolagem e prévia mantidas). Uma aba nova entra no fim; passando
 * de LIMITE_ABAS_MESA, sai a prévia (se houver e não for a nova) e, senão, a
 * primeira (a mais antiga), que nunca é a nova.
 */
export function abrirAba(abas: readonly AbaMesa[], nova: AbaMesa): AbaMesa[] {
	const indice = abas.findIndex((aba) => aba.chave === nova.chave);
	if (indice >= 0) {
		const atual = abas[indice] as AbaMesa;
		const atualizada: AbaMesa = {
			...nova,
			...(nova.rolagem === undefined && atual.rolagem !== undefined ? { rolagem: atual.rolagem } : {}),
			...(nova.previa === undefined && atual.previa ? { previa: true } : {}),
		};
		return abas.map((aba, i) => (i === indice ? atualizada : aba));
	}
	return caberNoLimite([...abas, nova], new Set([nova.chave]));
}

/**
 * Abre uma aba na vaga de prévia (o comando "abrir" do professor). Se a aba já
 * está aberta, nada muda (uma aba do Breno continua dele). Senão, a prévia
 * anterior sai e a nova entra no lugar dela (ou no fim, sem prévia anterior);
 * passando do limite, sai a mais antiga do Breno. `protegida` (a aba em foco,
 * quando a prévia não vai tomar o foco) nunca sai: se for a prévia anterior, ela
 * vira fixa em vez de sair.
 */
export function abrirPrevia(abas: readonly AbaMesa[], nova: Omit<AbaMesa, "previa">, protegida?: string): AbaMesa[] {
	if (abas.some((aba) => aba.chave === nova.chave)) return [...abas];
	const previa: AbaMesa = { ...nova, previa: true };
	const indiceAnterior = abas.findIndex((aba) => aba.previa);
	const anterior = abas[indiceAnterior];
	let resultado: AbaMesa[];
	if (anterior && anterior.chave !== protegida) resultado = abas.map((aba, i) => (i === indiceAnterior ? previa : aba));
	else resultado = [...abas.map((aba) => (aba.previa ? fixar(aba) : aba)), previa];
	return caberNoLimite(resultado, new Set([nova.chave, ...(protegida ? [protegida] : [])]));
}

function fixar(aba: AbaMesa): AbaMesa {
	const { previa: _previa, ...fixa } = aba;
	return fixa;
}

/** A aba da chave deixa de ser prévia (o Breno interagiu com ela). Sem mudança, devolve a mesma lista. */
export function fixarAba(abas: AbaMesa[], chave: string): AbaMesa[] {
	return abas.some((aba) => aba.chave === chave && aba.previa) ? abas.map((aba) => (aba.chave === chave ? fixar(aba) : aba)) : abas;
}

/** Muda a rota guardada de uma aba (a prévia que o professor reaproveita para outra lição do mesmo módulo). */
export function mudarCaminho(abas: readonly AbaMesa[], chave: string, caminho: string): AbaMesa[] {
	return abas.map((aba) => (aba.chave === chave && aba.caminho !== caminho ? { ...aba, caminho } : aba));
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
