// O cliente da ponte para as abas Hipóteses e Histórico da tela "Perfil do aprendiz" (docs/aprendiz.md, seção 8; a
// forma da ponte está no fim de lib/hipoteses-tipos.ts). O painel é o mesmo dos indicadores (PAINEL_APRENDIZ):
//
//   tela -> extensão:  hipoteses {}  |  historico {}  |  refletir { pedido }
//                      decidir { pedido, alvo, id, decisao, enunciado? }  |  editar { pedido, id, enunciado?, status? }
//   extensão -> tela:  hipoteses { estado }  |  historico { eventos }  |  refletindo { pedido }
//                      refletiu { pedido, resumo, estado }  |  decidida { pedido, estado }  |  erro { pedido?, ao, mensagem }
//
// Regras (docs/padroes-de-interface.md, regra 4): só valem as ações que chegaram depois da montagem da tela e depois de
// cada troca de sessão; a resposta de uma operação é a que leva o mesmo `pedido`; o que o Breno já via fica na tela
// até a resposta nova chegar; um envio que lança (a troca de sessão) é tentado uma vez mais. O `historico` é pedido
// sem matéria: o filtro por matéria e por tipo é da tela (a resposta não diz de que matéria é).

import type { AcaoRecebida, JanelaPerfilHook } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConfiancaHipotese, EscopoHipotese, EstadoHipoteses, Hipotese, MudancaPendente, ResumoDaReflexao, StatusHipotese, TipoHipotese } from "../../lib/hipoteses-tipos.ts";
import { type EventoLido, eventosDaMensagem } from "./aprendiz-historico-tela.ts";
import { type ErroVistoAprendiz, PAINEL_APRENDIZ, useChavesAntigas } from "./aprendiz-ponte.ts";
import { AVISO_SESSAO_TROCANDO, enviarComRetentativa, novoIdDePedido } from "./guardar-na-nota.ts";

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const ehNumero = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor);
const textos = (valor: unknown): string[] => (Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : []);

/** Quanto esperar a resposta de uma operação (decidir, editar, ou o primeiro sinal do refletir) antes de dizer que o app não confirmou. */
export const PRAZO_DA_RESPOSTA_MS = 20_000;
export const AVISO_SEM_CONFIRMACAO = "O app não confirmou. Atualize a aba e confira antes de tentar de novo.";

// --- Ler o que a extensão mandou ------------------------------------------------------

const STATUS: readonly string[] = ["proposta", "aprovada", "rejeitada", "expirada"];

function escopoValido(valor: unknown): EscopoHipotese | undefined {
	if (!ehObjeto(valor)) return undefined;
	if (valor.nivel === "global") return { nivel: "global" };
	if (typeof valor.materia !== "string" || valor.materia === "") return undefined;
	if (valor.nivel === "materia") return { nivel: "materia", materia: valor.materia };
	if (valor.nivel === "conceito") return { nivel: "conceito", materia: valor.materia, conceitos: textos(valor.conceitos) };
	return undefined;
}

/** Uma hipótese com o que a tela precisa para o cartão; completa o que falta e descarta a que não tem id, enunciado, status ou escopo. */
export function hipoteseValida(valor: unknown): Hipotese | undefined {
	if (!ehObjeto(valor) || typeof valor.id !== "string" || typeof valor.enunciado !== "string" || typeof valor.status !== "string" || !STATUS.includes(valor.status)) return undefined;
	const escopo = escopoValido(valor.escopo);
	if (!escopo) return undefined;
	return {
		id: valor.id,
		tipo: (typeof valor.tipo === "string" ? valor.tipo : "conhecimento") as TipoHipotese,
		escopo,
		enunciado: valor.enunciado,
		aFavor: textos(valor.aFavor),
		contra: textos(valor.contra),
		confianca: (typeof valor.confianca === "string" ? valor.confianca : "baixa") as ConfiancaHipotese,
		criadaEm: typeof valor.criadaEm === "string" ? valor.criadaEm : "",
		ultimaConfirmacao: typeof valor.ultimaConfirmacao === "string" ? valor.ultimaConfirmacao : "",
		validade: typeof valor.validade === "string" ? valor.validade : "",
		status: valor.status as StatusHipotese,
		aprovadaPeloUsuario: valor.aprovadaPeloUsuario === true,
		versao: ehNumero(valor.versao) ? valor.versao : 1,
		anteriores: Array.isArray(valor.anteriores) ? valor.anteriores.filter(ehObjeto).map((anterior) => ({
			versao: ehNumero(anterior.versao) ? anterior.versao : 0,
			enunciado: typeof anterior.enunciado === "string" ? anterior.enunciado : "",
			status: (typeof anterior.status === "string" ? anterior.status : "proposta") as StatusHipotese,
			ts: typeof anterior.ts === "string" ? anterior.ts : "",
		})) : [],
		...(typeof valor.reflexao === "string" ? { reflexao: valor.reflexao } : {}),
	};
}

