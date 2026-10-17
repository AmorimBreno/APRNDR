// Estado de uma janela de perfil no front, como um reducer puro: recebe o
// estado e uma mensagem do servidor (ou uma ação local do hook) e devolve o
// novo estado. Genérico: sessão, conversa, ferramentas, fila, uso, carregando,
// erros e a ponte de interface (painel, ação e dados), sem nada de um perfil.
//
// Ordem dos eventos de uma resposta (eventos.ts do núcleo): os deltas de texto
// e de raciocínio, a "mensagem_assistente" que fecha a mensagem e, se ela
// chamou ferramentas, "ferramenta_inicio" / "ferramenta_progresso" /
// "ferramenta_fim". Depois vem a próxima mensagem do assistente. Por isso a
// conversa é uma lista em ordem: cada ferramenta entra logo depois da
// mensagem que a chamou.

import type {
	DadosResposta,
	HistoricoPonte,
	Diagnostico,
	EstadoSessao,
	EventoNucleo,
	ItemHistorico,
	MensagemServidor,
	MotivoCancelamento,
	TipoMensagemCliente,
} from "./tipos.ts";

export type StatusFerramenta = "executando" | "ok" | "erro" | "sem_resultado";

export interface ChamadaFerramenta {
	id: string;
	nome: string;
	argumentos: unknown;
	/** Chamada feita por outra ferramenta (ctx.executeTool). */
	idPai?: string;
	status: StatusFerramenta;
	/** Último resumo de progresso. */
	progresso?: string;
	/** Resumo do resultado, quando terminou. */
	resumo?: string;
	duracaoMs?: number;
}

/** Tokens e custo de uma resposta (o UsoModelo do núcleo). */
export interface UsoResposta {
	tokensEntrada: number;
	tokensSaida: number;
	tokensCacheLeitura: number;
	tokensCacheEscrita: number;
	tokensTotal: number;
	custo: number;
}

export type ItemConversa =
	| { tipo: "usuario"; chave: string; texto: string; momento?: string }
	| {
			tipo: "assistente";
			chave: string;
			texto: string;
			raciocinio: string;
			modelo?: string;
			erro?: string;
			/** true enquanto os pedaços ainda estão chegando. */
			emAndamento: boolean;
			/** Para o botão de informações da resposta: quando começou (ISO), quanto levou, o uso e o agente. */
			momento?: string;
			duracaoMs?: number;
			uso?: UsoResposta;
			agente?: string;
	  }
	| { tipo: "ferramenta"; chave: string; chamada: ChamadaFerramenta };

export interface UsoSomado {
	tokensEntrada: number;
	tokensSaida: number;
	tokensCacheLeitura: number;
	tokensCacheEscrita: number;
	tokensTotal: number;
	/** Dólares, como o pi informa. */
	custo: number;
	/** Respostas contadas (inclusive as dos subagentes). */
	respostas: number;
}

export interface ErroJanela {
	chave: string;
	origem: "modelo" | "extensao" | "nucleo" | "servidor" | "pedido";
	mensagem: string;
}

/** Pedido da ponte esperando a resposta do usuário. */
export interface PedidoPendente {
	id: string;
	painel: string;
	acao: string;
	dados: unknown;
}

/** Situação de um pedido da ponte, para o botão na conversa e a revisão. */
export type EstadoPedido = "pendente" | "respondido" | "cancelado";

/** Um pedido da sessão aberta, com o que aconteceu com ele. */
export interface RegistroPedido extends PedidoPendente {
	estado: EstadoPedido;
	/** Ordem de chegada (para numerar "Pergunta 01", "Pergunta 02"…). */
	ordem: number;
	/** O que o usuário mandou, quando respondeu. */
	resposta?: unknown;
	/** Por que foi cancelado. */
	motivo?: MotivoCancelamento;
}

/** Ação da ponte ("interface:mostrar") recebida para um painel. */
export interface AcaoRecebida {
	chave: string;
	acao: string;
	dados: unknown;
}

export interface AvisoRecarregado {
	chave: string;
	motivo: "arquivo" | "pedido";
	arquivos?: string[];
}

