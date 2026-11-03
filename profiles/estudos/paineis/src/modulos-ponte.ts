// O painel "modulos" da ponte, que a extensão de módulos
// (extensions/modulos.ts, docs/modulos.md, "Ponte") atende, e a leitura do
// que ela mandou. A visão do curso (TelaCurso.tsx) usa o hook.
//
// Sem mudança otimista, como cursos-ponte: gerar, aguardar e concluir levam
// um pedido e devolvem uma promessa, resolvida quando chega o "estado" com
// aquele pedido (a geração começou, o módulo passou a aguardar ou foi
// concluído) e rejeitada quando chega um "erro" com ele. Cancelar não tem
// pedido na ponte: a promessa resolve
// quando a ação sai, e o estado novo diz que a geração parou.
//
// A visão do módulo gerado (TelaModulo.tsx, parte B) usa useModuloAberto:
// manda "abrir" e lê o "modulo" (ou o "erro" do abrir) que voltou; e o
// concluir do useModulos.
//
// O retorno por bloco e a reescrita (docs/escrita.md, "Ponte"): retorno e
// reescrever_bloco levam um pedido; a promessa resolve com a primeira
// resposta com ele que não é um "erro" (a ponte não fixa o nome dela; do
// retorno, a tela lê o id do evento avaliou_bloco, idDoRetorno). Enquanto o
// bloco é reescrito, o estado do módulo traz reescrevendo; no fim, chega o
// "modulo" novo (useModuloAberto). Um "erro" do reescrever_bloco que chega
// depois de começar fica no bloco (errosDaReescrita).
//
// As questões do módulo (docs/modulos.md, "Responder as questões"):
// responder, corrigir e encerrar levam um pedido, como o retorno; a promessa
// resolve com a primeira resposta com ele que não é um "erro" (o "modulo" com
// a resposta) e rejeita com o "erro" dele. Toda mensagem "modulo" traz o
// corrigindo (os blocos em conferência agora), que o useModuloAberto guarda.
// Uma conferência que falha manda um "erro" com ao "corrigir" e o bloco, que
// fica na questão (errosDasQuestoes) até a conferência recomeçar.
//
// O feedback (docs/modulos.md, "O feedback"): avaliar_bloco (a nota rápida) e
// avaliar_licao (o questionário do fim da lição) levam um pedido, como o
// responder, e respondem com o "modulo" com o pedido. O "erro" do
// avaliar_bloco traz o bloco e fica nele (errosDoFeedback) até uma nota
// pedida depois para o mesmo bloco dar certo.

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AcoesModulosEscrita } from "../../lib/escrita-tipos.ts";
import type { AvaliacaoNova, NotasLicao } from "../../lib/modulo-feedback-tipos.ts";
import type { EntradaResponder } from "../../lib/modulo-respostas-tipos.ts";
import { type AcoesModulos, type MensagemErroModulos, type MensagemEstadoModulos, type MensagemModulo, PAINEL_MODULOS } from "../../lib/modulo-tipos.ts";
import { EsperaDePedidos, respostaQualquer } from "./escrita-ponte.ts";
import { chaveDoBloco, type DadosDoRetorno } from "./escrita-tela.ts";
import type { LidoModuloAberto } from "./modulo-tela.ts";
import type { ExplicacaoPedida, TipoExplicacao } from "../../lib/termos-tipos.ts";
import { type CamposPedido, estaGerando } from "./modulos-tela.ts";

export { PAINEL_MODULOS };

/** Um erro que a extensão mandou, como a tela o guarda: a chave da ação recebida identifica este erro. */
export interface ErroVistoModulo {
	chave: string;
	mensagem: string;
	/** A ação que falhou. */
	ao?: string;
}

/** O que a extensão mandou sobre os módulos de um curso. */
export interface LidoModulos {
	/** O último estado do curso. */
	estado?: MensagemEstadoModulos;
	/** O erro da última listagem (ou um erro sem módulo), se ele veio depois do estado. */
	erroLista?: ErroVistoModulo;
	/**
	 * Os erros sem pedido de cada módulo (parar a geração que falhou), até um
	 * estado dizer que aquele módulo não está mais sendo gerado.
	 */
	errosModulo: Record<string, ErroVistoModulo>;
}

