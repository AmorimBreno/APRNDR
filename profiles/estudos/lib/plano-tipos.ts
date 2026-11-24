// Os planos de estudos (docs/planos-de-estudo.md, decisão 13.21): os tipos, as
// constantes e as funções puras, sem Node, que a extensão (extensions/planos.ts),
// a gravação (lib/planos.ts) e a tela (paineis) usam. Um plano é uma nota comum
// da matéria com a tag "Plano de estudos · " na primeira linha não vazia: uma
// checklist dos assuntos, o objetivo no alto e o histórico das conversas no fim.
// Este arquivo NÃO importa lib/nota-tipos.ts (é ele que importa daqui).

/** O começo da tag, a primeira linha não vazia da nota (seção 1 do contrato). */
export const INICIO_TAG_PLANO = "Plano de estudos · ";

/** customType da entrada da sessão que diz qual plano a conversa segue: data {titulo: string | null} (seção 2). */
export const TIPO_ENTRADA_PLANO = "estudos.plano";

/** customType da mensagem escondida com o resumo do plano, devolvida no before_agent_start (seção 5). */
export const TIPO_MENSAGEM_PLANO = "estudos.plano";

/** O painel da ponte dos planos (seção 7). */
export const PAINEL_PLANOS = "planos";

/** A ação no painel "mesa" do cartão "Plano criado" (gravar: true), como o nota_criada. */
export const ACAO_PLANO_CRIADO = "plano_criado";

/** A ação no painel "notas" que avisa o editor de que a nota mudou fora dele (seção 3). */
export const ACAO_MUDOU_FORA = "mudou_fora";

/** Limites do criar_plano e do atualizar_plano (seção 4). */
export const LIMITE_ITENS_PLANO = 60;
export const LIMITE_TEXTO_ITEM = 300;

/** Até quantos caracteres vai o resumo do plano ao professor (seção 5). */
export const LIMITE_RESUMO_PLANO = 2000;

/** Um item da checklist: numerado de 1 em diante na ordem do arquivo. */
export interface ItemPlano {
	numero: number;
	/** O markdown da linha, sem o "- [ ] " do começo. */
	texto: string;
	feito: boolean;
}

/** O plano lido de uma nota com a tag. */
export interface PlanoLido {
	/** O texto depois de "**Objetivo:**", sem as marcas; undefined se a linha não existe. */
	objetivo?: string;
	itens: ItemPlano[];
	/** Os ids curtos da seção Conversas, na ordem do arquivo. */
	conversas: string[];
	/** O número do primeiro item não marcado; undefined se não há. */
	atual?: number;
	feitos: number;
	total: number;
	/** Todos marcados e pelo menos um. */
	concluido: boolean;
}

/** Uma mudança pedida pelo professor (atualizar_plano). `texto` em marcar/desmarcar confere o item, se vier. */
export type OperacaoPlano =
	| { tipo: "marcar" | "desmarcar"; item: number; texto?: string }
	| { tipo: "acrescentar"; texto: string; depois?: number };

/** O plano na lista do seletor e da ponte. */
export interface ResumoPlano {
	titulo: string;
	feitos: number;
	total: number;
	concluido: boolean;
}

/** O que a nota de plano mostra na lista de notas (ResumoNota.plano). */
export interface ProgressoPlano {
	feitos: number;
	total: number;
}

// --- A ponte "planos" (seção 7) ---

/** O que a tela manda à extensão, por ação. */
export interface AcoesPlanos {
	listar: { materia: string };
	/** titulo null = soltar ("Nenhum"). */
	seguir: { materia: string; titulo: string | null; sessao: string; pedido: string };
	desfazer_plano: { materia: string; titulo: string; sessao: string; pedido: string };
}

export interface ListaPlanos {
	materia: string;
	/** A sessão a que `seguindo` se refere. */
	sessao: string;
	planos: ResumoPlano[];
	/** O título do plano que a conversa segue, ou null. */
	seguindo: string | null;
}

/** O que a extensão manda à tela, por ação (todas passageiras, gravar: false). */
export interface MensagensPlanos {
	lista: ListaPlanos;
	seguindo: { materia: string; sessao: string; pedido: string; titulo: string | null };
	desfeito: { materia: string; titulo: string; pedido: string };
	erro: { ao: keyof AcoesPlanos; materia?: string; pedido?: string; mensagem: string };
}

