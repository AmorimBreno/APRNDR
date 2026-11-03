// As partes puras da aba Quadro da agenda (QuadroTarefas.tsx, o kanban): as
// colunas com as tarefas que o filtro de matéria deixa ver, a posição de soltar
// um cartão (do lugar na tela para a posição no quadro inteiro), os vizinhos do
// cartão para as setas do teclado, o menu da coluna e a troca de lugar das
// colunas.
//
// Com o filtro de matéria ligado a tela mostra só as tarefas dela, mas as
// posições do `moverTarefa` (agenda-tipos.ts) são as da coluna inteira e contam
// sem a tarefa que se move. Por isso "o lugar na tela" (o índice entre os cartões
// visíveis, sem o que se arrasta) vira sempre uma posição no quadro inteiro
// antes de ir à ponte (posicaoDeSoltar).

import { type Agenda, type Coluna, moverTarefa, type Tarefa, tarefasDaColuna } from "../../lib/agenda-tipos.ts";

// --- As colunas do quadro ----------------------------------------------------------

export interface ColunaDoQuadro {
	coluna: Coluna;
	/** As tarefas que a tela mostra (as da matéria do filtro), na ordem da coluna. */
	tarefas: Tarefa[];
	/** Quantas tarefas a coluna tem no quadro inteiro (o filtro não conta). */
	total: number;
}

/** As colunas na ordem do quadro, cada uma com as tarefas visíveis. */
export function colunasDoQuadro(agenda: Agenda, materia?: string): ColunaDoQuadro[] {
	return agenda.colunas.map((coluna) => {
		const todas = tarefasDaColuna(agenda, coluna.id);
		return { coluna, tarefas: materia ? todas.filter((tarefa) => tarefa.materia === materia) : todas, total: todas.length };
	});
}