const doCurso = (dados: { materia?: string; curso?: string } | undefined, materia: string, curso: string) =>
	!!dados && (dados.materia === undefined || dados.materia === materia) && (dados.curso === undefined || dados.curso === curso);

/**
 * As ações cujos erros são da visão do módulo (lerModuloAberto, errosDaReescrita,
 * errosDasQuestoes) ou do modal dos ajustes (ajustes-ponte.ts),
 * não do card.
 */
const AO_DA_VISAO = new Set([
	"abrir",
	"retorno",
	"reescrever_bloco",
	"responder",
	"corrigir",
	"encerrar",
	"avaliar_bloco",
	"avaliar_licao",
	"marcar_termos",
	"explicar_trecho",
	"guardar_termo",
	"gerar_relatorio",
	"listar_ajustes",
]);

/**
 * Lê, em ordem, o que chegou ao painel "modulos" para o curso. Um erro sem
 * matéria ou sem curso também conta (só esta tela ouve o painel). Os erros
 * com pedido são a resposta de gerar, aguardar ou concluir: quem mostra é quem pediu,
 * pela promessa.
 */
export function lerModulos(recebidas: readonly AcaoRecebida[], materia: string, curso: string): LidoModulos {
	let estado: MensagemEstadoModulos | undefined;
	let erroLista: ErroVistoModulo | undefined;
	const errosModulo: Record<string, ErroVistoModulo> = {};
	for (const recebida of recebidas) {
		if (recebida.acao === "estado") {
			const dados = recebida.dados as MensagemEstadoModulos | undefined;
			if (!dados || dados.materia !== materia || dados.curso !== curso || !Array.isArray(dados.modulos)) continue;
			estado = dados;
			erroLista = undefined;
			for (const id of Object.keys(errosModulo)) {
				const modulo = dados.modulos.find((item) => item.id === id);
				if (!modulo || !estaGerando(modulo.situacao)) delete errosModulo[id];
			}
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			// Os erros do abrir, do retorno, da reescrita e das questões são da visão do módulo, não do card.
			if (!dados || !doCurso(dados, materia, curso) || dados.pedido || (dados.ao !== undefined && AO_DA_VISAO.has(dados.ao))) continue;
			const erro: ErroVistoModulo = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido.", ...(dados.ao ? { ao: dados.ao } : {}) };
			if (dados.modulo && dados.ao !== "listar") errosModulo[dados.modulo] = erro;
			else erroLista = erro;
		}
	}
	return { ...(estado ? { estado } : {}), ...(erroLista ? { erroLista } : {}), errosModulo };
}

// --- O módulo aberto (parte B) ----------------------------------------------

/** Os ids de blocos do corrigindo de uma mensagem "modulo" (só os textos; ausente ou fora do formato, vazio). */
const blocosCorrigindo = (corrigindo: unknown): string[] =>
	Array.isArray(corrigindo) ? corrigindo.filter((bloco): bloco is string => typeof bloco === "string" && bloco !== "") : [];

/**
 * Lê, em ordem, a resposta ao "abrir" do módulo: o último "modulo" daquele
 * módulo do curso (com o corrigindo dele), ou o último "erro" do abrir dele
 * (o que veio por último vale). Nada ainda, vazio.
 */
export function lerModuloAberto(recebidas: readonly AcaoRecebida[], materia: string, curso: string, modulo: string): LidoModuloAberto {
	let lido: LidoModuloAberto = {};
	const vistos = new Map<string, ExplicacaoPedida>();
	const falhas = new Map<string, ExplicacaoPedida>();
	let geradoEm: string | undefined;
	for (const recebida of recebidas) {
		if (recebida.acao === "modulo") {
			const dados = recebida.dados as MensagemModulo | undefined;
			if (!dados || dados.materia !== materia || dados.curso !== curso || dados.modulo?.id !== modulo || !Array.isArray(dados.modulo.licoes)) continue;
			const geracao = dados.modulo.situacao === "gerado" ? dados.modulo.geradoEm : undefined;
			if (geradoEm !== geracao) { vistos.clear(); falhas.clear(); }
			geradoEm = geracao;
			if (dados.modulo.situacao === "gerado") for (const explicacao of dados.modulo.explicacoes ?? []) vistos.set(explicacao.id, explicacao);
			lido = {
				modulo: dados.modulo,
				corrigindo: blocosCorrigindo(dados.corrigindo),
				glossario: dados.glossario ?? [],
				explicando: dados.explicando ?? [],
				// O relatório vem em toda mensagem modulo (docs/metodo-ciclo.md, "Ponte"); só entra o que há.
				...(dados.relatorio && typeof dados.relatorio === "object" ? { relatorio: dados.relatorio } : {}),
				...(dados.relatorioGerando === true ? { relatorioGerando: true } : {}),
				...(typeof dados.relatorioErro === "string" && dados.relatorioErro ? { relatorioErro: dados.relatorioErro } : {}),
			};
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			if (!dados || dados.modulo !== modulo || !doCurso(dados, materia, curso)) continue;
			if (dados.ao === "explicar_trecho" && dados.explicacao) {
				const visto = vistos.get(dados.explicacao);
				if (visto) falhas.set(visto.id, visto);
			}
			if (dados.ao === "abrir") lido = { erro: dados.mensagem || "Erro desconhecido." };
		}
	}
	return { ...lido, ...(lido.modulo ? { explicacoesFalhas: [...falhas.values()] } : {}) };
}

