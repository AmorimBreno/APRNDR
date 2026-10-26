// Mapa de conteúdo da matéria (item 4.4, docs/mapa-conteudo.md). Arquivo do
// projeto, não do learn. As regras (fusão, operações, aprovação) e o disco
// ficam em ../lib/mapa.ts e ../lib/mapa-tipos.ts; aqui ficam:
// - o mapeamento pelo modelo: o prompt e o modelo vêm de ../prompts/mapeador.md
//   (frontmatter "model: provedor/id"), a chamada vai pelo ctx.modelRegistry
//   do pi, sem passar pela conversa, com temperatura 0. Um arquivo grande vai
//   em partes, uma chamada por parte, cada uma vendo o mapa já fundido;
// - duas filas por matéria: uma trava curta para todo ler-mudar-gravar do
//   mapa-conteudo.json (operação, aprovação, fusão de uma parte, remoção) e
//   uma fila de trabalhos de mapeamento, um arquivo por vez. A chamada ao
//   modelo acontece fora da trava, então uma operação do Breno nunca espera
//   um mapeamento de minutos, e a fusão seguinte lê o mapa do disco (com a
//   operação dentro);
// - os gatilhos: "materiais:pronto" (o arquivo pendente entra na fila),
//   "materiais:removido" (as referências saem) e os botões da tela;
// - a ponte com a tela (painel "mapa", docs/ponte-de-eventos.md): abrir,
//   mapear, refazer, cancelar, operar, aprovar e do_tema; a extensão responde
//   com "mapa" (o estado inteiro) e "erro", sempre passageiros (gravar: false);
// - o mapa a partir do tema de um curso (do_tema, docs/cursos.md): o prompt e
//   o modelo vêm de ../prompts/mapa-do-tema.md; a chamada vai fora da trava,
//   como a do mapeador, e a fusão (fundirTema) dentro dela. Um por matéria;
//   cancelar também o para;
// - a ferramenta só de leitura do professor, ler_mapa_conteudo. Numa conversa
//   de caderno, ela fica na matéria da conversa.
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type AcoesMapa,
	contarMapa,
	dividirEmPartes,
	ErroMapa,
	type EstadoMapa,
	fundirResultado,
	fundirTema,
	gravarMapa,
	lerMapa,
	lerPendentes,
	lerTrechos,
	type MapaConteudo,
	mapaVazio,
	marcarArquivoMapeado,
	type MensagemErroMapa,
	PAINEL_MAPA,
	type PendenteMapa,
	pastaExtraidoArquivo,
	type ResultadoMapeador,
	registrarAprovacaoMapa,
	registrarMapaDoTema,
	registrarMapeamento,
	registrarMaterialRemovidoDoMapa,
	registrarRevisaoMapa,
	removerArquivoDoMapa,
	semFonte,
	type TrechoDoArquivo,
	tirarReferenciasDoArquivo,
	aprovar as aprovarMapa,
	aplicarOperacoes,
} from "../lib/mapa.ts";
import { TIPOS_CURSO, type TipoCurso } from "../lib/curso-tipos.ts";
import { objetoJsonDoModelo } from "../lib/json-do-modelo.ts";
import { arquivoMateria, ErroMaterias } from "../lib/materias.ts";
import { materiaDaConversa } from "./notas.ts";

/** O prompt do mapeador (frontmatter com o modelo e o prompt no corpo). */
export const CAMINHO_PROMPT = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "mapeador.md");

/** O prompt do mapa a partir do tema (mesmo formato do mapeador.md). */
export const CAMINHO_PROMPT_TEMA = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "mapa-do-tema.md");

/** Uma chamada ao modelo que demora mais que isto é desistida (o arquivo fica pendente). */
export const TEMPO_CHAMADA_MS = 5 * 60_000;

/** O teto de tokens da resposta de uma parte. */
const MAX_TOKENS_SAIDA = 16_000;

/** Para o custo estimado: uns tantos tokens de saída por parte, e 4 caracteres por token na entrada. */
const TOKENS_SAIDA_ESTIMADOS = 2000;
const CARACTERES_POR_TOKEN = 4;

/** Até quantos caracteres ler_mapa_conteudo devolve de uma vez. */
const LIMITE_LEITURA = 40_000;

/** O que a extensão usa do registro de modelos do pi (ctx.modelRegistry). */
export type RegistroMapa = Pick<ExtensionContext["modelRegistry"], "find" | "hasConfiguredAuth" | "complete">;
type Modelo = NonNullable<ReturnType<RegistroMapa["find"]>>;
type Contexto = Parameters<RegistroMapa["complete"]>[1];
type Mensagem = Contexto["messages"][number];
type RespostaModelo = Awaited<ReturnType<RegistroMapa["complete"]>>;

/** Um trecho como vai para o modelo. */
type TrechoComTexto = TrechoDoArquivo & { texto: string };

/** O mapeamento foi cancelado (pelo botão, pela remoção do material ou pelo fim da sessão): nada de erro na tela. */
class Cancelado extends Error {
	constructor() {
		super("cancelado");
		this.name = "Cancelado";
	}
}

/** Sem prompt, sem modelo ou sem credencial: nenhum arquivo da fila vai conseguir; a fila é esvaziada. */
class ErroConfiguracao extends ErroMapa {}

// --- O prompt e o modelo -------------------------------------------------------

/**
 * Lê o mapeador.md: o "model" do frontmatter (---…---, uma linha "model: x")
 * e o corpo, que é o prompt. Leitor mínimo de propósito: a extensão do perfil
 * não carrega o pi em tempo de execução (nos testes ele não é resolvido daqui).
 */
