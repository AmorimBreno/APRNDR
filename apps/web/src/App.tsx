// Rotas por hash (o recarregar da página mantém a tela). A troca de tela é
// animada por View Transition (movimento.ts, comTransicao).
//
// - "#/": a tela de perfis;
// - "#/perfil/<id>": a tela inicial do perfil, se ele tiver uma (telas-iniciais.ts),
//   ou a janela de conversa;
// - "#/perfil/<id>/conversa": a janela de conversa de um perfil com tela inicial;
// - "#/perfil/<id>/<caminho>": uma subtela da tela inicial (no perfil de
//   estudos, "caderno/<matéria>/<seção>"). O caminho é do perfil; o front só o
//   repassa. A conversa volta para o último caminho aberto.

import { comTransicao, usePerfis } from "@estudos/ui";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { telasIniciais } from "./telas-iniciais.ts";
import { JanelaPerfil } from "./telas/JanelaPerfil.tsx";
import { TelaPerfis } from "./telas/TelaPerfis.tsx";

interface Rota {
	perfil?: string;
	conversa: boolean;
	/** Subtela da tela inicial, sem barras nas pontas ("caderno/calculo/notas"). */
	caminho?: string;
}

export function rotaDoHash(hash: string): Rota {
	const achado = /^#\/perfil\/([^/]+)(?:\/(.+?))?\/?$/.exec(hash);
	if (!achado) return { conversa: false };
	const perfil = decodeURIComponent(achado[1]!);
	const resto = achado[2];
	if (!resto) return { perfil, conversa: false };
	if (resto === "conversa") return { perfil, conversa: true };
	return { perfil, conversa: false, caminho: resto.split("/").map(decodeURIComponent).join("/") };
}

/** O hash da tela inicial do perfil, no caminho dado. */
function hashDoCaminho(perfil: string, caminho = ""): string {
	const partes = caminho.split("/").filter(Boolean).map(encodeURIComponent);
	return `#/perfil/${encodeURIComponent(perfil)}${partes.length ? `/${partes.join("/")}` : ""}`;
}

/** O último caminho aberto de cada perfil (para a conversa voltar até ele). */
const ultimosCaminhos = new Map<string, string>();

function irPara(hash: string): void {
	window.location.hash = hash;
}

function TelaInicial({ perfilId, caminho }: { perfilId: string; caminho: string }) {
	const { lista } = usePerfis();
	const entrada = telasIniciais[perfilId]!;
	const Componente = entrada.componente;
	const perfil = lista?.perfis.find((item) => item.id === perfilId);
	ultimosCaminhos.set(perfilId, caminho);
	return (
		<Componente
			perfilId={perfilId}
			{...(perfil ? { perfil } : {})}
			caminho={caminho}
			navegar={(destino) => irPara(hashDoCaminho(perfilId, destino))}
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
		// A troca de tela acontece numa View Transition: o card do perfil e a folha
		// da tela de cadernos têm o mesmo view-transition-name e se transformam um
		// no outro; o resto troca com um fade (a faixa dos cadernos tem a própria
		// entrada e saída, como bandeira).
		const mudou = () => void comTransicao(() => setHash(window.location.hash));
		window.addEventListener("hashchange", mudou);
		return () => window.removeEventListener("hashchange", mudou);
	}, []);

	const { perfil, conversa, caminho = "" } = rotaDoHash(hash);
	if (!perfil) return <TelaPerfis />;
	const inicial = Object.hasOwn(telasIniciais, perfil) ? telasIniciais[perfil] : undefined;
	// key só pelo perfil: trocar de subtela não remonta a tela inicial (ela guarda a sessão aberta).
	if (inicial && !conversa) return <TelaInicial key={perfil} perfilId={perfil} caminho={caminho} />;
	const ultimo = ultimosCaminhos.get(perfil) ?? "";
	const voltar = inicial
		? { rotulo: (ultimo && inicial.rotuloDoCaminho?.(ultimo)) || inicial.rotuloVoltar, hash: hashDoCaminho(perfil, ultimo) }
		: { rotulo: "Perfis", hash: "#/" };
	// key: outro perfil começa com o estado zerado.
	return <JanelaPerfil key={perfil} perfilId={perfil} voltar={voltar} />;
}
