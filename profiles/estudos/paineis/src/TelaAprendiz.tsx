// A tela "Perfil do aprendiz" (docs/aprendiz.md, seção 7), a subtela do perfil no caminho
// aprendiz/<aba>[/<matéria>]. Nesta parte só existe a aba Indicadores (as outras entram na parte B); a
// matéria do caminho filtra tudo (sem ela, todas as matérias). No topo, a barra no estilo da aba tijolo
// (as classes ap-cbar da CourseBar, como a agenda): o voltar, o título, a aba, o filtro de matéria. Embaixo,
// o resumo (quantos conceitos e quantos em cada faixa de domínio), o aviso dos eventos ignorados e a lista de
// conceitos do menor domínio para o maior. Uma linha abre os detalhes (as confusões e os eventos).
//
// O que a tela mostra é o cálculo da camada 2 (lib/aprendiz-indicadores-tipos.ts), recalculável dos eventos.
// A autoavaliação ("o que você disse") fica ao lado do domínio medido ("o que você fez"), só como informação.
//
// Padrões de interface (docs/padroes-de-interface.md): "Calculando…" só aparece depois de 1 s (o esqueleto tem o
// tamanho das linhas reais); a troca de filtro não desmonta a tela; só chegam as respostas da ponte desta visita
// (aprendiz-ponte.ts); a altura da linha fechada não depende de estado nenhum; a largura da barra acompanha a
// da linha (CSS, sem medida); o fade é só de opacidade e para com o movimento reduzido.

import { Button, EmptyState, Icon, Select } from "@estudos/design-system";
import { type JanelaPerfilHook, type PropsTelaInicial, semMovimento, useValorEstavel } from "@estudos/ui";
import { motion } from "motion/react";
import { useEffect, useId, useMemo, useState } from "react";
import type { IndicadoresConceito } from "../../lib/aprendiz-indicadores-tipos.ts";
import { useIndicadores } from "./aprendiz-ponte.ts";
import {
	ABAS_DO_APRENDIZ,
	type AbaAprendiz,
	chaveDoConceito,
	contarEventos,
	eventosParaMostrar,
	faixaDoDominio,
	filtrarPorMateria,
	formatarBrier,
	formatarDominio,
	formatarGanho,
	formatarInteiro,
	formatarPonderado,
	formatarQueDisse,
	idCurtoDoConceito,
	idCurtoDoEvento,
	LEGENDA_DAS_FAIXAS,
	leituraDoBrier,
	type MateriaConhecida,
	materiasDosDados,
	NOME_DA_FAIXA,
	nomeDaMateria,
	nomeDoConceito,
	opcoesDeMateriaAprendiz,
	ordenarConceitos,
	type ResumoDosConceitos,
	resumirConceitos,
	rotaDeVoltarDoAprendiz,
	semRespostas,
	rotaDoAprendiz,
	textoDosIgnorados,
	textoHaQuanto,
} from "./aprendiz-tela.ts";
import { classeDoTom, tomDaMateria } from "./calendario-tela.ts";
import { RotuloEstado } from "./RotuloEstado.tsx";
import { idDaAba, idDoPainel, SeletorAbas } from "./SeletorTags.tsx";

export interface PropsTelaAprendiz extends PropsTelaInicial {
	janela: JanelaPerfilHook;
	aba: AbaAprendiz;
	/** O id da matéria do filtro; sem ele, todas. */
	materia?: string;
	/** As matérias que a TelaEstudos já conhece (o nome e a cor de cada uma); vazio até a lista chegar. */
	materias: ReadonlyArray<MateriaConhecida>;
}

const NBSP = " ";

/** O agora, atualizado a cada minuto (o "há 3 dias" acompanha o relógio). */
function useAgora(): number {
	const [agora, definir] = useState(() => Date.now());
	useEffect(() => {
		const intervalo = window.setInterval(() => definir(Date.now()), 60_000);
		return () => window.clearInterval(intervalo);
	}, []);
	return agora;
}

// --- O resumo --------------------------------------------------------------------

