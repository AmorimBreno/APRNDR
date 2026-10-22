// Tipos e regras do mapa de conteúdo (item 4.4, docs/mapa-conteudo.md) sem
// nada do Node: a tela (profiles/estudos/paineis) importa daqui para mostrar
// uma operação na hora, e a extensão aplica as mesmas funções em fila antes de
// gravar; mapa.ts reexporta. O mapa é materias/<id>/mapa-conteudo.json.
//
// Todas as funções daqui são puras: recebem o mapa e devolvem um mapa novo,
// sem mexer no que receberam.

import type { TipoCurso } from "./curso-tipos.ts";

/** Muda quando o formato do mapa-conteudo.json mudar. */
export const VERSAO_MAPA = 1;

/** O painel da ponte de eventos (docs/ponte-de-eventos.md). */
export const PAINEL_MAPA = "mapa";

/** Até quantos caracteres de trechos vão numa chamada ao modelo. */
export const LIMITE_PARTE = 120_000;

export const PRIORIDADES = ["alta", "normal", "baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/** rascunho: nunca aprovado; alterado: já foi aprovado e mudou depois. */
export type SituacaoMapa = "rascunho" | "aprovado" | "alterado";

/**
 * material: veio de um mapeamento; usuario: escrito à mão pelo Breno; tema:
 * veio do mapa montado a partir do tema de um curso (docs/cursos.md, "Mapa a
 * partir do tema"). "tema" é só um valor novo: a versão do formato continua 1.
 */
export type OrigemConceito = "material" | "usuario" | "tema";

/** Onde um conceito aparece. */
export interface Referencia {
	/** Caminho dentro de materiais/, com barras normais (o mesmo do manifesto do .extraido). */
	arquivo: string;
	/** O local do trecho no manifesto ("página 12"). */
	local: string;
	/** O nome do trecho no manifesto ("pagina-012"). */
	trecho: string;
}

export interface Conceito {
	/** c- + 12 dígitos base 36 de milissegundos + - + 4 hex aleatórios (novoIdConceito). */
	id: string;
	nome: string;
	descricao: string;
	referencias: Referencia[];
	prioridade: Prioridade;
	origem: OrigemConceito;
	/** ISO 8601. */
	criadoEm: string;
	/** O Breno tirou do mapa. Só aparece quando é verdadeiro. */
	fora?: true;
	/** Entrou por um mapeamento (ou pelo tema) depois da primeira aprovação. Só aparece quando é verdadeiro; toda aprovação limpa. */
	novo?: true;
}

/** Um arquivo já mapeado, com o hash do manifesto do .extraido no momento do mapeamento. */
export interface ArquivoMapeado {
	hash: string;
	/** ISO 8601. */
	mapeadoEm: string;
	/** provedor/id do modelo. */
	modelo: string;
	/** US$ do mapeamento (todas as partes). */
	custo: number;
	/** Quantos conceitos do mapa citam o arquivo. */
	conceitos: number;
}

/** O mapa-conteudo.json. */
export interface MapaConteudo {
	versao: typeof VERSAO_MAPA;
	situacao: SituacaoMapa;
	/** ISO 8601; existe desde a primeira aprovação. */
	aprovadoEm?: string;
	/** A ordem do array é a ordem do mapa, inclusive dos que estão fora. */
	conceitos: Conceito[];
	/** Por caminho dentro de materiais/. */
	arquivos: Record<string, ArquivoMapeado>;
}

/** O que o modelo devolve para um arquivo (ou uma parte dele): os conceitos na ordem em que aparecem. */
export interface ResultadoMapeador {
	conceitos: Array<{
		/** O id de um conceito do mapa, ou null para um conceito novo. */
		id: string | null;
		nome: string;
		descricao: string;
		/** O local de cada trecho em que o conceito aparece. */
		locais: string[];
	}>;
}

/** As operações da revisão que a tela manda (docs/mapa-conteudo.md, "Operações da revisão"). */
export type Operacao =
	| { tipo: "tirar"; id: string }
	| { tipo: "trazer"; id: string }
	| { tipo: "prioridade"; id: string; valor: Prioridade }
	/** depoisDe: o id do conceito que fica antes; null = primeiro. */
	| { tipo: "mover"; id: string; depoisDe: string | null }
	| { tipo: "editar"; id: string; nome?: string; descricao?: string }
	/** O id é gerado pela tela (novoIdConceito). depoisDe: id; null = primeiro; ausente = no fim. */
	| { tipo: "adicionar"; id: string; nome: string; descricao?: string; depoisDe?: string | null }
	/** Só um conceito de origem usuario ou tema. */
	| { tipo: "apagar"; id: string };

export type TipoOperacao = Operacao["tipo"];

// --- Ponte (painel "mapa") ---------------------------------------------------

/** Os dados de cada ação da tela para a extensão (interface:acao, painel mapa). */
export interface AcoesMapa {
	abrir: { materia: string };
	/** Sem arquivos, todos os pendentes. */
	mapear: { materia: string; arquivos?: string[] };
	refazer: { materia: string };
	/** Para o mapeamento em andamento e esvazia a fila da matéria (o que já foi fundido fica). */
	cancelar: { materia: string };
	operar: { materia: string; edicao: string; pedido: string; operacoes: Operacao[] };
	aprovar: { materia: string; pedido: string };
	/** Monta o mapa a partir do tema de um curso (docs/cursos.md): tema = o nome do curso; tipo e motivo vêm do Objetivo. */
	do_tema: { materia: string; pedido: string; tema: string; tipo?: TipoCurso; motivo?: string };
}

export type AcaoMapa = keyof AcoesMapa;

/** Um arquivo esperando mapeamento, como a tela mostra. */
export interface PendenteMapa {
	arquivo: string;
	/** O tipo do manifesto (pdf, python, notebook, texto). */
	tipo: string;
	caracteres: number;
	partes: number;
	/** US$, pelo preço do modelo; null se o preço não for conhecido. */
	custoEstimado: number | null;
}

/** O mapeamento em andamento. */
export interface AndamentoMapa {
	arquivo: string;
	/** A parte sendo mapeada, a partir de 1. */
	parte: number;
	partes: number;
}

/** A mensagem "mapa" (interface:mostrar, gravar: false): o estado inteiro. */
export interface EstadoMapa {
	materia: string;
	mapa: MapaConteudo;
	pendentes: PendenteMapa[];
	andamento: AndamentoMapa | null;
	/** Os arquivos esperando, na ordem. */
	fila: string[];
	/** O da tela, quando a mudança respondeu a operar, aprovar ou do_tema. */
	pedido?: string;
	/** O modelo está montando o mapa a partir do tema (do_tema). */
	montandoTema?: boolean;
}

/** A mensagem "erro" (interface:mostrar, gravar: false). */
export interface MensagemErroMapa {
	mensagem: string;
	/** A ação que falhou (abrir, mapear, operar…). */
	ao?: string;
	materia?: string;
	arquivo?: string;
	pedido?: string;
}

// --- Funções -----------------------------------------------------------------

export class ErroMapa extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroMapa";
	}
}

