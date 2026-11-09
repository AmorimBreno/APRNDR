// A visão do módulo gerado (item 6, parte B, docs/modulos.md), em
// caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>] (sem a lição, a
// primeira; F5 volta na mesma). Tela inteira, como a visão do curso, mas no
// topo, no lugar da aba do caderno, a CourseBar: "Curso" volta para a visão do
// curso, a capa da matéria, "Módulo 03 · <nome>", "<curso> · lição 2 de 4", a
// trilha dos módulos do curso (os gerados dá para abrir; os outros e a
// avaliação geral, tracejados) e "Próxima lição" (na última, "Voltar ao
// curso").
//
// Embaixo, duas colunas (a partir de 900 px do contêiner; abaixo, o índice
// vira fichas por cima): à esquerda, fixo, o índice das lições e o resumo do
// módulo; à direita, centrada no espaço que sobra, a coluna de leitura
// (--largura-leitura-estudos), com a SectionRuler na margem esquerda dela (o
// bloco atual é o que está no meio da tela): o aviso de visualização (dá para
// fechar; lembrado no localStorage), o cabeçalho da lição (o título, o
// objetivo e "N blocos · M questões") e os blocos, cada um num LessonBlock,
// separados por um fio. As explicações ficam soltas, como texto de artigo; a
// prática (pergunta, questão, dissertativa) vai num cartão. Numa explicação
// com código principal, o código fica ao lado do texto, fixo, e o `código em
// linha` do texto destaca no código o trecho citado (CodigoCitado.tsx). As
// questões são respondidas no próprio cartão (QuestaoModulo.tsx; docs/modulos.md,
// "Responder as questões"): a confiança antes, as tentativas, a conferência
// pelo modelo e o gabarito no fim; as referências abrem o material. O índice
// mostra no topo o placar das questões feitas do módulo (QuizProgress) e, em
// cada lição, "3 de 5". No pé, a lição anterior e a próxima; na última lição
// de um módulo gerado e não concluído, também "Concluir o módulo" (com o
// modal de confirmação; docs/modulos.md, "Concluir um módulo"), que volta
// para a visão do curso depois de concluir, e, com todas as questões feitas,
// "Você fez todas as questões.". Um módulo concluído mostra no topo do
// índice a etiqueta "Concluído em dd/mm".
//
// O módulo vem da ponte "modulos" (useModuloAberto, a ação "abrir"); o nome
// e a ordem dos módulos, do curso (useCurso); quais estão gerados, do estado
// dos módulos (useModulos), que também conclui (a ação "concluir") e responde
// as questões (responder, corrigir e encerrar).
//
// O feedback (docs/modulos.md, "O feedback"): no pé de cada bloco,
// "Feedback" (ou "Feedback: Bom", com a nota que vale para a versão atual do
// bloco) abre no lugar as teclas Ruim, Bom e Ótimo, que gravam na hora a nota
// rápida (avaliar_bloco), e "Detalhar", que abre o balão de retorno embaixo do
// bloco (docs/escrita.md, "A tela": Ruim / Bom / Ótimo com a nota já
// marcada, os motivos, o texto, "Virar regra de escrita"), que grava pela ação
// retorno (com o detalha da nota) e, com "Salvar e reescrever o bloco", pede
// a reescrita (reescrever_bloco). No fim de cada lição, depois do último bloco
// (e antes do pé, onde fica o "Concluir o módulo"), o questionário "Como foi
// esta lição?" (as cinco PerguntaSlider e o texto, no estado local até o
// "Enviar", que grava pelo avaliar_licao); enviado, o cartão recolhe para
// "Respostas enviadas em dd/mm", com as notas e "Responder de novo".
// Enquanto o bloco é reescrito (o estado do módulo traz reescrevendo), ele
// fica apagado com a faixa "Reescrevendo este bloco…", a foto do professor e
// o Parar (cancelar); o bloco novo entra com uma transição curta. Um bloco
// reescrito tem a etiqueta "Reescrito" e "Ver a versão anterior". No índice,
// o link "Como o professor escreve" abre as regras de escrita (ModalEscrita).
//
// O relatório do método (docs/metodo-experimentos.md, "A tela"): num módulo
// concluído, a seção "Relatório do método" (RelatorioMetodo.tsx) fica no pé da
// última lição, onde ficava o "Concluir o módulo", e o índice tem um link que
// leva até ela (abre a última lição, se preciso). O relatório vem na mensagem
// modulo (relatorio, relatorioGerando e relatorioErro); gerar é uma ação da
// ponte (useModulos), e não há botão de decisão: a análise já vem aplicada. O
// clique numa evidência leva ao bloco pela navegação dos termos (apontarTermo
// e useDestinoTermo).

import {
	Button,
	Callout,
	Checkbox,
	CourseBar,
	EmptyState,
	Icon,
	LessonBlock,
	Modal,
	type OrnamentGlyph,
	pad2,
	QuizProgress,
	SectionRuler,
	Sticker,
	Tag,
	TextArea,
	type Tone,
} from "@estudos/design-system";
import { AgenteAnimado, type DadosAvatarAgente, type JanelaPerfilHook, Markdown, MenuSuspenso, semMovimento } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { AVALIACOES_BLOCO, MOTIVOS_RETORNO, NOMES_AVALIACAO, NOMES_MOTIVO, TEXTO_REGRA_MAXIMO, TEXTO_RETORNO_MAXIMO } from "../../lib/escrita-tipos.ts";
import type { Materia } from "../../lib/materia-tipos.ts";
import {
	type AvaliacaoNova,
	type FeedbackBloco,
	feedbackDoBloco,
	type NotasLicao,
	PERGUNTAS_LICAO,
	questionarioDaLicao,
	type QuestionarioLicao,
	resumoDoQuestionario,
	TEXTO_QUESTIONARIO_MAXIMO,
} from "../../lib/modulo-feedback-tipos.ts";
import { ehQuestao, progressoDoModulo, respostaDoBloco, type RespostaModulo } from "../../lib/modulo-respostas-tipos.ts";
import { type Bloco, type BlocoAnterior, type EstadoModuloNaTela, type Licao, type Modulo, versaoDoBloco } from "../../lib/modulo-tipos.ts";
import { useAjustes } from "./ajustes-ponte.ts";
import { ExplicacaoComCodigo } from "./CodigoCitado.tsx";
import { rotuloCapa } from "./comum.ts";
import { useCurso } from "./cursos-ponte.ts";
import { useEscrita } from "./escrita-ponte.ts";
import {
	alternarMotivo,
	anteriorInicial,
	type BalaoRetorno,
	balaoDetalhando,
	chaveDoBloco,
	type DadosDoRetorno,
	dadosDoRetorno,
	dataDaVersao,
	escolherAvaliacao,
	EXEMPLO_REGRA,
	foiReescrito,
	marcarVirarRegra,
	mostraMotivos,
	mudarTextoRegra,
	mudarTextoRetorno,
	NOME_TODAS,
	podeReescrever,
	problemaDoBalao,
	ROTULO_REESCRITO,
	rotuloDaVersao,
	TEXTO_REESCREVENDO,
	TEXTO_RETORNO_SALVO,
	TITULO_ESCRITA,
	tituloDoReescrito,
	versoesAnteriores,
} from "./escrita-tela.ts";
import {
	dadosDoQuestionario,
	LINHA_QUESTIONARIO,
	mudarNota,
	notaDaPergunta,
	notaMarcada,
	notaParaDetalhar,
	OPCOES_DA_NOTA,
	problemaDoQuestionario,
	type RascunhoQuestionario,
	rascunhoDoEnviado,
	rascunhoVazio,
	ROTULO_DETALHAR,
	ROTULO_TEXTO_QUESTIONARIO,
	rotuloDoFeedback,
	TITULO_QUESTIONARIO,
	tituloDoEnviado,
} from "./feedback-tela.ts";
import { ModalEscrita } from "./ModalEscrita.tsx";
import { agruparReferencias } from "./mapa-ponte.ts";
import {
	type Abertura,
	aberturaDoModulo,
	avisoFechado,
	caminhoDoModulo,
	dadosDaLicao,
	ehComplemento,
	ID_AVALIACAO_GERAL,
	indiceDaLicao,
	itensDaRegua,
	itensDoIndice,
	kickerDaBarra,
	lembrarAvisoFechado,
	passosDaTrilha,
	perguntaConcluir,
	podeConcluir,
	postItDaQuestao,
	proximoDaBarra,
	resumoDoIndice,
	ROTULO_IDEIA_CENTRAL,
	rotuloConcluido,
	rotuloDoBloco,
	TEXTO_AVISO,
	tituloDoModulo,
} from "./modulo-tela.ts";
import { type ErroVistoModulo, reescrevendoNoModulo, useModuloAberto, useModulos } from "./modulos-ponte.ts";
import { PerguntaSlider } from "./PerguntaSlider.tsx";
import { type AcoesQuestoes, QuestaoModulo, QuestaoParaLer } from "./QuestaoModulo.tsx";
import { placarDoModulo, TEXTO_TODAS_FEITAS, textoDoProgresso, todasFeitas } from "./questao-modulo-tela.ts";
import { type AcoesRelatorio, RelatorioMetodo } from "./RelatorioMetodo.tsx";
import { type DestinoDaEvidencia, ID_RELATORIO, TITULO_RELATORIO } from "./relatorio-tela.ts";
import { EtiquetaReferencia } from "./SecaoMapa.tsx";
import { Teclas } from "./Teclas.tsx";
import { type AcoesTermos, apontarTermo, ExplicacoesDoBloco, MarcarTermos, ProvedorTermos, TextoComTermos, useDestinoTermo } from "./TermosModulo.tsx";

