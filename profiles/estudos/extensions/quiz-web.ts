// quiz no app (ESPECIFICACAO 13.9). Arquivo do projeto, não do learn: a versão
// de terminal (quiz.ts, do learn) desenha com ctx.ui.custom e continua para o
// scripts\pi-estudos.cmd. Esta tem o mesmo nome, os mesmos parâmetros, a mesma
// correção (por value, depois de embaralhar), o mesmo "Não sei", a mesma nota
// livre e o mesmo resultado para o modelo, mas pergunta pela ponte de eventos
// (docs/ponte-de-eventos.md), no painel "quiz" (profiles/estudos/paineis).
//
// - "interface:pedido" acao "perguntar": enunciado, opções na ordem mostrada,
//   o modo e, se houver, a imagem (o parâmetro image: o nome de um arquivo da
//   pasta de dados, mostrado pela rota de imagens do núcleo). A resposta certa e
//   a explicação NUNCA vão no pedido.
// - Resposta da interface: { escolhas: number[] (1 em diante, na ordem
//   mostrada), naoSei?: boolean, nota?: string }.
// - Depois de corrigir, "interface:mostrar" acao "resultado" com o gabarito e a
//   explicação, para o painel mostrar o retorno.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PAINEL = "quiz";
const NAO_SEI = "Não sei";

interface OpcaoQuiz {
	label: string;
	value: string;
	description?: string;
}

interface RespostaOpcao {
	label: string;
	value: string;
	index: number; // 1 em diante, como o usuário vê
}

type Status = "answered" | "cancelled" | "unavailable";
type Modo = "single-select" | "multi-select";

interface OpcaoMostrada {
	index: number;
	label: string;
}

/** Dados do pedido "perguntar" (sem gabarito). */
interface DadosPedidoQuiz {
	question: string;
	details?: string;
	image?: string;
	mode: Modo;
	options: Array<{ index: number; label: string; description?: string }>;
	dontKnowLabel: string;
}

/** Resposta que o painel manda. */
interface RespostaPainel {
	escolhas?: number[];
	naoSei?: boolean;
	nota?: string;
}

type Resposta = { id: string; dados?: unknown; cancelado?: true; motivo?: string; erro?: string };

// Esquema igual ao do quiz.ts (as descrições são o que o modelo lê).
const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the answer option." }),
	value: Type.Optional(
		Type.String({ description: "Optional machine-readable value returned for the option. Defaults to the label." }),
	),
	description: Type.Optional(Type.String({ description: "Optional extra detail shown below the option." })),
});

const QuizParams = Type.Object({
	question: Type.String({
		description: "The single quiz question to ask. Ask exactly one question per tool call.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
	options: Type.Array(OptionSchema, {
		description:
			"The answer options (2 or more). Options only — there is no free-text mode. Give each option a stable `value`; you reference the correct one by that value in correctAnswer.",
		minItems: 2,
	}),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Set to true when more than one option is correct and the user must select all of them." }),
	),
	correctAnswer: Type.Union([Type.String(), Type.Array(Type.String())], {
		description:
			'REQUIRED. The correct answer as the option value(s) — the `value` field of the option you intend. Single-select: a single string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]); the user is only correct if their selection matches this set exactly. Always pass the value, not a position number — this is self-checking and prevents miscounting.',
	}),
	explanation: Type.String({
		description:
			"REQUIRED. Explanation revealed AFTER the user answers (shown whether they got it right or wrong). Use it to reinforce why the correct answer is correct.",
	}),
	shuffle: Type.Optional(
		Type.Boolean({
			description:
				"Defaults to true: options are randomly reordered before display so the correct answer isn't always in the same position. Set to false only when option order is meaningful (e.g. ordered numeric values, or an 'All/None of the above' option that must stay last).",
		}),
	),
	image: Type.Optional(Type.String({ description: "Optional. The filename of a picture a maker subagent already returned (the same name you embed as ![[...]], e.g. viz-<slug>-<timestamp>.png). It is shown with the question, so the user can look at it while answering. Pass it whenever the question is about that picture." })), // a mais que no learn: o quiz.ts tem o mesmo campo e o ignora no terminal
});

// ── Correção: as mesmas regras do quiz.ts ──

function normalizarOpcoes(opcoes: Array<{ label: string; value?: string; description?: string }> | undefined): OpcaoQuiz[] {
	const vistos = new Set<string>();
	return (opcoes || [])
		.map((opcao) => ({
			label: opcao.label.trim(),
			value: opcao.value?.trim() || opcao.label.trim(),
			description: opcao.description?.trim() || undefined,
		}))
		.filter((opcao) => {
			if (opcao.label.length === 0) return false;
			if (vistos.has(opcao.value)) throw new Error(`duplicate option value "${opcao.value}"`);
			vistos.add(opcao.value);
			return true;
		});
}

function embaralhar(opcoes: OpcaoQuiz[]): OpcaoQuiz[] {
	const copia = [...opcoes];
	for (let i = copia.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copia[i], copia[j]] = [copia[j]!, copia[i]!];
	}
	return copia;
}

