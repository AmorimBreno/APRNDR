// A barra de seleção única da mesa de estudo (WP7b; docs/mesa-de-estudo.md, 2.8):
// ao selecionar um trecho da nota ou da lição aparece a barra com Perguntar (o
// trecho vira citação acima do campo do professor), Outro jeito (analogia, caso
// real, passo a passo, visual) e Me teste nisso. Na lição, a barra também leva
// os pedidos dos termos ("Não sei o que é isso", "Explique melhor").
//
// useSelecaoDoDocumento lê a seleção do navegador (selectionchange no document,
// filtrado pela raiz da área); as regras de quando mostrar estão em selecao.ts.
// A nota editável usa o BubbleMenu da formatação, e o grupo de perguntas
// (AcoesDePergunta) entra nele; a barra flutuante daqui é para todo o resto.
//
// Sem a mesa (sem provedor ou sem conversa embutida) as três perguntas não
// aparecem: não há para quem mandar.

import { Icon } from "@estudos/design-system";
import { semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import { type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProfessorDaMesa } from "./MesaEstudo.tsx";
import { decidirSelecao, JEITOS_DE_EXPLICAR, type JeitoDeExplicar, PEDIDO_ME_TESTE, pedidoDoJeito, PROIBIDOS_PADRAO } from "./selecao.ts";
import { posicionarFlutuante, type Retangulo } from "./termos-tela.ts";

export interface SelecaoAtiva {
	trecho: string;
	/** Onde a seleção está na tela (coordenadas físicas de viewport). */
	alvo: Retangulo;
}

export interface OpcoesSelecao {
	/** Seletores que nunca participam da seleção; padrão PROIBIDOS_PADRAO. */
	proibidos?: string;
	/** false = desligada (a barra não escuta nem aparece). */
	ativo?: boolean;
	/** O limite do trecho; padrão 2000. */
	limite?: number;
}

const elementoDe = (no: Node): Element | null => (no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement);

/** Tira a seleção da tela (o clique numa ação já a usou). */
function apagarSelecaoDoNavegador(): void {
	window.getSelection()?.removeAllRanges();
}

/**
 * A seleção do navegador quando ela vale para a barra: dentro da raiz, fora dos
 * lugares proibidos e com 1 a 2000 caracteres. Esc fora do painel do professor e
 * a rolagem da área apagam; a rolagem do painel do professor (a conversa) não.
 */
export function useSelecaoDoDocumento(raiz: RefObject<HTMLElement | null>, opcoes: OpcoesSelecao = {}): { selecao: SelecaoAtiva | undefined; limpar(): void } {
	const { proibidos = PROIBIDOS_PADRAO, ativo = true, limite } = opcoes;
	const [selecao, setSelecao] = useState<SelecaoAtiva>();
	useEffect(() => {
		if (!ativo) {
			setSelecao(undefined);
			return;
		}
		const conferir = () => {
			const s = window.getSelection();
			const area = raiz.current;
			if (!area || !s || s.isCollapsed || s.rangeCount !== 1) {
				setSelecao(undefined);
				return;
			}
			const range = s.getRangeAt(0);
			const cruzaProibido = [...area.querySelectorAll(proibidos)].some((e) => range.intersectsNode(e));
			const trecho = decidirSelecao({
				texto: s.toString(),
				raiz: area,
				inicio: elementoDe(range.startContainer),
				fim: elementoDe(range.endContainer),
				proibidos,
				cruzaProibido,
				...(limite !== undefined ? { limite } : {}),
			});
			setSelecao(trecho ? { trecho, alvo: range.getBoundingClientRect() } : undefined);
		};
		const tecla = (evento: globalThis.KeyboardEvent) => {
			// Esc no painel do professor (a conversa) não apaga a seleção feita no texto da página.
			if (evento.target instanceof Element && evento.target.closest(".mesa__professor")) return;
			if (evento.key === "Escape") setSelecao(undefined);
		};
		const rolar = (evento: Event) => {
			// A rolagem do painel do professor não pode apagar a seleção: só a que contém o texto da página.
			if (evento.target instanceof Node && !(evento.target === document || evento.target.contains(raiz.current))) return;
			setSelecao(undefined);
		};
		document.addEventListener("selectionchange", conferir);
		document.addEventListener("keydown", tecla);
		document.addEventListener("scroll", rolar, true);
		return () => {
			document.removeEventListener("selectionchange", conferir);
			document.removeEventListener("keydown", tecla);
			document.removeEventListener("scroll", rolar, true);
		};
	}, [raiz, proibidos, ativo, limite]);
	const limpar = useCallback(() => {
		setSelecao(undefined);
		apagarSelecaoDoNavegador();
	}, []);
	return { selecao, limpar };
}

/** Um flutuante no body, fora da rolagem, com as coordenadas corrigidas pelo zoom de 90 % da interface. */
export function Flutuante({
	alvo,
	children,
	classe,
	referencia,
	tooltipId,
	rotulo = "Pedir explicação",
}: {
	alvo: Retangulo;
	children: ReactNode;
	classe: string;
	referencia?: RefObject<HTMLDivElement | null>;
	tooltipId?: string;
	/** O nome da barra (role toolbar) para o leitor de tela. */
	rotulo?: string;
}) {
	const propria = useRef<HTMLDivElement>(null);
	const ref = referencia ?? propria;
	const [medidas, setMedidas] = useState({ largura: 360, altura: 180 });
	const [tela, setTela] = useState({ largura: window.innerWidth, altura: window.innerHeight });
	const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
	useLayoutEffect(() => {
		const elemento = ref.current;
		if (!elemento) return;
		const medir = () => {
			const r = elemento.getBoundingClientRect();
			setMedidas({ largura: r.width, altura: r.height });
		};
		medir();
		const observer = new ResizeObserver(medir);
		observer.observe(elemento);
		const resize = () => setTela({ largura: window.innerWidth, altura: window.innerHeight });
		window.addEventListener("resize", resize);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", resize);
		};
	}, [ref]);
	const pos = posicionarFlutuante(alvo, medidas.largura, medidas.altura, tela);
	return createPortal(
		<motion.div
			ref={ref}
			id={tooltipId}
			role={tooltipId ? "tooltip" : "toolbar"}
			aria-label={tooltipId ? undefined : rotulo}
			className={`${classe}${pos.abaixo ? ` ${classe}--abaixo` : ""}`}
			style={
				{
					position: "fixed",
					left: pos.left / zoom,
					top: pos.top / zoom,
					maxWidth: (tela.largura - 24) / zoom,
					maxHeight: (tela.altura - 24) / zoom,
					"--termo-seta": `${pos.seta / zoom}px`,
				} as React.CSSProperties
			}
			initial={semMovimento() ? false : { opacity: 0, y: 4, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ type: "spring", stiffness: 420, damping: 32 }}
		>
			{children}
		</motion.div>,
		document.body,
	);
}

