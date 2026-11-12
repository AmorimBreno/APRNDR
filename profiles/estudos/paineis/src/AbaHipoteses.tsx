// A aba Hipóteses da tela "Perfil do aprendiz" (docs/aprendiz.md, seções 3 e 8): no topo o botão Refletir e a linha da
// última reflexão; embaixo as hipóteses do perfil em seções (esperando a decisão, aprovadas, rejeitadas e expiradas),
// cada uma num cartão com o enunciado, o tipo, o escopo, a confiança, a validade, a versão e as evidências (fichas que
// abrem o evento no Histórico). Aprovar, editar e rejeitar mandam a ação pela ponte e esperam a resposta com o mesmo
// pedido (aprendiz-hipoteses-ponte.ts); nada muda no perfil sem a decisão do Breno.
//
// Padrões de interface (docs/padroes-de-interface.md): "Refletindo…" e "Salvando…" só depois de 1 s (RotuloEstado: os
// dois textos ocupam o mesmo lugar, então o botão não muda de tamanho); os botões de um cartão ficam desligados enquanto
// ele espera e o cartão não muda de altura (o erro ocupa o lugar ao lado dos botões); o conteúdo só aparece quando as
// hipóteses e o histórico (que dá o rótulo das fichas) chegaram, ou passado um prazo curto; o que já estava na tela
// fica até a resposta nova chegar; o destaque da rota é só cor.

import { Button, EmptyState, Icon, Modal, TextArea } from "@estudos/design-system";
import { semMovimento, useValorEstavel } from "@estudos/ui";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { EstadoHipoteses, Hipotese, MudancaPendente } from "../../lib/hipoteses-tipos.ts";
import { acharPorAtributo, useDestaque } from "./aprendiz-destaque.ts";
import { type FichaDeEvidencia, fichaDaEvidencia, type EventoLido } from "./aprendiz-historico-tela.ts";
import {
	AVISO_DO_CONFLITO,
	dicaDosDescartes,
	dividirEmSecoes,
	enunciadoMudou,
	enunciadoParaEnviar,
	erroDoEnunciado,
	type ItemEsperando,
	LIMITE_DO_ENUNCIADO,
	ladoDaMudanca,
	type NomesDosConceitos,
	nivelDaConfianca,
	rotuloDaConfianca,
	rotuloDoTipo,
	SECOES_RECOLHIDAS,
	type SecaoDeHipoteses,
	secaoDaHipotese,
	TEXTO_SEM_REFLEXAO,
	TITULO_DA_SECAO,
	textoDaUltimaReflexao,
	textoDaValidade,
	textoDasEvidencias,
	textoDoDiff,
	textoDoEscopo,
	totalDasSecoes,
	voltouParaRevisao,
} from "./aprendiz-hipoteses-tela.ts";
import { type HipotesesAbertas, type RotuloDaOperacao, type SituacaoDoAlvo } from "./aprendiz-hipoteses-ponte.ts";
import { type MateriaConhecida, formatarInteiro } from "./aprendiz-tela.ts";
import { RotuloEstado } from "./RotuloEstado.tsx";

const NBSP = " ";

// --- A barra do topo: Refletir e a última reflexão -----------------------------------------

function BarraDaReflexao(props: { hip: HipotesesAbertas; agora: number; carregada: boolean }) {
	const { hip } = props;
	const ultima = hip.estado?.ultimaReflexao;
	const erro = hip.reflexao.erro;
	const texto = erro ? erro : !props.carregada ? "" : ultima ? textoDaUltimaReflexao(ultima, props.agora) : TEXTO_SEM_REFLEXAO;
	const dica = !erro && ultima ? dicaDosDescartes(ultima) : undefined;
	return (
		<section className="apz-reflexao" aria-label="Reflexão do professor">
			<p className={`apz-reflexao__texto body-sm${erro ? " apz-reflexao__texto--erro" : ""}`} role={erro ? "alert" : undefined} title={dica || texto || undefined}>
				{texto || NBSP}
			</p>
			<Button
				variant="primary"
				size="sm"
				icon="bulb"
				className="apz-reflexao__botao"
				disabled={hip.reflexao.ocupada}
				aria-busy={hip.reflexao.ocupada || undefined}
				onClick={() => hip.refletir()}
			>
				<RotuloEstado ocupado={hip.reflexao.ocupada} repouso={erro ? "Tentar de novo" : "Refletir"} passageiro="Refletindo…" />
			</Button>
		</section>
	);
}

