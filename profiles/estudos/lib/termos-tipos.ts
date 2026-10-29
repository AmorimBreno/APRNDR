// Os termos-chave do curso e os pedidos de explicação (docs/termos.md) sem
// nada do Node: a tela (profiles/estudos/paineis) importa daqui, e a extensão
// de módulos e lib/modulo-tipos.ts aplicam as mesmas funções antes de gravar
// (lib/termos.ts reexporta). São três coisas:
// - o glossário do curso (materias/<matéria>/cursos/<curso>/glossario.json):
//   os termos, o id a partir do termo e onde cada um foi explicado;
// - a marca no texto dos blocos, um link de esquema próprio
//   `[radicais](termo:t-radical)`: ler, pôr na primeira ocorrência de um
//   trecho (fora de código, fórmula e link), trocar e desfazer;
// - os pedidos de explicação de um trecho ("Não sei o que é isso" e "Explique
//   melhor"), guardados no <módulo>.json, em `explicacoes`.
//
// Todas as funções daqui são puras: recebem os dados e devolvem dados novos,
// sem mexer no que receberam. Este arquivo só importa tipos de modulo-tipos.ts
// (modulo-tipos.ts importa daqui as funções que conferem os termos de uma
// lição), para não haver ciclo entre os dois.

import { ErroCurso } from "./curso-tipos.ts";
import type { Bloco, BlocoSemId, Licao, Modulo } from "./modulo-tipos.ts";

/** Muda quando o formato do glossario.json mudar. */
export const VERSAO_GLOSSARIO = 1;

/** O esquema do link da marca: `[texto](termo:<id>)`. */
export const ESQUEMA_TERMO = "termo";

/** O termo (a forma de dicionário) tem de 1 a 80 caracteres; a definição, de 1 a 300 (de 1 a 2 frases). */
export const MAXIMO_CARACTERES_TERMO = 80;
export const MAXIMO_CARACTERES_DEFINICAO = 300;

/** Até quantos caracteres do glossário vão na mensagem de uma lição, da reescrita, da marcação e da explicação (os termos dos conceitos da chamada primeiro). */
export const LIMITE_GLOSSARIO_MENSAGEM = 8_000;

/** Um trecho selecionado (ou marcado) tem de 1 a 300 caracteres. */
export const MAXIMO_CARACTERES_TRECHO = 300;

/** O tamanho que a explicação de um trecho mira, e o máximo que o código aceita. */
export const ALVO_CARACTERES_EXPLICACAO = 1_500;
export const MAXIMO_CARACTERES_EXPLICACAO = 2_500;

/** Até quantos caracteres das explicações antes do bloco do trecho vão na mensagem da explicação (explicacoesAteOBloco). */
export const LIMITE_CONTEXTO_EXPLICACAO = 8_000;

// --- Formato (glossario.json) ------------------------------------------------------

/** De onde veio o termo: uma lição gerada, "Marcar os termos" num módulo antigo, ou "Guardar no glossário" num pedido de explicação. */
export const ORIGENS_TERMO = ["geracao", "anotacao", "pedido"] as const;
export type OrigemTermo = (typeof ORIGENS_TERMO)[number];
export const ehOrigemTermo = (valor: unknown): valor is OrigemTermo => (ORIGENS_TERMO as readonly unknown[]).includes(valor);

/** Onde o termo é explicado no curso: o bloco; com `explicacao`, o pedido de explicação daquele bloco que o explica. */
export interface LugarDoTermo {
	modulo: string;
	licao: string;
	bloco: string;
	/** O id do pedido de explicação (origem "pedido"). */
	explicacao?: string;
}

export interface Termo {
	/** t- e o termo sem acento, em minúsculas, com hífens; um repetido ganha -2, -3 (idDoTermo). */
	id: string;
	/** A forma de dicionário (singular, sem artigo), de 1 a 80 caracteres. */
	termo: string;
	/** De 1 a 2 frases, até 300 caracteres, em markdown simples (sem bloco de código). */
	definicao: string;
	/** O id do conceito do mapa da matéria, quando o termo é um deles. Só aparece quando há. */
	conceito?: string;
	/** Onde o termo é explicado; null: nada no curso o explica ("Não explicado no curso"). Um que aponta para um bloco que não existe mais vale null (explicadoQueVale). */
	explicado: LugarDoTermo | null;
	origem: OrigemTermo;
	/** ISO 8601. */
	criadoEm: string;
	alteradoEm: string;
}

/** O glossario.json do curso. Sem arquivo, o glossário está vazio. */
export interface Glossario {
	versao: typeof VERSAO_GLOSSARIO;
	termos: Termo[];
}

export const glossarioVazio = (): Glossario => ({ versao: VERSAO_GLOSSARIO, termos: [] });

// --- Formato (os pedidos de explicação, no <módulo>.json) -----------------------------

/** "Não sei o que é isso" e "Explique melhor". */
export const TIPOS_EXPLICACAO = ["nao_sei", "explique_melhor"] as const;
export type TipoExplicacao = (typeof TIPOS_EXPLICACAO)[number];
export const ehTipoExplicacao = (valor: unknown): valor is TipoExplicacao => (TIPOS_EXPLICACAO as readonly unknown[]).includes(valor);

/** Os nomes da barrinha e do balão. */
export const NOMES_TIPO_EXPLICACAO: Record<TipoExplicacao, string> = { nao_sei: "Não sei o que é isso", explique_melhor: "Explique melhor" };

/** O termo que a explicação sugere guardar no glossário (só no nao_sei, quando o trecho é um termo técnico). */
export interface TermoDaExplicacao {
	termo: string;
	definicao: string;
}

/**
 * Um pedido de explicação, no campo `explicacoes` do <módulo>.json (a lista,
 * na ordem dos pedidos). Entra quando o Breno pede, sem `explicacao`; a
 * explicação, o termo, o evento, o modelo e o custo entram quando o modelo
 * responde. Um pedido sem explicação que não está em `explicando` falhou
 * (situacaoDaExplicacao). Gerar o módulo de novo começa sem nenhum.
 */
export interface ExplicacaoPedida {
	/** x- e um id ordenável no tempo. */
	id: string;
	licao: string;
	bloco: string;
	/** A versão do bloco quando o pedido foi feito. */
	versao: number;
	/** O trecho selecionado (de 1 a 300 caracteres, os espaços juntados). */
	trecho: string;
	tipo: TipoExplicacao;
	/** ISO 8601 do pedido. */
	em: string;
	/** Markdown, até uns 1500 caracteres. Ausente enquanto o modelo explica (ou se falhou). */
	explicacao?: string;
	/** null quando o modelo não sugeriu termo (sempre no explique_melhor). */
	termo?: TermoDaExplicacao | null;
	/** O id do evento pediu_explicacao. */
	evento?: string;
	/** provedor/id do modelo que explicou. */
	modelo?: string;
	/** US$ da explicação. */
	custo?: number;
	/** O id do termo do glossário a que o pedido foi ligado por "Guardar no glossário". */
	guardado?: string;
}

/** A situação de um pedido na tela: o modelo está explicando, a explicação chegou, ou falhou ("Tentar de novo"). */
export type SituacaoExplicacao = "explicando" | "pronta" | "falhou";

// --- Ponte (painel "modulos"): o glossário na mensagem "modulo" ----------------------

/** O lugar do termo que vale, com o número e o título do módulo (pelo esqueleto) e da lição, para o cabeçalho do cartão ("Módulo 01 · Lição 1"). */
export interface LugarNaTela extends LugarDoTermo {
	/** A posição do módulo no esqueleto, a partir de 1. */
	numeroModulo: number;
	tituloModulo: string;
	/** A posição da lição no módulo, a partir de 1. */
	numeroLicao: number;
	tituloLicao: string;
}

/** Um termo do glossário como vai para a tela: o termo gravado e o lugar que vale (null: "Não explicado no curso"). */
export interface TermoNaTela extends Termo {
	lugar: LugarNaTela | null;
}

// --- Erros e auxiliares ------------------------------------------------------------------

/** Um ErroCurso (a extensão mostra a frase como está), com o nome próprio dos termos. */
export class ErroTermo extends ErroCurso {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroTermo";
	}
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const mostrar = (valor: unknown) => (typeof valor === "string" ? valor : JSON.stringify(valor) ?? String(valor));
/** Numa linha só, sem espaços repetidos. */
const linhaLimpa = (valor: unknown) => (typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "");
/** Aparado nas pontas (markdown: o meio fica como veio). */
const textoLimpo = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
/** A versão do bloco (como versaoDoBloco, de modulo-tipos.ts, repetida aqui para não importar de lá). */
const versaoDe = (bloco: { versao?: number }) => (typeof bloco.versao === "number" && Number.isInteger(bloco.versao) && bloco.versao >= 1 ? bloco.versao : 1);

/** O texto sem os acentos (e o cedilha). */
export const semAcento = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "");

/** A forma de comparar dois termos: sem acento, em minúsculas, os espaços juntados. "Fitação  de Polinômio" e "fitacao de polinomio" são o mesmo termo. */
export const formaDoTermo = (termo: string) => semAcento(termo).toLowerCase().trim().replace(/\s+/g, " ");

/** Um id de termo: t- e palavras de letras minúsculas sem acento e números, separadas por hífens. */
export const ehIdTermo = (valor: unknown): valor is string => typeof valor === "string" && /^t-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(valor);

