// Termos e explicações na aula. Só o perfil conhece o glossário; o Markdown
// do núcleo recebe funções genéricas por esquema. Flutuantes no body, fora
// da rolagem, com coordenadas corrigidas pelo zoom de 90% da interface.
import { Button, Icon, Modal } from "@estudos/design-system";
import { Markdown, ProvedorLigacoesMarkdown, semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import { createContext, type ReactNode, type RefObject, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Modulo } from "../../lib/modulo-tipos.ts";
import {
	explicacoesDoBloco,
	moduloTemMarcas,
	NOMES_TIPO_EXPLICACAO,
	situacaoDaExplicacao,
	termoPorId,
	TIPOS_EXPLICACAO,
	type ExplicacaoPedida,
	type LugarNaTela,
	type TermoNaTela,
	type TipoExplicacao,
} from "../../lib/termos-tipos.ts";
import { noProprioBloco, posicionarFlutuante, rotuloDoLugar, trechoDaSelecao, type Retangulo } from "./termos-tela.ts";

export interface AcoesTermos {
	modulo: string;
	glossario: readonly TermoNaTela[];
	explicando: readonly string[];
	falhas: readonly ExplicacaoPedida[];
	erros: Readonly<Record<string, string>>;
	marcando?: { licao: number; licoes: number } | undefined;
	marcar(): Promise<void>;
	explicar(licao: string, bloco: string, trecho: string, tipo: TipoExplicacao): Promise<void>;
	guardar(explicacao: string): Promise<void>;
	ir(lugar: LugarNaTela): void;
}
const Contexto = createContext<AcoesTermos | undefined>(undefined);

// Registro estável: mensagens da ponte atualizam o contexto sem remontar os
// links do Markdown (o termo focado e o cartão aberto não perdem o estado).
const ligacoes = { termo: (id: string, filhos: ReactNode) => <LigacaoDeTermo id={id}>{filhos}</LigacaoDeTermo> };
function LigacaoDeTermo({ id, children }: { id: string; children: ReactNode }) {
	const acoes = useContext(Contexto);
	const termo = acoes && termoPorId(acoes.glossario, id);
	return termo && acoes ? (
		<TermoChave termo={termo} acoes={acoes}>
			{children}
		</TermoChave>
	) : (
		<>{children}</>
	);
}

export function ProvedorTermos({ acoes, children }: { acoes: AcoesTermos; children: ReactNode }) {
	return (
		<Contexto.Provider value={acoes}>
			<ProvedorLigacoesMarkdown ligacoes={ligacoes}>{children}</ProvedorLigacoesMarkdown>
		</Contexto.Provider>
	);
}

function Flutuante({
	alvo,
	children,
	classe,
	referencia,
	tooltipId,
}: {
	alvo: Retangulo;
	children: ReactNode;
	classe: string;
	referencia?: RefObject<HTMLDivElement | null>;
	tooltipId?: string;
}) {
	const propria = useRef<HTMLDivElement>(null);
	const ref = referencia ?? propria;
	const [medidas, setMedidas] = useState({ largura: 360, altura: 180 });
	const [tela, setTela] = useState({ largura: window.innerWidth, altura: window.innerHeight });
	const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
	useLayoutEffect(() => {
		const elemento = ref.current;
		if (!elemento) return;
		const medir = () => {
			const r = elemento.getBoundingClientRect();
			setMedidas({ largura: r.width, altura: r.height });
		};
		medir();
		const observer = new ResizeObserver(medir);
		observer.observe(elemento);
		const resize = () => setTela({ largura: window.innerWidth, altura: window.innerHeight });
		window.addEventListener("resize", resize);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", resize);
		};
	}, [ref]);
	const pos = posicionarFlutuante(alvo, medidas.largura, medidas.altura, tela);
	return createPortal(
		<motion.div
			ref={ref}
			id={tooltipId}
			role={tooltipId ? "tooltip" : "toolbar"}
			aria-label={tooltipId ? undefined : "Pedir explicação"}
			className={`${classe}${pos.abaixo ? ` ${classe}--abaixo` : ""}`}
			style={
				{
					position: "fixed",
					left: pos.left / zoom,
					top: pos.top / zoom,
					maxWidth: (tela.largura - 24) / zoom,
					maxHeight: (tela.altura - 24) / zoom,
					"--termo-seta": `${pos.seta / zoom}px`,
				} as React.CSSProperties
			}
			initial={semMovimento() ? false : { opacity: 0, y: 4, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ type: "spring", stiffness: 420, damping: 32 }}
		>
			{children}
		</motion.div>,
		document.body,
	);
}

