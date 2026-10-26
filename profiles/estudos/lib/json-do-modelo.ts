// O objeto JSON da resposta de um modelo (o mapeador, o mapa do tema, o
// diagnóstico, o corretor, o esqueleto e os módulos). Sem nada do Node: é
// puro.
//
// O modelo às vezes põe o JSON numa cerca ```json, ou escreve texto antes e
// depois. E as strings do JSON muitas vezes têm markdown com blocos de código
// (```python …```) e chaves ({x}, LaTeX como $\frac{a}{b}$). Por isso a cerca
// de fora só é tirada quando envolve o texto inteiro, e o objeto é procurado
// casando as chaves fora das strings, nunca pela primeira cerca ou pela
// primeira e a última chave do texto.

/**
 * Onde termina o objeto JSON que começa na chave `inicio`: o índice da chave
 * que o fecha, contando as chaves fora das strings (com os escapes delas).
 * Sem fechamento, -1.
 */
function fimDoObjeto(texto: string, inicio: number): number {
	let profundidade = 0;
	let emString = false;
	for (let indice = inicio; indice < texto.length; indice++) {
		const caractere = texto[indice];
		if (emString) {
			if (caractere === "\\") indice++;
			else if (caractere === '"') emString = false;
			continue;
		}
		if (caractere === '"') emString = true;
		else if (caractere === "{") profundidade++;
		else if (caractere === "}") {
			profundidade--;
			if (profundidade === 0) return indice;
		}
	}
	return -1;
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/**
 * O objeto JSON da resposta do modelo. Aceita: o JSON puro; o JSON numa cerca
 * (```json ou ```) que envolve o texto inteiro; o JSON com texto antes e
 * depois (o primeiro objeto que, casando as chaves fora das strings, é um JSON
 * válido). Sem nenhuma chave, Error "a resposta não tem um objeto JSON"; com
 * chaves mas sem objeto válido, Error "o JSON está inválido (…)" com o motivo
 * da primeira tentativa.
 */
export function objetoJsonDoModelo(texto: string): Record<string, unknown> {
	let bruto = texto.trim();
	const cercado = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\1\s*$/.exec(bruto);
	if (cercado) bruto = cercado[2]!.trim();
	let primeiroErro: string | undefined;
	let inicio = bruto.indexOf("{");
	while (inicio >= 0) {
		const fim = fimDoObjeto(bruto, inicio);
		// Sem fechamento (a resposta cortada no limite, por exemplo): tenta o resto e para,
		// para nunca devolver um objeto de dentro do JSON cortado.
		const candidato = fim < 0 ? bruto.slice(inicio) : bruto.slice(inicio, fim + 1);
		try {
			const valor: unknown = JSON.parse(candidato);
			if (ehObjeto(valor)) return valor;
			primeiroErro ??= "não é um objeto";
		} catch (erro) {
			primeiroErro ??= (erro as Error).message;
		}
		if (fim < 0) break;
		// O próximo candidato começa depois deste (nunca um objeto de dentro dele).
		inicio = bruto.indexOf("{", fim + 1);
	}
	if (primeiroErro === undefined) throw new Error("a resposta não tem um objeto JSON");
	throw new Error(`o JSON está inválido (${primeiroErro})`);
}
