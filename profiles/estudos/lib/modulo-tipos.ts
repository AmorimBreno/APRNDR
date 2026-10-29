// Tipos e regras dos módulos do curso gerados sob demanda (item 6,
// docs/modulos.md) sem nada do Node: a tela (profiles/estudos/paineis)
// importa daqui, e a extensão de módulos aplica as mesmas funções antes de
// gravar; modulos.ts reexporta. Cada módulo gerado (ou aguardando material) é
// materias/<matéria>/cursos/<curso>/modulos/<módulo>.json; sem arquivo, o
// módulo ainda não foi gerado.
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam. Quem escolhe o próximo módulo, calcula o nível
// dos conceitos, conserta o plano e confere as lições é o código, não o
// modelo.

import type { ArquivoDoCurso, Curso, Escopo, TipoCurso } from "./curso-tipos.ts";
import { ErroCurso } from "./curso-tipos.ts";
import {
	type Confianca,
	type DiagnosticoEmAndamento,
	lerQuestao,
	type QuestaoAlternativa,
	type QuestaoDissertativa,
	resumoDoDiagnostico,
} from "./diagnostico-tipos.ts";
import type { Esqueleto, Modulo as ModuloDoEsqueleto } from "./esqueleto-tipos.ts";
import type { Referencia } from "./mapa-tipos.ts";
import type { AvaliacaoNova, FeedbackModulo, NotasLicao, QuestionariosModulo } from "./modulo-feedback-tipos.ts";
import type { Progresso, RespostasModulo } from "./modulo-respostas-tipos.ts";
import { conferirTermosDaLicao, type ExplicacaoPedida, limparMarcasDoBloco, type Termo, type TermoDoModelo, type TermosDaLicao } from "./termos-tipos.ts";

/** Muda quando o formato do <módulo>.json mudar. */
export const VERSAO_MODULO = 1;

/** O painel da ponte de eventos (docs/ponte-de-eventos.md). */
export const PAINEL_MODULOS = "modulos";

/** Até quantos caracteres dos trechos citados vão para o modelo em cada lição. */
export const LIMITE_TRECHOS_LICAO = 40_000;

/** Quantas lições um módulo pode ter, e os minutos de uma lição (uma por uns 40 a 60 minutos). */
export const LICOES_MINIMAS = 1;
export const LICOES_MAXIMAS = 6;
export const MINUTOS_POR_LICAO = 50;

// --- Formato (<módulo>.json) -----------------------------------------------------

/** Gravadas no arquivo. "Gerando" e "erro" são estados da extensão, nunca gravados. */
export const SITUACOES_MODULO = ["aguardando_material", "gerado"] as const;
export type SituacaoModulo = (typeof SITUACOES_MODULO)[number];

/** O nível de um conceito para a geração (nivelDoConceito). */
export const NIVEIS_CONCEITO = ["iniciante", "intermediario", "domina"] as const;
export type NivelConceito = (typeof NIVEIS_CONCEITO)[number];

/**
 * O formato de uma explicação (ESPECIFICACAO 9.1 e docs/modulos.md, "O
 * esquema da lição"): exemplo_resolvido (iniciante), exemplo_incompleto
 * (intermediário: passos para completar), problema_aberto (domina), conceito
 * (a teoria, com o porquê, antes do exemplo) ou introducao (o contexto do
 * tema: sempre o primeiro bloco da lição). As lições gravadas antes do
 * esquema não têm introdução.
 */
export const FORMATOS_EXPLICACAO = ["exemplo_resolvido", "exemplo_incompleto", "problema_aberto", "conceito", "introducao"] as const;
export type FormatoExplicacao = (typeof FORMATOS_EXPLICACAO)[number];

/** Os formatos de explicação que são exemplo (o conceito aplicado; o formato sai do nível). */
export const FORMATOS_EXEMPLO = ["exemplo_resolvido", "exemplo_incompleto", "problema_aberto"] as const satisfies readonly FormatoExplicacao[];
export type FormatoExemplo = (typeof FORMATOS_EXEMPLO)[number];

/** O mínimo de caracteres (o texto aparado) de uma introdução, de um conceito e de um exemplo (docs/modulos.md, "O esquema da lição"). */
export const MINIMO_CARACTERES_INTRODUCAO = 600;
export const MINIMO_CARACTERES_CONCEITO = 900;
export const MINIMO_CARACTERES_EXEMPLO = 900;

/** A parte mínima dos caracteres da lição que fica nas explicações e na ideia central (caracteresDaLicao). */
export const PROPORCAO_MINIMA_EXPLICACAO = 0.7;

/** De quantas frases é a ideia central (frasesDoTexto). */
export const MINIMO_FRASES_IDEIA_CENTRAL = 1;
export const MAXIMO_FRASES_IDEIA_CENTRAL = 3;

/** O formato do exemplo que cada nível pede (9.1). */
export const FORMATO_DO_NIVEL: Record<NivelConceito, FormatoExemplo> = {
	iniciante: "exemplo_resolvido",
	intermediario: "exemplo_incompleto",
	domina: "problema_aberto",
};

/** Os tipos de bloco de uma lição. */
export const TIPOS_BLOCO = ["explicacao", "verificacao", "alternativa", "dissertativa", "ideia_central"] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];

/** Os tipos de bloco que contam como prática: as questões (pergunta, quiz e dissertativa). A explicação e a ideia central não são. */
export const TIPOS_PRATICA = ["verificacao", "alternativa", "dissertativa"] as const satisfies readonly TipoBloco[];
export type TipoPratica = (typeof TIPOS_PRATICA)[number];

/**
 * Um item do roteiro de uma lição no plano: a explicação pelo formato
 * (introducao, conceito, exemplo_resolvido…) e os outros blocos pelo tipo.
 */
export const ITENS_ROTEIRO = [...FORMATOS_EXPLICACAO, "verificacao", "alternativa", "dissertativa", "ideia_central"] as const;
export type ItemRoteiro = (typeof ITENS_ROTEIRO)[number];

export const ehSituacaoModulo = (valor: unknown): valor is SituacaoModulo => (SITUACOES_MODULO as readonly unknown[]).includes(valor);
export const ehFormatoExplicacao = (valor: unknown): valor is FormatoExplicacao => (FORMATOS_EXPLICACAO as readonly unknown[]).includes(valor);
export const ehFormatoExemplo = (valor: unknown): valor is FormatoExemplo => (FORMATOS_EXEMPLO as readonly unknown[]).includes(valor);
export const ehTipoBloco = (valor: unknown): valor is TipoBloco => (TIPOS_BLOCO as readonly unknown[]).includes(valor);
export const ehPratica = (valor: unknown): valor is TipoPratica => (TIPOS_PRATICA as readonly unknown[]).includes(valor);
export const ehItemRoteiro = (valor: unknown): valor is ItemRoteiro => (ITENS_ROTEIRO as readonly unknown[]).includes(valor);

/** O mínimo de caracteres de uma explicação pelo formato: introdução 600, conceito e exemplos 900. */
export function minimoDeCaracteres(formato: FormatoExplicacao): number {
	if (formato === "introducao") return MINIMO_CARACTERES_INTRODUCAO;
	if (formato === "conceito") return MINIMO_CARACTERES_CONCEITO;
	return MINIMO_CARACTERES_EXEMPLO;
}

/** O que o Breno escreveu no formulário "Gerar módulo" (tudo opcional) e os materiais que mandou por ali. */
export interface PedidoModulo {
	/** "Informações específicas". Só aparece quando tem texto. */
	informacoes?: string;
	/** "Observações". Só aparece quando tem texto. */
	observacoes?: string;
	/** Os caminhos (dentro de materiais/) dos arquivos mandados pelo formulário. Só aparece quando não é vazia. */
	materiaisNovos?: string[];
	/** ISO 8601. */
	pedidoEm: string;
}

/** Um módulo aguardando material. */
export interface AguardandoMaterial {
	/** A nota opcional do Breno ("A aula 5 sai na quinta."); pode ser vazia. */
	nota: string;
	/** ISO 8601 de quando passou a aguardar. */
	desde: string;
	/** A foto dos materiais prontos da matéria naquele momento, para avisar quando chegar um novo (materialNovo). */
	prontos: ArquivoDoCurso[];
}

/**
 * As versões de um bloco (docs/escrita.md, "Reescrever um bloco"). Os blocos
 * gerados (e os gravados antes da reescrita) não têm esses campos: são a
 * versão 1 (versaoDoBloco). Reescrever põe o bloco novo no lugar com versao
 * + 1 e reescritoEm, e o antigo vai para anteriores (substituirBloco, em
 * escrita-tipos.ts). O id do bloco não muda.
 */
export interface VersoesDoBloco {
	/** 1 na geração, mais 1 a cada reescrita. Ausente = 1. */
	versao?: number;
	/** ISO 8601 da reescrita que gerou esta versão. */
	reescritoEm?: string;
	/** As versões anteriores, da mais antiga para a mais recente. */
	anteriores?: BlocoAnterior[];
}

