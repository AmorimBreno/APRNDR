// O editor de uma fórmula da nota (item 4.3, parte C): um modal com o LaTeX e a
// prévia ao vivo pelo KaTeX (o mesmo que desenha as fórmulas da conversa). Um
// LaTeX com erro mostra a mensagem do KaTeX em vez de quebrar. Ctrl+Enter
// salva; Esc cancela. Salvar vazio remove a fórmula.

import { Button, Modal, TextArea } from "@estudos/design-system";
import katex from "katex";
import { useEffect, useMemo, useState } from "react";

export interface PropsEditorFormula {
	/** A fórmula sendo editada; undefined fecha o modal. */
	formula?: { tipo: "linha" | "bloco"; latex: string; nova: boolean };
	salvar(latex: string): void;
	remover(): void;
	cancelar(): void;
}

/** O HTML da prévia, ou o erro do KaTeX. */
export function previaFormula(latex: string, emBloco: boolean): { html: string } | { erro: string } {
	try {
		return { html: katex.renderToString(latex, { displayMode: emBloco, throwOnError: true }) };
	} catch (falha) {
		return { erro: (falha as Error).message.replace(/^KaTeX parse error:\s*/, "") };
	}
}

export function EditorFormula({ formula, salvar, remover, cancelar }: PropsEditorFormula) {
	const [latex, setLatex] = useState("");
	useEffect(() => {
		if (formula) setLatex(formula.latex);
	}, [formula]);
	const emBloco = formula?.tipo === "bloco";
	const previa = useMemo(() => (latex.trim() ? previaFormula(latex, emBloco) : undefined), [latex, emBloco]);
	const confirmar = () => salvar(latex.trim());

	return (
		<Modal
			open={Boolean(formula)}
			onClose={cancelar}
			kicker={emBloco ? "Fórmula em bloco" : "Fórmula na linha"}
			title={formula?.nova ? "Nova fórmula" : "Editar fórmula"}
			size="md"
			footer={
				<>
					{formula && !formula.nova ? (
						<Button variant="ghost" onClick={remover}>
							Remover
						</Button>
					) : null}
					<Button variant="secondary" onClick={cancelar}>
						Cancelar
					</Button>
					<Button variant="primary" icon="check" onClick={confirmar} disabled={Boolean(previa && "erro" in previa)}>
						Salvar
					</Button>
				</>
			}
		>
			<div className="editor-formula">
				<TextArea
					label="LaTeX"
					value={latex}
					onChange={(evento) => setLatex(evento.target.value)}
					rows={emBloco ? 4 : 2}
					counter={false}
					spellCheck={false}
					autoFocus
					className="editor-formula__campo"
					placeholder={emBloco ? "\\lim_{x \\to a^+} f(x) = L" : "\\pi r^2"}
					hint="Ctrl+Enter salva. É o mesmo LaTeX que o professor usa entre $ e $."
					{...(previa && "erro" in previa ? { error: previa.erro } : {})}
					onKeyDown={(evento) => {
						if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
							evento.preventDefault();
							if (!(previa && "erro" in previa)) confirmar();
						}
					}}
				/>
				<div className="editor-formula__previa" aria-live="polite">
					<span className="overline">Prévia</span>
					{previa && "html" in previa ? (
						// O HTML vem do KaTeX, a partir do LaTeX (sem HTML de fora).
						<div className={emBloco ? "editor-formula__bloco" : "editor-formula__linha"} dangerouslySetInnerHTML={{ __html: previa.html }} />
					) : (
						<p className="body-sm editor-formula__vazia">{previa ? "Corrija o LaTeX para ver a fórmula." : "Escreva o LaTeX acima."}</p>
					)}
				</div>
			</div>
		</Modal>
	);
}
