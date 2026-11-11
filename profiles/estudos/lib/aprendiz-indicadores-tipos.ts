// Tipos e constantes dos indicadores por conceito do aprendiz (item 9, parte A; docs/aprendiz.md,
// seção 2): a camada 2 da memória, derivada dos eventos de aprendizagem e recalculável. Sem nada
// do Node: a tela (profiles/estudos/paineis) importa daqui. As funções puras do cálculo (BKT,
// decaimento, Brier, ganho normalizado) estão no fim deste mesmo arquivo (WP1 da parte A).

import type { Evento } from "./eventos.ts";

/** O painel da ponte de eventos (docs/ponte-de-eventos.md); só do perfil do aprendiz, fora da área de painéis. */
export const PAINEL_APRENDIZ = "aprendiz";

/** Muda quando o formato do cache de indicadores mudar (o cache é refeito do zero). */
export const VERSAO_INDICADORES = 1;

/** Os parâmetros do BKT e do decaimento, em <dados>/aprendiz/config.json (campos ausentes valem os padrões). */
export interface ConfigAprendiz {
	bkt: {
		/** P(L0): a probabilidade de já dominar antes da primeira observação. */
		inicio: number;
		/** P(G): acertar sem dominar. */
		chute: number;
		/** P(S): errar dominando. */
		deslize: number;
		/** P(T): aprender a cada observação. */
		aprendizado: number;
	};
	/** Meia-vida do decaimento das evidências, em dias. */
	meiaVidaDias: number;
}

export const CONFIG_APRENDIZ_PADRAO: ConfigAprendiz = {
	bkt: { inicio: 0.3, chute: 0.2, deslize: 0.1, aprendizado: 0.15 },
	meiaVidaDias: 30,
};

/** A probabilidade que cada confiança (1 a 4) diz, para o Brier (a mesma do placar do método). */
export const PROBABILIDADE_DA_CONFIANCA: Readonly<Record<number, number>> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 0.95 };

/** Uma observação de um conceito, tirada de um evento de aprendizagem. */
export interface ObservacaoConceito {
	/** O id do evento de origem (camada 1). */
	evento: string;
	ts: string;
	sessao: string;
	verbo: string;
	materia: string;
	/** O acerto, de 0 a 1 (errada 0, em parte 0,5, certa 1; dissertativa = total / max). */
	acerto: number;
	/** A confiança de 1 a 4 dita antes de responder, se houve. */
	confianca?: number;
}

/** Uma confusão observada: a que a alternativa errada escolhida diz, com os eventos em que apareceu. */
export interface ConfusaoObservada {
	texto: string;
	eventos: string[];
}

/** O que o Breno disse de si no conceito (autoavaliação): fica ao lado do que ele fez e nunca entra no BKT. */
export interface QueDisse {
	/** O nível de 1 a 4. */
	nivel: number;
	evento: string;
	ts: string;
}

export interface IndicadoresConceito {
	/** O id do conceito no mapa da matéria. */
	conceito: string;
	materia: string;
	/** O nome do conceito no mapa (a extensão o acrescenta); ausente se o mapa não o tem mais. */
	nome?: string;
	/** A probabilidade de domínio pelo BKT, de 0 a 1. */
	dominio: number;
	/** Quantas observações entraram no BKT. */
	observacoes: number;
	/** Em quantas sessões diferentes houve observação. */
	sessoes: number;
	/** Os acertos e os erros com o decaimento exponencial (a soma dos pesos, não contagens inteiras). */
	acertosPonderados: number;
	errosPonderados: number;
	/** O ganho normalizado entre a primeira e a última sessão; null com menos de 2 sessões. */
	ganho: number | null;
	/** O Brier das respostas com confiança (menor é melhor); null sem nenhuma. */
	brier: number | null;
	/** A última autoavaliação, se houve. */
	disse?: QueDisse;
	/** O instante da última observação. */
	ultima: string;
	confusoes: ConfusaoObservada[];
	/** Os ids de todos os eventos que entraram (para a tela ligar cada número à sua origem). */
	eventos: string[];
}

