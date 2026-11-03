// A aba Quadro da tela da agenda (docs/agenda.md): o kanban. Uma coluna por coluna
// do quadro do Breno, lado a lado (cerca de 296 px cada; o quadro rola na
// horizontal quando não cabem), com a de feito marcada por um check. Cada coluna:
// - o cabeçalho (CabecalhoColuna.tsx): nome (duplo clique renomeia), contagem e o
//   menu "…" com Renomear, Marcar como feito, Mover para a esquerda e para a direita
//   e Apagar (ModalApagarColuna.tsx);
// - os cartões (CartaoTarefa.tsx) das tarefas que o filtro de matéria deixa ver;
// - "+ Adicionar", que abre um campo no pé da coluna (Enter cria a tarefa ali).
// No fim, uma coluna fantasma "+ Nova coluna".
//
// Mover cartões: arrastar com o mouse (useArrastoQuadro.ts; a linha âmbar mostra
// onde vai cair), Alt+setas com o foco no cartão ou o menu "Mover para…" do cartão.
// Tudo vira `moverTarefa(id, coluna, posicao)` com a posição do quadro inteiro
// (posicaoDeSoltar, quadro-tarefas.ts), também com o filtro de matéria ligado. O
// mover é otimista (agenda-ponte.ts): o cartão já aparece no lugar novo e volta
// sozinho se a extensão recusar, com o aviso na casca. Os erros das ações de
// coluna (criar, renomear, marcar feito, apagar) aparecem num aviso no topo do
// quadro; o campo de criar mostra o dele embaixo. Um texto escondido anuncia ao
// leitor de tela onde o cartão foi parar.
//
// Props (PropsAbaAgenda, agenda-tela.ts): agenda, materias, materia (o filtro),
// hoje, acoes (a ponte) e abrirTarefa (o ModalTarefa da casca).

import { Button, Icon } from "@estudos/design-system";
import { type CSSProperties, type PointerEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Coluna, Tarefa } from "../../lib/agenda-tipos.ts";
import type { PropsAbaAgenda } from "./agenda-tela.ts";
import { CabecalhoColuna } from "./CabecalhoColuna.tsx";
import { CampoRapido } from "./CampoRapido.tsx";
import { classeDoTom, tomDaMateria } from "./calendario-tela.ts";
import { CartaoTarefa, ConteudoDoCartao } from "./CartaoTarefa.tsx";
import { criacaoRapida, erroDoNomeDeColuna } from "./lista-tarefas.ts";
import { ModalApagarColuna } from "./ModalApagarColuna.tsx";
import {
	type AcaoDaColuna,
	acoesDaColuna,
	avisoDeMover,
	type ColunaDoQuadro,
	colunasDoQuadro,
	type DirecaoDoCartao,
	destinoDoTeclado,
	idsComColunaMovida,
	mudaAoMover,
	posicaoDeSoltar,
} from "./quadro-tarefas.ts";
import { type AlvoDoArrasto, type EstadoDoArrasto, useArrastoQuadro } from "./useArrastoQuadro.ts";

/** Uma posição maior que qualquer coluna: a extensão põe no fim. */
const NO_FIM = Number.MAX_SAFE_INTEGER;

/** A frase de um erro da ponte, ou uma frase geral. */
const frase = (falha: unknown) => (falha instanceof Error && falha.message ? falha.message : "Não consegui fazer isso. Tente de novo.");

