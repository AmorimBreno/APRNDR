// O relatório do método na visão do módulo concluído (docs/metodo-experimentos.md,
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
// - pronto, versão 2 (a análise dos experimentos), nesta ordem: o erro de
//   aplicar, se houve; o resumo em Markdown; "Placar do módulo" (uma tabela
//   curta: métrica, este módulo e a média dos anteriores, com o n em texto
//   pequeno); "Experimentos" (um cartão por experimento que estava em teste,
//   com a decisão da análise em destaque); "Novos experimentos" (as propostas
//   que entraram, "Começa no próximo módulo"); "Ficou para depois" (as de
//   fora pelo limite, só para ler); "O que facilita" (os aprendizados novos e
//   as revisões); e "O que funcionou" e "O que não funcionou" (cada item com
//   as evidências recolhidas embaixo; o clique leva ao bloco). Seção vazia não
//   aparece;
// - pronto, versão 1: o resumo, o que funcionou, o que não funcionou e as
//   propostas, uma por cartão, com a decisão que o Breno gravou (se houver) e
//   sem botões.
//
// Não há botão de decisão: a análise decide sozinha, e a seção só desenha o
// que a mensagem modulo trouxe (a ponte, useModulos).

import { Button, Callout, Icon, Prose, Tag } from "@estudos/design-system";
import { Markdown } from "@estudos/ui";
import { type ReactNode, useId, useState } from "react";
import type { ExperimentoDecidido, PropostaAplicada, PropostaParaDepois, RelatorioMetodoV2, RevisaoDeAprendizado, AprendizadoRegistrado } from "../../lib/metodo-analise-tipos.ts";
import {
	evidenciasDe,
	type EvidenciaNaTela,
	type ItemRelatorio,
	NOMES_ARQUIVO_METODO,
	type PropostaRelatorio,
	type RelatorioMetodo,
	type RelatorioMetodoV1,
} from "../../lib/metodo-ciclo-tipos.ts";
import type { Comparacao } from "../../lib/metodo-placar-tipos.ts";
import { ProfessorBolha } from "./ProfessorBolha.tsx";
import {
	COLUNA_ESTE_MODULO,
	COLUNA_MEDIA,
	COLUNA_METRICA,
	conteudoDoRelatorio,
	contagemDoRelatorio,
	destinoDaEvidencia,
	type DestinoDaEvidencia,
	ehRelatorioV2,
	ESTILO_DA_DECISAO,
	ESTILO_DA_SITUACAO,
	faseDoRelatorio,
	foiEditada,
	ID_RELATORIO,
	linhaDaRevisao,
	linhaDoPoucoRetorno,
	linhaDoTestadoEm,
	linhasDoPlacar,
	rotuloDaDecisao,
	rotuloDaDecisaoDoExperimento,
	rotuloDaSituacao,
	ROTULO_GERAR,
	ROTULO_GERAR_MESMO_ASSIM,
	ROTULO_TENTAR_DE_NOVO,
	TEXTO_COMECA_NO_PROXIMO,
	TEXTO_GERANDO,
	TEXTO_PARA_DEPOIS,
	TEXTO_POUCO_RETORNO,
	TEXTO_SEM_PROPOSTAS,
	TEXTO_SEM_RELATORIO,
	temFacilita,
	temMediaDosAnteriores,
	textoDaProposta,
	TITULO_EXPERIMENTOS,
	TITULO_FACILITA,
	TITULO_FUNCIONOU,
	TITULO_NOVOS,
	TITULO_PARA_DEPOIS,
	TITULO_PLACAR,
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
	/** Gera o relatório (com forcar, mesmo com pouco retorno); resolve quando a extensão aceitou, rejeita com a frase do erro. */
	gerar(forcar?: boolean): Promise<unknown>;
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
				{fase !== "gerando" && conteudo === "pronto" && relatorio ? <p className="data relatorio__contagem">{contagemDoRelatorio(relatorio)}</p> : null}
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

/** O relatório pronto: o da versão 2 (a análise dos experimentos) ou o da versão 1 (as propostas, só para ler). */
function RelatorioPronto({ acoes, relatorio }: { acoes: AcoesRelatorio; relatorio: RelatorioMetodo }) {
	return ehRelatorioV2(relatorio) ? <RelatorioV2 acoes={acoes} relatorio={relatorio} /> : <RelatorioV1 acoes={acoes} relatorio={relatorio} />;
}

/** O resumo em Markdown (nada, se vazio). */
function Resumo({ resumo }: { resumo: string }) {
	if (!resumo.trim()) return null;
	return (
		<Prose size="md" className="relatorio__resumo">
			<Markdown texto={resumo} />
		</Prose>
	);
}

// --- A versão 2 -------------------------------------------------------------------------------

/** Na ordem do contrato; a seção vazia não aparece. */
function RelatorioV2({ acoes, relatorio }: { acoes: AcoesRelatorio; relatorio: RelatorioMetodoV2 }) {
	return (
		<div className="relatorio__pronto">
			{relatorio.erroAoAplicar ? (
				<div className="relatorio__erro">
					<Callout tone="amber" label="A análise não foi aplicada por inteiro" icon="alert" quote={false}>
						<p>{relatorio.erroAoAplicar}</p>
					</Callout>
				</div>
			) : null}
			<Resumo resumo={relatorio.resumo} />
			<PlacarDoModulo comparacao={relatorio.comparacao} />
			{relatorio.experimentos.length > 0 ? (
				<div className="relatorio__bloco">
					<h4 className="overline relatorio__subtitulo">{TITULO_EXPERIMENTOS}</h4>
					<ol className="relatorio__propostas">
						{relatorio.experimentos.map((experimento) => (
							<li key={experimento.ajuste}>
								<CartaoDoExperimento experimento={experimento} />
							</li>
						))}
					</ol>
				</div>
			) : null}
			{relatorio.propostas.length > 0 ? (
				<div className="relatorio__bloco">
					<h4 className="overline relatorio__subtitulo">{TITULO_NOVOS}</h4>
					<ol className="relatorio__propostas">
						{relatorio.propostas.map((proposta) => (
							<li key={proposta.id}>
								<CartaoDoNovo proposta={proposta} evidencias={evidenciasDe(relatorio, proposta.evidencias)} acoes={acoes} />
							</li>
						))}
					</ol>
				</div>
			) : null}
			{relatorio.paraDepois.length > 0 ? (
				<div className="relatorio__bloco">
					<h4 className="overline relatorio__subtitulo">{TITULO_PARA_DEPOIS}</h4>
					<p className="body-sm relatorio__nota">{TEXTO_PARA_DEPOIS}</p>
					<ol className="relatorio__propostas">
						{relatorio.paraDepois.map((proposta, indice) => (
							<li key={indice}>
								<CartaoParaDepois proposta={proposta} evidencias={evidenciasDe(relatorio, proposta.evidencias)} acoes={acoes} />
							</li>
						))}
					</ol>
				</div>
			) : null}
			{temFacilita(relatorio) ? (
				<div className="relatorio__bloco">
					<h4 className="overline relatorio__subtitulo">{TITULO_FACILITA}</h4>
					<ol className="relatorio__propostas">
						{relatorio.aprendizados.map((aprendizado, indice) => (
							<li key={`a${indice}`}>
								<CartaoDoAprendizado aprendizado={aprendizado} evidencias={evidenciasDe(relatorio, aprendizado.evidencias)} acoes={acoes} />
							</li>
						))}
						{relatorio.revisoes.map((revisao) => (
							<li key={revisao.aprendizado}>
								<CartaoDaRevisao revisao={revisao} />
							</li>
						))}
					</ol>
				</div>
			) : null}
			<ListaDeItens titulo={TITULO_FUNCIONOU} itens={relatorio.funcionou} relatorio={relatorio} acoes={acoes} tom="funcionou" />
			<ListaDeItens titulo={TITULO_PROBLEMAS} itens={relatorio.problemas} relatorio={relatorio} acoes={acoes} tom="problemas" />
		</div>
	);
}

/** "Placar do módulo": a tabela curta (métrica, este módulo, média dos anteriores), com o n em texto pequeno. Sem módulo anterior, a coluna da média some. */
function PlacarDoModulo({ comparacao }: { comparacao: Comparacao }) {
	const linhas = linhasDoPlacar(comparacao);
	if (linhas.length === 0) return null;
	const comMedia = temMediaDosAnteriores(comparacao);
	return (
		<div className="relatorio__bloco">
			<h4 className="overline relatorio__subtitulo">{TITULO_PLACAR}</h4>
			<table className={`relatorio__placar${comMedia ? "" : " relatorio__placar--sem-media"}`}>
				<thead>
					<tr>
						<th scope="col" className="overline">
							{COLUNA_METRICA}
						</th>
						<th scope="col" className="overline">
							{COLUNA_ESTE_MODULO}
						</th>
						{comMedia ? (
							<th scope="col" className="overline">
								{COLUNA_MEDIA}
							</th>
						) : null}
					</tr>
				</thead>
				<tbody>
					{linhas.map((linha) => (
						<tr key={linha.id}>
							<th scope="row" className="body relatorio__placar-nome">
								{linha.nome}
							</th>
							<td data-rotulo={COLUNA_ESTE_MODULO}>
								<span className="data relatorio__placar-valor">{linha.atual}</span>
								{linha.n ? <span className="body-sm relatorio__placar-n">{linha.n}</span> : null}
							</td>
							{comMedia ? (
								<td data-rotulo={COLUNA_MEDIA}>
									<span className="data relatorio__placar-valor">{linha.media}</span>
									{linha.nMedia ? <span className="body-sm relatorio__placar-n">{linha.nMedia}</span> : null}
								</td>
							) : null}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** Um experimento decidido: a etiqueta do arquivo, o texto, a decisão em destaque, "testado em", o porquê, o texto novo (na reescrita) e o conserto. */
function CartaoDoExperimento({ experimento }: { experimento: ExperimentoDecidido }) {
	const id = useId();
	const estilo = ESTILO_DA_DECISAO[experimento.decisao];
	const testado = linhaDoTestadoEm(experimento.testadoEm);
	return (
		<article className={`relatorio__proposta relatorio__proposta--${experimento.decisao}`} aria-labelledby={id}>
			<header className="relatorio__proposta-cabeca">
				<Tag size="sm" tone="steel" icon="file">
					{NOMES_ARQUIVO_METODO[experimento.arquivo]}
				</Tag>
				<Tag size="sm" tone={estilo.tom} icon={estilo.icone}>
					{rotuloDaDecisaoDoExperimento(experimento.decisao)}
				</Tag>
			</header>
			<p id={id} className="body-strong relatorio__ajuste">
				{experimento.texto}
			</p>
			{testado ? <p className="body-sm relatorio__testado">{testado}</p> : null}
			<p className="body-sm relatorio__porque">
				<span className="overline">Por quê</span> {experimento.porque}
			</p>
			{experimento.textoNovo ? (
				<p className="body relatorio__texto-novo">
					<span className="overline">Texto novo</span> {experimento.textoNovo}
				</p>
			) : null}
			{experimento.conserto ? <p className="body-sm relatorio__conserto">{experimento.conserto}</p> : null}
		</article>
	);
}

/** Um experimento novo (uma proposta que entrou): a etiqueta do arquivo, "Começa no próximo módulo", o texto, o porquê e as evidências. */
function CartaoDoNovo(props: { proposta: PropostaAplicada; evidencias: readonly EvidenciaNaTela[]; acoes: AcoesRelatorio }) {
	const { proposta } = props;
	const id = useId();
	return (
		<article className="relatorio__proposta relatorio__proposta--novo" aria-labelledby={id}>
			<header className="relatorio__proposta-cabeca">
				<Tag size="sm" tone="steel" icon="file">
					{NOMES_ARQUIVO_METODO[proposta.arquivo]}
				</Tag>
				<Tag size="sm" tone="amber" icon="arrow-right">
					{TEXTO_COMECA_NO_PROXIMO}
				</Tag>
			</header>
			<p id={id} className="body-strong relatorio__ajuste">
				{proposta.ajuste}
			</p>
			<p className="body-sm relatorio__porque">
				<span className="overline">Por quê</span> {proposta.porque}
			</p>
			<Evidencias evidencias={props.evidencias} acoes={props.acoes} />
		</article>
	);
}

/** Uma proposta que ficou de fora pelo limite: em tom apagado, só para ler. */
function CartaoParaDepois(props: { proposta: PropostaParaDepois; evidencias: readonly EvidenciaNaTela[]; acoes: AcoesRelatorio }) {
	const { proposta } = props;
	const id = useId();
	return (
		<article className="relatorio__proposta relatorio__proposta--depois" aria-labelledby={id}>
			<header className="relatorio__proposta-cabeca">
				<Tag size="sm" tone="steel" icon="file">
					{NOMES_ARQUIVO_METODO[proposta.arquivo]}
				</Tag>
			</header>
			<p id={id} className="body-strong relatorio__ajuste">
				{proposta.ajuste}
			</p>
			<p className="body-sm relatorio__porque">
				<span className="overline">Por quê</span> {proposta.porque}
			</p>
			<Evidencias evidencias={props.evidencias} acoes={props.acoes} />
		</article>
	);
}

/** Um aprendizado novo ("Observado"): o texto, o porquê e as evidências. */
function CartaoDoAprendizado(props: { aprendizado: AprendizadoRegistrado; evidencias: readonly EvidenciaNaTela[]; acoes: AcoesRelatorio }) {
	const { aprendizado } = props;
	const id = useId();
	const estilo = ESTILO_DA_SITUACAO.observado;
	return (
		<article className="relatorio__proposta relatorio__proposta--facilita" aria-labelledby={id}>
			<header className="relatorio__proposta-cabeca">
				<Tag size="sm" tone={estilo.tom} icon={estilo.icone}>
					{rotuloDaSituacao("observado")}
				</Tag>
			</header>
			<p id={id} className="body-strong relatorio__ajuste">
				{aprendizado.texto}
			</p>
			<p className="body-sm relatorio__porque">
				<span className="overline">Por quê</span> {aprendizado.porque}
			</p>
			<Evidencias evidencias={props.evidencias} acoes={props.acoes} />
		</article>
	);
}

/** A revisão de um aprendizado de antes: o texto dele, a situação ("Observado → Confirmado") e o porquê. */
function CartaoDaRevisao({ revisao }: { revisao: RevisaoDeAprendizado }) {
	const id = useId();
	const estilo = ESTILO_DA_SITUACAO[revisao.situacao];
	return (
		<article className={`relatorio__proposta relatorio__proposta--${revisao.situacao}`} aria-labelledby={id}>
			<header className="relatorio__proposta-cabeca">
				<Tag size="sm" tone={estilo.tom} icon={estilo.icone}>
					{linhaDaRevisao(revisao)}
				</Tag>
			</header>
			<p id={id} className="body-strong relatorio__ajuste">
				{revisao.texto}
			</p>
			<p className="body-sm relatorio__porque">
				<span className="overline">Por quê</span> {revisao.porque}
			</p>
		</article>
	);
}

// --- A versão 1 -------------------------------------------------------------------------------

/** O relatório de antes, só para ler: o resumo, o que funcionou, o que não funcionou e as propostas com a decisão gravada. */
function RelatorioV1({ acoes, relatorio }: { acoes: AcoesRelatorio; relatorio: RelatorioMetodoV1 }) {
	return (
		<div className="relatorio__pronto">
			<Resumo resumo={relatorio.resumo} />
			<ListaDeItens titulo={TITULO_FUNCIONOU} itens={relatorio.funcionou} relatorio={relatorio} acoes={acoes} tom="funcionou" />
			<ListaDeItens titulo={TITULO_PROBLEMAS} itens={relatorio.problemas} relatorio={relatorio} acoes={acoes} tom="problemas" />
			<div className="relatorio__bloco">
				<h4 className="overline relatorio__subtitulo">{TITULO_PROPOSTAS}</h4>
				{relatorio.propostas.length === 0 ? (
					<p className="body relatorio__texto">{TEXTO_SEM_PROPOSTAS}</p>
				) : (
					<ol className="relatorio__propostas">
						{relatorio.propostas.map((proposta) => (
							<li key={proposta.id}>
								<CartaoDaProposta proposta={proposta} evidencias={evidenciasDe(relatorio, proposta.evidencias)} acoes={acoes} />
							</li>
						))}
					</ol>
				)}
			</div>
		</div>
	);
}

/** Uma proposta do relatório da versão 1: a etiqueta do arquivo, o ajuste, o porquê, as evidências e, se o Breno decidiu, a decisão (sem botões). */
function CartaoDaProposta(props: { proposta: PropostaRelatorio; evidencias: readonly EvidenciaNaTela[]; acoes: AcoesRelatorio }) {
	const { proposta } = props;
	const id = useId();
	const decisao = proposta.decisao;
	return (
		<article className={`relatorio__proposta${decisao ? ` relatorio__proposta--${decisao.tipo}` : ""}`} aria-labelledby={id}>
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
			<Evidencias evidencias={props.evidencias} acoes={props.acoes} />
			{decisao?.tipo === "rejeitada" && decisao.motivo ? (
				<p className="body-sm relatorio__motivo">
					<span className="overline">Motivo</span> {decisao.motivo}
				</p>
			) : null}
		</article>
	);
}

// --- O que as duas versões têm em comum ------------------------------------------------------------

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
