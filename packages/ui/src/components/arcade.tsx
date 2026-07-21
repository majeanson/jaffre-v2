import { type ButtonHTMLAttributes, type CSSProperties, type ReactNode, useState } from 'react';
import { useLang, type Lang } from '../i18n.js';

const T: Record<Lang, { yourName: string; player: string }> = {
  en: { yourName: 'Your name', player: 'Player' },
  fr: { yourName: 'Ton nom', player: 'Joueur' },
};

/**
 * The "Refined Arcade Violet" product-shell kit — the reusable primitives the
 * identity + social surfaces compose. Every piece wears the shell system: 2px
 * ink borders (3px on cards), zero-blur offset shadows (--shadow-ap-*),
 * Pixelify display + Rubik UI type, colors from the --color-ap-* namespace
 * (which flips light<->dark on the theme). Nothing here touches the felt table.
 */

/**
 * The shell's recurring visual concepts, agglomerated as a name → class
 * mapping. Components compose `${ARCADE.x} …layout…` instead of re-typing the
 * same border/shadow/radius run, so a chrome tweak lands everywhere at once.
 * Every value is the exact class run components already used — adopting an
 * entry is a pure refactor with zero visual change.
 */
export const ARCADE = {
  /** A standing surface: panel radius, ink border, panel fill, hard shadow. */
  panel:
    'rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap)',
  /** A floating surface (peeks, dropdowns): panel chrome, larger shadow. */
  popover:
    'rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap-lg)',
  /** Small badge/token chrome: inner radius + ink border (bring your own fill). */
  inner: 'rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink)',
  /** Square icon-button box (no cursor/fill — compose those per state). */
  iconBtnBase:
    'grid size-[clamp(2rem,4.8vmin,2.6rem)] shrink-0 place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) shadow-(--shadow-ap-sm) text-(length:--text-fluid-base) transition-colors',
  /** Neutral (idle) fill + hover for an icon button. */
  iconBtnNeutral: 'bg-(--color-ap-panel) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)',
  /** Labeled variant of iconBtnBase: same height/chrome, but grows to fit an
   * icon + text title. Stays ≥ square (min-w) so it reads as a sibling of the
   * icon-only buttons when the title collapses on narrow screens. */
  iconBtnLabeled:
    'inline-flex h-[clamp(2rem,4.8vmin,2.6rem)] min-w-[clamp(2rem,4.8vmin,2.6rem)] shrink-0 items-center justify-center gap-[0.35em] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-[0.5em] shadow-(--shadow-ap-sm) text-(length:--text-fluid-base) transition-colors',
  /** Borderless icon-button cell for controls grouped inside ONE shared bar —
   * same footprint as iconBtnBase, but the bar owns the border/shadow. */
  iconBtnCell:
    'grid size-[clamp(2rem,4.8vmin,2.6rem)] shrink-0 place-items-center rounded-(--radius-ap-inner) text-(length:--text-fluid-base) transition-colors',
  /** The black bar separating bunched controls (give it a height). */
  divider: 'w-[2px] shrink-0 rounded-full bg-(--color-ap-ink)',
  /** The tactile press: shadow collapses as the control shifts into it. */
  press:
    'transition-[transform,box-shadow] duration-(--duration-flick) active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
} as const;

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
    <Tag style={style} className={`${ARCADE.panel} ${className}`}>
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
  /** Controlled mode — the parent owns the state (its layout may depend on it). */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
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
  open: controlledOpen,
  onOpenChange,
  className = 'w-full',
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const toggle = () => {
    setUncontrolledOpen(!open);
    onOpenChange?.(!open);
  };
  return (
    <div className={`flex flex-col gap-[0.6em] ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
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
  /** Mark this chip as the actionable one (the seat you can take) — a violet
   * glow pulse in place of the flat shadow. */
  readonly highlight?: boolean;
}

/** Square rounded chip with the player's initial in the display face. */
export function AvatarChip({ name, color, size = 'md', highlight = false }: AvatarChipProps) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) font-arcade-display leading-none text-(--color-ap-ink) ${highlight ? 'ap-glow' : 'shadow-(--shadow-ap-sm)'} ${AVATAR_SIZES[size]}`}
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
    <span className="inline-block rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-paper) px-[0.9em] py-[0.45em] font-arcade-display text-[1.05em] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap-sm)">
      {children}
    </span>
  );
}

export interface StatPanelProps {
  readonly value: ReactNode;
  readonly label: string;
  /** Highlight the number in gold (e.g. win rate) instead of the body text. */
  readonly tone?: 'default' | 'gold' | 'ok' | 'danger' | 'violet';
  readonly sub?: ReactNode;
}

