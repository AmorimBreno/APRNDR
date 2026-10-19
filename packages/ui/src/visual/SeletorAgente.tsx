// Seletor de agente: o botão da barra do topo abre o menu de agentes
// (MenuSuspenso, no visual do menu do Callout do design system).

import { MenuSuspenso } from "./MenuSuspenso.tsx";

export interface OpcaoAgente {
	nome: string;
	papel: string;
}

export interface PropsSeletorAgente {
	/** Agente da sessão. */
	atual: string;
	/** Agentes selecionáveis do perfil. */
	agentes: OpcaoAgente[];
	trocar(agente: string): void;
	desabilitado?: boolean;
}

export function SeletorAgente(props: PropsSeletorAgente) {
	// O atual sempre aparece, mesmo se o perfil recarregado não o tiver mais.
	const opcoes = props.agentes.some((agente) => agente.nome === props.atual)
		? props.agentes
		: [{ nome: props.atual, papel: "fora do perfil" }, ...props.agentes];
	const papelAtual = opcoes.find((agente) => agente.nome === props.atual)?.papel;
	return (
		<MenuSuspenso
			opcoes={opcoes.map((agente) => ({ id: agente.nome, titulo: agente.nome, detalhe: agente.papel }))}
			atual={props.atual}
			escolher={props.trocar}
			classeBotao="topo__controle"
			rotulo={`Agente: ${props.atual}${papelAtual ? ` (${papelAtual})` : ""}`}
			rotuloMenu="Escolher agente"
			{...(props.desabilitado ? { desabilitado: true } : {})}
			conteudoBotao={
				<>
					<span className="overline">Agente</span>
					<span className="topo__valor data">
						{props.atual}
						{papelAtual ? ` (${papelAtual})` : ""}
					</span>
				</>
			}
		/>
	);
}