/** Erros dos termos por id de explicação; a marcação usa a chave "marcar_termos". */
export function errosDosTermos(recebidas: readonly AcaoRecebida[], alvo: { materia: string; curso: string; modulo: string }): Record<string, string> {
	const erros: Record<string, string> = {};
	for (const recebida of recebidas) {
		const dados = recebida.dados as MensagemErroModulos | undefined;
		if (!dados || !doCurso(dados, alvo.materia, alvo.curso)) continue;
		if (recebida.acao === "erro" && dados.modulo === alvo.modulo && ["marcar_termos", "explicar_trecho", "guardar_termo"].includes(dados.ao ?? "")) {
			erros[dados.explicacao ?? dados.bloco ?? "marcar_termos"] = dados.mensagem;
		}
		if (recebida.acao === "modulo" && (recebida.dados as MensagemModulo).modulo?.id === alvo.modulo) {
			const mensagem = recebida.dados as MensagemModulo;
			for (const item of mensagem.modulo.situacao === "gerado" ? mensagem.modulo.explicacoes ?? [] : []) {
				if (item.guardado || mensagem.explicando?.includes(item.id)) delete erros[item.id];
			}
		}
		if (recebida.acao === "estado" && (recebida.dados as MensagemEstadoModulos).modulos?.some((m) => m.id === alvo.modulo && m.marcando)) delete erros.marcar_termos;
	}
	return erros;
}

/**
 * O módulo gerado aberto: manda "abrir" ao montar, quando a sessão muda, quando
 * o módulo muda e em `abrirDeNovo`. Trocar de sessão zera as ações da ponte;
 * até a nova resposta chegar, vale a última do mesmo módulo.
 */
export function useModuloAberto(janela: JanelaPerfilHook, materia: string, curso: string, modulo: string): LidoModuloAberto & { abrirDeNovo(): void } {
	const { estado: estadoJanela, acoes } = janela;
	const sessaoId = estadoJanela.sessao?.sessaoId;
	const abrir = useCallback(() => {
		semEsperar(acoes.acaoDaInterface(PAINEL_MODULOS, "abrir", { materia, curso, modulo } satisfies AcoesModulos["abrir"]));
	}, [acoes, materia, curso, modulo]);
	useEffect(() => {
		if (sessaoId) abrir();
	}, [sessaoId, abrir]);
	const recebidas = estadoJanela.acoesPorPainel[PAINEL_MODULOS];
	const lido = useMemo(() => lerModuloAberto(recebidas ?? [], materia, curso, modulo), [recebidas, materia, curso, modulo]);
	const ultimo = useRef<{ chave: string; lido: LidoModuloAberto } | undefined>(undefined);
	const chave = `${materia}/${curso}/${modulo}`;
	if (lido.modulo || lido.erro !== undefined) ultimo.current = { chave, lido };
	const valendo = lido.modulo || lido.erro !== undefined ? lido : ultimo.current?.chave === chave ? ultimo.current.lido : {};
	return { ...valendo, abrirDeNovo: abrir };
}

// --- O retorno por bloco e a reescrita (docs/escrita.md) ----------------------

/**
 * O id do evento avaliou_bloco na resposta ao "retorno": o campo retorno (como
 * o registrarRetorno devolve), ou evento (o id, ou um objeto com id). Sem
 * nenhum, undefined.
 */