function mudancaValida(valor: unknown): MudancaPendente | undefined {
	if (!ehObjeto(valor) || typeof valor.id !== "string" || typeof valor.hipotese !== "string" || typeof valor.acao !== "string") return undefined;
	return {
		id: valor.id,
		hipotese: valor.hipotese,
		acao: valor.acao as MudancaPendente["acao"],
		evidencias: textos(valor.evidencias),
		motivo: typeof valor.motivo === "string" ? valor.motivo : "",
		reflexao: typeof valor.reflexao === "string" ? valor.reflexao : "",
		criadaEm: typeof valor.criadaEm === "string" ? valor.criadaEm : "",
	};
}

export function resumoValido(valor: unknown): ResumoDaReflexao | undefined {
	if (!ehObjeto(valor) || typeof valor.id !== "string" || typeof valor.ts !== "string") return undefined;
	return {
		id: valor.id,
		ts: valor.ts,
		motivo: (valor.motivo === "modulo" || valor.motivo === "licao" ? valor.motivo : "botao") as ResumoDaReflexao["motivo"],
		...(typeof valor.ultimoEvento === "string" ? { ultimoEvento: valor.ultimoEvento } : {}),
		lidos: ehNumero(valor.lidos) ? valor.lidos : 0,
		propostas: ehNumero(valor.propostas) ? valor.propostas : 0,
		aceitas: ehNumero(valor.aceitas) ? valor.aceitas : 0,
		descartadas: Array.isArray(valor.descartadas)
			? valor.descartadas.filter(ehObjeto).map((item) => ({ motivo: typeof item.motivo === "string" ? item.motivo : "", quantas: ehNumero(item.quantas) ? item.quantas : 0 }))
			: [],
		...(ehNumero(valor.custo) ? { custo: valor.custo } : {}),
	};
}

/** O estado das hipóteses de uma mensagem (`hipoteses`, `decidida` ou `refletiu`), ou undefined se ela não tem a forma esperada. */
export function estadoDaMensagem(dados: unknown): EstadoHipoteses | undefined {
	if (!ehObjeto(dados) || !ehObjeto(dados.estado)) return undefined;
	const bruto = dados.estado;
	const hipoteses = bruto.hipoteses;
	if (!Array.isArray(hipoteses)) return undefined;
	const ultima = resumoValido(bruto.ultimaReflexao);
	return {
		hipoteses: hipoteses.map(hipoteseValida).filter((hipotese): hipotese is Hipotese => hipotese !== undefined),
		mudancas: Array.isArray(bruto.mudancas) ? bruto.mudancas.map(mudancaValida).filter((mudanca): mudanca is MudancaPendente => mudanca !== undefined) : [],
		...(ultima ? { ultimaReflexao: ultima } : {}),
		refletindo: bruto.refletindo === true,
	};
}

/** A resposta a um pedido: deu certo (com o resumo, no refletir) ou a mensagem do erro. */
export type RespostaDoPedido = { tipo: "ok"; resumo?: ResumoDaReflexao } | { tipo: "erro"; mensagem: string };

const mensagemDoErro = (dados: Record<string, unknown>): string => (typeof dados.mensagem === "string" && dados.mensagem ? dados.mensagem : "Erro desconhecido.");

/** O que a extensão mandou sobre as hipóteses, entre as ações que valem. */
export interface LidoHipoteses {
	/** O último estado (de `hipoteses`, `decidida` ou `refletiu`), se nenhum erro de leitura veio depois dele. */
	valor?: EstadoHipoteses;
	/** O erro de leitura (`erro` sem pedido, de `hipoteses`) que veio depois do último estado. */
	erro?: ErroVistoAprendiz;
	/** A chave da última ação que valeu para a leitura (estado ou erro de leitura); undefined se nada chegou. */
	chaveDaUltima?: string;
	/** Há uma reflexão rodando agora (o último estado diz que sim, ou um `refletindo` chegou e o `refletiu` ainda não). */
	refletindo: boolean;
	/** Os pedidos que já têm resposta (decidida, refletiu ou erro com o `pedido`). */
	respostas: ReadonlyMap<string, RespostaDoPedido>;
	/** Os pedidos de refletir que a extensão já confirmou que começou (`refletindo`). */
	reconhecidos: ReadonlySet<string>;
	/** O erro de uma reflexão que falhou sem pedido (a automática); apagado quando outra começa ou termina. */
	erroSolto?: ErroVistoAprendiz;
}

