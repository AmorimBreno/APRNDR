// Uma pergunta do questionário do fim da lição (docs/modulos.md, "O
// questionário do fim da lição"): o professor em bolha à esquerda e, à
// direita, a pergunta e o slider de 5 níveis. Só apresentação: o valor vem por
// props e cada escolha sai por aoMudar.
//
// O slider é uma trilha gorda (como o do esforço do modelo no Claude Code): o
// pegador é uma pílula da altura da trilha, na cor do humor, com o nome do
// nível dentro, e a parte da esquerda até ele se enche com a mesma cor. Perto
// do Excelente (de 4,3 a 5, crescendo aos poucos), o preenchimento pega fogo
// (línguas de fogo subindo e tremulando dentro dele) e o pegador solta chamas
// e faíscas para cima.
//
// Por baixo do desenho há um input range transparente, com o polegar da
// largura do pegador e a altura da trilha: o navegador cuida do ponteiro, do
// foco e do leitor de tela, e a posição que ele calcula bate com a do pegador
// desenhado. Com passo livre, enquanto é arrastado o valor contínuo fica no
// estado local (e a bolha, as cores e o fogo acompanham); ao soltar, encaixa no
// nível mais próximo com uma mola e chama aoMudar. As setas, PageUp/PageDown,
// Home e End andam de nível em nível (também com a mola). Sem resposta, a
// trilha fica vazia e apagada, com o pegador neutro no meio, e o primeiro
// toque ou tecla já dá um valor. Com reduzir movimento, o encaixe é direto e as
// chamas ficam paradas.

import { animate, type AnimationPlaybackControls, useReducedMotion } from "motion/react";
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import {
	corComPresenca,
	encaixar,
	fracaoDaTrilha,
	linguasDeFogo,
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
/** As línguas do fogo da trilha: uma faixa mais larga que qualquer trilha; o preenchimento corta o resto. */
const LINGUAS = linguasDeFogo(56);

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
		"--pergunta-fracao": fracaoDaTrilha(posicao),
		"--pergunta-chama": chama,
	} as CSSProperties;
	const classes = ["pergunta-slider", posicao === null && "pergunta-slider--vazia", desligado && "pergunta-slider--desligada", chama > 0 && "pergunta-slider--quente"]
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
							<span key={marca} className="pergunta-slider__marca" />
						))}
					</span>
					<span className="pergunta-slider__preenchimento" aria-hidden="true">
						{chama > 0 ? <FogoDaTrilha /> : null}
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
					<span className="pergunta-slider__pegador" aria-hidden="true">
						{chama > 0 ? <ChamasDoPegador /> : null}
						<span className="pergunta-slider__nome body-sm">{nomeDoNivel(nivel)}</span>
					</span>
				</div>
			</div>
		</div>
	);
}

/** A gota da língua de fogo, no viewBox 0 0 20 40: ponta em cima, base redonda embaixo. */
const GOTA = "M10 0C11.5 7 19 14 19.5 25.5 20 34 15.5 40 10 40S0 34 .5 25.5C1 14 8.5 7 10 0Z";

/**
 * Uma língua de fogo: a mesma gota de ponta fina em três camadas (a de fora,
 * o meio e o miolo claro), cada uma menor e encostada na base.
 */
function Lingua() {
	return (
		<svg viewBox="0 0 20 40" preserveAspectRatio="none" aria-hidden="true">
			<path className="pergunta-slider__fogo-fora" d={GOTA} />
			<path className="pergunta-slider__fogo-meio" d={GOTA} transform="translate(3.5 12) scale(.65 .7)" />
			<path className="pergunta-slider__fogo-miolo" d={GOTA} transform="translate(6.5 24) scale(.35 .4)" />
		</svg>
	);
}

/** O fogo dentro do preenchimento: as línguas lado a lado, cada uma com a sua altura e o seu tremor. */
function FogoDaTrilha() {
	return (
		<span className="pergunta-slider__fogo">
			{LINGUAS.map((lingua) => (
				<span
					key={lingua.x}
					className="pergunta-slider__lingua"
					style={
						{
							left: `${lingua.x}px`,
							width: `${lingua.largura}px`,
							height: `${Math.round(lingua.altura * 100)}%`,
							animationDuration: `${lingua.duracao}s`,
							animationDelay: `${lingua.atraso}s`,
						} as CSSProperties
					}
				>
					<Lingua />
				</span>
			))}
		</span>
	);
}

/** As chamas do pegador: três línguas que sobem acima dele (a do meio maior) e três faíscas. */
function ChamasDoPegador() {
	return (
		<span className="pergunta-slider__chamas">
			<span className="pergunta-slider__chama pergunta-slider__chama--esquerda">
				<Lingua />
			</span>
			<span className="pergunta-slider__chama pergunta-slider__chama--meio">
				<Lingua />
			</span>
			<span className="pergunta-slider__chama pergunta-slider__chama--direita">
				<Lingua />
			</span>
			<span className="pergunta-slider__faisca pergunta-slider__faisca--1" />
			<span className="pergunta-slider__faisca pergunta-slider__faisca--2" />
			<span className="pergunta-slider__faisca pergunta-slider__faisca--3" />
		</span>
	);
}
