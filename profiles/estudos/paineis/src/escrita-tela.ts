// As partes puras da escrita dos módulos na tela (docs/escrita.md, "A tela"):
// os textos de "Como o professor escreve" (a linha do contrato, o vazio, a
// etiqueta da origem), a matéria de uma regra no seletor (Todas as matérias ou
// uma pelo nome), o balão de retorno de um bloco (a avaliação, os motivos, o
// texto e o "Virar regra de escrita", e o que vai para a ponte) e as versões
// anteriores de um bloco reescrito ("Reescrito", "Ver a versão anterior",
// "Versão 1 de 3").
// Sem React e sem o design system: os testes (escrita-tela.test.ts) rodam no
// Node.

import {
	type AvaliacaoBloco,
	type MotivoRetorno,
	MOTIVOS_RETORNO,
	type RegraEscrita,
	TEXTO_REGRA_MAXIMO,
	TEXTO_RETORNO_MAXIMO,
	validarRetorno,
} from "../../lib/escrita-tipos.ts";
import { type Bloco, type BlocoAnterior, versaoDoBloco } from "../../lib/modulo-tipos.ts";
import { diaEMes } from "./modulo-tela.ts";

// --- Como o professor escreve --------------------------------------------------

export const TITULO_ESCRITA = "Como o professor escreve";

/** A linha do topo do modal (docs/escrita.md, "A tela"). */
export const LINHA_CONTRATO = "Estas regras valem em todo módulo e em toda questão que o professor gerar. Um retorno num bloco também pode virar regra.";

/** O vazio. */
export const TITULO_SEM_REGRAS = "Nenhuma regra ainda";
export const EXEMPLO_REGRA = "Ex.: Comece sempre por um exemplo concreto com números.";

/** A etiqueta de uma regra criada a partir de um retorno de bloco. */
export const ROTULO_DE_RETORNO = "de um retorno";

/** A etiqueta da origem da regra: só a que veio de um retorno tem. */
export const rotuloDaOrigem = (regra: Pick<RegraEscrita, "origem">): string | undefined => (regra.origem === "retorno" ? ROTULO_DE_RETORNO : undefined);

/** "3 regras · 2 ligadas"; sem regras, "Nenhuma regra". */
export function contagemDasRegras(regras: ReadonlyArray<Pick<RegraEscrita, "ativa">>): string {
	if (regras.length === 0) return "Nenhuma regra";
	const ligadas = regras.filter((regra) => regra.ativa).length;
	const total = `${regras.length} ${regras.length === 1 ? "regra" : "regras"}`;
	if (ligadas === regras.length) return total;
	return `${total} · ${ligadas} ${ligadas === 1 ? "ligada" : "ligadas"}`;
}

// --- A matéria de uma regra (o seletor) ----------------------------------------------

/** O id da opção "Todas as matérias" no MenuSuspenso (a matéria null); não é um id de matéria válido (tem ":"). */
export const OPCAO_TODAS = ":todas";
export const NOME_TODAS = "Todas as matérias";

/** As opções do seletor: "Todas as matérias" e cada matéria pelo nome, na ordem recebida. */
export function opcoesDeMateria(materias: ReadonlyArray<{ id: string; nome: string }>): Array<{ id: string; titulo: string }> {
	return [{ id: OPCAO_TODAS, titulo: NOME_TODAS }, ...materias.map((materia) => ({ id: materia.id, titulo: materia.nome }))];
}

/** A opção do seletor de uma matéria (null = todas). */
export const opcaoDaMateria = (materia: string | null): string => materia ?? OPCAO_TODAS;

/** A matéria de uma opção do seletor. */
export const materiaDaOpcao = (opcao: string): string | null => (opcao === OPCAO_TODAS ? null : opcao);

/** O nome que o botão do seletor mostra: "Todas as matérias", o nome da matéria ou, se ela não está na lista, o id. */
export function nomeDaMateria(materia: string | null, materias: ReadonlyArray<{ id: string; nome: string }>): string {
	if (materia === null) return NOME_TODAS;
	return materias.find((item) => item.id === materia)?.nome ?? materia;
}

