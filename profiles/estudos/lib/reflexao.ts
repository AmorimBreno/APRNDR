// O agente de reflexão do perfil do aprendiz (item 9, parte B; docs/aprendiz.md, seção 8), sem o modelo:
// monta a ENTRADA da reflexão (os eventos de aprendizagem novos, as hipóteses atuais, os indicadores da
// parte A e os nomes dos conceitos), lê a SAÍDA do modelo e a valida (validarPropostas, de
// hipoteses-tipos.ts) e orquestra uma reflexão inteira (executarReflexao). A chamada ao modelo, a trava de
// uma reflexão por vez e a fila de gravação são da extensão (extensions/aprendiz.ts), que entrega a
// `chamar` e a `naFila` a executarReflexao. Aqui só se LÊ a pasta de dados; a única gravação é a do
// registrarReflexao (hipoteses.json e eventos do aprendiz), no fim.
//
// A reflexão lê só eventos de aprendizagem (VERBOS_DA_REFLEXAO): os eventos das próprias hipóteses
// (VERBOS_DE_HIPOTESE) nunca entram, nem os de matéria que não existe mais, nem os do método (ajustes e
// experimentos) e das regras de escrita, que não dizem nada do que o Breno sabe. A autoavaliação
// (`autoavaliou_conceito`) vai rotulada como "o aluno disse": é o que ele afirma, nunca uma verdade.

import { readFile } from "node:fs/promises";
import { type IndicadoresConceito, indicadoresDoAprendiz, materiasExistentes, nomesDosConceitos, pastaCacheAprendiz } from "./aprendiz.ts";
import { NOMES_NIVEL } from "./diagnostico-tipos.ts";
import { type Evento, lerEventos, novoIdEvento } from "./eventos.ts";
import {
	conceitosDoEscopo,
	contextoDeValidacao,
	type EscopoHipotese,
	type Hipotese,
	lerHipotesesComAvisos,
	materiaDoEscopo,
	type MudancaPendente,
	normalizarTexto,
	type PropostaValida,
	registrarReflexao,
	type ReflexaoRegistrada,
	type ResumoDaReflexao,
	validarPropostas,
	VERBOS_DE_HIPOTESE,
} from "./hipoteses.ts";
import { objetoJsonDoModelo } from "./json-do-modelo.ts";
import { arquivoMateria, eventosAprendiz } from "./materias.ts";

/** No máximo tantos eventos entram numa reflexão (os mais antigos saem). */
export const LIMITE_EVENTOS_DA_REFLEXAO = 200;

/** O texto livre de um evento (resposta, comentário, trecho) é cortado neste tamanho. */
export const LIMITE_TEXTO_DA_REFLEXAO = 400;

/** Quantas hipóteses rejeitadas vão como "não repetir" (as mais recentes do arquivo). */
export const LIMITE_REJEITADAS_DA_REFLEXAO = 20;

/** Quantos conceitos vão na seção de indicadores. */
export const LIMITE_INDICADORES_DA_REFLEXAO = 40;

/** Os verbos de aprendizagem que a reflexão lê: o que o Breno respondeu, avaliou, pediu e disse de si. */
export const VERBOS_DA_REFLEXAO = [
	"autoavaliou_conceito",
	"respondeu_questao",
	"respondeu_verificacao",
	"respondeu_dissertativa",
	"nao_sabia_questao",
	"avaliou_bloco",
	"avaliou_licao",
	"reescreveu_bloco",
	"pediu_explicacao",
	"guardou_termo",
	"pediu_reexplicacao",
	"pediu_outro_jeito",
	"escreveu_entendimento",
	"marcou_confianca",
] as const;

/** A autoavaliação não sustenta sozinha uma hipótese de conhecimento (9.3): o descarte que o código faz além da validação. */
export const MOTIVO_AUTOAVALIACAO_SOZINHA = "autoavaliacao_sem_apoio";