export function lerPromptMapeador(conteudo: string, caminho: string = CAMINHO_PROMPT): { modelo: string; instrucoes: string } {
	const normalizado = conteudo.replace(/\r\n/g, "\n");
	const achado = /^---\n([\s\S]*?)\n---\n?/.exec(normalizado);
	const modelo = achado?.[1]
		?.split("\n")
		.map((linha) => /^model\s*:\s*(.+)$/.exec(linha.trim())?.[1])
		.find((valor) => valor !== undefined)
		?.trim()
		.replace(/^["']|["']$/g, "");
	const instrucoes = (achado ? normalizado.slice(achado[0].length) : normalizado).trim();
	if (!modelo) throw new ErroConfiguracao(`O prompt ${caminho} não diz o modelo: falta "model: provedor/id" no frontmatter.`);
	if (!instrucoes) throw new ErroConfiguracao(`O prompt ${caminho} está vazio.`);
	return { modelo, instrucoes };
}

async function lerPrompt(caminho: string): Promise<{ modelo: string; instrucoes: string }> {
	let conteudo: string;
	try {
		conteudo = await readFile(caminho, "utf8");
	} catch (erro) {
		throw new ErroConfiguracao(`Não consegui ler o prompt ${caminho}: ${(erro as Error).message}`);
	}
	return lerPromptMapeador(conteudo, caminho);
}

/** "provedor/id" (o id pode ter barras) no registro do pi; sem credencial, ErroConfiguracao. Com credencial: false, só acha (para o preço). */
export function resolverModelo(registro: RegistroMapa, nome: string, credencial = true): Modelo {
	const barra = nome.indexOf("/");
	const provedor = barra > 0 ? nome.slice(0, barra).trim() : "";
	const id = barra > 0 ? nome.slice(barra + 1).trim() : "";
	if (!provedor || !id) throw new ErroConfiguracao(`O modelo do mapeador "${nome}" não está no formato provedor/id (por exemplo openrouter/anthropic/claude-sonnet-5.5).`);
	const modelo = registro.find(provedor, id);
	if (!modelo) throw new ErroConfiguracao(`O modelo do mapeador "${nome}" não existe no registro de modelos do pi (provedor "${provedor}", id "${id}").`);
	if (credencial && !registro.hasConfiguredAuth(modelo)) {
		throw new ErroConfiguracao(
			`O modelo do mapeador "${nome}": o provedor "${provedor}" não tem credencial. Defina a variável de ambiente do provedor (por exemplo OPENROUTER_API_KEY) e reinicie o app.`,
		);
	}
	return modelo;
}

// --- A mensagem e a resposta ---------------------------------------------------

/** O mapa como o modelo vê: id, nome, descrição e fora, um por linha. */
export function mapaParaModelo(mapa: MapaConteudo): string {
	if (mapa.conceitos.length === 0) return "[]";
	const linhas = mapa.conceitos.map((conceito) =>
		JSON.stringify({ id: conceito.id, nome: conceito.nome, descricao: conceito.descricao, ...(conceito.fora ? { fora: true } : {}) }),
	);
	return `[\n${linhas.join(",\n")}\n]`;
}

/** A mensagem de uma parte: o mapa atual e os trechos (local e texto). */
export function mensagemDoMapeador(entrada: { mapa: MapaConteudo; arquivo: string; parte: number; partes: number; trechos: readonly TrechoComTexto[] }): string {
	const trechos = entrada.trechos.map((trecho) => `<trecho local=${JSON.stringify(trecho.local)}>\n${trecho.texto.trim() || "(sem texto)"}\n</trecho>`);
	return [
		`Arquivo: ${entrada.arquivo}${entrada.partes > 1 ? ` (parte ${entrada.parte} de ${entrada.partes}; as partes anteriores já estão no mapa atual)` : ""}.`,
		entrada.mapa.conceitos.length
			? `Mapa atual da matéria (${entrada.mapa.conceitos.length} conceitos):\n${mapaParaModelo(entrada.mapa)}`
			: "Mapa atual da matéria: vazio (todos os conceitos são novos, com id null).",
		`Locais válidos (copie exatamente): ${entrada.trechos.map((trecho) => JSON.stringify(trecho.local)).join(", ")}`,
		`Trechos:\n\n${trechos.join("\n\n")}`,
	].join("\n\n");
}

/**
 * A lista "conceitos" do objeto JSON da resposta (objetoJsonDoModelo: ```json
 * em volta ou texto antes e depois). Fora do formato, um Error com o motivo.
 */
function conceitosDaResposta(texto: string): unknown[] {
	const conceitos = objetoJsonDoModelo(texto).conceitos;
	if (!Array.isArray(conceitos)) throw new Error('falta o campo "conceitos" com uma lista');
	return conceitos;
}

/**
 * Lê a resposta do modelo como o JSON do contrato ({conceitos: [{id, nome,
 * descricao, locais}]}), tolerando ```json em volta ou texto antes e depois.
 * Fora do formato, um Error com o motivo (vai para a nova tentativa).
 */
export function lerRespostaMapeador(texto: string): ResultadoMapeador {
	return {
		conceitos: conceitosDaResposta(texto).map((item: unknown, indice) => {
			const conceito = item as Record<string, unknown> | null;
			const onde = `conceitos[${indice}]`;
			if (typeof conceito !== "object" || conceito === null || Array.isArray(conceito)) throw new Error(`${onde} não é um objeto`);
			if (typeof conceito.nome !== "string") throw new Error(`${onde} não tem "nome" em texto`);
			if (!Array.isArray(conceito.locais) || conceito.locais.some((local) => typeof local !== "string")) throw new Error(`${onde} não tem "locais" como lista de textos`);
			if (conceito.id !== undefined && conceito.id !== null && typeof conceito.id !== "string") throw new Error(`${onde} tem "id" que não é texto nem null`);
			if (conceito.descricao !== undefined && typeof conceito.descricao !== "string") throw new Error(`${onde} tem "descricao" que não é texto`);
			return { id: typeof conceito.id === "string" ? conceito.id : null, nome: conceito.nome, descricao: typeof conceito.descricao === "string" ? conceito.descricao : "", locais: conceito.locais as string[] };
		}),
	};
}

/** Lê a resposta do mapa do tema ({conceitos: [{nome, descricao}]}), como lerRespostaMapeador. */
export function lerRespostaTema(texto: string): { conceitos: Array<{ nome: string; descricao: string }> } {
	return {
		conceitos: conceitosDaResposta(texto).map((item: unknown, indice) => {
			const conceito = item as Record<string, unknown> | null;
			const onde = `conceitos[${indice}]`;
			if (typeof conceito !== "object" || conceito === null || Array.isArray(conceito)) throw new Error(`${onde} não é um objeto`);
			if (typeof conceito.nome !== "string") throw new Error(`${onde} não tem "nome" em texto`);
			if (conceito.descricao !== undefined && typeof conceito.descricao !== "string") throw new Error(`${onde} tem "descricao" que não é texto`);
			return { nome: conceito.nome, descricao: typeof conceito.descricao === "string" ? conceito.descricao : "" };
		}),
	};
}

/** A mensagem do mapa do tema: o tema, o tipo e o motivo do curso e os nomes do mapa atual (para não repetir). */
export function mensagemDoTema(entrada: { tema: string; tipo?: TipoCurso; motivo?: string; mapa: MapaConteudo }): string {
	const tipos: Record<TipoCurso, string> = { teorico: "teórico", aplicado: "aplicado", misto: "misto (teoria e aplicação)" };
	const nomes = entrada.mapa.conceitos.map((conceito) => `- ${conceito.nome}`);
	return [
		`Tema do curso: ${entrada.tema}`,
		...(entrada.tipo ? [`Tipo do curso: ${tipos[entrada.tipo]}`] : []),
		...(entrada.motivo ? [`Motivo do aluno: ${entrada.motivo}`] : []),
		nomes.length ? `Mapa atual da matéria (${nomes.length} conceitos; não repita estes nomes):\n${nomes.join("\n")}` : "Mapa atual da matéria: vazio.",
	].join("\n\n");
}

const usuario = (texto: string): Mensagem => ({ role: "user", content: [{ type: "text", text: texto }], timestamp: Date.now() });

const textoDa = (resposta: RespostaModelo) =>
	resposta.content
		.filter((parte): parte is Extract<RespostaModelo["content"][number], { type: "text" }> => parte.type === "text")
		.map((parte) => parte.text)
		.join("")
		.trim();

/** Uma chamada ao modelo, com o tempo limite e o sinal do trabalho. Cancelado se o sinal abortou. */
async function chamar(registro: RegistroMapa, modelo: Modelo, instrucoes: string, mensagens: Mensagem[], sinal: AbortSignal): Promise<RespostaModelo> {
	if (sinal.aborted) throw new Cancelado();
	const limite = AbortSignal.timeout(TEMPO_CHAMADA_MS);
	const demorou = () => new ErroMapa(`O modelo demorou mais de ${TEMPO_CHAMADA_MS / 60_000} minutos para responder.`);
	let resposta: RespostaModelo;
	try {
		resposta = await registro.complete(
			modelo,
			{ systemPrompt: instrucoes, messages: mensagens },
			{ signal: AbortSignal.any([sinal, limite]), temperature: 0, maxTokens: MAX_TOKENS_SAIDA },
		);
	} catch (erro) {
		if (sinal.aborted) throw new Cancelado();
		if (limite.aborted) throw demorou();
		throw new ErroMapa(`A chamada ao modelo falhou: ${(erro as Error).message}`);
	}
	if (resposta.stopReason === "aborted" || resposta.stopReason === "error") {
		if (sinal.aborted) throw new Cancelado();
		if (limite.aborted) throw demorou();
		throw new ErroMapa(`O modelo respondeu com erro: ${resposta.errorMessage ?? resposta.stopReason}`);
	}
	return resposta;
}

/**
 * Mapeia uma parte: chama o modelo e lê o JSON; fora do formato, tenta uma
 * vez de novo dizendo o erro. Falhando de novo, ErroMapa (com o gasto).
 */
export async function mapearParte(
	registro: RegistroMapa,
	modelo: Modelo,
	instrucoes: string,
	entrada: Parameters<typeof mensagemDoMapeador>[0],
	sinal: AbortSignal,
): Promise<{ resultado: ResultadoMapeador; custo: number; tentativas: number }> {
	return pedirJson(registro, modelo, instrucoes, mensagemDoMapeador(entrada), lerRespostaMapeador, sinal, "O arquivo continua pendente.");
}

/**
 * Chama o modelo com a mensagem e lê a resposta com `ler`; fora do formato,
 * tenta uma vez de novo dizendo o erro. Falhando de novo, ErroMapa com o
 * gasto (e `depois`, o que ficou como estava).
 */
async function pedirJson<T>(
	registro: RegistroMapa,
	modelo: Modelo,
	instrucoes: string,
	texto: string,
	ler: (texto: string) => T,
	sinal: AbortSignal,
	depois: string,
): Promise<{ resultado: T; custo: number; tentativas: number }> {
	const mensagens: Mensagem[] = [usuario(texto)];
	let custo = 0;
	let motivo = "";
	for (let tentativa = 1; tentativa <= 2; tentativa++) {
		const resposta = await chamar(registro, modelo, instrucoes, mensagens, sinal);
		custo += resposta.usage?.cost?.total ?? 0;
		try {
			return { resultado: ler(textoDa(resposta)), custo, tentativas: tentativa };
		} catch (erro) {
			motivo = (erro as Error).message;
			if (resposta.stopReason === "length") motivo += " (a resposta foi cortada no limite de tamanho)";
			mensagens.push(
				resposta,
				usuario(`A sua resposta não veio no formato pedido: ${motivo}. Responda de novo só com o JSON {"conceitos": [...]}, sem nenhum texto antes ou depois.`),
			);
		}
	}
	throw new ErroMapa(`O modelo não devolveu o JSON do mapa, nem na segunda tentativa (${motivo}). ${depois} Gasto: US$ ${custo.toFixed(4)}.`);
}

// --- Custo estimado ------------------------------------------------------------

/**
 * US$ estimados para mapear um arquivo: por parte, os caracteres dos trechos,
 * do mapa e do prompt divididos por 4 na entrada e uns 2000 tokens de saída,
 * pelo preço do modelo (por milhão de tokens). null sem preço conhecido.
 */
export function estimarCusto(
	modelo: Pick<Modelo, "cost"> | undefined,
	arquivo: { caracteres: number; partes: number },
	extra: { mapa: number; prompt: number },
): number | null {
	const preco = modelo?.cost;
	if (!preco || (!preco.input && !preco.output)) return null;
	const entrada = (arquivo.caracteres + arquivo.partes * (extra.mapa + extra.prompt)) / CARACTERES_POR_TOKEN;
	const saida = arquivo.partes * TOKENS_SAIDA_ESTIMADOS;
	return (entrada * preco.input + saida * preco.output) / 1_000_000;
}

// --- Texto para o professor ----------------------------------------------------

/** As referências agrupadas por arquivo: "aula-04.pdf: página 12, página 13; l1.py: função f". */
function textoDasReferencias(conceito: MapaConteudo["conceitos"][number]): string {
	if (semFonte(conceito)) return "sem fonte";
	if (conceito.referencias.length === 0) return conceito.origem === "tema" ? "do tema de um curso, sem material" : "escrito pelo usuário";
	const porArquivo = new Map<string, string[]>();
	for (const referencia of conceito.referencias) {
		const locais = porArquivo.get(referencia.arquivo) ?? [];
		locais.push(referencia.local);
		porArquivo.set(referencia.arquivo, locais);
	}
	return [...porArquivo].map(([arquivo, locais]) => `${arquivo}: ${locais.join(", ")}`).join("; ");
}

function linhaDoConceito(conceito: MapaConteudo["conceitos"][number], rotulo: string): string {
	const marcas = [...(conceito.prioridade !== "normal" ? [conceito.prioridade] : []), ...(conceito.novo ? ["novo"] : [])];
	return `${rotulo} ${conceito.nome}${marcas.length ? ` [${marcas.join(", ")}]` : ""}${conceito.descricao ? ` — ${conceito.descricao}` : ""} (${textoDasReferencias(conceito)})`;
}

/** O texto de ler_mapa_conteudo: a situação, os de dentro numerados e, com incluirFora, os de fora à parte. */
export function textoDoMapa(materia: string, mapa: MapaConteudo, extra: { incluirFora?: boolean; pendentes?: string[]; mapeando?: string[] } = {}): string {
	const contagem = contarMapa(mapa);
	const dia = mapa.aprovadoEm?.slice(0, 10);
	const situacao =
		mapa.situacao === "aprovado"
			? `aprovado pelo usuário em ${dia}`
			: mapa.situacao === "alterado"
				? `alterado depois da aprovação de ${dia} (o usuário ainda não aprovou as mudanças)`
				: "rascunho (o usuário ainda não aprovou)";
	const linhas = [`# Mapa de conteúdo de ${materia}`, `Situação: ${situacao}.`];
	const resumo = [`${contagem.dentro} conceitos dentro`, `${contagem.fora} fora`];
	if (contagem.semFonte) resumo.push(`${contagem.semFonte} sem fonte`);
	if (contagem.novos) resumo.push(`${contagem.novos} novos desde a aprovação`);
	linhas.push(`${resumo.join(", ")}.`);
	const mapeados = Object.keys(mapa.arquivos);
	if (mapeados.length) linhas.push(`Arquivos mapeados: ${mapeados.join(", ")}.`);
	if (extra.mapeando?.length) linhas.push(`Mapeando agora ou na fila: ${extra.mapeando.join(", ")}.`);
	if (extra.pendentes?.length) linhas.push(`Arquivos ainda não mapeados: ${extra.pendentes.join(", ")}.`);
	const dentro = mapa.conceitos.filter((conceito) => !conceito.fora);
	const fora = mapa.conceitos.filter((conceito) => conceito.fora);
	if (mapa.conceitos.length === 0) {
		linhas.push("", "O mapa ainda está vazio.");
	} else {
		const largura = Math.max(2, String(dentro.length).length);
		linhas.push("", ...(dentro.length ? dentro.map((conceito, indice) => linhaDoConceito(conceito, `${String(indice + 1).padStart(largura, "0")}.`)) : ["(nenhum conceito dentro)"]));
		if (extra.incluirFora && fora.length) linhas.push("", "Fora do mapa (o usuário tirou):", ...fora.map((conceito) => linhaDoConceito(conceito, "-")));
	}
	const texto = linhas.join("\n");
	return texto.length > LIMITE_LEITURA ? `${texto.slice(0, LIMITE_LEITURA)}\n\n[… o mapa continua; mostrei os primeiros ${LIMITE_LEITURA} caracteres]` : texto;
}

// --- A extensão -----------------------------------------------------------------

interface Trabalho {
	arquivo: string;
	controle: AbortController;
	parte: number;
	partes: number;
}

interface DaMateria {
	/** A trava curta: cada ler-mudar-gravar do mapa espera o anterior. */
	trava: Promise<unknown>;
	/** Os arquivos esperando mapeamento, na ordem. */
	fila: string[];
	/** O arquivo sendo mapeado. */
	atual?: Trabalho;
	/** A fila de trabalhos está andando. */
	rodando: boolean;
	/** Os pendentes da última leitura (ler os .md de cada trecho no Drive custa). */
	pendentes?: PendenteMapa[];
	/** O mapa a partir do tema em andamento (um por matéria). */
	tema?: { controle: AbortController };
}

interface DadosAcao {
	materia?: unknown;
	arquivos?: unknown;
	edicao?: unknown;
	pedido?: unknown;
	operacoes?: unknown;
	tema?: unknown;
	tipo?: unknown;
	motivo?: unknown;
}

const ACOES: ReadonlyArray<keyof AcoesMapa> = ["abrir", "mapear", "refazer", "cancelar", "operar", "aprovar", "do_tema"];

const mensagemDe = (erro: unknown, acao: string) =>
	erro instanceof ErroMapa || erro instanceof ErroMaterias ? erro.message : `Não consegui ${acao} o mapa de conteúdo: ${(erro as Error).message}`;

/** O caminho dentro de materiais/ de um aviso do serviço de materiais ("materias/x/materiais/listas/l1.py" → "listas/l1.py"). */
export function arquivoDoAviso(caminho: unknown): { materia: string; arquivo: string } | undefined {
	if (typeof caminho !== "string") return undefined;
	const partes = caminho.replace(/\\/g, "/").split("/");
	if (partes[0] !== "materias" || partes[2] !== "materiais" || !partes[1] || partes.length < 4) return undefined;
	return { materia: partes[1], arquivo: partes.slice(3).join("/") };
}

/** O hash do manifesto do .extraido do arquivo (o que vai para arquivos[arquivo]). */
async function hashDoManifesto(dados: string, materia: string, arquivo: string): Promise<string> {
	try {
		const manifesto = JSON.parse(await readFile(join(pastaExtraidoArquivo(dados, materia, arquivo), "manifesto.json"), "utf8")) as { hash?: unknown };
		if (typeof manifesto.hash === "string") return manifesto.hash;
	} catch {
		// cai no erro abaixo
	}
	throw new ErroMapa(`Não achei o extraído de "${arquivo}" (o manifesto.json do .extraido falta ou está ilegível).`);
}

export interface OpcoesMapa {
	/** O mapeador.md (nos testes, um prompt de mentira). */
	caminhoPrompt?: string;
	/** O mapa-do-tema.md (nos testes, um prompt de mentira). */
	caminhoPromptTema?: string;
}

export default function mapa(pi: ExtensionAPI, opcoes: OpcoesMapa = {}) {
	const caminhoPrompt = opcoes.caminhoPrompt ?? CAMINHO_PROMPT;
	const caminhoPromptTema = opcoes.caminhoPromptTema ?? CAMINHO_PROMPT_TEMA;
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	let registro: RegistroMapa | undefined;
	/** As aberturas da seção (edicao) que já gravaram revisou_mapa. */
	const edicoesRegistradas = new Set<string>();
	const materias = new Map<string, DaMateria>();

	const daMateria = (materia: string): DaMateria => {
		let estado = materias.get(materia);
		if (!estado) {
			estado = { trava: Promise.resolve(), fila: [], rodando: false };
			materias.set(materia, estado);
		}
		return estado;
	};
	const daSessao = () => (sessao ? { sessao } : {});

	const mostrar = (acao: "mapa" | "erro", dados: EstadoMapa | MensagemErroMapa) => pi.events.emit("interface:mostrar", { painel: PAINEL_MAPA, acao, dados, gravar: false });
	const mostrarErro = (dados: MensagemErroMapa) => mostrar("erro", dados);

	/** Roda `tarefa` na trava curta da matéria (depois da anterior, mesmo que ela tenha falhado). */
	const naTrava = <T>(materia: string, tarefa: () => Promise<T>): Promise<T> => {
		const estado = daMateria(materia);
		const resultado = estado.trava.then(tarefa, tarefa);
		estado.trava = resultado.catch(() => undefined);
		return resultado;
	};

	/** Os pendentes de novo, do disco (e o cache da matéria). */
	const recalcularPendentes = async (dados: string, materia: string, mapaAtual?: MapaConteudo): Promise<PendenteMapa[]> => {
		const mapaLido = mapaAtual ?? (await lerMapa(dados, materia));
		const lidos = await lerPendentes(dados, materia, mapaLido);
		let modelo: Modelo | undefined;
		let tamanhoPrompt = 0;
		try {
			const prompt = await lerPrompt(caminhoPrompt);
			tamanhoPrompt = prompt.instrucoes.length;
			if (registro) modelo = resolverModelo(registro, prompt.modelo, false);
		} catch {
			// sem prompt ou sem modelo: custo desconhecido (o erro aparece ao mapear)
		}
		const tamanhoMapa = mapaParaModelo(mapaLido).length;
		const pendentes = lidos.map((pendente): PendenteMapa => {
			const partes = dividirEmPartes(pendente.trechos).length;
			return {
				arquivo: pendente.arquivo,
				tipo: pendente.tipo,
				caracteres: pendente.caracteres,
				partes,
				custoEstimado: estimarCusto(modelo, { caracteres: pendente.caracteres, partes }, { mapa: tamanhoMapa, prompt: tamanhoPrompt }),
			};
		});
		daMateria(materia).pendentes = pendentes;
		return pendentes;
	};

	/** Manda o estado inteiro. Chamado sempre dentro da trava, para um estado velho nunca chegar depois de um novo. */
	const mostrarEstado = async (dados: string, materia: string, mapaAtual?: MapaConteudo, pedido?: string) => {
		const estado = daMateria(materia);
		const mapaLido = mapaAtual ?? (await lerMapa(dados, materia));
		const pendentes = estado.pendentes ?? (await recalcularPendentes(dados, materia, mapaLido));
		const atual = estado.atual;
		mostrar("mapa", {
			materia,
			mapa: mapaLido,
			pendentes,
			andamento: atual ? { arquivo: atual.arquivo, parte: atual.parte, partes: atual.partes } : null,
			fila: [...estado.fila],
			...(pedido ? { pedido } : {}),
			...(estado.tema ? { montandoTema: true } : {}),
		});
	};

	/** O estado pela trava; um erro vira "erro" para a tela. */
	const mostrarNaTrava = (dados: string, materia: string, ao: string, pedido?: string) =>
		naTrava(materia, () => mostrarEstado(dados, materia, undefined, pedido)).catch((erro: unknown) =>
			mostrarErro({ mensagem: mensagemDe(erro, "ler"), ao, materia, ...(pedido ? { pedido } : {}) }),
		);

	/** Mapeia um arquivo inteiro, parte por parte. Lança Cancelado se o trabalho foi abortado. */
	const mapearArquivo = async (dados: string, materia: string, trabalho: Trabalho) => {
		const { arquivo } = trabalho;
		const sinal = trabalho.controle.signal;
		const prompt = await lerPrompt(caminhoPrompt);
		if (!registro) throw new ErroConfiguracao("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo do mapeador.");
		const modelo = resolverModelo(registro, prompt.modelo);
		const hash = await hashDoManifesto(dados, materia, arquivo);
		const partes = dividirEmPartes(await lerTrechos(dados, materia, arquivo));
		trabalho.partes = partes.length;

		// Regra 1, uma vez: as referências antigas do arquivo saem.
		await naTrava(materia, async () => {
			if (sinal.aborted) throw new Cancelado();
			const atual = await lerMapa(dados, materia);
			if (!atual.conceitos.some((conceito) => conceito.referencias.some((referencia) => referencia.arquivo === arquivo))) return;
			await gravarMapa(dados, materia, tirarReferenciasDoArquivo(atual, arquivo).mapa);
		});

		let custo = 0;
		let novos = 0;
		let descartados = 0;
		for (const [indice, trechos] of partes.entries()) {
			trabalho.parte = indice + 1;
			await naTrava(materia, () => mostrarEstado(dados, materia));
			// Fora da trava: a chamada pode levar minutos. O mapa lido aqui só serve para o modelo ver.
			const visto = await lerMapa(dados, materia);
			const parte = await mapearParte(registro, modelo, prompt.instrucoes, { mapa: visto, arquivo, parte: indice + 1, partes: partes.length, trechos }, sinal);
			custo += parte.custo;
			await naTrava(materia, async () => {
				if (sinal.aborted) throw new Cancelado();
				// Lido de novo: uma operação do Breno pode ter mudado o mapa durante a chamada.
				const fundido = fundirResultado(await lerMapa(dados, materia), { arquivo, trechos, resultado: parte.resultado });
				novos += fundido.novos;
				descartados += fundido.descartados;
				await gravarMapa(dados, materia, fundido.mapa);
				if (indice + 1 < partes.length) await mostrarEstado(dados, materia, fundido.mapa);
			});
		}

		await naTrava(materia, async () => {
			if (sinal.aborted) throw new Cancelado();
			const marcado = marcarArquivoMapeado(await lerMapa(dados, materia), arquivo, { hash, modelo: prompt.modelo, custo });
			await gravarMapa(dados, materia, marcado);
			// Todo conceito que cita o arquivo agora foi criado ou reforçado por este mapeamento (a regra 1 tirou as antigas).
			const reforcados = Math.max(0, marcado.arquivos[arquivo]!.conceitos - novos);
			await registrarMapeamento(dados, materia, { arquivo, novos, reforcados, descartados, partes: partes.length, custo, modelo: prompt.modelo }, daSessao());
		});
	};

	/** Anda a fila de trabalhos da matéria, um arquivo por vez. */
	const andarFila = async (dados: string, materia: string) => {
		const estado = daMateria(materia);
		if (estado.rodando) return;
		estado.rodando = true;
		try {
			while (estado.fila.length > 0 && pastaDados === dados) {
				const trabalho: Trabalho = { arquivo: estado.fila.shift()!, controle: new AbortController(), parte: 0, partes: 0 };
				estado.atual = trabalho;
				try {
					await mapearArquivo(dados, materia, trabalho);
				} catch (erro) {
					if (!(erro instanceof Cancelado) && !trabalho.controle.signal.aborted) {
						// Sem prompt, modelo ou credencial, nenhum outro vai conseguir: um erro só.
						if (erro instanceof ErroConfiguracao) estado.fila.length = 0;
						mostrarErro({ mensagem: mensagemDe(erro, "mapear"), ao: "mapear", materia, arquivo: trabalho.arquivo });
					}
				} finally {
					estado.atual = undefined;
				}
				if (pastaDados !== dados) break;
				await naTrava(materia, async () => {
					await recalcularPendentes(dados, materia);
					await mostrarEstado(dados, materia);
				}).catch((erro: unknown) => mostrarErro({ mensagem: mensagemDe(erro, "ler"), ao: "mapear", materia }));
			}
		} finally {
			estado.rodando = false;
		}
	};

	/** Põe arquivos na fila (sem repetir) e anda a fila. Um arquivo em andamento só volta se mudou (aviso do material). */
	const enfileirar = (dados: string, materia: string, arquivos: readonly string[], mesmoEmAndamento = false) => {
		const estado = daMateria(materia);
		for (const arquivo of arquivos) {
			if (estado.fila.includes(arquivo)) continue;
			if (estado.atual?.arquivo === arquivo && !mesmoEmAndamento) continue;
			estado.fila.push(arquivo);
		}
		void andarFila(dados, materia);
	};

	/**
	 * O mapa a partir do tema (do_tema): manda o estado com montandoTema, chama
	 * o modelo fora da trava (como o mapeador, com a nova tentativa), e dentro
	 * dela funde (fundirTema), grava, registra montou_mapa_do_tema e manda o
	 * estado com o pedido. Cancelado (pelo botão), manda o estado com o pedido;
	 * com erro, o erro e o estado. Depois do fim da sessão, nada.
	 */
	const montarDoTema = async (dados: string, materia: string, entrada: { tema: string; tipo?: TipoCurso; motivo?: string }, pedido: string | undefined) => {
		const estado = daMateria(materia);
		if (estado.tema) throw new ErroMapa("O mapa a partir do tema já está sendo montado nesta matéria. Espere terminar (ou cancele) antes de pedir de novo.");
		const trabalho = { controle: new AbortController() };
		estado.tema = trabalho;
		const sinal = trabalho.controle.signal;
		const comPedido = pedido ? { pedido } : {};
		try {
			await naTrava(materia, () => mostrarEstado(dados, materia));
			const prompt = await lerPrompt(caminhoPromptTema);
			if (!registro) throw new ErroConfiguracao("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo do mapa do tema.");
			const modelo = resolverModelo(registro, prompt.modelo);
			// Fora da trava: a chamada pode levar minutos. O mapa lido aqui só serve para o modelo ver os nomes.
			const visto = await lerMapa(dados, materia);
			const resposta = await pedirJson(registro, modelo, prompt.instrucoes, mensagemDoTema({ ...entrada, mapa: visto }), lerRespostaTema, sinal, "O mapa não mudou.");
			await naTrava(materia, async () => {
				if (sinal.aborted) throw new Cancelado();
				// Lido de novo: uma operação ou um mapeamento pode ter mudado o mapa durante a chamada.
				const fundido = fundirTema(await lerMapa(dados, materia), resposta.resultado.conceitos);
				if (fundido.novos > 0) await gravarMapa(dados, materia, fundido.mapa);
				await registrarMapaDoTema(dados, materia, { tema: entrada.tema, novos: fundido.novos, custo: resposta.custo, modelo: prompt.modelo }, daSessao());
				if (estado.tema === trabalho) estado.tema = undefined;
				await mostrarEstado(dados, materia, fundido.mapa, pedido);
			});
		} catch (erro) {
			if (estado.tema === trabalho) estado.tema = undefined;
			if (pastaDados !== dados) return;
			if (erro instanceof Cancelado || sinal.aborted) {
				await mostrarNaTrava(dados, materia, "do_tema", pedido);
				return;
			}
			mostrarErro({ mensagem: mensagemDe(erro, "montar"), ao: "do_tema", materia, ...comPedido });
			await mostrarNaTrava(dados, materia, "do_tema");
		} finally {
			if (estado.tema === trabalho) estado.tema = undefined;
		}
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

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
		registro = ctx.modelRegistry;
	});

	// Fim da sessão (sair, recarregar, trocar de conversa): o mapeamento em
	// andamento para (o arquivo fica pendente) e a cópia fica calada.
	pi.on("session_shutdown", () => {
		pastaDados = undefined;
		for (const estado of materias.values()) {
			estado.fila.length = 0;
			estado.atual?.controle.abort();
			estado.tema?.controle.abort();
		}
	});

	// O serviço de materiais avisa que um arquivo ficou pronto: se ele estiver pendente (pelo hash), entra na fila.
	pi.events.on("materiais:pronto", (recebido) => {
		const dados = pastaDados;
		const aviso = arquivoDoAviso((recebido as { caminho?: unknown } | undefined)?.caminho);
		if (!dados || !aviso) return;
		const { materia, arquivo } = aviso;
		void naTrava(materia, async () => {
			const pendentes = await recalcularPendentes(dados, materia);
			if (pendentes.some((pendente) => pendente.arquivo === arquivo)) enfileirar(dados, materia, [arquivo], true);
			await mostrarEstado(dados, materia);
		}).catch((erro: unknown) => mostrarErro({ mensagem: mensagemDe(erro, "atualizar"), ao: "material", materia, arquivo }));
	});

	// Um material saiu: as referências dele saem do mapa e ele sai da fila (ou para, se estava sendo mapeado).
	pi.events.on("materiais:removido", (recebido) => {
		const dados = pastaDados;
		const aviso = arquivoDoAviso((recebido as { caminho?: unknown } | undefined)?.caminho);
		if (!dados || !aviso) return;
		const { materia, arquivo } = aviso;
		const estado = daMateria(materia);
		estado.fila = estado.fila.filter((item) => item !== arquivo);
		if (estado.atual?.arquivo === arquivo) estado.atual.controle.abort();
		void naTrava(materia, async () => {
			const atual = await lerMapa(dados, materia);
			const estava = Object.hasOwn(atual.arquivos, arquivo) || atual.conceitos.some((conceito) => conceito.referencias.some((referencia) => referencia.arquivo === arquivo));
			let mapaNovo = atual;
			if (estava) {
				const removido = removerArquivoDoMapa(atual, arquivo);
				mapaNovo = removido.mapa;
				await gravarMapa(dados, materia, mapaNovo);
				await registrarMaterialRemovidoDoMapa(dados, materia, arquivo, removido.semFonte, daSessao());
			}
			await recalcularPendentes(dados, materia, mapaNovo);
			await mostrarEstado(dados, materia, mapaNovo);
		}).catch((erro: unknown) => mostrarErro({ mensagem: mensagemDe(erro, "atualizar"), ao: "material", materia, arquivo }));
	});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_MAPA || !ACOES.includes(acao as keyof AcoesMapa)) return;
		const dadosAcao = (bruto ?? {}) as DadosAcao;
		const materia = dadosAcao.materia;
		if (typeof materia !== "string") return;
		// Sem session_start, esta cópia não é a da sessão: ao recarregar o código, o
		// núcleo carrega as extensões uma vez a mais (montagem.ts), e essa carga
		// continua ouvindo o barramento (packages/core/src/ponte.ts). Ela fica calada:
		// se respondesse, mapearia e gastaria em dobro.
		const dados = pastaDados;
		if (!dados) return;
		const pedido = typeof dadosAcao.pedido === "string" ? dadosAcao.pedido : undefined;
		const comPedido = pedido ? { pedido } : {};
		const ao = acao as keyof AcoesMapa;

		void (async () => {
			if (!(await materiaExiste(dados, materia))) {
				mostrarErro({ mensagem: `Não achei a matéria "${materia}".`, ao, materia, ...comPedido });
				return;
			}
			const estado = daMateria(materia);
			try {
				if (ao === "abrir") {
					await naTrava(materia, async () => {
						const atual = await lerMapa(dados, materia);
						await recalcularPendentes(dados, materia, atual);
						await mostrarEstado(dados, materia, atual);
					});
				} else if (ao === "mapear") {
					const pedidos = Array.isArray(dadosAcao.arquivos) ? dadosAcao.arquivos.filter((item): item is string => typeof item === "string") : undefined;
					await naTrava(materia, async () => {
						const pendentes = await recalcularPendentes(dados, materia);
						const lista = pendentes.map((pendente) => pendente.arquivo).filter((arquivo) => !pedidos || pedidos.includes(arquivo));
						enfileirar(dados, materia, lista);
						await mostrarEstado(dados, materia);
					});
				} else if (ao === "refazer") {
					await naTrava(materia, async () => {
						// Todos os arquivos com manifesto: os pendentes de um mapa sem nenhum arquivo.
						const todos = await lerPendentes(dados, materia, mapaVazio());
						enfileirar(dados, materia, todos.map((item) => item.arquivo));
						await recalcularPendentes(dados, materia);
						await mostrarEstado(dados, materia);
					});
				} else if (ao === "cancelar") {
					estado.fila.length = 0;
					estado.atual?.controle.abort();
					// O mapa do tema também para; o estado já sai sem montandoTema (o do_tema manda o seu, com o pedido, ao terminar).
					estado.tema?.controle.abort();
					estado.tema = undefined;
					await mostrarNaTrava(dados, materia, ao);
				} else if (ao === "operar") {
					const { edicao, operacoes } = dadosAcao;
					if (typeof edicao !== "string" || !Array.isArray(operacoes)) {
						mostrarErro({ mensagem: "Operação do mapa sem edicao ou sem operacoes.", ao, materia, ...comPedido });
						return;
					}
					await naTrava(materia, async () => {
						const resultado = aplicarOperacoes(await lerMapa(dados, materia), operacoes as AcoesMapa["operar"]["operacoes"]);
						if (resultado.mudou) {
							await gravarMapa(dados, materia, resultado.mapa);
							const primeira = (operacoes[0] as { tipo?: unknown } | undefined)?.tipo;
							if (!edicoesRegistradas.has(edicao) && typeof primeira === "string") {
								await registrarRevisaoMapa(dados, materia, edicao, primeira as AcoesMapa["operar"]["operacoes"][number]["tipo"], daSessao());
								edicoesRegistradas.add(edicao);
							}
						}
						await mostrarEstado(dados, materia, resultado.mapa, pedido);
					});
				} else if (ao === "aprovar") {
					await naTrava(materia, async () => {
						const aprovado = aprovarMapa(await lerMapa(dados, materia));
						await gravarMapa(dados, materia, aprovado);
						await registrarAprovacaoMapa(dados, materia, aprovado, daSessao());
						await mostrarEstado(dados, materia, aprovado, pedido);
					});
				} else if (ao === "do_tema") {
					const tema = typeof dadosAcao.tema === "string" ? dadosAcao.tema.trim().replace(/\s+/g, " ") : "";
					if (!tema) {
						mostrarErro({ mensagem: "O mapa a partir do tema precisa do tema (o nome do curso).", ao, materia, ...comPedido });
						return;
					}
					const { tipo, motivo } = dadosAcao;
					if (tipo !== undefined && tipo !== null && !(TIPOS_CURSO as readonly unknown[]).includes(tipo)) {
						mostrarErro({ mensagem: `O tipo do curso precisa ser um de: ${TIPOS_CURSO.join(", ")} (veio "${String(tipo)}").`, ao, materia, ...comPedido });
						return;
					}
					const motivoLimpo = typeof motivo === "string" ? motivo.trim() : "";
					await montarDoTema(dados, materia, { tema, ...(tipo ? { tipo: tipo as TipoCurso } : {}), ...(motivoLimpo ? { motivo: motivoLimpo } : {}) }, pedido);
				}
			} catch (erro) {
				mostrarErro({ mensagem: mensagemDe(erro, ao === "aprovar" ? "aprovar" : ao === "operar" ? "mudar" : ao === "do_tema" ? "montar" : "ler"), ao, materia, ...comPedido });
			}
		})();
	});

	/** A matéria que a ferramenta lê: a da conversa, se ela for de um caderno; senão, a do parâmetro. */
	const escolherMateria = (pedida: string | undefined, entradas: Parameters<typeof materiaDaConversa>[0]): { materia: string } | { erro: string } => {
		const daConversa = materiaDaConversa(entradas);
		if (daConversa) {
			if (pedida && pedida !== daConversa) return { erro: `Esta conversa é do caderno "${daConversa}": o mapa de outras matérias fica de fora aqui.` };
			return { materia: daConversa };
		}
		if (!pedida) return { erro: "Diga a matéria (o id, de listar_materias)." };
		return { materia: pedida };
	};

	pi.registerTool({
		name: "ler_mapa_conteudo",
		label: "Ler mapa de conteúdo",
		description:
			"Read a subject's content map: the ordered list of concepts the course material teaches, with priority, a one-line description and where each appears (file and page). The user reviews and approves the map; read it to plan lessons and to know what is in scope. In a notebook conversation, the subject is the conversation's. Read only: never change the map.",
		parameters: Type.Object({
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
			incluirFora: Type.Optional(Type.Boolean({ description: "Also list the concepts the user took out of the map (default false)." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			const { materia } = escolha;
			if (!(await materiaExiste(ctx.cwd, materia))) return { content: [{ type: "text", text: `Não achei a matéria "${materia}".` }], details: undefined, isError: true };
			try {
				const mapaLido = await lerMapa(ctx.cwd, materia);
				const estado = materias.get(materia);
				const pendentes = (estado?.pendentes ?? (await lerPendentes(ctx.cwd, materia, mapaLido))).map((pendente) => pendente.arquivo);
				const mapeando = estado ? [...(estado.atual ? [estado.atual.arquivo] : []), ...estado.fila] : [];
				const texto = textoDoMapa(materia, mapaLido, { incluirFora: params.incluirFora ?? false, pendentes, mapeando });
				return { content: [{ type: "text", text: texto }], details: { materia, situacao: mapaLido.situacao, ...contarMapa(mapaLido) } };
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "ler") }], details: undefined, isError: true };
			}
		},
	});
}