/** Os itens da barra que o teclado percorre (as setas movem o foco entre eles). */
const ITENS = "[data-selecao-item]:not(:disabled)";

/** Setas, Home e End movem o foco entre os itens da barra (toolbar do WAI-ARIA). Os itens do menu "Outro jeito" têm as setas próprias. */
function moverFocoNaBarra(evento: KeyboardEvent<HTMLElement>): void {
	if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(evento.key)) return;
	if (evento.target instanceof Element && evento.target.closest("[role=menu]")) return;
	const itens = [...evento.currentTarget.querySelectorAll<HTMLElement>(ITENS)];
	if (!itens.length) return;
	const atual = itens.indexOf(document.activeElement as HTMLElement);
	let proximo: number;
	if (evento.key === "Home") proximo = 0;
	else if (evento.key === "End") proximo = itens.length - 1;
	else if (evento.key === "ArrowRight") proximo = atual < 0 ? 0 : (atual + 1) % itens.length;
	else proximo = atual < 0 ? itens.length - 1 : (atual - 1 + itens.length) % itens.length;
	evento.preventDefault();
	itens[proximo]?.focus();
}

/** Quem pode mandar uma pergunta ao professor: só dentro da mesa, com a conversa embutida. */
export function useMesaPodePerguntar(): boolean {
	return useProfessorDaMesa() !== undefined;
}

