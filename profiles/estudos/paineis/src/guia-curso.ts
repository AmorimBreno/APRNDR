// As partes puras do guia de criação de curso (TelaGuiaCurso.tsx) e da seção
// Cursos do caderno (SecaoCursos.tsx): o prazo pelas provas da matéria, os
// rótulos da lista, a seleção da etapa Mapa guardada pelos desmarcados e o
// texto do primário do Mapa.

import type { SituacaoMaterial } from "@estudos/ui";
import {
	type Curso,
	type DadosObjetivo,
	ETAPAS,
	type EntradaBasico,
	type Escopo,
	type Etapa,
	nomeDaEtapa,
	type ResumoCurso,
	type TipoCurso,
} from "../../lib/curso-tipos.ts";
import type { EstadoMapa, MapaConteudo } from "../../lib/mapa-tipos.ts";
import type { Materia, Prova } from "../../lib/materia-tipos.ts";
import { dataLocal, quando } from "./comum.ts";
import { editadaHa } from "./SecaoNotas.tsx";

const UM_DIA = 24 * 60 * 60 * 1000;
const diaMesNumerico = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** "20/11". */
export const dataNumerica = (data: string) => diaMesNumerico.format(dataLocal(data));

// --- Etapas e rotas ----------------------------------------------------------

const ehEtapa = (valor: unknown): valor is Etapa => (ETAPAS as readonly unknown[]).includes(valor);
const confirmada = (curso: Curso, etapa: Etapa) => curso[etapa] !== null && curso[etapa] !== undefined;

/** Dá para abrir a etapa no guia: confirmada, ou a primeira não confirmada. */
export function podeAbrir(curso: Curso | undefined, etapa: Etapa): boolean {
	if (!curso) return etapa === "basico";
	if (confirmada(curso, etapa)) return true;
	return ETAPAS.find((item) => !confirmada(curso, item)) === etapa;
}

/** A etapa em vista: a da rota, se dá para abrir; senão a do curso.json (a primeira não confirmada). */
export function etapaEmVista(curso: Curso | undefined, daRota: string | undefined): Etapa {
	if (!curso) return "basico";
	if (ehEtapa(daRota) && podeAbrir(curso, daRota)) return daRota;
	return curso.etapa;
}

/** Depois de confirmar `etapa`: a seguinte na ordem, se dá para abrir; senão a primeira não confirmada. */
export function etapaDepois(curso: Curso, etapa: Etapa): Etapa {
	const seguinte = ETAPAS[ETAPAS.indexOf(etapa) + 1];
	return seguinte && podeAbrir(curso, seguinte) ? seguinte : curso.etapa;
}

/** O caminho do guia de um curso, na etapa. */
export const caminhoDoGuia = (materia: string, curso: string, etapa?: Etapa) => `caderno/${materia}/cursos/${curso}/guia${etapa ? `/${etapa}` : ""}`;

// --- Básico: o prazo pelas provas ---------------------------------------------

export interface ProvaFutura extends Prova {
	/** Quantos dias faltam (0 = hoje). */
	dias: number;
}

/** As provas da matéria de hoje em diante, da mais próxima para a mais distante. */
export function provasFuturas(materia: Pick<Materia, "provas"> | undefined, hoje: Date): ProvaFutura[] {
	if (!materia) return [];
	const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
	return materia.provas
		.map((prova) => ({ ...prova, dias: Math.round((dataLocal(prova.data).getTime() - inicio) / UM_DIA) }))
		.filter((prova) => prova.dias >= 0)
		.sort((a, b) => a.dias - b.dias);
}

/** O valor da opção de uma prova no RadioGroup do prazo. */
export const valorDaProva = (prova: Prova) => `prova:${prova.nome}|${prova.data}`;

/** "P1 · 20/11 · em 29 dias". */
export const rotuloDaProva = (prova: ProvaFutura) => `${prova.nome} · ${dataNumerica(prova.data)} · ${quando(prova.dias)}`;

