// O que a mesa de estudo lembra entre uma visita e outra (docs/mesa-de-estudo.md,
// 2.3): por perfil, a última matéria, o último caminho dentro de cada matéria
// e a última sessão de cada matéria. Serve ao "Continuar de onde parei" e a
// escolher qual conversa abrir ao entrar no caderno.
//
// Fica no localStorage (vale para todas as abas do navegador, ao contrário do
// sessionStorage do hook do núcleo, que não muda). Ele pode falhar (bloqueado,
// cheio, modo privado), então toda leitura e gravação tem try/catch e a mesa
// funciona sem memória. O armazenamento entra por parâmetro para o teste não
// depender do navegador.

export interface ArmazenamentoMesa {
	getItem(chave: string): string | null;
	setItem(chave: string, valor: string): void;
}

export interface MemoriaMesa {
	/** A última matéria em que o Breno esteve no caderno. */
	ultimaMateria?: string;
	/** O último caminho (caderno/<matéria>/...) de cada matéria. */
	caminhos: Record<string, string>;
	/** O id da última sessão aberta em cada matéria. */
	sessoes: Record<string, string>;
}

const chaveMemoria = (perfilId: string) => `estudos-app:mesa:${perfilId}`;

const armazenamentoPadrao = (): ArmazenamentoMesa | undefined => {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
};

/** Só pares de texto: um valor estranho no storage (editado à mão, de outra versão) não derruba a tela. */
function soTextos(valor: unknown): Record<string, string> {
	if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};
	const saida: Record<string, string> = {};
	for (const [chave, item] of Object.entries(valor)) if (typeof item === "string" && item) saida[chave] = item;
	return saida;
}

export function lerMemoria(perfilId: string, armazenamento: ArmazenamentoMesa | undefined = armazenamentoPadrao()): MemoriaMesa {
	const vazia: MemoriaMesa = { caminhos: {}, sessoes: {} };
	try {
		const bruto = armazenamento?.getItem(chaveMemoria(perfilId));
		if (!bruto) return vazia;
		const dados: unknown = JSON.parse(bruto);
		if (typeof dados !== "object" || dados === null) return vazia;
		const { ultimaMateria, caminhos, sessoes } = dados as Record<string, unknown>;
		return {
			...(typeof ultimaMateria === "string" && ultimaMateria ? { ultimaMateria } : {}),
			caminhos: soTextos(caminhos),
			sessoes: soTextos(sessoes),
		};
	} catch {
		return vazia;
	}
}

function gravar(perfilId: string, memoria: MemoriaMesa, armazenamento: ArmazenamentoMesa | undefined): void {
	try {
		armazenamento?.setItem(chaveMemoria(perfilId), JSON.stringify(memoria));
	} catch {
		// Sem memória: a mesa continua funcionando.
	}
}

/** Lê, muda e grava de novo: outra aba pode ter gravado outra matéria no meio tempo. */
function atualizar(perfilId: string, armazenamento: ArmazenamentoMesa | undefined, mudar: (memoria: MemoriaMesa) => MemoriaMesa): void {
	gravar(perfilId, mudar(lerMemoria(perfilId, armazenamento)), armazenamento);
}

/** O Breno está num caderno: lembra a matéria e o caminho (ignora caminhos que não são desta matéria). */
export function gravarCaminho(perfilId: string, materiaId: string, caminho: string, armazenamento: ArmazenamentoMesa | undefined = armazenamentoPadrao()): void {
	if (caminho !== `caderno/${materiaId}` && !caminho.startsWith(`caderno/${materiaId}/`)) return;
	atualizar(perfilId, armazenamento, (memoria) => ({ ...memoria, ultimaMateria: materiaId, caminhos: { ...memoria.caminhos, [materiaId]: caminho } }));
}

/** A sessão aberta numa matéria. Não mexe na "última matéria": só o caminho diz onde o Breno estava. */
export function gravarSessao(perfilId: string, materiaId: string, sessaoId: string, armazenamento: ArmazenamentoMesa | undefined = armazenamentoPadrao()): void {
	atualizar(perfilId, armazenamento, (memoria) => ({ ...memoria, sessoes: { ...memoria.sessoes, [materiaId]: sessaoId } }));
}

/** Para onde vai o "Continuar de onde parei": a última matéria, se ainda existe, e o último caminho dela. */
export function continuarDeOndeParei(memoria: MemoriaMesa, materiasExistentes: readonly string[]): { materiaId: string; caminho: string } | undefined {
	const materiaId = memoria.ultimaMateria;
	if (!materiaId || !materiasExistentes.includes(materiaId)) return undefined;
	return { materiaId, caminho: memoria.caminhos[materiaId] ?? `caderno/${materiaId}` };
}
