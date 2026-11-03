// O ciclo do método no disco (parte 4 do plano de 2026-10-28,
// docs/metodo-ciclo.md e, acima dele, docs/metodo-experimentos.md):
// - o relatório de um módulo concluído em
//   materias/<matéria>/cursos/<curso>/relatorios/<módulo>.json, gravado
//   inteiro de uma vez (lib/arquivos.ts), com o evento gerou_relatorio_metodo
//   no eventos.jsonl da matéria;
// - a evidência e o placar: os eventos do módulo lidos do
//   aprendiz/eventos.jsonl, e o histórico dos módulos concluídos antes dele
//   (de todas as matérias e cursos), derivado dos arquivos de módulo e dos
//   eventos (nada novo é gravado);
// - os ajustes em aprendiz/metodo/<arquivo>.md (um por arquivo de
//   metodologia; `em teste`, `mantido` ou `descartado`) e o que facilita em
//   aprendiz/metodo/aprendizados.md, gravados inteiros pelo código; um
//   arquivo que não se lê é ErroMetodo e nunca é sobrescrito;
// - aplicar a análise (aplicarAnalise): as decisões, os experimentos novos e
//   os aprendizados, uma vez só, com os eventos iniciou_experimento_metodo,
//   decidiu_experimento_metodo, registrou_aprendizado_metodo e
//   reviu_aprendizado_metodo no aprendiz/eventos.jsonl (só de acréscimo).
// As regras são puras e ficam em metodo-ciclo-tipos.ts, metodo-placar-tipos.ts,
// metodo-aprendizados-tipos.ts e metodo-analise-tipos.ts. Sem dependências: o
// pi carrega a extensão desta pasta. Quem chama segura as travas (a da
// matéria para o relatório; a dos ajustes para os arquivos de ajustes e para
// aplicar a análise, tomada dentro da trava da matéria, nunca o contrário).

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gravarDeUmaVez } from "./arquivos.ts";
import { type ContextoCurso, ehIdModulo, listarCursos, pastaDoCurso } from "./cursos.ts";
import { acrescentarEvento, criarEvento, type Evento, lerEventos } from "./eventos.ts";
import { eventosAprendiz, eventosMateria, listarMaterias, pastaAprendiz } from "./materias.ts";
import {
	acrescentarAprendizado,
	type Aprendizado,
	type AprendizadosDoArquivo,
	type AprendizadosNaTela,
	aprendizadosNaTela,
	aprendizadosVazios,
	blocoOQueFacilita,
	comentarioDoAprendizado,
	escreverAprendizadosMarkdown,
	lerAprendizadosMarkdown,
	mudarSituacaoDoAprendizado,
} from "./metodo-aprendizados-tipos.ts";
import {
	conferirQuePodeGerarDeNovo,
	type ExperimentoEmTeste,
	type ModuloTestado,
	relatorioLido,
	relatorioNaOrdem,
	type RelatorioMetodoV2,
	relatorioV2NaOrdem,
} from "./metodo-analise-tipos.ts";
import {
	acrescentarAjuste,
	type AjusteMetodo,
	type AjustesDoArquivo,
	ajustesComEstado,
	ajustesNaTela,
	ajustesQueValem,
	ajustesVazios,
	type AjusteUsado,
	type ArquivoDeAjustesNaTela,
	comentarioDaOrigem,
	comentarioSubstituido,
	dataLocal,
	ehArquivoMetodo,
	ErroMetodo,
	escreverAjustesMarkdown,
	type EvidenciaMontada,
	lerAjustesMarkdown,
	lerReferenciaDeAjuste,
	montarEvidencia,
	mudarEstadoDoAjuste,
	origemDoMetodo,
	referenciaDoAjuste,
	type RelatorioMetodo,
	ajusteQueValeIgual,
} from "./metodo-ciclo-tipos.ts";
import {
	type Comparacao,
	compararComHistorico,
	type EntradaDoHistorico,
	historicoDosModulos,
	type ModuloConcluido,
	type PlacarDoModulo,
	placarDoModuloNosEventos,
} from "./metodo-placar-tipos.ts";
import { ARQUIVOS_METODO, type ArquivoMetodo, type ModuloGerado } from "./modulo-tipos.ts";
import { situacoesDoCurso } from "./modulos.ts";