const MOLA = { type: "spring", stiffness: 380, damping: 32 } as const;

/** Os ideogramas de número (um a dez), para a tela vazia do módulo. */
const NUMEROS: readonly OrnamentGlyph[] = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

export interface PropsTelaModulo {
	janela: JanelaPerfilHook;
	materiaId: string;
	materia?: Materia;
	/** O número do caderno (para a capa). */
	numero?: number;
	cursoId: string;
	moduloId: string;
	/** A lição da rota; sem ela, a primeira. */
	licaoId?: string;
	navegar(caminho: string): void;
	tom: Tone;
	/** As matérias (para o seletor das regras de escrita); sem a lista, só esta. */
	materias?: ReadonlyArray<{ id: string; nome: string }>;
	/** O agente da sessão (a foto enquanto um bloco é reescrito). */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
}

/** O retorno por bloco e a reescrita (docs/escrita.md): o que os blocos da lição recebem da ponte. */
export interface AcoesRetorno {
	/** A matéria do módulo ("esta matéria" do "Virar regra de escrita"). */
	materia: { id: string; nome?: string };
	agente?: { nome: string; avatar?: DadosAvatarAgente };
	/** O bloco sendo reescrito agora, pelo estado do módulo. */
	reescrevendo?: { licao: string; bloco: string };
	/** Os erros da reescrita, pela chave lição/bloco. */
	erros: Record<string, ErroVistoModulo>;
	/** Grava o retorno; resolve com o id do evento, se a resposta trouxe. */
	salvar(licao: string, bloco: string, dados: DadosDoRetorno): Promise<{ retorno?: string }>;
	/** Pede a reescrita do bloco; resolve quando ela começou. */
	reescrever(licao: string, bloco: string, retorno: string): Promise<unknown>;
	/** Para a reescrita (o cancelar do módulo). */
	parar(): Promise<void>;
	/** A nota rápida do bloco (avaliar_bloco); resolve quando o módulo com a nota chegou. */
	avaliar(licao: string, bloco: string, avaliacao: AvaliacaoNova): Promise<unknown>;
	/** Os erros da nota rápida, pelo id do bloco. */
	errosFeedback: Record<string, ErroVistoModulo>;
}

/** O questionário do fim da lição (docs/modulos.md, "O questionário do fim da lição"). */
export interface AcoesQuestionario {
	/** Grava o questionário da lição (avaliar_licao); resolve quando o módulo com ele chegou; rejeita com a frase do erro. */
	enviar(licao: string, dados: { notas: NotasLicao; texto?: string }): Promise<unknown>;
}

/** Os hooks da ponte e a navegação; quem desenha é a VisaoModulo. */
export function TelaModulo(props: PropsTelaModulo) {
	const { materiaId, cursoId, moduloId } = props;
	const { curso, erro: erroCurso } = useCurso(props.janela, materiaId, cursoId);
	const modulos = useModulos(props.janela, materiaId, cursoId);
	const aberto = useModuloAberto(props.janela, materiaId, cursoId, moduloId);
	const doCurso = curso?.esqueleto?.modulos.map((modulo, indice) => ({ id: modulo.id, numero: indice + 1, nome: modulo.nome })) ?? [];
	const abertura: Abertura = !curso && erroCurso ? { tipo: "ilegivel", mensagem: erroCurso } : aberturaDoModulo(aberto);

	// "Como o professor escreve": as regras são pedidas quando o modal abre.
	const [vendoEscrita, setVendoEscrita] = useState(false);
	const escrita = useEscrita(props.janela, vendoEscrita);
	const ajustes = useAjustes(props.janela, vendoEscrita);
	const materias = props.materias ?? (props.materia ? [props.materia] : []);

	// A reescrita de um bloco: quando ela acaba (o estado não traz mais o bloco), o módulo é aberto de novo (o "modulo" novo também chega sozinho).
	const reescrevendo = reescrevendoNoModulo(modulos.estado, moduloId);
	const chaveReescrevendo = reescrevendo ? chaveDoBloco(reescrevendo.licao, reescrevendo.bloco) : undefined;
	const antes = useRef(chaveReescrevendo);
	const { abrirDeNovo } = aberto;
	useEffect(() => {
		if (antes.current && !chaveReescrevendo) abrirDeNovo();
		antes.current = chaveReescrevendo;
	}, [chaveReescrevendo, abrirDeNovo]);
	const retornos: AcoesRetorno = {
		materia: { id: materiaId, ...(props.materia?.nome ? { nome: props.materia.nome } : {}) },
		...(props.agente ? { agente: props.agente } : {}),
		...(reescrevendo ? { reescrevendo } : {}),
		erros: modulos.errosReescrita(moduloId),
		salvar: (licao, bloco, dados) => modulos.retorno(moduloId, licao, bloco, dados),
		reescrever: (licao, bloco, retorno) => modulos.reescreverBloco(moduloId, licao, bloco, retorno),
		parar: () => modulos.cancelar(moduloId),
		avaliar: (licao, bloco, avaliacao) => modulos.avaliarBloco(moduloId, licao, bloco, avaliacao),
		errosFeedback: modulos.errosFeedback(moduloId),
	};
	const questionario: AcoesQuestionario = {
		enviar: (licao, dados) => modulos.avaliarLicao(moduloId, licao, dados),
	};
	const questoes: AcoesQuestoes = {
		corrigindo: aberto.corrigindo ?? [],
		erros: modulos.errosQuestoes(moduloId),
		responder: (bloco, entrada) => modulos.responder(moduloId, bloco, entrada),
		corrigir: (bloco) => modulos.corrigir(moduloId, bloco),
		encerrar: (bloco) => modulos.encerrar(moduloId, bloco),
	};
	const [, atualizarDestino] = useState(0);
	const chaveTermos = `${materiaId}/${cursoId}`;
	const licaoAtual = aberto.modulo?.licoes[indiceDaLicao(aberto.modulo.licoes, props.licaoId)]?.id;
	useDestinoTermo(chaveTermos, moduloId, licaoAtual, abertura.tipo === "pronto");
	const termos: AcoesTermos = {
		modulo: moduloId,
		glossario: aberto.glossario ?? [],
		explicando: aberto.explicando ?? [],
		falhas: aberto.explicacoesFalhas ?? [],
		erros: modulos.errosTermos(moduloId),
		marcando: modulos.estado?.modulos.find((m) => m.id === moduloId)?.marcando,
		marcar: () => modulos.marcarTermos(moduloId),
		explicar: (licao, bloco, trecho, tipo) => modulos.explicarTrecho(moduloId, licao, bloco, trecho, tipo),
		guardar: (explicacao) => modulos.guardarTermo(moduloId, explicacao),
		ir: (lugar) => {
			apontarTermo(chaveTermos, lugar);
			props.navegar(caminhoDoModulo(materiaId, cursoId, lugar.modulo, lugar.licao));
			atualizarDestino((vez) => vez + 1);
		},
	};
	// O relatório do método (a seção só aparece num módulo concluído): o que a mensagem modulo trouxe e as ações da ponte.
	const irParaEvidencia = (destino: DestinoDaEvidencia) => {
		if (destino.tipo === "bloco") {
			apontarTermo(chaveTermos, { modulo: destino.modulo, licao: destino.licao, bloco: destino.bloco });
			atualizarDestino((vez) => vez + 1);
		}
		props.navegar(caminhoDoModulo(materiaId, cursoId, destino.modulo, destino.licao));
	};
	const relatorio: AcoesRelatorio = {
		modulo: moduloId,
		relatorio: aberto.relatorio ?? null,
		gerando: aberto.relatorioGerando === true,
		...(aberto.relatorioErro ? { erro: aberto.relatorioErro } : {}),
		gerar: (forcar) => modulos.gerarRelatorio(moduloId, forcar),
		ir: irParaEvidencia,
	};
	return (
		<ProvedorTermos acoes={termos}>
			<VisaoModulo
				{...(props.materia ? { materia: props.materia } : {})}
				{...(props.numero ? { numero: props.numero } : {})}
				tom={props.tom}
				{...(curso?.nome ? { cursoNome: curso.nome } : {})}
				modulosDoCurso={doCurso}
				{...(modulos.estado ? { estados: modulos.estado.modulos } : {})}
				moduloId={moduloId}
				abertura={abertura}
				{...(props.licaoId ? { licaoId: props.licaoId } : {})}
				voltarAoCurso={() => props.navegar(`caderno/${materiaId}/cursos/${cursoId}`)}
				abrirModulo={(id) => props.navegar(caminhoDoModulo(materiaId, cursoId, id))}
				abrirLicao={(id) => props.navegar(caminhoDoModulo(materiaId, cursoId, moduloId, id))}
				abrirMaterial={(arquivo) => props.navegar(`caderno/${materiaId}/materiais/${arquivo}`)}
				tentarDeNovo={aberto.abrirDeNovo}
				concluir={() => modulos.concluir(moduloId)}
				retornos={retornos}
				questoes={questoes}
				questionario={questionario}
				relatorio={relatorio}
				abrirEscrita={() => setVendoEscrita(true)}
			/>
			<ModalEscrita aberto={vendoEscrita} fechar={() => setVendoEscrita(false)} escrita={escrita} ajustes={ajustes} materias={materias} />
		</ProvedorTermos>
	);
}