/** Um bloco como estava antes de uma reescrita: inteiro, sem as anteriores dele (ficam na lista do bloco atual), com a versão, quando foi substituído e o id do evento de retorno que pediu a reescrita. */
export type BlocoAnterior = (
	| Omit<BlocoExplicacao, "anteriores">
	| Omit<BlocoVerificacao, "anteriores">
	| Omit<BlocoAlternativa, "anteriores">
	| Omit<BlocoDissertativa, "anteriores">
	| Omit<BlocoIdeiaCentral, "anteriores">
) & {
	versao: number;
	/** ISO 8601. */
	substituidoEm: string;
	/** O id do evento avaliou_bloco que pediu a reescrita. */
	retorno: string;
};

/** Uma explicação: markdown (docs/markdown-da-conversa.md) no formato escolhido pelo nível do conceito. */
export interface BlocoExplicacao extends VersoesDoBloco {
	/** l<n>-b<n>, dado pelo código. */
	id: string;
	tipo: "explicacao";
	/** Os ids dos conceitos da lição que o bloco cobre. */
	conceitos: string[];
	formato: FormatoExplicacao;
	texto: string;
	/** Os locais do material que o bloco cita, conferidos contra os trechos mandados ao modelo. */
	referencias: Referencia[];
	/** O que vai além do material (8.3, escopo "só o material": aparece marcado como complemento). Só aparece quando é verdadeiro. */
	complemento?: true;
}

/** Uma pergunta rápida para conferir o entendimento, com a resposta esperada. */
export interface BlocoVerificacao extends VersoesDoBloco {
	id: string;
	tipo: "verificacao";
	conceitos: string[];
	pergunta: string;
	respostaEsperada: string;
}

/** Uma questão de alternativa no formato das do diagnóstico, com as referências ao material. */
export interface BlocoAlternativa extends QuestaoAlternativa, VersoesDoBloco {
	referencias: Referencia[];
}

/** Uma dissertativa no formato das do diagnóstico (rubrica de 3 a 5 critérios), com as referências ao material. */
export interface BlocoDissertativa extends QuestaoDissertativa, VersoesDoBloco {
	referencias: Referencia[];
}

/** A ideia central da lição (docs/modulos.md, "O esquema da lição"): o que guardar, em 1 a 3 frases, logo antes da questão final. Não é questão. */
export interface BlocoIdeiaCentral extends VersoesDoBloco {
	id: string;
	tipo: "ideia_central";
	conceitos: string[];
	texto: string;
}

export type Bloco = BlocoExplicacao | BlocoVerificacao | BlocoAlternativa | BlocoDissertativa | BlocoIdeiaCentral;

/** A versão do bloco: a gravada, ou 1 (os blocos gerados não têm o campo). */
export const versaoDoBloco = (bloco: Pick<VersoesDoBloco, "versao">): number =>
	typeof bloco.versao === "number" && Number.isInteger(bloco.versao) && bloco.versao >= 1 ? bloco.versao : 1;

export interface Licao {
	/** l1, l2…, dado pelo código. */
	id: string;
	titulo: string;
	objetivo: string;
	/** Os ids dos conceitos do módulo que a lição cobre. */
	conceitos: string[];
	/** Na ordem, pelo esquema da lição (validarLicao). As lições gravadas antes do esquema seguem o formato antigo e continuam válidas para ler. */
	blocos: Bloco[];
}

/** Os campos de todo <módulo>.json. */
interface ModuloBase {
	versao: typeof VERSAO_MODULO;
	/** O id do módulo no esqueleto (m1, m2…). */
	id: string;
	/** O id do curso. */
	curso: string;
	/** O id da matéria. */
	materia: string;
	/** O formulário da última geração. Ausente num módulo marcado como aguardando sem ter sido gerado. */
	pedido?: PedidoModulo;
}

/** Um módulo aguardando material: sem lições. */
export interface ModuloAguardando extends ModuloBase {
	situacao: "aguardando_material";
	aguardando: AguardandoMaterial;
	licoes: Licao[];
}

/** Um módulo gerado. Gerar de novo substitui o arquivo inteiro. */
export interface ModuloGerado extends ModuloBase {
	situacao: "gerado";
	licoes: Licao[];
	/** ISO 8601. */
	geradoEm: string;
	/** provedor/id do modelo. */
	modelo: string;
	/** US$ da geração (o plano e as lições). */
	custo: number;
	/** Os materiais prontos (com o hash do manifesto) cujos trechos os conceitos do módulo citam. */
	materiaisUsados: ArquivoDoCurso[];
	/** ISO 8601: quando o Breno concluiu o módulo ("Concluir o módulo"). Concluído não volta atrás nem é gerado de novo. */
	concluidoEm?: string;
	/**
	 * As respostas das questões, pelo id do bloco (docs/modulos.md, "Onde as
	 * respostas ficam"; modulo-respostas-tipos.ts). Só aparece depois da
	 * primeira resposta. Gerar de novo substitui o arquivo sem elas; a
	 * reescrita de um bloco as mantém (a do bloco reescrito fica sem valor
	 * pela versão).
	 */
	respostas?: RespostasModulo;
	/**
	 * A última nota de cada bloco, pelo id do bloco (docs/modulos.md, "O
	 * feedback"; modulo-feedback-tipos.ts), com a versão do bloco avaliada.
	 * Só aparece depois da primeira nota. Gerar de novo começa sem ele; a
	 * reescrita de um bloco o mantém (a nota do bloco reescrito fica sem
	 * valor pela versão).
	 */
	feedback?: FeedbackModulo;
	/** O último questionário de cada lição, pelo id da lição ("O questionário do fim da lição"). Gerar de novo começa sem eles. */
	questionarios?: QuestionariosModulo;
	/**
	 * Os pedidos de explicação de um trecho ("Não sei o que é isso", "Explique
	 * melhor"), na ordem (docs/termos.md; termos-tipos.ts). Só aparece depois
	 * do primeiro. Gerar de novo começa sem nenhum; a reescrita de um bloco e
	 * as respostas os mantêm.
	 */
	explicacoes?: ExplicacaoPedida[];
}

/** O <módulo>.json. */
export type Modulo = ModuloAguardando | ModuloGerado;

// --- Ponte (painel "modulos") ----------------------------------------------------

/** Os dados de cada ação da tela para a extensão (interface:acao, painel modulos). O retorno e o reescrever_bloco estão em AcoesModulosEscrita (escrita-tipos.ts, docs/escrita.md). */
export interface AcoesModulos {
	/** O estado de todos os módulos do curso. */
	listar: { materia: string; curso: string };
	gerar: { materia: string; curso: string; modulo: string; pedido: string; informacoes?: string; observacoes?: string; materiaisNovos?: string[] };
	aguardar: { materia: string; curso: string; modulo: string; pedido: string; nota?: string };
	/** Para a geração; o que estava gravado antes fica. */
	cancelar: { materia: string; curso: string; modulo: string };
	/** Parte B: manda o módulo gerado inteiro. */
	abrir: { materia: string; curso: string; modulo: string };
	/** Conclui o módulo gerado (concluirModulo); a recomendação passa para o seguinte. */
	concluir: { materia: string; curso: string; modulo: string; pedido: string };
	/**
	 * Responde uma questão do módulo (docs/modulos.md, "Responder as
	 * questões"; responderQuestao): uma tentativa (a confiança na primeira, a
	 * escolha no quiz ou o texto na pergunta e na dissertativa, o tempoMs) ou
	 * "Não sei" (naoSei: true). Responde com o modulo com o pedido; a pergunta
	 * e a dissertativa vão com corrigindo, e a conferência chega depois num
	 * modulo sem pedido.
	 */
	responder: { materia: string; curso: string; modulo: string; pedido: string; bloco: string; confianca?: Confianca; escolha?: number; texto?: string; naoSei?: boolean; tempoMs?: number };
	/** Tenta de novo a conferência da última tentativa sem avaliação ou correção (a que falhou). */
	corrigir: { materia: string; curso: string; modulo: string; pedido: string; bloco: string };
	/** "Ver a resposta-modelo": a dissertativa corrigida passa a encerrada (encerrarQuestao). */
	encerrar: { materia: string; curso: string; modulo: string; pedido: string; bloco: string };
	/**
	 * A nota rápida de um bloco (docs/modulos.md, "O feedback"): grava o
	 * avaliou_bloco (sem motivos nem texto) e a nota em feedback; responde com
	 * o modulo com o pedido.
	 */
	avaliar_bloco: { materia: string; curso: string; modulo: string; licao: string; bloco: string; pedido: string; avaliacao: AvaliacaoNova };
	/**
	 * O questionário do fim da lição: grava o avaliou_licao e o questionário
	 * em questionarios; responde com o modulo com o pedido.
	 */
	avaliar_licao: { materia: string; curso: string; modulo: string; licao: string; pedido: string; notas: NotasLicao; texto?: string };
}

export type AcaoModulos = keyof AcoesModulos;

