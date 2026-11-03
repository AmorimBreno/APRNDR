// O caderno da matéria (ESPECIFICACAO 8.1, item 4.3, parte A): a visualização
// da pasta da matéria. Em cima, a aba tijolo (as classes da CourseBar do
// design system): Matérias, a capa, a prova, o nome, Editar e Conversar. A
// aba é a linha tijolo da roda que subiu (o mesmo view-transition-name).
// Embaixo, o índice das seções à esquerda e a seção aberta à direita:
// - Linha do tempo: os eventos do eventos.jsonl da matéria, do mais novo ao mais
//   antigo, por dia (a timeline não é um arquivo à parte, seção 7);
// - Notas: a lista das notas pessoais (SecaoNotas) e, com um título no
//   caminho, o editor da nota (EditorNota);
// - Materiais: a área de soltar e a lista do serviço de materiais;
// - Mapa de conteúdo: os conceitos dos materiais, para revisar e aprovar
//   (SecaoMapa, item 4.4);
// - Cursos: os cursos da matéria e "Novo curso" (SecaoCursos, item 5);
// - Aulas, Resumos e Questionários: dizem o que vão ter e em que item chegam.
// Caminho: caderno/<matéria>/<seção> (sem a seção, a linha do tempo);
// caderno/<matéria>/notas/<título> abre uma nota; caderno/<matéria>/cursos/novo
// e caderno/<matéria>/cursos/<curso>/guia[/<etapa>] abrem o guia de criação de
// curso (TelaGuiaCurso) no lugar do índice e da seção, com a aba no topo;
// caderno/<matéria>/cursos/<curso> abre a visão do curso pronto (TelaCurso), do
// mesmo jeito; caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>]
// abre a visão do módulo gerado (TelaModulo), com a CourseBar no lugar da aba.

import { Button, EmptyState, Icon, type IconName, NotebookCover, type OrnamentGlyph, pad2 } from "@estudos/design-system";
import { AvatarAgente, type DadosAvatarAgente, type JanelaPerfilHook, type PropsTelaInicial, semEsperar } from "@estudos/ui";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type CorMateria, type Materia, pastaMateriaisRelativa } from "../../lib/materia-tipos.ts";
import { contextoDaMateria, type DadosCaderno, dataCurta, lerAcoes, PAINEL_CADERNOS, prepararConversa, proximaProva, quando, rotuloCapa } from "./comum.ts";
import { EditorNota } from "./EditorNota.tsx";
import { ModalMateria } from "./ModalMateria.tsx";
import { contarMapa } from "../../lib/mapa-tipos.ts";
import { custoDoMapa, useMapa } from "./mapa-ponte.ts";
import { ConteudoMateriais, custoDaVisao, formatarDolar } from "./ModalMateriais.tsx";
import { SecaoMapa } from "./SecaoMapa.tsx";
import { SecaoNotas, useListaNotas } from "./SecaoNotas.tsx";
import { useCursos } from "./cursos-ponte.ts";
import { SecaoCursos } from "./SecaoCursos.tsx";
import { LinhaDoTempo, NOMES_TIPO } from "./LinhaDoTempo.tsx";
import { TelaCurso } from "./TelaCurso.tsx";
import { TelaGuiaCurso } from "./TelaGuiaCurso.tsx";
import { TelaModulo } from "./TelaModulo.tsx";

interface Secao {
	id: string;
	nome: string;
	icone: IconName;
	/** Seções que ainda não existem: o ideograma, o título e o que vão ter. */
	emBreve?: { glifo: OrnamentGlyph; titulo: string; texto: string };
}

export const SECOES: readonly Secao[] = [
	{ id: "linha-do-tempo", nome: "Linha do tempo", icone: "clock" },
	{ id: "notas", nome: "Notas", icone: "book" },
	{ id: "materiais", nome: "Materiais", icone: "paperclip" },
	{ id: "mapa", nome: "Mapa de conteúdo", icone: "bulb" },
	{ id: "cursos", nome: "Cursos", icone: "flag" },
	{
		id: "aulas",
		nome: "Aulas",
		icone: "message",
		emBreve: {
			glifo: "学",
			titulo: "Nenhuma aula ainda",
			texto: "O registro de cada aula ao vivo, com as anotações que o professor escreve enquanto ela acontece. Chegam no item 4.7.",
		},
	},
	{
		id: "resumos",
		nome: "Resumos",
		icone: "list",
		emBreve: {
			glifo: "復習",
			titulo: "Nenhum resumo ainda",
			texto: "O professor escreve o resumo de cada aula quando ela acaba. Chegam com as aulas, no item 4.7.",
		},
	},
	{
		id: "questionarios",
		nome: "Questionários",
		icone: "checklist",
		emBreve: {
			glifo: "試験",
			titulo: "Nenhum questionário ainda",
			texto: "As questões dos cursos, as avaliações dos módulos e a revisão espaçada. Chegam no item 4.8.",
		},
	},
];

