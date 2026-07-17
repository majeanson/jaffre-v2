import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * The "Refined Arcade Violet" product-shell kit — the reusable primitives the
 * identity + social surfaces compose. Every piece wears the shell system: 2px
 * ink borders (3px on cards), zero-blur offset shadows (--shadow-ap-*),
 * Pixelify display + Rubik UI type, colors from the --color-ap-* namespace
 * (which flips light<->dark on the theme). Nothing here touches the felt table.
 */

/** The base arcade surface — 2px ink border, panel fill, hard shadow. Every
 * boxed section composes this instead of repeating the class soup. */
export interface PanelProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: 'div' | 'section' | 'form';
  readonly style?: CSSProperties;
}

export function Panel({ children, className = '', as: Tag = 'div', style }: PanelProps) {
  return (
    <Tag
      style={style}
      className={`rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap) ${className}`}
    >
      {children}
    </Tag>
  );
}

export interface CollapsibleProps {
  /** The always-visible trigger label. */
  readonly summary: ReactNode;
  /** The detail revealed on expand. */
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
}

/**
 * A click-to-expand disclosure in the shell language — keeps secondary detail
 * (profile paint, advanced options) out of the first screenful. The trigger is
 * an arcade control; the chevron rotates open. Reduced-motion safe (no anim).
 */
export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  className = '',
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`flex w-full flex-col gap-[0.6em] ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center justify-center gap-[0.5em] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[1em] py-[0.55em] font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
      >
        {summary}
        <span
          aria-hidden
          className={`text-(--color-ap-violet-soft) transition-transform duration-(--duration-flick) ${open ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
      </button>
      {open && <div className="flex flex-col items-center gap-[0.6em]">{children}</div>}
    </div>
  );
}

const AVATAR_SIZES = {
  sm: 'size-[2em] text-[1em]',
  md: 'size-[2.75em] text-[1.4em]',
  lg: 'size-[4em] text-[2em]',
} as const;

export interface AvatarChipProps {
  readonly name: string;
  /** The player's chosen colour (paint) — fills the chip. Defaults to violet. */
  readonly color?: string | undefined;
  readonly size?: keyof typeof AVATAR_SIZES;
}

/** Square rounded chip with the player's initial in the display face. */
export function AvatarChip({ name, color, size = 'md' }: AvatarChipProps) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) font-arcade-display leading-none text-(--color-ap-ink) shadow-(--shadow-ap-sm) ${AVATAR_SIZES[size]}`}
      style={{ background: color ?? 'var(--color-ap-violet)' }}
    >
      <span aria-hidden>{initial}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

export interface WordPlateProps {
  readonly children: ReactNode;
}

/** An ivory pill for a recovery word (LAMPE / TRICOT / HIBOU). */
export function WordPlate({ children }: WordPlateProps) {
  return (
    <span className="inline-block rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-card-face) px-[0.9em] py-[0.45em] font-arcade-display text-[1.05em] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap-sm)">
      {children}
    </span>
  );
}

export interface StatPanelProps {
  readonly value: ReactNode;
  readonly label: string;
  /** Highlight the number in gold (e.g. win rate) instead of the body text. */
  readonly tone?: 'default' | 'gold' | 'ok' | 'danger';
  readonly sub?: ReactNode;
}

const STAT_TONE: Record<NonNullable<StatPanelProps['tone']>, string> = {
  default: 'text-(--color-ap-text)',
  gold: 'text-(--color-ap-gold)',
  ok: 'text-(--color-ap-ok)',
  danger: 'text-(--color-ap-danger-text)',
};

/** A panel with a big display number and an uppercase muted label. */
export function StatPanel({ value, label, tone = 'default', sub }: StatPanelProps) {
  return (
    <div className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)">
      <div
        className={`font-arcade-display text-[2.2em] leading-none tabular-nums ${STAT_TONE[tone]}`}
      >
        {value}
      </div>
      <div className="mt-[0.5em] font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
        {label}
      </div>
      {sub !== undefined && (
        <div className="mt-[0.35em] font-arcade-ui text-[0.8em] text-(--color-ap-text)/80">
          {sub}
        </div>
      )}
    </div>
  );
}

export interface CtaProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary';
}

/**
 * The shell's call-to-action button: display caps, hard shadow that collapses
 * on press (the card physically pushes down into its shadow).
 */
export function Cta({ variant = 'primary', className = '', children, ...rest }: CtaProps) {
  const skin =
    variant === 'primary'
      ? 'bg-(--color-ap-violet) text-(--color-ap-ink)'
      : 'bg-(--color-ap-panel) text-(--color-ap-text)';
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-[0.5em] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-[1.1em] py-[0.7em] font-arcade-display text-[1.05em] uppercase tracking-wide shadow-(--shadow-ap) transition-[transform,box-shadow] duration-(--duration-flick) enabled:cursor-pointer enabled:hover:brightness-105 enabled:active:translate-x-[3px] enabled:active:translate-y-[3px] enabled:active:shadow-none disabled:opacity-55 ${skin} ${className}`}
    >
      {children}
    </button>
  );
}