function Ficha(props: { rotulo: string; valor: string }) {
	return (
		<div className="apz-ficha">
			<span className="apz-ficha__rotulo overline">{props.rotulo}</span>
			<span className="apz-ficha__valor data-lg">{props.valor}</span>
		</div>
	);
}

function Resumo(props: { valores?: ResumoDosConceitos }) {
	const texto = (valor: number | undefined) => (valor === undefined ? "––" : formatarInteiro(valor));
	return (
		<section className="apz-resumo" aria-label="Resumo dos conceitos">
			<Ficha rotulo="Conceitos" valor={texto(props.valores?.conceitos)} />
			<Ficha rotulo="Domínio alto" valor={texto(props.valores?.alto)} />
			<Ficha rotulo="Domínio médio" valor={texto(props.valores?.medio)} />
			<Ficha rotulo="Domínio baixo" valor={texto(props.valores?.baixo)} />
			<Ficha rotulo="Só autoavaliados" valor={texto(props.valores?.soAutoavaliados)} />
		</section>
	);
}

// --- Uma linha da lista -------------------------------------------------------------

interface PropsLinha {
	conceito: IndicadoresConceito;
	aberto: boolean;
	alternar(): void;
	/** O nome da matéria; em branco enquanto a lista de matérias não chegou. */
	nomeMateria: string;
	tom: string;
	agora: number;
	idDetalhes: string;
}

function LinhaConceito(props: PropsLinha) {
	const { conceito, aberto } = props;
	const nome = nomeDoConceito(conceito);
	const faixa = faixaDoDominio(conceito.dominio);
	const percentual = Math.round(Math.max(0, Math.min(1, conceito.dominio)) * 100);
	const leitura = leituraDoBrier(conceito.brier, conceito.observacoes);
	const calibracao = leitura ? `${formatarBrier(conceito.brier)} · ${leitura}` : formatarBrier(conceito.brier);
	const disse = conceito.disse;
	// Sem nenhuma resposta, o domínio é só o início do BKT: não vira porcentagem nem barra.
	const semDados = semRespostas(conceito);
	return (
		<li className={`apz-item${aberto ? " apz-item--aberto" : ""}`} data-conceito={chaveDoConceito(conceito)}>
			<div className="apz-linha">
				<div className="apz-linha__topo">
					<button type="button" className="apz-alternar" aria-expanded={aberto} aria-controls={props.idDetalhes} onClick={props.alternar} title={nome}>
						<span className="apz-nome body-strong">{nome}</span>
						{conceito.nome ? null : <span className="apz-nome__id data"> {idCurtoDoConceito(conceito.conceito)}</span>}
					</button>
					<span className={`apz-materia body-sm ${props.tom}`}>
						<span className="lista-ponto" aria-hidden="true" />
						<span className="apz-materia__nome">{props.nomeMateria || NBSP}</span>
					</span>
					<span className="apz-quando data" title={conceito.ultima}>
						{textoHaQuanto(conceito.ultima, props.agora)}
					</span>
					<Icon name="chevron-down" size={18} strokeWidth={2.25} className="apz-seta" aria-hidden="true" />
				</div>

				<div className="apz-dominio">
					{semDados ? (
						<span className="apz-dominio__sem body-sm">Sem respostas ainda</span>
					) : (
						<span
							className="apz-barra"
							role="meter"
							aria-label={`Domínio de ${nome}`}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={percentual}
							aria-valuetext={`${percentual}%, domínio ${NOME_DA_FAIXA[faixa]}`}
						>
							<span className="apz-barra__cheio" style={{ width: `${percentual}%` }} />
						</span>
					)}
					<span className="apz-dominio__pct data" aria-hidden="true">
						{semDados ? NBSP : formatarDominio(conceito.dominio)}
					</span>
					<span className="apz-dominio__faixa overline" aria-hidden="true">
						{semDados ? NBSP : NOME_DA_FAIXA[faixa]}
					</span>
				</div>

				<dl className="apz-numeros">
					<Numero rotulo="Acertos" valor={formatarPonderado(conceito.acertosPonderados)} dica="Acertos ponderados: as respostas mais antigas pesam menos." />
					<Numero rotulo="Erros" valor={formatarPonderado(conceito.errosPonderados)} dica="Erros ponderados: os mais antigos pesam menos." />
					<Numero rotulo="Sessões" valor={formatarInteiro(conceito.sessoes)} dica="Em quantas sessões diferentes o conceito apareceu." />
					<Numero rotulo="Ganho" valor={formatarGanho(conceito.ganho)} dica="Ganho normalizado entre a primeira e a última sessão (precisa de pelo menos 2 sessões)." />
					<Numero
						rotulo="Calibração"
						valor={calibracao}
						dica="Brier: o erro médio entre a confiança que você disse e o resultado. Menor é melhor. Com poucas respostas, é só uma pista."
						larga
					/>
				</dl>

				<dl className="apz-dito">
					<Numero rotulo="Você disse" valor={disse ? `nível ${formatarQueDisse(disse.nivel)}` : "—"} dica="Sua autoavaliação, de 1 a 4. É só informação: não entra no cálculo." />
					<Numero rotulo="Você fez" valor={semDados ? "sem respostas" : `domínio ${formatarDominio(conceito.dominio)}`} dica="O domínio calculado das suas respostas." />
				</dl>
			</div>

			{aberto ? <Detalhes conceito={conceito} nome={nome} id={props.idDetalhes} agora={props.agora} /> : null}
		</li>
	);
}

