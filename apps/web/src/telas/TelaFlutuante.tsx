// A tela do professor flutuante (docs/professor-flutuante.md, 2.4). É a página da janela da bolinha
// (apps/desktop), rota "#/flutuante/<perfil>", e tem dois modos que o Electron troca:
//
// - bolinha: a foto do agente num círculo de 64 px (a janela tem 76), com um anel de estado (parado,
//   pensando, escrevendo, ouvindo). Arrasta a janela pela ponte; soltar sem ter arrastado expande; o
//   clique direito abre um menu. Nunca pede foco: a bolinha fica por cima do Samsung Notes sem tirar
//   a caneta do lugar;
// - chat: 420 x 620, a MESMA conversa que está aberta no app (useJanelaPerfil sem sessaoId entra na
//   sessão aberta no servidor), com o topo do perfil, os chips (captura da tela, voz) e os botões de
//   "Olha minha página" e de microfone.
//
// Nada daqui conhece matéria, nota ou plano: o topo vem de EntradaTelaInicial.cabecalhoFlutuante.
// Padrões de interface (docs/padroes-de-interface.md): o estado da gravação aparece na hora (foi o
// Breno que pediu), o de transcrever só depois de 1 s; os chips e os botões têm tamanho fixo; a
// bolinha e os botões mudam só de cor; sem movimento reduzido, o anel pulsa, com ele só muda a cor.

import { Icon } from "@estudos/design-system";
import { AvatarAgente, atividadeDoAgente, type JanelaPerfilHook, useJanelaPerfil, usePerfis, useValorEstavel } from "@estudos/ui";
import { type ComponentType, type PointerEvent as EventoPonteiro, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CapturaDaTela, type ModoFlutuante, type PonteFlutuante, lerPonteFlutuante } from "../desktop.ts";
import { type AmbienteVoz, type FaseVoz, usarVoz } from "../useVoz.ts";
import { PainelConversa } from "./PainelConversa.tsx";

/** O texto que sai quando há uma captura e o campo está vazio. */
export const TEXTO_OLHA_MINHA_PAGINA = "Olha minha página: o que está errado, faltando ou em aberto?";
export const MSG_SEM_CAPTURA = "Não consegui capturar a tela.";

/** Quanto a bolinha precisa andar (px) antes de contar como arrasto e não como clique. */
const LIMITE_ARRASTO = 4;

const doisDigitos = (n: number) => String(n).padStart(2, "0");
export const tempoMmSs = (segundos: number) => `${Math.floor(segundos / 60)}:${doisDigitos(segundos % 60)}`;

export interface PropsTelaFlutuante {
	perfilId: string;
	/** O topo do perfil (EntradaTelaInicial.cabecalhoFlutuante). */
	cabecalho?: ComponentType<{ janela: JanelaPerfilHook }>;
	/** A ponte do Electron; sem ela (navegador comum) a tela lê window.estudosDesktop e, não achando, vira só um chat. */
	ponte?: PonteFlutuante;
	/** Para os testes: o microfone e o fetch falsos. */
	ambienteVoz?: AmbienteVoz;
}

/** O que o anel da bolinha mostra. */
export type EstadoBolinha = "parado" | "pensando" | "escrevendo" | "ouvindo";

export function estadoDaBolinha(atividade: ReturnType<typeof atividadeDoAgente>, fase: FaseVoz): EstadoBolinha {
	if (fase === "gravando") return "ouvindo";
	if (atividade === "parado") return "parado";
	return atividade === "escrevendo" ? "escrevendo" : "pensando";
}

const ROTULO_ESTADO: Record<EstadoBolinha, string> = {
	parado: "Professor",
	pensando: "Professor pensando",
	escrevendo: "Professor escrevendo",
	ouvindo: "Professor ouvindo",
};

function IconeMicrofone() {
	return (
		<svg className="ap-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
			<rect x="9" y="3" width="6" height="12" />
			<path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
		</svg>
	);
}

