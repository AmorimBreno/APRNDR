// Os planos de estudos no disco (docs/planos-de-estudo.md, seções 3 e 6). Um plano é uma nota
// comum da matéria (lib/notas.ts) com a tag na primeira linha; as funções puras ficam em
// plano-tipos.ts. Aqui ficam: listar os planos, ler, criar, atualizar (ler, aplicar as operações
// e gravar com a versão lida, até 3 tentativas), acrescentar a conversa ao histórico, desfazer a
// criação e os eventos dos planos. O professor só grava por aqui, nunca reescreve a nota.
// Só Node: o pi carrega esta lib. Quem chama põe tudo isto na fila da nota (a extensão faz).

import { readFile, rm } from "node:fs/promises";
import { acrescentarEvento, criarEvento, lerEventos, type VerboEvento } from "./eventos.ts";
import { ErroMaterias, eventosMateria } from "./materias.ts";
import { arquivoContinuaIgual, hashDoArquivo } from "./nota-do-professor.ts";
import { conferirTitulo, type NotaAberta, temHtmlDesconhecido } from "./nota-tipos.ts";
import { arquivoNota, comTravaDaNota, criarNota, ErroConflito, garantirMateria, lerNota, listarNotas, salvarNota, versaoDe } from "./notas.ts";
import {
	acrescentarConversa,
	aplicarOperacoes,
	LIMITE_ITENS_PLANO,
	LIMITE_TEXTO_ITEM,
	lerPlano,
	montarPlano,
	type OperacaoPlano,
	type PlanoLido,
	type ResumoPlano,
} from "./plano-tipos.ts";
import { idCurtoDaConversa } from "./trecho-guardado.ts";

/** Quantas vezes o atualizar relê e reaplica se a nota mudou no meio da gravação. */
const TENTATIVAS = 3;

/** Até quantos caracteres tem o objetivo de um plano novo. */
const LIMITE_OBJETIVO = 500;

const umaLinha = (texto: string) => texto.replace(/\s+/g, " ").trim();

const doisDigitos = (numero: number) => String(numero).padStart(2, "0");

