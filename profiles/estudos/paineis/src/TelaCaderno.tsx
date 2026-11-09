// O caderno da matéria (ESPECIFICACAO 8.1, item 4.3, parte A): a visualização
// da pasta da matéria. Em cima, a aba tijolo (as classes da CourseBar do
// design system): Matérias, a capa, a prova, o nome, Editar e Conversar. A
// aba é a linha tijolo da roda que subiu (o mesmo view-transition-name).
// À direita da aba, antes da foto do professor, o botão da linha do tempo abre
// a lista completa dos eventos do eventos.jsonl da matéria, por dia, num modal
// (ModalLinhaDoTempo; a timeline não é um arquivo à parte, seção 7).
// Embaixo, na largura toda, o painel (como um dashboard), que rola na vertical
// como um todo com a aba fixa em cima. São duas faixas de cima para baixo (a
// segunda em três colunas, BaixoDoCaderno: a lista com metade da largura e, com
// um quarto cada, as tarefas da matéria e o calendário, AgendaDoCaderno; os dois
// cartões vão do topo do bloco até o fim da janela e ficam fixos no topo enquanto
// o painel rola; abaixo de 1100 px os dois vão lado a lado embaixo da lista, e
// abaixo de 700 px tudo fica numa coluna):
// - Cursos: os cursos da matéria em cards lado a lado e "Novo curso"
//   (FaixaCursos, item 5), que rolam para o lado;
// - a lista com o seletor de tags em cima: Notas (SecaoNotas), Materiais (a
//   área de soltar e a lista do serviço de materiais) e Mapa de conteúdo, os
//   conceitos dos materiais para revisar e aprovar (SecaoMapa, item 4.4). A
//   tag escolhida vem da rota; trocar de tag navega (para o F5 e o histórico
//   dizerem a mesma coisa) e a lista entra com uma mola curta. À direita do
//   seletor ficam as ações da tag aberta: na Notas, o botão "Nova nota".
// Caminho: caderno/<matéria>[/<tag>] com a tag notas, materiais ou mapa (sem
// tag, e nas rotas antigas linha-do-tempo e cursos, vale Notas; ver
// painel-caderno.ts); caderno/<matéria>/notas/<título> abre uma nota, com o
// editor (EditorNota) ocupando a área toda abaixo da aba no lugar do painel;
// caderno/<matéria>/materiais/<arquivo> abre os Materiais com o arquivo em
// destaque; caderno/<matéria>/cursos/novo e
// caderno/<matéria>/cursos/<curso>/guia[/<etapa>] abrem o guia de criação de
// curso (TelaGuiaCurso) no lugar do painel, com a aba no topo;
// caderno/<matéria>/cursos/<curso> abre a visão do curso pronto (TelaCurso), do
// mesmo jeito; caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>]
// abre a visão do módulo gerado (TelaModulo), com a CourseBar no lugar da aba.