/** Tudo o que a camada 2 calcula, de uma vez. */
export interface IndicadoresAprendiz {
	versao: number;
	calculadoEm: string;
	/** O id do último evento lido de aprendiz/eventos.jsonl. */
	ultimoEvento?: string;
	config: ConfigAprendiz;
	conceitos: IndicadoresConceito[];
	/** Eventos de aprendizagem ignorados: de matéria que não existe mais, sem conceitos ou de verbo que não observa. */
	ignorados: { materiaInexistente: number; semConceito: number };
}


// --- O cálculo (WP1 da parte A): tudo puro, recalculável a partir dos eventos --------------------

const MS_POR_DIA = 86_400_000;

/** Os verbos de aprendizagem que viram observação no BKT (autoavaliou_conceito não: vai para QueDisse). */
export const VERBOS_QUE_OBSERVAM = ["respondeu_questao", "respondeu_verificacao", "respondeu_dissertativa", "nao_sabia_questao"] as const;

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const ehNumeroFinito = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor);
const arredondar = (valor: number, casas = 4) => Math.round(valor * 10 ** casas) / 10 ** casas;
const limitar = (valor: number) => Math.min(1, Math.max(0, valor));

/** Uma observação ligada ao conceito a que ela se refere. */
export interface ObservacaoDoConceito extends ObservacaoConceito {
	/** O id do conceito no mapa da matéria. */
	conceito: string;
}

/** Os ids de conceito do evento (objeto.conceitos), sem repetição; textos vazios e outros tipos saem. */
export function conceitosDoEvento(evento: Pick<Evento, "objeto">): string[] {
	const lista = ehObjeto(evento.objeto) ? evento.objeto.conceitos : undefined;
	if (!Array.isArray(lista)) return [];
	return [...new Set(lista.filter((id): id is string => typeof id === "string" && id.trim() !== ""))];
}

const confiancaDoResultado = (resultado: Record<string, unknown>): number | undefined =>
	typeof resultado.confianca === "number" && resultado.confianca in PROBABILIDADE_DA_CONFIANCA ? resultado.confianca : undefined;

/**
 * O acerto (0 a 1) e a confiança que o evento diz, ou null se ele não observa nada:
 * - respondeu_questao: correta true = 1, false = 0; só a primeira tentativa de cada questão
 *   (resultado.tentativa > 1 é a segunda chance, depois de ver a confusão, e não conta);
 * - respondeu_verificacao: certa 1, parcial (ou em_parte) 0,5, errada 0;
 * - respondeu_dissertativa: total / max, também só a primeira tentativa (a reescrita não conta);
 * - nao_sabia_questao: 0, a menos que a questão já tenha tido tentativas (resultado.tentativas > 0):
 *   essa tentativa já foi uma observação.
 */
function acertoDoEvento(evento: Evento): { acerto: number; confianca?: number } | null {
	const resultado = ehObjeto(evento.resultado) ? evento.resultado : {};
	const retentativa = ehNumeroFinito(resultado.tentativa) && resultado.tentativa > 1;
	const confianca = confiancaDoResultado(resultado);
	const com = (acerto: number) => ({ acerto, ...(confianca !== undefined ? { confianca } : {}) });
	switch (evento.verbo) {
		case "respondeu_questao":
			if (retentativa || typeof resultado.correta !== "boolean") return null;
			return com(resultado.correta ? 1 : 0);
		case "respondeu_verificacao": {
			const avaliacao = resultado.avaliacao;
			if (avaliacao === "certa") return com(1);
			if (avaliacao === "parcial" || avaliacao === "em_parte") return com(0.5);
			if (avaliacao === "errada") return com(0);
			return null;
		}
		case "respondeu_dissertativa": {
			if (retentativa || !ehNumeroFinito(resultado.total) || !ehNumeroFinito(resultado.max) || resultado.max <= 0) return null;
			return com(limitar(resultado.total / resultado.max));
		}
		case "nao_sabia_questao":
			if (ehNumeroFinito(resultado.tentativas) && resultado.tentativas > 0) return null;
			return { acerto: 0 };
		default:
			return null;
	}
}