// --- As fichas de evidência ---------------------------------------------------------------

function Fichas(props: { ids: readonly string[]; lado: "favor" | "contra"; eventos: readonly EventoLido[] | undefined; abrir(id: string): void }) {
	if (props.ids.length === 0) return null;
	return (
		<ul className={`apz-fichas apz-fichas--${props.lado}`} aria-label={props.lado === "favor" ? "Evidências a favor" : "Evidências contra"}>
			{props.ids.map((id) => (
				<li key={id}>
					<Ficha ficha={fichaDaEvidencia(id, props.eventos)} abrir={props.abrir} />
				</li>
			))}
		</ul>
	);
}

function Ficha(props: { ficha: FichaDeEvidencia; abrir(id: string): void }) {
	const { ficha } = props;
	// Um evento que o Histórico não tem (removido, ou mais antigo que o limite dele) não abre nada.
	if (ficha.situacao === "removido" || ficha.situacao === "antigo") {
		return (
			<span className="apz-ev apz-ev--sem" title={ficha.dica} data-situacao={ficha.situacao}>
				{ficha.rotulo}
			</span>
		);
	}
	return (
		<button type="button" className="apz-ev" title={ficha.dica} data-situacao={ficha.situacao} onClick={() => props.abrir(ficha.id)}>
			{ficha.rotulo}
		</button>
	);
}

// --- Os botões de um cartão -----------------------------------------------------------------

interface BotaoDoCartao {
	rotulo: RotuloDaOperacao;
	texto: string;
	icone?: "check" | "close";
	acao(): void;
}

/** Os botões ficam desligados enquanto o cartão espera; só o clicado troca o texto, e só depois de 1 s. */
function Acoes(props: { botoes: readonly BotaoDoCartao[]; situacao: SituacaoDoAlvo; ocupado: boolean }) {
	const salvando = props.situacao.tipo === "salvando" ? props.situacao.rotulo : undefined;
	return (
		<div className="apz-acoes">
			{props.situacao.tipo === "erro" ? (
				<p className="apz-acoes__erro body-sm" role="alert" title={props.situacao.mensagem}>
					{props.situacao.mensagem}
				</p>
			) : (
				<span className="apz-acoes__espaco" />
			)}
			{props.botoes.map((botao) => (
				<Button key={botao.rotulo} variant="secondary" size="sm" {...(botao.icone ? { icon: botao.icone } : {})} disabled={props.ocupado} aria-busy={salvando === botao.rotulo || undefined} onClick={botao.acao}>
					<RotuloEstado ocupado={salvando === botao.rotulo} repouso={botao.texto} passageiro="Salvando…" />
				</Button>
			))}
		</div>
	);
}

// --- O cartão de uma hipótese ------------------------------------------------------------------

interface ContextoDosCartoes {
	materias: ReadonlyArray<MateriaConhecida>;
	nomes: NomesDosConceitos;
	eventos: readonly EventoLido[] | undefined;
	hip: HipotesesAbertas;
	abrirEvento(id: string): void;
	destacadas: ReadonlySet<string>;
	editar(id: string): void;
}

function Marcador(props: { confianca: string }) {
	const nivel = nivelDaConfianca(props.confianca);
	return (
		<span className="apz-nivel" data-nivel={nivel} aria-hidden="true">
			<i />
			<i />
			<i />
		</span>
	);
}

