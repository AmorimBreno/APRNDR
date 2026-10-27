// Os módulos do curso no disco (item 6, docs/modulos.md): cada módulo gerado
// (ou aguardando material) é materias/<matéria>/cursos/<curso>/modulos/<módulo>.json,
// gravado inteiro de uma vez; sem arquivo, o módulo ainda não foi gerado. Os
// eventos gerou_modulo, marcou_aguardando_material e concluiu_modulo vão para
// o eventos.jsonl da matéria. Daqui sai também o que vai na mensagem dos modelos do plano e
// das lições (entradaDoModelo). As regras são puras e ficam em
// modulo-tipos.ts. Sem dependências: o pi carrega a extensão desta pasta.
// Quem chama segura a trava da matéria (a extensão de módulos).

import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gravarDeUmaVez } from "./arquivos.ts";
import { type ArquivoDoCurso, type ContextoCurso, type Curso, ehIdModulo, type Escopo, lerCurso, materiaisProntos, pastaDoCurso, type TipoCurso } from "./cursos.ts";
import { type PromptUsado, type TrechosDoConceito, trechosDosConceitos } from "./diagnostico.ts";
import type { Modulo as ModuloDoEsqueleto, TipoModulo } from "./esqueleto-tipos.ts";
import { acrescentarEvento, criarEvento } from "./eventos.ts";
import { lerMapa, type Prioridade, type Referencia } from "./mapa.ts";
import { eventosMateria } from "./materias.ts";
import {
	type AguardandoMaterial,
	ErroModulo,
	LIMITE_TRECHOS_LICAO,
	type Licao,
	type LicaoPlanejada,
	licoesPorHoras,
	type Modulo,
	type ModuloAguardando,
	type ModuloGerado,
	moduloDoEsqueleto,
	type NivelConceito,
	niveisDoModulo,
	type PedidoModulo,
	podeGerar,
	resumoDoModulo,
	type SituacaoModulo,
	SITUACOES_MODULO,
	VERSAO_MODULO,
} from "./modulo-tipos.ts";

export * from "./modulo-tipos.ts";

export const pastaModulos = (dados: string, materia: string, curso: string) => join(pastaDoCurso(dados, materia, curso), "modulos");

/** O caminho do <módulo>.json. Um id que não é m<número>, ErroModulo (o id vira nome de arquivo). */
export function caminhoDoModulo(dados: string, materia: string, curso: string, modulo: string): string {
	if (!ehIdModulo(modulo)) throw new ErroModulo(`O id do módulo não é válido ("${String(modulo)}").`);
	return join(pastaModulos(dados, materia, curso), `${modulo}.json`);
}

/** O ContextoCurso (sessão, momento) e o que vai no contexto do gerou_modulo: os prompts e o modelo. */
export interface ContextoModulo extends ContextoCurso {
	/** modulo-plano.md e modulo-licao.md: o nome e o hash do conteúdo de cada um. */
	prompts?: PromptUsado[];
	/** Sem ele, o modelo da geração. */
	modelo?: string;
}

const daSessao = (contexto: ContextoCurso) => (contexto.sessao ? { sessao: contexto.sessao } : {});
const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

// --- Ler e gravar -------------------------------------------------------------------

/** O módulo lido, conferido; erro (com a frase) se não estiver no formato. */
function moduloLido(valor: unknown, materia: string, curso: string, modulo: string): Modulo {
	if (!ehObjeto(valor) || valor.versao !== VERSAO_MODULO) throw new Error(`não está no formato da versão ${VERSAO_MODULO}`);
	if (valor.id !== modulo) throw new Error(`o id "${String(valor.id)}" não é o nome do arquivo`);
	if (valor.curso !== curso) throw new Error(`o curso "${String(valor.curso)}" não é o da pasta`);
	if (valor.materia !== materia) throw new Error(`a matéria "${String(valor.materia)}" não é a da pasta`);
	if (!(SITUACOES_MODULO as readonly unknown[]).includes(valor.situacao)) throw new Error(`situação desconhecida ("${String(valor.situacao)}")`);
	if (!Array.isArray(valor.licoes) || !(valor.licoes as unknown[]).every((licao) => ehObjeto(licao) && Array.isArray(licao.blocos))) {
		throw new Error("as lições não estão no formato (cada uma precisa da lista de blocos)");
	}
	if (valor.pedido !== undefined && !ehObjeto(valor.pedido)) throw new Error("o pedido não é um objeto");
	if (valor.situacao === "aguardando_material") {
		const aguardando = valor.aguardando;
		if (!ehObjeto(aguardando) || typeof aguardando.desde !== "string" || !Array.isArray(aguardando.prontos)) throw new Error("falta o aguardando (desde e prontos)");
	} else if (typeof valor.geradoEm !== "string" || typeof valor.modelo !== "string" || typeof valor.custo !== "number" || !Array.isArray(valor.materiaisUsados)) {
		throw new Error("faltam geradoEm, modelo, custo ou materiaisUsados");
	} else if (valor.concluidoEm !== undefined && typeof valor.concluidoEm !== "string") {
		throw new Error("o concluidoEm não é um texto");
	}
	return moduloNaOrdem(valor as unknown as Modulo);
}