export interface PropsVisaoModulo {
	materia?: Materia;
	numero?: number;
	tom: Tone;
	cursoNome?: string;
	/** Os módulos do esqueleto, na ordem (vazio enquanto o curso não chega). */
	modulosDoCurso: ReadonlyArray<{ id: string; numero: number; nome: string }>;
	/** O estado dos módulos que a extensão mandou (para a trilha). */
	estados?: ReadonlyArray<Pick<EstadoModuloNaTela, "id" | "situacao" | "geradoEm">>;
	moduloId: string;
	abertura: Abertura;
	licaoId?: string;
	voltarAoCurso(): void;
	abrirModulo(id: string): void;
	abrirLicao(id: string): void;
	abrirMaterial(arquivo: string): void;
	tentarDeNovo(): void;
	/** "Concluir o módulo": resolve quando a extensão concluiu; rejeita com a frase do erro. */
	concluir?(): Promise<unknown>;
	/** O retorno por bloco e a reescrita; sem ele, os blocos não têm "Retorno". */
	retornos?: AcoesRetorno;
	/** Responder as questões; sem ele, os botões delas ficam desligados. */
	questoes?: AcoesQuestoes;
	/** O questionário do fim da lição; sem ele, a lição não tem o cartão. */
	questionario?: AcoesQuestionario;
	/** O relatório do método; sem ele (ou num módulo não concluído), a última lição não tem a seção nem o índice tem o link. */
	relatorio?: AcoesRelatorio;
	/** Abre "Como o professor escreve"; sem ele, o índice não tem o link. */
	abrirEscrita?(): void;
}

/** A CourseBar e o corpo da visão, pelos dados (sem ponte: dá para desenhar no servidor). */
export function VisaoModulo(props: PropsVisaoModulo) {
	const { materia, abertura, moduloId } = props;
	const doEsqueleto = props.modulosDoCurso.find((modulo) => modulo.id === moduloId);
	const modulo = abertura.tipo === "pronto" ? abertura.modulo : undefined;
	const indice = modulo ? indiceDaLicao(modulo.licoes, props.licaoId) : 0;
	const licao = modulo?.licoes[indice];
	const total = modulo?.licoes.length ?? 0;
	const proximo = modulo ? proximoDaBarra(indice, total) : undefined;
	const irParaProximo = () => {
		if (!modulo || !proximo) return;
		if (proximo.destino === "curso") props.voltarAoCurso();
		else props.abrirLicao(modulo.licoes[indice + 1]!.id);
	};

	let conteudo: ReactNode;
	if (abertura.tipo === "carregando") {
		conteudo = <p className="body caderno__carregando">Abrindo o módulo…</p>;
	} else if (abertura.tipo === "nao_gerado" || abertura.tipo === "ilegivel") {
		const naoGerado = abertura.tipo === "nao_gerado";
		conteudo = (
			<EmptyState
				glyph={naoGerado ? (doEsqueleto && doEsqueleto.numero <= NUMEROS.length ? NUMEROS[doEsqueleto.numero - 1]! : "新") : "問"}
				tone={props.tom}
				title={naoGerado ? "Este módulo ainda não foi gerado" : "Não consegui abrir este módulo"}
				action={
					<Button variant="primary" icon="arrow-left" onClick={props.voltarAoCurso}>
						Voltar ao curso
					</Button>
				}
			>
				{naoGerado ? "Gere o módulo pelo card dele, na visão do curso. As lições aparecem aqui quando ficarem prontas." : abertura.mensagem}
			</EmptyState>
		);
	} else if (abertura.tipo === "erro") {
		conteudo = (
			<div className="modulo__erro">
				<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
					<p>{abertura.mensagem}</p>
					<div className="modulo__erro-botoes">
						<Button variant="secondary" size="sm" icon="refresh" onClick={props.tentarDeNovo}>
							Tentar de novo
						</Button>
					</div>
				</Callout>
			</div>
		);
	} else if (modulo && licao) {
		conteudo = (
			<LicaoAberta
				modulo={modulo}
				licao={licao}
				indice={indice}
				{...(doEsqueleto ? { numero: doEsqueleto.numero, nome: doEsqueleto.nome } : {})}
				abrirLicao={props.abrirLicao}
				abrirMaterial={props.abrirMaterial}
				voltarAoCurso={props.voltarAoCurso}
				{...(props.concluir ? { concluir: props.concluir } : {})}
				{...(props.retornos ? { retornos: props.retornos } : {})}
				{...(props.questoes ? { questoes: props.questoes } : {})}
				{...(props.questionario ? { questionario: props.questionario } : {})}
				{...(props.relatorio ? { relatorio: props.relatorio } : {})}
				{...(props.abrirEscrita ? { abrirEscrita: props.abrirEscrita } : {})}
			/>
		);
	}

	return (
		<>
			<CourseBar
				className="aba-caderno aba-modulo"
				title={doEsqueleto ? tituloDoModulo(doEsqueleto.numero, doEsqueleto.nome) : "Módulo"}
				kicker={kickerDaBarra(props.cursoNome ?? "Curso", modulo ? { indice, total } : undefined)}
				{...(materia
					? {
							cover: {
								tone: materia.cor,
								glyph: materia.glifo as OrnamentGlyph,
								label: rotuloCapa(materia.nome),
								...(props.numero ? { number: pad2(props.numero) } : {}),
							},
						}
					: {})}
				steps={passosDaTrilha(props.modulosDoCurso, props.estados, moduloId)}
				onStepClick={(id) => {
					if (id !== moduloId && id !== ID_AVALIACAO_GERAL) props.abrirModulo(id);
				}}
				onBack={props.voltarAoCurso}
				backLabel="Curso"
				{...(proximo ? { next: { label: proximo.label, kicker: proximo.kicker, onClick: irParaProximo } } : {})}
			/>
			<motion.section
				className="curso modulo"
				aria-label={doEsqueleto ? tituloDoModulo(doEsqueleto.numero, doEsqueleto.nome) : "Módulo"}
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={MOLA}
			>
				{abertura.tipo === "pronto" ? conteudo : <div className="curso__corpo">{conteudo}</div>}
			</motion.section>
		</>
	);
}