const TIPOS_DE_CONHECIMENTO: readonly string[] = ["conhecimento", "misconception", "vocabulario"];

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** O texto com os espaços juntados e, passando do limite, cortado com reticências. */
export function cortarTexto(valor: string, limite: number = LIMITE_TEXTO_DA_REFLEXAO): string {
	const limpo = valor.replace(/\s+/gu, " ").trim();
	return limpo.length > limite ? `${limpo.slice(0, Math.max(0, limite - 1)).trimEnd()}…` : limpo;
}

// --- A janela de eventos -------------------------------------------------------------------------------

export interface JanelaDaReflexao {
	/** Os eventos que entram, do mais antigo para o mais novo. */
	eventos: Evento[];
	/** Quantos eventos novos ficaram de fora por passar do limite (os mais antigos). */
	cortados: number;
	/** O id do último evento que entrou; ausente se a janela está vazia. */
	ultimoEvento?: string;
}

/**
 * Os eventos que a reflexão lê: os de VERBOS_DA_REFLEXAO com id depois de `depoisDe` (comparação de texto: os ids
 * são ordenáveis), sem os de uma matéria que não existe mais (objeto.materia fora de `materias`); em ordem de id.
 * Passando do limite, os mais antigos saem e o último que entrou é o último de todos.
 */
export function janelaDaReflexao(eventos: readonly Evento[], opcoes: { depoisDe?: string; materias: ReadonlySet<string>; limite?: number }): JanelaDaReflexao {
	const limite = opcoes.limite ?? LIMITE_EVENTOS_DA_REFLEXAO;
	const verbos: readonly string[] = VERBOS_DA_REFLEXAO;
	const proibidos: readonly string[] = VERBOS_DE_HIPOTESE;
	const novos = eventos
		.filter((evento) => {
			if (!verbos.includes(evento.verbo) || proibidos.includes(evento.verbo)) return false;
			if (opcoes.depoisDe !== undefined && !(evento.id > opcoes.depoisDe)) return false;
			const materia = ehObjeto(evento.objeto) ? evento.objeto.materia : undefined;
			return typeof materia !== "string" || opcoes.materias.has(materia);
		})
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	// Passando do limite, entram os MAIS ANTIGOS e o ultimoEvento é o último que entrou: a próxima reflexão continua dali, sem perder nenhum.
	const entram = limite > 0 && novos.length > limite ? novos.slice(0, limite) : novos;
	const ultimo = entram[entram.length - 1]?.id;
	return { eventos: entram, cortados: novos.length - entram.length, ...(ultimo !== undefined ? { ultimoEvento: ultimo } : {}) };
}

// --- O texto da entrada --------------------------------------------------------------------------------

/** Cada sessão vira S1, S2... na ordem em que aparece (o modelo conta sessões diferentes pelo rótulo). */
export function rotulosDeSessao(eventos: readonly Pick<Evento, "sessao">[]): Map<string, string> {
	const rotulos = new Map<string, string>();
	for (const evento of eventos) {
		if (typeof evento.sessao === "string" && evento.sessao !== "" && !rotulos.has(evento.sessao)) rotulos.set(evento.sessao, `S${rotulos.size + 1}`);
	}
	return rotulos;
}

/** O valor do resultado para o modelo: textos cortados, listas curtas, objetos até duas camadas. */
function valorParaOModelo(valor: unknown, fundo: number): unknown {
	if (typeof valor === "string") return cortarTexto(valor);
	if (Array.isArray(valor)) return valor.slice(0, 8).map((item) => valorParaOModelo(item, fundo + 1));
	if (ehObjeto(valor)) {
		if (fundo >= 2) return "…";
		return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, valorParaOModelo(item, fundo + 1)]));
	}
	return valor;
}

/** Os nomes que as linhas usam: materia -> (conceito -> nome). */
export type NomesDosConceitos = ReadonlyMap<string, ReadonlyMap<string, string>>;

const nomeDoConceito = (nomes: NomesDosConceitos, materia: string | undefined, conceito: string) => (materia ? nomes.get(materia)?.get(conceito) : undefined);

