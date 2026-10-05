/**
 * web-search: ferramenta web_search para o pesquisador (agents/researcher.md).
 *
 * Fica em ~/.pi/agent/extensions/web-search/index.ts porque é ali que o
 * pi-interactive-subagents procura a ferramenta (getToolExtensionPath em
 * pi-extension/subagents/index.ts). Instale com extras/instalar.sh.
 *
 * Serviço: Tavily (POST https://api.tavily.com/search), chave em TAVILY_API_KEY.
 * Para trocar de serviço, reescreva só a função buscar() abaixo, mantendo o
 * formato de Resultado.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface Resultado {
	titulo: string;
	url: string;
	trecho: string;
}

interface Resposta {
	resumo?: string;
	resultados: Resultado[];
}

async function buscar(
	consulta: string,
	opcoes: { maxResultados: number; profundo: boolean },
	signal?: AbortSignal,
): Promise<Resposta> {
	const chave = process.env.TAVILY_API_KEY;
	if (!chave) {
		throw new Error("TAVILY_API_KEY não está definida no ambiente. Veja docs/instalacao.md.");
	}
	const res = await fetch("https://api.tavily.com/search", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
		body: JSON.stringify({
			query: consulta,
			max_results: opcoes.maxResultados,
			search_depth: opcoes.profundo ? "advanced" : "basic",
			include_answer: true,
		}),
		signal,
	});
	if (!res.ok) {
		const corpo = await res.text().catch(() => "");
		throw new Error(`Tavily respondeu ${res.status}: ${corpo.slice(0, 500)}`);
	}
	const dados = (await res.json()) as {
		answer?: string | null;
		results?: Array<{ title?: string; url?: string; content?: string }>;
	};
	return {
		resumo: dados.answer ?? undefined,
		resultados: (dados.results ?? []).map((r) => ({
			titulo: r.title ?? "(sem título)",
			url: r.url ?? "",
			trecho: r.content ?? "",
		})),
	};
}

function formatar(consulta: string, resposta: Resposta): string {
	const linhas: string[] = [`Search results for: ${consulta}`, ""];
	if (resposta.resumo) {
		linhas.push(`Quick answer (machine-generated, verify against sources): ${resposta.resumo}`, "");
	}
	if (resposta.resultados.length === 0) {
		linhas.push("No results.");
	}
	resposta.resultados.forEach((r, i) => {
		linhas.push(`${i + 1}. ${r.titulo}`, `   URL: ${r.url}`, `   ${r.trecho.replace(/\s+/g, " ").trim()}`, "");
	});
	return linhas.join("\n");
}

export default function webSearch(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "web_search",
		description:
			"Search the web and return the top results (title, URL, relevant snippets) plus a short machine-generated answer. Use web_fetch to read a full page from a returned URL.",
		parameters: Type.Object({
			query: Type.String({ description: "The search query." }),
			max_results: Type.Optional(
				Type.Number({ description: "How many results to return (1-10). Default 5.", minimum: 1, maximum: 10 }),
			),
			deep: Type.Optional(
				Type.Boolean({
					description: "Use a slower, higher-precision search. Costs twice as much. Default false.",
				}),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const maxResultados = Math.min(Math.max(Math.round(params.max_results ?? 5), 1), 10);
			const resposta = await buscar(params.query, { maxResultados, profundo: params.deep === true }, signal);
			return {
				content: [{ type: "text", text: formatar(params.query, resposta) }],
				details: { query: params.query, count: resposta.resultados.length },
			};
		},
	});
}
