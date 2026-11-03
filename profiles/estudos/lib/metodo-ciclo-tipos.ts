// O ciclo do método (parte 4 do plano de 2026-10-28, docs/metodo-ciclo.md e,
// acima dele, docs/metodo-experimentos.md) sem nada do Node: a tela
// (profiles/estudos/paineis) importa daqui, e a extensão de módulos aplica as
// mesmas funções antes de gravar (lib/metodo-ciclo.ts reexporta). Aqui ficam:
// - a evidência do relatório de um módulo concluído (os eventos do módulo,
//   cada um numa linha curta legível, a mesma para o modelo e para a tela);
// - os tipos do relatório da versão 1 (com as propostas e as decisões do
//   Breno, que continuam sendo lidos) e o que os dois relatórios têm em comum;
//   o da versão 2 (a análise dos experimentos) é de metodo-analise-tipos.ts;
// - os ajustes do método, um arquivo markdown por arquivo de metodologia
//   (aprendiz/metodo/<arquivo>.md), cada um um experimento (`em teste`),
//   uma regra (`mantido`) ou `descartado`: ler e escrever o formato,
//   preservando o texto editado à mão; um arquivo que não se lê dá erro;
// - o bloco <ajustes-do-breno> que vai logo depois da base em toda geração.
// O placar de um módulo é de metodo-placar-tipos.ts e o que facilita
// (aprendizados.md), de metodo-aprendizados-tipos.ts.
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam.

import { ErroCurso } from "./curso-tipos.ts";
import { ehMotivoRetorno, NOMES_MOTIVO } from "./escrita-tipos.ts";
import type { Evento } from "./eventos.ts";
import { avaliacaoLida, ehNivelLicao, NOMES_AVALIACAO, NOMES_NIVEL, PERGUNTAS_LICAO, type PerguntaLicao } from "./modulo-feedback-tipos.ts";
import type { RelatorioMetodoV2 } from "./metodo-analise-tipos.ts";
import { ARQUIVOS_METODO, type ArquivoMetodo, arquivoDeMetodo, type Bloco, type ItemRoteiro, itemDoRoteiro, type Licao, type ModuloGerado } from "./modulo-tipos.ts";
import { ehTipoExplicacao, NOMES_TIPO_EXPLICACAO, semAcento } from "./termos-tipos.ts";

// --- Constantes -----------------------------------------------------------------------

/** A versão do relatorios/<módulo>.json que o código grava (a análise dos experimentos, docs/metodo-experimentos.md). Muda quando o formato mudar. */
export const VERSAO_RELATORIO = 2;

/** A versão antiga, com as propostas e as decisões do Breno: continua sendo lida. */
export const VERSAO_RELATORIO_ANTIGA = 1;

/** Os verbos dos eventos que entram na evidência do relatório, todos no aprendiz/eventos.jsonl. */
export const VERBOS_EVIDENCIA = [
	"avaliou_bloco",
	"reescreveu_bloco",
	"avaliou_licao",
	"respondeu_questao",
	"respondeu_verificacao",
	"respondeu_dissertativa",
	"nao_sabia_questao",
	"pediu_explicacao",
	"guardou_termo",
] as const;
export type VerboEvidencia = (typeof VERBOS_EVIDENCIA)[number];

/** Os verbos que contam como retorno do Breno (o limite de MINIMO_RETORNOS e a prioridade na mensagem). */
export const VERBOS_RETORNO = ["avaliou_bloco", "avaliou_licao", "pediu_explicacao", "nao_sabia_questao"] as const satisfies readonly VerboEvidencia[];
export type VerboRetorno = (typeof VERBOS_RETORNO)[number];

/** Com menos eventos de retorno que isto no módulo, o relatório é gravado como pouco_retorno, sem chamar o modelo (a menos que forcar). */
export const MINIMO_RETORNOS = 3;

/** Até quantos caracteres as linhas dos eventos ocupam na mensagem ao modelo. */
export const LIMITE_LINHAS_EVIDENCIA = 30_000;

/** Até quantos caracteres do começo do texto de um bloco com retorno Ruim ou pedido de explicação vão na mensagem. */
export const LIMITE_TEXTO_DO_BLOCO = 600;

/** Até quantos caracteres de cada texto livre (feedback, resposta, trecho) entram numa linha. */
export const LIMITE_TEXTO_NA_LINHA = 200;

/** O que o código confere no que o modelo devolve (docs/metodo-ciclo.md, "O prompt"). */
export const MAXIMO_PROPOSTAS = 5;
export const AJUSTE_MAXIMO = 400;
export const PORQUE_MAXIMO = 300;
export const RESUMO_MAXIMO = 1500;
export const MINIMO_EVIDENCIAS_PROPOSTA = 2;
export const MINIMO_EVIDENCIAS_ITEM = 1;

/** O motivo opcional de uma proposta rejeitada (relatório da versão 1). */
export const MOTIVO_MAXIMO = 300;

/** A frase que abre o bloco dos ajustes em toda geração. */
export const FRASE_DOS_AJUSTES =
	'Estes ajustes vieram do retorno do Breno. Os marcados "em teste" são experimentos: siga-os à risca, para que dê para medir o efeito deles. Todos valem acima do texto acima quando os dois conflitarem.';

/** O nome de cada arquivo de metodologia, para as etiquetas da tela ("Exemplos"). */
export const NOMES_ARQUIVO_METODO: Record<ArquivoMetodo, string> = {
	"estrutura-da-licao.md": "Estrutura da lição",
	"introducao.md": "Introdução",
	"conceito.md": "Conceito",
	"exemplos.md": "Exemplos",
	"pergunta.md": "Pergunta",
	"ideia-central.md": "Ideia central",
	"quiz.md": "Quiz",
	"dissertativa.md": "Dissertativa",
	"termos.md": "Termos-chave",
};

/** Como cada item do roteiro aparece nas linhas da evidência (o tipo e o formato do bloco). */
export const NOMES_ITEM_ROTEIRO: Record<ItemRoteiro, string> = {
	introducao: "introdução",
	conceito: "conceito",
	exemplo_resolvido: "exemplo resolvido",
	exemplo_incompleto: "exemplo incompleto",
	problema_aberto: "problema aberto",
	verificacao: "pergunta",
	alternativa: "quiz",
	dissertativa: "dissertativa",
	ideia_central: "ideia central",
};

export const ehVerboEvidencia = (valor: unknown): valor is VerboEvidencia => (VERBOS_EVIDENCIA as readonly unknown[]).includes(valor);
export const ehVerboRetorno = (valor: unknown): valor is VerboRetorno => (VERBOS_RETORNO as readonly unknown[]).includes(valor);
export const ehArquivoMetodo = (valor: unknown): valor is ArquivoMetodo => (ARQUIVOS_METODO as readonly unknown[]).includes(valor);

/** Um ErroCurso (a extensão mostra a frase como está), com o nome próprio do ciclo do método. */
export class ErroMetodo extends ErroCurso {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroMetodo";
	}
}

// --- O relatório gravado ----------------------------------------------------------------

/** Gravadas no arquivo. Gerando e erro são estados da extensão: um relatório que falhou não deixa arquivo. */
export const SITUACOES_RELATORIO = ["pronto", "pouco_retorno"] as const;
export type SituacaoRelatorio = (typeof SITUACOES_RELATORIO)[number];

