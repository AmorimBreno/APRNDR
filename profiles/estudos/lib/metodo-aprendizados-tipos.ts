// O que facilita para o Breno (docs/metodo-experimentos.md, "O que facilita"):
// os aprendizados que a análise de cada módulo registra, em
// aprendiz/metodo/aprendizados.md, sem nada do Node (a tela importa daqui).
// Ler e escrever o formato markdown (o mesmo dos ajustes, com os estados
// observado, confirmado e contradito), registrar e rever um aprendizado, e o
// bloco <o-que-facilita> que vai nas gerações. Todas as funções são puras.

import {
	comentarioDaOrigem,
	ErroMetodo,
	escreverSecoesMarkdown,
	lerSecoesMarkdown,
	novoIdComPrefixo,
	type OrigemDoMetodo,
	origemDoMetodo,
} from "./metodo-ciclo-tipos.ts";

/** Os estados de um aprendizado: `observado` (a análise viu), `confirmado` (viu de novo) e `contradito` (os números disseram o contrário). */
export const SITUACOES_APRENDIZADO = ["observado", "confirmado", "contradito"] as const;
export type SituacaoAprendizado = (typeof SITUACOES_APRENDIZADO)[number];

export const ehSituacaoAprendizado = (valor: unknown): valor is SituacaoAprendizado => (SITUACOES_APRENDIZADO as readonly unknown[]).includes(valor);

/** As situações que a análise pode dar numa revisão (rever é confirmar ou contradizer). */
export const REVISOES = ["confirmado", "contradito"] as const satisfies readonly SituacaoAprendizado[];

/** O que a análise confere num aprendizado novo. */
export const APRENDIZADO_MAXIMO = 300;
/** Quantos aprendizados uma análise registra, no máximo. */
export const MAXIMO_APRENDIZADOS_POR_ANALISE = 3;
/** Quantos entram nas gerações (os mais recentes). */
export const MAXIMO_NO_BLOCO = 10;

/** A frase que abre o bloco <o-que-facilita>. */
export const FRASE_O_QUE_FACILITA = "O que já se observou que facilita o aprendizado do Breno. Use como orientação, não como regra.";

/** O título de um aprendizados.md novo. */
export const TITULO_DOS_APRENDIZADOS = "O que facilita para o Breno";

/** Um aprendizado do arquivo: o id, a situação, o texto (o que o Breno pode editar à mão) e o comentário de origem como está no arquivo (sem <!-- -->), ou null. */
export interface Aprendizado {
	id: string;
	situacao: SituacaoAprendizado;
	texto: string;
	comentario: string | null;
}

/** O aprendizados.md lido: o título (a linha "# …") e os aprendizados, na ordem (os mais novos no fim). */
export interface AprendizadosDoArquivo {
	titulo: string;
	aprendizados: Aprendizado[];
}

/** Um aprendizado na mensagem ajustes (listar_ajustes). */
export interface AprendizadoNaTela {
	id: string;
	texto: string;
	situacao: SituacaoAprendizado;
	/** null: o aprendizado não diz de onde veio (escrito à mão). */
	origem: OrigemDoMetodo | null;
}

/** Os aprendizados na mensagem ajustes; com `erro`, o arquivo não se lê (e não é sobrescrito). */
export interface AprendizadosNaTela {
	itens: AprendizadoNaTela[];
	erro?: string;
}

/** Um aprendizados.md vazio. */
export const aprendizadosVazios = (): AprendizadosDoArquivo => ({ titulo: TITULO_DOS_APRENDIZADOS, aprendizados: [] });

/**
 * Lê o markdown de aprendizados.md: lerSecoesMarkdown com os estados observado,
 * confirmado e contradito. Um arquivo fora do formato é Error com a frase e a
 * linha (quem lê do disco não sobrescreve o arquivo).
 */
export function lerAprendizadosMarkdown(texto: string): AprendizadosDoArquivo {
	const { titulo, secoes } = lerSecoesMarkdown<SituacaoAprendizado>(texto, {
		estados: { observado: "observado", confirmado: "confirmado", contradito: "contradito" },
		rotulo: "aprendizado",
		formato: '"## <id> · observado" (ou "· confirmado" ou "· contradito")',
	});
	return { titulo: titulo ?? TITULO_DOS_APRENDIZADOS, aprendizados: secoes.map((secao) => ({ id: secao.id, situacao: secao.estado, texto: secao.texto, comentario: secao.comentario })) };
}

/** Escreve o markdown de aprendizados.md, e lerAprendizadosMarkdown lê de volta o mesmo. */
export function escreverAprendizadosMarkdown(conteudo: AprendizadosDoArquivo): string {
	return escreverSecoesMarkdown(
		conteudo.titulo,
		conteudo.aprendizados.map((item) => ({ id: item.id, estado: item.situacao, texto: item.texto, comentario: item.comentario })),
	);
}

