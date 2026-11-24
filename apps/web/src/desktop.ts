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

export type ModoFlutuante = "bolinha" | "chat";

/** A ponte da janela da bolinha (docs/professor-flutuante.md, 2.3). Só existe nela. */
export interface PonteFlutuante {
	modo(): Promise<ModoFlutuante>;
	expandir(): Promise<void>;
	recolher(): Promise<void>;
	/** A posição da janela em pixels da tela (arrastar a bolinha). */
	/** Leva a bolinha até (x, y) da tela; resolve quando a janela já andou. */
	moverPara(x: number, y: number): Promise<void> | void;
	capturarTela(): Promise<CapturaDaTela | null>;
	abrirApp(): Promise<void>;
	/** "Esconder a bolinha" (grava ligado: false). */
	esconder(): Promise<void>;
	/** O menu nativo do clique direito (opcional: sem ele, a tela desenha o próprio menu). */
	menu?(): Promise<void>;
	aoMudarModo(cb: (modo: ModoFlutuante) => void): () => void;
	/** O atalho Ctrl+Alt+Espaço. */
	aoAlternarVoz(cb: () => void): () => void;
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
	const bolinha = lerPonteBolinha(janela);
	return { plataforma, alturaBarra, sair: () => sair() as Promise<void>, ...(flutuante ? { flutuante } : {}), ...(bolinha ? { bolinha } : {}) };
}

const temFuncoes = (objeto: object, nomes: string[]) => nomes.every((nome) => typeof (objeto as Record<string, unknown>)[nome] === "function");

/** A ponte da janela da bolinha, se o preload expôs uma inteira (cada função conferida). Não depende do resto do ambiente. */
export function lerPonteFlutuante(janela: { estudosDesktop?: unknown }): PonteFlutuante | undefined {
	const bruto = janela.estudosDesktop;
	if (!bruto || typeof bruto !== "object") return undefined;
	const ponte = (bruto as { flutuante?: unknown }).flutuante;
	if (!ponte || typeof ponte !== "object") return undefined;
	const nomes = ["modo", "expandir", "recolher", "moverPara", "capturarTela", "abrirApp", "esconder", "aoMudarModo", "aoAlternarVoz"];
	return temFuncoes(ponte, nomes) ? (ponte as PonteFlutuante) : undefined;
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
 * A janela da bolinha começa transparente (a página não pinta o fundo no modo
 * bolinha; estilo.css). Chamado antes do primeiro desenho, para a janela não
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