/** Os dados do cartão "Plano criado" (painel "mesa", ação plano_criado, gravar: true). `chamada` = id da chamada do criar_plano. */
export interface DadosPlanoCriado {
	materia: string;
	titulo: string;
	rota: string;
	chamada: string;
	sessao: string;
}

/** Os dados do mudou_fora (painel "notas"): o arquivo como ficou depois da gravação do professor. */
export interface DadosMudouFora {
	materia: string;
	titulo: string;
	versao: string;
	conteudo: string;
}

// --- Funções puras ---

const doisDigitos = (numero: number) => String(numero).padStart(2, "0");

/** dd/mm/aaaa no fuso local. */
const dataLocal = (data: Date) => `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;

/** A primeira linha não vazia da nota (sem o BOM); undefined se a nota é só espaço. */
function primeiraLinhaNaoVazia(markdown: string): string | undefined {
	const semBom = markdown.charCodeAt(0) === 0xfeff ? markdown.slice(1) : markdown;
	const achado = /^(?:[ \t]*\r?\n)*([^\r\n]*)/.exec(semBom);
	return achado && achado[1]!.trim() !== "" ? achado[1]! : undefined;
}

/** A primeira linha não vazia começa com "Plano de estudos · " (com ou sem BOM, \n ou \r\n). */
export function ehPlanoDeEstudos(markdown: string): boolean {
	return primeiraLinhaNaoVazia(markdown)?.startsWith(INICIO_TAG_PLANO) ?? false;
}

// --- A leitura por linhas (cada linha guarda o seu fim de linha, para devolver o arquivo byte a byte) ---

const semFim = (linha: string) => linha.replace(/\r?\n$/, "");
const temFim = (linha: string) => linha.endsWith("\n");
const ehCabecalhoDe = (linha: string, nome: string) => new RegExp(`^##[ \\t]+${nome}[ \\t]*$`, "i").test(semFim(linha));
const ehTarefa = /^[-*+][ \t]+\[([ xX])\](?:[ \t]+(.*))?$/;

interface ItemNaLinha {
	/** O índice da linha do item. */
	indice: number;
	/** O índice da última linha do item: ele mais as linhas recuadas que vêm logo depois (subitens, observações). */
	fim: number;
	marcado: boolean;
	texto: string;
}

interface Secao {
	/** O índice da linha do cabeçalho. */
	cabecalho: number;
	/** O índice da primeira linha depois da seção (o próximo cabeçalho de nível 1 ou 2, ou o fim). */
	fim: number;
}

interface Analise {
	linhas: string[];
	itens: ItemNaLinha[];
	secaoItens?: Secao;
	secaoConversas?: Secao;
	objetivo?: string;
	conversas: string[];
}

