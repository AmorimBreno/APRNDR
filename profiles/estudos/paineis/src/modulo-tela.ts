// As partes puras da visão do módulo gerado (item 6, parte B, docs/modulos.md):
// a rota caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>], a lição
// aberta, o rótulo e o ícone de cada bloco pelo tipo e pelo formato, a trilha
// dos módulos na CourseBar, o "Próximo" da barra, o índice das lições (a lista
// no largo e as fichas no estreito), o resumo embaixo do índice, a frase da
// confusão no gabarito e o aviso de visualização (lembrado no localStorage).
// Sem React e sem o design system (só os tipos): os testes
// (modulo-tela.test.ts) rodam no Node.

import type { IconName, RulerItem, TrackStep } from "@estudos/design-system";
import type { Bloco, EstadoModuloNaTela, FormatoExplicacao, Licao, Modulo } from "../../lib/modulo-tipos.ts";

const pad2 = (numero: number) => String(numero).padStart(2, "0");

// --- A rota ------------------------------------------------------------------------

/** O caminho da visão do módulo; sem a lição, a primeira. */
export function caminhoDoModulo(materia: string, curso: string, modulo: string, licao?: string): string {
	return `caderno/${materia}/cursos/${curso}/modulos/${modulo}${licao ? `/${licao}` : ""}`;
}

/**
 * Lê o que vem depois de "caderno/<matéria>/cursos/": "<curso>/modulos/<módulo>"
 * ou "<curso>/modulos/<módulo>/<lição>". Outro caminho, undefined.
 */
export function rotaDoModulo(resto: readonly string[]): { curso: string; modulo: string; licao?: string } | undefined {
	const [curso, parte, modulo, licao, ...sobra] = resto;
	if (!curso || parte !== "modulos" || !modulo || sobra.length > 0) return undefined;
	return { curso, modulo, ...(licao ? { licao } : {}) };
}

/** O índice da lição pedida na rota; sem lição, ou com uma que o módulo não tem, a primeira (0). */
export function indiceDaLicao(licoes: readonly Pick<Licao, "id">[], licao: string | undefined): number {
	const indice = licao ? licoes.findIndex((item) => item.id === licao) : -1;
	return indice >= 0 ? indice : 0;
}

// --- O que abrir mostra --------------------------------------------------------------

/** O que a extensão respondeu ao "abrir" (modulos-ponte.ts, lerModuloAberto). */
export interface LidoModuloAberto {
	modulo?: Modulo;
	erro?: string;
}

/**
 * O que a visão mostra: carregando (nada chegou), pronto (um módulo gerado com
 * lições), não gerado (o módulo aguarda material, não tem lição, ou a extensão
 * disse que ele ainda não foi gerado), ilegível (o arquivo existe mas não deu
 * para ler) ou erro (outro erro da extensão).
 */
export type Abertura =
	| { tipo: "carregando" }
	| { tipo: "pronto"; modulo: Modulo }
	| { tipo: "nao_gerado" }
	| { tipo: "ilegivel"; mensagem: string }
	| { tipo: "erro"; mensagem: string };

export function aberturaDoModulo(lido: LidoModuloAberto): Abertura {
	if (lido.erro !== undefined) {
		if (/ainda não foi gerado/i.test(lido.erro)) return { tipo: "nao_gerado" };
		if (/não consegui ler o módulo/i.test(lido.erro)) return { tipo: "ilegivel", mensagem: lido.erro };
		return { tipo: "erro", mensagem: lido.erro };
	}
	if (!lido.modulo) return { tipo: "carregando" };
	if (lido.modulo.situacao !== "gerado" || lido.modulo.licoes.length === 0) return { tipo: "nao_gerado" };
	return { tipo: "pronto", modulo: lido.modulo };
}

// --- Os blocos ---------------------------------------------------------------------

/** O rótulo e o ícone de cada formato de explicação. */
export const ROTULOS_EXPLICACAO: Record<FormatoExplicacao, { rotulo: string; icone: IconName }> = {
	conceito: { rotulo: "Explicação", icone: "bulb" },
	exemplo_resolvido: { rotulo: "Exemplo resolvido", icone: "code" },
	exemplo_incompleto: { rotulo: "Exemplo para completar", icone: "code" },
	problema_aberto: { rotulo: "Problema aberto", icone: "flag" },
};