/**
 * O id de um termo novo: t- e o termo sem acento, em minúsculas, com hífens
 * no lugar do que não é letra ou número ("Fitação de polinômio" vira
 * t-fitacao-de-polinomio), cortado em 60 caracteres. Um id que já está em
 * `existentes` ganha -2, -3… (o primeiro livre). Termo sem letra nem número,
 * t-termo.
 */
export function idDoTermo(termo: string, existentes: Iterable<string> = []): string {
	const usados = new Set(existentes);
	const base = semAcento(termo)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/, "");
	const raiz = `t-${base || "termo"}`;
	if (!usados.has(raiz)) return raiz;
	for (let numero = 2; ; numero++) if (!usados.has(`${raiz}-${numero}`)) return `${raiz}-${numero}`;
}

/** O termo pelo id (no glossário, ou no glossário da mensagem "modulo"); sem ele, undefined: a marca aparece como texto comum. */
export function termoPorId<T extends Pick<Termo, "id">>(termos: readonly T[], id: string): T | undefined {
	return termos.find((termo) => termo.id === id);
}

// --- O markdown: código, fórmula e link -------------------------------------------------

/** O que, no markdown, é código (em linha ou em bloco cercado), fórmula ($…$ e $$…$$), link ([…](…), ![…](…), ![[…]]) ou endereço (<https://…>, https://…, www.…). */
export type TipoRegiao = "codigo" | "formula" | "link" | "endereco";

export interface RegiaoMarkdown {
	inicio: number;
	/** Exclusivo. */
	fim: number;
	tipo: TipoRegiao;
	/** No link: onde fica o texto (entre os colchetes) e o alvo (o que está entre os parênteses, aparado). */
	texto?: [number, number];
	alvo?: string;
	/** O link é uma imagem (![…](…)). */
	imagem?: true;
}

const ehLetra = (caractere: string | undefined) => caractere !== undefined && /\p{L}/u.test(caractere);
const ehPalavra = (caractere: string | undefined) => caractere !== undefined && /[\p{L}\p{N}_]/u.test(caractere);
/** Espaço, tabulação, quebra de linha ou o fim do texto. */
const ehEspacoOuFim = (caractere: string | undefined) => caractere === undefined || /\s/.test(caractere);

/** Quantas vezes `caractere` se repete a partir de `inicio`. */
function sequencia(texto: string, inicio: number, caractere: string): number {
	let fim = inicio;
	while (texto[fim] === caractere) fim++;
	return fim - inicio;
}

/** Onde começa a próxima sequência de exatamente `tamanho` vezes `caractere`, de `desde` até `ate` (exclusivo); sem ela, -1. */
function acharSequencia(texto: string, desde: number, caractere: string, tamanho: number, ate: number): number {
	let posicao = desde;
	while (posicao < ate) {
		if (texto[posicao] !== caractere) {
			posicao++;
			continue;
		}
		const achada = sequencia(texto, posicao, caractere);
		if (achada === tamanho && posicao + achada <= ate) return posicao;
		posicao += achada;
	}
	return -1;
}

/**
 * Os blocos de código cercados (``` ou ~~~, com qualquer recuo, para valer
 * também dentro de listas): do começo da linha que abre ao fim da linha que
 * fecha (a mesma marca, do mesmo tamanho ou maior). Um bloco que não fecha
 * vai até o fim do texto. Os blocos vetor e matriz são blocos cercados.
 */
function blocosCercados(texto: string): Array<[number, number]> {
	const saida: Array<[number, number]> = [];
	let aberto: { inicio: number; marca: string; tamanho: number } | undefined;
	let posicao = 0;
	for (const linha of texto.split("\n")) {
		const fimDaLinha = posicao + linha.length;
		const semRetorno = linha.replace(/\r$/, "");
		if (!aberto) {
			const abre = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(semRetorno);
			if (abre && !(abre[1]![0] === "`" && abre[2]!.includes("`"))) aberto = { inicio: posicao, marca: abre[1]![0]!, tamanho: abre[1]!.length };
		} else {
			const fecha = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(semRetorno);
			if (fecha && fecha[1]![0] === aberto.marca && fecha[1]!.length >= aberto.tamanho) {
				saida.push([aberto.inicio, fimDaLinha]);
				aberto = undefined;
			}
		}
		posicao = fimDaLinha + 1;
	}
	if (aberto) saida.push([aberto.inicio, texto.length]);
	return saida;
}

/** O fim do parágrafo que contém `desde`: a próxima linha em branco, ou `ate`. */
function fimDoParagrafo(texto: string, desde: number, ate: number): number {
	const branca = /\n[ \t]*\r?\n/g;
	branca.lastIndex = desde;
	const achada = branca.exec(texto);
	return achada && achada.index < ate ? achada.index : ate;
}

/** O link (ou a imagem) que começa em `inicio`, até `ate`: [texto](alvo), com colchetes e parênteses aninhados. Sem link ali, undefined. */
function lerLink(texto: string, inicio: number, ate: number): RegiaoMarkdown | undefined {
	const imagem = texto[inicio] === "!";
	const inicioTexto = inicio + (imagem ? 2 : 1);
	let posicao = inicioTexto;
	let profundidade = 1;
	while (posicao < ate) {
		const caractere = texto[posicao];
		if (caractere === "\\") {
			posicao += 2;
			continue;
		}
		if (caractere === "`") {
			const tamanho = sequencia(texto, posicao, "`");
			const fecha = acharSequencia(texto, posicao + tamanho, "`", tamanho, ate);
			posicao = fecha >= 0 ? fecha + tamanho : posicao + tamanho;
			continue;
		}
		if (caractere === "[") profundidade++;
		else if (caractere === "]" && --profundidade === 0) break;
		posicao++;
	}
	if (posicao >= ate || texto[posicao] !== "]" || texto[posicao + 1] !== "(") return undefined;
	const fimTexto = posicao;
	let fim = posicao + 2;
	let parenteses = 1;
	while (fim < ate) {
		const caractere = texto[fim];
		if (caractere === "\\") {
			fim += 2;
			continue;
		}
		if (caractere === "\n") return undefined;
		if (caractere === "(") parenteses++;
		else if (caractere === ")" && --parenteses === 0) break;
		fim++;
	}
	if (fim >= ate || texto[fim] !== ")") return undefined;
	return { inicio, fim: fim + 1, tipo: "link", texto: [inicioTexto, fimTexto], alvo: texto.slice(fimTexto + 2, fim).trim(), ...(imagem ? { imagem: true as const } : {}) };
}

/**
 * As regiões do markdown onde uma marca de termo não entra (e onde as marcas
 * são lidas): código, fórmula, link e endereço, na ordem do texto, sem
 * sobreposição. Segue o Markdown da conversa (docs/markdown-da-conversa.md):
 * - código: os blocos cercados (blocosCercados) e o código em linha (a mesma
 *   quantidade de crases fecha, no mesmo parágrafo; sem fechar, as crases são
 *   texto);
 * - fórmula: $$…$$ (até o próximo $$, mesmo em outro parágrafo) e $…$ no mesmo
 *   parágrafo. O $ de dinheiro não abre fórmula: o $ logo depois de uma letra
 *   (R$ 20, US$ 3, R$20) e o $ seguido de espaço ou do fim ($ 5); \$ é texto;
 * - link: [texto](alvo), ![texto](alvo) e o embed ![[…]];
 * - endereço: <https://…>, e https://… ou www.… soltos (o GFM os transforma em link).
 * O primeiro que abre ganha (dentro de código não há fórmula, e o contrário).
 * Na dúvida, a região é maior (uma marca a menos nunca estraga o texto).
 */
