// A análise de um módulo concluído, o relatório do método da versão 2
// (docs/metodo-experimentos.md, "A análise"), sem nada do Node (a tela importa
// daqui): a conferência do que o modelo devolve (consertos, sem nova
// tentativa), o relatório gravado (as decisões sobre os experimentos, os
// experimentos novos, o que ficou para depois, os aprendizados e as revisões,
// o placar e a comparação com o histórico) e a leitura dele, aceitando a
// versão 1 também. Aplicar a análise (os arquivos e os eventos) é do disco:
// lib/metodo-ciclo.ts. Todas as funções são puras.

import {
	AJUSTE_MAXIMO,
	arquivoDaProposta,
	ehArquivoMetodo,
	ehListaDeTextos,
	ErroMetodo,
	type EvidenciaNaTela,
	evidenciasLidas,
	type ItemRelatorio,
	itemLido,
	lerReferenciaDeAjuste,
	listaDeIds,
	mesmoAjuste,
	MAXIMO_PROPOSTAS,
	MINIMO_EVIDENCIAS_ITEM,
	MINIMO_EVIDENCIAS_PROPOSTA,
	PORQUE_MAXIMO,
	type PromptDoRelatorio,
	referenciaDoAjuste,
	RESUMO_MAXIMO,
	type RelatorioMetodo,
	relatorioV1Lido,
	relatorioV1NaOrdem,
	type SituacaoRelatorio,
	SITUACOES_RELATORIO,
	validarTextoAjuste,
	VERSAO_RELATORIO,
} from "./metodo-ciclo-tipos.ts";
import type { ArquivoMetodo } from "./modulo-tipos.ts";
import { MAXIMO_APRENDIZADOS_POR_ANALISE, type SituacaoAprendizado, REVISOES, validarTextoDoAprendizado } from "./metodo-aprendizados-tipos.ts";
import { type Comparacao, comparacaoLida, type PlacarDoModulo, placarLido } from "./metodo-placar-tipos.ts";

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : (JSON.stringify(valor) ?? String(valor)));
/** "a", "a e b", "a, b e c". */
const listaComE = (itens: readonly string[]) => (itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

// --- Constantes ---------------------------------------------------------------------------------

/** Quantos experimentos podem estar em teste ao mesmo tempo, para dar para saber o que causou uma melhora. */
export const MAXIMO_EXPERIMENTOS = 2;

/** O que a análise decide sobre um experimento em teste. */
export const DECISOES_DO_EXPERIMENTO = ["manter", "reescrever", "descartar", "continuar"] as const;
export type DecisaoDoExperimento = (typeof DECISOES_DO_EXPERIMENTO)[number];

/** Em quantos módulos concluídos (contando o atual) o experimento precisa ter valido para a decisão valer. Abaixo disso, vira `continuar`. */
export const MINIMO_MODULOS_PARA_MANTER = 2;
export const MINIMO_MODULOS_PARA_MUDAR = 1;

/** O porquê de uma decisão vai até aqui; o de um aprendizado e de uma revisão, até PORQUE_MAXIMO. */
export const PORQUE_DA_DECISAO_MAXIMO = 400;

/** O porquê do `continuar` de um experimento que a análise não decidiu. */
export const PORQUE_NAO_DECIDIU = "A análise não decidiu sobre ele.";

/** O erro de gerar de novo a análise de um módulo cuja análise já foi aplicada. */
export const FRASE_JA_APLICADA = "A análise deste módulo já foi aplicada.";

// --- Os tipos do relatório da versão 2 ------------------------------------------------------------

/** Um módulo em que um experimento valeu (estava em ajustesUsados). */
export interface ModuloTestado {
	materia: string;
	curso: string;
	modulo: string;
	moduloNome: string;
	/** É o módulo da análise (o atual). */
	atual: boolean;
}

/** Um experimento em teste como a análise o recebe: o arquivo, o id, o texto e os módulos em que valeu (contando o atual). */
export interface ExperimentoEmTeste {
	arquivo: ArquivoMetodo;
	id: string;
	texto: string;
	/** Quando começou (AAAA-MM-DD), se o comentário diz. */
	comecouEm?: string | null;
	testadoEm: readonly ModuloTestado[];
}

/** A decisão da análise sobre um experimento, no relatório. */
export interface ExperimentoDecidido {
	/** `<arquivo>#<id>`. */
	ajuste: string;
	arquivo: ArquivoMetodo;
	/** O texto do experimento (o de antes da decisão). */
	texto: string;
	decisao: DecisaoDoExperimento;
	/** Os números de antes e de depois, até PORQUE_DA_DECISAO_MAXIMO caracteres. */
	porque: string;
	/** Em quantos módulos concluídos, contando o atual, o experimento valeu. */
	modulosTestados: number;
	/** Quais (para a tela dizer "testado em: m2, m3"). */
	testadoEm: ModuloTestado[];
	/** Só em `reescrever`: o texto novo. */
	textoNovo?: string;
	/** Só em `reescrever`, depois de aplicada: `<arquivo>#<id>` do ajuste novo, que entra `em teste`. */
	novo?: string;
	/** Quando o código mudou a decisão (para `continuar`) ou o que o modelo mandou, a frase do conserto. */
	conserto?: string;
}

/** Uma proposta que entrou como experimento novo: id p1, p2…, e, depois de aplicada, o `<arquivo>#<id>` do ajuste criado. */
export interface PropostaAplicada {
	id: string;
	arquivo: ArquivoMetodo;
	ajuste: string;
	porque: string;
	evidencias: string[];
	novo?: string;
}

/** Uma proposta que ficou de fora pelo limite de experimentos em teste. Só para leitura; não entra depois sozinha. */
export interface PropostaParaDepois {
	arquivo: ArquivoMetodo;
	ajuste: string;
	porque: string;
	evidencias: string[];
}

/** Um aprendizado novo que a análise registrou; depois de aplicado, o id dele em aprendizados.md. */
export interface AprendizadoRegistrado {
	texto: string;
	porque: string;
	evidencias: string[];
	novo?: string;
}

/** Uma revisão de um aprendizado registrado antes (confirmado ou contradito). */
export interface RevisaoDeAprendizado {
	aprendizado: string;
	/** O texto do aprendizado (para a tela mostrar sem ler o arquivo). */
	texto: string;
	situacao: "confirmado" | "contradito";
	porque: string;
	/** A situação que ele tinha antes. */
	anterior: SituacaoAprendizado;
}

/** O relatorios/<módulo>.json da versão 2. */
export interface RelatorioMetodoV2 {
	versao: typeof VERSAO_RELATORIO;
	modulo: string;
	/** `pouco_retorno`: o modelo não foi chamado, nenhum experimento mudou, e o placar fica guardado. */
	situacao: SituacaoRelatorio;
	/** ISO 8601. */
	geradoEm: string;
	/** provedor/id do modelo. Ausente em pouco_retorno. */
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
	/** Os eventos citados, na ordem em que aconteceram, com a linha que foi ao modelo. */
	evidencias: EvidenciaNaTela[];
	/** O placar do módulo, calculado pelo código. */
	placar: PlacarDoModulo;
	/** O placar do módulo contra a média do histórico, por métrica. */
	comparacao: Comparacao;
	/** Um item por experimento que estava em teste. */
	experimentos: ExperimentoDecidido[];
	/** As propostas que entraram como experimentos novos. */
	propostas: PropostaAplicada[];
	/** As que ficaram de fora pelo limite. */
	paraDepois: PropostaParaDepois[];
	aprendizados: AprendizadoRegistrado[];
	revisoes: RevisaoDeAprendizado[];
	/** ISO 8601: quando a análise foi aplicada (os arquivos e os eventos). Com ele, o relatório não pode ser gerado de novo. */
	aplicadoEm?: string;
	/** Se aplicar falhou no meio: a frase. O que já foi aplicado está nos arquivos e nos eventos; não há nova tentativa automática. */
	erroAoAplicar?: string;
}

/** O relatório da versão 2 é de uma análise já aplicada? */
export const foiAplicada = (relatorio: Pick<RelatorioMetodoV2, "aplicadoEm"> | RelatorioMetodo | null | undefined): boolean =>
	relatorio !== null && relatorio !== undefined && "aplicadoEm" in relatorio && typeof relatorio.aplicadoEm === "string";

/** Gerar de novo um relatório com aplicadoEm é ErroMetodo (FRASE_JA_APLICADA); os da versão 1, pouco_retorno ou que falharam podem. */
export function conferirQuePodeGerarDeNovo(anterior: RelatorioMetodo | null | undefined): void {
	if (foiAplicada(anterior)) throw new ErroMetodo(FRASE_JA_APLICADA);
}

// --- O que o modelo devolve --------------------------------------------------------------------------

/** A análise conferida (validarAnaliseDoModelo): o que vai para o relatório, antes de ser aplicada. */
export interface AnaliseDoModelo {
	resumo: string;
	funcionou: ItemRelatorio[];
	problemas: ItemRelatorio[];
	experimentos: ExperimentoDecidido[];
	propostas: PropostaAplicada[];
	paraDepois: PropostaParaDepois[];
	aprendizados: AprendizadoRegistrado[];
	revisoes: RevisaoDeAprendizado[];
}

/** O que a conferência precisa saber do estado de agora. */
export interface OpcoesDaAnalise {
	/** Os ids dos eventos mandados na evidência. */
	evidencias: Iterable<string>;
	/** Os experimentos em teste, na ordem. */
	emTeste: readonly ExperimentoEmTeste[];
	/** Os textos dos ajustes que valem (em teste e mantidos), por arquivo. */
	vigentes?: Partial<Record<ArquivoMetodo, readonly string[]>>;
	/** Os textos dos ajustes descartados, por arquivo (uma proposta igual a um deles sai). */
	descartados?: Partial<Record<ArquivoMetodo, readonly string[]>>;
	/** Os aprendizados registrados, com a situação. */
	aprendizados?: ReadonlyArray<{ id: string; texto: string; situacao: SituacaoAprendizado }>;
	/** Quantos podem estar em teste (MAXIMO_EXPERIMENTOS). */
	maximoEmTeste?: number;
}

const cortar = (texto: string, limite: number) => (texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto);

/**
 * Confere o que o modelo devolveu (prompts/relatorio-metodo.md;
 * docs/metodo-experimentos.md, "O que o código confere"). Fora do formato
 * (não é um objeto, sem resumo, sem as listas funcionou, problemas e
 * propostas, ou uma lista nova que não é lista) é ErroMetodo: a extensão tenta
 * de novo, uma vez. O resto é conserto, sem nova tentativa (as frases vão em
 * `consertos`):
 * - os ids de evidência que não estão em `evidencias` saem; um item de
 *   funcionou ou problemas sem texto ou sem nenhum evento sai;
 * - experimentos: só vale um experimento em teste, uma decisão por
 *   experimento; um que ficou de fora recebe `continuar` ("A análise não
 *   decidiu sobre ele."); `manter` exige 2 módulos testados (contando o atual)
 *   e `descartar` e `reescrever`, 1, senão viram `continuar` com a frase em
 *   `conserto`; `reescrever` exige um texto novo (validarTextoAjuste: até 400
 *   caracteres), diferente do atual e de outro ajuste que vale do arquivo; o
 *   porquê vazio faz a decisão sair, e passando de 400 caracteres é cortado;
 * - propostas: arquivo de metodologia, ajuste de 1 a 400 caracteres sem
 *   quebrar o arquivo, porquê até 300 (cortado), pelo menos 2 eventos; sai a
 *   igual a um ajuste que vale, a um descartado ou à reescrita de um
 *   experimento no mesmo arquivo, e a repetida; valem as primeiras
 *   MAXIMO_PROPOSTAS; entram, na ordem, até o número de vagas que sobrou
 *   depois das decisões (uma reescrita ocupa a vaga do experimento que
 *   substitui; um mantido ou descartado libera a dele), e as outras vão para
 *   `paraDepois`;
 * - aprendizados: no máximo 3, texto até 300 caracteres, porquê até 300
 *   (cortado), pelo menos 1 evento; sai o igual (mesmoAjuste) a um registrado
 *   ou a outro da resposta;
 * - revisões: o id precisa existir, a situação é confirmado ou contradito e
 *   diferente da de agora, uma por aprendizado, porquê de 1 a 300 (cortado).
 * As propostas que entram ganham os ids p1, p2…, na ordem.
 */
export function validarAnaliseDoModelo(valor: unknown, opcoes: OpcoesDaAnalise): { analise: AnaliseDoModelo; consertos: string[] } {
	if (!ehObjeto(valor)) throw new ErroMetodo("A resposta não é um objeto JSON.");
	if (typeof valor.resumo !== "string" || !valor.resumo.trim()) throw new ErroMetodo('Falta o "resumo" (um texto em markdown).');
	for (const campo of ["funcionou", "problemas", "propostas"] as const) {
		if (!Array.isArray(valor[campo])) throw new ErroMetodo(`Falta a lista "${campo}" (pode ser vazia).`);
	}
	for (const campo of ["experimentos", "aprendizados", "revisoes"] as const) {
		if (valor[campo] !== undefined && !Array.isArray(valor[campo])) throw new ErroMetodo(`"${campo}" não é uma lista (pode ser vazia).`);
	}
	const validos = new Set(opcoes.evidencias);
	const consertos: string[] = [];
	const vigentes = opcoes.vigentes ?? {};
	const descartados = opcoes.descartados ?? {};
	const registrados = opcoes.aprendizados ?? [];
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

	// --- Os experimentos em teste -----------------------------------------------------------
	const pedidas = new Map<string, { decisao: DecisaoDoExperimento; porque: string; texto?: unknown }>();
	for (const [indice, item] of ((valor.experimentos as unknown[] | undefined) ?? []).entries()) {
		const onde = `Experimento ${indice + 1}`;
		if (!ehObjeto(item)) {
			consertos.push(`${onde}: não é um objeto; saiu.`);
			continue;
		}
		const referencia = lerReferenciaDeAjuste(item.ajuste);
		const chave = referencia ? referenciaDoAjuste(referencia.arquivo, referencia.id) : undefined;
		if (!chave || !opcoes.emTeste.some((experimento) => referenciaDoAjuste(experimento.arquivo, experimento.id) === chave)) {
			consertos.push(`${onde}: "${mostrar(item.ajuste)}" não é um experimento em teste; saiu.`);
			continue;
		}
		if (pedidas.has(chave)) {
			consertos.push(`${onde}: mais de uma decisão para ${chave}; ficou a primeira.`);
			continue;
		}
		if (!(DECISOES_DO_EXPERIMENTO as readonly unknown[]).includes(item.decisao)) {
			consertos.push(`${onde}: a decisão "${mostrar(item.decisao)}" não é manter, reescrever, descartar nem continuar; saiu.`);
			continue;
		}
		let porque = typeof item.porque === "string" ? item.porque.trim() : "";
		if (!porque) {
			consertos.push(`${onde}: sem o porquê; a decisão sobre ${chave} saiu.`);
			continue;
		}
		if (porque.length > PORQUE_DA_DECISAO_MAXIMO) {
			porque = cortar(porque, PORQUE_DA_DECISAO_MAXIMO);
			consertos.push(`${onde}: o porquê passava de ${PORQUE_DA_DECISAO_MAXIMO} caracteres e foi cortado.`);
		}
		pedidas.set(chave, { decisao: item.decisao as DecisaoDoExperimento, porque, texto: item.texto });
	}

	const experimentos: ExperimentoDecidido[] = opcoes.emTeste.map((experimento): ExperimentoDecidido => {
		const ajuste = referenciaDoAjuste(experimento.arquivo, experimento.id);
		const testadoEm = experimento.testadoEm.map((item) => ({ ...item }));
		const base = { ajuste, arquivo: experimento.arquivo, texto: experimento.texto, modulosTestados: testadoEm.length, testadoEm };
		const pedida = pedidas.get(ajuste);
		if (!pedida) return { ...base, decisao: "continuar", porque: PORQUE_NAO_DECIDIU };
		const continuarComConserto = (frase: string): ExperimentoDecidido => {
			consertos.push(`${ajuste}: ${frase}`);
			return { ...base, decisao: "continuar", porque: pedida.porque, conserto: frase };
		};
		const modulos = `${testadoEm.length} ${testadoEm.length === 1 ? "módulo" : "módulos"}`;
		if (pedida.decisao === "continuar") return { ...base, decisao: "continuar", porque: pedida.porque };
		if (pedida.decisao === "manter") {
			if (testadoEm.length < MINIMO_MODULOS_PARA_MANTER) return continuarComConserto(`a análise pediu manter, mas o experimento só valeu em ${modulos} (o mínimo é ${MINIMO_MODULOS_PARA_MANTER}); continua em teste.`);
			return { ...base, decisao: "manter", porque: pedida.porque };
		}
		if (testadoEm.length < MINIMO_MODULOS_PARA_MUDAR) {
			return continuarComConserto(`a análise pediu ${pedida.decisao === "descartar" ? "descartar" : "reescrever"}, mas o experimento ainda não valeu em nenhum módulo concluído; continua em teste.`);
		}
		if (pedida.decisao === "descartar") return { ...base, decisao: "descartar", porque: pedida.porque };
		let textoNovo: string;
		try {
			textoNovo = validarTextoAjuste(pedida.texto);
		} catch (erro) {
			return continuarComConserto(`a reescrita não tem um texto novo que valha (${(erro as Error).message.replace(/\.$/, "")}); continua em teste.`);
		}
		if (mesmoAjuste(textoNovo, experimento.texto)) return continuarComConserto("o texto da reescrita é igual ao atual; continua em teste.");
		const outros = (vigentes[experimento.arquivo] ?? []).filter((texto) => !mesmoAjuste(texto, experimento.texto));
		if (outros.some((texto) => mesmoAjuste(texto, textoNovo))) return continuarComConserto("o texto da reescrita é igual a outro ajuste que vale do mesmo arquivo; continua em teste.");
		return { ...base, decisao: "reescrever", porque: pedida.porque, textoNovo };
	});

	// As vagas depois das decisões: o que continua em teste (e a reescrita, que ocupa a vaga do que substitui) fica.
	const ocupadas = experimentos.filter((item) => item.decisao === "continuar" || item.decisao === "reescrever").length;
	const vagas = Math.max(0, (opcoes.maximoEmTeste ?? MAXIMO_EXPERIMENTOS) - ocupadas);
	const reescritas = new Map<ArquivoMetodo, string[]>();
	for (const item of experimentos) if (item.textoNovo !== undefined) reescritas.set(item.arquivo, [...(reescritas.get(item.arquivo) ?? []), item.textoNovo]);

	// --- As propostas ----------------------------------------------------------------------------
	const validas: PropostaParaDepois[] = [];
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
		try {
			validarTextoAjuste(ajuste);
		} catch (erro) {
			consertos.push(`${onde}: ${(erro as Error).message} Saiu.`);
			continue;
		}
		let porque = typeof item.porque === "string" ? item.porque.trim() : "";
		if (!porque) {
			consertos.push(`${onde}: sem o porquê; saiu.`);
			continue;
		}
		if (porque.length > PORQUE_MAXIMO) {
			porque = cortar(porque, PORQUE_MAXIMO);
			consertos.push(`${onde}: o porquê passava de ${PORQUE_MAXIMO} caracteres e foi cortado.`);
		}
		const evidencias = evidenciasDe(item.evidencias, onde);
		if (evidencias.length < MINIMO_EVIDENCIAS_PROPOSTA) {
			consertos.push(`${onde}: cita ${evidencias.length} ${evidencias.length === 1 ? "evento" : "eventos"} da evidência (o mínimo é ${MINIMO_EVIDENCIAS_PROPOSTA}); saiu.`);
			continue;
		}
		if ((vigentes[arquivo] ?? []).some((texto) => mesmoAjuste(texto, ajuste))) {
			consertos.push(`${onde}: igual a um ajuste que já vale em ${arquivo}; saiu.`);
			continue;
		}
		if ((descartados[arquivo] ?? []).some((texto) => mesmoAjuste(texto, ajuste))) {
			consertos.push(`${onde}: igual a um ajuste descartado de ${arquivo}; saiu.`);
			continue;
		}
		if ((reescritas.get(arquivo) ?? []).some((texto) => mesmoAjuste(texto, ajuste))) {
			consertos.push(`${onde}: igual à reescrita de um experimento de ${arquivo}; saiu.`);
			continue;
		}
		if (validas.some((outra) => outra.arquivo === arquivo && mesmoAjuste(outra.ajuste, ajuste))) {
			consertos.push(`${onde}: igual a uma proposta anterior para ${arquivo}; saiu.`);
			continue;
		}
		if (validas.length >= MAXIMO_PROPOSTAS) {
			consertos.push(`${onde}: passa de ${MAXIMO_PROPOSTAS} propostas; saiu.`);
			continue;
		}
		validas.push({ arquivo, ajuste, porque, evidencias });
	}
	const propostas = validas.slice(0, vagas).map((proposta, indice): PropostaAplicada => ({ id: `p${indice + 1}`, ...proposta }));
	const paraDepois = validas.slice(vagas);
	if (paraDepois.length > 0) {
		consertos.push(`${paraDepois.length === 1 ? "Uma proposta ficou" : `${paraDepois.length} propostas ficaram`} para depois: ${vagas === 0 ? "não há vaga" : `só ${vagas === 1 ? "há 1 vaga" : `há ${vagas} vagas`}`} para experimentos novos.`);
	}

	// --- Os aprendizados e as revisões ----------------------------------------------------------
	const aprendizados: AprendizadoRegistrado[] = [];
	for (const [indice, item] of ((valor.aprendizados as unknown[] | undefined) ?? []).entries()) {
		const onde = `Aprendizado ${indice + 1}`;
		if (!ehObjeto(item)) {
			consertos.push(`${onde}: não é um objeto; saiu.`);
			continue;
		}
		let texto: string;
		try {
			texto = validarTextoDoAprendizado(item.texto);
		} catch (erro) {
			consertos.push(`${onde}: ${(erro as Error).message} Saiu.`);
			continue;
		}
		let porque = typeof item.porque === "string" ? item.porque.trim() : "";
		if (!porque) {
			consertos.push(`${onde}: sem o porquê; saiu.`);
			continue;
		}
		if (porque.length > PORQUE_MAXIMO) {
			porque = cortar(porque, PORQUE_MAXIMO);
			consertos.push(`${onde}: o porquê passava de ${PORQUE_MAXIMO} caracteres e foi cortado.`);
		}
		const evidencias = evidenciasDe(item.evidencias, onde);
		if (evidencias.length < MINIMO_EVIDENCIAS_ITEM) {
			consertos.push(`${onde}: sem nenhum evento da evidência; saiu.`);
			continue;
		}
		if (registrados.some((registrado) => mesmoAjuste(registrado.texto, texto))) {
			consertos.push(`${onde}: igual a um aprendizado já registrado; saiu.`);
			continue;
		}
		if (aprendizados.some((outro) => mesmoAjuste(outro.texto, texto))) {
			consertos.push(`${onde}: igual a um aprendizado anterior da resposta; saiu.`);
			continue;
		}
		if (aprendizados.length >= MAXIMO_APRENDIZADOS_POR_ANALISE) {
			consertos.push(`${onde}: passa de ${MAXIMO_APRENDIZADOS_POR_ANALISE} aprendizados por análise; saiu.`);
			continue;
		}
		aprendizados.push({ texto, porque, evidencias });
	}

	const revisoes: RevisaoDeAprendizado[] = [];
	for (const [indice, item] of ((valor.revisoes as unknown[] | undefined) ?? []).entries()) {
		const onde = `Revisão ${indice + 1}`;
		if (!ehObjeto(item)) {
			consertos.push(`${onde}: não é um objeto; saiu.`);
			continue;
		}
		const id = typeof item.aprendizado === "string" ? item.aprendizado.trim() : "";
		const registrado = registrados.find((outro) => outro.id === id);
		if (!registrado) {
			consertos.push(`${onde}: não há o aprendizado "${mostrar(item.aprendizado)}"; saiu.`);
			continue;
		}
		if (!(REVISOES as readonly unknown[]).includes(item.situacao)) {
			consertos.push(`${onde}: a situação "${mostrar(item.situacao)}" não é confirmado nem contradito; saiu.`);
			continue;
		}
		const situacao = item.situacao as "confirmado" | "contradito";
		if (situacao === registrado.situacao) {
			consertos.push(`${onde}: ${id} já está ${situacao}; saiu.`);
			continue;
		}
		if (revisoes.some((outra) => outra.aprendizado === id)) {
			consertos.push(`${onde}: mais de uma revisão para ${id}; ficou a primeira.`);
			continue;
		}
		let porque = typeof item.porque === "string" ? item.porque.trim() : "";
		if (!porque) {
			consertos.push(`${onde}: sem o porquê; saiu.`);
			continue;
		}
		if (porque.length > PORQUE_MAXIMO) {
			porque = cortar(porque, PORQUE_MAXIMO);
			consertos.push(`${onde}: o porquê passava de ${PORQUE_MAXIMO} caracteres e foi cortado.`);
		}
		revisoes.push({ aprendizado: id, texto: registrado.texto, situacao, porque, anterior: registrado.situacao });
	}

	return { analise: { resumo, funcionou, problemas, experimentos, propostas, paraDepois, aprendizados, revisoes }, consertos };
}