/** As opções do seletor de uma regra: com a matéria dela, mesmo se ela não está mais na lista (para não sumir do botão). */
export function opcoesDaRegra(materia: string | null, materias: ReadonlyArray<{ id: string; nome: string }>): Array<{ id: string; titulo: string }> {
	const opcoes = opcoesDeMateria(materias);
	if (materia !== null && !materias.some((item) => item.id === materia)) opcoes.push({ id: materia, titulo: materia });
	return opcoes;
}

// --- O balão de retorno de um bloco --------------------------------------------------

/** O que o Breno marcou no balão de retorno de um bloco. */
export interface BalaoRetorno {
	avaliacao?: AvaliacaoBloco;
	/** Só com "Precisa melhorar"; na ordem de MOTIVOS_RETORNO. */
	motivos: MotivoRetorno[];
	/** "O que você quer diferente?" (opcional). */
	texto: string;
	/** "Virar regra de escrita". */
	virarRegra: boolean;
	/** O texto da regra: acompanha o do retorno até o Breno mexer nele. */
	textoRegra: string;
	regraEditada: boolean;
	/** A regra vale só para esta matéria (senão, para todas). */
	soEstaMateria: boolean;
}

export const balaoVazio = (): BalaoRetorno => ({ motivos: [], texto: "", virarRegra: false, textoRegra: "", regraEditada: false, soEstaMateria: false });

/** O texto da regra a partir do retorno: o texto dele, aparado, até 300 caracteres. */
export const textoDaRegra = (texto: string): string => texto.trim().slice(0, TEXTO_REGRA_MAXIMO);

/** Bom ou Precisa melhorar; com Bom, os motivos saem (são só do "Precisa melhorar"). */
export function escolherAvaliacao(balao: BalaoRetorno, avaliacao: AvaliacaoBloco): BalaoRetorno {
	return { ...balao, avaliacao, motivos: avaliacao === "bom" ? [] : balao.motivos };
}

/** Marca ou desmarca um motivo (só com "Precisa melhorar"), mantendo a ordem da lista. */
export function alternarMotivo(balao: BalaoRetorno, motivo: MotivoRetorno): BalaoRetorno {
	if (balao.avaliacao !== "melhorar") return balao;
	const marcados = balao.motivos.includes(motivo) ? balao.motivos.filter((item) => item !== motivo) : [...balao.motivos, motivo];
	return { ...balao, motivos: MOTIVOS_RETORNO.filter((item) => marcados.includes(item)) };
}

/** O texto do retorno; a regra, enquanto o Breno não mexeu nela, acompanha. */
export function mudarTextoRetorno(balao: BalaoRetorno, texto: string): BalaoRetorno {
	return { ...balao, texto, ...(balao.regraEditada ? {} : { textoRegra: textoDaRegra(texto) }) };
}

/** Liga ou desliga "Virar regra de escrita"; ao ligar sem ter mexido na regra, ela vem do texto do retorno. */
export function marcarVirarRegra(balao: BalaoRetorno, virarRegra: boolean): BalaoRetorno {
	return { ...balao, virarRegra, ...(virarRegra && !balao.regraEditada ? { textoRegra: textoDaRegra(balao.texto) } : {}) };
}

/** O Breno mexeu no texto da regra: daqui em diante ela não acompanha mais o retorno. */
export function mudarTextoRegra(balao: BalaoRetorno, textoRegra: string): BalaoRetorno {
	return { ...balao, textoRegra, regraEditada: true };
}

/** "Salvar e reescrever o bloco" só aparece com "Precisa melhorar". */
export const podeReescrever = (balao: Pick<BalaoRetorno, "avaliacao">): boolean => balao.avaliacao === "melhorar";

/** O que falta para salvar, numa frase; pronto, undefined. */
export function problemaDoBalao(balao: BalaoRetorno): string | undefined {
	if (!balao.avaliacao) return "Escolha Bom ou Precisa melhorar.";
	if (balao.texto.trim().length > TEXTO_RETORNO_MAXIMO) return `O texto tem ${balao.texto.trim().length} caracteres; o máximo é ${TEXTO_RETORNO_MAXIMO}.`;
	if (balao.virarRegra) {
		const regra = balao.textoRegra.trim();
		if (!regra) return "Escreva o texto da regra.";
		if (regra.length > TEXTO_REGRA_MAXIMO) return `A regra tem ${regra.length} caracteres; o máximo é ${TEXTO_REGRA_MAXIMO}.`;
	}
	return undefined;
}

