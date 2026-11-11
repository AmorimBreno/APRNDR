// Eventos do perfil de estudos (ESPECIFICACAO 7 e 9.2, camada 1): cada
// matéria tem o seu materias/<id>/eventos.jsonl, e o aprendiz, o
// aprendiz/eventos.jsonl. Uma linha por evento, em JSON, só de acréscimo:
// acrescentarEvento é a única função que escreve nesses arquivos, e ela só
// acrescenta uma linha no fim (nunca reescreve nem apaga) — AGENTS.md.

import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Verbos de matéria e de materiais e, a partir dos itens 7 e 8, os de aprendizagem. */
export type VerboEvento =
	| "criou_materia"
	| "alterou_materia"
	// Materiais (item 4.2): o serviço de materiais do núcleo processou ou perdeu um arquivo.
	| "adicionou_material"
	| "atualizou_material"
	| "removeu_material"
	// Notas (item 4.3, parte B): editou_nota é um por abertura da nota em que ela mudou.
	| "criou_nota"
	| "renomeou_nota"
	| "editou_nota"
	// Mesa de estudo, parte C1 (docs/mesa-parte-c.md, seção 5): o Breno clicou em "Guardar na nota"
	// num bloco da resposta do professor. objeto: { materia, titulo, sessao, tamanho }.
	| "guardou_na_nota"
	// Mapa de conteúdo (item 4.4): docs/mapa-conteudo.md, "Eventos".
	| "mapeou_material"
	| "atualizou_mapa"
	| "revisou_mapa"
	| "aprovou_mapa"
	// O mapa montado a partir do tema de um curso (item 5, parte A): docs/cursos.md, "Mapa a partir do tema".
	| "montou_mapa_do_tema"
	// Cursos (item 5): docs/cursos.md, "Eventos". Confirmar uma etapa do guia não grava evento.
	| "comecou_curso"
	| "descartou_curso"
	| "criou_curso"
	// O diagnóstico do guia de cursos (item 5, parte B): docs/cursos.md, "Parte B: o diagnóstico", "Eventos".
	// gerou_diagnostico e concluiu_diagnostico vão para o eventos.jsonl da matéria;
	// autoavaliou_conceito, para o aprendiz/eventos.jsonl (com respondeu_questao e respondeu_dissertativa).
	| "gerou_diagnostico"
	| "concluiu_diagnostico"
	| "autoavaliou_conceito"
	// O esqueleto do guia de cursos (item 5, parte C): docs/cursos.md, "Parte C", "Eventos (na matéria)".
	// gerou_esqueleto vai para o eventos.jsonl da matéria, como o criou_curso (acima).
	| "gerou_esqueleto"
	// "Recalcular o calendário" num curso pronto (docs/cursos.md, "O calendário"), também na matéria.
	| "recalculou_calendario"
	// Os módulos gerados sob demanda (item 6): docs/modulos.md, "Eventos (na matéria)".
	| "gerou_modulo"
	| "marcou_aguardando_material"
	// O concluir manual do módulo (item 6): docs/modulos.md, "Concluir um módulo".
	| "concluiu_modulo"
	// As respostas das questões do módulo: docs/modulos.md, "Responder as questões", "Eventos".
	// Vão para o aprendiz/eventos.jsonl, com respondeu_questao e respondeu_dissertativa (fase "modulo").
	| "respondeu_verificacao"
	| "nao_sabia_questao"
	// A escrita dos módulos: docs/escrita.md. Todos vão para o aprendiz/eventos.jsonl.
	| "criou_regra_escrita"
	| "alterou_regra_escrita"
	| "apagou_regra_escrita"
	| "avaliou_bloco"
	| "reescreveu_bloco"
	// O questionário do fim da lição: docs/modulos.md, "O feedback". Também no aprendiz/eventos.jsonl.
	| "avaliou_licao"
	// Os termos-chave e os pedidos de explicação: docs/termos.md. marcou_termos vai para o
	// eventos.jsonl da matéria; pediu_explicacao e guardou_termo, para o aprendiz/eventos.jsonl.
	| "marcou_termos"
	| "pediu_explicacao"
	| "guardou_termo"
	// O ciclo do método: docs/metodo-ciclo.md. gerou_relatorio_metodo vai para o eventos.jsonl
	// da matéria; os outros três, para o aprendiz/eventos.jsonl.
	| "gerou_relatorio_metodo"
	| "aprovou_ajuste_metodo"
	| "rejeitou_ajuste_metodo"
	| "alterou_ajuste_metodo"
	// Os experimentos do método: docs/metodo-experimentos.md. A análise de cada módulo concluído os grava,
	// todos no aprendiz/eventos.jsonl; os três de cima (aprovou, rejeitou e alterou) ficam como histórico.
	| "iniciou_experimento_metodo"
	| "decidiu_experimento_metodo"
	| "registrou_aprendizado_metodo"
	| "reviu_aprendizado_metodo"
	// A agenda (tarefas e quadro): docs/agenda.md, "Eventos". Os de uma tarefa com matéria vão para o
	// eventos.jsonl da matéria; os de uma tarefa sem matéria e alterou_quadro, para agenda/eventos.jsonl.
	// concluiu_tarefa e reabriu_tarefa entram no lugar de moveu_tarefa ao entrar na coluna de feito e ao sair dela.
	| "criou_tarefa"
	| "editou_tarefa"
	| "moveu_tarefa"
	| "concluiu_tarefa"
	| "reabriu_tarefa"
	| "apagou_tarefa"
	| "alterou_quadro"
	// Aprendizagem (seção 9.2), usados a partir dos itens 7 e 8:
	| "pediu_reexplicacao"
	| "pediu_outro_jeito"
	| "escreveu_entendimento"
	| "respondeu_questao"
	| "respondeu_dissertativa"
	| "marcou_confianca";