/**
 * Confere o texto de um aprendizado: aparado, de 1 a APRENDIZADO_MAXIMO
 * caracteres, sem linha que comece com "## " e sem "<!--" ou "-->" (quebrariam
 * o arquivo). Fora disso, ErroMetodo.
 */
export function validarTextoDoAprendizado(valor: unknown): string {
	if (typeof valor !== "string") throw new ErroMetodo("O texto do aprendizado não é um texto.");
	const texto = valor.trim();
	if (!texto) throw new ErroMetodo("O texto do aprendizado está vazio.");
	if (texto.length > APRENDIZADO_MAXIMO) throw new ErroMetodo(`O texto do aprendizado tem ${texto.length} caracteres; o máximo é ${APRENDIZADO_MAXIMO}.`);
	if (texto.split(/\r?\n/).some((linha) => /^##\s/.test(linha))) throw new ErroMetodo('O texto do aprendizado não pode ter uma linha começando com "## ".');
	if (texto.includes("<!--") || texto.includes("-->")) throw new ErroMetodo('O texto do aprendizado não pode ter "<!--" nem "-->".');
	return texto;
}

/** O comentário de origem de um aprendizado: "origem: <matéria>/<curso>/<módulo> · evidências: a, b · registrado em AAAA-MM-DD". */
export const comentarioDoAprendizado = (origem: { materia: string; curso: string; modulo: string; evidencias: readonly string[]; em: string }) =>
	comentarioDaOrigem({ ...origem, rotuloDaData: "registrado em" });

/** Acrescenta um aprendizado `observado` no fim, com o id novo (ap-AAAAMMDD-N, a data local). Devolve o arquivo novo e o aprendizado; o recebido não muda. */
export function acrescentarAprendizado(
	conteudo: AprendizadosDoArquivo,
	novo: { texto: string; comentario: string | null; agora: Date },
): { conteudo: AprendizadosDoArquivo; aprendizado: Aprendizado } {
	const aprendizado: Aprendizado = {
		id: novoIdComPrefixo("ap", conteudo.aprendizados.map((item) => item.id), novo.agora),
		situacao: "observado",
		texto: validarTextoDoAprendizado(novo.texto),
		comentario: novo.comentario,
	};
	return { conteudo: { ...conteudo, aprendizados: [...conteudo.aprendizados.map((item) => ({ ...item })), aprendizado] }, aprendizado };
}

/** Muda a situação de um aprendizado (rever). Devolve o arquivo novo, o aprendizado e se mudou; um id que não existe é ErroMetodo. */
export function mudarSituacaoDoAprendizado(
	conteudo: AprendizadosDoArquivo,
	id: string,
	situacao: SituacaoAprendizado,
): { conteudo: AprendizadosDoArquivo; aprendizado: Aprendizado; mudou: boolean } {
	const atual = conteudo.aprendizados.find((item) => item.id === id);
	if (!atual) throw new ErroMetodo(`Não achei o aprendizado "${id}" em aprendizados.md.`);
	const aprendizados = conteudo.aprendizados.map((item) => (item.id === id ? { ...item, situacao } : { ...item }));
	return { conteudo: { ...conteudo, aprendizados }, aprendizado: aprendizados.find((item) => item.id === id)!, mudou: atual.situacao !== situacao };
}

/** Os aprendizados como vão na mensagem ajustes. */
export const aprendizadosNaTela = (conteudo: Pick<AprendizadosDoArquivo, "aprendizados">): AprendizadoNaTela[] =>
	conteudo.aprendizados.map((item) => ({ id: item.id, texto: item.texto, situacao: item.situacao, origem: origemDoMetodo(item) }));

/** Os aprendizados que entram nas gerações: `observado` e `confirmado`, os `maximo` mais recentes (os últimos do arquivo), na ordem do arquivo. */
export function aprendizadosQueEntram(conteudo: Pick<AprendizadosDoArquivo, "aprendizados">, maximo: number = MAXIMO_NO_BLOCO): Aprendizado[] {
	return conteudo.aprendizados.filter((item) => item.situacao !== "contradito").slice(-maximo);
}

/**
 * O bloco que vai na geração das lições de um módulo e na reescrita de um
 * bloco: <o-que-facilita>, a FRASE_O_QUE_FACILITA e um item por aprendizado
 * (aprendizadosQueEntram; as linhas seguintes recuadas), e </o-que-facilita>.
 * Sem nenhum, "". O hash do prompt nos eventos inclui este bloco.
 */
export function blocoOQueFacilita(conteudo: Pick<AprendizadosDoArquivo, "aprendizados">, maximo: number = MAXIMO_NO_BLOCO): string {
	const entram = aprendizadosQueEntram(conteudo, maximo);
	if (entram.length === 0) return "";
	const itens = entram.map((item) => `- ${item.texto.trim().split("\n").join("\n  ")}`);
	return ["<o-que-facilita>", FRASE_O_QUE_FACILITA, "", ...itens, "</o-que-facilita>"].join("\n");
}
