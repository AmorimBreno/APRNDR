// A alça dos blocos da nota, como no Notion: ao passar o mouse num bloco, ele
// ganha um fundo leve (a decoração de BlocoSobMouse) e, na margem esquerda da
// página, aparecem dois botões:
// - "+": uma linha nova logo abaixo do bloco, já com o menu do "/" aberto;
// - "⋮⋮": arrastando, muda o bloco de lugar (o ProseMirror solta: no começo do
//   arrasto o bloco fica selecionado e o view.dragging é preenchido); clicando,
//   abre o menu do bloco (Transformar em, Duplicar, Mover para cima ou para
//   baixo, Apagar).
// A alça age nos blocos de primeiro nível (uma lista inteira se move junto).
// É própria, e não a do TipTap, porque aquela exige o pacote de colaboração
// em tempo real (Yjs).

import { Icon, type IconName } from "@estudos/design-system";
import { type Editor, Extension } from "@tiptap/core";
import type { Node as NoPM } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { zoomDaInterface } from "./MenuBarra.tsx";

const CHAVE_SOB_MOUSE = new PluginKey<number | undefined>("blocoSobMouse");

/** O fundo leve no bloco sob o mouse (a posição vem pela meta da transação). */
export const BlocoSobMouse = Extension.create({
	name: "blocoSobMouse",
	addProseMirrorPlugins() {
		return [
			new Plugin<number | undefined>({
				key: CHAVE_SOB_MOUSE,
				state: {
					init: () => undefined,
					apply(tr, atual) {
						const meta = tr.getMeta(CHAVE_SOB_MOUSE) as { posicao: number | undefined } | undefined;
						if (meta) return meta.posicao;
						return atual === undefined ? undefined : tr.mapping.map(atual);
					},
				},
				props: {
					decorations(estado) {
						const posicao = CHAVE_SOB_MOUSE.getState(estado);
						const no = posicao === undefined ? null : estado.doc.nodeAt(posicao);
						if (posicao === undefined || !no) return DecorationSet.empty;
						return DecorationSet.create(estado.doc, [Decoration.node(posicao, posicao + no.nodeSize, { class: "bloco--sob-mouse" })]);
					},
				},
			}),
		];
	},
});

/** O bloco de primeiro nível na altura `y` da tela (a coluna de texto, perto da borda esquerda). */
export function blocoNaAltura(editor: Editor, y: number): { posicao: number; no: NoPM; dom: HTMLElement } | undefined {
	const view = editor.view;
	const caixa = view.dom.getBoundingClientRect();
	const achado = view.posAtCoords({ left: caixa.left + 16, top: Math.min(Math.max(y, caixa.top + 1), caixa.bottom - 1) });
	if (!achado) return undefined;
	const alvo = achado.inside >= 0 ? achado.inside : achado.pos;
	const $alvo = view.state.doc.resolve(Math.min(alvo, view.state.doc.content.size));
	const posicao = $alvo.depth >= 1 ? $alvo.before(1) : alvo;
	const no = view.state.doc.nodeAt(posicao);
	const dom = view.nodeDOM(posicao);
	if (!no || !(dom instanceof HTMLElement)) return undefined;
	return { posicao, no, dom };
}

interface OpcaoBloco {
	nome: string;
	icone?: IconName;
	sigla?: string;
	fazer(editor: Editor, posicao: number, no: NoPM): void;
}

/** Põe o cursor dentro do bloco e roda a troca de tipo nele. */
function transformar(trocar: (editor: Editor) => void) {
	return (editor: Editor, posicao: number) => {
		editor.chain().focus().setTextSelection(TextSelection.near(editor.state.doc.resolve(posicao + 1)).from).run();
		trocar(editor);
	};
}

const PODE_TRANSFORMAR = new Set(["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote"]);

const TRANSFORMAR_EM: OpcaoBloco[] = [
	{ nome: "Texto", sigla: "Aa", fazer: transformar((editor) => editor.chain().clearNodes().setParagraph().run()) },
	{ nome: "Título 1", sigla: "H1", fazer: transformar((editor) => editor.chain().clearNodes().setHeading({ level: 1 }).run()) },
	{ nome: "Título 2", sigla: "H2", fazer: transformar((editor) => editor.chain().clearNodes().setHeading({ level: 2 }).run()) },
	{ nome: "Título 3", sigla: "H3", fazer: transformar((editor) => editor.chain().clearNodes().setHeading({ level: 3 }).run()) },
	{ nome: "Lista", sigla: "•", fazer: transformar((editor) => editor.chain().clearNodes().toggleBulletList().run()) },
	{ nome: "Lista numerada", sigla: "1.", fazer: transformar((editor) => editor.chain().clearNodes().toggleOrderedList().run()) },
	{ nome: "Checklist", icone: "checklist", fazer: transformar((editor) => editor.chain().clearNodes().toggleTaskList().run()) },
	{ nome: "Citação", sigla: "“", fazer: transformar((editor) => editor.chain().clearNodes().setBlockquote().run()) },
];