/** A autoavaliação como o modelo a lê: o que o aluno DISSE, nunca o que ele fez. */
function linhaDaAutoavaliacao(resultado: Record<string, unknown>): string {
	const nivel = resultado.nivel;
	const nome = typeof nivel === "number" && Number.isInteger(nivel) && nivel in NOMES_NIVEL ? `«${NOMES_NIVEL[nivel as 0 | 1 | 2 | 3]}»` : "";
	return `O ALUNO DISSE (autoavaliação, não é o que ele fez): nível ${String(nivel)} ${nome}`.trim();
}

/**
 * Uma linha da entrada: "- <id> | S2 | 2026-11-03 | <verbo> | <onde> | conceitos: c1 (Nome) | <resultado>". O
 * `autoavaliou_conceito` traz no lugar do resultado a frase "O ALUNO DISSE". O texto livre sai cortado.
 */
export function linhaDoEventoParaReflexao(evento: Evento, rotulos: ReadonlyMap<string, string>, nomes: NomesDosConceitos): string {
	const objeto = ehObjeto(evento.objeto) ? evento.objeto : {};
	const resultado = ehObjeto(evento.resultado) ? evento.resultado : {};
	const materia = typeof objeto.materia === "string" ? objeto.materia : undefined;
	const onde = ["materia", "curso", "modulo", "licao", "bloco", "questao"].flatMap((campo) => (typeof objeto[campo] === "string" ? [`${campo}=${objeto[campo] as string}`] : []));
	const conceitos = Array.isArray(objeto.conceitos) ? objeto.conceitos.filter((id): id is string => typeof id === "string") : [];
	const partes = [
		evento.id,
		(evento.sessao ? rotulos.get(evento.sessao) : undefined) ?? "S?",
		evento.ts.slice(0, 10),
		evento.verbo,
		onde.join(" ") || "-",
		conceitos.length ? `conceitos: ${conceitos.map((id) => (nomeDoConceito(nomes, materia, id) ? `${id} (${nomeDoConceito(nomes, materia, id)})` : id)).join(", ")}` : "conceitos: -",
		evento.verbo === "autoavaliou_conceito" ? linhaDaAutoavaliacao(resultado) : `resultado: ${JSON.stringify(valorParaOModelo(resultado, 0))}`,
	];
	return `- ${partes.join(" | ")}`;
}

const descricaoDoEscopo = (escopo: EscopoHipotese): string =>
	escopo.nivel === "global" ? "global" : escopo.nivel === "materia" ? `matéria ${escopo.materia}` : `conceito ${escopo.conceitos.join(", ")} da matéria ${escopo.materia}`;

function linhaDaHipotese(hipotese: Hipotese, pendentes: readonly MudancaPendente[]): string {
	const mudancas = pendentes.filter((mudanca) => mudanca.hipotese === hipotese.id).map((mudanca) => mudanca.acao);
	const partes = [
		hipotese.id,
		hipotese.status,
		hipotese.tipo,
		descricaoDoEscopo(hipotese.escopo),
		`confiança ${hipotese.confianca}`,
		`${hipotese.aFavor.length} a favor, ${hipotese.contra.length} contra`,
		`«${hipotese.enunciado}»`,
	];
	if (mudancas.length) partes.push(`mudança pendente esperando o aluno: ${mudancas.join(", ")}`);
	return `- ${partes.join(" | ")}`;
}

const duas = (valor: number) => valor.toFixed(2);

function linhaDoIndicador(indicador: IndicadoresConceito, nome: string | undefined): string {
	const quem = `${indicador.materia}/${indicador.conceito}${nome ? ` «${nome}»` : ""}`;
	const feito =
		indicador.observacoes > 0
			? `domínio ${Math.round(indicador.dominio * 100)}% (BKT, ${indicador.observacoes} observações em ${indicador.sessoes} sessões), acertos ${duas(indicador.acertosPonderados)} e erros ${duas(indicador.errosPonderados)} com decaimento, Brier ${indicador.brier === null ? "sem dados" : duas(indicador.brier)}`
			: "sem respostas medidas (só autoavaliação)";
	const disse = indicador.disse ? `; o aluno DISSE nível ${indicador.disse.nivel} em ${indicador.disse.ts.slice(0, 10)}` : "";
	const confusoes = indicador.confusoes.length ? `; confusões: ${indicador.confusoes.map((confusao) => `«${cortarTexto(confusao.texto, 160)}» (${confusao.eventos.join(", ")})`).join("; ")}` : "";
	return `- ${quem}: ${feito}${disse}${confusoes}`;
}

