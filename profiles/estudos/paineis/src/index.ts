// Painéis do perfil de estudos (o código de tela do perfil, ESPECIFICACAO 4):
// o front junta este registro com o do núcleo. Os ids são os do campo paineis
// do profile.json. Estilos em estilo.css ("@estudos/perfil-estudos/estilo.css").

import type { RegistroPaineis } from "@estudos/ui";
import { ehPergunta, PainelQuiz } from "./PainelQuiz.tsx";

export { PainelQuiz } from "./PainelQuiz.tsx";

export const paineisEstudos: RegistroPaineis = {
	// Só pedidos: cada questão é respondida no modal, pelo botão na conversa,
	// e o modal continua aberto depois de conferir, com o retorno.
	quiz: {
		componente: PainelQuiz,
		titulo: "Questões",
		soModal: true,
		revisarAoResponder: true,
		resumir: (pedido) => ({ tipo: "Questão", titulo: ehPergunta(pedido) ? pedido.dados.question : "Questão do professor", icone: "checklist" }),
	},
};