function CartaoHipotese(props: { hipotese: Hipotese; ctx: ContextoDosCartoes; ocupado: boolean }) {
	const { hipotese, ctx } = props;
	const situacao = ctx.hip.situacao(hipotese.id);
	const decidir = (decisao: "aprovar" | "rejeitar") => ctx.hip.decidir({ alvo: "hipotese", id: hipotese.id, decisao, rotulo: decisao });
	const botoes: BotaoDoCartao[] =
		hipotese.status === "proposta"
			? [
					{ rotulo: "aprovar", texto: "Aprovar", icone: "check", acao: () => decidir("aprovar") },
					{ rotulo: "editar", texto: "Editar", acao: () => ctx.editar(hipotese.id) },
					{ rotulo: "rejeitar", texto: "Rejeitar", icone: "close", acao: () => decidir("rejeitar") },
				]
			: hipotese.status === "aprovada"
				? [
						{ rotulo: "editar", texto: "Editar", acao: () => ctx.editar(hipotese.id) },
						{ rotulo: "rejeitar", texto: "Rejeitar", icone: "close", acao: () => ctx.hip.editar({ id: hipotese.id, rotulo: "rejeitar", status: "rejeitada" }) },
					]
				: [{ rotulo: "reaprovar", texto: "Aprovar de novo", icone: "check", acao: () => ctx.hip.editar({ id: hipotese.id, rotulo: "reaprovar", status: "aprovada" }) }];
	return (
		<li className={`apz-hip apz-hip--${hipotese.status}${ctx.destacadas.has(hipotese.id) ? " apz-hip--destaque" : ""}`} data-hipotese={hipotese.id}>
			<div className="apz-hip__topo">
				<span className="apz-hip__tipo overline">{rotuloDoTipo(hipotese.tipo)}</span>
				<span className="apz-hip__escopo body-sm" title={textoDoEscopo(hipotese.escopo, ctx.materias, ctx.nomes)}>
					{textoDoEscopo(hipotese.escopo, ctx.materias, ctx.nomes)}
				</span>
			</div>
			<p className="apz-hip__enunciado body">{hipotese.enunciado}</p>
			{voltouParaRevisao(hipotese) ? (
				<p className="apz-hip__aviso body-sm">
					<Icon name="alert" size={16} />
					<span>{AVISO_DO_CONFLITO}</span>
				</p>
			) : null}
			<dl className="apz-hip__meta">
				<div className="apz-num apz-hip__confianca" title="Calculada pelo código a partir dos eventos e das sessões em que aparecem.">
					<dt className="apz-num__rotulo overline">Confiança</dt>
					<dd className="apz-num__valor body-sm">
						<Marcador confianca={hipotese.confianca} />
						<span>{rotuloDaConfianca(hipotese.confianca)}</span>
					</dd>
				</div>
				<div className="apz-num apz-hip__validade">
					<dt className="apz-num__rotulo overline">Validade</dt>
					<dd className="apz-num__valor body-sm">{textoDaValidade(hipotese.validade)}</dd>
				</div>
				<div className="apz-num apz-hip__versao">
					<dt className="apz-num__rotulo overline">Versão</dt>
					<dd className="apz-num__valor body-sm">{formatarInteiro(hipotese.versao)}</dd>
				</div>
			</dl>
			<div className="apz-hip__evidencias">
				<p className="apz-hip__conta data">{textoDasEvidencias(hipotese.aFavor.length, hipotese.contra.length)}</p>
				<Fichas ids={hipotese.aFavor} lado="favor" eventos={ctx.eventos} abrir={ctx.abrirEvento} />
				<Fichas ids={hipotese.contra} lado="contra" eventos={ctx.eventos} abrir={ctx.abrirEvento} />
			</div>
			<Acoes botoes={botoes} situacao={situacao} ocupado={props.ocupado} />
		</li>
	);
}

// --- O cartão de uma mudança pendente ------------------------------------------------------------

