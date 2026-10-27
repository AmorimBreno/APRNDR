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

import { type AcaoRecebida, type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AcoesModulos, type MensagemErroModulos, type MensagemEstadoModulos, type MensagemModulo, PAINEL_MODULOS } from "../../lib/modulo-tipos.ts";
import type { LidoModuloAberto } from "./modulo-tela.ts";
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
			// Os erros do abrir são da visão do módulo (lerModuloAberto), não do card.
			if (!dados || !doCurso(dados, materia, curso) || dados.pedido || dados.ao === "abrir") continue;
			const erro: ErroVistoModulo = { chave: recebida.chave, mensagem: dados.mensagem || "Erro desconhecido.", ...(dados.ao ? { ao: dados.ao } : {}) };
			if (dados.modulo && dados.ao !== "listar") errosModulo[dados.modulo] = erro;
			else erroLista = erro;
		}
	}
	return { ...(estado ? { estado } : {}), ...(erroLista ? { erroLista } : {}), errosModulo };
}

// --- O módulo aberto (parte B) ----------------------------------------------

/**
 * Lê, em ordem, a resposta ao "abrir" do módulo: o último "modulo" daquele
 * módulo do curso, ou o último "erro" do abrir dele (o que veio por último
 * vale). Nada ainda, vazio.
 */
export function lerModuloAberto(recebidas: readonly AcaoRecebida[], materia: string, curso: string, modulo: string): LidoModuloAberto {
	let lido: LidoModuloAberto = {};
	for (const recebida of recebidas) {
		if (recebida.acao === "modulo") {
			const dados = recebida.dados as MensagemModulo | undefined;
			if (!dados || dados.materia !== materia || dados.curso !== curso || dados.modulo?.id !== modulo || !Array.isArray(dados.modulo.licoes)) continue;
			lido = { modulo: dados.modulo };
		} else if (recebida.acao === "erro") {
			const dados = recebida.dados as MensagemErroModulos | undefined;
			if (!dados || dados.ao !== "abrir" || dados.modulo !== modulo || !doCurso(dados, materia, curso)) continue;
			lido = { erro: dados.mensagem || "Erro desconhecido." };
		}
	}
	return lido;
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
	/** Para a geração (o que estava gravado antes fica); resolve quando a ação sai. */
	cancelar(modulo: string): Promise<void>;
}

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
		cancelar: async (modulo) => {
			try {
				await acoes.acaoDaInterface(PAINEL_MODULOS, "cancelar", { materia, curso, modulo } satisfies AcoesModulos["cancelar"]);
			} catch (falha) {
				throw new ErroDosModulos(`Não consegui falar com a sessão: ${(falha as Error).message}`);
			}
		},
	};
}