function analisar(markdown: string): Analise {
	const linhas = markdown.length === 0 ? [] : markdown.split(/(?<=\n)/);
	// Código em bloco (cercas ``` e ~~~): nada dentro dele é item, cabeçalho ou objetivo.
	const emCodigo: boolean[] = [];
	let cerca: string | undefined;
	for (const linha of linhas) {
		const abertura = /^ {0,3}(`{3,}|~{3,})/.exec(linha);
		if (cerca) {
			emCodigo.push(true);
			if (abertura && abertura[1]!.startsWith(cerca)) cerca = undefined;
		} else if (abertura) {
			cerca = abertura[1]!;
			emCodigo.push(true);
		} else {
			emCodigo.push(false);
		}
	}
	const fimDaSecao = (cabecalho: number) => {
		for (let i = cabecalho + 1; i < linhas.length; i++) if (!emCodigo[i] && /^#{1,2}[ \t]/.test(linhas[i]!)) return i;
		return linhas.length;
	};
	const achar = (nome: string): Secao | undefined => {
		for (let i = 0; i < linhas.length; i++) if (!emCodigo[i] && ehCabecalhoDe(linhas[i]!, nome)) return { cabecalho: i, fim: fimDaSecao(i) };
		return undefined;
	};
	const secaoItens = achar("Itens");
	const secaoConversas = achar("Conversas");

	const de = secaoItens ? secaoItens.cabecalho + 1 : 0;
	const ate = secaoItens ? secaoItens.fim : linhas.length;
	const itens: ItemNaLinha[] = [];
	for (let i = de; i < ate; i++) {
		if (emCodigo[i]) continue;
		const achado = ehTarefa.exec(semFim(linhas[i]!));
		if (!achado) continue;
		let fim = i;
		while (fim + 1 < ate && /^[ \t]+\S/.test(linhas[fim + 1]!)) fim++;
		itens.push({ indice: i, fim, marcado: achado[1] !== " ", texto: (achado[2] ?? "").trimEnd() });
	}

	let objetivo: string | undefined;
	for (let i = 0; i < linhas.length; i++) {
		if (emCodigo[i]) continue;
		const achado = /^\*\*Objetivo:\*\*[ \t]*(.*)$/.exec(semFim(linhas[i]!));
		if (achado) {
			objetivo = achado[1]!.trim() || undefined;
			break;
		}
	}

	const conversas: string[] = [];
	if (secaoConversas) {
		for (let i = secaoConversas.cabecalho + 1; i < secaoConversas.fim; i++) {
			const achado = /^[-*+][ \t]+.*\(conversa:([^)\s]+)\)/.exec(semFim(linhas[i]!));
			if (achado) conversas.push(achado[1]!);
		}
	}

	return { linhas, itens, ...(secaoItens ? { secaoItens } : {}), ...(secaoConversas ? { secaoConversas } : {}), ...(objetivo ? { objetivo } : {}), conversas };
}

/** O plano da nota, ou undefined se a nota não tem a tag. Seção 1 do contrato (itens de primeiro nível de "## Itens", ou da nota toda). */
export function lerPlano(markdown: string): PlanoLido | undefined {
	if (!ehPlanoDeEstudos(markdown)) return undefined;
	const analise = analisar(markdown);
	const itens: ItemPlano[] = analise.itens.map((item, i) => ({ numero: i + 1, texto: item.texto, feito: item.marcado }));
	const feitos = itens.filter((item) => item.feito).length;
	const atual = itens.find((item) => !item.feito)?.numero;
	return {
		...(analise.objetivo ? { objetivo: analise.objetivo } : {}),
		itens,
		conversas: analise.conversas,
		...(atual !== undefined ? { atual } : {}),
		feitos,
		total: itens.length,
		concluido: itens.length > 0 && feitos === itens.length,
	};
}

// --- As operações ---

/** O fim de linha do arquivo: CRLF se ele usa CRLF. */
const fimDoArquivo = (markdown: string) => (markdown.includes("\r\n") ? "\r\n" : "\n");

/** O texto de um item numa linha só, sem o marcador de lista nem o "[ ]" que o professor possa ter escrito. */
function limparTexto(bruto: string): string {
	return bruto
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[-*+][ \t]+(\[[ xX]\][ \t]+)?/, "");
}

/** Para conferir o texto de um item: sem marcas do markdown, sem diferença de maiúsculas e de espaços. */
const paraConferir = (texto: string) => texto.replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Insere `texto` (sem fim de linha) depois da linha `indice` (-1 = no começo), com o fim de linha da linha de
 * referência. Se ela é a última e não tem fim de linha, ganha um e a nova linha fica sem (o fim do arquivo continua igual).
 */
function inserirDepois(linhas: string[], indice: number, texto: string, fimArquivo: string): string[] {
	const copia = [...linhas];
	const referencia = linhas[indice];
	if (referencia === undefined) {
		copia.splice(indice + 1, 0, `${texto}${fimArquivo}`);
	} else if (!temFim(referencia)) {
		copia[indice] = `${referencia}${fimArquivo}`;
		copia.splice(indice + 1, 0, texto);
	} else {
		copia.splice(indice + 1, 0, `${texto}${referencia.endsWith("\r\n") ? "\r\n" : "\n"}`);
	}
	return copia;
}

/** Acrescenta uma seção nova no fim do arquivo, separada por uma linha em branco. */
function acrescentarSecaoNoFim(markdown: string, cabecalho: string, linha: string): string {
	const fim = fimDoArquivo(markdown);
	const base = markdown === "" || markdown.endsWith("\n") ? markdown : `${markdown}${fim}`;
	const separador = base === "" || /\n[ \t]*\r?\n$/.test(base) ? "" : fim;
	return `${base}${separador}${cabecalho}${fim}${linha}${fim}`;
}

function aplicarUma(markdown: string, operacao: OperacaoPlano): { markdown: string } | { erro: string } {
	const analise = analisar(markdown);
	const total = analise.itens.length;
	const semItem = (numero: number) =>
		total === 0 ? `O plano não tem itens (pedi o item ${numero}).` : `O plano não tem o item ${numero}: ele tem ${total} ${total === 1 ? "item" : "itens"}, de 1 a ${total}.`;

	if (operacao.tipo !== "acrescentar") {
		if (!Number.isInteger(operacao.item) || operacao.item < 1 || operacao.item > total) return { erro: semItem(operacao.item) };
		const item = analise.itens[operacao.item - 1]!;
		if (typeof operacao.texto === "string" && operacao.texto.trim() !== "") {
			const pedido = paraConferir(operacao.texto);
			const real = paraConferir(item.texto);
			if (!real.includes(pedido) && !pedido.includes(real)) {
				return { erro: `O item ${operacao.item} é "${item.texto}", não o que você disse ("${operacao.texto.trim()}"). Veja o plano com ler_plano.` };
			}
		}
		const linhas = [...analise.linhas];
		linhas[item.indice] = linhas[item.indice]!.replace(/^([-*+][ \t]+\[)[ xX](\])/, `$1${operacao.tipo === "marcar" ? "x" : " "}$2`);
		return { markdown: linhas.join("") };
	}

	const texto = limparTexto(operacao.texto ?? "");
	if (texto === "") return { erro: "O texto do item novo está vazio." };
	if (texto.length > LIMITE_TEXTO_ITEM) return { erro: `O texto do item passa de ${LIMITE_TEXTO_ITEM} caracteres; escreva um assunto mais curto.` };
	if (total >= LIMITE_ITENS_PLANO) return { erro: `O plano já tem ${total} itens, o máximo (${LIMITE_ITENS_PLANO}).` };
	const novaLinha = `- [ ] ${texto}`;
	const fim = fimDoArquivo(markdown);

	let depois: number | undefined;
	if (operacao.depois !== undefined) {
		if (!Number.isInteger(operacao.depois) || operacao.depois < 0 || operacao.depois > total) return { erro: semItem(operacao.depois) };
		depois = operacao.depois;
	}
	if (total > 0) {
		const indice = depois === undefined ? analise.itens[total - 1]!.fim : depois === 0 ? analise.itens[0]!.indice - 1 : analise.itens[depois - 1]!.fim;
		return { markdown: inserirDepois(analise.linhas, indice, novaLinha, fim).join("") };
	}
	if (analise.secaoItens) return { markdown: inserirDepois(analise.linhas, analise.secaoItens.cabecalho, novaLinha, fim).join("") };
	return { markdown: acrescentarSecaoNoFim(markdown, "## Itens", novaLinha) };
}

/**
 * Aplica as operações em ordem. Cada uma mexe só na linha do item, numa linha nova da lista ou em nada mais; o resto
 * fica byte a byte igual (o fim de linha do arquivo é mantido). Erro (com a frase para o professor) se a nota não é
 * plano, se um item não existe, se o texto conferido não bate ou se um texto novo passa do limite ou é vazio.
 */
export function aplicarOperacoes(markdown: string, operacoes: readonly OperacaoPlano[]): { markdown: string } | { erro: string } {
	if (!ehPlanoDeEstudos(markdown)) return { erro: `Esta nota não é um plano de estudos (falta a linha "${INICIO_TAG_PLANO}…" no começo).` };
	let atual = markdown;
	for (const operacao of operacoes) {
		const resultado = aplicarUma(atual, operacao);
		if ("erro" in resultado) return resultado;
		atual = resultado.markdown;
	}
	return { markdown: atual };
}

/** Acrescenta "- [<data>](conversa:<id>)" à seção "## Conversas" (criando a seção no fim, se falta). Se o id já está lá, devolve igual. */
export function acrescentarConversa(markdown: string, idCurto: string, data: string): string {
	const analise = analisar(markdown);
	if (analise.conversas.includes(idCurto)) return markdown;
	const linha = `- [${data}](conversa:${idCurto})`;
	const secao = analise.secaoConversas;
	if (!secao) return acrescentarSecaoNoFim(markdown, "## Conversas", linha);
	// Depois da última linha com texto da seção (o próprio cabeçalho, se ela está vazia).
	let ultima = secao.cabecalho;
	for (let i = secao.cabecalho + 1; i < secao.fim; i++) if (analise.linhas[i]!.trim() !== "") ultima = i;
	return inserirDepois(analise.linhas, ultima, linha, fimDoArquivo(markdown)).join("");
}

/** O markdown de um plano novo: a tag com a data local (dd/mm/aaaa), o objetivo (se vier), "## Itens" com as tarefas e "## Conversas" vazia. */
export function montarPlano(entrada: { objetivo?: string; itens: readonly string[]; em: Date }): string {
	const objetivo = limparTexto(entrada.objetivo ?? "");
	const linhas = [
		`${INICIO_TAG_PLANO}criado em ${dataLocal(entrada.em)}`,
		...(objetivo ? [`**Objetivo:** ${objetivo}`] : []),
		"",
		"## Itens",
		...entrada.itens
			.map(limparTexto)
			.filter((texto) => texto !== "")
			.map((texto) => `- [ ] ${texto}`),
		"",
		"## Conversas",
	];
	return `${linhas.join("\n")}\n`;
}

const umaLinha = (texto: string) => texto.replace(/\s+/g, " ").trim();
const cortar = (texto: string, maximo: number) => (texto.length > maximo ? `${texto.slice(0, Math.max(1, maximo - 1)).trimEnd()}…` : texto);

/** O texto escondido que vai ao professor (seção 5), até LIMITE_RESUMO_PLANO caracteres. */
export function resumoParaProfessor(titulo: string, plano: PlanoLido): string {
	const objetivo = plano.objetivo ? ` Objetivo: ${cortar(umaLinha(plano.objetivo), 300)}` : "";
	const cabeca = `Esta conversa segue o plano de estudos "${umaLinha(titulo)}" (uma nota do caderno).${objetivo}\nItens:`;
	const regra = plano.concluido
		? "Todos os itens estão marcados. Se o Breno quiser mais, proponha itens novos."
		: "Siga os itens em ordem; quando terminar de ensinar um item, marque com atualizar_plano.";
	const cauda = `${regra} Para ver o plano inteiro, ler_plano.`;
	const linhaDe = (item: ItemPlano, maximo: number) =>
		`${item.numero}. [${item.feito ? "x" : " "}] ${cortar(umaLinha(item.texto), maximo)}${item.numero === plano.atual ? " (atual)" : ""}`;
	const montar = (itens: readonly ItemPlano[], maximo: number, omitidos: number) => {
		const corpo = itens.length === 0 ? ["(nenhum item ainda)"] : itens.map((item) => linhaDe(item, maximo));
		if (omitidos > 0) corpo.push(`(mais ${omitidos} ${omitidos === 1 ? "item" : "itens"}: veja com ler_plano)`);
		return `${cabeca}\n${corpo.join("\n")}\n${cauda}`;
	};
	for (const maximo of [LIMITE_TEXTO_ITEM, 150, 100, 70, 40, 20]) {
		const texto = montar(plano.itens, maximo, 0);
		if (texto.length <= LIMITE_RESUMO_PLANO) return texto;
	}
	// Ainda não coube: corta itens do fim, mas o atual (e os feitos antes dele) ficam.
	const minimo = Math.max(1, plano.atual ?? 1);
	for (let quantos = plano.itens.length - 1; quantos >= minimo; quantos--) {
		const texto = montar(plano.itens.slice(0, quantos), 20, plano.itens.length - quantos);
		if (texto.length <= LIMITE_RESUMO_PLANO) return texto;
	}
	return montar(plano.itens.slice(0, minimo), 20, plano.itens.length - minimo).slice(0, LIMITE_RESUMO_PLANO);
}

/** O plano que a conversa segue: o titulo da última entrada TIPO_ENTRADA_PLANO do ramo; null/ausente = undefined. */
export function planoSeguido(entradas: ReadonlyArray<{ type?: string; customType?: string; data?: unknown }>): string | undefined {
	let titulo: string | undefined;
	for (const entrada of entradas) {
		if (entrada.type !== "custom" || entrada.customType !== TIPO_ENTRADA_PLANO) continue;
		const valor = (entrada.data as { titulo?: unknown } | undefined)?.titulo;
		titulo = typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
	}
	return titulo;
}