export function idDoRetorno(dados: Record<string, unknown> | undefined): string | undefined {
	if (!dados) return undefined;
	if (typeof dados.retorno === "string" && dados.retorno) return dados.retorno;
	const evento = dados.evento;
	if (typeof evento === "string" && evento) return evento;
	if (typeof evento === "object" && evento !== null && typeof (evento as { id?: unknown }).id === "string") return (evento as { id: string }).id;
	return undefined;
}

/** O bloco sendo reescrito no módulo, pelo último estado do curso; nenhum, undefined. */
export function reescrevendoNoModulo(estado: Pick<MensagemEstadoModulos, "modulos"> | undefined, modulo: string): { licao: string; bloco: string } | undefined {
	const reescrevendo = estado?.modulos.find((item) => item.id === modulo)?.reescrevendo;
	return reescrevendo && typeof reescrevendo.licao === "string" && typeof reescrevendo.bloco === "string" ? reescrevendo : undefined;
}

/**
 * Os erros da reescrita de cada bloco do módulo (pela chave lição/bloco), lidos
 * em ordem: um "erro" com o pedido de um reescrever_bloco desta tela
 * (`pedidos`: pedido → chave do bloco) ou, sem pedido, com ao
 * reescrever_bloco daquele módulo (o bloco que ele diz, ou o último pedido,
 * `ultimo`). Um estado que mostra aquele bloco sendo reescrito de novo apaga
 * o erro dele.
 */
export function errosDaReescrita(
	recebidas: readonly AcaoRecebida[],
	alvo: { materia: string; curso: string; modulo: string },
	pedidos: Readonly<Record<string, string>>,
	ultimo?: string,
): Record<string, ErroVistoModulo> {
	const erros: Record<string, ErroVistoModulo> = {};
	for (const recebida of recebidas) {
		if (recebida.acao === "estado") {
			const dados = recebida.dados as MensagemEstadoModulos | undefined;
			if (!dados || dados.materia !== alvo.materia || dados.curso !== alvo.curso || !Array.isArray(dados.modulos)) continue;
			const reescrevendo = reescrevendoNoModulo(dados, alvo.modulo);
			if (reescrevendo) delete erros[chaveDoBloco(reescrevendo.licao, reescrevendo.bloco)];
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as (MensagemErroModulos & { licao?: unknown; bloco?: unknown }) | undefined;
			if (!dados) continue;
			let chave: string | undefined;
			if (dados.pedido) chave = pedidos[dados.pedido];
			else if (dados.ao === "reescrever_bloco" && doCurso(dados, alvo.materia, alvo.curso) && (dados.modulo === undefined || dados.modulo === alvo.modulo)) {
				chave = typeof dados.licao === "string" && typeof dados.bloco === "string" ? chaveDoBloco(dados.licao, dados.bloco) : ultimo;
			}
			if (chave) erros[chave] = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido.", ...(dados.ao ? { ao: dados.ao } : {}) };
		}
	}
	return erros;
}

// --- As questões (docs/modulos.md, "Responder as questões") --------------------

/**
 * Os erros da conferência de cada questão do módulo (pelo id do bloco), lidos
 * em ordem: um "erro" com ao "corrigir" e o bloco, daquele módulo (com ou sem
 * pedido). Um "modulo" posterior com o bloco no corrigindo (a conferência
 * recomeçou) apaga o erro dele. Quem mostra confere se a questão ainda espera
 * a conferência (situacaoDaQuestao.aConferir).
 */
export function errosDasQuestoes(recebidas: readonly AcaoRecebida[], alvo: { materia: string; curso: string; modulo: string }): Record<string, ErroVistoModulo> {
	const erros: Record<string, ErroVistoModulo> = {};
	for (const recebida of recebidas) {
		if (recebida.acao === "modulo") {
			const dados = recebida.dados as MensagemModulo | undefined;
			if (!dados || dados.materia !== alvo.materia || dados.curso !== alvo.curso || dados.modulo?.id !== alvo.modulo) continue;
			for (const bloco of blocosCorrigindo(dados.corrigindo)) delete erros[bloco];
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			if (!dados || dados.ao !== "corrigir" || typeof dados.bloco !== "string" || !dados.bloco || !doCurso(dados, alvo.materia, alvo.curso)) continue;
			if (dados.modulo !== undefined && dados.modulo !== alvo.modulo) continue;
			erros[dados.bloco] = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido.", ao: "corrigir" };
		}
	}
	return erros;
}

