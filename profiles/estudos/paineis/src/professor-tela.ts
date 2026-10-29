// As partes puras do professor em forma de bolha (ProfessorBolha.tsx) e da
// pergunta com slider (PerguntaSlider.tsx), do questionário do fim da lição
// (docs/modulos.md, "O questionário do fim da lição"): os nomes dos níveis, o
// encaixe, as teclas, a mistura das cores (color-mix com as variáveis do
// estilo.css), a forma dos olhos de cada humor, interpolada ponto a ponto, e
// a posição do pegador e as línguas de fogo da trilha do slider.
//
// O morph dos olhos: cada olho é um polígono fechado de 12 vértices. Os traços
// abertos (o T, o ︶, o ^, o > e o traço neutro) são 7 pontos de ida e os
// mesmos 5 do meio de volta (ida e volta pelo mesmo caminho): o polígono não
// tem área, e o preenchimento não aparece. A estrela usa os 12 vértices de
// verdade (10 pontas e cantos, mais 2 pontos no meio de lados) e é o caso em
// que a ida e a volta se separam e o polígono "abre". Como todos os humores têm
// a mesma quantidade de vértices, qualquer valor contínuo entre 1 e 5 é uma
// mistura linear, ponto a ponto, dos dois humores vizinhos.

import { NIVEIS_LICAO, NOME_SEM_NIVEL, NOMES_NIVEL, type NivelLicao } from "../../lib/modulo-feedback-tipos.ts";

/** Os níveis e os nomes vêm do contrato (lib/modulo-feedback-tipos.ts), a fonte única. */
export type Nivel = NivelLicao;
export type Ponto = readonly [number, number];

export const NIVEIS: readonly Nivel[] = NIVEIS_LICAO;

const HUMORES: Record<Nivel, string> = { 1: "chorando", 2: "triste", 3: "contente", 4: "animado", 5: "maravilhado" };

/** O nome do nível ("—" sem resposta). */
export function nomeDoNivel(nivel: Nivel | null): string {
	return nivel === null ? NOME_SEM_NIVEL : NOMES_NIVEL[nivel];
}

/** O humor do professor no nível, para o aria-label da bolha. */
export function humorDoNivel(nivel: Nivel | null): string {
	return nivel === null ? "esperando a resposta" : HUMORES[nivel];
}

/** Prende o valor contínuo entre 1 e 5. */
export function prender(valor: number): number {
	return Math.min(5, Math.max(1, valor));
}

/** O nível mais próximo do valor contínuo (o meio, 3,5, vai para cima). */
export function encaixar(valor: number): Nivel {
	return Math.round(prender(valor)) as Nivel;
}

/**
 * O nível depois de uma tecla no slider, ou undefined quando a tecla não é do
 * slider. Sem resposta, a bolha fica no meio (3): a seta para a direita já dá 4,
 * a para a esquerda dá 2, Home dá 1 e End dá 5.
 */
export function nivelDaTecla(atual: Nivel | null, tecla: string): Nivel | undefined {
	const base = atual ?? 3;
	switch (tecla) {
		case "ArrowRight":
		case "ArrowUp":
		case "PageUp":
			return encaixar(base + 1);
		case "ArrowLeft":
		case "ArrowDown":
		case "PageDown":
			return encaixar(base - 1);
		case "Home":
			return 1;
		case "End":
			return 5;
		default:
			return undefined;
	}
}

/** O trecho entre dois níveis vizinhos em que o valor está: de, até e quanto já andou (0 a 1). */
export function trechoDoValor(valor: number): { de: Nivel; ate: Nivel; t: number } {
	const v = prender(valor);
	const de = Math.min(4, Math.floor(v)) as Nivel;
	return { de, ate: (de + 1) as Nivel, t: v - de };
}

/** Quanto do humor do nível está no valor contínuo: 1 no nível, 0 a um nível ou mais de distância. */
export function pesoDoNivel(valor: number, nivel: Nivel): number {
	return Math.max(0, 1 - Math.abs(prender(valor) - nivel));
}

function arredondar(numero: number, casas = 1): number {
	const fator = 10 ** casas;
	return Math.round(numero * fator) / fator;
}

/**
 * A cor do valor contínuo como CSS: a variável `--<prefixo>-<nível>` no nível
 * exato, e um color-mix (em oklab) das duas vizinhas no meio do caminho. As
 * cores ficam só no estilo.css; aqui só se diz quanto de cada uma.
 */
export function corDoValor(prefixo: string, valor: number): string {
	const { de, ate, t } = trechoDoValor(valor);
	if (t < 0.0005) return `var(--${prefixo}-${de})`;
	if (t > 0.9995) return `var(--${prefixo}-${ate})`;
	return `color-mix(in oklab, var(--${prefixo}-${de}) ${arredondar((1 - t) * 100)}%, var(--${prefixo}-${ate}))`;
}

