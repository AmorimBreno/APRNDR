// O front roda em dois lugares: no navegador comum (testes em localhost:7430) e
// dentro da janela própria do app (apps/desktop). A janela própria, pelo preload,
// expõe window.estudosDesktop; só nela aparece a barra do app (BarraDoApp.tsx).

export interface AmbienteDesktop {
	plataforma: string;
	/** Altura, em pixels da janela, da barra de título que o sistema reserva para os botões. */
	alturaBarra: number;
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
	const { plataforma, alturaBarra } = bruto as { plataforma?: unknown; alturaBarra?: unknown };
	if (typeof plataforma !== "string" || typeof alturaBarra !== "number" || !Number.isFinite(alturaBarra) || alturaBarra <= 0) return undefined;
	return { plataforma, alturaBarra };
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