const NOME_MARCA = "selecao-pergunta";

/**
 * Marca em âmbar suave (CSS Custom Highlight API, ::highlight no mesa.css) o trecho
 * selecionado enquanto a barra está aberta: a seleção do navegador some quando o
 * foco vai para o chat. Sem suporte à API, não marca. A marca sai quando a barra fecha.
 */
function useMarcaDaSelecao(trecho: string): void {
	useEffect(() => {
		const api = globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...ranges: Range[]) => unknown };
		const registro = api.CSS?.highlights;
		const Marca = api.Highlight;
		if (!registro || !Marca) return;
		const selecao = window.getSelection();
		if (!selecao || selecao.isCollapsed || selecao.rangeCount !== 1) return;
		const marca = new Marca(selecao.getRangeAt(0).cloneRange());
		registro.set(NOME_MARCA, marca);
		return () => {
			if (registro.get(NOME_MARCA) === marca) registro.delete(NOME_MARCA);
		};
	}, [trecho]);
}

export interface PropsAcoesDePergunta {
	/** O trecho já limpo (selecao.ts) em que as ações agem. */
	trecho: string;
	/** Depois de uma ação que saiu: quem chama apaga a seleção. */
	depois(): void;
}

/**
 * As três ações de pergunta (Perguntar, Outro jeito, Me teste nisso), em
 * linha. Sem a mesa, nada. Usada pela barra flutuante e pelo grupo do
 * BubbleMenu da nota. Os botões não tomam o foco do mouse (preventDefault no
 * mousedown) para a seleção não sumir ao clicar.
 */