/** O módulo com os campos na ordem do formato. */
function moduloNaOrdem(modulo: Modulo): Modulo {
	const base = { versao: VERSAO_MODULO as typeof VERSAO_MODULO, id: modulo.id, curso: modulo.curso, materia: modulo.materia };
	const pedido = modulo.pedido ? { pedido: modulo.pedido } : {};
	if (modulo.situacao === "aguardando_material") {
		const aguardando: AguardandoMaterial = { nota: modulo.aguardando.nota ?? "", desde: modulo.aguardando.desde, prontos: modulo.aguardando.prontos };
		return { ...base, situacao: "aguardando_material", ...pedido, aguardando, licoes: modulo.licoes };
	}
	return {
		...base,
		situacao: "gerado",
		...pedido,
		licoes: modulo.licoes,
		geradoEm: modulo.geradoEm,
		modelo: modulo.modelo,
		custo: modulo.custo,
		materiaisUsados: modulo.materiaisUsados,
		...(modulo.concluidoEm ? { concluidoEm: modulo.concluidoEm } : {}),
	};
}

/**
 * O módulo do curso. Sem arquivo, undefined (o módulo ainda não foi gerado).
 * Um arquivo que não dá para ler (JSON inválido, outro formato) é um
 * ErroModulo: quem chama não tem módulo para gravar, então o arquivo nunca é
 * sobrescrito sem ter sido lido.
 */
