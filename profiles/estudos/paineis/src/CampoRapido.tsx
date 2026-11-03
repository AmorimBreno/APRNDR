// O campo de uma linha que cria alguma coisa na hora (docs/agenda.md): o
// "Adicionar tarefa…" do topo da lista, o "+ Adicionar" no pé de cada coluna do
// quadro e o "+ Nova coluna". Enter manda o texto (aparado) para `criar`, que é
// uma ação da ponte: enquanto espera a resposta o campo só não aceita digitar
// (não perde o foco, para dar para seguir escrevendo o próximo); se der certo, o
// texto some e o campo continua pronto; se der erro, o texto fica e a frase do
// erro aparece embaixo do campo. Esc limpa e chama `aoSair`; sair do campo vazio
// também.

import { type IconName, TextField } from "@estudos/design-system";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

export interface PropsCampoRapido {
	/** O exemplo do campo ("Adicionar tarefa…"). */
	placeholder: string;
	/** O nome do campo para o leitor de tela. */
	rotulo: string;
	/** Confere antes de mandar: a frase do erro, ou undefined se vale. */
	validar?(texto: string): string | undefined;
	/** Cria com o texto aparado. Rejeita com um Error cuja mensagem já está em português. */
	criar(texto: string): Promise<unknown>;
	/** Esc, ou sair do campo vazio (quem abriu o campo o fecha). */
	aoSair?(): void;
	/** O foco vai para o campo quando ele aparece. */
	autoFoco?: boolean;
	icon?: IconName;
	maxLength?: number;
	className?: string;
}

/** A frase de um erro da ponte, ou uma frase geral. */
const frase = (falha: unknown) => (falha instanceof Error && falha.message ? falha.message : "Não consegui salvar. Tente de novo.");

export function CampoRapido(props: PropsCampoRapido) {
	const [texto, setTexto] = useState("");
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [ocupado, setOcupado] = useState(false);
	const campo = useRef<HTMLInputElement>(null);
	const vivo = useRef(true);
	useEffect(() => {
		vivo.current = true;
		if (props.autoFoco) campo.current?.focus();
		return () => {
			vivo.current = false;
		};
	}, [props.autoFoco]);

	const enviar = async () => {
		if (ocupado) return;
		const aparado = texto.trim();
		const problema = props.validar?.(aparado);
		if (problema) {
			setErro(problema);
			return;
		}
		setOcupado(true);
		setErro(undefined);
		try {
			await props.criar(aparado);
			if (!vivo.current) return;
			setTexto("");
		} catch (falha) {
			if (vivo.current) setErro(frase(falha));
		} finally {
			if (vivo.current) {
				setOcupado(false);
				campo.current?.focus();
			}
		}
	};

	const tecla = (evento: KeyboardEvent<HTMLInputElement>) => {
		if (evento.key === "Enter") {
			evento.preventDefault();
			void enviar();
		} else if (evento.key === "Escape") {
			evento.preventDefault();
			evento.stopPropagation();
			setTexto("");
			setErro(undefined);
			props.aoSair?.();
		}
	};

	return (
		<div className={`campo-rapido${props.className ? ` ${props.className}` : ""}`}>
			<TextField
				ref={campo}
				value={texto}
				placeholder={props.placeholder}
				aria-label={props.rotulo}
				autoComplete="off"
				readOnly={ocupado}
				{...(props.icon ? { icon: props.icon } : {})}
				{...(props.maxLength ? { maxLength: props.maxLength } : {})}
				{...(erro ? { error: erro } : {})}
				onChange={(evento) => {
					setTexto(evento.target.value);
					if (erro) setErro(undefined);
				}}
				onKeyDown={tecla}
				onBlur={() => {
					if (!texto.trim() && !ocupado) props.aoSair?.();
				}}
			/>
			{erro ? (
				<span role="alert" className="ap-visually-hidden">
					{erro}
				</span>
			) : null}
		</div>
	);
}