export interface EntradaDaMensagem {
	agora: Date;
	janela: JanelaDaReflexao;
	hipoteses: readonly Hipotese[];
	mudancas: readonly MudancaPendente[];
	indicadores: readonly IndicadoresConceito[];
	/** As matérias que existem, com o nome. */
	materias: readonly { id: string; nome: string }[];
	nomes: NomesDosConceitos;
}

/**
 * A mensagem que vai ao modelo da reflexão: as matérias e os conceitos, as hipóteses atuais (proposta e aprovada,
 * com o id para reforçar, enfraquecer e expirar), as rejeitadas como "não repetir", os indicadores dos conceitos
 * que aparecem nos eventos e os eventos novos, um por linha, com o id que a proposta cita.
 */
export function mensagemDaReflexao(entrada: EntradaDaMensagem): string {
	const { janela, hipoteses, mudancas } = entrada;
	const rotulos = rotulosDeSessao(janela.eventos);
	const naJanela = new Set<string>();
	const materiasDaJanela = new Set<string>();
	for (const evento of janela.eventos) {
		const materia = ehObjeto(evento.objeto) && typeof evento.objeto.materia === "string" ? evento.objeto.materia : undefined;
		if (materia) materiasDaJanela.add(materia);
		for (const conceito of Array.isArray(evento.objeto?.conceitos) ? (evento.objeto.conceitos as unknown[]) : []) {
			if (typeof conceito === "string" && materia) naJanela.add(`${materia}\u0000${conceito}`);
		}
	}

	const atuais = hipoteses.filter((hipotese) => hipotese.status === "proposta" || hipotese.status === "aprovada");
	const rejeitadas = hipoteses.filter((hipotese) => hipotese.status === "rejeitada").slice(-LIMITE_REJEITADAS_DA_REFLEXAO);

	// Os conceitos que vale nomear: os dos eventos e os dos escopos das hipóteses atuais.
	const aNomear = new Set(naJanela);
	for (const hipotese of atuais) {
		const materia = materiaDoEscopo(hipotese.escopo);
		if (materia) for (const conceito of conceitosDoEscopo(hipotese.escopo)) aNomear.add(`${materia}\u0000${conceito}`);
		if (materia) materiasDaJanela.add(materia);
	}
	const linhasDeConceitos = [...aNomear].sort().map((chave) => {
		const [materia, conceito] = chave.split("\u0000") as [string, string];
		return `- ${materia}/${conceito} = ${nomeDoConceito(entrada.nomes, materia, conceito) ?? "(sem nome no mapa)"}`;
	});

	const indicadores = entrada.indicadores.filter((indicador) => naJanela.has(`${indicador.materia}\u0000${indicador.conceito}`)).slice(0, LIMITE_INDICADORES_DA_REFLEXAO);

	const secoes: string[] = [`Hoje é ${entrada.agora.toISOString().slice(0, 10)}.`];
	const materias = entrada.materias.filter((materia) => materiasDaJanela.has(materia.id));
	secoes.push(`## Matérias\n${materias.length ? materias.map((materia) => `- ${materia.id} = ${materia.nome}`).join("\n") : "(nenhuma)"}`);
	secoes.push(`## Conceitos (matéria/id = nome)\n${linhasDeConceitos.length ? linhasDeConceitos.join("\n") : "(nenhum)"}`);
	secoes.push(
		`## Hipóteses atuais (para reforçar, enfraquecer ou expirar pelo id; não crie outra igual)\n${atuais.length ? atuais.map((hipotese) => linhaDaHipotese(hipotese, mudancas)).join("\n") : "(nenhuma)"}`,
	);
	secoes.push(`## Hipóteses que o aluno rejeitou (NÃO repetir, nem com outras palavras)\n${rejeitadas.length ? rejeitadas.map((hipotese) => `- «${hipotese.enunciado}»`).join("\n") : "(nenhuma)"}`);
	secoes.push(
		`## Indicadores dos conceitos que aparecem nos eventos (calculados pelo código a partir de TODOS os eventos)\n${indicadores.length ? indicadores.map((indicador) => linhaDoIndicador(indicador, nomeDoConceito(entrada.nomes, indicador.materia, indicador.conceito))).join("\n") : "(nenhum)"}`,
	);
	const cabecalho = `${janela.eventos.length} eventos novos${janela.cortados > 0 ? ` (os ${janela.cortados} mais antigos ficaram de fora)` : ""}, ${rotulos.size} sessões (S1 a S${rotulos.size}); do mais antigo para o mais novo`;
	secoes.push(`## Eventos novos (${cabecalho})\n${janela.eventos.map((evento) => linhaDoEventoParaReflexao(evento, rotulos, entrada.nomes)).join("\n")}`);
	return secoes.join("\n\n");
}

