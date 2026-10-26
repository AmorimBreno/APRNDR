// As partes puras da etapa Diagnóstico do guia de curso (EtapaDiagnostico.tsx,
// docs/cursos.md, "Parte B: o diagnóstico"): a fase pelo curso, a contagem da
// autoavaliação, o salvamento adiado (um por vez), o placar do resultado, os
// critérios da correção, a situação de cada correção na tela, a divisão de
// uma questão em contexto e pergunta e, no resultado em duas colunas, o
// resultado e o tom de cada questão, os assuntos do índice, a ordem de
// navegação, a questão em vista e a linha "Sua resposta".

import type { Correcao, DiagnosticoNaTela, NivelAutoavaliacao, ResumoDiagnostico } from "../../lib/diagnostico-tipos.ts";
import { ehNivel } from "../../lib/diagnostico-tipos.ts";

// --- A fase ----------------------------------------------------------------------

export const FASES = ["autoavaliacao", "questoes", "resultado"] as const;
export type FaseDiagnostico = (typeof FASES)[number];

export const NOMES_FASE: Record<FaseDiagnostico, string> = {
	autoavaliacao: "Autoavaliação",
	questoes: "Questões",
	resultado: "Resultado",
};

/** A fase pelo diagnóstico do curso: sem questões, autoavaliação; com alguma sem resposta, questões; tudo respondido, resultado. */
export function faseDoDiagnostico(diagnostico: Pick<DiagnosticoNaTela, "questoes" | "respostas"> | null | undefined): FaseDiagnostico {
	if (!diagnostico || diagnostico.questoes.length === 0) return "autoavaliacao";
	return diagnostico.questoes.some((questao) => diagnostico.respostas[questao.id] === undefined) ? "questoes" : "resultado";
}

// --- Autoavaliação -----------------------------------------------------------------

/** Quantos conceitos do curso têm nível. */
export function contarMarcados(conceitos: readonly string[], niveis: Readonly<Record<string, unknown>>): number {
	return conceitos.filter((id) => ehNivel(niveis[id])).length;
}

/** "12 de 24 marcados". */
export const textoMarcados = (marcados: number, total: number) => `${marcados} de ${total} ${marcados === 1 ? "marcado" : "marcados"}`;

/** Só os níveis dos conceitos do curso, na ordem do curso (a extensão recusa um id de fora). */
export function niveisDoCurso(conceitos: readonly string[], niveis: Readonly<Record<string, unknown>>): Record<string, NivelAutoavaliacao> {
	const saida: Record<string, NivelAutoavaliacao> = {};
	for (const id of conceitos) {
		const nivel = niveis[id];
		if (ehNivel(nivel)) saida[id] = nivel;
	}
	return saida;
}

// --- O salvamento adiado -------------------------------------------------------------

export interface SalvadorAdiado<T> {
	/** O valor novo: salva depois do atraso (cada mudança recomeça a contagem). */
	mudar(valor: T): void;
	/** Salva já o que falta e espera terminar (o último salvamento em voo também). */
	esvaziar(): Promise<void>;
	/** Há mudança esperando ou salvando. */
	readonly ocupado: boolean;
}

/**
 * Salva o último valor depois de `atraso` ms sem mudança, um salvamento por
 * vez: se um ainda está em voo quando a contagem acaba, o valor mais novo sai
 * quando ele terminar. Uma falha vai para `aoFalhar` (e não para a fila).
 */
export function criarSalvadorAdiado<T>(salvar: (valor: T) => Promise<unknown>, atraso: number, aoFalhar: (erro: unknown) => void = () => {}): SalvadorAdiado<T> {
	let proximo: { valor: T } | undefined;
	let relogio: ReturnType<typeof setTimeout> | undefined;
	let emVoo: Promise<void> | undefined;

	const disparar = () => {
		relogio = undefined;
		if (emVoo || !proximo) return;
		const { valor } = proximo;
		proximo = undefined;
		emVoo = Promise.resolve()
			.then(() => salvar(valor))
			.then(
				() => undefined,
				(erro: unknown) => aoFalhar(erro),
			)
			.finally(() => {
				emVoo = undefined;
				// Mudou durante o voo e a contagem já acabou: sai agora.
				if (proximo && !relogio) disparar();
			});
	};

	return {
		mudar(valor) {
			proximo = { valor };
			if (relogio) clearTimeout(relogio);
			relogio = setTimeout(disparar, atraso);
		},
		async esvaziar() {
			if (relogio) clearTimeout(relogio);
			relogio = undefined;
			while (emVoo || proximo) {
				if (emVoo) await emVoo;
				else disparar();
			}
		},
		get ocupado() {
			return Boolean(proximo || emVoo || relogio);
		},
	};
}

