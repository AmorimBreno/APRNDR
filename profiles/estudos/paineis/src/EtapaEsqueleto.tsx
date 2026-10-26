// A etapa Esqueleto do guia de curso (item 5, parte C, docs/cursos.md,
// "Parte C: o esqueleto e o curso pronto"). Sem proposta, "Montar o
// esqueleto" (gerar_esqueleto, com a espera do professor); com proposta, os
// módulos editáveis à esquerda e o calendário à direita (embaixo, em tela
// estreita). Cada edição aplica a operação pura de esqueleto-tipos.ts na hora
// (o calendário acompanha, calculado pelo código) e é salva com
// editar_esqueleto pelo salvamento adiado, um por vez; só vai para a extensão
// uma proposta que passa na validarModulos (um módulo vazio ou sem nome fica
// só nesta tela até ser consertado). Um erro do servidor volta a tela ao
// último estado salvo. O primário é "Criar curso" (criar_curso), que abre a
// visão do curso pronto.
//
// Num curso pronto, a etapa mostra o esqueleto criado e o calendário gravado,
// só para leitura. O calendário (Calendario) também é usado pela visão do
// curso pronto (TelaCurso.tsx).
//
// useEtapaEsqueleto devolve o corpo, o primário do rodapé do guia
// (TelaGuiaCurso.tsx) e os modais.

import { Button, Callout, Icon, Modal, pad2, Tag, TextField } from "@estudos/design-system";
import { AgenteAnimado, type DadosAvatarAgente, MenuSuspenso, semMovimento } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Curso, hojeLocal } from "../../lib/curso-tipos.ts";
import {
	adicionarModulo,
	apagarModulo,
	type CalendarioCurso,
	calcularCalendario,
	ehHorasModulo,
	HORAS_MODULO_MAXIMAS,
	HORAS_MODULO_MINIMAS,
	type Modulo,
	moverConceito,
	moverModulo,
	mudarHoras,
	mudarObjetivo,
	mudarTipo,
	NOMES_TIPO_MODULO,
	PASSO_HORAS_MODULO,
	renomearModulo,
	TIPOS_MODULO,
	type TipoModulo,
} from "../../lib/esqueleto-tipos.ts";
import type { Conceito } from "../../lib/mapa-tipos.ts";
import type { CursoAberto } from "./cursos-ponte.ts";
import { criarSalvadorAdiado, numeroCurto, type SalvadorAdiado } from "./diagnostico-tela.ts";
import {
	calendarioNaTela,
	destinoAoApagar,
	modulosEmVista,
	motivoCriarDesligado,
	opcoesMoverPara,
	problemaDosModulos,
	rotuloPrazo,
	textoHorasPorSemana,
	textoModulos,
} from "./esqueleto-tela.ts";
import type { MapaDaMateria } from "./mapa-ponte.ts";
import { CampoNoLugar } from "./SecaoMapa.tsx";

const MOLA = { type: "spring", stiffness: 420, damping: 36 } as const;
/** O atraso do salvamento da proposta depois da última edição. */
const ATRASO_EDICAO = 700;

const mensagemDe = (falha: unknown) => (falha instanceof Error ? falha.message : String(falha));

const OPCOES_TIPO_MODULO = TIPOS_MODULO.map((tipo) => ({ id: tipo, titulo: NOMES_TIPO_MODULO[tipo] }));

export interface PropsEtapaEsqueleto {
	curso: Curso | undefined;
	/** O curso aberto pela ponte (as ações e o que corre em segundo plano). */
	aberto: CursoAberto;
	/** O mapa da matéria (os nomes dos conceitos). */
	mapa: MapaDaMateria;
	/** O agente da sessão, para a foto enquanto a proposta é gerada. */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
	/** O aviso de erro do guia. */
	mostrarErro(mensagem: string | undefined): void;
	/** Depois de criar o curso: abre a visão dele. */
	abrirCurso(curso: Curso): void;
}