export function TermoChave({ termo, acoes, children }: { termo: TermoNaTela; acoes: AcoesTermos; children: ReactNode }) {
	const botao = useRef<HTMLButtonElement>(null);
	const cartao = useRef<HTMLDivElement>(null);
	const id = useId();
	const [aberto, setAberto] = useState(false);
	const [fixo, setFixo] = useState(false);
	const [alvo, setAlvo] = useState<Retangulo | undefined>();
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const mostrar = () => {
		clearTimeout(timer.current);
		setAlvo(botao.current?.getBoundingClientRect());
		setAberto(true);
	};
	const fechar = () => {
		clearTimeout(timer.current);
		setAberto(false);
		setFixo(false);
	};
	const sair = () => {
		if (!fixo)
			timer.current = setTimeout(() => {
				if (!cartao.current?.matches(":hover") && document.activeElement !== botao.current) setAberto(false);
			}, 120);
	};
	useEffect(() => () => clearTimeout(timer.current), []);
	useEffect(() => {
		if (!aberto) return;
		const fora = (evento: PointerEvent) => {
			if (!botao.current?.contains(evento.target as Node) && !cartao.current?.contains(evento.target as Node)) fechar();
		};
		const tecla = (evento: KeyboardEvent) => {
			if (evento.key === "Escape") fechar();
		};
		const rolar = () => setAlvo(botao.current?.getBoundingClientRect());
		document.addEventListener("pointerdown", fora);
		document.addEventListener("keydown", tecla);
		document.addEventListener("scroll", rolar, true);
		return () => {
			document.removeEventListener("pointerdown", fora);
			document.removeEventListener("keydown", tecla);
			document.removeEventListener("scroll", rolar, true);
		};
	}, [aberto]);
	return (
		<>
			<button
				ref={botao}
				type="button"
				className="termo-chave"
				aria-describedby={aberto ? id : undefined}
				onMouseEnter={mostrar}
				onMouseLeave={sair}
				onFocus={mostrar}
				onBlur={sair}
				onClick={(evento) => {
					// Alternativas são rótulos clicáveis: pedir a definição não responde à questão.
					evento.preventDefault();
					evento.stopPropagation();
					if (!termo.lugar) {
						mostrar();
						setFixo(true);
						return;
					}
					const texto = botao.current?.closest<HTMLElement>("[data-texto-estudo]");
					if (noProprioBloco(termo.lugar, acoes.modulo, texto?.dataset.licao ?? "", texto?.dataset.textoEstudo ?? "")) return;
					fechar();
					acoes.ir(termo.lugar);
				}}
			>
				{children}
			</button>
			{aberto && alvo ? (
				<Flutuante alvo={alvo} classe="termo-cartao" referencia={cartao} tooltipId={id}>
					<div onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={sair}>
						<header className="termo-cartao__cabeca body-sm">
							<span>
								<Icon name="bulb" size={16} /> Conceito-chave
							</span>
							<span>{rotuloDoLugar(termo.lugar)}</span>
						</header>
						<div className="termo-cartao__corpo">
							<strong className="heading termo-cartao__titulo">{termo.termo}</strong>
							<div className="body-sm ap-prose">
								<Markdown texto={termo.definicao} ligacoes={{}} />
							</div>
						</div>
					</div>
				</Flutuante>
			) : null}
		</>
	);
}