export interface EstadoJanela {
	perfil: string;
	/** Estado da sessão do servidor; undefined até a primeira resposta. */
	sessao?: EstadoSessao;
	/** true depois do primeiro "historico" (a tela de carregamento some). */
	pronto: boolean;
	/** Mensagem da tela de carregamento; undefined quando não está carregando. */
	carregando?: string;
	conversa: ItemConversa[];
	executando: boolean;
	fila: string[];
	uso: UsoSomado;
	/** Diagnósticos da sessão mais os que chegaram durante a execução (sem repetir). */
	diagnosticos: Diagnostico[];
	erros: ErroJanela[];
	pedidos: PedidoPendente[];
	/** Ações recebidas por painel, em ordem de chegada (as mais antigas saem depois do limite). */
	acoesPorPainel: Record<string, AcaoRecebida[]>;
	/** Pedidos cancelados pelo núcleo, por id (para o painel saber por quê). */
	cancelados: Record<string, MotivoCancelamento>;
	/** Todos os pedidos da sessão aberta, por id, com a situação de cada um. Zera ao trocar de sessão. */
	registrosPedidos: Record<string, RegistroPedido>;
	/** A sessão dos registros reconstruídos do histórico (para a resposta do pedido não zerá-los). */
	sessaoDosPedidos?: string;
	recarregado?: AvisoRecarregado;
	/** Contador para as chaves dos itens (o reducer continua puro: vem no estado). */
	contador: number;
}

/** Ações que não vêm do servidor: o hook as despacha. */
export type AcaoLocal =
	/** A conexão caiu: a execução em andamento não vai mais mandar eventos para esta tela. */
	| { tipo: "local:conexao_caiu" }
	/** O usuário respondeu (ou cancelou) um pedido da ponte. `dados` = o que ele mandou. */
	| { tipo: "local:pedido_respondido"; id: string; dados?: unknown }
	| { tipo: "local:limpar_erros" }
	| { tipo: "local:fechar_aviso_recarregado" };

export type AcaoJanela = MensagemServidor | AcaoLocal;

export const LIMITE_ACOES_POR_PAINEL = 50;
const LIMITE_ERROS = 20;

const usoZerado: UsoSomado = {
	tokensEntrada: 0,
	tokensSaida: 0,
	tokensCacheLeitura: 0,
	tokensCacheEscrita: 0,
	tokensTotal: 0,
	custo: 0,
	respostas: 0,
};

export function estadoInicial(perfil: string): EstadoJanela {
	return {
		perfil,
		pronto: false,
		conversa: [],
		executando: false,
		fila: [],
		uso: usoZerado,
		diagnosticos: [],
		erros: [],
		pedidos: [],
		acoesPorPainel: {},
		cancelados: {},
		registrosPedidos: {},
		contador: 0,
	};
}

/** Pedidos cuja resposta bem-sucedida traz o EstadoSessao. */
const respostasComEstado = new Set<TipoMensagemCliente>([
	"abrir_perfil",
	"trocar_modelo",
	"trocar_agente",
	"nova_sessao",
	"abrir_sessao",
	"recarregar_perfil",
]);

function chave(estado: EstadoJanela, prefixo: string): [string, number] {
	const contador = estado.contador + 1;
	return [`${prefixo}${contador}`, contador];
}

function comErro(estado: EstadoJanela, origem: ErroJanela["origem"], mensagem: string): EstadoJanela {
	const [nova, contador] = chave(estado, "e");
	const erros = [...estado.erros, { chave: nova, origem, mensagem }].slice(-LIMITE_ERROS);
	return { ...estado, erros, contador };
}

function mesmoDiagnostico(a: Diagnostico, b: Diagnostico): boolean {
	return a.nivel === b.nivel && a.mensagem === b.mensagem;
}

/** Troca o estado da sessão. Outra sessão zera o uso e os diagnósticos de execução. */
function comSessao(estado: EstadoJanela, sessao: EstadoSessao): EstadoJanela {
	const outraSessao = estado.sessao?.sessaoId !== sessao.sessaoId;
	const extras = outraSessao
		? []
		: estado.diagnosticos.filter(
				(diagnostico) =>
					!estado.sessao?.diagnosticos.some((daSessao) => mesmoDiagnostico(daSessao, diagnostico)) &&
					!sessao.diagnosticos.some((daSessao) => mesmoDiagnostico(daSessao, diagnostico)),
			);
	return {
		...estado,
		sessao,
		diagnosticos: [...sessao.diagnosticos, ...extras],
		...(outraSessao ? { uso: usoZerado } : {}),
		// Os registros já reconstruídos do histórico desta sessão ficam (a resposta chega depois dele).
		...(outraSessao && estado.sessaoDosPedidos !== sessao.sessaoId ? { registrosPedidos: {} } : {}),
	};
}