/** Lê, em ordem, as ações do painel "aprendiz" que são das hipóteses; as chaves em `ignoradas` (as de antes) não valem. */
export function lerHipoteses(recebidas: readonly AcaoRecebida[], ignoradas: ReadonlySet<string> = new Set()): LidoHipoteses {
	let valor: EstadoHipoteses | undefined;
	let erro: ErroVistoAprendiz | undefined;
	let erroSolto: ErroVistoAprendiz | undefined;
	let chaveDaUltima: string | undefined;
	let refletindo = false;
	const respostas = new Map<string, RespostaDoPedido>();
	const reconhecidos = new Set<string>();
	for (const recebida of recebidas) {
		if (ignoradas.has(recebida.chave)) continue;
		const dados = ehObjeto(recebida.dados) ? recebida.dados : {};
		const pedido = typeof dados.pedido === "string" && dados.pedido ? dados.pedido : undefined;
		switch (recebida.acao) {
			case "hipoteses":
			case "decidida":
			case "refletiu": {
				const estado = estadoDaMensagem(recebida.dados);
				const resumo = resumoValido(dados.resumo);
				if (pedido) respostas.set(pedido, { tipo: "ok", ...(resumo ? { resumo } : {}) });
				if (recebida.acao === "refletiu") {
					refletindo = false;
					erroSolto = undefined;
				}
				if (!estado) break;
				if (recebida.acao === "refletiu" && resumo && !estado.ultimaReflexao) estado.ultimaReflexao = resumo;
				valor = estado;
				erro = undefined;
				chaveDaUltima = recebida.chave;
				if (recebida.acao !== "refletiu") refletindo = estado.refletindo;
				break;
			}
			case "refletindo":
				refletindo = true;
				erroSolto = undefined;
				if (pedido) reconhecidos.add(pedido);
				break;
			case "erro": {
				if (pedido) {
					respostas.set(pedido, { tipo: "erro", mensagem: mensagemDoErro(dados) });
					// Um erro do pedido de uma reflexão que já começou encerra o "refletindo"; antes disso (ela já rodava, por exemplo) não muda nada.
					if (reconhecidos.has(pedido)) refletindo = false;
				} else if (dados.ao === "hipoteses") {
					erro = { chave: recebida.chave, mensagem: mensagemDoErro(dados) };
					valor = undefined;
					chaveDaUltima = recebida.chave;
				} else if (dados.ao === "refletir") {
					erroSolto = { chave: recebida.chave, mensagem: mensagemDoErro(dados) };
					refletindo = false;
				}
				break;
			}
		}
	}
	return {
		...(valor ? { valor } : {}),
		...(erro ? { erro } : {}),
		...(chaveDaUltima ? { chaveDaUltima } : {}),
		refletindo,
		respostas,
		reconhecidos,
		...(erroSolto ? { erroSolto } : {}),
	};
}

/** O que a extensão mandou sobre o histórico, entre as ações que valem. */
export interface LidoHistorico {
	valor?: EventoLido[];
	erro?: ErroVistoAprendiz;
	chaveDaUltima?: string;
}

/** Lê `historico` e o `erro` de `historico` (sem pedido); o último que chegou manda. */
export function lerHistorico(recebidas: readonly AcaoRecebida[], ignoradas: ReadonlySet<string> = new Set()): LidoHistorico {
	let valor: EventoLido[] | undefined;
	let erro: ErroVistoAprendiz | undefined;
	let chaveDaUltima: string | undefined;
	for (const recebida of recebidas) {
		if (ignoradas.has(recebida.chave)) continue;
		if (recebida.acao === "historico") {
			const eventos = eventosDaMensagem(recebida.dados);
			if (!eventos) continue;
			valor = eventos;
			erro = undefined;
			chaveDaUltima = recebida.chave;
		} else if (recebida.acao === "erro") {
			const dados = ehObjeto(recebida.dados) ? recebida.dados : {};
			if (dados.ao !== "historico" || (typeof dados.pedido === "string" && dados.pedido)) continue;
			erro = { chave: recebida.chave, mensagem: mensagemDoErro(dados) };
			valor = undefined;
			chaveDaUltima = recebida.chave;
		}
	}
	return { ...(valor ? { valor } : {}), ...(erro ? { erro } : {}), ...(chaveDaUltima ? { chaveDaUltima } : {}) };
}

