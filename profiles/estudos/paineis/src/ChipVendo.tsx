// O chip "Vendo: <arquivo>" do painel do professor (docs/mesa-de-estudo.md, 2.6):
// o rótulo da aba ativa, com o tipo como ícone pequeno, e o botão do olho. Olho
// aberto: o professor recebe o arquivo inteiro junto da mensagem; fechado, só o
// nome e o trecho que o Breno citar. Sem fonte registrada (mesa sem aba), o chip
// não aparece.

import { Icon } from "@estudos/design-system";
import { useVendo } from "./vendo.tsx";

const TRACO_ICONE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "square", strokeLinejoin: "miter" } as const;

/** O mesmo desenho do olho do chip da mensagem (packages/ui/src/visual/Conversa.tsx), que não o exporta. */
function IconeOlho({ aberto }: { aberto: boolean }) {
	return (
		<svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" {...TRACO_ICONE}>
			<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
			{aberto ? <circle cx="12" cy="12" r="2.75" /> : <path d="M4 20L20 4" />}
		</svg>
	);
}

export function ChipVendo() {
	const vendo = useVendo();
	const fonte = vendo.ativa();
	if (!fonte) return null;
	return (
		<div className="mesa-vendo">
			<div className="mesa-vendo__linha">
				<span className="mesa-vendo__chip" title={fonte.rotulo}>
					<Icon name={fonte.tipo === "licao" ? "book" : "notebook"} size={16} strokeWidth={2.25} />
					<span className="mesa-vendo__rotulo body-sm">Vendo: {fonte.rotulo}</span>
				</span>
				<button
					type="button"
					className="mesa-vendo__olho"
					aria-pressed={vendo.olho}
					aria-label="Mostrar o arquivo inteiro ao professor"
					title={vendo.olho ? "O professor vê o arquivo inteiro" : "O professor vê só o nome e o trecho que você citar"}
					onClick={vendo.alternarOlho}
				>
					<IconeOlho aberto={vendo.olho} />
				</button>
			</div>
			{vendo.falhou ? (
				<p className="mesa-vendo__aviso body-sm" role="status">
					Não consegui ler o arquivo; a última mensagem foi só com o nome.
				</p>
			) : null}
		</div>
	);
}
