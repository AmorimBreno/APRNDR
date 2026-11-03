// A agenda do perfil de estudos (docs/agenda.md): o agenda.json global, em
// <dados>/agenda/, e os eventos de cada mudança. As regras (validação, as
// operações sobre as tarefas e as colunas, o calendário) ficam em
// agenda-tipos.ts, puras e sem Node; aqui ficam o disco e os eventos.
//
// Cada função *NoDisco lê a agenda, aplica a operação pura, grava o arquivo
// inteiro de uma vez (escreve ao lado e renomeia) e só então acrescenta o
// evento. Sem agenda.json, a agenda começa com as colunas padrão e o arquivo
// nasce na primeira escrita. Um agenda.json ilegível é um ErroAgenda, e nada
// é gravado por cima. Quem chama (a extensão) serializa as escritas numa fila:
// aqui não há trava.
//
// Eventos (só de acréscimo, pela acrescentarEvento): os de uma tarefa com
// matéria vão para o eventos.jsonl da matéria (a linha do tempo do caderno);
// os de uma tarefa sem matéria e os das colunas, para agenda/eventos.jsonl.

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type Agenda,
	agendaPadrao,
	apagarColuna,
	apagarTarefa,
	type CampoTarefa,
	criarColuna,
	criarTarefa,
	editarTarefa,
	type EntradaTarefa,
	ErroAgenda,
	marcarFeito,
	type MateriaDaAgenda,
	moverTarefa,
	type MudancasTarefa,
	type ProvaDaAgenda,
	provasDasMaterias,
	renomearColuna,
	reordenarColunas,
	type Tarefa,
	validarAgenda,
} from "./agenda-tipos.ts";
import { gravarDeUmaVez } from "./arquivos.ts";
import { acrescentarEvento, criarEvento, type VerboEvento } from "./eventos.ts";
import { eventosMateria, listarMaterias } from "./materias.ts";

export * from "./agenda-tipos.ts";

export const pastaAgenda = (dados: string) => join(dados, "agenda");
export const arquivoAgenda = (dados: string) => join(pastaAgenda(dados), "agenda.json");
export const eventosAgenda = (dados: string) => join(pastaAgenda(dados), "eventos.jsonl");

/** O que as funções que gravam aceitam: a sessão (para o evento) e o momento (os testes fixam). */
export interface ContextoAgenda {
	sessao?: string;
	agora?: Date;
}

/**
 * A agenda do disco. Sem agenda.json, a padrão (sem gravar). Arquivo que não
 * abre ou não vale, ErroAgenda dizendo o motivo e que nada foi gravado por cima.
 */
export async function lerAgenda(dados: string): Promise<Agenda> {
	const arquivo = arquivoAgenda(dados);
	let texto: string;
	try {
		texto = await readFile(arquivo, "utf8");
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") return agendaPadrao();
		throw new ErroAgenda(`Não consegui abrir a agenda ${arquivo}: ${(erro as Error).message}. Nada foi gravado por cima.`);
	}
	try {
		return validarAgenda(JSON.parse(texto) as unknown);
	} catch (erro) {
		throw new ErroAgenda(`Não consegui ler a agenda ${arquivo}: ${(erro as Error).message}. Corrija o arquivo; nada foi gravado por cima.`);
	}
}

/** Grava o agenda.json inteiro de uma vez (escreve ao lado e renomeia), em JSON com tabulação. */
export async function gravarAgenda(dados: string, agenda: Agenda): Promise<void> {
	await mkdir(pastaAgenda(dados), { recursive: true });
	await gravarDeUmaVez(arquivoAgenda(dados), `${JSON.stringify(agenda, null, "\t")}\n`);
}

