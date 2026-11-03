// O relatório do método na visão do módulo concluído (docs/metodo-ciclo.md,
// "A tela"): uma seção no pé da última lição, onde ficava o "Concluir o
// módulo", com um link no índice. Um cartão como os da prática
// (modulo__cartao), com as fases do contrato (relatorio-tela.ts,
// faseDoRelatorio):
// - gerando: o professor em bolha (humor 3) e "O professor está lendo o seu
//   retorno…";
// - erro: a frase e "Tentar de novo" (o relatório anterior, se há, continua
//   embaixo);
// - pouco retorno: a frase e "Gerar mesmo assim";
// - nenhum (um módulo concluído antes desta parte): "Gerar o relatório do
//   método";
// - pronto: o resumo em Markdown, "O que funcionou" e "O que não funcionou"
//   (cada item com as evidências recolhidas embaixo; o clique leva ao bloco) e
//   as propostas, uma por cartão: a etiqueta do arquivo, o ajuste em destaque,
//   o porquê, as evidências e "Aprovar", "Editar e aprovar" e "Rejeitar". Uma
//   proposta decidida mostra a decisão e o texto final, sem os botões.
//
// Sem mudança otimista: quem decide é a extensão (a ponte, useModulos). A
// seção só desenha o que a mensagem modulo trouxe.

import { Button, Callout, Icon, Prose, Tag, TextArea } from "@estudos/design-system";
import { Markdown } from "@estudos/ui";
import { type ReactNode, useId, useState } from "react";
import { evidenciasDe, type EvidenciaNaTela, type ItemRelatorio, NOMES_ARQUIVO_METODO, type PropostaRelatorio, type RelatorioMetodo } from "../../lib/metodo-ciclo-tipos.ts";
import type { ErroVistoModulo } from "./modulos-ponte.ts";
import { ProfessorBolha } from "./ProfessorBolha.tsx";
import {
	aprovacaoDireta,
	aprovacaoEditada,
	conteudoDoRelatorio,
	contagemDasPropostas,
	type DadosDaDecisao,
	destinoDaEvidencia,
	type DestinoDaEvidencia,
	faseDoRelatorio,
	foiEditada,
	ID_RELATORIO,
	LIMITE_DO_AJUSTE,
	LIMITE_DO_MOTIVO,
	linhaDoPoucoRetorno,
	pendentesDoRelatorio,
	problemaDoTextoEditado,
	rejeicao,
	ROTULO_APROVAR,
	ROTULO_EDITAR_E_APROVAR,
	ROTULO_GERAR,
	ROTULO_GERAR_MESMO_ASSIM,
	ROTULO_MOTIVO,
	ROTULO_REJEITAR,
	ROTULO_TENTAR_DE_NOVO,
	ROTULO_TEXTO_DO_AJUSTE,
	rotuloDaDecisao,
	TEXTO_GERANDO,
	TEXTO_POUCO_RETORNO,
	TEXTO_SEM_PROPOSTAS,
	TEXTO_SEM_RELATORIO,
	textoDaProposta,
	TITULO_FUNCIONOU,
	TITULO_PROBLEMAS,
	TITULO_PROPOSTAS,
	TITULO_RELATORIO,
} from "./relatorio-tela.ts";

/** O que a seção recebe da ponte (TelaModulo.tsx). */
export interface AcoesRelatorio {
	/** O módulo (o id), para o destino das evidências. */
	modulo: string;
	/** O relatório gravado; null: não há (ou ainda não foi gerado, ou o arquivo não se lê). */
	relatorio: RelatorioMetodo | null;
	/** O relatório está sendo gerado agora. */
	gerando: boolean;
	/** A frase da última geração que falhou, ou do arquivo que não se lê. */
	erro?: string;
	/** Os erros de decidir cada proposta, pelo id dela. */
	erros: Readonly<Record<string, ErroVistoModulo>>;
	/** Gera o relatório (com forcar, mesmo com pouco retorno); resolve quando a extensão aceitou, rejeita com a frase do erro. */
	gerar(forcar?: boolean): Promise<unknown>;
	/** Aprova ou rejeita uma proposta; resolve quando o relatório com a decisão chegou, rejeita com a frase do erro. */
	decidir(proposta: string, decisao: DadosDaDecisao): Promise<unknown>;
	/** Leva ao bloco (ou à lição) de uma evidência. */
	ir(destino: DestinoDaEvidencia): void;
}

