// O ciclo do método no disco (parte 4 do plano de 2026-10-28,
// docs/metodo-ciclo.md):
// - o relatório de um módulo concluído em
//   materias/<matéria>/cursos/<curso>/relatorios/<módulo>.json, gravado
//   inteiro de uma vez (lib/arquivos.ts), com o evento gerou_relatorio_metodo
//   no eventos.jsonl da matéria;
// - a evidência: os eventos do módulo lidos do aprendiz/eventos.jsonl;
// - os ajustes aprovados em aprendiz/metodo/<arquivo>.md (um por arquivo de
//   metodologia), gravados inteiros pelo código; um arquivo que não se lê é
//   ErroMetodo e nunca é sobrescrito;
// - as decisões do Breno (aprovou_ajuste_metodo, rejeitou_ajuste_metodo) e o
//   ligar e desligar de um ajuste (alterou_ajuste_metodo), no
//   aprendiz/eventos.jsonl.
// As regras são puras e ficam em metodo-ciclo-tipos.ts. Sem dependências: o
// pi carrega a extensão desta pasta. Quem chama segura as travas (a da
// matéria para o relatório; a dos ajustes para os arquivos de ajustes).

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gravarDeUmaVez } from "./arquivos.ts";
import { type ContextoCurso, ehIdModulo, pastaDoCurso } from "./cursos.ts";
import { acrescentarEvento, criarEvento, type Evento, lerEventos } from "./eventos.ts";
import { eventosAprendiz, eventosMateria, pastaAprendiz } from "./materias.ts";
import {
	acrescentarAjuste,
	ajusteAtivoIgual,
	ajustesAtivos,
	type AjusteMetodo,
	type AjustesDoArquivo,
	ajustesNaTela,
	ajustesVazios,
	aplicarDecisao,
	type ArquivoDeAjustesNaTela,
	comentarioDaOrigem,
	dataLocal,
	type DecisaoProposta,
	ehArquivoMetodo,
	ErroMetodo,
	escreverAjustesMarkdown,
	type EvidenciaMontada,
	lerAjustesMarkdown,
	ligarAjuste,
	montarEvidencia,
	propostaPendente,
	type RelatorioMetodo,
	relatorioLido,
	relatorioNaOrdem,
	validarDecisao,
} from "./metodo-ciclo-tipos.ts";
import { ARQUIVOS_METODO, type ArquivoMetodo, type ModuloGerado } from "./modulo-tipos.ts";

export * from "./metodo-ciclo-tipos.ts";

/** A sessão e o momento (sem ele, agora). */
export type ContextoMetodo = Pick<ContextoCurso, "sessao" | "agora">;

const daSessao = (contexto: ContextoMetodo) => (contexto.sessao ? { sessao: contexto.sessao } : {});

// --- O relatório ------------------------------------------------------------------------------

export const pastaRelatorios = (dados: string, materia: string, curso: string) => join(pastaDoCurso(dados, materia, curso), "relatorios");

/** O caminho do relatorios/<módulo>.json. Um id que não é m<número>, ErroMetodo (o id vira nome de arquivo). */
export function caminhoDoRelatorio(dados: string, materia: string, curso: string, modulo: string): string {
	if (!ehIdModulo(modulo)) throw new ErroMetodo(`O id do módulo não é válido ("${String(modulo)}").`);
	return join(pastaRelatorios(dados, materia, curso), `${modulo}.json`);
}

/**
 * O relatório do módulo. Sem arquivo, null (ainda não foi gerado, ou falhou).
 * Um arquivo que não dá para ler (JSON inválido, outro formato) é ErroMetodo:
 * quem chama não tem relatório para gravar, então o arquivo nunca é
 * sobrescrito sem ter sido lido.
 */