/** O rótulo e o ícone das práticas. */
export const ROTULOS_PRATICA = {
	verificacao: { rotulo: "Pergunta", icone: "help" },
	alternativa: { rotulo: "Questão", icone: "checklist" },
	dissertativa: { rotulo: "Dissertativa", icone: "message" },
} as const satisfies Record<string, { rotulo: string; icone: IconName }>;

/** O rótulo (a Tag do LessonBlock) e o ícone de um bloco, pelo tipo e, na explicação, pelo formato. */
export function rotuloDoBloco(bloco: Pick<Bloco, "tipo"> & { formato?: FormatoExplicacao }): { rotulo: string; icone: IconName } {
	if (bloco.tipo === "explicacao") return ROTULOS_EXPLICACAO[bloco.formato ?? "conceito"] ?? ROTULOS_EXPLICACAO.conceito;
	return ROTULOS_PRATICA[bloco.tipo];
}

/** O bloco vai além do material (só a explicação pode ir). */
export const ehComplemento = (bloco: Bloco): boolean => bloco.tipo === "explicacao" && bloco.complemento === true;

/** Os traços da SectionRuler: um por bloco, com o rótulo dele ("03 · Questão" no hover). */
export function itensDaRegua(licao: Pick<Licao, "blocos">): RulerItem[] {
	return licao.blocos.map((bloco) => ({ id: bloco.id, label: rotuloDoBloco(bloco).rotulo }));
}

/**
 * A confusão de uma alternativa errada, embaixo dela no gabarito: "Confunde A
 * com B." vira "Quem escolhe esta confunde A com B."; "Acha que…" vira "Quem
 * escolhe esta acha que…". Sempre com ponto no fim. Vazia, "".
 */
