// Os módulos do curso gerados sob demanda (item 6, parte A, docs/modulos.md).
// Arquivo do projeto, não do learn. As regras (o próximo módulo, o nível dos
// conceitos, o conserto do plano, a conferência das lições) e o disco ficam em
// ../lib/modulo-tipos.ts e ../lib/modulos.ts; aqui ficam:
// - a ponte com a tela (painel "modulos", docs/ponte-de-eventos.md): listar,
//   gerar, aguardar, cancelar e abrir; a extensão responde com "estado",
//   "modulo" e "erro", sempre passageiros (gravar: false). Uma trava por
//   matéria para todo ler-gravar dos módulos;
// - a geração: espera os materiais mandados pelo formulário ficarem prontos
//   (os avisos "materiais:pronto", ou a varredura dos materiais prontos), faz
//   o plano (../prompts/modulo-plano.md) e depois uma chamada por lição
//   (../prompts/modulo-licao.md), em sequência, pelo ctx.modelRegistry do pi,
//   como o diagnóstico e o esqueleto (extensions/cursos.ts): as chamadas vão
//   fora da trava, com uma nova tentativa se a resposta não vier no formato
//   (validarPlano, validarLicao), e o módulo é gravado dentro dela
//   (gravarModuloGerado), substituindo a versão anterior só no fim. Uma
//   geração por curso de cada vez; cancelar para a geração e o que estava
//   gravado fica;
// - o estado de cada módulo na tela (a_gerar, esperando_materiais,
//   planejando, escrevendo, gerado, aguardando_material, erro), com o próximo
//   módulo e o aviso de material novo nos que aguardam;
// - a ferramenta só de leitura do professor, ler_modulo. Numa conversa de
//   caderno, ela fica na matéria da conversa.
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type Curso, ErroCurso, type Escopo, lerCurso, materiaisProntos, type TipoCurso } from "../lib/cursos.ts";
import type { PromptUsado } from "../lib/diagnostico.ts";
import { NOMES_TIPO_MODULO } from "../lib/esqueleto.ts";
import { ErroMapa, lerMapa } from "../lib/mapa.ts";
import { arquivoMateria, ErroMaterias } from "../lib/materias.ts";
import {
	type AcoesModulos,
	type Bloco,
	type ConceitoDoModulo,
	type EntradaLicao,
	type EntradaPlano,
	ErroModulo,
	type EstadoModuloNaTela,
	FORMATO_DO_NIVEL,
	type FormatoExplicacao,
	type Licao,
	lerModulo,
	materialNovo,
	type MensagensModulos,
	type Modulo,
	type NivelConceito,
	PAINEL_MODULOS,
	type PedidoModulo,
	podeGerar,
	proximoModulo,
	resumoDoModulo,
	situacoesDoCurso,
	entradaDoModelo,
	gravarModuloGerado,
	marcarAguardando,
	validarLicao,
	validarPlano,
} from "../lib/modulos.ts";
import { hashDoPrompt, pedirJson, type RegistroCursos } from "./cursos.ts";
import { arquivoDoAviso, lerPromptMapeador } from "./mapa.ts";
import { materiaDaConversa } from "./notas.ts";

/** O prompt do plano do módulo (frontmatter com o modelo e o prompt no corpo, como o mapeador.md). */
export const CAMINHO_PROMPT_PLANO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "modulo-plano.md");

/** O prompt de cada lição (mesmo formato). */
export const CAMINHO_PROMPT_LICAO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "modulo-licao.md");

/** Quanto a geração espera os materiais do formulário ficarem prontos antes de desistir. */
export const TEMPO_ESPERA_MATERIAIS_MS = 30 * 60_000;

/** De quanto em quanto tempo a espera confere os materiais prontos (além dos avisos "materiais:pronto"). */
export const INTERVALO_VARREDURA_MS = 5_000;

/** O teto de tokens da resposta (o modelo pode raciocinar antes de responder). */
const MAX_TOKENS_PLANO = 16_000;
const MAX_TOKENS_LICAO = 32_000;

/** Até quantos caracteres ler_modulo devolve de uma vez (as explicações vão inteiras). */
const LIMITE_LEITURA = 100_000;

const ACOES: ReadonlyArray<keyof AcoesModulos> = ["listar", "gerar", "aguardar", "cancelar", "abrir"];

interface DadosAcao {
	materia?: unknown;
	curso?: unknown;
	modulo?: unknown;
	pedido?: unknown;
	informacoes?: unknown;
	observacoes?: unknown;
	materiaisNovos?: unknown;
	nota?: unknown;
}

const FRASES: Record<keyof AcoesModulos | "ler", string> = {
	listar: "listar os módulos",
	gerar: "gerar o módulo",
	aguardar: "marcar o módulo como aguardando material",
	cancelar: "parar a geração do módulo",
	abrir: "abrir o módulo",
	ler: "ler o módulo",
};

const mensagemDe = (erro: unknown, acao: keyof typeof FRASES) =>
	erro instanceof ErroCurso || erro instanceof ErroMapa || erro instanceof ErroMaterias ? erro.message : `Não consegui ${FRASES[acao]}: ${(erro as Error).message}`;

/**
 * A mensagem "estado" com o próximo módulo do curso (proximoModulo: o
 * primeiro que não está gerado nem aguardando; null com todos gerados ou
 * aguardando). MensagemEstadoModulos ainda não tem o campo.
 */
export type MensagemEstado = MensagensModulos["estado"] & { proximo: string | null };

// --- O modelo --------------------------------------------------------------------

type Modelo = NonNullable<ReturnType<RegistroCursos["find"]>>;

/** A geração foi cancelada (pelo Parar ou pelo fim da sessão): nada de erro na tela. */
class Cancelado extends Error {
	constructor() {
		super("cancelado");
		this.name = "Cancelado";
	}
}

