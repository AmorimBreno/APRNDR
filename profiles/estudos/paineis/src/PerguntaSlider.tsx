// Uma pergunta do questionário do fim da lição (docs/modulos.md, "O
// questionário do fim da lição"): o professor em bolha à esquerda e, à
// direita, a pergunta, o slider de 5 níveis com o nome do nível ao lado e, por
// baixo, a barra que enche e esquenta, com a chama no Excelente. Só
// apresentação: o valor vem por props e cada escolha sai por aoMudar.
//
// O slider é um input range com passo livre: enquanto é arrastado, o valor
// contínuo fica no estado local (e a bolha, a barra e o nome acompanham); ao
// soltar, encaixa no nível mais próximo com uma mola e chama aoMudar. As setas,
// PageUp/PageDown, Home e End andam de nível em nível (também com a mola). Sem
// resposta, o slider fica apagado no meio, e o primeiro toque ou tecla já dá
// um valor. Com reduzir movimento, o encaixe é direto e a chama não tremula.

import { animate, type AnimationPlaybackControls, useReducedMotion } from "motion/react";
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import {
	corComPresenca,
	encaixar,
	enchimentoDaBarra,
	type Nivel,
	nivelDaTecla,
	nomeDoNivel,
	presencaDaChama,
} from "./professor-tela.ts";
import { ProfessorBolha } from "./ProfessorBolha.tsx";

export interface PropsPerguntaSlider {
	/** O texto da pergunta ("Você sente que entendeu os conceitos?"). */
	pergunta: string;
	/** O nível escolhido; null = sem resposta. */
	valor: Nivel | null;
	/** Chamado com o nível quando o slider encaixa: ao soltar o arrasto e a cada tecla. */
	aoMudar: (valor: Nivel) => void;
	desligado?: boolean;
}

const MOLA_ENCAIXE = { type: "spring" as const, stiffness: 520, damping: 26 };

