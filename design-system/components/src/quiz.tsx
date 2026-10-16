import * as React from 'react';
import { cx, pad2, letter } from './util';
import { Icon } from './icons';
import { Button, Tag } from './base';

/* ───────────── QuizProgress ───────────── */

export type QuizResult = 'correct' | 'incorrect' | 'partial' | 'skipped' | null | undefined;

export interface QuizProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'results'> {
  /** Número de questões. */
  total: number;
  /** Questão atual, começando em 1. */
  current: number;
  /** Resultado de cada questão já respondida (índice 0 = questão 1). */
  results?: QuizResult[];
  /** Tempo decorrido ou restante ("02:47"). */
  time?: string;
  /** Rótulo à esquerda. Padrão "Questão". */
  label?: string;
}

/** Placar do questionário: "03/10", tempo e uma fileira de blocos tipo LED — sálvia acertou, tijolo errou, âmbar é a atual. */
export function QuizProgress({ total, current, results = [], time, label = 'Questão', className, ...rest }: QuizProgressProps) {
  const segs = Array.from({ length: total }, (_, i) => {
    const r = results[i];
    if (r) return r;
    if (i + 1 === current) return 'current';
    return 'todo';
  });
  const names: Record<string, string> = { correct: 'certa', incorrect: 'errada', partial: 'parcial', skipped: 'pulada', current: 'atual', todo: 'a fazer' };
  return (
    <div className={cx('ap-qprog', className)} {...rest}>
      <div className="ap-qprog__row">
        <span className="ap-qprog__label overline">{label}</span>
        <span className="ap-qprog__count data">
          {pad2(current)}<span className="ap-qprog__of">/{pad2(total)}</span>
        </span>
        {time && (
          <span className="ap-qprog__time data">
            <Icon name="clock" size={14} strokeWidth={2.5} />
            {time}
          </span>
        )}
      </div>
      <div
        className="ap-qprog__segs"
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${label} ${current} de ${total}`}
      >
        {segs.map((s, i) => (
          <span key={i} className={cx('ap-qprog__seg', `ap-qprog__seg--${s}`)} title={`${i + 1}: ${names[s]}`} />
        ))}
      </div>
    </div>
  );
}

/* ───────────── QuizQuestion ───────────── */

export interface QuizOption {
  id: string;
  label: React.ReactNode;
}

export interface QuizQuestionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  /** Número da questão (vira "03" em letra de pôster). */
  number?: number;
  total?: number;
  /** Legenda acima do enunciado ("Módulo 03 · Derivadas"). */
  kicker?: React.ReactNode;
  /** Enunciado. */
  prompt: React.ReactNode;
  options: QuizOption[];
  /** id da alternativa escolhida. */
  value?: string | null;
  onChange?: (id: string) => void;
  /** Quando definido, revela o gabarito: a certa fica sálvia, a escolhida errada fica tijolo. Sem ele, serve para enquetes (ex.: perfil de aprendizado). */
  correctId?: string;
  disabled?: boolean;
}

/**
 * Questão de alternativas. Cada alternativa é uma tecla com a letra (A, B, C…) — o teclado também responde:
 * a letra escolhe, setas navegam. Com correctId, mostra certo/errado com ícone e palavra, nunca só cor.
 */
export function QuizQuestion({ number, total, kicker, prompt, options, value, onChange, correctId, disabled, className, children, ...rest }: QuizQuestionProps) {
  const promptId = React.useId();
  const revealed = correctId != null;
  const locked = revealed || !!disabled;
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.id === value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const choose = (i: number) => {
    if (locked) return;
    onChange?.(options[i].id);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    const current = refs.current.findIndex((el) => el === document.activeElement);
    if (/^[a-zA-Z]$/.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const i = k.toUpperCase().charCodeAt(0) - 65;
      if (i >= 0 && i < options.length) {
        e.preventDefault();
        refs.current[i]?.focus();
        choose(i);
      }
      return;
    }
    const step = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0;
    if (step) {
      e.preventDefault();
      const from = current >= 0 ? current : focusIndex;
      const next = (from + step + options.length) % options.length;
      refs.current[next]?.focus();
      choose(next);
    }
  };

  return (
    <section className={cx('ap-quiz', className)} aria-labelledby={promptId} {...rest}>
      {(number != null || kicker != null) && (
        <header className="ap-quiz__head">
          {number != null && (
            <span className="ap-quiz__num display-md">
              {pad2(number)}
              {total != null && <span className="ap-quiz__total data">/{pad2(total)}</span>}
            </span>
          )}
          {kicker != null && <span className="ap-quiz__kicker overline">{kicker}</span>}
        </header>
      )}
      <h3 id={promptId} className="ap-quiz__prompt heading">{prompt}</h3>
      <div className="ap-quiz__options" role="radiogroup" aria-labelledby={promptId} aria-disabled={locked || undefined} onKeyDown={onKeyDown}>
        {options.map((o, i) => {
          const chosen = o.id === value;
          const state = revealed
            ? o.id === correctId
              ? 'correct'
              : chosen
                ? 'incorrect'
                : 'dim'
            : chosen
              ? 'selected'
              : 'idle';
          return (
            <button
              key={o.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-disabled={locked || undefined}
              tabIndex={i === focusIndex ? 0 : -1}
              className={cx('ap-opt', `ap-opt--${state}`)}
              onClick={() => choose(i)}
            >
              <span className="ap-key data" aria-hidden="true">
                {state === 'correct' ? <Icon name="check" size={16} strokeWidth={3} /> : state === 'incorrect' ? <Icon name="close" size={16} strokeWidth={3} /> : letter(i)}
              </span>
              <span className="ap-opt__label body">{o.label}</span>
              {state === 'correct' && <Tag tone="sage" size="sm" icon="check" className="ap-opt__tag">Correta</Tag>}
              {state === 'incorrect' && <Tag tone="brick" size="sm" icon="close" className="ap-opt__tag">Sua resposta</Tag>}
            </button>
          );
        })}
      </div>
      {children}
    </section>
  );
}

/* ───────────── EssayAnswer ───────────── */

export interface EssayAnswerProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange' | 'onSubmit'> {
  number?: number;
  total?: number;
  kicker?: React.ReactNode;
  prompt: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  /** Mostra "Corrigindo…" e trava o envio. */
  submitting?: boolean;
  /** Mínimo de caracteres para liberar o envio. */
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  /** Dica sob o campo. */
  hint?: React.ReactNode;
  /** Rótulo do botão. Padrão "Enviar resposta". */
  submitLabel?: string;
  disabled?: boolean;
}

/** Questão dissertativa: enunciado, campo grande com contador e o botão de enviar para correção. */
export function EssayAnswer({
  number,
  total,
  kicker,
  prompt,
  value,
  defaultValue,
  onChange,
  onSubmit,
  submitting,
  minLength = 0,
  maxLength = 2000,
  placeholder = 'Explique com as suas palavras…',
  hint,
  submitLabel = 'Enviar resposta',
  disabled,
  className,
  ...rest
}: EssayAnswerProps) {
  const promptId = React.useId();
  const fieldId = React.useId();
  const [inner, setInner] = React.useState(defaultValue ?? '');
  const text = value ?? inner;
  const short = text.trim().length < minLength;
  const set = (v: string) => {
    if (value == null) setInner(v);
    onChange?.(v);
  };
  return (
    <section className={cx('ap-quiz', 'ap-essay', className)} aria-labelledby={promptId} {...rest}>
      {(number != null || kicker != null) && (
        <header className="ap-quiz__head">
          {number != null && (
            <span className="ap-quiz__num display-md">
              {pad2(number)}
              {total != null && <span className="ap-quiz__total data">/{pad2(total)}</span>}
            </span>
          )}
          {kicker != null && <span className="ap-quiz__kicker overline">{kicker}</span>}
        </header>
      )}
      <h3 id={promptId} className="ap-quiz__prompt heading">
        <label htmlFor={fieldId}>{prompt}</label>
      </h3>
      <div className="ap-input ap-input--area ap-essay__box">
        <textarea
          id={fieldId}
          className="body-lg"
          rows={7}
          value={text}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled || submitting}
          onChange={(e) => set(e.target.value)}
        />
        <span className="ap-input__count data" aria-live="polite">
          {text.length}/{maxLength}
        </span>
      </div>
      <div className="ap-essay__foot">
        <p className="ap-field__hint body-sm">
          {short && minLength > 0 ? `Escreva pelo menos ${minLength} caracteres.` : hint ?? 'O tutor corrige pelos critérios do módulo e explica o que faltou.'}
        </p>
        <Button variant="primary" icon={submitting ? undefined : 'send'} disabled={disabled || submitting || short || text.trim().length === 0} onClick={() => onSubmit?.(text)}>
          {submitting ? 'Corrigindo…' : submitLabel}
        </Button>
      </div>
    </section>
  );
}

/* ───────────── QuizFeedback ───────────── */

export interface QuizCriterion {
  label: React.ReactNode;
  met: boolean;
}

export interface QuizFeedbackProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** correct = sálvia · incorrect = tijolo · partial = creme (dissertativa com nota parcial). */
  status: 'correct' | 'incorrect' | 'partial';
  /** Título na faixa. Padrão "Correta" / "Ainda não" / "Quase lá". */
  title?: React.ReactNode;
  /** Nota em letra de painel ("7,5/10"). */
  score?: React.ReactNode;
  /** Critérios da correção, cada um atendido ou não. */
  criteria?: QuizCriterion[];
  /** Botões (Próxima, Reexplicar…). */
  actions?: React.ReactNode;
}

const FEEDBACK_TITLES = { correct: 'Correta', incorrect: 'Ainda não', partial: 'Quase lá' };

/** Retorno depois de responder: faixa colorida com ícone e palavra, explicação do tutor, critérios e próximos passos. */
export function QuizFeedback({ status, title, score, criteria, actions, className, children, ...rest }: QuizFeedbackProps) {
  const icon = status === 'correct' ? 'check' : status === 'incorrect' ? 'close' : 'refresh';
  return (
    <section className={cx('ap-feedback', `ap-feedback--${status}`, className)} role="status" {...rest}>
      <header className="ap-feedback__bar">
        <Icon name={icon} size={22} strokeWidth={3} />
        <span className="ap-feedback__title display-sm">{title ?? FEEDBACK_TITLES[status]}</span>
        {score != null && <span className="ap-feedback__score data-lg">{score}</span>}
      </header>
      {(children != null || (criteria && criteria.length > 0)) && (
        <div className="ap-feedback__body">
          {children != null && <div className="ap-prose body">{children}</div>}
          {criteria && criteria.length > 0 && (
            <ul className="ap-feedback__criteria">
              {criteria.map((c, i) => (
                <li key={i} className={cx('ap-crit', c.met ? 'ap-crit--met' : 'ap-crit--miss')}>
                  <Icon name={c.met ? 'check' : 'close'} size={16} strokeWidth={3} />
                  <span className="body">{c.label}</span>
                  <span className="ap-visually-hidden">{c.met ? ' (atendido)' : ' (não atendido)'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {actions != null && <footer className="ap-feedback__actions">{actions}</footer>}
    </section>
  );
}