/** Um evento citado no relatório, como a tela o desenha sem ler eventos: o id, a linha curta legível (linhaDoEvento) e onde fica (para levar ao bloco). */
export interface EvidenciaNaTela {
	id: string;
	linha: string;
	/** A lição do evento; null quando o evento não é de uma lição. */
	licao: string | null;
	/** O bloco (ou a questão) do evento; null num evento da lição inteira (o questionário). */
	bloco: string | null;
}

/** Um item de "O que funcionou" ou "O que não funcionou": o texto e os ids dos eventos que o sustentam. */
export interface ItemRelatorio {
	texto: string;
	evidencias: string[];
}

/** A decisão do Breno numa proposta aprovada: o texto final (editado ou não), quando, o evento aprovou_ajuste_metodo e o ajuste em aprendiz/metodo/. */
export interface DecisaoAprovada {
	tipo: "aprovada";
	texto: string;
	/** ISO 8601. */
	em: string;
	evento: string;
	ajuste: string;
}

/** A decisão do Breno numa proposta rejeitada, com o motivo opcional (até MOTIVO_MAXIMO caracteres). */
export interface DecisaoRejeitada {
	tipo: "rejeitada";
	motivo?: string;
	/** ISO 8601. */
	em: string;
	evento: string;
}

export type DecisaoProposta = DecisaoAprovada | DecisaoRejeitada;

/** Uma proposta de ajuste: p1, p2…, o arquivo de metodologia, o ajuste (uma instrução curta), o porquê e os eventos; com a decisão, quando o Breno decidiu. */
export interface PropostaRelatorio {
	id: string;
	arquivo: ArquivoMetodo;
	ajuste: string;
	porque: string;
	evidencias: string[];
	decisao?: DecisaoProposta;
}

/** O nome e o hash do prompt usado (relatorio-metodo.md). */
export interface PromptDoRelatorio {
	nome: string;
	hash: string;
}

/** O relatorios/<módulo>.json da versão 1 (docs/metodo-ciclo.md): as propostas e as decisões do Breno. O código não grava mais; continua sendo lido. */
export interface RelatorioMetodoV1 {
	versao: typeof VERSAO_RELATORIO_ANTIGA;
	modulo: string;
	situacao: SituacaoRelatorio;
	/** ISO 8601. */
	geradoEm: string;
	/** provedor/id do modelo. Ausente em pouco_retorno (o modelo não foi chamado). */
	modelo?: string;
	/** US$ (0 em pouco_retorno). */
	custo: number;
	/** Ausente em pouco_retorno. */
	prompt?: PromptDoRelatorio;
	/** Quantos eventos do módulo foram lidos (VERBOS_EVIDENCIA). */
	eventosLidos: number;
	/** Quantos deles são de retorno (VERBOS_RETORNO). */
	retornos: number;
	/** Markdown; vazio em pouco_retorno. */
	resumo: string;
	funcionou: ItemRelatorio[];
	problemas: ItemRelatorio[];
	propostas: PropostaRelatorio[];
	/** Os eventos citados nos itens e nas propostas, na ordem em que aconteceram, com a linha que foi ao modelo. */
	evidencias: EvidenciaNaTela[];
}

/**
 * O relatorios/<módulo>.json: a versão 2 (RelatorioMetodoV2, a análise dos
 * experimentos) ou a 1 (RelatorioMetodoV1). `versao` diz qual.
 */
export type RelatorioMetodo = RelatorioMetodoV1 | RelatorioMetodoV2;

/** A situação do relatório de um módulo concluído no estado (a linha do card). */
export type SituacaoRelatorioNaTela = "gerando" | "pronto" | "pouco_retorno" | "erro" | "nenhum";

/** O relatório de um módulo concluído na mensagem estado. */
export interface EstadoRelatorio {
	situacao: SituacaoRelatorioNaTela;
	/** Em erro: a frase. */
	mensagem?: string;
}

// --- Funções de apoio ---------------------------------------------------------------------

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : (JSON.stringify(valor) ?? String(valor)));
/** "a", "a e b", "a, b e c". */
const listaComE = (itens: readonly string[]) => (itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);
/** 2,5: o número com vírgula. */
const numero = (valor: number) => String(valor).replace(".", ",");

/** Um texto livre numa linha só (espaços juntados), cortado em `limite` caracteres com "…". Sem texto, "". */
export function textoCurto(valor: unknown, limite: number = LIMITE_TEXTO_NA_LINHA): string {
	if (typeof valor !== "string") return "";
	const limpo = valor.replace(/\s+/g, " ").trim();
	return limpo.length > limite ? `${limpo.slice(0, Math.max(0, limite - 1)).trimEnd()}…` : limpo;
}

/** A forma de comparar dois ajustes: sem acento, sem caixa e sem espaços. */
export const formaDoAjuste = (texto: string) => semAcento(texto).toLowerCase().replace(/\s+/g, "");

/** Os dois textos são o mesmo ajuste (formaDoAjuste)? */
export const mesmoAjuste = (a: string, b: string) => formaDoAjuste(a) === formaDoAjuste(b);

/** O bloco (e a lição) do módulo pelo id; sem ele, undefined. */
export function blocoNoModulo(modulo: Pick<ModuloGerado, "licoes"> | null | undefined, id: string): { licao: Licao; bloco: Bloco } | undefined {
	for (const licao of modulo?.licoes ?? []) {
		const bloco = licao.blocos.find((item) => item.id === id);
		if (bloco) return { licao, bloco };
	}
	return undefined;
}

// --- A evidência ------------------------------------------------------------------------------

/**
 * Os eventos do módulo que entram na evidência, na ordem do arquivo: os de
 * VERBOS_EVIDENCIA com objeto.materia, objeto.curso e objeto.modulo do
 * módulo, só da geração atual (ts a partir do geradoEm): os ids dos blocos se
 * repetem entre gerações, e um evento de uma geração anterior falaria de
 * outro bloco.
 */
export function eventosDoModulo(eventos: readonly Evento[], modulo: Pick<ModuloGerado, "materia" | "curso" | "id" | "geradoEm">): Evento[] {
	return eventos.filter(
		(evento) =>
			ehVerboEvidencia(evento.verbo) &&
			ehObjeto(evento.objeto) &&
			evento.objeto.materia === modulo.materia &&
			evento.objeto.curso === modulo.curso &&
			evento.objeto.modulo === modulo.id &&
			typeof evento.ts === "string" &&
			evento.ts >= modulo.geradoEm,
	);
}

/** Quantos eventos são de retorno (VERBOS_RETORNO). */
export const contarRetornos = (eventos: readonly { verbo: string }[]) => eventos.filter((evento) => ehVerboRetorno(evento.verbo)).length;

/** O módulo tem retorno suficiente para chamar o modelo (pelo menos MINIMO_RETORNOS eventos de retorno)? */
export const temRetornoSuficiente = (eventos: readonly { verbo: string }[]) => contarRetornos(eventos) >= MINIMO_RETORNOS;

/** Onde o evento fica: a lição e o bloco (nas questões, objeto.questao). */
export function localDoEvento(evento: Pick<Evento, "objeto">): { licao: string | null; bloco: string | null } {
	const objeto = ehObjeto(evento.objeto) ? evento.objeto : {};
	const licao = typeof objeto.licao === "string" && objeto.licao ? objeto.licao : null;
	const bloco = typeof objeto.bloco === "string" && objeto.bloco ? objeto.bloco : typeof objeto.questao === "string" && objeto.questao ? objeto.questao : null;
	return { licao, bloco };
}

