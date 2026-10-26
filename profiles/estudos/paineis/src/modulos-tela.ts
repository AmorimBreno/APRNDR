// As partes puras da geração de módulos na visão do curso (item 6, parte A,
// docs/modulos.md, "A tela"): o que cada ModuleCard mostra pelo estado do
// módulo que a extensão mandou, os textos das etapas, o primário do
// formulário "Gerar módulo" e o pedido que ele manda. Sem React e sem o
// design system: os testes (modulos-tela.test.ts) rodam no Node.

import type { EstadoModuloNaTela, MensagemEstadoModulos, SituacaoNaTela } from "../../lib/modulo-tipos.ts";

/** O aviso de custo do formulário. */
export const CUSTO_APROXIMADO = "Custa por volta de US$ 0,10 a 0,30 com o GPT-6.1 Sol.";

/** O que o formulário diz que vai acontecer. */
export const TEXTO_DO_FORMULARIO =
	"O professor planeja as lições e escreve cada uma com os seus materiais e o que o diagnóstico mostrou. Leva alguns minutos; você pode fechar e voltar.";

/** A pergunta de "Gerar de novo": o título do modal e o texto. */
export const PERGUNTA_GERAR_DE_NOVO = { titulo: "Gerar este módulo de novo?", texto: "A versão atual é substituída quando a nova ficar pronta." } as const;

/** Os estados da extensão em que o módulo está sendo gerado. */
export const SITUACOES_GERANDO = ["esperando_materiais", "planejando", "escrevendo"] as const satisfies readonly SituacaoNaTela[];

export const estaGerando = (situacao: SituacaoNaTela | undefined): boolean => (SITUACOES_GERANDO as readonly (SituacaoNaTela | undefined)[]).includes(situacao);

/** O que o card de um módulo mostra. */
export type TipoCard =
	/** O próximo, ainda sem arquivo: "Gerar módulo". */
	| "gerar"
	/** Sendo gerado: a etapa, a barra e "Parar". */
	| "gerando"
	/** Gerado: "Gerado", as lições e as questões, "Abrir" (parte B) e "Gerar de novo". */
	| "gerado"
	/** Aguardando material: a etiqueta, a nota e "Gerar agora". */
	| "aguardando"
	/** A última geração falhou: a mensagem e "Tentar de novo". */
	| "erro"
	/** Depois do próximo: bloqueado. */
	| "bloqueado"
	/** O estado ainda não chegou. */
	| "carregando";

/** O state do ModuleCard: current só durante a geração; done (o holográfico) é do módulo estudado, que ainda não existe. */
export type EstadoDoCard = "next" | "current" | "locked";

export interface CardModulo {
	tipo: TipoCard;
	state: EstadoDoCard;
	/** O estado que a extensão mandou para o módulo, se veio. */
	modulo?: EstadoModuloNaTela;
}

/** O módulo já tem um arquivo (gerado ou aguardando material), ou tinha um antes desta geração. */
const temArquivo = (modulo: EstadoModuloNaTela | undefined) =>
	modulo !== undefined && (modulo.situacao === "gerado" || modulo.situacao === "aguardando_material" || typeof modulo.geradoEm === "string");

/**
 * O próximo módulo pela tela (docs/modulos.md, "Qual módulo pode ser
 * gerado"): o primeiro na ordem do esqueleto que não está gerado nem
 * aguardando material. Um módulo sendo gerado (ou com erro) sem arquivo
 * continua sendo o próximo. Todos com arquivo: null.
 */
export function proximoDaTela(ordem: readonly string[], estado: Pick<MensagemEstadoModulos, "modulos">): string | null {
	const porId = new Map(estado.modulos.map((modulo) => [modulo.id, modulo]));
	return ordem.find((id) => !temArquivo(porId.get(id))) ?? null;
}

/**
 * O card de cada módulo, na ordem do esqueleto. Sem estado (ainda não
 * chegou): o primeiro "carregando" como próximo e os outros bloqueados, como
 * antes da geração existir. Com estado:
 * - sendo gerado (esperando os materiais, planejando ou escrevendo): current;
 * - gerado, aguardando material ou com erro: next (liberado);
 * - sem arquivo: o próximo é next com "Gerar módulo"; os seguintes, locked.
 */
export function cardsDosModulos(ordem: readonly string[], estado: Pick<MensagemEstadoModulos, "modulos"> | undefined): Record<string, CardModulo> {
	const saida: Record<string, CardModulo> = {};
	if (!estado) {
		ordem.forEach((id, indice) => {
			saida[id] = indice === 0 ? { tipo: "carregando", state: "next" } : { tipo: "bloqueado", state: "locked" };
		});
		return saida;
	}
	const porId = new Map(estado.modulos.map((modulo) => [modulo.id, modulo]));
	const proximo = proximoDaTela(ordem, estado);
	for (const id of ordem) {
		const modulo = porId.get(id);
		const comModulo = modulo ? { modulo } : {};
		if (modulo && estaGerando(modulo.situacao)) saida[id] = { tipo: "gerando", state: "current", ...comModulo };
		else if (modulo?.situacao === "gerado") saida[id] = { tipo: "gerado", state: "next", ...comModulo };
		else if (modulo?.situacao === "aguardando_material") saida[id] = { tipo: "aguardando", state: "next", ...comModulo };
		else if (modulo?.situacao === "erro") saida[id] = { tipo: "erro", state: "next", ...comModulo };
		else if (id === proximo) saida[id] = { tipo: "gerar", state: "next", ...comModulo };
		else saida[id] = { tipo: "bloqueado", state: "locked", ...comModulo };
	}
	return saida;
}

