// O painel "mapa" da ponte, que a extensão do mapa de conteúdo
// (extensions/mapa.ts, docs/mapa-conteudo.md, "Ponte") atende, e a leitura do
// que ela mandou. O caderno usa o hook (a contagem do índice) e a seção Mapa
// de conteúdo (SecaoMapa.tsx) mostra e manda as mudanças.
//
// A mudança é otimista: cada ação do Breno vira um lote com um pedido; a tela
// mostra o mapa do servidor com os lotes ainda sem resposta aplicados por
// cima (as mesmas funções puras que a extensão usa). Quando chega um "mapa"
// ou um "erro" com o pedido de um lote, ele sai: no "mapa", a mudança já está
// no estado do servidor; no "erro", ela some sozinha e o erro aparece.

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type AcoesMapa,
	type AndamentoMapa,
	aprovar,
	aplicarOperacoes,
	contarMapa,
	type EstadoMapa,
	type MapaConteudo,
	type MensagemErroMapa,
	type Operacao,
	PAINEL_MAPA,
	type PendenteMapa,
	type Referencia,
} from "../../lib/mapa-tipos.ts";
import type { TipoCurso } from "../../lib/curso-tipos.ts";
import { formatarDolar } from "./ModalMateriais.tsx";

export { PAINEL_MAPA };

/** Uma mudança do Breno mandada à extensão e ainda sem resposta. */
export type LoteMapa = { tipo: "operar"; pedido: string; edicao: string; operacoes: Operacao[] } | { tipo: "aprovar"; pedido: string };

/** Um erro da extensão (ou de mandar a ação) para mostrar; a chave serve para fechar. */
export interface ErroVisto extends MensagemErroMapa {
	chave: string;
}

/**
 * O que a extensão mandou sobre a matéria: o último estado, os pedidos já
 * respondidos (por um "mapa" ou um "erro") e os erros. Um erro sem matéria
 * também conta (não dá para saber de quem é, e só esta tela ouve o painel).
 */
export function lerMapa(recebidas: readonly AcaoRecebida[], materia: string): { estado?: EstadoMapa; respondidos: Set<string>; erros: ErroVisto[] } {
	let estado: EstadoMapa | undefined;
	const respondidos = new Set<string>();
	const erros: ErroVisto[] = [];
	for (const recebida of recebidas) {
		if (recebida.acao === "mapa") {
			const dados = recebida.dados as EstadoMapa | undefined;
			if (!dados || dados.materia !== materia || !dados.mapa) continue;
			estado = dados;
			if (dados.pedido) respondidos.add(dados.pedido);
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroMapa | undefined;
			if (!dados || (dados.materia !== undefined && dados.materia !== materia)) continue;
			if (dados.pedido) respondidos.add(dados.pedido);
			erros.push({ ...dados, mensagem: dados.mensagem || "Erro desconhecido.", chave: recebida.chave });
		}
	}
	return { ...(estado ? { estado } : {}), respondidos, erros };
}

/** O mapa como a tela mostra: o do servidor com os lotes sem resposta aplicados em ordem. */
export function mostrarMapa(mapa: MapaConteudo, lotes: readonly LoteMapa[]): MapaConteudo {
	let atual = mapa;
	for (const lote of lotes) {
		if (lote.tipo === "operar") atual = aplicarOperacoes(atual, lote.operacoes).mapa;
		else {
			try {
				atual = aprovar(atual);
			} catch {
				// Sem conceito dentro: a extensão vai responder com o erro.
			}
		}
	}
	return atual;
}

/** Os lotes que ainda esperam resposta. */
export const semResposta = (lotes: readonly LoteMapa[], respondidos: ReadonlySet<string>) => lotes.filter((lote) => !respondidos.has(lote.pedido));

// --- Textos da seção ---------------------------------------------------------