/** Índice da mensagem do assistente que está chegando (a última da conversa, se em andamento). */
function indiceEmAndamento(conversa: ItemConversa[]): number {
	const ultimo = conversa.length - 1;
	const item = conversa[ultimo];
	return item?.tipo === "assistente" && item.emAndamento ? ultimo : -1;
}

function substituir<T>(lista: T[], indice: number, item: T): T[] {
	const copia = [...lista];
	copia[indice] = item;
	return copia;
}

function acrescentarDelta(estado: EstadoJanela, campo: "texto" | "raciocinio", delta: string): EstadoJanela {
	const indice = indiceEmAndamento(estado.conversa);
	if (indice >= 0) {
		const item = estado.conversa[indice] as Extract<ItemConversa, { tipo: "assistente" }>;
		return { ...estado, conversa: substituir(estado.conversa, indice, { ...item, [campo]: item[campo] + delta }) };
	}
	const [nova, contador] = chave(estado, "a");
	const item: ItemConversa = {
		tipo: "assistente",
		chave: nova,
		texto: campo === "texto" ? delta : "",
		raciocinio: campo === "raciocinio" ? delta : "",
		emAndamento: true,
	};
	return { ...estado, conversa: [...estado.conversa, item], contador };
}

/** Os dados da resposta para o botão de informações, sem campos vazios. */
function dadosDaResposta(final: { momento?: string; duracaoMs?: number; uso?: UsoResposta; agente?: string }) {
	return {
		...(final.momento ? { momento: final.momento } : {}),
		...(final.duracaoMs !== undefined ? { duracaoMs: final.duracaoMs } : {}),
		...(final.uso ? { uso: final.uso } : {}),
		...(final.agente ? { agente: final.agente } : {}),
	};
}

function fecharAssistente(
	estado: EstadoJanela,
	final: { texto: string; raciocinio: string; modelo: string; erro?: string; momento?: string; duracaoMs?: number; uso?: UsoResposta; agente?: string },
): EstadoJanela {
	const vazia = !final.texto && !final.raciocinio && !final.erro;
	const indice = indiceEmAndamento(estado.conversa);
	if (indice >= 0) {
		if (vazia) return { ...estado, conversa: estado.conversa.filter((_, i) => i !== indice) };
		const item = estado.conversa[indice] as Extract<ItemConversa, { tipo: "assistente" }>;
		return {
			...estado,
			conversa: substituir(estado.conversa, indice, {
				...item,
				texto: final.texto,
				raciocinio: final.raciocinio,
				modelo: final.modelo || undefined,
				...(final.erro ? { erro: final.erro } : {}),
				...dadosDaResposta(final),
				emAndamento: false,
			}),
		};
	}
	if (vazia) return estado;
	const [nova, contador] = chave(estado, "a");
	const item: ItemConversa = {
		tipo: "assistente",
		chave: nova,
		texto: final.texto,
		raciocinio: final.raciocinio,
		...(final.modelo ? { modelo: final.modelo } : {}),
		...(final.erro ? { erro: final.erro } : {}),
		...dadosDaResposta(final),
		emAndamento: false,
	};
	return { ...estado, conversa: [...estado.conversa, item], contador };
}

/** Atualiza a chamada de ferramenta com o id; se ela não está na conversa, acrescenta. */
function atualizarFerramenta(
	estado: EstadoJanela,
	base: Pick<ChamadaFerramenta, "id" | "nome"> & { idPai?: string },
	mudar: (chamada: ChamadaFerramenta) => ChamadaFerramenta,
): EstadoJanela {
	for (let i = estado.conversa.length - 1; i >= 0; i--) {
		const item = estado.conversa[i]!;
		if (item.tipo === "ferramenta" && item.chamada.id === base.id) {
			return { ...estado, conversa: substituir(estado.conversa, i, { ...item, chamada: mudar(item.chamada) }) };
		}
	}
	const [nova, contador] = chave(estado, "f");
	const chamada = mudar({
		id: base.id,
		nome: base.nome,
		argumentos: undefined,
		...(base.idPai ? { idPai: base.idPai } : {}),
		status: "executando",
	});
	return { ...estado, conversa: [...estado.conversa, { tipo: "ferramenta", chave: nova, chamada }], contador };
}

