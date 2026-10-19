// O que a tela de cadernos e a do caderno dividem: o painel da ponte com a
// extensão de matérias, a leitura do que ela mandou e as contas de prova.

import type { AcaoRecebida } from "@estudos/ui";
import type { Evento } from "../../lib/eventos.ts";
import type { ListaMaterias, Materia } from "../../lib/materia-tipos.ts";

/** O painel da ponte que a extensão de matérias (extensions/materias.ts) atende. */
export const PAINEL_CADERNOS = "cadernos";

export const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const UM_DIA = 24 * 60 * 60 * 1000;

/** A data AAAA-MM-DD como meia-noite local. */
export const dataLocal = (data: string) => new Date(`${data}T00:00:00`);

/** "20 nov" (sem o ponto da abreviação). */
export const dataCurta = (data: string) => diaMes.format(dataLocal(data)).replace(".", "");

/** A próxima prova (hoje ou depois) e quantos dias faltam. */
export function proximaProva(materia: Materia, hoje: Date) {
	const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
	const futuras = materia.provas
		.map((prova) => ({ ...prova, dias: Math.round((dataLocal(prova.data).getTime() - inicio) / UM_DIA) }))
		.filter((prova) => prova.dias >= 0)
		.sort((a, b) => a.dias - b.dias);
	return futuras[0];
}

export function quando(dias: number): string {
	if (dias === 0) return "hoje";
	if (dias === 1) return "amanhã";
	return `em ${dias} dias`;
}

/** O nome curto na etiqueta da capa: a primeira palavra. */
export const rotuloCapa = (nome: string) => nome.split(" ")[0] ?? nome;

/** O caderno aberto, como a extensão manda ("caderno"). */
export interface DadosCaderno {
	materia: Materia;
	eventos: Evento[];
	invalidas: number;
}

/**
 * O que a extensão mandou ao painel "cadernos": a última lista, o último
 * caderno de cada matéria e um erro da lista (ou da abertura de um caderno),
 * se ele veio depois. Os erros de criar e alterar são dos modais.
 */
export function lerAcoes(acoes: AcaoRecebida[]): {
	lista?: ListaMaterias;
	erro?: string;
	cadernos: Record<string, DadosCaderno>;
	errosAbrir: Record<string, string>;
} {
	let lista: ListaMaterias | undefined;
	let erro: string | undefined;
	const cadernos: Record<string, DadosCaderno> = {};
	const errosAbrir: Record<string, string> = {};
	for (const acao of acoes) {
		const dados = acao.dados as { ao?: string; id?: string; mensagem?: string } | undefined;
		if (acao.acao === "lista") {
			lista = acao.dados as ListaMaterias;
			erro = undefined;
		} else if (acao.acao === "caderno") {
			const caderno = acao.dados as DadosCaderno;
			cadernos[caderno.materia.id] = caderno;
			delete errosAbrir[caderno.materia.id];
		} else if (acao.acao === "erro" && dados?.ao === "abrir" && dados.id) {
			errosAbrir[dados.id] = dados.mensagem ?? "Erro desconhecido.";
		} else if (acao.acao === "erro" && !dados?.ao) {
			erro = dados?.mensagem ?? "Erro desconhecido.";
		}
	}
	return { ...(lista ? { lista } : {}), ...(erro ? { erro } : {}), cadernos, errosAbrir };
}
