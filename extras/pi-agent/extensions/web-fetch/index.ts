/**
 * web-fetch: ferramenta web_fetch para o pesquisador (agents/researcher.md).
 *
 * Fica em ~/.pi/agent/extensions/web-fetch/index.ts porque é ali que o
 * pi-interactive-subagents procura a ferramenta (getToolExtensionPath em
 * pi-extension/subagents/index.ts). Instale com extras/instalar.sh.
 *
 * Primeiro tenta o Tavily Extract (POST https://api.tavily.com/extract, chave em
 * TAVILY_API_KEY), que devolve a página limpa em markdown. Se não houver chave
 * ou o Tavily falhar, baixa a página direto e tira as tags HTML.
 * Para trocar de serviço, reescreva só a função extrair().
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LIMITE_PADRAO = 20000;

async function extrair(url: string, signal?: AbortSignal): Promise<string | undefined> {
	const chave = process.env.TAVILY_API_KEY;
	if (!chave) return undefined;
	const res = await fetch("https://api.tavily.com/extract", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
		body: JSON.stringify({ urls: [url], extract_depth: "basic", format: "markdown" }),
		signal,
	});
	if (!res.ok) return undefined;
	const dados = (await res.json()) as { results?: Array<{ url?: string; raw_content?: string }> };
	const conteudo = dados.results?.[0]?.raw_content;
	return conteudo && conteudo.trim() ? conteudo : undefined;
}

function htmlParaTexto(html: string): string {
	return html
		.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t]+/g, " ")
		.replace(/\n\s*\n\s*\n+/g, "\n\n")
		.trim();
}

async function baixarDireto(url: string, signal?: AbortSignal): Promise<string> {
	const res = await fetch(url, {
		headers: { "User-Agent": "Mozilla/5.0 (pi web_fetch)", Accept: "text/html,text/plain,*/*" },
		redirect: "follow",
		signal,
	});
	if (!res.ok) throw new Error(`A página respondeu ${res.status} ${res.statusText}`);
	const tipo = res.headers.get("content-type") ?? "";
	const corpo = await res.text();
	return tipo.includes("html") ? htmlParaTexto(corpo) : corpo;
}

export default function webFetch(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_fetch",
		label: "web_fetch",
		description:
			"Fetch a web page and return its main content as markdown or plain text. Use it on URLs returned by web_search to read the full source.",
		parameters: Type.Object({
			url: Type.String({ description: "The full URL (http or https) to fetch." }),
			max_chars: Type.Optional(
				Type.Number({ description: `Maximum characters to return. Default ${LIMITE_PADRAO}.`, minimum: 1000 }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			if (!/^https?:\/\//i.test(params.url)) {
				throw new Error("A URL precisa começar com http:// ou https://");
			}
			const limite = Math.round(params.max_chars ?? LIMITE_PADRAO);
			let fonte = "tavily";
			let texto = await extrair(params.url, signal).catch(() => undefined);
			if (!texto) {
				fonte = "direct";
				texto = await baixarDireto(params.url, signal);
			}
			const cortado = texto.length > limite;
			const saida = cortado ? `${texto.slice(0, limite)}\n\n[truncated: ${texto.length - limite} more characters]` : texto;
			return {
				content: [{ type: "text", text: `Content of ${params.url}:\n\n${saida}` }],
				details: { url: params.url, source: fonte, chars: texto.length, truncated: cortado },
			};
		},
	});
}
