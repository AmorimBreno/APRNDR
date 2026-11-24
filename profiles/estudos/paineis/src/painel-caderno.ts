// As partes puras do painel do caderno (TelaCaderno.tsx): as três tags da lista
// de baixo (Notas, Materiais e Mapa de conteúdo), qual tag cada rota abre, a
// rota de cada tag, para onde as setas do teclado levam no seletor e quanto da
// janela do painel sobra para o bloco de baixo (tarefas e calendário).

import type { IconName } from "@estudos/design-system";

/**
 * Os cursos e os módulos na interface (ESPECIFICACAO 13.21: pausados desde 2026-11-24). Desligada, o caderno não mostra
 * a faixa dos cursos, as rotas do guia, do curso e do módulo abrem as Notas, a mesa só abre notas e a tela de cadernos
 * não tem a tecla Escrita. O código e os dados ficam; para voltar, ligue esta chave, devolva extensions/cursos.ts e
 * extensions/modulos.ts ao profile.json e acrescente ler_curso e ler_modulo ao tools de agents/professor.md.
 */
export const CURSOS_NA_INTERFACE: boolean = false;

export type TagCaderno = "notas" | "materiais" | "mapa";

export interface InfoTag {
	id: TagCaderno;
	nome: string;
	icone: IconName;
}

/** As tags do seletor, na ordem em que aparecem (a primeira é a que abre sem tag na rota). */
export const TAGS_DO_CADERNO: readonly InfoTag[] = [
	{ id: "notas", nome: "Notas", icone: "book" },
	{ id: "materiais", nome: "Materiais", icone: "paperclip" },
	{ id: "mapa", nome: "Mapa de conteúdo", icone: "bulb" },
];

/**
 * A tag que a rota abre. Sem seção, ou com uma que não é tag (as rotas antigas
 * "linha-do-tempo" e "cursos", que agora têm faixa própria no painel, e ids que
 * nunca existiram, como "aulas"), vale Notas.
 */
export function tagDaRota(secao?: string): TagCaderno {
	return TAGS_DO_CADERNO.find((tag) => tag.id === secao)?.id ?? "notas";
}

/** A rota de uma tag. Notas também leva a caderno/<matéria>/notas (e não à rota sem tag), para o F5 e o histórico dizerem sempre a mesma coisa. */
export function rotaDaTag(materiaId: string, tag: TagCaderno): string {
	return `caderno/${materiaId}/${tag}`;
}

/**
 * Para onde a tecla leva numa lista de abas (setas, com volta ao redor, Home e End); undefined para as outras teclas.
 * Serve ao seletor de tags e às abas da agenda (SeletorAbas em SeletorTags.tsx).
 */
export function abaVizinha<Id extends string>(ids: readonly Id[], atual: Id, tecla: string): Id | undefined {
	const posicao = ids.indexOf(atual);
	switch (tecla) {
		case "ArrowRight":
		case "ArrowDown":
			return ids[(posicao + 1) % ids.length];
		case "ArrowLeft":
		case "ArrowUp":
			return ids[(posicao - 1 + ids.length) % ids.length];
		case "Home":
			return ids[0];
		case "End":
			return ids[ids.length - 1];
		default:
			return undefined;
	}
}

/** Para onde a tecla leva no seletor de tags (setas, com volta ao redor, Home e End); undefined para as outras teclas. */
export const tagVizinha = (atual: TagCaderno, tecla: string): TagCaderno | undefined =>
	abaVizinha(
		TAGS_DO_CADERNO.map((tag) => tag.id),
		atual,
		tecla,
	);

/** As medidas que o bloco de baixo do painel precisa para saber quanto da janela do painel sobra para ele. */
export interface MedidasDoPainel {
	/** A altura visível do painel (clientHeight). */
	alturaDoPainel: number;
	/** A borda de cima do painel na janela (getBoundingClientRect().top). */
	topoDoPainel: number;
	/** A borda de cima do bloco de baixo na janela. */
	topoDoBloco: number;
	/** Quanto o painel já rolou (scrollTop). */
	rolagem: number;
}

/**
 * Quanto da janela do painel sobra para o bloco de baixo quando o painel está no topo: a altura visível menos o
 * que vem acima do bloco (a faixa dos cursos e o espaço entre eles). É a altura dos cartões de tarefas e do
 * calendário (BaixoDoCaderno.tsx); a rolagem entra na conta para o resultado não depender de onde o painel está.
 */
export function restoDoPainel(medidas: MedidasDoPainel): number {
	const acima = medidas.topoDoBloco - medidas.topoDoPainel + medidas.rolagem;
	return Math.max(Math.round(medidas.alturaDoPainel - acima), 0);
}
