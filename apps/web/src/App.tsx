// Página mínima que só prova que o front fala com o servidor pelo proxy do Vite.
// A tela provisória de verdade é a tarefa 2.5.

import { useEffect, useState } from "react";

interface Saude {
	ok: boolean;
	versao: string;
}

interface ResumoPerfil {
	id: string;
	nome: string;
}

export function App() {
	const [saude, setSaude] = useState<Saude | string>("carregando...");
	const [perfis, setPerfis] = useState<ResumoPerfil[] | string>("carregando...");

	useEffect(() => {
		fetch("/api/saude")
			.then((resposta) => resposta.json() as Promise<Saude>)
			.then(setSaude, (erro: Error) => setSaude(`erro: ${erro.message}`));
		fetch("/api/perfis")
			.then((resposta) => resposta.json() as Promise<ResumoPerfil[]>)
			.then(setPerfis, (erro: Error) => setPerfis(`erro: ${erro.message}`));
	}, []);

	return (
		<main>
			<h1>estudos-app</h1>
			<p>Saúde: {typeof saude === "string" ? saude : JSON.stringify(saude)}</p>
			<p>Perfis:</p>
			{typeof perfis === "string" ? (
				<p>{perfis}</p>
			) : (
				<ul>
					{perfis.map((perfil) => (
						<li key={perfil.id}>{perfil.nome}</li>
					))}
				</ul>
			)}
		</main>
	);
}
