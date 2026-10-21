// O menu do "/" das notas (item 4.3, parte C), como no Notion: digitar "/" no
// começo da linha ou depois de um espaço abre a lista de blocos
// (comandos-barra.ts), que filtra pelo que você digita depois; ↑ e ↓ escolhem,
// Enter insere e Esc fecha. O "/" é ligado pelo @tiptap/suggestion, e o menu é
// posicionado pelo Floating UI logo abaixo do cursor.

import { Icon } from "@estudos/design-system";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Extension, type Range } from "@tiptap/core";
import { type EditorState, PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type ContextoComando, filtrarItens, type ItemBarra, semAcento } from "./comandos-barra.ts";

interface PropsMenu {
	itens: ItemBarra[];
	escolher(item: ItemBarra): void;
}

export interface ControleMenu {
	/** Uma tecla enquanto o menu está aberto; true se o menu a usou. */
	teclar(evento: KeyboardEvent): boolean;
}

export const ListaBarra = forwardRef<ControleMenu, PropsMenu>(function ListaBarra({ itens, escolher }, ref) {
	const [ativo, setAtivo] = useState(0);
	const lista = useRef<HTMLDivElement>(null);
	// Filtrou de novo: volta para o primeiro.
	useEffect(() => setAtivo(0), [itens]);
	// O item ativo fica à vista.
	useEffect(() => {
		lista.current?.querySelector<HTMLElement>(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
	}, [ativo]);

	useImperativeHandle(ref, () => ({
		teclar(evento) {
			if (!itens.length) return false;
			if (evento.key === "ArrowDown") {
				setAtivo((atual) => (atual + 1) % itens.length);
				return true;
			}
			if (evento.key === "ArrowUp") {
				setAtivo((atual) => (atual - 1 + itens.length) % itens.length);
				return true;
			}
			if (evento.key === "Enter" || evento.key === "Tab") {
				const item = itens[ativo];
				if (item) escolher(item);
				return true;
			}
			return false;
		},
	}));

	return (
		<div ref={lista} className="menu-barra" role="listbox" aria-label="Blocos">
			{itens.length === 0 ? (
				<p className="body-sm menu-barra__vazio">Nenhum bloco com esse nome.</p>
			) : (
				itens.map((item, indice) => (
					<Fragment key={item.id}>
					{/* O título do grupo acima do primeiro item dele. */}
					{item.grupo && item.grupo !== itens[indice - 1]?.grupo ? <p className="overline menu-barra__grupo">{item.grupo}</p> : null}
					<button
						type="button"
						role="option"
						aria-selected={indice === ativo}
						data-indice={indice}
						className={`menu-barra__item${indice === ativo ? " menu-barra__item--ativo" : ""}`}
						// mousedown: o clique não tira o foco do editor antes de inserir.
						onMouseDown={(evento) => {
							evento.preventDefault();
							escolher(item);
						}}
						onMouseEnter={() => setAtivo(indice)}
					>
						<span className="menu-barra__icone" aria-hidden="true">
							{item.icone ? <Icon name={item.icone} size={16} strokeWidth={2.25} /> : <span className="data">{item.sigla}</span>}
						</span>
						<span className="menu-barra__texto">
							<span className="body-strong">{item.nome}</span>
							<span className="body-sm menu-barra__dica">{item.dica}</span>
						</span>
						{item.etiqueta ? (
							<span className={`menu-barra__etiqueta menu-barra__etiqueta--${semAcento(item.etiqueta)}`}>{item.etiqueta}</span>
						) : item.atalho ? (
							<kbd className="data menu-barra__atalho">{item.atalho}</kbd>
						) : null}
					</button>
					</Fragment>
				))
			)}
		</div>
	);
});

export interface OpcoesMenuBarra {
	abrirFormula?: ContextoComando["abrirFormula"];
}

/** O zoom do body (a interface roda em 90%, ESPECIFICACAO 13.12). */
export function zoomDaInterface(): number {
	return Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
}

/** Largura do menu (a mesma do CSS de .menu-barra) e a folga entre ele e a coluna de texto. */
const LARGURA_MENU = 320;
const FOLGA = 20;

/**
 * Põe o menu ao lado da coluna de texto, na altura da linha do cursor, para
 * não cobrir o que você está escrevendo. Se não couber ao lado (tela estreita),
 * vai logo abaixo do cursor. Sempre dentro da tela.
 */
function posicionar(elemento: HTMLElement, props: SuggestionProps<ItemBarra, ItemBarra>) {
	const cursor = props.clientRect?.();
	if (!cursor) return;
	const coluna = props.editor.view.dom.getBoundingClientRect();
	const cabeAoLado = window.innerWidth - coluna.right - FOLGA >= (LARGURA_MENU + 12) * zoomDaInterface();
	// Ao lado da coluna, se couber; senão, à direita do cursor, na mesma linha (o começo da linha continua à vista).
	const referencia = cabeAoLado ? new DOMRect(coluna.right, cursor.top, 0, cursor.height) : cursor;
	void computePosition({ getBoundingClientRect: () => referencia }, elemento, {
		placement: "right-start",
		strategy: "fixed",
		middleware: [offset(cabeAoLado ? FOLGA : 24), flip({ padding: 12, fallbackPlacements: ["left-start", "bottom-start"] }), shift({ padding: 12, crossAxis: true })],
	}).then(({ x, y }) => {
		// A interface roda com zoom no body (90%): as medidas vêm em pixels da tela, e o left e o top valem dentro do zoom.
		const zoom = zoomDaInterface();
		Object.assign(elemento.style, { left: `${x / zoom}px`, top: `${y / zoom}px` });
	});
}

/**
 * O desenho de um menu de sugestão (o do "/" e o das menções): a lista
 * ListaBarra num ReactRenderer, presa ao body e posicionada junto do cursor.
 */
export function desenharMenu(
	opcoes: { esconderVazio?: boolean } = {},
): ReturnType<NonNullable<Parameters<typeof Suggestion<ItemBarra, ItemBarra>>[0]["render"]>> {
	let menu: ReactRenderer<ControleMenu, PropsMenu> | undefined;
	// Nas menções, nada a sugerir esconde o menu (o [[ pode ser só texto); no "/", ele avisa.
	const mostrar = (elemento: HTMLElement, itens: ItemBarra[]) => {
		elemento.style.display = opcoes.esconderVazio && itens.length === 0 ? "none" : "";
	};
	return {
		onStart: (props) => {
			menu = new ReactRenderer(ListaBarra, { editor: props.editor, props: { itens: props.items, escolher: props.command } });
			Object.assign(menu.element.style, { position: "fixed", zIndex: "60" });
			mostrar(menu.element, props.items);
			document.body.appendChild(menu.element);
			posicionar(menu.element, props);
			// De novo no quadro seguinte, com a lista já desenhada (a altura certa para caber na tela).
			const elemento = menu.element;
			requestAnimationFrame(() => posicionar(elemento, props));
		},
		onUpdate: (props) => {
			menu?.updateProps({ itens: props.items, escolher: props.command });
			if (menu) {
				mostrar(menu.element, props.items);
				posicionar(menu.element, props);
			}
		},
		// O Esc o próprio plugin trata: ele encerra o menu, e o onExit tira o menu da tela.
		onKeyDown: (props: SuggestionKeyDownProps) =>
			props.event.key !== "Escape" && menu?.element.style.display !== "none" && (menu?.ref?.teclar(props.event) ?? false),
		onExit: () => {
			menu?.destroy();
			menu?.element.remove();
			menu = undefined;
		},
	};
}

/** Fora de código (no bloco de código e no código da linha, "/" e "[[" são só texto). */
export function foraDeCodigo({ state, range }: { state: EditorState; range: Range }): boolean {
	const $inicio = state.doc.resolve(range.from);
	return !$inicio.parent.type.spec.code && !$inicio.marks().some((marca) => marca.type.name === "code");
}

export const MenuBarra = Extension.create<OpcoesMenuBarra>({
	name: "menuBarra",
	addOptions() {
		return { abrirFormula: undefined };
	},
	addProseMirrorPlugins() {
		const opcoes = this.options;
		return [
			Suggestion<ItemBarra, ItemBarra>({
				editor: this.editor,
				pluginKey: new PluginKey("menuBarra"),
				char: "/",
				allowedPrefixes: [" "],
				allow: foraDeCodigo,
				items: ({ query }) => filtrarItens(query),
				command: ({ editor, range, props: item }) => {
					item.executar({ editor, range, ...(opcoes.abrirFormula ? { abrirFormula: opcoes.abrirFormula } : {}) });
				},
				render: () => desenharMenu(),
			}),
		];
	},
});
