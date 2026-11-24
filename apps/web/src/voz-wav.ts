// A gravação do microfone vira o que o servidor espera (docs/professor-flutuante.md, R8): WAV PCM de
// 16 bits, mono, 16 kHz, em base64. Funções puras, sem DOM: a captação crua (blocos de Float32 na taxa
// da placa de som) vem do useVoz.ts.

export const TAXA_WAV = 16000;

/** Junta os blocos captados num vetor só. */
export function juntarBlocos(blocos: readonly Float32Array[]): Float32Array {
	const total = blocos.reduce((soma, bloco) => soma + bloco.length, 0);
	const saida = new Float32Array(total);
	let posicao = 0;
	for (const bloco of blocos) {
		saida.set(bloco, posicao);
		posicao += bloco.length;
	}
	return saida;
}

/**
 * Muda a taxa de amostragem. Ao baixar a taxa, cada amostra nova é a média das originais que ela cobre
 * (evita o chiado de aliasing da fala); ao subir, interpola em linha reta.
 */
export function reamostrar(amostras: Float32Array, taxaOrigem: number, taxaDestino = TAXA_WAV): Float32Array {
	if (!(taxaOrigem > 0) || !(taxaDestino > 0)) throw new RangeError("A taxa de amostragem precisa ser maior que zero.");
	if (taxaOrigem === taxaDestino || amostras.length === 0) return Float32Array.from(amostras);
	const razao = taxaOrigem / taxaDestino;
	const tamanho = Math.floor(amostras.length / razao);
	const saida = new Float32Array(tamanho);
	for (let i = 0; i < tamanho; i++) {
		if (razao > 1) {
			const inicio = Math.floor(i * razao);
			const fim = Math.min(amostras.length, Math.max(inicio + 1, Math.floor((i + 1) * razao)));
			let soma = 0;
			for (let j = inicio; j < fim; j++) soma += amostras[j]!;
			saida[i] = soma / (fim - inicio);
		} else {
			const posicao = i * razao;
			const base = Math.floor(posicao);
			const proxima = Math.min(amostras.length - 1, base + 1);
			const fracao = posicao - base;
			saida[i] = amostras[base]! * (1 - fracao) + amostras[proxima]! * fracao;
		}
	}
	return saida;
}

/** Float32 em [-1, 1] para inteiro de 16 bits (o que passa de 1 é cortado). */
export function paraPcm16(amostras: Float32Array): Int16Array {
	const saida = new Int16Array(amostras.length);
	for (let i = 0; i < amostras.length; i++) {
		const valor = Math.max(-1, Math.min(1, amostras[i]!));
		saida[i] = valor < 0 ? Math.round(valor * 0x8000) : Math.round(valor * 0x7fff);
	}
	return saida;
}

/** O arquivo WAV: o cabeçalho de 44 bytes (RIFF, fmt, data) e as amostras, little-endian, mono. */
export function montarWav(pcm: Int16Array, taxa = TAXA_WAV): Uint8Array {
	const bytesDeDados = pcm.length * 2;
	const buffer = new ArrayBuffer(44 + bytesDeDados);
	const vista = new DataView(buffer);
	const texto = (posicao: number, valor: string) => {
		for (let i = 0; i < valor.length; i++) vista.setUint8(posicao + i, valor.charCodeAt(i));
	};
	texto(0, "RIFF");
	vista.setUint32(4, 36 + bytesDeDados, true);
	texto(8, "WAVE");
	texto(12, "fmt ");
	vista.setUint32(16, 16, true); // tamanho do bloco fmt
	vista.setUint16(20, 1, true); // PCM
	vista.setUint16(22, 1, true); // mono
	vista.setUint32(24, taxa, true);
	vista.setUint32(28, taxa * 2, true); // bytes por segundo
	vista.setUint16(32, 2, true); // bytes por quadro
	vista.setUint16(34, 16, true); // bits por amostra
	texto(36, "data");
	vista.setUint32(40, bytesDeDados, true);
	for (let i = 0; i < pcm.length; i++) vista.setInt16(44 + i * 2, pcm[i]!, true);
	return new Uint8Array(buffer);
}

/** Da captação crua (blocos na taxa da placa) ao WAV de 16 kHz. */
export function converterParaWav(blocos: readonly Float32Array[], taxaOrigem: number): { wav: Uint8Array; segundos: number } {
	const reamostrado = reamostrar(juntarBlocos(blocos), taxaOrigem, TAXA_WAV);
	return { wav: montarWav(paraPcm16(reamostrado), TAXA_WAV), segundos: reamostrado.length / TAXA_WAV };
}

/** Base64 sem estourar a pilha com um arquivo grande. */
export function paraBase64(bytes: Uint8Array): string {
	let texto = "";
	const passo = 0x8000;
	for (let i = 0; i < bytes.length; i += passo) texto += String.fromCharCode(...bytes.subarray(i, i + passo));
	return btoa(texto);
}