/** O que vai na ação "retorno" (sem de onde é o bloco nem o pedido). */
export interface DadosDoRetorno {
	avaliacao: AvaliacaoBloco;
	motivos: MotivoRetorno[];
	texto?: string;
	virarRegra?: { texto: string; materia: string | null };
}

/**
 * O retorno para a ponte, conferido como a extensão confere (validarRetorno):
 * o texto só se não for vazio; com "Virar regra", o texto da regra e a
 * matéria (esta, ou null para todas). Com algo faltando (problemaDoBalao),
 * um Error com a frase.
 */
export function dadosDoRetorno(balao: BalaoRetorno, materia: string): DadosDoRetorno {
	const problema = problemaDoBalao(balao);
	if (problema) throw new Error(problema);
	const conferido = validarRetorno({
		avaliacao: balao.avaliacao,
		motivos: balao.avaliacao === "melhorar" ? balao.motivos : [],
		texto: balao.texto,
		...(balao.virarRegra ? { virarRegra: { texto: balao.textoRegra, materia: balao.soEstaMateria ? materia : null } } : {}),
	});
	return {
		avaliacao: conferido.avaliacao,
		motivos: conferido.motivos,
		...(conferido.texto ? { texto: conferido.texto } : {}),
		...(conferido.virarRegra ? { virarRegra: conferido.virarRegra } : {}),
	};
}

// --- A reescrita e as versões de um bloco ----------------------------------------------

export const TEXTO_REESCREVENDO = "Reescrevendo este bloco…";
export const TEXTO_RETORNO_SALVO = "Retorno salvo";
export const ROTULO_REESCRITO = "Reescrito";

/** O bloco foi reescrito (versão maior que 1). */
export const foiReescrito = (bloco: Pick<Bloco, "versao">): boolean => versaoDoBloco(bloco) > 1;

/** O título da etiqueta "Reescrito": "Reescrito em 28/10 (versão 2)". */
export function tituloDoReescrito(bloco: Pick<Bloco, "versao" | "reescritoEm">): string {
	const dia = diaEMes(bloco.reescritoEm);
	return `${ROTULO_REESCRITO}${dia ? ` em ${dia}` : ""} (versão ${versaoDoBloco(bloco)})`;
}

const ehAnterior = (valor: unknown): valor is BlocoAnterior => typeof valor === "object" && valor !== null && typeof (valor as { tipo?: unknown }).tipo === "string";

/** As versões anteriores do bloco, da mais antiga para a mais recente (como estão no arquivo); sem nenhuma, vazio. */
export function versoesAnteriores(bloco: Pick<Bloco, "anteriores">): BlocoAnterior[] {
	return Array.isArray(bloco.anteriores) ? bloco.anteriores.filter(ehAnterior) : [];
}

/** "Ver a versão anterior" mostra primeiro a mais recente (a última da lista). */
export const anteriorInicial = (anteriores: readonly unknown[]): number => Math.max(0, anteriores.length - 1);

/** "Versão 1 de 3": a versão da anterior e quantas o bloco tem (a atual é a última). */
export const rotuloDaVersao = (anterior: Pick<BlocoAnterior, "versao">, bloco: Pick<Bloco, "versao">): string =>
	`Versão ${versaoDoBloco(anterior)} de ${versaoDoBloco(bloco)}`;

/** "Substituída em 28/10"; sem data legível, "". */
export function dataDaVersao(anterior: Pick<BlocoAnterior, "substituidoEm">): string {
	const dia = diaEMes(anterior.substituidoEm);
	return dia ? `Substituída em ${dia}` : "";
}

/** A chave de um bloco do módulo: a lição e o bloco. */
export const chaveDoBloco = (licao: string, bloco: string): string => `${licao}/${bloco}`;