/** A primeira linha da nota, sem os marcadores do markdown e com os espaços juntos; vazio sem nota. */
export function previaDaNota(nota: string | undefined): string {
	const linha = (nota ?? "").split(/\r?\n/).find((item) => item.trim());
	return linha ? linha.trim().replace(/^(?:[#>*-]+\s+|\d+[.)]\s+)/, "").replace(/\s+/g, " ") : "";
}

// --- Soltar um cartão ----------------------------------------------------------------

/**
 * A posição no quadro inteiro para soltar a tarefa `id` na coluna, no lugar `indice`
 * entre os cartões visíveis dela sem a própria tarefa (0 = antes do primeiro).
 * Sem filtro é o próprio índice. Com filtro, é a posição do cartão visível que
 * fica depois do lugar (na coluna inteira, sem a tarefa); depois do último
 * visível, logo depois dele; sem visíveis, no fim.
 */
export function posicaoDeSoltar(agenda: Agenda, id: string, coluna: string, indice: number, materia?: string): number {
	const outras = tarefasDaColuna(agenda, coluna).filter((tarefa) => tarefa.id !== id);
	const visiveis = materia ? outras.filter((tarefa) => tarefa.materia === materia) : outras;
	const lugar = Math.max(0, Math.floor(indice));
	if (lugar < visiveis.length) return outras.indexOf(visiveis[lugar]!);
	const ultima = visiveis.at(-1);
	return ultima ? outras.indexOf(ultima) + 1 : outras.length;
}

/** Soltar a tarefa nesta posição muda alguma coisa? (Soltar no mesmo lugar não muda nada e não precisa ir à ponte.) */
export function mudaAoMover(agenda: Agenda, id: string, coluna: string, posicao: number): boolean {
	try {
		return moverTarefa(agenda, id, coluna, posicao).mudou;
	} catch {
		return false;
	}
}

/**
 * O lugar de soltar numa coluna a partir da altura do ponteiro: o número de cartões
 * (sem o arrastado) cujo centro está acima dele. `centros` são os centros
 * verticais dos cartões, de cima para baixo.
 */
export function indiceDeSoltar(centros: readonly number[], y: number): number {
	let indice = 0;
	while (indice < centros.length && centros[indice]! < y) indice++;
	return indice;
}

/** Uma coluna na tela, para achar a que está sob o ponteiro. */
export interface FaixaDaColuna {
	id: string;
	esquerda: number;
	direita: number;
}

/** A coluna sob a posição horizontal; fora de todas, a mais próxima (o ponteiro pode estar no vão ou além das pontas); undefined sem colunas. */
export function colunaNoPonto(faixas: readonly FaixaDaColuna[], x: number): string | undefined {
	let melhor: FaixaDaColuna | undefined;
	let distancia = Number.POSITIVE_INFINITY;
	for (const faixa of faixas) {
		const longe = x < faixa.esquerda ? faixa.esquerda - x : x > faixa.direita ? x - faixa.direita : 0;
		if (longe < distancia) {
			distancia = longe;
			melhor = faixa;
		}
	}
	return melhor?.id;
}

/** A faixa da borda do quadro, em pixels, em que ele rola durante o arrasto. */
const BORDA_DA_ROLAGEM = 56;
/** Pixels por quadro de animação na beirada (mais para dentro, mais devagar). */
const VELOCIDADE_MAXIMA = 18;

/**
 * Quanto rolar por quadro de animação (negativo = para trás) com o ponteiro em
 * `posicao`, num quadro que vai de `inicio` a `fim` na mesma direção. Zero longe das
 * bordas; cresce até VELOCIDADE_MAXIMA quando o ponteiro chega na beirada ou passa dela.
 */
export function velocidadeDaRolagem(posicao: number, inicio: number, fim: number): number {
	if (posicao < inicio + BORDA_DA_ROLAGEM) return -Math.ceil((VELOCIDADE_MAXIMA * Math.min(BORDA_DA_ROLAGEM, inicio + BORDA_DA_ROLAGEM - posicao)) / BORDA_DA_ROLAGEM);
	if (posicao > fim - BORDA_DA_ROLAGEM) return Math.ceil((VELOCIDADE_MAXIMA * Math.min(BORDA_DA_ROLAGEM, posicao - (fim - BORDA_DA_ROLAGEM))) / BORDA_DA_ROLAGEM);
	return 0;
}

// --- O teclado ----------------------------------------------------------------------------

export type DirecaoDoCartao = "esquerda" | "direita" | "cima" | "baixo";

/** A direção de uma tecla de seta (com Alt); undefined nas outras. */
export function direcaoDaTecla(tecla: string): DirecaoDoCartao | undefined {
	switch (tecla) {
		case "ArrowLeft":
			return "esquerda";
		case "ArrowRight":
			return "direita";
		case "ArrowUp":
			return "cima";
		case "ArrowDown":
			return "baixo";
		default:
			return undefined;
	}
}

/**
 * Para onde a tecla leva o cartão: esquerda e direita, a coluna vizinha (no mesmo
 * lugar da lista visível, ou no fim se a outra for mais curta); cima e baixo, um
 * lugar na própria coluna. `posicao` já é a do quadro inteiro. undefined quando
 * não há para onde ir (na ponta do quadro ou da coluna) ou a tarefa não existe.
 */
export function destinoDoTeclado(agenda: Agenda, id: string, direcao: DirecaoDoCartao, materia?: string): { coluna: string; posicao: number } | undefined {
	const tarefa = agenda.tarefas.find((item) => item.id === id);
	if (!tarefa) return undefined;
	const visiveis = (coluna: string) => tarefasDaColuna(agenda, coluna).filter((item) => !materia || item.materia === materia || item.id === id);
	const aqui = visiveis(tarefa.coluna);
	const indice = aqui.findIndex((item) => item.id === id);
	if (indice < 0) return undefined;
	if (direcao === "cima" || direcao === "baixo") {
		const novo = direcao === "cima" ? indice - 1 : indice + 1;
		if (novo < 0 || novo >= aqui.length) return undefined;
		return { coluna: tarefa.coluna, posicao: posicaoDeSoltar(agenda, id, tarefa.coluna, novo, materia) };
	}
	const colunaAtual = agenda.colunas.findIndex((coluna) => coluna.id === tarefa.coluna);
	const vizinha = agenda.colunas[direcao === "esquerda" ? colunaAtual - 1 : colunaAtual + 1];
	if (!vizinha) return undefined;
	const lugar = Math.min(indice, visiveis(vizinha.id).length);
	return { coluna: vizinha.id, posicao: posicaoDeSoltar(agenda, id, vizinha.id, lugar, materia) };
}

/** O que o leitor de tela ouve depois de mover: "Lista 3 em Fazendo, posição 2 de 4." Calculado como a extensão vai deixar a agenda. */
export function avisoDeMover(agenda: Agenda, id: string, coluna: string, posicao: number): string | undefined {
	try {
		const { agenda: nova, tarefa, para } = moverTarefa(agenda, id, coluna, posicao);
		const naColuna = tarefasDaColuna(nova, para.id);
		return `${tarefa.titulo} em ${para.nome}, posição ${naColuna.findIndex((item) => item.id === id) + 1} de ${naColuna.length}.`;
	} catch {
		return undefined;
	}
}

// --- O menu da coluna ----------------------------------------------------------------------

export type AcaoDaColuna = "renomear" | "feito" | "esquerda" | "direita" | "apagar";

export interface OpcaoDaColuna {
	id: AcaoDaColuna;
	titulo: string;
}

/**
 * O que o menu "…" da coluna oferece: renomear sempre; marcar como feito se ela
 * ainda não é; mover para a esquerda e para a direita se tem para onde; apagar
 * se não é a de feito (marque outra antes) nem a única.
 */
export function acoesDaColuna(agenda: Agenda, id: string): OpcaoDaColuna[] {
	const indice = agenda.colunas.findIndex((coluna) => coluna.id === id);
	const coluna = agenda.colunas[indice];
	if (!coluna) return [];
	const opcoes: OpcaoDaColuna[] = [{ id: "renomear", titulo: "Renomear" }];
	if (!coluna.feito) opcoes.push({ id: "feito", titulo: "Marcar como feito" });
	if (indice > 0) opcoes.push({ id: "esquerda", titulo: "Mover para a esquerda" });
	if (indice < agenda.colunas.length - 1) opcoes.push({ id: "direita", titulo: "Mover para a direita" });
	if (!coluna.feito && agenda.colunas.length > 1) opcoes.push({ id: "apagar", titulo: "Apagar…" });
	return opcoes;
}

/** Os ids das colunas com a coluna `id` um lugar para o lado; undefined se já está na ponta ou não existe. */
export function idsComColunaMovida(colunas: ReadonlyArray<Pick<Coluna, "id">>, id: string, direcao: "esquerda" | "direita"): string[] | undefined {
	const ids = colunas.map((coluna) => coluna.id);
	const indice = ids.indexOf(id);
	const novo = direcao === "esquerda" ? indice - 1 : indice + 1;
	if (indice < 0 || novo < 0 || novo >= ids.length) return undefined;
	[ids[indice], ids[novo]] = [ids[novo]!, ids[indice]!];
	return ids;
}

// --- Apagar uma coluna ----------------------------------------------------------------------

/** As colunas que podem receber as tarefas da coluna apagada: as outras, na ordem do quadro. */
export const destinosParaApagar = (agenda: Agenda, id: string): Coluna[] => agenda.colunas.filter((coluna) => coluna.id !== id);

/** O destino que o modal já vem escolhido: a primeira outra coluna que não é de feito; se só sobra a de feito, ela. */
export function destinoPadraoDeApagar(agenda: Agenda, id: string): string | undefined {
	const outras = destinosParaApagar(agenda, id);
	return (outras.find((coluna) => !coluna.feito) ?? outras[0])?.id;
}
