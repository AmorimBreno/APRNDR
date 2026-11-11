// A origem de um contexto da tela com âncora (parte C1; docs/mesa-parte-c.md, seção 3):
// a rota da aba mais o ponto exato de onde veio a pergunta, para "Ir ao trecho" voltar
// a ele. Puro e sem React.
//
// Formato: <rota>?bloco=<n>&v=<versão>&antes=<texto>&depois=<texto>, com os valores
// codificados. O separador é "?" porque "#" é aceito em títulos de nota e "?" não é
// (nota-tipos.ts). Uma origem antiga, sem "?", vale como rota sem âncora.

/** O limite da origem no protocolo (LIMITES_CONTEXTO_TELA.origem do núcleo). */
export const LIMITE_ORIGEM = 500;

/** Quantos caracteres de contexto ficam antes e depois da seleção, no máximo. */
export const CONTEXTO_MAXIMO = 40;

/** Até onde o nome do bloco (o título da seção na nota) é guardado. */
const LIMITE_BLOCO = 80;

/** Onde a seleção estava. */
export interface Ancora {
	/** Na lição, o id do bloco; na nota, o título da seção acima da seleção. */
	bloco?: string;
	/** A versão do bloco na lição (versaoDoBloco); omitida na nota. */
	versao?: number;
	/** O texto logo antes da seleção (o fim dele). */
	antes?: string;
	/** O texto logo depois da seleção (o começo dele). */
	depois?: string;
}

export interface OrigemLida {
	rota: string;
	ancora?: Ancora;
}

/** A rota de uma origem, sem a âncora. */
export function rotaDaOrigem(origem: string): string {
	const indice = origem.indexOf("?");
	return indice < 0 ? origem : origem.slice(0, indice);
}

function montar(rota: string, ancora: Ancora): string {
	const partes: string[] = [];
	if (ancora.bloco) partes.push(`bloco=${encodeURIComponent(ancora.bloco)}`);
	if (ancora.versao !== undefined) partes.push(`v=${ancora.versao}`);
	if (ancora.antes) partes.push(`antes=${encodeURIComponent(ancora.antes)}`);
	if (ancora.depois) partes.push(`depois=${encodeURIComponent(ancora.depois)}`);
	return partes.length === 0 ? rota : `${rota}?${partes.join("&")}`;
}

/**
 * Junta a rota e a âncora. Passando de LIMITE_ORIGEM, o contexto antes e depois da
 * seleção encolhe (o antes pelo começo, o depois pelo fim); se ainda não couber, o
 * bloco e a versão saem; no fim, só a rota.
 */
export function formatarOrigem(rota: string, ancora?: Ancora): string {
	if (!ancora) return rota;
	let atual: Ancora = {
		...(ancora.bloco ? { bloco: ancora.bloco.slice(0, LIMITE_BLOCO) } : {}),
		...(ancora.versao !== undefined && Number.isInteger(ancora.versao) && ancora.versao >= 0 ? { versao: ancora.versao } : {}),
		...(ancora.antes ? { antes: ancora.antes.slice(-CONTEXTO_MAXIMO) } : {}),
		...(ancora.depois ? { depois: ancora.depois.slice(0, CONTEXTO_MAXIMO) } : {}),
	};
	let texto = montar(rota, atual);
	while (texto.length > LIMITE_ORIGEM && (atual.antes || atual.depois)) {
		atual = {
			...atual,
			...(atual.antes ? { antes: atual.antes.slice(Math.min(5, atual.antes.length)) } : {}),
			...(atual.depois ? { depois: atual.depois.slice(0, Math.max(0, atual.depois.length - 5)) } : {}),
		};
		if (!atual.antes) delete atual.antes;
		if (!atual.depois) delete atual.depois;
		texto = montar(rota, atual);
	}
	if (texto.length > LIMITE_ORIGEM) {
		const { bloco: _bloco, versao: _versao, ...resto } = atual;
		texto = montar(rota, resto);
	}
	return texto.length > LIMITE_ORIGEM ? rota : texto;
}

function decodificar(valor: string): string | undefined {
	try {
		return decodeURIComponent(valor);
	} catch {
		return undefined;
	}
}

/** Separa a rota e a âncora de uma origem. Campos que não leem bem (codificação quebrada, versão que não é inteiro) são ignorados. */
export function lerOrigem(origem: string): OrigemLida {
	const indice = origem.indexOf("?");
	if (indice < 0) return { rota: origem };
	const rota = origem.slice(0, indice);
	const ancora: Ancora = {};
	for (const parte of origem.slice(indice + 1).split("&")) {
		const igual = parte.indexOf("=");
		if (igual < 0) continue;
		const chave = parte.slice(0, igual);
		const valor = decodificar(parte.slice(igual + 1));
		if (valor === undefined || valor === "") continue;
		if (chave === "bloco") ancora.bloco = valor;
		else if (chave === "antes") ancora.antes = valor;
		else if (chave === "depois") ancora.depois = valor;
		else if (chave === "v" && /^\d+$/.test(valor)) ancora.versao = Number(valor);
	}
	return Object.keys(ancora).length === 0 ? { rota } : { rota, ancora };
}
