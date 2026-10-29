// O professor em forma de bolha do questionário do fim da lição (docs/modulos.md,
// "O questionário do fim da lição"): uma bolha com contorno grosso que muda de
// humor com o valor contínuo de 1 a 5 (1 chorando, 2 triste, 3 contente,
// 4 animado, 5 maravilhado); null é a bolha neutra, apagada, de sem resposta.
// Só apresentação: recebe o valor e desenha.
//
// O valor é seguido por uma mola do Motion (useSpring). Da mola saem, a cada
// quadro, os olhos (os 12 vértices de cada olho misturados ponto a ponto entre
// os dois humores vizinhos, professor-tela.ts), a cor do corpo e da tinta
// (color-mix das variáveis do estilo.css), o achatamento e o peso das
// lágrimas e das sobrancelhas, que entram por opacidade e escala. A presença
// (0 sem resposta, 1 com) é outra mola. Ao cruzar um nível, a bolha dá um
// quique (uma mola com velocidade inicial). Com reduzir movimento, tudo pula
// direto para o valor, sem mola e sem quique.

import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import {
	achatamentoDoValor,
	caminhoFechado,
	corComPresenca,
	encaixar,
	espelhar,
	humorDoNivel,
	olhoNoValor,
	pesoDoNivel,
} from "./professor-tela.ts";

export interface PropsProfessorBolha {
	/** O valor contínuo, de 1 a 5; null = sem resposta (a bolha neutra, apagada). */
	valor: number | null;
	/** A largura em px (a altura segue a proporção do desenho, 140 × 120). Padrão 120. */
	tamanho?: number;
	className?: string;
}

const MOLA_HUMOR = { stiffness: 260, damping: 24, mass: 0.8 };
const MOLA_PRESENCA = { stiffness: 180, damping: 22 };
// O quique é uma mola que sai do 0 com velocidade e oscila até parar (pico perto de 0,8).
const MOLA_QUIQUE = { type: "spring" as const, stiffness: 420, damping: 9, velocity: 22 };
/** O quanto o quique estica e achata a bolha (multiplica a mola do quique). */
const FORCA_QUIQUE = 0.07;

export function ProfessorBolha({ valor, tamanho = 120, className }: PropsProfessorBolha) {
	const reduzir = useReducedMotion() ?? false;
	const presente = valor !== null;
	const humor = useSpring(valor ?? 3, MOLA_HUMOR);
	const presenca = useSpring(presente ? 1 : 0, MOLA_PRESENCA);
	const quique = useMotionValue(0);
	const nivelAnterior = useRef<number | null>(valor === null ? null : encaixar(valor));
	const presenteAntes = useRef(presente);

	useEffect(() => {
		if (valor !== null) {
			// Saindo de sem resposta, o humor já começa no valor: a troca é do neutro para ele.
			if (reduzir || !presenteAntes.current) humor.jump(valor);
			else humor.set(valor);
		}
		if (reduzir) presenca.jump(presente ? 1 : 0);
		else presenca.set(presente ? 1 : 0);
		presenteAntes.current = presente;
	}, [valor, presente, reduzir, humor, presenca]);

	// O quique: ao cruzar um nível com resposta.
	useMotionValueEvent(humor, "change", (atual) => {
		const nivel = encaixar(atual);
		const anterior = nivelAnterior.current;
		nivelAnterior.current = nivel;
		if (reduzir || anterior === null || anterior === nivel || presenca.get() < 0.5) return;
		quique.jump(0);
		animate(quique, 0, MOLA_QUIQUE);
	});
	useEffect(() => {
		if (valor === null) nivelAnterior.current = null;
	}, [valor]);

	const olhoEsquerdo = useTransform(() => caminhoFechado(olhoNoValor(humor.get(), presenca.get())));
	const olhoDireito = useTransform(() => caminhoFechado(espelhar(olhoNoValor(humor.get(), presenca.get()))));
	// A estrela é preenchida: o traço afina para ela não virar uma bola.
	const larguraOlho = useTransform(() => 6.5 - 3.5 * pesoDoNivel(humor.get(), 5) * presenca.get());
	const corCorpo = useTransform(() => corComPresenca("professor-humor", humor.get(), presenca.get()));
	const corTinta = useTransform(() => corComPresenca("professor-tinta", humor.get(), presenca.get()));
	const escalaX = useTransform(() => achatamentoDoValor(humor.get(), presenca.get())[0] * (1 - FORCA_QUIQUE * quique.get()));
	const escalaY = useTransform(() => achatamentoDoValor(humor.get(), presenca.get())[1] * (1 + FORCA_QUIQUE * quique.get()));
	const pesoLagrimas = useTransform(() => pesoDoNivel(humor.get(), 1) * presenca.get());
	const escalaLagrimas = useTransform(() => 0.4 + 0.6 * pesoLagrimas.get());
	const descidaLagrimas = useTransform(() => -6 * (1 - pesoLagrimas.get()));
	const pesoSobrancelhas = useTransform(() => pesoDoNivel(humor.get(), 2) * presenca.get());
	const escalaSobrancelhas = useTransform(() => 0.5 + 0.5 * pesoSobrancelhas.get());
	const descidaSobrancelhas = useTransform(() => 4 * (1 - pesoSobrancelhas.get()));

	// A tinta (contorno, olhos, lágrimas e sobrancelhas) vai numa variável CSS, que o Motion atualiza a cada quadro.
	const estiloCorpo = { scaleX: escalaX, scaleY: escalaY, originX: 0.5, originY: 1, "--professor-tinta": corTinta };

	const nivel = valor === null ? null : encaixar(valor);
	return (
		<svg
			className={["professor-bolha", className].filter(Boolean).join(" ")}
			viewBox="0 0 140 120"
			width={tamanho}
			height={(tamanho * 120) / 140}
			role="img"
			aria-label={`Professor ${humorDoNivel(nivel)}`}
		>
			<motion.g style={estiloCorpo}>
				<motion.ellipse className="professor-bolha__corpo" cx="70" cy="62" rx="58" ry="44" style={{ fill: corCorpo }} />
				<ellipse className="professor-bolha__brilho" cx="50" cy="39" rx="17" ry="6.5" transform="rotate(-14 50 39)" />
				<motion.g className="professor-bolha__lagrimas" style={{ opacity: pesoLagrimas, scale: escalaLagrimas, y: descidaLagrimas, originY: 0 }}>
					<path d="M47 73.5c-3 4.6-4.6 7.4-4.6 9.6a4.6 4.6 0 0 0 9.2 0c0-2.2-1.6-5-4.6-9.6z" />
					<path d="M93 75.5c-3 4.6-4.6 7.4-4.6 9.6a4.6 4.6 0 0 0 9.2 0c0-2.2-1.6-5-4.6-9.6z" />
				</motion.g>
				<motion.g className="professor-bolha__sobrancelhas" style={{ opacity: pesoSobrancelhas, scale: escalaSobrancelhas, y: descidaSobrancelhas }}>
					<path d="M37 48 L51 41.5" />
					<path d="M103 48 L89 41.5" />
				</motion.g>
				<motion.path className="professor-bolha__olho" d={olhoEsquerdo} style={{ strokeWidth: larguraOlho }} />
				<motion.path className="professor-bolha__olho" d={olhoDireito} style={{ strokeWidth: larguraOlho }} />
			</motion.g>
		</svg>
	);
}
