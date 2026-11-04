// O bloco de baixo do painel do caderno, em três colunas (2fr 1fr 1fr): a lista
// com as tags (metade da largura), as tarefas e o calendário (um quarto cada).
// As três são filhas diretas daqui: a lista vem do TelaCaderno e as outras duas
// do AgendaDoCaderno.tsx.
//
// A altura: o painel (`.painel-caderno`) rola na vertical como um todo, e os
// cartões de tarefas e do calendário devem ir do topo do bloco até o fim da
// janela. O bloco cresce para ocupar o que sobra (flex: 1 0 auto, só em CSS: se a
// lista for maior, ele é do tamanho dela e o painel rola como sempre). Os cartões
// ocupam a altura do bloco mas com um teto: o que sobra da janela com o painel no
// topo (restoDoPainel, painel-caderno.ts), guardado aqui na variável `--resto`.
// Sem o teto, uma lista de notas comprida esticaria o calendário até virar uma
// grade gigante; com ele o cartão fica da altura da janela e, como é sticky no
// topo do painel, acompanha a rolagem. Nada é medido no painel além da altura dele
// e da posição do bloco, então o `layoutScroll` do motion.div (o arrasto do mapa
// de conteúdo) continua igual. Na tela estreita o CSS ignora a variável.
//
// A lista também é um cartão dessa altura (height: var(--resto), sticky): o seletor
// de tags fica fixo em cima e só o conteúdo da tag rola por dentro. Por isso a lista
// não aumenta mais a página; o painel só rola se a janela for mais baixa que a
// faixa dos cursos mais a altura mínima dos cartões. Na tela estreita a lista usa
// `--altura-painel` (a altura visível do painel, com um mínimo).

import { type ReactNode, useLayoutEffect, useRef } from "react";
import { restoDoPainel } from "./painel-caderno.ts";

export function BaixoDoCaderno(props: { children: ReactNode }) {
	const bloco = useRef<HTMLDivElement | null>(null);

	useLayoutEffect(() => {
		const elemento = bloco.current;
		const painel = elemento?.parentElement;
		if (!elemento || !painel) return;
		const medir = () => {
			// getBoundingClientRect vem na escala da tela e clientHeight na do layout; só diferem com um zoom por CSS, e a razão acerta a conta.
			const caixaDoPainel = painel.getBoundingClientRect();
			const escala = painel.offsetHeight > 0 ? caixaDoPainel.height / painel.offsetHeight : 1;
			const resto = restoDoPainel({
				alturaDoPainel: painel.clientHeight,
				topoDoPainel: 0,
				topoDoBloco: (elemento.getBoundingClientRect().top - caixaDoPainel.top) / escala,
				rolagem: painel.scrollTop,
			});
			elemento.style.setProperty("--resto", `${resto}px`);
			// A altura visível do painel: na tela estreita a lista usa ela (o CSS ignora o --resto).
			elemento.style.setProperty("--altura-painel", `${painel.clientHeight}px`);
		};
		medir();
		if (typeof ResizeObserver === "undefined") return;
		// A janela muda o painel; a faixa dos cursos (que carrega depois) muda onde o bloco começa.
		const observador = new ResizeObserver(medir);
		observador.observe(painel);
		if (elemento.previousElementSibling) observador.observe(elemento.previousElementSibling);
		return () => observador.disconnect();
	}, []);

	return (
		<div className="painel-caderno__baixo" ref={bloco}>
			{props.children}
		</div>
	);
}
