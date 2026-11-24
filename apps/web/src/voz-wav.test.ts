// A conversão da gravação para WAV de 16 kHz (voz-wav.ts): reamostrar, PCM de 16 bits e o cabeçalho.

import { describe, expect, it } from "vitest";
import { converterParaWav, juntarBlocos, montarWav, paraBase64, paraPcm16, reamostrar, TAXA_WAV } from "./voz-wav.ts";

const texto = (bytes: Uint8Array, inicio: number, tamanho: number) => String.fromCharCode(...bytes.subarray(inicio, inicio + tamanho));

describe("reamostrar", () => {
	it("a mesma taxa devolve uma cópia igual", () => {
		const entrada = Float32Array.from([0.1, -0.2, 0.3]);
		const saida = reamostrar(entrada, 16000, 16000);
		expect([...saida]).toEqual([...entrada]);
		expect(saida).not.toBe(entrada);
	});

	it("48 kHz para 16 kHz: um terço das amostras, cada uma a média das três originais", () => {
		const saida = reamostrar(Float32Array.from([0, 0.3, 0.6, 1, 1, 1]), 48000, 16000);
		expect(saida.length).toBe(2);
		expect(saida[0]).toBeCloseTo(0.3, 5);
		expect(saida[1]).toBeCloseTo(1, 5);
	});

	it("44,1 kHz para 16 kHz: a duração se mantém", () => {
		const saida = reamostrar(new Float32Array(44100), 44100, 16000);
		expect(Math.abs(saida.length - 16000)).toBeLessThanOrEqual(1);
	});

	it("8 kHz para 16 kHz interpola em linha reta", () => {
		const saida = reamostrar(Float32Array.from([0, 1, 0]), 8000, 16000);
		expect(saida.length).toBe(6);
		expect([...saida].slice(0, 4)).toEqual([0, 0.5, 1, 0.5]);
	});

	it("uma taxa inválida é recusada", () => {
		expect(() => reamostrar(new Float32Array(4), 0)).toThrow(RangeError);
	});
});

describe("paraPcm16", () => {
	it("escala e corta o que passa de 1", () => {
		const pcm = paraPcm16(Float32Array.from([0, 1, -1, 0.5, 2, -3]));
		expect([...pcm]).toEqual([0, 32767, -32768, 16384, 32767, -32768]);
	});
});

describe("montarWav", () => {
	it("o cabeçalho de 44 bytes: RIFF, WAVE, fmt PCM mono 16 kHz, 16 bits, e o tamanho dos dados", () => {
		const wav = montarWav(Int16Array.from([1, -2, 3]));
		const vista = new DataView(wav.buffer);
		expect(wav.length).toBe(44 + 6);
		expect(texto(wav, 0, 4)).toBe("RIFF");
		expect(vista.getUint32(4, true)).toBe(36 + 6);
		expect(texto(wav, 8, 8)).toBe("WAVEfmt ");
		expect(vista.getUint32(16, true)).toBe(16);
		expect(vista.getUint16(20, true)).toBe(1);
		expect(vista.getUint16(22, true)).toBe(1);
		expect(vista.getUint32(24, true)).toBe(TAXA_WAV);
		expect(vista.getUint32(28, true)).toBe(TAXA_WAV * 2);
		expect(vista.getUint16(32, true)).toBe(2);
		expect(vista.getUint16(34, true)).toBe(16);
		expect(texto(wav, 36, 4)).toBe("data");
		expect(vista.getUint32(40, true)).toBe(6);
		expect([vista.getInt16(44, true), vista.getInt16(46, true), vista.getInt16(48, true)]).toEqual([1, -2, 3]);
	});

	it("sem amostras é só o cabeçalho", () => {
		expect(montarWav(new Int16Array(0)).length).toBe(44);
	});
});

describe("converterParaWav", () => {
	it("junta os blocos, reamostra e informa a duração", () => {
		const blocos = [new Float32Array(24000).fill(0.5), new Float32Array(24000).fill(0.5)];
		const { wav, segundos } = converterParaWav(blocos, 48000);
		expect(segundos).toBeCloseTo(1, 3);
		expect(wav.length).toBe(44 + 16000 * 2);
		expect(new DataView(wav.buffer).getInt16(44, true)).toBe(16384);
	});

	it("juntarBlocos respeita a ordem", () => {
		expect([...juntarBlocos([Float32Array.from([1, 2]), Float32Array.from([3])])]).toEqual([1, 2, 3]);
	});
});

describe("paraBase64", () => {
	it("codifica certo, inclusive um arquivo maior que o passo", () => {
		expect(paraBase64(Uint8Array.from([104, 105]))).toBe("aGk=");
		const grande = new Uint8Array(100_000).fill(65);
		expect(atob(paraBase64(grande))).toBe("A".repeat(100_000));
	});
});
