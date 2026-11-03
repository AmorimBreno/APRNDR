// Os ajustes do método na ponte (docs/metodo-ciclo.md, "Ponte"), que a
// extensão de módulos atende no painel "modulos": listar_ajustes e
// ligar_ajuste não levam matéria nem curso e respondem com a mensagem
// "ajustes" (os arquivos de metodologia com algum ajuste ou que não se
// leem). "Como o professor escreve" (ModalEscrita.tsx) usa o hook, na tela de
// cadernos e na visão do módulo.
//
// Sem mudança otimista, como as regras de escrita: ligar leva um pedido e
// devolve uma promessa, resolvida quando chega a mensagem "ajustes" com ele e
// rejeitada quando chega o "erro" dele. O "erro" do ligar_ajuste traz o
// arquivo e o ajuste, e fica nele (errosDosAjustes) até um ligar dele dar certo.

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArquivoDeAjustesNaTela } from "../../lib/metodo-ciclo-tipos.ts";
import { type AcoesModulos, type MensagemAjustes, type MensagemErroModulos, PAINEL_MODULOS } from "../../lib/modulo-tipos.ts";
import { EsperaDePedidos, respostaQualquer } from "./escrita-ponte.ts";

/** Um erro sem pedido que a extensão mandou (o do listar_ajustes): a chave da ação recebida identifica este erro. */
export interface ErroVistoAjustes {
	chave: string;
	mensagem: string;
}

/** O que a extensão mandou sobre os ajustes. */
export interface LidoAjustes {
	/** Os últimos arquivos que chegaram (de listar_ajustes ou ligar_ajuste: a lista é sempre a de todos). */
	arquivos?: ArquivoDeAjustesNaTela[];
	/** O erro do listar_ajustes que veio depois deles. */
	erro?: ErroVistoAjustes;
}

/** A chave de um ajuste nos erros: "<arquivo>/<id>". */
export const chaveDoAjuste = (arquivo: string, ajuste: string) => `${arquivo}/${ajuste}`;

const ehArquivoDeAjustes = (valor: unknown): valor is ArquivoDeAjustesNaTela =>
	typeof valor === "object" && valor !== null && typeof (valor as ArquivoDeAjustesNaTela).arquivo === "string" && Array.isArray((valor as ArquivoDeAjustesNaTela).ajustes);

/**
 * Lê, em ordem, o que chegou ao painel "modulos" sobre os ajustes: os últimos
 * "ajustes" (com ou sem pedido) e um "erro" do listar_ajustes que veio depois
 * deles. Os erros com pedido são de quem pediu (a promessa), e os do
 * ligar_ajuste ficam em errosDosAjustes.
 */
export function lerAjustes(recebidas: readonly AcaoRecebida[]): LidoAjustes {
	let arquivos: ArquivoDeAjustesNaTela[] | undefined;
	let erro: ErroVistoAjustes | undefined;
	for (const recebida of recebidas) {
		if (recebida.acao === "ajustes") {
			const dados = recebida.dados as MensagemAjustes | undefined;
			if (!dados || !Array.isArray(dados.arquivos)) continue;
			arquivos = dados.arquivos.filter(ehArquivoDeAjustes);
			erro = undefined;
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			if (!dados || dados.pedido || dados.ao !== "listar_ajustes") continue;
			erro = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido." };
		}
	}
	return { ...(arquivos ? { arquivos } : {}), ...(erro ? { erro } : {}) };
}

/**
 * Os erros do ligar_ajuste de cada ajuste (pela chave arquivo/id), lidos em
 * ordem: um "erro" com ao "ligar_ajuste", o arquivo e o ajuste. Uma mensagem
 * "ajustes" posterior com o pedido de um ligar desta tela (`pedidos`: pedido →
 * chave do ajuste) apaga o erro dele.
 */