/** O pi às vezes entrega o array de multi-select como texto JSON; volta a ser array. */
function normalizarGabarito(gabarito: string | string[]): string[] {
	if (Array.isArray(gabarito)) return gabarito;
	const limpo = gabarito.trim();
	if (limpo.startsWith("[") && limpo.endsWith("]")) {
		try {
			const lido = JSON.parse(limpo);
			if (Array.isArray(lido)) return lido.map((valor) => String(valor));
		} catch {
			// Não é JSON: vale como um valor só.
		}
	}
	return [gabarito];
}

function resolverGabarito(gabarito: string | string[] | undefined, opcoes: OpcaoQuiz[]): { indices: number[]; error?: string } {
	if (gabarito === undefined) return { indices: [], error: "correctAnswer is required" };
	const valores = normalizarGabarito(gabarito);
	if (valores.length === 0) return { indices: [], error: "correctAnswer is required" };
	const porValor = new Map(opcoes.map((opcao, i) => [opcao.value, i + 1]));
	const indices: number[] = [];
	for (const bruto of valores) {
		const valor = typeof bruto === "string" ? bruto.trim() : bruto;
		const indice = porValor.get(valor);
		if (indice === undefined) {
			const conhecidos = opcoes.map((opcao) => `"${opcao.value}"`).join(", ");
			return { indices: [], error: `correctAnswer "${valor}" does not match any option value (${conhecidos})` };
		}
		indices.push(indice);
	}
	return { indices: Array.from(new Set(indices)).sort((a, b) => a - b) };
}

function acertou(escolhidos: number[], certos: number[]): boolean {
	if (escolhidos.length !== certos.length) return false;
	const a = [...escolhidos].sort((x, y) => x - y);
	const b = [...certos].sort((x, y) => x - y);
	return a.every((valor, i) => valor === b[i]);
}

function referencia(opcoes: OpcaoQuiz[], indice: number): string {
	const opcao = opcoes[indice - 1];
	return `${indice}. ${opcao ? opcao.label : "(unknown)"}`;
}

function detalhes(
	status: Status,
	question: string,
	mode: Modo,
	answers: RespostaOpcao[],
	correctIndices: number[],
	extras: { context?: string; message?: string; options?: OpcaoMostrada[]; correct?: boolean; dontKnow?: boolean; note?: string; explanation?: string } = {},
) {
	return {
		status,
		question,
		context: extras.context,
		mode,
		answers,
		correctIndices,
		options: extras.options,
		correct: extras.correct,
		dontKnow: extras.dontKnow,
		note: extras.note,
		explanation: extras.explanation,
		message: extras.message,
	};
}

function resultadoCancelado(question: string, mode: Modo, correctIndices: number[], context?: string) {
	const message = "User cancelled the quiz";
	return { content: [{ type: "text" as const, text: message }], details: detalhes("cancelled", question, mode, [], correctIndices, { context, message }) };
}

function resultadoIndisponivel(question: string, mode: Modo, message: string, correctIndices: number[], context?: string) {
	return { content: [{ type: "text" as const, text: message }], details: detalhes("unavailable", question, mode, [], correctIndices, { context, message }) };
}

/** Mesmo texto do buildResult do quiz.ts. */
function textoDoResultado(opcoes: OpcaoQuiz[], respostas: RespostaOpcao[], certos: number[], naoSei: boolean, correto: boolean, nota?: string, explicacao?: string): string {
	const gabarito = certos.map((indice) => referencia(opcoes, indice)).join(", ");
	let texto: string;
	if (naoSei) {
		texto = `User selected "Não sei" (I don't know) — they did not attempt an answer (a genuine knowledge gap, not a wrong guess).`;
		texto += `\nCorrect: ${gabarito}`;
		if (nota) texto += `\nUser's note: ${nota}`;
	} else {
		const veredito = correto ? "correctly" : "incorrectly";
		const escolhidas = respostas.map((resposta) => `${resposta.index}. ${resposta.label}`).join(", ");
		texto = `User answered ${veredito}.\nSelected: ${escolhidas}\nCorrect: ${gabarito}`;
		if (nota) texto += `\nUser's note: ${nota}`;
	}
	if (explicacao) texto += `\nExplanation: ${explicacao}`;
	return texto;
}

