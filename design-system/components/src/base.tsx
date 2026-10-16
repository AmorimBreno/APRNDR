import * as React from 'react';
import { cx, type Tone } from './util';
import { Icon, type IconName } from './icons';

/* ───────────── Marca ───────────── */

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Tamanho da letra em px. Padrão 28. */
  size?: number;
  /** O ponto de sinal em tijolo depois do nome. Padrão true. */
  dot?: boolean;
}

/** O nome APRNDR em Unbounded pesada, com o ponto de sinal em tijolo — a marca tipográfica do app. */
export function Wordmark({ size = 28, dot = true, className, style, ...rest }: WordmarkProps) {
  return (
    <span className={cx('ap-wordmark', className)} style={{ fontSize: size, ...style }} {...rest}>
      APRNDR
      {dot && <span className="ap-wordmark__dot" aria-hidden="true" />}
    </span>
  );
}

/** Ideogramas disponíveis na fonte de ornamento (recorte da Zen Antique). */
export type OrnamentGlyph =
  | '学' | '習' | '学習' | '知' | '問' | '答' | '考' | '解' | '読' | '書'
  | '復習' | '試験' | '完' | '独創' | '新' | '始' | '終'
  | '一' | '二' | '三' | '四' | '五' | '六' | '七' | '八' | '九' | '十';

/** Tradução padrão de cada ornamento, mostrada como legenda vertical. */
export const ORNAMENT_MEANINGS: Record<OrnamentGlyph, string> = {
  '学': 'APRENDER', '習': 'PRATICAR', '学習': 'APRENDIZADO', '知': 'CONHECER', '問': 'PERGUNTA',
  '答': 'RESPOSTA', '考': 'PENSAR', '解': 'RESOLVER', '読': 'LER', '書': 'ESCREVER',
  '復習': 'REVISÃO', '試験': 'AVALIAÇÃO', '完': 'CONCLUÍDO', '独創': 'ORIGINALIDADE', '新': 'NOVO',
  '始': 'COMEÇO', '終': 'FIM', '一': 'UM', '二': 'DOIS', '三': 'TRÊS', '四': 'QUATRO', '五': 'CINCO',
  '六': 'SEIS', '七': 'SETE', '八': 'OITO', '九': 'NOVE', '十': 'DEZ',
};

export interface OrnamentProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Um dos ideogramas da lista OrnamentGlyph. Dois caracteres empilham na vertical. */
  glyph: OrnamentGlyph;
  /** Legenda vertical em português. Padrão: a tradução do ideograma; false esconde. */
  caption?: string | false;
  /** 'xl' (160px, capas e telas vazias) ou 'md' (56px, cabeçalhos e cards). */
  size?: 'md' | 'xl';
}

/** Ideograma japonês decorativo em pé, com a tradução em letra de painel ao lado — o ornamento-pôster do sistema. */
export function Ornament({ glyph, caption, size = 'xl', className, ...rest }: OrnamentProps) {
  const text = caption === false ? null : caption ?? ORNAMENT_MEANINGS[glyph];
  return (
    <span className={cx('ap-orn', `ap-orn--${size}`, className)} aria-hidden="true" {...rest}>
      {text && <span className="ap-orn__caption overline">{text}</span>}
      <span className={cx('ap-orn__glyph', size === 'xl' ? 'glyph-xl' : 'glyph-md')} lang="ja">{glyph}</span>
    </span>
  );
}

export interface StickerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Cor do miolo. Padrão ink (quase preto, texto papel). holo = vinil holográfico, só para conclusão. */
  tone?: 'ink' | 'holo' | Tone;
  /** Linha pequena em letra de painel acima do texto ("Módulo 03"). */
  kicker?: React.ReactNode;
  /** Ponto de sinal antes do texto (tijolo; papel no miolo brick). */
  dot?: boolean;
  /** Giro em graus; positivo = sentido horário. Padrão 0. */
  rotate?: number;
  /** Gruda no canto do elemento pai (que precisa de position: relative), saindo um pouco para fora. */
  pin?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** rect (padrão) ou pill. */
  shape?: 'rect' | 'pill';
}

/** Adesivo de papel colado: borda branca grossa, miolo de cor chapada e letra grossa. Prende no canto de um card como um post-it. */
export function Sticker({ tone = 'ink', kicker, dot, rotate = 0, pin, shape = 'rect', className, style, children, ...rest }: StickerProps) {
  const vars = { ['--ap-sticker-rot' as string]: rotate + 'deg' } as React.CSSProperties;
  return (
    <span
      className={cx('ap-sticker', `ap-sticker--${tone}`, shape === 'pill' && 'ap-sticker--pill', pin && `ap-sticker--pin ap-sticker--${pin}`, className)}
      style={{ ...vars, ...style }}
      {...rest}
    >
      <span className="ap-sticker__face">
        {kicker != null && <span className="ap-sticker__kicker overline">{kicker}</span>}
        <span className="ap-sticker__text">
          {dot && <span className="ap-sticker__dot" aria-hidden="true" />}
          {children}
        </span>
      </span>
    </span>
  );
}

