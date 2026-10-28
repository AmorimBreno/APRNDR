// Tipos e regras da escrita dos módulos (docs/escrita.md) sem nada do Node: a
// tela (profiles/estudos/paineis) importa daqui, e as extensões aplicam as
// mesmas funções antes de gravar; escrita.ts reexporta. São três coisas: as
// regras de escrita do Breno (aprendiz/escrita.json), o retorno dele em cada
// bloco (o evento avaliou_bloco) e as versões de um bloco reescrito (no
// próprio <módulo>.json).
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam.

import { ErroCurso } from "./curso-tipos.ts";
import type { Bloco, BlocoAnterior, BlocoSemId, Modulo, ModuloGerado } from "./modulo-tipos.ts";
import { versaoDoBloco } from "./modulo-tipos.ts";

/** Muda quando o formato do escrita.json mudar. */
export const VERSAO_ESCRITA = 1;

/** O painel da ponte de eventos das regras (docs/escrita.md, "Ponte"). */
export const PAINEL_ESCRITA = "escrita";

/** O texto de uma regra: de 1 a 300 caracteres. */
export const TEXTO_REGRA_MAXIMO = 300;

/** No máximo 30 regras ativas valem para uma matéria (as globais e as dela). */
export const REGRAS_MAXIMAS = 30;

/** O texto livre de um retorno: até 1000 caracteres. */
export const TEXTO_RETORNO_MAXIMO = 1000;

/** O título da seção das regras na mensagem dos modelos. */
export const TITULO_SECAO_REGRAS = "Regras de escrita do Breno (obedeça sempre)";

// --- Regras de escrita (aprendiz/escrita.json) -------------------------------------

/** escrita: escrita na tela de regras; retorno: criada a partir de um retorno de bloco ("Virar regra de escrita"). */
export const ORIGENS_REGRA = ["escrita", "retorno"] as const;
export type OrigemRegra = (typeof ORIGENS_REGRA)[number];

/** Uma instrução fixa do Breno sobre como o conteúdo gerado deve ser escrito (não é hipótese do perfil: não precisa de evidência). */
export interface RegraEscrita {
	/** r-<tempo>-<aleatório>, dado pelo código. */
	id: string;
	/** De 1 a 300 caracteres, aparado. */
	texto: string;
	/** null = vale para todas as matérias; um id = só para aquela matéria. */
	materia: string | null;
	/** Desligada não vale, mas não é apagada. */
	ativa: boolean;
	/** ISO 8601. */
	criadaEm: string;
	/** ISO 8601. */
	alteradaEm: string;
	origem: OrigemRegra;
	/** Com origem "retorno": o id do evento avaliou_bloco de onde a regra saiu. */
	retorno?: string;
}

/** O aprendiz/escrita.json: só a versão atual das regras (o histórico está nos eventos). */
export interface ArquivoEscrita {
	versao: typeof VERSAO_ESCRITA;
	/** Na ordem em que valem (a ordem da seção na mensagem). */
	regras: RegraEscrita[];
}

/** O que a tela manda para criar (sem id) ou alterar (com id) uma regra. */
export interface EntradaRegra {
	id?: string;
	texto: string;
	materia: string | null;
	ativa: boolean;
}

/** De onde vem uma regra nova. */
export type OrigemDaRegra = { origem: "escrita" } | { origem: "retorno"; retorno: string };

// --- Retorno em cada bloco -----------------------------------------------------------

export const AVALIACOES_BLOCO = ["bom", "melhorar"] as const;
export type AvaliacaoBloco = (typeof AVALIACOES_BLOCO)[number];

/** Os nomes que a tela mostra. */
export const NOMES_AVALIACAO: Record<AvaliacaoBloco, string> = { bom: "Bom", melhorar: "Precisa melhorar" };

/** Os motivos de um retorno (vários, opcionais), na ordem em que a tela mostra. */
export const MOTIVOS_RETORNO = ["longo", "abstrato", "faltou_exemplo", "codigo_sem_explicacao", "pulou_passo", "repetitivo", "confuso", "nivel_errado", "erro"] as const;
export type MotivoRetorno = (typeof MOTIVOS_RETORNO)[number];

