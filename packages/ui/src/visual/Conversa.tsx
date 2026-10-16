// A conversa como documento (ESPECIFICACAO 13.11): uma coluna única em que
// cada resposta é um bloco numerado, cada mensagem do usuário é uma nota
// colada e cada ferramenta é uma linha técnica pequena entre eles.

import { Icon, pad2, StudentNote, Tag } from "@estudos/design-system";
import { type ReactNode, useEffect, useRef } from "react";
import type { ChamadaFerramenta, ItemConversa } from "../estado-janela.ts";
import { InfoResposta } from "./InfoResposta.tsx";
import { Markdown } from "./Markdown.tsx";

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

export function LinhaFerramenta({ chamada }: { chamada: ChamadaFerramenta }) {
	const argumentos = resumirArgumentos(chamada.argumentos);
	return (
		<div className={`ferramenta${chamada.idPai ? " ferramenta--filha" : ""}`}>
			<div className="ferramenta__linha">
				<Icon name="code" size={16} />
				<span className="ferramenta__nome data">{chamada.nome}</span>
				{argumentos ? <span className="ferramenta__args code">{argumentos}</span> : null}
				<span className="ferramenta__fim">
					{chamada.duracaoMs !== undefined ? (
						<span className="data">{decimal.format(chamada.duracaoMs / 1000)} s</span>
					) : null}
					<StatusFerramenta chamada={chamada} />
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
				{item.texto ? <Markdown texto={item.texto} /> : null}
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
}

/** Coluna da conversa; rola até o fim quando chega algo novo. */
export function DocumentoConversa({ conversa, vazio, pedidoDaChamada, depois, autorDaResposta }: PropsDocumentoConversa) {
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
					return (
						<StudentNote key={item.chave} label="Você escreveu">
							<p className="nota__texto">{item.texto}</p>
						</StudentNote>
					);
				}
				if (item.tipo === "ferramenta") {
					const botao = pedidoDaChamada?.(item.chamada.id);
					if (botao) return <div key={item.chave} className="documento__pedido">{botao}</div>;
					return <LinhaFerramenta key={item.chave} chamada={item.chamada} />;
				}
				if (semConteudo(item)) return null;
				numero += 1;
				const autor = autorDaResposta ? autorDaResposta(item) : item.agente ? <span className="bloco__nome body-strong">{item.agente}</span> : undefined;
				return <BlocoResposta key={item.chave} item={item} numero={numero} autor={autor} />;
			})}
			{depois}
			<div ref={fim} />
		</div>
	);
}