/** O prompt lido: o modelo, as instruções e o nome do arquivo com o hash do conteúdo (para o evento gerou_modulo). */
interface PromptLido {
	modelo: string;
	instrucoes: string;
	usado: PromptUsado;
}

async function lerPrompt(caminho: string): Promise<PromptLido> {
	let conteudo: string;
	try {
		conteudo = await readFile(caminho, "utf8");
	} catch (erro) {
		throw new ErroModulo(`Não consegui ler o prompt ${caminho}: ${(erro as Error).message}`);
	}
	return { ...lerPromptMapeador(conteudo, caminho), usado: { nome: basename(caminho), hash: hashDoPrompt(conteudo) } };
}

/** "provedor/id" (o id pode ter barras) no registro do pi, com credencial. */
function resolverModelo(registro: RegistroCursos, nome: string, para: string): Modelo {
	const barra = nome.indexOf("/");
	const provedor = barra > 0 ? nome.slice(0, barra).trim() : "";
	const id = barra > 0 ? nome.slice(barra + 1).trim() : "";
	if (!provedor || !id) throw new ErroModulo(`O modelo ${para} "${nome}" não está no formato provedor/id (por exemplo openrouter/openai/gpt-6.1-sol).`);
	const modelo = registro.find(provedor, id);
	if (!modelo) throw new ErroModulo(`O modelo ${para} "${nome}" não existe no registro de modelos do pi (provedor "${provedor}", id "${id}").`);
	if (!registro.hasConfiguredAuth(modelo)) {
		throw new ErroModulo(`O modelo ${para} "${nome}": o provedor "${provedor}" não tem credencial. Defina a variável de ambiente do provedor (por exemplo OPENROUTER_API_KEY) e reinicie o app.`);
	}
	return modelo;
}

/**
 * O objeto JSON da resposta, tolerando ```json em volta do texto inteiro ou
 * texto antes e depois. Diferente do objetoDaResposta de cursos.ts, uma cerca
 * ``` dentro das strings do JSON (os blocos de código das lições) não é
 * tomada pela cerca de fora. Fora disso, um Error com o motivo.
 */
export function objetoDoTexto(texto: string): unknown {
	let candidato = texto.trim();
	const cercado = /^```[a-z]*[ \t]*\r?\n([\s\S]*)\r?\n?```$/i.exec(candidato)?.[1];
	if (cercado !== undefined) candidato = cercado.trim();
	if (!candidato.startsWith("{")) {
		const inicio = candidato.indexOf("{");
		const fim = candidato.lastIndexOf("}");
		if (inicio < 0 || fim < inicio) throw new Error("a resposta não tem um objeto JSON");
		candidato = candidato.slice(inicio, fim + 1);
	}
	try {
		return JSON.parse(candidato);
	} catch (erro) {
		throw new Error(`o JSON está inválido (${(erro as Error).message})`);
	}
}

// --- As mensagens aos modelos ------------------------------------------------------

const ESCOPOS: Record<Escopo, string> = {
	so_material: "só o material (o módulo só ensina e cobra o que está no material; o que for além é complemento)",
	material_base: "o material como base, podendo ir além",
	livre: "livre (sem depender de material)",
};
const TIPOS: Record<TipoCurso, string> = { teorico: "teórico", aplicado: "aplicado", misto: "misto (teoria e aplicação)" };
const NOMES_NIVEL: Record<NivelConceito, string> = { iniciante: "iniciante", intermediario: "intermediário", domina: "domina" };
const NOMES_FORMATO: Record<FormatoExplicacao, string> = {
	exemplo_resolvido: "exemplo resolvido completo",
	exemplo_incompleto: "exemplo com passos para completar",
	problema_aberto: "problema aberto",
	conceito: "apresentação do conceito",
};

/** 7, 6,5: o número com vírgula, para os textos. */
const numeroComVirgula = (numero: number) => String(numero).replace(".", ",");

/** As linhas do curso, do módulo e do formulário, comuns às duas mensagens. */
function linhasDoCurso(entrada: Pick<EntradaPlano, "curso" | "modulo" | "formulario">): string[] {
	const { curso, modulo, formulario } = entrada;
	return [
		`Curso: ${curso.nome}`,
		...(curso.prova ? [`Prova: ${curso.prova}`] : []),
		`Tipo do curso: ${TIPOS[curso.tipo] ?? curso.tipo}`,
		`Escopo: ${ESCOPOS[curso.escopo] ?? curso.escopo}`,
		`Motivo do aluno: ${curso.motivo || "(não disse)"}`,
		`Módulo: ${modulo.nome} (${modulo.id})`,
		`Objetivo do módulo: ${modulo.objetivo || "(sem objetivo)"}`,
		`Tipo do módulo: ${NOMES_TIPO_MODULO[modulo.tipo] ?? modulo.tipo}`,
		`Horas do módulo: ${numeroComVirgula(modulo.horas)} h`,
		...(formulario.informacoes ? [`Informações específicas do aluno para este módulo:\n${formulario.informacoes}`] : []),
		...(formulario.observacoes ? [`Observações do aluno para este módulo:\n${formulario.observacoes}`] : []),
	];
}

/** As linhas de um conceito (nome, descrição, prioridade, nível com o formato da explicação). */
function linhasDoConceito(conceito: ConceitoDoModulo): string[] {
	return [
		`<conceito id=${JSON.stringify(conceito.id)}>`,
		`Nome: ${conceito.nome}`,
		`Descrição: ${conceito.descricao || "(sem descrição)"}`,
		`Prioridade: ${conceito.prioridade}`,
		`Nível do aluno: ${NOMES_NIVEL[conceito.nivel] ?? conceito.nivel} (explicação no formato ${FORMATO_DO_NIVEL[conceito.nivel]}: ${NOMES_FORMATO[FORMATO_DO_NIVEL[conceito.nivel]]})`,
	];
}

