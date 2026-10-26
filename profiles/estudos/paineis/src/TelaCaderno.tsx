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
// mesmo jeito.

import { Button, EmptyState, Icon, type IconName, NotebookCover, type OrnamentGlyph, pad2 } from "@estudos/design-system";
import { type JanelaPerfilHook, type PropsTelaInicial, semEsperar } from "@estudos/ui";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Evento } from "../../lib/eventos.ts";
import { type Materia, pastaMateriaisRelativa } from "../../lib/materia-tipos.ts";
import { contextoDaMateria, type DadosCaderno, dataCurta, lerAcoes, PAINEL_CADERNOS, prepararConversa, proximaProva, quando, rotuloCapa } from "./comum.ts";
import { EditorNota } from "./EditorNota.tsx";
import { ModalMateria } from "./ModalMateria.tsx";
import { contarMapa } from "../../lib/mapa-tipos.ts";
import { custoDoMapa, useMapa } from "./mapa-ponte.ts";
import { ConteudoMateriais, custoDaVisao, formatarDolar } from "./ModalMateriais.tsx";
import { SecaoMapa } from "./SecaoMapa.tsx";
import { SecaoNotas, useListaNotas } from "./SecaoNotas.tsx";
import { useCursos } from "./cursos-ponte.ts";
import { numeroCurto } from "./diagnostico-tela.ts";
import { dataNumerica } from "./guia-curso.ts";
import { SecaoCursos } from "./SecaoCursos.tsx";
import { TelaCurso } from "./TelaCurso.tsx";
import { TelaGuiaCurso } from "./TelaGuiaCurso.tsx";

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

const diaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const NOMES_TIPO: Record<string, string> = { pdf: "PDF", python: "Python", notebook: "Notebook", texto: "Texto" };
const NOMES_CAMPO: Record<string, string> = { nome: "nome", cor: "cor da capa", glifo: "ideograma", provas: "provas" };

/** Uma linha da linha do tempo: o ícone, a frase e o detalhe. */
/** O nome do curso de um evento: o do resultado, se veio; senão o id do objeto. */
function nomeDoCurso(evento: Evento): string {
	const resultado = (evento.resultado ?? {}) as Record<string, unknown>;
	return typeof resultado.nome === "string" ? resultado.nome : typeof evento.objeto.curso === "string" ? evento.objeto.curso : "um curso";
}

