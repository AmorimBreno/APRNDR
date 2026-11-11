// As hipóteses do perfil do aprendiz no disco (item 9, parte B; docs/aprendiz.md, seção 8): a camada 3 em
// aprendiz/hipoteses.json (gravado inteiro e legível, por gravação segura de lib/arquivos.ts) e os eventos
// dessas operações em aprendiz/eventos.jsonl (só de acréscimo). A lógica está nas funções puras de
// hipoteses-tipos.ts (que a tela também importa; este arquivo as reexporta); aqui cada operação lê o arquivo,
// aplica a função pura, grava e acrescenta os eventos.
//
// ATENÇÃO, a fila: nenhuma função daqui faz fila ou trava. Cada operação lê, muda e regrava o arquivo inteiro,
// então duas ao mesmo tempo se pisariam (a segunda perderia a mudança da primeira). Quem chama (a extensão
// aprendiz.ts, o WP2) serializa TODAS as chamadas que gravam (registrarReflexao, decidirHipotese,
// decidirMudanca, editarHipotese) numa fila única, como a extensão das regras de escrita faz.
//
// Os dados reais ficam na pasta de dados do Breno; nada aqui cria o hipoteses.json ao ler. Um arquivo que não
// dá para ler por inteiro (JSON inválido, versão desconhecida, hipótese com campo essencial faltando) nunca é
// sobrescrito: as operações que gravam recusam com ErroHipoteses e a frase diz o que está errado.
//
// Os eventos (todos no aprendiz/eventos.jsonl, com a sessão quando se sabe) levam objeto { hipotese, materia?,
// conceitos? } e resultado com o que mudou e as evidências. As evidências são ids de eventos de aprendizagem que
// já existiam: um evento de hipótese nunca é citado como evidência. Os eventos de uma operação ganham ids
// crescentes (1 ms de diferença entre um e outro), para a ordem de gravação ser também a ordem dos ids.

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { materiasExistentes, nomesDosConceitos } from "./aprendiz.ts";
import { gravarDeUmaVez } from "./arquivos.ts";
import { acrescentarEvento, type Evento, lerEventos, novoIdEvento, type VerboEvento } from "./eventos.ts";
import {
	type ArquivoHipoteses,
	arquivoVazio,
	type ContextoValidacao,
	conceitosDoEscopo,
	decidir,
	editar,
	ErroHipoteses,
	expirarVencidas,
	type Hipotese,
	indexarEventos,
	lerArquivoHipoteses,
	materiaDoEscopo,
	type MudancaPendente,
	type PropostaValida,
	type ResultadoDecisao,
	type ResultadoEdicao,
	type ResumoDaReflexao,
	aplicarReflexao,
	VERSAO_HIPOTESES,
} from "./hipoteses-tipos.ts";
import { eventosAprendiz, pastaAprendiz } from "./materias.ts";

export * from "./hipoteses-tipos.ts";

export const arquivoHipoteses = (dados: string) => join(pastaAprendiz(dados), "hipoteses.json");

/** A sessão (para os eventos) e o momento (sem ele, agora). */
export interface ContextoHipoteses {
	sessao?: string;
	agora?: Date;
}

// --- Ler e gravar o hipoteses.json ---------------------------------------------------------------------

/**
 * O arquivo e os avisos do que não deu para ler. Sem arquivo (ausente), o arquivo vazio e nenhum aviso; JSON
 * inválido, versão desconhecida ou campos faltando viram avisos (ver lerArquivoHipoteses). NÃO cria o arquivo.
 */