/** Converte a resposta do painel. Devolve uma mensagem de erro se ela não combina com o modo e as opções. */
function interpretar(dados: unknown, modo: Modo, opcoes: OpcaoQuiz[]): { naoSei: boolean; respostas: RespostaOpcao[]; nota?: string } | string {
	if (!dados || typeof dados !== "object") return "the app sent an empty answer";
	const { escolhas, naoSei, nota } = dados as RespostaPainel;
	const notaLimpa = typeof nota === "string" && nota.trim() ? nota.trim() : undefined;
	if (naoSei === true) return { naoSei: true, respostas: [], ...(notaLimpa ? { nota: notaLimpa } : {}) };
	const indices = Array.isArray(escolhas) ? [...new Set(escolhas)].sort((a, b) => a - b) : [];
	if (indices.length === 0) return "the app sent no selection";
	if (indices.some((indice) => !Number.isInteger(indice) || indice < 1 || indice > opcoes.length)) return "the app sent an option that does not exist";
	if (modo === "single-select" && indices.length > 1) return "single-select accepts one answer";
	const respostas = indices.map((indice) => ({ label: opcoes[indice - 1]!.label, value: opcoes[indice - 1]!.value, index: indice }));
	return { naoSei: false, respostas, ...(notaLimpa ? { nota: notaLimpa } : {}) };
}

/** Emite o pedido e espera a resposta ou o cancelamento com o mesmo id. */
function perguntar(pi: ExtensionAPI, id: string, dados: DadosPedidoQuiz): Promise<Resposta> {
	return new Promise((resolver) => {
		// Assina antes de emitir: o barramento entrega na hora.
		const parar = pi.events.on("interface:resposta", (recebido) => {
			const resposta = recebido as Resposta;
			if (resposta.id !== id) return;
			parar();
			resolver(resposta);
		});
		pi.events.emit("interface:pedido", { id, painel: PAINEL, acao: "perguntar", dados });
	});
}