/** Os rótulos das perguntas do questionário nas linhas. */
const ROTULOS_PERGUNTA: Record<PerguntaLicao, string> = { entendimento: "entendimento", clareza: "clareza", exemplos: "exemplos", questoes: "questões", ritmo: "ritmo" };
const NOMES_VERIFICACAO: Record<string, string> = { certa: "certa", parcial: "em parte", errada: "errada" };
const NOMES_QUESTAO: Record<string, string> = { alternativa: "quiz", verificacao: "pergunta", dissertativa: "dissertativa" };

/** "1ª". */
const ordinal = (valor: unknown) => (typeof valor === "number" && Number.isInteger(valor) && valor > 0 ? `${valor}ª` : "?ª");
const comConfianca = (valor: unknown) => (typeof valor === "number" ? `, confiança ${valor}` : "");
const comTexto = (rotulo: string, valor: unknown, limite = LIMITE_TEXTO_NA_LINHA) => {
	const texto = textoCurto(valor, limite);
	return texto ? `, ${rotulo}: «${texto}»` : "";
};

/** O resultado do evento resumido, pelo verbo ("Feedback Ruim, motivos longo demais, texto: «…»"). */
export function resumoDoEvento(evento: Pick<Evento, "verbo" | "resultado">): string {
	const resultado = ehObjeto(evento.resultado) ? evento.resultado : {};
	switch (evento.verbo) {
		case "avaliou_bloco": {
			const avaliacao = avaliacaoLida(resultado.avaliacao);
			const motivos = Array.isArray(resultado.motivos) ? (resultado.motivos as unknown[]).filter(ehMotivoRetorno).map((motivo) => NOMES_MOTIVO[motivo].toLowerCase()) : [];
			return `Feedback ${avaliacao ? NOMES_AVALIACAO[avaliacao] : mostrar(resultado.avaliacao)}${motivos.length ? `, motivos ${listaComE(motivos)}` : ""}${comTexto("texto", resultado.texto)}`;
		}
		case "reescreveu_bloco":
			return `Reescrito a pedido do Breno (versão ${mostrar(resultado.de)} → ${mostrar(resultado.para)})`;
		case "avaliou_licao": {
			const notas = ehObjeto(resultado.notas) ? resultado.notas : {};
			const partes = PERGUNTAS_LICAO.flatMap(({ id }) => {
				const nota = notas[id];
				return ehNivelLicao(nota) ? [`${ROTULOS_PERGUNTA[id]} ${NOMES_NIVEL[nota]}`] : [];
			});
			return `Questionário da lição: ${partes.length ? partes.join(", ") : "sem notas"}${comTexto("texto", resultado.texto)}`;
		}
		case "respondeu_questao": {
			const confusao = resultado.correta === true ? "" : comTexto("confusão", resultado.confusao);
			return `quiz ${resultado.correta === true ? "certo" : "errado"} na ${ordinal(resultado.tentativa)} tentativa${comConfianca(resultado.confianca)}${confusao}`;
		}
		case "respondeu_verificacao":
			return `pergunta ${NOMES_VERIFICACAO[String(resultado.avaliacao)] ?? mostrar(resultado.avaliacao)}${comConfianca(resultado.confianca)}${comTexto("resposta", resultado.texto, 160)}${comTexto("retorno", resultado.retorno, 160)}`;
		case "respondeu_dissertativa": {
			const pontos = typeof resultado.total === "number" && typeof resultado.max === "number" ? `${numero(resultado.total)} de ${numero(resultado.max)} pontos` : "corrigida";
			return `dissertativa ${pontos} na ${ordinal(resultado.tentativa)} tentativa${comConfianca(resultado.confianca)}`;
		}
		case "nao_sabia_questao": {
			const tipo = NOMES_QUESTAO[String(resultado.tipo)] ?? "questão";
			const antes = typeof resultado.tentativas === "number" && resultado.tentativas > 0 ? `, depois de ${resultado.tentativas} ${resultado.tentativas === 1 ? "tentativa" : "tentativas"}` : "";
			return `Não sabia (${tipo}${antes})`;
		}
		case "pediu_explicacao":
			return `${ehTipoExplicacao(resultado.tipo) ? NOMES_TIPO_EXPLICACAO[resultado.tipo] : "Pediu explicação"}: «${textoCurto(resultado.trecho)}»`;
		case "guardou_termo":
			return `Guardou no glossário: «${textoCurto(resultado.termo)}»`;
		default:
			return evento.verbo;
	}
}

/**
 * A linha curta legível de um evento (docs/metodo-ciclo.md, "A evidência"),
 * a mesma que vai ao modelo (depois do id) e à tela: o bloco (ou a lição, no
 * questionário), o tipo e o formato do bloco (NOMES_ITEM_ROTEIRO), o arquivo
 * de metodologia dele (arquivoDeMetodo) e o resultado resumido
 * (resumoDoEvento), separados por " · ". Por exemplo, "l2-b3 · conceito ·
 * conceito.md · Feedback Ruim, motivos longo demais, texto: «…»". Um bloco
 * que não está no módulo vai só com o id.
 */
export function linhaDoEvento(evento: Pick<Evento, "verbo" | "objeto" | "resultado">, modulo?: Pick<ModuloGerado, "licoes"> | null): string {
	const { licao, bloco } = localDoEvento(evento);
	const partes: string[] = [];
	if (bloco) {
		partes.push(bloco);
		const achado = blocoNoModulo(modulo, bloco);
		if (achado) {
			const item = itemDoRoteiro(achado.bloco);
			partes.push(NOMES_ITEM_ROTEIRO[item], arquivoDeMetodo(item));
		}
	} else if (licao) partes.push(licao);
	partes.push(resumoDoEvento(evento));
	return partes.join(" · ");
}

/** O evento como a tela o desenha (EvidenciaNaTela). */
export function evidenciaDoEvento(evento: Pick<Evento, "id" | "verbo" | "objeto" | "resultado">, modulo?: Pick<ModuloGerado, "licoes"> | null): EvidenciaNaTela {
	const { licao, bloco } = localDoEvento(evento);
	const naLicao = licao ?? (bloco ? (blocoNoModulo(modulo, bloco)?.licao.id ?? null) : null);
	return { id: evento.id, linha: linhaDoEvento(evento, modulo), licao: naLicao, bloco };
}

/** Uma linha da evidência como vai na mensagem ao modelo: "- <id>: <linha>". */
export const linhaParaOModelo = (evidencia: Pick<EvidenciaNaTela, "id" | "linha">) => `- ${evidencia.id}: ${evidencia.linha}`;

/**
 * As linhas que cabem em `limite` caracteres (cada uma como linhaParaOModelo
 * mais a quebra), priorizando as de retorno: primeiro as de retorno, na
 * ordem, enquanto couberem; depois as outras, na ordem. Devolve as
 * escolhidas na ordem original e quantas ficaram de fora.
 */
