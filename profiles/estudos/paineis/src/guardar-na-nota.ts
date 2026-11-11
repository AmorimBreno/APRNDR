// "Ir ao trecho" e "Guardar na nota" na conversa do professor (parte C1, WP3;
// docs/mesa-parte-c.md, seção 5): as decisões puras, sem React, para testar sem a tela.
// - qual resposta recebe o rodapé "Ir ao trecho" e para onde ele leva;
// - qual é a nota-alvo do "Guardar na nota" e o que dizer quando o editor recusa;
// - esperar a resposta da ponte de notas ao pedido de guardar (pelo id do pedido).
// Nada aqui toca disco: a gravação é da extensão de notas (extensions/notas.ts) ou do
// salvamento automático do editor.

import type { AcaoRecebida, ItemConversa } from "@estudos/ui";
import { abaDoCaminho } from "./abas-mesa.ts";
import type { MotivoRecusaInserir } from "./vendo.ts";
import { lerOrigem } from "./origem-mesa.ts";

type ItemAssistente = Extract<ItemConversa, { tipo: "assistente" }>;
type ItemUsuario = Extract<ItemConversa, { tipo: "usuario" }>;

/** A resposta aparece na conversa? (mensagem que só chamou ferramentas não vira bloco: packages/ui/src/visual/Conversa.tsx, semConteudo). */
const aparece = (item: ItemAssistente) => item.emAndamento || Boolean(item.texto) || Boolean(item.raciocinio) || Boolean(item.erro);

/**
 * A resposta `chave` é a última de assistente do turno (o que vai da mensagem do usuário à próxima)?
 * Um turno com ferramentas tem várias respostas; só a última recebe o "Ir ao trecho". No turno que
 * ainda está em andamento (`executando`), ainda não se sabe qual é a última: ninguém recebe.
 */
export function ultimaRespostaDoTurno(conversa: readonly ItemConversa[], chave: string, executando: boolean): boolean {
	const indice = conversa.findIndex((item) => item.chave === chave);
	const item = conversa[indice];
	if (!item || item.tipo !== "assistente" || item.emAndamento) return false;
	for (const depois of conversa.slice(indice + 1)) {
		if (depois.tipo === "usuario") return true;
		if (depois.tipo === "assistente" && aparece(depois)) return false;
	}
	return !executando;
}

/** Para onde "Ir ao trecho" leva: a origem do contexto em foco da pergunta (com a âncora) e o trecho citado. */
export interface AlvoIrAoTrecho {
	origem: string;
	trecho?: string;
}

/**
 * O alvo do "Ir ao trecho" da pergunta, ou undefined (sem botão): a pergunta precisa ter o contexto
 * em foco, de uma aba (nota ou lição) desta matéria, e ter apontado um trecho (o texto citado ou o
 * bloco da âncora). Uma pergunta só sobre "a aba aberta" não tem trecho a que voltar.
 */
export function alvoDoIrAoTrecho(pergunta: ItemUsuario | undefined, materiaId: string): AlvoIrAoTrecho | undefined {
	const foco = pergunta?.contextosTela?.find((contexto) => contexto.foco === true);
	if (!foco?.origem) return undefined;
	const { rota, ancora } = lerOrigem(foco.origem);
	if (!abaDoCaminho(rota) || rota.split("/")[1] !== materiaId) return undefined;
	const trecho = foco.selecao && foco.selecao.trim() !== "" ? foco.selecao : undefined;
	if (!trecho && !ancora?.bloco) return undefined;
	return { origem: foco.origem, ...(trecho ? { trecho } : {}) };
}

/** A nota da aba em foco: o título (que é o nome do arquivo) e a chave da aba. undefined se a aba não é uma nota desta matéria. */
export function notaDaAba(chaveFoco: string | undefined, materiaId: string): { titulo: string; chave: string } | undefined {
	if (!chaveFoco) return undefined;
	const aba = abaDoCaminho(chaveFoco);
	if (aba?.tipo !== "nota" || aba.chave.split("/")[1] !== materiaId) return undefined;
	return { titulo: aba.chave.split("/").slice(3).join("/"), chave: aba.chave };
}

/** A chave da aba de uma nota da matéria (a mesma de abaDoCaminho). */
export const chaveDaNota = (materiaId: string, titulo: string) => `caderno/${materiaId}/notas/${titulo}`;

/** O que dizer quando o editor da nota recusa receber o trecho. */
export function avisoDaRecusa(motivo: MotivoRecusaInserir): string {
	switch (motivo) {
		case "conflito":
			return "A nota mudou em outro lugar. Resolva o conflito nela e guarde de novo.";
		case "somente-leitura":
			return "Esta nota está só para leitura: não dá para guardar nela.";
		case "salvando":
			return "A nota está salvando. Tente de novo em instantes.";
		case "sem-nota":
			return "A nota ainda está abrindo. Tente de novo em instantes.";
		case "vazio":
			return "Não havia nada para guardar neste bloco.";
	}
}

