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

/** Base chrome for a small square icon button — shared with icon-styled triggers.
 * Arcade shell: 2px ink border, hard shadow. */
export const ICON_BTN_BASE =
  'grid size-[clamp(2rem,4.8vmin,2.6rem)] shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) shadow-(--shadow-ap-sm) text-(length:--text-fluid-base) transition-colors';

/** The neutral (idle) icon-button look, as a plain class string. */
export const ICON_BTN_NEUTRAL = `${ICON_BTN_BASE} bg-(--color-ap-panel) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)`;

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
          ? 'border-(--color-ap-danger) bg-(--color-ap-panel) text-(--color-ap-danger-text) hover:bg-(--color-ap-panel-hover)'
          : active
            ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
            : 'bg-(--color-ap-panel) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