/**
 * As observações de um evento de aprendizagem: uma por conceito de objeto.conceitos, todas com o mesmo acerto.
 * Evento de outro verbo (inclusive autoavaliou_conceito), sem conceitos ou sem resultado legível: nenhuma.
 */
export function observacoesDoEvento(evento: Evento): ObservacaoDoConceito[] {
	const lido = acertoDoEvento(evento);
	if (!lido) return [];
	const materia = ehObjeto(evento.objeto) && typeof evento.objeto.materia === "string" ? evento.objeto.materia : "";
	return conceitosDoEvento(evento).map((conceito) => ({
		evento: evento.id,
		ts: evento.ts,
		sessao: evento.sessao ?? "sem-sessao",
		verbo: evento.verbo,
		materia,
		conceito,
		acerto: lido.acerto,
		...(lido.confianca !== undefined ? { confianca: lido.confianca } : {}),
	}));
}

/** Completa a config lida do config.json com os padrões; o que faltar ou estiver inválido volta ao padrão (nunca lança). */
export function lerConfigAprendiz(json: unknown): ConfigAprendiz {
	const padrao = CONFIG_APRENDIZ_PADRAO;
	const bruto = ehObjeto(json) ? json : {};
	const bkt = ehObjeto(bruto.bkt) ? bruto.bkt : {};
	const probabilidade = (valor: unknown, reserva: number) => (ehNumeroFinito(valor) && valor >= 0 && valor <= 1 ? valor : reserva);
	return {
		bkt: {
			inicio: probabilidade(bkt.inicio, padrao.bkt.inicio),
			chute: probabilidade(bkt.chute, padrao.bkt.chute),
			deslize: probabilidade(bkt.deslize, padrao.bkt.deslize),
			aprendizado: probabilidade(bkt.aprendizado, padrao.bkt.aprendizado),
		},
		meiaVidaDias: ehNumeroFinito(bruto.meiaVidaDias) && bruto.meiaVidaDias > 0 ? bruto.meiaVidaDias : padrao.meiaVidaDias,
	};
}

/**
 * Um passo do BKT com observação fracionária: o posterior é a mistura ponderada entre o posterior de
 * quem acertou e o de quem errou (p' = a * pCerto + (1 - a) * pErrado), e depois vem a transição de aprendizado.
 */
export function atualizarDominio(dominio: number, acerto: number, bkt: ConfigAprendiz["bkt"]): number {
	const { chute, deslize, aprendizado } = bkt;
	const certoSabendo = dominio * (1 - deslize);
	const certoChutando = (1 - dominio) * chute;
	const erradoSabendo = dominio * deslize;
	const erradoChutando = (1 - dominio) * (1 - chute);
	const pCerto = certoSabendo + certoChutando > 0 ? certoSabendo / (certoSabendo + certoChutando) : dominio;
	const pErrado = erradoSabendo + erradoChutando > 0 ? erradoSabendo / (erradoSabendo + erradoChutando) : dominio;
	const posterior = acerto * pCerto + (1 - acerto) * pErrado;
	return posterior + (1 - posterior) * aprendizado;
}

/** O domínio depois de todos os acertos (0 a 1), na ordem dada; sem nenhum, o início do BKT. */
export function dominioPorBkt(acertos: readonly number[], bkt: ConfigAprendiz["bkt"]): number {
	return acertos.reduce((dominio, acerto) => atualizarDominio(dominio, acerto, bkt), bkt.inicio);
}

/** O peso de uma evidência com a idade dada: 0,5 ^ (idade / meia-vida). Idade negativa (evento no futuro) vale 1. */
export function pesoDoDecaimento(idadeDias: number, meiaVidaDias: number): number {
	return 0.5 ** (Math.max(0, idadeDias) / meiaVidaDias);
}

/**
 * O ganho normalizado de Hake entre a média de acertos antes (pré) e depois (pós): (pós - pré) / (1 - pré).
 * Se pós < pré, (pós - pré) / pré. pré = 1 e pós = 1 não tem o que ganhar: null.
 */
export function ganhoDeHake(pre: number, pos: number): number | null {
	if (pos < pre) return pre > 0 ? (pos - pre) / pre : null;
	if (pre >= 1) return null;
	return (pos - pre) / (1 - pre);
}

