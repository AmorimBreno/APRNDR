import * as React from 'react';
import { cx, pad2 } from './util';
import { Icon, type IconName } from './icons';
import { Button, Ornament, type OrnamentGlyph, Tag } from './base';
import { type FileItem, FileRow } from './forms';
import { Readout, SpecBox } from './data';

/* ───────────── LessonBlock ───────────── */

/** O ícone de cada tipo de bloco, usado quando o rótulo é um destes textos. */
export const BLOCK_ICONS: Record<string, IconName> = {
  'Explicação': 'bulb',
  'Exemplo': 'code',
  'Pergunta': 'help',
  'Resposta': 'message',
  'Reexplicação': 'refresh',
  'Revisão': 'notebook',
};

export interface LessonBlockProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Número do bloco, mostrado na margem ("03"). */
  index?: number;
  /** Tipo do bloco: "Explicação", "Exemplo", "Pergunta", "Resposta", "Reexplicação", "Revisão". Vira uma tag aço com ícone. */
  label?: React.ReactNode;
  /** Ícone da tag do rótulo. Padrão: o de BLOCK_ICONS para o texto do rótulo. */
  icon?: IconName;
  /** O tutor ainda está escrevendo: cursor âmbar piscando no fim do texto. */
  writing?: boolean;
  /** Ações sob o bloco (Button ghost sm: Reexplicar, Outro exemplo). */
  actions?: React.ReactNode;
}

/**
 * Um bloco da aula ao vivo. O tutor escreve a aula numa coluna única, bloco a bloco, como uma página de caderno:
 * número na margem, rótulo do tipo e o texto em `lesson-body` (19/32). Perguntas entram como QuizQuestion/EssayAnswer dentro do bloco.
 */
export function LessonBlock({ index, label, icon, writing, actions, className, children, ...rest }: LessonBlockProps) {
  const tagIcon = icon ?? (typeof label === 'string' ? BLOCK_ICONS[label] : undefined);
  return (
    <section className={cx('ap-block', writing && 'ap-block--writing', className)} aria-busy={writing || undefined} {...rest}>
      {index != null && (
        <span className="ap-block__num data" aria-hidden="true">
          {pad2(index)}
        </span>
      )}
      {(label != null || writing) && (
        <header className="ap-block__head">
          {label != null && (
            <Tag className="ap-block__label" tone="steel" size="sm" icon={tagIcon}>
              {label}
            </Tag>
          )}
          {writing && (
            <span className="ap-block__writing overline" role="status">
              Escrevendo
              <span className="ap-cursor" aria-hidden="true" />
            </span>
          )}
        </header>
      )}
      <div className="ap-block__body ap-prose lesson-body">{children}</div>
      {actions != null && !writing && <div className="ap-block__actions">{actions}</div>}
    </section>
  );
}

/* ───────────── StudentNote ───────────── */

export interface StudentNoteProps extends React.HTMLAttributes<HTMLElement> {
  /** Rótulo. Padrão "Você perguntou"; use "Sua resposta", "Você pediu". */
  label?: React.ReactNode;
  /** Arquivos que você anexou nesse momento da aula. */
  attachments?: FileItem[];
}

/** A sua intervenção na aula — uma pergunta, uma resposta, um "não entendi" — como um bilhete de papel creme colado à direita da página. */
export function StudentNote({ label = 'Você perguntou', attachments, className, children, ...rest }: StudentNoteProps) {
  return (
    <aside className={cx('ap-note', className)} {...rest}>
      <span className="ap-note__label overline">{label}</span>
      {attachments && attachments.length > 0 && (
        <ul className="ap-note__files">
          {attachments.map((f, i) => (
            <FileRow key={f.id ?? f.name + i} file={f} compact />
          ))}
        </ul>
      )}
      <div className="ap-note__body ap-prose body-lg">{children}</div>
    </aside>
  );
}

/* ───────────── SuggestionChips ───────────── */

export type Suggestion = string | { label: string; value?: string; icon?: IconName };

export interface SuggestionChipsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  items: Suggestion[];
  onSelect?: (value: string) => void;
  /** Nome acessível do grupo. Padrão "Sugestões". */
  label?: string;
}