/** Move o bloco uma posição para cima (-1) ou para baixo (+1). */
function mover(editor: Editor, posicao: number, no: NoPM, direcao: -1 | 1) {
	const { doc } = editor.state;
	const $bloco = doc.resolve(posicao);
	const indice = $bloco.index(0);
	const vizinho = doc.maybeChild(indice + direcao);
	if (!vizinho) return;
	const tr = editor.state.tr.delete(posicao, posicao + no.nodeSize);
	const destino = direcao === -1 ? posicao - vizinho.nodeSize : posicao + vizinho.nodeSize;
	tr.insert(destino, no);
	tr.setSelection(NodeSelection.create(tr.doc, destino));
	editor.view.dispatch(tr.scrollIntoView());
	editor.commands.focus();
}

const ACOES: OpcaoBloco[] = [
	{
		nome: "Duplicar",
		icone: "copy",
		fazer: (editor, posicao, no) => editor.chain().focus().insertContentAt(posicao + no.nodeSize, no.toJSON()).run(),
	},
	{ nome: "Mover para cima", icone: "arrow-up", fazer: (editor, posicao, no) => mover(editor, posicao, no, -1) },
	{ nome: "Mover para baixo", sigla: "↓", fazer: (editor, posicao, no) => mover(editor, posicao, no, 1) },
	{
		nome: "Apagar",
		icone: "close",
		fazer: (editor, posicao, no) => editor.chain().focus().deleteRange({ from: posicao, to: posicao + no.nodeSize }).run(),
	},
];

export interface PropsAlcaBlocos {
	editor: Editor | null;
	/** A página (o elemento posicionado onde a alça fica). */
	pagina: HTMLElement | null;
	editavel: boolean;
}

