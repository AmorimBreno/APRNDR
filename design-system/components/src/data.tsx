import * as React from 'react';
import { cx } from './util';

/* ───────────── Meter ───────────── */

export interface MeterItem {
  /** Rótulo curto sob a barra, que se explica sozinho ("01", "Seg", "Prática"). Nada de siglas. */
  label: string;
  /** 0 a 1. */
  value: number;
  /** Nome completo para leitor de tela ("Módulo 01 · Limites"). */
  title?: string;
}

export interface MeterProps extends React.HTMLAttributes<HTMLElement> {
  items: MeterItem[];
  /** Altura das barras em px. Padrão 96. */
  height?: number;
  /** Cor do preenchimento. ink = cor do texto (use sobre cards coloridos). Padrão sage. */
  tone?: 'sage' | 'amber' | 'brick' | 'cream' | 'steel' | 'ink';
  /** Legenda acima, dizendo o que as barras medem ("Progresso por módulo"). */
  label?: React.ReactNode;
  /** Mostra o número (0–100) em cima de cada barra. */
  showValues?: boolean;
}

/** Medidor de barras verticais contornadas, como os medidores de um sintetizador antigo: progresso por módulo, questões por dia, urgência de revisão. */
export function Meter({ items, height = 96, tone = 'sage', label, showValues = true, className, style, ...rest }: MeterProps) {
  return (
    <figure className={cx('ap-meter', `ap-meter--${tone}`, className)} style={style} {...rest}>
      {label != null && <figcaption className="ap-meter__label overline">{label}</figcaption>}
      <div className="ap-meter__bars">
        {items.map((it) => {
          const pct = Math.round(Math.max(0, Math.min(1, it.value)) * 100);
          return (
            <div key={it.label} className="ap-meter__col">
              {showValues && <span className="ap-meter__value data" aria-hidden="true">{pct}</span>}
              <div
                className="ap-meter__bar"
                style={{ height }}
                role="meter"
                aria-label={it.title ?? it.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <span className="ap-meter__fill" style={{ height: pct + '%' }} />
              </div>
              <span className="ap-meter__name overline" aria-hidden="true">{it.label}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/* ───────────── Stat ───────────── */

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  /** O número. */
  value: string | number;
  /** Legenda em letra de painel. */
  label?: React.ReactNode;
  /** Sufixo pequeno no alto ("%", "/100", "pts"). */
  suffix?: React.ReactNode;
  /** Pinta o último caractere de tijolo. Só sobre fundos escuros ou cream. */
  accent?: boolean;
  /** Só no poster: xl = 96px (padrão) · lg = 56px. */
  size?: 'lg' | 'xl';
  /**
   * poster (padrão) = Unbounded gigante, o número-pôster da tela.
   * figure = leitura de painel em IBM Plex Mono (data-xl, 56px), com o sufixo na metade do tamanho:
   * a porcentagem de conclusão e a nota dentro de cards e caixas.
   */
  variant?: 'poster' | 'figure';
}

/** Número grande com legenda. poster: nota final, dias seguidos (um por tela). figure: porcentagem de conclusão e nota dentro de cards. */
export function Stat({ value, label, suffix, accent, size = 'xl', variant = 'poster', className, ...rest }: StatProps) {
  const s = String(value);
  const head = accent && s.length > 1 ? s.slice(0, -1) : s;
  const tail = accent && s.length > 1 ? s.slice(-1) : '';
  const figure = variant === 'figure';
  return (
    <div className={cx('ap-stat', figure && 'ap-stat--figure', className)} {...rest}>
      <span className={cx('ap-stat__value', figure ? 'data-xl' : size === 'xl' ? 'display-xl' : 'display-lg')}>
        {head}
        {tail && <span className="ap-stat__accent">{tail}</span>}
        {suffix != null && <span className={cx('ap-stat__suffix', !figure && 'data')}>{suffix}</span>}
      </span>
      {label != null && <span className="ap-stat__label overline">{label}</span>}
    </div>
  );
}

/* ───────────── SpecBox ───────────── */

export interface SpecBoxProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Texto à esquerda do cabeçalho ("MOD-03"). */
  title?: React.ReactNode;
  /** Texto à direita do cabeçalho ("Derivadas"). */
  code?: React.ReactNode;
}

/** Caixa técnica de traço grosso, como numa ficha de máquina: cabeçalho opcional separado por filete e o conteúdo (Readout, Meter). Herda a cor do card. */
export function SpecBox({ title, code, className, children, ...rest }: SpecBoxProps) {
  return (
    <div className={cx('ap-spec', className)} {...rest}>
      {(title != null || code != null) && (
        <div className="ap-spec__head overline">
          <span>{title}</span>
          <span>{code}</span>
        </div>
      )}
      <div className="ap-spec__body">{children}</div>
    </div>
  );
}

/* ───────────── Readout ───────────── */

export interface ReadoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Legenda à esquerda, até duas linhas ("Questões restantes"). */
  label: React.ReactNode;
  value: React.ReactNode;
  /** Unidade depois do valor ("s", "min"). */
  unit?: React.ReactNode;
}

/** Leitura técnica: legenda de painel ao lado de um valor numa caixa contornada, como "ROUNDS REMAINING [571]". Herda a cor do card. */
export function Readout({ label, value, unit, className, ...rest }: ReadoutProps) {
  return (
    <div className={cx('ap-readout', className)} {...rest}>
      <span className="ap-readout__label overline">{label}</span>
      <span className="ap-readout__box">
        <span className="ap-readout__value data-lg">{value}</span>
        {unit != null && <span className="ap-readout__unit data">{unit}</span>}
      </span>
    </div>
  );
}
