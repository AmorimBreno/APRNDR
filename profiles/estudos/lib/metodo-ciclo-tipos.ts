// O ciclo do método (parte 4 do plano de 2026-10-28, docs/metodo-ciclo.md)
// sem nada do Node: a tela (profiles/estudos/paineis) importa daqui, e a
// extensão de módulos aplica as mesmas funções antes de gravar
// (lib/metodo-ciclo.ts reexporta). São três coisas:
// - o relatório do método de um módulo concluído: a evidência (os eventos do
//   módulo, cada um numa linha curta legível, a mesma para o modelo e para a
//   tela), a conferência do que o modelo devolve (consertos, sem nova
//   tentativa), as propostas e as decisões do Breno;
// - os ajustes aprovados, um arquivo markdown por arquivo de metodologia
//   (aprendiz/metodo/<arquivo>.md): ler e escrever o formato, preservando o
//   texto editado à mão; um arquivo que não se lê dá erro;
// - o bloco <ajustes-do-breno> que vai logo depois da base em toda geração.
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam.

import { ErroCurso } from "./curso-tipos.ts";
import { ehMotivoRetorno, NOMES_MOTIVO } from "./escrita-tipos.ts";
import type { Evento } from "./eventos.ts";
import { avaliacaoLida, ehNivelLicao, NOMES_AVALIACAO, NOMES_NIVEL, PERGUNTAS_LICAO, type PerguntaLicao } from "./modulo-feedback-tipos.ts";
import { ARQUIVOS_METODO, type ArquivoMetodo, arquivoDeMetodo, type Bloco, type ItemRoteiro, itemDoRoteiro, type Licao, type ModuloGerado } from "./modulo-tipos.ts";
import { ehTipoExplicacao, NOMES_TIPO_EXPLICACAO, semAcento } from "./termos-tipos.ts";

// --- Constantes -----------------------------------------------------------------------

/** Muda quando o formato do relatorios/<módulo>.json mudar. */
export const VERSAO_RELATORIO = 1;

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

/** O motivo opcional de uma proposta rejeitada. */
export const MOTIVO_MAXIMO = 300;

/** A frase que abre o bloco dos ajustes em toda geração. */
export const FRASE_DOS_AJUSTES = "Estes ajustes foram aprovados pelo Breno a partir do retorno dele e valem acima do texto acima quando os dois conflitarem.";

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

