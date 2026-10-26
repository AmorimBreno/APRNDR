// O guia de criação de curso (item 5, parte A, docs/cursos.md): uma tela
// inteira sobre o caderno, em caderno/<matéria>/cursos/novo (antes de existir
// o rascunho) e caderno/<matéria>/cursos/<curso>/guia[/<etapa>] (F5 volta na
// mesma etapa; sem etapa, a do curso.json).
//
// Uma folha centrada: em cima, onde você está, o nome do curso e "Sair"; o
// trilho das seis etapas (feita = confirmada; dá para abrir as confirmadas e
// a primeira não confirmada); o corpo da etapa numa coluna de leitura; e o
// rodapé com "Voltar" (só troca a etapa em vista) e o primário, que confirma
// a etapa pela extensão dos cursos (cursos-ponte.ts) e anda para a próxima.
// Confirmar com algo diferente avisa antes o que a mudança descarta
// (oQueInvalida). A etapa Diagnóstico (parte B) fica em EtapaDiagnostico.tsx,
// que dá o corpo, o primário e o "Voltar" dela; o Esqueleto chega na parte C.

import { Button, Callout, EmptyState, Icon, Modal, pad2, RadioGroup, TextArea, TextField, type Tone } from "@estudos/design-system";
import type { DadosAvatarAgente, JanelaPerfilHook, SituacaoMaterial } from "@estudos/ui";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
	conceitosForaDoMapa,
	type Curso,
	type DadosObjetivo,
	ErroCurso,
	ETAPAS,
	type Etapa,
	hojeLocal,
	iguais,
	materiaisMudaram,
	nomeDaEtapa,
	oQueInvalida,
	validarEtapa,
} from "../../lib/curso-tipos.ts";
import { pastaMateriaisRelativa, type Materia } from "../../lib/materia-tipos.ts";
import { novoIdConceito } from "../../lib/mapa-tipos.ts";
import { type CursosDaMateria, useCurso } from "./cursos-ponte.ts";
import {
	caminhoDoGuia,
	campoDoErroBasico,
	desmarcadosIniciais,
	entradaBasico,
	etapaDepois,
	etapaEmVista,
	type FormBasico,
	formBasico,
	formObjetivo,
	marcados as idsMarcados,
	motivoMapaParado,
	OPCOES_ESCOPO,
	OPCOES_TIPO,
	podeAbrir,
	processando,
	provasFuturas,
	rotuloDaProva,
	textoPrimarioMapa,
	textoSelecao,
	valorDaProva,
} from "./guia-curso.ts";
import type { MapaDaMateria } from "./mapa-ponte.ts";
import { useEtapaDiagnostico } from "./EtapaDiagnostico.tsx";
import { ConteudoMateriais } from "./ModalMateriais.tsx";
import { AvisosMapa, ConceitoNovo, ForaDoMapa, ListaConceitos, ProgressoMapa, useOperarMapa } from "./SecaoMapa.tsx";

const MOLA = { type: "spring", stiffness: 380, damping: 32 } as const;