/** Converte o histórico do servidor na conversa da tela. */
export function conversaDoHistorico(itens: ItemHistorico[], contadorInicial = 0): { conversa: ItemConversa[]; contador: number } {
	let contador = contadorInicial;
	const conversa: ItemConversa[] = [];
	const ferramentas = new Map<string, number>();
	for (const item of itens) {
		if (item.papel === "usuario") {
			conversa.push({ tipo: "usuario", chave: `h${++contador}`, texto: item.texto, ...(item.momento ? { momento: item.momento } : {}) });
		} else if (item.papel === "assistente") {
			if (item.texto || item.raciocinio || item.erro) {
				conversa.push({
					tipo: "assistente",
					chave: `h${++contador}`,
					texto: item.texto,
					raciocinio: item.raciocinio,
					...(item.modelo ? { modelo: item.modelo } : {}),
					...(item.erro ? { erro: item.erro } : {}),
					...dadosDaResposta(item),
					emAndamento: false,
				});
			}
			for (const ferramenta of item.ferramentas) {
				ferramentas.set(ferramenta.id, conversa.length);
				conversa.push({
					tipo: "ferramenta",
					chave: `h${++contador}`,
					chamada: { id: ferramenta.id, nome: ferramenta.nome, argumentos: ferramenta.argumentos, status: "sem_resultado" },
				});
			}
		} else {
			const indice = ferramentas.get(item.id);
			const existente = indice === undefined ? undefined : conversa[indice];
			if (existente?.tipo === "ferramenta") {
				conversa[indice!] = {
					...existente,
					chamada: { ...existente.chamada, status: item.erro ? "erro" : "ok", resumo: item.resumo },
				};
			} else {
				conversa.push({
					tipo: "ferramenta",
					chave: `h${++contador}`,
					chamada: { id: item.id, nome: item.nome, argumentos: undefined, status: item.erro ? "erro" : "ok", resumo: item.resumo },
				});
			}
		}
	}
	return { conversa, contador };
}

