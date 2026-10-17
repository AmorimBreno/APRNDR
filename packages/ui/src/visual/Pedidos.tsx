// Pedidos da ponte na conversa: cada pedido que espera resposta (de qualquer
// painel) vira um botão no lugar da linha da ferramenta que perguntou, e é
// respondido num modal. O modal abre sozinho quando o pedido chega; dá para
// minimizar e voltar pelo botão, que pulsa em âmbar enquanto espera (o modal
// nasce do botão e volta para ele). Depois de respondido, o botão fica só com
// o contorno e abre o modal para rever.

import { Button, Icon, Modal, pad2 } from "@estudos/design-system";
import { animate } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import type { AcaoRecebida, RegistroPedido } from "../estado-janela.ts";
import { entradaDoPainel, type PropsPainel, type RegistroPaineis, type ResumoPedido, situacaoDoPedido } from "../paineis.tsx";
import type { MotivoCancelamento } from "../tipos.ts";
import { Markdown } from "./Markdown.tsx";
import { morfar, removerCascas, semMovimento } from "./movimento.ts";

/** Resumo do pedido pelo painel dele, ou o genérico. */
export function resumoDoPedido(registro: RegistroPaineis, pedido: RegistroPedido): ResumoPedido {
	const entrada = entradaDoPainel(registro, pedido.painel);
	return entrada.resumir?.(pedido) ?? { tipo: "Pedido", titulo: `${entrada.titulo ?? pedido.painel} · ${pedido.acao}` };
}

/** Número de cada pedido entre os do mesmo tipo, na ordem de chegada ("Pergunta 01", "Pergunta 02"). */
export function numerarPedidos(registro: RegistroPaineis, registros: Record<string, RegistroPedido>): Record<string, number> {
	const contagem = new Map<string, number>();
	const numeros: Record<string, number> = {};
	for (const pedido of Object.values(registros).sort((a, b) => a.ordem - b.ordem)) {
		const tipo = resumoDoPedido(registro, pedido).tipo;
		const numero = (contagem.get(tipo) ?? 0) + 1;
		contagem.set(tipo, numero);
		numeros[pedido.id] = numero;
	}
	return numeros;
}

export interface PropsBotaoPedido {
	pedido: RegistroPedido;
	resumo: ResumoPedido;
	numero: number;
	abrir(): void;
}

/** O botão do pedido na conversa: âmbar pulsando enquanto espera; depois, só o contorno. */
export function BotaoPedido({ pedido, resumo, numero, abrir }: PropsBotaoPedido) {
	const pendente = pedido.estado === "pendente";
	const rotulo = `${resumo.tipo} ${pad2(numero)}`;
	return (
		<button
			type="button"
			className={`botao-pedido${pendente ? " botao-pedido--pendente" : ""}`}
			aria-haspopup="dialog"
			data-pedido={pedido.id}
			aria-label={`${rotulo}: ${situacaoDoPedido(pedido)}. ${pendente ? "Abrir para responder" : "Abrir para rever"}`}
			onClick={abrir}
		>
			<Icon name={resumo.icone ?? "message"} size={22} strokeWidth={2.25} />
			<span className="botao-pedido__texto">
				<span className="overline">
					{rotulo} · {situacaoDoPedido(pedido)}
				</span>
				<span className="botao-pedido__titulo body-strong">
					<Markdown texto={resumo.titulo} emLinha />
				</span>
			</span>
			<Icon name={pendente ? "arrow-up-right" : "check"} size={20} strokeWidth={2.5} />
		</button>
	);
}

export interface PropsModalPedido {
	pedido: RegistroPedido;
	registro: RegistroPaineis;
	numero: number;
	/** Ações do painel do pedido (o quiz acha o resultado ali). */
	acoes: AcaoRecebida[];
	cancelados: Record<string, MotivoCancelamento>;
	responder: PropsPainel["responder"];
	cancelar: PropsPainel["cancelar"];
	acaoDaInterface(painel: string, acao: string, dados?: unknown): Promise<void>;
	/**
	 * Como o modal apareceu: "botao" = você clicou no botão do pedido (ele cresce
	 * a partir do botão); "sozinho" = o pedido acabou de chegar (sobe de baixo).
	 */
	origem: "botao" | "sozinho";
	/** Quem está por fora pediu para fechar (por exemplo, o pedido foi respondido). */
	fecharAgora?: boolean;
	/** O modal terminou de fechar (a animação acabou): pode tirar da tela. */
	aoFechar(): void;
	/** A foto de quem pergunta, na frente do enunciado. */
	quemPergunta?: ReactNode;
}

const RAIO_MODAL = 24;
const RAIO_BOTAO = 24;

function dialogoDoPedido(): HTMLElement | null {
	return document.querySelector<HTMLElement>(".ap-modal.modal-pedido");
}

