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
	type DiagnosticoEmAndamento,
	lerQuestao,
	type QuestaoAlternativa,
	type QuestaoDissertativa,
	resumoDoDiagnostico,
} from "./diagnostico-tipos.ts";
import type { Esqueleto, Modulo as ModuloDoEsqueleto } from "./esqueleto-tipos.ts";
import type { Referencia } from "./mapa-tipos.ts";

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
 * O formato de uma explicação (ESPECIFICACAO 9.1): exemplo_resolvido
 * (iniciante), exemplo_incompleto (intermediário: passos para completar),
 * problema_aberto (domina) ou conceito (a apresentação, antes do exemplo).
 */
export const FORMATOS_EXPLICACAO = ["exemplo_resolvido", "exemplo_incompleto", "problema_aberto", "conceito"] as const;
export type FormatoExplicacao = (typeof FORMATOS_EXPLICACAO)[number];

/** O formato do exemplo que cada nível pede (9.1). */
export const FORMATO_DO_NIVEL: Record<NivelConceito, FormatoExplicacao> = {
	iniciante: "exemplo_resolvido",
	intermediario: "exemplo_incompleto",
	domina: "problema_aberto",
};

/** Os tipos de bloco de uma lição, na ordem do roteiro do plano. */
export const TIPOS_BLOCO = ["explicacao", "verificacao", "alternativa", "dissertativa"] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];

/** Os tipos de bloco que contam como prática (tudo o que não é explicação). */
export const TIPOS_PRATICA = ["verificacao", "alternativa", "dissertativa"] as const satisfies readonly TipoBloco[];
export type TipoPratica = (typeof TIPOS_PRATICA)[number];

export const ehSituacaoModulo = (valor: unknown): valor is SituacaoModulo => (SITUACOES_MODULO as readonly unknown[]).includes(valor);
export const ehFormatoExplicacao = (valor: unknown): valor is FormatoExplicacao => (FORMATOS_EXPLICACAO as readonly unknown[]).includes(valor);
export const ehTipoBloco = (valor: unknown): valor is TipoBloco => (TIPOS_BLOCO as readonly unknown[]).includes(valor);
export const ehPratica = (valor: unknown): valor is TipoPratica => (TIPOS_PRATICA as readonly unknown[]).includes(valor);

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

export type Bloco = BlocoExplicacao | BlocoVerificacao | BlocoAlternativa | BlocoDissertativa;

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
	/** Na ordem; alterna explicação e prática e termina com prática. */
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

/** A mensagem "modulo" (parte B): o <módulo>.json inteiro. */
export interface MensagemModulo {
	materia: string;
	curso: string;
	modulo: Modulo;
}

/** A mensagem "erro". */
export interface MensagemErroModulos {
	mensagem: string;
	/** A ação que falhou (listar, gerar, aguardar, concluir…). */
	ao?: string;
	materia?: string;
	curso?: string;
	modulo?: string;
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
		/** A sequência dos tipos de bloco. */
		roteiro: TipoBloco[];
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
}

