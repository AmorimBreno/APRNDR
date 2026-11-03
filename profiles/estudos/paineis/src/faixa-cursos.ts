// As partes puras da faixa de cursos do painel do caderno (FaixaCursos.tsx):
// qual card fica em destaque, o número e o tom de cada um, e os textos que vão
// no card: o rótulo e o selo do alto, o prazo (ou a última edição) do pé.

import { type IconName, pad2, type Tone } from "@estudos/design-system";
import { type ResumoCurso, nomeDaEtapa } from "../../lib/curso-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import { rotuloCurso, textoEditado, textoPrazo } from "./guia-curso.ts";

/** O que um card da faixa mostra, já calculado. */
export interface CardCurso {
	curso: ResumoCurso;
	/** "01", "02"… pela posição na lista. */
	numero: string;
	/** É o curso em andamento (o primeiro pronto): ganha o tom da matéria. */
	destaque: boolean;
	/** O tom chapado do card (a versão pastel dessa cor, com a tinta escura dela por cima). */
	tom: Tone;
	/** O ícone do chip redondo: bandeira para o pronto, arquivo para o rascunho. */
	icone: IconName;
	/** O rótulo ao lado do chip: "Curso 01" ou "Rascunho". */
	categoria: string;
	/** O selo do canto de cima: "12 módulos" (pronto) ou "parou em Diagnóstico" (rascunho). */
	selo: string;
	/** "P1 em 20/11", "20/11" ou "sem prazo". */
	prazo: string;
	/** O pé do card: "Prazo: P1 em 20/11" ou, sem prazo, "editado há 2 dias". */
	rodape: string;
	/** O que o leitor de tela diz do card, na ordem do olhar: número, nome, etiqueta e prazo. */
	descricao: string;
}

/** Os tons que se alternam nos cards, na ordem: rosa, areia, lilás-acinzentado, menta, musgo, âmbar. */
export const TONS_DOS_CARDS: readonly Tone[] = ["brick", "cream", "steel", "sage", "moss", "amber"];

/**
 * Qual curso fica em destaque: o primeiro pronto (o que está em andamento).
 * Sem nenhum pronto, nenhum: um rascunho ainda não é um curso para estudar.
 */
export function indiceEmDestaque(lista: readonly Pick<ResumoCurso, "situacao">[]): number | undefined {
	const indice = lista.findIndex((curso) => curso.situacao === "pronto");
	return indice >= 0 ? indice : undefined;
}

/** O selo do alto: quantos módulos tem o pronto, ou a etapa em que o rascunho parou. */
export function textoSelo(curso: Pick<ResumoCurso, "situacao" | "etapa">, modulos?: number): string {
	if (curso.situacao !== "pronto") return `parou em ${nomeDaEtapa(curso.etapa)}`;
	if (modulos === undefined) return "Pronto";
	return `${modulos} ${modulos === 1 ? "módulo" : "módulos"}`;
}

/**
 * Os cards da faixa, na ordem da lista. O destaque fica no tom da matéria; os outros
 * alternam os tons de TONS_DOS_CARDS sem repetir o da matéria, para dois vizinhos
 * nunca terem a mesma cor.
 */
export function cardsDosCursos(
	lista: readonly ResumoCurso[],
	materia: Pick<Materia, "provas"> | undefined,
	tomDaMateria: Tone = "amber",
	agora: Date = new Date(),
): CardCurso[] {
	const emDestaque = indiceEmDestaque(lista);
	const tons = TONS_DOS_CARDS.filter((tom) => tom !== tomDaMateria);
	return lista.map((curso, indice) => {
		const numero = pad2(indice + 1);
		const pronto = curso.situacao === "pronto";
		const destaque = indice === emDestaque;
		const prazo = textoPrazo(curso.prazo, materia);
		return {
			curso,
			numero,
			destaque,
			tom: destaque ? tomDaMateria : (tons[indice % tons.length] ?? tomDaMateria),
			icone: pronto ? "flag" : "file",
			categoria: pronto ? `Curso ${numero}` : "Rascunho",
			selo: textoSelo(curso, curso.modulos),
			prazo,
			rodape: curso.prazo ? `Prazo: ${prazo}` : textoEditado(curso.alteradoEm, agora),
			descricao: `${numero}, ${curso.nome}. ${rotuloCurso(curso, curso.modulos).texto}. ${prazo}.`,
		};
	});
}

/** A contagem do cabeçalho: "1 curso", "3 cursos"; vazia quando não há nenhum (a faixa já diz isso). */
export function textoContagem(quantos: number): string {
	if (quantos <= 0) return "";
	return `${quantos} ${quantos === 1 ? "curso" : "cursos"}`;
}