const diaMesNumerico = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** A etiqueta da situação: o texto e o tom da Tag. */
export function rotuloSituacao(mapa: MapaConteudo): { texto: string; tom: "neutral" | "sage" | "amber" } {
	if (mapa.situacao === "aprovado") {
		const data = mapa.aprovadoEm ? new Date(mapa.aprovadoEm) : undefined;
		return { texto: data && !Number.isNaN(data.getTime()) ? `Aprovado · ${diaMesNumerico.format(data)}` : "Aprovado", tom: "sage" };
	}
	if (mapa.situacao === "alterado") return { texto: "Mudou depois da aprovação", tom: "amber" };
	return { texto: "Rascunho", tom: "neutral" };
}

const contar = (quantos: number, um: string, varios: string) => `${quantos} ${quantos === 1 ? um : varios}`;

/** "14 conceitos · 3 arquivos", mais "· 2 novos" e "· 1 sem fonte" quando houver. */
export function resumoMapa(mapa: MapaConteudo): string {
	const contas = contarMapa(mapa);
	return [
		contar(contas.dentro, "conceito", "conceitos"),
		contar(contas.arquivos, "arquivo", "arquivos"),
		contas.novos > 0 ? contar(contas.novos, "novo", "novos") : "",
		contas.semFonte > 0 ? `${contas.semFonte} sem fonte` : "",
	]
		.filter(Boolean)
		.join(" · ");
}

/** O custo somado dos mapeamentos (todos os arquivos já mapeados). */
export const custoDoMapa = (mapa: MapaConteudo) => Object.values(mapa.arquivos).reduce((soma, arquivo) => soma + (arquivo.custo || 0), 0);

const PAGINA = /^p[áa]gina\s+(\S+)$/i;

/** "página 12" vira "p. 12"; os outros locais ficam como vieram. */
export function abreviarLocal(local: string): string {
	const pagina = PAGINA.exec(local.trim());
	return pagina ? `p. ${pagina[1]}` : local;
}

/**
 * As referências de um conceito, uma etiqueta por arquivo, na ordem em que
 * cada arquivo aparece: "aula-04.pdf · p. 12, 13". As páginas vão juntas
 * depois de um "p." só (em ordem numérica); os outros locais vêm depois, como
 * vieram. `locais` são os pedaços depois do " · ", um por local ("p. 12",
 * "13", "célula 3"), para a etiqueta mostrar só os que cabem.
 */
export function agruparReferencias(referencias: readonly Referencia[]): Array<{ arquivo: string; texto: string; locais: string[] }> {
	const porArquivo = new Map<string, string[]>();
	for (const referencia of referencias) {
		const locais = porArquivo.get(referencia.arquivo) ?? [];
		if (!locais.includes(referencia.local)) locais.push(referencia.local);
		porArquivo.set(referencia.arquivo, locais);
	}
	return Array.from(porArquivo, ([arquivo, locais]) => {
		const paginas: string[] = [];
		const outros: string[] = [];
		for (const local of locais) {
			const pagina = PAGINA.exec(local.trim());
			if (pagina) paginas.push(pagina[1]!);
			else if (local.trim()) outros.push(local.trim());
		}
		if (paginas.every((pagina) => /^\d+$/.test(pagina))) paginas.sort((a, b) => Number(a) - Number(b));
		const partes = [...paginas.map((pagina, indice) => (indice === 0 ? `p. ${pagina}` : pagina)), ...outros];
		return { arquivo, texto: partes.length ? `${arquivo} · ${partes.join(", ")}` : arquivo, locais: partes };
	});
}

/** O conceito que ficou logo antes de `id` na ordem (null se ele é o primeiro). */
export function depoisDeNaOrdem(ordem: readonly string[], id: string): string | null {
	const indice = ordem.indexOf(id);
	return indice > 0 ? ordem[indice - 1]! : null;
}

/**
 * Depois de um arrasto: a operação mover, ou undefined se o conceito ficou
 * logo depois do mesmo conceito de antes (a ordem dele não mudou).
 */