/**
 * A mensagem do modelo do plano (docs/modulos.md, "A geração", 2): o curso,
 * o módulo, quantas lições, o formulário e os conceitos do módulo com o nível
 * e, nos escopos com material, os locais do material que os citam.
 */
export function mensagemDoPlano(entrada: EntradaPlano): string {
	const comMaterial = entrada.curso.escopo !== "livre";
	const blocos = entrada.conceitos.map((conceito) => {
		const linhas = linhasDoConceito(conceito);
		if (comMaterial) {
			if (conceito.locais.length === 0) linhas.push("Locais do material: nenhum local do material cita este conceito.");
			else linhas.push("Locais do material que tratam dele:", ...conceito.locais.map((local) => `- ${local.arquivo}, ${local.local}`));
		}
		linhas.push("</conceito>");
		return linhas.join("\n");
	});
	return [
		...linhasDoCurso(entrada),
		`Lições pedidas: exatamente ${entrada.licoes}.`,
		`Conceitos do módulo (${entrada.conceitos.length}, na ordem do módulo):\n\n${blocos.join("\n\n")}`,
	].join("\n\n");
}

/**
 * A mensagem do modelo de uma lição (docs/modulos.md, "A geração", 3): o
 * curso, o módulo, o formulário, o plano inteiro, a lição com o roteiro e os
 * conceitos dela com o nível e, nos escopos com material, os trechos do
 * .extraido citados por eles.
 */
export function mensagemDaLicao(entrada: EntradaLicao): string {
	const comMaterial = entrada.curso.escopo !== "livre";
	const plano = entrada.plano.map(
		(licao, indice) =>
			`${indice + 1}. ${licao.id}, ${JSON.stringify(licao.titulo)}: ${licao.objetivo || "(sem objetivo)"} Conceitos: ${licao.conceitos.join(", ")}. Roteiro: ${licao.roteiro.join(", ")}.`,
	);
	const { licao } = entrada;
	const trechosDe = new Map(entrada.trechos.map((item) => [item.id, item.trechos]));
	const blocos = entrada.conceitos.map((conceito) => {
		const linhas = linhasDoConceito(conceito);
		if (comMaterial) {
			const trechos = trechosDe.get(conceito.id) ?? [];
			if (trechos.length === 0) linhas.push("Trechos do material: nenhum trecho do material cita este conceito.");
			else
				linhas.push(
					"Trechos do material:",
					...trechos.map(
						(trecho) =>
							`<trecho arquivo=${JSON.stringify(trecho.arquivo)} local=${JSON.stringify(trecho.local)}>\n${trecho.texto.trim()}${trecho.cortado ? "\n[… cortado]" : ""}\n</trecho>`,
					),
				);
		}
		linhas.push("</conceito>");
		return linhas.join("\n");
	});
	return [
		...linhasDoCurso(entrada),
		`Plano do módulo (${plano.length} lições):\n${plano.join("\n")}`,
		[
			`Lição a escrever: ${licao.id}, ${JSON.stringify(licao.titulo)}`,
			`Objetivo da lição: ${licao.objetivo || "(sem objetivo)"}`,
			`Roteiro (${licao.roteiro.length} blocos, nesta ordem): ${licao.roteiro.map((tipo, indice) => `${indice + 1}. ${tipo}`).join("; ")}`,
		].join("\n"),
		`Conceitos da lição (${blocos.length}):\n\n${blocos.join("\n\n")}`,
	].join("\n\n");
}

// --- Texto para o professor ----------------------------------------------------

const NOMES_TIPO_BLOCO: Record<Bloco["tipo"], string> = {
	explicacao: "Explicação",
	verificacao: "Verificação",
	alternativa: "Questão de alternativa",
	dissertativa: "Questão dissertativa",
};

const LETRAS = "ABCDEFGHIJ";

/** As linhas de um bloco para o professor; o gabarito (respostas, alternativa correta, confusões, rubrica, resposta-modelo) só com `comGabarito`. */
function linhasDoBloco(bloco: Bloco, nomeDe: (id: string) => string, comGabarito: boolean): string[] {
	const extras: string[] = [];
	if (bloco.tipo === "explicacao") extras.push(NOMES_FORMATO[bloco.formato] ?? bloco.formato, ...(bloco.complemento ? ["complemento: vai além do material"] : []));
	const linhas = [`### ${bloco.id} · ${NOMES_TIPO_BLOCO[bloco.tipo]}${extras.length ? ` (${extras.join("; ")})` : ""}`, `Conceitos: ${bloco.conceitos.map(nomeDe).join(", ")}.`];
	const referencias = "referencias" in bloco ? bloco.referencias : [];
	if (bloco.tipo === "explicacao") linhas.push("", bloco.texto);
	else if (bloco.tipo === "verificacao") {
		linhas.push(`Pergunta: ${bloco.pergunta}`);
		if (comGabarito) linhas.push(`Resposta esperada: ${bloco.respostaEsperada}`);
	} else {
		if (bloco.contexto) linhas.push("Contexto:", bloco.contexto);
		linhas.push(`Pergunta: ${bloco.enunciado}`);
		if (bloco.tipo === "alternativa") {
			for (const [indice, alternativa] of bloco.alternativas.entries()) {
				const letra = LETRAS[indice] ?? String(indice + 1);
				const marca = comGabarito ? (alternativa.correta ? " [correta]" : alternativa.confusao ? ` [errada; confusão: ${alternativa.confusao}]` : "") : "";
				linhas.push(`${letra}) ${alternativa.texto}${marca}`);
			}
			if (comGabarito && bloco.explicacao) linhas.push(`Explicação: ${bloco.explicacao}`);
		} else if (comGabarito) {
			linhas.push(
				"Rubrica:",
				...bloco.rubrica.map((item) => `- ${item.criterio} (${numeroComVirgula(item.pontos)} ponto${item.pontos === 1 ? "" : "s"}): ${item.descricao || "(sem descrição)"}`),
			);
			if (bloco.respostaModelo) linhas.push(`Resposta-modelo: ${bloco.respostaModelo}`);
		}
	}
	if (referencias.length) linhas.push(`Referências: ${referencias.map((referencia) => `${referencia.arquivo}, ${referencia.local}`).join("; ")}.`);
	return linhas;
}

