// A linha do tempo do caderno (ESPECIFICACAO 8.1, item 4.3): os eventos do
// eventos.jsonl da matéria, do mais novo ao mais antigo (a timeline não é um
// arquivo à parte, seção 7). Vive fora da TelaCaderno para o painel poder usar
// os mesmos textos sem importar a tela (import circular). Três partes:
// - descreverEvento: o ícone, a frase e o detalhe de cada evento;
// - LinhaDoTempo: a lista vertical completa, agrupada por dia;
// - ModalLinhaDoTempo: o modal que a mostra, aberto pelo botão da aba do caderno.

import { Button, Icon, type IconName, Modal } from "@estudos/design-system";
import { semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import type { Evento } from "../../lib/eventos.ts";
import { dataCurta } from "./comum.ts";
import { numeroCurto } from "./diagnostico-tela.ts";
import { dataNumerica } from "./guia-curso.ts";
import { formatarDolar } from "./ModalMateriais.tsx";

const diaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const NOMES_TIPO: Record<string, string> = { pdf: "PDF", python: "Python", notebook: "Notebook", texto: "Texto" };
const NOMES_CAMPO: Record<string, string> = { nome: "nome", cor: "cor da capa", glifo: "ideograma", provas: "provas" };

/** O nome do curso de um evento: o do resultado, se veio; senão o id do objeto. */
function nomeDoCurso(evento: Evento): string {
	const resultado = (evento.resultado ?? {}) as Record<string, unknown>;
	return typeof resultado.nome === "string" ? resultado.nome : typeof evento.objeto.curso === "string" ? evento.objeto.curso : "um curso";
}

const texto = (valor: unknown): string | undefined => (typeof valor === "string" && valor ? valor : undefined);
const ehDataIso = (valor: unknown): valor is string => typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);

/** "10/11 às 14:00" (ou só a data, ou nada) de um resultado com data e hora. */
function dataEHora(data: unknown, hora: unknown): string {
	if (!ehDataIso(data)) return "";
	return `${dataNumerica(data)}${typeof hora === "string" && hora ? ` às ${hora}` : ""}`;
}

/** O valor de um campo da tarefa que mudou, para o detalhe: data e hora legíveis, null = sem valor. */
function valorDoCampo(campo: string, valor: unknown): string {
	if (valor === null || valor === undefined || valor === "") return campo === "nota" ? "sem nota" : campo === "data" ? "sem data" : campo === "hora" ? "sem hora" : campo === "materia" ? "sem matéria" : "vazio";
	if (campo === "data" && ehDataIso(valor)) return dataNumerica(valor);
	return String(valor);
}

const NOMES_CAMPO_TAREFA: Record<string, string> = { titulo: "título", nota: "nota", data: "data", hora: "hora", materia: "matéria" };

/** O título da nota de um evento da mesa (objeto.titulo; os mais antigos usam objeto.nota). */
function tituloDaNota(evento: Evento): string {
	return texto(evento.objeto.titulo) ?? texto(evento.objeto.nota) ?? "uma nota";
}

/** As frases dos eventos de tarefa (docs/agenda.md, "Eventos"). */
function descreverTarefa(evento: Evento): { icone: IconName; texto: string; detalhe?: string } {
	const resultado = (evento.resultado ?? {}) as Record<string, unknown>;
	const titulo = texto(evento.objeto.titulo) ?? "uma tarefa";
	const trajeto = texto(resultado.deNome) && texto(resultado.paraNome) ? `${texto(resultado.deNome)} → ${texto(resultado.paraNome)}` : "";
	const detalheDe = (...partes: string[]) => partes.filter(Boolean).join(" · ");
	const comDetalhe = (icone: IconName, frase: string, detalhe: string) => ({ icone, texto: `${frase}: ${titulo}`, ...(detalhe ? { detalhe } : {}) });
	switch (evento.verbo) {
		case "criou_tarefa": {
			const quando = dataEHora(resultado.data, resultado.hora);
			return comDetalhe("plus", "Tarefa criada", detalheDe(quando ? `para ${quando}` : "", texto(resultado.colunaNome) ? `em ${texto(resultado.colunaNome)}` : ""));
		}
		case "editou_tarefa": {
			const mudou = (resultado.mudou ?? {}) as Record<string, unknown>;
			const antes = (resultado.antes ?? {}) as Record<string, unknown>;
			const partes = Object.keys(mudou).map((campo) => {
				const nome = NOMES_CAMPO_TAREFA[campo] ?? campo;
				if (campo === "nota") return mudou.nota === null ? "nota apagada" : "nota alterada";
				const antigo = antes[campo] === undefined ? "" : `${valorDoCampo(campo, antes[campo])} → `;
				return `${nome}: ${antigo}${valorDoCampo(campo, mudou[campo])}`;
			});
			return comDetalhe("refresh", "Tarefa editada", detalheDe(...partes));
		}
		case "moveu_tarefa":
			return comDetalhe("arrow-right", "Tarefa movida", trajeto);
		case "concluiu_tarefa":
			return comDetalhe("check", "Tarefa concluída", trajeto);
		case "reabriu_tarefa":
			return comDetalhe("refresh", "Tarefa reaberta", trajeto);
		default: {
			const quando = dataEHora(resultado.data, resultado.hora);
			return comDetalhe(
				"close",
				"Tarefa apagada",
				detalheDe(texto(resultado.colunaNome) ? `estava em ${texto(resultado.colunaNome)}` : "", resultado.concluida === true ? "já concluída" : "", quando ? `era para ${quando}` : ""),
			);
		}
	}
}

