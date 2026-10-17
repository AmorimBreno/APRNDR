// Tela inicial: um card por perfil, como a escolha de perfil de um app de
// vídeo, no layout das telas de boot retrô (a arte, o nome grande, o
// ideograma com a tradução, a barra de carregar e o lema), com os tokens do
// design system: cor chapada e contorno, sem brilho. A aparência vem do campo
// aparencia do profile.json (capa, cor, lema, glifo).
//
// Tamanho: até 4 perfis ficam numa linha, com 80% do espaço (folga para a
// inclinação 3D); com 1 ou 2, cada card tem 80% da metade da largura. Com
// mais de 4, quebram em linhas.

import { EmptyState, Icon, ORNAMENT_MEANINGS, type OrnamentGlyph, pad2, Wordmark } from "@estudos/design-system";
import { type ErroPerfil, type ResumoPerfil, usePerfis } from "@estudos/ui";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { CSSProperties, PointerEvent } from "react";

/** Até quantos cards ficam numa linha só, com a altura da tela. */
const LIMITE_NUMA_LINHA = 4;

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function glifoDe(perfil: ResumoPerfil): OrnamentGlyph {
	const glifo = perfil.aparencia?.glifo;
	return glifo && Object.hasOwn(ORNAMENT_MEANINGS, glifo) ? (glifo as OrnamentGlyph) : "学";
}

/** Inclinação máxima do card, em graus, quando o mouse está na borda. */
const INCLINACAO = 7;

function CartaoPerfil({ perfil }: { perfil: ResumoPerfil }) {
	const aparencia = perfil.aparencia ?? {};
	const glifo = glifoDe(perfil);
	// O card inclina em 3D seguindo o mouse, com mola; a arte anda um pouco ao contrário (profundidade).
	const px = useMotionValue(0);
	const py = useMotionValue(0);
	const mola = { stiffness: 220, damping: 18, mass: 0.6 };
	const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-INCLINACAO, INCLINACAO]), mola);
	const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [INCLINACAO, -INCLINACAO]), mola);
	const arteX = useSpring(useTransform(px, [-0.5, 0.5], [10, -10]), mola);
	const arteY = useSpring(useTransform(py, [-0.5, 0.5], [8, -8]), mola);
	const mover = (evento: PointerEvent<HTMLAnchorElement>) => {
		const caixa = evento.currentTarget.getBoundingClientRect();
		px.set((evento.clientX - caixa.left) / caixa.width - 0.5);
		py.set((evento.clientY - caixa.top) / caixa.height - 0.5);
	};
	const soltar = () => {
		px.set(0);
		py.set(0);
	};
	return (
		<motion.a
			className={`cartao cartao--${aparencia.cor ?? "amber"}`}
			href={`#/perfil/${encodeURIComponent(perfil.id)}`}
			data-perfil={perfil.id}
			style={{ rotateX, rotateY, transformPerspective: 1100, viewTransitionName: `perfil-${perfil.id}`, viewTransitionClass: "perfil" }}
			onPointerMove={mover}
			onPointerLeave={soltar}
			whileTap={{ scale: 0.985 }}
		>
			<div className="cartao__arte">
				{aparencia.capa ? (
					<motion.img src={aparencia.capa} alt="" draggable={false} style={{ x: arteX, y: arteY }} />
				) : (
					<span className="cartao__glifo" lang="ja" aria-hidden="true">
						{glifo}
					</span>
				)}
			</div>

			<div className="cartao__nome">
				<span className="cartao__titulo">{perfil.nome}</span>
				<span className="cartao__legenda">
					<span lang="ja">{glifo}</span>
					<span className="overline">{ORNAMENT_MEANINGS[glifo]}</span>
				</span>
			</div>

			<div className="cartao__carregar">
				<span className="overline">{perfil.aberto ? "Continuar" : "Abrir perfil"}</span>
				<span className="cartao__trilho" aria-hidden="true">
					<span className="cartao__enchimento" />
				</span>
			</div>

			<div className="cartao__pe">
				<span className="data">{aparencia.lema ? `“${aparencia.lema}”` : perfil.aberto ? "Aberto agora" : ""}</span>
				<span className="cartao__selo" lang="ja" aria-hidden="true">
					{glifo.charAt(0)}
				</span>
			</div>
		</motion.a>
	);
}

function CartaoErro({ invalido }: { invalido: ErroPerfil }) {
	return (
		<div className="cartao cartao--erro" role="group" aria-label="Perfil com erro">
			<div className="cartao__erro-cabeca">
				<span className="overline">Erro no profile.json</span>
				<span className="cartao__arquivo data">{invalido.arquivo}</span>
			</div>
			<p className="cartao__mensagem code">{invalido.mensagem}</p>
			<div className="cartao__nome">
				<span className="cartao__titulo cartao__titulo--menor">Perfil com erro</span>
			</div>
			<div className="cartao__pe">
				<span className="data">Corrija o arquivo e recarregue</span>
				<Icon name="alert" size={22} strokeWidth={2.5} />
			</div>
		</div>
	);
}

export function TelaPerfis() {
	const { lista, erro, carregando, recarregar } = usePerfis();
	const perfis = lista?.perfis ?? [];
	const invalidos = lista?.erros ?? [];
	const cartoes = perfis.length + invalidos.length;

	let corpo;
	if (erro) {
		corpo = (
			<EmptyState glyph="問" tone="brick" title="Servidor fora do ar" role="alert">
				Não consegui ler a lista de perfis. Confira se o app está rodando (pnpm dev) e tente de novo. {erro}
			</EmptyState>
		);
	} else if (!lista) {
		corpo = (
			<p className="perfis__carregando overline">
				Carregando perfis <span className="ap-cursor" aria-hidden="true" />
			</p>
		);
	} else if (perfis.length === 0 && invalidos.length === 0) {
		corpo = (
			<EmptyState glyph="始" tone="moss" title="Nenhum perfil ainda">
				Perfis ficam em profiles/&lt;id&gt;/profile.json. Cada um define os agentes, as ferramentas e os painéis de um jeito de usar o app.
			</EmptyState>
		);
	} else {
		corpo = (
			<nav
				className={`perfis__grade${cartoes > LIMITE_NUMA_LINHA ? " perfis__grade--varias-linhas" : ""}`}
				style={{ "--colunas": Math.min(Math.max(cartoes, 2), LIMITE_NUMA_LINHA) } as CSSProperties}
				aria-label="Perfis"
			>
				{perfis.map((perfil) => (
					<CartaoPerfil key={perfil.id} perfil={perfil} />
				))}
				{invalidos.map((invalido) => (
					<CartaoErro key={invalido.arquivo} invalido={invalido} />
				))}
			</nav>
		);
	}

	return (
		<div className="perfis">
			<header className="perfis__cabeca">
				<div className="perfis__marca">
					<Wordmark size={32} />
					<h1 className="overline">Escolha um perfil · {mesAno.format(new Date())}</h1>
				</div>
				<button type="button" className="perfis__recarregar button" onClick={recarregar} disabled={carregando}>
					<Icon name="refresh" size={18} strokeWidth={2.25} />
					Recarregar
				</button>
			</header>
			<main className="perfis__corpo">{corpo}</main>
		</div>
	);
}