/** O que o Breno escreveu na etapa Básico (os campos como texto). */
export interface FormBasico {
	nome: string;
	/** valorDaProva(prova), "outra" ou "sem". */
	escolha: string;
	/** AAAA-MM-DD do campo "Outra data". */
	outraData: string;
	/** O campo numérico, como texto ("4", "2.5"). */
	horas: string;
}

export const HORAS_PADRAO = 4;

/**
 * O formulário do Básico: o do curso, se já foi confirmado (a prova volta a
 * ser escolhida se ainda está entre as futuras com a mesma data; senão o
 * prazo vira "Outra data"); num curso novo, a prova futura mais próxima (ou
 * "Sem prazo") e 4 horas por semana.
 */
export function formBasico(curso: Curso | undefined, provas: readonly ProvaFutura[]): FormBasico {
	const basico = curso?.basico;
	if (!curso || !basico) {
		const primeira = provas[0];
		return { nome: curso?.nome ?? "", escolha: primeira ? valorDaProva(primeira) : "sem", outraData: "", horas: String(HORAS_PADRAO) };
	}
	const daProva = basico.prazo ? provas.find((prova) => prova.data === basico.prazo && (!basico.prova || prova.nome === basico.prova)) : undefined;
	return {
		nome: curso.nome,
		escolha: daProva ? valorDaProva(daProva) : basico.prazo ? "outra" : "sem",
		outraData: daProva ? "" : (basico.prazo ?? ""),
		horas: String(basico.horasPorSemana),
	};
}

/** O que vai para a extensão (ainda sem validar: validarEtapa confere). */
export function entradaBasico(form: FormBasico, provas: readonly ProvaFutura[]): EntradaBasico {
	const prova = provas.find((item) => valorDaProva(item) === form.escolha);
	const texto = form.horas.trim().replace(",", ".");
	const horasPorSemana = texto === "" ? Number.NaN : Number(texto);
	const prazo = prova ? prova.data : form.escolha === "outra" ? form.outraData.trim() || null : null;
	return { nome: form.nome, prazo, ...(prova ? { prova: prova.nome } : {}), horasPorSemana };
}

/** Em qual campo do Básico mostrar um erro da validação (pela frase de validarEtapa). */
export function campoDoErroBasico(mensagem: string): "nome" | "prazo" | "horas" | undefined {
	if (/^(Escreva o nome|O nome do curso)/.test(mensagem)) return "nome";
	if (/^O prazo/.test(mensagem)) return "prazo";
	if (/^As horas/.test(mensagem)) return "horas";
	return undefined;
}

// --- Objetivo -------------------------------------------------------------------

/** O Objetivo do curso, ou o padrão: escopo só o material com material confirmado (livre sem), tipo misto. */
export function formObjetivo(curso: Curso | undefined): DadosObjetivo {
	if (curso?.objetivo) return { ...curso.objetivo };
	const comMaterial = Boolean(curso?.materiais?.arquivos.length);
	return { escopo: comMaterial ? "so_material" : "livre", tipo: "misto", motivo: "" };
}

export const OPCOES_ESCOPO: ReadonlyArray<{ value: Escopo; label: string; description: string }> = [
	{
		value: "so_material",
		label: "Só o material",
		description: "Só os conceitos do mapa. O que vier de fora aparece como complemento, e as avaliações só cobram o material.",
	},
	{ value: "material_base", label: "Material como base", description: "O material é a espinha, mas o professor aprofunda e traz temas relacionados." },
	{ value: "livre", label: "Livre", description: "Sem material, ou com material só de referência." },
];

export const OPCOES_TIPO: ReadonlyArray<{ value: TipoCurso; label: string; description: string }> = [
	{ value: "teorico", label: "Teórico", description: "O que é, como e onde é usado, com mais questões dissertativas conceituais." },
	{ value: "aplicado", label: "Aplicado", description: "Exemplos de aplicação e exercícios práticos." },
	{ value: "misto", label: "Misto", description: "Equilibra os dois." },
];

