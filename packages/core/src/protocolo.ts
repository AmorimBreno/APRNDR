// Protocolo do WebSocket entre o front e o servidor. É genérico como o resto
// do núcleo: perfil, sessão, agente, modelo e a ponte de interface (painel,
// ação e dados), sem nada de um perfil específico.
//
// Este arquivo é importado pelo front (navegador) pelo subcaminho
// "@estudos/core/protocolo". Por isso ele só pode importar o zod e tipos com
// `import type` (que somem na compilação): o index do núcleo puxa o SDK do pi,
// que só roda no Node.
//
// Fluxo: toda mensagem do cliente (menos ping) recebe uma "resposta" com o
// mesmo pedidoId, se ele veio. Os eventos da janela do perfil chegam como
// "evento" para todas as conexões que abriram aquele perfil.

import { z } from "zod";
import type { EstadoSessao, EventoNucleo, ItemHistorico } from "./eventos.ts";
import type { InfoModelo } from "./modelos.ts";
import type { RegistroPonte } from "./ponte.ts";
import type { ResumoSessao } from "./sessoes.ts";

export type { RegistroPonte } from "./ponte.ts";

/** Os registros da ponte de uma sessão e os pedidos que ainda esperam ao vivo. */
export interface HistoricoPonte {
	/** A sessão dos registros (a interface só os aplica na sessão certa). */
	sessaoId: string;
	registros: RegistroPonte[];
	pendentes: string[];
}

// Formato do pedido e da resposta do painel "pergunta" (ask_user_question).
export type { DadosPedidoPergunta, ModoPergunta, OpcaoPergunta, RespostaPergunta } from "./pergunta.ts";

const texto = z.string().min(1);
/** Correlaciona a mensagem com a "resposta" do servidor. */
const pedidoId = z.string().min(1).optional();

const comPerfil = { pedidoId, perfil: texto };

export const esquemaMensagemCliente = z.discriminatedUnion("tipo", [
	z.strictObject({ tipo: z.literal("ping"), pedidoId }),
	/** Abre a janela do perfil (ou entra na que já está aberta). Com sessaoId, continua essa sessão. */
	z.strictObject({ tipo: z.literal("abrir_perfil"), ...comPerfil, sessaoId: texto.optional(), agente: texto.optional() }),
	z.strictObject({ tipo: z.literal("enviar"), ...comPerfil, texto }),
	z.strictObject({ tipo: z.literal("abortar"), ...comPerfil }),
	/** modelo no formato provedor/id. */
	z.strictObject({ tipo: z.literal("trocar_modelo"), ...comPerfil, modelo: texto }),
	z.strictObject({ tipo: z.literal("trocar_agente"), ...comPerfil, agente: texto }),
	z.strictObject({ tipo: z.literal("nova_sessao"), ...comPerfil, agente: texto.optional() }),
	z.strictObject({ tipo: z.literal("abrir_sessao"), ...comPerfil, sessaoId: texto }),
	z.strictObject({ tipo: z.literal("listar_sessoes"), ...comPerfil }),
	z.strictObject({ tipo: z.literal("listar_modelos"), ...comPerfil }),
	z.strictObject({ tipo: z.literal("recarregar_perfil"), ...comPerfil }),
	/** Resposta do usuário a um "pedido_interface" (ponte de eventos). */
	z.strictObject({ tipo: z.literal("responder_pedido"), ...comPerfil, id: texto, dados: z.unknown().optional() }),
	/** O usuário cancelou um "pedido_interface": a ferramenta recebe o cancelamento com motivo "usuario". */
	z.strictObject({ tipo: z.literal("cancelar_pedido"), ...comPerfil, id: texto }),
	/** Ação feita num painel; vira "interface:acao" na sessão. */
	z.strictObject({ tipo: z.literal("acao_interface"), ...comPerfil, painel: texto, acao: texto, dados: z.unknown().optional() }),
]);