function IconeCamera() {
	return (
		<svg className="ap-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
			<path d="M3 8h4l2-3h6l2 3h4v12H3z" />
			<circle cx="12" cy="13.5" r="3.5" />
		</svg>
	);
}

/* ── A bolinha ─────────────────────────────────────────────────────────────────────────────── */

interface PropsBolinha {
	nome: string;
	avatar?: Parameters<typeof AvatarAgente>[0]["avatar"];
	estado: EstadoBolinha;
	/** Segundos gravados, quando ouvindo. */
	segundos: number;
	ponte?: PonteFlutuante;
}

function Bolinha({ nome, avatar, estado, segundos, ponte }: PropsBolinha) {
	const [menu, setMenu] = useState(false);
	/**
	 * O gesto em andamento. O arrasto não usa o screenX do evento nem o cursor do sistema: no Electron, com a janela
	 * andando, o screenX do toque oscilava (a bolinha piscava entre o canto e o dedo), e o toque do Windows não move o
	 * cursor. O alvo é a posição da janela que a página conhece (window.screenX/Y) mais o ponto do ponteiro dentro dela,
	 * menos o ponto em que pegou a bolinha: as duas partes vêm da mesma visão da página, então o atraso de uma cancela o
	 * da outra. Um pedido por vez ao Electron; o alvo mais novo que chegar no meio vai logo depois da confirmação.
	 */
	const gesto = useRef<{ id: number; gx: number; gy: number; arrastou: boolean } | undefined>(undefined);
	const emVoo = useRef(false);
	const pendente = useRef<{ x: number; y: number } | undefined>(undefined);
	const enviado = useRef<{ x: number; y: number } | undefined>(undefined);

	const despachar = () => {
		const alvo = pendente.current;
		if (emVoo.current || !alvo || !ponte) return;
		pendente.current = undefined;
		if (enviado.current && enviado.current.x === alvo.x && enviado.current.y === alvo.y) return;
		enviado.current = alvo;
		emVoo.current = true;
		void Promise.resolve(ponte.moverPara(alvo.x, alvo.y)).finally(() => {
			emVoo.current = false;
			despachar();
		});
	};

	const alvoDo = (evento: EventoPonteiro<HTMLDivElement>, atual: { gx: number; gy: number }) => ({
		x: Math.round(window.screenX + evento.clientX - atual.gx),
		y: Math.round(window.screenY + evento.clientY - atual.gy),
	});

	const descer = (evento: EventoPonteiro<HTMLDivElement>) => {
		if (evento.button !== 0) return;
		setMenu(false);
		gesto.current = { id: evento.pointerId, gx: evento.clientX, gy: evento.clientY, arrastou: false };
		enviado.current = undefined;
		evento.currentTarget.setPointerCapture?.(evento.pointerId);
	};
	const andar = (evento: EventoPonteiro<HTMLDivElement>) => {
		const atual = gesto.current;
		if (!atual || atual.id !== evento.pointerId) return;
		if (!atual.arrastou) {
			// A janela ainda não andou: a distância dentro dela é a distância do dedo.
			if (Math.hypot(evento.clientX - atual.gx, evento.clientY - atual.gy) < LIMITE_ARRASTO) return;
			atual.arrastou = true;
		}
		pendente.current = alvoDo(evento, atual);
		despachar();
	};
	const subir = (evento: EventoPonteiro<HTMLDivElement>) => {
		const atual = gesto.current;
		if (!atual || atual.id !== evento.pointerId) return;
		gesto.current = undefined;
		evento.currentTarget.releasePointerCapture?.(evento.pointerId);
		if (atual.arrastou) {
			// O último ponto vai também (logo, ou depois do pedido que estiver a caminho).
			pendente.current = alvoDo(evento, atual);
			despachar();
			return;
		}
		void ponte?.expandir();
	};
	const cancelar = (evento: EventoPonteiro<HTMLDivElement>) => {
		if (gesto.current?.id === evento.pointerId) gesto.current = undefined;
	};

	const escolher = (acao: "abrir" | "esconder") => {
		setMenu(false);
		void (acao === "abrir" ? ponte?.abrirApp() : ponte?.esconder());
	};

	// O menu fecha com Esc e com um clique fora dele.
	useEffect(() => {
		if (!menu) return;
		const tecla = (evento: KeyboardEvent) => {
			if (evento.key === "Escape") setMenu(false);
		};
		const fora = (evento: PointerEvent) => {
			if (!(evento.target as Element | null)?.closest?.(".bolinha__menu")) setMenu(false);
		};
		window.addEventListener("keydown", tecla);
		window.addEventListener("pointerdown", fora, true);
		return () => {
			window.removeEventListener("keydown", tecla);
			window.removeEventListener("pointerdown", fora, true);
		};
	}, [menu]);

	return (
		<div className="bolinha" data-estado={estado}>
			<div
				className="bolinha__corpo"
				role="button"
				tabIndex={-1}
				aria-label={`${ROTULO_ESTADO[estado]}: abrir o chat`}
				onPointerDown={descer}
				onPointerMove={andar}
				onPointerUp={subir}
				onPointerCancel={cancelar}
				onContextMenu={(evento) => {
					evento.preventDefault();
					gesto.current = undefined;
					// O menu nativo do Windows, quando a ponte tem; senão, o desenhado na tela.
					if (ponte?.menu) void ponte.menu();
					else setMenu(true);
				}}
			>
				<span className="bolinha__anel" aria-hidden="true" />
				<AvatarAgente nome={nome} {...(avatar ? { avatar } : {})} tamanho={64} className="bolinha__foto" />
				{/* Sempre no lugar (invisível quando não grava): a bolinha não muda de tamanho. */}
				<span className="bolinha__tempo data" aria-hidden={estado !== "ouvindo"} style={{ visibility: estado === "ouvindo" ? "visible" : "hidden" }}>
					{tempoMmSs(segundos)}
				</span>
			</div>
			{menu ? (
				<div className="bolinha__menu" role="menu">
					<button type="button" role="menuitem" className="bolinha__item" onClick={() => escolher("abrir")}>
						Abrir o app
					</button>
					<button type="button" role="menuitem" className="bolinha__item" onClick={() => escolher("esconder")}>
						Esconder a bolinha
					</button>
				</div>
			) : null}
		</div>
	);
}

