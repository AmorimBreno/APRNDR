// Quais trocas de subtela do perfil de estudos acontecem sem a View Transition
// da página inteira (EntradaTelaInicial.semTransicao; docs/padroes-de-interface.md,
// regra 7). Puro e sem React.
//
// Sem transição: trocas dentro do mesmo lugar, em que só uma parte da tela muda
// e o resto (a aba do caderno, o painel, o professor) fica:
// - as tags do painel do mesmo caderno (Notas, Materiais, Mapa de conteúdo);
// - as abas da mesa da mesma matéria (notas e lições abertas);
// - as abas da agenda (Calendário, Tarefas, Quadro), com ou sem o filtro de matéria.
// O resto (entrar num caderno, abrir uma nota pelo painel, ir para a agenda)
// continua animando como antes.

import { abaDoCaminho } from "./abas-mesa.ts";
import { TAGS_DO_CADERNO } from "./painel-caderno.ts";

const TAGS = new Set<string>(TAGS_DO_CADERNO.map((tag) => tag.id));

/** A matéria se o caminho é o painel do caderno (sem tag ou com uma das tags), senão undefined. */
function materiaDoPainel(caminho: string): string | undefined {
	const [tipo, materia, secao, ...resto] = caminho.split("/");
	if (tipo !== "caderno" || !materia || resto.length > 0) return undefined;
	return secao === undefined || TAGS.has(secao) ? materia : undefined;
}

function ehAgenda(caminho: string): boolean {
	return caminho === "agenda" || caminho.startsWith("agenda/");
}

export function trocaSemTransicao(de: string, para: string): boolean {
	if (de === para) return false;
	const painelDe = materiaDoPainel(de);
	if (painelDe !== undefined && painelDe === materiaDoPainel(para)) return true;
	if (abaDoCaminho(de) !== undefined && abaDoCaminho(para) !== undefined && de.split("/")[1] === para.split("/")[1]) return true;
	return ehAgenda(de) && ehAgenda(para);
}