export default function quizWeb(pi: ExtensionAPI) {
	pi.registerTool({
		name: "quiz",
		label: "quiz",
		// Descrição e regras iguais às do quiz.ts, menos a parte do Tab (no app a nota é um campo à vista).
		description:
			"Ask the user a GRADED question with a known correct answer, then instantly grade and give feedback. Unlike ask_user_question (which collects preferences/decisions with no right answer), quiz always has a correct answer supplied by you, marks the user's selection right/wrong (✓/✗), reveals the correct answer, and can show an explanation. Use it to (1) assess what the learner already understands before teaching, and (2) run tight practice/retrieval loops after explaining, or probe understanding whenever you're unsure they've got it. Options-only: single-select or multi-select, plus an automatic 'Não sei' (I don't know) choice so the user can signal a genuine gap instead of guessing. An always-present optional note field lets the user attach a free-text note to ANY answer; it reaches you only when non-empty. No free-text answers — for non-graded questions use ask_user_question instead.",
		promptSnippet:
			"Use the quiz tool to test the user with a graded multiple-choice or multi-select question (required correct answer + required explanation). For non-graded questions, use ask_user_question.",
		promptGuidelines: [
			"quiz is GRADED; ask_user_question is not. If the question has a correct answer, use quiz. If you just need a preference, decision, or open-ended input, use ask_user_question.",
			'correctAnswer is REQUIRED and is the option value, not a position number. Single-select: one string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]).',
			"Always pass the option's `value` string as correctAnswer — it is self-checking and prevents miscounting positions. A value that matches no option is a hard error.",
			"explanation is REQUIRED — always say why the correct answer is correct.",
			"Multi-select is graded as an exact-set match: the user is correct only if they select every correct option and no incorrect ones.",
			"There is no free-text mode. An 'Não sei' (I don't know) choice is ALWAYS added automatically — provide ONLY the real, gradable options (at least two). Never add your own uncertainty/opt-out option like 'Não sei', 'Não tenho certeza', 'I don't know', or 'Not sure'; that is handled for you and a manual one would be redundant or gradable-as-wrong.",
			"If a result comes back as dontKnow, the user honestly did not know and did NOT guess — treat it as a genuine knowledge gap to teach into, not as a wrong answer.",
			"Any answer (right, wrong, or 'Não sei') may carry an optional free-text `note` the user typed in the always-present note field. When present it reflects what they were thinking or unsure about — read it and let it steer your follow-up. It is omitted entirely when empty.",
			"Treat each wrong answer (distractor) as a diagnostic probe, not just filler: make it a specific, believable mistake the user might actually hold — a common misconception, or an adjacent/easily-confused concept — so that WHICH wrong answer they pick reveals WHICH nuance of their understanding is off. You learn far more from a targeted wrong choice than from a binary right/wrong, and the choice tells you exactly which gap to teach into next (and what the explanation should address).",
			"Guardrail: every distractor must be unambiguously wrong on the intended reading — tempting, but a real error, not a defensible alternative. Don't drift into trick questions.",
			"Anti-guessing hygiene: don't let the correct answer stand out by form (longest, most precise, most hedged, or the only one in the right format). Keep options similar in length, specificity, and phrasing so it can't be picked from shape alone.",
			"Set multiSelect: true only when more than one option is correct.",
			"Options are shuffled before display by default, so don't worry about which position you list the correct answer in. Set shuffle: false only when option order is meaningful (ordered values, or an 'All/None of the above' option that must stay last).",
			"To probe nuance, ask several quick quiz questions and adapt each one based on the previous answers, rather than writing one giant question.",
			"Don't leak the answer through formatting: keep option phrasing/length even and don't hint which is correct.",
		],
		parameters: QuizParams,

		async execute(idChamada, params, signal, onUpdate) {
			const contexto = params.details?.trim() || undefined;
			const imagem = params.image?.trim() || undefined;
			const explicacao = params.explanation.trim();
			const modo: Modo = params.multiSelect ? "multi-select" : "single-select";

			let opcoes: OpcaoQuiz[];
			try {
				opcoes = normalizarOpcoes(params.options);
			} catch (erro) {
				return resultadoIndisponivel(params.question, modo, `quiz ${(erro as Error).message}`, [], contexto);
			}
			// Embaralha antes de resolver o gabarito: a correção segue a ordem mostrada.
			if (params.shuffle !== false) opcoes = embaralhar(opcoes);
			const mostradas: OpcaoMostrada[] = opcoes.map((opcao, i) => ({ index: i + 1, label: opcao.label }));
			// Só aparece na linha da ferramenta enquanto espera; o modelo recebe o resultado final.
			onUpdate?.({ content: [{ type: "text", text: "Esperando a sua resposta no painel Questões" }], details: { options: mostradas } });

			const { indices: certos, error: erroGabarito } = resolverGabarito(params.correctAnswer as string | string[], opcoes);
			if (signal?.aborted) return resultadoCancelado(params.question, modo, certos, contexto);
			if (opcoes.length < 2) return resultadoIndisponivel(params.question, modo, "quiz requires at least two options", certos, contexto);
			if (erroGabarito) return resultadoIndisponivel(params.question, modo, `quiz ${erroGabarito}`, certos, contexto);

			const resposta = await perguntar(pi, idChamada, {
				question: params.question,
				...(contexto ? { details: contexto } : {}),
				...(imagem ? { image: imagem } : {}),
				mode: modo,
				options: opcoes.map((opcao, i) => ({ index: i + 1, label: opcao.label, ...(opcao.description ? { description: opcao.description } : {}) })),
				dontKnowLabel: NAO_SEI,
			});
			if (resposta.cancelado) {
				if (resposta.motivo === "pedido_invalido") {
					return resultadoIndisponivel(params.question, modo, `quiz: ${resposta.erro ?? "invalid request"}`, certos, contexto);
				}
				return resultadoCancelado(params.question, modo, certos, contexto);
			}
			const lida = interpretar(resposta.dados, modo, opcoes);
			if (typeof lida === "string") return resultadoIndisponivel(params.question, modo, `quiz: ${lida}`, certos, contexto);

			const correto = lida.naoSei ? false : acertou(lida.respostas.map((item) => item.index), certos);
			pi.events.emit("interface:mostrar", {
				painel: PAINEL,
				acao: "resultado",
				dados: {
					id: idChamada,
					question: params.question,
					...(contexto ? { details: contexto } : {}),
					...(imagem ? { image: imagem } : {}),
					mode: modo,
					options: mostradas,
					escolhas: lida.respostas.map((item) => item.index),
					correctIndices: certos,
					correct: correto,
					dontKnow: lida.naoSei,
					...(lida.nota ? { note: lida.nota } : {}),
					explanation: explicacao,
				},
			});
			return {
				content: [{ type: "text" as const, text: textoDoResultado(opcoes, lida.respostas, certos, lida.naoSei, correto, lida.nota, explicacao) }],
				details: detalhes("answered", params.question, modo, lida.respostas, certos, {
					context: contexto,
					options: mostradas,
					correct: correto,
					dontKnow: lida.naoSei,
					note: lida.nota,
					explanation: explicacao,
				}),
			};
		},
	});
}
