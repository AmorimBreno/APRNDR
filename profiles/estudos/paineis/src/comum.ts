// O que a tela de cadernos e a do caderno dividem: o painel da ponte com a
// extensão de matérias, a leitura do que ela mandou, as contas de prova e a
// escolha da conversa (a geral ou a da matéria) antes de ir para ela.

import { type AcaoRecebida, type AparenciaContextos, type ContextoSessao, guardarSessaoDoPerfil, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useEffect, useMemo, useRef } from "react";
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

/**
 * O contexto da conversa de um caderno (ContextoSessao do núcleo): a chave e o
 * nome da matéria, o que o professor precisa saber e a pasta que limita a
 * busca nos materiais.
 */
export function contextoDaMateria(materia: Materia): ContextoSessao {
	return {
		chave: `materia:${materia.id}`,
		rotulo: materia.nome,
		cor: materia.cor,
		instrucoes: [
			`Esta conversa é do caderno da matéria ${materia.nome} (pasta materias/${materia.id} da pasta de dados).`,
			"Quando o Breno falar da matéria, da aula, dos slides ou da prova, é desta.",
			"A busca nos materiais (buscar_material e listar_arquivos_de_material) já fica nesta matéria; só use todas: true se ele pedir para procurar em outras matérias.",
			"As notas pessoais dele neste caderno você lê com listar_notas e ler_nota; elas são dele, então nunca escreva nem mude uma nota.",
		].join(" "),
		escopoMateriais: `materias/${materia.id}`,
	};
}

/**
 * Deixa aberta a conversa certa antes de ir para ela: com um contexto, a
 * conversa mais recente daquela matéria (ou uma nova, se ainda não houver);
 * com null, a conversa geral mais recente (sem matéria). Se a sessão aberta
 * já for a certa, não troca. Guarda a sessão na aba, para a janela de
 * conversa abrir nela.
 */
export async function prepararConversa(janela: JanelaPerfilHook, perfilId: string, contexto: ContextoSessao | null): Promise<void> {
	const { estado, acoes } = janela;
	const chave = contexto?.chave;
	const atual = estado.sessao?.contexto;
	if (estado.sessao && atual?.chave === chave && atual?.rotulo === contexto?.rotulo && atual?.cor === contexto?.cor) return;
	const sessoes = await acoes.listarSessoes();
	const ultima = sessoes.find((sessao) => sessao.contexto?.chave === chave);
	// Reabrindo, o contexto vai junto: se a matéria mudou de nome ou de cor, a conversa acompanha.
	const aberta = ultima ? await acoes.abrirSessao(ultima.id, contexto ?? undefined) : await acoes.novaSessao(undefined, contexto);
	guardarSessaoDoPerfil(perfilId, aberta.sessaoId);
}

/**
 * O nome e a cor de agora de cada matéria, pela chave do contexto
 * ("materia:<id>"), para a janela de conversa pintar a pílula do histórico
 * (EntradaTelaInicial.usarAparenciaContextos). Pede a lista à extensão quando
 * a sessão abre ou troca.
 */
export function usarAparenciaMaterias(janela: JanelaPerfilHook): AparenciaContextos {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	useEffect(() => {
		if (sessaoId) semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "listar"));
	}, [sessaoId, acoes]);
	const recebidas = estado.acoesPorPainel[PAINEL_CADERNOS];
	// Trocar de sessão zera as ações da ponte: até a lista nova chegar, vale a última.
	const ultima = useRef<AparenciaContextos>({});
	const aparencia = useMemo(() => {
		const lista = lerAcoes(recebidas ?? []).lista;
		if (!lista) return undefined;
		return Object.fromEntries(lista.materias.map((materia) => [`materia:${materia.id}`, { rotulo: materia.nome, cor: materia.cor }]));
	}, [recebidas]);
	if (aparencia) ultima.current = aparencia;
	return aparencia ?? ultima.current;
}
