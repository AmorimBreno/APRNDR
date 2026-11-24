// Transcrição de voz (docs/professor-flutuante.md, R8 e 2.2): o front manda um
// WAV em base64 e o servidor pede a transcrição ao OpenRouter. Este arquivo
// tem só a parte pura (montar o pedido e ler a resposta), com o fetch
// injetável para testar sem rede. O áudio nunca é gravado em disco nem no log.

export const URL_TRANSCRICAO = "https://openrouter.ai/api/v1/audio/transcriptions";
/** Tamanho máximo do corpo do pedido (JSON com o áudio em base64), em bytes. */
export const LIMITE_CORPO_TRANSCRICAO = 10 * 1024 * 1024;
export const PRAZO_TRANSCRICAO_MS = 60_000;

export interface ResultadoTranscricao {
	texto: string;
	segundos?: number;
	custo?: number;
}

export type RespostaTranscricao = { ok: true; resultado: ResultadoTranscricao } | { ok: false; erro: string; status: number };

export interface PedidoTranscricao {
	modelo: string;
	/** WAV em base64. */
	audio: string;
	/** A chave do OpenRouter (OPENROUTER_API_KEY). Nunca vai para o log. */
	chave: string | undefined;
	/** Para testar sem rede. Padrão: o fetch global. */
	buscar?: typeof fetch;
	prazoMs?: number;
}

/** O corpo JSON enviado ao OpenRouter. */
export function montarCorpoTranscricao(modelo: string, audio: string): { model: string; input_audio: { data: string; format: "wav" }; language: "pt"; temperature: 0 } {
	return { model: modelo, input_audio: { data: audio, format: "wav" }, language: "pt", temperature: 0 };
}

/** Frase curta com o erro devolvido pelo OpenRouter ({ error: { message } } ou texto). */
function mensagemCurta(corpo: string): string {
	let mensagem = corpo;
	try {
		const json = JSON.parse(corpo) as { error?: { message?: unknown } | string; message?: unknown };
		if (typeof json.error === "string") mensagem = json.error;
		else if (typeof json.error?.message === "string") mensagem = json.error.message;
		else if (typeof json.message === "string") mensagem = json.message;
	} catch {
		// Não era JSON: vale o texto.
	}
	const limpo = mensagem.replace(/\s+/g, " ").trim();
	return limpo.length > 160 ? `${limpo.slice(0, 159)}…` : limpo || "sem detalhes";
}

/** Lê a resposta { text, usage: { seconds, cost } } do OpenRouter. */
export function lerRespostaTranscricao(json: unknown): ResultadoTranscricao | undefined {
	if (!json || typeof json !== "object") return undefined;
	const { text, usage } = json as { text?: unknown; usage?: { seconds?: unknown; cost?: unknown } };
	if (typeof text !== "string") return undefined;
	const segundos = typeof usage?.seconds === "number" && Number.isFinite(usage.seconds) ? usage.seconds : undefined;
	const custo = typeof usage?.cost === "number" && Number.isFinite(usage.cost) ? usage.cost : undefined;
	return { texto: text.trim(), ...(segundos !== undefined ? { segundos } : {}), ...(custo !== undefined ? { custo } : {}) };
}

/** Pede a transcrição ao OpenRouter. Nunca lança: os erros voltam com uma frase em português. */
export async function transcrever(pedido: PedidoTranscricao): Promise<RespostaTranscricao> {
	if (!pedido.chave) return { ok: false, erro: "Configure OPENROUTER_API_KEY nas variáveis de ambiente do Windows.", status: 400 };
	const buscar = pedido.buscar ?? fetch;
	let resposta: Response;
	try {
		resposta = await buscar(URL_TRANSCRICAO, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${pedido.chave}` },
			body: JSON.stringify(montarCorpoTranscricao(pedido.modelo, pedido.audio)),
			signal: AbortSignal.timeout(pedido.prazoMs ?? PRAZO_TRANSCRICAO_MS),
		});
	} catch (erro) {
		const estourou = erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
		return { ok: false, erro: estourou ? "A transcrição demorou demais e foi cancelada." : "Não consegui falar com o serviço de transcrição.", status: 502 };
	}
	const corpo = await resposta.text();
	if (!resposta.ok) return { ok: false, erro: `A transcrição falhou (${resposta.status}): ${mensagemCurta(corpo)}`, status: 502 };
	let json: unknown;
	try {
		json = JSON.parse(corpo);
	} catch {
		return { ok: false, erro: "A transcrição voltou num formato inesperado.", status: 502 };
	}
	const resultado = lerRespostaTranscricao(json);
	if (!resultado) return { ok: false, erro: "A transcrição voltou num formato inesperado.", status: 502 };
	return { ok: true, resultado };
}