/**
 * O texto de ler_modulo: o módulo (nome do esqueleto, situação), as lições
 * (título, objetivo, conceitos) e os blocos em texto, com as explicações
 * inteiras. As questões e as verificações vão sem o gabarito, a menos que
 * `comGabarito` seja verdadeiro.
 */
export function textoDoModulo(modulo: Modulo, extra: { nome?: string; nomeDe?: (id: string) => string; comGabarito?: boolean } = {}): string {
	const nomeDe = extra.nomeDe ?? ((id: string) => id);
	const comGabarito = extra.comGabarito === true;
	const linhas = [`# Módulo ${modulo.id}${extra.nome ? `: ${extra.nome}` : ""} (curso ${modulo.curso}, matéria ${modulo.materia})`];
	if (modulo.pedido?.informacoes) linhas.push(`Informações específicas do aluno: ${modulo.pedido.informacoes}`);
	if (modulo.pedido?.observacoes) linhas.push(`Observações do aluno: ${modulo.pedido.observacoes}`);
	if (modulo.situacao === "aguardando_material") {
		linhas.push(`Situação: aguardando material desde ${modulo.aguardando.desde.slice(0, 10)}${modulo.aguardando.nota ? ` (nota: ${modulo.aguardando.nota})` : ""}. O conteúdo ainda não foi gerado.`);
		return linhas.join("\n");
	}
	const resumo = resumoDoModulo(modulo);
	linhas.push(
		`Situação: gerado em ${modulo.geradoEm.slice(0, 10)}; ${resumo.licoes} ${resumo.licoes === 1 ? "lição" : "lições"}, ${resumo.blocos} blocos, ${resumo.questoes} ${resumo.questoes === 1 ? "questão" : "questões"}.`,
		comGabarito ? "Com o gabarito." : "Sem o gabarito (as respostas das questões e das verificações ficam de fora).",
	);
	for (const licao of modulo.licoes) {
		linhas.push("", `## Lição ${licao.id}: ${licao.titulo}`);
		if (licao.objetivo) linhas.push(`Objetivo: ${licao.objetivo}`);
		linhas.push(`Conceitos: ${licao.conceitos.map(nomeDe).join(", ")}.`);
		for (const bloco of licao.blocos) linhas.push("", ...linhasDoBloco(bloco, nomeDe, comGabarito));
	}
	const texto = linhas.join("\n");
	return texto.length > LIMITE_LEITURA ? `${texto.slice(0, LIMITE_LEITURA)}\n\n[… o módulo continua; mostrei os primeiros ${LIMITE_LEITURA} caracteres]` : texto;
}

// --- A extensão -----------------------------------------------------------------

export interface OpcoesModulos {
	/** O modulo-plano.md (nos testes, um prompt de mentira). */
	caminhoPromptPlano?: string;
	/** O modulo-licao.md (nos testes, um prompt de mentira). */
	caminhoPromptLicao?: string;
	/** Quanto esperar os materiais do formulário (nos testes, pouco). */
	tempoEsperaMateriaisMs?: number;
	/** De quanto em quanto tempo conferir os materiais prontos durante a espera. */
	intervaloVarreduraMs?: number;
}

/** Uma geração em andamento (uma por curso). */
interface Geracao {
	modulo: string;
	controle: AbortController;
	/** Só depois de conferida (podeGerar) a geração aparece no estado. */
	aceita: boolean;
	situacao: "esperando_materiais" | "planejando" | "escrevendo";
	/** Em esperando_materiais: os materiais do formulário que ainda não ficaram prontos. */
	esperando?: string[];
	/** Em escrevendo: a lição (a partir de 1) e quantas o plano tem. */
	licao?: number;
	licoes?: number;
	/** Acorda a espera dos materiais (um aviso "materiais:pronto" da matéria). */
	acordar?: () => void;
}

/** Os materiais do formulário: textos com barras normais, sem vazios e sem repetir. */
function listaDeMateriais(valor: unknown): string[] {
	if (!Array.isArray(valor)) return [];
	const limpos = (valor as unknown[]).filter((item): item is string => typeof item === "string").map((item) => item.trim().replace(/\\/g, "/")).filter(Boolean);
	return [...new Set(limpos)];
}

const textoOpcional = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : undefined);