export function regioesDoMarkdown(texto: string): RegiaoMarkdown[] {
	const cercados = blocosCercados(texto);
	const regioes: RegiaoMarkdown[] = cercados.map(([inicio, fim]) => ({ inicio, fim, tipo: "codigo" as const }));
	let proximo = 0;
	let posicao = 0;
	while (posicao < texto.length) {
		while (proximo < cercados.length && cercados[proximo]![1] <= posicao) proximo++;
		const cercado = cercados[proximo];
		if (cercado && cercado[0] <= posicao) {
			posicao = cercado[1];
			continue;
		}
		const ateCercado = cercado ? cercado[0] : texto.length;
		const caractere = texto[posicao]!;
		if (caractere === "\\") {
			posicao += 2;
			continue;
		}
		if (caractere === "`") {
			const tamanho = sequencia(texto, posicao, "`");
			const fecha = acharSequencia(texto, posicao + tamanho, "`", tamanho, fimDoParagrafo(texto, posicao, ateCercado));
			if (fecha >= 0) {
				regioes.push({ inicio: posicao, fim: fecha + tamanho, tipo: "codigo" });
				posicao = fecha + tamanho;
			} else posicao += tamanho;
			continue;
		}
		if (caractere === "$") {
			const tamanho = sequencia(texto, posicao, "$");
			if (tamanho >= 2) {
				const fecha = acharSequencia(texto, posicao + tamanho, "$", tamanho, ateCercado);
				if (fecha >= 0) {
					regioes.push({ inicio: posicao, fim: fecha + tamanho, tipo: "formula" });
					posicao = fecha + tamanho;
				} else posicao += tamanho;
				continue;
			}
			if (ehLetra(texto[posicao - 1]) || ehEspacoOuFim(texto[posicao + 1])) {
				posicao += 1;
				continue;
			}
			const fecha = acharSequencia(texto, posicao + 1, "$", 1, fimDoParagrafo(texto, posicao, ateCercado));
			if (fecha >= 0) {
				regioes.push({ inicio: posicao, fim: fecha + 1, tipo: "formula" });
				posicao = fecha + 1;
			} else posicao += 1;
			continue;
		}
		if (caractere === "!" && texto.startsWith("![[", posicao)) {
			const fecha = texto.indexOf("]]", posicao + 3);
			const quebra = texto.indexOf("\n", posicao);
			if (fecha >= 0 && (quebra < 0 || fecha < quebra)) {
				regioes.push({ inicio: posicao, fim: fecha + 2, tipo: "link" });
				posicao = fecha + 2;
				continue;
			}
		}
		if (caractere === "[" || (caractere === "!" && texto[posicao + 1] === "[")) {
			const link = lerLink(texto, posicao, fimDoParagrafo(texto, posicao, ateCercado));
			if (link) {
				regioes.push(link);
				posicao = link.fim;
			} else posicao += 1;
			continue;
		}
		if (caractere === "<") {
			const endereco = /^<(?:https?:\/\/|mailto:)[^\s<>]*>/i.exec(texto.slice(posicao, posicao + 2_000));
			if (endereco) {
				regioes.push({ inicio: posicao, fim: posicao + endereco[0].length, tipo: "endereco" });
				posicao += endereco[0].length;
				continue;
			}
		}
		if ((caractere === "h" || caractere === "H" || caractere === "w" || caractere === "W") && !ehPalavra(texto[posicao - 1])) {
			const endereco = /^(?:https?:\/\/|www\.)[^\s<]*/i.exec(texto.slice(posicao, posicao + 2_000));
			if (endereco) {
				regioes.push({ inicio: posicao, fim: posicao + endereco[0].length, tipo: "endereco" });
				posicao += endereco[0].length;
				continue;
			}
		}
		posicao += 1;
	}
	return regioes.sort((a, b) => a.inicio - b.inicio);
}

// --- As marcas no texto -----------------------------------------------------------------

/** Uma marca de termo no markdown: o texto do link (a forma que aparece na frase), o id e onde ela fica. */
export interface MarcaDeTermo {
	texto: string;
	id: string;
	inicio: number;
	/** Exclusivo. */
	fim: number;
}

/** O alvo de uma marca: termo:<id> (o esquema sem diferença de caixa, com espaços tolerados). */
const ALVO_TERMO = /^termo:\s*([^\s()]+)$/i;

/** A marca escrita do jeito certo: [texto](termo:id). */
export const marcaDoTermo = (texto: string, id: string) => `[${texto}](${ESQUEMA_TERMO}:${id})`;

/**
 * As marcas de termo do markdown, na ordem: os links [texto](termo:id) fora de
 * código e de fórmula (regioesDoMarkdown). Uma imagem não é marca. O id não é
 * conferido aqui (pode ser um id do glossário, um novo-1 da geração ou
 * qualquer outro).
 */
export function lerMarcas(markdown: string): MarcaDeTermo[] {
	const saida: MarcaDeTermo[] = [];
	for (const regiao of regioesDoMarkdown(markdown)) {
		if (regiao.tipo !== "link" || regiao.imagem || !regiao.texto || regiao.alvo === undefined) continue;
		const alvo = ALVO_TERMO.exec(regiao.alvo);
		if (!alvo) continue;
		saida.push({ texto: markdown.slice(regiao.texto[0], regiao.texto[1]), id: alvo[1]!, inicio: regiao.inicio, fim: regiao.fim });
	}
	return saida;
}

/**
 * Troca as marcas do markdown: para cada marca, na ordem, `troca(id)` diz o
 * id novo (o mesmo deixa como está), ou null para desfazer a marca (fica o
 * texto dela). Uma marca escrita de outro jeito (com espaço depois de
 * "termo:", "Termo:") sai do jeito certo. O resto do texto não muda.
 */
export function trocarMarcas(markdown: string, troca: (id: string, marca: MarcaDeTermo) => string | null): string {
	const marcas = lerMarcas(markdown);
	if (marcas.length === 0) return markdown;
	const decididas = marcas.map((marca) => ({ marca, para: troca(marca.id, marca) }));
	let saida = markdown;
	for (const { marca, para } of decididas.reverse()) {
		const substituto = para === null ? marca.texto : marcaDoTermo(marca.texto, para);
		if (substituto === markdown.slice(marca.inicio, marca.fim)) continue;
		saida = saida.slice(0, marca.inicio) + substituto + saida.slice(marca.fim);
	}
	return saida;
}

/** Desfaz as marcas cujo id não está em `conhecidos` (fica o texto); as outras ficam. */
export function desfazerMarcasDesconhecidas(markdown: string, conhecidos: ReadonlySet<string> | ((id: string) => boolean)): string {
	const conhece = typeof conhecidos === "function" ? conhecidos : (id: string) => conhecidos.has(id);
	return trocarMarcas(markdown, (id) => (conhece(id) ? id : null));
}

/** Desfaz todas as marcas (fica o texto). */
export const semMarcas = (markdown: string) => trocarMarcas(markdown, () => null);

/** Troca as marcas novo-n (as chaves dos termos novos da geração) pelo id dado em `ids`; uma chave sem id é desfeita. As marcas com outros ids ficam. */
export function trocarMarcasNovas(markdown: string, ids: Readonly<Record<string, string>>): string {
	return trocarMarcas(markdown, (id) => (/^novo-/.test(id) ? (ids[id] ?? null) : id));
}

/**
 * Põe a marca [trecho](termo:id) na primeira ocorrência exata do trecho no
 * markdown que está fora de código, fórmula, link e endereço
 * (regioesDoMarkdown) e é uma palavra inteira (uma ocorrência dentro de uma
 * palavra maior, como "radical" em "radicais", não conta), e que não vem
 * logo depois de "!" nem de "\" (viraria imagem ou escape). Nenhuma outra
 * mudança no texto. O trecho é aparado; vazio, com mais de 300 caracteres,
 * com quebra de linha ou com colchetes, nada. Sem ocorrência que sirva,
 * undefined.
 */
export function marcarTrecho(markdown: string, trecho: string, id: string): string | undefined {
	const alvo = trecho.trim();
	if (!alvo || alvo.length > MAXIMO_CARACTERES_TRECHO || /[[\]\r\n]/.test(alvo)) return undefined;
	const regioes = regioesDoMarkdown(markdown);
	let desde = 0;
	for (;;) {
		const inicio = markdown.indexOf(alvo, desde);
		if (inicio < 0) return undefined;
		const fim = inicio + alvo.length;
		desde = inicio + 1;
		if (regioes.some((regiao) => regiao.inicio < fim && inicio < regiao.fim)) continue;
		if (ehPalavra(alvo[0]) && ehPalavra(markdown[inicio - 1])) continue;
		if (ehPalavra(alvo.at(-1)) && ehPalavra(markdown[fim])) continue;
		if (markdown[inicio - 1] === "!" || markdown[inicio - 1] === "\\") continue;
		return `${markdown.slice(0, inicio)}${marcaDoTermo(alvo, id)}${markdown.slice(fim)}`;
	}
}

// --- As marcas nos blocos ------------------------------------------------------------------

type BlocoQualquer = Bloco | BlocoSemId;

/**
 * Aplica `comMarcas` a cada texto do bloco onde a marca vale, na ordem de
 * leitura (docs/termos.md, "A marca no texto"): a explicação e a ideia
 * central (texto), a pergunta (pergunta), e nas questões o contexto, o
 * enunciado, o texto de cada alternativa e a explicação do quiz. Os outros
 * textos (a resposta esperada, as confusões, a rubrica e a resposta-modelo)
 * passam por `semMarcas` (por padrão, desfaz todas as marcas). Devolve o
 * bloco novo; o recebido não muda. O `campo` diz qual texto é ("texto",
 * "pergunta", "contexto", "enunciado", "alternativas.0", "explicacao").
 */
export function mapearTextosDoBloco<B extends BlocoQualquer>(
	bloco: B,
	comMarcas: (texto: string, campo: string) => string,
	semMarcasNoResto: (texto: string) => string = semMarcas,
): B {
	const atual = bloco as BlocoQualquer;
	if (atual.tipo === "explicacao" || atual.tipo === "ideia_central") return { ...atual, texto: comMarcas(atual.texto, "texto") } as B;
	if (atual.tipo === "verificacao") return { ...atual, pergunta: comMarcas(atual.pergunta, "pergunta"), respostaEsperada: semMarcasNoResto(atual.respostaEsperada) } as B;
	if (atual.tipo === "alternativa") {
		const contexto = typeof atual.contexto === "string" ? { contexto: comMarcas(atual.contexto, "contexto") } : {};
		const enunciado = comMarcas(atual.enunciado, "enunciado");
		const alternativas = atual.alternativas.map((alternativa, indice) => ({
			...alternativa,
			texto: comMarcas(alternativa.texto, `alternativas.${indice}`),
			...(typeof alternativa.confusao === "string" ? { confusao: semMarcasNoResto(alternativa.confusao) } : {}),
		}));
		const explicacao = typeof atual.explicacao === "string" ? { explicacao: comMarcas(atual.explicacao, "explicacao") } : {};
		return { ...atual, ...contexto, enunciado, alternativas, ...explicacao } as B;
	}
	const contexto = typeof atual.contexto === "string" ? { contexto: comMarcas(atual.contexto, "contexto") } : {};
	const enunciado = comMarcas(atual.enunciado, "enunciado");
	return {
		...atual,
		...contexto,
		enunciado,
		rubrica: atual.rubrica.map((item) => ({ ...item, criterio: semMarcasNoResto(item.criterio), descricao: semMarcasNoResto(item.descricao) })),
		respostaModelo: semMarcasNoResto(atual.respostaModelo),
	} as B;
}

