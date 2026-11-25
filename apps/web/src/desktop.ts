// O front roda em dois lugares: no navegador comum (testes em localhost:7430) e
// dentro da janela própria do app (apps/desktop). A janela própria, pelo preload,
// expõe window.estudosDesktop; só nela aparece a barra do app (BarraDoApp.tsx).

/** A captura da tela que a ponte devolve (JPEG em base64, sem "data:"). */
export interface CapturaDaTela {
	tipo: "image/jpeg";
	dados: string;
	largura: number;
	altura: number;
}

/** Um retângulo em pixels, relativo à janela. */
export interface RetanguloJanela {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Como o balão fica ao lado da bolinha (docs/professor-flutuante.md, 2.3). `balao` é a janela do balão na tela (com o vão
 * de 14 px do lado da bolinha, onde a pontinha é desenhada); `ponta.y` é o centro da bolinha dentro do balão (relativo ao
 * topo dele).
 */
export interface Disposicao {
	balao: RetanguloJanela;
	lado: "esquerda" | "direita";
	ponta: { y: number };
}

const ehNumero = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor);
const ehRetangulo = (valor: unknown): valor is RetanguloJanela => {
	if (!valor || typeof valor !== "object") return false;
	const r = valor as Record<string, unknown>;
	return ehNumero(r.x) && ehNumero(r.y) && ehNumero(r.width) && ehNumero(r.height);
};

/** Confere o que a ponte mandou: uma disposição inteira, ou undefined. */
export function lerDisposicao(bruto: unknown): Disposicao | undefined {
	if (!bruto || typeof bruto !== "object") return undefined;
	const { balao, lado, ponta } = bruto as Record<string, unknown>;
	if (!ehRetangulo(balao)) return undefined;
	if (lado !== "esquerda" && lado !== "direita") return undefined;
	if (!ponta || typeof ponta !== "object" || !ehNumero((ponta as { y?: unknown }).y)) return undefined;
	return bruto as Disposicao;
}

/** A ponte da janela da bolinha (docs/professor-flutuante.md, 2.3). Só existe nela. */
export interface PonteFlutuante {
	/** Abre o balão ao lado da bolinha, ou o fecha se está aberto. */
	alternarBalao(): Promise<void>;
	/** Leva a BOLINHA até (x, y) da tela (o balão aberto anda junto); resolve quando a janela já andou. */
	moverPara(x: number, y: number): Promise<void> | void;
	abrirApp(): Promise<void>;
	/** "Esconder o professor": esconde a bolinha e o balão (grava ligado: false). */
	esconder(): Promise<void>;
	/** O menu nativo do clique direito (opcional: sem ele, a tela desenha o próprio menu). */
	menu?(): Promise<void>;
	/** A voz do balão: ouvindo ou não e os segundos gravados. */
	aoOuvindo(cb: (ouvindo: boolean, segundos: number) => void): () => void;
}

/** A ponte da janela do balão do chat. Só existe nela. */
export interface PonteBalao {
	/** A disposição atual do balão (o lado da bolinha e a ponta), ou null se ele ainda não abriu. */
	disposicao(): Promise<Disposicao | null>;
	/** O Electron mandou uma disposição nova (o balão abriu ou a tela mudou). */
	aoMudarDisposicao(cb: (disposicao: Disposicao) => void): () => void;
	fecharBalao(): Promise<void>;
	capturarTela(): Promise<CapturaDaTela | null>;
	abrirApp(): Promise<void>;
	/** O atalho Ctrl+Alt+Espaço. */
	aoAlternarVoz(cb: () => void): () => void;
	/** Diz à bolinha (pelo Electron) que a gravação começou, parou ou avançou. */
	avisarVoz(ouvindo: boolean, segundos: number): void;
}

/** Liga e desliga a bolinha; existe em qualquer janela do app. */
export interface PonteBolinha {
	ligada(): Promise<boolean>;
	ligar(ligada: boolean): Promise<void>;
}

export interface AmbienteDesktop {
	plataforma: string;
	/** Altura, em pixels da janela, da barra de título que o sistema reserva para os botões. */
	alturaBarra: number;
	/** Sai do app de verdade: fecha a janela e encerra o servidor. */
	sair(): Promise<void>;
	/** Só na janela da bolinha. */
	flutuante?: PonteFlutuante;
	/** Só na janela do balão. */
	balao?: PonteBalao;
	/** Em qualquer janela do app. */
	bolinha?: PonteBolinha;
}

declare global {
	interface Window {
		estudosDesktop?: unknown;
	}
}

