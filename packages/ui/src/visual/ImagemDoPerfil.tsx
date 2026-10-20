// Imagens da pasta de dados do perfil, pela rota /api/perfis/<id>/imagens/ do
// servidor. A janela do perfil diz de que perfil é (ProvedorImagens); quem
// mostra (o embed do Markdown, um painel de perfil) só passa o nome ou o
// caminho relativo à pasta de dados. Sem provedor, a imagem não tem de onde
// vir e aparece como texto.

import { createContext, useContext, useState, type ReactNode } from "react";

const ContextoImagens = createContext<string | null>(null);

/** Dá às imagens de dentro o perfil de onde elas vêm. */
export function ProvedorImagens({ perfilId, children }: { perfilId: string; children: ReactNode }) {
	return <ContextoImagens.Provider value={perfilId}>{children}</ContextoImagens.Provider>;
}

/** Endereço de uma imagem do perfil: nome solto ou caminho relativo à pasta de dados, com barras normais. */
export function urlDaImagem(perfilId: string, caminho: string): string {
	return `/api/perfis/${encodeURIComponent(perfilId)}/imagens/${caminho.split("/").map(encodeURIComponent).join("/")}`;
}

/** O embed como foi escrito, para quando a imagem não pode aparecer. */
export function textoDoEmbed(caminho: string, largura?: number, altura?: number): string {
	return `![[${caminho}${largura ? `|${largura}${altura ? `x${altura}` : ""}` : ""}]]`;
}

/** `alturaMaxima`: um tamanho CSS ("40vh") para a imagem caber num lugar baixo, como um modal; a largura acompanha. */
export function ImagemDoPerfil({ caminho, largura, altura, alturaMaxima }: { caminho: string; largura?: number; altura?: number; alturaMaxima?: string }) {
	const perfilId = useContext(ContextoImagens);
	const [falhou, setFalhou] = useState<string | null>(null);
	if (!perfilId) return <>{textoDoEmbed(caminho, largura, altura)}</>;
	const url = urlDaImagem(perfilId, caminho);
	if (falhou === url) return <span className="imagem-perfil imagem-perfil--falta body-sm">Imagem não encontrada: {caminho}</span>;
	return (
		<span className="imagem-perfil">
			<img
				src={url}
				alt={caminho}
				width={largura}
				height={altura}
				loading="lazy"
				onError={() => setFalhou(url)}
				{...(alturaMaxima ? { style: { maxHeight: alturaMaxima, width: "auto" } } : {})}
			/>
		</span>
	);
}
