// Como os blocos da parte C aparecem no editor das notas (as visões dos nós,
// pelo ReactNodeViewRenderer do TipTap). O formato no arquivo continua o de
// blocos-nota.ts; aqui é só a tela.
// - Caixa: o visual do Callout do design system (as classes ap-callout), com a
//   aba do tom e a aba dos três pontos para trocar o tom;
// - Recolhível: uma seta abre e fecha o conteúdo (só na tela, o arquivo não
//   guarda); a pergunta e resposta começa fechada, com "Mostrar resposta".
//   Se o cursor entra no conteúdo escondido (Enter no fim do título), abre.
// A definição não precisa de visão: o CSS dá conta (estilo.css).

import { Icon, type IconName } from "@estudos/design-system";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { TONS_CAIXA, type TomCaixa } from "../../lib/nota-tipos.ts";
import { Caixa, Recolhivel } from "./blocos-nota.ts";

/** O tom da caixa no arquivo e o tom do Callout, o nome na aba e o ícone. */
export const VISUAL_CAIXA: Record<TomCaixa, { tom: "moss" | "amber" | "steel" | "cream"; nome: string; icone: IconName }> = {
	ideia: { tom: "moss", nome: "Ideia central", icone: "bulb" },
	atencao: { tom: "amber", nome: "Atenção", icone: "alert" },
	exemplo: { tom: "steel", nome: "Exemplo", icone: "book" },
	resumo: { tom: "cream", nome: "Resumo", icone: "list" },
};

function VisaoCaixa({ node, updateAttributes, editor }: ReactNodeViewProps) {
	const tom = (TONS_CAIXA as readonly string[]).includes(node.attrs.tom as string) ? (node.attrs.tom as TomCaixa) : "ideia";
	const visual = VISUAL_CAIXA[tom];
	const [menu, setMenu] = useState(false);
	const raiz = useRef<HTMLElement>(null);
	// Clique fora fecha o menu do tom.
	useEffect(() => {
		if (!menu) return;
		const fora = (evento: PointerEvent) => {
			if (!raiz.current?.contains(evento.target as Node)) setMenu(false);
		};
		document.addEventListener("pointerdown", fora);
		return () => document.removeEventListener("pointerdown", fora);
	}, [menu]);
	const editavel = editor.isEditable;
	return (
		<NodeViewWrapper as="aside" ref={raiz} className={`ap-callout ap-callout--${visual.tom}${editavel ? " ap-callout--menu" : ""}${menu ? " is-open" : ""} caixa-nota`}>
			<div className="ap-callout__head" contentEditable={false}>
				<span className="ap-callout__badge" aria-hidden="true">
					<Icon name={visual.icone} size={18} strokeWidth={2.5} />
				</span>
				<span className="ap-callout__title">{visual.nome}</span>
			</div>
			{editavel ? (
				<button
					type="button"
					contentEditable={false}
					className="ap-callout__more"
					aria-label={`Trocar o tom da caixa (${visual.nome})`}
					aria-haspopup="menu"
					aria-expanded={menu}
					onMouseDown={(evento) => evento.preventDefault()}
					onClick={() => setMenu((aberto) => !aberto)}
				>
					<span className="ap-callout__dot" />
					<span className="ap-callout__dot" />
					<span className="ap-callout__dot" />
				</button>
			) : null}
			{menu ? (
				<div className="ap-callout__menu" role="menu" aria-label="Tom da caixa" contentEditable={false}>
					{TONS_CAIXA.map((opcao) => (
						<button
							key={opcao}
							type="button"
							role="menuitem"
							className={`ap-callout__item body${opcao === tom ? " caixa-nota__tom--atual" : ""}`}
							onMouseDown={(evento) => evento.preventDefault()}
							onClick={() => {
								updateAttributes({ tom: opcao });
								setMenu(false);
							}}
						>
							<Icon name={VISUAL_CAIXA[opcao].icone} size={18} strokeWidth={2.25} />
							{VISUAL_CAIXA[opcao].nome}
						</button>
					))}
				</div>
			) : null}
			<NodeViewContent className="ap-callout__body caixa-nota__corpo" />
		</NodeViewWrapper>
	);
}

function VisaoRecolhivel({ node, editor, getPos }: ReactNodeViewProps) {
	const pergunta = node.attrs.tipo === "pergunta";
	const [aberto, setAberto] = useState(!pergunta);
	// O cursor entrou no conteúdo (depois do título) com ele fechado: abre.
	useEffect(() => {
		if (aberto) return;
		const aoMover = () => {
			const posicao = getPos();
			if (typeof posicao !== "number") return;
			const atual = editor.state.doc.nodeAt(posicao);
			if (!atual) return;
			const fimDoTitulo = posicao + 1 + (atual.firstChild?.nodeSize ?? 0);
			const { from } = editor.state.selection;
			if (from > fimDoTitulo && from < posicao + atual.nodeSize) setAberto(true);
		};
		editor.on("selectionUpdate", aoMover);
		return () => {
			editor.off("selectionUpdate", aoMover);
		};
	}, [aberto, editor, getPos]);
	const alternar = () => setAberto((valor) => !valor);
	return (
		<NodeViewWrapper className={`recolhivel-nota${pergunta ? " recolhivel-nota--pergunta" : ""}${aberto ? " recolhivel-nota--aberto" : ""}`}>
			<button
				type="button"
				contentEditable={false}
				className="recolhivel-nota__seta"
				aria-expanded={aberto}
				aria-label={aberto ? "Fechar" : "Abrir"}
				onMouseDown={(evento) => evento.preventDefault()}
				onClick={alternar}
			>
				<Icon name={pergunta ? "help" : "chevron-right"} size={16} strokeWidth={2.5} />
			</button>
			<NodeViewContent className="recolhivel-nota__conteudo" />
			{pergunta ? (
				<button type="button" contentEditable={false} className="overline recolhivel-nota__mostrar" onMouseDown={(evento) => evento.preventDefault()} onClick={alternar}>
					{aberto ? "Esconder resposta" : "Mostrar resposta"}
				</button>
			) : null}
		</NodeViewWrapper>
	);
}

/** A caixa com a visão do Callout. */
export const CaixaNaTela = Caixa.extend({
	addNodeView() {
		return ReactNodeViewRenderer(VisaoCaixa);
	},
});

/** O recolhível e a pergunta com a seta. */
export const RecolhivelNaTela = Recolhivel.extend({
	addNodeView() {
		return ReactNodeViewRenderer(VisaoRecolhivel);
	},
});
