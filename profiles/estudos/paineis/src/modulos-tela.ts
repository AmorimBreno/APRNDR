// As partes puras da geração de módulos na visão do curso (item 6, parte A,
// docs/modulos.md, "A tela" e "O card de cada módulo"): o que cada ModuleCard
// mostra pelo estado do módulo que a extensão mandou (a cor, a etiqueta
// "Próximo" do recomendado, o enchimento durante a geração e as classes do
// perfil por cima do card), os textos das etapas, o primário do formulário
// "Gerar módulo", o pedido que ele manda e as questões feitas do gerado. Sem React e sem o design system:
// os testes (modulos-tela.test.ts) rodam no Node.

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
	/** Não gerado: "Gerar módulo". */
	| "gerar"
	/** Sendo gerado: o enchimento, a etapa e "Parar". */
	| "gerando"
	/** Gerado e não concluído: "Abrir"; embaixo, "Gerado", as lições e as questões e "Gerar de novo". */
	| "gerado"
	/** Concluído: o holográfico, "Rever". */
	| "concluido"
	/** Aguardando material: a etiqueta, a nota e "Gerar agora". */
	| "aguardando"
	/** A última geração falhou: a mensagem e "Tentar de novo". */
	| "erro"
	/** O estado ainda não chegou. */
	| "carregando";

/** O state do ModuleCard: done (o holográfico) no concluído; next (o material musgo) em todos os outros, com o preto por classe. Nada fica locked. */
export type EstadoDoCard = "done" | "next";

/** A cor do card: holográfico no concluído, musgo no gerado, preto no que não foi gerado (que se enche de musgo durante a geração). */
export type CorDoCard = "holografico" | "musgo" | "preto";

export interface CardModulo {
	tipo: TipoCard;
	state: EstadoDoCard;
	cor: CorDoCard;
	/** O recomendado leva a etiqueta "Próximo" do ModuleCard; nenhum outro leva. */
	recomendado: boolean;
	/** Durante a geração: quanto do card preto já está musgo, de 0 a 1 (progressoDaEtapa). */
	enchimento?: number;
	/** O estado que a extensão mandou para o módulo, se veio. */
	modulo?: EstadoModuloNaTela;
}

/** O módulo foi gerado e concluído. */
const concluido = (modulo: EstadoModuloNaTela | undefined) => modulo?.situacao === "gerado" && modulo.concluido === true;

/**
 * O recomendado pela tela (docs/modulos.md, "Qual módulo pode ser gerado"):
 * o primeiro na ordem do esqueleto que não está concluído e não está
 * aguardando material, gerado ou não (um módulo que não veio no estado conta
 * como não gerado). Todos concluídos ou aguardando: null. A tela usa o
 * `proximo` da extensão quando ele vem (ela lê o disco, mesmo durante uma
 * geração); este é o de reserva.
 */
export function proximoDaTela(ordem: readonly string[], estado: Pick<MensagemEstadoModulos, "modulos">): string | null {
	const porId = new Map(estado.modulos.map((modulo) => [modulo.id, modulo]));
	return ordem.find((id) => !concluido(porId.get(id)) && porId.get(id)?.situacao !== "aguardando_material") ?? null;
}

/**
 * O card de cada módulo, na ordem do esqueleto (docs/modulos.md, "O card de
 * cada módulo"). Sem estado (ainda não chegou): todos carregando, pretos e
 * sem etiqueta. Com estado:
 * - sendo gerado (esperando os materiais, planejando ou escrevendo): preto,
 *   enchendo de musgo pelo progresso;
 * - concluído: done (holográfico);
 * - gerado e não concluído: musgo;
 * - aguardando material: preto;
 * - erro: musgo se há uma versão gravada (geradoEm), senão preto;
 * - não gerado: preto, "Gerar módulo".
 * O recomendado (o `proximo` da extensão, ou proximoDaTela) leva a
 * etiqueta "Próximo", em qualquer cor menos no concluído.
 */
