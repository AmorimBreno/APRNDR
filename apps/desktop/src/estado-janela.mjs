// Tamanho, posição e estado de maximizada da janela, guardados entre uma
// abertura e outra. Só a lógica pura fica aqui (ler o arquivo, conferir se a
// posição ainda cabe nas telas); quem lê e grava o arquivo é o main.mjs.

export const LARGURA_PADRAO = 1400;
export const ALTURA_PADRAO = 900;
export const LARGURA_MINIMA = 900;
export const ALTURA_MINIMA = 600;

/** Quanto da janela precisa aparecer numa tela para dar para pegá-la e arrastá-la. */
const VISIVEL_MINIMO = { largura: 160, altura: 48 };

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Retangulo
 * @typedef {{ x?: number, y?: number, width: number, height: number, maximizada: boolean }} EstadoJanela
 */

const numero = (valor) => typeof valor === "number" && Number.isFinite(valor);

/** @returns {EstadoJanela} o estado do arquivo, ou o padrão se ele não existe ou está estragado. */
export function lerEstado(texto) {
	/** @type {EstadoJanela} */
	const padrao = { width: LARGURA_PADRAO, height: ALTURA_PADRAO, maximizada: false };
	if (!texto) return padrao;
	let bruto;
	try {
		bruto = JSON.parse(texto);
	} catch {
		return padrao;
	}
	if (!bruto || typeof bruto !== "object") return padrao;
	/** @type {EstadoJanela} */
	const estado = {
		width: numero(bruto.width) ? Math.max(LARGURA_MINIMA, Math.round(bruto.width)) : LARGURA_PADRAO,
		height: numero(bruto.height) ? Math.max(ALTURA_MINIMA, Math.round(bruto.height)) : ALTURA_PADRAO,
		maximizada: bruto.maximizada === true,
	};
	if (numero(bruto.x) && numero(bruto.y)) {
		estado.x = Math.round(bruto.x);
		estado.y = Math.round(bruto.y);
	}
	return estado;
}

function sobreposicao(a, b) {
	const largura = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
	const altura = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
	return { largura, altura };
}

/**
 * Se a posição guardada não aparece em nenhuma tela (um monitor que foi
 * desligado, por exemplo), descarta a posição e limita o tamanho à primeira
 * tela, para a janela abrir centralizada. `areas` são as áreas úteis das telas.
 * @param {EstadoJanela} estado
 * @param {Retangulo[]} areas
 * @returns {EstadoJanela}
 */
export function ajustarAsTelas(estado, areas) {
	if (areas.length === 0 || estado.x === undefined || estado.y === undefined) return estado;
	const janela = { x: estado.x, y: estado.y, width: estado.width, height: estado.height };
	const aparece = areas.some((area) => {
		const { largura, altura } = sobreposicao(janela, area);
		return largura >= VISIVEL_MINIMO.largura && altura >= VISIVEL_MINIMO.altura;
	});
	if (aparece) return estado;
	const [primeira] = areas;
	return {
		width: Math.min(estado.width, primeira.width),
		height: Math.min(estado.height, primeira.height),
		maximizada: estado.maximizada,
	};
}
