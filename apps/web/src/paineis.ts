// Registro de painéis do front: id do painel para o componente React. Junta os
// painéis do núcleo (pergunta, do ask_user_question) com os de cada perfil.
// Um id fora daqui usa o PainelGenerico do @estudos/ui.

import { paineisEstudos } from "@estudos/perfil-estudos";
import { PainelGenerico, paineisDoNucleo, type RegistroPaineis } from "@estudos/ui";

export const registroPaineis: RegistroPaineis = {
	...paineisDoNucleo,
	...paineisEstudos,
	teste: {
		componente: PainelGenerico,
		titulo: "Teste",
		resumir: (pedido) => {
			const pergunta = (pedido.dados as { pergunta?: unknown } | undefined)?.pergunta;
			return { tipo: "Pedido", titulo: typeof pergunta === "string" ? pergunta : "Pedido do painel teste" };
		},
	},
};