/** dd/mm/aaaa no fuso local. */
const dataLocal = (data: Date) => `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;

/** Os planos da matéria (as notas com a tag), da mexida mais recente para a mais antiga, com o progresso. */
export async function listarPlanos(dados: string, materia: string): Promise<ResumoPlano[]> {
	const lista = await listarNotas(dados, materia);
	const planos: ResumoPlano[] = [];
	for (const nota of lista.notas) {
		if (nota.plano) planos.push({ titulo: nota.titulo, feitos: nota.plano.feitos, total: nota.plano.total, concluido: nota.plano.total > 0 && nota.plano.feitos === nota.plano.total });
	}
	return planos;
}

/** A nota e o plano lido dela. Uma nota sem a tag é recusada (o professor só grava em planos). */
export async function lerPlanoDaNota(dados: string, materia: string, titulo: string): Promise<{ nota: NotaAberta; plano: PlanoLido }> {
	const nota = await lerNota(dados, materia, titulo);
	const plano = lerPlano(nota.conteudo);
	if (!plano) {
		throw new ErroMaterias(`A nota "${nota.titulo}" não é um plano de estudos (falta a linha "Plano de estudos · …" no começo). Eu só leio e mudo planos.`);
	}
	return { nota, plano };
}

/** Grava um evento dos planos no eventos.jsonl da matéria. */
export async function registrarEventoPlano(dados: string, materia: string, sessao: string | undefined, verbo: VerboEvento, objeto: Record<string, unknown>): Promise<void> {
	await acrescentarEvento(eventosMateria(dados, materia), criarEvento({ ...(sessao ? { sessao } : {}), verbo, objeto: { materia, ...objeto } }));
}

export interface EntradaCriarPlano {
	titulo: string;
	objetivo?: string;
	itens: readonly string[];
	sessao: string;
	em?: Date;
}

/**
 * Cria o plano: confere título, limites e HTML, cria a nota (criarNota recusa um título que já existe, nunca sobrescreve),
 * grava o arquivo com a tag e o evento criou_plano com o hash do arquivo. Se algo falha depois da nota nascer, desfaz o
 * que gravou (só se o arquivo ainda é o dela). Lança ErroMaterias com a frase para o professor.
 */
export async function criarPlano(dados: string, materia: string, entrada: EntradaCriarPlano): Promise<{ titulo: string; itens: number; versao: string; hash: string; conteudo: string }> {
	const conferido = conferirTitulo(entrada.titulo);
	if ("erro" in conferido) throw new ErroMaterias(conferido.erro);
	const itens = entrada.itens.map(umaLinha);
	if (itens.length === 0) throw new ErroMaterias("O plano precisa de pelo menos um item.");
	if (itens.length > LIMITE_ITENS_PLANO) throw new ErroMaterias(`O plano passa de ${LIMITE_ITENS_PLANO} itens; junte assuntos parecidos.`);
	const vazio = itens.findIndex((texto) => texto === "");
	if (vazio >= 0) throw new ErroMaterias(`O item ${vazio + 1} está vazio.`);
	const comprido = itens.findIndex((texto) => texto.length > LIMITE_TEXTO_ITEM);
	if (comprido >= 0) throw new ErroMaterias(`O item ${comprido + 1} passa de ${LIMITE_TEXTO_ITEM} caracteres; escreva um assunto mais curto.`);
	const objetivo = umaLinha(entrada.objetivo ?? "");
	if (objetivo.length > LIMITE_OBJETIVO) throw new ErroMaterias(`O objetivo passa de ${LIMITE_OBJETIVO} caracteres; resuma.`);
	if (temHtmlDesconhecido([objetivo, ...itens].join("\n"))) {
		throw new ErroMaterias("O texto tem HTML que o editor das notas não conhece. Escreva em markdown puro (fórmulas com $...$).");
	}
	const em = entrada.em ?? new Date();
	// A conversa que cria o plano já entra no histórico: assim o hash do criou_plano cobre o link, e o Desfazer
	// continua valendo depois da próxima mensagem do Breno (que, sem isso, acrescentaria o link e mudaria o arquivo).
	const texto = acrescentarConversa(montarPlano({ ...(objetivo ? { objetivo } : {}), itens, em }), idCurtoDaConversa(entrada.sessao), dataLocal(em));
	const nota = await criarNota(dados, materia, conferido.titulo, { sessao: entrada.sessao });
	try {
		const salva = await salvarNota(dados, materia, nota.titulo, texto, { versao: versaoDe(""), sessao: entrada.sessao });
		const hash = hashDoArquivo(texto);
		await registrarEventoPlano(dados, materia, entrada.sessao, "criou_plano", { titulo: nota.titulo, itens: itens.length, hash });
		return { titulo: nota.titulo, itens: itens.length, versao: salva.versao, hash, conteudo: texto };
	} catch (erro) {
		// Não deixa uma nota vazia ou pela metade para trás, mas nunca apaga o que não é nosso.
		const arquivo = arquivoNota(dados, materia, nota.titulo);
		const atual = await readFile(arquivo, "utf8").catch(() => undefined);
		if (atual === "" || atual === texto) await rm(arquivo, { force: true }).catch(() => undefined);
		throw erro;
	}
}

export interface PlanoGravado {
	titulo: string;
	versao: string;
	modificadaEm: string;
	/** O arquivo como ficou. */
	conteudo: string;
	plano: PlanoLido;
	/** false: as operações não mudavam nada (o item já estava assim) e nada foi gravado. */
	mudou: boolean;
	/** O hash do arquivo antes e depois da gravação (iguais quando nada mudou): a cadeia que o Desfazer confere. */
	hashAntes: string;
	hash: string;
}

/** Lê, transforma e grava com a versão lida; se a nota mudou no meio, relê e refaz, até TENTATIVAS vezes. */
async function gravarNoPlano(
	dados: string,
	materia: string,
	titulo: string,
	sessao: string | undefined,
	transformar: (markdown: string) => { markdown: string } | { erro: string },
): Promise<PlanoGravado> {
	for (let tentativa = 1; ; tentativa++) {
		const { nota } = await lerPlanoDaNota(dados, materia, titulo);
		const resultado = transformar(nota.conteudo);
		if ("erro" in resultado) throw new ErroMaterias(`${resultado.erro} Nada foi mudado.`);
		if (resultado.markdown === nota.conteudo) {
			const hash = hashDoArquivo(nota.conteudo);
			return { titulo: nota.titulo, versao: nota.versao, modificadaEm: nota.modificadaEm, conteudo: nota.conteudo, plano: lerPlano(nota.conteudo)!, mudou: false, hashAntes: hash, hash };
		}
		try {
			const salva = await salvarNota(dados, materia, nota.titulo, resultado.markdown, { versao: nota.versao, ...(sessao ? { sessao } : {}) });
			const conteudo = resultado.markdown === "" || resultado.markdown.endsWith("\n") ? resultado.markdown : `${resultado.markdown}\n`;
			return { titulo: nota.titulo, versao: salva.versao, modificadaEm: salva.modificadaEm, conteudo, plano: lerPlano(conteudo)!, mudou: true, hashAntes: hashDoArquivo(nota.conteudo), hash: hashDoArquivo(conteudo) };
		} catch (erro) {
			if (!(erro instanceof ErroConflito)) throw erro;
			if (tentativa >= TENTATIVAS) {
				throw new ErroMaterias("A nota do plano mudou várias vezes enquanto eu gravava. Nada foi mudado; leia o plano de novo com ler_plano e repita.");
			}
		}
	}
}

/** Aplica as operações no plano (marcar, desmarcar, acrescentar) e grava o evento atualizou_plano. */
export async function atualizarPlano(dados: string, materia: string, titulo: string, operacoes: readonly OperacaoPlano[], contexto: { sessao?: string } = {}): Promise<PlanoGravado> {
	if (operacoes.length === 0) throw new ErroMaterias("Não há nenhuma operação para fazer no plano.");
	for (const operacao of operacoes) {
		if (operacao.tipo === "acrescentar" && temHtmlDesconhecido(operacao.texto)) {
			throw new ErroMaterias("O texto do item tem HTML que o editor das notas não conhece. Escreva em markdown puro. Nada foi mudado.");
		}
	}
	const gravado = await gravarNoPlano(dados, materia, titulo, contexto.sessao, (markdown) => aplicarOperacoes(markdown, operacoes));
	if (gravado.mudou) await registrarEventoPlano(dados, materia, contexto.sessao, "atualizou_plano", { titulo: gravado.titulo, operacoes, antes: gravado.hashAntes, hash: gravado.hash });
	return gravado;
}

/**
 * Acrescenta a conversa ao histórico do plano (a seção Conversas), se o id curto dela ainda não está lá, e grava
 * ligou_plano. Soltar o plano depois não tira o link.
 */
export async function acrescentarConversaNoPlano(dados: string, materia: string, titulo: string, sessao: string, em: Date = new Date()): Promise<PlanoGravado> {
	const idCurto = idCurtoDaConversa(sessao);
	const gravado = await gravarNoPlano(dados, materia, titulo, sessao, (markdown) => ({ markdown: acrescentarConversa(markdown, idCurto, dataLocal(em)) }));
	if (gravado.mudou) await registrarEventoPlano(dados, materia, sessao, "ligou_plano", { titulo: gravado.titulo, conversa: idCurto, antes: gravado.hashAntes, hash: gravado.hash });
	return gravado;
}

const mesmo = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

/**
 * Desfaz um plano criado pelo professor. `tituloPedido` é o título com que ele foi criado (o do cartão). A partir do
 * último criou_plano com esse título, segue os eventos da matéria: renomeou_nota troca o título (o Breno renomeou),
 * e atualizou_plano e ligou_plano são gravações do professor, cada uma com o hash do arquivo antes e depois. Só apaga
 * se a cadeia não tem buraco (cada gravação do professor partiu do arquivo que a anterior deixou: nenhuma edição do
 * Breno no meio) e o arquivo de agora é o que a última deixou. Depois grava desfez_plano. Devolve o título de agora.
 * Lança ErroMaterias com a razão (e "Nada foi apagado.") quando recusa.
 */
export async function desfazerPlano(dados: string, materia: string, tituloPedido: string, sessao: string): Promise<string> {
	await garantirMateria(dados, materia);
	const { eventos } = await lerEventos(eventosMateria(dados, materia));
	const daMateria = eventos.filter((evento) => evento.objeto.materia === materia);
	let inicio = -1;
	for (let i = 0; i < daMateria.length; i++) if (daMateria[i]!.verbo === "criou_plano" && mesmo(daMateria[i]!.objeto.titulo, tituloPedido)) inicio = i;
	if (inicio < 0) throw new ErroMaterias("Este plano não foi criado pelo professor. Nada foi apagado.");
	const criacao = daMateria[inicio]!;
	let titulo = typeof criacao.objeto.titulo === "string" ? criacao.objeto.titulo : "";
	let hash = typeof criacao.objeto.hash === "string" ? criacao.objeto.hash : undefined;
	let mexido = false;
	for (const evento of daMateria.slice(inicio + 1)) {
		if (evento.verbo === "renomeou_nota") {
			const { de, para } = (evento.resultado ?? {}) as { de?: unknown; para?: unknown };
			if (mesmo(de, titulo) && typeof para === "string") titulo = para;
			continue;
		}
		if (!mesmo(evento.objeto.titulo, titulo)) continue;
		if (evento.verbo === "desfez_plano") throw new ErroMaterias("Este plano já foi desfeito. Nada foi apagado.");
		if (evento.verbo === "atualizou_plano" || evento.verbo === "ligou_plano") {
			const { antes, hash: depois } = evento.objeto as { antes?: unknown; hash?: unknown };
			// Sem os hashes (eventos de antes da cadeia) ou partindo de outro arquivo: houve mudança que não é do professor.
			if (typeof antes !== "string" || typeof depois !== "string" || antes !== hash) mexido = true;
			else hash = depois;
		}
	}
	const conferido = conferirTitulo(titulo);
	if ("erro" in conferido || hash === undefined) throw new ErroMaterias("O registro da criação deste plano está incompleto. Nada foi apagado.");
	if (mexido) throw new ErroMaterias("Você mudou o plano depois que o professor o criou; por isso não o apaguei. Nada foi apagado.");
	const arquivo = arquivoNota(dados, materia, conferido.titulo);
	const esperado = hash;
	// Na trava do arquivo: um salvamento do editor não entra entre a conferência e o apagar.
	await comTravaDaNota(arquivo, async () => {
		let bytes: Buffer;
		try {
			bytes = await readFile(arquivo);
		} catch (erro) {
			if ((erro as NodeJS.ErrnoException).code === "ENOENT") throw new ErroMaterias("O plano não existe mais (foi apagado). Nada foi apagado.");
			throw erro;
		}
		if (!arquivoContinuaIgual(bytes, esperado)) throw new ErroMaterias("Você mudou o plano depois que o professor o criou; por isso não o apaguei. Nada foi apagado.");
		await rm(arquivo, { maxRetries: 5, retryDelay: 50 });
	});
	await registrarEventoPlano(dados, materia, sessao, "desfez_plano", { titulo: conferido.titulo });
	return conferido.titulo;
}