// --- O hook de um recurso pedido (hipoteses, historico) -----------------------------------

interface LidoDeRecurso<T> {
	valor?: T;
	erro?: ErroVistoAprendiz;
	chaveDaUltima?: string;
}

interface RecursoAberto<T, L extends LidoDeRecurso<T>> {
	lido: L;
	/** O que mostrar: o valor desta visita (o último que se viu, até a resposta nova); undefined até a primeira resposta ou com um erro. */
	valor?: T;
	erro?: ErroVistoAprendiz;
	/** "Tentar de novo" foi clicado e a resposta ainda não chegou. */
	tentando: boolean;
	/** Pede de novo (o botão "Tentar de novo" e as atualizações). */
	pedir(): void;
	recarregar(): void;
}

/**
 * Pede `acao` ({}) quando `abertura` muda (a aba abriu; undefined = fechada, não pede) e quando a sessão muda. Trocar de
 * sessão zera as ações da ponte; até a resposta nova chegar valem os últimos dados desta visita (nada some na troca).
 */
function useRecurso<T, L extends LidoDeRecurso<T>>(janela: JanelaPerfilHook, abertura: string | undefined, acao: "hipoteses" | "historico", ler: (recebidas: readonly AcaoRecebida[], ignoradas: ReadonlySet<string>) => L): RecursoAberto<T, L> {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	const recebidas = estado.acoesPorPainel[PAINEL_APRENDIZ];
	const antigas = useChavesAntigas(recebidas, sessaoId);
	const lido = useMemo(() => ler(recebidas ?? [], antigas), [ler, recebidas, sessaoId, antigas]);
	const ultimo = useRef<T | undefined>(undefined);
	if (lido.valor !== undefined) ultimo.current = lido.valor;

	const [falha, setFalha] = useState<{ erro: ErroVistoAprendiz; sessao: string | undefined } | undefined>(undefined);
	const [tentando, setTentando] = useState<{ desde: string | undefined } | undefined>(undefined);
	const falhas = useRef(0);
	const ultimaChave = useRef<string | undefined>(undefined);
	ultimaChave.current = lido.chaveDaUltima;
	const sessaoAgora = useRef(sessaoId);
	sessaoAgora.current = sessaoId;

	const pedir = useCallback(() => {
		const sessao = sessaoAgora.current;
		setFalha(undefined);
		enviarComRetentativa(() => acoes.acaoDaInterface(PAINEL_APRENDIZ, acao, {})).catch((motivo: unknown) => {
			setTentando(undefined);
			setFalha({ erro: { chave: `local-${acao}-${++falhas.current}`, mensagem: `Não consegui falar com a sessão: ${(motivo as Error).message}` }, sessao });
		});
	}, [acoes, acao]);
	useEffect(() => {
		if (abertura !== undefined && sessaoId) pedir();
	}, [abertura, sessaoId, pedir]);

	const recarregar = useCallback(() => {
		setTentando({ desde: ultimaChave.current });
		pedir();
	}, [pedir]);

	const falhaDaSessao = falha && falha.sessao === sessaoId ? falha.erro : undefined;
	const erro = falhaDaSessao ?? lido.erro;
	const aindaTentando = tentando !== undefined && !falhaDaSessao && lido.chaveDaUltima === tentando.desde;
	const valor = erro ? undefined : (lido.valor ?? ultimo.current);
	return { lido, ...(valor !== undefined ? { valor } : {}), ...(erro ? { erro } : {}), tentando: aindaTentando, pedir, recarregar };
}

// --- O histórico --------------------------------------------------------------------------

export interface HistoricoAberto {
	/** Os eventos (os mais novos primeiro, como a extensão mandou); undefined até a primeira resposta desta visita. */
	eventos?: EventoLido[];
	erro?: ErroVistoAprendiz;
	tentando: boolean;
	/** Pede de novo (depois de uma reflexão, por exemplo). */
	atualizar(): void;
	recarregar(): void;
}