/** O aviso quando a ponte falha ao mandar o pedido (a troca de sessão faz o envio lançar). */
export const AVISO_SESSAO_TROCANDO = "A conversa está trocando. Tente de novo em instantes.";
export const AVISO_SEM_SESSAO = "A conversa ainda está abrindo. Tente de novo em instantes.";
export const AVISO_SEM_RESPOSTA = "O app não confirmou. Confira a nota antes de guardar de novo.";

/** Quanto esperar antes da segunda tentativa de um envio que lançou. */
export const ESPERA_RETENTATIVA_MS = 400;

/** Quanto esperar a resposta da ponte ao pedido de guardar (ou de criar a nota). */
export const PRAZO_RESPOSTA_MS = 15_000;
const PASSO_RESPOSTA_MS = 50;

const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/**
 * Manda uma ação pela ponte; se o envio lançar (a janela troca de sessão), espera um pouco e tenta
 * uma vez mais. Falhando de novo, lança o erro da segunda tentativa.
 */
export async function enviarComRetentativa(enviar: () => Promise<void>, espera = ESPERA_RETENTATIVA_MS): Promise<void> {
	try {
		await enviar();
	} catch {
		await esperar(espera);
		await enviar();
	}
}

/** A resposta da extensão de notas a um pedido de guardar: o que foi guardado, ou por que não. */
export type DesfechoDoGuardar = { ok: true; materia: string; titulo: string } | { ok: false; mensagem: string };

/** Procura, entre as ações que não existiam antes do pedido, a resposta dele (`guardada` ou `erro` com o mesmo pedido). */
export function respostaDoPedido(recebidas: readonly AcaoRecebida[], vistas: ReadonlySet<string>, pedido: string): DesfechoDoGuardar | undefined {
	for (const recebida of recebidas) {
		if (vistas.has(recebida.chave)) continue;
		const dados = (recebida.dados ?? {}) as { pedido?: unknown; materia?: unknown; titulo?: unknown; mensagem?: unknown; ao?: unknown };
		if (dados.pedido !== pedido) continue;
		if (recebida.acao === "guardada" && typeof dados.materia === "string" && typeof dados.titulo === "string") return { ok: true, materia: dados.materia, titulo: dados.titulo };
		if (recebida.acao === "erro") return { ok: false, mensagem: typeof dados.mensagem === "string" && dados.mensagem ? dados.mensagem : "Não consegui guardar o trecho na nota." };
	}
	return undefined;
}

/** A resposta ao pedido de criar uma nota: criada, ou a mensagem do erro. */
export type DesfechoDoCriar = { ok: true; titulo: string } | { ok: false; mensagem: string };

/** Procura a resposta da extensão a "criar" a nota `titulo` na matéria (`criada` ou `erro` ao criar), entre as ações novas. */
export function respostaDoCriar(recebidas: readonly AcaoRecebida[], vistas: ReadonlySet<string>, materia: string, titulo: string): DesfechoDoCriar | undefined {
	for (const recebida of recebidas) {
		if (vistas.has(recebida.chave)) continue;
		const dados = (recebida.dados ?? {}) as { materia?: unknown; titulo?: unknown; mensagem?: unknown; ao?: unknown };
		if (dados.materia !== materia) continue;
		const mesmo = typeof dados.titulo === "string" && dados.titulo.toLowerCase() === titulo.toLowerCase();
		if (recebida.acao === "criada" && mesmo) return { ok: true, titulo: dados.titulo as string };
		if (recebida.acao === "erro" && dados.ao === "criar" && mesmo) return { ok: false, mensagem: typeof dados.mensagem === "string" ? dados.mensagem : "Não consegui criar a nota." };
	}
	return undefined;
}

/**
 * Espera uma resposta aparecer nas ações do painel: lê as ações de agora a cada passo (a janela muda
 * por fora) até achar uma, ou até o prazo (undefined).
 */
export async function esperarAcao<T>(
	ler: () => readonly AcaoRecebida[],
	procurar: (recebidas: readonly AcaoRecebida[]) => T | undefined,
	prazoMs = PRAZO_RESPOSTA_MS,
	passoMs = PASSO_RESPOSTA_MS,
): Promise<T | undefined> {
	const limite = Date.now() + prazoMs;
	for (;;) {
		const achado = procurar(ler());
		if (achado !== undefined) return achado;
		if (Date.now() >= limite) return undefined;
		await esperar(passoMs);
	}
}

let contador = 0;
/** Um id de pedido único (a extensão o devolve na resposta). */
export function novoIdDePedido(): string {
	contador += 1;
	return `guardar-${Date.now().toString(36)}-${contador}`;
}