// --- Resultado ---------------------------------------------------------------------

/** "2,5", "7": até uma casa, com vírgula. */
export function numeroCurto(valor: number): string {
	const arredondado = Math.round(valor * 10) / 10;
	return Number.isInteger(arredondado) ? String(arredondado) : arredondado.toFixed(1).replace(".", ",");
}

/** O placar do topo do resultado: "Acertou 5 de 6 alternativas" e "Dissertativa: 7/10" (sem a linha quando não há o que mostrar). */
/**
 * Os pontos somados das dissertativas já corrigidas, na escala das rubricas
 * (a mesma que cada questão mostra, "6/8"). Contados pelas respostas, e não
 * pelo resumo por conceito, porque uma dissertativa pode cobrir dois conceitos.
 */
export function pontosDasDissertativas(diagnostico: {
	questoes: ReadonlyArray<{ id: string; tipo: string }>;
	respostas: Readonly<Record<string, object | undefined>>;
}): { total: number; max: number } | undefined {
	let total = 0;
	let max = 0;
	for (const questao of diagnostico.questoes) {
		const resposta = questao.tipo === "dissertativa" ? (diagnostico.respostas[questao.id] as { correcao?: Pick<Correcao, "total" | "max"> } | undefined) : undefined;
		const correcao = resposta?.correcao;
		if (!correcao) continue;
		total += correcao.total;
		max += correcao.max;
	}
	return max > 0 ? { total, max } : undefined;
}

export function textoPlacar(total: ResumoDiagnostico["total"], pontos?: { total: number; max: number }): { alternativas?: string; dissertativa?: string } {
	const alternativas =
		total.alternativas > 0 ? `Acertou ${total.acertos} de ${total.alternativas} ${total.alternativas === 1 ? "alternativa" : "alternativas"}` : undefined;
	const nome = total.dissertativas === 1 ? "Dissertativa" : "Dissertativas";
	const dissertativa =
		total.dissertativas > 0 && total.nota !== null
			? pontos
				? `${nome}: ${numeroCurto(pontos.total)}/${numeroCurto(pontos.max)}`
				: `${nome}: ${numeroCurto(total.nota * 10)}/10`
			: undefined;
	return { ...(alternativas ? { alternativas } : {}), ...(dissertativa ? { dissertativa } : {}) };
}

/** O estado do QuizFeedback pela nota: toda = correct, zero = incorrect, o resto = partial (como resumoDoDiagnostico). */
export function statusDaCorrecao(correcao: Pick<Correcao, "total" | "max">): "correct" | "incorrect" | "partial" {
	if (correcao.total >= correcao.max) return "correct";
	if (correcao.total <= 0) return "incorrect";
	return "partial";
}

/** Os critérios para o QuizFeedback: atendido = pontos de pelo menos metade do máximo do critério. */
export function criteriosDoFeedback(correcao: Pick<Correcao, "criterios">): Array<{ label: string; met: boolean }> {
	return correcao.criterios.map((item) => ({ label: `${item.criterio} (${numeroCurto(item.pontos)}/${numeroCurto(item.max)})`, met: item.pontos >= item.max / 2 }));
}

/** "Sua escolha confunde correlação com causalidade." a partir da confusão da alternativa ("Confunde correlação com causalidade."). */
export function fraseDaConfusao(confusao: string): string {
	const texto = confusao.trim();
	const sem = /^confunde\s+/i.exec(texto) ? texto.replace(/^confunde\s+/i, "") : undefined;
	const final = (frase: string) => (/[.!?…]$/.test(frase) ? frase : `${frase}.`);
	if (sem) return final(`Sua escolha confunde ${sem}`);
	return final(`Sua escolha: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`);
}