/** O Brier das observações com confiança, média de (p - acerto)^2; null sem nenhuma. */
export function brierDasObservacoes(observacoes: ReadonlyArray<Pick<ObservacaoConceito, "acerto" | "confianca">>): number | null {
	const comConfianca = observacoes.filter((item): item is { acerto: number; confianca: number } => item.confianca !== undefined);
	if (comConfianca.length === 0) return null;
	const soma = comConfianca.reduce((total, item) => total + (PROBABILIDADE_DA_CONFIANCA[item.confianca]! - item.acerto) ** 2, 0);
	return soma / comConfianca.length;
}

/** O ganho entre a média de acertos da primeira sessão e a da última (pela ordem em que cada sessão aparece); null com menos de 2 sessões. */
export function ganhoDasSessoes(observacoes: ReadonlyArray<Pick<ObservacaoConceito, "sessao" | "acerto">>): number | null {
	const porSessao = new Map<string, number[]>();
	for (const item of observacoes) porSessao.set(item.sessao, [...(porSessao.get(item.sessao) ?? []), item.acerto]);
	if (porSessao.size < 2) return null;
	const medias = [...porSessao.values()].map((lista) => lista.reduce((total, valor) => total + valor, 0) / lista.length);
	return ganhoDeHake(medias[0]!, medias[medias.length - 1]!);
}

/** O que calcularIndicadores precisa além dos eventos. */
export interface OpcoesIndicadores {
	/** Sem ela, os padrões. */
	config?: ConfigAprendiz;
	/** O instante de referência do decaimento (parâmetro para o cálculo ser determinístico). */
	agora: Date;
	/** Os ids das matérias que existem (pastas com materia.json). Evento de outra matéria é ignorado. */
	materias: Iterable<string>;
	/** A confusão de cada respondeu_questao errada, por id de evento, já resolvida (lib/aprendiz.ts). */
	confusoes?: Readonly<Record<string, string>>;
}

const instante = (ts: string) => {
	const valor = Date.parse(ts);
	return Number.isNaN(valor) ? 0 : valor;
};

/** A confusão que o evento diz: a já resolvida por id; senão a que o próprio resultado traz (resultado.confusao). */
function confusaoDoEvento(evento: Evento, confusoes: Readonly<Record<string, string>>): string | undefined {
	if (evento.verbo !== "respondeu_questao" || !ehObjeto(evento.resultado) || evento.resultado.correta !== false) return undefined;
	const texto = confusoes[evento.id] ?? evento.resultado.confusao;
	return typeof texto === "string" && texto.trim() !== "" ? texto.trim() : undefined;
}

interface Acumulado {
	materia: string;
	conceito: string;
	observacoes: ObservacaoDoConceito[];
	disse?: QueDisse;
	confusoes: Map<string, string[]>;
	eventos: Set<string>;
	ultima: string;
}

/**
 * Os indicadores por conceito (a camada 2, docs/aprendiz.md seção 2) a partir dos eventos do aprendiz.
 * Puro: sem disco, sem relógio (o `agora` é parâmetro). Os eventos entram em ordem de ts. O conceito é
 * identificado por matéria + id (os ids são do mapa de cada matéria). Um conceito só autoavaliado aparece
 * com observacoes 0 e o domínio inicial. Eventos de matéria que não existe entram em
 * ignorados.materiaInexistente e não contam em nada; os sem conceitos, em ignorados.semConceito.
 */