/* ── O chat compacto ───────────────────────────────────────────────────────────────────────── */

interface PropsChat {
	perfilId: string;
	/** A janela do campo (a que leva a captura pendente). */
	janela: JanelaPerfilHook;
	/** A janela de verdade, para o topo do perfil: o que ele manda não leva a captura. */
	janelaPura: JanelaPerfilHook;
	cabecalho?: ComponentType<{ janela: JanelaPerfilHook }>;
	ponte?: PonteFlutuante;
	rascunho: [string, (valor: string | ((anterior: string) => string)) => void];
	captura: CapturaDaTela | undefined;
	removerCaptura(): void;
	capturar(): void;
	capturando: boolean;
	voz: ReturnType<typeof usarVoz>;
	aviso: string | undefined;
	limparAviso(): void;
}

/** A rolagem do chat entre um abrir e outro (o chat é desmontado na bolinha), pela classe do elemento que rola. */
const rolagensDoChat = new Map<string, { topo: number; noFim: boolean }>();

function Chat({ perfilId, janela, janelaPura, cabecalho: Cabecalho, ponte, rascunho, captura, removerCaptura, capturar, capturando, voz, aviso, limparAviso }: PropsChat) {
	const perfis = usePerfis();
	const perfil = perfis.lista?.perfis.find((item) => item.id === perfilId);
	const raiz = useRef<HTMLDivElement>(null);

	// Sem foco automático no campo: no notebook com tela de toque, o foco abre o teclado virtual mesmo sem o Breno querer
	// digitar (pedido dele). Ele toca no campo quando for escrever.

	// A rolagem da conversa volta para onde estava: o chat é desmontado quando vira bolinha, e a conversa remontada
	// começaria no fim. Guarda a rolagem de cada elemento que rola (pela classe) a cada scroll, e devolve ao abrir.
	useEffect(() => {
		const caixa = raiz.current;
		if (!caixa) return;
		const guardar = (evento: Event) => {
			const alvo = evento.target;
			if (!(alvo instanceof HTMLElement) || !alvo.className) return;
			rolagensDoChat.set(alvo.className, { topo: alvo.scrollTop, noFim: alvo.scrollHeight - alvo.scrollTop - alvo.clientHeight < 40 });
		};
		caixa.addEventListener("scroll", guardar, true);
		// Depois do primeiro desenho da conversa (que vai ao fim por conta própria): devolve o que estava.
		const quadro = requestAnimationFrame(() => {
			for (const [classe, rolagem] of rolagensDoChat) {
				if (rolagem.noFim) continue;
				const elemento = [...caixa.querySelectorAll<HTMLElement>("*")].find((item) => item.className === classe);
				if (elemento) elemento.scrollTop = rolagem.topo;
			}
		});
		return () => {
			cancelAnimationFrame(quadro);
			caixa.removeEventListener("scroll", guardar, true);
		};
	}, []);

	const transcrevendoVisivel = useValorEstavel(voz.fase === "transcrevendo", voz.fase === "transcrevendo", false);
	let chipVoz: ReactNode = null;
	if (voz.fase === "gravando") {
		chipVoz = (
			<span className="flutuante__chip flutuante__chip--voz flutuante__chip--gravando" role="status">
				<span className="flutuante__ponto" aria-hidden="true" />
				<span className="flutuante__chip-texto body-sm">Gravando · {tempoMmSs(voz.segundos)}</span>
			</span>
		);
	} else if (voz.fase === "transcrevendo") {
		chipVoz = (
			<span className="flutuante__chip flutuante__chip--voz" role="status">
				<span className="flutuante__chip-texto body-sm">{transcrevendoVisivel ? "Transcrevendo…" : `Gravado · ${tempoMmSs(voz.segundos)}`}</span>
			</span>
		);
	} else if (voz.envioEm !== undefined) {
		chipVoz = (
			<span className="flutuante__chip flutuante__chip--voz" role="status">
				<span className="flutuante__chip-texto body-sm">Envia em {voz.envioEm} s</span>
				<button type="button" className="flutuante__chip-acao body-sm" onClick={voz.cancelarEnvio}>
					Cancelar
				</button>
			</span>
		);
	} else if (aviso) {
		chipVoz = (
			<span className="flutuante__chip flutuante__chip--erro" role="alert" title={aviso}>
				<span className="flutuante__chip-texto body-sm">{aviso}</span>
				<button type="button" className="flutuante__chip-x" aria-label="Fechar o aviso" onClick={limparAviso}>
					<Icon name="close" size={12} strokeWidth={2.75} />
				</button>
			</span>
		);
	}

	const gravando = voz.fase === "gravando";
	const faixa = (
		<div className="flutuante__faixa">
			<div className="flutuante__chips">
				{captura ? (
					<span className="flutuante__chip flutuante__chip--captura" role="group" aria-label="Captura da tela">
						<img className="flutuante__miniatura" src={`data:${captura.tipo};base64,${captura.dados}`} alt="" draggable={false} />
						<span className="flutuante__chip-texto body-sm">Captura da tela</span>
						<button type="button" className="flutuante__chip-x" aria-label="Remover a captura da tela" onClick={removerCaptura}>
							<Icon name="close" size={12} strokeWidth={2.75} />
						</button>
					</span>
				) : null}
				{chipVoz}
			</div>
			<div className="flutuante__botoes">
				{ponte ? (
					<button type="button" className="flutuante__botao" aria-label="Olha minha página" title="Olha minha página" disabled={capturando} onClick={capturar}>
						<IconeCamera />
					</button>
				) : null}
				<button
					type="button"
					className={`flutuante__botao${gravando ? " flutuante__botao--gravando" : ""}`}
					aria-label={gravando ? "Parar de gravar" : "Gravar a voz"}
					aria-pressed={gravando}
					title="Gravar a voz (Ctrl+Alt+Espaço)"
					disabled={voz.fase === "transcrevendo"}
					onClick={voz.alternar}
				>
					<IconeMicrofone />
				</button>
			</div>
		</div>
	);

	return (
		<div className="flutuante" ref={raiz}>
			<header className="flutuante__topo">
				<div className="flutuante__cabecalho">{Cabecalho ? <Cabecalho janela={janelaPura} /> : null}</div>
				<div className="flutuante__acoes">
					<button type="button" className="flutuante__botao-texto body-sm" onClick={() => (ponte ? void ponte.abrirApp() : (window.location.hash = `#/perfil/${encodeURIComponent(perfilId)}`))}>
						<Icon name="arrow-up-right" size={14} strokeWidth={2.5} />
						Abrir o app
					</button>
					{ponte ? (
						<button type="button" className="flutuante__botao-texto body-sm" onClick={() => void ponte.recolher()}>
							<Icon name="chevron-down" size={14} strokeWidth={2.5} />
							Recolher
						</button>
					) : null}
				</div>
			</header>
			<div className="flutuante__conversa">
				<PainelConversa
					modo="embutido"
					janela={janela}
					{...(perfil ? { perfil } : {})}
					relerPerfis={perfis.recarregar}
					rascunho={rascunho}
					aberta
					acimaDoCampo={faixa}
					placeholder="Pergunte ao professor…"
				/>
			</div>
		</div>
	);
}