/**
 * A cor com a presença da resposta: 1 = a cor do valor; 0 = a cor neutra
 * (`--<prefixo>-neutro`, a apagada de sem resposta); no meio, a mistura das duas.
 */
export function corComPresenca(prefixo: string, valor: number, presenca: number): string {
	const neutra = `var(--${prefixo}-neutro)`;
	if (presenca < 0.0005) return neutra;
	const cor = corDoValor(prefixo, valor);
	if (presenca > 0.9995) return cor;
	return `color-mix(in oklab, ${cor} ${arredondar(Math.min(1, presenca) * 100)}%, ${neutra})`;
}

// ── A forma da bolha ────────────────────────────────────────────────────────

/** O achatamento do corpo (escala x, escala y) em cada nível: triste é mais baixo e largo; feliz, mais alto. */
const ACHATAMENTO: Record<Nivel, Ponto> = { 1: [1.06, 0.86], 2: [1.04, 0.92], 3: [1, 1], 4: [0.97, 1.04], 5: [0.95, 1.07] };
const ACHATAMENTO_NEUTRO: Ponto = [1.02, 0.95];

export function misturar(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function misturarPontos(a: readonly Ponto[], b: readonly Ponto[], t: number): Ponto[] {
	if (a.length !== b.length) throw new Error("Os olhos precisam ter a mesma quantidade de pontos.");
	return a.map((p, i) => [misturar(p[0], b[i]![0], t), misturar(p[1], b[i]![1], t)] as const);
}

/** A escala do corpo no valor contínuo, misturada com a neutra pela presença. */
export function achatamentoDoValor(valor: number, presenca: number): Ponto {
	const { de, ate, t } = trechoDoValor(valor);
	const humor: Ponto = [misturar(ACHATAMENTO[de][0], ACHATAMENTO[ate][0], t), misturar(ACHATAMENTO[de][1], ACHATAMENTO[ate][1], t)];
	return [misturar(ACHATAMENTO_NEUTRO[0], humor[0], presenca), misturar(ACHATAMENTO_NEUTRO[1], humor[1], presenca)];
}

// ── Os olhos ────────────────────────────────────────────────────────────────

/** Vértices de cada olho (12). */
export const PONTOS_DO_OLHO = 12;
/** O eixo do rosto, no viewBox 0 0 140 120 da bolha: o olho direito é o esquerdo espelhado nele. */
export const EIXO_DO_ROSTO = 70;

/** Ida (7 pontos) e volta pelos 5 do meio: o traço aberto vira um polígono fechado sem área. */
function idaEVolta(ida: readonly Ponto[]): Ponto[] {
	if (ida.length !== 7) throw new Error("O traço aberto tem 7 pontos de ida.");
	return [...ida, ...ida.slice(1, 6).reverse()];
}

/** 7 pontos numa linha quebrada de dois segmentos (a quina no 4º ponto). */
function quina(a: Ponto, b: Ponto, c: Ponto): Ponto[] {
	const ida: Ponto[] = [];
	for (let i = 0; i <= 3; i++) ida.push([misturar(a[0], b[0], i / 3), misturar(a[1], b[1], i / 3)]);
	for (let i = 1; i <= 3; i++) ida.push([misturar(b[0], c[0], i / 3), misturar(b[1], c[1], i / 3)]);
	return ida;
}

/** 7 pontos numa curva quadrática (de a a c, puxada por b). */
function curva(a: Ponto, b: Ponto, c: Ponto): Ponto[] {
	return Array.from({ length: 7 }, (_, i) => {
		const t = i / 6;
		const u = 1 - t;
		return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]] as const;
	});
}

/**
 * A estrela de 5 pontas do olho esquerdo, em 12 vértices na ordem do relógio,
 * alinhados com o ">" do nível 4: começa no canto de cima à esquerda, a ponta
 * de cima à direita fica no 4º vértice (onde fica a ponta do ">") e o 7º é o
 * canto de baixo. Os vértices 8 e 12 são meios de lados, para dar 12.
 */
function estrela(cx: number, cy: number, raioFora: number, raioDentro: number): Ponto[] {
	const em = (graus: number, raio: number): Ponto => [cx + raio * Math.cos((graus * Math.PI) / 180), cy + raio * Math.sin((graus * Math.PI) / 180)];
	const meio = (a: Ponto, b: Ponto): Ponto => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const cantoCimaEsq = em(-126, raioDentro);
	const cantoBaixo = em(90, raioDentro);
	const pontaBaixoEsq = em(126, raioFora);
	const pontaEsq = em(198, raioFora);
	return [
		cantoCimaEsq,
		em(-90, raioFora),
		em(-54, raioDentro),
		em(-18, raioFora),
		em(18, raioDentro),
		em(54, raioFora),
		cantoBaixo,
		meio(cantoBaixo, pontaBaixoEsq),
		pontaBaixoEsq,
		em(162, raioDentro),
		pontaEsq,
		meio(pontaEsq, cantoCimaEsq),
	];
}