/** O estado de um módulo na tela: as duas situações gravadas e os estados da extensão. */
export type SituacaoNaTela = "a_gerar" | "esperando_materiais" | "planejando" | "escrevendo" | "gerado" | "aguardando_material" | "erro";

export interface EstadoModuloNaTela {
	id: string;
	situacao: SituacaoNaTela;
	/** Em escrevendo: a lição sendo escrita, a partir de 1. */
	licao?: number;
	/** Em escrevendo: quantas lições o plano tem. */
	licoes?: number;
	/** Em erro: a frase. */
	mensagem?: string;
	/** Em esperando_materiais: os materiais do formulário que ainda não ficaram prontos. */
	esperando?: string[];
	/** Em gerado. */
	geradoEm?: string;
	/** Em gerado: se o módulo foi concluído, e quando (ISO 8601). */
	concluido?: boolean;
	concluidoEm?: string;
	custo?: number;
	/** Em gerado: quantas lições, blocos e questões o módulo tem (resumoDoModulo). */
	licoesGeradas?: number;
	blocos?: number;
	questoes?: number;
	/** Em aguardando_material: a nota. */
	nota?: string;
	/** Em gerado, enquanto um bloco é reescrito (docs/escrita.md, "Ponte"): a lição e o bloco. */
	reescrevendo?: { licao: string; bloco: string };
	/** Em aguardando_material: os materiais prontos da matéria mudaram desde que ele começou a aguardar (materialNovo). */
	materialNovo?: boolean;
	/** Em gerado: as questões feitas (pergunta, quiz e dissertativa) de quantas, pelas respostas da versão atual de cada bloco (progressoDoModulo). */
	progresso?: Progresso;
}

/** A mensagem "estado" (interface:mostrar, gravar: false), mandada a cada mudança. */
export interface MensagemEstadoModulos {
	materia: string;
	curso: string;
	/** Na ordem do esqueleto. */
	modulos: EstadoModuloNaTela[];
	/** O recomendado, o "Próximo" (proximoModulo), ou null. */
	proximo?: string | null;
	/** O da tela, quando a mudança respondeu a gerar, aguardar ou concluir. */
	pedido?: string;
}

/** A mensagem "modulo" (parte B): o <módulo>.json inteiro, com as respostas. */
export interface MensagemModulo {
	materia: string;
	curso: string;
	modulo: Modulo;
	/** Os blocos do módulo cuja resposta está sendo conferida pelo modelo agora, na ordem do módulo (vazio sem nenhum). Vem em toda mensagem modulo. */
	corrigindo: string[];
	/** O da tela, quando a mensagem respondeu a responder, corrigir ou encerrar. */
	pedido?: string;
}

/** A mensagem "erro". */
export interface MensagemErroModulos {
	mensagem: string;
	/** A ação que falhou (listar, gerar, aguardar, concluir, responder, corrigir, encerrar, avaliar_bloco, avaliar_licao…). */
	ao?: string;
	materia?: string;
	curso?: string;
	modulo?: string;
	/** Em responder, corrigir, encerrar e avaliar_bloco: o bloco. */
	bloco?: string;
	pedido?: string;
}

/** As mensagens da extensão para a tela (interface:mostrar, painel modulos, sempre gravar: false). */
export interface MensagensModulos {
	estado: MensagemEstadoModulos;
	modulo: MensagemModulo;
	erro: MensagemErroModulos;
}

// --- O que os modelos devolvem ---------------------------------------------------

/** O que o modelo do plano (prompts/modulo-plano.md) devolve. */
export interface ResultadoPlano {
	licoes: Array<{
		titulo: string;
		objetivo: string;
		/** Os ids dos conceitos do módulo que a lição cobre. */
		conceitos: string[];
		/** A sequência dos blocos: a explicação pelo formato, os outros pelo tipo (ItemRoteiro). */
		roteiro: ItemRoteiro[];
	}>;
}

/** Uma referência como o modelo a devolve: o arquivo e o local de um trecho mandado na mensagem (o nome do trecho é o código que põe). */
export interface ReferenciaDoModelo {
	arquivo: string;
	local: string;
}

/** O que o modelo de cada lição (prompts/modulo-licao.md) devolve. */
export interface ResultadoLicao {
	blocos: Array<{
		tipo: TipoBloco;
		conceitos: string[];
		/** Na explicação. */
		formato?: FormatoExplicacao;
		/** Na explicação e na ideia central. */
		texto?: string;
		complemento?: boolean;
		/** Na explicação e nas questões. */
		referencias?: ReferenciaDoModelo[];
		/** Na verificação. */
		pergunta?: string;
		respostaEsperada?: string;
		/** Nas questões, como no diagnóstico (ResultadoGerador). */
		contexto?: string;
		enunciado?: string;
		alternativas?: Array<{ texto: string; correta?: boolean; confusao?: string }>;
		explicacao?: string;
		rubrica?: Array<{ criterio: string; descricao?: string; pontos: number }>;
		respostaModelo?: string;
	}>;
	/**
	 * Os termos novos da lição (docs/termos.md, "Na geração das lições"): a
	 * chave das marcas [texto](termo:novo-1), o termo, a definição, o conceito
	 * e a posição (a partir de 1) do bloco de explicação que o explica.
	 * Conferidos por validarLicao (conferirTermosDaLicao).
	 */
	termos?: TermoDoModelo[];
}

/** Uma lição do plano depois de validarPlano: com o id dado pelo código e o roteiro consertado pelo esquema da lição. */
export interface LicaoPlanejada {
	/** l1, l2… */
	id: string;
	titulo: string;
	objetivo: string;
	conceitos: string[];
	roteiro: ItemRoteiro[];
}

/**
 * As regras dos consertos do plano (ConsertoPlano). As do esquema da lição
 * (REGRAS_DO_ESQUEMA) são as que mudam a ordem dos blocos; as outras são as
 * de antes do esquema (o que o plano sempre consertou).
 */
export type RegraConserto =
	| "item_desconhecido"
	| "explicacao_sem_formato"
	| "introducao"
	| "questao_antes_do_conceito"
	| "questoes_seguidas"
	| "pergunta_fora_do_lugar"
	| "termina_sem_questao"
	| "ideia_central"
	| "licao_sem_conceitos"
	| "licoes_a_mais"
	| "conceito_sem_licao"
	| "dissertativa";

/** As regras de conserto que vêm do esquema da lição (docs/modulos.md, "O esquema da lição"). */
export const REGRAS_DO_ESQUEMA = [
	"explicacao_sem_formato",
	"introducao",
	"questao_antes_do_conceito",
	"questoes_seguidas",
	"pergunta_fora_do_lugar",
	"termina_sem_questao",
	"ideia_central",
] as const satisfies readonly RegraConserto[];

/** Um conserto que validarPlano fez: a lição (o id do plano consertado; null numa lição que saiu ou no plano todo), a regra e a frase. */
export interface ConsertoPlano {
	licao: string | null;
	regra: RegraConserto;
	mensagem: string;
}

// --- Funções -------------------------------------------------------------------

/** Um ErroCurso (a extensão mostra a frase como está), com o nome próprio dos módulos. */
export class ErroModulo extends ErroCurso {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroModulo";
	}
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));
/** Aparado nas pontas (markdown: o meio fica como veio). */
const textoLimpo = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
/** Numa linha só, sem espaços repetidos (títulos). */
const linhaLimpa = (valor: unknown) => (typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "");
/** Os ids de uma lista que vem do modelo: textos aparados, sem vazios e sem repetir, na ordem. */
const listaDeIds = (valor: unknown): string[] =>
	Array.isArray(valor) ? [...new Set((valor as unknown[]).filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))] : [];

// --- Qual módulo pode ser gerado ---------------------------------------------------

/** As situações gravadas dos módulos do curso, por id (um módulo sem arquivo não aparece). */
export type SituacoesModulos = Readonly<Record<string, SituacaoModulo | undefined>>;

/** Os ids dos módulos gerados e concluídos (com concluidoEm). */
export type ConcluidosModulos = readonly string[];

/**
 * O módulo recomendado, o "Próximo" (docs/modulos.md, "Qual módulo pode ser
 * gerado"): o primeiro do esqueleto, na ordem, que não está concluído e não
 * está aguardando material (gerado ou não). Concluir um módulo passa a
 * recomendação para o seguinte. Com todos concluídos ou aguardando, null.
 */
export function proximoModulo(esqueleto: Pick<Esqueleto, "modulos">, situacoes: SituacoesModulos, concluidos: ConcluidosModulos): string | null {
	return esqueleto.modulos.find(({ id }) => situacoes[id] !== "aguardando_material" && !(situacoes[id] === "gerado" && concluidos.includes(id)))?.id ?? null;
}

/**
 * Confere se o módulo pode ser gerado agora: qualquer um que não está
 * concluído (gerar de novo um gerado substitui a versão anterior; a tela
 * confirma antes). Devolve o módulo do esqueleto. Um concluído é ErroModulo
 * ("já foi concluído"); um curso que não está pronto, ou um módulo que não
 * está no esqueleto, também é ErroModulo.
 */