/* ── A tela ────────────────────────────────────────────────────────────────────────────────── */

export function TelaFlutuante({ perfilId, cabecalho, ponte: ponteProp, ambienteVoz }: PropsTelaFlutuante) {
	const ponte = useMemo(() => ponteProp ?? lerPonteFlutuante(window), [ponteProp]);
	const janela = useJanelaPerfil(perfilId);
	const { estado, acoes } = janela;
	const perfis = usePerfis();
	const perfil = perfis.lista?.perfis.find((item) => item.id === perfilId);

	// Sem ponte (navegador comum): só o chat. Com ela, o modo vem do Electron.
	const [modo, setModo] = useState<ModoFlutuante | undefined>(ponte ? undefined : "chat");
	useEffect(() => {
		if (!ponte) return;
		let vivo = true;
		const parar = ponte.aoMudarModo((novo) => vivo && setModo(novo));
		void ponte.modo().then(
			(inicial) => vivo && setModo((atual) => atual ?? inicial),
			() => vivo && setModo((atual) => atual ?? "bolinha"),
		);
		return () => {
			vivo = false;
			parar();
		};
	}, [ponte]);

	// A página só é transparente na bolinha (estilo.css, .rota-flutuante).
	useEffect(() => {
		const raiz = document.documentElement;
		raiz.classList.add("rota-flutuante");
		return () => raiz.classList.remove("rota-flutuante", "flutuante-chat");
	}, []);
	useEffect(() => {
		document.documentElement.classList.toggle("flutuante-chat", modo === "chat");
	}, [modo]);

	// O rascunho, a captura e a voz ficam aqui: recolher e expandir não podem perdê-los.
	const rascunho = useState("");
	const [texto, setTexto] = rascunho;
	const [captura, setCaptura] = useState<CapturaDaTela | undefined>(undefined);
	const [capturando, setCapturando] = useState(false);
	const [avisoCaptura, setAvisoCaptura] = useState<string | undefined>(undefined);
	const capturaRef = useRef(captura);
	capturaRef.current = captura;
	const textoRef = useRef(texto);
	textoRef.current = texto;
	const vivo = useRef(true);
	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
		};
	}, []);

	/** Manda como o campo manda, levando a captura pendente; ela some quando a mensagem vai. */
	const enviarTexto = useCallback(
		(mensagem: string) => {
			const imagem = capturaRef.current;
			const imagens = imagem ? [{ tipo: imagem.tipo, dados: imagem.dados }] : undefined;
			acoes.enviar(mensagem, undefined, imagens).then(
				() => {
					if (imagem && capturaRef.current === imagem) setCaptura(undefined);
					setTexto((atual) => (atual === mensagem ? "" : atual));
				},
				() => {
					// Falhou: o texto continua no campo (o aviso do erro já vem pelo estado da janela).
				},
			);
		},
		[acoes, setTexto],
	);

	const voz = usarVoz({
		perfilId,
		texto,
		definirTexto: setTexto,
		aoEnviar: enviarTexto,
		textoModelo: TEXTO_OLHA_MINHA_PAGINA,
		...(ambienteVoz ? { ambiente: ambienteVoz } : {}),
	});
	const vozRef = useRef(voz);
	vozRef.current = voz;
	const modoRef = useRef(modo);
	modoRef.current = modo;

	// O atalho Ctrl+Alt+Espaço (global): começa ou para a gravação; com a bolinha recolhida, o chat abre.
	useEffect(() => {
		if (!ponte) return;
		return ponte.aoAlternarVoz(() => {
			if (modoRef.current === "bolinha" && vozRef.current.fase === "ocioso") void ponte.expandir();
			vozRef.current.alternar();
		});
	}, [ponte]);

	const capturar = () => {
		if (!ponte || capturando) return;
		setCapturando(true);
		setAvisoCaptura(undefined);
		ponte.capturarTela().then(
			(imagem) => {
				if (!vivo.current) return;
				setCapturando(false);
				if (!imagem) {
					setAvisoCaptura(MSG_SEM_CAPTURA);
					return;
				}
				setCaptura(imagem);
				// Um campo vazio já leva o pedido de sempre: é só dar Enter.
				setTexto((atual) => (atual.trim() ? atual : TEXTO_OLHA_MINHA_PAGINA));
			},
			() => {
				if (!vivo.current) return;
				setCapturando(false);
				setAvisoCaptura(MSG_SEM_CAPTURA);
			},
		);
	};
	const removerCaptura = () => {
		setCaptura(undefined);
		setTexto((atual) => (atual === TEXTO_OLHA_MINHA_PAGINA ? "" : atual));
	};

	// A mensagem digitada leva a captura pendente: o PainelConversa chama acoes.enviar(texto, contextos).
	const janelaDoChat = useMemo<JanelaPerfilHook>(
		() => ({
			...janela,
			acoes: {
				...acoes,
				enviar: (mensagem, contextos) => {
					const imagem = capturaRef.current;
					const imagens = imagem ? [{ tipo: imagem.tipo, dados: imagem.dados }] : undefined;
					return acoes.enviar(mensagem, contextos, imagens).then((resultado) => {
						if (imagem && capturaRef.current === imagem) setCaptura(undefined);
						return resultado;
					});
				},
			},
		}),
		[janela, acoes],
	);

	const agentes = perfil?.agentes ?? [];
	const agente = agentes.find((item) => item.nome === perfil?.agentePadrao) ?? agentes[0];
	const atividade = atividadeDoAgente(estado);

	if (modo === undefined) return <div className="flutuante-aguarda" aria-hidden="true" />;
	if (modo === "bolinha") {
		return (
			<Bolinha
				nome={agente?.nome ?? perfil?.nome ?? perfilId}
				{...(agente?.avatar ? { avatar: agente.avatar } : {})}
				estado={estadoDaBolinha(atividade, voz.fase)}
				segundos={voz.segundos}
				{...(ponte ? { ponte } : {})}
			/>
		);
	}
	return (
		<Chat
			perfilId={perfilId}
			janela={janelaDoChat}
			janelaPura={janela}
			{...(cabecalho ? { cabecalho } : {})}
			{...(ponte ? { ponte } : {})}
			rascunho={rascunho}
			captura={captura}
			removerCaptura={removerCaptura}
			capturar={capturar}
			capturando={capturando}
			voz={voz}
			aviso={voz.erro ?? avisoCaptura}
			limparAviso={() => {
				voz.limparErro();
				setAvisoCaptura(undefined);
			}}
		/>
	);
}