/**
 * A correção de uma dissertativa respondida, como a tela mostra: corrigida;
 * corrigindo (a extensão diz que está corrigindo, ou o pedido saiu desta tela
 * e nenhum erro chegou depois); ou falhou (erro da correção, ou ela não está
 * correndo e não foi pedida aqui, como ao reabrir o guia), com "Corrigir de novo".
 */
export function situacaoDaCorrecao(entrada: { corrigida: boolean; corrigindo: boolean; erro: boolean; pedidaAqui: boolean }): "corrigida" | "corrigindo" | "falhou" {
	if (entrada.corrigida) return "corrigida";
	if (entrada.corrigindo) return "corrigindo";
	if (entrada.erro) return "falhou";
	return entrada.pedidaAqui ? "corrigindo" : "falhou";
}

// --- O contexto e a pergunta ---------------------------------------------------------

/** Uma questão na tela, dividida: o contexto (markdown; sem ele, a questão fica numa coluna só) e a pergunta. */
export interface PartesDaQuestao {
	contexto?: string;
	pergunta: string;
}

type TipoTrecho = "bloco" | "codigo" | "latex";

/**
 * Os trechos do markdown em que pontuação não conta: os blocos de código
 * (```), o código em linha (`…`, ``…``) e o LaTeX ($…$, $$…$$). Cada um como
 * [início, fim) no texto, na ordem.
 */
function trechosProtegidos(texto: string): Array<{ inicio: number; fim: number; tipo: TipoTrecho }> {
	const trechos: Array<{ inicio: number; fim: number; tipo: TipoTrecho }> = [];
	let i = 0;
	while (i < texto.length) {
		const inicioDeLinha = i === 0 || texto[i - 1] === "\n";
		const cerca = inicioDeLinha ? /^ {0,3}(`{3,}|~{3,})/.exec(texto.slice(i)) : null;
		if (cerca) {
			// O bloco vai até a linha que fecha com a mesma cerca (ou até o fim do texto).
			const marca = cerca[1]!;
			const fecho = new RegExp(`\\n {0,3}${marca[0] === "`" ? "`" : "~"}{${marca.length},}[ \\t]*(?=\\n|$)`, "g");
			fecho.lastIndex = i + cerca[0].length;
			const achado = fecho.exec(texto);
			const fim = achado ? achado.index + achado[0].length : texto.length;
			trechos.push({ inicio: i, fim, tipo: "bloco" });
			i = fim;
			continue;
		}
		const caractere = texto[i]!;
		if (caractere === "\\") {
			i += 2;
			continue;
		}
		if (caractere === "`") {
			let n = 1;
			while (texto[i + n] === "`") n++;
			// Fecha com uma sequência de exatamente n crases; sem ela, as crases são texto.
			const fecho = new RegExp(`(?<!\`)\`{${n}}(?!\`)`, "g");
			fecho.lastIndex = i + n;
			const achado = fecho.exec(texto);
			if (achado) {
				trechos.push({ inicio: i, fim: achado.index + n, tipo: "codigo" });
				i = achado.index + n;
			} else i += n;
			continue;
		}
		if (caractere === "$") {
			const duplo = texto[i + 1] === "$";
			const marca = duplo ? "$$" : "$";
			let j = i + marca.length;
			while (j < texto.length && !(texto.startsWith(marca, j) && texto[j - 1] !== "\\")) j++;
			if (j < texto.length && j > i + marca.length) {
				trechos.push({ inicio: i, fim: j + marca.length, tipo: "latex" });
				i = j + marca.length;
			} else i += marca.length;
			continue;
		}
		i++;
	}
	return trechos;
}

/** Código em linha que deve virar bloco: mais de 12 caracteres, com parênteses, colchetes, =, ; ou um ponto entre nomes. */
const MINIMO_BLOCO = 13;
const pareceCodigo = (codigo: string) => codigo.length >= MINIMO_BLOCO && (/[()[\]=;]/.test(codigo) || /[A-Za-z_]\w*\.[A-Za-z_]/.test(codigo));

