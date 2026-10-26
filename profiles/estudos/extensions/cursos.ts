// Cursos da matéria e o guia de criação (item 5, partes A e B, docs/cursos.md).
// Arquivo do projeto, não do learn. As regras (validação, o que cada etapa
// invalida, o diagnóstico) e o disco ficam em ../lib/curso-tipos.ts,
// ../lib/cursos.ts, ../lib/diagnostico-tipos.ts e ../lib/diagnostico.ts; aqui
// ficam:
// - a ponte com a tela (painel "cursos", docs/ponte-de-eventos.md): listar,
//   abrir, comecar, confirmar, descartar e prontos; a extensão responde com "lista",
//   "curso", "descartado" e "erro", sempre passageiros (gravar: false). Uma
//   trava por matéria para todo ler-mudar-gravar dos cursos. Na etapa
//   Materiais, a lista de arquivos é a dos materiais prontos na hora
//   (materiaisProntos): o que a tela mandar é ignorado; toda mensagem "curso"
//   leva os materiais prontos de agora (prontos), para a tela avisar quando
//   eles mudaram desde a etapa Materiais;
// - o diagnóstico (parte B): autoavaliar, gerar_diagnostico, responder,
//   corrigir e concluir_diagnostico. As questões vêm do modelo de
//   ../prompts/diagnostico.md e a correção da dissertativa, do de
//   ../prompts/corretor.md (frontmatter "model: provedor/id"), pelo
//   ctx.modelRegistry do pi, como o mapeador (extensions/mapa.ts): a chamada
//   vai fora da trava, com uma nova tentativa se a resposta não vier no
//   formato, e o resultado é gravado dentro dela. Toda mensagem "curso" passa
//   pelo paraATela (sem o gabarito enquanto falta responder alguma questão) e
//   diz se as questões estão sendo geradas (gerandoDiagnostico) e quais
//   dissertativas estão sendo corrigidas (corrigindo);
// - a ferramenta só de leitura do professor, ler_curso. Numa conversa de
//   caderno, ela fica na matéria da conversa.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type AcoesCursos,
	comecarCurso,
	conferirOrdem,
	confirmarNoDisco,
	type Curso,
	descartarCurso,
	ErroCurso,
	ETAPAS,
	type Escopo,
	type Etapa,
	lerCurso,
	listarCursos,
	materiaisMudaram,
	materiaisProntos,
	type MensagensCursos,
	nomeDaEtapa,
	PAINEL_CURSOS,
	resumoDoCurso,
	type TipoCurso,
	type DadosObjetivo,
} from "../lib/cursos.ts";
import {
	autoavaliacaoCompleta,
	concluirDiagnostico,
	type ConceitosEscolhidos,
	type DiagnosticoEmAndamento,
	ErroDiagnostico,
	escolherConceitos,
	faltaCorrigir,
	faltaResponder,
	gravarCorrecao,
	gravarQuestoes,
	gravarResposta,
	type NivelAutoavaliacao,
	NOMES_NIVEL,
	paraATela,
	type PromptUsado,
	type QuestaoDissertativa,
	type RespostaDissertativa,
	resumoDoDiagnostico,
	salvarAutoavaliacao,
	type TrechosDoConceito,
	trechosDosConceitos,
	validarCorrecao,
	validarQuestoes,
} from "../lib/diagnostico.ts";
import { ErroMapa, lerMapa, type MapaConteudo } from "../lib/mapa.ts";
import { arquivoMateria, ErroMaterias } from "../lib/materias.ts";
import { lerPromptMapeador } from "./mapa.ts";
import { materiaDaConversa } from "./notas.ts";

/** Até quantos caracteres ler_curso devolve de uma vez. */
const LIMITE_LEITURA = 40_000;

/** O prompt das questões do diagnóstico (frontmatter com o modelo e o prompt no corpo, como o mapeador.md). */
export const CAMINHO_PROMPT_DIAGNOSTICO = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "diagnostico.md");

/** O prompt do corretor da dissertativa (mesmo formato). */
export const CAMINHO_PROMPT_CORRETOR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "corretor.md");

/** Uma chamada ao modelo que demora mais que isto é desistida. */
export const TEMPO_CHAMADA_MS = 5 * 60_000;

/** O teto de tokens da resposta (o modelo pode raciocinar antes de responder). */
const MAX_TOKENS_QUESTOES = 32_000;
const MAX_TOKENS_CORRECAO = 16_000;

/**
 * As ações da tela: as da lib (AcoesCursos) e "corrigir {materia, curso,
 * pedido, questao}", que tenta de novo a correção de uma dissertativa que
 * falhou (docs/cursos.md, "Ponte"; o tipo ainda não está em curso-tipos.ts).
 */
type AcaoDaTela = keyof AcoesCursos | "corrigir";

const ACOES: ReadonlyArray<AcaoDaTela> = [
	"listar",
	"abrir",
	"comecar",
	"confirmar",
	"descartar",
	"prontos",
	"autoavaliar",
	"gerar_diagnostico",
	"responder",
	"corrigir",
	"concluir_diagnostico",
];

interface DadosAcao {
	materia?: unknown;
	curso?: unknown;
	pedido?: unknown;
	basico?: unknown;
	etapa?: unknown;
	dados?: unknown;
	niveis?: unknown;
	questao?: unknown;
	confianca?: unknown;
	escolha?: unknown;
	texto?: unknown;
	tempoMs?: unknown;
}

const FRASES: Record<AcaoDaTela | "ler", string> = {
	listar: "listar os cursos",
	abrir: "abrir o curso",
	comecar: "começar o curso",
	confirmar: "confirmar a etapa do curso",
	descartar: "descartar o curso",
	prontos: "ler os materiais prontos",
	autoavaliar: "salvar a autoavaliação",
	gerar_diagnostico: "gerar as questões do diagnóstico",
	responder: "gravar a resposta",
	corrigir: "corrigir a dissertativa",
	concluir_diagnostico: "concluir o diagnóstico",
	ler: "ler o curso",
};

