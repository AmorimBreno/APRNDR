// A mesa de estudo (ESPECIFICACAO 13.19; docs/mesa-de-estudo.md, 2.1 e 2.10):
// quando uma nota ou uma lição está aberta, a tela do caderno vira a área de
// estudo à esquerda (children) e o painel do professor à direita, que abre e
// fecha. Em cima da área da esquerda fica a faixa da mesa (vazia por ora, e sem
// ocupar espaço; as abas entram no WP5b). O botão do professor é a foto da aba
// do caderno (useProfessorDaMesa); no módulo, que não tem aba, é um botão na faixa.
//
// O painel é a conversa embutida do app (props.conversa) e fica sempre
// montado: fechado quer dizer escondido (o componente embutido cuida de hidden
// e inert), então o rascunho, a citação e a resposta em andamento continuam. A
// coluna é que some da grade. Aberto ou fechado fica no localStorage, por
// perfil; na primeira vez, fechado. Ctrl+J alterna (capturado antes do
// navegador, que abriria os Downloads), só enquanto a mesa está montada.
//
// Largura da mesa (não da janela, porque o app roda a 90 % de escala e porque a
// mesa pode ficar menor que a tela): a partir de 1100 px o professor é uma
// coluna; abaixo disso vira gaveta por cima da esquerda; abaixo de 760 px, um
// lado por vez (a gaveta ocupa tudo). O modo vem de um ResizeObserver e vai no
// data-modo, para a mola do Motion e o CSS (mesa.css) concordarem.