/** O índice das lições e a lição aberta, com a régua dos blocos e o pé (na última lição, "Concluir o módulo" ou, num módulo concluído, o relatório do método). */
function LicaoAberta(props: {
	modulo: Modulo;
	licao: Licao;
	indice: number;
	/** O número e o nome do módulo no esqueleto (para o modal de concluir). */
	numero?: number;
	nome?: string;
	abrirLicao(id: string): void;
	abrirMaterial(arquivo: string): void;
	voltarAoCurso(): void;
	concluir?(): Promise<unknown>;
	retornos?: AcoesRetorno;
	questoes?: AcoesQuestoes;
	questionario?: AcoesQuestionario;
	relatorio?: AcoesRelatorio;
	abrirEscrita?(): void;
}) {
	const { modulo, licao, indice } = props;
	const respostas = modulo.situacao === "gerado" ? modulo.respostas : undefined;
	const feedback = modulo.situacao === "gerado" ? modulo.feedback : undefined;
	const questionarios = modulo.situacao === "gerado" ? modulo.questionarios : undefined;
	const progresso = progressoDoModulo({ licoes: modulo.licoes, ...(respostas ? { respostas } : {}) });
	const placar = placarDoModulo({ licoes: modulo.licoes, ...(respostas ? { respostas } : {}) });
	const total = modulo.licoes.length;
	const corpo = useRef<HTMLDivElement>(null);
	const artigo = useRef<HTMLElement>(null);
	const [atual, setAtual] = useState<string | undefined>(licao.blocos[0]?.id);
	const [aviso, setAviso] = useState(() => !avisoFechado());

	// Outra lição: volta para o topo e o primeiro bloco é o atual.
	const primeira = useRef(true);
	useEffect(() => {
		setAtual(licao.blocos[0]?.id);
		if (primeira.current) {
			primeira.current = false;
			return;
		}
		corpo.current?.scrollTo({ top: 0 });
	}, [licao.id]);

	// O bloco atual da régua: o que cruza a linha do meio da área que rola.
	useEffect(() => {
		const raiz = corpo.current;
		const blocos = artigo.current?.querySelectorAll<HTMLElement>("[data-bloco]");
		if (!raiz || !blocos?.length || typeof IntersectionObserver !== "function") return;
		const observador = new IntersectionObserver(
			(entradas) => {
				for (const entrada of entradas) {
					const id = (entrada.target as HTMLElement).dataset.bloco;
					if (entrada.isIntersecting && id) setAtual(id);
				}
			},
			{ root: raiz, rootMargin: "-50% 0px -50% 0px", threshold: 0 },
		);
		for (const bloco of blocos) observador.observe(bloco);
		return () => observador.disconnect();
	}, [licao.id]);

	const irParaBloco = (id: string) => {
		const alvo = artigo.current?.querySelector<HTMLElement>(`[data-bloco="${CSS.escape(id)}"]`);
		if (!alvo) return;
		setAtual(id);
		// O painel do professor fica ao lado: rola só o corpo do módulo (o contêiner), nunca a página.
		const corpoRolavel = alvo.closest<HTMLElement>(".modulo__corpo");
		const comportamento = semMovimento() ? "auto" : "smooth";
		if (corpoRolavel)
			corpoRolavel.scrollTo({
				top: alvo.getBoundingClientRect().top - corpoRolavel.getBoundingClientRect().top + corpoRolavel.scrollTop,
				behavior: comportamento,
			});
		else alvo.scrollIntoView({ block: "start", behavior: comportamento });
	};
	const fecharAviso = () => {
		setAviso(false);
		lembrarAvisoFechado();
	};
	const ultima = indice + 1 >= total;

	// "Concluir o módulo": o modal de confirmação, o pedido em andamento e o erro dele.
	const [perguntarConcluir, setPerguntarConcluir] = useState(false);
	const [concluindo, setConcluindo] = useState(false);
	const [erroConcluir, setErroConcluir] = useState<string | undefined>(undefined);
	const mostraConcluir = ultima && podeConcluir(modulo) && props.concluir !== undefined;
	const pergunta = perguntaConcluir(props.numero ?? 0);
	const concluido = rotuloConcluido(modulo);
	const temRelatorio = Boolean(concluido) && props.relatorio !== undefined;
	// O link do índice: a seção fica na última lição, então, de outra, abre ela e rola quando chega.
	const [irAoRelatorio, setIrAoRelatorio] = useState(false);
	useEffect(() => {
		if (!irAoRelatorio || !ultima) return;
		const quadro = requestAnimationFrame(() => {
			// Mesmo caso do índice: o painel do professor fica ao lado, então rola só o corpo do módulo.
			const secao = document.getElementById(ID_RELATORIO);
			const corpoRolavel = secao?.closest<HTMLElement>(".modulo__corpo");
			const comportamento = semMovimento() ? "auto" : "smooth";
			if (secao && corpoRolavel)
				corpoRolavel.scrollTo({
					top: secao.getBoundingClientRect().top - corpoRolavel.getBoundingClientRect().top + corpoRolavel.scrollTop,
					behavior: comportamento,
				});
			else secao?.scrollIntoView({ block: "start", behavior: comportamento });
			setIrAoRelatorio(false);
		});
		return () => cancelAnimationFrame(quadro);
	}, [irAoRelatorio, ultima, licao.id]);
	const abrirRelatorio = () => {
		setIrAoRelatorio(true);
		if (!ultima) props.abrirLicao(modulo.licoes[total - 1]!.id);
	};
	const fecharConcluir = () => {
		if (concluindo) return;
		setPerguntarConcluir(false);
		setErroConcluir(undefined);
	};
	const concluir = () => {
		if (concluindo || !props.concluir) return;
		setConcluindo(true);
		setErroConcluir(undefined);
		props
			.concluir()
			.then(() => {
				setPerguntarConcluir(false);
				props.voltarAoCurso();
			})
			.catch((falha: unknown) => setErroConcluir(falha instanceof Error ? falha.message : String(falha)))
			.finally(() => setConcluindo(false));
	};

	return (
		<div ref={corpo} className="curso__corpo modulo__corpo">
			<div className="modulo__grade">
				<nav className="modulo__indice" aria-label="Lições do módulo">
					{concluido ? (
						<Tag className="modulo__concluido" tone="sage" size="sm" icon="check">
							{concluido}
						</Tag>
					) : null}
					{placar.questoes > 0 ? (
						<QuizProgress className="modulo__placar" label="Questões feitas" total={placar.questoes} current={placar.feitas} results={placar.resultados} />
					) : null}
					<p className="overline modulo__indice-titulo">Lições</p>
					<ol className="modulo__licoes">
						{itensDoIndice(modulo.licoes, indice).map((item, posicao) => {
							const feitas = textoDoProgresso(progresso.licoes[posicao] ?? { feitas: 0, questoes: 0 });
							return (
								<li key={item.id}>
									<button
										type="button"
										className={`modulo__item${item.atual ? " modulo__item--atual" : ""}`}
										aria-current={item.atual ? "page" : undefined}
										title={item.titulo}
										onClick={() => props.abrirLicao(item.id)}
									>
										<span className="data modulo__item-num">{item.numero}</span>
										<span className="body modulo__item-titulo">{item.titulo}</span>
										{feitas ? (
											<span className="data modulo__item-feitas" aria-label={`Questões feitas: ${feitas}`}>
												{feitas}
											</span>
										) : null}
									</button>
								</li>
							);
						})}
					</ol>
					<p className="data modulo__resumo">{resumoDoIndice(modulo)}</p>
					<MarcarTermos modulo={modulo} />
					{temRelatorio ? (
						<button type="button" className="body-sm escrita__link" onClick={abrirRelatorio}>
							<Icon name="checklist" size={16} strokeWidth={2.25} />
							{TITULO_RELATORIO}
						</button>
					) : null}
					{props.abrirEscrita ? (
						<button type="button" className="body-sm escrita__link" onClick={props.abrirEscrita}>
							<Icon name="book" size={16} strokeWidth={2.25} />
							{TITULO_ESCRITA}
						</button>
					) : null}
				</nav>
				<div className="modulo__leitura">
					<SectionRuler className="modulo__regua" label="Blocos da lição" items={itensDaRegua(licao)} {...(atual ? { current: atual } : {})} onSelect={irParaBloco} />
					<motion.article
						ref={artigo}
						key={licao.id}
						className="modulo__licao"
						aria-labelledby="modulo-licao-titulo"
						initial={semMovimento() ? false : { opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={MOLA}
					>
						<AnimatePresence initial={false}>
							{aviso ? (
								<motion.div
									key="aviso"
									className="modulo__aviso"
									exit={semMovimento() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.16 } }}
								>
									<Callout tone="steel" label="Visualização" icon="help" quote={false}>
										<p>{TEXTO_AVISO}</p>
									</Callout>
									<Button variant="ghost" size="sm" iconOnly icon="close" className="modulo__aviso-fechar" aria-label="Fechar o aviso" onClick={fecharAviso} />
								</motion.div>
							) : null}
						</AnimatePresence>
						<header className="modulo__cabeca">
							<p className="overline modulo__cabeca-rotulo">
								Lição {indice + 1} de {total}
							</p>
							<h2 id="modulo-licao-titulo" className="heading modulo__titulo">
								{licao.titulo}
							</h2>
							{licao.objetivo ? <p className="body-lg modulo__objetivo">{licao.objetivo}</p> : null}
							<p className="data modulo__dados">{dadosDaLicao(licao)}</p>
						</header>
						<div className="modulo__blocos">
							{licao.blocos.map((bloco, posicao) => (
								<BlocoDaLicao
									key={bloco.id}
									bloco={bloco}
									modulo={modulo}
									numero={posicao + 1}
									licao={licao.id}
									abrirMaterial={props.abrirMaterial}
									{...(props.retornos ? { retornos: props.retornos, nota: feedbackDoBloco(feedback, bloco) } : {})}
									{...(ehQuestao(bloco) ? { resposta: respostaDoBloco(respostas, bloco) } : {})}
									{...(props.questoes ? { questoes: props.questoes } : {})}
								/>
							))}
						</div>
						{props.questionario && modulo.situacao === "gerado" ? (
							<QuestionarioDaLicao
								key={licao.id}
								enviado={questionarioDaLicao(questionarios, licao.id)}
								enviar={(dados) => props.questionario!.enviar(licao.id, dados)}
							/>
						) : null}
						{ultima && temRelatorio && props.relatorio ? <RelatorioMetodo acoes={props.relatorio} /> : null}
						<footer className="modulo__pe">
							<Button
								variant="ghost"
								icon="arrow-left"
								disabled={indice === 0}
								onClick={() => {
									if (indice > 0) props.abrirLicao(modulo.licoes[indice - 1]!.id);
								}}
							>
								Lição anterior
							</Button>
							<span className="modulo__pe-fim">
								{mostraConcluir && todasFeitas(progresso) ? <span className="body-sm modulo__todas-feitas">{TEXTO_TODAS_FEITAS}</span> : null}
								<Button
									variant="secondary"
									iconRight="arrow-right"
									onClick={() => (ultima ? props.voltarAoCurso() : props.abrirLicao(modulo.licoes[indice + 1]!.id))}
								>
									{ultima ? "Voltar ao curso" : "Próxima lição"}
								</Button>
								{mostraConcluir ? (
									<Button variant="primary" icon="check" onClick={() => setPerguntarConcluir(true)} disabled={concluindo} aria-busy={concluindo}>
										Concluir o módulo
									</Button>
								) : null}
							</span>
						</footer>
					</motion.article>
				</div>
			</div>
			<Modal
				open={perguntarConcluir}
				onClose={fecharConcluir}
				kicker={props.numero && props.nome ? tituloDoModulo(props.numero, props.nome) : "Módulo"}
				title={pergunta.titulo}
				size="sm"
				dismissible={!concluindo}
				footer={
					<>
						<Button variant="secondary" onClick={fecharConcluir} disabled={concluindo}>
							Ainda não
						</Button>
						<Button variant="primary" icon="check" onClick={concluir} disabled={concluindo} aria-busy={concluindo}>
							{concluindo ? "Concluindo…" : "Concluir"}
						</Button>
					</>
				}
			>
				<p className="body">{pergunta.texto}</p>
				{erroConcluir ? <p className="body-sm cursos__erro">{erroConcluir}</p> : null}
			</Modal>
		</div>
	);
}