export function PerguntaSlider({ pergunta, valor, aoMudar, desligado = false }: PropsPerguntaSlider) {
	const id = useId();
	const reduzir = useReducedMotion() ?? false;
	// O valor contínuo do slider (null = sem resposta).
	const [posicao, setPosicaoEstado] = useState<number | null>(valor);
	const posicaoAtual = useRef(posicao);
	const setPosicao = useCallback((nova: number | null) => {
		posicaoAtual.current = nova;
		setPosicaoEstado(nova);
	}, []);
	const arrastando = useRef(false);
	const encaixe = useRef<{ controle: AnimationPlaybackControls; alvo: Nivel } | null>(null);
	const valorAtual = useRef(valor);
	valorAtual.current = valor;
	const aoMudarAtual = useRef(aoMudar);
	aoMudarAtual.current = aoMudar;

	const pararEncaixe = useCallback(() => {
		encaixe.current?.controle.stop();
		encaixe.current = null;
	}, []);

	/** Leva o slider até o nível (com a mola, ou direto com reduzir movimento) e avisa se mudou. */
	const encaixarEm = useCallback(
		(alvo: Nivel) => {
			pararEncaixe();
			const de = posicaoAtual.current;
			if (reduzir || de === null || de === alvo) setPosicao(alvo);
			else {
				const controle = animate(de, alvo, {
					...MOLA_ENCAIXE,
					onUpdate: (atual) => setPosicao(atual),
					onComplete: () => {
						encaixe.current = null;
						setPosicao(alvo);
					},
				});
				encaixe.current = { controle, alvo };
			}
			if (alvo !== valorAtual.current) aoMudarAtual.current(alvo);
		},
		[pararEncaixe, reduzir, setPosicao],
	);
	const encaixarEmAtual = useRef(encaixarEm);
	encaixarEmAtual.current = encaixarEm;
	/** O nível de agora: o alvo do encaixe em curso (teclas seguidas não se perdem no meio da mola) ou o mais próximo. */
	const nivelAtual = useCallback((): Nivel | null => encaixe.current?.alvo ?? (posicaoAtual.current === null ? null : encaixar(posicaoAtual.current)), []);

	// O valor que vem de fora (outra resposta, ou limpar): segue, menos no meio de um arrasto ou do encaixe nele.
	useEffect(() => {
		if (arrastando.current) return;
		if (encaixe.current && encaixe.current.alvo === valor) return;
		pararEncaixe();
		setPosicao(valor);
	}, [valor, pararEncaixe, setPosicao]);

	useEffect(() => pararEncaixe, [pararEncaixe]);

	const soltar = useCallback(() => {
		if (!arrastando.current) return;
		arrastando.current = false;
		window.removeEventListener("pointerup", soltar);
		window.removeEventListener("pointercancel", soltar);
		// Um toque no meio sem arrastar não muda o input: a posição continua null e vale o meio.
		encaixarEmAtual.current(encaixar(posicaoAtual.current ?? 3));
	}, []);

	useEffect(
		() => () => {
			window.removeEventListener("pointerup", soltar);
			window.removeEventListener("pointercancel", soltar);
		},
		[soltar],
	);

	function aoApertar() {
		if (desligado) return;
		pararEncaixe();
		arrastando.current = true;
		window.addEventListener("pointerup", soltar);
		window.addEventListener("pointercancel", soltar);
	}

	function aoMover(numero: number) {
		if (desligado) return;
		if (arrastando.current) {
			setPosicao(numero);
			return;
		}
		// Uma mudança sem arrasto nem tecla (um leitor de tela, por exemplo): anda um nível na direção dela.
		const atual = nivelAtual() ?? 3;
		const alvo = Math.abs(numero - atual) >= 1 ? encaixar(numero) : encaixar(atual + Math.sign(numero - atual));
		encaixarEm(alvo);
	}

	function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
		if (desligado) return;
		const atual = nivelAtual();
		const alvo = nivelDaTecla(atual, evento.key);
		if (alvo === undefined) return;
		evento.preventDefault();
		if (alvo !== atual || posicaoAtual.current === null) encaixarEm(alvo);
	}

	const nivel = posicao === null ? null : encaixar(posicao);
	const chama = presencaDaChama(posicao);
	const estilo = {
		"--pergunta-cor": corComPresenca("professor-humor", posicao ?? 3, posicao === null ? 0 : 1),
		"--pergunta-enchimento": `${enchimentoDaBarra(posicao)}%`,
		"--pergunta-barra": corComPresenca("pergunta-barra", posicao ?? 3, posicao === null ? 0 : 1),
		"--pergunta-chama": chama,
	} as CSSProperties;
	const classes = ["pergunta-slider", posicao === null && "pergunta-slider--vazia", desligado && "pergunta-slider--desligada", chama >= 0.5 && "pergunta-slider--quente"]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={classes} style={estilo}>
			<ProfessorBolha className="pergunta-slider__bolha" valor={posicao} tamanho={104} />
			<div className="pergunta-slider__corpo">
				<p id={`${id}-pergunta`} className="pergunta-slider__texto body-strong">
					{pergunta}
				</p>
				<div className="pergunta-slider__trilho">
					<span className="pergunta-slider__marcas" aria-hidden="true">
						{[1, 2, 3, 4, 5].map((marca) => (
							<span key={marca} className={nivel !== null && marca <= nivel ? "pergunta-slider__marca pergunta-slider__marca--cheia" : "pergunta-slider__marca"} />
						))}
					</span>
					<input
						type="range"
						className="pergunta-slider__faixa"
						min={1}
						max={5}
						step="any"
						value={posicao ?? 3}
						disabled={desligado}
						aria-labelledby={`${id}-pergunta`}
						aria-valuetext={nivel === null ? "Sem resposta" : nomeDoNivel(nivel)}
						onPointerDown={aoApertar}
						onChange={(evento) => aoMover(Number(evento.currentTarget.value))}
						onKeyDown={aoTeclar}
					/>
				</div>
				<span className="pergunta-slider__nome body-strong" aria-hidden="true">
					{nomeDoNivel(nivel)}
				</span>
				<span className="pergunta-slider__barra" aria-hidden="true">
					<span className="pergunta-slider__enchimento" />
				</span>
				<Chama />
			</div>
		</div>
	);
}

/** A chama do Excelente: duas camadas (fora e miolo); aparece e cresce com a variável --pergunta-chama. */
function Chama() {
	return (
		<svg className="pergunta-slider__chama" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
			<path
				className="pergunta-slider__chama-fora"
				d="M12 2.2c.7 3.3 3.2 4.9 4.6 7.5 1.6 3 1.2 6.6-1.2 8.6a5.7 5.7 0 0 1-7.6-.2c-2.1-2-2.4-5.2-.9-7.8.4 1.3 1.2 2.1 2.3 2.4-.7-3.7.7-7.8 2.8-10.5z"
			/>
			<path
				className="pergunta-slider__chama-miolo"
				d="M12.3 11c1.4 1.6 2.6 3.1 2.2 5.1a2.5 2.5 0 0 1-4.9.2c-.2-1.2.2-2.2 1-3 .3.6.7 1 1.2 1.1-.2-1.2.1-2.4.5-3.4z"
			/>
		</svg>
	);
}