import { AvatarAgente, type DadosAvatarAgente, type PropsConversaEmbutida, semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import { type ComponentType, createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";
import { CabecalhoProfessor } from "./CabecalhoProfessor.tsx";

type Modo = "lado" | "gaveta" | "tela";

/** A largura do painel do professor, em px da interface (que roda a 90 %). */
const LARGURA_PAINEL = 440;
const LIMITE_GAVETA = 1100;
const LIMITE_TELA = 760;
const MOLA = { type: "spring", stiffness: 420, damping: 40 } as const;

function modoPelaLargura(largura: number): Modo {
	return largura < LIMITE_TELA ? "tela" : largura < LIMITE_GAVETA ? "gaveta" : "lado";
}

function chaveArmazenada(perfilId: string): string {
	return `estudos:${perfilId}:mesa-professor-aberto`;
}

/** Lembrado por perfil; na primeira vez (ou sem localStorage), fechado. */
function lerAberto(perfilId: string): boolean {
	try {
		return localStorage.getItem(chaveArmazenada(perfilId)) === "1";
	} catch {
		return false;
	}
}

function guardarAberto(perfilId: string, aberto: boolean): void {
	try {
		localStorage.setItem(chaveArmazenada(perfilId), aberto ? "1" : "0");
	} catch {
		// Sem armazenamento: vale só nesta abertura.
	}
}

/** O que a aba do caderno (dentro da mesa) usa para abrir e fechar o painel do professor. */
export interface ProfessorDaMesa {
	aberto: boolean;
	pendente: boolean;
	pulsa: boolean;
	alternar(): void;
	idPainel: string;
	botao: RefObject<HTMLButtonElement | null>;
}

const ContextoProfessor = createContext<ProfessorDaMesa | undefined>(undefined);

/** Fora da mesa (ou sem conversa embutida) devolve undefined: a foto abre a conversa em tela cheia. */
export function useProfessorDaMesa(): ProfessorDaMesa | undefined {
	return useContext(ContextoProfessor);
}

export interface PropsMesaEstudo {
	janela: PropsConversaEmbutida["janela"];
	perfilId: string;
	/** A conversa embutida do app; sem ela a mesa não mostra o professor (nem o botão). */
	conversa?: ComponentType<PropsConversaEmbutida>;
	materia?: Materia;
	/** O professor, para a foto do botão. */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
	/** O botão do professor na faixa do topo: só onde a aba do caderno não existe (o módulo). */
	botaoNaFaixa?: boolean;
	/** A área de estudo: o que a tela do caderno mostrava (aba e nota, ou o módulo). */
	children: ReactNode;
}

export function MesaEstudo(props: PropsMesaEstudo) {
	const { perfilId, conversa: Conversa } = props;
	const [aberto, setAberto] = useState(() => lerAberto(perfilId));
	const [pendente, setPendente] = useState(false);
	const [modo, setModo] = useState<Modo>("lado");
	const raiz = useRef<HTMLDivElement>(null);
	const painel = useRef<HTMLElement>(null);
	const botao = useRef<HTMLButtonElement>(null);
	const idPainel = useId();
	const parado = semMovimento();

	const alternar = useCallback(() => {
		setAberto((atual) => {
			guardarAberto(perfilId, !atual);
			return !atual;
		});
	}, [perfilId]);

	// Ctrl+J: na fase de captura e com preventDefault, para o Edge não abrir os Downloads.
	// Só enquanto a mesa está montada e tem professor.
	useEffect(() => {
		if (!Conversa) return;
		const aoTeclar = (evento: KeyboardEvent) => {
			if (!evento.ctrlKey || evento.shiftKey || evento.altKey || evento.metaKey || evento.key.toLowerCase() !== "j") return;
			evento.preventDefault();
			alternar();
		};
		window.addEventListener("keydown", aoTeclar, true);
		return () => window.removeEventListener("keydown", aoTeclar, true);
	}, [Conversa, alternar]);

	// O modo vem da largura da mesa, medida antes de pintar para não piscar o layout errado.
	useLayoutEffect(() => {
		const elemento = raiz.current;
		if (!elemento) return;
		setModo(modoPelaLargura(elemento.clientWidth));
		const observador = new ResizeObserver(([entrada]) => {
			if (entrada) setModo(modoPelaLargura(entrada.contentRect.width));
		});
		observador.observe(elemento);
		return () => observador.disconnect();
	}, []);

	// Abrir foca o campo de pergunta; fechar devolve o foco ao botão do professor.
	// Não roda na montagem: só quando o Breno abre ou fecha.
	const anterior = useRef(aberto);
	useEffect(() => {
		if (anterior.current === aberto) return;
		anterior.current = aberto;
		if (aberto) {
			// Depois do commit, o inert já saiu; preventScroll porque o painel ainda está abrindo.
			const quadro = requestAnimationFrame(() => painel.current?.querySelector<HTMLElement>("textarea, [contenteditable='true']")?.focus({ preventScroll: true }));
			return () => cancelAnimationFrame(quadro);
		}
		if (painel.current?.contains(document.activeElement) || document.activeElement === document.body) botao.current?.focus();
		return undefined;
	}, [aberto]);

	// Largura do painel por modo: coluna (0 quando fechado), gaveta ou tela inteira.
	const larguraAberta = modo === "tela" ? "100%" : `min(${LARGURA_PAINEL}px, 100%)`;
	const animar = modo === "lado" ? { width: aberto ? LARGURA_PAINEL : 0, x: 0 } : { width: larguraAberta, x: aberto ? 0 : "105%" };
	const pulsa = pendente && !aberto && !parado;

	const contexto: ProfessorDaMesa | undefined = Conversa ? { aberto, pendente, pulsa, alternar, idPainel, botao } : undefined;

	return (
		<ContextoProfessor.Provider value={contexto}>
		<div ref={raiz} className="mesa" data-modo={modo} data-aberta={aberto ? "sim" : "nao"}>
			<div className="mesa__esquerda">
				{Conversa && props.botaoNaFaixa ? (
					<div className="mesa__faixa">
						<span className="mesa__faixa-espaco" />
						<button
							ref={botao}
							type="button"
							className={`mesa__professor-botao${pulsa ? " mesa__professor-botao--pulsa" : ""}`}
							onClick={alternar}
							aria-expanded={aberto}
							aria-controls={idPainel}
							title={aberto ? "Fechar o professor (Ctrl+J)" : pendente ? "O professor espera sua resposta (Ctrl+J)" : "Abrir o professor (Ctrl+J)"}
							aria-label={aberto ? "Fechar o painel do professor" : pendente ? "Abrir o painel do professor: há uma pergunta esperando resposta" : "Abrir o painel do professor"}
						>
							<AvatarAgente nome={props.agente?.nome ?? "Professor"} {...(props.agente?.avatar ? { avatar: props.agente.avatar } : {})} tamanho={36} />
						</button>
					</div>
				) : null}
				<div className="mesa__area">{props.children}</div>
			</div>
			{Conversa ? (
				<motion.aside
					ref={painel}
					id={idPainel}
					className="mesa__professor"
					aria-label="Professor"
					initial={false}
					animate={animar}
					transition={parado ? { duration: 0 } : MOLA}
				>
					<div className="mesa__professor-miolo">
						<Conversa
							janela={props.janela}
							aberta={aberto}
							aoPedidoPendente={setPendente}
							cabecalho={<CabecalhoProfessor janela={props.janela} perfilId={perfilId} {...(props.materia ? { materia: props.materia } : {})} />}
						/>
					</div>
				</motion.aside>
			) : null}
		</div>
		</ContextoProfessor.Provider>
	);
}