/* ───────────── Ações ───────────── */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = âmbar, no máximo um por tela; secondary = padrão; ghost = sem caixa; danger = tijolo. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** sm 32px · md 40px · lg 48px. */
  size?: 'sm' | 'md' | 'lg';
  /** Ícone antes do rótulo. */
  icon?: IconName;
  /** Ícone depois do rótulo (ex.: arrow-right em "Próxima"). */
  iconRight?: IconName;
  /** Botão só com ícone: quadrado; passe aria-label. */
  iconOnly?: boolean;
  /** Ocupa a largura toda. */
  block?: boolean;
}

/** Botão com cara de tecla de computador antigo: rótulo em caixa-alta larga e lábio inferior que afunda ao clicar. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, iconOnly, block, className, children, type = 'button', ...rest },
  ref,
) {
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18;
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ap-btn', 'button', `ap-btn--${variant}`, `ap-btn--${size}`, iconOnly && 'ap-btn--icon', block && 'ap-btn--block', className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={iconSize} strokeWidth={2.25} />}
      {!iconOnly && children != null && <span className="ap-btn__label">{children}</span>}
      {iconRight && <Icon name={iconRight} size={iconSize} strokeWidth={2.25} />}
    </button>
  );
});

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** neutral (papel, padrão), outline (só contorno, para o fundo escuro) ou uma das cores de marca em pastel. */
  tone?: 'neutral' | 'outline' | Tone;
  /** Ícone de traço antes do texto, na cor do texto: diz o que a tag é (Concluído = check, PDF = file…). */
  icon?: IconName;
  /** Ponto de sinal no lugar do ícone ("Ao vivo"). */
  dot?: boolean;
  /** md = 32px (padrão) · sm = 26px, para rótulos de bloco e linhas densas. */
  size?: 'sm' | 'md';
}

