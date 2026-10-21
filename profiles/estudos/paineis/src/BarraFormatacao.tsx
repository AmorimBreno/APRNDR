// A barra que aparece ao selecionar um trecho da nota, no modelo da do Notion
// (sem os botões de IA e de comentário): o tipo do bloco ("Texto ▾", que troca
// o bloco e mostra a prévia de cada tipo ao passar o mouse), A (cor do texto e
// cor de fundo), negrito, itálico, sublinhado, tachado, código, √x (o trecho
// vira fórmula), link e Tx (limpar a formatação).

import { Icon, type IconName } from "@estudos/design-system";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { CORES_TEXTO, type CorTexto } from "../../lib/nota-tipos.ts";
import { ITENS_BARRA } from "./comandos-barra.ts";
import { LARGURA_PREVIA } from "./MenuBarra.tsx";
import { PreviaBloco } from "./PreviaBloco.tsx";

export const NOMES_COR: Record<CorTexto, string> = { tijolo: "Tijolo", ambar: "Âmbar", musgo: "Musgo", aco: "Aço", salvia: "Sálvia" };

interface TipoBloco {
	/** O id do item do "/" (para a prévia e a explicação). */
	id: string;
	nome: string;
	sigla?: string;
	icone?: IconName;
	ativo(editor: Editor): boolean;
	trocar(editor: Editor): void;
}

/** Os tipos para os quais o trecho selecionado pode virar, na ordem do Notion; o primeiro ativo é o atual. */
const TIPOS: TipoBloco[] = [
	{ id: "codigo", nome: "Código", icone: "code", ativo: (e) => e.isActive("codeBlock"), trocar: (e) => void e.chain().focus().clearNodes().setCodeBlock().run() },
	...([1, 2, 3] as const).map(
		(nivel): TipoBloco => ({
			id: `titulo-${nivel}`,
			nome: `Título ${nivel}`,
			sigla: `H${nivel}`,
			ativo: (e) => e.isActive("heading", { level: nivel }),
			trocar: (e) => void e.chain().focus().clearNodes().setHeading({ level: nivel }).run(),
		}),
	),
	{ id: "checklist", nome: "Checklist", icone: "checklist", ativo: (e) => e.isActive("taskList"), trocar: (e) => void e.chain().focus().clearNodes().toggleTaskList().run() },
	{ id: "numerada", nome: "Lista numerada", sigla: "1.", ativo: (e) => e.isActive("orderedList"), trocar: (e) => void e.chain().focus().clearNodes().toggleOrderedList().run() },
	{ id: "lista", nome: "Lista", sigla: "•", ativo: (e) => e.isActive("bulletList"), trocar: (e) => void e.chain().focus().clearNodes().toggleBulletList().run() },
	{ id: "citacao", nome: "Citação", sigla: "“", ativo: (e) => e.isActive("blockquote"), trocar: (e) => void e.chain().focus().clearNodes().setBlockquote().run() },
	{ id: "texto", nome: "Texto", sigla: "Aa", ativo: () => true, trocar: (e) => void e.chain().focus().clearNodes().setParagraph().run() },
];
/** A ordem em que a lista aparece (a do "/"). */
const ORDEM_LISTA = ["texto", "titulo-1", "titulo-2", "titulo-3", "lista", "numerada", "checklist", "citacao", "codigo"];
const LISTA_TIPOS = ORDEM_LISTA.map((id) => TIPOS.find((tipo) => tipo.id === id)!);
const dicaDe = (id: string) => ITENS_BARRA.find((item) => item.id === id)?.dica;

type Aberto = "tipo" | "cor" | "link" | undefined;

export interface PropsBarraFormatacao {
	editor: Editor;
	/** Abre o editor de fórmula para a fórmula na linha que está na posição. */
	editarFormula(latex: string, posicao: number): void;
}