/** Só o conteúdo didático participa da seleção, nunca campos, feedback ou respostas do aluno. */
export function TextoComTermos({ bloco, licao, children }: { bloco: string; licao: string; children: ReactNode }) {
	const acoes = useContext(Contexto);
	const raiz = useRef<HTMLDivElement>(null);
	const barra = useRef<HTMLDivElement>(null);
	const [selecao, setSelecao] = useState<{ trecho: string; alvo: Retangulo }>();
	const [erro, setErro] = useState<string>();
	const [enviando, setEnviando] = useState(false);
	useEffect(() => {
		if (!acoes) return;
		const conferir = () => {
			const s = window.getSelection();
			if (!s || s.isCollapsed || s.rangeCount !== 1) {
				setSelecao(undefined);
				return;
			}
			const range = s.getRangeAt(0);
			const elemento = (no: Node) => (no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement);
			const inicio = elemento(range.startContainer);
			const fim = elemento(range.endContainer);
			const primeiro = inicio?.closest<HTMLElement>("[data-texto-estudo]");
			const ultimo = fim?.closest<HTMLElement>("[data-texto-estudo]");
			const trecho = trechoDaSelecao(s.toString(), primeiro?.dataset.textoEstudo, ultimo?.dataset.textoEstudo);
			const proibido =
				"textarea,input,[contenteditable=true],.diag__sua-resposta,.modulo__campo,.modulo__confianca,.modulo__questao-botoes";
			const cruzaProibido = raiz.current && [...raiz.current.querySelectorAll(proibido)].some((e) => range.intersectsNode(e));
			if (
				!trecho ||
				primeiro !== raiz.current ||
				ultimo !== raiz.current ||
				inicio?.closest(proibido) ||
				fim?.closest(proibido) ||
				cruzaProibido
			) {
				setSelecao(undefined);
				return;
			}
			setSelecao({ trecho, alvo: range.getBoundingClientRect() });
		};
		const tecla = (e: KeyboardEvent) => {
			if (e.key === "Escape") setSelecao(undefined);
		};
		const rolar = () => setSelecao(undefined);
		document.addEventListener("selectionchange", conferir);
		document.addEventListener("keydown", tecla);
		document.addEventListener("scroll", rolar, true);
		return () => {
			document.removeEventListener("selectionchange", conferir);
			document.removeEventListener("keydown", tecla);
			document.removeEventListener("scroll", rolar, true);
		};
	}, [acoes, bloco, licao]);
	return (
		<div ref={raiz} data-texto-estudo={bloco} data-licao={licao}>
			{children}
			{erro ? (
				<p role="alert" className="body-sm cursos__erro">
					{erro}
				</p>
			) : null}
			{selecao && acoes ? (
				<Flutuante alvo={selecao.alvo} classe="termos-selecao" referencia={barra}>
					<div onMouseDown={(e) => e.preventDefault()}>
						{TIPOS_EXPLICACAO.map((tipo) => (
							<Button
								key={tipo}
								variant="ghost"
								size="sm"
								disabled={enviando}
								onClick={() => {
									setEnviando(true);
									setErro(undefined);
									acoes
										.explicar(licao, bloco, selecao.trecho, tipo)
										.then(() => {
											setSelecao(undefined);
											window.getSelection()?.removeAllRanges();
										})
										.catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
										.finally(() => setEnviando(false));
								}}
							>
								{NOMES_TIPO_EXPLICACAO[tipo]}
							</Button>
						))}
					</div>
				</Flutuante>
			) : null}
		</div>
	);
}

export function ExplicacoesDoBloco({ modulo, bloco }: { modulo: Modulo; bloco: string }) {
	const acoes = useContext(Contexto);
	if (!acoes || modulo.situacao !== "gerado") return null;
	const atuais = explicacoesDoBloco(modulo, bloco);
	const pedidos = [...atuais, ...acoes.falhas.filter((p) => p.bloco === bloco && !atuais.some((a) => a.id === p.id))].sort((a, b) =>
		a.em.localeCompare(b.em),
	);
	if (!pedidos.length) return null;
	const ultimo = pedidos[pedidos.length - 1]!;
	return (
		<div className="termos-explicacoes">
			{pedidos.length > 1 ? (
				<details className="termos-explicacoes__antigas">
					<summary className="body-sm">
						{pedidos.length - 1} {pedidos.length === 2 ? "explicação pedida" : "explicações pedidas"}
					</summary>
					{pedidos.slice(0, -1).map((p) => (
						<BalaoExplicacao key={p.id} pedido={p} acoes={acoes} recolhido />
					))}
				</details>
			) : null}
			<BalaoExplicacao key={ultimo.id} pedido={ultimo} acoes={acoes} />
		</div>
	);
}

function BalaoExplicacao({ pedido, acoes, recolhido = false }: { pedido: ExplicacaoPedida; acoes: AcoesTermos; recolhido?: boolean }) {
	const [erroLocal, setErro] = useState<string>();
	const [ocupado, setOcupado] = useState(false);
	const situacao = situacaoDaExplicacao(pedido, acoes.explicando);
	const erro = erroLocal ?? acoes.erros[pedido.id];
	const executar = (acao: () => Promise<void>) => {
		setOcupado(true);
		setErro(undefined);
		acao()
			.catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
			.finally(() => setOcupado(false));
	};
	return (
		<details data-explicacao={pedido.id} className="termos-explicacao" open={!recolhido || undefined}>
			<summary>
				<span className="overline">{NOMES_TIPO_EXPLICACAO[pedido.tipo]}</span>
				<span className="body-strong">Você perguntou: “{pedido.trecho}”</span>
			</summary>
			<div className="termos-explicacao__corpo ap-prose body">
				{situacao === "explicando" ? (
					<p role="status">Explicando…</p>
				) : situacao === "pronta" ? (
					<Markdown texto={pedido.explicacao!} />
				) : (
					<>
						<p role="alert">{erro ?? "A explicação não terminou. Peça de novo."}</p>
						<Button
							variant="secondary"
							size="sm"
							disabled={ocupado}
							onClick={() => executar(() => acoes.explicar(pedido.licao, pedido.bloco, pedido.trecho, pedido.tipo))}
						>
							Tentar de novo
						</Button>
					</>
				)}
				{situacao === "pronta" && pedido.termo ? (
					<Button
						variant="ghost"
						size="sm"
						icon={pedido.guardado ? "check" : "book"}
						disabled={ocupado || !!pedido.guardado}
						onClick={() => executar(() => acoes.guardar(pedido.id))}
					>
						{pedido.guardado ? "Guardado no glossário" : ocupado ? "Guardando…" : "Guardar no glossário"}
					</Button>
				) : null}
				{situacao === "pronta" && erro ? (
					<p role="alert" className="cursos__erro">
						{erro}
					</p>
				) : null}
			</div>
		</details>
	);
}

