// Seletor de agente: o botão da barra do topo abre um menu próprio, no visual
// do menu do Callout do design system. O <select> nativo não serve: no Windows
// as opções abrem com o visual do sistema, sem os tokens do tema.
//
// Teclado: Enter, espaço ou seta para baixo abrem; setas, Home e End andam;
// Enter ou espaço escolhem; Esc fecha e volta o foco ao botão; Tab fecha.

import { Icon } from "@estudos/design-system";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

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
	const [aberto, setAberto] = useState(false);
	const raiz = useRef<HTMLDivElement>(null);
	const botao = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const idMenu = useId();

	// O atual sempre aparece, mesmo se o perfil recarregado não o tiver mais.
	const opcoes = props.agentes.some((agente) => agente.nome === props.atual)
		? props.agentes
		: [{ nome: props.atual, papel: "fora do perfil" }, ...props.agentes];
	const papelAtual = opcoes.find((agente) => agente.nome === props.atual)?.papel;

	useEffect(() => {
		if (!aberto) return;
		const itens = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
		const marcado = menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
		(marcado ?? itens?.[0])?.focus();
		const fora = (evento: PointerEvent) => {
			if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false);
		};
		document.addEventListener("pointerdown", fora);
		return () => document.removeEventListener("pointerdown", fora);
	}, [aberto]);

	// Começou a responder (ou perdeu a conexão) com o menu aberto: fecha.
	useEffect(() => {
		if (props.desabilitado) setAberto(false);
	}, [props.desabilitado]);

	const fechar = (devolverFoco: boolean) => {
		setAberto(false);
		if (devolverFoco) botao.current?.focus();
	};

	const escolher = (nome: string) => {
		fechar(true);
		if (nome !== props.atual) props.trocar(nome);
	};

	const teclaNoBotao = (evento: KeyboardEvent<HTMLButtonElement>) => {
		if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
			evento.preventDefault();
			setAberto(true);
		}
	};

	const teclaNoMenu = (evento: KeyboardEvent<HTMLDivElement>) => {
		const itens = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
		const agora = itens.indexOf(document.activeElement as HTMLButtonElement);
		const ir = (indice: number) => itens[(indice + itens.length) % itens.length]?.focus();
		if (evento.key === "ArrowDown") ir(agora + 1);
		else if (evento.key === "ArrowUp") ir(agora - 1);
		else if (evento.key === "Home") ir(0);
		else if (evento.key === "End") ir(itens.length - 1);
		else if (evento.key === "Escape") fechar(true);
		else {
			if (evento.key === "Tab") fechar(false);
			return;
		}
		evento.preventDefault();
	};

	return (
		<div ref={raiz} className="seletor-agente">
			<button
				ref={botao}
				type="button"
				className="topo__controle"
				aria-haspopup="menu"
				aria-expanded={aberto}
				aria-controls={aberto ? idMenu : undefined}
				aria-label={`Agente: ${props.atual}${papelAtual ? ` (${papelAtual})` : ""}`}
				disabled={props.desabilitado}
				onClick={() => setAberto((atual) => !atual)}
				onKeyDown={teclaNoBotao}
			>
				<span className="overline">Agente</span>
				<span className="topo__valor data">
					{props.atual}
					{papelAtual ? ` (${papelAtual})` : ""}
				</span>
				<Icon name="chevron-down" size={16} />
			</button>
			<AnimatePresence>
			{aberto ? (
				<motion.div
					ref={menu}
					initial={{ opacity: 0, scale: 0.9, y: -6 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.1 } }}
					transition={{ type: "spring", stiffness: 560, damping: 26 }}
					style={{ transformOrigin: "0 0" }} id={idMenu} className="menu-agente" role="menu" aria-label="Escolher agente" onKeyDown={teclaNoMenu}
				>
					{opcoes.map((agente) => {
						const marcado = agente.nome === props.atual;
						return (
							<button
								key={agente.nome}
								type="button"
								role="menuitemradio"
								aria-checked={marcado}
								tabIndex={-1}
								className={`menu-agente__item${marcado ? " menu-agente__item--atual" : ""}`}
								onClick={() => escolher(agente.nome)}
							>
								<span className="menu-agente__texto">
									<span className="body-strong">{agente.nome}</span>
									<span className="menu-agente__papel overline">{agente.papel}</span>
								</span>
								{marcado ? <Icon name="check" size={18} strokeWidth={2.5} /> : null}
							</button>
						);
					})}
				</motion.div>
			) : null}
			</AnimatePresence>
		</div>
	);
}