export function calcularIndicadores(eventos: readonly Evento[], opcoes: OpcoesIndicadores): IndicadoresAprendiz {
	const config = opcoes.config ?? CONFIG_APRENDIZ_PADRAO;
	const materias = new Set(opcoes.materias);
	const confusoes = opcoes.confusoes ?? {};
	const agora = opcoes.agora.getTime();
	const ignorados = { materiaInexistente: 0, semConceito: 0 };
	const porConceito = new Map<string, Acumulado>();
	const acumulado = (materia: string, conceito: string, ts: string): Acumulado => {
		const chave = `${materia}\u0000${conceito}`;
		let item = porConceito.get(chave);
		if (!item) {
			item = { materia, conceito, observacoes: [], confusoes: new Map(), eventos: new Set(), ultima: ts };
			porConceito.set(chave, item);
		}
		return item;
	};

	const ordenados = eventos
		.map((evento, indice) => ({ evento, indice }))
		.sort((a, b) => (a.evento.ts < b.evento.ts ? -1 : a.evento.ts > b.evento.ts ? 1 : a.indice - b.indice))
		.map(({ evento }) => evento);

	for (const evento of ordenados) {
		const observa = (VERBOS_QUE_OBSERVAM as readonly string[]).includes(evento.verbo);
		if (!observa && evento.verbo !== "autoavaliou_conceito") continue;
		const materia = ehObjeto(evento.objeto) && typeof evento.objeto.materia === "string" ? evento.objeto.materia : "";
		if (!materias.has(materia)) {
			ignorados.materiaInexistente++;
			continue;
		}
		const conceitos = conceitosDoEvento(evento);
		if (conceitos.length === 0) {
			ignorados.semConceito++;
			continue;
		}
		if (evento.verbo === "autoavaliou_conceito") {
			const nivel = ehObjeto(evento.resultado) ? evento.resultado.nivel : undefined;
			if (typeof nivel !== "number" || !Number.isInteger(nivel) || nivel < 1 || nivel > 4) continue;
			for (const conceito of conceitos) {
				const item = acumulado(materia, conceito, evento.ts);
				item.disse = { nivel, evento: evento.id, ts: evento.ts };
				if (evento.ts > item.ultima) item.ultima = evento.ts;
			}
			continue;
		}
		for (const observacao of observacoesDoEvento(evento)) {
			const item = acumulado(materia, observacao.conceito, evento.ts);
			item.observacoes.push(observacao);
			item.eventos.add(evento.id);
			if (evento.ts > item.ultima) item.ultima = evento.ts;
		}
		// A confusão vale também na segunda tentativa errada, que não entra no BKT.
		const confusao = confusaoDoEvento(evento, confusoes);
		if (confusao) {
			for (const conceito of conceitos) {
				const item = acumulado(materia, conceito, evento.ts);
				item.confusoes.set(confusao, [...(item.confusoes.get(confusao) ?? []), evento.id]);
				item.eventos.add(evento.id);
				if (evento.ts > item.ultima) item.ultima = evento.ts;
			}
		}
	}

	const conceitos: IndicadoresConceito[] = [...porConceito.values()].map((item) => {
		let acertosPonderados = 0;
		let errosPonderados = 0;
		for (const observacao of item.observacoes) {
			const peso = pesoDoDecaimento((agora - instante(observacao.ts)) / MS_POR_DIA, config.meiaVidaDias);
			acertosPonderados += observacao.acerto * peso;
			errosPonderados += (1 - observacao.acerto) * peso;
		}
		const brier = brierDasObservacoes(item.observacoes);
		const ganho = ganhoDasSessoes(item.observacoes);
		return {
			conceito: item.conceito,
			materia: item.materia,
			dominio: arredondar(dominioPorBkt(item.observacoes.map((observacao) => observacao.acerto), config.bkt)),
			observacoes: item.observacoes.length,
			sessoes: new Set(item.observacoes.map((observacao) => observacao.sessao)).size,
			acertosPonderados: arredondar(acertosPonderados),
			errosPonderados: arredondar(errosPonderados),
			ganho: ganho === null ? null : arredondar(ganho),
			brier: brier === null ? null : arredondar(brier),
			...(item.disse ? { disse: item.disse } : {}),
			ultima: item.ultima,
			confusoes: [...item.confusoes.entries()].map(([texto, ids]) => ({ texto, eventos: ids })),
			eventos: [...item.eventos],
		};
	});
	conceitos.sort((a, b) => (a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : `${a.materia}/${a.conceito}`.localeCompare(`${b.materia}/${b.conceito}`)));

	const ultimoEvento = eventos[eventos.length - 1]?.id;
	return {
		versao: VERSAO_INDICADORES,
		calculadoEm: opcoes.agora.toISOString(),
		...(ultimoEvento ? { ultimoEvento } : {}),
		config,
		conceitos,
		ignorados,
	};
}