// --- Preparar a reflexão (lê o disco) ------------------------------------------------------------------

export type ReflexaoPreparada =
	| { semEventos: true; ultimoEvento?: string }
	| {
			semEventos: false;
			/** A mensagem ao modelo. */
			mensagem: string;
			/** Os ids dos eventos que entraram (a janela da validação) e o que cada um é. */
			janela: string[];
			eventos: Pick<Evento, "id" | "verbo" | "sessao">[];
			lidos: number;
			cortados: number;
			ultimoEvento: string;
	  };

async function nomesDasMaterias(dados: string, materias: readonly string[]): Promise<{ id: string; nome: string }[]> {
	const nomes: { id: string; nome: string }[] = [];
	for (const id of materias) {
		try {
			const lido = JSON.parse(await readFile(arquivoMateria(dados, id), "utf8")) as { nome?: unknown };
			nomes.push({ id, nome: typeof lido.nome === "string" ? lido.nome : id });
		} catch {
			nomes.push({ id, nome: id });
		}
	}
	return nomes;
}

/**
 * Lê o disco e monta a entrada da reflexão: os eventos de aprendizagem depois do `ultimoEvento` da última reflexão
 * (janelaDaReflexao), as hipóteses, os indicadores da parte A e os nomes. Sem nenhum evento novo na janela, devolve
 * `semEventos: true` (e o modelo não deve ser chamado). Não grava nada na pasta de dados; os indicadores usam o
 * cache fora dela (`pastaCache`).
 */
export async function prepararReflexao(dados: string, opcoes: { pastaCache?: string; agora?: Date } = {}): Promise<ReflexaoPreparada> {
	const agora = opcoes.agora ?? new Date();
	const [{ eventos }, { arquivo }, materias] = await Promise.all([lerEventos(eventosAprendiz(dados)), lerHipotesesComAvisos(dados), materiasExistentes(dados)]);
	const depoisDe = arquivo.ultimaReflexao?.ultimoEvento;
	const janela = janelaDaReflexao(eventos, { ...(depoisDe !== undefined ? { depoisDe } : {}), materias: new Set(materias) });
	if (janela.eventos.length === 0) return { semEventos: true, ...(depoisDe !== undefined ? { ultimoEvento: depoisDe } : {}) };

	const [indicadores, nomes, nomesDasMateriasLidas] = await Promise.all([
		indicadoresDoAprendiz(dados, opcoes.pastaCache ?? pastaCacheAprendiz(), agora),
		nomesDosConceitos(dados, materias),
		nomesDasMaterias(dados, materias),
	]);
	const mensagem = mensagemDaReflexao({ agora, janela, hipoteses: arquivo.hipoteses, mudancas: arquivo.mudancas, indicadores: indicadores.conceitos, materias: nomesDasMateriasLidas, nomes });
	return {
		semEventos: false,
		mensagem,
		janela: janela.eventos.map((evento) => evento.id),
		eventos: janela.eventos.map(({ id, verbo, sessao }) => ({ id, verbo, ...(sessao !== undefined ? { sessao } : {}) })),
		lidos: janela.eventos.length,
		cortados: janela.cortados,
		ultimoEvento: janela.ultimoEvento!,
	};
}

