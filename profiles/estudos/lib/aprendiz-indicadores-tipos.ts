// Tipos e constantes dos indicadores por conceito do aprendiz (item 9, parte A; docs/aprendiz.md,
// seção 2): a camada 2 da memória, derivada dos eventos de aprendizagem e recalculável. Sem nada
// do Node: a tela (profiles/estudos/paineis) importa daqui. As funções puras do cálculo (BKT,
// decaimento, Brier, ganho normalizado) entram neste mesmo arquivo, no WP1 da parte A.

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
