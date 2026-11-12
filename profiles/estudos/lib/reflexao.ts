// O agente de reflexão do perfil do aprendiz (item 9, parte B; docs/aprendiz.md, seção 8), sem o modelo:
// monta a ENTRADA da reflexão (os eventos de aprendizagem novos, os anteriores dos mesmos conceitos, as hipóteses
// atuais, os indicadores da parte A e os nomes dos conceitos), lê a SAÍDA do modelo e a valida (validarPropostas,
// de hipoteses-tipos.ts) e orquestra uma reflexão inteira (executarReflexao). A chamada ao modelo, a trava de
// uma reflexão por vez e a fila de gravação são da extensão (extensions/aprendiz.ts), que entrega a
// `chamar` e a `naFila` a executarReflexao. Aqui só se LÊ a pasta de dados; a única gravação é a do
// registrarReflexao (hipoteses.json e eventos do aprendiz), no fim.
//
// A reflexão lê só eventos de aprendizagem (VERBOS_DA_REFLEXAO): os eventos das próprias hipóteses
// (VERBOS_DE_HIPOTESE) nunca entram, nem os de matéria que não existe mais, nem os do método (ajustes e
// experimentos) e das regras de escrita, que não dizem nada do que o Breno sabe. A autoavaliação
// (`autoavaliou_conceito`) vai rotulada como "o aluno disse": é o que ele afirma, nunca uma verdade.
//
// A entrada traz duas listas: os eventos NOVOS (desde a última reflexão; só deles saem as evidências de reforçar,
// enfraquecer e expirar) e os eventos ANTERIORES dos mesmos conceitos (já lidos, dos últimos 90 dias), que uma
// criação pode citar junto de pelo menos um evento novo. Sem eles criar quase nunca seria possível: cada reflexão
// costuma ter uma sessão só.

import { readFile } from "node:fs/promises";
import { type IndicadoresConceito, indicadoresDoAprendiz, materiasExistentes, nomesDosConceitos, pastaCacheAprendiz } from "./aprendiz.ts";
import { NOMES_NIVEL } from "./diagnostico-tipos.ts";
import { type Evento, instanteDoIdEvento, lerEventos, novoIdEvento } from "./eventos.ts";
import {
	arquivoHipoteses,
	conceitosDoEscopo,
	contextoDeValidacao,
	ErroHipoteses,
	type EscopoHipotese,
	type Hipotese,
	lerHipotesesComAvisos,
	materiaDoEscopo,
	MOTIVOS_DE_DESCARTE,
	type MudancaPendente,
	type PropostaValida,
	registrarReflexao,
	type ReflexaoRegistrada,
	type ResumoDaReflexao,
	validarPropostas,
	VERBOS_DA_REFLEXAO,
	VERBOS_DE_DESEMPENHO,
	VERBOS_DE_HIPOTESE,
} from "./hipoteses.ts";
import { objetoJsonDoModelo } from "./json-do-modelo.ts";
import { arquivoMateria, eventosAprendiz } from "./materias.ts";

export { VERBOS_DA_REFLEXAO, VERBOS_DE_DESEMPENHO };

/** No máximo tantos eventos novos entram numa reflexão (os mais novos ficam para a próxima). */
export const LIMITE_EVENTOS_DA_REFLEXAO = 200;

/** O texto livre de um evento (resposta, comentário, trecho) é cortado neste tamanho. */
export const LIMITE_TEXTO_DA_REFLEXAO = 400;

/** Quantas hipóteses rejeitadas vão como "não repetir" (as mais recentes do arquivo). */
export const LIMITE_REJEITADAS_DA_REFLEXAO = 20;

/** Quantas hipóteses expiradas dos últimos dias vão como "pode reforçar pelo id para trazer de volta". */
export const LIMITE_EXPIRADAS_DA_REFLEXAO = 20;

/** As hipóteses expiradas há menos de tantos dias aparecem na entrada. */
export const DIAS_DAS_EXPIRADAS = 90;

/** Quantos conceitos vão na seção de indicadores. */
export const LIMITE_INDICADORES_DA_REFLEXAO = 40;

/** Os eventos anteriores dos mesmos conceitos: de quantos dias para trás e quantos, no máximo. */
export const DIAS_DOS_ANTERIORES = 90;
export const LIMITE_ANTERIORES_DA_REFLEXAO = 60;