function CartaoMudanca(props: { mudanca: MudancaPendente; hipotese: Hipotese | undefined; ctx: ContextoDosCartoes; ocupado: boolean }) {
	const { mudanca, hipotese, ctx } = props;
	const situacao = ctx.hip.situacao(mudanca.id);
	const lado = ladoDaMudanca(mudanca.acao);
	const decidir = (decisao: "aprovar" | "rejeitar") => ctx.hip.decidir({ alvo: "mudanca", id: mudanca.id, decisao, rotulo: decisao });
	const botoes: BotaoDoCartao[] = [
		{ rotulo: "aprovar", texto: "Aprovar", icone: "check", acao: () => decidir("aprovar") },
		{ rotulo: "rejeitar", texto: "Rejeitar", icone: "close", acao: () => decidir("rejeitar") },
	];
	return (
		<li className={`apz-hip apz-hip--mudanca${ctx.destacadas.has(mudanca.hipotese) ? " apz-hip--destaque" : ""}`} data-mudanca={mudanca.id} data-hipotese-da-mudanca={mudanca.hipotese}>
			<div className="apz-hip__topo">
				<span className="apz-hip__tipo overline">Mudança proposta</span>
				<span className="apz-hip__escopo body-sm">{hipotese ? textoDoEscopo(hipotese.escopo, ctx.materias, ctx.nomes) : NBSP}</span>
			</div>
			<p className="apz-hip__diff body-strong">{textoDoDiff(mudanca)}</p>
			<p className="apz-hip__contexto body-sm" title={hipotese?.enunciado}>
				{hipotese ? `Hipótese: ${hipotese.enunciado}` : "Hipótese removida."}
			</p>
			{mudanca.motivo ? <p className="apz-hip__motivo body-sm">Motivo: {mudanca.motivo}</p> : null}
			{lado ? (
				<div className="apz-hip__evidencias">
					<Fichas ids={mudanca.evidencias} lado={lado} eventos={ctx.eventos} abrir={ctx.abrirEvento} />
				</div>
			) : null}
			<Acoes botoes={botoes} situacao={situacao} ocupado={props.ocupado} />
		</li>
	);
}

// --- O modal de editar o enunciado -----------------------------------------------------------

function ModalEnunciado(props: { hipotese: Hipotese; situacao: SituacaoDoAlvo; salvar(enunciado: string): void; fechar(): void }) {
	const { hipotese, situacao } = props;
	const [texto, setTexto] = useState(hipotese.enunciado);
	const [problema, setProblema] = useState<string | undefined>(undefined);
	const [enviou, setEnviou] = useState(false);
	const salvando = situacao.tipo === "salvando";
	const aprovando = hipotese.status === "proposta";

	// A resposta chegou e deu certo: fecha. Um erro fica no modal (e no cartão) e o texto escrito não se perde.
	useEffect(() => {
		if (enviou && situacao.tipo === "livre") props.fechar();
	}, [enviou, situacao.tipo, props.fechar]);

	const enviar = () => {
		if (salvando) return;
		const erro = erroDoEnunciado(texto);
		setProblema(erro);
		if (erro) return;
		// Numa aprovada, sem mudança nada a salvar; numa proposta, salvar sem mudar é só aprovar.
		if (!aprovando && !enunciadoMudou(texto, hipotese.enunciado)) {
			props.fechar();
			return;
		}
		setEnviou(true);
		props.salvar(enunciadoParaEnviar(texto));
	};

	// O erro da resposta só aparece se foi deste Salvar (um erro velho do cartão não é do modal).
	const mostrado = problema ?? (enviou && situacao.tipo === "erro" ? situacao.mensagem : undefined);
	return (
		<Modal
			open
			onClose={props.fechar}
			title="Editar a hipótese"
			kicker="Perfil do aprendiz"
			size="sm"
			dismissible={!salvando}
			footer={
				<>
					<Button variant="ghost" onClick={props.fechar} disabled={salvando}>
						Cancelar
					</Button>
					<Button variant="primary" iconRight="check" onClick={enviar} disabled={salvando} aria-busy={salvando || undefined}>
						<RotuloEstado ocupado={salvando} repouso="Salvar" passageiro="Salvando…" />
					</Button>
				</>
			}
		>
			<form
				className="apz-modal"
				onSubmit={(evento) => {
					evento.preventDefault();
					enviar();
				}}
			>
				<TextArea
					label="Enunciado"
					value={texto}
					maxLength={LIMITE_DO_ENUNCIADO}
					rows={5}
					autoFocus
					onChange={(evento) => {
						setTexto(evento.target.value);
						setProblema(undefined);
					}}
					hint={aprovando ? "Salvar aprova a hipótese com este enunciado." : "Salvar guarda o enunciado novo como uma versão nova da hipótese."}
				/>
				<p className="apz-modal__erro body-sm" role={mostrado ? "alert" : undefined}>
					{mostrado ?? NBSP}
				</p>
			</form>
		</Modal>
	);
}