export interface EtapaEsqueleto {
	corpo: ReactNode;
	/** O primário do rodapé ("Montar o esqueleto" ou "Criar curso"); sem ele, o rodapé fica sem primário. */
	primario?: { texto: string; desligado?: string; acao(): void; ocupado?: boolean };
	modal: ReactNode;
	/** Há edições só nesta tela (a proposta não passa na validação, e por isso não foi salva): sair as perde. */
	naoSalvo: boolean;
}

/** A edição que vai para a extensão: os módulos e a geração das edições (as de uma geração velha não saem). */
interface Edicao {
	geracao: number;
	modulos: Modulo[];
}

export function useEtapaEsqueleto(props: PropsEtapaEsqueleto): EtapaEsqueleto {
	const { curso, aberto, mapa, mostrarErro } = props;
	const pronto = curso?.situacao === "pronto";
	const emAndamento = curso?.esqueletoEmAndamento ?? null;
	const conceitos = curso?.mapa?.conceitos ?? [];
	const porId = useMemo(() => new Map<string, Conceito>((mapa.mapa?.conceitos ?? []).map((conceito) => [conceito.id, conceito])), [mapa.mapa]);
	const nomeDe = (id: string) => porId.get(id)?.nome ?? id;

	// --- A proposta desta tela, salva sozinha ---------------------------------------
	const [locais, setLocais] = useState<{ geradoEm: string; modulos: Modulo[] } | undefined>(undefined);
	const modulos = pronto ? (curso?.esqueleto?.modulos ?? []) : modulosEmVista(emAndamento, locais);
	const [pendente, setPendente] = useState(false);
	/** Sobe quando as edições na fila não devem mais sair (um erro do servidor, gerar de novo). */
	const geracao = useRef(0);
	const editar = useRef(aberto.editarEsqueleto);
	editar.current = aberto.editarEsqueleto;
	const avisar = useRef(mostrarErro);
	avisar.current = mostrarErro;
	const salvador = useRef<SalvadorAdiado<Edicao> | undefined>(undefined);
	// Depois que o salvamento acaba (o salvador já soltou o voo), confere se ainda há algo esperando.
	const conferirPendente = () => setTimeout(() => setPendente(Boolean(salvador.current?.ocupado)), 0);
	salvador.current ??= criarSalvadorAdiado(
		async (edicao: Edicao) => {
			try {
				if (edicao.geracao === geracao.current) await editar.current(edicao.modulos);
			} finally {
				conferirPendente();
			}
		},
		ATRASO_EDICAO,
		(falha) => {
			// O servidor recusou: as edições na fila saem da fila, e a tela volta ao último estado salvo.
			geracao.current++;
			setLocais(undefined);
			avisar.current(mensagemDe(falha));
		},
	);
	// Saindo do guia: o que falta salvar sai já.
	useEffect(() => () => void salvador.current!.esvaziar(), []);

	const aplicar = (mudar: (atuais: Modulo[]) => Modulo[]) => {
		if (!emAndamento || pronto) return;
		let novos: Modulo[];
		try {
			novos = mudar(modulos);
		} catch (falha) {
			mostrarErro(mensagemDe(falha));
			return;
		}
		mostrarErro(undefined);
		setLocais({ geradoEm: emAndamento.geradoEm, modulos: novos });
		// Uma proposta que a extensão recusaria (módulo vazio, sem nome) fica só aqui até ser consertada.
		if (problemaDosModulos(novos, conceitos)) return;
		salvador.current!.mudar({ geracao: geracao.current, modulos: novos });
		setPendente(true);
	};

	// --- Gerar, criar e o que corre em segundo plano ----------------------------------
	const andamento = aberto.esqueleto;
	const [dispensados, setDispensados] = useState<ReadonlySet<string>>(() => new Set());
	const [pedindoGerar, setPedindoGerar] = useState(false);
	const [falhaGerar, setFalhaGerar] = useState<string | undefined>(undefined);
	const [perguntarGerar, setPerguntarGerar] = useState(false);
	const [criando, setCriando] = useState(false);
	const [apagando, setApagando] = useState<{ id: string; indice: number; nome: string } | undefined>(undefined);
	// O último pedido de apagar: o texto do modal continua enquanto ele fecha.
	const ultimoApagar = useRef(apagando);
	if (apagando) ultimoApagar.current = apagando;

	const erroGerar = andamento.erroGerar && !dispensados.has(andamento.erroGerar.chave) ? andamento.erroGerar.mensagem : falhaGerar;
	const gerando = !pronto && (andamento.gerando || pedindoGerar);

	const gerar = () => {
		setPerguntarGerar(false);
		setFalhaGerar(undefined);
		const chave = andamento.erroGerar?.chave;
		if (chave) setDispensados((atuais) => new Set(atuais).add(chave));
		setPedindoGerar(true);
		mostrarErro(undefined);
		// As edições desta proposta não saem mais: a nova a substitui.
		geracao.current++;
		setLocais(undefined);
		(async () => {
			await salvador.current!.esvaziar();
			await aberto.gerarEsqueleto();
		})()
			.catch((falha: unknown) => setFalhaGerar(mensagemDe(falha)))
			.finally(() => setPedindoGerar(false));
	};
	const criar = () => {
		if (!curso) return;
		setCriando(true);
		mostrarErro(undefined);
		(async () => {
			await salvador.current!.esvaziar();
			return aberto.criarCurso();
		})()
			.then((resposta) => props.abrirCurso(resposta.curso))
			.catch((falha: unknown) => mostrarErro(mensagemDe(falha)))
			.finally(() => setCriando(false));
	};
	const pedirApagar = (modulo: Modulo, indice: number) => {
		if (modulo.conceitos.length === 0) aplicar((atuais) => apagarModulo(atuais, modulo.id));
		else setApagando({ id: modulo.id, indice, nome: modulo.nome });
	};

	const naoSalvo = Boolean(
		!pronto && emAndamento && locais && locais.geradoEm === emAndamento.geradoEm && problemaDosModulos(locais.modulos, conceitos),
	);
	if (!curso) return { corpo: null, modal: null, naoSalvo: false };

	// --- O calendário: o gravado no curso pronto; senão, o de hoje ---------------------
	const basico = curso.basico;
	let calendario: CalendarioCurso | undefined;
	if (pronto) calendario = curso.esqueleto?.calendario;
	else if (basico && modulos.length > 0) {
		try {
			calendario = calcularCalendario(modulos, { horasPorSemana: basico.horasPorSemana, prazo: basico.prazo, hoje: hojeLocal() });
		} catch {
			calendario = undefined;
		}
	}

	let corpo: ReactNode;
	let primario: EtapaEsqueleto["primario"];
	const erroDeGerar = erroGerar ? <ErroGerar mensagem={erroGerar} tentar={gerar} /> : null;

	if (gerando) {
		corpo = (
			<Callout tone="steel" label="Gerando" icon="clock" quote={false}>
				<div className="diag__gerando">
					<AgenteAnimado nome={props.agente?.nome ?? "professor"} {...(props.agente?.avatar ? { avatar: props.agente.avatar } : {})} atividade="pensando" tamanho={48} />
					<p>O professor está montando os módulos…</p>
				</div>
			</Callout>
		);
	} else if (!pronto && !emAndamento) {
		corpo = (
			<>
				{erroDeGerar}
				<p className="body guia__texto">O professor agrupa os conceitos do curso em módulos, usando o diagnóstico, e o calendário sai das suas horas por semana e do prazo.</p>
			</>
		);
		primario = { texto: "Montar o esqueleto", acao: gerar };
	} else {
		const somenteLeitura = pronto;
		corpo = (
			<>
				{erroDeGerar}
				<div className="esq__topo">
					<span className="data esq__conta">
						{textoModulos(modulos.length)} · {conceitos.length} {conceitos.length === 1 ? "conceito" : "conceitos"}
					</span>
					{somenteLeitura ? null : (
						<Button variant="ghost" size="sm" icon="refresh" onClick={() => setPerguntarGerar(true)}>
							Gerar de novo
						</Button>
					)}
				</div>
				<div className="esq">
					<div className="esq__grade">
						<div className="esq__modulos">
							<ul className="esq__lista">
								<AnimatePresence initial={false}>
									{modulos.map((modulo, indice) => (
										<BlocoModulo
											key={modulo.id}
											modulo={modulo}
											indice={indice}
											total={modulos.length}
											nomeDe={nomeDe}
											outros={opcoesMoverPara(modulos, modulo.id)}
											somenteLeitura={somenteLeitura}
											aplicar={aplicar}
											apagar={() => pedirApagar(modulo, indice)}
										/>
									))}
								</AnimatePresence>
							</ul>
							{somenteLeitura ? null : (
								<div className="esq__novo">
									<Button variant="ghost" icon="plus" onClick={() => aplicar((atuais) => adicionarModulo(atuais))}>
										Módulo novo
									</Button>
								</div>
							)}
						</div>
						<aside className="esq__lado" aria-label="Calendário">
							{calendario ? (
								<Calendario
									modulos={modulos}
									calendario={calendario}
									prazo={rotuloPrazo(basico)}
									{...(basico ? { horasPorSemana: basico.horasPorSemana } : {})}
								/>
							) : null}
						</aside>
					</div>
				</div>
			</>
		);
		if (!somenteLeitura) {
			const motivo = motivoCriarDesligado(modulos, conceitos, pendente);
			primario = { texto: "Criar curso", acao: criar, ocupado: criando, ...(motivo ? { desligado: motivo } : {}) };
		}
	}

	const alvo = ultimoApagar.current;
	const modal = (
		<>
			<Modal
				open={perguntarGerar}
				onClose={() => setPerguntarGerar(false)}
				kicker={curso.nome}
				title="Gerar outro esqueleto?"
				size="sm"
				tone="brick"
				footer={
					<>
						<Button variant="secondary" onClick={() => setPerguntarGerar(false)}>
							Manter este
						</Button>
						<Button variant="danger" onClick={gerar}>
							Gerar outro
						</Button>
					</>
				}
			>
				<p className="body">As suas edições nesta proposta se perdem.</p>
			</Modal>
			<Modal
				open={Boolean(apagando)}
				onClose={() => setApagando(undefined)}
				kicker={curso.nome}
				title={`Apagar o módulo ${pad2((alvo?.indice ?? 0) + 1)}${alvo?.nome.trim() ? ` (${alvo.nome.trim()})` : ""}?`}
				size="sm"
				tone="brick"
				footer={
					<>
						<Button variant="secondary" onClick={() => setApagando(undefined)}>
							Manter
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								const id = apagando?.id;
								setApagando(undefined);
								if (id) aplicar((atuais) => apagarModulo(atuais, id));
							}}
						>
							Apagar
						</Button>
					</>
				}
			>
				<p className="body">{destinoAoApagar(alvo?.indice ?? 0)}</p>
			</Modal>
		</>
	);

	return { corpo, ...(primario ? { primario } : {}), modal, naoSalvo };
}