export interface IconRailProps {
  /** The grouped controls; rendered with a 2px ink divider between each. */
  readonly children: ReactNode;
  /** Optional avatar chip shown below the group (per the handoff layout). */
  readonly footer?: ReactNode;
  readonly orientation?: 'vertical' | 'horizontal';
  readonly label?: string;
}

/**
 * One grouped panel of icon controls, separated by ink divider bars (not
 * physically detached buttons). Children each sit in a divider-bordered cell.
 */
export function IconRail({ children, footer, orientation = 'vertical', label }: IconRailProps) {
  const dir = orientation === 'vertical' ? 'flex-col divide-y-2' : 'flex-row divide-x-2';
  return (
    <div className="inline-flex flex-col items-center gap-[0.6em]">
      <div
        role={label !== undefined ? 'group' : undefined}
        aria-label={label}
        className={`inline-flex overflow-hidden rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap-sm) divide-(--color-ap-ink) ${dir}`}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

const PALETTE = [
  '#7a6ff0',
  '#f2b712',
  '#e05252',
  '#58b884',
  '#82c7dc',
  '#f2c66d',
  '#b07a2e',
  '#ebe6f5',
] as const;

export interface PlayerCardProps {
  readonly name: string;
  /** The base fill colour (also the initial brush colour). */
  readonly color?: string;
  /** When true, show the paint tools and let the player draw on the card. */
  readonly editable?: boolean;
  /** Fired (debounced to pointer-up) with the canvas as a data URL after edits. */
  readonly onPaint?: (dataUrl: string) => void;
  /** A previously-saved painting (data URL) to render into the canvas. */
  readonly paint?: string;
}

/**
 * The hero player card: ivory face, corner initials, centre avatar + name,
 * foil sweep + idle wobble, and — when editable — a paintable canvas layer
 * (brush = chosen colour, eraser via destination-out, clear).
 */
export function PlayerCard({ name, color, editable = false, onPaint, paint }: PlayerCardProps) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [brush, setBrush] = useState<string>(color ?? PALETTE[0]);
  const [erasing, setErasing] = useState(false);

  // Paint the saved image in once the canvas mounts (or when `paint` changes).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (paint === undefined || paint === '') return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = paint;
  }, [paint]);

  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current;
    if (canvas === null) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const stroke = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas === null || ctx === null || ctx === undefined) return;
    const [x, y] = pointAt(e);
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.fillStyle = brush;
    ctx.beginPath();
    ctx.arc(x, y, erasing ? 16 : 9, 0, Math.PI * 2);
    ctx.fill();
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!editable) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    stroke(e);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!editable || !drawing.current) return;
    stroke(e);
  };
  const onUp = (): void => {
    if (!editable || !drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas !== null && onPaint !== undefined) onPaint(canvas.toDataURL('image/png'));
  };

  const clear = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas === null || ctx === null || ctx === undefined) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (onPaint !== undefined) onPaint(canvas.toDataURL('image/png'));
  };

  return (
    <div className="flex flex-col items-center gap-[0.9em]">
      <div className="ap-foil ap-wobble relative aspect-[3/4] w-[13em] rounded-(--radius-ap-hero) border-[3px] border-(--color-ap-ink) bg-(--color-card-face) shadow-(--shadow-ap-hero)">
        {/* corner initials */}
        <span
          aria-hidden
          className="absolute left-[0.5em] top-[0.4em] font-arcade-display text-[1.3em] text-(--color-ap-ink)"
        >
          {initial}
        </span>
        <span
          aria-hidden
          className="absolute bottom-[0.4em] right-[0.5em] rotate-180 font-arcade-display text-[1.3em] text-(--color-ap-ink)"
        >
          {initial}
        </span>
        {/* centre block */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.6em] p-[1em]">
          <AvatarChip name={name} color={color} size="lg" />
          <span className="max-w-full truncate font-arcade-display text-[1.2em] uppercase text-(--color-ap-ink)">
            {name}
          </span>
        </div>
        {/* paint layer on top */}
        <canvas
          ref={canvasRef}
          width={260}
          height={347}
          aria-label={editable ? `Paint ${name}'s card` : undefined}
          className={`absolute inset-0 size-full rounded-[inherit] ${editable ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>

      {editable && (
        <div className="flex flex-wrap items-center justify-center gap-[0.5em]">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Brush colour ${c}`}
              aria-pressed={!erasing && brush === c}
              onClick={() => {
                setBrush(c);
                setErasing(false);
              }}
              style={{ background: c }}
              className={`size-[1.6em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) shadow-(--shadow-ap-sm) transition ${
                !erasing && brush === c ? 'ring-2 ring-(--color-ap-text) ring-offset-1' : ''
              }`}
            />
          ))}
          <Cta
            type="button"
            variant="secondary"
            aria-pressed={erasing}
            onClick={() => setErasing((v) => !v)}
            className={erasing ? 'ring-2 ring-(--color-ap-text)' : ''}
          >
            Erase
          </Cta>
          <Cta type="button" variant="secondary" onClick={clear}>
            Clear
          </Cta>
        </div>
      )}
    </div>
  );
}