export async function lerRelatorio(dados: string, materia: string, curso: string, modulo: string): Promise<RelatorioMetodo | null> {
	const arquivo = caminhoDoRelatorio(dados, materia, curso, modulo);
	let conteudo: string;
	try {
		conteudo = await readFile(arquivo, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw erro;
	}
	try {
		let valor: unknown;
		try {
			valor = JSON.parse(conteudo);
		} catch (erro) {
			throw new Error(`o JSON está inválido (${(erro as Error).message})`);
		}
		return relatorioLido(valor, modulo);
	} catch (erro) {
		throw new ErroMetodo(`Não consegui ler o relatório do método ${arquivo}: ${(erro as Error).message}. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
}

/** Grava o relatorios/<módulo>.json inteiro de uma vez, em JSON com tabulação, sem conferir nada (quem chama já leu o que estava lá). */
export async function gravarRelatorio(dados: string, materia: string, curso: string, relatorio: RelatorioMetodo): Promise<void> {
	const arquivo = caminhoDoRelatorio(dados, materia, curso, relatorio.modulo);
	await mkdir(dirname(arquivo), { recursive: true });
	await gravarDeUmaVez(arquivo, `${JSON.stringify(relatorioNaOrdem(relatorio), null, "\t")}\n`);
}

/**
 * Grava o relatório novo (pronto ou pouco_retorno), no lugar do anterior, e
 * o evento gerou_relatorio_metodo no eventos.jsonl da matéria: objeto
 * {materia, curso, modulo}; resultado {situacao, propostas (quantas),
 * custo}; contexto {modelo, prompt}, quando o modelo foi chamado. Um
 * relatório anterior ilegível é ErroMetodo e não é sobrescrito. As decisões
 * do anterior ficam nos eventos.
 */
export async function registrarRelatorio(dados: string, materia: string, curso: string, relatorio: RelatorioMetodo, contexto: ContextoMetodo = {}): Promise<Evento> {
	await lerRelatorio(dados, materia, curso, relatorio.modulo);
	const evento = criarEvento(
		{
			...daSessao(contexto),
			verbo: "gerou_relatorio_metodo",
			objeto: { materia, curso, modulo: relatorio.modulo },
			resultado: { situacao: relatorio.situacao, propostas: relatorio.propostas.length, custo: relatorio.custo },
			...(relatorio.modelo ? { contexto: { modelo: relatorio.modelo, ...(relatorio.prompt ? { prompt: { nome: relatorio.prompt.nome, hash: relatorio.prompt.hash } } : {}) } } : {}),
		},
		contexto.agora ?? new Date(),
	);
	await gravarRelatorio(dados, materia, curso, relatorio);
	await acrescentarEvento(eventosMateria(dados, materia), evento);
	return evento;
}

// --- A evidência --------------------------------------------------------------------------------

/** Os eventos do aprendiz/eventos.jsonl (as linhas que não são eventos são puladas). */
export async function eventosDoAprendiz(dados: string): Promise<Evento[]> {
	return (await lerEventos(eventosAprendiz(dados))).eventos;
}

/** A evidência do relatório do módulo (montarEvidencia), com os eventos lidos do aprendiz/eventos.jsonl. */
export async function evidenciaDoModulo(dados: string, modulo: ModuloGerado, limites: { linhas?: number; bloco?: number } = {}): Promise<EvidenciaMontada> {
	return montarEvidencia(await eventosDoAprendiz(dados), modulo, limites);
}

// --- Os ajustes -----------------------------------------------------------------------------------

export const pastaAjustes = (dados: string) => join(pastaAprendiz(dados), "metodo");

/** O aprendiz/metodo/<arquivo>.md. Um arquivo que não é de metodologia, ErroMetodo. */
export function caminhoDosAjustes(dados: string, arquivo: string): string {
	if (!ehArquivoMetodo(arquivo)) throw new ErroMetodo(`"${arquivo}" não é um arquivo de metodologia (${ARQUIVOS_METODO.join(", ")}).`);
	return join(pastaAjustes(dados), arquivo);
}

/**
 * Os ajustes de um arquivo de metodologia. Sem arquivo, nenhum ajuste. Um
 * arquivo que não dá para ler (lerAjustesMarkdown) é ErroMetodo com a frase:
 * quem chama não tem ajustes para gravar, então o arquivo nunca é
 * sobrescrito sem ter sido lido; e uma geração que precisa dele não sai.
 */
export async function lerAjustes(dados: string, arquivo: string): Promise<AjustesDoArquivo> {
	const caminho = caminhoDosAjustes(dados, arquivo);
	let conteudo: string;
	try {
		conteudo = await readFile(caminho, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return ajustesVazios(arquivo as ArquivoMetodo);
		throw erro;
	}
	try {
		return lerAjustesMarkdown(conteudo, arquivo as ArquivoMetodo);
	} catch (erro) {
		throw new ErroMetodo(`Não consegui ler os ajustes do método ${caminho}: ${(erro as Error).message}. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
}

/** Grava o arquivo de ajustes inteiro de uma vez (escreverAjustesMarkdown). */
export async function gravarAjustes(dados: string, conteudo: AjustesDoArquivo): Promise<void> {
	await mkdir(pastaAjustes(dados), { recursive: true });
	await gravarDeUmaVez(caminhoDosAjustes(dados, conteudo.arquivo), escreverAjustesMarkdown(conteudo));
}

/** Os ajustes ligados de um arquivo de metodologia, na ordem (os que toda geração carrega depois da base). */
export async function ajustesAtivosDe(dados: string, arquivo: string): Promise<AjusteMetodo[]> {
	return ajustesAtivos(await lerAjustes(dados, arquivo));
}

/**
 * Os ajustes de todos os arquivos de metodologia, na ordem de
 * ARQUIVOS_METODO, para a mensagem ajustes: só os arquivos com algum ajuste
 * ou que não se leem (com `erro`, a frase).
 */
export async function listarAjustes(dados: string): Promise<ArquivoDeAjustesNaTela[]> {
	const saida: ArquivoDeAjustesNaTela[] = [];
	for (const arquivo of ARQUIVOS_METODO) {
		try {
			const conteudo = await lerAjustes(dados, arquivo);
			if (conteudo.ajustes.length > 0) saida.push({ arquivo, ajustes: ajustesNaTela(conteudo) });
		} catch (erro) {
			saida.push({ arquivo, ajustes: [], erro: (erro as Error).message });
		}
	}
	return saida;
}

/**
 * Liga ou desliga um ajuste (ligar_ajuste; nada é apagado): grava o arquivo
 * de ajustes e o evento alterou_ajuste_metodo no aprendiz/eventos.jsonl,
 * objeto {arquivo, ajuste}, resultado {ativo, texto}. Sem mudança, nada é
 * gravado e não há evento. Um arquivo ilegível ou um ajuste que não existe é
 * ErroMetodo.
 */
export async function ligarAjusteNoDisco(dados: string, arquivo: unknown, ajuste: unknown, ativo: unknown, contexto: ContextoMetodo = {}): Promise<{ conteudo: AjustesDoArquivo; evento?: Evento }> {
	if (typeof arquivo !== "string" || !arquivo) throw new ErroMetodo("Falta o arquivo de metodologia do ajuste.");
	if (typeof ajuste !== "string" || !ajuste) throw new ErroMetodo("Falta o id do ajuste.");
	if (typeof ativo !== "boolean") throw new ErroMetodo("O ativo do ajuste não é true nem false.");
	const atual = await lerAjustes(dados, arquivo);
	const ligado = ligarAjuste(atual, ajuste, ativo);
	if (!ligado.mudou) return { conteudo: ligado.conteudo };
	const evento = criarEvento(
		{ ...daSessao(contexto), verbo: "alterou_ajuste_metodo", objeto: { arquivo: atual.arquivo, ajuste }, resultado: { ativo, texto: ligado.ajuste.texto } },
		contexto.agora ?? new Date(),
	);
	await gravarAjustes(dados, ligado.conteudo);
	await acrescentarEvento(eventosAprendiz(dados), evento);
	return { conteudo: ligado.conteudo, evento };
}

// --- As decisões ------------------------------------------------------------------------------------

/** O que decidirProposta fez. */
export interface PropostaDecidida {
	/** O relatório novo, com a decisão (gravado). */
	relatorio: RelatorioMetodo;
	/** O evento aprovou_ajuste_metodo ou rejeitou_ajuste_metodo. */
	evento: Evento;
	/** Na aprovação: o ajuste (o novo, ou o ativo igual que já existia). */
	ajuste?: AjusteMetodo;
}

/**
 * A decisão do Breno numa proposta (decidir_proposta; validarDecisao). Lê o
 * relatório (pronto, com a proposta sem decisão; senão, ErroMetodo).
 * - Aprovar: o texto final é o editado (quando vier) ou o da proposta; o
 *   ajuste entra ligado no fim do aprendiz/metodo/<arquivo>.md, com o
 *   comentário de origem (comentarioDaOrigem); se já há um ajuste ligado
 *   igual (mesmoAjuste), a decisão aponta para ele e nada é acrescentado.
 *   Evento aprovou_ajuste_metodo: objeto {arquivo, ajuste, materia, curso,
 *   modulo, proposta}, resultado {texto, editado, evidencias}.
 * - Rejeitar: evento rejeitou_ajuste_metodo: objeto {arquivo, materia, curso,
 *   modulo, proposta}, resultado {texto (o da proposta), evidencias, motivo}
 *   (o motivo vazio quando não veio): o relatório pode ser gerado de novo e
 *   substituído, e o texto rejeitado fica nos eventos.
 * A decisão vai para o relatório. Grava o arquivo de ajustes (na aprovação),
 * o relatório e, por último, o evento. Um relatório ou um arquivo de ajustes
 * ilegível é ErroMetodo e não é sobrescrito.
 */
export async function decidirProposta(dados: string, materia: string, curso: string, modulo: string, entrada: unknown, contexto: ContextoMetodo = {}): Promise<PropostaDecidida> {
	const pedida = validarDecisao(entrada);
	const relatorio = await lerRelatorio(dados, materia, curso, modulo);
	if (!relatorio) throw new ErroMetodo(`O módulo ${modulo} ainda não tem relatório do método.`);
	const proposta = propostaPendente(relatorio, pedida.proposta);
	const agora = contexto.agora ?? new Date();
	const em = agora.toISOString();
	const comum = { arquivo: proposta.arquivo, materia, curso, modulo, proposta: proposta.id };
	if (pedida.decisao === "rejeitar") {
		const evento = criarEvento(
			{
				...daSessao(contexto),
				verbo: "rejeitou_ajuste_metodo",
				objeto: comum,
				resultado: { texto: proposta.ajuste, evidencias: [...proposta.evidencias], motivo: pedida.motivo ?? "" },
			},
			agora,
		);
		const decisao: DecisaoProposta = { tipo: "rejeitada", ...(pedida.motivo ? { motivo: pedida.motivo } : {}), em, evento: evento.id };
		const novo = aplicarDecisao(relatorio, proposta.id, decisao);
		await gravarRelatorio(dados, materia, curso, novo);
		await acrescentarEvento(eventosAprendiz(dados), evento);
		return { relatorio: novo, evento };
	}
	const texto = pedida.texto ?? proposta.ajuste;
	const atuais = await lerAjustes(dados, proposta.arquivo);
	const igual = ajusteAtivoIgual(atuais, texto);
	const acrescentado = igual
		? undefined
		: acrescentarAjuste(atuais, {
				texto,
				comentario: comentarioDaOrigem({ materia, curso, modulo, proposta: proposta.id, evidencias: proposta.evidencias, aprovadoEm: dataLocal(agora) }),
				agora,
			});
	const ajuste = igual ?? acrescentado!.ajuste;
	const evento = criarEvento(
		{
			...daSessao(contexto),
			verbo: "aprovou_ajuste_metodo",
			objeto: { ...comum, ajuste: ajuste.id },
			resultado: { texto: ajuste.texto, editado: texto !== proposta.ajuste, evidencias: [...proposta.evidencias] },
		},
		agora,
	);
	const novo = aplicarDecisao(relatorio, proposta.id, { tipo: "aprovada", texto: ajuste.texto, em, evento: evento.id, ajuste: ajuste.id });
	if (acrescentado) await gravarAjustes(dados, acrescentado.conteudo);
	await gravarRelatorio(dados, materia, curso, novo);
	await acrescentarEvento(eventosAprendiz(dados), evento);
	return { relatorio: novo, evento, ajuste };
}