// --- O feedback (docs/modulos.md, "O feedback") -------------------------------

/**
 * Os erros da nota rápida de cada bloco do módulo (pelo id do bloco), lidos em
 * ordem: um "erro" com ao "avaliar_bloco" e o bloco, daquele módulo. Um
 * "modulo" posterior com o pedido de uma nota desta tela para o mesmo bloco
 * (`pedidos`: pedido → bloco) apaga o erro dele.
 */
export function errosDoFeedback(
	recebidas: readonly AcaoRecebida[],
	alvo: { materia: string; curso: string; modulo: string },
	pedidos: Readonly<Record<string, string>> = {},
): Record<string, ErroVistoModulo> {
	const erros: Record<string, ErroVistoModulo> = {};
	for (const recebida of recebidas) {
		if (recebida.acao === "modulo") {
			const dados = recebida.dados as MensagemModulo | undefined;
			if (!dados || dados.materia !== alvo.materia || dados.curso !== alvo.curso || dados.modulo?.id !== alvo.modulo || typeof dados.pedido !== "string") continue;
			const bloco = pedidos[dados.pedido];
			if (bloco) delete erros[bloco];
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			if (!dados || dados.ao !== "avaliar_bloco" || typeof dados.bloco !== "string" || !dados.bloco || !doCurso(dados, alvo.materia, alvo.curso)) continue;
			if (dados.modulo !== undefined && dados.modulo !== alvo.modulo) continue;
			erros[dados.bloco] = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido.", ao: "avaliar_bloco" };
		}
	}
	return erros;
}

// --- A espera pelo pedido ----------------------------------------------------

/** A resposta da extensão a gerar ou aguardar. */
export type RespostaModulos = { tipo: "estado"; dados: MensagemEstadoModulos } | { tipo: "erro"; dados: MensagemErroModulos };

/** A primeira resposta (estado ou erro) com o pedido, ou undefined se ainda não chegou. */
export function respostaModulos(recebidas: readonly AcaoRecebida[], pedido: string): RespostaModulos | undefined {
	for (const recebida of recebidas) {
		const dados = recebida.dados as { pedido?: unknown } | undefined;
		if (!dados || dados.pedido !== pedido) continue;
		if (recebida.acao === "estado") return { tipo: "estado", dados: recebida.dados as MensagemEstadoModulos };
		if (recebida.acao === "erro") return { tipo: "erro", dados: recebida.dados as MensagemErroModulos };
	}
	return undefined;
}

/** Um erro que a extensão mandou (ou de mandar a ação): a mensagem é a frase para a tela. */
export class ErroDosModulos extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroDosModulos";
	}
}

/**
 * Os pedidos esperando resposta: `esperar` devolve a promessa (resolvida com o
 * estado, rejeitada com um ErroDosModulos se a resposta é um erro);
 * `receber` confere as ações que chegaram; `cancelar` rejeita todas (a sessão
 * mudou: a extensão antiga não vai responder).
 */
export class EsperaDosModulos {
	private esperando = new Map<string, { resolver(estado: MensagemEstadoModulos): void; rejeitar(erro: Error): void }>();
	private ultimas: readonly AcaoRecebida[] = [];

	esperar(pedido: string): Promise<MensagemEstadoModulos> {
		return new Promise((resolver, rejeitar) => {
			this.esperando.set(pedido, { resolver, rejeitar });
			this.receber(this.ultimas);
		});
	}

	receber(recebidas: readonly AcaoRecebida[]): void {
		this.ultimas = recebidas;
		for (const [pedido, promessa] of [...this.esperando]) {
			const resposta = respostaModulos(recebidas, pedido);
			if (!resposta) continue;
			this.esperando.delete(pedido);
			if (resposta.tipo === "erro") promessa.rejeitar(new ErroDosModulos(resposta.dados.mensagem || "Erro desconhecido."));
			else promessa.resolver(resposta.dados);
		}
	}

	falhar(pedido: string, erro: Error): void {
		const promessa = this.esperando.get(pedido);
		if (!promessa) return;
		this.esperando.delete(pedido);
		promessa.rejeitar(erro);
	}

	cancelar(motivo: string): void {
		for (const [pedido] of [...this.esperando]) this.falhar(pedido, new ErroDosModulos(motivo));
	}

