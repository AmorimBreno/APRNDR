// Ferramentas de teste da ponte de eventos (Etapa 2). Arquivo do projeto, não do learn.
// Seguem docs/ponte-de-eventos.md: mostram algo no painel "teste" e perguntam algo ao usuário por ele.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Resposta = { id: string; dados?: unknown; cancelado?: true; motivo?: string };

/** Emite o pedido e espera a resposta (ou o cancelamento) com o mesmo id. */
function perguntar(pi: ExtensionAPI, id: string, painel: string, acao: string, dados: unknown): Promise<Resposta> {
	return new Promise((resolver) => {
		// Assina a resposta antes de emitir o pedido: o barramento entrega na hora.
		const parar = pi.events.on("interface:resposta", (recebido) => {
			const resposta = recebido as Resposta;
			if (resposta.id !== id) return;
			parar();
			resolver(resposta);
		});
		pi.events.emit("interface:pedido", { id, painel, acao, dados });
	});
}

/** Tira o texto da resposta do painel genérico ({ resposta: "..." }) ou mostra o JSON. */
function textoDaResposta(dados: unknown): string {
	if (dados && typeof dados === "object" && typeof (dados as { resposta?: unknown }).resposta === "string") {
		return (dados as { resposta: string }).resposta;
	}
	return JSON.stringify(dados);
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "mostrar_painel_teste",
		label: "Mostrar no painel teste",
		description: "Test tool for the app's event bridge: show a text in the 'teste' panel.",
		parameters: Type.Object({ texto: Type.String({ description: "The text to show." }) }),
		async execute(_id, params) {
			pi.events.emit("interface:mostrar", { painel: "teste", acao: "mostrar", dados: { texto: params.texto } });
			return { content: [{ type: "text", text: "mostrado no painel teste" }], details: undefined };
		},
	});

	pi.registerTool({
		name: "perguntar_no_painel_teste",
		label: "Perguntar no painel teste",
		description: "Test tool for the app's event bridge: ask the user a question in the 'teste' panel and wait for the answer.",
		parameters: Type.Object({ pergunta: Type.String({ description: "The question." }) }),
		async execute(idChamada, params) {
			const resposta = await perguntar(pi, idChamada, "teste", "perguntar", { pergunta: params.pergunta });
			// Cancelamento conta como "o usuário não respondeu", sem lançar erro.
			if (resposta.cancelado) {
				return { content: [{ type: "text", text: `O usuário cancelou ou não respondeu (${resposta.motivo}).` }], details: undefined };
			}
			return { content: [{ type: "text", text: `Resposta do usuário: ${textoDaResposta(resposta.dados)}` }], details: undefined };
		},
	});
}
