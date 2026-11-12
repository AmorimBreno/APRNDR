// O painel "aprendiz" da ponte (docs/aprendiz.md, seção 7), que a extensão do aprendiz (extensions/aprendiz.ts)
// atende, e a leitura do que ela mandou. A tela "Perfil do aprendiz" (TelaAprendiz.tsx) usa o hook.
//
// A tela manda `indicadores` ({}) ao abrir e quando a sessão troca; a extensão responde por "interface:mostrar"
// (gravar: false) com `indicadores` ({ indicadores: IndicadoresAprendiz }) ou `erro` ({ mensagem }). Como a
// resposta não leva o pedido, só valem as ações que chegaram depois da montagem da tela (e depois de cada troca
// de sessão): uma resposta de uma visita anterior ou de outra sessão não aparece. A última que chegou manda:
// um erro depois de indicadores troca a tela por ele, e indicadores depois de um erro o apagam.

import { type AcaoRecebida, type JanelaPerfilHook } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type IndicadoresAprendiz, type IndicadoresConceito, PAINEL_APRENDIZ } from "../../lib/aprendiz-indicadores-tipos.ts";

export { PAINEL_APRENDIZ };

/** As ações que a tela manda à extensão. */
export interface AcoesAprendiz {
	/** Pede os indicadores de todas as matérias (o filtro por matéria é da tela). */
	indicadores: Record<string, never>;
}

/** Um erro da extensão (ou de mandar a ação) para mostrar; a chave identifica este erro. */
export interface ErroVistoAprendiz {
	chave: string;
	mensagem: string;
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const ehNumero = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor);

/** Um conceito com o que a tela precisa para desenhar a linha (os campos vêm do JSON da extensão). */
function conceitoValido(valor: unknown): valor is IndicadoresConceito {
	if (!ehObjeto(valor)) return false;
	return (
		typeof valor.conceito === "string" &&
		typeof valor.materia === "string" &&
		ehNumero(valor.dominio) &&
		ehNumero(valor.observacoes) &&
		ehNumero(valor.sessoes) &&
		ehNumero(valor.acertosPonderados) &&
		ehNumero(valor.errosPonderados) &&
		typeof valor.ultima === "string"
	);
}

/**
 * Os indicadores de uma mensagem `indicadores`, ou undefined se ela não tem a forma esperada. Os conceitos que não
 * servem são descartados e os campos opcionais que faltam ficam com um valor neutro: a tela não quebra com um dado ruim.
 */
export function indicadoresDaMensagem(dados: unknown): IndicadoresAprendiz | undefined {
	if (!ehObjeto(dados) || !ehObjeto(dados.indicadores)) return undefined;
	const bruto = dados.indicadores;
	if (!Array.isArray(bruto.conceitos)) return undefined;
	const ignorados = ehObjeto(bruto.ignorados) ? bruto.ignorados : {};
	const conceitos = bruto.conceitos.filter(conceitoValido).map((conceito) => ({
		...conceito,
		ganho: ehNumero(conceito.ganho) ? conceito.ganho : null,
		brier: ehNumero(conceito.brier) ? conceito.brier : null,
		confusoes: Array.isArray(conceito.confusoes) ? conceito.confusoes : [],
		eventos: Array.isArray(conceito.eventos) ? conceito.eventos : [],
	}));
	return {
		...(bruto as unknown as IndicadoresAprendiz),
		conceitos,
		ignorados: {
			materiaInexistente: ehNumero(ignorados.materiaInexistente) ? ignorados.materiaInexistente : 0,
			semConceito: ehNumero(ignorados.semConceito) ? ignorados.semConceito : 0,
		},
	};
}

/** Um `erro` é dos indicadores se não tem pedido e não diz que é de outra ação (`ao`); a parte A manda só { mensagem }. */
export function erroEhDosIndicadores(dados: unknown): boolean {
	if (!ehObjeto(dados)) return true;
	if (typeof dados.pedido === "string" && dados.pedido) return false;
	return dados.ao === undefined || dados.ao === "indicadores";
}

/** O que a extensão mandou, entre as ações que valem. */
export interface LidoAprendiz {
	/** Os últimos indicadores, se nenhum erro veio depois deles. */
	indicadores?: IndicadoresAprendiz;
	/** O último erro, se nenhum indicador veio depois dele. */
	erro?: ErroVistoAprendiz;
	/** A chave da última ação que valeu (indicadores ou erro); undefined se nada chegou. */
	chaveDaUltima?: string;
}

