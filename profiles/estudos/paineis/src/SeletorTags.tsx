// O seletor de tags da lista do painel do caderno: Notas, Materiais e Mapa de
// conteúdo como teclas de papel (o visual das teclas do Teclas.tsx), mas com
// o papel de abas (role="tablist"/"tab"), porque trocar de tag troca o conteúdo
// logo abaixo. O design system não tem um seletor segmentado que sirva, e as
// Teclas são radios de formulário. As setas andam entre as tags e já escolhem
// (como em abas com ativação automática), Home e End vão às pontas, e só a tag
// escolhida entra na ordem do Tab (as outras ficam a uma seta de distância).

import { Icon, pad2 } from "@estudos/design-system";
import { type KeyboardEvent, useRef } from "react";
import { TAGS_DO_CADERNO, type TagCaderno, tagVizinha } from "./painel-caderno.ts";

/** O id da aba de uma tag; `base` vem de useId() na tela, para a lista de baixo apontar para a aba com aria-labelledby. */
export const idDaAba = (base: string, tag: TagCaderno) => `${base}-aba-${tag}`;
/** O id da lista de baixo, que as abas controlam (aria-controls). */
export const idDoPainel = (base: string) => `${base}-painel`;

export interface PropsSeletorTags {
	base: string;
	atual: TagCaderno;
	/** Quantos itens cada tag tem (undefined = ainda não chegou, a contagem some). */
	contagem: Partial<Record<TagCaderno, number | undefined>>;
	escolher(tag: TagCaderno): void;
}

export function SeletorTags(props: PropsSeletorTags) {
	const abas = useRef<Partial<Record<TagCaderno, HTMLButtonElement | null>>>({});
	const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, tag: TagCaderno) => {
		const vizinha = tagVizinha(tag, evento.key);
		if (!vizinha) return;
		evento.preventDefault();
		abas.current[vizinha]?.focus();
		props.escolher(vizinha);
	};
	return (
		<div className="painel-caderno__tags" role="tablist" aria-label="Conteúdo do caderno">
			{TAGS_DO_CADERNO.map((tag) => {
				const escolhida = tag.id === props.atual;
				const quantos = props.contagem[tag.id];
				return (
					<button
						key={tag.id}
						ref={(elemento) => {
							abas.current[tag.id] = elemento;
						}}
						type="button"
						role="tab"
						id={idDaAba(props.base, tag.id)}
						aria-selected={escolhida}
						aria-controls={idDoPainel(props.base)}
						tabIndex={escolhida ? 0 : -1}
						className={`painel-caderno__tag${escolhida ? " painel-caderno__tag--escolhida" : ""}`}
						onClick={() => props.escolher(tag.id)}
						onKeyDown={(evento) => aoTeclar(evento, tag.id)}
					>
						<Icon name={tag.icone} size={18} strokeWidth={2.25} />
						<span className="body-sm painel-caderno__tag-nome">{tag.nome}</span>
						{quantos === undefined ? null : <span className="data painel-caderno__tag-conta">{pad2(quantos)}</span>}
					</button>
				);
			})}
		</div>
	);
}