/** Quanto tempo "Retorno salvo" fica no pé do bloco. */
const TEMPO_RETORNO_SALVO = 3500;

/**
 * O que abre e fecha pela altura embaixo do bloco (o balão de retorno, o erro,
 * a versão anterior) e dentro do balão (os motivos, a regra). Corta o conteúdo
 * só enquanto anima: aberta, o menu suspenso de dentro pode passar da borda.
 */
function Dobra(props: { className: string; children: ReactNode }) {
	const [aberta, setAberta] = useState(false);
	return (
		<motion.div
			className={props.className}
			initial={{ height: 0, opacity: 0 }}
			animate={{ height: "auto", opacity: 1 }}
			exit={{ height: 0, opacity: 0 }}
			transition={semMovimento() ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
			style={{ overflow: aberta ? "visible" : "hidden" }}
			onAnimationStart={() => setAberta(false)}
			onAnimationComplete={(alvo) => setAberta((alvo as { height?: unknown }).height === "auto")}
		>
			{props.children}
		</motion.div>
	);
}

/**
 * Um bloco da lição num LessonBlock: o rótulo (e "Além do material",
 * "Reescrito"), o conteúdo (a questão para responder, QuestaoModulo) e as referências. Com
 * `retornos`, o pé tem "Feedback" (as teclas Ruim, Bom e Ótimo e o
 * "Detalhar", que abre o balão embaixo do bloco), "Ver a versão anterior" (num
 * bloco reescrito) e, durante a reescrita, a faixa com o Parar.
 */
export function BlocoDaLicao(props: {
	bloco: Bloco;
	modulo?: Modulo;
	numero: number;
	licao?: string;
	abrirMaterial(arquivo: string): void;
	retornos?: AcoesRetorno;
	/** A nota que vale para a versão atual do bloco (feedbackDoBloco). */
	nota?: FeedbackBloco | undefined;
	/** A resposta que vale para a questão (respostaDoBloco). */
	resposta?: RespostaModulo | undefined;
	questoes?: AcoesQuestoes;
}) {
	const { bloco, retornos } = props;
	const licao = props.licao ?? "";
	const { rotulo, icone } = rotuloDoBloco(bloco);
	const referencias = "referencias" in bloco ? agruparReferencias(bloco.referencias) : [];
	// A prática (pergunta rápida, quiz e dissertativa) vai num cartão com a borda e o post-it do tipo; a explicação,
	// solta, como texto de artigo, com a etiqueta do formato; a ideia central, no Callout, sem etiqueta.
	const postIt = postItDaQuestao(bloco);
	const pratica = postIt !== undefined;
	const etiqueta = bloco.tipo === "explicacao";
	const cabeca = etiqueta || foiReescrito(bloco);
	const versao = versaoDoBloco(bloco);
	const anteriores = versoesAnteriores(bloco);

	// O retorno e a reescrita.
	const chave = chaveDoBloco(licao, bloco.id);
	// O balão de retorno aberto, com o que ele começa (a nota marcada e o detalha).
	const [balao, setBalao] = useState<BalaoRetorno | undefined>(undefined);
	const [salvo, setSalvo] = useState(false);
	const [vendoAnterior, setVendoAnterior] = useState(false);
	const [comecando, setComecando] = useState(false);
	// O erro de pedir ou parar a reescrita (com o retorno, para tentar de novo).
	const [erroLocal, setErroLocal] = useState<{ mensagem: string; retorno?: string } | undefined>(undefined);
	const [dispensado, setDispensado] = useState<string | undefined>(undefined);
	const reescrevendo = comecando || (retornos?.reescrevendo?.licao === licao && retornos.reescrevendo.bloco === bloco.id);
	const erroPonte = retornos?.erros[chave];
	const erroReescrita = reescrevendo ? undefined : (erroLocal ?? (erroPonte && erroPonte.chave !== dispensado ? { mensagem: erroPonte.mensagem } : undefined));
	const ultimoRetorno = useRef<string | undefined>(undefined);

	// O feedback: as teclas abertas no pé, a nota sendo gravada e o erro dela (o local, de mandar, ou o da ponte, até ser dispensado).
	const [feedbackAberto, setFeedbackAberto] = useState(false);
	const [pendente, setPendente] = useState<AvaliacaoNova | undefined>(undefined);
	const [erroNotaLocal, setErroNotaLocal] = useState<string | undefined>(undefined);
	const [notaDispensada, setNotaDispensada] = useState<string | undefined>(undefined);
	const erroNotaPonte = retornos?.errosFeedback[bloco.id];
	const erroNota = erroNotaLocal ?? (erroNotaPonte && erroNotaPonte.chave !== notaDispensada ? erroNotaPonte.mensagem : undefined);
	const marcada = notaMarcada(pendente, props.nota);

	useEffect(() => {
		if (!salvo) return;
		const tempo = setTimeout(() => setSalvo(false), TEMPO_RETORNO_SALVO);
		return () => clearTimeout(tempo);
	}, [salvo]);
	// Começou a reescrita: o balão e as teclas do feedback fecham.
	useEffect(() => {
		if (!reescrevendo) return;
		setBalao(undefined);
		setFeedbackAberto(false);
	}, [reescrevendo]);

	const reescrever = (retorno: string) => {
		if (!retornos) return;
		ultimoRetorno.current = retorno;
		setErroLocal(undefined);
		if (erroPonte) setDispensado(erroPonte.chave);
		setComecando(true);
		retornos
			.reescrever(licao, bloco.id, retorno)
			.catch((falha: unknown) => setErroLocal({ mensagem: falha instanceof Error ? falha.message : String(falha), retorno }))
			.finally(() => setComecando(false));
	};
	const enviar = async (dados: DadosDoRetorno, reescreverTambem: boolean) => {
		if (!retornos) return;
		const resposta = await retornos.salvar(licao, bloco.id, dados);
		setBalao(undefined);
		setSalvo(true);
		if (!reescreverTambem) return;
		if (resposta.retorno) reescrever(resposta.retorno);
		else setErroLocal({ mensagem: "O retorno foi salvo, mas a resposta não trouxe o id dele, e a reescrita não começou." });
	};
	const parar = () => {
		retornos?.parar().catch((falha: unknown) => setErroLocal({ mensagem: falha instanceof Error ? falha.message : String(falha) }));
	};
	const fecharErro = () => {
		setErroLocal(undefined);
		if (erroPonte) setDispensado(erroPonte.chave);
	};
	const repetir = erroLocal?.retorno ?? (erroPonte ? ultimoRetorno.current : undefined);

	// A nota rápida: grava na hora; a tecla fica marcada enquanto vai e, depois, pela nota que vale no módulo novo.
	const avaliar = (avaliacao: AvaliacaoNova) => {
		if (!retornos || pendente || avaliacao === props.nota?.avaliacao) return;
		setPendente(avaliacao);
		setErroNotaLocal(undefined);
		if (erroNotaPonte) setNotaDispensada(erroNotaPonte.chave);
		retornos
			.avaliar(licao, bloco.id, avaliacao)
			.catch((falha: unknown) => setErroNotaLocal(falha instanceof Error ? falha.message : String(falha)))
			.finally(() => setPendente(undefined));
	};
	const detalhar = () => setBalao(balao ? undefined : balaoDetalhando(notaParaDetalhar(pendente, props.nota)));
	const fecharFeedback = () => {
		setFeedbackAberto(false);
		setBalao(undefined);
	};
	const fecharErroNota = () => {
		setErroNotaLocal(undefined);
		if (erroNotaPonte) setNotaDispensada(erroNotaPonte.chave);
	};

	const acoes =
		retornos && !reescrevendo ? (
			<>
				{feedbackAberto ? (
					<span className="feedback" role="group" aria-label="Feedback sobre este bloco">
						<Teclas<AvaliacaoNova>
							rotulo="Nota do bloco"
							opcoes={[...OPCOES_DA_NOTA]}
							valor={marcada}
							mudar={avaliar}
							className="feedback__teclas"
						/>
						<span className="feedback__fim">
							<Button variant="ghost" size="sm" icon="message" aria-expanded={balao !== undefined} onClick={detalhar}>
								{ROTULO_DETALHAR}
							</Button>
							<Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Fechar o feedback" onClick={fecharFeedback} />
						</span>
					</span>
				) : (
					<Button variant="ghost" size="sm" icon="message" aria-expanded={false} onClick={() => setFeedbackAberto(true)}>
						{rotuloDoFeedback(props.nota)}
					</Button>
				)}
				{anteriores.length > 0 ? (
					<Button variant="ghost" size="sm" icon="refresh" aria-expanded={vendoAnterior} onClick={() => setVendoAnterior(!vendoAnterior)}>
						{vendoAnterior ? "Esconder a versão anterior" : "Ver a versão anterior"}
					</Button>
				) : null}
				<AnimatePresence>
					{salvo ? (
						<motion.span
							key="salvo"
							className="body-sm retorno__salvo"
							role="status"
							initial={semMovimento() ? false : { opacity: 0, x: -4 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, transition: { duration: semMovimento() ? 0 : 0.2 } }}
						>
							<Icon name="check" size={16} strokeWidth={2.5} />
							{TEXTO_RETORNO_SALVO}
						</motion.span>
					) : null}
				</AnimatePresence>
			</>
		) : undefined;

	return (
		<div className={`modulo__bloco${pratica ? " modulo__bloco--pratica" : ""}${reescrevendo ? " retorno__bloco--reescrevendo" : ""}`} data-bloco={bloco.id} aria-busy={reescrevendo || undefined}>
			<AnimatePresence initial={false}>
				{reescrevendo ? (
					<motion.div
						key="reescrevendo"
						className="retorno__faixa"
						role="status"
						initial={semMovimento() ? false : { opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, transition: { duration: semMovimento() ? 0 : 0.12 } }}
					>
						<AgenteAnimado nome={retornos?.agente?.nome ?? "professor"} {...(retornos?.agente?.avatar ? { avatar: retornos.agente.avatar } : {})} atividade="pensando" tamanho={32} />
						<span className="body-sm retorno__faixa-texto">{TEXTO_REESCREVENDO}</span>
						<Button variant="ghost" size="sm" icon="stop" onClick={parar}>
							Parar
						</Button>
					</motion.div>
				) : null}
			</AnimatePresence>
			<AnimatePresence initial={false} mode="wait">
				<motion.div
					key={versao}
					className="retorno__conteudo"
					initial={semMovimento() ? false : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={semMovimento() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.12 } }}
					transition={MOLA}
				>
					{postIt ? (
						<Sticker className="modulo__postit" tone={postIt.tom} pin="top-right" rotate={4}>
							<Icon name={postIt.icone} size={16} strokeWidth={2.5} />
							{postIt.nome}
						</Sticker>
					) : null}
					<LessonBlock
						index={props.numero}
						{...(postIt ? { className: `modulo__cartao modulo__cartao--${postIt.tom}` } : {})}
						{...(acoes ? { actions: acoes } : {})}
					>
						{cabeca ? (
							<header className="ap-block__head modulo__bloco-cabeca">
								{etiqueta ? (
									<Tag className="ap-block__label" tone="steel" size="sm" icon={icone}>
										{rotulo}
									</Tag>
								) : null}
								{ehComplemento(bloco) ? (
									<Tag tone="amber" size="sm" title="Este bloco vai além dos seus materiais.">
										Além do material
									</Tag>
								) : null}
								{foiReescrito(bloco) ? (
									<Tag tone="neutral" size="sm" icon="refresh" className="retorno__reescrito" title={tituloDoReescrito(bloco)}>
										{ROTULO_REESCRITO}
									</Tag>
								) : null}
							</header>
						) : null}
						<TextoComTermos bloco={bloco.id} licao={licao}>
							{ehQuestao(bloco) ? (
								<QuestaoModulo key={versao} bloco={bloco} resposta={props.resposta} {...(props.questoes ? { acoes: props.questoes } : {})} />
							) : (
								<ConteudoDoBloco bloco={bloco} />
							)}
						</TextoComTermos>
					</LessonBlock>
				</motion.div>
			</AnimatePresence>
			{props.modulo ? <ExplicacoesDoBloco modulo={props.modulo} bloco={bloco.id} /> : null}
			<AnimatePresence initial={false}>
				{balao && retornos && !reescrevendo ? (
					<Dobra key="balao" className="retorno__dobra">
						<BalaoDeRetorno materia={retornos.materia} inicial={balao} enviar={enviar} fechar={() => setBalao(undefined)} />
					</Dobra>
				) : null}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{erroNota && retornos && !reescrevendo ? (
					<Dobra key="erro-nota" className="retorno__erro">
						<Callout tone="amber" label="O feedback não foi salvo" icon="alert" quote={false}>
							<p>{erroNota}</p>
							<div className="retorno__erro-botoes">
								<Button variant="ghost" size="sm" onClick={fecharErroNota}>
									Fechar
								</Button>
							</div>
						</Callout>
					</Dobra>
				) : null}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{erroReescrita ? (
					<Dobra key="erro" className="retorno__erro">
						<Callout tone="amber" label="A reescrita não deu certo" icon="alert" quote={false}>
							<p>{erroReescrita.mensagem}</p>
							<div className="retorno__erro-botoes">
								{repetir ? (
									<Button variant="secondary" size="sm" icon="refresh" onClick={() => reescrever(repetir)}>
										Tentar de novo
									</Button>
								) : null}
								<Button variant="ghost" size="sm" onClick={fecharErro}>
									Fechar
								</Button>
							</div>
						</Callout>
					</Dobra>
				) : null}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{vendoAnterior && anteriores.length > 0 && !reescrevendo ? (
					<Dobra key="anterior" className="retorno__dobra">
						<VersaoAnterior bloco={bloco} anteriores={anteriores} />
					</Dobra>
				) : null}
			</AnimatePresence>
			{referencias.length > 0 ? (
				<div className="mapa__marcas modulo__referencias" aria-label="Referências ao material">
					{referencias.map((referencia) => (
						<EtiquetaReferencia key={referencia.arquivo} arquivo={referencia.arquivo} locais={referencia.locais} abrir={() => props.abrirMaterial(referencia.arquivo)} />
					))}
				</div>
			) : null}
		</div>
	);
}