/** O ambiente da janela própria, ou undefined no navegador comum (ou se o preload mandou algo inesperado). */
export function lerAmbienteDesktop(janela: { estudosDesktop?: unknown }): AmbienteDesktop | undefined {
	const bruto = janela.estudosDesktop;
	if (!bruto || typeof bruto !== "object") return undefined;
	const { plataforma, alturaBarra, sair } = bruto as { plataforma?: unknown; alturaBarra?: unknown; sair?: unknown };
	if (typeof plataforma !== "string" || typeof alturaBarra !== "number" || !Number.isFinite(alturaBarra) || alturaBarra <= 0) return undefined;
	if (typeof sair !== "function") return undefined;
	const flutuante = lerPonteFlutuante(janela);
	const balao = lerPonteBalao(janela);
	const bolinha = lerPonteBolinha(janela);
	return { plataforma, alturaBarra, sair: () => sair() as Promise<void>, ...(flutuante ? { flutuante } : {}), ...(balao ? { balao } : {}), ...(bolinha ? { bolinha } : {}) };
}

const temFuncoes = (objeto: object, nomes: string[]) => nomes.every((nome) => typeof (objeto as Record<string, unknown>)[nome] === "function");

/** O que a ponte da bolinha precisa ter (menu é opcional); o preload-ponte.test.ts confere o preload contra esta lista. */
const nomesFlutuante = ["alternarBalao", "moverPara", "abrirApp", "esconder", "aoOuvindo"];
/** O que a ponte do balão precisa ter; o preload-ponte.test.ts confere o preload contra esta lista. */
const nomesBalao = ["disposicao", "aoMudarDisposicao", "fecharBalao", "capturarTela", "abrirApp", "aoAlternarVoz", "avisarVoz"];

function lerPonte(janela: { estudosDesktop?: unknown }, chave: "flutuante" | "balao", nomes: string[]): object | undefined {
	const bruto = janela.estudosDesktop;
	if (!bruto || typeof bruto !== "object") return undefined;
	const ponte = (bruto as Record<string, unknown>)[chave];
	if (!ponte || typeof ponte !== "object") return undefined;
	return temFuncoes(ponte, nomes) ? ponte : undefined;
}

/** A ponte da janela da bolinha, se o preload expôs uma inteira (cada função conferida). Não depende do resto do ambiente. */
export function lerPonteFlutuante(janela: { estudosDesktop?: unknown }): PonteFlutuante | undefined {
	return lerPonte(janela, "flutuante", nomesFlutuante) as PonteFlutuante | undefined;
}

/** A ponte da janela do balão, se o preload expôs uma inteira. */
export function lerPonteBalao(janela: { estudosDesktop?: unknown }): PonteBalao | undefined {
	// A disposição que a ponte entrega é conferida pela tela com lerDisposicao (a ponte fica a mesma, sem embrulho).
	return lerPonte(janela, "balao", nomesBalao) as PonteBalao | undefined;
}

/** A ponte que liga e desliga a bolinha, se o preload expôs uma inteira. */
export function lerPonteBolinha(janela: { estudosDesktop?: unknown }): PonteBolinha | undefined {
	const bruto = janela.estudosDesktop;
	if (!bruto || typeof bruto !== "object") return undefined;
	const ponte = (bruto as { bolinha?: unknown }).bolinha;
	if (!ponte || typeof ponte !== "object") return undefined;
	return temFuncoes(ponte, ["ligada", "ligar"]) ? (ponte as PonteBolinha) : undefined;
}

/**
 * As janelas da bolinha e do balão são sempre transparentes (a página não pinta o
 * fundo; estilo.css). Chamado antes do primeiro desenho, para a janela não
 * nascer com um quadrado de fundo.
 */
export function marcarRotaFlutuante(janela: Window = window): void {
	if (/^#\/flutuante\//.test(janela.location.hash)) janela.document.documentElement.classList.add("rota-flutuante");
}

/**
 * Liga o modo "janela própria": a variável CSS --barra-app-janela leva a altura
 * da barra para o estilo (estilo.css converte para a escala do app). Sem ela, a
 * barra tem altura 0 e o layout do navegador comum não muda. Chamado uma vez,
 * antes do primeiro desenho.
 */
export function prepararDesktop(janela: Window = window): AmbienteDesktop | undefined {
	const ambiente = lerAmbienteDesktop(janela);
	if (ambiente) janela.document.documentElement.style.setProperty("--barra-app-janela", `${ambiente.alturaBarra}px`);
	return ambiente;
}
