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
// - Cursos, Aulas, Resumos e Questionários: dizem o que vão ter e em que item
//   chegam.
// Caminho: caderno/<matéria>/<seção> (sem a seção, a linha do tempo);
// caderno/<matéria>/notas/<título> abre uma nota.

import { Button, EmptyState, Icon, type IconName, NotebookCover, type OrnamentGlyph, pad2 } from "@estudos/design-system";
import { type JanelaPerfilHook, type PropsTelaInicial, semEsperar } from "@estudos/ui";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Evento } from "../../lib/eventos.ts";
import { type Materia, pastaMateriaisRelativa } from "../../lib/materia-tipos.ts";
import { contextoDaMateria, type DadosCaderno, dataCurta, lerAcoes, PAINEL_CADERNOS, prepararConversa, proximaProva, quando, rotuloCapa } from "./comum.ts";
import { EditorNota } from "./EditorNota.tsx";
import { ModalMateria } from "./ModalMateria.tsx";
import { ConteudoMateriais, custoDaVisao, formatarDolar } from "./ModalMateriais.tsx";
import { SecaoNotas, useListaNotas } from "./SecaoNotas.tsx";

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
	{
		id: "cursos",
		nome: "Cursos",
		icone: "flag",
		emBreve: {
			glifo: "新",
			titulo: "Nenhum curso ainda",
			texto: "Planos de estudo em módulos, montados pelo guia a partir dos materiais e do mapa de conteúdo. Chegam no item 4.5.",
		},
	},
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
	// Os títulos para as menções do editor (o mesmo array enquanto a lista não muda).
	const titulosNotas = useMemo(() => notas?.notas.map((nota) => nota.titulo), [notas]);

	const materia = caderno?.materia ?? lista?.materias.find((item) => item.id === materiaId);
	const indice = lista?.materias.findIndex((item) => item.id === materiaId) ?? -1;
	const numero = indice >= 0 ? indice + 1 : undefined;
	const materiais = estado.materiais?.filter((material) => material.pasta === pastaMateriaisRelativa(materiaId));
	const contagem: Record<string, number | undefined> = {
		"linha-do-tempo": caderno?.eventos.length,
		materiais: materiais?.length,
		notas: notas?.notas.length,
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
						</header>
						<div className="caderno__secao-corpo">
							{secao.emBreve ? (
								<EmptyState glyph={secao.emBreve.glifo} tone={tom} title={secao.emBreve.titulo}>
									{secao.emBreve.texto}
								</EmptyState>
							) : secao.id === "notas" ? (
								<SecaoNotas janela={props.janela} materiaId={materiaId} {...(notas ? { lista: notas } : {})} tom={tom} abrirNota={abrirNota} />
							) : secao.id === "materiais" ? (
								<ConteudoMateriais
									{...(materiais ? { materiais } : {})}
									pasta={pastaMateriaisRelativa(materiaId)}
									enviar={(arquivos) => acoes.enviarMateriais(pastaMateriaisRelativa(materiaId), arquivos)}
									reprocessar={(caminho) => acoes.reprocessarMaterial(caminho)}
								/>
							) : caderno ? (
								<LinhaDoTempo eventos={caderno.eventos} invalidas={caderno.invalidas} />
							) : (
								<p className="body caderno__carregando">Abrindo o caderno…</p>
							)}
						</div>
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
