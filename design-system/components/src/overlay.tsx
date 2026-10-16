import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { cx, pad2, type Tone } from './util';
import { Icon } from './icons';

/* ───────────── Modal ───────────── */

export interface ModalProps {
  open: boolean;
  /** Fechar: botão ×, Esc e clique no véu (se dismissible). */
  onClose?: () => void;
  title: React.ReactNode;
  /** Legenda acima do título ("Novo curso · etapa 2 de 4"). */
  kicker?: React.ReactNode;
  /** sm 440px · md 640px (padrão) · lg 880px. */
  size?: 'sm' | 'md' | 'lg';
  /** Cor da faixa do cabeçalho. Padrão amber. brick só para confirmações destrutivas. */
  tone?: 'panel' | Tone;
  children?: React.ReactNode;
  /** Botões do rodapé, alinhados à direita (primário por último). */
  footer?: React.ReactNode;
  /** Rótulo do botão fechar. Padrão "Fechar". */
  closeLabel?: string;
  /** Esc e clique fora fecham. Padrão true. */
  dismissible?: boolean;
  /** Renderiza em document.body. Padrão true. */
  portal?: boolean;
  className?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Janela sobre um véu escuro, com faixa de cabeçalho chapada, como uma ficha técnica.
 * Prende o foco, fecha com Esc e devolve o foco a quem abriu.
 */
export function Modal({
  open,
  onClose,
  title,
  kicker,
  size = 'md',
  tone = 'amber',
  children,
  footer,
  closeLabel = 'Fechar',
  dismissible = true,
  portal = true,
  className,
}: ModalProps) {
  const titleId = React.useId();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const inBody = FOCUSABLE.split(',').map((s) => '.ap-modal__body ' + s).join(',');
    const first = el?.querySelector<HTMLElement>(inBody) ?? el;
    first?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && dismissible && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab' && ref.current) {
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const node = (
    <div className="ap-modal-root">
      <div className="ap-scrim" onClick={dismissible ? onClose : undefined} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('ap-modal', `ap-modal--${size}`, className)}
        onKeyDown={onKeyDown}
      >
        <header className={cx('ap-modal__head', `ap-card--${tone}`)}>
          <div className="ap-modal__titles">
            {kicker != null && <span className="ap-modal__kicker overline">{kicker}</span>}
            <h2 id={titleId} className="ap-modal__title display-sm">{title}</h2>
          </div>
          {onClose && (
            <button type="button" className="ap-modal__close" aria-label={closeLabel} onClick={onClose}>
              <Icon name="close" size={18} strokeWidth={2.75} />
            </button>
          )}
        </header>
        <div className="ap-modal__body">{children}</div>
        {footer != null && <footer className="ap-modal__foot">{footer}</footer>}
      </div>
    </div>
  );

  return portal && typeof document !== 'undefined' ? ReactDOM.createPortal(node, document.body) : node;
}

/* ───────────── Stepper ───────────── */

export type StepItem = string | { label: string; description?: string };

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: StepItem[];
  /** Etapa atual, começando em 0. */
  current: number;
  /** Permite voltar clicando numa etapa já feita. */
  onStepClick?: (index: number) => void;
}

/** Trilho de etapas numeradas (01 → 04) para guias em modal, como a criação de curso. Feita = sálvia com visto; atual = âmbar. */
export function Stepper({ steps, current, onStepClick, className, ...rest }: StepperProps) {
  return (
    <ol className={cx('ap-stepper', className)} {...rest}>
      {steps.map((s, i) => {
        const o = typeof s === 'string' ? { label: s } : s;
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        const inner = (
          <>
            <span className="ap-step__num data" aria-hidden="true">
              {pad2(i + 1)}
              {state === 'done' && <Icon name="check" size={16} strokeWidth={3} />}
            </span>
            <span className="ap-step__text">
              <span className="ap-step__label overline">{o.label}</span>
              {o.description && <span className="ap-step__desc body-sm">{o.description}</span>}
            </span>
            <span className="ap-visually-hidden">{state === 'done' ? ' (feita)' : state === 'current' ? ' (atual)' : ''}</span>
          </>
        );
        return (
          <li key={o.label} className={cx('ap-step', `ap-step--${state}`)} aria-current={state === 'current' ? 'step' : undefined}>
            {onStepClick && state === 'done' ? (
              <button type="button" className="ap-step__btn" onClick={() => onStepClick(i)}>
                {inner}
              </button>
            ) : (
              <span className="ap-step__btn">{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
