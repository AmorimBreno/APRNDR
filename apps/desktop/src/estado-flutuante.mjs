// A bolinha do professor (janela flutuante): a parte pura. Ler e gravar o
// flutuante.json, a disposição do chat (balão ao lado da bolinha), a posição corrigida
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

/** O vão entre a bolinha e o balão, onde fica a pontinha do balão. */
export const VAO_BALAO = 14;
/** A pontinha nunca chega mais perto que isso das quinas do balão. */
export const MARGEM_PONTA = 24;

/**
 * @typedef {{
 *   janela: Retangulo,
 *   bolinha: { x: number, y: number },
 *   balao: Retangulo,
 *   lado: "esquerda" | "direita",
 *   ponta: { y: number },
 * }} Disposicao
 */

/**
 * A disposição do chat como balão ao lado da bolinha. `bolinha` é o canto de cima à esquerda do
 * quadro da bolinha na tela; `area` é a área útil da tela dela. O balão vai para a esquerda se o
 * centro da bolinha está na metade direita da área (senão, para a direita) e, na vertical, cresce
 * para cima se o centro está na metade de baixo (fundo do balão no fundo da bolinha), senão para
 * baixo (topo com topo). Se não couber na vertical, desliza para dentro da área (a bolinha não
 * se mexe); se não couber do lado escolhido, usa o outro (se nenhum cabe, o de mais folga). A
 * janela contém a bolinha e o balão; `bolinha` e `balao` são relativos a ela. `ponta.y` é o
 * centro da bolinha dentro do balão (relativo ao topo dele), a 24 px das bordas no mínimo.
 * @returns {Disposicao}
 */
export function disposicaoDoChat(bolinha, area, balao = TAMANHO_CHAT, tamanhoBolinha = TAMANHO_BOLINHA, vao = VAO_BALAO) {
	const centroX = bolinha.x + tamanhoBolinha.width / 2;
	const centroY = bolinha.y + tamanhoBolinha.height / 2;
	const preferida = centroX > area.x + area.width / 2 ? "esquerda" : "direita";
	const outra = preferida === "esquerda" ? "direita" : "esquerda";

	const xDe = (lado) => (lado === "esquerda" ? bolinha.x - vao - balao.width : bolinha.x + tamanhoBolinha.width + vao);
	const cabe = (lado) => xDe(lado) >= area.x && xDe(lado) + balao.width <= area.x + area.width;
	const folga = (lado) => (lado === "esquerda" ? bolinha.x - area.x : area.x + area.width - (bolinha.x + tamanhoBolinha.width));
	const lado = cabe(preferida) ? preferida : cabe(outra) || folga(outra) > folga(preferida) ? outra : preferida;
	const balaoX = xDe(lado);

	const embaixo = centroY > area.y + area.height / 2;
	const desejado = embaixo ? bolinha.y + tamanhoBolinha.height - balao.height : bolinha.y;
	const maxY = Math.max(area.y, area.y + area.height - balao.height);
	const balaoY = Math.min(Math.max(desejado, area.y), maxY);

	const esquerda = Math.min(balaoX, bolinha.x);
	const topo = Math.min(balaoY, bolinha.y);
	const direita = Math.max(balaoX + balao.width, bolinha.x + tamanhoBolinha.width);
	const fundo = Math.max(balaoY + balao.height, bolinha.y + tamanhoBolinha.height);
	const ponta = Math.min(Math.max(centroY - balaoY, MARGEM_PONTA), balao.height - MARGEM_PONTA);
	return {
		janela: { x: esquerda, y: topo, width: direita - esquerda, height: fundo - topo },
		bolinha: { x: bolinha.x - esquerda, y: bolinha.y - topo },
		balao: { x: balaoX - esquerda, y: balaoY - topo, width: balao.width, height: balao.height },
		lado,
		ponta: { y: ponta },
	};
}

/** A posição da bolinha na tela quando a janela está em (x, y) com essa disposição (o balão arrastado pelo topo). */
export function bolinhaPelaJanela(disposicao, janela) {
	return { x: janela.x + disposicao.bolinha.x, y: janela.y + disposicao.bolinha.y };
}

/** O canto da janela na tela para a bolinha estar em (x, y), mantendo a disposição (a bolinha arrastada no modo chat). */
export function janelaPelaBolinha(disposicao, bolinha) {
	return { x: bolinha.x - disposicao.bolinha.x, y: bolinha.y - disposicao.bolinha.y };
}

/**
 * Os retângulos (relativos à janela) que recebem o clique no modo chat: a bolinha, o balão e a
 * pontinha no vão entre eles. O resto da janela, transparente, deixa o clique passar ao app de trás.
 */
export function formaDoChat(disposicao, tamanhoBolinha = TAMANHO_BOLINHA, vao = VAO_BALAO, meiaPonta = 12) {
	const { bolinha, balao, lado, ponta } = disposicao;
	const xPonta = lado === "esquerda" ? balao.x + balao.width : bolinha.x + tamanhoBolinha.width;
	return [{ x: bolinha.x, y: bolinha.y, ...tamanhoBolinha }, { ...balao }, { x: xPonta, y: balao.y + ponta.y - meiaPonta, width: vao, height: meiaPonta * 2 }];
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