export function podeGerar(curso: Pick<Curso, "situacao" | "esqueleto">, situacoes: SituacoesModulos, modulo: string, concluidos: ConcluidosModulos): ModuloDoEsqueleto {
	const doEsqueleto = moduloDoEsqueleto(curso, modulo);
	if (situacoes[modulo] === "gerado" && concluidos.includes(modulo)) throw new ErroModulo("O módulo já foi concluído; um módulo concluído não é gerado de novo.");
	return doEsqueleto;
}

/** O módulo do esqueleto do curso pronto. Curso que não está pronto, ou módulo que não está no esqueleto, ErroModulo. */
export function moduloDoEsqueleto(curso: Pick<Curso, "situacao" | "esqueleto">, modulo: string): ModuloDoEsqueleto {
	if (curso.situacao !== "pronto" || !curso.esqueleto) throw new ErroModulo("O curso ainda não foi criado; os módulos são gerados depois de criar o curso.");
	const achado = curso.esqueleto.modulos.find((item) => item.id === modulo);
	if (!achado) throw new ErroModulo(`Não achei o módulo "${mostrar(modulo)}" no esqueleto do curso.`);
	return achado;
}

/**
 * Se os materiais prontos da matéria mudaram desde que o módulo começou a
 * aguardar: algum arquivo pronto que não está na foto, ou que está com outro
 * hash. Um arquivo que só saiu não é material novo. Sem aguardando, false.
 */
export function materialNovo(aguardando: Pick<AguardandoMaterial, "prontos"> | null | undefined, prontos: readonly ArquivoDoCurso[]): boolean {
	if (!aguardando) return false;
	const antes = new Map(aguardando.prontos.map((item) => [item.arquivo, item.hash]));
	return prontos.some((item) => antes.get(item.arquivo) !== item.hash);
}

// --- O nível de cada conceito --------------------------------------------------------

const ORDEM_NIVEL: Record<NivelConceito, number> = { iniciante: 0, intermediario: 1, domina: 2 };

/**
 * Os níveis dos conceitos (docs/modulos.md, "O nível de cada conceito"), a
 * partir do diagnóstico concluído do curso. O que ele disse: "nunca vi" e
 * "já ouvi falar", iniciante; "sei explicar", intermediário; "sei aplicar",
 * domina; sem autoavaliação, iniciante. As questões do conceito (respondidas
 * e, na dissertativa, corrigidas): o desempenho médio (alternativa certa 1,
 * errada 0; dissertativa total/max) 1 é acertou, 0 é errou, entre os dois é
 * acertou em parte; errou, iniciante; em parte, intermediário; acertou, sem
 * limite. O nível é o menor dos dois; sem questão, vale o que ele disse. Sem
 * diagnóstico, todos iniciante.
 */
export function niveisDosConceitos(diagnostico: DiagnosticoEmAndamento | null | undefined, conceitos: readonly string[]): Record<string, NivelConceito> {
	const saida: Record<string, NivelConceito> = {};
	if (!diagnostico) {
		for (const id of conceitos) saida[id] = "iniciante";
		return saida;
	}
	const resumo = resumoDoDiagnostico(diagnostico, conceitos);
	for (const conceito of resumo.conceitos) {
		const disse: NivelConceito = conceito.nivel === 3 ? "domina" : conceito.nivel === 2 ? "intermediario" : "iniciante";
		if (conceito.questoes.length === 0) {
			saida[conceito.id] = disse;
			continue;
		}
		const desempenhos = conceito.questoes.map((questao) =>
			questao.nota ? (questao.nota.max > 0 ? questao.nota.total / questao.nota.max : 0) : questao.resultado === "certa" ? 1 : 0,
		);
		const media = desempenhos.reduce((soma, valor) => soma + valor, 0) / desempenhos.length;
		const pelasQuestoes: NivelConceito = media >= 1 ? "domina" : media <= 0 ? "iniciante" : "intermediario";
		saida[conceito.id] = ORDEM_NIVEL[pelasQuestoes] < ORDEM_NIVEL[disse] ? pelasQuestoes : disse;
	}
	return saida;
}

/** O nível de um conceito (niveisDosConceitos com um conceito só). */
export function nivelDoConceito(diagnostico: DiagnosticoEmAndamento | null | undefined, conceito: string): NivelConceito {
	return niveisDosConceitos(diagnostico, [conceito])[conceito]!;
}

/** Os níveis dos conceitos do módulo do esqueleto, na ordem do módulo. */
export function niveisDoModulo(diagnostico: DiagnosticoEmAndamento | null | undefined, modulo: Pick<ModuloDoEsqueleto, "conceitos">): Record<string, NivelConceito> {
	return niveisDosConceitos(diagnostico, modulo.conceitos);
}

// --- O esquema da lição -------------------------------------------------------------------

/** O item do roteiro de um bloco: a explicação pelo formato (sem formato, conceito), os outros pelo tipo. */
export function itemDoRoteiro(bloco: Pick<Bloco, "tipo"> & { formato?: FormatoExplicacao }): ItemRoteiro {
	return bloco.tipo === "explicacao" ? (bloco.formato ?? "conceito") : bloco.tipo;
}

/** O roteiro de uma lição escrita (itemDoRoteiro de cada bloco, na ordem). */
export function roteiroDaLicao(licao: Pick<Licao, "blocos">): ItemRoteiro[] {
	return licao.blocos.map(itemDoRoteiro);
}

/** As regras do esquema que violacoesDoEsquema confere. */
export type RegraEsquema = "introducao" | "sem_conceito" | "questao_antes_do_conceito" | "questoes_seguidas" | "pergunta_fora_do_lugar" | "ideia_central";

/** Uma regra do esquema que o roteiro não segue, no item `indice` (-1 quando é a lição toda: sem_conceito). */
export interface ViolacaoEsquema {
	regra: RegraEsquema;
	indice: number;
}

/** A questão final da lição: o último quiz (alternativa) ou dissertativa; sem nenhum, -1. A pergunta (verificacao) não conta. */
export function indiceDaQuestaoFinal(roteiro: readonly ItemRoteiro[]): number {
	for (let indice = roteiro.length - 1; indice >= 0; indice--) if (roteiro[indice] === "alternativa" || roteiro[indice] === "dissertativa") return indice;
	return -1;
}

/**
 * Confere um roteiro (o do plano, ou o de uma lição escrita: roteiroDaLicao)
 * pelo esquema da lição (docs/modulos.md, "O esquema da lição"):
 * - começa pela introdução (explicação de formato introducao);
 * - tem um conceito (sem ele, sem_conceito, e as regras das questões não são
 *   conferidas);
 * - nenhuma questão (verificacao, alternativa, dissertativa) antes do
 *   primeiro conceito;
 * - nunca duas questões seguidas (a ideia central e as explicações separam);
 * - toda pergunta (verificacao) vem logo depois de um conceito ou de um
 *   exemplo;
 * - com quiz ou dissertativa, a ideia central vem logo antes da questão final
 *   (indiceDaQuestaoFinal).
 * Cada item que falha aparece uma vez (na primeira regra que falha). Sem
 * nenhuma, [].
 */
export function violacoesDoEsquema(roteiro: readonly ItemRoteiro[]): ViolacaoEsquema[] {
	const saida: ViolacaoEsquema[] = [];
	if (roteiro[0] !== "introducao") saida.push({ regra: "introducao", indice: 0 });
	const primeiro = roteiro.indexOf("conceito");
	if (primeiro < 0) return [...saida, { regra: "sem_conceito", indice: -1 }];
	for (const [indice, item] of roteiro.entries()) {
		if (!ehPratica(item)) continue;
		const anterior = roteiro[indice - 1];
		if (indice < primeiro) saida.push({ regra: "questao_antes_do_conceito", indice });
		else if (ehPratica(anterior)) saida.push({ regra: "questoes_seguidas", indice });
		else if (item === "verificacao" && anterior !== "conceito" && !ehFormatoExemplo(anterior)) saida.push({ regra: "pergunta_fora_do_lugar", indice });
	}
	const final = indiceDaQuestaoFinal(roteiro);
	if (final >= 0 && roteiro[final - 1] !== "ideia_central") saida.push({ regra: "ideia_central", indice: final });
	return saida;
}

/** As frases de um texto: os pedaços separados por ponto, interrogação, exclamação ou reticências seguidos de espaço. Vazio, 0. */
export function frasesDoTexto(texto: string): number {
	const limpo = texto.trim();
	if (!limpo) return 0;
	return limpo.split(/(?<=[.!?…])\s+/u).filter((pedaco) => pedaco.trim()).length;
}

/** Os caracteres de uma lição: nas explicações e na ideia central, nas questões, o total e a parte das explicações (de 0 a 1). */
export interface CaracteresDaLicao {
	explicacoes: number;
	questoes: number;
	total: number;
	proporcao: number;
}

