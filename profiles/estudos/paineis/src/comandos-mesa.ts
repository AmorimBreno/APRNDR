// O consumidor dos comandos do professor na mesa (parte C1; docs/mesa-parte-c.md, B2 e
// seção 4). Puro e sem React: a mesa (MesaEstudo.tsx) chama novosComandos a cada mudança
// das ações do painel "mesa" e executa o que sair daqui.
//
// Regras: as chaves que já existiam ao montar e a cada troca de sessão são histórico e
// nunca executam (o padrão do pedirNota); o mesmo `id` não executa duas vezes; só a aba
// do navegador visível e com foco reage (as outras só marcam como vistas). Com a mesa
// desmontada o comando se perde (aceito, e escrito no contrato).

import type { AcaoRecebida } from "@estudos/ui";
import { ACAO_COMANDO_MESA, type ComandoMesa, LIMITE_TRECHO_DESTAQUE } from "../../lib/mesa-tipos.ts";

export interface EstadoComandos {
	/** A sessão em que as chaves foram vistas. */
	sessao: string | undefined;
	/** As chaves de ação já vistas (executadas ou não). */
	vistas: ReadonlySet<string>;
	/** Os ids de comando já executados. */
	executados: ReadonlySet<string>;
}

/** O comando, se os dados têm a forma certa; senão undefined (ignorado em silêncio). */
export function lerComando(dados: unknown): ComandoMesa | undefined {
	if (typeof dados !== "object" || dados === null) return undefined;
	const d = dados as Record<string, unknown>;
	if (typeof d.id !== "string" || !d.id || typeof d.caminho !== "string" || !d.caminho) return undefined;
	if (d.cmd === "abrir") {
		if ((d.tipo !== "nota" && d.tipo !== "licao") || typeof d.rotulo !== "string") return undefined;
		return { cmd: "abrir", id: d.id, tipo: d.tipo, caminho: d.caminho, rotulo: d.rotulo, foco: "previa" };
	}
	if (d.cmd === "destacar") {
		if (typeof d.trecho !== "string" || !d.trecho.trim() || d.trecho.length > LIMITE_TRECHO_DESTAQUE) return undefined;
		return { cmd: "destacar", id: d.id, caminho: d.caminho, trecho: d.trecho, soRolar: d.soRolar === true };
	}
	return undefined;
}

/**
 * As ações novas do painel que viram comandos a executar agora. Primeira vez (sem estado) ou
 * outra sessão: tudo o que está na lista vira histórico e nada executa. `podeReagir` falso
 * (aba do navegador escondida ou sem foco): as novas são marcadas como vistas e não executam.
 */
export function novosComandos(
	anterior: EstadoComandos | undefined,
	sessao: string | undefined,
	recebidas: readonly AcaoRecebida[],
	podeReagir: boolean,
): { estado: EstadoComandos; comandos: ComandoMesa[] } {
	if (!anterior || anterior.sessao !== sessao) {
		return { estado: { sessao, vistas: new Set(recebidas.map((recebida) => recebida.chave)), executados: anterior?.executados ?? new Set() }, comandos: [] };
	}
	const novas = recebidas.filter((recebida) => !anterior.vistas.has(recebida.chave));
	if (novas.length === 0) return { estado: anterior, comandos: [] };
	const vistas = new Set(anterior.vistas);
	const executados = new Set(anterior.executados);
	const comandos: ComandoMesa[] = [];
	for (const recebida of novas) {
		vistas.add(recebida.chave);
		if (recebida.acao !== ACAO_COMANDO_MESA) continue;
		const comando = lerComando(recebida.dados);
		if (!comando || executados.has(comando.id)) continue;
		executados.add(comando.id);
		if (podeReagir) comandos.push(comando);
	}
	// As chaves que saíram da lista (limite de ações por painel) não voltam: não precisam ficar guardadas.
	const presentes = new Set(recebidas.map((recebida) => recebida.chave));
	for (const chave of vistas) if (!presentes.has(chave)) vistas.delete(chave);
	return { estado: { sessao, vistas, executados }, comandos };
}