export function QuadroTarefas(props: PropsAbaAgenda) {
	const { agenda, materias, materia, hoje, acoes } = props;
	const quadro = useRef<HTMLDivElement>(null);
	const idDaAjuda = useId();
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [aviso, setAviso] = useState("");
	const [renomeando, setRenomeando] = useState<string | undefined>(undefined);
	const [adicionandoEm, setAdicionandoEm] = useState<string | undefined>(undefined);
	const [criandoColuna, setCriandoColuna] = useState(false);
	const [apagando, setApagando] = useState<string | undefined>(undefined);
	// O cartão que movemos pelo teclado muda de lista e remonta: o foco volta para ele depois de desenhar.
	const focoPendente = useRef<string | undefined>(undefined);

	const colunas = useMemo(() => colunasDoQuadro(agenda, materia), [agenda, materia]);
	const opcoesDasColunas = useMemo(() => agenda.colunas.map((coluna) => ({ id: coluna.id, nome: coluna.nome })), [agenda.colunas]);

	useLayoutEffect(() => {
		const id = focoPendente.current;
		if (!id) return;
		focoPendente.current = undefined;
		quadro.current?.querySelector<HTMLElement>(`[data-cartao="${CSS.escape(id)}"] .quadro-cartao`)?.focus();
	}, [agenda]);

	/** Move pela ponte, sem avisar de erro aqui: a casca mostra o do mover. Soltar no mesmo lugar não manda nada. */
	const mover = (id: string, coluna: string, posicao?: number) => {
		if (!mudaAoMover(agenda, id, coluna, posicao ?? NO_FIM)) return false;
		setAviso(avisoDeMover(agenda, id, coluna, posicao ?? NO_FIM) ?? "");
		acoes.moverTarefa(id, coluna, posicao).catch(() => {});
		return true;
	};
	const soltar = (id: string, alvo: AlvoDoArrasto) => mover(id, alvo.coluna, posicaoDeSoltar(agenda, id, alvo.coluna, alvo.indice, materia));
	const moverComTeclado = (id: string, direcao: DirecaoDoCartao) => {
		const destino = destinoDoTeclado(agenda, id, direcao, materia);
		if (!destino) return;
		if (mover(id, destino.coluna, destino.posicao)) focoPendente.current = id;
	};

	const { arrasto, iniciar, cliqueDoArrasto } = useArrastoQuadro({ quadro, soltar });

	/** Roda uma ação de coluna; o erro vai para o aviso do topo. */
	const agir = (acao: Promise<unknown>) => {
		setErro(undefined);
		acao.catch((falha: unknown) => setErro(frase(falha)));
	};
	const escolherAcao = (coluna: Coluna, acao: AcaoDaColuna) => {
		if (acao === "renomear") setRenomeando(coluna.id);
		else if (acao === "feito") agir(acoes.marcarFeito(coluna.id));
		else if (acao === "apagar") setApagando(coluna.id);
		else {
			const ids = idsComColunaMovida(agenda.colunas, coluna.id, acao);
			if (!ids) return;
			setAviso(`Coluna ${coluna.nome} movida para a ${acao}.`);
			// Otimista: se a extensão recusar, a casca avisa e a ordem volta.
			acoes.reordenarColunas(ids).catch(() => {});
		}
	};

	const tarefaArrastada = arrasto ? agenda.tarefas.find((tarefa) => tarefa.id === arrasto.id) : undefined;
	const colunaDeApagar = agenda.colunas.find((coluna) => coluna.id === apagando);

	return (
		<div className="quadro-tela">
			{erro ? (
				<p className="body-sm agenda__erro" role="alert">
					<Icon name="alert" size={16} />
					<span>{erro}</span>
					<Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Fechar o aviso" onClick={() => setErro(undefined)} />
				</p>
			) : null}

			<p id={idDaAjuda} className="ap-visually-hidden">
				Enter abre a tarefa. Alt com as setas esquerda e direita muda de coluna; Alt com as setas para cima e para baixo muda o lugar na coluna.
			</p>
			<p className="ap-visually-hidden" role="status" aria-live="polite">
				{aviso}
			</p>

			<div ref={quadro} className={`quadro${arrasto ? " quadro--arrastando" : ""}`} role="group" aria-label="Quadro de tarefas">
				<div className="quadro__colunas">
					{colunas.map((item) => (
						<ColunaDoQuadro
							key={item.coluna.id}
							item={item}
							props={props}
							opcoesDasColunas={opcoesDasColunas}
							arrasto={arrasto}
							idDaAjuda={idDaAjuda}
							renomeando={renomeando === item.coluna.id}
							adicionando={adicionandoEm === item.coluna.id}
							iniciarRenomear={() => setRenomeando(item.coluna.id)}
							fecharRenomear={() => setRenomeando(undefined)}
							renomear={(nome) => acoes.renomearColuna(item.coluna.id, nome)}
							escolherAcao={(acao) => escolherAcao(item.coluna, acao)}
							abrirAdicionar={() => setAdicionandoEm(item.coluna.id)}
							fecharAdicionar={() => setAdicionandoEm((atual) => (atual === item.coluna.id ? undefined : atual))}
							criarTarefa={(titulo) => {
								const resultado = criacaoRapida(agenda, titulo, { coluna: item.coluna.id, ...(materia ? { materia } : {}) });
								return "erro" in resultado ? Promise.reject(new Error(resultado.erro)) : acoes.criarTarefa(resultado.entrada);
							}}
							mover={mover}
							moverComTeclado={moverComTeclado}
							iniciarArrasto={iniciar}
							cliqueDoArrasto={cliqueDoArrasto}
						/>
					))}

					<div className="quadro-nova">
						{criandoColuna ? (
							<CampoRapido
								autoFoco
								icon="plus"
								placeholder="Nome da coluna"
								rotulo="Nome da coluna nova"
								validar={erroDoNomeDeColuna}
								criar={async (nome) => {
									await acoes.criarColuna(nome);
									setCriandoColuna(false);
								}}
								aoSair={() => setCriandoColuna(false)}
							/>
						) : (
							<Button variant="ghost" icon="plus" block className="quadro-nova__botao" onClick={() => setCriandoColuna(true)}>
								Nova coluna
							</Button>
						)}
					</div>
				</div>
			</div>

			{arrasto && tarefaArrastada
				? createPortal(
						<div
							className={`quadro-cartao quadro-cartao--fantasma ${classeDoTom(tomDaMateria(tarefaArrastada.materia, materias))}`}
							aria-hidden="true"
							style={{ left: arrasto.x - arrasto.dx, top: arrasto.y - arrasto.dy, width: arrasto.largura } satisfies CSSProperties}
						>
							<ConteudoDoCartao tarefa={tarefaArrastada} agenda={agenda} materias={materias} hoje={hoje} />
						</div>,
						document.body,
					)
				: null}

			<ModalApagarColuna coluna={colunaDeApagar} agenda={agenda} fechar={() => setApagando(undefined)} apagar={(id, destino) => acoes.apagarColuna(id, destino)} />
		</div>
	);
}