/**
 * No contexto de uma questão antiga, o código em linha que parece código
 * (pareceCodigo) vira um bloco de código, com a frase quebrada em volta; o
 * resto (nomes curtos, LaTeX, blocos que já existem) fica como está.
 */
function codigoEmBlocos(texto: string): string {
	let saida = "";
	let desde = 0;
	for (const trecho of trechosProtegidos(texto)) {
		if (trecho.tipo !== "codigo") continue;
		const bruto = texto.slice(trecho.inicio, trecho.fim);
		const crases = /^`+/.exec(bruto)![0].length;
		let codigo = bruto.slice(crases, -crases);
		// Como no CommonMark: um espaço de cada lado, quando há os dois, é tirado.
		if (/^ .*[^ ].* $/s.test(codigo)) codigo = codigo.slice(1, -1);
		if (!pareceCodigo(codigo.trim())) continue;
		const maiorSequencia = Math.max(0, ...[...codigo.matchAll(/`+/g)].map((achado) => achado[0].length));
		const cerca = "`".repeat(Math.max(3, maiorSequencia + 1));
		saida += `${texto.slice(desde, trecho.inicio).trimEnd()}\n\n${cerca}\n${codigo.trim()}\n${cerca}\n\n`;
		desde = trecho.fim;
		// O texto depois do bloco começa sem espaço e sem a pontuação que ligava o código à frase (", e", ".").
		while (desde < texto.length && /[ \t.,;:]/.test(texto[desde]!)) desde++;
	}
	saida += texto.slice(desde);
	return saida.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Divide o enunciado de uma questão antiga (sem contexto), só para mostrar
 * (nada é regravado): a última frase interrogativa (do começo dela até o fim
 * do enunciado) é a pergunta; o que vem antes é o contexto, com o código em
 * linha que parece código em blocos (codigoEmBlocos). A pontuação dentro de
 * código e de LaTeX não conta. Sem frase interrogativa, ou sem nada antes
 * dela, o enunciado fica inteiro como pergunta.
 */
export function dividirQuestao(enunciado: string): PartesDaQuestao {
	const texto = enunciado.trim();
	const protegidos = trechosProtegidos(texto);
	const livre = (posicao: number) => !protegidos.some((trecho) => posicao >= trecho.inicio && posicao < trecho.fim);
	let interrogacao = -1;
	for (let i = texto.length - 1; i >= 0; i--) {
		if (texto[i] === "?" && livre(i)) {
			interrogacao = i;
			break;
		}
	}
	if (interrogacao < 0) return { pergunta: enunciado };
	// O começo da frase: depois do último fim de frase (. ! ? ; … seguidos de espaço, ou uma quebra de linha) antes da interrogação.
	let comeco = 0;
	for (let i = interrogacao - 1; i >= 0; i--) {
		if (!livre(i)) continue;
		const fimDeFrase = (/[.!?;…]/.test(texto[i]!) && /\s/.test(texto[i + 1] ?? "")) || texto[i] === "\n";
		if (fimDeFrase) {
			comeco = i + 1;
			break;
		}
	}
	const resto = texto.slice(0, comeco).trim();
	const pergunta = texto.slice(comeco).trim();
	if (!resto || !pergunta) return { pergunta: enunciado };
	return { contexto: codigoEmBlocos(resto), pergunta };
}

/** O contexto e a pergunta de uma questão: o contexto gravado, quando há; senão, o enunciado dividido (dividirQuestao). */
export function partesDaQuestao(questao: { contexto?: string; enunciado: string }): PartesDaQuestao {
	const contexto = questao.contexto?.trim();
	if (contexto) return { contexto, pergunta: questao.enunciado };
	return dividirQuestao(questao.enunciado);
}

// --- O resultado em duas colunas -----------------------------------------------------
//
// À esquerda, o índice por assunto (um grupo por conceito, na ordem do curso, só
// os que têm questão); à direita, uma questão por vez, num cartão na cor do
// resultado, com "Anterior" e "Próxima" na ordem do índice.

