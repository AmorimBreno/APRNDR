// Os módulos do curso gerados sob demanda (item 6, parte A, docs/modulos.md).
// Arquivo do projeto, não do learn. As regras (o próximo módulo, o nível dos
// conceitos, o conserto do plano, a conferência das lições) e o disco ficam em
// ../lib/modulo-tipos.ts e ../lib/modulos.ts; aqui ficam:
// - a ponte com a tela (painel "modulos", docs/ponte-de-eventos.md): listar,
//   gerar, aguardar, cancelar, abrir e concluir; a extensão responde com "estado",
//   "modulo" e "erro", sempre passageiros (gravar: false). Uma trava por
//   matéria para todo ler-gravar dos módulos;
// - a geração: espera os materiais mandados pelo formulário ficarem prontos
//   (os avisos "materiais:pronto", ou a varredura dos materiais prontos), faz
//   o plano (../prompts/modulo-plano.md) e depois uma chamada por lição
//   (../prompts/modulo-licao.md), em sequência, pelo ctx.modelRegistry do pi,
//   como o diagnóstico e o esqueleto (extensions/cursos.ts). O system prompt
//   de cada chamada é o prompt e, depois dele, os arquivos da metodologia
//   (../metodo/, docs/modulos.md, "A metodologia em arquivos"): o plano leva a
//   estrutura da lição; cada lição, os de arquivosDeMetodo(roteiro); a
//   reescrita, o do tipo do bloco. As chamadas vão fora da trava, com uma nova
//   tentativa se a resposta não vier no formato, se o plano precisou de
//   conserto (conferirPlano: a nova tentativa leva os consertos; depois, vale
//   o consertado) ou se a lição não segue o esquema (validarLicao, com as
//   frases de problemasDaLicao; depois, o erro), e o módulo é gravado dentro dela
//   (gravarModuloGerado), substituindo a versão anterior só no fim. Uma
//   geração por curso de cada vez; cancelar para a geração e o que estava
//   gravado fica;
// - o estado de cada módulo na tela (a_gerar, esperando_materiais,
//   planejando, escrevendo, gerado, aguardando_material, erro), com o
//   concluido dos gerados, o módulo recomendado (proximo) e o aviso de
//   material novo nos que aguardam;
// - a ferramenta só de leitura do professor, ler_modulo. Numa conversa de
//   caderno, ela fica na matéria da conversa;
// - a escrita dos módulos (docs/escrita.md): o painel "escrita" (listar,
//   salvar e apagar as regras de escrita do Breno; mensagens "regras" e
//   "erro", gravar: false), com uma trava só para tudo que lê e grava o
//   aprendiz/escrita.json (esta extensão é a única que grava nele); no painel
//   "modulos", o retorno em cada bloco (o evento avaliou_bloco e, com
//   virarRegra, a regra) e a reescrita de um bloco (../prompts/modulo-bloco.md
//   com o arquivo da metodologia do tipo do bloco, fora da trava, com a nova
//   tentativa; uma operação por curso de cada vez,
//   junto das gerações). As regras que valem para a matéria entram nas
//   mensagens do plano, das lições e da reescrita do bloco;
// - as respostas das questões (docs/modulos.md, "Responder as questões"):
//   responder, corrigir e encerrar no painel "modulos". O quiz é conferido
//   aqui, sem modelo; a pergunta (../prompts/verificacao.md com a metodologia
//   pergunta.md) e a dissertativa (o corretor do diagnóstico,
//   corrigirPelaRubrica em cursos.ts) são conferidas pelo modelo fora da
//   trava, com temperatura 0; o fim da sessão cancela sem gravar, e a
//   conferência de uma resposta que mudou nesse meio-tempo (o módulo gerado
//   de novo, o bloco reescrito) é jogada fora. Toda mensagem "modulo" leva
//   corrigindo (os blocos em conferência agora), e o "estado" leva o
//   progresso de cada módulo gerado. Os eventos vão para o
//   aprendiz/eventos.jsonl pela ../lib/modulo-respostas.ts;
// - o feedback (docs/modulos.md, "O feedback"): a nota rápida de um bloco
//   (avaliar_bloco, o avaliou_bloco sem motivos nem texto), o retorno
//   detalhado (retorno, com o detalha opcional) e o questionário do fim da
//   lição (avaliar_licao, o avaliou_licao), na trava da matéria. A última
//   nota de cada bloco e o último questionário de cada lição ficam no
//   <módulo>.json (../lib/modulo-feedback.ts).
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type Curso, ErroCurso, type Escopo, lerCurso, materiaisProntos, type TipoCurso } from "../lib/cursos.ts";
import type { PromptUsado, TrechosDoConceito } from "../lib/diagnostico.ts";
import {
	type AcoesEscrita,
	type AcoesModulosEscrita,
	apagarRegra,
	type EntradaRegra,
	ErroEscrita,
	gravarBlocoReescrito,
	lerEscrita,
	type MensagensEscrita,
	type MotivoRetorno,
	NOMES_AVALIACAO,
	NOMES_MOTIVO,
	PAINEL_ESCRITA,
	registrarRetorno,
	regrasQueValem,
	salvarRegra,
	secaoDasRegras,
	type AvaliacaoBloco,
	validarRetorno,
} from "../lib/escrita.ts";
import { NOMES_TIPO_MODULO } from "../lib/esqueleto.ts";
import { type Evento, lerEventos } from "../lib/eventos.ts";
import { avaliacaoLida, gravarFeedback, registrarQuestionario } from "../lib/modulo-feedback.ts";
import {
	type AlvoConferencia,
	alvoParaCorrigir,
	type BlocoQuestao,
	type Conferencia,
	conferenciaVale,
	type Corretor,
	explicacoesAntes,
	gravarConferencia,
	gravarEncerrada,
	gravarResposta,
	progressoDoModulo,
	questaoDoModulo,
	validarAvaliacao,
} from "../lib/modulo-respostas.ts";
import { objetoJsonDoModelo } from "../lib/json-do-modelo.ts";
import { ErroMapa, lerMapa, PAINEL_MAPA } from "../lib/mapa.ts";
import { arquivoMateria, ErroMaterias, eventosAprendiz, eventosMateria } from "../lib/materias.ts";
import {
	type AcoesModulos,
	ARQUIVO_ESTRUTURA_LICAO,
	arquivoDeMetodo,
	arquivosDeMetodo,
	type Bloco,
	type ConsertoPlano,
	conferirPlano,
	itemDoRoteiro,
	roteiroDaLicao,
	type ModuloGerado,
	validarBloco,
	versaoDoBloco,
	concluirModulo,
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
} from "../lib/modulos.ts";
import {
	CAMINHO_PROMPT_CORRETOR,
	corrigirPelaRubrica,
	hashDoPrompt,
	instrucoesComMetodo,
	lerMetodo,
	type MetodoLido,
	PASTA_METODO,
	PedirDeNovo,
	pedirJson,
	type RegistroCursos,
	usadoComMetodo,
} from "./cursos.ts";
import { arquivoDoAviso, lerPromptMapeador } from "./mapa.ts";
import { materiaDaConversa } from "./notas.ts";

/** O prompt do plano do módulo (frontmatter com o modelo e o prompt no corpo, como o mapeador.md). */
export const CAMINHO_PROMPT_PLANO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "modulo-plano.md");

/** O prompt de cada lição (mesmo formato). */
export const CAMINHO_PROMPT_LICAO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "modulo-licao.md");

/** O prompt da reescrita de um bloco (mesmo formato). */
export const CAMINHO_PROMPT_BLOCO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "modulo-bloco.md");

/** O prompt que confere a pergunta rápida (bloco verificacao) (mesmo formato). */
export const CAMINHO_PROMPT_VERIFICACAO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "verificacao.md");

/** O arquivo da metodologia que a conferência da pergunta carrega (docs/modulos.md, "A metodologia em arquivos"). */
export const METODO_VERIFICACAO = ["pergunta.md"] as const;

/** Quanto a geração espera os materiais do formulário ficarem prontos antes de desistir. */
export const TEMPO_ESPERA_MATERIAIS_MS = 30 * 60_000;

/** De quanto em quanto tempo a espera confere os materiais prontos (além dos avisos "materiais:pronto"). */
export const INTERVALO_VARREDURA_MS = 5_000;

/** O teto de tokens da resposta (o modelo pode raciocinar antes de responder). */
const MAX_TOKENS_PLANO = 16_000;
const MAX_TOKENS_LICAO = 32_000;
const MAX_TOKENS_BLOCO = 16_000;
const MAX_TOKENS_VERIFICACAO = 8_000;

/** Até quantos caracteres ler_modulo devolve de uma vez (as explicações vão inteiras). */
const LIMITE_LEITURA = 100_000;

/** As ações da tela no painel modulos: as da lib (AcoesModulos) e as do retorno e da reescrita (AcoesModulosEscrita). */
type AcaoDaTela = keyof (AcoesModulos & AcoesModulosEscrita);

const ACOES: ReadonlyArray<AcaoDaTela> = [
	"listar",
	"gerar",
	"aguardar",
	"cancelar",
	"abrir",
	"concluir",
	"responder",
	"corrigir",
	"encerrar",
	"retorno",
	"reescrever_bloco",
	"avaliar_bloco",
	"avaliar_licao",
];

/** As ações que são de uma questão, e a nota rápida de um bloco: o erro leva o bloco. */
const ACOES_DA_QUESTAO: ReadonlyArray<AcaoDaTela> = ["responder", "corrigir", "encerrar", "avaliar_bloco"];

/** As ações do painel escrita. */
const ACOES_ESCRITA: ReadonlyArray<keyof AcoesEscrita> = ["listar", "salvar", "apagar"];

interface DadosAcao {
	materia?: unknown;
	curso?: unknown;
	modulo?: unknown;
	pedido?: unknown;
	informacoes?: unknown;
	observacoes?: unknown;
	materiaisNovos?: unknown;
	nota?: unknown;
	licao?: unknown;
	bloco?: unknown;
	avaliacao?: unknown;
	motivos?: unknown;
	texto?: unknown;
	virarRegra?: unknown;
	retorno?: unknown;
	confianca?: unknown;
	escolha?: unknown;
	naoSei?: unknown;
	tempoMs?: unknown;
	detalha?: unknown;
	notas?: unknown;
}