const mensagemDe = (erro: unknown, acao: keyof typeof FRASES) =>
	erro instanceof ErroCurso || erro instanceof ErroMapa || erro instanceof ErroMaterias ? erro.message : `Não consegui ${FRASES[acao]}: ${(erro as Error).message}`;

// --- O modelo --------------------------------------------------------------------

/** O que a extensão usa do registro de modelos do pi (ctx.modelRegistry). */
export type RegistroCursos = Pick<ExtensionContext["modelRegistry"], "find" | "hasConfiguredAuth" | "complete">;
type Modelo = NonNullable<ReturnType<RegistroCursos["find"]>>;
type Contexto = Parameters<RegistroCursos["complete"]>[1];
type Mensagem = Contexto["messages"][number];
type RespostaModelo = Awaited<ReturnType<RegistroCursos["complete"]>>;

/** A geração ou a correção foi cancelada (pelo fim da sessão): nada de erro na tela. */
class Cancelado extends Error {
	constructor() {
		super("cancelado");
		this.name = "Cancelado";
	}
}

/** O prompt lido: o modelo, as instruções e o nome do arquivo com o hash do conteúdo (para o contexto dos eventos). */
interface PromptLido {
	modelo: string;
	instrucoes: string;
	usado: PromptUsado;
}

/** O hash curto (12 hex do sha256) do conteúdo do prompt. */
export const hashDoPrompt = (conteudo: string) => createHash("sha256").update(conteudo, "utf8").digest("hex").slice(0, 12);

/** Lê o prompt (frontmatter com "model: provedor/id" e o corpo), como o mapeador.md. */
async function lerPrompt(caminho: string): Promise<PromptLido> {
	let conteudo: string;
	try {
		conteudo = await readFile(caminho, "utf8");
	} catch (erro) {
		throw new ErroDiagnostico(`Não consegui ler o prompt ${caminho}: ${(erro as Error).message}`);
	}
	return { ...lerPromptMapeador(conteudo, caminho), usado: { nome: basename(caminho), hash: hashDoPrompt(conteudo) } };
}

/** O nome e o hash do prompt, para os eventos que não chamam o modelo; sem o arquivo, nada (não impede gravar). */
async function promptSeHouver(caminho: string): Promise<{ prompt?: PromptUsado }> {
	try {
		return { prompt: (await lerPrompt(caminho)).usado };
	} catch {
		return {};
	}
}

/** "provedor/id" (o id pode ter barras) no registro do pi, com credencial. */
function resolverModelo(registro: RegistroCursos, nome: string, para: string): Modelo {
	const barra = nome.indexOf("/");
	const provedor = barra > 0 ? nome.slice(0, barra).trim() : "";
	const id = barra > 0 ? nome.slice(barra + 1).trim() : "";
	if (!provedor || !id) throw new ErroDiagnostico(`O modelo ${para} "${nome}" não está no formato provedor/id (por exemplo openrouter/openai/gpt-6.1-sol).`);
	const modelo = registro.find(provedor, id);
	if (!modelo) throw new ErroDiagnostico(`O modelo ${para} "${nome}" não existe no registro de modelos do pi (provedor "${provedor}", id "${id}").`);
	if (!registro.hasConfiguredAuth(modelo)) {
		throw new ErroDiagnostico(
			`O modelo ${para} "${nome}": o provedor "${provedor}" não tem credencial. Defina a variável de ambiente do provedor (por exemplo OPENROUTER_API_KEY) e reinicie o app.`,
		);
	}
	return modelo;
}

const usuario = (texto: string): Mensagem => ({ role: "user", content: [{ type: "text", text: texto }], timestamp: Date.now() });

const textoDa = (resposta: RespostaModelo) =>
	resposta.content
		.filter((parte): parte is Extract<RespostaModelo["content"][number], { type: "text" }> => parte.type === "text")
		.map((parte) => parte.text)
		.join("")
		.trim();