	get quantos(): number {
		return this.esperando.size;
	}
}

// --- O hook ------------------------------------------------------------------

export interface ModulosDoCurso {
	/** O último estado do curso; undefined até o primeiro chegar. */
	estado?: MensagemEstadoModulos;
	erroLista?: ErroVistoModulo;
	errosModulo: Record<string, ErroVistoModulo>;
	/** O que esta tela mandou na última geração de cada módulo (para "Tentar de novo" e "Gerar de novo"). */
	pedidos: Record<string, CamposPedido>;
	listar(): void;
	/** Começa a geração; resolve com o estado em que ela começou. */
	gerar(modulo: string, campos: CamposPedido): Promise<MensagemEstadoModulos>;
	/** Marca o módulo como aguardando material; resolve com o estado novo. */
	aguardar(modulo: string, nota?: string): Promise<MensagemEstadoModulos>;
	/** Conclui o módulo gerado; resolve com o estado novo (a recomendação já passou para o seguinte). */
	concluir(modulo: string): Promise<MensagemEstadoModulos>;
	/** Para a geração (o que estava gravado antes fica); resolve quando a ação sai. A reescrita de um bloco também para assim. */
	cancelar(modulo: string): Promise<void>;
	/** Grava o retorno de um bloco (e, com virarRegra, a regra); resolve com o id do evento avaliou_bloco, se a resposta trouxe. */
	retorno(modulo: string, licao: string, bloco: string, dados: DadosDoRetorno): Promise<{ retorno?: string }>;
	/** Começa a reescrita do bloco pedida pelo retorno; resolve com a primeira resposta (a reescrita começou). */
	reescreverBloco(modulo: string, licao: string, bloco: string, retorno: string): Promise<void>;
	/** Os erros da reescrita de cada bloco do módulo (pela chave lição/bloco). */
	errosReescrita(modulo: string): Record<string, ErroVistoModulo>;
	/** Responde uma questão (uma tentativa ou "Não sei"); resolve com o "modulo" com a resposta. */
	responder(modulo: string, bloco: string, entrada: EntradaResponder): Promise<void>;
	/** Tenta de novo a conferência que falhou; resolve quando a conferência chegou. */
	corrigir(modulo: string, bloco: string): Promise<void>;
	/** "Ver a resposta-modelo": encerra a dissertativa corrigida. */
	encerrar(modulo: string, bloco: string): Promise<void>;
	/** Os erros da conferência de cada questão do módulo (pelo id do bloco). */
	errosQuestoes(modulo: string): Record<string, ErroVistoModulo>;
	/** A nota rápida de um bloco (Ruim, Bom ou Ótimo); resolve com o "modulo" com a nota. */
	avaliarBloco(modulo: string, licao: string, bloco: string, avaliacao: AvaliacaoNova): Promise<void>;
	/** Os erros da nota rápida de cada bloco do módulo (pelo id do bloco). */
	errosFeedback(modulo: string): Record<string, ErroVistoModulo>;
	/** O questionário do fim da lição; resolve com o "modulo" com ele. */
	avaliarLicao(modulo: string, licao: string, questionario: { notas: NotasLicao; texto?: string }): Promise<void>;
	marcarTermos(modulo: string): Promise<void>;
	explicarTrecho(modulo: string, licao: string, bloco: string, trecho: string, tipo: TipoExplicacao): Promise<void>;
	guardarTermo(modulo: string, explicacao: string): Promise<void>;
	errosTermos(modulo: string): Record<string, string>;
	/** "Gerar o relatório do método", "Tentar de novo" e, com forcar, "Gerar mesmo assim"; resolve com o modulo com o pedido (o relatório pronto chega depois, num modulo sem pedido). */
	gerarRelatorio(modulo: string, forcar?: boolean): Promise<void>;
}

/** As ações com pedido cuja resposta não tem nome fixo na ponte (respostaQualquer). */
type AcoesComPedido = AcoesModulosEscrita &
	Pick<AcoesModulos, "responder" | "corrigir" | "encerrar" | "avaliar_bloco" | "avaliar_licao" | "marcar_termos" | "explicar_trecho" | "guardar_termo" | "gerar_relatorio">;

/**
 * Os módulos de um curso: pede "listar" ao montar, quando a sessão muda e
 * quando `vez` muda (o curso ficou pronto, os materiais prontos mudaram).
 * Trocar de sessão zera as ações da ponte; até o novo estado chegar, vale o
 * último.
 */