export function escolherLinhas<T extends Pick<EvidenciaNaTela, "id" | "linha"> & { retorno: boolean }>(linhas: readonly T[], limite: number = LIMITE_LINHAS_EVIDENCIA): { escolhidas: T[]; deFora: number } {
	const tamanho = (item: T) => linhaParaOModelo(item).length + 1;
	const total = linhas.reduce((soma, item) => soma + tamanho(item), 0);
	if (total <= limite) return { escolhidas: [...linhas], deFora: 0 };
	const ficam = new Set<number>();
	let usado = 0;
	for (const retorno of [true, false]) {
		for (const [indice, item] of linhas.entries()) {
			if (item.retorno !== retorno) continue;
			const custo = tamanho(item);
			if (usado + custo > limite) continue;
			usado += custo;
			ficam.add(indice);
		}
	}
	const escolhidas = linhas.filter((_item, indice) => ficam.has(indice));
	return { escolhidas, deFora: linhas.length - escolhidas.length };
}

/** O começo do texto de um bloco com retorno Ruim ou pedido de explicação, como vai na mensagem ao modelo. */
export interface TrechoDoBloco {
	licao: string;
	bloco: string;
	/** O tipo e o formato do bloco. */
	item: ItemRoteiro;
	arquivo: ArquivoMetodo;
	/** O começo do texto (até LIMITE_TEXTO_DO_BLOCO caracteres). */
	texto: string;
	cortado: boolean;
}

/** O texto que o Breno lê num bloco: a explicação e a ideia central pelo texto; a pergunta; o contexto e o enunciado das questões. */
export function textoDoBloco(bloco: Bloco): string {
	if (bloco.tipo === "explicacao" || bloco.tipo === "ideia_central") return bloco.texto;
	if (bloco.tipo === "verificacao") return bloco.pergunta;
	return [bloco.contexto ?? "", bloco.enunciado].map((parte) => parte.trim()).filter(Boolean).join("\n\n");
}

/** A evidência montada para o relatório (montarEvidencia). */
export interface EvidenciaMontada {
	/** Todas as linhas dos eventos do módulo, na ordem em que aconteceram. */
	todas: EvidenciaNaTela[];
	/** As que vão na mensagem (escolherLinhas), na ordem. */
	mandadas: EvidenciaNaTela[];
	/** Quantas ficaram de fora pelo limite. */
	deFora: number;
	/** Quantos eventos do módulo foram lidos. */
	eventosLidos: number;
	/** Quantos são de retorno. */
	retornos: number;
	/** Os blocos com retorno Ruim ou com pedido de explicação, na ordem do módulo, com o começo do texto. */
	blocos: TrechoDoBloco[];
}

/**
 * Monta a evidência do relatório (docs/metodo-ciclo.md, "A evidência"): os
 * eventos do módulo (eventosDoModulo), cada um numa linha (linhaDoEvento);
 * as que cabem em uns 30 mil caracteres, priorizando as de retorno
 * (escolherLinhas); e os blocos com retorno Ruim (a antiga melhorar vale
 * como Ruim) ou com pedido de explicação, com o começo do texto (até 600
 * caracteres cada, textoDoBloco).
 */
export function montarEvidencia(
	eventos: readonly Evento[],
	modulo: Pick<ModuloGerado, "materia" | "curso" | "id" | "geradoEm" | "licoes">,
	limites: { linhas?: number; bloco?: number } = {},
): EvidenciaMontada {
	const doModulo = eventosDoModulo(eventos, modulo);
	const todas = doModulo.map((evento) => evidenciaDoEvento(evento, modulo));
	const comRetorno = todas.map((item, indice) => ({ ...item, retorno: ehVerboRetorno(doModulo[indice]!.verbo) }));
	const { escolhidas, deFora } = escolherLinhas(comRetorno, limites.linhas ?? LIMITE_LINHAS_EVIDENCIA);
	const comProblema = new Set<string>();
	for (const evento of doModulo) {
		const { bloco } = localDoEvento(evento);
		if (!bloco) continue;
		const resultado = ehObjeto(evento.resultado) ? evento.resultado : {};
		if (evento.verbo === "pediu_explicacao" || (evento.verbo === "avaliou_bloco" && avaliacaoLida(resultado.avaliacao) === "ruim")) comProblema.add(bloco);
	}
	const limiteBloco = limites.bloco ?? LIMITE_TEXTO_DO_BLOCO;
	const blocos: TrechoDoBloco[] = [];
	for (const licao of modulo.licoes) {
		for (const bloco of licao.blocos) {
			if (!comProblema.has(bloco.id)) continue;
			const texto = textoDoBloco(bloco).trim();
			const item = itemDoRoteiro(bloco);
			const cortado = texto.length > limiteBloco;
			blocos.push({ licao: licao.id, bloco: bloco.id, item, arquivo: arquivoDeMetodo(item), texto: cortado ? `${texto.slice(0, limiteBloco).trimEnd()}…` : texto, cortado });
		}
	}
	return {
		todas,
		mandadas: escolhidas.map(({ retorno: _retorno, ...item }) => item),
		deFora,
		eventosLidos: doModulo.length,
		retornos: contarRetornos(doModulo),
		blocos,
	};
}

// --- O que o modelo devolve (apoio) -----------------------------------------------------------

/** O nome do arquivo de metodologia que o modelo escreveu ("exemplos.md", "metodo/exemplos.md", "Exemplos"), ou undefined. */
export function arquivoDaProposta(valor: unknown): ArquivoMetodo | undefined {
	if (typeof valor !== "string") return undefined;
	let nome = valor.trim().replace(/\\/g, "/").split("/").at(-1)!.toLowerCase();
	if (nome && !nome.endsWith(".md")) nome = `${nome}.md`;
	return ehArquivoMetodo(nome) ? nome : undefined;
}

/** Os ids de uma lista que vem do modelo: textos aparados, sem vazios e sem repetir, na ordem. */
export const listaDeIds = (valor: unknown): string[] =>
	Array.isArray(valor) ? [...new Set((valor as unknown[]).filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))] : [];

// --- Ler o relatório gravado da versão 1 --------------------------------------------------------

export const ehListaDeTextos = (valor: unknown): valor is string[] => Array.isArray(valor) && (valor as unknown[]).every((item) => typeof item === "string");

/** Um item (funcionou, problemas) lido; erro com a frase. */
export function itemLido(valor: unknown, onde: string): ItemRelatorio {
	if (!ehObjeto(valor) || typeof valor.texto !== "string" || !ehListaDeTextos(valor.evidencias)) throw new Error(`${onde} não tem texto e evidencias`);
	return { texto: valor.texto, evidencias: [...valor.evidencias] };
}

/** Uma decisão lida; erro com a frase. */
function decisaoLida(valor: unknown, onde: string): DecisaoProposta {
	if (!ehObjeto(valor) || typeof valor.em !== "string" || typeof valor.evento !== "string") throw new Error(`a decisão da ${onde} não tem em e evento`);
	if (valor.tipo === "aprovada") {
		if (typeof valor.texto !== "string" || typeof valor.ajuste !== "string") throw new Error(`a decisão aprovada da ${onde} não tem texto e ajuste`);
		return { tipo: "aprovada", texto: valor.texto, em: valor.em, evento: valor.evento, ajuste: valor.ajuste };
	}
	if (valor.tipo === "rejeitada") {
		if (valor.motivo !== undefined && typeof valor.motivo !== "string") throw new Error(`o motivo da ${onde} não é um texto`);
		return { tipo: "rejeitada", ...(typeof valor.motivo === "string" && valor.motivo ? { motivo: valor.motivo } : {}), em: valor.em, evento: valor.evento };
	}
	throw new Error(`a decisão da ${onde} não é aprovada nem rejeitada ("${mostrar(valor.tipo)}")`);
}