export async function lerModulo(dados: string, materia: string, curso: string, modulo: string): Promise<Modulo | undefined> {
	const arquivo = caminhoDoModulo(dados, materia, curso, modulo);
	let conteudo: string;
	try {
		conteudo = await readFile(arquivo, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw erro;
	}
	try {
		let valor: unknown;
		try {
			valor = JSON.parse(conteudo);
		} catch (erro) {
			throw new Error(`o JSON está inválido (${(erro as Error).message})`);
		}
		return moduloLido(valor, materia, curso, modulo);
	} catch (erro) {
		throw new ErroModulo(`Não consegui ler o módulo ${arquivo}: ${(erro as Error).message}. Corrija o arquivo ou tire-o da pasta; nada foi gravado por cima.`);
	}
}

/** Grava o <módulo>.json inteiro de uma vez (escreve ao lado e renomeia), em JSON com tabulação. */
async function gravarModulo(dados: string, modulo: Modulo): Promise<void> {
	const arquivo = caminhoDoModulo(dados, modulo.materia, modulo.curso, modulo.id);
	await mkdir(dirname(arquivo), { recursive: true });
	await gravarDeUmaVez(arquivo, `${JSON.stringify(moduloNaOrdem(modulo), null, "\t")}\n`);
}

/** Os módulos gravados do curso: as situações e os módulos por id, os concluídos e os arquivos ilegíveis (nunca sobrescritos). */
export interface ModulosDoCurso {
	situacoes: Record<string, SituacaoModulo>;
	modulos: Record<string, Modulo>;
	/** Os ids dos gerados com concluidoEm, na ordem dos ids. */
	concluidos: string[];
	erros: Array<{ modulo: string; mensagem: string }>;
}

/**
 * Lê os modulos/*.json do curso (só os com nome m<número>.json). Um arquivo
 * ilegível vai para `erros` e fica fora das situações. Sem a pasta, nenhum.
 */
export async function situacoesDoCurso(dados: string, materia: string, curso: string): Promise<ModulosDoCurso> {
	const saida: ModulosDoCurso = { situacoes: {}, modulos: {}, concluidos: [], erros: [] };
	let entradas: Dirent[];
	try {
		entradas = await readdir(pastaModulos(dados, materia, curso), { withFileTypes: true });
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return saida;
		throw erro;
	}
	const ids = entradas
		.filter((entrada) => entrada.isFile() && entrada.name.endsWith(".json") && ehIdModulo(entrada.name.slice(0, -".json".length)))
		.map((entrada) => entrada.name.slice(0, -".json".length))
		.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
	for (const id of ids) {
		try {
			const modulo = await lerModulo(dados, materia, curso, id);
			if (!modulo) continue;
			saida.situacoes[id] = modulo.situacao;
			saida.modulos[id] = modulo;
			if (modulo.situacao === "gerado" && modulo.concluidoEm) saida.concluidos.push(id);
		} catch (erro) {
			saida.erros.push({ modulo: id, mensagem: (erro as Error).message });
		}
	}
	return saida;
}

/** O que a extensão manda gravar depois de gerar: as lições já conferidas (validarLicao), o formulário, o modelo, o custo e os materiais usados. */
export interface GeracaoModulo {
	/** O id do módulo no esqueleto. */
	id: string;
	licoes: Licao[];
	pedido?: PedidoModulo;
	modelo: string;
	custo: number;
	materiaisUsados: ArquivoDoCurso[];
}

/** O formulário limpo: textos aparados, vazios fora. */
function pedidoLimpo(pedido: PedidoModulo | undefined, agora: Date): PedidoModulo | undefined {
	if (!pedido) return undefined;
	const informacoes = typeof pedido.informacoes === "string" ? pedido.informacoes.trim() : "";
	const observacoes = typeof pedido.observacoes === "string" ? pedido.observacoes.trim() : "";
	const materiaisNovos = Array.isArray(pedido.materiaisNovos) ? [...new Set(pedido.materiaisNovos.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))] : [];
	return {
		...(informacoes ? { informacoes } : {}),
		...(observacoes ? { observacoes } : {}),
		...(materiaisNovos.length > 0 ? { materiaisNovos } : {}),
		pedidoEm: typeof pedido.pedidoEm === "string" && pedido.pedidoEm ? pedido.pedidoEm : agora.toISOString(),
	};
}

/**
 * Grava o módulo gerado (situação gerado, geradoEm agora), substituindo o que
 * havia (um aguardando, ou a versão anterior). Confere antes: o curso pronto,
 * o módulo no esqueleto e que ele pode ser gerado (podeGerar: qualquer um que
 * não está concluído); um arquivo ilegível no lugar é ErroModulo e não é
 * sobrescrito; sem lições, ErroModulo. Grava gerou_modulo no eventos.jsonl da
 * matéria (resultado {licoes, blocos, questoes, custo}; contexto {modelo,
 * prompts}).
 */
export async function gravarModuloGerado(dados: string, materia: string, curso: string, geracao: GeracaoModulo, contexto: ContextoModulo = {}): Promise<ModuloGerado> {
	const atual = await lerCurso(dados, materia, curso);
	const { situacoes, concluidos } = await situacoesDoCurso(dados, materia, curso);
	podeGerar(atual, situacoes, geracao.id, concluidos);
	await lerModulo(dados, materia, curso, geracao.id);
	if (!Array.isArray(geracao.licoes) || geracao.licoes.length === 0) throw new ErroModulo("Não há lições para gravar no módulo.");
	const agora = contexto.agora ?? new Date();
	const pedido = pedidoLimpo(geracao.pedido, agora);
	const modulo: ModuloGerado = {
		versao: VERSAO_MODULO,
		id: geracao.id,
		curso: atual.id,
		materia,
		situacao: "gerado",
		...(pedido ? { pedido } : {}),
		licoes: structuredClone(geracao.licoes),
		geradoEm: agora.toISOString(),
		modelo: geracao.modelo,
		custo: geracao.custo,
		materiaisUsados: structuredClone(geracao.materiaisUsados ?? []),
	};
	await gravarModulo(dados, modulo);
	const resumo = resumoDoModulo(modulo);
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento(
			{
				...daSessao(contexto),
				verbo: "gerou_modulo",
				objeto: { materia, curso: atual.id, modulo: modulo.id },
				resultado: { licoes: resumo.licoes, blocos: resumo.blocos, questoes: resumo.questoes, custo: geracao.custo },
				contexto: { modelo: contexto.modelo ?? geracao.modelo, prompts: (contexto.prompts ?? []).map((prompt) => ({ nome: prompt.nome, hash: prompt.hash })) },
			},
			agora,
		),
	);
	return modulo;
}