/** Os ids de evento citados na análise (itens, propostas, as de fora e aprendizados), sem repetir. */
export function idsCitadosNaAnalise(analise: Pick<AnaliseDoModelo, "funcionou" | "problemas" | "propostas" | "paraDepois" | "aprendizados">): Set<string> {
	return new Set([...analise.funcionou, ...analise.problemas, ...analise.propostas, ...analise.paraDepois, ...analise.aprendizados].flatMap((item) => item.evidencias));
}

// --- O relatório novo ------------------------------------------------------------------------------

/**
 * O relatório novo para gravar (ainda sem aplicar): pronto (com o que o modelo
 * devolveu, já conferido, e as evidências citadas, das `todas` montadas, na
 * ordem) ou pouco_retorno (sem modelo: resumo e listas vazias, mas com o placar
 * e a comparação).
 */
export function novoRelatorio(dados: {
	modulo: string;
	geradoEm: string;
	eventosLidos: number;
	retornos: number;
	placar: PlacarDoModulo;
	comparacao: Comparacao;
	doModelo?: { analise: AnaliseDoModelo; modelo: string; custo: number; prompt: PromptDoRelatorio; todas: readonly EvidenciaNaTela[] };
}): RelatorioMetodoV2 {
	const base = { versao: VERSAO_RELATORIO as typeof VERSAO_RELATORIO, modulo: dados.modulo, geradoEm: dados.geradoEm };
	const contagens = { eventosLidos: dados.eventosLidos, retornos: dados.retornos, placar: structuredClone(dados.placar), comparacao: structuredClone(dados.comparacao) };
	if (!dados.doModelo) {
		return {
			...base,
			situacao: "pouco_retorno",
			custo: 0,
			...contagens,
			resumo: "",
			funcionou: [],
			problemas: [],
			evidencias: [],
			experimentos: [],
			propostas: [],
			paraDepois: [],
			aprendizados: [],
			revisoes: [],
		};
	}
	const { analise, modelo, custo, prompt, todas } = dados.doModelo;
	const citados = idsCitadosNaAnalise(analise);
	return {
		...base,
		situacao: "pronto",
		modelo,
		custo,
		prompt: { nome: prompt.nome, hash: prompt.hash },
		...contagens,
		resumo: analise.resumo,
		funcionou: structuredClone(analise.funcionou),
		problemas: structuredClone(analise.problemas),
		evidencias: todas.filter((item) => citados.has(item.id)).map((item) => ({ ...item })),
		experimentos: structuredClone(analise.experimentos),
		propostas: structuredClone(analise.propostas),
		paraDepois: structuredClone(analise.paraDepois),
		aprendizados: structuredClone(analise.aprendizados),
		revisoes: structuredClone(analise.revisoes),
	};
}

