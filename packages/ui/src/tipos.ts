// Tipos do núcleo usados no front, tirados do protocolo. O subcaminho
// "@estudos/core/protocolo" é o único que o front pode importar (o index do
// núcleo puxa o SDK do pi); os tipos de eventos.ts, modelos.ts e sessoes.ts
// não são exportados por ele, então são derivados das mensagens aqui.

import type { DadosResposta, MensagemServidor } from "@estudos/core/protocolo";

export type {
	DadosPedidoPergunta,
	ContextoSessao,
	DadosResposta,
	EstadoMaterial,
	HistoricoPonte,
	MensagemCliente,
	MensagemServidor,
	ModoPergunta,
	OpcaoPergunta,
	RegistroPonte,
	RespostaPergunta,
	SituacaoMaterial,
	TipoMensagemCliente,
} from "@estudos/core/protocolo";

export type EventoNucleo = Extract<MensagemServidor, { tipo: "evento" }>["evento"];
export type ItemHistorico = Extract<MensagemServidor, { tipo: "historico" }>["itens"][number];
export type EstadoSessao = DadosResposta["abrir_perfil"];
export type Diagnostico = EstadoSessao["diagnosticos"][number];
export type MotivoCancelamento = Extract<EventoNucleo, { tipo: "pedido_interface_cancelado" }>["motivo"];
export type InfoModelo = DadosResposta["listar_modelos"][number];
export type ResumoSessao = DadosResposta["listar_sessoes"][number];