/** Os textos do bloco onde a marca vale, na ordem de leitura (os de mapearTextosDoBloco), com o campo. */
export function textosDoBloco(bloco: BlocoQualquer): Array<{ campo: string; texto: string }> {
	const saida: Array<{ campo: string; texto: string }> = [];
	mapearTextosDoBloco(
		bloco,
		(texto, campo) => {
			saida.push({ campo, texto });
			return texto;
		},
		(texto) => texto,
	);
	return saida;
}

/** As marcas do bloco (nos textos onde a marca vale), na ordem de leitura, com o campo de cada uma. */
export function marcasDoBloco(bloco: BlocoQualquer): Array<MarcaDeTermo & { campo: string }> {
	return textosDoBloco(bloco).flatMap(({ campo, texto }) => lerMarcas(texto).map((marca) => ({ ...marca, campo })));
}

/** Se algum bloco do módulo tem uma marca de termo (a tela mostra "Marcar os termos" só num módulo sem nenhuma). */
export function moduloTemMarcas(modulo: Pick<Modulo, "licoes">): boolean {
	return modulo.licoes.some((licao) => licao.blocos.some((bloco) => marcasDoBloco(bloco).length > 0));
}

/**
 * As marcas de um bloco pelas regras da geração: só nos textos onde a marca
 * vale (as dos outros textos são desfeitas), só para ids que `conhecido`
 * aceita (as outras são desfeitas) e uma por termo no bloco (a primeira, na
 * ordem de leitura; as seguintes são desfeitas). `para` troca o id de uma
 * marca aceita (por padrão, o mesmo). Devolve o bloco novo e quantas marcas
 * foram desfeitas por cada regra.
 */
export function limparMarcasDoBloco<B extends BlocoQualquer>(
	bloco: B,
	conhecido: (id: string) => boolean,
	para: (id: string) => string = (id) => id,
): { bloco: B; desconhecidas: number; repetidas: number; foraDoLugar: number } {
	const vistos = new Set<string>();
	let desconhecidas = 0;
	let repetidas = 0;
	let foraDoLugar = 0;
	const novo = mapearTextosDoBloco(
		bloco,
		(texto) =>
			trocarMarcas(texto, (id) => {
				if (!conhecido(id)) {
					desconhecidas++;
					return null;
				}
				const alvo = para(id);
				if (vistos.has(alvo)) {
					repetidas++;
					return null;
				}
				vistos.add(alvo);
				return alvo;
			}),
		(texto) =>
			trocarMarcas(texto, () => {
				foraDoLugar++;
				return null;
			}),
	);
	return { bloco: novo, desconhecidas, repetidas, foraDoLugar };
}

/** Troca as marcas de todos os textos das lições (trocarMarcas em mapearTextosDoBloco; os outros textos ficam como estão). */
export function trocarMarcasNasLicoes<L extends Pick<Licao, "blocos">>(licoes: readonly L[], troca: (id: string) => string | null): L[] {
	return licoes.map((licao) => ({ ...licao, blocos: licao.blocos.map((bloco) => mapearTextosDoBloco(bloco, (texto) => trocarMarcas(texto, troca), (texto) => texto)) }));
}

// --- Os termos de uma lição gerada -----------------------------------------------------

/** Um termo novo de uma lição gerada, conferido (conferirTermosDaLicao): a chave da marca (novo-1…) e o bloco que o explica. */
export interface TermoNovoDaLicao {
	chave: string;
	termo: string;
	definicao: string;
	/** Um conceito da lição, ou null. */
	conceito: string | null;
	/** O id do bloco de explicação que explica o termo. */
	bloco: string;
}

/** Um termo do glossário que uma lição explicou de novo (o termo novo igual a um do glossário): o id dele e o bloco. */
export interface TermoReexplicado {
	id: string;
	bloco: string;
}

/** O que conferirTermosDaLicao achou nos termos: os novos, os do glossário explicados de novo e o que o código consertou. */
export interface TermosDaLicao {
	novos: TermoNovoDaLicao[];
	reexplicados: TermoReexplicado[];
	consertos: string[];
}

/** Os termos de uma lição que vão no JSON do modelo: os termos novos da lição, com a chave da marca e a posição (a partir de 1) do bloco que explica. */
export interface TermoDoModelo {
	chave: string;
	termo: string;
	definicao: string;
	conceito?: string | null;
	explicadoEm: number;
}

const CHAVE_TERMO = /^[A-Za-z0-9_-]{1,40}$/;

/** O motivo de um termo novo não valer pelos limites (undefined: vale). */
function problemaDoTermo(termo: string, definicao: string): string | undefined {
	if (termo.length > MAXIMO_CARACTERES_TERMO) return `tem ${termo.length} caracteres; o máximo é ${MAXIMO_CARACTERES_TERMO} (a forma de dicionário, sem artigo)`;
	if (!definicao) return 'está sem "definicao"';
	if (definicao.length > MAXIMO_CARACTERES_DEFINICAO) return `tem a definição com ${definicao.length} caracteres; o máximo é ${MAXIMO_CARACTERES_DEFINICAO} (de 1 a 2 frases)`;
	if (definicao.includes("```")) return "tem um bloco de código na definição (a definição é markdown simples)";
	return undefined;
}

/**
 * Confere os termos de uma lição gerada (docs/termos.md, "Na geração das
 * lições"). Recebe os blocos já com os ids (na ordem final), o `termos` que o
 * modelo devolveu e, em `posicoes`, para cada bloco do modelo (na ordem do
 * modelo), o índice dele nos blocos finais (undefined: o bloco foi
 * descartado). As posições nas frases e no explicadoEm são as do modelo, a
 * partir de 1.
 * - Um termo novo igual (sem acento e caixa: formaDoTermo) a um do glossário
 *   vira o do glossário: as marcas dele apontam para o id do glossário (e, se
 *   o explicadoEm for uma explicação, vai em reexplicados). Dois termos novos
 *   iguais viram o primeiro.
 * - Um termo novo precisa de chave (novo-1…), termo e definição nos limites
 *   e de um explicadoEm que seja uma explicação (introdução, conceito ou
 *   exemplo) que ficou. O conceito só vale se for da lição.
 * - As marcas: só para um id do glossário ou um termo novo que vale; as
 *   outras viram texto (conserto). Só nos textos onde a marca vale, e uma por
 *   termo em cada bloco (limparMarcasDoBloco).
 * - A primeira marca de um termo novo vem no bloco que o explica ou depois.
 * Com `rigido`, um termo que não vale e a marca antes da explicação são
 * problemas (a extensão pede a lição de novo); sem ele (na segunda
 * tentativa), o termo que não vale sai (as marcas dele viram texto) e as
 * marcas antes da explicação são desfeitas, e tudo vai em consertos.
 */