export * from "./metodo-aprendizados-tipos.ts";
export * from "./metodo-analise-tipos.ts";
export * from "./metodo-ciclo-tipos.ts";
export * from "./metodo-placar-tipos.ts";

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
 * O relatório do módulo (da versão 2 ou da 1). Sem arquivo, null (ainda não
 * foi gerado, ou falhou). Um arquivo que não dá para ler (JSON inválido,
 * outro formato) é ErroMetodo: quem chama não tem relatório para gravar, então
 * o arquivo nunca é sobrescrito sem ter sido lido.
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
 * relatório anterior ilegível é ErroMetodo e não é sobrescrito, e um
 * anterior já aplicado (aplicadoEm) também: "A análise deste módulo já foi
 * aplicada.".
 */
export async function registrarRelatorio(dados: string, materia: string, curso: string, relatorio: RelatorioMetodo, contexto: ContextoMetodo = {}): Promise<Evento> {
	conferirQuePodeGerarDeNovo(await lerRelatorio(dados, materia, curso, relatorio.modulo));
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

// --- A evidência e o placar ----------------------------------------------------------------------

/** Os eventos do aprendiz/eventos.jsonl (as linhas que não são eventos são puladas). */
export async function eventosDoAprendiz(dados: string): Promise<Evento[]> {
	return (await lerEventos(eventosAprendiz(dados))).eventos;
}

/** A evidência do relatório do módulo (montarEvidencia), com os eventos lidos do aprendiz/eventos.jsonl. */
export async function evidenciaDoModulo(dados: string, modulo: ModuloGerado, limites: { linhas?: number; bloco?: number } = {}): Promise<EvidenciaMontada> {
	return montarEvidencia(await eventosDoAprendiz(dados), modulo, limites);
}

/**
 * Os módulos concluídos de todas as matérias e cursos (os gerados com
 * concluidoEm), com o nome do curso e o do módulo no esqueleto. Um curso ou
 * módulo que não se lê fica de fora (nada é gravado aqui).
 */
export async function modulosConcluidos(dados: string): Promise<ModuloConcluido[]> {
	const saida: ModuloConcluido[] = [];
	for (const materia of (await listarMaterias(dados)).materias) {
		const { cursos } = await listarCursos(dados, materia.id);
		for (const curso of cursos) {
			let lidos;
			try {
				lidos = await situacoesDoCurso(dados, materia.id, curso.id);
			} catch {
				continue;
			}
			for (const id of lidos.concluidos) {
				const modulo = lidos.modulos[id];
				if (modulo?.situacao !== "gerado") continue;
				saida.push({ modulo, cursoNome: curso.nome, moduloNome: curso.esqueleto?.modulos.find((item) => item.id === id)?.nome ?? id });
			}
		}
	}
	return saida;
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

/** Grava o arquivo de ajustes inteiro de uma vez (escreverAjustesMarkdown), sempre com os estados novos. */
export async function gravarAjustes(dados: string, conteudo: AjustesDoArquivo): Promise<void> {
	await mkdir(pastaAjustes(dados), { recursive: true });
	await gravarDeUmaVez(caminhoDosAjustes(dados, conteudo.arquivo), escreverAjustesMarkdown(conteudo));
}

/** Os ajustes que valem (`em teste` e `mantido`) de um arquivo de metodologia, na ordem (os que toda geração carrega depois da base). */
export async function ajustesQueValemDe(dados: string, arquivo: string): Promise<AjusteMetodo[]> {
	return ajustesQueValem(await lerAjustes(dados, arquivo));
}

/** Os ajustes de todos os arquivos de metodologia, na ordem de ARQUIVOS_METODO. Um arquivo que não se lê é ErroMetodo. */
export async function lerTodosOsAjustes(dados: string): Promise<AjustesDoArquivo[]> {
	const saida: AjustesDoArquivo[] = [];
	for (const arquivo of ARQUIVOS_METODO) saida.push(await lerAjustes(dados, arquivo));
	return saida;
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

/** Quantos experimentos estão em teste agora, em todos os arquivos (um arquivo que não se lê não conta). */
export async function contarEmTeste(dados: string): Promise<number> {
	let total = 0;
	for (const arquivo of ARQUIVOS_METODO) {
		try {
			total += ajustesComEstado(await lerAjustes(dados, arquivo), "em teste").length;
		} catch {
			// Um arquivo ilegível aparece no listar_ajustes; aqui só não conta.
		}
	}
	return total;
}

// --- O que facilita (aprendizados.md) ------------------------------------------------------------------

/** O aprendiz/metodo/aprendizados.md. */
export const caminhoDosAprendizados = (dados: string) => join(pastaAjustes(dados), "aprendizados.md");

/** Os aprendizados. Sem arquivo, nenhum. Um arquivo que não dá para ler é ErroMetodo e nunca é sobrescrito. */
export async function lerAprendizados(dados: string): Promise<AprendizadosDoArquivo> {
	const caminho = caminhoDosAprendizados(dados);
	let conteudo: string;
	try {
		conteudo = await readFile(caminho, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return aprendizadosVazios();
		throw erro;
	}
	try {
		return lerAprendizadosMarkdown(conteudo);
	} catch (erro) {
		throw new ErroMetodo(`Não consegui ler os aprendizados do método ${caminho}: ${(erro as Error).message}. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
}

/** Grava o aprendizados.md inteiro de uma vez. */
export async function gravarAprendizados(dados: string, conteudo: AprendizadosDoArquivo): Promise<void> {
	await mkdir(pastaAjustes(dados), { recursive: true });
	await gravarDeUmaVez(caminhoDosAprendizados(dados), escreverAprendizadosMarkdown(conteudo));
}

/** Os aprendizados na mensagem ajustes; um arquivo que não se lê vai sem itens e com `erro`. */
export async function listarAprendizados(dados: string): Promise<AprendizadosNaTela> {
	try {
		return { itens: aprendizadosNaTela(await lerAprendizados(dados)) };
	} catch (erro) {
		return { itens: [], erro: (erro as Error).message };
	}
}

/**
 * O bloco <o-que-facilita> das gerações (blocoOQueFacilita) com o aprendizados.md
 * de agora (o hash dele vai nos eventos, que quem chama monta com hashDoPrompt).
 * Sem aprendizado que entre, "". Um arquivo que não se lê é ErroMetodo: a geração também não sai
 * sem o que o Breno escreveu lá.
 */
export async function lerOQueFacilita(dados: string): Promise<string> {
	return blocoOQueFacilita(await lerAprendizados(dados));
}

// --- Montar o que a análise recebe ----------------------------------------------------------------------

/** Tudo que a análise de um módulo recebe além da evidência (a mensagem ao modelo e a conferência do que ele devolve). */
export interface ContextoDaAnalise {
	placar: PlacarDoModulo;
	/** Os módulos concluídos antes do atual, até 8, com o placar recalculado. */
	historico: EntradaDoHistorico[];
	comparacao: Comparacao;
	/** Os ajustes do módulo atual que valeram na geração dele. */
	ajustesUsados: AjusteUsado[];
	/** Os ajustes de todos os arquivos, como estão agora. */
	ajustes: AjustesDoArquivo[];
	/** Os experimentos em teste, na ordem dos arquivos, com os módulos em que valeram (contando o atual). */
	emTeste: ExperimentoEmTeste[];
	/** Os ajustes mantidos e os descartados (arquivo, id e texto). */
	mantidos: Array<{ arquivo: ArquivoMetodo; id: string; texto: string }>;
	descartados: Array<{ arquivo: ArquivoMetodo; id: string; texto: string }>;
	/** Os aprendizados registrados. */
	aprendizados: Aprendizado[];
}

/**
 * Monta o contexto da análise do módulo concluído: o placar dele, o histórico
 * (módulos concluídos antes, de todas as matérias e cursos, até 8) e a
 * comparação, os ajustes de agora (os `em teste` com os módulos em que
 * valeram, pelos ajustesUsados do histórico e do atual), os mantidos, os
 * descartados e os aprendizados. Um arquivo de ajustes ou de aprendizados que
 * não se lê é ErroMetodo.
 */
export async function montarContextoDaAnalise(dados: string, modulo: ModuloGerado, eventos?: readonly Evento[]): Promise<ContextoDaAnalise> {
	const doAprendiz = eventos ?? (await eventosDoAprendiz(dados));
	const placar = placarDoModuloNosEventos(doAprendiz, modulo);
	const concluidos = await modulosConcluidos(dados);
	const historico = historicoDosModulos(concluidos, doAprendiz, { materia: modulo.materia, curso: modulo.curso, modulo: modulo.id, ...(modulo.concluidoEm ? { concluidoEm: modulo.concluidoEm } : {}) });
	const nomeDoAtual = concluidos.find((item) => item.modulo.materia === modulo.materia && item.modulo.curso === modulo.curso && item.modulo.id === modulo.id)?.moduloNome ?? modulo.id;
	const ajustesUsados = (modulo.ajustesUsados ?? []).map((item) => ({ ...item }));
	const ajustes = await lerTodosOsAjustes(dados);
	const aprendizados = (await lerAprendizados(dados)).aprendizados;
	const valeuEm = (arquivo: ArquivoMetodo, id: string): ModuloTestado[] => [
		...historico
			.filter((entrada) => entrada.ajustesUsados.some((usado) => usado.arquivo === arquivo && usado.ajuste === id))
			.map((entrada): ModuloTestado => ({ materia: entrada.materia, curso: entrada.curso, modulo: entrada.modulo, moduloNome: entrada.moduloNome, atual: false })),
		...(ajustesUsados.some((usado) => usado.arquivo === arquivo && usado.ajuste === id)
			? [{ materia: modulo.materia, curso: modulo.curso, modulo: modulo.id, moduloNome: nomeDoAtual, atual: true }]
			: []),
	];
	const emTeste: ExperimentoEmTeste[] = ajustes.flatMap((doArquivo) =>
		ajustesComEstado(doArquivo, "em teste").map((ajuste) => ({ arquivo: doArquivo.arquivo, id: ajuste.id, texto: ajuste.texto, comecouEm: origemDoMetodo(ajuste)?.em ?? null, testadoEm: valeuEm(doArquivo.arquivo, ajuste.id) })),
	);
	const comEstado = (estado: "mantido" | "descartado") => ajustes.flatMap((doArquivo) => ajustesComEstado(doArquivo, estado).map((ajuste) => ({ arquivo: doArquivo.arquivo, id: ajuste.id, texto: ajuste.texto })));
	return { placar, historico, comparacao: compararComHistorico(placar, historico), ajustesUsados, ajustes, emTeste, mantidos: comEstado("mantido"), descartados: comEstado("descartado"), aprendizados };
}

// --- Aplicar a análise -------------------------------------------------------------------------------------

/**
 * Aplica a análise de um relatório pronto, uma vez só (docs/metodo-experimentos.md,
 * "Aplicar a análise"); quem chama segura a trava da matéria e a dos ajustes.
 * Na ordem:
 * - `manter` muda o estado para `mantido` e `descartar` para `descartado`;
 *   `reescrever` deixa o antigo `descartado` ("substituído por <id>" no
 *   comentário) e acrescenta o texto novo `em teste`, com "reescrita de
 *   <arquivo>#<id>" no comentário; `continuar` não muda nada;
 * - cada proposta que entrou vira um ajuste `em teste`, com o comentário de
 *   origem;
 * - cada aprendizado novo é acrescentado ao aprendizados.md (`observado`) e
 *   cada revisão muda a situação do aprendizado.
 * Cada passo grava o arquivo e o evento (iniciou_experimento_metodo,
 * decidiu_experimento_metodo, registrou_aprendizado_metodo,
 * reviu_aprendizado_metodo, no aprendiz/eventos.jsonl). Devolve o relatório
 * com `aplicadoEm` e o `novo` de cada item que criou algo. Se falhar no meio,
 * devolve o relatório com `erroAoAplicar` (a frase) e o `novo` do que já foi
 * aplicado; com algo já aplicado, também com `aplicadoEm` (gerar de novo
 * repetiria o que já foi feito). Não há nova tentativa. Só mexe nos arquivos e
 * nos eventos; gravar o relatório é de quem chama.
 */
export async function aplicarAnalise(dados: string, materia: string, curso: string, relatorio: RelatorioMetodoV2, contexto: ContextoMetodo = {}): Promise<RelatorioMetodoV2> {
	const agora = contexto.agora ?? new Date();
	const copia = relatorioV2NaOrdem(relatorio);
	if (copia.situacao !== "pronto") return copia;
	const modulo = copia.modulo;
	let aplicou = false;
	let passo = 0;
	// Os eventos de uma aplicação saem com instantes crescentes (o ts ordena).
	const acrescentar = async (dadosDoEvento: Omit<Evento, "id" | "ts">) => {
		await acrescentarEvento(eventosAprendiz(dados), criarEvento({ ...daSessao(contexto), ...dadosDoEvento }, new Date(agora.getTime() + passo++)));
	};
	const em = dataLocal(agora);
	const comum = { materia, curso, modulo };
	try {
		for (const experimento of copia.experimentos) {
			if (experimento.decisao === "continuar") continue;
			const referencia = lerReferenciaDeAjuste(experimento.ajuste);
			if (!referencia) throw new ErroMetodo(`O experimento "${experimento.ajuste}" não está no formato <arquivo>#<id>.`);
			const atuais = await lerAjustes(dados, referencia.arquivo);
			const doAjuste = atuais.ajustes.find((item) => item.id === referencia.id);
			if (!doAjuste || doAjuste.estado !== "em teste") throw new ErroMetodo(`O experimento ${experimento.ajuste} não está mais em teste; a decisão sobre ele não foi aplicada.`);
			const decisao = { decisao: experimento.decisao, porque: experimento.porque, modulosTestados: experimento.modulosTestados };
			const objeto = { arquivo: referencia.arquivo, ajuste: referencia.id, ...comum };
			if (experimento.decisao === "reescrever") {
				const novoTexto = experimento.textoNovo ?? "";
				const comNovo = acrescentarAjuste(atuais, {
					texto: novoTexto,
					comentario: comentarioDaOrigem({ ...comum, evidencias: [], em, reescritaDe: experimento.ajuste }),
					agora,
				});
				const trocado = mudarEstadoDoAjuste(comNovo.conteudo, referencia.id, "descartado", { comentario: comentarioSubstituido(doAjuste.comentario, comNovo.ajuste.id) });
				await gravarAjustes(dados, trocado.conteudo);
				aplicou = true;
				const novo = referenciaDoAjuste(referencia.arquivo, comNovo.ajuste.id);
				experimento.novo = novo;
				await acrescentar({ verbo: "decidiu_experimento_metodo", objeto, resultado: { ...decisao, novo } });
				await acrescentar({
					verbo: "iniciou_experimento_metodo",
					objeto: { arquivo: referencia.arquivo, ajuste: comNovo.ajuste.id, ...comum, reescritaDe: experimento.ajuste },
					resultado: { texto: comNovo.ajuste.texto, evidencias: [] },
				});
				continue;
			}
			const mudado = mudarEstadoDoAjuste(atuais, referencia.id, experimento.decisao === "manter" ? "mantido" : "descartado");
			await gravarAjustes(dados, mudado.conteudo);
			aplicou = true;
			await acrescentar({ verbo: "decidiu_experimento_metodo", objeto, resultado: decisao });
		}
		for (const proposta of copia.propostas) {
			const atuais = await lerAjustes(dados, proposta.arquivo);
			const igual = ajusteQueValeIgual(atuais, proposta.ajuste);
			if (igual) {
				// Já vale um igual (o Breno pode ter escrito à mão depois da conferência): não repete.
				proposta.novo = referenciaDoAjuste(proposta.arquivo, igual.id);
				continue;
			}
			const comNovo = acrescentarAjuste(atuais, {
				texto: proposta.ajuste,
				comentario: comentarioDaOrigem({ ...comum, proposta: proposta.id, evidencias: proposta.evidencias, em }),
				agora,
			});
			await gravarAjustes(dados, comNovo.conteudo);
			aplicou = true;
			proposta.novo = referenciaDoAjuste(proposta.arquivo, comNovo.ajuste.id);
			await acrescentar({
				verbo: "iniciou_experimento_metodo",
				objeto: { arquivo: proposta.arquivo, ajuste: comNovo.ajuste.id, ...comum, proposta: proposta.id },
				resultado: { texto: comNovo.ajuste.texto, evidencias: [...proposta.evidencias] },
			});
		}
		for (const aprendizado of copia.aprendizados) {
			const atuais = await lerAprendizados(dados);
			const comNovo = acrescentarAprendizado(atuais, { texto: aprendizado.texto, comentario: comentarioDoAprendizado({ ...comum, evidencias: aprendizado.evidencias, em }), agora });
			await gravarAprendizados(dados, comNovo.conteudo);
			aplicou = true;
			aprendizado.novo = comNovo.aprendizado.id;
			await acrescentar({
				verbo: "registrou_aprendizado_metodo",
				objeto: { aprendizado: comNovo.aprendizado.id, ...comum },
				resultado: { texto: comNovo.aprendizado.texto, porque: aprendizado.porque, evidencias: [...aprendizado.evidencias] },
			});
		}
		for (const revisao of copia.revisoes) {
			const atuais = await lerAprendizados(dados);
			const mudado = mudarSituacaoDoAprendizado(atuais, revisao.aprendizado, revisao.situacao);
			await gravarAprendizados(dados, mudado.conteudo);
			aplicou = true;
			await acrescentar({ verbo: "reviu_aprendizado_metodo", objeto: { aprendizado: revisao.aprendizado, ...comum }, resultado: { situacao: revisao.situacao, porque: revisao.porque } });
		}
		copia.aplicadoEm = agora.toISOString();
	} catch (erro) {
		copia.erroAoAplicar = (erro as Error).message;
		if (aplicou) copia.aplicadoEm = agora.toISOString();
	}
	return copia;
}