export function AcoesDePergunta({ trecho, depois }: PropsAcoesDePergunta) {
	const professor = useProfessorDaMesa();
	const [menu, setMenu] = useState(false);
	const [erro, setErro] = useState<string>();
	const [enviando, setEnviando] = useState(false);
	const gatilho = useRef<HTMLButtonElement>(null);
	const caixa = useRef<HTMLSpanElement>(null);
	useMarcaDaSelecao(trecho);
	// Clicar fora do menu (ou o foco sair da barra) fecha.
	useEffect(() => {
		if (!menu) return;
		const fora = (evento: MouseEvent) => {
			if (evento.target instanceof Node && !caixa.current?.contains(evento.target)) setMenu(false);
		};
		document.addEventListener("mousedown", fora);
		return () => document.removeEventListener("mousedown", fora);
	}, [menu]);
	if (!professor) return null;

	const mandar = (pedido: string) => {
		setErro(undefined);
		setEnviando(true);
		setMenu(false);
		professor
			.perguntar(pedido, trecho)
			.then(depois)
			.catch((falha: unknown) => setErro(`Não consegui mandar: ${falha instanceof Error ? falha.message : String(falha)}`))
			.finally(() => setEnviando(false));
	};
	const jeito = (id: JeitoDeExplicar) => mandar(pedidoDoJeito(id));
	const teclasDoMenu = (evento: KeyboardEvent<HTMLElement>) => {
		if (evento.key === "Escape") {
			// Fecha só o menu e devolve o foco ao botão; o Esc não chega ao document (que apagaria a seleção).
			evento.stopPropagation();
			setMenu(false);
			gatilho.current?.focus();
			return;
		}
		if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
		const itens = [...(caixa.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
		if (!itens.length) return;
		evento.preventDefault();
		const atual = itens.indexOf(document.activeElement as HTMLElement);
		const passo = evento.key === "ArrowDown" ? 1 : -1;
		itens[(atual + passo + itens.length) % itens.length]?.focus();
	};

	return (
		<span className="selecao-perguntas" role="group" aria-label="Perguntar ao professor">
			<button
				type="button"
				data-selecao-item=""
				className="selecao-barra__botao selecao-barra__botao--primario"
				disabled={enviando}
				title="Citar este trecho acima do campo do professor"
				onClick={() => {
					professor.citar(trecho);
					depois();
				}}
			>
				Perguntar
			</button>
			<span ref={caixa} className="selecao-perguntas__menu-caixa" onKeyDown={teclasDoMenu}>
				<button
					ref={gatilho}
					type="button"
					data-selecao-item=""
					className="selecao-barra__botao"
					aria-haspopup="menu"
					aria-expanded={menu}
					disabled={enviando}
					title="Pedir ao professor para explicar este trecho de outro jeito"
					onClick={() => setMenu((aberto) => !aberto)}
					onKeyDown={(evento) => {
						if (evento.key === "ArrowDown") {
							evento.preventDefault();
							setMenu(true);
							// Depois de abrir, o foco vai para o primeiro jeito.
							requestAnimationFrame(() => caixa.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
						}
					}}
				>
					Outro jeito
					<Icon name="chevron-down" size={12} strokeWidth={2.5} />
				</button>
				{menu ? (
					<span className="selecao-perguntas__menu" role="menu" aria-label="Outro jeito de explicar">
						{JEITOS_DE_EXPLICAR.map((item) => (
							<button key={item.id} type="button" role="menuitem" className="selecao-barra__botao selecao-perguntas__item" onClick={() => jeito(item.id)}>
								{item.rotulo}
							</button>
						))}
					</span>
				) : null}
			</span>
			<button
				type="button"
				data-selecao-item=""
				className="selecao-barra__botao"
				disabled={enviando}
				title="O professor faz uma pergunta curta sobre este trecho"
				onClick={() => mandar(PEDIDO_ME_TESTE)}
			>
				Me teste nisso
			</button>
			{erro ? (
				<span role="alert" className="body-sm selecao-barra__erro">
					{erro}
				</span>
			) : null}
		</span>
	);
}

export interface PropsBarraSelecao {
	selecao: SelecaoAtiva | undefined;
	/** Apaga a seleção (depois de uma ação). */
	limpar(): void;
	/** Ações da tela antes das de pergunta (na lição: "Não sei o que é isso" e "Explique melhor"). */
	extras?: ReactNode;
}

/**
 * A barra flutuante junto da seleção. Aparece se há seleção válida e algo a
 * oferecer: as ações da tela (extras) ou, dentro da mesa, as de pergunta.
 */
export function BarraSelecao({ selecao, limpar, extras }: PropsBarraSelecao) {
	const professor = useProfessorDaMesa();
	const barra = useRef<HTMLDivElement>(null);
	const visivel = Boolean(selecao) && (Boolean(extras) || Boolean(professor));
	// Alt+F10 leva o foco do teclado à barra (ela mora no fim do body, fora da ordem do Tab).
	useEffect(() => {
		if (!visivel) return;
		const aoTeclar = (evento: globalThis.KeyboardEvent) => {
			if (!evento.altKey || evento.key !== "F10") return;
			const primeiro = barra.current?.querySelector<HTMLElement>(ITENS);
			if (!primeiro) return;
			evento.preventDefault();
			primeiro.focus();
		};
		document.addEventListener("keydown", aoTeclar);
		return () => document.removeEventListener("keydown", aoTeclar);
	}, [visivel]);
	if (!selecao || !visivel) return null;
	return (
		<Flutuante alvo={selecao.alvo} classe="termos-selecao selecao-barra" referencia={barra} rotulo="Perguntar sobre o trecho selecionado (Alt+F10 leva o foco para cá)">
			{/* O mousedown não tira a seleção do texto; o foco só entra pelo teclado. */}
			<div className="selecao-barra__linha" onMouseDown={(evento) => evento.preventDefault()} onKeyDown={moverFocoNaBarra}>
				{extras}
				{extras && professor ? <span className="selecao-barra__fio" aria-hidden="true" /> : null}
				<AcoesDePergunta trecho={selecao.trecho} depois={limpar} />
			</div>
		</Flutuante>
	);
}