export function errosDosAjustes(recebidas: readonly AcaoRecebida[], pedidos: Readonly<Record<string, string>> = {}): Record<string, string> {
	const erros: Record<string, string> = {};
	for (const recebida of recebidas) {
		if (recebida.acao === "ajustes") {
			const dados = recebida.dados as MensagemAjustes | undefined;
			const chave = dados && typeof dados.pedido === "string" ? pedidos[dados.pedido] : undefined;
			if (chave) delete erros[chave];
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			if (!dados || dados.ao !== "ligar_ajuste" || typeof dados.arquivo !== "string" || typeof dados.ajuste !== "string") continue;
			erros[chaveDoAjuste(dados.arquivo, dados.ajuste)] = dados.mensagem || "Erro desconhecido.";
		}
	}
	return erros;
}

/** Um erro que a extensão mandou (ou de mandar a ação): a mensagem é a frase para a tela. */
export class ErroDosAjustes extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroDosAjustes";
	}
}

export interface AjustesDoMetodo extends LidoAjustes {
	listar(): void;
	/** Liga ou desliga um ajuste; resolve com a mensagem "ajustes" com o pedido. */
	ligar(arquivo: ArquivoDeAjustesNaTela["arquivo"], ajuste: string, ativo: boolean): Promise<void>;
	/** Os erros do ligar_ajuste, pela chave arquivo/id (chaveDoAjuste). */
	erros: Record<string, string>;
}

/**
 * Os ajustes aprovados: pede "listar_ajustes" quando `ativo` (o modal abriu),
 * ao montar e quando a sessão muda. Trocar de sessão zera as ações da ponte;
 * até a nova lista chegar, vale a última.
 */
export function useAjustes(janela: JanelaPerfilHook, ativo = true): AjustesDoMetodo {
	const { estado: estadoJanela, acoes } = janela;
	const sessaoId = estadoJanela.sessao?.sessaoId;
	const listar = useCallback(() => {
		semEsperar(acoes.acaoDaInterface(PAINEL_MODULOS, "listar_ajustes", {} satisfies AcoesModulos["listar_ajustes"]));
	}, [acoes]);
	useEffect(() => {
		if (sessaoId && ativo) listar();
	}, [sessaoId, ativo, listar]);

	const recebidas = estadoJanela.acoesPorPainel[PAINEL_MODULOS];
	const lido = useMemo(() => lerAjustes(recebidas ?? []), [recebidas]);
	const ultimos = useRef<ArquivoDeAjustesNaTela[] | undefined>(undefined);
	if (lido.arquivos) ultimos.current = lido.arquivos;
	const arquivos = lido.arquivos ?? ultimos.current;

	const espera = useRef<EsperaDePedidos<{ acao: string; dados: Record<string, unknown> }> | undefined>(undefined);
	espera.current ??= new EsperaDePedidos(respostaQualquer, (mensagem) => new ErroDosAjustes(mensagem));
	useEffect(() => {
		espera.current!.receber(recebidas ?? []);
	}, [recebidas]);
	// Outra sessão: o que foi para a extensão antiga não vai ter resposta.
	useEffect(() => () => espera.current!.cancelar("A conversa mudou antes da resposta. Tente de novo."), [sessaoId]);

	// Os pedidos de ligar desta tela (pedido → chave do ajuste), para apagar o erro de um ajuste quando um ligar dele dá certo.
	const [pedidos, setPedidos] = useState<Record<string, string>>({});
	const erros = useMemo(() => errosDosAjustes(recebidas ?? [], pedidos), [recebidas, pedidos]);

	return {
		...(arquivos ? { arquivos } : {}),
		...(lido.erro ? { erro: lido.erro } : {}),
		listar,
		erros,
		ligar: async (arquivo, ajuste, ativoNovo) => {
			const pedido = crypto.randomUUID();
			setPedidos((atuais) => ({ ...atuais, [pedido]: chaveDoAjuste(arquivo, ajuste) }));
			const promessa = espera.current!.esperar(pedido);
			const dados = { pedido, arquivo, ajuste, ativo: ativoNovo } satisfies AcoesModulos["ligar_ajuste"];
			acoes.acaoDaInterface(PAINEL_MODULOS, "ligar_ajuste", dados).catch((falha: unknown) => {
				espera.current!.falhar(pedido, `Não consegui falar com a sessão: ${(falha as Error).message}`);
			});
			await promessa;
		},
	};
}
