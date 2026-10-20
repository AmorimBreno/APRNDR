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
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type ContextoComando, filtrarItens, type ItemBarra } from "./comandos-barra.ts";

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
					<button
						key={item.id}
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
					</button>
				))
			)}
		</div>
	);
});

export interface OpcoesMenuBarra {
	abrirFormula?: ContextoComando["abrirFormula"];
}

/** Põe o menu logo abaixo do cursor (ou acima, se não couber), dentro da tela. */
function posicionar(elemento: HTMLElement, props: SuggestionProps<ItemBarra, ItemBarra>) {
	const retangulo = props.clientRect?.();
	if (!retangulo) return;
	void computePosition({ getBoundingClientRect: () => retangulo }, elemento, {
		placement: "bottom-start",
		strategy: "fixed",
		middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
	}).then(({ x, y }) => {
		Object.assign(elemento.style, { left: `${x}px`, top: `${y}px` });
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
