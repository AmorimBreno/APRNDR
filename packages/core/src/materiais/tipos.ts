// Tipos do serviço de materiais (ESPECIFICACAO 5.5): o que sai da extração de
// um arquivo. Genérico: um trecho é um pedaço citável de um arquivo (uma
// página de PDF, uma célula de notebook, uma função de Python, uma seção de
// markdown), sem nada de matéria ou curso.

/** De onde veio o texto do trecho. */
export type OrigemTrecho = "texto" | "visao" | "codigo";

export interface Trecho {
	/** Onde fica no arquivo, para citar: "página 12", "célula 3", "def media (linhas 10–25)". */
	local: string;
	/** Nome do arquivo .md do trecho no .extraido ("pagina-012", "celula-003", "trecho-004"). */
	nome: string;
	pagina?: number;
	celula?: number;
	linhas?: [number, number];
	origem: OrigemTrecho;
	/** Modelo que descreveu (origem visao, ou uma figura de saída do notebook). */
	modelo?: string;
	texto: string;
}

export type TipoMaterial = "pdf" | "python" | "notebook" | "texto";

export interface Extracao {
	tipo: TipoMaterial;
	trechos: Trecho[];
	/** Custo da visão em US$ (0 se não precisou). */
	custo: number;
	/** O que não saiu como deveria, sem impedir o resto ("página 3 sem descrição: …"). */
	avisos: string[];
}

/** Pedido de descrição de uma imagem (página de PDF ou figura de notebook). */
export interface PedidoDescricao {
	png: Uint8Array;
	/** O texto que a página já tem (pode ser vazio). */
	texto: string;
	/** "página 12", "figura da célula 3". */
	local: string;
	/** Nome do arquivo, para o contexto do modelo. */
	arquivo: string;
}

export interface Descricao {
	texto: string;
	modelo: string;
	custo: number;
}

/** Descreve uma imagem com um modelo com visão (visao.ts). */
export type Descrever = (pedido: PedidoDescricao) => Promise<Descricao>;

export interface OpcoesExtracao {
	/** Sem ela, as páginas que precisam de visão ficam só com o texto e um aviso. */
	descrever?: Descrever;
	/** Progresso: feito de total ("descrevendo página 3 de 20"). */
	aoProgredir?(progresso: { feito: number; total: number; etapa: string }): void;
	sinal?: AbortSignal;
}

// --- Serviço (servico.ts): configuração e situação dos arquivos; vão para a interface pelo protocolo ---

export interface ConfigMateriais {
	/** Pastas observadas, relativas à pasta de dados, com * para um nível qualquer ("materias/*\/materiais"). */
	pastas: string[];
	/** Modelo com visão (provedor/id) para as páginas visuais. Sem ele, só o texto. */
	modeloVisao?: string;
}

export type EstadoMaterial = "na_fila" | "processando" | "pronto" | "erro" | "nao_suportado";

export interface SituacaoMaterial {
	/** Caminho relativo à pasta de dados, com barras normais ("materias/calculo/materiais/aula-04.pdf"). */
	caminho: string;
	/** A pasta observada ("materias/calculo/materiais"). */
	pasta: string;
	/** O caminho dentro da pasta observada ("aula-04.pdf"). */
	nome: string;
	tipo?: TipoMaterial;
	estado: EstadoMaterial;
	tamanho: number;
	/** O que está fazendo agora ("descrevendo a página 3 de 20"). */
	etapa?: string;
	progresso?: { feito: number; total: number };
	trechos?: number;
	/** US$ da visão. */
	custo?: number;
	avisos?: string[];
	erro?: string;
	/** ISO 8601. */
	extraidoEm?: string;
}

/** Um arquivo que acabou de ficar pronto (`novo` = não tinha extraído antes). */
export interface MaterialPronto {
	caminho: string;
	pasta: string;
	nome: string;
	tipo: TipoMaterial;
	trechos: number;
	custo: number;
	novo: boolean;
}

export type EventoMateriais =
	| { tipo: "situacao"; materiais: SituacaoMaterial[] }
	| { tipo: "pronto"; material: MaterialPronto }
	| { tipo: "removido"; caminho: string; pasta: string; nome: string };