export function moverDepoisDoArrasto(antes: readonly string[], depois: readonly string[], id: string): Operacao | undefined {
	if (!depois.includes(id)) return undefined;
	const novo = depoisDeNaOrdem(depois, id);
	if (antes.includes(id) && depoisDeNaOrdem(antes, id) === novo) return undefined;
	return { tipo: "mover", id, depoisDe: novo };
}

/** Subir ou descer um lugar nos conceitos de dentro; undefined no primeiro (subir) e no último (descer). */
export function moverUmLugar(ordem: readonly string[], id: string, direcao: "subir" | "descer"): Operacao | undefined {
	const indice = ordem.indexOf(id);
	if (indice < 0) return undefined;
	if (direcao === "subir") {
		if (indice === 0) return undefined;
		return { tipo: "mover", id, depoisDe: indice >= 2 ? ordem[indice - 2]! : null };
	}
	if (indice === ordem.length - 1) return undefined;
	return { tipo: "mover", id, depoisDe: ordem[indice + 1]! };
}

/** "3 arquivos ainda fora do mapa · cerca de US$ 0,04" (ou "custo desconhecido" se algum não tem preço). */
export function textoPendentes(pendentes: readonly PendenteMapa[]): string {
	const desconhecido = pendentes.some((pendente) => pendente.custoEstimado === null || pendente.custoEstimado === undefined);
	const custo = pendentes.reduce((soma, pendente) => soma + (pendente.custoEstimado ?? 0), 0);
	return `${pendentes.length === 1 ? "1 arquivo ainda fora do mapa" : `${pendentes.length} arquivos ainda fora do mapa`} · ${desconhecido ? "custo desconhecido" : `cerca de ${formatarDolar(custo)}`}`;
}

/** "Mapeando aula-05.pdf · parte 2 de 3" e, com fila, "+ 2 na fila". */
export function textoAndamento(andamento: AndamentoMapa, fila: readonly string[]): { texto: string; fila?: string } {
	const parte = andamento.partes > 1 ? ` · parte ${andamento.parte} de ${andamento.partes}` : "";
	const esperando = fila.filter((arquivo) => arquivo !== andamento.arquivo).length;
	return { texto: `Mapeando ${andamento.arquivo}${parte}`, ...(esperando > 0 ? { fila: `+ ${esperando} na fila` } : {}) };
}

/** Quanto do arquivo em andamento já foi (as partes prontas, mais meia da que está indo). */
export const progressoAndamento = (andamento: AndamentoMapa) =>
	andamento.partes > 0 ? Math.min(1, Math.max(0, (andamento.parte - 0.5) / andamento.partes)) : 0;

// --- O hook ------------------------------------------------------------------

export interface MapaDaMateria {
	/** O último estado da extensão; undefined até o primeiro chegar. */
	estado?: EstadoMapa;
	/** O mapa como a tela mostra (com as mudanças ainda sem resposta). */
	mapa?: MapaConteudo;
	/** Os erros desta matéria que chegaram depois de abrir o caderno e não foram fechados. */
	erros: ErroVisto[];
	fecharErro(chave: string): void;
	/** Manda as operações de uma vez (um lote), com o id da abertura da seção. */
	operar(edicao: string, operacoes: Operacao[]): void;
	aprovar(): void;
	/** Sem arquivos, todos os pendentes. */
	mapear(arquivos?: string[]): void;
	refazer(): void;
	/** Para o mapeamento em andamento (ou o mapa do tema) e esvazia a fila. */
	cancelar(): void;
	/** Monta o mapa a partir do tema de um curso (docs/cursos.md): tema = o nome do curso; tipo e motivo vêm do Objetivo. */
	doTema(tema: string, tipo?: TipoCurso, motivo?: string): void;
}

/**
 * O mapa de conteúdo da matéria: pede "abrir" ao montar e quando a sessão
 * muda, guarda o último estado (trocar de sessão zera as ações da ponte; até o
 * novo chegar, vale o último) e as mudanças otimistas.
 */