export function fraseDaConfusao(confusao: string | undefined): string {
	const texto = confusao?.trim() ?? "";
	if (!texto) return "";
	const frase = `Quem escolhe esta ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
	return /[.!?…]$/.test(frase) ? frase : `${frase}.`;
}

/** O id (para o QuizQuestion) da alternativa correta; sem nenhuma marcada, undefined. */
export function idDaCorreta(alternativas: ReadonlyArray<{ correta?: boolean }>): string | undefined {
	const indice = alternativas.findIndex((alternativa) => alternativa.correta === true);
	return indice >= 0 ? String(indice) : undefined;
}

// --- A CourseBar -----------------------------------------------------------------

/** "Módulo 03 · Derivadas". */
export const tituloDoModulo = (numero: number, nome: string) => `Módulo ${pad2(numero)} · ${nome}`;

/** "Estatística básica · lição 2 de 4"; sem as lições (ainda carregando), só o curso. */
export function kickerDaBarra(curso: string, licao?: { indice: number; total: number }): string {
	return licao && licao.total > 0 ? `${curso} · lição ${licao.indice + 1} de ${licao.total}` : curso;
}

/** O id da estação final (a avaliação geral do curso), que ainda não existe. */
export const ID_AVALIACAO_GERAL = "avaliacao-geral";

/** Um módulo do curso tem arquivo de módulo gerado (também durante uma nova geração, que só substitui no fim). */
const foiGerado = (estado: Pick<EstadoModuloNaTela, "situacao" | "geradoEm"> | undefined) =>
	estado !== undefined && (estado.situacao === "gerado" || (estado.situacao !== "aguardando_material" && typeof estado.geradoEm === "string"));

/**
 * As estações da ProgressTrack da CourseBar, na ordem do esqueleto: o módulo
 * aberto é current; os outros gerados, todo (dá para abrir); os que não foram
 * gerados (ou aguardam material), locked. No fim, a "Avaliação geral", locked.
 * Sem o estado dos módulos (ainda não chegou), só o aberto não é locked.
 */
export function passosDaTrilha(
	modulos: ReadonlyArray<{ id: string; numero: number; nome: string }>,
	estados: ReadonlyArray<Pick<EstadoModuloNaTela, "id" | "situacao" | "geradoEm">> | undefined,
	aberto: string,
): TrackStep[] {
	const porId = new Map((estados ?? []).map((estado) => [estado.id, estado]));
	const passos: TrackStep[] = modulos.map((modulo) => ({
		id: modulo.id,
		kind: "module",
		label: tituloDoModulo(modulo.numero, modulo.nome),
		state: modulo.id === aberto ? "current" : foiGerado(porId.get(modulo.id)) ? "todo" : "locked",
	}));
	passos.push({ id: ID_AVALIACAO_GERAL, kind: "final", label: "Avaliação geral", state: "locked" });
	return passos;
}

/** O "Próximo" da CourseBar: a próxima lição, ou, na última, voltar ao curso. */
export function proximoDaBarra(indice: number, total: number): { label: string; kicker: string; destino: "licao" | "curso" } {
	if (indice + 1 < total) return { label: "Próxima lição", kicker: `Lição ${indice + 2}`, destino: "licao" };
	return { label: "Voltar ao curso", kicker: "Fim do módulo", destino: "curso" };
}

// --- O índice das lições --------------------------------------------------------------

export interface ItemDoIndice {
	id: string;
	/** "01". */
	numero: string;
	titulo: string;
	atual: boolean;
}

/** As lições do índice (a lista no largo, as fichas no estreito): o número com dois dígitos, o título e a atual. */
export function itensDoIndice(licoes: ReadonlyArray<Pick<Licao, "id" | "titulo">>, atual: number): ItemDoIndice[] {
	return licoes.map((licao, indice) => ({ id: licao.id, numero: pad2(indice + 1), titulo: licao.titulo, atual: indice === atual }));
}

const contar = (quantos: number, um: string, varios: string) => `${quantos} ${quantos === 1 ? um : varios}`;

/** "dd/mm" de um ISO 8601, no fuso do computador; inválido, "". */
export function diaEMes(iso: string | undefined): string {
	if (!iso) return "";
	const data = new Date(iso);
	if (Number.isNaN(data.getTime())) return "";
	return `${pad2(data.getDate())}/${pad2(data.getMonth() + 1)}`;
}

/** "4 lições · 9 questões · gerado em 26/10" (questões são as alternativas e as dissertativas). */
export function resumoDoIndice(modulo: Pick<Modulo, "licoes"> & { geradoEm?: string }): string {
	const blocos = modulo.licoes.flatMap((licao) => licao.blocos);
	const questoes = blocos.filter((bloco) => bloco.tipo === "alternativa" || bloco.tipo === "dissertativa").length;
	const dia = diaEMes(modulo.geradoEm);
	return [contar(modulo.licoes.length, "lição", "lições"), contar(questoes, "questão", "questões"), dia ? `gerado em ${dia}` : ""].filter(Boolean).join(" · ");
}

// --- O aviso de visualização ---------------------------------------------------------

/** O texto do Callout do topo da lição. */
export const TEXTO_AVISO = "Visualização do módulo. Responder às questões e pedir outra explicação chegam com a aula (item 7).";

/** A chave do localStorage que lembra que o aviso foi fechado. */
export const CHAVE_AVISO = "estudos:modulo:aviso-fechado";

type Armazenamento = Pick<Storage, "getItem" | "setItem">;

const armazenamento = (): Armazenamento | undefined => {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
};

/** O aviso foi fechado antes. Sem localStorage (ou se ele falha), não. */
export function avisoFechado(guardado: Armazenamento | undefined = armazenamento()): boolean {
	try {
		return guardado?.getItem(CHAVE_AVISO) === "1";
	} catch {
		return false;
	}
}

/** Lembra que o aviso foi fechado; se o localStorage falhar, só fica fechado até sair da tela. */
export function lembrarAvisoFechado(guardado: Armazenamento | undefined = armazenamento()): void {
	try {
		guardado?.setItem(CHAVE_AVISO, "1");
	} catch {
		// Sem onde guardar: o aviso volta na próxima vez.
	}
}