/** "a", "a e b", "a, b e c". */
export function listarNomes(nomes: readonly string[]): string {
	if (nomes.length <= 1) return nomes[0] ?? "";
	return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/** O nome do arquivo de um caminho ("materias/x/materiais/aula-05.pdf" vira "aula-05.pdf"). */
const nomeDoArquivo = (caminho: string) => caminho.split(/[\\/]/).pop() ?? caminho;

/** O texto da etapa de um módulo sendo gerado; fora da geração, undefined. */
export function textoDaEtapa(modulo: Pick<EstadoModuloNaTela, "situacao" | "esperando" | "licao" | "licoes">): string | undefined {
	switch (modulo.situacao) {
		case "esperando_materiais": {
			const esperando = (modulo.esperando ?? []).map(nomeDoArquivo).filter(Boolean);
			return esperando.length ? `Esperando o processamento de ${listarNomes(esperando)}` : "Esperando o processamento dos materiais";
		}
		case "planejando":
			return "Planejando as lições…";
		case "escrevendo":
			return modulo.licao && modulo.licoes ? `Escrevendo a lição ${modulo.licao} de ${modulo.licoes}` : "Escrevendo as lições…";
		default:
			return undefined;
	}
}

/**
 * Quanto da geração andou (0 a 1), para a barra discreta do card: esperar os
 * materiais é o começo, o plano é uma chamada, e cada lição é uma parte igual
 * do resto (a lição sendo escrita ainda não conta). Fora da geração,
 * undefined.
 */
export function progressoDaEtapa(modulo: Pick<EstadoModuloNaTela, "situacao" | "licao" | "licoes">): number | undefined {
	switch (modulo.situacao) {
		case "esperando_materiais":
			return 0.05;
		case "planejando":
			return 0.15;
		case "escrevendo": {
			if (!modulo.licao || !modulo.licoes || modulo.licoes <= 0) return 0.15;
			const feitas = Math.min(Math.max(modulo.licao - 1, 0), modulo.licoes);
			return 0.15 + 0.85 * (feitas / modulo.licoes);
		}
		default:
			return undefined;
	}
}

const contar = (quantos: number, um: string, varios: string) => `${quantos} ${quantos === 1 ? um : varios}`;

/** "3 lições · 8 questões" de um módulo gerado (o que veio). */
export function resumoDoGerado(modulo: Pick<EstadoModuloNaTela, "licoesGeradas" | "questoes">): string {
	return [
		typeof modulo.licoesGeradas === "number" ? contar(modulo.licoesGeradas, "lição", "lições") : "",
		typeof modulo.questoes === "number" ? contar(modulo.questoes, "questão", "questões") : "",
	]
		.filter(Boolean)
		.join(" · ");
}

/** O texto da ação no rodapé do card. */
export function acaoDoCard(tipo: TipoCard): string | undefined {
	switch (tipo) {
		case "gerar":
			return "Gerar módulo";
		case "gerando":
			return "Gerando";
		case "gerado":
			return "Abrir";
		case "aguardando":
			return "Gerar agora";
		case "erro":
			return "Tentar de novo";
		case "carregando":
			return "Carregando…";
		case "bloqueado":
			return undefined;
	}
}

// --- O formulário ------------------------------------------------------------------

/** "Gerar o módulo 03 · Derivadas". */
export const tituloDoFormulario = (numero: number, nome: string) => `Gerar o módulo ${String(numero).padStart(2, "0")} · ${nome}`;

/** O primário do formulário: marcar como aguardando, ou gerar. */
export const primarioDoFormulario = (semMaterial: boolean) => (semMaterial ? "Marcar como aguardando material" : "Gerar módulo");

/** O que o formulário manda em gerar (tudo opcional). */
export interface CamposPedido {
	informacoes?: string;
	observacoes?: string;
	/** Os nomes dos arquivos (dentro de materiais/) mandados pelo formulário. */
	materiaisNovos?: string[];
}

/**
 * Acrescenta aos nomes já mandados pelo formulário os arquivos que o servidor
 * gravou agora (os caminhos relativos à pasta de dados que enviarMateriais
 * devolve, dentro da pasta de materiais da matéria). Fica o caminho dentro de
 * materiais/, sem repetir, na ordem. Os arquivos que já estavam lá, iguais,
 * não são gravados nem entram.
 */
export function nomesMandados(atuais: readonly string[], gravados: readonly string[], pasta: string): string[] {
	const prefixo = `${pasta.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
	const saida = [...atuais];
	for (const gravado of gravados) {
		const caminho = gravado.replace(/\\/g, "/");
		const nome = caminho.startsWith(prefixo) ? caminho.slice(prefixo.length) : nomeDoArquivo(caminho);
		if (nome && !saida.includes(nome)) saida.push(nome);
	}
	return saida;
}

/** Os campos do formulário como vão para gerar: textos aparados, e o que está vazio fica de fora. */
export function camposDoPedido(formulario: { informacoes: string; observacoes: string; materiaisNovos: readonly string[] }): CamposPedido {
	const informacoes = formulario.informacoes.trim();
	const observacoes = formulario.observacoes.trim();
	return {
		...(informacoes ? { informacoes } : {}),
		...(observacoes ? { observacoes } : {}),
		...(formulario.materiaisNovos.length ? { materiaisNovos: [...formulario.materiaisNovos] } : {}),
	};
}