/** O histórico: pede `historico` a cada vez que a aba abre (`abertura` é o nome dela; undefined = fechada) e quando a sessão troca. */
export function useHistorico(janela: JanelaPerfilHook, abertura: string | undefined): HistoricoAberto {
	const aberto = useRecurso<EventoLido[], LidoHistorico>(janela, abertura, "historico", lerHistorico);
	return { ...(aberto.valor ? { eventos: aberto.valor } : {}), ...(aberto.erro ? { erro: aberto.erro } : {}), tentando: aberto.tentando, atualizar: aberto.pedir, recarregar: aberto.recarregar };
}

// --- As hipóteses e as decisões -----------------------------------------------------------

/** Qual botão do cartão foi clicado (é o que mostra "Salvando…"). */
export type RotuloDaOperacao = "aprovar" | "rejeitar" | "editar" | "reaprovar" | "refletir";

/** O alvo de uma operação: o id da hipótese ou da mudança, ou "refletir". */
export const ALVO_REFLETIR = "refletir";

export type SituacaoDoAlvo = { tipo: "livre" } | { tipo: "salvando"; rotulo: RotuloDaOperacao } | { tipo: "erro"; mensagem: string; rotulo: RotuloDaOperacao };

interface PedidoEmCurso {
	pedido: string;
	rotulo: RotuloDaOperacao;
	sessao: string | undefined;
	/** O envio falhou ou a resposta não veio a tempo. */
	falha?: string;
	/** A resposta, guardada aqui quando chega: a lista de ações da ponte é limitada e a resposta velha sai dela. */
	final?: RespostaDoPedido;
}

export interface HipotesesAbertas {
	/** O estado a mostrar, com `refletindo` já certo; undefined até a primeira resposta desta visita (ou com um erro). */
	estado?: EstadoHipoteses;
	erro?: ErroVistoAprendiz;
	tentando: boolean;
	/** Pede `hipoteses` de novo. */
	atualizar(): void;
	recarregar(): void;
	/** O botão Refletir: há uma reflexão rodando (a daqui ou a automática) e o erro da última tentativa. */
	reflexao: { ocupada: boolean; erro?: string };
	refletir(): void;
	/** A situação de uma operação do cartão (hipótese ou mudança) ou do "refletir". */
	situacao(alvo: string): SituacaoDoAlvo;
	decidir(entrada: { alvo: "hipotese" | "mudanca"; id: string; decisao: "aprovar" | "rejeitar"; rotulo: RotuloDaOperacao; enunciado?: string }): void;
	editar(entrada: { id: string; rotulo: "editar" | "rejeitar" | "reaprovar"; enunciado?: string; status?: "aprovada" | "rejeitada" }): void;
}

/**
 * As hipóteses: pede `hipoteses` quando a aba abre e quando a sessão troca, e manda as operações do Breno (refletir,
 * decidir, editar) cada uma com um `pedido`, esperando a resposta com o mesmo. Um cartão tem uma operação por vez
 * (o alvo é a hipótese ou a mudança); trocar de sessão esquece as que estavam esperando (a resposta delas é da sessão
 * antiga) e o `hipoteses` novo mostra como ficou.
 */