/** Uma lição do plano depois de validarPlano: com o id dado pelo código e o roteiro consertado. */
export interface LicaoPlanejada {
	/** l1, l2… */
	id: string;
	titulo: string;
	objetivo: string;
	conceitos: string[];
	roteiro: TipoBloco[];
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

// --- O plano ---------------------------------------------------------------------------

/** Quantas lições um módulo de `horas` horas pede: uma por uns 50 minutos (40 a 60), arredondado, de 1 a 6. */
export function licoesPorHoras(horas: number): number {
	if (typeof horas !== "number" || !Number.isFinite(horas) || horas <= 0) return LICOES_MINIMAS;
	return Math.min(LICOES_MAXIMAS, Math.max(LICOES_MINIMAS, Math.round((horas * 60) / MINUTOS_POR_LICAO)));
}

/**
 * Conserta o roteiro de uma lição: só tipos de bloco que existem; duas
 * explicações seguidas viram uma (o roteiro alterna explicação e prática);
 * sem explicação, uma no começo; se não termina com prática, uma verificação
 * no fim.
 */
function consertarRoteiro(valor: unknown): TipoBloco[] {
	const roteiro: TipoBloco[] = [];
	for (const tipo of Array.isArray(valor) ? (valor as unknown[]) : []) {
		const limpo = typeof tipo === "string" ? tipo.trim() : tipo;
		if (!ehTipoBloco(limpo)) continue;
		if (limpo === "explicacao" && roteiro.at(-1) === "explicacao") continue;
		roteiro.push(limpo);
	}
	if (!roteiro.includes("explicacao")) roteiro.unshift("explicacao");
	if (!ehPratica(roteiro.at(-1))) roteiro.push("verificacao");
	return roteiro;
}

/**
 * Confere e conserta o plano que o modelo devolveu (ResultadoPlano) e devolve
 * as lições com ids l1, l2… na ordem:
 * - conceitos só do módulo (os outros saem, sem repetir na lição); uma lição
 *   sem nenhum conceito do módulo (ou que não é objeto) sai;
 * - título numa linha (vazio vira "Lição N"); objetivo aparado (pode ser
 *   vazio);
 * - o roteiro só com tipos de bloco que existem, alternando explicação e
 *   prática e terminando com prática (consertarRoteiro);
 * - até `licoes` lições (licoesPorHoras): as que passam saem, e os conceitos
 *   delas entram pela regra seguinte;
 * - os conceitos do módulo que nenhuma lição cobriu entram no fim da última,
 *   na ordem do módulo;
 * - com `tipo` teórico ou misto e nenhuma dissertativa no plano, uma
 *   dissertativa no fim do roteiro da última lição.
 * Sem nenhuma lição que valha, ErroModulo (a extensão tenta de novo).
 */
export function validarPlano(resultado: unknown, opcoes: { conceitosDoModulo: readonly string[]; licoes: number; tipo?: TipoCurso }): LicaoPlanejada[] {
	if (!ehObjeto(resultado) || !Array.isArray(resultado.licoes)) throw new ErroModulo('O modelo não devolveu a lista de lições (falta "licoes").');
	const doModulo = [...new Set(opcoes.conceitosDoModulo)];
	const permitidos = new Set(doModulo);
	const maximo = Math.min(LICOES_MAXIMAS, Math.max(LICOES_MINIMAS, Math.floor(opcoes.licoes) || LICOES_MINIMAS));
	const lidas: Array<Omit<LicaoPlanejada, "id">> = [];
	for (const item of resultado.licoes as unknown[]) {
		if (lidas.length >= maximo) break;
		if (!ehObjeto(item)) continue;
		const conceitos = listaDeIds(item.conceitos).filter((id) => permitidos.has(id));
		if (conceitos.length === 0) continue;
		lidas.push({ titulo: linhaLimpa(item.titulo), objetivo: textoLimpo(item.objetivo), conceitos, roteiro: consertarRoteiro(item.roteiro) });
	}
	if (lidas.length === 0) throw new ErroModulo("O modelo não devolveu nenhuma lição com conceitos do módulo.");
	const cobertos = new Set(lidas.flatMap((licao) => licao.conceitos));
	const ultima = lidas.at(-1)!;
	for (const id of doModulo) if (!cobertos.has(id)) ultima.conceitos.push(id);
	if ((opcoes.tipo === "teorico" || opcoes.tipo === "misto") && !lidas.some((licao) => licao.roteiro.includes("dissertativa"))) ultima.roteiro.push("dissertativa");
	return lidas.map((licao, indice) => ({ id: `l${indice + 1}`, titulo: licao.titulo || `Lição ${indice + 1}`, objetivo: licao.objetivo, conceitos: licao.conceitos, roteiro: licao.roteiro }));
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
export type BlocoSemId = Omit<BlocoExplicacao, "id"> | Omit<BlocoVerificacao, "id"> | Omit<BlocoAlternativa, "id"> | Omit<BlocoDissertativa, "id">;

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
 *   critérios); um bloco que não vale (ou vazio, ou de tipo desconhecido) sai;
 * - referências como no mapa: um local que não é o de um dos `trechos`
 *   mandados sai (no escopo livre, nenhuma);
 * - complemento: no escopo "só o material", a explicação que o modelo marcou
 *   ou que não cita nenhum trecho válido; em "material base", só a que o
 *   modelo marcou; no livre, nenhuma.
 * Sem nenhuma explicação ou sem nenhuma prática que valha, ErroModulo com os
 * motivos dos descartes (a extensão tenta a lição de novo, uma vez).
 */
export function validarLicao(
	resultado: unknown,
	opcoes: { licao: Pick<LicaoPlanejada, "id" | "titulo" | "objetivo" | "conceitos">; trechos: readonly Referencia[]; escopo: Escopo },
): { licao: Licao; descartes: string[] } {
	const { licao } = opcoes;
	if (!ehObjeto(resultado) || !Array.isArray(resultado.blocos)) throw new ErroModulo(`O modelo não devolveu a lista de blocos da lição ${licao.id} (falta "blocos").`);
	const permitidos = new Set(licao.conceitos);
	const blocos: BlocoSemId[] = [];
	const descartes: string[] = [];
	for (const [indice, item] of (resultado.blocos as unknown[]).entries()) {
		const lido = lerBloco(item, permitidos, opcoes.trechos, opcoes.escopo);
		if ("motivo" in lido) descartes.push(`bloco ${indice + 1}: ${lido.motivo}`);
		else blocos.push(lido.bloco);
	}
	const faltas: string[] = [];
	if (!blocos.some((bloco) => bloco.tipo === "explicacao")) faltas.push("explicação");
	if (!blocos.some((bloco) => ehPratica(bloco.tipo))) faltas.push("prática");
	if (faltas.length > 0) {
		const motivos = descartes.length > 0 ? ` Descartados: ${descartes.join("; ")}.` : "";
		throw new ErroModulo(`A lição ${licao.id} ("${licao.titulo}") veio sem ${faltas.join(" e sem ")} que valha.${motivos}`);
	}
	return {
		licao: {
			id: licao.id,
			titulo: licao.titulo,
			objetivo: licao.objetivo,
			conceitos: [...licao.conceitos],
			blocos: blocos.map((bloco, indice) => ({ id: `${licao.id}-b${indice + 1}`, ...structuredClone(bloco) }) as Bloco),
		},
		descartes,
	};
}

/**
 * Confere UM bloco que o modelo devolveu (a reescrita de um bloco,
 * docs/escrita.md), pelas mesmas regras da lição (lerBloco, como em
 * validarLicao): conceitos só da lição, o conteúdo de cada tipo, as
 * referências contra os `trechos` mandados e o complemento pelo escopo. O
 * formato da explicação pode ser outro que o do bloco antigo. Aceita o bloco
 * solto ou dentro de {"bloco": {...}}. Devolve o bloco sem id (substituirBloco
 * mantém o do antigo). Um bloco que não vale, ou de outro tipo que `tipo`, é
 * ErroModulo com o motivo (a extensão tenta de novo, uma vez).
 */
export function validarBloco(
	resultado: unknown,
	opcoes: { licao: Pick<LicaoPlanejada, "id" | "conceitos">; trechos: readonly Referencia[]; escopo: Escopo; tipo: TipoBloco },
): BlocoSemId {
	const item = ehObjeto(resultado) && ehObjeto(resultado.bloco) ? resultado.bloco : resultado;
	if (!ehObjeto(item)) throw new ErroModulo(`O modelo não devolveu o bloco da lição ${opcoes.licao.id}.`);
	const lido = lerBloco(item, new Set(opcoes.licao.conceitos), opcoes.trechos, opcoes.escopo);
	if ("motivo" in lido) throw new ErroModulo(`O bloco reescrito da lição ${opcoes.licao.id} não vale: ${lido.motivo}.`);
	if (lido.bloco.tipo !== opcoes.tipo) throw new ErroModulo(`O bloco reescrito veio do tipo "${lido.bloco.tipo}", e precisava ser "${opcoes.tipo}".`);
	return structuredClone(lido.bloco);
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