export function BarraFormatacao({ editor, editarFormula }: PropsBarraFormatacao) {
	const estado = useEditorState({
		editor,
		selector: ({ editor: atual }) => ({
			tipo: TIPOS.find((tipo) => tipo.ativo(atual))!.id,
			negrito: atual.isActive("bold"),
			italico: atual.isActive("italic"),
			sublinhado: atual.isActive("sublinhado"),
			tachado: atual.isActive("strike"),
			codigo: atual.isActive("code"),
			link: atual.isActive("link") ? String(atual.getAttributes("link").href ?? "") : undefined,
			cor: atual.isActive("corDoTexto") ? (atual.getAttributes("corDoTexto").cor as CorTexto) : undefined,
			fundo: atual.isActive("marcaTexto") ? ((atual.getAttributes("marcaTexto").cor as CorTexto | undefined) ?? "ambar") : undefined,
			// A fórmula só nasce de um trecho dentro de um bloco de texto só.
			umBloco: atual.state.selection.$from.sameParent(atual.state.selection.$to),
		}),
	});
	const [aberto, setAberto] = useState<Aberto>(undefined);
	const alternar = (qual: Exclude<Aberto, undefined>) => setAberto((atual) => (atual === qual ? undefined : qual));
	const tipoAtual = TIPOS.find((tipo) => tipo.id === estado.tipo)!;

	/**
	 * O trecho selecionado vira uma fórmula na linha, e o editor de fórmula abre
	 * com ele. Os espaços das pontas ficam fora (o duplo clique do Windows pega
	 * o espaço depois da palavra).
	 */
	const virarFormula = () => {
		const { from, to } = editor.state.selection;
		const texto = editor.state.doc.textBetween(from, to);
		const latex = texto.trim();
		if (!latex) return;
		const inicio = from + (texto.length - texto.trimStart().length);
		const fim = to - (texto.length - texto.trimEnd().length);
		editor.chain().focus().insertContentAt({ from: inicio, to: fim }, { type: "inlineMath", attrs: { latex } }).run();
		editarFormula(latex, inicio);
	};

	const botao = (rotulo: string, ativo: boolean, fazer: () => void, conteudo: ReactNode, atalho?: string, desligado = false) => (
		<button
			type="button"
			className={`barra-formatacao__botao${ativo ? " barra-formatacao__botao--ativo" : ""}`}
			aria-label={rotulo}
			aria-pressed={ativo}
			title={atalho ? `${rotulo} (${atalho})` : rotulo}
			disabled={desligado}
			onClick={fazer}
		>
			{conteudo}
		</button>
	);

	return (
		<div className="barra-formatacao">
			<div className="barra-formatacao__linha" role="toolbar" aria-label="Formatar o trecho">
				<button
					type="button"
					className={`barra-formatacao__botao barra-formatacao__tipo${aberto === "tipo" ? " barra-formatacao__botao--ativo" : ""}`}
					aria-haspopup="menu"
					aria-expanded={aberto === "tipo"}
					title="Transformar em"
					onClick={() => alternar("tipo")}
				>
					<span className="body-sm">{tipoAtual.nome}</span>
					<Icon name="chevron-down" size={12} strokeWidth={2.5} />
				</button>
				<span className="barra-formatacao__fio" aria-hidden="true" />
				<button
					type="button"
					className={`barra-formatacao__botao${aberto === "cor" ? " barra-formatacao__botao--ativo" : ""}`}
					aria-haspopup="menu"
					aria-expanded={aberto === "cor"}
					aria-label="Cor"
					title="Cor do texto e de fundo"
					onClick={() => alternar("cor")}
				>
					<span className={`barra-formatacao__letra-cor${estado.cor ? ` cor-${estado.cor}` : ""}${estado.fundo ? ` barra-formatacao__letra-cor--fundo fundo-${estado.fundo}` : ""}`}>A</span>
					<Icon name="chevron-down" size={10} strokeWidth={2.5} />
				</button>
				<span className="barra-formatacao__fio" aria-hidden="true" />
				{botao("Negrito", estado.negrito, () => editor.chain().focus().toggleBold().run(), <b>B</b>, "Ctrl+B")}
				{botao("Itálico", estado.italico, () => editor.chain().focus().toggleItalic().run(), <i className="barra-formatacao__italico">I</i>, "Ctrl+I")}
				{botao("Sublinhado", estado.sublinhado, () => editor.chain().focus().toggleMark("sublinhado").run(), <u>U</u>, "Ctrl+U")}
				{botao("Tachado", estado.tachado, () => editor.chain().focus().toggleStrike().run(), <s>S</s>, "Ctrl+Shift+S")}
				{botao("Código", estado.codigo, () => editor.chain().focus().toggleCode().run(), <Icon name="code" size={15} strokeWidth={2.5} />, "Ctrl+E")}
				{botao("Fórmula", false, virarFormula, <span className="barra-formatacao__raiz">√x</span>, undefined, !estado.umBloco)}
				<span className="barra-formatacao__fio" aria-hidden="true" />
				<button
					type="button"
					className={`barra-formatacao__botao${estado.link !== undefined || aberto === "link" ? " barra-formatacao__botao--ativo" : ""}`}
					aria-haspopup="dialog"
					aria-expanded={aberto === "link"}
					aria-label="Link"
					title="Link"
					onClick={() => alternar("link")}
				>
					<span className="barra-formatacao__elo" aria-hidden="true" />
				</button>
				{botao("Limpar a formatação", false, () => editor.chain().focus().unsetAllMarks().run(), <span className="barra-formatacao__limpar">T<sub>x</sub></span>)}
			</div>
			{aberto === "tipo" ? <ListaTipos editor={editor} atual={tipoAtual.id} fechar={() => setAberto(undefined)} /> : null}
			{aberto === "cor" ? <PaletaCores editor={editor} cor={estado.cor} fundo={estado.fundo} /> : null}
			{aberto === "link" ? <CampoLink editor={editor} link={estado.link} fechar={() => setAberto(undefined)} /> : null}
		</div>
	);
}