const FRASES: Record<AcaoDaTela | "ler", string> = {
	listar: "listar os módulos",
	gerar: "gerar o módulo",
	aguardar: "marcar o módulo como aguardando material",
	cancelar: "parar a geração do módulo",
	abrir: "abrir o módulo",
	concluir: "concluir o módulo",
	responder: "gravar a resposta",
	corrigir: "conferir a resposta",
	encerrar: "encerrar a questão",
	retorno: "gravar o retorno do bloco",
	reescrever_bloco: "reescrever o bloco",
	avaliar_bloco: "gravar a nota do bloco",
	avaliar_licao: "gravar o questionário da lição",
	ler: "ler o módulo",
};

const FRASES_ESCRITA: Record<keyof AcoesEscrita, string> = {
	listar: "ler as regras de escrita",
	salvar: "salvar a regra de escrita",
	apagar: "apagar a regra de escrita",
};

const mensagemDe = (erro: unknown, acao: keyof typeof FRASES) =>
	erro instanceof ErroCurso || erro instanceof ErroMapa || erro instanceof ErroMaterias ? erro.message : `Não consegui ${FRASES[acao]}: ${(erro as Error).message}`;

const mensagemDaEscrita = (erro: unknown, acao: keyof AcoesEscrita) =>
	erro instanceof ErroCurso || erro instanceof ErroMaterias ? erro.message : `Não consegui ${FRASES_ESCRITA[acao]}: ${(erro as Error).message}`;

/**
 * O estado de um módulo na tela com o aviso: os materiais do formulário que
 * entraram sem referências porque o mapa de conteúdo não terminou (durante a
 * geração e no módulo gerado, até a próxima ação nele). EstadoModuloNaTela
 * ainda não tem o campo. Em esperando_materiais, `mensagem` diz a etapa
 * ("Esperando o processamento de aula-05.pdf", "Esperando o mapa de conteúdo
 * de aula-05.pdf").
 */
export type EstadoModulo = EstadoModuloNaTela & { aviso?: string };

/**
 * A mensagem "estado" com o módulo recomendado do curso (proximoModulo: o
 * primeiro que não está concluído nem aguardando; null com todos concluídos
 * ou aguardando), sempre presente, e os módulos com o aviso. Quando responde
 * a um retorno, `retorno` traz o id do evento avaliou_bloco gravado (o que a
 * tela manda no reescrever_bloco).
 */
export type MensagemEstado = Omit<MensagensModulos["estado"], "modulos"> & { modulos: EstadoModulo[]; proximo: string | null; retorno?: string };

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
	introducao: "introdução: o contexto do tema",
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
		`Nível do aluno: ${NOMES_NIVEL[conceito.nivel] ?? conceito.nivel} (exemplo no formato ${FORMATO_DO_NIVEL[conceito.nivel]}: ${NOMES_FORMATO[FORMATO_DO_NIVEL[conceito.nivel]]})`,
	];
}

/**
 * A mensagem do modelo do plano (docs/modulos.md, "A geração", 2): o curso,
 * o módulo, quantas lições, o formulário e os conceitos do módulo com o nível
 * e, nos escopos com material, os locais do material que os citam. Com
 * `regras` (secaoDasRegras), a seção das regras de escrita no fim; sem
 * regras, nada muda.
 */
export function mensagemDoPlano(entrada: EntradaPlano, regras = ""): string {
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
		...comRegras(regras),
	].join("\n\n");
}

/** A seção das regras de escrita, quando há (sem regras, nada). */
const comRegras = (regras: string) => (regras.trim() ? [regras.trim()] : []);

/** Os trechos do material de um conceito, como vão para o modelo da lição e da reescrita do bloco. */
function linhasDosTrechos(trechos: TrechosDoConceito["trechos"]): string[] {
	if (trechos.length === 0) return ["Trechos do material: nenhum trecho do material cita este conceito."];
	return [
		"Trechos do material:",
		...trechos.map(
			(trecho) => `<trecho arquivo=${JSON.stringify(trecho.arquivo)} local=${JSON.stringify(trecho.local)}>\n${trecho.texto.trim()}${trecho.cortado ? "\n[… cortado]" : ""}\n</trecho>`,
		),
	];
}

/**
 * A mensagem do modelo de uma lição (docs/modulos.md, "A geração", 3): o
 * curso, o módulo, o formulário, o plano inteiro, a lição com o roteiro e os
 * conceitos dela com o nível e, nos escopos com material, os trechos do
 * .extraido citados por eles. Com `regras`, a seção das regras de escrita no
 * fim, como no plano.
 */