export default function modulos(pi: ExtensionAPI, opcoes: OpcoesModulos = {}) {
	const caminhoPlano = opcoes.caminhoPromptPlano ?? CAMINHO_PROMPT_PLANO;
	const caminhoLicao = opcoes.caminhoPromptLicao ?? CAMINHO_PROMPT_LICAO;
	const tempoEspera = opcoes.tempoEsperaMateriaisMs ?? TEMPO_ESPERA_MATERIAIS_MS;
	const intervalo = opcoes.intervaloVarreduraMs ?? INTERVALO_VARREDURA_MS;
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	let registro: RegistroCursos | undefined;
	/** Uma trava por matéria: cada ler-gravar dos módulos espera o anterior. */
	const travas = new Map<string, Promise<unknown>>();
	/** As gerações em andamento, por "matéria/curso" (uma por curso). */
	const geracoes = new Map<string, Geracao>();
	/** A frase da última geração que falhou, por "matéria/curso/módulo", até a próxima ação nele. */
	const erros = new Map<string, string>();
	/** Os cursos cujo estado a tela pediu, por matéria: recebem o estado de novo quando um material chega ou sai. */
	const vistos = new Map<string, Set<string>>();

	const daSessao = () => (sessao ? { sessao } : {});
	const chaveDo = (materia: string, curso: string) => `${materia}/${curso}`;
	const chaveDoModulo = (materia: string, curso: string, modulo: string) => `${materia}/${curso}/${modulo}`;

	function mostrar(acao: "estado", dados: MensagemEstado): void;
	function mostrar(acao: "modulo", dados: MensagensModulos["modulo"]): void;
	function mostrar(acao: "erro", dados: MensagensModulos["erro"]): void;
	function mostrar(acao: keyof MensagensModulos, dados: unknown): void {
		pi.events.emit("interface:mostrar", { painel: PAINEL_MODULOS, acao, dados, gravar: false });
	}

	/** Roda `tarefa` na trava da matéria (depois da anterior, mesmo que ela tenha falhado). */
	const naTrava = <T>(materia: string, tarefa: () => Promise<T>): Promise<T> => {
		const resultado = (travas.get(materia) ?? Promise.resolve()).then(tarefa, tarefa);
		travas.set(materia, resultado.catch(() => undefined));
		return resultado;
	};

	/** A matéria existe (o materia.json)? O id vem da tela; nunca cria pasta solta. */
	const materiaExiste = async (dados: string, materia: string) => {
		if (!/^[a-z0-9-]+$/.test(materia)) return false;
		try {
			await stat(arquivoMateria(dados, materia));
			return true;
		} catch {
			return false;
		}
	};

	/**
	 * O estado de todos os módulos do curso, na ordem do esqueleto: a geração
	 * em andamento, o erro da última geração (com os dados da versão gravada,
	 * quando há), o arquivo ilegível (erro), o gravado (gerado ou aguardando,
	 * com materialNovo) ou a_gerar. Curso que não está pronto: nenhum módulo.
	 */
	const estadoDoCurso = async (dados: string, materia: string, curso: string): Promise<{ modulos: EstadoModuloNaTela[]; proximo: string | null }> => {
		const atual = await lerCurso(dados, materia, curso);
		if (atual.situacao !== "pronto" || !atual.esqueleto) return { modulos: [], proximo: null };
		const lidos = await situacoesDoCurso(dados, materia, curso);
		const algumAguardando = Object.values(lidos.modulos).some((modulo) => modulo.situacao === "aguardando_material");
		const prontos = algumAguardando ? await materiaisProntos(dados, materia) : [];
		const geracao = geracoes.get(chaveDo(materia, atual.id));
		const lista = atual.esqueleto.modulos.map(({ id }): EstadoModuloNaTela => {
			if (geracao?.aceita && geracao.modulo === id) {
				return {
					id,
					situacao: geracao.situacao,
					...(geracao.situacao === "esperando_materiais" ? { esperando: [...(geracao.esperando ?? [])] } : {}),
					...(geracao.situacao === "escrevendo" ? { licao: geracao.licao, licoes: geracao.licoes } : {}),
				};
			}
			const ilegivel = lidos.erros.find((erro) => erro.modulo === id);
			if (ilegivel) return { id, situacao: "erro", mensagem: ilegivel.mensagem };
			const gravado = lidos.modulos[id];
			let doGravado: Partial<EstadoModuloNaTela> = {};
			if (gravado?.situacao === "gerado") {
				const resumo = resumoDoModulo(gravado);
				doGravado = { geradoEm: gravado.geradoEm, custo: gravado.custo, licoesGeradas: resumo.licoes, blocos: resumo.blocos, questoes: resumo.questoes };
			} else if (gravado?.situacao === "aguardando_material") {
				doGravado = { nota: gravado.aguardando.nota, materialNovo: materialNovo(gravado.aguardando, prontos) };
			}
			const erro = erros.get(chaveDoModulo(materia, atual.id, id));
			if (erro) return { id, situacao: "erro", mensagem: erro, ...doGravado };
			if (gravado) return { id, situacao: gravado.situacao, ...doGravado };
			return { id, situacao: "a_gerar" };
		});
		return { modulos: lista, proximo: proximoModulo(atual.esqueleto, lidos.situacoes) };
	};

	/** Manda o estado do curso. Chamado dentro da trava, para um estado velho nunca chegar depois de um novo. */
	const mostrarEstado = async (dados: string, materia: string, curso: string, pedido?: string) => {
		const estado = await estadoDoCurso(dados, materia, curso);
		const doCurso = vistos.get(materia) ?? new Set<string>();
		doCurso.add(curso);
		vistos.set(materia, doCurso);
		mostrar("estado", { materia, curso, modulos: estado.modulos, proximo: estado.proximo, ...(pedido ? { pedido } : {}) });
	};

	/** O estado pela trava; um erro vira "erro" para a tela. Depois do fim da sessão, nada. */
	const mostrarNaTrava = (dados: string, materia: string, curso: string, ao: string) =>
		naTrava(materia, async () => {
			if (pastaDados !== dados) return;
			await mostrarEstado(dados, materia, curso);
		}).catch((erro: unknown) => mostrar("erro", { mensagem: mensagemDe(erro, "listar"), ao, materia, curso }));

	/**
	 * Espera os materiais do formulário aparecerem entre os materiais prontos
	 * da matéria (manifesto no .extraido), acordando a cada aviso
	 * "materiais:pronto" da matéria ou a cada `intervalo`. O estado mostra os
	 * que faltam. Passado o tempo limite, ErroModulo; cancelada, Cancelado.
	 */
	const esperarMateriais = async (dados: string, materia: string, curso: string, geracao: Geracao, nomes: readonly string[]) => {
		const sinal = geracao.controle.signal;
		const limite = Date.now() + tempoEspera;
		for (;;) {
			if (sinal.aborted) throw new Cancelado();
			const prontos = new Set((await materiaisProntos(dados, materia)).map((item) => item.arquivo));
			const faltam = nomes.filter((nome) => !prontos.has(nome));
			if (faltam.length === 0) return;
			if (JSON.stringify(faltam) !== JSON.stringify(geracao.esperando)) {
				geracao.situacao = "esperando_materiais";
				geracao.esperando = faltam;
				await mostrarNaTrava(dados, materia, curso, "gerar");
			}
			const resta = limite - Date.now();
			if (resta <= 0) {
				const minutos = Math.max(1, Math.round(tempoEspera / 60_000));
				throw new ErroModulo(
					`${faltam.length === 1 ? `O material ${faltam[0]} não ficou pronto` : `Os materiais ${faltam.join(", ")} não ficaram prontos`} em ${minutos} minuto${minutos === 1 ? "" : "s"} (o processamento falhou ou ainda não terminou). O módulo não foi gerado; confira os materiais da matéria e gere de novo.`,
				);
			}
			await new Promise<void>((resolver) => {
				const fim = () => {
					clearTimeout(relogio);
					sinal.removeEventListener("abort", fim);
					if (geracao.acordar === fim) geracao.acordar = undefined;
					resolver();
				};
				const relogio = setTimeout(fim, Math.min(intervalo, resta));
				sinal.addEventListener("abort", fim, { once: true });
				geracao.acordar = fim;
			});
		}
	};

	/**
	 * Gera o módulo (gerar): lê os prompts e resolve o modelo; dentro da
	 * trava, confere que o módulo pode ser gerado (podeGerar) e que o arquivo
	 * dele é legível, e manda o estado com o pedido (a geração aceita); fora
	 * dela, espera os materiais do formulário, faz o plano e depois cada lição,
	 * em sequência, mandando o estado a cada etapa; dentro da trava de novo,
	 * grava (gravarModuloGerado, que substitui a versão anterior e grava
	 * gerou_modulo) e manda o estado. Com erro antes de aceitar, o erro com o
	 * pedido; depois, o erro e o estado com o módulo em erro (o que estava
	 * gravado fica). Cancelada ou depois do fim da sessão, nada.
	 */
	const gerar = async (dados: string, materia: string, curso: string, modulo: string, dadosAcao: DadosAcao, pedido: string | undefined) => {
		const chave = chaveDo(materia, curso);
		const chaveModulo = chaveDoModulo(materia, curso, modulo);
		const emAndamento = geracoes.get(chave);
		if (emAndamento) {
			throw new ErroModulo(
				emAndamento.modulo === modulo
					? "Este módulo já está sendo gerado. Espere terminar (ou pare) antes de pedir de novo."
					: `O módulo ${emAndamento.modulo} deste curso está sendo gerado. Espere terminar (ou pare) antes de gerar outro.`,
			);
		}
		const geracao: Geracao = { modulo, controle: new AbortController(), aceita: false, situacao: "planejando" };
		geracoes.set(chave, geracao);
		const sinal = geracao.controle.signal;
		const comPedido = pedido ? { pedido } : {};
		const informacoes = textoOpcional(dadosAcao.informacoes);
		const observacoes = textoOpcional(dadosAcao.observacoes);
		const materiaisNovos = listaDeMateriais(dadosAcao.materiaisNovos);
		const doPedido: PedidoModulo = {
			...(informacoes ? { informacoes } : {}),
			...(observacoes ? { observacoes } : {}),
			...(materiaisNovos.length ? { materiaisNovos } : {}),
			pedidoEm: new Date().toISOString(),
		};
		let custo = 0;
		const comGasto = (mensagem: string) => (custo > 0 ? `${mensagem} Gasto das etapas anteriores: US$ ${custo.toFixed(4)}.` : mensagem);
		try {
			const promptPlano = await lerPrompt(caminhoPlano);
			const promptLicao = await lerPrompt(caminhoLicao);
			if (!registro) throw new ErroModulo("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo dos módulos.");
			const modeloPlano = resolverModelo(registro, promptPlano.modelo, "do plano do módulo");
			const modeloLicao = resolverModelo(registro, promptLicao.modelo, "das lições do módulo");

			await naTrava(materia, async () => {
				const atual = await lerCurso(dados, materia, curso);
				const { situacoes } = await situacoesDoCurso(dados, materia, curso);
				podeGerar(atual, situacoes, modulo);
				// Um arquivo ilegível no lugar é ErroModulo (gravarModuloGerado também recusaria no fim).
				await lerModulo(dados, materia, curso, modulo);
				if (materiaisNovos.length > 0) {
					const prontos = new Set((await materiaisProntos(dados, materia)).map((item) => item.arquivo));
					const faltam = materiaisNovos.filter((nome) => !prontos.has(nome));
					if (faltam.length > 0) {
						geracao.situacao = "esperando_materiais";
						geracao.esperando = faltam;
					}
				}
				geracao.aceita = true;
				erros.delete(chaveModulo);
				await mostrarEstado(dados, materia, curso, pedido);
			});

			if (materiaisNovos.length > 0) await esperarMateriais(dados, materia, curso, geracao, materiaisNovos);

			// O plano: uma chamada, fora da trava.
			if (sinal.aborted) throw new Cancelado();
			// Sem materiais para esperar, a aceitação já mandou o planejando.
			if (geracao.situacao !== "planejando") {
				geracao.situacao = "planejando";
				geracao.esperando = undefined;
				await mostrarNaTrava(dados, materia, curso, "gerar");
			}
			const entrada = await entradaDoModelo(dados, materia, curso, modulo, { pedido: doPedido });
			const plano = await pedirJson(
				registro,
				modeloPlano,
				promptPlano.instrucoes,
				mensagemDoPlano(entrada.plano),
				(texto) => validarPlano(objetoDoTexto(texto), { conceitosDoModulo: entrada.plano.conceitos.map((conceito) => conceito.id), licoes: entrada.plano.licoes, tipo: entrada.plano.curso.tipo }),
				sinal,
				{
					maxTokens: MAX_TOKENS_PLANO,
					formato: `{"licoes": [...]}, com ${entrada.plano.licoes} ${entrada.plano.licoes === 1 ? "lição" : "lições"}`,
					oQue: "o plano do módulo",
					depois: "O módulo não mudou.",
				},
			);
			custo += plano.custo;

			// As lições: uma chamada por lição, em sequência, cada uma com a nova tentativa do pedirJson.
			const comLicoes = await entradaDoModelo(dados, materia, curso, modulo, { pedido: doPedido, plano: plano.resultado });
			const entradas = comLicoes.licoes ?? [];
			const licoes: Licao[] = [];
			for (const [indice, entradaLicao] of entradas.entries()) {
				if (sinal.aborted) throw new Cancelado();
				geracao.situacao = "escrevendo";
				geracao.licao = indice + 1;
				geracao.licoes = entradas.length;
				await mostrarNaTrava(dados, materia, curso, "gerar");
				const escrita = await pedirJson(
					registro,
					modeloLicao,
					promptLicao.instrucoes,
					mensagemDaLicao(entradaLicao),
					(texto) => validarLicao(objetoDoTexto(texto), { licao: entradaLicao.licao, trechos: entradaLicao.referencias, escopo: entradaLicao.curso.escopo }).licao,
					sinal,
					{
						maxTokens: MAX_TOKENS_LICAO,
						formato: `{"blocos": [...]}, com um bloco por item do roteiro da lição ${entradaLicao.licao.id}`,
						oQue: `a lição ${indice + 1} de ${entradas.length} ("${entradaLicao.licao.titulo}")`,
						depois: "O módulo não mudou.",
					},
				);
				custo += escrita.custo;
				licoes.push(escrita.resultado);
			}

			await naTrava(materia, async () => {
				if (sinal.aborted) throw new Cancelado();
				if (geracoes.get(chave) === geracao) geracoes.delete(chave);
				const modelo = promptPlano.modelo === promptLicao.modelo ? promptPlano.modelo : `${promptPlano.modelo} (plano) e ${promptLicao.modelo} (lições)`;
				await gravarModuloGerado(
					dados,
					materia,
					curso,
					{ id: modulo, licoes, pedido: doPedido, modelo, custo, materiaisUsados: comLicoes.materiaisUsados },
					{ ...daSessao(), modelo, prompts: [promptPlano.usado, promptLicao.usado] },
				);
				await mostrarEstado(dados, materia, curso);
			});
		} catch (erro) {
			if (geracoes.get(chave) === geracao) geracoes.delete(chave);
			if (pastaDados !== dados || erro instanceof Cancelado || sinal.aborted) return;
			const mensagem = mensagemDe(erro, "gerar");
			if (!geracao.aceita) {
				mostrar("erro", { mensagem, ao: "gerar", materia, curso, modulo, ...comPedido });
				return;
			}
			erros.set(chaveModulo, comGasto(mensagem));
			mostrar("erro", { mensagem: comGasto(mensagem), ao: "gerar", materia, curso, modulo });
			await mostrarNaTrava(dados, materia, curso, "gerar");
		} finally {
			if (geracoes.get(chave) === geracao) geracoes.delete(chave);
			geracao.acordar = undefined;
		}
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
		registro = ctx.modelRegistry;
	});

	// Fim da sessão (sair, recarregar, trocar de conversa): as gerações em
	// andamento param (nada é gravado) e a cópia fica calada.
	pi.on("session_shutdown", () => {
		pastaDados = undefined;
		for (const geracao of geracoes.values()) geracao.controle.abort();
		geracoes.clear();
		erros.clear();
		vistos.clear();
	});

	/**
	 * Um material ficou pronto ou saiu: as gerações da matéria que esperam
	 * materiais conferem de novo, e os cursos da matéria que a tela viu e têm
	 * módulo aguardando recebem o estado (o materialNovo pode ter mudado).
	 */
	const avisoDeMaterial = (recebido: unknown) => {
		const dados = pastaDados;
		const aviso = arquivoDoAviso((recebido as { caminho?: unknown } | undefined)?.caminho);
		if (!dados || !aviso) return;
		const { materia } = aviso;
		for (const [chave, geracao] of geracoes) if (chave.startsWith(`${materia}/`)) geracao.acordar?.();
		for (const curso of vistos.get(materia) ?? []) {
			void naTrava(materia, async () => {
				if (pastaDados !== dados) return;
				const estado = await estadoDoCurso(dados, materia, curso);
				if (estado.modulos.some((modulo) => modulo.situacao === "aguardando_material")) mostrar("estado", { materia, curso, modulos: estado.modulos, proximo: estado.proximo });
			}).catch(() => undefined);
		}
	};
	pi.events.on("materiais:pronto", avisoDeMaterial);
	pi.events.on("materiais:removido", avisoDeMaterial);

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_MODULOS || !ACOES.includes(acao as keyof AcoesModulos)) return;
		const dadosAcao = (bruto ?? {}) as DadosAcao;
		const materia = dadosAcao.materia;
		if (typeof materia !== "string") return;
		// Sem session_start, esta cópia não é a da sessão (a carga a mais ao
		// recarregar o código, como em mapa.ts): ela fica calada, senão cada
		// ação seria feita em dobro (e o modelo, chamado em dobro).
		const dados = pastaDados;
		if (!dados) return;
		const ao = acao as keyof AcoesModulos;
		const pedido = typeof dadosAcao.pedido === "string" ? dadosAcao.pedido : undefined;
		const comPedido = pedido ? { pedido } : {};
		const curso = typeof dadosAcao.curso === "string" && dadosAcao.curso ? dadosAcao.curso : undefined;
		const modulo = typeof dadosAcao.modulo === "string" && dadosAcao.modulo ? dadosAcao.modulo : undefined;
		const comCurso = curso ? { curso } : {};
		const comModulo = modulo ? { modulo } : {};

		void (async () => {
			if (!(await materiaExiste(dados, materia))) {
				mostrar("erro", { mensagem: `Não achei a matéria "${materia}".`, ao, materia, ...comCurso, ...comModulo, ...comPedido });
				return;
			}
			if (!curso) {
				mostrar("erro", { mensagem: "Falta o id do curso.", ao, materia, ...comModulo, ...comPedido });
				return;
			}
			try {
				if (ao === "listar") {
					await naTrava(materia, () => mostrarEstado(dados, materia, curso, pedido));
					return;
				}
				if (!modulo) {
					mostrar("erro", { mensagem: "Falta o id do módulo.", ao, materia, curso, ...comPedido });
					return;
				}
				if (ao === "gerar") {
					await gerar(dados, materia, curso, modulo, dadosAcao, pedido);
				} else if (ao === "aguardar") {
					await naTrava(materia, async () => {
						const emAndamento = geracoes.get(chaveDo(materia, curso));
						if (emAndamento?.modulo === modulo) throw new ErroModulo("Este módulo está sendo gerado. Pare a geração antes de marcá-lo como aguardando material.");
						await marcarAguardando(dados, materia, curso, modulo, dadosAcao.nota, daSessao());
						erros.delete(chaveDoModulo(materia, curso, modulo));
						await mostrarEstado(dados, materia, curso, pedido);
					});
				} else if (ao === "cancelar") {
					const chave = chaveDo(materia, curso);
					const emAndamento = geracoes.get(chave);
					if (emAndamento?.modulo === modulo) {
						emAndamento.controle.abort();
						geracoes.delete(chave);
					}
					erros.delete(chaveDoModulo(materia, curso, modulo));
					await naTrava(materia, () => mostrarEstado(dados, materia, curso, pedido));
				} else if (ao === "abrir") {
					await naTrava(materia, async () => {
						const lido = await lerModulo(dados, materia, curso, modulo);
						if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
						mostrar("modulo", { materia, curso, modulo: lido });
					});
				}
			} catch (erro) {
				mostrar("erro", { mensagem: mensagemDe(erro, ao), ao, materia, curso, ...comModulo, ...comPedido });
			}
		})();
	});

	/** A matéria que a ferramenta lê: a da conversa, se ela for de um caderno; senão, a do parâmetro. */
	const escolherMateria = (pedida: string | undefined, entradas: Parameters<typeof materiaDaConversa>[0]): { materia: string } | { erro: string } => {
		const daConversa = materiaDaConversa(entradas);
		if (daConversa) {
			if (pedida && pedida !== daConversa) return { erro: `Esta conversa é do caderno "${daConversa}": os módulos de outras matérias ficam de fora aqui.` };
			return { materia: daConversa };
		}
		if (!pedida) return { erro: "Diga a matéria (o id, de listar_materias)." };
		return { materia: pedida };
	};

	pi.registerTool({
		name: "ler_modulo",
		label: "Ler módulo",
		description:
			"Read a generated module of a course (from ler_curso's skeleton: module ids m1, m2…): its lessons (title, goal, concepts) and every block as text, in order — the explanations in full (with their format: worked example, example with steps to complete, open problem or concept presentation, and whether it goes beyond the material), the comprehension checks and the questions (context, question, options), with the material references. By default the answer key is left out (expected answers, the correct option, the misconception behind each wrong option, rubrics and model answers); pass comGabarito: true only when you need it, e.g. to discuss a question the user already answered. A module not generated yet (or waiting for material) says so. In a notebook conversation, the subject is the conversation's. Read only: never change a module.",
		parameters: Type.Object({
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
			curso: Type.String({ description: "Course id (from ler_curso)." }),
			modulo: Type.String({ description: "Module id in the course skeleton (m1, m2…)." }),
			comGabarito: Type.Optional(Type.Boolean({ description: "Include the answer key. Default false." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			const { materia } = escolha;
			if (!(await materiaExiste(ctx.cwd, materia))) return { content: [{ type: "text", text: `Não achei a matéria "${materia}".` }], details: undefined, isError: true };
			try {
				const curso: Curso = await lerCurso(ctx.cwd, materia, params.curso);
				const doEsqueleto = curso.esqueleto?.modulos.find((item) => item.id === params.modulo);
				if (!doEsqueleto) throw new ErroModulo(`Não achei o módulo "${params.modulo}" no esqueleto do curso ${curso.id}.`);
				const lido = await lerModulo(ctx.cwd, materia, curso.id, params.modulo);
				if (!lido) {
					const gerando = geracoes.get(chaveDo(materia, curso.id))?.modulo === params.modulo;
					return {
						content: [{ type: "text", text: `O módulo ${params.modulo} (${doEsqueleto.nome}) ainda não foi gerado${gerando ? "; ele está sendo gerado agora" : ""}.` }],
						details: { materia, curso: curso.id, modulo: params.modulo, situacao: gerando ? "gerando" : "a_gerar" },
					};
				}
				const mapa = await lerMapa(ctx.cwd, materia);
				const nomes = new Map(mapa.conceitos.map((conceito) => [conceito.id, conceito.nome]));
				const texto = textoDoModulo(lido, { nome: doEsqueleto.nome, nomeDe: (id) => nomes.get(id) ?? id, comGabarito: params.comGabarito === true });
				return { content: [{ type: "text", text: texto }], details: { materia, curso: curso.id, modulo: lido.id, situacao: lido.situacao, comGabarito: params.comGabarito === true } };
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "ler") }], details: undefined, isError: true };
			}
		},
	});
}
