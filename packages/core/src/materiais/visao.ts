// Descrição de imagens (ESPECIFICACAO 5.5): uma página de slide, um gráfico
// ou uma figura de notebook vai, como PNG, para um modelo com visão do
// registro de modelos do pi (o mesmo que dá as credenciais das sessões). O
// modelo transcreve o texto da imagem e descreve o que não é texto, para a
// busca e para o professor poderem usar a página.

import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { nomeDoModelo, resolverModelo } from "../modelos.ts";
import type { Descrever, PedidoDescricao } from "./tipos.ts";

/** O que a visão usa do registro de modelos do pi. */
export type RegistroVisao = Pick<ModelRuntime, "getModel" | "hasConfiguredAuth" | "getAvailable" | "completeSimple">;

/** Uma descrição que demora mais que isto é desistida (a página fica só com o texto). */
export const TEMPO_DESCRICAO_MS = 120_000;

export const INSTRUCOES_VISAO = `Você descreve uma página de material de estudo (slide, folha de aula, figura de notebook) para um índice de busca e para um professor que vai explicar o conteúdo.
Escreva em português do Brasil, em markdown, sem introdução nem comentário sobre a tarefa.
1. Transcreva todo o texto visível na ordem de leitura, mantendo títulos e listas. Fórmulas em LaTeX entre $ ou $$.
2. Tabelas em markdown.
3. Gráficos: o tipo, os eixos com as unidades, as séries, os valores legíveis e a tendência ou conclusão que o gráfico mostra.
4. Diagramas e figuras: os elementos e como se relacionam (setas, etapas, hierarquia).
5. Código em blocos de código.
Não invente: se algo estiver ilegível, diga que está ilegível. Não explique o conteúdo além do que a página mostra.`;

function mensagem(pedido: PedidoDescricao): string {
	const texto = pedido.texto.trim();
	return [
		`Arquivo: ${pedido.arquivo}. Local: ${pedido.local}.`,
		texto ? `Texto que já foi extraído da página (pode estar incompleto ou fora de ordem):\n${texto}` : "A página não tem texto extraível.",
	].join("\n\n");
}

/**
 * O "descrever" da extração, com o modelo `nomeModelo` (provedor/id). Lança
 * ErroModelo na hora se o modelo não existir, não tiver credencial ou não
 * aceitar imagem: melhor falhar antes de processar o arquivo.
 */
export function criarDescrever(registro: RegistroVisao, nomeModelo: string, sinal?: AbortSignal): Descrever {
	const modelo = resolverModelo(registro, nomeModelo);
	if (!modelo.input.includes("image")) {
		throw new Error(`O modelo ${nomeModelo} não aceita imagem; escolha um modelo com visão para os materiais.`);
	}
	const nome = nomeDoModelo(modelo);
	return async (pedido) => {
		const sinais = [AbortSignal.timeout(TEMPO_DESCRICAO_MS), ...(sinal ? [sinal] : [])];
		const resposta = await registro.completeSimple(
			modelo,
			{
				systemPrompt: INSTRUCOES_VISAO,
				messages: [
					{
						role: "user",
						timestamp: Date.now(),
						content: [
							{ type: "text", text: mensagem(pedido) },
							{ type: "image", mimeType: "image/png", data: Buffer.from(pedido.png).toString("base64") },
						],
					},
				],
			},
			{ signal: AbortSignal.any(sinais), maxTokens: 4000, temperature: 0 },
		);
		if (resposta.stopReason === "error" || resposta.stopReason === "aborted") {
			throw new Error(resposta.errorMessage ?? (resposta.stopReason === "aborted" ? "cancelada" : "erro do modelo"));
		}
		const texto = resposta.content
			.filter((parte) => parte.type === "text")
			.map((parte) => parte.text)
			.join("")
			.trim();
		if (!texto) throw new Error("o modelo não devolveu texto");
		return { texto, modelo: nome, custo: resposta.usage.cost.total };
	};
}