/** O conteúdo de um bloco que não se responde (a explicação, a ideia central) ou de uma versão anterior dele (a questão só para ler). */
function ConteudoDoBloco({ bloco }: { bloco: Bloco | BlocoAnterior }) {
	if (bloco.tipo === "explicacao") return <ExplicacaoComCodigo texto={bloco.texto} />;
	if (bloco.tipo === "ideia_central") {
		return (
			<Callout className="modulo__ideia" tone="moss" label={ROTULO_IDEIA_CENTRAL.rotulo} icon={ROTULO_IDEIA_CENTRAL.icone}>
				<Markdown texto={bloco.texto} />
			</Callout>
		);
	}
	return <QuestaoParaLer bloco={bloco} />;
}

/** As opções do "Virar regra de escrita": todas as matérias ou só esta. */
const OPCAO_ESTA = "esta";
const OPCAO_TODAS_RETORNO = "todas";

/**
 * O balão de retorno de um bloco (docs/escrita.md, "Retorno em cada bloco"):
 * Ruim / Bom / Ótimo, os motivos e "Salvar e reescrever o bloco" (só com
 * Ruim), o texto, "Virar regra de escrita" (o texto da regra e onde ela vale)
 * e os botões. Salvar espera a resposta; com erro, o balão fica aberto com a
 * frase.
 */