export function useHipoteses(janela: JanelaPerfilHook, abertura: string | undefined): HipotesesAbertas {
	const aberto = useRecurso<EstadoHipoteses, LidoHipoteses>(janela, abertura, "hipoteses", lerHipoteses);
	const { lido } = aberto;
	const { acoes } = janela;
	const sessaoId = janela.estado.sessao?.sessaoId;
	const sessaoAgora = useRef(sessaoId);
	sessaoAgora.current = sessaoId;

	const [pedidos, setPedidos] = useState<Record<string, PedidoEmCurso>>({});
	const doAlvo = (alvo: string): PedidoEmCurso | undefined => {
		const pedido = pedidos[alvo];
		return pedido && pedido.sessao === sessaoId ? pedido : undefined;
	};

	const enviar = useCallback(
		(alvo: string, rotulo: RotuloDaOperacao, acaoDaPonte: "refletir" | "decidir" | "editar", dados: Record<string, unknown>) => {
			// Uma operação por vez no alvo: o clique de um botão que ainda espera não manda outra.
			if (situacaoAgora.current(alvo).tipo === "salvando") return;
			const sessao = sessaoAgora.current;
			const pedido = novoIdDePedido(acaoDaPonte === "refletir" ? "refletir" : "hipotese");
			setPedidos((antes) => ({ ...antes, [alvo]: { pedido, rotulo, sessao } }));
			enviarComRetentativa(() => acoes.acaoDaInterface(PAINEL_APRENDIZ, acaoDaPonte, { ...dados, pedido })).catch(() => {
				setPedidos((antes) => (antes[alvo]?.pedido === pedido ? { ...antes, [alvo]: { ...antes[alvo], falha: AVISO_SESSAO_TROCANDO } as PedidoEmCurso } : antes));
			});
		},
		[acoes],
	);

	const situacaoAgora = useRef<(alvo: string) => SituacaoDoAlvo>(() => ({ tipo: "livre" }));
	const situacao = (alvo: string): SituacaoDoAlvo => {
		const pedido = doAlvo(alvo);
		if (!pedido) return { tipo: "livre" };
		const resposta = pedido.final ?? lido.respostas.get(pedido.pedido);
		if (resposta?.tipo === "ok") return { tipo: "livre" };
		if (resposta?.tipo === "erro") return { tipo: "erro", mensagem: resposta.mensagem, rotulo: pedido.rotulo };
		if (pedido.falha) return { tipo: "erro", mensagem: pedido.falha, rotulo: pedido.rotulo };
		return { tipo: "salvando", rotulo: pedido.rotulo };
	};

	situacaoAgora.current = situacao;

	// Guarda a resposta de cada pedido quando ela chega (a lista de ações guarda só as últimas 50).
	useEffect(() => {
		setPedidos((antes) => {
			let mudou = false;
			const depois = { ...antes };
			for (const [alvo, pedido] of Object.entries(antes)) {
				const resposta = pedido.final ? undefined : lido.respostas.get(pedido.pedido);
				if (!resposta) continue;
				depois[alvo] = { ...pedido, final: resposta };
				mudou = true;
			}
			return mudou ? depois : antes;
		});
	}, [lido.respostas]);

	// Sem resposta no prazo, o cartão diz que o app não confirmou (o refletir já confirmado, com `refletindo`, espera o fim sem prazo).
	const aguardando = Object.entries(pedidos)
		.filter(([alvo, pedido]) => pedido.sessao === sessaoId && !pedido.falha && !pedido.final && !lido.respostas.has(pedido.pedido) && !(alvo === ALVO_REFLETIR && lido.reconhecidos.has(pedido.pedido)))
		.map(([alvo, pedido]) => `${alvo}|${pedido.pedido}`);
	const chaveAguardando = aguardando.join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: a chave resume `aguardando`.
	useEffect(() => {
		const relogios = aguardando.map((item) => {
			const [alvo = "", pedido = ""] = item.split("|");
			return setTimeout(() => {
				setPedidos((antes) => (antes[alvo]?.pedido === pedido && !antes[alvo].falha ? { ...antes, [alvo]: { ...antes[alvo], falha: AVISO_SEM_CONFIRMACAO } as PedidoEmCurso } : antes));
			}, PRAZO_DA_RESPOSTA_MS);
		});
		return () => {
			for (const relogio of relogios) clearTimeout(relogio);
		};
	}, [chaveAguardando]);

	const refletirAgora = situacao(ALVO_REFLETIR);
	const reflexaoErro = refletirAgora.tipo === "erro" ? refletirAgora.mensagem : lido.erroSolto?.mensagem;
	const reflexao = { ocupada: lido.refletindo || refletirAgora.tipo === "salvando", ...(reflexaoErro ? { erro: reflexaoErro } : {}) };

	const estado = useMemo(() => (aberto.valor ? { ...aberto.valor, refletindo: lido.refletindo } : undefined), [aberto.valor, lido.refletindo]);

	return {
		...(estado ? { estado } : {}),
		...(aberto.erro ? { erro: aberto.erro } : {}),
		tentando: aberto.tentando,
		atualizar: aberto.pedir,
		recarregar: aberto.recarregar,
		reflexao,
		refletir: () => {
			if (reflexao.ocupada) return;
			enviar(ALVO_REFLETIR, "refletir", "refletir", {});
		},
		situacao,
		decidir: ({ alvo, id, decisao, rotulo, enunciado }) => enviar(id, rotulo, "decidir", { alvo, id, decisao, ...(enunciado !== undefined ? { enunciado } : {}) }),
		editar: ({ id, rotulo, enunciado, status }) => enviar(id, rotulo, "editar", { id, ...(enunciado !== undefined ? { enunciado } : {}), ...(status ? { status } : {}) }),
	};
}