export async function lerHipotesesComAvisos(dados: string): Promise<{ arquivo: ArquivoHipoteses; avisos: string[] }> {
	let conteudo: string;
	try {
		conteudo = await readFile(arquivoHipoteses(dados), "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return { arquivo: arquivoVazio(), avisos: [] };
		throw erro;
	}
	let json: unknown;
	try {
		json = JSON.parse(conteudo);
	} catch (erro) {
		return { arquivo: arquivoVazio(), avisos: [`o JSON está inválido (${(erro as Error).message})`] };
	}
	return lerArquivoHipoteses(json);
}

/** O aprendiz/hipoteses.json. Ausente = arquivo vazio (e nada é criado). Para gravar, use as operações abaixo. */
export async function lerHipoteses(dados: string): Promise<ArquivoHipoteses> {
	return (await lerHipotesesComAvisos(dados)).arquivo;
}

/** Lê para mudar e regravar: se o arquivo não foi lido por inteiro, recusa (não sobrescreve o que não leu). */
async function lerParaGravar(dados: string): Promise<ArquivoHipoteses> {
	const { arquivo, avisos } = await lerHipotesesComAvisos(dados);
	if (avisos.length > 0) {
		throw new ErroHipoteses(`Não consegui ler as hipóteses ${arquivoHipoteses(dados)}: ${avisos.join("; ")}. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
	return arquivo;
}

/**
 * Grava o hipoteses.json inteiro de uma vez (escreve ao lado e renomeia), em JSON com tabulação, criando a pasta
 * aprendiz/ se faltar. Recusa (ErroHipoteses) um arquivo que a leitura tolerante não aceita por inteiro: o
 * arquivo gravado sempre pode ser lido de volta sem aviso.
 */
export async function gravarHipoteses(dados: string, arquivo: ArquivoHipoteses): Promise<void> {
	const { arquivo: limpo, avisos } = lerArquivoHipoteses(JSON.parse(JSON.stringify(arquivo)));
	if (avisos.length > 0) throw new ErroHipoteses(`As hipóteses não estão no formato (${avisos.join("; ")}); nada foi gravado.`);
	const completo: ArquivoHipoteses = { versao: VERSAO_HIPOTESES, hipoteses: limpo.hipoteses, mudancas: limpo.mudancas, ...(limpo.ultimaReflexao ? { ultimaReflexao: limpo.ultimaReflexao } : {}) };
	await mkdir(pastaAprendiz(dados), { recursive: true });
	await gravarDeUmaVez(arquivoHipoteses(dados), `${JSON.stringify(completo, null, "\t")}\n`);
}

/** Os eventos do aprendiz por id (para a confiança e o conflito). */
async function eventosPorIdDoAprendiz(dados: string) {
	return indexarEventos((await lerEventos(eventosAprendiz(dados))).eventos);
}

/** As matérias que existem e, de cada uma, os ids dos conceitos do mapa (a matéria sem mapa legível fica sem conceitos). */
export async function materiasEConceitos(dados: string): Promise<Map<string, Set<string>>> {
	const materias = await materiasExistentes(dados);
	const nomes = await nomesDosConceitos(dados, materias);
	return new Map(materias.map((materia) => [materia, new Set(nomes.get(materia)?.keys() ?? [])]));
}

/**
 * O contexto da validação (validarProposta, validarPropostas) montado do disco: os eventos por id, a janela que a
 * reflexão leu, as hipóteses e as mudanças pendentes de agora e as matérias e conceitos que existem.
 */
export async function contextoDeValidacao(dados: string, janela: Iterable<string>): Promise<ContextoValidacao> {
	const [eventosPorId, { arquivo }, materias] = await Promise.all([eventosPorIdDoAprendiz(dados), lerHipotesesComAvisos(dados), materiasEConceitos(dados)]);
	return { eventosPorId, janela: new Set(janela), hipoteses: arquivo.hipoteses, mudancas: arquivo.mudancas, materias };
}

// --- Os eventos ----------------------------------------------------------------------------------------

/** Faz os eventos de uma operação, com ids crescentes (1 ms de diferença) e o mesmo ts. */
function fabricaDeEventos(agora: Date, sessao: string | undefined) {
	let passo = 0;
	return (verbo: VerboEvento, objeto: Evento["objeto"], resultado: Record<string, unknown>): Evento => ({
		id: novoIdEvento(agora.getTime() + passo++),
		ts: agora.toISOString(),
		...(sessao ? { sessao } : {}),
		verbo,
		objeto,
		resultado,
	});
}

/** { hipotese, materia?, conceitos? } e, quando há, a mudança. */
function objetoDaHipotese(hipotese: Pick<Hipotese, "id" | "escopo">, mudanca?: string): Evento["objeto"] {
	const materia = materiaDoEscopo(hipotese.escopo);
	const conceitos = conceitosDoEscopo(hipotese.escopo);
	return { hipotese: hipotese.id, ...(mudanca ? { mudanca } : {}), ...(materia ? { materia } : {}), ...(conceitos.length > 0 ? { conceitos } : {}) };
}

const evidenciasDe = (hipotese: Pick<Hipotese, "aFavor" | "contra">) => ({ aFavor: [...hipotese.aFavor], contra: [...hipotese.contra] });

/** As mudanças que saíram porque a hipótese foi rejeitada: um rejeitou_mudanca_hipotese para cada. */
function eventosDasMudancasRemovidas(criar: ReturnType<typeof fabricaDeEventos>, removidas: readonly MudancaPendente[], hipotese: Hipotese): Evento[] {
	return removidas.map((mudanca) =>
		criar("rejeitou_mudanca_hipotese", objetoDaHipotese(hipotese, mudanca.id), {
			acao: mudanca.acao,
			evidencias: [...mudanca.evidencias],
			motivo: "hipotese_rejeitada",
			automatica: true,
		}),
	);
}

async function acrescentarTodos(dados: string, eventos: readonly Evento[]): Promise<void> {
	for (const evento of eventos) await acrescentarEvento(eventosAprendiz(dados), evento);
}

// --- Registrar uma reflexão ----------------------------------------------------------------------------

export interface EntradaReflexao extends ContextoHipoteses {
	/** O que a reflexão fez (o id r-..., o motivo, quantos eventos leu...); fica em ultimaReflexao e no evento refletiu. */
	resumo: ResumoDaReflexao;
	/** As propostas que passaram na validação (validarPropostas). */
	propostasValidas: readonly PropostaValida[];
}

export interface ReflexaoRegistrada {
	arquivo: ArquivoHipoteses;
	/** As hipóteses novas (status "proposta"). */
	criadas: Hipotese[];
	/** As mudanças que ficaram esperando a decisão. */
	mudancas: MudancaPendente[];
	/** As hipóteses que a validade vencida fez expirar nesta rodada. */
	expiradas: Hipotese[];
	/** Os eventos gravados, na ordem. */
	eventos: Evento[];
}

/**
 * Grava o resultado de uma reflexão: expira as hipóteses de validade vencida, aplica as propostas (criar vira
 * hipótese "proposta"; reforçar, enfraquecer e expirar viram mudanças pendentes; nada vira aprovada), guarda o
 * resumo em ultimaReflexao e acrescenta os eventos, nesta ordem: refletiu (o resumo), propos_hipotese (uma por
 * hipótese criada), propos_mudanca_hipotese (uma por mudança) e expirou_hipotese (uma por vencida). O objeto do
 * evento é { hipotese, materia?, conceitos? } (a mudança leva também `mudanca`); o resultado de propos_hipotese traz
 * o enunciado, o tipo, o escopo, a confiança e as evidências; o das mudanças, a ação, as evidências e o motivo.
 * Antes de gravar confere de novo o que importa: a matéria e os conceitos de um escopo existem, as evidências
 * existem no eventos.jsonl e uma criação tem pelo menos uma; senão ErroHipoteses e nada é gravado.
 */
export async function registrarReflexao(dados: string, entrada: EntradaReflexao): Promise<ReflexaoRegistrada> {
	const agora = entrada.agora ?? new Date();
	const [atual, eventosPorId, materias] = await Promise.all([lerParaGravar(dados), eventosPorIdDoAprendiz(dados), materiasEConceitos(dados)]);

	for (const proposta of entrada.propostasValidas) {
		for (const id of proposta.evidencias) {
			if (!eventosPorId.has(id)) throw new ErroHipoteses(`A proposta cita o evento "${id}", que não existe; nada foi gravado.`);
		}
		if (proposta.acao !== "criar") continue;
		if (proposta.evidencias.length === 0) throw new ErroHipoteses("Uma hipótese nova precisa citar eventos; nada foi gravado.");
		const materia = materiaDoEscopo(proposta.escopo);
		if (materia === undefined) continue;
		const conceitos = materias.get(materia);
		if (!conceitos) throw new ErroHipoteses(`A matéria "${materia}" da hipótese não existe; nada foi gravado.`);
		const inexistente = conceitosDoEscopo(proposta.escopo).find((conceito) => !conceitos.has(conceito));
		if (inexistente !== undefined) throw new ErroHipoteses(`O conceito "${inexistente}" da hipótese não existe no mapa de "${materia}"; nada foi gravado.`);
	}

	const venceram = expirarVencidas(atual, agora);
	const aplicada = aplicarReflexao(venceram.arquivo, entrada.propostasValidas, {
		reflexao: entrada.resumo.id,
		agora,
		novoId: () => novoIdEvento(agora.getTime()),
		eventosPorId,
	});
	const arquivo: ArquivoHipoteses = { ...aplicada.arquivo, ultimaReflexao: structuredClone(entrada.resumo) };
	await gravarHipoteses(dados, arquivo);

	const criar = fabricaDeEventos(agora, entrada.sessao);
	const eventos: Evento[] = [criar("refletiu", { reflexao: entrada.resumo.id }, { ...structuredClone(entrada.resumo) })];
	for (const hipotese of aplicada.criadas) {
		eventos.push(
			criar("propos_hipotese", objetoDaHipotese(hipotese), {
				reflexao: entrada.resumo.id,
				tipo: hipotese.tipo,
				escopo: structuredClone(hipotese.escopo),
				enunciado: hipotese.enunciado,
				confianca: hipotese.confianca,
				evidencias: [...hipotese.aFavor],
			}),
		);
	}
	for (const mudanca of aplicada.mudancas) {
		const hipotese = arquivo.hipoteses.find((item) => item.id === mudanca.hipotese)!;
		eventos.push(criar("propos_mudanca_hipotese", objetoDaHipotese(hipotese, mudanca.id), { reflexao: entrada.resumo.id, acao: mudanca.acao, evidencias: [...mudanca.evidencias], motivo: mudanca.motivo }));
	}
	for (const { anterior, hipotese } of venceram.expiradas) {
		eventos.push(criar("expirou_hipotese", objetoDaHipotese(hipotese), { motivo: "validade_vencida", validade: anterior.validade, de: anterior.status, versao: hipotese.versao, evidencias: evidenciasDe(hipotese) }));
	}
	await acrescentarTodos(dados, eventos);
	return { arquivo, criadas: aplicada.criadas, mudancas: aplicada.mudancas, expiradas: venceram.expiradas.map(({ hipotese }) => hipotese), eventos };
}

// --- Decidir e editar ----------------------------------------------------------------------------------

/** O que uma decisão ou edição devolve: o resultado puro e os eventos gravados. */
export type DecisaoRegistrada = ResultadoDecisao & { eventos: Evento[] };
export type EdicaoRegistrada = ResultadoEdicao & { eventos: Evento[] };

/**
 * A decisão do Breno sobre uma hipótese proposta (decidir, alvo "hipotese"). Grava o arquivo e o evento
 * aprovou_hipotese (resultado: enunciado, versão, confiança, evidências a favor e contra e, se ele editou o texto,
 * `editado: { antes, depois }`) ou rejeitou_hipotese; ao rejeitar, cada mudança pendente da hipótese sai com um
 * rejeitou_mudanca_hipotese automático. ErroHipoteses se o id não existe ou o enunciado editado não vale.
 */
export async function decidirHipotese(dados: string, entrada: { id: string; decisao: "aprovar" | "rejeitar"; enunciado?: string }, contexto: ContextoHipoteses = {}): Promise<DecisaoRegistrada> {
	const agora = contexto.agora ?? new Date();
	const [atual, eventosPorId] = await Promise.all([lerParaGravar(dados), eventosPorIdDoAprendiz(dados)]);
	const resultado = decidir(atual, { alvo: "hipotese", ...entrada }, { agora, eventosPorId });
	await gravarHipoteses(dados, resultado.arquivo);

	const criar = fabricaDeEventos(agora, contexto.sessao);
	const hipotese = resultado.hipotese!;
	const anterior = resultado.anterior!;
	const eventos: Evento[] = [];
	if (resultado.decisao === "aprovar") {
		eventos.push(
			criar("aprovou_hipotese", objetoDaHipotese(hipotese), {
				enunciado: hipotese.enunciado,
				versao: hipotese.versao,
				confianca: hipotese.confianca,
				evidencias: evidenciasDe(hipotese),
				...(hipotese.enunciado !== anterior.enunciado ? { editado: { antes: anterior.enunciado, depois: hipotese.enunciado } } : {}),
			}),
		);
	} else {
		eventos.push(criar("rejeitou_hipotese", objetoDaHipotese(hipotese), { enunciado: hipotese.enunciado, versao: hipotese.versao, evidencias: evidenciasDe(hipotese) }));
		eventos.push(...eventosDasMudancasRemovidas(criar, resultado.mudancasRemovidas, hipotese));
	}
	await acrescentarTodos(dados, eventos);
	return { ...resultado, eventos };
}

/**
 * A decisão do Breno sobre uma mudança pendente (decidir, alvo "mudanca"). Aprovar aplica a mudança e grava o evento
 * aprovou_mudanca_hipotese (resultado: ação, evidências acrescentadas, motivo, versão, status de antes e de depois,
 * confiança e, se a regra do conflito devolveu a hipótese a "proposta", `conflito: true` com os números recentes);
 * quando a mudança expira a hipótese, também um expirou_hipotese. Rejeitar só tira a mudança
 * (rejeitou_mudanca_hipotese). ErroHipoteses se o id não existe ou a hipótese já não aceita a mudança.
 */
export async function decidirMudanca(dados: string, entrada: { id: string; decisao: "aprovar" | "rejeitar" }, contexto: ContextoHipoteses = {}): Promise<DecisaoRegistrada> {
	const agora = contexto.agora ?? new Date();
	const [atual, eventosPorId] = await Promise.all([lerParaGravar(dados), eventosPorIdDoAprendiz(dados)]);
	const resultado = decidir(atual, { alvo: "mudanca", ...entrada }, { agora, eventosPorId });
	await gravarHipoteses(dados, resultado.arquivo);

	const criar = fabricaDeEventos(agora, contexto.sessao);
	const mudanca = resultado.mudanca!;
	const hipotese = resultado.hipotese;
	// A hipótese pode já não existir só ao rejeitar; o objeto leva então apenas os ids.
	const objeto: Evento["objeto"] = hipotese ? objetoDaHipotese(hipotese, mudanca.id) : { hipotese: mudanca.hipotese, mudanca: mudanca.id };
	const eventos: Evento[] = [];
	if (resultado.decisao === "rejeitar") {
		eventos.push(criar("rejeitou_mudanca_hipotese", objeto, { acao: mudanca.acao, evidencias: [...mudanca.evidencias], motivo: mudanca.motivo }));
	} else {
		const anterior = resultado.anterior!;
		const depois = hipotese!;
		eventos.push(
			criar("aprovou_mudanca_hipotese", objeto, {
				acao: mudanca.acao,
				evidencias: [...resultado.evidenciasAcrescentadas],
				motivo: mudanca.motivo,
				versao: depois.versao,
				de: anterior.status,
				para: depois.status,
				confianca: depois.confianca,
				...(resultado.conflito ? { conflito: true, ...resultado.conflitoDetalhe } : {}),
			}),
		);
		if (mudanca.acao === "expirar" && depois.status === "expirada" && anterior.status !== "expirada") {
			eventos.push(criar("expirou_hipotese", objeto, { motivo: mudanca.motivo, mudanca: mudanca.id, de: anterior.status, versao: depois.versao, evidencias: evidenciasDe(depois) }));
		}
	}
	await acrescentarTodos(dados, eventos);
	return { ...resultado, eventos };
}

/**
 * O Breno edita o enunciado e/ou o status de uma hipótese (editar). Grava o arquivo e o evento editou_hipotese
 * (resultado: `mudou`, `antes` e `depois` com os campos que mudaram, versão e evidências); ao rejeitar, as
 * mudanças pendentes saem com um rejeitou_mudanca_hipotese automático cada. Se nada mudou, não grava nada e
 * `eventos` vem vazio. ErroHipoteses se o id não existe, o enunciado não vale ou o status não é aprovada/rejeitada.
 */
export async function editarHipotese(dados: string, entrada: { id: string; enunciado?: string; status?: "aprovada" | "rejeitada" }, contexto: ContextoHipoteses = {}): Promise<EdicaoRegistrada> {
	const agora = contexto.agora ?? new Date();
	const atual = await lerParaGravar(dados);
	const resultado = editar(atual, entrada, { agora });
	if (resultado.mudou.length === 0) return { ...resultado, eventos: [] };
	await gravarHipoteses(dados, resultado.arquivo);

	const criar = fabricaDeEventos(agora, contexto.sessao);
	const { anterior, hipotese } = resultado;
	const antes: Record<string, unknown> = {};
	const depois: Record<string, unknown> = {};
	for (const campo of resultado.mudou) {
		antes[campo] = anterior[campo];
		depois[campo] = hipotese[campo];
	}
	const eventos: Evento[] = [criar("editou_hipotese", objetoDaHipotese(hipotese), { mudou: [...resultado.mudou], antes, depois, versao: hipotese.versao, evidencias: evidenciasDe(hipotese) })];
	eventos.push(...eventosDasMudancasRemovidas(criar, resultado.mudancasRemovidas, hipotese));
	await acrescentarTodos(dados, eventos);
	return { ...resultado, eventos };
}
