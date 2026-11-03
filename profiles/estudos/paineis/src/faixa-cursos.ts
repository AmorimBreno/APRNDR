// As partes puras da faixa de cursos do painel do caderno (FaixaCursos.tsx):
// qual card fica em destaque, o número de cada um, e o texto da etiqueta e do
// prazo que vão juntos no pé do card.

import { pad2 } from "@estudos/design-system";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import { rotuloCurso, textoPrazo } from "./guia-curso.ts";

/** O que um card da faixa mostra, já calculado. */
export interface CardCurso {
	curso: ResumoCurso;
	/** "01", "02"… pela posição na lista. */
	numero: string;
	/** Fica na cor da matéria. */
	destaque: boolean;
	/** A etiqueta do pé: "Rascunho · parou em Mapa" (âmbar) ou "Pronto · 6 módulos" (sálvia). */
	rotulo: { texto: string; tom: "amber" | "sage" };
	/** "P1 em 20/11", "20/11" ou "sem prazo". */
	prazo: string;
	/** O que o leitor de tela diz do card, na ordem do olhar: número, nome, etiqueta e prazo. */
	descricao: string;
}

/**
 * Qual curso fica em destaque: o primeiro pronto (o que está em andamento).
 * Sem nenhum pronto, nenhum: um rascunho ainda não é um curso para estudar.
 */
export function indiceEmDestaque(lista: readonly Pick<ResumoCurso, "situacao">[]): number | undefined {
	const indice = lista.findIndex((curso) => curso.situacao === "pronto");
	return indice >= 0 ? indice : undefined;
}

/** Os cards da faixa, na ordem da lista. */
export function cardsDosCursos(lista: readonly ResumoCurso[], materia: Pick<Materia, "provas"> | undefined): CardCurso[] {
	const emDestaque = indiceEmDestaque(lista);
	return lista.map((curso, indice) => {
		const numero = pad2(indice + 1);
		const rotulo = rotuloCurso(curso, curso.modulos);
		const prazo = textoPrazo(curso.prazo, materia);
		return { curso, numero, destaque: indice === emDestaque, rotulo, prazo, descricao: `${numero}, ${curso.nome}. ${rotulo.texto}. ${prazo}.` };
	});
}

/** A contagem do cabeçalho: "1 curso", "3 cursos"; vazia quando não há nenhum (a faixa já diz isso). */
export function textoContagem(quantos: number): string {
	if (quantos <= 0) return "";
	return `${quantos} ${quantos === 1 ? "curso" : "cursos"}`;
}