/** O relatorios/<módulo>.json. */
export interface RelatorioMetodo {
	versao: typeof VERSAO_RELATORIO;
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

/** A situação do relatório de um módulo concluído no estado (a linha do card). */
export type SituacaoRelatorioNaTela = "gerando" | "pronto" | "pouco_retorno" | "erro" | "nenhum";

/** O relatório de um módulo concluído na mensagem estado. */
export interface EstadoRelatorio {
	situacao: SituacaoRelatorioNaTela;
	/** As propostas sem decisão. */
	pendentes: number;
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

// --- O que o modelo devolve -----------------------------------------------------------------

/** O relatório conferido (validarRelatorioDoModelo): o que vai para o arquivo, sem as decisões. */
export interface RelatorioDoModelo {
	resumo: string;
	funcionou: ItemRelatorio[];
	problemas: ItemRelatorio[];
	propostas: PropostaRelatorio[];
}

/** O nome do arquivo de metodologia que o modelo escreveu ("exemplos.md", "metodo/exemplos.md", "Exemplos"), ou undefined. */
function arquivoDaProposta(valor: unknown): ArquivoMetodo | undefined {
	if (typeof valor !== "string") return undefined;
	let nome = valor.trim().replace(/\\/g, "/").split("/").at(-1)!.toLowerCase();
	if (nome && !nome.endsWith(".md")) nome = `${nome}.md`;
	return ehArquivoMetodo(nome) ? nome : undefined;
}

/** Os ids de uma lista que vem do modelo: textos aparados, sem vazios e sem repetir, na ordem. */
const listaDeIds = (valor: unknown): string[] =>
	Array.isArray(valor) ? [...new Set((valor as unknown[]).filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))] : [];

/**
 * Confere o que o modelo devolveu (prompts/relatorio-metodo.md;
 * docs/metodo-ciclo.md, "O prompt"). Fora do formato (não é um objeto, sem
 * resumo, sem as listas funcionou, problemas e propostas) é ErroMetodo: a
 * extensão tenta de novo, uma vez. O resto é conserto, sem nova tentativa
 * (as frases vão em `consertos`):
 * - os ids de evidência que não estão em `evidencias` (os mandados) saem;
 * - um item de funcionou ou problemas sem texto ou sem nenhum evento sai;
 * - uma proposta sai quando o arquivo não é um de ARQUIVOS_METODO, o ajuste
 *   está vazio ou passa de AJUSTE_MAXIMO caracteres, o porquê está vazio,
 *   cita menos de 2 eventos diferentes, é igual (mesmoAjuste) a um ajuste
 *   ativo do mesmo arquivo (`ativos`) ou a uma proposta anterior do mesmo
 *   arquivo; ficam as MAXIMO_PROPOSTAS primeiras;
 * - o porquê com mais de PORQUE_MAXIMO caracteres e o resumo com mais de
 *   RESUMO_MAXIMO são cortados.
 * As propostas que ficam ganham os ids p1, p2…, na ordem.
 */
export function validarRelatorioDoModelo(
	valor: unknown,
	opcoes: { evidencias: Iterable<string>; ativos?: Partial<Record<ArquivoMetodo, readonly string[]>> },
): { relatorio: RelatorioDoModelo; consertos: string[] } {
	if (!ehObjeto(valor)) throw new ErroMetodo("A resposta não é um objeto JSON.");
	if (typeof valor.resumo !== "string" || !valor.resumo.trim()) throw new ErroMetodo('Falta o "resumo" (um texto em markdown).');
	for (const campo of ["funcionou", "problemas", "propostas"] as const) {
		if (!Array.isArray(valor[campo])) throw new ErroMetodo(`Falta a lista "${campo}" (pode ser vazia).`);
	}
	const validos = new Set(opcoes.evidencias);
	const consertos: string[] = [];
	const evidenciasDe = (bruto: unknown, onde: string): string[] => {
		const ids = listaDeIds(bruto);
		const fora = ids.filter((id) => !validos.has(id));
		if (fora.length > 0) consertos.push(`${onde}: ${fora.length === 1 ? "o id" : "os ids"} ${listaComE(fora.map((id) => `"${id}"`))}, que não ${fora.length === 1 ? "está" : "estão"} na evidência, ${fora.length === 1 ? "saiu" : "saíram"}.`);
		return ids.filter((id) => validos.has(id));
	};

	let resumo = valor.resumo.trim();
	if (resumo.length > RESUMO_MAXIMO) {
		resumo = `${resumo.slice(0, RESUMO_MAXIMO - 1).trimEnd()}…`;
		consertos.push(`O resumo passava de ${RESUMO_MAXIMO} caracteres e foi cortado.`);
	}

	const itens = (campo: "funcionou" | "problemas"): ItemRelatorio[] => {
		const saida: ItemRelatorio[] = [];
		for (const [indice, item] of (valor[campo] as unknown[]).entries()) {
			const onde = `${campo === "funcionou" ? "O que funcionou" : "O que não funcionou"}, item ${indice + 1}`;
			if (!ehObjeto(item) || typeof item.texto !== "string" || !item.texto.trim()) {
				consertos.push(`${onde}: sem texto; saiu.`);
				continue;
			}
			const evidencias = evidenciasDe(item.evidencias, onde);
			if (evidencias.length < MINIMO_EVIDENCIAS_ITEM) {
				consertos.push(`${onde}: sem nenhum evento da evidência; saiu.`);
				continue;
			}
			saida.push({ texto: item.texto.trim(), evidencias });
		}
		return saida;
	};
	const funcionou = itens("funcionou");
	const problemas = itens("problemas");

	const propostas: PropostaRelatorio[] = [];
	for (const [indice, item] of (valor.propostas as unknown[]).entries()) {
		const onde = `Proposta ${indice + 1}`;
		if (!ehObjeto(item)) {
			consertos.push(`${onde}: não é um objeto; saiu.`);
			continue;
		}
		const arquivo = arquivoDaProposta(item.arquivo);
		if (!arquivo) {
			consertos.push(`${onde}: o arquivo "${mostrar(item.arquivo)}" não é um dos arquivos de metodologia; saiu.`);
			continue;
		}
		const ajuste = typeof item.ajuste === "string" ? item.ajuste.trim() : "";
		if (!ajuste) {
			consertos.push(`${onde}: sem o ajuste; saiu.`);
			continue;
		}
		if (ajuste.length > AJUSTE_MAXIMO) {
			consertos.push(`${onde}: o ajuste tem ${ajuste.length} caracteres (o máximo é ${AJUSTE_MAXIMO}); saiu.`);
			continue;
		}
		let porque = typeof item.porque === "string" ? item.porque.trim() : "";
		if (!porque) {
			consertos.push(`${onde}: sem o porquê; saiu.`);
			continue;
		}
		if (porque.length > PORQUE_MAXIMO) {
			porque = `${porque.slice(0, PORQUE_MAXIMO - 1).trimEnd()}…`;
			consertos.push(`${onde}: o porquê passava de ${PORQUE_MAXIMO} caracteres e foi cortado.`);
		}
		const evidencias = evidenciasDe(item.evidencias, onde);
		if (evidencias.length < MINIMO_EVIDENCIAS_PROPOSTA) {
			consertos.push(`${onde}: cita ${evidencias.length} ${evidencias.length === 1 ? "evento" : "eventos"} da evidência (o mínimo é ${MINIMO_EVIDENCIAS_PROPOSTA}); saiu.`);
			continue;
		}
		if ((opcoes.ativos?.[arquivo] ?? []).some((ativo) => mesmoAjuste(ativo, ajuste))) {
			consertos.push(`${onde}: igual a um ajuste ativo de ${arquivo}; saiu.`);
			continue;
		}
		if (propostas.some((outra) => outra.arquivo === arquivo && mesmoAjuste(outra.ajuste, ajuste))) {
			consertos.push(`${onde}: igual a uma proposta anterior para ${arquivo}; saiu.`);
			continue;
		}
		if (propostas.length >= MAXIMO_PROPOSTAS) {
			consertos.push(`${onde}: passa de ${MAXIMO_PROPOSTAS} propostas; saiu.`);
			continue;
		}
		propostas.push({ id: `p${propostas.length + 1}`, arquivo, ajuste, porque, evidencias });
	}
	return { relatorio: { resumo, funcionou, problemas, propostas }, consertos };
}

/** Os ids citados no relatório (itens e propostas), sem repetir. */
export function idsCitados(relatorio: Pick<RelatorioDoModelo, "funcionou" | "problemas" | "propostas">): Set<string> {
	return new Set([...relatorio.funcionou, ...relatorio.problemas, ...relatorio.propostas].flatMap((item) => item.evidencias));
}

/**
 * O relatório novo para gravar: pronto (com o que o modelo devolveu, já
 * conferido, e as evidências citadas, das `todas` montadas, na ordem) ou
 * pouco_retorno (sem modelo: resumo vazio e listas vazias).
 */
export function novoRelatorio(dados: {
	modulo: string;
	geradoEm: string;
	eventosLidos: number;
	retornos: number;
	doModelo?: { relatorio: RelatorioDoModelo; modelo: string; custo: number; prompt: PromptDoRelatorio; todas: readonly EvidenciaNaTela[] };
}): RelatorioMetodo {
	const base = { versao: VERSAO_RELATORIO as typeof VERSAO_RELATORIO, modulo: dados.modulo, geradoEm: dados.geradoEm };
	if (!dados.doModelo) {
		return { ...base, situacao: "pouco_retorno", custo: 0, eventosLidos: dados.eventosLidos, retornos: dados.retornos, resumo: "", funcionou: [], problemas: [], propostas: [], evidencias: [] };
	}
	const { relatorio, modelo, custo, prompt, todas } = dados.doModelo;
	const citados = idsCitados(relatorio);
	return {
		...base,
		situacao: "pronto",
		modelo,
		custo,
		prompt: { nome: prompt.nome, hash: prompt.hash },
		eventosLidos: dados.eventosLidos,
		retornos: dados.retornos,
		resumo: relatorio.resumo,
		funcionou: structuredClone(relatorio.funcionou),
		problemas: structuredClone(relatorio.problemas),
		propostas: structuredClone(relatorio.propostas),
		evidencias: todas.filter((item) => citados.has(item.id)).map((item) => ({ ...item })),
	};
}

// --- Ler o relatório gravado ------------------------------------------------------------------

const ehListaDeTextos = (valor: unknown): valor is string[] => Array.isArray(valor) && (valor as unknown[]).every((item) => typeof item === "string");

/** Um item (funcionou, problemas) lido; erro com a frase. */
function itemLido(valor: unknown, onde: string): ItemRelatorio {
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
 * O relatório lido de um relatorios/<módulo>.json (já com o JSON lido),
 * conferido e com os campos na ordem do formato; fora do formato, Error com
 * a frase (lib/metodo-ciclo.ts diz o arquivo).
 */
export function relatorioLido(valor: unknown, modulo: string): RelatorioMetodo {
	if (!ehObjeto(valor) || valor.versao !== VERSAO_RELATORIO) throw new Error(`não está no formato da versão ${VERSAO_RELATORIO}`);
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
	const evidencias = (valor.evidencias as unknown[]).map((item, indice): EvidenciaNaTela => {
		if (!ehObjeto(item) || typeof item.id !== "string" || typeof item.linha !== "string") throw new Error(`a evidência ${indice + 1} não tem id e linha`);
		const licao = typeof item.licao === "string" ? item.licao : null;
		const bloco = typeof item.bloco === "string" ? item.bloco : null;
		return { id: item.id, linha: item.linha, licao, bloco };
	});
	return relatorioNaOrdem({
		versao: VERSAO_RELATORIO,
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
		evidencias,
	});
}

/** O relatório com os campos na ordem do formato. */
export function relatorioNaOrdem(relatorio: RelatorioMetodo): RelatorioMetodo {
	return {
		versao: VERSAO_RELATORIO,
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

/** As propostas sem decisão. */
export const propostasPendentes = (relatorio: Pick<RelatorioMetodo, "propostas"> | null | undefined) => (relatorio?.propostas ?? []).filter((proposta) => !proposta.decisao).length;

/**
 * O relatório de um módulo concluído no estado: gerando (a extensão está
 * gerando agora), erro (a última geração falhou ou o arquivo não se lê, com a
 * frase), pronto ou pouco_retorno (o gravado) ou nenhum; com as pendentes.
 */
export function estadoDoRelatorio(relatorio: RelatorioMetodo | null | undefined, extra: { gerando?: boolean; erro?: string } = {}): EstadoRelatorio {
	const pendentes = propostasPendentes(relatorio);
	if (extra.gerando) return { situacao: "gerando", pendentes };
	if (extra.erro) return { situacao: "erro", pendentes, mensagem: extra.erro };
	if (relatorio) return { situacao: relatorio.situacao, pendentes };
	return { situacao: "nenhum", pendentes: 0 };
}

/** As evidências de um item ou de uma proposta (os ids, na ordem dada), pelas do relatório; um id sem linha fica de fora. */
export function evidenciasDe(relatorio: Pick<RelatorioMetodo, "evidencias">, ids: readonly string[]): EvidenciaNaTela[] {
	const porId = new Map(relatorio.evidencias.map((item) => [item.id, item]));
	return ids.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []));
}

// --- As decisões ----------------------------------------------------------------------------

export const DECISOES = ["aprovar", "rejeitar"] as const;
export type Decisao = (typeof DECISOES)[number];

/** A decisão que a tela mandou, conferida (validarDecisao). */
export interface DecisaoPedida {
	proposta: string;
	decisao: Decisao;
	/** Em aprovar: o texto editado ("Editar e aprovar"); ausente, vale o ajuste da proposta. */
	texto?: string;
	/** Em rejeitar: o motivo opcional. */
	motivo?: string;
}

/**
 * Confere o texto de um ajuste (o editado num "Editar e aprovar"): aparado,
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

/**
 * Confere a decisão que a tela mandou (decidir_proposta): o id da proposta,
 * a decisão (aprovar ou rejeitar); em aprovar, o texto opcional
 * (validarTextoAjuste; vazio vale como ausente); em rejeitar, o motivo
 * opcional, aparado, até MOTIVO_MAXIMO caracteres. O texto numa rejeição e o
 * motivo numa aprovação são ignorados. Fora disso, ErroMetodo.
 */
export function validarDecisao(entrada: unknown): DecisaoPedida {
	const dados = ehObjeto(entrada) ? entrada : {};
	if (typeof dados.proposta !== "string" || !dados.proposta.trim()) throw new ErroMetodo("Falta o id da proposta.");
	const proposta = dados.proposta.trim();
	if (!(DECISOES as readonly unknown[]).includes(dados.decisao)) throw new ErroMetodo(`A decisão não é válida ("${mostrar(dados.decisao)}"): é aprovar ou rejeitar.`);
	if (dados.decisao === "aprovar") {
		const vazio = dados.texto === undefined || dados.texto === null || (typeof dados.texto === "string" && !dados.texto.trim());
		return { proposta, decisao: "aprovar", ...(vazio ? {} : { texto: validarTextoAjuste(dados.texto) }) };
	}
	if (dados.motivo !== undefined && dados.motivo !== null && typeof dados.motivo !== "string") throw new ErroMetodo("O motivo não é um texto.");
	const motivo = typeof dados.motivo === "string" ? dados.motivo.trim() : "";
	if (motivo.length > MOTIVO_MAXIMO) throw new ErroMetodo(`O motivo tem ${motivo.length} caracteres; o máximo é ${MOTIVO_MAXIMO}.`);
	return { proposta, decisao: "rejeitar", ...(motivo ? { motivo } : {}) };
}

/** A proposta ainda sem decisão de um relatório pronto; senão, ErroMetodo. */
export function propostaPendente(relatorio: RelatorioMetodo, id: string): PropostaRelatorio {
	if (relatorio.situacao !== "pronto") throw new ErroMetodo("O relatório deste módulo não tem propostas.");
	const proposta = relatorio.propostas.find((item) => item.id === id);
	if (!proposta) throw new ErroMetodo(`Não achei a proposta "${id}" no relatório do módulo ${relatorio.modulo}.`);
	if (proposta.decisao) throw new ErroMetodo(`A proposta ${id} já foi ${proposta.decisao.tipo === "aprovada" ? "aprovada" : "rejeitada"}.`);
	return proposta;
}

/** O relatório com a decisão na proposta (propostaPendente confere). Devolve o relatório novo; o recebido não muda. */
export function aplicarDecisao(relatorio: RelatorioMetodo, id: string, decisao: DecisaoProposta): RelatorioMetodo {
	propostaPendente(relatorio, id);
	const copia = relatorioNaOrdem(relatorio);
	copia.propostas = copia.propostas.map((proposta) => (proposta.id === id ? { ...proposta, decisao: { ...decisao } } : proposta));
	return copia;
}

// --- Os ajustes aprovados (aprendiz/metodo/<arquivo>.md) ------------------------------------------

/** Um ajuste do arquivo: o id, se está ligado, o texto (o que o Breno pode editar à mão) e o comentário de origem como está no arquivo (sem <!-- -->), ou null. */
export interface AjusteMetodo {
	id: string;
	ativo: boolean;
	texto: string;
	comentario: string | null;
}

/** O arquivo de ajustes de um arquivo de metodologia, lido: o título (a linha "# …") e os ajustes, na ordem. */
export interface AjustesDoArquivo {
	arquivo: ArquivoMetodo;
	titulo: string;
	ajustes: AjusteMetodo[];
}

/** De onde o ajuste veio, lido do comentário (origemDoAjuste). Os campos que o comentário não diz ficam null (ou vazios). */
export interface OrigemDoAjuste {
	materia: string | null;
	curso: string | null;
	modulo: string | null;
	proposta: string | null;
	evidencias: string[];
	/** AAAA-MM-DD. */
	aprovadoEm: string | null;
}

/** Um ajuste na mensagem ajustes (listar_ajustes). */
export interface AjusteNaTela {
	id: string;
	texto: string;
	ativo: boolean;
	/** null: o ajuste não diz de onde veio (escrito à mão). */
	origem: OrigemDoAjuste | null;
}

/** Os ajustes de um arquivo de metodologia na mensagem ajustes; com `erro`, o arquivo não se lê (e não é sobrescrito). */
export interface ArquivoDeAjustesNaTela {
	arquivo: ArquivoMetodo;
	ajustes: AjusteNaTela[];
	erro?: string;
}

/** O título de um arquivo de ajustes novo. */
export const tituloDosAjustes = (arquivo: ArquivoMetodo) => `Ajustes do Breno para ${arquivo}`;

/** Um arquivo de ajustes vazio. */
export const ajustesVazios = (arquivo: ArquivoMetodo): AjustesDoArquivo => ({ arquivo, titulo: tituloDosAjustes(arquivo), ajustes: [] });

const CABECALHO = /^##\s+(\S+)\s+[·\-–—|]\s+(ativo|desligado)\s*$/i;
const COMENTARIO = /^\s*<!--(.*)-->\s*$/;
const ID_AJUSTE = /^[A-Za-z0-9][\w.-]*$/;

/**
 * Lê o markdown de um arquivo de ajustes (docs/metodo-ciclo.md, "Os ajustes
 * aprovados"). Antes do primeiro ajuste, só linhas em branco e o título
 * ("# …"). Cada ajuste começa por "## <id> · ativo" (ou "· desligado"; o
 * separador também pode ser -, –, — ou |), e o texto vai até o comentário
 * "<!-- … -->" numa linha só (ou até o próximo ajuste, sem comentário); só
 * linhas em branco depois do comentário. O texto é aparado nas pontas e o
 * resto fica como está (o Breno pode editar à mão). Uma linha que começa com
 * "## " fora do formato, um id repetido ou inválido, um ajuste sem texto,
 * texto fora de um ajuste e um comentário sem fechamento são Error com a
 * frase e a linha (quem lê do disco não sobrescreve o arquivo).
 */
export function lerAjustesMarkdown(texto: string, arquivo: ArquivoMetodo): AjustesDoArquivo {
	const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
	let titulo: string | undefined;
	const ajustes: AjusteMetodo[] = [];
	let atual: { id: string; ativo: boolean; linhas: string[]; comentario: string | null; linha: number } | undefined;
	const fechar = () => {
		if (!atual) return;
		const corpo = atual.linhas.join("\n").trim();
		if (!corpo) throw new Error(`o ajuste ${atual.id} (linha ${atual.linha}) está sem texto`);
		ajustes.push({ id: atual.id, ativo: atual.ativo, texto: corpo, comentario: atual.comentario });
		atual = undefined;
	};
	for (const [indice, linha] of linhas.entries()) {
		const numeroDaLinha = indice + 1;
		if (/^##\s/.test(linha)) {
			const cabecalho = CABECALHO.exec(linha);
			if (!cabecalho) throw new Error(`a linha ${numeroDaLinha} não está no formato "## <id> · ativo" (ou "· desligado")`);
			fechar();
			const id = cabecalho[1]!;
			if (!ID_AJUSTE.test(id)) throw new Error(`o id "${id}" (linha ${numeroDaLinha}) não é válido`);
			if (ajustes.some((item) => item.id === id)) throw new Error(`o id "${id}" se repete (linha ${numeroDaLinha})`);
			atual = { id, ativo: cabecalho[2]!.toLowerCase() === "ativo", linhas: [], comentario: null, linha: numeroDaLinha };
			continue;
		}
		if (!atual) {
			if (!linha.trim()) continue;
			if (titulo === undefined && /^#\s+\S/.test(linha)) {
				titulo = linha.replace(/^#\s+/, "").trim();
				continue;
			}
			throw new Error(`a linha ${numeroDaLinha} tem texto fora de um ajuste`);
		}
		if (atual.comentario !== null) {
			if (linha.trim()) throw new Error(`a linha ${numeroDaLinha} tem texto depois do comentário do ajuste ${atual.id}`);
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
	return { arquivo, titulo: titulo ?? tituloDosAjustes(arquivo), ajustes };
}

/**
 * Escreve o markdown de um arquivo de ajustes: o título, uma linha em
 * branco e cada ajuste ("## <id> · ativo" ou "· desligado", o texto e o
 * comentário, quando há), separados por uma linha em branco. Termina com uma
 * quebra de linha. lerAjustesMarkdown lê de volta o mesmo.
 */
export function escreverAjustesMarkdown(conteudo: Pick<AjustesDoArquivo, "titulo" | "ajustes">): string {
	const partes = [`# ${conteudo.titulo}`];
	for (const ajuste of conteudo.ajustes) {
		partes.push([`## ${ajuste.id} · ${ajuste.ativo ? "ativo" : "desligado"}`, ajuste.texto, ...(ajuste.comentario !== null ? [`<!-- ${ajuste.comentario} -->`] : [])].join("\n"));
	}
	return `${partes.join("\n\n")}\n`;
}

/** AAAA-MM-DD na hora local. */
export function dataLocal(agora: Date): string {
	const dois = (valor: number) => String(valor).padStart(2, "0");
	return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** O id de um ajuste novo: a-AAAAMMDD-N (a data local), com N um a mais que o maior do mesmo dia entre os `existentes`. */
export function novoIdAjuste(existentes: readonly string[], agora: Date): string {
	const dia = dataLocal(agora).replace(/-/g, "");
	const prefixo = `a-${dia}-`;
	let maior = 0;
	for (const id of existentes) {
		if (!id.startsWith(prefixo)) continue;
		const n = Number(id.slice(prefixo.length));
		if (Number.isInteger(n) && n > maior) maior = n;
	}
	return `${prefixo}${maior + 1}`;
}

/** O comentário de origem de um ajuste aprovado: "proposta: <matéria>/<curso>/<módulo>/<proposta> · evidências: a, b · aprovado em AAAA-MM-DD". */
export function comentarioDaOrigem(origem: { materia: string; curso: string; modulo: string; proposta: string; evidencias: readonly string[]; aprovadoEm: string }): string {
	return `proposta: ${origem.materia}/${origem.curso}/${origem.modulo}/${origem.proposta} · evidências: ${origem.evidencias.join(", ")} · aprovado em ${origem.aprovadoEm}`;
}

/**
 * De onde o ajuste veio, lido do comentário: "proposta: m1/p1" (módulo e
 * proposta) ou "proposta: <matéria>/<curso>/m1/p1", "evidências: a, b" e
 * "aprovado em AAAA-MM-DD", separados por " · ", em qualquer ordem. Sem
 * comentário, ou sem nenhuma dessas partes, null.
 */
export function origemDoAjuste(ajuste: Pick<AjusteMetodo, "comentario">): OrigemDoAjuste | null {
	if (!ajuste.comentario) return null;
	const origem: OrigemDoAjuste = { materia: null, curso: null, modulo: null, proposta: null, evidencias: [], aprovadoEm: null };
	let achou = false;
	for (const parte of ajuste.comentario.split("·").map((item) => item.trim())) {
		const proposta = /^proposta:\s*(.+)$/i.exec(parte);
		if (proposta) {
			const pedacos = proposta[1]!.split("/").map((item) => item.trim());
			if (pedacos.length >= 4) [origem.materia, origem.curso, origem.modulo, origem.proposta] = pedacos.slice(-4) as [string, string, string, string];
			else if (pedacos.length >= 2) [origem.modulo, origem.proposta] = pedacos.slice(-2) as [string, string];
			else origem.proposta = pedacos[0] ?? null;
			achou = true;
			continue;
		}
		const evidencias = /^evid[eê]ncias?:\s*(.*)$/i.exec(parte);
		if (evidencias) {
			origem.evidencias = evidencias[1]!.split(",").map((item) => item.trim()).filter(Boolean);
			achou = true;
			continue;
		}
		const aprovado = /^aprovad[oa]\s+em\s+(\S+)$/i.exec(parte);
		if (aprovado) {
			origem.aprovadoEm = aprovado[1]!;
			achou = true;
		}
	}
	return achou ? origem : null;
}

/** Os ajustes ligados, na ordem do arquivo. */
export const ajustesAtivos = (conteudo: Pick<AjustesDoArquivo, "ajustes">): AjusteMetodo[] => conteudo.ajustes.filter((ajuste) => ajuste.ativo);

/** O ajuste ligado com o mesmo texto (mesmoAjuste), ou undefined. */
export const ajusteAtivoIgual = (conteudo: Pick<AjustesDoArquivo, "ajustes">, texto: string): AjusteMetodo | undefined =>
	conteudo.ajustes.find((ajuste) => ajuste.ativo && mesmoAjuste(ajuste.texto, texto));

/** Acrescenta um ajuste ligado no fim (novoIdAjuste), com o texto (validarTextoAjuste) e o comentário. Devolve o arquivo novo e o ajuste; o recebido não muda. */
export function acrescentarAjuste(conteudo: AjustesDoArquivo, novo: { texto: string; comentario: string | null; agora: Date }): { conteudo: AjustesDoArquivo; ajuste: AjusteMetodo } {
	const ajuste: AjusteMetodo = { id: novoIdAjuste(conteudo.ajustes.map((item) => item.id), novo.agora), ativo: true, texto: validarTextoAjuste(novo.texto), comentario: novo.comentario };
	return { conteudo: { ...conteudo, ajustes: [...conteudo.ajustes.map((item) => ({ ...item })), ajuste] }, ajuste };
}

/** Liga ou desliga um ajuste (nada é apagado). Devolve o arquivo novo, o ajuste e se mudou; um id que não existe é ErroMetodo. */
export function ligarAjuste(conteudo: AjustesDoArquivo, id: string, ativo: boolean): { conteudo: AjustesDoArquivo; ajuste: AjusteMetodo; mudou: boolean } {
	const atual = conteudo.ajustes.find((item) => item.id === id);
	if (!atual) throw new ErroMetodo(`Não achei o ajuste "${id}" em ${conteudo.arquivo}.`);
	const mudou = atual.ativo !== ativo;
	const ajustes = conteudo.ajustes.map((item) => (item.id === id ? { ...item, ativo } : { ...item }));
	return { conteudo: { ...conteudo, ajustes }, ajuste: ajustes.find((item) => item.id === id)!, mudou };
}

/** Os ajustes de um arquivo como vão na mensagem ajustes. */
export const ajustesNaTela = (conteudo: Pick<AjustesDoArquivo, "ajustes">): AjusteNaTela[] =>
	conteudo.ajustes.map((ajuste) => ({ id: ajuste.id, texto: ajuste.texto, ativo: ajuste.ativo, origem: origemDoAjuste(ajuste) }));

/**
 * O bloco dos ajustes ativos de um arquivo de metodologia, que vai logo
 * depois da base em toda geração: <ajustes-do-breno arquivo="exemplos.md">,
 * a FRASE_DOS_AJUSTES e um item por ajuste (as linhas seguintes recuadas),
 * e </ajustes-do-breno>. Sem ajuste, "".
 */
export function blocoDeAjustes(arquivo: string, ativos: readonly Pick<AjusteMetodo, "texto">[]): string {
	if (ativos.length === 0) return "";
	const itens = ativos.map((ajuste) => `- ${ajuste.texto.trim().split("\n").join("\n  ")}`);
	return [`<ajustes-do-breno arquivo=${JSON.stringify(arquivo)}>`, FRASE_DOS_AJUSTES, "", ...itens, "</ajustes-do-breno>"].join("\n");
}
