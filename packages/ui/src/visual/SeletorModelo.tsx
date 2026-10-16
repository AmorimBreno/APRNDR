// Seletor de modelo: um botão com o modelo atual que abre um modal com busca.
// Os modelos do perfil (os dos agentes no profile.json) vêm primeiro; a lista
// completa do OpenRouter tem centenas, então só aparece filtrada pela busca.

import { Icon, Modal, Tag, TextField } from "@estudos/design-system";
import { useMemo, useState } from "react";
import type { InfoModelo } from "../tipos.ts";

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const LIMITE_RESULTADOS = 60;

export interface PropsSeletorModelo {
	/** Modelo da sessão, no formato provedor/id. */
	atual?: string;
	/** Modelos do perfil, mostrados primeiro (sem repetir). */
	doPerfil: string[];
	/** Catálogo completo; vazio enquanto não chegou. */
	modelos: InfoModelo[];
	trocar(modelo: string): void;
	desabilitado?: boolean;
	/** Linha acima do título do modal ("Perfil · Estudos"). */
	legenda?: string;
}

function detalhes(info: InfoModelo | undefined): string {
	if (!info) return "Fora do catálogo";
	const partes = [`Contexto ${compacto.format(info.janelaContexto)} tokens`];
	if (info.raciocinio) partes.push("raciocínio");
	if (info.imagem) partes.push("imagem");
	return partes.join(" · ");
}

function Opcao(props: { nome: string; info?: InfoModelo; atual: boolean; escolher(nome: string): void }) {
	return (
		<li>
			<button
				type="button"
				className={`modelo${props.atual ? " modelo--atual" : ""}`}
				aria-current={props.atual || undefined}
				onClick={() => props.escolher(props.nome)}
			>
				<span className="modelo__texto">
					<span className="body-strong">{props.info?.titulo ?? props.nome}</span>
					<span className="modelo__nome data">{props.nome}</span>
					<span className="modelo__detalhes body-sm">{detalhes(props.info)}</span>
				</span>
				{props.atual ? (
					<Tag tone="amber" size="sm" icon="check">
						Atual
					</Tag>
				) : null}
			</button>
		</li>
	);
}

export function SeletorModelo(props: PropsSeletorModelo) {
	const [aberto, setAberto] = useState(false);
	const [busca, setBusca] = useState("");

	const porNome = useMemo(() => new Map(props.modelos.map((info) => [info.nome, info])), [props.modelos]);
	const doPerfil = useMemo(() => {
		const nomes = props.atual ? [props.atual, ...props.doPerfil] : props.doPerfil;
		return [...new Set(nomes)];
	}, [props.atual, props.doPerfil]);

	const termo = busca.trim().toLowerCase();
	const encontrados = useMemo(() => {
		if (!termo) return [];
		const partes = termo.split(/\s+/);
		return props.modelos.filter((info) => {
			const alvo = `${info.nome} ${info.titulo}`.toLowerCase();
			return partes.every((parte) => alvo.includes(parte));
		});
	}, [props.modelos, termo]);

	const escolher = (nome: string) => {
		setAberto(false);
		setBusca("");
		if (nome !== props.atual) props.trocar(nome);
	};

	return (
		<>
			<button type="button" className="topo__controle" onClick={() => setAberto(true)} disabled={props.desabilitado}>
				<span className="overline">Modelo</span>
				<span className="topo__valor data">{props.atual ?? "Nenhum"}</span>
				<Icon name="chevron-down" size={16} />
			</button>
			<Modal
				open={aberto}
				onClose={() => setAberto(false)}
				title="Escolher modelo"
				{...(props.legenda ? { kicker: props.legenda } : {})}
				size="md"
			>
				<div className="seletor">
					<TextField
						label="Buscar no catálogo"
						placeholder="Nome ou provedor, como claude ou openai/gpt"
						value={busca}
						onChange={(evento) => setBusca(evento.target.value)}
						hint={props.modelos.length ? `${props.modelos.length} modelos no catálogo` : "Carregando o catálogo"}
						autoFocus
					/>
					{termo ? (
						<section aria-label="Resultados da busca">
							<p className="seletor__secao overline">
								{encontrados.length === 0
									? "Nenhum modelo com esse nome"
									: encontrados.length > LIMITE_RESULTADOS
										? `Mostrando ${LIMITE_RESULTADOS} de ${encontrados.length}: refine a busca`
										: `${encontrados.length} encontrados`}
							</p>
							<ul className="seletor__lista">
								{encontrados.slice(0, LIMITE_RESULTADOS).map((info) => (
									<Opcao key={info.nome} nome={info.nome} info={info} atual={info.nome === props.atual} escolher={escolher} />
								))}
							</ul>
						</section>
					) : (
						<section aria-label="Modelos do perfil">
							<p className="seletor__secao overline">Modelos do perfil</p>
							<ul className="seletor__lista">
								{doPerfil.map((nome) => {
									const info = porNome.get(nome);
									return <Opcao key={nome} nome={nome} {...(info ? { info } : {})} atual={nome === props.atual} escolher={escolher} />;
								})}
							</ul>
						</section>
					)}
				</div>
			</Modal>
		</>
	);
}
