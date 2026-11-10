// O valor que fica na tela enquanto um estado passageiro não dura o bastante
// (docs/padroes-de-interface.md, regras 1 e 2). Genérico: serve a qualquer
// rótulo, ícone ou indicador de situação, de qualquer perfil.

import { useEffect, useState } from "react";

/** Quanto um estado passageiro precisa durar para aparecer, em ms. */
export const ESPERA_ESTADO_PASSAGEIRO = 1000;

/**
 * Devolve o valor a mostrar. Um valor final (passageiro = false) aparece na
 * hora. Um passageiro ("Abrindo…", "Salvando…") só aparece se continuar o
 * mesmo por `espera` ms; até lá fica o que já estava na tela. `inicial` é o
 * último valor mostrado por quem veio antes (por exemplo a nota anterior,
 * quando o componente é remontado na troca), para a troca não começar em
 * branco nem no estado passageiro.
 */
export function useValorEstavel<T>(valor: T, passageiro: boolean, inicial?: T, espera = ESPERA_ESTADO_PASSAGEIRO): T {
	const [visivel, setVisivel] = useState<T>(() => (passageiro && inicial !== undefined ? inicial : valor));
	useEffect(() => {
		if (!passageiro) {
			setVisivel(valor);
			return;
		}
		const timer = setTimeout(() => setVisivel(valor), espera);
		return () => clearTimeout(timer);
	}, [valor, passageiro, espera]);
	return visivel;
}
