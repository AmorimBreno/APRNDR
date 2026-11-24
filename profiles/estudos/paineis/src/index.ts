// Código de tela do perfil de estudos (ESPECIFICACAO 4): a tela inicial (os
// cadernos) e os painéis. O front junta este registro de painéis com o do núcleo. Os ids são os do campo paineis
// do profile.json. Estilos em estilo.css ("@estudos/perfil-estudos/estilo.css").

import type { EntradaTelaInicial, RegistroPaineis } from "@estudos/ui";
import { ehPergunta, PainelQuiz } from "./PainelQuiz.tsx";
import { trocaSemTransicao } from "./transicoes.ts";
import { PAINEL_MESA } from "../../lib/mesa-tipos.ts";
import { PAINEL_AGENDA } from "./agenda-ponte.ts";
import { PAINEL_APRENDIZ } from "./aprendiz-ponte.ts";
import { ehRotaDoAprendiz } from "./aprendiz-tela.ts";
import { CabecalhoFlutuante } from "./CabecalhoFlutuante.tsx";
import { PAINEL_CADERNOS, usarAparenciaMaterias } from "./comum.ts";
import { PAINEL_CURSOS } from "./cursos-ponte.ts";
import { PAINEL_ESCRITA } from "./escrita-ponte.ts";
import { PAINEL_MAPA } from "./mapa-ponte.ts";
import { PAINEL_MODULOS } from "./modulos-ponte.ts";
import { PAINEL_NOTAS } from "./notas-ponte.ts";
import { PAINEL_PLANOS } from "./planos-ponte.ts";
import { TelaEstudos } from "./TelaEstudos.tsx";

export { PainelQuiz } from "./PainelQuiz.tsx";
export { TelaCaderno } from "./TelaCaderno.tsx";
export { TelaCadernos } from "./TelaCadernos.tsx";
export { TelaEstudos } from "./TelaEstudos.tsx";

/** O perfil abre nos cadernos; a conversa volta para eles (ou para o caderno de onde foi aberta). */
export const telaInicialEstudos: EntradaTelaInicial = {
	componente: TelaEstudos,
	rotuloVoltar: "Cadernos",
	rotuloDoCaminho: (caminho) => (caminho.startsWith("caderno/") ? "Caderno" : caminho.startsWith("agenda") ? "Agenda" : ehRotaDoAprendiz(caminho) ? "Aprendiz" : undefined),
	// O nome e a cor de agora de cada matéria, para a pílula do histórico da conversa.
	usarAparenciaContextos: usarAparenciaMaterias,
	// Trocas dentro do mesmo lugar (tags do caderno, abas da mesa, abas da agenda, abas e filtro do aprendiz) não animam a página inteira:
	// só a parte que muda é refeita (transicoes.ts).
	semTransicao: trocaSemTransicao,
	// O topo do chat do professor flutuante: a matéria da conversa e o seletor de plano.
	cabecalhoFlutuante: CabecalhoFlutuante,
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
	// A ponte de "Como o professor escreve" com a extensão dos módulos: as regras de escrita são do modal.
	[PAINEL_ESCRITA]: { componente: () => null, titulo: "Regras de escrita", foraDaArea: true },
	// A ponte do seletor de plano (cabeçalho do professor) com a extensão dos planos: as listas são da tela, nunca viram card.
	[PAINEL_PLANOS]: { componente: () => null, titulo: "Planos de estudos", foraDaArea: true },
	// Os comandos do professor para a mesa (abrir uma aba, destacar um trecho; docs/mesa-parte-c.md): nunca viram card.
	[PAINEL_MESA]: { componente: () => null, titulo: "Mesa", foraDaArea: true },
	// A ponte da agenda com a extensão da agenda: as tarefas são do calendário e da tela da agenda.
	[PAINEL_AGENDA]: { componente: () => null, titulo: "Agenda", foraDaArea: true },
	// A ponte da tela "Perfil do aprendiz" com a extensão do aprendiz: os indicadores são da tela, não viram card.
	[PAINEL_APRENDIZ]: { componente: () => null, titulo: "Aprendiz", foraDaArea: true },
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
