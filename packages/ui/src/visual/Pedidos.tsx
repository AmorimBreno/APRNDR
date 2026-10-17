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
import { estadoDoDialogo, estadoDoElemento, morfar, semMovimento } from "./movimento.ts";

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

function dialogoDoPedido(): HTMLElement | null {
	return document.querySelector<HTMLElement>(".ap-modal.modal-pedido");
}

function botaoDoPedidoNaTela(id: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-pedido="${CSS.escape(id)}"]`);
}

/** O conteúdo do diálogo (some e aparece sozinho; o fundo e a faixa do cabeçalho ficam com a casca). */
function conteudoDo(dialogo: HTMLElement): HTMLElement[] {
	return [...dialogo.querySelectorAll<HTMLElement>(".ap-modal__titles, .ap-modal__close, .ap-modal__body, .ap-modal__foot")];
}

/** Quanto tempo o corpo do modal fica sem barra de rolagem enquanto abre. */
const ABRINDO_MS = 700;

/**
 * O modal de um pedido: para responder, ou para rever depois.
 *
 * Movimento (FLIP com molas, sem View Transition), pensando nas duas pontas:
 * - abrindo pelo botão: uma casca sai do botão exatamente como ele está (o
 *   âmbar do que espera, ou o fundo e o contorno do respondido) e vira o
 *   diálogo (o fundo do corpo, o contorno fino e a faixa colorida do
 *   cabeçalho); quando ela chega, o diálogo toma o lugar dela, idêntico, e o
 *   conteúdo aparece de cima para baixo;
 * - abrindo sozinho (o pedido acabou de chegar): o diálogo sobe de baixo;
 * - fechando ou minimizando: o conteúdo some, o diálogo vira a casca (sem
 *   salto) e ela encolhe até o botão, terminando igual a ele; só então o
 *   modal sai da tela.
 * O véu escurece e clareia junto.
 */
export function ModalPedido(props: PropsModalPedido) {
	const { pedido } = props;
	const entrada = entradaDoPainel(props.registro, pedido.painel);
	const resumo = resumoDoPedido(props.registro, pedido);
	const Componente = entrada.componente;
	const pendente = pedido.estado === "pendente";
	const fechando = useRef(false);

	useLayoutEffect(() => {
		const dialogo = dialogoDoPedido();
		if (!dialogo || semMovimento()) return;
		const veu = dialogo.parentElement?.querySelector<HTMLElement>(".ap-scrim");
		const conteudo = conteudoDo(dialogo);
		let cancelado = false;
		const animacoes: Array<{ stop(): void }> = [];
		// Sem barra de rolagem enquanto abre (as molas de dentro passam um pouco do tamanho).
		dialogo.classList.add("modal-pedido--abrindo");
		const semBarra = setTimeout(() => dialogo.classList.remove("modal-pedido--abrindo"), ABRINDO_MS);
		// Escondidos já no primeiro quadro (a Motion só aplica o começo no quadro seguinte).
		for (const parte of conteudo) parte.style.opacity = "0";
		if (veu) {
			veu.style.opacity = "0";
			animacoes.push(animate(veu, { opacity: [0, 1] }, { duration: 0.24, ease: "easeOut" }));
		}
		const mostrarConteudo = (atraso = 0) =>
			conteudo.forEach((parte, indice) =>
				animacoes.push(animate(parte, { opacity: [0, 1], y: [6, 0] }, { duration: 0.22, ease: "easeOut", delay: atraso + indice * 0.04 })),
			);
		const botao = props.origem === "botao" ? botaoDoPedidoNaTela(pedido.id) : null;
		if (botao) {
			dialogo.style.visibility = "hidden";
			const casca = morfar(estadoDoElemento(botao), estadoDoDialogo(dialogo), true);
			void casca.pousou.then(() => {
				if (cancelado) return;
				// Fechou antes de a casca chegar: ela some e o diálogo continua escondido.
				if (fechando.current) return casca.cancelar();
				dialogo.style.visibility = "";
				casca.cancelar();
				mostrarConteudo();
				// Escondido, ele não recebia o foco do Modal: o foco vai para o primeiro campo agora.
				const campo = dialogo.querySelector<HTMLElement>(".ap-modal__body :is(input, textarea, select, button, [tabindex='0'])");
				(campo ?? dialogo).focus({ preventScroll: true });
			});
			return () => {
				cancelado = true;
				clearTimeout(semBarra);
				casca.cancelar();
				dialogo.style.visibility = "";
				for (const parte of conteudo) parte.style.opacity = "";
				for (const animacao of animacoes) animacao.stop();
			};
		}
		dialogo.style.opacity = "0";
		animacoes.push(animate(dialogo, { opacity: [0, 1], y: [40, 0], scale: [0.94, 1] }, { type: "spring", stiffness: 380, damping: 24, mass: 0.9 }));
		mostrarConteudo(0.06);
		return () => {
			cancelado = true;
			clearTimeout(semBarra);
			dialogo.style.opacity = "";
			for (const parte of conteudo) parte.style.opacity = "";
			for (const animacao of animacoes) animacao.stop();
		};
		// Só ao abrir.
	}, []);

	const fechar = () => {
		if (fechando.current) return;
		fechando.current = true;
		const dialogo = dialogoDoPedido();
		if (!dialogo || semMovimento()) return props.aoFechar();
		const veu = dialogo.parentElement?.querySelector<HTMLElement>(".ap-scrim");
		const botao = botaoDoPedidoNaTela(pedido.id);
		dialogo.classList.add("modal-pedido--abrindo");
		// 1. O conteúdo some, de baixo para cima; o fundo e a faixa do cabeçalho ficam.
		const conteudo = conteudoDo(dialogo).reverse();
		const sumir = conteudo.map((parte, indice) => animate(parte, { opacity: 0, y: -4 }, { duration: 0.12, ease: "easeIn", delay: indice * 0.03 }));
		void Promise.all(sumir.map((animacao) => animacao.then(() => undefined))).then(() => {
			if (veu) void animate(veu, { opacity: 0 }, { duration: 0.28, ease: "easeIn" });
			if (!botao) {
				void animate(dialogo, { opacity: 0, y: 24, scale: 0.95 }, { duration: 0.2, ease: "easeIn" }).then(() => props.aoFechar());
				return;
			}
			// 2. O diálogo vira a casca (idêntica, sem salto) e ela encolhe até o botão, terminando igual a ele.
			const casca = morfar(estadoDoDialogo(dialogo), estadoDoElemento(botao), false);
			dialogo.style.visibility = "hidden";
			void casca.pousou.then(() => {
				// 3. Pousou com a cara do botão: some devagar, revelando o texto dele.
				void animate(casca.elemento, { opacity: 0 }, { duration: 0.14, ease: "easeOut" }).then(() => casca.cancelar());
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