// --- Ler o relatório gravado -----------------------------------------------------------------------------

const textoDe = (valor: unknown, onde: string): string => {
	if (typeof valor !== "string") throw new Error(`${onde} não é um texto`);
	return valor;
};

function moduloTestadoLido(valor: unknown, onde: string): ModuloTestado {
	if (!ehObjeto(valor) || typeof valor.materia !== "string" || typeof valor.curso !== "string" || typeof valor.modulo !== "string" || typeof valor.moduloNome !== "string" || typeof valor.atual !== "boolean") {
		throw new Error(`${onde} não tem materia, curso, modulo, moduloNome e atual`);
	}
	return { materia: valor.materia, curso: valor.curso, modulo: valor.modulo, moduloNome: valor.moduloNome, atual: valor.atual };
}

function arquivoLido(valor: unknown, onde: string): ArquivoMetodo {
	if (!ehArquivoMetodo(valor)) throw new Error(`o arquivo ${onde} não é um arquivo de metodologia ("${mostrar(valor)}")`);
	return valor;
}

/** O relatório da versão 2 lido de um relatorios/<módulo>.json (já com o JSON lido); fora do formato, Error com a frase. */
export function relatorioV2Lido(valor: unknown, modulo: string): RelatorioMetodoV2 {
	if (!ehObjeto(valor) || valor.versao !== VERSAO_RELATORIO) throw new Error(`não está no formato da versão ${VERSAO_RELATORIO}`);
	if (valor.modulo !== modulo) throw new Error(`o módulo "${mostrar(valor.modulo)}" não é o nome do arquivo`);
	if (!(SITUACOES_RELATORIO as readonly unknown[]).includes(valor.situacao)) throw new Error(`situação desconhecida ("${mostrar(valor.situacao)}")`);
	if (typeof valor.geradoEm !== "string" || typeof valor.custo !== "number" || typeof valor.eventosLidos !== "number" || typeof valor.retornos !== "number") throw new Error("faltam geradoEm, custo, eventosLidos ou retornos");
	if (valor.modelo !== undefined && typeof valor.modelo !== "string") throw new Error("o modelo não é um texto");
	if (valor.prompt !== undefined && !(ehObjeto(valor.prompt) && typeof valor.prompt.nome === "string" && typeof valor.prompt.hash === "string")) throw new Error("o prompt não tem nome e hash");
	if (typeof valor.resumo !== "string") throw new Error("o resumo não é um texto");
	for (const campo of ["funcionou", "problemas", "evidencias", "experimentos", "propostas", "paraDepois", "aprendizados", "revisoes"] as const) {
		if (!Array.isArray(valor[campo])) throw new Error(`falta a lista ${campo}`);
	}
	if (valor.aplicadoEm !== undefined && typeof valor.aplicadoEm !== "string") throw new Error("o aplicadoEm não é um texto");
	if (valor.erroAoAplicar !== undefined && typeof valor.erroAoAplicar !== "string") throw new Error("o erroAoAplicar não é um texto");
	const lista = (campo: string) => valor[campo] as unknown[];
	const experimentos = lista("experimentos").map((item, indice): ExperimentoDecidido => {
		const onde = `o experimento ${indice + 1}`;
		if (!ehObjeto(item) || typeof item.ajuste !== "string" || typeof item.porque !== "string" || typeof item.modulosTestados !== "number" || !Array.isArray(item.testadoEm)) {
			throw new Error(`${onde} não tem ajuste, porque, modulosTestados e testadoEm`);
		}
		if (!(DECISOES_DO_EXPERIMENTO as readonly unknown[]).includes(item.decisao)) throw new Error(`a decisão d${onde.slice(1)} não é válida ("${mostrar(item.decisao)}")`);
		return {
			ajuste: item.ajuste,
			arquivo: arquivoLido(item.arquivo, `d${onde.slice(1)}`),
			texto: textoDe(item.texto, `o texto d${onde.slice(1)}`),
			decisao: item.decisao as DecisaoDoExperimento,
			porque: item.porque,
			modulosTestados: item.modulosTestados,
			testadoEm: item.testadoEm.map((outro, posicao) => moduloTestadoLido(outro, `o módulo ${posicao + 1} testado d${onde.slice(1)}`)),
			...(typeof item.textoNovo === "string" ? { textoNovo: item.textoNovo } : {}),
			...(typeof item.novo === "string" ? { novo: item.novo } : {}),
			...(typeof item.conserto === "string" ? { conserto: item.conserto } : {}),
		};
	});
	const propostas = lista("propostas").map((item, indice): PropostaAplicada => {
		const onde = `proposta ${indice + 1}`;
		if (!ehObjeto(item) || typeof item.id !== "string" || typeof item.ajuste !== "string" || typeof item.porque !== "string" || !ehListaDeTextos(item.evidencias)) throw new Error(`a ${onde} não tem id, ajuste, porque e evidencias`);
		return { id: item.id, arquivo: arquivoLido(item.arquivo, `da ${onde}`), ajuste: item.ajuste, porque: item.porque, evidencias: [...item.evidencias], ...(typeof item.novo === "string" ? { novo: item.novo } : {}) };
	});
	const paraDepois = lista("paraDepois").map((item, indice): PropostaParaDepois => {
		const onde = `proposta ${indice + 1} para depois`;
		if (!ehObjeto(item) || typeof item.ajuste !== "string" || typeof item.porque !== "string" || !ehListaDeTextos(item.evidencias)) throw new Error(`a ${onde} não tem ajuste, porque e evidencias`);
		return { arquivo: arquivoLido(item.arquivo, `da ${onde}`), ajuste: item.ajuste, porque: item.porque, evidencias: [...item.evidencias] };
	});
	const aprendizados = lista("aprendizados").map((item, indice): AprendizadoRegistrado => {
		if (!ehObjeto(item) || typeof item.texto !== "string" || typeof item.porque !== "string" || !ehListaDeTextos(item.evidencias)) throw new Error(`o aprendizado ${indice + 1} não tem texto, porque e evidencias`);
		return { texto: item.texto, porque: item.porque, evidencias: [...item.evidencias], ...(typeof item.novo === "string" ? { novo: item.novo } : {}) };
	});
	const revisoes = lista("revisoes").map((item, indice): RevisaoDeAprendizado => {
		const onde = `a revisão ${indice + 1}`;
		if (!ehObjeto(item) || typeof item.aprendizado !== "string" || typeof item.texto !== "string" || typeof item.porque !== "string") throw new Error(`${onde} não tem aprendizado, texto e porque`);
		if (item.situacao !== "confirmado" && item.situacao !== "contradito") throw new Error(`a situação d${onde.slice(1)} não é confirmado nem contradito`);
		if (item.anterior !== "observado" && item.anterior !== "confirmado" && item.anterior !== "contradito") throw new Error(`a situação anterior d${onde.slice(1)} não é válida`);
		return { aprendizado: item.aprendizado, texto: item.texto, situacao: item.situacao, porque: item.porque, anterior: item.anterior };
	});
	let placar: PlacarDoModulo;
	let comparacao: Comparacao;
	try {
		placar = placarLido(valor.placar);
		comparacao = comparacaoLida(valor.comparacao);
	} catch (erro) {
		throw new Error(`${(erro as Error).message}`);
	}
	return relatorioV2NaOrdem({
		versao: VERSAO_RELATORIO,
		modulo,
		situacao: valor.situacao as SituacaoRelatorio,
		geradoEm: valor.geradoEm,
		...(typeof valor.modelo === "string" ? { modelo: valor.modelo } : {}),
		custo: valor.custo,
		...(ehObjeto(valor.prompt) ? { prompt: { nome: valor.prompt.nome as string, hash: valor.prompt.hash as string } } : {}),
		eventosLidos: valor.eventosLidos,
		retornos: valor.retornos,
		resumo: valor.resumo,
		funcionou: lista("funcionou").map((item, indice) => itemLido(item, `o item ${indice + 1} de funcionou`)),
		problemas: lista("problemas").map((item, indice) => itemLido(item, `o item ${indice + 1} de problemas`)),
		evidencias: evidenciasLidas(lista("evidencias")),
		placar,
		comparacao,
		experimentos,
		propostas,
		paraDepois,
		aprendizados,
		revisoes,
		...(typeof valor.aplicadoEm === "string" ? { aplicadoEm: valor.aplicadoEm } : {}),
		...(typeof valor.erroAoAplicar === "string" ? { erroAoAplicar: valor.erroAoAplicar } : {}),
	});
}

