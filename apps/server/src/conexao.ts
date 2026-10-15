// Mensagens do WebSocket: valida com o esquema do protocolo e chama a janela
// do perfil. Toda mensagem (menos ping) recebe uma "resposta" com o pedidoId,
// com ok e dados, ou ok false e o erro.

import {
	type MensagemCliente,
	type MensagemServidor,
	type TipoMensagemCliente,
	validarMensagemCliente,
} from "@estudos/core/protocolo";
import type { Conexao, Janelas } from "./janelas.ts";
import type { Log } from "./log.ts";

function mensagemDe(erro: unknown): string {
	return erro instanceof Error ? erro.message : String(erro);
}

/**
 * Descrição da mensagem para o log: tipo, perfil e tamanhos. Nunca o texto
 * do usuário nem os dados dos painéis.
 */
export function resumirMensagem(mensagem: MensagemCliente): string {
	const partes: string[] = [mensagem.tipo];
	if ("perfil" in mensagem) partes.push(`perfil=${mensagem.perfil}`);
	switch (mensagem.tipo) {
		case "enviar":
			partes.push(`texto=${mensagem.texto.length} car.`);
			break;
		case "abrir_perfil":
			if (mensagem.sessaoId) partes.push(`sessao=${mensagem.sessaoId}`);
			if (mensagem.agente) partes.push(`agente=${mensagem.agente}`);
			break;
		case "abrir_sessao":
			partes.push(`sessao=${mensagem.sessaoId}`);
			break;
		case "trocar_modelo":
			partes.push(`modelo=${mensagem.modelo}`);
			break;
		case "trocar_agente":
			partes.push(`agente=${mensagem.agente}`);
			break;
		case "nova_sessao":
			if (mensagem.agente) partes.push(`agente=${mensagem.agente}`);
			break;
		case "responder_pedido":
			partes.push(`id=${mensagem.id}`);
			break;
		case "acao_interface":
			partes.push(`painel=${mensagem.painel}`, `acao=${mensagem.acao}`);
			break;
	}
	return partes.join(" ");
}

/** Executa o pedido e devolve os `dados` da resposta. */
async function executar(janelas: Janelas, conexao: Conexao, mensagem: MensagemCliente): Promise<unknown> {
	switch (mensagem.tipo) {
		case "ping":
			return undefined;
		case "abrir_perfil":
			return janelas.abrirPerfil(conexao, mensagem);
		case "enviar":
			return janelas.janela(mensagem.perfil).enviar(mensagem.texto);
		case "abortar":
			return janelas.janela(mensagem.perfil).abortar();
		case "trocar_modelo":
			return janelas.janela(mensagem.perfil).trocarModelo(mensagem.modelo);
		case "trocar_agente":
			return janelas.remontar(mensagem.perfil, `Trocando para o agente ${mensagem.agente}...`, (janela) =>
				janela.trocarAgente(mensagem.agente),
			);
		case "nova_sessao":
			return janelas.remontar(mensagem.perfil, "Criando uma sessão nova...", (janela) => janela.novaSessao(mensagem.agente));
		case "abrir_sessao":
			return janelas.remontar(mensagem.perfil, "Abrindo a sessão...", (janela) => janela.abrirSessao(mensagem.sessaoId));
		case "listar_sessoes":
			return janelas.sessoes(mensagem.perfil);
		case "listar_modelos":
			return janelas.modelos(mensagem.perfil);
		case "recarregar_perfil":
			return janelas.recarregar(mensagem.perfil, "pedido");
		case "responder_pedido":
			return janelas.janela(mensagem.perfil).responder(mensagem.id, mensagem.dados);
		case "acao_interface":
			janelas.janela(mensagem.perfil).acaoDaInterface(mensagem.painel, mensagem.acao, mensagem.dados);
			return undefined;
	}
}

/**
 * Trata uma mensagem crua (texto do WebSocket). Não lança: erros viram
 * "resposta" com ok false ou "erro".
 */
export async function tratarMensagem(janelas: Janelas, conexao: Conexao, bruto: string, log: Log): Promise<void> {
	let dados: unknown;
	try {
		dados = JSON.parse(bruto);
	} catch {
		log.aviso(`conexão ${conexao.id}: JSON inválido (${bruto.length} car.)`);
		conexao.enviar({ tipo: "erro", mensagem: "JSON inválido" });
		return;
	}

	const validacao = validarMensagemCliente(dados);
	if (!validacao.ok) {
		log.aviso(`conexão ${conexao.id}: ${validacao.erro}`);
		if (validacao.pedido) {
			conexao.enviar({
				tipo: "resposta",
				...(validacao.pedidoId ? { pedidoId: validacao.pedidoId } : {}),
				pedido: validacao.pedido,
				ok: false,
				erro: validacao.erro,
			});
		} else {
			conexao.enviar({ tipo: "erro", mensagem: validacao.erro });
		}
		return;
	}

	const mensagem = validacao.mensagem;
	const pedidoId = mensagem.pedidoId ? { pedidoId: mensagem.pedidoId } : {};
	if (mensagem.tipo === "ping") {
		conexao.enviar({ tipo: "pong", ...pedidoId });
		return;
	}
	log.info(`conexão ${conexao.id}: ${resumirMensagem(mensagem)}`);

	const pedido: TipoMensagemCliente = mensagem.tipo;
	let resposta: MensagemServidor;
	try {
		const resultado = await executar(janelas, conexao, mensagem);
		resposta = { tipo: "resposta", ...pedidoId, pedido, ok: true, ...(resultado === undefined ? {} : { dados: resultado }) };
	} catch (erro) {
		log.aviso(`conexão ${conexao.id}: ${pedido} falhou: ${mensagemDe(erro)}`);
		resposta = { tipo: "resposta", ...pedidoId, pedido, ok: false, erro: mensagemDe(erro) };
	}
	conexao.enviar(resposta);
}