/** O resultado de uma questão como a tela mostra (a dissertativa ainda sem nota fica corrigindo ou sem correção). */
export type ResultadoNaTela = "certa" | "errada" | "parcial" | "corrigindo" | "sem_correcao";

/**
 * O resultado de uma questão respondida: a alternativa pela correta da
 * resposta; a dissertativa corrigida pela nota (statusDaCorrecao); sem
 * correção, corrigindo ou sem correção, pela situação (situacaoDaCorrecao).
 */
export function resultadoNaTela(
	questao: { tipo: "alternativa" | "dissertativa" },
	resposta: { correta?: boolean; correcao?: Pick<Correcao, "total" | "max"> } | undefined,
	situacao: "corrigida" | "corrigindo" | "falhou",
): ResultadoNaTela {
	if (questao.tipo === "alternativa") return resposta?.correta === true ? "certa" : "errada";
	const correcao = resposta?.correcao;
	if (correcao) {
		const status = statusDaCorrecao(correcao);
		return status === "correct" ? "certa" : status === "incorrect" ? "errada" : "parcial";
	}
	return situacao === "corrigindo" ? "corrigindo" : "sem_correcao";
}

export interface TomDoResultado {
	/** A cor do cartão: sálvia, tijolo, âmbar ou neutro (a superfície de sempre). */
	tom: "sage" | "brick" | "amber" | "neutro";
	/** O ícone (nunca só a cor): visto, xis, meia volta, relógio ou alerta. */
	icone: "check" | "close" | "refresh" | "clock" | "alert";
	/** A palavra do resultado, como o QuizFeedback. */
	palavra: string;
	/** O bloco no QuizProgress do placar (sem resultado, o bloco fica vazio). */
	progresso?: "correct" | "incorrect" | "partial" | "skipped";
}

const TONS: Record<ResultadoNaTela, TomDoResultado> = {
	certa: { tom: "sage", icone: "check", palavra: "Correta", progresso: "correct" },
	errada: { tom: "brick", icone: "close", palavra: "Ainda não", progresso: "incorrect" },
	parcial: { tom: "amber", icone: "refresh", palavra: "Quase lá", progresso: "partial" },
	corrigindo: { tom: "neutro", icone: "clock", palavra: "Corrigindo" },
	sem_correcao: { tom: "neutro", icone: "alert", palavra: "Sem correção", progresso: "skipped" },
};

/** A cor, o ícone e a palavra de um resultado. */
export const tomDoResultado = (resultado: ResultadoNaTela): TomDoResultado => TONS[resultado];

export interface GrupoDoAssunto<Q> {
	/** O id do conceito. */
	conceito: string;
	/** As questões que cobrem o conceito, na ordem das questões. */
	questoes: Q[];
}

/**
 * Os assuntos do índice: um grupo por conceito do curso (na ordem do curso)
 * com as questões que o cobrem, na ordem das questões; o conceito sem questão
 * fica de fora. Uma questão de dois conceitos aparece nos dois grupos. Um
 * conceito de questão que não está no curso (o mapa mudou depois) entra no
 * fim, na ordem em que aparece, para nenhuma questão sumir do índice.
 */
export function gruposPorAssunto<Q extends { id: string; conceitos: readonly string[] }>(conceitosDoCurso: readonly string[], questoes: readonly Q[]): Array<GrupoDoAssunto<Q>> {
	const ordem = [...new Set(conceitosDoCurso)];
	const doCurso = new Set(ordem);
	for (const questao of questoes) for (const id of questao.conceitos) if (!doCurso.has(id) && !ordem.includes(id)) ordem.push(id);
	return ordem.map((conceito) => ({ conceito, questoes: questoes.filter((questao) => questao.conceitos.includes(conceito)) })).filter((grupo) => grupo.questoes.length > 0);
}

/** Uma questão aberta no resultado: a questão e o assunto em que ela foi aberta (uma questão pode estar em dois). */
export interface EntradaDoResultado {
	conceito: string;
	questao: string;
}