import { Button, EmptyState, Icon, NotebookCover, type OrnamentGlyph, pad2 } from "@estudos/design-system";
import { AvatarAgente, type DadosAvatarAgente, type JanelaPerfilHook, type PropsTelaInicial, semEsperar, semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { type CorMateria, type Materia, pastaMateriaisRelativa } from "../../lib/materia-tipos.ts";
import { contextoDaMateria, type DadosCaderno, dataCurta, lerAcoes, PAINEL_CADERNOS, prepararConversa, proximaProva, quando, rotuloCapa } from "./comum.ts";
import { EditorNota } from "./EditorNota.tsx";
import { MesaEstudo, useProfessorDaMesa } from "./MesaEstudo.tsx";
import { ModalMateria } from "./ModalMateria.tsx";
import { contarMapa } from "../../lib/mapa-tipos.ts";
import { custoDoMapa, useMapa } from "./mapa-ponte.ts";
import { ConteudoMateriais, custoDaVisao, formatarDolar } from "./ModalMateriais.tsx";
import { SecaoMapa } from "./SecaoMapa.tsx";
import { SecaoNotas, useListaNotas } from "./SecaoNotas.tsx";
import { useCursos } from "./cursos-ponte.ts";
import { AgendaDoCaderno } from "./AgendaDoCaderno.tsx";
import { BaixoDoCaderno } from "./BaixoDoCaderno.tsx";
import { FaixaCursos } from "./FaixaCursos.tsx";
import { ModalLinhaDoTempo, NOMES_TIPO } from "./LinhaDoTempo.tsx";
import { rotaDaTag, type TagCaderno, tagDaRota } from "./painel-caderno.ts";
import { idDaAba, idDoPainel, SeletorTags } from "./SeletorTags.tsx";
import { TelaCurso } from "./TelaCurso.tsx";
import { TelaGuiaCurso } from "./TelaGuiaCurso.tsx";
import { TelaModulo } from "./TelaModulo.tsx";

export interface PropsTelaCaderno extends PropsTelaInicial {
	janela: JanelaPerfilHook;
	materiaId: string;
	/** Id da seção da rota (notas, materiais ou mapa); qualquer outra cai em Notas (tagDaRota). */
	secao?: string;
	/** Título da nota aberta (na tag Notas). */
	nota?: string;
	/** O arquivo em destaque na tag Materiais (vindo de uma menção numa nota). */
	material?: string;
	/** O guia de criação de curso: sem curso, o de um curso novo; a etapa vem da rota. */
	guia?: { curso?: string; etapa?: string };
	/** A visão do curso pronto: o id do curso. */
	curso?: string;
	/** A visão do módulo gerado: o curso, o módulo e a lição (sem ela, a primeira). */
	modulo?: { curso: string; modulo: string; licao?: string };
}

export function TelaCaderno(props: PropsTelaCaderno) {
	const { estado, acoes } = props.janela;
	const sessaoId = estado.sessao?.sessaoId;
	const recebidas = estado.acoesPorPainel[PAINEL_CADERNOS];
	const { lista, cadernos, errosAbrir } = useMemo(() => lerAcoes(recebidas ?? []), [recebidas]);
	// Trocar de sessão (para abrir a conversa da matéria) zera as ações da ponte;
	// até sair da tela, vale o último caderno recebido, sem piscar "Abrindo".
	const ultimo = useRef<DadosCaderno | undefined>(undefined);
	if (cadernos[props.materiaId]) ultimo.current = cadernos[props.materiaId];
	const caderno = cadernos[props.materiaId] ?? (ultimo.current?.materia.id === props.materiaId ? ultimo.current : undefined);
	const erro = errosAbrir[props.materiaId];
	const [editando, setEditando] = useState(false);
	const [abrindoConversa, setAbrindoConversa] = useState(false);
	// O botão da linha do tempo, na aba: a lista completa por dia num modal.
	const [verTudo, setVerTudo] = useState(false);
	// O formulário da nota nova (SecaoNotas), aberto pelo botão "Nova nota" da linha das tags.
	const [criandoNota, setCriandoNota] = useState(false);
	// A tag da lista de baixo vem da rota (tagDaRota); a base dos ids liga as abas à lista (aria-controls e aria-labelledby).
	const tag = tagDaRota(props.secao);
	const baseIds = useId();

	// A lista (para o número do caderno) e os materiais.
	const { materiaId } = props;
	useEffect(() => {
		if (!sessaoId) return;
		semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "listar"));
		semEsperar(acoes.listarMateriais());
	}, [sessaoId, acoes]);

	// A matéria e os eventos dela; de novo quando muda quantos materiais estão
	// prontos (cada material pronto ou removido vira um evento da linha do tempo).
	const prontos = (estado.materiais ?? []).filter((material) => material.pasta === pastaMateriaisRelativa(materiaId) && material.estado === "pronto").length;
	// E de novo ao trocar de tag e ao abrir ou fechar uma nota: as notas também viram eventos, e os novos
	// precisam estar na linha do tempo logo ao voltar da nota ou de outra tag (o botão da aba também pede de novo ao abrir).
	const notaAberta = tag === "notas" ? props.nota : undefined;
	const comNotaAberta = notaAberta !== undefined;
	useEffect(() => {
		if (sessaoId) semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "abrir", { id: materiaId }));
	}, [prontos, sessaoId, acoes, materiaId, tag, comNotaAberta]);
	// O formulário da nota nova fecha ao trocar de tag, de matéria ou de nota (ele é desta lista).
	useEffect(() => setCriandoNota(false), [tag, materiaId, notaAberta]);
	const notas = useListaNotas(props.janela, materiaId, `${tag}/${props.nota ?? ""}`);
	// O mapa de conteúdo (a contagem da tag e a lista).
	const mapa = useMapa(props.janela, materiaId);
	// Os cursos (a faixa e o guia); de novo ao trocar de tela (voltar do guia traz a lista nova).
	const guia = props.guia;
	const cursos = useCursos(props.janela, materiaId, `${tag}/${guia ? (guia.curso ?? "novo") : ""}/${props.curso ?? ""}`);
	// Os títulos para as menções do editor (o mesmo array enquanto a lista não muda).
	const titulosNotas = useMemo(() => notas?.notas.map((nota) => nota.titulo), [notas]);
	// Os arquivos de material para as menções do editor (só os desta matéria).
	const materiaisDaMateria = estado.materiais;
	const arquivosMencao = useMemo(
		() =>
			materiaisDaMateria
				?.filter((material) => material.pasta === pastaMateriaisRelativa(materiaId))
				.map((material) => ({ nome: material.nome, ...(material.tipo ? { tipo: NOMES_TIPO[material.tipo] ?? material.tipo } : {}) })),
		[materiaisDaMateria, materiaId],
	);

	const materia = caderno?.materia ?? lista?.materias.find((item) => item.id === materiaId);
	const indice = lista?.materias.findIndex((item) => item.id === materiaId) ?? -1;
	const numero = indice >= 0 ? indice + 1 : undefined;
	const materiais = estado.materiais?.filter((material) => material.pasta === pastaMateriaisRelativa(materiaId));
	const contagem = {
		notas: notas?.notas.length,
		materiais: materiais?.length,
		mapa: mapa.mapa ? contarMapa(mapa.mapa).dentro : undefined,
	};
	const voltar = () => props.navegar("");
	// A conversa da matéria: a mais recente dela, ou uma nova com o contexto do caderno.
	const conversar = () => {
		if (!materia || abrindoConversa) return;
		setAbrindoConversa(true);
		prepararConversa(props.janela, props.perfilId, contextoDaMateria(materia))
			.then(() => props.abrirConversa())
			.catch(() => setAbrindoConversa(false));
	};
	// Trocar de tag navega (o F5 e o histórico voltam na mesma tag); escolher a que já está aberta não faz nada.
	const escolherTag = (nova: TagCaderno) => {
		if (nova !== tag) props.navegar(rotaDaTag(materiaId, nova));
	};
	const abrirNota = (titulo: string) => props.navegar(`caderno/${materiaId}/notas/${titulo}`);
	// Abre a linha do tempo pedindo os eventos de novo: o botão vive na aba, em qualquer tela do caderno.
	const abrirLinhaDoTempo = () => {
		if (sessaoId) semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "abrir", { id: materiaId }));
		setVerTudo(true);
	};
	const tom = materia?.cor === "ink" || !materia ? "brick" : materia.cor;
	// O agente da sessão (ou o padrão do perfil), para a foto no guia de curso.
	const nomeAgente = estado.sessao?.agente ?? props.perfil?.agentePadrao;
	const avatarAgente = nomeAgente ? props.perfil?.agentes.find((agente) => agente.nome === nomeAgente)?.avatar : undefined;
	// A meta que fica ao lado do seletor: o que a visão dos materiais e o mapa de conteúdo já custaram.
	const meta =
		tag === "materiais" && materiais && custoDaVisao(materiais) > 0
			? `Visão: ${formatarDolar(custoDaVisao(materiais))}`
			: tag === "mapa" && mapa.mapa && custoDoMapa(mapa.mapa) > 0
				? `Mapa: ${formatarDolar(custoDoMapa(mapa.mapa))}`
				: undefined;
	// Com movimento reduzido, a lista troca no lugar, sem a mola.
	const parado = semMovimento();

	// O módulo gerado: a CourseBar faz o papel da aba (TelaModulo desenha as duas linhas da tela).
	const moduloAberto = props.modulo;
	const agente = nomeAgente ? { nome: nomeAgente, ...(avatarAgente ? { avatar: avatarAgente } : {}) } : undefined;
	// A mesa de estudo: a nota aberta e o módulo ficam à esquerda, com o painel do professor à direita (MesaEstudo).
	const naMesa = (filhos: ReactNode, noModulo = false) => (
		<MesaEstudo
			janela={props.janela}
			perfilId={props.perfilId}
			materiaId={materiaId}
			caminho={props.caminho}
			navegar={props.navegar}
			{...(props.conversa ? { conversa: props.conversa } : {})}
			{...(materia ? { materia } : {})}
			{...(agente ? { agente } : {})}
			{...(noModulo ? { botaoNaFaixa: true } : {})}
		>
			{filhos}
		</MesaEstudo>
	);
	// A nota aberta só vale quando nenhuma das telas acima dela na cadeia (erro, curso, guia) está no lugar.
	const mostraNota = notaAberta !== undefined && !(erro && !materia) && !(props.curso && !guia) && !guia;
	const abaDoCaderno = (
		<AbaCaderno
			{...(materia ? { materia } : {})}
			{...(numero ? { numero } : {})}
			voltar={voltar}
			{...(lista ? { materias: lista.materias } : {})}
			editar={() => setEditando(true)}
			{...(caderno ? { linhaDoTempo: abrirLinhaDoTempo } : {})}
			conversar={conversar}
			abrindo={abrindoConversa}
			{...(agente ? { agente } : {})}
		/>
	);
	return (
		<div className="tela-caderno">
			{moduloAberto ? (
				naMesa(
				<TelaModulo
					key={`${moduloAberto.curso}/${moduloAberto.modulo}`}
					janela={props.janela}
					materiaId={materiaId}
					{...(materia ? { materia } : {})}
					{...(numero ? { numero } : {})}
					cursoId={moduloAberto.curso}
					moduloId={moduloAberto.modulo}
					{...(moduloAberto.licao ? { licaoId: moduloAberto.licao } : {})}
					navegar={props.navegar}
					tom={tom}
					{...(lista ? { materias: lista.materias } : {})}
					{...(nomeAgente ? { agente: { nome: nomeAgente, ...(avatarAgente ? { avatar: avatarAgente } : {}) } } : {})}
				/>,
					true,
				)
			) : mostraNota && notaAberta !== undefined ? (
				naMesa(
					<>
						{abaDoCaderno}
						{/* A nota aberta ocupa a área toda abaixo da aba, no lugar do painel; "voltar" leva ao painel com a tag Notas. */}
						<motion.section
							key="nota"
							className="painel-caderno__nota"
							aria-label={`Nota ${notaAberta}`}
							initial={parado ? false : { opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ type: "spring", stiffness: 380, damping: 32 }}
						>
							<EditorNota
								key={materiaId}
								janela={props.janela}
								materiaId={materiaId}
								{...(materia ? { materiaNome: materia.nome } : {})}
								titulo={notaAberta}
								voltar={() => props.navegar(rotaDaTag(materiaId, "notas"))}
								renomeada={abrirNota}
								{...(titulosNotas ? { titulos: titulosNotas } : {})}
								abrirNota={abrirNota}
								{...(arquivosMencao ? { arquivos: arquivosMencao } : {})}
								abrirMaterial={(nome) => props.navegar(`caderno/${materiaId}/materiais/${nome}`)}
							/>
						</motion.section>
					</>,
				)
			) : (
			<>
			{abaDoCaderno}
			{erro && !materia ? (
				<div className="caderno__erro">
					<EmptyState
						glyph="問"
						title="Não achei este caderno"
						action={
							<Button variant="primary" icon="arrow-left" onClick={voltar}>
								Voltar para as matérias
							</Button>
						}
					>
						{erro}
					</EmptyState>
				</div>
			) : props.curso && !guia ? (
				<TelaCurso
					key={props.curso}
					janela={props.janela}
					materiaId={materiaId}
					{...(materia ? { materia } : {})}
					cursoId={props.curso}
					navegar={props.navegar}
					tom={tom}
					{...(nomeAgente ? { agente: { nome: nomeAgente, ...(avatarAgente ? { avatar: avatarAgente } : {}) } } : {})}
				/>
			) : guia ? (
				<TelaGuiaCurso
					key={guia.curso ?? "novo"}
					janela={props.janela}
					materiaId={materiaId}
					{...(materia ? { materia } : {})}
					{...(guia.curso ? { cursoId: guia.curso } : {})}
					{...(guia.etapa ? { etapa: guia.etapa } : {})}
					mapa={mapa}
					cursos={cursos}
					{...(materiais ? { materiais } : {})}
					navegar={props.navegar}
					tom={tom}
					{...(nomeAgente ? { agente: { nome: nomeAgente, ...(avatarAgente ? { avatar: avatarAgente } : {}) } } : {})}
				/>
				) : (
					// layoutScroll: o painel só rola se a janela for baixa; a lista de dentro de cada seção (FixoERolagem) também tem layoutScroll, e o arrasto do mapa de conteúdo (Reorder) mede certo com qualquer um rolado.
					<motion.div className="painel-caderno" layoutScroll>
						<div className="painel-caderno__bloco">
							<FaixaCursos
								cursos={cursos}
								{...(materia ? { materia } : {})}
								tom={tom}
								novoCurso={() => props.navegar(`caderno/${materiaId}/cursos/novo`)}
								continuar={(curso) => props.navegar(`caderno/${materiaId}/cursos/${curso.id}/guia`)}
								abrir={(curso) => props.navegar(`caderno/${materiaId}/cursos/${curso.id}`)}
							/>
						</div>
						<BaixoDoCaderno>
						<section className="painel-caderno__bloco painel-caderno__lista" aria-label="Notas, materiais e mapa de conteúdo">
							<header className="painel-caderno__seletor">
								<SeletorTags base={baseIds} atual={tag} contagem={contagem} escolher={escolherTag} />
								{meta ? <span className="data painel-caderno__meta">{meta}</span> : null}
								{tag === "notas" && notas ? (
									<div className="painel-caderno__acoes">
										<Button variant="primary" icon="plus" disabled={criandoNota} onClick={() => setCriandoNota(true)}>
											Nova nota
										</Button>
									</div>
								) : null}
							</header>
							{/* O corpo não rola: cada seção (dividir) separa a parte de controle e de entrada, fixa em cima, da lista, que é o motion.div com layoutScroll que rola
								    dentro do cartão (FixoERolagem; o arrasto do mapa mede por ele). A chave faz cada tag abrir no topo. */}
							<motion.div
								key={tag}
								id={idDoPainel(baseIds)}
								role="tabpanel"
								aria-labelledby={idDaAba(baseIds, tag)}
								className="painel-caderno__corpo"
								initial={parado ? false : { opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ type: "spring", stiffness: 380, damping: 32 }}
							>
								{tag === "notas" ? (
									<SecaoNotas
											janela={props.janela}
											materiaId={materiaId}
											{...(notas ? { lista: notas } : {})}
											tom={tom}
											abrirNota={abrirNota}
											criando={criandoNota}
											definirCriando={setCriandoNota}
											dividir
										/>
								) : tag === "mapa" ? (
									<SecaoMapa
										mapa={mapa}
										tom={tom}
										dividir
										irParaMateriais={() => escolherTag("materiais")}
										abrirMaterial={(arquivo) => props.navegar(`caderno/${materiaId}/materiais/${arquivo}`)}
									/>
								) : (
									<ConteudoMateriais
										{...(materiais ? { materiais } : {})}
										pasta={pastaMateriaisRelativa(materiaId)}
										enviar={(arquivos) => acoes.enviarMateriais(pastaMateriaisRelativa(materiaId), arquivos)}
										reprocessar={(caminho) => acoes.reprocessarMaterial(caminho)}
										{...(props.material ? { destaque: props.material } : {})}
										dividir
									/>
								)}
							</motion.div>
						</section>
						<AgendaDoCaderno
							key={materiaId}
							janela={props.janela}
							materiaId={materiaId}
							{...(materia ? { materia } : {})}
							navegar={props.navegar}
							vez={`${tag}/${editando}`}
						/>
						</BaixoDoCaderno>
					</motion.div>
				)}
			</>
			)}
			{caderno ? (
				<ModalLinhaDoTempo aberto={verTudo} fechar={() => setVerTudo(false)} eventos={caderno.eventos} invalidas={caderno.invalidas} titulo={caderno.materia.nome} />
			) : null}
			{materia ? (
				<ModalMateria
					aberto={editando}
					fechar={() => setEditando(false)}
					materia={materia}
					recebidas={recebidas ?? []}
					numero={numero ?? 0}
					salvar={(entrada) => acoes.acaoDaInterface(PAINEL_CADERNOS, "alterar", { id: materia.id, mudancas: entrada })}
					salva={() => setEditando(false)}
				/>
			) : null}
		</div>
	);
}