/** O que a tela e o ler_agenda precisam: a agenda, as provas de todas as matérias (lidas na hora) e as matérias. */
export async function abrirAgenda(dados: string): Promise<{ agenda: Agenda; provas: ProvaDaAgenda[]; materias: MateriaDaAgenda[] }> {
	const { materias } = await listarMaterias(dados);
	const agenda = await lerAgenda(dados);
	return {
		agenda,
		provas: provasDasMaterias(materias),
		materias: materias.map((materia) => ({ id: materia.id, nome: materia.nome, cor: materia.cor })),
	};
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

/** Um evento a gravar depois da agenda: com `materia`, vai para o eventos.jsonl dela; sem, para o da agenda. */
interface EventoPendente {
	materia?: string;
	verbo: VerboEvento;
	objeto: Record<string, unknown>;
	resultado?: Record<string, unknown>;
}

/** Lê, aplica a operação, grava se a agenda mudou e acrescenta os eventos. Devolve o resto do que a operação devolveu. */
async function aplicar<R extends { agenda: Agenda }>(
	dados: string,
	contexto: ContextoAgenda,
	fazer: (agenda: Agenda, materias: string[]) => { resultado: R; eventos: EventoPendente[] },
): Promise<R> {
	const { materias } = await listarMaterias(dados);
	const ids = materias.map((materia) => materia.id);
	const atual = await lerAgenda(dados);
	const { resultado, eventos } = fazer(atual, ids);
	if (resultado.agenda === atual) return resultado;
	await gravarAgenda(dados, resultado.agenda);
	for (const evento of eventos) {
		// Uma matéria que sumiu não ganha a pasta de volta por causa de um evento: o evento vai para o da agenda.
		const arquivo = evento.materia && ids.includes(evento.materia) ? eventosMateria(dados, evento.materia) : eventosAgenda(dados);
		await acrescentarEvento(
			arquivo,
			criarEvento(
				{
					...(contexto.sessao ? { sessao: contexto.sessao } : {}),
					verbo: evento.verbo,
					objeto: evento.objeto,
					...(evento.resultado ? { resultado: evento.resultado } : {}),
				},
				contexto.agora,
			),
		);
	}
	return resultado;
}

/** O objeto do evento de uma tarefa: a matéria (se tiver), o id e o título. */
const objetoDaTarefa = (tarefa: Tarefa) => ({ ...(tarefa.materia ? { materia: tarefa.materia } : {}), tarefa: tarefa.id, titulo: tarefa.titulo });

/** O objeto do evento de quadro: a agenda e, se for o caso, a coluna. */
const objetoDoQuadro = (coluna?: { id: string; nome: string }) => ({ quadro: "agenda", ...(coluna ? { coluna: coluna.id, nome: coluna.nome } : {}) });

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------

/** Cria a tarefa e grava criou_tarefa. */
export async function criarTarefaNoDisco(dados: string, entrada: EntradaTarefa, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda, materias) => {
		const resultado = criarTarefa(agenda, entrada, { materias, ...(contexto.agora ? { agora: contexto.agora } : {}) });
		const { tarefa } = resultado;
		const coluna = agenda.colunas.find((item) => item.id === tarefa.coluna)!;
		return {
			resultado,
			eventos: [
				{
					...(tarefa.materia ? { materia: tarefa.materia } : {}),
					verbo: "criou_tarefa" as const,
					objeto: objetoDaTarefa(tarefa),
					resultado: { coluna: coluna.id, colunaNome: coluna.nome, ...(tarefa.data ? { data: tarefa.data } : {}), ...(tarefa.hora ? { hora: tarefa.hora } : {}) },
				},
			],
		};
	});
}

/**
 * Edita título, nota, data, hora ou matéria e grava editou_tarefa com o que
 * mudou. Ao trocar a matéria, o evento vai para a matéria nova (ou para o da
 * agenda, se a tarefa ficou sem matéria) e `antes` cita a antiga.
 */
export async function editarTarefaNoDisco(dados: string, id: string, mudancas: MudancasTarefa, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda, materias) => {
		const resultado = editarTarefa(agenda, id, mudancas, { materias, ...(contexto.agora ? { agora: contexto.agora } : {}) });
		const { tarefa, antes, mudou } = resultado;
		const valor = (t: Tarefa, campo: CampoTarefa) => t[campo] ?? null;
		return {
			resultado,
			eventos: mudou.length
				? [
						{
							...(tarefa.materia ? { materia: tarefa.materia } : {}),
							verbo: "editou_tarefa" as const,
							objeto: objetoDaTarefa(tarefa),
							resultado: {
								mudou: Object.fromEntries(mudou.map((campo) => [campo, valor(tarefa, campo)])),
								antes: Object.fromEntries(mudou.map((campo) => [campo, valor(antes, campo)])),
							},
						},
					]
				: [],
		};
	});
}

/**
 * Move a tarefa de coluna ou de posição. Mudar de coluna grava moveu_tarefa;
 * entrar na coluna de feito, concluiu_tarefa no lugar dele; sair dela,
 * reabriu_tarefa. Mudar só de posição na mesma coluna não grava evento.
 */
