// A prévia de um bloco, como no Notion: ao passar o mouse (ou com ↑ e ↓) num
// item do menu do "/" ou do "Texto normal ›" da barra de formatação, um cartão
// ao lado mostra um exemplo pequeno do bloco, desenhado com as mesmas classes
// da nota (o Callout nas caixas, o KaTeX nas fórmulas), e a explicação.

import { Icon, type IconName } from "@estudos/design-system";
import katex from "katex";
import type { ReactNode } from "react";
import type { TomCaixa } from "../../lib/nota-tipos.ts";
import { VISUAL_CAIXA } from "./VisoesBlocos.tsx";

/** O LaTeX desenhado pelo KaTeX (só para a prévia: um exemplo fixo, sem HTML de fora). */
function Formula({ latex, emBloco }: { latex: string; emBloco: boolean }) {
	return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { displayMode: emBloco, throwOnError: false }) }} />;
}

function CaixaExemplo({ tom, texto }: { tom: TomCaixa; texto: string }) {
	const visual = VISUAL_CAIXA[tom];
	return (
		<aside className={`ap-callout ap-callout--${visual.tom} previa-bloco__caixa`}>
			<div className="ap-callout__head">
				<span className="ap-callout__badge" aria-hidden="true">
					<Icon name={visual.icone as IconName} size={14} strokeWidth={2.5} />
				</span>
				<span className="ap-callout__title">{visual.nome}</span>
			</div>
			<div className="ap-callout__body body-sm">{texto}</div>
		</aside>
	);
}

/** O exemplo de cada bloco, pelo id do item do menu. */
const EXEMPLOS: Record<string, () => ReactNode> = {
	texto: () => <p>Comece a escrever com texto simples.</p>,
	"titulo-1": () => <h1>Título da nota</h1>,
	"titulo-2": () => <h2>Seção</h2>,
	"titulo-3": () => <h3>Subseção</h3>,
	lista: () => (
		<ul>
			<li>Limite pela esquerda</li>
			<li>Limite pela direita</li>
		</ul>
	),
	numerada: () => (
		<ol>
			<li>Ler o slide</li>
			<li>Resolver a lista</li>
		</ol>
	),
	checklist: () => (
		<ul className="previa-bloco__tarefas">
			<li>
				<input type="checkbox" checked readOnly tabIndex={-1} /> Revisar a aula
			</li>
			<li>
				<input type="checkbox" readOnly tabIndex={-1} /> Fazer a lista 3
			</li>
		</ul>
	),
	citacao: () => <blockquote>Entender antes de decorar.</blockquote>,
	codigo: () => (
		<pre>
			<code>{"def f(x):\n    return x ** 2"}</code>
		</pre>
	),
	divisoria: () => (
		<>
			<p>Antes</p>
			<hr />
			<p>Depois</p>
		</>
	),
	"formula-bloco": () => (
		<div className="previa-bloco__formula">
			<Formula latex="\lim_{x \to a^+} f(x) = L" emBloco />
		</div>
	),
	"formula-linha": () => (
		<p>
			A área do círculo é <Formula latex="\pi r^2" emBloco={false} />.
		</p>
	),
	"caixa-ideia": () => <CaixaExemplo tom="ideia" texto="O limite existe quando os dois laterais são iguais." />,
	"caixa-atencao": () => <CaixaExemplo tom="atencao" texto="Não confunda o limite com o valor da função." />,
	"caixa-exemplo": () => <CaixaExemplo tom="exemplo" texto="Para f(x) = x², o limite em 2 é 4." />,
	"caixa-resumo": () => <CaixaExemplo tom="resumo" texto="Limite: para onde f(x) vai perto de a." />,
	recolhivel: () => (
		<p className="previa-bloco__recolhivel">
			<Icon name="chevron-right" size={14} strokeWidth={2.5} /> <strong>Detalhes da conta</strong>
		</p>
	),
	definicao: () => (
		<div className="previa-bloco__definicao">
			<strong>Receita bruta</strong>
			<span>O total vendido antes das deduções.</span>
		</div>
	),
	pergunta: () => (
		<div className="previa-bloco__pergunta">
			<strong>Qual grupo é mais puro: 9/10 ou 5/10?</strong>
			<span className="overline">Mostrar resposta</span>
		</div>
	),
};

/** Se o item tem prévia (os blocos do "/" têm; as menções não). */
export const temPrevia = (id: string) => id.replace(/^recente:/, "") in EXEMPLOS;

/** O cartão da prévia: o exemplo e a explicação. */
export function PreviaBloco({ id, dica }: { id: string; dica?: string }) {
	const exemplo = EXEMPLOS[id.replace(/^recente:/, "")];
	if (!exemplo) return null;
	return (
		<div className="previa-bloco" aria-hidden="true">
			<div className="ap-prose body previa-bloco__exemplo">{exemplo()}</div>
			{dica ? <p className="body-sm previa-bloco__dica">{dica}</p> : null}
		</div>
	);
}