/** Um evento no formato da seção 9.2 (inspirado no xAPI). */
export interface Evento {
	/** Ordenável no tempo (ver novoIdEvento). */
	id: string;
	/** Data e hora (ISO 8601). */
	ts: string;
	/** Sessão do pi em que aconteceu, se houver. */
	sessao?: string;
	verbo: VerboEvento;
	/** Sobre o quê: a matéria e, nos de aprendizagem, o bloco ou a questão, os conceitos e o curso. */
	objeto: { materia?: string; [campo: string]: unknown };
	/** O que deu (correto, nota por critério, confiança, tempo, texto livre). */
	resultado?: Record<string, unknown>;
	/** Como estava (estratégia, versão do prompt, modelo, braço do bandit, versão do perfil). */
	contexto?: Record<string, unknown>;
}

/**
 * id ordenável no tempo: 12 dígitos base 36 de milissegundos e 8 hex
 * aleatórios. Ordenar os ids como texto dá a ordem em que foram criados.
 */
export function novoIdEvento(agora: number = Date.now()): string {
	return `${agora.toString(36).padStart(12, "0")}-${randomBytes(4).toString("hex")}`;
}

/** Monta um evento com id e data e hora. */
export function criarEvento(dados: Omit<Evento, "id" | "ts">, agora: Date = new Date()): Evento {
	return { id: novoIdEvento(agora.getTime()), ts: agora.toISOString(), ...dados };
}

/**
 * Acrescenta o evento no fim do arquivo (cria o arquivo e a pasta se
 * faltarem). Uma linha, sem quebra no meio: o JSON não tem \n solto.
 */
export async function acrescentarEvento(arquivo: string, evento: Evento): Promise<void> {
	await mkdir(dirname(arquivo), { recursive: true });
	await appendFile(arquivo, `${JSON.stringify(evento)}\n`, { encoding: "utf8", flag: "a" });
}

/**
 * Lê os eventos do arquivo, na ordem em que foram gravados. Linha que não é
 * um evento (cortada por uma sincronização no meio, por exemplo) é contada e
 * pulada; o arquivo nunca é corrigido aqui. Sem arquivo, nenhum evento.
 */
export async function lerEventos(arquivo: string): Promise<{ eventos: Evento[]; invalidas: number }> {
	let conteudo: string;
	try {
		conteudo = await readFile(arquivo, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return { eventos: [], invalidas: 0 };
		throw erro;
	}
	const eventos: Evento[] = [];
	let invalidas = 0;
	for (const linha of conteudo.split("\n")) {
		if (!linha.trim()) continue;
		try {
			const evento = JSON.parse(linha) as Evento;
			if (typeof evento.id === "string" && typeof evento.ts === "string" && typeof evento.verbo === "string") eventos.push(evento);
			else invalidas++;
		} catch {
			invalidas++;
		}
	}
	return { eventos, invalidas };
}