/** O olho esquerdo de cada humor. */
export const OLHOS: Record<Nivel, readonly Ponto[]> = {
	// T: a barra de cima e a perna descendo (as lágrimas saem dela).
	1: idaEVolta([[36, 52], [41.5, 52], [47, 52], [47, 68], [47, 52], [52.5, 52], [58, 52]]),
	// ︶: curvo para baixo.
	2: idaEVolta(curva([38, 55], [47, 65], [56, 55])),
	// ^
	3: idaEVolta(quina([38, 62], [47, 52], [56, 62])),
	// > (o direito, espelhado, é <)
	4: idaEVolta(quina([40, 50], [54, 58], [40, 66])),
	// a estrela
	5: estrela(47, 57.5, 13, 5.6),
};

/** O olho sem resposta: um traço reto, sereno. */
export const OLHO_NEUTRO: readonly Ponto[] = idaEVolta(quina([40, 58], [47, 58], [54, 58]));

/** O olho esquerdo no valor contínuo, misturado com o neutro pela presença (0 = sem resposta). */
export function olhoNoValor(valor: number, presenca: number): Ponto[] {
	const { de, ate, t } = trechoDoValor(valor);
	return misturarPontos(OLHO_NEUTRO, misturarPontos(OLHOS[de], OLHOS[ate], t), Math.min(1, Math.max(0, presenca)));
}

/** O olho direito: o esquerdo espelhado no eixo do rosto. */
export function espelhar(pontos: readonly Ponto[], eixo = EIXO_DO_ROSTO): Ponto[] {
	return pontos.map(([x, y]) => [2 * eixo - x, y] as const);
}

/** O `d` de um polígono fechado. */
export function caminhoFechado(pontos: readonly Ponto[]): string {
	return pontos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${arredondar(x, 2)} ${arredondar(y, 2)}`).join(" ") + " Z";
}

// ── A trilha do slider ──────────────────────────────────────────────────────

/**
 * Onde o pegador está na trilha, de 0 (nível 1, encostado à esquerda) a 1
 * (nível 5, encostado à direita); sem resposta, no meio (0,5). O CSS põe o
 * pegador em `fração × (largura da trilha − largura do pegador)` e o
 * preenchimento vai da esquerda até a borda direita dele.
 */
export function fracaoDaTrilha(valor: number | null): number {
	return valor === null ? 0.5 : arredondar((prender(valor) - 1) / 4, 4);
}

/** A presença das chamas: aparecem a partir de 4,3 e ficam inteiras no Excelente. */
export function presencaDaChama(valor: number | null): number {
	return valor === null ? 0 : arredondar(Math.min(1, Math.max(0, (prender(valor) - 4.3) / 0.7)), 3);
}

/** Uma língua de fogo dentro do preenchimento: onde fica (em px), a altura (fração da trilha) e o tremor. */
export interface LinguaDeFogo {
	/** A posição da esquerda, em px a partir do começo do preenchimento. */
	x: number;
	/** A largura, em px. */
	largura: number;
	/** A altura, de 0 a 1 da altura da trilha (passa um pouco de 1: a ponta é cortada pela borda). */
	altura: number;
	/** A duração de um tremor, em segundos. */
	duracao: number;
	/** O atraso negativo do tremor, em segundos (para as línguas não tremerem juntas). */
	atraso: number;
}

/**
 * As línguas de fogo do preenchimento, lado a lado e um pouco sobrepostas, com
 * altura, tremor e atraso variando de forma fixa (a mesma sequência sempre, sem
 * Math.random, para não mudar a cada render). Ficam numa faixa larga; o
 * preenchimento corta o que passa da largura dele.
 */
export function linguasDeFogo(quantidade: number, passo = 14): LinguaDeFogo[] {
	// Um ruído fixo entre 0 e 1 a partir do índice.
	const ruido = (i: number, semente: number) => {
		const x = Math.sin(i * 12.9898 + semente * 78.233) * 43758.5453;
		return x - Math.floor(x);
	};
	return Array.from({ length: quantidade }, (_, i) => ({
		x: i * passo - passo / 2,
		largura: arredondar(passo * (1.5 + 0.5 * ruido(i, 1)), 1),
		altura: arredondar(0.6 + 0.55 * ruido(i, 2), 2),
		duracao: arredondar(0.45 + 0.4 * ruido(i, 3), 2),
		atraso: -arredondar(ruido(i, 4), 2),
	}));
}