/**
 * Marca o módulo como aguardando material, com a nota (aparada; pode ser
 * vazia) e a foto dos materiais prontos da matéria agora (materiaisProntos).
 * Qualquer módulo que não foi gerado, como gerar (marcar de novo um que já
 * aguarda troca a nota, o desde e a foto); um gerado não volta a aguardar.
 * Um arquivo ilegível no lugar é ErroModulo e não é sobrescrito. Grava marcou_aguardando_material no
 * eventos.jsonl da matéria (resultado {nota}).
 */
export async function marcarAguardando(dados: string, materia: string, curso: string, modulo: string, nota: unknown, contexto: ContextoCurso = {}): Promise<ModuloAguardando> {
	const atual = await lerCurso(dados, materia, curso);
	moduloDoEsqueleto(atual, modulo);
	const existente = await lerModulo(dados, materia, curso, modulo);
	if (existente?.situacao === "gerado") throw new ErroModulo("O módulo já foi gerado; um módulo gerado não volta a aguardar material.");
	const agora = contexto.agora ?? new Date();
	const texto = typeof nota === "string" ? nota.trim() : "";
	const prontos = await materiaisProntos(dados, materia);
	const novo: ModuloAguardando = {
		versao: VERSAO_MODULO,
		id: modulo,
		curso: atual.id,
		materia,
		situacao: "aguardando_material",
		...(existente?.pedido ? { pedido: existente.pedido } : {}),
		aguardando: { nota: texto, desde: agora.toISOString(), prontos },
		licoes: [],
	};
	await gravarModulo(dados, novo);
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ ...daSessao(contexto), verbo: "marcou_aguardando_material", objeto: { materia, curso: atual.id, modulo }, resultado: { nota: texto } }, agora),
	);
	return novo;
}

/**
 * Conclui o módulo (docs/modulos.md, "Concluir um módulo"): só um gerado e
 * ainda não concluído; grava o concluidoEm (agora) no <módulo>.json, sem
 * mexer no resto, e o concluiu_modulo no eventos.jsonl da matéria (resultado
 * {licoes, questoes}). A recomendação (proximoModulo) passa para o
 * seguinte. Concluído não volta atrás. Sem arquivo, aguardando
 * material ou já concluído, ErroModulo; um arquivo ilegível é ErroModulo e
 * não é sobrescrito.
 */
export async function concluirModulo(dados: string, materia: string, curso: string, modulo: string, contexto: ContextoCurso = {}): Promise<ModuloGerado> {
	const atual = await lerCurso(dados, materia, curso);
	moduloDoEsqueleto(atual, modulo);
	const existente = await lerModulo(dados, materia, curso, modulo);
	if (!existente) throw new ErroModulo("O módulo ainda não foi gerado; só um módulo gerado pode ser concluído.");
	if (existente.situacao !== "gerado") throw new ErroModulo("O módulo está aguardando material; só um módulo gerado pode ser concluído.");
	if (existente.concluidoEm) throw new ErroModulo("O módulo já foi concluído.");
	const agora = contexto.agora ?? new Date();
	const concluido: ModuloGerado = { ...existente, concluidoEm: agora.toISOString() };
	await gravarModulo(dados, concluido);
	const resumo = resumoDoModulo(concluido);
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ ...daSessao(contexto), verbo: "concluiu_modulo", objeto: { materia, curso: atual.id, modulo }, resultado: { licoes: resumo.licoes, questoes: resumo.questoes } }, agora),
	);
	return concluido;
}

// --- A mensagem dos modelos -------------------------------------------------------------