export function MarcarTermos({ modulo }: { modulo: Modulo }) {
	const acoes = useContext(Contexto);
	const [confirmar, setConfirmar] = useState(false);
	const [ocupado, setOcupado] = useState(false);
	const [erro, setErro] = useState<string>();
	if (!acoes || modulo.situacao !== "gerado") return null;
	const marcando = acoes.marcando;
	const mostrar = !moduloTemMarcas(modulo);
	return (
		<div className="termos-marcar">
			{marcando ? (
				<p className="body-sm" role="status">
					Marcando os termos da lição {marcando.licao} de {marcando.licoes}…
				</p>
			) : mostrar ? (
				<>
					<Button variant="ghost" size="sm" icon="bulb" onClick={() => setConfirmar(true)}>
						Marcar os termos
					</Button>
					<p className="body-sm">Custa por volta de US$ 0,01 a 0,03 por lição com o GPT-6.1 Sol. Varia com o tamanho.</p>
				</>
			) : null}
			{erro || acoes.erros.marcar_termos ? (
				<p role="alert" className="body-sm cursos__erro">
					{erro ?? acoes.erros.marcar_termos}
				</p>
			) : null}
			<Modal
				open={confirmar}
				onClose={() => !ocupado && setConfirmar(false)}
				title="Marcar os termos?"
				size="sm"
				dismissible={!ocupado}
				footer={
					<>
						<Button variant="secondary" disabled={ocupado} onClick={() => setConfirmar(false)}>
							Cancelar
						</Button>
						<Button
							variant="primary"
							disabled={ocupado}
							onClick={() => {
								setOcupado(true);
								setErro(undefined);
								acoes
									.marcar()
									.then(() => setConfirmar(false))
									.catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
									.finally(() => setOcupado(false));
							}}
						>
							{ocupado ? "Começando…" : "Marcar os termos"}
						</Button>
					</>
				}
			>
				<p className="body">
					Uma chamada ao modelo por lição, por volta de US$ 0,01 a 0,03 cada (varia com o tamanho). O texto não será reescrito e as suas
					respostas serão mantidas.
				</p>
			</Modal>
		</div>
	);
}

// Destino passageiro por aba: sobrevive à remontagem do módulo na navegação,
// mas nunca é gravado na pasta de dados nem compartilhado entre janelas.
let destino: { chave: string; lugar: LugarNaTela } | undefined;
export function apontarTermo(chave: string, lugar: LugarNaTela) {
	destino = { chave, lugar };
}
export function useDestinoTermo(chave: string, modulo: string, licao: string | undefined, pronto: boolean) {
	useEffect(() => {
		if (!pronto || !destino || destino.chave !== chave || destino.lugar.modulo !== modulo || destino.lugar.licao !== licao) return;
		const lugar = destino.lugar;
		const frame = requestAnimationFrame(() => {
			const bloco = [...document.querySelectorAll<HTMLElement>("[data-bloco]")].find((e) => e.dataset.bloco === lugar.bloco);
			if (!bloco) return;
			const pedido = lugar.explicacao
				? [...bloco.querySelectorAll<HTMLDetailsElement>("[data-explicacao]")].find((e) => e.dataset.explicacao === lugar.explicacao)
				: undefined;
			if (pedido) {
				pedido.open = true;
				const grupo = pedido.parentElement?.closest("details");
				if (grupo) grupo.open = true;
			}
			const alvo = pedido ?? bloco;
			alvo.scrollIntoView({ block: "center", behavior: semMovimento() ? "auto" : "smooth" });
			alvo.classList.remove("termos-destino");
			void alvo.offsetWidth;
			alvo.classList.add("termos-destino");
			alvo.setAttribute("tabindex", "-1");
			alvo.focus({ preventScroll: true });
			destino = undefined;
		});
		return () => cancelAnimationFrame(frame);
	});
}
