// Painéis do próprio núcleo, que qualquer perfil recebe: hoje só o "pergunta"
// do ask_user_question (packages/core/src/pergunta.ts). O front junta este
// registro com o dos painéis do perfil.

import type { RegistroPaineis } from "./paineis.tsx";
import type { DadosPedidoPergunta } from "./tipos.ts";
import { PainelPergunta } from "./visual/PainelPergunta.tsx";

export const paineisDoNucleo: RegistroPaineis = {
	pergunta: {
		componente: PainelPergunta,
		titulo: "Pergunta",
		soModal: true,
		resumir: (pedido) => {
			const pergunta = (pedido.dados as Partial<DadosPedidoPergunta> | undefined)?.question;
			return { tipo: "Pergunta", titulo: typeof pergunta === "string" && pergunta.trim() ? pergunta : "Pergunta do agente", icone: "help" };
		},
	},
};