/** Um local do material que cita o conceito (o arquivo e o local do trecho no manifesto). */
export interface LocalDoConceito {
	arquivo: string;
	local: string;
}

/** Um conceito do módulo na mensagem dos modelos. */
export interface ConceitoDoModulo {
	id: string;
	nome: string;
	descricao: string;
	prioridade: Prioridade;
	nivel: NivelConceito;
	/** Os locais do material que citam o conceito (nenhum no escopo livre). */
	locais: LocalDoConceito[];
}

/** A mensagem do modelo do plano (prompts/modulo-plano.md). */
export interface EntradaPlano {
	curso: { nome: string; prova?: string; escopo: Escopo; tipo: TipoCurso; motivo: string };
	modulo: { id: string; nome: string; objetivo: string; tipo: TipoModulo; horas: number };
	/** Quantas lições o plano pode ter (licoesPorHoras). */
	licoes: number;
	/** Na ordem do módulo. */
	conceitos: ConceitoDoModulo[];
	/** O formulário: só os campos com texto. */
	formulario: { informacoes?: string; observacoes?: string };
}

/** A mensagem do modelo de uma lição (prompts/modulo-licao.md). */
export interface EntradaLicao {
	curso: EntradaPlano["curso"];
	modulo: EntradaPlano["modulo"];
	formulario: EntradaPlano["formulario"];
	/** O plano inteiro, para não repetir as outras lições. */
	plano: LicaoPlanejada[];
	licao: LicaoPlanejada;
	/** Os conceitos da lição, na ordem dela. */
	conceitos: ConceitoDoModulo[];
	/** O nível de cada conceito da lição. */
	niveis: Record<string, NivelConceito>;
	/** Os trechos do .extraido citados pelos conceitos da lição (até uns 40 mil caracteres no total); nenhum no escopo livre. */
	trechos: TrechosDoConceito[];
	/** Os trechos mandados, como referências: a lista que validarLicao usa para conferir as referências dos blocos. */
	referencias: Referencia[];
}

export interface EntradaModelo {
	plano: EntradaPlano;
	/** Uma por lição do plano, na ordem; só quando o plano foi passado. */
	licoes?: EntradaLicao[];
	/** Os materiais prontos (com o hash) que algum conceito do módulo cita: o materiaisUsados do módulo gerado. Nenhum no escopo livre. */
	materiaisUsados: ArquivoDoCurso[];
}

export interface OpcoesEntradaModelo {
	/** As lições do plano já conferidas (validarPlano): com ele, a saída traz a mensagem de cada lição. */
	plano?: readonly LicaoPlanejada[];
	/** O formulário (informações específicas e observações). */
	pedido?: Pick<PedidoModulo, "informacoes" | "observacoes">;
	/** Os caracteres dos trechos por lição; sem ele, LIMITE_TRECHOS_LICAO (40 mil). */
	limiteTrechos?: number;
}

/**
 * Junta o que vai na mensagem dos modelos do módulo (docs/modulos.md, "A
 * geração"). O plano: o nome, a prova, o escopo, o tipo e o motivo do curso;
 * o nome, o objetivo, o tipo e as horas do módulo e quantas lições
 * (licoesPorHoras); os conceitos do módulo, na ordem dele, com o nome, a
 * descrição e a prioridade do mapa da matéria, o nível (niveisDoModulo, do
 * diagnóstico concluído) e os locais do material que os citam; e o
 * formulário. Com `plano`, também a mensagem de cada lição: o plano inteiro,
 * a lição, os conceitos dela com os níveis e os trechos do .extraido citados
 * por eles (trechosDosConceitos: até `limiteTrechos` no total, divididos por
 * igual entre os conceitos da lição), e esses trechos como referências para
 * validarLicao. No escopo livre, sem locais nem trechos (como no
 * diagnóstico). Um conceito que não está mais no mapa vai com o id no lugar
 * do nome, descrição vazia e prioridade normal. Curso que não está pronto, ou
 * módulo que não está no esqueleto, ErroModulo.
 */