function ErroGerar({ mensagem, tentar }: { mensagem: string; tentar(): void }) {
	return (
		<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
			<p>{mensagem}</p>
			<div className="diag__botoes">
				<Button variant="secondary" size="sm" icon="refresh" onClick={tentar}>
					Tentar de novo
				</Button>
			</div>
		</Callout>
	);
}

interface PropsBloco {
	modulo: Modulo;
	indice: number;
	total: number;
	nomeDe(id: string): string;
	/** Os outros módulos, para o "Mover para…" dos conceitos. */
	outros: Array<{ id: string; titulo: string }>;
	somenteLeitura: boolean;
	aplicar(mudar: (atuais: Modulo[]) => Modulo[]): void;
	apagar(): void;
}

/** Um módulo da proposta: o número, o nome e o objetivo (no lugar), o tipo, as horas, os conceitos e as ações. */
function BlocoModulo(props: PropsBloco) {
	const { modulo, indice, total, somenteLeitura, aplicar } = props;
	const numero = pad2(indice + 1);
	const nome = modulo.nome.trim() || `Módulo ${numero}`;
	const comMovimento = !semMovimento();
	return (
		<motion.li
			layout={comMovimento ? "position" : false}
			className={`esq__modulo${modulo.conceitos.length === 0 ? " esq__modulo--vazio" : ""}`}
			initial={comMovimento ? { opacity: 0, y: -8 } : false}
			animate={{ opacity: 1, y: 0 }}
			exit={comMovimento ? { opacity: 0, scale: 0.98, transition: { duration: 0.14 } } : { opacity: 0, transition: { duration: 0 } }}
			transition={MOLA}
		>
			<div className="esq__cabeca">
				<div className="esq__titulos">
					<span className="data esq__numero">Módulo {numero}</span>
					{somenteLeitura ? (
						<>
							<span className="heading esq__nome">{modulo.nome}</span>
							{modulo.objetivo ? <span className="body-sm esq__objetivo">{modulo.objetivo}</span> : null}
						</>
					) : (
						<>
							<CampoNoLugar
								valor={modulo.nome}
								rotulo={`Nome do módulo ${numero}`}
								classe="heading esq__nome"
								vazio="Sem nome"
								obrigatorio
								salvar={(valor) => aplicar((atuais) => renomearModulo(atuais, modulo.id, valor))}
							/>
							<CampoNoLugar
								valor={modulo.objetivo}
								rotulo={`Objetivo do módulo ${numero}`}
								classe="body-sm esq__objetivo"
								vazio="Sem objetivo"
								longo
								salvar={(valor) => aplicar((atuais) => mudarObjetivo(atuais, modulo.id, valor))}
							/>
						</>
					)}
				</div>
				<div className="esq__controles">
					{somenteLeitura ? (
						<>
							<span className="body-sm esq__tipo-texto">{NOMES_TIPO_MODULO[modulo.tipo]}</span>
							<span className="data esq__horas-texto">{numeroCurto(modulo.horas)} h</span>
						</>
					) : (
						<>
							<MenuSuspenso
								opcoes={OPCOES_TIPO_MODULO}
								atual={modulo.tipo}
								escolher={(valor) => aplicar((atuais) => mudarTipo(atuais, modulo.id, valor as TipoModulo))}
								conteudoBotao={<span className="body-sm">{NOMES_TIPO_MODULO[modulo.tipo]}</span>}
								classeBotao="esq__tipo-botao"
								rotulo={`Tipo do módulo ${numero}: ${NOMES_TIPO_MODULO[modulo.tipo]}`}
								rotuloMenu="Tipo do módulo"
								className="esq__tipo"
							/>
							<CampoHoras valor={modulo.horas} rotulo={`Horas do módulo ${numero}`} mudar={(horas) => aplicar((atuais) => mudarHoras(atuais, modulo.id, horas))} />
							<span className="esq__acoes">
								<Button
									variant="ghost"
									size="sm"
									iconOnly
									icon="arrow-up"
									aria-label={`Subir o módulo ${numero}`}
									title="Subir"
									disabled={indice === 0}
									onClick={() => aplicar((atuais) => moverModulo(atuais, modulo.id, "subir"))}
								/>
								<Button
									variant="ghost"
									size="sm"
									iconOnly
									icon="arrow-up"
									className="esq__descer"
									aria-label={`Descer o módulo ${numero}`}
									title="Descer"
									disabled={indice === total - 1}
									onClick={() => aplicar((atuais) => moverModulo(atuais, modulo.id, "descer"))}
								/>
								{total > 1 ? (
									<Button variant="ghost" size="sm" iconOnly icon="close" aria-label={`Apagar o módulo ${numero}`} title="Apagar" onClick={props.apagar} />
								) : null}
							</span>
						</>
					)}
				</div>
			</div>
			{modulo.conceitos.length === 0 ? (
				<p className="body-sm esq__vazio">Mova conceitos para cá pelo menu dos conceitos.</p>
			) : (
				<div className="esq__conceitos">
					{modulo.conceitos.map((id) =>
						somenteLeitura || props.outros.length === 0 ? (
							<Tag key={id} size="sm">
								{props.nomeDe(id)}
							</Tag>
						) : (
							<MenuSuspenso
								key={id}
								opcoes={props.outros}
								atual={modulo.id}
								escolher={(destino) => aplicar((atuais) => moverConceito(atuais, id, destino))}
								conteudoBotao={<Tag size="sm">{props.nomeDe(id)}</Tag>}
								classeBotao="esq__conceito-botao"
								rotulo={`${props.nomeDe(id)}, no módulo ${numero} (${nome}): mover para outro módulo`}
								rotuloMenu="Mover para…"
								className="esq__conceito"
							/>
						),
					)}
				</div>
			)}
		</motion.li>
	);
}