/**
 * Conta os caracteres da lição para a proporção do esquema: as explicações e
 * a ideia central pelo texto; as questões pelo que o aluno lê antes de
 * responder (a pergunta da verificação; o contexto, o enunciado e as
 * alternativas do quiz; o contexto e o enunciado da dissertativa). O
 * gabarito (resposta esperada, explicação, confusões, rubrica,
 * resposta-modelo) não conta. Sem caracteres, proporção 0.
 */
export function caracteresDaLicao(blocos: readonly (Bloco | BlocoSemId)[]): CaracteresDaLicao {
	let explicacoes = 0;
	let questoes = 0;
	for (const bloco of blocos) {
		if (bloco.tipo === "explicacao" || bloco.tipo === "ideia_central") explicacoes += bloco.texto.length;
		else if (bloco.tipo === "verificacao") questoes += bloco.pergunta.length;
		else {
			questoes += (bloco.contexto ?? "").length + bloco.enunciado.length;
			if (bloco.tipo === "alternativa") for (const alternativa of bloco.alternativas) questoes += alternativa.texto.length;
		}
	}
	const total = explicacoes + questoes;
	return { explicacoes, questoes, total, proporcao: total > 0 ? explicacoes / total : 0 };
}

/** O que dizer ao modelo para desenvolver uma explicação curta, pelo formato. */
const DICA_DO_FORMATO = (formato: FormatoExplicacao): string =>
	formato === "introducao"
		? "Desenvolva o contexto: o que é o tema, por que importa e onde se usa."
		: formato === "conceito"
			? "Desenvolva o porquê e um exemplo."
			: "Desenvolva o exemplo passo a passo e explique cada passo, não só o código.";

/**
 * Se a explicação está abaixo do mínimo do formato (minimoDeCaracteres), a
 * frase para o modelo ("A explicação l2-b3 (conceito) tem 420 caracteres; o
 * mínimo é 900. Desenvolva o porquê e um exemplo."); senão, undefined. O
 * `nome` é como o bloco aparece na frase (o id, ou "do bloco reescrito").
 */
export function problemaDoTamanho(bloco: Pick<BlocoExplicacao, "formato" | "texto">, nome: string): string | undefined {
	const minimo = minimoDeCaracteres(bloco.formato);
	const tamanho = bloco.texto.length;
	if (tamanho >= minimo) return undefined;
	return `A explicação ${nome} (${bloco.formato}) tem ${tamanho} caracteres; o mínimo é ${minimo}. ${DICA_DO_FORMATO(bloco.formato)}`;
}

/** Como um bloco aparece nas frases para o modelo: "l2-b3 (conceito)". */
const nomeDoBloco = (bloco: Pick<Bloco, "id" | "tipo"> & { formato?: FormatoExplicacao }) => `${bloco.id} (${itemDoRoteiro(bloco)})`;

/**
 * Os problemas de uma lição escrita pelo esquema da lição, como frases que
 * dizem ao modelo o que corrigir (a extensão manda na nova tentativa): a
 * ordem dos blocos (violacoesDoEsquema), o tamanho de cada explicação
 * (problemaDoTamanho) e a parte dos caracteres nas explicações
 * (caracteresDaLicao, PROPORCAO_MINIMA_EXPLICACAO). Sem problemas, [].
 */
export function problemasDaLicao(blocos: readonly Bloco[]): string[] {
	const problemas: string[] = [];
	const roteiro = blocos.map(itemDoRoteiro);
	for (const { regra, indice } of violacoesDoEsquema(roteiro)) {
		const bloco = blocos[indice];
		const anterior = blocos[indice - 1];
		if (regra === "introducao") {
			problemas.push(
				`A lição começa por ${bloco ? nomeDoBloco(bloco) : "nada"}; o primeiro bloco precisa ser a introdução (explicação de formato "introducao": o que é o tema, por que importa e onde se usa).`,
			);
		} else if (regra === "sem_conceito") {
			problemas.push('A lição não tem nenhuma explicação de formato "conceito"; cada ideia começa por um conceito (a teoria, com o porquê), antes do exemplo e das questões.');
		} else if (regra === "questao_antes_do_conceito") {
			problemas.push(`A questão ${nomeDoBloco(bloco!)} vem antes do primeiro conceito; nenhuma questão antes de apresentar o conceito.`);
		} else if (regra === "questoes_seguidas") {
			problemas.push(`As questões ${nomeDoBloco(anterior!)} e ${nomeDoBloco(bloco!)} estão seguidas; ponha uma explicação entre elas ou tire uma.`);
		} else if (regra === "pergunta_fora_do_lugar") {
			problemas.push(`A pergunta ${nomeDoBloco(bloco!)} vem depois de ${nomeDoBloco(anterior!)}; uma pergunta (verificacao) vem logo depois de um conceito ou de um exemplo.`);
		} else {
			problemas.push(`Falta a ideia central (bloco "ideia_central", de 1 a 3 frases) logo antes da questão final ${nomeDoBloco(bloco!)}.`);
		}
	}
	for (const bloco of blocos) {
		if (bloco.tipo !== "explicacao") continue;
		const problema = problemaDoTamanho(bloco, bloco.id);
		if (problema) problemas.push(problema);
	}
	const { proporcao, total } = caracteresDaLicao(blocos);
	if (total > 0 && proporcao < PROPORCAO_MINIMA_EXPLICACAO) {
		problemas.push(
			`As explicações (introdução, conceitos, exemplos e ideia central) têm ${Math.floor(proporcao * 100)} % dos caracteres da lição; o mínimo é ${Math.round(PROPORCAO_MINIMA_EXPLICACAO * 100)} %. Desenvolva mais as explicações ou enxugue as questões.`,
		);
	}
	return problemas;
}

// --- A metodologia em arquivos ----------------------------------------------------------

/** O arquivo da estrutura da lição (profiles/estudos/metodo/), que o plano e cada lição carregam. */
export const ARQUIVO_ESTRUTURA_LICAO = "estrutura-da-licao.md";

/** O arquivo dos termos-chave (docs/termos.md), que toda lição, a reescrita de um bloco, "Marcar os termos" e a explicação de um trecho carregam. */
export const ARQUIVO_TERMOS = "termos.md";

/** Os arquivos da metodologia (docs/modulos.md, "A metodologia em arquivos"), na ordem em que arquivosDeMetodo os devolve. */
export const ARQUIVOS_METODO = [
	ARQUIVO_ESTRUTURA_LICAO,
	"introducao.md",
	"conceito.md",
	"exemplos.md",
	"pergunta.md",
	"ideia-central.md",
	"quiz.md",
	"dissertativa.md",
	ARQUIVO_TERMOS,
] as const;
export type ArquivoMetodo = (typeof ARQUIVOS_METODO)[number];

/** O arquivo da metodologia de um item do roteiro (o da reescrita de um bloco: arquivoDeMetodo(itemDoRoteiro(bloco))). */
export function arquivoDeMetodo(item: ItemRoteiro): ArquivoMetodo {
	if (item === "introducao") return "introducao.md";
	if (item === "conceito") return "conceito.md";
	if (ehFormatoExemplo(item)) return "exemplos.md";
	if (item === "verificacao") return "pergunta.md";
	if (item === "ideia_central") return "ideia-central.md";
	if (item === "alternativa") return "quiz.md";
	return "dissertativa.md";
}

/**
 * Os arquivos da metodologia que a chamada de uma lição carrega: a estrutura
 * da lição, os dos itens do roteiro (arquivoDeMetodo) e os termos-chave
 * (docs/termos.md), sem repetir, na ordem de ARQUIVOS_METODO. Itens que não
 * são do roteiro são ignorados.
 */
export function arquivosDeMetodo(roteiro: readonly unknown[]): ArquivoMetodo[] {
	const usados = new Set<ArquivoMetodo>([ARQUIVO_ESTRUTURA_LICAO, ARQUIVO_TERMOS]);
	for (const item of roteiro) if (ehItemRoteiro(item)) usados.add(arquivoDeMetodo(item));
	return ARQUIVOS_METODO.filter((arquivo) => usados.has(arquivo));
}

// --- O plano ---------------------------------------------------------------------------

/** Quantas lições um módulo de `horas` horas pede: uma por uns 50 minutos (40 a 60), arredondado, de 1 a 6. */
export function licoesPorHoras(horas: number): number {
	if (typeof horas !== "number" || !Number.isFinite(horas) || horas <= 0) return LICOES_MINIMAS;
	return Math.min(LICOES_MAXIMAS, Math.max(LICOES_MINIMAS, Math.round((horas * 60) / MINUTOS_POR_LICAO)));
}

/** Um conserto de uma lição, antes de saber como a frase começa. */
type ConsertoDaLicao = { regra: RegraConserto; texto: string };

