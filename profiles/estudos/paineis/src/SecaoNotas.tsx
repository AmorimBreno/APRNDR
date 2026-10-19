// A seção Notas do caderno (item 4.3, parte B): as notas da matéria, da mexida
// mais recente para a mais antiga, e "Nova nota", que pede o título, cria a
// nota pela extensão de notas e abre o editor nela. Clicar numa nota abre o
// editor (EditorNota) no caminho caderno/<matéria>/notas/<título>.

import { Button, EmptyState, Icon, type Tone, TextField } from "@estudos/design-system";
import { type JanelaPerfilHook, semEsperar } from "@estudos/ui";
import { motion } from "motion/react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { conferirTitulo, type ListaNotas, TAMANHO_TITULO } from "../../lib/nota-tipos.ts";
import { mesmoTitulo, PAINEL_NOTAS, ultimaLista, useNovasRespostas } from "./notas-ponte.ts";

const diaMesHora = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "agora há pouco", "há 5 min", "há 3 h", "ontem" ou a data. */
export function editadaHa(iso: string, agora: Date = new Date()): string {
	const minutos = Math.round((agora.getTime() - new Date(iso).getTime()) / 60_000);
	if (minutos < 1) return "agora há pouco";
	if (minutos < 60) return `há ${minutos} min`;
	if (minutos < 24 * 60) return `há ${Math.round(minutos / 60)} h`;
	if (minutos < 48 * 60) return "ontem";
	return diaMesHora.format(new Date(iso)).replace(".", "");
}

/**
 * As notas da matéria (a seção e o índice do caderno usam), pedidas à
 * extensão quando a sessão abre e de novo quando `vez` muda (o caderno passa
 * a tela aberta: voltar do editor para a lista traz as prévias novas).
 */
export function useListaNotas(janela: JanelaPerfilHook, materiaId: string, vez?: string): ListaNotas | undefined {
	const { estado, acoes } = janela;
	const sessaoId = estado.sessao?.sessaoId;
	useEffect(() => {
		if (sessaoId) semEsperar(acoes.acaoDaInterface(PAINEL_NOTAS, "listar", { materia: materiaId }));
	}, [sessaoId, acoes, materiaId, vez]);
	const recebidas = estado.acoesPorPainel[PAINEL_NOTAS];
	return useMemo(() => ultimaLista(recebidas ?? [], materiaId), [recebidas, materiaId]);
}

export interface PropsSecaoNotas {
	janela: JanelaPerfilHook;
	materiaId: string;
	lista?: ListaNotas;
	/** Cor da capa, para o bloco do ideograma do caderno vazio. */
	tom: Tone;
	abrirNota(titulo: string): void;
}

export function SecaoNotas(props: PropsSecaoNotas) {
	const { janela, materiaId, lista } = props;
	const [criando, setCriando] = useState(false);
	const [titulo, setTitulo] = useState("");
	const [erro, setErro] = useState<string | undefined>(undefined);
	/** O título mandado para criar, esperando a resposta. */
	const [esperando, setEsperando] = useState<string | undefined>(undefined);

	useNovasRespostas(janela.estado.acoesPorPainel[PAINEL_NOTAS], (resposta) => {
		if (!esperando) return;
		if (resposta.acao === "criada" && resposta.dados.materia === materiaId && mesmoTitulo(resposta.dados.titulo, esperando)) {
			setEsperando(undefined);
			props.abrirNota(resposta.dados.titulo);
		} else if (resposta.acao === "erro" && resposta.dados.ao === "criar" && resposta.dados.materia === materiaId) {
			setEsperando(undefined);
			setErro(resposta.dados.mensagem);
		}
	});

	const criar = (evento: FormEvent) => {
		evento.preventDefault();
		const conferido = conferirTitulo(titulo);
		if ("erro" in conferido) return setErro(conferido.erro);
		if (lista?.notas.some((nota) => mesmoTitulo(nota.titulo, conferido.titulo))) return setErro(`Já existe uma nota "${conferido.titulo}" neste caderno.`);
		setErro(undefined);
		setEsperando(conferido.titulo);
		janela.acoes.acaoDaInterface(PAINEL_NOTAS, "criar", { materia: materiaId, titulo: conferido.titulo }).catch((falha: unknown) => {
			setEsperando(undefined);
			setErro(`Não consegui criar a nota: ${(falha as Error).message}`);
		});
	};

	const formulario = criando ? (
		<form className="notas__nova" onSubmit={criar}>
			<TextField
				label="Título da nota"
				value={titulo}
				onChange={(evento) => setTitulo(evento.target.value)}
				maxLength={TAMANHO_TITULO}
				placeholder="Limites laterais"
				hint="Vira o nome do arquivo em notas/."
				{...(erro ? { error: erro } : {})}
				autoFocus
				disabled={Boolean(esperando)}
			/>
			<div className="notas__nova-botoes">
				<Button
					type="button"
					variant="ghost"
					onClick={() => {
						setCriando(false);
						setTitulo("");
						setErro(undefined);
					}}
					disabled={Boolean(esperando)}
				>
					Cancelar
				</Button>
				<Button type="submit" variant="primary" icon="plus" disabled={Boolean(esperando)} aria-busy={Boolean(esperando)}>
					{esperando ? "Criando…" : "Criar e abrir"}
				</Button>
			</div>
		</form>
	) : null;

	if (!lista) return <p className="body caderno__carregando">Abrindo as notas…</p>;

	if (lista.notas.length === 0 && !criando) {
		return (
			<EmptyState
				glyph="書"
				tone={props.tom}
				title="Nenhuma nota ainda"
				action={
					<Button variant="primary" icon="plus" onClick={() => setCriando(true)}>
						Nova nota
					</Button>
				}
			>
				Suas anotações em markdown: títulos, listas, tarefas, citações e código. Cada nota é um arquivo em notas/ que abre fora do app. Só você escreve nelas;
				o professor pode lê-las na conversa do caderno.
			</EmptyState>
		);
	}

	return (
		<div className="notas">
			{formulario ?? (
				<div className="notas__topo">
					<Button variant="primary" icon="plus" onClick={() => setCriando(true)}>
						Nova nota
					</Button>
				</div>
			)}
			<ul className="notas__lista">
				{lista.notas.map((nota, indice) => (
					<motion.li
						key={nota.titulo}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ type: "spring", stiffness: 420, damping: 32, delay: Math.min(indice, 10) * 0.03 }}
					>
						<button type="button" className="notas__item" onClick={() => props.abrirNota(nota.titulo)}>
							<Icon name="file" size={20} strokeWidth={2.25} />
							<span className="notas__texto">
								<span className="body-strong notas__titulo">{nota.titulo}</span>
								<span className="body-sm notas__previa">{nota.previa || "Nota vazia"}</span>
							</span>
							<span className="data notas__quando">{editadaHa(nota.modificadaEm)}</span>
						</button>
					</motion.li>
				))}
			</ul>
		</div>
	);
}