export function useModulos(janela: JanelaPerfilHook, materia: string, curso: string, vez?: string): ModulosDoCurso {
	const { estado: estadoJanela, acoes } = janela;
	const sessaoId = estadoJanela.sessao?.sessaoId;
	const listar = useCallback(() => {
		semEsperar(acoes.acaoDaInterface(PAINEL_MODULOS, "listar", { materia, curso } satisfies AcoesModulos["listar"]));
	}, [acoes, materia, curso]);
	useEffect(() => {
		if (sessaoId) listar();
	}, [sessaoId, listar, vez]);

	const recebidas = estadoJanela.acoesPorPainel[PAINEL_MODULOS];
	const lido = useMemo(() => lerModulos(recebidas ?? [], materia, curso), [recebidas, materia, curso]);
	const ultimo = useRef<MensagemEstadoModulos | undefined>(undefined);
	if (lido.estado) ultimo.current = lido.estado;
	const estado = lido.estado ?? (ultimo.current?.materia === materia && ultimo.current.curso === curso ? ultimo.current : undefined);

	const espera = useRef<EsperaDosModulos | undefined>(undefined);
	espera.current ??= new EsperaDosModulos();
	useEffect(() => {
		espera.current!.receber(recebidas ?? []);
	}, [recebidas]);
	// Outra sessão: o que foi para a extensão antiga não vai ter resposta.
	useEffect(() => () => espera.current!.cancelar("A conversa mudou antes da resposta. Tente de novo."), [sessaoId]);

	const mandar = useCallback(
		<Acao extends "gerar" | "aguardar" | "concluir">(acao: Acao, dados: AcoesModulos[Acao]): Promise<MensagemEstadoModulos> => {
			const promessa = espera.current!.esperar(dados.pedido);
			acoes.acaoDaInterface(PAINEL_MODULOS, acao, dados).catch((falha: unknown) => {
				espera.current!.falhar(dados.pedido, new ErroDosModulos(`Não consegui falar com a sessão: ${(falha as Error).message}`));
			});
			return promessa;
		},
		[acoes],
	);

	const [pedidos, setPedidos] = useState<Record<string, CamposPedido>>({});

	// O retorno, a reescrita e as questões: a resposta não tem nome fixo na ponte (respostaQualquer).
	const esperaRetorno = useRef<EsperaDePedidos<{ acao: string; dados: Record<string, unknown> }> | undefined>(undefined);
	esperaRetorno.current ??= new EsperaDePedidos(respostaQualquer, (mensagem) => new ErroDosModulos(mensagem));
	useEffect(() => {
		esperaRetorno.current!.receber(recebidas ?? []);
	}, [recebidas]);
	useEffect(() => () => esperaRetorno.current!.cancelar("A conversa mudou antes da resposta. Tente de novo."), [sessaoId]);
	const mandarComPedido = useCallback(
		<Acao extends keyof AcoesComPedido>(acao: Acao, dados: AcoesComPedido[Acao]) => {
			const promessa = esperaRetorno.current!.esperar(dados.pedido);
			acoes.acaoDaInterface(PAINEL_MODULOS, acao, dados).catch((falha: unknown) => {
				esperaRetorno.current!.falhar(dados.pedido, `Não consegui falar com a sessão: ${(falha as Error).message}`);
			});
			return promessa;
		},
		[acoes],
	);
	// Os pedidos de reescrita desta tela (pedido → módulo e chave do bloco) e o último de cada módulo.
	const [reescritas, setReescritas] = useState<{ pedidos: Record<string, { modulo: string; chave: string }>; ultimo: Record<string, string> }>({ pedidos: {}, ultimo: {} });
	// Os pedidos de nota rápida desta tela (pedido → módulo e bloco), para apagar o erro de um bloco quando uma nota nova dele dá certo.
	const [notas, setNotas] = useState<Record<string, { modulo: string; bloco: string }>>({});

	return {
		...(estado ? { estado } : {}),
		...(lido.erroLista ? { erroLista: lido.erroLista } : {}),
		errosModulo: lido.errosModulo,
		pedidos,
		listar,
		gerar: (modulo, campos) => {
			setPedidos((atuais) => ({ ...atuais, [modulo]: campos }));
			return mandar("gerar", { materia, curso, modulo, pedido: crypto.randomUUID(), ...campos });
		},
		aguardar: (modulo, nota) => {
			const limpa = nota?.trim();
			return mandar("aguardar", { materia, curso, modulo, pedido: crypto.randomUUID(), ...(limpa ? { nota: limpa } : {}) });
		},
		concluir: (modulo) => mandar("concluir", { materia, curso, modulo, pedido: crypto.randomUUID() }),
		retorno: async (modulo, licao, bloco, dados) => {
			const resposta = await mandarComPedido("retorno", { materia, curso, modulo, licao, bloco, pedido: crypto.randomUUID(), ...dados });
			const id = idDoRetorno(resposta.dados);
			return id ? { retorno: id } : {};
		},
		reescreverBloco: async (modulo, licao, bloco, retorno) => {
			const pedido = crypto.randomUUID();
			const chave = chaveDoBloco(licao, bloco);
			setReescritas((atuais) => ({ pedidos: { ...atuais.pedidos, [pedido]: { modulo, chave } }, ultimo: { ...atuais.ultimo, [modulo]: chave } }));
			await mandarComPedido("reescrever_bloco", { materia, curso, modulo, licao, bloco, pedido, retorno });
		},
		errosReescrita: (modulo) =>
			errosDaReescrita(
				recebidas ?? [],
				{ materia, curso, modulo },
				Object.fromEntries(Object.entries(reescritas.pedidos).filter(([, item]) => item.modulo === modulo).map(([pedido, item]) => [pedido, item.chave])),
				reescritas.ultimo[modulo],
			),
		responder: async (modulo, bloco, entrada) => {
			await mandarComPedido("responder", { materia, curso, modulo, bloco, pedido: crypto.randomUUID(), ...entrada });
		},
		corrigir: async (modulo, bloco) => {
			await mandarComPedido("corrigir", { materia, curso, modulo, bloco, pedido: crypto.randomUUID() });
		},
		encerrar: async (modulo, bloco) => {
			await mandarComPedido("encerrar", { materia, curso, modulo, bloco, pedido: crypto.randomUUID() });
		},
		errosQuestoes: (modulo) => errosDasQuestoes(recebidas ?? [], { materia, curso, modulo }),
		avaliarBloco: async (modulo, licao, bloco, avaliacao) => {
			const pedido = crypto.randomUUID();
			setNotas((atuais) => ({ ...atuais, [pedido]: { modulo, bloco } }));
			await mandarComPedido("avaliar_bloco", { materia, curso, modulo, licao, bloco, pedido, avaliacao });
		},
		errosFeedback: (modulo) =>
			errosDoFeedback(
				recebidas ?? [],
				{ materia, curso, modulo },
				Object.fromEntries(Object.entries(notas).filter(([, item]) => item.modulo === modulo).map(([pedido, item]) => [pedido, item.bloco])),
			),
		avaliarLicao: async (modulo, licao, questionario) => {
			await mandarComPedido("avaliar_licao", { materia, curso, modulo, licao, pedido: crypto.randomUUID(), ...questionario });
		},
		marcarTermos: async (modulo) => { await mandarComPedido("marcar_termos", { materia, curso, modulo, pedido: crypto.randomUUID() }); },
		explicarTrecho: async (modulo, licao, bloco, trecho, tipo) => { await mandarComPedido("explicar_trecho", { materia, curso, modulo, licao, bloco, trecho, tipo, pedido: crypto.randomUUID() }); },
		guardarTermo: async (modulo, explicacao) => { await mandarComPedido("guardar_termo", { materia, curso, modulo, explicacao, pedido: crypto.randomUUID() }); },
		errosTermos: (modulo) => errosDosTermos(recebidas ?? [], { materia, curso, modulo }),
		gerarRelatorio: async (modulo, forcar) => {
			await mandarComPedido("gerar_relatorio", { materia, curso, modulo, pedido: crypto.randomUUID(), ...(forcar ? { forcar: true } : {}) });
		},
		cancelar: async (modulo) => {
			try {
				await acoes.acaoDaInterface(PAINEL_MODULOS, "cancelar", { materia, curso, modulo } satisfies AcoesModulos["cancelar"]);
			} catch (falha) {
				throw new ErroDosModulos(`Não consegui falar com a sessão: ${(falha as Error).message}`);
			}
		},
	};
}