export function conferirTermosDaLicao<B extends Bloco>(
	blocos: readonly B[],
	termosDoModelo: unknown,
	opcoes: { glossario: readonly Pick<Termo, "id" | "termo">[]; conceitos: readonly string[]; posicoes: readonly (number | undefined)[]; rigido: boolean },
): { blocos: B[]; termos: TermosDaLicao; problemas: string[] } {
	const problemas: string[] = [];
	const consertos: string[] = [];
	const recusar = (frase: string) => (opcoes.rigido ? problemas.push(frase) : consertos.push(`${frase} O termo saiu, e as marcas dele viraram texto.`));
	const idsDoGlossario = new Set(opcoes.glossario.map((termo) => termo.id));
	const doGlossario = new Map(opcoes.glossario.map((termo) => [formaDoTermo(termo.termo), termo.id]));
	const naPosicao = (indice: number) => opcoes.posicoes.indexOf(indice) + 1;
	const validos = new Map<string, TermoNovoDaLicao & { indice: number }>();
	/** A chave de um termo novo que virou outro: o id do glossário ou a chave do primeiro igual. */
	const apelidos = new Map<string, string>();
	const pelaForma = new Map<string, string>();
	const reexplicados: TermoReexplicado[] = [];

	if (termosDoModelo !== undefined && termosDoModelo !== null && !Array.isArray(termosDoModelo)) recusar('O campo "termos" não é uma lista.');
	const itens = Array.isArray(termosDoModelo) ? (termosDoModelo as unknown[]) : [];
	for (const [posicao, item] of itens.entries()) {
		const qual = `O ${posicao + 1}º item de "termos"`;
		if (!ehObjeto(item)) {
			recusar(`${qual} não é um objeto.`);
			continue;
		}
		const chave = typeof item.chave === "string" ? item.chave.trim() : "";
		if (!CHAVE_TERMO.test(chave) || idsDoGlossario.has(chave)) {
			recusar(`${qual} está sem uma chave válida (novo-1, novo-2…, diferente dos ids do glossário).`);
			continue;
		}
		if (validos.has(chave) || apelidos.has(chave)) {
			recusar(`A chave ${chave} aparece em mais de um item de "termos"; cada termo novo tem a sua.`);
			continue;
		}
		const termo = linhaLimpa(item.termo);
		if (!termo) {
			recusar(`O termo ${chave} está sem "termo".`);
			continue;
		}
		const forma = formaDoTermo(termo);
		const explicadoEm = item.explicadoEm;
		const indice = typeof explicadoEm === "number" && Number.isInteger(explicadoEm) && explicadoEm >= 1 && explicadoEm <= opcoes.posicoes.length ? opcoes.posicoes[explicadoEm - 1] : undefined;
		const queExplica = indice !== undefined ? blocos[indice] : undefined;
		const igual = doGlossario.get(forma);
		if (igual) {
			apelidos.set(chave, igual);
			if (queExplica?.tipo === "explicacao" && !reexplicados.some((item) => item.id === igual)) reexplicados.push({ id: igual, bloco: queExplica.id });
			consertos.push(`O termo novo "${termo}" (${chave}) já está no glossário (${igual}); as marcas dele apontam para o do glossário.`);
			continue;
		}
		const primeiro = pelaForma.get(forma);
		if (primeiro) {
			apelidos.set(chave, primeiro);
			consertos.push(`O termo novo "${termo}" (${chave}) repete ${primeiro}; as marcas dele apontam para ${primeiro}.`);
			continue;
		}
		const definicao = textoLimpo(item.definicao);
		const problema = problemaDoTermo(termo, definicao);
		if (problema) {
			recusar(`O termo "${termo}" (${chave}) ${problema}.`);
			continue;
		}
		if (!queExplica || queExplica.tipo !== "explicacao") {
			const motivo =
				typeof explicadoEm !== "number" || !Number.isInteger(explicadoEm)
					? 'está sem "explicadoEm" (a posição, a partir de 1, do bloco que o explica)'
					: explicadoEm < 1 || explicadoEm > opcoes.posicoes.length
						? `tem explicadoEm ${explicadoEm}, e a lição tem ${opcoes.posicoes.length} blocos`
						: !queExplica
							? `é explicado no bloco ${explicadoEm}, que foi descartado`
							: `é explicado no bloco ${explicadoEm} (${queExplica.tipo}), que não é uma explicação; o explicadoEm aponta para a introdução, um conceito ou um exemplo`;
			recusar(`O termo "${termo}" (${chave}) ${motivo}.`);
			continue;
		}
		const conceito = typeof item.conceito === "string" && opcoes.conceitos.includes(item.conceito.trim()) ? item.conceito.trim() : null;
		validos.set(chave, { chave, termo, definicao, conceito, bloco: queExplica.id, indice: indice! });
		pelaForma.set(forma, chave);
	}

	const conhecido = (id: string) => idsDoGlossario.has(id) || validos.has(id) || apelidos.has(id);
	const para = (id: string) => apelidos.get(id) ?? id;
	let desconhecidas = 0;
	let repetidas = 0;
	let foraDoLugar = 0;
	let saida = blocos.map((bloco) => {
		const limpo = limparMarcasDoBloco(bloco, conhecido, para);
		desconhecidas += limpo.desconhecidas;
		repetidas += limpo.repetidas;
		foraDoLugar += limpo.foraDoLugar;
		return limpo.bloco;
	});
	for (const termo of validos.values()) {
		const primeira = saida.findIndex((bloco) => marcasDoBloco(bloco).some((marca) => marca.id === termo.chave));
		if (primeira < 0 || primeira >= termo.indice) continue;
		const frase = `O termo "${termo.termo}" (${termo.chave}) é usado no bloco ${naPosicao(primeira)} antes de ser explicado no bloco ${naPosicao(termo.indice)}`;
		if (opcoes.rigido) {
			problemas.push(`${frase}; explique cada termo novo antes da primeira marca dele (ou no mesmo bloco), ou marque-o só a partir do bloco que o explica.`);
			continue;
		}
		saida = saida.map((bloco, indice) => (indice < termo.indice ? mapearTextosDoBloco(bloco, (texto) => trocarMarcas(texto, (id) => (id === termo.chave ? null : id)), (texto) => texto) : bloco));
		consertos.push(`${frase}; as marcas antes do bloco ${naPosicao(termo.indice)} viraram texto.`);
	}
	if (desconhecidas > 0) consertos.push(`${desconhecidas === 1 ? "Uma marca" : `${desconhecidas} marcas`} para termos fora do glossário e de "termos" ${desconhecidas === 1 ? "virou" : "viraram"} texto.`);
	if (repetidas > 0) consertos.push(`${repetidas === 1 ? "Uma marca repetida" : `${repetidas} marcas repetidas`} de um termo no mesmo bloco ${repetidas === 1 ? "virou" : "viraram"} texto (vale a primeira).`);
	if (foraDoLugar > 0) consertos.push(`${foraDoLugar === 1 ? "Uma marca" : `${foraDoLugar} marcas`} fora dos textos onde a marca vale ${foraDoLugar === 1 ? "virou" : "viraram"} texto.`);
	return {
		blocos: saida,
		termos: { novos: [...validos.values()].map(({ indice: _indice, ...termo }) => termo), reexplicados, consertos },
		problemas,
	};
}

/**
 * Põe no glossário os termos novos de uma lição conferida (já com as marcas
 * novo-n): cada um ganha o id (idDoTermo, sem repetir os do glossário) e
 * entra com `origem` (geracao) e o explicado no bloco dele; as marcas novo-n
 * da lição são trocadas pelo id (trocarMarcasNovas). Devolve o glossário e a
 * lição novos e os ids dados, pela chave; os recebidos não mudam.
 */
export function incorporarTermosDaLicao(
	glossario: Glossario,
	licao: Licao,
	novos: readonly TermoNovoDaLicao[],
	opcoes: { modulo: string; origem?: OrigemTermo; agora: Date },
): { glossario: Glossario; licao: Licao; ids: Record<string, string> } {
	const usados = new Set(glossario.termos.map((termo) => termo.id));
	const ids: Record<string, string> = {};
	const agora = opcoes.agora.toISOString();
	const termos = [...structuredClone(glossario.termos)];
	for (const novo of novos) {
		const id = idDoTermo(novo.termo, usados);
		usados.add(id);
		ids[novo.chave] = id;
		termos.push({
			id,
			termo: novo.termo,
			definicao: novo.definicao,
			...(novo.conceito ? { conceito: novo.conceito } : {}),
			explicado: { modulo: opcoes.modulo, licao: licao.id, bloco: novo.bloco },
			origem: opcoes.origem ?? "geracao",
			criadoEm: agora,
			alteradoEm: agora,
		});
	}
	const [comIds] = trocarMarcasNasLicoes([structuredClone(licao)], (id) => (Object.hasOwn(ids, id) ? ids[id]! : /^novo-/.test(id) ? null : id));
	return { glossario: { versao: VERSAO_GLOSSARIO, termos }, licao: comIds!, ids };
}

/** Um termo do glossário explicado de novo, para juntarTermos: o id e o lugar novo. */
export interface ExplicadoDeNovo {
	id: string;
	explicado: LugarDoTermo;
}

/**
 * Junta ao glossário gravado (`disco`) os termos criados durante uma geração
 * ou uma marcação (que podem ter sido feitas com uma cópia mais velha):
 * - um termo novo igual (formaDoTermo) a um que já está no disco vira o do
 *   disco (trocas: o id velho para o do disco); se o novo tem explicado,
 *   conta como explicado de novo;
 * - um termo novo cujo id já está no disco (outro termo) ganha outro id
 *   (idDoTermo; trocas);
 * - os outros entram como estão.
 * Os explicados de novo (o primeiro de cada id) trocam o explicado de um
 * termo que não entrou agora quando ele é null, aponta para um bloco que não
 * existe mais (`blocoExiste`) ou aponta para o `moduloRegerado` (o módulo
 * que a geração substitui). Devolve o glossário novo, as trocas de id (para
 * trocar as marcas: trocarMarcasNasLicoes) e os ids acrescentados.
 */
export function juntarTermos(
	disco: Glossario,
	entrada: { novos: readonly Termo[]; reexplicados?: readonly ExplicadoDeNovo[] },
	opcoes: { agora: Date; moduloRegerado?: string; blocoExiste?: (lugar: LugarDoTermo) => boolean },
): { glossario: Glossario; trocas: Record<string, string>; acrescentados: string[] } {
	const termos = structuredClone(disco.termos);
	const trocas: Record<string, string> = {};
	const acrescentados: string[] = [];
	const tocados = new Set<string>();
	const reexplicados: ExplicadoDeNovo[] = [];
	for (const novo of entrada.novos) {
		const forma = formaDoTermo(novo.termo);
		const igual = termos.find((termo) => formaDoTermo(termo.termo) === forma);
		if (igual) {
			if (igual.id !== novo.id) trocas[novo.id] = igual.id;
			if (novo.explicado) reexplicados.push({ id: igual.id, explicado: novo.explicado });
			continue;
		}
		const id = termos.some((termo) => termo.id === novo.id) ? idDoTermo(novo.termo, termos.map((termo) => termo.id)) : novo.id;
		if (id !== novo.id) trocas[novo.id] = id;
		termos.push({ ...structuredClone(novo), id });
		acrescentados.push(id);
		tocados.add(id);
	}
	reexplicados.push(...(entrada.reexplicados ?? []).map((item) => ({ ...item, id: trocas[item.id] ?? item.id })));
	const blocoExiste = opcoes.blocoExiste ?? (() => true);
	const feitos = new Set<string>();
	for (const item of reexplicados) {
		if (feitos.has(item.id) || tocados.has(item.id)) continue;
		feitos.add(item.id);
		const termo = termos.find((atual) => atual.id === item.id);
		if (!termo) continue;
		const velho = termo.explicado;
		if (velho && velho.modulo !== opcoes.moduloRegerado && blocoExiste(velho)) continue;
		termo.explicado = structuredClone(item.explicado);
		termo.alteradoEm = opcoes.agora.toISOString();
	}
	return { glossario: { versao: VERSAO_GLOSSARIO, termos }, trocas, acrescentados };
}

