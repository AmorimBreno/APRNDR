// PROVISÓRIO: tela inicial crua (lista de perfis). Será trocada no redesenho.

import { usePerfis } from "@estudos/ui";

export function TelaPerfis() {
	const { lista, erro, carregando, recarregar } = usePerfis();

	return (
		<main>
			<h1>estudos-app</h1>
			<h2>Perfis</h2>
			{carregando && !lista ? <p>Carregando perfis…</p> : null}
			{erro ? (
				<p>
					Não consegui ler os perfis: {erro}{" "}
					<button type="button" onClick={recarregar}>
						Tentar de novo
					</button>
				</p>
			) : null}
			{lista ? (
				<>
					{lista.perfis.length === 0 ? <p>Nenhum perfil válido em profiles/.</p> : null}
					<ul>
						{lista.perfis.map((perfil) => (
							<li key={perfil.id}>
								<a href={`#/perfil/${encodeURIComponent(perfil.id)}`}>{perfil.nome}</a>
								{perfil.aberto ? " (aberto)" : ""}
							</li>
						))}
					</ul>
					{lista.erros.length > 0 ? (
						<>
							<h3>Perfis inválidos</h3>
							<ul>
								{lista.erros.map((invalido) => (
									<li key={invalido.arquivo}>
										{invalido.arquivo}: <span style={{ whiteSpace: "pre-wrap" }}>{invalido.mensagem}</span>
									</li>
								))}
							</ul>
						</>
					) : null}
				</>
			) : null}
		</main>
	);
}