export interface PropsTelaCaderno extends PropsTelaInicial {
	janela: JanelaPerfilHook;
	materiaId: string;
	/** Id da seção (SECOES); sem ela, a linha do tempo. */
	secao?: string;
	/** Título da nota aberta (na seção Notas). */
	nota?: string;
	/** O arquivo em destaque na seção Materiais (vindo de uma menção numa nota). */
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
	// E de novo ao trocar de seção: as notas também viram eventos, e voltar para a linha do tempo mostra os novos.
	const secao = SECOES.find((item) => item.id === props.secao) ?? SECOES[0]!;
	useEffect(() => {
		if (sessaoId) semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "abrir", { id: materiaId }));
	}, [prontos, sessaoId, acoes, materiaId, secao.id]);
	const notas = useListaNotas(props.janela, materiaId, `${secao.id}/${props.nota ?? ""}`);
	// O mapa de conteúdo (a contagem do índice e a seção).
	const mapa = useMapa(props.janela, materiaId);
	// Os cursos (a contagem do índice, a seção e o guia); de novo ao trocar de tela (voltar do guia traz a lista nova).
	const guia = props.guia;
	const cursos = useCursos(props.janela, materiaId, `${secao.id}/${guia ? (guia.curso ?? "novo") : ""}/${props.curso ?? ""}`);
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
	const contagem: Record<string, number | undefined> = {
		"linha-do-tempo": caderno?.eventos.length,
		materiais: materiais?.length,
		notas: notas?.notas.length,
		mapa: mapa.mapa ? contarMapa(mapa.mapa).dentro : undefined,
		cursos: cursos.lista?.length,
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
	const irPara = (id: string) => props.navegar(id === SECOES[0]!.id ? `caderno/${materiaId}` : `caderno/${materiaId}/${id}`);
	const abrirNota = (titulo: string) => props.navegar(`caderno/${materiaId}/notas/${titulo}`);
	const tom = materia?.cor === "ink" || !materia ? "brick" : materia.cor;
	// O agente da sessão (ou o padrão do perfil), para a foto no guia de curso.
	const nomeAgente = estado.sessao?.agente ?? props.perfil?.agentePadrao;
	const avatarAgente = nomeAgente ? props.perfil?.agentes.find((agente) => agente.nome === nomeAgente)?.avatar : undefined;
	const notaAberta = secao.id === "notas" ? props.nota : undefined;

	// O módulo gerado: a CourseBar faz o papel da aba (TelaModulo desenha as duas linhas da tela).
	const moduloAberto = props.modulo;
	return (
		<div className="tela-caderno">
			{moduloAberto ? (
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
				/>
			) : (
			<>
			<AbaCaderno
				{...(materia ? { materia } : {})}
				{...(numero ? { numero } : {})}
				voltar={voltar}
				{...(lista ? { materias: lista.materias } : {})}
				editar={() => setEditando(true)}
				conversar={conversar}
				abrindo={abrindoConversa}
				{...(nomeAgente ? { agente: { nome: nomeAgente, ...(avatarAgente ? { avatar: avatarAgente } : {}) } } : {})}
			/>
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
				<div className="caderno">
					<nav className="caderno__indice" aria-label="Seções do caderno">
						<p className="overline caderno__indice-titulo">Neste caderno</p>
						<ul>
							{SECOES.map((item) => {
								const quantos = contagem[item.id];
								return (
									<li key={item.id}>
										<button
											type="button"
											className={`caderno__item${item.id === secao.id ? " caderno__item--atual" : ""}${item.emBreve ? " caderno__item--em-breve" : ""}`}
											aria-current={item.id === secao.id ? "page" : undefined}
											onClick={() => irPara(item.id)}
										>
											<Icon name={item.icone} size={20} strokeWidth={2.25} />
											<span className="caderno__item-nome">{item.nome}</span>
											<span className="caderno__item-conta data">{item.emBreve ? "em breve" : quantos === undefined ? "" : pad2(quantos)}</span>
										</button>
									</li>
								);
							})}
						</ul>
					</nav>
					<motion.section
						key={notaAberta ? `${secao.id}/nota` : secao.id}
						className="caderno__secao"
						{...(notaAberta ? { "aria-label": `Nota ${notaAberta}` } : { "aria-labelledby": "secao-titulo" })}
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ type: "spring", stiffness: 380, damping: 32 }}
					>
						{notaAberta ? (
							<EditorNota
								key={materiaId}
								janela={props.janela}
								materiaId={materiaId}
								{...(materia ? { materiaNome: materia.nome } : {})}
								titulo={notaAberta}
								voltar={() => irPara("notas")}
								renomeada={abrirNota}
								{...(titulosNotas ? { titulos: titulosNotas } : {})}
								abrirNota={abrirNota}
								{...(arquivosMencao ? { arquivos: arquivosMencao } : {})}
								abrirMaterial={(nome) => props.navegar(`caderno/${materiaId}/materiais/${nome}`)}
							/>
						) : (
						<>
						<header className="caderno__secao-cabeca">
							<span className="overline">{materia?.nome ?? "Caderno"}</span>
							<h2 id="secao-titulo" className="display-sm caderno__secao-titulo">
								{secao.nome}
							</h2>
							{secao.id === "materiais" && materiais && custoDaVisao(materiais) > 0 ? (
								<span className="data caderno__secao-meta">Visão: {formatarDolar(custoDaVisao(materiais))}</span>
							) : null}
							{secao.id === "mapa" && mapa.mapa && custoDoMapa(mapa.mapa) > 0 ? (
								<span className="data caderno__secao-meta">Mapa: {formatarDolar(custoDoMapa(mapa.mapa))}</span>
							) : null}
						</header>
						{/* layoutScroll: o arrasto do mapa de conteúdo (Reorder) mede certo com o corpo rolado. */}
						<motion.div className="caderno__secao-corpo" layoutScroll>
							{secao.emBreve ? (
								<EmptyState glyph={secao.emBreve.glifo} tone={tom} title={secao.emBreve.titulo}>
									{secao.emBreve.texto}
								</EmptyState>
							) : secao.id === "notas" ? (
								<SecaoNotas janela={props.janela} materiaId={materiaId} {...(notas ? { lista: notas } : {})} tom={tom} abrirNota={abrirNota} />
							) : secao.id === "cursos" ? (
								<SecaoCursos
									cursos={cursos}
									{...(materia ? { materia } : {})}
									tom={tom}
									novoCurso={() => props.navegar(`caderno/${materiaId}/cursos/novo`)}
									continuar={(curso) => props.navegar(`caderno/${materiaId}/cursos/${curso.id}/guia`)}
									abrir={(curso) => props.navegar(`caderno/${materiaId}/cursos/${curso.id}`)}
								/>
							) : secao.id === "mapa" ? (
								<SecaoMapa
									mapa={mapa}
									tom={tom}
									irParaMateriais={() => irPara("materiais")}
									abrirMaterial={(arquivo) => props.navegar(`caderno/${materiaId}/materiais/${arquivo}`)}
								/>
							) : secao.id === "materiais" ? (
								<ConteudoMateriais
									{...(materiais ? { materiais } : {})}
									pasta={pastaMateriaisRelativa(materiaId)}
									enviar={(arquivos) => acoes.enviarMateriais(pastaMateriaisRelativa(materiaId), arquivos)}
									reprocessar={(caminho) => acoes.reprocessarMaterial(caminho)}
									{...(secao.id === "materiais" && props.material ? { destaque: props.material } : {})}
								/>
							) : caderno ? (
								<LinhaDoTempo eventos={caderno.eventos} invalidas={caderno.invalidas} />
							) : (
								<p className="body caderno__carregando">Abrindo o caderno…</p>
							)}
						</motion.div>
						</>
						)}
					</motion.section>
				</div>
			)}
			</>
			)}
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
 * linha do meio da roda) e a foto do professor, que pula no hover, abre a conversa da matéria.
 */
function AbaCaderno(props: PropsAbaCaderno) {
	const { materia } = props;
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
				className={`aba-caderno__professor${props.abrindo ? " aba-caderno__professor--abrindo" : ""}`}
				onClick={props.conversar}
				disabled={!materia || props.abrindo}
				aria-busy={props.abrindo}
				title={props.abrindo ? "Abrindo a conversa…" : "Conversar sobre a matéria"}
				aria-label={props.abrindo ? "Abrindo a conversa" : "Conversar com o professor sobre a matéria"}
			>
				<AvatarAgente nome={props.agente?.nome ?? "Professor"} {...(props.agente?.avatar ? { avatar: props.agente.avatar } : {})} tamanho={60} />
			</button>
		</header>
	);
}