/**
 * O relatório da versão 1 lido de um relatorios/<módulo>.json (já com o JSON
 * lido), conferido e com os campos na ordem do formato; fora do formato,
 * Error com a frase (lib/metodo-ciclo.ts diz o arquivo). O de hoje é lido por
 * relatorioLido (metodo-analise-tipos.ts), que aceita as duas versões.
 */
export function relatorioV1Lido(valor: unknown, modulo: string): RelatorioMetodoV1 {
	if (!ehObjeto(valor) || valor.versao !== VERSAO_RELATORIO_ANTIGA) throw new Error(`não está no formato da versão ${VERSAO_RELATORIO_ANTIGA}`);
	if (valor.modulo !== modulo) throw new Error(`o módulo "${mostrar(valor.modulo)}" não é o nome do arquivo`);
	if (!(SITUACOES_RELATORIO as readonly unknown[]).includes(valor.situacao)) throw new Error(`situação desconhecida ("${mostrar(valor.situacao)}")`);
	if (typeof valor.geradoEm !== "string" || typeof valor.custo !== "number" || typeof valor.eventosLidos !== "number") throw new Error("faltam geradoEm, custo ou eventosLidos");
	if (valor.modelo !== undefined && typeof valor.modelo !== "string") throw new Error("o modelo não é um texto");
	if (valor.prompt !== undefined && !(ehObjeto(valor.prompt) && typeof valor.prompt.nome === "string" && typeof valor.prompt.hash === "string")) throw new Error("o prompt não tem nome e hash");
	if (typeof valor.resumo !== "string") throw new Error("o resumo não é um texto");
	for (const campo of ["funcionou", "problemas", "propostas", "evidencias"] as const) if (!Array.isArray(valor[campo])) throw new Error(`falta a lista ${campo}`);
	const propostas = (valor.propostas as unknown[]).map((item, indice): PropostaRelatorio => {
		const onde = `proposta ${indice + 1}`;
		if (!ehObjeto(item) || typeof item.id !== "string" || typeof item.ajuste !== "string" || typeof item.porque !== "string" || !ehListaDeTextos(item.evidencias)) {
			throw new Error(`a ${onde} não tem id, ajuste, porque e evidencias`);
		}
		if (!ehArquivoMetodo(item.arquivo)) throw new Error(`o arquivo da ${onde} não é um arquivo de metodologia ("${mostrar(item.arquivo)}")`);
		return {
			id: item.id,
			arquivo: item.arquivo,
			ajuste: item.ajuste,
			porque: item.porque,
			evidencias: [...item.evidencias],
			...(item.decisao !== undefined ? { decisao: decisaoLida(item.decisao, onde) } : {}),
		};
	});
	return relatorioV1NaOrdem({
		versao: VERSAO_RELATORIO_ANTIGA,
		modulo,
		situacao: valor.situacao as SituacaoRelatorio,
		geradoEm: valor.geradoEm,
		...(typeof valor.modelo === "string" ? { modelo: valor.modelo } : {}),
		custo: valor.custo,
		...(ehObjeto(valor.prompt) ? { prompt: { nome: valor.prompt.nome as string, hash: valor.prompt.hash as string } } : {}),
		eventosLidos: valor.eventosLidos,
		retornos: typeof valor.retornos === "number" ? valor.retornos : 0,
		resumo: valor.resumo,
		funcionou: (valor.funcionou as unknown[]).map((item, indice) => itemLido(item, `o item ${indice + 1} de funcionou`)),
		problemas: (valor.problemas as unknown[]).map((item, indice) => itemLido(item, `o item ${indice + 1} de problemas`)),
		propostas,
		evidencias: evidenciasLidas(valor.evidencias as unknown[]),
	});
}

/** As evidências lidas de um relatório (as duas versões); fora do formato, Error com a frase. */
export function evidenciasLidas(lista: readonly unknown[]): EvidenciaNaTela[] {
	return lista.map((item, indice): EvidenciaNaTela => {
		if (!ehObjeto(item) || typeof item.id !== "string" || typeof item.linha !== "string") throw new Error(`a evidência ${indice + 1} não tem id e linha`);
		const licao = typeof item.licao === "string" ? item.licao : null;
		const bloco = typeof item.bloco === "string" ? item.bloco : null;
		return { id: item.id, linha: item.linha, licao, bloco };
	});
}

/** O relatório da versão 1 com os campos na ordem do formato. */
export function relatorioV1NaOrdem(relatorio: RelatorioMetodoV1): RelatorioMetodoV1 {
	return {
		versao: VERSAO_RELATORIO_ANTIGA,
		modulo: relatorio.modulo,
		situacao: relatorio.situacao,
		geradoEm: relatorio.geradoEm,
		...(relatorio.modelo !== undefined ? { modelo: relatorio.modelo } : {}),
		custo: relatorio.custo,
		...(relatorio.prompt ? { prompt: { nome: relatorio.prompt.nome, hash: relatorio.prompt.hash } } : {}),
		eventosLidos: relatorio.eventosLidos,
		retornos: relatorio.retornos,
		resumo: relatorio.resumo,
		funcionou: relatorio.funcionou.map((item) => ({ texto: item.texto, evidencias: [...item.evidencias] })),
		problemas: relatorio.problemas.map((item) => ({ texto: item.texto, evidencias: [...item.evidencias] })),
		propostas: relatorio.propostas.map((proposta) => ({
			id: proposta.id,
			arquivo: proposta.arquivo,
			ajuste: proposta.ajuste,
			porque: proposta.porque,
			evidencias: [...proposta.evidencias],
			...(proposta.decisao ? { decisao: { ...proposta.decisao } } : {}),
		})),
		evidencias: relatorio.evidencias.map((item) => ({ id: item.id, linha: item.linha, licao: item.licao, bloco: item.bloco })),
	};
}

// --- O relatório na tela --------------------------------------------------------------------

/**
 * O relatório de um módulo concluído no estado: gerando (a extensão está
 * gerando agora), erro (a última geração falhou ou o arquivo não se lê, com a
 * frase), pronto ou pouco_retorno (o gravado) ou nenhum.
 */
export function estadoDoRelatorio(relatorio: Pick<RelatorioMetodo, "situacao"> | null | undefined, extra: { gerando?: boolean; erro?: string } = {}): EstadoRelatorio {
	if (extra.gerando) return { situacao: "gerando" };
	if (extra.erro) return { situacao: "erro", mensagem: extra.erro };
	if (relatorio) return { situacao: relatorio.situacao };
	return { situacao: "nenhum" };
}

/** As evidências de um item ou de uma proposta (os ids, na ordem dada), pelas do relatório; um id sem linha fica de fora. */
export function evidenciasDe(relatorio: Pick<RelatorioMetodo, "evidencias">, ids: readonly string[]): EvidenciaNaTela[] {
	const porId = new Map(relatorio.evidencias.map((item) => [item.id, item]));
	return ids.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []));
}

// --- O texto de um ajuste ---------------------------------------------------------------------

/**
 * Confere o texto de um ajuste (o que o modelo escreveu): aparado,
 * de 1 a AJUSTE_MAXIMO caracteres, sem linha que comece com "## " e sem
 * "<!--" ou "-->" (quebrariam o arquivo de ajustes). Fora disso, ErroMetodo.
 */