/** "Mapa", "Mapa e Esqueleto", "Mapa, Diagnóstico e Esqueleto". */
function emLista(etapas: readonly Etapa[]): string {
	const nomes = etapas.map(nomeDaEtapa);
	return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

const mensagemDe = (falha: unknown) => (falha instanceof Error ? falha.message : String(falha));

export interface PropsGuiaCurso {
	janela: JanelaPerfilHook;
	materiaId: string;
	materia?: Materia;
	/** O id do curso; sem ele, o guia de um curso novo (só a etapa Básico). */
	cursoId?: string;
	/** A etapa da rota (pode ser qualquer texto: vale só se dá para abrir). */
	etapa?: string;
	mapa: MapaDaMateria;
	cursos: CursosDaMateria;
	/** Os materiais da pasta da matéria; undefined = a lista ainda não chegou. */
	materiais?: SituacaoMaterial[];
	navegar(caminho: string): void;
	/** Cor da capa, para os blocos de ideograma. */
	tom: Tone;
	/** O agente da sessão (a foto enquanto o diagnóstico é gerado). */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
}

type ErrosBasico = Partial<Record<"nome" | "prazo" | "horas", string>>;

export function TelaGuiaCurso(props: PropsGuiaCurso) {
	const { materiaId, mapa } = props;
	const aberto = useCurso(props.janela, materiaId, props.cursoId);
	const { curso, erro: erroAbrir, prontos, pedirProntos, confirmar } = aberto;
	const provas = useMemo(() => provasFuturas(props.materia, new Date()), [props.materia]);
	const vista = etapaEmVista(curso, props.etapa);
	const materiais = props.materiais ?? [];
	// Mudou quantos materiais prontos a matéria tem: pede de novo os prontos (com o hash) à extensão (só a contagem importa).
	const quantosProntos = materiais.filter((material) => material.estado === "pronto").length;
	const prontosAntes = useRef(quantosProntos);
	useEffect(() => {
		if (prontosAntes.current === quantosProntos) return;
		prontosAntes.current = quantosProntos;
		pedirProntos();
	}, [quantosProntos]);
	const operar = useOperarMapa(mapa);
	const irPara = (etapa: Etapa) => (curso ? props.navegar(caminhoDoGuia(materiaId, curso.id, etapa)) : undefined);
	const voltarAosCursos = () => props.navegar(`caderno/${materiaId}/cursos`);

	// Os campos de cada etapa; voltam ao salvo quando a etapa em vista muda ou o curso muda (uma confirmação).
	const [basico, setBasico] = useState<FormBasico>(() => formBasico(curso, provas));
	const [objetivo, setObjetivo] = useState<DadosObjetivo>(() => formObjetivo(curso));
	const [desmarcados, setDesmarcados] = useState<ReadonlySet<string>>(() => new Set());
	/** A seleção do Mapa já partiu do curso (o mapa pode chegar depois da etapa abrir). */
	const selecaoIniciada = useRef(false);
	/** Algo mudou nos campos desde que a etapa abriu. */
	const [mexido, setMexido] = useState(false);
	const [errosBasico, setErrosBasico] = useState<ErrosBasico>({});
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [salvando, setSalvando] = useState(false);
	const [aviso, setAviso] = useState<{ etapas: Etapa[]; seguir(): void } | undefined>(undefined);
	const [perguntarSair, setPerguntarSair] = useState(false);
	// O último aviso: o texto do modal continua enquanto ele fecha.
	const ultimoAviso = useRef(aviso);
	if (aviso) ultimoAviso.current = aviso;

	const diagnostico = useEtapaDiagnostico({
		curso,
		aberto,
		mapa,
		...(props.agente ? { agente: props.agente } : {}),
		ativo: vista === "diagnostico",
		mostrarErro: setErro,
		seguir: (novo) => props.navegar(caminhoDoGuia(materiaId, novo.id, etapaDepois(novo, "diagnostico"))),
	});

	const reverter = () => {
		setBasico(formBasico(curso, provas));
		setObjetivo(formObjetivo(curso));
		const estadoMapa = mapa.estado;
		setDesmarcados(estadoMapa ? desmarcadosIniciais(estadoMapa.mapa, curso) : new Set());
		selecaoIniciada.current = Boolean(estadoMapa);
		setMexido(false);
		setErrosBasico({});
	};
	const chave = `${vista}|${curso?.id ?? ""}|${curso?.alteradoEm ?? ""}`;
	// Só a chave importa: reverter lê o curso, as provas e o mapa de agora.
	useEffect(() => {
		reverter();
		setErro(undefined);
	}, [chave]);
	// A matéria (e as provas) pode chegar depois: o padrão do prazo acompanha enquanto nada foi mexido.
	const chaveProvas = provas.map(valorDaProva).join("\n");
	useEffect(() => {
		if (!mexido) setBasico(formBasico(curso, provas));
	}, [chaveProvas]);
	// O mapa chegou depois de a etapa abrir: a seleção parte do curso agora.
	useEffect(() => {
		if (selecaoIniciada.current || !mapa.estado) return;
		selecaoIniciada.current = true;
		setDesmarcados(desmarcadosIniciais(mapa.estado.mapa, curso));
	}, [mapa.estado, curso]);

	// "Aprovar o mapa e continuar": espera o mapa do servidor chegar aprovado (ou um erro novo do mapa).
	const esperaAprovar = useRef<{ resolver(): void; rejeitar(erro: Error): void; erros: Set<string> } | undefined>(undefined);
	useEffect(() => {
		const espera = esperaAprovar.current;
		if (!espera) return;
		const novo = mapa.erros.find((item) => !espera.erros.has(item.chave));
		if (novo) {
			esperaAprovar.current = undefined;
			espera.rejeitar(new Error(novo.mensagem));
		} else if (mapa.estado?.mapa.situacao === "aprovado") {
			esperaAprovar.current = undefined;
			espera.resolver();
		}
	}, [mapa.estado, mapa.erros]);
	const aprovarMapa = () =>
		new Promise<void>((resolver, rejeitar) => {
			esperaAprovar.current = { resolver, rejeitar, erros: new Set(mapa.erros.map((item) => item.chave)) };
			mapa.aprovar();
		});

	// Os marcados da etapa Mapa (do mapa como a tela mostra: um conceito novo já vem marcado).
	const mapaVisto = mapa.mapa;
	const marcadosIds = useMemo(() => (mapaVisto ? idsMarcados(mapaVisto, desmarcados) : []), [mapaVisto, desmarcados]);
	const marcadosSet = useMemo(() => new Set(marcadosIds), [marcadosIds]);

	const entrada = entradaBasico(basico, provas);
	const sujo = (() => {
		if (vista === "basico") return curso?.basico ? !iguais("basico", curso.basico, entrada) || basico.nome.trim() !== curso.nome : mexido;
		if (vista === "objetivo") return curso?.objetivo ? !iguais("objetivo", curso.objetivo, objetivo) : mexido;
		if (vista === "mapa") return curso?.mapa ? !iguais("mapa", curso.mapa, { conceitos: marcadosIds }) : mexido;
		return false;
	})();

	/** Confirma a etapa: avisa antes o que ela descarta; depois anda para a próxima. */
	const confirmarComAviso = (etapa: Etapa, dados: unknown, paraComparar: unknown, antes?: () => Promise<void>) => {
		if (!curso) return;
		const seguir = () => {
			setAviso(undefined);
			setSalvando(true);
			setErro(undefined);
			(async () => {
				await antes?.();
				const resposta = await confirmar(etapa, dados as never);
				setMexido(false);
				props.navegar(caminhoDoGuia(materiaId, resposta.curso.id, etapaDepois(resposta.curso, etapa)));
			})()
				.catch((falha: unknown) => setErro(mensagemDe(falha)))
				.finally(() => setSalvando(false));
		};
		const etapas = oQueInvalida(curso, etapa, paraComparar as never);
		if (etapas.length > 0) setAviso({ etapas, seguir });
		else seguir();
	};

	const continuar = () => {
		if (salvando) return;
		setErro(undefined);
		setErrosBasico({});
		try {
			if (vista === "basico") {
				const limpo = validarEtapa("basico", entrada, { hoje: hojeLocal() });
				if (!curso) {
					setSalvando(true);
					props.cursos
						.comecar(limpo)
						.then((novo) => {
							setMexido(false);
							props.navegar(caminhoDoGuia(materiaId, novo.id, "materiais"));
						})
						.catch((falha: unknown) => setErro(mensagemDe(falha)))
						.finally(() => setSalvando(false));
					return;
				}
				confirmarComAviso("basico", limpo, limpo);
			} else if (vista === "materiais" && curso) {
				// A extensão monta a lista com os prontos do disco; o aviso compara com os prontos que ela mandou com o curso.
				confirmarComAviso("materiais", {}, prontos ? { arquivos: prontos } : (curso.materiais ?? { arquivos: [] }));
			} else if (vista === "objetivo" && curso) {
				const limpo = validarEtapa("objetivo", objetivo, { curso });
				confirmarComAviso("objetivo", limpo, limpo);
			} else if (vista === "mapa" && curso && mapa.estado) {
				const dados = { conceitos: marcadosIds };
				const aprovado = mapa.estado.mapa.situacao === "aprovado";
				if (aprovado) validarEtapa("mapa", dados, { mapa: mapa.estado.mapa });
				confirmarComAviso("mapa", dados, dados, aprovado ? undefined : aprovarMapa);
			}
		} catch (falha) {
			if (!(falha instanceof ErroCurso)) return setErro(mensagemDe(falha));
			const campo = vista === "basico" ? campoDoErroBasico(falha.message) : undefined;
			if (campo && (campo !== "prazo" || basico.escolha === "outra")) setErrosBasico({ [campo]: falha.message });
			else setErro(falha.message);
		}
	};

	const sair = () => (sujo ? setPerguntarSair(true) : voltarAosCursos());
	const indice = ETAPAS.indexOf(vista);
	const anterior = indice > 0 ? ETAPAS[indice - 1] : undefined;

	// --- O corpo e o primário de cada etapa ---------------------------------------

	let corpo: ReactNode;
	/** acao: no lugar de continuar (a etapa Diagnóstico); ocupado: o botão mostra "Salvando…". */
	let primario: { texto: string; desligado?: string; acao?: () => void; ocupado?: boolean } | undefined;
	const materia = props.materia?.nome ?? "a matéria";

	if (props.cursoId && !curso) {
		corpo = erroAbrir ? (
			<EmptyState
				glyph="問"
				tone={props.tom}
				title="Não achei este curso"
				action={
					<Button variant="primary" icon="arrow-left" onClick={voltarAosCursos}>
						Voltar para os cursos
					</Button>
				}
			>
				{erroAbrir}
			</EmptyState>
		) : (
			<p className="body caderno__carregando">Abrindo o curso…</p>
		);
	} else if (vista === "basico") {
		const mudar = (mudanca: Partial<FormBasico>) => {
			setBasico((atual) => ({ ...atual, ...mudanca }));
			setMexido(true);
		};
		const opcoes = [
			...provas.map((prova) => ({ value: valorDaProva(prova), label: rotuloDaProva(prova) })),
			{ value: "outra", label: "Outra data" },
			{ value: "sem", label: "Sem prazo" },
		];
		corpo = (
			<>
				<TextField
					label="Nome do curso"
					placeholder="Ex.: P1 de Ciência de Dados"
					value={basico.nome}
					onChange={(evento) => mudar({ nome: evento.target.value })}
					maxLength={80}
					autoFocus={!curso}
					{...(errosBasico.nome ? { error: errosBasico.nome } : {})}
				/>
				<div className="guia__grupo">
					<RadioGroup legend="Prazo" options={opcoes} value={basico.escolha} onChange={(valor) => mudar({ escolha: valor })} />
					{basico.escolha === "outra" ? (
						<motion.div className="guia__data" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={MOLA}>
							<TextField
								type="date"
								label="Data"
								min={hojeLocal()}
								value={basico.outraData}
								onChange={(evento) => mudar({ outraData: evento.target.value })}
								{...(errosBasico.prazo ? { error: errosBasico.prazo } : {})}
							/>
						</motion.div>
					) : null}
				</div>
				<TextField
					type="number"
					label="Horas por semana"
					min={1}
					max={60}
					step={0.5}
					value={basico.horas}
					onChange={(evento) => mudar({ horas: evento.target.value })}
					hint="Quanto tempo você consegue estudar esta matéria por semana."
					className="guia__horas"
					{...(errosBasico.horas ? { error: errosBasico.horas } : {})}
				/>
			</>
		);
		primario = { texto: "Continuar" };
	} else if (vista === "materiais" && curso) {
		const quantos = processando(materiais);
		corpo = (
			<>
				<p className="body guia__texto">Os materiais são da matéria: o que você adicionar aqui vale também para os outros cursos dela.</p>
				{quantos > 0 ? (
					<Callout tone="steel" label="Processando" icon="clock" quote={false}>
						<p>
							{quantos === 1 ? "1 arquivo ainda processando" : `${quantos} arquivos ainda processando`}; você pode seguir, eles continuam em segundo plano.
						</p>
					</Callout>
				) : null}
				<ConteudoMateriais
					{...(props.materiais ? { materiais: props.materiais } : {})}
					pasta={pastaMateriaisRelativa(materiaId)}
					enviar={(arquivos) => props.janela.acoes.enviarMateriais(pastaMateriaisRelativa(materiaId), arquivos)}
					reprocessar={(caminho) => props.janela.acoes.reprocessarMaterial(caminho)}
				/>
			</>
		);
		primario = { texto: materiais.length === 0 ? "Continuar sem material" : "Continuar" };
	} else if (vista === "objetivo" && curso) {
		const semMaterial = !curso.materiais?.arquivos.length;
		const mudar = (mudanca: Partial<DadosObjetivo>) => {
			setObjetivo((atual) => ({ ...atual, ...mudanca }));
			setMexido(true);
		};
		const escopos = OPCOES_ESCOPO.map((opcao) =>
			opcao.value === "so_material" && semMaterial ? { ...opcao, disabled: true, description: "Precisa de material: volte à etapa Materiais." } : opcao,
		);
		corpo = (
			<>
				<RadioGroup legend="Escopo" options={escopos} value={objetivo.escopo} onChange={(valor) => mudar({ escopo: valor as DadosObjetivo["escopo"] })} />
				<RadioGroup legend="Tipo" options={[...OPCOES_TIPO]} value={objetivo.tipo} onChange={(valor) => mudar({ tipo: valor as DadosObjetivo["tipo"] })} />
				<TextArea
					label="Por que você vai estudar isto"
					value={objetivo.motivo}
					onChange={(evento) => mudar({ motivo: evento.target.value })}
					hint="O professor usa isto para escolher exemplos e o ritmo."
					rows={3}
				/>
			</>
		);
		primario = { texto: "Continuar" };
	} else if (vista === "mapa" && curso) {
		const estadoMapa = mapa.estado;
		if (!estadoMapa || !mapaVisto) {
			corpo = (
				<>
					<AvisosMapa mapa={mapa} />
					<p className="body caderno__carregando">Abrindo o mapa…</p>
				</>
			);
			primario = { texto: "Continuar", desligado: "Esperando o mapa abrir." };
		} else {
			const dentro = mapaVisto.conceitos.filter((conceito) => !conceito.fora);
			const semMaterial = !curso.materiais?.arquivos.length;
			const vazio = mapaVisto.conceitos.length === 0 && estadoMapa.pendentes.length === 0 && !estadoMapa.andamento && estadoMapa.fila.length === 0 && !estadoMapa.montandoTema;
			const doTema = vazio && semMaterial && curso.objetivo?.escopo === "livre";
			const mudaram = Boolean(curso.materiais && prontos) && materiaisMudaram(curso, prontos ?? []);
			const sairam = conceitosForaDoMapa(curso, estadoMapa.mapa).length;
			const alternar = (id: string) => {
				setDesmarcados((atuais) => {
					const novos = new Set(atuais);
					if (novos.has(id)) novos.delete(id);
					else novos.add(id);
					return novos;
				});
				setMexido(true);
			};
			const todos = (marcar: boolean) => {
				setDesmarcados(marcar ? new Set() : new Set(dentro.map((conceito) => conceito.id)));
				setMexido(true);
			};
			const adicionar = (nome: string, descricao: string) => operar([{ tipo: "adicionar", id: novoIdConceito(), nome, ...(descricao ? { descricao } : {}) }]);
			corpo = (
				<div className="mapa guia__mapa">
					<AvisosMapa mapa={mapa} />
					{mudaram ? (
						<Callout tone="amber" label="Atenção" icon="alert" quote={false}>
							<p>Os materiais mudaram desde a etapa Materiais.</p>
							<div className="mapa__botoes">
								<Button variant="secondary" size="sm" icon="paperclip" onClick={() => irPara("materiais")}>
									Rever materiais
								</Button>
							</div>
						</Callout>
					) : null}
					{sairam > 0 ? (
						<Callout tone="amber" label="Atenção" icon="alert" quote={false}>
							<p>
								{sairam === 1 ? "1 conceito do curso saiu do mapa" : `${sairam} conceitos do curso saíram do mapa`}. Confirme esta etapa de novo para o curso
								ficar só com os de dentro.
							</p>
						</Callout>
					) : null}
					<ProgressoMapa mapa={mapa} tema={curso.nome} />
					{doTema ? (
						<>
							<EmptyState
								glyph="知"
								tone={props.tom}
								title="Sem mapa ainda"
								action={
									<Button
										variant="secondary"
										icon="bulb"
										onClick={() => mapa.doTema(curso.nome, curso.objetivo?.tipo, curso.objetivo?.motivo)}
									>
										Montar a partir do tema
									</Button>
								}
							>
								O professor monta os conceitos de {curso.nome} a partir do tema e do objetivo; ou escreva os conceitos à mão em Conceito novo.
							</EmptyState>
							<ConceitoNovo adicionar={adicionar} />
						</>
					) : (
						<>
							{dentro.length > 0 ? (
								<div className="guia__selecao">
									<span className="data guia__selecao-conta">{textoSelecao(marcadosIds.length, dentro.length)}</span>
									<span className="guia__selecao-botoes">
										<Button variant="ghost" size="sm" onClick={() => todos(true)} disabled={marcadosIds.length === dentro.length}>
											Marcar todos
										</Button>
										<Button variant="ghost" size="sm" onClick={() => todos(false)} disabled={marcadosIds.length === 0}>
											Desmarcar todos
										</Button>
									</span>
								</div>
							) : null}
							<ListaConceitos
								conceitos={mapaVisto.conceitos}
								operar={operar}
								abrirMaterial={(arquivo) => props.navegar(`caderno/${materiaId}/materiais/${arquivo}`)}
								selecao={{ marcados: marcadosSet, alternar }}
							/>
							<ConceitoNovo adicionar={adicionar} />
							<ForaDoMapa conceitos={mapaVisto.conceitos} operar={operar} />
						</>
					)}
				</div>
			);
			const parado = motivoMapaParado(estadoMapa, marcadosIds.length);
			primario = { texto: textoPrimarioMapa(estadoMapa.mapa), ...(parado ? { desligado: parado } : {}) };
		}
	} else if (vista === "diagnostico" && curso) {
		corpo = diagnostico.corpo;
		primario = diagnostico.primario;
	} else {
		corpo = (
			<EmptyState
				glyph="問"
				tone={props.tom}
				title="O esqueleto chega na próxima parte"
				action={
					<Button variant="primary" icon="arrow-left" onClick={voltarAosCursos}>
						Voltar para os cursos
					</Button>
				}
			>
				Seu rascunho está salvo; você pode sair e voltar depois.
			</EmptyState>
		);
	}

	const overline = curso ? `${curso.situacao === "pronto" ? "Curso" : "Curso em rascunho"} · ${materia}` : `Novo curso · ${materia}`;

	return (
		<div className="guia">
			<motion.section className="guia__folha" aria-labelledby="guia-titulo" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={MOLA}>
				<header className="guia__cabeca">
					<div className="guia__titulos">
						<span className="overline">{overline}</span>
						<h2 id="guia-titulo" className="display-sm guia__titulo">
							{curso?.nome ?? "Novo curso"}
						</h2>
					</div>
					<Button variant="ghost" icon="close" onClick={sair}>
						Sair
					</Button>
				</header>
				<TrilhoGuia curso={curso} vista={vista} abrir={irPara} />
				<div className="guia__corpo">
					<motion.div key={`${vista}|${curso?.id ?? "novo"}`} className={`guia__coluna${vista === "mapa" || vista === "diagnostico" ? " guia__coluna--larga" : ""}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={MOLA}>
						{erro ? (
							<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
								<p>{erro}</p>
							</Callout>
						) : null}
						{corpo}
					</motion.div>
				</div>
				<footer className="guia__rodape">
					{anterior && curso ? (
						<Button
							variant="secondary"
							icon="arrow-left"
							onClick={() => (vista === "diagnostico" && diagnostico.voltar ? diagnostico.voltar() : irPara(anterior))}
							disabled={salvando}
						>
							Voltar
						</Button>
					) : (
						<span />
					)}
					{primario ? (
						<span className="guia__primario">
							{primario.desligado && !salvando ? <span className="body-sm guia__motivo">{primario.desligado}</span> : null}
							<Button
								variant="primary"
								iconRight="arrow-right"
								onClick={primario.acao ?? continuar}
								disabled={salvando || Boolean(primario.ocupado) || Boolean(primario.desligado)}
								aria-busy={salvando || Boolean(primario.ocupado)}
							>
								{salvando || primario.ocupado ? "Salvando…" : primario.texto}
							</Button>
						</span>
					) : null}
				</footer>
			</motion.section>

			<Modal
				open={Boolean(aviso)}
				onClose={() => setAviso(undefined)}
				kicker={curso?.nome ?? "Curso em rascunho"}
				title={`Mudar ${nomeDaEtapa(vista)} descarta: ${emLista(ultimoAviso.current?.etapas ?? [])}. Continuar?`}
				size="sm"
				tone="brick"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => {
								setAviso(undefined);
								reverter();
							}}
						>
							Manter como estava
						</Button>
						<Button variant="danger" onClick={() => aviso?.seguir()}>
							Descartar e continuar
						</Button>
					</>
				}
			>
				<p className="body">{ultimoAviso.current?.etapas.length === 1 ? "A etapa descartada volta a ficar por fazer." : "As etapas descartadas voltam a ficar por fazer."} O resto do rascunho fica como está.</p>
			</Modal>
			{diagnostico.modal}
			<Modal
				open={perguntarSair}
				onClose={() => setPerguntarSair(false)}
				kicker={curso?.nome ?? "Novo curso"}
				title="Sair sem confirmar esta etapa?"
				size="sm"
				footer={
					<>
						<Button variant="secondary" onClick={() => setPerguntarSair(false)}>
							Continuar aqui
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								setPerguntarSair(false);
								voltarAosCursos();
							}}
						>
							Sair
						</Button>
					</>
				}
			>
				<p className="body">O que já foi confirmado fica salvo.</p>
			</Modal>
		</div>
	);
}

/**
 * O trilho das etapas, com as classes do Stepper do design system: o Stepper
 * marca como feita toda etapa antes da atual, e aqui feita é a confirmada
 * (voltando a uma etapa, as confirmadas depois dela continuam feitas). Dá para
 * abrir as confirmadas e a primeira não confirmada.
 */
function TrilhoGuia(props: { curso: Curso | undefined; vista: Etapa; abrir(etapa: Etapa): void }) {
	const { curso, vista } = props;
	return (
		<ol className="ap-stepper guia__trilho" aria-label="Etapas do guia">
			{ETAPAS.map((etapa, indice) => {
				const feita = Boolean(curso && curso[etapa] !== null && curso[etapa] !== undefined);
				const estado = etapa === vista ? "current" : feita ? "done" : "todo";
				const clicavel = etapa !== vista && Boolean(curso) && podeAbrir(curso, etapa);
				const dentro = (
					<>
						<span className="ap-step__num data" aria-hidden="true">
							{pad2(indice + 1)}
							{estado === "done" ? <Icon name="check" size={16} strokeWidth={3} /> : null}
						</span>
						<span className="ap-step__text">
							<span className="ap-step__label overline">{nomeDaEtapa(etapa)}</span>
						</span>
						<span className="ap-visually-hidden">{estado === "done" ? " (feita)" : estado === "current" ? " (atual)" : ""}</span>
					</>
				);
				return (
					<li key={etapa} className={`ap-step ap-step--${estado}`} aria-current={estado === "current" ? "step" : undefined}>
						{clicavel ? (
							<button type="button" className="ap-step__btn" onClick={() => props.abrir(etapa)}>
								{dentro}
							</button>
						) : (
							<span className="ap-step__btn">{dentro}</span>
						)}
					</li>
				);
			})}
		</ol>
	);
}