export function cardsDosModulos(ordem: readonly string[], estado: Pick<MensagemEstadoModulos, "modulos" | "proximo"> | undefined): Record<string, CardModulo> {
	const saida: Record<string, CardModulo> = {};
	if (!estado) {
		for (const id of ordem) saida[id] = { tipo: "carregando", state: "next", cor: "preto", recomendado: false };
		return saida;
	}
	const porId = new Map(estado.modulos.map((modulo) => [modulo.id, modulo]));
	const recomendado = estado.proximo !== undefined ? estado.proximo : proximoDaTela(ordem, estado);
	for (const id of ordem) {
		const modulo = porId.get(id);
		const comModulo = modulo ? { modulo } : {};
		const base = { recomendado: id === recomendado, ...comModulo };
		if (modulo && estaGerando(modulo.situacao)) saida[id] = { tipo: "gerando", state: "next", cor: "preto", enchimento: progressoDaEtapa(modulo) ?? 0, ...base };
		else if (concluido(modulo)) saida[id] = { tipo: "concluido", state: "done", cor: "holografico", ...base, recomendado: false };
		else if (modulo?.situacao === "gerado") saida[id] = { tipo: "gerado", state: "next", cor: "musgo", ...base };
		else if (modulo?.situacao === "aguardando_material") saida[id] = { tipo: "aguardando", state: "next", cor: "preto", ...base };
		else if (modulo?.situacao === "erro") saida[id] = { tipo: "erro", state: "next", cor: typeof modulo.geradoEm === "string" ? "musgo" : "preto", ...base };
		else saida[id] = { tipo: "gerar", state: "next", cor: "preto", ...base };
	}
	return saida;
}

/**
 * As classes do perfil por cima do ModuleCard (estilo.css, "O card de cada
 * módulo"): mod__card sempre; --preto no que não foi gerado (com --enchendo
 * durante a geração); --sem-proximo esconde a etiqueta "Próximo" do state
 * next em quem não é o recomendado.
 */
export function classesDoCard(card: Pick<CardModulo, "state" | "cor" | "recomendado" | "enchimento">): string {
	return [
		"mod__card",
		card.cor === "preto" ? "mod__card--preto" : "",
		card.cor === "preto" && card.enchimento !== undefined ? "mod__card--enchendo" : "",
		card.state === "next" && !card.recomendado ? "mod__card--sem-proximo" : "",
	]
		.filter(Boolean)
		.join(" ");
}

/** O enchimento do card como a variável --mod-enchimento (de 0 a 1), só durante a geração. */
export function estiloDoCard(card: Pick<CardModulo, "enchimento">): Record<string, string> | undefined {
	if (card.enchimento === undefined) return undefined;
	return { "--mod-enchimento": String(Math.min(Math.max(card.enchimento, 0), 1)) };
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
 * Quanto da geração andou (0 a 1), para o enchimento do card
 * (docs/modulos.md, "O card de cada módulo"): esperando os materiais ≈ 5 %,
 * planejando ≈ 10 %, escrevendo a lição i de n ≈ 10 + 90 × (i − 1) / n % (a
 * lição sendo escrita ainda não conta); gravado, o card já é musgo inteiro.
 * Fora da geração, undefined.
 */
export function progressoDaEtapa(modulo: Pick<EstadoModuloNaTela, "situacao" | "licao" | "licoes">): number | undefined {
	switch (modulo.situacao) {
		case "esperando_materiais":
			return 0.05;
		case "planejando":
			return 0.1;
		case "escrevendo": {
			if (!modulo.licao || !modulo.licoes || modulo.licoes <= 0) return 0.1;
			const feitas = Math.min(Math.max(modulo.licao - 1, 0), modulo.licoes);
			return 0.1 + 0.9 * (feitas / modulo.licoes);
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

/** "3 de 12 questões feitas" (o progresso do estado: pergunta, quiz e dissertativa); sem progresso, ou sem questão, "". */
export function textoDasFeitas(progresso: EstadoModuloNaTela["progresso"]): string {
	if (!progresso || typeof progresso.feitas !== "number" || typeof progresso.questoes !== "number" || progresso.questoes <= 0) return "";
	return `${progresso.feitas} de ${progresso.questoes} ${progresso.questoes === 1 ? "questão feita" : "questões feitas"}`;
}

/** O texto da ação no rodapé do card. */
export function acaoDoCard(tipo: TipoCard): string {
	switch (tipo) {
		case "gerar":
			return "Gerar módulo";
		case "gerando":
			return "Gerando";
		case "gerado":
			return "Abrir";
		case "concluido":
			return "Rever";
		case "aguardando":
			return "Gerar agora";
		case "erro":
			return "Tentar de novo";
		case "carregando":
			return "Carregando…";
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