// --- Materiais ------------------------------------------------------------------

/** Quantos materiais da pasta ainda estão na fila ou processando. */
export const processando = (materiais: readonly SituacaoMaterial[]) =>
	materiais.filter((material) => material.estado === "processando" || material.estado === "na_fila").length;

// --- Mapa: a seleção pelos desmarcados ---------------------------------------

const idsDeDentro = (mapa: MapaConteudo) => mapa.conceitos.filter((conceito) => !conceito.fora).map((conceito) => conceito.id);

/**
 * Os desmarcados ao abrir a etapa: num Mapa já confirmado, os conceitos de
 * dentro que não estão no curso; senão, nenhum (todos marcados).
 */
export function desmarcadosIniciais(mapa: MapaConteudo, curso: Pick<Curso, "mapa"> | undefined): Set<string> {
	const doCurso = curso?.mapa?.conceitos;
	if (!doCurso) return new Set();
	const noCurso = new Set(doCurso);
	return new Set(idsDeDentro(mapa).filter((id) => !noCurso.has(id)));
}

/** Os conceitos marcados: os de dentro do mapa que não estão desmarcados, na ordem do mapa (um conceito novo vem marcado). */
export function marcados(mapa: MapaConteudo, desmarcados: ReadonlySet<string>): string[] {
	return idsDeDentro(mapa).filter((id) => !desmarcados.has(id));
}

/** "18 de 38 conceitos neste curso". */
export function textoSelecao(quantos: number, total: number): string {
	return `${quantos} de ${total} ${total === 1 ? "conceito" : "conceitos"} neste curso`;
}

/** O texto do primário da etapa Mapa: aprovar junto quando o mapa não está aprovado. */
export const textoPrimarioMapa = (mapa: Pick<MapaConteudo, "situacao">) => (mapa.situacao === "aprovado" ? "Continuar" : "Aprovar o mapa e continuar");

/** Por que o primário da etapa Mapa está desligado (undefined = ligado). */
export function motivoMapaParado(estado: Pick<EstadoMapa, "andamento" | "fila" | "pendentes" | "montandoTema"> | undefined, quantosMarcados: number): string | undefined {
	if (!estado) return "Esperando o mapa abrir.";
	if (estado.montandoTema) return "Espere os conceitos do tema chegarem.";
	if (estado.andamento || estado.fila.length > 0) return "Espere o mapeamento terminar.";
	if (estado.pendentes.length > 0) return "Mapeie os arquivos pendentes antes de continuar.";
	if (quantosMarcados === 0) return "Marque pelo menos um conceito para o curso.";
	return undefined;
}

// --- A lista da seção Cursos ----------------------------------------------------

/** A etiqueta da situação: "Rascunho · parou em Mapa" (âmbar) ou "Pronto", com "· 6 módulos" quando se sabe quantos (sálvia). */
export function rotuloCurso(curso: Pick<ResumoCurso, "situacao" | "etapa">, modulos?: number): { texto: string; tom: "amber" | "sage" } {
	if (curso.situacao === "pronto") return { texto: modulos !== undefined ? `Pronto · ${modulos} ${modulos === 1 ? "módulo" : "módulos"}` : "Pronto", tom: "sage" };
	return { texto: `Rascunho · parou em ${nomeDaEtapa(curso.etapa)}`, tom: "amber" };
}

/** O prazo na lista: "P1 em 20/11" (se a data é a de uma prova da matéria), a data, ou "sem prazo". */
export function textoPrazo(prazo: string | null, materia: Pick<Materia, "provas"> | undefined): string {
	if (!prazo) return "sem prazo";
	const prova = materia?.provas.find((item) => item.data === prazo);
	return prova ? `${prova.nome} em ${dataNumerica(prazo)}` : dataNumerica(prazo);
}

/** "editado há 5 min", "editado ontem"… */
export const textoEditado = (alteradoEm: string, agora: Date = new Date()) => `editado ${editadaHa(alteradoEm, agora)}`;
