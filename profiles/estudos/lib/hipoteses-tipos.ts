// Tipos das hipóteses do perfil do aprendiz (item 9, parte B; docs/aprendiz.md, seção 8): a camada 3
// da memória. Sem nada do Node: a tela (profiles/estudos/paineis) importa daqui. As funções puras
// (confiança, validação das propostas da reflexão, aplicar e decidir) entram neste mesmo arquivo, no
// WP1 da parte B. Cada hipótese cita ids de eventos (camada 1); nada muda sem a aprovação do Breno.

import type { Evento } from "./eventos.ts";

/** Muda quando o formato do hipoteses.json mudar. */
export const VERSAO_HIPOTESES = 1;

export const TIPOS_HIPOTESE = ["conhecimento", "misconception", "vocabulario", "preferencia_de_forma", "ritmo", "metacognicao"] as const;
export type TipoHipotese = (typeof TIPOS_HIPOTESE)[number];

export type EscopoHipotese =
	| { nivel: "global" }
	| { nivel: "materia"; materia: string }
	| { nivel: "conceito"; materia: string; conceitos: string[] };

/** proposta: esperando a decisão; aprovada e rejeitada: o Breno decidiu; expirada: sem confirmação recente. */
export type StatusHipotese = "proposta" | "aprovada" | "rejeitada" | "expirada";

export type ConfiancaHipotese = "baixa" | "media" | "alta";

/** Uma versão anterior da hipótese (cada mudança vira uma versão nova; nada é sobrescrito em silêncio). */
export interface VersaoAnterior {
	versao: number;
	enunciado: string;
	status: StatusHipotese;
	ts: string;
}

export interface Hipotese {
	/** h-<id ordenável>. */
	id: string;
	tipo: TipoHipotese;
	escopo: EscopoHipotese;
	enunciado: string;
	/** Os ids dos eventos (camada 1) que sustentam e que contrariam. */
	aFavor: string[];
	contra: string[];
	/** Calculada pelo código (confiancaDe), nunca pelo modelo. */
	confianca: ConfiancaHipotese;
	criadaEm: string;
	ultimaConfirmacao: string;
	/** O dia (ISO) depois do qual, sem confirmação, a hipótese expira. */
	validade: string;
	status: StatusHipotese;
	/** true só depois que o Breno aprovou (ou editou e aprovou). */
	aprovadaPeloUsuario: boolean;
	/** 1 na criação; cresce a cada mudança. */
	versao: number;
	anteriores: VersaoAnterior[];
	/** O id da reflexão que a propôs (ausente se o Breno a escreveu à mão). */
	reflexao?: string;
}

/** reforcar e enfraquecer acrescentam evidências; expirar propõe encerrar a hipótese. */
export type AcaoDeMudanca = "reforcar" | "enfraquecer" | "expirar";

/** Uma mudança proposta numa hipótese que já existe, esperando a decisão do Breno. */
export interface MudancaPendente {
	/** m-<id ordenável>. */
	id: string;
	hipotese: string;
	acao: AcaoDeMudanca;
	/** Os ids de eventos novos (que a hipótese ainda não cita). */
	evidencias: string[];
	motivo: string;
	reflexao: string;
	criadaEm: string;
}

/** O que a última reflexão fez (também gravado no evento `refletiu`). */
export interface ResumoDaReflexao {
	/** r-<id ordenável>. */
	id: string;
	ts: string;
	/** O que a disparou: o botão, o módulo concluído ou o questionário de fim de lição. */
	motivo: "botao" | "modulo" | "licao";
	/** O id do último evento de aprendizagem que ela leu (a próxima começa depois dele). */
	ultimoEvento?: string;
	lidos: number;
	/** Quantas propostas o modelo fez, quantas o código aceitou e quantas descartou (com o porquê em `descartadas`). */
	propostas: number;
	aceitas: number;
	descartadas: { motivo: string; quantas: number }[];
	/** O custo da chamada, em dólares. */
	custo?: number;
}

/** O arquivo aprendiz/hipoteses.json (gravado inteiro e legível). */
export interface ArquivoHipoteses {
	versao: number;
	hipoteses: Hipotese[];
	mudancas: MudancaPendente[];
	ultimaReflexao?: ResumoDaReflexao;
}

/** O que a tela recebe da ponte. */
export interface EstadoHipoteses {
	hipoteses: Hipotese[];
	mudancas: MudancaPendente[];
	ultimaReflexao?: ResumoDaReflexao;
	/** Há uma reflexão rodando agora. */
	refletindo: boolean;
}

/** Um evento da camada 1 como a aba Histórico mostra (o texto livre vem cortado). */
export type EventoDoHistorico = Pick<Evento, "id" | "ts" | "sessao" | "verbo" | "objeto" | "resultado">;

// --- A ponte (painel PAINEL_APRENDIZ, constante em aprendiz-indicadores-tipos.ts; tudo gravar: false) ---
//
// tela -> extensão (ação):
//   hipoteses {}                                  -> hipoteses { estado: EstadoHipoteses }
//   historico { materia?: string }                -> historico { eventos: EventoDoHistorico[] }   (os mais novos primeiro, até LIMITE_HISTORICO)
//   refletir { pedido }                           -> refletindo { pedido } e, no fim, refletiu { pedido, resumo: ResumoDaReflexao, estado }
//   decidir { pedido, alvo: "hipotese" | "mudanca", id, decisao: "aprovar" | "rejeitar", enunciado? }   -> decidida { pedido, estado }
//   editar { pedido, id, enunciado?, status?: "aprovada" | "rejeitada" }                               -> decidida { pedido, estado }
// Qualquer falha: erro { pedido?, ao, mensagem }. A extensão também manda `hipoteses` { estado } sozinha quando uma
// reflexão disparada por módulo ou lição termina (sem pedido), para a tela aberta se atualizar.

export const LIMITE_HISTORICO = 500;

/** Até quantos caracteres do texto livre de um evento o histórico leva. */
export const LIMITE_TEXTO_DO_HISTORICO = 600;