function BalaoDeRetorno(props: {
	materia: { id: string; nome?: string };
	/** Com o que o balão abre (a nota marcada e o detalha, pelo "Detalhar"). */
	inicial: BalaoRetorno;
	enviar(dados: DadosDoRetorno, reescrever: boolean): Promise<void>;
	fechar(): void;
}) {
	const [balao, setBalao] = useState(props.inicial);
	const [enviando, setEnviando] = useState<"salvar" | "reescrever" | undefined>(undefined);
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [tentou, setTentou] = useState(false);
	const problema = problemaDoBalao(balao);
	const melhorar = podeReescrever(balao);
	const motivos = mostraMotivos(balao);
	const nomeEsta = props.materia.nome ?? "Esta matéria";
	const nomeAvaliacao = useId();

	const enviar = (reescrever: boolean) => {
		if (enviando) return;
		setTentou(true);
		if (problema) return;
		let dados: DadosDoRetorno;
		try {
			dados = dadosDoRetorno(balao, props.materia.id);
		} catch (falha) {
			setErro((falha as Error).message);
			return;
		}
		setErro(undefined);
		setEnviando(reescrever ? "reescrever" : "salvar");
		props.enviar(dados, reescrever).catch((falha: unknown) => {
			setErro(falha instanceof Error ? falha.message : String(falha));
			setEnviando(undefined);
		});
	};

	return (
		<section className="retorno" aria-label="Retorno sobre este bloco">
			<div className="retorno__cabeca">
				<p className="overline retorno__titulo">Retorno sobre este bloco</p>
				<Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Fechar o retorno" onClick={props.fechar} disabled={Boolean(enviando)} />
			</div>
			<div role="radiogroup" aria-label="Avaliação do bloco" className="diag__teclas retorno__avaliacao">
				{AVALIACOES_BLOCO.map((avaliacao) => {
					const marcada = balao.avaliacao === avaliacao;
					return (
						<label key={avaliacao} className={`diag__tecla${marcada ? " diag__tecla--marcada" : ""}`}>
							<input
								type="radio"
								className="diag__radio"
								name={nomeAvaliacao}
								value={avaliacao}
								checked={marcada}
								onChange={() => setBalao((atual) => escolherAvaliacao(atual, avaliacao))}
							/>
							<span className="body-sm diag__tecla-texto">{NOMES_AVALIACAO[avaliacao]}</span>
						</label>
					);
				})}
			</div>
			<AnimatePresence initial={false}>
				{motivos ? (
					<Dobra key="motivos" className="retorno__sub">
						<div className="retorno__motivos" role="group" aria-label="O que precisa melhorar">
							{MOTIVOS_RETORNO.map((motivo) => {
								const marcado = balao.motivos.includes(motivo);
								return (
									<button
										key={motivo}
										type="button"
										className="retorno__motivo"
										aria-pressed={marcado}
										onClick={() => setBalao((atual) => alternarMotivo(atual, motivo))}
									>
										<Tag size="sm" tone={marcado ? "amber" : "neutral"} {...(marcado ? { icon: "check" as const } : {})}>
											{NOMES_MOTIVO[motivo]}
										</Tag>
									</button>
								);
							})}
						</div>
					</Dobra>
				) : null}
			</AnimatePresence>
			<TextArea
				label="O que você quer diferente? (opcional)"
				rows={3}
				maxLength={TEXTO_RETORNO_MAXIMO}
				value={balao.texto}
				onChange={(evento) => setBalao((atual) => mudarTextoRetorno(atual, evento.target.value))}
			/>
			<Checkbox label="Virar regra de escrita" checked={balao.virarRegra} onChange={(evento) => setBalao((atual) => marcarVirarRegra(atual, evento.target.checked))} />
			<AnimatePresence initial={false}>
				{balao.virarRegra ? (
					<Dobra key="regra" className="retorno__sub">
						<div className="retorno__regra">
							<TextArea
								label="Texto da regra"
								rows={2}
								maxLength={TEXTO_REGRA_MAXIMO}
								placeholder={EXEMPLO_REGRA}
								value={balao.textoRegra}
								onChange={(evento) => setBalao((atual) => mudarTextoRegra(atual, evento.target.value))}
							/>
							<div className="retorno__onde">
								<span className="body-sm retorno__onde-rotulo">Vale para</span>
								<MenuSuspenso
									opcoes={[
										{ id: OPCAO_TODAS_RETORNO, titulo: NOME_TODAS },
										{ id: OPCAO_ESTA, titulo: nomeEsta },
									]}
									atual={balao.soEstaMateria ? OPCAO_ESTA : OPCAO_TODAS_RETORNO}
									escolher={(opcao) => setBalao((atual) => ({ ...atual, soEstaMateria: opcao === OPCAO_ESTA }))}
									conteudoBotao={<span className="body-sm">{balao.soEstaMateria ? nomeEsta : NOME_TODAS}</span>}
									classeBotao="escrita__materia-botao"
									rotulo={`A regra vale para: ${balao.soEstaMateria ? nomeEsta : NOME_TODAS}`}
									rotuloMenu="Onde a regra vale"
									className="escrita__materia"
								/>
							</div>
						</div>
					</Dobra>
				) : null}
			</AnimatePresence>
			{erro ? (
				<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
					<p>{erro}</p>
				</Callout>
			) : null}
			<div className="retorno__pe">
				{tentou && problema ? <span className="body-sm retorno__falta">{problema}</span> : null}
				<span className="retorno__botoes">
					<Button variant={melhorar ? "secondary" : "primary"} size="sm" onClick={() => enviar(false)} disabled={Boolean(enviando)} aria-busy={enviando === "salvar"}>
						{enviando === "salvar" ? "Salvando…" : "Salvar retorno"}
					</Button>
					{melhorar ? (
						<Button variant="primary" size="sm" icon="refresh" onClick={() => enviar(true)} disabled={Boolean(enviando)} aria-busy={enviando === "reescrever"}>
							{enviando === "reescrever" ? "Salvando…" : "Salvar e reescrever o bloco"}
						</Button>
					) : null}
				</span>
			</div>
		</section>
	);
}