export function AlcaBlocos({ editor, pagina, editavel }: PropsAlcaBlocos) {
	const [alvo, setAlvo] = useState<{ posicao: number; topo: number } | undefined>(undefined);
	const [menu, setMenu] = useState(false);
	const raiz = useRef<HTMLDivElement>(null);
	const arrastando = useRef(false);

	const marcar = useCallback(
		(posicao: number | undefined) => {
			if (!editor || editor.isDestroyed) return;
			if (CHAVE_SOB_MOUSE.getState(editor.state) === posicao) return;
			editor.view.dispatch(editor.state.tr.setMeta(CHAVE_SOB_MOUSE, { posicao }).setMeta("addToHistory", false));
		},
		[editor],
	);

	// Acompanha o bloco sob o mouse (só com o menu fechado e sem arrastar).
	useEffect(() => {
		if (!editor || !pagina || !editavel) return;
		const aoMover = (evento: MouseEvent) => {
			if (menu || arrastando.current) return;
			const bloco = blocoNaAltura(editor, evento.clientY);
			if (!bloco) return;
			const linha = Number.parseFloat(getComputedStyle(bloco.dom).lineHeight) || 24;
			// As medidas vêm em pixels da tela; o top da alça vale dentro do zoom da interface (90%).
			const topo = (bloco.dom.getBoundingClientRect().top - pagina.getBoundingClientRect().top) / zoomDaInterface() + Math.max(0, (Math.min(linha, 44) - 24) / 2);
			setAlvo({ posicao: bloco.posicao, topo });
			marcar(bloco.posicao);
		};
		const aoSair = () => {
			if (menu || arrastando.current) return;
			setAlvo(undefined);
			marcar(undefined);
		};
		pagina.addEventListener("mousemove", aoMover);
		pagina.addEventListener("mouseleave", aoSair);
		return () => {
			pagina.removeEventListener("mousemove", aoMover);
			pagina.removeEventListener("mouseleave", aoSair);
		};
	}, [editor, pagina, editavel, menu, marcar]);

	// O documento mudou: a posição guardada pode não ser mais um bloco.
	useEffect(() => {
		if (!editor) return;
		const aoMudar = () => setAlvo((atual) => (atual && editor.state.doc.nodeAt(atual.posicao) ? atual : undefined));
		editor.on("update", aoMudar);
		return () => {
			editor.off("update", aoMudar);
		};
	}, [editor]);

	// Clique fora ou Esc fecha o menu do bloco.
	useEffect(() => {
		if (!menu) return;
		const fora = (evento: PointerEvent) => {
			if (!raiz.current?.contains(evento.target as Node)) setMenu(false);
		};
		const tecla = (evento: KeyboardEvent) => {
			if (evento.key === "Escape") setMenu(false);
		};
		document.addEventListener("pointerdown", fora);
		document.addEventListener("keydown", tecla);
		return () => {
			document.removeEventListener("pointerdown", fora);
			document.removeEventListener("keydown", tecla);
		};
	}, [menu]);

	if (!editor || !editavel || !alvo) return null;
	const no = editor.state.doc.nodeAt(alvo.posicao);
	if (!no) return null;

	const novaLinha = () => {
		const depois = alvo.posicao + no.nodeSize;
		editor.chain().focus().insertContentAt(depois, { type: "paragraph" }).setTextSelection(depois + 1).insertContent("/").run();
	};

	const comecarArrasto = (evento: DragEvent<HTMLButtonElement>) => {
		const view = editor.view;
		const dom = view.nodeDOM(alvo.posicao);
		const selecao = NodeSelection.create(view.state.doc, alvo.posicao);
		view.dispatch(view.state.tr.setSelection(selecao));
		const fatia = selecao.content();
		const { dom: html, text } = view.serializeForClipboard(fatia);
		evento.dataTransfer.clearData();
		evento.dataTransfer.setData("text/html", html.innerHTML);
		evento.dataTransfer.setData("text/plain", text);
		evento.dataTransfer.effectAllowed = "move";
		if (dom instanceof HTMLElement) evento.dataTransfer.setDragImage(dom, 0, 0);
		view.dragging = { slice: fatia, move: true };
		arrastando.current = true;
	};

	const escolher = (opcao: OpcaoBloco) => {
		setMenu(false);
		const atual = editor.state.doc.nodeAt(alvo.posicao);
		if (atual) opcao.fazer(editor, alvo.posicao, atual);
	};

	const item = (opcao: OpcaoBloco) => (
		<button key={opcao.nome} type="button" role="menuitem" className="menu-barra__item" onMouseDown={(evento) => evento.preventDefault()} onClick={() => escolher(opcao)}>
			<span className="menu-barra__icone" aria-hidden="true">
				{opcao.icone ? <Icon name={opcao.icone} size={18} strokeWidth={2} /> : <span className="menu-barra__sigla">{opcao.sigla}</span>}
			</span>
			<span className="body menu-barra__nome">{opcao.nome}</span>
		</button>
	);

	return (
		<div ref={raiz} className="alca-blocos" style={{ top: alvo.topo }}>
			<button
				type="button"
				className="alca-blocos__botao"
				aria-label="Bloco novo abaixo"
				title="Bloco novo abaixo"
				onMouseDown={(evento) => evento.preventDefault()}
				onClick={novaLinha}
			>
				<Icon name="plus" size={16} strokeWidth={2.5} />
			</button>
			<button
				type="button"
				className="alca-blocos__botao alca-blocos__arrastar"
				aria-label="Arraste para mover; clique para as opções do bloco"
				title="Arraste para mover; clique para as opções"
				aria-haspopup="menu"
				aria-expanded={menu}
				draggable
				onDragStart={comecarArrasto}
				onDragEnd={() => {
					arrastando.current = false;
					setAlvo(undefined);
					marcar(undefined);
				}}
				onClick={() => setMenu((aberto) => !aberto)}
			>
				<span className="alca-blocos__pontos" aria-hidden="true" />
			</button>
			{menu ? (
				<div className="menu-barra menu-bloco" role="menu" aria-label="Opções do bloco">
					{PODE_TRANSFORMAR.has(no.type.name) ? (
						<>
							<p className="body-sm menu-barra__grupo">Transformar em</p>
							{TRANSFORMAR_EM.map(item)}
						</>
					) : null}
					<p className="body-sm menu-barra__grupo">Bloco</p>
					{ACOES.map(item)}
				</div>
			) : null}
		</div>
	);
}
