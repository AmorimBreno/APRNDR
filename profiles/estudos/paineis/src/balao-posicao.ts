// Regras puras de posição do balão da faixa da linha do tempo (LinhaDoTempo.tsx):
// ao lado do cursor, ou ancorado numa marca quando o foco é do teclado ou do toque.
// Coordenadas físicas de viewport, como em termos-tela.ts: quem desenha divide pelo zoom do body.
import type { Retangulo } from "./termos-tela.ts";

export interface Ponto {
	x: number;
	y: number;
}

export interface Tamanho {
	largura: number;
	altura: number;
}

/** A distância mínima entre o balão e a borda da janela. */
const MARGEM = 12;

/** Mantém o início do balão dentro da janela; se nem assim couber, vale a margem do começo. */
function dentroDaJanela(inicio: number, tamanho: number, janela: number): number {
	return Math.max(MARGEM, Math.min(inicio, janela - tamanho - MARGEM));
}

/**
 * O canto do balão que acompanha o cursor: `deslocamento` px abaixo e à direita dele. Perto da borda direita
 * ou da de baixo, o balão vira para o outro lado do cursor, para o cursor nunca ficar embaixo dele.
 */
export function posicaoDoBalao(cursor: Ponto, balao: Tamanho, tela: Tamanho, deslocamento = 14): { left: number; top: number } {
	const cabeNaDireita = cursor.x + deslocamento + balao.largura <= tela.largura - MARGEM;
	const cabeEmbaixo = cursor.y + deslocamento + balao.altura <= tela.altura - MARGEM;
	const left = cabeNaDireita ? cursor.x + deslocamento : cursor.x - deslocamento - balao.largura;
	const top = cabeEmbaixo ? cursor.y + deslocamento : cursor.y - deslocamento - balao.altura;
	return { left: dentroDaJanela(left, balao.largura, tela.largura), top: dentroDaJanela(top, balao.altura, tela.altura) };
}

/**
 * O canto do balão ancorado numa marca (foco do teclado ou toque): centrado embaixo dela. Sem espaço embaixo,
 * sobe para cima da marca, se lá couber; o lado é sempre mantido dentro da janela.
 */
export function posicaoAncorada(alvo: Retangulo, balao: Tamanho, tela: Tamanho, folga = 8): { left: number; top: number } {
	const embaixo = alvo.bottom + folga;
	const cabeEmbaixo = embaixo + balao.altura <= tela.altura - MARGEM;
	const emCima = alvo.top - folga - balao.altura;
	const top = cabeEmbaixo || emCima < MARGEM ? embaixo : emCima;
	return { left: dentroDaJanela((alvo.left + alvo.right - balao.largura) / 2, balao.largura, tela.largura), top: dentroDaJanela(top, balao.altura, tela.altura) };
}
