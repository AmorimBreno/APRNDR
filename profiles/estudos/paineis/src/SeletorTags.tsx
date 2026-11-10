// O seletor de tags da lista do painel do caderno: Notas, Materiais e Mapa de
// conteúdo como teclas de papel (o visual das teclas do Teclas.tsx), mas com
// o papel de abas (role="tablist"/"tab"), porque trocar de tag troca o conteúdo
// logo abaixo. O design system não tem um seletor segmentado que sirva, e as
// Teclas são radios de formulário. As setas andam entre as tags e já escolhem
// (como em abas com ativação automática), Home e End vão às pontas, e só a tag
// escolhida entra na ordem do Tab (as outras ficam a uma seta de distância).
// SeletorAbas é o mesmo seletor para qualquer lista de abas (a tela da agenda
// usa); SeletorTags o aplica às tags do caderno.

import { Icon, type IconName, pad2 } from "@estudos/design-system";
import { type KeyboardEvent, useRef } from "react";
import { abaVizinha, TAGS_DO_CADERNO, type TagCaderno } from "./painel-caderno.ts";

/** O id da aba de uma tag; `base` vem de useId() na tela, para a lista de baixo apontar para a aba com aria-labelledby. */
export const idDaAba = (base: string, tag: string) => `${base}-aba-${tag}`;
/** O id da lista de baixo, que as abas controlam (aria-controls). */
export const idDoPainel = (base: string) => `${base}-painel`;

export interface AbaDoSeletor<Id extends string> {
	id: Id;
	nome: string;
	icone: IconName;
}

export interface PropsSeletorAbas<Id extends string> {
	/** O nome do grupo de abas, para o leitor de tela. */
	rotulo: string;
	abas: readonly AbaDoSeletor<Id>[];
	base: string;
	atual: Id;
	/** Quantos itens cada aba tem (sem a chave, ou undefined = ainda não chegou, a contagem some). */
	contagem?: Partial<Record<Id, number | undefined>>;
	escolher(aba: Id): void;
}

/**
 * As abas como teclas de papel, para qualquer lista de abas: o seletor de tags do caderno (SeletorTags) e as abas
 * da tela da agenda (TelaAgenda.tsx) usam este. Mesmas classes, mesmo teclado.
 */
export function SeletorAbas<Id extends string>(props: PropsSeletorAbas<Id>) {
	const botoes = useRef<Partial<Record<Id, HTMLButtonElement | null>>>({});
	const ids = props.abas.map((aba) => aba.id);
	const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, aba: Id) => {
		const vizinha = abaVizinha(ids, aba, evento.key);
		if (!vizinha) return;
		evento.preventDefault();
		botoes.current[vizinha]?.focus();
		props.escolher(vizinha);
	};
	return (
		<div className="painel-caderno__tags" role="tablist" aria-label={props.rotulo}>
			{props.abas.map((aba) => {
				const escolhida = aba.id === props.atual;
				const quantos = props.contagem?.[aba.id];
				return (
					<button
						key={aba.id}
						ref={(elemento) => {
							botoes.current[aba.id] = elemento;
						}}
						type="button"
						role="tab"
						id={idDaAba(props.base, aba.id)}
						aria-selected={escolhida}
						aria-controls={idDoPainel(props.base)}
						tabIndex={escolhida ? 0 : -1}
						className={`painel-caderno__tag${escolhida ? " painel-caderno__tag--escolhida" : ""}`}
						onClick={() => props.escolher(aba.id)}
						onKeyDown={(evento) => aoTeclar(evento, aba.id)}
					>
						<Icon name={aba.icone} size={18} strokeWidth={2.25} />
						<span className="body-sm painel-caderno__tag-nome">{aba.nome}</span>
						{/* Se a lista de abas tem contagem, o lugar dela é reservado mesmo sem o número (visibility, não display): a aba não muda de largura quando ele chega. */}
						{props.contagem === undefined ? null : (
							<span className="data painel-caderno__tag-conta" aria-hidden={quantos === undefined || undefined} style={quantos === undefined ? { visibility: "hidden" } : undefined}>
								{pad2(quantos ?? 0)}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

export interface PropsSeletorTags {
	base: string;
	atual: TagCaderno;
	/** Quantos itens cada tag tem (undefined = ainda não chegou, a contagem some). */
	contagem: Partial<Record<TagCaderno, number | undefined>>;
	escolher(tag: TagCaderno): void;
}

export function SeletorTags(props: PropsSeletorTags) {
	return <SeletorAbas rotulo="Conteúdo do caderno" abas={TAGS_DO_CADERNO} base={props.base} atual={props.atual} contagem={props.contagem} escolher={props.escolher} />;
}