/** Atalhos em pílula para o próximo passo da aula: continuar, outro exemplo, não entendi, me testar. */
export function SuggestionChips({ items, onSelect, label = 'Sugestões', className, ...rest }: SuggestionChipsProps) {
  return (
    <div className={cx('ap-chips', className)} role="group" aria-label={label} {...rest}>
      {items.map((it) => {
        const o = typeof it === 'string' ? { label: it } : it;
        return (
          <button key={o.label} type="button" className="ap-chip body" onClick={() => onSelect?.(o.value ?? o.label)}>
            {o.icon && <Icon name={o.icon} size={16} strokeWidth={2.25} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── AskBar ───────────── */

export interface AskBarProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Enter envia; Shift+Enter quebra a linha. */
  onSend?: (value: string) => void;
  placeholder?: string;
  /** Enquanto o tutor escreve: troca Enviar por Parar. */
  generating?: boolean;
  onStop?: () => void;
  /** Mostra o clipe para anexar PDF ou código no meio da aula. */
  onAttach?: () => void;
  attachments?: FileItem[];
  onRemoveAttachment?: (file: FileItem, index: number) => void;
  /** Atalhos acima do campo ("Continuar", "Outro exemplo"…). */
  suggestions?: Suggestion[];
  onSuggestion?: (value: string) => void;
  /** Mostra "Encerrar aula" (gera o resumo). */
  onEnd?: () => void;
  endLabel?: string;
  /** Linha de ajuda abaixo. false esconde. */
  hint?: React.ReactNode | false;
  disabled?: boolean;
  /** Linhas máximas antes de rolar. Padrão 6. */
  maxRows?: number;
  /** Nome acessível do campo. */
  label?: string;
  className?: string;
}

/**
 * A barra fixa no pé da aula: atalhos, campo para responder ou perguntar e a tecla âmbar de enviar.
 * Não é um chat: o que você manda vira uma nota na página e o tutor continua a aula a partir dela.
 */
export function AskBar({
  value,
  defaultValue,
  onChange,
  onSend,
  placeholder = 'Responda, pergunte ou peça para continuar…',
  generating,
  onStop,
  onAttach,
  attachments,
  onRemoveAttachment,
  suggestions,
  onSuggestion,
  onEnd,
  endLabel = 'Encerrar aula',
  hint,
  disabled,
  maxRows = 6,
  label = 'Responder ou perguntar ao tutor',
  className,
}: AskBarProps) {
  const [inner, setInner] = React.useState(defaultValue ?? '');
  const text = value ?? inner;
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 28;
    el.style.height = Math.min(el.scrollHeight, lh * maxRows) + 'px';
  }, [text, maxRows]);

  const set = (v: string) => {
    if (value == null) setInner(v);
    onChange?.(v);
  };
  const canSend = !disabled && !generating && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend?.(text);
    if (value == null) setInner('');
  };

  return (
    <div className={cx('ap-ask', className)}>
      {suggestions && suggestions.length > 0 && <SuggestionChips className="ap-ask__chips" items={suggestions} onSelect={onSuggestion} />}
      <div className={cx('ap-ask__box', disabled && 'ap-ask__box--disabled')}>
        {attachments && attachments.length > 0 && (
          <ul className="ap-ask__files" aria-label="Anexos">
            {attachments.map((f, i) => (
              <FileRow key={f.id ?? f.name + i} file={f} compact onRemove={onRemoveAttachment ? () => onRemoveAttachment(f, i) : undefined} />
            ))}
          </ul>
        )}
        <div className="ap-ask__row">
          {onAttach && <Button variant="ghost" iconOnly icon="paperclip" aria-label="Anexar arquivo" onClick={onAttach} disabled={disabled} />}
          <textarea
            ref={ref}
            className="ap-ask__input body-lg"
            rows={1}
            value={text}
            placeholder={placeholder}
            aria-label={label}
            disabled={disabled}
            onChange={(e) => set(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          {generating ? (
            <Button variant="secondary" icon="stop" onClick={onStop}>Parar</Button>
          ) : (
            <Button variant="primary" iconOnly icon="arrow-up" aria-label="Enviar" onClick={send} disabled={!canSend} />
          )}
        </div>
      </div>
      {(hint !== false || onEnd) && (
        <div className="ap-ask__foot">
          {hint !== false && <p className="ap-ask__hint overline">{hint ?? 'Enter envia · Shift + Enter quebra a linha'}</p>}
          {onEnd && (
            <Button variant="ghost" size="sm" icon="notebook" className="ap-ask__end" onClick={onEnd} disabled={disabled || generating}>
              {endLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── SelectionMenu ───────────── */

export interface SelectionAction {
  label: string;
  icon?: IconName;
  onClick?: () => void;
}

export interface SelectionMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  actions: SelectionAction[];
  /** Nome acessível. Padrão "Ações do trecho selecionado". */
  label?: string;
}

/** Barra flutuante que aparece sobre um trecho selecionado: reexplicar, pedir exemplo, anotar no caderno. Quem usa posiciona. */
export function SelectionMenu({ actions, label = 'Ações do trecho selecionado', className, ...rest }: SelectionMenuProps) {
  return (
    <div className={cx('ap-selmenu', className)} role="toolbar" aria-label={label} {...rest}>
      {actions.map((a) => (
        <button key={a.label} type="button" className="ap-selmenu__btn overline" onClick={a.onClick}>
          {a.icon && <Icon name={a.icon} size={14} strokeWidth={2.5} />}
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── SummaryCard ───────────── */

export interface SummaryCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Nome do arquivo de resumo ("Aula 03 — Derivadas"). */
  title: React.ReactNode;
  /** Linha pequena acima. Padrão "Resumo gerado". */
  kicker?: React.ReactNode;
  /** Leituras curtas (blocos, questões, score). */
  stats?: { label: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode }[];
  onOpen?: () => void;
  onDownload?: () => void;
  openLabel?: string;
  downloadLabel?: string;
  /** Ideograma do bloco. Padrão 復習 (revisão). */
  glyph?: OrnamentGlyph;
}

/** O arquivo de resumo gerado no fim da aula, para revisar depois: bloco musgo com ideograma, leituras e as ações abrir/baixar. */
export function SummaryCard({
  title,
  kicker = 'Resumo gerado',
  stats,
  onOpen,
  onDownload,
  openLabel = 'Abrir resumo',
  downloadLabel = 'Baixar .md',
  glyph = '復習',
  className,
  ...rest
}: SummaryCardProps) {
  return (
    <section className={cx('ap-summary', className)} {...rest}>
      <div className="ap-summary__art">
        <Ornament glyph={glyph} size="md" />
      </div>
      <div className="ap-summary__main">
        <span className="ap-summary__kicker overline">{kicker}</span>
        <h3 className="ap-summary__title display-sm">{title}</h3>
        {(onOpen || onDownload) && (
          <div className="ap-summary__actions">
            {onOpen && (
              <Button variant="primary" icon="file" onClick={onOpen}>
                {openLabel}
              </Button>
            )}
            {onDownload && (
              <Button variant="secondary" onClick={onDownload}>
                {downloadLabel}
              </Button>
            )}
          </div>
        )}
      </div>
      {stats && stats.length > 0 && (
        <SpecBox className="ap-summary__stats" title="Ficha da aula">
          {stats.map((st, i) => (
            <Readout key={i} label={st.label} value={st.value} unit={st.unit} />
          ))}
        </SpecBox>
      )}
    </section>
  );
}

/* ───────────── SectionRuler ───────────── */

export interface RulerItem {
  id: string;
  label: string;
}

export interface SectionRulerProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onSelect'> {
  items: RulerItem[];
  /** id do bloco em leitura. */
  current?: string;
  onSelect?: (id: string) => void;
  /** Nome acessível. Padrão "Blocos da aula". */
  label?: string;
}

/** Régua na margem da aula: um traço por bloco; o atual é mais longo e âmbar. Mostra onde você está e leva até o bloco. */
export function SectionRuler({ items, current, onSelect, label = 'Blocos da aula', className, ...rest }: SectionRulerProps) {
  const at = items.findIndex((it) => it.id === current);
  return (
    <nav className={cx('ap-ruler', className)} aria-label={label} {...rest}>
      <ol>
        {items.map((it, i) => {
          const state = i < at ? 'done' : i === at ? 'current' : 'todo';
          return (
            <li key={it.id}>
              <button
                type="button"
                className={cx('ap-ruler__tick', `ap-ruler__tick--${state}`)}
                aria-current={state === 'current' ? 'location' : undefined}
                onClick={() => onSelect?.(it.id)}
              >
                <span className="ap-ruler__label overline">
                  {pad2(i + 1)} · {it.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
