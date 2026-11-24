// Os planos de estudos (docs/planos-de-estudo.md, decisão 13.21): os tipos, as
// constantes e as funções puras, sem Node, que a extensão (extensions/planos.ts),
// a gravação (lib/planos.ts) e a tela (paineis) usam. Um plano é uma nota comum
// da matéria com a tag "Plano de estudos · " na primeira linha não vazia: uma
// checklist dos assuntos, o objetivo no alto e o histórico das conversas no fim.
// Este arquivo NÃO importa lib/nota-tipos.ts (é ele que importa daqui).

/** O começo da tag, a primeira linha não vazia da nota (seção 1 do contrato). */
export const INICIO_TAG_PLANO = "Plano de estudos · ";

/** customType da entrada da sessão que diz qual plano a conversa segue: data {titulo: string | null} (seção 2). */
export const TIPO_ENTRADA_PLANO = "estudos.plano";

/** customType da mensagem escondida com o resumo do plano, devolvida no before_agent_start (seção 5). */
export const TIPO_MENSAGEM_PLANO = "estudos.plano";

/** O painel da ponte dos planos (seção 7). */
export const PAINEL_PLANOS = "planos";

/** A ação no painel "mesa" do cartão "Plano criado" (gravar: true), como o nota_criada. */
export const ACAO_PLANO_CRIADO = "plano_criado";

/** A ação no painel "notas" que avisa o editor de que a nota mudou fora dele (seção 3). */
export const ACAO_MUDOU_FORA = "mudou_fora";

/** Limites do criar_plano e do atualizar_plano (seção 4). */
export const LIMITE_ITENS_PLANO = 60;
export const LIMITE_TEXTO_ITEM = 300;

/** Até quantos caracteres vai o resumo do plano ao professor (seção 5). */
export const LIMITE_RESUMO_PLANO = 2000;

/** Um item da checklist: numerado de 1 em diante na ordem do arquivo. */
export interface ItemPlano {
	numero: number;
	/** O markdown da linha, sem o "- [ ] " do começo. */
	texto: string;
	feito: boolean;
}

/** O plano lido de uma nota com a tag. */
export interface PlanoLido {
	/** O texto depois de "**Objetivo:**", sem as marcas; undefined se a linha não existe. */
	objetivo?: string;
	itens: ItemPlano[];
	/** Os ids curtos da seção Conversas, na ordem do arquivo. */
	conversas: string[];
	/** O número do primeiro item não marcado; undefined se não há. */
	atual?: number;
	feitos: number;
	total: number;
	/** Todos marcados e pelo menos um. */
	concluido: boolean;
}

/** Uma mudança pedida pelo professor (atualizar_plano). `texto` em marcar/desmarcar confere o item, se vier. */
export type OperacaoPlano =
	| { tipo: "marcar" | "desmarcar"; item: number; texto?: string }
	| { tipo: "acrescentar"; texto: string; depois?: number };

/** O plano na lista do seletor e da ponte. */
export interface ResumoPlano {
	titulo: string;
	feitos: number;
	total: number;
	concluido: boolean;
}

/** O que a nota de plano mostra na lista de notas (ResumoNota.plano). */
export interface ProgressoPlano {
	feitos: number;
	total: number;
}

// --- A ponte "planos" (seção 7) ---

/** O que a tela manda à extensão, por ação. */
export interface AcoesPlanos {
	listar: { materia: string };
	/** titulo null = soltar ("Nenhum"). */
	seguir: { materia: string; titulo: string | null; sessao: string; pedido: string };
	desfazer_plano: { materia: string; titulo: string; sessao: string; pedido: string };
}

export interface ListaPlanos {
	materia: string;
	/** A sessão a que `seguindo` se refere. */
	sessao: string;
	planos: ResumoPlano[];
	/** O título do plano que a conversa segue, ou null. */
	seguindo: string | null;
}

/** O que a extensão manda à tela, por ação (todas passageiras, gravar: false). */
export interface MensagensPlanos {
	lista: ListaPlanos;
	seguindo: { materia: string; sessao: string; pedido: string; titulo: string | null };
	desfeito: { materia: string; titulo: string; pedido: string };
	erro: { ao: keyof AcoesPlanos; materia?: string; pedido?: string; mensagem: string };
}

/** Os dados do cartão "Plano criado" (painel "mesa", ação plano_criado, gravar: true). `chamada` = id da chamada do criar_plano. */
export interface DadosPlanoCriado {
	materia: string;
	titulo: string;
	rota: string;
	chamada: string;
	sessao: string;
}

/** Os dados do mudou_fora (painel "notas"): o arquivo como ficou depois da gravação do professor. */
export interface DadosMudouFora {
	materia: string;
	titulo: string;
	versao: string;
	conteudo: string;
}

// --- Funções puras (WP1 implementa; as assinaturas são o contrato) ---

const FALTA = (nome: string): never => {
	throw new Error(`${nome}: falta implementar (WP1)`);
};

/** A primeira linha não vazia começa com "Plano de estudos · " (com ou sem BOM, \n ou \r\n). */
export function ehPlanoDeEstudos(markdown: string): boolean {
	void markdown;
	return FALTA("ehPlanoDeEstudos");
}

/** O plano da nota, ou undefined se a nota não tem a tag. Seção 1 do contrato (itens de primeiro nível de "## Itens", ou da nota toda). */
export function lerPlano(markdown: string): PlanoLido | undefined {
	void markdown;
	return FALTA("lerPlano");
}

/**
 * Aplica as operações em ordem. Cada uma mexe só na linha do item, numa linha nova da lista ou em nada mais; o resto
 * fica byte a byte igual (o fim de linha do arquivo é mantido). Erro (com a frase para o professor) se a nota não é
 * plano, se um item não existe, se o texto conferido não bate ou se um texto novo passa do limite ou é vazio.
 */
export function aplicarOperacoes(markdown: string, operacoes: readonly OperacaoPlano[]): { markdown: string } | { erro: string } {
	void markdown;
	void operacoes;
	return FALTA("aplicarOperacoes");
}

/** Acrescenta "- [<data>](conversa:<id>)" à seção "## Conversas" (criando a seção no fim, se falta). Se o id já está lá, devolve igual. */
export function acrescentarConversa(markdown: string, idCurto: string, data: string): string {
	void markdown;
	void idCurto;
	void data;
	return FALTA("acrescentarConversa");
}

/** O markdown de um plano novo: a tag com a data local (dd/mm/aaaa), o objetivo (se vier), "## Itens" com as tarefas e "## Conversas" vazia. */
export function montarPlano(entrada: { objetivo?: string; itens: readonly string[]; em: Date }): string {
	void entrada;
	return FALTA("montarPlano");
}

/** O texto escondido que vai ao professor (seção 5), até LIMITE_RESUMO_PLANO caracteres. */
export function resumoParaProfessor(titulo: string, plano: PlanoLido): string {
	void titulo;
	void plano;
	return FALTA("resumoParaProfessor");
}

/** O plano que a conversa segue: o titulo da última entrada TIPO_ENTRADA_PLANO do ramo; null/ausente = undefined. */
export function planoSeguido(entradas: ReadonlyArray<{ type?: string; customType?: string; data?: unknown }>): string | undefined {
	void entradas;
	return FALTA("planoSeguido");
}
