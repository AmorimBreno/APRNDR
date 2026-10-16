import * as React from 'react';
import { cx } from './util';
import { Icon, type IconName } from './icons';

interface FieldBase {
  /** Rótulo em caixa-alta acima do campo. */
  label?: React.ReactNode;
  /** Texto de ajuda abaixo do campo. */
  hint?: React.ReactNode;
  /** Mensagem de erro; troca a ajuda e pinta a borda. */
  error?: React.ReactNode;
}

function useFieldIds(id: string | undefined, hint: unknown, error: unknown) {
  const auto = React.useId();
  const inputId = id ?? auto;
  const msgId = inputId + '-msg';
  return { inputId, msgId, describedBy: error || hint ? msgId : undefined };
}

function FieldMessage({ id, hint, error }: { id: string; hint?: React.ReactNode; error?: React.ReactNode }) {
  if (error) {
    return (
      <p id={id} className="ap-field__error body-sm">
        <Icon name="alert" size={14} strokeWidth={2.5} />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) return <p id={id} className="ap-field__hint body-sm">{hint}</p>;
  return null;
}

/* ───────────── TextField ───────────── */

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, FieldBase {
  /** Ícone dentro do campo, à esquerda. */
  icon?: IconName;
  /** md 40px (padrão) · lg 48px. */
  size?: 'md' | 'lg';
}

/** Campo de texto de uma linha com rótulo de painel, ajuda e erro. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, icon, size = 'md', id, className, ...rest },
  ref,
) {
  const { inputId, msgId, describedBy } = useFieldIds(id, hint, error);
  return (
    <div className={cx('ap-field', error && 'ap-field--error', className)}>
      {label != null && <label className="ap-field__label overline" htmlFor={inputId}>{label}</label>}
      <div className={cx('ap-input', size === 'lg' && 'ap-input--lg')}>
        {icon && <Icon name={icon} size={18} />}
        <input ref={ref} id={inputId} className="body" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      </div>
      <FieldMessage id={msgId} hint={hint} error={error} />
    </div>
  );
});

/* ───────────── TextArea ───────────── */

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FieldBase {
  /** Mostra o contador "caracteres/máximo" quando há maxLength. Padrão true. */
  counter?: boolean;
}

/** Campo de várias linhas para respostas e anotações, com contador de caracteres. */
export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, counter = true, id, className, rows = 4, maxLength, value, defaultValue, onChange, ...rest },
  ref,
) {
  const { inputId, msgId, describedBy } = useFieldIds(id, hint, error);
  const [inner, setInner] = React.useState(String(defaultValue ?? ''));
  const length = value != null ? String(value).length : inner.length;
  return (
    <div className={cx('ap-field', error && 'ap-field--error', className)}>
      {label != null && <label className="ap-field__label overline" htmlFor={inputId}>{label}</label>}
      <div className="ap-input ap-input--area">
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          className="body"
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            if (value == null) setInner(e.target.value);
            onChange?.(e);
          }}
          {...rest}
        />
        {counter && maxLength != null && (
          <span className="ap-input__count data" aria-live="polite">
            {length}/{maxLength}
          </span>
        )}
      </div>
      <FieldMessage id={msgId} hint={hint} error={error} />
    </div>
  );
});

/* ───────────── Select ───────────── */

export type SelectOption = string | { value: string; label: string; disabled?: boolean };

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>, FieldBase {
  options: SelectOption[];
  /** sm 32px (barras de ferramenta) · md 40px (padrão). */
  size?: 'sm' | 'md';
}

/** Lista de escolha nativa com a cara dos campos do sistema (ex.: escolher o modelo de IA). */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, size = 'md', id, className, ...rest },
  ref,
) {
  const { inputId, msgId, describedBy } = useFieldIds(id, hint, error);
  return (
    <div className={cx('ap-field', error && 'ap-field--error', className)}>
      {label != null && <label className="ap-field__label overline" htmlFor={inputId}>{label}</label>}
      <div className={cx('ap-input', 'ap-select', size === 'sm' && 'ap-input--sm')}>
        <select ref={ref} id={inputId} className={size === 'sm' ? 'data' : 'body'} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest}>
          {options.map((o) =>
            typeof o === 'string' ? (
              <option key={o} value={o}>{o}</option>
            ) : (
              <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
            ),
          )}
        </select>
        <Icon name="chevron-down" size={size === 'sm' ? 14 : 18} className="ap-select__chevron" />
      </div>
      <FieldMessage id={msgId} hint={hint} error={error} />
    </div>
  );
});