export async function entradaDoModelo(dados: string, materia: string, curso: string | Curso, modulo: string, opcoes: OpcoesEntradaModelo = {}): Promise<EntradaModelo> {
	const atual = typeof curso === "string" ? await lerCurso(dados, materia, curso) : curso;
	const doEsqueleto: ModuloDoEsqueleto = moduloDoEsqueleto(atual, modulo);
	const objetivo = atual.objetivo;
	if (!objetivo) throw new ErroModulo("Falta a etapa Objetivo do curso (o escopo e o tipo).");
	const comMaterial = objetivo.escopo !== "livre";
	const mapa = await lerMapa(dados, materia);
	const doMapa = new Map(mapa.conceitos.map((conceito) => [conceito.id, conceito]));
	const niveis = niveisDoModulo(atual.diagnostico, doEsqueleto);
	const referenciasDe = (id: string): Referencia[] => (comMaterial ? (doMapa.get(id)?.referencias ?? []) : []);
	const conceitos: ConceitoDoModulo[] = doEsqueleto.conceitos.map((id) => {
		const conceito = doMapa.get(id);
		const locais: LocalDoConceito[] = [];
		for (const referencia of referenciasDe(id)) {
			if (!locais.some((local) => local.arquivo === referencia.arquivo && local.local === referencia.local)) locais.push({ arquivo: referencia.arquivo, local: referencia.local });
		}
		return { id, nome: conceito?.nome ?? id, descricao: conceito?.descricao ?? "", prioridade: conceito?.prioridade ?? "normal", nivel: niveis[id]!, locais };
	});
	const informacoes = opcoes.pedido?.informacoes?.trim();
	const observacoes = opcoes.pedido?.observacoes?.trim();
	const plano: EntradaPlano = {
		curso: { nome: atual.nome, ...(atual.basico?.prova ? { prova: atual.basico.prova } : {}), escopo: objetivo.escopo, tipo: objetivo.tipo, motivo: objetivo.motivo },
		modulo: { id: doEsqueleto.id, nome: doEsqueleto.nome, objetivo: doEsqueleto.objetivo, tipo: doEsqueleto.tipo, horas: doEsqueleto.horas },
		licoes: licoesPorHoras(doEsqueleto.horas),
		conceitos,
		formulario: { ...(informacoes ? { informacoes } : {}), ...(observacoes ? { observacoes } : {}) },
	};

	const citados = new Set(conceitos.flatMap((conceito) => conceito.locais.map((local) => local.arquivo)));
	const materiaisUsados = citados.size > 0 ? (await materiaisProntos(dados, materia)).filter((item) => citados.has(item.arquivo)) : [];
	if (!opcoes.plano) return { plano, materiaisUsados };

	const limite = opcoes.limiteTrechos ?? LIMITE_TRECHOS_LICAO;
	const porId = new Map(conceitos.map((conceito) => [conceito.id, conceito]));
	const todoPlano = structuredClone([...opcoes.plano]) as LicaoPlanejada[];
	const licoes: EntradaLicao[] = [];
	for (const licao of todoPlano) {
		const daLicao = licao.conceitos.filter((id) => porId.has(id));
		let trechos: TrechosDoConceito[] = daLicao.map((id) => ({ id, trechos: [] }));
		const referencias: Referencia[] = [];
		if (comMaterial && daLicao.length > 0) {
			trechos = await trechosDosConceitos(
				dados,
				materia,
				daLicao.map((id) => ({ id, referencias: referenciasDe(id) })),
				{ porConceito: Math.ceil(limite / daLicao.length), total: limite },
			);
			for (const doConceito of trechos) {
				for (const trecho of doConceito.trechos) {
					const referencia = referenciasDe(doConceito.id).find((item) => item.arquivo === trecho.arquivo && item.local === trecho.local);
					if (referencia && !referencias.some((ja) => ja.arquivo === referencia.arquivo && ja.local === referencia.local)) {
						referencias.push({ arquivo: referencia.arquivo, local: referencia.local, trecho: referencia.trecho });
					}
				}
			}
		}
		licoes.push({
			curso: plano.curso,
			modulo: plano.modulo,
			formulario: plano.formulario,
			plano: todoPlano,
			licao,
			conceitos: daLicao.map((id) => porId.get(id)!),
			niveis: Object.fromEntries(daLicao.map((id) => [id, niveis[id]!])),
			trechos,
			referencias,
		});
	}
	return { plano, licoes, materiaisUsados };
}
