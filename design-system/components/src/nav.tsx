import * as React from 'react';
import { cx, pad2, type Tone } from './util';
import { Icon, type IconName } from './icons';
import { type OrnamentGlyph, Sticker, Tag } from './base';
import { SpecBox, Stat, Readout } from './data';

/* ───────────── NotebookCover ───────────── */

export interface NotebookCoverProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Cor da capa. Evite brick na lista de cadernos: a linha selecionada já é tijolo. */
  tone?: 'ink' | Tone;
  /** Ideograma da etiqueta (um da lista do Ornament). */
  glyph?: OrnamentGlyph;
  /** Nome curto na etiqueta ("Cálculo"). Some no tamanho sm. */
  label?: string;
  /** Número do caderno ("03"). */
  number?: string | number;
  /** sm 40×52 · md 72×96 (padrão) · lg 120×160. */
  size?: 'sm' | 'md' | 'lg';
}

/** Capa de caderno desenhada: lombada, elástico e uma etiqueta de papel com ideograma e nome — a imagem de cada matéria. Decorativa. */
export function NotebookCover({ tone = 'moss', glyph = '学', label, number, size = 'md', className, ...rest }: NotebookCoverProps) {
  return (
    <span className={cx('ap-nb', `ap-nb--${tone}`, `ap-nb--${size}`, className)} aria-hidden="true" {...rest}>
      <span className="ap-nb__band" />
      <span className="ap-nb__label">
        <span className="ap-nb__glyph" lang="ja">{glyph}</span>
        {label && size !== 'sm' && <span className="ap-nb__name">{label}</span>}
      </span>
      {number != null && size !== 'sm' && <span className="ap-nb__no">No.{typeof number === 'number' ? pad2(number) : number}</span>}
    </span>
  );
}

/* ───────────── SubjectWheel ───────────── */

export interface SubjectItem {
  id: string;
  /** Nome da matéria, grande. */
  title: string;
  /** Linha pequena acima ("Caderno 03 · 4 módulos"). */
  kicker?: React.ReactNode;
  /** À direita nas linhas não selecionadas ("62%"). */
  meta?: React.ReactNode;
  cover?: NotebookCoverProps;
}

/** id da linha "Novo plano de estudos". */
export const CREATE_ID = '__create__';

export interface SubjectWheelProps {
  items: SubjectItem[];
  /** id selecionado (a linha do meio). */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Enter, ou clique na linha do meio. */
  onOpen?: (id: string) => void;
  /** Rótulo da linha extra no fim; false esconde. Padrão "Novo plano de estudos". */
  createLabel?: string | false;
  onCreate?: () => void;
  /** Linhas visíveis (ímpar). Padrão 5. */
  visibleRows?: number;
  /** Nome acessível da lista. Padrão "Cadernos". */
  label?: string;
  /** Texto da tecla na linha selecionada. Padrão "Abrir". */
  openLabel?: string;
  className?: string;
}

/**
 * Lista de cadernos em roda: cada giro do scroll anda uma linha e a linha do meio é a selecionada —
 * ela vira tijolo com texto claro; as outras ficam na folha clara com uma divisória fina.
 * Setas, Page Up/Down, Home/End navegam; Enter abre; clicar traz a linha para o meio.
 */
