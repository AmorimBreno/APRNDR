// O destaque que a rota da tela do aprendiz pede (aprendiz/historico?evento=<id>, aprendiz/hipoteses?hipotese=<id>): o
// elemento rola até ficar à vista quando está pronto e o destaque some no próximo clique. O destaque é só cor (o
// layout não muda; docs/padroes-de-interface.md, regra 5), e a rolagem não anima (sem movimento reduzido ou com).

import { useEffect, useRef } from "react";

export interface OpcoesDoDestaque {
	/** O que está destacado agora; vazio = nada (o hook não faz nada). */
	ids: readonly string[];
	/** Os dados de onde o elemento vem já chegaram (o elemento existe no DOM). */
	pronto: boolean;
	/** Acha o elemento do primeiro id que existe. */
	achar(ids: readonly string[]): Element | null | undefined;
	/** Tira o destaque (a tela navega para a rota sem ele). */
	limpar(): void;
}

/** Acha, dentro de `raiz`, o elemento cujo atributo (data-hipotese, data-evento) é um dos ids. */
export function acharPorAtributo(raiz: HTMLElement | null, atributo: string, ids: readonly string[]): Element | undefined {
	if (!raiz) return undefined;
	return [...raiz.querySelectorAll(`[${atributo}]`)].find((elemento) => ids.includes(elemento.getAttribute(atributo) ?? ""));
}

/** Rola até o elemento destacado, uma vez por destaque, e tira o destaque no próximo clique (em qualquer lugar). */
export function useDestaque(opcoes: OpcoesDoDestaque): void {
	const { ids, pronto } = opcoes;
	const chave = ids.join(",");
	const atual = useRef(opcoes);
	atual.current = opcoes;
	const rolado = useRef<string | undefined>(undefined);

	// Tenta a cada render até o elemento existir (o cartão pode aparecer um pouco depois dos dados).
	useEffect(() => {
		if (!chave || !pronto || rolado.current === chave) return;
		const elemento = atual.current.achar(atual.current.ids);
		if (!elemento) return;
		rolado.current = chave;
		// Centro da área que rola, sem animação: o conteúdo já está desenhado.
		(elemento as HTMLElement).scrollIntoView?.({ block: "center", behavior: "instant" as ScrollBehavior });
	});

	useEffect(() => {
		if (!chave || !pronto) return;
		// O clique que abriu a rota já passou; o próximo tira o destaque.
		let ouvindo = false;
		const aoClicar = () => atual.current.limpar();
		const relogio = setTimeout(() => {
			ouvindo = true;
			document.addEventListener("click", aoClicar, true);
		}, 0);
		return () => {
			clearTimeout(relogio);
			if (ouvindo) document.removeEventListener("click", aoClicar, true);
		};
	}, [chave, pronto]);

	useEffect(() => {
		if (!chave) rolado.current = undefined;
	}, [chave]);
}
