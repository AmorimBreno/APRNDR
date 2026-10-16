// Tela enquanto a sessão do perfil é montada: a faixa da marca com o caminho
// de volta e um painel com a etapa atual, os avisos de conexão e os erros.

import { Button } from "@estudos/design-system";
import type { ErroJanela } from "@estudos/ui";
import { FaixaMarca } from "./FaixaMarca.tsx";

const nomesOrigem: Record<ErroJanela["origem"], string> = {
	modelo: "Erro do modelo",
	extensao: "Erro de extensão",
	nucleo: "Erro do núcleo",
	servidor: "Erro do servidor",
	pedido: "Erro no pedido",
};

export interface PropsTelaCarregando {
	nomePerfil: string;
	/** O que o núcleo está fazendo agora (estado.carregando). */
	etapa?: string;
	/** Aviso de conexão com o servidor, se ela não estiver aberta. */
	aviso?: string;
	erros: ErroJanela[];
	limparErros(): void;
}

export function TelaCarregando({ nomePerfil, etapa, aviso, erros, limparErros }: PropsTelaCarregando) {
	return (
		<div className="tela">
			<FaixaMarca legenda="Abrindo o perfil" glifo="始">
				<Button icon="list" onClick={() => (window.location.hash = "#/")}>
					Perfis
				</Button>
			</FaixaMarca>
			<main className="painel-carregando" aria-busy="true">
				<span className="overline">Perfil</span>
				<h1 className="display-lg">{nomePerfil}</h1>
				<p className="painel-carregando__etapa body-lg" role="status">
					{aviso ?? etapa ?? "Montando a sessão"}
					<span className="ap-cursor" aria-hidden="true" />
				</p>
				{erros.length > 0 ? (
					<div className="aviso-erro" role="alert">
						{erros.map((erro) => (
							<div key={erro.chave}>
								<span className="overline">{nomesOrigem[erro.origem]}</span>
								<p className="body">{erro.mensagem}</p>
							</div>
						))}
						<div>
							<Button size="sm" variant="ghost" onClick={limparErros}>
								Limpar erros
							</Button>
						</div>
					</div>
				) : null}
			</main>
		</div>
	);
}