/** Lê, em ordem, as ações do painel "aprendiz"; as chaves em `ignoradas` (as de antes da montagem) não valem. */
export function lerAprendiz(recebidas: readonly AcaoRecebida[], ignoradas: ReadonlySet<string> = new Set()): LidoAprendiz {
	let indicadores: IndicadoresAprendiz | undefined;
	let erro: ErroVistoAprendiz | undefined;
	let chaveDaUltima: string | undefined;
	for (const recebida of recebidas) {
		if (ignoradas.has(recebida.chave)) continue;
		if (recebida.acao === "indicadores") {
			const lidos = indicadoresDaMensagem(recebida.dados);
			if (!lidos) continue;
			indicadores = lidos;
			erro = undefined;
			chaveDaUltima = recebida.chave;
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as { mensagem?: unknown } | undefined;
			// Os erros da parte B (de uma ação com pedido, ou de outro `ao`) são das abas Hipóteses e Histórico, não dos indicadores.
			if (!erroEhDosIndicadores(recebida.dados)) continue;
			const mensagem = ehObjeto(dados) && typeof dados.mensagem === "string" && dados.mensagem ? dados.mensagem : "Erro desconhecido.";
			erro = { chave: recebida.chave, mensagem };
			indicadores = undefined;
			chaveDaUltima = recebida.chave;
		}
	}
	return { ...(indicadores ? { indicadores } : {}), ...(erro ? { erro } : {}), ...(chaveDaUltima ? { chaveDaUltima } : {}) };
}

// --- O hook ------------------------------------------------------------------

/**
 * As chaves das ações que já estavam na ponte ao montar e as que estavam quando a sessão trocou: são de antes e não
 * valem (a lista é a mesma instância entre as renderizações; cada hook do painel tem a sua). Usada pelos hooks da
 * tela do aprendiz (indicadores, hipóteses e histórico).
 */
export function useChavesAntigas(recebidas: readonly AcaoRecebida[] | undefined, sessaoId: string | undefined): ReadonlySet<string> {
	const antigas = useRef<Set<string> | undefined>(undefined);
	antigas.current ??= new Set((recebidas ?? []).map((recebida) => recebida.chave));
	const sessaoVista = useRef(sessaoId);
	if (sessaoVista.current !== sessaoId) {
		sessaoVista.current = sessaoId;
		for (const recebida of recebidas ?? []) antigas.current.add(recebida.chave);
	}
	return antigas.current;
}

export interface IndicadoresAbertos {
	/** Os indicadores a mostrar; undefined até a primeira resposta desta visita (ou enquanto um erro vale). */
	indicadores?: IndicadoresAprendiz;
	/** O erro a mostrar (o da extensão ou o de não conseguir falar com a sessão). */
	erro?: ErroVistoAprendiz;
	/** "Tentar de novo" foi clicado e a resposta ainda não chegou. */
	tentando: boolean;
	/** Pede os indicadores de novo (o botão "Tentar de novo"). */
	recarregar(): void;
}

/**
 * Os indicadores: pede `indicadores` ao montar e quando a sessão muda. Trocar de sessão zera as ações da ponte;
 * até a resposta nova chegar, valem os últimos indicadores desta visita (nada some na troca).
 */
export function useIndicadores(janela: JanelaPerfilHook): IndicadoresAbertos {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	const recebidas = estado.acoesPorPainel[PAINEL_APRENDIZ];
	const antigas = useChavesAntigas(recebidas, sessaoId);

	const lido = useMemo(() => lerAprendiz(recebidas ?? [], antigas), [recebidas, sessaoId, antigas]);
	const ultimos = useRef<IndicadoresAprendiz | undefined>(undefined);
	if (lido.indicadores) ultimos.current = lido.indicadores;

	const [falha, setFalha] = useState<ErroVistoAprendiz | undefined>(undefined);
	const [tentando, setTentando] = useState<{ desde: string | undefined } | undefined>(undefined);
	const falhas = useRef(0);
	const ultimaChave = useRef<string | undefined>(undefined);
	ultimaChave.current = lido.chaveDaUltima;

	const pedir = useCallback(() => {
		setFalha(undefined);
		acoes.acaoDaInterface(PAINEL_APRENDIZ, "indicadores", {} satisfies AcoesAprendiz["indicadores"]).catch((erro: unknown) => {
			setTentando(undefined);
			setFalha({ chave: `local-${++falhas.current}`, mensagem: `Não consegui falar com a sessão: ${(erro as Error).message}` });
		});
	}, [acoes]);
	useEffect(() => {
		if (sessaoId) pedir();
	}, [sessaoId, pedir]);

	const recarregar = useCallback(() => {
		setTentando({ desde: ultimaChave.current });
		pedir();
	}, [pedir]);

	const erro = falha ?? lido.erro;
	// Uma resposta nova (outra chave) encerra o "tentando".
	const aindaTentando = tentando !== undefined && !falha && lido.chaveDaUltima === tentando.desde;
	const indicadores = erro ? undefined : (lido.indicadores ?? ultimos.current);
	return { ...(indicadores ? { indicadores } : {}), ...(erro ? { erro } : {}), tentando: aindaTentando, recarregar };
}