export type MensagemCliente = z.infer<typeof esquemaMensagemCliente>;
export type TipoMensagemCliente = MensagemCliente["tipo"];

/** O que vem em `dados` na resposta bem-sucedida de cada pedido. */
export interface DadosResposta {
	ping: undefined;
	abrir_perfil: EstadoSessao;
	enviar: "iniciada" | "enfileirada";
	/** Mensagens que estavam na fila, para devolver ao campo de texto. */
	abortar: string[];
	trocar_modelo: EstadoSessao;
	trocar_agente: EstadoSessao;
	nova_sessao: EstadoSessao;
	abrir_sessao: EstadoSessao;
	listar_sessoes: ResumoSessao[];
	listar_modelos: InfoModelo[];
	recarregar_perfil: EstadoSessao;
	/** false = o pedido não espera mais resposta (já respondido ou cancelado). */
	responder_pedido: boolean;
	/** false = o pedido não espera mais resposta (já respondido ou cancelado). */
	cancelar_pedido: boolean;
	acao_interface: undefined;
}

export type MensagemServidor =
	| { tipo: "pong"; pedidoId?: string }
	/** Resultado de um pedido do cliente. `pedido` é o tipo da mensagem que gerou a resposta. */
	| { tipo: "resposta"; pedidoId?: string; pedido: TipoMensagemCliente; ok: true; dados?: unknown }
	| { tipo: "resposta"; pedidoId?: string; pedido: TipoMensagemCliente; ok: false; erro: string }
	/** Evento da janela do perfil, para todas as conexões que abriram o perfil. */
	| { tipo: "evento"; perfil: string; evento: EventoNucleo }
	/** Conversa inteira da sessão aberta: depois de abrir o perfil, abrir ou criar sessão, trocar de agente e recarregar. */
	/** A conversa da sessão aberta e, à parte, o que a ponte gravou (pedidos, fins, ações mostradas). */
	| { tipo: "historico"; perfil: string; itens: ItemHistorico[]; ponte?: HistoricoPonte }
	/** A sessão do perfil está sendo montada (a tela de carregamento usa isto). */
	| { tipo: "carregando"; perfil: string; mensagem: string }
	/** A sessão foi remontada: por mudança de arquivo (watcher) ou por pedido do usuário. */
	| { tipo: "perfil_recarregado"; perfil: string; motivo: "arquivo" | "pedido"; arquivos?: string[] }
	/** Erro que não pertence a um pedido (por exemplo, JSON inválido). */
	| { tipo: "erro"; mensagem: string };

export type ResultadoValidacao =
	| { ok: true; mensagem: MensagemCliente }
	| { ok: false; erro: string; pedidoId?: string; pedido?: TipoMensagemCliente };

const tiposCliente = new Set<string>(esquemaMensagemCliente.options.map((opcao) => opcao.shape.tipo.value));

/**
 * Valida uma mensagem já tirada do JSON. Quando ela é inválida mas tem um
 * pedidoId e um tipo conhecido, eles voltam junto, para responder ao pedido.
 */
export function validarMensagemCliente(dados: unknown): ResultadoValidacao {
	const resultado = esquemaMensagemCliente.safeParse(dados);
	if (resultado.success) return { ok: true, mensagem: resultado.data };
	const erro = resultado.error.issues
		.map((problema) => `${problema.path.length ? `campo ${problema.path.join(".")}: ` : ""}${problema.message}`)
		.join("; ");
	const bruto = typeof dados === "object" && dados !== null ? (dados as Record<string, unknown>) : {};
	return {
		ok: false,
		erro: `Mensagem inválida: ${erro}`,
		...(typeof bruto.pedidoId === "string" && bruto.pedidoId ? { pedidoId: bruto.pedidoId } : {}),
		...(typeof bruto.tipo === "string" && tiposCliente.has(bruto.tipo) ? { pedido: bruto.tipo as TipoMensagemCliente } : {}),
	};
}
