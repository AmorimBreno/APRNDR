// Menu suspenso de escolha única: um botão que abre um menu próprio, no visual
// do menu do Callout do design system. O <select> nativo não serve: no Windows
// as opções abrem com o visual do sistema, sem os tokens do tema. Usado pelo
// seletor de agente e pelo filtro do histórico.
//
// Teclado: Enter, espaço ou seta para baixo abrem; setas, Home e End andam;
// Enter ou espaço escolhem; Esc fecha e volta o foco ao botão; Tab fecha.

import { Icon } from "@estudos/design-system";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

export interface OpcaoMenu {
	id: string;
	titulo: ReactNode;
	/** Linha pequena embaixo (o papel do agente, quantas conversas). */
	detalhe?: ReactNode;
}

export interface PropsMenuSuspenso {
	opcoes: OpcaoMenu[];
	/** id da opção marcada. */
	atual: string;
	escolher(id: string): void;
	/** O que vai dentro do botão (o ícone de abrir vem junto). */
	conteudoBotao: ReactNode;
	classeBotao: string;
	/** Nome acessível do botão. */
	rotulo: string;
	/** Nome acessível do menu. */
	rotuloMenu: string;
	desabilitado?: boolean;
	/** Classe a mais no contêiner (posição do menu). */
	className?: string;
}

export function MenuSuspenso(props: PropsMenuSuspenso) {
	const [aberto, setAberto] = useState(false);
	const raiz = useRef<HTMLDivElement>(null);
	const botao = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const idMenu = useId();

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

	// Ficou desabilitado (começou a responder, perdeu a conexão) com o menu aberto: fecha.
	useEffect(() => {
		if (props.desabilitado) setAberto(false);
	}, [props.desabilitado]);

	const fechar = (devolverFoco: boolean) => {
		setAberto(false);
		if (devolverFoco) botao.current?.focus();
	};

	const escolher = (id: string) => {
		fechar(true);
		if (id !== props.atual) props.escolher(id);
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
		<div ref={raiz} className={`seletor-agente${props.className ? ` ${props.className}` : ""}`}>
			<button
				ref={botao}
				type="button"
				className={props.classeBotao}
				aria-haspopup="menu"
				aria-expanded={aberto}
				aria-controls={aberto ? idMenu : undefined}
				aria-label={props.rotulo}
				disabled={props.desabilitado}
				onClick={() => setAberto((atual) => !atual)}
				onKeyDown={teclaNoBotao}
			>
				{props.conteudoBotao}
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
						style={{ transformOrigin: "0 0" }}
						id={idMenu}
						className="menu-agente"
						role="menu"
						aria-label={props.rotuloMenu}
						onKeyDown={teclaNoMenu}
					>
						{props.opcoes.map((opcao) => {
							const marcado = opcao.id === props.atual;
							return (
								<button
									key={opcao.id}
									type="button"
									role="menuitemradio"
									aria-checked={marcado}
									tabIndex={-1}
									className={`menu-agente__item${marcado ? " menu-agente__item--atual" : ""}`}
									onClick={() => escolher(opcao.id)}
								>
									<span className="menu-agente__texto">
										<span className="body-strong">{opcao.titulo}</span>
										{opcao.detalhe != null ? <span className="menu-agente__papel overline">{opcao.detalhe}</span> : null}
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