function aplicarEvento(estado: EstadoJanela, evento: EventoNucleo): EstadoJanela {
	switch (evento.tipo) {
		case "execucao_inicio":
			return { ...estado, executando: true };

		case "execucao_fim": {
			// Fecha o que ficou aberto: texto chegando e ferramentas sem fim.
			const conversa = estado.conversa.map((item): ItemConversa => {
				if (item.tipo === "assistente" && item.emAndamento) return { ...item, emAndamento: false };
				if (item.tipo === "ferramenta" && item.chamada.status === "executando") {
					return { ...item, chamada: { ...item.chamada, status: "sem_resultado" } };
				}
				return item;
			});
			return { ...estado, executando: false, conversa };
		}

		case "mensagem_usuario": {
			const [nova, contador] = chave(estado, "u");
			const item: ItemConversa = { tipo: "usuario", chave: nova, texto: evento.texto, ...(evento.momento ? { momento: evento.momento } : {}) };
			return { ...estado, conversa: [...estado.conversa, item], contador };
		}

		case "texto_delta":
			return acrescentarDelta(estado, "texto", evento.delta);

		case "raciocinio_delta":
			return acrescentarDelta(estado, "raciocinio", evento.delta);

		case "mensagem_assistente":
			// O agente da resposta ao vivo é o da sessão agora.
			return fecharAssistente(estado, {
				texto: evento.texto,
				raciocinio: evento.raciocinio,
				modelo: evento.modelo,
				...(evento.erro ? { erro: evento.erro } : {}),
				...dadosDaResposta({ ...evento, ...(estado.sessao?.agente ? { agente: estado.sessao.agente } : {}) }),
			});

		case "ferramenta_inicio":
			return atualizarFerramenta(estado, evento, (chamada) => ({
				...chamada,
				argumentos: evento.argumentos,
				...(evento.idPai ? { idPai: evento.idPai } : {}),
				status: "executando",
			}));

		case "ferramenta_progresso":
			return atualizarFerramenta(estado, evento, (chamada) => ({ ...chamada, progresso: evento.resumo }));

		case "ferramenta_fim":
			return atualizarFerramenta(estado, evento, (chamada) => ({
				...chamada,
				status: evento.erro ? "erro" : "ok",
				resumo: evento.resumo,
				...(evento.duracaoMs !== undefined ? { duracaoMs: evento.duracaoMs } : {}),
			}));

		case "uso": {
			const uso = estado.uso;
			return {
				...estado,
				uso: {
					tokensEntrada: uso.tokensEntrada + evento.tokensEntrada,
					tokensSaida: uso.tokensSaida + evento.tokensSaida,
					tokensCacheLeitura: uso.tokensCacheLeitura + evento.tokensCacheLeitura,
					tokensCacheEscrita: uso.tokensCacheEscrita + evento.tokensCacheEscrita,
					tokensTotal: uso.tokensTotal + evento.tokensTotal,
					custo: uso.custo + evento.custo,
					respostas: uso.respostas + 1,
				},
			};
		}

		case "fila":
			return { ...estado, fila: evento.mensagens };

		case "erro":
			return comErro(estado, evento.origem, evento.mensagem);

		case "diagnostico": {
			const diagnostico: Diagnostico = { nivel: evento.nivel, mensagem: evento.mensagem };
			if (estado.diagnosticos.some((existente) => mesmoDiagnostico(existente, diagnostico))) return estado;
			return { ...estado, diagnosticos: [...estado.diagnosticos, diagnostico] };
		}

		case "estado_sessao":
			return comSessao(estado, evento.estado);

		case "acao_interface": {
			const [nova, contador] = chave(estado, "i");
			const anteriores = estado.acoesPorPainel[evento.painel] ?? [];
			const acoes = [...anteriores, { chave: nova, acao: evento.acao, dados: evento.dados }].slice(-LIMITE_ACOES_POR_PAINEL);
			return { ...estado, acoesPorPainel: { ...estado.acoesPorPainel, [evento.painel]: acoes }, contador };
		}

		case "pedido_interface": {
			const pedido: PedidoPendente = { id: evento.id, painel: evento.painel, acao: evento.acao, dados: evento.dados };
			const contador = estado.contador + 1;
			return {
				...estado,
				contador,
				pedidos: [...estado.pedidos.filter((existente) => existente.id !== evento.id), pedido],
				registrosPedidos: { ...estado.registrosPedidos, [evento.id]: { ...pedido, estado: "pendente", ordem: contador } },
			};
		}

		case "pedido_interface_cancelado": {
			const registro = estado.registrosPedidos[evento.id];
			return {
				...estado,
				pedidos: estado.pedidos.filter((pedido) => pedido.id !== evento.id),
				cancelados: { ...estado.cancelados, [evento.id]: evento.motivo },
				...(registro?.estado === "pendente"
					? { registrosPedidos: { ...estado.registrosPedidos, [evento.id]: { ...registro, estado: "cancelado", motivo: evento.motivo } } }
					: {}),
			};
		}
	}
}

/**
 * Pedidos, painéis e cancelamentos a partir do que a ponte gravou na sessão
 * (o histórico): é assim que os botões dos pedidos e as revisões continuam
 * iguais depois de recarregar a página ou de o servidor reiniciar. Um pedido
 * sem fim que não espera mais ao vivo (o servidor reiniciou) fica cancelado.
 */