/* ───────────── Checkbox ───────────── */

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: React.ReactNode;
  /** Linha de apoio sob o rótulo. */
  description?: React.ReactNode;
}

/** Caixa de marcação quadrada; marcada vira âmbar com o visto escuro. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, ...rest },
  ref,
) {
  return (
    <label className={cx('ap-check', className)}>
      <input ref={ref} type="checkbox" className="ap-check__input" {...rest} />
      <span className="ap-check__box" aria-hidden="true">
        <Icon name="check" size={14} strokeWidth={3.25} />
      </span>
      <span className="ap-check__text">
        <span className="ap-check__label body">{label}</span>
        {description != null && <span className="ap-check__desc body-sm">{description}</span>}
      </span>
    </label>
  );
});

/* ───────────── RadioGroup ───────────── */

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps extends Omit<React.FieldsetHTMLAttributes<HTMLFieldSetElement>, 'onChange'> {
  /** Pergunta do grupo, em caixa-alta. */
  legend: React.ReactNode;
  /** name compartilhado pelos inputs. Padrão: gerado. */
  name?: string;
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** vertical (padrão) ou horizontal. */
  orientation?: 'vertical' | 'horizontal';
}

/** Grupo de opções exclusivas com legenda: nível, objetivo, "teórico ou aplicado". */
export function RadioGroup({ legend, name, options, value, defaultValue, onChange, orientation = 'vertical', className, ...rest }: RadioGroupProps) {
  const auto = React.useId();
  const groupName = name ?? auto;
  return (
    <fieldset className={cx('ap-radios', orientation === 'horizontal' && 'ap-radios--row', className)} {...rest}>
      <legend className="ap-field__label overline">{legend}</legend>
      <div className="ap-radios__list">
        {options.map((o) => (
          <label key={o.value} className="ap-check ap-check--radio">
            <input
              type="radio"
              className="ap-check__input"
              name={groupName}
              value={o.value}
              disabled={o.disabled}
              checked={value != null ? value === o.value : undefined}
              defaultChecked={value == null && defaultValue != null ? defaultValue === o.value : undefined}
              onChange={() => onChange?.(o.value)}
            />
            <span className="ap-check__box" aria-hidden="true" />
            <span className="ap-check__text">
              <span className="ap-check__label body">{o.label}</span>
              {o.description != null && <span className="ap-check__desc body-sm">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────────── Switch ───────────── */

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/** Chave liga/desliga em pílula, no desenho de seletor ○●. Efeito imediato, sem botão salvar. */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, ...rest },
  ref,
) {
  return (
    <label className={cx('ap-switch', className)}>
      <input ref={ref} type="checkbox" role="switch" className="ap-switch__input" {...rest} />
      <span className="ap-switch__track" aria-hidden="true">
        <span className="ap-switch__knob" />
      </span>
      <span className="ap-check__text">
        <span className="ap-check__label body">{label}</span>
        {description != null && <span className="ap-check__desc body-sm">{description}</span>}
      </span>
    </label>
  );
});

/* ───────────── FileDrop ───────────── */

export interface FileItem {
  id?: string;
  name: string;
  /** Bytes (número) ou texto pronto ("2,4 MB"). */
  size?: number | string;
  /** pdf, code ou file. Padrão: deduzido da extensão. */
  kind?: 'pdf' | 'code' | 'file';
  /** 0–1 enquanto envia. */
  progress?: number;
  error?: string;
}

export function formatBytes(size: number | string | undefined): string {
  if (size == null) return '';
  if (typeof size === 'string') return size;
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
  return (size / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}

function fileKind(f: FileItem): 'pdf' | 'code' | 'file' {
  if (f.kind) return f.kind;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['py', 'ipynb', 'js', 'ts', 'tsx', 'java', 'c', 'cpp', 'sql', 'r'].includes(ext)) return 'code';
  return 'file';
}

function fileExt(name: string): string {
  const ext = name.split('.').pop() ?? '';
  return ext.length > 0 && ext.length <= 5 && ext !== name ? ext.toUpperCase() : 'ARQ';
}

/** Linha de arquivo anexado: ícone, nome, tipo, tamanho e botão de remover. Usada no FileDrop, na AskBar e nas notas do aluno. */
export function FileRow({ file, onRemove, compact }: { file: FileItem; onRemove?: () => void; compact?: boolean }) {
  const kind = fileKind(file);
  return (
    <li className={cx('ap-file', compact && 'ap-file--chip', file.error && 'ap-file--error')}>
      <Icon name={kind === 'code' ? 'code' : 'file'} size={compact ? 16 : 20} />
      <span className="ap-file__name body-strong">{file.name}</span>
      <span className="ap-file__meta data">
        {fileExt(file.name)}
        {file.size != null && !compact ? ' · ' + formatBytes(file.size) : ''}
      </span>
      {file.progress != null && file.progress < 1 && !compact && (
        <span className="ap-file__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(file.progress * 100)} aria-label={'Enviando ' + file.name}>
          <span style={{ width: Math.round(file.progress * 100) + '%' }} />
        </span>
      )}
      {file.error && !compact && <span className="ap-file__err body-sm">{file.error}</span>}
      {onRemove && (
        <button type="button" className="ap-file__remove" aria-label={'Remover ' + file.name} onClick={onRemove}>
          <Icon name="close" size={compact ? 14 : 16} strokeWidth={2.5} />
        </button>
      )}
    </li>
  );
}

export interface FileDropProps extends FieldBase {
  /** Chamada da área. Padrão "Arraste os arquivos aqui". */
  title?: React.ReactNode;
  /** Tipos aceitos, como no input file (".pdf,.py"). */
  accept?: string;
  multiple?: boolean;
  /** Arquivos já anexados (controlado por quem usa). */
  files?: FileItem[];
  onFiles?: (files: File[]) => void;
  onRemove?: (file: FileItem, index: number) => void;
  disabled?: boolean;
  className?: string;
}

/** Área de soltar arquivos (PDF das aulas, código .py) com a lista do que já foi anexado. */
export function FileDrop({ label, hint, error, title, accept, multiple = true, files, onFiles, onRemove, disabled, className }: FileDropProps) {
  const [over, setOver] = React.useState(false);
  const inputId = React.useId();
  const take = (list: FileList | null) => {
    if (!list || disabled) return;
    onFiles?.(Array.from(list));
  };
  return (
    <div className={cx('ap-field', error && 'ap-field--error', className)}>
      {label != null && <span className="ap-field__label overline">{label}</span>}
      <label
        htmlFor={inputId}
        className={cx('ap-drop', over && 'ap-drop--over', disabled && 'ap-drop--disabled')}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <input id={inputId} type="file" className="ap-visually-hidden" accept={accept} multiple={multiple} disabled={disabled} onChange={(e) => take(e.target.files)} />
        <span className="ap-drop__icon"><Icon name="upload" size={24} strokeWidth={2.25} /></span>
        <span className="ap-drop__title button">{title ?? 'Arraste os arquivos aqui'}</span>
        <span className="ap-drop__hint body-sm">{error ? null : hint ?? 'ou clique para escolher'}</span>
        {error && <span className="ap-field__error body-sm"><Icon name="alert" size={14} strokeWidth={2.5} />{error}</span>}
      </label>
      {files && files.length > 0 && (
        <ul className="ap-files" aria-label="Arquivos anexados">
          {files.map((f, i) => (
            <FileRow key={f.id ?? f.name + i} file={f} onRemove={onRemove ? () => onRemove(f, i) : undefined} />
          ))}
        </ul>
      )}
    </div>
  );
}
