// O cabeçalho de uma coluna do quadro (QuadroTarefas.tsx): o nome (duplo clique
// renomeia no lugar; o menu também tem "Renomear"), a marca da coluna de feito (um
// check), a contagem e o menu "…" com as ações da coluna (acoesDaColuna,
// quadro-tarefas.ts). Renomear: Enter ou sair do campo salva, Esc desiste; se a
// extensão recusar (nome repetido, por exemplo), a frase aparece embaixo e o campo
// continua aberto.

import { Icon } from "@estudos/design-system";
import { MenuSuspenso } from "@estudos/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type Coluna, LIMITE_NOME_COLUNA } from "../../lib/agenda-tipos.ts";
import { erroDoNomeDeColuna, nomeDeColunaAparado } from "./lista-tarefas.ts";
import type { AcaoDaColuna, OpcaoDaColuna } from "./quadro-tarefas.ts";

export interface PropsCabecalhoColuna {
	coluna: Coluna;
	/** Quantas tarefas a tela mostra nela. */
	visiveis: number;
	/** Quantas ela tem no quadro inteiro (mais que `visiveis` com o filtro de matéria). */
	total: number;
	opcoes: OpcaoDaColuna[];
	renomeando: boolean;
	/** Começa a renomear (o duplo clique). */
	iniciarRenomear(): void;
	/** Desistiu ou terminou de renomear. */
	fecharRenomear(): void;
	/** Manda o nome novo; rejeita com a frase do erro. */
	renomear(nome: string): Promise<unknown>;
	escolher(acao: AcaoDaColuna): void;
}

export function CabecalhoColuna(props: PropsCabecalhoColuna) {
	const { coluna } = props;
	const contagem = props.visiveis === props.total ? `${props.total}` : `${props.visiveis}/${props.total}`;
	const falada = props.visiveis === props.total ? `${props.total} ${props.total === 1 ? "tarefa" : "tarefas"}` : `${props.visiveis} de ${props.total} tarefas`;
	return (
		<header className="quadro-coluna__cabeca">
			<div className="quadro-coluna__titulo">
				{props.renomeando ? (
					<NomeEditavel nome={coluna.nome} renomear={props.renomear} fechar={props.fecharRenomear} />
				) : (
					<h3 className="heading quadro-coluna__nome" onDoubleClick={props.iniciarRenomear} title="Duplo clique para renomear">
						{coluna.nome}
					</h3>
				)}
				{coluna.feito ? (
					<span className="quadro-coluna__feito" title="Coluna de feito: o que cai aqui fica concluído">
						<Icon name="check" size={16} strokeWidth={2.5} label="Coluna de feito" />
					</span>
				) : null}
			</div>
			<span className="data quadro-coluna__contagem" aria-label={falada}>
				{contagem}
			</span>
			<MenuSuspenso
				className="quadro-coluna__menu"
				classeBotao="quadro-coluna__menu-botao"
				opcoes={props.opcoes.map((opcao) => ({ id: opcao.id, titulo: opcao.titulo }))}
				atual=""
				escolher={(id) => props.escolher(id as AcaoDaColuna)}
				conteudoBotao={<span className="quadro-coluna__pontos" aria-hidden="true" />}
				rotulo={`Ações da coluna ${coluna.nome}`}
				rotuloMenu="Ações da coluna"
			/>
		</header>
	);
}

/** O nome vira campo: Enter ou sair salva (se mudou), Esc desiste; um erro da extensão fica embaixo e o campo não fecha. */
function NomeEditavel(props: { nome: string; renomear(nome: string): Promise<unknown>; fechar(): void }) {
	const [texto, setTexto] = useState(props.nome);
	const [erro, setErro] = useState<string | undefined>(undefined);
	const campo = useRef<HTMLInputElement>(null);
	// Já terminou (Enter, Esc ou sair): o blur que vem quando o campo some não salva de novo.
	const terminou = useRef(false);
	const ocupado = useRef(false);
	useEffect(() => {
		campo.current?.focus();
		campo.current?.select();
	}, []);

	const salvar = async (refocar: boolean) => {
		if (terminou.current || ocupado.current) return;
		const nome = nomeDeColunaAparado(texto);
		if (nome === props.nome) {
			terminou.current = true;
			props.fechar();
			return;
		}
		const problema = erroDoNomeDeColuna(nome);
		if (problema) {
			setErro(problema);
			if (refocar) campo.current?.focus();
			return;
		}
		ocupado.current = true;
		try {
			await props.renomear(nome);
			terminou.current = true;
			props.fechar();
		} catch (falha) {
			setErro(falha instanceof Error && falha.message ? falha.message : "Não consegui renomear a coluna.");
			if (refocar) campo.current?.focus();
		} finally {
			ocupado.current = false;
		}
	};
	const tecla = (evento: KeyboardEvent<HTMLInputElement>) => {
		if (evento.key === "Enter") {
			evento.preventDefault();
			void salvar(true);
		} else if (evento.key === "Escape") {
			evento.preventDefault();
			evento.stopPropagation();
			terminou.current = true;
			props.fechar();
		}
	};
	return (
		<div className="quadro-coluna__renomear">
			<input
				ref={campo}
				type="text"
				className="heading quadro-coluna__campo"
				value={texto}
				maxLength={LIMITE_NOME_COLUNA + 20}
				aria-label={`Novo nome da coluna ${props.nome}`}
				aria-invalid={erro ? true : undefined}
				onChange={(evento) => {
					setTexto(evento.target.value);
					if (erro) setErro(undefined);
				}}
				onBlur={() => {
					// Saiu do campo com um erro já à mostra: desiste, para não prender o foco.
					if (erro) {
						terminou.current = true;
						props.fechar();
					} else void salvar(false);
				}}
				onKeyDown={tecla}
			/>
			{erro ? (
				<p className="body-sm quadro-coluna__erro" role="alert">
					<Icon name="alert" size={14} strokeWidth={2.5} />
					<span>{erro}</span>
				</p>
			) : null}
		</div>
	);
}