/** O relatório da versão 2 com os campos na ordem do formato (e copiado: o recebido não muda). */
export function relatorioV2NaOrdem(relatorio: RelatorioMetodoV2): RelatorioMetodoV2 {
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
		evidencias: relatorio.evidencias.map((item) => ({ id: item.id, linha: item.linha, licao: item.licao, bloco: item.bloco })),
		placar: structuredClone(relatorio.placar),
		comparacao: structuredClone(relatorio.comparacao),
		experimentos: relatorio.experimentos.map((item) => ({
			ajuste: item.ajuste,
			arquivo: item.arquivo,
			texto: item.texto,
			decisao: item.decisao,
			porque: item.porque,
			modulosTestados: item.modulosTestados,
			testadoEm: item.testadoEm.map((outro) => ({ ...outro })),
			...(item.textoNovo !== undefined ? { textoNovo: item.textoNovo } : {}),
			...(item.novo !== undefined ? { novo: item.novo } : {}),
			...(item.conserto !== undefined ? { conserto: item.conserto } : {}),
		})),
		propostas: relatorio.propostas.map((item) => ({ id: item.id, arquivo: item.arquivo, ajuste: item.ajuste, porque: item.porque, evidencias: [...item.evidencias], ...(item.novo !== undefined ? { novo: item.novo } : {}) })),
		paraDepois: relatorio.paraDepois.map((item) => ({ arquivo: item.arquivo, ajuste: item.ajuste, porque: item.porque, evidencias: [...item.evidencias] })),
		aprendizados: relatorio.aprendizados.map((item) => ({ texto: item.texto, porque: item.porque, evidencias: [...item.evidencias], ...(item.novo !== undefined ? { novo: item.novo } : {}) })),
		revisoes: relatorio.revisoes.map((item) => ({ aprendizado: item.aprendizado, texto: item.texto, situacao: item.situacao, porque: item.porque, anterior: item.anterior })),
		...(relatorio.aplicadoEm !== undefined ? { aplicadoEm: relatorio.aplicadoEm } : {}),
		...(relatorio.erroAoAplicar !== undefined ? { erroAoAplicar: relatorio.erroAoAplicar } : {}),
	};
}

/**
 * O relatório lido de um relatorios/<módulo>.json: a versão 2 (relatorioV2Lido)
 * ou a 1 (relatorioV1Lido), conforme `versao`; fora do formato, Error com a
 * frase (lib/metodo-ciclo.ts diz o arquivo).
 */
export function relatorioLido(valor: unknown, modulo: string): RelatorioMetodo {
	if (ehObjeto(valor) && valor.versao === VERSAO_RELATORIO) return relatorioV2Lido(valor, modulo);
	if (ehObjeto(valor) && valor.versao === 1) return relatorioV1Lido(valor, modulo);
	throw new Error(`não está no formato da versão ${VERSAO_RELATORIO} (nem da 1)`);
}

/** O relatório com os campos na ordem do formato, qualquer das duas versões. */
export const relatorioNaOrdem = (relatorio: RelatorioMetodo): RelatorioMetodo => (relatorio.versao === VERSAO_RELATORIO ? relatorioV2NaOrdem(relatorio) : relatorioV1NaOrdem(relatorio));