// --- As seções ---------------------------------------------------------------------------------

function Secao(props: { id: SecaoDeHipoteses; quantas: number; aberta: boolean; alternar?: () => void; vazio?: string; children: ReactNode }) {
	const titulo = TITULO_DA_SECAO[props.id];
	const conteudo = (
		<>
			<span className="apz-secao__nome heading">{titulo}</span>
			<span className="apz-secao__conta data">{formatarInteiro(props.quantas)}</span>
		</>
	);
	return (
		<section className={`apz-secao apz-secao--${props.id}`} data-secao={props.id}>
			<h2 className="apz-secao__titulo">
				{props.alternar ? (
					<button type="button" className="apz-secao__alternar" aria-expanded={props.aberta} onClick={props.alternar}>
						{conteudo}
						<Icon name="chevron-down" size={18} strokeWidth={2.25} className="apz-seta" aria-hidden="true" />
					</button>
				) : (
					<span className="apz-secao__alternar apz-secao__alternar--fixo">{conteudo}</span>
				)}
			</h2>
			{props.aberta ? props.quantas === 0 && props.vazio ? <p className="apz-secao__vazio body-sm">{props.vazio}</p> : <ul className="apz-hips">{props.children}</ul> : null}
		</section>
	);
}

/** Um cartão em esqueleto, com a estrutura de um real, enquanto os dados não chegam. */
function CartaoEsqueleto() {
	return (
		<li className="apz-hip apz-hip--esqueleto" aria-hidden="true">
			<div className="apz-hip__topo">
				<span className="apz-hip__tipo overline">{NBSP}</span>
				<span className="apz-hip__escopo body-sm">{NBSP}</span>
			</div>
			<p className="apz-hip__enunciado body">{NBSP}</p>
			<dl className="apz-hip__meta">
				{["Confiança", "Validade", "Versão"].map((rotulo) => (
					<div className="apz-num" key={rotulo}>
						<dt className="apz-num__rotulo overline">{rotulo}</dt>
						<dd className="apz-num__valor body-sm">{NBSP}</dd>
					</div>
				))}
			</dl>
			<div className="apz-hip__evidencias">
				<p className="apz-hip__conta data">{NBSP}</p>
			</div>
			<div className="apz-acoes">
				<span className="apz-acoes__espaco" />
			</div>
		</li>
	);
}

// --- A aba ---------------------------------------------------------------------------------------

export interface PropsAbaHipoteses {
	hip: HipotesesAbertas;
	/** Os eventos do Histórico (dão o rótulo das fichas); undefined até chegarem. */
	eventos: readonly EventoLido[] | undefined;
	/** O Histórico falhou: as fichas aparecem só com o id curto, sem esperar. */
	historicoFalhou: boolean;
	materia?: string;
	materias: ReadonlyArray<MateriaConhecida>;
	nomes: NomesDosConceitos;
	agora: number;
	/** As hipóteses destacadas pela rota. */
	destacadas: readonly string[];
	/** Abre o evento no Histórico (uma ficha foi clicada). */
	abrirEvento(id: string): void;
	/** Tira o destaque da rota (o próximo clique). */
	limparDestaque(): void;
}

/** Quanto esperar o histórico antes de mostrar os cartões sem o rótulo das fichas (regra 3: nada de ver o conteúdo se arrumando). */
export const PRAZO_DO_HISTORICO_MS = 400;

/** Verdadeiro quando `chegou` ou quando `ms` já passaram desde que a aba abriu (o prazo para o conteúdo aparecer assim mesmo). */
function useDepoisDe(ms: number, chegou: boolean): boolean {
	const [passou, setPassou] = useState(false);
	useEffect(() => {
		const relogio = setTimeout(() => setPassou(true), ms);
		return () => clearTimeout(relogio);
	}, [ms]);
	return chegou || passou;
}