/** O mapa de uma matéria sem mapa-conteudo.json. */
export function mapaVazio(): MapaConteudo {
	return { versao: VERSAO_MAPA, situacao: "rascunho", conceitos: [], arquivos: {} };
}

/** c- + 12 dígitos base 36 de milissegundos + - + 4 hex aleatórios. */
export function novoIdConceito(agora: number = Date.now()): string {
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(2));
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `c-${agora.toString(36).padStart(12, "0")}-${hex}`;
}

/** Um conceito de origem material sem nenhuma referência (a tela mostra o aviso). Não é gravado. Os de origem usuario e tema nunca são. */
export function semFonte(conceito: Conceito): boolean {
	return conceito.origem === "material" && conceito.referencias.length === 0;
}

/** As contagens que a tela mostra. semFonte e novos contam os de dentro e os de fora. */
export function contarMapa(mapa: MapaConteudo): { dentro: number; fora: number; semFonte: number; novos: number; arquivos: number } {
	let fora = 0;
	let semFonteTotal = 0;
	let novos = 0;
	for (const conceito of mapa.conceitos) {
		if (conceito.fora) fora++;
		if (semFonte(conceito)) semFonteTotal++;
		if (conceito.novo) novos++;
	}
	return { dentro: mapa.conceitos.length - fora, fora, semFonte: semFonteTotal, novos, arquivos: Object.keys(mapa.arquivos).length };
}