// --- A saída do modelo ---------------------------------------------------------------------------------

/**
 * A lista "propostas" do JSON da resposta do modelo (objetoJsonDoModelo: cerca de código ou texto em volta). Sem o
 * campo ou fora do formato, um Error com o motivo (a chamada tenta uma vez de novo dizendo o erro).
 */
export function propostasDaResposta(texto: string): unknown[] {
	const propostas = objetoJsonDoModelo(texto).propostas;
	if (!Array.isArray(propostas)) throw new Error('falta o campo "propostas" com uma lista (pode ser vazia)');
	return propostas;
}

/**
 * A autoavaliação sozinha não sustenta uma hipótese de conhecimento (9.3): a criação ou a mudança de tipo
 * conhecimento, misconception ou vocabulário que cita só `autoavaliou_conceito` (ou, ao criar, menos de 2 eventos de
 * 2 sessões que não sejam autoavaliação) sai da lista, e o motivo MOTIVO_AUTOAVALIACAO_SOZINHA conta como descarte.
 * Propostas que não têm a forma esperada passam adiante: quem as descarta é a validação.
 */
export function descartarAutoavaliacaoSozinha(
	propostas: readonly unknown[],
	eventos: ReadonlyMap<string, Pick<Evento, "verbo" | "sessao">>,
	hipoteses: readonly Pick<Hipotese, "id" | "tipo">[],
): { restam: unknown[]; descartadas: number } {
	const restam: unknown[] = [];
	let descartadas = 0;
	for (const proposta of propostas) {
		if (!ehObjeto(proposta) || !Array.isArray(proposta.evidencias) || proposta.evidencias.some((id) => typeof id !== "string")) {
			restam.push(proposta);
			continue;
		}
		const ids = [...new Set(proposta.evidencias as string[])];
		const reais = ids.filter((id) => eventos.get(id)?.verbo !== "autoavaliou_conceito");
		const acao = typeof proposta.acao === "string" ? normalizarTexto(proposta.acao) : "";
		const tipo = acao === "criar" ? (typeof proposta.tipo === "string" ? normalizarTexto(proposta.tipo).replace(/ /gu, "_") : "") : hipoteses.find((hipotese) => hipotese.id === proposta.hipotese)?.tipo;
		const deConhecimento = tipo !== undefined && TIPOS_DE_CONHECIMENTO.includes(tipo);
		let semApoio = false;
		if (deConhecimento && acao === "criar") {
			const sessoes = new Set(reais.map((id) => eventos.get(id)?.sessao).filter((sessao): sessao is string => typeof sessao === "string" && sessao !== ""));
			semApoio = ids.length > 0 && (reais.length < 2 || sessoes.size < 2) && ids.some((id) => eventos.get(id)?.verbo === "autoavaliou_conceito");
		} else if (deConhecimento && (acao === "reforcar" || acao === "enfraquecer")) {
			semApoio = ids.length > 0 && reais.length === 0;
		}
		if (semApoio) descartadas++;
		else restam.push(proposta);
	}
	return { restam, descartadas };
}

export interface SaidaValidada {
	validas: PropostaValida[];
	descartadas: { motivo: string; quantas: number }[];
	/** Quantas propostas o modelo fez. */
	propostas: number;
	lidos: number;
	ultimoEvento: string;
}

/**
 * Valida o que o modelo propôs contra o disco de agora (hipóteses, eventos e matérias que existem) e contra a janela
 * que a reflexão leu: validarPropostas mais o descarte da autoavaliação sozinha. Devolve as válidas, as descartadas
 * com o motivo, quantas o modelo fez e o que a reflexão leu.
 */
