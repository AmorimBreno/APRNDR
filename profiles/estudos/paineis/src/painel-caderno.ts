// As partes puras do painel do caderno (TelaCaderno.tsx): as três tags da lista
// de baixo (Notas, Materiais e Mapa de conteúdo), qual tag cada rota abre, a
// rota de cada tag e para onde as setas do teclado levam no seletor.

import type { IconName } from "@estudos/design-system";

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
