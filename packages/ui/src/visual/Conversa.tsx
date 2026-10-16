// A conversa como documento (ESPECIFICACAO 13.11): uma coluna única em que
// cada resposta é um bloco numerado, cada mensagem do usuário é uma nota
// colada e cada ferramenta é uma linha técnica pequena entre eles.

import { Icon, pad2, StudentNote, Tag } from "@estudos/design-system";
import { AnimatePresence, animate, motion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
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

function StatusFerramenta({ chamada }: { chamada: ChamadaFerramenta }) {
	switch (chamada.status) {
		case "executando":
			return (
				<Tag tone="amber" size="sm" dot>
					Executando
				</Tag>
			);
		case "ok":
			return (
				<Tag tone="sage" size="sm" icon="check">
					Concluída
				</Tag>
			);
		case "erro":
			return (
				<Tag tone="brick" size="sm" icon="alert">
					Erro
				</Tag>
			);
		case "sem_resultado":
			return (
				<Tag tone="neutral" size="sm">
					Sem resultado
				</Tag>
			);
	}
}

export function LinhaFerramenta({ chamada, vivo = false }: { chamada: ChamadaFerramenta; vivo?: boolean }) {
	const argumentos = resumirArgumentos(chamada.argumentos);
	const linha = useRef<HTMLDivElement>(null);
	const statusAntes = useRef(chamada.status);
	// Erro ao vivo: um tremido curto.
	useEffect(() => {
		if (chamada.status === "erro" && statusAntes.current !== "erro" && linha.current) {
			void animate(linha.current, { x: [0, -7, 7, -5, 5, -2, 0] }, { duration: 0.45, ease: "easeOut" });
		}
		statusAntes.current = chamada.status;
	}, [chamada.status]);
	return (
		<div ref={linha} className={`ferramenta${chamada.idPai ? " ferramenta--filha" : ""}${vivo ? " ferramenta--viva" : ""}`}>
			<div className="ferramenta__linha">
				<Icon name="code" size={16} />
				<span className="ferramenta__nome data">{chamada.nome}</span>
				{argumentos ? <span className="ferramenta__args code">{argumentos}</span> : null}
				<span className="ferramenta__fim">
					{chamada.duracaoMs !== undefined ? (
						<span className="data">{decimal.format(chamada.duracaoMs / 1000)} s</span>
					) : null}
					{/* A troca de status dá um pulo; o visto se desenha (CSS, só ao vivo). */}
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={chamada.status}
							className={`ferramenta__status ferramenta__status--${chamada.status}`}
							initial={{ scale: 0.4, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
							transition={MOLA_VIVA}
						>
							<StatusFerramenta chamada={chamada} />
						</motion.span>
					</AnimatePresence>
				</span>
			</div>
			{chamada.status === "executando" && chamada.progresso ? (
				<p className="ferramenta__detalhe body-sm">
					<span className="ap-cursor" aria-hidden="true" /> {chamada.progresso}
				</p>
			) : null}
			{chamada.resumo ? <p className="ferramenta__detalhe body-sm">{chamada.resumo}</p> : null}
		</div>
	);
}

export type ItemAssistente = Extract<ItemConversa, { tipo: "assistente" }>;

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
				{item.texto ? <Markdown texto={item.texto} aparecendo={item.emAndamento} /> : null}
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
		voo.pousar(elemento);
		aoPousar?.();
		// Só ao nascer: o voo é da mensagem que acabou de chegar.
	}, []);
	return (
		<div ref={nota} className="nota-usuario">
			<StudentNote label="Você escreveu">
				<p className="nota__texto">{texto}</p>
			</StudentNote>
			<AvatarUsuario className="nota-usuario__avatar" />
		</div>
	);
}

/** Invólucro de cada item: os que chegam ao vivo entram subindo com mola. */
function Item({ chave, tipo, children }: { chave: string; tipo: string; children: ReactNode }) {
	return (
		<motion.div
			className={`documento__item documento__item--${tipo}`}
			initial={aoVivo(chave) ? { opacity: 0, y: 16, scale: 0.98 } : false}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={MOLA_ENTRADA}
		>
			{children}
		</motion.div>
	);
}

/** Coluna da conversa; rola até o fim quando chega algo novo. */
export function DocumentoConversa({ conversa, vazio, pedidoDaChamada, depois, autorDaResposta, voo, aoPousar }: PropsDocumentoConversa) {
	const fim = useRef<HTMLDivElement>(null);
	useEffect(() => {
		fim.current?.scrollIntoView({ block: "end" });
	}, [conversa]);

	let numero = 0;
	return (
		<div className="documento">
			{conversa.length === 0 ? vazio : null}
			{conversa.map((item) => {
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
					const botao = pedidoDaChamada?.(item.chamada.id);
					if (botao) {
						return (
							<Item key={item.chave} chave={item.chave} tipo="pedido">
								<div className="documento__pedido">{botao}</div>
							</Item>
						);
					}
					return (
						<Item key={item.chave} chave={item.chave} tipo="ferramenta">
							<LinhaFerramenta chamada={item.chamada} vivo={aoVivo(item.chave)} />
						</Item>
					);
				}
				if (semConteudo(item)) return null;
				numero += 1;
				const autor = autorDaResposta ? autorDaResposta(item) : item.agente ? <span className="bloco__nome body-strong">{item.agente}</span> : undefined;
				return (
					<Item key={item.chave} chave={item.chave} tipo="resposta">
						<BlocoResposta item={item} numero={numero} autor={autor} />
					</Item>
				);
			})}
			{depois}
			<div ref={fim} />
		</div>
	);
}