/**
 * A ordem de "Anterior" e "Próxima": as questões na ordem do índice (de cima
 * para baixo), cada uma uma vez só, no primeiro assunto em que aparece.
 */
export function ordemDeNavegacao(grupos: ReadonlyArray<GrupoDoAssunto<{ id: string }>>): EntradaDoResultado[] {
	const vistas = new Set<string>();
	const ordem: EntradaDoResultado[] = [];
	for (const grupo of grupos) {
		for (const questao of grupo.questoes) {
			if (vistas.has(questao.id)) continue;
			vistas.add(questao.id);
			ordem.push({ conceito: grupo.conceito, questao: questao.id });
		}
	}
	return ordem;
}

/**
 * A questão em vista: a escolhida, se ainda existe naquele assunto (as
 * questões podem ter sido geradas de novo); senão, a primeira do índice.
 */
export function questaoEmVista(
	grupos: ReadonlyArray<GrupoDoAssunto<{ id: string }>>,
	escolhida: EntradaDoResultado | undefined,
): EntradaDoResultado | undefined {
	if (escolhida && grupos.some((grupo) => grupo.conceito === escolhida.conceito && grupo.questoes.some((questao) => questao.id === escolhida.questao))) return escolhida;
	return ordemDeNavegacao(grupos)[0];
}

/** Onde a questão está na ordem de navegação (posição de 1 a total) e as vizinhas, sem dar a volta nas pontas. */
export function vizinhasNaOrdem(
	ordem: readonly EntradaDoResultado[],
	questao: string,
): { posicao: number; total: number; anterior?: EntradaDoResultado; proxima?: EntradaDoResultado } {
	const indice = ordem.findIndex((entrada) => entrada.questao === questao);
	if (indice < 0) return { posicao: 0, total: ordem.length };
	const anterior = ordem[indice - 1];
	const proxima = ordem[indice + 1];
	return { posicao: indice + 1, total: ordem.length, ...(anterior ? { anterior } : {}), ...(proxima ? { proxima } : {}) };
}

/** A letra de uma alternativa: 0 = A, 1 = B… */
export const letraDaAlternativa = (indice: number) => String.fromCharCode(65 + indice);

/**
 * Um texto de alternativa encurtado para uma linha: as quebras viram espaço
 * e, passando do limite, corta no último espaço antes dele, com "…". O corte
 * nunca cai dentro de código ou de LaTeX (o trecho inteiro fica de fora, ou
 * inteiro dentro, se é o começo do texto).
 */
export function encurtarAlternativa(texto: string, limite = 90): string {
	const linha = texto.replace(/\s+/g, " ").trim();
	if (linha.length <= limite) return linha;
	const protegidos = trechosProtegidos(linha);
	let corte = linha.lastIndexOf(" ", limite);
	const dentro = protegidos.find((trecho) => corte > trecho.inicio && corte < trecho.fim);
	if (dentro) corte = dentro.inicio > 0 ? dentro.inicio : dentro.fim;
	if (corte <= 0) {
		// Nenhum espaço antes do limite (uma palavra só, comprida): corta no limite, se não for dentro de código.
		const trecho = protegidos.find((item) => limite > item.inicio && limite < item.fim);
		corte = trecho ? trecho.fim : limite;
	}
	const curto = linha.slice(0, corte).trimEnd();
	return curto.length < linha.length ? `${curto.replace(/[\s.,;:]+$/, "")}…` : curto;
}

/**
 * A linha "Sua resposta: B · <o texto curto da alternativa>": o rótulo com a
 * letra e o texto encurtado (encurtarAlternativa), em markdown. Sem
 * alternativa nesse índice, só o rótulo.
 */
export function suaRespostaAlternativa(alternativas: ReadonlyArray<{ texto: string }>, escolha: number): { rotulo: string; texto?: string } {
	const rotulo = `Sua resposta: ${letraDaAlternativa(escolha)}`;
	const alternativa = alternativas[escolha];
	const texto = alternativa ? encurtarAlternativa(alternativa.texto) : "";
	return texto ? { rotulo, texto } : { rotulo };
}