/** O nome para comparar: sem diferença de maiúsculas, acentos e espaços repetidos. */
export function chaveDoNome(nome: string): string {
	return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

const limparTexto = (texto: string) => texto.trim().replace(/\s+/g, " ");

const clonar = (mapa: MapaConteudo): MapaConteudo => structuredClone(mapa);

/** aprovado → alterado; rascunho e alterado ficam. */
function marcarAlterado(mapa: MapaConteudo): void {
	if (mapa.situacao === "aprovado") mapa.situacao = "alterado";
}

/** Um id que o mapa ainda não tem. */
function idLivre(mapa: MapaConteudo, agora: number): string {
	const existentes = new Set(mapa.conceitos.map((conceito) => conceito.id));
	for (;;) {
		const id = novoIdConceito(agora);
		if (!existentes.has(id)) return id;
	}
}

/** Põe o conceito logo depois do id dado; null = primeiro; undefined = no fim. */
function inserir(conceitos: Conceito[], conceito: Conceito, depoisDe: string | null | undefined): void {
	if (depoisDe === undefined) conceitos.push(conceito);
	else if (depoisDe === null) conceitos.unshift(conceito);
	else conceitos.splice(conceitos.findIndex((item) => item.id === depoisDe) + 1, 0, conceito);
}

/** Aplica uma operação no mapa (já clonado). Devolve se mudou algo, ou undefined se a operação foi ignorada. */
function aplicarUma(mapa: MapaConteudo, operacao: Operacao, agora: Date): boolean | undefined {
	if (!operacao || typeof operacao !== "object" || typeof operacao.id !== "string" || !operacao.id) return undefined;
	const conceitos = mapa.conceitos;
	const indice = conceitos.findIndex((conceito) => conceito.id === operacao.id);
	const conceito = conceitos[indice];
	const existe = (id: string) => conceitos.some((item) => item.id === id);
	if (operacao.tipo === "adicionar") {
		if (conceito) return undefined;
		const nome = typeof operacao.nome === "string" ? limparTexto(operacao.nome) : "";
		if (!nome) return undefined;
		const depoisDe = operacao.depoisDe;
		if (depoisDe !== undefined && depoisDe !== null && (typeof depoisDe !== "string" || !existe(depoisDe))) return undefined;
		inserir(
			conceitos,
			{
				id: operacao.id,
				nome,
				descricao: typeof operacao.descricao === "string" ? operacao.descricao.trim() : "",
				referencias: [],
				prioridade: "normal",
				origem: "usuario",
				criadoEm: agora.toISOString(),
			},
			depoisDe,
		);
		return true;
	}
	if (!conceito) return undefined;
	switch (operacao.tipo) {
		case "tirar":
			if (conceito.fora) return false;
			conceito.fora = true;
			return true;
		case "trazer":
			if (!conceito.fora) return false;
			delete conceito.fora;
			return true;
		case "prioridade":
			if (!(PRIORIDADES as readonly string[]).includes(operacao.valor)) return undefined;
			if (conceito.prioridade === operacao.valor) return false;
			conceito.prioridade = operacao.valor;
			return true;
		case "mover": {
			const depoisDe = operacao.depoisDe;
			if (depoisDe !== null && (typeof depoisDe !== "string" || depoisDe === conceito.id || !existe(depoisDe))) return undefined;
			const antes = conceitos.map((item) => item.id).join("\n");
			conceitos.splice(indice, 1);
			inserir(conceitos, conceito, depoisDe);
			return conceitos.map((item) => item.id).join("\n") !== antes;
		}
		case "editar": {
			let mudou = false;
			if (operacao.nome !== undefined) {
				const nome = typeof operacao.nome === "string" ? limparTexto(operacao.nome) : "";
				if (!nome) return undefined;
				if (nome !== conceito.nome) {
					conceito.nome = nome;
					mudou = true;
				}
			}
			if (operacao.descricao !== undefined) {
				if (typeof operacao.descricao !== "string") return undefined;
				const descricao = operacao.descricao.trim();
				if (descricao !== conceito.descricao) {
					conceito.descricao = descricao;
					mudou = true;
				}
			}
			return mudou;
		}
		case "apagar":
			if (conceito.origem !== "usuario" && conceito.origem !== "tema") return undefined;
			conceitos.splice(indice, 1);
			return true;
		default:
			return undefined;
	}
}

/**
 * Aplica as operações da revisão, em ordem, sem mexer no mapa recebido. Uma
 * operação sobre um id que não existe (ou que não vale: nome vazio, prioridade
 * desconhecida, depoisDe que não existe, apagar um conceito do material,
 * adicionar um id que já existe) é ignorada e contada. Se alguma operação
 * mudou algo de verdade num mapa aprovado, ele passa a alterado; uma operação
 * que não muda nada (tirar o que já está fora) não altera a situação.
 */
export function aplicarOperacoes(
	mapa: MapaConteudo,
	operacoes: readonly Operacao[],
	agora: Date = new Date(),
): { mapa: MapaConteudo; ignoradas: number; mudou: boolean } {
	const novo = clonar(mapa);
	let ignoradas = 0;
	let mudou = false;
	for (const operacao of operacoes) {
		const resultado = aplicarUma(novo, operacao, agora);
		if (resultado === undefined) ignoradas++;
		else if (resultado) mudou = true;
	}
	if (mudou) marcarAlterado(novo);
	return { mapa: novo, ignoradas, mudou };
}

/** Aprova o mapa: situação aprovado, aprovadoEm agora e nenhum novo. Sem nenhum conceito dentro, ErroMapa. */
export function aprovar(mapa: MapaConteudo, agora: Date = new Date()): MapaConteudo {
	if (!mapa.conceitos.some((conceito) => !conceito.fora)) {
		throw new ErroMapa("O mapa não tem nenhum conceito dentro. Traga ou adicione pelo menos um antes de aprovar.");
	}
	const copia = clonar(mapa);
	const conceitos = copia.conceitos.map(({ novo: _novo, ...resto }) => resto);
	return { versao: VERSAO_MAPA, situacao: "aprovado", aprovadoEm: agora.toISOString(), conceitos, arquivos: copia.arquivos };
}

/** Um trecho do arquivo como o manifesto do .extraido o descreve. */
export interface TrechoDoArquivo {
	local: string;
	nome: string;
}

/**
 * Funde no mapa o que o modelo devolveu para um arquivo (ou uma parte dele),
 * pelas regras 2 a 5 de docs/mapa-conteudo.md, sem mexer no mapa recebido:
 *
 * - 2: um local só vale se for exatamente o local de um trecho do arquivo; um
 *   conceito sem nenhum local válido é descartado;
 * - 3: um id que existe no mapa só ganha as referências novas (sem repetir);
 *   nome, descrição, prioridade, posição e fora ficam. Id que não existe = null.
 *   Um item com id null (ou desconhecido) cujo chaveDoNome é o de um conceito
 *   do mapa (inclusive os que estão fora; o primeiro, se houver mais de um)
 *   vale como aquele conceito: só ganha referências. Isso é resolvido antes da
 *   regra 5, então dois itens que caem no mesmo conceito existente (pelo id ou
 *   pelo nome) também viram um só;
 * - 4: id null vira um conceito novo (material, normal, novo se o mapa já tem
 *   aprovadoEm), logo depois do item anterior da resposta; o primeiro da
 *   resposta, logo antes do próximo item da resposta que já existe no mapa; sem
 *   nenhum, no fim;
 * - 5: itens com o mesmo nome (chaveDoNome) ou o mesmo conceito existente
 *   viram um só: o nome e a descrição do primeiro, o primeiro conceito
 *   existente, e os locais de todos.
 *
 * A regra 1 (tirar antes as referências do arquivo) é tirarReferenciasDoArquivo
 * e a 6 (arquivos[arquivo]) é marcarArquivoMapeado, porque um arquivo grande é
 * fundido em várias partes e essas duas acontecem uma vez só por arquivo. Se a
 * fusão mudou algo num mapa aprovado, ele passa a alterado.
 *
 * novos: conceitos criados; reforcados: conceitos do mapa que a resposta citou;
 * descartados: itens (depois de juntar os de mesmo nome) sem nome ou sem local
 * válido.
 */
export function fundirResultado(
	mapa: MapaConteudo,
	entrada: { arquivo: string; trechos: readonly TrechoDoArquivo[]; resultado: ResultadoMapeador; agora?: Date },
): { mapa: MapaConteudo; novos: number; reforcados: number; descartados: number } {
	const agora = entrada.agora ?? new Date();
	const novo = clonar(mapa);
	const trechoDoLocal = new Map(entrada.trechos.map((trecho) => [trecho.local, trecho.nome]));
	const porId = new Map(novo.conceitos.map((conceito) => [conceito.id, conceito]));
	// Regra 3, pelo nome: o primeiro conceito do mapa com cada chaveDoNome.
	const idDoNome = new Map<string, string>();
	for (const conceito of novo.conceitos) if (!idDoNome.has(chaveDoNome(conceito.nome))) idDoNome.set(chaveDoNome(conceito.nome), conceito.id);

	interface Item {
		id: string | undefined;
		nome: string;
		descricao: string;
		locais: string[];
	}
	const itens: Item[] = [];
	const porNome = new Map<string, Item>();
	const porConceito = new Map<string, Item>();
	let descartados = 0;
	const brutos: unknown[] = Array.isArray(entrada.resultado?.conceitos) ? entrada.resultado.conceitos : [];
	for (const bruto of brutos as Array<Partial<Record<keyof ResultadoMapeador["conceitos"][number], unknown>> | null>) {
		const nome = typeof bruto?.nome === "string" ? limparTexto(bruto.nome) : "";
		if (!bruto || !nome) {
			descartados++;
			continue;
		}
		const chave = chaveDoNome(nome);
		const id = typeof bruto.id === "string" && porId.has(bruto.id) ? bruto.id : idDoNome.get(chave);
		const descricao = typeof bruto.descricao === "string" ? bruto.descricao.trim() : "";
		const locais = Array.isArray(bruto.locais) ? bruto.locais.filter((local): local is string => typeof local === "string" && trechoDoLocal.has(local)) : [];
		const junto = (id ? porConceito.get(id) : undefined) ?? porNome.get(chave);
		if (junto) {
			junto.id ??= id;
			if (!junto.descricao) junto.descricao = descricao;
			for (const local of locais) if (!junto.locais.includes(local)) junto.locais.push(local);
			if (!porNome.has(chave)) porNome.set(chave, junto);
			if (junto.id && !porConceito.has(junto.id)) porConceito.set(junto.id, junto);
			continue;
		}
		const item: Item = { id, nome, descricao, locais: [...new Set(locais)] };
		porNome.set(chave, item);
		if (id) porConceito.set(id, item);
		itens.push(item);
	}
	const validos = itens.filter((item) => item.locais.length > 0);
	descartados += itens.length - validos.length;

	const referenciasDe = (item: Item): Referencia[] =>
		item.locais.map((local) => ({ arquivo: entrada.arquivo, local, trecho: trechoDoLocal.get(local)! }));
	const reforcados = new Set<string>();
	let novos = 0;
	let mudou = false;
	let anterior: Conceito | undefined;
	validos.forEach((item, posicao) => {
		if (item.id) {
			const conceito = porId.get(item.id)!;
			for (const referencia of referenciasDe(item)) {
				if (conceito.referencias.some((existente) => existente.arquivo === referencia.arquivo && existente.local === referencia.local)) continue;
				conceito.referencias.push(referencia);
				mudou = true;
			}
			reforcados.add(conceito.id);
			anterior = conceito;
			return;
		}
		const conceito: Conceito = {
			id: idLivre(novo, agora.getTime()),
			nome: item.nome,
			descricao: item.descricao,
			referencias: referenciasDe(item),
			prioridade: "normal",
			origem: "material",
			criadoEm: agora.toISOString(),
			...(novo.aprovadoEm ? { novo: true as const } : {}),
		};
		if (anterior) {
			inserir(novo.conceitos, conceito, anterior.id);
		} else {
			const proximo = validos.slice(posicao + 1).find((seguinte) => seguinte.id);
			if (proximo) novo.conceitos.splice(novo.conceitos.findIndex((existente) => existente.id === proximo.id), 0, conceito);
			else novo.conceitos.push(conceito);
		}
		porId.set(conceito.id, conceito);
		anterior = conceito;
		novos++;
		mudou = true;
	});
	if (mudou) marcarAlterado(novo);
	return { mapa: novo, novos, reforcados: reforcados.size, descartados };
}

/**
 * Regra 6: grava arquivos[arquivo] depois de todas as partes fundidas, com o
 * hash do manifesto, a data, o modelo, o custo e quantos conceitos do mapa
 * citam o arquivo agora. Um mapa aprovado passa a alterado (o mapeamento
 * aconteceu, mesmo que tenha reencontrado tudo igual).
 */
export function marcarArquivoMapeado(
	mapa: MapaConteudo,
	arquivo: string,
	dados: { hash: string; modelo: string; custo: number; agora?: Date },
): MapaConteudo {
	const novo = clonar(mapa);
	const conceitos = novo.conceitos.filter((conceito) => conceito.referencias.some((referencia) => referencia.arquivo === arquivo)).length;
	novo.arquivos[arquivo] = { hash: dados.hash, mapeadoEm: (dados.agora ?? new Date()).toISOString(), modelo: dados.modelo, custo: dados.custo, conceitos };
	marcarAlterado(novo);
	return novo;
}

/**
 * Regra 1: tira as referências do arquivo de todos os conceitos (antes de
 * mapear de novo um arquivo que já estava no mapa). arquivos[arquivo] fica:
 * ele só é trocado por marcarArquivoMapeado no fim do mapeamento. semFonte:
 * quantos conceitos ficaram sem fonte por causa disto (tinham referência e
 * agora não têm nenhuma). Se tirou alguma referência de um mapa aprovado, ele
 * passa a alterado.
 */
export function tirarReferenciasDoArquivo(mapa: MapaConteudo, arquivo: string): { mapa: MapaConteudo; semFonte: number } {
	const novo = clonar(mapa);
	let semFonteAgora = 0;
	let mudou = false;
	for (const conceito of novo.conceitos) {
		const antes = conceito.referencias.length;
		conceito.referencias = conceito.referencias.filter((referencia) => referencia.arquivo !== arquivo);
		if (conceito.referencias.length === antes) continue;
		mudou = true;
		if (semFonte(conceito)) semFonteAgora++;
	}
	if (mudou) marcarAlterado(novo);
	return { mapa: novo, semFonte: semFonteAgora };
}

/**
 * Um material que saiu (materiais:removido): as referências dele saem,
 * arquivos[arquivo] sai, e o conceito que ficou sem fonte continua no mapa.
 * Se algo mudou num mapa aprovado, ele passa a alterado.
 */
export function removerArquivoDoMapa(mapa: MapaConteudo, arquivo: string): { mapa: MapaConteudo; semFonte: number } {
	const resultado = tirarReferenciasDoArquivo(mapa, arquivo);
	if (Object.hasOwn(resultado.mapa.arquivos, arquivo)) {
		delete resultado.mapa.arquivos[arquivo];
		marcarAlterado(resultado.mapa);
	}
	return resultado;
}

/**
 * Funde no mapa os conceitos que o modelo montou a partir do tema de um curso
 * (docs/cursos.md, "Mapa a partir do tema"), sem mexer no mapa recebido: eles
 * entram no fim do mapa, na ordem dada, com origem tema, sem referências,
 * prioridade normal e novo se o mapa já tem aprovadoEm. Um nome igual
 * (chaveDoNome) ao de um conceito do mapa, inclusive os que estão fora, ou ao
 * de um item anterior da lista não entra; um item sem nome também não. Se
 * entrou algum, um mapa aprovado passa a alterado. novos: quantos entraram.
 */
export function fundirTema(
	mapa: MapaConteudo,
	conceitos: ReadonlyArray<{ nome: string; descricao: string }>,
	agora: Date = new Date(),
): { mapa: MapaConteudo; novos: number } {
	const novo = clonar(mapa);
	const nomes = new Set(novo.conceitos.map((conceito) => chaveDoNome(conceito.nome)));
	let novos = 0;
	const brutos: unknown[] = Array.isArray(conceitos) ? conceitos : [];
	for (const bruto of brutos as Array<Partial<Record<"nome" | "descricao", unknown>> | null>) {
		const nome = typeof bruto?.nome === "string" ? limparTexto(bruto.nome) : "";
		if (!bruto || !nome) continue;
		const chave = chaveDoNome(nome);
		if (nomes.has(chave)) continue;
		nomes.add(chave);
		novo.conceitos.push({
			id: idLivre(novo, agora.getTime()),
			nome,
			descricao: typeof bruto.descricao === "string" ? bruto.descricao.trim() : "",
			referencias: [],
			prioridade: "normal",
			origem: "tema",
			criadoEm: agora.toISOString(),
			...(novo.aprovadoEm ? { novo: true as const } : {}),
		});
		novos++;
	}
	if (novos > 0) marcarAlterado(novo);
	return { mapa: novo, novos };
}
