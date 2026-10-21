// O menu do "/" das notas (item 4.3, parte C), como no Notion: digitar "/" no
// começo da linha ou depois de um espaço abre a lista de blocos
// (comandos-barra.ts), que filtra pelo que você digita depois; ↑ e ↓ escolhem,
// Enter insere e Esc fecha. O "/" é ligado pelo @tiptap/suggestion, e o menu é
// posicionado pelo Floating UI como no Notion: logo abaixo da linha, alinhado
// ao "/", ou logo acima se não couber embaixo.

import { Icon } from "@estudos/design-system";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Extension, type Range } from "@tiptap/core";
import { type EditorState, PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type ContextoComando, filtrarItens, type ItemBarra, lembrarBloco, semAcento } from "./comandos-barra.ts";

interface PropsMenu {
	itens: ItemBarra[];
	escolher(item: ItemBarra): void;
	/** Fecha o menu (o "Fechar menu" do rodapé). */
	fechar(): void;
	/** O que dizer quando nada bate com o que foi digitado. */
	vazio: string;
	rotulo: string;
}

export interface ControleMenu {
	/** Uma tecla enquanto o menu está aberto; true se o menu a usou. */
	teclar(evento: KeyboardEvent): boolean;
}

/**
 * A lista do menu, no modelo do Notion com o design system: grupos com um
 * título discreto e um fio entre eles, cada item com o ícone, o nome (e, nas
 * menções, o detalhe na mesma linha), a etiqueta ou o atalho de digitação à
 * direita, e o rodapé "Fechar menu · esc".
 */
export const ListaBarra = forwardRef<ControleMenu, PropsMenu>(function ListaBarra({ itens, escolher, fechar, vazio, rotulo }, ref) {
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
		<div className="menu-barra" role="dialog" aria-label={rotulo}>
			<div ref={lista} className="menu-barra__lista" role="listbox" aria-label={rotulo}>
				{itens.length === 0 ? (
					<p className="body-sm menu-barra__vazio">{vazio}</p>
				) : (
					itens.map((item, indice) => (
						<Fragment key={item.id}>
							{/* O título do grupo acima do primeiro item dele (com um fio, menos no primeiro grupo). */}
							{item.grupo && item.grupo !== itens[indice - 1]?.grupo ? (
								<p className={`body-sm menu-barra__grupo${indice > 0 ? " menu-barra__grupo--fio" : ""}`}>{item.grupo}</p>
							) : null}
							<button
								type="button"
								role="option"
								aria-selected={indice === ativo}
								data-indice={indice}
								title={item.dica}
								className={`menu-barra__item${indice === ativo ? " menu-barra__item--ativo" : ""}`}
								// mousedown: o clique não tira o foco do editor antes de inserir.
								onMouseDown={(evento) => {
									evento.preventDefault();
									escolher(item);
								}}
								onMouseMove={() => setAtivo(indice)}
							>
								<span className="menu-barra__icone" aria-hidden="true">
									{item.icone ? <Icon name={item.icone} size={18} strokeWidth={2} /> : <span className="menu-barra__sigla">{item.sigla}</span>}
								</span>
								<span className="body menu-barra__nome">
									{item.nome}
									{item.detalhe ? <span className="menu-barra__detalhe"> · {item.detalhe}</span> : null}
								</span>
								{item.etiqueta ? (
									<span className={`menu-barra__etiqueta menu-barra__etiqueta--${semAcento(item.etiqueta)}`}>{item.etiqueta}</span>
								) : item.atalho ? (
									<kbd className="menu-barra__atalho">{item.atalho}</kbd>
								) : null}
							</button>
						</Fragment>
					))
				)}
			</div>
			<button
				type="button"
				className="menu-barra__rodape"
				onMouseDown={(evento) => {
					evento.preventDefault();
					fechar();
				}}
			>
				<span className="body">Fechar menu</span>
				<kbd className="menu-barra__atalho">esc</kbd>
			</button>
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

/**
 * Põe o menu como o Notion: logo abaixo da linha, alinhado ao "/" (ou ao
 * [[); se não couber embaixo, logo acima. A linha em que você digita fica
 * sempre à vista. As medidas vêm em pixels da tela, e o left e o top valem
 * dentro do zoom da interface (90%).
 */
function posicionar(elemento: HTMLElement, props: SuggestionProps<ItemBarra, ItemBarra>) {
	const gatilho = props.clientRect?.();
	if (!gatilho) return;
	void computePosition({ getBoundingClientRect: () => gatilho }, elemento, {
		placement: "bottom-start",
		strategy: "fixed",
		middleware: [offset(6), flip({ padding: 12, fallbackPlacements: ["top-start"] }), shift({ padding: 12 })],
	}).then(({ x, y }) => {
		const zoom = zoomDaInterface();
		Object.assign(elemento.style, { left: `${x / zoom}px`, top: `${y / zoom}px` });
	});
}

/**
 * O desenho de um menu de sugestão (o do "/" e o das menções): a lista
 * ListaBarra num ReactRenderer, presa ao body e posicionada junto do gatilho.
 */
export function desenharMenu(opcoes: {
	chave: PluginKey;
	rotulo: string;
	vazio: string;
	/** Nas menções, nada a sugerir esconde o menu (o [[ pode ser só texto); no "/", ele avisa. */
	esconderVazio?: boolean;
}): ReturnType<NonNullable<Parameters<typeof Suggestion<ItemBarra, ItemBarra>>[0]["render"]>> {
	let menu: ReactRenderer<ControleMenu, PropsMenu> | undefined;
	const mostrar = (elemento: HTMLElement, itens: ItemBarra[]) => {
		elemento.style.display = opcoes.esconderVazio && itens.length === 0 ? "none" : "";
	};
	const propsDaLista = (props: SuggestionProps<ItemBarra, ItemBarra>): PropsMenu => ({
		itens: props.items,
		escolher: props.command,
		fechar: () => exitSuggestion(props.editor.view, opcoes.chave),
		vazio: opcoes.vazio,
		rotulo: opcoes.rotulo,
	});
	return {
		onStart: (props) => {
			menu = new ReactRenderer(ListaBarra, { editor: props.editor, props: propsDaLista(props) });
			Object.assign(menu.element.style, { position: "fixed", zIndex: "60" });
			mostrar(menu.element, props.items);
			document.body.appendChild(menu.element);
			posicionar(menu.element, props);
			// De novo no quadro seguinte, com a lista já desenhada (a altura certa para caber na tela).
			const elemento = menu.element;
			requestAnimationFrame(() => posicionar(elemento, props));
		},
		onUpdate: (props) => {
			menu?.updateProps(propsDaLista(props));
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
		const chave = new PluginKey("menuBarra");
		return [
			Suggestion<ItemBarra, ItemBarra>({
				editor: this.editor,
				pluginKey: chave,
				char: "/",
				allowedPrefixes: [" "],
				// Depois do "/", enquanto nada foi digitado, a ajuda (o CSS mostra o data-decoration-content).
				decorationClass: "gatilho-menu",
				decorationContent: "Digite para pesquisar",
				allow: foraDeCodigo,
				items: ({ query }) => filtrarItens(query),
				command: ({ editor, range, props: item }) => {
					lembrarBloco(item.id.replace(/^recente:/, ""));
					item.executar({ editor, range, ...(opcoes.abrirFormula ? { abrirFormula: opcoes.abrirFormula } : {}) });
				},
				render: () => desenharMenu({ chave, rotulo: "Blocos", vazio: "Nenhum bloco com esse nome." }),
			}),
		];
	},
});