/** Etiqueta em pílula pastel: contorno de 2px, fundo claro, texto escuro e um ícone de traço que diz o que ela é. Uma a três palavras. */
export function Tag({ tone = 'neutral', dot, icon, size = 'md', className, children, ...rest }: TagProps) {
  return (
    <span className={cx('ap-tag', `ap-tag--${tone}`, `ap-tag--${size}`, !icon && !dot && 'ap-tag--plain', className)} {...rest}>
      {icon ? (
        <Icon name={icon} size={size === 'sm' ? 16 : 18} strokeWidth={2.25} />
      ) : dot ? (
        <span className="ap-tag__dot" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}

/* ───────────── Estrutura ───────────── */

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Cor do bloco. panel = neutro escuro; as outras são chapadas, com texto na cor on-*. */
  tone?: 'panel' | Tone;
  /** Número no canto superior esquerdo ("01"). */
  index?: React.ReactNode;
  /** Legenda no canto superior direito. */
  label?: React.ReactNode;
  /** Título em letra larga, caixa-alta. */
  title?: React.ReactNode;
  /** Linha de rodapé em letra de painel. */
  footer?: React.ReactNode;
  /** Elemento HTML. Padrão section. */
  as?: 'section' | 'article' | 'div' | 'li';
  /** Bloco-pôster maior (raio e respiro maiores). */
  poster?: boolean;
}

/** Bloco do bento: cor chapada, cantos grandes, índice e legenda nos cantos, como numa ficha técnica. */
export function Card({ tone = 'panel', index, label, title, footer, as = 'section', poster, className, children, ...rest }: CardProps) {
  const El = as as any;
  return (
    <El className={cx('ap-card', `ap-card--${tone}`, poster && 'ap-card--poster', className)} {...rest}>
      {(index != null || label != null) && (
        <div className="ap-card__top overline">
          <span className="ap-card__index">{index}</span>
          <span className="ap-card__label">{label}</span>
        </div>
      )}
      {title != null && <h3 className="ap-card__title display-sm">{title}</h3>}
      {children != null && <div className="ap-card__body">{children}</div>}
      {footer != null && <div className="ap-card__footer overline">{footer}</div>}
    </El>
  );
}

export interface CalloutAction {
  /** Volta em onAction ("ask", "rephrase", "example"). */
  id: string;
  label: string;
  icon?: IconName;
}

/** As três opções padrão do menu dos três pontos. */
export const CALLOUT_ACTIONS: CalloutAction[] = [
  { id: 'ask', label: 'Perguntar sobre isso', icon: 'help' },
  { id: 'rephrase', label: 'Explicar de outro jeito', icon: 'refresh' },
  { id: 'example', label: 'Me dá um exemplo', icon: 'bulb' },
];

export interface CalloutProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** moss = ideia central (padrão); amber = atenção; steel = exemplo; cream = resumo. */
  tone?: 'moss' | 'amber' | 'steel' | 'cream';
  /** Título na aba. Padrão conforme o tom ("Ideia central", "Atenção", "Exemplo", "Resumo"). */
  label?: React.ReactNode;
  /** Ícone do círculo preto. Padrão conforme o tom. */
  icon?: IconName;
  /** Texto em Fraunces itálica (a frase-chave). Padrão true no tom moss. */
  quote?: boolean;
  /** Opções do menu dos três pontos. Padrão CALLOUT_ACTIONS. */
  actions?: CalloutAction[];
  /** Recebe o id da opção escolhida. Sem ele, o callout não tem a aba dos três pontos. */
  onAction?: (id: string) => void;
}

const CALLOUT_DEFAULTS: Record<NonNullable<CalloutProps['tone']>, { label: string; icon: IconName }> = {
  moss: { label: 'Ideia central', icon: 'bulb' },
  amber: { label: 'Atenção', icon: 'alert' },
  steel: { label: 'Exemplo', icon: 'code' },
  cream: { label: 'Resumo', icon: 'notebook' },
};

/**
 * Caixa de destaque dentro das explicações, em formato de pasta: o bloco inteiro na cor do tipo, a aba do título com o
 * ícone num círculo preto e, à direita, a aba preta dos três pontos, que abre um menu (perguntar, reexplicar, exemplo).
 */
export function Callout({ tone = 'moss', label, icon, quote, actions = CALLOUT_ACTIONS, onAction, className, children, ...rest }: CalloutProps) {
  const d = CALLOUT_DEFAULTS[tone];
  const isQuote = quote ?? tone === 'moss';
  const title = label ?? d.label;
  const hasMenu = !!onAction && actions.length > 0;
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLElement>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') {
      setOpen(false);
      btnRef.current?.focus();
    } else {
      if (e.key === 'Tab') setOpen(false);
      return;
    }
    e.preventDefault();
  };
  const choose = (id: string) => {
    setOpen(false);
    btnRef.current?.focus();
    onAction?.(id);
  };

  return (
    <aside ref={rootRef} className={cx('ap-callout', `ap-callout--${tone}`, hasMenu && 'ap-callout--menu', open && 'is-open', className)} {...rest}>
      <div className="ap-callout__head">
        <span className="ap-callout__badge" aria-hidden="true">
          <Icon name={icon ?? d.icon} size={18} strokeWidth={2.5} />
        </span>
        <span className="ap-callout__title">{title}</span>
      </div>
      {hasMenu && (
        <button
          ref={btnRef}
          type="button"
          className="ap-callout__more"
          aria-label={typeof title === 'string' ? `Opções — ${title}` : 'Opções'}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="ap-callout__dot" />
          <span className="ap-callout__dot" />
          <span className="ap-callout__dot" />
        </button>
      )}
      {hasMenu && open && (
        <div ref={menuRef} id={menuId} className="ap-callout__menu" role="menu" aria-label={typeof title === 'string' ? title : undefined} onKeyDown={onMenuKey}>
          {actions.map((a) => (
            <button key={a.id} type="button" role="menuitem" tabIndex={-1} className="ap-callout__item body" onClick={() => choose(a.id)}>
              {a.icon && <Icon name={a.icon} size={18} strokeWidth={2.25} />}
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div className={cx('ap-callout__body', isQuote ? 'quote' : 'body')}>{children}</div>
    </aside>
  );
}

export interface ProseProps extends React.HTMLAttributes<HTMLDivElement> {
  /** lg = 17/28 (leitura, padrão); md = 15/24 (painéis estreitos). */
  size?: 'md' | 'lg';
}

/** Estilo de leitura para conteúdo gerado (markdown renderizado): parágrafos, títulos, listas, código, citações e tabelas. */
export function Prose({ size = 'lg', className, ...rest }: ProseProps) {
  return <div className={cx('ap-prose', size === 'lg' ? 'body-lg' : 'body', className)} {...rest} />;
}

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Ideograma do bloco-pôster. Padrão 学 (aprender). */
  glyph?: OrnamentGlyph;
  /** Cor do bloco do ideograma. Padrão brick. */
  tone?: Tone;
  title: React.ReactNode;
  /** Ação principal (normalmente um Button primary). */
  action?: React.ReactNode;
}

/** Tela vazia com um bloco-pôster de ideograma: diz o que falta e oferece a única ação que resolve. */
export function EmptyState({ glyph = '学', tone = 'brick', title, action, className, children, ...rest }: EmptyStateProps) {
  return (
    <section className={cx('ap-empty', className)} {...rest}>
      <div className={cx('ap-empty__art', `ap-card--${tone}`)}>
        <Ornament glyph={glyph} size="xl" />
      </div>
      <div className="ap-empty__text">
        <h3 className="ap-empty__title display-sm">{title}</h3>
        {children != null && <div className="ap-empty__desc body">{children}</div>}
        {action != null && <div className="ap-empty__action">{action}</div>}
      </div>
    </section>
  );
}