/** As horas do módulo: um campo numérico pequeno (passo de 0,5) com "h". Salva quando o número é válido, e ao sair (arredondado). */
function CampoHoras(props: { valor: number; rotulo: string; mudar(horas: number): void }) {
	const [texto, setTexto] = useState(String(props.valor));
	useEffect(() => setTexto(String(props.valor)), [props.valor]);
	const ler = (valor: string) => {
		const numero = Number(valor.trim().replace(",", "."));
		return valor.trim() && Number.isFinite(numero) ? numero : undefined;
	};
	return (
		<span className="esq__horas">
			<TextField
				type="number"
				min={HORAS_MODULO_MINIMAS}
				max={HORAS_MODULO_MAXIMAS}
				step={PASSO_HORAS_MODULO}
				value={texto}
				aria-label={props.rotulo}
				className="esq__horas-campo"
				onChange={(evento) => {
					setTexto(evento.target.value);
					const numero = ler(evento.target.value);
					if (numero !== undefined && ehHorasModulo(numero) && numero !== props.valor) props.mudar(numero);
				}}
				onBlur={() => {
					const numero = ler(texto);
					if (numero !== undefined && numero !== props.valor) props.mudar(numero);
					setTexto(String(props.valor));
				}}
				onKeyDown={(evento) => {
					if (evento.key === "Enter") (evento.target as HTMLInputElement).blur();
				}}
			/>
			<span className="data esq__horas-unidade" aria-hidden="true">
				h
			</span>
		</span>
	);
}

