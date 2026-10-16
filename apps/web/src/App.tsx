// Rotas por hash: "#/" lista os perfis; "#/perfil/<id>" abre a janela do
// perfil (o hash faz o recarregar da página manter o perfil).

import { useEffect, useState } from "react";
import { JanelaPerfil } from "./telas/JanelaPerfil.tsx";
import { TelaPerfis } from "./telas/TelaPerfis.tsx";

function perfilDoHash(hash: string): string | undefined {
	const achado = /^#\/perfil\/([^/]+)$/.exec(hash);
	return achado ? decodeURIComponent(achado[1]!) : undefined;
}

export function App() {
	const [hash, setHash] = useState(() => window.location.hash);

	useEffect(() => {
		const mudou = () => setHash(window.location.hash);
		window.addEventListener("hashchange", mudou);
		return () => window.removeEventListener("hashchange", mudou);
	}, []);

	const perfil = perfilDoHash(hash);
	// key: outro perfil começa com o estado zerado.
	return perfil ? <JanelaPerfil key={perfil} perfilId={perfil} /> : <TelaPerfis />;
}