// --- O glossário nas mensagens dos modelos ------------------------------------------------------

/** A linha de um termo na mensagem dos modelos: "- t-radical · radical: A parte da palavra…" (numa linha só). */
export const linhaDoGlossario = (termo: Pick<Termo, "id" | "termo" | "definicao">) => `- ${termo.id} · ${termo.termo}: ${termo.definicao.replace(/\s+/g, " ").trim()}`;

/**
 * Os termos do glossário que cabem na mensagem de um modelo: primeiro os dos
 * `conceitos` da chamada, depois os outros, cada grupo na ordem do glossário,
 * enquanto as linhas (linhaDoGlossario, com a quebra) somarem até `limite`
 * caracteres. Devolve os termos escolhidos, na ordem do glossário.
 */
export function termosParaMensagem<T extends Pick<Termo, "id" | "termo" | "definicao" | "conceito">>(termos: readonly T[], conceitos: readonly string[], limite: number = LIMITE_GLOSSARIO_MENSAGEM): T[] {
	const dosConceitos = termos.filter((termo) => termo.conceito !== undefined && conceitos.includes(termo.conceito));
	const outros = termos.filter((termo) => !dosConceitos.includes(termo));
	const escolhidos = new Set<T>();
	let usados = 0;
	for (const termo of [...dosConceitos, ...outros]) {
		const tamanho = linhaDoGlossario(termo).length + 1;
		if (usados + tamanho > limite) continue;
		escolhidos.add(termo);
		usados += tamanho;
	}
	return termos.filter((termo) => escolhidos.has(termo));
}

// --- Onde o termo foi explicado ---------------------------------------------------------

/** O que explicadoQueVale precisa de um módulo: a situação, as lições com os blocos e os pedidos de explicação. */
export type ModuloDoLugar = Pick<Modulo, "situacao"> & { licoes: readonly Pick<Licao, "id" | "titulo" | "blocos">[]; explicacoes?: readonly Pick<ExplicacaoPedida, "id" | "explicacao">[] };

/**
 * O explicado que vale: o gravado, se o módulo (em `modulos`, pelo id) está
 * gerado e tem a lição e o bloco e, com `explicacao`, o pedido com a
 * explicação pronta; senão (o módulo foi gerado de novo, o bloco sumiu, o
 * pedido saiu), null, como se nada no curso explicasse o termo.
 */
export function explicadoQueVale(explicado: LugarDoTermo | null | undefined, modulos: Readonly<Record<string, ModuloDoLugar | undefined>>): LugarDoTermo | null {
	if (!ehObjeto(explicado)) return null;
	const modulo = modulos[explicado.modulo];
	if (!modulo || modulo.situacao !== "gerado") return null;
	const licao = modulo.licoes.find((item) => item.id === explicado.licao);
	if (!licao || !licao.blocos.some((bloco) => bloco.id === explicado.bloco)) return null;
	if (explicado.explicacao !== undefined && !(modulo.explicacoes ?? []).some((item) => item.id === explicado.explicacao && typeof item.explicacao === "string")) return null;
	return explicado;
}

/**
 * O glossário como vai para a tela na mensagem "modulo": cada termo com o
 * lugar que vale (explicadoQueVale) e, para o cabeçalho do cartão, o número
 * e o título do módulo (pela ordem e pelo nome do esqueleto) e da lição. Um
 * módulo que não está no esqueleto, lugar null. `modulos` traz os módulos dos
 * lugares (o aberto e os outros, lidos do disco).
 */
export function glossarioNaTela(
	glossario: Pick<Glossario, "termos">,
	contexto: { esqueleto: readonly { id: string; nome: string }[]; modulos: Readonly<Record<string, ModuloDoLugar | undefined>> },
): TermoNaTela[] {
	return glossario.termos.map((termo) => {
		const vale = explicadoQueVale(termo.explicado, contexto.modulos);
		const posicaoModulo = vale ? contexto.esqueleto.findIndex((item) => item.id === vale.modulo) : -1;
		const licoes = vale ? contexto.modulos[vale.modulo]!.licoes : [];
		const posicaoLicao = vale ? licoes.findIndex((item) => item.id === vale.licao) : -1;
		const lugar: LugarNaTela | null =
			vale && posicaoModulo >= 0 && posicaoLicao >= 0
				? {
						...structuredClone(vale),
						numeroModulo: posicaoModulo + 1,
						tituloModulo: contexto.esqueleto[posicaoModulo]!.nome,
						numeroLicao: posicaoLicao + 1,
						tituloLicao: licoes[posicaoLicao]!.titulo,
					}
				: null;
		return { ...structuredClone(termo), lugar };
	});
}

// --- "Marcar os termos" num módulo já gerado ------------------------------------------------

/** Um item da resposta de prompts/modulo-termos.md, conferido (lerTermosMarcados). */
export interface TermoMarcado {
	/** O bloco da lição onde a marca vai. */
	bloco: string;
	/** A forma que aparece no texto do bloco (a primeira ocorrência exata recebe a marca). */
	trecho: string;
	/** O id de um termo do glossário, ou null para um termo novo (com termo e definição). */
	id: string | null;
	termo: string;
	definicao: string;
	/** O bloco de explicação do módulo que explica o termo, ou null. */
	explicadoEm: string | null;
}

/** Os blocos de um módulo, pelo id, com a lição. */
function blocosDoModulo(modulo: Pick<Modulo, "licoes">): Map<string, { licao: string; bloco: Bloco }> {
	return new Map(modulo.licoes.flatMap((licao) => licao.blocos.map((bloco) => [bloco.id, { licao: licao.id, bloco }] as const)));
}

/**
 * Confere a resposta de "Marcar os termos" de uma lição ({"termos": [...]}):
 * sem a lista, ErroTermo (a extensão tenta de novo). Cada item precisa de um
 * bloco da lição e de um trecho (de 1 a 300 caracteres, numa linha, sem
 * colchetes); o id vale se for do glossário; sem ele, o termo novo precisa
 * de termo e definição nos limites (um igual a um do glossário vira o do
 * glossário). O explicadoEm vale se for um bloco de explicação do módulo;
 * senão, null. Um item que não vale sai (com o motivo em descartes); o
 * repetido (o mesmo termo no mesmo bloco) também.
 */
export function lerTermosMarcados(
	resultado: unknown,
	opcoes: { licao: Pick<Licao, "id" | "blocos">; modulo: Pick<Modulo, "licoes">; glossario: readonly Pick<Termo, "id" | "termo">[] },
): { termos: TermoMarcado[]; descartes: string[] } {
	if (!ehObjeto(resultado) || !Array.isArray(resultado.termos)) throw new ErroTermo('A resposta não tem a lista "termos".');
	const daLicao = new Set(opcoes.licao.blocos.map((bloco) => bloco.id));
	const doModulo = blocosDoModulo(opcoes.modulo);
	const idsDoGlossario = new Map(opcoes.glossario.map((termo) => [termo.id, termo]));
	const doGlossario = new Map(opcoes.glossario.map((termo) => [formaDoTermo(termo.termo), termo.id]));
	const termos: TermoMarcado[] = [];
	const descartes: string[] = [];
	const vistos = new Set<string>();
	for (const [posicao, item] of (resultado.termos as unknown[]).entries()) {
		const qual = `item ${posicao + 1}`;
		if (!ehObjeto(item)) {
			descartes.push(`${qual}: não é um objeto`);
			continue;
		}
		const bloco = typeof item.bloco === "string" ? item.bloco.trim() : "";
		if (!daLicao.has(bloco)) {
			descartes.push(`${qual}: o bloco "${mostrar(item.bloco)}" não é da lição ${opcoes.licao.id}`);
			continue;
		}
		const trecho = typeof item.trecho === "string" ? item.trecho.trim() : "";
		if (!trecho || trecho.length > MAXIMO_CARACTERES_TRECHO || /[[\]\r\n]/.test(trecho)) {
			descartes.push(`${qual}: o trecho não vale ("${mostrar(item.trecho)}")`);
			continue;
		}
		let id = typeof item.id === "string" && idsDoGlossario.has(item.id.trim()) ? item.id.trim() : null;
		let termo = linhaLimpa(item.termo);
		const definicao = textoLimpo(item.definicao);
		if (id === null) {
			if (!termo) {
				descartes.push(`${qual}: sem id do glossário e sem termo`);
				continue;
			}
			id = doGlossario.get(formaDoTermo(termo)) ?? null;
			if (id === null) {
				const problema = problemaDoTermo(termo, definicao);
				if (problema) {
					descartes.push(`${qual}: o termo "${termo}" ${problema}`);
					continue;
				}
			}
		}
		if (id !== null) termo = idsDoGlossario.get(id)!.termo;
		const chave = `${bloco}\n${id ?? `novo:${formaDoTermo(termo)}`}`;
		if (vistos.has(chave)) {
			descartes.push(`${qual}: o termo "${termo}" repete no bloco ${bloco}`);
			continue;
		}
		vistos.add(chave);
		const explicadoEm = typeof item.explicadoEm === "string" ? item.explicadoEm.trim() : "";
		const queExplica = doModulo.get(explicadoEm);
		termos.push({ bloco, trecho, id, termo, definicao: id === null ? definicao : "", explicadoEm: queExplica?.bloco.tipo === "explicacao" ? explicadoEm : null });
	}
	return { termos, descartes };
}