/**
 * Os eventos dos últimos 2 s antes de a reflexão começar nunca viram o `ultimoEvento`: os ids vêm do relógio de
 * quando o evento foi criado, não de quando foi gravado, então um evento de id menor pode chegar ao arquivo depois
 * de um de id maior. Eles entram de novo na reflexão seguinte (reler é inofensivo: as evidências já citadas saem).
 */
export const MARGEM_DO_ULTIMO_EVENTO_MS = 2000;

/** O gatilho automático (fim de lição ou de módulo) só chama o modelo com pelo menos tantos eventos de desempenho novos. O botão chama sempre que há evento novo. */
export const MINIMO_DO_GATILHO = 5;

const MS_POR_DIA = 86_400_000;

/** A autoavaliação sozinha não sustenta uma hipótese (9.3): o motivo do descarte feito na validação. */
export const MOTIVO_AUTOAVALIACAO_SOZINHA = MOTIVOS_DE_DESCARTE.autoavaliacaoSemApoio;

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** O texto com os espaços juntados e, passando do limite, cortado com reticências. */
export function cortarTexto(valor: string, limite: number = LIMITE_TEXTO_DA_REFLEXAO): string {
	const limpo = valor.replace(/\s+/gu, " ").trim();
	return limpo.length > limite ? `${limpo.slice(0, Math.max(0, limite - 1)).trimEnd()}…` : limpo;
}

/** A matéria de um evento, se tem. */
const materiaDoEvento = (evento: Pick<Evento, "objeto">): string | undefined => (ehObjeto(evento.objeto) && typeof evento.objeto.materia === "string" ? evento.objeto.materia : undefined);

/** Os pares "matéria\0conceito" de um evento. */
function paresDoEvento(evento: Pick<Evento, "objeto">): string[] {
	const materia = materiaDoEvento(evento);
	if (!materia || !Array.isArray(evento.objeto.conceitos)) return [];
	return (evento.objeto.conceitos as unknown[]).flatMap((conceito) => (typeof conceito === "string" ? [`${materia}\u0000${conceito}`] : []));
}

const porId = (a: Pick<Evento, "id">, b: Pick<Evento, "id">) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// --- A janela de eventos -------------------------------------------------------------------------------

export interface JanelaDaReflexao {
	/** Os eventos que entram, do mais antigo para o mais novo. */
	eventos: Evento[];
	/** Quantos eventos novos ficaram de fora por passar do limite (os mais novos: ficam para a próxima reflexão). */
	cortados: number;
	/** O id do último evento estável que entrou (ver `antesDe`); ausente se a janela está vazia ou nenhum é estável. */
	ultimoEvento?: string;
}

/**
 * Os eventos que a reflexão lê: os de VERBOS_DA_REFLEXAO com id depois de `depoisDe` (comparação de texto: os ids
 * são ordenáveis), sem os de uma matéria que não existe mais (objeto.materia fora de `materias`); em ordem de id.
 * Passando do limite, entram os MAIS ANTIGOS e os mais novos ficam para a próxima reflexão. O `ultimoEvento` é o
 * último evento que entrou e cujo id carrega um instante ANTERIOR a `antesDe` (milissegundos; a reflexão passa o
 * começo dela menos MARGEM_DO_ULTIMO_EVENTO_MS): os mais novos que isso ainda podem ter um vizinho de id menor a
 * caminho do arquivo, e por isso entram de novo na janela seguinte. Id sem a forma de novoIdEvento conta como antigo.
 */
export function janelaDaReflexao(eventos: readonly Evento[], opcoes: { depoisDe?: string; materias: ReadonlySet<string>; limite?: number; antesDe?: number }): JanelaDaReflexao {
	const limite = opcoes.limite ?? LIMITE_EVENTOS_DA_REFLEXAO;
	const verbos: readonly string[] = VERBOS_DA_REFLEXAO;
	const proibidos: readonly string[] = VERBOS_DE_HIPOTESE;
	const novos = eventos
		.filter((evento) => {
			if (!verbos.includes(evento.verbo) || proibidos.includes(evento.verbo)) return false;
			if (opcoes.depoisDe !== undefined && !(evento.id > opcoes.depoisDe)) return false;
			const materia = materiaDoEvento(evento);
			return materia === undefined || opcoes.materias.has(materia);
		})
		.sort(porId);
	// Passando do limite, entram os MAIS ANTIGOS: a próxima reflexão continua dali, sem perder nenhum.
	const entram = limite > 0 && novos.length > limite ? novos.slice(0, limite) : novos;
	const estavel = (evento: Evento) => {
		if (opcoes.antesDe === undefined) return true;
		const instante = instanteDoIdEvento(evento.id);
		return instante === undefined || instante < opcoes.antesDe;
	};
	const ultimo = [...entram].reverse().find(estavel)?.id;
	return { eventos: entram, cortados: novos.length - entram.length, ...(ultimo !== undefined ? { ultimoEvento: ultimo } : {}) };
}

