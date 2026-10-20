// A conversa como documento (ESPECIFICACAO 13.11): uma coluna única em que
// cada resposta é um bloco numerado, cada mensagem do usuário é uma nota
// colada e as chamadas de ferramenta seguidas viram um grupo fechado
// ("Executou 2 comandos ›") que abre a lista e os detalhes de cada uma.

import { Icon, pad2, StudentNote, Tag } from "@estudos/design-system";
import { AnimatePresence, animate, motion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChamadaFerramenta, ItemConversa } from "../estado-janela.ts";
import { AvatarUsuario } from "./Avatares.tsx";
import { InfoResposta } from "./InfoResposta.tsx";
import { Markdown } from "./Markdown.tsx";
import type { Voo } from "./movimento.ts";

/** Itens do histórico (chave "h…") já estavam lá: só os que chegam ao vivo entram animados. */
const aoVivo = (chave: string) => !chave.startsWith("h");
const MOLA_ENTRADA = { type: "spring", stiffness: 380, damping: 26, mass: 0.8 } as const;
const MOLA_VIVA = { type: "spring", stiffness: 620, damping: 15 } as const;

const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Argumentos em uma linha, cortados. */
export function resumirArgumentos(argumentos: unknown, limite = 160): string {
	if (argumentos === undefined) return "";
	let texto: string;
	try {
		texto = JSON.stringify(argumentos) ?? "";
	} catch {
		texto = String(argumentos);
	}
	return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

/** Os argumentos inteiros, legíveis (JSON com recuo), para os detalhes de uma chamada. */
export function argumentosLegiveis(argumentos: unknown, limite = 4000): string {
	if (argumentos === undefined) return "";
	let texto: string;
	try {
		texto = JSON.stringify(argumentos, null, 2) ?? "";
	} catch {
		texto = String(argumentos);
	}
	return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

const ROTULO_STATUS: Record<ChamadaFerramenta["status"], string> = {
	executando: "Executando",
	ok: "Concluída",
	erro: "Erro",
	sem_resultado: "Sem resultado",
};

/** O sinal pequeno do status: ponto âmbar pulsando, visto, alerta ou traço. */
function SinalStatus({ chamada }: { chamada: ChamadaFerramenta }) {
	return (
		// A troca de status dá um pulo; o visto se desenha (CSS, só ao vivo).
		<AnimatePresence mode="popLayout" initial={false}>
			<motion.span
				key={chamada.status}
				className={`ferramenta__status ferramenta__status--${chamada.status}`}
				role="img"
				aria-label={ROTULO_STATUS[chamada.status]}
				title={ROTULO_STATUS[chamada.status]}
				initial={{ scale: 0.4, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
				transition={MOLA_VIVA}
			>
				{chamada.status === "ok" ? (
					<Icon name="check" size={14} strokeWidth={2.75} />
				) : chamada.status === "erro" ? (
					<Icon name="alert" size={14} strokeWidth={2.5} />
				) : chamada.status === "executando" ? (
					<span className="ferramenta__ponto" aria-hidden="true" />
				) : (
					<span aria-hidden="true">–</span>
				)}
			</motion.span>
		</AnimatePresence>
	);
}

/**
 * Uma chamada dentro do grupo aberto: o nome, os argumentos numa linha, a
 * duração e o status. Clicando, abre os detalhes: os argumentos inteiros e o
 * resultado (ou o progresso, enquanto roda).
 */
export function LinhaFerramenta({ chamada, vivo = false }: { chamada: ChamadaFerramenta; vivo?: boolean }) {
	const argumentos = resumirArgumentos(chamada.argumentos);
	const [aberta, setAberta] = useState(false);
	const linha = useRef<HTMLDivElement>(null);
	const statusAntes = useRef(chamada.status);
	// Erro ao vivo: um tremido curto.
	useEffect(() => {
		if (chamada.status === "erro" && statusAntes.current !== "erro" && linha.current) {
			void animate(linha.current, { x: [0, -7, 7, -5, 5, -2, 0] }, { duration: 0.45, ease: "easeOut" });
		}
		statusAntes.current = chamada.status;
	}, [chamada.status]);
	const completos = argumentosLegiveis(chamada.argumentos);
	return (
		<div
			ref={linha}
			className={`ferramenta${chamada.idPai ? " ferramenta--filha" : ""}${vivo ? " ferramenta--viva" : ""}${aberta ? " ferramenta--aberta" : ""}`}
		>
			<button type="button" className="ferramenta__linha" aria-expanded={aberta} onClick={() => setAberta((valor) => !valor)}>
				<Icon name="chevron-right" size={14} strokeWidth={2.5} className="ferramenta__seta" />
				<span className="ferramenta__nome data">{chamada.nome}</span>
				{argumentos ? <span className="ferramenta__args code">{argumentos}</span> : <span className="ferramenta__args" />}
				<span className="ferramenta__fim">
					{chamada.duracaoMs !== undefined ? <span className="data">{decimal.format(chamada.duracaoMs / 1000)} s</span> : null}
					<SinalStatus chamada={chamada} />
				</span>
			</button>
			<AnimatePresence initial={false}>
				{aberta ? (
					<motion.div
						className="ferramenta__detalhes"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ type: "spring", stiffness: 420, damping: 36 }}
					>
						{completos ? (
							<div className="ferramenta__parte">
								<span className="overline">Argumentos</span>
								<pre className="ferramenta__codigo code">{completos}</pre>
							</div>
						) : null}
						{chamada.status === "executando" && chamada.progresso ? (
							<div className="ferramenta__parte">
								<span className="overline">Andamento</span>
								<p className="body-sm ferramenta__texto">{chamada.progresso}</p>
							</div>
						) : null}
						{chamada.resumo ? (
							<div className="ferramenta__parte">
								<span className="overline">{chamada.status === "erro" ? "Erro" : "Resultado"}</span>
								<p className="body-sm ferramenta__texto">{chamada.resumo}</p>
							</div>
						) : null}
						{!completos && !chamada.resumo && !(chamada.status === "executando" && chamada.progresso) ? (
							<p className="body-sm ferramenta__texto">Sem detalhes.</p>
						) : null}
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/** "Executou 1 comando", "Executou 3 comandos" ou, enquanto roda, "Executando ler_nota…". */
export function rotuloGrupo(chamadas: readonly ChamadaFerramenta[]): { texto: string; erros: number } {
	const erros = chamadas.filter((chamada) => chamada.status === "erro").length;
	const rodando = [...chamadas].reverse().find((chamada) => chamada.status === "executando");
	if (rodando) return { texto: `Executando ${rodando.nome}…`, erros };
	const quantas = chamadas.length;
	return { texto: `Executou ${quantas} ${quantas === 1 ? "comando" : "comandos"}`, erros };
}

/**
 * Chamadas seguidas de ferramentas viram um grupo fechado, como no Claude:
 * "Executou 2 comandos ›". Clicando, abre a lista das chamadas. Enquanto uma
 * roda, o resumo diz qual.
 */
function GrupoFerramentas({ chamadas, vivo }: { chamadas: ChamadaFerramenta[]; vivo: boolean }) {
	const [aberto, setAberto] = useState(false);
	const { texto, erros } = rotuloGrupo(chamadas);
	const rodando = chamadas.some((chamada) => chamada.status === "executando");
	return (
		<div className={`ferramentas${aberto ? " ferramentas--aberto" : ""}`}>
			<button type="button" className="ferramentas__resumo" aria-expanded={aberto} onClick={() => setAberto((valor) => !valor)}>
				{rodando ? <span className="ferramenta__ponto" aria-hidden="true" /> : <Icon name="code" size={14} strokeWidth={2.5} />}
				<span className="body-sm ferramentas__texto">{texto}</span>
				{erros > 0 ? (
					<Tag tone="brick" size="sm" icon="alert">
						{erros === 1 ? "1 com erro" : `${erros} com erro`}
					</Tag>
				) : null}
				<Icon name="chevron-right" size={14} strokeWidth={2.5} className="ferramentas__seta" />
			</button>
			<AnimatePresence initial={false}>
				{aberto ? (
					<motion.div
						className="ferramentas__lista"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ type: "spring", stiffness: 420, damping: 36 }}
					>
						{chamadas.map((chamada) => (
							<LinhaFerramenta key={chamada.id} chamada={chamada} vivo={vivo} />
						))}
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/** Um trecho da conversa já agrupado: um item sozinho ou um grupo de chamadas seguidas. */
export type TrechoConversa = { tipo: "item"; item: ItemConversa } | { tipo: "ferramentas"; chave: string; chamadas: ChamadaFerramenta[] };

/**
 * Junta as chamadas de ferramenta seguidas num grupo. Uma resposta que só
 * chamou ferramentas (sem texto) não aparece e não separa o grupo; uma
 * mensagem, uma resposta com texto ou uma chamada que virou botão de pedido
 * (`viraPedido`) separa.
 */
export function agruparConversa(conversa: readonly ItemConversa[], viraPedido: (id: string) => boolean = () => false): TrechoConversa[] {
	const trechos: TrechoConversa[] = [];
	let grupo: Extract<TrechoConversa, { tipo: "ferramentas" }> | undefined;
	for (const item of conversa) {
		if (item.tipo === "ferramenta" && !viraPedido(item.chamada.id)) {
			if (!grupo) {
				grupo = { tipo: "ferramentas", chave: item.chave, chamadas: [] };
				trechos.push(grupo);
			}
			grupo.chamadas.push(item.chamada);
			continue;
		}
		if (item.tipo === "assistente" && semConteudo(item)) continue;
		grupo = undefined;
		trechos.push({ tipo: "item", item });
	}
	return trechos;
}

export type ItemAssistente = Extract<ItemConversa, { tipo: "assistente" }>;

/** true se a última coisa da conversa é uma resposta que está chegando (ela já mostra o agente). */
function respostaChegando(conversa: ItemConversa[]): boolean {
	const ultimo = conversa.at(-1);
	return ultimo?.tipo === "assistente" && ultimo.emAndamento;
}

/** Mensagem do assistente que só chamou ferramentas: não vira bloco. */
function semConteudo(item: ItemAssistente): boolean {
	return !item.emAndamento && !item.texto && !item.raciocinio && !item.erro;
}

/**
 * Uma resposta: o número e o botão de informações na margem, o autor em cima
 * (a foto e o nome do agente) e o texto. Sem etiqueta: é óbvio que é uma
 * resposta; tipos diferentes (Explicação, Exemplo…) virão com etiqueta.
 */
function BlocoResposta({ item, numero, autor }: { item: ItemAssistente; numero: number; autor?: ReactNode }) {
	return (
		<section className={`ap-block bloco${item.emAndamento ? " ap-block--writing" : ""}`} aria-busy={item.emAndamento || undefined}>
			<span className="bloco__margem">
				<span className="data" aria-hidden="true">
					{pad2(numero)}
				</span>
				<InfoResposta item={item} numero={numero} />
			</span>
			{autor ? <header className="bloco__autor">{autor}</header> : null}
			<div className="ap-block__body ap-prose lesson-body">
				{item.raciocinio ? (
					<details className="bloco__raciocinio" open={item.emAndamento && !item.texto}>
						<summary className="overline">Raciocínio</summary>
						<p className="body-sm">{item.raciocinio}</p>
					</details>
				) : null}
				{item.texto ? <Markdown texto={item.texto} aparecendo={aoVivo(item.chave)} /> : null}
				{item.erro ? (
					<div className="aviso-erro" role="alert">
						<span className="overline">Erro do modelo</span>
						<p className="body">{item.erro}</p>
					</div>
				) : null}
			</div>
		</section>
	);
}

/**
 * O lugar da próxima resposta, enquanto o agente pensa, pesquisa ou pergunta e
 * ainda não há texto: o número e o cabeçalho (a foto animada) exatamente onde
 * o bloco da resposta vai começar. Quando o texto chega, o bloco real entra no
 * mesmo lugar, com o mesmo cabeçalho.
 */
function BlocoEsperando({ numero, autor }: { numero: number; autor: ReactNode }) {
	return (
		<section className="ap-block bloco bloco--esperando" aria-busy="true">
			<span className="bloco__margem">
				<span className="data" aria-hidden="true">
					{pad2(numero)}
				</span>
			</span>
			<header className="bloco__autor">{autor}</header>
		</section>
	);
}

export interface PropsDocumentoConversa {
	conversa: ItemConversa[];
	/** O que mostrar sem nenhum item (normalmente um EmptyState). */
	vazio?: ReactNode;
	/**
	 * O botão do pedido feito pela chamada de ferramenta `id`, se houver: ele
	 * entra no lugar da linha da ferramenta (Pedidos.tsx).
	 */
	pedidoDaChamada?(id: string): ReactNode | undefined;
	/** Depois do último item (por exemplo, pedidos sem chamada na conversa). */
	depois?: ReactNode;
	/** O cabeçalho de cada resposta (a foto e o nome do agente). Sem ele, só o nome do agente. */
	autorDaResposta?(item: ItemAssistente): ReactNode;
	/**
	 * O cabeçalho do agente trabalhando (a foto animada e o que ele faz), para o
	 * lugar da próxima resposta enquanto ainda não há texto. Sem ele, nada.
	 */
	aguardando?: ReactNode;
	/** A mensagem enviada voando do campo (movimento.ts): pousa na nota com o mesmo texto. */
	voo?: Voo;
	/** O voo pousou (ou não tinha para onde ir). */
	aoPousar?(): void;
}

/** A sua mensagem: a nota creme com a sua foto. Se ela acabou de ser enviada, o voo pousa nela. */
function NotaUsuario({ texto, voo, aoPousar }: { texto: string; voo?: Voo; aoPousar?(): void }) {
	const nota = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const elemento = nota.current?.querySelector<HTMLElement>(".ap-note");
		if (!voo || voo.texto.trim() !== texto.trim() || !elemento) return;
		elemento.style.opacity = "0";
		// A conversa ainda vai rolar até o fim (efeito do DocumentoConversa, depois deste):
		// o pouso espera dois quadros para medir a nota já no lugar final.
		let quadro = requestAnimationFrame(() => {
			quadro = requestAnimationFrame(() => {
				voo.pousar(elemento);
				aoPousar?.();
			});
		});
		return () => cancelAnimationFrame(quadro);
		// Só ao nascer: o voo é da mensagem que acabou de chegar.
	}, []);
	return (
		<div ref={nota} className="nota-usuario">
			<StudentNote label="" aria-label="Sua mensagem">
				<p className="nota__texto">{texto}</p>
			</StudentNote>
			<AvatarUsuario className="nota-usuario__avatar" />
		</div>
	);
}

/** Invólucro de cada item: os que chegam ao vivo entram subindo com mola. */
function Item({ chave, tipo, children, entrar = true }: { chave: string; tipo: string; children: ReactNode; entrar?: boolean }) {
	return (
		<motion.div
			className={`documento__item documento__item--${tipo}`}
			initial={entrar && aoVivo(chave) ? { opacity: 0, y: 16, scale: 0.98 } : false}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={MOLA_ENTRADA}
		>
			{children}
		</motion.div>
	);
}

/** Coluna da conversa; rola até o fim quando chega algo novo. */
export function DocumentoConversa({ conversa, vazio, pedidoDaChamada, depois, autorDaResposta, aguardando, voo, aoPousar }: PropsDocumentoConversa) {
	const fim = useRef<HTMLDivElement>(null);
	useEffect(() => {
		fim.current?.scrollIntoView({ block: "end" });
	}, [conversa]);

	let numero = 0;
	return (
		<div className="documento">
			{conversa.length === 0 ? vazio : null}
			{agruparConversa(conversa, (id) => Boolean(pedidoDaChamada?.(id))).map((trecho) => {
				if (trecho.tipo === "ferramentas") {
					return (
						<Item key={trecho.chave} chave={trecho.chave} tipo="ferramentas">
							<GrupoFerramentas chamadas={trecho.chamadas} vivo={aoVivo(trecho.chave)} />
						</Item>
					);
				}
				const { item } = trecho;
				if (item.tipo === "usuario") {
					// A nota não entra subindo: quem traz ela é o voo (ou ela já estava lá).
					return (
						<div key={item.chave} className="documento__item documento__item--usuario">
							<NotaUsuario
								texto={item.texto}
								{...(voo && aoVivo(item.chave) ? { voo } : {})}
								{...(aoPousar ? { aoPousar } : {})}
							/>
						</div>
					);
				}
				if (item.tipo === "ferramenta") {
					// Só chega aqui a chamada que virou botão de pedido (agruparConversa).
					return (
						<Item key={item.chave} chave={item.chave} tipo="pedido">
							<div className="documento__pedido">{pedidoDaChamada?.(item.chamada.id)}</div>
						</Item>
					);
				}
				numero += 1;
				const autor = autorDaResposta ? autorDaResposta(item) : item.agente ? <span className="bloco__nome body-strong">{item.agente}</span> : undefined;
				return (
					// Sem entrada: o bloco esperando já estava neste lugar, com o mesmo cabeçalho.
					<Item key={item.chave} chave={item.chave} tipo="resposta" entrar={false}>
						<BlocoResposta item={item} numero={numero} autor={autor} />
					</Item>
				);
			})}
			{aguardando && !respostaChegando(conversa) ? (
				<Item chave={`esperando-${numero + 1}`} tipo="resposta">
					<BlocoEsperando numero={numero + 1} autor={aguardando} />
				</Item>
			) : null}
			{depois}
			<div ref={fim} />
		</div>
	);
}