export function AbaHipoteses(props: PropsAbaHipoteses) {
	const { hip, materia, materias, nomes } = props;
	const estado: EstadoHipoteses | undefined = hip.estado;
	const prontoDasFichas = useDepoisDe(PRAZO_DO_HISTORICO_MS, props.eventos !== undefined || props.historicoFalhou);
	const parado = semMovimento();
	const primeira = useRef(true);
	useEffect(() => {
		primeira.current = false;
	}, []);

	// "Carregando…" só depois de 1 s (o esqueleto fica escondido, ocupando o lugar).
	const semDados = !hip.erro && (!estado || !prontoDasFichas);
	const mostraCarregando = useValorEstavel(semDados, semDados, false) && semDados;
	const fase = hip.erro ? "erro" : semDados ? "espera" : "dados";

	const raiz = useRef<HTMLDivElement>(null);
	const secoes = useMemo(() => (estado ? dividirEmSecoes(estado, materia) : undefined), [estado, materia]);
	const destacadas = useMemo(() => new Set(props.destacadas), [props.destacadas]);

	// As seções recolhidas que o Breno abriu; a que tem a hipótese destacada pela rota abre junto e fica aberta.
	const [abertas, setAbertas] = useState<ReadonlySet<SecaoDeHipoteses>>(() => new Set());
	const [destaqueVisto, setDestaqueVisto] = useState("");
	const chaveDestaque = props.destacadas.join(",");
	if (destaqueVisto !== chaveDestaque && estado) {
		setDestaqueVisto(chaveDestaque);
		const forcadas = estado.hipoteses.filter((hipotese) => destacadas.has(hipotese.id)).map(secaoDaHipotese);
		if (forcadas.length > 0) setAbertas((atuais) => new Set([...atuais, ...forcadas]));
	}
	const aberta = (id: SecaoDeHipoteses) => !SECOES_RECOLHIDAS.includes(id) || abertas.has(id);
	const alternar = (id: SecaoDeHipoteses) =>
		setAbertas((atuais) => {
			const novas = new Set(atuais);
			if (!novas.delete(id)) novas.add(id);
			return novas;
		});

	useDestaque({ ids: props.destacadas, pronto: secoes !== undefined && !semDados, achar: (ids) => acharPorAtributo(raiz.current, "data-hipotese", ids), limpar: props.limparDestaque });

	const [editando, setEditando] = useState<string | undefined>(undefined);
	const aEditar = editando ? estado?.hipoteses.find((hipotese) => hipotese.id === editando) : undefined;
	const fecharModal = useRef(() => setEditando(undefined)).current;

	const ctx: ContextoDosCartoes = {
		materias,
		nomes,
		eventos: props.eventos,
		hip,
		abrirEvento: props.abrirEvento,
		destacadas,
		editar: setEditando,
	};

	/** Um cartão espera se ele, ou a mudança dele, está salvando. */
	const hipoteseOcupada = (hipotese: Hipotese): boolean =>
		hip.situacao(hipotese.id).tipo === "salvando" || (estado?.mudancas ?? []).some((mudanca) => mudanca.hipotese === hipotese.id && hip.situacao(mudanca.id).tipo === "salvando");
	const mudancaOcupada = (mudanca: MudancaPendente, hipotese: Hipotese | undefined): boolean => hip.situacao(mudanca.id).tipo === "salvando" || (hipotese !== undefined && hip.situacao(hipotese.id).tipo === "salvando");

	const itemEsperando = (item: ItemEsperando) =>
		item.tipo === "hipotese" ? (
			<CartaoHipotese key={item.hipotese.id} hipotese={item.hipotese} ctx={ctx} ocupado={hipoteseOcupada(item.hipotese)} />
		) : (
			<CartaoMudanca key={item.mudanca.id} mudanca={item.mudanca} hipotese={item.hipotese} ctx={ctx} ocupado={mudancaOcupada(item.mudanca, item.hipotese)} />
		);
	const cartao = (hipotese: Hipotese) => <CartaoHipotese key={hipotese.id} hipotese={hipotese} ctx={ctx} ocupado={hipoteseOcupada(hipotese)} />;

	return (
		<div className="apz-hipoteses" ref={raiz}>
			<BarraDaReflexao hip={hip} agora={props.agora} carregada={estado !== undefined} />
			<div className="apz-hipoteses__corpo">
				{/* O corpo troca com um fade curto de opacidade (regra 7); a barra do topo fica. */}
				<motion.div key={fase} className="apz-hipoteses__fase" initial={parado || primeira.current ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
					{hip.erro ? (
						<div className="aprendiz__erro" role="alert">
							<Icon name="alert" size={20} />
							<div className="aprendiz__erro-texto">
								<h2 className="heading" style={{ margin: 0 }}>
									Não consegui ler as hipóteses
								</h2>
								<p className="body" style={{ margin: 0 }}>
									{hip.erro.mensagem}
								</p>
							</div>
							<Button variant="secondary" size="sm" icon="refresh" onClick={() => hip.recarregar()} aria-busy={hip.tentando}>
								<RotuloEstado ocupado={hip.tentando} repouso="Tentar de novo" passageiro="Tentando…" />
							</Button>
						</div>
					) : !secoes || semDados ? (
						<div className="aprendiz__espera" style={{ visibility: mostraCarregando ? "visible" : "hidden" }} aria-hidden={!mostraCarregando}>
							<p className="body aprendiz__carregando">Carregando as hipóteses…</p>
							<ul className="apz-hips">
								<CartaoEsqueleto />
								<CartaoEsqueleto />
							</ul>
						</div>
					) : totalDasSecoes(secoes) === 0 ? (
						<div className="aprendiz__vazio">
							{estado && estado.hipoteses.length === 0 && estado.mudancas.length === 0 ? (
								<EmptyState glyph="考" title="Ainda não há hipóteses">
									Clique em Refletir e o professor lê os seus eventos de aprendizagem e propõe hipóteses sobre como você aprende. Cada uma cita os eventos que a sustentam, e nada entra no seu perfil sem a sua aprovação.
								</EmptyState>
							) : (
								<EmptyState glyph="考" title={`Sem hipóteses em ${materia ? (materias.find((item) => item.id === materia)?.nome ?? "esta matéria") : "esta seleção"}`}>
									Nenhuma hipótese vale para essa matéria. Escolha outra matéria ou volte para todas.
								</EmptyState>
							)}
						</div>
					) : (
						<>
							<Secao id="esperando" quantas={secoes.esperando.length} aberta vazio="Nada esperando pela sua decisão.">
								{secoes.esperando.map(itemEsperando)}
							</Secao>
							<Secao id="aprovadas" quantas={secoes.aprovadas.length} aberta vazio="Nenhuma hipótese aprovada ainda.">
								{secoes.aprovadas.map(cartao)}
							</Secao>
							{secoes.rejeitadas.length > 0 ? (
								<Secao id="rejeitadas" quantas={secoes.rejeitadas.length} aberta={aberta("rejeitadas")} alternar={() => alternar("rejeitadas")}>
									{secoes.rejeitadas.map(cartao)}
								</Secao>
							) : null}
							{secoes.expiradas.length > 0 ? (
								<Secao id="expiradas" quantas={secoes.expiradas.length} aberta={aberta("expiradas")} alternar={() => alternar("expiradas")}>
									{secoes.expiradas.map(cartao)}
								</Secao>
							) : null}
						</>
					)}
				</motion.div>
			</div>
			{aEditar ? <ModalEnunciado key={aEditar.id} hipotese={aEditar} situacao={hip.situacao(aEditar.id)} salvar={(enunciado) => salvarEnunciado(hip, aEditar, enunciado)} fechar={fecharModal} /> : null}
		</div>
	);
}

/** Salvar o enunciado: numa proposta aprova com o enunciado novo; numa aprovada edita. */
function salvarEnunciado(hip: HipotesesAbertas, hipotese: Hipotese, enunciado: string): void {
	if (hipotese.status === "proposta") hip.decidir({ alvo: "hipotese", id: hipotese.id, decisao: "aprovar", rotulo: "editar", enunciado });
	else hip.editar({ id: hipotese.id, rotulo: "editar", enunciado });
}