const mensagemDe = (falha: unknown) => (falha instanceof Error ? falha.message : String(falha));

export function RelatorioMetodo({ acoes }: { acoes: AcoesRelatorio }) {
	const { relatorio } = acoes;
	const titulo = useId();
	const [pedindo, setPedindo] = useState(false);
	// O erro de um pedido que a extensão recusou antes de começar (a ponte manda erro com o pedido).
	const [erroDoPedido, setErroDoPedido] = useState<string | undefined>(undefined);
	const fase = faseDoRelatorio({ relatorio, gerando: acoes.gerando, erro: erroDoPedido ?? acoes.erro });
	const conteudo = conteudoDoRelatorio(relatorio);

	const gerar = (forcar: boolean) => {
		if (pedindo) return;
		setPedindo(true);
		setErroDoPedido(undefined);
		acoes
			.gerar(forcar)
			.catch((falha: unknown) => setErroDoPedido(mensagemDe(falha)))
			.finally(() => setPedindo(false));
	};

	let corpo: ReactNode = null;
	if (fase === "gerando") {
		corpo = (
			<div className="relatorio__gerando" role="status" aria-live="polite">
				<ProfessorBolha valor={3} tamanho={96} className="relatorio__bolha" />
				<p className="body relatorio__gerando-texto">{TEXTO_GERANDO}</p>
			</div>
		);
	} else if (fase === "nenhum") {
		corpo = (
			<div className="relatorio__vazio">
				<p className="body relatorio__texto">{TEXTO_SEM_RELATORIO}</p>
				<div className="relatorio__acoes">
					<Button variant="primary" icon="bulb" onClick={() => gerar(false)} disabled={pedindo} aria-busy={pedindo}>
						{ROTULO_GERAR}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<section id={ID_RELATORIO} className="modulo__cartao relatorio" aria-labelledby={titulo}>
			<header className="relatorio__cabeca">
				<h3 id={titulo} className="heading relatorio__titulo">
					{TITULO_RELATORIO}
				</h3>
				{fase !== "gerando" && conteudo === "pronto" && relatorio ? <p className="data relatorio__contagem">{contagemDasPropostas(relatorio)}</p> : null}
			</header>
			{fase === "erro" ? (
				<div className="relatorio__erro">
					<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
						<p>{erroDoPedido ?? acoes.erro}</p>
						<div className="relatorio__acoes">
							<Button variant="secondary" size="sm" icon="refresh" onClick={() => gerar(false)} disabled={pedindo} aria-busy={pedindo}>
								{ROTULO_TENTAR_DE_NOVO}
							</Button>
						</div>
					</Callout>
				</div>
			) : null}
			{corpo}
			{fase !== "gerando" && fase !== "nenhum" && relatorio && conteudo === "pouco_retorno" ? (
				<div className="relatorio__vazio">
					<p className="body relatorio__texto">{TEXTO_POUCO_RETORNO}</p>
					<p className="data relatorio__dados">{linhaDoPoucoRetorno(relatorio.retornos)}</p>
					<div className="relatorio__acoes">
						<Button variant="secondary" icon="refresh" onClick={() => gerar(true)} disabled={pedindo} aria-busy={pedindo}>
							{ROTULO_GERAR_MESMO_ASSIM}
						</Button>
					</div>
				</div>
			) : null}
			{fase !== "gerando" && fase !== "nenhum" && relatorio && conteudo === "pronto" ? <RelatorioPronto acoes={acoes} relatorio={relatorio} /> : null}
		</section>
	);
}

/** O resumo, o que funcionou, o que não funcionou e as propostas. */
function RelatorioPronto({ acoes, relatorio }: { acoes: AcoesRelatorio; relatorio: RelatorioMetodo }) {
	return (
		<div className="relatorio__pronto">
			{relatorio.resumo.trim() ? (
				<Prose size="md" className="relatorio__resumo">
					<Markdown texto={relatorio.resumo} />
				</Prose>
			) : null}
			<ListaDeItens titulo={TITULO_FUNCIONOU} itens={relatorio.funcionou} relatorio={relatorio} acoes={acoes} tom="funcionou" />
			<ListaDeItens titulo={TITULO_PROBLEMAS} itens={relatorio.problemas} relatorio={relatorio} acoes={acoes} tom="problemas" />
			<div className="relatorio__bloco">
				<div className="relatorio__bloco-cabeca">
					<h4 className="overline relatorio__subtitulo">{TITULO_PROPOSTAS}</h4>
					{pendentesDoRelatorio(relatorio) > 0 ? (
						<Tag size="sm" tone="amber" icon="checklist">
							{pendentesDoRelatorio(relatorio)} para decidir
						</Tag>
					) : null}
				</div>
				{relatorio.propostas.length === 0 ? (
					<p className="body relatorio__texto">{TEXTO_SEM_PROPOSTAS}</p>
				) : (
					<ol className="relatorio__propostas">
						{relatorio.propostas.map((proposta) => (
							<li key={proposta.id}>
								<CartaoDaProposta
									proposta={proposta}
									evidencias={evidenciasDe(relatorio, proposta.evidencias)}
									acoes={acoes}
									{...(acoes.erros[proposta.id] ? { erro: acoes.erros[proposta.id]!.mensagem } : {})}
								/>
							</li>
						))}
					</ol>
				)}
			</div>
		</div>
	);
}

/** "O que funcionou" ou "O que não funcionou": cada item com as evidências recolhidas embaixo. */
function ListaDeItens(props: { titulo: string; itens: readonly ItemRelatorio[]; relatorio: RelatorioMetodo; acoes: AcoesRelatorio; tom: "funcionou" | "problemas" }) {
	if (props.itens.length === 0) return null;
	return (
		<div className="relatorio__bloco">
			<h4 className="overline relatorio__subtitulo">{props.titulo}</h4>
			<ul className={`relatorio__itens relatorio__itens--${props.tom}`}>
				{props.itens.map((item, indice) => (
					<li key={indice} className="relatorio__item">
						<p className="body relatorio__item-texto">{item.texto}</p>
						<Evidencias evidencias={evidenciasDe(props.relatorio, item.evidencias)} acoes={props.acoes} />
					</li>
				))}
			</ul>
		</div>
	);
}

/** As linhas curtas dos eventos; a que sabe onde fica leva ao bloco ao clicar. */
function Evidencias({ evidencias, acoes }: { evidencias: readonly EvidenciaNaTela[]; acoes: AcoesRelatorio }) {
	if (evidencias.length === 0) return null;
	return (
		<ul className="relatorio__evidencias" aria-label="Eventos que sustentam">
			{evidencias.map((evidencia) => {
				const destino = destinoDaEvidencia(evidencia, acoes.modulo);
				return (
					<li key={evidencia.id}>
						{destino ? (
							<button type="button" className="body-sm relatorio__evidencia" onClick={() => acoes.ir(destino)} title={destino.tipo === "bloco" ? "Ir ao bloco" : "Ir à lição"}>
								<span className="relatorio__evidencia-linha">{evidencia.linha}</span>
								<Icon name="arrow-up-right" size={14} strokeWidth={2.25} />
							</button>
						) : (
							<span className="body-sm relatorio__evidencia relatorio__evidencia--solta">
								<span className="relatorio__evidencia-linha">{evidencia.linha}</span>
							</span>
						)}
					</li>
				);
			})}
		</ul>
	);
}

type Modo = "ver" | "editar" | "rejeitar";

/** Uma proposta: a etiqueta do arquivo, o ajuste em destaque, o porquê, as evidências e os botões (ou a decisão). */
function CartaoDaProposta(props: { proposta: PropostaRelatorio; evidencias: readonly EvidenciaNaTela[]; acoes: AcoesRelatorio; erro?: string }) {
	const { proposta, acoes } = props;
	const id = useId();
	const [modo, setModo] = useState<Modo>("ver");
	const [texto, setTexto] = useState(proposta.ajuste);
	const [motivo, setMotivo] = useState("");
	const [ocupada, setOcupada] = useState(false);
	const decisao = proposta.decisao;
	const problema = modo === "editar" && texto.trim() ? problemaDoTextoEditado(texto) : undefined;
	const semTexto = modo === "editar" && !texto.trim();

	const decidir = (dados: DadosDaDecisao) => {
		if (ocupada) return;
		setOcupada(true);
		// O erro volta pela ponte (acoes.erros) e aparece embaixo; com a decisão gravada, a proposta passa a mostrá-la.
		acoes
			.decidir(proposta.id, dados)
			.catch(() => undefined)
			.finally(() => setOcupada(false));
	};
	const fechar = () => {
		setModo("ver");
		setTexto(proposta.ajuste);
		setMotivo("");
	};

	return (
		<article className={`relatorio__proposta${decisao ? ` relatorio__proposta--${decisao.tipo}` : ""}`} aria-labelledby={id} aria-busy={ocupada || undefined}>
			<header className="relatorio__proposta-cabeca">
				<Tag size="sm" tone="steel" icon="file">
					{NOMES_ARQUIVO_METODO[proposta.arquivo]}
				</Tag>
				{decisao ? (
					<Tag size="sm" tone={decisao.tipo === "aprovada" ? "sage" : "brick"} icon={decisao.tipo === "aprovada" ? "check" : "close"}>
						{rotuloDaDecisao(decisao)}
					</Tag>
				) : null}
			</header>
			<p id={id} className="body-strong relatorio__ajuste">
				{textoDaProposta(proposta)}
			</p>
			{foiEditada(proposta) ? (
				<p className="body-sm relatorio__original">
					<span className="overline">Texto proposto</span> {proposta.ajuste}
				</p>
			) : null}
			<p className="body-sm relatorio__porque">
				<span className="overline">Por quê</span> {proposta.porque}
			</p>
			<Evidencias evidencias={props.evidencias} acoes={acoes} />
			{decisao ? (
				decisao.tipo === "rejeitada" && decisao.motivo ? (
					<p className="body-sm relatorio__motivo">
						<span className="overline">Motivo</span> {decisao.motivo}
					</p>
				) : null
			) : modo === "ver" ? (
				<div className="relatorio__botoes">
					<Button variant="secondary" size="sm" icon="check" onClick={() => decidir(aprovacaoDireta())} disabled={ocupada}>
						{ROTULO_APROVAR}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setModo("editar")} disabled={ocupada}>
						{ROTULO_EDITAR_E_APROVAR}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setModo("rejeitar")} disabled={ocupada}>
						{ROTULO_REJEITAR}
					</Button>
				</div>
			) : modo === "editar" ? (
				<div className="relatorio__edicao">
					<TextArea
						label={ROTULO_TEXTO_DO_AJUSTE}
						rows={4}
						maxLength={LIMITE_DO_AJUSTE}
						value={texto}
						disabled={ocupada}
						onChange={(evento) => setTexto(evento.target.value)}
						{...(problema ? { error: problema } : {})}
					/>
					<div className="relatorio__botoes">
						<Button variant="secondary" size="sm" icon="check" onClick={() => decidir(aprovacaoEditada(proposta, texto))} disabled={ocupada || semTexto || Boolean(problema)} aria-busy={ocupada}>
							Aprovar com este texto
						</Button>
						<Button variant="ghost" size="sm" onClick={fechar} disabled={ocupada}>
							Cancelar
						</Button>
					</div>
				</div>
			) : (
				<div className="relatorio__edicao">
					<TextArea label={ROTULO_MOTIVO} rows={2} maxLength={LIMITE_DO_MOTIVO} value={motivo} disabled={ocupada} onChange={(evento) => setMotivo(evento.target.value)} />
					<div className="relatorio__botoes">
						<Button variant="secondary" size="sm" onClick={() => decidir(rejeicao(motivo))} disabled={ocupada} aria-busy={ocupada}>
							{ROTULO_REJEITAR}
						</Button>
						<Button variant="ghost" size="sm" onClick={fechar} disabled={ocupada}>
							Cancelar
						</Button>
					</div>
				</div>
			)}
			{props.erro && !ocupada ? <p className="body-sm cursos__erro relatorio__proposta-erro">{props.erro}</p> : null}
		</article>
	);
}
