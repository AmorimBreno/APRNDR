// A pill do arquivo que o professor está vendo (docs/mesa-de-estudo.md, 2.6): vai
// em acimaDoCampo da conversa embutida, flutuando logo acima do campo. Um olho à
// esquerda e o nome do arquivo (o rótulo da aba ativa); a pill inteira é o botão
// do olho. Olho aberto: o professor recebe o arquivo inteiro junto da mensagem
// (ícone e borda âmbar); fechado: só o nome e o trecho que o Breno citar (ícone
// riscado, pill apagada). A pill não desmonta ao trocar de aba: fica com o nome
// antigo até a fonte nova se registrar, e só então o texto troca, num crossfade
// curto. Sem aba na mesa (haAba falso) ela não aparece.

import { Icon } from "@estudos/design-system";
import { semMovimento } from "@estudos/ui";
import { useEffect, useRef, useState } from "react";
import { useVendo } from "./vendo.tsx";

const TRACO_ICONE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "square", strokeLinejoin: "miter" } as const;
/** Metade do crossfade do texto: some em 75 ms, o nome novo volta em outros 75. */
const MEIO_CROSSFADE_MS = 75;

/** O mesmo desenho do olho do chip da mensagem (packages/ui/src/visual/Conversa.tsx), que não o exporta. */
function IconeOlho({ aberto }: { aberto: boolean }) {
	return (
		<svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" {...TRACO_ICONE}>
			<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
			{aberto ? <circle cx="12" cy="12" r="2.75" /> : <path d="M4 20L20 4" />}
		</svg>
	);
}

export interface PropsChipVendo {
	/** A rota de agora é uma aba (nota ou lição). Sem aba a pill some; com aba e sem fonte ainda, guarda o nome antigo. */
	haAba: boolean;
}

export function ChipVendo({ haAba }: PropsChipVendo) {
	const vendo = useVendo();
	const rotuloAtual = vendo.ativa()?.rotulo;
	const [texto, setTexto] = useState<string | undefined>(rotuloAtual);
	const [visivel, setVisivel] = useState(true);
	const parado = semMovimento();
	const textoRef = useRef(texto);
	textoRef.current = texto;

	useEffect(() => {
		if (!haAba) {
			setTexto(undefined);
			setVisivel(true);
			return;
		}
		// Troca de aba em andamento (a fonte antiga saiu, a nova ainda não se registrou): fica com o nome antigo.
		if (rotuloAtual === undefined || rotuloAtual === textoRef.current) return;
		if (textoRef.current === undefined || parado) {
			setTexto(rotuloAtual);
			return;
		}
		setVisivel(false);
		const tempo = setTimeout(() => {
			setTexto(rotuloAtual);
			setVisivel(true);
		}, MEIO_CROSSFADE_MS);
		return () => {
			clearTimeout(tempo);
			setVisivel(true);
		};
	}, [haAba, rotuloAtual, parado]);

	if (!haAba || texto === undefined) return null;
	const aviso = "Não consegui ler o arquivo; a última mensagem foi só com o nome.";
	return (
		<button
			type="button"
			className={`mesa-vendo${vendo.olho ? " mesa-vendo--aberto" : ""}`}
			aria-pressed={vendo.olho}
			aria-label={`Mostrar o arquivo inteiro ao professor: ${texto}`}
			title={vendo.olho ? "O professor vê o arquivo inteiro" : "O professor vê só o nome e o trecho que você citar"}
			onClick={vendo.alternarOlho}
		>
			<span className="mesa-vendo__olho">
				<IconeOlho aberto={vendo.olho} />
			</span>
			<span className={`mesa-vendo__rotulo body-sm${visivel ? "" : " mesa-vendo__rotulo--saindo"}`}>{texto}</span>
			{vendo.falhou ? (
				<span className="mesa-vendo__alerta" role="img" aria-label={aviso} title={aviso}>
					<Icon name="alert" size={14} strokeWidth={2.5} />
				</span>
			) : null}
		</button>
	);
}