/** Uma marca a pôr num bloco: o trecho e o id do termo. */
export interface MarcaAPor {
	bloco: string;
	trecho: string;
	id: string;
}

/**
 * Põe no glossário os termos novos de uma lição marcada (lerTermosMarcados):
 * um termo novo (id null) igual a um do glossário (o gravado ou um que entrou
 * numa lição anterior desta marcação) usa o id dele; senão entra com um id
 * novo (idDoTermo), a `origem` e o explicado no explicadoEm (null sem ele;
 * um termo que entrou sem explicado ganha o primeiro explicadoEm que
 * aparecer). Um termo do glossário com explicadoEm vai em reexplicados.
 * Devolve o glossário novo, os termos que entraram, as marcas a pôr (com os
 * ids) e os explicados de novo.
 */
export function incorporarTermosMarcados(
	glossario: Glossario,
	termos: readonly TermoMarcado[],
	opcoes: { modulo: Pick<Modulo, "id" | "licoes">; origem?: OrigemTermo; agora: Date },
): { glossario: Glossario; novos: Termo[]; marcas: MarcaAPor[]; reexplicados: ExplicadoDeNovo[] } {
	const doModulo = blocosDoModulo(opcoes.modulo);
	const lugar = (bloco: string): LugarDoTermo => ({ modulo: opcoes.modulo.id, licao: doModulo.get(bloco)!.licao, bloco });
	const lista = structuredClone(glossario.termos);
	const novos: Termo[] = [];
	const marcas: MarcaAPor[] = [];
	const reexplicados: ExplicadoDeNovo[] = [];
	const agora = opcoes.agora.toISOString();
	for (const item of termos) {
		let id = item.id;
		if (id === null) {
			const forma = formaDoTermo(item.termo);
			const igual = lista.find((termo) => formaDoTermo(termo.termo) === forma);
			if (igual) {
				id = igual.id;
				const criadoAgora = novos.find((termo) => termo.id === igual.id);
				if (criadoAgora && !criadoAgora.explicado && item.explicadoEm) criadoAgora.explicado = lugar(item.explicadoEm);
				else if (!criadoAgora && item.explicadoEm) reexplicados.push({ id, explicado: lugar(item.explicadoEm) });
			} else {
				id = idDoTermo(item.termo, lista.map((termo) => termo.id));
				// O mesmo objeto na lista e em novos: o explicado de um termo novo pode chegar num item seguinte.
				const novo: Termo = {
					id,
					termo: item.termo,
					definicao: item.definicao,
					explicado: item.explicadoEm ? lugar(item.explicadoEm) : null,
					origem: opcoes.origem ?? "anotacao",
					criadoEm: agora,
					alteradoEm: agora,
				};
				lista.push(novo);
				novos.push(novo);
			}
		} else if (item.explicadoEm) reexplicados.push({ id, explicado: lugar(item.explicadoEm) });
		marcas.push({ bloco: item.bloco, trecho: item.trecho, id });
	}
	return { glossario: { versao: VERSAO_GLOSSARIO, termos: lista }, novos: structuredClone(novos), marcas, reexplicados };
}

/**
 * Põe as marcas nos blocos do módulo (marcarTrecho no primeiro texto do bloco
 * onde a marca vale em que o trecho aparece), sem nenhuma outra mudança e sem
 * mudar a versão dos blocos. Uma marca não entra quando o bloco não existe,
 * quando ele mudou de versão desde que foi lido (`versoes`, pelo id do
 * bloco), quando o bloco já tem uma marca daquele termo, ou quando o trecho
 * não aparece fora de código, fórmula e link. Devolve o módulo novo e as
 * marcas que entraram; o recebido não muda.
 */
export function aplicarMarcas<M extends Pick<Modulo, "licoes">>(modulo: M, marcas: readonly MarcaAPor[], versoes: Readonly<Record<string, number>> = {}): { modulo: M; aplicadas: MarcaAPor[] } {
	const copia = structuredClone(modulo);
	const aplicadas: MarcaAPor[] = [];
	for (const marca of marcas) {
		for (const licao of copia.licoes) {
			const indice = licao.blocos.findIndex((bloco) => bloco.id === marca.bloco);
			if (indice < 0) continue;
			const bloco = licao.blocos[indice]!;
			if (versoes[marca.bloco] !== undefined && versoes[marca.bloco] !== versaoDe(bloco)) break;
			if (marcasDoBloco(bloco).some((existente) => existente.id === marca.id)) break;
			let feita = false;
			const novo = mapearTextosDoBloco(
				bloco,
				(texto) => {
					if (feita) return texto;
					const marcado = marcarTrecho(texto, marca.trecho, marca.id);
					if (marcado === undefined) return texto;
					feita = true;
					return marcado;
				},
				(texto) => texto,
			);
			if (feita) {
				licao.blocos[indice] = novo;
				aplicadas.push(marca);
			}
			break;
		}
	}
	return { modulo: copia, aplicadas };
}

// --- Os pedidos de explicação ---------------------------------------------------------------

/** A situação do pedido na tela: com a explicação, pronta; sem ela, explicando se está em `explicando` (o da mensagem "modulo"), senão falhou. */
export function situacaoDaExplicacao(pedido: Pick<ExplicacaoPedida, "id" | "explicacao">, explicando: readonly string[]): SituacaoExplicacao {
	if (typeof pedido.explicacao === "string") return "pronta";
	return explicando.includes(pedido.id) ? "explicando" : "falhou";
}

/** Os pedidos de explicação de um bloco, na ordem em que foram feitos. */
export function explicacoesDoBloco(modulo: { explicacoes?: readonly ExplicacaoPedida[] }, bloco: string): ExplicacaoPedida[] {
	return (modulo.explicacoes ?? []).filter((pedido) => pedido.bloco === bloco);
}

/** O pedido de explicação que a tela manda, conferido (validarPedidoExplicacao). */
export interface PedidoDeExplicacao {
	licao: string;
	bloco: string;
	trecho: string;
	tipo: TipoExplicacao;
}

/** O trecho como fica guardado: aparado, com os espaços (e as quebras de linha) juntados. */
export const trechoLimpo = (valor: unknown) => linhaLimpa(valor);

/** Se o trecho selecionado vale para pedir explicação (a barrinha só aparece com ele): de 1 a 300 caracteres, depois de juntar os espaços. */
export const trechoValido = (valor: unknown) => {
	const trecho = trechoLimpo(valor);
	return trecho.length >= 1 && trecho.length <= MAXIMO_CARACTERES_TRECHO;
};

/** Confere o que a tela mandou no explicar_trecho: a lição, o bloco, o trecho (trechoValido) e o tipo. Fora disso, ErroTermo. */
export function validarPedidoExplicacao(dados: unknown): PedidoDeExplicacao {
	if (!ehObjeto(dados)) throw new ErroTermo("O pedido de explicação não veio no formato.");
	const licao = typeof dados.licao === "string" ? dados.licao.trim() : "";
	const bloco = typeof dados.bloco === "string" ? dados.bloco.trim() : "";
	if (!licao) throw new ErroTermo("Falta o id da lição.");
	if (!bloco) throw new ErroTermo("Falta o id do bloco.");
	if (typeof dados.trecho !== "string") throw new ErroTermo("Falta o trecho selecionado.");
	const trecho = trechoLimpo(dados.trecho);
	if (!trecho) throw new ErroTermo("O trecho selecionado está vazio.");
	if (trecho.length > MAXIMO_CARACTERES_TRECHO) throw new ErroTermo(`O trecho selecionado tem ${trecho.length} caracteres; o máximo é ${MAXIMO_CARACTERES_TRECHO}.`);
	if (!ehTipoExplicacao(dados.tipo)) throw new ErroTermo(`O tipo do pedido não é válido ("${mostrar(dados.tipo)}"): é nao_sei ou explique_melhor.`);
	return { licao, bloco, trecho, tipo: dados.tipo };
}

/**
 * Confere a resposta de prompts/explicar-trecho.md ({"explicacao", "termo"}):
 * a explicação é markdown não vazio, até 2500 caracteres (o prompt pede uns
 * 1500), sem marcas de termo (são desfeitas). O termo: no explique_melhor,
 * sempre null; no nao_sei, {termo, definicao} nos limites, ou null. Com
 * `rigido` (a primeira tentativa), um termo fora dos limites é ErroTermo (a
 * extensão tenta de novo); sem ele, vira null. Explicação que não vale,
 * ErroTermo.
 */
