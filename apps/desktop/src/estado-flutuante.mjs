// A bolinha do professor (janela flutuante): a parte pura. Ler e gravar o
// flutuante.json, a posição do chat a partir da bolinha, a posição corrigida
// para uma tela visível, o tamanho da captura e o atalho de inicialização.
// Quem toca no disco e nas janelas é o flutuante.mjs.

export const TAMANHO_BOLINHA = { width: 76, height: 76 };
export const TAMANHO_CHAT = { width: 420, height: 620 };
/** Margem da bolinha na primeira vez, em relação ao canto da área útil. */
export const MARGEM_PRIMEIRA_VEZ = 24;
/** Maior lado da imagem da captura da tela. */
export const LADO_MAXIMO_CAPTURA = 2000;
export const NOME_ATALHO_INICIALIZACAO = "APRNDR (bandeja).lnk";
/** O argumento do iniciar.vbs / do Electron para subir só com a bandeja. */
export const ARGUMENTO_BANDEJA = "--bandeja";

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Retangulo
 * @typedef {{ ligada: boolean, x?: number, y?: number, inicioComWindowsEscolhido: boolean }} EstadoFlutuante
 */

const numero = (valor) => typeof valor === "number" && Number.isFinite(valor);

/** @returns {EstadoFlutuante} o estado do arquivo, ou o padrão (ligada, sem posição) se faltar ou estiver estragado. */
export function lerFlutuante(texto) {
	/** @type {EstadoFlutuante} */
	const estado = { ligada: true, inicioComWindowsEscolhido: false };
	if (!texto) return estado;
	let bruto;
	try {
		bruto = JSON.parse(texto);
	} catch {
		return estado;
	}
	if (!bruto || typeof bruto !== "object") return estado;
	if (typeof bruto.ligada === "boolean") estado.ligada = bruto.ligada;
	if (typeof bruto.inicioComWindowsEscolhido === "boolean") estado.inicioComWindowsEscolhido = bruto.inicioComWindowsEscolhido;
	if (numero(bruto.x) && numero(bruto.y)) {
		estado.x = Math.round(bruto.x);
		estado.y = Math.round(bruto.y);
	}
	return estado;
}

/** O texto do flutuante.json. */
export function gravarFlutuante(estado) {
	const { ligada, x, y, inicioComWindowsEscolhido } = estado;
	const posicao = numero(x) && numero(y) ? { x: Math.round(x), y: Math.round(y) } : {};
	return JSON.stringify({ ligada, ...posicao, inicioComWindowsEscolhido }, null, 2) + "\n";
}

function sobreposicao(a, b) {
	const largura = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
	const altura = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
	return Math.max(0, largura) * Math.max(0, altura);
}

/** Limita o retângulo de `tamanho` com canto (x, y) à área (se não couber, vale o canto de cima à esquerda). */
export function limitarNaArea(x, y, tamanho, area) {
	const maxX = Math.max(area.x, area.x + area.width - tamanho.width);
	const maxY = Math.max(area.y, area.y + area.height - tamanho.height);
	return {
		x: Math.min(Math.max(Math.round(x), area.x), maxX),
		y: Math.min(Math.max(Math.round(y), area.y), maxY),
	};
}

/** Canto inferior direito da área, com margem: onde a bolinha nasce na primeira vez. */
export function posicaoInicial(area, tamanho = TAMANHO_BOLINHA) {
	return limitarNaArea(area.x + area.width - tamanho.width - MARGEM_PRIMEIRA_VEZ, area.y + area.height - tamanho.height - MARGEM_PRIMEIRA_VEZ, tamanho, area);
}

/**
 * A posição da bolinha corrigida para uma tela visível: sem posição, vai para o canto da primeira
 * área (a da tela principal); com posição, fica onde está se a bolinha inteira cabe numa área, e
 * senão é puxada para dentro da área onde mais aparece (ou da primeira).
 * @param {{ x?: number, y?: number }} posicao
 * @param {Retangulo[]} areas áreas úteis das telas, a da principal primeiro
 */
export function corrigirPosicao(posicao, areas, tamanho = TAMANHO_BOLINHA) {
	if (areas.length === 0) return { x: posicao.x ?? 0, y: posicao.y ?? 0 };
	const { x, y } = posicao;
	if (typeof x !== "number" || typeof y !== "number" || !numero(x) || !numero(y)) return posicaoInicial(areas[0], tamanho);
	const retangulo = { x, y, ...tamanho };
	if (areas.some((area) => sobreposicao(retangulo, area) === tamanho.width * tamanho.height)) return { x, y };
	let melhor = areas[0];
	let maior = -1;
	for (const area of areas) {
		const parte = sobreposicao(retangulo, area);
		if (parte > maior) {
			maior = parte;
			melhor = area;
		}
	}
	return limitarNaArea(x, y, tamanho, melhor);
}

/**
 * Onde fica o canto do chat compacto quando a bolinha em `bolinha` expande, dentro da área útil
 * da tela dela: cresce para a direita e para baixo; no canto direito abre para a esquerda
 * (a borda direita do chat acompanha a da bolinha) e embaixo, para cima.
 */
export function posicaoDoChat(bolinha, area, chat = TAMANHO_CHAT, tamanhoBolinha = TAMANHO_BOLINHA) {
	const x = bolinha.x + chat.width > area.x + area.width ? bolinha.x + tamanhoBolinha.width - chat.width : bolinha.x;
	const y = bolinha.y + chat.height > area.y + area.height ? bolinha.y + tamanhoBolinha.height - chat.height : bolinha.y;
	return limitarNaArea(x, y, chat, area);
}

/** O tamanho da miniatura da captura: a tela em pixels físicos, com o lado maior até o limite. */
export function tamanhoDaCaptura(largura, altura, maximo = LADO_MAXIMO_CAPTURA) {
	const maior = Math.max(largura, altura);
	const escala = maior > maximo ? maximo / maior : 1;
	return { width: Math.max(1, Math.round(largura * escala)), height: Math.max(1, Math.round(altura * escala)) };
}

/**
 * As opções do atalho "APRNDR (bandeja)" da pasta Inicializar: wscript.exe com o iniciar.vbs e o
 * --bandeja, na raiz do repositório, com o ícone do app.
 */
export function atalhoDeInicializacao({ raiz, pastaDoSistema, icone }) {
	const base = (pastaDoSistema || "C:\\Windows").replace(/[\\/]+$/, "");
	const pasta = raiz.replace(/[\\/]+$/, "");
	return {
		target: `${base}\\System32\\wscript.exe`,
		args: `"${pasta}\\launcher\\iniciar.vbs" ${ARGUMENTO_BANDEJA}`,
		cwd: raiz,
		description: "Sobe o APRNDR só na bandeja, com o professor flutuante",
		icon: icone,
		iconIndex: 0,
	};
}

/** A pasta Inicializar do usuário a partir do %APPDATA%. */
export function pastaInicializar(appData) {
	return `${appData.replace(/[\\/]+$/, "")}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup`;
}