export function useMapa(janela: JanelaPerfilHook, materiaId: string): MapaDaMateria {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	useEffect(() => {
		if (sessaoId) semEsperar(acoes.acaoDaInterface(PAINEL_MAPA, "abrir", { materia: materiaId } satisfies AcoesMapa["abrir"]));
	}, [sessaoId, acoes, materiaId]);

	const recebidas = estado.acoesPorPainel[PAINEL_MAPA];
	const lido = useMemo(() => lerMapa(recebidas ?? [], materiaId), [recebidas, materiaId]);
	const ultimo = useRef<EstadoMapa | undefined>(undefined);
	if (lido.estado) ultimo.current = lido.estado;
	const servidor = lido.estado ?? (ultimo.current?.materia === materiaId ? ultimo.current : undefined);

	const [lotes, setLotes] = useState<LoteMapa[]>([]);
	// Outra sessão: o que foi para a extensão antiga não vai ter resposta; vale o estado que a nova manda ao abrir.
	useEffect(() => setLotes([]), [sessaoId, materiaId]);
	const pendentes = useMemo(() => semResposta(lotes, lido.respondidos), [lotes, lido.respondidos]);
	useEffect(() => {
		if (pendentes.length !== lotes.length) setLotes((atuais) => semResposta(atuais, lido.respondidos));
	}, [pendentes, lotes, lido.respondidos]);

	// Os erros que já estavam lá ao abrir são de antes: começam fechados.
	const [fechados, setFechados] = useState<ReadonlySet<string>>(() => new Set(lido.erros.map((erro) => erro.chave)));
	const [locais, setLocais] = useState<ErroVisto[]>([]);
	const erros = useMemo(() => [...lido.erros, ...locais].filter((erro) => !fechados.has(erro.chave)), [lido.erros, locais, fechados]);

	const mapa = useMemo(() => (servidor ? mostrarMapa(servidor.mapa, pendentes) : undefined), [servidor, pendentes]);

	const contador = useRef(0);
	const mandar = useCallback(
		<Acao extends keyof AcoesMapa>(acao: Acao, dados: AcoesMapa[Acao], pedido?: string) => {
			acoes.acaoDaInterface(PAINEL_MAPA, acao, dados).catch((falha: unknown) => {
				// Nem chegou a sair (a conexão caiu): o lote sai e o erro aparece.
				if (pedido) setLotes((atuais) => atuais.filter((lote) => lote.pedido !== pedido));
				setLocais((atuais) => [
					...atuais,
					{ chave: `local-${++contador.current}`, ao: acao, materia: materiaId, mensagem: `Não consegui falar com a sessão: ${(falha as Error).message}` },
				]);
			});
		},
		[acoes, materiaId],
	);

	return {
		...(servidor ? { estado: servidor } : {}),
		...(mapa ? { mapa } : {}),
		erros,
		fecharErro: (chave) => setFechados((atuais) => new Set([...atuais, chave])),
		operar: (edicao, operacoes) => {
			if (operacoes.length === 0) return;
			const pedido = crypto.randomUUID();
			setLotes((atuais) => [...atuais, { tipo: "operar", pedido, edicao, operacoes }]);
			mandar("operar", { materia: materiaId, edicao, pedido, operacoes }, pedido);
		},
		aprovar: () => {
			const pedido = crypto.randomUUID();
			setLotes((atuais) => [...atuais, { tipo: "aprovar", pedido }]);
			mandar("aprovar", { materia: materiaId, pedido }, pedido);
		},
		mapear: (arquivos) => mandar("mapear", { materia: materiaId, ...(arquivos ? { arquivos } : {}) }),
		refazer: () => mandar("refazer", { materia: materiaId }),
		cancelar: () => mandar("cancelar", { materia: materiaId }),
		doTema: (tema, tipo, motivo) =>
			mandar("do_tema", { materia: materiaId, pedido: crypto.randomUUID(), tema, ...(tipo ? { tipo } : {}), ...(motivo?.trim() ? { motivo: motivo.trim() } : {}) }),
	};
}
