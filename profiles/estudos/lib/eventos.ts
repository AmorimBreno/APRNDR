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