export function estadoDaPonte(
	ponte: HistoricoPonte,
	contadorInicial: number,
): Pick<EstadoJanela, "registrosPedidos" | "pedidos" | "acoesPorPainel" | "cancelados" | "contador" | "sessaoDosPedidos"> {
	let contador = contadorInicial;
	const registrosPedidos: Record<string, RegistroPedido> = {};
	const acoesPorPainel: Record<string, AcaoRecebida[]> = {};
	const cancelados: Record<string, MotivoCancelamento> = {};
	for (const registro of ponte.registros) {
		if (registro.tipo === "pedido") {
			const { id, painel, acao, dados } = registro;
			registrosPedidos[id] = { id, painel, acao, dados, estado: "pendente", ordem: ++contador };
		} else if (registro.tipo === "fim") {
			const pedido = registrosPedidos[registro.id];
			if (!pedido) continue;
			if (registro.estado === "respondido") {
				registrosPedidos[registro.id] = { ...pedido, estado: "respondido", ...(registro.resposta === undefined ? {} : { resposta: registro.resposta }) };
			} else {
				registrosPedidos[registro.id] = { ...pedido, estado: "cancelado", motivo: registro.motivo };
				cancelados[registro.id] = registro.motivo;
			}
		} else {
			const lista = acoesPorPainel[registro.painel] ?? [];
			lista.push({ chave: `hm${++contador}`, acao: registro.acao, dados: registro.dados });
			acoesPorPainel[registro.painel] = lista.slice(-LIMITE_ACOES_POR_PAINEL);
		}
	}
	const vivos = new Set(ponte.pendentes);
	const pedidos: PedidoPendente[] = [];
	for (const pedido of Object.values(registrosPedidos)) {
		if (pedido.estado !== "pendente") continue;
		if (vivos.has(pedido.id)) {
			pedidos.push({ id: pedido.id, painel: pedido.painel, acao: pedido.acao, dados: pedido.dados });
		} else {
			registrosPedidos[pedido.id] = { ...pedido, estado: "cancelado", motivo: "sessao_encerrada" };
			cancelados[pedido.id] = "sessao_encerrada";
		}
	}
	return { registrosPedidos, pedidos, acoesPorPainel, cancelados, contador, sessaoDosPedidos: ponte.sessaoId };
}

/** O reducer da janela de perfil. Ignora mensagens de outros perfis. */
export function reduzirJanela(estado: EstadoJanela, acao: AcaoJanela): EstadoJanela {
	switch (acao.tipo) {
		case "evento":
			return acao.perfil === estado.perfil ? aplicarEvento(estado, acao.evento) : estado;

		case "historico": {
			if (acao.perfil !== estado.perfil) return estado;
			const { conversa, contador } = conversaDoHistorico(acao.itens, estado.contador);
			const reconstruido = acao.ponte ? estadoDaPonte(acao.ponte, contador) : undefined;
			return {
				...estado,
				conversa,
				contador,
				...(reconstruido ?? {}),
				pronto: true,
				carregando: undefined,
			};
		}

		case "carregando":
			return acao.perfil === estado.perfil ? { ...estado, carregando: acao.mensagem } : estado;

		case "perfil_recarregado": {
			if (acao.perfil !== estado.perfil) return estado;
			const [nova, contador] = chave(estado, "r");
			return {
				...estado,
				contador,
				recarregado: { chave: nova, motivo: acao.motivo, ...(acao.arquivos ? { arquivos: acao.arquivos } : {}) },
			};
		}

		case "resposta": {
			if (!acao.ok) {
				// Abrir o perfil falhou: sai da tela de carregamento para mostrar o erro.
				const semCarregar = acao.pedido === "abrir_perfil" ? { ...estado, carregando: undefined } : estado;
				return comErro(semCarregar, "pedido", `${acao.pedido}: ${acao.erro}`);
			}
			if (respostasComEstado.has(acao.pedido) && acao.dados) {
				return comSessao(estado, acao.dados as DadosResposta["abrir_perfil"]);
			}
			return estado;
		}

		case "erro":
			return comErro(estado, "servidor", acao.mensagem);

		case "pong":
			return estado;

		case "local:conexao_caiu":
			return aplicarEvento({ ...estado, fila: [] }, { tipo: "execucao_fim", abortada: true });

		case "local:pedido_respondido": {
			const pedidos = estado.pedidos.filter((pedido) => pedido.id !== acao.id);
			// Só um pendente vira respondido: se o núcleo já o cancelou (o evento
			// chega antes da resposta do pedido), ele continua cancelado.
			const registro = estado.registrosPedidos[acao.id];
			if (registro?.estado !== "pendente") return { ...estado, pedidos };
			const respondido: RegistroPedido = { ...registro, estado: "respondido", ...(acao.dados === undefined ? {} : { resposta: acao.dados }) };
			return { ...estado, pedidos, registrosPedidos: { ...estado.registrosPedidos, [acao.id]: respondido } };
		}

		case "local:limpar_erros":
			return { ...estado, erros: [] };

		case "local:fechar_aviso_recarregado":
			return { ...estado, recarregado: undefined };
	}
}