/** Os nomes que a tela mostra (e que vão na mensagem da reescrita). */
export const NOMES_MOTIVO: Record<MotivoRetorno, string> = {
	longo: "Longo demais",
	abstrato: "Abstrato demais",
	faltou_exemplo: "Faltou exemplo",
	codigo_sem_explicacao: "Código sem explicação",
	pulou_passo: "Pulou um passo",
	repetitivo: "Repetitivo",
	confuso: "Confuso",
	nivel_errado: "Nível errado",
	erro: "Algo errado",
};

export const ehAvaliacaoBloco = (valor: unknown): valor is AvaliacaoBloco => (AVALIACOES_BLOCO as readonly unknown[]).includes(valor);
export const ehMotivoRetorno = (valor: unknown): valor is MotivoRetorno => (MOTIVOS_RETORNO as readonly unknown[]).includes(valor);

/** O retorno conferido (validarRetorno). */
export interface RetornoBloco {
	avaliacao: AvaliacaoBloco;
	/** Sem repetir, na ordem em que vieram. */
	motivos: MotivoRetorno[];
	/** Aparado; pode ser vazio. */
	texto: string;
	/** "Virar regra de escrita": o texto (editável antes de salvar) e a matéria (null = todas). */
	virarRegra?: { texto: string; materia: string | null };
}

// --- Ponte -----------------------------------------------------------------------------

/** As ações da tela para a extensão das regras (interface:acao, painel escrita). */
export interface AcoesEscrita {
	listar: Record<string, never>;
	salvar: { pedido: string; regra: EntradaRegra };
	apagar: { pedido: string; id: string };
}

export type AcaoEscrita = keyof AcoesEscrita;

/** As mensagens da extensão das regras para a tela (interface:mostrar, painel escrita). */
export interface MensagensEscrita {
	/** Todas as regras, na ordem do arquivo; com o pedido quando respondem a salvar ou apagar. */
	regras: { regras: RegraEscrita[]; pedido?: string };
	erro: { mensagem: string; ao?: string; pedido?: string };
}

/** As ações do retorno e da reescrita no painel modulos (somam-se às AcoesModulos de modulo-tipos.ts). */
export interface AcoesModulosEscrita {
	/** Grava o avaliou_bloco e, com virarRegra, a regra. */
	retorno: {
		materia: string;
		curso: string;
		modulo: string;
		licao: string;
		bloco: string;
		pedido: string;
		avaliacao: AvaliacaoBloco;
		motivos: MotivoRetorno[];
		texto?: string;
		virarRegra?: { texto: string; materia: string | null };
	};
	/** Gera de novo só aquele bloco; o estado do módulo mostra reescrevendo enquanto isso e, no fim, vai a mensagem modulo. */
	reescrever_bloco: {
		materia: string;
		curso: string;
		modulo: string;
		licao: string;
		bloco: string;
		pedido: string;
		/** O id do evento avaliou_bloco que pede a reescrita. */
		retorno: string;
	};
}

// --- Funções -------------------------------------------------------------------------

/** Um ErroCurso (a extensão mostra a frase como está), com o nome próprio da escrita. */
export class ErroEscrita extends ErroCurso {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroEscrita";
	}
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));

