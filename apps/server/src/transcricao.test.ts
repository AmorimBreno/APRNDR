// A parte pura da transcrição (transcricao.ts): sem rede, com o fetch falso.

import { describe, expect, it } from "vitest";
import { lerRespostaTranscricao, montarCorpoTranscricao, transcrever, URL_TRANSCRICAO } from "./transcricao.ts";

const falso = (resposta: Response | Error) =>
	(async () => {
		if (resposta instanceof Error) throw resposta;
		return resposta;
	}) as unknown as typeof fetch;

describe("transcrição", () => {
	it("monta o corpo do pedido do OpenRouter", () => {
		expect(montarCorpoTranscricao("openai/whisper-large-v3", "AAAA")).toEqual({
			model: "openai/whisper-large-v3",
			input_audio: { data: "AAAA", format: "wav" },
			language: "pt",
			temperature: 0,
		});
	});

	it("lê o texto, os segundos e o custo, e ignora o que não é número", () => {
		expect(lerRespostaTranscricao({ text: "olá", usage: { seconds: 3, cost: 0.001 } })).toEqual({ texto: "olá", segundos: 3, custo: 0.001 });
		expect(lerRespostaTranscricao({ text: "olá", usage: { seconds: "3" } })).toEqual({ texto: "olá" });
		expect(lerRespostaTranscricao({ usage: {} })).toBeUndefined();
		expect(lerRespostaTranscricao("x")).toBeUndefined();
	});

	it("sucesso: chama a URL com a chave e o corpo certos", async () => {
		let visto: { url: string; init: RequestInit } | undefined;
		const buscar = (async (url: string, init: RequestInit) => {
			visto = { url, init };
			return new Response(JSON.stringify({ text: "oi", usage: { seconds: 1, cost: 0.1 } }));
		}) as unknown as typeof fetch;
		const r = await transcrever({ modelo: "m/x", audio: "QUJD", chave: "segredo", buscar });
		expect(r).toEqual({ ok: true, resultado: { texto: "oi", segundos: 1, custo: 0.1 } });
		expect(visto?.url).toBe(URL_TRANSCRICAO);
		expect(new Headers(visto?.init.headers).get("authorization")).toBe("Bearer segredo");
		expect(JSON.parse(String(visto?.init.body))).toMatchObject({ model: "m/x", input_audio: { data: "QUJD", format: "wav" }, language: "pt", temperature: 0 });
	});

	it("sem chave não chama a rede", async () => {
		const r = await transcrever({ modelo: "m", audio: "A", chave: undefined, buscar: falso(new Error("não devia")) });
		expect(r).toEqual({ ok: false, erro: "Configure OPENROUTER_API_KEY nas variáveis de ambiente do Windows.", status: 400 });
	});

	it("erro 4xx/5xx do OpenRouter vira frase curta, sem vazar a chave", async () => {
		const r = await transcrever({ modelo: "m", audio: "A", chave: "segredo", buscar: falso(new Response(JSON.stringify({ error: { message: "Rate limited" } }), { status: 429 })) });
		expect(r).toEqual({ ok: false, erro: "A transcrição falhou (429): Rate limited", status: 502 });
		const longo = await transcrever({ modelo: "m", audio: "A", chave: "segredo", buscar: falso(new Response("x".repeat(500), { status: 500 })) });
		expect(longo.ok === false && longo.erro.length < 220).toBe(true);
		expect(JSON.stringify(longo)).not.toContain("segredo");
	});

	it("falha de rede, prazo estourado e resposta estranha viram erro em português", async () => {
		const rede = await transcrever({ modelo: "m", audio: "A", chave: "k", buscar: falso(new TypeError("fetch failed")) });
		expect(rede).toMatchObject({ ok: false, erro: "Não consegui falar com o serviço de transcrição." });
		const prazo = new Error("timeout");
		prazo.name = "TimeoutError";
		expect(await transcrever({ modelo: "m", audio: "A", chave: "k", buscar: falso(prazo) })).toMatchObject({ ok: false, erro: "A transcrição demorou demais e foi cancelada." });
		expect(await transcrever({ modelo: "m", audio: "A", chave: "k", buscar: falso(new Response("não é json")) })).toMatchObject({ ok: false, erro: "A transcrição voltou num formato inesperado." });
		expect(await transcrever({ modelo: "m", audio: "A", chave: "k", buscar: falso(new Response(JSON.stringify({ outro: 1 }))) })).toMatchObject({ ok: false });
	});
});