/**
 * "Ver a versão anterior": a mais recente das anteriores primeiro, só para
 * leitura, num fundo mais apagado com a data; com mais de uma, "Versão 1 de 3"
 * e as setas.
 */
function VersaoAnterior(props: { bloco: Bloco; anteriores: BlocoAnterior[] }) {
	const { bloco, anteriores } = props;
	const [indice, setIndice] = useState(() => anteriorInicial(anteriores));
	const atual = Math.min(indice, anteriores.length - 1);
	const anterior = anteriores[atual]!;
	const data = dataDaVersao(anterior);
	return (
		<section className="retorno__anterior" aria-label="Versão anterior do bloco">
			<div className="retorno__anterior-cabeca">
				<p className="overline retorno__anterior-titulo">{anteriores.length > 1 ? rotuloDaVersao(anterior, bloco) : "Versão anterior"}</p>
				{data ? <span className="data retorno__anterior-data">{data}</span> : null}
				{anteriores.length > 1 ? (
					<span className="retorno__setas">
						<Button variant="ghost" size="sm" iconOnly icon="arrow-left" aria-label="Versão mais antiga" disabled={atual === 0} onClick={() => setIndice(atual - 1)} />
						<Button
							variant="ghost"
							size="sm"
							iconOnly
							icon="arrow-right"
							aria-label="Versão mais nova"
							disabled={atual >= anteriores.length - 1}
							onClick={() => setIndice(atual + 1)}
						/>
					</span>
				) : null}
			</div>
			<div className="ap-prose lesson-body retorno__anterior-corpo">
				<ConteudoDoBloco key={atual} bloco={anterior} />
			</div>
		</section>
	);
}

/**
 * O questionário do fim da lição (docs/modulos.md, "O questionário do fim da
 * lição"): o cartão "Como foi esta lição?" com as cinco perguntas
 * (PerguntaSlider), o texto e "Enviar" (ligado com pelo menos uma resposta).
 * As notas ficam no estado local até o envio. Enviado, o cartão recolhe para
 * "Respostas enviadas em dd/mm", com as notas, e "Responder de novo" reabre
 * com as da última vez (e "Cancelar" volta ao recolhido).
 */
function QuestionarioDaLicao(props: { enviado: QuestionarioLicao | undefined; enviar(dados: { notas: NotasLicao; texto?: string }): Promise<unknown> }) {
	const { enviado } = props;
	const [editando, setEditando] = useState(false);
	const [rascunho, setRascunho] = useState<RascunhoQuestionario>(rascunhoVazio);
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<string | undefined>(undefined);
	const titulo = useId();
	const problema = problemaDoQuestionario(rascunho);

	const enviar = () => {
		if (enviando || problema) return;
		let dados: { notas: NotasLicao; texto?: string };
		try {
			dados = dadosDoQuestionario(rascunho);
		} catch (falha) {
			setErro((falha as Error).message);
			return;
		}
		setErro(undefined);
		setEnviando(true);
		props
			.enviar(dados)
			.then(() => setEditando(false))
			.catch((falha: unknown) => setErro(falha instanceof Error ? falha.message : String(falha)))
			.finally(() => setEnviando(false));
	};
	const responderDeNovo = () => {
		setRascunho(rascunhoDoEnviado(enviado));
		setErro(undefined);
		setEditando(true);
	};

	if (enviado && !editando) {
		const resumo = resumoDoQuestionario(enviado);
		return (
			<section className="modulo__cartao questionario questionario--enviado" aria-labelledby={titulo}>
				<div className="questionario__enviado-cabeca">
					<span className="questionario__enviado-marca" aria-hidden="true">
						<Icon name="check" size={16} strokeWidth={2.5} />
					</span>
					<div className="questionario__enviado-titulos">
						<p className="overline questionario__rotulo">{TITULO_QUESTIONARIO}</p>
						<h3 id={titulo} className="body-strong questionario__enviado-titulo">
							{tituloDoEnviado(enviado)}
						</h3>
					</div>
					<Button variant="ghost" size="sm" icon="refresh" onClick={responderDeNovo}>
						Responder de novo
					</Button>
				</div>
				{resumo.length > 0 ? (
					<dl className="questionario__resumo">
						{resumo.map((item) => (
							<div key={item.pergunta} className="questionario__resumo-linha">
								<dt className="body-sm questionario__resumo-pergunta">{item.texto}</dt>
								<dd className="body-sm questionario__resumo-nota">{item.nome}</dd>
							</div>
						))}
					</dl>
				) : null}
			</section>
		);
	}

	return (
		<section className="modulo__cartao questionario" aria-labelledby={titulo}>
			<header className="questionario__cabeca">
				<h3 id={titulo} className="heading questionario__titulo">
					{TITULO_QUESTIONARIO}
				</h3>
				<p className="body-sm questionario__linha">{LINHA_QUESTIONARIO}</p>
			</header>
			<div className="questionario__perguntas">
				{PERGUNTAS_LICAO.map((pergunta) => (
					<PerguntaSlider
						key={pergunta.id}
						pergunta={pergunta.texto}
						valor={notaDaPergunta(rascunho, pergunta.id)}
						aoMudar={(nivel) => setRascunho((atual) => mudarNota(atual, pergunta.id, nivel))}
						desligado={enviando}
					/>
				))}
			</div>
			<TextArea
				label={ROTULO_TEXTO_QUESTIONARIO}
				rows={3}
				maxLength={TEXTO_QUESTIONARIO_MAXIMO}
				value={rascunho.texto}
				disabled={enviando}
				onChange={(evento) => {
					const texto = evento.target.value;
					setRascunho((atual) => ({ ...atual, texto }));
				}}
			/>
			{erro ? (
				<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
					<p>{erro}</p>
				</Callout>
			) : null}
			<div className="questionario__pe">
				{enviado ? (
					<Button variant="ghost" size="sm" onClick={() => setEditando(false)} disabled={enviando}>
						Cancelar
					</Button>
				) : null}
				<Button variant="primary" size="sm" icon="send" onClick={enviar} disabled={Boolean(problema) || enviando} aria-busy={enviando}>
					{enviando ? "Enviando…" : "Enviar"}
				</Button>
			</div>
		</section>
	);
}