/** Um id de matéria (vira nome de pasta): texto não vazio, sem barras, dois pontos ou "..". */
const ehIdMateria = (valor: unknown): valor is string =>
	typeof valor === "string" && valor !== "" && valor !== "." && valor !== ".." && !/[\\/:*?"<>|\u0000-\u001f]/.test(valor);

/**
 * Confere o que a tela mandou para uma regra: o texto aparado, de 1 a 300
 * caracteres; a matéria null (todas; ausente também vale como null) ou um id
 * de matéria; ativa um booleano (ausente = true). O id, se veio, é devolvido
 * como está (salvarRegra confere se existe). Fora disso, ErroEscrita.
 */
export function validarRegra(entrada: unknown): EntradaRegra {
	if (!ehObjeto(entrada)) throw new ErroEscrita("A regra não veio no formato (texto, matéria e ativa).");
	const texto = typeof entrada.texto === "string" ? entrada.texto.trim() : "";
	if (!texto) throw new ErroEscrita("A regra está sem texto.");
	if (texto.length > TEXTO_REGRA_MAXIMO) throw new ErroEscrita(`A regra tem ${texto.length} caracteres; o máximo é ${TEXTO_REGRA_MAXIMO}.`);
	const materia = entrada.materia ?? null;
	if (materia !== null && !ehIdMateria(materia)) throw new ErroEscrita(`A matéria da regra não é válida ("${mostrar(materia)}").`);
	const ativa = entrada.ativa ?? true;
	if (typeof ativa !== "boolean") throw new ErroEscrita("O ligar e desligar da regra não veio como sim ou não.");
	const id = entrada.id;
	if (id !== undefined && (typeof id !== "string" || !id)) throw new ErroEscrita(`O id da regra não é válido ("${mostrar(id)}").`);
	return { ...(id !== undefined ? { id } : {}), texto, materia, ativa };
}

/** Se a regra vale para a matéria: ativa e global ou daquela matéria. Com `materia` null, só as globais. */
const valePara = (regra: Pick<RegraEscrita, "ativa" | "materia">, materia: string | null | undefined) => regra.ativa && (regra.materia === null || regra.materia === (materia ?? null));

/** As regras que valem para a matéria: as ativas, globais e da matéria, na ordem do arquivo, até 30. Com `materia` null, só as globais. */
export function regrasQueValem(regras: readonly RegraEscrita[], materia: string | null | undefined): RegraEscrita[] {
	return regras.filter((regra) => valePara(regra, materia)).slice(0, REGRAS_MAXIMAS).map((regra) => structuredClone(regra));
}

/**
 * Confere o limite de 30 regras ativas valendo para uma matéria, depois de
 * gravar `regra` (já dentro de `regras`): se ela está ativa e é de uma
 * matéria, as globais e as daquela matéria; se é global, as globais e as de
 * cada matéria que tem regra. Uma regra desligada não conta. Passou do
 * limite, ErroEscrita.
 */
export function conferirLimite(regras: readonly RegraEscrita[], regra: Pick<RegraEscrita, "ativa" | "materia">): void {
	if (!regra.ativa) return;
	const materias = regra.materia === null ? [null, ...new Set(regras.map((item) => item.materia).filter((id): id is string => id !== null))] : [regra.materia];
	for (const materia of materias) {
		const contam = regras.filter((item) => valePara(item, materia)).length;
		if (contam > REGRAS_MAXIMAS) {
			const onde = materia === null ? "todas as matérias" : `a matéria ${materia}`;
			throw new ErroEscrita(`Já há ${REGRAS_MAXIMAS} regras ligadas valendo para ${onde}; desligue ou apague uma antes.`);
		}
	}
}

/**
 * A seção das regras para a mensagem dos modelos (docs/escrita.md, "Onde
 * valem"): o título "Regras de escrita do Breno (obedeça sempre):" e uma
 * regra por linha, numeradas, na ordem recebida. Recebe as que valem
 * (regrasQueValem). Sem regras, texto vazio (a mensagem fica sem a seção).
 */
export function secaoDasRegras(regras: readonly Pick<RegraEscrita, "texto">[]): string {
	const linhas = regras.map((regra) => regra.texto.trim()).filter(Boolean);
	if (linhas.length === 0) return "";
	return `${TITULO_SECAO_REGRAS}:\n${linhas.map((texto, indice) => `${indice + 1}. ${texto}`).join("\n")}`;
}

/**
 * Confere o retorno que a tela mandou: a avaliação (bom ou melhorar); os
 * motivos (opcionais) só dos conhecidos, sem repetir, na ordem; o texto
 * (opcional) aparado, até 1000 caracteres; e, com virarRegra, o texto e a
 * matéria da regra pelas regras de validarRegra. Fora disso, ErroEscrita.
 */
export function validarRetorno(entrada: unknown): RetornoBloco {
	if (!ehObjeto(entrada)) throw new ErroEscrita("O retorno não veio no formato (avaliação, motivos e texto).");
	if (!ehAvaliacaoBloco(entrada.avaliacao)) throw new ErroEscrita(`A avaliação do bloco não é válida ("${mostrar(entrada.avaliacao)}"): é bom ou melhorar.`);
	const lista = entrada.motivos ?? [];
	if (!Array.isArray(lista)) throw new ErroEscrita("Os motivos do retorno não vieram numa lista.");
	const motivos: MotivoRetorno[] = [];
	for (const motivo of lista as unknown[]) {
		if (!ehMotivoRetorno(motivo)) throw new ErroEscrita(`Motivo de retorno desconhecido ("${mostrar(motivo)}").`);
		if (!motivos.includes(motivo)) motivos.push(motivo);
	}
	if (entrada.texto !== undefined && entrada.texto !== null && typeof entrada.texto !== "string") throw new ErroEscrita("O texto do retorno não é um texto.");
	const texto = typeof entrada.texto === "string" ? entrada.texto.trim() : "";
	if (texto.length > TEXTO_RETORNO_MAXIMO) throw new ErroEscrita(`O texto do retorno tem ${texto.length} caracteres; o máximo é ${TEXTO_RETORNO_MAXIMO}.`);
	const retorno: RetornoBloco = { avaliacao: entrada.avaliacao, motivos, texto };
	if (entrada.virarRegra !== undefined && entrada.virarRegra !== null) {
		if (!ehObjeto(entrada.virarRegra)) throw new ErroEscrita("A regra a criar do retorno não veio no formato (texto e matéria).");
		const regra = validarRegra({ texto: entrada.virarRegra.texto, materia: entrada.virarRegra.materia, ativa: true });
		retorno.virarRegra = { texto: regra.texto, materia: regra.materia };
	}
	return retorno;
}

/** Os campos de versão que o bloco novo não traz de onde veio (o código é que os põe). */
type CamposDoCodigo = "id" | "versao" | "reescritoEm" | "anteriores" | "substituidoEm" | "retorno";

/**
 * Troca um bloco do módulo gerado pela versão reescrita (docs/escrita.md,
 * "Reescrever um bloco"). O bloco novo (validarBloco) entra no mesmo lugar,
 * com o id do antigo, versao = a do antigo + 1 (versaoDoBloco: sem o campo,
 * 1) e reescritoEm = agora. O antigo vai para o fim de `anteriores` do bloco
 * novo, inteiro (com a versão), sem as anteriores dele (elas continuam na
 * lista, antes dele), com substituidoEm = agora e retorno = retornoId.
 * Devolve o módulo novo; o recebido não muda. Módulo que não está gerado,
 * lição ou bloco que não existe, tipo diferente do antigo ou sem retornoId,
 * ErroEscrita.
 */
export function substituirBloco(
	modulo: Modulo,
	licao: string,
	bloco: string,
	novo: BlocoSemId | Bloco,
	opcoes: { retornoId: string; agora?: Date },
): ModuloGerado {
	if (modulo.situacao !== "gerado") throw new ErroEscrita("O módulo não está gerado; só um bloco de módulo gerado pode ser reescrito.");
	if (typeof opcoes.retornoId !== "string" || !opcoes.retornoId) throw new ErroEscrita("Falta o id do retorno que pediu a reescrita.");
	const indiceLicao = modulo.licoes.findIndex((item) => item.id === licao);
	if (indiceLicao < 0) throw new ErroEscrita(`Não achei a lição "${mostrar(licao)}" no módulo ${modulo.id}.`);
	const daLicao = modulo.licoes[indiceLicao]!;
	const indiceBloco = daLicao.blocos.findIndex((item) => item.id === bloco);
	if (indiceBloco < 0) throw new ErroEscrita(`Não achei o bloco "${mostrar(bloco)}" na lição ${licao}.`);
	const antigo = daLicao.blocos[indiceBloco]!;
	if (!ehObjeto(novo) || novo.tipo !== antigo.tipo) throw new ErroEscrita(`O bloco novo é do tipo "${mostrar(ehObjeto(novo) ? novo.tipo : novo)}", e o bloco ${bloco} é "${antigo.tipo}"; a reescrita não muda o tipo.`);
	const agora = (opcoes.agora ?? new Date()).toISOString();
	const de = versaoDoBloco(antigo);
	const { anteriores = [], ...semAnteriores } = structuredClone(antigo);
	const anterior = { ...semAnteriores, versao: de, substituidoEm: agora, retorno: opcoes.retornoId } as BlocoAnterior;
	const { id: _id, versao: _versao, reescritoEm: _reescritoEm, anteriores: _anteriores, substituidoEm: _substituido, retorno: _retorno, ...conteudo } = structuredClone(novo) as Bloco &
		Partial<Record<CamposDoCodigo, unknown>>;
	const reescrito = { id: antigo.id, ...conteudo, versao: de + 1, reescritoEm: agora, anteriores: [...anteriores, anterior] } as Bloco;
	const copia = structuredClone(modulo);
	copia.licoes[indiceLicao]!.blocos[indiceBloco] = reescrito;
	return copia;
}