/** O objeto JSON da resposta, tolerando ```json em volta ou texto antes e depois. Fora disso, um Error com o motivo. */
export function objetoDaResposta(texto: string): unknown {
	const bruto = texto.trim();
	const cercado = /```(?:json)?\s*([\s\S]*?)```/i.exec(bruto)?.[1];
	let candidato = (cercado ?? bruto).trim();
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

interface OpcoesChamada {
	/** Sem ela, a do modelo. */
	temperatura?: number;
	maxTokens: number;
	/** O formato pedido, para a nova tentativa ('{"questoes": [...]}'). */
	formato: string;
	/** O que se pede, para a frase do erro ("as questões do diagnóstico"). */
	oQue: string;
	/** O que ficou como estava, para a frase do erro. */
	depois: string;
}

/** Uma chamada ao modelo, com o tempo limite e o sinal do trabalho. Cancelado se o sinal abortou. */
async function chamar(registro: RegistroCursos, modelo: Modelo, instrucoes: string, mensagens: Mensagem[], sinal: AbortSignal, opcoes: OpcoesChamada): Promise<RespostaModelo> {
	if (sinal.aborted) throw new Cancelado();
	const limite = AbortSignal.timeout(TEMPO_CHAMADA_MS);
	const demorou = () => new ErroDiagnostico(`O modelo demorou mais de ${TEMPO_CHAMADA_MS / 60_000} minutos para responder. ${opcoes.depois}`);
	let resposta: RespostaModelo;
	try {
		resposta = await registro.complete(
			modelo,
			{ systemPrompt: instrucoes, messages: mensagens },
			{ signal: AbortSignal.any([sinal, limite]), maxTokens: opcoes.maxTokens, ...(opcoes.temperatura !== undefined ? { temperature: opcoes.temperatura } : {}) },
		);
	} catch (erro) {
		if (sinal.aborted) throw new Cancelado();
		if (limite.aborted) throw demorou();
		throw new ErroDiagnostico(`A chamada ao modelo falhou: ${(erro as Error).message}. ${opcoes.depois}`);
	}
	if (resposta.stopReason === "aborted" || resposta.stopReason === "error") {
		if (sinal.aborted) throw new Cancelado();
		if (limite.aborted) throw demorou();
		throw new ErroDiagnostico(`O modelo respondeu com erro: ${resposta.errorMessage ?? resposta.stopReason}. ${opcoes.depois}`);
	}
	return resposta;
}

/**
 * Chama o modelo com a mensagem e lê a resposta com `ler` (que também confere
 * o conteúdo: validarQuestoes, validarCorrecao); fora do formato ou com
 * problema, tenta uma vez de novo dizendo o motivo. Falhando de novo,
 * ErroDiagnostico com o gasto.
 */
export async function pedirJson<T>(
	registro: RegistroCursos,
	modelo: Modelo,
	instrucoes: string,
	texto: string,
	ler: (texto: string) => T,
	sinal: AbortSignal,
	opcoes: OpcoesChamada,
): Promise<{ resultado: T; custo: number; tentativas: number }> {
	const mensagens: Mensagem[] = [usuario(texto)];
	let custo = 0;
	let motivo = "";
	for (let tentativa = 1; tentativa <= 2; tentativa++) {
		const resposta = await chamar(registro, modelo, instrucoes, mensagens, sinal, opcoes);
		custo += resposta.usage?.cost?.total ?? 0;
		try {
			return { resultado: ler(textoDa(resposta)), custo, tentativas: tentativa };
		} catch (erro) {
			motivo = (erro as Error).message;
			if (resposta.stopReason === "length") motivo += " (a resposta foi cortada no limite de tamanho)";
			mensagens.push(resposta, usuario(`A sua resposta não veio como o pedido: ${motivo}. Responda de novo só com o JSON ${opcoes.formato}, sem nenhum texto antes ou depois.`));
		}
	}
	throw new ErroDiagnostico(`O modelo não devolveu ${opcoes.oQue}, nem na segunda tentativa (${motivo}). ${opcoes.depois} Gasto: US$ ${custo.toFixed(4)}.`);
}

// --- As mensagens aos modelos ------------------------------------------------------

const ESCOPOS: Record<Escopo, string> = { so_material: "só o material", material_base: "o material como base, podendo ir além", livre: "livre (sem depender de material)" };
const TIPOS: Record<TipoCurso, string> = { teorico: "teórico", aplicado: "aplicado", misto: "misto (teoria e aplicação)" };

/** Um conceito pedido, como vai para o modelo das questões. */
export interface ConceitoParaQuestoes {
	id: string;
	nome: string;
	descricao: string;
	nivel: NivelAutoavaliacao | undefined;
}

/**
 * A mensagem do modelo das questões: o curso (nome, tipo, escopo, motivo), as
 * questões pedidas em ordem e, para cada conceito pedido, o nome, a
 * descrição, o nível que o aluno disse e, com `trechos` (escopos com
 * material), os trechos do material citados nele.
 */
export function mensagemDoDiagnostico(entrada: {
	nome: string;
	objetivo: DadosObjetivo;
	pedidos: ConceitosEscolhidos;
	conceitos: readonly ConceitoParaQuestoes[];
	trechos?: readonly TrechosDoConceito[];
}): string {
	const { objetivo, pedidos } = entrada;
	const escopo =
		objetivo.escopo === "so_material"
			? `${ESCOPOS.so_material} (as questões só cobram o que está nos trechos de cada conceito)`
			: objetivo.escopo === "material_base"
				? `${ESCOPOS.material_base} (os trechos mostram o que o material diz de cada conceito)`
				: ESCOPOS.livre;
	const nomes = new Map(entrada.conceitos.map((conceito) => [conceito.id, conceito.nome]));
	const pedidasAlt = pedidos.alternativas.map((id) => `alternativa sobre ${id} (${nomes.get(id) ?? id})`);
	const pedidasDis = pedidos.dissertativas.map((id) => `dissertativa sobre ${id} (${nomes.get(id) ?? id})`);
	const pedidas = [...pedidasAlt, ...pedidasDis].map((texto, indice) => `${indice + 1}. ${texto}`);
	const trechosDe = new Map((entrada.trechos ?? []).map((item) => [item.id, item.trechos]));
	const blocos = entrada.conceitos.map((conceito) => {
		const linhas = [
			`<conceito id=${JSON.stringify(conceito.id)}>`,
			`Nome: ${conceito.nome}`,
			`Descrição: ${conceito.descricao || "(sem descrição)"}`,
			`O aluno disse: ${conceito.nivel === undefined ? "(sem autoavaliação)" : NOMES_NIVEL[conceito.nivel]}`,
		];
		if (entrada.trechos) {
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
		`Curso: ${entrada.nome}`,
		`Tipo do curso: ${TIPOS[objetivo.tipo] ?? objetivo.tipo}`,
		`Escopo: ${escopo}`,
		...(objetivo.motivo ? [`Motivo do aluno: ${objetivo.motivo}`] : []),
		`Questões pedidas (${pedidas.length}, nesta ordem):\n${pedidas.join("\n")}`,
		`Conceitos:\n\n${blocos.join("\n\n")}`,
	].join("\n\n");
}

/** A mensagem do corretor: a pergunta, a rubrica, a resposta-modelo (referência) e a resposta do aluno. */
export function mensagemDoCorretor(questao: Pick<QuestaoDissertativa, "enunciado" | "rubrica" | "respostaModelo">, texto: string): string {
	const rubrica = questao.rubrica.map(
		(item, indice) => `${indice + 1}. ${JSON.stringify(item.criterio)} (até ${item.pontos} ponto${item.pontos === 1 ? "" : "s"}): ${item.descricao || "(sem descrição)"}`,
	);
	return [
		`Pergunta: ${questao.enunciado}`,
		`Rubrica (${rubrica.length} critérios, nesta ordem):\n${rubrica.join("\n")}`,
		...(questao.respostaModelo ? [`Resposta-modelo (só uma referência; outras formas de dizer a mesma coisa valem):\n${questao.respostaModelo}`] : []),
		`Resposta do aluno:\n<resposta>\n${texto}\n</resposta>`,
	].join("\n\n");
}

// --- Texto para o professor ----------------------------------------------------

const situacaoDo = (curso: Pick<Curso, "situacao" | "etapa">) =>
	curso.situacao === "pronto" ? "pronto" : `rascunho, parado na etapa ${nomeDaEtapa(curso.etapa)}`;

/** O texto de ler_curso sem curso: os cursos da matéria, um por linha. */
export function textoDaLista(materia: string, cursos: readonly Curso[], erros: ReadonlyArray<{ pasta: string; mensagem: string }> = []): string {
	const linhas = [`# Cursos de ${materia}`];
	if (cursos.length === 0) linhas.push("", "A matéria ainda não tem cursos.");
	else
		linhas.push(
			"",
			...cursos.map((curso) => `- ${curso.nome} (id ${curso.id}): ${situacaoDo(curso)}; ${curso.basico?.prazo ? `prazo ${curso.basico.prazo}` : "sem prazo"}`),
		);
	if (erros.length) linhas.push("", "Pastas de curso que não deu para ler:", ...erros.map((erro) => `- ${erro.pasta}: ${erro.mensagem}`));
	return linhas.join("\n");
}

const NOMES_RESULTADO = { certa: "certa", errada: "errada", parcial: "parcial" } as const;

/**
 * O diagnóstico para o professor: a fase e a autoavaliação; com todas as
 * questões respondidas (ou concluído), o resumo por conceito. Nunca o
 * gabarito: nem enunciados nem alternativas.
 */
function linhasDoDiagnostico(curso: Curso, nomeDe: (id: string) => string): string[] {
	const conceitos = curso.mapa?.conceitos ?? [];
	const diagnostico: DiagnosticoEmAndamento | null = curso.diagnostico ?? curso.diagnosticoEmAndamento ?? null;
	if (!diagnostico) return ["(ainda não começou)"];
	const linhas: string[] = [];
	const avaliados = conceitos.filter((id) => diagnostico.autoavaliacao[id] !== undefined).length;
	if (curso.diagnostico) linhas.push(`Concluído em ${curso.diagnostico.concluidoEm.slice(0, 10)}.`);
	else if (diagnostico.questoes.length === 0) linhas.push(`Fase: autoavaliação (${avaliados} de ${conceitos.length} conceitos com nível; as questões ainda não foram geradas).`);
	else {
		const falta = faltaResponder(diagnostico);
		const total = diagnostico.questoes.length;
		if (falta.length > 0) linhas.push(`Fase: questões (${total - falta.length} de ${total} respondidas).`);
		else {
			const semCorrecao = faltaCorrigir(diagnostico);
			linhas.push(`Fase: resultado (as ${total} questões respondidas${semCorrecao.length ? `; falta a correção de ${semCorrecao.join(", ")}` : ""}; o usuário ainda não concluiu o diagnóstico).`);
		}
	}
	linhas.push(
		"Autoavaliação:",
		...conceitos.map((id) => {
			const nivel = diagnostico.autoavaliacao[id];
			return `- ${nomeDe(id)}: ${nivel === undefined ? "sem nível" : NOMES_NIVEL[nivel]}`;
		}),
	);
	if (diagnostico.questoes.length > 0 && faltaResponder(diagnostico).length === 0) {
		const resumo = resumoDoDiagnostico(diagnostico, conceitos);
		const { total } = resumo;
		linhas.push(
			`Resultado: ${total.acertos} de ${total.alternativas} alternativas certas${total.dissertativas ? `; dissertativas: ${total.nota === null ? "sem correção" : `${Math.round(total.nota * 100)}% dos pontos`}` : ""}.`,
			"Por conceito:",
			...resumo.conceitos.map((conceito) => {
				const questoes = conceito.questoes.map((questao) => `${questao.id} ${NOMES_RESULTADO[questao.resultado]}${questao.nota ? ` ${questao.nota.total}/${questao.nota.max}` : ""}`);
				return `- ${nomeDe(conceito.id)}: ${conceito.frase}${questoes.length ? ` (${questoes.join(", ")})` : ""}`;
			}),
		);
	}
	return linhas;
}

/**
 * O texto de ler_curso com curso: o resumo do curso.json (básico, materiais,
 * objetivo, os nomes dos conceitos do curso lidos do mapa, o andamento do
 * diagnóstico) e o que falta.
 */
export function textoDoCurso(curso: Curso, extra: { mapa?: MapaConteudo; prontos?: ReadonlyArray<{ arquivo: string; hash: string }> } = {}): string {
	const linhas = [`# Curso ${curso.nome} (id ${curso.id}, matéria ${curso.materia})`, `Situação: ${situacaoDo(curso)}.`];
	const naoConfirmada = "ainda não confirmada";
	const porId = new Map((extra.mapa?.conceitos ?? []).map((conceito) => [conceito.id, conceito]));

	linhas.push("", "## Básico");
	if (curso.basico) {
		linhas.push(`Prazo: ${curso.basico.prazo ?? "sem prazo"}.`);
		if (curso.basico.prova) linhas.push(`Prova: ${curso.basico.prova}.`);
		linhas.push(`Horas por semana: ${curso.basico.horasPorSemana}.`);
	} else linhas.push(`(${naoConfirmada})`);

	linhas.push("", "## Materiais");
	if (curso.materiais) {
		linhas.push(curso.materiais.arquivos.length ? curso.materiais.arquivos.map((item) => `- ${item.arquivo}`).join("\n") : "Nenhum material (o curso não usa arquivos).");
		if (extra.prontos && materiaisMudaram(curso, extra.prontos)) linhas.push("Aviso: os materiais prontos da matéria mudaram depois desta confirmação.");
	} else linhas.push(`(${naoConfirmada})`);

	linhas.push("", "## Objetivo");
	if (curso.objetivo) {
		linhas.push(`Escopo: ${ESCOPOS[curso.objetivo.escopo] ?? curso.objetivo.escopo}.`, `Tipo: ${TIPOS[curso.objetivo.tipo] ?? curso.objetivo.tipo}.`);
		if (curso.objetivo.motivo) linhas.push(`Motivo: ${curso.objetivo.motivo}`);
	} else linhas.push(`(${naoConfirmada})`);

	linhas.push("", "## Mapa (os conceitos do curso, na ordem do mapa)");
	if (curso.mapa) {
		const largura = Math.max(2, String(curso.mapa.conceitos.length).length);
		linhas.push(
			...curso.mapa.conceitos.map((id, indice) => {
				const conceito = porId.get(id);
				const rotulo = `${String(indice + 1).padStart(largura, "0")}.`;
				if (!conceito) return `${rotulo} (${id}: não está mais no mapa da matéria)`;
				return `${rotulo} ${conceito.nome}${conceito.fora ? " [tirado do mapa da matéria depois]" : ""}${conceito.descricao ? ` — ${conceito.descricao}` : ""}`;
			}),
		);
	} else linhas.push(`(${naoConfirmada})`);

	linhas.push("", "## Diagnóstico");
	linhas.push(...linhasDoDiagnostico(curso, (id) => porId.get(id)?.nome ?? id));

	const faltam = ETAPAS.filter((etapa) => curso[etapa] === null || curso[etapa] === undefined);
	linhas.push("", faltam.length ? `Falta confirmar: ${faltam.map(nomeDaEtapa).join(", ")}.` : "Todas as etapas estão confirmadas.");
	const texto = linhas.join("\n");
	return texto.length > LIMITE_LEITURA ? `${texto.slice(0, LIMITE_LEITURA)}\n\n[… o curso continua; mostrei os primeiros ${LIMITE_LEITURA} caracteres]` : texto;
}

// --- A extensão -----------------------------------------------------------------

export interface OpcoesCursos {
	/** O diagnostico.md (nos testes, um prompt de mentira). */
	caminhoPromptDiagnostico?: string;
	/** O corretor.md (nos testes, um prompt de mentira). */
	caminhoPromptCorretor?: string;
}

/** Uma dissertativa a corrigir: a questão e a resposta como foram gravadas. */
interface ParaCorrigir {
	questao: QuestaoDissertativa;
	resposta: RespostaDissertativa;
}

export default function cursos(pi: ExtensionAPI, opcoes: OpcoesCursos = {}) {
	const caminhoDiagnostico = opcoes.caminhoPromptDiagnostico ?? CAMINHO_PROMPT_DIAGNOSTICO;
	const caminhoCorretor = opcoes.caminhoPromptCorretor ?? CAMINHO_PROMPT_CORRETOR;
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	let registro: RegistroCursos | undefined;
	/** Uma trava por matéria: cada ler-mudar-gravar dos cursos espera o anterior. */
	const travas = new Map<string, Promise<unknown>>();
	/** As gerações de questões em andamento, por "matéria/curso" (uma por curso). */
	const gerando = new Map<string, AbortController>();
	/** As correções em andamento, por "matéria/curso" e por questão. */
	const corrigindo = new Map<string, Map<string, AbortController>>();

	const daSessao = () => (sessao ? { sessao } : {});
	const chaveDo = (materia: string, curso: string) => `${materia}/${curso}`;

	const mostrar = <A extends keyof MensagensCursos>(acao: A, dados: MensagensCursos[A]) =>
		pi.events.emit("interface:mostrar", { painel: PAINEL_CURSOS, acao, dados, gravar: false });

	/** O erro de uma correção leva a questão (a tela usa; MensagemErroCursos ainda não tem o campo). */
	const mostrarErroDaQuestao = (dados: MensagensCursos["erro"], questao: string) => mostrar("erro", { ...dados, questao } as MensagensCursos["erro"]);

	/** Roda `tarefa` na trava da matéria (depois da anterior, mesmo que ela tenha falhado). */
	const naTrava = <T>(materia: string, tarefa: () => Promise<T>): Promise<T> => {
		const resultado = (travas.get(materia) ?? Promise.resolve()).then(tarefa, tarefa);
		travas.set(materia, resultado.catch(() => undefined));
		return resultado;
	};

	/** O curso como a tela pode ver: o diagnóstico em andamento sem o gabarito enquanto falta responder alguma questão. */
	const paraTela = (curso: Curso): Curso =>
		curso.diagnosticoEmAndamento ? { ...curso, diagnosticoEmAndamento: paraATela(curso.diagnosticoEmAndamento) as unknown as DiagnosticoEmAndamento } : curso;

	/**
	 * Manda o curso (sempre pelo paraATela) com os materiais prontos de agora
	 * e o que corre em segundo plano nele (gerandoDiagnostico, corrigindo).
	 * Chamado dentro da trava, para um curso velho nunca chegar depois de um novo.
	 */
	const mostrarCurso = async (dados: string, materia: string, curso: Curso, extra: { pedido?: string; invalidadas?: Etapa[]; prontos?: MensagensCursos["curso"]["prontos"] } = {}) => {
		const prontos = extra.prontos ?? (await materiaisProntos(dados, materia));
		const chave = chaveDo(materia, curso.id);
		const emCorrecao = [...(corrigindo.get(chave)?.keys() ?? [])];
		const ordem = curso.diagnosticoEmAndamento?.questoes.map((questao) => questao.id) ?? [];
		emCorrecao.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
		mostrar("curso", {
			materia,
			curso: paraTela(curso),
			...(extra.invalidadas ? { invalidadas: extra.invalidadas } : {}),
			...(extra.pedido ? { pedido: extra.pedido } : {}),
			prontos,
			...(gerando.has(chave) ? { gerandoDiagnostico: true } : {}),
			...(emCorrecao.length ? { corrigindo: emCorrecao } : {}),
		});
	};

	const mostrarLista = async (dados: string, materia: string) => {
		const { cursos: lista } = await listarCursos(dados, materia);
		mostrar("lista", { materia, cursos: lista.map(resumoDoCurso) });
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

	const marcarCorrigindo = (chave: string, questao: string): AbortController => {
		const doCurso = corrigindo.get(chave) ?? new Map<string, AbortController>();
		corrigindo.set(chave, doCurso);
		const controle = new AbortController();
		doCurso.set(questao, controle);
		return controle;
	};
	const tirarCorrigindo = (chave: string, questao: string, controle: AbortController) => {
		const doCurso = corrigindo.get(chave);
		if (doCurso?.get(questao) !== controle) return;
		doCurso.delete(questao);
		if (doCurso.size === 0) corrigindo.delete(chave);
	};

	/**
	 * Gera as questões (gerar_diagnostico): confere a ordem e a autoavaliação
	 * e manda o curso com gerandoDiagnostico; fora da trava, escolhe os
	 * conceitos, junta os trechos (escopos com material) e chama o modelo
	 * (validarQuestoes na leitura, com a nova tentativa); dentro da trava,
	 * grava (gravarQuestoes) e manda o curso com o pedido. Com erro, o erro
	 * (com o pedido) e o curso como está. Depois do fim da sessão, nada.
	 */
	const gerarQuestoes = async (dados: string, materia: string, curso: string, pedido: string | undefined) => {
		const chave = chaveDo(materia, curso);
		if (gerando.has(chave)) throw new ErroDiagnostico("As questões deste diagnóstico já estão sendo geradas. Espere terminar antes de pedir de novo.");
		const controle = new AbortController();
		gerando.set(chave, controle);
		const sinal = controle.signal;
		const comPedido = pedido ? { pedido } : {};
		let avisou = false;
		try {
			const { atual, mapa } = await naTrava(materia, async () => {
				const lido = await lerCurso(dados, materia, curso);
				conferirOrdem(lido, "diagnostico");
				if (!autoavaliacaoCompleta(lido)) throw new ErroDiagnostico("Dê um nível a todos os conceitos do curso antes de gerar as questões.");
				const mapaLido = await lerMapa(dados, materia);
				await mostrarCurso(dados, materia, lido);
				avisou = true;
				return { atual: lido, mapa: mapaLido };
			});
			const prompt = await lerPrompt(caminhoDiagnostico);
			if (!registro) throw new ErroDiagnostico("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo do diagnóstico.");
			const modelo = resolverModelo(registro, prompt.modelo, "do diagnóstico");
			const objetivo = atual.objetivo!;
			const autoavaliacao = atual.diagnosticoEmAndamento?.autoavaliacao ?? {};
			// Os conceitos do curso que ainda estão no mapa da matéria (o nome, a descrição e as referências vêm de lá).
			const porId = new Map(mapa.conceitos.map((conceito) => [conceito.id, conceito]));
			const doCurso = (atual.mapa?.conceitos ?? []).flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []));
			const pedidos = escolherConceitos(
				doCurso.map((conceito) => ({ id: conceito.id, prioridade: conceito.prioridade })),
				autoavaliacao,
				objetivo.tipo,
			);
			const pedidosIds = new Set([...pedidos.alternativas, ...pedidos.dissertativas]);
			if (pedidosIds.size === 0) throw new ErroDiagnostico("Nenhum conceito do curso está no mapa da matéria. Confirme a etapa Mapa de novo.");
			const escolhidos = doCurso.filter((conceito) => pedidosIds.has(conceito.id));
			const trechos = objetivo.escopo === "livre" ? undefined : await trechosDosConceitos(dados, materia, escolhidos);
			const mensagem = mensagemDoDiagnostico({
				nome: atual.nome,
				objetivo,
				pedidos,
				conceitos: escolhidos.map((conceito) => ({ id: conceito.id, nome: conceito.nome, descricao: conceito.descricao, nivel: autoavaliacao[conceito.id] })),
				...(trechos ? { trechos } : {}),
			});
			// Fora da trava: a chamada pode levar minutos.
			const resposta = await pedirJson(registro, modelo, prompt.instrucoes, mensagem, (texto) => validarQuestoes(objetoDaResposta(texto), pedidos), sinal, {
				maxTokens: MAX_TOKENS_QUESTOES,
				formato: '{"questoes": [...]}, com uma questão para cada uma das pedidas',
				oQue: "as questões do diagnóstico",
				depois: "O diagnóstico não mudou.",
			});
			await naTrava(materia, async () => {
				if (sinal.aborted) throw new Cancelado();
				// Lido de novo: o Mapa do curso pode ter mudado durante a chamada.
				const agora = await lerCurso(dados, materia, curso);
				const doMapa = new Set(agora.mapa?.conceitos ?? []);
				if (![...pedidosIds].every((id) => doMapa.has(id))) throw new ErroDiagnostico("O Mapa do curso mudou enquanto as questões eram geradas. Gere as questões de novo.");
				if (gerando.get(chave) === controle) gerando.delete(chave);
				const novo = await gravarQuestoes(dados, materia, curso, resposta.resultado, { modelo: prompt.modelo, custo: resposta.custo }, { ...daSessao(), prompt: prompt.usado });
				await mostrarCurso(dados, materia, novo, comPedido);
			});
		} catch (erro) {
			if (gerando.get(chave) === controle) gerando.delete(chave);
			if (pastaDados !== dados || erro instanceof Cancelado || sinal.aborted) return;
			mostrar("erro", { mensagem: mensagemDe(erro, "gerar_diagnostico"), ao: "gerar_diagnostico", materia, curso, ...comPedido });
			// O curso como está, sem gerandoDiagnostico.
			if (avisou) await naTrava(materia, async () => mostrarCurso(dados, materia, await lerCurso(dados, materia, curso))).catch(() => undefined);
		} finally {
			if (gerando.get(chave) === controle) gerando.delete(chave);
		}
	};

	/**
	 * Corrige uma dissertativa já marcada em `corrigindo` (pela resposta ou
	 * por corrigir): chama o corretor fora da trava (temperatura 0;
	 * validarCorrecao na leitura, com a nova tentativa) e, dentro dela, grava a
	 * correção (gravarCorrecao) e manda o curso (com o pedido, quando veio de
	 * corrigir). Se a resposta mudou nesse meio tempo (as questões foram
	 * geradas de novo), a correção é jogada fora. Com erro, o erro (ao
	 * "corrigir", com a questão) e o curso como está: a resposta fica sem
	 * correção, e corrigir tenta de novo.
	 */
	const corrigirDissertativa = async (dados: string, materia: string, curso: string, alvo: ParaCorrigir, controle: AbortController, pedido: string | undefined) => {
		const chave = chaveDo(materia, curso);
		const { questao, resposta } = alvo;
		const sinal = controle.signal;
		const comPedido = pedido ? { pedido } : {};
		try {
			const prompt = await lerPrompt(caminhoCorretor);
			if (!registro) throw new ErroDiagnostico("A sessão não tem o registro de modelos do pi; não dá para chamar o modelo do corretor.");
			const modelo = resolverModelo(registro, prompt.modelo, "do corretor");
			// Fora da trava: a chamada pode levar minutos.
			const corrigida = await pedirJson(
				registro,
				modelo,
				prompt.instrucoes,
				mensagemDoCorretor(questao, resposta.texto),
				(texto) => validarCorrecao(objetoDaResposta(texto), questao, { modelo: prompt.modelo, custo: 0 }),
				sinal,
				{
					temperatura: 0,
					maxTokens: MAX_TOKENS_CORRECAO,
					formato: '{"criterios": [...]}, com um item por critério da rubrica',
					oQue: "a correção da dissertativa",
					depois: `A resposta da questão ${questao.id} continua sem correção.`,
				},
			);
			const correcao = { ...corrigida.resultado, custo: corrigida.custo };
			await naTrava(materia, async () => {
				if (sinal.aborted) throw new Cancelado();
				const atual = await lerCurso(dados, materia, curso);
				const agora = atual.diagnosticoEmAndamento?.respostas[questao.id] as RespostaDissertativa | undefined;
				tirarCorrigindo(chave, questao.id, controle);
				const mesma = agora !== undefined && !agora.correcao && agora.texto === resposta.texto && agora.respondidaEm === resposta.respondidaEm;
				const novo = mesma ? await gravarCorrecao(dados, materia, curso, questao.id, correcao, { ...daSessao(), prompt: prompt.usado }) : atual;
				await mostrarCurso(dados, materia, novo, comPedido);
			});
		} catch (erro) {
			tirarCorrigindo(chave, questao.id, controle);
			if (pastaDados !== dados || erro instanceof Cancelado || sinal.aborted) return;
			mostrarErroDaQuestao({ mensagem: mensagemDe(erro, "corrigir"), ao: "corrigir", materia, curso, ...comPedido }, questao.id);
			await naTrava(materia, async () => mostrarCurso(dados, materia, await lerCurso(dados, materia, curso))).catch(() => undefined);
		} finally {
			tirarCorrigindo(chave, questao.id, controle);
		}
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
		registro = ctx.modelRegistry;
	});

	// Fim da sessão (sair, recarregar, trocar de conversa): a geração e as
	// correções em andamento param (nada é gravado) e a cópia fica calada.
	pi.on("session_shutdown", () => {
		pastaDados = undefined;
		for (const controle of gerando.values()) controle.abort();
		gerando.clear();
		for (const doCurso of corrigindo.values()) for (const controle of doCurso.values()) controle.abort();
		corrigindo.clear();
	});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_CURSOS || !ACOES.includes(acao as AcaoDaTela)) return;
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
		const curso = typeof dadosAcao.curso === "string" ? dadosAcao.curso : undefined;
		const comCurso = curso ? { curso } : {};

		void (async () => {
			if (!(await materiaExiste(dados, materia))) {
				mostrar("erro", { mensagem: `Não achei a matéria "${materia}".`, ao, materia, ...comCurso, ...comPedido });
				return;
			}
			try {
				if (ao === "listar") {
					await naTrava(materia, () => mostrarLista(dados, materia));
					return;
				}
				if (ao === "comecar") {
					await naTrava(materia, async () => {
						const novo = await comecarCurso(dados, materia, dadosAcao.basico, daSessao());
						await mostrarCurso(dados, materia, novo, comPedido);
						await mostrarLista(dados, materia);
					});
					return;
				}
				if (!curso) {
					mostrar("erro", { mensagem: "Falta o id do curso.", ao, materia, ...comPedido });
					return;
				}
				if (ao === "abrir" || ao === "prontos") {
					await naTrava(materia, async () => mostrarCurso(dados, materia, await lerCurso(dados, materia, curso)));
				} else if (ao === "confirmar") {
					await naTrava(materia, async () => {
						const etapa = dadosAcao.etapa as Parameters<typeof confirmarNoDisco>[3];
						// A foto dos materiais é a do disco na hora, nunca a que a tela mandou.
						const prontos = await materiaisProntos(dados, materia);
						const entrada = etapa === "materiais" ? { arquivos: prontos } : dadosAcao.dados;
						const resultado = await confirmarNoDisco(dados, materia, curso, etapa, entrada, daSessao());
						await mostrarCurso(dados, materia, resultado.curso, { invalidadas: resultado.invalidadas, ...comPedido, prontos });
					});
				} else if (ao === "descartar") {
					await naTrava(materia, async () => {
						const descartado = await descartarCurso(dados, materia, curso, daSessao());
						mostrar("descartado", { materia, curso: descartado.id, pedido: pedido ?? "" });
						await mostrarLista(dados, materia);
					});
				} else if (ao === "autoavaliar") {
					const contexto = { ...daSessao(), ...(await promptSeHouver(caminhoDiagnostico)) };
					await naTrava(materia, async () => {
						const novo = await salvarAutoavaliacao(dados, materia, curso, dadosAcao.niveis, contexto);
						await mostrarCurso(dados, materia, novo, comPedido);
					});
				} else if (ao === "gerar_diagnostico") {
					await gerarQuestoes(dados, materia, curso, pedido);
				} else if (ao === "responder") {
					const questao = dadosAcao.questao;
					if (typeof questao !== "string" || !questao) {
						mostrar("erro", { mensagem: "Falta a questão da resposta.", ao, materia, curso, ...comPedido });
						return;
					}
					const contexto = { ...daSessao(), ...(await promptSeHouver(caminhoDiagnostico)) };
					const entrada = { confianca: dadosAcao.confianca, escolha: dadosAcao.escolha, texto: dadosAcao.texto, tempoMs: dadosAcao.tempoMs };
					const chave = chaveDo(materia, curso);
					const aCorrigir = await naTrava(materia, async () => {
						const novo = await gravarResposta(dados, materia, curso, questao, entrada, contexto);
						const daQuestao = novo.diagnosticoEmAndamento!.questoes.find((item) => item.id === questao)!;
						let marcada: { alvo: ParaCorrigir; controle: AbortController } | undefined;
						if (daQuestao.tipo === "dissertativa") {
							marcada = { alvo: { questao: daQuestao, resposta: novo.diagnosticoEmAndamento!.respostas[questao] as RespostaDissertativa }, controle: marcarCorrigindo(chave, questao) };
						}
						// A resposta está gravada: o pedido vai aqui; a correção chega depois, num curso sem pedido.
						await mostrarCurso(dados, materia, novo, comPedido);
						return marcada;
					});
					if (aCorrigir) await corrigirDissertativa(dados, materia, curso, aCorrigir.alvo, aCorrigir.controle, undefined);
				} else if (ao === "corrigir") {
					const questao = dadosAcao.questao;
					if (typeof questao !== "string" || !questao) {
						mostrar("erro", { mensagem: "Falta a questão a corrigir.", ao, materia, curso, ...comPedido });
						return;
					}
					const chave = chaveDo(materia, curso);
					const aCorrigir = await naTrava(materia, async () => {
						const atual = await lerCurso(dados, materia, curso);
						const emAndamento = atual.diagnosticoEmAndamento;
						const daQuestao = emAndamento?.questoes.find((item) => item.id === questao);
						if (!emAndamento || !daQuestao || daQuestao.tipo !== "dissertativa") throw new ErroDiagnostico(`Não achei a dissertativa "${questao}" no diagnóstico.`);
						const resposta = emAndamento.respostas[questao] as RespostaDissertativa | undefined;
						if (!resposta) throw new ErroDiagnostico(`A questão ${questao} ainda não foi respondida.`);
						if (resposta.correcao) throw new ErroDiagnostico(`A questão ${questao} já foi corrigida.`);
						if (corrigindo.get(chave)?.has(questao)) throw new ErroDiagnostico(`A questão ${questao} já está sendo corrigida.`);
						const controle = marcarCorrigindo(chave, questao);
						await mostrarCurso(dados, materia, atual);
						return { alvo: { questao: daQuestao, resposta }, controle };
					});
					await corrigirDissertativa(dados, materia, curso, aCorrigir.alvo, aCorrigir.controle, pedido);
				} else if (ao === "concluir_diagnostico") {
					const contexto = { ...daSessao(), ...(await promptSeHouver(caminhoDiagnostico)) };
					await naTrava(materia, async () => {
						const resultado = await concluirDiagnostico(dados, materia, curso, contexto);
						await mostrarCurso(dados, materia, resultado.curso, { invalidadas: resultado.invalidadas, ...comPedido });
					});
				}
			} catch (erro) {
				const doErro: MensagensCursos["erro"] = { mensagem: mensagemDe(erro, ao), ao, materia, ...comCurso, ...comPedido };
				if ((ao === "responder" || ao === "corrigir") && typeof dadosAcao.questao === "string") mostrarErroDaQuestao(doErro, dadosAcao.questao);
				else mostrar("erro", doErro);
			}
		})();
	});

	/** A matéria que a ferramenta lê: a da conversa, se ela for de um caderno; senão, a do parâmetro. */
	const escolherMateria = (pedida: string | undefined, entradas: Parameters<typeof materiaDaConversa>[0]): { materia: string } | { erro: string } => {
		const daConversa = materiaDaConversa(entradas);
		if (daConversa) {
			if (pedida && pedida !== daConversa) return { erro: `Esta conversa é do caderno "${daConversa}": os cursos de outras matérias ficam de fora aqui.` };
			return { materia: daConversa };
		}
		if (!pedida) return { erro: "Diga a matéria (o id, de listar_materias)." };
		return { materia: pedida };
	};

	pi.registerTool({
		name: "ler_curso",
		label: "Ler curso",
		description:
			"Read a subject's courses (study plans the user builds in the notebook's course guide). Without `curso`, lists the subject's courses: name, id, status (draft and the step where it stopped, or ready) and deadline. With `curso`, summarizes that course: deadline and hours per week, chosen materials, scope, type and the user's goal, the concepts of the content map the course covers (in map order), the diagnostic pre-test (the user's self-assessment per concept, its phase and, once every question is answered, the result per concept; never the answer key) and which guide steps are still missing. In a notebook conversation, the subject is the conversation's. Read only: never change a course.",
		parameters: Type.Object({
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
			curso: Type.Optional(Type.String({ description: "Course id (from the list). Without it, lists the subject's courses." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			const { materia } = escolha;
			if (!(await materiaExiste(ctx.cwd, materia))) return { content: [{ type: "text", text: `Não achei a matéria "${materia}".` }], details: undefined, isError: true };
			try {
				if (!params.curso) {
					const lista = await listarCursos(ctx.cwd, materia);
					return { content: [{ type: "text", text: textoDaLista(materia, lista.cursos, lista.erros) }], details: { materia, cursos: lista.cursos.length } };
				}
				const lido = await lerCurso(ctx.cwd, materia, params.curso);
				const mapa = lido.mapa ? await lerMapa(ctx.cwd, materia) : undefined;
				const prontos = lido.materiais ? await materiaisProntos(ctx.cwd, materia) : undefined;
				return {
					content: [{ type: "text", text: textoDoCurso(lido, { mapa, prontos }) }],
					details: { materia, curso: lido.id, situacao: lido.situacao, etapa: lido.etapa },
				};
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "ler") }], details: undefined, isError: true };
			}
		},
	});
}