export function mensagemDaLicao(entrada: EntradaLicao, regras = ""): string {
	const comMaterial = entrada.curso.escopo !== "livre";
	const plano = entrada.plano.map(
		(licao, indice) =>
			`${indice + 1}. ${licao.id}, ${JSON.stringify(licao.titulo)}: ${licao.objetivo || "(sem objetivo)"} Conceitos: ${licao.conceitos.join(", ")}. Roteiro: ${licao.roteiro.join(", ")}.`,
	);
	const { licao } = entrada;
	const trechosDe = new Map(entrada.trechos.map((item) => [item.id, item.trechos]));
	const blocos = entrada.conceitos.map((conceito) => {
		const linhas = linhasDoConceito(conceito);
		if (comMaterial) linhas.push(...linhasDosTrechos(trechosDe.get(conceito.id) ?? []));
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
		...comRegras(regras),
	].join("\n\n");
}

/** O retorno do Breno que pede a reescrita, como foi gravado no avaliou_bloco. */
export interface RetornoDaReescrita {
	avaliacao: AvaliacaoBloco;
	motivos: MotivoRetorno[];
	texto: string;
}

/** O que vai na mensagem da reescrita de um bloco. */
export interface EntradaBloco {
	/** O curso, o módulo e o formulário (os de entradaDoModelo). */
	curso: EntradaPlano["curso"];
	modulo: EntradaPlano["modulo"];
	formulario: EntradaPlano["formulario"];
	/** A lição gravada, com todos os blocos. */
	licao: Licao;
	/** O id do bloco a reescrever. */
	bloco: string;
	retorno: RetornoDaReescrita;
	/** Os conceitos do bloco, com o nível. */
	conceitos: ConceitoDoModulo[];
	/** Os trechos do material citados pelos conceitos do bloco (nenhum no escopo livre). */
	trechos: TrechosDoConceito[];
	/** O nome de um conceito pelo id (os conceitos da lição na mensagem). */
	nomeDe?: (id: string) => string;
}

/** Os campos que o código põe num bloco (o id e as versões): ficam fora do bloco mandado ao modelo. */
const CAMPOS_DO_CODIGO = new Set(["id", "versao", "reescritoEm", "anteriores", "substituidoEm", "retorno"]);

/** O bloco no formato que o modelo devolve (sem o id e as versões; as referências só com o arquivo e o local). */
function blocoParaOModelo(bloco: Bloco): Record<string, unknown> {
	const saida: Record<string, unknown> = {};
	for (const [campo, valor] of Object.entries(bloco)) {
		if (CAMPOS_DO_CODIGO.has(campo)) continue;
		saida[campo] = campo === "referencias" && Array.isArray(valor) ? (valor as Array<{ arquivo: string; local: string }>).map(({ arquivo, local }) => ({ arquivo, local })) : valor;
	}
	return saida;
}

/**
 * A mensagem do modelo da reescrita de um bloco (docs/escrita.md,
 * "Reescrever um bloco"): o curso, o módulo e o formulário; a lição (título,
 * objetivo, conceitos e os outros blocos em texto, com o gabarito, para o
 * bloco novo encaixar sem repetir); o bloco atual em JSON; o retorno
 * (avaliação, motivos e texto); os conceitos do bloco com o nível e, nos
 * escopos com material, os trechos citados por eles; e, com `regras`, a
 * seção das regras de escrita.
 */
export function mensagemDoBloco(entrada: EntradaBloco, regras = ""): string {
	const nomeDe = entrada.nomeDe ?? ((id: string) => id);
	const { licao, retorno } = entrada;
	const posicao = licao.blocos.findIndex((bloco) => bloco.id === entrada.bloco);
	const atual = licao.blocos[posicao];
	if (!atual) throw new ErroModulo(`Não achei o bloco "${entrada.bloco}" na lição ${licao.id}.`);
	const comMaterial = entrada.curso.escopo !== "livre";
	const trechosDe = new Map(entrada.trechos.map((item) => [item.id, item.trechos]));
	const outros = licao.blocos.map((bloco, indice) =>
		bloco.id === atual.id
			? `### ${bloco.id} · ${NOMES_TIPO_BLOCO[bloco.tipo]} (posição ${indice + 1}): ESTE É O BLOCO A REESCREVER (o conteúdo atual vai abaixo, em JSON)`
			: linhasDoBloco(bloco, nomeDe, true).join("\n"),
	);
	const conceitos = entrada.conceitos.map((conceito) => {
		const linhas = linhasDoConceito(conceito);
		if (comMaterial) linhas.push(...linhasDosTrechos(trechosDe.get(conceito.id) ?? []));
		linhas.push("</conceito>");
		return linhas.join("\n");
	});
	const motivos = retorno.motivos.length ? retorno.motivos.map((motivo) => `${NOMES_MOTIVO[motivo] ?? motivo} (${motivo})`).join("; ") : "(nenhum marcado)";
	return [
		...linhasDoCurso(entrada),
		[
			`Lição do bloco: ${licao.id}, ${JSON.stringify(licao.titulo)}`,
			`Objetivo da lição: ${licao.objetivo || "(sem objetivo)"}`,
			`Conceitos da lição: ${licao.conceitos.map((id) => `${id} (${nomeDe(id)})`).join(", ")}`,
		].join("\n"),
		`Os blocos da lição, na ordem (${licao.blocos.length}):\n\n${outros.join("\n\n")}`,
		`Bloco a reescrever: ${atual.id}, do tipo ${atual.tipo}, posição ${posicao + 1} de ${licao.blocos.length}, versão ${versaoDoBloco(atual)}. O conteúdo atual:\n\`\`\`json\n${JSON.stringify(blocoParaOModelo(atual), null, 2)}\n\`\`\``,
		[
			"Retorno do aluno sobre este bloco:",
			`Avaliação: ${NOMES_AVALIACAO[retorno.avaliacao] ?? retorno.avaliacao}`,
			`Motivos: ${motivos}`,
			`Texto do aluno: ${retorno.texto || "(não escreveu)"}`,
		].join("\n"),
		`Conceitos do bloco (${conceitos.length}):\n\n${conceitos.join("\n\n")}`,
		...comRegras(regras),
	].join("\n\n");
}

/** O que a nova tentativa da lição pede, depois dos problemas (validarLicao). */
const PEDIDO_DA_LICAO_DE_NOVO =
	'Escreva a lição de novo, pelo esquema da lição e pela metodologia, corrigindo esses problemas, e responda só com o JSON {"blocos": [...]}, um bloco por item do roteiro, sem nenhum texto antes ou depois.';

/** A mensagem da nova tentativa do plano: os consertos que o código fez (conferirPlano) e o pedido de refazer sem precisar deles. */
export function mensagemDosConsertos(consertos: readonly ConsertoPlano[]): string {
	return [
		"O plano não seguiu tudo o que foi pedido, e o código precisou consertar:",
		...consertos.map((conserto) => `- ${conserto.mensagem}`),
		'Refaça o plano já seguindo o pedido e a estrutura da lição, para nada precisar de conserto, e responda só com o JSON {"licoes": [...]}, sem nenhum texto antes ou depois.',
	].join("\n");
}

/** O que vai na mensagem da conferência da pergunta. */
export interface EntradaVerificacao {
	pergunta: string;
	respostaEsperada: string;
	/** Os textos das explicações logo antes da pergunta na lição (explicacoesAntes), na ordem. */
	explicacoes: readonly string[];
	/** A resposta do Breno. */
	texto: string;
}

/**
 * A mensagem do modelo que confere a pergunta rápida (docs/modulos.md,
 * "Pergunta rápida"): a pergunta, a resposta esperada, as explicações logo
 * antes dela (o que acabou de ser explicado, até uns 6 mil caracteres) e a
 * resposta do Breno.
 */
export function mensagemDaVerificacao(entrada: EntradaVerificacao): string {
	const explicacoes = entrada.explicacoes.map((texto) => texto.trim()).filter(Boolean);
	return [
		`Pergunta: ${entrada.pergunta}`,
		`Resposta esperada: ${entrada.respostaEsperada}`,
		explicacoes.length > 0
			? `O que o aluno acabou de ler (as explicações logo antes da pergunta, na ordem):\n<explicacoes>\n${explicacoes.join("\n\n---\n\n")}\n</explicacoes>`
			: "O que o aluno acabou de ler: nenhuma explicação logo antes da pergunta.",
		`Resposta do aluno:\n<resposta>\n${entrada.texto}\n</resposta>`,
	].join("\n\n");
}

/** Os arquivos da metodologia usados, sem repetir, na ordem em que apareceram (para o contexto do gerou_modulo). */
function metodoUsado(lidos: readonly MetodoLido[]) {
	const vistos = new Set<string>();
	return lidos.flatMap((item) => (vistos.has(item.usado.nome) ? [] : (vistos.add(item.usado.nome), [item.usado])));
}

// --- Texto para o professor ----------------------------------------------------

const NOMES_TIPO_BLOCO: Record<Bloco["tipo"], string> = {
	explicacao: "Explicação",
	verificacao: "Verificação",
	alternativa: "Questão de alternativa",
	dissertativa: "Questão dissertativa",
	ideia_central: "Ideia central",
};

const LETRAS = "ABCDEFGHIJ";

/** As linhas de um bloco para o professor; o gabarito (respostas, alternativa correta, confusões, rubrica, resposta-modelo) só com `comGabarito`. */
function linhasDoBloco(bloco: Bloco, nomeDe: (id: string) => string, comGabarito: boolean): string[] {
	const extras: string[] = [];
	if (bloco.tipo === "explicacao") extras.push(NOMES_FORMATO[bloco.formato] ?? bloco.formato, ...(bloco.complemento ? ["complemento: vai além do material"] : []));
	const linhas = [`### ${bloco.id} · ${NOMES_TIPO_BLOCO[bloco.tipo]}${extras.length ? ` (${extras.join("; ")})` : ""}`, `Conceitos: ${bloco.conceitos.map(nomeDe).join(", ")}.`];
	const referencias = "referencias" in bloco ? bloco.referencias : [];
	if (bloco.tipo === "explicacao" || bloco.tipo === "ideia_central") linhas.push("", bloco.texto);
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
		`Situação: gerado em ${modulo.geradoEm.slice(0, 10)}${modulo.concluidoEm ? `, concluído pelo aluno em ${modulo.concluidoEm.slice(0, 10)}` : ", ainda não concluído"}; ${resumo.licoes} ${resumo.licoes === 1 ? "lição" : "lições"}, ${resumo.blocos} blocos, ${resumo.questoes} ${resumo.questoes === 1 ? "questão" : "questões"}.`,
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
	/** O modulo-bloco.md (nos testes, um prompt de mentira). */
	caminhoPromptBloco?: string;
	/** O verificacao.md (nos testes, um prompt de mentira). */
	caminhoPromptVerificacao?: string;
	/** O corretor.md da dissertativa, o mesmo do diagnóstico (nos testes, um prompt de mentira). */
	caminhoPromptCorretor?: string;
	/** A pasta da metodologia (nos testes, arquivos de mentira). */
	pastaMetodo?: string;
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
	/** Em esperando_materiais: os materiais do formulário que ainda não ficaram prontos (etapa processamento) ou que ainda não entraram no mapa (etapa mapa). */
	esperando?: string[];
	etapa?: "processamento" | "mapa";
	/** Em escrevendo: a lição (a partir de 1) e quantas o plano tem. */
	licao?: number;
	licoes?: number;
	/** Os materiais do formulário que entraram sem referências (o mapa não terminou). */
	aviso?: string;
	/** Os materiais cujo mapeamento deu erro (a mensagem "erro" do painel do mapa). */
	falhasDoMapa: Set<string>;
	/** Acorda a espera (um aviso "materiais:pronto" ou uma mensagem do mapa da matéria). */
	acordar?: () => void;
}

/** Uma reescrita de bloco em andamento (uma operação por curso, junto das gerações). */
interface ReescritaEmAndamento {
	modulo: string;
	licao: string;
	bloco: string;
	controle: AbortController;
	/** Só depois de conferida a reescrita aparece no estado (reescrevendo). */
	aceita: boolean;
}

/** Uma conferência em andamento (pergunta ou dissertativa): a tentativa conferida e o cancelamento. */
interface Conferindo {
	alvo: AlvoConferencia;
	controle: AbortController;
}

/** Uma conferência a fazer: a tentativa, a lição e o bloco (lidos na trava) e o cancelamento. */
interface AConferir extends Conferindo {
	licao: Licao;
	bloco: BlocoQuestao;
}

/** Um retorno gravado (o avaliou_bloco): de onde é o bloco e o que o Breno disse. */
interface RetornoGravado {
	objeto: { materia: string; curso: string; modulo: string; licao: string; bloco: string };
	resultado: RetornoDaReescrita;
}

/** O retorno de um evento avaliou_bloco lido do eventos.jsonl; outro formato, undefined. */
function retornoDoEvento(evento: Evento): RetornoGravado | undefined {
	const { objeto, resultado } = evento;
	const textos = ["materia", "curso", "modulo", "licao", "bloco"] as const;
	if (evento.verbo !== "avaliou_bloco" || !textos.every((campo) => typeof objeto?.[campo] === "string") || !resultado) return undefined;
	const motivos = Array.isArray(resultado.motivos) ? (resultado.motivos as unknown[]).filter((motivo): motivo is MotivoRetorno => typeof motivo === "string" && motivo in NOMES_MOTIVO) : [];
	// A antiga "melhorar" (antes da parte 3 do plano de 2026-10-28) vale como "ruim".
	const avaliacao = avaliacaoLida(resultado.avaliacao);
	if (!avaliacao) return undefined;
	return {
		objeto: { materia: objeto.materia as string, curso: objeto.curso as string, modulo: objeto.modulo as string, licao: objeto.licao as string, bloco: objeto.bloco as string },
		resultado: { avaliacao, motivos, texto: typeof resultado.texto === "string" ? resultado.texto : "" },
	};
}

const ehPromptUsado = (valor: unknown): valor is PromptUsado =>
	typeof valor === "object" && valor !== null && typeof (valor as PromptUsado).nome === "string" && typeof (valor as PromptUsado).hash === "string";

/** "a", "a e b", "a, b e c". */
const listaComE = (itens: readonly string[]) => (itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

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
	const caminhoBloco = opcoes.caminhoPromptBloco ?? CAMINHO_PROMPT_BLOCO;
	const caminhoVerificacao = opcoes.caminhoPromptVerificacao ?? CAMINHO_PROMPT_VERIFICACAO;
	const caminhoCorretor = opcoes.caminhoPromptCorretor ?? CAMINHO_PROMPT_CORRETOR;
	const pastaMetodo = opcoes.pastaMetodo ?? PASTA_METODO;
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
	/** O aviso da última geração (materiais sem referências), por "matéria/curso/módulo", até a próxima ação nele. */
	const avisos = new Map<string, string>();
	/** Os cursos cujo estado a tela pediu, por matéria: recebem o estado de novo quando um material chega ou sai. */
	const vistos = new Map<string, Set<string>>();
	/** A trava do aprendiz/escrita.json: todo ler-gravar das regras espera o anterior. Pode ser tomada dentro da trava de uma matéria, nunca o contrário. */
	let travaEscrita: Promise<unknown> = Promise.resolve();
	/** As reescritas de bloco em andamento, por "matéria/curso" (uma operação por curso, junto das gerações). */
	const reescritas = new Map<string, ReescritaEmAndamento>();
	/** Os retornos gravados nesta sessão, pelo id do evento (os outros são lidos do aprendiz/eventos.jsonl). */
	const retornos = new Map<string, RetornoGravado>();
	/** As conferências em andamento (pergunta e dissertativa), por "matéria/curso/módulo" e pelo id do bloco. */
	const conferencias = new Map<string, Map<string, Conferindo>>();

	const daSessao = () => (sessao ? { sessao } : {});
	const chaveDo = (materia: string, curso: string) => `${materia}/${curso}`;
	const chaveDoModulo = (materia: string, curso: string, modulo: string) => `${materia}/${curso}/${modulo}`;

	function mostrar(acao: "estado", dados: MensagemEstado): void;
	function mostrar(acao: "modulo", dados: MensagensModulos["modulo"]): void;
	function mostrar(acao: "erro", dados: MensagensModulos["erro"]): void;
	function mostrar(acao: keyof MensagensModulos, dados: unknown): void {
		pi.events.emit("interface:mostrar", { painel: PAINEL_MODULOS, acao, dados, gravar: false });
	}

	function mostrarEscrita(acao: "regras", dados: MensagensEscrita["regras"]): void;
	function mostrarEscrita(acao: "erro", dados: MensagensEscrita["erro"]): void;
	function mostrarEscrita(acao: keyof MensagensEscrita, dados: unknown): void {
		pi.events.emit("interface:mostrar", { painel: PAINEL_ESCRITA, acao, dados, gravar: false });
	}

	/**
	 * Os blocos do módulo em conferência agora, na ordem do módulo: só os
	 * cuja conferência ainda vale (conferenciaVale; a de uma resposta que
	 * mudou, por o módulo ter sido gerado de novo ou o bloco reescrito, será
	 * jogada fora e não conta).
	 */
	const corrigindoNo = (modulo: Modulo): string[] => {
		const doModulo = conferencias.get(chaveDoModulo(modulo.materia, modulo.curso, modulo.id));
		if (!doModulo || modulo.situacao !== "gerado") return [];
		return modulo.licoes
			.flatMap((licao) => licao.blocos.map((bloco) => bloco.id))
			.filter((id) => {
				const conferindo = doModulo.get(id);
				return conferindo !== undefined && conferenciaVale(modulo, conferindo.alvo);
			});
	};

	/** Manda o módulo inteiro (com as respostas) e os blocos em conferência; com o pedido, quando responde a uma ação. Chamado dentro da trava. */
	const mostrarModulo = (materia: string, curso: string, modulo: Modulo, pedido?: string) =>
		mostrar("modulo", { materia, curso, modulo, corrigindo: corrigindoNo(modulo), ...(pedido ? { pedido } : {}) });

	const marcarConferindo = (chave: string, alvo: AlvoConferencia): AbortController => {
		const doModulo = conferencias.get(chave) ?? new Map<string, Conferindo>();
		conferencias.set(chave, doModulo);
		const controle = new AbortController();
		doModulo.set(alvo.bloco, { alvo, controle });
		return controle;
	};
	const tirarConferindo = (chave: string, bloco: string, controle: AbortController) => {
		const doModulo = conferencias.get(chave);
		if (doModulo?.get(bloco)?.controle !== controle) return;
		doModulo.delete(bloco);
		if (doModulo.size === 0) conferencias.delete(chave);
	};

	/** Roda `tarefa` na trava da matéria (depois da anterior, mesmo que ela tenha falhado). */
	const naTrava = <T>(materia: string, tarefa: () => Promise<T>): Promise<T> => {
		const resultado = (travas.get(materia) ?? Promise.resolve()).then(tarefa, tarefa);
		travas.set(materia, resultado.catch(() => undefined));
		return resultado;
	};

	/** Roda `tarefa` na trava do escrita.json (depois da anterior, mesmo que ela tenha falhado). */
	const naTravaEscrita = <T>(tarefa: () => Promise<T>): Promise<T> => {
		const resultado = travaEscrita.then(tarefa, tarefa);
		travaEscrita = resultado.catch(() => undefined);
		return resultado;
	};

	/** A seção das regras de escrita que valem para a matéria (vazia sem regras). Um escrita.json ilegível é ErroEscrita: a geração não segue sem as regras do Breno. */
	const regrasDaMateria = async (dados: string, materia: string) => secaoDasRegras(regrasQueValem((await naTravaEscrita(() => lerEscrita(dados))).regras, materia));

	/** O prompt (nome e hash) de agora, para quando o evento não diz; sem o arquivo, nada. */
	const promptDeAgora = async (caminho: string): Promise<PromptLido | undefined> => {
		try {
			return await lerPrompt(caminho);
		} catch {
			return undefined;
		}
	};

	/**
	 * Como o bloco foi gerado, para o contexto do avaliou_bloco: o modelo e o
	 * prompt (nome e hash). Na versão 1, o modelo do módulo e o prompt da lição
	 * do gerou_modulo daquela geração (o do mesmo instante do geradoEm); numa
	 * reescrita, o modelo e o prompt do reescreveu_bloco que deu aquela versão.
	 * Sem o evento, o prompt de agora (o da lição ou o do bloco).
	 */
	const origemDoBloco = async (dados: string, modulo: ModuloGerado, licao: string, bloco: Bloco): Promise<{ modelo: string; prompt?: PromptUsado }> => {
		const versao = versaoDoBloco(bloco);
		if (versao > 1) {
			const { eventos } = await lerEventos(eventosAprendiz(dados));
			const reescrito = eventos.findLast(
				(evento) =>
					evento.verbo === "reescreveu_bloco" &&
					evento.objeto.materia === modulo.materia &&
					evento.objeto.curso === modulo.curso &&
					evento.objeto.modulo === modulo.id &&
					evento.objeto.licao === licao &&
					evento.objeto.bloco === bloco.id &&
					evento.resultado?.para === versao,
			);
			if (reescrito && typeof reescrito.contexto?.modelo === "string") {
				const prompt = reescrito.contexto.prompt;
				return { modelo: reescrito.contexto.modelo, ...(ehPromptUsado(prompt) ? { prompt: { nome: prompt.nome, hash: prompt.hash } } : {}) };
			}
			const agora = await promptDeAgora(caminhoBloco);
			return { modelo: agora?.modelo ?? modulo.modelo, ...(agora ? { prompt: agora.usado } : {}) };
		}
		const { eventos } = await lerEventos(eventosMateria(dados, modulo.materia));
		const gerou = eventos.findLast(
			(evento) => evento.verbo === "gerou_modulo" && evento.objeto.curso === modulo.curso && evento.objeto.modulo === modulo.id && evento.ts === modulo.geradoEm,
		);
		const nomeLicao = basename(caminhoLicao);
		const doEvento = Array.isArray(gerou?.contexto?.prompts) ? (gerou.contexto.prompts as unknown[]).find((prompt): prompt is PromptUsado => ehPromptUsado(prompt) && prompt.nome === nomeLicao) : undefined;
		if (doEvento) return { modelo: modulo.modelo, prompt: { nome: doEvento.nome, hash: doEvento.hash } };
		const agora = await promptDeAgora(caminhoLicao);
		return { modelo: modulo.modelo, ...(agora ? { prompt: agora.usado } : {}) };
	};

	/** O retorno pelo id do evento: o desta sessão (em memória) ou o do aprendiz/eventos.jsonl. */
	const lerRetorno = async (dados: string, id: string): Promise<RetornoGravado | undefined> => {
		const naMemoria = retornos.get(id);
		if (naMemoria) return naMemoria;
		const { eventos } = await lerEventos(eventosAprendiz(dados));
		const evento = eventos.find((item) => item.id === id && item.verbo === "avaliou_bloco");
		return evento ? retornoDoEvento(evento) : undefined;
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
	 * quando há), o arquivo ilegível (erro), o gravado (gerado, com concluido e
	 * concluidoEm, ou aguardando, com materialNovo) ou a_gerar; e o
	 * recomendado (proximo). Curso que não está pronto: nenhum módulo.
	 */
	const estadoDoCurso = async (dados: string, materia: string, curso: string): Promise<{ modulos: EstadoModulo[]; proximo: string | null }> => {
		const atual = await lerCurso(dados, materia, curso);
		if (atual.situacao !== "pronto" || !atual.esqueleto) return { modulos: [], proximo: null };
		const lidos = await situacoesDoCurso(dados, materia, curso);
		const algumAguardando = Object.values(lidos.modulos).some((modulo) => modulo.situacao === "aguardando_material");
		const prontos = algumAguardando ? await materiaisProntos(dados, materia) : [];
		const geracao = geracoes.get(chaveDo(materia, atual.id));
		const reescrita = reescritas.get(chaveDo(materia, atual.id));
		const lista = atual.esqueleto.modulos.map(({ id }): EstadoModulo => {
			if (geracao?.aceita && geracao.modulo === id) {
				const esperando = geracao.esperando ?? [];
				return {
					id,
					situacao: geracao.situacao,
					...(geracao.situacao === "esperando_materiais"
						? { esperando: [...esperando], mensagem: `Esperando ${geracao.etapa === "mapa" ? "o mapa de conteúdo" : "o processamento"} de ${listaComE(esperando)}` }
						: {}),
					...(geracao.situacao === "escrevendo" ? { licao: geracao.licao, licoes: geracao.licoes } : {}),
					...(geracao.aviso ? { aviso: geracao.aviso } : {}),
				};
			}
			const ilegivel = lidos.erros.find((erro) => erro.modulo === id);
			if (ilegivel) return { id, situacao: "erro", mensagem: ilegivel.mensagem };
			const gravado = lidos.modulos[id];
			let doGravado: Partial<EstadoModuloNaTela> = {};
			if (gravado?.situacao === "gerado") {
				const resumo = resumoDoModulo(gravado);
				const progresso = progressoDoModulo(gravado);
				doGravado = {
					geradoEm: gravado.geradoEm,
					custo: gravado.custo,
					licoesGeradas: resumo.licoes,
					blocos: resumo.blocos,
					questoes: resumo.questoes,
					progresso: { feitas: progresso.feitas, questoes: progresso.questoes },
					concluido: Boolean(gravado.concluidoEm),
					...(gravado.concluidoEm ? { concluidoEm: gravado.concluidoEm } : {}),
					...(reescrita?.aceita && reescrita.modulo === id ? { reescrevendo: { licao: reescrita.licao, bloco: reescrita.bloco } } : {}),
				};
			} else if (gravado?.situacao === "aguardando_material") {
				doGravado = { nota: gravado.aguardando.nota, materialNovo: materialNovo(gravado.aguardando, prontos) };
			}
			const erro = erros.get(chaveDoModulo(materia, atual.id, id));
			if (erro) return { id, situacao: "erro", mensagem: erro, ...doGravado };
			const aviso = gravado?.situacao === "gerado" ? avisos.get(chaveDoModulo(materia, atual.id, id)) : undefined;
			if (gravado) return { id, situacao: gravado.situacao, ...doGravado, ...(aviso ? { aviso } : {}) };
			return { id, situacao: "a_gerar" };
		});
		return { modulos: lista, proximo: proximoModulo(atual.esqueleto, lidos.situacoes, lidos.concluidos) };
	};

	/** Manda o estado do curso. Chamado dentro da trava, para um estado velho nunca chegar depois de um novo. */
	const mostrarEstado = async (dados: string, materia: string, curso: string, pedido?: string, extra: { retorno?: string } = {}) => {
		const estado = await estadoDoCurso(dados, materia, curso);
		const doCurso = vistos.get(materia) ?? new Set<string>();
		doCurso.add(curso);
		vistos.set(materia, doCurso);
		mostrar("estado", { materia, curso, modulos: estado.modulos, proximo: estado.proximo, ...(pedido ? { pedido } : {}), ...(extra.retorno ? { retorno: extra.retorno } : {}) });
	};

	/** O estado pela trava; um erro vira "erro" para a tela. Depois do fim da sessão, nada. */
	const mostrarNaTrava = (dados: string, materia: string, curso: string, ao: string) =>
		naTrava(materia, async () => {
			if (pastaDados !== dados) return;
			await mostrarEstado(dados, materia, curso);
		}).catch((erro: unknown) => mostrar("erro", { mensagem: mensagemDe(erro, "listar"), ao, materia, curso }));

	/** Dorme até `ms`, um aviso que acorda a geração ou o cancelamento. */
	const dormir = (geracao: Geracao, ms: number) =>
		new Promise<void>((resolver) => {
			const sinal = geracao.controle.signal;
			const fim = () => {
				clearTimeout(relogio);
				sinal.removeEventListener("abort", fim);
				if (geracao.acordar === fim) geracao.acordar = undefined;
				resolver();
			};
			const relogio = setTimeout(fim, ms);
			sinal.addEventListener("abort", fim, { once: true });
			geracao.acordar = fim;
		});

	/** Muda o que a geração está esperando e manda o estado, se mudou. */
	const mostrarEspera = async (dados: string, materia: string, curso: string, geracao: Geracao, etapa: "processamento" | "mapa", faltam: string[]) => {
		if (geracao.situacao === "esperando_materiais" && geracao.etapa === etapa && JSON.stringify(faltam) === JSON.stringify(geracao.esperando)) return;
		geracao.situacao = "esperando_materiais";
		geracao.etapa = etapa;
		geracao.esperando = faltam;
		await mostrarNaTrava(dados, materia, curso, "gerar");
	};

	const minutosDaEspera = () => {
		const minutos = Math.max(1, Math.round(tempoEspera / 60_000));
		return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
	};

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
			await mostrarEspera(dados, materia, curso, geracao, "processamento", faltam);
			const resta = limite - Date.now();
			if (resta <= 0) {
				throw new ErroModulo(
					`${faltam.length === 1 ? `O material ${faltam[0]} não ficou pronto` : `Os materiais ${listaComE(faltam)} não ficaram prontos`} em ${minutosDaEspera()} (o processamento falhou ou ainda não terminou). O módulo não foi gerado; confira os materiais da matéria e gere de novo.`,
				);
			}
			await dormir(geracao, Math.min(intervalo, resta));
		}
	};

	/**
	 * Depois de prontos, espera os materiais do formulário entrarem no mapa de
	 * conteúdo da matéria (mapa.arquivos com o hash do manifesto; o mapa se
	 * atualiza sozinho pelo "materiais:pronto"), com o mesmo tempo limite,
	 * acordando a cada mensagem do painel do mapa da matéria ou a cada
	 * `intervalo`. Devolve os que ficaram sem mapa: os com erro no mapeamento
	 * (a mensagem "erro" do mapa), os que passaram do tempo limite, ou todos,
	 * se o mapa não puder ser lido. A geração segue com eles sem referências
	 * (o aviso). Cancelada, Cancelado.
	 */
	const esperarMapa = async (dados: string, materia: string, curso: string, geracao: Geracao, nomes: readonly string[]): Promise<string[]> => {
		const sinal = geracao.controle.signal;
		const limite = Date.now() + tempoEspera;
		for (;;) {
			if (sinal.aborted) throw new Cancelado();
			const prontos = new Map((await materiaisProntos(dados, materia)).map((item) => [item.arquivo, item.hash]));
			let mapeados: Record<string, { hash: string } | undefined>;
			try {
				mapeados = (await lerMapa(dados, materia)).arquivos;
			} catch {
				return nomes.filter((nome) => prontos.has(nome));
			}
			const semMapa = nomes.filter((nome) => prontos.has(nome) && mapeados[nome]?.hash !== prontos.get(nome));
			const falharam = semMapa.filter((nome) => geracao.falhasDoMapa.has(nome));
			const faltam = semMapa.filter((nome) => !geracao.falhasDoMapa.has(nome));
			if (faltam.length === 0) return falharam;
			await mostrarEspera(dados, materia, curso, geracao, "mapa", faltam);
			const resta = limite - Date.now();
			if (resta <= 0) return semMapa;
			await dormir(geracao, Math.min(intervalo, resta));
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
		const reescrevendo = reescritas.get(chave);
		if (reescrevendo) throw new ErroModulo(`Um bloco do módulo ${reescrevendo.modulo} deste curso está sendo reescrito. Espere terminar (ou pare) antes de gerar um módulo.`);
		const geracao: Geracao = { modulo, controle: new AbortController(), aceita: false, situacao: "planejando", falhasDoMapa: new Set() };
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
			// A estrutura da lição, que o plano carrega (os arquivos das lições são lidos depois do plano, pelos roteiros).
			const metodoPlano = await lerMetodo(pastaMetodo, [ARQUIVO_ESTRUTURA_LICAO]);
			if (!registro) throw new ErroModulo("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo dos módulos.");
			const modeloPlano = resolverModelo(registro, promptPlano.modelo, "do plano do módulo");
			const modeloLicao = resolverModelo(registro, promptLicao.modelo, "das lições do módulo");
			// As regras de escrita que valem para a matéria, lidas uma vez (as mesmas no plano e em todas as lições).
			const regras = await regrasDaMateria(dados, materia);

			const escopo = await naTrava(materia, async () => {
				const atual = await lerCurso(dados, materia, curso);
				const { situacoes, concluidos } = await situacoesDoCurso(dados, materia, curso);
				podeGerar(atual, situacoes, modulo, concluidos);
				// Um arquivo ilegível no lugar é ErroModulo (gravarModuloGerado também recusaria no fim).
				await lerModulo(dados, materia, curso, modulo);
				if (materiaisNovos.length > 0) {
					const prontos = new Set((await materiaisProntos(dados, materia)).map((item) => item.arquivo));
					const faltam = materiaisNovos.filter((nome) => !prontos.has(nome));
					if (faltam.length > 0) {
						geracao.situacao = "esperando_materiais";
						geracao.etapa = "processamento";
						geracao.esperando = faltam;
					}
				}
				geracao.aceita = true;
				erros.delete(chaveModulo);
				avisos.delete(chaveModulo);
				await mostrarEstado(dados, materia, curso, pedido);
				return atual.objetivo?.escopo;
			});

			if (materiaisNovos.length > 0) {
				await esperarMateriais(dados, materia, curso, geracao, materiaisNovos);
				// No escopo livre o material não entra na geração: não há referências para esperar.
				if (escopo !== "livre") {
					const semMapa = await esperarMapa(dados, materia, curso, geracao, materiaisNovos);
					if (semMapa.length > 0) geracao.aviso = `${listaComE(semMapa)} ${semMapa.length === 1 ? "entrou" : "entraram"} sem referências: o mapa não terminou.`;
				}
			}

			// O plano: uma chamada, fora da trava.
			if (sinal.aborted) throw new Cancelado();
			// Sem materiais para esperar, a aceitação já mandou o planejando.
			if (geracao.situacao !== "planejando") {
				geracao.situacao = "planejando";
				geracao.esperando = undefined;
				geracao.etapa = undefined;
				await mostrarNaTrava(dados, materia, curso, "gerar");
			}
			const entrada = await entradaDoModelo(dados, materia, curso, modulo, { pedido: doPedido });
			const plano = await pedirJson(
				registro,
				modeloPlano,
				instrucoesComMetodo(promptPlano.instrucoes, metodoPlano),
				mensagemDoPlano(entrada.plano, regras),
				(texto, tentativa) => {
					const conferido = conferirPlano(objetoJsonDoModelo(texto), {
						conceitosDoModulo: entrada.plano.conceitos.map((conceito) => conceito.id),
						licoes: entrada.plano.licoes,
						tipo: entrada.plano.curso.tipo,
						niveis: Object.fromEntries(entrada.plano.conceitos.map((conceito) => [conceito.id, conceito.nivel])),
					});
					// Com consertos, uma nova tentativa com eles; na segunda, vale o plano consertado.
					if (conferido.consertos.length > 0 && tentativa === 1) throw new PedirDeNovo(mensagemDosConsertos(conferido.consertos));
					return conferido.licoes;
				},
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
			// Os arquivos da metodologia de todas as lições, lidos uma vez (cada lição leva os do roteiro dela).
			const metodoLicoes = await lerMetodo(pastaMetodo, arquivosDeMetodo(entradas.flatMap((item) => item.licao.roteiro)));
			const metodoDe = (roteiro: readonly unknown[]) => {
				const arquivos: readonly string[] = arquivosDeMetodo(roteiro);
				return metodoLicoes.filter((item) => arquivos.includes(item.arquivo));
			};
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
					instrucoesComMetodo(promptLicao.instrucoes, metodoDe(entradaLicao.licao.roteiro)),
					mensagemDaLicao(entradaLicao, regras),
					(texto, tentativa) => {
						const lido = objetoJsonDoModelo(texto);
						try {
							return validarLicao(lido, { licao: entradaLicao.licao, trechos: entradaLicao.referencias, escopo: entradaLicao.curso.escopo }).licao;
						} catch (erro) {
							// Fora do esquema (ou sem explicação ou prática): a nova tentativa leva os problemas; na segunda, o erro como está.
							if (erro instanceof ErroModulo && tentativa === 1) throw new PedirDeNovo(`${erro.message}\n\n${PEDIDO_DA_LICAO_DE_NOVO}`);
							throw erro;
						}
					},
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
				if (geracao.aviso) avisos.set(chaveModulo, geracao.aviso);
				const modelo = promptPlano.modelo === promptLicao.modelo ? promptPlano.modelo : `${promptPlano.modelo} (plano) e ${promptLicao.modelo} (lições)`;
				await gravarModuloGerado(
					dados,
					materia,
					curso,
					{ id: modulo, licoes, pedido: doPedido, modelo, custo, materiaisUsados: comLicoes.materiaisUsados },
					{ ...daSessao(), modelo, prompts: [promptPlano.usado, promptLicao.usado, ...metodoUsado([...metodoPlano, ...metodoLicoes])] },
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

	/**
	 * Grava uma avaliação do Breno num bloco: o retorno detalhado (retorno) ou
	 * a nota rápida (avaliar_bloco, sem motivos, texto nem regra). Na trava da
	 * matéria, lê o módulo gerado e o bloco (o tipo, os conceitos, a versão e
	 * como foi gerado); no retorno, confere o detalha (o id de um avaliou_bloco
	 * do mesmo bloco, como o reescrever_bloco confere o retorno); na trava do
	 * escrita.json (o virarRegra grava nele), registrarRetorno; depois grava a
	 * nota em feedback (gravarFeedback) e guarda o retorno em memória (para a
	 * reescrita e o detalha). A nota rápida responde com o modulo com o
	 * pedido. O retorno manda o modulo sem pedido, o estado com o pedido e o
	 * id do evento e, se criou regra, as regras no painel escrita.
	 */
	const avaliarBloco = (dados: string, materia: string, curso: string, modulo: string, dadosAcao: DadosAcao, pedido: string | undefined, rapida: boolean) =>
		naTrava(materia, async () => {
			const licao = textoOpcional(dadosAcao.licao);
			const bloco = textoOpcional(dadosAcao.bloco);
			if (!licao) throw new ErroModulo("Falta o id da lição.");
			if (!bloco) throw new ErroModulo("Falta o id do bloco.");
			const lido = await lerModulo(dados, materia, curso, modulo);
			if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
			if (lido.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo} está aguardando material; não há bloco para avaliar.`);
			const daLicao = lido.licoes.find((item) => item.id === licao);
			if (!daLicao) throw new ErroModulo(`Não achei a lição "${licao}" no módulo ${modulo}.`);
			const doBloco = daLicao.blocos.find((item) => item.id === bloco);
			if (!doBloco) throw new ErroModulo(`Não achei o bloco "${bloco}" na lição ${licao}.`);
			let detalha: string | undefined;
			if (!rapida && dadosAcao.detalha !== undefined && dadosAcao.detalha !== null) {
				detalha = textoOpcional(dadosAcao.detalha);
				if (!detalha) throw new ErroEscrita("O detalha do retorno não é o id de um evento.");
				const nota = await lerRetorno(dados, detalha);
				if (!nota) throw new ErroEscrita(`Não achei a nota "${detalha}" nos eventos.`);
				const { objeto } = nota;
				if (objeto.materia !== materia || objeto.curso !== curso || objeto.modulo !== modulo || objeto.licao !== licao || objeto.bloco !== bloco) {
					throw new ErroEscrita(`A nota "${detalha}" é de outro bloco (${objeto.modulo}, ${objeto.bloco}); o retorno detalha uma nota do próprio bloco.`);
				}
			}
			const origem = await origemDoBloco(dados, lido, licao, doBloco);
			const agora = new Date();
			const registrado = await naTravaEscrita(() =>
				registrarRetorno(
					dados,
					{
						materia,
						curso,
						modulo,
						licao,
						bloco,
						tipo: doBloco.tipo,
						conceitos: [...doBloco.conceitos],
						avaliacao: dadosAcao.avaliacao,
						motivos: rapida ? [] : dadosAcao.motivos,
						texto: rapida ? "" : dadosAcao.texto,
						virarRegra: rapida ? null : (dadosAcao.virarRegra as { texto: string; materia: string | null } | null | undefined),
						versao: versaoDoBloco(doBloco),
						modelo: origem.modelo,
						prompt: origem.prompt ?? null,
						detalha: detalha ?? null,
					},
					{ ...daSessao(), agora },
				),
			);
			// O que foi gravado no evento: registrarRetorno limpa pelo mesmo validarRetorno.
			const limpo = validarRetorno({ avaliacao: dadosAcao.avaliacao, motivos: rapida ? [] : dadosAcao.motivos, texto: rapida ? "" : dadosAcao.texto });
			retornos.set(registrado.retorno, { objeto: { materia, curso, modulo, licao, bloco }, resultado: { avaliacao: limpo.avaliacao, motivos: limpo.motivos, texto: limpo.texto } });
			const novo = await gravarFeedback(dados, materia, curso, modulo, licao, bloco, { avaliacao: limpo.avaliacao, evento: registrado.retorno, agora });
			if (rapida) {
				mostrarModulo(materia, curso, novo, pedido);
				return;
			}
			mostrarModulo(materia, curso, novo);
			await mostrarEstado(dados, materia, curso, pedido, { retorno: registrado.retorno });
			if (registrado.regras) mostrarEscrita("regras", { regras: registrado.regras });
		});

	/**
	 * Grava o questionário do fim da lição (avaliar_licao; registrarQuestionario):
	 * na trava da matéria, lê o módulo gerado e a lição, junta os prompts que
	 * geraram a lição (o da lição, da geração, e os das reescritas dos blocos
	 * dela, pela origemDoBloco, sem repetir) e grava o questionário e o
	 * avaliou_licao. Responde com o modulo com o pedido.
	 */
	const avaliarLicao = (dados: string, materia: string, curso: string, modulo: string, dadosAcao: DadosAcao, pedido: string | undefined) =>
		naTrava(materia, async () => {
			const licao = textoOpcional(dadosAcao.licao);
			if (!licao) throw new ErroModulo("Falta o id da lição.");
			const lido = await lerModulo(dados, materia, curso, modulo);
			if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
			if (lido.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo} está aguardando material; não há lição para avaliar.`);
			const daLicao = lido.licoes.find((item) => item.id === licao);
			if (!daLicao) throw new ErroModulo(`Não achei a lição "${licao}" no módulo ${modulo}.`);
			// Os blocos da versão 1 vêm todos da mesma geração: basta a origem de um deles.
			const primeiro = daLicao.blocos.find((bloco) => versaoDoBloco(bloco) === 1);
			const reescritos = daLicao.blocos.filter((bloco) => versaoDoBloco(bloco) > 1);
			const prompts: PromptUsado[] = [];
			for (const bloco of [...(primeiro ? [primeiro] : []), ...reescritos]) {
				const { prompt } = await origemDoBloco(dados, lido, licao, bloco);
				if (prompt && !prompts.some((item) => item.nome === prompt.nome && item.hash === prompt.hash)) prompts.push(prompt);
			}
			const { modulo: novo } = await registrarQuestionario(dados, materia, curso, modulo, licao, { notas: dadosAcao.notas, texto: dadosAcao.texto }, { ...daSessao(), modelo: lido.modelo, prompts });
			mostrarModulo(materia, curso, novo, pedido);
		});

	/**
	 * Reescreve um bloco a partir de um retorno (reescrever_bloco; docs/escrita.md,
	 * "Reescrever um bloco"): lê o prompt e resolve o modelo; dentro da trava,
	 * confere o módulo gerado, a lição, o bloco e o retorno (do mesmo bloco) e
	 * manda o estado com o pedido e reescrevendo; fora dela, junta a entrada
	 * (os conceitos do bloco com o nível e os trechos, como na lição) e as
	 * regras e chama o modelo (validarBloco, com a nova tentativa); dentro da
	 * trava de novo, grava (gravarBlocoReescrito) e manda o módulo novo e o
	 * estado. Uma operação por curso de cada vez (as gerações e as
	 * reescritas); cancelar aborta e o bloco fica como estava. Com erro antes
	 * de aceitar, o erro com o pedido; depois, o erro e o estado (o módulo
	 * continua gerado, com o bloco antigo).
	 */
	const reescrever = async (dados: string, materia: string, curso: string, modulo: string, dadosAcao: DadosAcao, pedido: string | undefined) => {
		const chave = chaveDo(materia, curso);
		const comPedido = pedido ? { pedido } : {};
		const licao = textoOpcional(dadosAcao.licao);
		const bloco = textoOpcional(dadosAcao.bloco);
		const retornoId = textoOpcional(dadosAcao.retorno);
		if (!licao) throw new ErroModulo("Falta o id da lição.");
		if (!bloco) throw new ErroModulo("Falta o id do bloco.");
		if (!retornoId) throw new ErroEscrita("Falta o id do retorno que pede a reescrita.");
		const gerando = geracoes.get(chave);
		if (gerando) throw new ErroModulo(`O módulo ${gerando.modulo} deste curso está sendo gerado. Espere terminar (ou pare) antes de reescrever um bloco.`);
		const emAndamento = reescritas.get(chave);
		if (emAndamento) {
			throw new ErroModulo(
				emAndamento.modulo === modulo && emAndamento.licao === licao && emAndamento.bloco === bloco
					? "Este bloco já está sendo reescrito. Espere terminar (ou pare) antes de pedir de novo."
					: `O bloco ${emAndamento.bloco} do módulo ${emAndamento.modulo} deste curso está sendo reescrito. Espere terminar (ou pare) antes de reescrever outro.`,
			);
		}
		const reescrita: ReescritaEmAndamento = { modulo, licao, bloco, controle: new AbortController(), aceita: false };
		reescritas.set(chave, reescrita);
		const sinal = reescrita.controle.signal;
		try {
			const prompt = await lerPrompt(caminhoBloco);
			if (!registro) throw new ErroModulo("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo da reescrita do bloco.");
			const modelo = resolverModelo(registro, prompt.modelo, "da reescrita do bloco");
			const regras = await regrasDaMateria(dados, materia);

			const alvo = await naTrava(materia, async () => {
				const atual = await lerCurso(dados, materia, curso);
				const lido = await lerModulo(dados, materia, curso, modulo);
				if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
				if (lido.situacao !== "gerado") throw new ErroModulo(`O módulo ${modulo} está aguardando material; não há bloco para reescrever.`);
				const daLicao = lido.licoes.find((item) => item.id === licao);
				if (!daLicao) throw new ErroModulo(`Não achei a lição "${licao}" no módulo ${modulo}.`);
				const doBloco = daLicao.blocos.find((item) => item.id === bloco);
				if (!doBloco) throw new ErroModulo(`Não achei o bloco "${bloco}" na lição ${licao}.`);
				const retorno = await lerRetorno(dados, retornoId);
				if (!retorno) throw new ErroEscrita(`Não achei o retorno "${retornoId}" nos eventos.`);
				const { objeto } = retorno;
				if (objeto.materia !== materia || objeto.curso !== curso || objeto.modulo !== modulo || objeto.licao !== licao || objeto.bloco !== bloco) {
					throw new ErroEscrita(`O retorno "${retornoId}" é de outro bloco (${objeto.modulo}, ${objeto.bloco}); a reescrita usa um retorno do próprio bloco.`);
				}
				reescrita.aceita = true;
				await mostrarEstado(dados, materia, curso, pedido);
				return { curso: atual, modulo: lido, licao: daLicao, bloco: doBloco, retorno: retorno.resultado };
			});

			// A entrada: a lição com só os conceitos do bloco, para os trechos virem deles (como na lição).
			if (sinal.aborted) throw new Cancelado();
			const conceitosDoBloco = alvo.bloco.conceitos.filter((id) => alvo.licao.conceitos.includes(id));
			const naEntrada = { id: alvo.licao.id, titulo: alvo.licao.titulo, objetivo: alvo.licao.objetivo, conceitos: conceitosDoBloco, roteiro: roteiroDaLicao(alvo.licao) };
			// O arquivo da metodologia do tipo do bloco (a explicação pelo formato).
			const metodo = await lerMetodo(pastaMetodo, [arquivoDeMetodo(itemDoRoteiro(alvo.bloco))]);
			const entrada = await entradaDoModelo(dados, materia, alvo.curso, modulo, { pedido: alvo.modulo.pedido, plano: [naEntrada] });
			const doBloco = entrada.licoes?.[0];
			if (!doBloco) throw new ErroModulo("Não consegui montar a entrada da reescrita do bloco.");
			const nomes = new Map(entrada.plano.conceitos.map((conceito) => [conceito.id, conceito.nome]));
			const mensagem = mensagemDoBloco(
				{
					curso: entrada.plano.curso,
					modulo: entrada.plano.modulo,
					formulario: entrada.plano.formulario,
					licao: alvo.licao,
					bloco,
					retorno: alvo.retorno,
					conceitos: doBloco.conceitos,
					trechos: doBloco.trechos,
					nomeDe: (id) => nomes.get(id) ?? id,
				},
				regras,
			);
			const resposta = await pedirJson(
				registro,
				modelo,
				instrucoesComMetodo(prompt.instrucoes, metodo),
				mensagem,
				(texto) =>
					validarBloco(objetoJsonDoModelo(texto), {
						licao: { id: alvo.licao.id, conceitos: alvo.licao.conceitos },
						trechos: doBloco.referencias,
						escopo: entrada.plano.curso.escopo,
						tipo: alvo.bloco.tipo,
					}),
				sinal,
				{
					maxTokens: MAX_TOKENS_BLOCO,
					formato: `{"bloco": {...}}, com um bloco do tipo ${alvo.bloco.tipo}`,
					oQue: `o bloco reescrito (${bloco})`,
					depois: "O bloco não mudou.",
				},
			);

			await naTrava(materia, async () => {
				if (sinal.aborted) throw new Cancelado();
				if (reescritas.get(chave) === reescrita) reescritas.delete(chave);
				const novo = await gravarBlocoReescrito(
					dados,
					materia,
					curso,
					modulo,
					licao,
					bloco,
					resposta.resultado,
					{ retornoId, modelo: prompt.modelo, prompt: usadoComMetodo(prompt.usado, metodo), custo: resposta.custo },
					daSessao(),
				);
				mostrarModulo(materia, curso, novo);
				await mostrarEstado(dados, materia, curso);
			});
		} catch (erro) {
			if (reescritas.get(chave) === reescrita) reescritas.delete(chave);
			if (pastaDados !== dados || erro instanceof Cancelado || sinal.aborted) return;
			const mensagem = mensagemDe(erro, "reescrever_bloco");
			if (!reescrita.aceita) {
				mostrar("erro", { mensagem, ao: "reescrever_bloco", materia, curso, modulo, ...comPedido });
				return;
			}
			mostrar("erro", { mensagem, ao: "reescrever_bloco", materia, curso, modulo });
			await mostrarNaTrava(dados, materia, curso, "reescrever_bloco");
		} finally {
			if (reescritas.get(chave) === reescrita) reescritas.delete(chave);
		}
	};

	/** A origem do bloco para o contexto dos eventos das respostas (a mesma do avaliou_bloco: origemDoBloco). */
	const origemPara = (dados: string) => (modulo: ModuloGerado, licao: string, bloco: Bloco) => origemDoBloco(dados, modulo, licao, bloco);

	/**
	 * Confere uma tentativa já marcada em conferencias (pela resposta ou por
	 * corrigir): fora da trava, chama o modelo (a pergunta pelo
	 * verificacao.md com a metodologia pergunta.md e validarAvaliacao; a
	 * dissertativa pelo corretor, corrigirPelaRubrica; temperatura 0, com a
	 * nova tentativa) e, dentro dela, grava a conferência e o evento
	 * (gravarConferencia) e manda o módulo (com o pedido, quando veio de
	 * corrigir) e o estado. Se a resposta mudou nesse meio-tempo, a
	 * conferência é jogada fora (nada gravado) e o módulo vai como está. Com
	 * erro, o erro (ao "corrigir", com o bloco) e o módulo como está: a
	 * tentativa fica sem avaliação ou correção, e corrigir tenta de novo.
	 * Cancelada (fim da sessão), nada.
	 */
	const conferir = async (dados: string, materia: string, curso: string, modulo: string, alvo: AConferir, pedido: string | undefined) => {
		const chave = chaveDoModulo(materia, curso, modulo);
		const { controle, bloco, licao } = alvo;
		const sinal = controle.signal;
		const comPedido = pedido ? { pedido } : {};
		const depois = `A resposta da questão ${bloco.id} continua sem ${bloco.tipo === "dissertativa" ? "correção" : "conferência"}.`;
		try {
			let conferencia: Conferencia;
			let corretor: Corretor;
			if (bloco.tipo === "dissertativa") {
				const corrigida = await corrigirPelaRubrica(registro, { caminhoPrompt: caminhoCorretor, pastaMetodo }, bloco, alvo.alvo.texto, sinal, depois);
				conferencia = { tipo: "dissertativa", correcao: corrigida.correcao };
				corretor = { modelo: corrigida.correcao.modelo, prompt: corrigida.prompt, custo: corrigida.correcao.custo };
			} else if (bloco.tipo === "verificacao") {
				const prompt = await lerPrompt(caminhoVerificacao);
				const metodo = await lerMetodo(pastaMetodo, METODO_VERIFICACAO);
				if (!registro) throw new ErroModulo("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo que confere a pergunta.");
				const modelo = resolverModelo(registro, prompt.modelo, "da conferência da pergunta");
				const mensagem = mensagemDaVerificacao({ pergunta: bloco.pergunta, respostaEsperada: bloco.respostaEsperada, explicacoes: explicacoesAntes(licao, bloco.id), texto: alvo.alvo.texto });
				const resposta = await pedirJson(registro, modelo, instrucoesComMetodo(prompt.instrucoes, metodo), mensagem, (texto) => validarAvaliacao(objetoJsonDoModelo(texto)), sinal, {
					temperatura: 0,
					maxTokens: MAX_TOKENS_VERIFICACAO,
					formato: '{"avaliacao": "certa" | "parcial" | "errada", "retorno": "…"}',
					oQue: "a conferência da pergunta",
					depois,
				});
				conferencia = { tipo: "verificacao", ...resposta.resultado, modelo: prompt.modelo, custo: resposta.custo };
				corretor = { modelo: prompt.modelo, prompt: usadoComMetodo(prompt.usado, metodo), custo: resposta.custo };
			} else {
				throw new ErroModulo(`A questão ${bloco.id} é um quiz; ele é conferido sem modelo.`);
			}
			await naTrava(materia, async () => {
				if (sinal.aborted) throw new Cancelado();
				tirarConferindo(chave, bloco.id, controle);
				const novo = await gravarConferencia(dados, materia, curso, modulo, alvo.alvo, conferencia, { ...daSessao(), origem: origemPara(dados), corretor });
				// A resposta mudou enquanto era conferida: a conferência é jogada fora, e o módulo vai como está.
				const atual = novo ?? (await lerModulo(dados, materia, curso, modulo));
				if (!atual) throw new ErroModulo(`O módulo ${modulo} não existe mais.`);
				mostrarModulo(materia, curso, atual, pedido);
				if (novo) await mostrarEstado(dados, materia, curso);
			});
		} catch (erro) {
			tirarConferindo(chave, bloco.id, controle);
			if (pastaDados !== dados || erro instanceof Cancelado || sinal.aborted) return;
			mostrar("erro", { mensagem: mensagemDe(erro, "corrigir"), ao: "corrigir", materia, curso, modulo, bloco: bloco.id, ...comPedido });
			await naTrava(materia, async () => {
				if (pastaDados !== dados) return;
				const atual = await lerModulo(dados, materia, curso, modulo);
				if (atual) mostrarModulo(materia, curso, atual);
			}).catch(() => undefined);
		} finally {
			tirarConferindo(chave, bloco.id, controle);
		}
	};

	/**
	 * Grava a resposta da tela (responder; gravarResposta, na trava): o quiz
	 * já sai conferido, com o evento; o "Não sei" também. Manda o módulo com o
	 * pedido (com corrigindo, na pergunta e na dissertativa) e o estado (o
	 * progresso); a pergunta e a dissertativa vão em seguida para a
	 * conferência do modelo (conferir), que chega num módulo sem pedido.
	 */
	const responder = async (dados: string, materia: string, curso: string, modulo: string, dadosAcao: DadosAcao, pedido: string | undefined) => {
		const chave = chaveDoModulo(materia, curso, modulo);
		const entrada = { confianca: dadosAcao.confianca, escolha: dadosAcao.escolha, texto: dadosAcao.texto, naoSei: dadosAcao.naoSei, tempoMs: dadosAcao.tempoMs };
		const aConferir = await naTrava(materia, async (): Promise<AConferir | undefined> => {
			const gravada = await gravarResposta(dados, materia, curso, modulo, dadosAcao.bloco, entrada, { ...daSessao(), origem: origemPara(dados) });
			const marcada = gravada.alvo
				? { alvo: gravada.alvo, controle: marcarConferindo(chave, gravada.alvo), licao: gravada.aplicada.licao, bloco: gravada.aplicada.bloco }
				: undefined;
			// A resposta está gravada: o pedido vai aqui; a conferência chega depois, num módulo sem pedido.
			mostrarModulo(materia, curso, gravada.modulo, pedido);
			await mostrarEstado(dados, materia, curso);
			return marcada;
		});
		if (aConferir) await conferir(dados, materia, curso, modulo, aConferir, undefined);
	};

	/**
	 * Tenta de novo a conferência que falhou (corrigir): na trava, a tentativa
	 * que espera a conferência (alvoParaCorrigir; uma já conferida, um quiz ou
	 * uma que está sendo conferida agora é erro), e manda o módulo com
	 * corrigindo, sem pedido; o pedido vai no módulo com a conferência, ou no
	 * erro.
	 */
	const corrigir = async (dados: string, materia: string, curso: string, modulo: string, dadosAcao: DadosAcao, pedido: string | undefined) => {
		const chave = chaveDoModulo(materia, curso, modulo);
		const aConferir = await naTrava(materia, async (): Promise<AConferir> => {
			const { modulo: lido, alvo } = await alvoParaCorrigir(dados, materia, curso, modulo, dadosAcao.bloco);
			const emAndamento = conferencias.get(chave)?.get(alvo.bloco);
			if (emAndamento && JSON.stringify(emAndamento.alvo) === JSON.stringify(alvo)) throw new ErroModulo(`A resposta da questão ${alvo.bloco} já está sendo conferida.`);
			const { licao, bloco } = questaoDoModulo(lido, alvo.bloco);
			const controle = marcarConferindo(chave, alvo);
			mostrarModulo(materia, curso, lido);
			return { alvo, controle, licao, bloco };
		});
		await conferir(dados, materia, curso, modulo, aConferir, pedido);
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
		for (const reescrita of reescritas.values()) reescrita.controle.abort();
		reescritas.clear();
		for (const doModulo of conferencias.values()) for (const conferindo of doModulo.values()) conferindo.controle.abort();
		conferencias.clear();
		retornos.clear();
		erros.clear();
		avisos.clear();
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

	// O mapa da matéria mudou ou deu erro (as mensagens do painel do mapa pela
	// ponte): as gerações da matéria que esperam o mapa conferem de novo; um
	// erro de mapeamento de um material esperado deixa ele sem mapa.
	pi.events.on("interface:mostrar", (recebido) => {
		const { painel, acao, dados } = (recebido ?? {}) as { painel?: unknown; acao?: unknown; dados?: { materia?: unknown; arquivo?: unknown } };
		if (painel !== PAINEL_MAPA || !pastaDados || typeof dados?.materia !== "string") return;
		for (const [chave, geracao] of geracoes) {
			if (!chave.startsWith(`${dados.materia}/`) || geracao.etapa !== "mapa") continue;
			if (acao === "erro" && typeof dados.arquivo === "string" && geracao.esperando?.includes(dados.arquivo)) geracao.falhasDoMapa.add(dados.arquivo);
			geracao.acordar?.();
		}
	});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_MODULOS || !ACOES.includes(acao as AcaoDaTela)) return;
		const dadosAcao = (bruto ?? {}) as DadosAcao;
		const materia = dadosAcao.materia;
		if (typeof materia !== "string") return;
		// Sem session_start, esta cópia não é a da sessão (a carga a mais ao
		// recarregar o código, como em mapa.ts): ela fica calada, senão cada
		// ação seria feita em dobro (e o modelo, chamado em dobro).
		const dados = pastaDados;
		if (!dados) return;
		const ao = acao as AcaoDaTela;
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
						avisos.delete(chaveDoModulo(materia, curso, modulo));
						await mostrarEstado(dados, materia, curso, pedido);
					});
				} else if (ao === "responder") {
					await responder(dados, materia, curso, modulo, dadosAcao, pedido);
				} else if (ao === "corrigir") {
					await corrigir(dados, materia, curso, modulo, dadosAcao, pedido);
				} else if (ao === "encerrar") {
					// "Ver a resposta-modelo": a dissertativa corrigida passa a encerrada (sem evento; o progresso não muda).
					await naTrava(materia, async () => {
						const encerrado = await gravarEncerrada(dados, materia, curso, modulo, dadosAcao.bloco);
						mostrarModulo(materia, curso, encerrado, pedido);
					});
				} else if (ao === "retorno") {
					await avaliarBloco(dados, materia, curso, modulo, dadosAcao, pedido, false);
				} else if (ao === "avaliar_bloco") {
					await avaliarBloco(dados, materia, curso, modulo, dadosAcao, pedido, true);
				} else if (ao === "avaliar_licao") {
					await avaliarLicao(dados, materia, curso, modulo, dadosAcao, pedido);
				} else if (ao === "reescrever_bloco") {
					await reescrever(dados, materia, curso, modulo, dadosAcao, pedido);
				} else if (ao === "cancelar") {
					// Para a geração ou a reescrita de um bloco do módulo (o que estava gravado fica).
					const chave = chaveDo(materia, curso);
					const emAndamento = geracoes.get(chave);
					if (emAndamento?.modulo === modulo) {
						emAndamento.controle.abort();
						geracoes.delete(chave);
					}
					const reescrevendo = reescritas.get(chave);
					if (reescrevendo?.modulo === modulo) {
						reescrevendo.controle.abort();
						reescritas.delete(chave);
					}
					erros.delete(chaveDoModulo(materia, curso, modulo));
					avisos.delete(chaveDoModulo(materia, curso, modulo));
					await naTrava(materia, () => mostrarEstado(dados, materia, curso, pedido));
				} else if (ao === "abrir") {
					await naTrava(materia, async () => {
						const lido = await lerModulo(dados, materia, curso, modulo);
						if (!lido) throw new ErroModulo(`O módulo ${modulo} ainda não foi gerado.`);
						mostrarModulo(materia, curso, lido);
					});
				} else if (ao === "concluir") {
					// Na trava do curso (a da matéria): grava o concluidoEm e o
					// concluiu_modulo, manda o módulo novo (para a visão dele) e o
					// estado com o pedido (a resposta da tela).
					await naTrava(materia, async () => {
						const emAndamento = geracoes.get(chaveDo(materia, curso));
						if (emAndamento?.modulo === modulo) throw new ErroModulo("Este módulo está sendo gerado. Pare a geração antes de concluí-lo.");
						const concluido = await concluirModulo(dados, materia, curso, modulo, daSessao());
						erros.delete(chaveDoModulo(materia, curso, modulo));
						avisos.delete(chaveDoModulo(materia, curso, modulo));
						mostrarModulo(materia, curso, concluido);
						await mostrarEstado(dados, materia, curso, pedido);
					});
				}
			} catch (erro) {
				const comBloco = ACOES_DA_QUESTAO.includes(ao) && typeof dadosAcao.bloco === "string" && dadosAcao.bloco ? { bloco: dadosAcao.bloco } : {};
				mostrar("erro", { mensagem: mensagemDe(erro, ao), ao, materia, curso, ...comModulo, ...comBloco, ...comPedido });
			}
		})();
	});

	// O painel escrita (docs/escrita.md, "Ponte"): listar, salvar e apagar as
	// regras, cada um na trava do escrita.json; a resposta é "regras" (com o
	// pedido) ou "erro". Sem session_start, calada como o resto.
	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = (recebido ?? {}) as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_ESCRITA || !ACOES_ESCRITA.includes(acao as keyof AcoesEscrita)) return;
		const dados = pastaDados;
		if (!dados) return;
		const ao = acao as keyof AcoesEscrita;
		const dadosAcao = (typeof bruto === "object" && bruto !== null ? bruto : {}) as { pedido?: unknown; regra?: unknown; id?: unknown };
		const pedido = typeof dadosAcao.pedido === "string" ? dadosAcao.pedido : undefined;
		const comPedido = pedido ? { pedido } : {};
		void naTravaEscrita(async () => {
			if (pastaDados !== dados) return;
			if (ao === "listar") {
				mostrarEscrita("regras", { regras: (await lerEscrita(dados)).regras, ...comPedido });
			} else if (ao === "salvar") {
				const regra = dadosAcao.regra as { materia?: unknown } | undefined;
				const materia = typeof regra === "object" && regra !== null ? regra.materia : undefined;
				// Uma regra de uma matéria só vale para uma matéria que existe (o id vem da tela).
				if (typeof materia === "string" && materia && !(await materiaExiste(dados, materia))) throw new ErroEscrita(`Não achei a matéria "${materia}".`);
				const { regras } = await salvarRegra(dados, dadosAcao.regra as EntradaRegra, daSessao());
				mostrarEscrita("regras", { regras, ...comPedido });
			} else {
				if (typeof dadosAcao.id !== "string" || !dadosAcao.id) throw new ErroEscrita("Falta o id da regra.");
				const regras = await apagarRegra(dados, dadosAcao.id, daSessao());
				mostrarEscrita("regras", { regras, ...comPedido });
			}
		}).catch((erro: unknown) => {
			if (pastaDados !== dados) return;
			mostrarEscrita("erro", { mensagem: mensagemDaEscrita(erro, ao), ao, ...comPedido });
		});
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
			"Read a generated module of a course (from ler_curso's skeleton: module ids m1, m2…): whether the user has concluded it, its lessons (title, goal, concepts) and every block as text, in order — the explanations in full (with their format: worked example, example with steps to complete, open problem or concept presentation, and whether it goes beyond the material), the comprehension checks and the questions (context, question, options), with the material references. By default the answer key is left out (expected answers, the correct option, the misconception behind each wrong option, rubrics and model answers); pass comGabarito: true only when you need it, e.g. to discuss a question the user already answered. A module not generated yet (or waiting for material) says so. In a notebook conversation, the subject is the conversation's. Read only: never change a module.",
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
				const concluido = lido.situacao === "gerado" && Boolean(lido.concluidoEm);
				return {
					content: [{ type: "text", text: texto }],
					details: { materia, curso: curso.id, modulo: lido.id, situacao: lido.situacao, concluido, comGabarito: params.comGabarito === true },
				};
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "ler") }], details: undefined, isError: true };
			}
		},
	});
}