export async function moverTarefaNoDisco(dados: string, id: string, coluna: string, posicao: number | undefined, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda) => {
		const resultado = moverTarefa(agenda, id, coluna, posicao, contexto.agora ? { agora: contexto.agora } : {});
		const verbo: VerboEvento = resultado.concluiu ? "concluiu_tarefa" : resultado.reabriu ? "reabriu_tarefa" : "moveu_tarefa";
		return {
			resultado,
			eventos: resultado.mudouDeColuna
				? [
						{
							...(resultado.tarefa.materia ? { materia: resultado.tarefa.materia } : {}),
							verbo,
							objeto: objetoDaTarefa(resultado.tarefa),
							resultado: { de: resultado.de.id, deNome: resultado.de.nome, para: resultado.para.id, paraNome: resultado.para.nome },
						},
					]
				: [],
		};
	});
}

/** Apaga a tarefa e grava apagou_tarefa (o evento de criação e os outros continuam onde estão). */
export async function apagarTarefaNoDisco(dados: string, id: string, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda) => {
		const resultado = apagarTarefa(agenda, id);
		const { tarefa } = resultado;
		const coluna = agenda.colunas.find((item) => item.id === tarefa.coluna)!;
		return {
			resultado,
			eventos: [
				{
					...(tarefa.materia ? { materia: tarefa.materia } : {}),
					verbo: "apagou_tarefa" as const,
					objeto: objetoDaTarefa(tarefa),
					resultado: {
						coluna: coluna.id,
						colunaNome: coluna.nome,
						concluida: coluna.feito,
						...(tarefa.data ? { data: tarefa.data } : {}),
						...(tarefa.hora ? { hora: tarefa.hora } : {}),
					},
				},
			],
		};
	});
}

// ---------------------------------------------------------------------------
// Colunas (todas gravam alterou_quadro em agenda/eventos.jsonl)
// ---------------------------------------------------------------------------

export async function criarColunaNoDisco(dados: string, nome: string, posicao: number | undefined, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda) => {
		const resultado = criarColuna(agenda, nome, posicao, contexto.agora ? { agora: contexto.agora } : {});
		const lugar = resultado.agenda.colunas.findIndex((coluna) => coluna.id === resultado.coluna.id);
		return {
			resultado,
			eventos: [{ verbo: "alterou_quadro" as const, objeto: objetoDoQuadro(resultado.coluna), resultado: { acao: "criou_coluna", posicao: lugar } }],
		};
	});
}

export async function renomearColunaNoDisco(dados: string, id: string, nome: string, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda) => {
		const resultado = renomearColuna(agenda, id, nome);
		return {
			resultado,
			eventos: [{ verbo: "alterou_quadro" as const, objeto: objetoDoQuadro(resultado.coluna), resultado: { acao: "renomeou_coluna", de: resultado.anterior, para: resultado.coluna.nome } }],
		};
	});
}

export async function reordenarColunasNoDisco(dados: string, ids: string[], contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda) => {
		const resultado = reordenarColunas(agenda, ids);
		return {
			resultado,
			eventos: [{ verbo: "alterou_quadro" as const, objeto: objetoDoQuadro(), resultado: { acao: "reordenou_colunas", antes: resultado.anterior, depois: ids } }],
		};
	});
}

export async function marcarFeitoNoDisco(dados: string, id: string, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda) => {
		const resultado = marcarFeito(agenda, id, contexto.agora ? { agora: contexto.agora } : {});
		return {
			resultado,
			eventos: [
				{
					verbo: "alterou_quadro" as const,
					objeto: objetoDoQuadro(resultado.coluna),
					resultado: { acao: "marcou_feito", anterior: resultado.anterior.id, concluidas: resultado.concluidas, reabertas: resultado.reabertas },
				},
			],
		};
	});
}

export async function apagarColunaNoDisco(dados: string, id: string, destino: string | undefined, contexto: ContextoAgenda = {}) {
	return aplicar(dados, contexto, (agenda) => {
		const resultado = apagarColuna(agenda, id, destino, contexto.agora ? { agora: contexto.agora } : {});
		return {
			resultado,
			eventos: [
				{
					verbo: "alterou_quadro" as const,
					objeto: objetoDoQuadro(resultado.coluna),
					resultado: {
						acao: "apagou_coluna",
						...(resultado.destino ? { destino: resultado.destino.id, destinoNome: resultado.destino.nome } : {}),
						movidas: resultado.movidas.map((tarefa) => tarefa.id),
					},
				},
			],
		};
	});
}
