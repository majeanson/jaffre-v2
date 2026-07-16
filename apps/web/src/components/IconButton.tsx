import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — also the hover tooltip (icon buttons carry no text). */
  readonly label: string;
  /** Lit state (toggles like coach/log/sound) — golden tint when on. */
  readonly active?: boolean;
  /** Danger styling (Leave). */
  readonly danger?: boolean;
  readonly children: ReactNode;
}

/** Base chrome for a small square icon button — shared with icon-styled triggers. */
export const ICON_BTN_BASE =
  'grid size-[clamp(2rem,4.8vmin,2.6rem)] shrink-0 cursor-pointer place-items-center rounded-lg border text-(length:--text-fluid-base) transition-colors';

/** The neutral (idle) icon-button look, as a plain class string. */
export const ICON_BTN_NEUTRAL = `${ICON_BTN_BASE} border-white/15 text-(--color-ivory)/75 hover:bg-white/8`;

/**
 * The one small square icon button used across the table chrome — hover-bar
 * style like other apps: no text, an icon, tooltip + aria-label for meaning.
 * Fluid-sized so it scales with the cards.
 */
export function IconButton({
  label,
  active = false,
  danger = false,
  children,
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${ICON_BTN_BASE} ${
        danger
          ? 'border-(--color-danger)/45 text-(--color-danger-text) hover:bg-(--color-danger)/12'
          : active
            ? 'border-(--color-lamplight)/50 bg-(--color-lamplight)/12 text-(--color-lamplight)'
            : 'border-white/15 text-(--color-ivory)/75 hover:bg-white/8'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
