// Tipos e listas das matérias, sem nada do Node: a tela de cadernos
// (profiles/estudos/paineis) importa daqui, e materias.ts reexporta.

/** Cores de capa (tokens do tema). Brick fica de fora: na lista, a linha escolhida já é tijolo. */
export const CORES_MATERIA = ["moss", "amber", "steel", "ink", "cream", "sage"] as const;
export type CorMateria = (typeof CORES_MATERIA)[number];

/** Ideogramas da fonte de ornamento do design system (os únicos que ela tem). */
export const GLIFOS_MATERIA = [
	"学", "習", "学習", "知", "問", "答", "考", "解", "読", "書", "復習", "試験", "完", "独創", "新", "始", "終",
	"一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
] as const;

export interface Prova {
	nome: string;
	/** AAAA-MM-DD. */
	data: string;
}

/** O materia.json. */
export interface Materia {
	id: string;
	nome: string;
	cor: CorMateria;
	glifo: string;
	provas: Prova[];
	/** ISO 8601. */
	criadaEm: string;
}

export interface EntradaMateria {
	nome: string;
	cor?: string;
	glifo?: string;
	provas?: Array<{ nome?: string; data?: string }>;
}

export interface ListaMaterias {
	materias: Materia[];
	/** Pastas em materias/ com materia.json faltando ou ilegível. */
	erros: Array<{ pasta: string; mensagem: string }>;
}
