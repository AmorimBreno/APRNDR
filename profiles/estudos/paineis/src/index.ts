// Código de tela do perfil de estudos (ESPECIFICACAO 4): a tela inicial (os
// cadernos) e os painéis. O front junta este registro de painéis com o do núcleo. Os ids são os do campo paineis
// do profile.json. Estilos em estilo.css ("@estudos/perfil-estudos/estilo.css").

import type { EntradaTelaInicial, RegistroPaineis } from "@estudos/ui";
import { ehPergunta, PainelQuiz } from "./PainelQuiz.tsx";
import { PAINEL_CADERNOS, usarAparenciaMaterias } from "./comum.ts";
import { PAINEL_CURSOS } from "./cursos-ponte.ts";
import { PAINEL_MAPA } from "./mapa-ponte.ts";
import { PAINEL_MODULOS } from "./modulos-ponte.ts";
import { PAINEL_NOTAS } from "./notas-ponte.ts";
import { TelaEstudos } from "./TelaEstudos.tsx";

export { PainelQuiz } from "./PainelQuiz.tsx";
export { TelaCaderno } from "./TelaCaderno.tsx";
export { TelaCadernos } from "./TelaCadernos.tsx";
export { TelaEstudos } from "./TelaEstudos.tsx";

/** O perfil abre nos cadernos; a conversa volta para eles (ou para o caderno de onde foi aberta). */
export const telaInicialEstudos: EntradaTelaInicial = {
	componente: TelaEstudos,
	rotuloVoltar: "Cadernos",
	rotuloDoCaminho: (caminho) => (caminho.startsWith("caderno/") ? "Caderno" : undefined),
	// O nome e a cor de agora de cada matéria, para a pílula do histórico da conversa.
	usarAparenciaContextos: usarAparenciaMaterias,
};

export const paineisEstudos: RegistroPaineis = {
	// A ponte da tela de cadernos com a extensão de matérias: as listas são da
	// tela, não viram card na área de painéis da conversa.
	[PAINEL_CADERNOS]: { componente: () => null, titulo: "Cadernos", foraDaArea: true },
	// A ponte do caderno com a extensão de notas: a lista e as notas abertas são do caderno.
	[PAINEL_NOTAS]: { componente: () => null, titulo: "Notas", foraDaArea: true },
	// A ponte do caderno com a extensão do mapa de conteúdo: o mapa é da seção do caderno.
	[PAINEL_MAPA]: { componente: () => null, titulo: "Mapa de conteúdo", foraDaArea: true },
	// A ponte do caderno com a extensão dos cursos: a lista e o guia de criação são do caderno.
	[PAINEL_CURSOS]: { componente: () => null, titulo: "Cursos", foraDaArea: true },
	// A ponte da visão do curso com a extensão de módulos: a geração aparece nos cards do curso.
	[PAINEL_MODULOS]: { componente: () => null, titulo: "Módulos", foraDaArea: true },
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
