/** Junta classes ignorando valores falsos. */
export function cx(...parts: Array<string | false | null | undefined | 0 | 0n>): string { // [estudos-ia] 0n: o error dos campos é ReactNode
  return parts.filter(Boolean).join(' ');
}

/** As seis cores de marca que viram preenchimento chapado. */
export type Tone = 'amber' | 'brick' | 'sage' | 'moss' | 'cream' | 'steel';

/** Número com dois dígitos, no estilo de painel: 3 → "03". */
export function pad2(n: number): string {
  return n < 10 && n >= 0 ? '0' + n : String(n);
}

/** Letra da alternativa: 0 → "A". */
export function letter(i: number): string {
  return String.fromCharCode(65 + i);
}