interface PropsColuna {
	item: ColunaDoQuadro;
	props: PropsAbaAgenda;
	opcoesDasColunas: Array<{ id: string; nome: string }>;
	arrasto: EstadoDoArrasto | undefined;
	idDaAjuda: string;
	renomeando: boolean;
	adicionando: boolean;
	iniciarRenomear(): void;
	fecharRenomear(): void;
	renomear(nome: string): Promise<unknown>;
	escolherAcao(acao: AcaoDaColuna): void;
	abrirAdicionar(): void;
	fecharAdicionar(): void;
	criarTarefa(titulo: string): Promise<unknown>;
	mover(id: string, coluna: string, posicao?: number): boolean;
	moverComTeclado(id: string, direcao: DirecaoDoCartao): void;
	iniciarArrasto(evento: PointerEvent<HTMLElement>, id: string): void;
	cliqueDoArrasto(): boolean;
}

/** Uma coluna: o cabeçalho, os cartões com a linha de soltar, o campo de adicionar no pé. */
function ColunaDoQuadro(propsDaColuna: PropsColuna) {
	const { item, props, arrasto } = propsDaColuna;
	const { coluna, tarefas, total } = item;
	const { agenda, materias, hoje } = props;
	const alvoAqui = arrasto?.alvo?.coluna === coluna.id ? arrasto.alvo : undefined;
	// Os cartões sem o arrastado: é entre eles que o indice do alvo conta.
	const semArrastado = arrasto ? tarefas.filter((tarefa) => tarefa.id !== arrasto.id) : tarefas;
	const antesDe = alvoAqui ? semArrastado[alvoAqui.indice]?.id : undefined;
	const depoisDe = alvoAqui && alvoAqui.indice >= semArrastado.length ? semArrastado.at(-1)?.id : undefined;
	const vazioAlvo = alvoAqui !== undefined && semArrastado.length === 0;
	const opcoes = acoesDaColuna(agenda, coluna.id);

	return (
		<section className={`quadro-coluna${alvoAqui ? " quadro-coluna--alvo" : ""}${coluna.feito ? " quadro-coluna--feito" : ""}`} data-coluna={coluna.id} aria-label={`Coluna ${coluna.nome}`}>
			<CabecalhoColuna
				coluna={coluna}
				visiveis={tarefas.length}
				total={total}
				opcoes={opcoes}
				renomeando={propsDaColuna.renomeando}
				iniciarRenomear={propsDaColuna.iniciarRenomear}
				fecharRenomear={propsDaColuna.fecharRenomear}
				renomear={propsDaColuna.renomear}
				escolher={propsDaColuna.escolherAcao}
			/>

			<ul className="quadro-coluna__lista" aria-label={`Tarefas em ${coluna.nome}`}>
				{tarefas.map((tarefa: Tarefa) => (
					<CartaoTarefa
						key={tarefa.id}
						tarefa={tarefa}
						agenda={agenda}
						materias={materias}
						hoje={hoje}
						colunas={propsDaColuna.opcoesDasColunas}
						arrastando={arrasto?.id === tarefa.id}
						{...(antesDe === tarefa.id ? { marca: "antes" as const } : depoisDe === tarefa.id ? { marca: "depois" as const } : {})}
						idDaAjuda={propsDaColuna.idDaAjuda}
						abrir={() => props.abrirTarefa(tarefa)}
						moverPara={(destino) => propsDaColuna.mover(tarefa.id, destino)}
						moverComTeclado={(direcao) => propsDaColuna.moverComTeclado(tarefa.id, direcao)}
						aoPressionar={(evento) => propsDaColuna.iniciarArrasto(evento, tarefa.id)}
						cliqueDoArrasto={propsDaColuna.cliqueDoArrasto}
					/>
				))}
			</ul>
			{tarefas.length === 0 ? (
				<p className={`body-sm quadro-coluna__vazio${vazioAlvo ? " quadro-coluna__vazio--alvo" : ""}`}>
					{total > 0 ? "Nenhuma tarefa desta matéria." : coluna.feito ? "O que você concluir aparece aqui." : "Sem tarefas."}
				</p>
			) : null}

			<div className="quadro-coluna__pe">
				{propsDaColuna.adicionando ? (
					<CampoRapido
						autoFoco
						placeholder="Título da tarefa"
						rotulo={`Adicionar tarefa em ${coluna.nome}`}
						criar={propsDaColuna.criarTarefa}
						aoSair={propsDaColuna.fecharAdicionar}
					/>
				) : (
					<Button variant="ghost" size="sm" icon="plus" block onClick={propsDaColuna.abrirAdicionar} aria-label={`Adicionar tarefa em ${coluna.nome}`}>
						Adicionar
					</Button>
				)}
			</div>
		</section>
	);
}
