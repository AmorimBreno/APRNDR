// Os experimentos do método na ponte (docs/metodo-experimentos.md, "Ponte"),
// que a extensão de módulos atende no painel "modulos": listar_ajustes não
// leva matéria nem curso e responde com a mensagem "ajustes" (os arquivos de
// metodologia com algum ajuste ou que não se leem, cada ajuste com o estado, e
// os aprendizados). Só leitura: quem decide sobre os experimentos é a análise
// de cada módulo concluído, e não há ação de ligar, desligar ou aprovar.
// "Como o professor escreve" (ModalEscrita.tsx) usa o hook, na tela de
// cadernos e na visão do módulo.

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ArquivoDeAjustesNaTela } from "../../lib/metodo-ciclo-tipos.ts";
import type { AprendizadoNaTela, AprendizadosNaTela } from "../../lib/metodo-aprendizados-tipos.ts";
import { type AcoesModulos, type MensagemAjustes, type MensagemErroModulos, PAINEL_MODULOS } from "../../lib/modulo-tipos.ts";

/** Um erro sem pedido que a extensão mandou (o do listar_ajustes): a chave da ação recebida identifica este erro. */
export interface ErroVistoAjustes {
	chave: string;
	mensagem: string;
}

/** O que a extensão mandou sobre os experimentos. */
export interface LidoAjustes {
	/** Os últimos arquivos que chegaram (a lista é sempre a de todos). */
	arquivos?: ArquivoDeAjustesNaTela[];
	/** Os aprendizados que vieram com eles ("O que facilita"). */
	aprendizados?: AprendizadosNaTela;
	/** O erro do listar_ajustes que veio depois deles. */
	erro?: ErroVistoAjustes;
}

const ehArquivoDeAjustes = (valor: unknown): valor is ArquivoDeAjustesNaTela =>
	typeof valor === "object" && valor !== null && typeof (valor as ArquivoDeAjustesNaTela).arquivo === "string" && Array.isArray((valor as ArquivoDeAjustesNaTela).ajustes);

const ehAprendizado = (valor: unknown): valor is AprendizadoNaTela =>
	typeof valor === "object" && valor !== null && typeof (valor as AprendizadoNaTela).id === "string" && typeof (valor as AprendizadoNaTela).texto === "string";

/** Os aprendizados da mensagem; ausentes ou fora do formato (uma extensão antiga), undefined. */
function aprendizadosLidos(valor: unknown): AprendizadosNaTela | undefined {
	if (typeof valor !== "object" || valor === null || !Array.isArray((valor as AprendizadosNaTela).itens)) return undefined;
	const { itens, erro } = valor as AprendizadosNaTela;
	return { itens: itens.filter(ehAprendizado), ...(typeof erro === "string" && erro ? { erro } : {}) };
}

/**
 * Lê, em ordem, o que chegou ao painel "modulos" sobre os experimentos: os
 * últimos "ajustes" (com ou sem pedido) e um "erro" do listar_ajustes que veio
 * depois deles. Os erros com pedido são de quem pediu.
 */
export function lerAjustes(recebidas: readonly AcaoRecebida[]): LidoAjustes {
	let arquivos: ArquivoDeAjustesNaTela[] | undefined;
	let aprendizados: AprendizadosNaTela | undefined;
	let erro: ErroVistoAjustes | undefined;
	for (const recebida of recebidas) {
		if (recebida.acao === "ajustes") {
			const dados = recebida.dados as MensagemAjustes | undefined;
			if (!dados || !Array.isArray(dados.arquivos)) continue;
			arquivos = dados.arquivos.filter(ehArquivoDeAjustes);
			aprendizados = aprendizadosLidos(dados.aprendizados);
			erro = undefined;
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			if (!dados || dados.pedido || dados.ao !== "listar_ajustes") continue;
			erro = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido." };
		}
	}
	return { ...(arquivos ? { arquivos } : {}), ...(aprendizados ? { aprendizados } : {}), ...(erro ? { erro } : {}) };
}

export interface AjustesDoMetodo extends LidoAjustes {
	listar(): void;
}

/**
 * Os experimentos e os aprendizados: pede "listar_ajustes" quando `ativo` (o
 * modal abriu), ao montar e quando a sessão muda. Trocar de sessão zera as
 * ações da ponte; até a nova lista chegar, vale a última.
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
	const ultimos = useRef<{ arquivos: ArquivoDeAjustesNaTela[]; aprendizados?: AprendizadosNaTela } | undefined>(undefined);
	if (lido.arquivos) ultimos.current = { arquivos: lido.arquivos, ...(lido.aprendizados ? { aprendizados: lido.aprendizados } : {}) };
	const arquivos = lido.arquivos ?? ultimos.current?.arquivos;
	const aprendizados = lido.arquivos ? lido.aprendizados : ultimos.current?.aprendizados;

	return {
		...(arquivos ? { arquivos } : {}),
		...(aprendizados ? { aprendizados } : {}),
		...(lido.erro ? { erro: lido.erro } : {}),
		listar,
	};
}