/** "verificacao", "verificacao e alternativa", "a, b e c". */
const listaComE = (itens: readonly string[]) => (itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

/**
 * Lê o roteiro que o modelo devolveu: só itens do roteiro (ITENS_ROTEIRO,
 * aparados); um item desconhecido sai. Uma "explicacao" sem formato (o
 * roteiro de antes do esquema) vira, pela posição: a introdução no começo, o
 * exemplo (`exemplo`, o formato do nível) logo depois de um conceito, e o
 * conceito no resto.
 */
function lerRoteiro(valor: unknown, exemplo: FormatoExemplo): { roteiro: ItemRoteiro[]; consertos: ConsertoDaLicao[] } {
	const roteiro: ItemRoteiro[] = [];
	const desconhecidos: string[] = [];
	const semFormato: ItemRoteiro[] = [];
	for (const item of Array.isArray(valor) ? (valor as unknown[]) : []) {
		const limpo = typeof item === "string" ? item.trim() : item;
		if (ehItemRoteiro(limpo)) roteiro.push(limpo);
		else if (limpo === "explicacao") {
			const virou: ItemRoteiro = roteiro.length === 0 ? "introducao" : roteiro.at(-1) === "conceito" ? exemplo : "conceito";
			roteiro.push(virou);
			semFormato.push(virou);
		} else desconhecidos.push(`"${mostrar(limpo)}"`);
	}
	const consertos: ConsertoDaLicao[] = [];
	if (desconhecidos.length > 0) consertos.push({ regra: "item_desconhecido", texto: `${desconhecidos.length === 1 ? "o item desconhecido" : "os itens desconhecidos"} ${listaComE(desconhecidos)} ${desconhecidos.length === 1 ? "saiu" : "saíram"} do roteiro` });
	if (semFormato.length > 0) consertos.push({ regra: "explicacao_sem_formato", texto: `${semFormato.length === 1 ? "a explicação sem formato virou" : "as explicações sem formato viraram"} ${listaComE(semFormato)}, pela posição` });
	return { roteiro, consertos };
}

/** Tira a segunda de cada par de questões seguidas (as que sobram continuam separadas). */
function semQuestoesSeguidas(roteiro: readonly ItemRoteiro[], consertos: ConsertoDaLicao[]): ItemRoteiro[] {
	const saida: ItemRoteiro[] = [];
	const tiradas: ItemRoteiro[] = [];
	for (const item of roteiro) {
		if (ehPratica(item) && ehPratica(saida.at(-1))) tiradas.push(item);
		else saida.push(item);
	}
	if (tiradas.length > 0) consertos.push({ regra: "questoes_seguidas", texto: `havia questões seguidas; ${tiradas.length === 1 ? "saiu a segunda" : "saíram as segundas"} (${listaComE(tiradas)})` });
	return saida;
}

/**
 * Conserta o roteiro de uma lição pelo esquema da lição, na ordem: a
 * introdução no começo (a que faltava entra; a que estava em outro lugar vai
 * para o começo; as a mais saem); sem nenhum conceito, null (não dá para
 * consertar); as questões antes do primeiro conceito saem; a pergunta que
 * não vem logo depois de um conceito ou exemplo sai; das questões seguidas,
 * sai a segunda; se não termina com uma questão, um quiz no fim; com quiz ou
 * dissertativa, uma ideia central só, logo antes da questão final (a que
 * faltava entra, a que estava em outro lugar vai para lá); e as questões
 * seguidas de novo (tirar a ideia central de um lugar pode juntar duas).
 */
function consertarRoteiro(lido: readonly ItemRoteiro[]): { roteiro: ItemRoteiro[]; consertos: ConsertoDaLicao[] } | null {
	const consertos: ConsertoDaLicao[] = [];
	let roteiro = [...lido];

	const introducoes = roteiro.filter((item) => item === "introducao").length;
	if (roteiro[0] !== "introducao" || introducoes > 1) {
		const texto =
			introducoes === 0
				? "faltava a introdução; entrou uma no começo do roteiro"
				: roteiro[0] === "introducao"
					? "havia mais de uma introdução; ficou só a do começo"
					: "a introdução não era o primeiro bloco; foi para o começo";
		roteiro = ["introducao", ...roteiro.filter((item) => item !== "introducao")];
		consertos.push({ regra: "introducao", texto });
	}

	const primeiro = roteiro.indexOf("conceito");
	if (primeiro < 0) return null;
	const antes = roteiro.slice(0, primeiro).filter(ehPratica);
	if (antes.length > 0) {
		roteiro = roteiro.filter((item, indice) => indice >= primeiro || !ehPratica(item));
		consertos.push({ regra: "questao_antes_do_conceito", texto: `${antes.length === 1 ? "a questão" : "as questões"} antes do primeiro conceito (${listaComE(antes)}) ${antes.length === 1 ? "saiu" : "saíram"}` });
	}

	const noLugar: ItemRoteiro[] = [];
	let foraDoLugar = 0;
	for (const item of roteiro) {
		const anterior = noLugar.at(-1);
		if (item === "verificacao" && anterior !== "conceito" && !ehFormatoExemplo(anterior)) foraDoLugar++;
		else noLugar.push(item);
	}
	if (foraDoLugar > 0) {
		roteiro = noLugar;
		consertos.push({ regra: "pergunta_fora_do_lugar", texto: `${foraDoLugar === 1 ? "uma pergunta (verificacao) que não vinha" : `${foraDoLugar} perguntas (verificacao) que não vinham`} logo depois de um conceito ou exemplo ${foraDoLugar === 1 ? "saiu" : "saíram"}` });
	}

	roteiro = semQuestoesSeguidas(roteiro, consertos);

	if (!ehPratica(roteiro.at(-1))) {
		roteiro.push("alternativa");
		consertos.push({ regra: "termina_sem_questao", texto: "o roteiro não terminava com uma questão; entrou um quiz (alternativa) no fim" });
	}

	const final = indiceDaQuestaoFinal(roteiro);
	const ideias = roteiro.filter((item) => item === "ideia_central").length;
	if (final >= 0 && (roteiro[final - 1] !== "ideia_central" || ideias !== 1)) {
		const semIdeia: ItemRoteiro[] = roteiro.filter((item) => item !== "ideia_central");
		const naFinal = indiceDaQuestaoFinal(semIdeia);
		const questao = semIdeia[naFinal]!;
		semIdeia.splice(naFinal, 0, "ideia_central");
		roteiro = semIdeia;
		const texto =
			ideias === 0
				? `faltava a ideia central; entrou uma logo antes da questão final (${questao})`
				: ideias === 1
					? `a ideia central foi para logo antes da questão final (${questao})`
					: `havia ${ideias} ideias centrais; ficou uma, logo antes da questão final (${questao})`;
		consertos.push({ regra: "ideia_central", texto });
	}

	roteiro = semQuestoesSeguidas(roteiro, consertos);
	return { roteiro, consertos };
}

/** O formato do exemplo de uma lição: o do nível mais baixo dos conceitos dela (sem níveis, o do iniciante). */
function formatoDoExemploDaLicao(conceitos: readonly string[], niveis: Readonly<Record<string, NivelConceito>> | undefined): FormatoExemplo {
	let nivel: NivelConceito | undefined;
	for (const id of conceitos) {
		const doConceito = niveis?.[id];
		if (doConceito && (nivel === undefined || ORDEM_NIVEL[doConceito] < ORDEM_NIVEL[nivel])) nivel = doConceito;
	}
	return FORMATO_DO_NIVEL[nivel ?? "iniciante"];
}

export interface OpcoesPlano {
	conceitosDoModulo: readonly string[];
	licoes: number;
	tipo?: TipoCurso;
	/** Os níveis dos conceitos (niveisDoModulo): escolhem o formato do exemplo de uma "explicacao" sem formato. Sem eles, exemplo_resolvido. */
	niveis?: Readonly<Record<string, NivelConceito>>;
}

/**
 * Confere e conserta o plano que o modelo devolveu (ResultadoPlano) e devolve
 * as lições com ids l1, l2… na ordem e a lista do que foi consertado (para a
 * extensão decidir se pede uma nova tentativa; REGRAS_DO_ESQUEMA diz quais
 * consertos são do esquema da lição):
 * - conceitos só do módulo (os outros saem, sem repetir na lição); uma lição
 *   sem nenhum conceito do módulo (ou que não é objeto) sai;
 * - título numa linha (vazio vira "Lição N"); objetivo aparado (pode ser
 *   vazio);
 * - o roteiro só com itens que existem (lerRoteiro) e consertado pelo esquema
 *   da lição (consertarRoteiro); um roteiro sem nenhum conceito não tem
 *   conserto seguro: ErroModulo (a extensão tenta de novo);
 * - até `licoes` lições (licoesPorHoras): as que passam saem, e os conceitos
 *   delas entram pela regra seguinte;
 * - os conceitos do módulo que nenhuma lição cobriu entram no fim da última,
 *   na ordem do módulo;
 * - com `tipo` teórico ou misto e nenhuma dissertativa no plano, uma
 *   dissertativa na última lição: no lugar do quiz final (depois dele não
 *   cabe outra questão) ou, sem quiz final, no fim, com a ideia central
 *   antes.
 * Sem nenhuma lição que valha, ErroModulo.
 */
export function conferirPlano(resultado: unknown, opcoes: OpcoesPlano): { licoes: LicaoPlanejada[]; consertos: ConsertoPlano[] } {
	if (!ehObjeto(resultado) || !Array.isArray(resultado.licoes)) throw new ErroModulo('O modelo não devolveu a lista de lições (falta "licoes").');
	const doModulo = [...new Set(opcoes.conceitosDoModulo)];
	const permitidos = new Set(doModulo);
	const maximo = Math.min(LICOES_MAXIMAS, Math.max(LICOES_MINIMAS, Math.floor(opcoes.licoes) || LICOES_MINIMAS));
	const lidas: Array<LicaoPlanejada & { consertos: ConsertoDaLicao[] }> = [];
	const doPlano: ConsertoPlano[] = [];
	const itens = resultado.licoes as unknown[];
	for (const [posicao, item] of itens.entries()) {
		if (lidas.length >= maximo) {
			doPlano.push({ licao: null, regra: "licoes_a_mais", mensagem: `O plano veio com ${itens.length} lições; ficaram as ${maximo} primeiras que valem, e as outras saíram.` });
			break;
		}
		if (!ehObjeto(item)) {
			doPlano.push({ licao: null, regra: "licao_sem_conceitos", mensagem: `A ${posicao + 1}ª lição do plano não é um objeto; saiu.` });
			continue;
		}
		const conceitos = listaDeIds(item.conceitos).filter((id) => permitidos.has(id));
		const titulo = linhaLimpa(item.titulo);
		if (conceitos.length === 0) {
			doPlano.push({ licao: null, regra: "licao_sem_conceitos", mensagem: `A ${posicao + 1}ª lição do plano${titulo ? ` ("${titulo}")` : ""} não cita nenhum conceito do módulo; saiu.` });
			continue;
		}
		const id = `l${lidas.length + 1}`;
		const nome = titulo || `Lição ${lidas.length + 1}`;
		const lido = lerRoteiro(item.roteiro, formatoDoExemploDaLicao(conceitos, opcoes.niveis));
		const consertado = consertarRoteiro(lido.roteiro);
		if (!consertado) {
			throw new ErroModulo(
				`A lição ${id} do plano ("${nome}") não tem nenhum conceito no roteiro: cada ideia da lição começa por uma explicação de formato "conceito". Refaça o roteiro pelo esquema da lição.`,
			);
		}
		lidas.push({ id, titulo: nome, objetivo: textoLimpo(item.objetivo), conceitos, roteiro: consertado.roteiro, consertos: [...lido.consertos, ...consertado.consertos] });
	}
	if (lidas.length === 0) throw new ErroModulo("O modelo não devolveu nenhuma lição com conceitos do módulo.");
	const cobertos = new Set(lidas.flatMap((licao) => licao.conceitos));
	const ultima = lidas.at(-1)!;
	const faltaram = doModulo.filter((id) => !cobertos.has(id));
	if (faltaram.length > 0) {
		ultima.conceitos.push(...faltaram);
		ultima.consertos.push({ regra: "conceito_sem_licao", texto: `${faltaram.length === 1 ? "o conceito" : "os conceitos"} ${listaComE(faltaram)}, que nenhuma lição cobria, ${faltaram.length === 1 ? "entrou" : "entraram"} nesta (a última)` });
	}
	if ((opcoes.tipo === "teorico" || opcoes.tipo === "misto") && !lidas.some((licao) => licao.roteiro.includes("dissertativa"))) {
		// Depois do quiz final não cabe outra questão (nunca duas seguidas): a dissertativa toma o lugar dele.
		const final = indiceDaQuestaoFinal(ultima.roteiro);
		if (final >= 0) {
			ultima.roteiro[final] = "dissertativa";
			ultima.consertos.push({ regra: "dissertativa", texto: "o curso é teórico ou misto e o plano não tinha dissertativa; o quiz final desta lição (a última) virou uma dissertativa" });
		} else {
			const semIdeia = semQuestoesSeguidas(
				ultima.roteiro.filter((item) => item !== "ideia_central"),
				ultima.consertos,
			);
			ultima.roteiro = [...semIdeia, "ideia_central", "dissertativa"];
			ultima.consertos.push({ regra: "dissertativa", texto: "o curso é teórico ou misto e o plano não tinha dissertativa; entrou uma no fim desta lição (a última), com a ideia central antes" });
		}
	}
	for (const licao of lidas) {
		const sobrou = violacoesDoEsquema(licao.roteiro);
		if (sobrou.length > 0) throw new ErroModulo(`O roteiro da lição ${licao.id} do plano não segue o esquema da lição (${sobrou.map((item) => item.regra).join(", ")}).`);
	}
	const consertos: ConsertoPlano[] = [
		...doPlano,
		...lidas.flatMap((licao) => licao.consertos.map(({ regra, texto }) => ({ licao: licao.id, regra, mensagem: `Lição ${licao.id} ("${licao.titulo}"): ${texto}.` }))),
	];
	return { licoes: lidas.map(({ consertos: _consertos, ...licao }) => licao), consertos };
}

/** O plano conferido e consertado (conferirPlano), só com as lições: o que a extensão usa quando não precisa saber o que foi consertado. */
export function validarPlano(resultado: unknown, opcoes: OpcoesPlano): LicaoPlanejada[] {
	return conferirPlano(resultado, opcoes).licoes;
}

// --- As lições -------------------------------------------------------------------------

/**
 * As referências de um bloco, como no mapa (docs/mapa-conteudo.md, regra 2):
 * um local só vale se for exatamente o local de um trecho mandado (do mesmo
 * arquivo); o resto é descartado. O nome do trecho vem da lista, não do
 * modelo. Sem repetir, na ordem.
 */
function lerReferencias(valor: unknown, trechos: readonly Referencia[]): Referencia[] {
	const saida: Referencia[] = [];
	for (const item of Array.isArray(valor) ? (valor as unknown[]) : []) {
		if (!ehObjeto(item) || typeof item.arquivo !== "string" || typeof item.local !== "string") continue;
		const achado = trechos.find((trecho) => trecho.arquivo === (item.arquivo as string).trim() && trecho.local === (item.local as string).trim());
		if (!achado || saida.some((ja) => ja.arquivo === achado.arquivo && ja.local === achado.local)) continue;
		saida.push({ arquivo: achado.arquivo, local: achado.local, trecho: achado.trecho });
	}
	return saida;
}

/** Um bloco sem o id (o que validarBloco devolve; o id é dado pelo código). */
export type BlocoSemId =
	| Omit<BlocoExplicacao, "id">
	| Omit<BlocoVerificacao, "id">
	| Omit<BlocoAlternativa, "id">
	| Omit<BlocoDissertativa, "id">
	| Omit<BlocoIdeiaCentral, "id">;

/** Lê um bloco do modelo: o bloco limpo, ou o motivo do descarte. */
function lerBloco(item: unknown, permitidos: ReadonlySet<string>, trechos: readonly Referencia[], escopo: Escopo): { bloco: BlocoSemId } | { motivo: string } {
	if (!ehObjeto(item)) return { motivo: "não é um objeto" };
	if (!ehTipoBloco(item.tipo)) return { motivo: `tipo desconhecido ("${mostrar(item.tipo)}")` };
	const citados = listaDeIds(item.conceitos);
	if (citados.length === 0) return { motivo: "sem conceitos" };
	const conceitos = citados.filter((id) => permitidos.has(id));
	if (conceitos.length === 0) return { motivo: `cita só conceitos fora da lição (${citados.join(", ")})` };
	const referencias = escopo === "livre" ? [] : lerReferencias(item.referencias, trechos);

	if (item.tipo === "explicacao") {
		const texto = textoLimpo(item.texto);
		if (!texto) return { motivo: "explicação vazia" };
		if (!ehFormatoExplicacao(item.formato)) return { motivo: `formato de explicação desconhecido ("${mostrar(item.formato)}")` };
		const complemento = escopo === "so_material" ? item.complemento === true || referencias.length === 0 : escopo === "material_base" && item.complemento === true;
		return { bloco: { tipo: "explicacao", conceitos, formato: item.formato, texto, referencias, ...(complemento ? { complemento: true as const } : {}) } };
	}
	if (item.tipo === "verificacao") {
		const pergunta = textoLimpo(item.pergunta);
		const respostaEsperada = textoLimpo(item.respostaEsperada);
		if (!pergunta) return { motivo: "verificação sem pergunta" };
		if (!respostaEsperada) return { motivo: "verificação sem a resposta esperada" };
		return { bloco: { tipo: "verificacao", conceitos, pergunta, respostaEsperada } };
	}
	if (item.tipo === "ideia_central") {
		const texto = textoLimpo(item.texto);
		if (!texto) return { motivo: "ideia central vazia" };
		const frases = frasesDoTexto(texto);
		if (frases < MINIMO_FRASES_IDEIA_CENTRAL || frases > MAXIMO_FRASES_IDEIA_CENTRAL) {
			return { motivo: `a ideia central tem ${frases} frases (precisa de ${MINIMO_FRASES_IDEIA_CENTRAL} a ${MAXIMO_FRASES_IDEIA_CENTRAL})` };
		}
		return { bloco: { tipo: "ideia_central", conceitos, texto } };
	}
	// As questões, pelas regras do diagnóstico (lerQuestao), com os conceitos já filtrados.
	const lida = lerQuestao({ ...item, conceitos }, permitidos);
	if ("motivo" in lida) return lida;
	return { bloco: { ...lida.questao, referencias } as BlocoSemId };
}

/**
 * Confere os blocos que o modelo devolveu para uma lição (ResultadoLicao) e
 * devolve a lição com ids l<n>-b<n> dados aqui, na ordem:
 * - conceitos só da lição (os outros saem); um bloco sem nenhum, sai;
 * - explicação: texto e formato válido; verificação: pergunta e resposta
 *   esperada; alternativa e dissertativa pelas regras do diagnóstico
 *   (lerQuestao: uma correta, a confusão em cada errada, rubrica de 3 a 5
 *   critérios); ideia central: texto de 1 a 3 frases (frasesDoTexto); um
 *   bloco que não vale (ou vazio, ou de tipo desconhecido) sai;
 * - referências como no mapa: um local que não é o de um dos `trechos`
 *   mandados sai (no escopo livre, nenhuma);
 * - complemento: no escopo "só o material", a explicação que o modelo marcou
 *   ou que não cita nenhum trecho válido; em "material base", só a que o
 *   modelo marcou; no livre, nenhuma.
 * Sem nenhuma explicação ou sem nenhuma prática que valha, ErroModulo com os
 * motivos dos descartes. Depois, o esquema da lição no que sobrou
 * (problemasDaLicao: a ordem dos blocos, o tamanho de cada explicação e a
 * parte dos caracteres nas explicações): com problemas, ErroModulo com as
 * frases que dizem ao modelo o que corrigir e os descartes (a extensão tenta
 * a lição de novo, uma vez). As lições gravadas antes do esquema não passam
 * por aqui: continuam válidas para ler.
 *
 * Os termos (docs/termos.md; conferirTermosDaLicao, com o `glossario` do
 * curso): as marcas para um termo fora do glossário e de "termos" viram
 * texto (conserto); um termo novo que não vale ou usado antes do bloco que o
 * explica é problema da lição, como os do esquema, com `rigidoNosTermos`
 * (padrão; a extensão passa false na segunda tentativa, e aí o termo sai ou
 * as marcas antes da explicação viram texto). Um termo novo igual a um do
 * glossário vira o do glossário. As marcas dos termos novos continuam com a
 * chave (novo-1…): incorporarTermosDaLicao dá os ids.
 */
export function validarLicao(
	resultado: unknown,
	opcoes: {
		licao: Pick<LicaoPlanejada, "id" | "titulo" | "objetivo" | "conceitos">;
		trechos: readonly Referencia[];
		escopo: Escopo;
		glossario?: readonly Pick<Termo, "id" | "termo">[];
		rigidoNosTermos?: boolean;
	},
): { licao: Licao; descartes: string[]; termos: TermosDaLicao } {
	const { licao } = opcoes;
	if (!ehObjeto(resultado) || !Array.isArray(resultado.blocos)) throw new ErroModulo(`O modelo não devolveu a lista de blocos da lição ${licao.id} (falta "blocos").`);
	const permitidos = new Set(licao.conceitos);
	const blocos: BlocoSemId[] = [];
	const descartes: string[] = [];
	/** Para cada bloco do modelo, o índice dele nos blocos que ficaram (undefined: descartado). */
	const posicoes: Array<number | undefined> = [];
	for (const [indice, item] of (resultado.blocos as unknown[]).entries()) {
		const lido = lerBloco(item, permitidos, opcoes.trechos, opcoes.escopo);
		if ("motivo" in lido) {
			descartes.push(`bloco ${indice + 1}: ${lido.motivo}`);
			posicoes.push(undefined);
		} else {
			posicoes.push(blocos.length);
			blocos.push(lido.bloco);
		}
	}
	const faltas: string[] = [];
	if (!blocos.some((bloco) => bloco.tipo === "explicacao")) faltas.push("explicação");
	if (!blocos.some((bloco) => ehPratica(bloco.tipo))) faltas.push("prática");
	if (faltas.length > 0) {
		const motivos = descartes.length > 0 ? ` Descartados: ${descartes.join("; ")}.` : "";
		throw new ErroModulo(`A lição ${licao.id} ("${licao.titulo}") veio sem ${faltas.join(" e sem ")} que valha.${motivos}`);
	}
	const comIds = blocos.map((bloco, indice) => ({ id: `${licao.id}-b${indice + 1}`, ...structuredClone(bloco) }) as Bloco);
	const conferidos = conferirTermosDaLicao(comIds, resultado.termos, {
		glossario: opcoes.glossario ?? [],
		conceitos: licao.conceitos,
		posicoes,
		rigido: opcoes.rigidoNosTermos ?? true,
	});
	const problemas = [...problemasDaLicao(conferidos.blocos), ...conferidos.problemas];
	if (problemas.length > 0) {
		const motivos = descartes.length > 0 ? ` Descartados: ${descartes.join("; ")}.` : "";
		throw new ErroModulo(`A lição ${licao.id} ("${licao.titulo}") não segue o esquema da lição. ${problemas.join(" ")}${motivos}`);
	}
	return {
		licao: {
			id: licao.id,
			titulo: licao.titulo,
			objetivo: licao.objetivo,
			conceitos: [...licao.conceitos],
			blocos: conferidos.blocos,
		},
		descartes,
		termos: conferidos.termos,
	};
}

/**
 * Confere UM bloco que o modelo devolveu (a reescrita de um bloco,
 * docs/escrita.md), pelas mesmas regras da lição (lerBloco, como em
 * validarLicao): conceitos só da lição, o conteúdo de cada tipo, as
 * referências contra os `trechos` mandados e o complemento pelo escopo. O
 * formato da explicação pode ser outro que o do bloco antigo, e ela tem o
 * mínimo de caracteres do formato (problemaDoTamanho: introdução 600,
 * conceito e exemplos 900); a ideia central, de 1 a 3 frases. Aceita o bloco
 * solto ou dentro de {"bloco": {...}}. Devolve o bloco sem id (substituirBloco
 * mantém o do antigo). Um bloco que não vale, curto demais ou de outro tipo
 * que `tipo` é ErroModulo com o motivo (a extensão tenta de novo, uma vez).
 * As marcas de termo (docs/termos.md) seguem as regras da lição
 * (limparMarcasDoBloco): só para um id do `glossario` (a reescrita não cria
 * termo novo), só nos textos onde a marca vale e uma por termo; as outras
 * viram texto.
 */
export function validarBloco(
	resultado: unknown,
	opcoes: { licao: Pick<LicaoPlanejada, "id" | "conceitos">; trechos: readonly Referencia[]; escopo: Escopo; tipo: TipoBloco; glossario?: readonly Pick<Termo, "id">[] },
): BlocoSemId {
	const item = ehObjeto(resultado) && ehObjeto(resultado.bloco) ? resultado.bloco : resultado;
	if (!ehObjeto(item)) throw new ErroModulo(`O modelo não devolveu o bloco da lição ${opcoes.licao.id}.`);
	const lido = lerBloco(item, new Set(opcoes.licao.conceitos), opcoes.trechos, opcoes.escopo);
	if ("motivo" in lido) throw new ErroModulo(`O bloco reescrito da lição ${opcoes.licao.id} não vale: ${lido.motivo}.`);
	if (lido.bloco.tipo !== opcoes.tipo) throw new ErroModulo(`O bloco reescrito veio do tipo "${lido.bloco.tipo}", e precisava ser "${opcoes.tipo}".`);
	if (lido.bloco.tipo === "explicacao") {
		const problema = problemaDoTamanho(lido.bloco, "do bloco reescrito");
		if (problema) throw new ErroModulo(problema);
	}
	const doGlossario = new Set((opcoes.glossario ?? []).map((termo) => termo.id));
	return limparMarcasDoBloco(structuredClone(lido.bloco), (id) => doGlossario.has(id)).bloco;
}

// --- Resumo ----------------------------------------------------------------------------

export interface ResumoModulo {
	licoes: number;
	blocos: number;
	/** Alternativas e dissertativas. */
	questoes: number;
}

/** Quantas lições, blocos e questões (alternativas e dissertativas) o módulo tem. Aguardando material, zeros. */
export function resumoDoModulo(modulo: Pick<Modulo, "licoes">): ResumoModulo {
	const blocos = modulo.licoes.flatMap((licao) => licao.blocos);
	return {
		licoes: modulo.licoes.length,
		blocos: blocos.length,
		questoes: blocos.filter((bloco) => bloco.tipo === "alternativa" || bloco.tipo === "dissertativa").length,
	};
}