function Numero(props: { rotulo: string; valor: string; dica: string; larga?: boolean }) {
	return (
		<div className={`apz-num${props.larga ? " apz-num--larga" : ""}`} title={props.dica}>
			<dt className="apz-num__rotulo overline">{props.rotulo}</dt>
			<dd className="apz-num__valor body-sm">{props.valor}</dd>
		</div>
	);
}

function Detalhes(props: { conceito: IndicadoresConceito; nome: string; id: string; agora: number }) {
	const { conceito } = props;
	const eventos = eventosParaMostrar(conceito.eventos);
	return (
		<div className="apz-detalhes" id={props.id} role="region" aria-label={`Detalhes de ${props.nome}`}>
			<section className="apz-detalhes__bloco">
				<h3 className="overline apz-detalhes__titulo">Confusões observadas</h3>
				{conceito.confusoes.length === 0 ? (
					<p className="body-sm apz-detalhes__texto">Nenhuma confusão observada ainda.</p>
				) : (
					<ul className="apz-confusoes">
						{conceito.confusoes.map((confusao) => (
							<li key={confusao.texto} className="apz-confusao">
								<span className="body-sm apz-confusao__texto">{confusao.texto}</span>
								<span className="data apz-confusao__conta">{contarEventos(confusao.eventos.length)}</span>
								<span className="apz-ids">
									{confusao.eventos.map((evento) => (
										<code key={evento} className="apz-id" title={evento}>
											{idCurtoDoEvento(evento)}
										</code>
									))}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
			<section className="apz-detalhes__bloco">
				<h3 className="overline apz-detalhes__titulo">O que você disse</h3>
				<p className="body-sm apz-detalhes__texto">
					{conceito.disse
						? `Nível ${formatarQueDisse(conceito.disse.nivel)} ${textoHaQuanto(conceito.disse.ts, props.agora)}. É só informação: a autoavaliação não entra no cálculo do domínio.`
						: "Você ainda não se avaliou neste conceito. A autoavaliação seria só informação: ela não entra no cálculo do domínio."}
				</p>
			</section>
			<section className="apz-detalhes__bloco">
				<h3 className="overline apz-detalhes__titulo">Eventos que entraram ({formatarInteiro(conceito.eventos.length)})</h3>
				<p className="apz-ids">
					{eventos.ids.map((evento) => (
						<code key={evento} className="apz-id" title={evento}>
							{idCurtoDoEvento(evento)}
						</code>
					))}
					{eventos.escondidos > 0 ? <span className="body-sm apz-ids__resto">e mais {formatarInteiro(eventos.escondidos)} mais antigos</span> : null}
				</p>
			</section>
		</div>
	);
}

/** Uma linha no lugar de uma real, enquanto os dados não chegam: a mesma estrutura, então a mesma altura. */
function LinhaEsqueleto() {
	return (
		<li className="apz-item apz-item--esqueleto" aria-hidden="true">
			<div className="apz-linha">
				<div className="apz-linha__topo">
					<span className="apz-alternar">
						<span className="apz-nome body-strong">{NBSP}</span>
					</span>
					<span className="apz-materia body-sm">{NBSP}</span>
					<span className="apz-quando data">{NBSP}</span>
					<span className="apz-seta" />
				</div>
				<div className="apz-dominio">
					<span className="apz-barra" />
					<span className="apz-dominio__pct data">{NBSP}</span>
					<span className="apz-dominio__faixa overline">{NBSP}</span>
				</div>
				<dl className="apz-numeros">
					{["Acertos", "Erros", "Sessões", "Ganho"].map((rotulo) => (
						<Numero key={rotulo} rotulo={rotulo} valor={NBSP} dica="" />
					))}
					<Numero rotulo="Calibração" valor={NBSP} dica="" larga />
				</dl>
				<dl className="apz-dito">
					<Numero rotulo="Você disse" valor={NBSP} dica="" />
					<Numero rotulo="Você fez" valor={NBSP} dica="" />
				</dl>
			</div>
		</li>
	);
}

// --- A tela ------------------------------------------------------------------------------

export function TelaAprendiz(props: PropsTelaAprendiz) {
	const { aba, materia, materias, navegar } = props;
	const aberto = useIndicadores(props.janela);
	const { indicadores, erro } = aberto;
	const agora = useAgora();
	const baseIds = useId();
	const parado = semMovimento();

	// "Calculando…" só aparece se demorar mais de 1 s (regra 1 de docs/padroes-de-interface.md); até lá o esqueleto fica escondido, ocupando o lugar.
	const semDados = !indicadores && !erro;
	const mostraCarregando = useValorEstavel(semDados, semDados, false) && semDados;

	// Enquanto a lista de matérias não chegou, o nome do filtro espera (nada do id cru por um instante).
	const aguardandoMaterias = materias.length === 0;
	const todos = indicadores?.conceitos;
	const idsDosDados = useMemo(() => materiasDosDados(todos ?? []), [todos]);
	const doFiltro = useMemo(() => filtrarPorMateria(todos ?? [], materia), [todos, materia]);
	const lista = useMemo(() => ordenarConceitos(doFiltro), [doFiltro]);
	const resumo = useMemo(() => resumirConceitos(doFiltro), [doFiltro]);
	const nomeDoFiltro = materia ? (aguardandoMaterias ? NBSP : (nomeDaMateria(materia, materias) ?? materia)) : undefined;
	const tomDoFiltro = materia ? tomDaMateria(materia, materias) : "neutro";

	// Os conceitos com os detalhes abertos (a chave é a matéria e o conceito: sobrevive à troca de filtro).
	const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set());
	const alternar = (chave: string) =>
		setAbertos((atuais) => {
			const novos = new Set(atuais);
			if (!novos.delete(chave)) novos.add(chave);
			return novos;
		});

	const fase = erro ? "erro" : indicadores ? "dados" : "espera";
	const textoIgnorados = indicadores ? textoDosIgnorados(indicadores.ignorados) : "";

	return (
		<div className="aprendiz">
			<header className="ap-cbar agenda__barra aprendiz__barra">
				<button type="button" className="ap-cbar__back button" onClick={() => navegar(rotaDeVoltarDoAprendiz())}>
					<Icon name="arrow-left" size={18} strokeWidth={2.5} />
					Cadernos
				</button>
				<div className="ap-cbar__course aprendiz__titulo">
					<div className="ap-cbar__titles">
						<span className="ap-cbar__kicker overline">{nomeDoFiltro ?? "Todas as matérias"}</span>
						<h1 className="ap-cbar__title display-sm" style={{ margin: 0 }}>
							Perfil do aprendiz
						</h1>
					</div>
				</div>
				<SeletorAbas rotulo="Telas do perfil do aprendiz" abas={ABAS_DO_APRENDIZ} base={baseIds} atual={aba} escolher={(nova) => navegar(rotaDoAprendiz(nova, materia))} />
				<span className="agenda__espaco" />
				<div className="agenda__filtro">
					<span className={`agenda__tom ${classeDoTom(tomDoFiltro)}`} aria-hidden="true" style={materia && aguardandoMaterias ? { visibility: "hidden" } : undefined} />
					<Select
						size="sm"
						aria-label="Filtrar por matéria"
						options={opcoesDeMateriaAprendiz(idsDosDados, materias, materia, aguardandoMaterias)}
						value={materia ?? ""}
						onChange={(evento) => navegar(rotaDoAprendiz(aba, evento.target.value || undefined))}
					/>
				</div>
			</header>

			{/* O painel fica montado; só o conteúdo troca (esperando, erro ou dados), com um fade curto de opacidade (regra 7). */}
			<main id={idDoPainel(baseIds)} role="tabpanel" aria-labelledby={idDaAba(baseIds, aba)} className="aprendiz__corpo">
				<motion.div key={fase} className="aprendiz__aba" initial={parado ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
					{erro ? (
						<div className="aprendiz__erro" role="alert">
							<Icon name="alert" size={20} />
							<div className="aprendiz__erro-texto">
								<h2 className="heading" style={{ margin: 0 }}>
									Não consegui calcular os indicadores
								</h2>
								<p className="body" style={{ margin: 0 }}>
									{erro.mensagem}
								</p>
							</div>
							<Button variant="secondary" size="sm" icon="refresh" onClick={() => aberto.recarregar()} aria-busy={aberto.tentando}>
								<RotuloEstado ocupado={aberto.tentando} repouso="Tentar de novo" passageiro="Tentando…" />
							</Button>
						</div>
					) : !indicadores ? (
						<div className="aprendiz__espera" style={{ visibility: mostraCarregando ? "visible" : "hidden" }} aria-hidden={!mostraCarregando}>
							<p className="body aprendiz__carregando">Calculando os indicadores…</p>
							<Resumo />
							<ul className="apz-lista">
								<LinhaEsqueleto />
								<LinhaEsqueleto />
								<LinhaEsqueleto />
							</ul>
						</div>
					) : (
						<>
							<Resumo valores={resumo} />
							<p className="body-sm apz-legenda">{LEGENDA_DAS_FAIXAS}</p>
							{textoIgnorados ? (
								<p className="body-sm apz-ignorados">
									<Icon name="alert" size={16} />
									<span>{textoIgnorados}</span>
								</p>
							) : null}
							{lista.length === 0 ? (
								<div className="aprendiz__vazio">
									{indicadores.conceitos.length === 0 ? (
										<EmptyState glyph="知" title="Ainda não há indicadores">
											Os indicadores aparecem depois que você responde questões nos diagnósticos e nos módulos. Cada resposta vira uma observação do conceito, e daí saem o domínio, os acertos e erros e a calibração.
										</EmptyState>
									) : (
										<EmptyState glyph="知" title={`Sem observações em ${nomeDoFiltro ?? "esta matéria"}`}>
											Nenhum conceito dessa matéria tem respostas ainda. Escolha outra matéria ou volte para todas.
										</EmptyState>
									)}
								</div>
							) : (
								<ul className="apz-lista" aria-label="Conceitos, do menor domínio para o maior">
									{lista.map((conceito) => {
										const chave = chaveDoConceito(conceito);
										return (
											<LinhaConceito
												key={chave}
												conceito={conceito}
												aberto={abertos.has(chave)}
												alternar={() => alternar(chave)}
												nomeMateria={aguardandoMaterias ? "" : (nomeDaMateria(conceito.materia, materias) ?? conceito.materia)}
												tom={classeDoTom(tomDaMateria(conceito.materia, materias))}
												agora={agora}
												idDetalhes={`${baseIds}-det-${chave.replace(/\s+/g, "_")}`}
											/>
										);
									})}
								</ul>
							)}
						</>
					)}
				</motion.div>
			</main>
		</div>
	);
}