export function descreverEvento(evento: Evento): { icone: IconName; texto: string; detalhe?: string } {
	const resultado = (evento.resultado ?? {}) as Record<string, unknown>;
	const arquivo = typeof evento.objeto.arquivo === "string" ? evento.objeto.arquivo : "um arquivo";
	const nota = typeof evento.objeto.nota === "string" ? evento.objeto.nota : "uma nota";
	switch (evento.verbo) {
		case "criou_materia":
			return { icone: "notebook", texto: "Caderno criado", ...(typeof resultado.nome === "string" ? { detalhe: resultado.nome } : {}) };
		case "alterou_materia": {
			const partes = Object.keys(resultado).map((campo) => {
				if (campo === "nome") return `nome: ${String(resultado.nome)}`;
				if (campo === "glifo") return `ideograma ${String(resultado.glifo)}`;
				if (campo === "provas") {
					const provas = resultado.provas as Array<{ nome: string; data: string }>;
					return provas.length ? `provas: ${provas.map((prova) => `${prova.nome} em ${dataCurta(prova.data)}`).join(", ")}` : "sem prova marcada";
				}
				return NOMES_CAMPO[campo] ?? campo;
			});
			return { icone: "refresh", texto: "Matéria editada", ...(partes.length ? { detalhe: partes.join(" · ") } : {}) };
		}
		case "adicionou_material":
		case "atualizou_material": {
			const tipo = typeof resultado.tipo === "string" ? (NOMES_TIPO[resultado.tipo] ?? resultado.tipo) : undefined;
			const trechos = typeof resultado.trechos === "number" ? `${resultado.trechos} ${resultado.trechos === 1 ? "trecho" : "trechos"}` : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? `${formatarDolar(resultado.custo)} com a visão` : undefined;
			const detalhe = [tipo, trechos, custo].filter(Boolean).join(" · ");
			return {
				icone: evento.verbo === "adicionou_material" ? "paperclip" : "refresh",
				texto: `${evento.verbo === "adicionou_material" ? "Material adicionado" : "Material atualizado"}: ${arquivo}`,
				...(detalhe ? { detalhe } : {}),
			};
		}
		case "removeu_material":
			return { icone: "close", texto: `Material removido: ${arquivo}` };
		case "criou_nota":
			return { icone: "file", texto: `Nota criada: ${nota}` };
		case "editou_nota":
			return { icone: "book", texto: `Nota editada: ${nota}` };
		case "renomeou_nota":
			return {
				icone: "refresh",
				texto: `Nota renomeada: ${nota}`,
				...(typeof resultado.de === "string"
					? {
							detalhe: [
								`antes: ${resultado.de}`,
								Array.isArray(resultado.mencoesAtualizadas) && resultado.mencoesAtualizadas.length
									? `menções atualizadas em ${(resultado.mencoesAtualizadas as string[]).join(", ")}`
									: "",
							]
								.filter(Boolean)
								.join(" · "),
						}
					: {}),
			};
		case "mapeou_material": {
			const novos = typeof resultado.novos === "number" ? resultado.novos : 0;
			const reforcados = typeof resultado.reforcados === "number" ? resultado.reforcados : 0;
			const custo = typeof resultado.custo === "number" ? resultado.custo : 0;
			const detalhe = [
				novos > 0 ? `${novos} ${novos === 1 ? "conceito novo" : "conceitos novos"}` : "",
				reforcados > 0 ? `${reforcados} ${reforcados === 1 ? "reforçado" : "reforçados"}` : "",
				custo > 0 ? formatarDolar(custo) : "",
			]
				.filter(Boolean)
				.join(" · ");
			return { icone: "bulb", texto: `Mapa atualizado com ${arquivo}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "atualizou_mapa": {
			const semFonte = typeof resultado.semFonte === "number" ? resultado.semFonte : 0;
			return {
				icone: "bulb",
				texto: `Mapa sem ${arquivo}`,
				...(semFonte > 0 ? { detalhe: semFonte === 1 ? "1 conceito ficou sem fonte" : `${semFonte} conceitos ficaram sem fonte` } : {}),
			};
		}
		case "revisou_mapa":
			return { icone: "bulb", texto: "Mapa revisado" };
		case "montou_mapa_do_tema": {
			const tema = typeof resultado.tema === "string" ? resultado.tema : "do curso";
			const novos = typeof resultado.novos === "number" ? resultado.novos : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [novos !== undefined ? `${novos} ${novos === 1 ? "conceito" : "conceitos"}` : "", custo].filter(Boolean).join(" · ");
			return { icone: "bulb", texto: `Mapa montado a partir do tema ${tema}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "comecou_curso":
			return { icone: "flag", texto: `Curso começado: ${typeof resultado.nome === "string" ? resultado.nome : String(evento.objeto.curso ?? "um curso")}` };
		case "descartou_curso":
			return { icone: "close", texto: `Rascunho descartado: ${typeof resultado.nome === "string" ? resultado.nome : String(evento.objeto.curso ?? "um curso")}` };
		case "gerou_diagnostico": {
			const questoes = typeof resultado.questoes === "number" ? resultado.questoes : Array.isArray(resultado.questoes) ? resultado.questoes.length : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [questoes !== undefined ? `${questoes} ${questoes === 1 ? "questão" : "questões"}` : "", custo].filter(Boolean).join(" · ");
			return { icone: "checklist", texto: `Diagnóstico preparado: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "gerou_modulo": {
			const modulo = typeof evento.objeto.modulo === "string" ? evento.objeto.modulo : "um módulo";
			const curso = typeof evento.objeto.curso === "string" ? evento.objeto.curso : "um curso";
			const licoes = typeof resultado.licoes === "number" ? `${resultado.licoes} ${resultado.licoes === 1 ? "lição" : "lições"}` : "";
			const questoes = typeof resultado.questoes === "number" ? `${resultado.questoes} ${resultado.questoes === 1 ? "questão" : "questões"}` : "";
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [licoes, questoes, custo].filter(Boolean).join(" · ");
			return { icone: "book", texto: `Módulo gerado: ${modulo} de ${curso}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "marcou_aguardando_material": {
			const modulo = typeof evento.objeto.modulo === "string" ? evento.objeto.modulo : "um módulo";
			const aviso = typeof resultado.nota === "string" && resultado.nota.trim() ? resultado.nota.trim() : "";
			return { icone: "clock", texto: `Módulo aguardando material: ${modulo}`, ...(aviso ? { detalhe: aviso } : {}) };
		}
		case "gerou_esqueleto": {
			const modulos = typeof resultado.modulos === "number" ? resultado.modulos : Array.isArray(resultado.modulos) ? resultado.modulos.length : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [modulos !== undefined ? `${modulos} ${modulos === 1 ? "módulo" : "módulos"}` : "", custo].filter(Boolean).join(" · ");
			return { icone: "list", texto: `Esqueleto proposto: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "criou_curso": {
			const modulos = typeof resultado.modulos === "number" ? resultado.modulos : Array.isArray(resultado.modulos) ? resultado.modulos.length : undefined;
			const geral = typeof resultado.avaliacaoGeral === "string" && /^\d{4}-\d{2}-\d{2}$/.test(resultado.avaliacaoGeral) ? dataNumerica(resultado.avaliacaoGeral) : "";
			const detalhe = [modulos !== undefined ? `${modulos} ${modulos === 1 ? "módulo" : "módulos"}` : "", geral ? `avaliação geral em ${geral}` : ""].filter(Boolean).join(" · ");
			return { icone: "flag", texto: `Curso criado: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "recalculou_calendario": {
			const geral = typeof resultado.avaliacaoGeral === "string" && /^\d{4}-\d{2}-\d{2}$/.test(resultado.avaliacaoGeral) ? dataNumerica(resultado.avaliacaoGeral) : "";
			return { icone: "refresh", texto: `Calendário recalculado: ${nomeDoCurso(evento)}`, ...(geral ? { detalhe: `avaliação geral em ${geral}` } : {}) };
		}
		case "concluiu_diagnostico": {
			const { acertos, alternativas, dissertativas, nota } = resultado;
			const detalhe = [
				typeof acertos === "number" && typeof alternativas === "number" && alternativas > 0 ? `${acertos} de ${alternativas} ${alternativas === 1 ? "certa" : "certas"}` : "",
				typeof nota === "number" && typeof dissertativas === "number" && dissertativas > 0
					? `${dissertativas === 1 ? "dissertativa" : "dissertativas"} ${numeroCurto(nota * 10)}/10`
					: "",
			]
				.filter(Boolean)
				.join(" · ");
			return { icone: "check", texto: `Diagnóstico concluído: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "aprovou_mapa": {
			const conceitos = typeof resultado.conceitos === "number" ? resultado.conceitos : undefined;
			return {
				icone: "check",
				texto: "Mapa aprovado",
				...(conceitos !== undefined ? { detalhe: `${conceitos} ${conceitos === 1 ? "conceito" : "conceitos"}` } : {}),
			};
		}
		default:
			return { icone: "flag", texto: evento.verbo.replaceAll("_", " ") };
	}
}

/** Os eventos do mais novo ao mais antigo, em grupos por dia (no fuso do computador). */
export function porDia(eventos: readonly Evento[]): Array<{ dia: string; eventos: Evento[] }> {
	const grupos: Array<{ dia: string; eventos: Evento[] }> = [];
	for (const evento of [...eventos].sort((a, b) => b.ts.localeCompare(a.ts))) {
		const dia = diaLongo.format(new Date(evento.ts));
		const ultimo = grupos.at(-1);
		if (ultimo?.dia === dia) ultimo.eventos.push(evento);
		else grupos.push({ dia, eventos: [evento] });
	}
	return grupos;
}

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

	return (
		<div className="tela-caderno">
			<AbaCaderno
				{...(materia ? { materia } : {})}
				{...(numero ? { numero } : {})}
				voltar={voltar}
				editar={() => setEditando(true)}
				conversar={conversar}
				abrindo={abrindoConversa}
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
}

/** A aba tijolo do caderno, com as classes da CourseBar do design system (sem a trilha: o caderno não é um curso). */
function AbaCaderno(props: PropsAbaCaderno) {
	const { materia } = props;
	const prova = materia ? proximaProva(materia, new Date()) : undefined;
	const kicker = [props.numero ? `Caderno ${pad2(props.numero)}` : "Caderno", prova ? `${prova.nome} ${quando(prova.dias)}, ${dataCurta(prova.data)}` : ""]
		.filter(Boolean)
		.join(" · ");
	return (
		<header className="ap-cbar aba-caderno">
			<button type="button" className="ap-cbar__back button" onClick={props.voltar}>
				<Icon name="list" size={18} strokeWidth={2.5} />
				Matérias
			</button>
			<div className="ap-cbar__course aba-caderno__materia">
				{materia ? (
					<NotebookCover size="sm" tone={materia.cor} glyph={materia.glifo as OrnamentGlyph} label={rotuloCapa(materia.nome)} {...(props.numero ? { number: pad2(props.numero) } : {})} />
				) : null}
				<div className="ap-cbar__titles">
					<span className="ap-cbar__kicker overline">{kicker}</span>
					<span className="ap-cbar__title display-sm">{materia?.nome ?? "…"}</span>
				</div>
			</div>
			<span className="aba-caderno__espaco" />
			<button type="button" className="ap-cbar__back button aba-caderno__editar" onClick={props.editar} disabled={!materia}>
				Editar
			</button>
			<button type="button" className="ap-cbar__next" onClick={props.conversar} disabled={!materia || props.abrindo} aria-busy={props.abrindo}>
				<span className="ap-cbar__next-kicker overline">{props.abrindo ? "Abrindo" : "Conversar"}</span>
				<span className="ap-cbar__next-label body-strong">{props.abrindo ? "a conversa…" : "sobre a matéria"}</span>
				<Icon name="arrow-right" size={20} strokeWidth={2.5} />
			</button>
		</header>
	);
}

function LinhaDoTempo({ eventos, invalidas }: { eventos: Evento[]; invalidas: number }) {
	const grupos = porDia(eventos);
	if (grupos.length === 0) return <p className="body caderno__carregando">Nada aconteceu neste caderno ainda.</p>;
	let ordem = 0;
	return (
		<div className="tempo">
			{grupos.map((grupo) => (
				<section key={grupo.dia} className="tempo__dia" aria-label={grupo.dia}>
					<h3 className="overline tempo__data">{grupo.dia}</h3>
					<ol className="tempo__lista">
						{grupo.eventos.map((evento) => {
							const { icone, texto, detalhe } = descreverEvento(evento);
							const atraso = Math.min(ordem++, 12) * 0.035;
							return (
								<motion.li
									key={evento.id}
									className="tempo__evento"
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ type: "spring", stiffness: 420, damping: 30, delay: atraso }}
								>
									<span className="tempo__marca" aria-hidden="true">
										<Icon name={icone} size={16} strokeWidth={2.5} />
									</span>
									<span className="tempo__hora data">{hora.format(new Date(evento.ts))}</span>
									<span className="tempo__texto">
										<span className="body-strong">{texto}</span>
										{detalhe ? <span className="body-sm tempo__detalhe">{detalhe}</span> : null}
									</span>
								</motion.li>
							);
						})}
					</ol>
				</section>
			))}
			{invalidas > 0 ? (
				<p className="body-sm tempo__aviso">
					{invalidas === 1 ? "Uma linha" : `${invalidas} linhas`} do eventos.jsonl não {invalidas === 1 ? "pôde" : "puderam"} ser lida{invalidas === 1 ? "" : "s"} (o arquivo não foi mexido).
				</p>
			) : null}
		</div>
	);
}