interface PropsAbaCaderno {
	materia?: Materia;
	numero?: number;
	voltar(): void;
	editar(): void;
	/** Abre a linha do tempo (o modal); sem ela (o caderno ainda não chegou), o botão fica desligado. */
	linhaDoTempo?(): void;
	conversar(): void;
	/** A conversa da matéria está sendo aberta (a sessão troca no servidor). */
	abrindo?: boolean;
	/** O professor, para a foto do botão da conversa. */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
	/** As matérias do Breno, na ordem da roda: as três primeiras dão a cor e o ideograma das capas do leque. */
	materias?: Materia[];
}

interface CapaLeque {
	cor: CorMateria;
	glifo: string;
}

/** Tons e ideogramas que completam o leque quando o Breno tem menos de três matérias (brick fica de fora: a aba já é tijolo). */
const CAPAS_RESERVA: CapaLeque[] = [
	{ cor: "moss", glifo: "学" },
	{ cor: "amber", glifo: "習" },
	{ cor: "steel", glifo: "知" },
	{ cor: "sage", glifo: "読" },
	{ cor: "cream", glifo: "書" },
];

/** As três capas do leque: as primeiras matérias e, se faltarem, tons diferentes entre si e das matérias que já entraram. */
function capasDoLeque(materias: Materia[] | undefined): [CapaLeque, CapaLeque, CapaLeque] {
	const capas: CapaLeque[] = (materias ?? []).slice(0, 3).map((item) => ({ cor: item.cor, glifo: item.glifo }));
	for (const reserva of CAPAS_RESERVA) {
		if (capas.length >= 3) break;
		if (!capas.some((capa) => capa.cor === reserva.cor)) capas.push(reserva);
	}
	// As reservas são cinco tons diferentes, então sempre sobram três capas.
	return capas as [CapaLeque, CapaLeque, CapaLeque];
}