function botaoDoPedidoNaTela(id: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-pedido="${CSS.escape(id)}"]`);
}

/**
 * O modal de um pedido: para responder, ou para rever depois.
 *
 * Movimento (FLIP com molas, sem View Transition): abrindo pelo botão, uma
 * casca de cor sai do botão e cresce até o lugar do diálogo, e o diálogo
 * aparece por cima quando ela pousa; abrindo sozinho, o diálogo sobe de baixo
 * com mola. Fechando (ou minimizando), o conteúdo some e a casca encolhe de
 * volta até o botão; só então o modal sai da tela. O véu escurece e clareia.
 */
export function ModalPedido(props: PropsModalPedido) {
	const { pedido } = props;
	const entrada = entradaDoPainel(props.registro, pedido.painel);
	const resumo = resumoDoPedido(props.registro, pedido);
	const Componente = entrada.componente;
	const pendente = pedido.estado === "pendente";
	const fechando = useRef(false);
	// A casca: do âmbar do botão esperando (ou do escuro do respondido) até o escuro do diálogo.
	const corDoBotao = pendente ? "--amber" : "--surface-panel";

	// Abrir: antes de pintar, o diálogo some; a casca cresce do botão; o diálogo aparece quando ela pousa.
	useLayoutEffect(() => {
		const dialogo = dialogoDoPedido();
		if (!dialogo || semMovimento()) return;
		const veu = dialogo.parentElement?.querySelector<HTMLElement>(".ap-scrim");
		let cancelado = false;
		const animacoes: Array<{ stop(): void }> = [];
		// Escondidos já no primeiro quadro (a Motion só aplica o começo no quadro seguinte).
		dialogo.style.opacity = "0";
		if (veu) {
			veu.style.opacity = "0";
			animacoes.push(animate(veu, { opacity: [0, 1] }, { duration: 0.24, ease: "easeOut" }));
		}
		const botao = props.origem === "botao" ? botaoDoPedidoNaTela(pedido.id) : null;
		if (botao) {
			const casca = morfar(botao.getBoundingClientRect(), dialogo.getBoundingClientRect(), {
				corDe: corDoBotao,
				corPara: "--surface-panel",
				raioDe: RAIO_BOTAO,
				raioPara: RAIO_MODAL,
				viva: true,
			});
			// O diálogo aparece quando a casca chega ao tamanho (uns 280 ms), sem esperar a mola assentar.
			let mostrou = false;
			const mostrar = () => {
				if (cancelado || mostrou) return;
				mostrou = true;
				// Fechou antes de a casca chegar: ela some e o diálogo continua escondido.
				if (fechando.current) return casca.cancelar();
				animacoes.push(animate(dialogo, { opacity: [0, 1], scale: [0.985, 1] }, { duration: 0.16, ease: "easeOut" }));
				removerCascas();
			};
			const quaseLa = setTimeout(mostrar, 280);
			void casca.pousou.then(mostrar);
			return () => {
				cancelado = true;
				clearTimeout(quaseLa);
				casca.cancelar();
				dialogo.style.opacity = "";
				for (const animacao of animacoes) animacao.stop();
			};
		}
		animacoes.push(animate(dialogo, { opacity: [0, 1], y: [48, 0], scale: [0.9, 1] }, { type: "spring", stiffness: 360, damping: 17, mass: 0.9 }));
		return () => {
			cancelado = true;
			for (const animacao of animacoes) animacao.stop();
		};
		// Só ao abrir.
	}, []);

	// Fechar: o conteúdo some, a casca volta para o botão (ou o diálogo desce e some), e aí tira da tela.
	const fechar = () => {
		if (fechando.current) return;
		fechando.current = true;
		const dialogo = dialogoDoPedido();
		if (!dialogo || semMovimento()) return props.aoFechar();
		const veu = dialogo.parentElement?.querySelector<HTMLElement>(".ap-scrim");
		if (veu) void animate(veu, { opacity: 0 }, { duration: 0.26, ease: "easeIn" });
		const botao = botaoDoPedidoNaTela(pedido.id);
		if (!botao) {
			void animate(dialogo, { opacity: 0, y: 28, scale: 0.94 }, { duration: 0.2, ease: "easeIn" }).then(() => props.aoFechar());
			return;
		}
		const de = dialogo.getBoundingClientRect();
		void animate(dialogo, { opacity: 0 }, { duration: 0.1, ease: "easeIn" }).then(() => {
			const casca = morfar(de, botao.getBoundingClientRect(), { corDe: "--surface-panel", corPara: corDoBotao, raioDe: RAIO_MODAL, raioPara: RAIO_BOTAO, viva: false });
			void casca.pousou.then(() => {
				removerCascas();
				props.aoFechar();
			});
		});
	};

	useEffect(() => {
		if (props.fecharAgora) fechar();
		// fechar é estável o bastante: o que importa é o pedido de fora.
	}, [props.fecharAgora]);

	return (
		<Modal
			open
			onClose={fechar}
			className="modal-pedido"
			title={`${resumo.tipo} ${pad2(props.numero)}`}
			kicker={entrada.titulo ?? pedido.painel}
			tone={pendente ? "amber" : "panel"}
			size="md"
			closeLabel={pendente ? "Minimizar" : "Fechar"}
			footer={
				<Button variant={pendente ? "ghost" : "secondary"} icon={pendente ? undefined : "close"} onClick={fechar}>
					{pendente ? "Responder depois" : "Fechar"}
				</Button>
			}
		>
			<Componente
				painel={pedido.painel}
				acoes={props.acoes}
				pedidos={pendente ? [pedido] : []}
				{...(pendente ? {} : { revisao: pedido })}
				cancelados={props.cancelados}
				responder={props.responder}
				cancelar={props.cancelar}
				acaoDaInterface={(acao, dados) => props.acaoDaInterface(pedido.painel, acao, dados)}
				{...(props.quemPergunta ? { quemPergunta: props.quemPergunta } : {})}
			/>
		</Modal>
	);
}