/** "Transformar em": os tipos de bloco, com o atual marcado e a prévia do que está sob o mouse. */
function ListaTipos({ editor, atual, fechar }: { editor: Editor; atual: string; fechar(): void }) {
	const [sobMouse, setSobMouse] = useState<{ id: string; topo: number } | undefined>(undefined);
	const caixa = useRef<HTMLDivElement>(null);
	const [esquerda, setEsquerda] = useState(false);
	useLayoutEffect(() => {
		const retangulo = caixa.current?.getBoundingClientRect();
		if (retangulo) setEsquerda(retangulo.right + LARGURA_PREVIA + 16 > window.innerWidth);
	}, []);
	return (
		<div ref={caixa} className="menu-com-previa barra-formatacao__menu">
			{sobMouse ? (
				<div className={`menu-com-previa__cartao${esquerda ? " menu-com-previa__cartao--esquerda" : ""}`} style={{ top: sobMouse.topo }}>
					<PreviaBloco id={sobMouse.id} {...(dicaDe(sobMouse.id) ? { dica: dicaDe(sobMouse.id)! } : {})} />
				</div>
			) : null}
			<div className="menu-barra menu-barra--curto" role="menu" aria-label="Transformar em" onMouseLeave={() => setSobMouse(undefined)}>
				<div className="menu-barra__lista">
					<p className="body-sm menu-barra__grupo">Transformar em</p>
					{LISTA_TIPOS.map((tipo) => (
						<button
							key={tipo.id}
							type="button"
							role="menuitemradio"
							aria-checked={tipo.id === atual}
							className={`menu-barra__item${sobMouse?.id === tipo.id ? " menu-barra__item--ativo" : ""}`}
							onMouseEnter={(evento) => setSobMouse({ id: tipo.id, topo: Math.max(0, evento.currentTarget.offsetTop - 8) })}
							onClick={() => {
								tipo.trocar(editor);
								fechar();
							}}
						>
							<span className="menu-barra__icone" aria-hidden="true">
								{tipo.icone ? <Icon name={tipo.icone} size={16} strokeWidth={2.5} /> : <span className="menu-barra__sigla">{tipo.sigla}</span>}
							</span>
							<span className="body menu-barra__nome">{tipo.nome}</span>
							{tipo.id === atual ? <Icon name="check" size={14} strokeWidth={2.5} /> : null}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

/** A paleta do A: a cor do texto (<span class="cor-…">) e a cor de fundo, o marca-texto (<mark>). */
function PaletaCores({ editor, cor, fundo }: { editor: Editor; cor: CorTexto | undefined; fundo: CorTexto | undefined }) {
	const quadrado = (rotulo: string, ativo: boolean, classe: string, fazer: () => void) => (
		<button
			key={rotulo}
			type="button"
			className={`paleta-cores__quadrado ${classe}${ativo ? " paleta-cores__quadrado--ativo" : ""}`}
			aria-label={rotulo}
			aria-pressed={ativo}
			title={rotulo}
			onClick={fazer}
		>
			A
		</button>
	);
	return (
		<div className="menu-barra menu-barra--curto barra-formatacao__menu paleta-cores" role="menu" aria-label="Cores">
			<div className="menu-barra__lista">
				<p className="body-sm menu-barra__grupo">Cor do texto</p>
				<div className="paleta-cores__grade">
					{quadrado("Texto padrão", cor === undefined, "", () => editor.chain().focus().unsetMark("corDoTexto").run())}
					{CORES_TEXTO.map((uma) => quadrado(`Texto ${NOMES_COR[uma].toLowerCase()}`, cor === uma, `cor-${uma}`, () => editor.chain().focus().setMark("corDoTexto", { cor: uma }).run()))}
				</div>
				<p className="body-sm menu-barra__grupo">Cor de fundo</p>
				<div className="paleta-cores__grade">
					{quadrado("Fundo padrão", fundo === undefined, "", () => editor.chain().focus().unsetMark("marcaTexto").run())}
					{CORES_TEXTO.map((uma) =>
						quadrado(`Fundo ${NOMES_COR[uma].toLowerCase()}`, fundo === uma, `paleta-cores__fundo fundo-${uma}`, () => editor.chain().focus().setMark("marcaTexto", { cor: uma }).run()),
					)}
				</div>
			</div>
		</div>
	);
}

/** "exemplo.com" vira "https://exemplo.com" (sem o protocolo, o markdown teria um link relativo); "mailto:", "#" e "/" ficam como estão. */
export const comProtocolo = (endereco: string) => (!endereco || /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(endereco) ? endereco : `https://${endereco}`);

/** O campo do link: Enter aplica (no trecho, ou no link inteiro em que o cursor está); vazio tira o link. */
function CampoLink({ editor, link, fechar }: { editor: Editor; link: string | undefined; fechar(): void }) {
	const [valor, setValor] = useState(link ?? "");
	const aplicar = () => {
		const endereco = comProtocolo(valor.trim());
		if (!endereco) editor.chain().focus().extendMarkRange("link").unsetLink().run();
		else editor.chain().focus().extendMarkRange("link").setLink({ href: endereco }).run();
		fechar();
	};
	const teclar = (evento: KeyboardEvent<HTMLInputElement>) => {
		if (evento.key === "Enter") {
			evento.preventDefault();
			aplicar();
		} else if (evento.key === "Escape") {
			evento.preventDefault();
			editor.commands.focus();
			fechar();
		}
	};
	return (
		<div className="menu-barra menu-barra--curto barra-formatacao__menu campo-link" role="dialog" aria-label="Link">
			<div className="campo-link__linha">
				<input
					autoFocus
					className="body-sm campo-link__entrada"
					type="url"
					placeholder="Cole ou digite um link"
					value={valor}
					onChange={(evento) => setValor(evento.target.value)}
					onKeyDown={teclar}
				/>
				<button type="button" className="barra-formatacao__botao" onClick={aplicar} aria-label="Aplicar o link" title="Aplicar (Enter)">
					<Icon name="check" size={14} strokeWidth={2.5} />
				</button>
			</div>
			{link !== undefined ? (
				<button
					type="button"
					className="menu-barra__item"
					onClick={() => {
						editor.chain().focus().extendMarkRange("link").unsetLink().run();
						fechar();
					}}
				>
					<span className="menu-barra__icone" aria-hidden="true">
						<Icon name="close" size={14} strokeWidth={2.5} />
					</span>
					<span className="body menu-barra__nome">Remover o link</span>
				</button>
			) : null}
		</div>
	);
}
