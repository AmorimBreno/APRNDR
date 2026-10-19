// Código de tela do perfil de estudos (ESPECIFICACAO 4): a tela inicial (os
// cadernos) e os painéis. O front junta este registro de painéis com o do núcleo. Os ids são os do campo paineis
// do profile.json. Estilos em estilo.css ("@estudos/perfil-estudos/estilo.css").

import type { EntradaTelaInicial, RegistroPaineis } from "@estudos/ui";
import { ehPergunta, PainelQuiz } from "./PainelQuiz.tsx";
import { PAINEL_CADERNOS, TelaCadernos } from "./TelaCadernos.tsx";

export { PainelQuiz } from "./PainelQuiz.tsx";
export { TelaCadernos } from "./TelaCadernos.tsx";

/** O perfil abre nos cadernos; a conversa volta para eles. */
export const telaInicialEstudos: EntradaTelaInicial = { componente: TelaCadernos, rotuloVoltar: "Cadernos" };

export const paineisEstudos: RegistroPaineis = {
	// A ponte da tela de cadernos com a extensão de matérias: as listas são da
	// tela, não viram card na área de painéis da conversa.
	[PAINEL_CADERNOS]: { componente: () => null, titulo: "Cadernos", foraDaArea: true },
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