export function SubjectWheel({
  items,
  value,
  defaultValue,
  onChange,
  onOpen,
  createLabel,
  onCreate,
  visibleRows = 5,
  label = 'Cadernos',
  openLabel = 'Abrir',
  className,
}: SubjectWheelProps) {
  const all: SubjectItem[] =
    createLabel === false ? items : [...items, { id: CREATE_ID, title: createLabel ?? 'Novo plano de estudos', kicker: 'Criar com o tutor' }];
  const [inner, setInner] = React.useState<string | undefined>(defaultValue ?? all[0]?.id);
  const current = value ?? inner;
  const index = Math.max(0, all.findIndex((it) => it.id === current));
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = React.useState(128);
  const uid = React.useId().replace(/:/g, '');

  React.useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const v = parseFloat(getComputedStyle(el).getPropertyValue('--wheel-row'));
    if (v > 0) setRowH(v);
  }, []);

  const select = (i: number) => {
    const c = Math.max(0, Math.min(all.length - 1, i));
    const id = all[c].id;
    if (value == null) setInner(id);
    if (id !== current) onChange?.(id);
  };
  const open = (i: number) => {
    const it = all[i];
    if (!it) return;
    if (it.id === CREATE_ID) onCreate?.();
    else onOpen?.(it.id);
  };

  // A roda do mouse precisa de um listener não passivo para impedir a rolagem da página.
  const live = React.useRef({ index, select });
  live.current = { index, select };
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let acc = 0;
    let lockUntil = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now < lockUntil) return;
      acc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(acc) >= 40) {
        live.current.select(live.current.index + (acc > 0 ? 1 : -1));
        acc = 0;
        lockUntil = now + 170;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown') select(index + 1);
    else if (k === 'ArrowUp' || k === 'PageUp') select(index - 1);
    else if (k === 'Home') select(0);
    else if (k === 'End') select(all.length - 1);
    else if (k === 'Enter' || k === ' ') open(index);
    else return;
    e.preventDefault();
  };

  const viewH = rowH * visibleRows;
  const padRows = Math.floor(visibleRows / 2);
  const offset = viewH / 2 - rowH / 2 - (index + padRows) * rowH;
  // Linhas vazias pautadas nas pontas: a folha continua como papel de caderno.
  const blank = (key: string) => <div key={key} className="ap-wheel__row ap-wheel__row--blank" aria-hidden="true" />;

  return (
    <div
      ref={rootRef}
      className={cx('ap-wheel', className)}
      style={{ height: viewH }}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${uid}-${index}`}
      onKeyDown={onKeyDown}
    >
      <div className="ap-wheel__track" style={{ transform: `translateY(${offset}px)` }}>
        {Array.from({ length: padRows }, (_, i) => blank('top' + i))}
        {all.map((it, i) => {
          const sel = i === index;
          const isNew = it.id === CREATE_ID;
          return (
            <div
              key={it.id}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={sel}
              className={cx('ap-wheel__row', sel && 'is-selected', isNew && 'ap-wheel__row--new')}
              onClick={() => (sel ? open(i) : select(i))}
            >
              {isNew ? (
                <span className="ap-wheel__plus" aria-hidden="true">
                  <Icon name="plus" size={30} strokeWidth={2.5} />
                </span>
              ) : (
                <NotebookCover size="md" {...it.cover} className={cx('ap-wheel__cover', it.cover?.className)} />
              )}
              <span className="ap-wheel__text">
                {it.kicker != null && <span className="ap-wheel__kicker overline">{it.kicker}</span>}
                <span className="ap-wheel__title display-md">{it.title}</span>
              </span>
              <span className="ap-wheel__side">
                {sel ? (
                  <span className="ap-wheel__open button" aria-hidden="true">
                    <span className="ap-wheel__open-label">{isNew ? 'Criar' : openLabel}</span>
                    <Icon name="arrow-right" size={16} strokeWidth={2.75} />
                  </span>
                ) : it.meta != null ? (
                  <span className="ap-wheel__meta data-lg">{it.meta}</span>
                ) : null}
              </span>
            </div>
          );
        })}
        {Array.from({ length: padRows }, (_, i) => blank('end' + i))}
      </div>
    </div>
  );
}

/* ───────────── ProgressTrack ───────────── */

export type TrackKind = 'module' | 'quiz' | 'final';
export type TrackState = 'done' | 'current' | 'todo' | 'locked';

export interface TrackStep {
  id: string;
  /** module (livro), quiz (prancheta) ou final (bandeira). */
  kind: TrackKind;
  /** Nome curto ("Módulo 03 · Derivadas"). Aparece no hover e, na atual, fixo embaixo. */
  label: string;
  /** done, current, todo ou locked (módulo ainda não gerado). */
  state: TrackState;
}

const KIND_ICON: Record<TrackKind, IconName> = { module: 'book', quiz: 'checklist', final: 'flag' };
const STATE_TEXT: Record<TrackState, string> = { done: 'feito', current: 'atual', todo: 'a fazer', locked: 'ainda não gerado' };

export interface ProgressTrackProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: TrackStep[];
  /** Deixa pular para uma etapa (não vale para locked). */
  onStepClick?: (id: string) => void;
  /** Nome acessível. Padrão "Trilha do curso". */
  label?: string;
}

/**
 * Trilha do curso: uma estação por etapa — módulo (livro, círculo), questionário (prancheta, quadrado arredondado)
 * e teste final (bandeira, quadrado maior). Feita = cheia; atual = âmbar com o nome embaixo; a fazer = contorno;
 * ainda não gerada = contorno tracejado. Módulo e seu questionário ficam colados.
 */
export function ProgressTrack({ steps, onStepClick, label = 'Trilha do curso', className, ...rest }: ProgressTrackProps) {
  return (
    <ol className={cx('ap-track', className)} aria-label={label} {...rest}>
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const near = !!prev && prev.kind === 'module' && s.kind === 'quiz';
        const linkDone = !!prev && prev.state === 'done' && (s.state === 'done' || s.state === 'current');
        const clickable = !!onStepClick && s.state !== 'locked';
        const nodeProps = {
          className: 'ap-track__node',
          'aria-current': s.state === 'current' ? ('step' as const) : undefined,
        };
        const text = `${s.label} — ${STATE_TEXT[s.state]}`;
        const icon = <Icon name={KIND_ICON[s.kind]} size={s.kind === 'final' ? 18 : 16} strokeWidth={2.5} />;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && <li className={cx('ap-track__link', near ? 'ap-track__link--near' : 'ap-track__link--far', linkDone && 'is-done')} aria-hidden="true" />}
            <li className={cx('ap-track__step', `ap-track__step--${s.state}`, `ap-track__step--${s.kind}`)}>
              {clickable ? (
                <button type="button" {...nodeProps} aria-label={text} onClick={() => onStepClick!(s.id)}>
                  {icon}
                </button>
              ) : (
                <span {...nodeProps} role="img" aria-label={text}>
                  {icon}
                </span>
              )}
              <span className={cx('ap-track__tip', 'overline', s.state === 'current' && 'is-pinned')} aria-hidden="true">
                {s.label}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/* ───────────── CourseBar ───────────── */

export interface CourseBarProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Nome do curso. */
  title: React.ReactNode;
  /** Linha pequena acima do nome ("Caderno 03 · Módulo 03"). */
  kicker?: React.ReactNode;
  /** Capa pequena ao lado do nome. */
  cover?: NotebookCoverProps;
  steps: TrackStep[];
  onStepClick?: (id: string) => void;
  /** Volta para a lista de cadernos. */
  onBack?: () => void;
  /** Padrão "Matérias". */
  backLabel?: string;
  /** Bloco "Próximo" à direita. */
  next?: { label: React.ReactNode; kicker?: React.ReactNode; onClick?: () => void };
}

/** A aba tijolo no topo do curso: voltar às matérias, capa e nome do curso, a trilha de progresso e o próximo passo. */
export function CourseBar({ title, kicker, cover, steps, onStepClick, onBack, backLabel = 'Matérias', next, className, ...rest }: CourseBarProps) {
  return (
    <header className={cx('ap-cbar', className)} {...rest}>
      {onBack && (
        <button type="button" className="ap-cbar__back button" onClick={onBack}>
          <Icon name="list" size={18} strokeWidth={2.5} />
          {backLabel}
        </button>
      )}
      <div className="ap-cbar__course">
        {cover && <NotebookCover {...cover} size="sm" />}
        <div className="ap-cbar__titles">
          {kicker != null && <span className="ap-cbar__kicker overline">{kicker}</span>}
          <span className="ap-cbar__title display-sm">{title}</span>
        </div>
      </div>
      <ProgressTrack className="ap-cbar__track" steps={steps} onStepClick={onStepClick} />
      {next && (
        <button type="button" className="ap-cbar__next" onClick={next.onClick}>
          <span className="ap-cbar__next-kicker overline">{next.kicker ?? 'Próximo'}</span>
          <span className="ap-cbar__next-label body-strong">{next.label}</span>
          <Icon name="arrow-right" size={20} strokeWidth={2.5} />
        </button>
      )}
    </header>
  );
}

/* ───────────── ModuleCard ───────────── */

export type ModuleState = 'done' | 'current' | 'next' | 'locked';

export interface ModuleReading {
  /** Rótulo de painel, até duas linhas ("Questões restantes"). */
  label: React.ReactNode;
  value: React.ReactNode;
  /** Unidade depois do valor ("min", "/10"). */
  unit?: React.ReactNode;
}

export interface ModuleCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /**
   * done = concluído (holográfico, carimbo 完) · current = em curso (âmbar, adesivo) ·
   * next = o próximo, já liberado (musgo) · locked = desativado: ainda não começou e não é o próximo (tracejado).
   */
  state: ModuleState;
  /** Número do módulo: 3 vira "Módulo 03" e "#MOD-03". */
  number: number;
  /** Nome do módulo ("Derivadas"). */
  title: React.ReactNode;
  /** Nome do curso, depois do número ("Cálculo I"). */
  course?: React.ReactNode;
  /** 0 a 1 — o número grande. done mostra sempre 100%; locked mostra o mostrador apagado (--%). */
  progress?: number;
  /** Até duas leituras na ficha da direita: { label: "Questões restantes", value: "12" }. */
  readings?: ModuleReading[];
  /** Texto da ação no rodapé. Padrão: Rever · Continuar · Começar; em locked, "Abre depois do Módulo NN". */
  action?: React.ReactNode;
  /** Abre o módulo; o card inteiro fica clicável (nunca em locked). */
  onOpen?: () => void;
  /** Elemento HTML. Padrão article; use li dentro de uma lista. */
  as?: 'article' | 'li' | 'div';
}

const MODULE_ACTION: Record<Exclude<ModuleState, 'locked'>, string> = { done: 'Rever', current: 'Continuar', next: 'Começar' };
const MODULE_STATE_TEXT: Record<ModuleState, string> = { done: 'Concluído', current: 'Em curso', next: 'Próximo', locked: 'Desativado' };

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Card de módulo do curso, em quatro estados. Concluído: holográfico (faixas de rosa, pêssego, manteiga, menta,
 * céu e lilás que brilham seguindo o ponteiro) com o carimbo 完. Em curso: âmbar com o adesivo "Em curso".
 * Próximo: musgo, já liberado. Desativado: tracejado, com o mostrador apagado e a regra de quando abre.
 * O número grande é a porcentagem concluída do módulo.
 */
export function ModuleCard({
  state,
  number,
  title,
  course,
  progress,
  readings,
  action,
  onOpen,
  as = 'article',
  className,
  onPointerMove,
  onPointerLeave,
  ...rest
}: ModuleCardProps) {
  const El = as as any;
  const nn = pad2(number);
  const locked = state === 'locked';
  const titleId = React.useId();
  const pct = state === 'done' ? 100 : Math.round(Math.max(0, Math.min(1, progress ?? 0)) * 100);
  const label = action ?? (locked ? `Abre depois do Módulo ${pad2(Math.max(1, number - 1))}` : MODULE_ACTION[state]);
  const clickable = !!onOpen && !locked;

  // O brilho holográfico acompanha o ponteiro (só no concluído; nunca no toque nem com movimento reduzido).
  const move = (e: React.PointerEvent<HTMLElement>) => {
    onPointerMove?.(e);
    if (state !== 'done' || e.pointerType === 'touch' || prefersReducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--ap-holo-x', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
    el.style.setProperty('--ap-holo-y', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
  };
  const leave = (e: React.PointerEvent<HTMLElement>) => {
    onPointerLeave?.(e);
    e.currentTarget.style.removeProperty('--ap-holo-x');
    e.currentTarget.style.removeProperty('--ap-holo-y');
  };

  const arrow = <Icon name="arrow-up-right" size={40} strokeWidth={4} />;

  return (
    <El
      className={cx('ap-module', `ap-module--${state}`, clickable && 'is-clickable', className)}
      onPointerMove={move}
      onPointerLeave={leave}
      {...rest}
    >
      {state === 'current' && (
        <Sticker className="ap-module__mark ap-module__sticker" pin="top-right" rotate={6} dot>
          {MODULE_STATE_TEXT.current}
        </Sticker>
      )}
      {state === 'done' && (
        <span className="ap-module__mark ap-module__stamp" aria-hidden="true" lang="ja">完</span>
      )}
      {state === 'next' && (
        <Tag className="ap-module__mark ap-module__tag" tone="cream" size="sm" icon="arrow-right">
          {MODULE_STATE_TEXT.next}
        </Tag>
      )}
      {locked && <Icon className="ap-module__mark ap-module__lock" name="lock" size={22} strokeWidth={2.5} />}

      <div className="ap-module__top overline">
        <span>Módulo {nn}</span>
        {course != null && <span className="ap-module__course">{course}</span>}
        {(state === 'done' || locked) && <span className="ap-visually-hidden">{MODULE_STATE_TEXT[state]}</span>}
      </div>
      <h3 id={titleId} className="ap-module__title display-md">{title}</h3>

      <div className="ap-module__spec">
        <SpecBox className="ap-module__progress" title="Progresso">
          {locked ? (
            <span className="ap-module__off data-xl" role="img" aria-label="Sem progresso: módulo desativado">
              --<span className="ap-module__off-unit">%</span>
            </span>
          ) : (
            <Stat variant="figure" value={pct} suffix="%" />
          )}
        </SpecBox>
        {readings && readings.length > 0 && (
          <SpecBox className="ap-module__readings">
            {readings.slice(0, 2).map((r, i) => (
              <Readout key={i} label={r.label} value={r.value} unit={r.unit} />
            ))}
          </SpecBox>
        )}
      </div>

      <div className="ap-module__foot">
        <span className="ap-module__code display-sm">#MOD-{nn}</span>
        {locked ? (
          <span className="ap-module__hint overline">{label}</span>
        ) : clickable ? (
          <button type="button" className="ap-module__open" onClick={onOpen} aria-describedby={titleId}>
            <span className="overline">{label}</span>
            {arrow}
          </button>
        ) : (
          <span className="ap-module__open">
            <span className="overline">{label}</span>
            {arrow}
          </span>
        )}
      </div>
    </El>
  );
}