/** As frases do alterou_quadro, uma por ação (docs/agenda.md, "Eventos"). */
function descreverQuadro(evento: Evento): { icone: IconName; texto: string; detalhe?: string } {
	const resultado = (evento.resultado ?? {}) as Record<string, unknown>;
	const coluna = texto(evento.objeto.nome) ?? texto(evento.objeto.coluna) ?? "uma coluna";
	const contagem = (quantos: unknown, um: string, varios: string) => (typeof quantos === "number" ? `${quantos} ${quantos === 1 ? um : varios}` : "");
	switch (resultado.acao) {
		case "criou_coluna":
			return { icone: "plus", texto: `Coluna criada: ${coluna}`, ...(typeof resultado.posicao === "number" ? { detalhe: `posição ${resultado.posicao + 1}` } : {}) };
		case "renomeou_coluna":
			return { icone: "refresh", texto: `Coluna renomeada: ${texto(resultado.para) ?? coluna}`, ...(texto(resultado.de) ? { detalhe: `antes: ${texto(resultado.de)}` } : {}) };
		case "reordenou_colunas":
			return { icone: "list", texto: "Colunas reordenadas" };
		case "marcou_feito": {
			const detalhe = [contagem(resultado.concluidas, "tarefa concluída", "tarefas concluídas"), contagem(resultado.reabertas, "tarefa reaberta", "tarefas reabertas")].filter(Boolean).join(" · ");
			return { icone: "check", texto: `Coluna de feito: ${coluna}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "apagou_coluna": {
			const movidas = Array.isArray(resultado.movidas) ? resultado.movidas.length : 0;
			const detalhe = movidas > 0 ? `${contagem(movidas, "tarefa foi", "tarefas foram")} para ${texto(resultado.destinoNome) ?? "outra coluna"}` : "";
			return { icone: "close", texto: `Coluna apagada: ${coluna}`, ...(detalhe ? { detalhe } : {}) };
		}
		default:
			return { icone: "list", texto: "Quadro alterado" };
	}
}

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
		// Mesa de estudo, partes C1 e D: os eventos de nota da mesa guardam o título em objeto.titulo (os de cima, em objeto.nota).
		case "guardou_na_nota": {
			const tamanho = typeof evento.objeto.tamanho === "number" ? evento.objeto.tamanho : undefined;
			return {
				icone: "notebook",
				texto: `Trecho guardado na nota: ${tituloDaNota(evento)}`,
				...(tamanho !== undefined ? { detalhe: `${tamanho} ${tamanho === 1 ? "caractere" : "caracteres"}` } : {}),
			};
		}
		case "criou_nota_do_professor":
			return { icone: "file", texto: `Nota criada pelo professor: ${tituloDaNota(evento)}` };
		case "desfez_nota_do_professor":
			return { icone: "close", texto: `Nota do professor desfeita: ${tituloDaNota(evento)}` };
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
		case "concluiu_modulo": {
			const modulo = typeof evento.objeto.modulo === "string" ? evento.objeto.modulo : "um módulo";
			const curso = typeof evento.objeto.curso === "string" ? evento.objeto.curso : "um curso";
			const licoes = typeof resultado.licoes === "number" ? `${resultado.licoes} ${resultado.licoes === 1 ? "lição" : "lições"}` : "";
			const questoes = typeof resultado.questoes === "number" ? `${resultado.questoes} ${resultado.questoes === 1 ? "questão" : "questões"}` : "";
			const detalhe = [licoes, questoes].filter(Boolean).join(" · ");
			return { icone: "check", texto: `Módulo concluído: ${modulo} de ${curso}`, ...(detalhe ? { detalhe } : {}) };
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
		case "criou_tarefa":
		case "editou_tarefa":
		case "moveu_tarefa":
		case "concluiu_tarefa":
		case "reabriu_tarefa":
		case "apagou_tarefa":
			return descreverTarefa(evento);
		case "alterou_quadro":
			return descreverQuadro(evento);
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

/** O aviso das linhas do eventos.jsonl que não puderam ser lidas. */
function avisoInvalidas(invalidas: number): string {
	return `${invalidas === 1 ? "Uma linha" : `${invalidas} linhas`} do eventos.jsonl não ${invalidas === 1 ? "pôde" : "puderam"} ser lida${invalidas === 1 ? "" : "s"} (o arquivo não foi mexido).`;
}

/** A lista vertical completa, agrupada por dia. */
export function LinhaDoTempo({ eventos, invalidas }: { eventos: Evento[]; invalidas: number }) {
	const grupos = porDia(eventos);
	if (grupos.length === 0) return <p className="body caderno__carregando">Nada aconteceu neste caderno ainda.</p>;
	let ordem = 0;
	// Com movimento reduzido, os eventos aparecem de uma vez, sem deslocar.
	const parado = semMovimento();
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
									initial={parado ? false : { opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									transition={parado ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 30, delay: atraso }}
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
			{invalidas > 0 ? <p className="body-sm tempo__aviso">{avisoInvalidas(invalidas)}</p> : null}
		</div>
	);
}

interface PropsModalLinhaDoTempo {
	aberto: boolean;
	fechar(): void;
	eventos: Evento[];
	invalidas: number;
	/** O nome da matéria, no alto do modal. */
	titulo?: string;
}

/** A lista vertical completa num modal (o corpo do Modal já rola). */
export function ModalLinhaDoTempo(props: PropsModalLinhaDoTempo) {
	return (
		<Modal
			open={props.aberto}
			onClose={props.fechar}
			title="Linha do tempo"
			kicker={props.titulo}
			size="md"
			footer={
				<Button variant="primary" onClick={props.fechar}>
					Fechar
				</Button>
			}
		>
			<LinhaDoTempo eventos={props.eventos} invalidas={props.invalidas} />
		</Modal>
	);
}