const STAT_TONE: Record<NonNullable<StatPanelProps['tone']>, string> = {
  default: 'text-(--color-ap-text)',
  gold: 'text-(--color-ap-gold)',
  ok: 'text-(--color-ap-ok)',
  danger: 'text-(--color-ap-danger-text)',
  violet: 'text-(--color-ap-violet-soft)',
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

const PXWAVE_COLORS = [
  'var(--color-ap-violet)',
  'var(--color-ap-gold)',
  'var(--color-ap-violet)',
  'var(--color-ap-ok)',
  'var(--color-ap-violet)',
  'var(--color-ap-gold)',
  'var(--color-ap-violet)',
] as const;

export interface PixelWaveProps {
  /** The status word under the blocks (e.g. "Dealing…"). */
  readonly label: string;
}

/**
 * The arcade loading indicator: a row of pixel blocks bobbing in a wave, with a
 * status word. Announced politely; the blocks are decorative and sit still
 * under reduced motion.
 */
export function PixelWave({ label }: PixelWaveProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-[0.9em] py-[0.6em]"
    >
      <div className="flex items-end gap-[0.4em]">
        {PXWAVE_COLORS.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="ap-pxwave size-[0.9em] border-2 border-(--color-ap-ink) shadow-(--shadow-ap-sm)"
            style={{ background: c, animationDelay: `${String(i * 0.1)}s` }}
          />
        ))}
      </div>
      <span className="font-arcade-display text-[1.05em] uppercase tracking-wide text-(--color-ap-muted)">
        {label}
      </span>
    </div>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  /** Accessible name (there's no visible label baked in). */
  readonly label?: string;
  readonly className?: string;
  readonly id?: string;
}

/**
 * The shell's dropdown — the one arcade-skinned `<select>` reused everywhere a
 * choice is picked (skin switcher, seat view, scene picker). 2px ink border,
 * panel fill, hard shadow, custom ▼ caret. `appearance-none` so the native
 * widget's system background can't leak (axe samples our token colours, not the
 * OS chrome).
 */
export function Select({ value, onChange, options, label, className = '', id }: SelectProps) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) py-[0.5em] pr-[2em] pl-[0.75em] font-arcade-ui text-[0.95em] text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover) focus:bg-(--color-ap-panel-hover)"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-[0.7em] text-[0.6em] text-(--color-ap-muted)"
      >
        ▼
      </span>
    </span>
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
        className={`inline-flex overflow-hidden rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap-sm) divide-(--color-ap-ink) [&_:focus-visible]:outline-offset-[-2px] ${dir}`}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

export interface PlayerCardProps {
  readonly name: string;
  /** The base fill colour behind the avatar (the profile colour). */
  readonly color?: string;
  /** The saved painting (data URL) to show in the avatar square. */
  readonly paint?: string;
  /** When provided, the centre name renders as an inline editable field so the
   *  player can rename right on the card (fires on each keystroke). */
  readonly onName?: (name: string) => void;
  /** Persist the edited name — called on blur. */
  readonly onNameCommit?: () => void;
}

/**
 * The hero player card: ivory face, corner initials, and a centre avatar square
 * showing the player's colour + saved pixel painting (editing happens in the
 * full-screen Paint Studio, reached from ProfileCard). Foil sweep + idle wobble.
 */
export function PlayerCard({ name, color, paint, onName, onNameCommit }: PlayerCardProps) {
  const t = T[useLang()];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const hasPaint = paint !== undefined && paint !== '';

  return (
    <div className="flex flex-col items-center gap-[0.9em]">
      <div className="ap-foil ap-wobble relative aspect-[3/4] w-[13em] rounded-(--radius-ap-hero) border-[3px] border-(--color-ap-ink) bg-(--color-ap-paper) shadow-(--shadow-ap-hero)">
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
          {/* The ONE identity surface: the avatar square — the very chip that
              later shows at your seat and on your own 0-cards, so what you paint
              is exactly what appears in play. Saved paint fills the square. */}
          <span
            aria-hidden
            className="relative grid size-[4em] place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) font-arcade-display text-[2em] leading-none text-(--color-ap-ink) shadow-(--shadow-ap-sm)"
            style={{ background: color ?? 'var(--color-ap-violet)' }}
          >
            {!hasPaint && <span>{initial}</span>}
            {hasPaint && (
              <img
                src={paint}
                alt=""
                className="absolute inset-0 size-full rounded-[inherit] object-cover"
              />
            )}
          </span>
          {onName !== undefined ? (
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              onBlur={onNameCommit}
              maxLength={20}
              aria-label={t.yourName}
              placeholder={t.player}
              className="w-full min-w-0 bg-transparent text-center font-arcade-display text-[1.2em] uppercase text-(--color-ap-ink) outline-none placeholder:text-(--color-ap-ink)/40 focus:underline"
            />
          ) : (
            <span className="max-w-full truncate font-arcade-display text-[1.2em] uppercase text-(--color-ap-ink)">
              {name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