export function validarTextoAjuste(valor: unknown): string {
	if (typeof valor !== "string") throw new ErroMetodo("O texto do ajuste não é um texto.");
	const texto = valor.trim();
	if (!texto) throw new ErroMetodo("O texto do ajuste está vazio.");
	if (texto.length > AJUSTE_MAXIMO) throw new ErroMetodo(`O texto do ajuste tem ${texto.length} caracteres; o máximo é ${AJUSTE_MAXIMO}.`);
	if (texto.split(/\r?\n/).some((linha) => /^##\s/.test(linha))) throw new ErroMetodo('O texto do ajuste não pode ter uma linha começando com "## ".');
	if (texto.includes("<!--") || texto.includes("-->")) throw new ErroMetodo('O texto do ajuste não pode ter "<!--" nem "-->".');
	return texto;
}

/** AAAA-MM-DD na hora local. */
export function dataLocal(agora: Date): string {
	const dois = (valor: number) => String(valor).padStart(2, "0");
	return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

// --- Os ajustes do método (aprendiz/metodo/<arquivo>.md) ------------------------------------------

/**
 * Os estados de um ajuste (docs/metodo-experimentos.md): `em teste` vale nas
 * gerações e é um experimento; `mantido` vale e virou regra; `descartado`
 * não vale mais. Ajustes nunca são apagados.
 */
export const ESTADOS_AJUSTE = ["em teste", "mantido", "descartado"] as const;
export type EstadoAjuste = (typeof ESTADOS_AJUSTE)[number];

/** Os estados que valem nas gerações. */
export const ESTADOS_QUE_VALEM = ["em teste", "mantido"] as const satisfies readonly EstadoAjuste[];
export type EstadoQueVale = (typeof ESTADOS_QUE_VALEM)[number];

export const ehEstadoAjuste = (valor: unknown): valor is EstadoAjuste => (ESTADOS_AJUSTE as readonly unknown[]).includes(valor);
export const ajusteVale = (ajuste: Pick<AjusteMetodo, "estado">): ajuste is Pick<AjusteMetodo, "estado"> & { estado: EstadoQueVale } => ajuste.estado !== "descartado";

/** Os estados que o arquivo aceita, como estão escritos e como são lidos: `ativo` (o formato antigo) vale `em teste`, e `desligado`, `descartado`. */
const ESTADOS_LIDOS: Record<string, EstadoAjuste> = { "em teste": "em teste", mantido: "mantido", descartado: "descartado", ativo: "em teste", desligado: "descartado" };

/** Um ajuste do arquivo: o id, o estado, o texto (o que o Breno pode editar à mão) e o comentário de origem como está no arquivo (sem <!-- -->), ou null. */
export interface AjusteMetodo {
	id: string;
	estado: EstadoAjuste;
	texto: string;
	comentario: string | null;
}

/** O arquivo de ajustes de um arquivo de metodologia, lido: o título (a linha "# …") e os ajustes, na ordem. */
export interface AjustesDoArquivo {
	arquivo: ArquivoMetodo;
	titulo: string;
	ajustes: AjusteMetodo[];
}

/** O ajuste que valeu numa geração (módulo gerado: ajustesUsados; evento gerou_modulo): o arquivo de metodologia, o id e o estado que tinha. */
export interface AjusteUsado {
	arquivo: ArquivoMetodo;
	ajuste: string;
	estado: EstadoQueVale;
}

/**
 * De onde um ajuste ou um aprendizado veio, lido do comentário (origemDoMetodo).
 * Os campos que o comentário não diz ficam null (ou vazios).
 */
export interface OrigemDoMetodo {
	materia: string | null;
	curso: string | null;
	modulo: string | null;
	/** O id da proposta no relatório (só nos ajustes que vieram de uma proposta). */
	proposta: string | null;
	evidencias: string[];
	/** AAAA-MM-DD: "começou em" (ajustes), "registrado em" (aprendizados) ou o antigo "aprovado em". */
	em: string | null;
	/** `<arquivo>#<id>` do ajuste que esta reescrita substitui. */
	reescritaDe: string | null;
	/** O id do ajuste que substituiu este (num ajuste descartado por uma reescrita). */
	substituidoPor: string | null;
}

/** O nome que a tela já usava. */
export type OrigemDoAjuste = OrigemDoMetodo;

/** Um ajuste na mensagem ajustes (listar_ajustes). */
export interface AjusteNaTela {
	id: string;
	texto: string;
	estado: EstadoAjuste;
	/** null: o ajuste não diz de onde veio (escrito à mão). */
	origem: OrigemDoMetodo | null;
}

/** Os ajustes de um arquivo de metodologia na mensagem ajustes; com `erro`, o arquivo não se lê (e não é sobrescrito). */
export interface ArquivoDeAjustesNaTela {
	arquivo: ArquivoMetodo;
	ajustes: AjusteNaTela[];
	erro?: string;
}

/** Um ajuste é identificado por `<arquivo>#<id>`, porque os ids se repetem entre arquivos. */
export const referenciaDoAjuste = (arquivo: string, id: string) => `${arquivo}#${id}`;

/** O arquivo e o id de uma `<arquivo>#<id>` (o arquivo pode vir como "metodo/exemplos.md" ou "Exemplos"); fora do formato ou com um arquivo que não é de metodologia, undefined. */
export function lerReferenciaDeAjuste(valor: unknown): { arquivo: ArquivoMetodo; id: string } | undefined {
	if (typeof valor !== "string") return undefined;
	const corte = valor.lastIndexOf("#");
	if (corte < 0) return undefined;
	const arquivo = arquivoDaProposta(valor.slice(0, corte));
	const id = valor.slice(corte + 1).trim();
	return arquivo && ID_AJUSTE.test(id) ? { arquivo, id } : undefined;
}

/** O título de um arquivo de ajustes novo. */
export const tituloDosAjustes = (arquivo: ArquivoMetodo) => `Ajustes do Breno para ${arquivo}`;

/** Um arquivo de ajustes vazio. */
export const ajustesVazios = (arquivo: ArquivoMetodo): AjustesDoArquivo => ({ arquivo, titulo: tituloDosAjustes(arquivo), ajustes: [] });

const CABECALHO = /^##\s+(\S+)\s+[·\-–—|]\s+(.+?)\s*$/;
const COMENTARIO = /^\s*<!--(.*)-->\s*$/;
export const ID_AJUSTE = /^[A-Za-z0-9][\w.-]*$/;

/** Uma seção "## <id> · <estado>" de um arquivo markdown do método, lida. */
export interface SecaoLida<E extends string> {
	id: string;
	estado: E;
	texto: string;
	comentario: string | null;
}

/**
 * Lê um markdown do método (os ajustes e os aprendizados têm o mesmo formato).
 * Antes da primeira seção, só linhas em branco e o título ("# …"). Cada seção
 * começa por "## <id> · <estado>" (o separador também pode ser -, –, — ou |;
 * o estado, sem caixa, é um dos de `estados`, a chave sem caixa e com um
 * espaço só), e o texto vai até o comentário "<!-- … -->" numa linha só (ou
 * até a próxima seção, sem comentário); só linhas em branco depois do
 * comentário. O texto é aparado nas pontas e o resto fica como está (o Breno
 * pode editar à mão). Uma linha que começa com "## " fora do formato, um id
 * repetido ou inválido, uma seção sem texto, texto fora de uma seção e um
 * comentário sem fechamento são Error com a frase e a linha (quem lê do disco
 * não sobrescreve o arquivo).
 */
export function lerSecoesMarkdown<E extends string>(
	texto: string,
	opcoes: { estados: Readonly<Record<string, E>>; rotulo: string; formato: string },
): { titulo: string | undefined; secoes: SecaoLida<E>[] } {
	const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
	let titulo: string | undefined;
	const secoes: SecaoLida<E>[] = [];
	let atual: { id: string; estado: E; linhas: string[]; comentario: string | null; linha: number } | undefined;
	const fechar = () => {
		if (!atual) return;
		const corpo = atual.linhas.join("\n").trim();
		if (!corpo) throw new Error(`o ${opcoes.rotulo} ${atual.id} (linha ${atual.linha}) está sem texto`);
		secoes.push({ id: atual.id, estado: atual.estado, texto: corpo, comentario: atual.comentario });
		atual = undefined;
	};
	for (const [indice, linha] of linhas.entries()) {
		const numeroDaLinha = indice + 1;
		if (/^##\s/.test(linha)) {
			const cabecalho = CABECALHO.exec(linha);
			const estado = cabecalho ? opcoes.estados[cabecalho[2]!.toLowerCase().replace(/\s+/g, " ")] : undefined;
			if (!cabecalho || estado === undefined) throw new Error(`a linha ${numeroDaLinha} não está no formato ${opcoes.formato}`);
			fechar();
			const id = cabecalho[1]!;
			if (!ID_AJUSTE.test(id)) throw new Error(`o id "${id}" (linha ${numeroDaLinha}) não é válido`);
			if (secoes.some((item) => item.id === id)) throw new Error(`o id "${id}" se repete (linha ${numeroDaLinha})`);
			atual = { id, estado, linhas: [], comentario: null, linha: numeroDaLinha };
			continue;
		}
		if (!atual) {
			if (!linha.trim()) continue;
			if (titulo === undefined && /^#\s+\S/.test(linha)) {
				titulo = linha.replace(/^#\s+/, "").trim();
				continue;
			}
			throw new Error(`a linha ${numeroDaLinha} tem texto fora de um ${opcoes.rotulo}`);
		}
		if (atual.comentario !== null) {
			if (linha.trim()) throw new Error(`a linha ${numeroDaLinha} tem texto depois do comentário do ${opcoes.rotulo} ${atual.id}`);
			continue;
		}
		const comentario = COMENTARIO.exec(linha);
		if (comentario) {
			atual.comentario = comentario[1]!.trim();
			continue;
		}
		if (linha.trim().startsWith("<!--")) throw new Error(`o comentário da linha ${numeroDaLinha} não fecha na mesma linha`);
		atual.linhas.push(linha);
	}
	fechar();
	return { titulo, secoes };
}

/**
 * Escreve um markdown do método: o título, uma linha em branco e cada seção
 * ("## <id> · <estado>", o texto e o comentário, quando há), separadas por
 * uma linha em branco. Termina com uma quebra de linha. lerSecoesMarkdown lê
 * de volta o mesmo.
 */
export function escreverSecoesMarkdown(titulo: string, secoes: readonly SecaoLida<string>[]): string {
	const partes = [`# ${titulo}`];
	for (const secao of secoes) partes.push([`## ${secao.id} · ${secao.estado}`, secao.texto, ...(secao.comentario !== null ? [`<!-- ${secao.comentario} -->`] : [])].join("\n"));
	return `${partes.join("\n\n")}\n`;
}

/**
 * Lê o markdown de um arquivo de ajustes (docs/metodo-experimentos.md, "Os
 * experimentos"): lerSecoesMarkdown com os estados `em teste`, `mantido` e
 * `descartado`; os antigos `ativo` (lido como `em teste`) e `desligado` (lido
 * como `descartado`) também valem. Erros como em lerSecoesMarkdown.
 */
export function lerAjustesMarkdown(texto: string, arquivo: ArquivoMetodo): AjustesDoArquivo {
	const { titulo, secoes } = lerSecoesMarkdown<EstadoAjuste>(texto, {
		estados: ESTADOS_LIDOS,
		rotulo: "ajuste",
		formato: '"## <id> · em teste" (ou "· mantido" ou "· descartado")',
	});
	return { arquivo, titulo: titulo ?? tituloDosAjustes(arquivo), ajustes: secoes.map((secao) => ({ id: secao.id, estado: secao.estado, texto: secao.texto, comentario: secao.comentario })) };
}

/** Escreve o markdown de um arquivo de ajustes: sempre com os estados novos (escreverSecoesMarkdown). */
export function escreverAjustesMarkdown(conteudo: Pick<AjustesDoArquivo, "titulo" | "ajustes">): string {
	return escreverSecoesMarkdown(conteudo.titulo, conteudo.ajustes);
}

/** O id de um ajuste novo: a-AAAAMMDD-N (a data local), com N um a mais que o maior do mesmo dia entre os `existentes`. */
export function novoIdAjuste(existentes: readonly string[], agora: Date): string {
	return novoIdComPrefixo("a", existentes, agora);
}

/** O id novo de uma série: <prefixo>-AAAAMMDD-N (a data local), com N um a mais que o maior do mesmo dia entre os `existentes`. */
export function novoIdComPrefixo(prefixo: string, existentes: readonly string[], agora: Date): string {
	const inicio = `${prefixo}-${dataLocal(agora).replace(/-/g, "")}-`;
	let maior = 0;
	for (const id of existentes) {
		if (!id.startsWith(inicio)) continue;
		const n = Number(id.slice(inicio.length));
		if (Number.isInteger(n) && n > maior) maior = n;
	}
	return `${inicio}${maior + 1}`;
}

/**
 * O comentário de origem de um ajuste (ou de um aprendizado): "origem:
 * <matéria>/<curso>/<módulo>/<proposta> · evidências: a, b · começou em
 * AAAA-MM-DD". Sem `proposta` (a reescrita, o aprendizado), a origem acaba no
 * módulo; numa reescrita vai "reescrita de <arquivo>#<id>" depois da origem; a
 * data tem o rótulo `rotuloDaData` ("começou em" por padrão; "registrado em" nos
 * aprendizados).
 */
export function comentarioDaOrigem(origem: {
	materia: string;
	curso: string;
	modulo: string;
	proposta?: string;
	evidencias: readonly string[];
	em: string;
	reescritaDe?: string;
	rotuloDaData?: string;
}): string {
	return [
		`origem: ${[origem.materia, origem.curso, origem.modulo, ...(origem.proposta ? [origem.proposta] : [])].join("/")}`,
		...(origem.reescritaDe ? [`reescrita de ${origem.reescritaDe}`] : []),
		...(origem.evidencias.length > 0 ? [`evidências: ${origem.evidencias.join(", ")}`] : []),
		`${origem.rotuloDaData ?? "começou em"} ${origem.em}`,
	].join(" · ");
}

/** O comentário com a marca de que uma reescrita o substituiu (o ajuste antigo, descartado): "… · substituído por <id>". */
export const comentarioSubstituido = (comentario: string | null, novo: string) => `${comentario ? `${comentario} · ` : ""}substituído por ${novo}`;

/**
 * De onde o ajuste (ou o aprendizado) veio, lido do comentário: "origem:
 * <matéria>/<curso>/<módulo>[/<proposta>]" (ou, no formato antigo, "proposta:
 * m1/p1" ou "proposta: <matéria>/<curso>/m1/p1"), "evidências: a, b", a data
 * ("começou em", "registrado em" ou o antigo "aprovado em"), "reescrita de
 * <arquivo>#<id>" e "substituído por <id>", separados por " · ", em qualquer
 * ordem. Sem comentário, ou sem nenhuma dessas partes, null.
 */
export function origemDoMetodo(item: Pick<AjusteMetodo, "comentario">): OrigemDoMetodo | null {
	if (!item.comentario) return null;
	const origem: OrigemDoMetodo = { materia: null, curso: null, modulo: null, proposta: null, evidencias: [], em: null, reescritaDe: null, substituidoPor: null };
	let achou = false;
	for (const parte of item.comentario.split("·").map((texto) => texto.trim())) {
		const caminho = /^(origem|proposta):\s*(.+)$/i.exec(parte);
		if (caminho) {
			const pedacos = caminho[2]!.split("/").map((texto) => texto.trim());
			const nova = caminho[1]!.toLowerCase() === "origem";
			if (pedacos.length >= 4) [origem.materia, origem.curso, origem.modulo, origem.proposta] = pedacos.slice(-4) as [string, string, string, string];
			else if (nova && pedacos.length === 3) [origem.materia, origem.curso, origem.modulo] = pedacos as [string, string, string];
			else if (pedacos.length >= 2) [origem.modulo, origem.proposta] = pedacos.slice(-2) as [string, string];
			else origem.proposta = pedacos[0] ?? null;
			achou = true;
			continue;
		}
		const evidencias = /^evid[eê]ncias?:\s*(.*)$/i.exec(parte);
		if (evidencias) {
			origem.evidencias = evidencias[1]!.split(",").map((texto) => texto.trim()).filter(Boolean);
			achou = true;
			continue;
		}
		const data = /^(?:come[cç]ou|aprovad[oa]|registrad[oa])\s+em\s+(\S+)$/i.exec(parte);
		if (data) {
			origem.em = data[1]!;
			achou = true;
			continue;
		}
		const reescrita = /^reescrita\s+de\s+(\S+)$/i.exec(parte);
		if (reescrita) {
			origem.reescritaDe = reescrita[1]!;
			achou = true;
			continue;
		}
		const substituido = /^substitu[ií]do\s+por\s+(\S+)$/i.exec(parte);
		if (substituido) {
			origem.substituidoPor = substituido[1]!;
			achou = true;
		}
	}
	return achou ? origem : null;
}

/** O mesmo que origemDoMetodo, com o nome que o ajuste já tinha. */
export const origemDoAjuste = origemDoMetodo;

/** Os ajustes que valem nas gerações (`em teste` e `mantido`), na ordem do arquivo. */
export const ajustesQueValem = (conteudo: Pick<AjustesDoArquivo, "ajustes">): AjusteMetodo[] => conteudo.ajustes.filter(ajusteVale);

/** Os ajustes em um estado, na ordem do arquivo. */
export const ajustesComEstado = (conteudo: Pick<AjustesDoArquivo, "ajustes">, estado: EstadoAjuste): AjusteMetodo[] => conteudo.ajustes.filter((ajuste) => ajuste.estado === estado);

/** O ajuste que vale (`em teste` ou `mantido`) com o mesmo texto (mesmoAjuste), ou undefined. */
export const ajusteQueValeIgual = (conteudo: Pick<AjustesDoArquivo, "ajustes">, texto: string): AjusteMetodo | undefined =>
	conteudo.ajustes.find((ajuste) => ajusteVale(ajuste) && mesmoAjuste(ajuste.texto, texto));

/** Acrescenta um ajuste no fim (`em teste`, ou o `estado` dado), com o id novo (novoIdAjuste), o texto (validarTextoAjuste) e o comentário. Devolve o arquivo novo e o ajuste; o recebido não muda. */
export function acrescentarAjuste(
	conteudo: AjustesDoArquivo,
	novo: { texto: string; comentario: string | null; agora: Date; estado?: EstadoAjuste },
): { conteudo: AjustesDoArquivo; ajuste: AjusteMetodo } {
	const ajuste: AjusteMetodo = { id: novoIdAjuste(conteudo.ajustes.map((item) => item.id), novo.agora), estado: novo.estado ?? "em teste", texto: validarTextoAjuste(novo.texto), comentario: novo.comentario };
	return { conteudo: { ...conteudo, ajustes: [...conteudo.ajustes.map((item) => ({ ...item })), ajuste] }, ajuste };
}

/**
 * Muda o estado de um ajuste (nada é apagado). Com `comentario`, troca o
 * comentário dele (a reescrita acrescenta "substituído por"). Devolve o
 * arquivo novo, o ajuste e se mudou; um id que não existe é ErroMetodo.
 */
export function mudarEstadoDoAjuste(
	conteudo: AjustesDoArquivo,
	id: string,
	estado: EstadoAjuste,
	opcoes: { comentario?: string | null } = {},
): { conteudo: AjustesDoArquivo; ajuste: AjusteMetodo; mudou: boolean } {
	const atual = conteudo.ajustes.find((item) => item.id === id);
	if (!atual) throw new ErroMetodo(`Não achei o ajuste "${id}" em ${conteudo.arquivo}.`);
	const comentario = opcoes.comentario === undefined ? atual.comentario : opcoes.comentario;
	const mudou = atual.estado !== estado || comentario !== atual.comentario;
	const ajustes = conteudo.ajustes.map((item) => (item.id === id ? { ...item, estado, comentario } : { ...item }));
	return { conteudo: { ...conteudo, ajustes }, ajuste: ajustes.find((item) => item.id === id)!, mudou };
}

/** Os ajustes de um arquivo como vão na mensagem ajustes. */
export const ajustesNaTela = (conteudo: Pick<AjustesDoArquivo, "ajustes">): AjusteNaTela[] =>
	conteudo.ajustes.map((ajuste) => ({ id: ajuste.id, texto: ajuste.texto, estado: ajuste.estado, origem: origemDoMetodo(ajuste) }));

/** Os ajustes de um arquivo que valem, como o módulo gerado os guarda (ajustesUsados). */
export const ajustesUsadosDe = (arquivo: ArquivoMetodo, vigentes: readonly Pick<AjusteMetodo, "id" | "estado">[]): AjusteUsado[] =>
	vigentes.flatMap((ajuste) => (ajusteVale(ajuste) ? [{ arquivo, ajuste: ajuste.id, estado: ajuste.estado }] : []));

/**
 * O bloco dos ajustes que valem de um arquivo de metodologia, que vai logo
 * depois da base em toda geração: <ajustes-do-breno arquivo="exemplos.md">, a
 * FRASE_DOS_AJUSTES e um item por ajuste, com o estado dele ("- (em teste)
 * Antes de…"; as linhas seguintes recuadas), e </ajustes-do-breno>. Sem
 * ajuste, "".
 */
export function blocoDeAjustes(arquivo: string, vigentes: readonly Pick<AjusteMetodo, "texto" | "estado">[]): string {
	if (vigentes.length === 0) return "";
	const itens = vigentes.map((ajuste) => `- (${ajuste.estado}) ${ajuste.texto.trim().split("\n").join("\n  ")}`);
	return [`<ajustes-do-breno arquivo=${JSON.stringify(arquivo)}>`, FRASE_DOS_AJUSTES, "", ...itens, "</ajustes-do-breno>"].join("\n");
}