export function validarRespostaExplicacao(resultado: unknown, tipo: TipoExplicacao, rigido = true): { explicacao: string; termo: TermoDaExplicacao | null } {
	if (!ehObjeto(resultado)) throw new ErroTermo("A resposta não é um objeto JSON.");
	const explicacao = semMarcas(textoLimpo(resultado.explicacao));
	if (!explicacao) throw new ErroTermo('Falta a "explicacao".');
	if (explicacao.length > MAXIMO_CARACTERES_EXPLICACAO) throw new ErroTermo(`A explicação tem ${explicacao.length} caracteres; o máximo é ${MAXIMO_CARACTERES_EXPLICACAO} (mire uns ${ALVO_CARACTERES_EXPLICACAO}).`);
	if (tipo === "explique_melhor" || resultado.termo === null || resultado.termo === undefined) return { explicacao, termo: null };
	const termo = ehObjeto(resultado.termo) ? linhaLimpa(resultado.termo.termo) : "";
	const definicao = ehObjeto(resultado.termo) ? textoLimpo(resultado.termo.definicao) : "";
	const problema = !termo ? 'está sem "termo"' : problemaDoTermo(termo, definicao);
	if (problema) {
		if (rigido) throw new ErroTermo(`O "termo" ${problema}.`);
		return { explicacao, termo: null };
	}
	return { explicacao, termo: { termo, definicao } };
}

/**
 * Os textos das explicações (blocos explicacao) antes do bloco do trecho na
 * lição, para a mensagem da explicação: da mais próxima para a mais longe,
 * enquanto couberem em `limite` caracteres (a mais próxima que não cabe
 * inteira vai com o fim, depois de "[…]"); devolvidos na ordem da lição.
 */
export function explicacoesAteOBloco(licao: Pick<Licao, "blocos">, bloco: string, limite: number = LIMITE_CONTEXTO_EXPLICACAO): string[] {
	const indice = licao.blocos.findIndex((item) => item.id === bloco);
	const saida: string[] = [];
	let usados = 0;
	for (let posicao = indice - 1; posicao >= 0; posicao--) {
		const atual = licao.blocos[posicao]!;
		if (atual.tipo !== "explicacao") continue;
		const texto = atual.texto.trim();
		if (usados + texto.length <= limite) {
			saida.unshift(texto);
			usados += texto.length;
			continue;
		}
		if (saida.length === 0) saida.unshift(`[…] ${texto.slice(texto.length - limite)}`);
		break;
	}
	return saida;
}

type ModuloComExplicacoes<M> = M & { explicacoes?: ExplicacaoPedida[] };

/** O módulo gerado, a lição e o bloco; senão, ErroTermo. */
function lugarDoPedido(modulo: Pick<Modulo, "id" | "situacao" | "licoes">, licao: string, bloco: string): { licao: Licao; bloco: Bloco } {
	if (modulo.situacao !== "gerado") throw new ErroTermo(`O módulo ${modulo.id} está aguardando material; não há bloco para explicar.`);
	const daLicao = modulo.licoes.find((item) => item.id === licao);
	if (!daLicao) throw new ErroTermo(`Não achei a lição "${licao}" no módulo ${modulo.id}.`);
	const doBloco = daLicao.blocos.find((item) => item.id === bloco);
	if (!doBloco) throw new ErroTermo(`Não achei o bloco "${bloco}" na lição ${licao}.`);
	return { licao: daLicao, bloco: doBloco };
}

/**
 * Acrescenta um pedido de explicação ao módulo (no fim de `explicacoes`, sem
 * explicação: o modelo ainda vai explicar), com a versão atual do bloco. Os
 * pedidos sem explicação que não estão `emAndamento` (falharam, ou a sessão
 * acabou no meio) saem. Devolve o módulo novo; o recebido não muda. Módulo
 * que não está gerado, lição ou bloco que não existe, ErroTermo.
 */
export function aplicarPedidoExplicacao<M extends Pick<Modulo, "id" | "situacao" | "licoes">>(
	modulo: ModuloComExplicacoes<M>,
	pedido: PedidoDeExplicacao,
	opcoes: { id: string; agora: Date; emAndamento?: ReadonlySet<string> },
): ModuloComExplicacoes<M> {
	const { bloco } = lugarDoPedido(modulo, pedido.licao, pedido.bloco);
	const copia = structuredClone(modulo);
	const emAndamento = opcoes.emAndamento ?? new Set<string>();
	const ficam = (copia.explicacoes ?? []).filter((item) => typeof item.explicacao === "string" || emAndamento.has(item.id));
	ficam.push({ id: opcoes.id, licao: pedido.licao, bloco: pedido.bloco, versao: versaoDe(bloco), trecho: pedido.trecho, tipo: pedido.tipo, em: opcoes.agora.toISOString() });
	copia.explicacoes = ficam;
	return copia;
}

/** Põe a resposta do modelo no pedido (a explicação, o termo, o evento, o modelo e o custo). Sem o pedido, ou com ele já respondido, undefined (a resposta é jogada fora). */
export function aplicarRespostaExplicacao<M extends object>(
	modulo: ModuloComExplicacoes<M>,
	id: string,
	resposta: { explicacao: string; termo: TermoDaExplicacao | null; evento: string; modelo: string; custo: number },
): ModuloComExplicacoes<M> | undefined {
	const indice = (modulo.explicacoes ?? []).findIndex((item) => item.id === id);
	if (indice < 0 || typeof modulo.explicacoes![indice]!.explicacao === "string") return undefined;
	const copia = structuredClone(modulo);
	copia.explicacoes![indice] = { ...copia.explicacoes![indice]!, explicacao: resposta.explicacao, termo: resposta.termo, evento: resposta.evento, modelo: resposta.modelo, custo: resposta.custo };
	return copia;
}

/** Tira um pedido que ainda não tem explicação (a explicação falhou). Sem ele, ou já respondido, undefined (nada muda). */
export function tirarPedidoPendente<M extends object>(modulo: ModuloComExplicacoes<M>, id: string): ModuloComExplicacoes<M> | undefined {
	const atual = (modulo.explicacoes ?? []).find((item) => item.id === id);
	if (!atual || typeof atual.explicacao === "string") return undefined;
	const copia = structuredClone(modulo);
	copia.explicacoes = copia.explicacoes!.filter((item) => item.id !== id);
	if (copia.explicacoes.length === 0) delete copia.explicacoes;
	return copia;
}

/**
 * "Guardar no glossário" (docs/termos.md): o pedido precisa estar respondido,
 * com termo, e ainda não guardado. Se o glossário já tem o termo
 * (formaDoTermo), o pedido só é ligado a ele; senão, o termo entra com
 * origem "pedido" e o explicado no bloco, com o id do pedido. O trecho do
 * pedido ganha a marca no texto do bloco, pelas regras de "Marcar os termos"
 * (aplicarMarcas; se o bloco já tem a marca daquele termo, ou o trecho não
 * aparece, nada muda no texto). O pedido ganha `guardado` com o id do termo.
 * Devolve o módulo e o glossário novos, o termo, se ele entrou agora e se a
 * marca entrou; os recebidos não mudam. Fora disso, ErroTermo.
 */
export function aplicarTermoGuardado<M extends Pick<Modulo, "id" | "licoes">>(
	modulo: ModuloComExplicacoes<M>,
	glossario: Glossario,
	id: string,
	agora: Date,
): { modulo: ModuloComExplicacoes<M>; glossario: Glossario; termo: Termo; novo: boolean; marcado: boolean; pedido: ExplicacaoPedida } {
	const pedido = (modulo.explicacoes ?? []).find((item) => item.id === id);
	if (!pedido) throw new ErroTermo(`Não achei o pedido de explicação "${id}" no módulo ${modulo.id}.`);
	if (typeof pedido.explicacao !== "string") throw new ErroTermo("A explicação deste pedido ainda não chegou.");
	if (!pedido.termo) throw new ErroTermo("Este pedido não tem termo para guardar no glossário.");
	if (pedido.guardado) throw new ErroTermo("O termo deste pedido já foi guardado no glossário.");
	const forma = formaDoTermo(pedido.termo.termo);
	const termos = structuredClone(glossario.termos);
	let termo = termos.find((item) => formaDoTermo(item.termo) === forma);
	const novo = termo === undefined;
	if (!termo) {
		const em = agora.toISOString();
		termo = {
			id: idDoTermo(pedido.termo.termo, termos.map((item) => item.id)),
			termo: pedido.termo.termo,
			definicao: pedido.termo.definicao,
			explicado: { modulo: modulo.id, licao: pedido.licao, bloco: pedido.bloco, explicacao: pedido.id },
			origem: "pedido",
			criadoEm: em,
			alteradoEm: em,
		};
		termos.push(termo);
	}
	const { modulo: marcado, aplicadas } = aplicarMarcas(modulo, [{ bloco: pedido.bloco, trecho: pedido.trecho, id: termo.id }]);
	const copia = marcado as ModuloComExplicacoes<M>;
	copia.explicacoes = copia.explicacoes!.map((item) => (item.id === id ? { ...item, guardado: termo.id } : item));
	return { modulo: copia, glossario: { versao: VERSAO_GLOSSARIO, termos }, termo: structuredClone(termo), novo, marcado: aplicadas.length > 0, pedido: structuredClone(pedido) };
}
