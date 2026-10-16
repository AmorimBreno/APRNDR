// Rotas por hash (o recarregar da página mantém a tela):
// - "#/": a tela de perfis;
// - "#/perfil/<id>": a tela inicial do perfil, se ele tiver uma (telas-iniciais.ts),
//   ou a janela de conversa;
// - "#/perfil/<id>/conversa": a janela de conversa de um perfil com tela inicial.

import { usePerfis } from "@estudos/ui";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { telasIniciais } from "./telas-iniciais.ts";
import { JanelaPerfil } from "./telas/JanelaPerfil.tsx";
import { TelaPerfis } from "./telas/TelaPerfis.tsx";

interface Rota {
	perfil?: string;
	conversa: boolean;
}

export function rotaDoHash(hash: string): Rota {
	const achado = /^#\/perfil\/([^/]+)(\/conversa)?$/.exec(hash);
	return achado ? { perfil: decodeURIComponent(achado[1]!), conversa: Boolean(achado[2]) } : { conversa: false };
}

function irPara(hash: string): void {
	window.location.hash = hash;
}

function TelaInicial({ perfilId }: { perfilId: string }) {
	const { lista } = usePerfis();
	const entrada = telasIniciais[perfilId]!;
	const Componente = entrada.componente;
	const perfil = lista?.perfis.find((item) => item.id === perfilId);
	return (
		<Componente
			perfilId={perfilId}
			{...(perfil ? { perfil } : {})}
			abrirConversa={() => irPara(`#/perfil/${encodeURIComponent(perfilId)}/conversa`)}
			voltar={() => irPara("#/")}
		/>
	);
}

/** Com "reduzir movimento" no Windows, as animações da Motion param de se mover. */
export function App() {
	return (
		<MotionConfig reducedMotion="user">
			<Rotas />
		</MotionConfig>
	);
}

function Rotas() {
	const [hash, setHash] = useState(() => window.location.hash);

	useEffect(() => {
		const mudou = () => setHash(window.location.hash);
		window.addEventListener("hashchange", mudou);
		return () => window.removeEventListener("hashchange", mudou);
	}, []);

	const { perfil, conversa } = rotaDoHash(hash);
	if (!perfil) return <TelaPerfis />;
	const inicial = Object.hasOwn(telasIniciais, perfil) ? telasIniciais[perfil] : undefined;
	if (inicial && !conversa) return <TelaInicial key={perfil} perfilId={perfil} />;
	const voltar = inicial
		? { rotulo: inicial.rotuloVoltar, hash: `#/perfil/${encodeURIComponent(perfil)}` }
		: { rotulo: "Perfis", hash: "#/" };
	// key: outro perfil começa com o estado zerado.
	return <JanelaPerfil key={perfil} perfilId={perfil} voltar={voltar} />;
}