export async function validarSaidaDaReflexao(dados: string, propostas: readonly unknown[], preparada: Extract<ReflexaoPreparada, { semEventos: false }>): Promise<SaidaValidada> {
	const contexto = await contextoDeValidacao(dados, preparada.janela);
	const porId = new Map(preparada.eventos.map((evento) => [evento.id, evento]));
	const filtrado = descartarAutoavaliacaoSozinha(propostas, porId, contexto.hipoteses);
	const { validas, descartadas } = validarPropostas(filtrado.restam, contexto);
	const todas = filtrado.descartadas > 0 ? [...descartadas, { motivo: MOTIVO_AUTOAVALIACAO_SOZINHA, quantas: filtrado.descartadas }] : descartadas;
	return { validas, descartadas: todas, propostas: propostas.length, lidos: preparada.lidos, ultimoEvento: preparada.ultimoEvento };
}

// --- Uma reflexão inteira ------------------------------------------------------------------------------

/** O que a chamada ao modelo devolve: as propostas (do JSON) e o que custou, em dólares. */
export interface RespostaDaReflexao {
	propostas: unknown[];
	custo: number;
}

export interface OpcoesDaReflexao {
	motivo: ResumoDaReflexao["motivo"];
	/** A sessão do pi (vai nos eventos gravados). */
	sessao?: string;
	agora?: Date;
	pastaCache?: string;
	/** Chama o modelo com a mensagem e devolve as propostas lidas do JSON. Falhou: lança, e nada é gravado. */
	chamar: (mensagem: string) => Promise<RespostaDaReflexao>;
	/** Roda a tarefa na fila única de gravação das hipóteses (a leitura e a gravação ficam dentro dela; o modelo, fora). */
	naFila: <T>(tarefa: () => Promise<T>) => Promise<T>;
}

export type ResultadoDaReflexao =
	| { semEventos: true; resumo: ResumoDaReflexao }
	| { semEventos: false; resumo: ResumoDaReflexao; registrada: ReflexaoRegistrada; cortados: number };

/**
 * Faz uma reflexão: monta a entrada (na fila), chama o modelo (fora dela), valida a saída contra o disco de
 * agora e grava (na fila, registrarReflexao). Sem nenhum evento novo na janela, o modelo NÃO é chamado, nada é
 * gravado e o resultado é `semEventos` com um resumo de 0 lidos. Se o modelo falhar, nada é gravado e o
 * `ultimoEvento` não avança: a próxima reflexão lê os mesmos eventos de novo.
 */
export async function executarReflexao(dados: string, opcoes: OpcoesDaReflexao): Promise<ResultadoDaReflexao> {
	const agora = opcoes.agora ?? new Date();
	const preparada = await opcoes.naFila(() => prepararReflexao(dados, { ...(opcoes.pastaCache ? { pastaCache: opcoes.pastaCache } : {}), agora }));
	if (preparada.semEventos) {
		const base = { id: `r-${novoIdEvento(agora.getTime())}`, ts: agora.toISOString(), motivo: opcoes.motivo };
		return { semEventos: true, resumo: { ...base, ...(preparada.ultimoEvento !== undefined ? { ultimoEvento: preparada.ultimoEvento } : {}), lidos: 0, propostas: 0, aceitas: 0, descartadas: [] } };
	}
	const resposta = await opcoes.chamar(preparada.mensagem);
	return opcoes.naFila(async () => {
		// O instante do registro é o do fim da chamada (a validade das hipóteses conta daí).
		const agoraDoRegistro = opcoes.agora ?? new Date();
		const base = { id: `r-${novoIdEvento(agoraDoRegistro.getTime())}`, ts: agoraDoRegistro.toISOString(), motivo: opcoes.motivo };
		const saida = await validarSaidaDaReflexao(dados, resposta.propostas, preparada);
		const resumo: ResumoDaReflexao = {
			...base,
			ultimoEvento: saida.ultimoEvento,
			lidos: saida.lidos,
			propostas: saida.propostas,
			aceitas: saida.validas.length,
			descartadas: saida.descartadas,
			custo: resposta.custo,
		};
		const registrada = await registrarReflexao(dados, { resumo, propostasValidas: saida.validas, ...(opcoes.sessao ? { sessao: opcoes.sessao } : {}), agora: agoraDoRegistro });
		return { semEventos: false, resumo, registrada, cortados: preparada.cortados };
	});
}
