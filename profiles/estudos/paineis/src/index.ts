// Painéis do perfil de estudos (o código de tela do perfil, ESPECIFICACAO 4):
// o front junta este registro com o do núcleo. Os ids são os do campo paineis
// do profile.json. Estilos em estilo.css ("@estudos/perfil-estudos/estilo.css").

import type { RegistroPaineis } from "@estudos/ui";
import { PainelQuiz } from "./PainelQuiz.tsx";

export { PainelQuiz } from "./PainelQuiz.tsx";

export const paineisEstudos: RegistroPaineis = {
	quiz: { componente: PainelQuiz, titulo: "Questões" },
};