/**
 * A aba tijolo do caderno, com as classes da CourseBar do design system (sem a trilha: o caderno não é um curso).
 * O botão de voltar é um leque de três capas de caderno, empilhadas como um maço, que abre no hover e no foco
 * (as cores são as das primeiras matérias). A capa é o botão de editar a matéria (inclina como a capa da
 * linha do meio da roda), o botão redondo da linha do tempo e a foto do professor, que pula no hover, abre a
 * conversa da matéria.
 */
function AbaCaderno(props: PropsAbaCaderno) {
	const { materia } = props;
	// Dentro da mesa, a foto abre e fecha o painel do professor; fora dela, abre a conversa em tela cheia.
	const mesa = useProfessorDaMesa();
	// A capa da frente é a da primeira matéria; as de trás ficam uma para cada lado.
	const [frente, esquerda, direita] = capasDoLeque(props.materias);
	const prova = materia ? proximaProva(materia, new Date()) : undefined;
	const kicker = [props.numero ? `Caderno ${pad2(props.numero)}` : "Caderno", prova ? `${prova.nome} ${quando(prova.dias)}, ${dataCurta(prova.data)}` : ""]
		.filter(Boolean)
		.join(" · ");
	return (
		<header className="ap-cbar aba-caderno">
			<button type="button" className="aba-caderno__leque" onClick={props.voltar} title="Matérias" aria-label="Voltar para as matérias">
				<NotebookCover size="sm" tone={esquerda.cor} glyph={esquerda.glifo as OrnamentGlyph} className="aba-caderno__leque-capa aba-caderno__leque-capa--esquerda" />
				<NotebookCover size="sm" tone={direita.cor} glyph={direita.glifo as OrnamentGlyph} className="aba-caderno__leque-capa aba-caderno__leque-capa--direita" />
				<NotebookCover size="sm" tone={frente.cor} glyph={frente.glifo as OrnamentGlyph} className="aba-caderno__leque-capa aba-caderno__leque-capa--frente" />
			</button>
			<div className="ap-cbar__course aba-caderno__materia">
				{materia ? (
					<button type="button" className="aba-caderno__capa" onClick={props.editar} title="Editar o caderno" aria-label={`Editar o caderno ${materia.nome}`}>
						<NotebookCover size="sm" tone={materia.cor} glyph={materia.glifo as OrnamentGlyph} label={rotuloCapa(materia.nome)} {...(props.numero ? { number: pad2(props.numero) } : {})} />
					</button>
				) : null}
				<div className="ap-cbar__titles">
					<span className="ap-cbar__kicker overline">{kicker}</span>
					<span className="ap-cbar__title display-sm">{materia?.nome ?? "…"}</span>
				</div>
			</div>
			<span className="aba-caderno__espaco" />
			<button
				type="button"
				className="aba-caderno__tempo"
				onClick={props.linhaDoTempo}
				disabled={!props.linhaDoTempo}
				title="Linha do tempo"
				aria-label="Abrir a linha do tempo"
			>
				<Icon name="clock" size={22} strokeWidth={2.25} />
			</button>
			<button
				ref={mesa?.botao}
				type="button"
				className={`aba-caderno__professor${props.abrindo ? " aba-caderno__professor--abrindo" : ""}${mesa?.pulsa ? " aba-caderno__professor--pulsa" : ""}`}
				onClick={mesa ? mesa.alternar : props.conversar}
				disabled={mesa ? false : !materia || props.abrindo}
				aria-busy={mesa ? undefined : props.abrindo}
				{...(mesa ? { "aria-expanded": mesa.aberto, "aria-controls": mesa.idPainel } : {})}
				title={
					mesa
						? mesa.aberto
							? "Fechar o professor (Ctrl+J)"
							: mesa.pendente
								? "O professor espera sua resposta (Ctrl+J)"
								: "Abrir o professor (Ctrl+J)"
						: props.abrindo
							? "Abrindo a conversa…"
							: "Conversar sobre a matéria"
				}
				aria-label={
					mesa
						? mesa.aberto
							? "Fechar o painel do professor"
							: mesa.pendente
								? "Abrir o painel do professor: há uma pergunta esperando resposta"
								: "Abrir o painel do professor"
						: props.abrindo
							? "Abrindo a conversa"
							: "Conversar com o professor sobre a matéria"
				}
			>
				<AvatarAgente nome={props.agente?.nome ?? "Professor"} {...(props.agente?.avatar ? { avatar: props.agente.avatar } : {})} tamanho={60} />
			</button>
		</header>
	);
}