export interface PropsCalendario {
	modulos: ReadonlyArray<Pick<Modulo, "id" | "nome" | "horas">>;
	calendario: CalendarioCurso;
	/** "Prazo: P1 em 20/11" ou "Sem prazo" (rotuloPrazo). */
	prazo: string;
	horasPorSemana?: number;
}

/** O calendário do curso: o prazo e as horas por semana, os avisos, uma linha por módulo (como a linha do tempo do caderno) e a avaliação geral. */
export function Calendario(props: PropsCalendario) {
	const tela = calendarioNaTela(props.modulos, props.calendario);
	return (
		<section className="esq__calendario" aria-label="Calendário do curso">
			<header className="esq__cal-topo">
				<span className="overline">Calendário</span>
				<span className="body-strong">{props.prazo}</span>
				{props.horasPorSemana !== undefined ? <span className="body-sm esq__cal-meta">{textoHorasPorSemana(props.horasPorSemana)}</span> : null}
			</header>
			{tela.avisos.map((aviso) => (
				<Callout key={aviso} tone="amber" label="Atenção" icon="alert" quote={false}>
					<p>{aviso}</p>
				</Callout>
			))}
			<ol className="esq__cal-lista">
				{tela.linhas.map((linha) => (
					<li key={linha.id} className="esq__cal-item">
						<span className="esq__cal-marca data" aria-hidden="true">
							{linha.numero}
						</span>
						<span className="esq__cal-texto">
							<span className="body-strong esq__cal-nome">{linha.titulo}</span>
							<span className="body-sm esq__cal-datas">{linha.periodo}</span>
							<span className="body-sm esq__cal-datas">
								<Icon name="checklist" size={14} strokeWidth={2.5} /> {linha.avaliacao}
							</span>
						</span>
					</li>
				))}
				<li className="esq__cal-item esq__cal-item--geral">
					<span className="esq__cal-marca" aria-hidden="true">
						<Icon name="flag" size={16} strokeWidth={2.5} />
					</span>
					<span className="esq__cal-texto">
						<span className="body-strong">{tela.avaliacaoGeral}</span>
					</span>
				</li>
			</ol>
			<p className="body-sm esq__cal-resumo">{tela.resumo}</p>
		</section>
	);
}