/**
 * Os eventos de aprendizagem anteriores aos novos, dos mesmos pares matéria/conceito que aparecem na janela, dos
 * últimos DIAS_DOS_ANTERIORES dias (pelo ts), sem autoavaliação nem evento de hipótese, só de matéria que existe,
 * que não estejam na janela nem sejam mais novos que o último dela; os `limite` mais recentes, em ordem de id.
 */
export function eventosAnterioresDaReflexao(eventos: readonly Evento[], janela: JanelaDaReflexao, opcoes: { materias: ReadonlySet<string>; agora: Date; limite?: number }): Evento[] {
	const pares = new Set(janela.eventos.flatMap(paresDoEvento));
	if (pares.size === 0) return [];
	const naJanela = new Set(janela.eventos.map((evento) => evento.id));
	const ultimoDaJanela = janela.eventos[janela.eventos.length - 1]?.id ?? "";
	const desde = opcoes.agora.getTime() - DIAS_DOS_ANTERIORES * MS_POR_DIA;
	const verbos: readonly string[] = VERBOS_DA_REFLEXAO;
	const limite = opcoes.limite ?? LIMITE_ANTERIORES_DA_REFLEXAO;
	const achados = eventos
		.filter((evento) => {
			if (!verbos.includes(evento.verbo) || evento.verbo === "autoavaliou_conceito" || naJanela.has(evento.id) || evento.id > ultimoDaJanela) return false;
			const materia = materiaDoEvento(evento);
			if (materia === undefined || !opcoes.materias.has(materia)) return false;
			const instante = Date.parse(evento.ts);
			if (!Number.isFinite(instante) || instante < desde) return false;
			return paresDoEvento(evento).some((par) => pares.has(par));
		})
		.sort(porId);
	return limite > 0 ? achados.slice(-limite) : [];
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

/**
 * O valor do resultado para o modelo: textos cortados, listas curtas, objetos até três camadas. As listas não
 * aumentam a profundidade (os `criterios` de uma dissertativa são uma lista de objetos e chegam inteiros).
 */
function valorParaOModelo(valor: unknown, fundo: number): unknown {
	if (typeof valor === "string") return cortarTexto(valor);
	if (Array.isArray(valor)) return valor.slice(0, 8).map((item) => valorParaOModelo(item, fundo));
	if (ehObjeto(valor)) {
		if (fundo >= 3) return "…";
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
	/** Os eventos anteriores dos mesmos conceitos (eventosAnterioresDaReflexao), já lidos. */
	anteriores?: readonly Evento[];
	hipoteses: readonly Hipotese[];
	mudancas: readonly MudancaPendente[];
	indicadores: readonly IndicadoresConceito[];
	/** As matérias que existem, com o nome. */
	materias: readonly { id: string; nome: string }[];
	nomes: NomesDosConceitos;
}

/**
 * A mensagem que vai ao modelo da reflexão: as matérias e os conceitos, as hipóteses atuais (proposta e aprovada,
 * com o id para reforçar, enfraquecer e expirar), as rejeitadas como "não repetir", as expiradas dos últimos 90 dias
 * (que podem voltar por um reforço), os indicadores dos conceitos que aparecem nos eventos, os eventos anteriores dos
 * mesmos conceitos (já lidos) e os eventos novos, um por linha, com o id que a proposta cita.
 */
export function mensagemDaReflexao(entrada: EntradaDaMensagem): string {
	const { janela, hipoteses, mudancas } = entrada;
	const anteriores = entrada.anteriores ?? [];
	// As sessões dos anteriores e dos novos dividem os mesmos rótulos: o modelo conta sessões diferentes pelo rótulo.
	const rotulos = rotulosDeSessao([...anteriores, ...janela.eventos]);
	const sessoesNovas = new Set(janela.eventos.flatMap((evento) => (evento.sessao ? [evento.sessao] : []))).size;
	const naJanela = new Set(janela.eventos.flatMap(paresDoEvento));
	const materiasDaJanela = new Set<string>();
	for (const evento of [...janela.eventos, ...anteriores]) {
		const materia = materiaDoEvento(evento);
		if (materia) materiasDaJanela.add(materia);
	}

	const atuais = hipoteses.filter((hipotese) => hipotese.status === "proposta" || hipotese.status === "aprovada");
	const rejeitadas = hipoteses.filter((hipotese) => hipotese.status === "rejeitada").slice(-LIMITE_REJEITADAS_DA_REFLEXAO);
	const desdeExpiradas = entrada.agora.getTime() - DIAS_DAS_EXPIRADAS * MS_POR_DIA;
	// A hipótese expirada vira "expirada" numa versão nova: o instante em que expirou é o ts da última versão anterior.
	const expiradas = hipoteses
		.filter((hipotese) => hipotese.status === "expirada" && Date.parse(hipotese.anteriores[hipotese.anteriores.length - 1]?.ts ?? hipotese.ultimaConfirmacao) >= desdeExpiradas)
		.slice(-LIMITE_EXPIRADAS_DA_REFLEXAO);

	// Os conceitos que vale nomear: os dos eventos (novos e anteriores) e os dos escopos das hipóteses atuais.
	const aNomear = new Set([...naJanela, ...anteriores.flatMap(paresDoEvento)]);
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
		`## Hipóteses expiradas nos últimos ${DIAS_DAS_EXPIRADAS} dias (não crie outra igual; se os eventos novos a confirmam, pode reforçar pelo id para trazer de volta)\n${expiradas.length ? expiradas.map((hipotese) => `- ${hipotese.id} | ${hipotese.tipo} | ${descricaoDoEscopo(hipotese.escopo)} | «${hipotese.enunciado}»`).join("\n") : "(nenhuma)"}`,
	);
	secoes.push(
		`## Indicadores dos conceitos que aparecem nos eventos novos (calculados pelo código a partir de TODOS os eventos; os ids de confusões são de eventos antigos: NÃO os cite)\n${indicadores.length ? indicadores.map((indicador) => linhaDoIndicador(indicador, nomeDoConceito(entrada.nomes, indicador.materia, indicador.conceito))).join("\n") : "(nenhum)"}`,
	);
	secoes.push(
		`## Eventos anteriores dos mesmos conceitos (já lidos, dos últimos ${DIAS_DOS_ANTERIORES} dias; só uma proposta de CRIAR pode citá-los, junto de pelo menos 1 evento novo)\n${anteriores.length ? anteriores.map((evento) => linhaDoEventoParaReflexao(evento, rotulos, entrada.nomes)).join("\n") : "(nenhum)"}`,
	);
	const cabecalho = `${janela.eventos.length} eventos novos${janela.cortados > 0 ? ` (os ${janela.cortados} mais novos ficam para a próxima reflexão)` : ""}, de ${sessoesNovas} sessões; do mais antigo para o mais novo`;
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
			/** Os ids dos eventos novos que entraram (a janela da validação) e o que cada um é. */
			janela: string[];
			/** Os ids dos eventos anteriores mostrados como já lidos (só uma criação os cita). */
			anteriores: string[];
			eventos: Pick<Evento, "id" | "verbo" | "sessao">[];
			lidos: number;
			cortados: number;
			/** Os ids da janela depois do `ultimoEvento` (vão em `jaLidos` do resumo). */
			jaLidos: string[];
			/** Quantos eventos novos são de desempenho (VERBOS_DE_DESEMPENHO): o que o gatilho automático confere. */
			desempenho: number;
			/** O último evento estável que entrou; se nenhum é (todos dos últimos 2 s), o da reflexão anterior; pode faltar. */
			ultimoEvento?: string;
			/** O `ultimoEvento` da reflexão anterior. */
			depoisDe?: string;
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
 * (janelaDaReflexao), os anteriores dos mesmos conceitos, as hipóteses, os indicadores da parte A e os nomes. Sem
 * nenhum evento novo na janela, devolve `semEventos: true` (e o modelo não deve ser chamado). Um hipoteses.json que
 * não dá para ler por inteiro é erro (ErroHipoteses) já aqui, antes de gastar uma chamada ao modelo. Não grava nada
 * na pasta de dados; os indicadores usam o cache fora dela (`pastaCache`). O `ultimoEvento` fica pelo menos
 * MARGEM_DO_ULTIMO_EVENTO_MS antes de `agora` (o começo da preparação).
 */
export async function prepararReflexao(dados: string, opcoes: { pastaCache?: string; agora?: Date } = {}): Promise<ReflexaoPreparada> {
	const agora = opcoes.agora ?? new Date();
	const [{ eventos }, { arquivo, avisos }, materias] = await Promise.all([lerEventos(eventosAprendiz(dados)), lerHipotesesComAvisos(dados), materiasExistentes(dados)]);
	if (avisos.length > 0) {
		throw new ErroHipoteses(`Não consegui ler as hipóteses ${arquivoHipoteses(dados)}: ${avisos.join("; ")}. Corrija o arquivo ou tire-o da pasta; o modelo não foi chamado e nada foi gravado.`);
	}
	const depoisDe = arquivo.ultimaReflexao?.ultimoEvento;
	const jaLidos = new Set(arquivo.ultimaReflexao?.jaLidos ?? []);
	const existentes = new Set(materias);
	const janela = janelaDaReflexao(eventos, { ...(depoisDe !== undefined ? { depoisDe } : {}), materias: existentes, antesDe: agora.getTime() - MARGEM_DO_ULTIMO_EVENTO_MS });
	// Sem evento novo; ou só os dos últimos 2 s da reflexão anterior, que entram de novo mas que ela já leu.
	if (janela.eventos.length === 0 || janela.eventos.every((evento) => jaLidos.has(evento.id))) {
		return { semEventos: true, ...(depoisDe !== undefined ? { ultimoEvento: depoisDe } : {}) };
	}

	const anteriores = eventosAnterioresDaReflexao(eventos, janela, { materias: existentes, agora });
	const [indicadores, nomes, nomesDasMateriasLidas] = await Promise.all([
		indicadoresDoAprendiz(dados, opcoes.pastaCache ?? pastaCacheAprendiz(), agora),
		nomesDosConceitos(dados, materias),
		nomesDasMaterias(dados, materias),
	]);
	const mensagem = mensagemDaReflexao({ agora, janela, anteriores, hipoteses: arquivo.hipoteses, mudancas: arquivo.mudancas, indicadores: indicadores.conceitos, materias: nomesDasMateriasLidas, nomes });
	const desempenhos: readonly string[] = VERBOS_DE_DESEMPENHO;
	const ultimoEvento = janela.ultimoEvento ?? depoisDe;
	return {
		semEventos: false,
		mensagem,
		janela: janela.eventos.map((evento) => evento.id),
		anteriores: anteriores.map((evento) => evento.id),
		eventos: janela.eventos.map(({ id, verbo, sessao }) => ({ id, verbo, ...(sessao !== undefined ? { sessao } : {}) })),
		lidos: janela.eventos.length,
		cortados: janela.cortados,
		jaLidos: janela.eventos.filter((evento) => ultimoEvento === undefined || evento.id > ultimoEvento).map((evento) => evento.id),
		desempenho: janela.eventos.filter((evento) => desempenhos.includes(evento.verbo)).length,
		...(ultimoEvento !== undefined ? { ultimoEvento } : {}),
		...(depoisDe !== undefined ? { depoisDe } : {}),
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

export interface SaidaValidada {
	validas: PropostaValida[];
	descartadas: { motivo: string; quantas: number }[];
	/** Quantas propostas o modelo fez. */
	propostas: number;
	lidos: number;
	ultimoEvento?: string;
}

/**
 * Valida o que o modelo propôs contra o disco de agora (hipóteses, eventos e matérias que existem) e contra os
 * eventos que a reflexão leu (os novos e os anteriores já lidos): validarPropostas, que também descarta a
 * autoavaliação sozinha e passa de 6 criações. Devolve as válidas, as descartadas com o motivo, quantas o modelo fez
 * e o que a reflexão leu.
 */
export async function validarSaidaDaReflexao(dados: string, propostas: readonly unknown[], preparada: Extract<ReflexaoPreparada, { semEventos: false }>): Promise<SaidaValidada> {
	const contexto = await contextoDeValidacao(dados, preparada.janela, preparada.anteriores);
	const { validas, descartadas } = validarPropostas(propostas, contexto);
	return { validas, descartadas, propostas: propostas.length, lidos: preparada.lidos, ...(preparada.ultimoEvento !== undefined ? { ultimoEvento: preparada.ultimoEvento } : {}) };
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
	/**
	 * Só chama o modelo se a janela tem pelo menos tantos eventos de desempenho (VERBOS_DE_DESEMPENHO). É o gatilho
	 * automático (MINIMO_DO_GATILHO); o botão não passa. Abaixo disso nada é chamado nem gravado e a janela não avança.
	 */
	minimoDeDesempenho?: number;
	/** Chama o modelo com a mensagem e devolve as propostas lidas do JSON. Falhou: lança, e nada é gravado. */
	chamar: (mensagem: string) => Promise<RespostaDaReflexao>;
	/** Roda a tarefa na fila única de gravação das hipóteses (a leitura e a gravação ficam dentro dela; o modelo, fora). */
	naFila: <T>(tarefa: () => Promise<T>) => Promise<T>;
}

export type ResultadoDaReflexao =
	| { semEventos: true; resumo: ResumoDaReflexao; /** Houve eventos novos, mas menos de minimoDeDesempenho eventos de desempenho. */ abaixoDoMinimo?: true }
	| { semEventos: false; resumo: ResumoDaReflexao; registrada: ReflexaoRegistrada; cortados: number };

/**
 * Faz uma reflexão: monta a entrada (na fila), chama o modelo (fora dela), valida a saída contra o disco de
 * agora e grava (na fila, registrarReflexao). Sem nenhum evento novo na janela, o modelo NÃO é chamado, nada é
 * gravado e o resultado é `semEventos` com um resumo de 0 lidos. O mesmo vale para o gatilho automático com menos
 * de `minimoDeDesempenho` eventos de desempenho (`abaixoDoMinimo`). Se o modelo falhar, nada é gravado e o
 * `ultimoEvento` não avança: a próxima reflexão lê os mesmos eventos de novo.
 */
export async function executarReflexao(dados: string, opcoes: OpcoesDaReflexao): Promise<ResultadoDaReflexao> {
	const agora = opcoes.agora ?? new Date();
	const preparada = await opcoes.naFila(() => prepararReflexao(dados, { ...(opcoes.pastaCache ? { pastaCache: opcoes.pastaCache } : {}), agora }));
	const semNada = (ultimoEvento: string | undefined, abaixoDoMinimo: boolean): ResultadoDaReflexao => {
		const base = { id: `r-${novoIdEvento(agora.getTime())}`, ts: agora.toISOString(), motivo: opcoes.motivo };
		const resumo: ResumoDaReflexao = { ...base, ...(ultimoEvento !== undefined ? { ultimoEvento } : {}), lidos: 0, propostas: 0, aceitas: 0, descartadas: [] };
		return { semEventos: true, resumo, ...(abaixoDoMinimo ? { abaixoDoMinimo: true as const } : {}) };
	};
	if (preparada.semEventos) return semNada(preparada.ultimoEvento, false);
	if (opcoes.minimoDeDesempenho !== undefined && preparada.desempenho < opcoes.minimoDeDesempenho) return semNada(preparada.depoisDe, true);
	const resposta = await opcoes.chamar(preparada.mensagem);
	return opcoes.naFila(async () => {
		// O instante do registro é o do fim da chamada (a validade das hipóteses conta daí).
		const agoraDoRegistro = opcoes.agora ?? new Date();
		const base = { id: `r-${novoIdEvento(agoraDoRegistro.getTime())}`, ts: agoraDoRegistro.toISOString(), motivo: opcoes.motivo };
		const saida = await validarSaidaDaReflexao(dados, resposta.propostas, preparada);
		const resumo: ResumoDaReflexao = {
			...base,
			...(saida.ultimoEvento !== undefined ? { ultimoEvento: saida.ultimoEvento } : {}),
			...(preparada.jaLidos.length > 0 ? { jaLidos: preparada.jaLidos } : {}),
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
