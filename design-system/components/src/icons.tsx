import * as React from 'react';
import { cx } from './util';

export type IconName =
  | 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-up-right' | 'send'
  | 'plus' | 'close' | 'check' | 'chevron-down' | 'chevron-right'
  | 'paperclip' | 'file' | 'code' | 'upload'
  | 'refresh' | 'copy' | 'stop'
  | 'book' | 'notebook' | 'bulb' | 'help' | 'alert' | 'clock' | 'chart'
  | 'list' | 'checklist' | 'flag' | 'lock' | 'message';

/**
 * Desenhos em grade de 24px, traço 2px, pontas quadradas e quinas vivas.
 * `fill: true` = forma cheia (sem traço).
 */
export const ICONS: Record<IconName, { d: string; fill?: boolean }> = {
  'arrow-right': { d: 'M4 12h15M13 6l6 6-6 6' },
  'arrow-left': { d: 'M20 12H5M11 6l-6 6 6 6' },
  'arrow-up': { d: 'M12 20V5M6 11l6-6 6 6' },
  'arrow-up-right': { d: 'M6.5 17.5L16 8M8 6.5h9.5V16' },
  send: { d: 'M4 4l17 8-17 8 3-8-3-8zM7 12h6' },
  plus: { d: 'M12 5v14M5 12h14' },
  close: { d: 'M6 6l12 12M18 6L6 18' },
  check: { d: 'M4.5 12.5l4.5 4.5L19.5 6.5' },
  'chevron-down': { d: 'M6 9l6 6 6-6' },
  'chevron-right': { d: 'M9 6l6 6-6 6' },
  paperclip: { d: 'M15.5 7v8.5a3.5 3.5 0 0 1-7 0V6a2.5 2.5 0 0 1 5 0v9a1 1 0 0 1-2 0V8' },
  file: { d: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6' },
  code: { d: 'M9 7l-5 5 5 5M15 7l5 5-5 5' },
  upload: { d: 'M12 15V4M7 9l5-5 5 5M4 15v5h16v-5' },
  refresh: { d: 'M20 12a8 8 0 1 1-8-8c2.2 0 4.3.9 5.8 2.4L20 8.5M20 3.5v5h-5' },
  copy: { d: 'M9 9h11v11H9zM15 9V4H4v11h5' },
  stop: { d: 'M6 6h12v12H6z', fill: true },
  book: { d: 'M12 6.5C10 5 7 4.5 3.5 4.5v14c3.5 0 6.5.5 8.5 2 2-1.5 5-2 8.5-2v-14C17 4.5 14 5 12 6.5zM12 6.5v14' },
  notebook: { d: 'M7 3h12v18H7zM4 7h5M4 12h5M4 17h5M11 8h5' },
  bulb: { d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2V16h5v-.2c0-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z' },
  help: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.1.9-1.1 1.6V14M12 17.5v.01' },
  alert: { d: 'M12 3.5L21.5 20h-19zM12 10v4M12 17v.01' },
  clock: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2' },
  chart: { d: 'M5 20v-6M10 20V9M15 20v-8M20 20V5' },
  list: { d: 'M9 6h11M9 12h11M9 18h11M4.5 6v.01M4.5 12v.01M4.5 18v.01' },
  checklist: { d: 'M9 3.5h6v3H9zM9 5H5v16h14V5h-4M8.5 13.5l2.5 2.5 4.5-5' },
  flag: { d: 'M5 21V3.5M5 4h12.5L15 8.5l2.5 4.5H5' },
  lock: { d: 'M5.5 11h13v9.5h-13zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11M12 14.5v2.5' },
  message: { d: 'M4 4.5h16V16H9.5L4 20.5zM8 8.5h8M8 12h5' },
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  /** Nome do desenho (veja ICON_NAMES). */
  name: IconName;
  /** Lado em px. Padrão 20. */
  size?: number;
  /** Espessura do traço na grade de 24. Padrão 2; use 2.5–3.5 em ícones grandes decorativos. */
  strokeWidth?: number;
  /** Texto para leitor de tela. Sem ele, o ícone é decorativo (aria-hidden). */
  label?: string;
}

/** Ícone de traço único que herda a cor do texto (currentColor). */
export function Icon({ name, size = 20, strokeWidth = 2, label, className, ...rest }: IconProps) {
  const def = ICONS[name];
  if (!def) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={def.fill ? 'currentColor' : 'none'}
      stroke={def.fill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={cx('ap-icon', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={def.d} />
    </svg>
  );
}
